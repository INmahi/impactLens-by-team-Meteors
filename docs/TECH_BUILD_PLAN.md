# Tech Build Plan: Trend Detective

Last updated: 2026-11-11. This is the technical spec and the implementation plan for building the app with Claude Code. Read `COMPETITION_CONTEXT.md` first for what the challenge asks.

**In one line:** a web app with a 3D globe where the user picks an ice sheet, temperature or sea level variable, a region and a time range, and gets a Mann-Kendall trend test, Sen's slope with a confidence interval, and a plain-English verdict; two or more variables or regions can be compared.

## Contents
1. Product scope
2. Variables and data sources
3. Regions
4. UI spec
5. Architecture
6. Tech stack
7. UX component map
8. Data contract
9. Statistics engine (built)
10. Globe technique
11. Pitfalls
12. Hosting
13. Claude Code setup: agents, skills, MCP, CLAUDE.md
14. Milestones
15. Hackathon rebuild plan
16. Open items

---

## 1. Product scope

**In**
- Variable picker with a Describe popup per variable (looping map video, what it is, why its change matters, "Understood" button)
- Region picker that follows the variable, and click-to-select on the globe
- Time range selector limited to the real record of the variable
- Run analysis: Mann-Kendall test, Sen's slope, 95% interval, verdict, interpretation, notes
- 3D globe with map modes and a time scroller
- Bottom chart drawer with a chart-type picker, PNG/SVG chart download and CSV data download
- Compare mode: two regions (Greenland versus Antarctica), or two to four variables on one view
- Collapsible left, right and bottom drawers; glass style; works on a phone

**Later**
- LLM-written interpretation
- Guided "detective" questions that suggest a variable
- Vegetation and urban change (South and East Asia)

## 2. Variables and data sources

Ice mass, loss rate and extent are sub-variables of one group, `ice_sheet`.

