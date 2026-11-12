// TEMPORARY (M3c): exercises the map layer until the time scroller (M4) and the pickers (M6)
// exist. A layer select (distinct mapMode values from variables.json) and a frame slider.
// Delete when those land.
import { useId } from 'react'
import { cn } from 'cn'
import { useAppStore } from '@/state/store'
import { formatDate, layerVariable, mapLayerIds } from './layerData'
import { useActiveLayer, useVariables } from './useLayerInfo'

export default function LayerDebugControls({ className }: { className?: string }) {
  const id = useId()
  const mapLayer = useAppStore((s) => s.mapLayer)
  const setMapLayer = useAppStore((s) => s.setMapLayer)
  const setFrameIndex = useAppStore((s) => s.setFrameIndex)
  const variables = useVariables()
  const active = useActiveLayer()
  const layers = variables ? mapLayerIds(variables) : []

  return (
    <div
      role="group"
      aria-label="Temporary map layer debug controls"
      data-testid="layer-debug-controls"
      className={cn('glass flex w-72 flex-col gap-2 p-3 text-xs', className)}
    >
      <p className="font-medium text-amber-200">Temporary debug controls (until M4/M6)</p>
      <label htmlFor={`${id}-layer`} className="text-white/85">
        Map layer
      </label>
      <select
        id={`${id}-layer`}
        value={mapLayer ?? ''}
        onChange={(e) => setMapLayer(e.target.value || null)}
        className="rounded-md border border-white/20 bg-black/40 px-2 py-1 text-sm"
      >
        <option value="">None</option>
        {layers.map((l) => (
          <option key={l} value={l}>
            {(variables && layerVariable(variables, l)?.name) ?? l} ({l})
          </option>
        ))}
      </select>
      {active && (
        <>
          <label htmlFor={`${id}-frame`} className="flex justify-between text-white/85">
            <span>Frame</span>
            <span className="tabular-nums">
              {formatDate(active.step.date)} ({active.index + 1}/{active.timeline.length})
              {active.step.frame === null ? ', no data' : ''}
            </span>
          </label>
          <input
            id={`${id}-frame`}
            type="range"
            min={0}
            max={active.timeline.length - 1}
            step={1}
            value={active.index}
            aria-valuetext={`${formatDate(active.step.date, true)}${active.step.frame === null ? ', no data' : ''}`}
            onChange={(e) => setFrameIndex(Number(e.target.value))}
          />
        </>
      )}
    </div>
  )
}
