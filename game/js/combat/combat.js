// Combat resolution: hitscan raycasts against the city, vehicles and characters; melee; NPC gunfire with
// imperfect accuracy; explosions with falloff, knockback, chain reactions, camera shake and slow motion.
import { clamp } from '../core/math.js';

// Ray vs vertical capsule (character body) -> distance or null.
function rayCharacter(o, d, ch, maxT) {
  const h = 1.8 * (ch.look.height || 1);
  const r = ch.anim.mode === 'dead' || ch.anim.mode === 'down' ? 0.5 : 0.36;
  const fx = o[0] - ch.x, fz = o[2] - ch.z;
  const a = d[0] * d[0] + d[2] * d[2];
  if (a < 1e-8) return null;
  const b = 2 * (fx * d[0] + fz * d[2]), c = fx * fx + fz * fz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const y = o[1] + d[1] * t - ch.y;
  const lying = ch.anim.mode === 'dead' || ch.anim.mode === 'down';
  if (y < -0.1 || y > (lying ? 0.6 : h)) return null;
  return { t, head: !lying && y > h * 0.84 };
}
function rayVehicle(o, d, v, maxT) {
  let best = null;
  for (const c of v.circles()) {
    const fx = o[0] - c[0], fz = o[2] - c[1];
    const a = d[0] * d[0] + d[2] * d[2]; if (a < 1e-8) continue;
    const b = 2 * (fx * d[0] + fz * d[2]), cc = fx * fx + fz * fz - c[2] * c[2];
    const disc = b * b - 4 * a * cc; if (disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    if (t < 0 || t > maxT) continue;
    const y = o[1] + d[1] * t - v.y;
    if (y < 0.1 || y > v.spec.roof + 0.1) continue;
    if (!best || t < best.t) best = { t };
  }
  return best;
}

export class Combat {
  constructor(game) { this.game = game; this.rnd = Math.random; }

  // Closest hit along a ray: {t, kind:'world'|'char'|'vehicle', obj, point, normal}.
  trace(o, d, range, ignore) {
    const g = this.game;
    const w = g.world.collision.raycast(o[0], o[1], o[2], d[0], d[1], d[2], range);
    let best = w ? { t: w.t, kind: 'world', normal: w.normal, obj: w.obj } : { t: range, kind: 'none' };
    for (const ch of g.characters) {
      if (ch === ignore || !ch.visible || ch.vehicle) continue;
      if (Math.abs(ch.x - o[0]) > range + 2 && Math.abs(ch.z - o[2]) > range + 2) continue;
      const h = rayCharacter(o, d, ch, best.t);
      if (h) best = { t: h.t, kind: 'char', obj: ch, head: h.head };
    }
    for (const v of g.vehicles.list) {
      if (ignore && ignore.vehicle === v) continue;
      const h = rayVehicle(o, d, v, best.t);
      if (h) best = { t: h.t, kind: 'vehicle', obj: v };
    }
    const heli = g.helicopter;
    if (heli && heli.active && !heli.crashed) {
      const fx = heli.x - o[0], fy = heli.y + 1.2 - o[1], fz = heli.z - o[2];
      const t = fx * d[0] + fy * d[1] + fz * d[2];
      if (t > 0 && t < best.t) { const px = o[0] + d[0] * t - heli.x, py = o[1] + d[1] * t - heli.y - 1.2, pz = o[2] + d[2] * t - heli.z; if (px * px + py * py + pz * pz < 2.4 * 2.4) best = { t, kind: 'heli', obj: heli }; }
    }
    best.point = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
    return best;
  }

  muzzlePos(shooter) {
    if (shooter.vehicle) { const v = shooter.vehicle; return v.local(-0.9, v.spec.belt + 0.4, 0.2); }
    const f = [Math.sin(shooter.yaw), Math.cos(shooter.yaw)], r = [-Math.cos(shooter.yaw), Math.sin(shooter.yaw)];
    const h = shooter.look.height || 1;
    return [shooter.x + f[0] * 0.75 + r[0] * 0.2, shooter.y + 1.38 * h, shooter.z + f[1] * 0.75 + r[1] * 0.2];
  }

  shoot(shooter, w, ray, bloom = 0) {
    const g = this.game;
    const muzzle = this.muzzlePos(shooter);
    // find the aim point from the camera ray, then shoot from the muzzle toward it
    const aimHit = this.trace(ray.origin, ray.dir, w.range, shooter);
    const pellets = w.pellets || 1;
    let anyHit = false;
    for (let i = 0; i < pellets; i++) {
      const sp = w.spread * (1 + bloom * 1.5) * (shooter.aiming ? 0.6 : 1.4);
      let dx = aimHit.point[0] - muzzle[0], dy = aimHit.point[1] - muzzle[1], dz = aimHit.point[2] - muzzle[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      dx = dx / len + (this.rnd() - 0.5) * sp * 2; dy = dy / len + (this.rnd() - 0.5) * sp * 2; dz = dz / len + (this.rnd() - 0.5) * sp * 2;
      const l2 = Math.hypot(dx, dy, dz);
      const d = [dx / l2, dy / l2, dz / l2];
      const hit = this.trace(muzzle, d, w.range, shooter);
      this.applyHit(hit, d, w.damage, shooter);
      g.particles.tracer(muzzle[0], muzzle[1], muzzle[2], hit.point[0], hit.point[1], hit.point[2]);
      if (hit.kind === 'char' || hit.kind === 'vehicle' || hit.kind === 'heli') anyHit = true;
    }
    g.particles.muzzle(muzzle[0], muzzle[1], muzzle[2]);
    g.particles.casing(muzzle[0], muzzle[1] - 0.1, muzzle[2], [-Math.cos(shooter.yaw), Math.sin(shooter.yaw)]);
    g.audio?.play(w.sound, muzzle, 1);
    g.rig.addShake(w.shake || 0.1);
    if (anyHit && shooter === g.player) g.hud?.hitMarker();
    g.events.emit('crime', { type: 'gunfire', x: shooter.x, z: shooter.z });
    g.peds.panic(shooter.x, shooter.z, 45, shooter);
    g.traffic.scare(shooter.x, shooter.z, 40);
    g.events.emit('gunshot', { shooter });
  }

  applyHit(hit, d, damage, shooter) {
    const g = this.game, P = g.particles, p = hit.point;
    if (hit.kind === 'char') {
      const ch = hit.obj;
      const dmg = damage * (hit.head ? 2.5 : 1);
      const killed = ch.damage(dmg, shooter, d[0], d[2]);
      P.spawn({ x: p[0], y: p[1], z: p[2], vx: d[0] * 2, vy: 1, vz: d[2] * 2, life: 0.3, size: 0.08, grow: 0.4, r: 0.25, g: 0.05, b: 0.05, a: 0.7, type: 0, additive: false, emis: 0 });
      if (killed) P.mark(ch.x + d[0] * 0.6, ch.z + d[2] * 0.6);
      if (shooter === g.player) this.reportAttack(ch, killed);
      if (ch.onHit) ch.onHit(shooter);
      if (ch === g.player) g.hud?.damageFrom(shooter);
      g.audio?.play('hit', p, 0.5);
    } else if (hit.kind === 'vehicle') {
      const v = hit.obj;
      v.damage(damage * 0.45, shooter);
      P.sparks(p[0], p[1], p[2], -d[0], -d[2], 4);
      g.audio?.play('ricochet', p, 0.4);
      if (shooter === g.player && v.isPolice) g.events.emit('crime', { type: 'damageCop', x: v.x, z: v.z });
      if (v.driver && v.driver !== g.player && v.driver.alive && this.rnd() < 0.15) { const dr = v.driver; if (dr.damage(damage * 0.5, shooter, d[0], d[2])) { dr.vehicle = null; v.driver = null; } }
    } else if (hit.kind === 'heli') {
      hit.obj.damage(damage, shooter);
      P.sparks(p[0], p[1], p[2], -d[0], -d[2], 5);
    } else if (hit.kind === 'world') {
      const n = hit.normal;
      P.impact(p[0], p[1], p[2], n[0], n[1], n[2]);
    }
  }

  // Crimes for hurting people; civilians react.
  reportAttack(ch, killed) {
    const g = this.game;
    if (ch.kind === 'cop') g.events.emit('crime', { type: killed ? 'killCop' : 'shootCop', x: ch.x, z: ch.z, victim: ch });
    else if (ch.kind === 'civ') g.events.emit('crime', { type: killed ? 'kill' : 'assault', x: ch.x, z: ch.z, victim: ch });
    if (killed) { g.stats.kills++; }
  }

  melee(attacker) {
    const g = this.game;
    const f = [Math.sin(attacker.yaw), Math.cos(attacker.yaw)];
    g.audio?.play('swing', attacker.pos, 0.4);
    for (const ch of g.characters) {
      if (ch === attacker || !ch.alive || ch.vehicle) continue;
      const dx = ch.x - attacker.x, dz = ch.z - attacker.z, d = Math.hypot(dx, dz);
      if (d > 1.6 || (dx * f[0] + dz * f[1]) / (d || 1) < 0.45) continue;
      const killed = ch.damage(12 + this.rnd() * 6, attacker, dx / d, dz / d);
      if (!killed && this.rnd() < 0.3) ch.knockDown(dx / d, dz / d, 2.5);
      g.audio?.play('punch', ch.pos, 0.8);
      g.rig.addShake(0.12);
      if (attacker === g.player) { g.hud?.hitMarker(); this.reportAttack(ch, killed); }
      if (ch.onHit) ch.onHit(attacker);
      if (ch === g.player) g.hud?.damageFrom(attacker);
      if (ch.flee && ch.kind === 'civ') ch.flee(attacker, 8);
      break;
    }
  }

  // NPC fires at a target with an accuracy roll.
  npcShoot(shooter, target, accuracy, damage) {
    const g = this.game;
    const m = this.muzzlePos(shooter);
    const tv = target.state === 'driving' && target.vehicle ? target.vehicle : null;
    const tx = tv ? tv.x : target.x, ty = (tv ? tv.y + 0.9 : target.y + 1.2), tz = tv ? tv.z : target.z;
    const hitRoll = this.rnd() < accuracy;
    const miss = hitRoll ? 0.05 : 0.6 + this.rnd() * 1.2;
    const ax = tx + (this.rnd() - 0.5) * miss * 2, ay = ty + (this.rnd() - 0.5) * miss, az = tz + (this.rnd() - 0.5) * miss * 2;
    let dx = ax - m[0], dy = ay - m[1], dz = az - m[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    const d = [dx / len, dy / len, dz / len];
    const hit = this.trace(m, d, 80, shooter);
    if (hit.kind === 'char' && hit.obj.kind === shooter.kind && hit.obj !== g.player) hit.kind = 'none'; // no friendly fire
    if (hit.kind !== 'none') this.applyHit(hit, d, damage, shooter);
    g.particles.tracer(m[0], m[1], m[2], hit.point[0], hit.point[1], hit.point[2], [1, 0.7, 0.4]);
    g.particles.muzzle(m[0], m[1], m[2]);
    g.audio?.play(shooter.weaponSound || 'pistol', m, 0.7);
    if (tv && hit.kind === 'vehicle' && hit.obj === tv) g.hud?.damageFrom(shooter);
    g.peds.panic(shooter.x, shooter.z, 30, shooter);
  }

  explosion(x, y, z, radius, damage, source, skipVehicle = null) {
    const g = this.game;
    g.particles.explosion(x, y, z, radius / 8);
    g.lightsFx.flash(x, y + 2, z, [1, 0.6, 0.25], 9, radius * 4, 0.6);
    g.audio?.play('explosion', [x, y, z], 1);
    const pd = Math.hypot(g.player.x - x, g.player.z - z);
    g.rig.addShake(clamp(1.4 - pd / 60, 0, 1.2));
    if (pd < 35) g.slowMo?.(0.3, 0.9);
    g.audio?.duck(0.6, 1.2);
    for (const ch of g.characters) {
      if (!ch.alive || ch.vehicle) continue;
      const dx = ch.x - x, dz = ch.z - z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = 1 - d / radius;
      const killed = ch.damage(damage * k, source, dx / (d || 1), dz / (d || 1));
      if (!killed) ch.knockDown(dx / (d || 1), dz / (d || 1), 6 * k);
      else { ch.vx = dx / (d || 1) * 8 * k; ch.vz = dz / (d || 1) * 8 * k; ch.vy = 4 * k; }
      if (source === g.player && ch !== g.player) this.reportAttack(ch, killed);
    }
    for (const v of g.vehicles.list) {
      if (v === skipVehicle || v.destroyed) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d > radius) continue;
      const k = 1 - d / radius;
      v.damage(damage * 4 * k, source);
      v.vx += (v.x - x) / (d || 1) * 6 * k; v.vz += (v.z - z) / (d || 1) * 6 * k;
    }
    if (source === g.player) g.events.emit('crime', { type: 'explosion', x, z });
    g.peds.panic(x, z, 70, { x, z });
    g.traffic.scare(x, z, 60);
    g.events.emit('explosion', { x, z, source });
  }
}
