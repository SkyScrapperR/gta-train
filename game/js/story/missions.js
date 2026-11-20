// The story: six missions written as generator scripts on top of a small mission runtime (objectives, GPS,
// blips, markers, cutscenes, spawned actors/vehicles, fail conditions, rewards, retry from the marker),
// plus side content (Orchid tags) and the end credits.
import { Dialogue, Shots } from './dialogue.js';
import { StoryActor } from './actors.js';
import { GangMember } from '../ai/combat-ai.js';
import { steerToward } from '../ai/traffic.js';
import { LOOKS } from '../entities/character-model.js';
import { EAST_PIER } from '../world/city.js';
import { groundHeight } from '../world/city-meshes.js';
import { theme } from '../ui/theme.js';

const ORDER = ['homecoming', 'yellowfever', 'collections', 'wheelman', 'lowtide', 'orchidfalls'];
const TITLES = { homecoming: 'Homecoming', yellowfever: 'Yellow Fever', collections: 'Collections', wheelman: 'Wheelman', lowtide: 'Low Tide', orchidfalls: 'Orchid Falls' };

// Places used by the scripts (derived from landmarks at runtime).
function places(game) {
  const L = game.world.landmarks;
  const g = L.garage.entry, d = L.dex.entry, b = L.bank.entry, c = L.cafe.entry, f = L.freight.entry;
  return {
    garageStart: [g.x - 6, g.z], garageDrop: [g.x + 3, g.z - 5], lin: [g.x + 1.1, g.z + 1.6], kaiAtGarage: [g.x - 0.9, g.z + 1.6],
    dexStart: [d.x, d.z - 3], dex: [d.x + 2, d.z + 2], bankStop: [b.x - 2.5, b.z], bankDoor: [b.x + 3, b.z],
    cafe: [c.x, c.z], freight: [f.x, f.z], vesper: [585, 272.6], rendy: [585, 278.5],
    towerExit: [495, 362.6], pierStart: [925, (EAST_PIER.z0 + EAST_PIER.z1) / 2], pierEnd: [EAST_PIER.x1 - 10, (EAST_PIER.z0 + EAST_PIER.z1) / 2],
  };
}

// Drives a vehicle along a list of points (Viktor's escape).
class RouteDriver {
  constructor(v, pts, speed) { this.v = v; this.pts = pts; this.i = 0; this.speed = speed; this.kind = 'mission'; this.controls = { throttle: 0, steer: 0 }; this.stuckT = 0; this.revT = 0; }
  get remaining() { let d = 0, px = this.v.x, pz = this.v.z; for (let i = this.i; i < this.pts.length; i++) { d += Math.hypot(this.pts[i][0] - px, this.pts[i][1] - pz); px = this.pts[i][0]; pz = this.pts[i][1]; } return d; }
  update(dt) {
    const v = this.v;
    while (this.i < this.pts.length - 1 && Math.hypot(this.pts[this.i][0] - v.x, this.pts[this.i][1] - v.z) < 10) this.i++;
    const t = this.pts[this.i];
    const near = Math.hypot(t[0] - v.x, t[1] - v.z);
    const sp = this.i >= this.pts.length - 1 ? Math.min(this.speed, near * 0.6) : this.speed;
    this.controls = steerToward(v, t[0], t[1], sp, false);
    if (v.speed < 1 && this.controls.throttle > 0.3) this.stuckT += dt; else this.stuckT = 0;
    if (this.stuckT > 1.5) { this.revT = 1; this.stuckT = 0; }
    if (this.revT > 0) { this.revT -= dt; this.controls = { throttle: -0.8, steer: -this.controls.steer }; }
  }
}

