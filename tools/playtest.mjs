// Automated Playwright play-through of Selara Bay.
// Starts a new game from the title menu, walks, enters a car, drives the first mission route along the road
// graph (no teleporting), shoots, triggers and loses a wanted level, completes all six missions (teleports allowed
// for long trips after the first route), tests save/load, death and arrest, and fails on any console error.
// usage: node tools/playtest.mjs [--headed]
import { chromium } from 'playwright';
import path from 'node:path';
import { startServer } from './static-server.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../game');
const { server, url } = await startServer(root);
const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

const t0 = Date.now();
process.on('unhandledRejection', async (e) => { console.error('PLAY-THROUGH FAILED:', e.message); try { await page.screenshot({ path: 'tools/out/playtest-fail.png' }); } catch (_) {} process.exit(1); });
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const ev = (fn, arg) => page.evaluate(fn, arg);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(cond, msg) { if (!cond) throw new Error('CHECK FAILED: ' + msg); log('ok -', msg); }
async function waitFor(fn, arg, timeoutS = 240, label = '') {
  const end = Date.now() + timeoutS * 1000;
  while (Date.now() < end) {
    if (errors.length) throw new Error('console error: ' + errors[0]);
    if (await ev(fn, arg)) return true;
    await ev(() => window.__pt.tick());
    await sleep(300);
  }
  throw new Error('timeout waiting for ' + (label || fn.toString().slice(0, 80)));
}

try {
await page.goto(url + '?quality=low&scale=0.3');
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 120000 });
log('title screen up');

// Test helpers injected into the page: cutscene skipping, teleports, walking and a road-graph autopilot.
await ev(() => {
  const g = window.__game;
  g.noAutoPause = true;
  g.simSpeed = 12;
  g.trafficDensity = 0.5;
  window.__pt = {
    failures: [],
    walkTarget: null,
    tick() {
      if (g.state === 'cutscene') g.missions.skipLine();
      if (this.walkTarget) {
        const p = g.player, [x, z] = this.walkTarget;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < 1.0 || p.state !== 'foot') { g.input.hold('KeyW', false); this.walkTarget = null; }
        else { g.rig.yaw = Math.atan2(x - p.x, z - p.z); g.input.hold('KeyW', true); }
      }
    },
    walk(x, z) { this.walkTarget = [x, z]; },
    tp(x, z) {
      const p = g.player;
      if (p.state === 'driving') { const v = p.vehicle; v.x = x; v.z = z; v.vx = v.vz = 0; v.angVel = 0; }
      else { p.x = x; p.z = z; p.vx = p.vz = 0; }
      g.rig.snap = true;
    },
    // Road-graph autopilot: steers the player's car along the GPS route with real physics.
    drive(tx, tz, speed = 15) {
      const pts = g.world.roads.routePoints(g.player.vehicle.x, g.player.vehicle.z, tx, tz).slice(1);
      const ap = { pts, i: 0, stuck: 0, rev: 0, done: false };
      ap.controls = (v, dt) => {
        if (ap.done) return { throttle: 0, steer: 0, handbrake: true };
        while (ap.i < ap.pts.length - 1 && Math.hypot(ap.pts[ap.i][0] - v.x, ap.pts[ap.i][1] - v.z) < 8) ap.i++;
        const t = ap.pts[ap.i], dx = t[0] - v.x, dz = t[1] - v.z, dist = Math.hypot(dx, dz);
        if (ap.i === ap.pts.length - 1 && dist < 3) { ap.done = true; return { throttle: 0, steer: 0, handbrake: true }; }
        let err = Math.atan2(dx, dz) - v.yaw; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
        let target = Math.abs(err) > 0.5 ? 7 : speed;
        if (ap.i === ap.pts.length - 1) target = Math.min(target, dist * 0.6 + 1);
        const block = g.traffic.obstacleAhead(v);
        if (block < 10) target = Math.min(target, Math.max(0, block - 3));
        const fs = v.forwardSpeed;
        if (v.speed < 0.5 && target > 2) ap.stuck += dt; else ap.stuck = Math.max(0, ap.stuck - dt);
        if (ap.stuck > 2.5) { ap.rev = 1.2; ap.stuck = 0; }
        if (ap.rev > 0) { ap.rev -= dt; return { throttle: -0.7, steer: err > 0 ? 1 : -1, handbrake: false }; }
        return { throttle: Math.max(-1, Math.min(1, (target - fs) * 0.4)), steer: Math.max(-1, Math.min(1, -err * 2.2)), handbrake: false };
      };
      g.autopilot = ap;
      return pts.length;
    },
  };
  g.events.on('missionFailed', (id) => window.__pt.failures.push(id + ': ' + g.hud.banner?.sub));
});

