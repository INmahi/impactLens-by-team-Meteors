"""Contract writers shared by the synthetic build and the real-data ingest.

Both paths produce series documents (dicts in the series.schema.json shape) and
hand them to these functions, so variables.json, regions.json, regions.topo.json
and the stats files are written the same way whatever the data source.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .synthetic import config as C
from .synthetic.geometry import TopoWriter
from .validate import run_analyze, stats_file_content

REGION_SYNTH_NOTE = "SYNTHETIC DATA: the data for this region have known injected trends; not measurements."


class BuildError(RuntimeError):
    pass


def dump(path: Path, doc: Any, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        text = json.dumps(doc, indent=2, allow_nan=False, ensure_ascii=False) + "\n"
    else:
        text = json.dumps(doc, separators=(",", ":"), allow_nan=False, ensure_ascii=False)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def trend_input(doc: dict[str, Any]) -> dict[str, Any]:
    """The TrendInput the validator uses for rule 6 (default alpha, no range)."""
    return {k: doc[k] for k in ("dates", "values", "frequency", "kind")}


def period(docs: list[dict[str, Any]]) -> tuple[dict[str, list[str]], list[str]]:
    periods = {}
    for d in docs:
        present = [dt for dt, v in zip(d["dates"], d["values"]) if v is not None]
        if not present:
            raise BuildError(f"{d['variable']}/{d['region']}: no valid values")
        periods[d["region"]] = [present[0], present[-1]]
    span = [min(p[0] for p in periods.values()), max(p[1] for p in periods.values())]
    return periods, span


def variable_entry(v: C.VariableSpec, docs: list[dict[str, Any]], *, synthetic: bool,
                   source: dict[str, str] | None = None) -> dict[str, Any]:
    """variables.json entry. Real data drops the synthetic note and may carry its own source."""
    periods, span = period(docs)
    e: dict[str, Any] = {"id": v.id}
    if v.group:
        e["group"] = v.group
    if v.variant_of:
        e["variantOf"] = v.variant_of
    e.update({
        "name": v.name, "units": v.units, "kind": v.kind, "frequency": v.frequency,
        "period": span, "periods": periods, "regions": [d["region"] for d in docs],
    })
    if v.baseline:
        e["baseline"] = list(v.baseline)
    e["mapMode"] = v.map_mode
    if v.outlines:
        e["outlines"] = f"{v.id}/outlines.topo.json"
    notes = list(v.notes) if synthetic else [n for n in v.notes if n != C.SYNTH_NOTE]
    e.update({
        "chartTypes": v.chart_types, "source": source or v.source,
        "describe": {"video": f"/media/{v.id}_loop.webm", **v.describe},
        "notes": notes, "synthetic": synthetic,
    })
    return e


def regions_doc(var_regions: dict[str, list[str]], synthetic_by_var: dict[str, bool]) -> list[dict[str, Any]]:
    """regions.json from config REGIONS and each variable's region list (in variable order).

    A region's own notes get a SYNTHETIC DATA note first when any of its variables is synthetic.
    """
    known = {r.id for r in C.REGIONS}
    for vid, rids in var_regions.items():
        for rid in rids:
            if rid not in known:
                raise BuildError(f"{vid}: region {rid!r} is not in config.REGIONS")
    out = []
    for r in C.REGIONS:
        used = [vid for vid, rids in var_regions.items() if r.id in rids]
        if not used:
            continue  # a region with no variable would break rule 2 (variables must be non-empty)
        entry: dict[str, Any] = {
            "id": r.id, "name": r.name, "parent": r.parent, "kind": r.kind, "variables": used,
            "bbox": list(r.bbox), "camera": dict(r.camera),
        }
        if r.notes:
            synth = any(synthetic_by_var.get(vid, False) for vid in used)
            entry["notes"] = ([REGION_SYNTH_NOTE] if synth else []) + list(r.notes)
        out.append(entry)
    return out


def regions_topo(region_ids: list[str]) -> dict[str, Any]:
    """regions.topo.json for these regions (kind global has no geometry)."""
    by_id = {r.id: r for r in C.REGIONS}
    tw = TopoWriter()
    geoms = []
    for rid in region_ids:
        spec = by_id[rid]
        if spec.kind == "global":
            continue
        if spec.outline is None:
            raise BuildError(f"region {spec.id!r} needs an outline (only kind 'global' has none)")
        geoms.append(tw.geometry(spec.outline, id=spec.id, properties={"name": spec.name}))
    return tw.topology("regions", geoms)


def write_series_and_stats(root: Path, series: dict[tuple[str, str], dict[str, Any]]) -> dict[tuple[str, str], Any]:
    """Write every series and its stats file (stats only through analyzeTrend(), one Node call)."""
    keys = list(series)
    results = run_analyze([trend_input(series[k]) for k in keys])
    reports = {}
    for (vid, rid), res in zip(keys, results):
        if not res.get("ok"):
            raise BuildError(f"analyzeTrend() failed on {vid}/{rid}: {res.get('error')}")
        doc = series[(vid, rid)]
        dump(root / vid / "series" / f"{rid}.json", doc)
        dump(root / vid / "stats" / f"{rid}__default.json",
             stats_file_content(vid, rid, bool(doc["synthetic"]), res["report"]))
        reports[(vid, rid)] = res["report"]
    return reports
