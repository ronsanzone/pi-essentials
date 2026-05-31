---
name: dw-02-research
description: "Phase 2 deep-work worker. Objectively answers research questions with a strict bias firewall: no original prompt, no solutioning."
disable-model-invocation: true
---

# Phase 2: Research

Answer every research question by investigating the codebase. Document what exists, not what should change.

**Announce at start:** "Starting deep-work Phase 2: Research."

## Bias Firewall — Critical

You must not:

- read `00-ticket.md`;
- receive or use the original user prompt;
- ask what the user is trying to build;
- infer desired solutions;
- recommend implementation approaches.

You must:

- use only extracted/pasted research questions as input;
- answer the questions as written;
- cite file:line references for factual claims;
- mark uncertainty honestly.

If the harness accidentally includes original ticket context, stop and ask it to re-invoke this phase with fresh/minimal context.

## Inputs

Expected input:

```text
<topic-slug>
```

Optional: user/harness may paste edited research questions. Pasted questions override the extractor output.

## Setup

1. Run `~/.pi/agent/skills/_shared/dw-setup.sh "<topic-slug>"` and parse `REPO`, `TOPIC_SLUG`, `ARTIFACT_DIR`.
2. Verify artifact directory exists.
3. Verify `01-research-questions.md` exists.
4. Verify `00-ticket.md` exists using `bash test -f` only. Do **not** read it.
5. Obtain questions by either:
   - using pasted questions from the harness/user; or
   - running `~/.pi/agent/skills/dw-02-research/extract-research-questions.sh <repo> <topic-slug>`.

## Investigation Strategy

Map question types to Pi subagents when useful:

| Question type | Preferred worker |
|---|---|
| subsystem understanding | `codebase-analyzer` |
| code tracing | `codebase-analyzer` |
| pattern discovery | `codebase-pattern-finder` |
| dependency mapping | `codebase-locator` |
| boundary identification | `codebase-locator` then direct read/analyzer |
| constraints/tests | `codebase-pattern-finder` or direct read |

Use fresh subagents with this wrapper:

> You are a documentarian. Answer this question by reading the codebase. Report only what exists. Do not suggest improvements, critique patterns, or propose solutions. Include file:line references for all claims.

If subagents are unavailable, use `read` and `bash` (`rg`, `find`, tests as needed) directly.

## Output Format per Question

```markdown
### Q<N>: <question text>

**Status:** COMPLETE | INCOMPLETE
**Sources:** <subagent/tool/source summary>

<findings with file:line citations>
```

Mark `INCOMPLETE` when code cannot be located, behavior is dynamic/implicit, or more exploration would exceed the question's scope. Include what was found and what remains ambiguous.

## Synthesis

After answering questions, add:

### Cross-References

- overlaps between answers;
- contradictions or ambiguous behavior;
- shared files/modules;
- recurring patterns.

### Structured Summary

#### System State as Investigated

Factual current-state summary with citations.

#### Patterns Found

Concrete implementation/test/integration patterns with citations.

#### Constraints & Invariants

Validation rules, type constraints, test assertions, configuration requirements, compatibility constraints.

## Write Artifact

Write `02-research.md`:

```markdown
---
phase: research
date: <today>
topic: <topic-slug>
repo: <repo>
git_sha: <HEAD>
questions_complete: <count>
questions_incomplete: <count>
input_artifacts: [01-research-questions.md questions section only]
status: complete
---

## Research Findings

### Q1: ...
...

## Summary

## Cross-References

## Structured Summary

### System State as Investigated

### Patterns Found

### Constraints & Invariants
```

## State Update

Update `$ARTIFACT_DIR/.state.json` to include phase 2 in `completed_phases` while preserving existing fields.

## Output

Return:

- artifact path;
- complete/incomplete counts;
- top findings;
- unresolved ambiguities;
- reminder that the original prompt may be reintroduced only in Phase 3.
