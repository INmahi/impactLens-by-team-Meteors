"""Stand-in NASA_SSH_GMSL_INDICATOR.txt (synthetic, real layout).

Layout per docs/datasets/sea-level-altimetry.md: 42 header lines all starting with
"HDR", a header-end line, one blank line, then rows formatted exactly as the producer
does: f"{time:<12.7f} {gmsl:>12f} {smoothed_gmsl:>12f}" (decimal year, cm, cm; 60-day
smoothed column, nan at the ends). GMSL is zero-centred on the 1993 calendar year.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np

from ..ingest.gmsl import datetime_to_decimal_year

MISSING_FLAG = "9.96921E36"


def header_lines(created: date, end_marker: str = "Header_End") -> list[str]:
    body = [
        "NASA-SSH Global Mean Sea Level (GMSL) from Gridded Sea Surface Height -- SYNTHETIC STAND-IN, not NASA data",
        "",
        "Global mean sea level in cm from the reference missions (TOPEX/Poseidon, Jason-1, OSTM/Jason-2,",
        "Jason-3, Sentinel-6 Michael Freilich), computed from the NASA-SSH Version 1.1 gridded product.",
        "Each value is the area-weighted average of one map. Maps use 10 days of data every 7 days.",
        "A 60-day smoothed version is also given.",
        "GMSL is zero-centered on the 1993 calendar year.",
        "Experts: no GIA applied.",
        "",
        "Citation: NASA-SSH (2025). Global Mean Sea Level Indicator. Version 1. DOI 10.5067/NSIND-GMSV1.",
        "Accessed <YYYY-MM-DD>.",
        "",
        f"This file was created on {created:%Y-%m-%d}",
        "",
    ]
    body += [""] * (42 - len(body) - 9)
    body += [
        "----------------------------------------------------------------",
        "GMSL",
        "Column description:",
        "  1 Year plus fraction of year",
        "  2 GMSL (cm)",
        "  3 GMSL (cm), 60-day smoothed",
        "",
        f"Missing or bad value flag: {MISSING_FLAG}",
        end_marker,
    ]
    assert len(body) == 42
    return [("HDR " + s).rstrip() for s in body]


def write_gmsl(path: Path, labels: list[date], values_mm: list[float], *, missing: str = "nan",
               created: date = date(2026, 11, 9), end_marker: str = "Header_End") -> Path:
    """`values_mm` per weekly map (NaN = no map); written in cm, zero-centred on 1993."""
    t = np.array([datetime_to_decimal_year(datetime(d.year, d.month, d.day) + timedelta(minutes=4)) for d in labels])
    v = np.array(values_mm, dtype=float) / 10.0
    ref_year = 1993 if ((t >= 1993) & (t < 1994)).any() else int(np.floor(t[0]))  # short sample sets
    in_ref = (t >= ref_year) & (t < ref_year + 1) & np.isfinite(v)
    v = v - v[in_ref].mean()
    smooth = np.full_like(v, np.nan)
    for i in range(4, len(v) - 4):                      # +-28 days = +-4 weekly rows
        win = v[i - 4:i + 5]
        if np.isfinite(win).sum() >= 5:
            smooth[i] = np.nanmean(win)

    def fmt(x: float) -> str:
        if np.isfinite(x):
            return f"{x:>12f}"
        return f"{MISSING_FLAG:>12}" if missing == "flag" else f"{float('nan'):>12f}"

    lines = header_lines(created, end_marker) + [""]
    lines += [f"{ti:<12.7f} {fmt(vi)} {fmt(si)}" for ti, vi, si in zip(t, v, smooth)]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    return Path(path)
