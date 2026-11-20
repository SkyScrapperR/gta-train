// Lookahead sequencer. Songs are data (tempo, key, chord progressions, named sections with per-track patterns,
// an arrangement and hand-written melodies); this module turns them into scheduled synth notes 16th by 16th.
// Fills, risers, crashes and drops are added automatically at section boundaries.
import { Synth, midiToHz } from './synth.js';
import { MusicFx } from './fx.js';

const PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11], m9: [0, 3, 7, 10, 14], maj9: [0, 4, 7, 11, 14], 9: [0, 4, 7, 10, 14], sus4: [0, 5, 7], sus2: [0, 2, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], m11: [0, 3, 7, 10, 17], '6': [0, 4, 7, 9], m6: [0, 3, 7, 9] };

export function parseChord(name) {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  if (!m) return { root: 0, iv: [0, 4, 7] };
  return { root: PC[m[1]], iv: QUAL[m[2]] ?? [0, 4, 7] };
}
export function noteToMidi(n) {
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  return m ? PC[m[1]] + (Number(m[2]) + 1) * 12 : null;
}
// Melody: tokens are eighth notes; "." rest, "-" hold, "|" bar line (ignored). e.g. "A4 - C5 . E5 D5 | C5 - - ."
export function parseMelody(str, stepsPerToken = 2) {
  const out = [];
  let step = 0;
  for (const tok of str.trim().split(/\s+/)) {
    if (tok === '|') continue;
    if (tok === '-') { if (out.length) out[out.length - 1].len += stepsPerToken; }
    else if (tok !== '.') { const midi = noteToMidi(tok); if (midi !== null) out.push({ step, midi, len: stepsPerToken }); }
    step += stepsPerToken;
  }
  return { notes: out, length: step };
}