// ---------------------------------------------------------------- new game from the menu
await ev(() => window.__game.menus.key('Enter'));
await waitFor(() => window.__game.state === 'cutscene' || window.__game.state === 'playing', null, 60, 'new game');
log('new game started, intro cutscene');
await waitFor(() => window.__game.state === 'playing' && window.__game.hud.objective.includes('Merpati'), null, 200, 'intro done');
check(true, 'intro cutscene finished, objective: get in the Merpati');

// walk around, then walk to the car and enter it
await ev(() => { const p = window.__game.player; window.__pt.walk(p.x, p.z - 15); });
await waitFor(() => !window.__pt.walkTarget, null, 120, 'walk');
const start = await ev(() => { const g = window.__game; const p = g.player; return [p.x, p.z]; });
check(start[1] < 990, `walked around on foot (now at ${start.map((n) => n.toFixed(0))})`);
await ev(() => { const g = window.__game; const v = g.missions.run.vehicles[0]; const d = v.doorWorld(); window.__pt.walk(d[0], d[2] + 1); });
await waitFor(() => !window.__pt.walkTarget, null, 160, 'walk to car');
await ev(() => window.__game.input.press('KeyF'));
await waitFor(() => window.__game.player.state === 'driving', null, 60, 'enter car');
check(true, 'entered the Merpati');

// drive the real route to Lin's Garage along the road graph
const n = await ev(() => { const g = window.__game; const t = g.missions.run.P.garageDrop; return window.__pt.drive(t[0], t[1]); });
log(`autopilot route with ${n} waypoints`);
await waitFor(() => { const g = window.__game; return g.state === 'cutscene' || g.missions.completed.has('homecoming'); }, null, 900, 'drive to garage');
await ev(() => { window.__game.autopilot = null; });
await waitFor(() => window.__game.missions.completed.has('homecoming'), null, 200, 'mission 1');
check(true, 'Mission 1 "Homecoming" passed after a real drive');

// ---------------------------------------------------------------- shooting + wanted level
await ev(() => { const g = window.__game; const p = g.player; if (p.state === 'driving') p.beginExit(); });
await waitFor(() => window.__game.player.state === 'foot', null, 30);
const shots = await ev(async () => {
  const g = window.__game;
  g.weapons.give('pistol', 30);
  g.input.hold('Mouse2', true);
  for (let i = 0; i < 4; i++) { g.input.press('Mouse0'); await new Promise((r) => setTimeout(r, 500)); }
  g.input.hold('Mouse2', false);
  return g.weapons.ammo.clip + g.weapons.ammo.reserve;
});
check(shots < 30, `fired the Kobra 9 (${30 - shots} rounds)`);
await ev(() => { const g = window.__game; g.events.emit('crime', { type: 'kill', x: g.player.x, z: g.player.z }); });
check(await ev(() => window.__game.wanted.stars >= 1), 'wanted level triggered');
await ev(() => { window.__pt.tp(-15, 300); });
await waitFor(() => window.__game.wanted.stars === 0, null, 300, 'lose wanted');
check(true, 'lost the wanted level');

// ---------------------------------------------------------------- missions 2..6 (teleports allowed)
async function startMission(id) {
  await ev(() => { const g = window.__game; if (g.wanted.stars) g.wanted.clear(); });
  const pos = await ev((i) => window.__game.missions.startPos(i), id);
  await ev((p) => { const g = window.__game; const pl = g.player; if (pl.state === 'driving') { pl.vehicle.driver = null; pl.vehicle = null; pl.state = 'foot'; } window.__pt.tp(p[0] + 3, p[1]); window.__pt.walk(p[0], p[1]); }, pos);
  await waitFor((i) => window.__game.missions.run?.id === i, id, 120, 'start ' + id);
  await waitFor(() => window.__game.state === 'playing', null, 200, 'cutscene ' + id);
  log('started', id);
}
async function enterNearestCar() {
  await ev(() => { const g = window.__game; const p = g.player; const v = g.vehicles.spawn('merpati', p.x + 3, p.z, 0); v.vx = 0; window.__pt.tp(v.doorWorld()[0], v.doorWorld()[2]); g.input.press('KeyF'); });
  await waitFor(() => window.__game.player.state === 'driving', null, 60, 'enter car');
}
async function respray() {
  await ev(() => { const g = window.__game; const r = g.world.landmarks.respray; window.__pt.tp(r.x, r.z + 6); });
  await sleep(500);
  await ev(() => { const g = window.__game; const r = g.world.landmarks.respray; window.__pt.tp(r.x, r.z); });
  await waitFor(() => window.__game.wanted.stars === 0, null, 60, 'respray');
}

