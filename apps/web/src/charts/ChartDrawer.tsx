// Bottom drawer: charts for the current analysis (plan section 4). Opens when an analysis is ready.
// Chart types come from the variable's `chartTypes`. Downloads: PNG and SVG (re-rendered with the SVG
// renderer). Exports carry the source line drawn in the chart.
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { BarChart, LineChart } from 'echarts/charts'
import { DataZoomInsideComponent, DataZoomSliderComponent, GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers'
import type { Region, Series, Variable } from '@trend/contract'
import { getSeriesCached, useRegionsData, useVariablesData } from '@/lib/useData'
import { usePhone } from '@/lib/useMedia'
import { useAppStore, type AnalysisResult } from '@/state/store'
import { cn } from 'cn'
import { buildChart, buildCompareChart, buildTogetherChart, CHART_LABELS } from './buildChart'

echarts.use([LineChart, BarChart, DataZoomInsideComponent, DataZoomSliderComponent, GridComponent, TooltipComponent, LegendComponent, TitleComponent, MarkLineComponent, GraphicComponent, CanvasRenderer, SVGRenderer])

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
  const phone = usePhone()
  // A narrow chart (phone, or desktop with both side panels open) gets wrapped text AND a taller box.
  const [narrow, setNarrow] = useState(false)
  const [zoomed, setZoomed] = useState(false)
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
    if (!chart.current) {
      chart.current = echarts.init(el.current, null, { renderer: 'canvas' })
      chart.current.on('datazoom', () => {
        const dz = currentWindow(chart.current)
        setZoomed(!!dz)
      })
    }
    const node = el.current
    chart.current.setOption(fitNarrow(withZoom(out.option), node.clientWidth), true)
    setZoomed(false)
    setNarrow(node.clientWidth < 640)
    const ro = new ResizeObserver(() => {
      chart.current?.resize()
      setNarrow(node.clientWidth < 640)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [out, narrow])
  useEffect(
    () => () => {
      chart.current?.dispose()
      chart.current = null
    },
    [],
  )

  const fileBase = `trend-detective_${v.id}_${r.id}_${a.start}_${a.end}_${type}`

  // Exports show what is on screen (the zoomed window, y rescaled) but without the zoom slider.
  function exportOption(): echarts.EChartsCoreOption {
    const win = currentWindow(chart.current)
    if (!win) return out!.option!
    // Say which years the zoomed picture shows; the trend numbers in the subtitle stay for the analysed range.
    const o = out!.option as Record<string, unknown>
    const t = (Array.isArray(o.title) ? o.title[0] : o.title) as Record<string, unknown> | undefined
    const yr = (x: number) => new Date(x).getUTCFullYear()
    const title = t ? { ...t, subtext: `${t.subtext ?? ''}   ·   Showing ${yr(win.startValue)} to ${yr(win.endValue)}` } : o.title
    return { ...o, title, dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'filter', ...win }] }
  }
  function savePng() {
    if (!out?.option || !el.current) return
    const w = el.current.clientWidth || 900
    const h = el.current.clientHeight || 320
    const div = document.createElement('div')
    const pngChart = echarts.init(div, null, { renderer: 'canvas', width: w, height: h - ZOOM_EXTRA })
    pngChart.setOption({ ...exportOption(), animation: false })
    const url = pngChart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0b1220' })
    pngChart.dispose()
    download(`${fileBase}.png`, dataUrlToBlob(url))
  }
  function saveSvg() {
    if (!out?.option || !el.current) return
    const w = el.current.clientWidth || 900
    const h = el.current.clientHeight || 320
    const svgChart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: h - ZOOM_EXTRA })
    svgChart.setOption(exportOption())
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
        <div className="flex items-center gap-1" aria-label="Zoom and downloads">
          <span className="hidden text-[11px] text-white/75 sm:inline">Scroll to zoom, drag to pan</span>
          <button
            type="button"
            disabled={!zoomed}
            onClick={() => chart.current?.dispatchAction({ type: 'dataZoom', start: 0, end: 100 })}
            className="rounded-md border border-white/20 px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-40"
          >
            Reset zoom
          </button>
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
        <div ref={el} role="img" aria-label={`${out?.title ?? 'Chart'}: ${CHART_LABELS[type] ?? type}`} className={cn('w-full', phone || narrow ? 'h-[26rem]' : 'h-80')} />
      )}
    </div>
  )
}