// Drum grooves: 16-step strings per voice. K kick, S snare, C clap, H hat, O open hat, P shaker, T tom, V vocal chop, G gong
const GROOVES = {
  none: {},
  synth: { K: 'x...x...x...x...', S: '....x.......x...', H: '..x...x...x...x.', P: 'x.x.x.x.x.x.x.x.' },
  synthDrive: { K: 'x...x...x...x.x.', S: '....x.......x...', C: '....x.......x...', H: 'xxxxxxxxxxxxxxxx', O: '..x...x...x...x.' },
  half: { K: 'x.........x.....', S: '........x.......', H: 'x...x...x...x...' },
  lofi: { K: 'x......x..x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', P: '..x...x...x...x.' },
  lofiSparse: { K: 'x.........x.....', S: '....x.......x...', H: 'x...x...x...x...' },
  gamelan: { K: 'x.....x...x.....', C: '....x.......x...', H: '..x...x...x...x.', T: '.......x......x.' },
  gamelanDrive: { K: 'x...x...x...x...', C: '....x.......x...', H: 'x.xxx.xxx.xxx.xx', P: 'x.x.x.x.x.x.x.x.' },
  kecak: { K: 'x...x...x...x...', V: 'x.xx.x.xx.x.xx.x', C: '....x.......x...' },
  cinematic: { K: 'x.......x.......', S: '........x.......', T: '..............xx' },
  cinematicDrive: { K: 'x..x..x.x..x..x.', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', T: '.............xxx' },
  chase: { K: 'x..x..x...x..x..', S: '....x.......x...', H: 'x.xxx.xxx.xxx.xx' },
};

const STYLE_VOICES = {
  synthwave: {
    lead: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['sawtooth', 'square'], cutoff: 1800, fenv: 1800, q: 3, vol: 0.13, a: 0.01, s: 0.7, r: 0.25, vibrato: 12, detune: 10 }),
    bass: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['sawtooth', 'square'], cutoff: 380, fenv: 900, q: 6, vol: 0.22, s: 0.5, r: 0.05, fdecay: 0.06, detune: 4 }),
    arp: (s, o, t, m, d) => s.pluck(o, t, m, d, { vol: 0.22, bright: 4200, feedback: 0.94 }),
    pad: (s, o, t, ms, d) => s.supersaw(o, t, ms, d, { cutoff: 1800, vol: 0.05, a: 0.4, r: 1.0 }),
    bell: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 3.5, index: 1.4, vol: 0.08, decay: 1 }),
  },
  lofi: {
    lead: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 1, index: 1.1, indexEnd: 0.3, vol: 0.12, decay: 1.4 }),
    bass: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['triangle', 'sine'], cutoff: 500, fenv: 200, q: 1, vol: 0.32, s: 0.7, r: 0.1 }),
    arp: (s, o, t, m, d) => s.pluck(o, t, m, d, { vol: 0.16, bright: 2000, feedback: 0.95 }),
    pad: (s, o, t, ms, d) => ms.forEach((m, i) => s.fm(o, t + i * 0.012, m, d, { ratio: 1, index: 0.8, indexEnd: 0.25, vol: 0.06, decay: 2.2, r: 0.5 })),
    bell: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 4, index: 0.9, vol: 0.06, decay: 1.2 }),
  },
  gamelan: {
    lead: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 3.53, index: 2.2, indexEnd: 0.1, vol: 0.13, decay: 1.6, r: 1.5 }),
    bass: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['sine', 'triangle'], cutoff: 400, fenv: 300, q: 2, vol: 0.32, s: 0.8, r: 0.15 }),
    arp: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 2.76, index: 1.6, indexEnd: 0.1, vol: 0.09, decay: 0.5, r: 0.4 }),
    pad: (s, o, t, ms, d) => s.supersaw(o, t, ms, d, { cutoff: 900, vol: 0.035, a: 0.8, r: 1.2, voices: 3 }),
    bell: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 3.53, index: 2.5, vol: 0.1, decay: 2 }),
  },
  cinematic: {
    lead: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['sawtooth', 'sawtooth', 'square'], cutoff: 2200, fenv: 1500, q: 2, vol: 0.12, a: 0.03, s: 0.8, r: 0.4, vibrato: 10, detune: 14 }),
    bass: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['sawtooth', 'square'], cutoff: 300, fenv: 700, q: 5, vol: 0.24, s: 0.6, r: 0.08 }),
    arp: (s, o, t, m, d) => s.sub(o, t, m, d, { osc: ['square'], cutoff: 2500, fenv: 2000, q: 4, vol: 0.07, s: 0.2, r: 0.05, d: 0.08 }),
    pad: (s, o, t, ms, d) => s.supersaw(o, t, ms, d, { cutoff: 1500, vol: 0.06, a: 0.8, r: 1.4, sweep: true }),
    bell: (s, o, t, m, d) => s.fm(o, t, m, d, { ratio: 1, index: 0.7, vol: 0.12, decay: 2.5, r: 1.5 }), // piano-ish
  },
};

// Song duration in seconds.
export function songLength(song) { const bars = song.arrangement.reduce((n, s) => n + song.sections[s].bars, 0); return bars * 4 * 60 / song.bpm; }

