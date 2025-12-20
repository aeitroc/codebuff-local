import { describe, expect, test } from 'bun:test'

import { AskUserBridge } from '../utils/ask-user-bridge'
import type { AskUserQuestion } from '../tools/params/tool/ask-user'

const baseQuestion: AskUserQuestion = {
  question: 'Pick one',
  options: [{ label: 'A' }, { label: 'B' }],
  multiSelect: false,
}

describe('AskUserBridge', () => {
  test('resolves a single request', async () => {
    const response = { answers: [{ questionIndex: 0, selectedOption: 'A' }] }
    const promise = AskUserBridge.request('tool-1', [baseQuestion])

    AskUserBridge.submit(response)

    await expect(promise).resolves.toEqual(response)
    expect(AskUserBridge.getPendingRequest()).toBeNull()
  })

  test('queues multiple requests and resolves in order', async () => {
    const firstResponse = {
      answers: [{ questionIndex: 0, selectedOption: 'A' }],
    }
    const secondResponse = { skipped: true }

    const firstPromise = AskUserBridge.request('tool-1', [baseQuestion])
    const secondPromise = AskUserBridge.request('tool-2', [baseQuestion])

    expect(AskUserBridge.getPendingRequest()?.toolCallId).toBe('tool-1')

    AskUserBridge.submit(firstResponse)
    await expect(firstPromise).resolves.toEqual(firstResponse)

    expect(AskUserBridge.getPendingRequest()?.toolCallId).toBe('tool-2')

    AskUserBridge.submit(secondResponse)
    await expect(secondPromise).resolves.toEqual(secondResponse)

    expect(AskUserBridge.getPendingRequest()).toBeNull()
  })
})
