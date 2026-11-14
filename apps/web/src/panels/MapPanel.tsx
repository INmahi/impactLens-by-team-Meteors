// Map layer tray (icons, names on hover) with the legend above it (both owned by globe/).
// The legend folds away when a result arrives so the results drawer has room; the info icon reopens it.
// Phone (`labelled`): touch has no hover, so the layers are a labelled list (name + years on every row) and the
// legend is always shown above it (boss, 2026-11-14: every feature visible and usable on mobile).
import { useEffect, useState } from 'react'
import { MapLegend, MapModePicker, MapModeTray } from '@/globe'
import { useAppStore } from '@/state/store'

export default function MapPanel({ initiallyOpen = true, labelled = false }: { initiallyOpen?: boolean; labelled?: boolean }) {
  const [legendOpen, setLegendOpen] = useState(initiallyOpen)
  const analysis = useAppStore((s) => s.analysis)

  useEffect(() => {
    if (analysis && !labelled) setLegendOpen(false)
  }, [analysis, labelled])

  if (labelled) {
    return (
      <div className="pointer-events-auto flex w-full flex-col gap-2">
        <MapLegend className="w-full!" />
        <MapModePicker className="w-full! [&_label]:min-h-11 [&_label]:items-center" />
      </div>
    )
  }

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
