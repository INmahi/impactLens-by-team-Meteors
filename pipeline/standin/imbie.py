"""Stand-in IMBIE 2026 CSVs (synthetic, real layout).

Layout per docs/datasets/imbie.md: one region per file `imbie3_<location>_<unit>_partitioned.csv`
(Gt and mm), monthly rows, 13 columns in the BAS order. Exact header strings and the date
format are UNVERIFIED, so the writer can vary them (date "iso" or "decimal", shuffled
columns, comment lines) to test the ingest's keyword matching.

Values: the cumulative column is the synthetic ice_mass series and the rate column the
synthetic ice_mass_rate series repeated for each month of its year (the 2021 layout), so
the injected truth in config is what the ingest must recover.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any

import numpy as np

from ..ingest.docs import write_marker
from ..synthetic import config as C
from ..synthetic.series import make_series, stream

FILE_LOCATION = {"greenland": "greenland", "antarctica": "antarctica", "antarctica_east": "east_antarctica",
                 "antarctica_west": "west_antarctica", "antarctica_peninsula": "antarctic_peninsula"}
GT_PER_MM = 360.0

HEADERS = [  # BAS column order; strings guessed from the 2021 file plus "anomaly"
    "Date", "Mass balance ({r})", "Mass balance uncertainty ({r})",
    "Cumulative mass balance anomaly ({c})", "Cumulative mass balance anomaly uncertainty ({c})",
    "Surface mass balance anomaly ({r})", "Surface mass balance anomaly uncertainty ({r})",
    "Cumulative surface mass balance anomaly ({c})", "Cumulative surface mass balance anomaly uncertainty ({c})",
    "Dynamics mass balance anomaly ({r})", "Dynamics mass balance anomaly uncertainty ({r})",
    "Cumulative dynamics mass balance anomaly ({c})", "Cumulative dynamics mass balance anomaly uncertainty ({c})",
]


def _fmt(v: float | None) -> str:
    return "" if v is None or not np.isfinite(v) else f"{v:.4f}"


def region_rows(rid: str, seed: int) -> tuple[list[str], list[list[float | None]], dict[str, Any]]:
    """Dates (YYYY-MM) and 12 value columns (Gt units) for one region, plus marker entries."""
    vm = {v.id: v for v in C.VARIABLES}["ice_mass"]
    vr = {v.id: v for v in C.VARIABLES}["ice_mass_rate"]
    cum = make_series(vm, rid, vm.series[rid], seed)
    rate = make_series(vr, rid, vr.series[rid], seed) if rid in vr.series else None
    rate_by_year = {} if rate is None else {
        d: (v, s) for d, v, s in zip(rate["dates"], rate["values"], rate.get("sigma", [None] * len(rate["dates"])))}
    rng = stream(seed, "imbie_partition", rid)
    rows: list[list[float | None]] = []
    smb_cum = dyn_cum = 0.0
    for d, c, cs in zip(cum["dates"], cum["values"], cum.get("sigma", [None] * len(cum["dates"]))):
        r, rs = rate_by_year.get(d[:4], (None, None))
        smb = None if r is None else 0.45 * r + float(rng.normal(0, 5))
        dyn = None if r is None else r - smb  # type: ignore[operator]
        smb_cum += (smb or 0.0) / 12
        dyn_cum += (dyn or 0.0) / 12
        rows.append([r, rs, c, cs, smb, None if rs is None else 0.6 * rs, smb_cum, None if cs is None else 0.6 * cs,
                     dyn, None if rs is None else 0.6 * rs, dyn_cum, None if cs is None else 0.6 * cs])
    marker = {f"ice_mass/{rid}": {"injected": cum["injected"],
                                  "segment_source": vm.series[rid].segment_source or vm.segment_source}}
    if rate is not None:
        marker[f"ice_mass_rate/{rid}"] = {"injected": rate["injected"],
                                          "segment_source": vr.series[rid].segment_source or vr.segment_source}
    return cum["dates"], rows, marker


def write_region_csv(path: Path, dates: list[str], rows: list[list[float | None]], *, unit: str = "Gt",
                     date_format: str = "iso", order: list[int] | None = None,
                     comments: list[str] | None = None) -> Path:
    r_unit, c_unit = ("Gt/yr", "Gt") if unit == "Gt" else ("mm/yr", "mm")
    headers = [h.format(r=r_unit, c=c_unit) for h in HEADERS]
    order = order or list(range(13))
    with open(path, "w", encoding="utf-8", newline="") as fh:
        for line in comments or []:
            fh.write(f"# {line}\n")
        w = csv.writer(fh, lineterminator="\n")
        w.writerow([headers[i] for i in order])
        for d, vals in zip(dates, rows):
            y, m = int(d[:4]), int(d[5:7])
            cells = [f"{y:04d}-{m:02d}-01" if date_format == "iso" else f"{y + (m - 1) / 12:.4f}"]
            for k, v in enumerate(vals):
                if unit == "Gt":
                    factor = 1.0
                elif "uncertainty" in headers[k + 1].lower():
                    factor = 1.0 / GT_PER_MM
                else:
                    factor = -1.0 / GT_PER_MM   # mm of sea-level rise: mass loss is positive
                cells.append(_fmt(None if v is None else v * factor))
            w.writerow([cells[i] for i in order])
    return Path(path)


def write_imbie_standins(out_dir: Path, seed: int = C.DEFAULT_SEED, *, date_format: str = "iso",
                         mm_files: bool = True) -> dict[str, dict[str, Any]]:
    """One Gt (and mm) CSV per region plus the stand-in marker. Returns the marker series."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    vm = {v.id: v for v in C.VARIABLES}["ice_mass"]
    marker: dict[str, dict[str, Any]] = {}
    for rid in vm.series:
        loc = FILE_LOCATION[rid]
        dates, rows, mk = region_rows(rid, seed)
        marker.update(mk)
        write_region_csv(out_dir / f"imbie3_{loc}_Gt_partitioned.csv", dates, rows, date_format=date_format)
        if mm_files:
            write_region_csv(out_dir / f"imbie3_{loc}_mm_partitioned.csv", dates, rows, unit="mm",
                             date_format=date_format)
    write_marker(out_dir, marker, seed=seed, dataset="IMBIE 2026 stand-in")
    return marker
