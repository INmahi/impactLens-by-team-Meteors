# IMBIE ice sheet mass balance

Card status: verified 2026-11-12 (see "Verified" at the bottom). Nothing was downloaded.

## What it is
The Ice Sheet Mass Balance Inter-comparison Exercise (IMBIE) reconciles many satellite estimates (altimetry, gravimetry, input-output method) into one mass-balance record per ice sheet. Two releases matter:

| | IMBIE 2021 ("AR6" release) | IMBIE 2026 (IMBIE-3, new) |
|---|---|---|
| Title | Antarctic and Greenland Ice Sheet mass balance 1992-2020 for IPCC AR6 | Mass balance of the Greenland and Antarctic Ice Sheets from the 1970s to 2023 |
| Version | 1.0 | 1.0 |
| DOI | 10.5285/77b64c55-7166-4a06-9def-2e400398e452 | 10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0 |
| Record id | GB/NERC/BAS/PDC/01477 | GB/NERC/BAS/PDC/02074 |
| Period | 1992-01 to 2020-12 | Greenland 1971-07 or 1972 (the BAS record says both) to 2023-12; Antarctica 1979-01 to 2023-12 |
| Companion paper | Otosaka et al. 2023, ESSD 15, 1597-1616, doi:10.5194/essd-15-1597-2023 | Scientific Data, article s41597-026-08088-0 (press coverage and ESA page link it; the Nature page needed a login redirect, not opened) |

**Finding that changes the plan:** a newer release than 1992-2020 exists. It extends Greenland to about 52 years (1972-2023) and Antarctica to 45 years (1979-2023). Greenland then reaches the 50-year target.

**Provider.** IMBIE is a joint ESA and NASA exercise (per `docs/COMPETITION_CONTEXT.md`; I did not verify the NASA/ESA framing on a provider page). The data are hosted by the UK Polar Data Centre (NERC / British Antarctic Survey), **not by NASA**. Flag on the project page as "not a NASA-hosted product; international consortium". Whether ESA counts as a Space Apps partner agency: UNVERIFIED.

## Feeds
- Variable ids: `ice_mass` (cumulative column), `ice_mass_rate` (rate column).
- Region ids: `greenland`, `antarctica`, `antarctica_west`, `antarctica_east`, `antarctica_peninsula`. The `all` file (Greenland plus Antarctica) has no region id; do not use it.

## Real coverage and time step
**IMBIE 2021 (verified from the file itself).** The Greenland file has 5 columns: `Year, Mass balance (Gt/yr), Mass balance uncertainty (Gt/yr), Cumulative mass balance (Gt), Cumulative mass balance uncertainty (Gt)`. Year is a decimal year in steps of 1/12: first row 1992, then 1992.0833, ..., last row 2020.9167. That is one row per month, 1992-01 to 2020-12 (348 rows by arithmetic; the row count itself was not seen).
- **Important:** in the Greenland file the **rate is constant within each calendar year** (every 1992 row is -7.7667 Gt/yr, every 1993 row is -24.3667 Gt/yr, last year -392.926). So the rate has only about 29 independent values, and the monthly cumulative series is a straight-line interpolation inside each year. Neither carries real monthly information. Whether the five other regions behave the same: UNVERIFIED (assume yes).
- The first cumulative value (1992-01) is -0.6472 Gt, not 0. The cumulative series is the running sum of rate/12.
- The imbie.org data page describes the 2021 files vaguely and the ESSD paper text I could read said annual values; the BAS record says "Monthly". The file contents above settle it for the Greenland file: monthly rows, annual-step rates.

**IMBIE 2026.** BAS record says time step **monthly**; the imbie.org science page says the files hold "annual rates and cumulative anomalies". **Conflict, UNVERIFIED.** I could not open the CSV (the file URL I tried returned 404). Pipeline must read the header and date column before any decision. Columns per BAS record: Date; mass balance and uncertainty; cumulative mass balance anomaly and uncertainty; surface mass balance (SMB) anomaly rate and cumulative with uncertainties; dynamics (ice discharge) anomaly rate and cumulative with uncertainties. The SMB and dynamics split is new and is useful for the Greenland-versus-Antarctica story (melt versus dynamics) but must not be over-interpreted. Reference epoch of the cumulative anomaly: UNVERIFIED.

