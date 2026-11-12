// Shared series preparation for the M5 additions (compare, correlate,
// sensitivity, uncertainty, detectability). Decision D2.2 in docs/stats/decisions.md.
//
// The grid convention is exactly the one used by analyzeTrend(): a monthly grid
// starts in January of the first year, t = year + (i + 0.5) / 12; an annual grid
// has t = year + 0.5. Monthly values are deseasonalised with deseasonalizeWithTrend.
import type { Frequency, SeriesKind } from './analyze.ts';
import { deseasonalizeWithTrend } from './mannKendall.ts';
import { senSlope } from './senSlope.ts';

/** One series as the app has it (a `series/{region}.json` file maps onto this directly). */
export interface SeriesInput {
  /** "YYYY-MM" for monthly series, "YYYY" for annual series. */
  dates: string[];
  /** One value per date; null or NaN where missing. */
  values: (number | null)[];
  frequency: Frequency;
  kind?: SeriesKind;
  /** Optional; when both series of a comparison carry units they must match. */
  units?: string;
  /** Source 1-sigma per date (used only by the uncertainty propagation). */
  sigma?: (number | null)[];
}

export interface Grid {
  frequency: Frequency;
  /** Year of the first grid slot (monthly grids start in January of this year). */
  originYear: number;
  /** Decimal-year time of each slot. */
  t: number[];
  /** Values as reported (NaN where missing or outside the range). */
  raw: number[];
  /** Analysed values: deseasonalised anomalies for monthly data, raw for annual. */
  y: number[];
  /** Source 1-sigma per slot (NaN where not given). */
  sigma: number[];
  /** Number of finite values in y. */
  n: number;
}

/** Minimum valid months for a calendar-year mean (D2.2). */
export const MIN_MONTHS_PER_YEAR = 9;

function parse(d: string): { year: number; month: number } {
  const [y, m] = d.split('-');
  return { year: Number(y), month: m === undefined ? 0 : Number(m) };
}

/** Convert a range bound to the format of `frequency` ("YYYY" or "YYYY-MM"). */
export function normaliseBound(d: string | undefined, frequency: Frequency, which: 'start' | 'end'): string | undefined {
  if (d === undefined) return undefined;
  const { year, month } = parse(d);
  if (frequency === 'annual') return String(year).padStart(4, '0');
  if (month === 0) return `${String(year).padStart(4, '0')}-${which === 'start' ? '01' : '12'}`;
  return d;
}

function num(v: number | null | undefined): number {
  return v === null || v === undefined ? NaN : v;
}

/** First and last date with a finite value inside [start, end], or null. */
export function validSpan(s: SeriesInput, start?: string, end?: string): { first: string; last: string } | null {
  let first: string | null = null;
  let last: string | null = null;
  for (let i = 0; i < s.dates.length; i++) {
    const d = s.dates[i];
    if (start !== undefined && d < start) continue;
    if (end !== undefined && d > end) continue;
    if (!Number.isFinite(num(s.values[i]))) continue;
    if (first === null || d < first) first = d;
    if (last === null || d > last) last = d;
  }
  return first === null || last === null ? null : { first, last };
}

/** Put a series on its regular grid over [start, end] (both in the series' own format). */
export function gridSeries(s: SeriesInput, start: string, end: string): Grid {
  const a = parse(start);
  const b = parse(end);
  const originYear = a.year;
  let size: number;
  let slot: (d: { year: number; month: number }) => number;
  if (s.frequency === 'monthly') {
    size = (b.year - originYear) * 12 + b.month;
    slot = (d) => (d.year - originYear) * 12 + (d.month - 1);
  } else {
    size = b.year - originYear + 1;
    slot = (d) => d.year - originYear;
  }
  if (!(size > 0)) throw new Error('Empty time range');
  const raw = new Array<number>(size).fill(NaN);
  const sigma = new Array<number>(size).fill(NaN);
  for (let i = 0; i < s.dates.length; i++) {
    const d = s.dates[i];
    if (d < start || d > end) continue;
    const k = slot(parse(d));
    if (k < 0 || k >= size) continue;
    raw[k] = num(s.values[i]);
    if (s.sigma) sigma[k] = num(s.sigma[i]);
  }
  const monthly = s.frequency === 'monthly';
  const y = monthly ? deseasonalizeWithTrend(raw, 12) : raw.slice();
  const t = raw.map((_, i) => (monthly ? originYear + (i + 0.5) / 12 : originYear + i + 0.5));
  let n = 0;
  for (const v of y) if (Number.isFinite(v)) n++;
  return { frequency: s.frequency, originYear, t, raw, y, sigma, n };
}

/**
 * Calendar-year means of a monthly series, after removing the seasonal cycle
 * (deseasonalizeWithTrend over the requested years). A year needs at least
 * MIN_MONTHS_PER_YEAR valid months, otherwise it is missing.
 */
export function toAnnual(s: SeriesInput, startYear?: number, endYear?: number): SeriesInput {
  if (s.frequency === 'annual') return s;
  const lo = startYear === undefined ? undefined : `${String(startYear).padStart(4, '0')}-01`;
  const hi = endYear === undefined ? undefined : `${String(endYear).padStart(4, '0')}-12`;
  let first: string | null = null;
  let last: string | null = null;
  for (const d of s.dates) {
    if (lo !== undefined && d < lo) continue;
    if (hi !== undefined && d > hi) continue;
    if (first === null || d < first) first = d;
    if (last === null || d > last) last = d;
  }
  if (first === null || last === null) throw new Error('No data in the selected range');
  const g = gridSeries(s, first, last);
  const nYears = Math.ceil(g.y.length / 12);
  const dates: string[] = [];
  const values: (number | null)[] = [];
  for (let k = 0; k < nYears; k++) {
    let sum = 0;
    let count = 0;
    for (let m = 0; m < 12; m++) {
      const v = g.y[k * 12 + m];
      if (v !== undefined && Number.isFinite(v)) { sum += v; count++; }
    }
    dates.push(String(g.originYear + k).padStart(4, '0'));
    values.push(count >= MIN_MONTHS_PER_YEAR ? sum / count : null);
  }
  return { dates, values, frequency: 'annual', kind: s.kind, units: s.units };
}

