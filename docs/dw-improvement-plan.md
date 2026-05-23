# Pi Deep-Work Skill Improvement Plan

**Date:** 2026-05-22
**Source session:** `mms/cloudp-398359-ali-admin-snapshots`
**Purpose:** Improve the Pi fork of the deep-work pipeline based on observed instruction-adherence gaps, artifact/reality mismatches, and skill ambiguities from an end-to-end run.

## Executive Summary

The pipeline successfully produced a narrow, validated, reviewed implementation, but several process issues surfaced:

1. Planned commits were not made during Phase 6 until the user asked.
2. Planned validation commands were copied through multiple phases even though they were not executable test actions in the repository.
3. Phase 6 progress state was updated after the fact rather than before/after each task.
4. A validation-command deviation was recorded late rather than immediately.
5. Review requirements were spread across risk fields, task rows, and mode rules, making them easy to under-execute.
6. Phase 1 generated useful questions but had duplicate numbering and some solution-shaped phrasing.
7. Phase 2 marked at least one partially answered lookup as complete.

This plan proposes generic changes to each skill so they remain reusable outside this repository. The key theme is **explicitness plus backpressure**: required actions should be machine-readable in the artifacts, and plans should distinguish verified facts from inferred assumptions.

## Evidence From This Session

### E1: Commit semantics were ambiguous

`05-plan.md` contained per-task `Commit:` blocks with concrete messages, but Phase 6 initially completed without commits. The user later asked why commits were not made, and we created the commits afterward:

- `5eaaec425c3b` — `CLOUDP-398359 Add Alibaba admin backup snapshot view`
- `b2b127c94c19` — `CLOUDP-398359 Test Alibaba admin backup snapshot view`
- `d891ddafdfca` — `CLOUDP-398359 Wire Alibaba admin snapshot detail view`

Root cause: the plan used the label `Commit:` and the Phase 6 skill said “Commit if the plan calls for commits,” but it was ambiguous whether commit blocks were mandatory or advisory.

### E2: Planned validation commands did not match executable reality

The plan repeatedly used commands such as:

```bash
bazel test //server/src/unit/com/xgen/svc/nds/model/ui:TestLibrary
```

Reality during Phase 6:

```text
No test targets were found, yet testing was requested
```

The working command was the package-level test action:

```bash
bazel test //server/src/unit/com/xgen/svc/nds/model/ui:all
```

Generic lesson: plans should verify validation actions before treating them as authoritative, or label them as assumptions.

### E3: Deviation logging lagged behind discovery

The validation target mismatch was discovered during implementation, but the deviation log was updated only later. Phase 6 says deviations should be recorded when plan reality diverges. This needs a more mechanical rule.

### E4: Progress tracking was not used as live source of truth

`05-plan.md` was updated after the implementation was complete. The skill says the plan’s `Execution Progress` section is the durable state source. For longer work, this could cause loss of resumability and auditability.

### E5: Review requirements were too inferential

The plan and Phase 6 mode rules implied reviews based on risk. We ran a code-quality review, but not a separate spec review for the medium-risk phase. The workflow would be more reliable if Phase 5 generated an explicit review schedule and Phase 6 executed it mechanically.

### E6: Phase 1 question quality had mechanical issues

`01-research-questions.md` had duplicate question numbering across categories and some typos/awkward phrasing. Phase 2 recovered by renumbering to Q1-Q18, but the source artifact should be cleaner.

### E7: Phase 2 completion status was too loose

Phase 2 Q14 asked what code ownership applied. The answer said the precise owner entry remained a lookup item, while still marking the question complete. Later Phase 3 resolved ownership with targeted exploration. Generic lesson: use `PARTIAL` or `INCOMPLETE` when a factual lookup remains unresolved.

---

# Proposed Skill Changes

## 1. `dw-01-research-questions`

### Goals

- Produce cleaner, more neutral research-question artifacts.
- Reduce indirect solution leakage into Phase 2.
- Make questions easier to track across later phases.

### Changes

#### 1.1 Use stable, globally unique question IDs

Replace category-local numbering with stable IDs:

```markdown
### Subsystem Understanding
- RQ-1: How does ... currently work?
- RQ-2: What constraints ...?

### Pattern Discovery
- RQ-3: What patterns exist for ...?
```

Add a final self-check before writing:

