// Dialogue + cutscene player: speaker-colored subtitles with portrait cards, scripted camera shots
// (orbit/dolly/over-the-shoulder), gesturing actors, letterbox, music ducking and skip support.
import { PORTRAITS } from '../ui/portraits.js';

export const SPEAKERS = {
  kai: { name: 'Kai', color: '#2de2c8' }, lin: { name: 'Mama Lin', color: '#ffd166' }, viktor: { name: 'Viktor Raza', color: '#d77bff' },
  dex: { name: 'Dex', color: '#9aa7ff' }, rendy: { name: 'Rendy', color: '#ffe14f' }, goon: { name: 'Enforcer', color: '#d77bff' }, radio: { name: 'Police Radio', color: '#ff6b81' },
};

// Shot builders. a/b are actors or positions [x,y,z].
const P = (a) => (Array.isArray(a) ? a : [a.x, a.y, a.z]);
export const Shots = {
  orbit(center, radius, height, a0, a1, dur, opts = {}) { const c = P(center); return { type: 'orbit', center: c, radius, height, a0, a1, dur, target: opts.target, rise: opts.rise, fov: opts.fov || 45 }; },
  dolly(from, to, target, targetTo, dur, fov = 45) { return { type: 'dolly', from, to, target, targetTo: targetTo || target, dur, fov }; },
  // over the shoulder of A looking at B
  ots(a, b, dur, side = 1, fov = 40) {
    const A = P(a), B = P(b);
    const dx = A[0] - B[0], dz = A[2] - B[2], d = Math.hypot(dx, dz) || 1;
    const rx = -dz / d * side, rz = dx / d * side;
    const from = [A[0] + dx / d * 1.6 + rx * 0.7, A[1] + 1.75, A[2] + dz / d * 1.6 + rz * 0.7];
    const to = [A[0] + dx / d * 1.3 + rx * 0.6, A[1] + 1.72, A[2] + dz / d * 1.3 + rz * 0.6];
    return { type: 'dolly', from, to, target: [B[0], B[1] + 1.55, B[2]], dur, fov };
  },
  // wide two-shot from the side
  two(a, b, dur, side = 1, dist = 4.2, fov = 42) {
    const A = P(a), B = P(b);
    const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2;
    const dx = B[0] - A[0], dz = B[2] - A[2], d = Math.hypot(dx, dz) || 1;
    const nx = -dz / d * side, nz = dx / d * side;
    return { type: 'dolly', from: [mx + nx * dist - dx / d * 0.6, A[1] + 1.4, mz + nz * dist - dz / d * 0.6], to: [mx + nx * (dist - 0.6) + dx / d * 0.6, A[1] + 1.5, mz + nz * (dist - 0.6) + dz / d * 0.6], target: [mx, A[1] + 1.35, mz], dur, fov };
  },
};

export class Dialogue {
  constructor(game) { this.game = game; this.queue = []; this.cur = null; this.t = 0; this.onDone = null; }
  get active() { return !!this.cur || this.queue.length > 0; }
  // lines: [{who, text, dur?, shot?, actor?}]
  play(lines, onDone) {
    this.queue = lines.slice(); this.onDone = onDone; this.next();
    this.game.audio.setDialogueDuck(true);
  }
  next() {
    const g = this.game;
    if (this.cur?.actor) this.cur.actor.talking = false;
    this.cur = this.queue.shift() || null;
    this.t = 0;
    if (!this.cur) { g.hud.subtitle = null; g.audio.setDialogueDuck(false); const f = this.onDone; this.onDone = null; f && f(); return; }
    const sp = SPEAKERS[this.cur.who] || { name: this.cur.who, color: '#fff' };
    this.cur.dur = this.cur.dur || Math.max(2.4, this.cur.text.length * 0.055 + 1.0);
    g.hud.say(sp.name, this.cur.text, sp.color, this.cur.dur, PORTRAITS[this.cur.who] ? this.cur.who : null);
    if (this.cur.actor) this.cur.actor.talking = true;
    if (this.cur.shot) { g.rig.shot = this.cur.shot; this.shotT = 0; }
    if (this.cur.run) this.cur.run();
  }
  skip() { if (this.cur) this.t = this.cur.dur; }
  update(dt) {
    if (!this.cur) return;
    this.t += dt; this.shotT = (this.shotT || 0) + dt;
    if (this.t >= this.cur.dur) this.next();
  }
}
