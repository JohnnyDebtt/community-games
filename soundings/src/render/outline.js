import * as THREE from 'three';
import { U, COMMON } from './materials.js';

// A dark outline one art pixel wide around the characters, as pixel art draws them: the
// back faces of a copy of the mesh, pushed out along smoothed normals by a fixed number
// of screen pixels (so it stays one pixel at any distance), sharing the cloth and swim
// motion of the mesh it outlines.

export const OUTLINE = {
  uRes: { value: new THREE.Vector2(480, 270) },
};

export function setOutlineResolution(w, h) {
  OUTLINE.uRes.value.set(w, h);
}

const VERT = /* glsl */ `
attribute vec3 onormal;
uniform vec2 uRes;
uniform float uWidth;
varying vec3 vWorld;
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
  float tq = floor(uTime * 12.0) / 12.0;
  float cw = sway * sway;
  p.x += cw * (sin(tq * 4.7 + position.y * 7.0 + position.z * 5.0) * 0.014 + sin(tq * 1.9 + position.y * 3.0) * 0.008) * (0.6 + uFlutter);
  p.z += cw * (cos(tq * 4.1 + position.y * 6.0 + position.x * 5.0) * 0.012 - uFlutter * 0.07);
  p.y += cw * uFlutter * 0.02;
#endif
#ifdef SWIM
  float ph = modelMatrix[3].x * 1.7 + modelMatrix[3].z * 2.3;
  float sq = floor(uTime * 12.0) / 12.0;
  p.x += sin(sq * 7.0 + ph - position.z * 6.5) * sway * sway * uSwim;
#endif
  vec4 w = modelMatrix * p;
  vWorld = w.xyz;
  vec4 clip = projectionMatrix * viewMatrix * w;
  vec3 nw = normalize(mat3(modelMatrix) * onormal);
  vec4 cn = projectionMatrix * viewMatrix * vec4(nw, 0.0);
  vec2 d = cn.xy;
  float l = length(d);
  if (l > 1e-5) clip.xy += (d / l) * uWidth * 2.0 / uRes * clip.w;
  gl_Position = clip;
}
`;

const FRAG = /* glsl */ `
${COMMON}
uniform vec3 uColor;
varying vec3 vWorld;
void main() {
  vec3 c = applyFog(uColor, vWorld);
  gl_FragColor = vec4(finalize(c), 1.0);
}
`;

const _normals = new WeakMap();

// Smoothed normals: the average of the faces meeting at each position.
export function smoothNormals(geo) {
  if (_normals.has(geo)) return;
  const p = geo.attributes.position;
  const n = p.count;
  const acc = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
  const idx = geo.index;
  const tri = (i0, i1, i2) => {
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    f.subVectors(c, b).cross(a.clone().sub(b));
    const len = f.length();
    if (len < 1e-12) return;
    f.divideScalar(len);
    for (const i of [i0, i1, i2]) {
      const k = key(i);
      const v = acc.get(k);
      if (v) v.add(f); else acc.set(k, f.clone());
    }
  };
  if (idx) for (let i = 0; i < idx.count; i += 3) tri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
  else for (let i = 0; i < n; i += 3) tri(i, i + 1, i + 2);
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = acc.get(key(i));
    if (v) {
      const l = v.length() || 1;
      out[i * 3] = v.x / l; out[i * 3 + 1] = v.y / l; out[i * 3 + 2] = v.z / l;
    }
  }
  geo.setAttribute('onormal', new THREE.BufferAttribute(out, 3));
  _normals.set(geo, true);
}

// Give a mesh its outline (a child that follows it). opts: { width (px), color }
export function addOutline(mesh, opts = {}) {
  const geo = mesh.geometry;
  if (!geo || !geo.attributes.position || !geo.attributes.position.count) return null;
  smoothNormals(geo);
  const src = mesh.material && mesh.material.uniforms ? mesh.material.uniforms : {};
  const defines = {};
  if (mesh.material && mesh.material.defines) {
    if ('SWAY' in mesh.material.defines) defines.SWAY = '';
    if ('SWIM' in mesh.material.defines) defines.SWIM = '';
  }
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uRes: OUTLINE.uRes,
      uWidth: { value: opts.width ?? 1 },
      uColor: { value: new THREE.Color(opts.color ?? 0x0f0e16) },
      uFlutter: src.uFlutter || { value: 0 },
      uSwim: src.uSwim || { value: 0 },
    },
    defines,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
  });
  const o = new THREE.Mesh(geo, m);
  o.name = 'outline';
  o.renderOrder = mesh.renderOrder;
  o.frustumCulled = mesh.frustumCulled;
  mesh.add(o);
  mesh.userData.outline = o;
  return o;
}
