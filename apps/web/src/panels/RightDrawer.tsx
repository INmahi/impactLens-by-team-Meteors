// Right drawer: results in the plan's fixed order (section 4):
// 1 selected parameters, 2 verdict card, 3 statistical report (cross-checks expandable),
// 4 interpretation, 5 notes. Text rules: docs/stats/wording.md (via lib/verdict.ts).
import { useId, useState } from 'react'
import type { Region, Variable } from '@trend/contract'
import { formatP, type MannKendallResult } from '@trend/stats'
import { formatStep, useRegionsData, useVariablesData } from '@/lib/useData'
import { detectText, fmt, interpretation, rateUnits, trendVerdict, uncertaintyText } from '@/lib/verdict'
import { useAppStore, type AnalysisResult } from '@/state/store'
import { cn } from 'cn'

export default function RightDrawer() {
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
    <section aria-label="Results" aria-busy={status === 'running'} className="glass-strong flex w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden text-white">
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
          {analysis && v && r && <Body a={analysis} v={v} r={r} />}
        </div>
      )}
    </section>
  )
}

function Body({ a, v, r }: { a: AnalysisResult; v: Variable; r: Region }) {
  const rep = a.report
  const verdict = trendVerdict(v, r, rep)
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

      {/* 2. Verdict */}
      <section
        aria-labelledby="res-verdict"
        className={cn(
          'rounded-xl border p-3',
          verdict.tone === 'significant' ? 'border-sky-300/50 bg-sky-300/10' : 'border-amber-300/50 bg-amber-300/10',
        )}
      >
        <h3 id="res-verdict" className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
          Main conclusion
          <Badge tone={verdict.tone}>{verdict.tone === 'significant' ? 'Significant' : 'Not significant'}</Badge>
          {rep.lowPower && <Badge tone="low">Low power</Badge>}
        </h3>
        <p className="text-[15px] leading-snug font-medium">{verdict.headline}</p>
        <p className="mt-1 text-[13px] leading-snug text-white/90">{verdict.detail}</p>
        {a.detect && !rep.test.significant && <p className="mt-2 text-[13px] text-white/90">{detectText(v, a.detect)}</p>}
      </section>

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
            {fmt(rep.slope.perYear)} {rateUnits(v)} ({fmt(rep.slope.perDecade)} per decade)
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
                  <td>{formatP(c.p).replace(/^p\s*/, '')}</td>
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
          {interpretation(v, r, rep).map((t) => (
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
