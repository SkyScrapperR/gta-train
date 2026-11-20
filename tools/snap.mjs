// Dev helper: open the game with a query string, wait, run optional JS, screenshot, print console output.
// usage: node tools/snap.mjs "<query>" out.png [waitMs] [js-to-eval]
import { chromium } from 'playwright';
import path from 'node:path';
import { startServer } from './static-server.mjs';

const [query = '', out = 'tools/out/snap.png', wait = '4000', js = ''] = process.argv.slice(2);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../game');
const { server, url } = await startServer(root);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.VW || 1280), height: Number(process.env.VH || 720) } });
const errors = [];
page.on('console', (m) => { if (/GPU stall|ReadPixels/.test(m.text())) return; if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); else console.log('[log]', m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
await page.goto(url + '?' + query);
await page.waitForTimeout(Number(wait));
if (js) { const r = await page.evaluate(js); if (r !== undefined) console.log('eval:', JSON.stringify(r)); await page.waitForTimeout(1500); }
await page.screenshot({ path: out });
console.log(errors.slice(0, 30).join('\n') || 'no errors');
await browser.close();
server.close();
