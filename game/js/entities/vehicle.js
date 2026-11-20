// Arcade vehicle physics (throttle, brake/reverse, speed-sensitive steering, lateral grip, handbrake drifts)
// plus the vehicle system: spawning, entering/carjacking, collisions with world/cars/people, damage and rendering.
import { VEHICLE_SPECS, buildVehicleMeshes } from './vehicle-model.js';
import { InstanceBatch } from '../engine/instancing.js';
import { m4, m4mul, m4fromYPR, clamp, damp, wrapAngle, lerp } from '../core/math.js';
import { groundHeight } from '../world/city-meshes.js';

let VID = 1;

export class Vehicle {
  constructor(system, model, x, z, yaw, color) {
    this.id = VID++;
    this.system = system;
    this.model = model;
    this.spec = VEHICLE_SPECS[model];
    this.x = x; this.z = z; this.y = groundHeight(x, z); this.yaw = yaw;
    this.vx = 0; this.vz = 0; this.angVel = 0;
    this.steer = 0; this.throttle = 0; this.handbrake = false; this.brakeLight = 0;
    this.color = color || this.spec.colors[0];
    this.health = 1000;
    this.fire = 0; this.destroyed = false; this.burnt = 0; this.wreckTimer = 0;
    this.driver = null; this.passengers = [];
    this.wheelSpin = 0;
    this.roll = 0; this.pitch = 0;
    this.siren = false; this.sirenPhase = 0;
    this.headlights = false;
    this.horn = 0;
    this.ai = null;
    this.parked = false;
    this.isPolice = !!this.spec.police;
    this.lastImpact = 0;
    this.skidding = 0;
    this.matrix = m4();
    this.radius = this.spec.W * 0.55;
  }
  get pos() { return [this.x, this.y + 0.8, this.z]; }
  get fwd() { return [Math.sin(this.yaw), Math.cos(this.yaw)]; }
  get right() { return [-Math.cos(this.yaw), Math.sin(this.yaw)]; }
  get forwardSpeed() { const f = this.fwd; return this.vx * f[0] + this.vz * f[1]; }
  get speed() { return Math.hypot(this.vx, this.vz); }
  local(lx, ly, lz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return [this.x + lx * c + lz * s, this.y + ly, this.z - lx * s + lz * c];
  }
  seatWorld(i = 0) { const st = this.spec.seat; return this.local(i === 0 ? st[0] : -st[0], st[1], st[2]); }
  doorWorld(i = 0) { const st = this.spec.seat; return this.local((i === 0 ? -1 : 1) * (this.spec.W / 2 + 0.55), 0, st[2] + 0.15); }
  // Circles along the body for collision.
  circles() {
    const L = this.spec.L, r = this.spec.W * 0.5, f = this.fwd;
    const n = L > 5 ? 3 : 2;
    const out = [];
    for (let i = 0; i < n; i++) { const t = n === 2 ? (i ? 1 : -1) * (L / 2 - r) : (i - 1) * (L / 2 - r); out.push([this.x + f[0] * t, this.z + f[1] * t, r]); }
    return out;
  }

