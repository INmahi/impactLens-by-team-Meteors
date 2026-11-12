// Small cached loaders for the panels. Each file is fetched once per session.
import { useEffect, useState } from 'react'
import type { Region, Series, Variable } from '@trend/contract'
import { loadRegions, loadSeries, loadVariables } from './data'

const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined
  if (!p) {
    p = load()
    p.catch(() => cache.delete(key)) // allow a retry after a failed fetch
    cache.set(key, p)
  }
  return p
}

export const getVariablesCached = () => cached('variables', loadVariables)
export const getRegionsCached = () => cached('regions', loadRegions)
export const getSeriesCached = (variable: string, region: string) =>
  cached(`series:${variable}:${region}`, () => loadSeries(variable, region))

function useAsync<T>(get: (() => Promise<T>) | null, deps: unknown[]): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null })
  useEffect(() => {
    if (!get) {
      setState({ data: null, error: null })
      return
    }
    let alive = true
    get().then(
      (data) => alive && setState({ data, error: null }),
      (e: unknown) => alive && setState({ data: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return state
}

export const useVariablesData = () => useAsync<Variable[]>(getVariablesCached, [])
export const useRegionsData = () => useAsync<Region[]>(getRegionsCached, [])
export const useSeriesData = (variable: string | null, region: string | null) =>
  useAsync<Series>(variable && region ? () => getSeriesCached(variable, region) : null, [variable, region])

// ---------- dates ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Every date step from start to end inclusive, in the series' own format ("YYYY-MM" or "YYYY"). */
export function dateSteps(start: string, end: string): string[] {
  const monthly = start.length === 7
  const out: string[] = []
  if (!monthly) {
    for (let y = Number(start); y <= Number(end); y++) out.push(String(y))
    return out
  }
  let y = Number(start.slice(0, 4))
  let m = Number(start.slice(5, 7))
  const ey = Number(end.slice(0, 4))
  const em = Number(end.slice(5, 7))
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

export function formatStep(date: string, long = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(date)
  if (!m) return date
  return `${(long ? MONTHS_LONG : MONTHS)[Number(m[2]) - 1]} ${m[1]}`
}

/** Length in years between two steps, inclusive of both ends. */
export function spanYears(start: string, end: string): number {
  if (start.length === 7) return dateSteps(start, end).length / 12
  return Number(end) - Number(start) + 1
}

export function formatUnitsText(units: string): string {
  switch (units) {
    case 'degC':
      return '°C'
    case 'km2':
      return 'km²'
    default:
      return units
  }
}
