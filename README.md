# ImpactLens

**Team Meteors · NASA Space Apps Challenge 2026 · "Be an Earth System Trend Detective!"**

ImpactLens is an interactive 3D globe that lets anyone test whether a part of the Earth system is really changing, how fast, and how sure we can be, using NASA satellite data and honest statistics explained in plain words.

---

## The story

Ice is melting from Greenland to the Himalayas. That water raises the sea, and in low-lying countries like Bangladesh, coastal land is turning into water. The data that shows all of this is public, but it is hard to read: it comes as large scientific files, and the statistics behind a claim like "this is a real trend" (p-values, confidence intervals, autocorrelation) put most people off.

ImpactLens closes that gap. You pick a place and a time on a globe. The app runs a proper trend test on the data and answers in one clear sentence: what changed, how fast, how sure we are, and when the data simply cannot tell yet. A built-in AI assistant can set everything up from a plain question and explain the result.

## What it does

- **Explore on a 3D globe.** Click a region or search for one: ice sheets, glacier regions, coastal seas, countries, divisions and districts. Hovering highlights the region. Animated map layers show change over time; melting areas glow yellow to red.
- **Test a trend in three steps.** Choose a variable, a region and a time range, then run the analysis. The result gives:
  - a plain-language verdict ("rose by about 3.17 mm/yr" or "cannot tell yet");
  - the rate of change with its **95% confidence interval**;
  - the **p-value** and number of data points;
  - a warning when the record is too short to detect a trend reliably (low power), with an estimate of how many years would be needed.
- **Compare.** Put two regions side by side for the same variable (for example, two Bangladesh divisions), or up to three variables in one region.
- **Zoomable charts.** Time series with the trend line, anomalies and annual change. Charts zoom and pan and export as PNG or SVG.
- **Data honesty everywhere.** Every result shows the dataset used (name, version, DOI), the record length, how many values are missing, what was done to the data, and its known limits. Nothing is padded, gap-filled or extrapolated.
- **AI assistant.** Ask "Are the Himalayan glaciers losing ice?" and it picks the variable, region and dates, runs the app's own analysis and explains it. It never computes or invents numbers: every number it quotes comes from the app's statistics engine. After a manual run it offers a plain-language summary.
- **Import your own data.** Choose a variable and see the exact file format it needs (columns, date format, units, example rows, downloadable template). Then select a CSV or JSON file; it is checked in the browser and never uploaded.
- **Report download.** A self-contained HTML report of any result (chart, numbers, dataset and caveats) that prints cleanly to PDF.
- **Works offline.** The data, statistics and base map all run locally. Only the optional AI assistant needs internet.
- **Phone layout.** Bottom sheets and a compact header on small screens.

## Variables and regions

| Variable | Regions | Record |
|---|---|---|
| Ice mass (IMBIE) and ice mass change rate | Greenland; Antarctica, plus West, East and the Peninsula | 1971/1979–2023 |
| Ice mass from gravity (GRACE/GRACE-FO) | Greenland, Antarctica, Himalayas | 2002–2026, monthly |
| Ice extent | Greenland | 1972–2022 |
| Summer air temperature (anomaly) | Greenland, Antarctica, Himalayas | 1980–2026 |
| Sea level | Global; Bay of Bengal, Gulf of Mexico, US Atlantic coast, Western tropical Pacific, North Sea, Mediterranean | 1992–2026, monthly |
| Long sea level and ice records | Global; Greenland, Antarctica | 1900–2018 |
| Monsoon rainfall (June–September) | Bangladesh, 8 divisions, 64 districts | 1998–2025 |
| Coastal land turned to water | Bangladesh, 3 coastal divisions, 12 sea-facing districts | 1988–2021 |

## NASA and partner data

