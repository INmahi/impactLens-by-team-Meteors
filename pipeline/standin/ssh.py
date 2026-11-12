"""Stand-in NASA-SSH simple grid V1.1 weekly files (synthetic, real layout).

Layout per docs/datasets/sea-level-gridded-ssh.md ("Raw file layout"): file name
`NASA-SSH_alt_ref_simple_grid_v1_1_<YYYYMMDD>.nc` (label = Monday), dims latitude 360
x longitude 720 (+ basins), latitude ascending -89.75..89.75 and longitude
0.25..359.75 (both float32), ssha float64 in metres with _FillValue = float64 max,
counts and basin_flag int32 with _FillValue 2147483647, scalar float64 time in
"seconds since 1990-01-01 00:00:00".

The field (mm) for week w and normalised cell c:
    static(c) + G(w) + A_r(w) [c inside sea r] + cell_noise(c, w)
G is a global signal (trend + seasonal + monthly AR(1) + weekly white noise) shared by
every cell, so coastal seas SHARE the global signal as in reality; A_r is the sea's own
anomaly. The truth is solved so that the area means the ingest computes have exactly the
injected slopes in config (sea_level series): global 3.3 mm/yr, north_sea 3.3, ...
Land, scattered dropouts, whole failed weeks (null months) and partial region losses
(> 20% of weight, the week is dropped) are written as fill values.
"""

from __future__ import annotations

import math
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterator

import numpy as np

from ..ingest.gmsl import datetime_to_decimal_year
from ..ingest.grid import GLOBAL_ID, Grid, RawWeek, RegionAverager, polygons_from_topo
from ..synthetic import config as C
from ..synthetic.geometry import LAND, points_in_ring
from ..synthetic.series import ar1_noise, stream

FILL_F64 = float(np.finfo(np.float64).max)
FILL_I32 = 2147483647
EPOCH = datetime(1990, 1, 1)
FIRST_LABEL = date(1993, 1, 4)
LAST_LABEL = date(2026, 11, 2)      # one November grid: that month is dropped (< 3 weeks)
N_BANK = 8
CELL_NOISE_MM = 15.0
DROPOUT = 0.005
WEEKLY_WHITE_MM = 1.0
PARTIAL_LOSS_WEEKS = 2
PARTIAL_LOSS_SHARE = 0.4
INDICATOR_LAT = 66.0

# Coarse basin ids for the stand-in basin_flag (ids from basin_name_table.txt, card).
BASIN_NAMES = {3: "North Atlantic Ocean", 4: "North Pacific Ocean", 5: "South Pacific Ocean", 6: "Indian Ocean",
               7: "South Atlantic Ocean", 11: "Bay of Bengal", 15: "Caribbean Sea", 16: "Gulf of Mexico",
               35: "North Sea", 259: "Mediterranean Sea", 264: "Southern Ocean Atlantic sector",
               265: "Southern Ocean Indian sector", 266: "Southern Ocean Pacific sector"}


def week_labels(first: date = FIRST_LABEL, last: date = LAST_LABEL) -> list[date]:
    out, d = [], first
    while d <= last:
        out.append(d)
        d += timedelta(days=7)
    return out


def raw_coords() -> tuple[np.ndarray, np.ndarray]:
    lat = np.arange(-89.75, 90.0, 0.5, dtype=np.float32)
    lon = np.arange(0.25, 360.0, 0.5, dtype=np.float32)
    return lat, lon


def _basin_flag(grid: Grid, land: np.ndarray) -> np.ndarray:
    lon, lat = grid.lon2d, grid.lat2d
    flag = np.where(lat > 0, 4, 5)                                            # Pacific
    atl = (lon > -70) & (lon < 20)
    flag = np.where(atl & (lat > 0), 3, flag)
    flag = np.where(atl & (lat <= 0), 7, flag)
    flag = np.where((lon >= 20) & (lon < 120) & (lat <= 25), 6, flag)
    flag = np.where(lat < -60, np.where(lon < 20, 264, np.where(lon < 147, 265, 266)), flag)
    for bid, (w, s, e, n) in {15: (-88, 9, -60, 22), 16: (-98, 18, -80, 31), 11: (77, 5, 100, 23),
                              35: (-4, 51, 9, 61), 259: (-6, 30, 36, 46)}.items():
        flag = np.where((lon >= w) & (lon <= e) & (lat >= s) & (lat <= n), bid, flag)
    return np.where(land, 0, flag).astype(np.int32)


def basin_table() -> list[str]:
    ids = list(range(1, 267)) + list(range(1001, 1027))
    return ["0,Land"] + [f"{i},{BASIN_NAMES.get(i, f'Stand-in basin {i}')}" for i in ids]


