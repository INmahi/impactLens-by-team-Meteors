// Plain-English text for a single-series trend result, following docs/stats/wording.md.
// Rules applied here: interval always with a rate; "not significant" is "cannot tell yet", never
// "no change"; no causal words; regional sea level is an area mean, never a town; rate series
// trends are speed-ups/slow-downs; cumulative slopes are average rates; low power is stated.
// Region and variable names come from the data files.
import type { Region, Variable } from '@trend/contract'
import { formatP, type CompareReport, type CorrelationReport, type DetectabilityReport, type TrendReport, type UncertaintyReport } from '@trend/stats'
import { formatStep, formatUnitsText, spanYears } from './useData'

/** Number formatting matched to the size of the value. */
export function fmt(x: number): string {
  const a = Math.abs(x)
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3
  return x.toFixed(d)
}

export function rateUnits(v: Variable): string {
  const u = formatUnitsText(v.units)
  // A rate's trend is "per year per year": write "Gt/yr per year", not "Gt/yr/yr".
  return /\/yr$/.test(u) ? `${u} per year` : `${u}/yr`
}

/** "Sea level averaged over the Bay of Bengal (northern) area", "Global mean sea level", "Ice mass of Greenland". */
export function subject(v: Variable, r: Region): string {
  const name = v.name.toLowerCase()
  if (r.kind === 'global') return `Global mean ${name}`
  if (r.kind === 'coastal_sea') return `${v.name} averaged over the ${r.name} area`
  return `${v.name} of ${r.name}`
}

export interface VerdictText {
  headline: string
  detail: string
  tone: 'significant' | 'not-significant'
}

export function trendVerdict(v: Variable, r: Region, rep: TrendReport): VerdictText {
  const u = rateUnits(v)
  const s = rep.slope
  const span = `${formatStep(rep.start)} – ${formatStep(rep.end)}`
  const interval = `95% interval ${fmt(s.lower)} to ${fmt(s.upper)} ${u}`
  const subj = subject(v, r)
  const years = spanYears(rep.start, rep.end)
  const lowPower = !rep.lowPower
    ? ''
    : rep.test.significant
      ? ` With only ${Math.round(years)} years of data, the size of this trend is uncertain; a few unusual years can move it.`
      : ` With only ${Math.round(years)} years of data, a real trend could still be missed.`
  const what = rep.kind === 'rate' ? 'speed-up or slow-down' : 'rate'

  if (!rep.test.significant) {
    return {
      tone: 'not-significant',
      headline: `Cannot tell yet whether this is changing.`,
      detail: `${subj}, ${span}: the estimated ${what} is ${fmt(s.perYear)} ${u} (${interval}), which could be zero (${formatP(rep.test.p)}).${lowPower}`,
    }
  }

  const up = s.perYear > 0
  let headline: string
  if (rep.kind === 'rate') {
    // ice_mass_rate: negative = loss, so a downward trend means more loss each year.
    headline = up
      ? `${subj} has been trending upward by about ${fmt(Math.abs(s.perYear))} ${u}: each year's change is moving toward less loss (ice loss is slowing down).`
      : `${subj} has been trending downward by about ${fmt(Math.abs(s.perYear))} ${u}: each year's change is moving toward more loss (ice loss is speeding up).`
  } else if (rep.kind === 'cumulative') {
    headline = `${subj} ${up ? 'grew' : 'fell'} at an average rate of about ${fmt(Math.abs(s.perYear))} ${u}.`
  } else {
    headline = `${subj} ${up ? 'rose' : 'fell'} by about ${fmt(Math.abs(s.perYear))} ${u}.`
  }
  return {
    tone: 'significant',
    headline,
    detail: `${span} (${interval}). ${rep.test.p < 0.001 ? 'A trend this strong would be very unlikely if there were no real trend' : 'A trend this strong would be unlikely if there were no real trend'} (${formatP(rep.test.p)}).${lowPower}`,
  }
}

