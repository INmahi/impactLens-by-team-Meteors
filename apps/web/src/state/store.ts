// The one app store, read by the globe and the panels.
// Plain, serialisable values only: never put Cesium objects here (CLAUDE.md hard rule).
import { create } from 'zustand'

export type Pole = 'north' | 'south'

export interface AppState {
  /** Selected variable id from variables.json, or null before the user picks. */
  variable: string | null
  /** Selected region id from regions.json. */
  region: string | null
  /** Second region for compare mode, or null. */
  compareRegion: string | null
  /** Map layer id shown on the globe (a variable's mapMode), or null for none. */
  mapLayer: string | null
  /** Index into the active map layer's manifest frames. */
  frameIndex: number
  playing: boolean
  pole: Pole

  setVariable: (id: string | null) => void
  setRegion: (id: string | null) => void
  setCompareRegion: (id: string | null) => void
  setMapLayer: (id: string | null) => void
  setFrameIndex: (i: number) => void
  setPlaying: (p: boolean) => void
  setPole: (p: Pole) => void
}

export const useAppStore = create<AppState>()((set) => ({
  variable: null,
  region: null,
  compareRegion: null,
  mapLayer: null,
  frameIndex: 0,
  playing: false,
  pole: 'north',

  setVariable: (variable) => set({ variable }),
  setRegion: (region) => set({ region }),
  setCompareRegion: (compareRegion) => set({ compareRegion }),
  setMapLayer: (mapLayer) => set({ mapLayer, frameIndex: 0 }),
  setFrameIndex: (frameIndex) => set({ frameIndex }),
  setPlaying: (playing) => set({ playing }),
  setPole: (pole) => set({ pole }),
}))
