// Builds the ECharts option and the CSV rows for one chart type (plan section 4, "Bottom drawer").
// Chart types come from variables.json `chartTypes` (contract vocabulary). The trend line drawn here
// uses the Sen's slope from analyzeTrend(); its intercept (median of y - slope*t) is for drawing only,
// not a second statistic.
import type { Region, Series, Variable } from '@trend/contract'
import { formatP, type TrendReport } from '@trend/stats'
import { formatStep, formatUnitsText } from '@/lib/useData'
import { fmt, rateUnits } from '@/lib/verdict'

/** IMBIE / science text convention: about 362 Gt of grounded ice = 1 mm of global sea level. */
export const GT_PER_MM = 362

export const CHART_LABELS: Record<string, string> = {
  series: 'Time series and trend',
  anomaly: 'Anomaly',
  annual_change: 'Annual change',
  sea_level_equivalent: 'Sea-level equivalent',
  bar: 'Bars with uncertainty',
  running_mean: '5-year running mean',
  seasonal_cycle: 'Seasonal cycle',
  summer_series: 'Summer series',
  decade_means: 'Decade means',
  budget: 'Budget',
  compare_regions: 'Compare regions',
  together: 'Variables together',
}

export interface ChartInput {
  type: string
  variable: Variable
  region: Region
  series: Series
  report: TrendReport
  start: string
  end: string
  /** Global-mean series of the same variable, drawn alongside a coastal sea. */
  reference?: { region: Region; series: Series } | null
}

export interface ChartOutput {
  option: Record<string, unknown> | null
  /** Shown instead of a chart when this type cannot be drawn. */
  message?: string
  csv: { header: string[]; rows: (string | number | null)[][] }
  title: string
}

// ---------- helpers ----------

function toTime(d: string): number {
  if (d.length === 7) return Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 15)
  return Date.UTC(Number(d), 6, 1)
}
function toYear(d: string): number {
  return d.length === 7 ? Number(d.slice(0, 4)) + (Number(d.slice(5, 7)) - 0.5) / 12 : Number(d) + 0.5
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const inRange = (d: string, a: string, b: string) => d >= a && d <= b

interface Pts {
  dates: string[]
  values: (number | null)[]
  lower: (number | null)[] | null
  upper: (number | null)[] | null
}

function slice(series: Series, start: string, end: string): Pts {
  const idx = series.dates.map((d, i) => (inRange(d, start, end) ? i : -1)).filter((i) => i >= 0)
  const pick = <T,>(a: T[] | undefined) => (a ? idx.map((i) => a[i]) : null)
  const values = idx.map((i) => series.values[i])
  let lower = pick(series.lower)
  let upper = pick(series.upper)
  const sigma = pick(series.sigma)
  if (!lower && sigma) {
    lower = values.map((v, k) => (v == null || sigma[k] == null ? null : v - 1.96 * (sigma[k] as number)))
    upper = values.map((v, k) => (v == null || sigma[k] == null ? null : v + 1.96 * (sigma[k] as number)))
  }
  return { dates: idx.map((i) => series.dates[i]), values, lower, upper }
}

function annualMeans(p: Pts): Pts {
  if (p.dates[0]?.length !== 7) return p
  const by = new Map<string, number[]>()
  p.dates.forEach((d, i) => {
    const v = p.values[i]
    if (v == null) return
    const y = d.slice(0, 4)
    by.set(y, [...(by.get(y) ?? []), v])
  })
  const years = [...by.keys()].sort()
  return {
    dates: years,
    values: years.map((y) => {
      const xs = by.get(y)!
      return xs.length >= 9 ? xs.reduce((a, b) => a + b, 0) / xs.length : null // at least 9 months
    }),
    lower: null,
    upper: null,
  }
}

function removeSeasonal(p: Pts): Pts {
  const monthly = p.dates[0]?.length === 7
  const ok = p.values.filter((v): v is number => v != null)
  if (!monthly) {
    const mean = ok.reduce((a, b) => a + b, 0) / Math.max(1, ok.length)
    return { ...p, values: p.values.map((v) => (v == null ? null : v - mean)), lower: null, upper: null }
  }
  const clim = new Map<string, number[]>()
  p.dates.forEach((d, i) => {
    const v = p.values[i]
    if (v != null) clim.set(d.slice(5), [...(clim.get(d.slice(5)) ?? []), v])
  })
  const mean = new Map([...clim].map(([m, xs]) => [m, xs.reduce((a, b) => a + b, 0) / xs.length]))
  return { ...p, values: p.values.map((v, i) => (v == null ? null : v - (mean.get(p.dates[i].slice(5)) ?? 0))), lower: null, upper: null }
}

/** Sen's slope line through the median residual, over the analysed range (drawing only). */
function trendLine(p: Pts, slopePerYear: number): [number, number][] {
  const res: number[] = []
  p.dates.forEach((d, i) => {
    const v = p.values[i]
    if (v != null) res.push(v - slopePerYear * toYear(d))
  })
  if (!res.length) return []
  const b = median(res)
  // A point at every date (not just the ends) so the line survives zooming into a window.
  return p.dates.map((d) => [toTime(d), b + slopePerYear * toYear(d)])
}

const pair = (dates: string[], vals: (number | null)[]) => dates.map((d, i) => [toTime(d), vals[i]] as [number, number | null])

// ---------- option ----------

const AXIS = { axisLine: { lineStyle: { color: '#94a3b8' } }, axisLabel: { color: '#e2e8f0' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } } }

