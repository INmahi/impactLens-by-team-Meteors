---
name: cesium-material-texture-gotchas
description: Cesium 1.146 Material destroys a texture when its sampler uniform is reassigned (so never swap atlases between uniforms); Texture/Sampler/ContextLimits are untyped runtime exports; `import * as Cesium` adds ~0.8 MB
metadata:
  type: feedback
---

Do not swap Texture objects between sampler uniforms of a Cesium `Material` (as the cesium-data-layer skill's reference.md suggests with `atlasA`/`atlasB`). In 1.146, `createTexture2DUpdateFunction` destroys the previously bound texture when a sampler uniform gets a different `Texture`. Bind each atlas once to its own uniform (`atlas0..N`) and pick with a float index in an if-chain (GLSL ES 3.00 cannot index sampler arrays with a uniform). A Texture cannot be passed in the fabric uniforms directly (type detection fails); construct with `Material.DefaultImageId`, then assign.

`Texture`, `Sampler`, `TextureWrap`, `ContextLimits` are exported at runtime but missing from Cesium.d.ts: import each by name with `// @ts-expect-error`. `import * as Cesium from 'cesium'` defeated tree-shaking (+0.8 MB bundle).

With `EllipsoidSurfaceAppearance({ flat: true })` the output is `diffuse + emission`; the skill's `emission = color * 0.25` brightens colours away from the legend, so leave emission at 0.

**Why:** found 2026-11-12 in M3c while building `globe/dataLayer.ts`; verified 0 texture uploads over full scrubs.

**How to apply:** any new gridded or image layer (M4 map modes). Re-check `Material.js` when upgrading cesium. Related: [[globe-verification-workflow]].
