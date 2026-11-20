// Base character entity shared by the player, pedestrians, cops, gang members and story characters.
// Movement runs on the ground plane with world collision; animation state feeds the procedural rig.
import { makePose, targetPose, easePose } from './character-model.js';
import { groundHeight } from '../world/city-meshes.js';
import { wrapAngle, dampAngle, clamp } from '../core/math.js';

let NEXT_ID = 1;

export class Character {
  constructor(game, x, z, look, kind = 'civ') {
    this.id = NEXT_ID++;
    this.game = game;
    this.kind = kind;
    this.look = look;
    this.x = x; this.z = z; this.y = groundHeight(x, z);
    this.yaw = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.radius = 0.32;
    this.maxHealth = 100; this.health = 100; this.armor = 0;
    this.alive = true;
    this.vehicle = null;
    this.pose = makePose();
    this._target = makePose();
    this.anim = { mode: 'idle', phase: Math.random() * 6, time: Math.random() * 10, punchT: 0, hitT: 0, deadT: 0, downT: 1, aimPitch: 0, recoil: 0 };
    this.held = null;
    this.grounded = true;
    this.deadTime = 0;
    this.visible = true;
    this.speed = 0;
  }
  get pos() { return [this.x, this.y, this.z]; }
  get headPos() { return [this.x, this.y + 1.62 * (this.look.height || 1), this.z]; }
  get chestPos() { return [this.x, this.y + 1.25 * (this.look.height || 1), this.z]; }

  // Move with desired horizontal velocity; handles collision, gravity and ground snapping.
  move(dt, wantVX, wantVZ, accel = 14) {
    const k = 1 - Math.exp(-accel * dt);
    this.vx += (wantVX - this.vx) * k;
    this.vz += (wantVZ - this.vz) * k;
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const col = this.game.world.collision;
    const r = col.resolveCircle(nx, nz, this.radius, this.y, 1.7);
    nx = r.x; nz = r.z;
    if (!col.inBounds(nx, nz)) { nx = this.x; nz = this.z; this.vx *= -0.2; this.vz *= -0.2; }
    this.x = nx; this.z = nz;
    const gh = groundHeight(this.x, this.z);
    this.vy -= 22 * dt;
    this.y += this.vy * dt;
    if (this.y <= gh) { this.y = gh; this.vy = 0; this.grounded = true; } else if (this.y > gh + 0.05) this.grounded = false;
    this.speed = Math.hypot(this.vx, this.vz);
    return r;
  }
  faceToward(dx, dz, rate, dt) {
    if (Math.abs(dx) + Math.abs(dz) < 1e-4) return;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), rate, dt);
  }
  // Damage with armor absorption. Returns true if this killed the character.
  damage(amount, source = null, dirX = 0, dirZ = 0) {
    if (!this.alive) return false;
    if (this.armor > 0) { const a = Math.min(this.armor, amount * 0.7); this.armor -= a; amount -= a; }
    this.health -= amount;
    this.anim.hitT = 1;
    this.lastAttacker = source;
    if (this.health <= 0) { this.die(dirX, dirZ, source); return true; }
    return false;
  }
  die(dirX = 0, dirZ = 0, source = null) {
    this.health = 0; this.alive = false; this.anim.mode = 'dead'; this.anim.deadT = 0;
    // fall away from the hit direction: compare with facing
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.anim.fallDir = dirX * fx + dirZ * fz > 0 ? -1 : 1;
    this.vx = dirX * 2; this.vz = dirZ * 2;
    this.held = null;
    if (this.onDeath) this.onDeath(source);
    this.game.events.emit('death', { victim: this, killer: source });
  }
  knockDown(dirX, dirZ, force = 4) {
    this.anim.mode = 'down'; this.anim.downT = 0; this.anim.fallDir = 1;
    this.vx = dirX * force; this.vz = dirZ * force; this.vy = 2.5;
    this.downTimer = 1.8;
  }
  updateAnim(dt, mode) {
    const a = this.anim;
    a.time += dt;
    if (this.alive && mode) a.mode = mode;
    if (a.mode === 'dead') a.deadT += dt;
    if (a.mode === 'down') a.downT = clamp(1 - (this.downTimer || 0) / 1.2, 0, 1);
    a.hitT = Math.max(0, a.hitT - dt * 4);
    a.recoil = Math.max(0, (a.recoil || 0) - dt * 8);
    const sp = this.speed;
    const stride = a.mode === 'walk' ? 1.45 : a.mode === 'run' || a.mode === 'flee' ? 2.3 : 2.9;
    a.phase += (sp / stride) * Math.PI * 2 * dt;
    targetPose(a, this._target);
    const rate = a.mode === 'dead' ? 8 : a.mode === 'punch' ? 30 : a.mode === 'aim' ? 22 : 12;
    easePose(this.pose, this._target, rate, dt);
  }
}
