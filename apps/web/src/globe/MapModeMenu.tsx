// Map modes as one button in the top-right corner (boss, 2026-11-14): the button shows the active layer's
// icon; hovering it (mouse) or clicking/tapping it opens the list of layers, with the legend toggle at the end.
// Native radios keep keyboard and screen-reader behaviour (arrow keys move, Tab enters and leaves the group).
// Escape or focus/pointer leaving the menu closes it. The list is positioned against the nearest positioned
// ancestor (the top-right control row), so it lines up with the screen corner.
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, EyeOff, Info } from 'lucide-react'
import { cn } from 'cn'
import { useAppStore } from '@/state/store'
import { modeLabel } from './mapModes'
import { iconFor, useGridManifests, yearSpan } from './MapModeTray'
import { useMapModes, useVariables, useVariableWithoutMap } from './useLayerInfo'

export default function MapModeMenu({
  legendOpen,
  onToggleLegend,
  className,
}: {
  legendOpen: boolean
  onToggleLegend: () => void
  className?: string
}) {
  const id = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const open = hovered || pinned
  const mapLayer = useAppStore((s) => s.mapLayer)
  const setMapLayer = useAppStore((s) => s.setMapLayer)
  const setPlaying = useAppStore((s) => s.setPlaying)
  const variables = useVariables()
  const modes = useMapModes()
  const manifests = useGridManifests(modes)
  const noMap = useVariableWithoutMap()

  // A click or tap anywhere else (the globe included) closes a pinned menu.
  useEffect(() => {
    if (!pinned) return
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPinned(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

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
  const current = noMap ? options[options.length - 1] : (options.find((o) => o.value === selected) ?? options[options.length - 1])
  const menuId = `${id}-menu`
  const buttonLabel = noMap ? `Map layer: ${noMap.name} has no map layer` : `Map layer: ${current.label}`

  return (
    <div
      ref={rootRef}
      className={cn('pointer-events-auto', className)}
      onPointerEnter={(e) => e.pointerType === 'mouse' && setHovered(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setHovered(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPinned(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setPinned(false)
          setHovered(false)
          buttonRef.current?.focus()
        }
      }}
    >
      <div className="glass p-1">
        <button
          ref={buttonRef}
          type="button"
          data-testid="map-mode-button"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={buttonLabel}
          title={buttonLabel}
          onClick={() => setPinned((p) => !p)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] font-medium text-white hover:bg-white/10',
            open && 'bg-white/10',
          )}
        >
          <current.Icon className="size-3.5" aria-hidden />
          <span>Map</span>
          <ChevronDown className={cn('size-3.5 text-white/70 transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {/* pt-2 bridges the gap so the pointer can travel from the button into the list without closing it. */}
      <div
        id={menuId}
        className={cn(
          'absolute right-0 top-full z-40 pt-2 transition-[opacity,translate] duration-150 motion-reduce:transition-none',
          open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-1 opacity-0',
        )}
      >
        <div className="glass-strong flex w-72 flex-col gap-1 p-1.5 text-sm">
          <fieldset data-testid="map-mode-picker" disabled={!!noMap} className="m-0 flex min-w-0 flex-col gap-0.5 border-0 p-0">
            <legend className="mb-1 px-2 pt-1 text-xs font-semibold uppercase tracking-wide text-white/70">Map layer</legend>
            {options.map((o) => {
              const checked = noMap ? false : selected === o.value
              return (
                <label
                  key={o.value ?? '__none'}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-1.5 text-white/90',
                    'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring',
                    checked ? 'bg-sky-300 text-slate-950' : 'hover:bg-white/10',
                    noMap && 'cursor-not-allowed opacity-50 hover:bg-transparent',
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
                  <o.Icon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 leading-tight">{o.label}</span>
                  {o.span && <span className={cn('shrink-0 text-xs tabular-nums', checked ? 'text-slate-900/80' : 'text-white/65')}>{o.span}</span>}
                </label>
              )
            })}
          </fieldset>
          {noMap && <p className="px-2 pb-1 text-xs text-white/85">{noMap.name} has no map layer.</p>}
          <div className="mx-1 my-0.5 h-px bg-white/10" aria-hidden />
          <button
            type="button"
            aria-pressed={legendOpen}
            onClick={onToggleLegend}
            className={cn('flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-white/90 hover:bg-white/10', legendOpen && 'text-white')}
          >
            <Info className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{legendOpen ? 'Hide map legend' : 'Show map legend'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
