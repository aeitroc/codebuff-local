import type { AskUserQuestion } from '../tools/params/tool/ask-user'

export type AskUserRequest = {
  toolCallId: string
  questions: AskUserQuestion[]
  resolve: (response: any) => void
}

type Listener = (request: AskUserRequest | null) => void

let pendingRequest: AskUserRequest | null = null
const requestQueue: AskUserRequest[] = []
const listeners: Listener[] = []

export const AskUserBridge = {
  request: (toolCallId: string, questions: AskUserQuestion[]) => {
    return new Promise((resolve) => {
      const request = { toolCallId, questions, resolve }
      if (pendingRequest) {
        requestQueue.push(request)
        return
      }
      pendingRequest = request
      notifyListeners()
    })
  },

  submit: (response: any) => {
    if (!pendingRequest) {
      return
    }

    pendingRequest.resolve(response)
    pendingRequest = requestQueue.shift() ?? null
    notifyListeners()
  },

  getPendingRequest: () => pendingRequest,

  subscribe: (listener: Listener) => {
    listeners.push(listener)
    listener(pendingRequest)
    return () => {
      const idx = listeners.indexOf(listener)
      if (idx !== -1) listeners.splice(idx, 1)
    }
  },
}

function notifyListeners() {
  listeners.forEach((l) => l(pendingRequest))
}
