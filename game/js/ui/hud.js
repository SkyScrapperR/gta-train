// In-game HUD on the 2D overlay: clock/money/weapon/stars panel, minimap, objective, subtitles with portrait
// cards, help tips, area/vehicle/radio pop-ups, crosshair, hit markers, damage indicators and a notification
// queue with fixed slots (banners have priority; toasts stack on the right without overlapping).
import { theme, panel, text, star, weaponIcon } from './theme.js';
import { Minimap } from './minimap.js';
import { drawPortrait } from './portraits.js';
import { clamp } from '../core/math.js';

const TOAST_SLOTS = 4;

export class Hud {
  constructor(game, mapCanvas) {
    this.game = game;
    this.minimap = new Minimap(game, mapCanvas);
    this.toasts = []; this.banners = []; this.banner = null;
    this.subtitle = null; this.objective = ''; this.help = null;
    this.popups = { area: null, vehicle: null, radio: null };
    this.hitT = 0; this.damage = []; this.starFlashT = 0;
    this.moneyShown = 0; this.showFps = false;
    this.countdown = null; this.distance = null;
    this.letterbox = 0;
  }
  toast(msg, color = theme.teal, dur = 3) {
    if (this.toasts.some((t) => t.msg === msg && t.t < 1)) return;
    this.toasts.push({ msg, color, t: 0, dur });
    if (this.toasts.length > TOAST_SLOTS) this.toasts.shift();
  }
  // Big center banner. Higher priority interrupts lower; equal priority queues.
  bannerShow(title, sub = '', color = theme.gold, dur = 4, priority = 1) {
    const b = { title, sub, color, dur, t: 0, priority };
    if (!this.banner || priority > this.banner.priority) { if (this.banner) this.banners.unshift(this.banner); this.banner = b; }
    else this.banners.push(b);
  }
  say(speaker, textStr, color, dur, portrait) { this.subtitle = { speaker, text: textStr, color, t: 0, dur, portrait }; }
  tip(msg, dur = 3) { this.help = { msg, t: 0, dur }; }
  popup(kind, title, sub = '') { this.popups[kind] = { title, sub, t: 0 }; }
  hitMarker() { this.hitT = 0.25; }
  flashStars() { this.starFlashT = 1.5; }
  damageFrom(src) {
    const p = this.game.player;
    if (!src || typeof src !== 'object' || src.x === undefined) return;
    const a = Math.atan2(src.x - p.x, src.z - p.z);
    this.damage.push({ a, t: 1 });
  }

