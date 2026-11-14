"""GPM IMERG Final monthly V07 (Bangladesh box via OPeNDAP) -> `monsoon_rainfall` (June-September total, annual).

Raw files: `3B-MO.MS.MRG.3IMERG.<YYYYMM>01-S000000-E235959.<MM>.V07B.BD.nc4` from scripts/download_real.py, each the
group `/Grid` with `precipitation` (time 1, lon 51, lat 65) in mm/hr on the 0.1-degree grid, box 87.95-92.95 E,
20.45-26.85 N. Checked on the real files 2026-11-13. The record runs 1998-01 to 2025-09 (V07 includes the TRMM era).

Per month: area-weighted mean rate over the cells whose centre is inside the region outline, times the hours in the
month = monthly total in mm. Monsoon = June + July + August + September, only years with all four months.
No smoothing, no gap filling.
"""

from __future__ import annotations

import calendar
import re
from pathlib import Path
from typing import Any

import numpy as np

from .grid import Grid, IngestError, polygon_mask

FILE = re.compile(r"^3B-MO\.MS\.MRG\.3IMERG\.(\d{4})(\d{2})01-S000000-E235959\.\d{2}\.V07[A-Z]?\.BD\.nc4$")
MONSOON = (6, 7, 8, 9)

SOURCE = {
    "name": "NASA GPM IMERG Final monthly precipitation V07 (GPM_3IMERGM, GES DISC)",
    "url": "https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07",
    "citation": "Huffman, G.J., Stocker, E.F., Bolvin, D.T., Nelkin, E.J., Tan, J. (2023), GPM IMERG Final "
                "Precipitation L3 1 month 0.1 degree x 0.1 degree V07, Greenbelt, MD, Goddard Earth Sciences Data "
                "and Information Services Center (GES DISC), doi:10.5067/GPM/IMERG/3B-MONTH/07",
    "doi": "10.5067/GPM/IMERG/3B-MONTH/07",
    "version": "07",
    "licence": "NASA open data (GES DISC data use guidelines)",
    "processing": [
        "Downloaded only the precipitation field over a box around Bangladesh through NASA's OPeNDAP service "
        "(values unchanged).",
        "Monthly rain = area-weighted mean rate (mm/hr) over the 0.1-degree cells whose centre lies inside the "
        "Bangladesh border (Natural Earth), times the hours in the month.",
        "Monsoon rainfall = June + July + August + September total; only years with all four months.",
    ],
}
NOTES = [
    "Satellite estimate (GPM and TRMM radiometers, gauge-adjusted each month), averaged over the whole country; "
    "not the rain at any one station.",
    "1998-2014 comes from the TRMM-era satellites and 2014 onward from GPM, processed together in version 07.",
    "Monsoon rain swings a lot from year to year, so a trend needs many years to detect.",
    "IMERG cells are about 11 km, so a small district averages only a handful of them.",
    "Testing many divisions at once: about 1 test in 20 can look significant by chance alone, so check whether "
    "neighbouring divisions agree before trusting a single one.",
    "Cross-check: NASA POWER (a weather-model product) shows a rising 1998-2025 monsoon trend that this satellite "
    "record does not; model rainfall trends can drift, so the satellite record is used here.",
]


def read_monthly(raw: Path, parts: Any, log: Any = print) -> tuple[dict[str, float], int]:
    """Month (YYYY-MM) -> total rain in mm over the region; and the number of cells used."""
    import xarray as xr

    files = []
    for p in sorted(Path(raw).iterdir()):
        m = FILE.match(p.name)
        if m:
            files.append((f"{m.group(1)}-{m.group(2)}", p))
    if not files:
        raise IngestError(f"no 3B-MO...V07*.BD.nc4 files in {raw} (download: scripts/download_real.py imerg)")
    grid: Grid | None = None
    mask = None
    out: dict[str, float] = {}
    for label, path in files:
        with xr.open_dataset(path, group="Grid", decode_times=False) as ds:
            if "precipitation" not in ds.variables:
                raise IngestError(f"{path.name}: precipitation missing")
            units = str(ds["precipitation"].attrs.get("units", "")).strip()
            if units != "mm/hr":
                raise IngestError(f"{path.name}: precipitation units {units!r}, expected mm/hr")
            pr = ds["precipitation"].transpose("time", "lat", "lon").values.squeeze().astype(np.float64)
            lat, lon = ds["lat"].values, ds["lon"].values
        pr[~np.isfinite(pr) | (pr < 0)] = np.nan
        if grid is None:
            grid = Grid(lat, lon)
            mask = polygon_mask(grid, parts)
            if not mask.any():
                raise IngestError("no IMERG cell centre falls inside the region outline")
        a = grid.apply(pr)[mask]
        w = grid.weights[mask]
        ok = np.isfinite(a)
        if ok.sum() < 0.9 * mask.sum():
            log(f"warning: {label}: only {int(ok.sum())} of {int(mask.sum())} cells valid; month left out")
            continue
        y, mth = int(label[:4]), int(label[5:])
        hours = calendar.monthrange(y, mth)[1] * 24
        out[label] = float((a[ok] * w[ok]).sum() / w[ok].sum()) * hours
    assert mask is not None
    return out, int(mask.sum())


def monsoon_totals(monthly: dict[str, float]) -> tuple[list[str], list[float | None]]:
    years = sorted({int(k[:4]) for k in monthly})
    vals: dict[int, float] = {}
    for y in years:
        keys = [f"{y}-{m:02d}" for m in MONSOON]
        if all(k in monthly for k in keys):
            vals[y] = sum(monthly[k] for k in keys)
    if not vals:
        raise IngestError("no complete June-September monsoon in the IMERG files")
    ys = list(range(min(vals), max(vals) + 1))
    return [str(y) for y in ys], [vals.get(y) for y in ys]
