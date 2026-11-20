// Post-processing: bright pass, bloom down/upsample chain, luminance for eye adaptation,
// and the final composite (exposure, ACES, grade, vignette, desaturation, pause blur).
import { ACES_GLSL } from './common.js';

export const BRIGHT_FS = /* glsl */ `
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc; uniform float uThreshold; uniform vec2 uTexel;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUV + uTexel * vec2(-1, -1)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(-1, 1)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1, 1)).rgb;
  c *= 0.25;
  c = min(c, vec3(60.0));
  float l = max(c.r, max(c.g, c.b));
  float k = max(l - uThreshold, 0.0) / max(l, 0.0001);
  o = vec4(c * k, 1.0);
}`;

export const DOWN_FS = /* glsl */ `
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel;
void main() {
  vec3 c = texture(uSrc, vUV).rgb * 4.0;
  c += texture(uSrc, vUV + uTexel * vec2(-1, -1)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(-1, 1)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1, 1)).rgb;
  o = vec4(c / 8.0, 1.0);
}`;

export const UP_FS = /* glsl */ `
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc; uniform vec2 uTexel; uniform float uWeight;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uSrc, vUV + uTexel * vec2(-1, 0)).rgb * 2.0; c += texture(uSrc, vUV + uTexel * vec2(1, 0)).rgb * 2.0;
  c += texture(uSrc, vUV + uTexel * vec2(0, -1)).rgb * 2.0; c += texture(uSrc, vUV + uTexel * vec2(0, 1)).rgb * 2.0;
  c += texture(uSrc, vUV + uTexel * vec2(-1, -1)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1, -1)).rgb;
  c += texture(uSrc, vUV + uTexel * vec2(-1, 1)).rgb; c += texture(uSrc, vUV + uTexel * vec2(1, 1)).rgb;
  o = vec4(c / 12.0 * uWeight, 1.0);
}`;

// Average log-luminance of a small downsampled scene, blended over time with the previous value.
export const ADAPT_FS = /* glsl */ `
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc; uniform sampler2D uPrev; uniform float uRate;
void main() {
  float s = 0.0;
  for (int x = 0; x < 8; x++) for (int y = 0; y < 8; y++) {
    vec3 c = texture(uSrc, (vec2(x, y) + 0.5) / 8.0).rgb;
    s += log(max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0001));
  }
  float avg = exp(s / 64.0);
  float prev = texture(uPrev, vec2(0.5)).r;
  if (prev <= 0.0) prev = avg;
  o = vec4(mix(prev, avg, uRate), 0.0, 0.0, 1.0);
}`;

export const COMPOSITE_FS = /* glsl */ `
in vec2 vUV; out vec4 o;
uniform sampler2D uScene; uniform sampler2D uBloom; uniform sampler2D uBlur; uniform sampler2D uLum;
uniform float uBloomStrength; uniform float uExposure; uniform float uAutoExposure;
uniform vec3 uGradeLift; uniform vec3 uGradeGain; uniform float uSaturation; uniform float uContrast;
uniform float uVignette; uniform float uDesat; uniform float uBlurMix; uniform float uFlash; uniform vec3 uFlashColor;
uniform float uTime;
${ACES_GLSL}
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;
  vec3 c = scene + bloom * uBloomStrength;
  float lum = texture(uLum, vec2(0.5)).r;
  float key = 0.2;
  float autoExp = clamp(key / max(lum, 0.001), 0.5, 1.7);
  float exposure = uExposure * mix(1.0, autoExp, uAutoExposure);
  c *= exposure;
  c = aces(c);
  c = pow(c, vec3(1.0 / 2.2));
  // color grade
  c = c * uGradeGain + uGradeLift * (1.0 - c);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.5) * uContrast + 0.5;
  // pause blur
  if (uBlurMix > 0.0) {
    vec3 b = texture(uBlur, vUV).rgb * exposure;
    b = pow(aces(b), vec3(1.0 / 2.2));
    c = mix(c, b * 0.55, uBlurMix);
  }
  // desaturation (death / arrest)
  l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(c, vec3(l) * vec3(1.05, 0.95, 0.9), uDesat);
  vec2 q = vUV - 0.5;
  c *= 1.0 - uVignette * dot(q, q) * 2.2;
  c += uFlashColor * uFlash;
  // film grain to hide banding
  float g = fract(sin(dot(vUV * 1000.0 + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (g - 0.5) / 255.0;
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export const COPY_FS = /* glsl */ `
in vec2 vUV; out vec4 o; uniform sampler2D uSrc;
void main() { o = texture(uSrc, vUV); }`;
