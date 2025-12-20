export const SPECKIT_AUTOPILOT_AGENT_ID = 'speckit-autopilot'
export const SPECKIT_COMMAND_RUNNER_AGENT_ID = 'speckit-command-runner'

export const SPECKIT_COMMAND_NAME = 'speckit'
export const SPECKIT_COMMAND_ALIASES = ['implement', 'feature']
export const SPECKIT_USAGE = '/speckit <feature description>'

export const SPECKIT_COMMANDS_DIR = 'commands'
export const SPECKIT_COMMANDS_SOURCE_DIRS = [
  'commands',
  'commands/commands',
]

export const SPECKIT_COMMAND_FILES = [
  '2-speckit.specify.md',
  '3-speckit.clarify.md',
  '4-speckit.plan.md',
  '6-speckit.tasks.md',
  '8-speckit.implement.md',
  '9-speckit.review.md',
] as const
