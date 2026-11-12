// Web Worker entry point, so the analysis never blocks the globe.
//
// In the app (Vite):
//   import StatsWorker from '@trend/stats/worker?worker';
//   const worker = new StatsWorker();
//   worker.postMessage({ id: 1, input });                     // trend (default): input is a TrendInput
//   worker.postMessage({ id: 2, type: 'compare', input });    // CompareInput
//   worker.onmessage = (e) => e.data;   // { id, ok: true, type, report } or { id, ok: false, type, error }
//
// Message types (see dispatch.ts, StatsMessages):
//   'trend'         analyzeTrend          -> TrendReport (default when `type` is absent)
//   'compare'       compareTrends         -> CompareReport
//   'correlate'     correlateSeries       -> CorrelationReport
//   'sensitivity'   sensitivity           -> SensitivityReport
//   'uncertainty'   propagateUncertainty  -> UncertaintyReport
//   'detectability' yearsToDetect         -> DetectabilityReport
import { handleRequest, type StatsRequest } from './dispatch.ts';

const ctx = self as unknown as {
  onmessage: ((e: { data: StatsRequest }) => void) | null;
  postMessage: (message: unknown) => void;
};

ctx.onmessage = (e) => {
  ctx.postMessage(handleRequest(e.data));
};
