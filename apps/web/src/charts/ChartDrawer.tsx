// Bottom drawer: charts for the current analysis (plan section 4). Opens when an analysis is ready.
// Chart types come from the variable's `chartTypes`. Downloads: PNG and SVG (re-rendered with the SVG
// renderer). Exports carry the source line and the SYNTHETIC label drawn in the chart.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BarChart, LineChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import type { Region, Series, Variable } from '@trend/contract'
import { getSeriesCached, useRegionsData, useVariablesData } from '@/lib/useData'
import { useAppStore, type AnalysisResult } from '@/state/store'
import { cn } from 'cn'
import { buildChart, buildCompareChart, buildTogetherChart, CHART_LABELS } from './buildChart'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkLineComponent, GraphicComponent, CanvasRenderer, SVGRenderer])

// The link must be in the document and the blob URL must outlive a "Save as" prompt; revoking it
// early makes some browsers save the file under the blob's UUID with no extension.
function download(name: string, data: Blob | string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function dataUrlToBlob(url: string): Blob {
  const [head, b64] = url.split(',')
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? 'image/png'
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export default function ChartDrawer({ className }: { className?: string }) {
  const analysis = useAppStore((s) => s.analysis)
  const { data: variables } = useVariablesData()
  const { data: regions } = useRegionsData()
  const [open, setOpen] = useState(true)
  const bodyId = useId()

  useEffect(() => {
    if (analysis) setOpen(true)
  }, [analysis])

  if (!analysis || !variables || !regions) return null
  const v = variables.find((x) => x.id === analysis.variable)
  const r = regions.find((x) => x.id === analysis.region)
  if (!v || !r) return null

  return (
    <section aria-label="Charts" className={cn('glass-strong flex w-full flex-col overflow-hidden text-white', className)}>
      <header className="flex items-center justify-between gap-2 px-4 pt-2 pb-1">
        <h2 className="text-sm font-semibold tracking-wide">Charts</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={open ? 'Hide charts' : 'Show charts'}
          onClick={() => setOpen((o) => !o)}
          className="rounded-md px-2 py-0.5 text-base font-semibold text-white/90 hover:bg-white/10"
        >
          <span aria-hidden className={cn('inline-block transition-transform duration-300 motion-reduce:transition-none', open ? 'rotate-90' : '-rotate-90')}>
            »
          </span>
        </button>
      </header>
      {/* Fold with a grid-rows transition so the chart stays mounted (no re-init) while hidden. */}
      <div
        id={bodyId}
        inert={!open}
        className={cn('grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="min-h-0 overflow-hidden">
          <ChartBody a={analysis} v={v} r={r} regions={regions} variables={variables} />
        </div>
      </div>
    </section>
  )
}

function ChartBody({ a, v, r, regions, variables }: { a: AnalysisResult; v: Variable; r: Region; regions: Region[]; variables: Variable[] }) {
  // Compare views first when a comparison was run, then the variable's own chart types.
  const types = [
    ...(a.compare ? ['compare_regions'] : []),
    ...(a.extras.length ? ['together'] : []),
    ...(v.chartTypes.length ? v.chartTypes : ['series']),
  ]
  const [type, setType] = useState(types[0])
  useEffect(() => setType(types[0]), [a]) // eslint-disable-line react-hooks/exhaustive-deps
  const [series, setSeries] = useState<Series | null>(null)
  const [refData, setRefData] = useState<{ region: Region; series: Series } | null>(null)
  const [seriesB, setSeriesB] = useState<Series | null>(null)
  const [extraSeries, setExtraSeries] = useState<{ variable: Variable; series: Series }[]>([])
  const el = useRef<HTMLDivElement | null>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  // Data: the analysed series, plus the global mean of the same variable for a coastal sea.
  useEffect(() => {
    let alive = true
    getSeriesCached(a.variable, a.region).then((s) => alive && setSeries(s))
    const globalRegion = r.kind === 'coastal_sea' ? regions.find((x) => x.kind === 'global' && v.regions.includes(x.id)) : undefined
    if (globalRegion) getSeriesCached(v.id, globalRegion.id).then((s) => alive && setRefData({ region: globalRegion, series: s }))
    else setRefData(null)
    if (a.compare) getSeriesCached(a.variable, a.compare.region).then((s) => alive && setSeriesB(s))
    else setSeriesB(null)
    Promise.all(
      a.extras.map(async (x) => ({ variable: variables.find((y) => y.id === x.variable)!, series: await getSeriesCached(x.variable, a.region) })),
    ).then((xs) => alive && setExtraSeries(xs.filter((x) => x.variable)))
    return () => {
      alive = false
    }
  }, [a, r, v, regions, variables])

  const out = useMemo(() => {
    if (!series) return null
    if (type === 'compare_regions') {
      const B = regions.find((x) => x.id === a.compare?.region)
      return a.compare && B && seriesB ? buildCompareChart({ variable: v, A: r, B, seriesA: series, seriesB, rep: a.compare.report }) : null
    }
    if (type === 'together') {
      return extraSeries.length === a.extras.length
        ? buildTogetherChart({ region: r, start: a.start, end: a.end, items: [{ variable: v, series }, ...extraSeries] })
        : null
    }
    return buildChart({ type, variable: v, region: r, series, report: a.report, start: a.start, end: a.end, reference: refData })
  }, [type, v, r, series, a, refData, seriesB, extraSeries, regions])

  useEffect(() => {
    if (!el.current || !out?.option) {
      chart.current?.dispose()
      chart.current = null
      return
    }
    if (chart.current && chart.current.getDom() !== el.current) {
      chart.current.dispose()
      chart.current = null
    }
    chart.current ??= echarts.init(el.current, null, { renderer: 'canvas' })
    chart.current.setOption(out.option, true)
    const ro = new ResizeObserver(() => chart.current?.resize())
    ro.observe(el.current)
    return () => ro.disconnect()
  }, [out])
  useEffect(
    () => () => {
      chart.current?.dispose()
      chart.current = null
    },
    [],
  )

  const fileBase = `trend-detective_${v.id}_${r.id}_${a.start}_${a.end}_${type}`

  function savePng() {
    if (!chart.current) return
    const url = chart.current.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0b1220' })
    download(`${fileBase}.png`, dataUrlToBlob(url))
  }
  function saveSvg() {
    if (!out?.option || !el.current) return
    const w = el.current.clientWidth || 900
    const h = el.current.clientHeight || 320
    const svgChart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: h })
    svgChart.setOption(out.option)
    const svg = svgChart.renderToSVGString()
    download(`${fileBase}.svg`, svg.startsWith('<?xml') ? svg : `<?xml version="1.0" encoding="UTF-8"?>
${svg}`, 'image/svg+xml')
    svgChart.dispose()
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Chart type" className="flex flex-wrap gap-1">
          {types.map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={type === t}
              onClick={() => setType(t)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs',
                type === t ? 'border-sky-300/80 bg-sky-300/20 text-white' : 'border-white/20 text-white/90 hover:bg-white/10',
              )}
            >
              {CHART_LABELS[t] ?? t}
            </button>
          ))}
        </div>
        <div className="flex gap-1" aria-label="Downloads">
          {(['PNG', 'SVG'] as const).map((k) => (
            <button
              key={k}
              type="button"
              disabled={!out?.option}
              onClick={k === 'PNG' ? savePng : saveSvg}
              className="rounded-md border border-white/20 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-40"
              aria-label={`Download chart as ${k}`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>
      {out?.message ? (
        <p className="rounded-lg border border-white/10 p-3 text-sm text-white/90">{out.message}</p>
      ) : (
        <div ref={el} role="img" aria-label={`${out?.title ?? 'Chart'}: ${CHART_LABELS[type] ?? type}`} className="h-72 w-full" />
      )}
    </div>
  )
}
