// Tiling scheme for NASA GIBS EPSG:4326 tile matrix sets.
//
// GIBS geographic tiles do not follow Cesium's default 2x1 / 180-degree grid. In every
// EPSG:4326 set the level-0 matrix is 2x1 tiles of 512 px at 0.5625 deg/px, so one tile
// spans 288 degrees, and the grid overhangs the world to the east and south (the overhang is
// padding). Each level halves the tile span: 288, 144, 72, 36, 18 ... degrees, with
// ceil(360 / span) x ceil(180 / span) tiles (2x1, 3x2, 5x3, 10x5, 20x10 ...), matching
// MatrixWidth/MatrixHeight in the GetCapabilities document.
//
// `rectangle` stays the real world so Cesium's bounds maths never sees a wrapped rectangle;
// tileXYToRectangle returns the true (overhanging) tile so texture coordinates are exact.
// Cesium's base-layer path clips each imagery tile to the world with simpleIntersection.
import { Cartesian2, Cartographic, GeographicTilingScheme, Math as CesiumMath, Rectangle } from 'cesium'

const LEVEL0_TILE_DEG = 288

export class GibsGeographicTilingScheme extends GeographicTilingScheme {
  constructor() {
    super({ numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 })
  }

  private static tileDeg(level: number): number {
    return LEVEL0_TILE_DEG / 2 ** level
  }

  override getNumberOfXTilesAtLevel(level: number): number {
    // Only used by Cesium to derive level-0 texel spacing (world width / (tileWidth * n)).
    // 360 / 288 = 1.25 makes that come out at the true 0.5625 deg/px.
    if (level === 0) return 360 / LEVEL0_TILE_DEG
    return Math.ceil(360 / GibsGeographicTilingScheme.tileDeg(level))
  }

  override getNumberOfYTilesAtLevel(level: number): number {
    return Math.ceil(180 / GibsGeographicTilingScheme.tileDeg(level))
  }

  override tileXYToRectangle(x: number, y: number, level: number, result?: Rectangle): Rectangle {
    const d = GibsGeographicTilingScheme.tileDeg(level)
    const west = CesiumMath.toRadians(-180 + x * d)
    const east = CesiumMath.toRadians(-180 + (x + 1) * d)
    const north = CesiumMath.toRadians(90 - y * d)
    const south = CesiumMath.toRadians(90 - (y + 1) * d)
    if (!result) return new Rectangle(west, south, east, north)
    result.west = west
    result.south = south
    result.east = east
    result.north = north
    return result
  }

  override tileXYToNativeRectangle(x: number, y: number, level: number, result?: Rectangle): Rectangle {
    const r = this.tileXYToRectangle(x, y, level, result)
    r.west = CesiumMath.toDegrees(r.west)
    r.south = CesiumMath.toDegrees(r.south)
    r.east = CesiumMath.toDegrees(r.east)
    r.north = CesiumMath.toDegrees(r.north)
    return r
  }

  override positionToTileXY(position: Cartographic, level: number, result?: Cartesian2): Cartesian2 {
    const d = GibsGeographicTilingScheme.tileDeg(level)
    const lon = CesiumMath.toDegrees(position.longitude)
    const lat = CesiumMath.toDegrees(position.latitude)
    const maxX = Math.ceil(360 / d) - 1
    const maxY = this.getNumberOfYTilesAtLevel(level) - 1
    const x = Math.min(maxX, Math.max(0, Math.floor((lon + 180) / d)))
    const y = Math.min(maxY, Math.max(0, Math.floor((90 - lat) / d)))
    if (!result) return new Cartesian2(x, y)
    result.x = x
    result.y = y
    return result
  }
}