export function buildChart(input: ChartInput): ChartOutput {
  const { type, variable: v, region: r, series, report, start, end, reference } = input
  const units = formatUnitsText(v.units)
  const span = `${formatStep(start)} to ${formatStep(end)}`
  const title = `${v.name}, ${r.name}`
  const trendText = `Trend (Sen's slope): ${fmt(report.slope.perYear)} ${rateUnits(v)} (95% interval ${fmt(report.slope.lower)} to ${fmt(report.slope.upper)}), ${formatP(report.test.p)}`
  const source = `Source: ${v.source.name}${v.synthetic ? '   ·   SYNTHETIC DATA: not observations' : ''}`
  const raw = slice(series, start, end)

  let yName = units
  let pts: Pts = raw
  let kind: 'line' | 'bar' = 'line'
  let showTrend = true
  let subtitle = `${span}   ·   ${trendText}`

  switch (type) {
    case 'series':
      break
    case 'anomaly':
      pts = removeSeasonal(raw)
      yName = `${units} (anomaly)`
      subtitle = `${span}   ·   ${raw.dates[0]?.length === 7 ? 'Seasonal cycle removed' : 'Departure from the mean of this range'}   ·   ${trendText}`
      break
    case 'annual_change': {
      const a = annualMeans(raw)
      const diffs = a.values.map((x, i) => (i === 0 || x == null || a.values[i - 1] == null ? null : x - (a.values[i - 1] as number)))
      pts = { dates: a.dates.slice(1), values: diffs.slice(1), lower: null, upper: null }
      kind = 'bar'
      showTrend = false
      yName = `${units} per year`
      subtitle = `${span}   ·   Change from one year's mean to the next (years with at least 9 months)`
      break
    }
    case 'sea_level_equivalent':
      pts = {
        dates: raw.dates,
        values: raw.values.map((x) => (x == null ? null : -x / GT_PER_MM)),
        lower: raw.upper ? raw.upper.map((x) => (x == null ? null : -x / GT_PER_MM)) : null,
        upper: raw.lower ? raw.lower.map((x) => (x == null ? null : -x / GT_PER_MM)) : null,
      }
      yName = 'mm of global sea level'
      showTrend = false
      subtitle = `${span}   ·   Ice mass change as mm of global sea level (${GT_PER_MM} Gt = 1 mm), relative to the record's zero; positive = adds to sea level`
      break
    case 'bar':
      kind = 'bar'
      break
    case 'budget':
      return {
        option: null,
        title,
        message:
          'The budget view needs the components of sea level change (ice sheets, glaciers, ocean warming). They will be added with the real data.',
        csv: { header: [], rows: [] },
      }
    default:
      return { option: null, title, message: `Chart type "${type}" is not available yet.`, csv: { header: [], rows: [] } }
  }

  const seriesList: Record<string, unknown>[] = []
  const hasBand = !!(pts.lower && pts.upper)
  if (hasBand) {
    seriesList.push(
      { name: 'band-low', type: 'line', data: pair(pts.dates, pts.lower!), stack: 'band', stackStrategy: 'all', symbol: 'none', lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
      {
        name: '95% uncertainty',
        type: 'line',
        data: pts.dates.map((d, i) => [toTime(d), pts.upper![i] == null || pts.lower![i] == null ? null : (pts.upper![i] as number) - (pts.lower![i] as number)]),
        stack: 'band',
        stackStrategy: 'all',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color: 'rgba(125,211,252,0.22)' },
        itemStyle: { color: 'rgba(125,211,252,0.6)' },
        silent: true,
        tooltip: { show: false },
      },
    )
  }
  seriesList.push({
    name: r.name,
    type: kind,
    data: pair(pts.dates, pts.values),
    symbol: 'none',
    connectNulls: false,
    lineStyle: { width: 1.6, color: '#7dd3fc' },
    itemStyle: { color: '#7dd3fc' },
    barMaxWidth: 10,
  })
  if (showTrend) {
    const tl = trendLine(pts, report.slope.perYear)
    if (tl.length) seriesList.push({ name: "Trend (Sen's slope)", type: 'line', data: tl, symbol: 'none', lineStyle: { width: 2.2, color: '#fbbf24', type: 'solid' }, itemStyle: { color: '#fbbf24' } })
  }
  // Global mean alongside a coastal sea (series view only): compare trends, not levels.
  if (reference && (type === 'series' || type === 'anomaly')) {
    const ref0 = slice(reference.series, start, end)
    const ref = type === 'anomaly' ? removeSeasonal(ref0) : ref0
    seriesList.push({ name: reference.region.name, type: 'line', data: pair(ref.dates, ref.values), symbol: 'none', lineStyle: { width: 1.2, color: '#cbd5e1', type: 'dashed' }, itemStyle: { color: '#cbd5e1' } })
  }
  // Marks at joins between sources (segments after the first, inside the range).
  const joins = (series.segments ?? []).slice(1).map((s) => s.start).filter((d) => inRange(d, start, end))
  if (joins.length) {
    ;(seriesList[seriesList.length - 1] as Record<string, unknown>).markLine = {
      symbol: 'none',
      label: { formatter: 'Source changes', color: '#fde68a' },
      lineStyle: { color: '#fde68a', type: 'dotted' },
      data: joins.map((d) => ({ xAxis: toTime(d) })),
    }
  }

  const option = {
    backgroundColor: '#0b1220',
    animation: false,
    textStyle: { fontFamily: 'Geist, system-ui, sans-serif' },
    title: {
      text: `${title}: ${CHART_LABELS[type] ?? type}`,
      subtext: subtitle,
      left: 12,
      top: 8,
      textStyle: { color: '#f8fafc', fontSize: 14 },
      subtextStyle: { color: '#cbd5e1', fontSize: 11 },
    },
    legend: { bottom: 26, textStyle: { color: '#e2e8f0' }, data: seriesList.map((s) => s.name as string).filter((n) => !n.startsWith('band-')) },
    grid: { left: 64, right: 44, top: 88, bottom: 64 },
    tooltip: { trigger: 'axis', valueFormatter: (x: unknown) => (typeof x === 'number' ? fmt(x) : String(x)) },
    xAxis: { type: 'time', name: 'Year', nameLocation: 'end', nameGap: 8, nameTextStyle: { color: '#cbd5e1' }, ...AXIS },
    yAxis: { type: 'value', name: yName, nameGap: 14, nameTextStyle: { color: '#cbd5e1', align: 'left' }, scale: true, ...AXIS },
    graphic: [{ type: 'text', left: 12, bottom: 6, style: { text: source, fill: v.synthetic ? '#fcd34d' : '#cbd5e1', fontSize: 11 } }],
    series: seriesList,
  }

  const header = ['date', type === 'series' || type === 'bar' ? `${v.id} (${v.units})` : `${type} (${yName})`]
  if (hasBand) header.push('lower_95', 'upper_95')
  const rows = pts.dates.map((d, i) => {
    const row: (string | number | null)[] = [d, pts.values[i]]
    if (hasBand) row.push(pts.lower![i], pts.upper![i])
    return row
  })
  return { option, title, csv: { header, rows } }
}

