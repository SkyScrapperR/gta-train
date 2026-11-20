// Music director: title theme, cutscene underscores, credits song, dynamic chase layers driven by the wanted
// level (pulse bass -> drums -> arp -> lead) and short stingers (passed, failed, flatlined, cuffed).
import { SongPlayer } from './sequencer.js';
import { SONGS } from './index.js';

const CUES = { title: 'heat-on-the-coast', credits: 'credits-reprise', cutLin: 'lin-theme', cutViktor: 'viktor-theme' };

export class MusicDirector {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.score = new SongPlayer(this.ctx, audio.musicDuck, audio.noise, { reverb: 0.3 });
    this.chase = new SongPlayer(this.ctx, audio.musicDuck, audio.noise, { reverb: 0.15 });
    this.cue = null; this.chaseLevel = 0; this.chaseOn = false;
    this.stingOut = this.ctx.createGain(); this.stingOut.gain.value = 0.9; this.stingOut.connect(audio.musicBus);
    this.pending = null;
  }
  play(name) {
    if (name === this.cue) return;
    this.cue = name;
    const fx = this.score.fx.out.gain, t = this.ctx.currentTime;
    if (!name) { fx.setTargetAtTime(0, t, 0.6); setTimeout(() => { if (!this.cue) this.score.stop(); }, 2500); return; }
    fx.cancelScheduledValues(t); fx.setValueAtTime(0, t); fx.linearRampToValueAtTime(1, t + 1.2);
    this.score.play(SONGS[CUES[name]], 0, { loop: name !== 'credits', onEnd: () => { this.cue = null; } });
  }
  // Called every frame from the audio engine.
  update(game) {
    const W = game.wanted, radioOn = game.audio.radio?.playing;
    const playing = game.state === 'playing';
    let level = 0;
    if (playing && !this.cue) {
      if (W.stars >= 2 && !radioOn) level = W.stars;
      else if (game.missions.active && !radioOn) level = Math.max(1, W.stars);
    }
    if (level > 0 && !this.chaseOn) { this.chaseOn = true; this.chase.play(SONGS.chase, 0, { loop: true }); for (const t of ['bass', 'drums', 'arp', 'lead']) this.chase.fx.buses[t].gain.value = 0; }
    if (level !== this.chaseLevel) {
      this.chaseLevel = level;
      const L = (n) => (level >= n ? 1 : 0);
      this.chase.fx.layer('bass', L(1) * 0.9, 2); this.chase.fx.layer('drums', L(2) * 0.9, 2);
      this.chase.fx.layer('arp', L(3) * 0.8, 2); this.chase.fx.layer('lead', L(4) * 0.7, 2);
      this.chase.fx.layer('pad', L(1) * 0.5, 2);
      if (level === 0) setTimeout(() => { if (this.chaseLevel === 0) { this.chase.stop(); this.chaseOn = false; } }, 4000);
    }
  }
  stinger(kind) {
    const s = this.score.synth, o = this.stingOut, t = this.ctx.currentTime + 0.02;
    const brass = (m, at, d, v = 0.14) => s.sub(o, at, m, d, { osc: ['sawtooth', 'sawtooth', 'square'], cutoff: 1400, fenv: 2600, q: 2, vol: v, a: 0.02, s: 0.8, r: 0.5, detune: 12 });
    this.audio.duck(0.85, kind === 'passed' ? 2.5 : 3);
    if (kind === 'passed') {
      [60, 64, 67].forEach((m, i) => brass(m + 12, t + i * 0.12, 0.14));
      [60, 64, 67, 72].forEach((m) => brass(m + 12, t + 0.42, 1.4, 0.09));
      s.kick(o, t + 0.42, 0.8); s.noiseHit(o, t + 0.42, 1.2, { type: 'highpass', freq: 5000, vol: 0.12, decay: 0.5 });
      s.supersaw(o, t + 0.42, [48, 55, 64], 1.4, { cutoff: 2500, vol: 0.07, a: 0.05, r: 0.8 });
    } else if (kind === 'failed') {
      [67, 66, 65, 60].forEach((m, i) => s.sub(o, t + i * 0.25, m, 0.3, { osc: ['sawtooth'], cutoff: 900, vol: 0.12 }));
      s.supersaw(o, t + 1, [48, 51, 55], 1.5, { cutoff: 900, vol: 0.06 });
    } else if (kind === 'flatlined') {
      s.supersaw(o, t, [36, 43, 48], 3.5, { cutoff: 600, vol: 0.08, a: 0.1, r: 1.5 });
      for (let i = 0; i < 3; i++) { s.kick(o, t + i * 0.9, 0.6 - i * 0.15, { f0: 90, f1: 40 }); s.kick(o, t + i * 0.9 + 0.22, 0.4 - i * 0.1, { f0: 80, f1: 40 }); }
      s.sub(o, t + 2.8, 81, 1.6, { osc: ['sine'], cutoff: 4000, vol: 0.05, s: 1 });
    } else if (kind === 'cuffed') {
      for (let i = 0; i < 4; i++) s.sub(o, t + i * 0.35, i % 2 ? 72 : 76, 0.3, { osc: ['square'], cutoff: 2000, vol: 0.06 });
      s.supersaw(o, t + 1.4, [45, 52, 57], 1.8, { cutoff: 800, vol: 0.06 });
    }
    return true;
  }
}
