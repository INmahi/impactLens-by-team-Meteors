import { normPpf, normSf } from './distributions.ts';
import { median, senSlope, sortedCopy, tieTerm } from './senSlope.ts';

export type TrendDirection = 'increasing' | 'decreasing' | 'no trend';

export interface MannKendallResult {
  /** Which variant produced this result. */
  method: string;
  trend: TrendDirection;
  /** True when p < alpha. */
  significant: boolean;
  /** Two-sided p-value. */
  p: number;
  /** Standardized test statistic. */
  z: number;
  /** Kendall's tau. */
  tau: number;
  /** Mann-Kendall score S. */
  s: number;
  /** Variance of S used for the test (after any correction). */
  varS: number;
  /** Number of valid points used. */
  n: number;
  /** Variance inflation factor applied for autocorrelation (1 = none). */
  correction: number;
  /** Set when a correction could not be applied and the plain test was used. */
  warning?: string;
}

/** Keep finite values only, preserving order. */
function finite(x: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let i = 0; i < x.length; i++) if (Number.isFinite(x[i])) out.push(x[i]);
  return out;
}

/** Mann-Kendall score S = sum over i<j of sign(x[j] - x[i]). */
export function mkScore(x: ArrayLike<number>): number {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    const xi = x[i];
    for (let j = i + 1; j < n; j++) {
      const d = x[j] - xi;
      if (d > 0) s++;
      else if (d < 0) s--;
    }
  }
  return s;
}

/** Variance of S with the correction for tied values. */
export function mkVariance(x: ArrayLike<number>): number {
  const n = x.length;
  return (n * (n - 1) * (2 * n + 5) - tieTerm(x)) / 18;
}

function zScore(s: number, varS: number): number {
  if (s > 0) return (s - 1) / Math.sqrt(varS);
  if (s < 0) return (s + 1) / Math.sqrt(varS);
  return 0;
}

function finish(
  method: string,
  s: number,
  varS: number,
  denom: number,
  n: number,
  alpha: number,
  correction = 1,
  warning?: string,
): MannKendallResult {
  const z = zScore(s, varS);
  const p = Number.isFinite(z) ? 2 * normSf(Math.abs(z)) : NaN;
  const significant = p < alpha;
  const trend: TrendDirection = !significant ? 'no trend' : z > 0 ? 'increasing' : 'decreasing';
  const result: MannKendallResult = {
    method, trend, significant, p, z, tau: s / denom, s, varS, n, correction,
  };
  if (warning) result.warning = warning;
  return result;
}

/**
 * Original Mann-Kendall trend test (Mann 1945, Kendall 1975), with tie correction.
 * Assumes independent observations. Non-finite values are skipped.
 * Matches pymannkendall.original_test.
 */
export function mannKendall(values: ArrayLike<number>, alpha = 0.05): MannKendallResult {
  const x = finite(values);
  const n = x.length;
  return finish('Mann-Kendall', mkScore(x), mkVariance(x), 0.5 * n * (n - 1), n, alpha);
}

/** Average ranks (ties share the mean rank), like scipy.stats.rankdata. */
function rankAverage(x: number[]): number[] {
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b]);
  const ranks = new Array<number>(x.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && x[idx[j + 1]] === x[idx[i]]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k]] = r;
    i = j + 1;
  }
  return ranks;
}

/** Autocorrelation at lags 0..nlags (biased estimator, as in pymannkendall). */
export function acf(x: number[], nlags: number): number[] {
  const n = x.length;
  let mean = 0;
  for (const v of x) mean += v;
  mean /= n;
  const y = x.map((v) => v - mean);
  let c0 = 0;
  for (const v of y) c0 += v * v;
  const out: number[] = [];
  for (let k = 0; k <= nlags; k++) {
    let ck = 0;
    for (let i = 0; i + k < n; i++) ck += y[i] * y[i + k];
    out.push(ck / c0);
  }
  return out;
}

/** Sen's slope against the index 0..n-1, skipping non-finite values in place. */
function indexSlope(values: ArrayLike<number>): number {
  const idx: number[] = [];
  for (let i = 0; i < values.length; i++) idx.push(i);
  return senSlope(idx, values).slope;
}

