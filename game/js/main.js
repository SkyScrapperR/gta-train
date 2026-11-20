import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { computeEnvironment } from './engine/sky.js';
import { World } from './world/world.js';
const canvas = document.getElementById('gl');
const r = new Renderer(canvas);
const q = new URLSearchParams(location.search);
if (q.get('quality')) r.setQuality(q.get('quality'));
const cam = new Camera(); window.__r = r;
const world = new World();
await world.build(r.gl, (p, s) => console.log('load', p.toFixed(2), s));
r.atlas = world.atlas;
const hour = Number(q.get('hour') ?? 17.5);
const c = (q.get('cam') || '450,60,-80,450,0,300').split(',').map(Number);
let t = 0;
function frame() {
  t += 0.016;
  const env = computeEnvironment(hour, Number(q.get('rain') || 0));
  cam.pos = c.slice(0, 3); cam.target = c.slice(3, 6); cam.update(canvas.clientWidth / canvas.clientHeight);
  world.update(0.016, cam.pos, env.night);
  const lights = []; if (!q.has('nolights')) world.collectLights(lights, cam.pos, env.night);
  r.render({ camera: cam, env, time: t, wet: Number(q.get('rain') || 0), chunks: world.chunks, batches: world.batches(), lights, water: world.water,
    post: { exposure: env.exposure, gradeGain: env.gradeGain, gradeLift: env.gradeLift, saturation: env.sat }, focus: cam.target }, 0.016);
  window.__stats = r.stats;
  requestAnimationFrame(frame);
}
frame();
