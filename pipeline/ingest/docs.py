"""Turn ingested arrays into contract series documents.

The `standin.json` marker: stand-in raw files (pipeline/standin) are written next
to a `standin.json` that says they are synthetic and carries the injected truth.
Real downloads never have it, so ingest output is labelled `synthetic: false`
with the real source unless the marker is present.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .grid import IngestError

MARKER = "standin.json"

# Real-data source metadata (docs/datasets/*.md). Used when no stand-in marker is present.
REAL_SOURCES: dict[str, dict[str, Any]] = {
    "sea_level": {
        "source": {
            "name": "NASA-SSH simple gridded sea surface height V1.1 (PO.DAAC)",
            "url": "https://doi.org/10.5067/NSREF-SG0V11",
            "citation": "Willis, J. (2026). NASA-SSH Simple Gridded Sea Surface Height from Standardized "
                        "Reference Missions Only Version 1.1. PO.DAAC. https://doi.org/10.5067/NSREF-SG0V11. "
                        "Area means over our polygons by Trend Detective.",
        },
        "segment": "NASA_SSH_REF_SIMPLE_GRID_V11 (NASA-SSH simple grid v1.1), {what}; weekly grids "
                   "averaged by label month (>= 3 weeks)",
    },
    "ice_mass": {
        "source": {
            "name": "IMBIE 2026 (UK Polar Data Centre)",
            "url": "https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "citation": "IMBIE Team (2026). Mass balance of the Greenland and Antarctic ice sheets. UK Polar "
                        "Data Centre. https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
        },
        "segment": "IMBIE 2026 ({file}), cumulative mass balance anomaly",
    },
    "ice_mass_rate": {
        "source": {
            "name": "IMBIE 2026 (UK Polar Data Centre)",
            "url": "https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "citation": "IMBIE Team (2026). Mass balance of the Greenland and Antarctic ice sheets. UK Polar "
                        "Data Centre. https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
        },
        "segment": "IMBIE 2026 ({file}), mass balance rate; calendar-year mean of 12 monthly rows",
    },
}


def read_marker(raw: Path) -> dict[str, Any] | None:
    p = Path(raw) / MARKER
    if not p.is_file():
        return None
    doc = json.loads(p.read_text(encoding="utf-8"))
    if doc.get("synthetic") is not True:
        raise IngestError(f"{p}: a stand-in marker must say synthetic: true")
    return doc


def write_marker(raw: Path, series: dict[str, dict[str, Any]], **extra: Any) -> None:
    """series: "variable/region" -> {"injected": {...}, "segment_source": "..."}."""
    Path(raw).mkdir(parents=True, exist_ok=True)
    doc = {"synthetic": True, "note": "Synthetic stand-in files written by pipeline/standin; not NASA or IMBIE data.",
           **extra, "series": series}
    (Path(raw) / MARKER).write_text(json.dumps(doc, indent=2) + "\n", encoding="utf-8")


def _r(v: float | None, decimals: int) -> float | None:
    if v is None:
        return None
    return round(float(v), decimals) + 0.0


def series_doc(*, variable: str, region: str, units: str, frequency: str, kind: str,
               dates: list[str], values: list[float | None], sigma: list[float | None] | None = None,
               segment_source: str, synthetic: bool, injected: dict[str, Any] | None = None,
               decimals: int = 2) -> dict[str, Any]:
    """A contract series document; leading and trailing nulls are trimmed (never padded)."""
    vals = [_r(v, decimals) for v in values]
    keep = [i for i, v in enumerate(vals) if v is not None]
    if not keep:
        raise IngestError(f"{variable}/{region}: no valid values")
    lo, hi = keep[0], keep[-1] + 1
    doc: dict[str, Any] = {
        "variable": variable, "region": region, "units": units, "frequency": frequency, "kind": kind,
        "dates": dates[lo:hi], "values": vals[lo:hi],
    }
    if sigma is not None:
        sig = [_r(s, decimals) for s in sigma[lo:hi]]
        if any(s is not None for s in sig):
            doc["sigma"] = [None if v is None else s for v, s in zip(doc["values"], sig)]
    doc["segments"] = [{"source": segment_source, "start": doc["dates"][0], "end": doc["dates"][-1], "offset": 0}]
    doc["synthetic"] = synthetic
    if synthetic and injected is not None:
        doc["injected"] = injected
    return doc
