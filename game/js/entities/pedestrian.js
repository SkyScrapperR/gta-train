// Pedestrians: walk the sidewalks around blocks, cross at zebra crossings when cars have red, idle,
// chat in pairs, use their phones, flee from gunfire and explosions, dive away from speeding cars,
// get knocked down, and drop cash when they die. Spawned in a ring around the player.
import { Character } from './character.js';
import { randomLook } from './character-model.js';
import { BLOCK, GRID, ROAD_HALF } from '../world/city.js';
import { mulberry32, clamp } from '../core/math.js';

const CORNER = ROAD_HALF + 2.0; // sidewalk loop offset from road centerlines

export class Pedestrian extends Character {
  constructor(game, sys, bx, bz, corner, look) {
    const c = Pedestrian.cornerPos(bx, bz, corner);
    super(game, c[0], c[1], look, 'civ');
    this.sys = sys;
    this.bx = bx; this.bz = bz; this.corner = corner; // 0=NW,1=NE,2=SE,3=SW
    this.dir = sys.rnd() < 0.5 ? 1 : -1;
    this.state = 'walk';
    this.timer = 0;
    this.walkSpeed = 1.2 + sys.rnd() * 0.5;
    this.target = Pedestrian.cornerPos(bx, bz, (corner + this.dir + 4) % 4);
    this.offset = (sys.rnd() - 0.5) * 1.4;
    this.fleeFrom = null;
  }
  static cornerPos(bx, bz, c) {
    const x0 = bx * BLOCK + CORNER, x1 = (bx + 1) * BLOCK - CORNER, z0 = bz * BLOCK + CORNER, z1 = (bz + 1) * BLOCK - CORNER;
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]][c];
  }
  flee(threat, time = 8) {
    if (!this.alive) return;
    this.state = 'flee'; this.timer = time;
    this.fleeFrom = threat ? [threat.x, threat.z] : [this.x + 1, this.z];
  }
  arriveCorner() {
    const sys = this.sys, r = sys.rnd();
    // maybe cross the street to the neighbouring block
    if (r < 0.35) {
      const c = this.corner;
      // which roads touch this corner: NW -> north (ew road) & west (ns road)
      const options = [];
      const nb = (dbx, dbz, nc, axis, node) => { const nx = this.bx + dbx, nz = this.bz + dbz; if (nx >= 0 && nz >= 0 && nx < GRID && nz < GRID) options.push({ bx: nx, bz: nz, corner: nc, axis, node }); };
      const node = sys.roads.node(this.bx + (c === 1 || c === 2 ? 1 : 0), this.bz + (c >= 2 ? 1 : 0));
      if (c === 0) { nb(0, -1, 3, 'ew', node); nb(-1, 0, 1, 'ns', node); }
      if (c === 1) { nb(0, -1, 2, 'ew', node); nb(1, 0, 0, 'ns', node); }
      if (c === 2) { nb(0, 1, 1, 'ew', node); nb(1, 0, 3, 'ns', node); }
      if (c === 3) { nb(0, 1, 0, 'ew', node); nb(-1, 0, 2, 'ns', node); }
      if (options.length) {
        const o = options[Math.floor(sys.rnd() * options.length)];
        this.state = 'waitCross'; this.cross = o; this.timer = 25;
        return;
      }
    }
    if (r < 0.5) { this.state = 'idle'; this.timer = 2 + sys.rnd() * 4; return; }
    if (r < 0.58) { this.state = 'phone'; this.timer = 4 + sys.rnd() * 6; return; }
    this.corner = (this.corner + this.dir + 4) % 4;
    this.target = Pedestrian.cornerPos(this.bx, this.bz, (this.corner + this.dir + 4) % 4);
  }
  think(dt) {
    const g = this.game;
    if (!this.alive) { this.move(dt, 0, 0, 3); this.updateAnim(dt, 'dead'); return; }
    if (this.downTimer > 0) { this.downTimer -= dt; this.move(dt, 0, 0, 3); this.updateAnim(dt, 'down'); if (this.downTimer <= 0 && this.state !== 'flee') this.flee(g.player, 6); return; }
    this.timer -= dt;
    let vx = 0, vz = 0, mode = 'idle';
    // dive away from speeding cars heading at us
    if (this.state !== 'dive') {
      for (const v of g.vehicles.list) {
        if (v.speed < 9 || Math.abs(v.x - this.x) > 14 || Math.abs(v.z - this.z) > 14) continue;
        const dx = this.x - v.x, dz = this.z - v.z, d = Math.hypot(dx, dz);
        const approach = (dx * v.vx + dz * v.vz) / (d * v.speed);
        if (approach > 0.85 && d < 4 + v.speed * 0.5) {
          const rx = v.right[0], rz = v.right[1];
          const side = dx * rx + dz * rz > 0 ? 1 : -1;
          this.state = 'dive'; this.timer = 0.6; this.diveDir = [rx * side, rz * side];
          this.vy = 3; g.audio?.play('shout', this.pos, 0.4);
          break;
        }
      }
    }
    switch (this.state) {
      case 'walk': {
        const dx = this.target[0] + this.offset * 0 - this.x, dz = this.target[1] - this.z, d = Math.hypot(dx, dz);
        if (d < 0.8) this.arriveCorner();
        else { vx = dx / d * this.walkSpeed; vz = dz / d * this.walkSpeed; mode = 'walk'; }
        break;
      }
      case 'idle': case 'phone': case 'chat':
        mode = this.state;
        if (this.chatWith) this.faceToward(this.chatWith.x - this.x, this.chatWith.z - this.z, 4, dt);
        if (this.timer <= 0 && this.state !== 'chat') { this.state = 'walk'; this.corner = (this.corner + this.dir + 4) % 4; this.target = Pedestrian.cornerPos(this.bx, this.bz, (this.corner + this.dir + 4) % 4); }
        if (this.state === 'chat' && this.timer <= 0) { this.state = 'walk'; this.chatWith = null; }
        break;
      case 'waitCross': {
        mode = 'idle';
        const o = this.cross;
        if (this.sys.roads.pedestrianCanCross(o.node, o.axis) || this.timer <= 0) {
          this.state = 'crossing'; this.target = Pedestrian.cornerPos(o.bx, o.bz, o.corner);
        }
        break;
      }
      case 'crossing': {
        const dx = this.target[0] - this.x, dz = this.target[1] - this.z, d = Math.hypot(dx, dz);
        if (d < 0.8) {
          this.bx = this.cross.bx; this.bz = this.cross.bz; this.corner = this.cross.corner; this.state = 'walk';
          this.target = Pedestrian.cornerPos(this.bx, this.bz, (this.corner + this.dir + 4) % 4);
        } else { vx = dx / d * this.walkSpeed * 1.3; vz = dz / d * this.walkSpeed * 1.3; mode = 'walk'; }
        break;
      }
      case 'flee': {
        const fx = this.x - this.fleeFrom[0], fz = this.z - this.fleeFrom[1], d = Math.hypot(fx, fz) || 1;
        vx = fx / d * 5.4; vz = fz / d * 5.4; mode = 'flee';
        if (this.timer <= 0) { this.state = 'walk'; this.rehome(); }
        break;
      }
      case 'dive':
        vx = this.diveDir[0] * 5; vz = this.diveDir[1] * 5; mode = 'jump';
        if (this.timer <= 0) { this.knockDown(this.diveDir[0], this.diveDir[1], 1); this.state = 'flee'; this.timer = 5; this.fleeFrom = [this.x - this.diveDir[0], this.z - this.diveDir[1]]; }
        break;
    }
    const res = this.move(dt, vx, vz, 8);
    if (res.hit && this.state === 'flee') { this.fleeFrom = [this.x - res.nz * 3 + (this.sys.rnd() - 0.5), this.z + res.nx * 3]; }
    if (vx || vz) this.faceToward(vx, vz, 8, dt);
    this.updateAnim(dt, mode);
  }
  // After fleeing, adopt the nearest block's sidewalk loop.
  rehome() {
    this.bx = clamp(Math.floor(this.x / BLOCK), 0, GRID - 1); this.bz = clamp(Math.floor(this.z / BLOCK), 0, GRID - 1);
    let best = 0, bd = Infinity;
    for (let c = 0; c < 4; c++) { const p = Pedestrian.cornerPos(this.bx, this.bz, c); const d = Math.hypot(p[0] - this.x, p[1] - this.z); if (d < bd) { bd = d; best = c; } }
    this.corner = best; this.target = Pedestrian.cornerPos(this.bx, this.bz, best);
  }
}

