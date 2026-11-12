"""Ingest (pipeline/ingest) and stand-ins (pipeline/standin): round trips and robustness.

Real downloads and synthetic stand-ins share one ingest path, so these tests pin
(1) exact known values on tiny deterministic files, (2) every layout item the
dataset cards mark UNVERIFIED (axis order, longitude convention, fill styles,
GMSL header length and marker, IMBIE date format and column names/order),
(3) the averaging rules (cos-lat band weights, > 20% weight lost -> week missing,
>= 3 weeks per month), and (4) the CLI on a small stand-in set.
"""

from __future__ import annotations

import json
import math
import shutil
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pytest

from pipeline.ingest.docs import read_marker, write_marker
from pipeline.ingest.gmsl import (datetime_to_decimal_year, decimal_year_to_datetime, find_gmsl_file, gmsl_monthly,
                                  parse_gmsl)
from pipeline.ingest.grid import (MAX_WEIGHT_LOSS, Grid, IngestError, RawWeek, RegionAverager, SeaLevelIngest,
                                  label_from_name, mask_fill, monthly_from_weekly, polygons_from_topo, read_ssh_file,
                                  read_weeks)
from pipeline.ingest.imbie import (annual_rate, list_imbie_files, parse_date, parse_imbie_csv, read_imbie_csv,
                                   region_for_file)
from pipeline.ingest.run import imbie_docs, sea_level_docs
from pipeline.standin.gmsl import write_gmsl
from pipeline.standin.imbie import HEADERS, region_rows, write_imbie_standins, write_region_csv
from pipeline.standin.ssh import FILL_F64, SSHStandin, file_name, raw_coords, write_week
from pipeline.synthetic import config as C
from pipeline.synthetic.assemble import config_topo
from pipeline.validate import validate

REPO = Path(__file__).resolve().parents[2]
SEED = C.DEFAULT_SEED
# 0.5-degree NASA-SSH cells whose centre lies in each sea polygon (memory: synthetic-generator).
SEA_CELLS = {"bay_of_bengal": 257, "gulf_of_mexico": 350, "us_east_coast": 151,
             "western_tropical_pacific": 2098, "north_sea": 128, "mediterranean": 248}


# =========================================================================== helpers
def _quiet(*_a: object) -> None:
    pass


def band_weight(lat: float, half: float = 0.25) -> float:
    """Independent restatement of the card's weight: sin(lat + h) - sin(lat - h)."""
    return math.sin(math.radians(lat + half)) - math.sin(math.radians(lat - half))


def box(w: float, s: float, e: float, n: float) -> list[tuple[list[tuple[float, float]], list]]:
    return [([(w, s), (e, s), (e, n), (w, n), (w, s)], [])]


# Tiny grid: 8 rows at 60.25..63.75 N (unequal weights), 8 columns straddling 0 E.
TINY_LAT = np.arange(60.25, 64.0, 0.5)
TINY_LON_PM = np.array([-1.75, -1.25, -0.75, -0.25, 0.25, 0.75, 1.25, 1.75])     # -180..180, ascending
TINY_POLY = {"box": box(-1.0, 61.0, 1.0, 63.0)}       # 4 x 4 cells: lat 61.25..62.75, lon -0.75..0.75


def tiny_field(t_years: float = 0.0, slope_mm: float = 0.0) -> np.ndarray:
    """mm, normalised layout (lat ascending, lon -180..180 ascending). Deterministic, no symmetry."""
    lat2, lon2 = np.meshgrid(TINY_LAT, TINY_LON_PM, indexing="ij")
    return 10.0 * (lat2 - 60.0) + 3.0 * lon2 + 0.5 * lat2 * lon2 + slope_mm * t_years


def expected_mean(field_mm: np.ndarray, poly_mask: np.ndarray) -> float:
    num = den = 0.0
    for i, la in enumerate(TINY_LAT):
        for j in range(len(TINY_LON_PM)):
            if poly_mask[i, j] and np.isfinite(field_mm[i, j]):
                num += band_weight(la) * field_mm[i, j]
                den += band_weight(la)
    return num / den


def tiny_box_mask() -> np.ndarray:
    lat2, lon2 = np.meshgrid(TINY_LAT, TINY_LON_PM, indexing="ij")
    return (lat2 > 61.0) & (lat2 < 63.0) & (lon2 > -1.0) & (lon2 < 1.0)


def stored_layout(field_mm: np.ndarray, *, lat_desc: bool, lon360: bool) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Re-store a normalised field in a file layout: (lat, lon, values)."""
    lat, lon, v = TINY_LAT.copy(), TINY_LON_PM.copy(), field_mm.copy()
    if lon360:
        lon = lon % 360.0
        order = np.argsort(lon)                       # 0.25..1.75, 358.25..359.75
        lon, v = lon[order], v[:, order]
    if lat_desc:
        lat, v = lat[::-1], v[::-1]
    return lat, lon, v


def write_tiny_nc(path: Path, label: date, ssha_m: np.ndarray, lat: np.ndarray, lon: np.ndarray, *,
                  fill: float | None = FILL_F64, basin: np.ndarray | None = None,
                  units: str = "m", extra_attrs: dict | None = None, time_label: date | None = None) -> Path:
    """A small netCDF in the card's variable layout, with a chosen fill convention."""
    import xarray as xr

    t = (time_label or label) - date(1990, 1, 1)
    attrs = {"units": units, **(extra_attrs or {})}
    data_vars = {"ssha": (("latitude", "longitude"), np.asarray(ssha_m, np.float64), attrs)}
    if basin is not None:
        data_vars["basin_flag"] = (("latitude", "longitude"), basin.astype(np.int32))
    ds = xr.Dataset(data_vars, coords={
        "latitude": ("latitude", lat.astype(np.float32)), "longitude": ("longitude", lon.astype(np.float32)),
        "time": ((), float(t.total_seconds()), {"units": "seconds since 1990-01-01 00:00:00"})})
    enc = {"ssha": {"_FillValue": fill}, "latitude": {"_FillValue": None}, "longitude": {"_FillValue": None},
           "time": {"_FillValue": None}}
    if basin is not None:
        enc["basin_flag"] = {"_FillValue": np.int32(2147483647)}
    ds.to_netcdf(path, engine="scipy", format="NETCDF3_64BIT", encoding=enc)
    return path