| Dataset | Used for | Link |
|---|---|---|
| GRACE/GRACE-FO JPL Mascons RL06.3Mv04 CRI (PO.DAAC) | Ice mass from gravity; ice-loss map layer | https://doi.org/10.5067/TEMSC-3JC634 |
| NASA-SSH Simple Gridded Sea Surface Height V1.1 (PO.DAAC) | Global and regional sea level | https://doi.org/10.5067/NSREF-SG0V11 |
| JPL_RECON_GMSL v1.0 (PO.DAAC; Frederikse et al. 2020) | Long sea level and ice contribution records since 1900 | https://doi.org/10.5067/GMSLT-FJPL1 |
| MERRA-2 M2TMNXSLV v5.12.4 (GES DISC) | Summer air temperature; temperature map layer | https://doi.org/10.5067/AP1B0BA5PD2K |
| GPM IMERG Final Monthly V07 (GES DISC) | Bangladesh monsoon rainfall | https://doi.org/10.5067/GPM/IMERG/3B-MONTH/07 |
| ITS_LIVE Greenland ice extent masks, NSIDC-0793 v1 | Greenland ice extent | https://doi.org/10.5067/579TO87M7IZB |
| Landsat (NASA/USGS) via JRC Global Surface Water | Land turned to permanent water since 1988 (Bangladesh coast) | https://global-surface-water.appspot.com/ |
| NASA GIBS, Blue Marble | Globe base map (stored for offline use) | https://nasa-gibs.github.io/gibs-api-docs/ |
| IMBIE 2026 (ESA–NASA Ice Sheet Mass Balance Inter-comparison Exercise) | Reconciled ice sheet mass, Greenland and Antarctica | https://doi.org/10.5285/128c5e33-5224-4197-82f0-19dcc95b80a0 |
| geoBoundaries, Bangladesh ADM2 (BBS/OCHA 2020) | Bangladesh division and district outlines | https://www.geoboundaries.org/ |
| Natural Earth | Coastlines and boundaries | https://www.naturalearthdata.com/ |

Two cross-checks support the processing:
- **GRACE versus IMBIE.** Greenland agrees closely: about −249 against −253 Gt/yr. Antarctica differs (about −131 against −184 Gt/yr) because of the glacial isostatic adjustment correction, and the app says so.
- **NASA-SSH versus NASA's global mean sea level indicator.** About 3.17 against 3.20 mm/yr.

## How the statistics work

All statistics run in the browser in a Web Worker (`packages/stats`). They are checked against a Python reference (`pipeline/stats`, using pymannkendall, SciPy and statsmodels) with golden test files.

- **Trend test:** Mann-Kendall with the Hamed & Rao (1998) correction for autocorrelation, so year-to-year persistence does not create false "significant" results.
- **Rate of change:** Sen's slope (Theil–Sen) with a 95% confidence interval.
- **Detectability:** the Weatherhead et al. (1998) estimate of how many years are needed to detect a trend of this size, given the noise and autocorrelation. Short or noisy records are flagged as low power.
- **Comparisons:** the difference between two regions' trends, with a moving-block bootstrap of residuals (block length after Politis & White 2004) that keeps the shared time structure.
- **Wording rules:** the app never says "no change" when a test is not significant; it says "cannot tell yet". A trend says what changed, not why.

## Running it

