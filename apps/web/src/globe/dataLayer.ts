// The gridded data layer: one Primitive over the manifest's bbox with the atlas material.
// Owned by GlobeEngine; React and the store only pass a layer id and a frame index.
//
// Load (once per layer): manifest -> colormap + every atlas decoded in a worker -> one
// NEAREST texture per image -> one Primitive. Scrub: uniforms only (rects, atlas index,
// fade, opacity) + requestRender. Nothing is uploaded after load; `dataLayerStats()` counts.
import {
  Cartesian4,
  EllipsoidSurfaceAppearance,
  GeometryInstance,
  Material,
  Math as CesiumMath,
  Primitive,
  Rectangle,
  RectangleGeometry,
  TextureMagnificationFilter,
  TextureMinificationFilter,
  type Scene,
} from 'cesium'
import type { Frame, Manifest } from '@trend/contract'
import { buildLayerShader } from './dataLayerShader'
import { decodeImage } from './decodeImage'
import { atlasUrl, clampIndex, colormapUrl, getManifest, layerTimeline, type TimelineStep } from './layerData'

// --- Cesium renderer classes that are exported at runtime but not in Cesium.d.ts ----------
interface CesiumTexture {
  readonly width: number
  readonly height: number
  isDestroyed(): boolean
  destroy(): void
}
interface PrivateRenderer {
  Texture: new (options: {
    context: unknown
    source: ImageBitmap
    sampler: unknown
    flipY: boolean
    skipColorSpaceConversion: boolean
  }) => CesiumTexture
  Sampler: new (options: { minificationFilter: number; magnificationFilter: number; wrapS: number; wrapT: number }) => unknown
  TextureWrap: { CLAMP_TO_EDGE: number }
  ContextLimits: { maximumTextureSize: number; maximumTextureImageUnits: number }
}
// Named imports keep tree-shaking (a namespace import pulled in all of Cesium, +0.8 MB).
// @ts-expect-error -- runtime export of cesium 1.146, not declared in Cesium.d.ts
import { Texture as TextureClass } from 'cesium'
// @ts-expect-error -- runtime export, not declared
import { Sampler as SamplerClass } from 'cesium'
// @ts-expect-error -- runtime export, not declared
import { TextureWrap as TextureWrapEnum } from 'cesium'
// @ts-expect-error -- runtime export, not declared
import { ContextLimits as ContextLimitsObject } from 'cesium'
const R: PrivateRenderer = {
  Texture: TextureClass,
  Sampler: SamplerClass,
  TextureWrap: TextureWrapEnum,
  ContextLimits: ContextLimitsObject,
}

/** Layer opacity where data is valid; the base map shows faintly through. */
export const LAYER_OPACITY = 0.85
/** Metres above the ellipsoid: clears the globe's tile chords so the layer never z-fights. */
export const LAYER_HEIGHT = 3000
/** Geometry granularity. Fine enough that the polar caps close without a pinch. */
const GRANULARITY_DEG = 0.5
/**
 * Keep the geometry this far from an exact pole. At exactly +-90 Cesium's RectangleGeometry
 * collapses the pole row into ONE cap vertex with st.s = 0, so every fan triangle interpolates
 * s from 0 to its ring value and the innermost cells twist into a spiral. 1e-7 deg (about
 * 1 cm) keeps one vertex per longitude; the hole it leaves is far below a pixel.
 */
const POLE_EPSILON_DEG = 1e-7

let textureUploads = 0
let uniformUpdates = 0
let visible = false

/** Debug counters for verification: textures created, frame updates applied, layer drawn or hidden. */
export function dataLayerStats() {
  return { textureUploads, uniformUpdates, visible }
}

interface LoadedLayer {
  layer: string
  manifest: Manifest
  timeline: TimelineStep[]
  primitive: Primitive
  material: Material
  textures: CesiumTexture[]
}

export class DataLayer {
  private readonly scene: Scene
  private layer: string | null = null
  private loaded: LoadedLayer | null = null
  private token = 0
  private frameIndex = 0
  private destroyed = false

