// The one app store, read by the globe and the panels.
// Plain, serialisable values only: never put Cesium objects here (CLAUDE.md hard rule).
import { create } from 'zustand'
import type { TrendReport } from '@trend/stats'

export type Pole = 'north' | 'south'

/** What the right drawer shows: the inputs that produced it travel with the report. */
export interface AnalysisResult {
  variable: string
  region: string
  start: string
  end: string
  report: TrendReport
}

export type AnalysisStatus = 'idle' | 'running' | 'done' | 'error'

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
  setAnalysisRunning: () => void
  setAnalysisDone: (result: AnalysisResult) => void
  setAnalysisError: (message: string) => void
}

export const useAppStore = create<AppState>()((set) => ({
  variable: null,
  region: null,
  compareRegion: null,
  mapLayer: null,
  frameIndex: 0,
  playing: false,
  pole: 'north',
  rangeStart: null,
  rangeEnd: null,
  analysisStatus: 'idle',
  analysis: null,
  analysisError: null,

  // Changing the variable resets the range (each variable has its own record).
  setVariable: (variable) => set({ variable, rangeStart: null, rangeEnd: null }),
  // Changing the region resets the range too: records differ per region.
  setRegion: (region) => set({ region, rangeStart: null, rangeEnd: null }),
  setCompareRegion: (compareRegion) => set({ compareRegion }),
  setMapLayer: (mapLayer) => set({ mapLayer, frameIndex: 0 }),
  setFrameIndex: (frameIndex) => set({ frameIndex }),
  setPlaying: (playing) => set({ playing }),
  setPole: (pole) => set({ pole }),
  setRange: (rangeStart, rangeEnd) => set({ rangeStart, rangeEnd }),
  setAnalysisRunning: () => set({ analysisStatus: 'running', analysisError: null }),
  setAnalysisDone: (analysis) => set({ analysisStatus: 'done', analysis, analysisError: null }),
  setAnalysisError: (analysisError) => set({ analysisStatus: 'error', analysisError }),
}))
