// Instanced batches: one shared mesh drawn many times with per-instance transform, color and extra data.
import { INSTANCE_FLOATS } from './gl.js';

export class InstanceBatch {
  constructor(mesh, { castShadow = true, name = '' } = {}) {
    this.mesh = mesh;
    this.name = name;
    this.castShadow = castShadow;
    this.capacity = 64;
    this.data = new Float32Array(this.capacity * INSTANCE_FLOATS);
    this.count = 0;
    this.dirty = true;
  }
  reset() { this.count = 0; this.dirty = true; }
  ensure(n) {
    if (n <= this.capacity) return;
    while (this.capacity < n) this.capacity *= 2;
    const d = new Float32Array(this.capacity * INSTANCE_FLOATS);
    d.set(this.data);
    this.data = d;
  }
  // matrix: Float32Array(16); color/extra: 4 numbers each.
  add(matrix, r = 1, g = 1, b = 1, a = 1, e0 = 0, e1 = 0, e2 = 0, e3 = 0) {
    this.ensure(this.count + 1);
    const o = this.count * INSTANCE_FLOATS, d = this.data;
    d.set(matrix, o);
    d[o + 16] = r; d[o + 17] = g; d[o + 18] = b; d[o + 19] = a;
    d[o + 20] = e0; d[o + 21] = e1; d[o + 22] = e2; d[o + 23] = e3;
    this.count++;
    this.dirty = true;
    return this.count - 1;
  }
  // Raw write for particles (4 vec4 + color/extra slots).
  addRaw(values) {
    this.ensure(this.count + 1);
    this.data.set(values, this.count * INSTANCE_FLOATS);
    this.count++; this.dirty = true;
  }
  upload() { if (this.dirty && this.count) { this.mesh.uploadInstances(this.data, this.count); } this.dirty = false; }
  draw() { if (this.count) { this.upload(); this.mesh.draw(this.count); } }
}
