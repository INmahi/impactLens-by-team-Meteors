"""Synthetic stand-ins for the raw downloads, written in the real file layouts.

Real downloads and stand-ins go through the same ingest code (pipeline/ingest).
A `standin.json` marker next to stand-in files labels the output synthetic and
carries the injected truth; real downloads never have it.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Any

from ..ingest.docs import write_marker
from .gmsl import write_gmsl
from .imbie import write_imbie_standins
from .ssh import SSHStandin, week_labels, write_week

__all__ = ["SSHStandin", "write_gmsl", "write_imbie_standins", "write_sea_level_standins", "write_week"]


def write_sea_level_standins(out_dir: Path, topo: dict[str, Any], seed: int, first: date, last: date) -> list[Path]:
    """Weekly grid files for labels first..last, the GMSL text for the same weeks, and the marker.

    Truth (trend phase, noise) is the full-record truth, cut to the span, so a short sample
    set matches the same weeks of the in-memory synthetic build exactly.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    st = SSHStandin(seed, topo)
    idx = [i for i, d in enumerate(st.labels) if first <= d <= last]
    if not idx:
        raise ValueError(f"no weekly labels between {first} and {last} (labels are Mondays from {st.labels[0]})")
    paths = [write_week(st.raw_week(i), out_dir, counts_seed=seed) for i in idx]
    write_gmsl(out_dir / "NASA_SSH_GMSL_INDICATOR.txt", [st.labels[i] for i in idx],
               [st.indicator_mm(i) for i in idx])
    write_marker(out_dir, st.marker_series(), seed=seed, dataset="NASA-SSH V1.1 grid + GMSL indicator stand-in",
                 span=[str(st.labels[idx[0]]), str(st.labels[idx[-1]])])
    return paths


def full_labels() -> list[date]:
    return week_labels()
