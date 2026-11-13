// Map layer tray (icons, names on hover) with the legend above it (both owned by globe/).
// The legend folds away when a result arrives so the results drawer has room; the info icon reopens it.
import { useEffect, useState } from 'react'
import { MapLegend, MapModeTray } from '@/globe'
import { useAppStore } from '@/state/store'

export default function MapPanel({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [legendOpen, setLegendOpen] = useState(initiallyOpen)
  const analysis = useAppStore((s) => s.analysis)

  useEffect(() => {
    if (analysis) setLegendOpen(false)
  }, [analysis])

  return (
    <div className="flex flex-col items-end gap-3">
      {legendOpen && (
        <div className="pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-150 motion-reduce:animate-none">
          <MapLegend />
        </div>
      )}
      <MapModeTray legendOpen={legendOpen} onToggleLegend={() => setLegendOpen((o) => !o)} />
    </div>
  )
}