@pytest.fixture(scope="module")
def topo() -> dict:
    return config_topo()


@pytest.fixture(scope="module")
def standin(topo: dict) -> SSHStandin:
    return SSHStandin(SEED, topo)


# =========================================================================== grid: exact values
def test_band_weights_are_true_cell_areas() -> None:
    g = Grid(TINY_LAT, TINY_LON_PM)
    for i, la in enumerate(TINY_LAT):
        assert g.weights[i, 0] == pytest.approx(band_weight(la), rel=1e-12)
    # Whole-sphere check on the real 0.5-degree grid: weights sum to 2 per column (area / (R^2 dlon)).
    lat, lon = raw_coords()
    assert Grid(lat, lon).weights[:, 0].sum() == pytest.approx(2.0, rel=1e-9)


def test_tiny_file_round_trip_exact(tmp_path: Path) -> None:
    field = tiny_field()
    lat, lon, v = stored_layout(field, lat_desc=False, lon360=True)
    p = write_tiny_nc(tmp_path / file_name(date(2020, 1, 6)), date(2020, 1, 6), v / 1000.0, lat, lon)
    wk = read_ssh_file(p)
    assert wk.label == date(2020, 1, 6) and wk.units == "m"
    ing = SeaLevelIngest(TINY_POLY, ["box", "global"])
    out = ing.add(wk)
    assert out["box"] == pytest.approx(expected_mean(field, tiny_box_mask()), abs=1e-9)
    assert out["global"] == pytest.approx(expected_mean(field, np.ones_like(field, bool)), abs=1e-9)
    assert ing._avg is not None and ing._avg.cell_counts() == {"box": 16, "global": 64}


@pytest.mark.parametrize("lat_desc", [False, True], ids=["lat_asc", "lat_desc"])
@pytest.mark.parametrize("lon360", [False, True], ids=["lon_pm180", "lon_0_360"])
def test_axis_order_and_lon_convention_do_not_change_means(tmp_path: Path, lat_desc: bool, lon360: bool) -> None:
    field = tiny_field()
    field[2, 3] = np.nan                                          # a missing cell inside the box
    lat, lon, v = stored_layout(field, lat_desc=lat_desc, lon360=lon360)
    p = write_tiny_nc(tmp_path / file_name(date(2020, 1, 6)), date(2020, 1, 6), v / 1000.0, lat, lon)
    wk = read_ssh_file(p)
    ing = SeaLevelIngest(TINY_POLY, ["box", "global"])
    out = ing.add(wk)
    assert out["box"] == pytest.approx(expected_mean(field, tiny_box_mask()), abs=1e-9)
    assert out["global"] == pytest.approx(expected_mean(field, np.ones_like(field, bool)), abs=1e-9)
    # Normalised grid is the same whatever the stored order.
    assert np.array_equal(ing._grid.lat, TINY_LAT) and np.allclose(ing._grid.lon, TINY_LON_PM)


def test_grid_unapply_inverts_apply() -> None:
    lat, lon, _ = stored_layout(tiny_field(), lat_desc=True, lon360=True)
    g = Grid(lat, lon)
    a = np.arange(64.0).reshape(8, 8)
    assert np.array_equal(g.unapply(g.apply(a)), a)
    assert np.array_equal(g.apply(g.unapply(a)), a)


@pytest.mark.parametrize("style", ["float64_max", "nan_no_fillvalue", "big_1e30", "big_9.96921e36",
                                   "fillvalue_-9999", "fillvalue_nan"])
def test_fill_styles_are_missing(tmp_path: Path, style: str) -> None:
    field = tiny_field()
    holes = [(2, 3), (3, 4), (0, 0)]
    lat, lon, v = stored_layout(field, lat_desc=False, lon360=True)
    ssha = v / 1000.0
    fill = {"float64_max": FILL_F64, "nan_no_fillvalue": None, "big_1e30": None, "big_9.96921e36": None,
            "fillvalue_-9999": -9999.0, "fillvalue_nan": np.nan}[style]
    raw_hole = {"float64_max": FILL_F64, "nan_no_fillvalue": np.nan, "big_1e30": 1e30, "big_9.96921e36": 9.96921e36,
                "fillvalue_-9999": -9999.0, "fillvalue_nan": np.nan}[style]
    # Holes in normalised positions -> stored positions (lon360 sorted order).
    order = np.argsort(TINY_LON_PM % 360.0)
    inv = np.argsort(order)
    for i, j in holes:
        ssha[i, inv[j]] = raw_hole
        field[i, j] = np.nan
    p = write_tiny_nc(tmp_path / file_name(date(2020, 1, 6)), date(2020, 1, 6), ssha, lat, lon, fill=fill)
    wk = read_ssh_file(p)
    ing = SeaLevelIngest(TINY_POLY, ["box", "global"])
    out = ing.add(wk)
    assert out["box"] == pytest.approx(expected_mean(field, tiny_box_mask()), abs=1e-9)
    assert out["global"] == pytest.approx(expected_mean(field, np.ones_like(field, bool)), abs=1e-9)


