// Colour legend for the active map layer. Everything comes from the layer's manifest.json,
// its colormap.png (the same file the shader samples) and variables.json; nothing is
// hard-coded per variable. Renders nothing when no map layer is active.
import { cn } from 'cn'
import { colormapUrl, formatDate, formatUnits, formatValue, layerVariable } from './layerData'
import { useActiveLayer, useVariables } from './useLayerInfo'

export default function MapLegend({ className }: { className?: string }) {
  const active = useActiveLayer()
  const variables = useVariables()
  if (!active) return null

  const { layer, manifest, step } = active
  const variable = variables ? layerVariable(variables, layer) : null
  const title = variable?.name ?? layer
  const units = formatUnits(manifest.units)
  const [vmin, vmax] = manifest.valueRange
  const mid = (vmin + vmax) / 2
  const minText = `${formatValue(vmin)} ${units}`
  const maxText = `${formatValue(vmax)} ${units}`
  const missing = step.frame === null
  const titleId = `map-legend-title-${layer}`

  return (
    <section
      aria-labelledby={titleId}
      data-testid="map-legend"
      className={cn('glass-strong flex w-72 flex-col gap-2 p-3 text-sm', className)}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="font-semibold leading-tight">
          {title}
        </h2>
        <time dateTime={step.date} className="shrink-0 text-xs tabular-nums text-white/85" aria-live="polite">
          {formatDate(step.date, true)}
        </time>
      </header>

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

      <p className="text-xs text-white/75">
        Fixed colour range in {units}; values beyond it show the end colours.
        {variable?.baseline && ` Anomaly relative to ${variable.baseline[0]}–${variable.baseline[1]}.`}
      </p>
      {manifest.source && <p className="text-xs text-white/75">Source: {manifest.source.name}</p>}
    </section>
  )
}
