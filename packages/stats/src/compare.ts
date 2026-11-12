// Compare two regions: is the difference between their Sen's slopes significant?
// Decision D3 in docs/stats/decisions.md. Python reference: compare() in
// pipeline/stats/reference_m5.py (same random numbers, parity 1e-9).
//
// Headline: z-test on d = slope(A) - slope(B) with
//   Var(d) = sA^2 + sB^2 - 2 rho sA sB,
// sA, sB from each series' autocorrelation-corrected Sen interval (the validated
// headline interval), rho = correlation of the two slopes estimated by a paired
// moving-block bootstrap (same blocks for both series, so their shared signal
// and cross-correlation are kept).
// Cross-check: the headline Mann-Kendall test and Sen's slope on the difference
// series A - B, in which the shared signal cancels.
import { analyzeTrend, type Frequency, type TrendReport } from './analyze.ts';
import { normPpf, normSf } from './distributions.ts';
import { ar1MannKendall, type MannKendallResult } from './mannKendall.ts';
import { alignPair, gridSeries, indexResiduals, lag1, type SeriesInput } from './prepare.ts';
import { Rng } from './random.ts';
import { senSlope, senSlopeValue } from './senSlope.ts';

export interface CompareInput {
  a: SeriesInput;
  b: SeriesInput;
  /** Optional range ("YYYY" or "YYYY-MM"); the common period is found inside it. */
  start?: string;
  end?: string;
  /** Significance level. Default 0.05. */
  alpha?: number;
  /** Bootstrap replicates for the slope correlation. Default 1000. */
  replicates?: number;
  /** Integer seed. Default DEFAULT_SEED, so the same data always gives the same answer. */
  seed?: number;
}

/**
 * a_faster / b_faster: the difference is significant and both slopes have the
 * same sign; "faster" is the larger absolute slope.
 * different_directions: significant, and the slopes have opposite signs.
 * cannot_tell_apart: the difference is not significant (never "the same").
 */
export type CompareVerdict = 'a_faster' | 'b_faster' | 'different_directions' | 'cannot_tell_apart';

export interface CompareReport {
  /** Time step used for the comparison (annual when the inputs differ). */
  frequency: Frequency;
  /** Common period analysed (format of `frequency`). */
  start: string;
  end: string;
  /** Valid points in each series, and time steps where both are valid. */
  n: { a: number; b: number; common: number };
  /** The headline analysis of each series over the common period. */
  a: TrendReport;
  b: TrendReport;
  /** Sen slope of A minus Sen slope of B, units per year, with its 95% interval and standard error. */
  difference: { perYear: number; lower: number; upper: number; perDecade: number; se: number };
  /** z = difference / se, and its two-sided p-value. */
  z: number;
  p: number;
  significant: boolean;
  alpha: number;
  verdict: CompareVerdict;
  /** Correlation between the two slopes from the paired bootstrap (0 = independent). */
  slopeCorrelation: number;
  bootstrap: {
    method: string;
    replicates: number;
    seed: number;
    /** Block length in time steps of `frequency`. */
    blockLength: number;
    blockRule: string;
    /** Lag-1 autocorrelation used for the block length (larger of the two series). */
    r: number;
  };
  /** Cross-check: headline Mann-Kendall test and Sen's slope on the difference series A - B. */
  crossCheck: {
    method: string;
    test: MannKendallResult;
    slope: { perYear: number; lower: number; upper: number };
    /** True when the cross-check reaches the same significance decision. */
    agrees: boolean;
  };
  lowPower: boolean;
  notes: string[];
}

export const DEFAULT_SEED = 20261113;
export const DEFAULT_REPLICATES = 1000;
/** Politis-White constant for the moving-block bootstrap, (3/2)^(1/3). */
export const BLOCK_SCALE = 1.5 ** (1 / 3);
export const BLOCK_RULE =
  'L = ceil(1.5^(1/3) * (2r/(1-r^2))^(2/3) * N^(1/3)) (Politis-White plug-in for AR(1)), r = larger lag-1 autocorrelation of the two series, L clipped to [1, N/2]';

/** Block length from the D3.1 rule. */
export function blockLength(r: number, n: number): number {
  const g = (2 * r) / (1 - r * r);
  const raw = Math.ceil(BLOCK_SCALE * g ** (2 / 3) * n ** (1 / 3));
  return Math.max(1, Math.min(Math.floor(n / 2), raw));
}

/** Pearson correlation of two equal-length arrays (0 when either is constant). */
export function pearson(x: ArrayLike<number>, y: ArrayLike<number>): number {
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
  if (!(sxx > 0) || !(syy > 0)) return 0;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/**
 * Paired moving-block bootstrap of residuals from each Sen line. Returns the
 * bootstrap slopes of A and B. Residuals are kept in place (NaN where missing),
 * and the same block starts are used for both series.
 */
export function pairedBlockBootstrap(
  t: ArrayLike<number>, yA: ArrayLike<number>, yB: ArrayLike<number>,
  slopeA: number, slopeB: number, L: number, replicates: number, seed: number,
): { a: Float64Array; b: Float64Array } {
  const N = t.length;
  const eA = new Float64Array(N);
  const eB = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    eA[i] = yA[i] - slopeA * t[i];
    eB[i] = yB[i] - slopeB * t[i];
  }
  const rng = new Rng(seed);
  const nBlocks = Math.ceil(N / L);
  const starts = N - L + 1;
  const sA = new Float64Array(N);
  const sB = new Float64Array(N);
  const outA = new Float64Array(replicates);
  const outB = new Float64Array(replicates);
  for (let rep = 0; rep < replicates; rep++) {
    let pos = 0;
    for (let k = 0; k < nBlocks; k++) {
      const s = rng.int(starts);
      for (let j = 0; j < L && pos < N; j++, pos++) {
        sA[pos] = slopeA * t[pos] + eA[s + j];
        sB[pos] = slopeB * t[pos] + eB[s + j];
      }
    }
    outA[rep] = senSlopeValue(t, sA);
    outB[rep] = senSlopeValue(t, sB);
  }
  return { a: outA, b: outB };
}

