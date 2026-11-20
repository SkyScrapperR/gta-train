// Turns city data into merged static chunk meshes (one per 2x2 blocks) and registers colliders.
// Ground, roads + markings, sidewalks, buildings with shopfronts/roofs/signs, and static props.
import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { BLOCK, GRID, ROAD_HALF, LAND, BEACH, FERRY_PIER, EAST_PIER, CITY_SIZE, BILLBOARDS } from './city.js';
import { signUV, billboardUV, tagUV } from './signs.js';
import { mulberry32 } from '../core/math.js';

const CHUNK = BLOCK * 2;
const SIDE_N = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const SW_Y = 0.15; // sidewalk height

export function groundHeight(x, z) {
  if (z > BEACH.z0 + 8 && x > BEACH.x0 && x < BEACH.x1) {
    if (x >= FERRY_PIER.x0 && x <= FERRY_PIER.x1 && z <= FERRY_PIER.z1) return SW_Y + 0.5;
    return SW_Y - (z - (BEACH.z0 + 8)) * 0.02;
  }
  for (const p of [FERRY_PIER, EAST_PIER]) if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) return SW_Y + 0.5;
  // roads are at 0, everything else in the city (sidewalks, lots) is raised
  const rx = Math.abs(x - Math.round(x / BLOCK) * BLOCK), rz = Math.abs(z - Math.round(z / BLOCK) * BLOCK);
  if ((rx < ROAD_HALF && z > -ROAD_HALF && z < CITY_SIZE + ROAD_HALF) || (rz < ROAD_HALF && x > -ROAD_HALF && x < CITY_SIZE + ROAD_HALF)) return 0;
  return SW_Y;
}

export class CityMeshBuilder {
  constructor(city, collision) {
    this.city = city;
    this.col = collision;
    this.builders = new Map();
    this.rnd = mulberry32(99);
  }
  b(x, z) {
    const key = `${Math.floor((x + CHUNK) / CHUNK)},${Math.floor((z + CHUNK) / CHUNK)}`;
    let b = this.builders.get(key);
    if (!b) { b = new MeshBuilder(); this.builders.set(key, b); }
    return b;
  }

