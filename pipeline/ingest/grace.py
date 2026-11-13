"""GRACE/GRACE-FO JPL mascons RL06.3Mv04 CRI -> the `ice_mass_map` layer (monthly frames, cm water equivalent).

Real file checked 2026-11-13 (`GRCTellus.JPL.<start>_<end>.GLO.RL06.3M.MSCNv04CRI.nc`): `lwe_thickness`
(time, lat, lon) in cm on a 0.5-degree grid, lat ascending from -89.75, lon 0.25..359.75, `land_mask`,
`time_bounds` in days since 2002-01-01, attribute `time_mean_removed` = 2004.000 to 2009.999.

Processing (also written to the manifest source): 2x2 block mean to the 1-degree grid every map layer uses
(row 0 = north, lon -180..180); cells kept where at least half of the 0.5-degree cells are land; month =
calendar month of the time-bounds midpoint; months between the first and last solution with no solution
are listed as missing (never interpolated).
"""

from __future__ import annotations

import shutil
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from .grid import IngestError

PATTERN = "GRCTellus.JPL.*.GLO.RL06.3M.MSCNv04CRI.nc"

SOURCE = {
    "name": "GRACE/GRACE-FO JPL mascons RL06.3Mv04 CRI (PO.DAAC)",
    "url": "https://doi.org/10.5067/TEMSC-3JC634",
    "citation": "Wiese, D. N., Yuan, D.-N., Boening, C., Landerer, F. W., Watkins, M. M. (2023). JPL GRACE and "
                "GRACE-FO Mascon Ocean, Ice, and Hydrology Equivalent Water Height Coastal Resolution Improvement "
                "(CRI) Filtered JPL RL06.3Mv04. PO.DAAC. https://doi.org/10.5067/TEMSC-3JC634",
    "doi": "10.5067/TEMSC-3JC634",
    "version": "RL06.3Mv04",
    "licence": "NASA open data (PO.DAAC data use and citation guidelines)",
    "processing": [
        "Downloaded the global monthly mascon grid unchanged.",
        "Values are the source's water-equivalent thickness change in cm, relative to its 2004.0-2009.999 mean.",
        "Averaged 2x2 to a 1-degree grid; kept land cells only (the source's land mask).",
        "Months with no solution (including the 2017-2018 mission gap) are shown as no data, never interpolated.",
        "A solution whose window runs into the next month (2015-04-12 to 2015-05-11) is shown as that month.",
    ],
}


def _month(days: float) -> str:
    d = date(2002, 1, 1) + timedelta(days=float(days))
    return f"{d.year:04d}-{d.month:02d}"


