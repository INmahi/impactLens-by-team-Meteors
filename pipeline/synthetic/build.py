"""Write a complete synthetic data contract tree (uv run python -m pipeline build --synthetic).

Deterministic for a given seed: every random stream is keyed on (seed, name),
JSON is written with fixed key order and formatting, and PNGs carry no
timestamps.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

import numpy as np

from ..validate import run_analyze, stats_file_content
from . import config as C
from .geometry import TopoWriter, scale_ring
from .maps import LAYER_MODELS, colormap, save_png, write_layer
from .series import all_series, trend_input


class BuildError(RuntimeError):
    pass


def _dump(path: Path, doc: Any, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        text = json.dumps(doc, indent=2, allow_nan=False, ensure_ascii=False) + "\n"
    else:
        text = json.dumps(doc, separators=(",", ":"), allow_nan=False, ensure_ascii=False)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def clear_root(root: Path) -> None:
    """Remove old generated content. Refuses a non-empty folder that does not look like a data tree."""
    if not root.exists():
        root.mkdir(parents=True)
        return
    if not root.is_dir():
        raise BuildError(f"{root} exists and is not a directory")
    entries = [p for p in root.iterdir() if not p.name.startswith(".")]
    if entries and not ((root / "variables.json").exists() or (root / "regions.json").exists()):
        raise BuildError(f"{root} is not empty and has no variables.json or regions.json; refusing to clear it")
    for p in entries:  # dotfiles such as .gitkeep are kept
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()


def _period(docs: list[dict[str, Any]]) -> tuple[dict[str, list[str]], list[str]]:
    periods = {}
    for d in docs:
        present = [dt for dt, v in zip(d["dates"], d["values"]) if v is not None]
        periods[d["region"]] = [present[0], present[-1]]
    span = [min(p[0] for p in periods.values()), max(p[1] for p in periods.values())]
    return periods, span


def _variable_entry(v: C.VariableSpec, docs: list[dict[str, Any]]) -> dict[str, Any]:
    periods, span = _period(docs)
    e: dict[str, Any] = {"id": v.id}
    if v.group:
        e["group"] = v.group
    if v.variant_of:
        e["variantOf"] = v.variant_of
    e.update({
        "name": v.name, "units": v.units, "kind": v.kind, "frequency": v.frequency,
        "period": span, "periods": periods, "regions": list(v.series),
    })
    if v.baseline:
        e["baseline"] = list(v.baseline)
    e["mapMode"] = v.map_mode
    if v.outlines:
        e["outlines"] = f"{v.id}/outlines.topo.json"
    e.update({
        "chartTypes": v.chart_types, "source": v.source,
        "describe": {"video": f"/media/{v.id}_loop.webm", **v.describe},
        "notes": v.notes, "synthetic": True,
    })
    return e


def _regions_doc(variables: list[C.VariableSpec]) -> list[dict[str, Any]]:
    known = {r.id for r in C.REGIONS}
    for v in variables:
        for rid in v.series:
            if rid not in known:
                raise BuildError(f"{v.id}: region {rid!r} is not in config.REGIONS")
    out = []
    for r in C.REGIONS:
        used = [v.id for v in variables if r.id in v.series]
        if not used:
            continue  # a region with no variable would break rule 2 (variables must be non-empty)
        out.append({
            "id": r.id, "name": r.name, "parent": r.parent, "kind": r.kind, "variables": used,
            "bbox": list(r.bbox), "camera": dict(r.camera),
        })
    return out


def _regions_topo(regions: list[dict[str, Any]]) -> dict[str, Any]:
    by_id = {r.id: r for r in C.REGIONS}
    tw = TopoWriter()
    geoms = []
    for r in regions:
        spec = by_id[r["id"]]
        if spec.kind == "global":
            continue
        if spec.outline is None:
            raise BuildError(f"region {spec.id!r} needs an outline (only kind 'global' has none)")
        geoms.append(tw.geometry(spec.outline, id=spec.id, properties={"name": spec.name}))
    return tw.topology("regions", geoms)


def _extent_outlines(v: C.VariableSpec, docs: list[dict[str, Any]]) -> dict[str, Any]:
    """One coarse outline per calendar year, scaled by sqrt(annual mean area / reference area)."""
    by_id = {r.id: r for r in C.REGIONS}
    tw = TopoWriter()
    geoms = []
    for doc in docs:
        outline = by_id[doc["region"]].outline
        assert outline is not None
        by_year: dict[str, list[float]] = {}
        for d, val in zip(doc["dates"], doc["values"]):
            if val is not None:
                by_year.setdefault(d[:4], []).append(val)
        means = {y: float(np.mean(vals)) for y, vals in by_year.items()}
        ref = means[min(means)]
        for year in sorted(means):
            factor = float(np.sqrt(means[year] / ref))
            geoms.append(tw.geometry(scale_ring(outline, factor),  # type: ignore[arg-type]
                                     properties={"region": doc["region"], "date": year}))
    return tw.topology("outlines", geoms)


def build_synthetic(root: Path | str, seed: int = C.DEFAULT_SEED, log: Any = print) -> dict[str, Any]:
    root = Path(root)
    clear_root(root)
    variables = C.VARIABLES

    # Series and stats (stats only through the real engine, one Node call).
    series = all_series(variables, seed)
    keys = list(series)
    results = run_analyze([trend_input(series[k]) for k in keys])
    for (vid, rid), res in zip(keys, results):
        if not res.get("ok"):
            raise BuildError(f"analyzeTrend() failed on {vid}/{rid}: {res.get('error')}")
        _dump(root / vid / "series" / f"{rid}.json", series[(vid, rid)])
        _dump(root / vid / "stats" / f"{rid}__default.json", stats_file_content(vid, rid, True, res["report"]))

    entries = []
    for v in variables:
        docs = [series[(v.id, rid)] for rid in v.series]
        entries.append(_variable_entry(v, docs))
        if v.outlines:
            _dump(root / v.id / "outlines.topo.json", _extent_outlines(v, docs))
    _dump(root / "variables.json", entries, pretty=True)

    regions = _regions_doc(variables)
    _dump(root / "regions.json", regions, pretty=True)
    _dump(root / "regions.topo.json", _regions_topo(regions))

    # Map layers named by mapMode.
    used_layers = {v.map_mode for v in variables if v.map_mode}
    for layer in C.MAP_LAYERS:
        if layer.id not in used_layers:
            continue
        fields = LAYER_MODELS[layer.id](layer, seed)
        manifest, clamped = write_layer(layer, fields, root / layer.id)
        if clamped:
            log(f"warning: {layer.id}: {clamped} valid cells clamped by the 16-bit packing")
        _dump(root / layer.id / "manifest.json", manifest)
        # ice_mass_map: red (loss) on the left; temperature: blue (cold) on the left.
        save_png(colormap(reverse=layer.id == "ice_mass_map"), root / layer.id / "colormap.png")
        log(f"{layer.id}: {len(manifest['frames'])} frames in {len(manifest['atlases'])} atlases, "
            f"{len(manifest['missing'])} missing")
    missing_layers = used_layers - {layer.id for layer in C.MAP_LAYERS}
    if missing_layers:
        raise BuildError(f"no map layer config for mapMode {sorted(missing_layers)}")

    log(f"wrote {len(series)} series and stats, {len(entries)} variables, {len(regions)} regions "
        f"to {root.as_posix()} (seed {seed})")
    return {"series": series, "reports": {k: r["report"] for k, r in zip(keys, results)}}
