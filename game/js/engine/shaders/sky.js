// Sky dome drawn as a full-screen triangle: gradient, sun disc + halo, moon, stars and drifting clouds.
import { NOISE_GLSL } from './common.js';

export const FULLSCREEN_VS = /* glsl */ `
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SKY_FS = /* glsl */ `
in vec2 vUV;
out vec4 fragColor;
uniform mat4 uInvViewProj;
uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunGlow;
uniform float uNight; uniform float uTime; uniform float uCloud; uniform float uRain;
${NOISE_GLSL}
void main() {
  vec4 p = uInvViewProj * vec4(vUV * 2.0 - 1.0, 1.0, 1.0);
  vec3 dir = normalize(p.xyz / p.w - (uInvViewProj * vec4(vUV * 2.0 - 1.0, -1.0, 1.0)).xyz / (uInvViewProj * vec4(vUV * 2.0 - 1.0, -1.0, 1.0)).w);
  float y = dir.y;
  float t = pow(max(y, 0.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  if (y < 0.0) col = mix(uHorizon, uHorizon * 0.5, min(-y * 4.0, 1.0));
  // sun
  float sd = max(dot(dir, uSunDir), 0.0);
  col += uSunGlow * (pow(sd, 6.0) * 0.6 + pow(sd, 60.0) * 1.5);
  col += uSunGlow * smoothstep(0.9993, 0.9997, sd) * 30.0 * step(-0.05, uSunDir.y);
  // stars
  if (uNight > 0.01 && y > 0.0) {
    vec3 sp = dir * 260.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    if (h > 0.985) {
      vec3 c = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 5.1)) - 0.5) * 0.6;
      float d = length(sp - c);
      float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 100.0);
      col += vec3(0.8, 0.85, 1.0) * (1.0 - smoothstep(0.0, 0.35, d)) * uNight * tw * (1.0 - uRain) * 2.5 * smoothstep(0.0, 0.25, y);
    }
  }
  // moon
  float md = dot(dir, uMoonDir);
  float moon = smoothstep(0.9985, 0.9989, md);
  float crater = vnoise(dir.xz * 400.0) * 0.3;
  col += vec3(0.85, 0.88, 1.0) * moon * (1.6 - crater) * uNight;
  col += vec3(0.25, 0.3, 0.5) * pow(max(md, 0.0), 30.0) * 0.5 * uNight;
  // clouds on a virtual plane
  if (y > 0.0) {
    vec2 cp = dir.xz / (y + 0.08) * 1.4 + vec2(uTime * 0.004, uTime * 0.002);
    float c = fbm(cp * 0.9);
    float cover = mix(0.55, 0.3, uCloud);
    float a = smoothstep(cover, cover + 0.3, c) * smoothstep(0.0, 0.2, y);
    vec3 lit = mix(uHorizon * 1.1, uSunGlow * 0.9 + uHorizon * 0.5, pow(sd, 3.0));
    vec3 cloudCol = mix(lit, uZenith * 0.6, smoothstep(0.5, 1.0, c) * 0.7);
    cloudCol = mix(cloudCol, vec3(0.06, 0.07, 0.09), uNight * 0.75);
    col = mix(col, cloudCol, a * 0.85);
  }
  fragColor = vec4(col, 1.0);
}`;
