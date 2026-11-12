// Temporary results card for M6 part (a): shows that Run analysis works end to end.
// Part (b) replaces it with the full right drawer (parameters, verdict, statistical report, interpretation, notes).
import { formatStep, formatUnitsText, useVariablesData } from '@/lib/useData'
import { useAppStore } from '@/state/store'

export default function ResultsSummary() {
  const analysis = useAppStore((s) => s.analysis)
  const { data: variables } = useVariablesData()
  if (!analysis) return null
  const v = variables?.find((x) => x.id === analysis.variable)
  const r = analysis.report
  const units = v ? formatUnitsText(v.units) : ''
  return (
    <section aria-label="Analysis result" className="glass-strong w-80 p-4 text-sm text-white">
      <h2 className="mb-2 font-semibold">Result</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums">
        <dt className="text-white/80">Variable</dt>
        <dd>{v?.name ?? analysis.variable}</dd>
        <dt className="text-white/80">Period</dt>
        <dd>
          {formatStep(analysis.start)} – {formatStep(analysis.end)}
        </dd>
        <dt className="text-white/80">Trend</dt>
        <dd>
          {r.test.trend}
          {r.test.significant ? ' (significant)' : ' (not significant)'}
        </dd>
        <dt className="text-white/80">Sen's slope</dt>
        <dd>
          {r.slope.perYear.toFixed(2)} {units}/yr ({r.slope.lower.toFixed(2)} to {r.slope.upper.toFixed(2)})
        </dd>
        <dt className="text-white/80">p</dt>
        <dd>{r.test.p.toExponential(2)}</dd>
        <dt className="text-white/80">n</dt>
        <dd>{r.n}</dd>
      </dl>
      {r.lowPower && <p className="mt-2 text-xs text-amber-100">Low power: a real trend could be missed.</p>}
    </section>
  )
}
