// Title screen, pause menu, settings, controls, stats, credits and confirmation dialogs, all drawn on
// the 2D overlay with mouse + keyboard navigation.
import { theme, panel, text } from './theme.js';
import { WEAPONS } from '../combat/weapons.js';

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look'], ['Shift', 'Sprint'], ['Space', 'Jump / handbrake'],
  ['Right mouse', 'Aim'], ['Left mouse', 'Shoot / punch / drive-by'], ['Q / E / wheel', 'Switch weapon'],
  ['R', 'Reload (on foot) / radio station (in car)'], ['F', 'Enter / exit vehicle'], ['H', 'Horn'],
  ['M', 'Big map'], ['C', 'Cinematic camera'], ['Esc', 'Pause'], ['F3', 'FPS counter'],
];

export class Menus {
  constructor(game) {
    this.game = game;
    this.stack = [];
    this.sel = 0;
    this.hover = -1;
    this.rects = [];
    this.confirm = null;
    this.time = 0;
  }
  get active() { return this.stack.length > 0; }
  get top() { return this.stack[this.stack.length - 1]; }
  open(name) { this.stack.push(name); this.sel = 0; this.game.audio?.ui('click'); }
  back() { this.stack.pop(); this.sel = 0; this.game.audio?.ui('back'); if (!this.stack.length) this.game.onMenusClosed(); }
  closeAll() { this.stack = []; }

  items() {
    const g = this.game, s = g.settings;
    switch (this.top) {
      case 'title': {
        const it = [];
        if (g.save.exists()) it.push({ label: 'Continue', action: () => g.continueGame() });
        it.push({ label: 'New Game', action: () => (g.save.exists() ? this.ask('Start a new game? Your saved progress will be overwritten.', () => g.newGame()) : g.newGame()) });
        it.push({ label: 'Controls', action: () => this.open('controls') }, { label: 'Settings', action: () => this.open('settings') }, { label: 'Credits', action: () => this.open('credits') });
        return it;
      }
      case 'pause':
        return [
          { label: 'Resume', action: () => g.resume() }, { label: 'Map', action: () => g.openMap() }, { label: 'Stats', action: () => this.open('stats') },
          { label: 'Controls', action: () => this.open('controls') }, { label: 'Settings', action: () => this.open('settings') },
          { label: 'Quit to Title', action: () => this.ask('Quit to the title screen? Unsaved progress since your last save will be lost.', () => g.quitToTitle()) },
        ];
      case 'settings': {
        const cyc = (k, opts) => ({ label: k.label, value: () => k.fmt(s[k.key]), left: () => g.setSetting(k.key, opts[(opts.indexOf(s[k.key]) - 1 + opts.length) % opts.length]), right: () => g.setSetting(k.key, opts[(opts.indexOf(s[k.key]) + 1) % opts.length]) });
        const num = (key, label, step, min, max) => ({ label, value: () => `${Math.round(s[key] * 100)}%`, left: () => g.setSetting(key, Math.max(min, +(s[key] - step).toFixed(2))), right: () => g.setSetting(key, Math.min(max, +(s[key] + step).toFixed(2))) });
        return [
          cyc({ key: 'quality', label: 'Graphics quality', fmt: (v) => v.toUpperCase() }, ['low', 'medium', 'high']),
          num('musicVol', 'Music volume', 0.1, 0, 1), num('sfxVol', 'Effects volume', 0.1, 0, 1), num('radioVol', 'Radio volume', 0.1, 0, 1),
          num('sensitivity', 'Mouse sensitivity', 0.1, 0.2, 3),
          cyc({ key: 'invertY', label: 'Invert Y', fmt: (v) => (v ? 'ON' : 'OFF') }, [false, true]),
          cyc({ key: 'showFps', label: 'FPS counter', fmt: (v) => (v ? 'ON' : 'OFF') }, [false, true]),
          { label: 'Back', action: () => this.back() },
        ];
      }
      case 'shop': {
        const list = [];
        for (const id of ['pistol', 'smg', 'shotgun']) {
          const w = WEAPONS[id], owned = g.weapons.has(id);
          list.push({ label: owned ? `${w.name} ammo +${w.ammoPack}` : `${w.name}`, value: () => `$${owned ? w.ammoPrice : w.price}`, action: () => g.buy(id) });
        }
        list.push({ label: 'Body armor', value: () => '$250', action: () => g.buyArmor() });
        list.push({ label: 'Leave', action: () => g.closeShop() });
        return list;
      }
      default: return [{ label: 'Back', action: () => this.back() }];
    }
  }
  ask(msg, yes) { this.confirm = { msg, yes, sel: 1 }; }

