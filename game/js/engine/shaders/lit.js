// The main lit shader: sun/moon + hemisphere ambient, PCF shadows, clustered-lite point/spot lights,
// procedural materials (windows, asphalt, concrete, grass...), wet roads, rim light and height fog.
import { NOISE_GLSL, FOG_GLSL } from './common.js';

export const MAX_LIGHTS = 48;

export const LIT_VS = /* glsl */ `
in vec3 a_pos; in vec3 a_normal; in vec3 a_color; in vec2 a_uv; in vec2 a_mat;
#ifdef INSTANCED
in mat4 a_inst0; in vec4 a_instColor; in vec4 a_instExtra;
#else
uniform mat4 uModel;
uniform vec4 uInstColor;
uniform vec4 uInstExtra;
#endif
uniform mat4 uViewProj;
uniform mat4 uLightVP;
out vec3 vWorld; out vec3 vNormal; out vec3 vColor; out vec2 vUV; out vec4 vShadow;
flat out int vMat; flat out float vParam; out vec4 vInstColor; out vec4 vExtra; out vec3 vLocal;
void main() {
#ifdef INSTANCED
  mat4 M = a_inst0; vInstColor = a_instColor; vExtra = a_instExtra;
#else
  mat4 M = uModel; vInstColor = uInstColor; vExtra = uInstExtra;
#endif
  vec4 w = M * vec4(a_pos, 1.0);
  vWorld = w.xyz;
  vLocal = a_pos;
  vNormal = normalize(mat3(M) * a_normal);
  vColor = a_color; vUV = a_uv; vMat = int(a_mat.x + 0.5); vParam = a_mat.y;
  vShadow = uLightVP * w;
  gl_Position = uViewProj * w;
}`;

