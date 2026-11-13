"""JPL_RECON_GMSL v1.0 (Frederikse et al. 2020) -> sea_level_long and ice_mass_long (annual, 1900-2018).

One netCDF-4 file, `global_timeseries_measures.nc` (docs/datasets/jpl-recon-gmsl.md), checked against
the real file on 2026-11-13: dimension `time` (119 mid-year steps), every variable in mm of global sea
level, with `_mean`, `_lower` and `_upper` (5-95%) members.

- sea_level_long / global: `global_average_sea_level_change` (+ lower/upper), mm, kind level.
- ice_mass_long / greenland: `GrIS_*`; antarctica: `AIS_*`. These are sea-level contributions in mm
  (positive = ice lost). Converted to ice mass change in Gt with 362 Gt = 1 mm and the sign flipped, so
  loss is negative mass like the IMBIE record; lower and upper swap under the sign flip.
No smoothing, no gap filling; years with a missing value stay null (series_doc trims only the ends).
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

from .docs import series_doc
from .grid import IngestError

FILE = "global_timeseries_measures.nc"
GT_PER_MM = 362.0
BOUNDS = "5-95%"

ICE = {"greenland": "GrIS", "antarctica": "AIS"}
SEA = "global_average_sea_level_change"


def _vals(ds: Any, name: str) -> list[float | None]:
    if name not in ds.variables:
        raise IngestError(f"{FILE}: variable {name!r} not found (has {sorted(ds.variables)})")
    units = str(ds[name].attrs.get("units", "")).strip().lower()
    if units not in ("mm", "millimeters", "millimetres"):
        raise IngestError(f"{FILE}: {name} units {units!r}, expected mm")
    out: list[float | None] = []
    for x in ds[name].values.tolist():
        out.append(None if x is None or not math.isfinite(float(x)) or abs(float(x)) >= 1e30 else float(x))
    return out


def read_recon(raw: Path) -> dict[tuple[str, str], dict[str, Any]]:
    import xarray as xr

    path = Path(raw) / FILE
    if not path.is_file():
        raise IngestError(f"{path} not found (download: uv run python scripts/download_real.py recon_gmsl)")
    try:
        ds = xr.open_dataset(path)
    except ValueError as exc:
        raise IngestError(f"{FILE}: cannot open ({exc}); needs the h5netcdf package") from exc
    with ds:
        years = [str(t)[:4] for t in ds["time"].values]
        if len(set(years)) != len(years):
            raise IngestError(f"{FILE}: time is not one value per year")
        seg = f"JPL_RECON_GMSL v1.0 ({FILE})"
        docs: dict[tuple[str, str], dict[str, Any]] = {}

        doc = series_doc(variable="sea_level_long", region="global", units="mm", frequency="annual", kind="level",
                         dates=years, values=_vals(ds, f"{SEA}"), segment_source=f"{seg}, {SEA}",
                         synthetic=False, decimals=2)
        _bounds(doc, years, _vals(ds, f"{SEA}_lower"), _vals(ds, f"{SEA}_upper"), 1.0, 2)
        docs[("sea_level_long", "global")] = doc

        for region, key in ICE.items():
            mm = _vals(ds, f"{key}_mean")
            gt = [None if v is None else -v * GT_PER_MM for v in mm]
            doc = series_doc(variable="ice_mass_long", region=region, units="Gt", frequency="annual", kind="cumulative",
                             dates=years, values=gt, segment_source=f"{seg}, {key}_mean (mm of sea level -> Gt)",
                             synthetic=False, decimals=0)
            # Sign flip: the upper sea-level bound is the lower mass bound.
            _bounds(doc, years, _vals(ds, f"{key}_upper"), _vals(ds, f"{key}_lower"), -GT_PER_MM, 0)
            docs[("ice_mass_long", region)] = doc
    return docs


def _bounds(doc: dict[str, Any], years: list[str], lower: list[float | None], upper: list[float | None],
            factor: float, decimals: int) -> None:
    idx = {y: i for i, y in enumerate(years)}

    def conv(seq: list[float | None], y: str) -> float | None:
        v = seq[idx[y]]
        return None if v is None else round(v * factor, decimals) + 0.0

    lo = [conv(lower, y) for y in doc["dates"]]
    hi = [conv(upper, y) for y in doc["dates"]]
    for i, v in enumerate(doc["values"]):
        if v is None:
            lo[i] = hi[i] = None
        elif lo[i] is not None and hi[i] is not None and not (lo[i] <= v <= hi[i]):
            raise IngestError(f"{doc['variable']}/{doc['region']} {doc['dates'][i]}: value {v} outside bounds "
                              f"[{lo[i]}, {hi[i]}]")
    doc["lower"], doc["upper"], doc["bounds"] = lo, hi, BOUNDS
    # Keep key order close to the contract examples: bounds before segments.
    seg = doc.pop("segments"), doc.pop("synthetic")
    doc["segments"], doc["synthetic"] = seg