| Variable id | Unit | Source | Real coverage | Shape | Caveats for the Notes panel |
|---|---|---|---|---|---|
| `ice_mass` | Gt, cumulative | [IMBIE](https://imbie.org/) AR6 dataset | 1992-2020 | Time series with 1-sigma | Totals per ice sheet, no map. Reconciled from 46 satellite surveys |
| `ice_mass` (long record) | Gt | NASA [JPL_RECON_GMSL](https://podaac.jpl.nasa.gov/dataset/JPL_RECON_GMSL): `GrIS_*`, `AIS_*` | 1900-2018 | Time series with bounds | Given in mm of sea level; 362 Gt = 1 mm. Before 2003 it rests on models and in-situ data |
| `ice_mass_rate` | Gt/yr | IMBIE rates | 1992-2020 | Time series with 1-sigma | A trend in this series is acceleration |
| `ice_extent` | km2 | NASA [ITS_LIVE NSIDC-0793](https://nsidc.org/data/nsidc-0793) | Sept 1972 - Feb 2022, monthly | 120 m masks, EPSG:3413, netCDF-4 | **Greenland only.** We ship a monthly area series and coarse outlines, never the 120 m data |
| `ice_mass_map` | cm water equivalent | NASA GRACE/GRACE-FO JPL mascons RL06.3 v4 | 2002 onward, monthly | 0.5 degree grid | Map layer only. About 300 km real resolution. Gap July 2017 to May 2018 |
| `temperature` | deg C anomaly | NASA MERRA-2 (1980 onward) or GISTEMP as primary; [ERA5](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels) monthly means (1940 onward) as secondary | 45 to 85 years | Gridded | Reanalysis, not direct measurement; less reliable over Antarctica before 1979 |
| `sea_level` | mm | NASA satellite global mean sea level (1993 onward); JPL_RECON_GMSL (1900-2018) | 33 to 118 years | Global time series | **Global only.** No Greenland or Antarctica sea level |

**The 50-year target.** Only ice extent, temperature and reconstructed sea level reach 50 years. IMBIE has 29. Never pad a series; show its true period.

**Not independent.** The reconstructed sea level budget is built from mass estimates. Ice mass against sea level is arithmetic, not a discovered correlation.

**Temperature for the hemisphere comparison.** Greenland uses the summer mean (June to August); Antarctica uses December to February. Annual means are a labelled fallback.

**Vegetation and urban (later).** MODIS NDVI `MOD13C2` (monthly, 2000 onward) and VIIRS Black Marble `VNP46A3`/`VNP46A4` (2012 onward). Longer options: AVHRR NDVI (1981 onward) and GHSL built-up area (1975 onward, not a NASA product).

**Access.** NASA products through `earthaccess` with an Earthdata login. ERA5 through the CDS API with a CDS account. IMBIE by direct download.

## 3. Regions

| Region id | Used by |
|---|---|
| `greenland` | all ice variables, temperature |
| `antarctica` | ice mass, loss rate, mass map, temperature |
| `antarctica_west`, `antarctica_east`, `antarctica_peninsula` | ice mass, loss rate |
| `global` | sea level only |

## 4. UI spec

A full-screen globe sits behind everything. Glass panels float on top.

**Style:** transparent, glass, modern, floating, rounded corners, dark theme. Team logo top centre.

**Left drawer: inputs**
1. Variable picker: an "Ice sheet" card with three sub-variables, plus Temperature and Sea level. Each has a Describe button.
2. Region picker, limited to regions valid for the variable.
3. Time range: two-handle slider limited to the variable's record, with a warning under about 30 years.
4. Compare: add a second region, or add up to three more variables.
5. Run analysis button.

**Centre: globe**
- Zoom by scroll and by buttons. Presets: Greenland, Antarctica, and a toggle between the poles.
- Map modes: ice mass (GRACE, 2002 onward), ice extent (Greenland outlines, with the earliest outline kept as a ghost), temperature anomaly.
- Sea level has no polar map.
- Legend with colormap and units. "SYNTHETIC DATA" watermark while data is synthetic.

**Time scroller (bottom centre):** play, pause, drag, step by month or year. Shows where a layer has no data. Slides up with the bottom drawer.

**Right drawer: results, in this order**
1. Selected parameters
2. Main conclusion (verdict card)
3. Statistical report: test name, tau, z, p, Sen's slope and interval, n, coverage, correction factor; cross-check tests in an expandable section
4. Interpretation
5. Notes

**Bottom drawer: charts.** Opens when an analysis is ready.
- Default is the time series with trend line and interval band. Other types by variable:

| Variable | Other chart types |
|---|---|
| Ice mass | Anomaly with seasonal cycle removed, annual change bars, sea-level equivalent (mm) |
| Loss rate | Bars with uncertainty, 5-year running mean |
| Ice extent | Seasonal cycle, anomaly |
| Temperature | Anomaly, summer-only series, decade means |
| Sea level | Budget view: ice sheets, glaciers and ocean warming as parts of the total |

- Multi-variable view: each variable standardized to its own mean and spread, or two labelled axes. The normalization is stated on the chart.
- Every chart: title, axis titles with units, time frame, trend equation, p-value, source line, uncertainty band where the data has one, and a mark at any join between sources.
- Download chart as PNG or SVG; download data as CSV.

**Compare mode:** two charts, two statistics blocks, and one difference verdict.

## 5. Architecture

```
NASA / IMBIE / ERA5 ──> pipeline (Python, offline) ──┐
synthetic generator ─────────────────────────────────┤
                                                     v
                              data/public/  (static files, the data contract)
                                                     │
                                  Cloudflare Pages + R2 (static hosting)
                                                     │
                                                     v
        React app ── globe (Cesium) ── charts (ECharts) ── stats worker (packages/stats)
```

**Decision: the deployed app has no backend.**
- All data is static files that follow the data contract.
- Every trend analysis runs in the browser, in a Web Worker, using `packages/stats`.
- Reason: free Python hosts sleep after minutes of inactivity and take about a minute to wake. A sleeping server during judging is the largest risk we can remove.
- `apps/api` (FastAPI) is optional: a local tool to cross-check the browser engine against Python. It is not deployed.

**Phases:** (1) synthetic data in the contract, (2) real data that passes the validator, (3) hackathon rebuild.

## 6. Tech stack

Versions seen on 2026-11-10. Re-check each with `npm view <pkg> version` or `pip index versions <pkg>` when scaffolding.

| Layer | Choice | Package | Version seen | Why |
|---|---|---|---|---|
| Globe | CesiumJS, used directly | `cesium` | 1.147 | Correct poles, custom shader materials, picking, fly-to, render on demand. No ion token needed |
| Build | Vite | `vite` | 8.x | Needs Node 22 |
| UI runtime | React | `react` | 19.x | |
| Language | TypeScript | `typescript` | pin what the tools support | |
| Styling | Tailwind CSS v4 | `tailwindcss`, `@tailwindcss/vite` | 4.2.2 or later | Config lives in CSS |
| Components | shadcn/ui | `shadcn` CLI | Base UI by default | Pick one primitive library at init and keep it |
| Animation | Motion | `motion` (import `motion/react`) | 14.x | Drawers and popups |
| State | Zustand | `zustand` | 5.x | One store read by globe and panels |
| URL state | nuqs | `nuqs` | check | Shareable analyses |
| Data fetching | TanStack Query | `@tanstack/react-query` | 5.x | Caching static JSON |
| Charts | Apache ECharts, thin wrapper | `echarts` | 6.1 | Annotations, bands, PNG and SVG export |
| Region outlines | TopoJSON | `topojson-client` | check | A handful of polygons; no vector tiles needed |
| **Statistics** | **`packages/stats` (in repo)** | none | built | Mann-Kendall and Sen's slope, no dependencies |
| Pipeline | Python 3.12+ with `uv` | `earthaccess`, `cdsapi`, `xarray`, `rioxarray`, `regionmask`, `numpy`, `Pillow` | check | No xESMF |
| Stats reference | Python | `pymannkendall` 1.4.3, `scipy`, `statsmodels`, `arch` | confirmed on numpy 2.5.3, scipy 1.18.1 | Tests and offline precompute only |
| Media | ffmpeg | | | Describe videos |
| Tests | Vitest, Playwright, pytest | | check | |
| Hosting | Cloudflare Pages + R2 | | | Static; no cold start |

## 7. UX component map

| UI element | Build with | Notes |
|---|---|---|
| Left, right, bottom drawers | Custom glass panels animated with Motion | **Not** shadcn Sheet or Dialog: they are modal and would block the globe. Wrapper has `pointer-events: none`; each panel has `pointer-events: auto` |
| Describe popup | shadcn Dialog | `<video autoPlay muted loop playsInline>` with WebM then MP4 sources; pause on close |
| Variable cards | shadcn Card + ToggleGroup | Ice sheet card expands to its three sub-variables |
| Region picker | shadcn ToggleGroup or Select | Only six regions; no tree needed |
| Time range | shadcn Slider with two thumbs | Month index as integer; label thumbs "Mar 2005" |
| Time scroller | Custom, on pointer events and a canvas strip | Arrow keys step, Space plays; draws no-data spans |
| Map mode and chart type | shadcn ToggleGroup or Tabs | |
| Stats report | shadcn Accordion + Badge | Badge for "significant", "not significant", "low power" |
| Verdict card | shadcn Card | Plain sentence first, numbers second |
| Tooltips, toasts, skeletons | shadcn Tooltip, Sonner, Skeleton | |
| Legend | Custom; draws the same colormap file as the shader | |
| Colormaps | Crameri `vik` or cmocean `balance` (diverging), `batlow` (sequential) | Baked to 256x1 PNG in the pipeline |
| Icons and font | `lucide-react`; Geist or Inter with tabular numerals | |
| Tour (later) | `driver.js` | |
| Error boundaries | `react-error-boundary` | Static fallback image if WebGL fails |

**Glass rules:** blur 12-16 px, radius 16-20 px, tint `rgba(12,16,24,0.55-0.70)`, 1 px border `rgba(255,255,255,0.10-0.16)`. Keep blurred areas small. Text must reach 4.5:1 contrast over bright ice; raise tint opacity, not blur. Provide a solid fallback and respect reduced motion.

## 8. Data contract

Every data file, synthetic or real, follows this. The app never changes when data is swapped.

```
data/public/
  variables.json
  regions.json
  regions.topo.json
  {variable_id}/
    manifest.json
    series/{region_id}.json
    stats/{region_id}__default.json      # precomputed analysis for the full record
    frames/atlas-000.png ...             # gridded variables only
    colormap.png                         # 256x1
media/{variable_id}_loop.webm
```

**`variables.json` entry**
```json
{
  "id": "ice_mass",
  "group": "ice_sheet",
  "name": "Ice mass",
  "units": "Gt",
  "kind": "cumulative",
  "frequency": "monthly",
  "period": ["1992-01", "2020-12"],
  "regions": ["greenland", "antarctica", "antarctica_west", "antarctica_east", "antarctica_peninsula"],
  "mapMode": "ice_mass_map",
  "chartTypes": ["series", "anomaly", "annual_change", "sea_level_equivalent"],
  "source": { "name": "IMBIE", "url": "https://imbie.org/", "citation": "..." },
  "describe": { "video": "/media/ice_mass_loop.webm", "what": "...", "whyItMatters": "..." },
  "notes": ["..."]
}
```
`kind` is `level`, `cumulative` or `rate`. The stats engine uses it to word the notes.

**`series/{region_id}.json`**
```json
{
  "variable": "ice_mass",
  "region": "greenland",
  "units": "Gt",
  "frequency": "monthly",
  "kind": "cumulative",
  "dates": ["1992-01", "1992-02"],
  "values": [0.0, -3.1],
  "sigma": [12.0, 12.1],
  "segments": [{ "source": "IMBIE", "start": "1992-01", "end": "2020-12", "offset": 0 }],
  "synthetic": true
}
```
- `dates` are `YYYY-MM` for monthly and `YYYY` for annual. Missing values are `null`.
- `sigma` (or `lower` and `upper`) is present whenever the source gives uncertainty.
- `segments` lists every source in the series and any offset applied at a join.

**`manifest.json` (gridded variables)**
```json
{
  "variable": "temperature",
  "grid": { "bbox": [-180, -90, 180, 90], "width": 720, "height": 360 },
  "encoding": { "scale": 0.001, "offset": -40, "packing": "R=high byte, G=low byte, B=valid mask, A=255" },
  "valueRange": [-5, 5],
  "frames": [{ "date": "1980-01", "atlas": 0, "x": 0, "y": 0, "w": 720, "h": 360 }],
  "missing": ["2017-07"]
}
```
Decoding: `value = (R * 256 + G) * scale + offset`, valid where B is 255.

**Stats result.** The right drawer renders the `TrendReport` returned by `analyzeTrend()` (see section 9). Precomputed `stats/*.json` files hold the same shape.

## 9. Statistics engine (built)

**The rule:** every series is tested with the Mann-Kendall test, and the rate is Sen's slope. The engine is written, tested and in `packages/stats`.

**How the app uses it**
```ts
import { analyzeTrend } from '@trend/stats';

const report = analyzeTrend({
  dates: series.dates,        // "YYYY-MM" or "YYYY"
  values: series.values,      // null where missing
  frequency: series.frequency,
  kind: series.kind,
  start: '1995-01',           // optional range
  end: '2020-12',
});
// report.test       headline Mann-Kendall result: trend, significant, p, z, tau, n, correction
// report.crossChecks  Hamed-Rao, Seasonal (monthly), plain
// report.slope      Sen's slope per year and per decade, with a 95% interval
// report.lowPower, report.coverage, report.notes
```
In the app it runs through `packages/stats/src/worker.ts`, so the globe never stalls.

**What it does**
1. Puts the series on a regular grid; missing steps stay missing.
2. Monthly data: removes the seasonal cycle without distorting the trend.
3. Headline: Mann-Kendall with a lag-1 autocorrelation correction.
4. Cross-checks: Hamed-Rao modified Mann-Kendall, Seasonal Mann-Kendall (monthly), plain Mann-Kendall.
5. Sen's slope against real time, with a 95% interval widened by the same correction.
6. Notes for gaps, short records, cumulative and rate series, and disagreement between tests.

**Why the correction matters.** Climate series are autocorrelated: this month resembles last month. The plain test then finds "significant" trends in pure noise. Measured on 1,000 simulated series per row, with no real trend:

| Noise autocorrelation | Plain Mann-Kendall | App headline |
|---|---|---|
| None | 3-5% | 3-5% |
| Moderate (0.3) | about 14% | 5-8% |
| Strong (0.6) | about 30% | 4-9% |
| Very strong (0.8) | about 50% | 4-10% |

The price is power: with 50 annual points and strong autocorrelation, the headline test finds a real trend 35% of the time where the plain test finds it 73% of the time. That is the honest cost of not raising false alarms, and it is why short annual records are flagged "low power". The full table, including interval coverage, is in `packages/stats/test/simulation-results.md`. Put it on a slide.

**Proof it is right**
- `golden.test.ts`: 40,000+ checks on 1,000 series against `pymannkendall` and `scipy`; worst relative error about 3e-14.
- `analyze.test.ts`: end-to-end checks with a gap, a range filter and a no-trend series.
- `simulate.ts`: the error-rate table above.

**Still to build (stats-lead, milestone M5)**
- Compare test: difference of Sen's slopes between two regions by moving-block bootstrap
- Two-variable view: correlation on raw and on detrended series, with effective sample size
- Sensitivity of loss rate to temperature (per ice sheet) with HAC errors
- Monte Carlo propagation of source 1-sigma
- "Years until significant" estimate
- Benchmarks against published rates once real data is in

## 10. Globe technique (Cesium)

- **Viewer:** `baseLayer: false`, `baseLayerPicker: false`, `geocoder: false`, `requestRenderMode: true`, `scene3DOnly: true`. No ion token.
- **Base map:** NASA GIBS WMTS, `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/`, with `GeographicTilingScheme`. Use a static layer such as Blue Marble.
- **Data layer:** one `Primitive` from a `RectangleGeometry` covering the layer's bounding box, with an `EllipsoidSurfaceAppearance` and a custom Fabric `Material`.
  - Uniforms: two atlas textures, the UV rectangles of the current and next frame, a cross-fade factor, the colormap texture, scale, offset, value range, opacity.
  - Shader: decode both frames, mix, normalize, look up the colormap, set alpha from the valid mask.
  - Sample data textures with NEAREST filtering.
- **Atlases:** many frames packed into one 4096x4096 PNG. Scrubbing changes uniforms only; nothing is uploaded.
- **Decoding:** `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })` in a worker.
- **Render on demand:** call `scene.requestRender()` after each uniform change.
- **Outlines and picking:** `GeoJsonDataSource` from TopoJSON; `scene.pick` returns the region id; `camera.flyTo` frames it.
- **React:** create the Viewer once behind a ref guard, destroy it on cleanup, keep Cesium objects out of React state.

## 11. Pitfalls

1. **Cesium + Vite:** copy `Build/Cesium/{Workers,ThirdParty,Assets,Widgets}` to `public/cesium` and define `CESIUM_BASE_URL`. A postinstall copy script is the most robust way.
2. **Cesium ion:** if the Viewer options above are not set, it calls `api.cesium.com` at startup. Check the network tab.
3. **React StrictMode** runs effects twice in development: guard Viewer creation.
4. **16-bit PNGs** are reduced to 8 bits by browsers: pack the value into R and G.
5. **Linear filtering** on packed data mixes the bytes into garbage: use NEAREST.
6. **shadcn on Base UI:** `asChild` becomes `render`; old Radix snippets will not paste in cleanly.
7. **Tailwind v4:** no `tailwind.config.js`; use `@theme` in CSS.
8. **xESMF does not install on Windows.** Our grids are regular; use `xarray.coarsen` or `rioxarray.reproject`. Use WSL2 if a tool needs Linux.
9. **Polar means:** a plain mean over latitude and longitude cells is wrong near the poles. Weight by cell area.
10. **ECharts SVG export** needs the SVG renderer: build a hidden SVG instance for export; PNG works from canvas.
11. **Glass blur over WebGL** costs GPU every frame the globe draws. Render on demand keeps it idle.
12. **Node type stripping:** `packages/stats` tests run directly with `node file.ts` on Node 22.18 or later.

## 12. Hosting

- **App and small data:** Cloudflare Pages. Limits on the free plan: 25 MiB per file, 20,000 files.
- **Atlases and large files:** Cloudflare R2 (10 GB free, no egress fees), public bucket with CORS.
- **No server.** If `apps/api` is ever deployed, the app must still work with it switched off.

## 13. Claude Code setup

### 13.1 Repository layout
```
.claude/agents/          six subagents (below)
.claude/skills/          project skills (below)
CLAUDE.md
apps/web/                React app
apps/api/                optional FastAPI cross-check
packages/stats/          Mann-Kendall engine (built)
packages/contract/       JSON Schemas for the data contract
pipeline/                Python: download, process, synthetic, validate
pipeline/stats/          Python stats reference
data/public/             contract files
docs/                    this file, COMPETITION_CONTEXT.md, datasets/, stats/, copy/
```

### 13.2 Agents (in `.claude/agents/`)
| Agent | Job | Edits |
|---|---|---|
| `data-scout` | Verifies each dataset and writes a card in `docs/datasets/` | docs only |
| `pipeline-engineer` | Downloads, processes, builds synthetic data, validates the contract | `pipeline/`, `data/public/` |
| `stats-lead` | Owns the Mann-Kendall engine, decides methods, reviews stats and wording | `packages/stats/`, `pipeline/stats/`, `docs/stats/` |
| `globe-engineer` | Cesium globe, shader, outlines, time scroller | `apps/web/src/globe/` |
| `science-writer` | Variable descriptions, verdict and note text, demo scripts | `apps/web/src/content/`, `docs/copy/` |
| `ui-qa` | Tests the running app in a browser with Playwright | read-only |

Panels, drawers and charts are built in the main conversation, where design back-and-forth is easier.

### 13.3 Skills needed (`.claude/skills/<name>/SKILL.md`)
Three agents preload skills. If a skill is missing, the agent runs without it and gives no warning, so write these in milestone M0.

| Skill | Preloaded by | What its SKILL.md must contain |
|---|---|---|
| `data-contract` | pipeline-engineer, globe-engineer | Section 8 of this file in full; the PNG packing rule; region and variable ids; how to run the validator; one valid example of each file |
| `cesium-data-layer` | globe-engineer | Section 10 in full; Viewer options; the StrictMode-safe lifecycle; the GLSL material source; atlas UV maths; the GIBS provider config; the render-on-demand rule |
| `glass-ui` | ui-qa (and the main conversation) | The glass tokens from section 7; panel anatomy; pointer-events rule; contrast rule; reduced-motion and solid fallbacks; phone layout |
| `chart-export` (optional) | main conversation | ECharts option builders per chart type; interval band; trend equation and p-value annotation; hidden SVG instance for export; CSV writer |
| `earthdata-pipeline` (optional) | run by hand with `/earthdata-pipeline` | Download recipe per product; area-weighted polar means; mm to Gt conversion; atlas baking. Set `disable-model-invocation: true` because it downloads data |

SKILL.md format: YAML frontmatter with `name` and `description` (the description says what it does and when to use it), then short instructions. Put long reference text in sibling files.

`stats-lead` needs no skill: its rules are in the agent file and the engine's tests.

### 13.4 Plugins and MCP servers
```
/plugin install frontend-design@claude-plugins-official
claude mcp add playwright -- npx -y @playwright/mcp@latest
claude mcp add context7 -- npx -y @upstash/context7-mcp
pnpm dlx shadcn@latest mcp init --client claude
```
- `frontend-design`: better visual design for the panels.
- Playwright: lets Claude see and test the running app (`ui-qa` also declares it for itself).
- Context7: current library docs, important because Cesium, Vite, Tailwind and shadcn all changed recently.
- shadcn MCP: correct component code for the installed version.

### 13.5 CLAUDE.md (root, keep under about 150 lines)
- One paragraph on the product, linking to both docs.
- The repository map above.
- Commands: `pnpm dev`, `pnpm build`, `pnpm test`, `node packages/stats/test/golden.test.ts`, `uv run python -m pipeline build --synthetic`, `uv run python -m pipeline validate`.
- Hard rules:
  - Every trend analysis goes through `analyzeTrend()` in `packages/stats`. Do not add another statistics path.
  - Every data file follows the data contract and passes the validator.
  - Never call Cesium ion. Never keep Cesium objects in React state.
  - The deployed app has no backend.
  - Never state a cause from a correlation. Never say warm air melts Antarctica.
  - Show the true record length of every variable.
- The pinned versions.

### 13.6 Working loop per milestone
1. Plan mode (Shift+Tab): Claude proposes the steps; you approve.
2. Build, in the main conversation or with the owning agent.
3. `stats-lead` reviews anything statistical; `ui-qa` tests anything visible.
4. Commit.

### 13.7 First prompt for Claude Code
> Read `docs/COMPETITION_CONTEXT.md` and `docs/TECH_BUILD_PLAN.md`. We are at milestone M0. Enter plan mode and propose the steps for M0 only, including the three required skills in section 13.3. Do not write code until I approve the plan.

## 14. Milestones

Each milestone ends with its acceptance check passing.

| # | Milestone | Owner | Done when |
|---|---|---|---|
| M0 | Scaffold: pnpm workspace, Vite + React + Tailwind + shadcn, `uv` Python project, CLAUDE.md, the three required skills, `packages/stats` wired in as `@trend/stats` | main | `pnpm build` passes; `node packages/stats/test/golden.test.ts` passes; agents load |
| M1 | Dataset cards for every source | data-scout | A card per dataset in `docs/datasets/`, each with verified coverage and access |
| M2 | Data contract schemas and synthetic generator | pipeline-engineer | Validator passes; `analyzeTrend()` recovers each injected slope inside its interval |
| M3 | Globe: Cesium without ion, GIBS base map, polar presets, atlas material, legend | globe-engineer | No `api.cesium.com` requests; both poles render cleanly; smooth on a desktop GPU |
| M4 | Time scroller and map modes | globe-engineer | Scrubbing the full record uploads no textures; no-data spans are drawn |
| M5 | Stats additions: compare test, two-variable analysis, sensitivity, uncertainty propagation | stats-lead | Each has a Python reference and a passing parity test; `decisions.md` updated |
| M6 | Panels: drawers, variable and region pickers, time range, Run analysis, right drawer | main | Globe stays interactive with every drawer open; keyboard-only use works |
| M7 | Charts and export | main | Every chart type renders with full annotation; PNG, SVG and CSV downloads open correctly |
| M8 | Compare mode: two regions, and two to four variables | main + stats-lead | Difference verdict shown; multi-variable chart states its normalization |
| M9 | Science text and Describe popups | science-writer | Every variable has its text and video; stats-lead finds no wording blockers |
| M10 | Real data | pipeline-engineer | Validator passes with `synthetic: false`; computed rates agree with published values |
| M11 | Polish, QA, deploy | ui-qa + main | Full `ui-qa` checklist passes; cold load shows the globe in under 4 seconds |

**If time runs short, cut in this order:** vegetation and urban, ice extent, the multi-variable view, sea level. Ice mass and temperature for both ice sheets, with the compare verdict, is a complete entry.

## 15. Hackathon rebuild plan

- Fresh repository at kickoff. Bring data products, both docs, designs, text and videos. Rebuild the code from the runbook.
- Write the runbook while building version 1: setup commands, step order, every problem hit and its fix.
- One timed rehearsal of M0 to M7 for ice mass before the event. If it takes more than 15 hours, cut scope.
- Order during the event: M0, M2 (synthetic), M3, M6, M7 for ice mass; then compare; then temperature; then real data; then the rest.
- Feature freeze 10 hours before the deadline. Record the video 8 hours before. Submit 2 hours early.

## 16. Open items

- [ ] Confirm whether an Antarctic ice extent or ice shelf product exists to pair with NSIDC-0793
- [ ] Choose the primary temperature product: MERRA-2 (1980 onward, NASA) or GISTEMP; decide whether ERA5 is shown
- [ ] Decide whether to join JPL_RECON_GMSL ice contributions to IMBIE for a longer mass record, or show them as separate series
- [ ] Re-check every package version when scaffolding
- [ ] Confirm the IMBIE file format and time step
- [ ] Team research on the statistics may change choices in `stats-lead.md`; update `docs/stats/decisions.md` when it does

## Sources
- [IMBIE AR6 dataset record](https://data-search.nerc.ac.uk/geonetwork/srv/api/records/GB_NERC_BAS_PDC_01477)
- [ITS_LIVE Greenland ice sheet extent masks, NSIDC-0793](https://nsidc.org/data/nsidc-0793)
- [Reconstructed Global Mean Sea Level 1900-2018](https://podaac.jpl.nasa.gov/dataset/JPL_RECON_GMSL)
- [ERA5 single levels](https://cds.climate.copernicus.eu/datasets/reanalysis-era5-single-levels)
- [NASA Sea Level Change portal](https://sealevel.nasa.gov/)
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents.md)
- [Claude Code skills](https://code.claude.com/docs/en/skills)