/**
 * Hamed and Rao (1998) modified Mann-Kendall test.
 * Corrects the variance of S for autocorrelation, using the significant
 * autocorrelations of the ranks of the detrended series.
 * Use this as the default test for time series. Matches
 * pymannkendall.hamed_rao_modification_test.
 *
 * @param lag Number of lags to consider. Default: all lags.
 */
export function hamedRaoMannKendall(
  values: ArrayLike<number>,
  alpha = 0.05,
  lag?: number,
): MannKendallResult {
  const method = 'Modified Mann-Kendall (Hamed-Rao)';
  const x = finite(values);
  const n = x.length;
  const s = mkScore(x);
  const varS = mkVariance(x);
  const denom = 0.5 * n * (n - 1);
  if (n < 4) {
    return finish(method, s, varS, denom, n, alpha, 1, 'Too few points for the autocorrelation correction; plain test used.');
  }

  const maxLag = lag === undefined ? n : Math.min(lag + 1, n);
  const slope = indexSlope(values);
  const detrended = x.map((v, i) => v - (i + 1) * slope);
  const ranks = rankAverage(detrended);
  const rho = acf(ranks, maxLag - 1);
  const bound = normPpf(1 - alpha / 2) / Math.sqrt(n);

  let sni = 0;
  for (let i = 1; i < maxLag; i++) {
    if (rho[i] > bound || rho[i] < -bound) {
      sni += (n - i) * (n - i - 1) * (n - i - 2) * rho[i];
    }
  }
  const correction = 1 + (2 / (n * (n - 1) * (n - 2))) * sni;
  if (!(correction > 0)) {
    return finish(method, s, varS, denom, n, alpha, 1, 'Autocorrelation correction was not valid for this series; plain test used.');
  }
  return finish(method, s, varS * correction, denom, n, alpha, correction);
}

/**
 * Mann-Kendall test with an effective-sample-size correction for lag-1
 * autocorrelation. This is the app's headline test.
 *
 * The series is detrended with Sen's slope, the lag-1 autocorrelation r of the
 * residuals is estimated and corrected for its small-sample bias, and the
 * variance of S is multiplied by (1 + r) / (1 - r), the standard variance
 * inflation for an AR(1) process. Negative r is treated as zero, so the
 * correction can only make the test more cautious.
 *
 * `values` is a regular grid (one slot per month or year) with NaN where data
 * is missing. Gaps are respected: detrending uses each value's real position,
 * and r uses only pairs that are truly one step apart.
 */
export function ar1MannKendall(values: ArrayLike<number>, alpha = 0.05): MannKendallResult {
  const method = 'Mann-Kendall with autocorrelation correction (lag-1 effective sample size)';
  const x = finite(values);
  const n = x.length;
  const s = mkScore(x);
  const varS = mkVariance(x);
  const denom = 0.5 * n * (n - 1);
  if (n < 8) {
    return finish(method, s, varS, denom, n, alpha, 1, 'Too few points for the autocorrelation correction; plain test used.');
  }
  const slope = indexSlope(values);
  // Residuals at their original positions (NaN where missing).
  const resid = new Array<number>(values.length).fill(NaN);
  let mean = 0;
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) {
      resid[i] = values[i] - (i + 1) * slope;
      mean += resid[i];
    }
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
  if (pairs < 4 || !(c0 > 0)) {
    return finish(method, s, varS, denom, n, alpha, 1, 'Not enough consecutive values to estimate autocorrelation; plain test used.');
  }
  let r = ((c1 / c0) * (n - 1)) / pairs;
  r = r + (1 + 4 * r) / n; // small-sample bias of the lag-1 estimate after detrending
  r = Math.min(Math.max(r, 0), 0.95);
  const correction = (1 + r) / (1 - r);
  return finish(method, s, varS * correction, denom, n, alpha, correction);
}

/**
 * Trend-free pre-whitening Mann-Kendall test (Yue et al. 2002).
 * Removes the trend, removes lag-1 autocorrelation, puts the trend back,
 * then runs the test. Preferred for short annual records. Matches
 * pymannkendall.trend_free_pre_whitening_modification_test.
 */
