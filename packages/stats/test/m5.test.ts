// M5 parity test: compare, correlate, sensitivity, uncertainty, detectability,
// the seeded random numbers and the Student t functions must match the Python
// reference (pipeline/stats/reference_m5.py) to 1e-9.
// Run:  uv run python pipeline/stats/make_golden.py 1000   (or pnpm golden), then
//       node packages/stats/test/m5.test.ts
import { readFileSync } from 'node:fs';
import {
  compareTrends, correlateSeries, propagateUncertainty, Rng, sensitivity, senSlope, senSlopeValue,
  studentTPpf, studentTSf, studentTTwoSided, yearsToDetect, type CorrelationBlock, type RegressionFit,
} from '../src/index.ts';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
if (!golden.m5) {
  console.log('golden.json has no m5 section: run `pnpm golden` first');
  process.exit(1);
}
const g = golden.m5;
const TOL = 1e-9;
const failures: string[] = [];
const counts: Record<string, number> = {};
const worst: Record<string, number> = {};

function close(group: string, name: string, got: number | null, want: number | null) {
  counts[group] = (counts[group] ?? 0) + 1;
  const gotOk = got !== null && Number.isFinite(got);
  if (want === null) {
    if (gotOk) failures.push(`${group} ${name}: got ${got}, want NaN/null`);
    return;
  }
  const err = Math.abs((got ?? NaN) - want) / Math.max(1, Math.abs(want));
  if (!(err <= TOL)) failures.push(`${group} ${name}: got ${got}, want ${want}`);
  else worst[group] = Math.max(worst[group] ?? 0, err);
}
/** Relative error (no floor at 1): for small probabilities. */
function closeRel(group: string, name: string, got: number, want: number, tol = 1e-9) {
  counts[group] = (counts[group] ?? 0) + 1;
  const err = want === 0 ? Math.abs(got) : Math.abs(got - want) / Math.abs(want);
  if (!(err <= tol)) failures.push(`${group} ${name}: got ${got}, want ${want} (rel ${err.toExponential(2)})`);
  else worst[group] = Math.max(worst[group] ?? 0, err);
}
function same(group: string, name: string, got: unknown, want: unknown) {
  counts[group] = (counts[group] ?? 0) + 1;
  if (got !== want) failures.push(`${group} ${name}: got ${String(got)}, want ${String(want)}`);
}

// --- Random numbers: integer stream bit-identical, normals within rounding.
{
  const r = new Rng(g.rng.seed_u32);
  g.rng.u32.forEach((w: number, i: number) => same('rng', `u32[${i}]`, r.nextU32(), w));
  const r2 = new Rng(g.rng.seed_mix);
  g.rng.uniform.forEach((w: number, i: number) => same('rng', `uniform[${i}]`, r2.uniform(), w));
  g.rng.int37.forEach((w: number, i: number) => same('rng', `int37[${i}]`, r2.int(37), w));
  g.rng.normal.forEach((w: number, i: number) => close('rng', `normal[${i}]`, r2.normal(), w));
}

// --- Student t against scipy (relative error, so small tails are checked properly).
g.t.df.forEach((df: number, j: number) => {
  g.t.t.forEach((t: number, i: number) => {
    closeRel('student-t', `sf(${t}, ${df})`, studentTSf(t, df), g.t.sf[j][i], 1e-10);
    closeRel('student-t', `two(${t}, ${df})`, studentTTwoSided(t, df), g.t.two[j][i], 1e-10);
  });
  g.t.p.forEach((p: number, i: number) => closeRel('student-t', `ppf(${p}, ${df})`, studentTPpf(p, df), g.t.ppf[j][i], 1e-10));
});

// --- Fast Sen's slope equals the sorted version and scipy on the M0 golden cases.
golden.cases.forEach((c: any, i: number) => {
  const x = c.x.map((v: number | null) => (v === null ? NaN : v));
  same('senSlopeValue', `#${i} vs senSlope`, senSlopeValue(c.t, x), senSlope(c.t, x).slope);
  close('senSlopeValue', `#${i} vs scipy`, senSlopeValue(c.t, x), c.sen.slope);
});

