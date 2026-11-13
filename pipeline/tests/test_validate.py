"""Validator tests: a tiny valid tree passes; each cross-file rule 1-9 catches a break."""

from __future__ import annotations

import shutil
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from pipeline.validate import Result, run_analyze, stats_file_content, validate

from .contract_tree import read_json, topo_square, write_json

REPO_ROOT = Path(__file__).resolve().parents[2]
GL = "ice_mass/series/greenland.json"
GL_STATS = "ice_mass/stats/greenland__default.json"
MANIFEST = "ice_mass_map/manifest.json"


def check(root: Path, **kw) -> Result:
    return validate(root, **kw)


def assert_rule(result: Result, rule: int, contains: str = "") -> None:
    hits = [p for p in result.problems if p.rule == rule and contains in p.message]
    listing = "\n".join(str(p) for p in result.problems) or "(no problems)"
    assert hits, f"expected rule {rule} problem containing {contains!r}; got:\n{listing}"


def edit(root: Path, rel: str, fn) -> None:
    """Load a JSON file, mutate it in place with fn (return value ignored), save it."""
    doc = read_json(root, rel)
    fn(doc)
    write_json(root, rel, doc)


def png_bytes(width: int, height: int, bit_depth: int, colour_type: int) -> bytes:
    """A raw PNG (Pillow cannot write 16-bit RGBA)."""
    channels = {6: 4, 2: 3}[colour_type]
    row = b"\x00" + b"\x00" * (width * channels * bit_depth // 8)

    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, bit_depth, colour_type, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(row * height))
            + chunk(b"IEND", b""))


# ------------------------------------------------------------------ baseline
def test_valid_tree_passes(tree: Path) -> None:
    result = check(tree)
    assert result.ok, "\n".join(map(str, result.problems))
    assert result.files_checked >= 17


def test_cli_valid_tree_exit_0(tree: Path) -> None:
    proc = subprocess.run([sys.executable, "-m", "pipeline", "validate", "--root", str(tree)],
                          cwd=REPO_ROOT, capture_output=True, text=True)
    assert proc.returncode == 0, proc.stdout + proc.stderr
    assert proc.stdout.strip().splitlines()[-1].endswith("files checked, 0 problems")


def test_cli_problem_lines_and_exit_1(tree: Path) -> None:
    (tree / GL_STATS).unlink()
    proc = subprocess.run([sys.executable, "-m", "pipeline", "validate", "--root", str(tree)],
                          cwd=REPO_ROOT, capture_output=True, text=True)
    assert proc.returncode == 1
    lines = proc.stdout.strip().splitlines()
    assert any(line.endswith("greenland__default.json: rule 3: missing: ice_mass is declared for region greenland")
               for line in lines), proc.stdout
    assert lines[-1].endswith("1 problems")


def test_cli_real_build_not_implemented(tmp_path: Path) -> None:
    # Only --synthetic exists until M10; without it nothing is written.
    proc = subprocess.run([sys.executable, "-m", "pipeline", "build", "--root", str(tmp_path / "out")],
                          cwd=REPO_ROOT, capture_output=True, text=True)
    assert proc.returncode == 2
    assert "only --synthetic" in proc.stderr
    assert not (tmp_path / "out").exists()


def test_missing_root_is_clear(tmp_path: Path) -> None:
    proc = subprocess.run([sys.executable, "-m", "pipeline", "validate", "--root", str(tmp_path / "nope")],
                          cwd=REPO_ROOT, capture_output=True, text=True)
    assert proc.returncode == 1
    assert "data directory does not exist" in proc.stdout
    assert "Traceback" not in proc.stdout + proc.stderr


def test_empty_root_is_clear(tmp_path: Path) -> None:
    result = check(tmp_path)
    assert_rule(result, 3, "data directory is empty")


def test_problems_are_all_collected(tree: Path) -> None:
    (tree / GL_STATS).unlink()
    edit(tree, "regions.json", lambda d: d[0]["variables"].remove("ice_extent"))
    edit(tree, MANIFEST, lambda d: d["frames"][1].update(x=2))
    result = check(tree)
    assert {2, 3, 7} <= result.rules()


def test_invalid_entry_does_not_cascade_or_hide(tree: Path) -> None:
    """A schema-invalid variable gives rule 1 only; checks on the valid ones still run."""
    edit(tree, "variables.json", lambda d: d[2].update(units=""))  # ice_extent
    shutil.copy(tree / GL, tree / "ice_mass/series/global.json")
    result = check(tree)
    assert_rule(result, 1, "/2/units")
    assert_rule(result, 3, "region 'global' is not declared for ice_mass")
    assert not [p for p in result.problems if "ice_extent" in p.path and p.rule != 1], \
        "\n".join(map(str, result.problems))