## Spatial resolution
Time series only. No maps. Drainage-basin sets are on imbie.org but not used.

## Variables, units, uncertainty
- Units: Gt (cumulative), Gt/yr (rate). A second file per region gives the same values in mm of sea level equivalent, with **360 Gt = 1 mm** (stated on both BAS records). The plan and the JPL_RECON card use 362 Gt per mm. Use one constant per series and record it in `segments`. The 0.6% difference is smaller than the uncertainty.
- Uncertainty: **one-sigma**, stated on both BAS records, for both rate and cumulative columns. The cumulative uncertainty is the root sum square of the monthly errors divided by 12 (ESSD data section), so it is the uncertainty of the cumulative value at that date and grows with time; it is **not** a per-step increment. Regional totals combine in quadrature.
- Estimates are reconciled from 46 surveys (2021 release: 21 Antarctica, 25 Greenland); 2026 release: 42 estimates from 27 missions (press coverage; paper not opened).

## Format and size
ASCII CSV. 2021: 12 files (2 per location x 6 locations), about 156 kB total (BAS). 2026: 10 files, 877 kB total (BAS). File names:
- 2021: `imbie_<location>_2021_Gt.csv` and `imbie_<location>_2021_mm.csv`; locations `all`, `antarctica`, `antarctic_peninsula`, `east_antarctica`, `west_antarctica`, `greenland`. The Greenland `_Gt.csv` was read directly; the other names are inferred from the pattern.
- 2026: `imbie3_<location>_partitioned_Gt.csv` and `_mm.csv`; locations `antarctic_peninsula`, `antarctica`, `east_antarctica`, `greenland`, `west_antarctica`. Names are from the BAS record, not tested.

## Access
Direct HTTPS, no account. Landing pages (open in a browser; the file listing is a dynamic RAMADDA page):
- 2021: https://ramadda.data.bas.ac.uk/repository/entry/show?entryid=77b64c55-7166-4a06-9def-2e400398e452
- 2026: https://ramadda.data.bas.ac.uk/repository/entry/show?entryid=128c5e33-5224-4197-82f0-19dcc95b80a0
- Direct file pattern that worked for 2021 (a RAMADDA "synth" entry URL): `https://ramadda.data.bas.ac.uk/repository/entry/get/imbie_greenland_2021_Gt.csv?entryid=synth:77b64c55-7166-4a06-9def-2e400398e452:<base64 of "/imbie_greenland_2021_Gt.csv">`. I do not trust this as a stable URL. Pipeline-engineer should fetch the file list from the landing page, then commit the CSVs' SHA-256 beside the processed data.
- `earthaccess` does not apply (not on Earthdata).

## Licence and citation
Open Government Licence v3.0, no access restrictions (both records). Attribute as required by OGL.
- 2021: Shepherd, A., Ivins, E., Rignot, E., et al. (2021). Antarctic and Greenland Ice Sheet mass balance 1992-2020 for IPCC AR6 (Version 1.0) [Data set]. UK Polar Data Centre, NERC, UKRI. https://doi.org/10.5285/77b64c55-7166-4a06-9def-2e400398e452. Also cite Otosaka et al. (2023), ESSD 15, 1597-1616.
- 2026: Otosaka, I., Shepherd, A., Amory, C., et al. (2026). Mass balance of the Greenland and Antarctic Ice Sheets from the 1970s to 2023 (Version 1.0) [Data set]. NERC EDS UK Polar Data Centre. https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0