/** Narrow screens (phone): wrap the subtitle and the source line inside the chart and make room for a
 *  legend that wraps, so nothing is cut off or overlaps the axis labels. */
function fitNarrow(option: echarts.EChartsCoreOption, width: number): echarts.EChartsCoreOption {
  if (width >= 640) return option
  const o = option as Record<string, unknown>
  const w = Math.max(200, width - 24)
  const title = o.title as Record<string, unknown> | undefined
  const grid = (o.grid ?? {}) as Record<string, number>
  const legend = (o.legend ?? {}) as Record<string, unknown>
  const graphic = (o.graphic as Record<string, unknown>[] | undefined) ?? []
  const zoom = (o.dataZoom as Record<string, unknown>[] | undefined) ?? []
  return {
    ...o,
    title: title && {
      ...title,
      textStyle: { ...(title.textStyle as object), fontSize: 13, width: w, overflow: 'break' },
      subtextStyle: { ...(title.subtextStyle as object), width: w, overflow: 'break', lineHeight: 14 },
    },
    grid: { ...grid, left: 52, right: 16, top: (grid.top ?? 88) + 42, bottom: (grid.bottom ?? 78) + 56 },
    legend: { ...legend, bottom: ((legend.bottom as number) ?? 40) + 28, itemGap: 8, textStyle: { color: '#e2e8f0', fontSize: 11 } },
    graphic: graphic.map((g) => ({ ...g, style: { ...(g.style as object), width: w, overflow: 'break', fontSize: 10 } })),
    dataZoom: zoom.map((z) => (z.type === 'slider' ? { ...z, bottom: ((z.bottom as number) ?? 44) + 28, left: 52, right: 16 } : z)),
  }
}

/** Extra height the live chart gives the zoom slider (exports leave it out). */
const ZOOM_EXTRA = 36

/** Live chart only: wheel/pinch zoom and drag-to-pan on the time axis, plus a slider under the legend.
 *  filterMode 'filter' drops points outside the window, so the y-axis rescales to what is visible. */
function withZoom(option: echarts.EChartsCoreOption | undefined): echarts.EChartsCoreOption {
  const o = (option ?? {}) as Record<string, unknown>
  const grid = (o.grid ?? {}) as Record<string, unknown>
  const legend = (o.legend ?? {}) as Record<string, unknown>
  return {
    ...o,
    grid: { ...grid, bottom: ((grid.bottom as number) ?? 64) + ZOOM_EXTRA },
    legend: { ...legend, bottom: ((legend.bottom as number) ?? 26) + ZOOM_EXTRA },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'filter', zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false, minSpan: 2 },
      {
        type: 'slider',
        xAxisIndex: 0,
        filterMode: 'filter',
        height: 16,
        bottom: 44,
        left: 64,
        right: 44,
        borderColor: 'rgba(255,255,255,0.25)',
        backgroundColor: 'rgba(255,255,255,0.05)',
        fillerColor: 'rgba(125,211,252,0.25)',
        dataBackground: { lineStyle: { color: 'rgba(255,255,255,0.4)' }, areaStyle: { color: 'rgba(255,255,255,0.08)' } },
        handleStyle: { color: '#7dd3fc', borderColor: '#0b1220' },
        moveHandleStyle: { color: 'rgba(125,211,252,0.6)' },
        textStyle: { color: '#e2e8f0', fontSize: 10 },
        labelFormatter: (value: number) => new Date(value).getUTCFullYear().toString(),
        brushSelect: false,
      },
    ],
  }
}

/** The zoom window of the live chart as axis values, or null when showing the full range. */
function currentWindow(c: echarts.ECharts | null): { startValue: number; endValue: number } | null {
  const dz = (c?.getOption() as { dataZoom?: { start?: number; end?: number; startValue?: number; endValue?: number }[] } | undefined)?.dataZoom?.[0]
  if (!dz || ((dz.start ?? 0) <= 0.01 && (dz.end ?? 100) >= 99.99)) return null
  return dz.startValue != null && dz.endValue != null ? { startValue: dz.startValue, endValue: dz.endValue } : null
}
