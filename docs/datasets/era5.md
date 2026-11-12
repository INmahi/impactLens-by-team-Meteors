# ERA5 monthly averaged data on single levels, 1940 to present

Card status: verified 2026-11-12. Nothing was downloaded. **SECONDARY and NOT a NASA product.** Recommendation: do not show in the first release (see `merra2.md`, section "Recommendation").

## What it is
ECMWF's fifth-generation atmospheric reanalysis, distributed by the Copernicus Climate Change Service (C3S) Climate Data Store (CDS). Monthly means of single-level fields; we would use 2 m temperature.
- Name: **ERA5 monthly averaged data on single levels from 1940 to present** (CDS dataset id `reanalysis-era5-single-levels-monthly-means`). **DOI 10.24381/cds.f17050d7.**
- Provider: ECMWF for Copernicus (European Union). **Not NASA. Not a NASA product. Whether ECMWF or Copernicus counts as a Space Apps partner agency: UNVERIFIED** (ESA is a partner, ECMWF and the EU Copernicus programme are not ESA). Flag on the project page as a non-NASA source.
- No `earthaccess` record.

## Feeds
- Variable `temperature`, regions `greenland` and `antarctica`, as an optional secondary series. The plan keeps it as secondary only.

## Real coverage and time step
- **1940 onward**, monthly (page: "Data is available from 1940 onwards", verified). About 86 years if taken from 1940: the only candidate here that clearly passes 50 years for Greenland.
- Latest month: UNVERIFIED (page says "to present"). Updated monthly; monthly means "typically available around the 6th of each month"; daily update with about a 5-day delay. The most recent months are **ERA5T** (preliminary) and "could be different from the final release 2 to 3 months later". Label the last 3 months provisional or drop them.
- Time step: monthly. Seasonal series built as for MERRA-2: JJA Greenland, DJF Antarctica.

## Reliability over Antarctica before 1979
- Bromwich et al. (2024), *Major Artifacts in ERA5 2-m Air Temperature Trends Over Antarctica Prior to and During the Modern Satellite Era*, Geophysical Research Letters (Nov 2024): ERA5 **warms Antarctica much too rapidly, especially before 1979** (when satellite observations over the Southern Ocean were sparse) and has **artificial trend hotspots at three locations that persist to the present**. The authors conclude ERA5 **cannot be used for Antarctic temperature climate change applications before 1979**, and can be used after 1979 with appropriate caution, variability being well captured after 1979. (Read through search-result summaries; the paper page returned 403 and the full text was not opened. DOI and full author list UNVERIFIED.)
- A separate comparison of reanalyses for 1950-1979 reported ERA5 as the best of the reanalyses for Antarctic surface air temperature in that early period (not opened; study design differs, UNVERIFIED).
- A study of 17 stations in the McMurdo Dry Valleys found a systematic cold bias of about 2 deg C at best (The Cryosphere, 2024; elevation mismatch is one cause). Local, not an ice-sheet-wide figure.
- Net: for Antarctica use ERA5 **1979 onward only**, which is no longer than MERRA-2, so it adds no length there. For Greenland the pre-1979 problem is not documented in my sources (UNVERIFIED either way).

## Spatial resolution
Reanalysis fields on a regular latitude-longitude grid at **0.25 degrees x 0.25 degrees** for the atmosphere (page). The page also lists an uncertainty-estimate product (ensemble mean and spread) at 0.5 degrees. Array 1440 x 721 for the globe (derived; UNVERIFIED). Poles are at exact grid rows, so the polar-row cells are half-height; area weights use cos(lat) with the pole-row correction.

## Variables, units, uncertainty
- `2m_temperature`: **K** (page). Monthly mean (product type `monthly_averaged_reanalysis`; the exact request keys: UNVERIFIED, use "Show API request code" on the dataset page).
- Uncertainty: the page states an ensemble spread product exists (mean, spread, members, 0.5 degrees), so a per-cell uncertainty is available if wanted, at extra download cost. It is a reanalysis ensemble spread, not an observation error. Not needed for the first release.
- Anomaly baseline: none in the file; compute against a fixed per-month climatology.

