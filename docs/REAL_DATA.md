# Real data: download checklist (M10)

What to download, where it goes, and the one command that processes it. Details for each source are in its dataset card in `docs/datasets/`. Raw files go under `data/raw/` (gitignored, never committed). The processed files in `data/public/` follow the data contract and must pass `uv run python -m pipeline validate`.

## One-time setup (you)

1. Create a free NASA Earthdata account at https://urs.earthdata.nasa.gov.
2. In your Earthdata profile, under **Applications > Authorized Apps**, approve **NASA GESDISC DATA ARCHIVE** (needed for MERRA-2). PO.DAAC and NSIDC work with the login alone.
3. Save the login on this PC so the pipeline can download without asking. Create the file `C:\Users\<you>\.netrc` with one line, and type the password yourself (never paste it into a chat):
   ```
   machine urs.earthdata.nasa.gov login YOUR_USERNAME password YOUR_PASSWORD
   ```
   Nothing in the repository stores or prints this file.

## Datasets

| # | Variable | Dataset | Format, size | Login | Raw folder | Status |
|---|---|---|---|---|---|---|
| 1 | Ice mass, ice mass change rate | IMBIE 2026 v1.0 (UK Polar Data Centre), doi:10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0 | 5 CSV, 0.4 MB | No | `data/raw/imbie/` | **Done 2026-11-13** (SHA-256 in `SHA256SUMS.txt`) |
| 2 | Sea level (global + coastal seas) | NASA-SSH simple gridded SSH V1.1 (PO.DAAC), `NASA_SSH_REF_SIMPLE_GRID_V11` | ~1,766 weekly netCDF, ~1.9 GB | Earthdata | `data/raw/sea_level/` | Ingest ready and tested on stand-ins; download in part (b) |
| 3 | Sea level cross-check | NASA-SSH GMSL indicator (PO.DAAC), `NASA_SSH_GMSL_INDICATOR` | 1 text file, tiny | Earthdata | `data/raw/sea_level/` | Read by the sea-level ingest as a cross-check |
| 4 | Ice mass map | GRACE/GRACE-FO JPL mascons RL06.3 v4 CRI (PO.DAAC), `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` | 1 netCDF, ~44 MB | Earthdata | `data/raw/grace/` | Ingest to write in part (b) |
| 5 | Ice extent (Greenland) | ITS_LIVE masks, NSIDC-0793 v1 | 1 netCDF, ~780 MB | Earthdata | `data/raw/itslive/` | Ingest to write in part (b) |
| 6 | Summer air temperature | MERRA-2 monthly M2TMNXSLV v5.12.4 (GES DISC), T2M only | ~0.5 GB if subset to T2M | Earthdata + GES DISC approval | `data/raw/merra2/` | Ingest to write in part (b); subset at the server to avoid ~30-40 GB |
| 7 | Sea level, long record 1900-2018 | JPL_RECON_GMSL v1.0 (PO.DAAC, Frederikse et al. 2020) | 1 netCDF, tiny | Earthdata | `data/raw/recon_gmsl/` | Ingest to write in part (b) |
| 8 | Ice mass, long record 1900-2018 | Same file as 7 (ice-sheet contributions) | same | same | same | Ingest to write in part (b) |

## Commands

```
pnpm data:real          # synthetic tree, then every real source present in data/raw/ on top
uv run python -m pipeline ingest imbie --raw data/raw/imbie
uv run python -m pipeline ingest sea_level --raw data/raw/sea_level
uv run python -m pipeline validate
pnpm media              # rerun the Describe videos after the data changes
```

`pnpm data` alone rebuilds the synthetic tree and drops the real data; run `pnpm data:real` instead once real files are in `data/raw/`.

## Honesty rules while sources arrive one at a time

- A variable is `synthetic: false` only when every series of it comes from the real source.
- Its map layer can still be a synthetic stand-in. The globe then shows **SYNTHETIC MAP** (the validator allows only this direction).
- Every result shows the "Data source & honesty" card: dataset, version, DOI, licence, download date, record used, missing values, joins, uncertainty and the processing steps.

## Check against published values (gate)

| Check | Published | Ours (IMBIE 2026 file) | Verdict |
|---|---|---|---|
| Greenland mean rate 1992-2018 | IMBIE 2020: 3,902 ± 342 Gt total, about -150 Gt/yr | -4,593 Gt total, -170.1 Gt/yr | Same direction and size; the 2026 reconciliation is a different, later estimate, so an exact match is not expected (dataset card: never splice releases) |
| Antarctica mean rate 1992-2017 | IMBIE 2018: 2,720 ± 1,390 Gt total, about -109 Gt/yr | -3,539 Gt total, -136.1 Gt/yr | Inside the published uncertainty |
