// Selara Bay — boot, main loop and game state machine (loading / title / playing / paused / map / cutscene).
import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { computeEnvironment } from './engine/sky.js';
import { World } from './world/world.js';
import { districtAtPoint, DISTRICTS } from './world/city.js';
import { groundHeight } from './world/city-meshes.js';
import { Gps } from './world/gps.js';
import { Input } from './core/input.js';
import { Events } from './core/events.js';
import { CameraRig } from './core/camera-rig.js';
import { clamp, lerp, v3lerp } from './core/math.js';
import { CharacterRenderer } from './entities/character-model.js';
import { Player } from './entities/player.js';
import { VehicleSystem } from './entities/vehicle.js';
import { PedestrianSystem } from './entities/pedestrian.js';
import { TrafficSystem } from './ai/traffic.js';
import { WantedSystem, PoliceSystem } from './ai/police.js';
import { Helicopter } from './ai/helicopter.js';
import { Inventory, WEAPONS } from './combat/weapons.js';
import { Combat } from './combat/combat.js';
import { Pickups } from './combat/pickups.js';
import { Particles } from './fx/particles.js';
import { FxLights } from './fx/lights.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { BigMap } from './ui/bigmap.js';
import { buildMapCanvas } from './ui/minimap.js';
import { theme, text } from './ui/theme.js';
import { AudioEngine } from './audio/audio.js';
import { SaveSystem, captureGame } from './save.js';
import { MissionSystem } from './story/missions.js';
import { Markers } from './story/markers.js';

const params = new URLSearchParams(location.search);
const DEFAULT_SETTINGS = { quality: 'medium', musicVol: 0.7, sfxVol: 0.8, radioVol: 0.7, sensitivity: 1, invertY: false, showFps: false };