  // A vertical quad facing outward normal n=[nx,nz], centered on (cx,cz), spanning width w and y0..y1.
  faceQuad(b, cx, cz, n, w, y0, y1, uv = null) {
    const R = [n[1], -n[0]];
    const ax = cx - R[0] * w / 2, az = cz - R[1] * w / 2, bx = cx + R[0] * w / 2, bz = cz + R[1] * w / 2;
    const u = uv ? [[uv[0], uv[3]], [uv[2], uv[3]], [uv[2], uv[1]], [uv[0], uv[1]]] : null;
    b.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], u);
  }
  hquad(b, x0, z0, x1, z1, y) { b.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [[x0, z1], [x1, z1], [x1, z0], [x0, z0]]); }

  buildAll(onProgress) {
    const steps = [
      () => this.buildGround(), () => this.buildMarkings(), () => this.buildBuildings(0), () => this.buildBuildings(1),
      () => this.buildProps(), () => this.buildCoast(),
    ];
    steps.forEach((s, i) => { s(); onProgress && onProgress((i + 1) / steps.length); });
  }

  finish(gl) {
    const chunks = [];
    for (const b of this.builders.values()) {
      if (!b.idx.length) continue;
      const mesh = b.build(gl);
      chunks.push({ mesh, min: mesh.bounds.min, max: mesh.bounds.max });
    }
    return chunks;
  }

  // ------------------------------------------------------------ ground
  buildGround() {
    const N = GRID;
    // intersections + road segments (asphalt)
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = i * BLOCK, z = j * BLOCK;
      const b = this.b(x, z).style([0.16, 0.16, 0.17], MAT.ASPHALT);
      this.hquad(b, x - ROAD_HALF, z - ROAD_HALF, x + ROAD_HALF, z + ROAD_HALF, 0);
      if (i < N) { const bb = this.b(x + BLOCK / 2, z).style([0.16, 0.16, 0.17], MAT.ASPHALT); this.hquad(bb, x + ROAD_HALF, z - ROAD_HALF, x + BLOCK - ROAD_HALF, z + ROAD_HALF, 0); }
      if (j < N) { const bb = this.b(x, z + BLOCK / 2).style([0.16, 0.16, 0.17], MAT.ASPHALT); this.hquad(bb, x - ROAD_HALF, z + ROAD_HALF, x + ROAD_HALF, z + BLOCK - ROAD_HALF, 0); }
    }
    // block slabs: sidewalk ring (concrete) + lot surface by district
    for (const blk of this.city.blocks) {
      const x0 = blk.bx * BLOCK + ROAD_HALF, z0 = blk.bz * BLOCK + ROAD_HALF, x1 = (blk.bx + 1) * BLOCK - ROAD_HALF, z1 = (blk.bz + 1) * BLOCK - ROAD_HALF;
      const b = this.b(blk.cx, blk.cz);
      // curb (lighter concrete) and sidewalk top
      b.style([0.62, 0.6, 0.57], MAT.CONCRETE).boxMinMax(x0, -0.2, z0, x1, SW_Y, z1, 1 | 2);
      b.style([0.55, 0.54, 0.52], MAT.CONCRETE);
      this.hquad(b, x0, z0, x1, z1, SW_Y);
      const lot = { kotalama: [[0.5, 0.5, 0.52], MAT.CONCRETE], kemuning: [[0.5, 0.47, 0.44], MAT.CONCRETE], bukitasri: [[0.28, 0.42, 0.2], MAT.GRASS], docks: [[0.42, 0.42, 0.42], MAT.CONCRETE], pantai: [[0.78, 0.7, 0.52], MAT.SAND], park: [[0.26, 0.45, 0.2], MAT.GRASS] }[blk.district];
      b.style(lot[0], lot[1]);
      this.hquad(b, blk.x0, blk.z0, blk.x1, blk.z1, SW_Y + 0.01);
      // manholes (dark discs) on the road in front of the block
      if ((blk.bx + blk.bz) % 3 === 0) { b.style([0.07, 0.07, 0.08], MAT.METAL).cylinder(blk.cx + 12, 0.005, blk.bz * BLOCK - 1.5, 0.6, 0.6, 0.02, 10); }
    }
    // outer land margin around the grid (seafront promenade)
    const m = (x0, z0, x1, z1) => {
      for (let x = x0; x < x1; x += CHUNK) for (let z = z0; z < z1; z += CHUNK) {
        const xe = Math.min(x1, x + CHUNK), ze = Math.min(z1, z + CHUNK);
        const b = this.b((x + xe) / 2, (z + ze) / 2).style([0.56, 0.55, 0.52], MAT.CONCRETE);
        this.hquad(b, x, z, xe, ze, SW_Y);
      }
    };
    m(LAND.x0, LAND.z0, LAND.x1, -ROAD_HALF);
    m(LAND.x0, -ROAD_HALF, -ROAD_HALF, CITY_SIZE + ROAD_HALF);
    m(CITY_SIZE + ROAD_HALF, -ROAD_HALF, LAND.x1, CITY_SIZE + ROAD_HALF);
    // sea walls (vertical faces down into the water) on north, west and east edges
    const wall = (x0, z0, x1, z1, n) => {
      for (let t = 0; t < 1; t += 0.1) {
        const ax = x0 + (x1 - x0) * t, az = z0 + (z1 - z0) * t, bx = x0 + (x1 - x0) * (t + 0.1), bz = z0 + (z1 - z0) * (t + 0.1);
        const b = this.b((ax + bx) / 2, (az + bz) / 2).style([0.45, 0.43, 0.4], MAT.CONCRETE);
        this.faceQuad(b, (ax + bx) / 2, (az + bz) / 2, n, Math.hypot(bx - ax, bz - az), -4, SW_Y);
      }
    };
    wall(LAND.x0, LAND.z0, LAND.x1, LAND.z0, [0, -1]);
    wall(LAND.x0, LAND.z0, LAND.x0, BEACH.z0 + 8, [-1, 0]);
    wall(LAND.x1, LAND.z0, LAND.x1, BEACH.z0 + 8, [1, 0]);
    // seafront railings
    for (let x = LAND.x0; x < LAND.x1; x += 3) this.b(x, LAND.z0).style([0.75, 0.75, 0.78], MAT.CHROME).box(x, SW_Y, LAND.z0 + 0.4, 0.08, 1.1, 0.08);
    this.b(450, LAND.z0).style([0.75, 0.75, 0.78], MAT.CHROME).box((LAND.x0 + LAND.x1) / 2, SW_Y + 1.0, LAND.z0 + 0.4, LAND.x1 - LAND.x0, 0.08, 0.08);
  }

  buildMarkings() {
    const N = GRID, Y = 0.012;
    const white = [0.85, 0.85, 0.82], yellow = [0.95, 0.75, 0.15];
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = i * BLOCK, z = j * BLOCK;
      for (const axis of ['ew', 'ns']) {
        if (axis === 'ew' && i >= N) continue;
        if (axis === 'ns' && j >= N) continue;
        const b = this.b(axis === 'ew' ? x + BLOCK / 2 : x, axis === 'ew' ? z : z + BLOCK / 2);
        const s0 = ROAD_HALF + 5, s1 = BLOCK - ROAD_HALF - 5;
        const seg = (a0, a1, off, w) => {
          if (axis === 'ew') this.hquad(b, x + a0, z + off - w / 2, x + a1, z + off + w / 2, Y);
          else this.hquad(b, x + off - w / 2, z + a0, x + off + w / 2, z + a1, Y);
        };
        // dashed white centerline
        b.style(white, MAT.MARKING);
        for (let a = s0; a < s1; a += 6) seg(a, Math.min(a + 3, s1), 0, 0.15);
        // edge lines
        b.style(white, MAT.MARKING);
        seg(ROAD_HALF, BLOCK - ROAD_HALF, ROAD_HALF - 0.45, 0.12);
        seg(ROAD_HALF, BLOCK - ROAD_HALF, -ROAD_HALF + 0.45, 0.12);
        // zebra crossings at both ends + stop lines (left-hand traffic: the arriving lane is on the left)
        for (const end of [0, 1]) {
          const a0 = end ? BLOCK - ROAD_HALF - 4.2 : ROAD_HALF + 0.6;
          b.style(white, MAT.MARKING);
          for (let k = -ROAD_HALF + 0.8; k < ROAD_HALF - 0.6; k += 1.0) seg(a0, a0 + 3.4, k + 0.25, 0.5);
          const stopA = end ? BLOCK - ROAD_HALF - 4.8 : ROAD_HALF + 4.3;
          if (axis === 'ew') this.hquad(b, x + stopA, z + (end ? -ROAD_HALF + 0.6 : 0.1), x + stopA + 0.4, z + (end ? -0.1 : ROAD_HALF - 0.6), Y);
          else this.hquad(b, x + (end ? 0.1 : -ROAD_HALF + 0.6), z + stopA, x + (end ? ROAD_HALF - 0.6 : -0.1), z + stopA + 0.4, Y);
        }
        // yellow no-parking strips near docks
        if (i >= 8 && axis === 'ew') { b.style(yellow, MAT.MARKING); seg(ROAD_HALF + 6, BLOCK - ROAD_HALF - 6, -ROAD_HALF + 0.9, 0.1); }
      }
    }
  }

  // ------------------------------------------------------------ buildings
  buildBuildings(pass) {
    const list = this.city.buildings;
    const half = Math.ceil(list.length / 2);
    const slice = pass === 0 ? list.slice(0, half) : list.slice(half);
    for (const bld of slice) this.building(bld);
    if (pass === 1) for (const bb of this.city.billboards) this.billboard(bb);
  }

  building(bld) {
    const mat = { glass: MAT.WALL_GLASS, punched: MAT.WALL_PUNCHED, house: MAT.WALL_HOUSE, metal: MAT.METAL }[bld.mat];
    const p0 = bld.parts[0];
    const b = this.b((p0.x0 + p0.x1) / 2, (p0.z0 + p0.z1) / 2);
    let top = null;
    for (const p of bld.parts) {
      b.style(bld.color, mat, bld.seed);
      b.boxMinMax(p.x0, p.y0, p.z0, p.x1, p.y1, p.z1, 1 | 2);
      // roof slab with parapet
      if (bld.roof !== 'pitched') {
        b.style([0.36, 0.36, 0.37], MAT.CONCRETE);
        this.hquad(b, p.x0, p.z0, p.x1, p.z1, p.y1);
        if (p.x1 - p.x0 > 8 && bld.mat !== 'metal') {
          b.style(bld.mat === 'glass' ? [0.3, 0.3, 0.32] : bld.color.map((c) => c * 0.85), MAT.PLAIN);
          const t = 0.35, ph = 0.9;
          b.boxMinMax(p.x0, p.y1, p.z0, p.x1, p.y1 + ph, p.z0 + t, 1);
          b.boxMinMax(p.x0, p.y1, p.z1 - t, p.x1, p.y1 + ph, p.z1, 1);
          b.boxMinMax(p.x0, p.y1, p.z0 + t, p.x0 + t, p.y1 + ph, p.z1 - t, 1);
          b.boxMinMax(p.x1 - t, p.y1, p.z0 + t, p.x1, p.y1 + ph, p.z1 - t, 1);
        }
      }
      // floor bands for punched facades
      if (bld.mat === 'glass' && p.y1 - p.y0 > 20) {
        b.style(bld.color.map((c) => c * 0.4 + 0.15), MAT.PLAIN);
        for (let y = p.y0 + 3.6 * 4; y < p.y1 - 2; y += 3.6 * 8) b.boxMinMax(p.x0 - 0.15, y, p.z0 - 0.15, p.x1 + 0.15, y + 0.5, p.z1 + 0.15, 0);
      }
      this.col.addBox(p.x0, p.z0, p.x1, p.z1, p.y0, p.y1 + (bld.roof === 'pitched' ? 3 : 1), 'building');
      if (!top || p.y1 > top.y1) top = p;
    }
    if (bld.balconies) this.balconies(b, bld, p0);
    if (bld.shopfronts) for (const sf of bld.shopfronts) this.shopfront(b, p0, sf, bld);
    if (bld.signText !== undefined) this.landmarkSign(b, bld, p0);
    if (bld.bigDoor) this.bigDoor(b, p0, bld.bigDoor);
    if (bld.columns) this.columns(b, p0, bld.columns);
    if (bld.redCross) this.redCross(b, p0);
    if (bld.awningAll) for (const s of ['n', 's', 'e', 'w']) this.shopfront(b, p0, { side: s, sign: 24, awning: true }, bld);
    this.roof(b, bld, top);
  }

  faceInfo(p, side) {
    const n = SIDE_N[side];
    const along = side === 'n' || side === 's' ? p.x1 - p.x0 : p.z1 - p.z0;
    const cx = side === 'w' ? p.x0 : side === 'e' ? p.x1 : (p.x0 + p.x1) / 2;
    const cz = side === 'n' ? p.z0 : side === 's' ? p.z1 : (p.z0 + p.z1) / 2;
    return { n, along, cx, cz, R: [n[1], -n[0]] };
  }

  shopfront(b, p, sf, bld) {
    const f = this.faceInfo(p, sf.side);
    const units = Math.max(1, Math.floor(f.along / 9));
    const uw = f.along / units;
    for (let u = 0; u < units; u++) {
      const off = -f.along / 2 + uw * (u + 0.5);
      const cx = f.cx + f.R[0] * off + f.n[0] * 0.06, cz = f.cz + f.R[1] * off + f.n[1] * 0.06;
      b.style([0.2, 0.2, 0.2], MAT.SHOPFRONT, bld.seed + u);
      this.faceQuad(b, cx, cz, f.n, uw - 1.2, SW_Y + 0.3, 3.3);
      // door frame / pilasters
      b.style(bld.color.map((c) => c * 0.6), MAT.PLAIN);
      const px = f.cx + f.R[0] * (off - uw / 2), pz = f.cz + f.R[1] * (off - uw / 2);
      b.box(px + f.n[0] * 0.2, SW_Y, pz + f.n[1] * 0.2, 0.6, 3.6, 0.6);
      // awning (sloped, colored)
      if (sf.awning) {
        const colors = [[0.85, 0.2, 0.2], [0.15, 0.55, 0.5], [0.95, 0.7, 0.15], [0.35, 0.3, 0.7], [0.9, 0.45, 0.6], [0.2, 0.45, 0.8]];
        b.style(colors[(sf.sign + u) % colors.length], MAT.CLOTH === 1 ? MAT.PLAIN : MAT.PLAIN);
        const ax = cx - f.R[0] * (uw - 1.4) / 2, az = cz - f.R[1] * (uw - 1.4) / 2;
        const bx = cx + f.R[0] * (uw - 1.4) / 2, bz = cz + f.R[1] * (uw - 1.4) / 2;
        const o = 1.6;
        b.quad([ax + f.n[0] * o, 3.0, az + f.n[1] * o], [bx + f.n[0] * o, 3.0, bz + f.n[1] * o], [bx, 3.7, bz], [ax, 3.7, az]);
        b.quad([ax, 3.68, az], [bx, 3.68, bz], [bx + f.n[0] * o, 2.98, bz + f.n[1] * o], [ax + f.n[0] * o, 2.98, az + f.n[1] * o]);
        b.style(colors[(sf.sign + u) % colors.length].map((c) => c * 0.7), MAT.PLAIN);
        this.faceQuad(b, cx + f.n[0] * o, cz + f.n[1] * o, f.n, uw - 1.4, 2.7, 3.0);
      }
      // sign
      b.style([1, 1, 1], MAT.SIGN, 1.0);
      const sw = Math.min(uw - 2, 6.5);
      this.faceQuad(b, cx + f.n[0] * 0.08, cz + f.n[1] * 0.08, f.n, sw, 3.85, 3.85 + sw / 4, signUV((sf.sign + u * 3) % 24));
    }
  }

  landmarkSign(b, bld, p) {
    const lm = this.city.landmarks[bld.landmark];
    const side = lm ? this.sideOfEntry(lm) : 'n';
    const f = this.faceInfo(p, side);
    const w = Math.min(f.along - 4, 16);
    const y = Math.min(p.y1 - 1.5 - w / 4, 6);
    b.style([0.1, 0.1, 0.1], MAT.PLAIN);
    this.faceQuad(b, f.cx + f.n[0] * 0.1, f.cz + f.n[1] * 0.1, f.n, w + 0.6, y - 0.3, y + w / 4 + 0.3);
    b.style([1, 1, 1], MAT.SIGN, 1.6);
    this.faceQuad(b, f.cx + f.n[0] * 0.18, f.cz + f.n[1] * 0.18, f.n, w, y, y + w / 4, signUV(bld.signIndex));
  }
  sideOfEntry(lm) { const d = { [Math.PI]: 'n', 0: 's', [-Math.PI / 2]: 'w', [Math.PI / 2]: 'e' }; return d[lm.entry.yaw] || 'n'; }

  bigDoor(b, p, side) {
    const f = this.faceInfo(p, side);
    b.style([0.25, 0.26, 0.28], MAT.METAL);
    this.faceQuad(b, f.cx + f.n[0] * 0.05, f.cz + f.n[1] * 0.05, f.n, Math.min(10, f.along - 4), SW_Y, 5.2);
    b.style([0.95, 0.75, 0.1], MAT.MARKING);
    this.faceQuad(b, f.cx + f.n[0] * 0.08, f.cz + f.n[1] * 0.08, f.n, Math.min(10.6, f.along - 3.4), 5.2, 5.6);
  }
  columns(b, p, side) {
    const f = this.faceInfo(p, side);
    b.style([0.92, 0.9, 0.85], MAT.PLAIN);
    for (let k = -3; k <= 3; k++) b.cylinder(f.cx + f.R[0] * k * 6 + f.n[0] * 2.2, SW_Y, f.cz + f.R[1] * k * 6 + f.n[1] * 2.2, 0.6, 0.55, 11, 10);
    b.style([0.85, 0.83, 0.78], MAT.PLAIN);
    b.box(f.cx + f.n[0] * 2.2, 11, f.cz + f.n[1] * 2.2, Math.abs(f.R[0]) * 44 + Math.abs(f.n[0]) * 5.5, 1.4, Math.abs(f.R[1]) * 44 + Math.abs(f.n[1]) * 5.5);
  }
  redCross(b, p) {
    for (const side of ['n', 's', 'e', 'w']) {
      const f = this.faceInfo(p, side);
      b.style([1, 0.1, 0.12], MAT.EMISSIVE, 3);
      const cx = f.cx + f.n[0] * 0.15, cz = f.cz + f.n[1] * 0.15, y = p.y1 - 6;
      this.faceQuad(b, cx, cz, f.n, 1.6, y - 2.4, y + 2.4);
      this.faceQuad(b, cx + f.n[0] * 0.01, cz + f.n[1] * 0.01, f.n, 4.8, y - 0.8, y + 0.8);
    }
  }

  balconies(b, bld, p) {
    b.style(bld.color.map((c) => c * 0.9 + 0.08), MAT.PLAIN);
    for (const side of ['n', 's']) {
      const f = this.faceInfo(p, side);
      for (let y = 3.4 * 2; y < p.y1 - 2; y += 3.4) {
        for (let k = -1; k <= 1; k += 2) {
          const off = k * f.along * 0.22;
          const cx = f.cx + f.R[0] * off + f.n[0] * 0.6, cz = f.cz + f.R[1] * off + f.n[1] * 0.6;
          b.style(bld.color.map((c) => c * 0.9 + 0.08), MAT.PLAIN).box(cx, y, cz, Math.abs(f.R[0]) * 4 + Math.abs(f.n[0]) * 1.2, 0.18, Math.abs(f.R[1]) * 4 + Math.abs(f.n[1]) * 1.2);
          b.style([0.2, 0.22, 0.25], MAT.GLASS).box(cx + f.n[0] * 0.55, y + 0.18, cz + f.n[1] * 0.55, Math.abs(f.R[0]) * 4 + Math.abs(f.n[0]) * 0.06, 0.95, Math.abs(f.R[1]) * 4 + Math.abs(f.n[1]) * 0.06);
        }
      }
    }
  }

  roof(b, bld, p) {
    const r = this.rnd;
    const y = p.y1, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0, d = p.z1 - p.z0;
    switch (bld.roof) {
      case 'pitched': {
        b.style(bld.roofColor || [0.55, 0.22, 0.13], MAT.ROOF_TILE);
        const o = 0.6, rh = Math.min(w, d) * 0.35;
        if (bld.ridgeX) {
          b.quad([p.x0 - o, y, p.z1 + o], [p.x1 + o, y, p.z1 + o], [p.x1 + o, y + rh, cz], [p.x0 - o, y + rh, cz]);
          b.quad([p.x1 + o, y, p.z0 - o], [p.x0 - o, y, p.z0 - o], [p.x0 - o, y + rh, cz], [p.x1 + o, y + rh, cz]);
          b.style(bld.color, MAT.PLAIN);
          b.tri([p.x0, y, p.z0], [p.x0, y, p.z1], [p.x0, y + rh, cz]);
          b.tri([p.x1, y, p.z1], [p.x1, y, p.z0], [p.x1, y + rh, cz]);
        } else {
          b.quad([p.x1 + o, y, p.z1 + o], [p.x1 + o, y, p.z0 - o], [cx, y + rh, p.z0 - o], [cx, y + rh, p.z1 + o]);
          b.quad([p.x0 - o, y, p.z0 - o], [p.x0 - o, y, p.z1 + o], [cx, y + rh, p.z1 + o], [cx, y + rh, p.z0 - o]);
          b.style(bld.color, MAT.PLAIN);
          b.tri([p.x1, y, p.z0], [p.x0, y, p.z0], [cx, y + rh, p.z0]);
          b.tri([p.x0, y, p.z1], [p.x1, y, p.z1], [cx, y + rh, p.z1]);
        }
        // chimney
        b.style([0.5, 0.45, 0.42], MAT.PLAIN).box(p.x0 + w * 0.25, y, p.z0 + d * 0.3, 0.7, rh * 0.9, 0.7);
        break;
      }
      case 'warehouse': {
        b.style([0.5, 0.52, 0.55], MAT.METAL);
        const rh = 2.2;
        b.quad([p.x0, y, p.z1], [p.x1, y, p.z1], [p.x1, y + rh, cz], [p.x0, y + rh, cz]);
        b.quad([p.x1, y, p.z0], [p.x0, y, p.z0], [p.x0, y + rh, cz], [p.x1, y + rh, cz]);
        b.style(bld.color, MAT.METAL);
        b.tri([p.x0, y, p.z0], [p.x0, y, p.z1], [p.x0, y + rh, cz]);
        b.tri([p.x1, y, p.z1], [p.x1, y, p.z0], [p.x1, y + rh, cz]);
        // skylights
        b.style([0.6, 0.7, 0.8], MAT.GLASS);
        for (let x = p.x0 + 4; x < p.x1 - 4; x += 8) b.quad([x, y + rh * 0.5 + 0.05, cz + d * 0.25], [x + 3, y + rh * 0.5 + 0.05, cz + d * 0.25], [x + 3, y + rh * 0.8 + 0.05, cz + d * 0.1], [x, y + rh * 0.8 + 0.05, cz + d * 0.1]);
        break;
      }
      case 'ac':
        b.style([0.7, 0.72, 0.74], MAT.METAL);
        for (let k = 0; k < Math.min(8, Math.floor(w * d / 120)); k++) {
          const ax = p.x0 + 2 + r() * (w - 4), az = p.z0 + 2 + r() * (d - 4);
          b.bevelBox(ax, y, az, 2.2, 1.4, 1.6, 0.15);
          b.style([0.2, 0.2, 0.22], MAT.PLAIN).cylinder(ax, y + 1.4, az, 0.55, 0.55, 0.05, 10).style([0.7, 0.72, 0.74], MAT.METAL);
        }
        b.style([0.55, 0.55, 0.58], MAT.METAL).box(cx, y, cz, 3, 2.6, 3);
        break;
      case 'tanks':
        for (let k = 0; k < 2; k++) {
          const ax = cx + (k - 0.5) * w * 0.4, az = cz;
          b.style([0.35, 0.3, 0.28], MAT.PLAIN);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(ax + dx, y, az + dz, 0.2, 2.5, 0.2);
          b.style([0.55, 0.4, 0.3], MAT.WOOD).cylinder(ax, y + 2.5, az, 1.6, 1.6, 2.6, 12);
          b.style([0.3, 0.25, 0.2], MAT.PLAIN).cylinder(ax, y + 5.1, az, 1.6, 0.2, 0.8, 12);
        }
        break;
      case 'antenna':
        b.style([0.6, 0.6, 0.62], MAT.CHROME).cylinder(cx, y, cz, 0.25, 0.08, 18, 6);
        b.style([1, 0.1, 0.1], MAT.EMISSIVE, 6).sphere(cx, y + 18.2, cz, 0.35);
        b.style([0.6, 0.6, 0.62], MAT.CHROME).cylinder(cx + 3, y, cz + 2, 0.12, 0.05, 8, 6);
        b.style([0.85, 0.85, 0.85], MAT.PLAIN).cylinder(cx - 3, y + 1, cz - 2, 1.0, 1.0, 0.25, 12);
        break;
      case 'garden':
        b.style([0.25, 0.45, 0.18], MAT.GRASS);
        this.hquad(b, p.x0 + 1, p.z0 + 1, p.x1 - 1, p.z1 - 1, y + 0.05);
        b.style([0.18, 0.42, 0.16], MAT.FOLIAGE);
        for (let k = 0; k < Math.min(10, w * d / 60); k++) {
          const ax = p.x0 + 2 + r() * (w - 4), az = p.z0 + 2 + r() * (d - 4);
          b.style([0.4, 0.3, 0.2], MAT.WOOD).box(ax, y, az, 1.2, 0.6, 1.2).style([0.18, 0.42, 0.16], MAT.FOLIAGE).sphere(ax, y + 1.3, az, 1.0, 0.9, 1.0, 8, 5);
        }
        break;
      case 'solar':
        b.style([0.08, 0.12, 0.28], MAT.GLASS);
        for (let x = p.x0 + 2; x < p.x1 - 3; x += 3.2) for (let z = p.z0 + 2; z < p.z1 - 2.5; z += 2.6) b.quad([x, y + 0.4, z + 2], [x + 2.8, y + 0.4, z + 2], [x + 2.8, y + 1.2, z], [x, y + 1.2, z]);
        break;
      case 'pool':
        b.style([0.1, 0.55, 0.65], MAT.GLASS).box(cx, y, cz, w * 0.5, 0.3, d * 0.4);
        b.style([0.95, 0.95, 0.9], MAT.PLAIN).box(cx, y, cz, w * 0.5 + 1, 0.25, d * 0.4 + 1);
        break;
      case 'helipad':
        b.style([0.22, 0.22, 0.24], MAT.CONCRETE).cylinder(cx, y, cz, Math.min(w, d) * 0.4, Math.min(w, d) * 0.4, 0.3, 20);
        b.style([0.95, 0.85, 0.1], MAT.MARKING).cylinder(cx, y + 0.31, cz, Math.min(w, d) * 0.33, Math.min(w, d) * 0.33, 0.01, 20);
        b.style([0.22, 0.22, 0.24], MAT.CONCRETE).cylinder(cx, y + 0.32, cz, Math.min(w, d) * 0.3, Math.min(w, d) * 0.3, 0.01, 20);
        b.style([0.95, 0.95, 0.95], MAT.MARKING);
        this.hquad(b, cx - 2.5, cz - 3, cx - 1.6, cz + 3, y + 0.34); this.hquad(b, cx + 1.6, cz - 3, cx + 2.5, cz + 3, y + 0.34); this.hquad(b, cx - 1.6, cz - 0.45, cx + 1.6, cz + 0.45, y + 0.34);
        for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; b.style([0.2, 1, 0.4], MAT.EMISSIVE, 4).box(cx + Math.cos(a) * Math.min(w, d) * 0.4, y + 0.3, cz + Math.sin(a) * Math.min(w, d) * 0.4, 0.3, 0.2, 0.3); }
        break;
      case 'orchid': this.orchidEmblem(b, cx, y, cz); break;
      default: break;
    }
  }

  orchidEmblem(b, cx, y, cz) {
    // spire
    b.style([0.4, 0.2, 0.55], MAT.WALL_GLASS, 7).cylinder(cx, y, cz, 5, 1.5, 14, 8);
    b.style([0.75, 0.75, 0.8], MAT.CHROME).cylinder(cx, y + 14, cz, 0.4, 0.1, 22, 6);
    b.style([1, 0.15, 0.15], MAT.EMISSIVE, 8).sphere(cx, y + 36.2, cz, 0.5);
    // neon orchid flowers on four sides: five petals around a glowing center
    for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const ox = cx + nx * 8.5, oz = cz + nz * 8.5, oy = y - 8;
      const yaw = Math.atan2(nx, nz);
      b.pushTRS(ox, oy, oz, yaw);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + Math.PI / 2;
        b.style(k % 2 ? [1.0, 0.3, 0.85] : [0.7, 0.3, 1.0], MAT.NEON, k);
        b.pushTRS(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0.3, 0, 0, a - Math.PI / 2);
        b.sphere(0, 0, 0, 1.4, 3.0, 0.25, 8, 5);
        b.pop();
      }
      b.style([1.0, 0.85, 0.3], MAT.NEON, 9).sphere(0, 0, 0.5, 1.2, 1.2, 0.4, 8, 5);
      b.pop();
    }
    // glowing crown ring
    b.style([0.8, 0.3, 1.0], MAT.NEON, 3);
    const R = 5.2;
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; b.box(cx + Math.cos(a) * R, y + 13.6, cz + Math.sin(a) * R, 0.6, 0.4, 0.6); }
  }

  billboard(bb) {
    const bld = this.city.buildings[bb.building];
    const p = bld.parts[bld.parts.length - 1];
    const b = this.b(p.x0, p.z0);
    // face toward the nearest road (the face closest to a block edge)
    const blk = this.city.blocks.find((k) => p.x0 >= k.x0 - 1 && p.x1 <= k.x1 + 1 && p.z0 >= k.z0 - 1 && p.z1 <= k.z1 + 1);
    let side = 'n';
    if (blk) {
      const ds = { n: p.z0 - blk.z0, s: blk.z1 - p.z1, w: p.x0 - blk.x0, e: blk.x1 - p.x1 };
      side = Object.entries(ds).sort((a, c) => a[1] - c[1])[0][0];
    }
    const f = this.faceInfo(p, side);
    const w = Math.min(16, f.along - 2), h = w / 2;
    const y = p.y1 + 1.5;
    const cx = f.cx - f.n[0] * 1.5, cz = f.cz - f.n[1] * 1.5;
    b.style([0.25, 0.25, 0.27], MAT.METAL);
    for (const k of [-0.35, 0.35]) b.box(cx + f.R[0] * w * k - f.n[0] * 0.8, p.y1, cz + f.R[1] * w * k - f.n[1] * 0.8, 0.3, h + 1.5, 0.3);
    b.box(cx - f.n[0] * 0.2, y - 0.2, cz - f.n[1] * 0.2, Math.abs(f.R[0]) * (w + 0.6) + Math.abs(f.n[0]) * 0.3, h + 0.4, Math.abs(f.R[1]) * (w + 0.6) + Math.abs(f.n[1]) * 0.3);
    b.style([1, 1, 1], MAT.SIGN, 1.8);
    this.faceQuad(b, cx + f.n[0] * 0.01, cz + f.n[1] * 0.01, f.n, w, y, y + h, billboardUV(bb.brand));
    this.city.billboardLights = this.city.billboardLights || [];
    this.city.billboardLights.push({ x: cx + f.n[0] * 3, y: y + h * 0.5, z: cz + f.n[1] * 3, brand: bb.brand });
  }

  // ------------------------------------------------------------ props merged into chunks
  buildProps() {
    const c = this.city;
    for (const z of c.props) {
      const cx = z.x ?? (z.x0 + z.x1) / 2, cz = z.z ?? (z.z0 + z.z1) / 2;
      const b = this.b(cx, cz);
      switch (z.type) {
        case 'garden': b.style([0.28, 0.46, 0.2], MAT.GRASS); this.hquad(b, z.x0, z.z0, z.x1, z.z1, SW_Y + 0.02); break;
        case 'park': {
          b.style([0.26, 0.45, 0.2], MAT.GRASS); this.hquad(b, z.x0, z.z0, z.x1, z.z1, SW_Y + 0.02);
          b.style([0.62, 0.56, 0.46], MAT.CONCRETE);
          this.hquad(b, z.x0, cz - 1.5, z.x1, cz + 1.5, SW_Y + 0.03); this.hquad(b, cx - 1.5, z.z0, cx + 1.5, z.z1, SW_Y + 0.035);
          break;
        }
        case 'plaza': {
          b.style([0.62, 0.6, 0.58], MAT.CONCRETE); this.hquad(b, z.x0, z.z0, z.x1, z.z1, SW_Y + 0.02);
          b.style([0.7, 0.42, 0.32], MAT.CONCRETE);
          for (let k = 0; k < 6; k++) this.hquad(b, z.x0 + 2 + k * (z.x1 - z.x0 - 4) / 6, z.z0 + 2, z.x0 + 3 + k * (z.x1 - z.x0 - 4) / 6, z.z1 - 2, SW_Y + 0.025);
          break;
        }
        case 'dockyard': {
          b.style([0.95, 0.75, 0.1], MAT.MARKING);
          for (let k = 0; k < 3; k++) { const zz = z.z0 + 32 + k * 9 + 4.5; this.hquad(b, z.x0 + 2, zz, z.x1 - 2, zz + 0.25, SW_Y + 0.03); }
          this.hquad(b, z.x0 + 1, z.z0 + 1, z.x0 + 1.3, z.z1 - 1, SW_Y + 0.03); this.hquad(b, z.x1 - 1.3, z.z0 + 1, z.x1 - 1, z.z1 - 1, SW_Y + 0.03);
          // bollards and chain-link fence posts along the block edge
          b.style([0.95, 0.75, 0.1], MAT.PLAIN);
          for (let x = z.x0 + 3; x < z.x1 - 2; x += 6) b.cylinder(x, SW_Y, z.z1 - 0.8, 0.18, 0.18, 0.9, 8);
          b.style([0.55, 0.57, 0.6], MAT.CHROME);
          for (let zz = z.z0; zz < z.z1; zz += 3) b.box(z.x1 - 0.3, SW_Y, zz, 0.06, 2.4, 0.06);
          b.style([0.4, 0.42, 0.45], MAT.PLAIN).box(z.x1 - 0.3, SW_Y + 2.3, (z.z0 + z.z1) / 2, 0.05, 0.05, z.z1 - z.z0);
          for (let k = 0; k < 4; k++) { // pallets
            const px = z.x0 + 6 + k * 2.2, pz = z.z0 + 31;
            b.style([0.55, 0.42, 0.28], MAT.WOOD).box(px, SW_Y, pz, 1.2, 0.15, 1.0);
          }
          break;
        }
        case 'deck': b.style([0.6, 0.45, 0.32], MAT.WOOD); this.hquad(b, z.x0, z.z0, z.x1, z.z1, SW_Y + 0.03); break;
        case 'barrel':
          b.style([[0.1, 0.35, 0.7], [0.75, 0.2, 0.1], [0.2, 0.5, 0.25]][Math.floor(z.x) % 3], MAT.METAL).cylinder(z.x, SW_Y, z.z, 0.35, 0.35, 0.95, 10);
          this.col.addCircle(z.x, z.z, 0.35, 1, 'barrel');
          break;
        case 'forklift': this.forklift(b, z.x, z.z, z.yaw); this.col.addCircle(z.x, z.z, 1.2, 2, 'forklift'); break;
        case 'tyres': b.style([0.06, 0.06, 0.06], MAT.RUBBER).cylinder(z.x, SW_Y, z.z, 0.45, 0.45, 0.9, 10); break;
        default: break;
      }
    }
    for (const k of c.containers) {
      const b = this.b(k.x, k.z);
      const L = 6.06, W = 2.44, H = 2.59;
      const lx = k.yaw ? W : L, lz = k.yaw ? L : W;
      b.style(k.color, MAT.METAL).boxMinMax(k.x - lx / 2, SW_Y + k.y, k.z - lz / 2, k.x + lx / 2, SW_Y + k.y + H, k.z + lz / 2);
      b.style(k.color.map((v) => v * 0.6), MAT.PLAIN);
      for (const s of [-1, 1]) b.boxMinMax(k.x - lx / 2 - 0.02 + (k.yaw ? 0 : (s > 0 ? lx - 0.2 : 0)), SW_Y + k.y, k.z - lz / 2 - 0.02 + (k.yaw ? (s > 0 ? lz - 0.2 : 0) : 0), k.x - lx / 2 + (k.yaw ? lx + 0.02 : (s > 0 ? lx + 0.02 : 0.2)), SW_Y + k.y + H + 0.02, k.z - lz / 2 + (k.yaw ? (s > 0 ? lz + 0.02 : 0.2) : lz + 0.02));
      this.col.addBox(k.x - lx / 2, k.z - lz / 2, k.x + lx / 2, k.z + lz / 2, k.y, k.y + H + SW_Y, 'container');
    }
    for (const cr of c.cranes) this.crane(cr);
    for (const k of c.crates) {
      const b = this.b(k.x, k.z);
      b.style([0.6, 0.45, 0.28], MAT.WOOD).bevelBox(k.x, SW_Y, k.z, 1.1, 1.0, 1.1, 0.05);
      this.col.addBox(k.x - 0.55, k.z - 0.55, k.x + 0.55, k.z + 0.55, 0, 1.15, 'crate');
    }
    for (const bn of c.benches) {
      const b = this.b(bn.x, bn.z);
      b.pushTRS(bn.x, SW_Y, bn.z, bn.yaw);
      b.style([0.55, 0.38, 0.22], MAT.WOOD).box(0, 0.45, 0, 1.8, 0.08, 0.5).box(0, 0.5, -0.24, 1.8, 0.45, 0.06);
      b.style([0.2, 0.2, 0.22], MAT.METAL).box(-0.8, 0, 0, 0.08, 0.45, 0.45).box(0.8, 0, 0, 0.08, 0.45, 0.45);
      b.pop();
    }
    for (const bin of c.bins) this.b(bin.x, bin.z).style([0.18, 0.4, 0.3], MAT.METAL).cylinder(bin.x, SW_Y, bin.z, 0.3, 0.33, 0.95, 10);
    for (const h of c.hydrants) {
      this.b(h.x, h.z).style([0.85, 0.15, 0.12], MAT.PLAIN).cylinder(h.x, SW_Y, h.z, 0.15, 0.13, 0.7, 8).sphere(h.x, SW_Y + 0.72, h.z, 0.15);
      this.col.addCircle(h.x, h.z, 0.2, 0.8, 'hydrant');
    }
    for (const s of c.busStops) {
      const b = this.b(s.x, s.z);
      b.pushTRS(s.x, SW_Y, s.z, s.yaw);
      b.style([0.6, 0.62, 0.65], MAT.CHROME).box(-1.9, 0, 0.7, 0.1, 2.6, 0.1).box(1.9, 0, 0.7, 0.1, 2.6, 0.1);
      b.style([0.15, 0.55, 0.55], MAT.PLAIN).box(0, 2.6, 0, 4.2, 0.12, 1.8);
      b.style([0.3, 0.35, 0.4], MAT.GLASS).box(0, 0.2, 0.8, 3.8, 2.3, 0.05);
      b.style([1, 1, 1], MAT.SIGN, 1.4);
      b.quad([1.9, 0.6, 0.76], [0.3, 0.6, 0.76], [0.3, 2.2, 0.76], [1.9, 2.2, 0.76], [[0.75, 1024 / 2048 + 0.12], [0.5, 1024 / 2048 + 0.12], [0.5, 1024 / 2048], [0.75, 1024 / 2048]]);
      b.style([0.5, 0.35, 0.22], MAT.WOOD).box(0, 0.45, 0.5, 3, 0.08, 0.4);
      b.pop();
    }
    for (const f of c.fences) {
      const b = this.b((f.x0 + f.x1) / 2, (f.z0 + f.z1) / 2).style([0.92, 0.9, 0.85], MAT.PLAIN);
      const h = 0.9, t = 0.12;
      const gap = 3; // gate gap on the street side (south)
      const mx = (f.x0 + f.x1) / 2;
      b.boxMinMax(f.x0, SW_Y, f.z0, f.x1, SW_Y + h, f.z0 + t);
      b.boxMinMax(f.x0, SW_Y, f.z1 - t, mx - gap, SW_Y + h, f.z1); b.boxMinMax(mx + gap, SW_Y, f.z1 - t, f.x1, SW_Y + h, f.z1);
      b.boxMinMax(f.x0, SW_Y, f.z0, f.x0 + t, SW_Y + h, f.z1); b.boxMinMax(f.x1 - t, SW_Y, f.z0, f.x1, SW_Y + h, f.z1);
    }
    for (const p of c.pools) {
      const b = this.b((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
      b.style([0.92, 0.92, 0.9], MAT.CONCRETE).boxMinMax(p.x0 - 0.8, SW_Y, p.z0 - 0.8, p.x1 + 0.8, SW_Y + 0.12, p.z1 + 0.8, 1);
      b.style([0.15, 0.62, 0.75], MAT.EMISSIVE, 0.25); this.hquad(b, p.x0, p.z0, p.x1, p.z1, SW_Y + 0.14);
      b.style([0.05, 0.4, 0.55], MAT.GLASS); this.hquad(b, p.x0, p.z0, p.x1, p.z1, SW_Y + 0.15);
    }
    for (const p of c.ponds) {
      const b = this.b(p.x, p.z);
      b.style([0.5, 0.48, 0.44], MAT.CONCRETE).cylinder(p.x, SW_Y, p.z, 1, 1, 0.25, 18, { sx: p.rx + 0.8, sz: p.rz + 0.8 });
      b.style([0.04, 0.2, 0.22], MAT.GLASS).cylinder(p.x, SW_Y, p.z, 1, 1, 0.27, 18, { sx: p.rx, sz: p.rz });
    }
    for (const fo of c.fountains) {
      const b = this.b(fo.x, fo.z);
      b.style([0.75, 0.73, 0.7], MAT.CONCRETE).cylinder(fo.x, SW_Y, fo.z, fo.r, fo.r, 0.6, 20);
      b.style([0.1, 0.45, 0.55], MAT.GLASS).cylinder(fo.x, SW_Y, fo.z, fo.r - 0.4, fo.r - 0.4, 0.62, 20);
      b.style([0.75, 0.73, 0.7], MAT.CONCRETE).cylinder(fo.x, SW_Y, fo.z, 0.8, 0.5, 2.6, 10).cylinder(fo.x, SW_Y + 2.6, fo.z, 2, 1.6, 0.3, 14);
      b.style([0.6, 0.9, 1.0], MAT.EMISSIVE, 0.6).cylinder(fo.x, SW_Y + 2.9, fo.z, 0.25, 0.05, 1.6, 8);
      this.col.addCircle(fo.x, fo.z, fo.r, 0.7, 'fountain');
    }
    for (const u of c.umbrellas) {
      const b = this.b(u.x, u.z);
      const y = groundHeight(u.x, u.z);
      b.style([0.9, 0.9, 0.9], MAT.PLAIN).cylinder(u.x, y, u.z, 0.05, 0.05, 2.3, 6);
      b.style(u.color, MAT.PLAIN).cylinder(u.x, y + 2.0, u.z, 1.4, 0.05, 0.5, 8);
      if (!u.small) b.style([0.95, 0.95, 0.92], MAT.PLAIN).box(u.x + 1.2, y, u.z, 0.7, 0.3, 1.8);
    }
    // graffiti tags are dynamic (pickups) — see world props.
  }

  forklift(b, x, z, yaw) {
    b.pushTRS(x, SW_Y, z, yaw);
    b.style([0.95, 0.7, 0.1], MAT.PLAIN).bevelBox(0, 0.3, 0, 1.2, 1.0, 2.0, 0.1);
    b.style([0.15, 0.15, 0.15], MAT.METAL).box(0, 1.3, -0.2, 1.1, 0.08, 1.2).box(-0.5, 1.3, -0.7, 0.06, 1.0, 0.06).box(0.5, 1.3, -0.7, 0.06, 1.0, 0.06);
    b.box(0, 0, 1.15, 1.0, 2.6, 0.12).box(-0.3, 0.1, 1.7, 0.12, 0.06, 1.0).box(0.3, 0.1, 1.7, 0.12, 0.06, 1.0);
    b.style([0.05, 0.05, 0.05], MAT.RUBBER).cylinderX(0, 0.3, -0.6, 0.3, 1.3, 10).cylinderX(0, 0.3, 0.6, 0.3, 1.3, 10);
    b.pop();
  }

  crane(cr) {
    const b = this.b(cr.x, cr.z);
    const H = 34, span = 18;
    b.pushTRS(cr.x, SW_Y, cr.z, cr.yaw);
    b.style([0.9, 0.42, 0.12], MAT.METAL);
    for (const sx of [-span / 2, span / 2]) for (const sz of [-5, 5]) b.box(sx, 0, sz, 1, H, 1);
    for (const sx of [-span / 2, span / 2]) { b.box(sx, H - 2, 0, 1.2, 1.2, 11); b.box(sx, 8, 0, 0.6, 0.6, 10); }
    b.box(0, H, 0, span + 2, 2, 3); // main beam
    b.box(0, H, 18, 3, 1.6, 34); // boom over the water side
    b.box(0, H, -8, 3, 1.6, 12);
    b.style([0.3, 0.3, 0.32], MAT.METAL).box(0, H + 2, -10, 4, 3, 4); // counterweight house
    b.style([0.85, 0.85, 0.82], MAT.PLAIN).box(0, H - 3, 6, 2.4, 2.6, 2.4); // cab
    b.style([0.1, 0.1, 0.12], MAT.GLASS).box(0, H - 2.6, 6, 2.42, 1.4, 2.42);
    b.style([1, 0.1, 0.1], MAT.EMISSIVE, 6).sphere(0, H + 2.4, 34, 0.35).sphere(0, H + 5.2, -10, 0.35);
    b.style([1, 0.85, 0.5], MAT.EMISSIVE, 4).box(0, H - 0.3, 20, 1.2, 0.3, 1.2);
    b.style([0.2, 0.2, 0.2], MAT.CHROME).box(0, H - 14, 22, 0.08, 14, 0.08);
    b.style([0.95, 0.75, 0.1], MAT.METAL).box(0, H - 15, 22, 2.4, 0.8, 1.4);
    b.pop();
    const c = Math.cos(cr.yaw), s = Math.sin(cr.yaw);
    for (const sx of [-span / 2, span / 2]) for (const sz of [-5, 5]) this.col.addCircle(cr.x + sx * c + sz * s, cr.z - sx * s + sz * c, 0.8, H, 'crane');
    this.city.craneLights = this.city.craneLights || [];
    this.city.craneLights.push({ x: cr.x + 20 * s, y: H - 1, z: cr.z + 20 * c });
  }

  // ------------------------------------------------------------ coast: beach, boardwalk, piers, boats
  buildCoast() {
    const Z0 = BEACH.z0 + 8;
    // promenade between the last road and the boardwalk
    for (let x = BEACH.x0; x < BEACH.x1; x += 30) {
      const b = this.b(x + 15, CITY_SIZE + 20);
      b.style([0.56, 0.55, 0.52], MAT.CONCRETE); this.hquad(b, x, CITY_SIZE + ROAD_HALF, x + 30, BEACH.z0, SW_Y);
      b.style([0.58, 0.44, 0.3], MAT.WOOD); this.hquad(b, x, BEACH.z0, x + 30, Z0, SW_Y + 0.06);
      b.style([0.5, 0.36, 0.24], MAT.WOOD).box(x + 15, SW_Y, Z0 - 0.1, 30, 0.9, 0.08).box(x + 0.1, SW_Y, Z0 - 0.1, 0.12, 1.0, 0.12);
      // sloping sand
      b.style([0.86, 0.76, 0.56], MAT.SAND);
      const steps = 8;
      for (let k = 0; k < steps; k++) {
        const za = Z0 + (k * (BEACH.z1 - Z0)) / steps, zb = Z0 + ((k + 1) * (BEACH.z1 - Z0)) / steps;
        b.quad([x, groundHeight(x, zb), zb], [x + 30, groundHeight(x, zb), zb], [x + 30, groundHeight(x, za), za], [x, groundHeight(x, za), za]);
      }
      b.style([0.86, 0.76, 0.56], MAT.SAND);
    }
    // ends of the beach (sand flanks into the water)
    for (const x of [BEACH.x0, BEACH.x1]) {
      const b = this.b(x, BEACH.z0 + 40);
      b.style([0.78, 0.68, 0.5], MAT.SAND);
      this.faceQuad(b, x, (BEACH.z0 + BEACH.z1) / 2, [x === BEACH.x0 ? -1 : 1, 0], BEACH.z1 - BEACH.z0, -3, SW_Y);
    }
    this.pier(FERRY_PIER, 'z');
    this.pier(EAST_PIER, 'x');
    for (const boat of this.city.boats) this.boat(boat);
  }

  pier(p, axis) {
    const y = SW_Y + 0.5;
    const len = axis === 'z' ? p.z1 - p.z0 : p.x1 - p.x0;
    for (let s = 0; s < len; s += 20) {
      const a = s, e = Math.min(len, s + 20);
      const x0 = axis === 'z' ? p.x0 : p.x0 + a, x1 = axis === 'z' ? p.x1 : p.x0 + e;
      const z0 = axis === 'z' ? p.z0 + a : p.z0, z1 = axis === 'z' ? p.z0 + e : p.z1;
      const b = this.b((x0 + x1) / 2, (z0 + z1) / 2);
      b.style([0.55, 0.42, 0.3], MAT.WOOD).boxMinMax(x0, y - 0.3, z0, x1, y, z1, 1);
      b.style([0.3, 0.24, 0.18], MAT.WOOD);
      for (let k = 0; k < (e - a); k += 5) {
        const px = axis === 'z' ? [x0 + 0.4, x1 - 0.4] : [x0 + k, x0 + k];
        const pz = axis === 'z' ? [z0 + k, z0 + k] : [z0 + 0.4, z1 - 0.4];
        for (let q = 0; q < 2; q++) b.cylinder(px[q], -3, pz[q], 0.25, 0.25, y + 1.0, 6);
      }
      // rails
      b.style([0.45, 0.35, 0.25], MAT.WOOD);
      if (axis === 'z') { b.box(x0 + 0.2, y + 0.9, (z0 + z1) / 2, 0.1, 0.1, z1 - z0); b.box(x1 - 0.2, y + 0.9, (z0 + z1) / 2, 0.1, 0.1, z1 - z0); }
      else { b.box((x0 + x1) / 2, y + 0.9, z0 + 0.2, x1 - x0, 0.1, 0.1); b.box((x0 + x1) / 2, y + 0.9, z1 - 0.2, x1 - x0, 0.1, 0.1); }
    }
    // ramp from ground to the deck
    this.city.pierLamps = this.city.pierLamps || [];
    for (let s = 10; s < len; s += 25) this.city.pierLamps.push(axis === 'z' ? { x: p.x0 + 0.5, z: p.z0 + s } : { x: p.x0 + s, z: p.z0 + 0.5 });
  }

  boat(bt) {
    const b = this.b(bt.x, bt.z);
    const dims = { ferry: [9, 30, 3.5], yacht: [5, 16, 2.4], speed: [2.4, 7, 1.2], fishing: [3.4, 10, 1.8] }[bt.kind];
    const [w, l, h] = dims;
    b.pushTRS(bt.x, -0.6, bt.z, bt.yaw);
    const hull = bt.kind === 'ferry' ? [0.9, 0.92, 0.95] : bt.kind === 'yacht' ? [0.12, 0.12, 0.14] : bt.kind === 'speed' ? [0.9, 0.2, 0.25] : [0.2, 0.45, 0.6];
    b.style(hull, MAT.CARPAINT === 2 ? MAT.PLAIN : MAT.PLAIN);
    b.loft([
      { z: -l / 2, y0: 0.2, y1: h, w0: w * 0.7, w1: w * 0.95 },
      { z: l * 0.2, y0: -0.2, y1: h, w0: w * 0.8, w1: w },
      { z: l / 2, y0: h * 0.6, y1: h + 0.3, w0: 0.1, w1: 0.3 },
    ]);
    b.style([0.92, 0.92, 0.9], MAT.PLAIN);
    if (bt.kind === 'ferry') {
      b.box(0, h, -3, w * 0.85, 3, l * 0.55).style([0.1, 0.12, 0.15], MAT.GLASS).box(0, h + 1.2, -3, w * 0.87, 1.2, l * 0.5);
      b.style([0.92, 0.92, 0.9], MAT.PLAIN).box(0, h + 3, -6, w * 0.6, 2.2, 6).style([0.1, 0.5, 0.5], MAT.PLAIN).box(0, h + 5.2, -9, 1.4, 3, 1.4);
    } else if (bt.kind === 'yacht') {
      b.box(0, h, -1, w * 0.75, 1.8, l * 0.5).style([0.05, 0.05, 0.08], MAT.GLASS).box(0, h + 0.6, -0.5, w * 0.77, 0.8, l * 0.45);
      b.style([0.92, 0.92, 0.9], MAT.PLAIN).box(0, h + 1.8, -2, w * 0.5, 1.2, l * 0.25);
      b.style([0.8, 0.3, 1.0], MAT.NEON, 2).box(0, h + 0.05, 0, w * 0.96, 0.08, l * 0.8);
    } else if (bt.kind === 'fishing') {
      b.box(0, h, -l * 0.25, w * 0.7, 2, 2.5).style([0.1, 0.12, 0.15], MAT.GLASS).box(0, h + 1, -l * 0.25, w * 0.72, 0.7, 2.3);
      b.style([0.5, 0.5, 0.52], MAT.CHROME).cylinder(0, h, l * 0.15, 0.08, 0.06, 5, 6);
    } else {
      b.style([0.1, 0.1, 0.12], MAT.GLASS).box(0, h, 0, w * 0.8, 0.6, 1.2);
    }
    b.pop();
  }
}
