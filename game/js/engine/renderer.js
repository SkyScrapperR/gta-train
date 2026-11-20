// Frame graph: shadow pass -> sky -> opaque (chunks + instanced batches) -> water -> transparent -> post.
import { createContext, Program, createFullscreen } from './gl.js';
import { LIT_VS, LIT_FS, DEPTH_VS, DEPTH_FS, MAX_LIGHTS } from './shaders/lit.js';
import { WATER_VS, WATER_FS } from './shaders/water.js';
import { PARTICLE_VS, PARTICLE_FS, CONE_FS } from './shaders/particles.js';
import { SkyRenderer } from './sky.js';
import { PostFX } from './post.js';
import { ShadowMap } from './shadows.js';
import { Frustum } from './frustum.js';
import { m4 } from '../core/math.js';

export const QUALITY = {
  low: { shadowSize: 1024, shadowRadius: 70, bloom: false, drawDistance: 420, maxLights: 16, renderScale: 0.7, shadows: true },
  medium: { shadowSize: 2048, shadowRadius: 90, bloom: true, drawDistance: 650, maxLights: 32, renderScale: 0.85, shadows: true },
  high: { shadowSize: 2048, shadowRadius: 110, bloom: true, drawDistance: 900, maxLights: MAX_LIGHTS, renderScale: 1.0, shadows: true },
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = (this.gl = createContext(canvas));
    this.fullscreen = createFullscreen(gl);
    this.progs = {
      lit: new Program(gl, LIT_VS, LIT_FS, 'lit'),
      litInst: new Program(gl, LIT_VS, LIT_FS, 'litInst', '#define INSTANCED 1'),
      depth: new Program(gl, DEPTH_VS, DEPTH_FS, 'depth'),
      depthInst: new Program(gl, DEPTH_VS, DEPTH_FS, 'depthInst', '#define INSTANCED 1'),
      water: new Program(gl, WATER_VS, WATER_FS, 'water'),
      particles: new Program(gl, PARTICLE_VS, PARTICLE_FS, 'particles'),
      cone: new Program(gl, LIT_VS, CONE_FS, 'cone', '#define INSTANCED 1'),
    };
    this.sky = new SkyRenderer(gl, this.fullscreen);
    this.post = new PostFX(gl, this.fullscreen);
    this.shadow = new ShadowMap(gl, 2048);
    this.frustum = new Frustum();
    this.identity = m4();
    this.lightData = new Float32Array(MAX_LIGHTS * 12);
    this.atlas = null;
    this.dummyTex();
    this.stats = { drawCalls: 0, chunks: 0, instances: 0 };
    this.setQuality('medium');
    this.dynamicScale = 1;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
  }

  setQuality(name) {
    this.qualityName = QUALITY[name] ? name : 'medium';
    this.quality = QUALITY[this.qualityName];
    this.shadow.setSize(this.quality.shadowSize);
    this.post.bloomEnabled = this.quality.bloom;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.floor(this.canvas.clientWidth * dpr), ch = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    const s = this.quality.renderScale * this.dynamicScale / Math.max(1, dpr * 0.75);
    this.rw = Math.max(320, Math.floor(cw * Math.min(1, s))); this.rh = Math.max(180, Math.floor(ch * Math.min(1, s)));
    this.post.resize(this.rw, this.rh);
  }

  dummyTex() {
    if (!this._dummy) {
      const gl = this.gl; this._dummy = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this._dummy);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    }
    return this._dummy;
  }
  unbindTextures() {
    const gl = this.gl;
    for (let u = 0; u < 8; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }
  }

  // Sets the uniforms shared by lit programs.
  setCommon(p, f) {
    const e = f.env;
    p.set('uViewProj', f.camera.viewProj).set('uCamPos', f.camera.pos)
      .set('uSunDir', e.lightDir).set('uSunColor', e.sun).set('uSkyColor', e.sky).set('uGroundColor', e.ground).set('uHorizonColor', e.horizon)
      .set('uFogColor', e.fog).set('uFogSunColor', e.fogSun).set('uFogDensity', e.fogDensity).set('uFogHeight', e.fogHeight)
      .set('uTime', f.time).set('uNight', e.night).set('uWet', f.wet || 0).set('uRimColor', e.rim)
      .set('uLightVP', this.shadow.viewProj).set('uShadowOn', this.quality.shadows ? 1 : 0).set('uShadowTexel', 1 / this.shadow.size)
      .set('uLightCount', f.lightCount).set('uLights', this.lightData).set('uAlpha', 1);
    p.tex('uShadowMap', this.shadow.target.depthTex);
    p.tex('uAtlas', this.atlas || this.dummyTex());
  }

  render(f, dt) {
    const gl = this.gl;
    this.resize();
    this.unbindTextures();
    const st = this.stats; st.drawCalls = 0; st.chunks = 0; st.instances = 0;
    this.frustum.setFromMatrix(f.camera.viewProj);
    // ---- lights: nearest N to the camera ----
    const maxL = this.quality.maxLights;
    const lights = f.lights || [];
    const cp = f.camera.pos;
    let list = lights;
    if (lights.length > maxL) {
      for (const l of lights) l._d = (l.x - cp[0]) ** 2 + (l.z - cp[2]) ** 2 - (l.priority || 0) * 4000;
      list = lights.slice().sort((a, b) => a._d - b._d).slice(0, maxL);
    }
    const ld = this.lightData;
    let n = 0;
    for (const l of list) {
      if (n >= maxL) break;
      const o = n * 12;
      ld[o] = l.x; ld[o + 1] = l.y; ld[o + 2] = l.z; ld[o + 3] = l.radius;
      ld[o + 4] = l.r; ld[o + 5] = l.g; ld[o + 6] = l.b; ld[o + 7] = l.intensity;
      if (l.dir) { ld[o + 8] = l.dir[0]; ld[o + 9] = l.dir[1]; ld[o + 10] = l.dir[2]; ld[o + 11] = l.cos; }
      else { ld[o + 8] = 0; ld[o + 9] = -1; ld[o + 10] = 0; ld[o + 11] = -2; }
      n++;
    }
    f.lightCount = n;

    const dd = Math.min(this.quality.drawDistance, f.camera.far || 1e9);
    const chunkVisible = (c) => {
      const cx = (c.min[0] + c.max[0]) / 2, cz = (c.min[2] + c.max[2]) / 2;
      const r = Math.hypot(c.max[0] - c.min[0], c.max[2] - c.min[2]) / 2;
      if (Math.hypot(cx - cp[0], cz - cp[2]) - r > dd) return false;
      return this.frustum.boxVisible(c.min, c.max);
    };

    // ---- shadow pass ----
    if (this.quality.shadows && f.env.lightDir[1] > 0.05) {
      this.shadow.fit(f.focus || f.camera.pos, f.env.lightDir, this.quality.shadowRadius);
      this.shadow.target.bind();
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      gl.cullFace(gl.BACK);
      const R = this.quality.shadowRadius + 60, fx = (f.focus || cp)[0], fz = (f.focus || cp)[2];
      const p = this.progs.depth.use();
      p.set('uViewProj', this.shadow.viewProj).set('uModel', this.identity);
      for (const c of f.chunks) {
        if (c.max[0] < fx - R || c.min[0] > fx + R || c.max[2] < fz - R || c.min[2] > fz + R) continue;
        c.mesh.draw(); st.drawCalls++;
      }
      const pi = this.progs.depthInst.use();
      pi.set('uViewProj', this.shadow.viewProj);
      for (const b of f.batches) if (b.castShadow && b.count) { b.draw(); st.drawCalls++; }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    } else {
      this.shadow.fit(f.focus || cp, [0, 1, 0], this.quality.shadowRadius);
    }

    // ---- scene ----
    this.post.scene.bind();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.sky.draw(f.env, f.camera.invViewProj, f.time);

    gl.enable(gl.CULL_FACE);
    const lit = this.progs.lit.use();
    this.setCommon(lit, f);
    lit.set('uModel', this.identity).set('uInstColor', [1, 1, 1, 1]).set('uInstExtra', [0, 0, 0, 0]);
    for (const c of f.chunks) {
      if (!chunkVisible(c)) continue;
      c.mesh.draw(); st.drawCalls++; st.chunks++;
    }
    const li = this.progs.litInst.use();
    this.setCommon(li, f);
    for (const b of f.batches) if (b.count) { b.draw(); st.drawCalls++; st.instances += b.count; }

    // ---- water ----
    if (f.water) {
      const w = this.progs.water.use();
      w.set('uViewProj', f.camera.viewProj).set('uCamPos', cp).set('uTime', f.time).set('uSunDir', f.env.lightDir).set('uSunColor', f.env.sun)
        .set('uSkyColor', f.env.zenith).set('uHorizonColor', f.env.horizon).set('uNight', f.env.night).set('uWet', f.wet || 0)
        .set('uFogColor', f.env.fog).set('uFogSunColor', f.env.fogSun).set('uFogDensity', f.env.fogDensity).set('uFogHeight', f.env.fogHeight)
        .set('uLights', this.lightData).set('uLightCount', f.lightCount).set('uShoreRect', f.water.rect);
      w.tex('uShore', f.water.shore);
      f.water.mesh.draw(); st.drawCalls++;
    }

    // ---- transparent ----
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    if (f.cones && f.cones.count) {
      gl.blendFunc(gl.ONE, gl.ONE);
      const c = this.progs.cone.use();
      c.set('uViewProj', f.camera.viewProj).set('uCamPos', cp);
      f.cones.draw(); st.drawCalls++;
    }
    const pp = this.progs.particles.use();
    pp.set('uViewProj', f.camera.viewProj).set('uCamPos', cp).set('uCamRight', f.camera.right).set('uCamUp', f.camera.up)
      .set('uSunDir', f.env.lightDir).set('uFogColor', f.env.fog).set('uFogSunColor', f.env.fogSun).set('uFogDensity', f.env.fogDensity).set('uFogHeight', f.env.fogHeight)
      .set('uAmbient', [f.env.sky[0] + f.env.sun[0] * 0.3, f.env.sky[1] + f.env.sun[1] * 0.3, f.env.sky[2] + f.env.sun[2] * 0.3]);
    if (f.particlesAlpha && f.particlesAlpha.count) {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      pp.set('uAdditive', 0);
      f.particlesAlpha.draw(); st.drawCalls++;
    }
    if (f.particlesAdd && f.particlesAdd.count) {
      gl.blendFunc(gl.ONE, gl.ONE);
      pp.set('uAdditive', 1);
      f.particlesAdd.draw(); st.drawCalls++;
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

    // ---- post ----
    this.post.finish(f.post, this.canvas.width, this.canvas.height, dt);
  }
}
