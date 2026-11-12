# NASA-SSH gridded sea surface height (regional sea level means), 1993 onward

Card status: verified 2026-11-12 from CMR (NASA's metadata service) and PO.DAAC/Earthdata catalog pages. Nothing was downloaded. **The two user-guide PDFs were fetched but are compressed and could not be read by my tools, so the variable names, units, reference baseline and the list of applied corrections for the grid are UNVERIFIED.** Everything marked "(inferred)" is reasoning, not a quote.

## What it is
Weekly global maps of sea surface height anomaly (SSHA) from the "reference" radar altimeter missions (TOPEX/Poseidon, Jason-1, OSTM/Jason-2, Jason-3, Sentinel-6 Michael Freilich). It is the same grid family that produces the NASA GMSL indicator (see `sea-level-altimetry.md`). Our pipeline averages the grid over a sea polygon to make one monthly series per `coastal_sea` region.

**Two versions exist. Use V1.1, not V1** (decision for main, see end):

| | V1 (asked for) | **V1.1 (recommended)** |
|---|---|---|
| earthaccess short name | `NASA_SSH_REF_SIMPLE_GRID_V1` | **`NASA_SSH_REF_SIMPLE_GRID_V11`** |
| Version | 1 | 1.1 |
| DOI | 10.5067/NSREF-SG0V1 | **10.5067/NSREF-SG0V11** |
| Concept id | C3309442935-POCLOUD | **C4155232533-POCLOUD** |
| Collection progress | ACTIVE | ACTIVE, ends-at-present flag set |
| Granules in CMR | 1750 | **1776** |
| First granule | 1992-10-28 to 1992-11-07 (label 19921102) | 1992-10-21 to 1992-10-31 (label 19921026) |
| Last granule seen | 2026-05-06 to 2026-05-16 (label 20260511; produced 2026-05-18) | **2026-10-28 to 2026-11-07 (label 20261102; produced 2026-11-09)** |
| Citation release | 2025-02-28 | 2026-06-02 (metadata revised 2026-09-28) |

- V1 stopped receiving new grids after the 2026-05-11 label (last production 2026-05-18). V1.1 is the one being updated. Whether V1 is formally retired: UNVERIFIED (the release notice does not say).
- What V1.1 changed (Earthdata release notice, issued 2026-06-09): all missions referenced to a **common baseline**; additional quality control; "errors with wavelengths around one orbital cycle have been reduced"; JPL-produced GNSS-based orbits for all missions where available. The notice does not list the size of the changes or their effect on regional or global trends. **UNVERIFIED: how much V1 and V1.1 regional trends differ.** Never mix V1 and V1.1 granules in one series.
- Provider: NASA JPL / PO.DAAC, NASA-SSH project (Willis, Fournier, Marlis, Killett, Sanchez). **NASA product.** Processing level 4.
- Upstream: derived from `NASA_SSH_REF_ALONGTRACK_V1` / `_V11` (1 Hz along-track data). Sea surface height product only for reference missions, so no Sentinel-3, CryoSat, SARAL.

## Real coverage and time step
- Start: **1992-10-21** (V1.1 window start). First grid with its centre in 1993 is label **1993-01-04** (window 1992-12-30 to 1993-01-09). For monthly series, **1993-01 onward** matches the GMSL indicator start (1993-01-04).
- End: label **2026-11-02** (window to 2026-11-07), produced 2026-11-09, a lag of about 1 week at the time checked (the abstract says "a few weeks"). **Last complete month for the pipeline: 2026-10.**
- Time step: **7 days** (one file per Monday label). Each grid uses **10 days** of observations, centred on the label date (window = label minus 5 days to label plus 5 days; checked against granule times). Neighbouring grids overlap by 3 days, and observations in the overlap are used twice.
- Length: 34.0 years to 2026-11, **16 years short of 50**. Do not pad. Do not join to RECON or tide gauges.
- Number of weekly granules: 1776 (V1.1) from 1992-10 to 2026-11; about **1766** from 1993-01-04.

## Spatial coverage and resolution
- Global ocean, **0.5 degree x 0.5 degree** latitude/longitude grid (CMR resolution field and abstract). Granule extent: latitude **-89.75 to 89.75** (so 360 rows), longitude **-180 to 180** in two boxes **0.25 to 180 and -180 to -0.25** (so cell centres at x.25 and x.75; 720 columns). Longitude convention inside the file (0-360 or -180-180): UNVERIFIED, the pipeline should read the coordinate values.
- Projection: regular geographic (plate carree), "Cartesian" coordinate system in CMR. Cells are **not equal area**: a cell's area is proportional to cos(latitude).
- Smoothing: **Gaussian-weighted spatial average, about 100 km width**, so the 0.5 degree values are smoothed and neighbouring cells are strongly correlated. The effective resolution is about 100 km, not 55 km.
- **Basin flags**: ocean basins (polygons from Natural Earth 1:10m Marine Areas v5.1.0, plus the 26 largest lakes and inland seas) stop data being mixed between unconnected basins. A connection table lets connected basins share data. Polygons are on Zenodo, DOI 10.5281/zenodo.13910542 (the DOI also labels the pipeline software). Whether the Mediterranean, Bay of Bengal, Gulf of Mexico and North Sea are separate basins or joined to the open ocean: UNVERIFIED (the Zenodo page does not list the basin names; the tar.gz and the connection table were not opened). This matters at the straits (Gibraltar, Florida Strait, Skagerrak, Strait of Malacca).

## Variables, units, corrections (mostly UNVERIFIED)
- Variable names: UNVERIFIED. Along-track files have `ssha`, `ssha_smoothed`, `dac`, `inv_bar_cor`, `nasa_flag` (from the along-track dataset description). The grid probably has an SSHA variable and a mask or basin flag; I could not confirm names. **Pipeline step 0 must print the file's variables and attributes** and the card must then be updated.
- Units: UNVERIFIED (metres is likely; the GMSL indicator file is in cm). Read the `units` attribute.
- Reference: UNVERIFIED (V1.1 "common baseline" for all missions; the mean surface period is not stated in the records I opened).
- **GIA:** not mentioned in any record I could read. The GMSL indicator made from these grids is stated "NOT adjusted for GIA" (see sibling card), so the grid is **very probably not GIA-corrected (inferred)**. UNVERIFIED.
- **Inverse barometer / atmospheric loading:** the along-track metadata describes a dynamic atmospheric correction (`dac`) and `inv_bar_cor` as **applied** to `ssha` (they are subtracted to un-apply them). So atmospheric pressure effects are **corrected out** upstream (verified for along-track; the gridded file inherits this, inferred). Consequence: storm surge and pressure-driven sea level are largely removed; the series is "dynamic" sea level.
- **Tides:** ocean and solid-earth tide corrections are standard in altimetry and not stated in what I read. UNVERIFIED for this product.
- **Seasonal cycle:** **not stated; assume NOT removed** (SSHA is an anomaly from a mean surface, not from a monthly climatology). UNVERIFIED. The ENSO products smooth, deseason and detrend a separate staged grid (pipeline docs), which implies the simple grid itself is not deseasoned (inferred).
- Uncertainty: **none per cell documented.** No `sigma`. The CMR record for the GMSL indicator quotes 3-5 mm total uncertainty on the global mean; the regional mean has larger errors (coastal, 100 km smoothing, regional orbit and instrument errors), size UNVERIFIED.
- Quality flags near coasts: the along-track dataset has a `nasa_flag` for bad passes and bad data; the grid-level mask behaviour near land is UNVERIFIED. Pipeline should treat NaN/masked cells as missing.

## Format and size
- netCDF-4, one file per week. CMR size: **1.0477 MB** (V1.1 last file, 1,098,652 bytes) to **1.0897 MB** (V1.1 first file, 1,142,637 bytes); V1 about 1.07 MB. About 1.05-1.09 MB each.
- **Total 1993-01 to 2026-10 (about 1766 files): about 1.9 GB** (1.05-1.09 MB x 1766 = 1.85-1.92 GB). Add about 1 MB per new week.
- Subsetting at the server (Harmony or OPeNDAP, both listed on the collection) can cut this to a few MB per region but needs 1766 requests per region; downloading all files once and cutting locally is simpler. Subset size: UNVERIFIED. Keep only the six regional series in the repo; the raw files stay out of git.

## Access
- Free Earthdata Login (earthdata.nasa.gov). `earthaccess.login()` then `earthaccess.search_data(short_name="NASA_SSH_REF_SIMPLE_GRID_V11", temporal=("1993-01-01", "2026-10-31"))` and `earthaccess.download(...)`. Alternatives: `podaac-data-subscriber`, OPeNDAP (`opendap.earthdata.nasa.gov/collections/C4155232533-POCLOUD/granules/<name>`), Harmony, S3 (us-west-2, `archive.podaac.earthdata.nasa.gov/s3credentials`).
- HTTPS pattern: `https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/NASA_SSH_REF_SIMPLE_GRID_V11/NASA-SSH_alt_ref_simple_grid_v1_1_<YYYYMMDD>.nc`. (V1.1 file names carry `v1_1`; I saw the pattern in the granule list, the V11 folder name is inferred from the V1 pattern: UNVERIFIED, read the link from the CMR granule.)
- Rate limits and login: no special account beyond Earthdata. The same login as the other PO.DAAC cards.

## Licence and citation
No licence or use-constraint field in CMR. PO.DAAC data are open; follow the PO.DAAC Data Use and Citation Guidelines (https://podaac.jpl.nasa.gov/CitingPODAAC).
- V1.1 (Earthdata catalog APA form): Willis, J. (2026). *NASA-SSH Simple Gridded Sea Surface Height from Standardized Reference Missions Only Version 1.1* [Data set]. NASA Physical Oceanography Distributed Active Archive Center. https://doi.org/10.5067/NSREF-SG0V11. (CMR long form: Willis, J. K., S. Fournier, K. Marlis, E. Killett, and J. Sanchez. NASA-SSH: JPL Sea Surface Height Anomalies, Version 1.1. PO.DAAC, CA, USA. Released 2026-06-02.)
- Add the access date (YYYY-MM-DD) as PO.DAAC asks.

## Method for regional means
1. **Pin one version** (V1.1) and record the last granule label used in the series metadata.
2. **Area weighting:** weight each cell by cos(latitude of the cell centre). At 0.5 degree this is accurate to better than 0.1% of cell area (exact weight would be sin(lat+0.25) minus sin(lat-0.25); use that, it costs nothing). Weighted mean = sum(w x ssha) / sum(w) over cells that are inside the polygon **and** have a valid value **that week**. Renormalise by the valid weights each week; if a polygon loses more than a set share of its weight (suggest more than 20% of the weight) in a week, set that week to missing.
3. **Polygon vs cell:** include a cell if its **centre** is inside the polygon (regionmask 0.13, already pinned, does this). Draw polygons **at least about 100 km (2 cells) away from the coast** because of the 100 km Gaussian smoothing and poor altimetry near land (next point). Fix polygons once, in data, as `regions.topo.json`.
4. **Coast behaviour:** radar altimeter data degrade within roughly 10-50 km of the coast (general coastal-altimetry literature; **UNVERIFIED in this session, not opened**), and land contaminates the footprint. The grid's own coastal masking: UNVERIFIED (open a file and look at the NaN pattern near Bangladesh, the Gulf coast and the Dutch coast). Because of this, the series is **open-sea sea level** of the area, not coastal sea level at the shore.
5. **Gaps:** valid-weight renormalisation (point 2). Never fill spatially or interpolate in time. Report the number of weeks missing per region.
6. **Weekly to monthly:** assign each weekly grid to the calendar month of its **label (centre) date** (4 or 5 grids per month). Monthly value = **equal-weight mean of the weekly regional values** in that month. Require at least 3 valid weeks, else `null`. (An alternative, weighting by the days of each 10-day window that fall in the month, changes values by small amounts; keep the simple rule and state it in `segments`.) The 3-day window overlap and the 10-day windows mean the month effectively blends about 40-50 days of altimetry and neighbouring months are correlated; stats-lead should treat the series as autocorrelated (as for the global series).
7. **Seasonal cycle:** keep the raw monthly series (no removal in the pipeline), but regional series have a large annual cycle (Bay of Bengal monsoon, Mediterranean steric cycle; amplitudes UNVERIFIED here). Stats-lead decides the test: seasonal Mann-Kendall or deseasonalised monthly values. The contract's `seasonal_cycle` chart type exists for showing it.
8. **Cell counts (my arithmetic, not counted from the data).** One 0.5 degree cell is about 55.6 km x 55.6 km x cos(lat), about 2,800 km2 at 25 degrees N, 2,900 at 20 N, 1,700 at 56 N. Polygons are not drawn yet; these use rough sea areas with a 100 km coastal buffer, so the final count depends on the polygon and will be lower:

| Region (proposed polygon) | Approx sea area | Approx cells | Comment |
|---|---|---|---|
| `bay_of_bengal` (north of 15 N, 85-94 E ocean part, buffer from coast) | about 0.5-0.6 million km2 | about 150-200 | Large river plume and shelf, shallow, monsoon. The shelf off Bangladesh is within 100 km of land, so the polygon centre sits over the deep Bay |
| `gulf_of_mexico` | about 1.5 million km2 | about 450-550 | Joined to the Caribbean through the Florida and Yucatan straits (basin flags UNVERIFIED) |
| `us_east_coast` | depends: a shelf-and-slope strip vs a box to 70 W | about 150-500 (guess) | Needs a polygon decision; Gulf Stream bisects it |
| `western_tropical_pacific` (for example 0-15 N, 130-170 E) | about 7 million km2 | about 2,300-2,500 | Open ocean, no coastal problem; strong ENSO signal |
| `north_sea` | about 0.57 million km2 | about 250-330 | Shallow, narrow; coastal altimetry weak; the buffer removes a lot |
| `mediterranean` | about 2.5 million km2 | about 900-1,000 | Almost closed basin; Adriatic and Aegean arms are narrower than the buffer |

Cell counts are comfortably above what is needed (tens of cells) for the basin-scale regions. The Adriatic, Aegean and Dutch/Danish coasts are the poorly resolved parts.

## Consistency with the GMSL indicator
- **Same processing family (verified).** The pipeline documentation says the indicators stage's only listed input is the staged simple grid, and the staged grid is the one promoted to the NASA-SSH simple grid product. So the NASA GMSL indicator and these grids come from the same chain.
- **Not guaranteed identical.** Which grid version (V1 or V1.1) the current GMSL indicator file was built from: **UNVERIFIED** (the GMSL collection record says last update 2025-03-31 while the file runs to 2026-11-03). The indicator's ocean mask, latitude limits, and any deseasoning or smoothing: UNVERIFIED (the indicators guide was fetched but is compressed).
- **Fair comparison rule.** A region-minus-global comparison is fair only if both are from the same grid version. Two options for main/stats-lead:
  1. (Recommended) **Compute a "global" comparator from the same grid files** with the same weighting and a 66 S to 66 N open-ocean mask (mask choice is a decision) and check it against the indicator; show the indicator as the `sea_level/global` series and report the gap.
  2. Use the indicator as the global series and state that the regional series is built by us from the same grids.
- Trend comparison caveats: GIA not applied in either (probably), so GIA bias is similar but not identical (it varies by region; magnitude UNVERIFIED); a regional mean is relative to its own reference level, so compare **trends**, not levels.

## Alternatives and cross-checks
| | Absolute or relative | Provider | Fit |
|---|---|---|---|
| **NASA-SSH gridded V1.1** | Absolute (satellite, geocentric); no land motion | NASA JPL | **Primary.** Same family as the global indicator, 0.5 degree, weekly, small download |
| **Copernicus Marine L4 (SEALEVEL_GLO_PHY_L4_MY_008_047)** | Absolute (SLA, ADT) | **Not NASA.** E.U. Copernicus Marine Service / CLS, DUACS | Cross-check. Daily, 0.125 degree (CMEMS page), 1993-01-01 to 2026-05-15 at the time of checking, DOI 10.48670/moi-00148, netCDF-4. Multi-mission (more satellites), more coastal work. **Licence:** free of charge, attribution "Generated using E.U. Copernicus Marine Service Information" plus DOI, personal login under a service agreement, redistribution of unmodified products allowed, derived works allowed, keeps records of use. The product is "several-time-yearly" updated and trails NASA-SSH. Size: UNVERIFIED (daily 0.125 degree files for 33 years are tens of GB). Corrections and version: UNVERIFIED (see its QUID document). Needs a Copernicus Marine account (not in the repo's pinned list: `copernicusmarine`, not `cdsapi`) |
| **PSMSL tide gauges** | **Relative** sea level (sea level relative to the land under the gauge) | UK National Oceanography Centre / PSMSL, **not NASA or a partner agency** | Cross-check at points. Monthly and annual mean records (RLR datum for trends); gauges are point values and **include vertical land motion**. Few Bay of Bengal gauges (Chittagong, Hiron Point etc.), gappy and datum issues; Becker et al. (2020) found individual Bangladesh gauges unreliable (from a talk abstract, not the paper). Cite: Holgate et al. (2013), PSMSL. Licence: citation request only. Details not opened: station counts, licence text (UNVERIFIED) |
| NASA Sea Level Change portal regional products | Mostly projections (Sea Level Projection Tool, IPCC AR6 regional) and the GMSL indicator | NASA | The portal data-tools page returned 404 and I did not verify specific regional trend or vertical land motion layers. I **found no NASA-hosted vertical land motion dataset** in CMR (the keyword search returned only SAR products). **UNVERIFIED**; Non-NASA VLM sources exist (a CC BY-SA 4.0 global reconstruction 1995-2020 on Zenodo record 8308347; a GNSS reanalysis, ESSD 2023): not opened, not checked |

## Plain statements for the Notes panel and for stats-lead
- **Absolute vs relative.** The satellite series is absolute sea level: the height of the sea surface relative to a fixed reference. It does **not** include the land going up or down. Tide gauges measure relative sea level (sea minus land). The rise a coastal community feels is the relative one.
- **Ganges-Brahmaputra delta subsidence.** Published values vary a lot. Brown and Nicholls (2015, Science of the Total Environment 527-528:362-374, doi:10.1016/j.scitotenv.2015.04.124) compiled 205 point measurements from 24 studies and report a **wide spread of net rates**; the abstract I could see does not give the range (the numbers are in the paper and supplement: UNVERIFIED). Becker et al. (2020, PNAS, doi:10.1073/pnas.1912921117), by a conference summary and a science-communication summary of the paper (not the paper itself), put **subsidence at roughly 1-4 mm/yr** across the delta and the regional **water-level rise at about 3 mm/yr**, which is lower than "many estimates of local sea-level trends reported earlier (6-21 mm/yr)". Treat "1-4 mm/yr" as the quoted range to check against the paper before the app displays it. The project plan says "several mm per year"; that wording is consistent but cite the source.
- **Coastal degradation distance.** Altimeter quality falls within about 10-50 km of land (general figure, UNVERIFIED in this card). Our polygons are kept offshore; the series describes the open sea area, not the shore.
- **Larger regional variability.** Regional series carry ENSO, the Indian Ocean Dipole, monsoon and wind-driven decadal swings that cancel in the global mean, so a 34-year record gives wider intervals and more risk of calling a decade-scale swing a trend. Western tropical Pacific is the extreme case: rates near 10 mm/yr in 1993-2010 reversed in later years (Merrifield 2010; Han et al. 2014; Meyssignac et al. 2012; read from search summaries, not the papers).

### Published regional rates for benchmarking (1993-2020 or nearby)
All of these are from search summaries or abstracts I did not open in full. Treat as **leads to verify**, not citations to print. Our own numbers will differ (V1.1, no GIA, our polygon).
| Region | Rate and period | Source (as found) |
|---|---|---|
| Global | **3.34 mm/yr** 1993-2020; **3.3** 1993-2018 | Climate-information page; EEA |
| Bay of Bengal (basin, altimetry) | **4.28 mm/yr** 1993-2021 | Nansen fellow summary of a Defense Science Journal study (UNVERIFIED) |
| Northern and eastern Bay coasts | **5 mm/yr or more**, 1993-2012; north Indian Ocean close to global 3.2 | Unnikrishnan et al. 2015, Current Science (as quoted) |
| Northern Bay snapshot | 3.92 mm/yr, period and method not stated; NASA tool range 1-5 mm/yr within the Bay | icddr,b climate site (weak) |
| Mediterranean | **2.5 +/- 0.4 mm/yr**, 1993-2017 (global 3.2 +/- 0.4); **3.4 +/- 0.3** 2000-2018; basin 2-4 mm/yr in recent decades | Search summaries; altimetry plus tide gauge studies (JGR Oceans 2022 for 2000-2018) |
| North Sea | tide gauges: 1.5 mm/yr 1900-2011; **4.0 +/- 1.5** 1993-2009 (Wahl et al. 2013); 1.7 to 2.7 mm/yr across a breakpoint (eight gauges, 2022) | **Tide gauges, relative**, not altimetry. North SEAL dataset covers 1995-2019 (altimetry) but no rate quoted |
| Western tropical Pacific | up to about **9-10 mm/yr**, 1993-2010; about three times global | Han et al. 2014; Merrifield 2010; Eos 2012 summary |
| Gulf of Mexico, US East coast | **not found** in my searches | Gap. Stats-lead or a later search should find NOAA 2022 sea level technical report or Dangendorf et al. regional altimetry rates. UNVERIFIED |

## Known caveats for the Notes panel
- Satellite (absolute) sea level averaged over a sea area. **Not the sea level at a town** and not the rise felt on land: land sinking is not included. In the Bangladesh delta the land can sink by several mm/yr (published range 1-4 mm/yr in one recent study; see above), so relative rise is larger than the satellite value.
- Record 1993 to 2026-10, 33.8 years; 16 years short of 50; weekly grids averaged to months by us.
- Smoothed over about 100 km; open sea only (kept away from the coast); gaps near land are not filled.
- Regional trends vary with ENSO, monsoon and wind patterns; a 34-year trend can reflect a long swing as well as a steady rise. Do not infer a cause.
- No GIA correction (inferred); atmospheric pressure corrected upstream; tides, seasonal cycle and baseline: UNVERIFIED.
- No per-point uncertainty. Version V1.1 can be revised; cite the last data week.
- Regional series are not independent of the global indicator (same grids), and the global mean is partly made of the regions.

## Mapping to our data contract
- Variable `sea_level` (same id as the global series), region `kind: "coastal_sea"`, ids `bay_of_bengal`, `gulf_of_mexico`, `us_east_coast`, `western_tropical_pacific`, `north_sea`, `mediterranean`. `kind: "level"`, `frequency: "monthly"`, units **`mm`** (convert from the file's unit: check the attribute; x1000 if metres), `dates` `YYYY-MM`, first non-null **1993-01** (check that January 1993 has at least 3 valid grids: the first label is 1993-01-04 and the window 1992-12-30 to 1993-01-09, so January has labels 4, 11, 18, 25 = four grids), last **2026-10** (the data ends 2026-11-07, one grid in November). No `sigma`, `lower`, `upper`.
- `segments: [{source: "NASA_SSH_REF_SIMPLE_GRID_V11 (NASA-SSH simple grid v1.1), regional area-weighted mean", start: "1993-01", end: "2026-10", offset: 0}]` and a note that weekly grids were averaged by label month.
- No manifest and no frames (sea level has no map layer). Only `series/<region>.json` and `stats/<region>__default.json` per region. The existing `series/global.json` stays from the GMSL indicator.
- **Notes panel text (draft):** "Satellite sea level averaged over the [region name] sea area, from NASA-SSH weekly maps (about 100 km smoothing), 1993 to 2026. This is the height of the sea surface, not the sea level at a town: it leaves out land sinking, which in the Bangladesh delta can add several millimetres a year to the rise people feel. Areas near the coast are left out because satellite data are less reliable there. Regional sea level moves with ENSO, monsoons and winds, so a 34-year trend may not continue. The record is 16 years short of 50. Data: NASA-SSH V1.1 (PO.DAAC), doi:10.5067/NSREF-SG0V11."

### Contract issues for main
1. **Version choice**: asked for `NASA_SSH_REF_SIMPLE_GRID_V1`, but it stopped at 2026-05-11. Recommend V11. Plan section 2 and the decision log (line "Regional source NASA-SSH gridded `NASA_SSH_REF_SIMPLE_GRID_V1`") need the short name changed.
2. **Global comparator**: `sea_level/global` comes from the GMSL indicator (which grid version unknown), regions come from V1.1 grids. For "region against global mean" decide option 1 or 2 above. If option 1 needs a second global series (our own from grids) it needs an id or a note; the contract has no place for "global, our own computation".
3. **Region ends**: `periods[region]` is per region and the regional series ends where the grid ends. Compare mode must use the common period; the app already needs this for other pairs.
4. **No baseline**: sea level has no `baseline`; each regional mean has its own zero. Comparing regional levels is meaningless; the compare chart should align by trend or by anomaly relative to the same first-N-year mean, which is a display choice for main.
5. **Region polygons** for `coastal_sea` are not drawn yet. The contract says the polygon covers the sea it averages. The pipeline-engineer and the polygons must agree on the same polygon: the polygon that draws on the globe must be the one used for the mean, including the offshore buffer, or the user will think the shore is included. Suggest `regions.json` carries the averaging polygon as the geometry.
6. **Seasonal handling**: raw monthly values have a strong annual cycle; the stats engine needs a seasonal-aware test or a deseasonalised variant. Stats-lead decision; not a schema change unless `kind` needs a flag.

## Raw file layout (for synthetic stand-ins and ingest)

Checked 2026-11-12, nothing downloaded. Sources: CMR UMM-Var records (6 variables), CMR granule record, CMR UMM-C, and the provider's open-source pipeline on GitHub (`ssh-pipelines/altimetry-processing-pipeline`, branch main, files read as raw text through a summariser, so quotes are paraphrases). **Caveat: the GitHub code is the producer, not a sample file.** Nothing here was read from an actual `.nc` file (login needed, OPeNDAP `.dmr` redirects to Earthdata Login). Items marked VERIFIED-CODE should be re-checked by printing `ds` on the first real download (step 0). This section supersedes the "UNVERIFIED variable names" statements above.

### File name and URL (VERIFIED, CMR granule record)
- Pattern: `NASA-SSH_alt_ref_simple_grid_v1_1_<YYYYMMDD>.nc`, `<YYYYMMDD>` = **label (centre) date**, a Monday, one file per 7 days. Example: `NASA-SSH_alt_ref_simple_grid_v1_1_20261102.nc` (1,098,652 bytes; window 2026-10-28 to 2026-11-07, i.e. label -5 d to +5 d, granule time_end is exclusive-looking midnight).
- Sidecar `...nc.md5` (79 bytes, public). Granule UR is the name without `.nc` (`NASA-SSH_alt_ref_simple_grid_v1_1_20261102`).
- Protected HTTPS: `https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/NASA_SSH_REF_SIMPLE_GRID_V11/<file>.nc` (VERIFIED, this resolves the earlier "inferred" folder name). OPeNDAP: `https://opendap.earthdata.nasa.gov/collections/C4155232533-POCLOUD/granules/<granule UR>` (needs login). S3: `s3://podaac-ops-cumulus-protected/NASA_SSH_REF_SIMPLE_GRID_V11/<file>.nc`.
- Year sub-folders exist only in the producer's staging bucket (`simple_grids/<publish_as>/<year>/...`), not in the public path.
- Date parsing: `datetime.strptime(name[-11:-3], "%Y%m%d")`. Month assignment rule is in "Method" above.

### Pseudo-CDL (what to write and what to expect)
```
netcdf NASA-SSH_alt_ref_simple_grid_v1_1_20261102 {   // netCDF-4, zlib level 5 on all but time
dimensions:
    latitude  = 360 ;      // VERIFIED (UMM-Var)
    longitude = 720 ;      // VERIFIED (UMM-Var)
    basins    = 293 ;      // VERIFIED (UMM-Var); = 292 table rows + "0,Land"
variables:
    float  latitude(latitude) ;    // degrees_north, valid_min -90, valid_max 90, no _FillValue
    float  longitude(longitude) ;  // degrees_east, valid_min 0, valid_max 360, no _FillValue
    double time ;                  // SCALAR (no dimension); units "seconds since 1990-01-01 00:00:00"; no _FillValue
    double ssha(latitude, longitude) ;   // units "m"; _FillValue 1.7976931348623157e308; standard_name sea_surface_height_above_sea_level
    int    counts(latitude, longitude) ; // _FillValue 2147483647; valid_min 0, valid_max 500; no units
    int    basin_flag(latitude, longitude) ; // _FillValue 2147483647 (VERIFIED-CODE encoding); flag_values/flag_meanings attrs
    string basin_names_table(basins) ;   // each "id,name"; element 0 is "0,Land"
// global attributes (VERIFIED-CODE): Conventions "CF-1.9" (the repo README says CF-1.7; conflict, immaterial),
//   geospatial_lat_min -90.0, geospatial_lat_max 90.0, geospatial_lon_min 0.0, geospatial_lon_max 360.0,
//   mean_sea_surface "DTU21", standard_name_vocabulary "CF Standard Name Table v86",
//   time_coverage_start / time_coverage_end (end = last window day + 1), source_files, source_valid_points,
//   gridding_method, license, institution, DOI, plus product title/summary/id/version/references.
}
```
- No `scale_factor` or `add_offset` anywhere: ssha is stored as float64 in metres (VERIFIED: UMM-Var Scale 1.0, no Offset; encoding code sets none). **Unpack nothing.** In xarray, mask-and-scale is a no-op except `_FillValue` to NaN.
- Fill handling: `ssha` fill is float64 max, so `xr.open_dataset(..., mask_and_scale=True)` gives NaN. With `mask_and_scale=False`, test `ssha >= 1e300`. `counts` fill 2147483647; the code fills `ssha` and `counts` with NaN when gridding fails (the whole grid is then fill).
- Time: decoded by xarray to a 0-d `datetime64[ns]` (the label date at 00:00). Value in seconds since 1990-01-01 is float64. Because `time` is scalar, **concatenate with `xr.concat([ds.expand_dims(time=[ds.time.values]) ...], "time")` or read `ds["time"].values` per file.** UMM-Var lists `time` with no dimensions (VERIFIED). Which instant the stored value is (label date at 00:00 vs window centre) : code says `center_date`; the granule label date equals it (inferred, UNVERIFIED in a file).

### Coordinates
- 0.5 degree, cell centres, 360 x 720. Latitude centres -89.75 ... 89.75 (VERIFIED, CMR granule spatial extent; 360 rows is consistent). Longitude centres at x.25 and x.75.
- **Lat order (ascending or descending): UNVERIFIED.** Values are copied from the producer's mask file `new_basin_mask_halfdeg.nc` and never sorted by the gridder (code read). Ingest must call `ds.sortby("latitude")`.
- **Lon convention: declared 0 to 360 (UMM-Var valid range 0-360; code attrs valid 0-360; global geospatial_lon 0 to 360), so centres 0.25 ... 359.75 ascending is the expected layout. But the CMR granule footprint is written as two boxes (0.25 to 180 and -180 to -0.25), which would also fit a wrap of 0-360 values. Actual values UNVERIFIED.** Ingest rule: `lon = ((lon + 180) % 360) - 180; sortby("longitude")` only if the pipeline's polygons are in -180..180; otherwise keep 0-360 and wrap polygons. Do not hard-code.
- Synthetic stand-in: write lat ascending -89.75..89.75, lon 0.25..359.75 ascending, both float32.

### Variables (VERIFIED unless noted)
| Name | dtype | dims | units | fill | meaning |
|---|---|---|---|---|---|
| `ssha` | float64 | latitude, longitude | m | 1.7976931348623157e308 | Sea surface height anomaly, Gaussian (about 100 km), basin-aware resample of the smoothed along-track `ssha_smoothed`. Definition: "sea level determined from satellite altitude - range - all altimetric corrections" |
| `counts` | int32 | latitude, longitude | none | 2147483647 | Number of along-track values weighted into each cell; valid 0-500 |
| `basin_flag` | int32 | latitude, longitude | none | 2147483647 (code) | Basin id of each cell; `flag_values` = ids, `flag_meanings` = names with spaces, colons and hyphens replaced by `_`. **Not in UMM-Var (6 records only); listed by the repo README and code: VERIFIED-CODE, check in a file** |
| `basin_names_table` | string | basins | none | none | "id,name" per row; row 0 = `0,Land` |
| `time`, `latitude`, `longitude` | float64, float32, float32 | scalar / own | see above | none | coordinates |

- **Basin ids (VERIFIED, table `basin_name_table.txt` via the CMR link, 292 rows, ids 1-266 and 1001-1026, ids 0 = Land added in the file):** 3 North Atlantic Ocean, 4 North Pacific, 5 South Pacific, 6 Indian Ocean, 7 South Atlantic, **11 Bay of Bengal, 15 Caribbean Sea, 16 Gulf of Mexico, 35 North Sea, 259 Mediterranean Sea**, 264-266 Southern Ocean sectors. All six of our seas have their own id, so the basin-connection question in the card is now: a sea is its own basin, connected to the ocean by the connection table (`basin_connection_table.txt`, not read: UNVERIFIED which straits are linked). Land and cells with no basin are 0 (or masked: UNVERIFIED which).
- Basin table link: https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-docs/web-misc/nasa-ssh/basin_name_table.txt (redirects to a signed public URL; no login needed for this docs file). Connection table and polygons are siblings of that URL.
- Use `basin_flag` to pick cells for a sea: `ssha.where(basin_flag == 11)`. This is an option next to our own polygon; the offshore buffer in "Method" still applies. **Decision for main:** polygon (current plan) or basin id. The basin id includes the coastal cells we want to exclude.

### Reference level, corrections (what the code shows)
- **Baseline.** The gridder subtracts **no** mean and applies no 1993 zeroing (code read). `ssha` is relative to whatever reference the along-track `ssha_smoothed` carries; global attribute `mean_sea_surface = "DTU21"` is metadata naming the mean sea surface (a DTU model). V1.1 release note: common baseline across missions (card above). **So a regional mean is not zero-centred on any period; its level is arbitrary for our purposes and trends are the only meaningful output.** VERIFIED-CODE. The GMSL indicator's "zero mean over calendar year 1993" is applied in the indicators stage, not in the grid (VERIFIED-CODE, `compute_indicators.py`).
- **Corrections** (GIA, tides, IB/DAC, seasonal cycle): **the gridder sets no attribute and applies no correction of its own**; everything is inherited from the along-track input. Along-track: `dac` and `inv_bar_cor` are applied (earlier card). Tides, GIA and seasonal removal: still UNVERIFIED for the grid file (the global attrs could say; the product-level attributes come from `utilities/products.yaml`, not opened). Treat seasonal cycle as NOT removed, GIA as NOT applied (inferred).
- Mask behaviour: cells with too little data stay NaN; source points outside valid basins are dropped (code).

### Pre-flight assertions for the ingest code
`ds.sizes == {"latitude":360,"longitude":720,"basins":293}` (basins count may grow: do not hard-fail), `ds.time.ndim == 0`, `ds.ssha.dtype == float64`, `abs(np.diff(lat)).round(3).tolist()` all 0.5, `ds.ssha.attrs["units"] == "m"`, last filename date equals the `time` value. Log the `Conventions`, `mean_sea_surface` and `time_coverage_*` attributes into the processing metadata.

### Still UNVERIFIED (needs one real file)
Lat order; lon 0-360 vs -180-180 actual values; presence of `basin_flag` fill and its land value; the product-level global attributes (tides, GIA, seasonal text); whether `time` equals label date at 00:00; the exact `flag_values` attribute length.

## Verified
Date checked: 2026-11-12. URLs opened:
- https://cmr.earthdata.nasa.gov/search/granules.umm_json?collection_concept_id=C4155232533-POCLOUD&page_size=3&sort_key=-start_date (file names, URLs, sizes; opened again 2026-11-12 for the layout section)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?concept_id=C4155232533-POCLOUD (variable association ids, related URLs incl. basin tables)
- https://cmr.earthdata.nasa.gov/search/variables.umm_json?concept_id=V4188364134-POCLOUD (ssha), V4188364147 (counts), V4188364123 (latitude), V4188364128 (longitude), V4188364151 (time), V4188364155 (basin_names_table). The bulk query `variables.umm_json?collection_concept_id=...` returned HTTP 400; fetch by concept id works
- https://raw.githubusercontent.com/ssh-pipelines/altimetry-processing-pipeline/main/pipeline/other_products/simple_grids/simple_gridder/gridder.py (encoding) and `.../gridding.py` (attributes) and `.../simple_grids/README.md`
- https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-docs/web-misc/nasa-ssh/basin_name_table.txt (basin ids)
- OPeNDAP `.dmr` for the granule: redirected to Earthdata Login, not readable
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=NASA_SSH_REF_SIMPLE_GRID_V1 (V1: DOI, concept id, abstract, 0.5 degree, 7-day, 10-day window, basin flags, citation, links)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=NASA_SSH_REF_SIMPLE_GRID_V11 (V1.1: concept id, DOI, abstract, dates, citation)
- https://cmr.earthdata.nasa.gov/search/collections.json?keyword=NASA-SSH%20simple%20gridded&provider=POCLOUD (the six NASA-SSH collections)
- https://cmr.earthdata.nasa.gov/search/collections.json?keyword=NASA-SSH%20along-track&provider=POCLOUD (along-track V1 and V11 short names)
- https://cmr.earthdata.nasa.gov/search/granules.json and granules.umm_json for V1 and V11, first and last (dates, sizes, hit counts 1750 and 1776, file names, links, spatial extent)
- https://www.earthdata.nasa.gov/data/catalog/pocloud-nasa-ssh-ref-simple-grid-v11-1.1 (V1.1 abstract and citation)
- https://www.earthdata.nasa.gov/data/alerts-outages/nasa-ssh-sea-surface-height-from-standardized-reference-missions-version-1.1 (what changed in V1.1)
- https://www.earthdata.nasa.gov/data/alerts-outages/nasa-ssh-reference-collections-released (V1 release)
- https://github.com/ssh-pipelines/altimetry-processing-pipeline (README) and docs/DATA_FLOW.md (basin-aware Gaussian resample to 0.5 degree; GMSL indicator input is the staged simple grid)
- https://zenodo.org/doi/10.5281/zenodo.13910542 (basin polygons: Natural Earth source, 26 lakes)
- Web search (extracts only) for the along-track description (`dac`, `inv_bar_cor`, `ssha`, `nasa_flag`), PSMSL, CMEMS, regional rates
- https://data.marine.copernicus.eu/product/SEALEVEL_GLO_PHY_L4_MY_008_047/description and https://marine.copernicus.eu/user-corner/service-commitments-and-licence (CMEMS product and licence)
- https://psmsl.org/data/obtaining/ (citation request; page long, rest not read)
Blocked or unreadable: the V1 and V1.1 user guide PDFs (`NASA-SSH_V1_UserGuide.pdf`, `NASA-SSH_V1_1_UserGuide.pdf`) and the Indicators guide (compressed, text not extractable by my tools; pdftoppm not installed); podaac.jpl.nasa.gov pages (connection reset); NASA SLC portal data-tools (404); Nature, PNAS and PMC papers (access refused); the along-track PO.DAAC page (connection refused). The data files need an Earthdata login and were not opened.

UNVERIFIED: variable names and units in the grid; reference baseline; GIA, tides and seasonal-cycle treatment; coastal masking and flags; basin connections for the six seas; V1 versus V1.1 trend difference and whether V1 is retired; which version the GMSL indicator uses; the indicator's mask; first-month and last-month weekly coverage in the files; cell counts (arithmetic only); subset sizes; the CMEMS data size, version and corrections; whether NASA offers a vertical land motion dataset; every published regional rate and the delta subsidence range (all from summaries, not the papers); Gulf of Mexico and US East coast rates; coastal altimetry degradation distance.