export function toCsv(out: ChartOutput, meta: string[]): string {
  const esc = (x: string | number | null) => (x == null ? '' : /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x))
  return [...meta.map((m) => `# ${m}`), out.csv.header.join(','), ...out.csv.rows.map((r) => r.map(esc).join(','))].join('\n') + '\n'
}

// ---------- compare mode ----------

const PALETTE = ['#7dd3fc', '#fbbf24', '#f472b6', '#86efac']

function centred(p: Pts): Pts {
  const ok = p.values.filter((v): v is number => v != null)
  const m = ok.reduce((a, b) => a + b, 0) / Math.max(1, ok.length)
  return { ...p, values: p.values.map((v) => (v == null ? null : v - m)), lower: null, upper: null }
}

function baseOption(titleText: string, subtitle: string, yName: string, source: string, synthetic: boolean, seriesList: Record<string, unknown>[]) {
  return {
    backgroundColor: '#0b1220',
    animation: false,
    textStyle: { fontFamily: 'Geist, system-ui, sans-serif' },
    title: { text: titleText, subtext: subtitle, left: 12, top: 8, textStyle: { color: '#f8fafc', fontSize: 14 }, subtextStyle: { color: '#cbd5e1', fontSize: 11 } },
    legend: { bottom: 26, textStyle: { color: '#e2e8f0' } },
    grid: { left: 64, right: 44, top: 88, bottom: 64 },
    tooltip: { trigger: 'axis', valueFormatter: (x: unknown) => (typeof x === 'number' ? fmt(x) : String(x)) },
    xAxis: { type: 'time', name: 'Year', nameLocation: 'end', nameGap: 8, nameTextStyle: { color: '#cbd5e1' }, ...AXIS },
    yAxis: { type: 'value', name: yName, nameGap: 14, nameTextStyle: { color: '#cbd5e1', align: 'left' }, scale: true, ...AXIS },
    graphic: [{ type: 'text', left: 12, bottom: 6, style: { text: source, fill: synthetic ? '#fcd34d' : '#cbd5e1', fontSize: 11 } }],
    series: seriesList,
  }
}

