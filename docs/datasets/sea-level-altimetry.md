# NASA satellite global mean sea level (altimetry), 1993 onward

Card status: verified 2026-11-12. Nothing was downloaded. The data files need an Earthdata login and were not opened, so the **file column layout is UNVERIFIED**.

## What it is
The NASA global mean sea level (GMSL) record from satellite radar altimeters: TOPEX/Poseidon, Jason-1, Jason-2 (OSTM), Jason-3 and Sentinel-6 Michael Freilich. Two NASA records exist on PO.DAAC and both are current-generation. Recommended: the **NASA-SSH indicator** (a). The GSFC product (b) is the alternative with GIA applied.

**(a) NASA-SSH Global Mean Sea Level from Simple Gridded Sea Surface Height (the indicator on the NASA Sea Level Change portal)**
- earthaccess short name **`NASA_SSH_GMSL_INDICATOR`**, version **1**. DOI **10.5067/NSIND-GMSV1**. Concept id C3478934705-POCLOUD. Processing level 4. ACTIVE. Last collection update 2025-03-31 (the current file is replaced weekly).
- Provider: NASA JPL / PO.DAAC (NASA-SSH project; Willis, Fournier, Marlis, Killett). **NASA product.**

**(b) Global Mean Sea Level Trend from Integrated Multi-Mission Ocean Altimeters TOPEX/Poseidon, Jason-1, OSTM/Jason-2, Jason-3, and Sentinel-6, Version 5.2**
- earthaccess short name **`MERGED_TP_J1_OSTM_OST_GMSL_ASCII_V52`**, version **5.2**. DOI **10.5067/GMSLM-TJ152** (handbook DOI 10.5067/ALTUG-TJ152). Concept id C2902359309-POCLOUD. File `GMSL_TPJAOS_5.2.txt`.
- Provider: NASA GSFC (Beckley et al.) via PO.DAAC. **NASA product.**

## Feeds
- Variable `sea_level`, region `global` only. Never imply a local value (hard rule). No Greenland or Antarctic sea level.

## Real coverage and time step
| | (a) NASA_SSH_GMSL_INDICATOR | (b) GSFC V5.2 |
|---|---|---|
| Start | **1993-01-04** (CMR) | **1992-09-01** (CMR, collection and granule) |
| End seen in CMR | **2026-11-03** (current file, updated 2026-11-09) | **2025-05-11** (granule updated 2025-06-30; ~18 months behind: stalled or slow, UNVERIFIED) |
| Time step | **7 days** (maps use 10 days of data, made every 7 days, so adjacent steps overlap; a 60-day smoothed version is in the file) | about 10 days (altimeter repeat cycle; UNVERIFIED, from product knowledge not the CMR abstract) |
| Length | 33.8 years to 2026-11-03 | 32.7 years to 2025-05-11 |

- **Short of 50 years by about 16 years** (a). The NASA portal states "1993 to present, over 31 years" and 115.3 mm of rise since 1993 (portal text at the time of reading; the portal does not give the latest data date).
- Never pad. Never join to the tide-gauge reconstruction (see below).
- The CMR collection record for (a) says EndsAtPresent false and the granule-level time_end is 2026-11-03; the file is overwritten in place ("always the most current version"). Dated snapshots from 2025 (for example `NASA_SSH_GMSL_INDICATOR_20250414.txt`) are also kept: **record the date of the file used.**

## Spatial resolution
Time series only (global mean). (The source gridded maps, `NASA_SSH_REF_SIMPLE_GRID_V1`, are out of scope: sea level is global only.)

## Variables, units, uncertainty
- (a): **GMSL change in centimetres** (user guide, verified). The pipeline converts to mm (x 10). Baseline or reference period of the zero: UNVERIFIED (not in the guide; the file header needs to be read).
- **GIA correction.**
  - (a) **Not applied.** The user guide: "NOT been adjusted for Glacial Isostatic Adjustment". The NASA portal says the same for its plot.
  - (b) **Applied** (CMR abstract). Values relative to a 20-year TOPEX/Jason collinear mean. The size of the GIA term (about 0.3 mm/yr in this family of products): UNVERIFIED from the sources I opened.
  - Consequence: a Sen's slope from (a) will be lower than a GIA-corrected slope by roughly the GIA term (about 0.3 mm/yr, UNVERIFIED). A comparison of slopes between (a) and (b) or RECON is not like for like.
