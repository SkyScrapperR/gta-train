// Collision world: a uniform spatial grid holding 3D AABBs (buildings, walls, containers) and circles
// (poles, trees, hydrants). Provides circle push-out, 3D raycasts and line-of-sight tests.
import { LAND, BEACH, FERRY_PIER, EAST_PIER, CITY_SIZE } from './city.js';

const CELL = 24;
const ORIGIN = -200;
const DIM = Math.ceil((CITY_SIZE + 600) / CELL);

export class CollisionWorld {
  constructor() {
    this.cells = new Array(DIM * DIM);
    this.boxes = [];
    this.circles = [];
    this.stamp = 0;
  }
  cellRange(x0, z0, x1, z1) {
    const c = (v) => Math.max(0, Math.min(DIM - 1, Math.floor((v - ORIGIN) / CELL)));
    return [c(x0), c(z0), c(x1), c(z1)];
  }
  insert(obj, x0, z0, x1, z1) {
    const [a, b, c, d] = this.cellRange(x0, z0, x1, z1);
    for (let j = b; j <= d; j++) for (let i = a; i <= c; i++) {
      const k = j * DIM + i;
      (this.cells[k] || (this.cells[k] = [])).push(obj);
    }
  }
  addBox(x0, z0, x1, z1, y0 = 0, y1 = 100, tag = 'building') {
    const b = { kind: 'box', x0, z0, x1, z1, y0, y1, tag, _s: 0 };
    this.boxes.push(b);
    this.insert(b, x0, z0, x1, z1);
    return b;
  }
  addCircle(x, z, r, h = 4, tag = 'pole', data = null) {
    const c = { kind: 'circle', x, z, r, h, tag, data, alive: true, _s: 0, x0: x - r, z0: z - r, x1: x + r, z1: z + r, y0: 0, y1: h };
    this.circles.push(c);
    this.insert(c, x - r, z - r, x + r, z + r);
    return c;
  }
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const [a, b, c, d] = this.cellRange(x0, z0, x1, z1);
    for (let j = b; j <= d; j++) for (let i = a; i <= c; i++) {
      const cell = this.cells[j * DIM + i];
      if (!cell) continue;
      for (const o of cell) { if (o._s === s) continue; o._s = s; out.push(o); }
    }
    return out;
  }

  // Push a circle (x,z,r) out of obstacles overlapping height band [y, y+h]. Returns {x,z,hit,nx,nz,obj}.
  resolveCircle(x, z, r, y = 0, h = 1.8, ignoreCircles = false) {
    const res = { x, z, hit: false, nx: 0, nz: 0, obj: null };
    const list = this.query(x - r - 1, z - r - 1, x + r + 1, z + r + 1, this._tmp || (this._tmp = []));
    for (let iter = 0; iter < 2; iter++) {
      for (const o of list) {
        if (o.y1 < y + 0.3 || o.y0 > y + h) continue;
        if (o.kind === 'box') {
          const cx = Math.max(o.x0, Math.min(res.x, o.x1)), cz = Math.max(o.z0, Math.min(res.z, o.z1));
          let dx = res.x - cx, dz = res.z - cz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 < 1e-8) { // center inside the box: push out along the shortest axis
            const pl = res.x - o.x0, pr = o.x1 - res.x, pt = res.z - o.z0, pb = o.z1 - res.z;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) { res.x = o.x0 - r; dx = -1; dz = 0; } else if (m === pr) { res.x = o.x1 + r; dx = 1; dz = 0; }
            else if (m === pt) { res.z = o.z0 - r; dx = 0; dz = -1; } else { res.z = o.z1 + r; dx = 0; dz = 1; }
            res.nx = dx; res.nz = dz;
          } else {
            const d = Math.sqrt(d2), push = r - d;
            res.x += (dx / d) * push; res.z += (dz / d) * push;
            res.nx = dx / d; res.nz = dz / d;
          }
          res.hit = true; res.obj = o;
        } else if (!ignoreCircles && o.alive) {
          const dx = res.x - o.x, dz = res.z - o.z, rr = r + o.r;
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-8) continue;
          const d = Math.sqrt(d2);
          res.x += (dx / d) * (rr - d); res.z += (dz / d) * (rr - d);
          res.nx = dx / d; res.nz = dz / d; res.hit = true; res.obj = o;
        }
      }
    }
    return res;
  }

  // 3D ray against boxes, live circles (as vertical cylinders) and the ground. Returns {t, point, normal, obj} or null.
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 300, { ground = true, circles = true } = {}) {
    let best = null;
    let bestT = maxDist;
    if (ground && dy < -1e-6) { const t = -oy / dy; if (t > 0 && t < bestT) { bestT = t; best = { t, normal: [0, 1, 0], obj: null, ground: true }; } }
    // Walk the grid cells the ray crosses (2D DDA).
    let cx = Math.floor((ox - ORIGIN) / CELL), cz = Math.floor((oz - ORIGIN) / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity, tDZ = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    let tMX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL + ORIGIN - ox : ox - (cx * CELL + ORIGIN)) / Math.abs(dx)) : Infinity;
    let tMZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL + ORIGIN - oz : oz - (cz * CELL + ORIGIN)) / Math.abs(dz)) : Infinity;
    const s = ++this.stamp;
    let tCell = 0;
    for (let guard = 0; guard < 200 && tCell <= bestT; guard++) {
      if (cx >= 0 && cz >= 0 && cx < DIM && cz < DIM) {
        const cell = this.cells[cz * DIM + cx];
        if (cell) for (const o of cell) {
          if (o._s === s) continue; o._s = s;
          if (o.kind === 'box') {
            const hit = rayBox(ox, oy, oz, dx, dy, dz, o);
            if (hit && hit.t < bestT) { bestT = hit.t; best = { t: hit.t, normal: hit.n, obj: o }; }
          } else if (circles && o.alive) {
            const t = rayCylinder(ox, oz, dx, dz, o.x, o.z, o.r);
            if (t !== null && t < bestT) { const y = oy + dy * t; if (y >= 0 && y <= o.h) { bestT = t; best = { t, normal: [(ox + dx * t - o.x) / o.r, 0, (oz + dz * t - o.z) / o.r], obj: o }; } }
          }
        }
      } else if (tCell > 0) break;
      if (tMX < tMZ) { tCell = tMX; tMX += tDX; cx += stepX; } else { tCell = tMZ; tMZ += tDZ; cz += stepZ; }
    }
    if (best) best.point = [ox + dx * best.t, oy + dy * best.t, oz + dz * best.t];
    return best;
  }

  lineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, { ground: false, circles: false });
    return !hit;
  }

  // Walkable/drivable region: the city slab, the beach (not too deep) and the piers.
  inBounds(x, z) {
    if (x >= LAND.x0 && x <= LAND.x1 && z >= LAND.z0 && z <= LAND.z1) return true;
    if (x >= BEACH.x0 && x <= BEACH.x1 && z >= BEACH.z0 - 1 && z <= BEACH.z0 + 48) return true;
    for (const p of [FERRY_PIER, EAST_PIER]) if (x >= p.x0 && x <= p.x1 && z >= p.z0 - 10 && z <= p.z1) return true;
    if (x >= EAST_PIER.x0 - 12 && x <= EAST_PIER.x0 + 2 && z >= EAST_PIER.z0 && z <= EAST_PIER.z1) return true;
    return false;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity, n = null;
  const axes = [[ox, dx, b.x0, b.x1, 0], [oy, dy, b.y0, b.y1, 1], [oz, dz, b.z0, b.z1, 2]];
  for (const [o, d, lo, hi, ax] of axes) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
    if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[ax] = d > 0 ? -1 : 1; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (!n) return null; // origin inside
  return { t: tmin, n };
}

function rayCylinder(ox, oz, dx, dz, cx, cz, r) {
  const fx = ox - cx, fz = oz - cz;
  const a = dx * dx + dz * dz; if (a < 1e-9) return null;
  const b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t > 0 ? t : null;
}
