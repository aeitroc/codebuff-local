# Quickstart: Speckit CLI Command

**Date**: 2025-12-19  
**Spec**: /Users/besi/Code/codebuff-local/specs/001-implement-speckit-plan/spec.md

## Goal

Run the full Speckit workflow from a single CLI command and receive persisted artifacts plus a CLI summary.

## Steps

1. Open the Codebuff CLI.
2. Run the command with a feature description:

   `/speckit <feature description>`

3. If clarification questions appear, answer them to continue.
4. Review the CLI summary and the generated artifact files.

## Expected Outputs

- A CLI summary indicating the session status and artifact locations.
- Workflow artifacts saved to the standard project files (specification, clarification results, plan, tasks, implementation guidance, review summary).

## Troubleshooting

- If the description is missing, the CLI should show a usage prompt and stop.
- If you cancel a run, the CLI should confirm and preserve any outputs produced so far.
