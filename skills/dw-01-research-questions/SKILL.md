---
name: dw-01-research-questions
description: "Phase 1 deep-work worker. Converts a task/ticket into objective codebase research questions while writing 00-ticket.md and 01-research-questions.md."
---

# Phase 1: Research Questions

Decompose the user's task into objective, investigative questions answerable by reading the codebase. Do **not** propose solutions yet.

**Announce at start:** "Starting deep-work Phase 1: Research Questions."

## Role in Harness

This is a phase worker, not an orchestrator. The harness provides the task/ticket and topic slug, then invokes this skill. This skill writes artifacts and returns a summary.

## Inputs

Expected input shape:

```text
<topic-slug> <task description or ticket path/content>
```

If the slug is missing or ambiguous, ask the user/harness for it. Slugs should be lowercase kebab-case.

## Setup

1. Run `~/.pi/agent/skills/_shared/dw-setup.sh "<topic-slug>"` and parse `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`.
2. Resolve the task description:
   - if a path is provided, read it;
   - otherwise use the provided text.
3. Capture `git rev-parse HEAD` if available.
4. Write `00-ticket.md` with the original task for traceability.

## Lightweight Codebase Scan

Gather only structural context needed to make grounded questions:

- list top-level directories/files;
- read project instruction files if present: `AGENTS.md`, `CLAUDE.md`, `README.md`, `.pi/agent/AGENTS.md`;
- use Pi `subagent` `codebase-locator` when useful:
  > Find files and directories related to: <key nouns/systems from prompt>. Return locations grouped by purpose.

If subagents are unavailable, use `bash` with `find`/`rg` for a shallow scan. Do not deep-read implementation yet.

## Generate Questions

Create 5-20 questions. Every question must be:

- **Objective** — answerable by code inspection;
- **Specific** — references concrete files/modules/systems from the scan;
- **Neutral** — does not assume a solution;
- **Useful to design** — investigates current behavior, constraints, boundaries, or patterns.

Use these categories as appropriate:

| Category | Pattern |
|---|---|
| Subsystem Understanding | How does `<component>` currently work? |
| Code Tracing | What is the flow from `<A>` to `<B>`? |
| Pattern Discovery | What patterns exist for adding/changing `<thing>`? |
| Dependency Mapping | What does `<module>` depend on and what depends on it? |
| Boundary Identification | Where do `<system A>` and `<system B>` integrate? |
| Constraint Discovery | What invariants, validation rules, or tests constrain this area? |

Forbidden patterns:

- “How should we...”
- “What's the best way to...”
- “Would it be better to...”
- “Can we implement...”
- Any question that embeds a preferred solution.

## Write Artifacts

Write `00-ticket.md`:

```markdown
---
phase: ticket
date: <today>
topic: <topic-slug>
repo: <repo>
git_sha: <HEAD>
status: complete
---

## Ticket

<original task/ticket>
```

Write `01-research-questions.md`:

```markdown
---
phase: research-questions
date: <today>
topic: <topic-slug>
repo: <repo>
git_sha: <HEAD>
status: complete
---

## Original Prompt

<stored for traceability; Phase 2 must not read this>

## Research Questions

### Subsystem Understanding
1. <question>

### Code Tracing
2. <question>

...
```

## State Update

Update `$ARTIFACT_DIR/.state.json` to include phase 1 in `completed_phases` while preserving any existing fields.

## Output

Return:

- artifact directory;
- number of questions;
- question list grouped by category;
- explicit handoff warning:
  > Phase 2 must run in fresh context using only the extracted `## Research Questions` section. Do not pass the original prompt to Phase 2.