def test_new_region_needs_only_data(tree: Path) -> None:
    """Regions are data: a glacier region added through files alone validates."""
    edit(tree, "regions.json", lambda d: d.append({
        "id": "alaska", "name": "Alaska", "parent": None, "kind": "glacier_region",
        "variables": ["ice_mass"], "bbox": [-170, 54, -130, 72],
        "camera": {"lon": -150, "lat": 62, "height": 3000000, "heading": 0, "pitch": -90}}))
    edit(tree, "regions.topo.json", lambda d: (
        d["arcs"].append(topo_square(-160, 58, -140, 66)),
        d["objects"]["regions"]["geometries"].append({"type": "Polygon", "id": "alaska", "arcs": [[2]]})))

    def add_region(v):
        v[0]["regions"].append("alaska")
        v[0]["periods"]["alaska"] = ["2000-01", "2002-12"]
    edit(tree, "variables.json", add_region)
    s = read_json(tree, GL)
    s.update(region="alaska")
    s.pop("injected")
    s["values"][17] = 1.0
    s["sigma"][17] = 1.0
    write_json(tree, "ice_mass/series/alaska.json", s)
    (res,) = run_analyze([{k: s[k] for k in ("dates", "values", "frequency", "kind")}])
    write_json(tree, "ice_mass/stats/alaska__default.json", stats_file_content("ice_mass", "alaska", True, res["report"]))
    result = check(tree)
    assert result.ok, "\n".join(map(str, result.problems))


SEA = "north_sea"


def add_coastal_sea(tree: Path) -> None:
    """Add a coastal sea with a sea_level series through data files alone."""
    edit(tree, "regions.json", lambda d: d.append({
        "id": SEA, "name": "North Sea", "parent": None, "kind": "coastal_sea",
        "variables": ["sea_level"], "bbox": [-4, 51, 9, 61],
        "camera": {"lon": 2.5, "lat": 56, "height": 2800000, "heading": 0, "pitch": -90}}))
    edit(tree, "regions.topo.json", lambda d: (
        d["arcs"].append(topo_square(-2, 52, 8, 60)),
        d["objects"]["regions"]["geometries"].append({"type": "Polygon", "id": SEA, "arcs": [[2]]})))

    def add_region(v):
        sl = next(x for x in v if x["id"] == "sea_level")
        sl["regions"].append(SEA)
        sl["periods"][SEA] = list(sl["periods"]["global"])
    edit(tree, "variables.json", add_region)
    s = read_json(tree, "sea_level/series/global.json")
    s.update(region=SEA, values=[round(v + 3.0 * (i % 4), 3) for i, v in enumerate(s["values"])])
    write_json(tree, f"sea_level/series/{SEA}.json", s)
    (res,) = run_analyze([{k: s[k] for k in ("dates", "values", "frequency", "kind")}])
    write_json(tree, f"sea_level/stats/{SEA}__default.json", stats_file_content("sea_level", SEA, True, res["report"]))


def test_coastal_sea_needs_only_data(tree: Path) -> None:
    add_coastal_sea(tree)
    result = check(tree)
    assert result.ok, "\n".join(map(str, result.problems))


def test_rule2_coastal_sea_lists_other_variable(tree: Path) -> None:
    add_coastal_sea(tree)
    edit(tree, "regions.json", lambda d: d[-1]["variables"].append("ice_mass"))
    assert_rule(check(tree), 2, "north_sea: kind coastal_sea allows only sea_level, but variables lists ice_mass")


def test_rule2_other_variable_declares_coastal_sea(tree: Path) -> None:
    add_coastal_sea(tree)

    def declare(v):
        v[0]["regions"].append(SEA)  # ice_mass
        v[0]["periods"][SEA] = ["2000-01", "2002-12"]
    edit(tree, "variables.json", declare)
    edit(tree, "regions.json", lambda d: d[-1]["variables"].append("ice_mass"))
    result = check(tree)
    assert_rule(result, 2, "ice_mass: regions north_sea are kind coastal_sea, where only sea_level is valid")
    assert_rule(result, 2, "north_sea: kind coastal_sea allows only sea_level")


def test_rule3_coastal_sea_needs_geometry(tree: Path) -> None:
    add_coastal_sea(tree)
    edit(tree, "regions.topo.json", lambda d: d["objects"]["regions"]["geometries"].pop())
    assert_rule(check(tree), 3, f"no geometry for region {SEA!r}")


