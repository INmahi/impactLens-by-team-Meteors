"""ITS_LIVE Greenland ice masks, NSIDC-0793 v1 -> `ice_extent` (monthly km2, greenland) + yearly coarse outlines.

Real file checked 2026-11-13 (`NSIDC-0793_19720915-20220215_V01.0.nc`): `ice_mask` (time 594, y 23334,
x 13333) int8 0/1 on a 120 m EPSG:3413 grid (x, y = cell centres in m), gzip chunks of 16 x 649 x 371;
`time` in days since 1900-01-01; `observation_data` (catchment, time) = km of terminus observations.

Reading follows the chunking (16 months x one chunk row of y at a time, about 140 MB), so the 185 GB
of mask is decompressed once (minutes, not hours).

Area: each ice pixel counts 0.0144 km2 divided by the square of the polar-stereographic scale factor at
its latitude, k = (1 + sin 70) / (1 + sin lat) (spherical formula; the ellipsoid changes it by well under
1 percent and the same way every month, so the trend is unaffected).
Outlines: per calendar year, the mean ice cover on a 4.8 km grid, contoured at 0.5, largest polygon (the
ice sheet), simplified to 3 km, in lon/lat.
"""

from __future__ import annotations

import math
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np

from .grid import IngestError

PATTERN = "NSIDC-0793_*_V01.0.nc"
PIX_KM2 = 0.12 * 0.12
COARSE = 40  # 40 x 120 m = 4.8 km cells for outlines
R_EARTH = 6_371_008.8
K0 = (1 + math.sin(math.radians(70))) / 2  # scale at the pole for true scale at 70 N

SOURCE = {
    "name": "ITS_LIVE Greenland ice sheet extent masks, NSIDC-0793 v1",
    "url": "https://doi.org/10.5067/579TO87M7IZB",
    "citation": "Greene, C. A., Gardner, A. S., Wood, M. & Cuzzone, J. K. (2024). MEaSUREs ITS_LIVE Greenland "
                "Monthly 120 m Ice Sheet Extent Masks, 1972-2022 (NSIDC-0793, Version 1). Boulder, Colorado USA: "
                "NASA NSIDC DAAC. https://doi.org/10.5067/579TO87M7IZB",
    "doi": "10.5067/579TO87M7IZB",
    "version": "1",
    "licence": "NASA open data (NSIDC use and copyright guidelines)",
    "processing": [
        "Downloaded the 120 m monthly ice mask unchanged (the MP4 animations were not used).",
        "Monthly ice area = number of ice pixels x 0.0144 km2, corrected for the polar-stereographic map scale "
        "(spherical formula).",
        "Months without terminus observations are gap-filled by the source, not by us.",
        "Globe outlines: yearly mean cover on a 4.8 km grid, contoured at 50%, simplified to 3 km (display only).",
    ],
}
NOTES = [
    "Derived from glacier terminus positions; interior ice is fixed, so the change is at the glacier fronts.",
    "Months without terminus observations are gap-filled by the source, so neighbouring months are not independent.",
    "An area is not a mass: a retreating front does not equal mass loss (ice mass is a separate variable).",
]


