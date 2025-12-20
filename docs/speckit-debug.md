# Speckit Debug Notes

## Summary
The `/speckit` workflow intermittently hangs after the user submits answers to `ask_user` questions. The UI becomes unresponsive and the terminal must be killed. The hang occurs after `ask_user` returns an answer; the Speckit command runner does not continue to the next step.

Key symptoms:
- `ask_user` receives a valid answer (e.g., `selectedOption: "Book a demo (sales-led)"`).
- The Speckit runner ends one step and starts another, then stalls.
- No further tool calls appear after the `ask_user` result.

## Root Cause

`AskUserBridge` only tracked a single pending request. If multiple `ask_user` calls were issued before the first was resolved, the earlier promise was overwritten and never resolved, leaving the runner waiting indefinitely.

## Fix

Queue `ask_user` requests in `AskUserBridge` and resolve them in order so no request is dropped.

## Where Debug Logs Are Stored

CLI runtime logs (JSON lines):
- `/Users/besi/Code/temp/debug/cli.jsonl` (when running from `/Users/besi/Code/temp`)
- `/Users/besi/Code/codebuff-local/debug/cli.jsonl` (when running from `/Users/besi/Code/codebuff-local`)

Per-run state and chat logs (JSON):
- `~/.config/manicode-dev/projects/<project>/chats/<timestamp>/run-state.json`
- `~/.config/manicode-dev/projects/<project>/chats/<timestamp>/chat-messages.json`

Examples:
- `~/.config/manicode-dev/projects/temp/chats/2025-12-20T07-53-05.900Z/run-state.json`
- `~/.config/manicode-dev/projects/temp/chats/2025-12-20T07-53-05.900Z/chat-messages.json`

## Quick Commands to Locate Latest Run

Find latest run-state.json and show project root + output:
```
python3 - <<'PY'
import json
from pathlib import Path
base = Path('/Users/besi/.config/manicode-dev/projects')
latest = None
latest_path = None
for path in base.rglob('run-state.json'):
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        continue
    if latest is None or mtime > latest:
        latest = mtime
        latest_path = path
if not latest_path:
    print('NO_RUN_STATE')
    raise SystemExit
print('LATEST', latest_path)
data = json.loads(latest_path.read_text())
print('PROJECT_ROOT', data.get('sessionState', {}).get('fileContext', {}).get('projectRoot'))
print('OUTPUT', data.get('output'))
PY
```

Locate the last `ask_user` tool result in the CLI log:
```
python3 - <<'PY'
import json
from pathlib import Path
log = Path('/Users/besi/Code/temp/debug/cli.jsonl')
entries = []
for line in log.read_text().splitlines():
    try:
        entries.append(json.loads(line))
    except json.JSONDecodeError:
        continue
ask_idx = None
for i,e in enumerate(entries):
    data = e.get('data', {})
    tr = data.get('toolResult') if isinstance(data, dict) else None
    if isinstance(tr, dict) and tr.get('toolName') == 'ask_user':
        ask_idx = i
if ask_idx is None:
    print('NO_ASK_USER')
    raise SystemExit
print('LAST_ASK_IDX', ask_idx)
print('LAST_ASK_TIME', entries[ask_idx].get('timestamp'))
print('LAST_ASK_SELECTED', entries[ask_idx]['data']['toolResult']['content'][0]['value'].get('answers'))
PY
```

## Repro Steps

1. Launch CLI from the repo root (example uses `/Users/besi/Code/temp`):
   ```
   cd /Users/besi/Code/temp
   codebuff
   ```
2. Reset chat:
   ```
   /new
   ```
3. Run Speckit:
   ```
   /speckit create a html page for saas ai company
   ```
4. When prompted by `ask_user`, select an option and submit.
5. CLI hangs after submit; no further progress.

## Context

- The Speckit chain uses `speckit-autopilot` to spawn `speckit-command-runner` for each step.
- The Clarify step is expected to use `ask_user` only.
- Logs confirm `ask_user` returns valid answers, but the runner does not continue.

## Files of Interest

- `commands/2-speckit.specify.md`
- `commands/3-speckit.clarify.md`
- `.agents/speckit-autopilot.ts`
- `.agents/speckit-command-runner.ts`
- `cli/src/hooks/use-send-message.ts`
- `cli/src/utils/codebuff-client.ts`
- `common/src/utils/ask-user-bridge.ts`
- `cli/src/hooks/use-ask-user-bridge.ts`

