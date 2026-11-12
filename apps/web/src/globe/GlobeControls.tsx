// Minimal globe controls for the layout: pole toggle and zoom. No panels or drawers (M6).
// Tooltips name the regions in each hemisphere, read from regions.json.
import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useAppStore, type Pole } from '@/state/store'
import { flyToPole, zoomIn, zoomOut } from './controller'
import { getRegionsData, hemisphereRegions } from './regions'

const POLES: { pole: Pole; label: string }[] = [
  { pole: 'north', label: 'North' },
  { pole: 'south', label: 'South' },
]

function useHemisphereNames(): Record<Pole, string> {
  const [names, setNames] = useState<Record<Pole, string>>({ north: '', south: '' })
  useEffect(() => {
    let alive = true
    getRegionsData()
      .then((data) => {
        if (!alive) return
        const list = (p: Pole) => hemisphereRegions(data, p).map((r) => r.name).join(', ')
        setNames({ north: list('north'), south: list('south') })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return names
}

/** North/South pole toggle. Clicking the active pole flies back to its view. */
export function PoleToggle({ className }: { className?: string }) {
  const pole = useAppStore((s) => s.pole)
  const setPole = useAppStore((s) => s.setPole)
  const names = useHemisphereNames()
  return (
    <div role="group" aria-label="Polar view" className={cn('glass flex gap-1 p-1', className)}>
      {POLES.map(({ pole: p, label }) => {
        const desc = `Fly to the ${label.toLowerCase()} polar view${names[p] ? ` (${names[p]})` : ''}`
        return (
          <Button
            key={p}
            size="sm"
            variant={pole === p ? 'secondary' : 'ghost'}
            aria-pressed={pole === p}
            aria-label={desc}
            title={desc}
            onClick={() => (pole === p ? flyToPole(p) : setPole(p))}
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
}

/** Zoom in / out buttons. */
export function ZoomControls({ className }: { className?: string }) {
  return (
    <div role="group" aria-label="Zoom" className={cn('glass flex flex-col gap-1 p-1', className)}>
      <Button size="icon-sm" variant="ghost" aria-label="Zoom in" title="Zoom in" onClick={zoomIn}>
        <Plus aria-hidden />
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Zoom out" title="Zoom out" onClick={zoomOut}>
        <Minus aria-hidden />
      </Button>
    </div>
  )
}

/** Both controls stacked; place it inside a positioned overlay. */
export default function GlobeControls({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col items-end gap-2', className)}>
      <PoleToggle />
      <ZoomControls />
    </div>
  )
}
