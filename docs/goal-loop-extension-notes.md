# Goal Loop Extension Notes

## Context

These notes capture an exploration of `mitsuhiko/agent-stuff`'s Pi `goal.ts` extension and how it compares to a prior criteria-driven `/goal` loop used for ADF performance optimization.

Source references:

- Cloned repo: `/tmp/agent-stuff.FmU0MP`
- Extension: `/tmp/agent-stuff.FmU0MP/extensions/goal.ts`
- Prior goal-loop archive:
  - `~/code/adfa-extension-protoype/docs/archive/goal-loop-pattern/goal-prompt.md`
  - `~/code/adfa-extension-protoype/docs/archive/goal-loop-pattern/evaluation_criteria.md`
  - `~/code/adfa-extension-protoype/docs/archive/goal-loop-pattern/evaluation_log.md`

The main conclusion: `goal.ts` is a useful Pi-native runtime substrate for long-running objectives, but the prior ADF pattern is stronger for ambiguous tasks that need clear acceptance criteria, evaluator-driven stopping, and backpressure. The likely best direction is to evolve a goal-loop extension that combines `goal.ts`'s runtime mechanics with criteria/evaluator/logging concepts from the archived pattern.

## What `agent-stuff`'s `goal.ts` does

`goal.ts` adds an opt-in long-running objective mode to a Pi session.

It provides:

- `/goal <objective>` to create or replace a goal.
- `/goal` to show current goal state.
- `/goal pause` and `/goal resume`.
- `/goal clear`.
- A footer/status indicator showing whether a goal is active, paused, budget-limited, or complete.
- Hidden continuation messages that keep the agent working after each turn.
- Goal persistence through `pi.appendEntry()`, so goal state is stored in the session branch.
- Time and token accounting.
- Optional token budgets, available through the model-facing `create_goal` tool.
- Model tools:
  - `get_goal`
  - `create_goal`
  - `update_goal`
- Context cleanup so old continuation messages and UI messages do not accumulate in model context.
- A completion-audit prompt that warns the model not to mark the goal complete without evidence.

### Core model

The core goal state is roughly:

```ts
interface Goal {
  id: string;
  objective: string;
  status: "active" | "paused" | "budgetLimited" | "complete";
  tokenBudget?: number;
  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}
```

There is one goal per session/thread.

### Persistence

The extension stores state in Pi session entries:

```ts
pi.appendEntry("goal", {
  version: 1,
  action,
  goal: goal ? cloneGoal(goal) : null,
});
```

On `session_start` and `session_tree`, it reconstructs the current goal by scanning the active branch for custom goal entries.

This is a strong design choice because it is:

- reload-safe;
- branch-aware;
- session-native;
- free of external mutable state files for the basic goal state.

### Prompt injection

When a goal is active, `goal.ts` appends goal context to the system prompt before each agent run. The objective is wrapped as untrusted data:

```xml
<untrusted_objective>
...
</untrusted_objective>
```

The system prompt tells the model:

- the current objective;
- elapsed time;
- tokens used;
- token budget and remaining budget;
- if achieved, call `update_goal` with status `complete`;
- do not mark complete merely because work is stopping or budget is nearly exhausted.

The untrusted-objective wrapper is worth preserving in future designs.

### Continuation behavior

After each agent turn, if the goal is still active, the extension queues a hidden continuation message and triggers/follows up with another turn.

The continuation prompt says, in effect:

- continue working toward the active thread goal;
- avoid repeating completed work;
- choose the next concrete action;
- before deciding the goal is achieved, perform a completion audit;
- map requirements to concrete evidence;
- inspect real files, command output, test results, PR state, or other evidence;
- do not accept proxy signals as completion;
- treat uncertainty as not achieved;
- only call `update_goal` if the goal is actually complete.

This gives `goal.ts` the feel of an auto-continuing objective loop.

### Strengths

`goal.ts` is strong as a generic runtime substrate:

