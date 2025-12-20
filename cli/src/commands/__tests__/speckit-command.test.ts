import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createSpeckitCommandHandler } from '../speckit-handler'
import { SPECKIT_USAGE } from '../../utils/speckit/constants'

import type { ChatMessage } from '../../types/chat'
import type { RouterParams } from '../command-registry'
import type { SpeckitArtifactsSummary } from '../../utils/speckit/speckit-artifacts'
import type { SpeckitResourceSyncResult } from '../../utils/speckit/ensure-speckit-resources'

const createMockParams = (
  overrides: Partial<RouterParams> = {},
): RouterParams =>
  ({
    abortControllerRef: { current: null },
    agentMode: 'DEFAULT',
    inputRef: { current: null },
    inputValue: '/speckit',
    isChainInProgressRef: { current: false },
    isStreaming: false,
    logoutMutation: {} as RouterParams['logoutMutation'],
    streamMessageIdRef: { current: null },
    addToQueue: () => {},
    clearMessages: () => {},
    saveToHistory: () => {},
    scrollToLatest: () => {},
    sendMessage: async () => {},
    setCanProcessQueue: () => {},
    setInputFocused: () => {},
    setInputValue: () => {},
    setIsAuthenticated: () => {},
    setMessages: () => {},
    setUser: () => {},
    stopStreaming: () => {},
    ...overrides,
  }) as RouterParams

const baseArtifacts: SpeckitArtifactsSummary = {
  projectRoot: '/repo',
  featureDir: '/repo/specs/001-test',
  artifacts: [],
}

const buildMessage = (content: string): ChatMessage =>
  ({ content } as ChatMessage)

describe('createSpeckitCommandHandler', () => {
  it('shows usage when args are missing', async () => {
    let messages: ChatMessage[] = []
    let sendCalls = 0

    const params = createMockParams({
      sendMessage: async () => {
        sendCalls += 1
      },
      setMessages: (value) => {
        messages = typeof value === 'function' ? value(messages) : value
      },
    })

    const handler = createSpeckitCommandHandler({
      ensureSpeckitResources: () => ({
        ok: true,
        updated: [],
        skipped: [],
        errors: [],
      }),
      getSpeckitArtifactsSummary: () => baseArtifacts,
      buildSpeckitSummary: () => 'summary',
      getProjectRoot: () => '/repo',
      getUserMessage: buildMessage,
      getSystemMessage: buildMessage,
    })

    await handler(params, '')

    assert.ok(
      messages[messages.length - 1]?.content?.includes(
        `Usage: ${SPECKIT_USAGE}`,
      ),
    )
    assert.equal(sendCalls, 0)
  })

  it('treats cancel-prefixed descriptions as feature input', async () => {
    let messages: ChatMessage[] = []
    let sendCalls = 0

    const params = createMockParams({
      inputValue: '/speckit cancel feature setup',
      sendMessage: async () => {
        sendCalls += 1
      },
      setMessages: (value) => {
        messages = typeof value === 'function' ? value(messages) : value
      },
    })

    const handler = createSpeckitCommandHandler({
      ensureSpeckitResources: () => ({
        ok: true,
        updated: [],
        skipped: [],
        errors: [],
      }),
      getSpeckitArtifactsSummary: () => baseArtifacts,
      buildSpeckitSummary: () => 'summary',
      getProjectRoot: () => '/repo',
      getUserMessage: buildMessage,
      getSystemMessage: buildMessage,
    })

    await handler(params, 'cancel feature setup')

    assert.equal(sendCalls, 1)
    const lastMessage = messages[messages.length - 1]?.content ?? ''
    assert.equal(lastMessage.includes('Confirm cancellation'), false)
  })

  it('blocks execution when resource sync fails', async () => {
    let messages: ChatMessage[] = []
    let sendCalls = 0

    const params = createMockParams({
      inputValue: '/speckit build a thing',
      sendMessage: async () => {
        sendCalls += 1
      },
      setMessages: (value) => {
        messages = typeof value === 'function' ? value(messages) : value
      },
    })

    const handler = createSpeckitCommandHandler({
      ensureSpeckitResources: () =>
        ({
          ok: false,
          updated: [],
          skipped: [],
          errors: ['missing commands'],
        }) satisfies SpeckitResourceSyncResult,
      getSpeckitArtifactsSummary: () => baseArtifacts,
      buildSpeckitSummary: () => 'summary',
      getProjectRoot: () => '/repo',
      getUserMessage: buildMessage,
      getSystemMessage: buildMessage,
    })

    await handler(params, 'build a thing')

    assert.ok(
      messages[messages.length - 1]?.content?.includes(
        'Speckit resource sync failed',
      ),
    )
    assert.equal(sendCalls, 0)
  })
})
