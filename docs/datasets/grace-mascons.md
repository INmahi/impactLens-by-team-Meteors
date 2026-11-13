# NASA GRACE / GRACE-FO JPL mascons, RL06.3 Mv04 (CRI filtered)

Card status: verified 2026-11-12. Nothing was downloaded.

## What it is
Monthly global grids of mass change as equivalent water thickness, from the GRACE (2002-2017) and GRACE-FO (2018 onward) satellite gravity missions, solved by JPL directly as 4,551 "mascons" (3-degree equal-area spherical caps) and post-processed with a Coastline Resolution Improvement (CRI) filter.

- Entry title: JPL GRACE and GRACE-FO Mascon Ocean, Ice, and Hydrology Equivalent Water Height Coastal Resolution Improvement (CRI) Filtered Release 06.3 Version 04
- **earthaccess short name:** `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4`
- Version label: RL06.3Mv04. DOI **10.5067/TEMSC-3JC634** (CRI grid). The unfiltered grid is `TELLUS_GRAC-GRFO_MASCON_GRID_RL06.3_V4`, DOI 10.5067/TEMSC-3MJ634, meant for experts.
- Collection concept id C3195527175-POCLOUD. Predecessor: RL06.1Mv03. No RL06.4 or RL07 seen in the record (I saw no sign of a newer release; JPL says "use the most recent solutions").
- Provider: NASA/JPL, archived at NASA PO.DAAC. **NASA product.**

## Feeds
Variable id `ice_mass_map` (map layer only, globe). Regions shown: `greenland`, `antarctica` (the map is global; the app crops to the poles). No series files and no stats from this product, so GRACE does not enter the Mann-Kendall engine. If main later wants a GRACE time series, that would be a new series and a decision.

## Real coverage and time step
- Start: 2002-04 (record start 2002-04-04; granule start 2002-04-16).
- Latest month: the single current file is named `GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc`, granule end 2026-09-16, so **latest month is 2026-09** as of 2026-11-12. The collection-level end date in CMR is stale (shows 2021-03-16), do not rely on it. Each new release rewrites the one file for all months.
- Time step: monthly (JPL notes "monthly" is used loosely; actual data days differ per month).
- Gaps: **the 2017-07 to 2018-05 GRACE to GRACE-FO gap is the plan's figure; I could not confirm the exact months on an official page. UNVERIFIED.** JPL says gaps exist in both the GRACE and GRACE-FO records, plus battery-management gaps starting 2011 about every 6 months. A 2024 Springer paper (not opened, login redirect) was quoted by a search tool as counting 22 missing months besides the long gap; UNVERIFIED. The authority is the table `GRACE_GRACE-FO_Months_RL06.csv` on PO.DAAC (linked from https://grace.jpl.nasa.gov/data/grace-months) and the file's own `time` axis. Pipeline-engineer must build `manifest.missing` from the file's time axis, not from this card.

## Spatial resolution
- Grid: 0.5 by 0.5 degrees, 720 longitudes (0.25 to 359.75) by 360 latitudes (-89.75 to 89.75). Longitude runs 0 to 360, so roll to -180..180 for the manifest bbox `[-180,-90,180,90]`.
- **Real resolution: about 3 degrees (about 300 km).** JPL: neighbouring 0.5-degree cells are not independent; only 4,551 independent estimates exist. Never read a single 0.5-degree pixel as a value. Do not draw Greenland outlet glaciers on this layer.

## Variables, units, uncertainty
- Main variable: equivalent water thickness, **cm** (`lwe_thickness` in the Earth Engine catalogue copy; the netCDF variable names in the PO.DAAC file were not seen, UNVERIFIED).
- Uncertainty: the Earth Engine copy lists an `uncertainty` band as 1-sigma per mascon estimate. JPL says its uncertainties are "conservative". Whether the CRI file has the same variable: UNVERIFIED.
- Anomaly baseline (the mean the maps are relative to): UNVERIFIED (not stated on pages I opened).
- GIA (glacial isostatic adjustment) correction: UNVERIFIED on pages I opened; ask before quoting trends in Antarctica.

## Land/ocean scaling factor
**Do not apply it to the ice-sheet layer.** JPL: the gain factors "can be used for hydrology-related signals, but should not be used for mountain glaciers or ice sheets". They are provided as a separate variable in the file and are not applied to the data. For `ice_mass_map` use the CRI-filtered grid as delivered. Applying the factor would only matter for a hydrology layer, which we do not have.

## Format and size
One self-contained netCDF-4 file with all months. CMR lists size 44.2 with no unit (UNVERIFIED unit, almost certainly MB). Direct file: `GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc`. Output size of our product: derived estimate, 720 x 360 frames pack 55 per 4096x4096 atlas, so about 270 months need about 5 atlases for the full globe; a polar-only crop needs fewer. Cloudflare Pages allows 25 MiB per file, so atlases go to R2 (plan section 12).

## Access
- Earthdata Login (free account) required.
- `earthaccess`: `earthaccess.search_data(short_name="TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4")` then `earthaccess.download`.
- HTTPS (needs Earthdata login): https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4/GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc
- S3 (us-west-2 only) and `podaac-data-subscriber` also work. The file name will change when a newer month is released (the end date is in the name); search by short name, never hardcode the file name.

