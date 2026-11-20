// Gang combat AI (Black Orchid members): guard until alerted, then keep their distance, move between
// cover spots (corners, containers, cars), strafe and fire bursts with imperfect accuracy.
import { Character } from '../entities/character.js';
import { randomLook } from '../entities/character-model.js';
import { clamp, mulberry32 } from '../core/math.js';

const rnd = mulberry32(5150);

export class GangMember extends Character {
  constructor(game, x, z, opts = {}) {
    super(game, x, z, opts.look || randomLook(rnd, 'gang'), 'gang');
    this.weapon = opts.weapon || (rnd() < 0.5 ? 'smg' : 'pistol');
    this.held = this.weapon;
    this.health = this.maxHealth = opts.health || 100;
    this.alert = !!opts.alert;
    this.alertRange = opts.alertRange || 28;
    this.accuracy = opts.accuracy || 0.32;
    this.damageOut = opts.damage || 7;
    this.home = [x, z];
    this.cover = null; this.coverT = 0;
    this.burst = 0; this.shootT = 1 + rnd() * 1.5;
    this.strafe = rnd() < 0.5 ? 1 : -1;
    this.weaponSound = this.weapon;
    this.boss = !!opts.boss;
    this.fleeTo = null;
    this.yaw = opts.yaw ?? rnd() * 6;
  }
  onHit() { this.alertAll(); }
  alertAll() {
    if (this.alert) return;
    this.alert = true;
    for (const ch of this.game.characters) if (ch.kind === 'gang' && ch.alive && Math.hypot(ch.x - this.x, ch.z - this.z) < 45) ch.alert = true;
  }
  // Pick a spot that puts an obstacle between us and the player.
  findCover(px, pz) {
    const col = this.game.world.collision;
    const list = col.query(this.x - 14, this.z - 14, this.x + 14, this.z + 14, []);
    let best = null, bd = Infinity;
    for (const o of list) {
      if (o.kind !== 'box' || o.y1 < 1.2) continue;
      const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
      const dx = cx - px, dz = cz - pz, d = Math.hypot(dx, dz) || 1;
      const ext = Math.max(o.x1 - o.x0, o.z1 - o.z0) / 2 + 1.0;
      const sx = cx + dx / d * Math.min(ext, 4), sz = cz + dz / d * Math.min(ext, 4);
      if (col.resolveCircle(sx, sz, 0.4).hit) continue;
      const myD = Math.hypot(sx - this.x, sz - this.z);
      const pd = Math.hypot(sx - px, sz - pz);
      if (pd < 7 || pd > 35) continue;
      const score = myD + Math.abs(pd - 16) * 0.5;
      if (score < bd) { bd = score; best = [sx, sz]; }
    }
    return best;
  }
  think(dt) {
    const g = this.game, p = g.player;
    if (!this.alive) { this.move(dt, 0, 0, 3); this.updateAnim(dt, 'dead'); return; }
    if (this.downTimer > 0) { this.downTimer -= dt; this.move(dt, 0, 0, 3); this.updateAnim(dt, 'down'); return; }
    const pv = p.state === 'driving' && p.vehicle ? p.vehicle : p;
    const dx = pv.x - this.x, dz = pv.z - this.z, d = Math.hypot(dx, dz) || 1;
    const col = g.world.collision;
    if (this.fleeTo) { // scripted run (boss escaping)
      const fx = this.fleeTo[0] - this.x, fz = this.fleeTo[1] - this.z, fd = Math.hypot(fx, fz);
      if (fd > 1) { this.move(dt, fx / fd * 5.2, fz / fd * 5.2, 10); this.faceToward(fx, fz, 10, dt); this.updateAnim(dt, 'run'); }
      else { this.fleeTo = null; this.alert = true; }
      return;
    }
    if (!this.alert) {
      if (p.alive && d < this.alertRange && col.lineOfSight(this.x, this.y + 1.5, this.z, pv.x, 1.3, pv.z)) this.alertAll();
      this.move(dt, 0, 0, 6);
      this.updateAnim(dt, 'idle');
      return;
    }
    if (!p.alive) { this.move(dt, 0, 0, 6); this.updateAnim(dt, 'idle'); return; }
    const canSee = col.lineOfSight(this.x, this.y + 1.5, this.z, pv.x, pv.y + 1.2, pv.z);
    this.coverT -= dt;
    if (this.coverT <= 0) { this.coverT = 3 + rnd() * 3; this.cover = rnd() < 0.7 ? this.findCover(pv.x, pv.z) : null; this.strafe *= -1; }
    let vx = 0, vz = 0, mode = 'aim';
    if (this.cover && Math.hypot(this.cover[0] - this.x, this.cover[1] - this.z) > 1) {
      const cx = this.cover[0] - this.x, cz = this.cover[1] - this.z, cd = Math.hypot(cx, cz);
      vx = cx / cd * 4.5; vz = cz / cd * 4.5; mode = canSee ? 'aim' : 'run';
    } else if (!canSee || d > 30) { vx = dx / d * 4.2; vz = dz / d * 4.2; mode = 'run'; }
    else {
      const keep = d < 8 ? -1 : d > 22 ? 1 : 0;
      vx = dx / d * keep * 2.5 - dz / d * this.strafe * 1.4; vz = dz / d * keep * 2.5 + dx / d * this.strafe * 1.4;
    }
    this.move(dt, vx, vz, 10);
    if (mode === 'aim') { this.yaw = Math.atan2(dx, dz); this.anim.moving = Math.hypot(vx, vz) > 0.5; this.anim.twoHanded = this.weapon === 'smg'; }
    else this.faceToward(vx, vz, 10, dt);
    // shooting in bursts
    this.shootT -= dt;
    if (canSee && d < 40 && this.shootT <= 0) {
      if (this.burst <= 0) this.burst = this.weapon === 'smg' ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 2);
      this.burst--;
      this.shootT = this.burst > 0 ? (this.weapon === 'smg' ? 0.11 : 0.35) : 1.0 + rnd() * 1.2;
      const moving = p.state === 'driving' ? p.vehicle.speed : p.speed;
      const acc = clamp(this.accuracy - d * 0.006 - moving * 0.015, 0.06, 0.7);
      g.combat.npcShoot(this, p, acc, this.damageOut);
      this.anim.recoil = 1;
    }
    this.updateAnim(dt, mode);
  }
}
