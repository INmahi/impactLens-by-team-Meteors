// Right drawer: results in the plan's fixed order (section 4):
// 1 selected parameters, 2 verdict card, 3 statistical report (cross-checks expandable),
// 4 interpretation, 5 notes. Text rules: docs/stats/wording.md (via lib/verdict.ts).
import { useId, useState } from 'react'
import type { Region, Variable } from '@trend/contract'
import { formatP, type CompareReport, type MannKendallResult } from '@trend/stats'
import { formatStep, formatUnitsText, useRegionsData, useVariablesData } from '@/lib/useData'
import { compareVerdict, correlationText, detectText, fmt, interpretation, rateUnits, trendVerdict, uncertaintyText } from '@/lib/verdict'
import { useAppStore, type AnalysisResult } from '@/state/store'
import { cn } from 'cn'

export default function RightDrawer({ className }: { className?: string }) {
  const analysis = useAppStore((s) => s.analysis)
  const status = useAppStore((s) => s.analysisStatus)
  const { data: variables } = useVariablesData()
  const { data: regions } = useRegionsData()
  const [open, setOpen] = useState(true)
  const bodyId = useId()

  if (!analysis && status !== 'running') return null
  const v = analysis ? variables?.find((x) => x.id === analysis.variable) : undefined
  const r = analysis ? regions?.find((x) => x.id === analysis.region) : undefined

  return (
    <section aria-label="Results" aria-busy={status === 'running'} className={cn("glass-strong flex w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden text-white", className)}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <h2 className="text-sm font-semibold tracking-wide">Results</h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((o) => !o)}
          className="rounded-md px-2 py-1 text-xs text-white/90 hover:bg-white/10"
        >
          {open ? 'Hide' : 'Show'}
        </button>
      </header>
      {open && (
        <div id={bodyId} className="flex max-h-[calc(100dvh-14rem)] flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-4 text-sm">
          {status === 'running' && <p role="status">Running the analysis…</p>}
          {analysis && v && r && regions && variables && <Body a={analysis} v={v} r={r} regions={regions} variables={variables} />}
        </div>
      )}
    </section>
  )
}

