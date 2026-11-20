// Billboard particles (smoke, fire, sparks, rain streaks, tracers) and additive light cones.
import { FOG_GLSL } from './common.js';

// Instance layout (24 floats): [pos.xyz, size] [color rgba] [vel.xyz, stretch] [type, rot, emissive, softness] + 8 unused.
export const PARTICLE_VS = /* glsl */ `
in vec3 a_pos;
in mat4 a_inst0;
uniform mat4 uViewProj; uniform vec3 uCamPos; uniform vec3 uCamRight; uniform vec3 uCamUp;
out vec2 vQ; out vec4 vCol; out vec4 vInfo; out vec3 vWorld;
void main() {
  vec4 ps = a_inst0[0], col = a_inst0[1], vel = a_inst0[2], info = a_inst0[3];
  vec2 q = a_pos.xy; // -1..1 quad
  vec3 world;
  int ptype = int(info.x + 0.5);
  if (ptype >= 3) {
    // decal lying on a surface with normal vel.xyz, rotated by info.y
    vec3 n = normalize(vel.xyz);
    vec3 t = normalize(abs(n.y) > 0.9 ? cross(n, vec3(1.0, 0.0, 0.0)) : cross(n, vec3(0.0, 1.0, 0.0)));
    vec3 bt = cross(n, t);
    float c = cos(info.y), s = sin(info.y);
    vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    world = ps.xyz + n * 0.02 + (t * r.x * (vel.w > 0.0 ? vel.w : 1.0) + bt * r.y) * ps.w;
  } else if (vel.w > 0.0) {
    // stretched along velocity (rain, tracers, sparks)
    vec3 d = normalize(vel.xyz + vec3(0.0, 0.00001, 0.0));
    vec3 toCam = normalize(uCamPos - ps.xyz);
    vec3 side = normalize(cross(d, toCam));
    world = ps.xyz + side * q.x * ps.w + d * q.y * vel.w;
  } else {
    float c = cos(info.y), s = sin(info.y);
    vec2 r = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
    world = ps.xyz + (uCamRight * r.x + uCamUp * r.y) * ps.w;
  }
  vQ = q; vCol = col; vInfo = info; vWorld = world;
  gl_Position = uViewProj * vec4(world, 1.0);
}`;

export const PARTICLE_FS = /* glsl */ `
in vec2 vQ; in vec4 vCol; in vec4 vInfo; in vec3 vWorld;
out vec4 fragColor;
uniform vec3 uCamPos; uniform vec3 uSunDir; uniform float uAdditive; uniform vec3 uAmbient;
${FOG_GLSL}
void main() {
  float r = length(vQ);
  float a;
  int type = int(vInfo.x + 0.5);
  if (type == 1) a = (1.0 - smoothstep(0.0, 1.0, abs(vQ.x))) * (1.0 - smoothstep(0.6, 1.0, abs(vQ.y))); // streak
  else if (type == 2) a = pow(max(1.0 - r, 0.0), 1.5); // glow
  else if (type >= 3) a = (1.0 - smoothstep(0.5, 1.0, r)) * (0.7 + 0.3 * fract(sin(dot(floor(vQ * 4.0), vec2(12.9, 78.2))) * 43758.5)); // decal
  else a = (1.0 - smoothstep(0.3, 1.0, r)) * (0.75 + 0.25 * sin(vQ.x * 4.0 + vInfo.y * 3.0) * sin(vQ.y * 3.0)); // puff
  a *= vCol.a;
  if (a < 0.003) discard;
  vec3 c = vCol.rgb;
  if (uAdditive < 0.5) {
    c = c * (uAmbient + vInfo.z);
    c = applyFog(c, vWorld, uCamPos, uSunDir);
    fragColor = vec4(c, a);
  } else {
    fragColor = vec4(c * a * (1.0 + vInfo.z), 1.0);
  }
}`;

// Additive volumetric-looking cone (helicopter spotlight, headlight beams). Fades by angle and length.
export const CONE_FS = /* glsl */ `
in vec3 vWorld; in vec3 vNormal; in vec2 vUV; in vec3 vColor; in vec4 vInstColor; in vec4 vExtra;
in vec4 vShadow; in vec3 vLocal; flat in int vMat; flat in float vParam;
out vec4 fragColor;
uniform vec3 uCamPos;
void main() {
  vec3 V = normalize(uCamPos - vWorld);
  float edge = pow(abs(dot(normalize(vNormal), V)), 1.5);
  float along = clamp(vUV.y, 0.0, 1.0);
  float a = edge * (1.0 - along) * (0.4 + 0.6 * along * 2.0);
  a *= smoothstep(0.0, 0.08, along) * 0.9 + 0.1;
  fragColor = vec4(vInstColor.rgb * vInstColor.a * a, 1.0);
}`;
