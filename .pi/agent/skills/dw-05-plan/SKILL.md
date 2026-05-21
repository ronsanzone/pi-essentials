---
name: dw-05-plan
description: "Phase 5 deep-work worker. Expands the structure outline into an implementation-ready, risk-tagged plan with markdown execution progress."
---

# Phase 5: Implementation Plan

Turn the approved structure outline into a mechanical implementation plan. The plan must be specific enough that a fresh Pi agent or developer can execute it without making architectural decisions.

**Announce at start:** "Starting deep-work Phase 5: Plan."

## Role in Harness

This is a phase worker. The harness owns orchestration and gates. This skill owns the `05-plan.md` artifact and its initial `## Execution Progress` tracker.

## Inputs

```text
<topic-slug>
```

## Setup

1. Run `~/.pi/agent/skills/_shared/dw-setup.sh "<topic-slug>"` and parse `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`.
2. Verify required artifacts exist:
   - `00-ticket.md`
   - `02-research.md`
   - `03-design-discussion.md`
   - `04-structure-outline.md`
3. Read all required artifacts.
4. Capture `git rev-parse HEAD` if available.
5. Read the co-located `plan-review-prompt.md`; it is used for the required fresh subagent review at the end of this phase.

## Planning Standards

The plan should optimize for Pi/GPT execution:

- durable markdown state, not harness task state;
- narrow tasks with exact files and validation;
- explicit risk/review metadata;
- no unresolved architecture/product decisions;
- enough code/test detail for a fresh implementer;
- no gold-plating beyond the ticket and completed design decisions.

Assume the implementer is skilled but has no context. Prefer TDD where practical. Keep tasks small, but do not create fake 2-minute tasks that would be safer as one coherent change.

## Process

### 1. Build Requirements and Decisions Map

Extract:

- requirements/acceptance criteria from `00-ticket.md`;
- selected decisions and implementation implications from `03-design-discussion.md`;
- chosen patterns and citations;
- phases, files, risks, and scope guards from `04-structure-outline.md`.

Create a traceability map from requirement → design decision → phase/task.

### 2. Expand Outline Phases into Tasks

For each phase, create ordered tasks. Each task should cover one file change or a tightly coupled test+implementation pair.

Every task must include:

1. **Task ID** — e.g. `1.1`, `1.2`.
2. **Risk** — `low | medium | high` plus reason.
3. **Suggested executor** — `main-agent | implementer-subagent`.
4. **Review mode** — `final-only | batch | per-task-spec | per-task-spec-and-quality`.
5. **Requirements covered** — IDs from the traceability map.
6. **Decisions implemented** — DQ/EDQ IDs.
7. **Files** — exact paths, actions, and line ranges for modifications.
8. **Patterns to follow** — file:line citations.
9. **Implementation detail** — names, signatures, fields, behavior, error handling.
10. **Tests** — exact test files, test names, cases, and expected results.
11. **Validation** — exact command(s) and expected output.
12. **Commit guidance** — files to include and suggested message, if commits are desired.
13. **Scope guard** — what not to change in this task.

Risk/review guidance:

- Low risk → usually `main-agent`, `final-only` or `batch`.
- Medium risk → often `implementer-subagent`, `batch` or `per-task-spec`.
- High risk → `implementer-subagent`, `per-task-spec-and-quality`.

### 3. Define Phase Success Criteria

For each phase:

- automated validation commands;
- manual checks, if any;
- expected working state after the phase;
- rollback/recovery notes for risky changes.

### 4. Add Scope Guards and Deviation Policy

For each phase and high-risk task, state:

- files/behaviors not to modify;
- assumptions that must not be changed silently;
- when the implementer must stop and ask the harness/user.

### 5. Write `05-plan.md`

Use this structure:

````markdown
# <Topic> Implementation Plan

**Goal:** <from ticket/design>
**Architecture:** <key decisions>
**Tech Stack:** <relevant tools/frameworks>
**Default execution mode:** fast | balanced | strict
**Recommended review policy:** <short summary>

## Requirements Traceability

| Requirement | Source | Design decision(s) | Task(s) |
|---|---|---|---|

## Execution Progress

### Phase Progress

| # | Phase | Status | Validation Command | Result |
|---|---|---|---|---|
| 1 | <phase name> | `[ ] NOT STARTED` | `<command>` | — |

