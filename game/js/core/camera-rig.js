// Gameplay camera: third-person over-the-shoulder on foot, chase camera in cars, scripted cutscene shots
// and the title flythrough. Collides with buildings so it never clips through walls.
import { clamp, damp, dampAngle, lerp, wrapAngle, v3lerp } from './math.js';

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera;
    this.world = world;
    this.yaw = 0; this.pitch = 0.18;
    this.dist = 5.2;
    this.aimBlend = 0;
    this.pos = [0, 10, 0]; this.look = [0, 0, 0];
    this.fov = 62;
    this.lastMouse = 0;
    this.shake = 0;
    this.carYawOffset = 0;
    this.shot = null; // cutscene shot
    this.snap = true;
  }
  addShake(v) { this.shake = Math.min(1.5, this.shake + v); }

  collide(px, py, pz, cx, cy, cz) {
    const dx = cx - px, dy = cy - py, dz = cz - pz, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return [cx, cy, cz];
    const hit = this.world.collision.raycast(px, py, pz, dx / len, dy / len, dz / len, len + 0.3, { ground: true, circles: false });
    if (hit) {
      const t = Math.max(0.4, hit.t - 0.35);
      return [px + dx / len * t, Math.max(py + dy / len * t, 0.4), pz + dz / len * t];
    }
    return [cx, Math.max(cy, 0.3), cz];
  }

  updateFoot(dt, player, mouse, aiming) {
    this.yaw -= mouse.dx; this.pitch = clamp(this.pitch + mouse.dy, -0.9, 1.1);
    this.aimBlend = damp(this.aimBlend, aiming ? 1 : 0, 12, dt);
    const a = this.aimBlend;
    const dist = lerp(5.4, 3.5, a);
    const shoulder = lerp(0.35, 0.85, a);
    const height = lerp(1.75, 1.62, a) * (player.look.height || 1);
    const px = player.x, py = player.y + height, pz = player.z;
    const fx = Math.sin(this.yaw) * Math.cos(this.pitch), fy = -Math.sin(this.pitch), fz = Math.cos(this.yaw) * Math.cos(this.pitch);
    const rx = -Math.cos(this.yaw), rz = Math.sin(this.yaw); // camera right (screen right)
    // pivot sits over the shoulder; the camera looks past the character so it sits left of center when aiming
    const pivX = px + rx * shoulder, pivZ = pz + rz * shoulder;
    let cx = pivX - fx * dist, cy = py - fy * dist + 0.25, cz = pivZ - fz * dist;
    [cx, cy, cz] = this.collide(px, py, pz, cx, cy, cz);
    const k = this.snap ? 1 : 1 - Math.exp(-25 * dt);
    this.pos = v3lerp(this.pos, [cx, cy, cz], k);
    this.look = [cx + fx * 10, cy + fy * 10, cz + fz * 10];
    this.fov = lerp(64, 52, a);
    this.snap = false;
  }

  updateCar(dt, car, mouse) {
    const now = performance.now() / 1000;
    if (Math.abs(mouse.dx) + Math.abs(mouse.dy) > 0.0005) { this.lastMouse = now; this.carYawOffset -= mouse.dx; this.pitch = clamp(this.pitch + mouse.dy, -0.3, 0.9); }
    if (now - this.lastMouse > 1.5) { this.carYawOffset = damp(this.carYawOffset, 0, 3, dt); this.pitch = damp(this.pitch, 0.2, 2, dt); }
    const speed = Math.abs(car.speed);
    // follow the velocity direction when moving forward, the heading otherwise
    const heading = car.yaw + (car.forwardSpeed < -1 ? 0 : 0);
    const targetYaw = heading + this.carYawOffset;
    this.yaw = this.snap ? targetYaw : dampAngle(this.yaw, targetYaw, 5, dt);
    const spec = car.spec;
    const dist = (spec.camDist || 6.8) + speed * 0.04;
    const h = (spec.camHeight || 2.4) + this.pitch * 3;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const px = car.x, py = car.y + 1.3, pz = car.z;
    let cx = px - fx * dist, cy = py + h - 1.0, cz = pz - fz * dist;
    [cx, cy, cz] = this.collide(px, py + 0.5, pz, cx, cy, cz);
    const k = this.snap ? 1 : 1 - Math.exp(-12 * dt);
    this.pos = v3lerp(this.pos, [cx, cy, cz], k);
    this.look = [px + fx * 4, py + 0.4, pz + fz * 4];
    this.fov = damp(this.fov, 60 + Math.min(speed, 45) * 0.42, 3, dt);
    this.snap = false;
  }

  // Cutscene shot: {type:'dolly'|'orbit'|'static', from, to, target, targetTo, center, radius, height, a0, a1, dur, fov}
  updateShot(dt, t) {
    const s = this.shot;
    if (!s) return;
    const k = clamp(t / s.dur, 0, 1);
    const e = k * k * (3 - 2 * k);
    if (s.type === 'orbit') {
      const a = lerp(s.a0, s.a1, e);
      this.pos = [s.center[0] + Math.sin(a) * s.radius, s.center[1] + s.height + (s.rise || 0) * e, s.center[2] + Math.cos(a) * s.radius];
      this.look = s.target || [s.center[0], s.center[1] + 1.4, s.center[2]];
    } else {
      this.pos = v3lerp(s.from, s.to || s.from, e);
      this.look = v3lerp(s.target, s.targetTo || s.target, e);
    }
    this.fov = s.fov || 50;
  }

  apply(dt, aspect, time) {
    const c = this.cam;
    let sx = 0, sy = 0;
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.35;
      sx = (Math.sin(time * 71) + Math.sin(time * 37)) * s * 0.5;
      sy = (Math.sin(time * 63 + 1) + Math.sin(time * 29)) * s * 0.5;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    c.pos = [this.pos[0] + sx * 0.2, this.pos[1] + sy * 0.2, this.pos[2]];
    c.target = [this.look[0] + sx, this.look[1] + sy, this.look[2]];
    c.fov = this.fov * Math.PI / 180;
    c.update(aspect);
  }
}
