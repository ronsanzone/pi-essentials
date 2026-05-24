#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import time


def sum_squares(n: int) -> int:
    values: list[int] = []
    for i in range(1, n + 1):
        values = values + [i * i]

    total = 0
    for value in values:
        total += int(math.sqrt(value) ** 2)
    return total


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=30_000)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    started = time.perf_counter()
    result = sum_squares(args.n)
    elapsed_ms = (time.perf_counter() - started) * 1000

    payload = {
        "n": args.n,
        "result": result,
        "elapsed_ms": round(elapsed_ms, 3),
    }
    if args.json:
        print(json.dumps(payload, sort_keys=True))
    else:
        print(f"n={args.n} result={result} elapsed_ms={elapsed_ms:.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
