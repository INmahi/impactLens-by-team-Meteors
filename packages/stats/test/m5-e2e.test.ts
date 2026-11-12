// End-to-end checks of the M5 functions and the worker message routing.
// Run:  node packages/stats/test/m5-e2e.test.ts
import assert from 'node:assert/strict';
import {
  analyzeTrend, compareTrends, correlateSeries, handleRequest, propagateUncertainty, Rng,
  sensitivity, yearsToDetect, type SeriesInput,
} from '../src/index.ts';

const rng = new Rng(4242);
function ar1(n: number, phi: number, sd: number): number[] {
  const out: number[] = [];
  let p = rng.normal();
  for (let i = 0; i < n; i++) { p = phi * p + Math.sqrt(1 - phi * phi) * rng.normal(); out.push(sd * p); }
  return out;
}
function monthly(y0: number, n: number, f: (i: number) => number | null, extra: Partial<SeriesInput> = {}): SeriesInput {
  const dates: string[] = [];
  const values: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    dates.push(`${y0 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`);
    values.push(f(i));
  }
  return { dates, values, frequency: 'monthly', kind: 'level', units: 'mm', ...extra };
}
function annual(y0: number, n: number, f: (i: number) => number | null, extra: Partial<SeriesInput> = {}): SeriesInput {
  return { dates: Array.from({ length: n }, (_, i) => String(y0 + i)), values: Array.from({ length: n }, (_, i) => f(i)), frequency: 'annual', kind: 'level', ...extra };
}

// ---------------------------------------------------------------- compare
// Two seas sharing an El Nino-like signal, 1993-2026; A rises 4.6 mm/yr, B 2.6 mm/yr; B starts a year later.
const shared = ar1(406, 0.7, 8);
const nA = ar1(406, 0.6, 5);
const nB = ar1(406, 0.6, 5);
const seaA = monthly(1993, 406, (i) => (i === 100 ? null : 4.6 * i / 12 + shared[i] + nA[i] + 40 * Math.sin(2 * Math.PI * i / 12)));
const seaB = monthly(1993, 406, (i) => (i < 12 ? null : 2.6 * i / 12 + shared[i] + nB[i] + 25 * Math.cos(2 * Math.PI * i / 12)));
const cmp = compareTrends({ a: seaA, b: seaB });
assert.equal(cmp.frequency, 'monthly');
assert.equal(cmp.start, '1994-01');
assert.equal(cmp.end, '2026-10');
assert.equal(cmp.n.common, 393);
assert.equal(cmp.verdict, 'a_faster');
assert.ok(cmp.significant && cmp.p < 0.001);
assert.ok(cmp.difference.lower < 2 && 2 < cmp.difference.upper, JSON.stringify(cmp.difference));
assert.ok(cmp.slopeCorrelation > 0.3, `rho ${cmp.slopeCorrelation}`);
assert.ok(cmp.crossCheck.agrees);
assert.ok(cmp.notes.some((n) => n.includes('not levels')));
// Each slope equals the single-series analysis over the common period.
const alone = analyzeTrend({ ...seaA, start: cmp.start, end: cmp.end });
assert.equal(cmp.a.slope.perYear, alone.slope.perYear);
assert.equal(cmp.a.test.p, alone.test.p);
// Deterministic with the default seed; swapping A and B flips the sign only.
const again = compareTrends({ a: seaA, b: seaB });
assert.equal(again.p, cmp.p);
assert.equal(again.slopeCorrelation, cmp.slopeCorrelation);
const swapped = compareTrends({ a: seaB, b: seaA });
assert.equal(swapped.difference.perYear, -cmp.difference.perYear);
assert.equal(swapped.verdict, 'b_faster');
// A series against itself: zero difference, cannot tell apart, never "the same".
const self = compareTrends({ a: seaA, b: seaA });
assert.equal(self.difference.perYear, 0);
assert.equal(self.verdict, 'cannot_tell_apart');
assert.ok(self.notes.some((n) => n.includes('does not mean they are the same')));
// Units must match; series must overlap.
assert.throws(() => compareTrends({ a: seaA, b: { ...seaB, units: 'Gt' } }), /different units/);
assert.throws(() => compareTrends({ a: annual(1950, 20, (i) => i), b: annual(1990, 20, (i) => i) }), /do not overlap/);
// Mixed monthly and annual: compared as calendar-year means over the common years.
const yearly = annual(1980, 40, (i) => 3 * i + ar1(1, 0, 1)[0], { units: 'mm' });
const mixed = compareTrends({ a: seaA, b: yearly });
assert.equal(mixed.frequency, 'annual');
assert.equal(mixed.start, '1993');
assert.equal(mixed.end, '2019');
assert.ok(mixed.notes.some((n) => n.includes('calendar-year means')));
// Rate series: the note says it compares acceleration.
const rates = compareTrends({ a: annual(1979, 45, (i) => -5 * i + ar1(1, 0, 40)[0], { kind: 'rate' }), b: annual(1979, 45, (i) => -3.5 * i + ar1(1, 0, 50)[0], { kind: 'rate' }) });
assert.ok(rates.notes.some((n) => n.includes('speeding up')));
// Short common period is flagged.
const short = compareTrends({ a: seaA, b: seaB, start: '2010-01', end: '2019-12' });
assert.ok(short.lowPower);

