// Fabric material source for a packed-atlas data layer (shown for a 2-atlas layer).
// The app generates this per layer: apps/web/src/globe/dataLayerShader.ts (buildLayerShader(atlasCount)).
// Use as: new Material({ fabric: { type: 'TrendDataLayer', uniforms: {...}, source }, translucent: () => true })
//
// Packing (data-contract skill): R = high byte, G = low byte, B = valid mask (255 valid, 0 missing), A = 255.
// value = (R * 256 + G) * scale + offset
//
// Rules learned in M3c (Cesium 1.146):
// - One sampler uniform per atlas (atlas0..atlasN-1), bound ONCE at load. Cesium's Material destroys the
//   previously bound texture when a sampler uniform is reassigned, so never swap atlases between uniforms.
//   Current/next frame pick their atlas by a float index; GLSL ES 3.00 cannot index sampler arrays with a
//   uniform, hence the if-chain.
// - No half-pixel shrink of the rect (it shifts cells); clamp uv to the frame's outermost texel centres.
// - No emission: a flat appearance outputs diffuse + emission, which would drift from the legend colours.

uniform sampler2D atlas0;
uniform sampler2D atlas1;
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

vec4 sampleAtlas(float index, vec2 uv) {
  if (index < 0.5) return texture(atlas0, uv);
  return texture(atlas1, uv);
}

vec2 decodeFrame(float index, vec4 rect, vec4 bounds, vec2 st) {
  vec2 uv = clamp(mix(rect.xy, rect.zw, st), bounds.xy, bounds.zw);
  vec4 t = sampleAtlas(index, uv);
  float hi = floor(t.r * 255.0 + 0.5);
  float lo = floor(t.g * 255.0 + 0.5);
  float valid = step(0.5, t.b);
  return vec2((hi * 256.0 + lo) * scale + offset, valid);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  vec2 a = decodeFrame(indexA, rectA, boundsA, st);
  vec2 b = decodeFrame(indexB, rectB, boundsB, st);

  float bothValid = a.y * b.y;
  float value = mix(a.x, b.x, fade * bothValid + (1.0 - a.y) * b.y);
  float valid = max(a.y, b.y);

  float x = clamp((value - vmin) / (vmax - vmin), 0.0, 1.0);
  vec3 color = texture(colormap, vec2((floor(x * 255.0 + 0.5) + 0.5) / 256.0, 0.5)).rgb;

  material.diffuse = color;
  material.alpha = opacity * valid;
  return material;
}
