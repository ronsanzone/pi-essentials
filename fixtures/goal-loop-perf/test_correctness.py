#!/usr/bin/env python3
from slow_counter import sum_squares


def expected(n: int) -> int:
    return n * (n + 1) * (2 * n + 1) // 6


def test_small_values() -> None:
    for n in range(0, 100):
        assert sum_squares(n) == expected(n)


def test_medium_value() -> None:
    assert sum_squares(10_000) == expected(10_000)


if __name__ == "__main__":
    test_small_values()
    test_medium_value()
    print("correctness=PASS")
