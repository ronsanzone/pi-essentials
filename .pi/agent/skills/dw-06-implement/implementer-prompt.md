# Implementer Subagent Prompt Template

Use this template when the Phase 6 parent/harness dispatches a Pi `implementer` subagent. The parent owns orchestration, progress tracking, and review loops. The implementer does one task and reports back.

```text
Agent: implementer
Context: fresh
Model: default coding model unless overridden

Task: Implement <Task ID>: <Task name>

You are implementing one task from a deep-work plan.

## Task

<Paste the full task text from 05-plan.md. Do not ask the subagent to read the whole plan.>

## Relevant Context

- Topic: <topic>
- Repo: <repo>
- Working directory: <repo path>
- Phase: <phase name>
- Dependencies already completed: <task IDs / commits>
- Requirements covered: <R IDs>
- Decisions implemented: <DQ/EDQ IDs>
- Scope guards: <what not to change>

## Expected Files

<Paste exact file list from task.>

## Validation

<Paste exact commands and expected results.>

## Commit Policy

<Commit or do not commit. If committing, include suggested message/files.>

## Before You Begin

If anything is ambiguous, blocked, contradictory, or likely to require a plan deviation, stop and ask. Do not make product or architecture decisions silently.

## Your Job

1. Inspect only the code needed for this task.
2. Implement exactly the requested behavior, no scope creep.
3. Add/update tests as specified.
4. Run the specified validation.
5. Self-review for completeness, quality, and scope discipline.
6. Report back.

## Self-Review Checklist

- Did I implement every requirement in the task?
- Did I avoid extra behavior not requested?
- Did I follow cited codebase patterns?
- Are tests behavior-focused and meaningful?
- Did validation pass?
- Did I introduce any deviation from the plan?

## Report Format

- Status: COMPLETE | BLOCKED | NEEDS-CLARIFICATION
- Summary of changes:
- Files changed:
- Tests/validation run and results:
- Commit SHA, if any:
- Self-review notes:
- Deviations from plan, if any:
- Questions/blockers, if any:
```