// ---------------------------------------------------------------- correlate
// Two independent series that both trend: raw correlation strong, detrended not.
const tx = ar1(45, 0.3, 0.5);
const ty = ar1(45, 0.3, 40);
const temp = annual(1979, 45, (i) => 0.04 * i + tx[i], { units: 'degC' });
const loss = annual(1979, 45, (i) => -6 * i + ty[i], { kind: 'rate', units: 'Gt/yr' });
const cor = correlateSeries({ x: temp, y: loss, maxLag: 3 });
assert.ok(cor.raw.pearson.r < -0.3 && cor.raw.pearson.pNaive < 0.05, `raw r ${cor.raw.pearson.r}`);
assert.ok(cor.raw.nEff < 0.6 * cor.raw.n, `raw nEff ${cor.raw.nEff}`);
assert.ok(!cor.detrended.pearson.significant);
assert.equal(cor.lags.length, 4);
assert.ok(cor.notes.some((n) => n.includes('does not show that one causes')));
// A real year-to-year link is found after detrending.
const linked = correlateSeries({ x: temp, y: annual(1979, 45, (i) => -6 * i - 80 * tx[i] + ar1(1, 0, 10)[0]) });
assert.ok(linked.detrended.pearson.significant && linked.detrended.pearson.r < -0.8);

// ---------------------------------------------------------------- sensitivity
const respVals = temp.values.map((v, i) => -60 * (v as number) + 0 * i + ty[i] * 0.25);
const sens = sensitivity({ response: { ...loss, values: respVals }, driver: temp });
assert.ok(Math.abs(sens.levels.slope - -60) < 3 * sens.levels.se, JSON.stringify(sens.levels));
assert.ok(sens.levels.lower < -60 && -60 < sens.levels.upper);
assert.equal(sens.levels.maxlags, 3);
assert.equal(sens.units, 'Gt/yr per degC');
assert.ok(sens.notes.some((n) => n.includes('does not show that one causes')));
const lagged = sensitivity({ response: { ...loss, values: respVals }, driver: temp, lag: 2 });
assert.equal(lagged.levels.n, 43);

// ---------------------------------------------------------------- uncertainty
const mass = annual(1992, 32, (i) => -150 * i + ar1(1, 0, 30)[0], { kind: 'cumulative' });
const zero = propagateUncertainty({ ...mass, sigma: mass.values.map(() => 0), draws: 2000 });
assert.equal(zero.widening, 0);
assert.equal(zero.combined.lower, zero.fit.lower);
const grow = propagateUncertainty({ ...mass, sigma: mass.values.map((_, i) => 20 + 10 * i) });
assert.equal(grow.draws, 2000);
assert.equal(grow.combined.model, 'correlated'); // a growing shared error tilts the whole series
assert.ok(grow.widening > 0.5, `widening ${grow.widening}`);
assert.ok(grow.combined.lower < grow.fit.lower && grow.combined.upper > grow.fit.upper);
assert.throws(() => propagateUncertainty({ ...mass, sigma: undefined as never }), /no source uncertainty/);

// ---------------------------------------------------------------- detectability
// A weak trend in short noisy annual data: not significant, more years needed.
const weak = annual(2000, 20, (i) => 0.01 * i + ar1(1, 0, 0.6)[0]);
const det = yearsToDetect({ ...weak, frequency: 'annual' });
assert.equal(det.significantNow, false);
assert.ok(det.moreYears !== null && det.moreYears > 0, JSON.stringify(det));
assert.ok(det.notes[0].startsWith('Cannot tell yet'));
assert.ok(Math.abs(det.zSum - 2.8015852) < 1e-6);
// A strong trend: already significant.
const strong = yearsToDetect({ ...annual(1980, 40, (i) => i + ar1(1, 0, 1)[0]), frequency: 'annual' });
assert.ok(strong.significantNow);

// ---------------------------------------------------------------- worker routing
const trendIn = { dates: seaA.dates, values: seaA.values, frequency: 'monthly' as const };
const r1 = handleRequest({ id: 7, input: trendIn });
assert.ok(r1.ok && r1.type === 'trend' && r1.id === 7);
assert.deepEqual((r1 as { report: unknown }).report, analyzeTrend(trendIn));
const r2 = handleRequest({ id: 8, type: 'compare', input: { a: seaA, b: seaB } });
assert.ok(r2.ok && r2.type === 'compare');
const r3 = handleRequest({ id: 9, type: 'compare', input: { a: seaA, b: { ...seaB, units: 'Gt' } } });
assert.ok(!r3.ok && r3.error.includes('different units'));
const r4 = handleRequest({ id: 10, type: 'nonsense' as never, input: trendIn as never });
assert.ok(!r4.ok && r4.error.includes('Unknown'));
for (const type of ['correlate', 'sensitivity', 'uncertainty', 'detectability'] as const) {
  const input = type === 'correlate' ? { x: temp, y: loss }
    : type === 'sensitivity' ? { response: loss, driver: temp }
    : type === 'uncertainty' ? { ...mass, sigma: mass.values.map(() => 15), draws: 200 }
    : { ...weak };
  const r = handleRequest({ id: 11, type, input } as never);
  assert.ok(r.ok && r.type === type, `${type}: ${JSON.stringify(r).slice(0, 200)}`);
}

console.log('M5 end-to-end: all checks passed');
console.log(JSON.stringify({ verdict: cmp.verdict, difference: cmp.difference, p: cmp.p, rho: cmp.slopeCorrelation, L: cmp.bootstrap.blockLength }));