- Session-native persistence.
- Clean pause/resume/clear controls.
- Good status UI.
- Automatic continuation.
- Token/time accounting.
- Context cleanup.
- Explicit distinction between user-controlled status changes and model-controlled completion.
- Good prompt-injection hygiene around objective text.
- A strong anti-premature-completion audit prompt.

### Concerns

For ambiguous, high-backpressure tasks, `goal.ts` is incomplete:

- It auto-continues indefinitely unless completed, paused, cleared, or token-limited.
- It has no hard turn cap.
- It has no evaluator/worker split.
- The same model doing the work decides when to call `update_goal`.
- It has no required per-turn evidence ledger.
- It has no criteria file.
- It has no machine-checkable acceptance condition.
- It has no stop-without-target summary behavior.
- It does not track hypotheses, failed attempts, or artifacts.
- `/goal` itself does not parse token budgets; token budgets are only exposed through `create_goal`.

## The prior ADF goal-loop pattern

The archived ADF pattern was used for an ambiguous performance optimization task: beat ADF wall time on bson, json, and tsv formats while preserving correctness.

Its structure was more like an experimental harness than a generic goal mode.

### Key parts

The ADF loop had:

1. **Objective**
   - Beat fixed ADF wall-time baselines for bson/json/tsv.

2. **Criteria file**
   - Frozen baselines.
   - Target thresholds.
   - Measurement procedure.
   - Correctness gate.
   - Done condition.
   - Out-of-bounds changes.
   - Hypothesis ladder.
   - Required artifacts.
   - Stop-without-target behavior.

3. **Append-only evaluation log**
   - One block per attempt/turn.
   - Captured hypothesis, changes, build result, measurement, harness result, verdict, and next step.

4. **Load-bearing transcript summary line**
   - Each turn printed a summary line like:

   ```text
   bson=<ms> json=<ms> tsv=<ms> harness=PASS|FAIL
   ```

   This made the evaluator's job easier and made each turn produce visible evidence.

5. **External evaluator**
   - A smaller/evaluator model checked after each turn whether the done condition held.

6. **Hard turn cap**
   - Stop after 15 turns.

7. **Stop-without-target summary**
   - If the target was not met by the cap, append a final summary describing tried hypotheses, best results, and remaining promising work.

### Why this worked well

The ADF pattern created strong backpressure against common agent failure modes:

- wandering;
- repeating failed ideas;
- optimizing the wrong metric;
- changing the benchmark instead of the implementation;
- claiming success from weak evidence;
- ignoring correctness gates;
- losing track of what had already been tried;
- failing to produce a useful failure summary.

The agent had freedom to explore, but every turn was pinned to external evidence.

## Comparison: `goal.ts` vs criteria-driven goal loop

| Dimension | `goal.ts` | Archived ADF goal loop |
|---|---|---|
| Primary purpose | Generic long-running objective pursuit | Bounded experimental search against objective criteria |
| State | Pi session custom entries | Markdown criteria/log artifacts plus harness output |
| Stop decision | Worker model calls `update_goal` | Separate evaluator checks evidence |
| Loop bound | Token budget only | Hard turn cap |
| Per-turn evidence | Not required | Required log block and summary line |
| Acceptance criteria | Objective text + model audit | Criteria file with concrete thresholds/gates |
| Search strategy | “Choose next concrete action” | Hypothesis ladder |
| Backpressure | Completion-audit prompt | Measurements, harness pass/fail, log schema, evaluator |
| Failure behavior | Budget-limited or paused | Stop-without-target summary |
| Best fit | Keep pursuing a broad task | Ambiguous tasks with measurable or inspectable success conditions |

The key distinction:

- `goal.ts` asks the working agent: **“Are you done? If so, mark complete.”**
- The ADF pattern asks an evaluator/environment: **“Does the latest evidence satisfy the contract? If so, stop.”**

