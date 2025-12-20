import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'

import { setCurrentChatId } from '../project-files'
import { createStreamController } from './stream-state'
import { useChatStore } from '../state/chat-store'
import { getCodebuffClient } from '../utils/codebuff-client'
import { AGENT_MODE_TO_ID } from '../utils/constants'
import { createEventHandlerState } from '../utils/create-event-handler-state'
import { createRunConfig } from '../utils/create-run-config'
import { loadAgentDefinitions } from '../utils/local-agent-registry'
import { logger } from '../utils/logger'
import {
  loadMostRecentChatState,
  saveChatState,
} from '../utils/run-state-storage'
import {
  autoCollapsePreviousMessages,
  createAiMessageShell,
  createErrorMessage as createErrorChatMessage,
  generateAiMessageId,
} from '../utils/send-message-helpers'
import { createSendMessageTimerController } from '../utils/send-message-timer'
import {
  handleRunCompletion,
  handleRunError,
  prepareUserMessage as prepareUserMessageHelper,
  setupStreamingContext,
} from './helpers/send-message'
import { NETWORK_ERROR_ID } from '../utils/validation-error-helpers'

import type { ElapsedTimeTracker } from './use-elapsed-time'
import type { StreamStatus } from './use-message-queue'
import type { PendingImage } from '../state/chat-store'
import type { ChatMessage } from '../types/chat'
import type { SendMessageFn } from '../types/contracts/send-message'
import type { AgentMode } from '../utils/constants'
import type { SendMessageTimerEvent } from '../utils/send-message-timer'
import type { AgentDefinition, MessageContent, RunState } from '@codebuff/sdk'

// Main chat send hook: orchestrates prep, streaming, and completion.
const yieldToEventLoop = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

const IDLE_WATCHDOG_MS = 120000
const IDLE_WATCHDOG_POLL_MS = 1000
const MAX_IDLE_RETRIES = 1

interface UseSendMessageOptions {
  inputRef: React.MutableRefObject<any>
  activeSubagentsRef: React.MutableRefObject<Set<string>>
  isChainInProgressRef: React.MutableRefObject<boolean>
  setStreamStatus: (status: StreamStatus) => void
  setCanProcessQueue: (can: boolean) => void
  abortControllerRef: React.MutableRefObject<AbortController | null>
  agentId?: string
  onBeforeMessageSend: () => Promise<{
    success: boolean
    errors: Array<{ id: string; message: string }>
  }>
  mainAgentTimer: ElapsedTimeTracker
  scrollToLatest: () => void
  onTimerEvent?: (event: SendMessageTimerEvent) => void
  isQueuePausedRef?: React.MutableRefObject<boolean>
  resumeQueue?: () => void
  continueChat: boolean
  continueChatId?: string
}

// Choose the agent definition by explicit selection or mode-based fallback.
const resolveAgent = (
  agentMode: AgentMode,
  agentId: string | undefined,
  agentDefinitions: AgentDefinition[],
): AgentDefinition | string => {
  const selectedAgentDefinition =
    agentId && agentDefinitions.length > 0
      ? agentDefinitions.find((definition) => definition.id === agentId)
      : undefined

  return selectedAgentDefinition ?? agentId ?? AGENT_MODE_TO_ID[agentMode]
}

// Respect bash context, but avoid sending empty prompts when only images are attached.
const buildPromptWithContext = (
  promptWithBashContext: string,
  messageContent: MessageContent[] | undefined,
) => {
  const trimmedPrompt = promptWithBashContext.trim()
  if (trimmedPrompt.length > 0) {
    return promptWithBashContext
  }

  if (messageContent && messageContent.length > 0) {
    return 'See attached image(s)'
  }

  return ''
}

