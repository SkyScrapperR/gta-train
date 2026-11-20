// Synth voices for the soundtrack, all built from Web Audio nodes:
// subtractive synth (osc + filter envelope + LFO), FM bell / electric piano, Karplus-Strong-style pluck,
// supersaw pad, noise, a drum kit (kick, snare, clap, hats, toms, shaker, gong) and formant "vocal" chops.

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Synth {
  constructor(ctx, noiseBuffer) { this.ctx = ctx; this.noise = noiseBuffer; }

  env(param, t, a, d, s, r, dur, peak = 1) {
    param.cancelScheduledValues(t);
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(peak * s, t + a, d / 3);
    param.setTargetAtTime(0.0001, t + Math.max(a, dur), r / 4);
  }

  // Subtractive voice: one or more oscillators -> lowpass with envelope -> amp.
  sub(out, t, midi, dur, o = {}) {
    const ctx = this.ctx, f = midiToHz(midi);
    const amp = ctx.createGain(), flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.Q.value = o.q ?? 4;
    const cut = o.cutoff ?? 1200, fenv = o.fenv ?? 2400;
    flt.frequency.setValueAtTime(cut + fenv, t);
    flt.frequency.setTargetAtTime(cut, t, o.fdecay ?? 0.12);
    const types = o.osc || ['sawtooth'];
    const det = o.detune ?? 8;
    types.forEach((type, i) => {
      const osc = ctx.createOscillator();
      osc.type = type; osc.frequency.value = f * (o.octaves?.[i] ?? 1);
      osc.detune.value = (i - (types.length - 1) / 2) * det;
      if (o.glideFrom) { osc.frequency.setValueAtTime(midiToHz(o.glideFrom) * (o.octaves?.[i] ?? 1), t); osc.frequency.exponentialRampToValueAtTime(f * (o.octaves?.[i] ?? 1), t + 0.06); }
      if (o.vibrato) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = o.vibrato; lfo.connect(lg); lg.connect(osc.detune); lfo.start(t + 0.15); lfo.stop(t + dur + 1); }
      osc.connect(flt); osc.start(t); osc.stop(t + dur + (o.r ?? 0.2) + 0.1);
    });
    flt.connect(amp); amp.connect(out);
    this.env(amp.gain, t, o.a ?? 0.005, o.d ?? 0.15, o.s ?? 0.6, o.r ?? 0.2, dur, o.vol ?? 0.25);
  }

  // Supersaw pad: seven detuned saws through a soft lowpass with a slow attack.
  supersaw(out, t, midis, dur, o = {}) {
    const ctx = this.ctx, amp = ctx.createGain(), flt = ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = o.cutoff ?? 2200; flt.Q.value = 0.7;
    if (o.sweep) { flt.frequency.setValueAtTime(o.cutoff * 0.4, t); flt.frequency.linearRampToValueAtTime(o.cutoff * 1.4, t + dur); }
    for (const m of midis) {
      for (let i = 0; i < (o.voices ?? 5); i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth'; osc.frequency.value = midiToHz(m); osc.detune.value = (i - 2) * (o.spread ?? 11);
        osc.connect(flt); osc.start(t); osc.stop(t + dur + (o.r ?? 0.8) + 0.1);
      }
    }
    flt.connect(amp); amp.connect(out);
    this.env(amp.gain, t, o.a ?? 0.3, 0.5, 0.85, o.r ?? 0.8, dur, (o.vol ?? 0.06) / Math.sqrt(midis.length));
  }

  // FM: carrier + modulator. Low ratio = electric piano, inharmonic ratio = gamelan-like metallic bell.
  fm(out, t, midi, dur, o = {}) {
    const ctx = this.ctx, f = midiToHz(midi);
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), amp = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f * (o.ratio ?? 3.5);
    const idx = f * (o.index ?? 2.5);
    mg.gain.setValueAtTime(idx, t); mg.gain.setTargetAtTime(idx * (o.indexEnd ?? 0.15), t, o.indexDecay ?? 0.25);
    mod.connect(mg); mg.connect(car.frequency); car.connect(amp); amp.connect(out);
    const len = dur + (o.r ?? 1.2);
    car.start(t); mod.start(t); car.stop(t + len + 0.1); mod.stop(t + len + 0.1);
    amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(o.vol ?? 0.2, t + 0.004);
    amp.gain.setTargetAtTime(0.0001, t + 0.01, (o.decay ?? 0.8) / 3);
  }

  // Pluck: short noise excitation into a tuned feedback delay with damping (Karplus-Strong style).
  pluck(out, t, midi, dur, o = {}) {
    const ctx = this.ctx, f = midiToHz(midi);
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const burst = ctx.createGain(); burst.gain.setValueAtTime(o.vol ?? 0.35, t); burst.gain.setValueAtTime(0, t + 1 / f * 1.2);
    const delay = ctx.createDelay(0.1); delay.delayTime.value = 1 / f;
    const fb = ctx.createGain(); fb.gain.value = o.feedback ?? 0.965;
    const damp = ctx.createBiquadFilter(); damp.type = 'lowpass'; damp.frequency.value = o.bright ?? 3500;
    const amp = ctx.createGain(); amp.gain.setValueAtTime(1, t); amp.gain.setTargetAtTime(0.0001, t + dur, 0.08);
    src.connect(burst); burst.connect(delay); delay.connect(damp); damp.connect(fb); fb.connect(delay); damp.connect(amp); amp.connect(out);
    src.start(t, Math.random()); src.stop(t + 0.05);
    setTimeout(() => { try { fb.disconnect(); } catch (e) { /* gone */ } }, (t - ctx.currentTime + dur + 1.5) * 1000);
  }

  noiseHit(out, t, dur, { type = 'highpass', freq = 7000, q = 1, vol = 0.2, decay = 0.05, a = 0.001 } = {}) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noise;
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = freq; flt.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t); amp.gain.linearRampToValueAtTime(vol, t + a); amp.gain.setTargetAtTime(0.0001, t + a, decay);
    src.connect(flt); flt.connect(amp); amp.connect(out);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + decay * 5);
  }

  // ---------------------------------------------------------------- drum kit
  kick(out, t, vol = 0.9, o = {}) {
    const ctx = this.ctx, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.frequency.setValueAtTime(o.f0 ?? 150, t); osc.frequency.exponentialRampToValueAtTime(o.f1 ?? 42, t + 0.12);
    amp.gain.setValueAtTime(vol, t); amp.gain.exponentialRampToValueAtTime(0.001, t + (o.len ?? 0.42));
    osc.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + 0.5);
    this.noiseHit(out, t, 0.01, { type: 'lowpass', freq: 3000, vol: vol * 0.15, decay: 0.008 });
  }
  snare(out, t, vol = 0.5, o = {}) {
    this.noiseHit(out, t, 0.2, { type: 'bandpass', freq: o.tone ?? 1800, q: 0.7, vol, decay: o.decay ?? 0.07 });
    const ctx = this.ctx, osc = ctx.createOscillator(), amp = ctx.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(220, t); osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    amp.gain.setValueAtTime(vol * 0.6, t); amp.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    osc.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + 0.2);
  }
  clap(out, t, vol = 0.45) { for (let i = 0; i < 3; i++) this.noiseHit(out, t + i * 0.011, 0.02, { type: 'bandpass', freq: 1300, q: 1.2, vol: vol * (i === 2 ? 1 : 0.6), decay: i === 2 ? 0.09 : 0.01 }); }
  hat(out, t, vol = 0.12, open = false) { this.noiseHit(out, t, open ? 0.3 : 0.03, { type: 'highpass', freq: 8000, vol, decay: open ? 0.12 : 0.018 }); }
  shaker(out, t, vol = 0.08) { this.noiseHit(out, t, 0.05, { type: 'bandpass', freq: 6500, q: 1.5, vol, decay: 0.03, a: 0.012 }); }
  tom(out, t, midi, vol = 0.5) {
    const ctx = this.ctx, osc = ctx.createOscillator(), amp = ctx.createGain(), f = midiToHz(midi);
    osc.frequency.setValueAtTime(f * 1.6, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    amp.gain.setValueAtTime(vol, t); amp.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(amp); amp.connect(out); osc.start(t); osc.stop(t + 0.4);
  }
  gong(out, t, midi, vol = 0.3) {
    this.fm(out, t, midi, 3, { ratio: 1.41, index: 1.2, indexEnd: 0.3, indexDecay: 1.5, vol, decay: 4.5, r: 4 });
    this.fm(out, t, midi + 12, 2, { ratio: 2.76, index: 0.8, vol: vol * 0.3, decay: 2.5 });
  }
  // Formant-filtered noise "cak" chop (vocal-like rhythmic syllable).
  vocalChop(out, t, vol = 0.25, vowel = 'a') {
    const F = { a: [800, 1150], e: [500, 1750], o: [450, 800], u: [325, 700] }[vowel] || [800, 1150];
    for (const [i, f] of F.entries()) this.noiseHit(out, t, 0.06, { type: 'bandpass', freq: f, q: 8, vol: vol * (i ? 0.6 : 1), decay: 0.04, a: 0.004 });
    this.noiseHit(out, t, 0.01, { type: 'highpass', freq: 3000, vol: vol * 0.4, decay: 0.006 });
  }
  // Vinyl crackle for lo-fi tracks.
  crackle(out, t, dur, vol = 0.05) { for (let i = 0; i < dur * 12; i++) if (Math.random() < 0.5) this.noiseHit(out, t + Math.random() * dur, 0.002, { type: 'highpass', freq: 2500, vol: vol * Math.random(), decay: 0.002 }); }
}
