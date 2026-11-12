// Error rates of the M5 additions on synthetic series with a known answer.
// Appends a Markdown section to simulation-results.md:
//   node packages/stats/test/simulate-m5.ts 1000 >> packages/stats/test/simulation-results.md
// Runs on all CPU cores (worker threads); about 10 minutes for 1000 on 12 threads.
import { existsSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  ar1MannKendall, compareTrends, correlateSeries, normPpf, propagateUncertainty, Rng, sensitivity,
  type SeriesInput,
} from '../src/index.ts';

type Job =
  | { kind: 'compare'; label: string; years: number; monthly: boolean; phi: [number, number]; shared: number; sd: [number, number]; slope: [number, number]; seasonal: [number, number]; B: number }
  | { kind: 'correlate'; label: string; years: number; phi: number; trend: [number, number] }
  | { kind: 'sensitivity'; label: string; years: number; phi: number; trend: [number, number]; beta: number }
  | { kind: 'uncertainty'; label: string; years: number; phi: number; sd: number; model: 'independent' | 'correlated' | 'none'; sigma0: number; sigmaGrowth: number; draws: number }
  | { kind: 'detect'; label: string; monthly: boolean; phi: number; sd: number; slope: number; power: number };

function ar1(rng: Rng, n: number, phi: number): number[] {
  const out: number[] = [];
  let p = rng.normal();
  const s = Math.sqrt(1 - phi * phi);
  for (let i = 0; i < n; i++) { p = phi * p + s * rng.normal(); out.push(p); }
  return out;
}
function dates(n: number, monthly: boolean, y0: number): string[] {
  return Array.from({ length: n }, (_, i) => (monthly ? `${y0 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` : String(y0 + i)));
}
const series = (d: string[], v: number[], monthly: boolean, kind: SeriesInput['kind'] = 'level'): SeriesInput =>
  ({ dates: d, values: v, frequency: monthly ? 'monthly' : 'annual', kind });

/** Weatherhead et al. (1998) detection time in years, as in detect.ts, with true parameters. */
function weatherhead(sd: number, phi: number, slope: number, k: number, power: number): number {
  const z = normPpf(0.975) + normPpf(power);
  return ((z * sd * Math.sqrt(12 / k)) / Math.abs(slope) * Math.sqrt((1 + phi) / (1 - phi))) ** (2 / 3);
}

function runOne(job: Job, rep: number): number[] {
  const rng = new Rng(7919 * rep + 13);
  if (job.kind === 'compare') {
    const k = job.monthly ? 12 : 1;
    const n = job.years * k;
    const c = ar1(rng, n, job.phi[0]);
    const mk = (j: 0 | 1) => {
      const e = ar1(rng, n, job.phi[j]);
      return e.map((v, i) => job.slope[j] * i / k + job.sd[j] * (Math.sqrt(job.shared) * c[i] + Math.sqrt(1 - job.shared) * v)
        + (job.monthly ? job.seasonal[j] * Math.sin(2 * Math.PI * i / 12) : 0));
    };
    const d = dates(n, job.monthly, 1993);
    const r = compareTrends({ a: series(d, mk(0), job.monthly), b: series(d, mk(1), job.monthly), replicates: job.B, seed: rep });
    const truth = job.slope[0] - job.slope[1];
    const seA = (r.a.slope.upper - r.a.slope.lower) / 3.919927969080108;
    const seB = (r.b.slope.upper - r.b.slope.lower) / 3.919927969080108;
    const naive = Math.abs(r.difference.perYear) / Math.hypot(seA, seB) > 1.959963984540054;
    return [+r.significant, +r.crossCheck.test.significant, +naive,
      +(r.difference.lower <= truth && truth <= r.difference.upper), r.bootstrap.blockLength, r.slopeCorrelation];
  }
  if (job.kind === 'correlate') {
    const ex = ar1(rng, job.years, job.phi);
    const ey = ar1(rng, job.years, job.phi);
    const d = dates(job.years, false, 1979);
    const r = correlateSeries({
      x: series(d, ex.map((v, i) => job.trend[0] * i + v), false),
      y: series(d, ey.map((v, i) => job.trend[1] * i + v), false),
    });
    return [+(r.raw.pearson.pNaive < 0.05), +r.raw.pearson.significant, +(r.detrended.pearson.pNaive < 0.05),
      +r.detrended.pearson.significant, +r.detrended.spearman.significant];
  }
  if (job.kind === 'sensitivity') {
    const tx = ar1(rng, job.years, job.phi);
    const ey = ar1(rng, job.years, job.phi);
    const d = dates(job.years, false, 1979);
    const temp = tx.map((v, i) => job.trend[0] * i + v);
    const rate = ey.map((v, i) => job.trend[1] * i + job.beta * tx[i] + v);
    const r = sensitivity({ response: series(d, rate, false, 'rate'), driver: series(d, temp, false) });
    return [+r.levels.significant, +r.detrended.significant,
      +(r.detrended.lower <= job.beta && job.beta <= r.detrended.upper)];
  }
  if (job.kind === 'uncertainty') {
    const n = job.years;
    const e = ar1(rng, n, job.phi);
    const sig = Array.from({ length: n }, (_, i) => job.sigma0 + job.sigmaGrowth * i);
    const zc = rng.normal();
    const obs = e.map((v, i) => -100 * i + job.sd * v
      + (job.model === 'independent' ? sig[i] * rng.normal() : job.model === 'correlated' ? sig[i] * zc : 0));
    const r = propagateUncertainty({ ...series(dates(n, false, 1992), obs, false, 'cumulative'), sigma: sig, draws: job.draws, seed: rep });
    const truth = -100;
    return [+(r.fit.lower <= truth && truth <= r.fit.upper), +(r.combined.lower <= truth && truth <= r.combined.upper), r.widening];
  }
  // detect: series with the record length the formula asks for, tested with the headline test.
  const k = job.monthly ? 12 : 1;
  const years = Math.max(5, Math.round(weatherhead(job.sd, job.phi, job.slope, k, job.power)));
  const n = years * k;
  const e = ar1(rng, n, job.phi);
  const y = e.map((v, i) => job.slope * i / k + job.sd * v);
  return [+ar1MannKendall(y).significant, years];
}

