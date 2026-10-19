import * as THREE from 'three';

// One lighting model for the whole world, shared by every material through the same
// uniform objects: a sky/ground hemisphere, a low sun, a few point lights (capsule
// window, lantern, seeker screens), pale rims, height fog, an underwater tint below
// the ice, and a final posterize with ordered dithering, the way the Seeker does its
// gradients and atmosphere.

export const MAX_LIGHTS = 8;

export const U = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.5, -0.8).normalize() },
  uSunColor: { value: new THREE.Color(0.55, 0.55, 0.52) },
  uSkyColor: { value: new THREE.Color(0.62, 0.68, 0.74) },
  uGroundColor: { value: new THREE.Color(0.36, 0.4, 0.46) },
  uRimColor: { value: new THREE.Color(0.25, 0.3, 0.36) },
  uFogColor: { value: new THREE.Color(0.8, 0.85, 0.9) },
  uFogDensity: { value: 0.006 },
  uFogHeight: { value: 0.012 },
  uWaterColor: { value: new THREE.Color(0.07, 0.17, 0.2) },
  uCamPos: { value: new THREE.Vector3() },
  uPointPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -999, 0, 0)) },
  uPointColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  uExposure: { value: 1 },
  uLevels: { value: 44 },
  uEmisBoost: { value: 1 },
  uSense: { value: 0 },           // "glass sight": see life through the ice
  uSenseColor: { value: new THREE.Color(0x91cbde) },
};

export const COMMON = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor, uRimColor, uFogColor, uWaterColor, uCamPos, uSenseColor;
uniform float uFogDensity, uFogHeight, uExposure, uLevels, uEmisBoost, uSense;
uniform vec4 uPointPos[${MAX_LIGHTS}];
uniform vec3 uPointColor[${MAX_LIGHTS}];

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

vec3 lightAt(vec3 pos, vec3 n, vec3 v) {
  float hemi = n.y * 0.5 + 0.5;
  vec3 c = mix(uGroundColor, uSkyColor, hemi);
  float nd = dot(n, uSunDir);
  c += uSunColor * max(nd, 0.0);
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uPointPos[i];
    if (L.w <= 0.0) continue;
    vec3 d = L.xyz - pos;
    float dist = length(d);
    float att = clamp(1.0 - dist / L.w, 0.0, 1.0);
    att *= att;
    c += uPointColor[i] * att * (max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.7 + 0.3);
  }
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c += uRimColor * rim;
  return c;
}

vec3 applyFog(vec3 col, vec3 pos) {
  float dist = length(pos - uCamPos);
  if (pos.y < -0.02) {
    // under the ice: the sea swallows color quickly
    float below = -pos.y;
    float w = 1.0 - exp(-below * 0.11 - dist * 0.006);
    col = mix(col, uWaterColor, clamp(w, 0.0, 0.97));
  }
  float hf = mix(1.0, exp(-max(pos.y, 0.0) * uFogHeight), 0.75);
  float f = 1.0 - exp(-dist * uFogDensity * hf);
  return mix(col, uFogColor, clamp(f, 0.0, 1.0));
}

vec3 finalize(vec3 col) {
  col = clamp(col * uExposure, 0.0, 4.0);
  if (col.r != col.r || col.g != col.g || col.b != col.b) col = vec3(0.0);
  float d = bayer4(gl_FragCoord.xy) - 0.5;
  return floor(col * uLevels + 0.5 + d * 0.9) / uLevels;
}
`;

const WORLD_VERT = /* glsl */ `
attribute float emissive;
varying vec3 vColor;
varying vec3 vWorld;
varying float vEmis;
#ifdef SMOOTH
attribute vec3 onormal;
attribute float cloth;
varying vec3 vN;
varying float vSm;
varying vec3 vLocal;
#endif
#ifdef SWAY
attribute float sway;
uniform float uFlutter;
uniform float uTime;
#endif
#ifdef SWIM
attribute float sway;
uniform float uSwim;
uniform float uTime;
#endif
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef SWAY
  // cloth: moves on the 12 fps grid, trails behind when walking
  float tq = floor(uTime * 12.0) / 12.0;
  float cw = sway * sway;
  p.x += cw * (sin(tq * 4.7 + position.y * 7.0 + position.z * 5.0) * 0.014 + sin(tq * 1.9 + position.y * 3.0) * 0.008) * (0.6 + uFlutter);
  p.z += cw * (cos(tq * 4.1 + position.y * 6.0 + position.x * 5.0) * 0.012 - uFlutter * 0.07);
  p.y += cw * uFlutter * 0.02;
