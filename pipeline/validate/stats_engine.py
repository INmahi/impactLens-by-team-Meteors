"""Bridge to the real stats engine (packages/stats, TypeScript) through Node.

Never re-implement the statistics in Python: every TrendReport comes from
analyzeTrend() via pipeline/validate/recompute_stats.ts. The synthetic generator
(M2 part c) should call run_analyze() to write the stats files.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path
from typing import Any

SCRIPT = Path(__file__).resolve().with_name("recompute_stats.ts")
NONFINITE = {"NaN", "Infinity", "-Infinity"}


class StatsEngineError(RuntimeError):
    """Node is missing or the engine script failed as a whole."""


def find_node() -> str:
    node = shutil.which("node")
    if node is None:
        raise StatsEngineError("node not found on PATH (Node 22.18 or later is required)")
    return node


def run_analyze(inputs: list[dict[str, Any]], timeout: float = 600.0) -> list[dict[str, Any]]:
    """Run analyzeTrend() on every TrendInput in one Node process.

    Returns one dict per input, in order: {"ok": True, "report": {...}} or
    {"ok": False, "error": "..."}. Non-finite numbers in a report come back as
    the strings "NaN", "Infinity" or "-Infinity".
    """
    if not inputs:
        return []
    node = find_node()
    try:
        proc = subprocess.run(
            [node, str(SCRIPT)],
            input=json.dumps(inputs, allow_nan=False).encode("utf-8"),
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise StatsEngineError(f"stats engine timed out after {timeout:.0f} s") from exc
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip()
        raise StatsEngineError(f"stats engine exited with code {proc.returncode}: {err[-2000:]}")
    try:
        results = json.loads(proc.stdout.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise StatsEngineError(f"stats engine wrote invalid JSON: {exc}") from exc
    if not isinstance(results, list) or len(results) != len(inputs):
        raise StatsEngineError("stats engine returned the wrong number of results")
    return results


def stats_file_content(variable: str, region: str, synthetic: bool, report: dict[str, Any]) -> dict[str, Any]:
    """The stats/{region}__default.json document for one engine report."""
    return {"variable": variable, "region": region, "synthetic": synthetic, **report}
