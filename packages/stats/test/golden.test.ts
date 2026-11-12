// Golden parity test: the TypeScript engine must match the Python reference
// (pymannkendall + scipy) on every generated series.
// Run:  node packages/stats/test/golden.test.ts
import { readFileSync } from 'node:fs';
import {
  ar1MannKendall, hamedRaoMannKendall, mannKendall, normCdf, normPpf, normSf,
  prewhitenedMannKendall, seasonalMannKendall, senSlope, type MannKendallResult,
} from '../src/index.ts';

const golden = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
const TOL = 1e-9;
let checks = 0;
const failures: string[] = [];
let worst = 0;

function close(name: string, got: number, want: number) {
  checks++;
  const err = Math.abs(got - want) / Math.max(1, Math.abs(want));
  if (!(err <= TOL)) failures.push(`${name}: got ${got}, want ${want}`);
  else if (err > worst) worst = err;
}

golden.norm.z.forEach((z: number, i: number) => {
  close(`cdf(${z})`, normCdf(z), golden.norm.cdf[i]);
  close(`sf(${z})`, normSf(z), golden.norm.sf[i]);
});
golden.norm.p.forEach((p: number, i: number) => close(`ppf(${p})`, normPpf(p), golden.norm.ppf[i]));

let fallbacks = 0;
let looseChecks = 0;
function compare(name: string, got: MannKendallResult, want: any) {
  if (want.p === null) {
    // The reference returned NaN (negative corrected variance). We must fall back, with a warning.
    checks++;
    if (!got.warning || !Number.isFinite(got.p)) failures.push(`${name}: expected a warned fallback`);
    fallbacks++;
    return;
  }
  close(`${name}.s`, got.s, want.s);
  close(`${name}.varS`, got.varS, want.var_s);
  close(`${name}.z`, got.z, want.z);
  close(`${name}.p`, got.p, want.p);
  close(`${name}.tau`, got.tau, want.tau);
  checks++;
  if (got.trend !== want.trend) failures.push(`${name}.trend: got ${got.trend}, want ${want.trend}`);
}

golden.cases.forEach((c: any, i: number) => {
  const x: number[] = c.x.map((v: number | null) => (v === null ? NaN : v));
  compare(`#${i} original`, mannKendall(x), c.original);
  compare(`#${i} hamedRao`, hamedRaoMannKendall(x), c.hamed_rao);
  compare(`#${i} hamedRao(lag=3)`, hamedRaoMannKendall(x, 0.05, 3), c.hamed_rao_lag3);
  // With many tied values, the reference breaks ties by floating-point noise after
  // pre-whitening (a 1e-16 change in the autocorrelation changes its S). Our engine
  // keeps ties tied, so on tie-heavy series we only require z to agree within 1%.
  const valid = x.filter(Number.isFinite);
  const tieHeavy = new Set(valid).size < 0.8 * valid.length;
  if (tieHeavy) {
    looseChecks++;
    const got = prewhitenedMannKendall(x);
    if (Math.abs(got.z - c.tfpw.z) > 0.01 * Math.max(1, Math.abs(c.tfpw.z))) {
      failures.push(`#${i} prewhitened (tie-heavy) z: got ${got.z}, want ${c.tfpw.z}`);
    }
  } else {
    compare(`#${i} prewhitened`, prewhitenedMannKendall(x), c.tfpw);
  }
  if (c.seasonal) compare(`#${i} seasonal`, seasonalMannKendall(x, 12), c.seasonal);
  const ar1 = ar1MannKendall(x);
  compare(`#${i} ar1`, ar1, c.ar1);
  close(`#${i} ar1.correction`, ar1.correction, c.ar1.correction);
  const wide = senSlope(c.t, x, 0.95, ar1.correction);
  close(`#${i} senWide.lower`, wide.lower, c.sen_wide.lower);
  close(`#${i} senWide.upper`, wide.upper, c.sen_wide.upper);
  const sen = senSlope(c.t, x, 0.95);
  close(`#${i} sen.slope`, sen.slope, c.sen.slope);
  close(`#${i} sen.intercept`, sen.intercept, c.sen.intercept);
  close(`#${i} sen.lower`, sen.lower, c.sen.lower);
  close(`#${i} sen.upper`, sen.upper, c.sen.upper);
});

console.log(`reference: ${JSON.stringify(golden.versions)}`);
console.log(`${golden.cases.length} series, ${checks} checks, ${failures.length} failures, worst relative error ${worst.toExponential(2)}, ${fallbacks} warned fallbacks, ${looseChecks} tie-heavy series checked at 1%`);
if (failures.length) {
  console.log(failures.slice(0, Number(process.env.SHOW ?? 25)).join('\n'));
  process.exit(1);
}