# -------------------------------------------------------------------- rule 1
def test_rule1_schema_field(tree: Path) -> None:
    edit(tree, "variables.json", lambda d: d[0].update(units=""))
    assert_rule(check(tree), 1, "/0/units")


def test_rule1_uri_format(tree: Path) -> None:
    edit(tree, "variables.json", lambda d: d[1]["source"].update(url="not a uri"))
    assert_rule(check(tree), 1, "/1/source/url")


def test_rule1_nan_in_stats(tree: Path) -> None:
    path = tree / GL_STATS
    text = path.read_text(encoding="utf-8")
    path.write_text(text.replace('"coverage": 0.9722222222222222', '"coverage": NaN'), encoding="utf-8")
    assert_rule(check(tree), 1, "NaN is not allowed")


def test_rule1_invalid_json(tree: Path) -> None:
    (tree / "regions.json").write_text("[{", encoding="utf-8")
    assert_rule(check(tree), 1, "invalid JSON")


# -------------------------------------------------------------------- rule 2
def test_rule2_inverse_regions(tree: Path) -> None:
    edit(tree, "regions.json", lambda d: d[0]["variables"].remove("ice_extent"))
    assert_rule(check(tree), 2, "missing ice_extent")


def test_rule2_unknown_variant_of(tree: Path) -> None:
    edit(tree, "variables.json", lambda d: d[1].update(variantOf="ice_mass_old"))
    assert_rule(check(tree), 2, "variantOf 'ice_mass_old'")


def test_rule2_unknown_parent(tree: Path) -> None:
    edit(tree, "regions.json", lambda d: d[1].update(parent="south_pole"))
    assert_rule(check(tree), 2, "parent 'south_pole'")


def test_rule2_periods_keys(tree: Path) -> None:
    edit(tree, "variables.json", lambda d: d[0]["periods"].pop("antarctica"))
    assert_rule(check(tree), 2, "periods keys must equal regions")


def test_rule2_manifest_variable(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d.update(variable="grace"))
    assert_rule(check(tree), 2, "expected the folder name")


# -------------------------------------------------------------------- rule 3
def test_rule3_missing_stats(tree: Path) -> None:
    (tree / "ice_mass/stats/antarctica__default.json").unlink()
    assert_rule(check(tree), 3, "missing: ice_mass is declared for region antarctica")


def test_rule3_undeclared_series(tree: Path) -> None:
    shutil.copy(tree / "ice_extent/series/greenland.json", tree / "ice_extent/series/antarctica.json")
    assert_rule(check(tree), 3, "region 'antarctica' is not declared for ice_extent")


def test_rule3_missing_colormap(tree: Path) -> None:
    (tree / "ice_mass_map/colormap.png").unlink()
    assert_rule(check(tree), 3, "mapMode of ice_mass is 'ice_mass_map'")


def test_rule3_missing_region_geometry(tree: Path) -> None:
    edit(tree, "regions.topo.json", lambda d: d["objects"]["regions"]["geometries"].pop(1))
    assert_rule(check(tree), 3, "no geometry for region 'antarctica'")


def test_rule3_global_region_has_no_geometry(tree: Path) -> None:
    edit(tree, "regions.topo.json",
         lambda d: d["objects"]["regions"]["geometries"].append({"type": "Polygon", "id": "global", "arcs": [[1]]}))
    assert_rule(check(tree), 3, "global region 'global' must not have a geometry")


def test_rule3_stray_file(tree: Path) -> None:
    (tree / "ice_mass/notes.txt").write_text("x", encoding="utf-8")
    assert_rule(check(tree), 3, "unexpected file")


# -------------------------------------------------------------------- rule 4
def test_rule4_dropped_date(tree: Path) -> None:
    def drop(d):
        for k in ("dates", "values", "sigma"):
            del d[k][5]
    edit(tree, GL, drop)
    assert_rule(check(tree), 4, "dates skip from 2000-05 to 2000-07")


def test_rule4_nan_value(tree: Path) -> None:
    path = tree / GL
    text = path.read_text(encoding="utf-8").replace("null", "NaN", 1)
    path.write_text(text, encoding="utf-8")
    assert_rule(check(tree), 4, "NaN is not allowed")


def test_rule4_infinity_value(tree: Path) -> None:
    rel = "sea_level/series/global.json"
    edit(tree, rel, lambda d: d["values"].__setitem__(3, "__INF__"))
    path = tree / rel
    path.write_text(path.read_text(encoding="utf-8").replace('"__INF__"', "-Infinity"), encoding="utf-8")
    assert_rule(check(tree), 4, "Infinity is not allowed")


