import type { PendingImage } from '../../state/chat-store'
import type { AgentMode } from '../../utils/constants'
import type { ChatMessage } from '../chat'
import type { RunState } from '@codebuff/sdk'

export type PostUserMessageFn = (prev: ChatMessage[]) => ChatMessage[]

export type SendMessageOutcome = {
  status: 'success' | 'failed' | 'cancelled'
  runState?: RunState
  errorMessage?: string
}

export type SendMessageFn = (params: {
  content: string
  agentMode: AgentMode
  agentIdOverride?: string
  postUserMessage?: PostUserMessageFn
  images?: PendingImage[]
  onComplete?: (outcome: SendMessageOutcome) => void
}) => Promise<void>
