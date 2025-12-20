---
description: Review the completed implementation against spec, plan, and tasks to identify gaps, errors, or missed work.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

Goal: After `/8-speckit.implement` completes, validate that what was **asked for** matches what was **implemented**, and surface any missed tasks, requirement gaps, or code issues.

Execution steps:

1. **Setup paths**: Run `.specify/scripts/bash/check-prerequisites.sh --json --paths-only` from repo root **once**. Parse the JSON payload fields:
   - `REPO_ROOT`
   - `BRANCH`
   - `FEATURE_DIR`
   - `FEATURE_SPEC`
   - `IMPL_PLAN`
   - `TASKS`
   - Optional: `RESEARCH`, `DATA_MODEL`, `QUICKSTART`, `CONTRACTS_DIR`
   All paths must be absolute.

2. **Load review context**:
   - **REQUIRED**: Read `FEATURE_SPEC` (`spec.md`) for requirements and acceptance criteria.
   - **REQUIRED**: Read `IMPL_PLAN` (`plan.md`) for architecture, stack, constraints, and file structure.
   - **REQUIRED**: Read `TASKS` (`tasks.md`) for task IDs, dependencies, file references, and checkbox status.
   - **IF EXISTS**: Read `RESEARCH`, `DATA_MODEL`, `CONTRACTS_DIR`, and `QUICKSTART` to understand decisions and required tests.

3. **Summarize what was asked for**:
   - Extract functional and non‑functional requirements from `spec.md`.
   - Extract acceptance criteria and any explicit “must/should” constraints.
   - Extract the ordered task list from `tasks.md` with current `[ ]` / `[X]` state.
   - Produce a concise list of expected deliverables.

4. **Collect what was implemented**:
   - Check if the repo is a git repository by running:
     ```sh
     git rev-parse --git-dir 2>/dev/null
     ```
   - **If git repo**:
     - Capture working tree status: `git status --porcelain`.
     - Capture change summary: `git diff --stat`.
     - Capture full changes: `git diff`.
     - If commits exist, capture recent history: `git log --oneline --decorate -n 20`.
     - Identify files added/modified/deleted.
   - **If not a git repo**:
     - State that automated diffs are unavailable; proceed with context‑based review only.

5. **Map changes to tasks**:
   - For each task in `tasks.md`, look for direct evidence in diffs or new files (tests, docs, wiring, config).
   - Classify each task as:
     - **Implemented** (clear evidence)
     - **Partially Implemented** (some evidence, missing sub‑requirements)
     - **Not Implemented** (no evidence)
   - Call out any task marked `[X]` without evidence, and any unchecked task with evidence.

6. **Gap & error analysis**:
   - Compare requirements vs implementation; list any missing or under‑implemented requirement.
   - Scan diffs for obvious issues:
     - type/compile errors, broken imports, incorrect APIs
     - deviations from `plan.md` architecture/constraints
     - missing wiring or integration steps referenced in tasks
     - unfinished TODOs that affect acceptance criteria
   - If tests/linters are present (infer from `plan.md` and repo files such as `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, etc.), run the most relevant commands and include results:
     - Node/TS: `npm test` / `pnpm test` / `yarn test`, plus `npm run lint` and `npm run typecheck` if defined.
     - Go: `go test ./...` (and `golangci-lint run` if configured).
     - Python: `pytest` and configured linters/typecheckers (e.g., `ruff`, `mypy`).
     - Rust: `cargo test` and `cargo clippy` if configured.
   - Report failures with exact file paths and concise error summaries. Do not fix issues in this step unless the user asks.

7. **Write the review report**:
   - **Section A — Requirements & tasks recap**: what was asked, including acceptance criteria.
   - **Section B — Change summary**: files touched + high‑level diff summary.
   - **Section C — Task‑by‑task status table** with the classifications from step 5.
   - **Section D — Issues found**: missed tasks/requirements, bugs, failing tests, deviations.
   - **Section E — Recommended next actions**: concrete fixes with task IDs + file paths.

8. **Final verdict**:
   - **PASS**: All requirements and tasks are implemented, no serious issues, tests pass (if present).
   - **NEEDS FIXES**: Any gaps, bugs, or failing tests remain.

