import { publisher } from './constants'
import type { AgentDefinition, AgentStepContext } from './types/agent-definition'

const speckitAutopilot: AgentDefinition = {
  id: 'speckit-autopilot',
  publisher,
  model: 'openai/gpt-5-mini',
  displayName: 'Speckit Autopilot',
  spawnerPrompt:
    'Runs the full Speckit pipeline (specify -> clarify -> plan -> tasks -> implement -> review) in one run.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Feature request / task description. Used as $ARGUMENTS for the Speckit pipeline.',
    },
    params: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: true,
  toolNames: ['spawn_agents', 'run_terminal_command', 'set_output', 'ask_user'],
  spawnableAgents: ['speckit-command-runner'],
  systemPrompt:
    'You are Speckit Autopilot. Execute the Speckit workflow in order by spawning the Speckit Command Runner for each step. Allow interactive clarification when requested by command files.',
  handleSteps: function* ({ prompt }: AgentStepContext) {
    const isSafeFeatureBranchName = (branchName: string) =>
      /^[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(branchName)
    const featureDescription = (prompt ?? '').trim()
    const emit = (text: string) => ({ type: 'STEP_TEXT' as const, text })

    const getJson = (toolResult: unknown) => {
      if (!Array.isArray(toolResult)) return undefined
      for (const item of toolResult) {
        if (!item || typeof item !== 'object') continue
        const candidate = item as { type?: string; value?: unknown }
        if (candidate.type === 'json') return candidate.value
      }
      return undefined
    }

    const getSpawnReports = (toolResult: unknown) => {
      const value = getJson(toolResult)
      return Array.isArray(value) ? value : []
    }

    const getExitCode = (toolResult: unknown) => {
      const value = getJson(toolResult)
      if (!value || typeof value !== 'object') return null
      const exitCode = (value as { exitCode?: number }).exitCode
      return typeof exitCode === 'number' ? exitCode : null
    }

    const getStdout = (toolResult: unknown) => {
      const value = getJson(toolResult)
      if (!value || typeof value !== 'object') return ''
      const stdout = (value as { stdout?: string }).stdout
      return typeof stdout === 'string' ? stdout.trim() : ''
    }

    const findSpawnError = (reports: unknown[]) => {
      for (const report of reports) {
        if (!report || typeof report !== 'object') continue
        const value = (report as { value?: unknown }).value
        if (!value || typeof value !== 'object') continue
        const outputType = (value as { type?: string }).type
        if (outputType === 'error') {
          const message = (value as { message?: string }).message
          return typeof message === 'string' && message.trim()
            ? message
            : 'Subagent returned an error.'
        }
        if (outputType === 'structuredOutput') {
          const outputValue = (value as { value?: unknown }).value
          if (outputValue && typeof outputValue === 'object') {
            const ok = (outputValue as { ok?: boolean }).ok
            if (ok === false) {
              const error = (outputValue as { error?: string }).error
              return typeof error === 'string' && error.trim()
                ? error
                : 'Subagent returned ok=false.'
            }
          }
        }
        const maybeErrorMessage = (value as { errorMessage?: string }).errorMessage
        if (typeof maybeErrorMessage === 'string' && maybeErrorMessage.trim()) {
          return maybeErrorMessage
        }
        const maybeError = (value as { error?: string }).error
        if (typeof maybeError === 'string' && maybeError.trim()) {
          return maybeError
        }
      }
      return null
    }

    if (!featureDescription) {
      yield emit('ERROR: No feature description provided.\n')
      yield { toolName: 'set_output', input: { ok: false } }
      return
    }

    yield emit('Speckit autopilot started.\n')

    let shouldRunSpecify = true
    const gitProbe = yield {
      toolName: 'run_terminal_command',
      input: {
        command: 'git rev-parse --abbrev-ref HEAD',
        timeout_seconds: 15,
      },
    }
    const gitJson = getJson(gitProbe.toolResult)
    const gitStdout =
      gitJson &&
      typeof gitJson === 'object' &&
      typeof (gitJson as { stdout?: string }).stdout === 'string'
        ? (gitJson as { stdout?: string }).stdout?.trim() ?? ''
        : ''

    if (isSafeFeatureBranchName(gitStdout)) {
      const specProbe = yield {
        toolName: 'run_terminal_command',
        input: {
          command:
            `SPEC_FILE="specs/${gitStdout}/spec.md" && ` +
            `if [ ! -f "$SPEC_FILE" ]; then echo "missing"; ` +
            `elif [ -f ".specify/templates/spec-template.md" ] && ` +
            `cmp -s ".specify/templates/spec-template.md" "$SPEC_FILE"; ` +
            `then echo "template"; else echo "ready"; fi`,
          timeout_seconds: 30,
        },
      }
      const specStatus = getStdout(specProbe.toolResult)
      shouldRunSpecify = specStatus !== 'ready'
      if (shouldRunSpecify) {
        yield emit(
          `Detected feature branch (${gitStdout}) with ${specStatus || 'incomplete'} spec; running Specify.\n`,
        )
      } else {
        yield emit(`Detected feature branch (${gitStdout}); skipping Specify step.\n`)
      }
    }

    const steps: Array<{ label: string; commandPath: string }> = []
    if (shouldRunSpecify) {
      steps.push({ label: 'Specify', commandPath: 'commands/2-speckit.specify.md' })
    }
    steps.push(
      { label: 'Clarify', commandPath: 'commands/3-speckit.clarify.md' },
      { label: 'Plan', commandPath: 'commands/4-speckit.plan.md' },
      { label: 'Tasks', commandPath: 'commands/6-speckit.tasks.md' },
      { label: 'Implement', commandPath: 'commands/8-speckit.implement.md' },
      { label: 'Review', commandPath: 'commands/9-speckit.review.md' },
    )

    for (const step of steps) {
      yield emit(`\n=== ${step.label} ===\n`)
      const spawnResult = yield {
        toolName: 'spawn_agents',
        input: {
          agents: [
            {
              agent_type: 'speckit-command-runner',
              prompt: featureDescription,
              params: { commandPath: step.commandPath },
            },
          ],
        },
      }

      const reports = getSpawnReports(spawnResult.toolResult)
      const error = findSpawnError(reports)
      if (error) {
        yield emit(`\nERROR: Step failed (${step.label}).\n${error}\n`)
        yield {
          toolName: 'set_output',
          input: { ok: false, failedStep: step.label },
        }
        return
      }
    }

    yield emit('\nSpeckit autopilot completed.\n')
    yield { toolName: 'set_output', input: { ok: true } }
  },
}

export default speckitAutopilot