// Title flythrough: slow cinematic shots between the towers at dusk, cutting between views of Orchid Tower.
const TITLE_SHOTS = [
  { p0: [447, 5, 650], p1: [449, 6.5, 612], l0: [486, 70, 392], l1: [488, 78, 392] },
  { p0: [610, 3.5, 458], p1: [590, 4.5, 456], l0: [497, 62, 405], l1: [497, 70, 405] },
  { p0: [372, 26, 262], p1: [392, 34, 282], l0: [497, 95, 405], l1: [497, 105, 405] },
  { p0: [536, 2.6, 520], p1: [537, 3.2, 492], l0: [520, 30, 380], l1: [512, 45, 370] },
];

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.hudCanvas = document.getElementById('hud');
    this.hudCtx = this.hudCanvas.getContext('2d');
    this.renderer = new Renderer(this.canvas);
    this.gl = this.renderer.gl;
    this.input = new Input(this.canvas);
    this.events = new Events();
    this.camera = new Camera();
    this.save = new SaveSystem();
    this.settings = { ...DEFAULT_SETTINGS, ...(this.save.readSettings() || {}) };
    if (params.get('quality')) this.settings.quality = params.get('quality');
    this.renderer.setQuality(this.settings.quality);
    if (params.has('scale')) this.renderer.forcedScale = Number(params.get('scale'));
    this.audio = new AudioEngine(this);
    this.state = 'loading';
    this.time = 0;
    this.clock = 18.2;
    this.timeScale = 1; this.slowT = 0; this.slowScale = 1;
    this.rain = 0; this.rainTarget = 0; this.weatherT = 240;
    this.characters = [];
    this.controlsLocked = false;
    this.frameLights = [];
    this.fps = 60; this.fpsAcc = 0; this.fpsFrames = 0;
    this.money = 0;
    this.stats = { kills: 0, carsStolen: 0, missions: 0, tags: 0, timePlayed: 0, moneyEarned: 0 };
    this.overlay = null;
    this.cinematic = false;
    this.titleT = 0;
    this.post = { desat: 0, blur: 0, flash: 0 };
  }

  async init() {
    this.world = new World();
    await this.world.build(this.gl, (p, label) => this.drawLoading(p, label));
    this.renderer.atlas = this.world.atlas;
    this.rig = new CameraRig(this.camera, this.world);
    this.charRenderer = new CharacterRenderer(this.gl);
    this.weapons = new Inventory(this);
    this.player = new Player(this, 495, 300);
    this.characters.push(this.player);
    this.vehicles = new VehicleSystem(this);
    this.traffic = new TrafficSystem(this);
    this.peds = new PedestrianSystem(this);
    this.wanted = new WantedSystem(this);
    this.police = new PoliceSystem(this);
    this.helicopter = new Helicopter(this);
    this.particles = new Particles(this);
    this.lightsFx = new FxLights();
    this.combat = new Combat(this);
    this.pickups = new Pickups(this);
    this.pickups.placeWorldPickups();
    this.gps = new Gps(this);
    this.markers = new Markers(this);
    const mapCanvas = buildMapCanvas(this.world);
    this.hud = new Hud(this, mapCanvas);
    this.bigmap = new BigMap(this, mapCanvas);
    this.menus = new Menus(this);
    this.missions = new MissionSystem(this);
    this.applySettings();
    this.bindUi();
    this.events.on('death', (e) => this.onDeath(e));
    window.__game = this;
    this.last = performance.now();
    this.enterTitle();
    if (params.has('play')) this.newGame(true);
    if (params.has('shot')) import('./screenshot-scenes.js').then((m) => m.setupShot(this, Number(params.get('shot'))));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------------------------------------------------------- UI plumbing
  bindUi() {
    const gesture = () => this.audio.unlock();
    addEventListener('pointerdown', gesture); addEventListener('keydown', gesture);
    addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this.settings.showFps = !this.settings.showFps; this.hud.showFps = this.settings.showFps; }
      if (this.state === 'map') { if (e.code === 'Escape' || e.code === 'KeyM') this.closeMap(); return; }
      if (this.menus.active) { this.menus.key(e.code); return; }
      if (this.state === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
        else if (e.code === 'KeyM') this.openMap();
        else if (e.code === 'KeyC') { this.cinematic = !this.cinematic; this.hud.toast(this.cinematic ? 'Cinematic camera' : 'Standard camera', theme.teal, 1.5); }
      } else if (this.state === 'cutscene' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) this.missions.skipLine();
    });
    this.input.onLockChange = (locked) => { if (!locked && this.state === 'playing' && !this.noAutoPause) this.pause(); };
    const hc = this.hudCanvas;
    const pos = (e) => [e.clientX * (hc.width / hc.clientWidth), e.clientY * (hc.height / hc.clientHeight)];
    let drag = null;
    hc.addEventListener('mousemove', (e) => {
      const [x, y] = pos(e);
      if (this.menus.active) this.menus.mouseMove(x, y);
      if (this.state === 'map' && drag) { this.bigmap.drag(x - drag[0], y - drag[1], hc.width, hc.height); drag = [x, y]; }
    });
    hc.addEventListener('mousedown', (e) => { const [x, y] = pos(e); if (this.state === 'map') drag = [x, y]; this.dragStart = [x, y]; });
    hc.addEventListener('mouseup', (e) => {
      const [x, y] = pos(e);
      if (this.state === 'map' && this.dragStart && Math.hypot(x - this.dragStart[0], y - this.dragStart[1]) < 5) this.bigmap.click(x, y, hc.width, hc.height);
      drag = null;
      if (this.menus.active) this.menus.click(x, y);
    });
    hc.addEventListener('wheel', (e) => { if (this.state === 'map') this.bigmap.wheel(e.deltaY); }, { passive: true });
    this.canvas.addEventListener('click', () => { if (this.state === 'playing') this.input.requestLock(); });
  }
  setMenuMode(on) { document.body.classList.toggle('menu', on); }
  applySettings() {
    const s = this.settings;
    this.renderer.setQuality(s.quality);
    this.input.sensitivity = s.sensitivity; this.input.invertY = s.invertY;
    this.hud.showFps = s.showFps;
    this.audio.setVolumes(s);
    this.world.props.drawRadius = { low: 200, medium: 300, high: 420 }[s.quality];
    this.world.props.cull(this.camera.pos, true);
    this.traffic.target = { low: 20, medium: 30, high: 34 }[s.quality];
    this.peds.target = { low: 30, medium: 50, high: 56 }[s.quality];
  }
  setSetting(k, v) { this.settings[k] = v; this.applySettings(); this.save.writeSettings(this.settings); }

  // ---------------------------------------------------------------- states
  enterTitle() {
    this.state = 'title';
    this.clock = 18.25; this.rain = 0;
    this.menus.closeAll(); this.menus.open('title');
    this.setMenuMode(true);
    this.player.visible = false;
    this.player.x = 495; this.player.z = 320;
    this.titleT = 0;
    if (!this.traffic.cars.length) { this.traffic.prefill(); this.peds.prefill(); }
    this.audio.music?.play('title');
  }
  resetWorldState() {
    this.wanted.clear();
    for (const v of this.vehicles.list.slice()) this.vehicles.remove(v);
    for (const c of this.police.cops.slice()) this.removeCharacter(c);
    this.police.cops = [];
    for (const p of this.peds.list.slice()) this.peds.remove(p);
    this.characters = this.characters.filter((c) => c === this.player);
    this.particles.list.length = 0; this.particles.decals.length = 0;
    this.helicopter?.reset?.();
    this.gps.setObjective(null); this.gps.setWaypoint(null);
    this.overlay = null; this.controlsLocked = false; this.post.desat = 0;
  }
  beginPlay() {
    this.state = 'playing';
    this.menus.closeAll();
    this.setMenuMode(false);
    this.player.visible = true;
    this.rig.snap = true;
    this.input.requestLock();
    this.audio.music?.play(null);
  }
  newGame(skipIntro = false) {
    this.save.clear();
    this.resetWorldState();
    this.money = 150;
    this.stats = { kills: 0, carsStolen: 0, missions: 0, tags: 0, timePlayed: 0, moneyEarned: 0 };
    this.weapons = new Inventory(this);
    const p = this.player;
    p.alive = true; p.health = 100; p.armor = 0; p.state = 'foot'; p.vehicle = null; p.anim.mode = 'idle';
    for (const t of this.world.props.tagList) t.collected = false;
    this.clock = 17.6;
    this.missions.reset();
    p.x = 446; p.z = 1000; p.y = groundHeight(p.x, p.z); p.yaw = Math.PI;
    this.rig.yaw = Math.PI; this.rig.pitch = 0.15;
    this.traffic.prefill(); this.peds.prefill();
    this.beginPlay();
    if (!skipIntro) this.missions.start('homecoming');
  }
  continueGame() {
    const d = this.save.read();
    if (!d) return this.newGame();
    this.resetWorldState();
    this.money = d.money; this.stats = { ...this.stats, ...d.stats };
    this.weapons = new Inventory(this); this.weapons.load(d.weapons);
    const p = this.player;
    p.alive = true; p.health = d.health; p.armor = d.armor; p.state = 'foot'; p.vehicle = null; p.anim.mode = 'idle';
    p.x = d.pos[0]; p.z = d.pos[1]; p.y = groundHeight(p.x, p.z);
    this.clock = d.clock;
    for (const t of this.world.props.tagList) t.collected = d.tags.includes(t.id);
    this.missions.load(d.missions);
    this.traffic.prefill(); this.peds.prefill();
    this.beginPlay();
    this.hud.toast('Game loaded', theme.teal);
  }
  saveGame(silent = false) {
    const ok = this.save.write(captureGame(this));
    if (!silent) this.hud.bannerShow('GAME SAVED', '', theme.teal, 2, 0);
    return ok;
  }
  pause() { if (this.state !== 'playing') return; this.state = 'paused'; this.menus.open('pause'); this.setMenuMode(true); this.input.exitLock(); }
  resume() { this.menus.closeAll(); this.state = 'playing'; this.setMenuMode(false); this.input.requestLock(); }
  onMenusClosed() { if (this.state === 'paused') this.resume(); }
  openMap() { this.menus.closeAll(); this.state = 'map'; this.bigmap.open(); this.setMenuMode(true); this.input.exitLock(); }
  closeMap() { this.state = 'playing'; this.setMenuMode(false); this.input.requestLock(); }
  quitToTitle() { this.missions.abort(); this.resetWorldState(); this.enterTitle(); }

  // ---------------------------------------------------------------- shops
  respray() {
    const p = this.player, v = p.vehicle;
    if (!v) return;
    if (this.wanted.stars === 0) { v.health = Math.max(v.health, 1000); v.fire = 0; this.hud.toast('Kilat Respray: car fixed (free)', '#4dffd2'); return; }
    if (this.money < 100) { this.hud.tip('Kilat Respray costs $100. You are broke.', 3); return; }
    this.addMoney(-100);
    this.wanted.clear();
    v.health = 1000; v.fire = 0;
    const cols = v.spec.colors.concat([[0.1, 0.5, 0.8], [0.8, 0.2, 0.5], [0.2, 0.6, 0.3], [0.95, 0.5, 0.1]]);
    v.color = cols[Math.floor(Math.random() * cols.length)];
    this.hud.bannerShow('RESPRAYED', 'Heat cleared  -$100', '#4dffd2', 3, 1);
    this.audio.play('pickup', null, 0.6);
  }
  openShop() { if (this.state !== 'playing') return; this.state = 'paused'; this.shopOpen = true; this.menus.open('shop'); this.setMenuMode(true); this.input.exitLock(); }
  closeShop() { this.menus.closeAll(); this.shopOpen = false; this.state = 'playing'; this.setMenuMode(false); this.input.requestLock(); }
  buy(id) {
    const w = WEAPONS[id], owned = this.weapons.has(id), price = owned ? w.ammoPrice : w.price;
    if (this.money < price) { this.hud.toast('Not enough cash', theme.red); return; }
    this.addMoney(-price);
    this.weapons.give(id, owned ? w.ammoPack : w.mag * 3);
    this.weapons.select(id);
    this.hud.toast(owned ? `${w.name} ammo +${w.ammoPack}` : `Bought ${w.name}`, '#ff9f43');
  }
  buyArmor() { if (this.player.armor >= 100) { this.hud.toast('Armor already full'); return; } if (this.money < 250) { this.hud.toast('Not enough cash', theme.red); return; } this.addMoney(-250); this.player.armor = 100; this.hud.toast('Armor +100', theme.blue); }

  // ---------------------------------------------------------------- death / arrest
  onDeath(e) {
    if (e.victim !== this.player || this.overlay) return;
    this.overlay = { kind: 'flatlined', t: 0 };
    this.slowMo(0.3, 2.2);
    this.audio.music?.stinger('flatlined');
    this.missions.onPlayerDown('flatlined');
  }
  busted() {
    if (this.overlay) return;
    this.overlay = { kind: 'cuffed', t: 0 };
    this.controlsLocked = true;
    const p = this.player;
    if (p.state === 'driving' && p.vehicle) { const v = p.vehicle; const d = v.doorWorld(); v.driver = null; p.vehicle = null; p.state = 'foot'; p.x = d[0]; p.z = d[2]; }
    this.audio.music?.stinger('cuffed');
    this.missions.onPlayerDown('cuffed');
  }
  updateOverlay(dt) {
    const o = this.overlay;
    if (!o) { this.post.desat = Math.max(0, this.post.desat - dt); return; }
    o.t += dt;
    this.post.desat = Math.min(1, o.t / 1.5);
    if (o.kind === 'cuffed') { this.player.updateAnim(dt, 'surrender'); this.player.anim.mode = 'surrender'; }
    if (o.t > 4.5) this.respawn(o.kind);
  }
  respawn(kind) {
    const L = this.world.landmarks, p = this.player;
    const at = kind === 'flatlined' ? L.hospital.entry : L.police.entry;
    if (p.vehicle) { if (p.vehicle.driver === p) p.vehicle.driver = null; p.vehicle = null; }
    p.state = 'foot'; p.alive = true; p.health = 100; p.armor = 0; p.visible = true; p.anim.mode = 'idle'; p.downTimer = 0;
    p.x = at.x; p.z = at.z; p.y = groundHeight(p.x, p.z); p.yaw = at.yaw + Math.PI;
    this.rig.yaw = p.yaw; this.rig.snap = true;
    this.money = Math.max(0, this.money - 100);
    if (kind === 'cuffed') { this.weapons.loseAmmo(); this.weapons.select('fists'); }
    this.wanted.clear();
    this.controlsLocked = false;
    this.overlay = null;
    this.clock = (this.clock + 2) % 24;
    this.hud.toast(kind === 'flatlined' ? 'Hospital bill: -$100' : 'Bail -$100, ammo confiscated', theme.red, 4);
    this.events.emit('respawn', kind);
  }

  // ---------------------------------------------------------------- helpers used by systems
  onPlayerEnteredVehicle(v) {
    this.rig.snap = false;
    this.hud.popup('vehicle', v.spec.name);
    if (v.isPolice && !v.stolenFlag) { v.stolenFlag = true; this.events.emit('crime', { type: 'stealCop', x: v.x, z: v.z }); }
    if (!v.owned) { v.owned = true; if (!v.missionCar) this.stats.carsStolen++; }
    this.events.emit('enterVehicle', v);
    this.audio.radio?.enterCar();
  }
  onPlayerExitedVehicle(v) { this.rig.yaw = v ? v.yaw : this.rig.yaw; this.events.emit('exitVehicle', v); this.audio.radio?.exitCar(); }
  removeCharacter(ch) { const i = this.characters.indexOf(ch); if (i >= 0) this.characters.splice(i, 1); if (ch.vehicle && ch.vehicle.driver === ch) ch.vehicle.driver = null; }
  addMoney(n) { this.money = Math.max(0, this.money + n); if (n > 0) { this.stats.moneyEarned += n; this.audio.play('cash', null, 0.4); } }
  slowMo(scale, dur) { this.slowScale = scale; this.slowT = Math.max(this.slowT, dur); }
  aimRay() {
    const c = this.camera, o = c.pos, d = c.forward, p = this.player;
    const toP = (p.x - o[0]) * d[0] + (p.y + 1.4 - o[1]) * d[1] + (p.z - o[2]) * d[2];
    const t0 = Math.max(0, toP);
    return { origin: [o[0] + d[0] * t0, o[1] + d[1] * t0, o[2] + d[2] * t0], dir: d };
  }
  blips() {
    const L = this.world.landmarks, out = [];
    for (const k of ['safehouse', 'garage', 'hospital', 'police', 'guns', 'respray']) { const lm = L[k]; if (k === 'safehouse' && !this.missions.safehouseUnlocked) continue; out.push({ x: lm.x, z: lm.z, icon: lm.icon, color: lm.color }); }
    out.push(...this.missions.blips());
    return out;
  }
  statsList() {
    const s = this.stats, t = Math.floor(s.timePlayed);
    return [['Missions completed', `${this.missions.completedCount} / 6`], ['Orchid tags', `${s.tags} / 12`], ['Kills', s.kills], ['Cars stolen', s.carsStolen], ['Time played', `${Math.floor(t / 3600)}h ${String(Math.floor(t / 60) % 60).padStart(2, '0')}m ${String(t % 60).padStart(2, '0')}s`], ['Money', `$${this.money.toLocaleString('en-US')}`], ['Money earned', `$${s.moneyEarned.toLocaleString('en-US')}`]];
  }

  // ---------------------------------------------------------------- loop
  drawLoading(p, label) {
    const c = this.hudCanvas, g = this.hudCtx;
    c.width = innerWidth; c.height = innerHeight;
    g.fillStyle = '#07060d'; g.fillRect(0, 0, c.width, c.height);
    const cx = c.width / 2, cy = c.height / 2;
    const lg = g.createLinearGradient(cx - 260, 0, cx + 260, 0); lg.addColorStop(0, '#2de2c8'); lg.addColorStop(1, '#ff3fb4');
    g.font = `900 64px ${theme.font}`; g.textAlign = 'center'; g.fillStyle = lg; g.shadowColor = '#ff3fb4'; g.shadowBlur = 30;
    g.fillText('SELARA BAY', cx, cy - 40); g.shadowBlur = 0;
    g.fillStyle = '#1c1c28'; g.fillRect(cx - 220, cy, 440, 8);
    g.fillStyle = lg; g.fillRect(cx - 220, cy, 440 * p, 8);
    g.font = `16px ${theme.body}`; g.fillStyle = '#aab'; g.fillText(`${label}…`, cx, cy + 36);
  }

  frame(ts) {
    if (this.frozen) { requestAnimationFrame((t) => this.frame(t)); return; } // test hook: hold the last frame
    const rawDt = Math.max(0, (ts - this.last) / 1000);
    const dt = Math.min(0.05, rawDt);
    this.last = ts;
    this.fpsAcc += rawDt; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; this.adaptResolution(); }
    this.time += dt;
    if (this.slowT > 0) { this.slowT -= dt; this.timeScale = this.slowScale; } else this.timeScale = 1;
    const steps = this.simSpeed || 1;
    if (steps > 1) { for (let i = 0; i < steps; i++) { this.update(1 / 30 * this.timeScale, 1 / 30); if (i < steps - 1) this.input.endFrame(); } }
    else this.update(dt * this.timeScale, dt);
    this.render(dt);
    this.input.endFrame();
    requestAnimationFrame((t) => this.frame(t));
  }
  // Scale the internal resolution with the frame rate.
  adaptResolution() {
    if (this.renderer.forcedScale) return;
    const r = this.renderer;
    if (this.fps < 40) r.dynamicScale = Math.max(0.6, r.dynamicScale - 0.05);
    else if (this.fps > 56) r.dynamicScale = Math.min(1, r.dynamicScale + 0.02);
  }

  update(dt, realDt) {
    this.simTime = (this.simTime || 0) + dt;
    this.mouseFrame = this.input.consumeMouse();
    this.env = computeEnvironment(this.clock, this.rain);
    this.hud.update(realDt);
    this.hud.letterbox = lerp(this.hud.letterbox, this.state === 'cutscene' || this.cinematic ? 1 : 0, Math.min(1, realDt * 4));
    this.post.blur = lerp(this.post.blur, this.state === 'paused' ? (this.shopOpen ? 0.5 : 1) : 0, Math.min(1, realDt * 6));
    this.audio.update(realDt);
    if (this.state === 'title') { this.updateTitle(dt); return; }
    if (this.state === 'paused' || this.state === 'map' || this.state === 'loading') return;
    this.clock = (this.clock + dt / 60) % 24;
    this.updateWeather(dt);
    if (this.state === 'cutscene') { this.player.updateAnim(dt, 'idle'); this.missions.update(dt); this.simulateWorld(dt); this.rig.updateShot(realDt, this.missions.shotTime); return; }
    this.weapons.update(dt);
    this.player.update(dt, this.input, this.rig);
    this.simulateWorld(dt);
    this.missions.update(dt);
    this.markers.update(dt);
    this.gps.update(dt);
    this.updateOverlay(dt);
    this.checkArea();
    this.stats.timePlayed += dt;
    this.contextTips();
    const p = this.player;
    if (this.cinematic) this.updateCinematicCam(realDt);
    else if (p.state === 'driving') this.rig.updateCar(realDt, p.vehicle, this.mouseFrame);
    else this.rig.updateFoot(realDt, p, this.mouseFrame, p.aiming && p.alive);
    // drive-by: shoot toward the camera direction while driving
    if (p.state === 'driving' && !this.controlsLocked && this.input.mouseDown(0) && !this.weapons.current.melee) {
      const prevYaw = p.yaw;
      p.yaw = Math.atan2(this.camera.forward[0], this.camera.forward[2]);
      this.weapons.fire(p, this.aimRay());
      p.yaw = prevYaw;
    }
    if (p.state === 'driving' && this.input.wasPressed('KeyR')) this.audio.radio?.next();
  }
  simulateWorld(dt) {
    this.traffic.update(dt);
    this.police.update(dt);
    this.vehicles.update(dt);
    for (const ch of this.characters) if (ch !== this.player && ch.vehicle) { const st = ch.vehicle.seatWorld(ch.vehicle.driver === ch ? 0 : 1); ch.x = st[0]; ch.y = st[1]; ch.z = st[2]; ch.yaw = ch.vehicle.yaw; ch.updateAnim(dt, 'sit'); }
    this.peds.update(dt);
    this.missions.updateActors(dt);
    this.wanted.update(dt);
    this.helicopter?.update(dt);
    this.pickups.update(dt);
    this.particles.update(dt);
    this.lightsFx.update(dt);
    if (this.rain > 0.05) this.particles.rain(this.camera.pos, this.rain * dt * 60);
    this.world.update(dt, this.camera.pos, this.env.night);
  }
  updateWeather(dt) {
    if (this.forcedRain !== undefined) { this.rain = this.forcedRain; return; }
    this.weatherT -= dt;
    if (this.weatherT <= 0) { this.rainTarget = Math.random() < 0.3 ? 0.6 + Math.random() * 0.4 : 0; this.weatherT = 180 + Math.random() * 240; }
    this.rain += clamp(this.rainTarget - this.rain, -dt * 0.02, dt * 0.02);
  }
  // Contextual help tips (enter vehicle, start mission, shops).
  contextTips() {
    const p = this.player, h = this.hud;
    if (this.tipT > 0) { this.tipT -= 1 / 30; return; }
    this.tipT = 0.25;
    if (p.state === 'foot' && p.alive) {
      const v = this.vehicles.nearestEnterable(p.x, p.z, 3.2);
      if (v) { h.tip(`Press F to ${v.driver ? 'steal' : 'enter'} the ${v.spec.name}`, 0.6); return; }
      const m = this.markers.list.find((mk) => mk.enabled && mk.label && Math.hypot(mk.x - p.x, mk.z - p.z) < 9);
      if (m) { h.tip(m === this.markers.save ? 'Step into the marker to save' : `${m.label}: step into the marker`, 0.6); return; }
    } else if (p.state === 'driving' && !this.tipShownDrive) { this.tipShownDrive = true; h.tip('R: radio   H: horn   Space: handbrake   F: exit', 4); }
    if (!this.input.locked && this.state === 'playing' && !this.noAutoPause && !h.help) h.tip('Click to capture the mouse', 0.6);
  }
  checkArea() {
    const p = this.player;
    const d = districtAtPoint(p.x, p.z);
    if (d !== this.lastDistrict) { this.lastDistrict = d; this.hud.popup('area', DISTRICTS[d].name, DISTRICTS[d].subtitle); }
  }
  updateTitle(dt) {
    this.titleT += dt;
    const seg = 10;
    const shots = this.titleShots || TITLE_SHOTS;
    const sh = shots[Math.floor(this.titleT / seg) % shots.length], k = (this.titleT % seg) / seg;
    const e = k * k * (3 - 2 * k);
    this.rig.pos = v3lerp(sh.p0, sh.p1, e); this.rig.look = v3lerp(sh.l0, sh.l1, e); this.rig.fov = 52;
    this.player.x = this.rig.pos[0]; this.player.z = this.rig.pos[2];
    this.clock = 18.25;
    this.simulateWorld(dt);
  }
  updateCinematicCam(dt) {
    const p = this.player, t = p.state === 'driving' ? p.vehicle : p;
    const a = this.time * 0.15;
    const r = p.state === 'driving' ? 9 : 5;
    const target = [t.x + Math.sin(a) * r, t.y + (p.state === 'driving' ? 1.2 : 0.9), t.z + Math.cos(a) * r];
    target[1] = Math.max(target[1], groundHeight(target[0], target[2]) + 0.6);
    this.rig.pos = v3lerp(this.rig.pos, target, Math.min(1, dt * 3));
    this.rig.look = [t.x, t.y + 1.2, t.z]; this.rig.fov = 45;
  }

  render(dt) {
    if (this.state === 'loading') return;
    const env = this.env || computeEnvironment(this.clock, this.rain);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    this.rig.apply(dt, aspect, this.time);
    this.charRenderer.begin();
    const cp = this.camera.pos;
    for (const ch of this.characters) if (ch.visible && Math.abs(ch.x - cp[0]) < 160 && Math.abs(ch.z - cp[2]) < 160) this.charRenderer.add(ch);
    this.vehicles.render(cp);
    this.markers.reset();
    this.helicopter?.render(this.markers.cones);
    this.pickups.render();
    this.markers.render();
    this.particles.upload(cp);
    const lights = this.frameLights; lights.length = 0;
    this.world.collectLights(lights, cp, env.night);
    this.vehicles.collectLights(lights, cp, env.night);
    this.lightsFx.collect(lights);
    this.pickups.collectLights(lights, cp);
    this.markers.collectLights(lights, cp);
    this.helicopter?.collectLights(lights, env.night);
    this.renderer.render({
      camera: this.camera, env, time: this.time, wet: this.rain,
      chunks: this.world.chunks,
      batches: [...this.world.batches(), ...this.charRenderer.list(), ...this.vehicles.list_batches(), ...Object.values(this.pickups.batches), ...this.markers.batches(), ...(this.helicopter?.batches() || [])],
      particlesAlpha: this.particles.alpha, particlesAdd: this.particles.add, cones: this.markers.cones,
      lights, water: this.world.water,
      post: { exposure: env.exposure, gradeGain: env.gradeGain, gradeLift: env.gradeLift, saturation: env.sat, desat: this.post.desat, blur: this.post.blur, time: this.time, vignette: 0.35 + this.hud.letterbox * 0.1 },
      focus: [this.player.x, this.player.y, this.player.z],
    }, dt);
    this.drawHud(dt);
  }

  drawHud(dt) {
    const c = this.hudCanvas, g = this.hudCtx;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const W = Math.floor(c.clientWidth * dpr), H = Math.floor(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    g.clearRect(0, 0, W, H);
    if (this.state === 'map') { this.bigmap.draw(g, W, H); return; }
    if (this.state !== 'title') this.hud.draw(g, W, H);
    if (this.overlay) {
      const o = this.overlay, a = clamp(o.t / 0.8, 0, 1);
      g.fillStyle = `rgba(0,0,0,${0.25 * a})`; g.fillRect(0, 0, W, H);
      const u = H / 1080;
      g.save(); g.scale(u, u);
      text(g, o.kind === 'flatlined' ? 'FLATLINED' : 'CUFFED', W / u / 2, 540, { size: 130 + o.t * 6, align: 'center', color: o.kind === 'flatlined' ? '#ff3b4e' : '#4da3ff', outline: 10, alpha: a, shadow: 30 });
      g.restore();
    }
    if (this.menus.active) this.menus.draw(g, W, H, dt);
  }
}

const game = new Game();
game.init().catch((e) => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f66;position:fixed;top:0;left:0;z-index:9">${e.stack || e}</pre>`); });
