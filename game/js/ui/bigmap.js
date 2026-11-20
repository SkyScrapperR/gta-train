// Full-screen map (M): the whole city with district names, landmark icons, legend, pan/zoom,
// and click-to-set waypoint (which drives the GPS route and a 3D beam).
import { theme, panel, text, drawIcon } from './theme.js';
import { MAP_RECT, MAP_PX, toMap } from './minimap.js';
import { BLOCK, DISTRICTS } from '../world/city.js';

export class BigMap {
  constructor(game, mapCanvas) { this.game = game; this.map = mapCanvas; this.zoom = 1; this.pan = [0, 0]; }
  open() { const p = this.game.player; this.pan = [p.x, p.z]; this.zoom = 1; }
  // screen -> world
  view(W, H) {
    const s = Math.min(W, H) / MAP_RECT.size * 0.95 * this.zoom;
    return { s, ox: W / 2 - (this.pan[0] - MAP_RECT.x) * s, oy: H / 2 - (this.pan[1] - MAP_RECT.z) * s };
  }
  click(mx, my, W, H) {
    const v = this.view(W, H);
    const wx = (mx - v.ox) / v.s + MAP_RECT.x, wz = (my - v.oy) / v.s + MAP_RECT.z;
    const g = this.game;
    if (g.gps.waypoint && Math.hypot(g.gps.waypoint[0] - wx, g.gps.waypoint[1] - wz) < 25) { g.gps.setWaypoint(null); return; }
    g.gps.setWaypoint([wx, wz]);
    g.audio?.ui('click');
  }
  wheel(d) { this.zoom = Math.max(0.7, Math.min(3, this.zoom * (d > 0 ? 0.88 : 1.14))); }
  drag(dx, dy, W, H) { const v = this.view(W, H); this.pan[0] -= dx / v.s; this.pan[1] -= dy / v.s; }
  draw(g, W, H) {
    const game = this.game;
    g.fillStyle = '#050810'; g.fillRect(0, 0, W, H);
    const v = this.view(W, H);
    const sc = v.s * MAP_RECT.size / MAP_PX;
    g.drawImage(this.map, v.ox, v.oy, MAP_PX * sc, MAP_PX * sc);
    const ws = (x, z) => [v.ox + (x - MAP_RECT.x) * v.s, v.oy + (z - MAP_RECT.z) * v.s];
    // district labels
    const labels = { kotalama: [495, 300], kemuning: [330, 120], bukitasri: [130, 420], docks: [810, 380], pantai: [600, 905], park: [315, 585] };
    for (const [k, [x, z]] of Object.entries(labels)) {
      const [sx, sy] = ws(x, z);
      text(g, DISTRICTS[k].name.toUpperCase(), sx, sy, { size: 22 * Math.min(1.3, this.zoom), align: 'center', color: DISTRICTS[k].color, outline: 5 });
      text(g, DISTRICTS[k].subtitle, sx, sy + 20, { size: 13, align: 'center', font: theme.body, color: '#ddd', outline: 3 });
    }
    // route
    const route = game.gps.route;
    if (route && route.length > 1) {
      g.strokeStyle = game.gps.color || theme.gps; g.lineWidth = 5; g.lineJoin = 'round';
      g.beginPath(); route.forEach((p, i) => { const [x, y] = ws(p[0], p[1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.stroke();
    }
    for (const b of game.blips()) { const [x, y] = ws(b.x, b.z); drawIcon(g, b.icon, x, y, (b.size || 9) * 1.3, b.color); }
    if (game.gps.waypoint) { const [x, y] = ws(game.gps.waypoint[0], game.gps.waypoint[1]); drawIcon(g, 'flag', x, y, 13, theme.gps); }
    // player
    const p = game.player, pv = p.state === 'driving' && p.vehicle ? p.vehicle : p;
    const [px, py] = ws(pv.x, pv.z);
    g.save(); g.translate(px, py); g.rotate(Math.PI - pv.yaw);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // legend
    panel(g, 24, 24, 280, 330, theme.teal);
    text(g, 'SELARA BAY', 44, 62, { size: 26, color: theme.teal });
    const legend = [['house', '#7dff9a', 'Safehouse / Save'], ['wrench', '#ffd166', "Lin's Garage"], ['mission', theme.gold, 'Mission'], ['cross', '#ff6b81', 'Hospital'], ['badge', '#5aa9ff', 'Police HQ'], ['gun', '#ff9f43', 'Bang Bang Arms'], ['spray', '#4dffd2', 'Kilat Respray'], ['tag', '#d77bff', 'Orchid tag'], ['flag', theme.gps, 'Waypoint']];
    legend.forEach(([ic, col, label], i) => { drawIcon(g, ic, 52, 92 + i * 28, 10, col); text(g, label, 72, 99 + i * 28, { size: 17, font: theme.body, outline: 0 }); });
    text(g, 'Click: set/clear waypoint   Wheel: zoom   Drag: pan   M/Esc: close', W / 2, H - 28, { size: 18, align: 'center', font: theme.body });
  }
}