if (!isMainThread) {
  const { job, from, to } = workerData as { job: Job; from: number; to: number };
  const acc: number[] = [];
  for (let rep = from; rep < to; rep++) {
    const out = runOne(job, rep);
    out.forEach((v, i) => { acc[i] = (acc[i] ?? 0) + v; });
  }
  parentPort!.postMessage(acc);
} else {
  const REPS = Number(process.argv[2] ?? 1000);
  const W = Math.max(1, availableParallelism() - 1);
  const run = async (job: Job, reps = REPS): Promise<number[]> => {
    const parts = await Promise.all(Array.from({ length: W }, (_, w) => new Promise<number[]>((resolve, reject) => {
      const wk = new Worker(new URL(import.meta.url), { workerData: { job, from: Math.floor((w * reps) / W), to: Math.floor(((w + 1) * reps) / W) } });
      wk.on('message', resolve);
      wk.on('error', reject);
    })));
    return parts.reduce((s, x) => x.map((v, i) => v + (s[i] ?? 0)), [] as number[]);
  };
  const pct = (k: number, d: number) => `${((100 * k) / d).toFixed(1)}%`;
  const out: string[] = [];
  const log = (s = '') => out.push(s);

  log('');
  log('## M5 additions (stats-lead, `simulate-m5.ts`)');
  log('');
  log(`${REPS} simulated series (or pairs) per row unless stated. Noise is AR(1) with lag-1 autocorrelation phi and unit (or stated) marginal SD. Seeds are fixed, so the table is reproducible. Rejection rates at alpha = 0.05; a row with no real effect should be near 5%.`);
  log('');

  // ---------------------------------------------------------------- compare: false positives
  log('### Compare two regions: false-positive rate (equal true slopes)');
  log('');
  log('"Shared" is the share of each series\' noise variance that the two series have in common (for example El Nino in two seas). Headline = z-test with the bootstrap slope correlation (D3). Cross-check = headline Mann-Kendall on A - B. Naive = treating the two slopes as independent (what comparing two intervals by eye does). Bootstrap B = 299 here (the app uses 1,000; B only affects the slope correlation).');
  log('');
  log('| Pair | Headline | Cross-check (MK on A - B) | Naive independent | 95% interval covers true difference | Mean block length | Mean slope correlation |');
  log('|---|---|---|---|---|---|---|');
  const fpr: Job[] = [
    { kind: 'compare', label: 'annual, 45 years, phi 0, shared 0', years: 45, monthly: false, phi: [0, 0], shared: 0, sd: [1, 1], slope: [0.1, 0.1], seasonal: [0, 0], B: 299 },
    { kind: 'compare', label: 'annual, 45 years, phi 0.3, shared 0.5', years: 45, monthly: false, phi: [0.3, 0.3], shared: 0.5, sd: [1, 2], slope: [0.1, 0.1], seasonal: [0, 0], B: 299 },
    { kind: 'compare', label: 'annual, 45 years, phi 0.6, shared 0.5', years: 45, monthly: false, phi: [0.6, 0.6], shared: 0.5, sd: [1, 2], slope: [0.1, 0.1], seasonal: [0, 0], B: 299 },
    { kind: 'compare', label: 'annual, 45 years, phi 0.3, shared 0.8', years: 45, monthly: false, phi: [0.3, 0.3], shared: 0.8, sd: [1, 1], slope: [0.1, 0.1], seasonal: [0, 0], B: 299 },
    { kind: 'compare', label: 'annual, 30 years, phi 0.3, shared 0.5', years: 30, monthly: false, phi: [0.3, 0.3], shared: 0.5, sd: [1, 2], slope: [0.1, 0.1], seasonal: [0, 0], B: 299 },
    { kind: 'compare', label: 'annual, 30 years, phi 0.6, shared 0.5', years: 30, monthly: false, phi: [0.6, 0.6], shared: 0.5, sd: [1, 2], slope: [0.1, 0.1], seasonal: [0, 0], B: 299 },
    { kind: 'compare', label: 'monthly, 34 years, phi 0.6, shared 0.5, seasonal cycles', years: 34, monthly: true, phi: [0.6, 0.6], shared: 0.5, sd: [1, 2], slope: [0.1, 0.1], seasonal: [5, 10], B: 299 },
    { kind: 'compare', label: 'monthly, 34 years, phi 0.8, shared 0.5, seasonal cycles', years: 34, monthly: true, phi: [0.8, 0.8], shared: 0.5, sd: [1, 2], slope: [0.1, 0.1], seasonal: [5, 10], B: 299 },
    { kind: 'compare', label: 'monthly, 34 years, phi 0.6, shared 0', years: 34, monthly: true, phi: [0.6, 0.6], shared: 0, sd: [1, 4], slope: [0.1, 0.1], seasonal: [5, 10], B: 299 },
  ];
  for (const job of fpr) {
    const r = await run(job);
    if (job.kind !== 'compare') continue;
    log(`| ${job.label} | **${pct(r[0], REPS)}** | ${pct(r[1], REPS)} | ${pct(r[2], REPS)} | ${pct(r[3], REPS)} | ${(r[4] / REPS).toFixed(1)} | ${(r[5] / REPS).toFixed(2)} |`);
  }
  log('');

  // ---------------------------------------------------------------- compare: demo pairs
  log('### Compare: power on the synthetic demo pairs');
  log('');
  log('Fresh noise with the parameters each synthetic series was generated with (`pipeline/synthetic/config.py`: injected slope, AR(1), noise SD, seasonal amplitude). Noise is independent between regions, as in the generator. "Detected" = the headline compare test calls the difference significant.');
  log('');
  log('| Pair (true slopes) | Common period | Detected (headline) | Cross-check | 95% interval covers true difference |');
  log('|---|---|---|---|---|');
  const demo: Job[] = [
    { kind: 'compare', label: 'Gulf of Mexico 4.6 vs Mediterranean 2.6 mm/yr', years: 34, monthly: true, phi: [0.65, 0.75], shared: 0, sd: [10, 9], slope: [4.6, 2.6], seasonal: [70, 60], B: 299 },
    { kind: 'compare', label: 'North Sea 3.3 vs global 3.3 mm/yr (no real difference)', years: 34, monthly: true, phi: [0.6, 0.6], shared: 0, sd: [12, 3], slope: [3.3, 3.3], seasonal: [40, 2], B: 299 },
    { kind: 'compare', label: 'Bay of Bengal 3.9 vs global 3.3 mm/yr', years: 34, monthly: true, phi: [0.7, 0.6], shared: 0, sd: [12, 3], slope: [3.9, 3.3], seasonal: [80, 2], B: 299 },
    { kind: 'compare', label: 'Greenland -5 vs Antarctica -3.5 Gt/yr per yr (ice_mass_rate)', years: 45, monthly: false, phi: [0.4, 0.3], shared: 0, sd: [40, 50], slope: [-5, -3.5], seasonal: [0, 0], B: 299 },
  ];
  const demoPeriod = ['monthly, 34 years', 'monthly, 34 years', 'monthly, 34 years', 'annual, 45 years (1979-2023)'];
  for (const [i, job] of demo.entries()) {
    const r = await run(job);
    log(`| ${job.label} | ${demoPeriod[i]} | **${pct(r[0], REPS)}** | ${pct(r[1], REPS)} | ${pct(r[3], REPS)} |`);
  }
  log('');

  // ---------------------------------------------------------------- demo data on disk
  const root = new URL('../../../data/public/', import.meta.url);
  const load = (v: string, r: string) => JSON.parse(readFileSync(new URL(`${v}/series/${r}.json`, root), 'utf8'));
  if (existsSync(new URL('sea_level/series/global.json', root))) {
    log('### Compare: outcome on the generated demo files (`data/public`, one realisation, default seed and B = 1,000)');
    log('');
    log('| Pair | Common period | Slope A | Slope B | Difference [95% interval] | p | Verdict | Cross-check p |');
    log('|---|---|---|---|---|---|---|---|');
    for (const [v, a, b] of [['sea_level', 'gulf_of_mexico', 'mediterranean'], ['sea_level', 'north_sea', 'global'], ['sea_level', 'bay_of_bengal', 'global'], ['ice_mass_rate', 'greenland', 'antarctica']]) {
      const r = compareTrends({ a: load(v, a), b: load(v, b) });
      const f = (x: number) => x.toFixed(2);
      const p = (x: number) => (x < 0.001 ? '< 0.001' : x.toPrecision(2));
      log(`| ${v}: ${a} vs ${b} | ${r.start} to ${r.end} | ${f(r.a.slope.perYear)} | ${f(r.b.slope.perYear)} | ${f(r.difference.perYear)} [${f(r.difference.lower)}, ${f(r.difference.upper)}] | ${p(r.p)} | ${r.verdict} | ${p(r.crossCheck.test.p)} |`);
    }
    log('');
  }

  // ---------------------------------------------------------------- correlation
  log('### Two variables: correlation false-positive rate (independent series that both trend)');
  log('');
  log('Two independent annual series, 45 years, each with its own trend (in SD units per year) and AR(1) noise. Any "significant" correlation is false.');
  log('');
  log('| Series | Raw, naive p | Raw, effective n | Detrended, naive p | **Detrended Pearson, effective n** | Detrended Spearman, effective n |');
  log('|---|---|---|---|---|---|');
  for (const job of [
    { kind: 'correlate', label: 'phi 0, trends 0.05 and -0.05', years: 45, phi: 0, trend: [0.05, -0.05] },
    { kind: 'correlate', label: 'phi 0.3, trends 0.05 and -0.05', years: 45, phi: 0.3, trend: [0.05, -0.05] },
    { kind: 'correlate', label: 'phi 0.6, trends 0.05 and -0.05', years: 45, phi: 0.6, trend: [0.05, -0.05] },
    { kind: 'correlate', label: 'phi 0.6, no trends', years: 45, phi: 0.6, trend: [0, 0] },
  ] as Job[]) {
    const r = await run(job);
    log(`| ${job.label} | ${pct(r[0], REPS)} | ${pct(r[1], REPS)} | ${pct(r[2], REPS)} | **${pct(r[3], REPS)}** | ${pct(r[4], REPS)} |`);
  }
  log('');

  // ---------------------------------------------------------------- sensitivity
  log('### Sensitivity (rate on temperature, HAC errors)');
  log('');
  log('Annual, 45 years. "No link": rate and temperature independent but both trending. "Link": rate = beta x temperature anomaly + noise (beta = -50), plus a trend. Rejection of slope = 0, and coverage of the detrended 95% interval.');
  log('');
  log('| Series | Levels slope significant | **Detrended slope significant** | Detrended interval covers true beta |');
  log('|---|---|---|---|');
  for (const job of [
    { kind: 'sensitivity', label: 'no link, phi 0.3, both trending', years: 45, phi: 0.3, trend: [0.05, -0.1], beta: 0 },
    { kind: 'sensitivity', label: 'no link, phi 0.6, both trending', years: 45, phi: 0.6, trend: [0.05, -0.1], beta: 0 },
    { kind: 'sensitivity', label: 'link beta -50, phi 0.3', years: 45, phi: 0.3, trend: [0.05, -0.1], beta: -50 },
  ] as Job[]) {
    const r = await run(job);
    log(`| ${job.label} | ${pct(r[0], REPS)} | **${pct(r[1], REPS)}** | ${pct(r[2], REPS)} |`);
  }
  log('');

  // ---------------------------------------------------------------- uncertainty
  const UREPS = Math.min(REPS, 500);
  log('### Source uncertainty: interval coverage with and without the Monte Carlo propagation');
  log('');
  log(`${UREPS} series per row, 32 annual points of a cumulative series (true slope -100 per year, AR(1) noise SD 30, phi 0.3) plus measurement error with the stated 1-sigma. 2,000 draws per error model. Coverage of the true slope by the fit interval alone and by the interval shown (the wider of independent and fully correlated).`);
  log('');
  log('| Measurement error actually added | Stated sigma | Fit interval covers | **Interval shown covers** | Mean widening |');
  log('|---|---|---|---|---|');
  for (const job of [
    { kind: 'uncertainty', label: 'none', years: 32, phi: 0.3, sd: 30, model: 'none', sigma0: 20, sigmaGrowth: 0, draws: 2000 },
    { kind: 'uncertainty', label: 'independent', years: 32, phi: 0.3, sd: 30, model: 'independent', sigma0: 60, sigmaGrowth: 0, draws: 2000 },
    { kind: 'uncertainty', label: 'fully correlated, growing', years: 32, phi: 0.3, sd: 30, model: 'correlated', sigma0: 20, sigmaGrowth: 10, draws: 2000 },
  ] as Job[]) {
    const r = await run(job, UREPS);
    if (job.kind !== 'uncertainty') continue;
    const sigma = job.sigmaGrowth ? `${job.sigma0} + ${job.sigmaGrowth} per year` : `${job.sigma0}`;
    log(`| ${job.label} | ${sigma} | ${pct(r[0], UREPS)} | **${pct(r[1], UREPS)}** | ${(100 * r[2] / UREPS).toFixed(0)}% |`);
  }
  log('');

  // ---------------------------------------------------------------- detectability
  log('### "Years until significant": calibration of the Weatherhead formula against the headline test');
  log('');
  log('For each row the formula (D7) is evaluated with the TRUE slope, noise SD and phi. Series of exactly that length are then simulated and tested with the headline Mann-Kendall test. If the formula fitted the headline test exactly, the detection rate would equal the target power.');
  log('');
  log('| Series | Target power | Record length the formula asks for | **Headline test detects** |');
  log('|---|---|---|---|');
  for (const job of [
    { kind: 'detect', label: 'annual, phi 0, SD 1, slope 0.05/yr', monthly: false, phi: 0, sd: 1, slope: 0.05, power: 0.8 },
    { kind: 'detect', label: 'annual, phi 0.3, SD 1, slope 0.05/yr', monthly: false, phi: 0.3, sd: 1, slope: 0.05, power: 0.8 },
    { kind: 'detect', label: 'annual, phi 0.6, SD 1, slope 0.05/yr', monthly: false, phi: 0.6, sd: 1, slope: 0.05, power: 0.8 },
    { kind: 'detect', label: 'annual, phi 0.2, SD 0.6, slope 0.01/yr (Antarctic temperature-like)', monthly: false, phi: 0.2, sd: 0.6, slope: 0.01, power: 0.8 },
    { kind: 'detect', label: 'monthly, phi 0.6, SD 12, slope 1 mm/yr', monthly: true, phi: 0.6, sd: 12, slope: 1, power: 0.8 },
    { kind: 'detect', label: 'monthly, phi 0.8, SD 15, slope 1 mm/yr', monthly: true, phi: 0.8, sd: 15, slope: 1, power: 0.8 },
    { kind: 'detect', label: 'annual, phi 0.3, SD 1, slope 0.05/yr', monthly: false, phi: 0.3, sd: 1, slope: 0.05, power: 0.9 },
  ] as Job[]) {
    const r = await run(job);
    if (job.kind !== 'detect') continue;
    log(`| ${job.label} | ${(job.power * 100).toFixed(0)}% | ${(r[1] / REPS).toFixed(0)} years | **${pct(r[0], REPS)}** |`);
  }
  log('');
  console.log(out.join('\n'));
}