## Known caveats for the Notes panel
- Totals per ice sheet or sub-region; no map. Reconciled from many satellite surveys, not a single instrument.
- Before the GRACE era (2002) the record rests on fewer, older methods; uncertainty is larger early (Greenland 1-sigma on the rate is 56 Gt/yr in 1992 and 124 Gt/yr in 2020 in the 2021 file).
- Rate values change once a year, so the rate series has about 29 real points (2021 release). A trend in the rate is acceleration.
- Cumulative mass is relative to the start of the record, not an absolute ice mass.
- 2021 and 2026 releases are different reconciliations; numbers will not match. Never splice them.
- **Not independent** of: the GRACE mascon map (gravimetry is one of IMBIE's three methods), the JPL_RECON_GMSL ice-sheet contributions (GRACE-based after 2002), and any sea level budget built from mass estimates. Ice mass against sea level is arithmetic, not a discovery.

## Mapping to our data contract
| Our field | From IMBIE |
|---|---|
| `ice_mass`, `kind: cumulative`, units `Gt` | Column "Cumulative mass balance (Gt)" |
| `ice_mass` `sigma` | "Cumulative mass balance uncertainty (Gt)" (1-sigma) |
| `ice_mass_rate`, `kind: rate`, units `Gt/yr` | Column "Mass balance (Gt/yr)" |
| `ice_mass_rate` `sigma` | "Mass balance uncertainty (Gt/yr)" |
| `dates` | decimal year to `YYYY-MM`: month index = round((year - 1992) * 12); 1992.0 is `1992-01`, 2020.9167 is `2020-12` |
| `segments` | `{ "source": "IMBIE 2021", "start": "1992-01", "end": "2020-12", "offset": 0 }` |
| region id | `greenland` = greenland; `antarctica` = antarctica; `antarctica_west` = west_antarctica; `antarctica_east` = east_antarctica; `antarctica_peninsula` = antarctic_peninsula |
| `synthetic` | false |

Series files only (no manifest, no frames). Recommendations for main to decide:
1. **`ice_mass_rate` frequency.** Ship as `annual` (one value per year, `YYYY`, 29 points) rather than 348 monthly rows. Monthly repeats would inflate n and make Mann-Kendall and the lag-1 correction see a staircase. With the 2021 file the honest rate record is 29 points.
2. **`ice_mass` frequency.** The monthly cumulative is an interpolation of annual information. Keeping it monthly is allowed by the contract but the stats notes should say the monthly steps are interpolated. Alternative: annual values from December.
3. **Which release is primary.** IMBIE 2026 gives longer records (Greenland about 52 years, Antarctica 45) and the SMB/dynamics split; IMBIE 2021 is the IPCC AR6 reference. `variables.json` `period` would change from 1992-2020 to 1972-2023 (Greenland) and 1979-2023 (Antarctica), so `period` would differ by region, which the contract currently has as a single `period` per variable. This needs a decision by main.
4. 2026 time step must be confirmed from the file before building (UNVERIFIED).

## Verified
Date checked: 2026-11-12. URLs opened:
- https://data.bas.ac.uk/full-record.php?id=GB/NERC/BAS/PDC/01477 (2021 record: version, licence, citation, 12 CSVs, monthly, 360 Gt/mm, one-sigma)
- https://ramadda.data.bas.ac.uk/repository/entry/show?entryid=77b64c55-7166-4a06-9def-2e400398e452 (licence, citation)
- Greenland 2021 CSV through a RAMADDA direct URL (header, first 15 rows, last 5 rows; values reconcile with the paper: -4,892 Gt is 13.6 mm x 360, and 13.6 + 7.4 mm = the 21.0 mm total)
- https://essd.copernicus.org/articles/15/1597/2023/ (data availability, regions, cumulative uncertainty method)
- https://imbie.org/ and https://imbie.org/science/ (newer release listed; time step statement conflicts with BAS for 2026)
- https://data.bas.ac.uk/full-record.php?id=GB/NERC/BAS/PDC/02074 (2026 record)
- http://ramadda.data.bas.ac.uk/repository/entry/show?entryid=128c5e33-5224-4197-82f0-19dcc95b80a0 (2026 coverage, licence)
- https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0 (redirects to the BAS 2026 record)
- https://www.esa.int/Applications/Observing_the_Earth/FutureEO/Faster-flowing_glaciers_fuel_decades_of_polar_ice_loss (Scientific Data, 42 estimates, 27 missions)
- https://github.com/IMBIE (no newer release; last repo update June 2023)

UNVERIFIED: 2026 file contents, time step and reference epoch; the other five 2021 files' contents; the Nature article text (login redirect); whether ESA is a Space Apps partner.
