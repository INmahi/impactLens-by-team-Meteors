// Region data for the globe: everything comes from regions.json and regions.topo.json.
// Nothing here knows a region id, name, outline or camera (CLAUDE.md: regions are data).
// Pure lon/lat maths only; no Cesium objects.
import { feature } from 'topojson-client'
import type { GeometryCollection } from 'topojson-specification'
import type { Region } from '@trend/contract'
import { loadRegions, loadRegionsTopo } from '@/lib/data'
import type { Pole } from '@/state/store'

type Geometry = GeoJSON.Geometry

type LonLat = [number, number]
type Ring = LonLat[]
/** One polygon = outer ring + holes, in plain lon/lat (contract: CCW, MultiPolygons split at 180). */
type PolygonRings = Ring[]

export interface RegionShape {
  region: Region
  /** Polygons as given, for point-in-polygon picking in plain lon/lat. */
  polygons: PolygonRings[]
  /** Drawable outline paths: rings with the artificial edges (along the antimeridian or the pole) removed. */
  paths: LonLat[][]
  /** Nesting depth from `parent` (0 = top level). Deeper regions win when picking. */
  depth: number
  /** Planar bbox area in degrees squared, tie-breaker when picking. */
  bboxArea: number
}

export interface RegionsData {
  regions: Region[]
  byId: Map<string, Region>
  /** Regions that have an outline in regions.topo.json, in regions.json order. */
  shapes: RegionShape[]
}

export interface CameraView {
  lon: number
  lat: number
  height: number
  heading: number
  pitch: number
}

let cache: Promise<RegionsData> | null = null

/** Loads regions.json and regions.topo.json once per page. */
export function getRegionsData(): Promise<RegionsData> {
  if (!cache) {
    cache = Promise.all([loadRegions(), loadRegionsTopo()]).then(([regions, topo]) => buildRegionsData(regions, topo))
    cache.catch(() => {
      cache = null // allow a retry after a failed load
    })
  }
  return cache
}

function buildRegionsData(regions: Region[], topo: Awaited<ReturnType<typeof loadRegionsTopo>>): RegionsData {
  const byId = new Map(regions.map((r) => [r.id, r]))
  const object = topo.objects.regions as GeometryCollection | undefined
  const features: GeoJSON.Feature[] = object ? feature(topo, object).features : []
  const featureById = new Map(features.map((f) => [String(f.id), f]))

  const depthOf = (r: Region): number => {
    let d = 0
    let p = r.parent
    const seen = new Set<string>([r.id])
    while (p && byId.has(p) && !seen.has(p)) {
      seen.add(p)
      d++
      p = byId.get(p)!.parent
    }
    return d
  }

  const shapes: RegionShape[] = []
  for (const region of regions) {
    const f = featureById.get(region.id)
    if (!f) continue // e.g. a global region has no outline
    const polygons = toPolygons(f.geometry)
    if (polygons.length === 0) continue
    const [w, s, e, n] = region.bbox
    shapes.push({
      region,
      polygons,
      paths: polygons.flatMap((poly) => poly.flatMap(drawablePaths)),
      depth: depthOf(region),
      bboxArea: Math.max(0, e - w) * Math.max(0, n - s),
    })
  }
  return { regions, byId, shapes }
}

function toPolygons(g: Geometry | null): PolygonRings[] {
  if (!g) return []
  if (g.type === 'Polygon') return [g.coordinates as PolygonRings]
  if (g.type === 'MultiPolygon') return g.coordinates as PolygonRings[]
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(toPolygons)
  return []
}

const EPS = 1e-6
const atPole = (p: LonLat) => Math.abs(p[1]) >= 90 - EPS
const onAntimeridian = (p: LonLat) => Math.abs(p[0]) >= 180 - EPS

/**
 * An edge is artificial when it only exists because the ring is drawn in plain lon/lat:
 * along a pole (both ends at +-90) or down the antimeridian / across the 180 seam
 * (both ends at +-180). Drawing those gives a seam at 180 and a pinch at the pole.
 */
