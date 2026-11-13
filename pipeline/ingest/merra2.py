"""MERRA-2 M2TMNXSLV v5.12.4 (T2M only, via OPeNDAP) -> `temperature` (summer anomaly, annual) + `temperature` map layer.

Raw files: `MERRA2_<stream>.tavgM_2d_slv_Nx.<YYYYMM>.T2M.nc4` from scripts/download_real.py (NASA OPeNDAP subset of
the monthly granule: `T2M` (time 1, lat 361, lon 576) in K, lat -90..90 step 0.5, lon -180..179.375 step 0.625).
Checked on the real files 2026-11-13.

Series (greenland, antarctica): area-weighted mean of the cells whose centre is inside the region outline
(regions.topo.json), per month; summer = June-August (Greenland) or December-February labelled by the year of its
January (Antarctica), only when all three months exist; anomaly = minus the 1991-2020 mean of those summers.
Map: each month minus the 1991-2020 mean of the same calendar month, bilinear to the 1-degree layer grid.
No smoothing, no gap filling.
"""

from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

import numpy as np

from .grid import Grid, IngestError, polygon_mask, polygons_from_topo

FILE = re.compile(r"^MERRA2_\d{3}\.tavgM_2d_slv_Nx\.(\d{4})(\d{2})\.T2M\.nc4$")
BASE = (1991, 2020)
NORTH_SUMMER = (6, 7, 8)
SOUTH_SUMMER = (12, 1, 2)


def summer_months(region_ids: list[str], polys: dict) -> dict[str, tuple[int, int, int]]:
    """June-August for regions north of the equator, December-February for southern ones (by outline centre)."""
    out = {}
    for rid in region_ids:
        lats = [lat for outer, _ in polys[rid] for _, lat in outer]
        out[rid] = SOUTH_SUMMER if sum(lats) / len(lats) < 0 else NORTH_SUMMER
    return out


SUMMER: dict[str, tuple[int, int, int]] = {}  # filled by read_months from the temperature variable's regions

SOURCE = {
    "name": "NASA MERRA-2 monthly 2 m air temperature (M2TMNXSLV v5.12.4, GES DISC)",
    "url": "https://doi.org/10.5067/AP1B0BA5PD2K",
    "citation": "Global Modeling and Assimilation Office (GMAO) (2015), MERRA-2 tavgM_2d_slv_Nx: 2d, Monthly mean, "
                "Time-Averaged, Single-Level, Assimilation, Single-Level Diagnostics V5.12.4, Greenbelt, MD, USA, "
                "Goddard Earth Sciences Data and Information Services Center (GES DISC), doi:10.5067/AP1B0BA5PD2K",
    "doi": "10.5067/AP1B0BA5PD2K",
    "version": "5.12.4",
    "licence": "NASA open data (GES DISC data use guidelines)",
    "processing": [
        "Downloaded only the T2M field of each monthly file through NASA's OPeNDAP service (values unchanged).",
        "Region mean = area-weighted mean of the 0.5 x 0.625 degree cells whose centre lies inside the region outline.",
        "Summer = June-August for northern regions (Greenland, Himalayas); December-February for Antarctica, labelled "
        "by the year of its January; only summers with all three months.",
        "Shown as the difference from the 1991-2020 average summer (kelvin differences = degrees C).",
        "Map: each month minus the 1991-2020 mean of that calendar month, interpolated to a 1-degree grid.",
    ],
}
NOTES = [
    "Reanalysis: a NASA weather model constrained by observations, not a direct measurement; over the ice sheet "
    "interiors, where observations are sparse, values lean on the model.",
    "2 m air temperature of a model grid cell (about 50 km), not a station value.",
]


def list_files(raw: Path) -> list[tuple[str, Path]]:
    out = []
    for p in sorted(Path(raw).iterdir()):
        m = FILE.match(p.name)
        if m:
            out.append((f"{m.group(1)}-{m.group(2)}", p))
    if not out:
        raise IngestError(f"no MERRA2_*.tavgM_2d_slv_Nx.YYYYMM.T2M.nc4 files in {raw}")
    return out


