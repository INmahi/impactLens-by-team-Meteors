// Pure model for the time scroller: where each timeline step sits on the strip, which spans
// have no data, stepping by month or year, and year ticks. Positions are month numbers
// (year * 12 + month - 1); a monthly step covers one month, an annual step twelve.
import { dateSpan, type ModeStep } from '@/globe'

export interface StripSpan {
  /** [from, to) in month numbers. */
  from: number
  to: number
  hasData: boolean
  /** Outside the layer's own timeline (e.g. before its first frame): the thumb cannot go there. */
  outside: boolean
}

export interface ScrollerModel {
  /** [start, end) of the whole strip in month numbers. */
  start: number
  end: number
  stepStart: number[]
  stepEnd: number[]
  /** Merged runs of data / no data, covering [start, end) without overlap. */
  spans: StripSpan[]
  /** True when every step is a year (annual timeline). */
  annual: boolean
}

/** Builds the model for a mode's steps; `extra` widens the strip (e.g. the selected variable's record). */
export function buildScrollerModel(steps: ModeStep[], extra: [number, number] | null): ScrollerModel {
  const stepStart: number[] = []
  const stepEnd: number[] = []
  for (const s of steps) {
    const [a, b] = dateSpan(s.date)
    stepStart.push(a)
    stepEnd.push(b)
  }
  const first = stepStart[0] ?? 0
  const last = stepEnd[stepEnd.length - 1] ?? 1
  const start = extra ? Math.min(first, extra[0]) : first
  const end = extra ? Math.max(last, extra[1]) : last

  const spans: StripSpan[] = []
  const push = (from: number, to: number, hasData: boolean, outside: boolean) => {
    if (to <= from) return
    const prev = spans[spans.length - 1]
    if (prev && prev.to === from && prev.hasData === hasData && prev.outside === outside) prev.to = to
    else spans.push({ from, to, hasData, outside })
  }
  push(start, first, false, true)
  let cursor = first
  steps.forEach((s, i) => {
    push(cursor, stepStart[i], false, false) // a hole between listed dates is no data too
    push(stepStart[i], stepEnd[i], s.hasData, false)
    cursor = Math.max(cursor, stepEnd[i])
  })
  push(cursor, end, false, true)
  return { start, end, stepStart, stepEnd, spans, annual: steps.length > 0 && steps.every((s) => s.date.length === 4) }
}

/** Fraction 0..1 along the strip of a month position. */
export function fractionOf(model: ScrollerModel, month: number): number {
  const w = model.end - model.start
  return w > 0 ? (month - model.start) / w : 0
}

/** Centre of a step as a fraction of the strip. */
export function stepFraction(model: ScrollerModel, index: number): number {
  if (model.stepStart.length === 0) return 0
  const i = Math.min(Math.max(index, 0), model.stepStart.length - 1)
  return fractionOf(model, (model.stepStart[i] + model.stepEnd[i]) / 2)
}

/** Step nearest to a fraction of the strip (positions outside the layer clamp to its ends). */
export function indexAtFraction(model: ScrollerModel, f: number): number {
  const n = model.stepStart.length
  if (n === 0) return 0
  const month = model.start + Math.min(Math.max(f, 0), 1) * (model.end - model.start)
  // Last step that starts at or before `month`.
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (model.stepStart[mid] <= month) lo = mid
    else hi = mid - 1
  }
  if (month < model.stepStart[lo]) return lo // before the first step
  if (month < model.stepEnd[lo] || lo === n - 1) return lo
  // In a hole between steps: the nearer one.
  return month - model.stepEnd[lo] < model.stepStart[lo + 1] - month ? lo : lo + 1
}

/** One year forward (dir 1) or back (-1) from a step, clamped to the timeline. */
export function stepByYear(model: ScrollerModel, index: number, dir: 1 | -1): number {
  const n = model.stepStart.length
  if (n === 0) return 0
  const i = Math.min(Math.max(index, 0), n - 1)
  const target = model.stepStart[i] + 12 * dir
  if (dir > 0) {
    for (let k = i + 1; k < n; k++) if (model.stepStart[k] >= target) return k
    return n - 1
  }
  for (let k = i - 1; k >= 0; k--) if (model.stepStart[k] <= target) return k
  return 0
}

/** Year ticks: a "nice" interval so labels sit at least `minPx` apart. */
export function yearTicks(model: ScrollerModel, widthPx: number, minPx = 56): { year: number; f: number }[] {
  const y0 = Math.ceil(model.start / 12)
  const y1 = Math.floor((model.end - 1) / 12)
  const years = model.end / 12 - model.start / 12
  if (years <= 0 || widthPx <= 0) return []
  const pxPerYear = widthPx / years
  const every = [1, 2, 5, 10, 20, 25, 50, 100].find((k) => k * pxPerYear >= minPx) ?? 200
  const out: { year: number; f: number }[] = []
  for (let y = Math.ceil(y0 / every) * every; y <= y1; y += every) out.push({ year: y, f: fractionOf(model, y * 12) })
  return out
}
