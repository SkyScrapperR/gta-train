// Pre-rendered city map (used by the minimap and the big map) and the rotating circular minimap with blips,
// search area, GPS route and health/armor arcs.
import { BLOCK, GRID, ROAD_HALF, LAND, BEACH, FERRY_PIER, EAST_PIER, DISTRICTS, CITY_SIZE } from '../world/city.js';
import { theme, drawIcon } from './theme.js';

export const MAP_RECT = { x: -200, z: -200, size: 1400 };
export const MAP_PX = 2048;
const S = MAP_PX / MAP_RECT.size;
export const toMap = (x, z) => [(x - MAP_RECT.x) * S, (z - MAP_RECT.z) * S];

export function buildMapCanvas(world) {
  const c = document.createElement('canvas');
  c.width = c.height = MAP_PX;
  const g = c.getContext('2d');
  // sea with subtle gradient
  const grad = g.createRadialGradient(MAP_PX / 2, MAP_PX / 2, 200, MAP_PX / 2, MAP_PX / 2, MAP_PX * 0.75);
  grad.addColorStop(0, '#123a52'); grad.addColorStop(1, '#071826');
  g.fillStyle = grad; g.fillRect(0, 0, MAP_PX, MAP_PX);
  const rect = (r, col) => { const [x0, y0] = toMap(r.x0, r.z0), [x1, y1] = toMap(r.x1, r.z1); g.fillStyle = col; g.fillRect(x0, y0, x1 - x0, y1 - y0); };
  rect({ x0: LAND.x0 - 6, z0: LAND.z0 - 6, x1: LAND.x1 + 6, z1: BEACH.z0 + 40 }, '#1d5b6e');
  rect(LAND, '#2b2f3a');
  rect({ x0: BEACH.x0, z0: BEACH.z0, x1: BEACH.x1, z1: BEACH.z0 + 38 }, '#c9b37a');
  rect(FERRY_PIER, '#7a5a3c'); rect(EAST_PIER, '#7a5a3c');
  const distCol = { kotalama: '#3a4a63', kemuning: '#4a3d36', bukitasri: '#2f4a30', docks: '#3e3a3a', pantai: '#5b5236', park: '#2f6b3a' };
  for (const b of world.city.blocks) {
    const x0 = b.bx * BLOCK + ROAD_HALF, z0 = b.bz * BLOCK + ROAD_HALF;
    rect({ x0, z0, x1: x0 + BLOCK - ROAD_HALF * 2, z1: z0 + BLOCK - ROAD_HALF * 2 }, distCol[b.district]);
  }
  for (const p of world.city.ponds) { const [x, y] = toMap(p.x, p.z); g.fillStyle = '#1e6f86'; g.beginPath(); g.ellipse(x, y, p.rx * S, p.rz * S, 0, 0, 7); g.fill(); }
  // buildings
  for (const b of world.city.buildings) {
    const p = b.parts[0];
    const h = Math.max(...b.parts.map((q) => q.y1));
    const l = Math.min(1, h / 120);
    g.fillStyle = b.landmark ? '#8a7fb0' : `rgb(${90 + l * 60},${95 + l * 60},${110 + l * 60})`;
    for (const q of b.parts) { const [x0, y0] = toMap(q.x0, q.z0), [x1, y1] = toMap(q.x1, q.z1); g.fillRect(x0, y0, x1 - x0, y1 - y0); }
  }
  // roads
  g.fillStyle = '#d9dde6';
  for (let i = 0; i <= GRID; i++) {
    rect({ x0: i * BLOCK - ROAD_HALF, z0: -ROAD_HALF, x1: i * BLOCK + ROAD_HALF, z1: CITY_SIZE + ROAD_HALF }, '#c7ccd6');
    rect({ x0: -ROAD_HALF, z0: i * BLOCK - ROAD_HALF, x1: CITY_SIZE + ROAD_HALF, z1: i * BLOCK + ROAD_HALF }, '#c7ccd6');
  }
  return c;
}

export class Minimap {
  constructor(game, mapCanvas) { this.game = game; this.map = mapCanvas; this.zoom = 1.3; }

