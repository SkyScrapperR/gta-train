// Music bus effects: per-track buses, sidechain-style ducking (pads/bass pump with the kick), tempo-synced
// delay, convolution reverb from a generated impulse, a glue compressor, and a "car radio" EQ / muffled
// filter for in-car listening and for when you step out of the car.

function impulse(ctx, seconds = 2.6, decay = 2.8) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
  }
  return buf;
}

export const TRACKS = ['drums', 'bass', 'pad', 'lead', 'arp', 'fx'];

export class MusicFx {
  constructor(ctx, destination, { reverb = 0.25, delay = 0.18 } = {}) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.eqLow = ctx.createBiquadFilter(); this.eqLow.type = 'highpass'; this.eqLow.frequency.value = 20;
    this.eqHigh = ctx.createBiquadFilter(); this.eqHigh.type = 'lowpass'; this.eqHigh.frequency.value = 20000;
    this.eqMid = ctx.createBiquadFilter(); this.eqMid.type = 'peaking'; this.eqMid.frequency.value = 1500; this.eqMid.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor(); this.comp.threshold.value = -18; this.comp.ratio.value = 3; this.comp.attack.value = 0.01; this.comp.release.value = 0.2;
    this.mix = ctx.createGain();
    this.mix.connect(this.comp); this.comp.connect(this.eqLow); this.eqLow.connect(this.eqMid); this.eqMid.connect(this.eqHigh); this.eqHigh.connect(this.out);
    this.out.connect(destination);
    // send effects
    this.reverb = ctx.createConvolver(); this.reverb.buffer = impulse(ctx);
    this.revSend = ctx.createGain(); this.revSend.gain.value = reverb;
    this.revSend.connect(this.reverb); this.reverb.connect(this.mix);
    this.delay = ctx.createDelay(2); this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.35;
    this.delayTone = ctx.createBiquadFilter(); this.delayTone.type = 'lowpass'; this.delayTone.frequency.value = 2800;
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = delay;
    this.delaySend.connect(this.delay); this.delay.connect(this.delayTone); this.delayTone.connect(this.delayFb); this.delayFb.connect(this.delay); this.delayTone.connect(this.mix);
    // per-track buses with layer gain; pads/bass/arp also go through the sidechain duck
    this.duck = ctx.createGain(); this.duck.connect(this.mix);
    this.buses = {};
    for (const t of TRACKS) {
      const g = ctx.createGain();
      const ducked = t === 'pad' || t === 'bass' || t === 'arp';
      g.connect(ducked ? this.duck : this.mix);
      if (t !== 'drums' && t !== 'bass') g.connect(this.revSend);
      if (t === 'lead' || t === 'arp') g.connect(this.delaySend);
      this.buses[t] = g;
    }
    this.buses.drums.gain.value = 0.9;
    this.setTempo(110);
  }
  setTempo(bpm) { this.delay.delayTime.value = (60 / bpm) * 0.75; } // dotted eighth
  layer(track, gain, time = 1.5) { const g = this.buses[track].gain; g.cancelScheduledValues(this.ctx.currentTime); g.setTargetAtTime(gain, this.ctx.currentTime, time / 3); }
  pump(t, depth = 0.55) { const g = this.duck.gain; g.setValueAtTime(1 - depth, t); g.linearRampToValueAtTime(1, t + 0.22); }
  // 'clean' | 'car' (radio EQ: thin lows, boxy mids) | 'muffled' (heard from outside the car)
  setEq(mode) {
    const t = this.ctx.currentTime, k = 0.15;
    const set = (p, v) => p.setTargetAtTime(v, t, k);
    if (mode === 'car') { set(this.eqLow.frequency, 140); set(this.eqHigh.frequency, 7000); set(this.eqMid.gain, 4); }
    else if (mode === 'muffled') { set(this.eqLow.frequency, 60); set(this.eqHigh.frequency, 700); set(this.eqMid.gain, 0); }
    else { set(this.eqLow.frequency, 20); set(this.eqHigh.frequency, 20000); set(this.eqMid.gain, 0); }
  }
  disconnect() { try { this.out.disconnect(); } catch (e) { /* ignore */ } }
}