  constructor(scene: Scene) {
    this.scene = scene
  }

  /** Shows a layer by id (a variable's mapMode), or removes the layer for null. */
  setLayer(layer: string | null): void {
    if (layer === this.layer) return
    this.layer = layer
    const token = ++this.token
    this.disposeLoaded()
    this.scene.requestRender()
    if (layer) {
      this.load(layer, token).catch((err: unknown) => {
        if (token === this.token) console.error(`Globe: failed to load map layer "${layer}"`, err)
      })
    }
  }

  /** Index into the layer timeline (frames + missing dates). A fraction cross-fades to the next step. */
  setFrame(index: number): void {
    this.frameIndex = index
    this.apply()
  }

  /** True while the primitive is still being built (asynchronous geometry). */
  needsRender(): boolean {
    return !!this.loaded && !this.loaded.primitive.ready
  }

  destroy(): void {
    this.destroyed = true
    this.token++
    this.disposeLoaded()
  }

  private async load(layer: string, token: number): Promise<void> {
    const manifest = await getManifest(layer)
    if (token !== this.token || this.destroyed) return

    const limits = R.ContextLimits
    const units = manifest.atlases.length + 1 // + colormap
    if (units > limits.maximumTextureImageUnits) {
      throw new Error(`${manifest.atlases.length} atlases need ${units} texture units; this GPU has ${limits.maximumTextureImageUnits}`)
    }
    for (const a of manifest.atlases) {
      if (a.width > limits.maximumTextureSize || a.height > limits.maximumTextureSize) {
        throw new Error(`${a.file} is ${a.width}x${a.height}; this GPU allows ${limits.maximumTextureSize}`)
      }
    }

    const urls = [colormapUrl(layer), ...manifest.atlases.map((a) => atlasUrl(layer, a.file))]
    const settled = await Promise.allSettled(urls.map((u) => decodeImage(u)))
    const bitmaps = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []))
    const closeAll = () => bitmaps.forEach((b) => b.close())
    const failed = settled.find((s) => s.status === 'rejected')
    if (failed) {
      closeAll()
      throw failed.reason
    }
    if (token !== this.token || this.destroyed || this.scene.isDestroyed()) {
      closeAll()
      return
    }
    const atlasBitmaps = bitmaps.slice(1) // bitmaps[0] is the colormap
    atlasBitmaps.forEach((b, i) => {
      const a = manifest.atlases[i]
      if (b.width !== a.width || b.height !== a.height) {
        closeAll()
        throw new Error(`${a.file} is ${b.width}x${b.height}, manifest says ${a.width}x${a.height}`)
      }
    })

    // Upload once: one texture per image, NEAREST, no flip (image row 0 = texture v 0).
    const context = (this.scene as unknown as { context: unknown }).context
    const sampler = new R.Sampler({
      minificationFilter: TextureMinificationFilter.NEAREST,
      magnificationFilter: TextureMagnificationFilter.NEAREST,
      wrapS: R.TextureWrap.CLAMP_TO_EDGE,
      wrapT: R.TextureWrap.CLAMP_TO_EDGE,
    })
    const textures = bitmaps.map((source) => {
      textureUploads++
      return new R.Texture({ context, source, sampler, flipY: false, skipColorSpaceConversion: true })
    })
    closeAll() // the GPU has the pixels now; free the decoded copies

    const uniforms: Record<string, unknown> = {
      colormap: Material.DefaultImageId,
      rectA: new Cartesian4(),
      rectB: new Cartesian4(),
      boundsA: new Cartesian4(),
      boundsB: new Cartesian4(),
      indexA: 0,
      indexB: 0,
      fade: 0,
      scale: manifest.encoding.scale,
      offset: manifest.encoding.offset,
      vmin: manifest.valueRange[0],
      vmax: manifest.valueRange[1],
      fadeNearZero: manifest.fadeNearZero ? 1 : 0,
      opacity: 0,
    }
    manifest.atlases.forEach((_, i) => (uniforms[`atlas${i}`] = Material.DefaultImageId))
    const material = new Material({
      fabric: { uniforms, source: buildLayerShader(manifest.atlases.length) },
      translucent: true,
    })
    // Bound once and never reassigned (reassigning a sampler makes Material destroy the old texture).
    material.uniforms.colormap = textures[0]
    textures.slice(1).forEach((t, i) => (material.uniforms[`atlas${i}`] = t))

    const [west, south, east, north] = manifest.grid.bbox
    const primitive = new Primitive({
      geometryInstances: new GeometryInstance({
        geometry: new RectangleGeometry({
          rectangle: Rectangle.fromDegrees(
            west,
            Math.max(south, -90 + POLE_EPSILON_DEG),
            east,
            Math.min(north, 90 - POLE_EPSILON_DEG),
          ),
          vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
          granularity: CesiumMath.toRadians(GRANULARITY_DEG),
          height: LAYER_HEIGHT,
        }),
      }),
      appearance: new EllipsoidSurfaceAppearance({ material, aboveGround: false, flat: true }),
      asynchronous: true,
      show: false,
    })
    this.scene.primitives.add(primitive)
    this.loaded = { layer, manifest, timeline: layerTimeline(manifest), primitive, material, textures }
    this.apply()
  }

  /** Pushes the current frame index into the uniforms. Never creates or uploads anything. */
  private apply(): void {
    const l = this.loaded
    if (!l || this.destroyed) return
    const steps = l.timeline
    const i = clampIndex(this.frameIndex, steps.length)
    const i0 = Math.floor(i)
    const current = steps[i0]?.frame ?? null
    const u = l.material.uniforms

    if (!current) {
      // A date in manifest.missing (or an empty layer): hide the layer.
      u.opacity = 0
      l.primitive.show = false
      visible = false
    } else {
      const nextStep = steps[i0 + 1]
      const frac = i - i0
      const next = frac > 0 && nextStep?.frame ? nextStep.frame : current
      this.setFrameUniforms(l.manifest, current, 'A')
      this.setFrameUniforms(l.manifest, next, 'B')
      u.fade = next === current ? 0 : frac
      u.opacity = LAYER_OPACITY
      l.primitive.show = true
      visible = true
    }
    uniformUpdates++
    this.scene.requestRender()
  }

  private setFrameUniforms(manifest: Manifest, frame: Frame, slot: 'A' | 'B'): void {
    const atlas = manifest.atlases[frame.atlas]
    if (!atlas) throw new Error(`frame ${frame.date} points at missing atlas ${frame.atlas}`)
    const W = atlas.width
    const H = atlas.height
    // flipY false: image row y sits at v = y / H, so the north edge (row 0) has the smaller v.
    // st.t runs south (0) to north (1), so rect = (u west, v south, u east, v north).
    const uWest = frame.x / W
    const uEast = (frame.x + frame.w) / W
    const vNorth = frame.y / H
    const vSouth = (frame.y + frame.h) / H
    const u = this.loaded!.material.uniforms
    u[`rect${slot}`] = new Cartesian4(uWest, vSouth, uEast, vNorth)
    u[`bounds${slot}`] = new Cartesian4(uWest + 0.5 / W, vNorth + 0.5 / H, uEast - 0.5 / W, vSouth - 0.5 / H)
    u[`index${slot}`] = frame.atlas
  }

  private disposeLoaded(): void {
    const l = this.loaded
    this.loaded = null
    visible = false
    if (!l) return
    if (!this.scene.isDestroyed()) this.scene.primitives.remove(l.primitive) // destroys the primitive
    else if (!l.primitive.isDestroyed()) l.primitive.destroy()
    // Material.destroy also destroys the textures bound to it; destroy any it never bound.
    if (!l.material.isDestroyed()) l.material.destroy()
    for (const t of l.textures) if (!t.isDestroyed()) t.destroy()
  }
}
