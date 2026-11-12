// M6 layout: full-screen globe; left drawer (inputs), right column (globe controls, results, map mode,
// legend), bottom-centre time scroller, data-driven SYNTHETIC watermark.
// The overlay root passes pointer events through; only the panels capture them (glass-ui rule).
import TimeScroller from '@/components/TimeScroller'
import { Globe, GlobeControls, MapLegend, MapModePicker, SyntheticWatermark } from '@/globe'
import { useRegionsData } from '@/lib/useData'
import LeftDrawer from '@/panels/LeftDrawer'
import RightDrawer from '@/panels/RightDrawer'
import { useAppStore } from '@/state/store'

function RegionChip() {
  const regionId = useAppStore((s) => s.region)
  const { data: regions } = useRegionsData()
  if (!regionId) return null
  const name = regions?.find((r) => r.id === regionId)?.name ?? regionId
  return (
    <span data-testid="selected-region" data-region-id={regionId} className="glass px-2 py-1 text-xs text-white">
      {name}
    </span>
  )
}

export default function App() {
  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-foreground">
      <Globe />
      <div className="pointer-events-none absolute inset-0">
        <header className="absolute left-3 top-3 flex items-center gap-3">
          <h1 className="glass pointer-events-auto px-3 py-1.5 text-base font-semibold">Trend Detective</h1>
          <RegionChip />
        </header>
        <SyntheticWatermark className="absolute left-1/2 top-3 -translate-x-1/2" />
        {/* Left drawer first in DOM order, so Tab goes inputs -> right column -> scroller. */}
        <div className="absolute left-3 top-16">
          <LeftDrawer />
        </div>
        <div className="absolute right-3 top-3 bottom-32 flex w-96 max-w-[calc(100vw-1.5rem)] flex-col items-end gap-3 overflow-y-auto overscroll-contain [&>*]:shrink-0">
          <div className="pointer-events-auto">
            <GlobeControls />
          </div>
          <RightDrawer />
          <MapModePicker />
          <MapLegend />
        </div>
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2">
          <TimeScroller />
        </div>
      </div>
    </main>
  )
}
