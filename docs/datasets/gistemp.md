# NASA GISTEMP v4 (GISS Surface Temperature Analysis)

Card status: verified 2026-11-12. Nothing was downloaded. **Not recommended as the primary product for ice-sheet means**; best kept as an optional long-record or global context series. The primary-product comparison and recommendation are at the end of `merra2.md`.

## What it is
NASA GISS estimate of global surface temperature change: land-surface air temperature from NOAA **GHCN v4** stations combined with sea surface temperature from NOAA **ERSST v5**. The analysis interpolates station anomalies onto a grid. Version 4 (GISTEMP v4); uncertainty model in Lenssen et al. (2019, 2024).
- Name: **GISS Surface Temperature Analysis (GISTEMP), version 4**. No DOI.
- Provider: NASA Goddard Institute for Space Studies. **NASA product.** (Inputs come from NOAA, a US agency.)
- earthaccess: **not available through a current record.** A CMR collection `GISS_GISTEMP` exists (version "2010", "Native record does not contain a DOI") but its abstract still names GHCN v3 and SCAR Antarctic stations, i.e. it describes the old v3 analysis and is stale. Do not use it; use direct download.

## Feeds
- Variable `temperature`, regions `greenland` and `antarctica`, if used at all. For the 2026 build the recommended role is **not** a region mean for either ice sheet; see "Can it give a meaningful summer mean".
- Possible alternate use: a labelled long-record context series (Greenland summer only) or a global series, if main decides to show it. A global temperature variable region is not in the contract (`temperature` valid regions are `greenland` and `antarctica`).

## Real coverage and time step
- Coverage **January 1880 onward**, monthly (GISTEMP standard; the data page I opened does not state 1880 explicitly, UNVERIFIED on the page, widely documented elsewhere). Longer than 50 years: passes the target for time span (about 146 years).
- Latest month: UNVERIFIED. The data page says it was updated **2026-10-19**, and that monthly tables are refreshed around the 10th of each month, so October 2026 is likely the latest; I did not read the file.
- Time step: monthly gridded anomalies; also seasonal and annual in the tables.

## Spatial resolution
- Gridded product: **regular 2 degree x 2 degree** (page, verified). Implied array 180 lon x 90 lat (derived; UNVERIFIED).
- Two smoothing versions (page, verified):
  - `gistemp1200_GHCNv4_ERSSTv5`: **1200 km** smoothing radius, **Land-Ocean Temperature Index** (land stations plus ERSSTv5 ocean).
  - `gistemp250_GHCNv4`: **250 km** smoothing radius, **surface air temperature over land only (no ocean data)**.
  The page lists the file pairing; the radii are confirmed by the GISTEMP map tool page (options 250 km or 1200 km, default 1200 km). The 1200 km radius is the standard analysis.
- Equal-area subbox (SBBX) files are also available (100 subboxes per equal-area box; text-like binary format, not netCDF).

## Variables, units, uncertainty
- Temperature anomaly in **deg C**. **Baseline 1951-1980** per place and calendar month (FAQ states GISS anomalies are relative to 1951-1980; the data page does not repeat it for the gridded files, so confirm in the file attributes). For 1850-1900, add about 0.19 deg C (FAQ, as of Jan 2025; less certain).
- Variable and dimension names in the netCDF (commonly `tempanomaly(time, lat, lon)`): UNVERIFIED, file not opened. Missing grid cells carry a fill value; handle as `null`.
- Uncertainty: **not in the gridded file.** A separate gridded **uncertainty ensemble** (Lenssen et al. 2024) is published at `https://data.giss.nasa.gov/gistemp/uncertainty/` (named on the main page; not opened). Global annual 95% uncertainty about 0.05 deg C for the last 50 years, up to 0.15 deg C in 1880 (Lenssen 2019 abstract). Regional and monthly uncertainty is larger where stations are sparse.
- Mean rule in the map tool: a period mean is treated as missing unless more than 50% of its data are present; trends need more than 66% (map tool page).

## Format and size
- netCDF-4, gzip (`.nc.gz`): `gistemp1200_GHCNv4_ERSSTv5.nc.gz` **23 MB**; `gistemp250_GHCNv4.nc.gz` **9 MB** (sizes as listed on the page).
- Zarr v3 in `.zarr.tar.gz`: 53 MB and 27 MB; extract before use.
- Land mask: `landmask.2degx2deg.txt`. All under `https://data.giss.nasa.gov/pub/gistemp/` (the page gives paths relative to the data site).
- Whole record for the whole globe is a single file; the polar subset is a small fraction. Tiny.

## Access
- **Direct HTTPS, no login indicated** (open data site; I did not fetch a file). Example: `https://data.giss.nasa.gov/pub/gistemp/gistemp1200_GHCNv4_ERSSTv5.nc.gz`. Not on `earthaccess`.
- Always the latest version: the file is overwritten monthly. The pipeline must record the download date and the file checksum; older values change slightly with each update (homogenisation).

