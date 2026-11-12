// Module singleton: the mounted Globe registers its engine here so controls placed anywhere
// in the layout can act on the camera without passing Cesium objects through React.
import type { Pole } from '@/state/store'
import type { GlobeEngine } from './engine'

let active: GlobeEngine | null = null

export function registerEngine(engine: GlobeEngine | null): void {
  active = engine
}

function engine(): GlobeEngine | null {
  return active && !active.isDestroyed() ? active : null
}

export function zoomIn(): void {
  engine()?.zoom(0.35)
}

export function zoomOut(): void {
  engine()?.zoom(-0.5)
}

/** Re-flies to a pole view even when the store's pole did not change. */
export function flyToPole(pole: Pole): void {
  engine()?.flyToPole(pole)
}

/** Re-flies to a region's camera preset even when the store's region did not change. */
export function flyToRegion(id: string): void {
  engine()?.flyToRegion(id)
}
