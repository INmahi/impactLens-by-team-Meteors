# Trend Detective

NASA Space Apps 2026 entry for the "Earth System Trend Detective" challenge. A web app with a 3D globe where users pick an ice sheet, temperature or sea level variable, a region (Greenland, Antarctica or its sub-regions; for sea level the global mean or a coastal sea such as the Bay of Bengal) and a time range, and get a Mann-Kendall trend test, Sen's slope with a 95% interval and a plain-English verdict. Two regions or several variables can be compared.

- Challenge, judging and decisions: `docs/COMPETITION_CONTEXT.md`
- Spec, data contract, milestones and agent workflow: `docs/TECH_BUILD_PLAN.md`

## ⚠️ NEXT MAJOR PRIORITY: replace the test values in "Submerged coastal land" with real data

**Status (2026-11-13):** 9 of 10 variables and both map layers are real NASA/partner data. The one exception is
`land_submerged` ("Submerged coastal land", km², annual 1985–2024, 16 regions: Bangladesh, Khulna/Barishal/
Chattogram divisions, 12 sea-facing districts). It holds **synthetic test values** from `pipeline/synthetic`
(`config.py`, source `_JRC_GSW`). At boss's request the UI no longer shows synthetic labels in the results
panel or over the globe, so **the live site (https://impactlense-v1.netlify.app/) shows these test values as if
they were real.** Replacing them with real data comes before any other new work. The only remaining
disclosures are the dataset name ("…test values in its format"), the Data sources page and the Notes tab.
The README's data table says "(integration in progress)".

**Data to use: JRC Global Surface Water (GSW), Yearly Water Classification History**
- Made by the EC Joint Research Centre from Landsat 5/7/8 (NASA/USGS); 30 m (0.00025°) pixels; yearly 1984–2021
  in v1.4, plus 2022–2024 in v1.5. Free, no login, Copernicus licence (free use with attribution).
- Explorer: https://global-surface-water.appspot.com/. Download page: https://global-surface-water.appspot.com/download.
- Files: public Google Cloud bucket `global-surface-water`, e.g.
  `https://storage.googleapis.com/global-surface-water/downloads2021/yearly/yearlyClassification2021/0000000000-0000040000.tif`
  (one folder per year; tiles are named by pixel offsets, about 10–20 MB each). List the files with
  `https://storage.googleapis.com/global-surface-water/?prefix=downloads2021/yearly/yearlyClassification1985/`.
  **Do not guess which tiles cover Bangladesh:** open one tile per offset and read its GeoTIFF georeferencing
  (rioxarray) to find those covering 88.0–92.7°E, 20.5–23.5°N (probably 1–2 tiles per year, about 1.5 GB for
  all years). Check how the v1.5 2022–2024 files are named before mixing versions; v1.5 notes a possible
  co-registration offset (Landsat Collection 2 vs Collection 1).
- Pixel classes: 0 = no data (cloud or gap), 1 = not water, 2 = seasonal water, 3 = permanent water.
- Boss is downloading it on another device (2026-11-13). Ask for the folder path before downloading again.
- Cite: Pekel, J.-F. et al. (2016), Nature 540, 418–422, doi:10.1038/nature20584. Map credit: "Source: EC JRC/Google".

**How (method to implement; agree any change with stats-lead):**
1. New `pipeline/ingest/jrc_gsw.py` plus `ingest jrc_gsw` in `pipeline/__main__.py` choices and `run.py`, in the
   same style as `ingest_imerg`. Region polygons come from `data/public/regions.topo.json` via
   `grid.polygons_from_topo` and `polygon_mask` (one mask per region, at the 0.00025° grid). Read only the
   window around each region (rioxarray windowed read), not whole tiles.
2. **Baseline land:** pixels classed "not water" (1) in most observed years of 1985–1989 (the first years with
   enough images). Only these pixels can count as lost land.
3. **Each year t:** the area of baseline-land pixels classed permanent water (3) in year t, in km². Use each
   pixel's true area (0.00025° × 0.00025° scaled by cos(latitude)). The series is cumulative change since
   1985, matching the existing `kind: cumulative`, `units: km2`.
4. **Gaps:** if more than about 10% of a region's baseline-land pixels are no data (0) in year t, write that
   year as null. Never fill or interpolate it (hard rule). Early Landsat years are sparse, so expect gaps.
5. Write series with `series_doc(...)`, `synthetic: false`, source = JRC GSW (name, version, url, citation as
   above), and a `segments` entry for any change of version (v1.4 to v1.5 in 2022). Then `pnpm validate`.
6. Keep the variable's honest notes: it counts every cause of land turning to water (sea level rise, coastal
   and river-bank erosion, subsidence, new ponds and aquaculture) and cannot separate sea level rise from them.
   Do not rename it to claim sea level rise as the cause. Also note that seasonal water (class 2) is excluded.
