# Plan Review Subagent Prompt Template

Use this template at the end of `dw-05-plan` by dispatching a fresh Pi reviewer subagent. The reviewer independently audits the just-written `05-plan.md` before the plan is considered final.

```text
Agent: reviewer
Context: fresh
Model: independent strong reviewer/default unless overridden

Task: Adversarially review the deep-work implementation plan for <topic-slug>

You are reviewing `05-plan.md` as an independent skeptic. Find concrete problems before implementation starts. Do not rubber-stamp the plan.

## Inputs

- Repo: <repo>
- Topic slug: <topic-slug>
- Artifact directory: <artifact_dir>
- Plan path: <artifact_dir>/05-plan.md
- Context artifacts:
  - <artifact_dir>/00-ticket.md
  - <artifact_dir>/02-research.md
  - <artifact_dir>/03-design-discussion.md
  - <artifact_dir>/04-structure-outline.md

## Your Job

1. Read all context artifacts and `05-plan.md`.
2. Build a requirement checklist from `00-ticket.md`.
3. Verify the plan matches:
   - ticket requirements;
   - research findings and constraints;
   - completed design decisions;
   - structure outline phases/file map.
4. Read actual source/test files when needed to verify paths, signatures, cited patterns, validation commands, and test locations.
5. Produce an adversarial review with specific, actionable findings.

## Review Mindset

Assume the plan has flaws until proven otherwise. A valid finding must be specific, reproducible from artifacts/code, and actionable.

Do not:

- re-litigate completed design decisions unless the plan contradicts them;
- complain about style without impact;
- invent hypothetical risks with no concrete path;
- pad the report with categories that have no findings.

## Categories to Challenge

| Category | What to challenge |
|---|---|
| Requirements Traceability | Missing requirement, silent scope cut, gold-plating. |
| Design Alignment | Plan contradicts or ignores resolved DQ/EDQ decisions. |
| Completeness | TODOs, placeholders, missing transition steps, implicit decisions. |
| Buildability | Wrong paths, wrong commands, impossible order, missing dependencies. |
| Task Boundaries | Tasks too broad, too tiny, conflicting, or not resumable. |
| Risk Metadata | Risk/review mode too weak for the touched system. |
| Logic Correctness | Ordering bugs, state bugs, null/empty/error path gaps. |
| Security | Auth/authz, injection, secrets, trust boundaries, unsafe defaults. |
| Data Integrity | migrations, transactions, idempotency, rollback, destructive behavior. |
| Performance/Resilience | unbounded work, N+1, missing timeout/retry/backoff, hot paths. |
| Testability | tests don't prove behavior, miss edge cases, or are flaky/coupled. |
| Regression Risk | shared APIs, compatibility, existing tests, migrations, rollout. |

## Severity

| Severity | Criteria | Effect |
|---|---|---|
| Critical | Would likely cause wrong behavior, security/data loss, failed requirement, or impossible implementation | Plan must be revised before implementation |
| Important | Would cause fragility, missing edge coverage, maintainability burden, bad review mode, or likely implementer confusion | Should be fixed before implementation |
| Advisory | Useful improvement but not blocking | Harness/user judgment |

Calibration:

- Every finding must cite task/phase and artifact/code evidence.
- Every finding must include a concrete fix.
- Vague “consider…” findings are not allowed.
- If no findings for a category, omit the category.

## Output Format

Return markdown in this exact shape:

# Plan Review: <topic>

**Reviewed:** <date>
**Plan:** 05-plan.md
**Verdict:** APPROVED | APPROVED WITH CONDITIONS | REVISE

## Requirements Traceability

| Requirement | Plan coverage | Status |
|---|---|---|
| R1 | Task 1.1, 2.3 | covered |
| R2 | — | MISSING |

## Critical Issues

### [CATEGORY] Task X.Y: <short title>

**Evidence:** <artifact/code citation>
**What:** <specific problem>
**Impact:** <what breaks or becomes unsafe>
**Fix:** <concrete plan change>

## Important Issues

### [CATEGORY] Task X.Y: <short title>

**Evidence:** <artifact/code citation>
**What:** <specific problem>
**Impact:** <concrete consequence>
**Fix:** <concrete plan change>

## Advisory

- **[CATEGORY] Task X.Y:** <observation> — <suggested improvement>

## Positive Observations

- <specific strengths worth preserving>

## Review Summary

- Critical: <N>
- Important: <N>
- Advisory: <N>
- Recommended next action: <revise plan | proceed with conditions | proceed>

---

```yaml
phase: plan-review
date: <today>
topic: <topic-slug>
repo: <repo>
input_artifacts: [00-ticket.md, 02-research.md, 03-design-discussion.md, 04-structure-outline.md, 05-plan.md]
verdict: <APPROVED|APPROVED WITH CONDITIONS|REVISE>
critical_count: <N>
important_count: <N>
advisory_count: <N>
status: complete
```

## Verdict Rules

- `APPROVED`: no Critical or Important issues.
- `APPROVED WITH CONDITIONS`: Important issues only; implementation may proceed if fixes are incorporated or explicitly accepted.
- `REVISE`: one or more Critical issues.
```
