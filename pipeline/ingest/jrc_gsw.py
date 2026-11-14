"""JRC Global Surface Water yearly classification -> land_submerged (land that became permanent water).

Raw files: `yearlyClassification<YYYY>[-_]<rowoff>-<coloff>.tif` from
https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GSWE/YearlyClassification/VER5-0/tiles/ (10x10 degree tiles,
0.00025 degree = about 30 m pixels, uint8, 0 = no data, 1 = not water, 2 = seasonal water, 3 = permanent water).

Method (CLAUDE.md "NEXT MAJOR PRIORITY" section):
1. Baseline land: pixels observed in at least BASE_MIN_OBS of the years 1988-1992 and classed "not water" in more
   than half of the years they were observed. Only these pixels can count as lost land.
2. Each year: the area of baseline-land pixels classed permanent water, in km2, using each pixel's true area
   (spherical Earth, R = 6371.0088 km). The series is the land lost since the 1988-1992 baseline.
Note on class 0: the yearly files only describe pixels that were water at least once in 1984-2021; every other
pixel is 0 in all years. Any pixel that becomes water is in that footprint, so for baseline-land pixels 0 really
means no clear observation that year.
3. Gaps: a year where more than MAX_NODATA of a region's baseline-land area has no data is written as null
   (never filled or interpolated).
Region outlines come from regions.topo.json, rasterised on the 30 m grid (pixel centre inside the polygon).
The scene is processed in strips of rows, so memory stays small.
"""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any, Callable

import numpy as np

from .grid import IngestError

Log = Callable[[str], None]

RES = 0.00025  # degrees per pixel
TILE_DEG = 10.0
R_KM = 6371.0088
BASELINE = range(1988, 1993)  # Landsat saw almost nothing of Bangladesh in 1984-1987 (checked per year)
BASE_MIN_OBS = 2
MAX_NODATA = 0.10
FIRST_YEAR = 1988
STRIP_ROWS = 1024

NAME_RE = re.compile(r"yearlyClassification(\d{4})[-_](\d{10})-(\d{10})\.tif$")

SOURCE = {
    "name": "JRC Global Surface Water, Yearly Water Classification History (Landsat)",
    "url": "https://global-surface-water.appspot.com/",
    "citation": "Pekel, J.-F., Cottam, A., Gorelick, N., Belward, A.S. (2016), High-resolution mapping of global "
                "surface water and its long-term changes, Nature 540, 418-422, doi:10.1038/nature20584. "
                "Source: EC JRC/Google.",
    "doi": "10.1038/nature20584",
    "version": "1.4 (JRC open data VER5-0, 1984-2021)",
    "licence": "Free to use with attribution (Copernicus programme, EC JRC)",
    "processing": [
        "Downloaded the two 10x10-degree yearly classification tiles that cover Bangladesh (80-100E, 20-30N) for "
        "every year 1988-2021 from the JRC open data server (values unchanged).",
        "Baseline land: 30 m pixels seen in at least 2 of the years 1988-1992 (Landsat saw almost nothing of Bangladesh before 1988) and classed 'not water' in most of "
        "them.",
        "Each year: total area (km2, true pixel area) of baseline-land pixels classed permanent water, inside the "
        "region's border (pixel centre inside).",
        "A year is left empty when more than 10% of the region's baseline land had no clear Landsat view that "
        "year; nothing is filled in.",
    ],
}

NOTES = [
    "Area (km2) that was land in 1988-1992 and is permanent water in that year, from Landsat images (30 m pixels).",
    "Counts every cause of land turning to water: sea level rise, coastal and river-bank erosion, sinking land and "
    "new ponds or fish farms. It cannot separate sea level rise from the others.",
    "Loss only: new land that forms (for example new islands in the Meghna estuary) is not subtracted.",
    "Seasonal water (wet-season flooding) is not counted; only water present all year.",
    "Years with too few clear Landsat images over the region are left empty (for example 1998).",
    "Landsat 7 (1999) and Landsat 8 (2013) added more clear images; a year with more images can show slightly more "
    "permanent water, so small steps at those years are possible.",
]