For ambiguous tasks that need acceptance criteria or operational backpressure, the second pattern is stronger.

## The best combined direction

The likely useful direction is not to tie this to the deep-work pipeline. Instead, build a standalone goal-loop capability for ambiguous tasks where we can define acceptance criteria or backpressure.

The design should combine:

- `goal.ts` runtime mechanics;
- criteria/log/evaluator/turn-cap mechanics from the ADF pattern.

### Layering

Think of it as two layers:

1. **Goal runtime substrate**
   - create/pause/resume/clear;
   - persist state;
   - show status UI;
   - inject current goal context;
   - queue continuation;
   - track time/tokens/turns.

2. **Evaluation protocol**
   - criteria file;
   - acceptance condition;
   - evaluator;
   - per-turn log schema;
   - max turns;
   - stop-without-target summary;
   - optional deterministic parsing of machine-readable reports.

`goal.ts` mostly implements layer 1. The ADF pattern mostly implements layer 2.

## Candidate use cases

This goal-loop design is best for ambiguous but evaluable tasks, for example:

- Performance optimization:
  - “Make benchmark X faster than baseline Y without breaking correctness.”
- Flaky test reduction:
  - “Reduce failure rate from 12% to <1% across 100 runs.”
- Reproduction-driven debugging:
  - “Fix intermittent crash; done when repro fails 100 consecutive times and regression test passes.”
- Migration cleanup:
  - “Remove deprecated API; done when verifier reports zero usages and tests pass.”
- Dependency upgrades:
  - “Upgrade package X; done when app boots, tests pass, and warnings are gone.”
- Operational correctness:
  - “Run scenario suite; done when APIs pass and logs show no errors for relevant correlation IDs.”

These are not deep-work phase loops. They are acceptance/backpressure loops.

## Proposed future command shape

Possible command forms:

```text
/goal <objective>
/goal pause
/goal resume
/goal clear
/goal status
```

For criteria-driven loops:

```text
/goal-loop \
  --criteria docs/perf-improvement/evaluation_criteria.md \
  --log docs/perf-improvement/evaluation_log.md \
  --max-turns 15 \
  "Beat ADF wall_ms on bson/json/tsv"
```

Or an extended `/goal`:

```text
/goal --criteria docs/perf-improvement/evaluation_criteria.md \
      --log docs/perf-improvement/evaluation_log.md \
      --max-turns 15 \
      <objective>
```

The exact command surface is undecided. A separate `/goal-loop` may be cleaner than overloading `/goal`.

## Proposed state extensions

`goal.ts`'s state could be extended from a freeform goal to a criteria-loop goal:

```ts
interface Goal {
  id: string;
  objective: string;
  status: GoalStatus;
  mode: "freeform" | "criteria-loop";

  tokenBudget?: number;
  maxTurns?: number;
  turnsUsed: number;

  criteriaPath?: string;
  logPath?: string;
  summaryLinePattern?: string;

  lastEvaluatorVerdict?: "continue" | "done" | "stop" | "blocked";
  lastEvaluatorReason?: string;

  tokensUsed: number;
  timeUsedSeconds: number;
  createdAt: number;
  updatedAt: number;
}
```

Additional statuses may be useful:

```ts
type GoalStatus =
  | "active"
  | "paused"
  | "blocked"
  | "budgetLimited"
  | "turnLimited"
  | "needsUser"
  | "complete"
  | "failed";
```

`turnLimited` is especially important: hitting a max-turn cap is not the same as success or token-budget exhaustion.

## Proposed loop flow

For freeform mode, current `goal.ts` behavior is reasonable:

```text
agent ends → account usage → if active, queue continuation
```

For criteria-loop mode, it should instead be:

```text
agent ends
→ account usage
→ increment turns
→ run evaluator
→ persist evaluator verdict
→ if done: mark complete
→ else if blocked: pause/block and notify user
→ else if turn cap reached: request stop-without-target summary and stop
→ else if continue: queue continuation
```