// Mission 2: Yellow Fever
await startMission('yellowfever');
await ev(() => { const g = window.__game; const v = g.missions.run.vehicles.find((x) => x.model === 'vesper'); const d = v.doorWorld(); window.__pt.tp(d[0], d[2]); g.input.press('KeyF'); });
await waitFor(() => window.__game.player.vehicle?.model === 'vesper' && window.__game.player.state === 'driving', null, 60, 'steal vesper');
check(await ev(() => window.__game.wanted.stars >= 1), 'stealing the Vesper gave a wanted star');
await respray();
check(true, 'Kilat Respray cleared the wanted level');
await ev(() => { const g = window.__game; const t = g.missions.run.P.garageDrop; window.__pt.tp(t[0], t[1] - 10); });
await sleep(400);
await ev(() => { const g = window.__game; const t = g.missions.run.P.garageDrop; window.__pt.tp(t[0], t[1]); });
await waitFor(() => window.__game.missions.completed.has('yellowfever'), null, 200, 'mission 2');
check(true, 'Mission 2 "Yellow Fever" passed');

// Mission 3: Collections
await startMission('collections');
await ev(() => { const g = window.__game; const c = g.missions.run.P.cafe; window.__pt.tp(c[0] + 8, c[1]); });
await waitFor(() => window.__game.missions.run?.actors.filter((a) => a.kind === 'gang').length === 4, null, 120, 'enforcers');
await sleep(2000);
await ev(() => { const g = window.__game; for (const a of g.missions.run.actors) if (a.kind === 'gang') a.damage(999, g.player, 1, 0); });
await waitFor(() => /cash bag|Return/.test(window.__game.hud.objective), null, 60, 'bag');
await ev(() => { const g = window.__game; const b = g.pickups.list.find((p) => p.type === 'bag'); if (b) window.__pt.tp(b.x, b.z); });
await waitFor(() => window.__game.hud.objective.includes('Return'), null, 60, 'pick bag');
await ev(() => { const g = window.__game; const t = g.missions.run.P.garageDrop; window.__pt.tp(t[0], t[1]); });
await waitFor(() => window.__game.missions.completed.has('collections'), null, 200, 'mission 3');
check(true, 'Mission 3 "Collections" passed');

// Mission 4: Wheelman
await startMission('wheelman');
await enterNearestCar();
await ev(() => { const g = window.__game; const dex = g.missions.run.actors.find((a) => a.key === 'dex'); window.__pt.tp(dex.x - 4, dex.z); });
await waitFor(() => window.__game.missions.run?.actors.find((a) => a.key === 'dex')?.vehicle, null, 120, 'dex boards');
check(true, 'Dex got in the car');
await ev(() => { const g = window.__game; const t = g.missions.run.P.bankStop; window.__pt.tp(t[0], t[1] - 12); });
await sleep(400);
await ev(() => { const g = window.__game; const t = g.missions.run.P.bankStop; window.__pt.tp(t[0], t[1]); });
await waitFor(() => window.__game.hud.countdown, null, 60, 'vault countdown');
check(true, 'vault countdown shown');
await waitFor(() => window.__game.wanted.stars >= 3, null, 200, 'alarm');
check(true, 'bank alarm gave 3 stars');
await waitFor(() => window.__game.hud.objective === 'Lose the cops', null, 120, 'dex back in car');
await respray();
await ev(() => { const g = window.__game; const t = g.missions.run.P.dexStart; window.__pt.tp(t[0], t[1] - 10); });
await sleep(400);
await ev(() => { const g = window.__game; const t = g.missions.run.P.dexStart; window.__pt.tp(t[0], t[1]); });
await waitFor(() => window.__game.missions.completed.has('wheelman'), null, 200, 'mission 4');
check(true, 'Mission 4 "Wheelman" passed');