// ------------------------------------------------------------------ runtime for one mission attempt
class Run {
  constructor(sys, id) {
    this.sys = sys; this.g = sys.game; this.id = id;
    this.P = places(this.g);
    this.vehicles = []; this.actors = []; this.markers = []; this.blipList = []; this.pickups = [];
    this.fails = []; this.waiter = null; this.done = false;
    this.gen = SCRIPTS[id](this);
  }
  // ---- waiters
  wait(s) { let t = 0; return { tick: (dt) => (t += dt) >= s }; }
  until(fn) { return { tick: () => fn() }; }
  cutscene(lines, opts = {}) {
    const g = this.g;
    let fin = false;
    g.state = 'cutscene'; g.controlsLocked = true; g.input.exitLock?.();
    if (opts.setup) opts.setup();
    this.sys.dialogue.play(lines, () => { fin = true; });
    if (opts.music) g.audio.music?.play(opts.music);
    return { tick: () => { if (!fin) return false; g.state = 'playing'; g.controlsLocked = false; g.rig.shot = null; g.rig.snap = true; g.input.requestLock?.(); if (opts.music) g.audio.music?.play(null); return true; } };
  }
  say(lines) { this.sys.dialogue.play(lines, null); }
  // ---- helpers
  obj(textStr, target = null, color = theme.gold) { this.g.hud.objective = textStr; this.g.gps.setObjective(target, color); }
  blip(get, icon = 'target', color = '#ff4d5e') { const b = { get, icon, color }; this.blipList.push(b); return b; }
  unblip(b) { this.blipList = this.blipList.filter((x) => x !== b); }
  marker(x, z, opts = {}) { const m = this.g.markers.add({ x, z, color: opts.color || '#ffd166', radius: opts.radius || 3, needCar: opts.needCar, needFoot: opts.needFoot }); this.markers.push(m); return m; }
  unmarker(m) { this.g.markers.remove(m); this.markers = this.markers.filter((x) => x !== m); }
  vehicle(model, x, z, yaw, color) { const v = this.g.vehicles.spawn(model, x, z, yaw, color); v.keep = true; v.missionCar = true; this.vehicles.push(v); return v; }
  actor(key, x, z, yaw = 0) { const a = new StoryActor(this.g, key, x, z, yaw); this.g.characters.push(a); this.actors.push(a); return a; }
  gang(x, z, opts = {}) { const m = new GangMember(this.g, x, z, opts); this.g.characters.push(m); this.actors.push(m); return m; }
  failIf(fn, reason) { this.fails.push({ fn, reason }); }
  clearFails() { this.fails = []; }
  near(pos, r, { car = null, inCar = false } = {}) {
    const p = this.g.player;
    const v = p.state === 'driving' ? p.vehicle : null;
    if (inCar && !v) return false;
    if (car && v !== car) return false;
    const e = v || p;
    return Math.hypot(e.x - pos[0], e.z - pos[1]) < r;
  }
  placePlayer(x, z, yaw) { const p = this.g.player; if (p.state === 'driving') return; p.x = x; p.z = z; p.y = groundHeight(x, z); p.yaw = yaw; p.vx = p.vz = 0; }
  update(dt) {
    if (this.done) return;
    for (const f of this.fails) if (f.fn()) { this.sys.fail(f.reason); return; }
    if (this.waiter && !this.waiter.tick(dt)) return;
    const r = this.gen.next();
    if (r.done) { this.done = true; return; }
    this.waiter = r.value;
  }
  cleanup(keepEntities = false) {
    const g = this.g;
    for (const m of this.markers) g.markers.remove(m);
    for (const a of this.actors) { if (a.vehicle) { const v = a.vehicle; if (v.driver === a) v.driver = null; v.passengers = v.passengers.filter((x) => x !== a); } g.removeCharacter(a); }
    for (const v of this.vehicles) { v.keep = false; v.missionCar = false; if (!keepEntities && g.player.vehicle !== v) g.vehicles.remove(v); }
    for (const p of this.pickups) { const i = g.pickups.list.indexOf(p); if (i >= 0) g.pickups.list.splice(i, 1); }
    g.hud.objective = ''; g.hud.countdown = null; g.hud.distance = null;
    g.gps.setObjective(null);
    if (g.state === 'cutscene') { g.state = 'playing'; g.controlsLocked = false; g.rig.shot = null; }
  }
}

