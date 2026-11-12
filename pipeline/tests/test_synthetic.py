"""Synthetic generator (M2 part c): valid contract, the M2 gate, determinism.

The M2 gate (plan section 14): analyzeTrend() recovers each injected slope
inside its 95% Sen's slope interval. Checked on the shipped default seed, and
over many seeds as an interval coverage rate.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from pipeline.synthetic import BuildError, build_synthetic
from pipeline.synthetic import config as C
from pipeline.synthetic.maps import pack, unpack
from pipeline.synthetic.series import all_series, trend_input
from pipeline.validate import run_analyze, validate

ZERO_SLOPE = ("ice_mass_rate", "antarctica_east")
N_SEEDS = 50


def _quiet(*_args: object) -> None:
    pass


@pytest.fixture(scope="module")
def built(tmp_path_factory: pytest.TempPathFactory) -> Path:
    root = tmp_path_factory.mktemp("synthetic") / "public"
    build_synthetic(root, seed=C.DEFAULT_SEED, log=_quiet)
    return root


def _read(root: Path, rel: str) -> dict:
    return json.loads((root / rel).read_text(encoding="utf-8"))


def _pairs() -> list[tuple[str, str]]:
    return [(v.id, rid) for v in C.VARIABLES for rid in v.series]


# --------------------------------------------------------------------------- 1. valid contract
def test_validator_reports_no_problems(built: Path) -> None:
    result = validate(built)
    assert result.ok, "\n".join(str(p) for p in result.problems)


def test_series_span_their_configured_periods(built: Path) -> None:
    variables = {v["id"]: v for v in _read(built, "variables.json")}
    for v in C.VARIABLES:
        for rid, spec in v.series.items():
            assert variables[v.id]["periods"][rid] == [spec.start, spec.end]
            doc = _read(built, f"{v.id}/series/{rid}.json")
            assert doc["synthetic"] is True and "injected" in doc
            assert doc["values"][0] is not None and doc["values"][-1] is not None


def test_some_series_have_interior_gaps(built: Path) -> None:
    gappy = [(vid, rid) for vid, rid in _pairs()
             if None in _read(built, f"{vid}/series/{rid}.json")["values"]]
    assert len(gappy) >= 3, gappy


def test_sigma_and_bounds_grow_going_back(built: Path) -> None:
    for vid, rid in _pairs():
        doc = _read(built, f"{vid}/series/{rid}.json")
        if "sigma" in doc:
            sig = [s for s in doc["sigma"] if s is not None]
            assert sig[0] > sig[-1], (vid, rid)
        if "lower" in doc:
            widths = [u - lo for lo, u in zip(doc["lower"], doc["upper"]) if lo is not None]
            assert widths[0] > widths[-1], (vid, rid)
            assert doc["bounds"] == "5-95%"
    assert "sigma" not in _read(built, "sea_level/series/global.json")


def test_map_layers(built: Path) -> None:
    ice = _read(built, "ice_mass_map/manifest.json")
    gap = {f"{y}-{m:02d}" for y, ms in ((2017, range(7, 13)), (2018, range(1, 6))) for m in ms}
    assert gap <= set(ice["missing"]) and len(ice["missing"]) == len(gap) + 3
    assert ice["frames"][0]["date"] == "2002-04" and ice["frames"][-1]["date"] == "2026-09"
    temp = _read(built, "temperature/manifest.json")
    assert temp["frames"][0]["date"] == "1980-01" and temp["frames"][-1]["date"] == "2026-09"
    assert temp["missing"] == []
    # ice_mass_map: ocean invalid (B=0), land valid; A always 255.
    atlas = np.asarray(Image.open(built / "ice_mass_map" / ice["atlases"][0]["file"]))
    f = ice["frames"][0]
    frame = atlas[f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]]
    assert set(np.unique(frame[..., 2])) == {0, 255}
    assert (atlas[..., 3] == 255).all()
    lat, lon = 30.5, -40.5  # mid North Atlantic
    assert frame[int(90 - lat), int(lon + 180), 2] == 0
    lat, lon = 72.5, -40.5  # Greenland interior
    assert frame[int(90 - lat), int(lon + 180), 2] == 255
    for layer in ("ice_mass_map", "temperature"):
        assert Image.open(built / layer / "colormap.png").size == (256, 1)


def test_pack_round_trip() -> None:
    v = np.array([[-12.345, 0.0, np.nan], [3.21, 250.0, -299.99]])
    rgba, clamped = pack(v, 0.05, -1000.0)
    assert clamped == 0
    back = unpack(rgba, 0.05, -1000.0)
    ok = np.isfinite(v)
    assert np.array_equal(np.isfinite(back), ok)
    assert np.allclose(back[ok], v[ok], atol=0.025 + 1e-9)
    assert rgba[0, 2, 0] == rgba[0, 2, 1] == rgba[0, 2, 2] == 0 and rgba[0, 2, 3] == 255


def test_regions_come_from_config(built: Path) -> None:
    regions = _read(built, "regions.json")
    assert [r["id"] for r in regions] == [r.id for r in C.REGIONS]
    kinds = {r["id"]: r["kind"] for r in regions}
    assert kinds["global"] == "global" and kinds["antarctica_west"] == "ice_sheet_basin"
    topo = _read(built, "regions.topo.json")
    ids = {g["id"] for g in topo["objects"]["regions"]["geometries"]}
    assert ids == {r.id for r in C.REGIONS if r.kind != "global"}


def test_refuses_to_clear_a_folder_that_is_not_a_data_tree(tmp_path: Path) -> None:
    (tmp_path / "precious.txt").write_text("keep me")
    with pytest.raises(BuildError):
        build_synthetic(tmp_path, log=_quiet)
    assert (tmp_path / "precious.txt").exists()


# --------------------------------------------------------------------------- 2. the M2 gate
def test_gate_default_seed_interval_contains_injected_slope(built: Path) -> None:
    misses = []
    for vid, rid in _pairs():
        inj = _read(built, f"{vid}/series/{rid}.json")["injected"]["slopePerYear"]
        sl = _read(built, f"{vid}/stats/{rid}__default.json")["slope"]
        if not sl["lower"] <= inj <= sl["upper"]:
            by = sl["lower"] - inj if inj < sl["lower"] else inj - sl["upper"]
            misses.append(f"{vid}/{rid}: injected {inj}, interval [{sl['lower']:.4g}, {sl['upper']:.4g}], "
                          f"misses by {by:.4g}")
    assert not misses, "M2 gate fails on the default seed:\n" + "\n".join(misses)


def test_gate_coverage_over_many_seeds() -> None:
    keys, inputs, injected = [], [], []
    for seed in range(1, N_SEEDS + 1):
        for (vid, rid), doc in all_series(C.VARIABLES, seed).items():
            keys.append((seed, vid, rid))
            inputs.append(trend_input(doc))
            injected.append(doc["injected"]["slopePerYear"])
    results = run_analyze(inputs)
    hits = []
    for res, inj in zip(results, injected):
        assert res["ok"], res
        sl = res["report"]["slope"]
        hits.append(sl["lower"] <= inj <= sl["upper"])
    frac = float(np.mean(hits))
    print(f"\ninterval coverage over {N_SEEDS} seeds x {len(_pairs())} series: {frac:.3f} ({sum(hits)}/{len(hits)})")
    assert frac >= 0.85


# --------------------------------------------------------------------------- 3. determinism
def test_same_seed_builds_are_byte_identical(built: Path, tmp_path: Path) -> None:
    again = tmp_path / "public"
    build_synthetic(again, seed=C.DEFAULT_SEED, log=_quiet)
    a = {p.relative_to(built).as_posix(): p for p in built.rglob("*") if p.is_file()}
    b = {p.relative_to(again).as_posix(): p for p in again.rglob("*") if p.is_file()}
    assert a.keys() == b.keys()
    differ = [rel for rel in sorted(a) if a[rel].read_bytes() != b[rel].read_bytes()]
    assert not differ, differ


# --------------------------------------------------------------------------- 4. zero-slope series
def test_zero_slope_series_is_not_significant(built: Path) -> None:
    vid, rid = ZERO_SLOPE
    assert _read(built, f"{vid}/series/{rid}.json")["injected"]["slopePerYear"] == 0
    st = _read(built, f"{vid}/stats/{rid}__default.json")
    assert st["test"]["significant"] is False, st["test"]
