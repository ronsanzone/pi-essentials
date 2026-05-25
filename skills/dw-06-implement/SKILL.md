---
name: dw-06-implement
description: "Use when deep-work Phase 5 plan is complete. Executes `05-plan.md` using Pi-native markdown progress, adaptive review modes, and optional fresh subagents."
---

# Phase 6: Implement for Pi/GPT

Execute `05-plan.md` while keeping the plan's `## Execution Progress` section as the source of truth. Use fresh Pi subagents for narrow implementation tasks and independent reviews when risk justifies it.

**Announce at start:** "Starting deep-work Phase 6: Implementation."

## Inputs

```text
<topic-slug> [--mode strict|balanced|fast]
```

Default mode: `balanced`, unless `05-plan.md` specifies a stricter review mode.

## Setup

1. Run `~/.pi/agent/skills/_shared/dw-setup.sh "<topic-slug>"` and parse `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`.
2. Verify `05-plan.md` exists. If not, stop and tell the user to complete Phase 5 first.
3. If `05-plan-review.md` exists, read it and carry forward any blocking conditions.
4. Capture the starting git SHA with `git rev-parse HEAD`.
5. Read `05-plan.md` completely once. Extract:
   - phase list
   - task list
   - dependencies
   - validation commands
   - review/risk metadata if present
   - current Execution Progress status

## Source of Truth

Do not use harness-specific task tools for durable state. Track execution by editing `05-plan.md`:

- Mark task status: `[ ]`, `[~]`, `[x]`, `[!]`, `[-]`
- Record commit SHA per task if commits are made
- Record validation result and timestamp per phase
- Append any deviations to `### Deviation Log`

## Implementation Modes

### strict

Use for high-risk or user-requested rigorous work.

For each task:

1. Dispatch a fresh `implementer` subagent with only the task text, relevant plan context, constraints, and validation commands.
2. Run validation.
3. Dispatch `spec-reviewer` to check the diff against the assigned task/spec only.
4. If spec gaps exist, send a focused fix task to the implementer and re-review.
5. Dispatch `code-quality-reviewer` for correctness, maintainability, tests, and simplicity.
6. Fix blocking quality issues and re-review.
7. Commit if the plan calls for commits.
8. Mark task complete in `05-plan.md`.

### balanced

Default mode.

For each implementation phase:

1. Implement tasks sequentially, using the main agent for simple tasks and a fresh `implementer` subagent for isolated/risky tasks.
2. Run the phase validation command.
3. Dispatch one fresh review after the phase:
   - `spec-reviewer` if requirement coverage is the main risk
   - `code-quality-reviewer` if implementation quality/regression risk is the main risk
   - both if the phase is medium/high risk
4. Fix blocking issues, rerun validation, and update progress.

### fast

Use only for small, low-risk changes.

1. Implement tasks directly or with one implementer subagent.
2. Run all validation commands.
3. Dispatch a final fresh `reviewer` or `code-quality-reviewer` over the complete diff.
4. Fix Critical/Significant issues; ask the user before addressing minor/advisory items.

## Risk Triggers for Stricter Review

Escalate to `strict` per-task review for tasks that touch:

- authentication/authorization
- secrets or credentials
- payments/billing
- database schema, migrations, or data integrity
- concurrency, distributed systems, retries, or idempotency
- public APIs or backwards compatibility
- large shared abstractions
- deletion/destructive behavior
- unclear requirements or unreviewed deviations from the plan

## Subagent Prompting

Prompt templates live next to this skill:

- `implementer-prompt.md`
- `spec-reviewer-prompt.md`
- `code-quality-reviewer-prompt.md`

When using Pi `subagent`, translate the templates into a task string. Do not make child subagents launch other subagents. The parent/orchestrator owns all delegation and review loops.

Every implementer task must include:

- task ID and exact task text from `05-plan.md`
- relevant constraints/scope guards
- exact files expected to change
- validation commands
- whether commits are expected
- instruction to report questions before making assumptions

## Handling Questions, Deviations, and Failures

- If an implementer asks a question, answer directly or ask the user; do not let the implementer guess on product/spec decisions.
- If the plan is wrong or impossible, update `### Deviation Log` before continuing.
- If a task fails repeatedly, mark it `[!] BLOCKED`, summarize what was attempted, and ask the user whether to revise the plan, skip, or investigate.
- Do not silently broaden scope.

## Final Review

After all selected tasks are complete:

1. Capture the ending git SHA.
2. Run the full validation suite appropriate to the plan.
3. Dispatch a fresh final review of the complete diff from starting SHA to ending SHA.
4. Present Critical/Significant findings to the user and fix approved blocking issues.
5. Minor/advisory findings are reported but do not block completion unless the user requests fixes.

## Completion Artifact

Write `06-completion.md` to the artifact directory:

```markdown
# Implementation Complete: <topic>

**Date:** <today>
**Repo:** <repo>
**Start SHA:** <sha>
**End SHA:** <sha>
**Mode:** strict|balanced|fast

## Summary
- <what changed>

## Tasks Completed
- <task IDs>

## Validation
- `<command>` — PASS/FAIL, timestamp

## Reviews
- <reviewers run and outcomes>

## Deviations
- <copy from plan deviation log or say none>

## Follow-ups
- <optional>
```

Update `.state.json` with `current_phase: 6` and include phase 6 in `completed_phases`.

## Red Flags

Never:

- Leak full unrelated plan context into narrow implementer tasks.
- Let Phase 2-style research see the original prompt.
- Skip validation because review passed.
- Allow subagents to orchestrate other subagents.
- Treat implementer self-review as independent review in `strict` or `balanced` mode.
- Ignore plan deviations; record them in `05-plan.md`.
