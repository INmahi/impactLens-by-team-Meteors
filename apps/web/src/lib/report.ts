// Downloadable report (M12): one self-contained HTML file for the current result. Opens offline in any browser
// and prints to PDF. Every number and sentence comes from the app's own engine and lib/verdict.ts (the same text
// as the results panel); the chart is the app's chart rendered as inline SVG. No AI text is included.
import { BarChart, LineChart } from 'echarts/charts'
import { GraphicComponent, GridComponent, LegendComponent, MarkLineComponent, TitleComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { SVGRenderer } from 'echarts/renderers'
import type { Region, Series, Variable } from '@trend/contract'
import { formatP } from '@trend/stats'
import { buildChart, buildCompareChart, buildTogetherChart } from '@/charts/buildChart'
import { formatStep, formatUnitsText, getRegionsCached, getSeriesCached, getVariablesCached } from '@/lib/useData'
import {
  compareVerdict,
  correlationText,
  detectText,
  fmt,
  interpretation,
  rateUnits,
  trendVerdict,
  uncertaintyText,
} from '@/lib/verdict'
import type { AnalysisResult } from '@/state/store'

echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TitleComponent, MarkLineComponent, GraphicComponent, SVGRenderer])

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

/** The app's chart for this result as an SVG string, on a white-friendly dark panel. */
async function chartSvg(a: AnalysisResult, v: Variable, r: Region, regions: Region[], variables: Variable[]): Promise<string> {
  const series = await getSeriesCached(a.variable, a.region)
  let out
  if (a.compare) {
    const B = regions.find((x) => x.id === a.compare!.region) as Region
    const seriesB = await getSeriesCached(a.variable, B.id)
    out = buildCompareChart({ variable: v, A: r, B, seriesA: series, seriesB, rep: a.compare.report })
  } else if (a.extras.length) {
    const items: { variable: Variable; series: Series }[] = [{ variable: v, series }]
    for (const x of a.extras) items.push({ variable: variables.find((y) => y.id === x.variable) as Variable, series: await getSeriesCached(x.variable, a.region) })
    out = buildTogetherChart({ region: r, start: a.start, end: a.end, items })
  } else {
    const globalRegion = r.kind === 'coastal_sea' ? regions.find((x) => x.kind === 'global' && v.regions.includes(x.id)) : undefined
    const reference = globalRegion ? { region: globalRegion, series: await getSeriesCached(v.id, globalRegion.id) } : null
    out = buildChart({ type: v.chartTypes[0] ?? 'series', variable: v, region: r, series, report: a.report, start: a.start, end: a.end, reference })
  }
  if (!out?.option) return ''
  const c = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 900, height: 380 })
  c.setOption({ ...(out.option as object), backgroundColor: '#0b1220', animation: false })
  const svg = c.renderToSVGString()
  c.dispose()
  return svg
}

