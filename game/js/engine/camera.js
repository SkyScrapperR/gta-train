// Perspective camera with cached view/projection matrices and basis vectors.
import { m4, m4perspective, m4lookAt, m4mul, m4invert, v3norm, v3sub, v3cross } from '../core/math.js';

export class Camera {
  constructor() {
    this.pos = [0, 10, 0];
    this.target = [0, 0, 10];
    this.fov = 60 * Math.PI / 180;
    this.near = 0.25;
    this.far = 2600;
    this.aspect = 16 / 9;
    this.view = m4(); this.proj = m4(); this.viewProj = m4(); this.invViewProj = m4();
    this.right = [1, 0, 0]; this.up = [0, 1, 0]; this.forward = [0, 0, 1];
    this.roll = 0;
  }
  update(aspect) {
    this.aspect = aspect;
    const up = this.roll ? [Math.sin(this.roll), Math.cos(this.roll), 0] : [0, 1, 0];
    m4lookAt(this.view, this.pos, this.target, up);
    m4perspective(this.proj, this.fov, aspect, this.near, this.far);
    m4mul(this.viewProj, this.proj, this.view);
    m4invert(this.invViewProj, this.viewProj);
    this.forward = v3norm(v3sub(this.target, this.pos));
    this.right = v3norm(v3cross(this.forward, [0, 1, 0]));
    this.up = v3cross(this.right, this.forward);
  }
  // Project a world point to normalized screen coords (0..1), returns null if behind.
  project(p) {
    const m = this.viewProj;
    const x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
    const y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.01) return null;
    return [(x / w) * 0.5 + 0.5, 1 - ((y / w) * 0.5 + 0.5), w];
  }
}
