"""IMBIE 2026 per-region CSV -> ice_mass (monthly cumulative + sigma) and ice_mass_rate (annual).

Layout (docs/datasets/imbie.md, "Raw file layout"): one region per file,
`imbie3_<location>_Gt_partitioned.csv`, monthly rows, 13 columns. Robust to the
card's UNVERIFIED items:
- columns are found by lower-case KEYWORDS, never by position or exact text, and a
  missing or ambiguous required column is a loud error;
- dates are decimal years (month = floor(frac * 12 + 0.25) + 1, so k/12 steps rounded
  either way and mid-month (k + 0.5)/12 steps all land in month k + 1) or ISO `YYYY-MM[-DD]`;
- leading `#` comment lines and blank lines are skipped; the header is the first row
  that names at least two "mass balance" columns (the date column can be anywhere);
- empty, `nan` and >= 1e30 cells are missing.
ice_mass_rate is ANNUAL: the mean of the monthly rate rows of a calendar year with
all 12 months present (rates are never recomputed by differencing). Edge years with
fewer months are left out (no padding); an interior incomplete year is null.
"""

from __future__ import annotations

import csv
import io
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

from .grid import FILL_THRESHOLD, IngestError

LOCATIONS = {
    "greenland": "greenland",
    "antarctica": "antarctica",
    "east_antarctica": "antarctica_east",
    "west_antarctica": "antarctica_west",
    "antarctic_peninsula": "antarctica_peninsula",
}
IMBIE_FILE = re.compile(r"^imbie3?_(?P<loc>.+?)_(?:Gt_partitioned|partitioned_Gt)\.csv$", re.I)

EXCLUDE = ("surface", "dynamic")


@dataclass
class ImbieTable:
    region: str
    months: list[str]                    # YYYY-MM, ascending, contiguous
    rate: list[float | None]             # Gt/yr per month row
    rate_sigma: list[float | None]
    cumulative: list[float | None]       # Gt
    cumulative_sigma: list[float | None]
    columns: dict[str, str]              # role -> header text used


def region_for_file(path: Path) -> str | None:
    m = IMBIE_FILE.match(Path(path).name)
    if not m:
        return None
    return LOCATIONS.get(m.group("loc").lower())