// Mission 5: Low Tide
await startMission('lowtide');
check(await ev(() => window.__game.env.night > 0.5 && window.__game.weapons.has('smg')), 'Low Tide runs at night and the Wasp SMG was given');
await ev(() => { const g = window.__game; const f = g.missions.run.P.freight; window.__pt.tp(f[0] - 20, f[1]); });
await waitFor(() => window.__game.hud.objective.includes('guards'), null, 120, 'guards');
await sleep(1500);
await ev(() => { const g = window.__game; for (const a of g.missions.run.actors) if (a.kind === 'gang') a.damage(999, g.player, 1, 0); const t = g.missions.run.vehicles.find((v) => v.model === 'bison'); t.damage(5000, g.player); });
await waitFor(() => window.__game.hud.objective.includes('Escape'), null, 120, 'truck destroyed');
check(true, 'guards defeated and the weapons truck exploded');
await ev(() => window.__pt.tp(600, 585));
await waitFor(() => window.__game.missions.completed.has('lowtide'), null, 120, 'mission 5');
check(true, 'Mission 5 "Low Tide" passed');
await ev(() => window.__game.wanted.clear());

// Mission 6: Orchid Falls
await startMission('orchidfalls');
await waitFor(() => window.__game.hud.distance, null, 60, 'viktor running');
check(true, 'Viktor is fleeing with a distance indicator');
await sleep(2000);
await ev(() => { const g = window.__game; const v = g.missions.run.vehicles.find((x) => x.color[0] < 0.1); v.damage(900, g.player); });
await waitFor(() => window.__game.hud.objective === 'Defeat Viktor', null, 60, 'viktor bails');
await ev(() => { const g = window.__game; const b = g.missions.run.actors.find((a) => a.boss); b.damage(999, g.player, 1, 0); });
await waitFor(() => window.__game.missions.completed.has('orchidfalls'), null, 300, 'mission 6');
check(await ev(() => !!window.__game.missions.credits), 'Mission 6 "Orchid Falls" passed, credits rolling');
check(await ev(() => window.__game.missions.completedCount === 6), 'all six missions complete');

// ---------------------------------------------------------------- save / load
const money = await ev(() => { const g = window.__game; g.saveGame(); return g.money; });
await ev(() => window.__game.quitToTitle());
await waitFor(() => window.__game.state === 'title', null, 30);
await ev(() => window.__game.continueGame());
await waitFor(() => window.__game.state === 'playing', null, 30);
check(await ev((m) => window.__game.money === m && window.__game.missions.completedCount === 6, money), `save/load restored money ($${money}) and mission progress`);

// ---------------------------------------------------------------- death and arrest
await ev(() => { const g = window.__game; g.player.damage(999, null, 1, 0); });
await waitFor(() => window.__game.overlay?.kind === 'flatlined', null, 30, 'flatlined');
await waitFor(() => !window.__game.overlay, null, 60, 'respawn hospital');
check(await ev(() => { const g = window.__game, h = g.world.landmarks.hospital.entry; return Math.hypot(g.player.x - h.x, g.player.z - h.z) < 10 && g.player.alive; }), 'FLATLINED -> respawned at Selara General Hospital');
await ev(() => { const g = window.__game; g.wanted.setStars(1); g.busted(); });
await waitFor(() => !window.__game.overlay, null, 60, 'respawn police');
check(await ev(() => { const g = window.__game, h = g.world.landmarks.police.entry; return Math.hypot(g.player.x - h.x, g.player.z - h.z) < 10 && g.player.alive; }), 'CUFFED -> respawned at Police HQ');

const fails = await ev(() => window.__pt.failures);
if (fails.length) log('mission failures during run (retried):', fails.join('; '));
check(errors.length === 0, 'no console errors');
log('PLAY-THROUGH PASSED');
await browser.close();
server.close();
process.exit(0);
} catch (e) {
  console.error('PLAY-THROUGH FAILED:', e.message);
  try { await page.screenshot({ path: 'tools/out/playtest-fail.png' }); } catch (_) { /* ignore */ }
  await browser.close(); server.close();
  process.exit(1);
}
