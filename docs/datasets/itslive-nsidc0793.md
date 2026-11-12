# ITS_LIVE Greenland ice sheet extent masks, NSIDC-0793

Card status: verified 2026-11-12. Nothing was downloaded.

## What it is
MEaSUREs ITS_LIVE Greenland Monthly 120 m Ice Sheet Extent Masks, 1972-2022, Version 1.
- Data set id / earthaccess short name: **`NSIDC-0793`**, version `1`. DOI **10.5067/579TO87M7IZB**. Collection concept id C3327092422-NSIDC_CPRD.
- Provider: NASA NSIDC DAAC (archiver and distributor), NASA JPL (processor). **NASA product** (MEaSUREs programme).
- Method: ice presence derived from 237,556 terminus positions (some manual, some AI-derived) from optical and radar satellites. Months without observations are **gap-filled** from past and future terminus positions and advance rates constrained by average glacier flow speed. So the monthly values are partly estimates, not direct observations. 206 catchment animations (MP4) are provided for quality control.

## Feeds
Variable id `ice_extent`, region id `greenland` only. Also the Greenland ghost outlines on the globe (earliest outline kept as a ghost).

## Real coverage and time step
- 1972-09-15 to 2022-02-15, monthly. Counted: 594 monthly steps (1972-09 to 2022-02 inclusive), 49.4 years. **About 7 months short of 50 years.** Latest month is 2022-02; the product name says "1972-2022", not an ongoing series. The ITS_LIVE project page title says "1972-Present" (https://nasa-jpl.github.io/itslive-web/projects/greenland returned 404 when opened), so a newer extension may exist outside NSIDC: UNVERIFIED.
- Spatial coverage: 58.33 to 81.51 N, -94.4 to 11.32 E.

## Spatial resolution, projection
120 m. WGS 84 / NSIDC Sea Ice Polar Stereographic North, EPSG:3413.

## Variables, units, uncertainty
The pages I could open do not describe the mask variables, the value encoding (which value is ice), or any uncertainty field. The user guide (https://nsidc.org/sites/default/files/documents/user-guide/nsidc-0793-v001-userguide.pdf) is compressed and could not be read by my tools. **Mask variable names, value codes and uncertainty: UNVERIFIED.** The pipeline must open the netCDF header first (`ncdump -h` or `xarray.open_dataset(..., chunks=...)`) and record the names here before processing.

## Format and size
netCDF-4. **One** data granule, `NSIDC-0793_19720915-20220215_V01.0.nc`, listed size 777.32 (unit unstated, UNVERIFIED, probably MB). Plus 206 MP4 animations of 7 to 11 MB each (not needed). 207 granules in total. The 120 m data are never shipped.

## Access
Earthdata Login (free). `earthaccess.search_data(short_name="NSIDC-0793", version="1")`, then download only the `.nc` (skip the MP4s). Direct HTTPS (login needed): https://data.nsidc.earthdatacloud.nasa.gov/nsidc-cumulus-prod-protected/MEASURES/NSIDC-0793/1/1972/09/15/NSIDC-0793_19720915-20220215_V01.0.nc . Also NSIDC Data Access Tool, Earthdata Search, AWS S3 (us-west-2).

## Licence and citation
No use restrictions beyond citation (CMR record: "free and open... no use restrictions, provided the data are cited"; NSIDC page names no licence, links to NSIDC Citation Policies).
Greene, C. A., Gardner, A. S., Wood, M. & Cuzzone, J. K. (2024). *MEaSUREs ITS_LIVE Greenland Monthly 120 m Ice Sheet Extent Masks, 1972-2022* (NSIDC-0793, Version 1). Boulder, Colorado USA: NASA NSIDC DAAC. https://doi.org/10.5067/579TO87M7IZB . The Earthdata catalogue links the related paper "Ubiquitous acceleration in Greenland Ice Sheet calving from 1985 to 2022" (Greene, Gardner, Wood, Cuzzone); journal not verified.

## How to turn the masks into our outputs (method, not run)
Monthly area series:
1. Open the file lazily with chunking over time (777 MB file; do not load it all).
2. For each month, count ice pixels. Nominal pixel area is 0.12 km x 0.12 km = 0.0144 km2.
3. **Correct for projection scale.** EPSG:3413 has true scale at 70 N. On a sphere the linear scale at latitude phi is about (1 + sin 70) / (1 + sin phi): about 1.04 at 60 N and 0.99 at 80 N (derived by me, UNVERIFIED against the EPSG definition), so pixel area errs by up to about 8% in the south of Greenland. Weight each pixel by its true area (build an area grid once from the projection, then `sum(mask * area_grid)`). This is the polar-mean pitfall (plan section 11, item 9) for projected data.
4. Output `ice_extent` series in km2, monthly, `YYYY-MM` for 1972-09 to 2022-02. Months absent from the file stay `null`.

Coarse outlines (for the globe, `regions.topo.json` and ghost outline):
1. Block-average the mask to about 1 to 2 km (fractional cover), contour at 0.5 (`skimage.measure.find_contours` or `rasterio.features.shapes`), reproject to EPSG:4326, simplify to a few hundred vertices. Keep a handful of dates only (earliest, and for example every decade). The earliest outline is the ghost.
2. Never ship the 120 m rasters.

**Expect a small, step-like signal.** The masks come from terminus positions, so interior ice is constant; the area change is the outlet-glacier margin retreat and advance. Total ice-sheet area is on the order of 1.7 million km2 (general knowledge, UNVERIFIED here), so the series will show changes of a small fraction of a percent. Say so in the Notes panel and check the numbers in the first run.

## Known caveats for the Notes panel
- **Greenland only.** No Antarctic pair at the same step or length (see below).
- Derived from terminus positions, not from a continuous image archive; months without observation are interpolated, so month-to-month values are not independent, and some seasonal behaviour may be modelled. Strong autocorrelation: the stats engine's lag-1 correction matters here.
- Before the mid-1980s the record rests on sparse imagery, so early months are mostly gap-filled (the 237,556 positions are not spread evenly; per-year density UNVERIFIED).
- A change in extent is an area, not a mass: a retreating terminus does not equal mass loss (ice mass is IMBIE). Do not state cause.
- Ends in February 2022.
- The ice-sheet mask definition (whether peripheral glaciers are included): UNVERIFIED.

## Mapping to our data contract
- `ice_extent`: series (`series/greenland.json`), `kind: level`, `frequency: monthly`, units `km2`, `period: ["1972-09", "2022-02"]`, `sigma` absent unless the file has uncertainty (UNVERIFIED), `segments: [{source: "ITS_LIVE NSIDC-0793", start: "1972-09", end: "2022-02", offset: 0}]`.
- `ice_mass_map` is a separate variable; the extent outlines go into `regions.topo.json` or a separate overlay. The contract has no place for time-dated outlines, so a ghost outline layer is a contract change: main decides (for example a `outlines` file under `data/public/ice_extent/`).
- No `manifest.json`/frames for `ice_extent` unless main chooses to render mask frames. The plan says outlines, not frames.
- Valid region: `greenland` only.

## Open item 1: an Antarctic pair
**Closest product: NSIDC-0794, MEaSUREs ITS_LIVE Antarctic Annual 240 m Ice Sheet Extent Masks, 1997-2021, Version 1** (https://nsidc.org/data/nsidc-0794).
- Short name `NSIDC-0794`, version 1, DOI 10.5067/9ZFX84T5GI6D, concept id C3327092641-NSIDC_CPRD. NASA NSIDC DAAC, same team and programme (Greene, Gardner, Schlegel & Fraser, 2024).
- Coverage 1997-10-01 to 2021-03-14, **annual (roughly)**, 240 m, EPSG:3031, netCDF-4, one granule `NSIDC-0794_19971001-20210314_V01.0.nc`, listed size 464.706 (unit unstated). Earthdata Login. Ice thickness and velocity used to decide ice presence are also provided.
- Fit: **partial.** About 23 annual points against Greenland's 594 monthly ones, and about 23.5 years against 49.4. It cannot be compared with Greenland at the same step or period; a comparison would have to use annual Greenland values over 1997-2021. Whether floating ice shelves are inside the masks is **UNVERIFIED** (page does not say; the user guide was not read). Other candidates: NSIDC-0709 (MEaSUREs Antarctic Boundaries, a single epoch, no time series) and NSIDC-0792 (ice shelf height and basal melt, 1992-2017, not extent). The paper Greene et al. (2022) Nature 609, 948-953, doi:10.1038/s41586-022-05037-w built annual pan-Antarctic coastlines since 1997 and reports ice-shelf area change of 36,701 +/- 1,465 km2 (1997-2021); where the coastline data are archived: UNVERIFIED.
- Verdict: no monthly, 50-year Antarctic extent product exists that matches NSIDC-0793. NSIDC-0794 is the only NASA candidate and is a weak pair. The plan's cut order already drops ice extent early; decision for the team is whether to ship a short annual Antarctic extent or keep `ice_extent` Greenland only (the current plan and region table).

## Verified
Date checked: 2026-11-12. URLs opened:
- https://nsidc.org/data/nsidc-0793 (title, version, DOI, coverage, resolution, projection, format, access, citation)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=NSIDC-0793 (short name, version, concept id, extent, licence statement)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=NSIDC-0793&page_size=5&sort_key=start_date and the `.nc` filtered search (granule names, sizes, links)
- https://www.earthdata.nasa.gov/data/catalog/nsidc-cprd-nsidc-0793-1 (207 granules, caveats)
- https://nsidc.org/data/nsidc-0794 and https://cmr.earthdata.nasa.gov/search/granules.json?short_name=NSIDC-0794&page_size=5 (Antarctic candidate)
- Search results for NSIDC-0709, NSIDC-0792 and Greene et al. 2022 (not opened as primary pages)
- Failed: the user guide PDF (unreadable), the `.nc.xml` metadata (signed redirect, not followed), https://nasa-jpl.github.io/itslive-web/projects/greenland (404)

UNVERIFIED: mask variable names and value codes; any uncertainty variable; size units; whether ice shelves are in NSIDC-0794; any extension past 2022.