class SSHStandin:
    """Weekly stand-in grids for one seed. `weeks()` yields RawWeeks (as read from a file)."""

    def __init__(self, seed: int, topo: dict[str, Any], labels: list[date] | None = None) -> None:
        self.seed = seed
        self.labels = labels or week_labels()
        var = {v.id: v for v in C.VARIABLES}["sea_level"]
        self.var = var
        polygons = polygons_from_topo(topo)
        have = set(polygons) | {GLOBAL_ID}
        self.region_ids = [rid for rid in var.series if rid in have]
        self.seas = [rid for rid in self.region_ids if rid != GLOBAL_ID]

        self.lat_raw, self.lon_raw = raw_coords()
        grid = Grid(self.lat_raw, self.lon_raw)
        self.grid = grid
        land = np.zeros(grid.shape, dtype=bool)
        for ring in LAND:
            land |= points_in_ring(grid.lon2d, grid.lat2d, ring)
        seas_any = np.zeros(grid.shape, dtype=bool)
        probe = RegionAverager(grid, polygons, self.seas, None) if self.seas else None
        if probe is not None:
            seas_any.ravel()[np.concatenate(list(probe.cells.values()))] = True
        self.land = land & ~seas_any                       # the crude land mask never eats a sea polygon
        self.ocean = ~self.land
        self.basin_raw = grid.unapply(_basin_flag(grid, self.land))
        self.avg = RegionAverager(grid, polygons, self.region_ids, self.ocean)
        self.region_idx = self.avg.region_index()          # index into region_ids, -1 outside the seas
        self._solve_truth()
        self._noise_and_events()
        lat2d = grid.lat2d
        self.ind_w = np.where(np.abs(lat2d) <= INDICATOR_LAT, grid.weights, 0.0)

    # ------------------------------------------------------------------ truth
    def _solve_truth(self) -> None:
        spec = self.var.series
        g = spec[GLOBAL_ID]
        W = self.avg.expected[GLOBAL_ID]
        f = {r: self.avg.expected[r] / W for r in self.seas}
        sf = sum(f.values())
        # Global area mean = G + sum f_r A_r; choose G so it has the configured global slope/level.
        self.g_slope = (g.slope - sum(f[r] * spec[r].slope for r in self.seas)) / (1 - sf)
        self.g_start = (g.start_value - sum(f[r] * spec[r].start_value for r in self.seas)) / (1 - sf)
        self.area_fraction = f
        self.t = np.array([datetime_to_decimal_year(datetime(d.year, d.month, d.day)) for d in self.labels])
        self.t0 = self.labels[0].year + 0.5 / 12
        months = sorted({(d.year, d.month) for d in self.labels})
        self.month_of = np.array([months.index((d.year, d.month)) for d in self.labels])
        self.months = months
        nm = len(months)
        two_pi = 2 * math.pi

        rng = stream(self.seed, "sea_level_field", GLOBAL_ID)
        g_phase = rng.uniform(0, two_pi)
        g_noise = ar1_noise(rng, nm, g.ar1, g.noise_sd)
        g_white = rng.standard_normal(len(self.labels)) * WEEKLY_WHITE_MM
        g_seas = lambda t: g.seasonal_amp * np.sin(two_pi * t + g_phase)  # noqa: E731
        self.G = (self.g_start + self.g_slope * (self.t - self.t0) + g_seas(self.t)
                  + g_noise[self.month_of] + g_white)
        A = np.zeros((len(self.region_ids) + 1, len(self.labels)))   # last row: outside every sea (0)
        self.injected: dict[str, dict[str, float]] = {
            GLOBAL_ID: {"slopePerYear": g.slope, "ar1": g.ar1, "noiseSd": g.noise_sd}}
        for k, rid in enumerate(self.region_ids):
            if rid == GLOBAL_ID:
                continue
            s = spec[rid]
            if s.noise_sd <= g.noise_sd:
                raise ValueError(f"sea_level/{rid}: noise_sd must exceed the global {g.noise_sd}")
            sd_a = math.sqrt(s.noise_sd ** 2 - g.noise_sd ** 2)
            r = stream(self.seed, "sea_level_field", rid)
            phase = r.uniform(0, two_pi)
            noise = ar1_noise(r, nm, s.ar1, sd_a)
            white = r.standard_normal(len(self.labels)) * WEEKLY_WHITE_MM
            A[k] = ((s.start_value - self.g_start) + (s.slope - self.g_slope) * (self.t - self.t0)
                    + s.seasonal_amp * np.sin(two_pi * self.t + phase) - g_seas(self.t)
                    + noise[self.month_of] + white)
            ar1_eff = (g.noise_sd ** 2 * g.ar1 + sd_a ** 2 * s.ar1) / s.noise_sd ** 2
            self.injected[rid] = {"slopePerYear": s.slope, "ar1": round(ar1_eff, 3), "noiseSd": s.noise_sd}
        self.A = A
        self.idx_flat = np.where(self.region_idx < 0, len(self.region_ids), self.region_idx).ravel()

    # ------------------------------------------------------------------ noise, gaps
    def _noise_and_events(self) -> None:
        rng = stream(self.seed, "sea_level_field", "cells")
        lon, lat = self.grid.lon2d, self.grid.lat2d
        self.static = (60.0 * np.sin(np.radians(2 * lat)) * np.cos(np.radians(lon))
                       + 40.0 * np.cos(np.radians(3 * lat))).ravel()
        self.bank = rng.standard_normal((N_BANK, self.static.size)) * CELL_NOISE_MM
        self.drop = rng.random((N_BANK, self.static.size)) < DROPOUT
        n = len(self.labels)
        self.bank_of = rng.integers(0, N_BANK, n)
        self.drop_of = rng.integers(0, N_BANK, n)
        # Whole failed weeks: in `gaps` months (global spec) only the first week survives -> null month.
        nm = len(self.months)
        gaps = self.var.series[GLOBAL_ID].gaps
        lo, hi = max(2, int(0.05 * nm)), min(nm - 3, int(0.95 * nm))
        gap_months = set(int(i) for i in rng.choice(np.arange(lo, hi + 1), size=gaps, replace=False)) if gaps else set()
        self.failed = np.zeros(n, dtype=bool)
        for m in gap_months:
            weeks = np.flatnonzero(self.month_of == m)
            self.failed[weeks[1:]] = True
        self.gap_months = sorted(f"{self.months[m][0]:04d}-{self.months[m][1]:02d}" for m in gap_months)
        # Partial losses: a sea loses 40% of its cells for a few weeks (> 20% -> that week is dropped).
        self.partial: dict[int, list[np.ndarray]] = {}
        for rid in self.seas:
            cells = self.avg.cells[rid]
            lost = cells[: int(math.ceil(PARTIAL_LOSS_SHARE * cells.size))]
            for w in rng.choice(np.flatnonzero(~self.failed), size=PARTIAL_LOSS_WEEKS, replace=False):
                self.partial.setdefault(int(w), []).append(lost)
        land_flat = self.land.ravel()
        self.base = self.bank + self.static                 # static field + cell noise, per bank entry
        self.bad = self.drop | land_flat                    # land + scattered dropouts, per bank entry
        self._cache: tuple[int, np.ndarray] | None = None

    # ------------------------------------------------------------------ weeks
    def field_mm(self, i: int) -> np.ndarray:
        """Normalised-layout field in mm with NaN where the file will hold a fill."""
        if self._cache is not None and self._cache[0] == i:
            return self._cache[1]
        if self.failed[i]:
            v = np.full(self.static.size, np.nan)
        else:
            v = self.base[self.bank_of[i]] + self.G[i]
            v += self.A[:, i][self.idx_flat]
            v[self.bad[self.drop_of[i]]] = np.nan
            for lost in self.partial.get(i, []):
                v[lost] = np.nan
        field = v.reshape(self.grid.shape)
        self._cache = (i, field)
        return field

    def raw_week(self, i: int) -> RawWeek:
        ssha = self.field_mm(i) / 1000.0
        ssha[np.isnan(ssha)] = FILL_F64
        return RawWeek(label=self.labels[i], latitude=self.lat_raw, longitude=self.lon_raw,
                       ssha=self.grid.unapply(ssha), units="m", ssha_fill=FILL_F64,
                       basin_flag=self.basin_raw, basin_fill=FILL_I32, source=file_name(self.labels[i]))

    def weeks(self, indicator: list[float] | None = None) -> Iterator[RawWeek]:
        """All weeks in order. If `indicator` is a list, the stand-in GMSL value (mm) is appended per week."""
        for i in range(len(self.labels)):
            wk = self.raw_week(i)
            if indicator is not None:
                indicator.append(self.indicator_mm(i))
            yield wk

    def indicator_mm(self, i: int) -> float:
        """What the producer's indicator would give: weighted mean over |lat| <= 66 of valid cells."""
        v = self.field_mm(i)
        ok = np.isfinite(v)
        w = self.ind_w * ok
        return float(np.nan) if w.sum() <= 0 else float((w * np.where(ok, v, 0)).sum() / w.sum())

    def marker_series(self) -> dict[str, dict[str, Any]]:
        out = {}
        for rid in self.region_ids:
            spec = self.var.series[rid]
            out[f"sea_level/{rid}"] = {"injected": self.injected[rid],
                                       "segment_source": spec.segment_source or self.var.segment_source}
        return out


