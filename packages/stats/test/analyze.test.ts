// End-to-end checks of analyzeTrend, the function the app calls.
// Run:  node packages/stats/test/analyze.test.ts
import assert from 'node:assert/strict';
import { analyzeTrend, formatP } from '../src/index.ts';

// Monthly series, 1995-2024: seasonal cycle + downward trend of 2.4 per year, with a one-year gap.
const dates: string[] = [];
const values: (number | null)[] = [];
let seed = 42;
function noise(): number { // small seeded generator, uniform in [-3, 3]
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
  return ((seed >>> 0) / 4294967296 - 0.5) * 6;
}
let k = 0;
for (let y = 1995; y <= 2024; y++) {
  for (let m = 1; m <= 12; m++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}`);
    values.push(y === 2018 ? null : -0.2 * k + 10 * Math.sin((2 * Math.PI * m) / 12) + noise());
    k++;
  }
}
const monthly = analyzeTrend({ dates, values, frequency: 'monthly' });
assert.equal(monthly.test.trend, 'decreasing');
assert.ok(monthly.test.significant);
assert.ok(Math.abs(monthly.slope.perYear - -2.4) < 0.05, `slope ${monthly.slope.perYear}`);
assert.ok(monthly.slope.lower <= -2.4 && -2.4 <= monthly.slope.upper);
assert.equal(monthly.n, 348);
assert.ok(Math.abs(monthly.coverage - 348 / 360) < 1e-12);
assert.ok(monthly.notes.some((n) => n.includes('missing')));
assert.equal(monthly.crossChecks.length, 3);

// Range filter.
const sub = analyzeTrend({ dates, values, frequency: 'monthly', start: '2000-01', end: '2009-12' });
assert.equal(sub.start, '2000-01');
assert.equal(sub.end, '2009-12');
assert.equal(sub.n, 120);
assert.ok(sub.lowPower);

// Annual series with no trend: must not be called significant.
const years = Array.from({ length: 40 }, (_, i) => String(1980 + i));
const flat = years.map(() => noise());
const annual = analyzeTrend({ dates: years, values: flat, frequency: 'annual', kind: 'rate' });
assert.equal(annual.test.trend, 'no trend');
assert.ok(annual.slope.lower <= 0 && 0 <= annual.slope.upper);
assert.ok(annual.notes.some((n) => n.includes('rate')));

assert.equal(formatP(0.00004), 'p < 0.001');
assert.equal(formatP(0.0312), 'p = 0.031');
console.log('analyzeTrend: all checks passed');
console.log(JSON.stringify({ test: monthly.test, slope: monthly.slope, notes: monthly.notes }, null, 1));
