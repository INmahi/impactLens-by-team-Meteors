"""NASA POWER monthly regional precipitation (PRECTOTCORR): a CROSS-CHECK for the IMERG monsoon rainfall, not a variable.

Decision (M12, 2026-11-13): POWER rain (MERRA-2 reanalysis, bias-corrected) shows a June-September trend over Bangladesh
of +34 mm/yr (95% interval 12.9 to 56, p = 0.004) for 1998-2025, where the satellite record IMERG shows -5.7 mm/yr
(-18.4 to 5.0, p = 0.26); the intervals do not overlap and the year-to-year correlation is only 0.21. Reanalysis
rainfall trends drift with changes in the observing system, so the app uses IMERG and reports this as a validity
check (docs/datasets/imerg-monthly.md). `read_power` is kept to reproduce the check.

Raw file: `power_PRECTOTCORR_monthly_regional_<start>_<end>.json` from scripts/download_real.py (POWER Monthly and
Annual API v2.10, regional endpoint, no login). GeoJSON FeatureCollection of grid points (0.5 x 0.625 degree, the
MERRA-2 grid POWER uses for meteorology); properties.parameter.PRECTOTCORR maps "YYYYMM" -> mm/day ("YYYY13" is the
annual value and is ignored); fill value -999. Checked on the real response 2026-11-13: 104 points, 1981-01 to 2025-12.

Per month: cos(latitude)-weighted mean over the points inside the region outline x days in the month = total mm.
Monsoon = June + July + August + September; only years with all four months. No smoothing, no gap filling.
"""

from __future__ import annotations

import calendar
import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from ..synthetic.geometry import points_in_ring
from .grid import IngestError

PATTERN = "power_PRECTOTCORR_monthly_regional_*.json"
MONSOON = (6, 7, 8, 9)

SOURCE = {
    "name": "NASA POWER monthly precipitation (PRECTOTCORR, POWER API v2.10)",
    "url": "https://power.larc.nasa.gov/",
    "citation": "NASA Langley Research Center (LaRC) POWER Project, POWER Monthly and Annual API v2.10, parameter "
                "PRECTOTCORR (precipitation corrected, from NASA MERRA-2). These data were obtained from the NASA "
                "Langley Research Center POWER Project funded through the NASA Earth Science / Applied Science Program.",
    "version": "API v2.10",
    "licence": "NASA open data (POWER: no restrictions, acknowledge the POWER Project)",
    "processing": [
        "Downloaded monthly PRECTOTCORR (mm/day) for the grid points over a box around Bangladesh from the POWER "
        "regional API (values unchanged).",
        "Monthly rain = cos(latitude)-weighted mean over the points inside the Bangladesh border (Natural Earth), "
        "times the days in the month.",
        "Monsoon rainfall = June + July + August + September total; only years with all four months.",
    ],
}
NOTES = [
    "Model-based: POWER precipitation is NASA MERRA-2 reanalysis rain with a bias correction, not a direct satellite "
    "or gauge measurement. The IMERG record (1998 onward) is the satellite estimate.",
    "Longer than IMERG (from 1981), so it gives more years to detect a trend; never joined to the IMERG record.",
    "Not independent of the MERRA-2 temperature variable (same model).",
]


def read_power(raw: Path, parts: Any) -> tuple[dict[str, float], int]:
    files = sorted(Path(raw).glob(PATTERN))
    if len(files) != 1:
        raise IngestError(f"expected one {PATTERN} in {raw}, found {len(files)} (download: scripts/download_real.py power)")
    doc = json.loads(files[0].read_text(encoding="utf-8"))
    units = doc.get("parameters", {}).get("PRECTOTCORR", {}).get("units")
    if units != "mm/day":
        raise IngestError(f"{files[0].name}: PRECTOTCORR units {units!r}, expected mm/day")
    fill = doc.get("header", {}).get("fill_value", -999.0)
    pts = []
    for f in doc.get("features", []):
        lon, lat = f["geometry"]["coordinates"][:2]
        inside = any(points_in_ring(np.array([lon]), np.array([lat]), outer)[0]
                     and not any(points_in_ring(np.array([lon]), np.array([lat]), h)[0] for h in holes)
                     for outer, holes in parts)
        if inside:
            pts.append((math.cos(math.radians(lat)), f["properties"]["parameter"]["PRECTOTCORR"]))
    if not pts:
        raise IngestError("no POWER grid point falls inside the region outline")
    months = sorted({k for _, s in pts for k in s if not k.endswith("13")})
    out: dict[str, float] = {}
    for k in months:
        vals = [(w, s.get(k)) for w, s in pts]
        ok = [(w, v) for w, v in vals if v is not None and v != fill and v >= 0]
        if len(ok) < 0.9 * len(pts):
            continue
        y, m = int(k[:4]), int(k[4:])
        rate = sum(w * v for w, v in ok) / sum(w for w, _ in ok)
        out[f"{y:04d}-{m:02d}"] = rate * calendar.monthrange(y, m)[1]
    return out, len(pts)