# --------------------------------------------------------------------------- files
def file_name(label: date) -> str:
    return f"NASA-SSH_alt_ref_simple_grid_v1_1_{label:%Y%m%d}.nc"


def to_dataset(wk: RawWeek, counts_seed: int = 0) -> Any:
    """The card's pseudo-CDL as an xarray Dataset (raw values; fills already in place)."""
    import xarray as xr

    ssha = np.asarray(wk.ssha, dtype=np.float64)
    valid = ssha < 1e300
    rng = np.random.default_rng([counts_seed, wk.label.toordinal()])
    counts = np.where(valid, rng.integers(1, 200, ssha.shape), FILL_I32).astype(np.int32)
    t = (datetime(wk.label.year, wk.label.month, wk.label.day) - EPOCH).total_seconds()
    table = basin_table()
    ids = [int(s.split(",")[0]) for s in table]
    meanings = " ".join(s.split(",", 1)[1].replace(" ", "_").replace(":", "_").replace("-", "_") for s in table)
    lat_attrs = {"units": "degrees_north", "standard_name": "latitude", "valid_min": -90.0, "valid_max": 90.0}
    lon_attrs = {"units": "degrees_east", "standard_name": "longitude", "valid_min": 0.0, "valid_max": 360.0}
    start = wk.label - timedelta(days=5)
    end = wk.label + timedelta(days=6)
    ds = xr.Dataset(
        data_vars={
            "ssha": (("latitude", "longitude"), ssha,
                     {"units": "m", "standard_name": "sea_surface_height_above_sea_level",
                      "long_name": "sea surface height anomaly", "_FillValue": FILL_F64}),
            "counts": (("latitude", "longitude"), counts,
                       {"valid_min": 0, "valid_max": 500, "_FillValue": np.int32(FILL_I32),
                        "long_name": "number of along-track values weighted into the cell"}),
            "basin_flag": (("latitude", "longitude"), np.asarray(wk.basin_flag, dtype=np.int32),
                           {"_FillValue": np.int32(FILL_I32), "flag_values": np.array(ids, dtype=np.int32),
                            "flag_meanings": meanings}),
            "basin_names_table": (("basins",), np.array(table, dtype=object)),
        },
        coords={
            "latitude": (("latitude",), np.asarray(wk.latitude, dtype=np.float32), lat_attrs),
            "longitude": (("longitude",), np.asarray(wk.longitude, dtype=np.float32), lon_attrs),
            "time": ((), np.float64(t), {"units": "seconds since 1990-01-01 00:00:00", "standard_name": "time"}),
        },
        attrs={
            "title": "SYNTHETIC STAND-IN for NASA-SSH Simple Gridded Sea Surface Height V1.1 (not NASA data)",
            "Conventions": "CF-1.9", "geospatial_lat_min": -90.0, "geospatial_lat_max": 90.0,
            "geospatial_lon_min": 0.0, "geospatial_lon_max": 360.0, "mean_sea_surface": "DTU21",
            "time_coverage_start": f"{start:%Y-%m-%d}T00:00:00", "time_coverage_end": f"{end:%Y-%m-%d}T00:00:00",
            "synthetic_standin": "true", "institution": "Trend Detective pipeline/standin (synthetic)",
        },
    )
    return ds


