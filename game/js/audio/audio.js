// Web Audio engine: everything is synthesized. Positional one-shot effects (PannerNode), continuous
// engine/screech/siren/rotor voices, city ambience (traffic hum, birds or crickets, waves, rain),
// separate music / SFX / radio buses with ducking. Starts on the first user gesture.
import { MusicDirector } from './music/director.js';
import { Radio } from './radio.js';

export class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.vol = { music: 0.7, sfx: 0.8, radio: 0.7 };
    this.voices = {};
    this.lastPlay = {};
  }
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createDynamicsCompressor();
    this.master.threshold.value = -14; this.master.ratio.value = 4;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.connect(this.master);
    this.radioBus = ctx.createGain(); this.radioBus.connect(this.master);
    this.musicDuck = ctx.createGain(); this.musicDuck.connect(this.musicBus);
    this.radioDuck = ctx.createGain(); this.radioDuck.connect(this.radioBus);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.startContinuous();
    this.music = new MusicDirector(this);
    this.radio = new Radio(this);
    if (this.game.state === 'title') this.music.play('title');
    if (this.game.player?.state === 'driving') this.radio.enterCar();
  }
  setVolumes(s) { this.vol = { music: s.musicVol, sfx: s.sfxVol, radio: s.radioVol }; this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music * 0.8;
    this.radioBus.gain.value = this.vol.radio * 0.8;
  }
  // Music/radio dip under dialogue and explosions.
  duck(amount = 0.5, dur = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const g of [this.musicDuck.gain, this.radioDuck.gain]) {
      g.cancelScheduledValues(t); g.setTargetAtTime(1 - amount, t, 0.05); g.setTargetAtTime(1, t + dur, 0.4);
    }
  }
  setDialogueDuck(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, v = on ? 0.45 : 1;
    this.musicDuck.gain.setTargetAtTime(v, t, 0.2); this.radioDuck.gain.setTargetAtTime(v, t, 0.2);
  }

  // ---------------------------------------------------------------- helpers
  out(pos, vol = 1) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.value = vol;
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 5; p.rolloffFactor = 1.1; p.maxDistance = 400;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; } else p.setPosition(pos[0], pos[1], pos[2]);
      g.connect(p); p.connect(this.sfx);
    } else g.connect(this.sfx);
    return g;
  }
  noiseSrc(dur, rate = 1) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = rate; s.loop = dur > 1.9; s.start(this.ctx.currentTime, Math.random() * 1.5); s.stop(this.ctx.currentTime + dur + 0.05); return s; }
  filt(type, freq, q = 1) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; }
  env(node, t, a, peak, dec, sustain = 0) {
    const g = node.gain; g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + a); g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + a + dec);
  }
  osc(type, f0, f1, t, dur, out, peak = 0.5, a = 0.005) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, a, peak, dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + a + 0.05);
    return o;
  }
  burst(t, dur, out, { type = 'lowpass', freq = 1000, f1 = null, q = 1, peak = 0.6, a = 0.003, rate = 1 } = {}) {
    const ctx = this.ctx, s = this.noiseSrc(dur + a, rate), f = this.filt(type, freq, q), g = ctx.createGain();
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, a, peak, dur); s.connect(f); f.connect(g); g.connect(out);
  }

  play(name, pos = null, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // limit spam of identical sounds
    const k = name + (pos ? Math.round(pos[0] / 3) + ',' + Math.round(pos[2] / 3) : '');
    if (this.lastPlay[k] && now - this.lastPlay[k] < 0.03) return;
    this.lastPlay[k] = now;
    const fn = SFX[name];
    if (!fn) return;
    fn(this, now, this.out(pos, vol));
  }
  ui(name) { if (this.ctx && this.ctx.state === 'running') (SFX['ui_' + name] || SFX.ui_click)(this, this.ctx.currentTime, this.out(null, 0.5)); }

  // ---------------------------------------------------------------- continuous voices
  startContinuous() {
    const ctx = this.ctx;
    const loopNoise = (filterType, freq, q) => { const s = ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = this.filt(filterType, freq, q); const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); s.start(); return { s, f, g }; };
    // engine: saw + square through a lowpass
    const eng = { o1: ctx.createOscillator(), o2: ctx.createOscillator(), f: this.filt('lowpass', 600, 2), g: ctx.createGain() };
    eng.o1.type = 'sawtooth'; eng.o2.type = 'square'; eng.g.gain.value = 0;
    eng.o1.connect(eng.f); eng.o2.connect(eng.f); eng.f.connect(eng.g); eng.g.connect(this.sfx);
    eng.o1.start(); eng.o2.start();
    this.voices.engine = eng;
    const screech = loopNoise('bandpass', 2400, 6); screech.g.connect(this.sfx); this.voices.screech = screech;
    // siren: square through bandpass, positional
    const sir = { o: ctx.createOscillator(), f: this.filt('bandpass', 1100, 1.2), g: ctx.createGain(), p: ctx.createPanner() };
    sir.o.type = 'square'; sir.g.gain.value = 0; sir.p.panningModel = 'equalpower'; sir.p.refDistance = 10; sir.p.rolloffFactor = 0.9;
    sir.o.connect(sir.f); sir.f.connect(sir.g); sir.g.connect(sir.p); sir.p.connect(this.sfx); sir.o.start();
    this.voices.siren = sir;
    // helicopter rotor: lowpassed noise chopped by an LFO
    const rot = loopNoise('lowpass', 260, 1); const lfo = ctx.createOscillator(), lg = ctx.createGain(), vca = ctx.createGain();
    lfo.type = 'square'; lfo.frequency.value = 11; lg.gain.value = 0.5; vca.gain.value = 0.5; lfo.connect(lg); lg.connect(vca.gain); lfo.start();
    const rp = ctx.createPanner(); rp.panningModel = 'equalpower'; rp.refDistance = 20; rp.rolloffFactor = 0.8;
    rot.g.connect(vca); vca.connect(rp); rp.connect(this.sfx); this.voices.rotor = { ...rot, p: rp };
    // ambience
    this.voices.traffic = loopNoise('lowpass', 320, 0.7); this.voices.traffic.g.connect(this.sfx);
    this.voices.waves = loopNoise('lowpass', 700, 0.5); this.voices.waves.g.connect(this.sfx);
    this.voices.rain = loopNoise('highpass', 2500, 0.5); this.voices.rain.g.connect(this.sfx);
    this.ambT = 0;
  }
  setPanner(p, x, y, z) { if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z); }

  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const g = this.game, ctx = this.ctx, t = ctx.currentTime, cam = g.camera;
    this.music?.update(g);
    const L = ctx.listener;
    if (L.positionX) {
      L.positionX.value = cam.pos[0]; L.positionY.value = cam.pos[1]; L.positionZ.value = cam.pos[2];
      L.forwardX.value = cam.forward[0]; L.forwardY.value = cam.forward[1]; L.forwardZ.value = cam.forward[2];
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(...cam.pos); L.setOrientation(...cam.forward, 0, 1, 0); }
    const playing = g.state === 'playing' || g.state === 'cutscene';
    const p = g.player, v = playing && p.state === 'driving' ? p.vehicle : null;
    // engine with gears
    const eng = this.voices.engine;
    if (v && !v.destroyed) {
      const sp = Math.abs(v.forwardSpeed);
      const gearW = v.spec.maxSpeed / 5;
      const gear = Math.min(4, Math.floor(sp / gearW));
      const rpm = (sp - gear * gearW) / gearW;
      if (gear !== this.lastGear) { this.lastGear = gear; if (gear > 0) this.play('shift', null, 0.3); }
      const base = v.spec.truck ? 32 : v.spec.key === 'vesper' ? 58 : 44;
      const f = base + rpm * base * 1.6 + gear * 6;
      eng.o1.frequency.setTargetAtTime(f, t, 0.05); eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      eng.f.frequency.setTargetAtTime(400 + Math.abs(v.throttle || 0) * 900 + rpm * 800, t, 0.05);
      const thr = g.input.isDown('KeyW') || g.input.isDown('KeyS') ? 1 : 0.55;
      eng.g.gain.setTargetAtTime(0.09 * thr, t, 0.1);
      const sk = v.skidding && v.speed > 6 ? 0.16 : 0;
      this.voices.screech.g.gain.setTargetAtTime(sk, t, 0.04);
    } else { eng.g.gain.setTargetAtTime(0, t, 0.15); this.voices.screech.g.gain.setTargetAtTime(0, t, 0.05); this.lastGear = -1; }
    // nearest siren with a doppler-ish pitch shift
    let best = null, bd = 160;
    if (playing) for (const c of g.vehicles.list) if (c.siren) { const d = Math.hypot(c.x - cam.pos[0], c.z - cam.pos[2]); if (d < bd) { bd = d; best = c; } }
    const sir = this.voices.siren;
    if (best) {
      const dx = cam.pos[0] - best.x, dz = cam.pos[2] - best.z, d = Math.hypot(dx, dz) || 1;
      const lv = v ? (v.vx * -dx + v.vz * -dz) / d : 0;
      const approach = (best.vx * dx + best.vz * dz) / d - lv;
      const dop = 1 + approach / 120;
      const hi = Math.floor(g.time / 0.45) % 2 === 0;
      sir.o.frequency.setTargetAtTime((hi ? 960 : 720) * dop, t, 0.02);
      sir.g.gain.setTargetAtTime(0.12, t, 0.1);
      this.setPanner(sir.p, best.x, best.y + 1.5, best.z);
    } else sir.g.gain.setTargetAtTime(0, t, 0.3);
    // helicopter
    const h = g.helicopter, rot = this.voices.rotor;
    if (playing && h && h.active) { rot.g.gain.setTargetAtTime(0.5, t, 0.3); this.setPanner(rot.p, h.x, h.y, h.z); } else rot.g.gain.setTargetAtTime(0, t, 0.4);
    // ambience
    const onFoot = playing && p.state !== 'driving';
    const night = g.env?.night || 0;
    this.voices.traffic.g.gain.setTargetAtTime(playing ? (onFoot ? 0.05 : 0.025) : 0.03, t, 0.5);
    const seaDist = Math.min(cam.pos[2] < 0 ? 0 : 999, Math.abs(cam.pos[2] - 940), Math.abs(cam.pos[0] - 930), Math.abs(cam.pos[0] + 30), Math.abs(cam.pos[2] + 30));
    const wv = Math.max(0, 1 - seaDist / 80) * (0.6 + 0.4 * Math.sin(t * 0.7));
    this.voices.waves.g.gain.setTargetAtTime(wv * 0.12, t, 0.3);
    this.voices.rain.g.gain.setTargetAtTime(g.rain * 0.08, t, 0.5);
    this.ambT -= dt;
    if (onFoot && this.ambT <= 0) {
      this.ambT = 0.8 + Math.random() * 2.5;
      const pos = [cam.pos[0] + (Math.random() - 0.5) * 40, 6, cam.pos[2] + (Math.random() - 0.5) * 40];
      if (g.rain < 0.3) this.play(night > 0.5 ? 'cricket' : 'bird', pos, 0.25);
    }
  }
}

