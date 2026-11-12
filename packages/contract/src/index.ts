// TypeScript types for the data contract. Mirror of ../schemas/*.schema.json;
// change both together. The stats file type comes from @trend/stats.
import type { TrendReport } from '@trend/stats';

export type Id = string;
/** "YYYY-MM" for monthly series, "YYYY" for annual. */
export type DateStr = string;
export type Period = [DateStr, DateStr];
export type Frequency = 'monthly' | 'annual';
export type Kind = 'level' | 'cumulative' | 'rate';

export interface Source {
  name: string;
  url: string;
  citation: string;
  doi?: string;
  version?: string;
}

export interface Variable {
  id: Id;
  group?: Id;
  /** Long-record or alternative-source variant of another variable; never joined to it. */
  variantOf?: Id;
  name: string;
  units: string;
  kind: Kind;
  frequency: Frequency;
  /** Overall span across regions. */
  period: Period;
  /** True record per region; keys equal `regions`. */
  periods: Record<Id, Period>;
  /** Anomaly reference period. */
  baseline?: Period;
  regions: Id[];
  mapMode: Id | null;
  /** Path under data/public of dated outlines (ice extent ghost outline). */
  outlines?: string;
  chartTypes: string[];
  source: Source;
  describe: { video: string; what: string; whyItMatters: string };
  notes: string[];
  synthetic: boolean;
}

export type RegionKind = 'ice_sheet' | 'ice_sheet_basin' | 'glacier_region' | 'global';

export interface Region {
  id: Id;
  name: string;
  parent: Id | null;
  kind: RegionKind;
  variables: Id[];
  /** [west, south, east, north] in degrees. */
  bbox: [number, number, number, number];
  camera: { lon: number; lat: number; height: number; heading: number; pitch: number };
}

export interface Segment {
  source: string;
  start: DateStr;
  end: DateStr;
  offset: number;
}

export interface Series {
  variable: Id;
  region: Id;
  units: string;
  frequency: Frequency;
  kind: Kind;
  dates: DateStr[];
  values: (number | null)[];
  sigma?: (number | null)[];
  lower?: (number | null)[];
  upper?: (number | null)[];
  bounds?: string;
  segments: Segment[];
  synthetic: boolean;
  injected?: { slopePerYear: number; ar1?: number; noiseSd?: number };
}

export interface Frame {
  date: DateStr;
  atlas: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Manifest {
  variable: Id;
  units: string;
  grid: { bbox: [number, number, number, number]; width: number; height: number };
  encoding: { scale: number; offset: number; packing: 'R=high byte, G=low byte, B=valid mask, A=255' };
  valueRange: [number, number];
  atlases: { file: string; width: number; height: number }[];
  frames: Frame[];
  missing: DateStr[];
  source?: Source;
  synthetic: boolean;
}

export type StatsFile = TrendReport & { variable: Id; region: Id; synthetic: boolean };

/** Decode one packed texel. Returns null where the valid mask is off. */
export function decodeTexel(r: number, g: number, b: number, scale: number, offset: number): number | null {
  return b === 255 ? (r * 256 + g) * scale + offset : null;
}

/** Paths under data/public. */
export const paths = {
  variables: 'variables.json',
  regions: 'regions.json',
  regionsTopo: 'regions.topo.json',
  series: (variable: Id, region: Id) => `${variable}/series/${region}.json`,
  stats: (variable: Id, region: Id) => `${variable}/stats/${region}__default.json`,
  manifest: (layer: Id) => `${layer}/manifest.json`,
  colormap: (layer: Id) => `${layer}/colormap.png`,
} as const;
