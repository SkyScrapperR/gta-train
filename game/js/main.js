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
    this.frameLights = [];
    this.fps = 60; this.fpsAcc = 0; this.fpsFrames = 0;
  }

  async init() {
    this.world = new World();
    await this.world.build(this.gl, (p, label) => this.drawLoading(p, label));
    this.renderer.atlas = this.world.atlas;
    this.rig = new CameraRig(this.camera, this.world);
    this.charRenderer = new CharacterRenderer(this.gl);
    this.weapons = new Inventory(this);
    const spawn = (params.get('spawn') || '447,920').split(',').map(Number);
    this.player = new Player(this, spawn[0], spawn[1]);
    this.player.yaw = Math.PI;
    this.characters.push(this.player);
    this.rig.yaw = this.player.yaw;
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

  frame(ts) {
    let dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.time += dt;
    this.update(dt * this.timeScale, dt);
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
    this.rig.updateFoot(realDt, this.player, this.mouseFrame, this.player.aiming);
    this.world.update(dt, this.camera.pos, this.env.night);
  }

  render(dt) {
    if (!this.env) this.env = computeEnvironment(this.clock, this.rain);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.rig.apply(dt, aspect, this.time);
    const env = this.env;
    this.charRenderer.begin();
    for (const ch of this.characters) if (ch.visible) this.charRenderer.add(ch);
    const lights = this.frameLights; lights.length = 0;
    this.world.collectLights(lights, this.camera.pos, env.night);
    this.renderer.render({
      camera: this.camera, env, time: this.time, wet: this.rain,
      chunks: this.world.chunks,
      batches: [...this.world.batches(), ...this.charRenderer.list()],
      lights, water: this.world.water,
      post: { exposure: env.exposure, gradeGain: env.gradeGain, gradeLift: env.gradeLift, saturation: env.sat },
      focus: [this.player.x, this.player.y, this.player.z],
    }, dt);
  }
}

const game = new Game();
game.init().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;z-index:9">${e.stack || e}</pre>`); });
