import * as THREE from 'three';
import { TAU, hash2, rng } from '../core/math.js';
import { P } from '../core/palette.js';
import { worldMaterial, glowMaterial } from '../render/materials.js';
import { Builder, mat, roughen } from '../render/build.js';
import {
  TETHERS, ROCKS, RIDGES, CRYSTALS, SHACK, SHRINE, TANK, landHeight, SEA_R, depthAt,
} from './layout.js';

// Static world props, merged into a few meshes. Seeker technology is dark and minimal
// with a pale core of light; minerals are pale and cold, growing stranger near the Drop.

export function buildProps(scene) {
  const out = {};
  const solid = new Builder();
  const glow = new Builder();

  // (the capsule has its own module: world/capsule.js)

  // ---- tether nodes: black stakes wrapped by a parasitic vine, a pale core of light
  out.tethers = [];
  for (const t of TETHERS) {
    const y = Math.max(0, landHeight(t.x, t.z));
    const g = new Builder();
    g.cyl(0.03, 0.09, 2.3, 5, mat(0, 1.15, 0), P.deepest);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.3;
      g.cyl(0.035, 0.05, 0.75, 4, mat(Math.cos(a) * 0.28, 0.14, Math.sin(a) * 0.28, 0, -a, 1.15), P.deepest);
      g.cyl(0.02, 0.035, 0.5, 4, mat(Math.cos(a) * 0.62, 0.03, Math.sin(a) * 0.62, 0, -a, 1.45), P.body1);
    }
    for (let k = 0; k < 14; k++) {
      const a = k * 1.1, yy = 0.25 + k * 0.13;
      g.box(0.05, 0.05, 0.16, mat(Math.cos(a) * 0.07, yy, Math.sin(a) * 0.07, 0.4, -a, 0), P.body1);
    }
    g.add(new THREE.TorusGeometry(0.17, 0.03, 4, 10), mat(0, 2.05, 0), P.deepest);
    const mesh = new THREE.Mesh(g.build(), worldMaterial());
    mesh.position.set(t.x, y, t.z);
    scene.add(mesh);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), glowMaterial({ tint: 0xd6edf5 }));
    setColor(core.geometry, 0xffffff);
    core.position.set(t.x, y + 2.05, t.z);
    scene.add(core);
    out.tethers.push({ ...t, y, mesh, core, light: new THREE.Vector3(t.x, y + 2.05, t.z) });
  }

  // ---- rocks breaking through the ice, snow on their shoulders
  for (const [i, r] of ROCKS.entries()) {
    const g = roughen(new THREE.IcosahedronGeometry(1, 1), 0.28, i + 3);
    const h = r.s * (0.55 + hash2(i, 5) * 0.35);
    solid.add(g, mat(r.x, h * 0.25, r.z, 0, hash2(i, 6) * TAU, 0, r.s, h, r.s * (0.8 + hash2(i, 7) * 0.4)),
      (x, y) => (y > 0.45 ? P.snow4 : y > 0.15 ? P.stone3 : y > -0.2 ? P.stone2 : P.stone1));
  }

  // ---- pressure ridges: floes pushed up into lines of jagged blocks
  for (const ridge of RIDGES) {
    const R = rng(ridge.seed * 101);
    const L = Math.hypot(ridge.x1 - ridge.x0, ridge.z1 - ridge.z0);
    const n = Math.floor(L / 1.3);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = ridge.x0 + (ridge.x1 - ridge.x0) * t + R.range(-0.8, 0.8);
      const z = ridge.z0 + (ridge.z1 - ridge.z0) * t + R.range(-0.8, 0.8);
      const s = R.range(0.6, 1.5) * (0.6 + 0.4 * Math.sin(t * Math.PI));
      const g = roughen(new THREE.BoxGeometry(1, 1, 1, 1, 1, 1), 0.18, k + ridge.seed * 50);
      solid.add(g, mat(x, s * 0.3, z, R.range(-0.6, 0.6), R.range(0, TAU), R.range(-0.7, 0.7), s * 1.3, s, s * 0.8),
        (vx, vy) => (vy > 0.3 ? P.snow4 : vy > -0.1 ? P.snow3 : P.snow2));
    }
  }

  // ---- ice crystals: mineral spires, strange and faintly luminous near the Drop
  const crystals = new Builder();
  for (const c of CRYSTALS) {
    const R = rng(c.seed * 7 + 1);
    const deep = depthAt(c.x, c.z) > 90;
    const count = R.int(3, 6);
    for (let k = 0; k < count; k++) {
      const h = c.s * R.range(0.8, 2.2) * (k === 0 ? 1.4 : 1);
      const ox = R.range(-0.6, 0.6) * c.s, oz = R.range(-0.6, 0.6) * c.s;
      const g = new THREE.ConeGeometry(h * 0.16, h, 5);
      const body = deep ? (R() < 0.5 ? P.shell2 : P.shell3) : R() < 0.5 ? P.shell3 : P.shell4;
      crystals.add(g, mat(c.x + ox, h * 0.42, c.z + oz, R.range(-0.4, 0.4), R.range(0, TAU), R.range(-0.4, 0.4)),
        (x, y) => (y > h * 0.25 ? P.glow3 : body), deep ? 0.22 : 0.04);
    }
  }
  scene.add(new THREE.Mesh(crystals.build(), worldMaterial()));

  // ---- a hut someone left on the ice, long ago
  {
    const b = new Builder();
    const m = (x, y, z, rx = 0, ry = 0, rz = 0) => mat(x, y, z, rx, ry, rz);
    b.box(2.6, 2.0, 2.2, m(0, 1.0, 0), P.body3);
    b.box(2.8, 0.12, 2.5, m(0, 2.06, 0, 0, 0, 0.12), P.body1);
    b.box(2.85, 0.18, 2.55, m(0, 2.2, 0, 0, 0, 0.12), P.snow4);
    b.box(0.7, 1.5, 0.06, m(0.5, 0.78, 1.11), P.body1);
    b.box(0.6, 0.4, 0.06, m(-0.6, 1.3, 1.11), P.stone0);
    b.box(2.7, 0.4, 2.3, m(0, 0.2, 0), P.snow3);
    b.box(0.9, 0.5, 0.9, m(1.8, 0.25, 0.6), P.snow4);
    b.box(0.4, 0.4, 0.35, m(-1.7, 0.2, 1.4), P.body2);
    b.cyl(0.06, 0.06, 1.4, 4, m(-1.6, 0.7, -1.3, 0.2, 0, 0.35), P.body1);
    solid.merge(b, mat(SHACK.x, 0, SHACK.z, 0, SHACK.rot, 0));
  }

  // ---- a ring of seven standing stones around an old hole at the Drop
  {
    const R = rng(77);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * TAU;
      const h = R.range(1.6, 2.6);
      const g = roughen(new THREE.BoxGeometry(0.45, h, 0.32), 0.05, k + 900);
      solid.add(g, mat(SHRINE.x + Math.cos(a) * 3.1, h / 2 - 0.1, SHRINE.z + Math.sin(a) * 3.1, R.range(-0.08, 0.08), -a, R.range(-0.08, 0.08)),
        (x, y) => (y > h / 2 - 0.12 ? P.snow4 : P.shell2));
    }
  }

  // ---- the specimen tank by the capsule (its fish are added by the tank system)
  {
    const tx = TANK.x, tz = TANK.z, ty = Math.max(0, landHeight(tx, tz));
    solid.cyl(0.95, 1.0, 0.3, 12, mat(tx, ty + 0.15, tz), P.stone2);
    solid.add(new THREE.TorusGeometry(0.92, 0.05, 4, 16), mat(tx, ty + 1.9, tz, Math.PI / 2), P.stone3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      solid.box(0.06, 1.6, 0.06, mat(tx + Math.cos(a) * 0.9, ty + 1.1, tz + Math.sin(a) * 0.9), P.stone3);
    }
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 1.6, 16, 1, false),
      glowMaterial({ transparent: true, opacity: 0.5, tint: 0x1d3a44, fog: 0.8 }));
    setColor(glass.geometry, 0xffffff);
    glass.position.set(tx, ty + 1.1, tz);
    glass.renderOrder = 3;
    scene.add(glass);
    out.tankPos = new THREE.Vector3(tx, ty + 1.05, tz);
  }

  // ---- the dark sea far below the ice
  {
    const g = new THREE.CircleGeometry(SEA_R + 30, 32);
    g.rotateX(-Math.PI / 2);
    setColor(g, 0x163640);
    const m = new THREE.Mesh(g, worldMaterial());
    m.position.y = -16;
    scene.add(m);
  }

  const solidMesh = new THREE.Mesh(solid.build(), worldMaterial());
  solidMesh.name = 'props';
  scene.add(solidMesh);
  const glowMesh = new THREE.Mesh(glow.build(), glowMaterial({ fog: 0.4 }));
  scene.add(glowMesh);
  return out;
}

export function setColor(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}
