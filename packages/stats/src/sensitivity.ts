// Sensitivity of an ice loss rate to temperature: OLS with Newey-West (HAC)
// standard errors. Decision D5 in docs/stats/decisions.md. Python reference:
// sensitivity() in pipeline/stats/reference_m5.py, itself checked against
// statsmodels OLS(cov_type='HAC', use_correction=True, use_t=True).
import type { Frequency } from './analyze.ts';
import { studentTPpf, studentTTwoSided } from './distributions.ts';
import { alignPair, gridSeries, timeResiduals, type SeriesInput } from './prepare.ts';

export interface SensitivityInput {
  /** The response, normally an ice mass loss rate (Gt/yr). */
  response: SeriesInput;
  /** The driver, normally a temperature anomaly (deg C). */
  driver: SeriesInput;
  start?: string;
  end?: string;
  /** Driver leads the response by this many time steps (0-3 years for temperature). Default 0. */
  lag?: number;
  alpha?: number;
}

export interface RegressionFit {
  /** Change in the response per unit of the driver (e.g. Gt/yr per deg C). */
  slope: number;
  intercept: number;
  /** HAC standard error of the slope. */
  se: number;
  t: number;
  df: number;
  p: number;
  significant: boolean;
  /** 95% interval of the slope (Student t, df = n - 2). */
  lower: number;
  upper: number;
  r2: number;
  n: number;
  /** Newey-West lag truncation used. */
  maxlags: number;
}

export interface SensitivityReport {
  frequency: Frequency;
  start: string;
  end: string;
  lag: number;
  /** "response units per driver unit" when both units are given. */
  units?: string;
  /** Regression on the series as they are (the rule). */
  levels: RegressionFit;
  /** Regression after removing each series' Sen line: year-to-year association only. */
  detrended: RegressionFit;
  hac: { kernel: 'Bartlett'; maxlagsRule: string; smallSample: string; distribution: string };
  notes: string[];
}

/** Newey and West (1994) rule of thumb: floor(4 (n/100)^(2/9)). */
export function neweyWestLags(n: number): number {
  return Math.floor(4 * (n / 100) ** (2 / 9));
}

/**
 * OLS of y on x with Newey-West standard errors. `x` and `y` are aligned grids
 * (NaN where missing); lag products use only rows truly l steps apart.
 */
export function olsHac(x: ArrayLike<number>, y: ArrayLike<number>, alpha = 0.05, maxlags?: number): RegressionFit {
  const N = y.length;
  const ok: boolean[] = [];
  let n = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < N; i++) {
    const v = Number.isFinite(x[i]) && Number.isFinite(y[i]);
    ok.push(v);
    if (v) { n++; mx += x[i]; my += y[i]; }
  }
  if (n < 5) throw new Error('Too few points for a regression (need at least 5)');
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < N; i++) {
    if (!ok[i]) continue;
    sxx += (x[i] - mx) * (x[i] - mx);
    sxy += (x[i] - mx) * (y[i] - my);
    syy += (y[i] - my) * (y[i] - my);
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const u = new Array<number>(N).fill(NaN);
  let ssr = 0;
  for (let i = 0; i < N; i++) {
    if (!ok[i]) continue;
    u[i] = y[i] - intercept - slope * x[i];
    ssr += u[i] * u[i];
  }
  const L = maxlags ?? neweyWestLags(n);

  // Slope part of the sandwich, written with centred x (numerically stable):
  // Var(slope) = sum_{|l|<=L} w_l sum_i h_i h_{i-l} / Sxx^2, h_i = (x_i - mean x) u_i,
  // Bartlett weights w_l = 1 - l/(L+1). Equal to [(X'X)^-1 S (X'X)^-1]_11.
  const h = new Array<number>(N).fill(NaN);
  let meat = 0;
  for (let i = 0; i < N; i++) {
    if (!ok[i]) continue;
    h[i] = (x[i] - mx) * u[i];
    meat += h[i] * h[i];
  }
  for (let l = 1; l <= L; l++) {
    const w = 1 - l / (L + 1);
    let acc = 0;
    for (let i = l; i < N; i++) if (ok[i] && ok[i - l]) acc += h[i] * h[i - l];
    meat += 2 * w * acc;
  }
  let varSlope = meat / (sxx * sxx);
  varSlope *= n / (n - 2);
  const se = Math.sqrt(varSlope);
  const df = n - 2;
  const t = slope / se;
  const p = studentTTwoSided(t, df);
  const q = studentTPpf(0.975, df);
  return {
    slope, intercept, se, t, df, p, significant: p < alpha,
    lower: slope - q * se, upper: slope + q * se,
    r2: syy > 0 ? 1 - ssr / syy : NaN, n, maxlags: L,
  };
}

export function sensitivity(input: SensitivityInput): SensitivityReport {
  const alpha = input.alpha ?? 0.05;
  const lag = Math.max(0, Math.floor(input.lag ?? 0));
  const pair = alignPair(input.response, input.driver, input.start, input.end);
  const { frequency, start, end } = pair;
  const notes = [...pair.notes];
  const gy = gridSeries(pair.a, start, end);
  const gx = gridSeries(pair.b, start, end);
  // Shift the driver so x[i] is the driver `lag` steps before y[i].
  const shift = (v: number[]) => v.map((_, i) => (i - lag >= 0 ? v[i - lag] : NaN));
  const levels = olsHac(shift(gx.y), gy.y, alpha);
  const dx = timeResiduals(gx.t, gx.y).resid;
  const dy = timeResiduals(gy.t, gy.y).resid;
  const detrended = olsHac(shift(dx), dy, alpha);

  const units = input.response.units !== undefined && input.driver.units !== undefined
    ? `${input.response.units} per ${input.driver.units}` : undefined;

  if (lag > 0) notes.push(`The driver leads by ${lag} time step${lag > 1 ? 's' : ''}; the first ${lag} of the common period are not used.`);
  notes.push('This slope describes how the two series moved together. It does not show that one causes the other.');
  notes.push('Both series trend, so the slope on the series as they are partly reflects the two trends. The detrended slope describes only the year-to-year link.');
  if (levels.n < 30) notes.push('Short overlap: the standard errors are approximate.');

  return {
    frequency, start, end, lag, units, levels, detrended,
    hac: {
      kernel: 'Bartlett',
      maxlagsRule: 'floor(4 (n/100)^(2/9)) (Newey and West 1994)',
      smallSample: 'covariance multiplied by n/(n-2)',
      distribution: 'Student t with n - 2 degrees of freedom',
    },
    notes,
  };
}
