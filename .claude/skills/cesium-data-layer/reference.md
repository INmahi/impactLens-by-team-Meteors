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
From `regions.json` `camera`: `viewer.camera.flyTo({ destination: Cartesian3.fromDegrees(lon, lat, height), orientation: { heading: toRadians(heading), pitch: toRadians(pitch), roll: 0 }, duration: 1.5 })`. Pole toggle flies to a polar view derived from data (`polarView()` in `globe/regions.ts`: top-level outlined regions in that hemisphere), never hard-coded ids. Zoom buttons call `camera.zoomIn/zoomOut(camera.positionCartographic.height * 0.3)` then `requestRender()`.

## Atlas UV maths
Atlas size `W x H` pixels; frame rect `{ x, y, w, h }` in pixels, origin top-left (as in `manifest.frames`). WebGL texture v runs bottom-up, so:
```
u0 = x / W
u1 = (x + w) / W
v0 = 1 - (y + h) / H
v1 = 1 - y / H
rect = vec4(u0, v0, u1, v1)
```
In the shader, map the rectangle's `materialInput.st` (0..1 across the geometry, s west to east, t south to north) into the rect: `uv = mix(rect.xy, rect.zw, st)`. Do not shrink the rect by half a pixel (it shifts cells by up to half a cell). Instead clamp `uv` to the frame's outermost texel centres (`bounds` uniform) so `st = 1` never reads the neighbouring frame.

Each atlas gets its own sampler uniform (`atlas0..atlasN-1`), bound once at load; current and next frame select theirs with `indexA`/`indexB`. Never reassign a sampler uniform to another atlas: Cesium 1.146's Material destroys the previously bound texture. Max atlases per layer is limited by texture units (the app refuses above 15).

## Material uniforms
| Uniform | Type | Meaning |
|---|---|---|
| `atlas0..atlasN-1` | sampler2D (Texture, NEAREST, no mipmaps) | One per atlas file, bound once |
| `indexA`, `indexB` | float | Atlas index of current / next frame |
| `rectA`, `rectB` | vec4 | UV rects of current / next frame |
| `boundsA`, `boundsB` | vec4 | Outermost texel centres of each frame (uv clamp) |
| `fade` | float | 0 = current, 1 = next |
| `colormap` | sampler2D (256x1) | Sample texel centre `round(x*255)` so map matches legend |
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
Polar caps: a rectangle that reaches exactly ±90° makes Cesium collapse the pole row into one vertex, twisting the innermost cells into a spiral. Stop the geometry 1e-7° short of each pole (as `globe/dataLayer.ts` does); the shader still maps the full grid.

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

## Time-stepped geometry (M4)
To show or hide geometry per time step (for example dated ice-extent outlines), build one Primitive per step once and toggle its `show`. Toggling polylines or per-instance attributes re-uploads a small Cesium batch-table texture on every change, which breaks the "no uploads while scrubbing" rule. See `apps/web/src/globe/outlineLayer.ts`.

## Map modes (M4)
Modes come from `variables.json`: gridded layers are the distinct `mapMode` values; outline layers are variables with `outlines`. `store.mapLayer` holds the mode id; `frameIndex` indexes that mode's timeline (frames plus missing dates; outline modes step monthly over the variable's period, showing that year's outline). A variable with neither `mapMode` nor `outlines` (sea level) hides all layers. Pole views use ice region kinds only (`POLAR_KINDS` in `globe/regions.ts`), so coastal seas never change them.
