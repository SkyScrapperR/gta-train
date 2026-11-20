// Wanted level and police response. Crimes raise a heat score that maps to 0-5 stars; police need line
// of sight to keep tracking the player, otherwise the stars flash and a search area appears until they
// give up. Patrol cars drive in traffic; at 1+ stars cars chase via the road graph, ram, drop off officers,
// form roadblocks at 3+, and the Rajawali helicopter joins at 3+ (see helicopter.js).
import { Character } from '../entities/character.js';
import { randomLook } from '../entities/character-model.js';
import { TrafficAI, steerToward } from './traffic.js';
import { mulberry32, clamp, wrapAngle } from '../core/math.js';
import { dirOf } from '../world/roads.js';

const STAR_HEAT = [0, 20, 100, 220, 380, 600];
const CRIME_HEAT = { carjack: 30, hitPed: 16, kill: 45, killCop: 110, gunfire: 7, explosion: 60, damageCop: 28, attackCop: 40, assault: 12, stealCop: 0, shootCop: 35 };

export class WantedSystem {
  constructor(game) {
    this.game = game;
    this.heat = 0; this.stars = 0;
    this.seen = false; this.lastSeen = null; this.unseenT = 0;
    this.flash = false;
    this.losTimer = 0;
    this.maxStarsThisLife = 0;
    game.events.on('crime', (c) => this.onCrime(c));
  }
  get searching() { return this.stars > 0 && !this.seen; }
  get searchRadius() { return 35 + this.stars * 18; }
  get loseTime() { return 7 + this.stars * 5; }
  copsNear(x, z, r) { return this.game.police.officers().some((c) => c.alive && Math.hypot(c.x - x, c.z - z) < r && this.game.world.collision.lineOfSight(c.x, c.y + 1.6, c.z, x, 1.2, z)); }
  onCrime(c) {
    if (this.game.cheatNoWanted) return;
    if (c.type === 'stealCop') { this.setStars(Math.min(5, this.stars + 2)); return; }
    if (c.type === 'carjack' && !this.copsNear(c.x, c.z, 70)) return;
    if (c.type === 'gunfire') {
      const people = this.game.characters.some((ch) => ch.kind === 'civ' && ch.alive && Math.hypot(ch.x - c.x, ch.z - c.z) < 30);
      if (!people && !this.copsNear(c.x, c.z, 60)) return;
    }
    let h = CRIME_HEAT[c.type] || 10;
    if (this.copsNear(c.x, c.z, 50)) h *= 1.6;
    this.addHeat(h, c.x, c.z);
  }
  addHeat(h, x, z) {
    this.heat += h;
    let s = 0;
    for (let i = 0; i < STAR_HEAT.length; i++) if (this.heat >= STAR_HEAT[i]) s = i;
    if (s > this.stars) { this.stars = s; this.game.hud?.flashStars(); }
    this.seen = true; this.unseenT = 0;
    this.lastSeen = [x ?? this.game.player.x, z ?? this.game.player.z];
    this.maxStarsThisLife = Math.max(this.maxStarsThisLife, this.stars);
  }
  setStars(n) {
    this.stars = clamp(n, 0, 5);
    this.heat = Math.max(this.heat, STAR_HEAT[this.stars]);
    if (this.stars > 0) { this.seen = true; this.unseenT = 0; this.lastSeen = [this.game.player.x, this.game.player.z]; this.game.hud?.flashStars(); }
  }
  clear() { this.heat = 0; this.stars = 0; this.seen = false; this.unseenT = 0; this.lastSeen = null; }
  update(dt) {
    if (this.stars === 0) { this.heat = 0; return; }
    const p = this.game.player;
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = 0.3;
      const px = p.x, pz = p.z, py = p.y + 1.2;
      const col = this.game.world.collision;
      let seen = false;
      for (const c of this.game.police.officers()) {
        if (!c.alive) continue;
        const d = Math.hypot(c.x - px, c.z - pz);
        const range = c.vehicle ? 95 : 70;
        if (d < range && col.lineOfSight(c.x, c.y + 1.5, c.z, px, py, pz)) { seen = true; break; }
      }
      const heli = this.game.helicopter;
      if (!seen && heli && heli.active && !heli.down && Math.hypot(heli.x - px, heli.z - pz) < 120 && col.lineOfSight(heli.x, heli.y - 2, heli.z, px, py, pz)) seen = true;
      this.seen = seen;
      if (seen) { this.lastSeen = [px, pz]; this.unseenT = 0; }
    }
    if (!this.seen) {
      this.unseenT += dt;
      if (this.unseenT > this.loseTime) { this.clear(); this.game.hud?.toast('Lost the cops', '#7dff9a'); this.game.events.emit('wantedCleared'); }
    }
    this.flash = !this.seen;
  }
}

