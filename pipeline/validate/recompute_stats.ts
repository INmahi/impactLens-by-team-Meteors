// Runs the real stats engine (packages/stats) on a batch of series.
//
// stdin:  JSON array of TrendInput objects
// stdout: JSON array, same order, of { ok: true, report } or { ok: false, error }
//
// Non-finite numbers in a report (NaN, Infinity) are written as the strings
// "NaN", "Infinity" or "-Infinity" so the caller can tell them apart from null.
//
// Usage: node pipeline/validate/recompute_stats.ts < inputs.json
// Node 22.18+ strips the TypeScript types natively.
import { analyzeTrend, type TrendInput } from '../../packages/stats/src/index.ts';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

const inputs = JSON.parse(await readStdin()) as TrendInput[];
if (!Array.isArray(inputs)) throw new Error('stdin must be a JSON array of TrendInput');

const results = inputs.map((input) => {
  try {
    return { ok: true, report: analyzeTrend(input) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

process.stdout.write(JSON.stringify(results, replacer));