def list_tiles(raw: Path) -> dict[int, list[Path]]:
    out: dict[int, list[Path]] = {}
    for p in sorted(Path(raw).glob("*.tif")):
        m = NAME_RE.search(p.name)
        if m:
            out.setdefault(int(m.group(1)), []).append(p)
    if not out:
        raise IngestError(f"no yearlyClassification*.tif files in {raw}")
    return out


def _bounds(parts: Any) -> tuple[float, float, float, float]:
    xs = [x for outer, _ in parts for x, _y in outer]
    ys = [y for outer, _ in parts for _x, y in outer]
    return min(xs), min(ys), max(xs), max(ys)


def _geom(parts: Any) -> dict[str, Any]:
    return {"type": "MultiPolygon",
            "coordinates": [[[list(map(float, pt)) for pt in ring] for ring in [outer, *holes]] for outer, holes in parts]}


class Scene:
    """The Bangladesh window across the tiles of one year, read strip by strip."""

    def __init__(self, files: list[Path], west: float, north: float, width: int):
        import rasterio

        self.west, self.north, self.width = west, north, width
        self.srcs = [rasterio.open(f) for f in files]

    def close(self) -> None:
        for s in self.srcs:
            s.close()

    def read(self, row0: int, nrows: int) -> np.ndarray:
        """Classes for rows row0.. of the window (0 where no tile covers a pixel)."""
        from rasterio.windows import Window

        out = np.zeros((nrows, self.width), dtype=np.uint8)
        for s in self.srcs:
            b = s.bounds
            # window columns covered by this tile
            c0 = max(0, round((b.left - self.west) / RES))
            c1 = min(self.width, round((b.right - self.west) / RES))
            if c1 <= c0:
                continue
            r_top = round((b.top - self.north) / -RES)  # window row of the tile's first row (<= 0 if above)
            r0, r1 = max(row0, r_top), min(row0 + nrows, r_top + s.height)
            if r1 <= r0:
                continue
            tc0 = round((self.west + c0 * RES - b.left) / RES)
            data = s.read(1, window=Window(tc0, r0 - r_top, c1 - c0, r1 - r0))
            out[r0 - row0:r1 - row0, c0:c1] = data
        return out