export interface Lag1 {
  /** Bias-corrected lag-1 autocorrelation, clipped to [0, 0.95] (0 when it cannot be estimated). */
  r: number;
  /** Raw gap-aware estimate before bias correction and clipping. */
  rRaw: number;
  /** Standard deviation of the residuals (divisor n - 1). */
  sd: number;
  n: number;
  /** Pairs of truly adjacent valid values. */
  pairs: number;
  /** False when there are too few points or pairs; then r = 0. */
  valid: boolean;
}

/**
 * Gap-aware lag-1 autocorrelation of a residual grid (NaN where missing), with
 * the same bias correction and clipping as the headline test (ar1MannKendall):
 * r = c1/c0 * (n-1)/pairs, then r + (1 + 4r)/n, clipped to [0, 0.95].
 */
export function lag1(resid: ArrayLike<number>, minN = 8): Lag1 {
  let n = 0;
  let mean = 0;
  for (let i = 0; i < resid.length; i++) {
    if (Number.isFinite(resid[i])) { mean += resid[i]; n++; }
  }
  mean /= n;
  let c0 = 0;
  let c1 = 0;
  let pairs = 0;
  for (let i = 0; i < resid.length; i++) {
    if (!Number.isFinite(resid[i])) continue;
    const a = resid[i] - mean;
    c0 += a * a;
    if (i + 1 < resid.length && Number.isFinite(resid[i + 1])) {
      c1 += a * (resid[i + 1] - mean);
      pairs++;
    }
  }
  const sd = n > 1 ? Math.sqrt(c0 / (n - 1)) : NaN;
  if (n < minN || pairs < 4 || !(c0 > 0)) return { r: 0, rRaw: NaN, sd, n, pairs, valid: false };
  const rRaw = ((c1 / c0) * (n - 1)) / pairs;
  let r = rRaw + (1 + 4 * rRaw) / n;
  r = Math.min(Math.max(r, 0), 0.95);
  return { r, rRaw, sd, n, pairs, valid: true };
}

/** Residuals from Sen's line against the slot index, as in ar1MannKendall (NaN kept in place). */
export function indexResiduals(values: ArrayLike<number>): { resid: number[]; slopePerStep: number } {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++) idx.push(i);
  const slopePerStep = senSlope(idx, values).slope;
  const resid: number[] = [];
  for (let i = 0; i < values.length; i++) {
    resid.push(Number.isFinite(values[i]) ? values[i] - (i + 1) * slopePerStep : NaN);
  }
  return { resid, slopePerStep };
}

/** Residuals from Sen's line against real time t (NaN kept in place). */
export function timeResiduals(t: ArrayLike<number>, y: ArrayLike<number>): { resid: number[]; slope: number } {
  const slope = senSlope(t, y).slope;
  const resid: number[] = [];
  for (let i = 0; i < y.length; i++) resid.push(Number.isFinite(y[i]) ? y[i] - slope * t[i] : NaN);
  return { resid, slope };
}

export interface AlignedPair {
  frequency: Frequency;
  a: SeriesInput;
  b: SeriesInput;
  /** Common period, in the format of `frequency`. */
  start: string;
  end: string;
  notes: string[];
}

/**
 * Reduce two series to one frequency (annual if they differ) and find their
 * common period inside an optional user range. Throws when they do not overlap.
 */
export function alignPair(a: SeriesInput, b: SeriesInput, start?: string, end?: string): AlignedPair {
  const notes: string[] = [];
  const frequency: Frequency = a.frequency === 'monthly' && b.frequency === 'monthly' ? 'monthly' : 'annual';
  let aa = a;
  let bb = b;
  if (frequency === 'annual') {
    const sy = start === undefined ? undefined : parse(start).year;
    const ey = end === undefined ? undefined : parse(end).year;
    if (a.frequency === 'monthly') aa = toAnnual(a, sy, ey);
    if (b.frequency === 'monthly') bb = toAnnual(b, sy, ey);
    if (a.frequency !== b.frequency) {
      notes.push(`One series is monthly and the other annual, so both are compared as calendar-year means (the seasonal cycle is removed first; a year needs at least ${MIN_MONTHS_PER_YEAR} of 12 months).`);
    }
  }
  const lo = normaliseBound(start, frequency, 'start');
  const hi = normaliseBound(end, frequency, 'end');
  const sa = validSpan(aa, lo, hi);
  const sb = validSpan(bb, lo, hi);
  if (!sa || !sb) throw new Error('One of the series has no data in the selected range');
  const s = sa.first > sb.first ? sa.first : sb.first;
  const e = sa.last < sb.last ? sa.last : sb.last;
  if (s > e) throw new Error('The two series do not overlap in time');
  if (s !== sa.first || s !== sb.first || e !== sa.last || e !== sb.last) {
    notes.push(`Only the period both series cover is used: ${s} to ${e}.`);
  }
  return { frequency, a: aa, b: bb, start: s, end: e, notes };
}

export function stepsPerYear(f: Frequency): number {
  return f === 'monthly' ? 12 : 1;
}
