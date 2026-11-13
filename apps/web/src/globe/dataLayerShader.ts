// Fabric material source for a packed-atlas data layer, generated for the layer's atlas count.
// Based on .claude/skills/cesium-data-layer/material.glsl, with three changes:
//
// 1. Atlas selection by index. Each atlas is its own sampler uniform (atlas0..atlasN-1),
//    bound once at load. Cesium's Material destroys the previous texture when a sampler
//    uniform is reassigned, so swapping atlasA/atlasB between atlases would destroy them;
//    instead the current and next frame pick their atlas with `indexA` / `indexB` (floats).
//    GLSL ES 3.00 cannot index a sampler array with a uniform, hence the if-chain.
// 2. Exact cell mapping. `st` maps linearly onto the frame rect (no half-pixel shrink, which
//    would shift cells by up to half a cell); the result is clamped to the frame's outermost
//    texel centres (`boundsA` / `boundsB`) so st = 1 never reads the neighbouring frame.
// 3. No emission. With a flat appearance the output is diffuse + emission, so emission would
//    brighten the colours away from the legend; diffuse alone equals the colormap colour.
//
// Packing (data-contract): R = high byte, G = low byte, B = valid mask (255 valid), A = 255.
// value = (R * 256 + G) * scale + offset

export function buildLayerShader(atlasCount: number): string {
  if (atlasCount < 1) throw new Error('data layer needs at least one atlas')
  const samplers = Array.from({ length: atlasCount }, (_, i) => `uniform sampler2D atlas${i};`).join('\n')
  const branches = Array.from({ length: atlasCount - 1 }, (_, i) => `  if (index < ${i}.5) return texture(atlas${i}, uv);`)
  branches.push(`  return texture(atlas${atlasCount - 1}, uv);`)

  return `${samplers}
uniform sampler2D colormap;  // 256x1, left = vmin, right = vmax
uniform vec4 rectA;          // (u west, v south, u east, v north) of the current frame
uniform vec4 rectB;          // same for the next frame
uniform vec4 boundsA;        // (min u, min v, max u, max v): outermost texel centres of the frame
uniform vec4 boundsB;
uniform float indexA;        // atlas holding the current frame
uniform float indexB;        // atlas holding the next frame
uniform float fade;          // 0 = current frame, 1 = next frame
uniform float scale;
uniform float offset;
uniform float vmin;
uniform float vmax;
uniform float opacity;
uniform float fadeNearZero;  // 1 = values near 0 fade to transparent (manifest fadeNearZero)

vec4 sampleAtlas(float index, vec2 uv) {
${branches.join('\n')}
}

// One texel: (value, valid). Texture values are 0..1, so multiply by 255 and round. Always sampled at a texel
// centre with NEAREST filtering: packed bytes must never be interpolated by the GPU.
vec2 decodeTexel(float index, vec2 uv) {
  vec4 t = sampleAtlas(index, uv);
  float hi = floor(t.r * 255.0 + 0.5);
  float lo = floor(t.g * 255.0 + 0.5);
  return vec2((hi * 256.0 + lo) * scale + offset, step(0.5, t.b));
}

// Smooth display: decode the 4 surrounding texels and blend them bilinearly, using only valid ones (gaps and
// coasts are not smeared). Display only: the data, legend and statistics are unchanged.
// Returns (value, valid).
vec2 decodeFrame(float index, vec4 rect, vec4 bounds, vec2 st) {
  vec2 uv = mix(rect.xy, rect.zw, st);
  vec2 texel = 2.0 * abs(bounds.xy - rect.xy);          // bounds are inset by half a texel
  vec2 f = (uv - bounds.xy) / max(texel, vec2(1e-9));
  vec2 i0 = floor(f);
  vec2 w = clamp(f - i0, 0.0, 1.0);
  vec2 p0 = clamp(bounds.xy + i0 * texel, bounds.xy, bounds.zw);
  vec2 p1 = clamp(bounds.xy + (i0 + 1.0) * texel, bounds.xy, bounds.zw);
  vec2 s00 = decodeTexel(index, p0);
  vec2 s10 = decodeTexel(index, vec2(p1.x, p0.y));
  vec2 s01 = decodeTexel(index, vec2(p0.x, p1.y));
  vec2 s11 = decodeTexel(index, p1);
  float w00 = (1.0 - w.x) * (1.0 - w.y) * s00.y;
  float w10 = w.x * (1.0 - w.y) * s10.y;
  float w01 = (1.0 - w.x) * w.y * s01.y;
  float w11 = w.x * w.y * s11.y;
  float ws = w00 + w10 + w01 + w11;
  float value = (w00 * s00.x + w10 * s10.x + w01 * s01.x + w11 * s11.x) / max(ws, 1e-6);
  // Valid where at least about half of the surrounding weight is valid: crisp, slightly rounded edges.
  return vec2(value, step(0.45, ws));
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  vec2 a = decodeFrame(indexA, rectA, boundsA, st);
  vec2 b = decodeFrame(indexB, rectB, boundsB, st);

  // Cross-fade only where both frames are valid; otherwise show whichever is valid.
  float bothValid = a.y * b.y;
  float value = mix(a.x, b.x, fade * bothValid + (1.0 - a.y) * b.y);
  float valid = max(a.y, b.y);

  float x = clamp((value - vmin) / (vmax - vmin), 0.0, 1.0);
  // Centre of colormap texel round(x * 255): the same 256 colours the legend shows.
  vec3 color = texture(colormap, vec2((floor(x * 255.0 + 0.5) + 0.5) / 256.0, 0.5)).rgb;

  material.diffuse = color;
  // Layers that ask for it (manifest fadeNearZero, e.g. the GRACE mass map): values near 0 fade to
  // transparent, so only real change is coloured and quiet land shows the base map (no white sheet over
  // every continent). Full colour from 15% of the half-range; transparent below 3%. The legend says so.
  float centre = 0.5 * (vmin + vmax);
  float halfRange = max(0.5 * (vmax - vmin), 1e-6);
  float strength = mix(1.0, smoothstep(0.03, 0.15, abs(value - centre) / halfRange), fadeNearZero);
  material.alpha = opacity * valid * strength;
  return material;
}
`
}
