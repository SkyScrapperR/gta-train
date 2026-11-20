// Animated sea: vertex waves, fresnel sky reflection, sun glints, light reflections and shoreline foam.
import { NOISE_GLSL, FOG_GLSL } from './common.js';
import { MAX_LIGHTS } from './lit.js';

export const WATER_VS = /* glsl */ `
in vec3 a_pos;
uniform mat4 uViewProj; uniform float uTime;
out vec3 vWorld; out vec3 vN;
float wave(vec2 p, vec2 d, float f, float s, float a) { return a * sin(dot(p, d) * f + uTime * s); }
void main() {
  vec3 p = a_pos;
  vec2 q = p.xz;
  float h = wave(q, normalize(vec2(1.0, 0.6)), 0.08, 1.1, 0.35) + wave(q, normalize(vec2(-0.4, 1.0)), 0.13, 1.6, 0.18) + wave(q, normalize(vec2(0.8, -0.7)), 0.31, 2.4, 0.06);
  float e = 0.5;
  float hx = wave(q + vec2(e, 0), normalize(vec2(1.0, 0.6)), 0.08, 1.1, 0.35) + wave(q + vec2(e, 0), normalize(vec2(-0.4, 1.0)), 0.13, 1.6, 0.18) + wave(q + vec2(e, 0), normalize(vec2(0.8, -0.7)), 0.31, 2.4, 0.06);
  float hz = wave(q + vec2(0, e), normalize(vec2(1.0, 0.6)), 0.08, 1.1, 0.35) + wave(q + vec2(0, e), normalize(vec2(-0.4, 1.0)), 0.13, 1.6, 0.18) + wave(q + vec2(0, e), normalize(vec2(0.8, -0.7)), 0.31, 2.4, 0.06);
  p.y += h;
  vN = normalize(vec3(h - hx, e, h - hz));
  vWorld = p;
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

export const WATER_FS = /* glsl */ `
in vec3 vWorld; in vec3 vN;
out vec4 fragColor;
uniform vec3 uCamPos; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform vec3 uSkyColor; uniform vec3 uHorizonColor; uniform float uTime; uniform float uNight; uniform float uWet;
uniform sampler2D uShore; uniform vec4 uShoreRect;
uniform vec4 uLights[${MAX_LIGHTS * 3}]; uniform int uLightCount;
${NOISE_GLSL}
${FOG_GLSL}
void main() {
  vec3 V = normalize(uCamPos - vWorld);
  vec2 rip = vec2(vnoise(vWorld.xz * 0.7 + uTime * 0.6), vnoise(vWorld.xz * 0.7 - uTime * 0.5 + 9.0)) - 0.5;
  vec2 rip2 = vec2(vnoise(vWorld.xz * 2.3 - uTime * 1.1), vnoise(vWorld.xz * 2.1 + uTime * 0.9 + 4.0)) - 0.5;
  vec3 N = normalize(vN + vec3(rip.x + rip2.x * 0.5, 0.0, rip.y + rip2.y * 0.5) * (0.25 + uWet * 0.2));
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 sky = mix(uHorizonColor, uSkyColor, pow(max(R.y, 0.0), 0.5));
  vec3 deep = mix(vec3(0.01, 0.12, 0.16), vec3(0.004, 0.02, 0.04), uNight);
  vec3 shallowC = mix(vec3(0.05, 0.38, 0.4), vec3(0.01, 0.05, 0.07), uNight);
  vec2 suv = (vWorld.xz - uShoreRect.xy) / uShoreRect.zw;
  float shore = texture(uShore, suv).r; // 1 at the coast, 0 far out
  vec3 body = mix(deep, shallowC, shore * 0.8);
  body *= 0.6 + 0.6 * max(dot(vec3(0, 1, 0), uSunDir), 0.0);
  vec3 col = mix(body, sky, fres);
  vec3 H = normalize(uSunDir + V);
  col += uSunColor * pow(max(dot(N, H), 0.0), 380.0) * 6.0;
  col += uSunColor * pow(max(dot(N, H), 0.0), 40.0) * 0.12;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 lp = uLights[i * 3], lc = uLights[i * 3 + 1];
    vec3 L = lp.xyz - vWorld; float d = length(L);
    if (d > lp.w * 3.0) continue;
    L /= d;
    vec3 Hl = normalize(L + V);
    col += lc.rgb * lc.w * pow(max(dot(N, Hl), 0.0), 120.0) * 2.0 / (1.0 + d * 0.05);
  }
  // foam near the shoreline, animated bands
  float band = sin(shore * 30.0 - uTime * 1.5 + vnoise(vWorld.xz * 0.3) * 6.0);
  float foam = smoothstep(0.75, 0.95, shore) * smoothstep(0.2, 0.9, band + vnoise(vWorld.xz * 1.5) * 0.8);
  foam += smoothstep(0.93, 1.0, shore) * 0.8;
  col = mix(col, vec3(0.85, 0.9, 0.92) * (0.3 + 0.7 * max(uSunDir.y + 0.2, 0.15)), clamp(foam, 0.0, 1.0) * 0.8);
  col = applyFog(col, vWorld, uCamPos, uSunDir);
  fragColor = vec4(col, 1.0);
}`;