def test_mask_fill_rules() -> None:
    v = np.array([1.0, np.nan, 1e30, -1e30, 9.96921e36, FILL_F64, -9999.0, 9.99e29])
    out = mask_fill(v, -9999.0)
    assert np.isnan(out[1:7]).all() and out[0] == 1.0 and out[7] == 9.99e29
    assert np.isnan(mask_fill(np.array([np.inf]))).all()
    assert mask_fill(np.array([-9999.0]))[0] == -9999.0            # no _FillValue -> a real value


@pytest.mark.parametrize("units,factor", [("m", 1000.0), ("cm", 10.0), ("mm", 1.0)])
def test_units_converted_to_mm(tmp_path: Path, units: str, factor: float) -> None:
    field = tiny_field()
    lat, lon, v = stored_layout(field, lat_desc=False, lon360=False)
    p = write_tiny_nc(tmp_path / file_name(date(2020, 1, 6)), date(2020, 1, 6), v / factor, lat, lon, units=units)
    out = SeaLevelIngest(TINY_POLY, ["box"]).add(read_ssh_file(p))
    assert out["box"] == pytest.approx(expected_mean(field, tiny_box_mask()), abs=1e-9)


def test_read_preflight_errors_and_warnings(tmp_path: Path) -> None:
    lat, lon, v = stored_layout(tiny_field(), lat_desc=False, lon360=False)
    label = date(2020, 1, 6)
    p = write_tiny_nc(tmp_path / file_name(label), label, v, lat, lon, extra_attrs={"scale_factor": 0.001})
    with pytest.raises(IngestError, match="scale_factor"):
        read_ssh_file(p)
    q = tmp_path / "b" / file_name(label)
    q.parent.mkdir()
    write_tiny_nc(q, label, v, lat, lon, time_label=label + timedelta(days=1))
    wk = read_ssh_file(q)
    assert wk.label == label                                       # the file name wins
    assert any("differs from the label date" in w for w in wk.warnings)
    assert any("expected 360x720" in w for w in wk.warnings)
    r = tmp_path / "c" / file_name(label)
    r.parent.mkdir()
    write_tiny_nc(r, label, v, lat, lon, units="furlong")
    with pytest.raises(IngestError, match="units"):
        SeaLevelIngest(TINY_POLY, ["box"]).add(read_ssh_file(r))
    assert label_from_name(Path("NASA-SSH_alt_ref_simple_grid_v1_1_20261102.nc")) == date(2026, 11, 2)
    assert label_from_name(Path("other.nc")) is None


# =========================================================================== averaging rules
def _one_row_grid() -> tuple[Grid, dict]:
    """5 equal-weight cells in the region (one latitude row), so 1 cell = exactly 20% of the weight."""
    lat = np.array([10.25, 10.75, 11.25])
    lon = np.arange(0.25, 5.0, 0.5)                                 # 10 columns
    poly = {"strip": box(0.0, 10.5, 2.5, 11.0)}                     # row 10.75, columns 0.25..2.25 -> 5 cells
    return Grid(lat, lon), poly


def test_weight_loss_rule_boundary() -> None:
    g, poly = _one_row_grid()
    avg = RegionAverager(g, poly, ["strip"], None)
    assert avg.cell_counts() == {"strip": 5}
    base = np.full(g.shape, 7.0)
    assert avg.week_means(base)["strip"] == pytest.approx(7.0)
    one = base.copy()
    one[1, 0] = np.nan                                              # exactly 20% lost -> kept
    assert MAX_WEIGHT_LOSS == 0.20
    assert avg.week_means(one)["strip"] == pytest.approx(7.0)
    two = one.copy()
    two[1, 1] = np.nan                                              # 40% lost -> missing
    assert avg.week_means(two)["strip"] is None
    assert avg.week_means(np.full(g.shape, np.nan))["strip"] is None


def test_weight_loss_is_by_area_not_cell_count() -> None:
    """Unequal weights: 4 of 16 cells (25% of cells) can be under 20% of the area, or over it."""
    g = Grid(TINY_LAT, TINY_LON_PM)
    avg = RegionAverager(g, TINY_POLY, ["box"], None)
    w_rows = [band_weight(la) for la in (61.25, 61.75, 62.25, 62.75)]
    total = 4 * sum(w_rows)
    base = tiny_field()
    lose_north = base.copy()
    lose_north[5, 2:6] = np.nan                                     # row 62.75: the smallest weight
    lose_south = base.copy()
    lose_south[2, 2:6] = np.nan                                     # row 61.25: the largest weight
    share_n, share_s = 4 * w_rows[3] / total, 4 * w_rows[0] / total
    assert share_n < 0.25 < share_s                                 # both rows are 25% of the cells
    # Each row is > 20% of the weight here, so both weeks are missing; one row minus one cell is not.
    assert avg.week_means(lose_north)["box"] is None and avg.week_means(lose_south)["box"] is None
    three = base.copy()
    three[5, 2:5] = np.nan
    assert 3 * w_rows[3] / total <= MAX_WEIGHT_LOSS
    exp = expected_mean(three, tiny_box_mask())
    assert avg.week_means(three)["box"] == pytest.approx(exp, abs=1e-9)


