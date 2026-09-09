#!/usr/bin/env python3
"""Report p50/p90/p95 for the per-call latencies recorded in SQLite.

Usage: python scripts/latency_report.py [path/to/grokcall.db]

This is the measurement side of the two critical experiments in the spec:
Test A (Grok wake latency over many calls) and Test B (sustained turn latency).
"""

import json
import sqlite3
import sys
from statistics import quantiles
from typing import Dict, List

METRICS = [
    "slack_wake_latency_ms",
    "grok_wake_latency_ms",
    "grok_inference_latency_ms",
    "tts_startup_latency_ms",
    "total_turn_latency_ms",
]


def percentile(values: List[float], pct: float) -> float:
    if len(values) == 1:
        return values[0]
    # quantiles(n=100) yields the 1st..99th percentile cut points.
    cuts = quantiles(values, n=100, method="inclusive")
    return cuts[int(pct) - 1]


def analyze(db_path: str) -> None:
    conn = sqlite3.connect(db_path)
    rows = conn.execute("SELECT latencies_json FROM calls WHERE latencies_json IS NOT NULL").fetchall()

    samples: Dict[str, List[float]] = {m: [] for m in METRICS}
    for (raw,) in rows:
        try:
            data = json.loads(raw)
        except (TypeError, json.JSONDecodeError):
            continue
        for key, value in data.items():
            if key in samples and isinstance(value, (int, float)):
                samples[key].append(float(value))

    print(f"GrokCall latency report  ({len(rows)} calls in {db_path})")
    print("-" * 78)
    for metric in METRICS:
        values = sorted(samples[metric])
        if not values:
            print(f"{metric:28} no samples")
            continue
        print(
            f"{metric:28} n={len(values):4d}  "
            f"p50={percentile(values, 50):7.0f}ms  "
            f"p90={percentile(values, 90):7.0f}ms  "
            f"p95={percentile(values, 95):7.0f}ms"
        )


if __name__ == "__main__":
    analyze(sys.argv[1] if len(sys.argv) > 1 else "grokcall.db")
