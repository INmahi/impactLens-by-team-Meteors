import { normPpf } from './distributions.ts';

export interface SenSlopeResult {
  /** Median of all pairwise slopes, in y-units per t-unit. */
  slope: number;
  /** Intercept: median(y) - slope * median(t). */
  intercept: number;
  /** Lower bound of the confidence interval on the slope. */
  lower: number;
  /** Upper bound of the confidence interval on the slope. */
  upper: number;
  /** Number of valid points used. */
  n: number;
}

export function median(sorted: ArrayLike<number>): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const mid = n >> 1;
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function sortedCopy(x: ArrayLike<number>): Float64Array {
  return Float64Array.from(x as ArrayLike<number>).sort();
}

/** Round half to even, like numpy.round. */
function roundHalfEven(x: number): number {
  const r = Math.round(x);
  if (Math.abs(x - Math.trunc(x)) === 0.5) return 2 * Math.round(x / 2);
  return r;
}

/** Sum of k(k-1)(2k+5) over groups of tied values. */
export function tieTerm(x: ArrayLike<number>): number {
  const s = sortedCopy(x);
  let total = 0;
  let run = 1;
  for (let i = 1; i <= s.length; i++) {
    if (i < s.length && s[i] === s[i - 1]) {
      run++;
    } else {
      if (run > 1) total += run * (run - 1) * (2 * run + 5);
      run = 1;
    }
  }
  return total;
}

/**
 * Theil-Sen slope with a confidence interval (Sen 1968).
 * Matches scipy.stats.theilslopes(y, t, alpha=confidence).
 *
 * Pass real time values in `t` (decimal years), so gaps and uneven
 * spacing are handled correctly. Non-finite points are dropped.
 *
 * `varianceInflation` widens the interval for autocorrelated data: pass the
 * `correction` factor from a corrected Mann-Kendall test. With the default
 * of 1 the interval assumes independent observations.
 */
export function senSlope(
  t: ArrayLike<number>,
  y: ArrayLike<number>,
  confidence = 0.95,
  varianceInflation = 1,
): SenSlopeResult {
  if (t.length !== y.length) throw new Error('t and y must have the same length');
  const tt: number[] = [];
  const yy: number[] = [];
  for (let i = 0; i < y.length; i++) {
    if (Number.isFinite(t[i]) && Number.isFinite(y[i])) {
      tt.push(t[i]);
      yy.push(y[i]);
    }
  }
  const n = yy.length;
  if (n < 2) return { slope: NaN, intercept: NaN, lower: NaN, upper: NaN, n };

  const slopesArr = new Float64Array((n * (n - 1)) / 2);
  let m = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dt = tt[i] - tt[j];
      if (dt > 0) slopesArr[m++] = (yy[i] - yy[j]) / dt;
    }
  }
  const slopes = slopesArr.subarray(0, m).sort();
  if (m === 0) return { slope: NaN, intercept: NaN, lower: NaN, upper: NaN, n };

  const slope = median(slopes);
  const intercept = median(sortedCopy(yy)) - slope * median(sortedCopy(tt));

  let alpha = confidence;
  if (alpha > 0.5) alpha = 1 - alpha;
  const z = normPpf(alpha / 2);
  const sigsq = (varianceInflation * (n * (n - 1) * (2 * n + 5) - tieTerm(tt) - tieTerm(yy))) / 18;
  const sigma = Math.sqrt(sigsq);
  let lower = NaN;
  let upper = NaN;
  if (Number.isFinite(sigma)) {
    const ru = Math.min(roundHalfEven((m - z * sigma) / 2), m - 1);
    const rl = Math.max(roundHalfEven((m + z * sigma) / 2) - 1, 0);
    lower = slopes[rl];
    upper = slopes[ru];
  }
  return { slope, intercept, lower, upper, n };
}

// ---------------------------------------------------------------------------
// Fast Sen's slope for resampling loops (M5, decision D2.3).

let pairBuffer = new Float64Array(0);

/** k-th smallest (0-based) of a[0..n), partially reordering a (Numerical Recipes `select`). */
function selectKth(a: Float64Array, n: number, k: number): number {
  let l = 0;
  let ir = n - 1;
  for (;;) {
    if (ir <= l + 1) {
      if (ir === l + 1 && a[ir] < a[l]) { const s = a[l]; a[l] = a[ir]; a[ir] = s; }
      return a[k];
    }
    const mid = (l + ir) >> 1;
    let s = a[mid]; a[mid] = a[l + 1]; a[l + 1] = s;
    if (a[l] > a[ir]) { s = a[l]; a[l] = a[ir]; a[ir] = s; }
    if (a[l + 1] > a[ir]) { s = a[l + 1]; a[l + 1] = a[ir]; a[ir] = s; }
    if (a[l] > a[l + 1]) { s = a[l]; a[l] = a[l + 1]; a[l + 1] = s; }
    let i = l + 1;
    let j = ir;
    const pivot = a[l + 1];
    for (;;) {
      do i++; while (a[i] < pivot);
      do j--; while (a[j] > pivot);
      if (j < i) break;
      s = a[i]; a[i] = a[j]; a[j] = s;
    }
    a[l + 1] = a[j];
    a[j] = pivot;
    if (j >= k) ir = j - 1;
    if (j <= k) l = i;
  }
}

/**
 * Sen's slope only (no interval): the same number as `senSlope(t, y).slope`,
 * found by selection instead of a full sort. Non-finite points are skipped.
 */
export function senSlopeValue(t: ArrayLike<number>, y: ArrayLike<number>): number {
  const tt: number[] = [];
  const yy: number[] = [];
  for (let i = 0; i < y.length; i++) {
    if (Number.isFinite(t[i]) && Number.isFinite(y[i])) {
      tt.push(t[i]);
      yy.push(y[i]);
    }
  }
  const n = yy.length;
  if (n < 2) return NaN;
  const need = (n * (n - 1)) / 2;
  if (pairBuffer.length < need) pairBuffer = new Float64Array(need);
  const buf = pairBuffer;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const ti = tt[i];
    const yi = yy[i];
    for (let j = i + 1; j < n; j++) {
      const d = tt[j] - ti;
      if (d > 0) buf[m++] = (yy[j] - yi) / d;
      else if (d < 0) buf[m++] = (yi - yy[j]) / (ti - tt[j]);
    }
  }
  if (m === 0) return NaN;
  const k = m >> 1;
  const hi = selectKth(buf, m, k);
  if (m % 2 === 1) return hi;
  let lo = -Infinity;
  for (let i = 0; i < k; i++) if (buf[i] > lo) lo = buf[i];
  return (lo + hi) / 2;
}