def land_lost(raw: Path, polys: dict[str, Any], kinds: dict[str, str], region_ids: list[str],
              log: Log = print) -> tuple[list[str], dict[str, list[float | None]], dict[str, dict[str, Any]]]:
    """Years, region -> km2 lost (None for gap years), and per-region diagnostics."""
    from rasterio.features import rasterize
    from rasterio.transform import from_origin

    tiles = list_tiles(raw)
    years = [y for y in sorted(tiles) if y >= FIRST_YEAR]
    missing_base = [y for y in BASELINE if y not in tiles]
    if missing_base:
        raise IngestError(f"baseline years missing from {raw}: {missing_base}")
    if any(len(tiles[y]) != len(tiles[years[0]]) for y in years):
        raise IngestError("not every year has the same number of tiles: " +
                          ", ".join(f"{y}:{len(tiles[y])}" for y in years))

    # Window: union of the regions' bounds, snapped to the pixel grid.
    bb = [_bounds(polys[r]) for r in region_ids]
    west = math.floor(min(b[0] for b in bb) / RES) * RES
    south = math.floor(min(b[1] for b in bb) / RES) * RES
    east = math.ceil(max(b[2] for b in bb) / RES) * RES
    north = math.ceil(max(b[3] for b in bb) / RES) * RES
    width, height = round((east - west) / RES), round((north - south) / RES)
    log(f"jrc_gsw: window {west:.4f}..{east:.4f}E {south:.4f}..{north:.4f}N = {width} x {height} px, "
        f"years {years[0]}..{years[-1]}")

    # Regions in layers that do not overlap inside a layer (country / divisions / districts): one label raster per
    # layer, so each year needs a few bincounts instead of one pass per region.
    layer_names = sorted({kinds[r] for r in region_ids})
    layers = {k: [r for r in region_ids if kinds[r] == k] for k in layer_names}
    nreg = {k: len(v) for k, v in layers.items()}

    base_area = {r: 0.0 for r in region_ids}
    base_unseen = {r: 0.0 for r in region_ids}  # area seen in fewer than BASE_MIN_OBS baseline years
    lost = {r: np.zeros(len(years)) for r in region_ids}
    nodata = {r: np.zeros(len(years)) for r in region_ids}

    scenes = {y: Scene(tiles[y], west, north, width) for y in years}
    try:
        for row0 in range(0, height, STRIP_ROWS):
            nrows = min(STRIP_ROWS, height - row0)
            # true area (km2) of one pixel in each row of the strip
            top = north - row0 * RES - np.arange(nrows) * RES
            row_area = (R_KM ** 2 * math.radians(RES) *
                        np.abs(np.sin(np.radians(top)) - np.sin(np.radians(top - RES)))).astype(np.float64)
            transform = from_origin(west, north - row0 * RES, RES, RES)
            labels = {}
            for k, ids in layers.items():
                shapes = [(_geom(polys[r]), i + 1) for i, r in enumerate(ids)]
                labels[k] = rasterize(shapes, out_shape=(nrows, width), transform=transform, fill=0,
                                      dtype="uint8", all_touched=False).ravel()
            if not any(lab.any() for lab in labels.values()):
                continue

            stack = np.stack([scenes[y].read(row0, nrows) for y in BASELINE])
            obs = (stack != 0).sum(axis=0)
            landc = (stack == 1).sum(axis=0)
            base = (obs >= BASE_MIN_OBS) & (landc * 2 > obs)
            unseen = (obs < BASE_MIN_OBS)
            del stack
            w = (base * row_area[:, None]).ravel()
            wu = (unseen * row_area[:, None]).ravel()

            def tally(weights: np.ndarray, k: str) -> np.ndarray:
                return np.bincount(labels[k], weights=weights, minlength=nreg[k] + 1)[1:]

            for k, ids in layers.items():
                for i, (a, u) in enumerate(zip(tally(w, k), tally(wu, k))):
                    base_area[ids[i]] += a
                    base_unseen[ids[i]] += u
            if not w.any():
                continue
            for yi, y in enumerate(years):
                cls = scenes[y].read(row0, nrows).ravel()
                wl = np.where(cls == 3, w, 0.0)
                wn = np.where(cls == 0, w, 0.0)
                for k, ids in layers.items():
                    for i, (a, n) in enumerate(zip(tally(wl, k), tally(wn, k))):
                        lost[ids[i]][yi] += a
                        nodata[ids[i]][yi] += n
            log(f"jrc_gsw: rows {row0 + nrows}/{height}")
    finally:
        for s in scenes.values():
            s.close()

    out: dict[str, list[float | None]] = {}
    diag: dict[str, dict[str, Any]] = {}
    for r in region_ids:
        if base_area[r] <= 0:
            raise IngestError(f"{r}: no baseline land pixels (check the tiles cover the region)")
        frac = nodata[r] / base_area[r]
        out[r] = [None if f > MAX_NODATA else float(v) for v, f in zip(lost[r], frac)]
        diag[r] = {"baseline_land_km2": round(base_area[r], 1),
                   "baseline_unseen_km2": round(base_unseen[r], 1),
                   "nodata_frac": [round(float(f), 3) for f in frac],
                   "gap_years": [str(y) for y, v in zip(years, out[r]) if v is None]}
    return [str(y) for y in years], out, diag
