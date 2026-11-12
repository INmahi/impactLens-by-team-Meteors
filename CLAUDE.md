# Trend Detective

NASA Space Apps 2026 entry for the "Earth System Trend Detective" challenge. A web app with a 3D globe where users pick an ice sheet, temperature or sea level variable, a region (Greenland, Antarctica or its sub-regions, or global for sea level) and a time range, and get a Mann-Kendall trend test, Sen's slope with a 95% interval and a plain-English verdict. Two regions or several variables can be compared.

- Challenge, judging and decisions: `docs/COMPETITION_CONTEXT.md`
- Spec, data contract, milestones and agent workflow: `docs/TECH_BUILD_PLAN.md`

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
uv run pytest pipeline/tests -q
```
Node 22.18 or later. Python 3.12 or later with `uv`.

## Hard rules (everyone, including subagents)
- Every trend analysis goes through `analyzeTrend()` in `packages/stats`, run in the app through `packages/stats/src/worker.ts`. Never add a second statistics path.
- Every data file follows the data contract and passes the validator.
- The deployed app has no backend. Everything it needs is static files.
- Never call Cesium ion. Never keep Cesium objects in React state.
- Show the true record length of every variable. Never pad or extrapolate a series.
- Never state a cause from a correlation. Never say warm air is melting Antarctica.
- Sea level is global only. Never imply a local value.
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
| M3 Globe | Next | globe-engineer |

Open follow-ups:
- stats-lead: `packages/stats/package.json` `golden` script calls bare `python` (not on PATH here); use root `pnpm golden`. The usage comment in `src/worker.ts` uses `new URL('@trend/stats/worker', ...)`, which Vite does not resolve; the app uses `import StatsWorker from '@trend/stats/worker?worker'` (`apps/web/src/lib/stats.ts`).
- `lowPower` (engine: under 30 years or under 30 points) never fires on full records, which are all 45+ years. It only appears when the user picks a short time range; the UI and demo must show that case. temperature/antarctica is the realistic hard case (about 19% power).
- Synthetic data is not physically consistent: maps and series are independent, Antarctic sub-regions do not add up, ice_mass and ice_mass_rate are independent.
- Extensible glacier regions (decided 2026-11-12): M2 validator and generator must accept any region listed in `regions.json`; M3/M6 must build pickers, outlines and camera presets from it. Candidate future sources for mountain glaciers: GRACE mascons (already carded) and a glacier mass change product per RGI region; data-scout to card one when we add a region.
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
| shadcn CLI / style | 4.23.0 / `base-nova` | Base UI primitives (`@base-ui/react` 1.9); `render` prop, not `asChild`; `cn` comes from the `cn` package |
| numpy, scipy | 2.5.4, 1.18.1 | |
| pymannkendall | 1.4.3 | Reference only (`stats` group) |
| statsmodels, arch | 0.15.0, 8.0.0 | `stats` group |
| xarray, rioxarray, regionmask | 2026.9.0, 0.23.0, 0.13.0 | |
| earthaccess, cdsapi | 0.19.0, 0.7.7 | |
| pytest, jsonschema | 9.2.0, 4.26.0 | `dev` group |
