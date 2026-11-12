"""Build a tiny, valid data/public tree for the validator tests.

Four variables (one with variantOf), three regions (one global), a monthly
series with a gap, sigma and lower/upper bounds, a two-source series with
segments, a gridded layer with an 8-bit RGBA atlas and colormap, region
outlines and dated outlines. Stats come from the real engine through Node.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from pipeline.validate import run_analyze, stats_file_content

SOURCE = {
    "name": "Test source",
    "url": "https://example.org/data",
    "citation": "Test fixture, not real data.",
}


def write_json(root: Path, rel: str, doc: Any) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, allow_nan=False), encoding="utf-8")


def read_json(root: Path, rel: str) -> Any:
    return json.loads((root / rel).read_text(encoding="utf-8"))


def monthly_dates(start: str, end: str) -> list[str]:
    y, m = map(int, start.split("-"))
    out = []
    while f"{y:04d}-{m:02d}" <= end:
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def annual_dates(start: str, end: str) -> list[str]:
    return [f"{y:04d}" for y in range(int(start), int(end) + 1)]


def wiggle(n: int, slope: float, amp: float, monthly: bool) -> list[float]:
    """Deterministic trend + seasonal cycle + irregular part."""
    out = []
    for i in range(n):
        t = i / 12 if monthly else float(i)
        seasonal = amp * math.sin(2 * math.pi * i / 12) if monthly else 0.0
        irregular = 0.7 * amp * math.sin(i * 2.399) * math.cos(i * 0.917)
        out.append(round(slope * t + seasonal + irregular, 3))
    return out


def variable(vid: str, **kw: Any) -> dict[str, Any]:
    base = {
        "id": vid,
        "name": vid.replace("_", " ").capitalize(),
        "mapMode": None,
        "chartTypes": ["series"],
        "source": SOURCE,
        "describe": {"video": f"/media/{vid}_loop.webm", "what": "Test.", "whyItMatters": "Test."},
        "notes": ["Test fixture."],
        "synthetic": True,
    }
    base.update(kw)
    return base


def series(vid: str, rid: str, units: str, freq: str, kind: str, dates: list[str], values: list[float | None],
           segments: list[dict] | None = None, **extra: Any) -> dict[str, Any]:
    doc = {
        "variable": vid, "region": rid, "units": units, "frequency": freq, "kind": kind,
        "dates": dates, "values": values,
        "segments": segments or [{"source": "Test source", "start": dates[0], "end": dates[-1], "offset": 0}],
        "synthetic": True,
    }
    doc.update(extra)
    return doc


def topo_square(lon0: float, lat0: float, lon1: float, lat1: float) -> list[list[float]]:
    return [[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]]


def build_tree(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)

    # ---------------------------------------------------------------- series
    gl_dates = monthly_dates("2000-01", "2002-12")
    gl_vals: list[float | None] = wiggle(len(gl_dates), -250.0, 40.0, True)
    gl_vals[17] = None  # gap: 2001-06
    gl_sigma: list[float | None] = [round(20 + i * 0.5, 2) for i in range(len(gl_dates))]
    gl_sigma[17] = None
    an_dates = monthly_dates("2000-03", "2002-12")
    an_vals = wiggle(len(an_dates), -120.0, 60.0, True)
    long_dates = annual_dates("1990", "2005")
    long_vals = wiggle(len(long_dates), -80.0, 30.0, False)
    ext_dates = annual_dates("1990", "2000")
    ext_vals = [round(1.8e6 - 500 * i + 50 * math.sin(i), 1) for i in range(len(ext_dates))]
    sl_dates = annual_dates("1993", "2010")
    sl_vals = wiggle(len(sl_dates), 3.2, 2.0, False)

    all_series = {
        ("ice_mass", "greenland"): series(
            "ice_mass", "greenland", "Gt", "monthly", "cumulative", gl_dates, gl_vals,
            sigma=gl_sigma, injected={"slopePerYear": -250.0, "ar1": 0.0, "noiseSd": 28.0}),
        ("ice_mass", "antarctica"): series(
            "ice_mass", "antarctica", "Gt", "monthly", "cumulative", an_dates, an_vals,
            sigma=[30.0] * len(an_dates)),
        ("ice_mass_long", "greenland"): series(
            "ice_mass_long", "greenland", "Gt", "annual", "cumulative", long_dates, long_vals,
            lower=[round(v - 50, 3) for v in long_vals], upper=[round(v + 50, 3) for v in long_vals],
            bounds="5-95%"),
        ("ice_extent", "greenland"): series(
            "ice_extent", "greenland", "km2", "annual", "level", ext_dates, ext_vals),
        ("sea_level", "global"): series(
            "sea_level", "global", "mm", "annual", "level", sl_dates, sl_vals,
            segments=[
                {"source": "Mission A", "start": "1993", "end": "2001", "offset": 0},
                {"source": "Mission B", "start": "2002", "end": "2010", "offset": 1.5},
            ]),
    }
    for (vid, rid), doc in all_series.items():
        write_json(root, f"{vid}/series/{rid}.json", doc)

    # ------------------------------------------------------- stats via Node
    keys = list(all_series)
    inputs = [{k: all_series[key][k] for k in ("dates", "values", "frequency", "kind")} for key in keys]
    for (vid, rid), res in zip(keys, run_analyze(inputs)):
        assert res["ok"], res
        write_json(root, f"{vid}/stats/{rid}__default.json", stats_file_content(vid, rid, True, res["report"]))

    # ------------------------------------------------------------ variables
    variables = [
        variable("ice_mass", group="ice_sheet", units="Gt", kind="cumulative", frequency="monthly",
                 period=["2000-01", "2002-12"],
                 periods={"greenland": ["2000-01", "2002-12"], "antarctica": ["2000-03", "2002-12"]},
                 regions=["greenland", "antarctica"], mapMode="ice_mass_map"),
        variable("ice_mass_long", variantOf="ice_mass", units="Gt", kind="cumulative", frequency="annual",
                 period=["1990", "2005"], periods={"greenland": ["1990", "2005"]}, regions=["greenland"]),
        variable("ice_extent", group="ice_sheet", units="km2", kind="level", frequency="annual",
                 period=["1990", "2000"], periods={"greenland": ["1990", "2000"]}, regions=["greenland"],
                 outlines="ice_extent/outlines.topo.json"),
        variable("sea_level", units="mm", kind="level", frequency="annual",
                 period=["1993", "2010"], periods={"global": ["1993", "2010"]}, regions=["global"]),
    ]
    write_json(root, "variables.json", variables)

    # -------------------------------------------------------------- regions
    regions = [
        {"id": "greenland", "name": "Greenland", "parent": None, "kind": "ice_sheet",
         "variables": ["ice_mass", "ice_mass_long", "ice_extent"], "bbox": [-74, 59, -10, 84],
         "camera": {"lon": -42, "lat": 72, "height": 4500000, "heading": 0, "pitch": -90}},
        {"id": "antarctica", "name": "Antarctica", "parent": None, "kind": "ice_sheet",
         "variables": ["ice_mass"], "bbox": [-180, -90, 180, -60],
         "camera": {"lon": 0, "lat": -90, "height": 9000000, "heading": 0, "pitch": -90}},
        {"id": "global", "name": "Global", "parent": None, "kind": "global",
         "variables": ["sea_level"], "bbox": [-180, -90, 180, 90],
         "camera": {"lon": 0, "lat": 20, "height": 20000000, "heading": 0, "pitch": -90}},
    ]
    write_json(root, "regions.json", regions)

    write_json(root, "regions.topo.json", {
        "type": "Topology",
        "objects": {"regions": {"type": "GeometryCollection", "geometries": [
            {"type": "Polygon", "id": "greenland", "properties": {"name": "Greenland"}, "arcs": [[0]]},
            {"type": "Polygon", "id": "antarctica", "properties": {"name": "Antarctica"}, "arcs": [[1]]},
        ]}},
        "arcs": [topo_square(-50, 60, -30, 80), topo_square(-180, -85, 180, -70)],
    })
    # Quantized, delta-encoded outlines (exercises the transform decoding).
    write_json(root, "ice_extent/outlines.topo.json", {
        "type": "Topology",
        "transform": {"scale": [0.01, 0.01], "translate": [-50, 60]},
        "objects": {"outlines": {"type": "GeometryCollection", "geometries": [
            {"type": "Polygon", "properties": {"region": "greenland", "date": "1990"}, "arcs": [[0]]},
            {"type": "Polygon", "properties": {"region": "greenland", "date": "2000"}, "arcs": [[1]]},
        ]}},
        "arcs": [
            [[0, 0], [2000, 0], [0, 2000], [-2000, 0], [0, -2000]],
            [[100, 100], [1800, 0], [0, 1800], [-1800, 0], [0, -1800]],
        ],
    })

    # ------------------------------------------------------- gridded layer
    layer = root / "ice_mass_map"
    (layer / "frames").mkdir(parents=True, exist_ok=True)
    atlas = np.zeros((6, 8, 4), dtype=np.uint8)  # 8 wide, 6 high: room for 2x2 frames of 4x3
    atlas[..., 3] = 255
    atlas[:, :, 2] = 255
    atlas[0, 0, 2] = 0  # one invalid pixel
    atlas[..., 0] = 3
    atlas[..., 1] = np.arange(8, dtype=np.uint8)[None, :] * 20
    Image.fromarray(atlas, "RGBA").save(layer / "frames" / "atlas-000.png")
    cmap = np.zeros((1, 256, 4), dtype=np.uint8)
    cmap[0, :, 0] = np.arange(256)
    cmap[0, :, 2] = 255 - np.arange(256)
    cmap[0, :, 3] = 255
    Image.fromarray(cmap, "RGBA").save(layer / "colormap.png")
    write_json(root, "ice_mass_map/manifest.json", {
        "variable": "ice_mass_map",
        "units": "cm w.e.",
        "grid": {"bbox": [-74, 59, -10, 84], "width": 4, "height": 3},
        "encoding": {"scale": 0.01, "offset": -300, "packing": "R=high byte, G=low byte, B=valid mask, A=255"},
        "valueRange": [-100, 100],
        "atlases": [{"file": "frames/atlas-000.png", "width": 8, "height": 6}],
        "frames": [
            {"date": "2002-01", "atlas": 0, "x": 0, "y": 0, "w": 4, "h": 3},
            {"date": "2002-02", "atlas": 0, "x": 4, "y": 0, "w": 4, "h": 3},
            {"date": "2002-04", "atlas": 0, "x": 0, "y": 3, "w": 4, "h": 3},
        ],
        "missing": ["2002-03"],
        "source": SOURCE,
        "synthetic": True,
    })