## Licence and citation
No data licence stated. GISS asks for acknowledgement; graphics made with its tools need no permission but must credit "NASA's Goddard Institute for Space Studies" or "NASA GISS/GISTEMP". NASA image and media guidance applies.
- GISTEMP Team, 2026: GISS Surface Temperature Analysis (GISTEMP), version 4. NASA Goddard Institute for Space Studies. Dataset accessed [date] at https://data.giss.nasa.gov/gistemp/.
- Lenssen, N., Schmidt, G.A., Hendrickson, M., Jacobs, P., Menne, M., & Ruedy, R. (2024), A NASA GISTEMPv4 observational uncertainty ensemble, J. Geophys. Res. Atmos., 129(17), e2023JD040179. (Author list beyond the first three and the title are from my recollection and the search result; the journal, volume and article number were on the GISTEMP page. Check the author list before publishing: UNVERIFIED.)
- Also cite Lenssen et al. (2019), JGR Atmospheres, "Improvements in the GISTEMP uncertainty model" (title seen in search results).

## Can it give a meaningful summer-only mean over each ice sheet?
**Technically yes, scientifically weak: do not use for region means.**
- It is monthly gridded, so a June-August (Greenland) and a December-February (Antarctica) mean per year can be computed and area-weighted by cell area (2 degree cells shrink in width with latitude: weight by cos(lat)).
- But the ice sheets are almost without stations in the interior. GHCN v4 stations are coastal and a few interior sites. At the 1200 km setting, interior values are interpolated from coastal stations up to 1200 km away; the 250 km setting leaves most of the Antarctic interior empty. The ocean part of the product is masked where sea ice is present (FAQ: sea ice keeps water at freezing, so water temperature cannot stand in for air temperature), so there is no ocean fill around Antarctica. Station counts for Greenland and Antarctica and the exact number of filled cells: UNVERIFIED (not found on GISTEMP pages).
- GISTEMP v4 dropped the Antarctic SCAR station set that v3 used (FAQ); GHCN v4 Antarctic station numbers: UNVERIFIED.
- So an "ice sheet mean" from GISTEMP is largely a coastal mean smeared inland. I judge it not suitable for an area-weighted ice-sheet value. (This is my judgment from the documented method; the Lenssen paper confirms larger uncertainty where stations are sparse but I did not extract the polar numbers.)

## Known caveats for the Notes panel
- A station-based analysis, not a model grid: the values over the ice sheets are **interpolated** from a few mostly coastal stations.
- 1200 km smoothing: one station can fill a very large area; neighbouring cells are not independent (so effective sample size is far smaller than the cell count).
- Anomalies are against 1951-1980.
- The product is revised every month and between versions; values for past months can change.
- The Antarctic ocean is masked where sea ice is present.
- Not independent of the reanalyses (shared stations; ERSST data).
- The record length claim (1880 onward) applies to the globe; for each ice sheet the number of contributing stations changes through time (Antarctic stations mostly begin 1957 or later: widely documented, UNVERIFIED here), so the early part of any ice-sheet series is the weakest.

## Mapping to our data contract
- If shown: `temperature`, `kind: level`, units `degC`, `frequency: annual`, `dates` `YYYY`, `values` seasonal mean anomaly with missing years `null`; no `sigma` unless the ensemble is added (a pipeline task; not needed for a first release). `segments: [{source: "GISTEMP v4 1200km", start: "1880", end: "...", offset: 0}]`.
- Gridded frames (map layer) would use the 180 x 90 grid (very coarse); `manifest.json` `grid.width: 180, height: 90`. Not recommended for the map.
- If used as a secondary series, it must be a separate series, never joined to MERRA-2 (different baseline 1951-1980, different method). The contract currently has one series file per variable and region; a second source for the same variable and region is a contract question for main (for example a distinct variable id or an `alternates` field). Same issue as the sea level pair (see `sea-level-altimetry.md`).

## Verified
Date checked: 2026-11-12. URLs opened:
- https://data.giss.nasa.gov/gistemp/ (version 4, sources, 2x2 grid, baseline 1951-1980 for LOTI, update date 2026-10-19, citation, acknowledgement)
- https://data.giss.nasa.gov/gistemp/data_v4.html (four gridded files with sizes, 1200 km and 250 km, Zarr, land mask, SBBX)
- https://data.giss.nasa.gov/gistemp/faq/ (1951-1980 baseline, 1850-1900 offset 0.19, interpolation, sea ice and ocean, SCAR dropped in v4)
- https://data.giss.nasa.gov/gistemp/maps/ (250 km and 1200 km options; missing data rules)
- https://data.giss.nasa.gov/gistemp/sources_v4/ (source code, ERSST processing)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=GISS_GISTEMP (stale v3 record)
- Web search result summary on Lenssen et al. uncertainty (not opened as pages)
Failed: https://data.giss.nasa.gov/gistemp/gistemp.html (404).

UNVERIFIED: start month 1880 on the page; latest month in the file; netCDF variable names; grid dimensions; baseline in file metadata; "no login" (inferred); Antarctic and Greenland station counts; polar uncertainty numbers; Lenssen 2024 full author list.
