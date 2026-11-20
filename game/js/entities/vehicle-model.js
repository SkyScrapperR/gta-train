// Low-poly vehicle meshes: lofted, tapered bodies with beveled edges, glass cabins, wheel arches, grilles,
// mirrors, door seams, bumpers and emissive head/tail lights. One instanced mesh per model plus shared wheels.
import { MeshBuilder, MAT } from '../engine/mesh-builder.js';

// Dimensions in meters; z+ is the front of the car, x- is the right-hand (driver) side.
export const VEHICLE_SPECS = {
  kancil: { name: 'Kancil', L: 3.7, W: 1.66, ride: 0.28, belt: 0.9, roof: 1.5, hoodDrop: 0.08, cab: [-1.45, -0.95, 0.55, 1.05], wheelR: 0.3, wheelbase: 2.35, track: 1.42, mass: 900, accel: 9, maxSpeed: 38, grip: 7.5, steer: 0.6, colors: [[0.85, 0.2, 0.2], [0.95, 0.85, 0.3], [0.3, 0.6, 0.85], [0.92, 0.92, 0.9], [0.45, 0.75, 0.4]], seat: [-0.36, 0.38, -0.2] },
  merpati: { name: 'Merpati', L: 4.5, W: 1.8, ride: 0.3, belt: 0.88, roof: 1.42, hoodDrop: 0.1, cab: [-1.75, -1.0, 0.45, 1.05], wheelR: 0.32, wheelbase: 2.7, track: 1.52, mass: 1300, accel: 9.5, maxSpeed: 44, grip: 7, steer: 0.55, colors: [[0.75, 0.75, 0.78], [0.12, 0.13, 0.16], [0.55, 0.12, 0.12], [0.2, 0.3, 0.5], [0.85, 0.85, 0.82], [0.35, 0.4, 0.35]], seat: [-0.38, 0.36, -0.25] },
  taxi: { name: 'Selara Taxi', base: 'merpati', colors: [[0.05, 0.62, 0.6]], taxi: true },
  vesper: { name: 'Vesper GT', L: 4.4, W: 1.92, ride: 0.22, belt: 0.72, roof: 1.18, hoodDrop: 0.12, cab: [-1.6, -0.75, 0.25, 0.95], wheelR: 0.34, wheelbase: 2.6, track: 1.62, mass: 1250, accel: 15, maxSpeed: 62, grip: 8.5, steer: 0.55, colors: [[0.95, 0.8, 0.1]], spoiler: true, seat: [-0.4, 0.28, -0.35], camHeight: 2.1, camDist: 6.4 },
  bajak: { name: 'Bajak', L: 4.8, W: 1.92, ride: 0.32, belt: 1.05, roof: 2.0, hoodDrop: 0.05, cab: [-2.35, -2.3, 1.25, 1.75], wheelR: 0.34, wheelbase: 2.9, track: 1.62, mass: 1900, accel: 7, maxSpeed: 36, grip: 6.5, steer: 0.5, colors: [[0.92, 0.92, 0.9], [0.3, 0.45, 0.6], [0.6, 0.55, 0.4]], seat: [-0.4, 0.5, 0.6], camHeight: 2.9, camDist: 7.6 },
  bison: { name: 'Bison', L: 6.8, W: 2.3, ride: 0.42, belt: 1.25, roof: 2.6, hoodDrop: 0.0, cab: [1.4, 1.5, 2.85, 3.2], wheelR: 0.45, wheelbase: 4.2, track: 1.86, mass: 5000, accel: 5, maxSpeed: 28, grip: 6, steer: 0.45, colors: [[0.9, 0.9, 0.88], [0.15, 0.3, 0.6]], truck: true, seat: [-0.5, 0.75, 2.2], camHeight: 3.8, camDist: 10 },
  police: { name: 'Garuda Patrol', base: 'merpati', colors: [[0.85, 0.85, 0.86]], police: true, accel: 12, maxSpeed: 52, mass: 1450 },
};
for (const [k, s] of Object.entries(VEHICLE_SPECS)) {
  if (s.base) VEHICLE_SPECS[k] = { ...VEHICLE_SPECS[s.base], ...s, key: k };
  else s.key = k;
}
// Wheels sit flush with the body sides and the sills ride above the hubs so the wheels read clearly.
for (const s of Object.values(VEHICLE_SPECS)) {
  s.track = s.W - 0.1;
  const lift = Math.max(0, s.wheelR * 0.95 - s.ride);
  s.ride += lift; s.belt += lift * 0.6; s.roof += lift * 0.5;
  s.seat = [s.seat[0], s.seat[1] + lift * 0.6, s.seat[2]];
}

