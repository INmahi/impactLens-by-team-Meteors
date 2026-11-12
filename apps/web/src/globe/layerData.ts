// Map-layer data helpers shared by the Cesium data layer and the React overlays (legend,
// watermark, debug controls). Plain JSON and strings only; no Cesium objects.
//
// A layer is a folder in data/public named by some variable's `mapMode`, holding
// manifest.json, colormap.png and frames/atlas-NNN.png (data-contract skill).
import type { Frame, Manifest, Variable } from '@trend/contract'
import { paths } from '@trend/contract'
import { dataUrl, loadManifest, loadVariables } from '@/lib/data'

const manifestCache = new Map<string, Promise<Manifest>>()
let variablesCache: Promise<Variable[]> | null = null

/** manifest.json of a layer, fetched once per page (a failed load can be retried). */
export function getManifest(layer: string): Promise<Manifest> {
  let p = manifestCache.get(layer)
  if (!p) {
    p = loadManifest(layer)
    manifestCache.set(layer, p)
    p.catch(() => manifestCache.delete(layer))
  }
  return p
}

/** variables.json, fetched once per page. */
export function getVariables(): Promise<Variable[]> {
  if (!variablesCache) {
    variablesCache = loadVariables()
    variablesCache.catch(() => {
      variablesCache = null
    })
  }
  return variablesCache
}

export const colormapUrl = (layer: string) => dataUrl(paths.colormap(layer))
export const atlasUrl = (layer: string, file: string) => dataUrl(`${layer}/${file}`)

/** One step of a layer's timeline. `frame` is null for a date listed in `manifest.missing`. */
export interface TimelineStep {
  date: string
  frame: Frame | null
}

const timelines = new WeakMap<Manifest, TimelineStep[]>()

/**
 * The layer's dates in order: every frame date plus every `missing` date. The store's
 * `frameIndex` indexes this list, so a missing date is a real step (the layer hides there)
 * rather than being skipped.
 */
export function layerTimeline(manifest: Manifest): TimelineStep[] {
  let steps = timelines.get(manifest)
  if (!steps) {
    const byDate = new Map<string, Frame | null>()
    for (const d of manifest.missing) byDate.set(d, null)
    for (const f of manifest.frames) byDate.set(f.date, f)
    // YYYY-MM and YYYY both sort correctly as strings.
    steps = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, frame]) => ({ date, frame }))
    timelines.set(manifest, steps)
  }
  return steps
}

/** Clamps a (possibly fractional) frame index into the timeline. */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index) || length === 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

/** Distinct, non-null `mapMode` values in variables.json order. */
export function mapLayerIds(variables: Variable[]): string[] {
  const ids: string[] = []
  for (const v of variables) if (v.mapMode && !ids.includes(v.mapMode)) ids.push(v.mapMode)
  return ids
}

/**
 * The variable that names a layer: the variable whose id equals the layer id (for example
 * `temperature`), otherwise the first variable in variables.json whose `mapMode` is the layer
 * (map-only layers such as `ice_mass_map`). Null if no variable uses the layer.
 */
export function layerVariable(variables: Variable[], layer: string): Variable | null {
  return variables.find((v) => v.id === layer && v.mapMode === layer) ?? variables.find((v) => v.mapMode === layer) ?? null
}

/** True when anything describing the layer says it is synthetic: the manifest or a variable using it. */
export function layerIsSynthetic(manifest: Manifest | null, variables: Variable[] | null, layer: string | null): boolean {
  if (manifest?.synthetic) return true
  if (!variables || !layer) return false
  return variables.some((v) => v.mapMode === layer && v.synthetic)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** "2017-07" -> "Jul 2017" (long: "July 2017"); "2017" -> "2017". */
export function formatDate(date: string, long = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(date)
  if (!m) return date
  const month = Number(m[2]) - 1
  return `${(long ? MONTHS_LONG : MONTHS)[month] ?? m[2]} ${m[1]}`
}

/** Contract unit strings to display text. Unknown units pass through unchanged. */
export function formatUnits(units: string): string {
  switch (units) {
    case 'degC':
      return '°C'
    case 'km2':
      return 'km²'
    default:
      return units
  }
}

const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** Legend number: plain sign for negatives so screen readers say "minus". */
export function formatValue(value: number): string {
  return numberFormat.format(value)
}
