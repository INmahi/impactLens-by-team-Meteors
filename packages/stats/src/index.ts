export { erfc, normCdf, normPpf, normSf } from './distributions.ts';
export { senSlope, type SenSlopeResult } from './senSlope.ts';
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