/** Two regions on their common period, each relative to its own mean: trends are compared, not levels. */
export function buildCompareChart(input: {
  variable: Variable
  A: Region
  B: Region
  seriesA: Series
  seriesB: Series
  rep: import('@trend/stats').CompareReport
}): ChartOutput {
  const { variable: v, A, B, seriesA, seriesB, rep } = input
  const toFreq = (p: Pts) => (rep.frequency === 'annual' ? annualMeans(p) : removeSeasonal(p))
  const pa = centred(toFreq(slice(seriesA, rep.start.slice(0, rep.start.length), rep.end.length === 4 ? `${rep.end}-12` : rep.end)))
  const pb = centred(toFreq(slice(seriesB, rep.start, rep.end.length === 4 ? `${rep.end}-12` : rep.end)))
  const units = formatUnitsText(v.units)
  const list: Record<string, unknown>[] = []
  ;[
    [A, pa, rep.a.slope.perYear, PALETTE[0]],
    [B, pb, rep.b.slope.perYear, PALETTE[1]],
  ].forEach(([r, p, slope, color]) => {
    const pts = p as Pts
    list.push({ name: (r as Region).name, type: 'line', data: pair(pts.dates, pts.values), symbol: 'none', lineStyle: { width: 1.3, color }, itemStyle: { color } })
    const tl = trendLine(pts, slope as number)
    if (tl.length) list.push({ name: `${(r as Region).name} trend`, type: 'line', data: tl, symbol: 'none', lineStyle: { width: 2.4, color, type: 'dashed' }, itemStyle: { color } })
  })
  const d = rep.difference
  const span = `${formatStep(rep.start)} to ${formatStep(rep.end)}`
  const subtitle = `${span}   ·   Each series relative to its own mean (levels are not compared)   ·   Difference ${fmt(d.perYear)} ${rateUnits(v)} (95% interval ${fmt(d.lower)} to ${fmt(d.upper)}), ${formatP(rep.p)}`
  const source = `Source: ${v.source.name}${v.synthetic ? '   ·   SYNTHETIC DATA: not observations' : ''}`
  const option = baseOption(`${v.name}: ${A.name} vs ${B.name}`, subtitle, `${units} (relative to own mean)`, source, v.synthetic, list)
  const dates = [...new Set([...pa.dates, ...pb.dates])].sort()
  const get = (p: Pts, dt: string) => p.values[p.dates.indexOf(dt)] ?? null
  return {
    option,
    title: `${v.name}, ${A.name} vs ${B.name}`,
    csv: { header: ['date', `${A.id} (${v.units}, minus own mean)`, `${B.id} (${v.units}, minus own mean)`], rows: dates.map((dt) => [dt, get(pa, dt), get(pb, dt)]) },
  }
}