// ------------------------------------------------------------------ the six missions
const SCRIPTS = {
  *homecoming(m) {
    const g = m.g, P = m.P, p = g.player;
    const car = m.vehicle('merpati', 438, 897.4, Math.PI / 2, [0.55, 0.12, 0.12]);
    car.missionCar = false;
    m.placePlayer(446, 1000, Math.PI);
    yield m.cutscene([
      { who: 'kai', text: 'Five years. The bay still smells like salt and gasoline.', shot: Shots.orbit([495, 0, 330], 240, 110, 2.6, 3.5, 6, { target: [495, 60, 330], fov: 50 }) },
      { who: 'kai', text: 'Mama Lin says the city changed. Says a man named Viktor Raza owns the coast now.', shot: Shots.dolly([470, 30, 1080], [452, 6, 1015], [446, 2, 960], [446, 4, 900], 6.5, 48) },
      { who: 'lin', text: "Kai! You're late. There's a Merpati waiting by the pier. Keys are in it. Come straight to the garage.", shot: Shots.ots([446, 0.6, 1000], [446, 2, 950], 6, 1, 45) },
      { who: 'kai', text: 'On my way, Auntie.', shot: Shots.orbit([446, 0.6, 1000], 4, 1.2, 0.4, -0.2, 3, { target: [446, 2.2, 1000], fov: 40 }) },
    ], { music: 'cutLin' });
    m.obj('Get in the Merpati', [car.x, car.z]);
    const b = m.blip(() => [car.x, car.z], 'car', theme.blue);
    m.failIf(() => car.destroyed && p.vehicle !== car, 'The Merpati was destroyed.');
    yield m.until(() => p.state === 'driving');
    m.unblip(b); m.clearFails();
    m.obj("Drive to Lin's Garage", P.garageDrop);
    const mk = m.marker(P.garageDrop[0], P.garageDrop[1], { needCar: true, radius: 4 });
    yield m.until(() => mk.inside);
    yield* garageArrive(m);
    const lin = m.actor('lin', P.lin[0], P.lin[1], Math.PI);
    yield m.cutscene([
      { who: 'lin', text: 'Look at you. Taller. Thinner. Did they feed you on that boat?', actor: lin, shot: Shots.two(p, lin, 4.5, -1) },
      { who: 'kai', text: 'Instant noodles and regret, mostly.', shot: Shots.ots(p, lin, 3.2, 1) },
      { who: 'lin', text: "The Black Orchid took half the shops on this street. Viktor's people collect every Friday.", actor: lin, shot: Shots.ots(lin, p, 5, -1) },
      { who: 'lin', text: "I won't pay forever. Now that you're home... maybe I don't have to.", actor: lin, shot: Shots.two(p, lin, 4.5, -1, 3.4) },
      { who: 'kai', text: 'I came back to fix cars, not start a war.', shot: Shots.ots(p, lin, 3.2, 1) },
      { who: 'lin', text: 'In this city that is the same job. Your old room in Bukit Asri is ready. Go rest.', actor: lin, shot: Shots.orbit(lin, 5, 1.6, 0.6, -0.4, 5, { target: [lin.x, lin.y + 1.5, lin.z] }) },
    ], { setup: () => stage(m, lin), music: 'cutLin' });
    g.missions.safehouseUnlocked = true; g.markers.save.enabled = true;
    return m.sys.pass(200, 'Safehouse unlocked in Bukit Asri');
  },

  *yellowfever(m) {
    const g = m.g, P = m.P, p = g.player;
    const lin = m.actor('lin', P.lin[0], P.lin[1], Math.PI);
    yield m.cutscene([
      { who: 'lin', text: "Viktor's nephew Rendy parks a yellow Vesper GT downtown every evening. Like he owns the sun.", actor: lin, shot: Shots.two(p, lin, 5, -1) },
      { who: 'kai', text: 'Let me guess. You want it.', shot: Shots.ots(p, lin, 3, 1) },
      { who: 'lin', text: 'I want Viktor to know the Santosos are back. Bring it here in one piece. Mostly one piece.', actor: lin, shot: Shots.ots(lin, p, 5, -1) },
    ], { setup: () => stage(m, lin), music: 'cutLin' });
    const vesper = m.vehicle('vesper', P.vesper[0], P.vesper[1], -Math.PI / 2, [0.95, 0.8, 0.1]);
    const rendy = m.actor('rendy', P.rendy[0], P.rendy[1], 0);
    rendy.mode = 'phone'; rendy.invulnerable = false;
    m.obj("Steal Rendy's Vesper GT", [vesper.x, vesper.z]);
    const b = m.blip(() => [vesper.x, vesper.z], 'car', theme.blue);
    m.failIf(() => vesper.destroyed, 'The Vesper GT was destroyed.');
    yield m.until(() => p.vehicle === vesper && p.state === 'driving');
    m.unblip(b);
    g.wanted.setStars(Math.max(1, g.wanted.stars));
    m.say([{ who: 'rendy', text: "Hey! That's my car! My uncle is going to hear about this!" }]);
    rendy.mode = 'idle'; rendy.walkTo(rendy.x + 30, rendy.z + 4, true);
    const mk = m.marker(P.garageDrop[0], P.garageDrop[1], { needCar: true, radius: 4 });
    m.obj("Deliver the Vesper to Lin's Garage", P.garageDrop);
    for (;;) {
      yield m.until(() => mk.inside && p.vehicle === vesper);
      if (g.wanted.stars === 0) break;
      m.obj('Lose the cops before going to the garage');
      yield m.until(() => g.wanted.stars === 0);
      m.obj("Deliver the Vesper to Lin's Garage", P.garageDrop);
    }
    m.clearFails();
    if (vesper.health < 250) return m.sys.fail('The Vesper is wrecked. Lin wanted it at 25% or better.');
    yield* garageArrive(m);
    yield m.cutscene([
      { who: 'lin', text: 'Not a scratch. Well. A few scratches. I can sell scratches.', actor: lin, shot: Shots.two(p, lin, 4.5, -1) },
      { who: 'lin', text: "Your father's old Kobra 9 is waiting at the safehouse. Use it wisely.", actor: lin, shot: Shots.ots(lin, p, 4.5, -1) },
    ], { setup: () => stage(m, lin), music: 'cutLin' });
    const sh = g.world.landmarks.safehouse.entry;
    g.pickups.add('pistol', sh.x - 1.5, sh.z + 2, { amount: 48, respawn: 0 });
    return m.sys.pass(500, 'A Kobra 9 is waiting at the safehouse');
  },

  *collections(m) {
    const g = m.g, P = m.P, p = g.player;
    const lin = m.actor('lin', P.lin[0], P.lin[1], Math.PI);
    yield m.cutscene([
      { who: 'lin', text: 'Kedai Orchid. Good coffee, terrible landlord. Viktor sends enforcers there tonight.', actor: lin, shot: Shots.two(p, lin, 5, -1) },
      { who: 'kai', text: 'How many?', shot: Shots.ots(p, lin, 2.5, 1) },
      { who: 'lin', text: 'Four. Bring back what they took from the owner. And come back breathing.', actor: lin, shot: Shots.ots(lin, p, 4.5, -1) },
    ], { setup: () => stage(m, lin), music: 'cutLin' });
    m.obj('Go to Kedai Orchid', P.cafe);
    const cafe = m.blip(() => P.cafe, 'cup', '#ff7ad9');
    yield m.until(() => m.near(P.cafe, 55));
    m.unblip(cafe);
    const spots = [[P.cafe[0] - 1, P.cafe[1] - 12], [P.cafe[0] - 2, P.cafe[1] + 10], [P.cafe[0] - 8, P.cafe[1] + 24], [P.cafe[0] + 1, P.cafe[1] - 24]];
    const goons = spots.map(([x, z]) => m.gang(x, z, { weapon: 'pistol', accuracy: 0.28, damage: 6, alertRange: 32 }));
    goons.forEach((gm) => m.blip(() => (gm.alive ? [gm.x, gm.z] : null), 'dot', '#ff4d5e'));
    m.say([{ who: 'goon', text: 'Wrong café, friend. This one belongs to the Orchid.' }]);
    yield m.wait(1.5);
    goons.forEach((gm) => (gm.alert = true));
    for (;;) {
      const left = goons.filter((x) => x.alive).length;
      m.obj(`Defeat the Orchid enforcers (${4 - left}/4)`);
      if (!left) break;
      yield m.wait(0.3);
    }
    m.blipList = [];
    const bag = g.pickups.add('bag', P.cafe[0] - 3, P.cafe[1], { respawn: 0 });
    m.pickups.push(bag);
    let got = false; bag.onPick = () => { got = true; };
    m.obj('Pick up the cash bag', [bag.x, bag.z]);
    m.blip(() => (got ? null : [bag.x, bag.z]), 'target', theme.green);
    yield m.until(() => got);
    m.blipList = [];
    m.obj("Return the cash to Lin's Garage", P.garageDrop);
    const mk = m.marker(P.garageDrop[0], P.garageDrop[1], { radius: 4 });
    yield m.until(() => mk.inside);
    yield* garageArrive(m);
    yield m.cutscene([
      { who: 'lin', text: 'Every rupiah. The owner will cry. Then she will make you free coffee forever.', actor: lin, shot: Shots.two(p, lin, 5, -1) },
      { who: 'kai', text: 'Viktor will notice.', shot: Shots.ots(p, lin, 2.5, 1) },
      { who: 'lin', text: 'Good. Let him.', actor: lin, shot: Shots.ots(lin, p, 3, -1) },
    ], { setup: () => stage(m, lin), music: 'cutLin' });
    return m.sys.pass(800);
  },

  *wheelman(m) {
    const g = m.g, P = m.P, p = g.player;
    const dex = m.actor('dex', P.dex[0], P.dex[1], -Math.PI / 2);
    dex.invulnerable = false; dex.health = dex.maxHealth = 150;
    yield m.cutscene([
      { who: 'dex', text: 'Kai Santoso! Five years and you still dress like a parking attendant.', actor: dex, shot: Shots.two(p, dex, 5, -1) },
      { who: 'kai', text: 'Good to see you too, Dex.', shot: Shots.ots(p, dex, 2.6, 1) },
      { who: 'dex', text: "Bank Samudra keeps Viktor's ledgers in the vault. Prove the Orchid launders through it and the whole coast flips.", actor: dex, shot: Shots.ots(dex, p, 6, -1) },
      { who: 'dex', text: 'I crack, you drive. Get us a car.', actor: dex, shot: Shots.orbit(dex, 4.5, 1.6, -0.6, 0.4, 3.5, { target: [dex.x, dex.y + 1.5, dex.z] }) },
    ], { setup: () => { m.placePlayer(P.dex[0] - 3, P.dex[1], Math.PI / 2); dex.faceTarget = p; } });
    m.failIf(() => !dex.alive, 'Dex is dead.');
    m.failIf(() => dex.vehicle && dex.vehicle.destroyed, 'The car exploded with Dex inside.');
    if (p.state !== 'driving') { m.obj('Get a car'); yield m.until(() => p.state === 'driving'); }
    m.obj('Pick up Dex', P.dex);
    const db = m.blip(() => [dex.x, dex.z], 'person', '#9aa7ff');
    for (;;) {
      yield m.until(() => p.state === 'driving' && m.near([dex.x, dex.z], 9) && p.vehicle.speed < 2.5);
      const car = p.vehicle;
      const door = car.doorWorld(1);
      dex.walkTo(door[0], door[2], true, () => { if (p.vehicle === car) { dex.vehicle = car; car.passengers.push(dex); g.audio.play('door', car.pos, 0.6); } });
      yield m.until(() => dex.vehicle || !dex.goal || p.vehicle !== car);
      if (dex.vehicle) break;
    }
    m.unblip(db);
    const car = dex.vehicle;
    m.failIf(() => p.state !== 'driving' && Math.hypot(p.x - car.x, p.z - car.z) > 60, 'You abandoned Dex.');
    m.say([{ who: 'dex', text: 'Bank Samudra. Park by the side door. Try not to look like a getaway driver.' }]);
    const stop = m.marker(P.bankStop[0], P.bankStop[1], { needCar: true, radius: 4, color: '#7fe3d6' });
    m.obj('Drive to Bank Samudra', P.bankStop);
    yield m.until(() => stop.inside && p.vehicle === car);
    m.unmarker(stop);
    // Dex goes in; countdown while the player waits nearby
    car.passengers = car.passengers.filter((x) => x !== dex); dex.vehicle = null;
    const d1 = car.doorWorld(1); dex.x = d1[0]; dex.z = d1[2];
    dex.walkTo(P.bankDoor[0], P.bankDoor[1], true, () => { dex.visible = false; });
    m.say([{ who: 'dex', text: "Fifteen seconds. Keep the engine warm." }]);
    let t = 15;
    while (t > 0) {
      g.hud.countdown = { label: 'Dex is cracking the vault', value: `0:${String(Math.ceil(t)).padStart(2, '0')}` };
      yield m.wait(0.1); t -= 0.1;
      if (!m.near(P.bankStop, 40, { car })) { g.hud.objective = 'Get back to the bank!'; } else m.obj('Wait for Dex');
    }
    g.hud.countdown = null;
    yield m.until(() => m.near(P.bankStop, 25, { car }));
    dex.visible = true; dex.x = P.bankDoor[0]; dex.z = P.bankDoor[1];
    g.wanted.setStars(3);
    g.audio.play('copShout', [dex.x, 2, dex.z], 1);
    m.say([{ who: 'dex', text: 'ALARM! Go, go, go! I have the ledgers!' }]);
    const d2 = car.doorWorld(1);
    dex.walkTo(d2[0], d2[2], true, () => { dex.vehicle = car; car.passengers.push(dex); });
    yield m.until(() => dex.vehicle === car);
    m.obj('Lose the cops');
    yield m.until(() => g.wanted.stars === 0);
    m.say([{ who: 'dex', text: "We're clear. Get me home before my heart gives out." }]);
    const home = m.marker(P.dexStart[0], P.dexStart[1], { needCar: true, radius: 5, color: '#9aa7ff' });
    m.obj("Drop Dex at his apartment", P.dexStart);
    yield m.until(() => home.inside && dex.vehicle);
    m.clearFails();
    car.passengers = car.passengers.filter((x) => x !== dex); dex.vehicle = null;
    const d3 = car.doorWorld(1); dex.x = d3[0]; dex.z = d3[2];
    m.say([{ who: 'dex', text: "Ledgers are mine. Viktor's going to feel this one in his teeth." }]);
    dex.walkTo(P.dex[0], P.dex[1]);
    yield m.wait(2.5);
    return m.sys.pass(2000);
  },

  *lowtide(m) {
    const g = m.g, P = m.P, p = g.player;
    const lin = m.actor('lin', P.lin[0], P.lin[1], Math.PI);
    g.clock = 22.2;
    yield m.cutscene([
      { who: 'lin', text: 'Night shift. Orchid Freight is moving guns tonight. A Bison truck full of them.', actor: lin, shot: Shots.two(p, lin, 5, -1) },
      { who: 'lin', text: 'I left something in the workshop for you.', actor: lin, shot: Shots.ots(lin, p, 3, -1) },
      { who: 'kai', text: 'A Wasp? Auntie...', shot: Shots.ots(p, lin, 2.5, 1) },
      { who: 'lin', text: 'Your uncle had hobbies. Burn that truck, then get out of the docks.', actor: lin, shot: Shots.orbit(lin, 5, 1.6, -0.5, 0.5, 4.5, { target: [lin.x, lin.y + 1.5, lin.z] }) },
    ], { setup: () => stage(m, lin), music: 'cutLin' });
    g.weapons.give('smg', 150); g.weapons.select('smg');
    m.obj('Go to Orchid Freight', P.freight);
    const fb = m.blip(() => P.freight, 'crate', '#d77bff');
    const Y = g.world.landmarks.freight.yard, yard = [Y.x, Y.z];
    const truck = m.vehicle('bison', yard[0] + 17.5, yard[1] + 19, Math.PI / 2, [0.35, 0.12, 0.45]);
    truck.damageMult = 4;
    const guardSpots = [[yard[0] - 4, yard[1] - 15], [yard[0] - 4, yard[1] + 15], [yard[0] + 9, yard[1] + 21], [yard[0] + 33, yard[1] + 19], [yard[0] - 10, yard[1] + 5], [yard[0] + 48, yard[1] + 21]];
    const guards = guardSpots.map(([x, z], i) => m.gang(x, z, { weapon: i % 2 ? 'smg' : 'pistol', accuracy: 0.3, damage: 7, alertRange: 35 }));
    yield m.until(() => m.near(P.freight, 70));
    m.unblip(fb);
    guards.forEach((gm) => m.blip(() => (gm.alive ? [gm.x, gm.z] : null), 'dot', '#ff4d5e'));
    m.blip(() => (truck.destroyed ? null : [truck.x, truck.z]), 'target', '#ff4d5e');
    m.say([{ who: 'goon', text: 'Lights! Someone is in the yard!' }]);
    for (;;) {
      const left = guards.filter((x) => x.alive).length;
      m.obj(`Defeat the guards (${6 - left}/6) and destroy the Bison truck${truck.destroyed ? ' ✓' : ''}`);
      if (!left && truck.destroyed) break;
      yield m.wait(0.3);
    }
    m.blipList = [];
    if (g.wanted.stars < 2) g.wanted.setStars(2);
    m.obj('Escape the docks');
    yield m.until(() => { const e = p.state === 'driving' ? p.vehicle : p; return e.x < 700; });
    return m.sys.pass(3000);
  },

  *orchidfalls(m) {
    const g = m.g, P = m.P, p = g.player;
    const lin = m.actor('lin', P.lin[0], P.lin[1], Math.PI);
    const dex = m.actor('dex', P.lin[0] + 1.6, P.lin[1] + 0.9, -Math.PI / 2);
    yield m.cutscene([
      { who: 'dex', text: "The ledgers went public an hour ago. Every newsroom on the coast has them. Viktor is running.", actor: dex, shot: Shots.two(p, dex, 5.5, -1) },
      { who: 'lin', text: 'He has a boat waiting at the east pier. Once he is on the water, he is gone.', actor: lin, shot: Shots.ots(lin, p, 4.5, -1) },
      { who: 'kai', text: "Then he doesn't reach the water.", shot: Shots.ots(p, lin, 3, 1) },
      { who: 'dex', text: "Take the Vesper. Rendy won't be needing it.", actor: dex, shot: Shots.orbit(dex, 5, 1.6, 0.4, -0.4, 3.5, { target: [dex.x, dex.y + 1.5, dex.z] }) },
    ], { setup: () => { stage(m, lin); dex.faceTarget = p; }, music: 'cutViktor' });
    const myCar = m.vehicle('vesper', P.garageDrop[0] - 4, P.garageDrop[1] - 1.5, Math.PI / 2, [0.95, 0.8, 0.1]);
    myCar.missionCar = false;
    // Viktor's escape run
    const vcar = m.vehicle('vesper', P.towerExit[0], P.towerExit[1], Math.PI / 2, [0.06, 0.06, 0.07]);
    vcar.damageMult = 2.2;
    const viktor = m.actor('viktor', vcar.x, vcar.z, 0);
    viktor.vehicle = vcar; vcar.driver = viktor;
    const route = g.world.roads.routePoints(vcar.x, vcar.z, 900, 500).slice(1);
    route.push(P.pierStart, P.pierEnd);
    vcar.ai = new RouteDriver(vcar, route, 17);
    const total = vcar.ai.remaining;
    const vb = m.blip(() => [vcar.x, vcar.z], 'target', '#d77bff');
    m.blip(() => [EAST_PIER.x1 - 8, EAST_PIER.z1 + 8], 'boat', '#d77bff');
    m.obj("Wreck Viktor's car before he reaches the boat", null);
    m.failIf(() => vcar.ai && vcar.ai.remaining < 6, 'Viktor reached his boat.');
    m.say([{ who: 'viktor', text: "Santoso. Your aunt should have kept paying. Now I'll take the whole bay with me." }]);
    yield m.until(() => {
      g.hud.distance = { label: 'Viktor to the boat', frac: vcar.ai.remaining / total };
      g.gps.setObjective([vcar.x, vcar.z], '#d77bff');
      if (vcar.driver !== viktor || !viktor.vehicle) return true; // carjacked
      return vcar.health < 320 || vcar.destroyed;
    });
    m.clearFails(); m.unblip(vb);
    g.hud.distance = null;
    vcar.ai = null;
    // Viktor bails out and makes his stand on the pier
    const door = viktor.vehicle ? vcar.doorWorld(0) : [viktor.x, 0, viktor.z];
    if (vcar.driver === viktor) vcar.driver = null;
    viktor.vehicle = null;
    g.removeCharacter(viktor); m.actors = m.actors.filter((a) => a !== viktor);
    const boss = m.gang(door[0], door[2], { look: LOOKS.viktor, weapon: 'smg', health: 200, accuracy: 0.42, damage: 8, boss: true, alert: true });
    boss.fleeTo = P.pierEnd[0] > boss.x ? [Math.min(P.pierEnd[0], boss.x + 60), P.pierEnd[1]] : null;
    m.say([{ who: 'viktor', text: 'You think a mechanic\'s boy can stop me? Come and try!' }]);
    m.blip(() => (boss.alive ? [boss.x, boss.z] : null), 'target', '#d77bff');
    m.obj('Defeat Viktor');
    yield m.until(() => { g.hud.distance = { label: 'VIKTOR RAZA', frac: Math.max(0, boss.health) / boss.maxHealth }; return !boss.alive; });
    g.hud.distance = null;
    g.wanted.clear();
    g.slowMo(0.25, 2.5);
    yield m.wait(2.5);
    // finale at sunrise on the pier
    g.clock = 5.9;
    const fx = (EAST_PIER.x0 + EAST_PIER.x1) / 2 - 20, fz = (EAST_PIER.z0 + EAST_PIER.z1) / 2;
    const lin2 = m.actor('lin', fx + 3, fz + 1.5, -Math.PI / 2), dex2 = m.actor('dex', fx + 3.5, fz - 1.8, -Math.PI / 2);
    yield m.cutscene([
      { who: 'kai', text: "It's over. The Orchid wilts at sunrise.", shot: Shots.orbit([fx, 0.65, fz], 9, 2.4, -1.2, -0.3, 5, { target: [fx + 1.5, 2.0, fz], fov: 45 }) },
      { who: 'lin', text: 'The sun still comes up over the bay. Even after a night like that.', actor: lin2, shot: Shots.two(p, lin2, 5, 1) },
      { who: 'dex', text: 'Black Orchid is finished. Police are raiding their warehouses as we speak.', actor: dex2, shot: Shots.ots(dex2, p, 5, -1) },
      { who: 'kai', text: "Then let's open the garage. Properly this time.", shot: Shots.ots(p, lin2, 3.5, 1) },
      { who: 'lin', text: 'Breakfast first. You are still too thin.', actor: lin2, shot: Shots.dolly([fx - 6, 3, fz + 8], [fx - 30, 14, fz + 30], [fx + 2, 1.5, fz], [fx + 60, 6, fz - 20], 7, 50) },
    ], { setup: () => { m.placePlayer(fx, fz, Math.PI / 2); lin2.faceTarget = p; dex2.faceTarget = p; }, music: 'cutLin' });
    m.sys.pass(10000, 'Selara Bay is free');
    g.missions.showCredits();
  },
};

