import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';

// The pieces every artifact is made of: the codex's stone ramps and pale rims, beams,
// slabs, lines on the ground, and motes of light. (models.js and families.js build with
// them.)

export const STONE = [0x181c20, 0x20242a, 0x262b32, 0x313c43];
export const EDGE = 0x4f5d73;
export const RIM = 0x94a6b1;
export const PULSE = 2.2;           // emissive above 1.5 follows the artifact's pulse
export const Y = new THREE.Vector3(0, 1, 0);

export function beam(b, a, c, w, color, em = 0) {
  const d = new THREE.Vector3().subVectors(c, a);
  const len = d.length();
  if (len < 1e-4) return;
  const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
  const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
  b.box(w, len + w * 0.4, w, m, color, em);
}

export function flatSeg(b, p0, p1, w, color, em) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
  const hl = Math.hypot(dx, dz);
  const len = Math.hypot(hl, dy);
  if (len < 1e-3) return;
  b.box(w, 0.16, len + w * 0.6, mat((p0.x + p1.x) / 2, (p0.y + p1.y) / 2 + 0.1, (p0.z + p1.z) / 2, -Math.atan2(dy, hl), Math.atan2(dx, dz), 0), color, em);
}

// a tapered slab of stone
export function slab(b, x, z, y0, w, h, dpt, yaw, lean, color, top = 0.7) {
  const g = new THREE.CylinderGeometry(top * 0.707, 0.707, 1, 4, 3);
  g.rotateY(Math.PI / 4);
  roughen(g, 0.06, Math.floor(x * 13 + z * 7));
  b.add(g, mat(x, y0 + h / 2, z, lean, yaw, 0, w, h, dpt), (px, py) => (py > 0.36 ? mixHex(color, RIM, 0.18) : color), 0, { flat: true });
}

export function motes(color, n, radius, height, seed, size = 0.5) {
  const R = rng(seed);
  const pos = [], sz = [], al = [];
  for (let i = 0; i < n; i++) {
    const a = R() * TAU, r = Math.sqrt(R()) * radius;
    pos.push(Math.cos(a) * r, R() * height, Math.sin(a) * r);
    sz.push(0.5 + R());
    al.push(0.4 + R() * 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.Float32BufferAttribute(al, 1));
  const p = new THREE.Points(g, pointsMaterial({ color, size, additive: true, opacity: 1.2 }));
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  p.userData.base = pos.slice();
  return p;
}

export function driftMotes(p, t) {
  const a = p.geometry.attributes.position, base = p.userData.base;
  for (let i = 0; i < a.count; i++) {
    const ph = i * 1.7;
    a.setXYZ(i, base[i * 3] + Math.sin(t * 0.21 + ph) * 1.4, base[i * 3 + 1] + ((t * 0.6 + ph * 3) % 8) - 4, base[i * 3 + 2] + Math.cos(t * 0.17 + ph) * 1.4);
  }
  a.needsUpdate = true;
}
