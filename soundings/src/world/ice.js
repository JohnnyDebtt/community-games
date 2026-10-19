import * as THREE from 'three';
import { TAU } from '../core/math.js';
import { U, COMMON } from '../render/materials.js';
import { ZONE, POLYNYA, polynyaEdge, SEA_R } from './layout.js';

// The frozen sea, drawn by one shader on one disc: wind-drifted snow, bare blue ice,
// clear black ice over deep water (you can see what swims under it), cracks, the
// drilled holes, and the open water over the vents. Transparent where it is clear.

export const MAX_HOLES = 32;

const VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FRAG = /* glsl */ `
${COMMON}
uniform vec4 uHoles[${MAX_HOLES}];
uniform vec4 uHoleFx[${MAX_HOLES}];
uniform vec4 uZoneA, uZoneB;
uniform vec2 uPoly;
uniform float uPolyEdge[36];
uniform vec2 uWind;
uniform float uFresh;
uniform vec3 uSnowLit, uSnowShade, uIceCol, uClearCol, uWaterCol;
varying vec3 vWorld;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hashu(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334673u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334673u;
  return float(n) * (1.0 / 4294967295.0);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += vnoise(p) * a; p = p * 2.03 + vec2(17.1, -9.7); a *= 0.5; }
  return s / 0.9375;
}
// distance to the nearest Voronoi edge: cracks in the ice
float crack(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = vec2(h21(i + g), h21(i + g + 31.7));
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return d2 - d1;
}
float polyEdge(float a) {
  float t = (a / 6.2831853 + 1.0) * 36.0;
  int i0 = int(mod(floor(t), 36.0));
  int i1 = int(mod(floor(t) + 1.0, 36.0));
  return mix(uPolyEdge[i0], uPolyEdge[i1], fract(t));
}

void main() {
  vec2 p = vWorld.xz;
  vec3 v = normalize(uCamPos - vWorld);

  // clear black ice where the wind keeps the deep water bare
  vec2 da = p - uZoneA.xy, db = p - uZoneB.xy;
  float wA = exp(-dot(da, da) / (2.0 * uZoneA.z * uZoneA.z));
  float wB = exp(-dot(db, db) / (2.0 * uZoneB.z * uZoneB.z));
  float n = fbm(p * 0.045 + vec2(40.0, -13.0));
  float clear = smoothstep(0.42, 0.62, n * 0.55 + (wA * 1.1 + wB * 0.9) * 0.6);

  // snow drifts, stretched along the wind
  vec2 wd = uWind;
  vec2 wp = vec2(dot(p, wd), dot(p, vec2(-wd.y, wd.x)) * 3.2);
  float drift = fbm(wp * 0.035 + 3.0);
  float snow = smoothstep(0.3, 0.48, drift * 0.8 + 0.42 - clear * 0.95 + uFresh * 0.35);
  float bare = 1.0 - snow;

  vec3 col = mix(uIceCol, uIceCol * 0.9, vnoise(p * 0.35));
  col = mix(col, uClearCol, clear * bare);
  // long soft wind streaks across the snow
  float streak = smoothstep(0.55, 0.85, vnoise(vec2(wp.x * 0.03, wp.y * 0.35)) * 0.6 + vnoise(wp * 0.07) * 0.4);
  float sast = vnoise(p * 0.12 + 9.0);
  vec3 snowCol = mix(uSnowLit, uSnowShade, streak * 0.3 + sast * 0.35 + smoothstep(0.5, 0.3, snow) * 0.5);
  col = mix(col, snowCol, snow);

  // cracks: pale in black ice, faint grey in white ice
  float c1 = crack(p * 0.17 + vec2(vnoise(p * 0.3) * 0.6));
  float c2 = crack(p * 0.7 + 3.0 + vec2(vnoise(p * 1.3) * 0.5));
  float fine = step(0.55, vnoise(p * 0.21 + 30.0)) * (1.0 - smoothstep(10.0, 30.0, length(uCamPos - vWorld)));
  float cr = (1.0 - smoothstep(0.0, 0.028, c1)) * 0.7 + (1.0 - smoothstep(0.0, 0.035, c2)) * 0.35 * clear * fine;
  col = mix(col, mix(vec3(0.52, 0.62, 0.68), vec3(0.78, 0.86, 0.9), clear), cr * bare * 0.8);

  float alpha = mix(1.0, 0.4 - uSense * 0.2, clear * bare);
  // glass sight: near you, even snowy ice turns to glass
  float nearCam = 1.0 - smoothstep(12.0, 28.0, length(uCamPos.xz - p));
  alpha = mix(alpha, min(alpha, 0.3), uSense * nearCam);
  float waterMask = 0.0;

  // drilled holes: water, a slush rim, scattered chips
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    vec4 H = uHoles[i];
    if (H.z <= 0.0) continue;
    float d = length(p - H.xy);
    if (d > H.z * 3.5) continue;
    vec4 fx = uHoleFx[i];
    float freeze = H.w;
    float rim = smoothstep(H.z * 1.75, H.z * 1.0, d);
    vec3 slush = mix(vec3(0.62, 0.69, 0.74), vec3(0.8, 0.85, 0.88), vnoise(p * 30.0));
    col = mix(col, slush, rim * 0.9);
    float chips = step(0.86, hashu(p * 18.0)) * smoothstep(H.z * 3.2, H.z * 1.6, d);
    col = mix(col, uSnowLit, chips * 0.8);
    alpha = mix(alpha, 1.0, max(rim, chips));
    float inside = smoothstep(H.z, H.z * 0.86, d);
    float rings = 0.5 + 0.5 * sin(d * 60.0 - uTime * 5.0 - fx.x * 10.0);
    vec3 w = uWaterCol * (0.85 + 0.25 * vnoise(p * 9.0 + uTime * 0.5)) + vec3(0.1, 0.14, 0.15) * rings * fx.x * smoothstep(0.0, H.z, d);
    w += vec3(0.25, 0.3, 0.32) * fx.y;   // light from a lure or screen above it
    vec3 skin = mix(vec3(0.42, 0.52, 0.6), vec3(0.62, 0.7, 0.75), vnoise(p * 20.0));
    w = mix(w, skin, freeze);
    col = mix(col, w, inside);
    alpha = mix(alpha, mix(0.9, 1.0, freeze), inside);
    waterMask = max(waterMask, inside * (1.0 - freeze));
  }

  // the polynya over the vents: open water that never freezes
  vec2 pp = p - uPoly;
  float pd = length(pp);
  if (pd < 20.0) {
    float e = polyEdge(atan(pp.y, pp.x));
    float inside = smoothstep(e, e - 0.35, pd);
    float shore = smoothstep(e + 1.4, e, pd) * (1.0 - inside);
    col = mix(col, vec3(0.66, 0.72, 0.76), shore * 0.85);
    alpha = mix(alpha, 1.0, shore);
    vec3 w = uWaterCol * (0.8 + 0.4 * vnoise(p * 1.5 + vec2(uTime * 0.2, 0.0)));
    float lap = smoothstep(0.75, 0.95, vnoise(p * 3.0 + vec2(uTime * 0.6, uTime * 0.3)));
    w += vec3(0.14, 0.18, 0.2) * lap;
    col = mix(col, w, inside);
    alpha = mix(alpha, 0.86, inside);
    waterMask = max(waterMask, inside);
  }

  vec3 nrm = vec3(0.0, 1.0, 0.0);
  vec3 lit = col * lightAt(vWorld, nrm, nrm);   // no rim on the flat ice
  // black ice and water mirror the sky at grazing angles
  float fres = pow(1.0 - max(v.y, 0.0), 3.0);
  lit = mix(lit, uFogColor * 0.92, fres * (clear * bare * 0.55 + waterMask * 0.5));
  // sparkle in the snow, catching the light
  vec2 cell = floor(p * 24.0);
  float sp = step(0.9982, hashu(cell)) * step(0.6, fract(hashu(cell + 7.0) * 3.0 + dot(v.xz, vec2(2.3, 1.7))));
  float near = 1.0 - smoothstep(6.0, 22.0, length(uCamPos - vWorld));
  lit += vec3(0.35) * sp * snow * near * (0.3 + 0.7 * max(uSunDir.y, 0.0));
  lit = applyFog(lit, vWorld);
  gl_FragColor = vec4(finalize(lit), alpha);
}
`;

