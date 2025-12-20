import { getProjectRoot } from '../project-files'
import { getSystemMessage, getUserMessage } from '../utils/message-history'
import { buildSpeckitSummary } from '../utils/speckit/speckit-summary'
import { getSpeckitArtifactsSummary } from '../utils/speckit/speckit-artifacts'
import { ensureSpeckitResources } from '../utils/speckit/ensure-speckit-resources'
import { SPECKIT_AUTOPILOT_AGENT_ID } from '../utils/speckit/constants'
import { createSpeckitCommandHandler } from './speckit-handler'

export const handleSpeckitCommand = createSpeckitCommandHandler({
  ensureSpeckitResources,
  getSpeckitArtifactsSummary,
  buildSpeckitSummary,
  getProjectRoot,
  getUserMessage,
  getSystemMessage,
  speckitAutopilotAgentId: SPECKIT_AUTOPILOT_AGENT_ID,
})
