# JPL_RECON_GMSL: reconstructed global mean sea level 1900-2018

Card status: verified 2026-11-12. Nothing was downloaded.

## What it is
Reconstructed Global Mean Sea Level 1900-2018, from the HOMAGE project (MEaSUREs-2017). Tide-gauge records combined with the virtual-station method give global mean sea level; contributions from glaciers, Greenland, Antarctica, terrestrial water storage and thermosteric (ocean warming) change are estimated separately. Glacier, ice-sheet and water-storage estimates combine GRACE (2003-2018) with longer-term in situ and model estimates. The values match Frederikse et al. (2020), Nature.
- earthaccess short name: **`JPL_RECON_GMSL`**, version 1.0. DOI **10.5067/GMSLT-FJPL1**. Concept id C2491724765-POCLOUD. Released 2020-08-14; record state COMPLETE (no updates expected).
- Provider: NASA JPL / PO.DAAC. **NASA product.** (Same data on Zenodo, 10.5281/zenodo.3862995, flagged "Other (Not Open)" there. Use the PO.DAAC copy only; the Zenodo copy is not NASA-hosted and its licence is not open.)

## Feeds
- `ice_mass` long record: `GrIS_*` to region `greenland`; `AIS_*` to region `antarctica` (whole ice sheet only; **no** West, East or Peninsula split).
- `sea_level` long record: `global_average_sea_level_change*` to region `global`. The thermosteric, glacier and water-storage contributions feed the "budget view" chart.

## Real coverage and time step
1900 to 2018, **annual**: 119 values (dimension `time (119)`, one value per year, 1900 to 2018). `time` is in days since 1900-01-01. CMR lists the keyword "Monthly - < Annual", which I read as loose metadata; the file has 119 steps, so annual (derived from the dimension, file not opened). Whether the stamp is mid-year or 1 January: UNVERIFIED.
- 119 years: **passes the 50-year target** (sea level, and ice mass, though ice mass before 2003 is model-based).

## Spatial resolution
Time series only (the CMR record carries a global bounding box; ignore it).

## Variables, units, uncertainty (22 variables, read from the CMR variable records)
All in **mm** of sea level, **relative to a 2002-2019 baseline** (so values are not zero at 1900). Time dimension `time (119)`.

| Name pattern | Meaning |
|---|---|
| `GrIS_mean`, `GrIS_lower`, `GrIS_upper` | Greenland Ice Sheet contribution; **includes peripheral glaciers in Greenland** |
| `AIS_mean`, `AIS_lower`, `AIS_upper` | Antarctic Ice Sheet contribution |
| `glac_mean/lower/upper` | Glaciers, excluding the peripheral glaciers of both ice sheets |
| `tws_mean/lower/upper` | Terrestrial water storage (groundwater depletion, reservoirs, natural changes) |
| `global_average_thermosteric_sea_level_change` (+ `_lower`, `_upper`) | Ocean warming (steric) |
| `global_average_sea_level_change` (+ `_lower`, `_upper`) | Observed global-mean sea level |
| `sum_of_contrib_processes_mean/lower/upper` | Sum of the contributions |
| `time` | days since 1900-01-01 00:00:00 UTC |

- Uncertainty: lower and upper bounds are the **5th and 95th percent confidence levels** (CMR abstract). That is a 90% interval, not 1-sigma. The contract's `lower`/`upper` fields fit; do not convert to `sigma`.
- **No rate variable.** Rates would have to be differenced from annual values (noisy); we do not ship `ice_mass_rate` from this source.
- Conversion to Gt: the plan uses 362 Gt per mm (ocean area times water density). IMBIE uses 360. Mark the constant used in `segments`. The conversion used inside this dataset: UNVERIFIED. Sign: a contribution to sea level rise is positive mm, so an ice-sheet mass loss is a **positive** mm increase; converting to Gt mass must flip the sign (mass change in Gt = -mm x 362). Confirm the sign convention on the actual file before use (UNVERIFIED).

## Format and size
netCDF-4, one file `global_timeseries_measures.nc`, listed size 0.084 (unit unstated, UNVERIFIED, probably MB). Tiny.

## Access
Earthdata Login (free). `earthaccess.search_data(short_name="JPL_RECON_GMSL")` then download. HTTPS (login needed): https://archive.podaac.earthdata.nasa.gov/podaac-ops-cumulus-protected/JPL_RECON_GMSL/global_timeseries_measures.nc . Also OPeNDAP, S3 (us-west-2) and `podaac-data-subscriber`.