export const LIT_FS = /* glsl */ `
in vec3 vWorld; in vec3 vNormal; in vec3 vColor; in vec2 vUV; in vec4 vShadow;
flat in int vMat; flat in float vParam; in vec4 vInstColor; in vec4 vExtra; in vec3 vLocal;
out vec4 fragColor;
uniform vec3 uCamPos;
uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform vec3 uSkyColor; uniform vec3 uGroundColor; uniform vec3 uHorizonColor;
uniform float uTime; uniform float uNight; uniform float uWet;
uniform sampler2DShadow uShadowMap; uniform float uShadowOn; uniform float uShadowTexel;
uniform vec4 uLights[${MAX_LIGHTS * 3}];
uniform int uLightCount;
uniform sampler2D uAtlas;
uniform vec3 uRimColor;
uniform float uAlpha;
${NOISE_GLSL}
${FOG_GLSL}

float shadowFactor(vec3 N) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = vShadow.xyz / vShadow.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float bias = 0.0008 + 0.0015 * (1.0 - max(dot(N, uSunDir), 0.0));
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(uShadowMap, vec3(p.xy + vec2(x, y) * uShadowTexel * 1.2, p.z - bias));
  return s / 9.0;
}

vec3 envColor(vec3 R) {
  float t = R.y;
  vec3 c = t > 0.0 ? mix(uHorizonColor, uSkyColor, pow(t, 0.6)) : mix(uHorizonColor, uGroundColor * 0.6, min(-t * 3.0, 1.0));
  return c;
}

// Procedural building facade. Returns albedo in .rgb and writes emission/spec via out params.
float glassMode = 0.0;
void facade(int mat, vec3 N, inout vec3 albedo, inout vec3 emis, inout float spec, inout float refl, inout float gloss) {
  if (abs(N.y) > 0.5) { albedo *= 0.85 + 0.15 * vnoise(vWorld.xz * 0.5); return; }
  float u = abs(N.x) > 0.5 ? vWorld.z : vWorld.x;
  float seed = vParam;
  float floorH = mat == ${9} ? 3.6 : 3.4;
  float winW = mat == ${9} ? 2.2 : (mat == ${11} ? 4.5 : 3.2);
  float y = vWorld.y - 0.4;
  vec2 g = vec2(u / winW, y / floorH);
  vec2 cell = floor(g); vec2 f = fract(g);
  float mask;
  if (mat == ${9}) mask = step(0.05, f.x) * step(f.x, 0.95) * step(0.08, f.y) * step(f.y, 0.92);
  else if (mat == ${10}) mask = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.85);
  else mask = step(0.3, f.x) * step(f.x, 0.7) * step(0.35, f.y) * step(f.y, 0.8) * step(0.5, hash12(cell + seed * 3.1));
  if (y < 3.6) mask *= (mat == ${9} ? 1.0 : 0.0);
  // wall grime
  float grime = fbm(vec2(u * 0.15, vWorld.y * 0.08) + seed);
  albedo *= 0.8 + 0.3 * grime;
  albedo *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 6.0, vWorld.y));
  if (mask > 0.5) {
    float h = hash12(cell + seed * 17.13);
    float h2 = hash12(cell * 1.7 + seed * 5.3);
    vec3 glassTint = mat == ${9} ? vColor * 0.55 : vec3(0.10, 0.13, 0.17);
    albedo = glassTint * (0.5 + 0.2 * h2);
    spec = 1.0; refl = mat == ${9} ? 0.6 : 0.4; gloss = 120.0;
    glassMode = 1.0;
    float litFrac = mix(0.03, 0.26 + 0.12 * sin(seed), uNight);
    if (h < litFrac) {
      vec3 warm = vec3(1.0, 0.72, 0.42), cool = vec3(0.65, 0.82, 1.0), pink = vec3(1.0, 0.5, 0.8);
      vec3 tint = h2 < 0.6 ? warm : (h2 < 0.9 ? cool : pink);
      // interior variation: blinds / gradient
      float inner = 0.6 + 0.4 * step(0.3, fract(f.x * 3.0 + h * 7.0)) * (0.7 + 0.3 * f.y);
      emis += tint * tint * inner * (0.15 + 3.2 * uNight) * (0.5 + 0.6 * h2);
      refl *= 0.4;
    }
  } else if (mat == ${9}) {
    // mullions on curtain walls
    albedo = vColor * 0.35 + 0.05; spec = 0.6; gloss = 60.0; refl = 0.2;
  }
}

void main() {
  vec3 N = normalize(vNormal);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCamPos - vWorld);
  vec3 albedo = vColor;
  vec3 emis = vec3(0.0);
  float spec = 0.08, gloss = 16.0, refl = 0.0, rim = 0.0, alpha = 1.0;
  float wetMask = 0.0;
  int m = vMat;

  if (m == 1) { albedo = vInstColor.rgb * vColor; rim = 1.0; spec = 0.05; }
  else if (m == 2) { // car paint with clearcoat; damage darkens
    albedo = vInstColor.rgb * vColor; spec = 0.9; gloss = 90.0; refl = 0.22;
    float burnt = vExtra.w;
    albedo = mix(albedo, vec3(0.05, 0.045, 0.04) * (0.6 + 0.8 * vnoise(vWorld.xz * 3.0)), burnt);
    refl *= 1.0 - burnt; spec *= 1.0 - burnt * 0.9;
  }
  else if (m == 3) { albedo = vInstColor.a > 1.5 ? vColor : vExtra.rgb * vColor; rim = 1.0; spec = 0.12; gloss = 20.0; }
  else if (m == 4) { albedo = vec3(0.03, 0.04, 0.05); spec = 1.0; gloss = 140.0; refl = 0.55; albedo = mix(albedo, vec3(0.02), vExtra.w); }
  else if (m == 5) { albedo = vec3(0.9); emis = vec3(1.0, 0.95, 0.8) * (0.2 + vExtra.z * 7.0) * (1.0 - vExtra.w); }
  else if (m == 6) { albedo = vec3(0.4, 0.02, 0.02); emis = vec3(1.0, 0.06, 0.04) * (0.25 + vExtra.z * 1.6 + vExtra.x * 5.0) * (1.0 - vExtra.w); }
  else if (m == 7) {
    float on = vExtra.y >= 0.0 ? 1.0 : 0.0;
    float ph = fract(vExtra.y);
    bool red = vUV.x < 0.5;
    float flash = red ? step(ph, 0.5) : step(0.5, ph);
    vec3 c = red ? vec3(1.0, 0.05, 0.05) : vec3(0.1, 0.25, 1.0);
    albedo = c * 0.3; emis = c * (0.3 + on * flash * 14.0);
  }
  else if (m == 8) { emis = vColor * vParam * mix(0.5, 1.0, uNight); albedo = vColor * 0.3; }
  else if (m >= 9 && m <= 11) { facade(m, N, albedo, emis, spec, refl, gloss); }
  else if (m == 12) { // asphalt
    float n = fbm(vWorld.xz * 0.35);
    float n2 = vnoise(vWorld.xz * 4.0);
    albedo = vec3(0.13, 0.135, 0.145) * (0.75 + 0.45 * n + 0.15 * n2);
    // patches and cracks
    float patchy = smoothstep(0.62, 0.66, fbm(vWorld.xz * 0.06 + 3.0));
    albedo = mix(albedo, albedo * 0.7, patchy);
    float crack = (1.0 - smoothstep(0.0, 0.012, abs(fbm(vWorld.xz * 0.35 + 9.0) - 0.5))) * smoothstep(0.55, 0.7, vnoise(vWorld.xz * 0.05));
    albedo *= 1.0 - crack * 0.4;
    // worn tyre tracks along lane centres
    float lx = abs(fract(vWorld.x / 90.0 + 0.5) - 0.5) * 90.0, lz = abs(fract(vWorld.z / 90.0 + 0.5) - 0.5) * 90.0;
    float lane = min(abs(lx - 2.6), abs(lz - 2.6));
    albedo *= 1.0 - 0.12 * (1.0 - smoothstep(0.3, 0.9, abs(lane - 0.0))) * step(min(lx, lz), 5.0);
    // tire tracks: darker bands along lanes (based on fract of position)
    spec = 0.15; gloss = 24.0;
    wetMask = 1.0;
  }
  else if (m == 13) { // concrete / pavement slabs
    vec2 q = vWorld.xz / 1.5;
    vec2 fq = fract(q);
    float joint = step(fq.x, 0.04) + step(fq.y, 0.04);
    albedo *= (0.82 + 0.25 * fbm(vWorld.xz * 0.6)) * (1.0 - 0.25 * min(joint, 1.0)) * (0.92 + 0.12 * hash12(floor(q)));
    spec = 0.1; wetMask = 0.6;
  }
  else if (m == 14) { float n = fbm(vWorld.xz * 0.3); albedo *= 0.7 + 0.55 * n; albedo *= 0.9 + 0.2 * vnoise(vWorld.xz * 6.0); spec = 0.02; }
  else if (m == 15) { float n = fbm(vWorld.xz * 0.2); albedo *= 0.85 + 0.25 * n + 0.05 * sin(vWorld.x * 2.0 + n * 6.0); spec = 0.03; }
  else if (m == 16) {
    vec4 t = texture(uAtlas, vUV);
    albedo = t.rgb * 0.8;
    emis = t.rgb * t.rgb * (0.5 + 2.6 * uNight) * vParam;
    spec = 0.3;
  }
  else if (m == 17) { float wear = smoothstep(0.35, 0.65, fbm(vWorld.xz * 1.3)); albedo = mix(vColor, vec3(0.16), wear * 0.55); spec = 0.2; wetMask = 0.8; }
  else if (m == 18) { // corrugated metal
    float c = sin((abs(N.x) > 0.5 ? vWorld.z : vWorld.x) * 9.0);
    albedo *= 0.82 + 0.12 * c + 0.2 * fbm(vWorld.xy * 0.2 + vWorld.zy * 0.2);
    spec = 0.35; gloss = 30.0;
  }
  else if (m == 19) { float r = fract(vWorld.y * 3.2 + vWorld.x * 0.0); albedo *= 0.8 + 0.25 * smoothstep(0.0, 0.8, r) * (0.8 + 0.4 * hash12(floor(vWorld.xz * 2.0))); }
  else if (m == 20) { albedo *= 0.75 + 0.5 * vnoise(vWorld.xz * 1.5 + vWorld.y); rim = 0.3; spec = 0.04; }
  else if (m == 21) { albedo = vec3(1.0, 0.9, 0.7); emis = vec3(1.0, 0.82, 0.55) * (0.05 + 9.0 * uNight); }
  else if (m == 22) { // shopfront glass with warm interior
    float h = hash12(floor(vWorld.xz * 0.3) + vParam);
    albedo = vec3(0.12, 0.13, 0.14); spec = 1.0; gloss = 120.0; refl = 0.4;
    vec3 tint = mix(vec3(1.0, 0.75, 0.45), vec3(0.8, 0.95, 1.0), h);
    float shelves = 0.6 + 0.4 * step(0.5, fract(vWorld.y * 1.4));
    emis = tint * shelves * (0.35 + 2.4 * uNight);
  }
  else if (m == 23) { albedo = vec3(0.04); spec = 0.05; }
  else if (m == 24) { float pl = fract((abs(N.x) > 0.5 ? vWorld.z : vWorld.x) * 2.0 + floor(vWorld.y)); albedo *= 0.75 + 0.3 * smoothstep(0.0, 0.1, pl) * (0.8 + 0.4 * vnoise(vWorld.xz * 3.0)); }
  else if (m == 25) { float flick = 0.9 + 0.1 * sin(uTime * 7.0 + vParam * 13.0); albedo = vColor * 0.4; emis = vColor * (1.2 + 5.0 * uNight) * flick; }
  else if (m == 26) { albedo = vec3(0.5); spec = 1.2; gloss = 100.0; refl = 0.6; }
  else if (m == 27) { albedo = vInstColor.rgb * 0.25; emis = vInstColor.rgb * vInstColor.a; }

  albedo = min(albedo, vec3(0.85));

  // Wet surfaces: darker albedo, puddles with mirror-like reflections.
  float puddle = 0.0;
  if (uWet > 0.0 && wetMask > 0.0 && N.y > 0.7) {
    puddle = smoothstep(0.55, 0.7, fbm(vWorld.xz * 0.12 + 1.7)) * wetMask;
    albedo *= mix(1.0, 0.55, uWet);
    refl = max(refl, uWet * mix(0.25, 0.8, puddle));
    spec = max(spec, uWet * 1.2); gloss = max(gloss, mix(40.0, 250.0, puddle));
    if (puddle > 0.0) N = normalize(N + vec3(sin(vWorld.x * 7.0 + uTime * 9.0), 0.0, cos(vWorld.z * 7.0 + uTime * 8.0)) * 0.015 * uWet);
  }

  float sh = shadowFactor(N);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 hemi = mix(uGroundColor, uSkyColor, N.y * 0.5 + 0.5) * 0.72;
  // fake AO toward ground for tall surfaces
  float ao = 0.75 + 0.25 * smoothstep(0.0, 3.0, vWorld.y);
  vec3 color = albedo * (hemi * ao + uSunColor * ndl * sh);
  vec3 H = normalize(uSunDir + V);
  color += uSunColor * spec * pow(max(dot(N, H), 0.0), gloss) * sh * ndl * 0.6;

  // Point / spot lights.
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec4 lp = uLights[i * 3], lc = uLights[i * 3 + 1], ld = uLights[i * 3 + 2];
    vec3 L = lp.xyz - vWorld;
    float d = length(L);
    if (d > lp.w) continue;
    L /= d;
    float att = 1.0 - d / lp.w; att *= att;
    att /= 1.0 + d * d * 0.02;
    if (ld.w > -1.5) { float c = dot(-L, ld.xyz); att *= smoothstep(ld.w, ld.w + 0.12, c); }
    float nl = max(dot(N, L), 0.0) * 0.85 + 0.15 * (lc.w > 0.0 ? 1.0 : 0.0) * max(dot(N, L) + 0.5, 0.0);
    vec3 Hl = normalize(L + V);
    vec3 contrib = lc.rgb * lc.w * att * (albedo * nl + spec * pow(max(dot(N, Hl), 0.0), gloss) * 0.8);
    color += min(contrib, vec3(1.2));
  }

  // Environment reflection (sky-tinted) with fresnel.
  if (refl > 0.0) {
    vec3 R = reflect(-V, N);
    float fres = refl + (1.0 - refl) * pow(1.0 - max(dot(N, V), 0.0), 5.0) * 0.6;
    vec3 env = envColor(R);
    if (glassMode > 0.5) { vec3 tintG = m == 9 ? vColor * 1.5 : vec3(0.7, 0.8, 0.9); env = mix(uSkyColor * 1.6, env, 0.45) * tintG * (0.75 + 0.5 * hash12(floor(vWorld.xz * 0.2) + vParam)); }
    if (puddle > 0.0) env += uFogColor * 0.3;
    color = mix(color, env, clamp(fres, 0.0, 0.85));
  }
  // Rim light keeps characters readable at night.
  if (rim > 0.0) color += uRimColor * rim * pow(1.0 - max(dot(N, V), 0.0), 3.0);

  color += emis;
  color = applyFog(color, vWorld, uCamPos, uSunDir);
  fragColor = vec4(color, uAlpha);
#ifdef DBG
  fragColor = vec4(float(m % 4) / 3.0, float((m / 4) % 4) / 3.0, float(m / 16) / 2.0, 1.0) * 0.3;
#endif
}`;

export const DEPTH_VS = /* glsl */ `
in vec3 a_pos;
#ifdef INSTANCED
in mat4 a_inst0;
#else
uniform mat4 uModel;
#endif
uniform mat4 uViewProj;
void main() {
#ifdef INSTANCED
  mat4 M = a_inst0;
#else
  mat4 M = uModel;
#endif
  gl_Position = uViewProj * M * vec4(a_pos, 1.0);
}`;
export const DEPTH_FS = /* glsl */ `out vec4 o; void main() { o = vec4(1.0); }`;
