// GlobeEngine owns every Cesium object. One instance per mounted <Globe />, held in a ref
// (and registered in ./controller for the control buttons). React and Zustand only ever
// see plain ids and numbers.
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Credit,
  CustomDataSource,
  EllipsoidTerrainProvider,
  Entity,
  Math as CesiumMath,
  PerspectiveFrustum,
  PolylineDashMaterialProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Viewer,
  WebMapTileServiceImageryProvider,
} from 'cesium'
import type { Pole } from '@/state/store'
import { DataLayer, LAYER_HEIGHT } from './dataLayer'
import { GibsGeographicTilingScheme } from './gibsTilingScheme'
import { polarView, regionAt, type CameraView, type RegionsData } from './regions'

/** NASA GIBS, EPSG:4326 "best" endpoint, static Blue Marble (no {Time}). */
const GIBS_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg'
export const GIBS_CREDIT = 'Imagery: NASA GIBS, Blue Marble Shaded Relief and Bathymetry'

type Role = 'base' | 'hover' | 'compare' | 'selected'

/** Outline styles. Selected and compare differ in colour AND pattern (solid vs dashed).
 *  Heights sit above the data layer so outlines are never hidden under it. */
const STYLE: Record<Role, { color: Color; width: number; dashed: boolean; height: number }> = {
  base: { color: Color.WHITE.withAlpha(0.55), width: 1.5, dashed: false, height: LAYER_HEIGHT + 500 },
  hover: { color: Color.WHITE.withAlpha(0.95), width: 2.5, dashed: false, height: LAYER_HEIGHT + 1000 },
  compare: { color: Color.fromCssColorString('#f59e0b'), width: 3, dashed: true, height: LAYER_HEIGHT + 1500 },
  selected: { color: Color.fromCssColorString('#38bdf8'), width: 3.5, dashed: false, height: LAYER_HEIGHT + 2000 },
}

const FLY_SECONDS = 1.6

export class GlobeEngine {
  readonly viewer: Viewer
  private data: RegionsData | null = null
  private outlines = new CustomDataSource('region-outlines')
  private entitiesByRegion = new Map<string, Entity[]>()
  private roles = new Map<string, Role>()
  private selected: string | null = null
  private compare: string | null = null
  private hovered: string | null = null
  private handler: ScreenSpaceEventHandler
  private dataLayer: DataLayer
  private removePreUpdate: () => void
  onPick: ((regionId: string) => void) | null = null

