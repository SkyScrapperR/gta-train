// Short-lived dynamic lights: muzzle flashes, explosions, impacts. Merged into the frame's light list.
export class FxLights {
  constructor() { this.list = []; }
  flash(x, y, z, color, intensity, radius, life) { this.list.push({ x, y, z, r: color[0], g: color[1], b: color[2], intensity, radius, life, age: 0, priority: 2 }); }
  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) { const l = this.list[i]; l.age += dt; if (l.age >= l.life) this.list.splice(i, 1); } }
  collect(out) {
    for (const l of this.list) { const k = 1 - l.age / l.life; out.push({ x: l.x, y: l.y, z: l.z, radius: l.radius, r: l.r, g: l.g, b: l.b, intensity: l.intensity * k, priority: l.priority }); }
  }
}
