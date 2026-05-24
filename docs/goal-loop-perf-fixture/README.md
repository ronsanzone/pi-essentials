# Goal-loop performance fixture

This fixture is a small end-to-end test target for the Pi `/goal-loop` extension.

## Files

- `fixtures/goal-loop-perf/slow_counter.py` — intentionally slow CLI under test.
- `fixtures/goal-loop-perf/benchmark.py` — measurement harness. Do not edit during the loop.
- `fixtures/goal-loop-perf/test_correctness.py` — correctness gate. Do not edit during the loop.
- `docs/goal-loop-perf-fixture/evaluation_criteria.md` — criteria contract.
- `docs/goal-loop-perf-fixture/evaluation_log.md` — append-only attempt log.

## Baseline

Current baseline on this machine was around:

```text
median_ms=832.544 correctness=PASS
```

Target:

```text
median_ms < 1.0 correctness=PASS
```

## Manual commands

Correctness:

```bash
python3 fixtures/goal-loop-perf/test_correctness.py
```

Benchmark:

```bash
python3 fixtures/goal-loop-perf/benchmark.py --n 30000 --iters 5 --target-ms 1
```

## Goal-loop command

After `/reload`, run:

```text
/goal-loop --criteria docs/goal-loop-perf-fixture/evaluation_criteria.md --log docs/goal-loop-perf-fixture/evaluation_log.md --max-turns 4 "Optimize the slow_counter fixture so median_ms is below 1.0 while preserving correctness"
```

Expected behavior:

1. The worker reads criteria and log.
2. It inspects `slow_counter.py`.
3. It discovers one performance issue at a time.
4. It edits only `slow_counter.py`.
5. It runs correctness and benchmark.
6. It appends one log block per attempt.
7. The evaluator returns `continue` until the latest log block shows `median_ms < 1.0` and `Correctness: PASS`, then returns `done`.

## Reset fixture

To reset after a run:

```bash
git checkout -- fixtures/goal-loop-perf/slow_counter.py docs/goal-loop-perf-fixture/evaluation_log.md
rm -f docs/goal-loop-perf-fixture/evaluation_log.md.goal-loop-*.state.json
```
