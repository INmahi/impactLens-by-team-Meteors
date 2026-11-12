// Fabric material source for a packed-atlas data layer.
// Use as: new Material({ fabric: { type: 'TrendDataLayer', uniforms: {...}, source: <this file> }, translucent: () => true })
//
// Packing (data-contract skill): R = high byte, G = low byte, B = valid mask (255 valid, 0 missing), A = 255.
// value = (R * 256 + G) * scale + offset

uniform sampler2D atlasA;
uniform sampler2D atlasB;
uniform vec4 rectA;      // (u0, v0, u1, v1) of the current frame in atlasA
uniform vec4 rectB;      // same for the next frame in atlasB
uniform float fade;      // 0 = current frame, 1 = next frame
uniform sampler2D colormap;  // 256x1
uniform float scale;
uniform float offset;
uniform float vmin;
uniform float vmax;
uniform float opacity;

// Returns (value, valid). Texture values are 0..1, so multiply by 255 and round.
vec2 decodeTexel(sampler2D atlas, vec4 rect, vec2 st) {
  vec2 uv = mix(rect.xy, rect.zw, st);
  vec4 t = texture(atlas, uv);
  float hi = floor(t.r * 255.0 + 0.5);
  float lo = floor(t.g * 255.0 + 0.5);
  float valid = step(0.5, t.b);
  return vec2((hi * 256.0 + lo) * scale + offset, valid);
}

czm_material czm_getMaterial(czm_materialInput materialInput) {
  czm_material material = czm_getDefaultMaterial(materialInput);
  vec2 st = materialInput.st;

  vec2 a = decodeTexel(atlasA, rectA, st);
  vec2 b = decodeTexel(atlasB, rectB, st);

  // Cross-fade only where both frames are valid; otherwise show whichever is valid.
  float bothValid = a.y * b.y;
  float value = mix(a.x, b.x, fade * bothValid + (1.0 - a.y) * b.y);
  float valid = max(a.y, b.y);

  float x = clamp((value - vmin) / (vmax - vmin), 0.0, 1.0);
  // Sample the centre of the colormap texel row.
  vec3 color = texture(colormap, vec2(x * (255.0 / 256.0) + 0.5 / 256.0, 0.5)).rgb;

  material.diffuse = color;
  material.emission = color * 0.25;  // keep colours readable on the dark side of the globe
  material.alpha = opacity * valid;
  return material;
}
