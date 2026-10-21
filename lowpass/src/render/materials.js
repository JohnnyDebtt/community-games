import * as THREE from 'three';

// One lighting model for the whole world, shared by every material through the same
// uniform objects: a sky/ground hemisphere, the sun, a few point lights (the ship's core,
// artifacts, the cabin's lamps), pale rims. After the codex: "assets drawn fully lit",
// colors straight from the palette, form from masses of value and selective pale rims,
// no outlines. Fog is not here: the pipeline's fog pass lays it over everything at once.
// After Soundings' materials (TheSeekerGame/community-games), MIT OR Apache-2.0.

export const MAX_LIGHTS = 8;

export const U = {
  uTime: { value: 0 },
  uAnim: { value: 0 },            // time stepped on the 12 fps grid
  uBeat: { value: 0 },            // beats since start, 78.75 BPM, continuous
  uSunDir: { value: new THREE.Vector3(0.3, 0.4, -0.8).normalize() },
  uSunColor: { value: new THREE.Color(0.5, 0.5, 0.48) },
  uSkyColor: { value: new THREE.Color(0.6, 0.66, 0.72) },
  uGroundColor: { value: new THREE.Color(0.28, 0.31, 0.34) },
  uRimColor: { value: new THREE.Color(0.2, 0.24, 0.28) },
  uFrostColor: { value: new THREE.Color(0x94a6b1) },
  uFrost: { value: 0.5 },
  uWind: { value: 1 },
  uCamPos: { value: new THREE.Vector3() },
  uPointPos: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uPointColor: { value: Array.from({ length: MAX_LIGHTS }, () => new THREE.Color(0, 0, 0)) },
  // analytic fog for things drawn after the fog pass (glows, particles, glass)
  uFogColor: { value: new THREE.Color(0.7, 0.76, 0.8) },
  uFogBase: { value: 0 },
  uFogDensity: { value: 0.01 },
  uFogFalloff: { value: 0.03 },
  uHaze: { value: 0.0012 },
  uPxScale: { value: 300 },       // render pixels per meter at one meter away
};