export class PedestrianSystem {
  constructor(game) {
    this.game = game;
    this.roads = game.world.roads;
    this.rnd = mulberry32(4242);
    this.list = [];
    this.target = 50;
    this.timer = 0;
  }
  spawnAt(bx, bz, corner, t) {
    const g = this.game;
    const p = new Pedestrian(g, this, bx, bz, corner, randomLook(this.rnd));
    const a = Pedestrian.cornerPos(bx, bz, corner), b = Pedestrian.cornerPos(bx, bz, (corner + p.dir + 4) % 4);
    p.x = a[0] + (b[0] - a[0]) * t; p.z = a[1] + (b[1] - a[1]) * t;
    p.onDeath = () => { g.pickups?.dropCash(p.x, p.z, 20 + Math.floor(this.rnd() * 60)); };
    this.list.push(p); g.characters.push(p);
    return p;
  }
  findSpawn(minD, maxD) {
    const g = this.game, pl = g.player, cam = g.camera;
    for (let tries = 0; tries < 10; tries++) {
      const bx = Math.floor(this.rnd() * GRID), bz = Math.floor(this.rnd() * GRID);
      const corner = Math.floor(this.rnd() * 4), t = this.rnd();
      const a = Pedestrian.cornerPos(bx, bz, corner);
      const d = Math.hypot(a[0] - pl.x, a[1] - pl.z);
      if (d < minD || d > maxD) continue;
      const toX = a[0] - cam.pos[0], toZ = a[1] - cam.pos[2];
      const inView = (toX * cam.forward[0] + toZ * cam.forward[2]) / (Math.hypot(toX, toZ) || 1) > 0.55;
      if (inView && minD > 30 && d < 110) continue;
      return { bx, bz, corner, t };
    }
    return null;
  }
  prefill() {
    for (let i = 0; i < this.target; i++) {
      const s = this.findSpawn(10, 140);
      if (!s) continue;
      const p = this.spawnAt(s.bx, s.bz, s.corner, s.t);
      // some stand chatting in pairs
      if (this.rnd() < 0.15) { const q = this.spawnAt(s.bx, s.bz, s.corner, s.t); q.x += 1.1; p.state = q.state = 'chat'; p.timer = q.timer = 20 + this.rnd() * 30; p.chatWith = q; q.chatWith = p; }
    }
  }
  update(dt) {
    const g = this.game, pl = g.player;
    for (const p of this.list.slice()) {
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      if (d > 170 && !p.keep) { this.remove(p); continue; }
      if (d > 130 && !p.alive && p.anim.deadT > 10) { this.remove(p); continue; }
      if (d < 150) p.think(dt);
    }
    const fpsScale = g.fps < 30 ? 0.6 : g.fps < 45 ? 0.8 : 1;
    this.timer -= dt;
    if (this.list.length < this.target * fpsScale * (g.pedDensity ?? 1) && this.timer <= 0) {
      this.timer = 0.1;
      const s = this.findSpawn(70, 140);
      if (s) {
        const p = this.spawnAt(s.bx, s.bz, s.corner, s.t);
        if (this.rnd() < 0.12) { const q = this.spawnAt(s.bx, s.bz, s.corner, s.t); q.x += 1.1; p.state = q.state = 'chat'; p.timer = q.timer = 15 + this.rnd() * 20; p.chatWith = q; q.chatWith = p; }
      }
    }
  }
  remove(p) {
    const i = this.list.indexOf(p); if (i >= 0) this.list.splice(i, 1);
    this.game.removeCharacter(p);
  }
  // Panic everyone near a loud event.
  panic(x, z, r, threat) {
    for (const p of this.list) if (p.alive && Math.hypot(p.x - x, p.z - z) < r) p.flee(threat || { x, z }, 7 + this.rnd() * 5);
  }
}
