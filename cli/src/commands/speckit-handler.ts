import { SPECKIT_AUTOPILOT_AGENT_ID, SPECKIT_COMMAND_NAME, SPECKIT_USAGE } from '../utils/speckit/constants'

import type { ChatMessage } from '../types/chat'
import type { SpeckitArtifactsSummary } from '../utils/speckit/speckit-artifacts'
import type { SpeckitResourceSyncResult } from '../utils/speckit/ensure-speckit-resources'
import type { SpeckitSummaryStatus } from '../utils/speckit/speckit-summary'
import type { CommandHandler, RouterParams } from './command-registry'

export type SpeckitCommandDeps = {
  ensureSpeckitResources: (projectRoot: string) => SpeckitResourceSyncResult
  getSpeckitArtifactsSummary: (projectRoot: string) => SpeckitArtifactsSummary
  buildSpeckitSummary: (params: {
    status: SpeckitSummaryStatus
    artifacts: SpeckitArtifactsSummary
  }) => string
  getProjectRoot: () => string
  getUserMessage: (content: string) => ChatMessage
  getSystemMessage: (content: string) => ChatMessage
  speckitAutopilotAgentId?: string
}

const clearInput = (params: RouterParams) => {
  params.setInputValue({ text: '', cursorPosition: 0, lastEditDueToNav: false })
}

const normalizeArgs = (args: string) => args.trim()

const getCancelTokens = (args: string) =>
  args.toLowerCase().split(/\s+/).filter(Boolean)

const getCancelState = (args: string) => {
  const tokens = getCancelTokens(args)
  if (tokens[0] !== 'cancel') {
    return { isCancel: false, confirmed: false }
  }

  if (tokens.length === 1) {
    return { isCancel: true, confirmed: false }
  }

  if (tokens.length === 2) {
    const confirmed = tokens[1] === 'confirm' || tokens[1] === '--confirm'
    return { isCancel: confirmed, confirmed }
  }

  return { isCancel: false, confirmed: false }
}

/**
 * Create a Speckit command handler with injected dependencies.
 *
 * @param deps - Implementation dependencies for resource sync and summary building.
 * @returns Command handler for /speckit.
 */
export const createSpeckitCommandHandler = (
  deps: SpeckitCommandDeps,
): CommandHandler => {
  let speckitRunActive = false
  const autopilotAgentId =
    deps.speckitAutopilotAgentId ?? SPECKIT_AUTOPILOT_AGENT_ID

  return async (params, args) => {
    const trimmedArgs = normalizeArgs(args)
    const inputValue = params.inputValue.trim()

    if (!trimmedArgs) {
      params.setMessages((prev) => [
        ...prev,
        deps.getUserMessage(inputValue),
        deps.getSystemMessage(`Usage: ${SPECKIT_USAGE}`),
      ])
      params.saveToHistory(inputValue)
      clearInput(params)
      return
    }

    const cancelState = getCancelState(trimmedArgs)

    if (cancelState.isCancel) {
      if (!speckitRunActive) {
        params.setMessages((prev) => [
          ...prev,
          deps.getUserMessage(inputValue),
          deps.getSystemMessage(
            `No active /${SPECKIT_COMMAND_NAME} run to cancel.`,
          ),
        ])
        params.saveToHistory(inputValue)
        clearInput(params)
        return
      }

      if (!cancelState.confirmed) {
        params.setMessages((prev) => [
          ...prev,
          deps.getUserMessage(inputValue),
          deps.getSystemMessage(
            `Confirm cancellation by running /${SPECKIT_COMMAND_NAME} cancel confirm.`,
          ),
        ])
        params.saveToHistory(inputValue)
        clearInput(params)
        return
      }

      const abortController = params.abortControllerRef.current
      if (!abortController) {
        params.setMessages((prev) => [
          ...prev,
          deps.getUserMessage(inputValue),
          deps.getSystemMessage(
            'Unable to cancel yet. No active Speckit stream was found.',
          ),
        ])
        params.saveToHistory(inputValue)
        clearInput(params)
        return
      }

      abortController.abort()
      speckitRunActive = false
      params.saveToHistory(inputValue)
      clearInput(params)
      params.setMessages((prev) => [
        ...prev,
        deps.getUserMessage(inputValue),
        deps.getSystemMessage(
          'Cancellation requested. Summary will be shown when the run ends.',
        ),
      ])
      return
    }

    if (
      params.isStreaming ||
      params.streamMessageIdRef.current ||
      params.isChainInProgressRef.current
    ) {
      params.setMessages((prev) => [
        ...prev,
        deps.getUserMessage(inputValue),
        deps.getSystemMessage(
          'Another run is in progress. Please wait before starting Speckit.',
        ),
      ])
      params.saveToHistory(inputValue)
      clearInput(params)
      return
    }

    const projectRoot = deps.getProjectRoot()
    const resourceSync = deps.ensureSpeckitResources(projectRoot)
    if (!resourceSync.ok) {
      const details = resourceSync.errors.join('\n')
      params.setMessages((prev) => [
        ...prev,
        deps.getUserMessage(inputValue),
        deps.getSystemMessage(`Speckit resource sync failed:\n${details}`),
      ])
      params.saveToHistory(inputValue)
      clearInput(params)
      return
    }

    params.saveToHistory(inputValue)
    clearInput(params)

    speckitRunActive = true
    let status: SpeckitSummaryStatus = 'failed'

    try {
      await params.sendMessage({
        content: trimmedArgs,
        agentMode: params.agentMode,
        agentIdOverride: autopilotAgentId,
        onComplete: (outcome) => {
          status = outcome.status
        },
      })
    } finally {
      speckitRunActive = false
    }

    const artifacts = deps.getSpeckitArtifactsSummary(projectRoot)
    const summary = deps.buildSpeckitSummary({ status, artifacts })
    params.setMessages((prev) => [
      ...prev,
      deps.getSystemMessage(summary),
    ])
  }
}
