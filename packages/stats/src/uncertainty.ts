// Monte Carlo propagation of the source 1-sigma into Sen's slope interval.
// Decision D6 in docs/stats/decisions.md. Python reference: uncertainty() in
// pipeline/stats/reference_m5.py (same random numbers, parity 1e-9).
import { analyzeTrend, type TrendInput } from './analyze.ts';
import { quantileSorted } from './quantile.ts';
import { gridSeries } from './prepare.ts';
import { Rng } from './random.ts';
import { senSlopeValue } from './senSlope.ts';

export interface UncertaintyInput extends TrendInput {
  /** Source 1-sigma per date (null where not given). */
  sigma: (number | null)[];
  /** Monte Carlo draws per error model. Default 2000 (the minimum the rules allow). */
  draws?: number;
  /** Integer seed. Default 20261113. */
  seed?: number;
}

export interface McInterval {
  /** Fit interval and measurement spread combined in quadrature, side by side. */
  lower: number;
  upper: number;
  /** 2.5%, 50% and 97.5% quantiles of the Monte Carlo slopes. */
  mcLower: number;
  mcMedian: number;
  mcUpper: number;
}

export interface UncertaintyReport {
  start: string;
  end: string;
  n: number;
  draws: number;
  seed: number;
  /** Valid values without a sigma (treated as exact). */
  sigmaMissing: number;
  /** Sen's slope and its autocorrelation-corrected 95% interval (from analyzeTrend). */
  fit: { perYear: number; lower: number; upper: number };
  /** Errors independent from one time step to the next. */
  independent: McInterval;
  /** Errors fully correlated in time (one shared draw per series). */
  correlated: McInterval;
  /** The wider of the two: the interval to show. */
  combined: { lower: number; upper: number; model: 'independent' | 'correlated' };
  /** How much wider the combined interval is than the fit interval (0.25 = 25% wider). */
  widening: number;
  notes: string[];
}

export function propagateUncertainty(input: UncertaintyInput): UncertaintyReport {
  const D = Math.max(100, Math.floor(input.draws ?? 2000));
  const seed = input.seed ?? 20261113;
  if (!input.sigma || input.sigma.length !== input.dates.length) {
    throw new Error('This series has no source uncertainty (sigma) to propagate');
  }
  const report = analyzeTrend(input);
  const g = gridSeries(
    { dates: input.dates, values: input.values, frequency: input.frequency, sigma: input.sigma },
    report.start,
    report.end,
  );
  const N = g.y.length;
  const slope = report.slope.perYear;
  let sigmaMissing = 0;
  const s = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    if (!Number.isFinite(g.y[i])) continue;
    if (Number.isFinite(g.sigma[i]) && g.sigma[i] >= 0) s[i] = g.sigma[i];
    else sigmaMissing++;
  }

  const rng = new Rng(seed);
  const buf = new Float64Array(N);
  const ind = new Float64Array(D);
  const cor = new Float64Array(D);
  for (let d = 0; d < D; d++) {
    for (let i = 0; i < N; i++) {
      buf[i] = Number.isFinite(g.y[i]) ? g.y[i] + s[i] * rng.normal() : NaN;
    }
    ind[d] = senSlopeValue(g.t, buf);
  }
  for (let d = 0; d < D; d++) {
    const z = rng.normal();
    for (let i = 0; i < N; i++) buf[i] = g.y[i] + s[i] * z;
    cor[d] = senSlopeValue(g.t, buf);
  }

  const fitLo = slope - report.slope.lower;
  const fitHi = report.slope.upper - slope;
  const combine = (draws: Float64Array): McInterval => {
    draws.sort();
    const mcLower = quantileSorted(draws, 0.025);
    const mcMedian = quantileSorted(draws, 0.5);
    const mcUpper = quantileSorted(draws, 0.975);
    return {
      lower: slope - Math.hypot(fitLo, mcMedian - mcLower),
      upper: slope + Math.hypot(fitHi, mcUpper - mcMedian),
      mcLower,
      mcMedian,
      mcUpper,
    };
  };
  const independent = combine(ind);
  const correlated = combine(cor);
  const wInd = independent.upper - independent.lower;
  const wCor = correlated.upper - correlated.lower;
  const pick = wCor > wInd ? 'correlated' : 'independent';
  const chosen = pick === 'correlated' ? correlated : independent;
  const fitWidth = report.slope.upper - report.slope.lower;
  const widening = (chosen.upper - chosen.lower) / fitWidth - 1;

  const notes: string[] = [];
  notes.push(`The source's own uncertainty was added by simulation (${D} draws per error model). The interval shown is the wider of "errors independent in time" and "errors shared across time".`);
  if (widening < 0.05) notes.push('The source uncertainty barely changes the interval: the year-to-year scatter dominates.');
  else if (widening < 1) notes.push(`Including the source uncertainty makes the interval ${Math.round(widening * 100)}% wider.`);
  else notes.push(`Including the source uncertainty makes the interval about ${(1 + widening).toFixed(1)} times as wide: the stated measurement uncertainty, not the scatter, limits how well the rate is known.`);
  if (pick === 'correlated') notes.push('Errors shared across time matter most here: they shift the whole series and change its slope when the uncertainty grows or shrinks over time.');
  if (sigmaMissing > 0) notes.push(`${sigmaMissing} values have no stated uncertainty and were treated as exact.`);
  if (report.frequency === 'monthly') notes.push('The seasonal cycle was estimated once from the reported values.');

  return {
    start: report.start,
    end: report.end,
    n: report.n,
    draws: D,
    seed,
    sigmaMissing,
    fit: { perYear: slope, lower: report.slope.lower, upper: report.slope.upper },
    independent,
    correlated,
    combined: { lower: chosen.lower, upper: chosen.upper, model: pick },
    widening,
    notes,
  };
}