  key(code) {
    const g = this.game;
    if (this.confirm) {
      if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD') this.confirm.sel = 1 - this.confirm.sel;
      if (code === 'Enter' || code === 'Space') { const c = this.confirm; this.confirm = null; if (c.sel === 0) c.yes(); }
      if (code === 'Escape') this.confirm = null;
      return;
    }
    const items = this.items();
    if (code === 'ArrowDown' || code === 'KeyS') { this.sel = (this.sel + 1) % items.length; g.audio?.ui('move'); }
    if (code === 'ArrowUp' || code === 'KeyW') { this.sel = (this.sel - 1 + items.length) % items.length; g.audio?.ui('move'); }
    const it = items[this.sel];
    if ((code === 'ArrowLeft' || code === 'KeyA') && it?.left) { it.left(); g.audio?.ui('move'); }
    if ((code === 'ArrowRight' || code === 'KeyD') && it?.right) { it.right(); g.audio?.ui('move'); }
    if ((code === 'Enter' || code === 'Space') && it) { if (it.action) { g.audio?.ui('click'); it.action(); } else if (it.right) it.right(); }
    if (code === 'Escape' && this.top !== 'title') { if (this.top === 'pause') g.resume(); else if (this.top === 'shop') g.closeShop(); else this.back(); }
  }
  mouseMove(x, y) { this.hover = this.rects.findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h); if (this.hover >= 0 && this.rects[this.hover].i !== undefined) this.sel = this.rects[this.hover].i; }
  click(x, y) {
    const r = this.rects.find((q) => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h);
    if (!r) return;
    r.fn();
  }

  draw(g, W, H, dt) {
    this.time += dt;
    const u = H / 1080, w = W / u, h = 1080;
    g.save(); g.scale(u, u);
    this.rects = [];
    const reg = (x, y, ww, hh, fn, i) => this.rects.push({ x: x * u, y: y * u, w: ww * u, h: hh * u, fn, i });
    const top = this.top;
    if (top === 'title') this.drawLogo(g, w, h);
    else { g.fillStyle = 'rgba(4,6,12,0.45)'; g.fillRect(0, 0, w, h); }
    const items = this.items();
    if (top === 'shop') text(g, `$${this.game.money.toLocaleString('en-US')}`, w / 2, 235, { size: 30, align: 'center', color: theme.green });
    const titles = { shop: 'BANG BANG ARMS', pause: 'PAUSED', settings: 'SETTINGS', controls: 'CONTROLS', stats: 'STATS', credits: 'CREDITS' };
    let x = top === 'title' ? 140 : w / 2 - 300, y = top === 'title' ? 560 : 260;
    if (titles[top]) text(g, titles[top], w / 2, 190, { size: 64, align: 'center', color: theme.teal, outline: 8, shadow: 18 });
    if (top === 'controls') {
      panel(g, w / 2 - 420, 230, 840, 600, theme.teal);
      CONTROLS.forEach(([k, d], i) => { text(g, k, w / 2 - 380, 280 + i * 38, { size: 22, color: theme.gold }); text(g, d, w / 2 - 120, 280 + i * 38, { size: 22, font: theme.body, outline: 0 }); });
      y = 860;
    } else if (top === 'stats') {
      panel(g, w / 2 - 380, 230, 760, 470, theme.teal);
      const st = this.game.statsList();
      st.forEach(([k, v], i) => { text(g, k, w / 2 - 340, 290 + i * 46, { size: 24, font: theme.body, outline: 0 }); text(g, String(v), w / 2 + 340, 290 + i * 46, { size: 26, align: 'right', color: theme.gold }); });
      y = 730;
    } else if (top === 'credits') {
      panel(g, w / 2 - 420, 230, 840, 520, theme.magenta);
      const lines = ['SELARA BAY — Heat on the Coast', '', 'Design, code, engine, art and music', 'I Wayan Bagus Somabawa', '', 'Custom WebGL2 renderer, procedural city,', 'procedural characters and a synthesized soundtrack.', 'Every asset is generated in code.', '', 'Made for the make.fun gta6-01 bounty.'];
      lines.forEach((l, i) => text(g, l, w / 2, 290 + i * 42, { size: i === 0 ? 30 : 22, align: 'center', font: i === 0 ? theme.font : theme.body, color: i === 0 ? theme.teal : '#fff', outline: i === 0 ? 4 : 0 }));
      y = 780;
    }
    if (top === 'controls' || top === 'stats' || top === 'credits') x = w / 2 - 300;
    items.forEach((it, i) => {
      const selected = i === this.sel;
      const iy = y + i * 64;
      const iw = 600;
      if (selected) { g.fillStyle = 'rgba(45,226,200,0.18)'; g.fillRect(x - 20, iy - 42, iw, 56); g.fillStyle = theme.magenta; g.fillRect(x - 20, iy - 42, 6, 56); }
      text(g, it.label.toUpperCase(), x, iy, { size: top === 'title' ? 38 : 32, color: selected ? '#fff' : '#b9c0d8', outline: 5 });
      reg(x - 20, iy - 42, iw, 56, () => { this.sel = i; if (it.action) it.action(); }, i);
      if (it.value) {
        text(g, it.value(), x + iw - 70, iy, { size: 28, align: 'right', color: theme.gold });
        text(g, '<', x + iw - 250, iy, { size: 28, color: theme.teal }); reg(x + iw - 265, iy - 40, 40, 50, () => { this.sel = i; it.left(); }, i);
        text(g, '>', x + iw - 50, iy, { size: 28, color: theme.teal }); reg(x + iw - 60, iy - 40, 40, 50, () => { this.sel = i; it.right(); }, i);
      }
    });
    if (this.confirm) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, w, h);
      panel(g, w / 2 - 380, h / 2 - 140, 760, 260, theme.red);
      text(g, this.confirm.msg, w / 2, h / 2 - 50, { size: 22, align: 'center', font: theme.body, outline: 0 });
      ['YES', 'NO'].forEach((l, i) => {
        const bx = w / 2 - 230 + i * 260, by = h / 2 + 30;
        g.fillStyle = this.confirm.sel === i ? theme.magenta : 'rgba(255,255,255,0.1)'; g.fillRect(bx, by, 200, 60);
        text(g, l, bx + 100, by + 42, { size: 30, align: 'center' });
        reg(bx, by, 200, 60, () => { const c = this.confirm; this.confirm = null; if (i === 0) c.yes(); });
      });
    }
    g.restore();
  }

  drawLogo(g, w, h) {
    const t = this.time;
    // vignette band behind the menu
    const grad = g.createLinearGradient(0, 0, w * 0.6, 0);
    grad.addColorStop(0, 'rgba(5,3,14,0.85)'); grad.addColorStop(1, 'rgba(5,3,14,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w * 0.6, h);
    g.save();
    g.translate(130, 330);
    const lg = g.createLinearGradient(0, -110, 900, 20);
    lg.addColorStop(0, '#2de2c8'); lg.addColorStop(0.5, '#ff3fb4'); lg.addColorStop(1, '#ffb347');
    g.font = `900 150px ${theme.font}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.lineJoin = 'round';
    for (const [blur, alpha] of [[60, 0.55], [25, 0.8]]) { g.shadowColor = `rgba(255,63,180,${alpha})`; g.shadowBlur = blur; g.fillStyle = lg; g.fillText('SELARA', 0, -20); g.fillText('BAY', 0, 120); }
    g.shadowBlur = 0;
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.strokeText('SELARA', 0, -20); g.strokeText('BAY', 0, 120);
    const flick = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 3.1);
    g.globalAlpha = flick;
    text(g, 'HEAT ON THE COAST', 330, 105, { size: 38, color: '#ffd166', outline: 5, shadow: 25 });
    g.restore();
    text(g, 'Click or press Enter', 140, h - 60, { size: 18, font: theme.body, color: '#aab', outline: 3 });
  }
}