- **Annual and semi-annual signals.** (a): the user guide and CMR abstract say nothing; **UNVERIFIED** whether removed. (b): the file is believed to carry a column with annual and semiannual signals removed (from memory of the file header; **UNVERIFIED**, file not opened). For monthly Mann-Kendall the pipeline should state which seasonal treatment is used; stats-lead decides.
- **Uncertainty.** (a): **no per-point uncertainty is documented**; CMR notes a total GMSL uncertainty of "3-5 mm" over the 30+ year record and that data-quality updates can shift past values by mm-level amounts. So no `sigma` or `lower`/`upper` in the series; put the 3-5 mm statement in the notes. (b): a standard deviation column may exist but would be spatial spread, not uncertainty (UNVERIFIED). Nerem et al. (2018, PNAS, doi:10.1073/pnas.1717312115) is cited in the CMR record as a key publication on the rate and its uncertainty; I did not read it, so no rate uncertainty is given here (UNVERIFIED).

## Format and size
Plain text (ASCII) table, one file. (a): **0.067 MB** (CMR granule size 0.0673 MB). (b): **0.143** (CMR, unit unstated, assumed MB). Tiny. Column layout, header lines and number of rows: UNVERIFIED (login required; the unauthenticated fetch of the file was blocked).

## Access
- Free Earthdata Login. `earthaccess.search_data(short_name="NASA_SSH_GMSL_INDICATOR")` then download; or `podaac-data-subscriber`.
- HTTPS (login): `https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/NASA_SSH_GMSL_INDICATOR/NASA_SSH_GMSL_INDICATOR.txt` (this is the link the NASA portal itself uses). (b): `.../MERGED_TP_J1_OSTM_OST_GMSL_ASCII_V52/GMSL_TPJAOS_5.2.txt`. Also S3 (us-west-2).
- PO.DAAC web pages (podaac.jpl.nasa.gov) were not needed; CMR gave the records. The user guide opened through a signed cloud redirect.

