// Legend for the active map mode. Everything comes from data: the layer's manifest.json
// (title via `name`, units, range, source), its colormap.png (the same file the shader
// samples), variables.json, and the outlines file. Nothing is hard-coded per variable.
// - grid mode: colour bar with units and the fixed range
// - outline mode: line key, current year vs the earliest-year ghost
// - selected variable without a map (e.g. sea level): a short note
// Renders nothing when no mode is active and the variable has a map.
import { cn } from 'cn'
import { colormapUrl, formatDate, formatUnits, formatValue } from './layerData'
import { earliestOutlineYear, modeLabel, OUTLINE_STYLE, yearOf } from './mapModes'
import { useActiveMode, useVariables, useVariableWithoutMap, type ActiveMode } from './useLayerInfo'

export default function MapLegend({ className }: { className?: string }) {
  const active = useActiveMode()
  const noMap = useVariableWithoutMap()
  if (noMap) return <NoMapNote name={noMap.name} className={className} />
  if (!active) return null
  return active.mode.kind === 'grid' ? (
    <GridLegend active={active} className={className} />
  ) : (
    <OutlineLegend active={active} className={className} />
  )
}

/** "Sea level has no map layer" (name from variables.json). */
export function NoMapNote({ name, className }: { name: string; className?: string }) {
  return (
    <p role="status" data-testid="no-map-note" className={cn('glass-strong px-3 py-2 text-sm text-white/90', className)}>
      {name} has no map layer.
    </p>
  )
}

function LegendHeader({ title, titleId, date }: { title: string; titleId: string; date: string }) {
  return (
    <header className="flex items-baseline justify-between gap-3">
      <h2 id={titleId} className="font-semibold leading-tight">
        {title}
      </h2>
      <time dateTime={date} className="shrink-0 text-xs tabular-nums text-white/85" aria-live="polite">
        {formatDate(date, true)}
      </time>
    </header>
  )
}

function GridLegend({ active, className }: { active: ActiveMode; className?: string }) {
  const variables = useVariables()
  const { mode, manifest, step, variable } = active
  if (!manifest) return null
  const layer = mode.id
  const title = modeLabel(variables, mode, manifest)
  const units = formatUnits(manifest.units)
  const [vmin, vmax] = manifest.valueRange
  const mid = (vmin + vmax) / 2
  const minText = `${formatValue(vmin)} ${units}`
  const maxText = `${formatValue(vmax)} ${units}`
  const missing = !step.hasData
  const titleId = `map-legend-title-${layer}`

  return (
    <section
      aria-labelledby={titleId}
      data-testid="map-legend"
      className={cn('glass-strong flex w-72 flex-col gap-2 p-3 text-sm', className)}
    >
      <LegendHeader title={title} titleId={titleId} date={step.date} />

      {missing && (
        <p role="status" className="rounded-md border border-dashed border-white/40 px-2 py-1 text-xs text-white/90">
          No data for {formatDate(step.date, true)}: gap in the record, map hidden.
        </p>
      )}

      <figure className="m-0 flex flex-col gap-1">
        <img
          src={colormapUrl(layer)}
          alt=""
          aria-hidden
          draggable={false}
          className={cn('h-3 w-full rounded-sm border border-white/20', missing && 'opacity-40')}
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="grid grid-cols-3 text-xs tabular-nums text-white/90" aria-hidden>
          <span>{minText}</span>
          <span className="text-center">{formatValue(mid)}</span>
          <span className="text-right">{maxText}</span>
        </div>
        <figcaption className="sr-only">
          Colour scale from {minText} at the left to {maxText} at the right.
        </figcaption>
      </figure>

      <p className="text-xs text-white/80">
        Fixed colour range in {units}; values beyond it show the end colours.
        {manifest.fadeNearZero && ' Values near 0 are left uncoloured, so the map underneath shows.'}
        {manifest.glow && ' Losses glow: brighter and redder means more ice or water lost.'}
        {variable?.baseline && ` Anomaly relative to ${variable.baseline[0]}–${variable.baseline[1]}.`}
      </p>
      {manifest.note && <p className="text-xs text-white/90">{manifest.note}</p>}
      {manifest.source && <p className="text-xs text-white/80">Source: {manifest.source.name}</p>}
    </section>
  )
}

function LineSample({ css, alpha, width, dashPx }: { css: string; alpha: number; width: number; dashPx?: number }) {
  return (
    <svg width="32" height="10" viewBox="0 0 32 10" aria-hidden className="shrink-0">
      <line
        x1="1"
        y1="5"
        x2="31"
        y2="5"
        stroke={css}
        strokeOpacity={alpha}
        strokeWidth={width}
        strokeDasharray={dashPx ? `${dashPx / 2} ${dashPx / 3}` : undefined}
        strokeLinecap="round"
      />
    </svg>
  )
}

function OutlineLegend({ active, className }: { active: ActiveMode; className?: string }) {
  const variables = useVariables()
  const { mode, outlines, step, variable } = active
  if (!outlines) return null
  const title = modeLabel(variables, mode)
  const year = yearOf(step.date)
  const earliest = earliestOutlineYear(outlines)
  const missing = !step.hasData
  const titleId = `map-legend-title-${mode.id}`

  return (
    <section
      aria-labelledby={titleId}
      data-testid="map-legend"
      className={cn('glass-strong flex w-72 flex-col gap-2 p-3 text-sm', className)}
    >
      <LegendHeader title={title} titleId={titleId} date={step.date} />

      {missing && (
        <p role="status" className="rounded-md border border-dashed border-white/40 px-2 py-1 text-xs text-white/90">
          No outline for {year}: gap in the record.
        </p>
      )}

      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-white/90">
        <li className={cn('flex items-center gap-2', missing && 'opacity-50')}>
          <LineSample {...OUTLINE_STYLE.current} />
          <span>
            Outline in <span className="tabular-nums">{year}</span>
          </span>
        </li>
        {earliest && (
          <li className="flex items-center gap-2">
            <LineSample {...OUTLINE_STYLE.ghost} />
            <span>
              Earliest outline, <span className="tabular-nums">{earliest}</span> (for comparison)
            </span>
          </li>
        )}
      </ul>

      {mode.kind === 'outline' && mode.frequency === 'monthly' && (
        <p className="text-xs text-white/80">One outline per year; each month shows its year&apos;s outline.</p>
      )}
      {variable?.source && <p className="text-xs text-white/80">Source: {variable.source.name}</p>}
    </section>
  )
}