/** Two to four variables in one region, each standardized over the common period (shape only). */
export function buildTogetherChart(input: { region: Region; start: string; end: string; items: { variable: Variable; series: Series }[] }): ChartOutput {
  const { region: r, start, end, items } = input
  const mixed = new Set(items.map((x) => x.series.frequency)).size > 1
  const pts = items.map((x) => {
    const endFix = x.series.frequency === 'annual' && end.length === 7 ? end.slice(0, 4) : x.series.frequency === 'monthly' && end.length === 4 ? `${end}-12` : end
    const startFix = x.series.frequency === 'annual' && start.length === 7 ? start.slice(0, 4) : x.series.frequency === 'monthly' && start.length === 4 ? `${start}-01` : start
    const p = slice(x.series, startFix, endFix)
    return mixed ? annualMeans(p) : removeSeasonal(p)
  })
  // Common dates where every variable has a value.
  const common = pts[0].dates.filter((d) => pts.every((p) => p.values[p.dates.indexOf(d)] != null))
  const z = pts.map((p) => {
    const vals = common.map((d) => p.values[p.dates.indexOf(d)] as number)
    const m = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, vals.length - 1)) || 1
    return vals.map((x) => (x - m) / sd)
  })
  const list = items.map((x, i) => ({
    name: x.variable.name,
    type: 'line',
    data: common.map((d, k) => [toTime(d), z[i][k]]),
    symbol: 'none',
    lineStyle: { width: 1.4, color: PALETTE[i % PALETTE.length] },
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }))
  const span = common.length ? `${formatStep(common[0])} to ${formatStep(common[common.length - 1])}` : 'no common period'
  const prep = mixed ? 'annual means' : items[0].series.frequency === 'monthly' ? 'seasonal cycle removed' : 'annual values'
  const antarcticTemp = /^antarctica/.test(r.id) && items.some((x) => x.variable.id === 'temperature')
  const subtitle =
    `${span}   ·   ${prep}   ·   Standardized: (value − mean) ÷ standard deviation over the common period. Moving together is not cause and effect.` +
    (antarcticTemp ? '\nAntarctic ice loss is driven mainly by warm ocean water reaching West Antarctic glaciers, not by air temperature.' : '')
  const synthetic = items.some((x) => x.variable.synthetic)
  const source = `Sources: ${[...new Set(items.map((x) => x.variable.source.name))].join('; ')}${synthetic ? '   ·   SYNTHETIC DATA: not observations' : ''}`
  return {
    option: common.length ? baseOption(`${r.name}: variables together`, subtitle, 'Standardized units', source, synthetic, list) : null,
    message: common.length ? undefined : 'These variables have no years in common in the selected range.',
    title: `${r.name}: variables together`,
    csv: { header: ['date', ...items.map((x) => `${x.variable.id} (standardized)`)], rows: common.map((d, k) => [d, ...z.map((col) => col[k])]) },
  }
}
