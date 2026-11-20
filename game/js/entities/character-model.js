// Low-poly humanoids built from tapered cylinders and ellipsoids, with faces, hair meshes and clothing details.
// Parts are shared instanced meshes; each character pushes one instance per body part every frame.
// Animation is procedural: idle breathing, walk/run cycles, aim, punch, hit, death, sitting, phone, chat.
import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { InstanceBatch } from '../engine/instancing.js';
import { m4, m4mul, m4fromYPR, m4copy, lerp, clamp } from '../core/math.js';

const HIP_H = 0.92;

// ---------------------------------------------------------------- part meshes
function buildParts(gl) {
  const P = {};
  const mk = (fn) => { const b = new MeshBuilder(); fn(b); return b.build(gl, { instanced: true }); };
  P.pelvis = mk((b) => {
    b.style([1, 1, 1], MAT.CLOTH).cylinder(0, -0.14, 0, 0.15, 0.155, 0.2, 10, { sx: 1.15, sz: 0.78 });
    b.style([0.12, 0.1, 0.09], MAT.PLAIN).cylinder(0, 0.04, 0, 0.158, 0.158, 0.05, 10, { sx: 1.15, sz: 0.78, caps: false });
    b.style([0.75, 0.62, 0.25], MAT.PLAIN).box(0, 0.04, 0.12, 0.05, 0.05, 0.02);
  });
  const torsoBase = (b, shade = 1) => {
    b.style([shade, shade, shade], MAT.CLOTH);
    b.cylinder(0, 0.06, 0, 0.148, 0.165, 0.22, 10, { sx: 1.18, sz: 0.74, caps: false });
    b.cylinder(0, 0.28, 0, 0.165, 0.19, 0.2, 10, { sx: 1.22, sz: 0.76, caps: false });
    b.cylinder(0, 0.48, 0, 0.19, 0.1, 0.08, 10, { sx: 1.22, sz: 0.76 });
    b.style([1, 1, 1], MAT.SKIN).cylinder(0, 0.5, 0, 0.056, 0.05, 0.14, 8);
  };
  P.torso = mk((b) => {
    torsoBase(b);
    b.style([0.8, 0.8, 0.8], MAT.CLOTH).cylinder(0, 0.535, 0, 0.075, 0.068, 0.04, 8); // collar
    b.style([0.82, 0.82, 0.82], MAT.CLOTH).box(0, 0.06, 0.122, 0.18, 0.12, 0.01); // shirt hem/pocket shade
  });
  P.jacket = mk((b) => {
    torsoBase(b);
    b.style([0.92, 0.92, 0.9], MAT.PLAIN).box(0, 0.1, 0.125, 0.11, 0.42, 0.012); // open front: white tee
    b.style([0.7, 0.7, 0.7], MAT.CLOTH).box(0.065, 0.1, 0.128, 0.015, 0.4, 0.012).box(-0.065, 0.1, 0.128, 0.015, 0.4, 0.012); // zip edges
    b.style([0.85, 0.85, 0.85], MAT.CLOTH);
    b.pushTRS(0.075, 0.5, 0.03, 0, -0.3, 0.25); b.box(0, 0, 0, 0.06, 0.09, 0.14); b.pop(); // raised collar
    b.pushTRS(-0.075, 0.5, 0.03, 0, -0.3, -0.25); b.box(0, 0, 0, 0.06, 0.09, 0.14); b.pop();
    b.style([0.7, 0.7, 0.7], MAT.CLOTH).cylinder(0, 0.06, 0, 0.152, 0.152, 0.04, 10, { sx: 1.19, sz: 0.76, caps: false }); // waistband
  });
  P.uniform = mk((b) => {
    torsoBase(b);
    b.style([0.75, 0.75, 0.78], MAT.CLOTH).cylinder(0, 0.535, 0, 0.075, 0.068, 0.04, 8);
    b.style([0.95, 0.78, 0.2], MAT.PLAIN).bevelBox(0.08, 0.36, 0.13, 0.05, 0.06, 0.015, 0.01); // badge
    b.style([0.8, 0.8, 0.82], MAT.CLOTH).box(-0.08, 0.32, 0.128, 0.07, 0.05, 0.012).box(0.08, 0.26, 0.128, 0.07, 0.05, 0.012); // pockets
    b.style([0.08, 0.08, 0.09], MAT.PLAIN).cylinder(0, 0.06, 0, 0.16, 0.16, 0.06, 10, { sx: 1.19, sz: 0.77, caps: false }); // duty belt
    b.style([0.12, 0.12, 0.12], MAT.PLAIN).box(-0.17, 0.0, 0.0, 0.06, 0.13, 0.09); // holster
    b.style([0.9, 0.9, 0.95], MAT.PLAIN).box(-0.21, 0.4, 0.0, 0.012, 0.06, 0.06); // shoulder patch
  });
  P.head = mk((b) => {
    b.style([1, 1, 1], MAT.SKIN);
    b.sphere(0, 0.13, 0.0, 0.102, 0.122, 0.112, 12, 8);
    b.sphere(0, 0.065, 0.025, 0.088, 0.075, 0.088, 10, 6); // jaw
    b.sphere(0, 0.105, 0.112, 0.018, 0.03, 0.026, 6, 4); // nose
    b.sphere(0.103, 0.115, 0.0, 0.016, 0.03, 0.02, 6, 4).sphere(-0.103, 0.115, 0.0, 0.016, 0.03, 0.02, 6, 4); // ears
    b.style([0.92, 0.92, 0.9], MAT.PLAIN).sphere(0.038, 0.138, 0.093, 0.019, 0.014, 0.01, 8, 4).sphere(-0.038, 0.138, 0.093, 0.019, 0.014, 0.01, 8, 4);
    b.style([0.05, 0.04, 0.03], MAT.PLAIN).sphere(0.038, 0.138, 0.101, 0.009, 0.009, 0.005, 6, 4).sphere(-0.038, 0.138, 0.101, 0.009, 0.009, 0.005, 6, 4);
    b.style([0.12, 0.08, 0.05], MAT.PLAIN);
    b.pushTRS(0.04, 0.166, 0.098, 0, 0, -0.12); b.box(0, 0, 0, 0.048, 0.011, 0.014); b.pop();
    b.pushTRS(-0.04, 0.166, 0.098, 0, 0, 0.12); b.box(0, 0, 0, 0.048, 0.011, 0.014); b.pop();
    b.style([0.45, 0.15, 0.13], MAT.PLAIN).box(0, 0.058, 0.108, 0.046, 0.009, 0.012); // mouth
  });
  const hairCap = (b) => b.sphere(0, 0.18, -0.016, 0.114, 0.082, 0.122, 12, 6);
  P.hair_short = mk((b) => { b.style([1, 1, 1], MAT.CLOTH); hairCap(b); b.sphere(0, 0.12, -0.05, 0.106, 0.09, 0.08, 10, 6); });
  P.hair_bun = mk((b) => { b.style([1, 1, 1], MAT.CLOTH); hairCap(b); b.sphere(0, 0.12, -0.05, 0.106, 0.1, 0.08, 10, 6); b.sphere(0, 0.21, -0.1, 0.055, 0.05, 0.05, 8, 5); });
  P.hair_ponytail = mk((b) => {
    b.style([1, 1, 1], MAT.CLOTH); hairCap(b); b.sphere(0, 0.12, -0.05, 0.106, 0.1, 0.08, 10, 6);
    b.pushTRS(0, 0.16, -0.12, 0, 0.35, 0); b.cylinder(0, -0.22, 0, 0.012, 0.035, 0.22, 7); b.pop();
  });
  P.hair_long = mk((b) => { b.style([1, 1, 1], MAT.CLOTH); hairCap(b); b.sphere(0, 0.06, -0.06, 0.112, 0.16, 0.08, 10, 6); });
  P.hair_cap = mk((b) => {
    b.style([1, 1, 1], MAT.CLOTH); b.sphere(0, 0.18, -0.01, 0.116, 0.085, 0.124, 12, 6);
    b.box(0, 0.165, 0.13, 0.17, 0.012, 0.1);
  });
  P.hair_police = mk((b) => {
    b.style([0.1, 0.12, 0.2], MAT.PLAIN).cylinder(0, 0.17, -0.005, 0.118, 0.13, 0.08, 12, { sz: 1.08 });
    b.style([0.05, 0.05, 0.06], MAT.PLAIN).box(0, 0.168, 0.12, 0.16, 0.012, 0.08);
    b.style([0.95, 0.78, 0.2], MAT.PLAIN).box(0, 0.21, 0.13, 0.035, 0.03, 0.01);
  });
  P.upperArm = mk((b) => {
    b.style([1, 1, 1], MAT.CLOTH).cylinder(0, -0.15, 0, 0.068, 0.072, 0.18, 9).sphere(0, 0.0, 0, 0.072, 0.06, 0.072, 8, 4);
    b.style([1, 1, 1], MAT.SKIN).cylinder(0, -0.3, 0, 0.045, 0.052, 0.17, 8, { caps: false });
  });
  P.upperArmLong = mk((b) => { b.style([1, 1, 1], MAT.CLOTH).cylinder(0, -0.3, 0, 0.055, 0.072, 0.3, 9).sphere(0, 0.0, 0, 0.074, 0.06, 0.074, 8, 4); });
  const hand = (b) => {
    b.style([1, 1, 1], MAT.SKIN).sphere(0, -0.31, 0.005, 0.034, 0.055, 0.024, 8, 5);
    b.sphere(-0.03, -0.29, 0.02, 0.012, 0.03, 0.012, 6, 4);
  };
  P.lowerArm = mk((b) => { b.style([1, 1, 1], MAT.SKIN).cylinder(0, -0.27, 0, 0.036, 0.045, 0.27, 8); hand(b); });
  P.lowerArmLong = mk((b) => { b.style([1, 1, 1], MAT.CLOTH).cylinder(0, -0.25, 0, 0.044, 0.056, 0.25, 8); b.style([0.75, 0.75, 0.75], MAT.CLOTH).cylinder(0, -0.255, 0, 0.046, 0.046, 0.03, 8); hand(b); });
  P.thigh = mk((b) => { b.style([1, 1, 1], MAT.CLOTH).cylinder(0, -0.45, 0, 0.068, 0.092, 0.45, 9).sphere(0, 0, 0, 0.09, 0.05, 0.09, 8, 4); });
  P.shin = mk((b) => {
    b.style([1, 1, 1], MAT.CLOTH).cylinder(0, -0.41, 0, 0.052, 0.068, 0.41, 9);
    b.style([0.12, 0.11, 0.1], MAT.PLAIN).bevelBox(0, -0.47, 0.045, 0.1, 0.07, 0.24, 0.025);
    b.style([0.85, 0.85, 0.82], MAT.PLAIN).box(0, -0.47, 0.045, 0.104, 0.018, 0.244);
  });
  // weapons in gun space: barrel along +z, up +y, grip origin at 0
  P.pistol = mk((b) => {
    b.style([0.12, 0.12, 0.13], MAT.METAL).bevelBox(0, 0.0, 0.07, 0.03, 0.045, 0.19, 0.008);
    b.style([0.2, 0.2, 0.22], MAT.PLAIN).box(0, -0.08, 0.0, 0.028, 0.09, 0.04);
  });
  P.smg = mk((b) => {
    b.style([0.1, 0.1, 0.11], MAT.METAL).bevelBox(0, -0.01, 0.06, 0.04, 0.07, 0.34, 0.01).cylinder(0, 0.025, 0.25, 0.01, 0.01, 0.0, 6);
    b.cylinderZ(0, 0.025, 0.28, 0.012, 0.12, 6);
    b.style([0.2, 0.2, 0.22], MAT.PLAIN).box(0, -0.09, 0.0, 0.03, 0.09, 0.04).box(0, -0.12, 0.1, 0.025, 0.14, 0.035);
  });
  P.shotgun = mk((b) => {
    b.style([0.1, 0.1, 0.11], MAT.METAL).cylinderZ(0, 0.02, 0.3, 0.015, 0.5, 8).cylinderZ(0, -0.005, 0.28, 0.014, 0.4, 8);
    b.style([0.4, 0.26, 0.15], MAT.WOOD).bevelBox(0, -0.04, -0.12, 0.04, 0.08, 0.3, 0.01).box(0, -0.02, 0.2, 0.04, 0.04, 0.14);
  });
  P.phone = mk((b) => { b.style([0.05, 0.05, 0.06], MAT.PLAIN).box(0, 0, 0, 0.04, 0.08, 0.008); b.style([0.3, 0.6, 1.0], MAT.EMISSIVE, 1.5).box(0, 0.005, 0.0045, 0.034, 0.068, 0.001); });
  P.cashbag = mk((b) => { b.style([0.2, 0.35, 0.18], MAT.PLAIN).sphere(0, -0.15, 0, 0.13, 0.15, 0.1, 8, 6); b.style([0.9, 0.8, 0.2], MAT.EMISSIVE, 0.6).box(0, -0.12, 0.09, 0.06, 0.06, 0.02); });
  return P;
}

