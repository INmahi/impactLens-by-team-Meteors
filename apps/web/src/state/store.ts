// The one app store, read by the globe and the panels.
// Plain, serialisable values only: never put Cesium objects here (CLAUDE.md hard rule).
import { create } from 'zustand'
import type { CompareReport, CorrelationReport, DetectabilityReport, TrendReport, UncertaintyReport } from '@trend/stats'

export type Pole = 'north' | 'south'

/** What the right drawer shows: the inputs that produced it travel with the report. */
export interface AnalysisResult {
  variable: string
  region: string
  start: string
  end: string
  report: TrendReport
  /** "Years of data needed", only when the headline test is not significant. */
  detect: DetectabilityReport | null
  /** Source 1-sigma propagated into the slope, only when the series carries sigma. */
  uncertainty: UncertaintyReport | null
  /** Compare mode "regions": the second region and the difference test (its a/b are on the common period). */
  compare: { region: string; report: CompareReport } | null
  /** Compare mode "variables": each extra variable's trend in the same region and its correlation with the main one. */
  extras: { variable: string; report: TrendReport; correlation: CorrelationReport | null }[]
}

export type CompareMode = 'none' | 'regions' | 'variables'

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error'

/** Which picker a globe click fills: the open Region step (main or compare), or none. */
export type PickTarget = 'region' | 'compareRegion' | null

export interface AppState {
  /** Selected variable id from variables.json, or null before the user picks. */
  variable: string | null
  /** Selected region id from regions.json. */
  region: string | null
  /** Second region for compare mode, or null. */
  compareRegion: string | null
  /** Map layer id shown on the globe (a variable's mapMode), or null for none. */
  mapLayer: string | null
  /** Index into the active map layer's timeline: manifest frame dates plus `missing` dates, sorted. A missing date hides the layer. */
  frameIndex: number
  playing: boolean
  pole: Pole
  /** Chosen analysis range, same date format as the variable ("YYYY-MM" or "YYYY"); null = full record. */
  rangeStart: string | null
  rangeEnd: string | null
  compareMode: CompareMode
  /** Up to three more variables for the multi-variable view (same region). */
  compareVariables: string[]

  /** Set by the left drawer while a Region step is open; globe clicks only select then. */
  pickTarget: PickTarget
  /** Region ids a globe click may select for the current pickTarget. */
  pickable: string[]
  /** Increments on every accepted globe pick, so the drawer can move to the next step. */
  globePickSeq: number

  analysisStatus: AnalysisStatus
  analysis: AnalysisResult | null
  analysisError: string | null

  setVariable: (id: string | null) => void
  setRegion: (id: string | null) => void
  setCompareRegion: (id: string | null) => void
  setMapLayer: (id: string | null) => void
  setFrameIndex: (i: number) => void
  setPlaying: (p: boolean) => void
  setPole: (p: Pole) => void
  setRange: (start: string | null, end: string | null) => void
  setCompareMode: (m: CompareMode) => void
  setCompareVariables: (ids: string[]) => void
  setPickTarget: (target: PickTarget, pickable: string[]) => void
  /** Globe click on a region: selects it only if a Region step is open and the region is valid there. */
  pickFromGlobe: (id: string) => void
  setAnalysisRunning: () => void
  setAnalysisDone: (result: AnalysisResult) => void
  setAnalysisError: (message: string) => void
}

export const useAppStore = create<AppState>()((set, get) => ({
  variable: null,
  region: null,
  compareRegion: null,
  mapLayer: null,
  frameIndex: 0,
  playing: false,
  pole: 'north',
  rangeStart: null,
  rangeEnd: null,
  compareMode: 'none',
  compareVariables: [],
  pickTarget: null,
  pickable: [],
  globePickSeq: 0,
  analysisStatus: 'idle',
  analysis: null,
  analysisError: null,

  // Changing the variable resets the range (each variable has its own record) and the comparison picks.
  setVariable: (variable) => set({ variable, rangeStart: null, rangeEnd: null, compareRegion: null, compareVariables: [] }),
  // Changing the region resets the range too: records differ per region.
  setRegion: (region) => set({ region, rangeStart: null, rangeEnd: null }),
  setCompareRegion: (compareRegion) => set({ compareRegion }),
  setMapLayer: (mapLayer) => set({ mapLayer, frameIndex: 0 }),
  setFrameIndex: (frameIndex) => set({ frameIndex }),
  setPlaying: (playing) => set({ playing }),
  setPole: (pole) => set({ pole }),
  setRange: (rangeStart, rangeEnd) => set({ rangeStart, rangeEnd }),
  setCompareMode: (compareMode) => set({ compareMode }),
  setCompareVariables: (compareVariables) => set({ compareVariables: compareVariables.slice(0, 3) }),
  setPickTarget: (pickTarget, pickable) => set({ pickTarget, pickable }),
  pickFromGlobe: (id) => {
    const { pickTarget, pickable, globePickSeq } = get()
    if (!pickTarget || !pickable.includes(id)) return
    if (pickTarget === 'region') set({ region: id, rangeStart: null, rangeEnd: null, globePickSeq: globePickSeq + 1 })
    else set({ compareRegion: id, globePickSeq: globePickSeq + 1 })
  },
  setAnalysisRunning: () => set({ analysisStatus: 'running', analysisError: null }),
  setAnalysisDone: (analysis) => set({ analysisStatus: 'done', analysis, analysisError: null }),
  setAnalysisError: (analysisError) => set({ analysisStatus: 'error', analysisError }),
}))