def test_global_weight_loss_needs_basin_flag() -> None:
    g, _ = _one_row_grid()
    vals = np.full(g.shape, 3.0)
    vals[:, :5] = np.nan                                            # half the grid gone
    no_basin = RegionAverager(g, {}, ["global"], None)
    assert no_basin.week_means(vals)["global"] == pytest.approx(3.0)
    with_basin = RegionAverager(g, {}, ["global"], np.ones(g.shape, bool))
    assert with_basin.week_means(vals)["global"] is None


def test_basin_flag_land_and_fill_are_not_ocean(tmp_path: Path) -> None:
    field = tiny_field()
    lat, lon, v = stored_layout(field, lat_desc=False, lon360=False)
    basin = np.full(field.shape, 3)
    basin[0, :] = 0                                                 # land row
    basin[7, :] = 2147483647                                        # fill row
    p = write_tiny_nc(tmp_path / file_name(date(2020, 1, 6)), date(2020, 1, 6), v / 1000.0, lat, lon, basin=basin)
    out = SeaLevelIngest(TINY_POLY, ["global"]).add(read_ssh_file(p))
    ocean = np.ones(field.shape, bool)
    ocean[0, :] = ocean[7, :] = False
    assert out["global"] == pytest.approx(expected_mean(field, ocean), abs=1e-9)


def test_monthly_needs_three_weeks_and_uses_label_month() -> None:
    labels = [date(2020, 1, 6) + timedelta(days=7 * k) for k in range(13)]   # 2020-01-06 .. 2020-03-30
    # Jan: 4 labels (6, 13, 20, 27; the 27th's window runs into Feb but it counts for Jan).
    # Feb: 4 labels (3, 10, 17, 24), only 2 valid -> null.  Mar: 5 labels, 3 valid.
    vals: list[float | None] = [1.0, 2.0, 3.0, 4.0, 10.0, None, None, 20.0, 5.0, None, 6.0, None, 7.0]
    months, out = monthly_from_weekly(labels, vals)
    assert months == ["2020-01", "2020-02", "2020-03"]
    assert out == [2.5, None, 6.0]
    # Edge months without 3 valid weeks are not padded in: the grid starts at the first good month.
    months, out = monthly_from_weekly(labels, [None, None, 1.0, 1.0] + vals[4:])
    assert months == ["2020-03"] and out == [6.0]
    assert monthly_from_weekly(labels[:2], [1.0, 2.0]) == ([], [])


def test_weeks_must_ascend() -> None:
    g = tiny_field() / 1000.0
    ing = SeaLevelIngest(TINY_POLY, ["box"])
    wk = RawWeek(label=date(2020, 1, 13), latitude=TINY_LAT, longitude=TINY_LON_PM, ssha=g)
    ing.add(wk)
    with pytest.raises(IngestError, match="out of order"):
        ing.add(RawWeek(label=date(2020, 1, 6), latitude=TINY_LAT, longitude=TINY_LON_PM, ssha=g))


def test_recovered_slope_on_short_file_series(tmp_path: Path) -> None:
    """Two years of weekly tiny files with a 4.2 mm/yr trend and noise: monthly OLS slope near 4.2."""
    rng = np.random.default_rng(7)
    start = date(2019, 1, 7)
    for k in range(104):
        lab = start + timedelta(days=7 * k)
        t = (lab - start).days / 365.25
        f = tiny_field(t, 4.2) + rng.normal(0, 2.0, (8, 8))
        lat, lon, v = stored_layout(f, lat_desc=True, lon360=True)
        write_tiny_nc(tmp_path / file_name(lab), lab, v / 1000.0, lat, lon)
    ing = SeaLevelIngest(TINY_POLY, ["box"])
    for wk in read_weeks(tmp_path):
        ing.add(wk)
    months, vals = ing.monthly("box")
    assert months[0] == "2019-01" and months[-1] == "2020-12" and None not in vals
    tm = np.array([int(m[:4]) + (int(m[5:]) - 0.5) / 12 for m in months])
    slope = np.polyfit(tm, np.array(vals, float), 1)[0]
    assert slope == pytest.approx(4.2, abs=0.3)


# =========================================================================== real polygons, stand-in files
def test_coastal_sea_cell_counts(topo: dict, standin: SSHStandin) -> None:
    lat, lon = raw_coords()
    polys = polygons_from_topo(topo)
    seas = [r for r in standin.region_ids if r != "global"]
    assert set(seas) == set(SEA_CELLS)
    counts = RegionAverager(Grid(lat, lon), polys, seas, None).cell_counts()
    assert counts == SEA_CELLS
    # The stand-in ocean mask never removes a sea cell, so the ingest sees the same counts.
    assert {r: n for r, n in standin.avg.cell_counts().items() if r != "global"} == SEA_CELLS


