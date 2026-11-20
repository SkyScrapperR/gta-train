// WebGL2 helpers: context creation, shader programs, meshes (VAOs), instance buffers, render targets.

export const VERTEX_FLOATS = 13; // pos3 normal3 color3 uv2 material2
export const INSTANCE_FLOATS = 24; // mat4 + color4 + extra4
export const ATTR = { pos: 0, normal: 1, color: 2, uv: 3, mat: 4, inst0: 5, instColor: 9, instExtra: 10 };

export function createContext(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const caps = {
    floatTargets: !!gl.getExtension('EXT_color_buffer_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    aniso: gl.getExtension('EXT_texture_filter_anisotropic'),
  };
  gl.caps = caps;
  return gl;
}

function compile(gl, type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    console.warn(lines);
    throw new Error(`Shader compile failed (${name}): ${log}`);
  }
  return sh;
}

// A program wraps a linked shader with cached uniform locations and typed setters.
export class Program {
  constructor(gl, vsSrc, fsSrc, name = 'program', defines = '') {
    this.gl = gl;
    this.name = name;
    const header = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2DShadow;\n' + defines + '\n';
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, header + vsSrc, name + '.vs'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, header + fsSrc, name + '.fs'));
    for (const [k, v] of Object.entries(ATTR)) gl.bindAttribLocation(p, v, 'a_' + k);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Link failed (${name}): ${gl.getProgramInfoLog(p)}`);
    this.handle = p;
    this.uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const base = info.name.replace(/\[0\]$/, '');
      this.uniforms[base] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
    this.textureUnits = {};
    let unit = 0;
    for (const [k, u] of Object.entries(this.uniforms)) {
      if (u.type === gl.SAMPLER_2D || u.type === gl.SAMPLER_2D_SHADOW || u.type === gl.SAMPLER_CUBE) this.textureUnits[k] = unit++;
    }
  }
  use() { this.gl.useProgram(this.handle); return this; }
  set(name, value) {
    const u = this.uniforms[name];
    if (!u) return this;
    const gl = this.gl;
    switch (u.type) {
      case gl.FLOAT: if (u.size > 1) gl.uniform1fv(u.loc, value); else gl.uniform1f(u.loc, value); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(u.loc, value); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(u.loc, value); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(u.loc, value); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(u.loc, false, value); break;
      case gl.INT: case gl.BOOL: gl.uniform1i(u.loc, value); break;
      default: break;
    }
    return this;
  }
  tex(name, texture, target) {
    const unit = this.textureUnits[name];
    if (unit === undefined) return this;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target || gl.TEXTURE_2D, texture);
    gl.uniform1i(this.uniforms[name].loc, unit);
    return this;
  }
}

// Static or dynamic mesh with the standard vertex layout, optionally instanced.
export class Mesh {
  constructor(gl, vertices, indices, { instanced = false, dynamic = false } = {}) {
    this.gl = gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    const attrib = (loc, size, offset) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset * 4); };
    attrib(ATTR.pos, 3, 0); attrib(ATTR.normal, 3, 3); attrib(ATTR.color, 3, 6); attrib(ATTR.uv, 2, 9); attrib(ATTR.mat, 2, 11);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    this.index32 = indices instanceof Uint32Array;
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    this.count = indices.length;
    this.instanced = instanced;
    if (instanced) {
      this.instBuffer = gl.createBuffer();
      this.instCapacity = 0;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuffer);
      const istride = INSTANCE_FLOATS * 4;
      for (let i = 0; i < 4; i++) {
        gl.enableVertexAttribArray(ATTR.inst0 + i);
        gl.vertexAttribPointer(ATTR.inst0 + i, 4, gl.FLOAT, false, istride, i * 16);
        gl.vertexAttribDivisor(ATTR.inst0 + i, 1);
      }
      gl.enableVertexAttribArray(ATTR.instColor); gl.vertexAttribPointer(ATTR.instColor, 4, gl.FLOAT, false, istride, 64); gl.vertexAttribDivisor(ATTR.instColor, 1);
      gl.enableVertexAttribArray(ATTR.instExtra); gl.vertexAttribPointer(ATTR.instExtra, 4, gl.FLOAT, false, istride, 80); gl.vertexAttribDivisor(ATTR.instExtra, 1);
    }
    gl.bindVertexArray(null);
  }
  uploadInstances(data, count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuffer);
    const bytes = count * INSTANCE_FLOATS * 4;
    if (bytes > this.instCapacity) {
      this.instCapacity = Math.max(bytes, this.instCapacity * 2, 4096);
      gl.bufferData(gl.ARRAY_BUFFER, this.instCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, count * INSTANCE_FLOATS);
  }
  draw(instances = 0) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    const type = this.index32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
    if (this.instanced) gl.drawElementsInstanced(gl.TRIANGLES, this.count, type, 0, instances);
    else gl.drawElements(gl.TRIANGLES, this.count, type, 0);
  }
  dispose() {
    const gl = this.gl;
    gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.ibo); if (this.instBuffer) gl.deleteBuffer(this.instBuffer);
    gl.deleteVertexArray(this.vao);
  }
}

// Simple render target with one color attachment and an optional depth attachment.
export class RenderTarget {
  constructor(gl, w, h, { format = 'rgba8', depth = false, filter = 'linear', depthTexture = false, compare = false } = {}) {
    this.gl = gl; this.opts = { format, depth, filter, depthTexture, compare };
    this.resize(w, h);
  }
  resize(w, h) {
    const gl = this.gl, o = this.opts;
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (this.w === w && this.h === h) return;
    this.dispose();
    this.w = w; this.h = h;
    this.fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    const filt = o.filter === 'nearest' ? gl.NEAREST : gl.LINEAR;
    if (o.format !== 'none') {
      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      const fmt = {
        rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE],
        rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
        r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT],
      }[o.format];
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt[0], w, h, 0, fmt[1], fmt[2], null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
    } else {
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    }
    if (o.depthTexture) {
      this.depthTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.depthTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, o.compare ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, o.compare ? gl.LINEAR : gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (o.compare) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      }
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.depthTex, 0);
    } else if (o.depth) {
      this.rbo = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, this.rbo);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.rbo);
    }
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) console.warn('Framebuffer incomplete', o.format, status);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  bind() { const gl = this.gl; gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo); gl.viewport(0, 0, this.w, this.h); }
  dispose() {
    const gl = this.gl;
    if (this.fbo) gl.deleteFramebuffer(this.fbo);
    if (this.texture) gl.deleteTexture(this.texture);
    if (this.depthTex) gl.deleteTexture(this.depthTex);
    if (this.rbo) gl.deleteRenderbuffer(this.rbo);
    this.fbo = this.texture = this.depthTex = this.rbo = null;
  }
}

export function createTextureFromCanvas(gl, canvas, { mipmaps = true, repeat = false } = {}) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    if (gl.caps.aniso) gl.texParameterf(gl.TEXTURE_2D, gl.caps.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return t;
}

// A full-screen triangle VAO with no attributes (vertex shader uses gl_VertexID).
export function createFullscreen(gl) {
  const vao = gl.createVertexArray();
  return { draw() { gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); } };
}
