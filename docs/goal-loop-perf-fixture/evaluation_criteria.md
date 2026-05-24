# Goal-loop fixture evaluation criteria — optimize slow_counter

This is a contrived acceptance/backpressure fixture for testing the Pi `/goal-loop` extension.

## Objective

Make `fixtures/goal-loop-perf/slow_counter.py` compute the same sum-of-squares result faster than the target threshold.

## Target

The goal is met when the latest evaluation log block shows:

- `median_ms < 1.0`, and
- `correctness: PASS`.

## Measurement procedure

Use this benchmark command for each attempt:

```bash
python3 fixtures/goal-loop-perf/benchmark.py --n 30000 --iters 5 --target-ms 1
```

The command exits 0 only if correctness passes and median runtime is below the target. It prints JSON with `median_ms`, `p95_ms`, and `correct`.

For a quick signal during exploration, `--iters 3` is acceptable, but a final done claim should use `--iters 5`.

## Correctness gate

Run:

```bash
python3 fixtures/goal-loop-perf/test_correctness.py
```

It must print:

```text
correctness=PASS
```

## In-bounds changes

Fair game:

- `fixtures/goal-loop-perf/slow_counter.py`

Out of bounds:

- `fixtures/goal-loop-perf/benchmark.py`
- `fixtures/goal-loop-perf/test_correctness.py`
- this criteria file
- changing benchmark arguments in the final claim
- weakening correctness expectations

## Hypothesis ladder

Try in this order:

1. Inspect `sum_squares` for unnecessary allocation or repeated copying.
2. If the first improvement is still above target, inspect the remaining loop for unnecessary per-item work.
3. If still above target, consider whether the computation has an equivalent direct formula that preserves integer results for all tested inputs.

Only make one coherent optimization per loop iteration. The fixture is intentionally structured so the first obvious improvement may not be enough to meet the final target.

## Required log block schema

Append exactly one block to `docs/goal-loop-perf-fixture/evaluation_log.md` per attempt:

```markdown
## <UTC timestamp YYYY-MM-DDTHH:MM:SSZ> · attempt <N>

**Hypothesis:** <one sentence>
**Change:**
- <file>: <what changed, or none>
**Correctness:** PASS | FAIL
**Measurement:** median_ms <X> · p95_ms <Y> · target_ms 1.0
**Benchmark command:** `<command>`
**Verdict:** continue | done | revert
**Next:** <one sentence; only if verdict == continue>
```

## Required summary line

End each worker iteration with exactly one summary line:

```text
median_ms=<X> correctness=PASS|FAIL
```

## Stop-without-target behavior

If the loop reaches the max turn count without meeting the target, append a final summary block listing:

- hypotheses tried;
- best median_ms and attempt number;
- likely remaining issue;
- recommended next step.