def _pixel_area(xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    r = np.sqrt(xs[None, :] ** 2 + ys[:, None] ** 2)
    lat = np.pi / 2 - 2 * np.arctan(r / (2 * R_EARTH * K0))
    k = (1 + math.sin(math.radians(70))) / (1 + np.sin(lat))
    return (PIX_KM2 / k**2).astype(np.float64)


def scan(raw: Path, log: Any = print) -> dict[str, Any]:
    import h5py

    files = sorted(Path(raw).glob(PATTERN))
    if len(files) != 1:
        raise IngestError(f"expected one {PATTERN} in {raw}, found {len(files)}")
    with h5py.File(files[0], "r") as f:
        for name in ("ice_mask", "x", "y", "time"):
            if name not in f:
                raise IngestError(f"{files[0].name}: {name!r} missing")
        mask = f["ice_mask"]
        nt, ny, nx = mask.shape
        xs, ys = f["x"][:], f["y"][:]
        days = f["time"][:]
        obs = f["observation_data"][:] if "observation_data" in f else None
        if abs((xs[1] - xs[0]) - 120.0) > 1e-6 or abs((ys[1] - ys[0]) + 120.0) > 1e-6:
            raise IngestError(f"{files[0].name}: grid spacing is not 120 m with y descending")
        ct, cy = (mask.chunks or (16, 649, 371))[:2]
        months = [(date(1900, 1, 1) + timedelta(days=float(d))) for d in days]
        labels = [f"{d.year:04d}-{d.month:02d}" for d in months]
        area = np.zeros(nt)
        nyc, nxc = -(-ny // COARSE), -(-nx // COARSE)
        years = sorted({l[:4] for l in labels})
        ysum = {y: np.zeros((nyc, nxc)) for y in years}
        ycount = {y: 0 for y in years}
        for y in labels:
            ycount[y[:4]] += 1
        for r0 in range(0, ny, cy):
            r1 = min(ny, r0 + cy)
            pa = _pixel_area(xs, ys[r0:r1])
            # Coarse row of each fine row in this strip, for reduceat.
            crow = np.arange(r0, r1) // COARSE
            starts = np.r_[0, np.nonzero(np.diff(crow))[0] + 1]
            for t0 in range(0, nt, ct):
                t1 = min(nt, t0 + ct)
                block = mask[t0:t1, r0:r1, :]
                if not np.isin(block, (0, 1)).all():
                    raise IngestError(f"{files[0].name}: ice_mask has values other than 0/1")
                b = block.astype(np.float32)
                area[t0:t1] += np.tensordot(b, pa, axes=([1, 2], [0, 1]))
                rows = np.add.reduceat(b, starts, axis=1)  # (t, n coarse rows in strip, nx)
                pad = nxc * COARSE - nx
                rows = np.pad(rows, ((0, 0), (0, 0), (0, pad)))
                cells = rows.reshape(rows.shape[0], rows.shape[1], nxc, COARSE).sum(axis=3)
                for k in range(t1 - t0):
                    ysum[labels[t0 + k][:4]][crow[starts]] += cells[k]
            log(f"  itslive rows {r1}/{ny}")
    frac = {y: ysum[y] / (ycount[y] * COARSE * COARSE) for y in years}
    no_obs = int((obs.sum(axis=0) == 0).sum()) if obs is not None else None
    return {"labels": labels, "area": area, "years": years, "frac": frac, "xs": xs, "ys": ys, "no_obs": no_obs}


def outlines(scan_out: dict[str, Any]) -> dict[str, Any]:
    import rasterio.features
    from affine import Affine
    from pyproj import Transformer
    from shapely.geometry import shape

    from ..synthetic.geometry import TopoWriter

    xs, ys = scan_out["xs"], scan_out["ys"]
    cell = 120.0 * COARSE
    transform = Affine(cell, 0, xs[0] - 60.0, 0, -cell, ys[0] + 60.0)
    to_ll = Transformer.from_crs("EPSG:3413", "EPSG:4326", always_xy=True)
    tw = TopoWriter()
    geoms = []
    for year in scan_out["years"]:
        on = (scan_out["frac"][year] >= 0.5).astype(np.uint8)
        polys = [shape(g) for g, v in rasterio.features.shapes(on, mask=on.astype(bool), transform=transform) if v == 1]
        if not polys:
            continue
        main = max(polys, key=lambda p: p.area).simplify(3000.0, preserve_topology=True)
        ex, ey = main.exterior.coords.xy
        lon, lat = to_ll.transform(np.asarray(ex), np.asarray(ey))
        ring = [(float(a), float(b)) for a, b in zip(lon, lat)]
        geoms.append(tw.geometry(ring, properties={"region": "greenland", "date": year}))
    return tw.topology("outlines", geoms)