const toSeries = (s: any) => ({ ...s, values: s.values, sigma: s.sigma });

// --- Compare.
g.compare.forEach((c: any, i: number) => {
  const w = c.want;
  const r = compareTrends({ a: toSeries(c.a), b: toSeries(c.b), start: c.start ?? undefined, end: c.end ?? undefined, replicates: c.replicates, seed: c.seed });
  const G = 'compare';
  same(G, `#${i} frequency`, r.frequency, w.frequency);
  same(G, `#${i} start`, r.start, w.start);
  same(G, `#${i} end`, r.end, w.end);
  same(G, `#${i} n.a`, r.n.a, w.n.a);
  same(G, `#${i} n.b`, r.n.b, w.n.b);
  same(G, `#${i} n.common`, r.n.common, w.n.common);
  same(G, `#${i} blockLength`, r.bootstrap.blockLength, w.block_length);
  close(G, `#${i} r`, r.bootstrap.r, w.r);
  close(G, `#${i} slopeA`, r.a.slope.perYear, w.slope_a);
  close(G, `#${i} slopeB`, r.b.slope.perYear, w.slope_b);
  close(G, `#${i} lowerA`, r.a.slope.lower, w.lower_a);
  close(G, `#${i} upperA`, r.a.slope.upper, w.upper_a);
  close(G, `#${i} lowerB`, r.b.slope.lower, w.lower_b);
  close(G, `#${i} upperB`, r.b.slope.upper, w.upper_b);
  close(G, `#${i} rho`, r.slopeCorrelation, w.rho);
  close(G, `#${i} difference`, r.difference.perYear, w.difference);
  close(G, `#${i} se`, r.difference.se, w.se);
  close(G, `#${i} lower`, r.difference.lower, w.lower);
  close(G, `#${i} upper`, r.difference.upper, w.upper);
  close(G, `#${i} z`, r.z, w.z);
  close(G, `#${i} p`, r.p, w.p);
  same(G, `#${i} significant`, r.significant, w.significant);
  close(G, `#${i} cross.s`, r.crossCheck.test.s, w.cross.s);
  close(G, `#${i} cross.z`, r.crossCheck.test.z, w.cross.z);
  close(G, `#${i} cross.p`, r.crossCheck.test.p, w.cross.p);
  close(G, `#${i} cross.slope`, r.crossCheck.slope.perYear, w.cross.slope);
  close(G, `#${i} cross.lower`, r.crossCheck.slope.lower, w.cross.lower);
  close(G, `#${i} cross.upper`, r.crossCheck.slope.upper, w.cross.upper);
});

// --- Correlate.
function corrBlock(G: string, name: string, got: CorrelationBlock, want: any) {
  same(G, `${name} n`, got.n, want.n);
  close(G, `${name} nEff`, got.nEff, want.n_eff);
  close(G, `${name} r1x`, got.r1x, want.r1x);
  close(G, `${name} r1y`, got.r1y, want.r1y);
  for (const k of ['pearson', 'spearman'] as const) {
    close(G, `${name} ${k}.r`, got[k].r, want[k].r);
    close(G, `${name} ${k}.p`, got[k].p, want[k].p);
    close(G, `${name} ${k}.pNaive`, got[k].pNaive, want[k].p_naive);
  }
}
g.correlate.forEach((c: any, i: number) => {
  const w = c.want;
  const r = correlateSeries({ x: toSeries(c.x), y: toSeries(c.y), start: c.start ?? undefined, end: c.end ?? undefined, maxLag: c.max_lag });
  const G = 'correlate';
  same(G, `#${i} start`, r.start, w.start);
  same(G, `#${i} end`, r.end, w.end);
  corrBlock(G, `#${i} raw`, r.raw, w.raw);
  corrBlock(G, `#${i} detrended`, r.detrended, w.detrended);
  same(G, `#${i} lags.length`, r.lags.length, w.lags.length);
  r.lags.forEach((l, k) => {
    corrBlock(G, `#${i} lag${k}`, l, w.lags[k]);
    close(G, `#${i} lag${k} pearsonPAdjusted`, l.pearsonPAdjusted, w.lags[k].pearson_p_adj);
    close(G, `#${i} lag${k} spearmanPAdjusted`, l.spearmanPAdjusted, w.lags[k].spearman_p_adj);
  });
});

