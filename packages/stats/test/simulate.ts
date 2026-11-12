// Error-rate check on synthetic data with a known answer.
// For each test: how often it reports a trend. On "no trend" rows this is the
// false-positive rate and should be near 5%. On "trend" rows it is the power.
// Last column: how often the widened Sen's slope 95% interval contains the true slope.
// Run:  node packages/stats/test/simulate.ts [reps]     (about 2 minutes for 1000)
import {
  ar1MannKendall, deseasonalizeWithTrend, hamedRaoMannKendall, mannKendall,
  prewhitenedMannKendall, seasonalMannKendall, senSlope,
} from '../src/index.ts';

const REPS = Number(process.argv[2] ?? 1000);
const CI_REPS = Math.min(REPS, 300);
let seed = 20261114;
function rand(): number {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss(): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}
function ar1(n: number, phi: number): number[] {
  const out: number[] = [];
  let prev = gauss() / Math.sqrt(1 - phi * phi);
  for (let i = 0; i < n; i++) { prev = phi * prev + gauss(); out.push(prev); }
  return out;
}
const pct = (k: number, d = REPS) => `${((100 * k) / d).toFixed(1)}%`.padStart(6);

console.log(`${REPS} simulated series per row; phi is the lag-1 autocorrelation of the noise.\n`);
console.log('| Series | Plain MK | Hamed-Rao | Pre-whitened | Seasonal MK | **App headline (lag-1 corrected)** | Sen 95% CI covers truth |');
console.log('|---|---|---|---|---|---|---|');

function run(label: string, n: number, monthly: boolean, phi: number, slopePerStep: number) {
  let plain = 0, hr = 0, tfpw = 0, seas = 0, head = 0, cover = 0;
  for (let r = 0; r < REPS; r++) {
    const raw = ar1(n, phi).map((e, i) => slopePerStep * i + e + (monthly ? 3 * Math.sin((2 * Math.PI * i) / 12) : 0));
    const x = monthly ? deseasonalizeWithTrend(raw, 12) : raw;
    if (mannKendall(x).significant) plain++;
    if (hamedRaoMannKendall(x).significant) hr++;
    if (prewhitenedMannKendall(x).significant) tfpw++;
    if (monthly && seasonalMannKendall(raw, 12).significant) seas++;
    const h = ar1MannKendall(x);
    if (h.significant) head++;
    if (r < CI_REPS) {
      const s = senSlope(x.map((_, i) => i), x, 0.95, h.correction);
      if (s.lower <= slopePerStep && slopePerStep <= s.upper) cover++;
    }
  }
  console.log(`| ${label} | ${pct(plain)} | ${pct(hr)} | ${pct(tfpw)} | ${monthly ? pct(seas) : '-'} | **${pct(head).trim()}** | ${pct(cover, CI_REPS)} |`);
}

for (const n of [30, 50]) for (const phi of [0, 0.3, 0.6, 0.8]) run(`annual, ${n} years, phi ${phi}, no trend`, n, false, phi, 0);
for (const phi of [0, 0.3, 0.6, 0.8]) run(`monthly, 30 years, phi ${phi}, no trend`, 360, true, phi, 0);
for (const phi of [0, 0.3, 0.6]) run(`annual, 50 years, phi ${phi}, real trend`, 50, false, phi, 0.04);
for (const phi of [0, 0.3, 0.6]) run(`monthly, 30 years, phi ${phi}, real trend`, 360, true, phi, 0.004);