// ---------------------------------------------------------------- poses
export function makePose() {
  return { hipY: HIP_H, bob: 0, lean: 0, twist: 0, side: 0, headPitch: 0, headYaw: 0, lShP: 0, lShR: 0.08, lEl: 0.15, rShP: 0, rShR: -0.08, rEl: 0.15, lHip: 0, lKnee: 0, rHip: 0, rKnee: 0, bodyPitch: 0, bodyRoll: 0, bodyY: 0, chest: 1 };
}
const POSE_KEYS = Object.keys(makePose());

// Target pose for the animation state; the live pose eases toward it.
export function targetPose(a, out) {
  const t = a.time;
  const p = out;
  Object.assign(p, makePose());
  const mode = a.mode;
  if (mode === 'walk' || mode === 'run' || mode === 'sprint' || mode === 'flee') {
    const run = mode !== 'walk';
    const amp = mode === 'walk' ? 0.42 : mode === 'sprint' ? 0.95 : 0.75;
    const ph = a.phase;
    const s = Math.sin(ph), c = Math.cos(ph);
    p.lHip = -s * amp; p.rHip = s * amp;
    p.lKnee = Math.max(0, -c) * amp * 1.6 + 0.08; p.rKnee = Math.max(0, c) * amp * 1.6 + 0.08;
    p.lShP = s * amp * 0.8; p.rShP = -s * amp * 0.8;
    p.lEl = run ? 1.25 : 0.25; p.rEl = run ? 1.25 : 0.25;
    p.bob = Math.abs(Math.cos(ph)) * (run ? 0.06 : 0.025) - (run ? 0.04 : 0);
    p.lean = run ? (mode === 'sprint' ? 0.26 : 0.14) : 0.03;
    p.twist = -s * (run ? 0.12 : 0.05);
    if (mode === 'flee') { p.lShP = -2.6; p.rShP = -2.6; p.lEl = 0.6; p.rEl = 0.6; p.lShR = 0.4; p.rShR = -0.4; }
  } else if (mode === 'idle' || mode === 'chat' || mode === 'phone') {
    const br = Math.sin(t * 1.6);
    p.chest = 1 + br * 0.012; p.lShR = 0.1 + br * 0.01; p.rShR = -0.1 - br * 0.01; p.headPitch = br * 0.02;
    p.lShP = 0.04; p.rShP = 0.04;
    if (mode === 'chat') {
      p.rShP = -0.5 - Math.max(0, Math.sin(t * 2.3)) * 0.6; p.rEl = 1.2 + Math.sin(t * 3.1) * 0.3; p.rShR = -0.25;
      p.headYaw = Math.sin(t * 0.7) * 0.25; p.headPitch = Math.sin(t * 2.0) * 0.06;
      p.lShP = -0.2 + Math.max(0, Math.sin(t * 1.7 + 1)) * -0.4; p.lEl = 0.9;
    }
    if (mode === 'phone') { p.rShP = -0.4; p.rShR = -0.65; p.rEl = 2.5; p.headYaw = 0.2; p.headPitch = 0.05; }
  } else if (mode === 'aim') {
    const ap = a.aimPitch || 0;
    p.rShP = -Math.PI / 2 - ap; p.rShR = 0.12; p.rEl = 0.02;
    if (a.twoHanded) { p.lShP = -Math.PI / 2 - ap + 0.25; p.lShR = -0.55; p.lEl = 0.55; p.twist = 0.35; p.headYaw = -0.3; }
    else { p.lShP = -1.0 - ap * 0.5; p.lShR = -0.45; p.lEl = 0.9; p.twist = 0.15; }
    p.headPitch = -ap * 0.6;
    p.lHip = -0.12; p.rHip = 0.1; p.lKnee = 0.12; p.rKnee = 0.1;
    if (a.moving) { const s = Math.sin(a.phase); p.lHip += -s * 0.4; p.rHip += s * 0.4; p.lKnee += Math.max(0, -Math.cos(a.phase)) * 0.5; p.rKnee += Math.max(0, Math.cos(a.phase)) * 0.5; }
    // recoil kick
    p.rShP -= (a.recoil || 0) * 0.35; p.rEl += (a.recoil || 0) * 0.3;
  } else if (mode === 'punch') {
    const k = a.punchT; // 0..1
    const hit = Math.sin(clamp(k, 0, 1) * Math.PI);
    const right = a.punchSide !== 1;
    p.lShP = -0.9; p.lEl = 1.6; p.rShP = -0.9; p.rEl = 1.6; p.lShR = -0.2; p.rShR = 0.2;
    if (right) { p.rShP = -0.9 - hit * 0.75; p.rEl = 1.6 - hit * 1.5; p.twist = -0.35 * hit + 0.1; }
    else { p.lShP = -0.9 - hit * 0.75; p.lEl = 1.6 - hit * 1.5; p.twist = 0.35 * hit - 0.1; }
    p.lean = 0.12; p.lHip = -0.25; p.rHip = 0.2; p.lKnee = 0.2; p.rKnee = 0.15;
  } else if (mode === 'sit') {
    p.hipY = 0.0; p.lHip = -1.45; p.rHip = -1.45; p.lKnee = 1.35; p.rKnee = 1.35;
    p.lShP = -0.95; p.rShP = -0.95; p.lEl = 0.5; p.rEl = 0.5; p.lShR = -0.1; p.rShR = 0.1; p.lean = -0.08;
    p.headYaw = a.steer ? -a.steer * 0.25 : 0;
    p.lShP += (a.steer || 0) * 0.25; p.rShP -= (a.steer || 0) * 0.25;
  } else if (mode === 'dead') {
    const k = clamp(a.deadT * 2.2, 0, 1);
    p.bodyPitch = -k * Math.PI / 2 * (a.fallDir || 1);
    p.bodyY = 0.12 * k;
    p.lShP = -0.6 * k; p.rShP = -2.2 * k; p.lShR = 0.6 * k; p.rShR = -0.4 * k; p.lEl = 0.4; p.rEl = 0.3;
    p.lHip = -0.2 * k; p.rHip = 0.1 * k; p.lKnee = 0.5 * k; p.rKnee = 0.1;
    p.headYaw = 0.6 * k; p.bodyRoll = 0.15 * k;
  } else if (mode === 'down') { // knocked down, getting up
    const k = clamp(a.downT, 0, 1);
    p.bodyPitch = -Math.PI / 2 * (1 - k) * (a.fallDir || 1); p.bodyY = 0.12 * (1 - k);
    p.lKnee = 0.6 * (1 - k); p.rKnee = 1.2 * (1 - k); p.lShP = -1.5 * (1 - k);
  } else if (mode === 'jump') {
    p.lHip = -0.6; p.rHip = 0.3; p.lKnee = 1.0; p.rKnee = 0.4; p.lShP = -0.6; p.rShP = 0.4; p.lShR = 0.4; p.rShR = -0.4;
  } else if (mode === 'surrender') {
    p.lShP = -2.9; p.rShP = -2.9; p.lEl = 0.5; p.rEl = 0.5; p.lShR = 0.3; p.rShR = -0.3;
  } else if (mode === 'gesture') { // cutscene talking
    const g = Math.sin(t * 2.1), h = Math.sin(t * 1.3 + 1);
    p.rShP = -0.4 - Math.max(0, g) * 0.7; p.rEl = 1.0 + h * 0.4; p.rShR = -0.3;
    p.lShP = -0.15 - Math.max(0, -g) * 0.5; p.lEl = 0.6 + h * 0.3; p.lShR = 0.2;
    p.headPitch = Math.sin(t * 3.0) * 0.05; p.headYaw = Math.sin(t * 0.6) * 0.2;
    p.chest = 1 + Math.sin(t * 1.6) * 0.012;
  }
  if (a.hitT > 0) { const k = a.hitT; p.lean -= k * 0.5; p.headPitch -= k * 0.4; p.lShP -= k * 0.3; p.rShP -= k * 0.3; }
  return p;
}

