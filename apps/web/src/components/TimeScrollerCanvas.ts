// Draws the time scroller strip on a canvas: data spans as a solid bar, no-data spans hatched
// (missing dates, holes, and time outside the layer's record), year ticks and labels.
// Redrawn only when the timeline or the size changes; the thumb is a separate DOM element.
import { yearTicks, type ScrollerModel } from './TimeScrollerModel'

export const STRIP_COLORS = {
  track: 'rgba(255, 255, 255, 0.10)',
  data: 'rgba(125, 211, 252, 0.9)', // sky-300
  noDataFill: 'rgba(251, 191, 36, 0.16)',
  noDataHatch: 'rgba(251, 191, 36, 0.95)', // amber-400
  tick: 'rgba(255, 255, 255, 0.55)',
  label: 'rgba(255, 255, 255, 0.9)',
} as const

/** Bar geometry in CSS pixels, shared with the thumb layout. */
export const BAR_TOP = 6
export const BAR_HEIGHT = 12

let hatchPattern: { ctx: CanvasRenderingContext2D; dpr: number; pattern: CanvasPattern | null } | null = null

function hatch(ctx: CanvasRenderingContext2D, dpr: number): CanvasPattern | string {
  if (hatchPattern && hatchPattern.ctx === ctx && hatchPattern.dpr === dpr) return hatchPattern.pattern ?? STRIP_COLORS.noDataHatch
  const size = Math.round(6 * dpr)
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const t = tile.getContext('2d')
  let pattern: CanvasPattern | null = null
  if (t) {
    t.fillStyle = STRIP_COLORS.noDataFill
    t.fillRect(0, 0, size, size)
    t.strokeStyle = STRIP_COLORS.noDataHatch
    t.lineWidth = Math.max(1, 1.5 * dpr)
    t.beginPath()
    // Diagonal stripes that tile seamlessly.
    t.moveTo(-size / 2, size / 2)
    t.lineTo(size / 2, -size / 2)
    t.moveTo(0, size)
    t.lineTo(size, 0)
    t.moveTo(size / 2, size * 1.5)
    t.lineTo(size * 1.5, size / 2)
    t.stroke()
    pattern = ctx.createPattern(tile, 'repeat')
    // The context is scaled by dpr; scale the device-pixel tile back so stripes stay 6 CSS px.
    pattern?.setTransform(new DOMMatrix([1 / dpr, 0, 0, 1 / dpr, 0, 0]))
  }
  hatchPattern = { ctx, dpr, pattern }
  return pattern ?? STRIP_COLORS.noDataHatch
}

/** Draws the strip into a canvas whose backing store is cssWidth*dpr by cssHeight*dpr. */
export function drawStrip(canvas: HTMLCanvasElement, model: ScrollerModel, cssWidth: number, cssHeight: number, dpr: number): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.scale(dpr, dpr)

  const w = model.end - model.start
  if (w <= 0 || cssWidth <= 0) return
  const x = (m: number) => ((m - model.start) / w) * cssWidth

  // Track
  ctx.fillStyle = STRIP_COLORS.track
  ctx.fillRect(0, BAR_TOP, cssWidth, BAR_HEIGHT)

  // Spans. Every no-data span gets at least 2 px so a single missing month stays visible.
  const pattern = hatch(ctx, dpr)
  for (const s of model.spans) {
    const x0 = x(s.from)
    const x1 = x(s.to)
    if (s.hasData) {
      ctx.fillStyle = STRIP_COLORS.data
      ctx.fillRect(x0, BAR_TOP, x1 - x0, BAR_HEIGHT)
    }
  }
  for (const s of model.spans) {
    if (s.hasData) continue
    let x0 = x(s.from)
    let x1 = x(s.to)
    if (x1 - x0 < 2) {
      const c = (x0 + x1) / 2
      x0 = c - 1
      x1 = c + 1
    }
    ctx.fillStyle = pattern
    ctx.fillRect(x0, BAR_TOP, x1 - x0, BAR_HEIGHT)
    // Edge marks so short gaps read as gaps even at a glance.
    ctx.fillStyle = STRIP_COLORS.noDataHatch
    ctx.fillRect(x0, BAR_TOP + BAR_HEIGHT - 2, x1 - x0, 2)
  }

  // Year ticks and labels below the bar.
  ctx.font = '11px "Geist Variable", system-ui, sans-serif'
  ctx.textBaseline = 'top'
  const labelY = BAR_TOP + BAR_HEIGHT + 5
  for (const t of yearTicks(model, cssWidth)) {
    const tx = Math.round(t.f * cssWidth) + 0.5
    ctx.fillStyle = STRIP_COLORS.tick
    ctx.fillRect(tx - 0.5, BAR_TOP + BAR_HEIGHT, 1, 4)
    const label = String(t.year)
    const tw = ctx.measureText(label).width
    const lx = Math.min(Math.max(tx - tw / 2, 0), cssWidth - tw)
    if (labelY + 11 <= cssHeight) {
      ctx.fillStyle = STRIP_COLORS.label
      ctx.fillText(label, lx, labelY)
    }
  }
}
