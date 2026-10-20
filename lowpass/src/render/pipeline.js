import * as THREE from 'three';
import { COMMON, U } from './materials.js';

// The frame, in four passes at a low resolution that the browser scales up by a whole
// number with nearest-neighbor sampling (the Seeker's pixel look, and a tiny GPU bill):
//
//   A  the opaque world, into a color target with a depth texture. Alpha carries the
//      fog mask: 0 for the cabin's inside, which no fog reaches.
//   B  fog and sky, full screen: the sky where nothing was drawn, then a short march
//      through a drifting, height-layered fog (thick in the valleys, thin over the
//      ridges), lit by the sky, the sun's glow and the artifacts' lights in closed form.
//      It writes the scene's depth back, so...
//   C  ...glows, motes and glass are drawn on top with depth testing, fogged in closed form.
//   D  grade, a little bloom, drowsiness and blinks, posterize with ordered dithering.

THREE.ColorManagement.enabled = false;

export const LAYER_WORLD = 0;
export const LAYER_FX = 1;

// --------------------------------------------------------------- a tileable 3D noise
function noiseTexture(size = 64) {
  const data = new Uint8Array(size * size * size);
  const octaves = [[8, 0.62, 11], [16, 0.38, 29]];
  const acc = new Float32Array(size * size * size);
  for (const [cells, amp, seed] of octaves) {
    const L = new Float32Array(cells * cells * cells);
    let s = seed * 2654435761 >>> 0;
    for (let i = 0; i < L.length; i++) {
      s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      L[i] = (s >>> 0) / 4294967296;
    }
    const at = (x, y, z) => L[((z % cells) * cells + (y % cells)) * cells + (x % cells)];
    const step = size / cells;
    for (let z = 0; z < size; z++) {
      const fz = z / step, iz = Math.floor(fz), tz = fz - iz, sz = tz * tz * (3 - 2 * tz);
      for (let y = 0; y < size; y++) {
        const fy = y / step, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < size; x++) {
          const fx = x / step, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
          const c00 = at(ix, iy, iz) + (at(ix + 1, iy, iz) - at(ix, iy, iz)) * sx;
          const c10 = at(ix, iy + 1, iz) + (at(ix + 1, iy + 1, iz) - at(ix, iy + 1, iz)) * sx;
          const c01 = at(ix, iy, iz + 1) + (at(ix + 1, iy, iz + 1) - at(ix, iy, iz + 1)) * sx;
          const c11 = at(ix, iy + 1, iz + 1) + (at(ix + 1, iy + 1, iz + 1) - at(ix, iy + 1, iz + 1)) * sx;
          const c0 = c00 + (c10 - c00) * sy, c1 = c01 + (c11 - c01) * sy;
          acc[(z * size + y) * size + x] += (c0 + (c1 - c0) * sz) * amp;
        }
      }
    }
  }
  for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, Math.round(acc[i] * 255)));
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// --------------------------------------------------------------- the fog and sky pass
export const FOG = {
  tNoise: { value: null },
  uProjInv: { value: new THREE.Matrix4() },
  uViewInv: { value: new THREE.Matrix4() },
  uNoiseOff: { value: new THREE.Vector3() },
  uSkyTop: { value: new THREE.Color(0x46566d) },
  uSkyHorizon: { value: new THREE.Color(0xbeced8) },
  uSkyGlow: { value: new THREE.Color(0.3, 0.28, 0.26) },
  uFogLow: { value: new THREE.Color(0x5d666d) },
  uFogNoise: { value: 0.7 },
  uFogDrift: { value: new THREE.Vector3(6, 0.6, 3) },
  uNight: { value: 0 },
  uAurora: { value: 0 },
  uAuroraPulse: { value: 0 },
  uCloud: { value: 0.6 },
  uCloudColor: { value: new THREE.Color(0x8d9fae) },
  uSunVis: { value: 1 },
  tCanopy: { value: null },
  uCanopyOff: { value: new THREE.Vector2() },
  uCloudH: { value: 720 },
  uCloudCover: { value: 0.5 },     // 0 clear .. 1 closed
  uCloudShadow: { value: 0.8 },
  uShafts: { value: 1 },           // 0 turns the sun's shadows off (slow machines)
  uSunPower: { value: 1 },
  uFogLights: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uFogLightColor: { value: Array.from({ length: 4 }, () => new THREE.Color(0, 0, 0)) },
  uSteps: { value: 12 },
};

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FOG_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
${COMMON}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler3D tNoise;
uniform sampler2D tCanopy;
uniform mat4 uProjInv, uViewInv;
uniform vec3 uNoiseOff, uSkyTop, uSkyHorizon, uSkyGlow, uFogLow, uFogDrift, uCloudColor;
uniform vec2 uCanopyOff;
uniform float uFogNoise, uNight, uAurora, uAuroraPulse, uCloud, uSunVis, uCloudH, uCloudCover, uCloudShadow, uShafts, uSunPower;
uniform vec4 uFogLights[4];
uniform vec3 uFogLightColor[4];
uniform int uSteps;
varying vec2 vUv;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float heightProfile(float y) {
  float h = y - uFogBase;
  return h < 0.0 ? 1.0 + min(-h * 0.012, 0.8) : exp(-h * uFogFalloff);
}