#endif
#ifdef SWIM
  // a swimming wave down the body, stepped on the 12 fps grid
  float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 2.3;
#ifdef USE_INSTANCING
  ph += instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
#endif
  float sq = floor(uTime * 12.0) / 12.0;
  p.x += sin(sq * 7.0 + ph - position.z * 6.5) * sway * sway * uSwim;
#endif
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p;
  vWorld = w.xyz;
  vColor = color;
#ifdef USE_INSTANCING_COLOR
  vColor *= instanceColor;
#endif
  vEmis = emissive;
#ifdef SMOOTH
  vN = mat3(modelMatrix) * onormal;
  vSm = cloth;
  vLocal = position;
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WORLD_FRAG = /* glsl */ `
${COMMON}
varying vec3 vColor;
varying vec3 vWorld;
varying float vEmis;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uSenseTarget;
#ifdef SMOOTH
varying vec3 vN;
varying float vSm;
varying vec3 vLocal;
#endif
void main() {
  vec3 cr = cross(dFdx(vWorld), dFdy(vWorld));
  float cl = length(cr);
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = cl > 1e-12 ? cr / cl : v;     // sliver faces at sphere poles: no NaN
  if (dot(n, v) < 0.0) n = -n;
#ifdef SMOOTH
  // cloth: soft shading from smoothed normals (gear on the same mesh stays faceted)
  if (vSm > 0.5) {
    float sl = length(vN);
    vec3 sn = sl > 1e-6 ? vN / sl : n;
    if (dot(sn, v) < 0.0) sn = -sn;
    n = normalize(mix(n, sn, 0.7));
  }
#endif
  vec3 base = vColor * uTint;
#ifdef SMOOTH
  // a woven grain, fixed to the cloth
  if (vSm > 0.5) {
    vec3 q = floor(vLocal * 28.0);
    float gr = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    base *= 0.975 + 0.045 * gr;
  }
#endif
  vec3 col = base * lightAt(vWorld, n, v) + base * vEmis * uEmisBoost * 1.6;
  col = applyFog(col, vWorld);
  // glass sight: living things beneath the ice glow through it
  if (vWorld.y < -0.05) col = mix(col, uSenseColor * 1.15, uSense * uSenseTarget * 0.85);
  gl_FragColor = vec4(finalize(col), uOpacity);
}
`;

const _cache = new Map();

// Vertex-colored, flat-faceted, lit and fogged. Options: transparent, opacity, tint,
// side, depthWrite.
export function worldMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (!opts.unique && _cache.has(key)) return _cache.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uOpacity: { value: opts.opacity ?? 1 },
      uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) },
      uFlutter: { value: 0 },
      uSwim: { value: opts.swim ?? 0.06 },
      uSenseTarget: { value: opts.senseTarget ?? 0 },
    },
    defines: Object.assign(opts.sway ? { SWAY: '' } : opts.swim !== undefined ? { SWIM: '' } : {}, opts.smooth ? { SMOOTH: '' } : {}),
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    vertexColors: true,
    transparent: !!opts.transparent,
    depthWrite: opts.depthWrite ?? !opts.transparent,
    side: opts.side ?? THREE.FrontSide,
  });
  if (!opts.unique) _cache.set(key, m);
  return m;
}

// Emissive-only (unlit) glow, for lights, eyes, flags of light. Additive when asked.
const GLOW_VERT = /* glsl */ `
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vec4 w = modelMatrix * p;
  vWorld = w.xyz;
  vColor = color;
#ifdef USE_INSTANCING_COLOR
  vColor *= instanceColor;
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GLOW_FRAG = /* glsl */ `
${COMMON}
varying vec3 vColor;
varying vec3 vWorld;
uniform float uOpacity;
uniform vec3 uTint;
uniform float uFogAmount;
void main() {
  vec3 col = vColor * uTint;
  vec3 fogged = applyFog(col, vWorld);
  col = mix(col, fogged, uFogAmount);
  gl_FragColor = vec4(finalize(col), uOpacity);
}
`;
export function glowMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uOpacity: { value: opts.opacity ?? 1 },
      uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) },
      uFogAmount: { value: opts.fog ?? 0.6 },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    vertexColors: true,
    transparent: !!opts.transparent || !!opts.additive,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: opts.depthWrite ?? !(opts.transparent || opts.additive),
    side: opts.side ?? THREE.FrontSide,
  });
}
