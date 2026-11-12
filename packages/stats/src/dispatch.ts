// Message routing for the stats Web Worker, kept separate from worker.ts so it
// can be tested in Node. Every analysis the app runs goes through here.
import { analyzeTrend, type TrendInput, type TrendReport } from './analyze.ts';
import { compareTrends, type CompareInput, type CompareReport } from './compare.ts';
import { correlateSeries, type CorrelateInput, type CorrelationReport } from './correlate.ts';
import { yearsToDetect, type DetectabilityInput, type DetectabilityReport } from './detect.ts';
import { sensitivity, type SensitivityInput, type SensitivityReport } from './sensitivity.ts';
import { propagateUncertainty, type UncertaintyInput, type UncertaintyReport } from './uncertainty.ts';

/** Inputs and reports for each message type. `trend` is the default when `type` is absent. */
export interface StatsMessages {
  trend: { input: TrendInput; report: TrendReport };
  compare: { input: CompareInput; report: CompareReport };
  correlate: { input: CorrelateInput; report: CorrelationReport };
  sensitivity: { input: SensitivityInput; report: SensitivityReport };
  uncertainty: { input: UncertaintyInput; report: UncertaintyReport };
  detectability: { input: DetectabilityInput; report: DetectabilityReport };
}
export type StatsMessageType = keyof StatsMessages;

export type StatsRequest = {
  [K in StatsMessageType]: { id: number; type?: K; input: StatsMessages[K]['input'] };
}[StatsMessageType];

export type StatsReply =
  | { [K in StatsMessageType]: { id: number; ok: true; type: K; report: StatsMessages[K]['report'] } }[StatsMessageType]
  | { id: number; ok: false; type: StatsMessageType; error: string };

export function runStats(type: StatsMessageType, input: unknown): unknown {
  switch (type) {
    case 'trend': return analyzeTrend(input as TrendInput);
    case 'compare': return compareTrends(input as CompareInput);
    case 'correlate': return correlateSeries(input as CorrelateInput);
    case 'sensitivity': return sensitivity(input as SensitivityInput);
    case 'uncertainty': return propagateUncertainty(input as UncertaintyInput);
    case 'detectability': return yearsToDetect(input as DetectabilityInput);
    default: throw new Error(`Unknown stats message type: ${String(type)}`);
  }
}

export function handleRequest(req: StatsRequest): StatsReply {
  const type = (req.type ?? 'trend') as StatsMessageType;
  try {
    return { id: req.id, ok: true, type, report: runStats(type, req.input) } as StatsReply;
  } catch (err) {
    return { id: req.id, ok: false, type, error: err instanceof Error ? err.message : String(err) };
  }
}
