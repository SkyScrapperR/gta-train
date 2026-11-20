// Post-processing chain: HDR scene target, bloom (down/upsample), eye adaptation, pause blur and the final composite.
import { Program, RenderTarget } from './gl.js';
import { FULLSCREEN_VS } from './shaders/sky.js';
import { BRIGHT_FS, DOWN_FS, UP_FS, ADAPT_FS, COMPOSITE_FS, COPY_FS } from './shaders/post.js';

const BLOOM_LEVELS = 5;

export class PostFX {
  constructor(gl, fullscreen) {
    this.gl = gl;
    this.fs = fullscreen;
    const hdrFmt = gl.caps.floatTargets ? 'rgba16f' : 'rgba8';
    this.hdrFmt = hdrFmt;
    this.scene = new RenderTarget(gl, 4, 4, { format: hdrFmt, depth: true });
    this.bloom = [];
    for (let i = 0; i < BLOOM_LEVELS; i++) this.bloom.push(new RenderTarget(gl, 4, 4, { format: hdrFmt }));
    this.blur = [new RenderTarget(gl, 4, 4, { format: hdrFmt }), new RenderTarget(gl, 4, 4, { format: hdrFmt }), new RenderTarget(gl, 4, 4, { format: hdrFmt })];
    this.lumSrc = new RenderTarget(gl, 32, 32, { format: hdrFmt });
    const lumFmt = gl.caps.floatTargets ? 'r16f' : 'rgba8';
    this.lum = [new RenderTarget(gl, 1, 1, { format: lumFmt, filter: 'nearest' }), new RenderTarget(gl, 1, 1, { format: lumFmt, filter: 'nearest' })];
    this.lumIndex = 0;
    this.progs = {
      bright: new Program(gl, FULLSCREEN_VS, BRIGHT_FS, 'bright'),
      down: new Program(gl, FULLSCREEN_VS, DOWN_FS, 'down'),
      up: new Program(gl, FULLSCREEN_VS, UP_FS, 'up'),
      adapt: new Program(gl, FULLSCREEN_VS, ADAPT_FS, 'adapt'),
      composite: new Program(gl, FULLSCREEN_VS, COMPOSITE_FS, 'composite'),
      copy: new Program(gl, FULLSCREEN_VS, COPY_FS, 'copy'),
    };
    this.bloomEnabled = true;
    this.autoExposure = true;
  }
  resize(w, h) {
    this.scene.resize(w, h);
    let bw = w >> 1, bh = h >> 1;
    for (const b of this.bloom) { b.resize(bw, bh); bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
    this.blur[0].resize(w >> 1, h >> 1); this.blur[1].resize(w >> 2, h >> 2); this.blur[2].resize(w >> 3, h >> 3);
  }
  pass(prog, target, src, extra = {}) {
    const gl = this.gl;
    for (let u = 0; u < 4; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }
    target.bind();
    prog.use().tex('uSrc', src.texture).set('uTexel', [1 / src.w, 1 / src.h]);
    for (const [k, v] of Object.entries(extra)) prog.set(k, v);
    this.fs.draw();
  }
  // Runs after the scene has been rendered into this.scene.
  finish(params, screenW, screenH, dt) {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    const P = this.progs;
    if (this.bloomEnabled) {
      this.pass(P.bright, this.bloom[0], this.scene, { uThreshold: params.bloomThreshold ?? 1.1 });
      for (let i = 1; i < BLOOM_LEVELS; i++) this.pass(P.down, this.bloom[i], this.bloom[i - 1]);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = BLOOM_LEVELS - 1; i > 0; i--) this.pass(P.up, this.bloom[i - 1], this.bloom[i], { uWeight: 1.0 });
      gl.disable(gl.BLEND);
    }
    // eye adaptation
    this.pass(P.copy, this.lumSrc, this.scene);
    const prev = this.lum[this.lumIndex], next = this.lum[1 - this.lumIndex];
    for (let u = 0; u < 4; u++) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, null); }
    next.bind();
    P.adapt.use().tex('uSrc', this.lumSrc.texture).tex('uPrev', prev.texture).set('uRate', Math.min(1, dt * 1.5));
    this.fs.draw();
    this.lumIndex = 1 - this.lumIndex;
    // pause blur
    const blurMix = params.blur || 0;
    if (blurMix > 0) {
      this.pass(P.down, this.blur[0], this.scene);
      this.pass(P.down, this.blur[1], this.blur[0]);
      this.pass(P.down, this.blur[2], this.blur[1]);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, screenW, screenH);
    const c = P.composite.use();
    c.tex('uScene', this.scene.texture).tex('uBloom', this.bloom[0].texture).tex('uBlur', this.blur[2].texture).tex('uLum', next.texture);
    c.set('uBloomStrength', this.bloomEnabled ? (params.bloomStrength ?? 0.55) : 0)
      .set('uExposure', params.exposure ?? 1).set('uAutoExposure', this.autoExposure ? (params.autoExposure ?? 0.6) : 0)
      .set('uGradeLift', params.gradeLift || [0, 0, 0]).set('uGradeGain', params.gradeGain || [1, 1, 1])
      .set('uSaturation', params.saturation ?? 1).set('uContrast', params.contrast ?? 1.05)
      .set('uVignette', params.vignette ?? 0.35).set('uDesat', params.desat || 0).set('uBlurMix', blurMix)
      .set('uFlash', params.flash || 0).set('uFlashColor', params.flashColor || [1, 1, 1]).set('uTime', params.time || 0);
    this.fs.draw();
    gl.enable(gl.DEPTH_TEST);
  }
}
