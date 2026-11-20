// View-frustum extraction and AABB / sphere culling.
export class Frustum {
  constructor() { this.planes = Array.from({ length: 6 }, () => new Float32Array(4)); }
  setFromMatrix(m) {
    const p = this.planes;
    const set = (pl, a, b, c, d) => { const l = Math.hypot(a, b, c); pl[0] = a / l; pl[1] = b / l; pl[2] = c / l; pl[3] = d / l; };
    set(p[0], m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
    set(p[1], m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
    set(p[2], m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
    set(p[3], m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
    set(p[4], m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
    set(p[5], m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  }
  boxVisible(min, max) {
    for (const pl of this.planes) {
      const x = pl[0] > 0 ? max[0] : min[0], y = pl[1] > 0 ? max[1] : min[1], z = pl[2] > 0 ? max[2] : min[2];
      if (pl[0] * x + pl[1] * y + pl[2] * z + pl[3] < 0) return false;
    }
    return true;
  }
  sphereVisible(x, y, z, r) {
    for (const pl of this.planes) if (pl[0] * x + pl[1] * y + pl[2] * z + pl[3] < -r) return false;
    return true;
  }
}
