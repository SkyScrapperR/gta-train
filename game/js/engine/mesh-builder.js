// Procedural mesh builder. Accumulates vertices in the engine's standard layout
// (pos3 normal3 color3 uv2 material2) with a transform stack and primitive helpers.
import { VERTEX_FLOATS, Mesh } from './gl.js';
import { m4, m4mul, m4fromYPR, m4copy } from '../core/math.js';

// Material ids, shared with the lit shader (see shaders/lit.js).
export const MAT = {
  PLAIN: 0, CLOTH: 1, CARPAINT: 2, SKIN: 3, GLASS: 4, HEADLIGHT: 5, TAILLIGHT: 6, LIGHTBAR: 7,
  EMISSIVE: 8, WALL_GLASS: 9, WALL_PUNCHED: 10, WALL_HOUSE: 11, ASPHALT: 12, CONCRETE: 13,
  GRASS: 14, SAND: 15, SIGN: 16, MARKING: 17, METAL: 18, ROOF_TILE: 19, FOLIAGE: 20,
  LAMP: 21, SHOPFRONT: 22, RUBBER: 23, WOOD: 24, NEON: 25, CHROME: 26, SIGNAL: 27,
};

export class MeshBuilder {
  constructor() {
    this.v = [];
    this.idx = [];
    this.color = [1, 1, 1];
    this.mat = MAT.PLAIN;
    this.param = 0;
    this.stack = [];
    this.xf = null; // current transform (null = identity)
  }
  get vertexCount() { return this.v.length / VERTEX_FLOATS; }
  setColor(r, g, b) { this.color = Array.isArray(r) ? r.slice(0, 3) : [r, g, b]; return this; }
  setMat(mat, param = 0) { this.mat = mat; this.param = param; return this; }
  style(color, mat = this.mat, param = 0) { this.setColor(color); this.mat = mat; this.param = param; return this; }

  push(matrix) {
    this.stack.push(this.xf);
    if (this.xf) { const o = m4(); m4mul(o, this.xf, matrix); this.xf = o; } else this.xf = m4copy(m4(), matrix);
    return this;
  }
  pushTRS(x, y, z, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = 1, sz = 1) { return this.push(m4fromYPR(m4(), x, y, z, yaw, pitch, roll, sx, sy, sz)); }
  pop() { this.xf = this.stack.pop() ?? null; return this; }

  vertex(px, py, pz, nx, ny, nz, u = 0, w = 0) {
    const m = this.xf;
    if (m) {
      const x = px, y = py, z = pz;
      px = m[0] * x + m[4] * y + m[8] * z + m[12];
      py = m[1] * x + m[5] * y + m[9] * z + m[13];
      pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      const a = nx, b = ny, c = nz;
      nx = m[0] * a + m[4] * b + m[8] * c;
      ny = m[1] * a + m[5] * b + m[9] * c;
      nz = m[2] * a + m[6] * b + m[10] * c;
      const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    }
    const c = this.color;
    this.v.push(px, py, pz, nx, ny, nz, c[0], c[1], c[2], u, w, this.mat, this.param);
    return this.vertexCount - 1;
  }

  // Quad from 4 corners (counter-clockwise when viewed from the front), flat normal.
  quad(a, b, c, d, uv = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const uvs = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
    const i0 = this.vertex(a[0], a[1], a[2], nx, ny, nz, uvs[0][0], uvs[0][1]);
    this.vertex(b[0], b[1], b[2], nx, ny, nz, uvs[1][0], uvs[1][1]);
    this.vertex(c[0], c[1], c[2], nx, ny, nz, uvs[2][0], uvs[2][1]);
    this.vertex(d[0], d[1], d[2], nx, ny, nz, uvs[3][0], uvs[3][1]);
    this.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
    return this;
  }
  tri(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const i0 = this.vertex(a[0], a[1], a[2], nx, ny, nz);
    this.vertex(b[0], b[1], b[2], nx, ny, nz); this.vertex(c[0], c[1], c[2], nx, ny, nz);
    this.idx.push(i0, i0 + 1, i0 + 2);
    return this;
  }