## Licence and citation
No licence field. PO.DAAC Data Use and Citation Guidelines (https://podaac.jpl.nasa.gov/CitingPODAAC). Open data.
- (a) NASA-SSH. 2025. SSH Global Mean Sea Level from Simple Gridded Sea Surface Height. PO.DAAC, CA, USA. Dataset accessed [YYYY-MM-DD] at https://doi.org/10.5067/NSIND-GMSV1. (user guide wording). CMR long form: Willis, J. K., S. Fournier, K. Marlis, and E. Killett (2025). NASA-SSH Global Mean Sea Level from Simple Gridded Sea Surface Height, Version 1. PO.DAAC. The portal also cites Willis, Hamlington, Fournier (2023), doi:10.5281/zenodo.7702315, and Beckley et al. (2017), doi:10.1002/2017JC013090.
- (b) Beckley, B., Yang, X., Zelensky, N.P., Holmes, S.A., Lemoine, F.G., Ray, R.D., Mitchum, G.T., Desai, S., Brown, S.T. (2024). Global Mean Sea Level Trend from Integrated Multi-Mission Ocean Altimeters TOPEX/Poseidon, Jason-1, OSTM/Jason-2, Jason-3, and Sentinel-6 Version 5.2. GSFC/JPL, PO.DAAC. DOI 10.5067/GMSLM-TJ152.

## Relation to JPL_RECON_GMSL and "never join"
- Overlap **1993 to 2018** (26 years). RECON is annual, relative to 2002-2019, tide-gauge based with a GRACE-era budget (see `jpl-recon-gmsl.md`); altimetry is 7-day, relative to its own reference, satellite-based.
- Differences that make a join unsafe: (1) time step annual against 7-day; (2) different baseline: an offset is a free parameter and a Mann-Kendall test across a join picks up the step; (3) **GIA is not applied in (a)**, so slopes differ by the GIA term in the overlap even if the series agree; RECON's GIA treatment: UNVERIFIED; (4) different method (tide gauges plus statistics against a satellite instrument); (5) uncertainty is a 5-95% band for RECON and nothing per point for (a).
- Independence: (a) and RECON are **not fully independent**. Frederikse et al. (2020) use satellite altimetry and GRACE in places to constrain the reconstruction (extent of altimetry use: UNVERIFIED, not read from the paper), and the RECON budget uses the same GRACE data as our mascon layer. Agreement over 1993-2018 is therefore not an independent check. Also, (a) is not an input to IMBIE or the mascons.
- **Recommendation: show them as two separate series (and never join), consistent with the 2026-11-12 decision for IMBIE and JPL_RECON.** Statistics run on each alone. Optional: show both on one chart in the overlap with the zero reference of each stated and the 1993-2018 overlap visible; do not offset-fit by default. Use the altimetry record (1993 onward) as the main sea level series since it is direct measurement and current; show RECON as the long-record context (1900-2018), labelled reconstruction.
- **Contract issue for main:** the contract has one `series/{region}.json` per variable. Two sources for `sea_level` in region `global` need either a second variable id (for example `sea_level_long`), a series file with named alternates, or two segments (which is a join). Same issue for `temperature` and `ice_mass` (JPL_RECON ice contributions). Main decides; I cannot change the contract.

## Known caveats for the Notes panel
- Global mean only. No regional or local sea level, no Greenland or Antarctic value.
- Record 1993 onward (33.8 years); about 16 years short of 50.
- (a) is **not corrected for GIA**; the trend would be higher by roughly the GIA term if corrected (about 0.3 mm/yr, UNVERIFIED).
- Each weekly value uses 10 days of data, so neighbouring values are not independent; monthly means smooth further. Treat the trend test as on autocorrelated data (stats-lead).
- Annual and semi-annual cycle removal: UNVERIFIED.
- Total uncertainty about 3-5 mm in the record; data-quality updates can move past values by a few mm, so cite the file date.
- Altimeter missions are cross-calibrated; mission changes can introduce small steps (general property; not read from these sources).
- Sea level change from ice sheets is a component; ice mass against sea level is arithmetic, not a correlation (see JPL_RECON card).

## Mapping to our data contract
- Variable `sea_level`, region `global`, **`kind: level`** (relative to a reference), **`frequency: monthly`** after averaging the weekly values by calendar month (pipeline step; note it in `segments`), units **`mm`** (x 10 from cm), `dates` `YYYY-MM`, 1993-01 to the last complete month (the file ends 2026-11-03, so **2026-10** is the last full month; 1993-01 is complete from 1993-01-04 or partially, check the first month's coverage). No `sigma` (not provided). `segments: [{source: "NASA_SSH_GMSL_INDICATOR v1", start: "1993-01", end: "2026-10", offset: 0}]`. Annual means as a fallback.
- Not gridded: no manifest, no frames. Only `series/global.json` and `stats/global__default.json`.
- Keep RECON in its own series per above.

## Verified
Date checked: 2026-11-12. URLs opened:
- https://cmr.earthdata.nasa.gov/search/collections.json?keyword=global%20mean%20sea%20level&provider=POCLOUD&page_size=30 (list: NASA_SSH_GMSL_INDICATOR v1, MERGED_TP_J1_OSTM_OST_GMSL_ASCII_V52 v5.2, JPL_RECON_GMSL, ECCO GMSL)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=NASA_SSH_GMSL_INDICATOR (DOI, abstract, GIA, 7-day steps, citation)
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=MERGED_TP_J1_OSTM_OST_GMSL_ASCII_V52 (DOI, GIA applied, citation)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=NASA_SSH_GMSL_INDICATOR&page_size=5 (current file to 2026-11-03, size)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=MERGED_TP_J1_OSTM_OST_GMSL_ASCII_V52&page_size=5 (file to 2025-05-11)
- https://sealevel.nasa.gov/understanding-sea-level/key-indicators/global-mean-sea-level/ (portal: 1993 onward, 115.3 mm, no GIA, download link)
- NASA-SSH Indicators User Guide PDF (https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-docs/web-misc/nasa-ssh/NASA-SSH_Indicators_UserGuide.pdf, via signed redirect): cm units, no GIA, 10-day maps every 7 days, 60-day smoothed version, citation
Blocked: the data file itself (needs login; an unauthenticated fetch was denied); PO.DAAC web pages not attempted.

UNVERIFIED: file columns, header and reference baseline; annual/semiannual removal in either product; time step of (b); the GIA magnitude; uncertainty fields in the file; whether (b) is stalled; RECON GIA treatment; extent of altimetry used in RECON; the first-month coverage in (a).