export class Ice {
  constructor(scene) {
    const holes = Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0));
    const holeFx = Array.from({ length: MAX_HOLES }, () => new THREE.Vector4(0, 0, 0, 0));
    const edge = [];
    for (let i = 0; i < 36; i++) edge.push(polynyaEdge((i / 36) * TAU));
    this.uniforms = {
      ...U,
      uHoles: { value: holes },
      uHoleFx: { value: holeFx },
      uZoneA: { value: new THREE.Vector4(ZONE.reach.x, ZONE.reach.z, ZONE.reach.sigma, 0) },
      uZoneB: { value: new THREE.Vector4(ZONE.drop.x, ZONE.drop.z, ZONE.drop.sigma, 0) },
      uPoly: { value: new THREE.Vector2(POLYNYA.x, POLYNYA.z) },
      uPolyEdge: { value: edge },
      uWind: { value: new THREE.Vector2(0.8, 0.6).normalize() },
      uFresh: { value: 0 },
      uSnowLit: { value: new THREE.Color(0xedf0f1) },
      uSnowShade: { value: new THREE.Color(0xc4ced4) },
      uIceCol: { value: new THREE.Color(0x94a6b1) },
      uClearCol: { value: new THREE.Color(0x14232a) },
      uWaterCol: { value: new THREE.Color(0x0c1519) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: true,
    });
    const geo = new THREE.CircleGeometry(SEA_R + 40, 96);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 0;
    this.mesh.name = 'ice';
    scene.add(this.mesh);
    this.holes = holes;
    this.holeFx = holeFx;
  }

  setHoles(list) {
    for (let i = 0; i < MAX_HOLES; i++) {
      const h = list[i];
      if (h) {
        this.holes[i].set(h.x, h.z, h.r, h.freeze || 0);
        this.holeFx[i].set(h.ripple || 0, h.glow || 0, 0, 0);
      } else this.holes[i].set(0, 0, 0, 0);
    }
  }
}