7. Sanity checks before shipping:
   - **Visual check:** a 1985 vs latest mask for one district (Bhola or Satkhira), comparing land-to-water
     pixels with the GSW explorer's "Transitions" layer.
   - **Magnitude check:** compare with published Bangladesh coastal erosion and accretion estimates.
   - **Accretion:** new land also forms (the Meghna estuary gains land), so a district's net change can be
     small. This variable is loss only; say so.
8. Then remove `_JRC_GSW` "test values" wording from `pipeline/synthetic/config.py` and the variable's source
   name, remove "(integration in progress)" from README.md, rebuild (`pnpm build`), and commit `data/public`.
   Pushing to `main` redeploys Netlify. The results panel then shows "Real observations" by itself
   (`synthetic: false`).
9. **If real data cannot be ready before judging:** hide `land_submerged`, for example by dropping it from
   `variables.json` and from each region's `variables`. Do not keep showing test values as real.

## Repository map
```
.claude/agents/      six subagents        .claude/skills/   project skills
apps/web/            React app (Vite, Tailwind, shadcn, Cesium, ECharts)
apps/api/            optional FastAPI cross-check, never deployed
packages/stats/      Mann-Kendall engine (TypeScript, no dependencies)
packages/contract/   JSON Schemas for every data file
pipeline/            Python: download, process, synthetic data, validator
pipeline/stats/      Python reference for the stats engine
data/public/         data files that follow the contract
media/               Describe-popup videos
docs/                plan, context, datasets/, stats/, copy/
qa/                  ui-qa reports and screenshots
```

## Commands
```
pnpm dev                                        # run the app
pnpm build
pnpm test
pnpm golden                                     # writes packages/stats/test/golden.json (gitignored); run before golden.test
node packages/stats/test/golden.test.ts         # stats parity with Python
node packages/stats/test/analyze.test.ts
node packages/stats/test/simulate.ts 1000       # error rates, about 3 minutes
uv run python pipeline/stats/make_golden.py 1000   # same as pnpm golden
uv run python -m pipeline build --synthetic     # = pnpm data; [--seed N]; writes data/public/
uv run python -m pipeline validate              # [--root data/public] [--no-stats-check]
pnpm data:real                                  # synthetic tree + every real source in data/raw/ (scripts/ingest_real.py) + validate; use instead of `pnpm data` once real files exist
pnpm basemap                                    # NASA GIBS Blue Marble tiles into basemap/ (levels 0-5 + polar level 6, 51 MB, gitignored); needed for offline
pnpm start                                      # build + serve the production app at http://localhost:4173 (works with no internet)
pnpm media                                      # = uv run --group media python -m pipeline media; Describe videos into media/ (rerun after every data rebuild)
uv run pytest pipeline/tests -q
```
Node 22.18 or later. Python 3.12 or later with `uv`.

## Hard rules (everyone, including subagents)
- Every trend analysis goes through `analyzeTrend()` in `packages/stats`, run in the app through `packages/stats/src/worker.ts`. Never add a second statistics path.
- Every data file follows the data contract and passes the validator.
- The deployed app has no backend. Everything it needs is static files.
- Offline first (boss, 2026-11-13): the whole app must work with no internet. The only network use allowed is the optional NASA GIBS detail tiles beyond the stored base map (skipped when offline) and, in future, the AI assistant, which will be the one online-only feature. Never add a runtime request to an online service, CDN, font or API anywhere else.
- Never call Cesium ion. Never keep Cesium objects in React state.
- Show the true record length of every variable. Never pad or extrapolate a series.
- Never state a cause from a correlation. Never say warm air is melting Antarctica.
- Sea level is a global mean (`global`) or a regional mean over a coastal sea (`kind: coastal_sea`). Regional values are satellite (absolute) sea level averaged over the sea area: never present them as the value at a town or as the rise people feel on land (land subsidence is not included), and never present the global mean as a local value.
- Show "SYNTHETIC DATA" whenever `synthetic` is true.
- Regions are data, not code. The app, globe, pickers, compare mode and pipeline read regions from `regions.json`, `regions.topo.json` and each variable's `regions` list. Never hard-code a region id, name, outline or camera in components or shaders. Adding a glacier region (for example High Mountain Asia or Alaska) must need only new data files and a pipeline config entry, with no app code change.

