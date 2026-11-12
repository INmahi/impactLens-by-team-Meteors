// Map modes for the globe, all derived from variables.json (never a hard-coded id).
// Plain JSON, strings and numbers only; no Cesium objects. Shared by the engine (Cesium side)
// and the React overlays (picker, legend, time scroller).
//
// Two kinds of mode:
// - grid:    a gridded layer folder named by a variable's `mapMode` (manifest + atlases).
//            Mode id = the `mapMode` value, e.g. "ice_mass_map", "temperature".
// - outline: a variable with an `outlines` file (dated outlines, annual YYYY).
//            Mode id = the variable id, e.g. "ice_extent". If that id is already a grid
//            mode id, the outline mode id is `${variableId}${OUTLINE_SUFFIX}`.
// The store's `mapLayer` holds a mode id (or null for "None").
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Frequency, Manifest, Period, Variable } from '@trend/contract'
import { dataUrl } from '@/lib/data'
import { layerTimeline, layerVariable, mapLayerIds } from './layerData'
import { drawablePaths, toPolygons, type LonLat } from './regions'

export const OUTLINE_SUFFIX = '__outlines'

export interface GridMode {
  kind: 'grid'
  /** Layer folder = a variable's mapMode. */
  id: string
}

export interface OutlineMode {
  kind: 'outline'
  id: string
  /** The variable that owns the outlines file. */
  variable: string
  /** Path under data/public, from variables.json `outlines`. */
  outlines: string
  /** The variable's record and frequency: the outline mode's timeline. */
  period: Period
  frequency: Frequency
}

export type MapMode = GridMode | OutlineMode

/** Grid modes (distinct mapMode values, variables.json order), then outline modes. */
export function mapModes(variables: Variable[]): MapMode[] {
  const modes: MapMode[] = mapLayerIds(variables).map((id) => ({ kind: 'grid', id }))
  const taken = new Set(modes.map((m) => m.id))
  for (const v of variables) {
    if (!v.outlines) continue
    const id = taken.has(v.id) ? `${v.id}${OUTLINE_SUFFIX}` : v.id
    taken.add(id)
    modes.push({ kind: 'outline', id, variable: v.id, outlines: v.outlines, period: v.period, frequency: v.frequency })
  }
  return modes
}

/** The variable that names a mode (legend title, source). */
export function modeVariable(variables: Variable[], mode: MapMode): Variable | null {
  return mode.kind === 'grid' ? layerVariable(variables, mode.id) : (variables.find((v) => v.id === mode.variable) ?? null)
}

/** Display name of a mode: manifest `name` when given, else its variable's name, else the id. */
export function modeLabel(variables: Variable[] | null, mode: MapMode, manifest?: Manifest | null): string {
  if (mode.kind === 'grid' && manifest?.name) return manifest.name
  return (variables && modeVariable(variables, mode)?.name) ?? mode.id
}

/** A variable has a map when it has a gridded layer or dated outlines. */
export function variableHasMap(v: Variable): boolean {
  return !!v.mapMode || !!v.outlines
}

/** The selected variable when it has no map (e.g. sea level), otherwise null. */
export function variableWithoutMap(variables: Variable[], variableId: string | null): Variable | null {
  const v = variableId ? variables.find((x) => x.id === variableId) : undefined
  return v && !variableHasMap(v) ? v : null
}

/**
 * The mode drawn on the globe: the store's `mapLayer`, unless the selected variable has no
 * map (then nothing is drawn and the UI says so). Unknown ids resolve to null.
 */
export function resolveMapMode(
  modes: MapMode[],
  variables: Variable[],
  mapLayer: string | null,
  variableId: string | null,
): MapMode | null {
  if (variableWithoutMap(variables, variableId)) return null
  return modes.find((m) => m.id === mapLayer) ?? null
}

/** The mode id that shows a variable (its mapMode, else its outline mode), or null. */
export function mapModeForVariable(modes: MapMode[], variable: Variable): string | null {
  if (variable.mapMode && modes.some((m) => m.id === variable.mapMode)) return variable.mapMode
  return modes.find((m) => m.kind === 'outline' && m.variable === variable.id)?.id ?? null
}

/** True when the selected variable is the one a mode shows (so the scroller spans its record). */
export function modeShowsVariable(mode: MapMode, variable: Variable): boolean {
  return mode.kind === 'grid' ? variable.mapMode === mode.id : mode.variable === variable.id
}

// --- Dates -------------------------------------------------------------------------------

/** Month number (year * 12 + month - 1) of the first month a date covers. */
export function monthNumber(date: string): number {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(date)
  if (!m) return NaN
  return Number(m[1]) * 12 + (m[2] ? Number(m[2]) - 1 : 0)
}

/** [first month, end month) covered by a date: one month for YYYY-MM, twelve for YYYY. */
export function dateSpan(date: string): [number, number] {
  const start = monthNumber(date)
  return [start, start + (date.length === 4 ? 12 : 1)]
}

