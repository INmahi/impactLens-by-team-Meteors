# NASA GPM IMERG Final monthly precipitation V07 (GPM_3IMERGM)

Card written 2026-11-13 by main (M12, Bangladesh variables). Facts below were checked on NASA CMR and on the downloaded files.

## What it is
- Gridded rainfall from NASA/JAXA GPM and the earlier TRMM satellites, merged with passive-microwave and infrared estimates and adjusted each month to rain gauges (GPCC). "Final" run, monthly, 0.1 x 0.1 degree.
- earthaccess short name **`GPM_3IMERGM`**, version **07**. DOI **10.5067/GPM/IMERG/3B-MONTH/07**. CMR title "GPM IMERG Final Precipitation L3 1 month 0.1 degree x 0.1 degree V07 (GPM_3IMERGM)".
- Coverage (CMR, 2026-11-13): **1998-01-01 to 2025-09-30**, 333 monthly granules. Version 07 reprocessed the TRMM era, so it starts in 1998 (not 2000 as for V06).
- Citation (CMR CollectionCitations): Huffman, G.J., Stocker, E.F., Bolvin, D.T., Nelkin, E.J., Tan, J. (2023), GPM IMERG Final Precipitation L3 1 month 0.1 degree x 0.1 degree V07, Greenbelt, MD, Goddard Earth Sciences Data and Information Services Center (GES DISC), doi:10.5067/GPM/IMERG/3B-MONTH/07. Open NASA data.

## Format and access
- HDF5 granules (`3B-MO.MS.MRG.3IMERG.YYYYMM01-S000000-E235959.MM.V07B.HDF5`), group `/Grid`, variable `precipitation` with dims **(time, lon, lat)** in **mm/hr** (monthly mean rate); lat -89.95..89.95, lon -179.95..179.95.
- We fetch only a box around Bangladesh through NASA's OPeNDAP service (Earthdata login): `precipitation[0][2679:2729][1104:1168]` = lon 87.95-92.95 E, lat 20.45-26.85 N; about 30 KB a month, 13 MB for all 333 months. `uv run python scripts/download_real.py imerg`.

## Our variable `monsoon_rainfall` (region `bangladesh`)
- Monthly total = area-weighted mean rate over the 1,209 cells whose centre is inside the Bangladesh border (Natural Earth) x hours in the month.
- Monsoon = June + July + August + September; only years with all four months. Annual, mm, 1998-2025.
- `uv run python -m pipeline ingest imerg --raw data/raw/imerg`.

## First results and sanity checks (2026-11-13)
- Mean June-September total 1,657 mm (1998-2025).
- Wettest monsoons 2004, 2015, 2007, 2002 (2004 and 2007 were major flood years); driest 2013, 2022, 2018, 2010 (2022 had a very dry July).
- Sen's slope -5.7 mm/yr (95% interval -18.4 to 5.0), p = 0.26: not significant, cannot tell yet.

## Known caveats (Notes panel)
- A satellite estimate averaged over the whole country, not station rain; gauge adjustment is monthly and gauge density varies.
- 1998-2014 relies on TRMM-era sensors and 2014 onward on GPM; version 07 processes both together, but the observing system changed.
- Large year-to-year swings (monsoon variability) make a trend hard to detect with 28 years.

## Cross-check against NASA POWER (validity, 2026-11-13)
- NASA POWER monthly regional PRECTOTCORR (MERRA-2 reanalysis rain, bias-corrected; API v2.10, no login; `scripts/download_real.py power`, 37 grid points inside the border) gives a June-September mean of 1,552 mm for 1998-2025 against IMERG's 1,657 mm, with a year-to-year correlation of only 0.21.
- Trends, same engine: POWER 1998-2025 +34.1 mm/yr (95% interval 12.9 to 56.0, p = 0.004); IMERG 1998-2025 -5.7 mm/yr (-18.4 to 5.0, p = 0.26). The intervals do not overlap. POWER 1981-1997 is -24.1 mm/yr (p = 0.07) and 1981-2025 +30.8 mm/yr (p < 0.001).
- Decision: POWER rain is not used as a variable. Reanalysis precipitation trends are sensitive to changes in the assimilated observing system; the satellite-plus-gauge IMERG record is the one the app analyses. The disagreement is stated in the IMERG notes. `pipeline/ingest/power.py` (`read_power`) reproduces the numbers.