float density(vec3 p) {
  vec3 q = (p + uNoiseOff) * vec3(0.0031, 0.0055, 0.0031) + uFogDrift * uTime * 0.001;
  float n = texture(tNoise, q).r * 0.65 + texture(tNoise, q * 2.71 + 0.37).r * 0.35;
  float m = max(0.0, 1.0 + (n - 0.5) * 2.6 * uFogNoise);
  return uFogDensity * heightProfile(p.y) * m + uHaze;
}

// the cloud deck, by place: one field for the sky and for the shadows it casts
float cloudCover(vec2 xz) {
  vec2 q = (xz + uNoiseOff.xz) * 0.00042 + vec2(uTime * 0.0021, uTime * 0.0009);
  float c = texture(tNoise, vec3(q, 0.37)).r * 0.62 + texture(tNoise, vec3(q * 2.6, 0.61)).r * 0.38;
  return smoothstep(0.62 - uCloudCover * 0.5, 0.74 - uCloudCover * 0.32, c);
}

float canopyAt(vec2 xz) {
  return texture(tCanopy, (xz + uCanopyOff) / 2048.0).r * 318.75 - 128.0;
}

// how much sun reaches a point of the fog: past the crowns and ridges toward the sun,
// and through the gaps in the clouds
float sunVis(vec3 p, float dist) {
  float v = 1.0;
  if (uShafts > 0.5 && dist < 1400.0) {
    float t = 5.0;
    float occ = 0.0;
    for (int k = 0; k < 6; k++) {
      vec3 q = p + uSunDir * t;
      occ = max(occ, smoothstep(-2.0, 4.0, canopyAt(q.xz) - q.y) * (1.0 - float(k) * 0.08));
      t *= 2.15;
    }
    v *= 1.0 - occ * (1.0 - smoothstep(900.0, 1400.0, dist));
  }
  float tc = (uCloudH - p.y) / max(uSunDir.y, 0.04);
  vec3 c = p + uSunDir * tc;
  v *= 1.0 - cloudCover(c.xz) * uCloudShadow * smoothstep(0.06, 0.22, uSunDir.y);
  return v;
}