def parse_date(cell: str) -> tuple[int, int]:
    s = cell.strip().strip('"')
    try:
        y = float(s)
    except ValueError:
        y = None
    if y is not None and 1900.0 <= y < 2100.0 and not re.fullmatch(r"\d{4}-\d{2}(-\d{2})?", s):
        year = int(math.floor(y))
        month = int(math.floor((y - year) * 12 + 0.25)) + 1
        return year, min(month, 12)
    m = re.fullmatch(r"(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[ T].*)?", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    raise IngestError(f"date {cell!r} is neither a decimal year nor ISO YYYY-MM[-DD]")


def _num(cell: str) -> float | None:
    s = cell.strip().strip('"')
    if s == "" or s.lower() in ("nan", "na", "n/a", "null", "none"):
        return None
    v = float(s)
    return None if not math.isfinite(v) or abs(v) >= FILL_THRESHOLD else v


def _pick(headers: list[str], role: str, need: tuple[str, ...], avoid: tuple[str, ...]) -> int:
    low = [h.lower() for h in headers]
    hits = [i for i, h in enumerate(low) if all(k in h for k in need) and not any(k in h for k in avoid)]
    if len(hits) != 1:
        raise IngestError(f"IMBIE column for {role}: expected exactly one header containing {list(need)} "
                          f"and none of {list(avoid)}; found {[headers[i] for i in hits]} in {headers}")
    return hits[0]


def find_columns(headers: list[str]) -> dict[str, int]:
    low = [h.lower() for h in headers]
    dates = [i for i, h in enumerate(low) if "date" in h or h.strip() in ("year", "time") or "decimal year" in h]
    if len(dates) != 1:
        raise IngestError(f"IMBIE date column: expected one header with 'date' or 'year'; headers {headers}")
    base = ("mass balance",)
    return {
        "date": dates[0],
        "rate": _pick(headers, "mass balance rate", base, ("cumulative", "uncertainty") + EXCLUDE),
        "rate_sigma": _pick(headers, "mass balance uncertainty", base + ("uncertainty",), ("cumulative",) + EXCLUDE),
        "cumulative": _pick(headers, "cumulative mass balance", ("cumulative",) + base, ("uncertainty",) + EXCLUDE),
        "cumulative_sigma": _pick(headers, "cumulative uncertainty", ("cumulative", "uncertainty") + base, EXCLUDE),
    }


def parse_imbie_csv(text: str, region: str, name: str = "") -> ImbieTable:
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    rows = list(csv.reader(io.StringIO("\n".join(lines))))
    # The header is the first row naming at least two "mass balance" columns. Never test the
    # first cell for a date: with shuffled columns the date is not in column 1.
    header_i = next((i for i, row in enumerate(rows)
                     if sum("mass balance" in c.lower() for c in row) >= 2), None)
    if header_i is None:
        raise IngestError(f"{name}: no header row found (no row names two 'mass balance' columns)")
    headers = [h.strip() for h in rows[header_i]]
    for h in headers:
        hl = h.lower()
        if "(mm" in hl:
            raise IngestError(f"{name}: column {h!r} is in mm; use the Gt file")
    cols = find_columns(headers)
    by_month: dict[tuple[int, int], dict[str, float | None]] = {}
    for row in rows[header_i + 1:]:
        if len(row) < len(headers):
            raise IngestError(f"{name}: short row {row}")
        key = parse_date(row[cols["date"]])
        if key in by_month:
            raise IngestError(f"{name}: two rows for {key[0]:04d}-{key[1]:02d}")
        by_month[key] = {role: _num(row[i]) for role, i in cols.items() if role != "date"}
    if not by_month:
        raise IngestError(f"{name}: no data rows")
    (y, m), last = min(by_month), max(by_month)
    out = ImbieTable(region, [], [], [], [], [], {r: headers[i] for r, i in cols.items()})
    while (y, m) <= last:
        rec = by_month.get((y, m), {})
        out.months.append(f"{y:04d}-{m:02d}")
        for role in ("rate", "rate_sigma", "cumulative", "cumulative_sigma"):
            getattr(out, role).append(rec.get(role))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def read_imbie_csv(path: Path) -> ImbieTable:
    path = Path(path)
    region = region_for_file(path)
    if region is None:
        raise IngestError(f"{path.name}: not an IMBIE Gt file name (imbie3_<location>_Gt_partitioned.csv)")
    return parse_imbie_csv(path.read_text(encoding="utf-8-sig"), region, path.name)


def list_imbie_files(raw: Path) -> list[Path]:
    return sorted(p for p in Path(raw).iterdir() if region_for_file(p) is not None)


def annual_rate(t: ImbieTable) -> tuple[list[str], list[float | None], list[float | None]]:
    """Calendar-year means of the monthly rate rows; a year needs all 12 months."""
    years: dict[int, list[tuple[float | None, float | None]]] = {}
    for mo, r, s in zip(t.months, t.rate, t.rate_sigma):
        years.setdefault(int(mo[:4]), []).append((r, s))
    full = {}
    for y, recs in years.items():
        if len(recs) == 12 and all(r is not None for r, _s in recs):
            rate = sum(r for r, _s in recs) / 12  # type: ignore[misc]
            sig = [s for _r, s in recs if s is not None]
            full[y] = (rate, sum(sig) / len(sig) if len(sig) == 12 else None)
    if not full:
        return [], [], []
    ys = list(range(min(full), max(full) + 1))
    return ([f"{y:04d}" for y in ys], [full[y][0] if y in full else None for y in ys],
            [full[y][1] if y in full else None for y in ys])


def year_month(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"