function Body({ a, v, r, regions, variables }: { a: AnalysisResult; v: Variable; r: Region; regions: Region[]; variables: Variable[] }) {
  const rep = a.report
  const verdict = trendVerdict(v, r, rep)
  const rB = a.compare ? regions.find((x) => x.id === a.compare!.region) : undefined
  // Region caveats and this run's notes first; the variable's general notes go in an expandable list.
  const notes = [...new Set([...(r.notes ?? []), ...rep.notes])]
  const general = v.notes.filter((n) => !notes.includes(n))
  return (
    <>
      {/* 1. Parameters */}
      <section aria-labelledby="res-params">
        <h3 id="res-params" className="sr-only">Selected parameters</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
          <dt className="text-white/80">Variable</dt>
          <dd>{v.name}</dd>
          <dt className="text-white/80">Region</dt>
          <dd>{r.name}</dd>
          <dt className="text-white/80">Period</dt>
          <dd className="tabular-nums">
            {formatStep(a.start)} – {formatStep(a.end)}
          </dd>
          <dt className="text-white/80">Source</dt>
          <dd>{v.source.name}</dd>
        </dl>
      </section>

      {a.compare && rB && <CompareBlock v={v} A={r} B={rB} rep={a.compare.report} />}

      {/* 2. Verdict */}
      <section
        aria-labelledby="res-verdict"
        className={cn(
          'rounded-xl border p-3',
          verdict.tone === 'significant' ? 'border-sky-300/50 bg-sky-300/10' : 'border-amber-300/50 bg-amber-300/10',
        )}
      >
        <h3 id="res-verdict" className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          {a.compare ? `${r.name}, full range` : 'Main conclusion'}
          <Badge tone={verdict.tone}>{verdict.tone === 'significant' ? 'Significant' : 'Cannot tell yet'}</Badge>
          {rep.lowPower && <Badge tone="low">Low power</Badge>}
          {v.synthetic && <Badge tone="low">Synthetic data</Badge>}
        </h3>
        <p className="text-[15px] leading-snug font-medium">{verdict.headline}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/90">{verdict.detail}</p>
        {a.detect && !rep.test.significant && <p className="mt-2 text-[13px] text-white/90">{detectText(v, a.detect)}</p>}
      </section>

      {a.extras.length > 0 && <ExtrasBlock a={a} v={v} r={r} variables={variables} />}

      {/* 3. Statistical report */}
      <section aria-labelledby="res-stats">
        <h3 id="res-stats" className="mb-1 text-xs font-medium tracking-wide text-white/85 uppercase">
          Statistical report
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px] tabular-nums">
          <dt className="text-white/80">Test</dt>
          <dd>{rep.test.method}</dd>
          <dt className="text-white/80">Result</dt>
          <dd>
            {trendWord(rep.test.trend)}, {formatP(rep.test.p)}
          </dd>
          <dt className="text-white/80">Kendall's tau</dt>
          <dd>{rep.test.tau.toFixed(3)}</dd>
          <dt className="text-white/80">z</dt>
          <dd>{rep.test.z.toFixed(2)}</dd>
          <dt className="text-white/80">Sen's slope</dt>
          <dd>
            {fmt(rep.slope.perYear)} {rateUnits(v)} ({fmt(rep.slope.perDecade)} {formatUnitsText(v.units)} per decade)
          </dd>
          <dt className="text-white/80">95% interval</dt>
          <dd>
            {fmt(rep.slope.lower)} to {fmt(rep.slope.upper)} {rateUnits(v)}
          </dd>
          <dt className="text-white/80">Points (n)</dt>
          <dd>{rep.n}</dd>
          <dt className="text-white/80">Coverage</dt>
          <dd>{Math.round(rep.coverage * 100)}%</dd>
          <dt className="text-white/80">Autocorrelation factor</dt>
          <dd>{rep.test.correction.toFixed(2)}</dd>
        </dl>
        {a.uncertainty && <p className="mt-2 text-[13px] text-white/90">{uncertaintyText(v, a.uncertainty)}</p>}
        <details className="mt-2 rounded-lg border border-white/10 px-2 py-1">
          <summary className="cursor-pointer text-[13px] text-white/90">Cross-check tests ({rep.crossChecks.length})</summary>
          <table className="mt-1 w-full text-[12px] tabular-nums">
            <thead>
              <tr className="text-left text-white/80">
                <th className="font-normal">Method</th>
                <th className="font-normal">Result</th>
                <th className="font-normal">p</th>
              </tr>
            </thead>
            <tbody>
              {rep.crossChecks.map((c: MannKendallResult) => (
                <tr key={c.method}>
                  <td className="pr-2">{c.method}</td>
                  <td className="pr-2">{trendWord(c.trend)}</td>
                  <td>{formatP(c.p).replace(/^p\s*=?\s*/, '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      {/* 4. Interpretation */}
      <section aria-labelledby="res-interp">
        <h3 id="res-interp" className="mb-1 text-xs font-medium tracking-wide text-white/85 uppercase">
          Interpretation
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] text-white/90">
          {interpretation(v, r, rep, variables).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </section>

      {/* 5. Notes */}
      <section aria-labelledby="res-notes">
        <h3 id="res-notes" className="mb-1 text-xs font-medium tracking-wide text-white/85 uppercase">
          Notes
        </h3>
        <ul className="flex list-disc flex-col gap-1 pl-4 text-[13px] text-white/90">
          {notes.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        {general.length > 0 && (
          <details className="mt-2 rounded-lg border border-white/10 px-2 py-1">
            <summary className="cursor-pointer text-[13px] text-white/90">About {v.name.toLowerCase()} data ({general.length})</summary>
            <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[13px] text-white/90">
              {general.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </>
  )
}

function Badge({ tone, children }: { tone: 'significant' | 'not-significant' | 'low'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-normal normal-case',
        tone === 'significant' && 'bg-sky-300 text-slate-950',
        tone === 'not-significant' && 'bg-amber-200 text-slate-950',
        tone === 'low' && 'bg-white/85 text-slate-950',
      )}
    >
      {children}
    </span>
  )
}

/** The engine's "no trend" is never shown: not significant means "cannot tell yet" (wording.md rule 2). */
function trendWord(t: string): string {
  return t === 'no trend' ? 'not significant' : t
}

/** Compare mode "regions": one difference verdict plus each region's trend on the common period. */
function CompareBlock({ v, A, B, rep }: { v: Variable; A: Region; B: Region; rep: CompareReport }) {
  const cv = compareVerdict(v, A, B, rep)
  const row = (name: string, t: CompareReport['a']) => (
    <tr key={name}>
      <td className="pr-2">{name}</td>
      <td className="pr-2">
        {fmt(t.slope.perYear)} ({fmt(t.slope.lower)} to {fmt(t.slope.upper)})
      </td>
      <td>{formatP(t.test.p).replace(/^p\s*=?\s*/, '')}</td>
    </tr>
  )
  return (
    <section
      aria-labelledby="res-compare"
      className={cn('rounded-xl border p-3', cv.tone === 'significant' ? 'border-sky-300/50 bg-sky-300/10' : 'border-amber-300/50 bg-amber-300/10')}
    >
      <h3 id="res-compare" className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
        Main conclusion: {A.name} vs {B.name}
        <Badge tone={cv.tone}>{cv.tone === 'significant' ? 'Different' : 'Cannot tell apart'}</Badge>
        {rep.lowPower && <Badge tone="low">Low power</Badge>}
          {v.synthetic && <Badge tone="low">Synthetic data</Badge>}
      </h3>
      <p className="text-[15px] leading-snug font-medium">{cv.headline}</p>
      <p className="mt-1 text-[13px] leading-snug text-white/90">{cv.detail}</p>
      <table className="mt-2 w-full text-[12px] tabular-nums">
        <caption className="sr-only">Each region's trend on the common period</caption>
        <thead>
          <tr className="text-left text-white/80">
            <th className="font-normal">Region</th>
            <th className="font-normal">Sen's slope, {rateUnits(v)} (95%)</th>
            <th className="font-normal">p</th>
          </tr>
        </thead>
        <tbody>
          {row(A.name, rep.a)}
          {row(B.name, rep.b)}
        </tbody>
      </table>
      <details className="mt-2 rounded-lg border border-white/10 px-2 py-1">
        <summary className="cursor-pointer text-[13px] text-white/90">How the difference was tested</summary>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-4 text-[12px] text-white/90">
          <li>{rep.bootstrap.method}; {rep.bootstrap.replicates} replicates, block length {rep.bootstrap.blockLength} steps ({rep.bootstrap.blockRule}).</li>
          <li>Common period {formatStep(rep.start)} – {formatStep(rep.end)}, {rep.n.common} shared time steps, {rep.frequency}.</li>
          <li>Cross-check ({rep.crossCheck.method}): {rep.crossCheck.agrees ? 'agrees' : 'disagrees'} ({formatP(rep.crossCheck.test.p)}).</li>
          {[...new Set([...cv.notes, ...rep.notes])].map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </section>
  )
}

/** Compare mode "variables": each extra variable's trend in this region and its correlation with the main one. */
function ExtrasBlock({ a, v, r, variables }: { a: AnalysisResult; v: Variable; r: Region; variables: Variable[] }) {
  return (
    <section aria-labelledby="res-extras" className="flex flex-col gap-2">
      <h3 id="res-extras" className="text-xs font-medium tracking-wide text-white/85 uppercase">
        Other variables in {r.name}
      </h3>
      {a.extras.map((x) => {
        const xv = variables.find((y) => y.id === x.variable)
        if (!xv) return null
        const t = trendVerdict(xv, r, x.report)
        return (
          <div key={x.variable} className="rounded-xl border border-white/15 p-3">
            <p className="mb-1 flex items-center gap-2 text-xs font-medium">
              {xv.name}
              <Badge tone={t.tone}>{t.tone === 'significant' ? 'Significant' : 'Cannot tell yet'}</Badge>
            </p>
            <p className="text-[13px] leading-snug">{t.headline}</p>
            <p className="mt-1 text-[12px] text-white/90">{t.detail}</p>
            {x.correlation && <p className="mt-2 text-[12px] text-white/90">{correlationText(v, xv, x.correlation, r)}</p>}
          </div>
        )
      })}
    </section>
  )
}