// sunlight on a surface: long shadows of crowns and ridges when the sun is low, and the
// cloud deck's shadows rolling over the forest, in stepped bands as pixel art draws light
float surfVis(vec3 p) {
  float v = 1.0;
  if (uShafts > 0.5) {
    float t = 7.0, occ = 0.0;
    for (int k = 0; k < 5; k++) {
      vec3 q = p + uSunDir * t;
      occ = max(occ, smoothstep(1.5, 6.0, canopyAt(q.xz) - q.y));
      t *= 2.2;
    }
    v *= 1.0 - occ;
  }
  float tc = (uCloudH - p.y) / max(uSunDir.y, 0.04);
  vec3 c = p + uSunDir * tc;
  float cv = floor(cloudCover(c.xz) * 4.0 + 0.5) / 4.0;
  v *= 1.0 - cv * smoothstep(0.06, 0.22, uSunDir.y);
  return v;
}

vec3 skyColor(vec3 d) {
  float e = clamp(d.y, -1.0, 1.0);
  float t = pow(clamp(e, 0.0, 1.0), 0.55);
  vec3 c = mix(uSkyHorizon, uSkyTop, t);
  c = mix(c, uFogLow * 0.9, smoothstep(0.0, -0.25, e));
  float sd = max(dot(d, uSunDir), 0.0);
  // the sun's glow along the horizon, and its disc
  float low = 1.0 - smoothstep(0.0, 0.5, uSunDir.y);
  c += uSkyGlow * (pow(sd, 6.0) * (0.25 + low * 0.35) + pow(sd, 48.0) * 0.45);
  c += uSkyGlow * pow(max(0.0, 1.0 - abs(e) * 6.0), 2.0) * pow(sd, 3.0) * low * 0.45;
  float disc = smoothstep(0.9993, 0.9997, sd);
  vec3 sunC = uSunColor * uSunPower;
  // the overcast: a deck of cloud at a height, lit at its edges by the sun
  if (e > 0.0) {
    float tc = (uCloudH - uCamPos.y) / max(e, 0.012);
    vec3 cp = uCamPos + d * tc;
    float cover = cloudCover(cp.xz);
    float far = smoothstep(26000.0, 5000.0, tc);
    float thick = cover * far * uCloud;
    vec3 cc = uCloudColor * (0.85 + 0.15 * (1.0 - cover));
    // silver and gold linings toward the sun, brightest where the cloud thins
    cc += uSkyGlow * pow(sd, 5.0) * (1.4 - cover) * (0.6 + low);
    c += sunC * disc * 3.0 * (1.0 - thick);
    c = mix(c, cc, thick * 0.92);
    // night: stars where the cloud is thin, then the aurora
    if (uNight > 0.01) {
      vec3 sq = floor(d * 220.0);
      float h = hash13(sq);
      float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
      float star = step(0.9975, h) * tw * (1.0 - thick) * smoothstep(0.02, 0.2, e);
      c += vec3(0.85, 0.9, 1.0) * star * uNight * 0.9;
      float A = uAurora + uAuroraPulse;
      if (A > 0.01) {
        vec2 p = d.xz / (e + 0.05);
        float wv = texture(tNoise, vec3(p.x * 0.05 + uTime * 0.003, p.y * 0.05, 0.71)).r;
        float band = sin(p.x * 0.9 + p.y * 0.35 + wv * 7.0 + uTime * 0.04);
        float curtain = smoothstep(0.55, 1.0, band) * smoothstep(0.04, 0.22, e) * smoothstep(0.85, 0.35, e);
        float rays = 0.6 + 0.4 * texture(tNoise, vec3(p.x * 0.6, uTime * 0.01, 0.13)).r;
        vec3 ac = mix(vec3(0.38, 0.62, 0.58), vec3(0.42, 0.3, 0.52), smoothstep(0.1, 0.6, e));
        c += ac * curtain * rays * A * (1.0 - thick * 0.7) * 0.75;
      }
    }
  } else {
    c += sunC * disc * 2.0;
  }
  return c;
}

