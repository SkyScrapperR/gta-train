// Kai Santoso: the player. On-foot controls (camera-relative movement, sprint with stamina, jump, aim),
// weapon handling and the hand-off to vehicles (enter, carjack, drive, exit).
import { Character } from './character.js';
import { LOOKS } from './character-model.js';
import { clamp, wrapAngle } from '../core/math.js';

export class Player extends Character {
  constructor(game, x, z) {
    super(game, x, z, LOOKS.kai, 'player');
    this.stamina = 1;
    this.state = 'foot'; // foot | entering | driving | exiting
    this.aiming = false;
    this.radius = 0.34;
    this.enterTarget = null;
    this.enterT = 0;
    this.punchCooldown = 0;
    this.punchSide = 0;
    this.footstepT = 0;
  }

  update(dt, input, rig) {
    const g = this.game;
    if (!this.alive) { this.move(dt, 0, 0, 4); this.updateAnim(dt, 'dead'); return; }
    if (this.state === 'driving') { this.syncToVehicle(); this.updateAnim(dt, 'sit'); this.anim.steer = this.vehicle.steer; return; }
    if (this.state === 'entering' || this.state === 'exiting') { this.updateTransition(dt); return; }
    if (this.downTimer > 0) { this.downTimer -= dt; this.move(dt, 0, 0, 3); this.updateAnim(dt, 'down'); if (this.downTimer <= 0) this.anim.mode = 'idle'; return; }

    const inp = g.controlsLocked ? null : input;
    const f = (inp && inp.isDown('KeyW') ? 1 : 0) - (inp && inp.isDown('KeyS') ? 1 : 0);
    const s = (inp && inp.isDown('KeyD') ? 1 : 0) - (inp && inp.isDown('KeyA') ? 1 : 0);
    const cy = rig.yaw;
    const fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    let wx = fx * f + rx * s, wz = fz * f + rz * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }
    const weapons = g.weapons;
    this.aiming = !!(inp && inp.mouseDown(2)) && this.alive;
    const sprinting = !!(inp && inp.isDown('ShiftLeft')) && wl > 0.1 && !this.aiming && this.stamina > 0.02;
    if (sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.22); else this.stamina = Math.min(1, this.stamina + dt * 0.15);
    const speed = this.aiming ? 2.4 : sprinting ? 7.4 : 4.6;
    this.move(dt, wx * speed, wz * speed, this.grounded ? 14 : 2);
    if (inp && inp.wasPressed('Space') && this.grounded) { this.vy = 5.2; this.grounded = false; g.audio?.play('jump', this.pos, 0.3); }
    // facing
    if (this.aiming) this.yaw = cy;
    else if (wl > 0.1) this.faceToward(wx, wz, 12, dt);

    // weapon switch / fire
    if (inp) {
      const m = g.mouseFrame;
      if (inp.wasPressed('KeyQ') || (m && m.wheel < 0)) weapons.cycle(-1);
      if (inp.wasPressed('KeyE') || (m && m.wheel > 0)) weapons.cycle(1);
      if (inp.wasPressed('KeyR')) weapons.reload();
    }
    const cur = weapons.current;
    this.held = cur.model || null;
    this.anim.twoHanded = !!cur.twoHanded;
    this.anim.aimPitch = clamp(-rig.pitch + 0.1, -1, 1);
    this.punchCooldown -= dt;
    const fire = inp && (cur.auto ? inp.mouseDown(0) : inp.mousePressed(0));
    if (fire) {
      if (cur.melee) {
        if (this.punchCooldown <= 0) { this.punchSide = 1 - this.punchSide; this.anim.punchSide = this.punchSide; this.anim.punchT = 0; this.punchCooldown = 0.38; g.combat.melee(this); }
      } else if (this.aiming || true) {
        if (weapons.fire(this, g.aimRay())) { this.anim.recoil = 1; if (!this.aiming) this.aimHold = 0.6; }
      }
    }
    this.aimHold = Math.max(0, (this.aimHold || 0) - dt);
    if (this.aimHold > 0) this.yaw = cy;

