// Road graph: intersections on the 90 m grid, lane geometry (traffic drives on the LEFT),
// traffic-light phases and A* routing for police, GPS and autopilot.
import { BLOCK, GRID, ROAD_HALF } from './city.js';

export const LANE_OFFSET = 2.6; // distance from the centerline to the middle of a lane
export const LIGHT_CYCLE = 22; // seconds: NS green 9, yellow 2, EW green 9, yellow 2

export class RoadGraph {
  constructor() {
    this.nodes = [];
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        this.nodes.push({ id: j * (GRID + 1) + i, i, j, x: i * BLOCK, z: j * BLOCK, edges: [], offset: ((i * 7 + j * 13) % 11) * 2 });
      }
    }
    for (const n of this.nodes) {
      const add = (di, dj) => { const m = this.node(n.i + di, n.j + dj); if (m) n.edges.push(m.id); };
      add(1, 0); add(-1, 0); add(0, 1); add(0, -1);
      n.hasLight = n.edges.length >= 3;
    }
    this.time = 0;
  }
  node(i, j) { if (i < 0 || j < 0 || i > GRID || j > GRID) return null; return this.nodes[j * (GRID + 1) + i]; }
  nearestNode(x, z) {
    const i = Math.max(0, Math.min(GRID, Math.round(x / BLOCK))), j = Math.max(0, Math.min(GRID, Math.round(z / BLOCK)));
    return this.node(i, j);
  }
  update(dt) { this.time += dt; }

  // Signal for traffic travelling along an axis ('ns' moves along z, 'ew' along x): 'green' | 'yellow' | 'red'.
  signal(node, axis) {
    if (!node.hasLight) return 'green';
    const t = (this.time + node.offset) % LIGHT_CYCLE;
    const ns = t < 9 ? 'green' : t < 11 ? 'yellow' : 'red';
    const ew = t < 11 ? 'red' : t < 20 ? 'green' : t < 22 ? 'yellow' : 'red';
    return axis === 'ns' ? ns : ew;
  }
  // Pedestrians may cross a road when the cars on it are red.
  pedestrianCanCross(node, roadAxis) { return this.signal(node, roadAxis) === 'red'; }

  // Lane point: on the edge a->b, position t in [0,1], left-hand traffic offset.
  laneStart(a, b) { const d = dirOf(a, b); const l = leftOf(d); return [a.x + l[0] * LANE_OFFSET + d[0] * (ROAD_HALF + 4), a.z + l[1] * LANE_OFFSET + d[1] * (ROAD_HALF + 4)]; }
  laneEnd(a, b) { const d = dirOf(a, b); const l = leftOf(d); return [b.x + l[0] * LANE_OFFSET - d[0] * (ROAD_HALF + 4), b.z + l[1] * LANE_OFFSET - d[1] * (ROAD_HALF + 4)]; }

  // A* over the grid; returns a list of node ids.
  findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const N = this.nodes, goal = N[toId];
    const open = new Map([[fromId, 0]]);
    const g = new Map([[fromId, 0]]), came = new Map();
    const h = (n) => Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z);
    while (open.size) {
      let best = null, bf = Infinity;
      for (const [id, f] of open) if (f < bf) { bf = f; best = id; }
      if (best === toId) break;
      open.delete(best);
      const n = N[best];
      for (const e of n.edges) {
        const m = N[e];
        const cost = g.get(best) + BLOCK;
        if (cost < (g.get(e) ?? Infinity)) { g.set(e, cost); came.set(e, best); open.set(e, cost + h(m)); }
      }
    }
    const path = [toId];
    let c = toId;
    while (came.has(c)) { c = came.get(c); path.push(c); }
    path.reverse();
    return path[0] === fromId ? path : [fromId, toId];
  }

  // Route as world-space points (lane centers through intersections) from a position to a target position.
  routePoints(x, z, tx, tz) {
    const a = this.nearestNode(x, z), b = this.nearestNode(tx, tz);
    const ids = this.findPath(a.id, b.id);
    const pts = [[x, z]];
    for (const id of ids) pts.push([this.nodes[id].x, this.nodes[id].z]);
    pts.push([tx, tz]);
    return pts;
  }
}

export const dirOf = (a, b) => { const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
// Left of travel direction (x east, z south): heading east (+x) -> north (-z).
export const leftOf = (d) => [d[1], -d[0]];
export const axisOf = (a, b) => (a.x === b.x ? 'ns' : 'ew');

// Nearest point on any road centerline to (x,z), with the road axis.
export function nearestRoad(x, z) {
  const rx = Math.round(x / BLOCK) * BLOCK, rz = Math.round(z / BLOCK) * BLOCK;
  const dx = Math.abs(x - rx), dz = Math.abs(z - rz);
  if (dx < dz) return { x: rx, z: Math.max(0, Math.min(GRID * BLOCK, z)), axis: 'ns', dist: dx };
  return { x: Math.max(0, Math.min(GRID * BLOCK, x)), z: rz, axis: 'ew', dist: dz };
}
export function onRoad(x, z) {
  const r = nearestRoad(x, z);
  return r.dist < ROAD_HALF && x > -ROAD_HALF && z > -ROAD_HALF && x < GRID * BLOCK + ROAD_HALF && z < GRID * BLOCK + ROAD_HALF;
}
