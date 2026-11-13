"""Write a complete synthetic data contract tree (uv run python -m pipeline build --synthetic).

sea_level, ice_mass and ice_mass_rate come through the real ingest code from
stand-in raw files (see assemble.py); the rest from make_series. Contract files are
written by pipeline.writers, the same writers the ingest overlay uses.

Deterministic for a given seed: every random stream is keyed on (seed, name),
JSON is written with fixed key order and formatting, and PNGs carry no
timestamps.
"""

from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from typing import Any

import numpy as np

from .. import writers as W
from ..writers import BuildError
from . import config as C
from .assemble import synthetic_series
from .geometry import TopoWriter, scale_ring
from .maps import LAYER_MODELS, colormap, melt_colormap, save_png, write_layer

__all__ = ["BuildError", "build_synthetic", "clear_root"]


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

    with tempfile.TemporaryDirectory(prefix="trend-standin-") as work:
        series, info = synthetic_series(seed, Path(work))
    reports = W.write_series_and_stats(root, series)

    entries = []
    for v in variables:
        docs = [series[(v.id, rid)] for rid in v.series]
        entries.append(W.variable_entry(v, docs, synthetic=True))
        if v.outlines:
            W.dump(root / v.id / "outlines.topo.json", _extent_outlines(v, docs))
    W.dump(root / "variables.json", entries, pretty=True)

    regions = W.regions_doc({e["id"]: e["regions"] for e in entries}, {e["id"]: True for e in entries})
    W.dump(root / "regions.json", regions, pretty=True)
    W.dump(root / "regions.topo.json", W.regions_topo([r["id"] for r in regions]))

    # Map layers named by mapMode.
    used_layers = {v.map_mode for v in variables if v.map_mode}
    for layer in C.MAP_LAYERS:
        if layer.id not in used_layers:
            continue
        fields = LAYER_MODELS[layer.id](layer, seed)
        manifest, clamped = write_layer(layer, fields, root / layer.id)
        if clamped:
            log(f"warning: {layer.id}: {clamped} valid cells clamped by the 16-bit packing")
        W.dump(root / layer.id / "manifest.json", manifest)
        # ice_mass_map: red (loss) on the left; temperature: blue (cold) on the left.
        save_png(melt_colormap() if layer.glow else colormap(reverse=False), root / layer.id / "colormap.png")
        log(f"{layer.id}: {len(manifest['frames'])} frames in {len(manifest['atlases'])} atlases, "
            f"{len(manifest['missing'])} missing")
    missing_layers = used_layers - {layer.id for layer in C.MAP_LAYERS}
    if missing_layers:
        raise BuildError(f"no map layer config for mapMode {sorted(missing_layers)}")

    cc = info.get("crosscheck")
    log(f"sea_level: {info['weeks']} stand-in weekly grids through the ingest; failed-grid months "
        f"{info['gap_months']}; 0.5-deg cells {info['cells']}")
    if cc:
        log(f"cross-check: grid global {cc['grid_slope']:.3f} mm/yr vs GMSL indicator stand-in "
            f"{cc['indicator_slope']:.3f} mm/yr ({cc['start']}..{cc['end']}), difference {cc['difference']:+.4f}")
    log(f"wrote {len(series)} series and stats, {len(entries)} variables, {len(regions)} regions "
        f"to {root.as_posix()} (seed {seed})")
    return {"series": series, "reports": reports, "info": info}