  constructor(container: HTMLElement) {
    const viewer = new Viewer(container, {
      baseLayer: false, // the default base layer is Cesium ion imagery
      baseLayerPicker: false,
      geocoder: false, // geocoder uses ion
      terrainProvider: new EllipsoidTerrainProvider(), // no ion terrain
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      scene3DOnly: true,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      contextOptions: { webgl: { alpha: false } },
    })
    this.viewer = viewer
    const scene = viewer.scene
    scene.backgroundColor = Color.BLACK
    scene.globe.baseColor = Color.fromCssColorString('#0b0f17')
    scene.globe.enableLighting = false
    scene.globe.depthTestAgainstTerrain = false
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = true
    if (scene.moon) scene.moon.show = false
    if (scene.sun) scene.sun.show = false

    // Credits stay visible (GIBS attribution); give them a dark backing so they read over ice.
    const bottom = viewer.bottomContainer as HTMLElement
    Object.assign(bottom.style, {
      background: 'rgba(0, 0, 0, 0.55)',
      padding: '2px 8px',
      borderTopRightRadius: '8px',
    })

    viewer.imageryLayers.addImageryProvider(createGibsProvider())
    void viewer.dataSources.add(this.outlines)
    this.dataLayer = new DataLayer(scene)

    // Entity geometry is batched asynchronously. In request-render mode nobody asks for the
    // frame that shows the finished batch, so keep asking until the data sources are ready.
    // preUpdate fires every tick even when no frame is rendered.
    this.removePreUpdate = scene.preUpdate.addEventListener(() => {
      if (!viewer.dataSourceDisplay.ready || this.dataLayer.needsRender()) scene.requestRender()
    })

    this.handler = new ScreenSpaceEventHandler(scene.canvas)
    this.handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const id = this.regionAtScreen(e.position)
      if (id) this.onPick?.(id) // empty globe or space: do nothing (keeps the selection)
    }, ScreenSpaceEventType.LEFT_CLICK)
    this.handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      this.setHovered(this.regionAtScreen(e.endPosition))
    }, ScreenSpaceEventType.MOUSE_MOVE)

    scene.requestRender()
  }

  isDestroyed(): boolean {
    return this.viewer.isDestroyed()
  }

  destroy(): void {
    this.onPick = null
    this.removePreUpdate()
    if (!this.handler.isDestroyed()) this.handler.destroy()
    this.dataLayer.destroy() // before the viewer, while the GL context is alive
    if (!this.viewer.isDestroyed()) this.viewer.destroy()
  }

  /** Builds the outline entities from regions.topo.json. Call once data is loaded. */
  setData(data: RegionsData): void {
    this.data = data
    this.outlines.entities.removeAll()
    this.entitiesByRegion.clear()
    this.roles.clear()
    this.outlines.entities.suspendEvents()
    for (const shape of data.shapes) {
      const list: Entity[] = []
      shape.paths.forEach((path, i) => {
        list.push(
          this.outlines.entities.add({
            id: `region-outline:${shape.region.id}:${i}`,
            name: shape.region.name,
            polyline: {
              positions: toPositions(path, STYLE.base.height),
              width: STYLE.base.width,
              material: new ColorMaterialProperty(STYLE.base.color),
              // Rhumb edges = straight lines in lon/lat, the same space the polygons and
              // the point-in-polygon picking use. Fine granularity so chords stay above ground.
              arcType: ArcType.RHUMB,
              granularity: CesiumMath.toRadians(0.25),
            },
          }),
        )
      })
      this.entitiesByRegion.set(shape.region.id, list)
      this.roles.set(shape.region.id, 'base')
    }
    this.outlines.entities.resumeEvents()
    this.restyle()
  }

  /** Map layer by id (a variable's mapMode) or null for none. Loads once, then reuses. */
  setMapLayer(layer: string | null): void {
    this.dataLayer.setLayer(layer)
  }

  /** Index into the active layer's timeline (see layerData.layerTimeline). Uniforms only. */
  setFrame(index: number): void {
    this.dataLayer.setFrame(index)
  }

  setHighlight(selected: string | null, compare: string | null): void {
    this.selected = selected
    this.compare = compare
    this.restyle()
  }

  private setHovered(id: string | null): void {
    if (id === this.hovered) return
    this.hovered = id
    this.viewer.scene.canvas.style.cursor = id ? 'pointer' : ''
    this.restyle()
  }

  private restyle(): void {
    let changed = false
    for (const [id, entities] of this.entitiesByRegion) {
      const role: Role =
        id === this.selected ? 'selected' : id === this.compare ? 'compare' : id === this.hovered ? 'hover' : 'base'
      if (this.roles.get(id) === role) continue
      this.roles.set(id, role)
      changed = true
      const s = STYLE[role]
      const shape = this.data?.shapes.find((sh) => sh.region.id === id)
      entities.forEach((entity, i) => {
        const line = entity.polyline
        if (!line || !shape) return
        // Higher roles sit slightly higher so shared coastlines do not z-fight.
        line.positions = new ConstantProperty(toPositions(shape.paths[i], s.height))
        line.width = new ConstantProperty(s.width)
        line.material = s.dashed
          ? new PolylineDashMaterialProperty({ color: s.color, gapColor: Color.TRANSPARENT, dashLength: 14 })
          : new ColorMaterialProperty(s.color)
      })
    }
    if (changed) this.viewer.scene.requestRender()
  }

  private regionAtScreen(position: Cartesian2): string | null {
    if (!this.data) return null
    const scene = this.viewer.scene
    const hit = scene.camera.pickEllipsoid(position, scene.globe.ellipsoid)
    if (!hit) return null
    const c = Cartographic.fromCartesian(hit)
    return regionAt(this.data, CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude))
  }

  /** Flies to a region's `camera` from regions.json. Unknown ids are ignored. */
  flyToRegion(id: string, duration = FLY_SECONDS): void {
    const region = this.data?.byId.get(id)
    if (region) this.flyTo(region.camera, duration)
  }

  /** Flies to the polar view derived from the regions in that hemisphere. */
  flyToPole(pole: Pole, duration = FLY_SECONDS): void {
    if (this.data) this.flyTo(polarView(this.data, pole, this.halfFovNarrow()), duration)
  }

  /** factor > 0 zooms in, < 0 zooms out, as a fraction of the current height. */
  zoom(factor: number): void {
    const camera = this.viewer.camera
    const h = camera.positionCartographic.height
    if (factor > 0) camera.zoomIn(h * factor)
    else camera.zoomOut(h * -factor)
    this.viewer.scene.requestRender()
  }

  private flyTo(v: CameraView, duration: number): void {
    const destination = Cartesian3.fromDegrees(v.lon, v.lat, v.height)
    const orientation = {
      heading: CesiumMath.toRadians(v.heading),
      pitch: CesiumMath.toRadians(v.pitch),
      roll: 0,
    }
    const camera = this.viewer.camera
    if (duration <= 0) camera.setView({ destination, orientation })
    else camera.flyTo({ destination, orientation, duration })
    this.viewer.scene.requestRender()
  }

  /** Half of the narrower field-of-view angle, in radians. */
  private halfFovNarrow(): number {
    const f = this.viewer.camera.frustum
    if (f instanceof PerspectiveFrustum && f.fov !== undefined && f.aspectRatio) {
      const a = f.aspectRatio
      return Math.atan(Math.tan(f.fov / 2) * Math.min(a, 1 / a))
    }
    return CesiumMath.toRadians(25)
  }
}

/** Static GIBS base map. See gibsTilingScheme.ts for why the default scheme does not fit. */
function createGibsProvider(): WebMapTileServiceImageryProvider {
  return new WebMapTileServiceImageryProvider({
    url: GIBS_URL,
    layer: 'BlueMarble_ShadedRelief_Bathymetry',
    style: 'default',
    tileMatrixSetID: '500m',
    format: 'image/jpeg',
    tileWidth: 512,
    tileHeight: 512,
    tilingScheme: new GibsGeographicTilingScheme(),
    maximumLevel: 7, // the 500m TileMatrixSet has levels 0-7; level 8 returns HTTP 400
    credit: new Credit(GIBS_CREDIT, true),
  })
}

function toPositions(path: [number, number][], height: number): Cartesian3[] {
  const flat: number[] = []
  for (const [lon, lat] of path) flat.push(lon, lat, height)
  return Cartesian3.fromDegreesArrayHeights(flat)
}
