#!/usr/bin/env python3
"""Compute and report median, p90, and p95 latencies for GrokCall.

Follows Section 32 & 33 (Test A wake latency and conversational turn latency).
"""

import sys
import json
import sqlite3
from typing import List, Dict
import numpy as np


def analyze_latencies(db_path: str = "grokcall.db"):
    conn = sqlite3.connect(db_path)
    cur = conn.execute("SELECT latencies_json FROM calls WHERE latencies_json IS NOT NULL")
    rows = cur.fetchall()

    metrics: Dict[str, List[float]] = {
        "slack_wake_latency_ms": [],
        "grok_wake_latency_ms": [],
        "grok_inference_latency_ms": [],
        "tts_startup_latency_ms": [],
        "total_turn_latency_ms": [],
    }

    for row in rows:
        try:
            data = json.loads(row[0])
            for key, val in data.items():
                if val is not None and key in metrics:
                    metrics[key].append(val)
        except Exception:
            continue

    print("=========================================================")
    print("            GROKCALL OBSERVABILITY & LATENCY REPORT       ")
    print("=========================================================")
    print(f"Total analyzed calls: {len(rows)}\n")

    for metric, values in metrics.items():
        if not values:
            print(f"{metric:30}: No samples recorded")
            continue

        arr = np.array(values)
        p50 = np.percentile(arr, 50)
        p90 = np.percentile(arr, 90)
        p95 = np.percentile(arr, 95)
        print(f"{metric:30}: count={len(values):3d} | p50={p50:6.1f}ms | p90={p90:6.1f}ms | p95={p95:6.1f}ms")

    print("=========================================================")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "grokcall.db"
    analyze_latencies(path)