export const useSendMessage = ({
  inputRef,
  activeSubagentsRef,
  isChainInProgressRef,
  setStreamStatus,
  setCanProcessQueue,
  abortControllerRef,
  agentId,
  onBeforeMessageSend,
  mainAgentTimer,
  scrollToLatest,
  onTimerEvent = () => {},
  isQueuePausedRef,
  resumeQueue,
  continueChat,
  continueChatId,
}: UseSendMessageOptions): {
  sendMessage: SendMessageFn
  clearMessages: () => void
} => {
  const queryClient = useQueryClient()
  // Pull setters directly from store - these are stable references that don't need
  // to trigger re-renders, so using getState() outside of callbacks is intentional.
  const {
    setMessages,
    setFocusedAgentId,
    setInputFocused,
    setStreamingAgents,
    setActiveSubagents,
    setIsChainInProgress,
    setHasReceivedPlanResponse,
    setLastMessageMode,
    addSessionCredits,
    setRunState,
    setIsRetrying,
  } = useChatStore.getState()
  const previousRunStateRef = useRef<RunState | null>(null)
  // Memoize stream controller to maintain referential stability across renders
  const streamRefsRef = useRef<ReturnType<
    typeof createStreamController
  > | null>(null)
  if (!streamRefsRef.current) {
    streamRefsRef.current = createStreamController()
  }
  const streamRefs = streamRefsRef.current

  useEffect(() => {
    if (continueChat && !previousRunStateRef.current) {
      const loadedState = loadMostRecentChatState(continueChatId ?? undefined)
      if (loadedState) {
        previousRunStateRef.current = loadedState.runState
        setRunState(loadedState.runState)
        setMessages(loadedState.messages)
        if (loadedState.chatId) {
          setCurrentChatId(loadedState.chatId)
        }
      }
    }
  }, [continueChat, continueChatId, setMessages, setRunState])

  const updateChainInProgress = useCallback(
    (value: boolean) => {
      isChainInProgressRef.current = value
      setIsChainInProgress(value)
    },
    [setIsChainInProgress, isChainInProgressRef],
  )

  const updateActiveSubagents = useCallback(
    (mutate: (next: Set<string>) => void) => {
      setActiveSubagents((prev) => {
        const next = new Set(prev)
        mutate(next)
        activeSubagentsRef.current = next
        return next
      })
    },
    [setActiveSubagents, activeSubagentsRef],
  )

  const addActiveSubagent = useCallback(
    (subagentId: string) => {
      updateActiveSubagents((next) => next.add(subagentId))
    },
    [updateActiveSubagents],
  )

  const removeActiveSubagent = useCallback(
    (subagentId: string) => {
      updateActiveSubagents((next) => next.delete(subagentId))
    },
    [updateActiveSubagents],
  )

  function clearMessages() {
    previousRunStateRef.current = null
  }

  const prepareUserMessage = useCallback(
    (params: {
      content: string
      agentMode: AgentMode
      postUserMessage?: (prev: ChatMessage[]) => ChatMessage[]
      attachedImages?: PendingImage[]
    }) => {
      // Access lastMessageMode fresh each call to get current value
      const { lastMessageMode } = useChatStore.getState()
      return prepareUserMessageHelper({
        ...params,
        deps: {
          setMessages,
          lastMessageMode,
          setLastMessageMode,
          scrollToLatest,
          setHasReceivedPlanResponse,
        },
      })
    },
    // Note: lastMessageMode is accessed via getState() inside the callback,
    // so it always gets the fresh value - no need to include in deps
    [
      setMessages,
      setLastMessageMode,
      scrollToLatest,
      setHasReceivedPlanResponse,
    ],
  )

  const sendMessage = useCallback<SendMessageFn>(
    async ({
      content,
      agentMode,
      agentIdOverride,
      postUserMessage,
      images: attachedImages,
      onComplete,
    }) => {
      if (agentMode !== 'PLAN') {
        setHasReceivedPlanResponse(false)
      }

      const effectiveAgentId = agentIdOverride ?? agentId
      let completionReported = false
      const reportOutcome = (outcome: {
        status: 'success' | 'failed' | 'cancelled'
        runState?: RunState
        errorMessage?: string
      }) => {
        if (completionReported) return
        completionReported = true
        onComplete?.(outcome)
      }

      // Initialize timer for elapsed time tracking
      const timerController = createSendMessageTimerController({
        mainAgentTimer,
        onTimerEvent,
        agentId: effectiveAgentId,
      })
      setIsRetrying(false)

      // Prepare user message (bash context, images, mode divider)
      const { userMessageId, messageContent, bashContextForPrompt } =
        await prepareUserMessage({
          content,
          agentMode,
          postUserMessage,
          attachedImages,
        })

      // Validate before sending (e.g., agent config checks)
      try {
        const validationResult = await onBeforeMessageSend()

        if (!validationResult.success) {
          const errorsToAttach =
            validationResult.errors.length === 0
              ? [
                  {
                    id: NETWORK_ERROR_ID,
                    message:
                      'Agent validation failed. This may be due to a network issue or temporary server problem. Please try again.',
                  },
                ]
              : validationResult.errors

          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.id !== userMessageId) {
                return msg
              }
              return {
                ...msg,
                validationErrors: errorsToAttach,
              }
            }),
          )
          reportOutcome({ status: 'failed' })
          return
        }
      } catch (error) {
        logger.error(
          { error },
          'Validation before message send failed with exception',
        )

        setMessages((prev) => [
          ...prev,
          createErrorChatMessage(
            '⚠️ Agent validation failed unexpectedly. Please try again.',
          ),
        ])
        await yieldToEventLoop()
        setTimeout(() => scrollToLatest(), 0)

        reportOutcome({
          status: 'failed',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        return
      }

      // Reset UI focus state
      setFocusedAgentId(null)
      setInputFocused(true)
      inputRef.current?.focus()

      // Get SDK client
      const client = await getCodebuffClient()

      if (!client) {
        logger.error(
          {},
          'No Codebuff client available. Please ensure you are authenticated.',
        )
        reportOutcome({
          status: 'failed',
          errorMessage: 'No Codebuff client available',
        })
        return
      }

      // Create AI message shell and setup streaming context
      const aiMessageId = generateAiMessageId()
      const aiMessage = createAiMessageShell(aiMessageId)

      setMessages((prev) => autoCollapsePreviousMessages(prev, aiMessageId))
      setMessages((prev) => [...prev, aiMessage])
      let actualCredits: number | undefined
      let finalRunState: RunState | undefined
      let finalStatus: 'success' | 'failed' | 'cancelled' | undefined
      let finalErrorMessage: string | undefined
      let idleRetryCount = 0

      const agentDefinitions = loadAgentDefinitions()
      const resolvedAgent = resolveAgent(
        agentMode,
        effectiveAgentId,
        agentDefinitions,
      )

      const promptWithBashContext = bashContextForPrompt
        ? bashContextForPrompt + content
        : content
      const effectivePrompt = buildPromptWithContext(
        promptWithBashContext,
        messageContent,
      )

      while (true) {
        actualCredits = undefined
        const { updater, hasReceivedContentRef, abortController } =
          setupStreamingContext({
            aiMessageId,
            timerController,
            setMessages,
            streamRefs,
            abortControllerRef,
            setStreamStatus,
            setCanProcessQueue,
            isQueuePausedRef,
            updateChainInProgress,
            setIsRetrying,
          })
        setStreamStatus('waiting')
        setCanProcessQueue(false)
        updateChainInProgress(true)
        setIsRetrying(idleRetryCount > 0)

        const watchdogId = setInterval(() => {
          const lastEventAt = streamRefs.state.lastEventAt
          if (!lastEventAt) return
          if (streamRefs.state.wasAbortedByUser) return
          if (streamRefs.state.wasAbortedByWatchdog) return
          const idleMs = Date.now() - lastEventAt
          if (idleMs < IDLE_WATCHDOG_MS) return

          logger.warn(
            {
              idleMs,
              aiMessageId,
              retryCount: idleRetryCount,
            },
            'Run idle watchdog triggered; aborting to retry',
          )
          streamRefs.setters.setWasAbortedByWatchdog(true)
          abortController.abort()
        }, IDLE_WATCHDOG_POLL_MS)

        try {
          const eventHandlerState = createEventHandlerState({
            streamRefs,
            setStreamingAgents,
            setStreamStatus,
            aiMessageId,
            updater,
            hasReceivedContentRef,
            addActiveSubagent,
            removeActiveSubagent,
            agentMode,
            setHasReceivedPlanResponse,
            logger,
            setIsRetrying,
            onTotalCost: (cost: number) => {
              actualCredits = cost
              addSessionCredits(cost)
            },
          })

          const runConfig = createRunConfig({
            logger,
            agent: resolvedAgent,
            prompt: effectivePrompt,
            content: messageContent,
            previousRunState: previousRunStateRef.current,
            abortController,
            agentDefinitions,
            eventHandlerState,
            setIsRetrying,
            setStreamStatus,
          })

          const runState = await client.run(runConfig)

          previousRunStateRef.current = runState
          setRunState(runState)
          setIsRetrying(false)
          finalRunState = runState

          setMessages((currentMessages) => {
            saveChatState(runState, currentMessages)
            return currentMessages
          })
          const output = runState.output
          const isRunError = output?.type === 'error'

          handleRunCompletion({
            runState,
            actualCredits,
            agentMode,
            timerController,
            updater,
            aiMessageId,
            streamRefs,
            setStreamStatus,
            setCanProcessQueue,
            updateChainInProgress,
            setHasReceivedPlanResponse,
            resumeQueue,
            queryClient,
          })

          if (isRunError) {
            finalStatus = 'failed'
            finalErrorMessage =
              typeof output?.message === 'string' ? output.message : undefined
          } else {
            finalStatus = 'success'
          }
          break
        } catch (error) {
          const wasWatchdogAbort = streamRefs.state.wasAbortedByWatchdog
          if (wasWatchdogAbort && idleRetryCount < MAX_IDLE_RETRIES) {
            idleRetryCount += 1
            setIsRetrying(true)
            continue
          }

          if (streamRefs.state.wasAbortedByUser) {
            finalStatus = 'cancelled'
          } else {
            finalStatus = 'failed'
            finalErrorMessage =
              error instanceof Error ? error.message : String(error)
          }

          handleRunError({
            error,
            aiMessageId,
            timerController,
            updater,
            setIsRetrying,
            setStreamStatus,
            setCanProcessQueue,
            updateChainInProgress,
            queryClient,
          })
          break
        } finally {
          clearInterval(watchdogId)
          updater.dispose()
        }
      }

      if (finalStatus) {
        reportOutcome({
          status: finalStatus,
          runState: finalRunState,
          errorMessage: finalErrorMessage,
        })
      }
    },
    [
      addActiveSubagent,
      addSessionCredits,
      agentId,
      inputRef,
      isQueuePausedRef,
      mainAgentTimer,
      onBeforeMessageSend,
      onTimerEvent,
      prepareUserMessage,
      queryClient,
      removeActiveSubagent,
      resumeQueue,
      scrollToLatest,
      setCanProcessQueue,
      setFocusedAgentId,
      setHasReceivedPlanResponse,
      setInputFocused,
      setIsRetrying,
      setMessages,
      setRunState,
      setStreamStatus,
      setStreamingAgents,
      streamRefs,
      updateChainInProgress,
    ],
  )

  return {
    sendMessage,
    clearMessages,
  }
}
