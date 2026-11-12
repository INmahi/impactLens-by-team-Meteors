"""Synthetic generator (M2 part c): valid contract, the M2 gate, determinism.

The M2 gate (plan section 14, made statistically valid by main 2026-11-12):
analyzeTrend() recovers the injected slopes inside their 95% Sen's slope
intervals. A 95% interval misses 5% of the time by design, so the gate is
(a) at the shipped default seed, the number of misses is at most the 99th
percentile of Binomial(N, 0.05) for N synthetic series, and (b) over many seeds,
pooled interval coverage lies in [0.93, 0.97].
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from scipy.stats import binom

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


COASTAL = [r for r in C.REGIONS if r.kind == "coastal_sea"]


def _ring_area(ring: list[tuple[float, float]]) -> float:
    pts = list(ring) + [ring[0]]
    return 0.5 * sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:]))


def _self_crossings(ring: list[tuple[float, float]]) -> list[tuple[int, int]]:
    def orient(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    pts = list(ring) + [ring[0]]
    segs = list(zip(pts, pts[1:]))
    n = len(segs)
    out = []
    for i in range(n):
        for j in range(i + 2, n):
            if i == 0 and j == n - 1:
                continue  # neighbours through the closing vertex
            (a, b), (c, d) = segs[i], segs[j]
            if orient(a, b, c) * orient(a, b, d) < 0 and orient(c, d, a) * orient(c, d, b) < 0:
                out.append((i, j))
    return out


def _rings(outline) -> list[list[tuple[float, float]]]:
    return outline if isinstance(outline[0][0], (list, tuple)) else [outline]


def test_coastal_seas_configured() -> None:
    ids = {r.id for r in COASTAL}
    assert ids == {"bay_of_bengal", "gulf_of_mexico", "us_east_coast", "western_tropical_pacific",
                   "north_sea", "mediterranean"}
    for r in COASTAL:
        assert r.parent is None
        rings = _rings(r.outline)
        assert 15 <= sum(len(g) for g in rings) <= 80, r.id
        w, s, e, n = r.bbox
        assert w <= e and s <= n
        for ring in rings:
            assert _ring_area(ring) > 0, f"{r.id}: rings must be counter-clockwise"
            assert not _self_crossings(ring), (r.id, _self_crossings(ring))
            assert all(w <= x <= e and s <= y <= n for x, y in ring), f"{r.id}: outline leaves its bbox"
        cam = r.camera
        assert cam["pitch"] == -90 and w <= cam["lon"] <= e and s <= cam["lat"] <= n
        assert 1_000_000 <= cam["height"] <= 10_000_000


# The polygon is the averaging polygon of the real build: 0.5-degree NASA-SSH grid
# (centres at x.25 and x.75), cell centre in polygon (docs/datasets/sea-level-gridded-ssh.md).
MIN_SSH_CELLS = {"bay_of_bengal": 150, "us_east_coast": 150}


def test_coastal_seas_hold_enough_grid_cells() -> None:
    from pipeline.synthetic.geometry import points_in_ring
    lon, lat = np.meshgrid(np.arange(-179.75, 180, 0.5), np.arange(-89.75, 90, 0.5))
    for r in COASTAL:
        inside = np.zeros(lon.shape, dtype=bool)
        for ring in _rings(r.outline):
            inside |= points_in_ring(lon, lat, ring)
        assert inside.sum() >= MIN_SSH_CELLS.get(r.id, 100), (r.id, int(inside.sum()))


def test_coastal_seas_in_every_file(built: Path) -> None:
    regions = {r["id"]: r for r in _read(built, "regions.json")}
    topo_ids = {g["id"] for g in _read(built, "regions.topo.json")["objects"]["regions"]["geometries"]}
    variables = {v["id"]: v for v in _read(built, "variables.json")}
    for r in COASTAL:
        entry = regions[r.id]
        assert entry["kind"] == "coastal_sea" and entry["variables"] == ["sea_level"]
        assert entry["bbox"] == list(r.bbox) and entry["camera"] == r.camera
        assert r.id in topo_ids
        assert r.id in variables["sea_level"]["regions"]
        assert variables["sea_level"]["periods"][r.id] == ["1993-01", "2026-10"]
        assert r.id not in variables["sea_level_long"]["regions"]
        series = _read(built, f"sea_level/series/{r.id}.json")
        stats = _read(built, f"sea_level/stats/{r.id}__default.json")
        assert series["region"] == stats["region"] == r.id
        assert series["frequency"] == "monthly" and series["synthetic"] is True
        assert "NASA-SSH gridded" in series["segments"][0]["source"]
        # Regional series swing far more than the global mean.
        glob = _read(built, "sea_level/series/global.json")["injected"]["noiseSd"]
        assert series["injected"]["noiseSd"] >= 2.5 * glob


def test_sea_level_notes_cover_coastal_seas(built: Path) -> None:
    """General sea level caveats on the variable; each sea's own caveats on its regions.json entry."""
    sl = next(v for v in _read(built, "variables.json") if v["id"] == "sea_level")
    text = " ".join(sl["notes"]) + " " + sl["describe"]["what"]
    assert "global only" not in text.lower()
    assert "not the value at a town" in text and "subsidence is not included" in text
    assert not any(n.startswith(r.name + ":") for r in COASTAL for n in sl["notes"]), "per-sea notes moved"
    regions = {r["id"]: r for r in _read(built, "regions.json")}
    for r in COASTAL:
        notes = regions[r.id]["notes"]
        assert notes[0].startswith("SYNTHETIC DATA"), r.id
        joined = " ".join(notes).lower()
        assert "not the value at any" in joined and "not included" in joined, r.id
    assert "delta" in " ".join(regions["bay_of_bengal"]["notes"])
    # Regions with no caveats of their own carry no notes field.
    assert "notes" not in regions["greenland"] and "notes" not in regions["global"]


