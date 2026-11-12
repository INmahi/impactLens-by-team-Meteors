---
name: data-contract
description: The Trend Detective data contract - file layout of data/public/, the JSON shape of variables.json, regions.json, series, manifest and precomputed stats files, the RGBA PNG packing rule for gridded frames, and the valid variable and region ids. Use whenever writing, reading, validating or changing any data file, the synthetic generator, the pipeline output, or app code that loads data.
---

# Data contract

Every data file, synthetic or real, follows this contract. The app never changes when data is swapped. Full spec: [reference.md](reference.md). One valid example of each file: [examples/](examples/).

## Layout
```
data/public/
  variables.json            all variables (array)
  regions.json              all regions (array)
  regions.topo.json         outlines, TopoJSON, object "regions", feature id = region id
  {variable_id}/
    manifest.json           gridded variables only
    series/{region_id}.json
    stats/{region_id}__default.json   precomputed TrendReport for the full record
    frames/atlas-000.png ...          gridded variables only, 4096x4096 max
    colormap.png                      256x1
media/{variable_id}_loop.webm (+ .mp4)
```

## Ids (use exactly these)
- Variables: `ice_mass`, `ice_mass_rate`, `ice_extent`, `ice_mass_map`, `temperature`, `sea_level`. Group `ice_sheet` = `ice_mass`, `ice_mass_rate`, `ice_extent`.
- Regions: `greenland`, `antarctica`, `antarctica_west`, `antarctica_east`, `antarctica_peninsula`, `global`.
- Valid pairs: see the table in [reference.md](reference.md#regions). `sea_level` is `global` only; `ice_extent` is `greenland` only.
- These are the current regions, not a closed list. **Regions must be addable without code changes:** a new glacier region (for example `high_mountain_asia`, `alaska`) is added by (1) an entry in `regions.json` with `bbox` and `camera`, (2) its outline in `regions.topo.json`, (3) its id in each valid variable's `regions` list, (4) `series/{region_id}.json` and `stats/{region_id}__default.json`. Pipeline code reads its regions from a config list; app code reads them from `regions.json`. Region ids are lowercase snake_case.

## Rules that are easy to break
1. `dates` are `YYYY-MM` (monthly) or `YYYY` (annual), ascending, no duplicates. Missing values are `null`, never `NaN`, `0` or a dropped date.
2. Never pad or extrapolate. `period` in `variables.json` is the true record.
3. `sigma` (or `lower` and `upper`) is present whenever the source gives uncertainty, same length as `values`.
4. `segments` lists every source joined into the series, with any offset applied at the join.
5. `synthetic: true` on every synthetic file. The app shows a "SYNTHETIC DATA" watermark from it.
6. `kind` is `level`, `cumulative` or `rate`; `frequency` is `monthly` or `annual`. These go straight into `analyzeTrend()`.
7. Stats files hold exactly the `TrendReport` returned by `analyzeTrend()` from `packages/stats`. Never compute statistics another way.

## PNG packing (gridded frames)
Browsers reduce 16-bit PNGs to 8 bits, so each value is packed into two 8-bit channels:
- `q = round((value - offset) / scale)`, clamped to 0..65535
- `R = q >> 8`, `G = q & 255`, `B = 255` where valid and `0` where missing, `A = 255`
- Decode: `value = (R * 256 + G) * scale + offset`, valid only where `B == 255`
- Save as 8-bit RGBA PNG, no colour profile, no premultiplied alpha. Sample with NEAREST filtering only.

## Validator
`uv run python -m pipeline validate` checks every file against the JSON Schemas in `packages/contract/`. (Built in M2 by pipeline-engineer; until then, check by hand against `examples/`.) Never report data work done while validation fails.

## Changing the contract
Subagents do not change the contract. Stop and tell main exactly what field to add or change and why; main updates `packages/contract/`, this skill and `docs/TECH_BUILD_PLAN.md` section 8 together.
