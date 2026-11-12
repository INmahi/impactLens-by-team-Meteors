// Web Worker entry point, so the analysis never blocks the globe.
//
// In the app:
//   const worker = new Worker(new URL('@trend/stats/worker', import.meta.url), { type: 'module' });
//   worker.postMessage({ id: 1, input });           // input: TrendInput
//   worker.onmessage = (e) => e.data;                // { id, ok: true, report } or { id, ok: false, error }
import { analyzeTrend, type TrendInput } from './analyze.ts';

interface Request {
  id: number;
  input: TrendInput;
}

const ctx = self as unknown as {
  onmessage: ((e: { data: Request }) => void) | null;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (e) => {
  const { id, input } = e.data;
  try {
    ctx.postMessage({ id, ok: true, report: analyzeTrend(input) });
  } catch (err) {
    ctx.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
