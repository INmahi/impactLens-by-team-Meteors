"""Ingest entry points: raw files (real downloads or stand-ins) -> contract files.

`uv run python -m pipeline ingest sea_level --raw DIR` and `... ingest imbie --raw DIR`
overlay the variable onto an existing data tree (build it first): its series and
stats are replaced, its variables.json entry is rewritten, and regions.json is
regenerated so the region notes and variable lists stay consistent.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any, Callable, Iterable

from .. import writers as W
from ..synthetic import config as C
from ..validate import run_analyze
from .docs import REAL_SOURCES, read_marker, series_doc
from .gmsl import find_gmsl_file, gmsl_monthly
from .grid import GLOBAL_ID, IngestError, RawWeek, SeaLevelIngest, polygons_from_topo, read_weeks
from .imbie import annual_rate, list_imbie_files, read_imbie_csv

Log = Callable[[str], None]


def _var(vid: str) -> C.VariableSpec:
    return {v.id: v for v in C.VARIABLES}[vid]


def _seg(marker: dict[str, Any] | None, key: str, real: str) -> str:
    if marker is not None:
        return marker["series"].get(key, {}).get("segment_source") or real
    return real


def _inj(marker: dict[str, Any] | None, key: str) -> dict[str, Any] | None:
    return None if marker is None else marker["series"].get(key, {}).get("injected")


# --------------------------------------------------------------------------- sea level
def sea_level_region_ids(topo: dict[str, Any]) -> list[str]:
    """Regions sea_level is configured for that the topology can serve (global always)."""
    have = {g["id"] for g in topo["objects"]["regions"]["geometries"]} | {GLOBAL_ID}
    return [rid for rid in _var("sea_level").series if rid in have]


def sea_level_docs(weeks: Iterable[RawWeek], topo: dict[str, Any], marker: dict[str, Any] | None,
                   region_ids: list[str] | None = None) -> tuple[dict[str, dict[str, Any]], SeaLevelIngest]:
    v = _var("sea_level")
    rids = region_ids or sea_level_region_ids(topo)
    ing = SeaLevelIngest(polygons_from_topo(topo), rids)
    for wk in weeks:
        ing.add(wk)
    if not ing.labels:
        raise IngestError("no weekly grids found")
    synthetic = marker is not None
    docs = {}
    for rid in rids:
        months, vals = ing.monthly(rid)
        what = ("global area-weighted mean of all valid ocean cells" if rid == GLOBAL_ID
                else f"area-weighted mean over the {rid} polygon")
        docs[rid] = series_doc(
            variable=v.id, region=rid, units=v.units, frequency=v.frequency, kind=v.kind,
            dates=months, values=vals, synthetic=synthetic, injected=_inj(marker, f"sea_level/{rid}"),
            segment_source=_seg(marker, f"sea_level/{rid}", REAL_SOURCES["sea_level"]["segment"].format(what=what)),
            decimals=2,
        )
    return docs, ing


def indicator_crosscheck(grid_global: dict[str, Any], gmsl_path: Path) -> dict[str, Any]:
    """Sen's slope (analyzeTrend) of the grid-derived global mean vs the GMSL indicator, same months."""
    months, vals = gmsl_monthly(gmsl_path)
    ind = dict(zip(months, vals))
    common = [d for d, x in zip(grid_global["dates"], grid_global["values"]) if x is not None and ind.get(d) is not None]
    if len(common) < 24:
        raise IngestError("indicator and grid global share fewer than 24 months")
    lo, hi = common[0], common[-1]
    gd = [(d, x) for d, x in zip(grid_global["dates"], grid_global["values"]) if lo <= d <= hi]
    idates = [d for d, _x in gd]
    inputs = [
        {"dates": idates, "values": [x for _d, x in gd], "frequency": "monthly", "kind": "level"},
        {"dates": idates, "values": [ind.get(d) for d in idates], "frequency": "monthly", "kind": "level"},
    ]
    res = run_analyze(inputs)
    if not all(r.get("ok") for r in res):
        raise IngestError(f"analyzeTrend failed in the cross-check: {res}")
    g, i = (r["report"]["slope"] for r in res)
    return {"start": lo, "end": hi, "months": len(common), "grid_slope": g["perYear"],
            "grid_interval": [g["lower"], g["upper"]], "indicator_slope": i["perYear"],
            "indicator_interval": [i["lower"], i["upper"]], "difference": g["perYear"] - i["perYear"],
            "file": Path(gmsl_path).name}


