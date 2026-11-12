export {
  erfc, normCdf, normPpf, normSf,
  lgamma, betaincReg, studentTSf, studentTTwoSided, studentTPpf,
} from './distributions.ts';
export { senSlope, senSlopeValue, type SenSlopeResult } from './senSlope.ts';
export {
  acf,
  ar1MannKendall,
  deseasonalize,
  deseasonalizeWithTrend,
  hamedRaoMannKendall,
  mannKendall,
  mkScore,
  mkVariance,
  prewhitenedMannKendall,
  seasonalMannKendall,
  type MannKendallResult,
  type TrendDirection,
} from './mannKendall.ts';
export {
  analyzeTrend,
  formatP,
  type Frequency,
  type SeriesKind,
  type TrendInput,
  type TrendReport,
} from './analyze.ts';
// M5 additions
export { Rng } from './random.ts';
export { quantileSorted } from './quantile.ts';
export {
  alignPair, gridSeries, lag1, toAnnual, validSpan, MIN_MONTHS_PER_YEAR,
  type AlignedPair, type Grid, type Lag1, type SeriesInput,
} from './prepare.ts';
export {
  compareTrends, blockLength, pairedBlockBootstrap, BLOCK_RULE, DEFAULT_REPLICATES, DEFAULT_SEED,
  type CompareInput, type CompareReport, type CompareVerdict,
} from './compare.ts';
export {
  correlateSeries, effectiveN, rankAverage,
  type CorrelateInput, type CorrelationBlock, type CorrelationReport, type CorrStat, type LagCorrelation,
} from './correlate.ts';
export {
  sensitivity, olsHac, neweyWestLags,
  type RegressionFit, type SensitivityInput, type SensitivityReport,
} from './sensitivity.ts';
export {
  propagateUncertainty,
  type McInterval, type UncertaintyInput, type UncertaintyReport,
} from './uncertainty.ts';
export { yearsToDetect, type DetectabilityInput, type DetectabilityReport } from './detect.ts';
export {
  handleRequest, runStats,
  type StatsMessages, type StatsMessageType, type StatsReply, type StatsRequest,
} from './dispatch.ts';