export const COMMON = /* glsl */ `
uniform float uTime, uAnim, uBeat, uFrost, uWind;
uniform vec3 uSunDir, uSunColor, uSkyColor, uGroundColor, uRimColor, uCamPos, uFrostColor, uFogColor;
uniform float uFogBase, uFogDensity, uFogFalloff, uHaze;
uniform vec4 uPointPos[${MAX_LIGHTS}];
uniform vec3 uPointColor[${MAX_LIGHTS}];

float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

vec3 lightAt(vec3 pos, vec3 n, vec3 v, float ambient) {
  float hemi = n.y * 0.5 + 0.5;
  vec3 c = mix(uGroundColor, uSkyColor, hemi) * ambient;
  c += uSunColor * max(dot(n, uSunDir), 0.0) * ambient;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    vec4 L = uPointPos[i];
    if (L.w <= 0.0) continue;
    vec3 d = L.xyz - pos;
    float dist = length(d);
    float att = clamp(1.0 - dist / L.w, 0.0, 1.0);
    att *= att;
    c += uPointColor[i] * att * (max(dot(n, d / max(dist, 1e-3)), 0.0) * 0.75 + 0.25);
  }
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  c += uRimColor * rim * ambient;
  return c;
}

// Fog along a straight path, in closed form (no noise): for what is drawn after the fog
// pass. Returns transmittance.
float fogTrans(vec3 pos) {
  vec3 d = pos - uCamPos;
  float dist = length(d);
  float y0 = uCamPos.y - uFogBase, y1 = pos.y - uFogBase;
  float k = uFogFalloff;
  float a = exp(-max(y0, 0.0) * k), b = exp(-max(y1, 0.0) * k);
  float avg = abs(y1 - y0) > 0.5 ? abs(a - b) / (k * abs(y1 - y0)) : 0.5 * (a + b);
  avg = max(avg, min(a, b));
  return exp(-(uFogDensity * avg + uHaze) * dist);
}

vec3 flatNormal(vec3 world, vec3 v) {
  vec3 cr = cross(dFdx(world), dFdy(world));
  float cl = length(cr);
  vec3 n = cl > 1e-12 ? cr / cl : v;
  if (dot(n, v) < 0.0) n = -n;
  return n;
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
#endif
#ifdef SWAY
attribute float sway;
uniform float uFlutter;
uniform float uAnim;
#endif
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef SWAY
  float tq = uAnim;
  float cw = sway * sway;
  p.x += cw * (sin(tq * 4.7 + position.y * 7.0 + position.z * 5.0) * 0.014 + sin(tq * 1.9 + position.y * 3.0) * 0.008) * (0.6 + uFlutter);
  p.z += cw * (cos(tq * 4.1 + position.y * 6.0 + position.x * 5.0) * 0.012 - uFlutter * 0.07);
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
#endif
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WORLD_FRAG = /* glsl */ `
${COMMON}
varying vec3 vColor;
varying vec3 vWorld;
varying float vEmis;
uniform vec3 uTint;
uniform float uFogMask, uAmbient, uEmisBoost, uPulse, uReveal;
#ifdef SMOOTH
varying vec3 vN;
varying float vSm;
#endif
void main() {
  // materializing: it appears in the ordered dither, pixel by pixel
  if (uReveal < 1.0 && bayer4(gl_FragCoord.xy) > uReveal) discard;
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = flatNormal(vWorld, v);
#ifdef SMOOTH
  if (vSm > 0.5) {
    float sl = length(vN);
    vec3 sn = sl > 1e-6 ? vN / sl : n;
    if (dot(sn, v) < 0.0) sn = -sn;
    n = normalize(mix(n, sn, 0.7));
  }
#endif
  vec3 base = vColor * uTint;
  float e = vEmis * uEmisBoost * (vEmis > 1.5 ? uPulse : 1.0);
  vec3 col = base * lightAt(vWorld, n, v, uAmbient) + base * e * 1.6;
  gl_FragColor = vec4(col, uFogMask);
}
`;

const _cache = new Map();

// Vertex-colored, flat-faceted, lit. Options: tint, side, fogMask (0 = no fog: the
// cabin's inside), ambient (outside light reaching it), sway/smooth (cloth), unique.
// Emissive above 1.5 follows uPulse (an artifact's beat).
export function worldMaterial(opts = {}) {
  const key = JSON.stringify(opts);
  if (!opts.unique && _cache.has(key)) return _cache.get(key);
  const defines = {};
  if (opts.sway) defines.SWAY = '';
  if (opts.smooth) defines.SMOOTH = '';
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) },
      uFogMask: { value: opts.fogMask ?? 1 },
      uAmbient: { value: opts.ambient ?? 1 },
      uEmisBoost: { value: opts.emis ?? 1 },
      uPulse: { value: 1 },
      uReveal: { value: 1 },
      uFlutter: { value: 0 },
    },
    defines,
    vertexShader: WORLD_VERT,
    fragmentShader: WORLD_FRAG,
    vertexColors: true,
    side: opts.side ?? THREE.FrontSide,
  });
  if (!opts.unique) _cache.set(key, m);
  return m;
}

// ------------------------------------------------------------------ the deep's shells
// What grows below the surface (artifacts/deep*.js) wears a sheen: its stratum's three
// colors in a ramp that runs over it by the angle it is seen at and the place on it (and,
// deeper, runs on its own in time), brightest at its edges; and veins of light that wander
// through it, swelling on its pulse. Lit, dithered in and pulsing like the world material;
// the pattern keeps to the object (its own coordinates), so it never slides.
const DEEP_VERT = /* glsl */ `
attribute float emissive;
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vEmis;
void main() {
  vec4 p = vec4(position, 1.0);
#ifdef USE_INSTANCING
  p = instanceMatrix * p;
#endif
  vLocal = p.xyz;
  vec4 w = modelMatrix * p;
  vWorld = w.xyz;
  vColor = color;
#ifdef USE_INSTANCING_COLOR
  vColor *= instanceColor;
#endif
  vEmis = emissive;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const DEEP_FRAG = /* glsl */ `
${COMMON}
varying vec3 vColor;
varying vec3 vWorld;
varying vec3 vLocal;
varying float vEmis;
uniform vec3 uIrid0, uIrid1, uIrid2, uVeinColor;
uniform float uIrid, uCycle, uSheen, uVein, uVeinScale, uFlow, uPulse, uReveal, uEmisBoost;
vec3 ramp(float k) {
  k = fract(k) * 3.0;
  float f = smoothstep(0.0, 1.0, fract(k));
  if (k < 1.0) return mix(uIrid0, uIrid1, f);
  if (k < 2.0) return mix(uIrid1, uIrid2, f);
  return mix(uIrid2, uIrid0, f);
}
void main() {
  if (uReveal < 1.0 && bayer4(gl_FragCoord.xy) > uReveal) discard;
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = flatNormal(vWorld, v);
  float fr = 1.0 - abs(dot(n, v));
  vec3 ir = ramp(fr * 0.85 + dot(vLocal, vec3(0.011, 0.017, 0.013)) * uSheen + uTime * uCycle);
  vec3 base = mix(vColor, ir, uIrid);
  vec3 col = base * lightAt(vWorld, n, v, 1.0);
  col += ir * uIrid * pow(fr, 2.0) * 0.55;
  if (uVein > 0.0) {
    vec3 q = vLocal * uVeinScale;
    float t = uTime * uFlow;
    float w = sin(q.x + 1.7 * sin(q.z * 0.8 + t)) + sin(q.y * 1.3 + 1.3 * sin(q.x * 0.9 - t)) + sin(q.z * 1.1 + 1.1 * sin(q.y * 0.7 + t * 0.7));
    float vein = 1.0 - smoothstep(0.0, 0.16, abs(w));
    col += uVeinColor * vein * uVein * (0.5 + 0.7 * uPulse);
  }
  float e = vEmis * uEmisBoost * (vEmis > 1.5 ? uPulse : 1.0);
  col += base * e * 1.6;
  gl_FragColor = vec4(col, 1.0);
}
`;
// opts: irid ([3 hex]), amount (of the sheen, 0..1), cycle (its run in time), sheen (how
// much the place on it turns the ramp), veins (0..1), veinColor, veinScale (per meter),
// flow (the veins' drift)
export function deepMaterial(opts = {}) {
  const [a, b, c] = opts.irid || [0x444444, 0x888888, 0xcccccc];
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uIrid0: { value: new THREE.Color(a) },
      uIrid1: { value: new THREE.Color(b) },
      uIrid2: { value: new THREE.Color(c) },
      uIrid: { value: opts.amount ?? 0.6 },
      uCycle: { value: opts.cycle ?? 0 },
      uSheen: { value: opts.sheen ?? 1 },
      uVein: { value: opts.veins ?? 0 },
      uVeinColor: { value: new THREE.Color(opts.veinColor ?? 0xffffff) },
      uVeinScale: { value: opts.veinScale ?? 0.2 },
      uFlow: { value: opts.flow ?? 0.3 },
      uPulse: { value: 1 },
      uReveal: { value: 1 },
      uEmisBoost: { value: 1 },
    },
    vertexShader: DEEP_VERT,
    fragmentShader: DEEP_FRAG,
    vertexColors: true,
    side: opts.side ?? THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ trees
// Instanced conifers: a bend from the foot that grows with height, stepped on the 12 fps
// grid; the foot darker (the forest floor's shade), rime on the faces that look up.
// The forest's detail and its clearings, per tree. Each tree trades one level of detail
// for the next on its own, at its own distance inside a band, dissolving across a few
// meters (screen-door, on the same 4x4 order as everything else), so no block of forest
// ever changes at once. uLod: first band, second band, the band's width, the dissolve's
// length. The artifacts' clearings (render-space x, z, radius, how far gone) dissolve the
// trees standing in them the same way, without rebuilding anything.
export const MAX_CLEARINGS = 8;
export const TREES = {
  uLod: { value: new THREE.Vector4(250, 560, 60, 16) },
  uClear: { value: Array.from({ length: MAX_CLEARINGS }, () => new THREE.Vector4()) },
  uClearN: { value: 0 },
};

const TREE_VERT = /* glsl */ `
uniform float uAnim, uWind;
uniform vec3 uCamPos;
uniform vec4 uLod;
uniform vec4 uClear[${MAX_CLEARINGS}];
uniform int uClearN;
varying vec3 vColor;
varying vec3 vWorld;
varying float vH;
varying float vLo, vHi;
void main() {
  // this tree: where it stands, and a number of its own (from its place in its chunk,
  // which never shifts)
  vec3 base = (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz;
  float hsh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
  float d = length(base.xz - uCamPos.xz);
  float f0 = clamp((d - uLod.x - hsh * uLod.z) / uLod.w, 0.0, 1.0);
  float f1 = clamp((d - uLod.y - hsh * uLod.z) / uLod.w, 0.0, 1.0);
  // drawn where the dither falls in [vLo, vHi): the levels share every pixel between them
#if TREE_LOD == 0
  vLo = f0; vHi = 1.0;
#elif TREE_LOD == 1
  vLo = f1; vHi = f0;
#elif TREE_LOD == 2
  vLo = 0.0; vHi = f1;
#else
  vLo = 0.0; vHi = 1.0;   // the giants: one level, at every distance
#endif
  // not this level's tree: nothing to draw (most of them, in a chunk between two bands)
  if (vHi <= vLo) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float rj = 0.85 + fract(hsh * 7.13 + 0.37) * 0.3;
  for (int i = 0; i < ${MAX_CLEARINGS}; i++) {
    if (i >= uClearN) break;
    vec4 c = uClear[i];
    if (length(base.xz - c.xy) < c.z * rj) vLo = max(vLo, c.w);
  }
  if (vHi <= vLo) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  vec4 p = vec4(position, 1.0);
  vec4 w = modelMatrix * instanceMatrix * p;
  float h = position.y;
  float ph = instanceMatrix[3].x * 0.043 + instanceMatrix[3].z * 0.061;
  float s = sin(uAnim * 1.1 + ph) * 0.55 + sin(uAnim * 2.3 + ph * 1.9) * 0.3;
  float bend = h * h * uWind * 0.55;
  w.x += s * bend;
  w.z += cos(uAnim * 0.9 + ph * 1.3) * bend * 0.6;
  vH = h;
  vColor = color;
#ifdef USE_INSTANCING_COLOR
  // a true grey (the birch's bark) takes the tint's brightness, not its hue
  float grey = step(abs(color.r - color.g) + abs(color.g - color.b), 0.004);
  vColor *= mix(instanceColor, vec3(dot(instanceColor, vec3(0.3333))), grey);
#endif
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const TREE_FRAG = /* glsl */ `
${COMMON}
varying vec3 vColor;
varying vec3 vWorld;
varying float vH;
varying float vLo, vHi;
uniform float uReveal;
void main() {
  float b = bayer4(gl_FragCoord.xy);
  if (b < vLo || b >= vHi || b >= uReveal) discard;
  vec3 v = normalize(uCamPos - vWorld);
  vec3 n = flatNormal(vWorld, v);
  vec3 base = vColor * mix(0.5, 1.0, smoothstep(0.0, 0.75, vH));
  float up = smoothstep(0.55, 0.95, n.y);
  base = mix(base, uFrostColor, clamp(uFrost * up * vH * vH, 0.0, 0.7));
  vec3 col = base * lightAt(vWorld, n, v, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`;
// one material for each level of detail, and one (3) for trees that never change (they
// share every uniform)
const _tree = [];
// (unique: one of its own, to dissolve one chunk's trees into view by uReveal)
export function treeMaterial(lod = 0, unique = false) {
  const make = () => new THREE.ShaderMaterial({
    uniforms: { ...U, ...TREES, uReveal: { value: 1 } },
    defines: { TREE_LOD: lod },
    vertexShader: TREE_VERT,
    fragmentShader: TREE_FRAG,
    vertexColors: true,
  });
  if (unique) return make();
  if (!_tree[lod]) _tree[lod] = make();
  return _tree[lod];
}

// ------------------------------------------------------------------ glows
// Unlit, drawn after the fog pass: lights, flares, motes, glass. Fogged in closed form.
const GLOW_VERT = /* glsl */ `
attribute float emissive;
varying vec3 vColor;
varying vec3 vWorld;
varying float vA;
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
  vA = emissive;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const GLOW_FRAG = /* glsl */ `
${COMMON}
varying vec3 vColor;
varying vec3 vWorld;
varying float vA;
uniform vec3 uTint;
uniform float uOpacity, uFogAmount, uFresnel;
void main() {
  vec3 col = vColor * uTint;
  float a = uOpacity * (vA > 0.0 ? vA : 1.0);
  if (uFresnel > 0.0) {
    vec3 v = normalize(uCamPos - vWorld);
    vec3 n = flatNormal(vWorld, v);
    a *= mix(1.0, pow(1.0 - abs(dot(n, v)), 2.0) * 1.6 + 0.15, uFresnel);
  }
  float T = mix(1.0, fogTrans(vWorld), uFogAmount);
  gl_FragColor = vec4(col * T, a * T);
}
`;
export function glowMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uTint: { value: new THREE.Color(opts.tint ?? 0xffffff) },
      uOpacity: { value: opts.opacity ?? 1 },
      uFogAmount: { value: opts.fog ?? 1 },
      uFresnel: { value: opts.fresnel ?? 0 },
    },
    vertexShader: GLOW_VERT,
    fragmentShader: GLOW_FRAG,
    vertexColors: true,
    transparent: true,
    blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending,
    depthWrite: false,
    side: opts.side ?? THREE.FrontSide,
  });
}