def test_standin_file_layout_matches_card(tmp_path: Path, standin: SSHStandin) -> None:
    import xarray as xr

    p = write_week(standin.raw_week(3), tmp_path, counts_seed=SEED)
    assert p.name == f"NASA-SSH_alt_ref_simple_grid_v1_1_{standin.labels[3]:%Y%m%d}.nc"
    with xr.open_dataset(p, mask_and_scale=False, decode_times=False) as ds:
        assert dict(ds.sizes)["latitude"] == 360 and dict(ds.sizes)["longitude"] == 720
        assert ds["ssha"].dtype == np.float64 and ds["ssha"].attrs["units"] == "m"
        assert float(ds["ssha"].attrs["_FillValue"]) == FILL_F64
        assert ds["latitude"].dtype == np.float32 and float(ds["latitude"][0]) == -89.75
        assert float(ds["longitude"][0]) == 0.25 and float(ds["longitude"][-1]) == 359.75
        assert ds["time"].ndim == 0 and ds["time"].attrs["units"] == "seconds since 1990-01-01 00:00:00"
        assert "scale_factor" not in ds["ssha"].attrs
        assert ds["basin_flag"].dtype == np.int32
    assert read_ssh_file(p).warnings == []


def test_file_path_equals_in_memory_path(tmp_path: Path, topo: dict, standin: SSHStandin) -> None:
    """The build feeds RawWeeks in memory; reading the written files must give identical numbers."""
    polys = polygons_from_topo(topo)
    mem = SeaLevelIngest(polys, standin.region_ids)
    disk = SeaLevelIngest(polys, standin.region_ids)
    for i in (0, 1, 2):
        mem.add(standin.raw_week(i))
        disk.add(read_ssh_file(write_week(standin.raw_week(i), tmp_path, counts_seed=SEED)))
    assert mem.weekly == disk.weekly
    assert mem.labels == disk.labels


def test_standin_failed_and_partial_weeks_reach_the_series(standin: SSHStandin, topo: dict) -> None:
    """Failed weeks and > 20% partial losses (written as fills) come out as missing weeks / null months."""
    polys = polygons_from_topo(topo)
    partial = sorted(standin.partial)[:2]
    failed = [int(i) for i in np.flatnonzero(standin.failed)[:1]]
    ing = SeaLevelIngest(polys, standin.region_ids)
    for i in sorted(set(partial + failed)):
        ing.add(standin.raw_week(i))
    by_label = dict(zip(ing.labels, range(len(ing.labels))))
    for i in failed:
        k = by_label[standin.labels[i]]
        assert all(ing.weekly[r][k] is None for r in standin.region_ids)
    lost_any = False
    for i in partial:
        k = by_label[standin.labels[i]]
        nones = [r for r in standin.region_ids if r != "global" and ing.weekly[r][k] is None]
        lost_any |= bool(nones)
        assert ing.weekly["global"][k] is not None
    assert lost_any
    assert len(standin.gap_months) == C.VARIABLES[[v.id for v in C.VARIABLES].index("sea_level")].series[
        "global"].gaps


# =========================================================================== GMSL indicator text
def _gmsl_text(n_header: int, marker: str | None, rows: list[str], blank_after: bool = True) -> str:
    head = [f"HDR line {k} GMSL (cm)" if k == 1 else ("HDR" if k % 5 == 0 else f"HDR text {k}")
            for k in range(n_header - (1 if marker else 0))]
    if marker:
        head.append(f"HDR {marker}")
    return "\n".join(head + ([""] if blank_after else []) + rows) + "\n"


ROWS = ["1993.0109589    -0.123456    nan", "1993.0301370     0.010000    -0.050000",
        "1993.0493151          nan    nan", "1993.0684932   9.96921E36    nan",
        "1993.0876712   1.0000E31    nan", "", "1993.1068493     0.250000     0.100000"]


@pytest.mark.parametrize("n_header", [1, 10, 42, 57])
@pytest.mark.parametrize("marker", ["Header_End", "HEADER END", None])
def test_gmsl_header_detection(n_header: int, marker: str | None) -> None:
    if marker and n_header == 1:
        pytest.skip("one header line cannot hold both units and the marker")
    times, vals, header, factor = parse_gmsl(_gmsl_text(n_header, marker, ROWS, blank_after=n_header % 2 == 0))
    assert len(header) == n_header and factor == 10.0
    assert len(times) == 6
    assert vals[0] == pytest.approx(-1.23456) and vals[1] == pytest.approx(0.1)
    assert vals[2] is None and vals[3] is None and vals[4] is None
    assert vals[5] == pytest.approx(2.5)


def test_gmsl_units_from_header() -> None:
    rows = ["2000.5000000     1.500000    nan", "2000.5200000     1.600000    nan"]
    assert parse_gmsl("HDR 2 GMSL (mm)\n" + "\n".join(rows))[3] == 1.0
    assert parse_gmsl("HDR 2 GMSL in m\n" + "\n".join(rows))[3] == 1000.0
    assert parse_gmsl("HDR 2 GMSL in cm\n" + "\n".join(rows))[3] == 10.0
    with pytest.raises(IngestError, match="ascending"):
        parse_gmsl("HDR x\n" + "\n".join(rows[::-1]))
    with pytest.raises(IngestError, match="no data"):
        parse_gmsl("HDR x\nHDR y\n\n")