export class SongPlayer {
  constructor(ctx, destination, noise, opts = {}) {
    this.ctx = ctx;
    this.synth = new Synth(ctx, noise);
    this.fx = new MusicFx(ctx, destination, opts);
    this.song = null; this.timer = null; this.onEnd = null; this.loop = false;
  }
  play(song, offsetSec = 0, { loop = false, onEnd = null } = {}) {
    this.stop();
    this.song = song; this.loop = loop; this.onEnd = onEnd;
    this.fx.setTempo(song.bpm);
    this.stepDur = 60 / song.bpm / 4;
    // flatten arrangement into a bar table
    this.bars = [];
    song.arrangement.forEach((name, si) => {
      const sec = song.sections[name];
      for (let b = 0; b < sec.bars; b++) this.bars.push({ name, sec, bar: b, si, next: song.arrangement[si + 1] });
    });
    this.melodies = {};
    for (const [k, v] of Object.entries(song.melodies || {})) this.melodies[k] = parseMelody(v);
    this.totalSteps = this.bars.length * 16;
    this.step = Math.floor(offsetSec / this.stepDur) % this.totalSteps;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; this.song = null; }
  get position() { return this.song ? this.step * this.stepDur : 0; }
  schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.song && this.nextTime < ahead) {
      if (this.step >= this.totalSteps) {
        if (this.loop) this.step = 0;
        else { const f = this.onEnd; this.stop(); f && f(); return; }
      }
      this.playStep(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepDur;
    }
  }
  playStep(step, t0) {
    const song = this.song, s = this.synth, B = this.fx.buses;
    const barInfo = this.bars[Math.floor(step / 16)];
    const st = step % 16;
    const sec = barInfo.sec;
    const swing = song.swing || 0;
    const t = t0 + (st % 2 === 1 ? swing * this.stepDur : 0);
    const V = { ...STYLE_VOICES[song.style], ...(song.voices || {}) };
    const prog = song.progs[sec.prog || 'A'];
    const chordName = prog[barInfo.bar % prog.length];
    const ch = parseChord(chordName);
    const rootMidi = (song.bassOctave ?? 36) + ch.root;
    const chordMidis = ch.iv.map((iv) => (song.padOctave ?? 57) + ((ch.root + iv - (song.padOctave ?? 57)) % 12 + 12) % 12 + (iv >= 12 ? 12 : 0));
    chordMidis.sort((a, b) => a - b);
    const isLastBar = barInfo.bar === sec.bars - 1;
    const intoChorus = isLastBar && barInfo.next && song.sections[barInfo.next].lift;
    // ---- drums
    const groove = GROOVES[sec.drums || 'none'] || {};
    const fill = isLastBar && sec.drums && sec.drums !== 'none' && st >= 12 && (barInfo.next !== undefined);
    if (fill && (sec.fill !== false)) {
      if (st % 1 === 0) s.tom(B.drums, t, 50 - (st - 12) * 3, 0.35);
      if (st === 12) s.snare(B.drums, t, 0.35);
    } else {
      const hit = (k) => groove[k] && groove[k][st] === 'x';
      if (hit('K')) { s.kick(B.drums, t, 0.85); this.fx.pump(t, song.pump ?? 0.5); }
      if (hit('S')) s.snare(B.drums, t, song.style === 'lofi' ? 0.25 : 0.42, { tone: song.style === 'lofi' ? 1200 : 1800 });
      if (hit('C')) s.clap(B.drums, t, 0.32);
      if (hit('H')) s.hat(B.drums, t, song.style === 'lofi' ? 0.06 : 0.09);
      if (hit('O')) s.hat(B.drums, t, 0.07, true);
      if (hit('P')) s.shaker(B.drums, t, 0.06);
      if (hit('T')) s.tom(B.drums, t, 45 + (st % 3) * 4, 0.3);
      if (hit('V')) s.vocalChop(B.fx, t, 0.22, 'aeou'[(st + barInfo.bar) % 4]);
    }
    if (sec.gong && barInfo.bar % 4 === 0 && st === 0) s.gong(B.fx, t, rootMidi + 12, 0.25);
    if (song.style === 'lofi' && st === 0) s.crackle(B.fx, t, this.stepDur * 16, 0.03);
    // section transitions: crash on lift, riser into chorus, drop before it
    if (barInfo.bar === 0 && st === 0 && sec.lift) s.noiseHit(B.fx, t, 1.5, { type: 'highpass', freq: 5000, vol: 0.12, decay: 0.6 });
    if (intoChorus && st === 0) {
      const src = this.ctx.createBufferSource(); src.buffer = s.noise;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(7000, t + this.stepDur * 15);
      const g = this.ctx.createGain(); g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(0.14, t + this.stepDur * 15); g.gain.linearRampToValueAtTime(0, t + this.stepDur * 16);
      src.connect(f); f.connect(g); g.connect(B.fx); src.start(t); src.stop(t + this.stepDur * 16 + 0.05);
    }
    const drop = intoChorus && st >= 14;
    if (drop) return;
    // ---- bass
    const bs = sec.bass;
    if (bs) {
      const len = this.stepDur;
      if (bs === 'octave8' && st % 2 === 0) V.bass(s, B.bass, t, rootMidi + (st % 4 === 2 ? 12 : 0), len * 1.6);
      else if (bs === 'pulse16') V.bass(s, B.bass, t, rootMidi, len * 0.8);
      else if (bs === 'drive' && 'x.xx.xx.x.xx.xx.'[st] === 'x') V.bass(s, B.bass, t, rootMidi + (st === 6 || st === 14 ? 12 : 0), len * 1.2);
      else if (bs === 'sub' && st === 0) V.bass(s, B.bass, t, rootMidi, len * 15);
      else if (bs === 'walk' && st % 4 === 0) V.bass(s, B.bass, t, rootMidi + [0, 7, 12, ch.iv[1] + 12][st / 4], len * 3.5);
      else if (bs === 'gong' && (st === 0 || st === 10)) V.bass(s, B.bass, t, rootMidi, len * 6);
    }
    // ---- pad / chords
    const pd = sec.pad;
    if (pd === 'pad' && st === 0) V.pad(s, B.pad, t, chordMidis, this.stepDur * 16);
    if (pd === 'comp' && (st === 0 || st === 7 || st === 10)) V.pad(s, B.pad, t, chordMidis, this.stepDur * (st === 0 ? 6 : 3));
    if (pd === 'stabs' && (st === 2 || st === 6 || st === 10 || st === 14)) V.pad(s, B.pad, t, chordMidis.map((m) => m + 12), this.stepDur * 1.2);
    // ---- arp
    const ar = sec.arp;
    if (ar) {
      const tones = [...chordMidis, ...chordMidis.map((m) => m + 12)];
      if (ar === 'arp16') V.arp(s, B.arp, t, tones[[0, 1, 2, 3, 2, 1][st % 6] % tones.length] + 12, this.stepDur * 0.9);
      else if (ar === 'arp8' && st % 2 === 0) V.arp(s, B.arp, t, tones[(st / 2) % tones.length] + 12, this.stepDur * 1.8);
      else if (ar === 'kotekan') {
        // interlocking polos/sangsih: two parts alternate on the scale, offset by one 16th
        const scale = song.scale;
        const deg = (n) => (song.key + 12 + scale[((n % scale.length) + scale.length) % scale.length] + 12 * Math.floor(n / scale.length));
        const pattern = [0, 1, 2, 1, 0, 2, 3, 2, 1, 2, 3, 4, 3, 2, 1, 0];
        const n = pattern[st] + (barInfo.bar % 2) * 1;
        V.arp(s, B.arp, t, deg(n) + 12, this.stepDur * 1.5);
        if (st % 2 === 1) V.arp(s, B.arp, t + this.stepDur * 0.5, deg(n + 2) + 12, this.stepDur);
      }
    }
    // ---- lead melody (per section name; loops if shorter than the section)
    const mel = this.melodies[sec.melody || barInfo.name];
    if (mel && sec.lead !== false) {
      const local = (barInfo.bar * 16 + st) % Math.max(16, mel.length);
      for (const n of mel.notes) if (n.step === local) V.lead(s, B.lead, t, n.midi + (sec.octave || 0), n.len * this.stepDur * 0.95);
    }
    if (sec.bells && st % 8 === 0) V.bell(s, B.fx, t, chordMidis[(st / 8 + barInfo.bar) % chordMidis.length] + 24, this.stepDur * 6);
  }
}

// Station jingle: three-note sting and a filtered sweep.
export function playJingle(player, notes, t) {
  const s = player.synth, B = player.fx.buses;
  notes.forEach((m, i) => s.fm(B.lead, t + i * 0.18, m, 0.3, { ratio: 2, index: 1.2, vol: 0.16, decay: 0.8 }));
  s.noiseHit(B.fx, t + 0.5, 1, { type: 'bandpass', freq: 2500, q: 3, vol: 0.12, decay: 0.4, a: 0.3 });
  s.kick(B.drums, t + 0.54, 0.6);
}
export { midiToHz };