/** Short interpretation lines. Never causal. */
/** Land-movement caveat for a coastal sea, chosen from the region's own notes. */
function landNote(r: Region): string | null {
  const ns = r.notes ?? []
  if (ns.some((n) => /subsid|is sinking/i.test(n))) return 'Land sinking is not included, so the rise felt on the coast is larger.'
  if (ns.some((n) => /land movement/i.test(n))) return 'Land moving up or down is not included, so the rise felt on a coast can be larger or smaller than this.'
  return null
}

/** Short interpretation lines. Never causal. `variables` lets the cumulative note point to a rate series only if one exists. */
export function interpretation(v: Variable, r: Region, rep: TrendReport, variables: Variable[] = []): string[] {
  const out: string[] = []
  const u = formatUnitsText(v.units)
  if (rep.test.significant) {
    out.push(
      rep.kind === 'rate'
        ? `At this pace the yearly change shifts by about ${fmt(Math.abs(rep.slope.perDecade))} ${u} every decade.`
        : `At this rate the change is about ${fmt(Math.abs(rep.slope.perDecade))} ${u} per decade.`,
    )
  }
  if (rep.kind === 'cumulative') {
    const rateVar = variables.find((x) => x.kind === 'rate' && x.regions.includes(r.id))
    out.push(
      rateVar
        ? `This is a running total, which always looks like a strong trend; the slope is the average rate over the period. The ${rateVar.name.toLowerCase()} series shows whether the change is speeding up.`
        : 'This is a running total, which always looks like a strong trend; the slope is the average rate over the period. It does not show whether the change is speeding up.',
    )
  }
  if (rep.kind === 'rate') {
    out.push('A trend in a rate is a speed-up or slow-down. It is not the rate itself.')
  }
  if (r.kind === 'coastal_sea') {
    out.push(`This is satellite sea level averaged over the ${r.name} area, not the value at any town.`)
    const ln = landNote(r)
    if (ln) out.push(ln)
  }
  if (r.kind === 'global' && /sea/i.test(v.name)) {
    out.push('This is the global mean. Local sea level differs from place to place.')
  }
  out.push('A trend says what changed, not why. Causes come from the science, not from this test.')
  return out
}

export function detectText(v: Variable, d: DetectabilityReport): string {
  const u = rateUnits(v)
  if (d.moreYears == null) return 'The current slope is zero, so we cannot estimate how long it would take to detect a trend.'
  if (d.moreYears === 0)
    return 'By the usual rule of thumb this record should be long enough; the trend may be weaker than the current estimate.'
  return `If the current trend (${fmt(d.slopePerYear)} ${u}) and the year-to-year noise continue, about ${d.moreYears} more years of data would give an 80% chance of detecting it. This is a rough guide, not a forecast.`
}

export function uncertaintyText(v: Variable, x: UncertaintyReport): string {
  const u = rateUnits(v)
  const base = `Including the uncertainty stated by the source, the ${v.kind === 'rate' ? 'speed-up or slow-down' : 'rate'} is ${fmt(x.fit.perYear)} ${u} (95% interval ${fmt(x.combined.lower)} to ${fmt(x.combined.upper)}).`
  const w = x.widening
  let tail: string
  if (w < 0.05) tail = " The source's stated uncertainty barely changes this."
  else if (w < 1) tail = ` That is ${Math.round(w * 100)}% wider than the fit alone.`
  else
    tail = ` That is about ${fmt(1 + w)} times as wide as the fit alone: the source's stated uncertainty, not the year-to-year scatter, limits how well this rate is known.`
  const corr = x.combined.model === 'correlated' ? ' Errors that persist over time matter most here.' : ''
  return base + tail + corr
}

// ---------- compare two regions (wording.md "Compare two regions") ----------

