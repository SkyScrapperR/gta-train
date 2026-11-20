// The sea: a large wave grid around the island plus a shoreline-distance texture used for foam and shallows.
import { MeshBuilder } from '../engine/mesh-builder.js';
import { LAND, BEACH, FERRY_PIER, EAST_PIER } from './city.js';

export const SHORE_RECT = [-900, -900, 2700, 2700]; // x, z, width, depth
const SEA_Y = -0.35;

export function buildWater(gl) {
  const b = new MeshBuilder();
  // Finer cells near the island, coarse far away (two rings of quads).
  const add = (x0, z0, x1, z1, step) => {
    for (let x = x0; x < x1; x += step) for (let z = z0; z < z1; z += step) {
      const xe = Math.min(x + step, x1), ze = Math.min(z + step, z1);
      // skip cells fully under the island (waves would poke through the streets)
      if (x >= LAND.x0 + 2 && xe <= LAND.x1 - 2 && z >= LAND.z0 + 2 && ze <= BEACH.z0 + 30) continue;
      b.quad([x, SEA_Y, ze], [xe, SEA_Y, ze], [xe, SEA_Y, z], [x, SEA_Y, z]);
    }
  };
  add(-300, -300, 1200, 1250, 12);
  add(-2400, -2400, 3400, -300, 150); add(-2400, 1250, 3400, 3400, 150);
  add(-2400, -300, -300, 1250, 150); add(1200, -300, 3400, 1250, 150);
  return b.build(gl);
}

// Distance-to-land field: 1 at the coast, fading to 0 about 90 m out to sea.
export function buildShoreTexture(gl) {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const rects = [LAND, { x0: BEACH.x0, z0: BEACH.z0, x1: BEACH.x1, z1: BEACH.z0 + 38 }, FERRY_PIER, EAST_PIER];
  const distTo = (x, z) => {
    let d = Infinity;
    for (const r of rects) {
      const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1);
      d = Math.min(d, Math.hypot(dx, dz) * (r === FERRY_PIER || r === EAST_PIER ? 3 : 1));
    }
    return d;
  };
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = SHORE_RECT[0] + (i + 0.5) / N * SHORE_RECT[2], z = SHORE_RECT[1] + (j + 0.5) / N * SHORE_RECT[3];
    const v = Math.max(0, 1 - distTo(x, z) / 90);
    const o = (j * N + i) * 4;
    data[o] = Math.round(v * v * 255); data[o + 1] = 0; data[o + 2] = 0; data[o + 3] = 255;
  }
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
