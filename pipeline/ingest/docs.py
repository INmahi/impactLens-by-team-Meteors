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
    "sea_level_long": {
        "source": {
            "name": "JPL_RECON_GMSL v1.0 (PO.DAAC; Frederikse et al. 2020)",
            "url": "https://doi.org/10.5067/GMSLT-FJPL1",
            "citation": "Frederikse, T., Landerer, F., Caron, L., et al. (2020). The causes of sea-level rise since "
                        "1900. Nature 584, 393-397, https://doi.org/10.1038/s41586-020-2591-3. Data: JPL_RECON_GMSL "
                        "v1.0, PO.DAAC, https://doi.org/10.5067/GMSLT-FJPL1",
            "doi": "10.5067/GMSLT-FJPL1",
            "version": "1.0",
            "licence": "NASA open data (no restrictions)",
            "processing": [
                "Downloaded global_timeseries_measures.nc unchanged.",
                "Used global_average_sea_level_change and its 5-95% lower and upper bounds, annual, as published.",
                "No smoothing, gap filling or extrapolation; never joined to the satellite record.",
            ],
        },
        "notes": [
            "Reconstructed from tide gauges, corrected for land motion, plus models; not satellite data.",
            "Global mean only; it is not the sea level at any place.",
            "Ends in 2018; the satellite record (1993 onward) is a separate variable and is never joined to it.",
        ],
    },
    "ice_mass_long": {
        "source": {
            "name": "JPL_RECON_GMSL v1.0 (PO.DAAC; Frederikse et al. 2020)",
            "url": "https://doi.org/10.5067/GMSLT-FJPL1",
            "citation": "Frederikse, T., Landerer, F., Caron, L., et al. (2020). The causes of sea-level rise since "
                        "1900. Nature 584, 393-397, https://doi.org/10.1038/s41586-020-2591-3. Data: JPL_RECON_GMSL "
                        "v1.0, PO.DAAC, https://doi.org/10.5067/GMSLT-FJPL1",
            "doi": "10.5067/GMSLT-FJPL1",
            "version": "1.0",
            "licence": "NASA open data (no restrictions)",
            "processing": [
                "Downloaded global_timeseries_measures.nc unchanged.",
                "Used the Greenland (GrIS) and Antarctic (AIS) sea-level contributions and their 5-95% bounds.",
                "Converted mm of sea level to ice mass change in Gt with 362 Gt = 1 mm, sign flipped so ice "
                "loss is negative mass (as in IMBIE).",
                "No smoothing, gap filling or extrapolation; never joined to the IMBIE record.",
            ],
        },
        "notes": [
            "Before the satellite era the values come from reconstructions with large uncertainty (see the bounds).",
            "Not independent of IMBIE and GRACE in the recent decades: the reconstruction uses them.",
        ],
    },
    "sea_level": {
        "source": {
            "name": "NASA-SSH simple gridded sea surface height V1.1 (PO.DAAC)",
            "url": "https://doi.org/10.5067/NSREF-SG0V11",
            "citation": "Willis, J. (2026). NASA-SSH Simple Gridded Sea Surface Height from Standardized "
                        "Reference Missions Only Version 1.1. PO.DAAC. https://doi.org/10.5067/NSREF-SG0V11. "
                        "Area means over our polygons by Trend Detective.",
            "doi": "10.5067/NSREF-SG0V11",
            "version": "1.1",
            "licence": "NASA open data (no restrictions)",
            "processing": [
                "Downloaded the weekly 0.5-degree grids unchanged.",
                "Area-weighted mean of the valid cells inside each sea's polygon (polygons kept about 100 km "
                "offshore); the global mean uses all valid cells.",
                "Monthly value = mean of the weeks labelled in that month (at least 3 weeks, else missing).",
                "No glacial isostatic adjustment, no land subsidence, no gap filling or extrapolation.",
            ],
        },
        "segment": "NASA_SSH_REF_SIMPLE_GRID_V11 (NASA-SSH simple grid v1.1), {what}; weekly grids "
                   "averaged by label month (>= 3 weeks)",
    },
    "ice_mass": {
        "source": {
            "name": "IMBIE 2026 (UK Polar Data Centre)",
            "url": "https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "citation": "Otosaka, I., Shepherd, A., Amory, C., et al. (2026). Mass balance of the Greenland and "
                        "Antarctic Ice Sheets from the 1970s to 2023 (Version 1.0) [Data set]. NERC EDS UK Polar "
                        "Data Centre. https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "doi": "10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "version": "1.0",
            "licence": "Open Government Licence v3.0",
            "processing": [
                "Downloaded the per-region CSV files (imbie3_<region>_Gt_partitioned.csv) unchanged.",
                "Used the total cumulative mass balance column and its 1-sigma uncertainty, monthly, as published.",
                "No smoothing, gap filling or extrapolation.",
            ],
        },
        "segment": "IMBIE 2026 ({file}), cumulative mass balance anomaly",
        "notes": [
            "Cumulative mass is relative to the start of the record, not the total mass of the ice sheet.",
            "Reconciled from many satellite surveys (gravity, altimetry and the input-output method), not one instrument.",
            "Before 1992 the record rests on fewer, older methods, so the uncertainty is larger early.",
            "Not independent of GRACE-based ice maps or sea-level budgets: gravimetry is one of IMBIE's methods.",
        ],
    },
    "ice_mass_rate": {
        "source": {
            "name": "IMBIE 2026 (UK Polar Data Centre)",
            "url": "https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "citation": "Otosaka, I., Shepherd, A., Amory, C., et al. (2026). Mass balance of the Greenland and "
                        "Antarctic Ice Sheets from the 1970s to 2023 (Version 1.0) [Data set]. NERC EDS UK Polar "
                        "Data Centre. https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "doi": "10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0",
            "version": "1.0",
            "licence": "Open Government Licence v3.0",
            "processing": [
                "Downloaded the per-region CSV files (imbie3_<region>_Gt_partitioned.csv) unchanged.",
                "Annual rate = mean of the 12 published monthly rate rows of each calendar year; years with "
                "fewer than 12 months are left out (no padding).",
                "Never recomputed by differencing the cumulative series.",
            ],
        },
        "segment": "IMBIE 2026 ({file}), mass balance rate; calendar-year mean of 12 monthly rows",
        "notes": [
            "Published rates change about once a year, so each calendar year is one point.",
            "Reconciled from many satellite surveys (gravity, altimetry and the input-output method), not one instrument.",
            "Before 1992 the record rests on fewer, older methods, so the uncertainty is larger early.",
            "Not independent of GRACE-based ice maps or sea-level budgets: gravimetry is one of IMBIE's methods.",
        ],
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