export function yearOf(date: string): string {
  return date.slice(0, 4)
}

/** Every date of a period at a frequency, inclusive. */
export function datesInPeriod(period: Period, frequency: Frequency): string[] {
  const out: string[] = []
  if (frequency === 'annual') {
    for (let y = Number(yearOf(period[0])); y <= Number(yearOf(period[1])); y++) out.push(String(y))
    return out
  }
  const a = monthNumber(period[0].length === 4 ? `${period[0]}-01` : period[0])
  const b = monthNumber(period[1].length === 4 ? `${period[1]}-12` : period[1])
  for (let n = a; n <= b; n++) out.push(`${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, '0')}`)
  return out
}

// --- Timelines -----------------------------------------------------------------------------

/** One step of a mode's timeline. The store's `frameIndex` indexes the list. */
export interface ModeStep {
  date: string
  hasData: boolean
}

const gridStepsCache = new WeakMap<Manifest, ModeStep[]>()

/** Grid mode: every frame date plus every `missing` date (missing = no data). */
export function gridSteps(manifest: Manifest): ModeStep[] {
  let steps = gridStepsCache.get(manifest)
  if (!steps) {
    steps = layerTimeline(manifest).map((s) => ({ date: s.date, hasData: s.frame !== null }))
    gridStepsCache.set(manifest, steps)
  }
  return steps
}

const outlineStepsCache = new WeakMap<OutlinesData, Map<string, ModeStep[]>>()

/**
 * Outline mode: the variable's record at its own frequency. Outlines are annual, so a monthly
 * step shows the outline of its year; a year with no outline is a no-data step.
 */
export function outlineSteps(mode: OutlineMode, outlines: OutlinesData): ModeStep[] {
  let byKey = outlineStepsCache.get(outlines)
  if (!byKey) outlineStepsCache.set(outlines, (byKey = new Map()))
  const key = `${mode.period[0]}|${mode.period[1]}|${mode.frequency}`
  let steps = byKey.get(key)
  if (!steps) {
    steps = datesInPeriod(mode.period, mode.frequency).map((date) => ({ date, hasData: outlines.byYear.has(yearOf(date)) }))
    byKey.set(key, steps)
  }
  return steps
}

// --- Dated outlines (outlines.topo.json) ----------------------------------------------------

export interface OutlinePath {
  region: string
  path: LonLat[]
}

export interface OutlinesData {
  /** Year (YYYY) -> drawable paths of every region's outline for that year. */
  byYear: Map<string, OutlinePath[]>
  /** Years with an outline, ascending. */
  years: string[]
  /** Region -> its earliest outline year (the ghost drawn for comparison). */
  earliestByRegion: Map<string, string>
}

const outlinesCache = new Map<string, Promise<OutlinesData>>()

/** Loads and parses a variable's outlines file once per page. */
export function getOutlines(path: string): Promise<OutlinesData> {
  let p = outlinesCache.get(path)
  if (!p) {
    p = fetch(dataUrl(path))
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${path}: HTTP ${res.status}`)
        return res.json() as Promise<Topology>
      })
      .then(parseOutlines)
    outlinesCache.set(path, p)
    p.catch(() => outlinesCache.delete(path))
  }
  return p
}

function parseOutlines(topo: Topology): OutlinesData {
  const object = topo.objects.outlines as GeometryCollection | undefined
  const features = object ? feature(topo, object).features : []
  const byYear = new Map<string, OutlinePath[]>()
  const earliestByRegion = new Map<string, string>()
  for (const f of features) {
    const props = (f.properties ?? {}) as { region?: string; date?: string }
    if (!props.date) continue
    const year = yearOf(String(props.date))
    const region = String(props.region ?? '')
    const paths = toPolygons(f.geometry).flatMap((poly) => poly.flatMap(drawablePaths))
    if (paths.length === 0) continue
    const list = byYear.get(year) ?? []
    for (const path of paths) list.push({ region, path })
    byYear.set(year, list)
    const prev = earliestByRegion.get(region)
    if (!prev || year < prev) earliestByRegion.set(region, year)
  }
  const years = [...byYear.keys()].sort()
  return { byYear, years, earliestByRegion }
}

/** The ghost paths: each region's earliest outline. */
export function ghostPaths(outlines: OutlinesData): OutlinePath[] {
  const out: OutlinePath[] = []
  for (const [region, year] of outlines.earliestByRegion) {
    for (const p of outlines.byYear.get(year) ?? []) if (p.region === region) out.push(p)
  }
  return out
}

/** Earliest outline year over all regions (legend text). */
export function earliestOutlineYear(outlines: OutlinesData): string | null {
  return outlines.years[0] ?? null
}

/** Outline line colours, shared by the Cesium layer and the legend (CSS colour strings). */
export const OUTLINE_STYLE = {
  current: { css: '#f472b6', alpha: 1, width: 3.5 },
  ghost: { css: '#f8fafc', alpha: 0.9, width: 1.5, dashPx: 12 },
} as const