The key change is that continuation should be gated by the evaluator.

## Evaluator options

### Deterministic evaluator

For simple numeric criteria, parse machine-readable output or a summary line.

Example:

```text
bson=3267 json=6826 tsv=4664 harness=PASS
```

Then evaluate:

```ts
done =
  bson < 5321 &&
  json < 10012 &&
  tsv < 9475 &&
  harness === "PASS";
```

This is cheap and reliable, but less flexible.

### Model evaluator

Call a smaller/cheaper model after every turn with:

- objective;
- criteria file;
- latest log block;
- relevant transcript tail;
- turn count and budget.

Require strict JSON output:

```json
{
  "verdict": "continue",
  "reason": "bson and json pass but tsv is still above target",
  "evidence": ["..."],
  "missing": ["..."]
}
```

Possible verdicts:

```text
continue | done | stop_without_target | blocked | needs_user
```

This is flexible and closer to the prior ADF harness, but costs tokens and can itself be wrong.

### Hybrid evaluator

Use deterministic checks when possible and model evaluation for ambiguous criteria.

This is likely the best long-term direction.

## Continuation prompt changes for criteria loops

The current `goal.ts` continuation prompt is generic. For criteria-driven loops it should be more operational:

```text
Continue one iteration of the criteria-driven goal loop.

You must:
1. Read the criteria file.
2. Read the latest block of the evaluation log.
3. Identify the current best result and attempted hypotheses.
4. Select exactly one next hypothesis.
5. Make the smallest relevant change.
6. Run the required build/check/measurement commands.
7. Append exactly one log block in the documented schema.
8. Print the required summary line.
9. Do not claim completion; the evaluator will decide.
```

That last line is important: in criteria-loop mode, the worker should not be the final judge.

## Stop-without-target behavior

A goal loop should make failure productive. If the max turn count is reached without satisfying the criteria, the extension should queue a final summarization turn:

```text
The goal loop reached its max turn count without meeting the criteria.
Read the criteria file and evaluation log.
Append the required stop-without-target summary block.
Do not make further code changes.
Summarize:
- hypotheses tried;
- best result per metric;
- best run IDs/artifacts;
- untried hypotheses ranked by expected impact;
- recommended seed for the next session.
```

Then status should become something like `turnLimited` or `failed`, not `complete`.

## Relationship to property-based testing idea

There is overlap with an AI-assisted property-based testing/backpressure harness, but that should be treated as a later extension of this idea.

The future property-testing concept likely has these pieces:

- case generator;
- runner;
- backpressure/evaluator stack;
- harness generator;
- possibly reducer/shrinker.

That would fit underneath this goal-loop runtime:

```text
Goal loop = persistence, continuation, status, evaluator gating
Property harness = generated cases, runner, backpressure probes, reports
Evaluator = decides continue/done/blocked from evidence
Agent = builds harness, fixes code, interprets failures
```

For now, keep the scope on the goal loop. The property-testing system can circle back later as a specialized backpressure engine that runs inside a criteria-driven goal loop.

## Near-term recommendation

Do not install `goal.ts` blindly as-is for high-backpressure tasks. Instead:

1. Treat `goal.ts` as a reference implementation for Pi-native goal runtime mechanics.
2. Preserve its good ideas:
   - session-entry persistence;
   - status footer;
   - pause/resume/clear;
   - hidden continuation;
   - context cleanup;
   - objective-as-untrusted-data;
   - time/token accounting.
3. Add missing criteria-loop ideas:
   - max turns;
   - criteria/log paths;
   - evaluator after each turn;
   - per-turn evidence requirements;
   - evaluator-gated continuation;
   - stop-without-target summary.
4. Keep it decoupled from the deep-work pipeline.
5. Position it for ambiguous, evaluable tasks where the agent can build or follow acceptance criteria and receive backpressure from real evidence.