**Requirements:** Node.js 22.18 or newer, [pnpm](https://pnpm.io) and [uv](https://docs.astral.sh/uv) (Python 3.12).

```bash
pnpm install        # web app and stats engine
uv sync             # Python pipeline
```

**Data.** Downloading needs a free [NASA Earthdata login](https://urs.earthdata.nasa.gov/) saved in a `.netrc` file. See [docs/REAL_DATA.md](docs/REAL_DATA.md) for details.

```bash
uv run python scripts/download_real.py sea_level gmsl_indicator recon_gmsl grace itslive merra2 imerg
pnpm data:real      # process everything into data/public/ (about 35 minutes)
pnpm validate       # check every file against the data contract
pnpm basemap        # store the NASA GIBS base map for offline use
```

**Run the app.**

```bash
pnpm start          # production build, served at http://localhost:4173
pnpm dev            # development server at http://localhost:5173
pnpm test           # stats engine tests (run `pnpm golden` first)
```

**AI assistant (optional).** Open the assistant's settings in the app and paste an API key for [Groq](https://groq.com) (default model `openai/gpt-oss-120b`) or OpenRouter. The key is stored only in your browser. For local development you can put `VITE_LLM_API_KEY=...` in `apps/web/.env.local`; it is gitignored and only used by the development server, never by a production build.

## Project layout

```
apps/web/            React + Vite web app
  src/globe/         CesiumJS globe, data-layer shader, map modes, picking
  src/panels/        Left (inputs) and right (results) drawers, dialogs
  src/charts/        ECharts trend charts
  src/assistant/     AI assistant (tool calling: catalog, set inputs, run, result)
  src/lib/           Analysis runner, verdict wording, report export
packages/stats/      Trend engine (Mann-Kendall, Sen's slope, compare, detectability)
packages/contract/   Data contract: JSON schemas and TypeScript types
pipeline/            Python: ingest NASA datasets, build map atlases, validate
scripts/             Download, ingest, base map and region builders
docs/                Build plan, data notes, statistics decisions, dataset cards
```

**Data contract.** Data is written as plain JSON (series and precomputed stats) and PNG atlases (map frames packed into RGBA), described by `variables.json`, `regions.json` and per-layer manifests. The app only reads files, so it runs without a server or database.

## Built with

React, TypeScript, Vite, CesiumJS, Apache ECharts, Zustand, Tailwind CSS, shadcn/ui and Base UI, TopoJSON. Python pipeline: NumPy, xarray, rioxarray, regionmask, earthaccess, h5py, Pillow, SciPy, statsmodels, arch, pymannkendall. Geist font and Lucide icons.

## Use of AI

- **Claude Code (Anthropic):** our coding assistant for the web app, data pipeline, statistics engine, browser testing and documentation. The team reviewed and tested all of its work.
- **gpt-oss-120b via Groq:** the in-app assistant. It sees only the app's variable list and the results the app computes, and every number it quotes comes from the app's own analysis.

## References

**Methods**
- Mann (1945), Econometrica 13, 245–259. https://doi.org/10.2307/1907187
- Kendall (1975), *Rank Correlation Methods*.
- Sen (1968), JASA 63, 1379–1389. https://doi.org/10.1080/01621459.1968.10480934
- Hamed & Rao (1998), J. Hydrology 204, 182–196. https://doi.org/10.1016/S0022-1694(97)00125-X
- Yue et al. (2002), Hydrol. Processes 16, 1807–1829. https://doi.org/10.1002/hyp.1095
- Weatherhead et al. (1998), JGR 103, 17149–17161. https://doi.org/10.1029/98JD00995
- Politis & White (2004), Econometric Reviews 23, 53–70. https://doi.org/10.1081/ETC-120028836

**Data**
- Watkins et al. (2015), GRACE mascons. https://doi.org/10.1002/2014JB011547
- Gelaro et al. (2017), MERRA-2. https://doi.org/10.1175/JCLI-D-16-0758.1
- Frederikse et al. (2020), sea-level budget. https://doi.org/10.1038/s41586-020-2591-3
- Otosaka et al. (2023), IMBIE. https://doi.org/10.5194/essd-15-1597-2023
- Pekel et al. (2016), Global Surface Water. https://doi.org/10.1038/nature20584
- Runfola et al. (2020), geoBoundaries. https://doi.org/10.1371/journal.pone.0231866

**Software**
- Hussain & Mahmud (2019), pyMannKendall. https://doi.org/10.21105/joss.01556

## Team

**Team Meteors**: students passionate about geographical data and statistics, for the NASA Space Apps Challenge 2026.

NASA does not endorse this project. NASA data is used under NASA's open data policy; each dataset's citation is shown in the app's Data sources page.
