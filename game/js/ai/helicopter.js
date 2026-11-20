// Rajawali police helicopter: joins at 3+ stars, circles the player with a volumetric-looking spotlight cone
// (additive cone mesh + ground spot light), fires bursts at 4+ stars, and can be shot down: it smokes,
// spirals down and explodes.
import { buildHelicopterMeshes } from '../entities/vehicle-model.js';
import { InstanceBatch } from '../engine/instancing.js';
import { m4, m4mul, m4fromYPR, clamp, damp, dampAngle } from '../core/math.js';

export class Helicopter {
  constructor(game) {
    this.game = game;
    const m = buildHelicopterMeshes(game.gl);
    this.body = new InstanceBatch(m.body, { name: 'heli' });
    this.rotor = new InstanceBatch(m.rotor, { name: 'rotor', castShadow: false });
    this.tail = new InstanceBatch(m.tailRotor, { name: 'tailrotor', castShadow: false });
    this.M = m4(); this.T = m4(); this.W = m4();
    this.reset();
  }
  reset() {
    this.active = false; this.crashed = false; this.down = false;
    this.health = 600; this.cooldown = 0;
    this.x = 0; this.y = 60; this.z = 0; this.yaw = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.spin = 0; this.orbit = 0; this.spot = [0, 0, 0]; this.fireT = 3; this.burst = 0; this.crashSpin = 0;
  }
  spawn() {
    const p = this.game.player;
    const a = Math.random() * Math.PI * 2;
    this.reset();
    this.active = true;
    this.x = p.x + Math.cos(a) * 220; this.z = p.z + Math.sin(a) * 220; this.y = 70;
    this.spot = [p.x, 0, p.z];
    this.game.hud.toast('Police helicopter inbound', '#ff4d5e');
  }
  damage(amount, src) {
    if (!this.active || this.crashed) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.crashed = true; this.vy = -2;
      if (src === this.game.player) this.game.events.emit('crime', { type: 'explosion', x: this.x, z: this.z });
      this.game.hud.toast('Helicopter going down!', '#ffd166');
      this.game.slowMo(0.4, 1.0);
    }
  }
  update(dt) {
    const g = this.game, p = g.player, W = g.wanted;
    this.cooldown -= dt;
    if (!this.active) { if (W.stars >= 3 && this.cooldown <= 0 && g.state === 'playing') this.spawn(); return; }
    this.spin += dt * 28;
    if (this.crashed) {
      this.crashSpin += dt * 3.5;
      this.yaw += dt * this.crashSpin;
      this.vy -= 9 * dt;
      this.x += this.vx * dt + Math.cos(this.yaw) * dt * 6; this.z += this.vz * dt + Math.sin(this.yaw) * dt * 6; this.y += this.vy * dt;
      if (Math.random() < dt * 40) g.particles.smoke(this.x, this.y + 1, this.z, 0.15, 1.6);
      if (Math.random() < dt * 25) g.particles.fire(this.x, this.y + 1.5, this.z, 1.2);
      const ground = 0.5;
      const hit = g.world.collision.raycast(this.x, this.y + 1, this.z, 0, -1, 0, 3, { ground: true });
      if (this.y <= ground || hit) {
        g.combat.explosion(this.x, Math.max(this.y, 0.5), this.z, 12, 150, null);
        this.active = false; this.cooldown = 45;
      }
      return;
    }
    if (W.stars < 3 || !p.alive) {
      // fly away and despawn
      this.y += dt * 8; this.x += Math.cos(this.orbit) * dt * 30; this.z += Math.sin(this.orbit) * dt * 30;
      if (this.y > 140) { this.active = false; this.cooldown = 10; }
      return;
    }
    const tgt = W.seen || !W.lastSeen ? [p.x, p.z] : W.lastSeen;
    this.orbit += dt * 0.25;
    const R = 28;
    const wx = tgt[0] + Math.cos(this.orbit) * R, wz = tgt[1] + Math.sin(this.orbit) * R;
    const dx = wx - this.x, dz = wz - this.z, d = Math.hypot(dx, dz);
    const sp = Math.min(32, d * 0.8);
    this.vx = damp(this.vx, dx / (d || 1) * sp, 1.5, dt); this.vz = damp(this.vz, dz / (d || 1) * sp, 1.5, dt);
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.y = damp(this.y, 40, 0.8, dt);
    this.yaw = dampAngle(this.yaw, Math.atan2(tgt[0] - this.x, tgt[1] - this.z), 1.5, dt);
    // spotlight sweeps toward the target with lag (and searches when the player is hidden)
    const sx = W.seen ? tgt[0] : tgt[0] + Math.sin(g.time * 0.9) * 12, sz = W.seen ? tgt[1] : tgt[1] + Math.cos(g.time * 0.7) * 12;
    this.spot[0] = damp(this.spot[0], sx, 3, dt); this.spot[2] = damp(this.spot[2], sz, 3, dt);
    if (this.health < 300 && Math.random() < dt * 15) g.particles.smoke(this.x, this.y + 1.5, this.z - 1, 0.3, 1.2);
    // gunner at 4+ stars
    if (W.stars >= 4 && W.seen) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        if (this.burst <= 0) this.burst = 6;
        this.burst--;
        this.fireT = this.burst > 0 ? 0.1 : 2.2;
        const shooter = { x: this.x, y: this.y - 3, z: this.z, yaw: this.yaw, look: { height: 1 }, kind: 'cop', vehicle: null, weaponSound: 'heliShot', isHeli: true };
        shooter.vehicle = { local: () => [this.x, this.y - 0.6, this.z], spec: { belt: 0 } };
        g.combat.npcShoot(shooter, p, 0.18, 6);
      }
    }
  }
  render(coneBatches) {
    this.body.reset(); this.rotor.reset(); this.tail.reset();
    if (!this.active) return;
    const g = this.game, M = this.M, T = this.T, W = this.W;
    const tilt = clamp(Math.hypot(this.vx, this.vz) * 0.01, 0, 0.25);
    m4fromYPR(M, this.x, this.y, this.z, this.yaw, tilt, this.crashed ? Math.sin(this.crashSpin) * 0.3 : 0);
    this.body.add(M, 0.12, 0.16, 0.32, 1, 0, -1, 1, this.crashed ? 0.5 : 0);
    m4fromYPR(T, 0, 2.95, 0, this.spin, 0, 0); m4mul(W, M, T); this.rotor.add(W, 1, 1, 1, 1);
    m4fromYPR(T, 0.2, 1.75, -6.4, 0, this.spin * 1.7, 0, 1, 1, 1); m4mul(W, M, T);
    // tail rotor spins around the x axis
    this.tail.add(W, 1, 1, 1, 1);
    // spotlight cone (night or dusk): unit cone along -Y scaled and aimed at the spot
    if (!this.crashed && g.env.night > 0.15 && coneBatches) {
      const ax = this.x, ay = this.y - 0.2, az = this.z + 0;
      const dx = this.spot[0] - ax, dy = 0 - ay, dz = this.spot[2] - az, len = Math.hypot(dx, dy, dz);
      const yx = -dx / len, yy = -dy / len, yz = -dz / len; // local +Y maps to -dir
      let xx = yz, xy = 0, xz = -yx; const xl = Math.hypot(xx, xz) || 1; xx /= xl; xz /= xl;
      const zx = xy * yz - xz * yy, zy = xz * yx - xx * yz, zz = xx * yy - xy * yx;
      const r = len * 0.085;
      const C = m4();
      C[0] = xx * r; C[1] = xy * r; C[2] = xz * r;
      C[4] = yx * len; C[5] = yy * len; C[6] = yz * len;
      C[8] = zx * r; C[9] = zy * r; C[10] = zz * r;
      C[12] = ax; C[13] = ay; C[14] = az; C[15] = 1;
      coneBatches[1].add(C, 0.75, 0.85, 1.0, 0.5 * Math.min(1, g.env.night * 2));
    }
  }
  collectLights(out, night) {
    if (!this.active || this.crashed) return;
    if (night > 0.15) {
      const dx = this.spot[0] - this.x, dy = -this.y, dz = this.spot[2] - this.z, len = Math.hypot(dx, dy, dz);
      out.push({ x: this.x, y: this.y - 0.5, z: this.z, radius: len + 20, r: 0.85, g: 0.92, b: 1.0, intensity: 5.5 * Math.min(1, night * 2), dir: [dx / len, dy / len, dz / len], cos: 0.985, priority: 4 });
    }
    const blink = Math.floor(this.game.time * 2) % 2 === 0;
    if (blink) out.push({ x: this.x, y: this.y + 1, z: this.z - 6, radius: 12, r: 1, g: 0.1, b: 0.1, intensity: 2, priority: 1 });
  }
  batches() { return [this.body, this.rotor, this.tail]; }
}