// Put Kai in front of Mama Lin at the garage for a cutscene.
function stage(m, lin) {
  const P = m.P, p = m.g.player;
  if (p.state === 'driving' && p.vehicle) { const v = p.vehicle; v.vx = v.vz = 0; v.driver = null; p.vehicle = null; p.state = 'foot'; }
  m.placePlayer(P.kaiAtGarage[0], P.kaiAtGarage[1], Math.atan2(lin.x - P.kaiAtGarage[0], lin.z - P.kaiAtGarage[1]));
  lin.faceTarget = p;
}
function* garageArrive(m) {
  const p = m.g.player;
  if (p.state === 'driving') { const v = p.vehicle; yield m.until(() => v.speed < 1.5 || (v.vx = v.vx * 0.9, v.vz = v.vz * 0.9, false)); }
}

// ------------------------------------------------------------------ mission system
export class MissionSystem {
  constructor(game) {
    this.game = game;
    this.dialogue = new Dialogue(game);
    this.completed = new Set();
    this.run = null;
    this.startMarker = null;
    this.safehouseUnlocked = false;
    this.credits = null;
    this.order = ORDER;
  }
  get completedCount() { return this.completed.size; }
  get shotTime() { return this.dialogue.shotT || 0; }
  get active() { return !!this.run; }
  nextId() { return ORDER.find((id) => !this.completed.has(id)) || null; }
  reset() { this.abort(); this.completed.clear(); this.safehouseUnlocked = false; this.game.markers.save.enabled = false; this.refreshMarker(); }
  serialize() { return { completed: [...this.completed], safehouse: this.safehouseUnlocked }; }
  load(d) {
    this.abort();
    this.completed = new Set(d?.completed || []);
    this.safehouseUnlocked = !!d?.safehouse || this.completed.size > 0;
    this.game.markers.save.enabled = this.safehouseUnlocked;
    this.game.stats.missions = this.completed.size;
    this.refreshMarker();
  }
  startPos(id) {
    const P = places(this.game);
    return id === 'wheelman' ? P.dexStart : id === 'homecoming' ? [446, 1000] : P.garageStart;
  }
  refreshMarker() {
    if (this.startMarker) { this.game.markers.remove(this.startMarker); this.startMarker = null; }
    const id = this.nextId();
    if (!id || this.run || id === 'homecoming' && this.game.state === 'title') return;
    const [x, z] = this.startPos(id);
    this.startMarker = this.game.markers.add({ x, z, color: '#ffd166', radius: 1.8, needFoot: true, label: TITLES[id], onEnter: () => this.start(id) });
  }
  start(id) {
    if (this.run) return;
    const g = this.game;
    if (g.wanted.stars > 0) { g.hud.tip('Lose your wanted level first.', 3); return; }
    if (this.startMarker) { g.markers.remove(this.startMarker); this.startMarker = null; }
    this.run = new Run(this, id);
    g.hud.bannerShow(TITLES[id].toUpperCase(), '', theme.teal, 2.5, 1);
  }
  pass(reward, sub = '') {
    const g = this.game, id = this.run.id;
    this.run.cleanup(true);
    this.run = null;
    this.completed.add(id);
    g.stats.missions = this.completed.size;
    g.addMoney(reward);
    g.hud.bannerShow('MISSION PASSED', `${TITLES[id]}  +$${reward.toLocaleString('en-US')}${sub ? '  ·  ' + sub : ''}`, theme.gold, 5, 3);
    g.audio.music?.stinger('passed') ?? g.audio.play('passed');
    this.refreshMarker();
    g.saveGame(true);
    g.events.emit('missionPassed', id);
  }
  fail(reason) {
    const g = this.game;
    if (!this.run) return;
    const id = this.run.id;
    this.run.cleanup(false);
    this.run = null;
    this.dialogue.queue = []; this.dialogue.cur = null; g.hud.subtitle = null;
    g.hud.bannerShow('MISSION FAILED', reason, theme.red, 4.5, 3);
    g.audio.music?.stinger('failed') ?? g.audio.play('failed');
    this.refreshMarker();
    g.events.emit('missionFailed', id);
  }
  abort() { if (this.run) { this.run.cleanup(false); this.run = null; } this.dialogue.queue = []; this.dialogue.cur = null; this.credits = null; this.refreshMarker(); }
  onPlayerDown(kind) { if (this.run) this.fail(kind === 'flatlined' ? 'You were flatlined.' : 'You were cuffed.'); }
  skipLine() { this.dialogue.skip(); }
  update(dt) {
    this.dialogue.update(dt);
    if (this.run) this.run.update(dt);
    this.updateTags();
    if (this.credits) { this.credits.t += dt; if (this.credits.t > 26) this.credits = null; }
  }
  updateActors(dt) {
    if (!this.run) return;
    for (const a of this.run.actors) if (a.think) a.think(dt);
    for (const v of this.run.vehicles) if (v.ai && v.ai.kind === 'mission' && v.driver) v.ai.update(dt);
  }
  updateTags() {
    const g = this.game, p = g.player;
    if (g.state !== 'playing' || !p.alive) return;
    for (const t of g.world.props.tagList) {
      if (t.collected || Math.abs(t.x - p.x) > 2.5 || Math.abs(t.z - p.z) > 2.5) continue;
      t.collected = true;
      g.stats.tags = g.world.props.tagList.filter((x) => x.collected).length;
      g.addMoney(100);
      g.audio.play('tag', null, 0.7);
      g.hud.toast(`Orchid tag ${g.stats.tags}/12  +$100`, '#d77bff', 3.5);
      if (g.stats.tags === 12) { g.addMoney(5000); g.hud.bannerShow('ALL TAGS FOUND', '+$5,000', '#d77bff', 4, 2); }
    }
  }
  blips() {
    const out = [];
    if (this.startMarker) out.push({ x: this.startMarker.x, z: this.startMarker.z, icon: 'mission', color: theme.gold });
    if (this.run) for (const b of this.run.blipList) { const p = b.get(); if (p) out.push({ x: p[0], z: p[1], icon: b.icon, color: b.color, size: b.icon === 'dot' ? 5 : 9 }); }
    return out;
  }
  showCredits() { this.credits = { t: 0 }; this.game.audio.music?.play('credits'); }
}