def test_decimal_year_round_trip_leap_aware() -> None:
    from datetime import datetime

    for dt in (datetime(1993, 1, 5, 0, 4), datetime(2000, 12, 31, 12, 0), datetime(2024, 2, 29, 6, 30)):
        assert decimal_year_to_datetime(datetime_to_decimal_year(dt)) == dt
    assert decimal_year_to_datetime(2024.5) == datetime(2024, 7, 2)          # leap year: 183 days


@pytest.mark.parametrize("missing", ["nan", "flag"])
def test_gmsl_standin_round_trip(tmp_path: Path, missing: str) -> None:
    labels = [date(1993, 1, 4) + timedelta(days=7 * k) for k in range(70)]
    vals = [0.5 * k + (np.nan if k in (10, 11) else 0.0) for k in range(70)]
    p = write_gmsl(tmp_path / "NASA_SSH_GMSL_INDICATOR.txt", labels, vals, missing=missing)
    text = p.read_text(encoding="utf-8")
    assert sum(line.startswith("HDR") for line in text.splitlines()) == 42
    assert ("9.96921E36" in text.split("Header_End")[1]) == (missing == "flag")
    times, got, header, factor = parse_gmsl(text)
    assert factor == 10.0 and [t.date() for t in times] == labels
    ref = np.nanmean([v for d, v in zip(labels, vals) if d.year == 1993])
    for v, g in zip(vals, got):
        if np.isnan(v):
            assert g is None
        else:
            assert g == pytest.approx(v - ref, abs=1e-4)                   # 6 decimals of cm
    months, mvals = gmsl_monthly(p)
    assert months[0] == "1993-01" and len(months) == len(mvals)
    dated = tmp_path / "NASA_SSH_GMSL_INDICATOR_20250414.txt"
    shutil.copy(p, dated)
    assert find_gmsl_file(tmp_path) == p                                    # undated current file wins
    p.unlink()
    assert find_gmsl_file(tmp_path) == dated


# =========================================================================== IMBIE CSV
def _rows(dates: list[str], cum: list[float], rate: dict[str, float]) -> list[list[float | None]]:
    out = []
    for d, c in zip(dates, cum):
        r = rate[d[:4]]
        out.append([r, 10.0, c, 5.0 + 0.01 * len(out), 0.4 * r, 6.0, 0.0, 3.0, 0.6 * r, 6.0, 0.0, 3.0])
    return out


def _known_case() -> tuple[list[str], list[float], dict[str, float]]:
    dates = [f"{y}-{m:02d}" for y in (2019, 2020, 2021) for m in range(1, 13)][3:-2]   # 2019-04 .. 2021-10
    cum = [round(-1.5 * k + 0.25 * (k % 3), 4) for k in range(len(dates))]
    rate = {"2019": -250.0, "2020": -300.5, "2021": -199.25}
    return dates, cum, rate


@pytest.mark.parametrize("date_format", ["iso", "decimal"])
def test_imbie_round_trip_exact(tmp_path: Path, date_format: str) -> None:
    dates, cum, rate = _known_case()
    p = write_region_csv(tmp_path / "imbie3_greenland_Gt_partitioned.csv", dates, _rows(dates, cum, rate),
                         date_format=date_format)
    t = read_imbie_csv(p)
    assert t.region == "greenland" and t.months == dates
    assert t.cumulative == cum
    assert t.rate == [rate[d[:4]] for d in dates]
    assert t.cumulative_sigma[0] == 5.0 and t.rate_sigma[0] == 10.0
    years, r, s = annual_rate(t)
    assert years == ["2020"] and r == [-300.5] and s == [10.0]           # 2019, 2021 incomplete: left out


def test_imbie_shuffled_columns(tmp_path: Path) -> None:
    dates, cum, rate = _known_case()
    order = [3, 7, 0, 12, 1, 5, 2, 9, 4, 11, 6, 8, 10]                 # date in column 3
    p = write_region_csv(tmp_path / "imbie3_west_antarctica_Gt_partitioned.csv", dates, _rows(dates, cum, rate),
                         order=order, comments=["IMBIE 2026 stand-in", "units Gt"])
    t = read_imbie_csv(p)
    assert t.region == "antarctica_west" and t.months == dates and t.cumulative == cum
    assert t.columns["cumulative"].lower().startswith("cumulative mass balance")


def _csv(headers: list[str], rows: list[list[str]], pre: str = "") -> str:
    return pre + "\n".join(",".join(r) for r in [headers] + rows) + "\n"


def test_imbie_2021_style_headers_and_keyword_matching() -> None:
    headers = ["Year", "Mass balance (Gt/yr)", "Mass balance uncertainty (Gt/yr)", "Cumulative mass balance (Gt)",
               "Cumulative mass balance uncertainty (Gt)"]
    rows = [[f"{1992 + k / 12:.4f}", "-100", "20", f"{-8.3 * k:.1f}", "3"] for k in range(24)]
    t = parse_imbie_csv(_csv(headers, rows), "greenland")
    assert t.months[0] == "1992-01" and t.months[-1] == "1993-12" and len(t.months) == 24
    assert t.cumulative[12] == pytest.approx(-99.6)
    upper = [h.upper() for h in headers[::-1]]                          # reversed and upper-case
    t2 = parse_imbie_csv(_csv(upper, [r[::-1] for r in rows], pre="\n\n"), "greenland")
    assert t2.cumulative == t.cumulative and t2.rate == t.rate
    renamed = ["Decimal year", "mass balance rate (Gt/yr)", "mass balance rate uncertainty (Gt/yr)",
               "cumulative mass balance anomaly (Gt)", "cumulative mass balance anomaly uncertainty (Gt)"]
    t3 = parse_imbie_csv(_csv(renamed, rows), "greenland")
    assert t3.cumulative == t.cumulative


