// Selara Bay — boot, main loop and game state machine (loading / title / playing / paused / map / cutscene).
import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { computeEnvironment } from './engine/sky.js';
import { World } from './world/world.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { CameraRig } from './core/camera-rig.js';
import { CharacterRenderer } from './entities/character-model.js';
import { Player } from './entities/player.js';
import { Inventory } from './combat/weapons.js';
import { VehicleSystem } from './entities/vehicle.js';
import { TrafficSystem } from './ai/traffic.js';
import { PedestrianSystem } from './entities/pedestrian.js';
import { WantedSystem, PoliceSystem } from './ai/police.js';
import { Particles } from './fx/particles.js';
import { FxLights } from './fx/lights.js';
import { Combat } from './combat/combat.js';
import { Pickups } from './combat/pickups.js';

const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.hudCanvas = document.getElementById('hud');
    this.renderer = new Renderer(this.canvas);
    this.gl = this.renderer.gl;
    this.input = new Input(this.canvas);
    this.events = new Events();
    this.camera = new Camera();
    this.state = 'loading';
    this.time = 0; // real seconds since start
    this.clock = Number(params.get('hour') ?? 17.5); // in-game hours, 1 real second = 1 game minute
    this.timeScale = 1;
    this.rain = Number(params.get('rain') ?? 0);
    this.characters = [];
    this.controlsLocked = false;
    this.settings = { quality: params.get('quality') || 'medium' };
    this.renderer.setQuality(this.settings.quality);
    if (params.has('scale')) this.renderer.forcedScale = Number(params.get('scale'));
    this.frameLights = [];
    this.fps = 60; this.fpsAcc = 0; this.fpsFrames = 0;
    this.money = 0; this.moneyShown = 0;
    this.stats = { kills: 0, carsStolen: 0, missions: 0, tags: 0, timePlayed: 0, moneyEarned: 0 };
    this.slowT = 0; this.slowScale = 1;
  }

  async init() {
    this.world = new World();
    await this.world.build(this.gl, (p, label) => this.drawLoading(p, label));
    this.renderer.atlas = this.world.atlas;
    this.rig = new CameraRig(this.camera, this.world);
    this.charRenderer = new CharacterRenderer(this.gl);
    this.weapons = new Inventory(this);
    this.vehicles = new VehicleSystem(this);
    this.traffic = new TrafficSystem(this);
    this.peds = new PedestrianSystem(this);
    this.wanted = new WantedSystem(this);
    this.police = new PoliceSystem(this);
    this.particles = new Particles(this);
    this.lightsFx = new FxLights();
    this.combat = new Combat(this);
    this.pickups = new Pickups(this);
    this.pickups.placeWorldPickups();
    const spawn = (params.get('spawn') || '447,920').split(',').map(Number);
    this.player = new Player(this, spawn[0], spawn[1]);
    this.player.yaw = Math.PI;
    this.characters.push(this.player);
    this.rig.yaw = this.player.yaw;
    if (params.has('testcars')) {
      this.vehicles.spawn('merpati', spawn[0] - 3, spawn[1] - 8, Math.PI);
      this.vehicles.spawn('vesper', spawn[0] + 3, spawn[1] - 8, Math.PI);
      this.vehicles.spawn('police', spawn[0] - 3, spawn[1] - 16, Math.PI);
      this.vehicles.spawn('taxi', spawn[0] + 3, spawn[1] - 16, Math.PI);
      this.vehicles.spawn('bajak', spawn[0] - 3, spawn[1] - 26, Math.PI);
      this.vehicles.spawn('bison', spawn[0] + 3, spawn[1] - 28, Math.PI);
      this.vehicles.spawn('kancil', spawn[0] - 3, spawn[1] - 35, Math.PI);
    }
    if (!params.has('notraffic')) { this.traffic.prefill(); this.peds.prefill(); }
    this.state = 'playing';
    this.hudCanvas.getContext('2d').clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
    window.__game = this;
    this.last = performance.now();
    this.canvas.addEventListener('click', () => { if (this.state === 'playing') this.input.requestLock(); });
    requestAnimationFrame((t) => this.frame(t));
  }

  drawLoading(p, label) {
    const c = this.hudCanvas, g = c.getContext('2d');
    c.width = innerWidth; c.height = innerHeight;
    g.fillStyle = '#07060d'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff'; g.font = '900 42px sans-serif'; g.textAlign = 'center';
    g.fillText('SELARA BAY', c.width / 2, c.height / 2 - 30);
    g.fillStyle = '#222'; g.fillRect(c.width / 2 - 200, c.height / 2, 400, 8);
    g.fillStyle = '#2de2c8'; g.fillRect(c.width / 2 - 200, c.height / 2, 400 * p, 8);
    g.font = '16px sans-serif'; g.fillStyle = '#aaa'; g.fillText(label, c.width / 2, c.height / 2 + 34);
  }

  aimRay() {
    const c = this.camera;
    const o = c.pos, d = c.forward;
    // start the ray at the player's distance along the view so we don't hit things behind them
    const p = this.player;
    const toP = (p.x - o[0]) * d[0] + (p.y + 1.4 - o[1]) * d[1] + (p.z - o[2]) * d[2];
    const t0 = Math.max(0, toP);
    return { origin: [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0], dir: d };
  }

  onPlayerEnteredVehicle(v) { this.rig.snap = false; this.events.emit('enterVehicle', v); }
  onPlayerExitedVehicle(v) { this.rig.yaw = v ? v.yaw : this.rig.yaw; this.events.emit('exitVehicle', v); }
  addMoney(n) { this.money = Math.max(0, this.money + n); if (n > 0) this.stats.moneyEarned += n; this.events.emit('money', n); }
  slowMo(scale, dur) { this.slowScale = scale; this.slowT = Math.max(this.slowT, dur); }
  busted() { this.wanted.clear(); this.player.health = 100; console.log('CUFFED'); }
  removeCharacter(ch) { const i = this.characters.indexOf(ch); if (i >= 0) this.characters.splice(i, 1); if (ch.vehicle && ch.vehicle.driver === ch) ch.vehicle.driver = null; }

  frame(ts) {
    const rawDt = Math.max(0, (ts - this.last) / 1000);
    let dt = Math.min(0.05, rawDt);
    this.last = ts;
    this.fpsAcc += rawDt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.time += dt;
    // slow-motion moments (big crashes, explosions, death)
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowScale; } else this.timeScale = 1;
    // test hook: several fixed simulation steps per rendered frame (headless play-tests)
    const steps = this.simSpeed || 1;
    if (steps > 1) { for (let i = 0; i < steps; i++) { this.update(1 / 30 * this.timeScale, 1 / 30); if (i < steps - 1) this.input.endFrame(); } }
    else this.update(dt * this.timeScale, dt);
    this.render(dt);
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt, realDt) {
    this.mouseFrame = this.input.consumeMouse();
    if (this.state !== 'playing') return;
    this.clock = (this.clock + dt / 60) % 24;
    this.env = computeEnvironment(this.clock, this.rain);
    this.weapons.update(dt);
    this.player.update(dt, this.input, this.rig);
    this.traffic.update(dt);
    this.police.update(dt);
    this.vehicles.update(dt);
    this.peds.update(dt);
    this.wanted.update(dt);
    this.pickups.update(dt);
    this.particles.update(dt);
    this.lightsFx.update(dt);
    if (this.rain > 0) this.particles.rain(this.camera.pos, this.rain * dt * 60);
    this.stats.timePlayed += dt;
    for (const ch of this.characters) if (ch !== this.player && ch.vehicle) { const st = ch.vehicle.seatWorld(ch.vehicle.driver === ch ? 0 : 1); ch.x = st[0]; ch.y = st[1]; ch.z = st[2]; ch.yaw = ch.vehicle.yaw; ch.updateAnim(dt, 'sit'); }
    if (this.player.state === 'driving') this.rig.updateCar(realDt, this.player.vehicle, this.mouseFrame);
    else this.rig.updateFoot(realDt, this.player, this.mouseFrame, this.player.aiming);
    this.world.update(dt, this.camera.pos, this.env.night);
  }

  render(dt) {
    if (!this.env) this.env = computeEnvironment(this.clock, this.rain);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.rig.apply(dt, aspect, this.time);
    const env = this.env;
    this.charRenderer.begin();
    for (const ch of this.characters) if (ch.visible) this.charRenderer.add(ch);
    this.vehicles.render(this.camera.pos);
    const lights = this.frameLights; lights.length = 0;
    this.world.collectLights(lights, this.camera.pos, env.night);
    this.vehicles.collectLights(lights, this.camera.pos, env.night);
    this.lightsFx.collect(lights);
    this.pickups.collectLights(lights, this.camera.pos);
    this.pickups.render();
    this.particles.upload(this.camera.pos);
    this.renderer.render({
      camera: this.camera, env, time: this.time, wet: this.rain,
      chunks: this.world.chunks,
      batches: [...this.world.batches(), ...this.charRenderer.list(), ...this.vehicles.list_batches(), ...Object.values(this.pickups.batches)],
      particlesAlpha: this.particles.alpha, particlesAdd: this.particles.add,
      lights, water: this.world.water,
      post: { exposure: env.exposure, gradeGain: env.gradeGain, gradeLift: env.gradeLift, saturation: env.sat },
      focus: [this.player.x, this.player.y, this.player.z],
    }, dt);
  }
}

const game = new Game();
game.init().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;z-index:9">${e.stack || e}</pre>`); });
