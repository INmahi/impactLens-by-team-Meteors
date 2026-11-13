// "SYNTHETIC DATA" mark over the map. Shown whenever the data on screen says it is synthetic:
// the active map layer's manifest, a variable that uses that layer, or the selected
// variable (variables.json `synthetic`). Read from data, never assumed. Never captures the
// pointer, so the globe stays draggable underneath.
import { cn } from 'cn'
import { useSyntheticScope } from './useLayerInfo'

export default function SyntheticWatermark({ className }: { className?: string }) {
  const scope = useSyntheticScope()
  if (!scope) return null
  return (
    <div
      role="note"
      data-testid="synthetic-watermark"
      className={cn('glass-strong flex select-none flex-col items-center px-4 py-1.5 text-center', className)}
      style={{ pointerEvents: 'none' }}
    >
      <span className="text-lg font-bold tracking-[0.25em] text-amber-300">{scope === 'map' ? 'SYNTHETIC MAP' : 'SYNTHETIC DATA'}</span>
      <span className="text-xs text-white/85">
        {scope === 'map' ? 'The map layer is generated test data; the analysed series is real' : 'Generated test values, not observations'}
      </span>
    </div>
  )
}
