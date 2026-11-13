// Map modes as a vertical icon tray (boss, 2026-11-13). One icon per mode from variables.json (grid layers,
// outline layers) plus "None". Hovering or focusing an icon slides out its name and years. Native radios
// (sr-only) keep keyboard and screen-reader behaviour: arrow keys move, Tab enters and leaves the group.
// Icons are chosen from what the layer shows (its kind and units), never from a mode id.
import { useEffect, useId, useState, type ComponentType } from 'react'
import { EyeOff, Info, Layers, Scale, Shapes, Thermometer } from 'lucide-react'
import { cn } from 'cn'
import type { Manifest } from '@trend/contract'
import { useAppStore } from '@/state/store'
import { getManifest } from './layerData'
import { modeLabel, yearOf, type MapMode } from './mapModes'
import { useMapModes, useVariables, useVariableWithoutMap } from './useLayerInfo'

export function useGridManifests(modes: MapMode[] | null): Map<string, Manifest> {
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

export function iconFor(mode: MapMode | null, manifest: Manifest | undefined): ComponentType<{ className?: string }> {
  if (!mode) return EyeOff
  if (mode.kind === 'outline') return Shapes
  const u = (manifest?.units ?? '').toLowerCase()
  if (u.includes('degc') || u.includes('°c') || u === 'k') return Thermometer
  if (u.includes('w.e') || u.includes('gt') || u.includes('mass')) return Scale
  return Layers
}

export function yearSpan(mode: MapMode, manifest: Manifest | undefined): string | null {
  if (mode.kind === 'outline') return `${yearOf(mode.period[0])}–${yearOf(mode.period[1])}`
  const dates = manifest ? [...manifest.frames.map((f) => f.date), ...manifest.missing].sort() : []
  return dates.length ? `${yearOf(dates[0])}–${yearOf(dates[dates.length - 1])}` : null
}

export default function MapModeTray({
  legendOpen,
  onToggleLegend,
  className,
}: {
  legendOpen: boolean
  onToggleLegend: () => void
  className?: string
}) {
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
  const options = [
    ...modes.map((m) => ({
      value: m.id as string | null,
      label: modeLabel(variables, m, manifests.get(m.id)),
      span: yearSpan(m, manifests.get(m.id)),
      Icon: iconFor(m, manifests.get(m.id)),
    })),
    { value: null as string | null, label: 'No map layer', span: null, Icon: EyeOff },
  ]

  const item = 'group/item relative grid size-10 place-items-center rounded-xl transition-colors'
  const pill =
    'pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-lg border border-white/15 bg-slate-950/90 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg backdrop-blur transition-all duration-150 group-hover/item:translate-x-0 group-hover/item:opacity-100 group-has-focus-visible/item:translate-x-0 group-has-focus-visible/item:opacity-100 motion-reduce:transition-none'

  return (
    <div className={cn('pointer-events-auto flex flex-col items-center gap-1', className)}>
      <fieldset
        data-testid="map-mode-picker"
        disabled={!!noMap}
        title={noMap ? `${noMap.name} has no map layer` : undefined}
        className="glass-strong m-0 flex flex-col items-center gap-1 rounded-2xl p-1.5"
      >
        <legend className="sr-only">Map layer</legend>
        {options.map((o) => {
          const checked = noMap ? false : selected === o.value
          return (
            <label
              key={o.value ?? '__none'}
              className={cn(
                item,
                'cursor-pointer text-white/85 has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
                checked ? 'bg-sky-300 text-slate-950 shadow' : 'hover:bg-white/10',
                noMap && 'cursor-not-allowed opacity-50 hover:bg-transparent',
              )}
            >
              <input
                type="radio"
                name={`${id}-mode`}
                className="sr-only"
                checked={checked}
                aria-label={`${o.label}${o.span ? `, ${o.span}` : ''}`}
                onChange={() => {
                  setPlaying(false)
                  setMapLayer(o.value)
                }}
              />
              <o.Icon className="size-[18px]" aria-hidden />
              <span aria-hidden className={pill}>
                <span className="font-medium">{o.label}</span>
                {o.span && <span className="ml-1.5 text-white/70 tabular-nums">{o.span}</span>}
              </span>
            </label>
          )
        })}
      </fieldset>
      <div className="glass-strong rounded-2xl p-1.5">
        <button
          type="button"
          aria-pressed={legendOpen}
          aria-label={legendOpen ? 'Hide map legend' : 'Show map legend'}
          onClick={onToggleLegend}
          className={cn(item, 'text-white/85 hover:bg-white/10', legendOpen && 'bg-white/15 text-white')}
        >
          <Info className="size-[18px]" aria-hidden />
          <span aria-hidden className={pill}>{legendOpen ? 'Hide legend' : 'Show legend'}</span>
        </button>
      </div>
      {noMap && <p className="sr-only">{`${noMap.name} has no map layer.`}</p>}
    </div>
  )
}