// Camera-facing soft points (motes, steam, snow): THREE.Points with a round falloff.
const POINTS_VERT = /* glsl */ `
uniform float uSize, uPxScale;
attribute float aSize;
attribute float aAlpha;
varying float vAlpha;
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vec4 mv = viewMatrix * w;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, uSize * aSize * uPxScale / max(-mv.z, 0.1));
  vAlpha = aAlpha;
}
`;
const POINTS_FRAG = /* glsl */ `
${COMMON}
uniform vec3 uColor;
uniform float uOpacity, uSoft, uAdd;
varying float vAlpha;
varying vec3 vWorld;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  if (r > 1.0) discard;
  float T = fogTrans(vWorld);
  if (uAdd > 0.5) {
    // a glow: bright at the heart, falling off fast
    float g = pow(1.0 - r, 2.2) * vAlpha * uOpacity;
    gl_FragColor = vec4(uColor * g * T, 1.0);
    return;
  }
  float a = mix(1.0, 1.0 - r * r, uSoft) * vAlpha * uOpacity;
  // dissolve by the ordered dither, as the Seeker does its gradients
  if (a < bayer4(gl_FragCoord.xy) * 0.9) discard;
  gl_FragColor = vec4(uColor * T, 1.0);
}
`;
export function pointsMaterial(opts = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uOpacity: { value: opts.opacity ?? 1 },
      uSize: { value: opts.size ?? 1 },
      uSoft: { value: opts.soft ?? 1 },
      uAdd: { value: opts.additive ? 1 : 0 },
    },
    vertexShader: POINTS_VERT,
    fragmentShader: POINTS_FRAG,
    transparent: !!opts.additive,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
  });
}

// A soft glow at one point (or several), drawn after the fog. size: meters across.
export function halo(color, size, intensity = 1, points = [[0, 0, 0]]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(points.flat(), 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(points.map(() => 1), 1));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(points.map(() => 1), 1));
  const m = pointsMaterial({ color, size, additive: true, opacity: intensity });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}