export function compareTrends(input: CompareInput): CompareReport {
  const alpha = input.alpha ?? 0.05;
  const B = Math.max(99, Math.floor(input.replicates ?? DEFAULT_REPLICATES));
  const seed = input.seed ?? DEFAULT_SEED;
  if (input.a.units !== undefined && input.b.units !== undefined && input.a.units !== input.b.units) {
    throw new Error(`Cannot compare trends in different units (${input.a.units} and ${input.b.units})`);
  }
  const pair = alignPair(input.a, input.b, input.start, input.end);
  const { frequency, start, end } = pair;
  const notes = [...pair.notes];

  const repA = analyzeTrend({ dates: pair.a.dates, values: pair.a.values, frequency, kind: pair.a.kind, alpha, start, end });
  const repB = analyzeTrend({ dates: pair.b.dates, values: pair.b.values, frequency, kind: pair.b.kind, alpha, start, end });

  const ga = gridSeries(pair.a, start, end);
  const gb = gridSeries(pair.b, start, end);
  const N = ga.y.length;
  const t = ga.t;
  let common = 0;
  for (let i = 0; i < N; i++) if (Number.isFinite(ga.y[i]) && Number.isFinite(gb.y[i])) common++;
  if (common < 8 || ga.n < 8 || gb.n < 8) {
    throw new Error('Too little overlap between the two series to compare their trends (need at least 8 common time steps)');
  }

  const slopeA = repA.slope.perYear;
  const slopeB = repB.slope.perYear;
  const d = slopeA - slopeB;

  // Standard errors from the headline (autocorrelation-corrected) Sen intervals.
  const z95 = normPpf(0.975);
  const seA = (repA.slope.upper - repA.slope.lower) / (2 * z95);
  const seB = (repB.slope.upper - repB.slope.lower) / (2 * z95);

  // Slope correlation from the paired moving-block bootstrap.
  const r = Math.max(lag1(indexResiduals(ga.y).resid).r, lag1(indexResiduals(gb.y).resid).r);
  const L = blockLength(r, N);
  const boot = pairedBlockBootstrap(t, ga.y, gb.y, slopeA, slopeB, L, B, seed);
  const rho = pearson(boot.a, boot.b);

  const se = Math.sqrt(Math.max(0, seA * seA + seB * seB - 2 * rho * seA * seB));
  const z = se > 0 ? d / se : NaN;
  const p = Number.isFinite(z) ? 2 * normSf(Math.abs(z)) : NaN;
  const significant = p < alpha;
  const lower = d - z95 * se;
  const upper = d + z95 * se;

  let verdict: CompareVerdict = 'cannot_tell_apart';
  if (significant) {
    if (slopeA * slopeB > 0) verdict = Math.abs(slopeA) > Math.abs(slopeB) ? 'a_faster' : 'b_faster';
    else verdict = 'different_directions';
  }

  // Cross-check on the difference series (shared signal cancels).
  const diff = ga.y.map((v, i) => v - gb.y[i]);
  const xTest = ar1MannKendall(diff, alpha);
  const xSen = senSlope(t, diff, 0.95, xTest.correction);
  const crossCheck = {
    method: 'Mann-Kendall with autocorrelation correction on the difference series A - B',
    test: xTest,
    slope: { perYear: xSen.slope, lower: xSen.lower, upper: xSen.upper },
    agrees: xTest.significant === significant,
  };

  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4)) + 1;
  const lowPower = years < 30 || common < 30;
  notes.push('Trends are compared, not levels: each series has its own zero.');
  if (lowPower) notes.push('Short common period: a real difference may not be detectable yet.');
  if (!significant) notes.push('The two trends cannot be told apart with this record. That does not mean they are the same.');
  if (!crossCheck.agrees) notes.push('The cross-check on the difference series disagrees on significance; treat this result as borderline.');
  if (pair.a.kind === 'rate' && pair.b.kind === 'rate') {
    notes.push('Both series are rates, so this compares how fast each change is speeding up or slowing down.');
  }
  if (pair.a.kind === 'cumulative' || pair.b.kind === 'cumulative') {
    notes.push('For a running total the slope is the average rate of change over the period.');
  }
  if (rho > 0.3) {
    notes.push('The two series share much of their year-to-year variation; the test allows for this, which makes it sharper than comparing the two intervals by eye.');
  }
  notes.push('A difference in trends does not by itself say why the two differ.');

  return {
    frequency,
    start,
    end,
    n: { a: ga.n, b: gb.n, common },
    a: repA,
    b: repB,
    difference: { perYear: d, lower, upper, perDecade: d * 10, se },
    z,
    p,
    significant,
    alpha,
    verdict,
    slopeCorrelation: rho,
    bootstrap: {
      method: 'Paired moving-block bootstrap of residuals from each Sen line (same blocks for both series); gives the slope correlation',
      replicates: B,
      seed,
      blockLength: L,
      blockRule: BLOCK_RULE,
      r,
    },
    crossCheck,
    lowPower,
    notes,
  };
}