void main() {
  vec4 sc = texture(tColor, vUv);
  float depth = texture(tDepth, vUv).r;
  vec4 vp = uProjInv * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 wp = (uViewInv * vp).xyz;
  vec3 dir = normalize(wp - uCamPos);
  bool sky = depth > 0.9999999;
  float dist = sky ? 2400.0 : length(wp - uCamPos);
  vec3 col = sky ? skyColor(dir) : sc.rgb;
  float mask = sky ? 1.0 : sc.a;
  if (!sky && mask > 0.5 && dist < 1600.0) {
    // contrast follows how much direct sun there is: none under a closed sky
    float k = 0.45 * (1.0 - uCloudCover * 0.72) * uSunVis * min(uSunPower, 1.6) * (1.0 - smoothstep(1000.0, 1600.0, dist));
    col *= 1.0 - k * (1.0 - surfVis(wp));
  }

  // light the fog gives back: the sky's ambient, darker deep in the layer; and the sun,
  // scattered mostly forward (a strong lobe toward it, a weaker one everywhere), only
  // where it reaches: that is where the beams come from
  float cs = dot(dir, uSunDir);
  float g1 = 0.78, g2 = 0.25;
  float hg1 = (1.0 - g1 * g1) / pow(1.0 + g1 * g1 - 2.0 * g1 * cs, 1.5);
  float hg2 = (1.0 - g2 * g2) / pow(1.0 + g2 * g2 - 2.0 * g2 * cs, 1.5);
  vec3 sunIn = uSunColor * uSunPower * (hg1 * 0.024 + hg2 * 0.075) * uSunVis;

  float tau = 0.0;
  vec3 ins = vec3(0.0);
  float jit = bayer4(gl_FragCoord.xy);
  int N = uSteps;
  float fN = float(N);
  for (int i = 0; i < 24; i++) {
    if (i >= N) break;
    float fi = float(i);
    float f = (fi + jit) / fN;
    float t = dist * f * f;
    float dt = dist * (2.0 * fi + 1.0) / (fN * fN);
    vec3 p = uCamPos + dir * t;
    float d = density(p);
    float low = smoothstep(uFogBase - 60.0, uFogBase + 25.0, p.y);
    vec3 L = mix(uFogLow, uFogColor, low) + sunIn * sunVis(p, t);
    float a = 1.0 - exp(-d * dt);
    ins += exp(-tau) * a * L;
    tau += d * dt;
  }
  float T = exp(-tau);

  // the artifacts' and the ship's lights, scattered in the fog (closed form)
  vec3 glow = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    vec4 Lp = uFogLights[i];
    if (Lp.w <= 0.0) continue;
    float tc = dot(Lp.xyz - uCamPos, dir);
    float h = length(uCamPos + dir * tc - Lp.xyz) + 2.0;
    float a = (atan((dist - tc) / h) - atan(-tc / h)) / h;
    float dl = uFogDensity * heightProfile(Lp.y) + uHaze * 4.0;
    glow += uFogLightColor[i] * a * Lp.w * dl;
  }

  col = col * mix(1.0, T, mask) + (ins + glow) * mask;
  gl_FragDepth = depth;
  gl_FragColor = vec4(col, 1.0);
}
`;

// --------------------------------------------------------------- the last pass
export const POST = {
  uLevels: { value: 40 },
  uExposure: { value: 1 },
  uVignette: { value: 0.28 },
  uDrowsy: { value: 0 },
  uBlink: { value: 0 },
  uFlash: { value: 0 },
  uLetterbox: { value: 0 },
  uFade: { value: 0 },
  uBloom: { value: 0.6 },
  uGrade: { value: new THREE.Vector3(1, 1, 1) },
  tDepth: { value: null },
  uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
  uRays: { value: 0 },
  uRaysBase: { value: 0 },        // set by the hour and the sky
  uRayColor: { value: new THREE.Color(1, 0.8, 0.6) },
};

const FINAL_FRAG = /* glsl */ `
precision highp float;
${COMMON}
uniform sampler2D tInput;
uniform sampler2D tDepth;
uniform vec2 uRes, uSunUV;
uniform float uLevels, uExposure, uVignette, uDrowsy, uBlink, uFlash, uLetterbox, uFade, uBloom, uRays;
uniform vec3 uGrade, uRayColor;
varying vec2 vUv;