def netcdf_engine() -> tuple[str, str]:
    """(engine, format): netCDF-4 when a netCDF-4 writer is installed, else netCDF-3 via scipy."""
    for engine in ("h5netcdf", "netcdf4"):
        try:
            __import__("h5netcdf" if engine == "h5netcdf" else "netCDF4")
            return engine, "NETCDF4"
        except ImportError:
            continue
    return "scipy", "NETCDF3_64BIT"


def write_week(wk: RawWeek, out_dir: Path, **kw: Any) -> Path:
    ds = to_dataset(wk, **kw)
    engine, fmt = netcdf_engine()
    path = Path(out_dir) / file_name(wk.label)
    enc: dict[str, dict[str, Any]] = {name: {} for name in ds.variables}
    if fmt == "NETCDF4":
        for name in ("ssha", "counts", "basin_flag"):
            enc[name].update(zlib=True, complevel=5) if engine == "netcdf4" else enc[name].update(
                compression="gzip", compression_opts=5)
    # _FillValue lives in attrs above; move it to encoding so xarray writes it once and does not re-mask.
    for name in ("ssha", "counts", "basin_flag"):
        enc[name]["_FillValue"] = ds[name].attrs.pop("_FillValue")
    for name in ("latitude", "longitude", "time"):
        enc[name]["_FillValue"] = None
    ds.to_netcdf(path, engine=engine, format=fmt, encoding=enc)
    return path
