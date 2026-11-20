// Instanced street props: trees, palms, streetlights (breakable), traffic-light poles and their signal heads,
// plus the glowing Orchid tags. Static instances are written once; signal heads update every frame.
import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { InstanceBatch } from '../engine/instancing.js';
import { m4, m4fromYPR } from '../core/math.js';
import { ROAD_HALF, BLOCK } from './city.js';
import { groundHeight } from './city-meshes.js';
import { tagUV } from './signs.js';

function treeMesh(gl) {
  const b = new MeshBuilder();
  b.style([0.36, 0.25, 0.16], MAT.WOOD).cylinder(0, 0, 0, 0.22, 0.15, 3.2, 7);
  b.style([0.2, 0.42, 0.16], MAT.FOLIAGE);
  b.sphere(0, 4.2, 0, 2.1, 1.8, 2.1, 9, 6);
  b.sphere(0.9, 3.6, 0.5, 1.4, 1.2, 1.4, 8, 5);
  b.sphere(-0.8, 3.8, -0.6, 1.5, 1.3, 1.5, 8, 5);
  b.sphere(0.2, 5.3, -0.2, 1.3, 1.1, 1.3, 8, 5);
  return b.build(gl, { instanced: true });
}
function coneTreeMesh(gl) {
  const b = new MeshBuilder();
  b.style([0.36, 0.25, 0.16], MAT.WOOD).cylinder(0, 0, 0, 0.2, 0.14, 2, 7);
  b.style([0.12, 0.34, 0.18], MAT.FOLIAGE).cylinder(0, 1.5, 0, 2.0, 0.6, 2.6, 9).cylinder(0, 3.5, 0, 1.5, 0.1, 3.4, 9);
  return b.build(gl, { instanced: true });
}
function palmMesh(gl) {
  const b = new MeshBuilder();
  b.style([0.5, 0.38, 0.26], MAT.WOOD);
  // curved, segmented trunk
  let x = 0, y = 0;
  for (let k = 0; k < 6; k++) { b.cylinder(x, y, 0, 0.24 - k * 0.02, 0.22 - k * 0.02, 1.35, 7); y += 1.3; x += 0.08 * k; }
  b.style([0.2, 0.5, 0.18], MAT.FOLIAGE);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.pushTRS(x, y, 0, a, 0, 0);
    // a frond: drooping flattened leaf made of two quads
    b.quad([-0.35, 0.1, 0.2], [0.35, 0.1, 0.2], [0.25, 0.25, 2.2], [-0.25, 0.25, 2.2]);
    b.quad([-0.25, 0.25, 2.2], [0.25, 0.25, 2.2], [0.05, -0.9, 3.8], [-0.05, -0.9, 3.8]);
    b.quad([0.35, 0.08, 0.2], [-0.35, 0.08, 0.2], [-0.25, 0.23, 2.2], [0.25, 0.23, 2.2]);
    b.quad([0.25, 0.23, 2.2], [-0.25, 0.23, 2.2], [-0.05, -0.92, 3.8], [0.05, -0.92, 3.8]);
    b.pop();
  }
  b.style([0.35, 0.25, 0.12], MAT.WOOD).sphere(x, y - 0.1, 0, 0.35);
  return b.build(gl, { instanced: true });
}
function lampMesh(gl) {
  const b = new MeshBuilder();
  b.style([0.3, 0.32, 0.35], MAT.METAL).cylinder(0, 0, 0, 0.12, 0.08, 7.5, 8);
  b.cylinder(0, 0, 0, 0.2, 0.2, 0.5, 8);
  // arm reaching over the road (+z local) and the lamp head
  b.box(0, 7.3, 1.0, 0.1, 0.1, 2.2);
  b.style([0.25, 0.26, 0.28], MAT.METAL).bevelBox(0, 7.1, 2.1, 0.5, 0.25, 0.9, 0.08);
  b.style([1, 0.9, 0.7], MAT.LAMP).box(0, 7.06, 2.1, 0.4, 0.05, 0.75);
  return b.build(gl, { instanced: true });
}
function signalPoleMesh(gl) {
  const b = new MeshBuilder();
  b.style([0.2, 0.21, 0.23], MAT.METAL).cylinder(0, 0, 0, 0.12, 0.1, 5.8, 8);
  b.box(0, 5.5, 1.6, 0.1, 0.12, 3.4);
  b.style([0.1, 0.1, 0.1], MAT.PLAIN).bevelBox(0, 4.4, 3.0, 0.42, 1.3, 0.35, 0.05);
  b.bevelBox(0, 1.9, 0.0, 0.32, 0.9, 0.3, 0.04);
  return b.build(gl, { instanced: true });
}
function signalLampMesh(gl) {
  const b = new MeshBuilder();
  b.style([1, 1, 1], MAT.SIGNAL).sphere(0, 0, 0, 0.13, 0.13, 0.06, 8, 5);
  return b.build(gl, { instanced: true });
}
function tagMesh(gl) {
  const b = new MeshBuilder();
  const uv = tagUV();
  b.style([1, 1, 1], MAT.SIGN, 2.5);
  const t = [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]];
  b.quad([-0.8, 0, 0], [0.8, 0, 0], [0.8, 1.6, 0], [-0.8, 1.6, 0], t);
  b.quad([0.8, 0, 0], [-0.8, 0, 0], [-0.8, 1.6, 0], [0.8, 1.6, 0], t);
  return b.build(gl, { instanced: true });
}

