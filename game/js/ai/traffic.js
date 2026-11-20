// Traffic AI: cars follow left-hand lanes along the road graph, turn through intersections on curved
// paths, obey traffic lights, brake for anything ahead, honk/back out when stuck, and break deadlocks.
// Also spawns/despawns traffic in a ring around the player.
import { LANE_OFFSET, dirOf, leftOf, axisOf } from '../world/roads.js';
import { ROAD_HALF } from '../world/city.js';
import { clamp, wrapAngle, mulberry32 } from '../core/math.js';
import { Character } from '../entities/character.js';
import { randomLook } from '../entities/character-model.js';

const MODELS = [['merpati', 30], ['kancil', 24], ['taxi', 14], ['bajak', 11], ['bison', 6], ['vesper', 4], ['police', 7]];
const rndModel = (r) => { let t = r() * 86; for (const [m, w] of MODELS) { if ((t -= w) <= 0) return m; } return 'merpati'; };

// Steering helper shared by all AI drivers: returns controls to drive toward (tx,tz) at a target speed.
export function steerToward(v, tx, tz, targetSpeed, aggressive = false) {
  const dx = tx - v.x, dz = tz - v.z;
  const want = Math.atan2(dx, dz);
  const err = wrapAngle(want - v.yaw);
  const fs = v.forwardSpeed;
  let steer = clamp(-err * 2.4, -1, 1);
  let throttle = clamp((targetSpeed - fs) * 0.45, -1, 1);
  // sharp angle: slow down to make the turn
  if (Math.abs(err) > 0.9 && fs > 8) throttle = Math.min(throttle, -0.4);
  if (Math.abs(err) > 2.2 && !aggressive) { throttle = -0.6; steer = -steer; }
  return { throttle, steer, handbrake: aggressive && Math.abs(err) > 1.0 && fs > 14 };
}

