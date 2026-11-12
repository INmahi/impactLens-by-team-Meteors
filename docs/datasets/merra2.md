# MERRA-2 monthly 2 m air temperature (M2TMNXSLV)

Card status: verified 2026-11-12. Nothing was downloaded. **Recommended PRIMARY temperature product** (see the end of this card).

## What it is
MERRA-2 is NASA's atmospheric reanalysis (GEOS-5 model v5.12.4 plus assimilated observations), run by the Global Modeling and Assimilation Office (GMAO). This collection is the **monthly mean of single-level 2D diagnostics**, which includes near-surface air temperature (2 m temperature, variable `T2M`; see UNVERIFIED list).
- Product name: **MERRA-2 tavgM_2d_slv_Nx: 2d, Monthly mean, Time-Averaged, Single-Level, Assimilation, Single-Level Diagnostics V5.12.4**
- earthaccess short name: **`M2TMNXSLV`**, version **5.12.4** (native id `M2TMNXSLV_5.12.4`). DOI **10.5067/AP1B0BA5PD2K**. Concept id C1276812859-GES_DISC. Processing level 4. Collection release date 2015-06-30.
- Provider: NASA GMAO, archived at NASA GES DISC. **NASA product.**
- Related collection not used: M2TMNXLND / M2TMNXFLX etc. (land and flux diagnostics). Skin temperature `TS` is also in the surface collections; we use air temperature `T2M`.

## Feeds
- Variable `temperature`, regions `greenland` and `antarctica` only (plan section 3). Not valid for `antarctica_west`, `antarctica_east`, `antarctica_peninsula` (plan does not list them for temperature) or `global`.
- Map layer: gridded frames. Series: area-weighted polar mean (Greenland June-August, Antarctica December-February; annual mean as labelled fallback).

## Real coverage and time step
- Start: **1980-01** (CMR granule `...tavgM_2d_slv_Nx.198001.nc4`, stream `MERRA2_100`). Verified.
- Latest: **2026-09** (granule `MERRA2_400.tavgM_2d_slv_Nx.202609.nc4`, listed time 2026-09-01 to 2026-09-30). Verified on 2026-11-12. Latency about 3 weeks after month end (from the collection description).
- Time step: **monthly**. 561 monthly files from 1980-01 to 2026-09 (counted from the dates, not listed one by one).
- Record length: 46 years 9 months. **About 3 years short of the 50-year target.** Never pad.
- Seasonal series lengths: June-August means **1980 to 2026 (47 seasons**, Aug 2026 exists). December-February means: first complete season is Dec 1980 to Feb 1981, so **1981 to 2026 (46 seasons**, labelled by the year of the January; Dec 2025-Feb 2026 is the last complete one). The 1980 season is incomplete (no Dec 1979) and must be `null` or dropped, not filled. Label seasons clearly.
- The 1979 and earlier problem (satellite coverage) does not apply: the record starts in 1980. The archive streams change (`MERRA2_100` in 1980, `MERRA2_400` in 2026; the 200 and 300 stream boundaries are UNVERIFIED from the granule list, but known from the MERRA-2 documentation as 1992 and 2001, and 2011 for stream 4: UNVERIFIED here).

## Spatial resolution
Global regular latitude-longitude grid, **0.625 degrees (lon) x 0.5 degrees (lat)** (CMR). Implied array 576 x 361 (derived: 360/0.625 and 180/0.5 + 1; not read from a file, UNVERIFIED). Polar rows are at exactly 90N/90S; the cells in those rows are half-height, so cell-area weights must use cos(lat) with half weight at the pole rows (or use true cell areas from cell edges). About 55 km in latitude. Coarse for Greenland outlines (the ice sheet is about 15 cells wide).

## Variables, units, uncertainty
- `T2M`: 2 m air temperature, **K** (K to deg C by subtracting 273.15; anomalies are the same in K and deg C). Name and units: UNVERIFIED this session (CMR variable search returned zero hits; the GMAO file specification PDF was unreadable). Well known for this collection; check on the first file.
- **No uncertainty is provided** in this collection. (Reanalysis ensemble spread is not published.) So no `sigma` and no `lower`/`upper` in the series, which the contract allows only when the source provides them.
- Anomaly baseline: none in the file (absolute values). Pipeline computes anomalies against a fixed climatology per calendar month. Suggest **1981-2010** (full years inside the record, so every month has the same count), or 1991-2020; main decides. The baseline shifts levels, not trends.

## Format and size
- netCDF-4 (`.nc4`), one file per month, global, full variable list of the collection.
- File size from CMR granules: **75.19 MB** for 2026-08 and 2026-09; **51.88 MB** for 1980-01 (unit not stated in that field; same field reads MB for the 2026 granules, so MB is assumed). Another CMR abstract summary said "about 400 MB per file", which contradicts the granule sizes; the granule sizes win.
- Full record, whole files: 561 x about 50-75 MB = **roughly 29 to 42 GB** (estimate, not a sum of listed sizes).
- Only `T2M` for the whole globe: 576 x 361 x 4 bytes = 0.83 MB per month uncompressed, about 0.47 GB for 561 months. Polar subsets are far smaller. Subsetting before download needs OPeNDAP or Harmony; whether a one-variable, one-region request works for this collection is UNVERIFIED (OPeNDAP URLs are listed in CMR, they need login). If not, the pipeline downloads whole monthly files once and keeps them out of git (about 30-40 GB on the pipeline machine; ask pipeline-engineer to check disk).