## Format and size
- **GRIB** per the page. netCDF output is also offered by CDS (UNVERIFIED on the page I read).
- Size for a polar subset: UNVERIFIED (no listed size). My estimate only: a month of one variable for a 90S-60S box at 0.25 degrees is about 172,800 cells, about 0.3-0.4 MB as packed GRIB, so about 1,041 months (1940-01 to 2026-09) is roughly 0.3-0.5 GB. Greenland box (about 59-84N, 75W-10W) is about 26,000 cells, a few tens of MB for the record. Whole-globe single-month is a few MB. CDS has request size limits (not stated on the page); request by years or decades if one request fails.

## Access
- **Free CDS account** (https://cds.climate.copernicus.eu). Accept the dataset's Terms of Use on the dataset page (at the bottom of the download form) before the first request.
- `cdsapi` >= 0.7.7 (page; we pin 0.7.7). Put the URL `https://cds.climate.copernicus.eu/api` and your personal access token in `$HOME/.cdsapirc` (on Windows the equivalent file in the user profile; Windows guide linked on the page).
- `client.retrieve("reanalysis-era5-single-levels-monthly-means", request, target)`; build `request` from the dataset page ("Show API request code"). Area subset via the `area` key [N, W, S, E].
- The page notes a new package `ecmwf-datastores-client` marked "Incubating"; users are not asked to migrate yet. Stay on `cdsapi`.
- Needs an account and token the team must create; the key must never be committed.

## Licence and citation
- Licence: **CC-BY** (dataset page). Credit required. (The CDS licence page for Copernicus products may differ in wording; confirm before publishing: UNVERIFIED.)
- Cite: Hersbach, H., Bell, B., Berrisford, P., et al. (2023): ERA5 monthly averaged data on single levels from 1940 to present. Copernicus Climate Change Service (C3S) Climate Data Store (CDS), DOI: 10.24381/cds.f17050d7 (accessed [date]). The page gives only the DOI; the author list and year are from the standard C3S citation, UNVERIFIED here. Add the Copernicus acknowledgement text from the CDS page: UNVERIFIED.

## Known caveats for the Notes panel
- Reanalysis, not direct measurement; ECMWF model, **not a NASA product**.
- **Before 1979, ERA5 is not reliable for Antarctic temperature trends** (documented artifacts, too much warming). Use 1979 onward for Antarctica, labelled.
- Artificial trend hotspots at three Antarctic locations continue after 1979 (Bromwich et al. 2024).
- Last months are ERA5T (preliminary) and can change by 2-3 months later.
- The grid is 0.25 degrees (finer than MERRA-2), but elevation smoothing still makes ice-sheet margin cells differ from stations.
- Not independent of MERRA-2 and GISTEMP (shared observations).
- Never say temperature causes ice loss (hard rule).

## Mapping to our data contract
- Same as `merra2.md`: `temperature`, `kind: level`, units `degC` anomaly, `frequency: annual` seasonal series, `series/greenland.json` and `series/antarctica.json`, area weights = cos(lat), `segments: [{source: "ERA5 monthly means", start, end, offset: 0}]`; Antarctica `start` "1979" (not 1940). No `sigma`.
- If shown, it must be a **separate series** from MERRA-2 (different model, different baseline). The contract has one series per variable and region; a second source needs a main decision (see `sea-level-altimetry.md` for the same issue).
- Gridded frames, if ever used: 1440 x 721 is too large for a 4096 atlas of 1000+ months. Regrid to a coarser grid or skip ERA5 for the map. Not recommended for the map.

## Verified
Date checked: 2026-11-12. URLs opened:
- https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-monthly-means (name, DOI, 1940 onward, 0.25 degrees, GRIB, K, CC-BY, ERA5T note, latency)
- https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels-monthly-means?tab=overview (coverage, licence, DOI)
- https://cds.climate.copernicus.eu/how-to-api (account, `.cdsapirc`, `cdsapi >= 0.7.7`, licence acceptance)
- Search-result summaries (not opened as pages): Bromwich et al. 2024 GRL (https://doaj.org/article/71e2993c413f4f9ca168a36814331003 returned 403 to the fetcher), The Cryosphere 2024, volume 18 issue 3, on the Dry Valleys (https://tc.copernicus.org/articles/18/1207/2024/; the search result did not confirm this link is the Dry Valleys paper, UNVERIFIED).

UNVERIFIED: latest month; grid array size; netCDF option; polar subset sizes; request size limits; exact request keys; citation author list; whether ECMWF or Copernicus is a Space Apps partner; ERA5 Greenland reliability before 1979.