  // Axis-aligned box given min and max corners. faces: bitmask to skip (1=bottom,2=top,4=-x,8=+x,16=-z,32=+z).
  boxMinMax(x0, y0, z0, x1, y1, z1, skip = 0) {
    if (!(skip & 2)) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]);
    if (!(skip & 1)) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
    if (!(skip & 32)) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    if (!(skip & 16)) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [[x1, y0], [x0, y0], [x0, y1], [x1, y1]]);
    if (!(skip & 8)) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [[z1, y0], [z0, y0], [z0, y1], [z1, y1]]);
    if (!(skip & 4)) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [[z0, y0], [z1, y0], [z1, y1], [z0, y1]]);
    return this;
  }
  // Centered box: center (x,y,z) is bottom-center.
  box(x, y, z, w, h, d, skip = 0) { return this.boxMinMax(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, skip); }

  // Box with chamfered vertical and top edges (an 8-sided prism with a chamfered cap).
  bevelBox(x, y, z, w, h, d, bev = 0.1) {
    bev = Math.min(bev, w / 2.2, d / 2.2, h / 2.2);
    const hw = w / 2, hd = d / 2;
    const ring = (inset) => [
      [-hw + inset + bev, -hd + inset], [hw - inset - bev, -hd + inset], [hw - inset, -hd + inset + bev], [hw - inset, hd - inset - bev],
      [hw - inset - bev, hd - inset], [-hw + inset + bev, hd - inset], [-hw + inset, hd - inset - bev], [-hw + inset, -hd + inset + bev],
    ];
    const outer = ring(0), inner = ring(bev * 0.7);
    const yTop = y + h, yMid = y + h - bev;
    for (let i = 0; i < 8; i++) {
      const a = outer[i], b = outer[(i + 1) % 8];
      // side
      this.quad([x + b[0], y, z + b[1]], [x + a[0], y, z + a[1]], [x + a[0], yMid, z + a[1]], [x + b[0], yMid, z + b[1]]);
      // chamfer to top
      const ia = inner[i], ib = inner[(i + 1) % 8];
      this.quad([x + b[0], yMid, z + b[1]], [x + a[0], yMid, z + a[1]], [x + ia[0], yTop, z + ia[1]], [x + ib[0], yTop, z + ib[1]]);
    }
    // top cap (fan)
    const c = this.vertex(x, yTop, z, 0, 1, 0);
    const first = this.vertexCount;
    for (let i = 0; i < 8; i++) this.vertex(x + inner[i][0], yTop, z + inner[i][1], 0, 1, 0);
    for (let i = 0; i < 8; i++) this.idx.push(c, first + ((i + 1) % 8), first + i);
    // bottom cap
    const cb = this.vertex(x, y, z, 0, -1, 0);
    const fb = this.vertexCount;
    for (let i = 0; i < 8; i++) this.vertex(x + outer[i][0], y, z + outer[i][1], 0, -1, 0);
    for (let i = 0; i < 8; i++) this.idx.push(cb, fb + i, fb + ((i + 1) % 8));
    return this;
  }

  // Tapered cylinder along +Y from y0 to y1, radii r0 (bottom) and r1 (top), smooth sides.
  // sx/sz scale the cross-section (elliptical limbs and torsos).
  cylinder(x, y0, z, r0, r1, h, sides = 10, { caps = true, sx = 1, sz = 1, smooth = true } = {}) {
    const y1 = y0 + h;
    const slope = (r0 - r1) / h;
    const base = this.vertexCount;
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      let nx = cx / sx, ny = slope, nz = cz / sz;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      this.vertex(x + cx * r0 * sx, y0, z + cz * r0 * sz, nx, ny, nz, i / sides, 0);
      this.vertex(x + cx * r1 * sx, y1, z + cz * r1 * sz, nx, ny, nz, i / sides, 1);
    }
    for (let i = 0; i < sides; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (!smooth) { /* flat shading unsupported for brevity; smooth is fine for low poly */ }
    if (caps) {
      for (const [yy, rr, ny] of [[y1, r1, 1], [y0, r0, -1]]) {
        if (rr <= 0.0001) continue;
        const c = this.vertex(x, yy, z, 0, ny, 0);
        const f = this.vertexCount;
        for (let i = 0; i < sides; i++) {
          const a = (i / sides) * Math.PI * 2;
          this.vertex(x + Math.cos(a) * rr * sx, yy, z + Math.sin(a) * rr * sz, 0, ny, 0);
        }
        for (let i = 0; i < sides; i++) {
          if (ny > 0) this.idx.push(c, f + ((i + 1) % sides), f + i); else this.idx.push(c, f + i, f + ((i + 1) % sides));
        }
      }
    }
    return this;
  }

  // Cylinder lying along the X axis (wheels, pipes): center (x,y,z), radius r, width w.
  cylinderX(x, y, z, r, w, sides = 12, caps = true) {
    this.pushTRS(x - w / 2, y, z, 0, 0, -Math.PI / 2);
    this.cylinder(0, 0, 0, r, r, w, sides, { caps });
    this.pop();
    return this;
  }
  cylinderZ(x, y, z, r, len, sides = 12, caps = true) {
    this.pushTRS(x, y, z - len / 2, 0, Math.PI / 2, 0);
    this.cylinder(0, 0, 0, r, r, len, sides, { caps });
    this.pop();
    return this;
  }

  // Low-poly UV sphere / ellipsoid centered at (x,y,z).
  sphere(x, y, z, rx, ry = rx, rz = rx, seg = 10, rings = 7) {
    const base = this.vertexCount;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings, phi = v * Math.PI;
      for (let i = 0; i <= seg; i++) {
        const u = i / seg, th = u * Math.PI * 2;
        const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        let ex = nx / rx, ey = ny / ry, ez = nz / rz; const l = Math.hypot(ex, ey, ez); ex /= l; ey /= l; ez /= l;
        this.vertex(x + nx * rx, y + ny * ry, z + nz * rz, ex, ey, ez, u, v);
      }
    }
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i, b = a + seg + 1;
        this.idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return this;
  }

  // Loft through rectangular-ish cross-sections along Z. Each section: {z, y0, y1, w0 (bottom width), w1 (top width)}.
  // Produces a closed tapered hull (car bodies). Optional per-face material override via fn(face) -> [color, mat].
  loft(sections, { capStart = true, capEnd = true, sideMat = null, topMat = null } = {}) {
    const corners = (s) => [[-s.w0 / 2, s.y0], [s.w0 / 2, s.y0], [s.w1 / 2, s.y1], [-s.w1 / 2, s.y1]];
    const save = [this.color, this.mat, this.param];
    for (let k = 0; k < sections.length - 1; k++) {
      const A = sections[k], B = sections[k + 1];
      const ca = corners(A), cb = corners(B);
      for (let e = 0; e < 4; e++) {
        const e2 = (e + 1) % 4;
        if (e === 0) continue; // bottom face skipped (never seen)
        const isTop = e === 2;
        const style = isTop ? topMat : sideMat;
        if (style) { this.setColor(style[0]); this.mat = style[1]; } else { this.color = save[0]; this.mat = save[1]; }
        this.quad([ca[e2][0], ca[e2][1], A.z], [cb[e2][0], cb[e2][1], B.z], [cb[e][0], cb[e][1], B.z], [ca[e][0], ca[e][1], A.z]);
      }
    }
    this.color = save[0]; this.mat = save[1];
    const cap = (s, flip) => {
      const c = corners(s).map((p) => [p[0], p[1], s.z]);
      if (flip) this.quad(c[0], c[1], c[2], c[3]); else this.quad(c[1], c[0], c[3], c[2]);
    };
    if (capStart) cap(sections[0], false);
    if (capEnd) cap(sections[sections.length - 1], true);
    return this;
  }

  // Merge another builder's geometry.
  append(other) {
    const off = this.vertexCount;
    for (let i = 0; i < other.v.length; i++) this.v.push(other.v[i]);
    for (let i = 0; i < other.idx.length; i++) this.idx.push(other.idx[i] + off);
    return this;
  }

  bounds() {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < this.v.length; i += VERTEX_FLOATS) {
      for (let k = 0; k < 3; k++) { const c = this.v[i + k]; if (c < mn[k]) mn[k] = c; if (c > mx[k]) mx[k] = c; }
    }
    return { min: mn, max: mx };
  }

  build(gl, opts = {}) {
    const verts = new Float32Array(this.v);
    const idx = this.vertexCount > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx);
    const mesh = new Mesh(gl, verts, idx, opts);
    const b = this.bounds();
    mesh.bounds = b;
    return mesh;
  }
}