```markdown
## Question Quality Check
- [ ] IDs are globally unique.
- [ ] No duplicate questions.
- [ ] Every question is objective and answerable by code inspection.
- [ ] Every question is neutral and does not propose a solution.
```

**Reasoning:** The observed artifact had duplicate numeric labels, which creates avoidable ambiguity when Phase 2 references answers.

#### 1.2 Separate ticket-named components from neutral questions

Add an intermediate section:

```markdown
## Ticket-Named Components and Claims
- `<component/path>` — mentioned by ticket as relevant.
- `<behavior>` — claimed by ticket; verify in research.
```

Then generate neutral questions separately. Phase 2 should receive only `## Research Questions`, not this ticket-derived section.

**Reasoning:** Phase 2’s firewall can be indirectly weakened if Phase 1 embeds solution language into questions. Separating raw ticket references from neutral questions makes the boundary more auditable.

#### 1.3 Add a neutrality lint

Before writing, reject or rewrite questions containing solution-leading forms:

- “How should we...?”
- “What is the best way to...?”
- “Can we implement...?”
- “Should we add...?”

Allow file names and component names when they come from the ticket or shallow scan, but phrase questions around current behavior, patterns, constraints, and boundaries.

**Reasoning:** Keeps Phase 2 focused on facts rather than design.

#### 1.4 Add concise question metadata

Each question may include tags:

```markdown
- RQ-7: What test patterns exist for provider-specific view wrappers?
  - Type: pattern-discovery
  - Expected source: tests/build config
```

**Reasoning:** Helps Phase 2 choose the right investigation mode without reading the original prompt.

---

## 2. `dw-02-research`

### Goals

- Make research answer status more truthful.
- Preserve concise direct answers while keeping evidence.
- Distinguish facts from assumptions.

### Changes

#### 2.1 Add `PARTIAL` status

Allowed statuses become:

```markdown
**Status:** COMPLETE | PARTIAL | INCOMPLETE
```

Definitions:

- `COMPLETE`: directly answers the question with sufficient evidence.
- `PARTIAL`: answers some of the question, but a specific factual lookup remains unresolved.
- `INCOMPLETE`: cannot locate enough evidence or investigation exceeded scope.

**Reasoning:** In this session, an ownership lookup was marked complete while explicitly saying exact ownership remained unresolved.

#### 2.2 Require a direct-answer line

For every question:

```markdown
**Direct answer:** <one or two sentence factual answer>
```

Then include evidence and citations below.

**Reasoning:** Long research sections can hide whether the question was actually answered. A direct answer forces closure.

#### 2.3 Require explicit assumptions and confidence

When claims are inferred rather than directly verified:

```markdown
**Assumption:** <what is inferred>
**Confidence:** high | medium | low
**Needed to verify:** <specific lookup/action>
```

**Reasoning:** Prevents inferred facts from silently flowing into design as verified facts.

#### 2.4 Treat ownership/configuration/path-source questions as exact lookups

If a question asks what ownership, config, generated target, or source-of-truth rule applies, the worker must inspect the relevant source of truth or mark the answer `PARTIAL`/`INCOMPLETE`.

**Reasoning:** These claims directly affect implementation and review routing.

#### 2.5 Add concise mode guidance

Default output per question:

1. Direct answer
2. Evidence with citations
3. Ambiguities/assumptions

Move extended details to summary sections only when necessary.

**Reasoning:** This keeps artifacts useful without excessive verbosity for small tickets.

---

## 3. `dw-03-design-discussion`

### Goals

- Make auto-resolved decisions auditable.
- Avoid unnecessary verbosity for small changes.
- Clearly separate requirements from actual design choices.

### Changes

#### 3.1 Add user-gate assessment

Include:

```markdown
## User Gate Assessment

**User decision required:** yes | no
**Reason:** <why auto-resolution is safe or why user input is needed>
**High-risk/product-facing decisions:** <none or list>
```

**Reasoning:** This session used auto decisions successfully, but the artifact did not explicitly justify why no user gate was needed.

#### 3.2 Add risk level per design question

For every DQ:

```markdown
**Risk:** low | medium | high
**User gate:** required | not required
```

High-risk decisions require user input unless there is an explicit reason not to.

**Reasoning:** Makes `--auto` behavior less subjective.

#### 3.3 Separate requirements from design options

Before DQs, add:

```markdown
## Fixed Requirements From Ticket
- FR-1: <required behavior>
```

