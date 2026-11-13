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
| 2 | Sea level (global + coastal seas) | NASA-SSH simple gridded SSH V1.1 (PO.DAAC), `NASA_SSH_REF_SIMPLE_GRID_V11` | ~1,766 weekly netCDF, ~1.9 GB | Earthdata | `data/raw/sea_level/` | **Done 2026-11-13**: 1,776 grids, 1992-10..2026-11; 10 weeks missing (2 null months) |
| 3 | Sea level cross-check | NASA-SSH GMSL indicator (PO.DAAC), `NASA_SSH_GMSL_INDICATOR` | 1 text file, tiny | Earthdata | `data/raw/sea_level/` | **Done**: cross-check grid global 3.170 vs indicator 3.200 mm/yr (1993-01..2026-10) |
| 4 | Ice mass map | GRACE/GRACE-FO JPL mascons RL06.3 v4 CRI (PO.DAAC), `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` | 1 netCDF, ~44 MB | Earthdata | `data/raw/grace/` | **Done 2026-11-13** (`ingest grace`): 261 monthly maps 2002-04..2026-09, 33 months no data, nothing clamped |
| 5 | Ice extent (Greenland) | ITS_LIVE masks, NSIDC-0793 v1 | 1 netCDF, ~780 MB | Earthdata | `data/raw/itslive/` | **Done 2026-11-13** (`ingest itslive`, about 30 min): 594 months, 51 yearly outlines |
| 6 | Summer air temperature | MERRA-2 monthly M2TMNXSLV v5.12.4 (GES DISC), T2M only | ~0.5 GB if subset to T2M | Earthdata + GES DISC approval | `data/raw/merra2/` | **Done 2026-11-13** (`ingest merra2`): T2M only via NASA OPeNDAP, 561 months, 286 MB instead of 30-40 GB |
| 7 | Sea level, long record 1900-2018 | JPL_RECON_GMSL v1.0 (PO.DAAC, Frederikse et al. 2020) | 1 netCDF, tiny | Earthdata | `data/raw/recon_gmsl/` | **Done 2026-11-13** (`ingest recon_gmsl`) |
| 8 | Ice mass, long record 1900-2018 | Same file as 7 (ice-sheet contributions) | same | same | same | **Done 2026-11-13** (mm of sea level -> Gt, 362 Gt = 1 mm, sign flipped) |
| 10 | Bangladesh monsoon rainfall | GPM IMERG Final monthly V07 (`GPM_3IMERGM`), Bangladesh box via OPeNDAP | 333 files, 13 MB | Earthdata | `data/raw/imerg/` | **Done 2026-11-13** (`ingest imerg`) |
| 11 | Bangladesh border | Natural Earth 1:50m admin 0 (public domain) | 1 GeoJSON, 3 MB | No | `data/raw/naturalearth/` | Simplified outline committed in `pipeline/synthetic/bangladesh.py` |

## Commands

```
pnpm data:real          # synthetic tree, then every real source present in data/raw/ on top
uv run python -m pipeline ingest imbie --raw data/raw/imbie
uv run python -m pipeline ingest sea_level --raw data/raw/sea_level
uv run python -m pipeline ingest recon_gmsl --raw data/raw/recon_gmsl
uv run python -m pipeline ingest grace --raw data/raw/grace
uv run python -m pipeline ingest merra2 --raw data/raw/merra2
uv run python -m pipeline ingest imerg --raw data/raw/imerg
uv run python -m pipeline ingest itslive --raw data/raw/itslive     # about 30 minutes (reads the 185 GB mask once)
uv run python scripts/download_real.py sea_level gmsl_indicator recon_gmsl grace itslive merra2 imerg   # downloads (Earthdata .netrc)
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
| Global mean sea level 1993-2026 (grids, no GIA) | NASA-SSH GMSL indicator: 3.200 mm/yr | 3.170 mm/yr | Agrees (difference 0.03 mm/yr) |
| Global mean sea level 1900-2018 | Frederikse et al. 2020: 1.56 +- 0.33 mm/yr | 1.56 mm/yr (least squares); Sen 1.54 (1.35 to 1.74) | Agrees |
| Greenland ice-covered area lost 1985-2021 (ITS_LIVE) | Greene et al. 2024 (Nature): about 5,000 km2 since 1985 (from memory, not re-checked) | 5,016 km2 (1985 vs 2021 annual means) | Agrees |
| Greenland summer (JJA) 2 m temperature, MERRA-2 | Known record melt summers 2012 and 2019 | Warmest summers: 2012 (+1.76 C), 2007, 2019, 2023; trend +0.022 C/yr (0.005 to 0.039), p = 0.008 | Consistent |
| Antarctic summer (DJF) 2 m temperature, MERRA-2 | No robust continent-wide summer warming since 1980 | -0.012 C/yr (-0.031 to 0.009), p = 0.32: cannot tell yet | Consistent |

Optional extra check with Giovanni (needs a browser login, so it is a manual step): Area-Averaged Time Series, variable "2-meter air temperature (M2TMNXSLV v5.12.4)", monthly, box 60-83 N, 73-11 W, 1980-01 to 2026-09, download CSV into `data/raw/giovanni/`. Giovanni averages a box, not our ice-sheet outline, so expect the same ups and downs but not the same numbers.
