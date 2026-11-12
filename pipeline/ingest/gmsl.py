"""NASA-SSH GMSL indicator text file -> weekly and monthly global mean sea level.

Used only as a CROSS-CHECK against the global mean computed from the grids
(docs/datasets/sea-level-altimetry.md, "Raw file layout"). Robust to the card's
UNVERIFIED items: the header is every leading line starting with "HDR" (never a
fixed count or end-marker text); blank lines are skipped; `nan` and any value
>= 1e30 (9.96921E36) are missing; units are cm unless the header says mm or m.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

from .grid import FILL_THRESHOLD, IngestError, monthly_from_weekly

GMSL_FILE = re.compile(r"NASA_SSH_GMSL_INDICATOR(?:_(\d{8}))?\.txt$")


def decimal_year_to_datetime(y: float) -> datetime:
    """Leap-aware decimal year to a datetime, rounded to the nearest minute."""
    year = int(np.floor(y))
    start = datetime(year, 1, 1)
    length = datetime(year + 1, 1, 1) - start
    dt = start + timedelta(seconds=(y - year) * length.total_seconds())
    return (dt + timedelta(seconds=30)).replace(second=0, microsecond=0)


def datetime_to_decimal_year(dt: datetime) -> float:
    start = datetime(dt.year, 1, 1)
    length = (datetime(dt.year + 1, 1, 1) - start).total_seconds()
    return dt.year + (dt - start).total_seconds() / length


def parse_gmsl(text: str) -> tuple[list[datetime], list[float | None], list[str], float]:
    """Returns (times, gmsl values in mm, header lines, factor used to reach mm)."""
    header: list[str] = []
    times: list[datetime] = []
    values: list[float | None] = []
    in_header = True
    for n, line in enumerate(text.splitlines(), 1):
        if in_header and line.startswith("HDR"):
            header.append(line)
            continue
        in_header = False
        if not line.strip() or line.startswith("HDR"):
            continue
        parts = line.split()
        if len(parts) < 2:
            raise IngestError(f"GMSL line {n}: expected at least 2 columns, got {line!r}")
        try:
            t = float(parts[0])
            v = float(parts[1])
        except ValueError as exc:
            raise IngestError(f"GMSL line {n}: {exc}") from exc
        times.append(decimal_year_to_datetime(t))
        values.append(None if not np.isfinite(v) or abs(v) >= FILL_THRESHOLD else v)
    if not times:
        raise IngestError("GMSL file has no data rows")
    if any(b <= a for a, b in zip(times, times[1:])):
        raise IngestError("GMSL times are not strictly ascending")
    head = " ".join(header).lower()
    if re.search(r"\bin mm\b|\(mm\)", head):
        factor = 1.0
    elif re.search(r"\bin m\b|\(m\)", head) and "cm" not in head:
        factor = 1000.0
    else:
        factor = 10.0  # cm (card)
    return times, [None if v is None else v * factor for v in values], header, factor


def read_gmsl(path: Path) -> tuple[list[datetime], list[float | None], list[str], float]:
    return parse_gmsl(Path(path).read_text(encoding="utf-8", errors="replace"))


def gmsl_monthly(path: Path) -> tuple[list[str], list[float | None]]:
    """Calendar-month means of the weekly rows (same >= 3 weeks rule as the grids), in mm."""
    times, values, _h, _f = read_gmsl(path)
    return monthly_from_weekly([t.date() for t in times], values)


def find_gmsl_file(raw: Path) -> Path | None:
    """The undated current file if present, else the latest dated snapshot."""
    files = [p for p in Path(raw).iterdir() if GMSL_FILE.search(p.name)]
    if not files:
        return None
    undated = [p for p in files if GMSL_FILE.search(p.name).group(1) is None]  # type: ignore[union-attr]
    return undated[0] if undated else sorted(files, key=lambda p: p.name)[-1]
