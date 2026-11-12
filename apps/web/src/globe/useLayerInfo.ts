// React hooks over layerData: plain JSON only (manifest, variables), never Cesium objects.
import { useEffect, useState } from 'react'
import type { Manifest, Variable } from '@trend/contract'
import { useAppStore } from '@/state/store'
import { clampIndex, getManifest, getVariables, layerIsSynthetic, layerTimeline, type TimelineStep } from './layerData'

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

export interface ActiveLayer {
  layer: string
  manifest: Manifest
  timeline: TimelineStep[]
  /** Integer step shown (the store index clamped and floored). */
  index: number
  step: TimelineStep
}

/** The store's map layer with its manifest and the current timeline step, or null. */
export function useActiveLayer(): ActiveLayer | null {
  const layer = useAppStore((s) => s.mapLayer)
  const frameIndex = useAppStore((s) => s.frameIndex)
  const manifest = useManifest(layer)
  if (!layer || !manifest) return null
  const timeline = layerTimeline(manifest)
  if (timeline.length === 0) return null
  const index = Math.floor(clampIndex(frameIndex, timeline.length))
  return { layer, manifest, timeline, index, step: timeline[index] }
}

/** True when the data on screen is synthetic: the active layer (manifest or a variable using it) or the selected variable. */
export function useShowsSyntheticData(): boolean {
  const layer = useAppStore((s) => s.mapLayer)
  const variableId = useAppStore((s) => s.variable)
  const variables = useVariables()
  const manifest = useManifest(layer)
  const variableSynthetic = !!variableId && !!variables?.find((v) => v.id === variableId)?.synthetic
  return variableSynthetic || layerIsSynthetic(manifest, variables, layer)
}
