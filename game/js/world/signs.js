// Text-to-texture atlas for shop signs, landmark signs, billboards and graffiti tags, drawn with a 2D canvas.
import { SHOP_NAMES, BILLBOARDS } from './city.js';
import { mulberry32 } from '../core/math.js';

export const ATLAS_SIZE = 2048;
const SIGN_W = 256, SIGN_H = 64, SIGN_COLS = 8;
const BB_W = 512, BB_H = 256, BB_Y = 1024;
const TAG_Y = 1600, TAG_W = 256;

const SIGN_STYLES = [
  ['#1b1f3a', '#ffd166'], ['#ffd166', '#2b1a00'], ['#0e6e64', '#e9fffb'], ['#b3123b', '#fff2f2'],
  ['#ffffff', '#c2185b'], ['#2b2b2b', '#4dffd2'], ['#f06d1f', '#fff'], ['#3d2c8d', '#ffe3fb'],
];

export function buildSignAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS_SIZE;
  const g = c.getContext('2d');
  g.fillStyle = '#222'; g.fillRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  // shop signs
  SHOP_NAMES.forEach((name, i) => {
    const x = (i % SIGN_COLS) * SIGN_W, y = Math.floor(i / SIGN_COLS) * SIGN_H;
    const [bg, fg] = SIGN_STYLES[i % SIGN_STYLES.length];
    g.fillStyle = bg; g.fillRect(x, y, SIGN_W, SIGN_H);
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, SIGN_W - 10, SIGN_H - 10);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    let size = 34;
    g.font = `900 ${size}px "Arial Black", Impact, sans-serif`;
    while (g.measureText(name).width > SIGN_W - 26 && size > 12) { size -= 2; g.font = `900 ${size}px "Arial Black", Impact, sans-serif`; }
    g.fillText(name, x + SIGN_W / 2, y + SIGN_H / 2 + 2);
  });
  // billboards
  BILLBOARDS.forEach((b, i) => {
    const x = (i % 4) * BB_W, y = BB_Y + Math.floor(i / 4) * BB_H;
    const grad = g.createLinearGradient(x, y, x + BB_W, y + BB_H);
    grad.addColorStop(0, b.bg[0]); grad.addColorStop(1, b.bg[1]);
    g.fillStyle = grad; g.fillRect(x, y, BB_W, BB_H);
    // abstract product shapes
    const r = mulberry32(i + 5);
    g.globalAlpha = 0.25; g.fillStyle = '#fff';
    for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x + r() * BB_W, y + r() * BB_H, 20 + r() * 70, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
    g.fillStyle = b.fg; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '900 88px "Arial Black", Impact, sans-serif';
    let s = 88; while (g.measureText(b.text).width > BB_W - 50) { s -= 4; g.font = `900 ${s}px "Arial Black", Impact, sans-serif`; }
    g.fillText(b.text, x + 26, y + 140);
    g.font = 'bold 34px Arial, sans-serif'; g.fillText(b.sub, x + 30, y + 196);
    g.strokeStyle = b.fg; g.lineWidth = 8; g.strokeRect(x + 8, y + 8, BB_W - 16, BB_H - 16);
  });
  // orchid tag graffiti
  {
    const x = 0, y = TAG_Y;
    g.clearRect(x, y, TAG_W, TAG_W);
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(x, y, TAG_W, TAG_W);
    g.translate(x + 128, y + 128);
    for (let k = 0; k < 5; k++) { g.rotate((Math.PI * 2) / 5); g.fillStyle = k % 2 ? '#ff4fd8' : '#b14cff'; g.beginPath(); g.ellipse(0, -52, 26, 56, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#ffe14f'; g.beginPath(); g.arc(0, 0, 20, 0, Math.PI * 2); g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  return c;
}

export function signUV(index) {
  const x = (index % SIGN_COLS) * SIGN_W, y = Math.floor(index / SIGN_COLS) * SIGN_H;
  const p = 3 / ATLAS_SIZE;
  return [x / ATLAS_SIZE + p, y / ATLAS_SIZE + p, (x + SIGN_W) / ATLAS_SIZE - p, (y + SIGN_H) / ATLAS_SIZE - p];
}
export function billboardUV(index) {
  const x = (index % 4) * BB_W, y = BB_Y + Math.floor(index / 4) * BB_H;
  return [x / ATLAS_SIZE, y / ATLAS_SIZE, (x + BB_W) / ATLAS_SIZE, (y + BB_H) / ATLAS_SIZE];
}
export function tagUV() { return [0, TAG_Y / ATLAS_SIZE, TAG_W / ATLAS_SIZE, (TAG_Y + TAG_W) / ATLAS_SIZE]; }
