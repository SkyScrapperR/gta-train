// In-car radio. Stations are "live": each runs on its own clock, so switching away and back resumes where the
// station would be. Songs play in order with a synthesized station jingle between them. Leaving the car keeps
// the radio going briefly through a muffled filter before it fades out.
import { SongPlayer, songLength, playJingle } from './music/sequencer.js';
import { SONGS, STATIONS } from './music/index.js';

const JINGLE = 3;

export class Radio {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.player = new SongPlayer(this.ctx, audio.radioDuck, audio.noise, { reverb: 0.2 });
    this.out = this.player.fx.out.gain;
    this.station = 0;
    this.playing = false;
    this.inCar = false;
    this.fadeTimer = null;
    // each station's clock starts at a different point of its playlist
    this.epoch = STATIONS.map((s, i) => i * 41.3);
  }
  get current() { return STATIONS[this.station]; }
  // Which song (and offset into it) the station is airing right now.
  livePosition(st) {
    const s = STATIONS[st];
    const lens = s.songs.map((n) => songLength(SONGS[n]) + JINGLE);
    const total = lens.reduce((a, b) => a + b, 0);
    let pos = (this.ctx.currentTime + this.epoch[st]) % total;
    for (let i = 0; i < lens.length; i++) { if (pos < lens[i]) return { index: i, offset: pos }; pos -= lens[i]; }
    return { index: 0, offset: 0 };
  }
  tune(showPopup = true) {
    const s = this.current;
    clearTimeout(this.fadeTimer);
    this.player.stop();
    if (s.id === 'off') { this.playing = false; if (showPopup) this.audio.game.hud.popup('radio', 'Radio Off'); return; }
    const { index, offset } = this.livePosition(this.station);
    this.playSong(index, offset, showPopup);
  }
  playSong(index, offset, showPopup) {
    const s = this.current, name = s.songs[index], song = SONGS[name];
    this.playing = true;
    this.songIndex = index;
    const len = songLength(song);
    if (offset >= len) { // inside the jingle gap: play the jingle, then the next song
      playJingle(this.player, s.jingle, this.ctx.currentTime + 0.05);
      this.fadeTimer = setTimeout(() => this.playSong((index + 1) % s.songs.length, 0, true), (len + JINGLE - offset) * 1000);
      if (showPopup) this.audio.game.hud.popup('radio', s.name, s.tagline);
      return;
    }
    this.player.play(song, offset, { onEnd: () => { if (!this.playing || this.current !== s) return; playJingle(this.player, s.jingle, this.ctx.currentTime + 0.05); this.fadeTimer = setTimeout(() => { if (this.playing && this.current === s) this.playSong((index + 1) % s.songs.length, 0, true); }, JINGLE * 1000); } });
    if (showPopup) this.audio.game.hud.popup('radio', s.name, `"${song.title}"`);
  }
  next() {
    if (!this.inCar) return;
    this.station = (this.station + 1) % STATIONS.length;
    this.audio.ui('move');
    this.tune(true);
  }
  enterCar() {
    this.inCar = true;
    const t = this.ctx.currentTime;
    this.out.cancelScheduledValues(t); this.out.setTargetAtTime(1, t, 0.2);
    this.player.fx.setEq('car');
    if (!this.playing || this.current.id === 'off') this.tune(true);
    else this.audio.game.hud.popup('radio', this.current.name, `"${SONGS[this.current.songs[this.songIndex]]?.title || ''}"`);
  }
  exitCar() {
    this.inCar = false;
    if (!this.playing) return;
    this.player.fx.setEq('muffled');
    const t = this.ctx.currentTime;
    this.out.setTargetAtTime(0, t + 2, 0.8);
    clearTimeout(this.fadeTimer);
    this.fadeTimer = setTimeout(() => { if (!this.inCar) { this.player.stop(); this.playing = false; } }, 5000);
  }
}