def test_manifests_carry_a_display_name(built: Path) -> None:
    for layer in C.MAP_LAYERS:
        assert layer.name, layer.id
        assert _read(built, f"{layer.id}/manifest.json")["name"] == layer.name


def _interval(root: Path, rid: str) -> tuple[float, float, float]:
    sl = _read(root, f"sea_level/stats/{rid}__default.json")["slope"]
    return sl["lower"], sl["perYear"], sl["upper"]


def test_compare_demo_has_both_outcomes(built: Path) -> None:
    """Proxy on the analyzeTrend() intervals until the M5 compare test exists:
    gulf_of_mexico vs mediterranean is clearly different (disjoint 95% intervals);
    north_sea vs global is not distinguishable (same injected 3.3 mm/yr; each interval
    holds the other's Sen's slope)."""
    sl = {v.id: v for v in C.VARIABLES}["sea_level"].series
    assert sl["north_sea"].slope == sl["global"].slope
    gulf, med, ns, glob = (_interval(built, r) for r in ("gulf_of_mexico", "mediterranean", "north_sea", "global"))
    assert med[2] < gulf[0], (gulf, med)
    assert ns[0] <= glob[1] <= ns[2] and glob[0] <= ns[1] <= glob[2], (ns, glob)


def test_refuses_to_clear_a_folder_that_is_not_a_data_tree(tmp_path: Path) -> None:
    (tmp_path / "precious.txt").write_text("keep me")
    with pytest.raises(BuildError):
        build_synthetic(tmp_path, log=_quiet)
    assert (tmp_path / "precious.txt").exists()


