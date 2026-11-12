// Map mode picker: the modes from variables.json (grid layers, then outline layers) plus "None".
// Native radio inputs in a fieldset: arrow keys move between options, Tab enters and leaves
// the group, screen readers announce "radio, 2 of 4". Writes the mode id to store `mapLayer`.
// When the selected variable has no map (e.g. sea level), the group is disabled with a note.
import { useEffect, useId, useState } from 'react'
import { cn } from 'cn'
import type { Manifest } from '@trend/contract'
import { useAppStore } from '@/state/store'
import { getManifest } from './layerData'
import { modeLabel, yearOf, type MapMode } from './mapModes'
import { useMapModes, useVariables, useVariableWithoutMap } from './useLayerInfo'

/** Manifests of the grid modes (for `name` and the year span), loaded once and cached. */
function useGridManifests(modes: MapMode[] | null): Map<string, Manifest> {
  const [manifests, setManifests] = useState<Map<string, Manifest>>(new Map())
  const key = modes?.filter((m) => m.kind === 'grid').map((m) => m.id).join('|') ?? ''
  useEffect(() => {
    if (!key) return
    let alive = true
    Promise.allSettled(key.split('|').map((id) => getManifest(id).then((m) => [id, m] as const))).then((results) => {
      if (!alive) return
      setManifests(new Map(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))))
    })
    return () => {
      alive = false
    }
  }, [key])
  return manifests
}

function yearSpan(mode: MapMode, manifest: Manifest | undefined): string | null {
  if (mode.kind === 'outline') return `${yearOf(mode.period[0])}–${yearOf(mode.period[1])}`
  const dates = manifest ? [...manifest.frames.map((f) => f.date), ...manifest.missing].sort() : []
  return dates.length ? `${yearOf(dates[0])}–${yearOf(dates[dates.length - 1])}` : null
}

export default function MapModePicker({ className }: { className?: string }) {
  const id = useId()
  const mapLayer = useAppStore((s) => s.mapLayer)
  const setMapLayer = useAppStore((s) => s.setMapLayer)
  const setPlaying = useAppStore((s) => s.setPlaying)
  const variables = useVariables()
  const modes = useMapModes()
  const manifests = useGridManifests(modes)
  const noMap = useVariableWithoutMap()
  if (!modes) return null

  const selected = modes.some((m) => m.id === mapLayer) ? mapLayer : null
  const options: { value: string | null; label: string; span: string | null }[] = [
    ...modes.map((m) => ({ value: m.id, label: modeLabel(variables, m, manifests.get(m.id)), span: yearSpan(m, manifests.get(m.id)) })),
    { value: null, label: 'None', span: null },
  ]
  const noteId = `${id}-note`

  return (
    <fieldset
      data-testid="map-mode-picker"
      disabled={!!noMap}
      aria-describedby={noMap ? noteId : undefined}
      className={cn('glass-strong m-0 flex w-64 min-w-0 flex-col gap-1 p-2 text-sm', className)}
    >
      <legend className="float-left mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-white/85">Map</legend>
      {options.map((o) => {
        const checked = noMap ? false : selected === o.value
        return (
          <label
            key={o.value ?? '__none'}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-xl border px-2 py-1.5 text-white/90',
              'has-focus-visible:outline-solid has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
              checked ? 'border-white/30 bg-white/15 text-white' : 'border-transparent hover:bg-white/10',
              noMap && 'cursor-not-allowed opacity-60 hover:bg-transparent',
            )}
          >
            <input
              type="radio"
              name={`${id}-mode`}
              className="sr-only"
              checked={checked}
              onChange={() => {
                setPlaying(false)
                setMapLayer(o.value)
              }}
            />
            <span
              aria-hidden
              className={cn(
                'mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full border',
                checked ? 'border-white' : 'border-white/60',
              )}
            >
              {checked && <span className="size-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0 flex-1 leading-tight">{o.label}</span>
            {o.span && <span className="shrink-0 pt-px text-xs tabular-nums text-white/80">{o.span}</span>}
          </label>
        )
      })}
      {noMap && (
        <p id={noteId} role="status" className="px-1 pt-1 text-xs text-white/90">
          {noMap.name} has no map layer.
        </p>
      )}
    </fieldset>
  )
}
