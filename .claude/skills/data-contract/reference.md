# Data contract reference

Source of truth: the schemas in `packages/contract/schemas/`. **Since M2 (2026-11-12) the contract has fields not listed below; read `packages/contract/README.md` for them and for the cross-file rules.** This file repeats plan section 8 plus the parts the plan leaves implicit. `examples/` is kept valid against the schemas.

## variables.json
An array. One entry per variable:

| Field | Type | Notes |
|---|---|---|
| `id` | string | One of the variable ids |
| `group` | string, optional | `ice_sheet` for `ice_mass`, `ice_mass_rate`, `ice_extent` |
| `name` | string | Display name |
| `units` | string | `Gt`, `Gt/yr`, `km2`, `cm w.e.`, `degC`, `mm` |
| `kind` | `level` \| `cumulative` \| `rate` | The stats engine uses it to word the notes |
| `frequency` | `monthly` \| `annual` | |
| `period` | `[start, end]` | True record, same date format as the series |
| `regions` | string[] | Regions this variable is valid for |
| `mapMode` | string \| null | Id of the gridded layer shown on the globe, or null (sea level) |
| `chartTypes` | string[] | First entry is the default chart |
| `source` | `{ name, url, citation }` | |
| `describe` | `{ video, what, whyItMatters }` | Text owned by science-writer |
| `notes` | string[] | Caveats for the Notes panel |

## regions.json (proposed in M0; confirm in M2)
The plan names the file but not its shape. Proposed:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Region id |
| `name` | string | Display name |
| `parent` | string \| null | `antarctica` for the three Antarctic sub-regions |
| `variables` | string[] | Variables valid here (inverse of `variables.json` `regions`) |
| `bbox` | `[west, south, east, north]` | Degrees. For polar caps use the full longitude span |
| `camera` | `{ lon, lat, height, heading, pitch }` | Preset for `camera.flyTo`; height in metres, angles in degrees |

### Regions
| Region id | Variables |
|---|---|
| `greenland` | `ice_mass`, `ice_mass_rate`, `ice_extent`, `ice_mass_map`, `temperature` |
| `antarctica` | `ice_mass`, `ice_mass_rate`, `ice_mass_map`, `temperature` |
| `antarctica_west`, `antarctica_east`, `antarctica_peninsula` | `ice_mass`, `ice_mass_rate` |
| `global` | `sea_level` |

## regions.topo.json
TopoJSON with one object named `regions`. Each geometry has `id` equal to the region id and `properties.name`. Coarse outlines only (a few hundred vertices each). `global` has no geometry.

## series/{region_id}.json
| Field | Type | Notes |
|---|---|---|
| `variable`, `region` | string | Ids |
| `units`, `frequency`, `kind` | | Same as `variables.json` |
| `dates` | string[] | `YYYY-MM` or `YYYY`, ascending, on a regular grid |
| `values` | (number \| null)[] | `null` where missing |
| `sigma` | (number \| null)[], optional | 1-sigma, same length as `values` |
| `lower`, `upper` | (number \| null)[], optional | Use instead of `sigma` when the source gives bounds |
| `segments` | `{ source, start, end, offset }[]` | Every source in the series; `offset` added at the join |
| `synthetic` | boolean | |

## manifest.json (gridded variables)
| Field | Notes |
|---|---|
| `variable` | Id |
| `grid` | `{ bbox: [west, south, east, north], width, height }` in pixels of one frame |
| `encoding` | `{ scale, offset, packing }`; packing text is fixed: `"R=high byte, G=low byte, B=valid mask, A=255"` |
| `valueRange` | `[min, max]` used to normalize into the colormap |
| `frames` | `{ date, atlas, x, y, w, h }[]`: which atlas file (`frames/atlas-NNN.png`) and the pixel rectangle of that frame |
| `missing` | dates with no frame at all (for example the GRACE gap 2017-07 to 2018-05) |
| `synthetic` | boolean |

Atlases are at most 4096x4096. Frames are packed row by row, left to right, top to bottom, no padding.

## stats/{region_id}__default.json
The `TrendReport` from `analyzeTrend()` over the full record, plus `variable`, `region` and `synthetic`:

```
TrendReport {
  frequency: 'monthly' | 'annual'
  kind: 'level' | 'cumulative' | 'rate'
  start: string, end: string
  n: number                 valid points used
  coverage: number          valid / expected points in range
  alpha: number             0.05 by default
  test: MannKendallResult   headline: lag-1 autocorrelation corrected
  crossChecks: MannKendallResult[]   Hamed-Rao, Seasonal (monthly), plain
  slope: { perYear, lower, upper, perDecade }   Sen's slope, 95% interval
  lowPower: boolean
  notes: string[]
}
MannKendallResult {
  method, trend: 'increasing' | 'decreasing' | 'no trend', significant,
  p, z, tau, s, varS, n, correction, warning?
}
```
Generate these by running `packages/stats` (Node) from the pipeline, or have stats-lead confirm parity if the Python reference is used. Never hand-write numbers.

## colormap.png
256x1 RGBA, left = `valueRange[0]`, right = `valueRange[1]`. Diverging maps (Crameri `vik`, cmocean `balance`) for anomalies; sequential (`batlow`) otherwise. The legend reads the same file.

## media
`media/{variable_id}_loop.webm` and `.mp4`, muted, a few seconds, looping. Referenced from `describe.video`.