  update(dt) {
    for (const t of this.toasts) t.t += dt / t.dur;
    this.toasts = this.toasts.filter((t) => t.t < 1);
    if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.dur) this.banner = this.banners.shift() || null; }
    if (this.subtitle) { this.subtitle.t += dt; if (this.subtitle.t > this.subtitle.dur) this.subtitle = null; }
    if (this.help) { this.help.t += dt; if (this.help.t > this.help.dur) this.help = null; }
    for (const k in this.popups) if (this.popups[k]) { this.popups[k].t += dt; if (this.popups[k].t > 3.5) this.popups[k] = null; }
    this.hitT = Math.max(0, this.hitT - dt);
    this.starFlashT = Math.max(0, this.starFlashT - dt);
    for (const d of this.damage) d.t -= dt * 0.8;
    this.damage = this.damage.filter((d) => d.t > 0);
    const m = this.game.money;
    this.moneyShown += (m - this.moneyShown) * Math.min(1, dt * 6);
    if (Math.abs(m - this.moneyShown) < 1) this.moneyShown = m;
  }

  draw(g, W, H) {
    const game = this.game, u = H / 1080;
    g.save();
    g.scale(u, u);
    const w = W / u, h = 1080;
    const cut = game.state === 'cutscene';
    // letterbox
    if (this.letterbox > 0.01) { const bh = 120 * this.letterbox; g.fillStyle = '#000'; g.fillRect(0, 0, w, bh); g.fillRect(0, h - bh, w, bh); }
    if (!cut && game.hudVisible !== false) {
      this.drawTopRight(g, w);
      this.minimap.draw(g, 150, h - 160, 118);
      this.drawCrosshair(g, w, h);
      this.drawDamage(g, w, h);
      if (game.player.stamina < 0.99 && game.player.state === 'foot') { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(40, h - 18, 220, 6); g.fillStyle = theme.gold; g.fillRect(40, h - 18, 220 * game.player.stamina, 6); }
      if (this.objective) {
        const tw = Math.min(w - 600, 30 + this.objective.length * 12);
        text(g, this.objective, w / 2, h - 64, { size: 26, align: 'center', color: '#fff', outline: 5, font: theme.body });
        g.fillStyle = theme.teal; g.fillRect(w / 2 - tw / 2, h - 52, tw, 3);
      }
      if (this.help) {
        const a = clamp(Math.min(this.help.t * 4, (this.help.dur - this.help.t) * 3), 0, 1);
        g.globalAlpha = a;
        g.font = `600 22px ${theme.body}`;
        panel(g, 30, 30, Math.max(300, g.measureText(this.help.msg).width + 44), 74, theme.magenta);
        text(g, this.help.msg, 50, 76, { size: 22, font: theme.body, outline: 0 });
        g.globalAlpha = 1;
      }
      this.drawPopups(g, w, h);
      if (this.countdown) {
        panel(g, w / 2 - 130, 120, 260, 70, theme.magenta);
        text(g, this.countdown.label, w / 2, 148, { size: 18, align: 'center', font: theme.body, outline: 0, color: '#ccc' });
        text(g, this.countdown.value, w / 2, 180, { size: 30, align: 'center', color: theme.gold });
      }
      if (this.distance) {
        panel(g, w / 2 - 200, 200, 400, 58, theme.red);
        text(g, this.distance.label, w / 2 - 180, 238, { size: 20, font: theme.body, outline: 0 });
        g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(w / 2 + 10, 222, 170, 14);
        g.fillStyle = theme.red; g.fillRect(w / 2 + 10, 222, 170 * clamp(this.distance.frac, 0, 1), 14);
      }
    }
    if (game.missions?.credits) this.drawCredits(g, w, h, game.missions.credits.t);
    this.drawToasts(g, w);
    this.drawBanner(g, w, h);
    this.drawSubtitle(g, w, h);
    if (this.showFps) text(g, `${game.fps.toFixed(0)} FPS  ${game.renderer.stats.drawCalls} draws  ${game.renderer.rw}x${game.renderer.rh}`, w - 20, h - 20, { size: 16, align: 'right', font: theme.body });
    g.restore();
  }

  drawCredits(g, w, h, t) {
    const game = this.game;
    const a = clamp(Math.min(t, 26 - t), 0, 1);
    g.fillStyle = `rgba(0,0,0,${0.55 * a})`; g.fillRect(0, 0, w, h);
    const st = game.statsList();
    const lines = [['SELARA BAY', 70, theme.teal], ['Heat on the Coast', 30, theme.gold], ['', 40], ['A game by', 22, '#aaa'], ['I Wayan Bagus Somabawa', 34, '#fff'], ['', 30],
      ['Engine, city, characters and music', 22, '#aaa'], ['written from scratch in WebGL2 and Web Audio', 26, '#fff'], ['', 40], ['YOUR STORY', 34, theme.magenta],
      ...st.map(([k, v]) => [`${k}:  ${v}`, 26, '#fff']), ['', 40], ['Thanks for playing.', 34, theme.teal], ['Free roam continues...', 22, '#aaa']];
    let y = h + 40 - t * 70;
    g.globalAlpha = a;
    for (const [s, size, col] of lines) { if (s) text(g, s, w / 2, y, { size, align: 'center', color: col || '#fff', outline: 5 }); y += size + 22; }
    g.globalAlpha = 1;
  }

  drawTopRight(g, w) {
    const game = this.game, x = w - 340, y = 26;
    panel(g, x, y, 310, 150, theme.teal);
    const hh = Math.floor(game.clock), mm = Math.floor((game.clock % 1) * 60);
    text(g, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, x + 24, y + 42, { size: 30 });
    if (game.rain > 0.2) text(g, 'RAIN', x + 140, y + 40, { size: 16, color: '#9cc9ff' });
    const gaining = this.moneyShown < game.money - 0.5;
    text(g, `$${Math.round(this.moneyShown).toLocaleString('en-US')}`, x + 290, y + 42, { size: 30, align: 'right', color: gaining ? '#9dff9d' : theme.green });
    // weapon
    const wpn = game.weapons.current, ammo = game.weapons.ammo;
    weaponIcon(g, wpn.id, x + 60, y + 86, 64);
    text(g, wpn.name.toUpperCase(), x + 110, y + 82, { size: 16, color: '#cfd6ff' });
    if (!wpn.melee) {
      const rel = game.weapons.reloading > 0;
      text(g, rel ? 'RELOADING' : `${ammo.clip} / ${ammo.reserve}`, x + 110, y + 106, { size: 20, color: rel ? theme.gold : (ammo.clip === 0 ? theme.red : '#fff') });
    }
    // stars
    const W = game.wanted;
    const flashOff = (W.flash && Math.floor(game.time * 4) % 2 === 0) || (this.starFlashT > 0 && Math.floor(game.time * 10) % 2 === 0);
    for (let i = 0; i < 5; i++) {
      const on = i < W.stars;
      star(g, x + 290 - (4 - i) * 0 - (4 - i) * 34 - 4, y + 132, 14, on ? (flashOff ? 'rgba(255,255,255,0.25)' : '#fff') : 'rgba(255,255,255,0.12)', on ? '#000' : 'rgba(0,0,0,0.4)');
    }
  }

  drawCrosshair(g, w, h) {
    const game = this.game, p = game.player;
    const aiming = (p.state === 'foot' && (p.aiming || p.aimHold > 0)) || (p.state === 'driving' && game.input.mouseDown(0));
    if (!aiming) return;
    const wpn = game.weapons.current;
    const cx = w / 2, cy = h / 2;
    const gap = 8 + game.weapons.bloom * 18 + (wpn.spread || 0) * 160 + (p.speed > 1 ? 6 : 0);
    g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.shadowColor = '#000'; g.shadowBlur = 4;
    g.beginPath();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + dx * gap, cy + dy * gap); g.lineTo(cx + dx * (gap + 10), cy + dy * (gap + 10)); }
    g.stroke();
    g.fillStyle = '#fff'; g.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    g.shadowBlur = 0;
    if (this.hitT > 0) {
      g.strokeStyle = `rgba(255,70,70,${this.hitT * 4})`; g.lineWidth = 3;
      g.beginPath();
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { g.moveTo(cx + dx * 6, cy + dy * 6); g.lineTo(cx + dx * 16, cy + dy * 16); }
      g.stroke();
    }
  }

  drawDamage(g, w, h) {
    const game = this.game;
    for (const d of this.damage) {
      const rel = d.a - game.rig.yaw; // 0 = in front
      const a = -Math.PI / 2 - rel;
      g.save(); g.translate(w / 2, h / 2); g.rotate(a);
      g.strokeStyle = `rgba(255,40,40,${d.t * 0.8})`; g.lineWidth = 10;
      g.beginPath(); g.arc(0, 0, 180, -0.25, 0.25); g.stroke();
      g.restore();
    }
    const p = game.player;
    if (p.health < 30 && p.alive) { const k = (30 - p.health) / 30 * (0.5 + 0.5 * Math.sin(game.time * 5)); const grad = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.8); grad.addColorStop(0, 'rgba(255,0,0,0)'); grad.addColorStop(1, `rgba(160,0,0,${0.45 * k})`); g.fillStyle = grad; g.fillRect(0, 0, w, h); }
  }

  drawPopups(g, w, h) {
    const P = this.popups;
    const show = (pp, y, accent) => {
      if (!pp) return;
      const a = clamp(Math.min(pp.t * 4, (3.5 - pp.t) * 2), 0, 1);
      g.globalAlpha = a;
      text(g, pp.title, w - 40, y, { size: 40, align: 'right', color: accent, outline: 6 });
      if (pp.sub) text(g, pp.sub, w - 40, y + 30, { size: 20, align: 'right', font: theme.body, color: '#eee' });
      g.globalAlpha = 1;
    };
    show(P.area, h - 150, theme.gold);
    show(P.vehicle, h - 240, '#fff');
    if (P.radio) {
      const a = clamp(Math.min(P.radio.t * 4, (3.5 - P.radio.t) * 2), 0, 1);
      g.globalAlpha = a;
      text(g, P.radio.title, w / 2, 70, { size: 34, align: 'center', color: theme.magenta, outline: 6 });
      if (P.radio.sub) text(g, P.radio.sub, w / 2, 102, { size: 20, align: 'center', font: theme.body, color: '#eee' });
      g.globalAlpha = 1;
    }
  }

  drawToasts(g, w) {
    this.toasts.forEach((t, i) => {
      const a = clamp(Math.min(t.t * t.dur * 5, (1 - t.t) * t.dur * 3), 0, 1);
      const y = 200 + i * 56;
      g.globalAlpha = a;
      panel(g, w - 340, y, 310, 46, t.color);
      text(g, t.msg, w - 320, y + 31, { size: 20, font: theme.body, outline: 0 });
      g.globalAlpha = 1;
    });
  }

  drawBanner(g, w, h) {
    const b = this.banner;
    if (!b) return;
    const a = clamp(Math.min(b.t * 3, (b.dur - b.t) * 2), 0, 1);
    const s = 1 + Math.max(0, 0.25 - b.t) * 1.5;
    g.save(); g.globalAlpha = a; g.translate(w / 2, h * 0.32); g.scale(s, s);
    const grad = g.createLinearGradient(-500, 0, 500, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, 'rgba(0,0,0,0.6)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(-500, -70, 1000, 120);
    text(g, b.title, 0, 0, { size: 76, align: 'center', color: b.color, outline: 8, shadow: 20 });
    if (b.sub) text(g, b.sub, 0, 40, { size: 26, align: 'center', font: theme.body, color: '#fff' });
    g.restore();
  }

  drawSubtitle(g, w, h) {
    const s = this.subtitle;
    if (!s) return;
    const a = clamp(Math.min(s.t * 5, (s.dur - s.t) * 5), 0, 1);
    g.globalAlpha = a;
    const y = h - 160 - (this.letterbox > 0.5 ? 0 : 40);
    const lines = wrap(g, s.text, 900);
    const boxW = 1000, boxH = 30 + lines.length * 34;
    if (s.portrait) drawPortrait(g, s.portrait, w / 2 - boxW / 2 - 130, y - boxH + 20, 120);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(w / 2 - boxW / 2, y - boxH + 10, boxW, boxH + 10, 8); g.fill();
    text(g, s.speaker.toUpperCase(), w / 2 - boxW / 2 + 20, y - boxH + 38, { size: 20, color: s.color, outline: 3 });
    lines.forEach((ln, i) => text(g, ln, w / 2 - boxW / 2 + 20, y - boxH + 72 + i * 34, { size: 26, font: theme.body, outline: 3 }));
    g.globalAlpha = 1;
  }
}

function wrap(g, str, maxW) {
  g.font = `600 26px ${theme.body}`;
  const words = str.split(' '), lines = [];
  let cur = '';
  for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