def test_imbie_missing_or_ambiguous_columns_fail_loudly() -> None:
    rows = [["2000-01-01", "1", "2", "3"]]
    with pytest.raises(IngestError, match="cumulative uncertainty"):
        parse_imbie_csv(_csv(["Date", "Mass balance (Gt/yr)", "Mass balance uncertainty (Gt/yr)",
                              "Cumulative mass balance (Gt)"], rows), "greenland")
    both = ["Date", "Mass balance (Gt/yr)", "Mass balance B (Gt/yr)", "Mass balance uncertainty (Gt/yr)",
            "Cumulative mass balance (Gt)", "Cumulative mass balance uncertainty (Gt)"]
    with pytest.raises(IngestError, match="exactly one"):
        parse_imbie_csv(_csv(both, [["2000-01-01", "1", "1", "2", "3", "4"]]), "greenland")
    with pytest.raises(IngestError, match="mm"):
        parse_imbie_csv(_csv(["Date", "Mass balance (mm/yr)", "Mass balance uncertainty (mm/yr)",
                              "Cumulative mass balance (mm)", "Cumulative mass balance uncertainty (mm)"],
                             [["2000-01-01", "1", "2", "3", "4"]]), "greenland")
    with pytest.raises(IngestError, match="header"):
        parse_imbie_csv("1,2,3\n4,5,6\n", "greenland")


@pytest.mark.parametrize("cell,expected", [
    ("1992", (1992, 1)), ("1992.0833", (1992, 2)), ("1992.0834", (1992, 2)), ("1992.0416", (1992, 1)),
    ("1992.125", (1992, 2)), ("1992.9167", (1992, 12)), ("1992.9583", (1992, 12)), ("1992.95", (1992, 12)),
    ("2023-12-01", (2023, 12)), ("2023-12", (2023, 12)), ('"1971-07-01"', (1971, 7)), ("2001-03-01T00:00:00", (2001, 3)),
])
def test_imbie_date_formats(cell: str, expected: tuple[int, int]) -> None:
    assert parse_date(cell) == expected


def test_imbie_every_k_over_12_lands_in_its_month() -> None:
    for k in range(12):
        for digits in (3, 4, 6):
            assert parse_date(f"{2000 + k / 12:.{digits}f}") == (2000, k + 1)
            assert parse_date(f"{2000 + (k + 0.5) / 12:.{digits}f}") == (2000, k + 1)


def test_imbie_missing_cells_and_gaps() -> None:
    headers = ["Date", "Mass balance (Gt/yr)", "Mass balance uncertainty (Gt/yr)", "Cumulative mass balance (Gt)",
               "Cumulative mass balance uncertainty (Gt)"]
    rows = [["2000-01-01", "", "nan", "1.5", "9.96921E36"], ["2000-03-01", "NaN", "1", "2", "1"]]
    t = parse_imbie_csv(_csv(headers, rows), "greenland")
    assert t.months == ["2000-01", "2000-02", "2000-03"]                # a skipped month becomes null, not dropped
    assert t.cumulative == [1.5, None, 2.0] and t.cumulative_sigma == [None, None, 1.0]
    assert t.rate == [None, None, None]
    with pytest.raises(IngestError, match="two rows"):
        parse_imbie_csv(_csv(headers, rows + [["2000.1667", "1", "1", "1", "1"]]), "greenland")


def test_annual_rate_interior_gap_is_null() -> None:
    from pipeline.ingest.imbie import ImbieTable

    months = [f"{y}-{m:02d}" for y in (2000, 2001, 2002) for m in range(1, 13)]
    rate = [1.0] * 12 + [2.0] * 11 + [None] + [3.0] * 12
    t = ImbieTable("greenland", months, rate, [0.5] * 36, [0.0] * 36, [0.0] * 36, {})
    assert annual_rate(t) == (["2000", "2001", "2002"], [1.0, None, 3.0], [0.5, None, 0.5])


def test_imbie_file_names() -> None:
    assert region_for_file(Path("imbie3_antarctic_peninsula_Gt_partitioned.csv")) == "antarctica_peninsula"
    assert region_for_file(Path("imbie3_east_antarctica_Gt_partitioned.csv")) == "antarctica_east"
    assert region_for_file(Path("imbie3_greenland_partitioned_Gt.csv")) == "greenland"   # old card name
    assert region_for_file(Path("imbie3_greenland_mm_partitioned.csv")) is None
    assert region_for_file(Path("imbie3_mars_Gt_partitioned.csv")) is None


