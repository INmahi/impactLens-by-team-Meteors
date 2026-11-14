// React hooks over layerData / mapModes: plain JSON only (manifest, variables, outlines),
// never Cesium objects.
import { useEffect, useMemo, useState } from 'react'
import type { Manifest, Variable } from '@trend/contract'
import { useAppStore } from '@/state/store'
import { clampIndex, getManifest, getVariables } from './layerData'
import {
  getOutlines,
  gridSteps,
  mapModes,
  modeVariable,
  outlineSteps,
  resolveMapMode,
  variableWithoutMap,
  type MapMode,
  type ModeStep,
  type OutlinesData,
} from './mapModes'

/** variables.json, or null while loading / on error. */
export function useVariables(): Variable[] | null {
  const [variables, setVariables] = useState<Variable[] | null>(null)
  useEffect(() => {
    let alive = true
    getVariables()
      .then((v) => alive && setVariables(v))
      .catch((err: unknown) => console.error('Globe: failed to load variables.json', err))
    return () => {
      alive = false
    }
  }, [])
  return variables
}

/** Map modes from variables.json (grid layers, then outline layers), or null while loading. */
export function useMapModes(): MapMode[] | null {
  const variables = useVariables()
  return useMemo(() => (variables ? mapModes(variables) : null), [variables])
}

/** The manifest of `layer`, or null while loading, on error, or for a null layer. */
export function useManifest(layer: string | null): Manifest | null {
  const [state, setState] = useState<{ layer: string; manifest: Manifest } | null>(null)
  useEffect(() => {
    if (!layer) return
    let alive = true
    getManifest(layer)
      .then((manifest) => alive && setState({ layer, manifest }))
      .catch((err: unknown) => console.error(`Globe: failed to load manifest for "${layer}"`, err))
    return () => {
      alive = false
    }
  }, [layer])
  return layer && state?.layer === layer ? state.manifest : null
}

/** Parsed outlines file at `path` (under data/public), or null. */
export function useOutlines(path: string | null): OutlinesData | null {
  const [state, setState] = useState<{ path: string; data: OutlinesData } | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    getOutlines(path)
      .then((data) => alive && setState({ path, data }))
      .catch((err: unknown) => console.error(`Globe: failed to load outlines "${path}"`, err))
    return () => {
      alive = false
    }
  }, [path])
  return path && state?.path === path ? state.data : null
}

export interface ActiveMode {
  mode: MapMode
  /** The variable that names the mode (legend title, source). */
  variable: Variable | null
  manifest: Manifest | null
  outlines: OutlinesData | null
  /** The timeline the store's frameIndex indexes. */
  steps: ModeStep[]
  /** Integer step shown (the store index clamped and floored). */
  index: number
  step: ModeStep
}

/**
 * The map mode drawn on the globe (store `mapLayer`, unless the selected variable has no map)
 * with its data and the current step, or null when nothing is drawn or still loading.
 */
export function useActiveMode(): ActiveMode | null {
  const mapLayer = useAppStore((s) => s.mapLayer)
  const variableId = useAppStore((s) => s.variable)
  const frameIndex = useAppStore((s) => s.frameIndex)
  const variables = useVariables()
  const modes = useMapModes()
  const mode = variables && modes ? resolveMapMode(modes, variables, mapLayer, variableId) : null
  const manifest = useManifest(mode?.kind === 'grid' ? mode.id : null)
  const outlines = useOutlines(mode?.kind === 'outline' ? mode.outlines : null)
  if (!mode || !variables) return null
  let steps: ModeStep[] | null = null
  if (mode.kind === 'grid' && manifest) steps = gridSteps(manifest)
  if (mode.kind === 'outline' && outlines) steps = outlineSteps(mode, outlines)
  if (!steps || steps.length === 0) return null
  const index = Math.floor(clampIndex(frameIndex, steps.length))
  return {
    mode,
    variable: modeVariable(variables, mode),
    manifest: mode.kind === 'grid' ? manifest : null,
    outlines: mode.kind === 'outline' ? outlines : null,
    steps,
    index,
    step: steps[index],
  }
}

/** The selected variable when it has no map layer (e.g. sea level), else null. Data-driven. */
export function useVariableWithoutMap(): Variable | null {
  const variableId = useAppStore((s) => s.variable)
  const variables = useVariables()
  return variables ? variableWithoutMap(variables, variableId) : null
}

