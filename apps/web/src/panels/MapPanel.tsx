// Collapsible wrapper for the globe's map mode picker and legend (both owned by globe/).
// Folds away automatically when a result arrives so the results drawer has room; the user can reopen it.
import { useEffect, useId, useState } from 'react'
import { MapLegend, MapModePicker } from '@/globe'
import { useAppStore } from '@/state/store'

export default function MapPanel({ initiallyOpen = true }: { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(initiallyOpen)
  const bodyId = useId()
  const analysis = useAppStore((s) => s.analysis)

  useEffect(() => {
    if (analysis) setOpen(false)
  }, [analysis])

  return (
    <div className="flex flex-col items-end gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="glass pointer-events-auto px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
      >
        {open ? 'Hide map options' : 'Map options'}
      </button>
      <div id={bodyId} hidden={!open} className="flex flex-col items-end gap-3">
        <MapModePicker />
        <MapLegend />
      </div>
    </div>
  )
}