Only create design options where a real choice exists.

**Reasoning:** Some ticket-mandated work does not need option tables. This reduces noise and avoids pretending required behavior is optional.

#### 3.4 Add compact DQ format for small low-risk changes

Allow shorter DQs when risk is low and options are obvious:

```markdown
### DQ-1: Placement
**Risk:** low
**Options considered:** existing package vs new package
**Decision:** existing package
**Rationale:** matches current pattern and ownership.
```

**Reasoning:** The design artifact was effective but long relative to the final 4-file change.

#### 3.5 Add unverified-dependency check

For each decision:

```markdown
**Depends on unverified fact:** yes | no
```

If yes, perform targeted exploration or leave the decision open.

**Reasoning:** Prevents unverified research assumptions from becoming design commitments.

---

## 4. `dw-04-outline`

### Goals

- Prevent unverified commands or assumptions from being promoted into implementation plans.
- Make phase validation confidence explicit.

### Changes

#### 4.1 Add validation confidence for each phase

Extend phase entries:

```markdown
**Validation:** `<command>` — expected <result>
**Validation confidence:** verified | pattern-inferred | unknown
```

Definitions:

- `verified`: command/action was checked and is executable/addressable.
- `pattern-inferred`: inferred from nearby patterns but not checked.
- `unknown`: placeholder requiring Phase 5 verification.

**Reasoning:** The outline carried forward validation commands inferred from target names but not executable in practice.

#### 4.2 Add assumption field per phase

```markdown
**Assumptions:**
- <assumption>
- <how Phase 5 should verify it>
```

**Reasoning:** Keeps inferred facts visible instead of blending them into the plan.

#### 4.3 Add plan-backpressure notes

If validation, ownership, file location, or dependency claims are unverified, add:

```markdown
**Phase 5 backpressure:** Verify <specific action> before finalizing task instructions.
```

**Reasoning:** Phase 5 should not blindly copy unverified outline content.

#### 4.4 Require independent-testability statement

For each phase:

```markdown
**Independent validation:** yes | no
**If no:** validation requires Phase <N> because <reason>
```

**Reasoning:** In this session, Phase 1’s code compiled meaningfully only once the Phase 2 test existed. Explicitly recording this reduces confusion.

---

## 5. `dw-05-plan`

### Goals

- Produce plans that are mechanically executable by Phase 6.
- Make validation, review, and commit requirements explicit.
- Preserve scope boundaries while reducing ambiguity.

### Changes

#### 5.1 Add explicit required-action fields to each task

Replace or augment `Commit:` with:

```markdown
**Commit required:** yes | no
**Commit timing:** after task | after phase | final only
**Commit message:** `<message>`
```

Also add:

```markdown
**Validation required:** yes | no
**Validation command status:** verified | pattern-inferred | unverified
```

**Reasoning:** Prevents ambiguity between “commit guidance” and “commit required.”

#### 5.2 Verify validation actions before finalizing when feasible

Add a process step:

> Before writing final validation commands, perform a lightweight verification that each command/action is addressable. If verification is not feasible, label the command as unverified and add it to assumptions.

**Reasoning:** This directly addresses the `TestLibrary` mismatch observed in Phase 6 without naming any specific build tool.

#### 5.3 Add `## Required Review Schedule`

Example:

```markdown
## Required Review Schedule

| Point | Required reviewer(s) | Reason | Blocking criteria |
|---|---|---|---|
| After Phase 3 validation | spec-reviewer, code-quality-reviewer | Medium-risk production behavior change | Critical/Significant findings |
| Final diff | code-quality-reviewer | Overall regression check | Critical/Significant findings |
```

**Reasoning:** In this run, review requirements were inferential. A schedule makes Phase 6 mechanical.

#### 5.4 Add task completion checklist

Each task should include:

```markdown
**Complete only after:**
- [ ] files changed as specified
- [ ] relevant tests updated
- [ ] validation passed or deviation logged
- [ ] required review completed
- [ ] required commit created and SHA recorded
- [ ] progress table updated
```

**Reasoning:** This reinforces Phase 6 state discipline.

#### 5.5 Separate expected, allowed, and forbidden files

Use:

```markdown
**Expected files:**
- `...`

**Allowed only if validation requires:**
- `...`

**Forbidden/out of scope:**
- `...`
```

**Reasoning:** Makes scope guard enforcement easier.

#### 5.6 Add serialization/external-contract assertion policy

