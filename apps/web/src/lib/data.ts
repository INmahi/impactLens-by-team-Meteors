// Loads data-contract files served at /data (see repoStatic in vite.config.ts).
// Types come from @trend/contract; paths from its `paths` helper.
import type { Topology } from 'topojson-specification'
import { paths, type Manifest, type Region, type Series, type StatsFile, type Variable } from '@trend/contract'

export const DATA_BASE = '/data/'

export function dataUrl(rel: string): string {
  return DATA_BASE + rel
}

async function getJson<T>(rel: string): Promise<T> {
  const res = await fetch(dataUrl(rel))
  if (!res.ok) throw new Error(`Failed to load ${rel}: HTTP ${res.status}`)
  return (await res.json()) as T
}

export const loadVariables = () => getJson<Variable[]>(paths.variables)
export const loadRegions = () => getJson<Region[]>(paths.regions)
export const loadRegionsTopo = () => getJson<Topology>(paths.regionsTopo)
export const loadSeries = (variable: string, region: string) => getJson<Series>(paths.series(variable, region))
export const loadStats = (variable: string, region: string) => getJson<StatsFile>(paths.stats(variable, region))
export const loadManifest = (layer: string) => getJson<Manifest>(paths.manifest(layer))
