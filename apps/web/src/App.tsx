// M0 placeholder: proves Tailwind, shadcn (Base UI) and the stats worker are wired.
// The real interface starts in M6.
import { useState } from 'react'
import type { TrendReport } from '@trend/stats'
import { Button } from '@/components/ui/button'
import { runTrend } from '@/lib/stats'

// 30 annual points: a slope of -2 per year plus fixed pseudo-noise.
const DEMO_DATES = Array.from({ length: 30 }, (_, i) => String(1991 + i))
const DEMO_VALUES = DEMO_DATES.map((_, i) => -2 * i + 6 * Math.sin(i * 1.7))

export default function App() {
  const [report, setReport] = useState<TrendReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run() {
    setBusy(true)
    setError(null)
    try {
      setReport(
        await runTrend({ dates: DEMO_DATES, values: DEMO_VALUES, frequency: 'annual', kind: 'level' }),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-dvh bg-background px-4 py-10 text-foreground">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Trend Detective</h1>
          <span className="rounded-md border border-amber-400/40 px-2 py-1 text-xs font-medium tracking-wide text-amber-300">
            SYNTHETIC DATA
          </span>
        </header>
        <p className="text-sm text-muted-foreground">
          M0 scaffold check: runs <code>analyzeTrend()</code> in the stats worker on a 30-year demo series
          with an injected slope of -2 per year.
        </p>
        <div>
          <Button onClick={run} disabled={busy}>
            {busy ? 'Running…' : 'Run analysis'}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {report && (
          <dl
            data-testid="report"
            className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 rounded-xl border p-4 text-sm tabular-nums"
          >
            <dt className="text-muted-foreground">Trend</dt>
            <dd>{report.test.trend}</dd>
            <dt className="text-muted-foreground">p-value</dt>
            <dd>{report.test.p.toExponential(2)}</dd>
            <dt className="text-muted-foreground">Sen's slope</dt>
            <dd>
              {report.slope.perYear.toFixed(3)} per year (95%: {report.slope.lower.toFixed(3)} to{' '}
              {report.slope.upper.toFixed(3)})
            </dd>
            <dt className="text-muted-foreground">n</dt>
            <dd>{report.n}</dd>
          </dl>
        )}
      </div>
    </main>
  )
}
