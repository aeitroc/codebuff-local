import { publisher } from './constants'
import type { AgentDefinition, AgentStepContext } from './types/agent-definition'

const speckitCommandRunner: AgentDefinition = {
  id: 'speckit-command-runner',
  publisher,
  model: 'openai/gpt-5.1',
  displayName: 'Speckit Command Runner',
  spawnerPrompt:
    'Executes a single Speckit command defined in a markdown file with interactive clarification.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'Command arguments (equivalent of $ARGUMENTS).',
    },
    params: {
      type: 'object',
      properties: {
        commandPath: {
          type: 'string',
          description:
            'Path (relative to repo root) of the Speckit command markdown file to execute.',
        },
      },
      required: ['commandPath'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: [
    'read_files',
    'read_subtree',
    'spawn_agents',
    'run_terminal_command',
    'write_file',
    'str_replace',
    'propose_write_file',
    'propose_str_replace',
    'write_todos',
    'ask_user',
    'set_output',
  ],
  spawnableAgents: [
    'file-picker',
    'code-searcher',
    'directory-lister',
    'glob-matcher',
    'researcher-web',
    'researcher-docs',
    'commander',
    'editor',
    'editor-multi-prompt',
    'code-reviewer',
    'validator',
    'context-pruner',
  ],
  systemPrompt:
    'You are an interactive workflow runner for Speckit command files. Follow the command file instructions exactly. Use ask_user for any user input; never ask for responses in plain text because chained runs cannot accept normal replies.',
  instructionsPrompt:
    'Read the command markdown file at the start. The user prompt provides $ARGUMENTS. Execute each step in order, running commands and updating files as instructed. If the command requires user input, pause and ask via ask_user, then continue.',
  handleSteps: function* ({ params }: AgentStepContext) {
    const commandPath = (params ?? {}).commandPath as string | undefined
    if (!commandPath) {
      yield {
        toolName: 'set_output',
        input: { ok: false, error: 'Missing commandPath parameter.' },
      }
      return
    }

    const readResult = yield {
      toolName: 'read_files',
      input: { paths: [commandPath] },
    }

    const getJson = (toolResult: unknown) => {
      if (!Array.isArray(toolResult)) return undefined
      for (const item of toolResult) {
        if (!item || typeof item !== 'object') continue
        const candidate = item as { type?: string; value?: unknown }
        if (candidate.type === 'json') return candidate.value
      }
      return undefined
    }

    const isFileReadError = (content: string) => content.startsWith('[FILE_')
    const filesJson = getJson(readResult.toolResult)
    const matchingEntry = (Array.isArray(filesJson) ? filesJson : []).find(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        (entry as { path?: string }).path === commandPath,
    ) as { content?: string } | undefined
    const fileContent =
      matchingEntry && typeof matchingEntry.content === 'string'
        ? matchingEntry.content
        : null

    if (!fileContent || isFileReadError(fileContent)) {
      yield {
        toolName: 'set_output',
        input: {
          ok: false,
          error: `Command file missing or unreadable: ${commandPath}`,
        },
      }
      return
    }

    const runTerminal = (command: string) => ({
      toolName: 'run_terminal_command' as const,
      input: { command, timeout_seconds: 60 },
    })

    const getExitCode = (toolResult: unknown) => {
      const value = getJson(toolResult)
      if (!value || typeof value !== 'object') return null
      const exitCode = (value as { exitCode?: number }).exitCode
      return typeof exitCode === 'number' ? exitCode : null
    }

    const getStdErr = (toolResult: unknown) => {
      const value = getJson(toolResult)
      if (!value || typeof value !== 'object') return ''
      const stderr = (value as { stderr?: string }).stderr
      return typeof stderr === 'string' ? stderr.trim() : ''
    }

    const prerequisiteCommand = (() => {
      if (commandPath.includes('3-speckit.clarify.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json --paths-only'
      }
      if (commandPath.includes('4-speckit.plan.md')) {
        return '.specify/scripts/bash/setup-plan.sh --json'
      }
      if (commandPath.includes('6-speckit.tasks.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json'
      }
      if (commandPath.includes('8-speckit.implement.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks'
      }
      if (commandPath.includes('9-speckit.review.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json --paths-only'
      }
      return null
    })()

    if (prerequisiteCommand) {
      const prereqResult = yield runTerminal(prerequisiteCommand)
      const exitCode = getExitCode(prereqResult.toolResult)
      if (exitCode !== 0) {
        const stderr = getStdErr(prereqResult.toolResult)
        yield {
          toolName: 'set_output',
          input: {
            ok: false,
            error:
              `Prerequisite script failed for ${commandPath} (exitCode ${exitCode ?? 'unknown'}).` +
              (stderr ? `\n\n${stderr}` : ''),
          },
        }
        return
      }
    }

    yield 'STEP_ALL'

    const validationCommand = (() => {
      if (commandPath.includes('2-speckit.specify.md')) {
        return (
          `BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')" && ` +
          `test -n "$BRANCH" && echo "$BRANCH" | grep -Eq '^[0-9]{3}-[a-z0-9][a-z0-9-]*$' && ` +
          `test -f "specs/$BRANCH/spec.md"`
        )
      }
      if (commandPath.includes('3-speckit.clarify.md')) {
        return (
          `BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')" && ` +
          `test -n "$BRANCH" && test -f "specs/$BRANCH/spec.md"`
        )
      }
      if (commandPath.includes('4-speckit.plan.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json >/dev/null'
      }
      if (commandPath.includes('6-speckit.tasks.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks >/dev/null'
      }
      if (commandPath.includes('8-speckit.implement.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks >/dev/null'
      }
      if (commandPath.includes('9-speckit.review.md')) {
        return '.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks >/dev/null'
      }
      return null
    })()

    if (validationCommand) {
      const validationResult = yield runTerminal(validationCommand)
      const exitCode = getExitCode(validationResult.toolResult)
      if (exitCode !== 0) {
        yield {
          toolName: 'set_output',
          input: {
            ok: false,
            error: `Validation failed for ${commandPath} (exitCode ${exitCode ?? 'unknown'}).`,
          },
        }
        return
      }
    }

    yield {
      toolName: 'set_output',
      input: { ok: true, commandPath },
    }
  },
}

export default speckitCommandRunner
