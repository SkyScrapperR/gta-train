// Captures the README screenshots at 1920x1080 on the High preset from the running game (?shot=N scenes).
// usage: node tools/screenshots.mjs [shotNumber...]
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { startServer } from './static-server.mjs';

const NAMES = { 1: '01-title.png', 2: '02-night-chase.png', 3: '03-mission-cutscene.png', 4: '04-docks-firefight.png' };
const which = process.argv.slice(2).map(Number).filter(Boolean);
const shots = which.length ? which : [1, 2, 3, 4];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
fs.mkdirSync(path.join(root, 'screenshots'), { recursive: true });
const { server, url } = await startServer(path.join(root, 'game'));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let failed = false;
for (const n of shots) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}?shot=${n}&quality=high&scale=1`);
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 900000, polling: 1000 });
  // let a few full frames render so bloom/eye adaptation settle
  await page.evaluate(() => new Promise((r) => { let k = 0; const f = () => (++k > 3 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }));
  const out = path.join(root, 'screenshots', NAMES[n]);
  await page.screenshot({ path: out });
  console.log('captured', NAMES[n], errors.length ? `errors: ${errors.join(' | ')}` : '');
  if (errors.length) failed = true;
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
