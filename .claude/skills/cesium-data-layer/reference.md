# Cesium data layer reference

Source: `docs/TECH_BUILD_PLAN.md` sections 10 and 11. Check the installed `cesium` version (`pnpm --filter web list cesium`) and its changelog before using an API from memory; Cesium changes often.

## Viewer options
```ts
new Viewer(container, {
  baseLayer: false,            // we add GIBS ourselves; default would use ion
  baseLayerPicker: false,
  geocoder: false,             // geocoder uses ion
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,             // we build our own time scroller
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  scene3DOnly: true,
  requestRenderMode: true,
  maximumRenderTimeChange: Infinity,
  terrainProvider: new EllipsoidTerrainProvider(),   // no ion terrain
  contextOptions: { webgl: { alpha: false } },
});
viewer.scene.skyAtmosphere.show = true;
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.baseColor = Color.fromCssColorString('#0b0f17');
(viewer.cesiumWidget.creditContainer as HTMLElement).style.display = 'none'; // put credits in our own footer instead
```
Show GIBS and data source credits somewhere visible (footer or legend).

## Base map: NASA GIBS
```ts
const gibs = new WebMapTileServiceImageryProvider({
  url: 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/BlueMarble_ShadedRelief_Bathymetry/default/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpeg',
  layer: 'BlueMarble_ShadedRelief_Bathymetry',
  style: 'default',
  tileMatrixSetID: '500m',
  format: 'image/jpeg',
  tilingScheme: new GeographicTilingScheme(),
  maximumLevel: 8,
  credit: new Credit('NASA GIBS / Blue Marble'),
});
viewer.imageryLayers.addImageryProvider(gibs);
```
Static layer, no `{Time}`. If the tile URL 404s, check the GIBS capabilities document (`.../epsg4326/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities`) for the exact layer and TileMatrixSet names.

## Camera presets
From `regions.json` `camera`: `viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lon, lat, height), orientation: { heading: toRadians(heading), pitch: toRadians(pitch), roll: 0 }, duration: 1.5 })`. Pole toggle flies between the `greenland` and `antarctica` presets. Zoom buttons call `camera.zoomIn/zoomOut(camera.positionCartographic.height * 0.3)` then `requestRender()`.

## Atlas UV maths
Atlas size `W x H` pixels; frame rect `{ x, y, w, h }` in pixels, origin top-left (as in `manifest.frames`). WebGL texture v runs bottom-up, so:
```
u0 = x / W
u1 = (x + w) / W
v0 = 1 - (y + h) / H
v1 = 1 - y / H
rect = vec4(u0, v0, u1, v1)
```
In the shader, map the rectangle's `materialInput.st` (0..1 across the geometry, s west to east, t south to north) into the rect: `uv = mix(rect.xy, rect.zw, st)`. Sample at pixel centres to avoid bleeding between neighbouring frames: shrink the rect by half a pixel on each side (`u0 += 0.5/W`, `u1 -= 0.5/W`, same for v).

If current and next frames are in different atlas files, bind them as `atlasA` and `atlasB`; otherwise bind the same texture twice.

## Material uniforms
| Uniform | Type | Meaning |
|---|---|---|
| `atlasA`, `atlasB` | sampler2D (Texture, NEAREST, no mipmaps) | Atlas holding the current / next frame |
| `rectA`, `rectB` | vec4 | UV rects of current / next frame |
| `fade` | float | 0 = current, 1 = next |
| `colormap` | sampler2D (256x1, LINEAR is fine here) | |
| `scale`, `offset` | float | From `manifest.encoding` |
| `vmin`, `vmax` | float | From `manifest.valueRange` |
| `opacity` | float | Layer opacity |

Create the textures yourself (`new Texture({ context, source: imageBitmap, sampler: new Sampler({ minificationFilter: TextureMinificationFilter.NEAREST, magnificationFilter: TextureMagnificationFilter.NEAREST, wrapS: TextureWrap.CLAMP_TO_EDGE, wrapT: TextureWrap.CLAMP_TO_EDGE }), flipY: false })`), or pass image URLs to Fabric and set the sampler afterwards; check the installed version for the supported way. Keep `flipY` consistent with the v maths above (with `flipY: true`, use `v0 = 1 - (y+h)/H`; with `flipY: false`, use `v0 = y/H` and `v1 = (y+h)/H`). Test with a synthetic atlas that has a marked corner.

## Primitive
```ts
const primitive = new Primitive({
  geometryInstances: new GeometryInstance({
    geometry: new RectangleGeometry({
      rectangle: Rectangle.fromDegrees(west, south, east, north),
      vertexFormat: EllipsoidSurfaceAppearance.VERTEX_FORMAT,
      granularity: CesiumMath.toRadians(0.5),   // fine enough near the poles
    }),
  }),
  appearance: new EllipsoidSurfaceAppearance({ material, aboveGround: false, flat: true }),
  asynchronous: false,
});
viewer.scene.primitives.add(primitive);
```
Polar caps: a global rectangle with fine granularity covers both poles. If a seam or pinch appears at a pole, split into a polar-cap rectangle per hemisphere.

## Outlines and picking
- `topojson-client` `feature(topo, topo.objects.regions)` gives GeoJSON; load with `GeoJsonDataSource.load(geojson, { stroke, fill: Color.TRANSPARENT, clampToGround: false })`.
- Each entity's `properties.id` is the region id. On click: `const picked = viewer.scene.pick(position)`; read the id from `picked.id.properties`; push the id (not the entity) into app state; `viewer.flyTo(entity)` or the region's camera preset.
- Ice extent: draw the current year's outline and keep the earliest outline as a faint ghost.

## React lifecycle
See [viewer.md](viewer.md).

## Pitfalls
1. Cesium + Vite: copy static assets, define `CESIUM_BASE_URL`.
2. Cesium ion: called at startup if the options above are missing.
3. StrictMode double effects: guard creation, destroy in cleanup.
4. 16-bit PNGs are reduced to 8 bits by browsers: data is packed into R and G.
5. Linear filtering on packed data mixes bytes into garbage: NEAREST only.
11. Glass blur over WebGL costs GPU every frame the globe draws: render on demand keeps it idle.
