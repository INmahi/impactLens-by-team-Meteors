// Runs the M5 compare test on the synthetic demo pairs in data/public (run `pnpm data` first).
// Usage: node packages/stats/test/demo-pairs.ts
import { readFileSync } from 'node:fs';
import { compareTrends } from '../src/index.ts';

const root = new URL('../../../data/public/', import.meta.url);
const load = (v: string, r: string) => {
  const s = JSON.parse(readFileSync(new URL(`${v}/series/${r}.json`, root), 'utf8'));
  return { dates: s.dates, values: s.values, frequency: s.frequency, kind: s.kind };
};
const pairs: [string, string, string, string][] = [
  ['sea_level', 'gulf_of_mexico', 'sea_level', 'mediterranean'],
  ['sea_level', 'north_sea', 'sea_level', 'global'],
  ['sea_level', 'bay_of_bengal', 'sea_level', 'global'],
  ['ice_mass_rate', 'greenland', 'ice_mass_rate', 'antarctica'],
];
for (const [va, ra, vb, rb] of pairs) {
  const r = compareTrends({ a: load(va, ra), b: load(vb, rb) }) as any;
  const d = r.difference;
  console.log(`${va}: ${ra} vs ${rb}: verdict=${r.verdict} diff=${d.perYear.toFixed(3)}/yr [${d.lower.toFixed(3)}, ${d.upper.toFixed(3)}] p=${r.p.toExponential(2)}`);
}