// On-foot officer: arrests at 1 star, shoots at 2+.
export class Cop extends Character {
  constructor(game, x, z, rnd) {
    super(game, x, z, randomLook(rnd, 'cop'), 'cop');
    this.rnd = rnd;
    this.held = 'pistol';
    this.shootT = 1 + rnd();
    this.strafe = rnd() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.health = this.maxHealth = 80;
  }
  think(dt) {
    const g = this.game, p = g.player, W = g.wanted;
    if (!this.alive) { this.move(dt, 0, 0, 3); this.updateAnim(dt, 'dead'); return; }
    if (this.downTimer > 0) { this.downTimer -= dt; this.move(dt, 0, 0, 3); this.updateAnim(dt, 'down'); return; }
    const target = W.stars > 0 ? (W.seen ? [p.x, p.z] : W.lastSeen) : null;
    if (!target || !p.alive) { this.move(dt, 0, 0, 6); this.held = null; this.updateAnim(dt, 'idle'); return; }
    const dx = target[0] - this.x, dz = target[1] - this.z, d = Math.hypot(dx, dz) || 1;
    let vx = 0, vz = 0, mode = 'idle';
    const canSee = W.seen && g.world.collision.lineOfSight(this.x, this.y + 1.5, this.z, p.x, p.y + 1.2, p.z);
    if (W.stars <= 1) {
      this.held = null;
      if (d > 1.3) { vx = dx / d * 5.6; vz = dz / d * 5.6; mode = 'run'; }
      else g.police.tryArrest(this, dt);
      if (p.state === 'driving' && p.vehicle && p.vehicle.speed < 1.5 && Math.hypot(p.vehicle.x - this.x, p.vehicle.z - this.z) < 3.2) g.police.tryArrest(this, dt);
    } else {
      this.held = 'pistol';
      if (canSee && d < 32) {
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 1 + this.rnd() * 2; this.strafe *= -1; }
        const keep = d < 7 ? -1 : d > 18 ? 1 : 0;
        vx = dx / d * keep * 3.2 + (-dz / d) * this.strafe * 1.6; vz = dz / d * keep * 3.2 + (dx / d) * this.strafe * 1.6;
        mode = 'aim'; this.anim.moving = true;
        this.yaw = Math.atan2(dx, dz);
        this.shootT -= dt;
        if (this.shootT <= 0) {
          this.shootT = 0.55 + this.rnd() * 0.7;
          const moving = p.state === 'driving' ? p.vehicle.speed : p.speed;
          const acc = clamp(0.75 - d * 0.012 - moving * 0.02, 0.15, 0.75);
          g.combat.npcShoot(this, p, acc, W.stars >= 4 ? 9 : 7);
          this.anim.recoil = 1;
        }
      } else { vx = dx / d * 5.8; vz = dz / d * 5.8; mode = 'run'; }
    }
    this.move(dt, vx, vz, 10);
    if (mode !== 'aim' && (vx || vz)) this.faceToward(vx, vz, 10, dt);
    this.updateAnim(dt, mode);
  }
}

