# Speckit Command Implementation Plan

## Objective

Introduce a native `/speckit` slash command in the CLI that executes the full Speckit pipeline (specify → clarify → plan → tasks → implement → review) using the existing `/commands` chain. The command must be interactive when clarification is required and must use the canonical command resource paths expected by the Speckit runner.

## Constraints

- Keep existing UI/command surfaces intact.
- Use the `/commands` chain as the source of truth for feature execution logic.
- Avoid temporary shims or workarounds; implement durable wiring.
- CLI is Bun + React/OpenTUI; TypeScript strict, no `any`.
- Use `@/` path alias where applicable (workspace conventions).

## Current Gaps (Observed)

1. No CLI command currently invokes the Speckit pipeline.
2. Speckit runner expects `commands/*.md` and `.specify/*` at repo root.
   - Current resources live under `commands/commands/*.md` and `commands/.specify/*`.
3. The bundled Speckit runner is non-interactive and lacks `ask_user` tool support,
   which conflicts with `/3-speckit.clarify` requirements.

## Proposed Solution

### A) Add a native `/speckit` slash command

Add a new command handler that routes the user’s feature description to the
`speckit-autopilot` agent. This command should:

- Require arguments; if empty, show a helpful system message.
- Call `sendMessage` with a per-request agent override (autopilot agent ID).
- Run a preflight resource sync to ensure `commands/*.md` and `.specify/*` are in
  the canonical locations expected by the runner.

### B) Provide Speckit resource bootstrap

Implement `ensureSpeckitResources` to:

- Check for `commands/2-speckit.specify.md` (canonical path).
- If missing, copy from `commands/commands/*.md`.
- Check for `.specify/` at repo root.
- If missing, copy from `commands/.specify/`.

This keeps the CLI experience consistent while preserving repo layout.

### C) Make the Speckit pipeline interactive

Create `.agents` definitions for:

- `speckit-autopilot`
- `speckit-command-runner`

Include the `ask_user` tool and remove the “non-interactive” constraint so the
clarify step can genuinely ask questions. Then regenerate the bundled agents
file via `cli/scripts/prebuild-agents.ts`.

## Files / Modules to Touch

1. `cli/src/commands/command-registry.ts`
   - Add `/speckit` (aliases `/implement`, `/feature`)
   - Route to agent override

2. `cli/src/types/contracts/send-message.ts`
   - Extend `SendMessageFn` params to accept optional `agentIdOverride` or
     `agentDefinitionOverride`

3. `cli/src/hooks/use-send-message.ts`
   - Respect per-message agent override instead of global `agentMode`
   - Preserve existing behavior when no override provided

4. `cli/src/utils/speckit/ensure-speckit-resources.ts` (new)
   - Sync/copy command and .specify resources to canonical paths

5. `cli/src/hooks/use-send-message.ts` (pre-send hook)
   - Call `ensureSpeckitResources` when routing to Speckit

6. `.agents/speckit-autopilot.ts` (new)
   - Interactive, uses `ask_user`

7. `.agents/speckit-command-runner.ts` (new)
   - Interactive, uses `ask_user`, no non-interactive limitation

8. `cli/src/agents/bundled-agents.generated.ts`
   - Regenerate via prebuild script

9. Tests
   - `cli/src/commands/__tests__/command-args.test.ts`
   - `cli/src/commands/__tests__/router-input.test.ts`
   - `cli/src/utils/__tests__/ensure-speckit-resources.test.ts` (new)

## Execution Steps (High Level)

1. Implement `ensureSpeckitResources` and unit tests.
2. Add `agentIdOverride` support to send-message contract + hook.
3. Add `/speckit` command and alias wiring.
4. Add Speckit agent definitions under `.agents/`.
5. Regenerate bundled agents file.
6. Update/extend CLI command routing tests.

## Verification

- Run `bun --cwd cli test` (covers command routing + new utility test).
- Manual smoke: `/speckit <feature>` should spawn pipeline and pause for clarify
  questions when needed.

## Risks & Mitigations

- **Resource path mismatch**: mitigated by explicit preflight copy.
- **Non-interactive runner**: mitigated by interactive agent definition and
  bundling update.
- **Unexpected routing**: `/speckit` explicit command avoids heuristic
  ambiguity.

## Open Questions

- Should we also add a `mode:speckit` for parity with other modes? (Not required
  for initial implementation.)

