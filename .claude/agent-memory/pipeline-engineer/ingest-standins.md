---
name: ingest-standins
description: Facts about pipeline/ingest + pipeline/standin (2026-11-13) - netCDF engine gap, file sizes, short-series NaN stats, IMBIE header bug fixed, test design
metadata:
  type: project
---

- Only scipy is installed, so stand-ins are netCDF-3 (~4 MB/week at 720x360, ~2 s write, ~1 s read).
  REAL NASA-SSH files are netCDF-4: reading them needs h5netcdf or netCDF4 (dependency = main's call;
  read_ssh_file raises a clear IngestError). Full 1993-2026 set on disk would be ~1.8 GB (netCDF-3) -> the
  build feeds RawWeeks in memory to the same SeaLevelIngest; tests prove file path == memory path bit-exact.
- A sea_level series under ~2 years makes analyzeTrend's seasonal MK cross-check NaN -> stats file fails
  rule 6/schema. Short CLI test sets must span >= 2 years (test uses 3 weeks in Jan 2020/21/22, 9 files).
- Bug fixed 2026-11-13: IMBIE header detection tested the FIRST cell for a date, so shuffled columns broke
  it. Header is now the first row naming >= 2 "mass balance" columns.
- pipeline/tests/test_ingest.py: 70 tests (2 skipped), CLI tests reuse the session `built` fixture and
  check CLI output == build output (imbie) / == in-memory ingest (sea_level).

**Why:** M10 swap to real files will hit these first.
**How to apply:** on the first real download, run read_ssh_file / parse_gmsl / read_imbie_csv and compare
with the UNVERIFIED items in the dataset cards. Related: [[synthetic-generator]], [[library-quirks]]
