// Shared GLSL snippets: hashing, value noise, fbm, ACES and fog.

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

export const FOG_GLSL = /* glsl */ `
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogHeight;
vec3 applyFog(vec3 col, vec3 world, vec3 camPos, vec3 sunDir) {
  vec3 d = world - camPos;
  float dist = length(d);
  vec3 dir = d / max(dist, 0.001);
  // Exponential height fog, integrated along the view ray.
  float h0 = max(camPos.y, 0.0), k = uFogHeight;
  float dy = dir.y;
  float integ = abs(dy) > 0.001 ? (exp(-k * h0) - exp(-k * max(h0 + dy * dist, 0.0))) / (k * dy) : exp(-k * h0) * dist;
  float amount = 1.0 - exp(-uFogDensity * max(integ, 0.0));
  float sunAmt = pow(max(dot(dir, sunDir), 0.0), 8.0);
  vec3 fc = mix(uFogColor, uFogSunColor, sunAmt);
  return mix(col, fc, clamp(amount, 0.0, 1.0));
}
`;

export const ACES_GLSL = /* glsl */ `
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
`;
