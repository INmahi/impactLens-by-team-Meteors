"""NASA-SSH simple grid V1.1 (weekly netCDF) to per-region weekly and monthly means.

Method (docs/datasets/sea-level-gridded-ssh.md, "Method for regional means"):
- cell centre in polygon, using OUR polygons from regions.topo.json; `basin_flag`
  is used only as an ocean/land mask (0 or fill = land);
- area weight of a 0.5-degree cell: sin(lat + 0.25 deg) - sin(lat - 0.25 deg);
- each week: weighted mean over the valid cells, renormalised by the valid weight;
  the week is missing for a region that lost more than 20% of its ocean weight;
- each weekly file belongs to the calendar month of its LABEL date (file name);
  a month needs at least 3 valid weeks, else it is null;
- `global`: the same weighted mean over every valid ocean cell;
- metres to mm after averaging (the mean is linear).

Robust to the card's UNVERIFIED items: latitude order (sorted), longitude 0-360 or
-180..180 (wrapped to -180..180 and sorted), fills (NaN, >= 1e30 or _FillValue),
missing basin_flag (polygon cells are then taken as ocean).

Every grid, real or synthetic stand-in, goes through `RawWeek` -> `SeaLevelIngest.add`.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from ..synthetic.geometry import points_in_ring
from ..validate.topology import decode_arcs

FILL_THRESHOLD = 1e30          # anything this large is a fill value
MAX_WEIGHT_LOSS = 0.20         # a region-week is missing if more than this share of weight is lost
MIN_WEEKS_PER_MONTH = 3
GLOBAL_ID = "global"
SSH_FILE = re.compile(r"NASA-SSH_alt_ref_simple_grid_v1_1_(\d{8})\.nc$")
UNIT_TO_MM = {"m": 1000.0, "meter": 1000.0, "meters": 1000.0, "metre": 1000.0, "metres": 1000.0,
              "cm": 10.0, "centimeters": 10.0, "mm": 1.0, "millimeters": 1.0}

Ring = list[tuple[float, float]]


class IngestError(RuntimeError):
    pass


# --------------------------------------------------------------------------- raw week
@dataclass
class RawWeek:
    """One weekly grid as stored in the file: original axis order, fills not yet masked."""
    label: date                         # label (centre) date, from the file name
    latitude: np.ndarray                # 1-D, as stored
    longitude: np.ndarray               # 1-D, as stored (0-360 or -180..180)
    ssha: np.ndarray                    # (latitude, longitude), as stored
    units: str = "m"
    ssha_fill: float | None = None      # the variable's _FillValue, if any
    basin_flag: np.ndarray | None = None
    basin_fill: float | None = None
    source: str = ""                    # file name, for messages
    warnings: list[str] = field(default_factory=list)


def mask_fill(values: np.ndarray, fill: float | None = None) -> np.ndarray:
    """Float copy with NaN where the value is NaN, >= 1e30 in size, or equal to _FillValue."""
    v = np.array(values, dtype=np.float64, copy=True)
    bad = ~(np.abs(v) < FILL_THRESHOLD)          # NaN compares False, so NaN is bad too
    if fill is not None and np.isfinite(fill) and abs(fill) < FILL_THRESHOLD:
        bad |= v == fill
    v[bad] = np.nan
    return v


def unit_factor(units: str) -> float:
    key = (units or "").strip().lower()
    if key not in UNIT_TO_MM:
        raise IngestError(f"ssha units {units!r} not understood (expected m, cm or mm)")
    return UNIT_TO_MM[key]


# --------------------------------------------------------------------------- grid
class Grid:
    """Normalised grid: latitude ascending, longitude in -180..180 ascending.

    `apply` reorders a stored (lat, lon) array into this layout; `unapply` reverses it.
    """

    def __init__(self, latitude: np.ndarray, longitude: np.ndarray) -> None:
        lat = np.asarray(latitude, dtype=np.float64)
        lon = np.asarray(longitude, dtype=np.float64)
        if lat.ndim != 1 or lon.ndim != 1:
            raise IngestError("latitude and longitude must be 1-D")
        wrapped = ((lon + 180.0) % 360.0) - 180.0
        self.lat_order = np.argsort(lat, kind="stable")
        self.lon_order = np.argsort(wrapped, kind="stable")
        self.lat = lat[self.lat_order]
        self.lon = wrapped[self.lon_order]
        if len(np.unique(np.round(self.lon, 6))) != len(self.lon):
            raise IngestError("longitudes repeat after wrapping to -180..180")
        dlat = np.diff(self.lat)
        if len(dlat) and not np.allclose(dlat, dlat[0], atol=1e-4):
            raise IngestError("latitude spacing is not regular")
        self.half = float(dlat[0]) / 2 if len(dlat) else 0.25
        self.inv_lat = np.argsort(self.lat_order)
        self.inv_lon = np.argsort(self.lon_order)
        n = len(lon)
        self._lat_identity = bool(np.array_equal(self.lat_order, np.arange(len(lat))))
        k = int(self.lon_order[0]) if n else 0
        self._lon_roll = k if np.array_equal(self.lon_order, (np.arange(n) + k) % n) else None
        self.key = (lat.tobytes(), lon.tobytes())
        lat_r = np.radians(self.lat)
        h = math.radians(self.half)
        row_w = np.sin(lat_r + h) - np.sin(lat_r - h)          # cell area / (R^2 * dlon)
        self.weights = np.repeat(row_w[:, None], len(self.lon), axis=1)
        self.lon2d, self.lat2d = np.meshgrid(self.lon, self.lat)

    @property
    def shape(self) -> tuple[int, int]:
        return len(self.lat), len(self.lon)

    def apply(self, arr: np.ndarray) -> np.ndarray:
        a = np.asarray(arr)
        if not self._lat_identity:
            a = a[self.lat_order]
        if self._lon_roll is None:
            return a[:, self.lon_order]
        k = self._lon_roll
        return np.concatenate([a[:, k:], a[:, :k]], axis=1) if k else a.copy()

    def unapply(self, arr: np.ndarray) -> np.ndarray:
        return np.asarray(arr)[self.inv_lat][:, self.inv_lon]


# --------------------------------------------------------------------------- polygons
def _ring_from_arcs(arcs: list[list[tuple[float, float]]], refs: list[int]) -> Ring:
    pts: Ring = []
    for i in refs:
        arc = arcs[i] if i >= 0 else arcs[~i][::-1]
        pts.extend(arc if not pts else arc[1:])
    return pts


def polygons_from_topo(topo: dict[str, Any]) -> dict[str, list[tuple[Ring, list[Ring]]]]:
    """Region id -> list of (outer ring, holes) from a regions.topo.json document."""
    arcs, problems = decode_arcs(topo)
    if problems:
        raise IngestError("regions.topo.json: " + "; ".join(problems))
    out: dict[str, list[tuple[Ring, list[Ring]]]] = {}
    for g in topo["objects"]["regions"]["geometries"]:
        polys = g["arcs"] if g["type"] == "MultiPolygon" else [g["arcs"]]
        parts = []
        for poly in polys:
            rings = [_ring_from_arcs(arcs, r) for r in poly]
            parts.append((rings[0], rings[1:]))
        out[g["id"]] = parts
    return out


def polygon_mask(grid: Grid, parts: list[tuple[Ring, list[Ring]]]) -> np.ndarray:
    """Cells whose CENTRE lies inside the (multi)polygon, holes removed."""
    mask = np.zeros(grid.shape, dtype=bool)
    for outer, holes in parts:
        inside = points_in_ring(grid.lon2d, grid.lat2d, outer)
        for hole in holes:
            inside &= ~points_in_ring(grid.lon2d, grid.lat2d, hole)
        mask |= inside
    return mask


def ocean_from_basin_flag(flag: np.ndarray | None, fill: float | None) -> np.ndarray | None:
    """Ocean cells from basin_flag (normalised layout): valid and not 0 (0 = Land)."""
    if flag is None:
        return None
    f = mask_fill(flag, fill)
    return np.isfinite(f) & (f != 0)


# --------------------------------------------------------------------------- averaging
class RegionAverager:
    """Weekly area-weighted means for each region over one normalised grid."""

    def __init__(self, grid: Grid, polygons: dict[str, list[tuple[Ring, list[Ring]]]],
                 region_ids: list[str], ocean: np.ndarray | None) -> None:
        self.grid = grid
        self.region_ids = list(region_ids)
        self.has_ocean = ocean is not None
        ocean_mask = ocean if ocean is not None else np.ones(grid.shape, dtype=bool)
        w = grid.weights
        self.dense: dict[str, np.ndarray] = {}      # full-grid weights (0 outside), for big regions
        self.cells: dict[str, np.ndarray] = {}      # flat indices of the region's ocean cells
        self.cell_w: dict[str, np.ndarray] = {}
        self.expected: dict[str, float] = {}
        for rid in self.region_ids:
            if rid == GLOBAL_ID:
                m = ocean_mask
            else:
                if rid not in polygons:
                    raise IngestError(f"region {rid!r} has no polygon in regions.topo.json")
                m = polygon_mask(grid, polygons[rid]) & ocean_mask
            idx = np.flatnonzero(m)
            if idx.size == 0:
                raise IngestError(f"region {rid!r} contains no grid cell centre")
            self.cells[rid] = idx
            self.cell_w[rid] = w.ravel()[idx]
            self.expected[rid] = float(self.cell_w[rid].sum())
            if idx.size > m.size // 8:
                self.dense[rid] = np.where(m, w, 0.0).ravel()

    def cell_counts(self) -> dict[str, int]:
        return {rid: int(idx.size) for rid, idx in self.cells.items()}

    def region_index(self) -> np.ndarray:
        """Normalised-layout map: index into region_ids (non-global) or -1."""
        out = np.full(self.grid.shape, -1, dtype=np.int64)
        flat = out.ravel()
        for k, rid in enumerate(self.region_ids):
            if rid != GLOBAL_ID:
                flat[self.cells[rid]] = k
        return out

    def week_means(self, values: np.ndarray) -> dict[str, float | None]:
        """`values` in the normalised layout with NaN for missing cells (any unit)."""
        flat = values.ravel()
        valid = np.isfinite(flat)
        v0 = np.where(valid, flat, 0.0)
        validf = valid.astype(np.float64)
        out: dict[str, float | None] = {}
        for rid in self.region_ids:
            if rid in self.dense:
                w = self.dense[rid]
                wv, num = float(np.dot(w, validf)), float(np.dot(w, v0))
            else:
                idx, w = self.cells[rid], self.cell_w[rid]
                wv, num = float(np.dot(w, validf[idx])), float(np.dot(w, v0[idx]))
            check_loss = rid != GLOBAL_ID or self.has_ocean
            if wv <= 0 or (check_loss and wv < (1.0 - MAX_WEIGHT_LOSS) * self.expected[rid] - 1e-12):
                out[rid] = None
            else:
                out[rid] = num / wv
        return out


def monthly_from_weekly(labels: list[date], values: list[float | None],
                        min_weeks: int = MIN_WEEKS_PER_MONTH) -> tuple[list[str], list[float | None]]:
    """Weekly values -> calendar months of their label dates.

    A month is the equal-weight mean of its valid weeks if it has at least `min_weeks`
    of them, else null. The grid runs from the first to the last month that has a
    value (no padding); months in between without enough weeks are null.
    """
    buckets: dict[tuple[int, int], list[float]] = {}
    seen: set[tuple[int, int]] = set()
    for d, v in zip(labels, values):
        key = (d.year, d.month)
        seen.add(key)
        if v is not None and np.isfinite(v):
            buckets.setdefault(key, []).append(float(v))
    good = {k: float(np.mean(vs)) for k, vs in buckets.items() if len(vs) >= min_weeks}
    if not good:
        return [], []
    (y, m), last = min(good), max(good)
    months, vals = [], []
    while (y, m) <= last:
        months.append(f"{y:04d}-{m:02d}")
        vals.append(good.get((y, m)))
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return months, vals


class SeaLevelIngest:
    """Collects weekly region means from RawWeeks (real files or stand-ins)."""

    def __init__(self, polygons: dict[str, list[tuple[Ring, list[Ring]]]], region_ids: list[str]) -> None:
        self.polygons = polygons
        self.region_ids = list(region_ids)
        self.labels: list[date] = []
        self.weekly: dict[str, list[float | None]] = {rid: [] for rid in self.region_ids}
        self.warnings: list[str] = []
        self._grid: Grid | None = None
        self._avg: RegionAverager | None = None
        self._ocean_key: bytes | None = None
        self._basin_obj: Any = None

    def averager_for(self, week: RawWeek) -> RegionAverager:
        if self._grid is None or self._grid.key != (np.asarray(week.latitude, np.float64).tobytes(),
                                                     np.asarray(week.longitude, np.float64).tobytes()):
            self._grid = Grid(week.latitude, week.longitude)
            self._avg = None
        grid = self._grid
        if self._avg is not None and week.basin_flag is self._basin_obj:
            return self._avg                     # same basin_flag array object as last week (stand-ins)
        self._basin_obj = week.basin_flag
        ocean = ocean_from_basin_flag(None if week.basin_flag is None else grid.apply(week.basin_flag),
                                      week.basin_fill)
        key = None if ocean is None else np.packbits(ocean).tobytes()
        if self._avg is None or key != self._ocean_key:
            if self._avg is not None:
                self.warnings.append(f"{week.source or week.label}: basin_flag ocean mask changed; "
                                     "region weights recomputed")
            self._avg = RegionAverager(grid, self.polygons, self.region_ids, ocean)
            self._ocean_key = key
            if ocean is None:
                self.warnings.append("no basin_flag: polygon cells taken as ocean; global has no weight-loss check")
        return self._avg

    def add(self, week: RawWeek) -> dict[str, float | None]:
        avg = self.averager_for(week)
        factor = unit_factor(week.units)
        means = avg.week_means(avg.grid.apply(mask_fill(week.ssha, week.ssha_fill)))
        if self.labels and week.label <= self.labels[-1]:
            raise IngestError(f"weeks out of order or repeated at {week.label}")
        self.labels.append(week.label)
        out = {}
        for rid in self.region_ids:
            v = means[rid]
            out[rid] = None if v is None else v * factor
            self.weekly[rid].append(out[rid])
        self.warnings.extend(week.warnings)
        return out

    def monthly(self, rid: str) -> tuple[list[str], list[float | None]]:
        return monthly_from_weekly(self.labels, self.weekly[rid])

    def weeks_missing(self, rid: str) -> int:
        return sum(v is None for v in self.weekly[rid])


# --------------------------------------------------------------------------- files
def label_from_name(path: Path) -> date | None:
    m = SSH_FILE.search(path.name)
    return datetime.strptime(m.group(1), "%Y%m%d").date() if m else None


_SINCE = re.compile(r"^\s*(seconds|minutes|hours|days)\s+since\s+(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}))?",
                    re.I)


def decode_time(value: float, units: str) -> datetime:
    m = _SINCE.match(units or "")
    if not m:
        raise IngestError(f"time units {units!r} not understood")
    epoch = datetime.fromisoformat(m.group(2) + "T" + (m.group(3) or "00:00:00"))
    step = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}[m.group(1).lower()]
    return epoch + timedelta(seconds=float(value) * step)


def list_ssh_files(raw: Path) -> list[Path]:
    files = sorted((p for p in Path(raw).iterdir() if SSH_FILE.search(p.name)), key=lambda p: p.name)
    return files


def read_ssh_file(path: Path) -> RawWeek:
    """Open one weekly grid without decoding (fills handled by mask_fill), with pre-flight checks."""
    import xarray as xr

    path = Path(path)
    try:
        ds = xr.open_dataset(path, mask_and_scale=False, decode_times=False)
    except ValueError as exc:  # no engine for netCDF-4/HDF5
        raise IngestError(f"{path.name}: cannot open ({exc}); netCDF-4 files need the h5netcdf or "
                          "netCDF4 package") from exc
    with ds:
        warnings: list[str] = []
        lat_name = "latitude" if "latitude" in ds.variables else "lat"
        lon_name = "longitude" if "longitude" in ds.variables else "lon"
        for name in (lat_name, lon_name, "ssha"):
            if name not in ds.variables:
                raise IngestError(f"{path.name}: variable {name!r} not found (has {sorted(ds.variables)})")
        ssha = ds["ssha"]
        if ssha.dims != (lat_name, lon_name):
            ssha = ssha.transpose(lat_name, lon_name)
        if ssha.dtype != np.float64:
            warnings.append(f"{path.name}: ssha dtype {ssha.dtype}, expected float64")
        for attr in ("scale_factor", "add_offset"):
            if attr in ssha.attrs:
                raise IngestError(f"{path.name}: ssha has {attr}; the card says none (update the ingest)")
        sizes = dict(ds.sizes)
        if sizes.get(lat_name) != 360 or sizes.get(lon_name) != 720:
            warnings.append(f"{path.name}: grid {sizes.get(lat_name)}x{sizes.get(lon_name)}, expected 360x720")
        label = label_from_name(path)
        if "time" in ds.variables:
            t = ds["time"]
            if t.ndim != 0:
                warnings.append(f"{path.name}: time has dims {t.dims}, expected a scalar")
            try:
                tval = decode_time(float(np.ravel(t.values)[0]), t.attrs.get("units", ""))
                if label is None:
                    label = tval.date()
                elif tval.date() != label:
                    warnings.append(f"{path.name}: time {tval.isoformat()} differs from the label date {label}")
            except IngestError as exc:
                warnings.append(f"{path.name}: {exc}")
        if label is None:
            raise IngestError(f"{path.name}: no label date in the name and no readable time")
        basin = ds["basin_flag"] if "basin_flag" in ds.variables else None
        if basin is not None and basin.dims != (lat_name, lon_name):
            basin = basin.transpose(lat_name, lon_name)
        return RawWeek(
            label=label,
            latitude=np.asarray(ds[lat_name].values, dtype=np.float64),
            longitude=np.asarray(ds[lon_name].values, dtype=np.float64),
            ssha=np.asarray(ssha.values),
            units=str(ssha.attrs.get("units", "m")),
            ssha_fill=_fill_attr(ssha),
            basin_flag=None if basin is None else np.asarray(basin.values),
            basin_fill=None if basin is None else _fill_attr(basin),
            source=path.name,
            warnings=warnings,
        )


def _fill_attr(var: Any) -> float | None:
    for key in ("_FillValue", "missing_value"):
        if key in var.attrs:
            return float(np.ravel(var.attrs[key])[0])
        if key in var.encoding:
            return float(np.ravel(var.encoding[key])[0])
    return None


def read_weeks(raw: Path) -> Iterable[RawWeek]:
    for p in list_ssh_files(raw):
        yield read_ssh_file(p)