def test_imbie_standins_recover_the_synthetic_truth(tmp_path: Path) -> None:
    write_imbie_standins(tmp_path, SEED)
    assert len(list_imbie_files(tmp_path)) == 5                          # mm files are not picked up
    docs = imbie_docs(tmp_path, read_marker(tmp_path))
    for rid in ("greenland", "antarctica_peninsula"):
        dates, rows, _mk = region_rows(rid, SEED)
        doc = docs[("ice_mass", rid)]
        assert doc["synthetic"] is True and doc["injected"]["slopePerYear"] is not None
        assert doc["dates"] == dates
        for v, row in zip(doc["values"], rows):
            assert v == pytest.approx(row[2], abs=0.006)
        rate = docs[("ice_mass_rate", rid)]
        assert rate["frequency"] == "annual" and len(rate["dates"][0]) == 4
    # Decimal-year stand-ins give the same series.
    dec = tmp_path / "dec"
    write_imbie_standins(dec, SEED, date_format="decimal", mm_files=False)
    docs2 = imbie_docs(dec, read_marker(dec))
    assert {k: (d["dates"], d["values"]) for k, d in docs2.items()} == \
        {k: (d["dates"], d["values"]) for k, d in docs.items()}
    assert HEADERS[0] == "Date"


def test_without_marker_output_is_real(tmp_path: Path) -> None:
    dates, cum, rate = _known_case()
    write_region_csv(tmp_path / "imbie3_greenland_Gt_partitioned.csv", dates, _rows(dates, cum, rate))
    assert read_marker(tmp_path) is None
    docs = imbie_docs(tmp_path, None)
    doc = docs[("ice_mass", "greenland")]
    assert doc["synthetic"] is False and "injected" not in doc
    assert "imbie3_greenland_Gt_partitioned.csv" in doc["segments"][0]["source"]
    (tmp_path / "standin.json").write_text(json.dumps({"synthetic": False}), encoding="utf-8")
    with pytest.raises(IngestError, match="synthetic: true"):
        read_marker(tmp_path)


# =========================================================================== CLI
def _cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, "-m", "pipeline", *args], cwd=REPO, capture_output=True, text=True,
                          timeout=600)


def _copy_tree(built: Path, tmp_path: Path) -> Path:
    root = tmp_path / "public"
    shutil.copytree(built, root)
    return root


def test_cli_ingest_imbie(built: Path, tmp_path: Path) -> None:
    raw = tmp_path / "raw"
    r = _cli("standin", "imbie", "--out", str(raw), "--date-format", "decimal")
    assert r.returncode == 0, r.stderr
    root = _copy_tree(built, tmp_path)
    r = _cli("ingest", "imbie", "--raw", str(raw), "--root", str(root))
    assert r.returncode == 0, r.stderr + r.stdout
    # The build ran the same ingest on the same stand-ins: files are identical.
    for vid in ("ice_mass", "ice_mass_rate"):
        for p in sorted((built / vid / "series").glob("*.json")):
            assert (root / vid / "series" / p.name).read_bytes() == p.read_bytes(), p.name
    for name in ("variables.json", "regions.json"):
        assert json.loads((root / name).read_text("utf-8")) == json.loads((built / name).read_text("utf-8"))
    result = validate(root)
    assert result.ok, "\n".join(str(p) for p in result.problems)


def test_cli_ingest_sea_level_small_set(built: Path, tmp_path: Path, topo: dict, standin: SSHStandin) -> None:
    raw = tmp_path / "raw"
    raw.mkdir()
    # Three clean weeks in January of 2020, 2021 and 2022: 9 files (about 4 MB each as netCDF-3).
    # Not three consecutive months: on a series under 2 years the engine's seasonal Mann-Kendall
    # cross-check returns NaN, which a stats file cannot store (contract README, rule 6).
    idx = []
    for year in (2020, 2021, 2022):
        jan = [i for i, d in enumerate(standin.labels) if (d.year, d.month) == (year, 1)
               and not standin.failed[i] and i not in standin.partial]
        idx += jan[:3]
    assert len(idx) == 9
    for i in idx:
        write_week(standin.raw_week(i), raw, counts_seed=SEED)
    write_marker(raw, standin.marker_series(), seed=SEED, dataset="test")
    root = _copy_tree(built, tmp_path)
    r = _cli("ingest", "sea_level", "--raw", str(raw), "--root", str(root))
    assert r.returncode == 0, r.stderr + r.stdout
    assert "9 weekly grids" in r.stdout
    expected, _ing = sea_level_docs((standin.raw_week(i) for i in idx), topo,
                                    {"synthetic": True, "series": standin.marker_series()}, standin.region_ids)
    for rid, doc in expected.items():
        got = json.loads((root / "sea_level" / "series" / f"{rid}.json").read_text("utf-8"))
        assert got["dates"] == doc["dates"] and got["values"] == doc["values"]
        assert got["synthetic"] is True and got["dates"][0] == "2020-01" and got["dates"][-1] == "2022-01"
        assert sum(v is not None for v in got["values"]) == 3                # the other months are null
    entry = {e["id"]: e for e in json.loads((root / "variables.json").read_text("utf-8"))}["sea_level"]
    assert entry["periods"]["global"] == [expected["global"]["dates"][0], expected["global"]["dates"][-1]]
    result = validate(root)
    assert result.ok, "\n".join(str(p) for p in result.problems)


def test_cli_ingest_errors(tmp_path: Path) -> None:
    empty = tmp_path / "empty"
    empty.mkdir()
    r = _cli("ingest", "imbie", "--raw", str(empty), "--root", str(tmp_path / "nope"))
    assert r.returncode == 1 and "no IMBIE Gt files" in r.stderr
    r = _cli("ingest", "sea_level", "--raw", str(empty), "--root", str(tmp_path / "nope"))
    assert r.returncode == 1 and "regions.topo.json" in r.stderr