export function easePose(cur, target, rate, dt) {
  const k = 1 - Math.exp(-rate * dt);
  for (const key of POSE_KEYS) cur[key] = lerp(cur[key], target[key], k);
}

// ---------------------------------------------------------------- renderer
export class CharacterRenderer {
  constructor(gl) {
    this.parts = buildParts(gl);
    this.batches = {};
    for (const [k, mesh] of Object.entries(this.parts)) this.batches[k] = new InstanceBatch(mesh, { name: 'char_' + k });
    this.m = Array.from({ length: 16 }, () => m4());
    this.tmp = m4();
  }
  begin() { for (const b of Object.values(this.batches)) b.reset(); }
  list() { return Object.values(this.batches); }

  // char: {x,y,z,yaw, look, pose, weapon, held}
  add(ch) {
    const L = ch.look, p = ch.pose;
    const [root, hips, torso, head, a, b2, tmp] = this.m;
    const s = L.height || 1, w = L.width || 1;
    m4fromYPR(root, ch.x, ch.y + p.bodyY, ch.z, ch.yaw, p.bodyPitch, p.bodyRoll, s * w, s, s);
    m4fromYPR(tmp, 0, p.hipY + p.bob, 0, 0, 0, 0);
    m4mul(hips, root, tmp);
    const skin = L.skin;
    const add = (part, M, col, ex = skin) => this.batches[part].add(M, col[0], col[1], col[2], 1, ex[0], ex[1], ex[2], 0);
    add('pelvis', hips, L.pants);
    m4fromYPR(tmp, 0, 0, 0, p.twist, p.lean, p.side, 1, p.chest, 1);
    m4mul(torso, hips, tmp);
    add(L.torso || 'torso', torso, L.shirt);
    m4fromYPR(tmp, 0, 0.62, 0, p.headYaw, p.headPitch, 0);
    m4mul(head, torso, tmp);
    add('head', head, skin);
    if (L.hair && L.hair !== 'none') add('hair_' + L.hair, head, L.hairColor);
    const long = L.torso === 'jacket' || L.torso === 'uniform' || L.longSleeves;
    // arms
    for (const side of [1, -1]) {
      const left = side === 1;
      m4fromYPR(tmp, 0.215 * side, 0.44, 0, 0, left ? p.lShP : p.rShP, left ? p.lShR : p.rShR);
      m4mul(a, torso, tmp);
      add(long ? 'upperArmLong' : 'upperArm', a, L.shirt);
      m4fromYPR(tmp, 0, -0.29, 0, 0, -(left ? p.lEl : p.rEl), 0);
      m4mul(b2, a, tmp);
      add(long ? 'lowerArmLong' : 'lowerArm', b2, L.shirt);
      if (!left) {
        const held = ch.held;
        if (held) {
          m4fromYPR(tmp, 0, -0.31, 0.01, 0, Math.PI / 2, 0);
          m4mul(a, b2, tmp);
          const hb = this.batches[held];
          if (hb) hb.add(a, 1, 1, 1, 1, 0, 0, 0, 0);
        }
      }
    }
    // legs
    for (const side of [1, -1]) {
      const left = side === 1;
      m4fromYPR(tmp, 0.095 * side, -0.02, 0, 0, left ? p.lHip : p.rHip, 0.03 * side);
      m4mul(a, hips, tmp);
      add('thigh', a, L.pants);
      m4fromYPR(tmp, 0, -0.45, 0, 0, left ? p.lKnee : p.rKnee, 0);
      m4mul(b2, a, tmp);
      add('shin', b2, L.pants);
    }
  }
}

