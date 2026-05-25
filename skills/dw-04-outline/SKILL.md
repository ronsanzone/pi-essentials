---
name: dw-04-outline
description: "Phase 4 deep-work worker. Converts completed design decisions into a concrete, risk-tagged change outline for planning."
---

# Phase 4: Structure Outline

Translate completed design decisions into a concrete implementation map: what changes, where they belong, how they are phased, and what risks/review modes the planner must carry forward. Do not write detailed implementation steps yet.

**Announce at start:** "Starting deep-work Phase 4: Structure Outline."

## Role in Harness

This is a phase worker. The harness is responsible for invoking it after Phase 3 is complete and for deciding whether the resulting outline needs user approval.

## Inputs

```text
<topic-slug>
```

## Setup

1. Run `~/.pi/agent/skills/_shared/dw-setup.sh "<topic-slug>"` and parse `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`.
2. Verify `03-design-discussion.md` exists and has `status: complete` or no unresolved `**Decision:** OPEN` entries.
3. Verify `02-research.md` exists.
4. Read both artifacts.
5. Capture `git rev-parse HEAD` if available.

## Process

### 1. Extract Planning Inputs

From `03-design-discussion.md`, extract:

- summary of requested changes;
- desired end state;
- scope boundaries / what not to do;
- selected patterns to follow;
- every resolved DQ/EDQ and its implementation implication;
- constraints and risks.

From `02-research.md`, extract:

- concrete file paths;
- line ranges for likely modifications;
- test locations/patterns;
- constraints/invariants that affect implementation.

### 2. Map Decisions to File Changes

For every design decision, identify concrete file impacts:

- `NEW` — files/modules/tests to create;
- `MODIFY` — existing files and approximate line ranges;
- `DELETE` — files/code paths to remove, if explicitly in scope;
- `CONFIG/DOCS` — config, docs, generated assets, migration files.

Each file entry must explain:

- why this file is touched;
- which design decision requires it;
- which research/pattern citation supports it;
- whether tests are needed nearby.

### 3. Group into Implementation Phases

Create sequential phases that are independently testable and resumable. Prefer phases that leave the system working even if later phases are not implemented.

For each phase include:

- **Goal** — one sentence;
- **Scope** — included work;
- **Files** — exact paths and action tags;
- **Dependencies** — previous phases or external prerequisites;
- **Validation** — exact command(s) and expected result;
- **Risk** — `low | medium | high`, with reason;
- **Suggested review mode** — `final-only | batch | per-task`.

Review-mode guidance:

- `final-only`: low-risk, isolated, trivial changes.
- `batch`: normal multi-file feature work; review after phase validation.
- `per-task`: high-risk work touching auth, data integrity, migrations, concurrency, public APIs, or destructive behavior.

### 4. Build File Impact Summary

Use this table:

| File | Action | Phase(s) | Decision(s) | Reason | Test impact |
|---|---|---|---|---|---|

### 5. Compile Risk Register

Include:

- incomplete research that still matters;
- unverified assumptions;
- compatibility/migration risks;
- testing gaps;
- likely failure modes;
- mitigation or review mode for each risk.

### 6. Write Artifact

Write `04-structure-outline.md`:

```markdown
---
phase: structure-outline
date: <today>
topic: <topic-slug>
repo: <repo>
git_sha: <HEAD>
input_artifacts: [02-research.md, 03-design-discussion.md]
phases_count: <N>
total_files_touched: <N>
status: complete
---

## Change Summary

<2-3 sentences describing the change set>

## Planning Inputs

### Desired End State

### Decisions Carried Forward

### Patterns to Follow

### Scope Boundaries

## Phases

### Phase 1: <name> — <one-line goal>

**Goal:** <goal>
**Scope:** <included work>
**Files:**
- `path/to/file` (NEW) — <what it contains> — Decision: DQ-1 — Pattern: <citation>
- `path/to/existing` (MODIFY: lines 10-40) — <what changes> — Decision: DQ-2
**Dependencies:** None | Phase <N>
**Validation:** `<command>` — expected <result>
**Risk:** low | medium | high — <why>
**Suggested review mode:** final-only | batch | per-task

## File Impact Summary

| File | Action | Phase(s) | Decision(s) | Reason | Test impact |
|---|---|---|---|---|---|

## Risk Register

| Risk | Source | Impact | Mitigation | Review mode |
|---|---|---|---|---|

## What We're NOT Doing
```

## State Update

Update `$ARTIFACT_DIR/.state.json` to include phase 4 in `completed_phases` while preserving existing fields.

## Output

Return:

- artifact path;
- phase count;
- high-risk areas;
- review-mode distribution;
- any assumptions the harness/user should approve before Phase 5.