export class TrafficAI {
  constructor(sys, v, a, b) {
    this.sys = sys; this.v = v;
    this.a = a; this.b = b;
    this.c = this.chooseNext(b, a);
    this.cruise = 11 + sys.rnd() * 4;
    this.controls = { throttle: 0, steer: 0, handbrake: false };
    this.stuckT = 0; this.reverseT = 0; this.ghostT = 0; this.honkT = 0;
    this.panic = 0;
    this.build(true);
  }
  chooseNext(b, from) {
    const opts = b.edges.filter((e) => e !== from.id);
    const pick = opts.length ? opts[Math.floor(this.sys.rnd() * opts.length)] : from.id;
    return this.sys.roads.nodes[pick];
  }
  lanePts(a, b) {
    const s = this.sys.roads.laneStart(a, b), e = this.sys.roads.laneEnd(a, b);
    const n = Math.max(2, Math.ceil(Math.hypot(e[0] - s[0], e[1] - s[1]) / 5));
    const out = [];
    for (let i = 0; i <= n; i++) out.push([s[0] + (e[0] - s[0]) * i / n, s[1] + (e[1] - s[1]) * i / n]);
    return out;
  }
  turnPts(a, b, c) {
    const p0 = this.sys.roads.laneEnd(a, b), p2 = this.sys.roads.laneStart(b, c);
    const d1 = dirOf(a, b), d2 = dirOf(b, c);
    let ctrl;
    if (Math.abs(d1[0] * d2[0] + d1[1] * d2[1]) > 0.9) ctrl = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    else {
      // intersection of the two lane lines
      const l1 = leftOf(d1), l2 = leftOf(d2);
      ctrl = [b.x + l1[0] * LANE_OFFSET + l2[0] * LANE_OFFSET, b.z + l1[1] * LANE_OFFSET + l2[1] * LANE_OFFSET];
    }
    const out = [];
    for (let i = 1; i < 6; i++) {
      const t = i / 6, u = 1 - t;
      out.push([u * u * p0[0] + 2 * u * t * ctrl[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * ctrl[1] + t * t * p2[1]]);
    }
    return out;
  }
  build(fromStart = false) {
    const lane = this.lanePts(this.a, this.b);
    this.laneEndIndex = lane.length - 1;
    const turn = this.turnPts(this.a, this.b, this.c);
    this.nextStart = lane.length + turn.length;
    this.pts = lane.concat(turn, this.lanePts(this.b, this.c));
    this.axis = axisOf(this.a, this.b);
    // nearest point index ahead of the car
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.pts.length; i++) { const d = Math.hypot(this.pts[i][0] - this.v.x, this.pts[i][1] - this.v.z); if (d < bd) { bd = d; best = i; } }
    this.i = fromStart ? 0 : best;
  }
  update(dt) {
    const v = this.v, sys = this.sys;
    // advance along the path
    while (this.i < this.pts.length - 1) {
      const p = this.pts[this.i];
      const f = v.fwd;
      const along = (p[0] - v.x) * f[0] + (p[1] - v.z) * f[1];
      if (Math.hypot(p[0] - v.x, p[1] - v.z) < 4.5 || along < 0) this.i++; else break;
    }
    if (this.i >= this.nextStart) { this.a = this.b; this.b = this.c; this.c = this.chooseNext(this.b, this.a); this.build(); }
    const tgt = this.pts[Math.min(this.i + 1, this.pts.length - 1)];
    let maxSpeed = this.cruise * (this.i > this.laneEndIndex && this.i < this.nextStart ? 0.6 : 1);
    if (this.panic > 0) { this.panic -= dt; maxSpeed *= 1.6; }
    // traffic lights: stop at the stop line before the junction
    if (this.i <= this.laneEndIndex && this.panic <= 0) {
      const sig = sys.roads.signal(this.b, this.axis);
      const sp = this.pts[this.laneEndIndex];
      const dist = Math.hypot(sp[0] - v.x, sp[1] - v.z);
      if (sig === 'red' || (sig === 'yellow' && dist > 9)) {
        maxSpeed = Math.min(maxSpeed, Math.max(0, (dist - 1.5) * 0.7));
        this.waitingLight = dist < 12;
      } else this.waitingLight = false;
    } else this.waitingLight = false;
    // obstacles ahead (vehicles, people, the player)
    const block = this.ghostT > 0 ? Infinity : sys.obstacleAhead(v);
    if (block < Infinity) maxSpeed = Math.min(maxSpeed, Math.max(0, (block - 2.5) * 0.8));
    this.ghostT = Math.max(0, this.ghostT - dt);
    // stuck handling: honk, then back out; deadlock breaker when blocked at a green light
    const wantsToGo = !this.waitingLight;
    if (v.speed < 0.6 && wantsToGo && block < 8) {
      this.stuckT += dt;
      if (this.stuckT > 3 && this.honkT <= 0) { sys.game.audio?.play('horn', v.pos, 0.35); this.honkT = 4; }
      if (this.stuckT > 6 && this.reverseT <= 0) { this.reverseT = 1.6; }
      if (this.stuckT > 9) { this.ghostT = 2.5; this.stuckT = 0; }
    } else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    this.honkT -= dt;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      const c = steerToward(v, tgt[0], tgt[1], 0);
      this.controls = { throttle: -0.6, steer: -c.steer, handbrake: false };
      return;
    }
    this.controls = steerToward(v, tgt[0], tgt[1], maxSpeed);
    if (maxSpeed < 0.5 && v.speed < 1) this.controls = { throttle: 0, steer: this.controls.steer, handbrake: true, brake: true };
  }
}

export class TrafficSystem {
  constructor(game) {
    this.game = game;
    this.roads = game.world.roads;
    this.rnd = mulberry32(777);
    this.target = 30;
    this.spawnTimer = 0;
  }
  get cars() { return this.game.vehicles.list.filter((v) => v.ai && v.ai.kind !== 'police'); }