// ---------------------------------------------------------------- appearance presets
const SKINS = [[0.93, 0.76, 0.62], [0.82, 0.62, 0.45], [0.68, 0.48, 0.32], [0.52, 0.36, 0.24], [0.4, 0.27, 0.18], [0.96, 0.82, 0.7]];
const HAIRC = [[0.05, 0.04, 0.035], [0.12, 0.08, 0.05], [0.3, 0.2, 0.12], [0.55, 0.45, 0.3], [0.6, 0.6, 0.6]];
const SHIRTS = [[0.85, 0.2, 0.2], [0.2, 0.45, 0.8], [0.95, 0.95, 0.92], [0.95, 0.75, 0.2], [0.3, 0.6, 0.35], [0.9, 0.5, 0.6], [0.25, 0.25, 0.28], [0.95, 0.55, 0.2], [0.5, 0.75, 0.85], [0.7, 0.6, 0.45]];
const PANTS = [[0.15, 0.2, 0.35], [0.12, 0.12, 0.13], [0.45, 0.4, 0.32], [0.25, 0.3, 0.45], [0.6, 0.55, 0.45], [0.3, 0.2, 0.15]];

export function randomLook(rnd, kind = 'civ') {
  const female = rnd.chance(0.45);
  const look = {
    skin: rnd.pick(SKINS), hairColor: rnd.pick(HAIRC),
    hair: female ? rnd.pick(['bun', 'ponytail', 'long', 'long']) : rnd.pick(['short', 'short', 'cap', 'none', 'short']),
    shirt: rnd.pick(SHIRTS), pants: rnd.pick(PANTS), torso: 'torso',
    height: rnd.range(0.93, 1.06) * (female ? 0.96 : 1), width: rnd.range(0.92, 1.1) * (female ? 0.94 : 1),
  };
  if (kind === 'cop') Object.assign(look, { shirt: [0.1, 0.14, 0.32], pants: [0.08, 0.1, 0.2], torso: 'uniform', hair: 'police', width: rnd.range(1.0, 1.1) });
  if (kind === 'gang') Object.assign(look, { shirt: rnd.pick([[0.45, 0.12, 0.6], [0.35, 0.08, 0.5], [0.55, 0.2, 0.7]]), pants: [0.08, 0.08, 0.1], torso: rnd.chance(0.5) ? 'jacket' : 'torso', hair: rnd.pick(['short', 'cap', 'none']), hairColor: [0.05, 0.04, 0.04], width: rnd.range(1.0, 1.12) });
  return look;
}