// Police car driver: patrols in traffic (wanted 0), chases via the road graph, rams, deploys officers.
class PoliceDriverAI {
  constructor(sys, v, mode, a, b) {
    this.sys = sys; this.v = v; this.kind = 'police';
    this.mode = mode; // patrol | chase | roadblock
    this.patrol = a && b ? new TrafficAI(sys.game.traffic, v, a, b) : null;
    this.controls = { throttle: 0, steer: 0, handbrake: false };
    this.routeT = 0; this.route = null; this.deployed = false; this.stuckT = 0; this.reverseT = 0;
  }
  update(dt) {
    const g = this.sys.game, v = this.v, W = g.wanted, p = g.player;
    if (W.stars > 0 && this.mode === 'patrol') this.mode = 'chase';
    if (this.mode === 'roadblock') { this.controls = { throttle: 0, steer: 0, handbrake: true, brake: true }; v.siren = W.stars > 0; return; }
    if (this.mode === 'patrol' || W.stars === 0) {
      v.siren = false;
      if (this.patrol) { this.patrol.update(dt); this.controls = this.patrol.controls; }
      else this.controls = { throttle: 0, steer: 0, handbrake: true };
      return;
    }
    v.siren = true;
    const tgt = W.seen ? (p.state === 'driving' && p.vehicle ? [p.vehicle.x + p.vehicle.vx * 0.6, p.vehicle.z + p.vehicle.vz * 0.6] : [p.x, p.z]) : W.lastSeen;
    if (!tgt) return;
    const d = Math.hypot(tgt[0] - v.x, tgt[1] - v.z);
    // deploy officers when the player is on foot nearby or stopped
    if (!this.deployed && d < 22 && (p.state !== 'driving' || (p.vehicle && p.vehicle.speed < 3))) {
      this.controls = { throttle: 0, steer: 0, handbrake: true, brake: true };
      if (v.speed < 2) { this.deployed = true; this.sys.deployOfficers(v); }
      return;
    }
    if (this.deployed) {
      this.controls = { throttle: 0, steer: 0, handbrake: true, brake: true };
      if (d > 60) this.deployed = false; // re-mount handled by officers re-boarding is skipped; car continues
      return;
    }
    let aim = tgt;
    if (d > 45) {
      this.routeT -= dt;
      if (this.routeT <= 0 || !this.route) {
        this.routeT = 1.5;
        const roads = g.world.roads;
        this.route = roads.routePoints(v.x, v.z, tgt[0], tgt[1]).slice(1);
      }
      while (this.route.length > 1 && Math.hypot(this.route[0][0] - v.x, this.route[0][1] - v.z) < 12) this.route.shift();
      aim = this.route[0];
    }
    const speed = d > 45 ? 26 : clamp(d * 0.9, 8, 30);
    this.controls = steerToward(v, aim[0], aim[1], speed, true);
    // stuck: back out
    if (v.speed < 1 && this.controls.throttle > 0.3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.8) { this.reverseT = 1.2; this.stuckT = 0; }
    if (this.reverseT > 0) { this.reverseT -= dt; this.controls = { throttle: -0.8, steer: -this.controls.steer, handbrake: false }; }
  }
}

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.rnd = mulberry32(911);
    this.cops = [];
    this.spawnT = 0;
    this.roadblockT = 10;
    this.arrestT = 0;
  }
  officers() {
    const out = this.cops.slice();
    for (const v of this.game.vehicles.list) if (v.isPolice && v.driver && v.driver.kind === 'cop' && v.driver.alive) out.push(v.driver);
    return out;
  }
  adoptPatrol(v, driver, a, b) { v.ai = new PoliceDriverAI(this, v, 'patrol', a, b); }
  chasers() { return this.game.vehicles.list.filter((v) => v.ai && v.ai.kind === 'police' && v.ai.mode === 'chase' && !v.destroyed && v.driver); }

  spawnChaser() {
    const g = this.game, p = g.player;
    const s = g.traffic.findSpawn();
    if (!s) return;
    const d = dirOf(s.a, s.b);
    const v = g.vehicles.spawn('police', s.x, s.z, Math.atan2(d[0], d[1]));
    const driver = new Character(g, s.x, s.z, randomLook(this.rnd, 'cop'), 'cop');
    driver.vehicle = v; v.driver = driver;
    g.characters.push(driver);
    v.ai = new PoliceDriverAI(this, v, 'chase');
    v.siren = true;
    // passenger officer
    const pass = new Character(g, s.x, s.z, randomLook(this.rnd, 'cop'), 'cop');
    pass.vehicle = v; v.passengers.push(pass); g.characters.push(pass);
    return v;
  }
  deployOfficers(v) {
    const g = this.game;
    const crew = [v.driver, ...v.passengers].filter((c) => c && c.alive);
    crew.forEach((c, i) => {
      const door = v.doorWorld(i);
      const cop = new Cop(g, door[0], door[2], this.rnd);
      cop.look = c.look;
      this.cops.push(cop); g.characters.push(cop);
      g.removeCharacter(c);
    });
    v.driver = null; v.passengers = [];
    v.ai.mode = 'roadblock';
    g.audio?.play('copShout', v.pos, 0.8);
  }
  spawnRoadblock() {
    const g = this.game, p = g.player;
    if (p.state !== 'driving' || !p.vehicle) return;
    const v = p.vehicle;
    const f = v.speed > 3 ? [v.vx / v.speed, v.vz / v.speed] : v.fwd;
    const roads = g.world.roads;
    // the next intersection ahead of the player
    let best = null, bd = Infinity;
    for (const n of roads.nodes) {
      const dx = n.x - v.x, dz = n.z - v.z, d = Math.hypot(dx, dz);
      if (d < 70 || d > 190) continue;
      const dot = (dx * f[0] + dz * f[1]) / d;
      if (dot < 0.9) continue;
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return;
    const axisX = Math.abs(f[0]) > Math.abs(f[1]);
    for (const k of [-1, 1]) {
      const x = best.x - (axisX ? Math.sign(f[0]) * 14 : 0) + (axisX ? 0 : k * 2.6);
      const z = best.z - (axisX ? 0 : Math.sign(f[1]) * 14) + (axisX ? k * 2.6 : 0);
      const yaw = axisX ? (k > 0 ? 0.3 : -0.3) : Math.PI / 2 + (k > 0 ? 0.3 : -0.3);
      const car = g.vehicles.spawn('police', x, z, yaw);
      car.ai = new PoliceDriverAI(this, car, 'roadblock'); car.siren = true; car.roadblock = true;
      for (let i = 0; i < 1; i++) {
        const cop = new Cop(g, x - (axisX ? Math.sign(f[0]) * 3 : 0), z - (axisX ? 0 : Math.sign(f[1]) * 3), this.rnd);
        this.cops.push(cop); g.characters.push(cop);
      }
    }
    g.hud?.toast('Roadblock ahead!', '#ff5a5a');
  }
  tryArrest(cop, dt) {
    const g = this.game, p = g.player;
    if (!p.alive || g.wanted.stars !== 1) return;
    this.arrestT += dt * 2;
    if (this.arrestT > 1.6) { this.arrestT = 0; g.busted(); }
  }
  update(dt) {
    const g = this.game, W = g.wanted, p = g.player;
    this.arrestT = Math.max(0, this.arrestT - dt);
    for (const v of g.vehicles.list) if (v.ai && v.ai.kind === 'police') { if (v.driver && v.driver.alive && v.driver.vehicle === v) v.ai.update(dt); else if (v.ai.mode !== 'roadblock') v.ai.controls = { throttle: 0, steer: 0, handbrake: true }; }
    for (const c of this.cops.slice()) {
      c.think(dt);
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if ((W.stars === 0 && d > 60) || d > 220 || (!c.alive && c.anim.deadT > 20 && d > 60)) { this.cops.splice(this.cops.indexOf(c), 1); g.removeCharacter(c); }
    }
    // remove idle roadblocks and chasers when the heat is gone
    for (const v of g.vehicles.list.slice()) {
      if (!v.isPolice || !v.ai || v.ai.kind !== 'police') continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if ((v.ai.mode !== 'patrol' && W.stars === 0 && d > 90) || d > 320) g.vehicles.remove(v);
    }
    if (W.stars > 0) {
      const want = Math.min(5, W.stars + (W.stars >= 3 ? 1 : 0));
      this.spawnT -= dt;
      if (this.chasers().length < want && this.spawnT <= 0) { this.spawnT = 2.5; this.spawnChaser(); }
      if (W.stars >= 3) { this.roadblockT -= dt; if (this.roadblockT <= 0) { this.roadblockT = 25; this.spawnRoadblock(); } }
    } else { this.roadblockT = 10; }
  }
}
