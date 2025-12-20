---

description: "Task list for Speckit CLI command implementation"
---

# Tasks: Speckit CLI Command

**Input**: Design documents from `/Users/besi/Code/codebuff-local/specs/001-implement-speckit-plan/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: Required for new business logic; test tasks included below.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- All tasks include exact file paths

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and shared structure for speckit utilities

- [X] T001 Create speckit utilities barrel in `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**Checkpoint**: Foundation ready - user story implementation can begin

- [X] T002 Extend send-message contract for per-message agent overrides in `/Users/besi/Code/codebuff-local/cli/src/types/contracts/send-message.ts`
- [X] T003 Update per-message agent override handling in `/Users/besi/Code/codebuff-local/cli/src/hooks/use-send-message.ts` (depends on T002)
- [X] T004 [P] Add Speckit command constants in `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/constants.ts` and export via `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/index.ts` (depends on T001)

---

## Phase 3: User Story 1 - Run Speckit Workflow (Priority: P1)

**Goal**: Provide a single `/speckit` command that runs the full workflow, persists artifacts, and shows a CLI summary.

**Independent Test**: Run `/speckit` with a clear feature description and confirm artifacts are saved and a CLI summary is displayed.

### Tests for User Story 1

- [X] T005 [P] [US1] Add speckit command tests in `/Users/besi/Code/codebuff-local/cli/src/commands/__tests__/speckit-command.test.ts`
- [X] T006 [P] [US1] Update command registry expectations in `/Users/besi/Code/codebuff-local/cli/src/commands/__tests__/command-args.test.ts`
- [X] T007 [P] [US1] Add summary formatter tests in `/Users/besi/Code/codebuff-local/cli/src/utils/__tests__/speckit-summary.test.ts`
- [X] T008 [P] [US1] Add artifact helper tests in `/Users/besi/Code/codebuff-local/cli/src/utils/__tests__/speckit-artifacts.test.ts`

### Implementation for User Story 1

- [X] T009 [P] [US1] Add CLI summary formatter in `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/speckit-summary.ts` and export via `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/index.ts` (depends on T001, T007)
- [X] T010 [P] [US1] Add artifact persistence helper in `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/speckit-artifacts.ts` (depends on T008)
- [X] T011 [US1] Implement `/speckit` command handler in `/Users/besi/Code/codebuff-local/cli/src/commands/speckit.ts` and integrate summary/artifacts (depends on T003, T004, T009, T010)
- [X] T012 [P] [US1] Register `/speckit` aliases in `/Users/besi/Code/codebuff-local/cli/src/commands/command-registry.ts` and `/Users/besi/Code/codebuff-local/cli/src/data/slash-commands.ts` (depends on T011)
- [X] T013 [P] [US1] Update router parsing expectations in `/Users/besi/Code/codebuff-local/cli/src/commands/__tests__/router-input.test.ts`

**Checkpoint**: User Story 1 is independently functional and produces artifacts + summary.

---

## Phase 4: User Story 2 - Clarify Ambiguities (Priority: P2)

**Goal**: Ensure the workflow pauses for clarification questions and resumes with user answers.

**Independent Test**: Run `/speckit` with ambiguous input and confirm the CLI asks questions and proceeds after answers.

### Implementation for User Story 2

- [X] T014 [P] [US2] Add interactive agent definition in `/Users/besi/Code/codebuff-local/.agents/speckit-autopilot.ts`
- [X] T015 [P] [US2] Add interactive runner definition in `/Users/besi/Code/codebuff-local/.agents/speckit-command-runner.ts`
- [X] T016 [US2] Regenerate bundled agents in `/Users/besi/Code/codebuff-local/cli/src/agents/bundled-agents.generated.ts` via `/Users/besi/Code/codebuff-local/cli/scripts/prebuild-agents.ts` (depends on T014, T015)

**Checkpoint**: User Story 2 works independently with interactive clarifications.

---

## Phase 5: User Story 3 - No Manual Setup Required (Priority: P3)

**Goal**: Ensure required workflow resources are available without manual setup.

**Independent Test**: Remove canonical resources and verify `/speckit` recreates them and proceeds.

### Tests for User Story 3

- [X] T017 [P] [US3] Add resource sync tests in `/Users/besi/Code/codebuff-local/cli/src/utils/__tests__/ensure-speckit-resources.test.ts`

### Implementation for User Story 3

- [X] T018 [US3] Implement resource sync in `/Users/besi/Code/codebuff-local/cli/src/utils/speckit/ensure-speckit-resources.ts` (depends on T017)
- [X] T019 [US3] Invoke resource sync preflight in `/Users/besi/Code/codebuff-local/cli/src/commands/speckit.ts` (depends on T018, T011)

**Checkpoint**: User Story 3 works independently with no manual setup required.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T020 [P] Add cancellation confirmation flow and preserve partial outputs in `/Users/besi/Code/codebuff-local/cli/src/commands/speckit.ts` (depends on T011, T010)
- [X] T021 [P] Confirm parallel command routing in `/Users/besi/Code/codebuff-local/cli/src/hooks/use-send-message.ts` and `/Users/besi/Code/codebuff-local/cli/src/commands/router.ts` (depends on T003)
- [X] T022 [P] Update CLI usage/help text in `/Users/besi/Code/codebuff-local/cli/src/commands/usage.ts` to include `/speckit`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phases 3-5)**: Depend on Foundational phase completion
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Foundational; independent of other stories
- **User Story 2 (P2)**: Starts after Foundational; independent of other stories
- **User Story 3 (P3)**: Starts after Foundational; independent of other stories

### Within Each User Story

- Tests before implementation
- Shared utilities before command wiring
- Command handler before registry wiring
- Resource sync before preflight invocation

### Parallel Opportunities

- T004, T005, T006, T007, T008, T009, T010, T012, T013, T014, T015, T017, T020, T021, T022 can run in parallel
- User stories can proceed in parallel after Phase 2 if staffed

---

## Parallel Example: User Story 1

```text
Parallel tasks for US1 tests:
- T005 Add speckit command tests in /Users/besi/Code/codebuff-local/cli/src/commands/__tests__/speckit-command.test.ts
- T006 Update command registry expectations in /Users/besi/Code/codebuff-local/cli/src/commands/__tests__/command-args.test.ts
- T007 Add summary formatter tests in /Users/besi/Code/codebuff-local/cli/src/utils/__tests__/speckit-summary.test.ts
- T008 Add artifact helper tests in /Users/besi/Code/codebuff-local/cli/src/utils/__tests__/speckit-artifacts.test.ts
```

---

## Parallel Example: User Story 2

```text
Parallel tasks for US2:
- T014 Add /Users/besi/Code/codebuff-local/.agents/speckit-autopilot.ts
- T015 Add /Users/besi/Code/codebuff-local/.agents/speckit-command-runner.ts
```

---

## Parallel Example: User Story 3

```text
Parallel tasks for US3:
- T017 Add /Users/besi/Code/codebuff-local/cli/src/utils/__tests__/ensure-speckit-resources.test.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Validate `/speckit` runs end-to-end with artifact persistence + summary

### Incremental Delivery

1. Setup + Foundational -> Foundation ready
2. Add User Story 1 -> Validate independently
3. Add User Story 2 -> Validate interactive clarifications
4. Add User Story 3 -> Validate resource bootstrap
5. Finish Polish tasks

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently completable and testable