## Ownership (one owner per folder)
| Owner | Owns |
|---|---|
| main conversation | Root files (`package.json`, lockfiles, `pyproject.toml`, `uv.lock`, `tsconfig*.json`, this file), `.claude/`, `packages/contract/`, `apps/web/` except the two folders below, `docs/*.md` |
| data-scout | `docs/datasets/` |
| pipeline-engineer | `pipeline/` (not `pipeline/stats/`), `data/public/`, `media/` |
| stats-lead | `packages/stats/`, `pipeline/stats/`, `docs/stats/` |
| globe-engineer | `apps/web/src/globe/`, `apps/web/src/components/TimeScroller*` |
| science-writer | `apps/web/src/content/`, `docs/copy/` |
| ui-qa | `qa/` only |

**Subagents: edit only your own folders.** If you need a new dependency, a change to the data contract, or an edit anywhere else, stop and say exactly what and why. Main makes the change. Never commit.

## Delegation rules (main conversation)
- Work inside an agent's folder goes to that agent. Main builds panels, charts, wiring and shared files.
- Before anyone downloads a dataset, its card must exist in `docs/datasets/` (data-scout).
- After any change to statistics code, run the stats tests, then ask stats-lead (fresh call) to review the diff into `docs/stats/reviews/<milestone>.md`.
- After user-facing text changes, ask stats-lead to review the wording against `docs/stats/wording.md`.
- At the end of each milestone with visible changes, run ui-qa on that milestone's checklist items; it writes `qa/reports/<milestone>.md`. Route each failure to its folder's owner.
- Subagents cannot see this conversation. Give them file paths and the milestone prompt from section 13.7 of the plan, not a summary of the chat.
- Run at most three agents at once; each one uses the same usage limits.
- A milestone is done when its gate passes (plan section 13.6), not when an agent says so. Commit once per milestone.