export class StreetProps {
  constructor(gl, city, roads, collision) {
    this.city = city; this.roads = roads; this.col = collision;
    const M = m4();
    this.trees = new InstanceBatch(treeMesh(gl), { name: 'trees' });
    this.cones = new InstanceBatch(coneTreeMesh(gl), { name: 'conetrees' });
    this.palms = new InstanceBatch(palmMesh(gl), { name: 'palms' });
    this.lamps = new InstanceBatch(lampMesh(gl), { name: 'lamps' });
    this.poles = new InstanceBatch(signalPoleMesh(gl), { name: 'signalpoles' });
    this.signalLamps = new InstanceBatch(signalLampMesh(gl), { name: 'signals', castShadow: false });
    this.tags = new InstanceBatch(tagMesh(gl), { name: 'tags', castShadow: false });
    // static instances are kept here and copied into the batches by distance (see cull())
    this.statics = { trees: [], cones: [], palms: [], poles: [] };
    const keep = (list, x, z, yaw, s) => list.push({ x, z, m: Float32Array.from(m4fromYPR(M, x, groundHeight(x, z), z, yaw, 0, 0, s, s, s)) });
    for (const t of city.trees) {
      const yaw = (t.x * 13.7 + t.z) % 6.28;
      keep(t.kind === 'palm' ? this.statics.palms : t.kind === 'cone' ? this.statics.cones : this.statics.trees, t.x, t.z, yaw, t.s);
      collision.addCircle(t.x, t.z, 0.35 * t.s, 6, 'tree');
    }
    for (const p of city.palms) {
      keep(this.statics.palms, p.x, p.z, (p.x * 7.3) % 6.28, p.s);
      collision.addCircle(p.x, p.z, 0.3, 8, 'tree');
    }
    this.cullT = 0; this.cullPos = [1e9, 0, 1e9];
    // streetlights: breakable poles; we keep the instance index to hide them when knocked over
    this.lampList = [];
    const pierLamps = (city.pierLamps || []).map((p) => ({ x: p.x, z: p.z, yaw: 0, pier: true }));
    for (const l of [...city.lamps, ...pierLamps]) {
      const y = groundHeight(l.x, l.z);
      const lamp = { x: l.x, z: l.z, y, yaw: l.yaw, alive: true, fall: 0, fallYaw: 0 };
      lamp.head = [l.x + Math.sin(l.yaw) * 2.1, y + 7.0, l.z + Math.cos(l.yaw) * 2.1];
      lamp.collider = collision.addCircle(l.x, l.z, 0.15, 7.5, 'lamp', lamp);
      this.lampList.push(lamp);
    }
    // traffic-light poles: one per approach, on the left kerb before the junction (left-hand traffic)
    this.heads = [];
    for (const n of roads.nodes) {
      if (!n.hasLight) continue;
      for (const e of n.edges) {
        const m = roads.nodes[e];
        // traffic arriving at n from m travels in direction d = (n - m)
        const dx = Math.sign(n.x - m.x), dz = Math.sign(n.z - m.z);
        const lx = dz, lz = -dx; // left of travel
        const px = n.x - dx * (ROAD_HALF + 1.2) + lx * (ROAD_HALF + 0.7), pz = n.z - dz * (ROAD_HALF + 1.2) + lz * (ROAD_HALF + 0.7);
        const yaw = Math.atan2(-lx, -lz); // arm reaches over the lane (toward -left)
        this.statics.poles.push({ x: px, z: pz, m: Float32Array.from(m4fromYPR(M, px, 0.15, pz, yaw)) });
        collision.addCircle(px, pz, 0.15, 6, 'signal');
        // signal head faces oncoming traffic (-d); lamps arranged vertically at the arm end
        const hx = px - lx * 3.0, hz = pz - lz * 3.0;
        const faceYaw = Math.atan2(-dx, -dz);
        this.heads.push({ node: n, axis: dx !== 0 ? 'ew' : 'ns', x: hx - dx * 0.2, z: hz - dz * 0.2, yaw: faceYaw, low: { x: px - dx * 0.18, z: pz - dz * 0.18 } });
      }
    }
    this.tagList = city.tags.map((t) => ({ ...t, collected: false }));
    this.time = 0;
  }