For tests that check serialized output, API payloads, generated files, or other externally consumed representations:

```markdown
**External contract test policy:**
- Assert externally required field/property names exist.
- Assert exact primitive/string/enum values when those values are contractually meaningful.
- For complex framework-serialized objects, use project-standard serialization utilities if available.
- Do not overfit incidental serializer internals unless that shape is the contract.
```

**Reasoning:** The ObjectId JSON assertion required iteration and remained somewhat weak. This guidance helps future plans be precise without overfitting.

#### 5.7 Add final pre-implementation checklist

Before writing `status: complete`:

```markdown
## Pre-Implementation Checklist
- [ ] No open design decisions.
- [ ] Validation actions verified or labeled.
- [ ] Commit requirements explicit.
- [ ] Review schedule explicit.
- [ ] Scope guards present.
- [ ] Assumptions listed.
```

**Reasoning:** Catches plan executability gaps before Phase 6.

---

## 6. `dw-05b-plan-review` / Plan Review Prompt

### Goals

- Catch plan executability problems before implementation.
- Review ambiguity in required actions.
- Check whether tests prove the intended contract.

### Changes

#### 6.1 Add validation-action review

Plan reviewer must answer:

```markdown
## Validation Executability
- Are validation actions verified, executable/addressable, or clearly labeled assumptions?
- Are any commands copied from patterns without verification?
- Does each phase have a realistic validation path?
```

**Reasoning:** The plan review caught the JSON test gap but not the invalid validation target.

#### 6.2 Add required-action ambiguity check

Reviewer should flag ambiguous language around:

- commits
- validation
- review gates
- ownership
- migrations/destructive actions
- user approvals

Examples to flag:

- “if needed”
- “as appropriate”
- “guidance”
- “optional” when later required by execution skill

**Reasoning:** The commit miss came from ambiguous commit semantics.

#### 6.3 Add test-contract review

Reviewer should evaluate:

```markdown
- Do tests prove the externally consumed behavior or only internal getters?
- Are field/property names asserted when they are part of the contract?
- Are complex serialized objects asserted appropriately?
- Are important regression boundaries covered without over-testing unrelated behavior?
```

**Reasoning:** The existing plan review’s strongest contribution was catching getter-only assertions. This should be a formal checklist.

#### 6.4 Add executability score

Plan review output should include:

```markdown
## Executability Score
**Score:** high | medium | low
**Blocking ambiguities:** ...
**Unverified assumptions:** ...
**Required fixes before implementation:** ...
```

**Reasoning:** Gives the orchestrator a clear go/no-go signal.

#### 6.5 Require review-schedule feedback

Reviewer should confirm or amend the plan’s review schedule:

```markdown
## Review Schedule Assessment
- Required reviewers:
- Missing review gates:
- Overly expensive review gates:
```

**Reasoning:** Prevents Phase 6 from under-reviewing medium/high-risk changes.

---

## 7. `dw-06-implement`

### Goals

- Make implementation execution deterministic and resumable.
- Ensure commits, validation, reviews, and deviations happen at the right time.
- Keep completion artifacts consistent with the final repository state.

### Changes

#### 7.1 Mandatory progress transitions

Add explicit rules:

1. Before starting a task, mark it `[~]`.
2. After successful validation/review/commit, mark it `[x]`.
3. If blocked, mark it `[!]` immediately.
4. Do not start the next task until the current task’s progress row is updated.

**Reasoning:** In this session progress was updated after the fact, reducing auditability.

#### 7.2 Deterministic commit execution

Add:

> If `Commit required: yes`, create the commit at the specified boundary before marking the task or phase complete. Record the SHA immediately in `05-plan.md`.

Also:

> If commit hooks modify files or fail, resolve the issue, rerun relevant validation, then commit.

**Reasoning:** Prevents the post-hoc commit issue.

#### 7.3 Immediate deviation logging

Add a required sequence when reality differs from the plan:

1. Pause the task.
2. Append a deviation entry to `05-plan.md`.
3. Record the smallest correction chosen.
4. Continue only if the correction is within scope; otherwise ask the user.

**Reasoning:** The validation target mismatch should have been logged immediately.

#### 7.4 Execute explicit review schedule

If `05-plan.md` has `## Required Review Schedule`, Phase 6 must follow it exactly unless it records a deviation. If no schedule exists, derive one from task/phase risk and record it before starting implementation.

