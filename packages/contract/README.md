# @trend/contract

The data contract: JSON Schemas (`schemas/`, draft 2020-12) and TypeScript types (`src/index.ts`). Owned by main. Plain-language guide: the `data-contract` skill. Spec: `docs/TECH_BUILD_PLAN.md` section 8.

| File in `data/public/` | Schema |
|---|---|
| `variables.json` | `variables.schema.json` |
| `regions.json` | `regions.schema.json` |
| `regions.topo.json`, `{variable}/outlines.topo.json` | `topology.schema.json` |
| `{variable}/series/{region}.json` | `series.schema.json` |
| `{variable}/stats/{region}__default.json` | `stats.schema.json` |
| `{layer}/manifest.json` | `manifest.schema.json` |
| (shared definitions) | `common.schema.json` |

## Changes from plan section 8 (M2, 2026-11-12)
- `variables.json`: `periods` per region (IMBIE 2026 starts in different years per ice sheet; MERRA-2 JJA vs DJF). `period` stays as the overall span.
- `variables.json`: `variantOf` for long-record variables (`sea_level_long`, `ice_mass_long`), shown as sub-options and never joined.
- `variables.json`: `baseline` for anomaly variables (temperature 1991-2020), `outlines` for dated outlines, and `synthetic`.
- `regions.json`: shape defined (`parent`, `kind`, `variables`, `bbox`, `camera`). The region list is open; `kind: glacier_region` is ready for mountain glaciers.
- `series`: `bounds` label required with `lower`/`upper` (JPL_RECON uses 5-95%); `injected` true slope on synthetic files only.
- `manifest`: `units` and an `atlases` list with sizes, so UV maths needs no image probing.
- New `{variable}/outlines.topo.json`: dated outlines for the ice extent ghost outline.
- Frequencies stay `monthly` and `annual` (the stats engine supports only these). Finer data, such as the 7-day sea level indicator, is averaged to monthly by the pipeline.
- Map-only layers (`ice_mass_map`) are not in `variables.json`; they are folders with a `manifest.json` named by `mapMode`.

## Cross-file rules (checked by the validator, not by the schemas)
1. Every file validates against its schema.
2. Ids: every id in `variables.json` `regions`, `periods`, `regions.json` `variables` and `parent`, `mapMode`, `variantOf` exists. `regions.json` `variables` is exactly the inverse of `variables.json` `regions`. `periods` keys equal `regions`.
3. Files: for every (variable, region) pair there is `series/{region}.json` and `stats/{region}__default.json`. No series for a pair that is not declared. Every `mapMode` has a `manifest.json` and `colormap.png`. Every non-global region has a geometry in `regions.topo.json` with that id.
4. Series: `variable`, `region`, `units`, `frequency`, `kind` match `variables.json`. `values`, `sigma`, `lower`, `upper` have the same length as `dates`. Dates are ascending on a regular monthly or annual grid with no duplicates (gaps are `null`, never dropped dates). No `NaN`. First and last non-null dates equal `periods[region]`. `lower <= values <= upper` where all are present. `sigma >= 0`. Segments cover the dates, in order, without overlap.
5. Never padded: no leading or trailing run of nulls outside `periods[region]`.
6. Stats: `variable`, `region`, `synthetic`, `frequency`, `kind` match the series; `start`/`end` lie within the series; numbers equal a fresh `analyzeTrend()` run on the series (tolerance 1e-9).
7. Manifest: frames sorted by date, unique; each rectangle lies inside its atlas and inside `grid` size (`w == grid.width`, `h == grid.height`); no two frames overlap in one atlas; `missing` dates have no frame. Atlas PNGs are 8-bit RGBA with the listed size. `colormap.png` is 256x1.
8. Synthetic flag: the same `synthetic` value across a variable's files. `injected` appears only when `synthetic` is true.
9. Topology: `regions.topo.json` has object `regions`; outlines files have object `outlines` with `region` and `date` on every geometry.

### Clarifications (after the validator was built, 2026-11-12)
- Region `kind` is required; `kind: "global"` regions have no geometry, every other region has one.
- `period` must equal the span of `periods` (earliest start, latest end); checked under rule 5.
- `baseline` is always years, `["YYYY", "YYYY"]`, even for monthly variables.
- Segments are contiguous on the date grid: first start = first date, last end = last date, each start follows the previous end. Gaps inside a segment are nulls.
- Stats files are recomputed with `{dates, values, frequency, kind}` and default alpha (0.05). A series on which the engine returns NaN (for example a constant series) cannot be stored and fails rule 6.
- Map layers are folders named by some variable's `mapMode`; an unused layer folder, stray file, unlisted atlas or unreferenced outlines file is a rule 3 problem.
- PNGs must be 8-bit RGBA with no colour chunks (iCCP, sRGB, gAMA, cHRM); colormaps too.
- Not checked: `describe.video` files (they live in `media/`), atlas pixel values, colormap colours.

### Conventions (after the synthetic generator, 2026-11-12)
- **Grid orientation:** frame row 0 is the north edge of `grid.bbox`, column 0 the west edge; pixel centres sit half a cell inside (1-degree grid: first centre 89.5N, 179.5W). globe-engineer maps texture v accordingly.
- **`valueRange`** is the fixed colour range of the colormap, not the data min/max. Values outside it saturate at the end colours. The legend shows this range.
- **Polygons:** rings are counter-clockwise in plain lon/lat (GeoJSON RFC 7946 order). Polar regions follow the Natural Earth style (coast, then down the antimeridian to the pole). Regions that cross 180 are MultiPolygons split at 180. `bbox` never wraps (west <= east); a region crossing 180 uses the full longitude range.
- **Outline dates** (`outlines.topo.json`) are annual `YYYY`, one outline per year, whatever the variable's frequency. Partial first and last years are allowed.
- **`chartTypes` vocabulary:** `series` (default: time series with trend line and band), `anomaly`, `annual_change`, `sea_level_equivalent`, `bar` (rates with uncertainty), `running_mean`, `seasonal_cycle`, `summer_series`, `decade_means`, `budget`. New types are added here first.