def test_rule4_length_mismatch(tree: Path) -> None:
    edit(tree, GL, lambda d: d["sigma"].pop())
    assert_rule(check(tree), 4, "sigma has 35 entries, dates has 36")


def test_rule4_units_mismatch(tree: Path) -> None:
    edit(tree, "ice_mass/series/antarctica.json", lambda d: d.update(units="mm"))
    assert_rule(check(tree), 4, "units is 'mm', variables.json says 'Gt'")


def test_rule4_period_mismatch(tree: Path) -> None:
    edit(tree, "variables.json", lambda d: d[0]["periods"].update(antarctica=["2000-01", "2002-12"]))
    assert_rule(check(tree), 4, "periods[antarctica]")


def test_rule4_bounds_order(tree: Path) -> None:
    rel = "ice_mass_long/series/greenland.json"
    edit(tree, rel, lambda d: d["lower"].__setitem__(4, d["values"][4] + 1))
    assert_rule(check(tree), 4, "lower <= value <= upper fails at 1994")


def test_rule4_negative_sigma(tree: Path) -> None:
    edit(tree, GL, lambda d: d["sigma"].__setitem__(2, -1.0))
    assert_rule(check(tree), 4, "sigma is negative at 2000-03")


def test_rule4_segments_hole(tree: Path) -> None:
    edit(tree, "sea_level/series/global.json", lambda d: d["segments"][1].update(start="2003"))
    assert_rule(check(tree), 4, "segments leave a hole between 2001 and 2003")


def test_rule4_segments_overlap(tree: Path) -> None:
    edit(tree, "sea_level/series/global.json", lambda d: d["segments"][1].update(start="2000"))
    assert_rule(check(tree), 4, "segments overlap")


# -------------------------------------------------------------------- rule 5
def test_rule5_trailing_null_padding(tree: Path) -> None:
    def pad(d):
        d["dates"] += ["2003-01", "2003-02"]
        d["values"] += [None, None]
        d["sigma"] += [None, None]
        d["segments"][0]["end"] = "2003-02"
    edit(tree, GL, pad)
    assert_rule(check(tree, stats_check=False), 5, "2 trailing null value(s)")


def test_rule5_leading_null_padding(tree: Path) -> None:
    def pad(d):
        d["dates"].insert(0, "1989")
        d["values"].insert(0, None)
        d["segments"][0]["start"] = "1989"
    edit(tree, "ice_extent/series/greenland.json", pad)
    assert_rule(check(tree, stats_check=False), 5, "1 leading null value(s)")


def test_rule5_period_not_true_span(tree: Path) -> None:
    edit(tree, "variables.json", lambda d: d[3].update(period=["1975", "2010"]))
    assert_rule(check(tree), 5, "must be the true span")


# -------------------------------------------------------------------- rule 6
def test_rule6_tampered_number(tree: Path) -> None:
    edit(tree, GL_STATS, lambda d: d["slope"].update(perYear=d["slope"]["perYear"] * (1 + 1e-6)))
    assert_rule(check(tree), 6, "slope.perYear")


def test_rule6_within_tolerance(tree: Path) -> None:
    edit(tree, GL_STATS, lambda d: d["slope"].update(perYear=d["slope"]["perYear"] * (1 + 1e-12)))
    assert check(tree).ok


def test_rule6_tampered_notes(tree: Path) -> None:
    edit(tree, GL_STATS, lambda d: d["notes"].pop())
    assert_rule(check(tree), 6, "notes")


def test_rule6_tampered_boolean(tree: Path) -> None:
    edit(tree, "sea_level/stats/global__default.json", lambda d: d.update(lowPower=not d["lowPower"]))
    assert_rule(check(tree), 6, "lowPower")


def test_rule6_kind_mismatch(tree: Path) -> None:
    edit(tree, "ice_extent/stats/greenland__default.json", lambda d: d.update(kind="rate"))
    assert_rule(check(tree, stats_check=False), 6, "kind is 'rate', the series says 'level'")


def test_rule6_start_outside_series(tree: Path) -> None:
    edit(tree, "ice_extent/stats/greenland__default.json", lambda d: d.update(start="1980"))
    assert_rule(check(tree, stats_check=False), 6, "not within the series")


def test_rule6_skipped_with_no_stats_check(tree: Path) -> None:
    edit(tree, GL_STATS, lambda d: d["slope"].update(perYear=d["slope"]["perYear"] * 2))
    assert check(tree, stats_check=False).ok


# -------------------------------------------------------------------- rule 7
def test_rule7_overlapping_frames(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d["frames"][1].update(x=2))
    assert_rule(check(tree), 7, "frames 2002-01 and 2002-02 overlap")


