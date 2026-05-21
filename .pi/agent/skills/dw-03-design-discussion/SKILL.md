---
name: dw-03-design-discussion
description: "Phase 3 deep-work worker. Reintroduces the ticket after research is locked, identifies design questions, recommends options, and records decisions."
---

# Phase 3: Design Discussion

Combine the original ticket with objective research to identify design decisions, evaluate options, and record chosen implementation direction.

**Announce at start:** "Starting deep-work Phase 3: Design Discussion."

## Inputs

```text
<topic-slug> [--auto]
```

`--auto` means accept the skill's recommendations for all open design questions unless a decision is high-risk, ambiguous, or product-facing enough to require the user.

## Setup

1. Run `~/.pi/agent/skills/_shared/dw-setup.sh "<topic-slug>"` and parse `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`.
2. Verify `00-ticket.md` exists.
3. Verify `02-research.md` exists.
4. Read both artifacts completely. The bias firewall is now over; prompt context may re-enter.

## Process

### 1. Distill Context

Produce these sections:

- **Summary of Changes Requested** — concise restatement of the ticket goal.
- **Current State** — relevant current behavior from research, with file:line citations.
- **Desired End State** — concrete post-change behavior/files/APIs.
- **What We're Not Doing** — explicit scope boundaries and deferred adjacent work.
- **Patterns to Follow** — selected codebase patterns from research, with citations and why they fit.

### 2. Identify Design Questions

Find every decision needed before planning:

- placement/ownership;
- interface/API shape;
- data model or state handling;
- integration boundaries;
- error handling and edge cases;
- compatibility/migration approach;
- test strategy.

### 3. Build Options

For each design question, provide 2-4 options. Each option must:

- cite research or targeted exploration;
- list concrete pros/cons;
- explain implementation impact;
- include a recommendation.

Do not invent options that require unresearched systems unless you perform targeted exploration.

### 4. Targeted Exploration, If Needed

If a design decision depends on a small missing fact:

- do at most 5 bounded lookups with `read`/`bash` (`rg`/`find`);
- or use `codebase-locator` for a focused location search;
- record exploration findings separately as `EDQ-*` questions.

This is not a second research phase.

### 5. Resolve Decisions

If `--auto` is enabled:

- accept recommendations for low/medium-risk decisions;
- stop and ask the user for high-risk, ambiguous, product-facing, irreversible, or scope-expanding decisions.

If `--auto` is not enabled:

- present decisions in batch form;
- ask the user to choose by ID, accept all recommendations, or edit manually.

For every resolved decision record:

```markdown
**Decision:** <chosen option>
**Rationale:** <why>
**Implementation implication:** <what this means for later phases>
```

## Write Artifact

Write `03-design-discussion.md`:

```markdown
---
phase: design-discussion
date: <today>
topic: <topic-slug>
repo: <repo>
git_sha: <HEAD>
input_artifacts: [00-ticket.md, 02-research.md]
decisions_count: <N>
open_questions: <N>
status: draft|complete
---

## Summary of Changes Requested

## Current State

## Desired End State

## What We're Not Doing

## Patterns to Follow

## Design Questions

### DQ-1: <title>
**Context:** <research-backed context>

| Option | Description | Pros | Cons |
|---|---|---|---|
| A | ... | ... | ... |

**Recommendation:** <option + rationale>
**Decision:** <OPEN or chosen option>
**Rationale:** <if resolved>
**Implementation implication:** <if resolved>

## Exploration-Driven Design Questions

## Constraints Discovered

## Risks from Incomplete Research
```

If decisions remain open, set status `draft`. If all are resolved, set status `complete`.

## State Update

Update `$ARTIFACT_DIR/.state.json` to include phase 3 in `completed_phases` only when the artifact status is `complete`.

## Output

Return:

- artifact path;
- decisions made;
- open decisions if any;
- risks/constraints that planning must carry forward.