export const LOOKS = {
  kai: { skin: [0.78, 0.58, 0.42], hairColor: [0.05, 0.04, 0.035], hair: 'short', shirt: [0.05, 0.62, 0.6], pants: [0.14, 0.16, 0.22], torso: 'jacket', height: 1.03, width: 1.05 },
  lin: { skin: [0.85, 0.66, 0.5], hairColor: [0.55, 0.55, 0.55], hair: 'bun', shirt: [0.85, 0.45, 0.2], pants: [0.25, 0.25, 0.3], torso: 'torso', longSleeves: true, height: 0.94, width: 1.02 },
  viktor: { skin: [0.9, 0.75, 0.62], hairColor: [0.15, 0.1, 0.08], hair: 'short', shirt: [0.12, 0.1, 0.14], pants: [0.1, 0.08, 0.12], torso: 'jacket', height: 1.06, width: 1.12 },
  dex: { skin: [0.6, 0.42, 0.28], hairColor: [0.08, 0.06, 0.05], hair: 'cap', shirt: [0.95, 0.85, 0.2], pants: [0.3, 0.35, 0.5], torso: 'torso', height: 0.98, width: 0.92 },
  rendy: { skin: [0.9, 0.74, 0.6], hairColor: [0.75, 0.6, 0.2], hair: 'short', shirt: [0.95, 0.9, 0.3], pants: [0.9, 0.9, 0.88], torso: 'torso', height: 1.0, width: 0.98 },
};
