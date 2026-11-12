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
import { getRegionsData } from './regions'

export default function Globe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<GlobeEngine | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container || engineRef.current) return
    const engine = new GlobeEngine(container)
    engineRef.current = engine
    registerEngine(engine)
    engine.onPick = (id) => useAppStore.getState().setRegion(id)

    let unsubscribe: (() => void) | null = null
    let cancelled = false

    getRegionsData()
      .then((data) => {
        if (cancelled || engine.isDestroyed()) return
        engine.setData(data)

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
      unsubscribe?.()
      registerEngine(null)
      engine.destroy()
      engineRef.current = null
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="globe-root"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000' }}
      aria-label="Interactive globe. Click an outlined region to select it."
      role="application"
    />
  )
}