  update(dt, controls) {
    const s = this.spec;
    if (this.destroyed) { this.vx = damp(this.vx, 0, 2, dt); this.vz = damp(this.vz, 0, 2, dt); this.integrate(dt); return; }
    const c = controls || { throttle: 0, steer: 0, handbrake: false, brake: false };
    const f = this.fwd, r = this.right;
    let fs = this.vx * f[0] + this.vz * f[1];
    let ls = this.vx * r[0] + this.vz * r[1];
    const healthFactor = this.health < 250 ? 0.55 : 1;
    const maxSp = s.maxSpeed * healthFactor;
    let braking = false;
    if (c.throttle > 0) {
      if (fs < -0.5) { fs = damp(fs, 0, 6, dt); braking = true; }
      else fs += s.accel * c.throttle * Math.max(0, 1 - fs / maxSp) * dt * healthFactor;
    } else if (c.throttle < 0) {
      if (fs > 0.5) { fs = Math.max(0, fs - 22 * -c.throttle * dt); braking = true; }
      else fs = Math.max(-11, fs + s.accel * 0.6 * c.throttle * dt);
    } else {
      fs -= fs * 0.25 * dt + Math.sign(fs) * Math.min(Math.abs(fs), 0.8 * dt);
    }
    if (c.brake) { fs = damp(fs, 0, 3, dt); braking = true; }
    if (c.handbrake) { fs = damp(fs, 0, 1.2, dt); braking = true; }
    // lateral grip: handbrake lets the rear slide
    const grip = c.handbrake ? 1.4 : s.grip * (this.system.game.rain > 0 ? 0.8 : 1);
    const lsBefore = ls;
    ls *= Math.exp(-grip * dt);
    this.skidding = Math.abs(lsBefore) > 4.5 || (c.handbrake && Math.abs(fs) > 8) ? 1 : 0;
    // steering
    this.steer = damp(this.steer, c.steer, 8, dt);
    const steerAngle = this.steer * s.steer / (1 + Math.abs(fs) * 0.045);
    const yawRate = (fs / s.wheelbase) * Math.tan(steerAngle) * (c.handbrake ? 1.5 : 1);
    this.angVel = damp(this.angVel, yawRate, c.handbrake ? 4 : 10, dt);
    this.yaw = wrapAngle(this.yaw - this.angVel * dt);
    const nf = this.fwd, nr = this.right;
    const ax = (fs - (this._lastFs || 0)) / Math.max(dt, 1e-4);
    this._lastFs = fs;
    this.vx = nf[0] * fs + nr[0] * ls;
    this.vz = nf[1] * fs + nr[1] * ls;
    this.brakeLight = braking && this.driver ? 1 : 0;
    // suspension feel (visual only)
    this.pitch = damp(this.pitch, clamp(-ax * 0.004, -0.06, 0.06), 6, dt);
    this.roll = damp(this.roll, clamp(-this.angVel * fs * 0.004, -0.08, 0.08), 6, dt);
    this.integrate(dt);
  }

  integrate(dt) {
    const sys = this.system, col = sys.game.world.collision;
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const prevX = this.x, prevZ = this.z;
    this.x = nx; this.z = nz;
    // world collision using body circles
    const speed = this.speed;
    for (let iter = 0; iter < 2; iter++) {
      for (const cc of this.circles()) {
        const res = col.resolveCircle(cc[0], cc[1], cc[2], this.y, 1.4);
        if (!res.hit) continue;
        const o = res.obj;
        if (o && o.kind === 'circle' && (o.tag === 'lamp' || o.tag === 'hydrant' || o.tag === 'signal' || o.tag === 'barrel') && speed > 5) {
          if (o.tag === 'lamp' && o.data) sys.game.world.props.knockLamp(o.data, this.vx, this.vz);
          else o.alive = false;
          this.vx *= 0.8; this.vz *= 0.8;
          sys.game.audio?.play('crash', this.pos, 0.5);
          sys.onImpact(this, 4, res.nx, res.nz, o);
          continue;
        }
        const px = res.x - cc[0], pz = res.z - cc[1];
        this.x += px; this.z += pz;
        const vn = this.vx * res.nx + this.vz * res.nz;
        if (vn < 0) {
          this.vx -= (1.25) * vn * res.nx; this.vz -= (1.25) * vn * res.nz;
          this.vx *= 0.85; this.vz *= 0.85;
          if (-vn > 3) sys.onImpact(this, -vn, res.nx, res.nz, o);
        }
      }
    }
    if (!col.inBounds(this.x, this.z)) { this.x = prevX; this.z = prevZ; this.vx *= -0.3; this.vz *= -0.3; }
    const gh = groundHeight(this.x, this.z);
    this.y = damp(this.y, gh, 14, dt);
    this.wheelSpin += this.forwardSpeed * dt / this.spec.wheelR;
  }

  damage(amount, source) {
    if (this.destroyed || this.invulnerable) return;
    this.health -= amount * (this.damageMult || 1);
    this.lastAttacker = source || this.lastAttacker;
    if (this.health < 120 && !this.fire) this.fire = 0.01;
  }
}

