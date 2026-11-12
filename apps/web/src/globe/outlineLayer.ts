// Outline map mode (e.g. ice extent): the outline for the current time step drawn as a line,
// plus each region's EARLIEST outline as a faint dashed ghost for comparison.
// Owned by GlobeEngine; React and the store only pass a mode descriptor and a frame index.
//
// Load (once per mode): outlines file -> one Primitive per outline year (+ one ghost Primitive),
// all built at load. Scrub: toggles `primitive.show` only. A primitive-level `show` never
// touches the batch table, so no texture is created or uploaded while scrubbing
// (per-instance show attributes or a PolylineCollection would re-upload their batch textures).
import {
  ArcType,
  Cartesian3,
  Color,
  GeometryInstance,
  Material,
  Math as CesiumMath,
  PolylineGeometry,
  PolylineMaterialAppearance,
  Primitive,
  type Scene,
} from 'cesium'
import { LAYER_HEIGHT } from './dataLayer'
import { clampIndex } from './layerData'
import {
  getOutlines,
  ghostPaths,
  OUTLINE_STYLE,
  outlineSteps,
  yearOf,
  type OutlineMode,
  type OutlinePath,
  type OutlinesData,
} from './mapModes'
import type { LonLat } from './regions'

/** Above the region outlines (they top out at LAYER_HEIGHT + 2000 when selected). The thin
 *  dashed ghost sits ABOVE the thicker current line: outlines often differ by only a few
 *  pixels, and the ghost must stay visible where they overlap. */
const CURRENT_HEIGHT = LAYER_HEIGHT + 2600
const GHOST_HEIGHT = LAYER_HEIGHT + 3200

let outlineUpdates = 0
let shownYear: string | null = null

/** Debug counters for verification. */
export function outlineLayerStats() {
  return { outlineUpdates, shownYear }
}

interface LoadedOutlines {
  mode: OutlineMode
  data: OutlinesData
  byYear: Map<string, Primitive>
  ghost: Primitive | null
}

export class OutlineLayer {
  private readonly scene: Scene
  private modeId: string | null = null
  private loaded: LoadedOutlines | null = null
  private token = 0
  private frameIndex = 0
  private current: Primitive | null = null
  private destroyed = false

  constructor(scene: Scene) {
    this.scene = scene
  }

  setMode(mode: OutlineMode | null): void {
    if ((mode?.id ?? null) === this.modeId) return
    this.modeId = mode?.id ?? null
    const token = ++this.token
    this.dispose()
    this.scene.requestRender()
    if (mode) {
      this.load(mode, token).catch((err: unknown) => {
        if (token === this.token) console.error(`Globe: failed to load outlines for "${mode.id}"`, err)
      })
    }
  }

  setFrame(index: number): void {
    this.frameIndex = index
    this.apply()
  }

  needsRender(): boolean {
    const l = this.loaded
    if (!l) return false
    if (l.ghost && !l.ghost.ready) return true
    for (const p of l.byYear.values()) if (!p.ready) return true
    return false
  }

  destroy(): void {
    this.destroyed = true
    this.token++
    this.dispose()
  }

  private async load(mode: OutlineMode, token: number): Promise<void> {
    const data = await getOutlines(mode.outlines)
    if (token !== this.token || this.destroyed || this.scene.isDestroyed()) return

    const current = Color.fromCssColorString(OUTLINE_STYLE.current.css).withAlpha(OUTLINE_STYLE.current.alpha)
    const ghostColor = Color.fromCssColorString(OUTLINE_STYLE.ghost.css).withAlpha(OUTLINE_STYLE.ghost.alpha)
    const byYear = new Map<string, Primitive>()
    for (const year of data.years) {
      const primitive = linePrimitive(data.byYear.get(year) ?? [], CURRENT_HEIGHT, OUTLINE_STYLE.current.width, Material.fromType('Color', { color: current }))
      if (!primitive) continue
      primitive.show = false
      this.scene.primitives.add(primitive)
      byYear.set(year, primitive)
    }
    const ghost = linePrimitive(
      ghostPaths(data),
      GHOST_HEIGHT,
      OUTLINE_STYLE.ghost.width,
      Material.fromType('PolylineDash', {
        color: ghostColor,
        gapColor: Color.TRANSPARENT,
        dashLength: OUTLINE_STYLE.ghost.dashPx,
      }),
    )
    if (ghost) this.scene.primitives.add(ghost)
    this.loaded = { mode, data, byYear, ghost }
    this.apply()
  }

  /** Shows the outline of the current step's year. Toggles `show` only. */
  private apply(): void {
    const l = this.loaded
    if (!l || this.destroyed) return
    const steps = outlineSteps(l.mode, l.data)
    const i = Math.floor(clampIndex(this.frameIndex, steps.length))
    const step = steps[i]
    const year = step?.hasData ? yearOf(step.date) : null
    const next = year ? (l.byYear.get(year) ?? null) : null
    if (next !== this.current) {
      if (this.current) this.current.show = false
      if (next) next.show = true
      this.current = next
    }
    shownYear = next ? year : null
    outlineUpdates++
    this.scene.requestRender()
  }

  private dispose(): void {
    const l = this.loaded
    this.loaded = null
    this.current = null
    shownYear = null
    if (!l) return
    const all = [...l.byYear.values(), ...(l.ghost ? [l.ghost] : [])]
    for (const p of all) {
      if (!this.scene.isDestroyed()) this.scene.primitives.remove(p) // destroys it
      else if (!p.isDestroyed()) p.destroy()
    }
  }
}

function linePrimitive(paths: OutlinePath[], height: number, width: number, material: Material): Primitive | null {
  const instances = paths
    .filter((p) => p.path.length >= 2)
    .map(
      (p) =>
        new GeometryInstance({
          geometry: new PolylineGeometry({
            positions: toPositions(p.path, height),
            width,
            vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
            // Rhumb = straight in lon/lat, like the region outlines; fine steps keep chords above ground.
            arcType: ArcType.RHUMB,
            granularity: CesiumMath.toRadians(0.25),
          }),
        }),
    )
  if (instances.length === 0) return null
  return new Primitive({
    geometryInstances: instances,
    appearance: new PolylineMaterialAppearance({ material, translucent: true }),
    asynchronous: false,
    allowPicking: false, // picking uses point-in-polygon on regions.json outlines
  })
}

function toPositions(path: LonLat[], height: number): Cartesian3[] {
  const flat: number[] = []
  for (const [lon, lat] of path) flat.push(lon, lat, height)
  return Cartesian3.fromDegreesArrayHeights(flat)
}
