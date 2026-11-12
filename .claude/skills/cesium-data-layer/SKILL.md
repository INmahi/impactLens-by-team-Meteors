---
name: cesium-data-layer
description: How Trend Detective renders on the CesiumJS globe without Cesium ion - Viewer options, StrictMode-safe React lifecycle, NASA GIBS base map, the atlas-texture Fabric Material and GLSL colormap shader for gridded data, atlas UV maths, region outlines and picking, and render-on-demand. Use for any work in apps/web/src/globe/ or anything drawn on the globe.
---

# Cesium data layer

Full detail: [reference.md](reference.md). Shader source: [material.glsl](material.glsl). Viewer and lifecycle code: [viewer.md](viewer.md). Data format: the `data-contract` skill.

## Non-negotiable
1. **Never call Cesium ion.** No `Cesium.Ion.defaultAccessToken`, no `createWorldTerrain`, no `IonImageryProvider`. Viewer gets `baseLayer: false`, `baseLayerPicker: false`, `geocoder: false`. After any change, check the network tab: zero requests to `api.cesium.com`.
2. **Never keep Cesium objects in React state** (no `useState(viewer)`, no Zustand). Hold them in refs; React state holds plain ids and numbers only.
3. **Create the Viewer once** behind a ref guard and `destroy()` it in the effect cleanup. StrictMode runs effects twice in dev.
4. **Render on demand:** `requestRenderMode: true`, `maximumRenderTimeChange: Infinity`; call `viewer.scene.requestRender()` after every uniform, layer or entity change. Otherwise nothing redraws, and the glass blur costs GPU every frame.
5. **Scrubbing time changes uniforms only.** All frames live in atlases that are uploaded once. Never create a texture per frame.
6. **Data textures use NEAREST filtering** and are decoded with `createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })`. Linear filtering or colour conversion corrupts the packed bytes.

## Pipeline per gridded variable
1. Fetch `manifest.json`, `colormap.png` and the atlases (in a worker; decode to `ImageBitmap`).
2. One `Primitive` from a `RectangleGeometry` over `manifest.grid.bbox`, with `EllipsoidSurfaceAppearance({ aboveGround: false, flat: true })` and the Fabric material.
3. On time change: look up current and next frame in `manifest.frames`, compute their UV rects, set `fade`, `requestRender()`.
4. Frames in `manifest.missing` hide the layer (`opacity = 0`) and the time scroller draws the gap.

## Vite setup (pitfall 1)
Copy `node_modules/cesium/Build/Cesium/{Workers,ThirdParty,Assets,Widgets}` to `apps/web/public/cesium` (postinstall script) and set `define: { CESIUM_BASE_URL: JSON.stringify('/cesium') }` in `vite.config.ts`. Import `cesium/Build/Cesium/Widgets/widgets.css`. `public/cesium` is gitignored.

## Acceptance (M3/M4)
No `api.cesium.com` requests; both poles render without seam, pinch or hole; scrubbing the full record uploads no textures; no-data spans are drawn.