## Access
- Free **NASA Earthdata Login** account. GES DISC usually also needs the "NASA GESDISC DATA ARCHIVE" application authorised on the Earthdata profile (common cause of 401/403 errors; UNVERIFIED here).
- `earthaccess.search_data(short_name="M2TMNXSLV", version="5.12.4", temporal=("1980-01-01", "2026-09-30"))`, then `earthaccess.download(...)`.
- Direct HTTPS (login needed): `https://data.gesdisc.earthdata.nasa.gov/data/MERRA2_MONTHLY/M2TMNXSLV.5.12.4/<year>/MERRA2_<stream>.tavgM_2d_slv_Nx.<yyyymm>.nc4`. The stream number (100, 200, 300, 400) changes with the year, so do not hard-code it; use the search results.
- Also OPeNDAP, S3 in us-west-2 (`s3://gesdisc-cumulus-prod-protected/MERRA2_MONTHLY/M2TMNXSLV.5.12.4/`), Giovanni, Earthdata Search.
- No CDS or other account.

## Licence and citation
No licence field in CMR. NASA EOSDIS data use and citation guidance applies (https://disc.gsfc.nasa.gov/data-guidelines). Data are open.
- Global Modeling and Assimilation Office (GMAO) (2015), MERRA-2 tavgM_2d_slv_Nx: 2d, Monthly mean, Time-Averaged, Single-Level, Assimilation, Single-Level Diagnostics V5.12.4, Greenbelt, MD, USA, Goddard Earth Sciences Data and Information Services Center (GES DISC), Accessed: [date], doi:10.5067/AP1B0BA5PD2K. (From the CMR citation record.)
- Also cite Gelaro, R., et al. (2017), The Modern-Era Retrospective Analysis for Research and Applications, Version 2 (MERRA-2), J. Climate, doi:10.1175/JCLI-D-16-0758.1 (DOI verified in the CMR record; volume and pages UNVERIFIED).

## Known caveats for the Notes panel
- **Reanalysis, not direct measurement.** A weather model constrained by observations. Where observations are sparse (Antarctic interior, central Greenland) the values lean on the model.
- Record starts 1980: 46.75 years, shorter than ERA5 and GISTEMP.
- Coarse grid (about 55 km x 50 km cells at mid latitude, narrower in longitude near the poles); outlines of the ice sheets do not match cell edges. Region means use cells whose centre is inside the outline, weighted by cell area (cos latitude).
- 2 m air temperature is model near-surface air over a surface-height-averaged grid cell, not a station value. Ice sheet elevation is smoothed in the model, so values at the margins and over steep slopes can differ from stations by several degrees. (General property; MERRA-2-specific bias figures for Greenland and Antarctica: UNVERIFIED. No MERRA-2 Antarctic trend validation was found in the search; Greenland station studies exist at Summit but I did not read bias numbers.)
- Greenland surface and melt: GMAO states the MERRA-2 ice-sheet land scheme includes fractional snow cover, variable albedo and meltwater percolation, refreezing and runoff, and that surface mass balance compares favourably with the regional models MAR and RACMO2. Known weak points reported by GMAO and Cullather: summer (June-August) runoff is underestimated with dampened variability; the snow model has no explicit firn; south-east Greenland surface mass balance is sensitive to meltwater holding capacity. For our purpose the likely consequence is that **summer 2 m temperature trends over melting Greenland ice may be damped** (the surface stays near 0 deg C during melt). This damping is a hypothesis, UNVERIFIED for T2M specifically.
- Observing system changes: GES DISC lists an observing-system-change notice dated **June 2025** and a reprocessing of **June-September 2021**; the notice contents could not be read (PDF text not extractable). Whether they affect polar T2M trends: UNVERIFIED. Reanalysis trends can contain steps where the assimilated observing system changes.
- Not independent of ERA5 and GISTEMP: all three draw on overlapping surface and satellite observations. Agreement between them is not independent confirmation. (Land stations are shared; GISTEMP uses NOAA GHCN, which also feeds reanalyses.)
- Temperature against ice mass: not a built-in dependency (MERRA-2 is not an input to IMBIE as far as verified; IMBIE's surface mass balance model inputs: UNVERIFIED, check in `imbie.md`).
- Never say warm air is melting Antarctica (hard rule). A temperature trend is not a cause of mass loss.

## Mapping to our data contract
- Variable `temperature`: `kind: level`, units `degC` (anomaly; contract text says "deg C anomaly"), gridded, so it needs `manifest.json`, `frames/atlas-NNN.png`, `colormap.png`, and `series/greenland.json`, `series/antarctica.json`.
- Series: `frequency: annual`, `dates` `YYYY`, `values` = seasonal mean anomaly (Greenland JJA, Antarctica DJF) of the area-weighted mean over the region, **weights = cos(latitude) (true cell area), mask = region outline in `regions.topo.json`**; no `sigma`/`lower`/`upper`; `segments: [{source: "MERRA-2 M2TMNXSLV 5.12.4", start: "1980", end: "2026", offset: 0}]` (Antarctica start "1981"). Annual-mean series are a labelled fallback (`dates` `YYYY`, 1980 to 2025 complete years; 2026 incomplete, drop it).
- Period differs by region (1980 vs 1981). The contract allows one `period` per variable; this is the open item "period per region" (plan section 16).
- Manifest: the contract example uses 720 x 360, MERRA-2 is native 576 x 361. Either regrid (adds interpolation) or declare `grid.width: 576, height: 361` with `bbox [-180, -90, 180, 90]` (note longitude origin: MERRA-2 files run -180 to 179.375; UNVERIFIED). Frames for all 561 months: 576 x 361 per frame, 7 x 11 = 77 frames per 4096 x 4096 atlas, so **8 atlases**. Suggested `valueRange` for monthly anomalies about [-15, 15] deg C polar (check on real data), or ship seasonal-mean frames only (47 frames, one atlas).
- No conversion to Gt or mm. K to deg C: subtract 273.15 for levels; not needed for anomalies.

## Recommendation: primary temperature product (plan open item, section 16)
**Use MERRA-2 as the primary `temperature` source. Do not show ERA5 in the first release. Do not use GISTEMP for ice-sheet means.**

| Criterion | MERRA-2 | GISTEMP v4 | ERA5 |
|---|---|---|---|
| NASA origin (brief prefers it) | Yes (GMAO, GES DISC) | Yes (GISS) | No (ECMWF / Copernicus) |
| Record | 1980-01 to 2026-09, 46.75 yr (3 yr short of 50) | 1880 onward, about 146 yr | 1940 onward, about 86 yr |
| Both ice sheets covered by real model fields | Yes, full grid, no gaps | No: interpolated from sparse, mostly coastal stations; Antarctic ocean masked | Yes, full grid |
| Reliability over Antarctica | No dedicated validation found (UNVERIFIED), but starts after the satellite era begins | Weak (interpolation) | Documented artifacts before 1979; usable after 1979 "with caution" (Bromwich et al., GRL 2024) |
| JJA and DJF area-weighted means | Yes, cos-lat weights, 47 and 46 seasons | Computable but not meaningful | Yes |
| Access | earthaccess, Earthdata login, about 30-40 GB whole files or OPeNDAP subsets | Direct HTTPS, tiny | CDS account, small polar subset |

Reasons: (1) it is the only NASA product here that gives a physically complete field over both ice sheets, which the area-weighted JJA and DJF means need; (2) it avoids ERA5's documented pre-1979 Antarctic problem by construction (starts 1980); (3) one NASA source keeps the "state every source" and NASA-first requirement simple; (4) access is the same `earthaccess` login as the other NASA products. Cost: 46.75 years, so temperature does **not** reach the 50-year target with the primary source; the notes panel must say so. A longer Greenland-only context line (ERA5 from 1940, or GISTEMP) can be added later as a clearly labelled separate series if the team wants to reach 50 years for Greenland; that is a team decision, not needed for the first release. Pipeline risk: heavy download if server-side subsetting does not work (UNVERIFIED).

## Verified
Date checked: 2026-11-12. URLs opened:
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=M2TMNXSLV (short name, version 5.12.4, DOI, concept id, temporal start 1980-01-01 to present, 0.625 x 0.5, citation, use constraints, URLs)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=M2TMNXSLV&page_size=2&sort_key=-start_date (latest granule 202609, 75.19 MB, download links)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=M2TMNXSLV&page_size=1&sort_key=start_date (first granule 198001, 51.88)
- https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/ (starts 1980; about 50 km; no known-issues page listed)
- Search results (GMAO science snapshot "MERRA-2: Greenland Ice Sheet Surface Mass Balance", https://gs6101-gmao.gsfc.nasa.gov/science-snapshots/merra-2-greenland-ice-sheet-surface-mass-balance ; Cullather CESM LIWG 2026 slides on NTRS) were read as search summaries only, not opened as pages.
Failed or unreadable: https://disc.gsfc.nasa.gov/datacollection/M2TMNXSLV_5.12.4.html (page content empty to the fetcher); GMAO FAQ (404); the reprocessing records PDF and the file-specification PDF (text not extractable); CMR variable search for `T2M` (0 hits).

UNVERIFIED: variable name `T2M` and units K; array size 576 x 361; stream boundaries; file size unit; whether subsetting at the server works; the GESDISC application authorisation step; MERRA-2 polar T2M bias and trend reliability; effect of the 2021 and 2025 notices; Greenland JJA damping; exact Gelaro citation pages.