    // footsteps
    if (this.grounded && this.speed > 1) {
      this.footstepT -= dt * this.speed / (sprinting ? 2.9 : 2.3) * 2;
      if (this.footstepT <= 0) { this.footstepT = 1; g.audio?.play('step', this.pos, 0.25); }
    }

    // animation mode
    let mode;
    if (this.anim.punchT < 1 && this.punchCooldown > 0) { this.anim.punchT = Math.min(1, this.anim.punchT + dt * 3.2); mode = 'punch'; }
    else if ((this.aiming || this.aimHold > 0) && !cur.melee) { mode = 'aim'; this.anim.moving = this.speed > 0.5; }
    else if (!this.grounded) mode = 'jump';
    else if (this.speed > 6) mode = 'sprint';
    else if (this.speed > 3) mode = 'run';
    else if (this.speed > 0.4) mode = 'walk';
    else mode = 'idle';
    this.updateAnim(dt, mode);

    // enter vehicle
    if (inp && inp.wasPressed('KeyF')) g.vehicles?.tryEnter(this);
  }

  syncToVehicle() {
    const v = this.vehicle;
    const seat = v.seatWorld(0);
    this.x = seat[0]; this.y = seat[1]; this.z = seat[2]; this.yaw = v.yaw;
  }

  // Walk to the driver's door, then slide in (or the reverse when exiting).
  updateTransition(dt) {
    const v = this.vehicle || this.enterTarget;
    if (!v || v.destroyed) { this.state = 'foot'; this.vehicle = null; this.enterTarget = null; this.visible = true; return; }
    this.enterT += dt;
    const door = v.doorWorld();
    if (this.state === 'entering') {
      const dx = door[0] - this.x, dz = door[2] - this.z, d = Math.hypot(dx, dz);
      if (this.enterPhase === 0) {
        if (d > 0.35 && this.enterT < 2.5) {
          this.move(dt, dx / d * 4.2, dz / d * 4.2, 18); this.faceToward(dx, dz, 14, dt); this.updateAnim(dt, 'run');
          if (v.driver && v.driver !== this && d < 2.5) this.game.vehicles.carjack(v, this);
          return;
        }
        this.enterPhase = 1; this.enterT = 0; this.game.audio?.play('door', v.pos, 0.6);
        if (v.driver && v.driver !== this) this.game.vehicles.carjack(v, this);
      }
      // slide into the seat
      const seat = v.seatWorld(0);
      const k = Math.min(1, this.enterT / 0.55);
      this.x += (seat[0] - this.x) * k; this.z += (seat[2] - this.z) * k; this.y += (seat[1] - this.y) * k;
      this.yaw = v.yaw;
      this.updateAnim(dt, 'sit');
      if (k >= 1) { this.state = 'driving'; this.vehicle = v; v.driver = this; this.enterTarget = null; this.game.onPlayerEnteredVehicle(v); }
    } else {
      const k = Math.min(1, this.enterT / 0.5);
      this.x += (door[0] - this.x) * k; this.z += (door[2] - this.z) * k; this.y = Math.max(this.y - dt * 2, 0);
      this.updateAnim(dt, 'idle');
      if (k >= 1) {
        const prev = this.vehicle;
        this.state = 'foot'; this.vehicle = null; this.y = 0.15; this.vx = this.vz = 0;
        if (prev && prev.driver === this) prev.driver = null;
        this.game.onPlayerExitedVehicle(prev);
      }
    }
  }
  beginEnter(v) { this.state = 'entering'; this.enterTarget = v; this.vehicle = v; this.enterT = 0; this.enterPhase = 0; this.aiming = false; }
  beginExit() { if (!this.vehicle) return; this.state = 'exiting'; this.enterT = 0; this.game.audio?.play('door', this.vehicle.pos, 0.6); }
}