# --------------------------------------------------------------------------- 2. the M2 gate
def test_gate_default_seed_misses_within_binomial_bound(built: Path) -> None:
    """At the default seed, misses <= 99th percentile of Binomial(N, 0.05). With a
    nominal 95% interval this fails by chance in under 1% of seeds."""
    misses = []
    for vid, rid in _pairs():
        inj = _read(built, f"{vid}/series/{rid}.json")["injected"]["slopePerYear"]
        sl = _read(built, f"{vid}/stats/{rid}__default.json")["slope"]
        if not sl["lower"] <= inj <= sl["upper"]:
            by = sl["lower"] - inj if inj < sl["lower"] else inj - sl["upper"]
            misses.append(f"{vid}/{rid}: injected {inj}, interval [{sl['lower']:.4g}, {sl['upper']:.4g}], "
                          f"misses by {by:.4g}")
    n = len(_pairs())
    bound = int(binom.ppf(0.99, n, 0.05))
    print(f"\ndefault seed {C.DEFAULT_SEED}: {len(misses)} of {n} intervals miss the injected slope "
          f"(allowed <= {bound}, 99th percentile of Binomial({n}, 0.05))" + "".join("\n  " + m for m in misses))
    assert len(misses) <= bound, f"M2 gate: {len(misses)} misses > {bound}:\n" + "\n".join(misses)


@pytest.mark.slow
def test_gate_coverage_over_many_seeds() -> None:
    """Pooled 95% interval coverage over N_SEEDS seeds x all series lies in [0.93, 0.97]."""
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
    assert 0.93 <= frac <= 0.97, f"coverage {frac:.3f} outside [0.93, 0.97]"


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


# --------------------------------------------------------------------------- 5. smooth on the sphere
def _layer_frames(root: Path, layer: str) -> tuple[np.ndarray, float]:
    """All frames of a map layer decoded from the shipped atlases, (n, H, W) with NaN = missing."""
    man = _read(root, f"{layer}/manifest.json")
    atlases = [np.asarray(Image.open(root / layer / a["file"])) for a in man["atlases"]]
    enc = man["encoding"]
    frames = [unpack(atlases[f["atlas"]][f["y"]:f["y"] + f["h"], f["x"]:f["x"] + f["w"]],
                     enc["scale"], enc["offset"]) for f in man["frames"]]
    lo, hi = man["valueRange"]
    return np.stack(frames), hi - lo


@pytest.mark.parametrize("layer", ["ice_mass_map", "temperature"])
def test_map_is_continuous_at_the_poles(built: Path, layer: str) -> None:
    """All 360 cells of a +-89.5 row lie within 1 degree of the pole, so a field that is
    smooth on the sphere is nearly constant around them (no radial wedges on the globe).
    The bound: under 6% of valueRange in every frame (synthetic fields have realistic
    1-degree texture; before the fix temperature spanned over 100%), under 2.5% in the
    median frame, and at most 1.5x the biggest difference between meridionally adjacent
    cells elsewhere in the same frame (the pole is no rougher than the rest)."""
    v, span = _layer_frames(built, layer)
    checked = 0
    for row in (0, -1):
        ring = v[:, row, :]
        has = np.isfinite(ring).any(axis=1)
        if not has.any():
            continue  # ice_mass_map: Arctic Ocean row is all invalid
        assert has.all(), f"{layer}: polar row {row} valid in some frames only"
        spread = np.nanmax(ring, axis=1) - np.nanmin(ring, axis=1)
        merid = np.nanmax(np.abs(np.diff(v[:, 1:-1, :], axis=1)), axis=(1, 2))
        assert (spread < 0.06 * span).all(), f"{layer}: max polar spread {spread.max():.3g}"
        assert (spread <= 1.5 * merid).all(), f"{layer}: pole rougher than the rest of the field"
        assert np.median(spread) < 0.025 * span
        checked += 1
    assert checked >= 1


@pytest.mark.parametrize("layer", ["ice_mass_map", "temperature"])
def test_map_has_no_seam_at_180(built: Path, layer: str) -> None:
    """Columns at -179.5 and 179.5 are neighbours; their difference must look like any
    other pair of adjacent columns, not a seam."""
    v, span = _layer_frames(built, layer)
    seam = np.nanmax(np.abs(v[:, :, 0] - v[:, :, -1]), axis=1)
    inner = np.nanmax(np.abs(np.diff(v, axis=2)), axis=(1, 2))
    assert (seam < 0.03 * span).all(), f"{layer}: max seam difference {seam.max():.3g}"
    assert (seam <= 1.5 * inner).all()