## Licence and citation
No licence field in the record; use follows PO.DAAC Data Use and Citation Guidelines (https://podaac.jpl.nasa.gov/CitingPODAAC). Citation as given by the Earth Engine catalogue (confirm the exact string on the PO.DAAC page before publishing):
- Wiese, D. N., Yuan, D.-N., Boening, C., Landerer, F. W., Watkins, M. M. (2023). JPL GRACE and GRACE-FO Mascon Ocean, Ice, and Hydrology Equivalent Water Height JPL RL06.3Mv04. PO.DAAC. DOI 10.5067/TEMSC-3MJ634 (unfiltered) / 10.5067/TEMSC-3JC634 (CRI).
- Also acknowledge GRACE/GRACE-FO at grace.jpl.nasa.gov, as JPL requests. The older v1.0 CRI citation on the JPL page (Wiese et al. 2018, 10.5067/TEMSC-3MJC6) is for RL06.1, not this version.

## Known caveats for the Notes panel
- Map layer only. About 300 km real resolution; the 0.5-degree grid is oversampled.
- Gap between the two missions (plan: July 2017 to May 2018, UNVERIFIED exact months) and a few other missing months; the scroller must show no-data spans, never interpolate.
- Measures total mass change including ice, snow and ground water at the pole; at the ice sheets it is dominated by ice but GRACE cannot separate ice from other mass (UNVERIFIED wording, check with science-writer).
- Near coasts, CRI filtering separates land and ocean mass; ocean mass leaks at the margins.
- **Not independent of IMBIE** (gravimetry is one IMBIE input) and of the JPL_RECON_GMSL contributions after 2002.
- Values are mass anomalies, not ice thickness.

## Mapping to our data contract
- Gridded variable, so a `manifest.json`, `frames/atlas-NNN.png`, `colormap.png`. No `series` files (the polar map has no regional series).
- `variables.json`: id `ice_mass_map`, units `cm w.e.`, `kind: level`, `frequency: monthly`, `period: ["2002-04", "2026-09"]` (update at run time from the file), `regions: ["greenland", "antarctica"]`, `mapMode` null (this variable is the map).
- `manifest.grid`: bbox `[-180, -90, 180, 90]`, width 720, height 360 (or a polar crop). Pack as R=high byte, G=low byte: `q = round((value - offset) / scale)`. Suggested scale 0.01 cm and offset -1000 cm (range to be taken from the data, UNVERIFIED), `valueRange` from data, diverging colormap (`vik` or `balance`).
- Land mask and missing cells: B = 0. `manifest.missing`: every month absent from the file's time axis between 2002-04 and the last month.
- Dates: file `time` is days since an epoch; convert each to `YYYY-MM` by the month the mean date falls in. Two solutions in one month would be a duplicate; check.
- `synthetic: false`.
- Polar presentation: an equirectangular grid stretches near the poles. Globe-engineer to decide whether to use the global grid or reproject. Area-weight any regional mean by cos(latitude).

## Verified
Date checked: 2026-11-12. URLs opened:
- https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/ (version, grid, 3-degree, CRI, gain factor rules, gaps statement, citation)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4 (short name, version, DOI, concept id, start date, predecessor)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4&page_size=3&sort_key=-start_date (current file name, 2002-04 to 2026-09, size, links)
- https://developers.google.com/earth-engine/datasets/catalog/NASA_GRACE_MASS_GRIDS_V04_MASCON (bands, 1-sigma uncertainty, citation; a Google-hosted copy, not the NASA original)
- https://grace.jpl.nasa.gov/data/grace-months (battery-management gaps; month table is a linked CSV, not read)

PO.DAAC pages (podaac.jpl.nasa.gov) refused connections during the check, so the dataset landing page and the RL06.3 release announcement (https://podaac.jpl.nasa.gov/announcements/2024-09-12-Release-of-GRACE-FO-JPL-RL06.3-for-L2-3-and-MASCON-Data-Sets) were not read.

UNVERIFIED: exact missing months; file size unit; netCDF variable names; baseline period; GIA treatment; whether `uncertainty` exists in the CRI file.

## Ice mass from gravity per region (M12, added 2026-11-13 by main)
- Variable `ice_mass_grace` (Gt, monthly 2002-04 to 2026-09) for `greenland`, `antarctica` and `himalaya` (new region, kind glacier_region, hand-drawn outline of the glaciated arc). Mass = sum of `lwe_thickness` x cell area over the 0.5-degree cells whose centre is inside the outline (1 cm of water on 1 m2 = 10 kg); 1-sigma = the same sum of `uncertainty`.
- Cross-check against IMBIE over 2002-04 to 2023-12 (same engine): Greenland GRACE -248.5 Gt/yr (95% -269.1 to -229.2) vs IMBIE -253.3 (-273.0 to -220.9): agree. Antarctica GRACE -130.5 (-155.9 to -106.2) vs IMBIE -183.6 (-203.1 to -158.3): disagree, as expected from the GIA correction sensitivity of GRACE over Antarctica; stated in the notes.
- Himalayas: -9.1 Gt/yr (95% -10.1 to -8.1), p < 0.001, 2002-2026, 159 cells. Published Himalayan glacier loss is of the order of -7 to -8 Gt/yr (e.g. Maurer et al. 2019, Science Advances; not re-checked here): the GRACE value includes groundwater leakage from the Indo-Gangetic plain and is an upper bound on glacier loss (stated in the notes).

