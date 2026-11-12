// "Cannot tell yet": how many more years of data would the headline test need?
// Decision D7 in docs/stats/decisions.md (Weatherhead et al. 1998, generalised
// to the time step and the requested power). Python reference: detectability()
// in pipeline/stats/reference_m5.py.
import { analyzeTrend, type TrendInput } from './analyze.ts';
import { normPpf } from './distributions.ts';
import { gridSeries, indexResiduals, lag1, stepsPerYear } from './prepare.ts';

export interface DetectabilityInput extends TrendInput {
  /** Probability of detecting the trend. Default 0.8. */
  power?: number;
}

export interface DetectabilityReport {
  /** Whether the headline test is already significant (then the estimate is not shown). */
  significantNow: boolean;
  /** Sen's slope per year used in the estimate. */
  slopePerYear: number;
  /** SD of the deseasonalised, detrended noise, in the series' units. */
  sigmaN: number;
  /** Lag-1 autocorrelation of that noise (the headline test's estimate). */
  phi: number;
  stepsPerYear: number;
  alpha: number;
  power: number;
  /** z_(1-alpha/2) + z_power (2.80 for alpha 0.05 and power 0.8). */
  zSum: number;
  /** Length of the analysed record in years. */
  yearsNow: number;
  /** Total record length needed, in years (null when the slope is zero). */
  yearsNeeded: number | null;
  /** Further years needed, rounded up (0 when already long enough; null when the slope is zero). */
  moreYears: number | null;
  method: string;
  notes: string[];
}

export function yearsToDetect(input: DetectabilityInput): DetectabilityReport {
  const power = input.power ?? 0.8;
  const report = analyzeTrend(input);
  const alpha = report.alpha;
  const g = gridSeries(
    { dates: input.dates, values: input.values, frequency: input.frequency },
    report.start,
    report.end,
  );
  const k = stepsPerYear(report.frequency);
  const est = lag1(indexResiduals(g.y).resid);
  const phi = est.r;
  const sigmaN = est.sd;
  const slope = report.slope.perYear;
  const zSum = normPpf(1 - alpha / 2) + normPpf(power);

  // Length of the analysed record in years, from first to last date inclusive.
  const [sy, sm] = report.start.split('-').map(Number);
  const [ey, em] = report.end.split('-').map(Number);
  const yearsNow = report.frequency === 'monthly' ? ((ey - sy) * 12 + (em - sm) + 1) / 12 : ey - sy + 1;

  let yearsNeeded: number | null = null;
  let moreYears: number | null = null;
  if (Number.isFinite(slope) && slope !== 0 && Number.isFinite(sigmaN)) {
    const base = ((zSum * sigmaN * Math.sqrt(12 / k)) / Math.abs(slope)) * Math.sqrt((1 + phi) / (1 - phi));
    yearsNeeded = base ** (2 / 3);
    moreYears = Math.max(0, Math.ceil(yearsNeeded - yearsNow));
  }

  const notes: string[] = [];
  if (report.test.significant) {
    notes.push('The trend is already significant; no extra years are needed.');
  } else if (moreYears === null) {
    notes.push('The current slope is zero, so no record length can be estimated.');
  } else if (moreYears === 0) {
    notes.push('By the rule of thumb this record should already be long enough; the trend may be weaker than its current estimate, or the noise less regular than assumed.');
  } else {
    notes.push(`Cannot tell yet. If the current rate and year-to-year noise continue, about ${moreYears} more year${moreYears === 1 ? '' : 's'} of data would give an ${Math.round(power * 100)}% chance of detecting it.`);
    notes.push('This is a rough guide, not a forecast: the current rate is itself uncertain.');
  }

  return {
    significantNow: report.test.significant,
    slopePerYear: slope,
    sigmaN,
    phi,
    stepsPerYear: k,
    alpha,
    power,
    zSum,
    yearsNow,
    yearsNeeded,
    moreYears,
    method: 'Weatherhead et al. (1998): n* = [(z_(1-alpha/2) + z_power) sigma_N sqrt(12/k) / |slope| * sqrt((1+phi)/(1-phi))]^(2/3) years',
    notes,
  };
}
