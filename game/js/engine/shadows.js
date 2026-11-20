// Directional shadow map, fitted around the camera focus and snapped to texels to avoid shimmering.
import { RenderTarget } from './gl.js';
import { m4, m4lookAt, m4ortho, m4mul } from '../core/math.js';

export class ShadowMap {
  constructor(gl, size = 2048) {
    this.gl = gl;
    this.size = size;
    this.target = new RenderTarget(gl, size, size, { format: 'none', depthTexture: true, compare: true });
    this.view = m4(); this.proj = m4(); this.viewProj = m4();
    this.radius = 90;
  }
  setSize(size) { if (size !== this.size) { this.size = size; this.target.resize(size, size); } }
  fit(center, sunDir, radius) {
    this.radius = radius;
    const texel = (radius * 2) / this.size;
    // A fixed light-space orientation (looking at the origin) lets us snap the window to texels.
    const up = Math.abs(sunDir[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
    m4lookAt(this.view, [sunDir[0] * 1000, sunDir[1] * 1000, sunDir[2] * 1000], [0, 0, 0], up);
    const v = this.view;
    const cx = v[0] * center[0] + v[4] * center[1] + v[8] * center[2] + v[12];
    const cy = v[1] * center[0] + v[5] * center[1] + v[9] * center[2] + v[13];
    const cz = v[2] * center[0] + v[6] * center[1] + v[10] * center[2] + v[14];
    const sx = Math.round(cx / texel) * texel, sy = Math.round(cy / texel) * texel;
    m4ortho(this.proj, sx - radius, sx + radius, sy - radius, sy + radius, -cz - 500, -cz + 300);
    m4mul(this.viewProj, this.proj, this.view);
    this.texel = 1 / this.size;
  }
}