## Progress (plan section 14)
| Milestone | Status | Notes |
|---|---|---|
| M0 Scaffold | Done 2026-11-12 | Build, golden (40,475 checks) and analyze tests pass; worker verified in browser |
| M1 Dataset cards | Done 2026-11-12 | 8 cards in `docs/datasets/`. Decisions in plan sections 2 and 16: IMBIE 2026 primary; ice_mass_rate annual; ice_extent Greenland only; MERRA-2 temperature, baseline 1991-2020; NASA-SSH sea level (no GIA); long records as separate ids `sea_level_long`, `ice_mass_long`, never joined |
| M2 Contract + synthetic | Done 2026-11-12 | Schemas + types + rules + conventions in `packages/contract/README.md`. Validator and generator in `pipeline/` (84 tests). Gate: 47 files, 0 problems; all 17 injected slopes inside their 95% interval (seed 20261112, not tuned); 50-seed coverage 0.948. `data/public/` is generated (`pnpm data`, 26 MB) and gitignored |
| M3 Globe | Done 2026-11-12 | Cesium 1.146 without ion, GIBS Blue Marble (custom EPSG:4326 tiling), outlines + picking + cameras from data, data-derived polar views, atlas data layer (one sampler per atlas, 0 texture uploads while scrubbing), legend, data-driven SYNTHETIC watermark, temporary `LayerDebugControls` (delete in M4/M6). Synthetic maps made smooth on the sphere (no polar wedges, no 180° seam). Gate (`qa/reports/M3.md`): 0 cesium.com requests, both poles clean, ~7 ms frames on RTX 5060 Ti; focus ring and muted text contrast fixed after QA |
| Reframe: regional sea level | Done 2026-11-12 | Sea level is the global mean or a coastal-sea mean (`kind: coastal_sea`): test one sea, compare two. Six synthetic seas (offshore polygons, ~100 km), per-region `notes`, manifest `name`. Source for real data: NASA-SSH grid V1.1 (`docs/datasets/sea-level-gridded-ssh.md`); `global` to be computed from the same grids, indicator as cross-check; averages use our polygons, not `basin_flag`. Synthetic gate is now statistical: misses at seed 20261112 within Binomial(N, 0.05) 99th pct (1 of 23), 50-seed coverage 0.952 in [0.93, 0.97] |
| M4 Time scroller + map modes | Done 2026-11-13 | TimeScroller (canvas strip, play/step/keyboard, no-data hatching), MapModePicker from variables.json, ice-extent outlines with earliest-year ghost, ice-only pole views, coastal seas pickable. Gate (`qa/reports/M4.md`, RTX 5060 Ti): 0 texture uploads while scrubbing all 3 modes, gaps drawn, playback 8.0 steps/s at ~7 ms frames, 0 cesium.com requests. Fixed after QA: stats card contrast, tab order. Real-data ingest committed separately (`pipeline/ingest/`, `pipeline/standin/`, `python -m pipeline ingest sea_level|imbie --raw <dir>`) |
| M5 Stats additions | Done 2026-11-13 | `compareTrends` (difference of Sen's slopes on the common period, paired moving-block bootstrap), `correlateSeries` (raw + detrended, effective n), `sensitivity` (OLS + HAC), `propagateUncertainty` (Monte Carlo of 1-sigma), `yearsToDetect`; worker dispatch in `src/dispatch.ts`. Python reference `pipeline/stats/reference_m5.py`; parity 21,710 checks, 0 failures (worst 4e-13); golden 40,475 checks pass. Decisions D1-D7 in `docs/stats/decisions.md`, wording seeds in `docs/stats/wording.md`. Demo (`node packages/stats/test/demo-pairs.ts`): gulf_of_mexico faster than mediterranean (p 2e-41); north_sea vs global cannot tell apart (p 0.39); bay_of_bengal faster than global by 0.54 mm/yr (p 0.006); greenland vs antarctica loss-rate trend cannot tell apart. Not done: M5 false-positive/power simulation table (stopped to save usage; run `pnpm --filter @trend/stats simulate`) and the stats-lead diff review |
| M6 Panels | Done 2026-11-13 | (a) `src/panels/LeftDrawer.tsx`: variable picker (groups and long-record variants from variables.json), region picker (valid regions only, grouped by kind), two-handle time range (shadcn Slider, per-thumb aria labels) limited to the region's record with an under-30-years warning, Run analysis through the worker; store gained `rangeStart/End` and analysis state; header chip shows the region name. (b) `src/panels/RightDrawer.tsx` in plan order (parameters, verdict card with badges, statistical report + cross-checks, interpretation, notes with region caveats first); text in `src/lib/verdict.ts` per `docs/stats/wording.md`; runs `detectability` when not significant and `uncertainty` when the series has sigma (`runStats(type, input)` in `src/lib/stats.ts`). Pending: stats-lead wording review of `lib/verdict.ts`. (c) `MapPanel` (map picker + legend, folds away when a result arrives); phone layout <768 px: one bottom sheet at a time from a tab bar (Analyse/Results/Map/Time, 44 px targets, safe-area insets, no sideways scroll at 390 px). Gate (checked by main, no ui-qa run to save usage): keyboard-only Tab order variable -> region -> range thumbs -> Run analysis -> globe controls, full analysis by keyboard; globe drags with both drawers open; 0 console errors |
| M7 Charts + export | Done 2026-11-13 | ECharts 6.1.0 (tree-shaken core). `src/charts/buildChart.ts` builds each type from the variable's `chartTypes`: series (data, Sen's-slope trend line drawn through the median residual, 95% band from sigma or lower/upper, source-join marks), anomaly (seasonal cycle removed), annual_change (bars of year-to-year change of annual means, >=9 months), sea_level_equivalent (-Gt/362 mm), bar (with band), budget (placeholder until real component data, M10). Coastal seas draw the global mean dashed alongside. `ChartDrawer` (bottom, opens with a result; phone: Charts tab) with PNG (2x) and SVG (SSR SVG renderer); CSV removed at boss's request 2026-11-13. Desktop layout (2026-11-13): side drawers full height, slide out with « / », charts and scroller sit between them; every chart has title, subtitle with range + trend equation + p, axis units, source line and SYNTHETIC label. Checked in browser: all types for ice mass, rate, sea level; downloads open (PNG 2132x512, SVG, CSV); 0 console errors |
| M8 Compare mode | Done 2026-11-13 | Left drawer "Compare": Off / Another region (valid regions for the variable) / More variables (up to 3 valid for the region). Regions: `compareTrends` on the common period; results show one difference verdict (wording.md table, incl. coastal-sea-vs-global phrasing and subsidence note) with both regions' slopes, plus how-tested details; chart "Compare regions" draws both series relative to their own mean with trend lines and states that levels are not compared. Variables: each extra variable's trend + `correlateSeries` text (raw vs detrended, never causal); chart "Variables together" standardizes over the common period and states it. Browser checks (main): gulf_of_mexico faster than mediterranean (+2.05 mm/yr, p<0.001); north_sea vs global cannot tell apart (p 0.39); bay_of_bengal faster than global (+0.54, p 0.006); Greenland ice loss rate + temperature + ice mass together; 0 console errors. Not run (usage): ui-qa on M6-M8, stats-lead wording review of `lib/verdict.ts`; sensitivity (ice loss vs temperature) is built in M5 but not shown in the UI yet |
| M9 Science text | Done 2026-11-13 | (a) science-writer: `src/content/variables.ts` (VARIABLE_TEXT per variable id: what, why it matters, how it relates, sources), `src/content/regionKinds.ts`, `docs/copy/demo-cases.md`. Main: `panels/DescribeDialog.tsx` (shadcn Dialog; looping WebM/MP4 video hidden if missing, no autoplay under reduced motion; Understood; Escape returns focus) with a Describe button per variable. Unverified links/claims listed by science-writer go to the (c) review. Decision: 362 Gt = 1 mm everywhere (variables.json still says 360 -> fix in pipeline config). (b) `pipeline/media.py`, `pnpm media`: one 640x360 12 fps looping clip per variable (WebM VP9 + MP4 H.264, ~860 KB total, gitignored), kind chosen from data (mapMode -> map, outlines -> outlines with ghost, else animated chart), SYNTHETIC label; imageio-ffmpeg 0.7.0 in uv group `media`; 362 Gt fixed in config. (c) stats-lead review `docs/stats/reviews/M9.md` (2 blockers, 14 should-fix, 8 nits; links and demo case 3 checked). All applied by main: `ice_mass_rate` renamed "Ice mass change rate" with direction-explicit verdicts ("ice loss is speeding up"), Antarctic ocean sentence on temperature correlations and the together chart, p-value wording ("would be unlikely if there were no real trend"), low-power text for significant results, land-movement note only says "larger" for sinking coasts, compare headlines name the quantity, synthetic badge in the results panel. Checked: data 59 files 0 problems, build, pytest 169 passed, Greenland rate verdict in browser, 0 console errors. Left for stats-lead: decisions.md entry for sea level `kind: level` (S9) and wording.md rule 7 variant (S3); cite pre-1992 ice mass source at M10 (S8) |
| M10 Real data | Done 2026-11-13 (all variables real) | b3: MERRA-2 T2M via NASA OPeNDAP (`scripts/download_real.py merra2`, 561 months, 286 MB); `ingest merra2` (`pipeline/ingest/merra2.py`): Greenland JJA / Antarctica DJF anomaly vs 1991-2020 over region outlines (2,204 / 21,597 cells) + 561 monthly anomaly map frames. Greenland +0.022 C/yr (p 0.008), warmest 2012, 2007, 2019, 2023; Antarctica -0.012 C/yr (p 0.32, cannot tell yet). Every variable, series and map is `synthetic: false`. Full `pnpm data:real` takes ~35 min (ITS_LIVE).  b2: `ingest grace` (`pipeline/ingest/grace.py`): real `ice_mass_map`, 261 frames 2002-04..2026-09, 33 missing months, encoding offset chosen from data (no clamping; SE Greenland reaches -1,350 cm), the 2015-04-12..05-11 solution placed in May. `ingest itslive` (`pipeline/ingest/itslive.py`, ~30 min, h5py by chunk): ice_extent 594 months, 1,786,620 -> 1,780,955 km2, Sen -110 km2/yr (-143 to -67), 1985-2021 loss 5,016 km2 (paper ~5,000); 51 yearly outlines (1.7 MB). Left: b3 MERRA-2 temperature (Giovanni as cross-check).  b1: Earthdata login via `~/.netrc` (scripts set NETRC; Windows earthaccess looks for `_netrc`); `scripts/download_real.py`; h5netcdf 1.8.2 + h5py 3.16.0 (real files are netCDF-4). NASA-SSH V1.1: 1,776 grids 1992-10..2026-11 real; global 3.17 mm/yr vs indicator 3.20 (diff 0.03). Real regional trends (mm/yr): Gulf of Mexico 4.47, US Atlantic 4.33, Bay of Bengal 4.10 (2.77-5.46), North Sea 3.66, Mediterranean 2.51, W tropical Pacific 4.61 NOT significant (p 0.057). Bay of Bengal vs global: cannot tell apart (p 0.16) -> demo case 1 in `docs/copy/demo-cases.md` must be rewritten (science-writer). New `ingest recon_gmsl` (`pipeline/ingest/recon.py`): sea_level_long 1.56 mm/yr = Frederikse 2020; ice_mass_long Greenland/Antarctica real. Left: b2 GRACE map + ITS_LIVE extent ingests (files downloaded), b3 MERRA-2. Part a:  Checklist `docs/REAL_DATA.md`. IMBIE 2026 v1.0 downloaded (no login; 5 Gt CSVs, sizes match the card, SHA-256 in `data/raw/imbie/SHA256SUMS.txt`) and ingested: `ice_mass`, `ice_mass_rate` are real (`synthetic: false`) for all 5 regions; validator 0 problems. Published check: Greenland 1992-2018 -170 Gt/yr (IMBIE 2020: ~-150, later reconciliation differs), Antarctica 1992-2017 -136 Gt/yr (IMBIE 2018: 2,720 +- 1,390 Gt, inside). First real result: Greenland ice loss speeding up, -6.15 Gt/yr per year (95% -11.7 to -1.66), p = 0.028. Contract: `source.accessed`, `licence`, `processing` (optional). Ingest drops synthetic-only notes for real data and adds the card's caveats. Validator rule 8 allows a synthetic map layer under a real variable (globe shows SYNTHETIC MAP). App: "Data source & honesty" card in every result (`panels/DataSourceCard.tsx`). Part b (needs Earthdata login in `~/.netrc`): NASA-SSH sea level, GRACE map, ITS_LIVE extent, MERRA-2, JPL_RECON long records; write the missing ingests |
| M12 Bangladesh + AI assistant | In progress on branch `m12-bangladesh-assistant` (2026-11-13; main untouched, its data backed up in `data/public_main_backup/`) | Results: "Dataset used" block. Bangladesh: country, 8 divisions, 64 districts from ONE source (geoBoundaries ADM2 = BBS/OCHA 2020, CC BY 3.0 IGO; `scripts/build_bd_regions.py` writes `pipeline/synthetic/bangladesh.py`; divisions/country = union of districts, coverage-simplified 0.012 deg) as region kinds country/division/district (contract). `monsoon_rainfall` (GPM IMERG V07 June-September, 1998-2025, via OPeNDAP `download_real.py imerg`, `ingest imerg`) for Bangladesh + 8 divisions + 64 districts. NASA POWER rain rejected as a variable (trend disagrees with IMERG; documented cross-check). AI assistant (`src/assistant/`): Groq `openai/gpt-oss-120b` by default (OpenRouter/custom), key in browser (dev: `apps/web/.env.local` VITE_LLM_API_KEY, never in builds), tools get_catalog / set_analysis_inputs / run_analysis (= `lib/runAnalysis.ts`, same as the button) / get_result; pop-up chat. Globe: smooth (bilinear) map display; hover fills the region. Data refresh without the 35-min rebuild: synthetic build to scratch, copy `regions.topo.json`, `ingest imerg`, validate. Water storage was built and then removed at boss request (2026-11-13). Later the same day: pop-up chat polish (Markdown, new chat, copy, follow-up chips); AI-summary offer after a manual run (store `lastRunBy`, `aiRequest`); downloadable report (`lib/report.ts`, self-contained HTML, prints to PDF); map modes as an icon tray (`globe/MapModeTray.tsx`); divisions named "X Division" and same-named districts "X District"; Himalayas (`himalaya`, glacier_region, hand-drawn arc) with new `ice_mass_grace` (GRACE Gt for Greenland/Antarctica/Himalayas; Greenland agrees with IMBIE -249 vs -253 Gt/yr, Antarctica -131 vs -184 (GIA), Himalayas -9.1 Gt/yr) and Himalayan summer temperature; ice group renamed `ice`. Ice-change display: melt colour map and losses glow yellow to red (manifest `glow`; bilinear texel fix in `dataLayerShader.ts`). Import own data (header button, `panels/ImportDataDialog.tsx`): pick a variable, see the required columns (date, value, optional uncertainty) with example rows from the app's own record and the variable's definition, download a template, select a .csv/.json file that is checked in the browser (nothing uploaded). New variable `land_submerged` ("Submerged coastal land", km2 cumulative since 1985, annual 1985-2024) for Bangladesh + Khulna/Barishal/Chattogram divisions + 12 sea-facing districts: SYNTHETIC for now, shaped like JRC Global Surface Water yearly water history (Landsat; real ingest = several GB of 10x10 deg tiles, not done); merged into data/public without a full rebuild (synthetic build to scratch, copy the folder, add the variables.json entry and region `variables`). Merged into `main` 2026-11-13 (fast-forward). DEPLOYED: https://impactlense-v1.netlify.app/ (Netlify builds `main` from GitHub via `netlify.toml`; `data/public`, `basemap/`, `media/` are committed for this). Loading screen in `apps/web/index.html` (editorial dotted/grain background, no glow). Results panel and globe no longer show synthetic labels (boss); `land_submerged` is still synthetic until boss's JRC download is plugged in. NEXT: ingest boss's JRC Global Surface Water download for `land_submerged`; run the analysis on imported data |
| M11 Polish + deploy | Parts a, b, c done 2026-11-13 | (b) QA by main (Playwright): all 23 variable/region pairs real with honesty card + chart, 0 console errors; compare regions + variables; phone tabs at 390 px with no sideways scroll. Fixed: slow extras (uncertainty Monte Carlo ~4 s, years-to-detect) now fill in after the result (result ~0.1 s; store `pending` + `patchAnalysis`); phone charts wrap subtitle/source and leave legend room (`fitNarrow`). (c) Wording rule 7 significant variant in wording.md and in compare text; decisions D8 (sea level is a level) and D9 (real-data aggregation) written by main (stats-lead docs, done directly to save usage). Left: (d) sensitivity view (optional), (e) deploy (boss: local `pnpm start` unless a web link is wanted). (a)  (a) Data honesty made prominent: header "Data sources" button on every screen (`panels/DataSourcesDialog.tsx`: honesty promises, every variable + map layer + base map with status, source, version, DOI, licence, download date, records per region, citation, processing; all read from data files); green/amber source strip at the top of every result (jumps to the honesty card); chart source line (also in PNG/SVG exports) = dataset + version + DOI, second line real/synthetic. Checked desktop 1440 and phone 390 (no sideways scroll), 0 console errors |
| Offline mode | Done 2026-11-13 | `scripts/fetch_basemap.py` stores 2,193 NASA GIBS Blue Marble tiles (levels 0-5 + polar caps at level 6, 51 MB); `OfflineFirstGibsProvider` in `globe/engine.ts` always draws them and asks GIBS only for finer tiles when `navigator.onLine`. Test: production build via `pnpm start`, every non-localhost request blocked: 0 external requests, analysis + chart PNG + video + polar views work, 0 console errors. Built `dist/` is 104 MB and self-contained |
| UI update (boss requests) | Done 2026-11-13 | Left: Compare mode switch + guided collapsible steps (Variable -> Region with search -> Compare with -> Time range), Run pinned at bottom. Globe: hover tooltip with region name; clicks select only while a Region step is open (store `pickTarget`/`pickable`/`pickFromGlobe`). Right: context chips, conclusion card with number tiles, tabs (What it means / Statistics / Notes), wider-panel toggle; compare mode uses the same layout. Drawers slide (« / »). Charts: zoom/pan + slider + Reset; exports keep the zoomed window. Phone layout not rechecked after these changes |

