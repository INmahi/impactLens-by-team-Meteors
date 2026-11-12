import {
  ar1MannKendall,
  deseasonalizeWithTrend,
  hamedRaoMannKendall,
  mannKendall,
  seasonalMannKendall,
  type MannKendallResult,
} from './mannKendall.ts';
import { senSlope } from './senSlope.ts';

export type Frequency = 'monthly' | 'annual';
/** level: a measured quantity. cumulative: a running total. rate: change per year. */
export type SeriesKind = 'level' | 'cumulative' | 'rate';

export interface TrendInput {
  /** "YYYY-MM" for monthly series, "YYYY" for annual series. */
  dates: string[];
  /** One value per date; null or NaN where missing. */
  values: (number | null)[];
  frequency: Frequency;
  kind?: SeriesKind;
  /** Significance level. Default 0.05. */
  alpha?: number;
  /** Inclusive range filter, same format as dates. */
  start?: string;
  end?: string;
}

export interface TrendReport {
  frequency: Frequency;
  kind: SeriesKind;
  start: string;
  end: string;
  /** Valid points used. */
  n: number;
  /** Valid points divided by expected points in the range. */
  coverage: number;
  alpha: number;
  /** The headline Mann-Kendall result shown to the user. */
  test: MannKendallResult;
  /** Other Mann-Kendall variants, shown in the expandable stats panel. */
  crossChecks: MannKendallResult[];
  /** Sen's slope in units per year, with a 95% interval widened for autocorrelation. */
  slope: { perYear: number; lower: number; upper: number; perDecade: number };
  /** True when the record is short enough that a real trend could be missed. */
  lowPower: boolean;
  notes: string[];
}

function parseDate(d: string): { year: number; month: number } {
  const [y, m] = d.split('-');
  return { year: Number(y), month: m === undefined ? 0 : Number(m) };
}

/**
 * Run the trend analysis for one series. This is the function the app calls.
 *
 * Headline test: Mann-Kendall with a lag-1 autocorrelation correction. In
 * simulation it keeps false positives near 5% where the plain test gives 30-50%.
 * Monthly series have the seasonal cycle removed first.
 * Cross-checks: Hamed-Rao modified Mann-Kendall, Seasonal Mann-Kendall (monthly
 * only), and the plain test for comparison.
 * Sen's slope gives the rate; its 95% interval is widened by the same
 * autocorrelation factor as the headline test.
 */
export function analyzeTrend(input: TrendInput): TrendReport {
  const alpha = input.alpha ?? 0.05;
  const kind = input.kind ?? 'level';
  const { frequency } = input;
  if (input.dates.length !== input.values.length) {
    throw new Error('dates and values must have the same length');
  }

  // Filter to the requested range (string comparison works for YYYY and YYYY-MM).
  const pts: { date: string; year: number; month: number; v: number }[] = [];
  for (let i = 0; i < input.dates.length; i++) {
    const date = input.dates[i];
    if (input.start !== undefined && date < input.start) continue;
    if (input.end !== undefined && date > input.end) continue;
    const raw = input.values[i];
    const { year, month } = parseDate(date);
    pts.push({ date, year, month, v: raw === null ? NaN : raw });
  }
  if (pts.length === 0) throw new Error('No data in the selected range');
  pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const notes: string[] = [];
  const first = pts[0];
  const last = pts[pts.length - 1];

  let test: MannKendallResult;
  const crossChecks: MannKendallResult[] = [];
  let t: number[];
  let y: number[];
  let expected: number;

  if (frequency === 'monthly') {
    // Regular monthly grid starting in January of the first year; gaps stay NaN.
    const size = (last.year - first.year) * 12 + last.month;
    const grid = new Array<number>(size).fill(NaN);
    for (const p of pts) grid[(p.year - first.year) * 12 + (p.month - 1)] = p.v;
    expected = size - (first.month - 1);

    const anomalies = deseasonalizeWithTrend(grid, 12);
    test = ar1MannKendall(anomalies, alpha);
    crossChecks.push(hamedRaoMannKendall(anomalies, alpha));
    crossChecks.push(seasonalMannKendall(grid, 12, alpha));
    crossChecks.push({ ...mannKendall(anomalies, alpha), method: 'Mann-Kendall (no autocorrelation correction)' });
    t = grid.map((_, i) => first.year + (i + 0.5) / 12);
    y = anomalies;
    notes.push('Seasonal cycle removed before testing.');
  } else {
    const size = last.year - first.year + 1;
    const grid = new Array<number>(size).fill(NaN);
    for (const p of pts) grid[p.year - first.year] = p.v;
    expected = size;

    test = ar1MannKendall(grid, alpha);
    crossChecks.push(hamedRaoMannKendall(grid, alpha));
    crossChecks.push({ ...mannKendall(grid, alpha), method: 'Mann-Kendall (no autocorrelation correction)' });
    t = grid.map((_, i) => first.year + i + 0.5);
    y = grid;
  }

  const sen = senSlope(t, y, 0.95, test.correction);
  const n = sen.n;
  const coverage = n / expected;
  const years = last.year - first.year + 1;

  if (test.warning) notes.push(test.warning);
  if (coverage < 1) {
    notes.push(`${expected - n} of ${expected} time steps are missing; they were skipped, not filled in.`);
  }
  const lowPower = years < 30 || n < 30;
  if (lowPower) {
    notes.push('Short record: a real trend may not reach significance yet.');
  }
  if (kind === 'cumulative') {
    notes.push('This is a running total, so a steady change always looks like a strong trend. The slope is the average rate of change; check the rate series to see whether the change is speeding up.');
  }
  if (kind === 'rate') {
    notes.push('This is a rate, so a trend here means the change is speeding up or slowing down.');
  }
  if (test.correction > 1.05) {
    notes.push(`Values close in time are related (autocorrelation), so the test and the interval were made ${test.correction.toFixed(1)} times more cautious.`);
  }
  if (crossChecks[0].significant !== test.significant) {
    notes.push('The two corrected tests disagree on significance; treat this result as borderline.');
  }

  return {
    frequency,
    kind,
    start: first.date,
    end: last.date,
    n,
    coverage,
    alpha,
    test,
    crossChecks,
    slope: { perYear: sen.slope, lower: sen.lower, upper: sen.upper, perDecade: sen.slope * 10 },
    lowPower,
    notes,
  };
}

/** Format a p-value for display. */
export function formatP(p: number): string {
  if (!Number.isFinite(p)) return 'p unavailable';
  if (p < 0.001) return 'p < 0.001';
  return `p = ${p.toPrecision(2)}`;
}
