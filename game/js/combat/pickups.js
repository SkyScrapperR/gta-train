// Floating, rotating, glowing pickups: health, armor, weapons, ammo and cash. Health/armor/weapon pickups respawn.
import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { InstanceBatch } from '../engine/instancing.js';
import { m4, m4fromYPR } from '../core/math.js';
import { groundHeight } from '../world/city-meshes.js';
import { WEAPONS } from './weapons.js';

function meshes(gl) {
  const mk = (fn) => { const b = new MeshBuilder(); fn(b); return b.build(gl, { instanced: true }); };
  return {
    health: mk((b) => { b.style([0.2, 1, 0.4], MAT.EMISSIVE, 2.2).box(0, -0.1, 0, 0.16, 0.5, 0.16).box(0, 0.07, 0, 0.5, 0.16, 0.16); }),
    armor: mk((b) => { b.style([0.3, 0.6, 1.0], MAT.EMISSIVE, 2).bevelBox(0, -0.25, 0, 0.5, 0.55, 0.12, 0.08); b.style([0.9, 0.95, 1], MAT.EMISSIVE, 2).box(0, 0.05, 0.065, 0.16, 0.16, 0.02); }),
    cash: mk((b) => { b.style([0.25, 0.85, 0.35], MAT.EMISSIVE, 1.6).box(0, -0.06, 0, 0.42, 0.12, 0.22); b.style([0.9, 1, 0.9], MAT.EMISSIVE, 1.6).box(0, 0.06, 0, 0.3, 0.02, 0.23); }),
    pistol: mk((b) => { b.style([1, 0.7, 0.2], MAT.EMISSIVE, 1.6).bevelBox(0, 0, 0.05, 0.08, 0.12, 0.45, 0.02).box(0, -0.2, -0.08, 0.07, 0.22, 0.1); }),
    smg: mk((b) => { b.style([1, 0.7, 0.2], MAT.EMISSIVE, 1.6).bevelBox(0, 0, 0.05, 0.1, 0.16, 0.7, 0.02).box(0, -0.22, -0.1, 0.08, 0.24, 0.1).box(0, -0.25, 0.12, 0.07, 0.28, 0.08); }),
    shotgun: mk((b) => { b.style([1, 0.7, 0.2], MAT.EMISSIVE, 1.6).cylinderZ(0, 0.05, 0.1, 0.05, 1.0, 8).bevelBox(0, -0.05, -0.35, 0.1, 0.16, 0.45, 0.02); }),
    bag: mk((b) => { b.style([0.2, 0.5, 0.25], MAT.EMISSIVE, 1.2).sphere(0, 0, 0, 0.35, 0.3, 0.28, 10, 6); b.style([1, 0.85, 0.2], MAT.EMISSIVE, 2).box(0, 0.05, 0.27, 0.15, 0.15, 0.04); }),
    beam: mk((b) => { b.style([1, 1, 1], MAT.SIGNAL).cylinder(0, 0, 0, 0.5, 0.5, 1, 14, { caps: false }); }),
  };
}

const COLORS = { health: [0.2, 1, 0.4], armor: [0.3, 0.6, 1], cash: [0.3, 1, 0.4], pistol: [1, 0.7, 0.2], smg: [1, 0.7, 0.2], shotgun: [1, 0.7, 0.2], bag: [0.3, 1, 0.4] };

export class Pickups {
  constructor(game) {
    this.game = game;
    this.meshes = meshes(game.gl);
    this.batches = {};
    for (const [k, m] of Object.entries(this.meshes)) this.batches[k] = new InstanceBatch(m, { castShadow: false, name: 'pickup_' + k });
    this.list = [];
    this.time = 0;
    this.M = m4();
  }
  add(type, x, z, opts = {}) {
    const p = { type, x, z, y: groundHeight(x, z) + 0.9, active: true, respawn: opts.respawn ?? 0, amount: opts.amount ?? 0, t: 0, id: opts.id, onPick: opts.onPick, life: opts.life ?? Infinity };
    this.list.push(p);
    return p;
  }
  dropCash(x, z, amount) { this.add('cash', x + (Math.random() - 0.5), z + (Math.random() - 0.5), { amount, life: 40 }); }
  placeWorldPickups() {
    const L = this.game.world.landmarks;
    const at = (lm, dx, dz) => [lm.entry.x + dx, lm.entry.z + dz];
    this.add('health', ...at(L.hospital, 4, 0), { respawn: 60 });
    this.add('health', ...at(L.safehouse, 0, -4), { respawn: 60 });
    this.add('armor', ...at(L.police, 0, 6), { respawn: 90 });
    this.add('armor', 640, 190, { respawn: 90 });
    this.add('health', 95, 615, { respawn: 60 });
    this.add('health', 860, 820, { respawn: 60 });
    this.add('pistol', 280, 452, { respawn: 120, amount: 24 });
    this.add('smg', 905, 300, { respawn: 150, amount: 60 });
    this.add('shotgun', 160, 905, { respawn: 150, amount: 12 });
  }
  update(dt) {
    const g = this.game, pl = g.player;
    this.time += dt;
    for (const p of this.list.slice()) {
      p.t += dt;
      if (p.t > p.life) { this.list.splice(this.list.indexOf(p), 1); continue; }
      if (!p.active) { if (p.respawn && p.t > p.respawn) { p.active = true; p.t = 0; } continue; }
      if (!pl.alive || pl.state === 'driving' && p.type !== 'cash') continue;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      if (d > (pl.state === 'driving' ? 2.5 : 1.3)) continue;
      if (!this.collect(p)) continue;
      g.audio?.play('pickup', [p.x, p.y, p.z], 0.8);
      if (p.onPick) p.onPick(p);
      if (p.respawn) { p.active = false; p.t = 0; } else this.list.splice(this.list.indexOf(p), 1);
    }
  }
  collect(p) {
    const g = this.game, pl = g.player;
    switch (p.type) {
      case 'health': if (pl.health >= pl.maxHealth) return false; pl.health = Math.min(pl.maxHealth, pl.health + 50); g.hud?.toast('+ Health', '#5dff8a'); return true;
      case 'armor': if (pl.armor >= 100) return false; pl.armor = 100; g.hud?.toast('+ Armor', '#6fb2ff'); return true;
      case 'cash': g.addMoney(p.amount); return true;
      case 'bag': return true;
      default: {
        const w = WEAPONS[p.type];
        g.weapons.give(p.type, p.amount || w.mag * 2);
        g.hud?.toast(`${w.name} +${p.amount || w.mag * 2}`, '#ffb347');
        return true;
      }
    }
  }
  render() {
    for (const b of Object.values(this.batches)) b.reset();
    const M = this.M;
    for (const p of this.list) {
      if (!p.active) continue;
      const bob = Math.sin(this.time * 2.5 + p.x) * 0.12;
      m4fromYPR(M, p.x, p.y + bob, p.z, this.time * 1.8 + p.z, 0, 0);
      this.batches[p.type].add(M, 1, 1, 1, 1);
    }
  }
  collectLights(out, cam) {
    for (const p of this.list) {
      if (!p.active || Math.abs(p.x - cam[0]) > 70 || Math.abs(p.z - cam[2]) > 70) continue;
      const c = COLORS[p.type] || [1, 1, 1];
      out.push({ x: p.x, y: p.y, z: p.z, radius: 5, r: c[0], g: c[1], b: c[2], intensity: 1.2 });
    }
  }
}
