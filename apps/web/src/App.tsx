// M4 layout: full-screen globe, controls, map mode picker, legend, time scroller and data-driven SYNTHETIC watermark. Drawers and pickers start in M6.
// The stats check card (from M0) stays in a corner until the real analysis panel replaces it.
import { useState } from 'react'
import type { TrendReport } from '@trend/stats'
import { Button } from '@/components/ui/button'
import TimeScroller from '@/components/TimeScroller'
import { Globe, GlobeControls, MapLegend, MapModePicker, SyntheticWatermark } from '@/globe'
import { runTrend } from '@/lib/stats'
import { useAppStore } from '@/state/store'

// 30 annual points: a slope of -2 per year plus fixed pseudo-noise.
const DEMO_DATES = Array.from({ length: 30 }, (_, i) => String(1991 + i))
const DEMO_VALUES = DEMO_DATES.map((_, i) => -2 * i + 6 * Math.sin(i * 1.7))

function StatsCheck() {
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
    <div className="glass pointer-events-auto flex w-72 flex-col gap-3 p-4 text-sm">
      <p className="text-white/90">Stats worker check (demo series, slope -2 per year).</p>
      <Button onClick={run} disabled={busy} size="sm">
        {busy ? 'Running…' : 'Run analysis'}
      </Button>
      {error && <p className="text-destructive">{error}</p>}
      {report && (
        <dl data-testid="report" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
          <dt className="text-white/90">Trend</dt>
          <dd>{report.test.trend}</dd>
          <dt className="text-white/90">p</dt>
          <dd>{report.test.p.toExponential(2)}</dd>
          <dt className="text-white/90">Sen's slope</dt>
          <dd>
            {report.slope.perYear.toFixed(3)}/yr ({report.slope.lower.toFixed(2)} to {report.slope.upper.toFixed(2)})
          </dd>
          <dt className="text-white/90">n</dt>
          <dd>{report.n}</dd>
        </dl>
      )}
    </div>
  )
}

export default function App() {
  const region = useAppStore((s) => s.region)

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-foreground">
      <Globe />
      <div className="pointer-events-none absolute inset-0">
        <header className="absolute left-3 top-3 flex items-center gap-3">
          <h1 className="glass pointer-events-auto px-3 py-1.5 text-base font-semibold">Trend Detective</h1>
          {region && (
            <span data-testid="selected-region" className="glass px-2 py-1 text-xs">
              {region}
            </span>
          )}
        </header>
        <SyntheticWatermark className="absolute left-1/2 top-3 -translate-x-1/2" />
        {/* Left column: map mode picker; the stats check card stays until the M6 panels replace it. */}
        <div className="absolute left-3 top-16 flex flex-col gap-3">
          <MapModePicker />
          <StatsCheck />
        </div>
        {/* Right column after the left one in DOM order, so Tab goes left panel -> right controls. */}
        <div className="pointer-events-auto absolute right-3 top-3">
          <GlobeControls />
        </div>
        {/* Legend sits under the globe controls so it never overlaps the bottom-centre scroller. */}
        <div className="absolute right-3 top-32">
          <MapLegend />
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
          <TimeScroller />
        </div>
      </div>
    </main>
  )
}
