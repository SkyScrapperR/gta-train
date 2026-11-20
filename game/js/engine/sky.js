// Time-of-day environment: sun/moon direction, sky gradient, ambient, fog and color grade per hour,
// plus the sky dome draw call.
import { Program } from './gl.js';
import { FULLSCREEN_VS, SKY_FS } from './shaders/sky.js';
import { clamp, lerp, smoothstep, v3norm } from '../core/math.js';

// Keyframes by hour. Colors are linear HDR.
const KEYS = [
  { h: 0, zenith: [0.004, 0.006, 0.018], horizon: [0.018, 0.024, 0.05], sunGlow: [0.0, 0.0, 0.0], sky: [0.02, 0.028, 0.06], ground: [0.01, 0.01, 0.016], fog: [0.016, 0.02, 0.04], fogSun: [0.02, 0.025, 0.05], sun: [0.07, 0.09, 0.15], gradeGain: [0.95, 0.98, 1.08], gradeLift: [0.0, 0.0, 0.02], sat: 1.05, exposure: 1.25 },
  { h: 5.0, zenith: [0.01, 0.015, 0.04], horizon: [0.05, 0.05, 0.1], sunGlow: [0.1, 0.05, 0.05], sky: [0.03, 0.04, 0.08], ground: [0.02, 0.02, 0.025], fog: [0.04, 0.04, 0.07], fogSun: [0.1, 0.06, 0.06], sun: [0.08, 0.08, 0.12], gradeGain: [0.97, 0.97, 1.05], gradeLift: [0.01, 0.0, 0.02], sat: 1.0, exposure: 1.2 },
  { h: 6.2, zenith: [0.12, 0.16, 0.32], horizon: [0.95, 0.5, 0.35], sunGlow: [1.6, 0.7, 0.35], sky: [0.25, 0.25, 0.35], ground: [0.12, 0.09, 0.08], fog: [0.55, 0.4, 0.38], fogSun: [1.3, 0.65, 0.35], sun: [1.6, 0.8, 0.45], gradeGain: [1.04, 0.98, 0.95], gradeLift: [0.02, 0.0, 0.01], sat: 1.1, exposure: 1.0 },
  { h: 8.5, zenith: [0.14, 0.32, 0.7], horizon: [0.6, 0.72, 0.85], sunGlow: [1.2, 1.0, 0.8], sky: [0.32, 0.42, 0.58], ground: [0.2, 0.17, 0.14], fog: [0.55, 0.65, 0.78], fogSun: [1.0, 0.9, 0.75], sun: [2.8, 2.55, 2.2], gradeGain: [1.0, 1.0, 1.0], gradeLift: [0.0, 0.0, 0.0], sat: 1.08, exposure: 1.0 },
  { h: 13, zenith: [0.1, 0.3, 0.75], horizon: [0.55, 0.72, 0.9], sunGlow: [1.0, 0.95, 0.85], sky: [0.34, 0.45, 0.62], ground: [0.22, 0.19, 0.15], fog: [0.6, 0.72, 0.85], fogSun: [1.0, 0.95, 0.85], sun: [3.1, 2.95, 2.7], gradeGain: [1.0, 1.0, 1.0], gradeLift: [0.0, 0.0, 0.0], sat: 1.1, exposure: 1.0 },
  { h: 16.3, zenith: [0.12, 0.25, 0.6], horizon: [0.95, 0.68, 0.45], sunGlow: [1.8, 1.1, 0.5], sky: [0.35, 0.36, 0.45], ground: [0.22, 0.16, 0.11], fog: [0.75, 0.62, 0.52], fogSun: [1.6, 1.0, 0.5], sun: [3.0, 1.95, 1.05], gradeGain: [1.06, 1.0, 0.92], gradeLift: [0.02, 0.01, 0.0], sat: 1.15, exposure: 1.0 },
  { h: 17.8, zenith: [0.16, 0.14, 0.38], horizon: [1.1, 0.42, 0.25], sunGlow: [2.2, 0.8, 0.3], sky: [0.3, 0.24, 0.36], ground: [0.16, 0.1, 0.08], fog: [0.7, 0.38, 0.35], fogSun: [1.8, 0.7, 0.3], sun: [2.2, 0.9, 0.42], gradeGain: [1.08, 0.97, 0.95], gradeLift: [0.03, 0.0, 0.02], sat: 1.2, exposure: 1.05 },
  { h: 18.9, zenith: [0.05, 0.04, 0.14], horizon: [0.35, 0.12, 0.25], sunGlow: [0.7, 0.2, 0.25], sky: [0.1, 0.07, 0.16], ground: [0.05, 0.035, 0.05], fog: [0.18, 0.08, 0.16], fogSun: [0.5, 0.18, 0.2], sun: [0.25, 0.12, 0.18], gradeGain: [1.04, 0.95, 1.06], gradeLift: [0.02, 0.0, 0.03], sat: 1.15, exposure: 1.15 },
  { h: 20.2, zenith: [0.006, 0.008, 0.024], horizon: [0.03, 0.03, 0.07], sunGlow: [0.0, 0.0, 0.0], sky: [0.025, 0.03, 0.07], ground: [0.012, 0.012, 0.02], fog: [0.02, 0.025, 0.05], fogSun: [0.03, 0.03, 0.06], sun: [0.07, 0.09, 0.15], gradeGain: [0.95, 0.98, 1.08], gradeLift: [0.0, 0.0, 0.02], sat: 1.05, exposure: 1.25 },
  { h: 24, zenith: [0.004, 0.006, 0.018], horizon: [0.018, 0.024, 0.05], sunGlow: [0.0, 0.0, 0.0], sky: [0.02, 0.028, 0.06], ground: [0.01, 0.01, 0.016], fog: [0.016, 0.02, 0.04], fogSun: [0.02, 0.025, 0.05], sun: [0.07, 0.09, 0.15], gradeGain: [0.95, 0.98, 1.08], gradeLift: [0.0, 0.0, 0.02], sat: 1.05, exposure: 1.25 },
];