def _months(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return out


def read_native(raw: Path) -> dict[str, Any]:
    """The 0.5-degree grid as published, oriented row 0 = north, columns from -180, one entry per month kept.

    Keys: months (YYYY-MM, ascending), lwe and unc ((n, 360, 720) cm, NaN where missing; unc None if absent),
    land (360, 720), lat (360, north first), lon (720, from -179.75), warnings.
    """
    import xarray as xr

    files = sorted(Path(raw).glob(PATTERN))
    if len(files) != 1:
        raise IngestError(f"expected one {PATTERN} in {raw}, found {len(files)}")
    warnings: list[str] = []
    with xr.open_dataset(files[0], decode_times=False) as ds:
        for name in ("lwe_thickness", "land_mask", "time_bounds", "lat", "lon"):
            if name not in ds.variables:
                raise IngestError(f"{files[0].name}: {name!r} missing")
        units = str(ds["lwe_thickness"].attrs.get("units", "")).lower()
        if units != "cm":
            raise IngestError(f"{files[0].name}: lwe_thickness units {units!r}, expected cm")
        lat = ds["lat"].values
        lon = ds["lon"].values
        if lat.shape != (360,) or lon.shape != (720,):
            raise IngestError(f"{files[0].name}: grid {lat.shape}x{lon.shape}, expected 360x720 (0.5 degree)")
        lwe = ds["lwe_thickness"].transpose("time", "lat", "lon").values.astype(np.float64)
        unc = (ds["uncertainty"].transpose("time", "lat", "lon").values.astype(np.float64)
               if "uncertainty" in ds.variables else None)
        land = ds["land_mask"].transpose("lat", "lon").values
        tb = ds["time_bounds"].values
    # Orientation: row 0 = north, columns from -180.
    if lat[0] < lat[-1]:
        lwe, land, lat = lwe[:, ::-1, :], land[::-1, :], lat[::-1]
        unc = unc[:, ::-1, :] if unc is not None else None
    shift = int(np.argmin(np.abs(((lon + 180) % 360) - 180 - (-179.75))))
    lwe = np.roll(lwe, -shift, axis=2)
    unc = np.roll(unc, -shift, axis=2) if unc is not None else None
    land = np.roll(land, -shift, axis=1)
    lon = ((np.roll(lon, -shift) + 180) % 360) - 180
    for a in (lwe, unc):
        if a is not None:
            a[~np.isfinite(a) | (np.abs(a) >= 1e30)] = np.nan

    months = [_month((a + b) / 2) for a, b in tb]
    seen: dict[str, int] = {}
    keep = []
    for i, m in enumerate(months):
        if m in seen:
            # A solution whose window runs into the next month (e.g. 2015-04-12..2015-05-11) goes to that
            # month if it is free; otherwise it is dropped. Never averaged, never interpolated.
            nxt = _month(tb[i][1])
            if nxt not in seen and nxt != m:
                warnings.append(f"second solution labelled {m} (window ends in {nxt}) placed in {nxt}")
                months[i] = m = nxt
            else:
                warnings.append(f"two solutions in {m}; kept the first")
                continue
        seen[m] = i
        keep.append(i)
    keep.sort(key=lambda i: months[i])
    return {"months": [months[i] for i in keep], "lwe": lwe[keep], "unc": unc[keep] if unc is not None else None,
            "land": land, "lat": lat, "lon": lon, "warnings": warnings}


def read_grace(raw: Path) -> tuple[list[str], np.ndarray, list[str], list[str]]:
    """Returns (frame months, frames (n, 180, 360) float32 with NaN off-land, all months, warnings)."""
    nat = read_native(raw)
    lwe, land = nat["lwe"], nat["land"]
    n = len(nat["months"])
    with np.errstate(invalid="ignore"):
        frames = np.nanmean(lwe.reshape(n, 180, 2, 360, 2), axis=(2, 4))
    land_frac = land.reshape(180, 2, 360, 2).mean(axis=(1, 3))
    frames[:, land_frac < 0.5] = np.nan
    frame_months = nat["months"]
    return frame_months, frames.astype(np.float32), _months(frame_months[0], frame_months[-1]), nat["warnings"]


def write_grace_layer(raw: Path, root: Path, accessed: str, log: Any = print) -> dict[str, Any]:
    from ..synthetic.config import LayerSpec
    from ..synthetic.maps import LayerFields, write_layer

    frame_months, frames, all_months, warnings = read_grace(raw)
    for w in warnings:
        log(f"warning: {w}")
    missing = [m for m in all_months if m not in set(frame_months)]
    vals = frames[np.isfinite(frames)]
    lim = float(np.ceil(np.percentile(np.abs(vals), 99.5) / 50.0) * 50.0)
    # 16-bit encoding: scale 0.05 cm over [offset, offset + 3276.75]; offset chosen so nothing is clamped.
    offset = float(np.floor(min(-1000.0, float(vals.min())) / 500.0) * 500.0)
    if float(vals.max()) > offset + 65535 * 0.05:
        raise IngestError(f"GRACE values span {vals.min():.0f}..{vals.max():.0f} cm; too wide for the 16-bit encoding")
    layer = LayerSpec("ice_mass_map", "cm w.e.", all_months[0], all_months[-1], missing=missing, scale=0.05,
                      offset=offset, source={**SOURCE, "accessed": accessed},
                      name="Ice and water mass change (GRACE/GRACE-FO, monthly)", fade_near_zero=True)
    fields = LayerFields(all_months, frames, frame_months, (-lim, lim))
    layer_dir = Path(root) / "ice_mass_map"
    shutil.rmtree(layer_dir / "frames", ignore_errors=True)
    manifest, clamped = write_layer(layer, fields, layer_dir)
    manifest["synthetic"] = False
    manifest["note"] = ("GRACE weighs all mass: over the ice sheets and glaciers this is mostly ice; elsewhere it is "
                        "groundwater, lakes, snow and soil moisture. About 300 km resolution.")
    from .. import writers as W

    W.dump(layer_dir / "manifest.json", manifest)
    if clamped:
        log(f"warning: {clamped} cells outside the 16-bit encoding range were clamped")
    log(f"ice_mass_map: {len(frame_months)} frames {all_months[0]}..{all_months[-1]}, {len(missing)} missing "
        f"months, colour range +-{lim:.0f} cm")
    return manifest