  cull(camPos, force = false) {
    const moved = Math.hypot(camPos[0] - this.cullPos[0], camPos[2] - this.cullPos[2]);
    if (!force && moved < 25) return;
    this.cullPos = camPos.slice();
    const fill = (batch, list, R) => {
      batch.reset();
      for (const it of list) if (Math.abs(it.x - camPos[0]) < R && Math.abs(it.z - camPos[2]) < R) batch.add(it.m, 1, 1, 1, 1);
    };
    const R = this.drawRadius || 300;
    fill(this.trees, this.statics.trees, R); fill(this.cones, this.statics.cones, R); fill(this.palms, this.statics.palms, R);
    fill(this.poles, this.statics.poles, R * 0.7);
    this.rebuildLamps();
  }
  rebuildLamps() {
    const M = m4();
    this.lamps.reset();
    const c = this.cullPos, R = (this.drawRadius || 300) * 0.8;
    for (const l of this.lampList) {
      if (Math.abs(l.x - c[0]) > R || Math.abs(l.z - c[2]) > R) continue;
      if (l.alive) this.lamps.add(m4fromYPR(M, l.x, l.y, l.z, l.yaw), 1, 1, 1, 1);
      else this.lamps.add(m4fromYPR(M, l.x, l.y, l.z, l.fallYaw, Math.min(l.fall, 1) * 1.45, 0), 1, 1, 1, 1);
    }
  }
  knockLamp(lamp, dirX, dirZ) {
    if (!lamp.alive) return;
    lamp.alive = false; lamp.collider.alive = false;
    lamp.fallYaw = Math.atan2(dirX, dirZ);
    lamp.fall = 0.01;
    this.rebuildLamps();
  }

  update(dt, camPos, night) {
    this.time += dt;
    this.cull(camPos);
    let falling = false;
    for (const l of this.lampList) if (!l.alive && l.fall < 1) { l.fall = Math.min(1, l.fall + dt * 2.2); falling = true; }
    if (falling) this.rebuildLamps();
    // signal heads near the camera
    const M = m4();
    this.signalLamps.reset();
    const cols = { red: [1, 0.08, 0.05], yellow: [1, 0.6, 0.05], green: [0.1, 1, 0.35] };
    for (const h of this.heads) {
      if (Math.abs(h.x - camPos[0]) > 220 || Math.abs(h.z - camPos[2]) > 220) continue;
      const s = this.roads.signal(h.node, h.axis);
      const lamps = ['red', 'yellow', 'green'];
      for (let k = 0; k < 3; k++) {
        const on = lamps[k] === s;
        const c = cols[lamps[k]];
        const inten = on ? 6 : 0.04;
        const fx = Math.sin(h.yaw) * 0.2, fz = Math.cos(h.yaw) * 0.2;
        this.signalLamps.add(m4fromYPR(M, h.x + fx, 5.5 - k * 0.4, h.z + fz, h.yaw), c[0], c[1], c[2], inten);
        this.signalLamps.add(m4fromYPR(M, h.low.x + fx * 0.8, 2.55 - k * 0.28, h.low.z + fz * 0.8, h.yaw, 0, 0, 0.75, 0.75, 0.75), c[0], c[1], c[2], inten);
      }
    }
    this.tags.reset();
    for (const t of this.tagList) {
      if (t.collected) continue;
      const bob = Math.sin(this.time * 2 + t.id) * 0.15;
      m4fromYPR(M, t.x, groundHeight(t.x, t.z) + 0.6 + bob, t.z, this.time * 1.5 + t.id);
      this.tags.add(M, 1, 1, 1, 1);
    }
  }

  // Lights for the renderer (streetlamps at night).
  collectLights(out, camPos, night) {
    if (night < 0.2) return;
    for (const l of this.lampList) {
      if (!l.alive) continue;
      const dx = l.head[0] - camPos[0], dz = l.head[2] - camPos[2];
      if (dx * dx + dz * dz > 160 * 160) continue;
      out.push({ x: l.head[0], y: l.head[1] - 0.3, z: l.head[2], radius: 22, r: 1.0, g: 0.78, b: 0.5, intensity: 1.5 * night, dir: [0, -1, 0], cos: 0.35 });
    }
    for (const t of this.tagList) {
      if (t.collected) continue;
      const dx = t.x - camPos[0], dz = t.z - camPos[2];
      if (dx * dx + dz * dz > 80 * 80) continue;
      out.push({ x: t.x, y: 1.4, z: t.z, radius: 7, r: 0.9, g: 0.3, b: 1.0, intensity: 2.0 });
    }
  }

  batches() { return [this.trees, this.cones, this.palms, this.lamps, this.poles, this.signalLamps, this.tags]; }
}