**Status legend:** `[ ] NOT STARTED` | `[~] IN PROGRESS` | `[x] DONE` | `[!] BLOCKED`

### Task Completion

| Task | Description | Risk | Executor | Review | Status | Commit | Deviations |
|---|---|---|---|---|---|---|---|
| **Phase 1** | | | | | | | |
| 1.1 | <description> | low | main-agent | batch | `[ ]` | — | |

**Task status legend:** `[ ]` pending | `[~]` in progress | `[x]` done | `[!]` blocked | `[-]` skipped

### Deviation Log

_No deviations recorded._

## Implementation Phases

### Phase 1: <name>

**Goal:** <goal>
**Dependencies:** None | <phase/task>
**Validation:** `<command>` — expected <result>
**Risk:** low | medium | high — <why>
**Success criteria:**
- <criterion>

#### Task 1.1: <name>

**Risk:** low | medium | high — <why>
**Suggested executor:** main-agent | implementer-subagent
**Review mode:** final-only | batch | per-task-spec | per-task-spec-and-quality
**Requirements covered:** R1, R2
**Decisions implemented:** DQ-1

**Files:**
- Create: `path/to/new-file.ext`
- Modify: `path/to/existing.ext:10-40`
- Test: `path/to/test.ext`

**Patterns to follow:**
- `path/to/example.ext:12-45` — <pattern>

**Implementation steps:**
1. <exact step>
2. <exact step>

**Tests:**
- `test_name` — input/setup → expected result

**Validation:**
- Run: `<command>`
- Expected: <result>

**Commit:**
- Files: `<paths>`
- Message: `<message>`

**Scope guard:** Do not <out-of-scope change>.

## Risks and Mitigations

| Risk | Affected task(s) | Mitigation | Review requirement |
|---|---|---|---|

---

```yaml
phase: plan
date: <today>
topic: <topic-slug>
repo: <repo>
git_sha: <HEAD>
input_artifacts: [00-ticket.md, 02-research.md, 03-design-discussion.md, 04-structure-outline.md]
total_phases: <N>
total_tasks: <N>
status: complete
```
````

## Quality Bar

Before writing the final artifact, check:

- every requirement maps to at least one task or explicit out-of-scope note;
- every task has validation;
- every risky task has an appropriate review mode;
- no task says “implement as appropriate” or “figure out”; 
- all cited files/patterns come from research/design/outline or direct verification;
- tasks can be resumed from `## Execution Progress` alone.

## Required Plan Review Subagent

After writing the first complete draft of `05-plan.md`, dispatch a fresh Pi reviewer subagent using the co-located `plan-review-prompt.md` template.

Use:

- Agent: `reviewer`
- Context: fresh
- Task: fill the template with `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`, and the artifact paths.

The reviewer must return markdown in the template's review format. Save that output to:

```text
$ARTIFACT_DIR/05-plan-review.md
```

Then handle the verdict:

- `APPROVED`: keep `05-plan.md` as final.
- `APPROVED WITH CONDITIONS`: update `05-plan.md` for all Important issues unless the harness/user explicitly accepts the condition. If you update the plan, record a short `## Plan Review Fixes Applied` section near the end of `05-plan.md`.
- `REVISE`: update `05-plan.md` for all Critical issues, then rerun the reviewer subagent once. If the second review still returns `REVISE`, leave the plan status as `needs-revision` and report blockers to the harness/user.

The final `05-plan.md` frontmatter status should be:

- `complete` when review is `APPROVED` or accepted `APPROVED WITH CONDITIONS`;
- `needs-revision` when Critical issues remain.

## State Update

Update `$ARTIFACT_DIR/.state.json` to include phase 5 in `completed_phases` only when the final plan status is `complete`. Also record plan review metadata when available:

```json
{
  "plan_review": {
    "artifact": "05-plan-review.md",
    "verdict": "APPROVED|APPROVED WITH CONDITIONS|REVISE",
    "critical_count": 0,
    "important_count": 0
  }
}
```

Preserve existing fields.

## Output

Return:

- plan artifact path;
- plan review artifact path;
- review verdict;
- phase/task counts;
- recommended execution mode;
- high-risk tasks and required review mode;
- whether implementation can proceed or the plan still needs revision.
