// Shared UI style: dark translucent panels, teal/magenta accents, heavy sans-serif with outlines, and
// vector icons drawn on the 2D canvas (no image assets).
export const theme = {
  font: '"Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif',
  body: '"Segoe UI", system-ui, Arial, sans-serif',
  teal: '#2de2c8', magenta: '#ff3fb4', gold: '#ffd166', red: '#ff4d5e', green: '#45e08b', blue: '#4da3ff',
  panel: 'rgba(10,12,22,0.72)', panelEdge: 'rgba(45,226,200,0.55)', gps: '#d77bff',
};

export function panel(g, x, y, w, h, accent = theme.teal, r = 10) {
  g.save();
  g.beginPath(); g.roundRect(x, y, w, h, r);
  g.fillStyle = theme.panel; g.fill();
  g.strokeStyle = accent; g.globalAlpha = 0.7; g.lineWidth = 1.5; g.stroke();
  g.globalAlpha = 1;
  // accent bar
  g.beginPath(); g.roundRect(x, y, 4, h, [r, 0, 0, r]); g.fillStyle = accent; g.fill();
  g.restore();
}

export function text(g, str, x, y, { size = 20, color = '#fff', align = 'left', font = theme.font, outline = 4, baseline = 'alphabetic', alpha = 1, shadow = 0 } = {}) {
  g.save();
  g.globalAlpha = alpha;
  g.font = `${font.includes('Black') ? '900 ' : '600 '}${size}px ${font}`;
  g.textAlign = align; g.textBaseline = baseline;
  if (shadow) { g.shadowColor = color; g.shadowBlur = shadow; }
  if (outline) { g.lineJoin = 'round'; g.lineWidth = outline; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(str, x, y); }
  g.fillStyle = color; g.fillText(str, x, y);
  g.restore();
}

export function star(g, x, y, r, fill, stroke = '#000') {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill; g.fill(); g.lineWidth = 2; g.strokeStyle = stroke; g.stroke();
}