def read_months(raw: Path, topo: dict[str, Any], log: Any = print) -> dict[str, Any]:
    import xarray as xr
    from scipy.interpolate import RegularGridInterpolator

    files = list_files(raw)
    polys = polygons_from_topo(topo)
    grid: Grid | None = None
    masks: dict[str, np.ndarray] = {}
    means: dict[str, dict[str, float]] = {r: {} for r in SUMMER}
    fields: dict[str, np.ndarray] = {}
    for label, path in files:
        with xr.open_dataset(path) as ds:
            if "T2M" not in ds.variables:
                raise IngestError(f"{path.name}: T2M missing")
            if str(ds["T2M"].attrs.get("units", "")).strip() != "K":
                raise IngestError(f"{path.name}: T2M units {ds['T2M'].attrs.get('units')!r}, expected K")
            t2m = ds["T2M"].values.squeeze().astype(np.float64)
            lat, lon = ds["lat"].values, ds["lon"].values
        t2m[~np.isfinite(t2m) | (np.abs(t2m) >= 1e14)] = np.nan
        if grid is None:
            grid = Grid(lat, lon)
            from ..synthetic import config as C

            SUMMER.clear()
            SUMMER.update(summer_months(list(next(v for v in C.VARIABLES if v.id == "temperature").series), polys))
            for rid in SUMMER:
                if rid not in polys:
                    raise IngestError(f"regions.topo.json has no outline for {rid}")
                masks[rid] = polygon_mask(grid, polys[rid])
            log("merra2 cells per region: " + ", ".join(f"{r} {int(m.sum())}" for r, m in masks.items()))
        a = grid.apply(t2m)
        for rid, m in masks.items():
            w = grid.weights[m]
            v = a[m]
            ok = np.isfinite(v)
            if ok.sum():
                means.setdefault(rid, {})[label] = float((v[ok] * w[ok]).sum() / w[ok].sum())
        fields[label] = a.astype(np.float32)
    assert grid is not None
    # Monthly climatology 1991-2020 per calendar month, then 1-degree anomaly frames.
    clim = {}
    for mth in range(1, 13):
        sel = [fields[l] for l in fields if int(l[:4]) in range(BASE[0], BASE[1] + 1) and int(l[5:]) == mth]
        if len(sel) != BASE[1] - BASE[0] + 1:
            raise IngestError(f"climatology needs {BASE[1] - BASE[0] + 1} Junes etc.; month {mth} has {len(sel)}")
        clim[mth] = np.mean(sel, axis=0)
    lon_ext = np.r_[grid.lon, grid.lon[0] + 360.0]
    tlon = -180 + (np.arange(360) + 0.5)
    tlat = 90 - (np.arange(180) + 0.5)
    tlon2, tlat2 = np.meshgrid(tlon, tlat)
    pts = np.stack([tlat2.ravel(), tlon2.ravel()], axis=1)
    labels = sorted(fields)
    frames = np.empty((len(labels), 180, 360), dtype=np.float32)
    for i, l in enumerate(labels):
        an = fields[l] - clim[int(l[5:])]
        an = np.concatenate([an, an[:, :1]], axis=1)
        f = RegularGridInterpolator((grid.lat, lon_ext), an, bounds_error=False, fill_value=None)
        frames[i] = f(pts).reshape(180, 360)
    return {"labels": labels, "means": means, "frames": frames}


def summers(means: dict[str, dict[str, float]]) -> dict[str, tuple[list[str], list[float | None]]]:
    out = {}
    for rid, months in SUMMER.items():
        m = means[rid]
        years = sorted({int(l[:4]) for l in m})
        vals: dict[int, float] = {}
        for y in years:
            keys = [f"{y - 1}-12", f"{y}-01", f"{y}-02"] if months[0] == 12 else [f"{y}-{k:02d}" for k in months]
            if all(k in m for k in keys):
                vals[y] = float(np.mean([m[k] for k in keys]))
        base = [v for y, v in vals.items() if BASE[0] <= y <= BASE[1]]
        if len(base) != BASE[1] - BASE[0] + 1:
            raise IngestError(f"{rid}: {len(base)} baseline summers, expected {BASE[1] - BASE[0] + 1}")
        ref = float(np.mean(base))
        ys = list(range(min(vals), max(vals) + 1))
        out[rid] = ([str(y) for y in ys], [vals[y] - ref if y in vals else None for y in ys])
    return out


def write_map(read: dict[str, Any], root: Path, accessed: str, log: Any = print) -> None:
    from .. import writers as W
    from ..synthetic.config import LayerSpec
    from ..synthetic.maps import LayerFields, write_layer

    labels, frames = read["labels"], read["frames"]
    lim = float(np.ceil(np.percentile(np.abs(frames), 99.5)))
    layer = LayerSpec("temperature", "degC", labels[0], labels[-1], missing=[], scale=0.02, offset=-50.0,
                      source={**SOURCE, "accessed": accessed}, name="Air temperature anomaly (MERRA-2, monthly)")
    layer_dir = Path(root) / "temperature"
    shutil.rmtree(layer_dir / "frames", ignore_errors=True)
    manifest, clamped = write_layer(layer, LayerFields(labels, frames, labels, (-lim, lim)), layer_dir)
    manifest["synthetic"] = False
    W.dump(layer_dir / "manifest.json", manifest)
    if clamped:
        raise IngestError(f"temperature map: {clamped} cells clamped by the 16-bit encoding")
    log(f"temperature map: {len(labels)} frames {labels[0]}..{labels[-1]}, colour range +-{lim:.0f} degC")
