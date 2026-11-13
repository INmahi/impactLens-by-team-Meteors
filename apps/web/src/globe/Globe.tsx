// The 3D globe. Fills its parent (position: absolute; inset: 0); give the parent a size
// and `position: relative` (or make it the fixed full-screen layer).
//
// - Viewer created once behind a ref guard and destroyed in cleanup (StrictMode-safe).
// - No Cesium ion: base layer is NASA GIBS, terrain is the bare ellipsoid, no geocoder.
// - Cesium objects live only in the engine ref; the store is read with `subscribe`.
import { useEffect, useRef } from 'react'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useAppStore } from '@/state/store'
import { registerEngine } from './controller'
import { GlobeEngine } from './engine'
import { getVariables } from './layerData'
import { mapModes, resolveMapMode, type MapMode } from './mapModes'
import { getRegionsData } from './regions'

export default function Globe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GlobeEngine | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || engineRef.current) return
    const engine = new GlobeEngine(container)
    engineRef.current = engine
    registerEngine(engine)
    // Development only: inspect the live globe from the browser console (window.__engine). Not in builds.
    if (import.meta.env.DEV) (window as unknown as { __engine?: GlobeEngine }).__engine = engine
    // Clicks select a region only while a Region step is open in the left drawer (store decides).
    engine.onPick = (id) => useAppStore.getState().pickFromGlobe(id)
    // Hover: region name follows the cursor; DOM written directly (no React render per move).
    const names = new Map<string, string>()
    const hideTip = () => {
      if (tipRef.current) tipRef.current.style.opacity = '0'
      container.style.cursor = ''
    }
    engine.onHover = (id, x, y) => {
      const tip = tipRef.current
      if (!tip) return
      if (!id) return hideTip()
      tip.textContent = names.get(id) ?? id
      tip.style.transform = `translate(${Math.round(x + 14)}px, ${Math.round(y + 16)}px)`
      tip.style.opacity = '1'
      const s = useAppStore.getState()
      container.style.cursor = s.pickTarget && s.pickable.includes(id) ? 'pointer' : ''
    }
    container.addEventListener('mouseleave', hideTip)

    let unsubscribe: (() => void) | null = null
    let cancelled = false

    // Map mode: independent of the region data. The store holds a mode id (mapLayer) and the
    // selected variable; modes come from variables.json. A variable without a map (sea level)
    // hides every layer. Plain ids and an index in; uniforms / visibility out.
    let unsubscribeLayer: (() => void) | null = null
    getVariables()
      .then((variables) => {
        if (cancelled || engine.isDestroyed()) return
        const modes = mapModes(variables)
        let current: MapMode | null = null
        const sync = (mapLayer: string | null, variable: string | null, frameIndex: number, force: boolean) => {
          const mode = resolveMapMode(modes, variables, mapLayer, variable)
          if (mode !== current) {
            current = mode
            engine.setMapMode(mode)
            force = true
          }
          if (force) engine.setFrame(frameIndex)
        }
        const s = useAppStore.getState()
        sync(s.mapLayer, s.variable, s.frameIndex, true)
        unsubscribeLayer = useAppStore.subscribe((state, prev) => {
          if (state.mapLayer !== prev.mapLayer || state.variable !== prev.variable || state.frameIndex !== prev.frameIndex) {
            sync(state.mapLayer, state.variable, state.frameIndex, state.frameIndex !== prev.frameIndex)
          }
        })
      })
      .catch((err: unknown) => console.error('Globe: failed to load variables.json', err))

    getRegionsData()
      .then((data) => {
        if (cancelled || engine.isDestroyed()) return
        engine.setData(data)
        for (const [id, r] of data.byId) names.set(id, r.name)

        const s = useAppStore.getState()
        engine.setHighlight(s.region, s.compareRegion)
        if (s.region && data.byId.has(s.region)) engine.flyToRegion(s.region, 0)
        else engine.flyToPole(s.pole, 0)

        unsubscribe = useAppStore.subscribe((state, prev) => {
          if (state.region !== prev.region || state.compareRegion !== prev.compareRegion) {
            engine.setHighlight(state.region, state.compareRegion)
          }
          if (state.region !== prev.region && state.region) engine.flyToRegion(state.region)
          if (state.pole !== prev.pole) engine.flyToPole(state.pole)
        })
      })
      .catch((err: unknown) => {
        // The base map still works without outlines; surface the problem in the console.
        console.error('Globe: failed to load regions', err)
      })

    return () => {
      cancelled = true
      container.removeEventListener('mouseleave', hideTip)
      unsubscribe?.()
      unsubscribeLayer?.()
      registerEngine(null)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  return (
    <>
      <div
        ref={containerRef}
        className="globe-root"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}
        aria-label="Interactive globe. Hover a region to see its name; while choosing a region, click one to select it."
        role="application"
      />
      <div
        ref={tipRef}
        aria-hidden
        className="glass-strong pointer-events-none absolute left-0 top-0 z-[5] whitespace-nowrap px-2 py-1 text-xs font-medium text-white opacity-0 transition-opacity duration-150"
      />
    </>
  )
}