  // Distance to the nearest obstacle in front of the vehicle's lane, or Infinity.
  obstacleAhead(v) {
    const f = v.fwd, r = v.right;
    const look = 5 + v.speed * 1.3 + v.spec.L / 2;
    let best = Infinity;
    const test = (x, z, rad) => {
      const dx = x - v.x, dz = z - v.z;
      const along = dx * f[0] + dz * f[1];
      if (along <= 0 || along > look) return;
      const lat = dx * r[0] + dz * r[1];
      if (Math.abs(lat) > v.spec.W / 2 + rad + 0.3) return;
      best = Math.min(best, along - v.spec.L / 2 - rad);
    };
    for (const o of this.game.vehicles.list) {
      if (o === v || Math.abs(o.x - v.x) > look + 5 || Math.abs(o.z - v.z) > look + 5) continue;
      for (const c of o.circles()) test(c[0], c[1], c[2]);
    }
    for (const ch of this.game.characters) {
      if (ch.vehicle || Math.abs(ch.x - v.x) > look || Math.abs(ch.z - v.z) > look) continue;
      test(ch.x, ch.z, 0.4);
    }
    return best;
  }

  spawnCar(x, z, a, b, model) {
    const g = this.game;
    const d = dirOf(a, b);
    const v = g.vehicles.spawn(model, x, z, Math.atan2(d[0], d[1]), null);
    v.color = v.spec.colors[Math.floor(this.rnd() * v.spec.colors.length)];
    const driver = new Character(g, x, z, randomLook(this.rnd, model === 'police' ? 'cop' : 'civ'), model === 'police' ? 'cop' : 'civ');
    driver.vehicle = v; v.driver = driver;
    g.characters.push(driver);
    if (model === 'police') { g.police.adoptPatrol(v, driver, a, b); }
    else { v.ai = new TrafficAI(this, v, a, b); v.ai.kind = 'traffic'; }
    v.vx = d[0] * 8; v.vz = d[1] * 8;
    return v;
  }

  // Pick a lane position 110-240 m from the player, preferably out of view.
  findSpawn(minD = 110) {
    const g = this.game, p = g.player, cam = g.camera;
    const N = this.roads.nodes;
    for (let tries = 0; tries < 12; tries++) {
      const a = N[Math.floor(this.rnd() * N.length)];
      const b = N[a.edges[Math.floor(this.rnd() * a.edges.length)]];
      const t = 0.2 + this.rnd() * 0.5;
      const s = this.roads.laneStart(a, b), e = this.roads.laneEnd(a, b);
      const x = s[0] + (e[0] - s[0]) * t, z = s[1] + (e[1] - s[1]) * t;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d < minD || d > 240) continue;
      const toX = x - cam.pos[0], toZ = z - cam.pos[2];
      const inView = (toX * cam.forward[0] + toZ * cam.forward[2]) / (Math.hypot(toX, toZ) || 1) > 0.5;
      if (inView && d < 200 && minD > 60) continue;
      // keep clear of other cars
      if (g.vehicles.list.some((v) => Math.abs(v.x - x) < 12 && Math.abs(v.z - z) < 12)) continue;
      return { x, z, a, b };
    }
    return null;
  }

  update(dt) {
    const g = this.game, p = g.player;
    const fpsScale = g.fps < 30 ? 0.6 : g.fps < 45 ? 0.8 : 1;
    const target = Math.round(this.target * fpsScale * (g.trafficDensity ?? 1));
    let count = 0;
    for (const v of g.vehicles.list) {
      if (!v.ai || v.ai.kind !== 'traffic') continue;
      if (v.driver && v.driver.alive && v.driver.vehicle === v) v.ai.update(dt);
      else v.ai.controls = { throttle: 0, steer: 0, handbrake: true };
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d > 300 && !v.keep) { g.vehicles.remove(v); continue; }
      count++;
    }
    this.spawnTimer -= dt;
    if (count < target && this.spawnTimer <= 0) {
      this.spawnTimer = 0.15;
      const s = this.findSpawn();
      if (s) this.spawnCar(s.x, s.z, s.a, s.b, rndModel(this.rnd));
    }
  }
  // Initial fill around the player at game start.
  prefill() { for (let i = 0; i < 40 && this.cars.length < this.target; i++) { const s = this.findSpawn(25); if (s) this.spawnCar(s.x, s.z, s.a, s.b, rndModel(this.rnd)); } }
  scare(x, z, r = 40) {
    for (const v of this.game.vehicles.list) if (v.ai && v.ai.kind === 'traffic' && Math.hypot(v.x - x, v.z - z) < r) v.ai.panic = 6;
  }
}
