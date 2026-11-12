"""All synthetic series, with the ingested variables coming through the REAL ingest code.

- ice_mass, ice_mass_rate: stand-in IMBIE CSVs are written to a work folder and read
  back by pipeline.ingest (the same call as `ingest imbie --raw`).
- sea_level: stand-in weekly NASA-SSH grids (720 x 360, float64 metres, fills) are fed
  IN MEMORY to the same SeaLevelIngest the file reader feeds; only the netCDF read is
  skipped, which keeps the build small and fast (a full 1993-2026 weekly file set would
  be about 1.8 GB). The GMSL indicator stand-in is written as a text file and read back
  for the cross-check.
- every other variable: pipeline.synthetic.series.make_series (no raw source yet).
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .. import writers as W
from ..ingest.docs import read_marker
from ..ingest.run import imbie_docs, indicator_crosscheck, sea_level_docs
from ..standin.gmsl import write_gmsl
from ..standin.imbie import write_imbie_standins
from ..standin.ssh import SSHStandin
from . import config as C
from .series import all_series

INGESTED = ("ice_mass", "ice_mass_rate", "sea_level")


def config_var_regions() -> dict[str, list[str]]:
    return {v.id: list(v.series) for v in C.VARIABLES}


def config_topo() -> dict[str, Any]:
    """The regions.topo.json document the build writes (averaging polygons come from it)."""
    regions = W.regions_doc(config_var_regions(), {v.id: True for v in C.VARIABLES})
    return W.regions_topo([r["id"] for r in regions])


def seed_trend_inputs(seed: int) -> list[tuple[str, str, dict[str, Any], float]]:
    """(variable, region, TrendInput, injected slope) for every series of one seed.

    Top-level so a process pool can run seeds in parallel (multi-seed coverage gate).
    """
    import tempfile

    with tempfile.TemporaryDirectory(prefix="trend-standin-") as d:
        series, _info = synthetic_series(seed, Path(d), crosscheck=False)
    return [(vid, rid, W.trend_input(doc), float(doc["injected"]["slopePerYear"]))
            for (vid, rid), doc in series.items()]


def synthetic_series(seed: int, workdir: Path, crosscheck: bool = True) -> tuple[dict[tuple[str, str], dict[str, Any]],
                                                                               dict[str, Any]]:
    """Every (variable, region) series in config order, plus build info (cross-check, gaps)."""
    workdir = Path(workdir)
    out: dict[tuple[str, str], dict[str, Any]] = {}
    base = all_series([v for v in C.VARIABLES if v.id not in INGESTED], seed)

    imbie_dir = workdir / "imbie"
    write_imbie_standins(imbie_dir, seed)
    ice = imbie_docs(imbie_dir, read_marker(imbie_dir))

    topo = config_topo()
    st = SSHStandin(seed, topo)
    indicator: list[float] = []
    sl, ing = sea_level_docs(st.weeks(indicator if crosscheck else None),
                             topo, {"synthetic": True, "series": st.marker_series()}, st.region_ids)
    info: dict[str, Any] = {"weeks": len(st.labels), "gap_months": st.gap_months,
                            "cells": ing._avg.cell_counts() if ing._avg else {},
                            "weeks_missing": {rid: ing.weeks_missing(rid) for rid in st.region_ids}}
    if crosscheck:
        path = write_gmsl(workdir / "ssh" / "NASA_SSH_GMSL_INDICATOR.txt", st.labels, indicator)
        info["crosscheck"] = indicator_crosscheck(sl["global"], path)

    for v in C.VARIABLES:
        for rid in v.series:
            if v.id == "sea_level":
                out[(v.id, rid)] = sl[rid]
            elif v.id in INGESTED:
                out[(v.id, rid)] = ice[(v.id, rid)]
            else:
                out[(v.id, rid)] = base[(v.id, rid)]
    return out, info