export async function buildReportHtml(a: AnalysisResult): Promise<{ html: string; filename: string }> {
  const [variables, regions] = await Promise.all([getVariablesCached(), getRegionsCached()])
  const v = variables.find((x) => x.id === a.variable) as Variable
  const r = regions.find((x) => x.id === a.region) as Region
  const rep = a.report
  const verdict = trendVerdict(v, r, rep)
  const B = a.compare ? (regions.find((x) => x.id === a.compare!.region) as Region) : null
  const cmp = a.compare && B ? compareVerdict(v, r, B, a.compare.report) : null
  const s = v.source
  const notes = [...new Set([...(r.notes ?? []), ...rep.notes, ...v.notes])]
  const svg = await chartSvg(a, v, r, regions, variables).catch(() => '')
  const generated = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const title = `${v.name}, ${r.name}${B ? ` vs ${B.name}` : ''}, ${formatStep(a.start)} to ${formatStep(a.end)}`

  const row = (k: string, val: string) => `<tr><th>${esc(k)}</th><td>${val}</td></tr>`
  const cmpHtml =
    cmp && a.compare && B
      ? `<section class="card ${cmp.tone}"><h2>Comparison: ${esc(r.name)} vs ${esc(B.name)}</h2>
<p class="headline">${esc(cmp.headline)}</p><p>${esc(cmp.detail)}</p>
<table>${row(r.name, `${fmt(a.compare.report.a.slope.perYear)} ${esc(rateUnits(v))} (95% interval ${fmt(a.compare.report.a.slope.lower)} to ${fmt(a.compare.report.a.slope.upper)}), ${esc(formatP(a.compare.report.a.test.p))}`)}
${row(B.name, `${fmt(a.compare.report.b.slope.perYear)} ${esc(rateUnits(v))} (95% interval ${fmt(a.compare.report.b.slope.lower)} to ${fmt(a.compare.report.b.slope.upper)}), ${esc(formatP(a.compare.report.b.test.p))}`)}
${row('Difference', `${fmt(a.compare.report.difference.perYear)} ${esc(rateUnits(v))} (95% interval ${fmt(a.compare.report.difference.lower)} to ${fmt(a.compare.report.difference.upper)}), ${esc(formatP(a.compare.report.p))}`)}
${row('Method', esc(`${a.compare.report.bootstrap.method}; ${a.compare.report.bootstrap.replicates} replicates`))}</table>
<ul>${cmp.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></section>`
      : ''
  const extrasHtml = a.extras.length
    ? `<section><h2>Other variables in ${esc(r.name)}</h2>${a.extras
        .map((x) => {
          const xv = variables.find((y) => y.id === x.variable) as Variable
          const t = trendVerdict(xv, r, x.report)
          return `<div class="sub"><h3>${esc(xv.name)}</h3><p class="headline">${esc(t.headline)}</p><p>${esc(t.detail)}</p>${
            x.correlation ? `<p>${esc(correlationText(v, xv, x.correlation, r))}</p>` : ''
          }<p class="muted">Dataset: ${esc(xv.source.name)}${xv.source.doi ? `, doi:${esc(xv.source.doi)}` : ''}</p></div>`
        })
        .join('')}</section>`
    : ''

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ImpactLens report: ${esc(title)}</title>
<style>
:root{--ink:#0f172a;--muted:#475569;--line:#e2e8f0;--sig:#0369a1;--ns:#b45309}
*{box-sizing:border-box}body{margin:0;font:15px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#f8fafc}
main{max-width:960px;margin:0 auto;padding:32px 24px 48px;background:#fff}
header{border-bottom:3px solid #0ea5e9;padding-bottom:12px;margin-bottom:20px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:24px 0 8px}h3{font-size:15px;margin:12px 0 4px}
.muted{color:var(--muted);font-size:13px}.headline{font-size:17px;font-weight:600;margin:4px 0}
.card{border:1px solid var(--line);border-left:5px solid var(--sig);border-radius:10px;padding:12px 16px;margin:12px 0}
.card.not-significant{border-left-color:var(--ns)}
.badge{display:inline-block;font-size:12px;font-weight:700;padding:2px 8px;border-radius:999px;background:#e0f2fe;color:#075985;margin-right:6px}
.badge.ns{background:#fef3c7;color:#92400e}.badge.real{background:#d1fae5;color:#065f46}.badge.syn{background:#fde68a;color:#78350f}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{width:32%;color:var(--muted);font-weight:600}
.chart{margin:12px 0;border-radius:10px;overflow:hidden}.chart svg{width:100%;height:auto;display:block}
.honesty{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px 16px}
.sub{border-top:1px solid var(--line);padding-top:8px}
.print{position:fixed;right:16px;top:16px;padding:8px 14px;border-radius:8px;border:0;background:#0ea5e9;color:#fff;font-weight:600;cursor:pointer}
@media print{.print{display:none}body{background:#fff}main{padding:0}}
</style></head><body>
<button class="print" onclick="window.print()">Print / save as PDF</button>
<main>
<header><h1>${esc(title)}</h1>
<p class="muted">ImpactLens report, generated ${esc(generated)} UTC. Mann-Kendall trend test with Sen's slope, computed in the browser by the app's statistics engine.</p>
<p><span class="badge real">Real observations</span>
${
    cmp
      ? `<span class="badge ${cmp.tone === 'significant' ? '' : 'ns'}">${cmp.tone === 'significant' ? 'Trends differ' : 'Cannot tell apart'}</span>${a.compare!.report.lowPower ? '<span class="badge ns">Low power</span>' : ''}`
      : `<span class="badge ${verdict.tone === 'significant' ? '' : 'ns'}">${verdict.tone === 'significant' ? 'Significant' : 'Cannot tell yet'}</span>${rep.lowPower ? '<span class="badge ns">Low power</span>' : ''}`
  }</p></header>

${cmpHtml}
<section class="card ${verdict.tone}"><h2>${a.compare ? `${esc(r.name)}, full range` : 'Main conclusion'}</h2>
<p class="headline">${esc(verdict.headline)}</p><p>${esc(verdict.detail)}</p>
${a.detect && !rep.test.significant ? `<p>${esc(detectText(v, a.detect))}</p>` : ''}</section>

${svg ? `<section><h2>Chart</h2><div class="chart">${svg}</div></section>` : ''}

<section><h2>Key numbers</h2><table>
${row(rep.kind === 'rate' ? 'Speed-up or slow-down' : 'Trend (Sen\'s slope)', `${fmt(rep.slope.perYear)} ${esc(rateUnits(v))}`)}
${row('95% interval', `${fmt(rep.slope.lower)} to ${fmt(rep.slope.upper)} ${esc(rateUnits(v))}`)}
${row('Per decade', `${fmt(rep.slope.perDecade)} ${esc(formatUnitsText(v.units))}`)}
${row('Significance', esc(formatP(rep.test.p)))}
${row('Test', esc(rep.test.method))}
${row("Kendall's tau / z", `${rep.test.tau.toFixed(3)} / ${rep.test.z.toFixed(2)}`)}
${row('Points used / coverage', `${rep.n} / ${Math.round(rep.coverage * 100)}%`)}
${row('Autocorrelation factor', rep.test.correction.toFixed(2))}
${row('Cross-checks', rep.crossChecks.map((c) => `${esc(c.method)}: ${esc(formatP(c.p))}`).join('<br>'))}
${a.uncertainty ? row('Source uncertainty', esc(uncertaintyText(v, a.uncertainty))) : ''}
</table></section>

${extrasHtml}

<section><h2>What it means</h2><ul>${interpretation(v, r, rep, variables).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>
<section><h2>Notes and caveats</h2><ul>${notes.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>

<section class="honesty"><h2 style="margin-top:0">Data source and honesty</h2><table>
${row('Dataset', `${esc(s.name)}${s.version ? `, version ${esc(s.version)}` : ''}`)}
${s.doi ? row('DOI', `<a href="https://doi.org/${esc(s.doi)}">doi:${esc(s.doi)}</a>`) : ''}
${s.licence || s.accessed ? row('Access', esc([s.accessed ? `Downloaded ${s.accessed}` : '', s.licence ?? ''].filter(Boolean).join('; '))) : ''}
${row('Record used', `${esc(formatStep(a.start))} to ${esc(formatStep(a.end))} (full record ${esc(formatStep(v.periods[a.region][0]))} to ${esc(formatStep(v.periods[a.region][1]))})`)}
${row('Cite', esc(s.citation))}
${s.processing?.length ? row('What was done to the data', `<ol>${s.processing.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>`) : ''}
</table>
<p class="muted">Nothing is padded, gap-filled or extrapolated; missing values stay as gaps. Every rate is shown with its 95% interval. A result that is not significant means "cannot tell yet", not "no change". A trend says what changed, not why.</p></section>
</main></body></html>`

  const slug = (x: string) => x.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()
  const filename = `trend-detective-report_${slug(v.id)}_${slug(r.id)}${B ? `_vs_${slug(B.id)}` : ''}_${slug(a.start)}_${slug(a.end)}.html`
  return { html, filename }
}

export async function downloadReport(a: AnalysisResult): Promise<void> {
  const { html, filename } = await buildReportHtml(a)
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