def test_rule7_frame_outside_atlas(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d["frames"][2].update(x=6))
    assert_rule(check(tree), 7, "lies outside atlas")


def test_rule7_frame_size(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d["frames"][0].update(w=3))
    assert_rule(check(tree), 7, "must equal grid 4x3")


def test_rule7_unsorted_frames(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d["frames"].reverse())
    assert_rule(check(tree), 7, "not sorted")


def test_rule7_missing_date_has_frame(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d.update(missing=["2002-02"]))
    assert_rule(check(tree), 7, "missing dates have a frame")


def test_rule7_atlas_size_mismatch(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d["atlases"][0].update(width=12))
    assert_rule(check(tree), 7, "size must match atlases")


def test_rule7_16bit_atlas(tree: Path) -> None:
    (tree / "ice_mass_map/frames/atlas-000.png").write_bytes(png_bytes(8, 6, 16, 6))
    assert_rule(check(tree), 7, "must be 8-bit RGBA, found 16-bit RGBA")


def test_rule7_rgb_atlas(tree: Path) -> None:
    Image.fromarray(np.zeros((6, 8, 3), dtype=np.uint8), "RGB").save(tree / "ice_mass_map/frames/atlas-000.png")
    assert_rule(check(tree), 7, "found 8-bit RGB")


def test_rule7_colormap_size(tree: Path) -> None:
    Image.fromarray(np.zeros((1, 255, 4), dtype=np.uint8), "RGBA").save(tree / "ice_mass_map/colormap.png")
    assert_rule(check(tree), 7, "colormap.png must be 256x1")


def test_rule7_missing_atlas(tree: Path) -> None:
    (tree / "ice_mass_map/frames/atlas-000.png").unlink()
    assert_rule(check(tree), 7, "atlas listed in manifest.json does not exist")


# -------------------------------------------------------------------- rule 8
def test_rule8_synthetic_mismatch(tree: Path) -> None:
    edit(tree, "sea_level/series/global.json", lambda d: d.update(synthetic=False))
    assert_rule(check(tree), 8, "synthetic is false, but variables.json says true for sea_level")


def test_rule8_manifest_synthetic_mismatch(tree: Path) -> None:
    edit(tree, MANIFEST, lambda d: d.update(synthetic=False))
    assert_rule(check(tree), 8, "for ice_mass")

def test_rule8_injected_on_real_data(tree: Path) -> None:
    def make_real(d):
        d.update(synthetic=False)
    edit(tree, GL, make_real)
    result = check(tree)
    assert_rule(result, 8, "injected is only allowed when synthetic is true")


# -------------------------------------------------------------------- rule 9
def test_rule9_regions_object_name(tree: Path) -> None:
    edit(tree, "regions.topo.json", lambda d: d.update(objects={"outlines": d["objects"]["regions"]}))
    assert_rule(check(tree), 9, "needs an object named 'regions'")


def test_rule9_outline_without_date(tree: Path) -> None:
    edit(tree, "ice_extent/outlines.topo.json",
         lambda d: d["objects"]["outlines"]["geometries"][1]["properties"].pop("date"))
    assert_rule(check(tree), 9, "properties.date is required")


def test_rule9_open_ring(tree: Path) -> None:
    edit(tree, "regions.topo.json", lambda d: d["arcs"][0].pop())
    assert_rule(check(tree), 9, "ring is not closed")


def test_rule9_arc_index_out_of_range(tree: Path) -> None:
    edit(tree, "regions.topo.json", lambda d: d["objects"]["regions"]["geometries"][0].update(arcs=[[7]]))
    assert_rule(check(tree), 9, "arc index 7 is out of range")


def test_rule9_duplicate_geometry_id(tree: Path) -> None:
    edit(tree, "regions.topo.json",
         lambda d: d["objects"]["regions"]["geometries"].append({"type": "Polygon", "id": "greenland", "arcs": [[0]]}))
    assert_rule(check(tree), 9, "duplicate id 'greenland'")


def test_rule9_coordinates_out_of_range(tree: Path) -> None:
    edit(tree, "regions.topo.json", lambda d: d.update(arcs=[topo_square(-50, 60, -30, 95), d["arcs"][1]]))
    assert_rule(check(tree), 9, "outside lon -180..180")


@pytest.mark.parametrize("rule", range(1, 10))
def test_every_rule_has_a_failing_case(rule: int) -> None:
    names = [n for n in globals() if n.startswith(f"test_rule{rule}_")]
    assert names, f"no failing-case test for rule {rule}"
