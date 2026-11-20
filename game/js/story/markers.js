// 3D markers: glowing cylinders of light with a floating icon gem, ground ring and a light. Used for mission
// starts, objectives, the safehouse SAVE spot, shops and map waypoints. Triggers callbacks on enter.
import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { InstanceBatch } from '../engine/instancing.js';
import { buildConeMesh } from '../entities/vehicle-model.js';
import { m4, m4fromYPR } from '../core/math.js';
import { groundHeight } from '../world/city-meshes.js';

function beamMesh(gl) {
  const b = new MeshBuilder(); b.style([1, 1, 1], MAT.PLAIN);
  const n = 18;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    const c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
    const i0 = b.vertex(c0[0], 0, c0[1], c0[0], 0, c0[1], 0, 0);
    b.vertex(c1[0], 0, c1[1], c1[0], 0, c1[1], 0, 0);
    b.vertex(c1[0], 1, c1[1], c1[0], 0, c1[1], 0, 1);
    b.vertex(c0[0], 1, c0[1], c0[0], 0, c0[1], 0, 1);
    b.idx.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }
  return b.build(gl, { instanced: true });
}
function ringMesh(gl) {
  const b = new MeshBuilder(); b.style([1, 1, 1], MAT.SIGNAL);
  const n = 28;
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
    b.quad([Math.cos(a0) * 0.85, 0, Math.sin(a0) * 0.85], [Math.cos(a1) * 0.85, 0, Math.sin(a1) * 0.85], [Math.cos(a1), 0, Math.sin(a1)], [Math.cos(a0), 0, Math.sin(a0)]);
  }
  return b.build(gl, { instanced: true });
}
function gemMesh(gl) {
  const b = new MeshBuilder(); b.style([1, 1, 1], MAT.SIGNAL);
  const top = [0, 0.5, 0], bot = [0, -0.5, 0], r = 0.32;
  const ring = [[r, 0, 0], [0, 0, r], [-r, 0, 0], [0, 0, -r]];
  for (let i = 0; i < 4; i++) { const a = ring[i], c = ring[(i + 1) % 4]; b.tri(top, c, a); b.tri(bot, a, c); }
  return b.build(gl, { instanced: true });
}

const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];

export class Markers {
  constructor(game) {
    this.game = game;
    const gl = game.gl;
    this.beams = new InstanceBatch(beamMesh(gl), { castShadow: false });
    this.spots = new InstanceBatch(buildConeMesh(gl), { castShadow: false });
    this.rings = new InstanceBatch(ringMesh(gl), { castShadow: false });
    this.gems = new InstanceBatch(gemMesh(gl), { castShadow: false });
    this.cones = [this.beams, this.spots];
    this.list = [];
    this.M = m4();
    this.time = 0;
    this.setupPermanent();
  }
  add(o) {
    const m = { radius: 2.5, color: '#ffd166', height: 9, inside: false, enabled: true, needFoot: false, needCar: false, ...o };
    m.rgb = hex(m.color);
    m.y = groundHeight(m.x, m.z);
    this.list.push(m);
    return m;
  }
  remove(m) { const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1); }
  setupPermanent() {
    const g = this.game, L = g.world.landmarks;
    this.add({ x: L.respray.x, z: L.respray.z, color: '#4dffd2', radius: 3.5, needCar: true, label: 'Kilat Respray', onEnter: () => g.respray() });
    this.add({ x: L.guns.x, z: L.guns.z, color: '#ff9f43', radius: 1.8, needFoot: true, label: 'Bang Bang Arms', onEnter: () => g.openShop() });
    this.save = this.add({ x: L.safehouse.save.x, z: L.safehouse.save.z, color: '#7dff9a', radius: 1.6, needFoot: true, label: 'Save', enabled: false, onEnter: () => g.saveGame() });
  }
  update(dt) {
    this.time += dt;
    const g = this.game, p = g.player;
    const inCar = p.state === 'driving', pos = inCar ? p.vehicle : p;
    for (const m of this.list.slice()) {
      if (!m.enabled) { m.inside = false; continue; }
      const d = Math.hypot(pos.x - m.x, pos.z - m.z);
      const okMode = (!m.needFoot || p.state === 'foot') && (!m.needCar || inCar);
      const inside = d < m.radius + (inCar ? 1.5 : 0) && okMode && p.alive && !g.overlay;
      if (inside && !m.inside && m.onEnter) m.onEnter(m);
      m.inside = inside;
    }
  }
  reset() { this.beams.reset(); this.spots.reset(); this.rings.reset(); this.gems.reset(); }
  render() {
    const M = this.M, t = this.time;
    for (const m of this.list) {
      if (!m.enabled) continue;
      const pulse = 0.75 + 0.25 * Math.sin(t * 3 + m.x);
      const [r, gg, b] = m.rgb;
      m4fromYPR(M, m.x, m.y + 0.05, m.z, 0, 0, 0, m.radius, m.height, m.radius);
      this.beams.add(M, r, gg, b, 0.55 * pulse);
      m4fromYPR(M, m.x, m.y + 0.06, m.z, t * 0.6, 0, 0, m.radius, 1, m.radius);
      this.rings.add(M, r, gg, b, 3 * pulse);
      m4fromYPR(M, m.x, m.y + 2.6 + Math.sin(t * 2 + m.z) * 0.25, m.z, t * 1.8, 0, 0, 1.1, 1.1, 1.1);
      this.gems.add(M, r, gg, b, 4);
    }
    const wp = this.game.gps.waypoint;
    if (wp) { m4fromYPR(M, wp[0], 0, wp[1], 0, 0, 0, 1.2, 120, 1.2); this.beams.add(M, 0.85, 0.48, 1, 0.8); }
  }
  collectLights(out, cam) {
    for (const m of this.list) {
      if (!m.enabled || Math.abs(m.x - cam[0]) > 90 || Math.abs(m.z - cam[2]) > 90) continue;
      out.push({ x: m.x, y: m.y + 1.5, z: m.z, radius: 9, r: m.rgb[0], g: m.rgb[1], b: m.rgb[2], intensity: 1.8, priority: 1 });
    }
  }
  batches() { return [this.rings, this.gems]; }
}
