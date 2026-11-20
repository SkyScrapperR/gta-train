// Debug hook for capturing the README screenshots: ?shot=N sets up a live scene, lets the simulation run
// (traffic, particles, lighting) and then flags window.__shotReady. All captures are real renders.
import { groundHeight } from './world/city-meshes.js';
import { Shots } from './story/dialogue.js';
import { wrapAngle } from './core/math.js';

const wait = (game, seconds) => new Promise((resolve) => {
  const start = game.simTime;
  const tick = () => { if (game.simTime - start >= seconds) resolve(); else requestAnimationFrame(tick); };
  tick();
});

const run0 = (g) => g.missions.run;

export async function setupShot(game, n) {
  const g = game, p = g.player;
  g.noAutoPause = true;
  g.simSpeed = 8;
  if (n === 1) {
    // Title: dusk, low between the downtown towers looking up at Orchid Tower.
    g.enterTitle();
    g.titleShots = [{ p0: [448, 4.5, 648], p1: [448.4, 4.7, 642], l0: [488, 72, 392], l1: [488, 73, 392] }];
    await wait(g, 4);
  } else if (n === 2) {
    // Night chase in the rain: Vesper GT, 4 stars, police behind, helicopter spotlight.
    g.newGame(true);
    g.clock = 22.4; g.forcedRain = 0.85; g.rain = 0.85;
    g.missions.completed.add('homecoming');
    const car = g.vehicles.spawn('vesper', 537.6, 430, Math.PI, [0.95, 0.8, 0.1]);
    p.state = 'driving'; p.vehicle = car; car.driver = p; p.visible = true;
    g.onPlayerEnteredVehicle(car);
    g.cheatNoArrest = true;
    p.invulnerable = true; p.damage = () => false;
    car.invulnerable = true;
    g.wanted.setStars(4);
    for (let i = 0; i < 3; i++) {
      const v = g.police.spawnChaser();
      if (v) { v.x = 540 + (i - 1) * 3.2; v.z = 448 + i * 9; v.yaw = Math.PI; v.vx = 0; v.vz = -14; }
    }
    g.helicopter.spawn(); g.helicopter.x = 545; g.helicopter.z = 405; g.helicopter.y = 40;
    g.autopilot = { controls: (v) => ({ throttle: v.forwardSpeed < 17 ? 1 : 0.2, steer: Math.max(-1, Math.min(1, (v.x - 537.6) * 0.25 + wrapAngle(v.yaw - Math.PI) * 2)), handbrake: false }) };
    car.vz = -15;
    g.rig.snap = true;
    await wait(g, 2.5);
    // compose: police pack right behind the Vesper, helicopter overhead lighting it, camera looking back
    const f = car.fwd, r = car.right;
    const cops = g.vehicles.list.filter((v) => v.isPolice);
    cops.slice(0, 3).forEach((v, i) => {
      const back = 10 + i * 8, side = [-1.6, 1.8, -0.4][i];
      v.x = car.x - f[0] * back + r[0] * side; v.z = car.z - f[1] * back + r[1] * side; v.yaw = car.yaw + (i - 1) * 0.08;
      v.vx = car.vx; v.vz = car.vz; v.siren = true; v.sirenPhase = i * 0.37;
    });
    for (const v of cops.slice(3)) g.vehicles.remove(v);
    const h = g.helicopter;
    h.x = car.x - f[0] * 16 + r[0] * 6; h.z = car.z - f[1] * 16 + r[1] * 6; h.y = 24; h.vx = car.vx; h.vz = car.vz; h.spot = [car.x + f[0] * 2, 0, car.z + f[1] * 2];
    g.rig.carYawOffset = Math.PI - 0.42; g.rig.pitch = 0.02; g.rig.lastMouse = performance.now() / 1000 + 1000; g.rig.snap = true;
    g.simSpeed = 1;
    await wait(g, 0.12);
  } else if (n === 3) {
    // Golden-hour cutscene at Lin's Garage.
    g.newGame(true);
    g.clock = 17.25;
    g.missions.completed.add('homecoming');
    g.missions.safehouseUnlocked = true;
    g.missions.refreshMarker();
    const L = g.world.landmarks.garage.entry;
    p.x = L.x - 4; p.z = L.z; p.y = groundHeight(p.x, p.z);
    g.missions.start('yellowfever');
    await wait(g, 0.6);
    g.simSpeed = 1;
    const run = g.missions.run, lin = run.actors.find((a) => a.key === 'lin');
    g.missions.dialogue.cur.dur = 999; // hold the first line for the capture
    const mx = (p.x + lin.x) / 2, mz = (p.z + lin.z) / 2;
    g.rig.shot = Shots.dolly([mx - 3.4, 1.25, mz - 7.6], [mx - 3.0, 1.3, mz - 7.2], [mx + 0.6, 3.3, mz + 2], null, 9, 50);
    g.missions.dialogue.shotT = 2;
    g.hud.banner = null;
    await wait(g, 0.4);
  } else if (n === 4) {
    // Low Tide at the docks: SMG aim, gang behind containers, burning truck, cranes.
    g.newGame(true);
    for (const id of ['homecoming', 'yellowfever', 'collections', 'wheelman']) g.missions.completed.add(id);
    g.missions.refreshMarker();
    const L = g.world.landmarks.garage.entry;
    p.x = L.x - 4; p.z = L.z;
    g.missions.start('lowtide');
    await wait(g, 0.3);
    while (g.state === 'cutscene') { g.missions.skipLine(); await wait(g, 0.2); }
    g.clock = 22.6;
    const Y = g.world.landmarks.freight.yard, yard = [Y.x, Y.z];
    const tr = run0(g).vehicles.find((v) => v.model === 'bison');
    p.x = tr.x - 15; p.z = tr.z - 1.4; p.y = groundHeight(p.x, p.z);
    p.damage = () => false;
    g.weapons.give('smg', 300); g.weapons.select('smg');
    const run = g.missions.run;
    const truck = run.vehicles.find((v) => v.model === 'bison');
    const gangs = run.actors.filter((a) => a.kind === 'gang');
    // guards at mid-range around the truck and behind the lit containers, all firing (and missing)
    const spots = [[truck.x - 6, truck.z + 3.2], [truck.x + 7, truck.z + 2.6], [truck.x + 13, truck.z - 2.4], [truck.x - 9, truck.z - 3.1], [truck.x + 20, truck.z + 1], [truck.x + 3, truck.z - 3.3]];
    gangs.forEach((m, i) => { m.x = spots[i][0]; m.z = spots[i][1]; m.alert = true; m.accuracy = 0.02; m.coverT = 99; m.cover = null; m.shootT = i * 0.13; });
    g.rig.yaw = Math.atan2(truck.x + 4 - p.x, truck.z - p.z); g.rig.pitch = 0.0;
    g.input.hold('Mouse2', true);
    await wait(g, 1.2);
    gangs.forEach((m, i) => { m.x = spots[i][0]; m.z = spots[i][1]; });
    g.input.hold('Mouse0', true);
    truck.damage(1200, p);
    g.simSpeed = 1;
    await wait(g, 0.75);
    g.missions.dialogue.queue = []; g.missions.dialogue.cur = null; g.hud.subtitle = null;
  }
  g.simSpeed = 1;
  window.__shotReady = true;
}