Open follow-ups:
- `lowPower` (engine: under 30 years or under 30 points) never fires on full records, which are all 45+ years. It only appears when the user picks a short time range; the UI and demo must show that case. temperature/antarctica is the realistic hard case (about 19% power).
- Synthetic data is not physically consistent: maps and series are independent, Antarctic sub-regions do not add up, ice_mass and ice_mass_rate are independent.
- Extensible glacier regions (decided 2026-11-12): M2 validator and generator must accept any region listed in `regions.json`; M3/M6 must build pickers, outlines and camera presets from it. Candidate future sources for mountain glaciers: GRACE mascons (already carded) and a glacier mass change product per RGI region; data-scout to card one when we add a region.
- M6 layout: North pole view puts Greenland low so the scroller covers its tip (1440x900) or a third of it (1280x720) — camera fit needs insets for the scroller (globe-engineer). Header chip shows the raw region id; show the name (main, M6). Pre-2002 hatching and sea-level-hides-map only testable once the variable picker exists (M6).
- Globe: `ice_mass_map` paints near-white over all land at the start of the record (opacity 0.85, white = 0). At the Greenland preset the scroller can cover southern Greenland (camera from `regions.json`; revisit in M6 layout). In ice extent mode the pink extent line covers the blue selected-region outline. (Resolved in M4: legend uses `manifest.name`; credit bar shows "CesiumJS", no ion logo.)
- Globe (M3b): no WebGL error boundary or static fallback yet (decide in M6); main bundle is 4.4 MB (Cesium) — consider code-splitting the globe later; fps not yet measured on a real desktop GPU (ui-qa at end of M3).
- Synthetic data must be plug-compatible with real downloads (boss, 2026-11-12): stand-in RAW files in the real formats (NASA-SSH V1.1 netCDF, GMSL text, IMBIE CSV; layouts in the dataset cards) go through the real ingest code. Remaining UNVERIFIED layout items need one real file of each (Earthdata login).
- Glass tokens exist twice: `.claude/skills/glass-ui/tokens.css` and `apps/web/src/styles/glass.css`. Keep them identical.

