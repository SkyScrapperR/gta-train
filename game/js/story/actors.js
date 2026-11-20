// Story characters (Mama Lin, Dex, Rendy, Viktor in cutscenes): idle/gesture while talking, walk to points,
// face someone, and ride as passengers.
import { Character } from '../entities/character.js';
import { LOOKS } from '../entities/character-model.js';

export class StoryActor extends Character {
  constructor(game, key, x, z, yaw = 0) {
    super(game, x, z, LOOKS[key], 'story');
    this.key = key; this.yaw = yaw;
    this.goal = null; this.faceTarget = null; this.talking = false; this.invulnerable = true;
    this.mode = 'idle';
  }
  damage(amount, src, dx, dz) { if (this.invulnerable) { this.anim.hitT = 1; return false; } return super.damage(amount, src, dx, dz); }
  walkTo(x, z, run = false, onArrive = null) { this.goal = { x, z, run, onArrive }; }
  think(dt) {
    if (this.vehicle) return; // seat sync handled by the game loop
    if (!this.alive) { this.move(dt, 0, 0, 3); this.updateAnim(dt, 'dead'); return; }
    let vx = 0, vz = 0, mode = this.talking ? 'gesture' : (this.mode === 'phone' ? 'phone' : 'idle');
    if (this.goal) {
      const dx = this.goal.x - this.x, dz = this.goal.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { const f = this.goal.onArrive; this.goal = null; f && f(); }
      else { const sp = this.goal.run ? 4.6 : 1.7; vx = dx / d * sp; vz = dz / d * sp; mode = this.goal.run ? 'run' : 'walk'; this.faceToward(dx, dz, 8, dt); }
    } else if (this.faceTarget) {
      const t = this.faceTarget; this.faceToward(t.x - this.x, t.z - this.z, 5, dt);
    }
    this.move(dt, vx, vz, 10);
    this.updateAnim(dt, mode);
  }
}