**Reasoning:** Avoids under-reviewing because review requirements are scattered.

#### 7.5 Medium/high-risk review default

When deriving reviews, require both spec and quality review for medium/high-risk production behavior changes unless explicitly waived:

```markdown
**Review waiver:** <why one reviewer is sufficient>
```

**Reasoning:** Phase 6 balanced-mode wording said both may be needed for medium/high risk, but this was easy to miss.

#### 7.6 Pre-completion consistency check

Before writing `06-completion.md`, verify:

```markdown
- [ ] all selected tasks are `[x]`, `[-]`, or `[!]` with explanation
- [ ] all required validation results recorded
- [ ] all required reviews recorded
- [ ] all required commits recorded
- [ ] deviation log copied/summarized
- [ ] final SHA captured after final commit
```

**Reasoning:** Prevents stale completion artifacts.

#### 7.7 Add `## Commits` to completion artifact

Update template:

```markdown
## Commits
- `<sha>` — <message> — tasks <ids>
```

**Reasoning:** Makes final implementation state explicit and avoids relying only on progress table commit columns.

#### 7.8 Post-completion change handling

If the user requests commits or fixes after `06-completion.md` is written, Phase 6 should update:

- `05-plan.md`
- `06-completion.md`
- `.state.json`

and record a commit/fix note.

**Reasoning:** This happened in the session and required manual artifact repair.

---

# Artifact Template Changes

## `05-plan.md` additions

Add near the top:

```markdown
## Plan Assumptions

| Assumption | Verification status | Required before implementation? |
|---|---|---|
| ... | verified | yes/no |
```

Add review schedule:

```markdown
## Required Review Schedule

| Point | Reviewer(s) | Reason | Blocking criteria |
|---|---|---|---|
```

Extend task sections:

```markdown
**Commit required:** yes | no
**Commit timing:** after task | after phase | final only
**Commit message:** `<message>`

**Validation command status:** verified | pattern-inferred | unverified

**Complete only after:**
- [ ] implementation complete
- [ ] tests complete
- [ ] validation complete
- [ ] review complete
- [ ] commit complete if required
- [ ] progress updated
```

## `06-completion.md` additions

Add:

```markdown
## Commits
- `<sha>` — <message> — task(s)

## Post-Completion Updates
- <optional, only if changed after first completion>
```

---

# Implementation Order

## Phase A: Update planning skills first

1. Update `dw-01-research-questions`.
2. Update `dw-02-research`.
3. Update `dw-03-design-discussion`.
4. Update `dw-04-outline`.
5. Update `dw-05-plan`.
6. Update plan-review prompt / `dw-05b-plan-review`.

**Reason:** Better artifacts should be produced before changing implementation execution expectations.

## Phase B: Update `dw-06-implement`

Update Phase 6 after Phase 5 can emit the explicit fields it needs:

- commit required/timing/message
- validation status
- review schedule
- completion checklist

**Reason:** Phase 6 should execute structured plan data rather than infer intent from prose.

## Phase C: Dry-run on a small completed artifact

Use a completed small ticket artifact set to check that the new rules would have caught:

- duplicate research IDs
- partial research marked complete
- unverified validation commands
- ambiguous commit guidance
- missing review schedule

**Reason:** This validates the skill changes without needing a new production task.

## Phase D: Run on the next real task

For the next real pipeline run, explicitly observe:

- Are validation commands verified or labeled?
- Are commits made at planned boundaries?
- Is progress updated incrementally?
- Are deviations logged immediately?
- Does completion include commits and final SHA?

---

# Success Criteria

The skill updates are successful if a future run shows:

- No duplicate research question IDs.
- Phase 2 does not mark unresolved factual lookups as complete.
- Phase 5 plans distinguish verified actions from assumptions.
- Required commits are created without user reminder.
- Required reviews are executed from an explicit schedule.
- Deviations are logged before continuing.
- `06-completion.md` includes final SHA and commit list matching repository history.

---

# Non-Goals

- Do not make the skills specific to any single repository, language, test framework, or build tool.
- Do not require every validation command to be executed during planning; labeling unverified assumptions is acceptable when execution would be expensive.
- Do not force heavy review gates for low-risk changes; instead, make review requirements explicit and risk-based.
- Do not remove the bias firewall between Phase 1 and Phase 2; strengthen it by making Phase 1 questions more neutral.
