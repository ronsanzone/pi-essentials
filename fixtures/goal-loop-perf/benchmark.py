#!/usr/bin/env python3
"""Benchmark harness for the goal-loop performance fixture."""

from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CLI = ROOT / "slow_counter.py"


def expected_sum_squares(n: int) -> int:
    return n * (n + 1) * (2 * n + 1) // 6


def run_once(n: int) -> dict[str, object]:
    proc = subprocess.run(
        [sys.executable, str(CLI), "--n", str(n), "--json"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=True,
    )
    data = json.loads(proc.stdout)
    expected = expected_sum_squares(n)
    return {
        "n": n,
        "result": data["result"],
        "expected": expected,
        "correct": data["result"] == expected,
        "elapsed_ms": float(data["elapsed_ms"]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=30_000)
    parser.add_argument("--iters", type=int, default=5)
    parser.add_argument("--target-ms", type=float, default=75.0)
    args = parser.parse_args()

    runs = [run_once(args.n) for _ in range(args.iters)]
    times = [float(r["elapsed_ms"]) for r in runs]
    median = statistics.median(times)
    p95 = max(times) if len(times) < 20 else statistics.quantiles(times, n=20)[18]
    correct = all(bool(r["correct"]) for r in runs)
    passed = correct and median < args.target_ms

    print(json.dumps({
        "n": args.n,
        "iters": args.iters,
        "target_ms": args.target_ms,
        "median_ms": round(median, 3),
        "p95_ms": round(p95, 3),
        "correct": correct,
        "passed": passed,
        "runs": runs,
    }, indent=2, sort_keys=True))
    return 0 if passed else 2


if __name__ == "__main__":
    raise SystemExit(main())
