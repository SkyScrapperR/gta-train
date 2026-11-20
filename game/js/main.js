import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { MeshBuilder, MAT } from './engine/mesh-builder.js';
import { computeEnvironment } from './engine/sky.js';
const canvas = document.getElementById('gl');
const r = new Renderer(canvas); if (location.search.includes('noshadow')) r.quality = {...r.quality, shadows:false};
const cam = new Camera();
const b = new MeshBuilder();
b.style([0.3,0.3,0.3], MAT.ASPHALT).boxMinMax(-100,-0.1,-100,100,0,100);
for (let i=0;i<20;i++) b.style([0.6,0.55,0.5], i%2?MAT.WALL_GLASS:MAT.WALL_PUNCHED, i).box((i%5)*30-60, 0, Math.floor(i/5)*30-40, 16, 20+i*4, 16);
const mesh = b.build(r.gl, {});
const chunks=[{mesh, min:mesh.bounds.min, max:mesh.bounds.max}];
const hour = Number(new URLSearchParams(location.search).get('hour') ?? 17.5);
let t=0;
function frame(){ t+=0.016; const env=computeEnvironment(hour,0); cam.pos=[90,40,90]; cam.target=[0,10,0]; cam.update(canvas.clientWidth/canvas.clientHeight);
 r.render({camera:cam, env, time:t, chunks, batches:[], lights:[{x:0,y:3,z:0,radius:30,r:1,g:0.3,b:0.8,intensity:4}], post:{exposure:env.exposure, gradeGain:env.gradeGain, gradeLift:env.gradeLift, saturation:env.sat}, focus:[0,0,0]}, 0.016);
 requestAnimationFrame(frame);}
if (location.search.includes('glcheck')) { const gl=r.gl; const od=gl.drawElements.bind(gl); const oi=gl.drawElementsInstanced.bind(gl); let cur=null; const ou=gl.useProgram.bind(gl); gl.useProgram=(p)=>{cur=p;ou(p)};
 const chk=(n)=>{const e=gl.getError(); if(e) console.log('GLERR', n, e, Object.values(r.progs).concat([r.sky.prog, ...Object.values(r.post.progs)]).find(x=>x.handle===cur)?.name);};
 gl.drawElements=(...a)=>{od(...a);chk('de')}; gl.drawElementsInstanced=(...a)=>{oi(...a);chk('dei')}; }
frame();
