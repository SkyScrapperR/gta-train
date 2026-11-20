// CPU-simulated billboard particles rendered as GPU instanced quads: smoke, fire, sparks, tracers,
// muzzle flashes, rain streaks, shell casings, plus ground/wall decals (bullet marks, skid marks, scorches).
import { MeshBuilder } from '../engine/mesh-builder.js';
import { InstanceBatch } from '../engine/instancing.js';
import { INSTANCE_FLOATS } from '../engine/gl.js';

const MAX = 2400, MAX_DECALS = 700;

function quadMesh(gl) {
  const b = new MeshBuilder();
  b.quad([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0]);
  return b.build(gl, { instanced: true });
}

export class Particles {
  constructor(game) {
    this.game = game;
    const mesh = quadMesh(game.gl);
    this.alpha = new InstanceBatch(mesh, { castShadow: false, name: 'particlesAlpha' });
    this.add = new InstanceBatch(mesh, { castShadow: false, name: 'particlesAdd' });
    this.list = [];
    this.decals = [];
    this.buf = new Float32Array(INSTANCE_FLOATS);
    this.rnd = Math.random;
  }
  spawn(p) {
    if (this.list.length >= MAX) this.list.shift();
    p.age = 0;
    p.vx = p.vx || 0; p.vy = p.vy || 0; p.vz = p.vz || 0;
    this.list.push(p);
    return p;
  }
  decal(x, y, z, nx, ny, nz, size, r, g, b, a, life = 40, stretch = 0, rot = Math.random() * 6) {
    if (this.decals.length >= MAX_DECALS) this.decals.shift();
    this.decals.push({ x, y, z, nx, ny, nz, size, r, g, b, a, life, age: 0, stretch, rot });
  }
  // ---------------------------------------------------------------- emitters
  smoke(x, y, z, shade = 0.5, size = 1, glow = 0) {
    const r = this.rnd;
    this.spawn({ x: x + (r() - 0.5) * 0.4, y, z: z + (r() - 0.5) * 0.4, vx: (r() - 0.5) * 0.6, vy: 1.2 + r(), vz: (r() - 0.5) * 0.6, life: 2.4 + r() * 1.5, size: 0.4 * size, grow: 1.1 * size, r: shade, g: shade, b: shade * 1.02, a: 0.5, type: 0, additive: false, drag: 0.4, rot: r() * 6, spin: (r() - 0.5), emis: glow, fireLit: glow > 0 ? 1 : 0 });
  }
  fire(x, y, z, size = 1) {
    const r = this.rnd;
    this.spawn({ x: x + (r() - 0.5) * 0.5 * size, y, z: z + (r() - 0.5) * 0.5 * size, vx: (r() - 0.5) * 0.5, vy: 1.6 + r() * 1.5, vz: (r() - 0.5) * 0.5, life: 0.5 + r() * 0.4, size: 0.45 * size, grow: -0.3, r: 1.0, g: 0.45 + r() * 0.2, b: 0.12, a: 0.8, type: 2, additive: true, emis: 1.2 });
  }
  sparks(x, y, z, nx = 0, nz = 0, n = 8) {
    const r = this.rnd;
    for (let i = 0; i < n; i++) {
      this.spawn({ x, y, z, vx: nx * 3 + (r() - 0.5) * 6, vy: r() * 4 + 1, vz: nz * 3 + (r() - 0.5) * 6, life: 0.25 + r() * 0.3, size: 0.025, stretch: 0.18, r: 1, g: 0.75, b: 0.35, a: 1, type: 1, additive: true, gravity: 12, emis: 4 });
    }
  }
  impact(x, y, z, nx, ny, nz, surface = 'wall') {
    this.sparks(x, y, z, nx, nz, 5);
    const r = this.rnd;
    for (let i = 0; i < 3; i++) this.spawn({ x, y, z, vx: nx * 1.5 + (r() - 0.5), vy: ny * 1.5 + r(), vz: nz * 1.5 + (r() - 0.5), life: 0.6, size: 0.12, grow: 0.6, r: 0.6, g: 0.58, b: 0.55, a: 0.6, type: 0, additive: false, drag: 2, emis: 0 });
    this.decal(x, y, z, nx, ny, nz, 0.07, 0.03, 0.03, 0.03, 0.9, 50);
  }
  tracer(x0, y0, z0, x1, y1, z1, color = [1, 0.85, 0.5]) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    if (len < 0.5) return;
    this.spawn({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, dir: [dx / len, dy / len, dz / len], life: 0.07, size: 0.035, stretch: len / 2, r: color[0], g: color[1], b: color[2], a: 1, type: 1, additive: true, emis: 3, still: true });
  }
  muzzle(x, y, z) {
    this.spawn({ x, y, z, life: 0.05, size: 0.32, grow: 2, r: 1, g: 0.8, b: 0.4, a: 1, type: 2, additive: true, emis: 6, still: true });
    this.game.lightsFx?.flash(x, y, z, [1, 0.75, 0.4], 3.5, 10, 0.06);
  }
  casing(x, y, z, side) {
    const r = this.rnd;
    this.spawn({ x, y, z, vx: side[0] * 2 + (r() - 0.5), vy: 2 + r(), vz: side[1] * 2 + (r() - 0.5), life: 0.8, size: 0.02, r: 0.9, g: 0.7, b: 0.3, a: 1, type: 2, additive: false, gravity: 12, emis: 0.6, bounce: true });
  }
  explosion(x, y, z, scale = 1) {
    const r = this.rnd;
    for (let i = 0; i < 40 * scale; i++) {
      const a = r() * Math.PI * 2, e = r() * 0.9 + 0.1, sp = 2 + r() * 7;
      this.spawn({ x, y: y + r(), z, vx: Math.cos(a) * sp * e, vy: 1 + r() * 6, vz: Math.sin(a) * sp * e, life: 0.7 + r() * 0.7, size: 1.0 * scale, grow: 2.2 * scale, r: 1, g: 0.32 + r() * 0.3, b: 0.06, a: 0.9, type: 0, additive: false, drag: 2.5, emis: 2.2, rot: r() * 6, spin: (r() - 0.5) * 2 });
    }
    for (let i = 0; i < 14 * scale; i++) this.spawn({ x, y: y + r() * 2, z, vx: (r() - 0.5) * 4, vy: 2 + r() * 4, vz: (r() - 0.5) * 4, life: 0.5 + r() * 0.4, size: 1.4 * scale, grow: 1.5 * scale, r: 1, g: 0.55, b: 0.2, a: 0.5, type: 2, additive: true, drag: 2, emis: 1.2 });
    for (let i = 0; i < 22 * scale; i++) {
      const a = r() * Math.PI * 2, sp = 1 + r() * 4;
      this.spawn({ x: x + Math.cos(a), y: y + r() * 2, z: z + Math.sin(a), vx: Math.cos(a) * sp, vy: 2 + r() * 3, vz: Math.sin(a) * sp, life: 3.5 + r() * 3, size: 1.2 * scale, grow: 1.6 * scale, r: 0.16, g: 0.15, b: 0.14, a: 0.75, type: 0, additive: false, drag: 1.2, rot: r() * 6, spin: (r() - 0.5) * 0.5, emis: 0.12, fireLit: 1 });
    }
    this.sparks(x, y + 0.5, z, 0, 0, 30);
    this.spawn({ x, y: y + 0.5, z, life: 0.2, size: 2 * scale, grow: 10 * scale, r: 1, g: 0.8, b: 0.5, a: 0.5, type: 2, additive: true, emis: 1.5, still: true });
    this.decal(x, 0.03, z, 0, 1, 0, 3.2 * scale, 0.02, 0.02, 0.02, 0.85, 90);
  }
  skid(x, z, yaw) { this.decal(x, 0.02, z, 0, 1, 0, 0.16, 0.02, 0.02, 0.02, 0.55, 30, 2.2, -yaw); }
  mark(x, z) { this.decal(x, 0.02, z, 0, 1, 0, 0.45, 0.08, 0.02, 0.02, 0.7, 60); } // small dark mark (non-graphic)
  rain(camPos, intensity) {
    const r = this.rnd;
    const n = Math.floor(intensity * 10);
    for (let i = 0; i < n; i++) {
      const x = camPos[0] + (r() - 0.5) * 50, z = camPos[2] + (r() - 0.5) * 50, y = camPos[1] + 8 + r() * 10;
      this.spawn({ x, y, z, vx: 1.5, vy: -22, vz: 0.6, life: 0.9, size: 0.012, stretch: 0.45, r: 0.7, g: 0.75, b: 0.85, a: 0.45, type: 1, additive: false, emis: 0.8, splash: true });
    }
  }
  // ---------------------------------------------------------------- update + upload
  update(dt) {
    const L = this.list;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (!p.still) {
        if (p.gravity) p.vy -= p.gravity * dt;
        if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < 0.02 && p.vy < 0) {
          if (p.splash) { p.age = p.life; if (this.rnd() < 0.3) this.spawn({ x: p.x, y: 0.05, z: p.z, life: 0.2, size: 0.08, grow: 0.6, r: 0.7, g: 0.75, b: 0.8, a: 0.4, type: 2, additive: false, still: true, emis: 0.3 }); continue; }
          if (p.bounce) { p.y = 0.02; p.vy *= -0.4; p.vx *= 0.6; p.vz *= 0.6; } else { p.y = 0.02; p.vy = 0; }
        }
      }
      p.rot = (p.rot || 0) + (p.spin || 0) * dt;
      L[w++] = p;
    }
    L.length = w;
    for (let i = this.decals.length - 1; i >= 0; i--) { const d = this.decals[i]; d.age += dt; if (d.age > d.life) this.decals.splice(i, 1); }
  }
  upload(camPos) {
    this.alpha.reset(); this.add.reset();
    const b = this.buf;
    for (const p of this.list) {
      const k = p.age / p.life;
      const size = Math.max(0.001, p.size + (p.grow || 0) * p.age);
      let alpha = p.a;
      if (p.type === 0) alpha *= Math.min(1, p.age * 6) * (1 - k);
      else alpha *= 1 - k * k;
      b[0] = p.x; b[1] = p.y; b[2] = p.z; b[3] = size;
      let r = p.r, g = p.g, bl = p.b;
      if (p.fireLit && k < 0.25) { const f = 1 - k / 0.25; r += f * 1.5; g += f * 0.6; bl += f * 0.1; }
      b[4] = r; b[5] = g; b[6] = bl; b[7] = alpha;
      if (p.type === 1) {
        const d = p.dir || [p.vx, p.vy, p.vz];
        b[8] = d[0]; b[9] = d[1]; b[10] = d[2]; b[11] = p.stretch || 0.2;
      } else { b[8] = 0; b[9] = 0; b[10] = 0; b[11] = 0; }
      b[12] = p.type; b[13] = p.rot || 0; b[14] = p.emis || 0; b[15] = 0;
      (p.additive ? this.add : this.alpha).addRaw(b);
    }
    for (const d of this.decals) {
      if (Math.abs(d.x - camPos[0]) > 120 || Math.abs(d.z - camPos[2]) > 120) continue;
      const fade = Math.min(1, (d.life - d.age) / 3);
      b[0] = d.x; b[1] = d.y; b[2] = d.z; b[3] = d.size;
      b[4] = d.r; b[5] = d.g; b[6] = d.b; b[7] = d.a * fade;
      b[8] = d.nx; b[9] = d.ny; b[10] = d.nz; b[11] = d.stretch;
      b[12] = 3; b[13] = d.rot; b[14] = 0; b[15] = 0;
      this.alpha.addRaw(b);
    }
  }
}