function isArtificial(a: LonLat, b: LonLat): boolean {
  return (atPole(a) && atPole(b)) || (onAntimeridian(a) && onAntimeridian(b))
}

/** Splits a closed ring into the runs of real edges. */
function drawablePaths(ring: Ring): LonLat[][] {
  const pts = ring.length > 1 && samePoint(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice()
  const n = pts.length
  if (n < 2) return []
  const edgeReal = (i: number) => !isArtificial(pts[i], pts[(i + 1) % n])
  let start = -1
  for (let i = 0; i < n; i++) {
    if (!edgeReal(i)) {
      start = i
      break
    }
  }
  if (start === -1) return [[...pts, pts[0]]] // fully real ring: draw it closed

  const paths: LonLat[][] = []
  let current: LonLat[] = []
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n
    if (edgeReal(i)) {
      if (current.length === 0) current.push(pts[i])
      current.push(pts[(i + 1) % n])
    } else if (current.length) {
      paths.push(current)
      current = []
    }
  }
  if (current.length) paths.push(current)
  return paths.filter((p) => p.length >= 2)
}

function samePoint(a: LonLat, b: LonLat): boolean {
  return Math.abs(a[0] - b[0]) < EPS && Math.abs(a[1] - b[1]) < EPS
}

/** Even-odd test in plain lon/lat; matches the contract's lon/lat polygons, poles included. */
function inPolygon(lon: number, lat: number, rings: PolygonRings): boolean {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}

/** The most specific region (deepest, then smallest) containing the point, or null. */
export function regionAt(data: RegionsData, lon: number, lat: number): string | null {
  let best: RegionShape | null = null
  for (const s of data.shapes) {
    if (!s.polygons.some((p) => inPolygon(lon, lat, p))) continue
    if (!best || s.depth > best.depth || (s.depth === best.depth && s.bboxArea < best.bboxArea)) best = s
  }
  return best ? best.region.id : null
}

/**
 * Top-level outlined regions whose bbox lies entirely in the hemisphere.
 * North: bbox south >= 0. South: bbox north <= 0.
 */
export function hemisphereRegions(data: RegionsData, pole: Pole): Region[] {
  return data.shapes
    .filter((s) => s.region.parent === null)
    .map((s) => s.region)
    .filter((r) => (pole === 'north' ? r.bbox[1] >= 0 : r.bbox[3] <= 0))
}

/**
 * Polar view derived from data:
 * - centred on the pole (0.001 degrees off it so heading is well defined),
 * - longitude = circular mean of the hemisphere regions' camera longitudes
 *   (north: that meridian points down the screen; south: up),
 * - cap radius = distance from the pole to the most equatorward bbox edge of those regions,
 *   height chosen so the cap fits the narrower field of view with a margin.
 */
export function polarView(data: RegionsData, pole: Pole, halfFovNarrow: number): CameraView {
  const regions = hemisphereRegions(data, pole)
  const sign = pole === 'north' ? 1 : -1
  let capDeg = 30
  let lon = 0
  if (regions.length) {
    capDeg = Math.max(...regions.map((r) => 90 - Math.abs(pole === 'north' ? r.bbox[1] : r.bbox[3])))
    let sx = 0
    let sy = 0
    for (const r of regions) {
      sx += Math.cos((r.camera.lon * Math.PI) / 180)
      sy += Math.sin((r.camera.lon * Math.PI) / 180)
    }
    lon = Math.hypot(sx, sy) > 1e-9 ? (Math.atan2(sy, sx) * 180) / Math.PI : 0
  }
  const R = 6_371_000
  const theta = (Math.min(Math.max(capDeg, 5), 80) * Math.PI) / 180
  const alpha = Math.max(halfFovNarrow * 0.88, 0.05)
  const height = R * (Math.sin(theta) / Math.tan(alpha) + Math.cos(theta) - 1)
  return { lon, lat: sign * 89.999, height, heading: 0, pitch: -90 }
}