export function prewhitenedMannKendall(values: ArrayLike<number>, alpha = 0.05): MannKendallResult {
  const method = 'Mann-Kendall with trend-free pre-whitening';
  const x = finite(values);
  const n0 = x.length;
  if (n0 < 4) {
    return finish(method, mkScore(x), mkVariance(x), 0.5 * n0 * (n0 - 1), n0, alpha, 1, 'Too few points for pre-whitening; plain test used.');
  }
  const slope = indexSlope(values);
  const detrended = x.map((v, i) => v - (i + 1) * slope);
  const r1 = acf(detrended, 1)[1];
  const y: number[] = [];
  for (let i = 1; i < n0; i++) y.push(detrended[i] - detrended[i - 1] * r1 + i * slope);
  // Values that are equal in exact arithmetic can differ in the last bit after
  // pre-whitening, which would break ties at random. Snap to 12 significant
  // digits of the data range so tied values stay tied.
  let scale = 0;
  for (const v of y) scale = Math.max(scale, Math.abs(v));
  if (scale > 0) {
    const step = scale * 1e-12;
    for (let i = 0; i < y.length; i++) y[i] = Math.round(y[i] / step) * step;
  }
  const n = y.length;
  return finish(method, mkScore(y), mkVariance(y), 0.5 * n * (n - 1), n, alpha);
}

/**
 * Seasonal Mann-Kendall test (Hirsch, Slack and Smith 1982).
 * Runs the test within each season and adds the results, so a seasonal
 * cycle cannot fake or hide a trend.
 *
 * `values` must be on a regular grid starting at season 0 (for monthly data:
 * one value per month, with NaN where a month is missing).
 * Matches pymannkendall.seasonal_test.
 */
export function seasonalMannKendall(
  values: ArrayLike<number>,
  period = 12,
  alpha = 0.05,
): MannKendallResult {
  let s = 0;
  let varS = 0;
  let denom = 0;
  let nTotal = 0;
  for (let season = 0; season < period; season++) {
    const x: number[] = [];
    for (let i = season; i < values.length; i += period) {
      if (Number.isFinite(values[i])) x.push(values[i]);
    }
    const n = x.length;
    nTotal += n;
    s += mkScore(x);
    varS += mkVariance(x);
    denom += 0.5 * n * (n - 1);
  }
  return finish('Seasonal Mann-Kendall', s, varS, denom, nTotal, alpha);
}

/**
 * Subtract each season's mean (the climatology) from a regular-grid series.
 * Returns anomalies; missing values stay NaN.
 */
export function deseasonalize(values: ArrayLike<number>, period = 12): number[] {
  const sum = new Array<number>(period).fill(0);
  const count = new Array<number>(period).fill(0);
  for (let i = 0; i < values.length; i++) {
    if (Number.isFinite(values[i])) {
      sum[i % period] += values[i];
      count[i % period]++;
    }
  }
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const k = i % period;
    out.push(Number.isFinite(values[i]) && count[k] > 0 ? values[i] - sum[k] / count[k] : NaN);
  }
  return out;
}

/**
 * Remove the seasonal cycle from a series that also has a trend.
 *
 * Subtracting plain monthly means from a strongly trending series turns the
 * trend into a staircase (each year flat, then a jump), which looks like
 * autocorrelation. This version estimates the trend first, measures the
 * seasonal cycle on the detrended data, and subtracts only that cycle.
 * The trend stays in the returned anomalies.
 */
export function deseasonalizeWithTrend(values: ArrayLike<number>, period = 12): number[] {
  const first = deseasonalize(values, period);
  const slope = indexSlope(first);
  if (!Number.isFinite(slope)) return first;
  const detrended: number[] = [];
  for (let i = 0; i < values.length; i++) detrended.push(values[i] - i * slope);
  const cycleFree = deseasonalize(detrended, period); // detrended minus its seasonal means
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    // seasonal mean at i = detrended[i] - cycleFree[i]
    out.push(Number.isFinite(cycleFree[i]) ? values[i] - (detrended[i] - cycleFree[i]) : NaN);
  }
  return out;
}

export { median, sortedCopy };