// ---------------------------------------------------------------- one-shot effects
const SFX = {
  pistol(a, t, o) { a.burst(t, 0.14, o, { type: 'bandpass', freq: 1800, f1: 500, q: 0.8, peak: 0.9 }); a.osc('sine', 160, 45, t, 0.12, o, 0.9); },
  smg(a, t, o) { a.burst(t, 0.08, o, { type: 'bandpass', freq: 2400, f1: 900, q: 0.9, peak: 0.7 }); a.osc('sine', 200, 60, t, 0.07, o, 0.6); },
  shotgun(a, t, o) { a.burst(t, 0.38, o, { type: 'lowpass', freq: 2200, f1: 200, peak: 1.0 }); a.osc('sine', 110, 35, t, 0.25, o, 1); a.burst(t + 0.45, 0.05, o, { type: 'highpass', freq: 3000, peak: 0.25 }); a.burst(t + 0.6, 0.05, o, { type: 'highpass', freq: 2500, peak: 0.25 }); },
  reload(a, t, o) { a.burst(t, 0.03, o, { type: 'highpass', freq: 3000, peak: 0.4 }); a.burst(t + 0.35, 0.04, o, { type: 'highpass', freq: 2200, peak: 0.4 }); },
  reloadDone(a, t, o) { a.burst(t, 0.04, o, { type: 'highpass', freq: 2600, peak: 0.5 }); a.osc('square', 900, 700, t, 0.03, o, 0.08); },
  dry(a, t, o) { a.burst(t, 0.02, o, { type: 'highpass', freq: 4000, peak: 0.3 }); },
  switch(a, t, o) { a.burst(t, 0.03, o, { type: 'bandpass', freq: 2000, peak: 0.3 }); },
  punch(a, t, o) { a.osc('sine', 120, 50, t, 0.12, o, 0.9); a.burst(t, 0.06, o, { type: 'lowpass', freq: 900, peak: 0.6 }); },
  swing(a, t, o) { a.burst(t, 0.16, o, { type: 'bandpass', freq: 500, f1: 2200, q: 2, peak: 0.25, a: 0.05 }); },
  hit(a, t, o) { a.osc('sine', 90, 40, t, 0.08, o, 0.5); },
  ricochet(a, t, o) { a.osc('sine', 2800 + Math.random() * 800, 900, t, 0.18, o, 0.15); },
  crash(a, t, o) { a.burst(t, 0.55, o, { type: 'lowpass', freq: 2400, f1: 300, peak: 1 }); a.osc('square', 310, 180, t, 0.18, o, 0.15); a.osc('square', 470, 260, t + 0.02, 0.14, o, 0.1); a.burst(t + 0.05, 0.4, o, { type: 'highpass', freq: 5000, peak: 0.15 }); },
  thud(a, t, o) { a.osc('sine', 80, 40, t, 0.2, o, 0.9); a.burst(t, 0.1, o, { type: 'lowpass', freq: 600, peak: 0.5 }); },
  explosion(a, t, o) { a.burst(t, 2.4, o, { type: 'lowpass', freq: 900, f1: 60, peak: 1.4, a: 0.01 }); a.osc('sine', 70, 25, t, 1.2, o, 1.2); a.burst(t, 0.3, o, { type: 'highpass', freq: 2000, peak: 0.4 }); },
  horn(a, t, o) { const f = a.filt('lowpass', 1800, 1); f.connect(o); a.osc('square', 392, 392, t, 0.45, f, 0.18, 0.01); a.osc('square', 494, 494, t, 0.45, f, 0.18, 0.01); },
  door(a, t, o) { a.burst(t, 0.04, o, { type: 'highpass', freq: 2000, peak: 0.3 }); a.osc('sine', 140, 60, t + 0.12, 0.12, o, 0.6); },
  step(a, t, o) { a.burst(t, 0.045, o, { type: 'lowpass', freq: 700 + Math.random() * 300, peak: 0.35 }); },
  jump(a, t, o) { a.burst(t, 0.06, o, { type: 'lowpass', freq: 900, peak: 0.3 }); },
  shift(a, t, o) { a.burst(t, 0.05, o, { type: 'bandpass', freq: 1200, peak: 0.2 }); },
  pickup(a, t, o) { [1047, 1319, 1568, 2093].forEach((f, i) => a.osc('sine', f, f, t + i * 0.06, 0.18, o, 0.25)); },
  cash(a, t, o) { [1568, 2093].forEach((f, i) => a.osc('triangle', f, f, t + i * 0.05, 0.15, o, 0.25)); },
  shout(a, t, o) { const f = a.filt('bandpass', 750, 4); f.connect(o); a.osc('sawtooth', 220, 180, t, 0.28, f, 0.5, 0.02); a.burst(t, 0.25, o, { type: 'bandpass', freq: 1400, q: 3, peak: 0.2 }); },
  copShout(a, t, o) { const f = a.filt('bandpass', 900, 5); f.connect(o); a.osc('sawtooth', 180, 160, t, 0.2, f, 0.6, 0.02); a.osc('sawtooth', 200, 150, t + 0.3, 0.3, f, 0.6, 0.02); },
  bird(a, t, o) { const b = 2400 + Math.random() * 1600; for (let i = 0; i < 3; i++) a.osc('sine', b, b * 1.3, t + i * 0.11, 0.07, o, 0.12); },
  cricket(a, t, o) { for (let i = 0; i < 6; i++) a.osc('sine', 4300, 4200, t + i * 0.05, 0.025, o, 0.06); },
  tag(a, t, o) { [880, 1175, 1480, 1760, 2349].forEach((f, i) => a.osc('triangle', f, f, t + i * 0.07, 0.3, o, 0.2)); },
  passed(a, t, o) { [523, 659, 784, 1047].forEach((f, i) => a.osc('square', f, f, t + i * 0.12, 0.3, o, 0.12)); a.osc('square', 1047, 1047, t + 0.5, 0.8, o, 0.12); },
  failed(a, t, o) { [392, 370, 349, 262].forEach((f, i) => a.osc('sawtooth', f, f * 0.98, t + i * 0.22, 0.3, o, 0.1)); },
  heliShot(a, t, o) { a.burst(t, 0.09, o, { type: 'bandpass', freq: 1500, peak: 0.6 }); },
  ui_click(a, t, o) { a.osc('sine', 880, 660, t, 0.06, o, 0.35); },
  ui_move(a, t, o) { a.osc('sine', 660, 660, t, 0.03, o, 0.2); },
  ui_back(a, t, o) { a.osc('sine', 520, 330, t, 0.08, o, 0.3); },
};