# --------------------------------------------------------------------------- IMBIE
def imbie_docs(raw: Path, marker: dict[str, Any] | None) -> dict[tuple[str, str], dict[str, Any]]:
    files = list_imbie_files(raw)
    if not files:
        raise IngestError(f"no IMBIE Gt files (imbie3_<location>_Gt_partitioned.csv) in {raw}")
    vm, vr = _var("ice_mass"), _var("ice_mass_rate")
    synthetic = marker is not None
    tables = {t.region: (t, p.name) for p in files for t in [read_imbie_csv(p)]}
    out: dict[tuple[str, str], dict[str, Any]] = {}
    for vid, v in (("ice_mass", vm), ("ice_mass_rate", vr)):
        for rid in v.series:  # config order; regions without a file are skipped
            if rid not in tables:
                continue
            t, fname = tables[rid]
            if vid == "ice_mass":
                dates, vals, sig = t.months, t.cumulative, t.cumulative_sigma
            else:
                dates, vals, sig = annual_rate(t)
                if not dates:
                    raise IngestError(f"{fname}: no complete calendar year of rates")
            out[(vid, rid)] = series_doc(
                variable=vid, region=rid, units=v.units, frequency=v.frequency, kind=v.kind,
                dates=dates, values=vals, sigma=sig, synthetic=synthetic, injected=_inj(marker, f"{vid}/{rid}"),
                segment_source=_seg(marker, f"{vid}/{rid}", REAL_SOURCES[vid]["segment"].format(file=fname)),
                decimals=2,
            )
    return out


# --------------------------------------------------------------------------- overlay
def overlay(root: Path, vid: str, docs: list[dict[str, Any]], synthetic: bool) -> None:
    """Replace one variable's series, stats and variables.json entry in an existing tree."""
    root = Path(root)
    vpath = root / "variables.json"
    if not vpath.is_file():
        raise IngestError(f"{root} has no variables.json; build the tree first "
                          "(uv run python -m pipeline build --synthetic)")
    entries = json.loads(vpath.read_text(encoding="utf-8"))
    for sub in ("series", "stats"):
        shutil.rmtree(root / vid / sub, ignore_errors=True)
    W.write_series_and_stats(root, {(vid, d["region"]): d for d in docs})
    v = _var(vid)
    entry = W.variable_entry(v, docs, synthetic=synthetic, source=None if synthetic else REAL_SOURCES[vid]["source"])
    ids = [e["id"] for e in entries]
    if vid in ids:
        entries[ids.index(vid)] = entry
    else:
        entries.append(entry)
    W.dump(vpath, entries, pretty=True)
    var_regions = {e["id"]: list(e["regions"]) for e in entries}
    synth = {e["id"]: bool(e["synthetic"]) for e in entries}
    W.dump(root / "regions.json", W.regions_doc(var_regions, synth), pretty=True)


def ingest_sea_level(raw: Path, root: Path, log: Log = print) -> dict[str, Any]:
    raw, root = Path(raw), Path(root)
    topo_path = root / "regions.topo.json"
    if not topo_path.is_file():
        raise IngestError(f"{topo_path} not found; the averaging polygons come from it (build the tree first)")
    topo = json.loads(topo_path.read_text(encoding="utf-8"))
    marker = read_marker(raw)
    docs, ing = sea_level_docs(read_weeks(raw), topo, marker)
    for w in dict.fromkeys(ing.warnings):
        log(f"warning: {w}")
    log(f"sea_level: {len(ing.labels)} weekly grids {ing.labels[0]}..{ing.labels[-1]}; "
        f"cells per region {ing._avg.cell_counts() if ing._avg else {}}")
    for rid in docs:
        log(f"  {rid}: {ing.weeks_missing(rid)} weeks missing, {docs[rid]['values'].count(None)} null months")
    overlay(root, "sea_level", list(docs.values()), synthetic=marker is not None)
    out: dict[str, Any] = {"docs": docs}
    gm = find_gmsl_file(raw)
    if gm is not None and GLOBAL_ID in docs:
        try:
            cc = indicator_crosscheck(docs[GLOBAL_ID], gm)
        except IngestError as exc:  # the indicator is only a check; never block the ingest
            log(f"warning: cross-check vs {gm.name} skipped: {exc}")
        else:
            out["crosscheck"] = cc
            log(f"cross-check vs {cc['file']} ({cc['start']}..{cc['end']}): grid global {cc['grid_slope']:.3f} "
                f"mm/yr, indicator {cc['indicator_slope']:.3f} mm/yr, difference {cc['difference']:+.3f} mm/yr")
    return out


def ingest_imbie(raw: Path, root: Path, log: Log = print) -> dict[tuple[str, str], dict[str, Any]]:
    marker = read_marker(Path(raw))
    docs = imbie_docs(Path(raw), marker)
    for vid in ("ice_mass", "ice_mass_rate"):
        vdocs = [d for (v, _r), d in docs.items() if v == vid]
        if vdocs:
            overlay(Path(root), vid, vdocs, synthetic=marker is not None)
            log(f"{vid}: {len(vdocs)} regions, " + ", ".join(
                f"{d['region']} {d['dates'][0]}..{d['dates'][-1]}" for d in vdocs))
    return docs