// Map/minimap icons: a colored disc with a simple glyph.
export function drawIcon(g, icon, x, y, s, color) {
  g.save();
  g.translate(x, y);
  if (icon === 'dot') { g.beginPath(); g.arc(0, 0, s, 0, 7); g.fillStyle = color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#000'; g.stroke(); g.restore(); return; }
  if (icon === 'target') { g.beginPath(); g.arc(0, 0, s, 0, 7); g.fillStyle = color; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); g.beginPath(); g.arc(0, 0, s * 0.4, 0, 7); g.fillStyle = '#fff'; g.fill(); g.restore(); return; }
  g.beginPath(); g.arc(0, 0, s, 0, 7); g.fillStyle = '#0b0d16'; g.fill(); g.lineWidth = 2; g.strokeStyle = color; g.stroke();
  g.fillStyle = color; g.strokeStyle = color; g.lineWidth = Math.max(1.5, s * 0.18);
  const k = s * 0.55;
  switch (icon) {
    case 'house': g.beginPath(); g.moveTo(-k, 0); g.lineTo(0, -k); g.lineTo(k, 0); g.lineTo(k * 0.7, 0); g.lineTo(k * 0.7, k); g.lineTo(-k * 0.7, k); g.lineTo(-k * 0.7, 0); g.closePath(); g.fill(); break;
    case 'wrench': g.beginPath(); g.moveTo(-k, k); g.lineTo(k * 0.4, -k * 0.4); g.stroke(); g.beginPath(); g.arc(k * 0.5, -k * 0.5, k * 0.45, 0, 7); g.stroke(); break;
    case 'cross': g.fillRect(-k * 0.3, -k, k * 0.6, k * 2); g.fillRect(-k, -k * 0.3, k * 2, k * 0.6); break;
    case 'badge': star(g, 0, 0, k, color, color); break;
    case 'bank': g.fillRect(-k, k * 0.6, k * 2, k * 0.3); for (let i = -1; i <= 1; i++) g.fillRect(i * k * 0.65 - k * 0.12, -k * 0.2, k * 0.24, k * 0.8); g.beginPath(); g.moveTo(-k, -k * 0.3); g.lineTo(0, -k); g.lineTo(k, -k * 0.3); g.fill(); break;
    case 'orchid': for (let i = 0; i < 5; i++) { g.save(); g.rotate(i * Math.PI * 2 / 5); g.beginPath(); g.ellipse(0, -k * 0.55, k * 0.3, k * 0.5, 0, 0, 7); g.fill(); g.restore(); } break;
    case 'crate': g.strokeRect(-k * 0.8, -k * 0.8, k * 1.6, k * 1.6); g.beginPath(); g.moveTo(-k * 0.8, -k * 0.8); g.lineTo(k * 0.8, k * 0.8); g.stroke(); break;
    case 'spray': g.fillRect(-k * 0.4, -k * 0.2, k * 0.8, k * 1.2); g.fillRect(-k * 0.15, -k * 0.6, k * 0.3, k * 0.4); g.beginPath(); g.arc(k * 0.7, -k * 0.7, k * 0.2, 0, 7); g.fill(); break;
    case 'gun': g.fillRect(-k, -k * 0.35, k * 1.8, k * 0.5); g.fillRect(-k * 0.2, 0, k * 0.5, k * 0.9); break;
    case 'laptop': g.strokeRect(-k * 0.7, -k * 0.7, k * 1.4, k * 1); g.fillRect(-k, k * 0.45, k * 2, k * 0.25); break;
    case 'cup': g.fillRect(-k * 0.6, -k * 0.4, k * 1.0, k * 1.1); g.beginPath(); g.arc(k * 0.5, k * 0.1, k * 0.35, -1.5, 1.5); g.stroke(); break;
    case 'save': g.fillRect(-k * 0.8, -k * 0.8, k * 1.6, k * 1.6); g.fillStyle = '#0b0d16'; g.fillRect(-k * 0.45, -k * 0.8, k * 0.9, k * 0.6); break;
    case 'mission': g.font = `900 ${s * 1.2}px ${theme.font}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, 1); break;
    case 'heli': g.fillRect(-k, -k * 0.15, k * 2, k * 0.3); g.beginPath(); g.ellipse(0, k * 0.3, k * 0.5, k * 0.35, 0, 0, 7); g.fill(); break;
    case 'tag': for (let i = 0; i < 5; i++) { g.save(); g.rotate(i * 1.2566); g.fillRect(-k * 0.12, -k, k * 0.24, k * 0.8); g.restore(); } break;
    case 'flag': g.fillRect(-k * 0.6, -k, k * 0.18, k * 2); g.beginPath(); g.moveTo(-k * 0.4, -k); g.lineTo(k, -k * 0.55); g.lineTo(-k * 0.4, -k * 0.1); g.fill(); break;
    case 'car': g.fillRect(-k, -k * 0.2, k * 2, k * 0.6); g.fillRect(-k * 0.5, -k * 0.6, k, k * 0.45); break;
    case 'person': g.beginPath(); g.arc(0, -k * 0.5, k * 0.35, 0, 7); g.fill(); g.fillRect(-k * 0.45, -k * 0.1, k * 0.9, k * 1); break;
    case 'boat': g.beginPath(); g.moveTo(-k, 0); g.lineTo(k, 0); g.lineTo(k * 0.6, k * 0.6); g.lineTo(-k * 0.6, k * 0.6); g.fill(); g.fillRect(-k * 0.1, -k, k * 0.2, k); break;
    default: g.beginPath(); g.arc(0, 0, k * 0.5, 0, 7); g.fill();
  }
  g.restore();
}

export function weaponIcon(g, id, x, y, w, color = '#fff') {
  g.save(); g.translate(x, y); g.fillStyle = color; g.strokeStyle = color; g.lineWidth = 3;
  const s = w / 60;
  g.scale(s, s);
  switch (id) {
    case 'fists': g.beginPath(); g.roundRect(-16, -12, 32, 24, 8); g.fill(); g.fillStyle = 'rgba(0,0,0,0.5)'; for (let i = 0; i < 3; i++) g.fillRect(-10 + i * 8, -12, 2, 10); break;
    case 'pistol': g.fillRect(-22, -10, 40, 9); g.fillRect(-20, -1, 11, 16); g.fillRect(-6, -1, 6, 5); break;
    case 'smg': g.fillRect(-28, -9, 50, 10); g.fillRect(-10, 1, 8, 16); g.fillRect(4, 1, 6, 12); g.fillRect(22, -6, 8, 3); g.fillRect(-32, -7, 6, 12); break;
    case 'shotgun': g.fillRect(-30, -8, 62, 6); g.fillRect(-30, -2, 45, 5); g.fillRect(-34, -6, 14, 14); break;
  }
  g.restore();
}