const mixArr = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));

export function computeEnvironment(hour, rain = 0) {
  hour = ((hour % 24) + 24) % 24;
  let k = 0;
  while (k < KEYS.length - 2 && KEYS[k + 1].h <= hour) k++;
  const A = KEYS[k], B = KEYS[k + 1];
  const t = smoothstep(0, 1, (hour - A.h) / (B.h - A.h));
  const env = {};
  for (const key of ['zenith', 'horizon', 'sunGlow', 'sky', 'ground', 'fog', 'fogSun', 'sun', 'gradeGain', 'gradeLift']) env[key] = mixArr(A[key], B[key], t);
  env.sat = lerp(A.sat, B.sat, t);
  env.exposure = lerp(A.exposure, B.exposure, t);
  // Sun path: rises in the east (+x), sets in the west (-x), tilted toward the south (+z).
  const dayT = (hour - 6) / 12;
  const elev = Math.sin(dayT * Math.PI) * 1.15;
  const az = dayT * Math.PI;
  const sunDir = v3norm([Math.cos(az), elev, 0.45]);
  const moonDir = v3norm([-Math.cos(az) * 0.8, Math.max(0.35, -elev * 0.8 + 0.2), -0.35]);
  env.sunDir = sunDir;
  env.moonDir = moonDir;
  env.night = 1 - smoothstep(-0.12, 0.12, sunDir[1]);
  env.daylight = smoothstep(-0.05, 0.25, sunDir[1]);
  // The directional light is the sun by day and the moon by night.
  env.lightDir = env.night > 0.5 ? moonDir : (sunDir[1] < 0.06 ? v3norm([sunDir[0], 0.06, sunDir[2]]) : sunDir);
  env.hour = hour;
  // Rain darkens and greys everything.
  if (rain > 0) {
    const grey = (c, f) => { const l = (c[0] + c[1] + c[2]) / 3; return c.map((v) => lerp(v, l * f, rain * 0.75)); };
    env.zenith = grey(env.zenith, 0.7); env.horizon = grey(env.horizon, 0.8);
    env.sky = grey(env.sky, 0.9); env.fog = grey(env.fog, 0.85); env.fogSun = grey(env.fogSun, 0.6);
    env.sun = env.sun.map((v) => v * (1 - 0.65 * rain));
    env.sunGlow = env.sunGlow.map((v) => v * (1 - 0.8 * rain));
  }
  env.rain = rain;
  env.fogDensity = lerp(0.0016, 0.0034, env.night) + rain * 0.004;
  env.fogHeight = 0.018;
  env.rim = mixArr([0.05, 0.06, 0.07], [0.12, 0.2, 0.32], env.night);
  return env;
}

export class SkyRenderer {
  constructor(gl, fullscreen) {
    this.gl = gl;
    this.fs = fullscreen;
    this.prog = new Program(gl, FULLSCREEN_VS, SKY_FS, 'sky');
  }
  draw(env, invViewProj, time) {
    const gl = this.gl, p = this.prog.use();
    p.set('uInvViewProj', invViewProj).set('uSunDir', env.sunDir).set('uMoonDir', env.moonDir)
      .set('uZenith', env.zenith).set('uHorizon', env.horizon).set('uSunGlow', env.sunGlow)
      .set('uNight', env.night).set('uTime', time).set('uCloud', clamp(env.rain * 2, 0, 1)).set('uRain', env.rain);
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    this.fs.draw();
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
  }
}
