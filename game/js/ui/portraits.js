// Stylized 2D portrait cards for dialogue: each character gets a framed bust drawn with vector shapes.
import { theme } from './theme.js';

export const PORTRAITS = {
  kai: { name: 'Kai', skin: '#c99468', hair: '#111', shirt: '#0fa39a', accent: '#2de2c8', hairStyle: 'short' },
  lin: { name: 'Mama Lin', skin: '#d9a982', hair: '#9a9a9a', shirt: '#d9732f', accent: '#ffd166', hairStyle: 'bun' },
  viktor: { name: 'Viktor Raza', skin: '#e3c0a0', hair: '#2a1a14', shirt: '#1d1a24', accent: '#b14cff', hairStyle: 'slick', scar: true },
  dex: { name: 'Dex', skin: '#9a6b47', hair: '#141010', shirt: '#f2d633', accent: '#9aa7ff', hairStyle: 'cap' },
  rendy: { name: 'Rendy', skin: '#e6bd9c', hair: '#c49a35', shirt: '#f0e44e', accent: '#ffe14f', hairStyle: 'short' },
  goon: { name: 'Enforcer', skin: '#b98a63', hair: '#111', shirt: '#5a1a78', accent: '#d77bff', hairStyle: 'none' },
  radio: { name: 'Radio', skin: '#888', hair: '#333', shirt: '#333', accent: '#ff3fb4', hairStyle: 'none' },
};

export function drawPortrait(g, key, x, y, size) {
  const p = PORTRAITS[key];
  if (!p) return;
  g.save();
  g.translate(x, y);
  const s = size / 100;
  g.scale(s, s);
  // card
  const grad = g.createLinearGradient(0, 0, 0, 120);
  grad.addColorStop(0, '#1b1530'); grad.addColorStop(1, '#0a0a14');
  g.fillStyle = grad; g.beginPath(); g.roundRect(0, 0, 100, 120, 10); g.fill();
  g.strokeStyle = p.accent; g.lineWidth = 3; g.stroke();
  g.save(); g.beginPath(); g.roundRect(0, 0, 100, 120, 10); g.clip();
  // glow
  const glow = g.createRadialGradient(50, 50, 5, 50, 50, 70); glow.addColorStop(0, p.accent + '55'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 100, 120);
  // shoulders
  g.fillStyle = p.shirt; g.beginPath(); g.ellipse(50, 118, 44, 30, 0, Math.PI, 0); g.fill();
  if (key === 'kai') { g.fillStyle = '#eee'; g.beginPath(); g.moveTo(44, 90); g.lineTo(56, 90); g.lineTo(52, 120); g.lineTo(48, 120); g.fill(); }
  // neck + head
  g.fillStyle = p.skin; g.fillRect(43, 72, 14, 18);
  g.beginPath(); g.ellipse(50, 55, 21, 26, 0, 0, Math.PI * 2); g.fill();
  // hair
  g.fillStyle = p.hair;
  if (p.hairStyle === 'short' || p.hairStyle === 'slick') { g.beginPath(); g.ellipse(50, 40, 22, 15, 0, Math.PI, 0); g.fill(); if (p.hairStyle === 'slick') g.fillRect(29, 38, 42, 6); }
  if (p.hairStyle === 'bun') { g.beginPath(); g.ellipse(50, 40, 23, 16, 0, Math.PI, 0); g.fill(); g.beginPath(); g.arc(50, 22, 9, 0, 7); g.fill(); }
  if (p.hairStyle === 'cap') { g.fillStyle = '#c2185b'; g.beginPath(); g.ellipse(50, 38, 23, 14, 0, Math.PI, 0); g.fill(); g.fillRect(50, 34, 28, 5); }
  // face
  g.fillStyle = '#fff'; g.beginPath(); g.ellipse(42, 55, 4, 2.6, 0, 0, 7); g.ellipse(58, 55, 4, 2.6, 0, 0, 7); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(42, 55, 1.8, 0, 7); g.arc(58, 55, 1.8, 0, 7); g.fill();
  g.strokeStyle = '#2a1a10'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(37, 49); g.lineTo(46, key === 'viktor' ? 51 : 48); g.moveTo(54, key === 'viktor' ? 51 : 48); g.lineTo(63, 49); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(50, 57); g.lineTo(48, 64); g.lineTo(51, 65); g.stroke();
  g.strokeStyle = '#7a2b25'; g.lineWidth = 2; g.beginPath();
  if (key === 'viktor') { g.moveTo(43, 71); g.lineTo(57, 69); } else { g.moveTo(44, 70); g.quadraticCurveTo(50, 73, 56, 70); }
  g.stroke();
  if (p.scar) { g.strokeStyle = '#a0524a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(60, 47); g.lineTo(65, 62); g.stroke(); }
  if (key === 'lin') { g.strokeStyle = '#333'; g.lineWidth = 1.5; g.strokeRect(36, 51, 11, 8); g.strokeRect(53, 51, 11, 8); }
  g.restore();
  // name plate
  g.fillStyle = p.accent; g.fillRect(0, 104, 100, 16);
  g.fillStyle = '#000'; g.font = `900 11px ${theme.font}`; g.textAlign = 'center'; g.fillText(p.name.toUpperCase(), 50, 116);
  g.restore();
}