// --- Sensitivity (reference itself checked equal to statsmodels where rows are contiguous).
function fit(G: string, name: string, got: RegressionFit, want: any) {
  same(G, `${name} n`, got.n, want.n);
  same(G, `${name} maxlags`, got.maxlags, want.maxlags);
  for (const [k, wk] of [['slope', 'slope'], ['intercept', 'intercept'], ['se', 'se'], ['t', 't'], ['p', 'p'], ['lower', 'lower'], ['upper', 'upper'], ['r2', 'r2']] as const) {
    close(G, `${name} ${k}`, got[k], want[wk]);
  }
}
g.sensitivity.forEach((c: any, i: number) => {
  const r = sensitivity({ response: toSeries(c.response), driver: toSeries(c.driver), lag: c.lag });
  fit('sensitivity', `#${i} levels`, r.levels, c.want.levels);
  fit('sensitivity', `#${i} detrended`, r.detrended, c.want.detrended);
});

// --- Uncertainty.
g.uncertainty.forEach((c: any, i: number) => {
  const w = c.want;
  const s = c.series;
  const r = propagateUncertainty({ dates: s.dates, values: s.values, sigma: s.sigma, frequency: s.frequency, kind: s.kind, draws: c.draws, seed: c.seed });
  const G = 'uncertainty';
  same(G, `#${i} sigmaMissing`, r.sigmaMissing, w.sigma_missing);
  close(G, `#${i} slope`, r.fit.perYear, w.slope);
  close(G, `#${i} lower`, r.fit.lower, w.lower);
  close(G, `#${i} upper`, r.fit.upper, w.upper);
  for (const m of ['independent', 'correlated'] as const) {
    for (const [k, wk] of [['lower', 'lower'], ['upper', 'upper'], ['mcLower', 'mc_lower'], ['mcMedian', 'mc_median'], ['mcUpper', 'mc_upper']] as const) {
      close(G, `#${i} ${m}.${k}`, r[m][k], w[m][wk]);
    }
  }
  same(G, `#${i} model`, r.combined.model, w.model);
  close(G, `#${i} widening`, r.widening, w.widening);
});

// --- Detectability.
g.detect.forEach((c: any, i: number) => {
  const w = c.want;
  const s = c.series;
  const r = yearsToDetect({ dates: s.dates, values: s.values, frequency: s.frequency, start: c.start ?? undefined, end: c.end ?? undefined, power: c.power });
  const G = 'detect';
  same(G, `#${i} significantNow`, r.significantNow, w.significant);
  close(G, `#${i} slope`, r.slopePerYear, w.slope);
  close(G, `#${i} sigmaN`, r.sigmaN, w.sigma_n);
  close(G, `#${i} phi`, r.phi, w.phi);
  close(G, `#${i} zSum`, r.zSum, w.z_sum);
  close(G, `#${i} yearsNow`, r.yearsNow, w.years_now);
  close(G, `#${i} yearsNeeded`, r.yearsNeeded, w.years_needed);
  same(G, `#${i} moreYears`, r.moreYears, w.more_years);
});

const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`M5 parity: ${total} checks, ${failures.length} failures (statsmodels HAC cross-checks inside the reference: ${golden.m5.sensitivity_statsmodels_checked})`);
for (const k of Object.keys(counts)) {
  console.log(`  ${k.padEnd(14)} ${String(counts[k]).padStart(6)} checks, worst relative error ${(worst[k] ?? 0).toExponential(2)}`);
}
if (failures.length) {
  console.log(failures.slice(0, Number(process.env.SHOW ?? 25)).join('\n'));
  process.exit(1);
}