export class VehicleSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.meshes = buildVehicleMeshes(game.gl);
    this.batches = {};
    for (const [k, mesh] of Object.entries(this.meshes)) this.batches[k] = new InstanceBatch(mesh, { name: 'veh_' + k });
    this.tmp = m4(); this.tmp2 = m4(); this.tmp3 = m4();
  }
  spawn(model, x, z, yaw, color) {
    const v = new Vehicle(this, model, x, z, yaw, color);
    this.list.push(v);
    return v;
  }
  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
    if (v.driver && v.driver !== this.game.player) this.game.removeCharacter(v.driver);
    for (const p of v.passengers) if (p !== this.game.player) this.game.removeCharacter(p);
  }
  nearestEnterable(px, pz, maxD = 5) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (v.destroyed) continue;
      const d = Math.min(Math.hypot(v.x - px, v.z - pz) - 1.2, Math.hypot(v.doorWorld()[0] - px, v.doorWorld()[2] - pz));
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }
  tryEnter(player) {
    const v = this.nearestEnterable(player.x, player.z, 4.5);
    if (!v || v.speed > 9) return false;
    player.beginEnter(v);
    return true;
  }
  carjack(v, player) {
    const d = v.driver;
    if (!d || d === player) return;
    v.driver = null;
    const door = v.doorWorld();
    d.vehicle = null; d.visible = true;
    d.x = door[0] + 0.6; d.z = door[2]; d.y = groundHeight(d.x, d.z);
    d.knockDown(-v.right[0], -v.right[1], 2);
    if (d.flee) d.flee(player, 12);
    this.game.events.emit('crime', { type: v.isPolice ? 'stealCop' : 'carjack', x: v.x, z: v.z, victim: d });
    this.game.stats && (this.game.stats.carsStolen++);
    this.game.audio?.play('shout', d.pos, 0.6);
  }

  onImpact(v, impactSpeed, nx, nz, other) {
    const now = this.game.time;
    if (now - v.lastImpact < 0.25) return;
    v.lastImpact = now;
    const dmg = Math.max(0, impactSpeed - 3.5) * 14;
    v.damage(dmg, v.driver);
    this.game.audio?.play('crash', v.pos, clamp(impactSpeed / 20, 0.2, 1));
    if (impactSpeed > 6) this.game.particles?.sparks(v.x - nx * v.spec.W * 0.5, v.y + 0.5, v.z - nz * v.spec.W * 0.5, nx, nz, Math.min(20, impactSpeed * 1.2));
    if (v.driver === this.game.player) {
      this.game.rig.addShake(clamp(impactSpeed / 18, 0.1, 0.9));
      if (impactSpeed > 18) this.game.slowMo?.(0.35, 0.8);
    }
    if (other && other.isVehicleBody && other.vehicle.isPolice && v.driver === this.game.player) this.game.events.emit('crime', { type: 'damageCop', x: v.x, z: v.z });
  }

  explode(v) {
    v.destroyed = true; v.burnt = 1; v.fire = 0; v.health = 0; v.wreckTimer = 0;
    v.siren = false;
    this.game.combat?.explosion(v.x, v.y + 0.8, v.z, 9, 160, v.lastAttacker || null, v);
    for (const ch of [v.driver, ...v.passengers]) {
      if (!ch) continue;
      if (ch === this.game.player) { this.game.player.state = 'foot'; this.game.player.vehicle = null; this.game.player.visible = true; this.game.player.die(0, 0, 'explosion'); }
      else { ch.vehicle = null; ch.visible = true; ch.die(0, 0, v.lastAttacker); }
    }
    v.driver = null; v.passengers = [];
    this.game.events.emit('vehicleDestroyed', { vehicle: v, attacker: v.lastAttacker });
  }

  update(dt) {
    const g = this.game, p = g.player;
    const input = g.controlsLocked ? null : g.input;
    for (const v of this.list) {
      let controls = null;
      if (v.driver === p && p.state === 'driving') {
        const thr = (input?.isDown('KeyW') ? 1 : 0) - (input?.isDown('KeyS') ? 1 : 0);
        const st = (input?.isDown('KeyD') ? 1 : 0) - (input?.isDown('KeyA') ? 1 : 0);
        controls = { throttle: thr, steer: st, handbrake: !!input?.isDown('Space') };
        if (g.autopilot) controls = g.autopilot.controls(v, dt) || controls;
        if (input?.wasPressed('KeyH')) g.audio?.play('horn', v.pos, 0.8);
        v.horn = input?.isDown('KeyH') ? 1 : 0;
        if (input?.wasPressed('KeyF') && v.speed < 9) p.beginExit();
      } else if (v.ai && v.driver && v.driver.alive) controls = v.ai.controls;
      else controls = { throttle: 0, steer: 0, handbrake: v.speed < 2 };
      v.update(dt, controls);
      // damage states
      if (!v.destroyed) {
        if (v.fire > 0) { v.fire += dt; v.health -= dt * 45; }
        if (v.health <= 0) this.explode(v);
        v.headlights = g.env.night > 0.3 || g.rain > 0.3;
        if (v.siren) v.sirenPhase += dt * 2.6;
      } else v.wreckTimer += dt;
      // smoke and fire particles
      if (g.particles && !v.destroyed && v.health < 400 && Math.random() < dt * 20) {
        const fp = v.local(0, v.spec.belt, v.spec.L / 2 - 0.6);
        if (v.fire > 0) g.particles.fire(fp[0], fp[1], fp[2], 0.8);
        g.particles.smoke(fp[0], fp[1] + 0.3, fp[2], v.health < 250 ? 0.25 : 0.55, 0.9);
      }
      if (g.particles && v.destroyed && v.wreckTimer < 25 && Math.random() < dt * 8) g.particles.smoke(v.x, v.y + 1.2, v.z, 0.12, 1.4);
      if (g.particles && v.skidding && v.speed > 6 && !v.destroyed) {
        for (const side of [-1, 1]) { const w = v.local(side * v.spec.track / 2, 0, -v.spec.wheelbase / 2); g.particles.skid(w[0], w[2], v.yaw); }
        if (Math.random() < dt * 25) { const w = v.local(0, 0.2, -v.spec.L / 2); g.particles.smoke(w[0], w[1], w[2], 0.75, 0.6); }
      }
    }
    this.collideVehicles(dt);
    this.hitPedestrians();
    // clean up old wrecks far from the player
    for (const v of this.list.slice()) if (v.destroyed && v.wreckTimer > 40 && Math.hypot(v.x - p.x, v.z - p.z) > 80 && !v.keep) this.remove(v);
  }

  collideVehicles() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (dx0 * dx0 + dz0 * dz0 > 100) continue;
        for (const ca of a.circles()) for (const cb of b.circles()) {
          const dx = cb[0] - ca[0], dz = cb[1] - ca[1], rr = ca[2] + cb[2];
          const d2 = dx * dx + dz * dz;
          if (d2 >= rr * rr || d2 < 1e-6) continue;
          const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, pen = rr - d;
          const ma = a.spec.mass, mb = b.spec.mass, tot = ma + mb;
          a.x -= nx * pen * (mb / tot); a.z -= nz * pen * (mb / tot);
          b.x += nx * pen * (ma / tot); b.z += nz * pen * (ma / tot);
          const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (rv < 0) {
            const jimp = -(1.3) * rv / (1 / ma + 1 / mb);
            a.vx -= (jimp / ma) * nx; a.vz -= (jimp / ma) * nz;
            b.vx += (jimp / mb) * nx; b.vz += (jimp / mb) * nz;
            const imp = -rv;
            if (imp > 3) {
              this.onImpact(a, imp * mb / tot * 1.6, -nx, -nz, { isVehicleBody: true, vehicle: b });
              this.onImpact(b, imp * ma / tot * 1.6, nx, nz, { isVehicleBody: true, vehicle: a });
              const pl = this.game.player;
              if ((a.driver === pl && b.isPolice) || (b.driver === pl && a.isPolice)) this.game.events.emit('crime', { type: 'damageCop', x: a.x, z: a.z });
            }
          }
        }
      }
    }
  }

  hitPedestrians() {
    const g = this.game;
    for (const v of this.list) {
      const sp = v.speed;
      if (sp < 2.5) continue;
      for (const ch of g.characters) {
        if (!ch.alive || ch.vehicle || ch.anim.mode === 'down') continue;
        if (Math.abs(ch.x - v.x) > 5 || Math.abs(ch.z - v.z) > 5) continue;
        for (const c of v.circles()) {
          const dx = ch.x - c[0], dz = ch.z - c[1];
          if (dx * dx + dz * dz > (c[2] + 0.3) ** 2) continue;
          const d = Math.hypot(dx, dz) || 1;
          const dirX = dx / d * 0.5 + v.vx / sp * 0.5, dirZ = dz / d * 0.5 + v.vz / sp * 0.5;
          const dmg = sp * sp * 0.55;
          if (ch === g.player) { if (v.driver === g.player) continue; ch.damage(dmg * 0.5, v.driver, dirX, dirZ); if (ch.alive) ch.knockDown(dirX, dirZ, sp * 0.4); }
          else {
            const killed = ch.damage(dmg, v.driver, dirX, dirZ);
            if (!killed) ch.knockDown(dirX, dirZ, sp * 0.5); else { ch.vx = dirX * sp * 0.6; ch.vz = dirZ * sp * 0.6; }
            if (v.driver === g.player) g.events.emit('crime', { type: killed ? (ch.kind === 'cop' ? 'killCop' : 'kill') : 'hitPed', x: ch.x, z: ch.z, victim: ch });
          }
          g.audio?.play('thud', ch.pos, 0.7);
          v.vx *= 0.93; v.vz *= 0.93;
          break;
        }
      }
    }
  }

  render(camPos) {
    for (const b of Object.values(this.batches)) b.reset();
    const M = this.tmp, W = this.tmp2, T = this.tmp3;
    for (const v of this.list) {
      if (Math.abs(v.x - camPos[0]) > 420 || Math.abs(v.z - camPos[2]) > 420) continue;
      const s = v.spec;
      m4fromYPR(M, v.x, v.y, v.z, v.yaw, v.pitch, v.roll);
      v.matrix.set(M);
      const c = v.color;
      this.batches[s.key].add(M, c[0], c[1], c[2], 1, v.brakeLight, v.siren ? v.sirenPhase : -1, v.headlights ? 1 : 0, v.burnt);
      const steerA = v.steer * s.steer;
      for (const [wx, wz, front] of [[s.track / 2, s.wheelbase / 2, 1], [-s.track / 2, s.wheelbase / 2, 1], [s.track / 2, -s.wheelbase / 2, 0], [-s.track / 2, -s.wheelbase / 2, 0]]) {
        m4fromYPR(T, wx, s.wheelR, wz, front ? -steerA : 0, v.wheelSpin * -1, 0, s.wheelR * 0.98, s.wheelR, s.wheelR);
        m4mul(W, M, T);
        this.batches.wheel.add(W, 1, 1, 1, 1, 0, 0, 0, v.burnt);
      }
    }
  }
  list_batches() { return Object.values(this.batches); }

  collectLights(out, camPos, night) {
    for (const v of this.list) {
      if (v.destroyed) { if (v.wreckTimer < 20) { const dx = v.x - camPos[0], dz = v.z - camPos[2]; if (dx * dx + dz * dz < 150 * 150) out.push({ x: v.x, y: v.y + 1.5, z: v.z, radius: 14, r: 1, g: 0.45, b: 0.15, intensity: 2.5 * (1 - v.wreckTimer / 20) * (0.8 + Math.random() * 0.4) }); } continue; }
      const dx = v.x - camPos[0], dz = v.z - camPos[2];
      const d2 = dx * dx + dz * dz;
      if (d2 > 220 * 220) continue;
      const f = v.fwd;
      if (v.headlights) {
        const hp = v.local(0, v.spec.belt - 0.1, v.spec.L / 2 + 0.3);
        out.push({ x: hp[0], y: hp[1], z: hp[2], radius: 30, r: 1, g: 0.95, b: 0.82, intensity: 2.6, dir: [f[0] * 0.97, -0.24, f[1] * 0.97], cos: 0.78, priority: v.driver === this.game.player ? 3 : 0 });
        if (d2 < 90 * 90) { const tp = v.local(0, v.spec.belt - 0.2, -v.spec.L / 2 - 0.4); out.push({ x: tp[0], y: tp[1], z: tp[2], radius: 5, r: 1, g: 0.05, b: 0.03, intensity: 0.8 + v.brakeLight * 2 }); }
      }
      if (v.siren) {
        const red = (v.sirenPhase % 1) < 0.5;
        const lp = v.local(red ? -0.4 : 0.4, v.spec.roof + 0.4, 0);
        out.push({ x: lp[0], y: lp[1], z: lp[2], radius: 22, r: red ? 1 : 0.1, g: red ? 0.05 : 0.25, b: red ? 0.05 : 1, intensity: 3.2, priority: 2 });
      }
      if (v.fire > 0) out.push({ x: v.x, y: v.y + 1.2, z: v.z, radius: 10, r: 1, g: 0.5, b: 0.15, intensity: 2 * (0.7 + Math.random() * 0.5) });
    }
  }
}
