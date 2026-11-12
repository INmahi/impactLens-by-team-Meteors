// Two variables together: correlation on raw and on detrended series, with an
// effective sample size for autocorrelation. Decision D4 in docs/stats/decisions.md.
// Python reference: correlate() in pipeline/stats/reference_m5.py.
import type { Frequency } from './analyze.ts';
import { studentTTwoSided } from './distributions.ts';
import { alignPair, gridSeries, lag1, timeResiduals, type SeriesInput } from './prepare.ts';

export interface CorrelateInput {
  x: SeriesInput;
  y: SeriesInput;
  start?: string;
  end?: string;
  /** Significance level. Default 0.05. */
  alpha?: number;
  /** Also scan lags 1..maxLag time steps, x leading y (detrended series). Default 0. */
  maxLag?: number;
}

export interface CorrStat {
  /** Correlation coefficient. */
  r: number;
  /** Two-sided p-value with the effective sample size (use this one). */
  p: number;
  /** Two-sided p-value assuming independent points (stats panel only). */
  pNaive: number;
  significant: boolean;
}

export interface CorrelationBlock {
  n: number;
  /** Effective sample size, n (1 - r1x r1y) / (1 + r1x r1y), in [3, n]. */
  nEff: number;
  /** Lag-1 autocorrelation of each series (bias-corrected, clipped to [0, 0.95]). */
  r1x: number;
  r1y: number;
  pearson: CorrStat;
  spearman: CorrStat;
}

export interface LagCorrelation extends CorrelationBlock {
  /** x leads y by this many time steps. */
  lag: number;
  /** Bonferroni-adjusted p-values for the number of lags tried. */
  pearsonPAdjusted: number;
  spearmanPAdjusted: number;
}

export interface CorrelationReport {
  frequency: Frequency;
  start: string;
  end: string;
  alpha: number;
  /** Anomalies (seasonal cycle removed for monthly data), not detrended. Never supports a claim on its own. */
  raw: CorrelationBlock;
  /** Each series minus its own Sen line. This is the result that can support "they vary together". */
  detrended: CorrelationBlock;
  /** Lag scan on detrended series (empty unless maxLag > 0). */
  lags: LagCorrelation[];
  notes: string[];
}

/** Average ranks (ties share the mean rank), like scipy.stats.rankdata. */
export function rankAverage(x: number[]): number[] {
  const idx = x.map((_, i) => i).sort((a, b) => x[a] - x[b] || a - b);
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

function pearsonR(x: number[], y: number[]): number {
  const n = x.length;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    sxx += a * a;
    syy += b * b;
    sxy += a * b;
  }
  if (!(sxx > 0) || !(syy > 0)) return NaN;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** Two-sided p-value of a correlation r on `n` (possibly fractional) independent points. */
export function corrP(r: number, n: number): number {
  if (!Number.isFinite(r) || !(n > 2)) return NaN;
  if (Math.abs(r) >= 1) return 0;
  const df = n - 2;
  return studentTTwoSided(r * Math.sqrt(df / (1 - r * r)), df);
}

export function effectiveN(n: number, r1x: number, r1y: number): number {
  const prod = r1x * r1y;
  return Math.min(n, Math.max(3, (n * (1 - prod)) / (1 + prod)));
}

function stat(r: number, nEff: number, n: number, alpha: number): CorrStat {
  const p = corrP(r, nEff);
  return { r, p, pNaive: corrP(r, n), significant: p < alpha };
}

/** Correlation block for two aligned grids (NaN where missing), pairing x[i] with y[i + lag]. */
function block(gx: number[], gy: number[], r1x: number, r1y: number, alpha: number, lag = 0): CorrelationBlock {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i + lag < gy.length; i++) {
    const a = gx[i];
    const b = gy[i + lag];
    if (Number.isFinite(a) && Number.isFinite(b)) { xs.push(a); ys.push(b); }
  }
  const n = xs.length;
  const nEff = effectiveN(n, r1x, r1y);
  return {
    n,
    nEff,
    r1x,
    r1y,
    pearson: stat(pearsonR(xs, ys), nEff, n, alpha),
    spearman: stat(pearsonR(rankAverage(xs), rankAverage(ys)), nEff, n, alpha),
  };
}

export function correlateSeries(input: CorrelateInput): CorrelationReport {
  const alpha = input.alpha ?? 0.05;
  const maxLag = Math.max(0, Math.floor(input.maxLag ?? 0));
  const pair = alignPair(input.x, input.y, input.start, input.end);
  const { frequency, start, end } = pair;
  const notes = [...pair.notes];
  const gx = gridSeries(pair.a, start, end);
  const gy = gridSeries(pair.b, start, end);
  const N = gx.y.length;
  const t = gx.t;

  // Pairwise-complete values on the common grid.
  const x: number[] = [];
  const y: number[] = [];
  let n = 0;
  for (let i = 0; i < N; i++) {
    const ok = Number.isFinite(gx.y[i]) && Number.isFinite(gy.y[i]);
    x.push(ok ? gx.y[i] : NaN);
    y.push(ok ? gy.y[i] : NaN);
    if (ok) n++;
  }
  if (n < 8) throw new Error('Too few overlapping points to correlate (need at least 8)');

  const raw = block(x, y, lag1(x).r, lag1(y).r, alpha);
  const dx = timeResiduals(t, x).resid;
  const dy = timeResiduals(t, y).resid;
  const r1x = lag1(dx).r;
  const r1y = lag1(dy).r;
  const detrended = block(dx, dy, r1x, r1y, alpha);

  const lags: LagCorrelation[] = [];
  if (maxLag > 0) {
    const tries = maxLag + 1;
    for (let k = 0; k <= maxLag; k++) {
      const b = block(dx, dy, r1x, r1y, alpha, k);
      if (b.n < 8) break;
      lags.push({
        ...b,
        lag: k,
        pearsonPAdjusted: Math.min(1, b.pearson.p * tries),
        spearmanPAdjusted: Math.min(1, b.spearman.p * tries),
      });
    }
  }

  notes.push('Two series that both trend over time always look correlated. Only the detrended result says whether their ups and downs move together.');
  notes.push('Correlation does not show that one causes the other.');
  if (raw.pearson.pNaive < alpha && !detrended.pearson.significant) {
    notes.push('The raw correlation comes mostly from the two trends; after removing them the link is not significant.');
  }
  if (detrended.nEff < 0.8 * detrended.n) {
    notes.push(`Values close in time are related, so the ${detrended.n} points count as about ${Math.round(detrended.nEff)} independent ones.`);
  }
  if (lags.length > 0) {
    notes.push(`${lags.length} time lags were tried; their p-values are also given adjusted for that (Bonferroni).`);
  }

  return { frequency, start, end, alpha, raw, detrended, lags, notes };
}