// Thin slanted box between two points (pillars, struts).
function beam(b, p0, p1, w, h) {
  const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
  const len = Math.hypot(dx, dy, dz);
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  b.pushTRS((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2, yaw, pitch, 0);
  b.box(0, -h / 2, 0, w, h, len);
  b.pop();
}

function addLights(b, s) {
  const { L, W, belt, hoodDrop, ride } = s;
  const fy = belt - hoodDrop - 0.22, ry = belt - 0.2;
  // headlights (two-part, with chrome bezel)
  for (const side of [-1, 1]) {
    b.style([0.7, 0.7, 0.72], MAT.CHROME).box(side * (W / 2 - 0.3), fy - 0.02, L / 2 - 0.035, 0.42, 0.18, 0.06);
    b.style([1, 1, 1], MAT.HEADLIGHT).box(side * (W / 2 - 0.3), fy, L / 2 - 0.01, 0.36, 0.13, 0.04);
    b.style([1, 1, 1], MAT.TAILLIGHT).box(side * (W / 2 - 0.22), ry, -L / 2 + 0.01, 0.38, 0.12, 0.05);
    b.style([1, 0.55, 0.1], MAT.EMISSIVE, 0.4).box(side * (W / 2 - 0.08), fy, L / 2 - 0.12, 0.08, 0.08, 0.06);
  }
  // grille and bumpers
  b.style([0.06, 0.06, 0.07], MAT.PLAIN).box(0, fy - 0.12, L / 2 - 0.02, W * 0.45, 0.2, 0.05);
  b.style([0.65, 0.65, 0.68], MAT.CHROME).box(0, fy - 0.03, L / 2 - 0.0, W * 0.45, 0.025, 0.05);
  b.style([0.08, 0.08, 0.09], MAT.PLAIN).bevelBox(0, ride - 0.02, L / 2 - 0.12, W * 0.96, 0.22, 0.28, 0.06);
  b.bevelBox(0, ride - 0.02, -L / 2 + 0.12, W * 0.96, 0.22, 0.28, 0.06);
  // licence plates
  b.style([0.9, 0.9, 0.85], MAT.PLAIN).box(0, ride + 0.22, -L / 2 - 0.02, 0.5, 0.12, 0.02).box(0, ride + 0.05, L / 2 + 0.03, 0.5, 0.12, 0.02);
}

function addWheelArches(b, s) {
  const { W, wheelbase, wheelR, ride } = s;
  b.style([0.04, 0.04, 0.045], MAT.PLAIN);
  for (const z of [wheelbase / 2, -wheelbase / 2]) for (const side of [-1, 1]) {
    const x = side * (W / 2 + 0.004);
    const R = wheelR + 0.08;
    for (let k = 0; k <= 6; k++) {
      const a = (k / 6) * Math.PI;
      const cz = z + Math.cos(a) * R, cy = ride - 0.05 + wheelR * 0.55 + Math.sin(a) * R * 0.9;
      b.box(x, cy - 0.04, cz, 0.03, 0.09, 0.16);
    }
    // dark wheel well
    b.box(side * (W / 2 - 0.25), ride - 0.05, z, 0.45, wheelR * 1.2, wheelR * 2.1);
  }
}

function addSeams(b, s, cab) {
  const { W, belt, ride } = s;
  b.style([0.05, 0.05, 0.06], MAT.PLAIN);
  for (const side of [-1, 1]) {
    const x = side * (W / 2 + 0.003);
    for (const z of [cab[2] + 0.05, (cab[1] + cab[2]) / 2, cab[1] - 0.05]) b.box(x, ride + 0.12, z, 0.012, belt - ride - 0.14, 0.018);
    b.box(x, ride + 0.5, cab[2] - 0.6, 0.012, 0.025, 0.12); // handle
    b.box(x, ride + 0.5, (cab[1] + cab[2]) / 2 - 0.55, 0.012, 0.025, 0.12);
  }
}

function buildCar(s) {
  const b = new MeshBuilder();
  const { L, W, ride, belt, roof, hoodDrop, cab } = s;
  b.style([1, 1, 1], MAT.CARPAINT);
  if (s.truck) {
    // cab at the front, cargo box behind
    b.loft([
      { z: cab[0] - 0.05, y0: ride, y1: belt + 0.3, w0: W * 0.98, w1: W * 0.96 },
      { z: L / 2 - 0.15, y0: ride, y1: belt + 0.3, w0: W * 0.98, w1: W * 0.96 },
      { z: L / 2, y0: ride + 0.1, y1: belt + 0.2, w0: W * 0.92, w1: W * 0.9 },
    ]);
    b.loft([{ z: cab[0], y0: belt + 0.3, y1: roof, w0: W * 0.96, w1: W * 0.9 }, { z: cab[2], y0: belt + 0.3, y1: roof, w0: W * 0.96, w1: W * 0.9 }, { z: cab[3], y0: belt + 0.3, y1: belt + 0.35, w0: W * 0.96, w1: W * 0.94 }], { sideMat: null });
    b.style([0.03, 0.04, 0.05], MAT.GLASS);
    b.quad([-W * 0.45, belt + 0.38, cab[3] - 0.03], [W * 0.45, belt + 0.38, cab[3] - 0.03], [W * 0.43, roof - 0.12, cab[2] + 0.03], [-W * 0.43, roof - 0.12, cab[2] + 0.03]);
    for (const side of [-1, 1]) b.box(side * W * 0.485, belt + 0.45, (cab[0] + cab[2]) / 2 + 0.15, 0.02, 0.6, 0.9);
    // cargo box (white panels with ribs)
    b.style([0.92, 0.92, 0.9], MAT.PLAIN).bevelBox(0, ride + 0.25, (-L / 2 + cab[0]) / 2 - 0.05, W, s.roof + 0.6 - ride - 0.25, cab[0] + L / 2 - 0.2, 0.06);
    b.style([0.7, 0.7, 0.72], MAT.METAL);
    for (let z = -L / 2 + 0.3; z < cab[0] - 0.3; z += 0.6) for (const side of [-1, 1]) b.box(side * (W / 2 + 0.01), ride + 0.3, z, 0.02, s.roof + 0.45 - ride - 0.25, 0.05);
    b.style([0.1, 0.1, 0.12], MAT.PLAIN).box(0, ride + 0.3, -L / 2 + 0.02, W * 0.9, s.roof + 0.4 - ride - 0.25, 0.04);
  } else {
    // lower body: rear bumper area -> trunk -> doors -> hood -> nose
    b.loft([
      { z: -L / 2, y0: ride + 0.12, y1: belt - 0.08, w0: W * 0.9, w1: W * 0.86 },
      { z: -L / 2 + 0.22, y0: ride, y1: belt, w0: W, w1: W * 0.95 },
      { z: cab[1], y0: ride, y1: belt + 0.02, w0: W, w1: W * 0.95 },
      { z: L / 2 - 0.45, y0: ride, y1: belt - hoodDrop, w0: W, w1: W * 0.94 },
      { z: L / 2, y0: ride + 0.14, y1: belt - hoodDrop - 0.1, w0: W * 0.9, w1: W * 0.84 },
    ]);
    // cabin: rear window, roof, windshield; glass sides
    const glass = [[0.03, 0.04, 0.05], MAT.GLASS], paint = [[1, 1, 1], MAT.CARPAINT];
    const sec = (z, top) => ({ z, y0: belt - 0.005, y1: top ? roof : belt + 0.01, w0: W * 0.93, w1: top ? W * 0.76 : W * 0.9 });
    b.loft([sec(cab[0], false), sec(cab[1], true)], { capStart: false, capEnd: false, sideMat: glass, topMat: glass });
    b.loft([sec(cab[1], true), sec(cab[2], true)], { capStart: false, capEnd: false, sideMat: glass, topMat: paint });
    b.loft([sec(cab[2], true), sec(cab[3], false)], { capStart: false, capEnd: false, sideMat: glass, topMat: glass });
    // pillars (paint strips over the glass)
    b.style([1, 1, 1], MAT.CARPAINT);
    for (const side of [-1, 1]) {
      const xp = side * W * 0.42;
      beam(b, [xp, belt, cab[3]], [side * W * 0.37, roof, cab[2]], 0.07, 0.06); // A-pillar
      beam(b, [xp, belt, cab[0]], [side * W * 0.37, roof, cab[1]], 0.07, 0.09); // C-pillar
      // B-pillar
      b.box(side * W * 0.43, belt, (cab[1] + cab[2]) / 2, 0.04, roof - belt - 0.02, 0.1);
      // side mirrors
      b.bevelBox(side * (W / 2 + 0.08), belt + 0.02, cab[2] + 0.12, 0.18, 0.11, 0.12, 0.03);
    }
    if (s.spoiler) {
      b.style([0.06, 0.06, 0.07], MAT.CARPAINT).box(0, belt + 0.25, -L / 2 + 0.2, W * 0.9, 0.05, 0.32);
      for (const side of [-1, 1]) b.style([0.1, 0.1, 0.1], MAT.PLAIN).box(side * W * 0.32, belt, -L / 2 + 0.22, 0.05, 0.26, 0.12);
      // hood vents / racing stripes
      b.style([0.06, 0.06, 0.07], MAT.CARPAINT).box(0, belt - hoodDrop + 0.0, L / 2 - 0.9, 0.32, 0.03, 1.1);
    }
    if (s.taxi) {
      b.style([0.95, 0.95, 0.9], MAT.PLAIN).bevelBox(0, roof, (cab[1] + cab[2]) / 2, 0.7, 0.22, 0.3, 0.04);
      b.style([1, 0.9, 0.5], MAT.EMISSIVE, 1.6).box(0, roof + 0.05, (cab[1] + cab[2]) / 2, 0.6, 0.12, 0.31);
      b.style([0.95, 0.85, 0.1], MAT.PLAIN);
      for (const side of [-1, 1]) for (let k = 0; k < 8; k++) b.box(side * (W / 2 + 0.004), belt - 0.1, cab[1] + 0.2 + k * 0.32, 0.01, 0.06, 0.16);
    }
    if (s.police) {
      // navy doors and hood stripe, lightbar, push bar
      b.style([0.06, 0.09, 0.22], MAT.PLAIN);
      for (const side of [-1, 1]) b.box(side * (W / 2 + 0.002), ride + 0.14, (cab[1] + cab[2]) / 2, 0.012, belt - ride - 0.2, cab[2] - cab[1] + 0.3);
      b.style([0.95, 0.85, 0.2], MAT.PLAIN);
      for (const side of [-1, 1]) b.box(side * (W / 2 + 0.006), belt - 0.18, (cab[1] + cab[2]) / 2, 0.012, 0.07, cab[2] - cab[1] + 1.3);
      b.style([0.1, 0.1, 0.12], MAT.PLAIN).box(0, roof, (cab[1] + cab[2]) / 2, W * 0.66, 0.06, 0.32);
      b.style([1, 1, 1], MAT.LIGHTBAR);
      const zc = (cab[1] + cab[2]) / 2;
      const lb = (x, u) => { const st = b.vertexCount; b.bevelBox(x, roof + 0.06, zc, W * 0.3, 0.14, 0.28, 0.04); for (let i = st; i < b.vertexCount; i++) b.v[i * 13 + 9] = u; };
      lb(-W * 0.17, 0.2); lb(W * 0.17, 0.8);
      b.style([0.08, 0.08, 0.09], MAT.METAL).box(0, ride + 0.05, L / 2 + 0.12, W * 0.6, 0.45, 0.06).box(0, ride + 0.2, L / 2 + 0.05, W * 0.5, 0.06, 0.15);
      b.style([1, 1, 1], MAT.SIGN, 0.6);
    }
    addSeams(b, s, cab);
  }
  addWheelArches(b, s);
  addLights(b, s);
  // underbody shadow catcher
  b.style([0.02, 0.02, 0.02], MAT.PLAIN).boxMinMax(-W * 0.45, ride - 0.06, -L * 0.42, W * 0.45, ride, L * 0.42, 2);
  return b;
}

export function buildWheel() {
  const b = new MeshBuilder();
  b.style([0.05, 0.05, 0.05], MAT.RUBBER).cylinderX(0, 0, 0, 1, 0.7, 14);
  b.style([0.65, 0.66, 0.7], MAT.CHROME).cylinderX(0, 0, 0, 0.62, 0.72, 10);
  b.style([0.15, 0.15, 0.17], MAT.METAL).cylinderX(0, 0, 0, 0.2, 0.76, 8);
  b.style([0.7, 0.7, 0.74], MAT.CHROME);
  for (let k = 0; k < 5; k++) { b.pushTRS(0, 0, 0, 0, (k / 5) * Math.PI * 2, 0); b.box(0, 0, 0.3, 0.74, 0.12, 0.42); b.pop(); }
  return b;
}

export function buildVehicleMeshes(gl) {
  const meshes = {};
  for (const [k, s] of Object.entries(VEHICLE_SPECS)) meshes[k] = buildCar(s).build(gl, { instanced: true });
  meshes.wheel = buildWheel().build(gl, { instanced: true });
  return meshes;
}

// Police helicopter "Rajawali": fuselage, tail boom, skids; rotors are separate so they can spin.
export function buildHelicopterMeshes(gl) {
  const b = new MeshBuilder();
  b.style([0.12, 0.16, 0.32], MAT.CARPAINT);
  b.loft([
    { z: -1.8, y0: 0.6, y1: 1.6, w0: 1.0, w1: 0.9 },
    { z: 0.2, y0: 0.4, y1: 2.2, w0: 1.8, w1: 1.5 },
    { z: 1.6, y0: 0.5, y1: 2.1, w0: 1.7, w1: 1.3 },
    { z: 2.6, y0: 0.9, y1: 1.4, w0: 0.6, w1: 0.4 },
  ]);
  b.style([0.03, 0.04, 0.05], MAT.GLASS).loft([{ z: 1.0, y0: 1.2, y1: 2.15, w0: 1.72, w1: 1.36 }, { z: 2.4, y0: 1.0, y1: 1.5, w0: 0.9, w1: 0.6 }], { capStart: false });
  b.style([0.92, 0.92, 0.9], MAT.PLAIN).box(0, 1.0, 0.3, 1.82, 0.25, 2.6);
  b.style([0.12, 0.16, 0.32], MAT.CARPAINT).loft([{ z: -6.5, y0: 1.5, y1: 1.85, w0: 0.22, w1: 0.2 }, { z: -1.7, y0: 1.0, y1: 1.9, w0: 0.5, w1: 0.45 }]);
  b.box(0, 1.7, -6.3, 0.12, 1.4, 0.7);
  b.style([0.25, 0.25, 0.28], MAT.METAL).box(0, 2.2, 0, 0.6, 0.35, 1.2).cylinder(0, 2.5, 0, 0.12, 0.12, 0.4, 8);
  for (const side of [-1, 1]) {
    b.box(side * 0.9, 0, 0, 0.08, 0.08, 3.4);
    b.box(side * 0.75, 0.05, 0.8, 0.06, 0.45, 0.06).box(side * 0.75, 0.05, -0.8, 0.06, 0.45, 0.06);
  }
  b.style([1, 0.1, 0.1], MAT.EMISSIVE, 5).sphere(0, 2.3, -6.5, 0.12);
  b.style([0.2, 1, 0.3], MAT.EMISSIVE, 4).sphere(0.95, 1.2, 0.5, 0.08);
  b.style([1, 1, 0.9], MAT.HEADLIGHT).cylinder(0, 0.25, 1.9, 0.18, 0.22, 0.2, 8);
  const body = b.build(gl, { instanced: true });
  const r = new MeshBuilder();
  r.style([0.1, 0.1, 0.11], MAT.METAL);
  for (let k = 0; k < 4; k++) { r.pushTRS(0, 0, 0, (k / 4) * Math.PI * 2); r.box(0, 0, 2.9, 0.3, 0.05, 5.8); r.pop(); }
  r.style([0.3, 0.3, 0.32], MAT.PLAIN).cylinder(0, -0.05, 0, 0.25, 0.2, 0.15, 8);
  const rotor = r.build(gl, { instanced: true });
  const t = new MeshBuilder();
  t.style([0.1, 0.1, 0.11], MAT.METAL);
  for (let k = 0; k < 2; k++) { t.pushTRS(0, 0, 0, 0, (k / 2) * Math.PI); t.box(0, 0, 0.55, 0.04, 0.12, 1.1); t.pop(); }
  const tailRotor = t.build(gl, { instanced: true });
  return { body, rotor, tailRotor };
}

// Spotlight cone: unit cone along -Y (apex at origin, base radius 1 at y=-1). uv.y = 0 at apex, 1 at base.
export function buildConeMesh(gl) {
  const b = new MeshBuilder();
  b.style([1, 1, 1], MAT.PLAIN);
  const n = 20;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p0 = [Math.cos(a0), -1, Math.sin(a0)], p1 = [Math.cos(a1), -1, Math.sin(a1)];
    const i0 = b.vertex(0, 0, 0, Math.cos(a0 + Math.PI / n), 0.3, Math.sin(a0 + Math.PI / n), 0, 0);
    b.vertex(p1[0], p1[1], p1[2], Math.cos(a1), 0.3, Math.sin(a1), 0, 1);
    b.vertex(p0[0], p0[1], p0[2], Math.cos(a0), 0.3, Math.sin(a0), 0, 1);
    b.idx.push(i0, i0 + 1, i0 + 2);
  }
  return b.build(gl, { instanced: true });
}