## Licence and citation
No licence field; PO.DAAC Data Use and Citation Guidelines (https://podaac.jpl.nasa.gov/CitingPODAAC).
Frederikse, T., Landerer, F., Caron, L., Adhikari, S., Parkes, D., Humphrey, V., Dangendorf, S., Hogarth, P., Zanna, L., Cheng, L., & Wu, Y. (2020). Reconstructed Global Mean Sea Level from GRACE and In Situ 1900 to 2018 (Version 1.0). JPL/PODAAC. https://doi.org/10.5067/GMSLT-FJPL1 . Also cite Frederikse et al. (2020), "The causes of sea-level rise since 1900", Nature 584, 393-397, https://doi.org/10.1038/s41586-020-2591-3 .

## Known caveats for the Notes panel
- Reconstruction, not a direct measurement. Before 2003 the ice-sheet, glacier and water-storage contributions rest on models and in situ data; only 2003-2018 is GRACE-based.
- Sea level is **global only**. No Greenland or Antarctic sea level. Greenland and Antarctic values here are their **contribution** to global mean sea level.
- Annual steps, relative to 2002-2019. A trend is for that period only.
- The Greenland series includes peripheral glaciers; IMBIE's does not (IMBIE ice sheet proper). Not the same quantity.
- Ends in 2018; no extension.
- **Not independent.** The reconstruction is a budget: global sea level is explained as the sum of contributions, and the GRACE-era contributions use the same gravity data as the GRACE mascons and as one IMBIE method. Ice mass against sea level from this file is arithmetic, not a discovered correlation.

## Mapping to our data contract
- `sea_level` (long): `series/global.json`, `kind: level` (relative to a baseline), `frequency: annual`, units `mm`, `dates` `YYYY` 1900 to 2018, `values` from `global_average_sea_level_change`, `lower`/`upper` from the `_lower`/`_upper` variables, `segments: [{source: "JPL_RECON_GMSL", start: "1900", end: "2018", offset: 0}]`. Joining to NASA satellite altimetry (1993 onward) is batch 2.
- `ice_mass` (long): `series/greenland.json` and `series/antarctica.json` as **separate series**, units `Gt` after conversion (mm x -362, or keep `mm` and label as sea level equivalent; main decides), `kind: cumulative`, `frequency: annual`, `lower`/`upper` from the 5-95% bounds. A separate variable id is not in the contract (only `ice_mass`); either a second source segment of `ice_mass` (a join) or a new id (for example `ice_mass_long`) which would be a contract change that main decides.
- The contract allows `period` per variable only, not per source or region. Region `antarctica_west` / `antarctica_east` / `antarctica_peninsula` have no data from this source.

## Open item 3: join to IMBIE or keep separate?
**Recommendation: keep separate, do not offset-join by default.** Evidence:
1. Different time step: 119 annual points against monthly IMBIE.
2. Different baseline: relative to 2002-2019, against zero at 1992 for IMBIE. A join needs an offset, which is a free parameter; a Mann-Kendall test over a join is sensitive to it (a step at the join creates a trend).
3. Different quantity for Greenland: JPL_RECON includes peripheral glaciers; IMBIE does not. (CMR variable definition.)
4. Different uncertainty: 5-95% bounds against 1-sigma.
5. The overlap (1992-2018) is not independent: both lean on GRACE after 2002 (IMBIE gravimetry; JPL_RECON uses GRACE 2003-2018), so agreement there is not validation. Before 2003 JPL_RECON is model and in situ based, so the long part is the weakest part.
6. IMBIE 2026 (see `imbie.md`) already extends Greenland to 1972 and Antarctica to 1979 with a single method, which removes most of the need for a splice.
Suggested display: plot JPL_RECON ice contributions as their own labelled series (with the 5-95% band), with IMBIE shown over 1992 onward on the same axes in mm sea level equivalent so the overlap is visible. Statistics run on each series on its own. If main insists on a join, mark it in `segments`, state the offset (fitted on the 2003-2018 overlap), and warn that a trend across the join is partly a product of the offset. I did not compute the overlap difference; that needs the data (pipeline-engineer after download).

## Verified
Date checked: 2026-11-12. URLs opened:
- https://cmr.earthdata.nasa.gov/search/collections.umm_json?short_name=JPL_RECON_GMSL (short name, version, DOI, abstract, baseline, 5-95%, citation, concept id)
- https://cmr.earthdata.nasa.gov/search/granules.json?short_name=JPL_RECON_GMSL&page_size=5 (file name, size, links)
- https://cmr.earthdata.nasa.gov/search/variables.umm_json?concept_id=V2520425852-POCLOUD&... (all 22 variables: names, long names, units mm, `time (119)`, definitions)
- https://zenodo.org/records/3862995 (Frederikse supplement: files, licence "Other (Not Open)")
Failed: https://podaac.jpl.nasa.gov/dataset/JPL_RECON_GMSL and the 2020-10-01 PO.DAAC release announcement (connection reset or refused); OPeNDAP file structure (needs login).

UNVERIFIED: mid-year versus January stamp; the Gt-per-mm constant inside the dataset; sign convention in the file; file size unit; exact licence text.