export function compareVerdict(v: Variable, A: Region, B: Region, rep: CompareReport): VerdictText & { notes: string[] } {
  const u = rateUnits(v)
  const a = rep.a.slope.perYear
  const b = rep.b.slope.perYear
  const d = rep.difference
  const span = `${formatStep(rep.start)} – ${formatStep(rep.end)}`
  const pText = formatP(rep.p)
  const detail = `${fmt(a)} vs ${fmt(b)} ${u}, ${span}. Difference ${fmt(d.perYear)} ${u} (95% interval ${fmt(d.lower)} to ${fmt(d.upper)}), ${pText}.`
  const notes = [
    "Trends are compared, not levels: each region's series has its own zero.",
    'A difference in trends does not by itself say why the two differ.',
  ]
  if (!rep.crossCheck.agrees) notes.push('The cross-check disagrees; treat this as borderline.')
  if (rep.lowPower) notes.push(`With only ${Math.round(spanYears(rep.start, rep.end))} common years of data, a real difference could still be missed.`)

  const isRate = rep.a.kind === 'rate'
  const verb = (x: number) => (x >= 0 ? 'rising' : 'falling')

  if (rep.verdict === 'cannot_tell_apart') {
    return {
      tone: 'not-significant',
      headline: isRate
        ? `Cannot tell yet whether ${A.name}'s ice loss is speeding up faster than ${B.name}'s.`
        : 'Cannot tell these two trends apart yet.',
      detail: `${A.name} ${fmt(a)} and ${B.name} ${fmt(b)} ${u}; the difference (${fmt(d.perYear)}, 95% interval ${fmt(d.lower)} to ${fmt(d.upper)}) could be zero (${pText}).`,
      notes,
    }
  }
  // ice_mass_rate is the only 'rate' variable (negative = loss); a new rate variable needs its own text.
  if (isRate && rep.verdict === 'different_directions') {
    const [spd, slw] = a < 0 ? [A, B] : [B, A]
    return { tone: 'significant', headline: `${spd.name}'s ice loss is speeding up while ${slw.name}'s is slowing down.`, detail, notes }
  }
  if (rep.verdict === 'different_directions') {
    const [up, down] = a >= 0 ? [A, B] : [B, A]
    return { tone: 'significant', headline: `${subject(v, up)} is rising, while ${subject(v, down).replace(/^./, (ch) => ch.toLowerCase())} is falling.`, detail, notes }
  }
  const [fast, slow, sFast] = rep.verdict === 'a_faster' ? [A, B, a] : [B, A, b]
  let headline = `${subject(v, fast)} is ${verb(sFast)} faster than in ${slow.kind === 'global' ? 'the global mean' : slow.name}.`
  if (isRate) headline = `${fast.name}'s ice loss is ${sFast < 0 ? 'speeding up' : 'slowing down'} faster than ${slow.name}'s.`
  if (/sea/i.test(v.name) && fast.kind === 'coastal_sea' && slow.kind === 'global' && sFast > 0) {
    headline = `Sea level averaged over the ${fast.name} area rose faster than the global mean.`
    const ln = landNote(fast)
    if (ln) notes.push(ln)
  }
  return { tone: 'significant', headline, detail, notes }
}

// ---------- two variables (wording.md "Two variables: correlation") ----------

export function correlationText(X: Variable, Y: Variable, c: CorrelationReport, r?: Region): string {
  // Rule 4: any temperature association for Antarctica carries the ocean sentence.
  const antarctic = !!r && /^antarctica/.test(r.id) && (X.id === 'temperature' || Y.id === 'temperature')
  const tail = antarctic
    ? ' Antarctic ice loss is driven mainly by warm ocean water reaching West Antarctic glaciers; this association with air temperature is not a melt mechanism.'
    : ''
  return correlationBody(X, Y, c) + tail
}

function correlationBody(X: Variable, Y: Variable, c: CorrelationReport): string {
  const d = c.detrended
  const r0 = c.raw
  if (d.pearson.significant) {
    return `After removing both trends, the year-to-year ups and downs of ${X.name.toLowerCase()} and ${Y.name.toLowerCase()} move together (r = ${d.pearson.r.toFixed(2)}, ${formatP(d.pearson.p)}, about ${Math.round(d.nEff)} independent points). This does not show that one causes the other. (Before removing the trends: r = ${r0.pearson.r.toFixed(2)}.)`
  }
  if (r0.pearson.significant) {
    return `${X.name} and ${Y.name.toLowerCase()} both trend over the record, so they look correlated (r = ${r0.pearson.r.toFixed(2)}). After removing the trends, their year-to-year changes are not significantly related: cannot tell yet.`
  }
  return `No clear link between ${X.name.toLowerCase()} and ${Y.name.toLowerCase()} in this record: cannot tell yet.`
}