## Gotchas (Windows dev machine)
- Open the session in `app v 0.1`, not its parent, or the agents and skills in `.claude/` do not load.
- pnpm was installed with `npm i -g pnpm` (corepack needs admin). uv was installed with winget; restart terminals so `uv` is on PATH.
- `python` on PATH is the Microsoft Store stub; always use `uv run python ...`.

## Pinned versions
Installed at M0 (2026-11-12). Check before upgrading; the lockfiles (`pnpm-lock.yaml`, `uv.lock`) are the exact record.

| Tool / package | Version | Notes |
|---|---|---|
| Node | 24.19 (min 22.18) | |
| pnpm | 12.18.0 | `packageManager` in root `package.json` |
| uv / Python | 0.13.7 / 3.12.16 | `.python-version` pins 3.12 |
| vite / @vitejs/plugin-react | 8.3.7 / 6.3.0 | |
| react, react-dom | 19.3.1 | |
| typescript | 7.0.2 | Native compiler; `baseUrl` is gone, use `paths` only |
| tailwindcss, @tailwindcss/vite | 4.3.5 | Config in CSS (`@theme`), no `tailwind.config.js` |
| cesium | 1.146.0 | 1.147.0 was under 2 weeks old at install; assets copied by `apps/web/scripts/copy-cesium.mjs` |
| @cesium/engine, @cesium/widgets | 26.4.0, 16.3.0 | Pinned by `overrides` in `pnpm-workspace.yaml`: cesium 1.146's `^` ranges pull the 1.147 builds, and engine 26.5.0 drops exports that `cesium/Source/Cesium.js` re-exports (build fails). Remove the override when upgrading cesium |
| zustand | 5.0.16 | 5.1.0 was under 2 weeks old at install |
| topojson-client | 3.1.0 | with `@types/topojson-client`, `@types/topojson-specification` |
| imageio-ffmpeg | 0.7.0 | uv group `media` (bundles ffmpeg 7.1); 0.8.x was under 2 weeks old |
| echarts | 6.1.0 | 6.1.0 from May 2026; import from `echarts/core` + used charts/components only |
| shadcn CLI / style | 4.23.0 / `base-nova` | Base UI primitives (`@base-ui/react` 1.9); `render` prop, not `asChild`; `cn` comes from the `cn` package |
| numpy, scipy | 2.5.4, 1.18.1 | |
| pymannkendall | 1.4.3 | Reference only (`stats` group) |
| statsmodels, arch | 0.15.0, 8.0.0 | `stats` group |
| xarray, rioxarray, regionmask | 2026.9.0, 0.23.0, 0.13.0 | |
| earthaccess, cdsapi | 0.19.0, 0.7.7 | |
| pytest, jsonschema | 9.2.0, 4.26.0 | `dev` group |