// light streaming from the sun past whatever stands in front of it: the sky's pixels near
// the sun, smeared toward it (after Mitchell, "Volumetric Light Scattering as a
// Post-Process", GPU Gems 3), stepped in the dither like everything else
float rays() {
  vec2 d = uSunUV - vUv;
  vec2 stp = d / 28.0;
  vec2 uv = vUv + stp * bayer4(gl_FragCoord.xy);
  float acc = 0.0, decay = 1.0;
  float aspect = uRes.x / uRes.y;
  for (int i = 0; i < 28; i++) {
    uv += stp;
    float sky = step(0.9999999, texture(tDepth, uv).r);
    vec2 q = (uv - uSunUV) * vec2(aspect, 1.0);
    acc += sky * pow(smoothstep(0.36, 0.0, length(q)), 1.5) * decay;
    decay *= 0.962;
  }
  return acc / 28.0;
}

vec3 tap(vec2 o) {
  vec3 c = texture(tInput, vUv + o / uRes).rgb;
  return max(c - 0.75, 0.0);
}

void main() {
  vec3 c = texture(tInput, vUv).rgb;
  // a little bloom, from what is brighter than the page
  vec3 b = tap(vec2(2.0, 0.0)) + tap(vec2(-2.0, 0.0)) + tap(vec2(0.0, 2.0)) + tap(vec2(0.0, -2.0));
  b += (tap(vec2(3.0, 3.0)) + tap(vec2(-3.0, 3.0)) + tap(vec2(3.0, -3.0)) + tap(vec2(-3.0, -3.0))) * 0.6;
  c += b * 0.09 * uBloom;
  if (uRays > 0.002) c += uRayColor * rays() * uRays;
  c *= uExposure * uGrade;
  // a soft shoulder above white
  c = mix(c, 1.0 - 0.25 * exp(-(c - 0.75) * 4.0), step(0.75, c));
  vec2 q = vUv - 0.5;
  q.x *= uRes.x / uRes.y;
  float r = dot(q, q);
  c *= 1.0 - uVignette * smoothstep(0.1, 0.9, r);
  // drowsiness: the edges close in, color drains away
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  c = mix(c, vec3(lum) * vec3(0.92, 0.96, 1.04), uDrowsy * 0.55);
  c *= 1.0 - smoothstep(0.02, 0.55, r) * uDrowsy * 0.8;
  // a blink: lids from above and below
  float y = abs(vUv.y - 0.5) * 2.0;
  float lid = 1.12 - uBlink * 1.14;
  c *= smoothstep(lid, lid - 0.1, y);
  c = mix(c, vec3(1.0), uFlash);
  c *= 1.0 - uFade;
  if (y > 1.0 - uLetterbox * 0.24) c = vec3(0.0);
  float d = bayer4(gl_FragCoord.xy) - 0.5;
  c = floor(c * uLevels + 0.5 + d * 0.9) / uLevels;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

function fullscreen(material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const m = new THREE.Mesh(g, material);
  m.frustumCulled = false;
  const s = new THREE.Scene();
  s.add(m);
  return s;
}

class Targets {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    const opts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    this.a = new THREE.WebGLRenderTarget(w, h, { ...opts, depthBuffer: true });
    this.a.depthTexture = new THREE.DepthTexture(w, h);
    this.a.depthTexture.type = THREE.UnsignedIntType;
    this.b = new THREE.WebGLRenderTarget(w, h, { ...opts, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
  }
  dispose() {
    this.a.dispose();
    this.a.depthTexture.dispose();
    this.b.dispose();
  }
}

const TARGET_LINES = { fine: 360, standard: 288, chunky: 216 };
const COARSE = matchMedia('(pointer: coarse)').matches;

export class Pipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;
    FOG.tNoise.value = noiseTexture(64);

    this.fogMat = new THREE.ShaderMaterial({
      uniforms: { ...U, ...FOG, tColor: { value: null }, tDepth: { value: null } },
      vertexShader: FS_VERT, fragmentShader: FOG_FRAG,
      depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth,
    });
    this.finalMat = new THREE.ShaderMaterial({
      uniforms: { ...U, ...POST, tInput: { value: null }, uRes: { value: new THREE.Vector2(1, 1) } },
      vertexShader: FS_VERT, fragmentShader: FINAL_FRAG,
      depthTest: false, depthWrite: false,
    });
    this.fogScene = fullscreen(this.fogMat);
    this.finalScene = fullscreen(this.finalMat);
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._sp = new THREE.Vector3();
    this._sv = new THREE.Vector3();

    this.pixelSize = 'auto';
    this.scale = 3;
    this.width = 1;
    this.height = 1;
    this._bias = 0;
    this._ft = [];
    this._window = 0;
    this._good = 0;
    this._lockUntil = 0;
    this.onResize = null;
    this.targets = null;
    this._extra = new Map();
    const again = () => { this._dirty = true; };
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', () => setTimeout(again, 200));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', again);
    this.resize();
  }

  setPixelSize(name) {
    this.pixelSize = TARGET_LINES[name] || name === 'auto' ? name : 'auto';
    this._bias = 0;
    this.resize();
  }

  resize() {
    this._dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const vw = (window.visualViewport && window.visualViewport.width) || window.innerWidth;
    const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    // a page opened hidden can report no size at all: keep what we have and look again
    // (next frame), rather than shrinking to nothing
    if (vw < 8 || vh < 8) { this._dirty = true; if (this.origin) return; }
    this._lastSize = `${vw}x${vh}`;
    const devW = Math.max(1, Math.round(vw * dpr));
    const devH = Math.max(1, Math.round(vh * dpr));
    const lines = TARGET_LINES[this.pixelSize] || TARGET_LINES.fine;
    let scale = Math.max(1, Math.round(Math.min(devH / lines, devW / (lines * 0.62))));
    this.baseScale = Math.max(1, Math.min(12, scale));
    // the interface keeps one pixel size for the window: it never follows the render
    // pixel, which auto mode changes while the device works harder or less
    // On a touch screen it is sized for fingers and a screen held close, from the screen's
    // short side: one size whichever way the phone is held, and while its keyboard is up.
    const short = Math.min(screen.width, screen.height) || Math.min(vw, vh);
    const ui = Math.max(1, Math.min(12, COARSE
      ? Math.round(Math.min(2.6, Math.max(1.5, short / 250)) * dpr)
      : Math.round(Math.min(devH / TARGET_LINES.fine, devW / (TARGET_LINES.fine * 0.62)))));
    const uiChanged = ui / dpr !== this.uiUnit;
    this.uiUnit = ui / dpr;
    if (this.pixelSize === 'auto') scale += this._bias;
    scale = Math.max(1, Math.min(12, scale));
    const w = Math.ceil(devW / scale);
    const h = Math.ceil(devH / scale);
    const css = scale / dpr;
    if (w !== this.width || h !== this.height || css !== this._css) {
      this.scale = scale;
      this.width = w;
      this.height = h;
      this._css = css;
      this.renderer.setSize(w, h, false);
      this.canvas.style.width = `${w * css}px`;
      this.canvas.style.height = `${h * css}px`;
      if (this.targets) this.targets.dispose();
      this.targets = new Targets(w, h);
      if (this.onResize) this.onResize(w, h);
    } else if (uiChanged && this.onResize) this.onResize(w, h);
    this.origin = { x: (vw - this.width * this._css) / 2, y: (vh - this.height * this._css) / 2, css: this._css };
  }

  // Auto mode: fewer render pixels while the device struggles; won back later.
  adapt(ms, now) {
    if (this.pixelSize !== 'auto') return;
    const ft = this._ft;
    ft.push(ms);
    this._window += ms;
    if (this._window < 2000) return;
    this._window = 0;
    const s = ft.slice().sort((a, b) => a - b);
    ft.length = 0;
    const p50 = s[Math.floor(s.length * 0.5)];
    const p90 = s[Math.floor(s.length * 0.9)];
    if (p50 > 24 && this._bias < 3) {
      this._bias++;
      this._good = 0;
      this._lockUntil = now + 60000;
      this._dirty = true;
    } else if (p90 < 18.5 && this._bias > 0) {
      this._good += 2;
      if (this._good >= 20 && now > this._lockUntil) {
        this._bias--;
        this._good = 0;
        this._dirty = true;
      }
    } else {
      this._good = 0;
    }
  }

  _passes(scene, camera, T, out) {
    const r = this.renderer;
    U.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    // A: the opaque world
    camera.layers.set(LAYER_WORLD);
    r.setRenderTarget(T.a);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, false);
    r.render(scene, camera);
    // B: fog and sky, writing depth back
    FOG.uProjInv.value.copy(camera.projectionMatrixInverse);
    FOG.uViewInv.value.copy(camera.matrixWorld);
    this.fogMat.uniforms.tColor.value = T.a.texture;
    this.fogMat.uniforms.tDepth.value = T.a.depthTexture;
    r.setRenderTarget(T.b);
    r.clear(true, true, false);
    r.render(this.fogScene, this.fsCam);
    // C: glows, motes, glass
    camera.layers.set(LAYER_FX);
    r.render(scene, camera);
    camera.layers.set(LAYER_WORLD);
    // D: to the screen (or a photo)
    this.finalMat.uniforms.tInput.value = T.b.texture;
    this.finalMat.uniforms.tDepth.value = T.a.depthTexture;
    // where the sun is on screen, and how much of its streaming light to show
    const sp = this._sp.copy(U.uSunDir.value).multiplyScalar(1000).add(U.uCamPos.value).project(camera);
    const front = this._sv.copy(U.uSunDir.value).transformDirection(camera.matrixWorldInverse).z < 0;
    const u = sp.x * 0.5 + 0.5, v = sp.y * 0.5 + 0.5;
    const off = Math.max(0, Math.max(-u, u - 1, -v, v - 1));
    POST.uSunUV.value.set(u, v);
    POST.uRays.value = front ? POST.uRaysBase.value * Math.max(0, 1 - off / 0.7) : 0;
    this.finalMat.uniforms.uRes.value.set(T.w, T.h);
    r.setRenderTarget(out);
    r.render(this.finalScene, this.fsCam);
  }

  render(scene, camera) {
    if (this._dirty || this._lastSize !== `${(window.visualViewport && window.visualViewport.width) || window.innerWidth}x${(window.visualViewport && window.visualViewport.height) || window.innerHeight}`) this.resize();
    this._passes(scene, camera, this.targets, null);
  }

  // A still at w x h through the same passes, as RGBA bytes (top row first).
  capture(scene, camera, w, h, post = {}) {
    const key = w + 'x' + h;
    let T = this._extra.get(key);
    if (!T) {
      T = new Targets(w, h);
      T.out = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, depthBuffer: false });
      this._extra.set(key, T);
    }
    const saved = {};
    for (const k of Object.keys(post)) { saved[k] = POST[k].value; POST[k].value = post[k]; }
    this._passes(scene, camera, T, T.out);
    for (const k of Object.keys(saved)) POST[k].value = saved[k];
    const buf = new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(T.out, 0, 0, w, h, buf);
    this.renderer.setRenderTarget(null);
    const flipped = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) flipped.set(buf.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    return flipped;
  }
}