  draw(g, cx, cy, R) {
    const game = this.game, p = game.player;
    const pos = p.state === 'driving' && p.vehicle ? [p.vehicle.x, p.vehicle.z] : [p.x, p.z];
    const speed = p.state === 'driving' && p.vehicle ? p.vehicle.speed : 0;
    this.zoom += ((speed > 12 ? 0.75 : 1.3) - this.zoom) * 0.03;
    const z = this.zoom;
    const heading = game.rig.yaw; // camera heading: map rotates so "up" is where the camera looks
    g.save();
    // frame
    g.beginPath(); g.arc(cx, cy, R + 6, 0, Math.PI * 2); g.fillStyle = 'rgba(8,10,18,0.75)'; g.fill();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy);
    g.rotate(Math.PI + heading); // world +z (south) maps down; camera forward should point up
    g.scale(z / S, z / S);
    const [mx, my] = toMap(pos[0], pos[1]);
    g.drawImage(this.map, -mx, -my);
    // search area
    const W = game.wanted;
    if (W.searching && W.lastSeen) {
      const [sx, sy] = toMap(W.lastSeen[0], W.lastSeen[1]);
      g.fillStyle = `rgba(255,40,60,${0.18 + 0.08 * Math.sin(game.time * 6)})`;
      g.beginPath(); g.arc(sx - mx, sy - my, W.searchRadius * S, 0, Math.PI * 2); g.fill();
    }
    // GPS route
    const route = game.gps?.route;
    if (route && route.length > 1) {
      g.strokeStyle = game.gps.color || theme.gps; g.lineWidth = 7 * S / z; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath();
      route.forEach((pt, i) => { const [x, y] = toMap(pt[0], pt[1]); if (i) g.lineTo(x - mx, y - my); else g.moveTo(x - mx, y - my); });
      g.stroke();
    }
    g.restore();
    // blips (kept upright)
    const toScreen = (wx, wz) => {
      const dx = (wx - pos[0]) * z, dz = (wz - pos[1]) * z;
      const a = Math.PI + heading;
      const c = Math.cos(a), s = Math.sin(a);
      return [cx + dx * c - dz * s, cy + dx * s + dz * c];
    };
    const blip = (wx, wz, icon, color, clampEdge = true, size = 9) => {
      let [x, y] = toScreen(wx, wz);
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d > R - 8) { if (!clampEdge) return; x = cx + dx / d * (R - 8); y = cy + dy / d * (R - 8); }
      drawIcon(g, icon, x, y, size, color);
    };
    for (const b of game.blips()) blip(b.x, b.z, b.icon, b.color, b.clamp !== false, b.size || 9);
    for (const c of game.police.officers()) {
      if (!c.alive || game.wanted.stars === 0) continue;
      const on = Math.floor(game.time * 6) % 2 === 0;
      blip(c.x, c.z, 'dot', on ? '#ff3344' : '#3d7bff', false, 5);
    }
    if (game.helicopter?.active) blip(game.helicopter.x, game.helicopter.z, 'heli', '#ff3344', false, 8);
    // player arrow (points along the player's facing relative to the camera)
    const pyaw = p.state === 'driving' && p.vehicle ? p.vehicle.yaw : p.yaw;
    g.save(); g.translate(cx, cy); g.rotate(-(pyaw - heading));
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // north marker
    const [nx, ny] = toScreen(pos[0], pos[1] - 1000);
    const nd = Math.hypot(nx - cx, ny - cy);
    g.fillStyle = '#fff'; g.font = '900 13px ' + theme.font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', cx + (nx - cx) / nd * (R + 1), cy + (ny - cy) / nd * (R + 1));
    // health / armor arcs
    const arc = (frac, r, col, start, span) => { g.beginPath(); g.arc(cx, cy, r, start, start + span * frac); g.strokeStyle = col; g.lineWidth = 6; g.stroke(); };
    g.lineCap = 'butt';
    arc(1, R + 12, 'rgba(255,255,255,0.12)', Math.PI * 0.6, Math.PI * 0.8);
    arc(Math.max(0, p.health / p.maxHealth), R + 12, p.health < 30 ? '#ff4d5e' : '#45e08b', Math.PI * 0.6, Math.PI * 0.8);
    arc(1, R + 12, 'rgba(255,255,255,0.12)', Math.PI * 1.6, -Math.PI * 0.8 * -1);
    arc(p.armor / 100, R + 12, '#4da3ff', Math.PI * 1.6, Math.PI * 0.8);
  }
}
