// Keyboard + mouse input with pointer lock. Supports virtual (scripted) input for automated play-tests.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.released = new Set();
    this.virtual = new Set();
    this.mouse = { dx: 0, dy: 0, x: 0, y: 0, buttons: 0, pressed: 0, wheel: 0 };
    this.locked = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.onLockChange = null;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => { this.down.delete(e.code); this.released.add(e.code); });
    addEventListener('blur', () => { this.down.clear(); this.mouse.buttons = 0; });
    addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY;
      if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; }
    });
    addEventListener('mousedown', (e) => { this.mouse.buttons |= 1 << e.button; this.mouse.pressed |= 1 << e.button; });
    addEventListener('mouseup', (e) => { this.mouse.buttons &= ~(1 << e.button); });
    addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  }
  requestLock() { if (!this.locked && this.canvas.requestPointerLock) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignored */ } } }
  exitLock() { if (this.locked) document.exitPointerLock(); }
  isDown(code) { return this.down.has(code) || this.virtual.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  mouseDown(b) { return (this.mouse.buttons & (1 << b)) !== 0 || this.virtual.has('Mouse' + b); }
  mousePressed(b) { return (this.mouse.pressed & (1 << b)) !== 0; }
  // Scripted input (play-test): press = one-frame edge, hold = continuous.
  press(code) { this.pressed.add(code); if (code.startsWith('Mouse')) this.mouse.pressed |= 1 << Number(code.slice(5)); }
  hold(code, on = true) { if (on) this.virtual.add(code); else this.virtual.delete(code); }
  look(dx, dy) { this.mouse.dx += dx; this.mouse.dy += dy; }
  consumeMouse() {
    const s = this.sensitivity * 0.0022;
    const r = { dx: this.mouse.dx * s, dy: this.mouse.dy * s * (this.invertY ? -1 : 1), wheel: this.mouse.wheel };
    this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0;
    return r;
  }
  endFrame() { this.pressed.clear(); this.released.clear(); this.mouse.pressed = 0; }
}
