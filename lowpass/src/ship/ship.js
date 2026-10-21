import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { worldMaterial, halo, U } from '../render/materials.js';
import { FOG, LAYER_FX } from '../render/pipeline.js';
import { damp, clamp, lerp, smoothstep, TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { canopyTop, mountainEnv } from '../world/terrain.js';

// The survey craft: Seeker technology as the codex describes it, dark and minimal, fused
// with the organic. A long black hull like a seed, ribs over it like a vine that has
// grown around it, two swept fins, and a pale core of light at its tail that lights the
// treetops it passes over. A band of warm windows at the front: someone is inside.
//
// Local space: +z forward, +y up, the cabin floor at y = 0.

export const SPEED = 24;            // m/s
const BOOST = 1.4;                  // boosting adds this much of SPEED again (to about 58 m/s)
const MAX_YAW = 0.5;                // rad/s
const CLEARANCE = 17;               // above the canopy
const CLIMB = 0.45;                 // the slope it climbs a mountain at

// hull sections along z: [z, half width, half height, center y]
const SECTIONS = [
  [-11.2, 1.3, 1.0, 1.55], [-10.2, 2.3, 1.55, 1.5], [-8.6, 3.2, 2.05, 1.48], [-6, 3.95, 2.38, 1.45], [-2, 4.3, 2.52, 1.45],
  [2, 4.3, 2.52, 1.45], [5.2, 3.95, 2.35, 1.42], [7.6, 3.25, 2.02, 1.32], [9.6, 2.35, 1.55, 1.18], [11, 1.4, 1.0, 1.05],
  [11.9, 0.55, 0.45, 0.98], [12.25, 0.08, 0.08, 0.96],
];

export function section(z) {
  const S = SECTIONS;
  if (z <= S[0][0]) return S[0].slice(1);
  for (let i = 0; i < S.length - 1; i++) {
    if (z <= S[i + 1][0]) {
      const t = (z - S[i][0]) / (S[i + 1][0] - S[i][0]);
      const s = t * t * (3 - 2 * t);
      return [lerp(S[i][1], S[i + 1][1], s), lerp(S[i][2], S[i + 1][2], s), lerp(S[i][3], S[i + 1][3], s)];
    }
  }
  return S[S.length - 1].slice(1);
}

// A point on the hull at (z, angle): angle 0 = right, PI/2 = top.
const PW = 2.7;
export function hullPoint(z, a, scale = 1) {
  const [w, hh, yc] = section(z);
  const c = Math.cos(a), s = Math.sin(a);
  const x = Math.sign(c) * Math.pow(Math.abs(c), 2 / PW) * w * scale;
  let y = Math.sign(s) * Math.pow(Math.abs(s), 2 / PW) * hh * scale;
  if (y < 0) y *= 0.82;
  return [x, yc + y, z];
}

// Window areas, in (z, angle): the windshield and a band down each side.
export function isWindow(z, a) {
  const s = Math.sin(a), c = Math.cos(a);
  // the windshield, reaching low at the nose so the forest shows ahead
  if (z > 5.4 && z < 10.7 && s > (z > 7.4 ? -0.46 : 0.0) && s < 0.93 + (z > 8 ? 0.07 : 0)) return 'front';
  // a band down each side at eye height, panes between the ribs
  if (z > -5.2 && z < 4.2 && s > -0.24 && s < 0.26 && Math.abs(c) > 0.5) {
    const rz = ((z + 5.2) % 3.0 + 3.0) % 3.0;
    if (rz > 0.4 && rz < 2.85) return 'side';
  }
  return null;
}

export const RIBS = [-8.2, -5.2, -2.2, 0.8, 3.8];

function hullGeometry() {
  const b = new Builder();
  const SEG = 28;
  const zs = [];
  for (let z = -11.2; z < 12.25; z += 0.72) zs.push(z);
  zs.push(12.25);
  const top = 0x20242a, side = 0x262b32, belly = 0x181c20, seam = 0x313c43, rim = 0x6c7983;
  const win = mixHex(0xcfdde4, 0xaf634b, 0.28);
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
      const z0 = zs[i], z1 = zs[i + 1];
      const p00 = hullPoint(z0, a0), p01 = hullPoint(z0, a1), p10 = hullPoint(z1, a0), p11 = hullPoint(z1, a1);
      const am = (a0 + a1) / 2, zm = (z0 + z1) / 2;
      const s = Math.sin(am);
      const w = isWindow(zm, am);
      let col = s > 0.55 ? top : s > -0.2 ? side : belly;
      if (i % 4 === 0 && !w) col = seam;
      // the chine: a pale rim where side meets belly
      if (Math.abs(s + 0.22) < 0.09) col = rim;
      const em = w ? 0.55 : 0;
      if (w) col = w === 'front' ? win : mixHex(win, 0x6c7983, 0.25);
      b.quad(p00, p01, p11, p10, col, em);
    }
  }
  // the tail: a dark ring around the core's housing
  return b.build();
}

// The ribs: dark vines grown over the hull, wavering a little.
function ribGeometry() {
  const b = new Builder();
  for (const rz of RIBS) {
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const a = -0.35 + (k / 30) * (Math.PI + 0.7);
      const zw = rz + Math.sin(k * 0.9 + rz) * 0.12;
      const p = hullPoint(zw, a, 1.03);
      pts.push(new THREE.Vector3(p[0], p[1], p[2]));
    }
    b.tube(pts, (t) => 0.16 + Math.sin(t * 9 + rz) * 0.03, 5, 0x0f0e16);
  }
  // a vine along the spine, wrapping a little side to side
  const sp = [];
  for (let k = 0; k <= 40; k++) {
    const z = -10.4 + (k / 40) * 15.5;
    const a = Math.PI / 2 + Math.sin(k * 0.55) * 0.12;
    const p = hullPoint(z, a, 1.04);
    sp.push(new THREE.Vector3(p[0], p[1] + 0.05, p[2]));
  }
  b.tube(sp, (t) => 0.2 * (1 - t * 0.6), 5, 0x0f0e16);
  // vertebrae along the spine
  for (let k = 0; k < 9; k++) {
    const z = -9.2 + k * 1.5;
    const p = hullPoint(z, Math.PI / 2, 1.04);
    const s = 1 - k * 0.07;
    b.box(0.34 * s, 0.32 * s, 0.6 * s, mat(p[0], p[1] + 0.22 * s, p[2], 0.2, 0, 0), 0x181c20);
  }
  return b.build();
}

function finGeometry() {
  const b = new Builder();
  const fin = (root0, root1, tip, tip2, thick, col, edge) => {
    // a swept blade: two root points on the hull, two tip points
    const n = new THREE.Vector3();
    const A = new THREE.Vector3(...root0), B = new THREE.Vector3(...root1), Cc = new THREE.Vector3(...tip), D = new THREE.Vector3(...tip2);
    n.subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A)).normalize().multiplyScalar(thick / 2);
    const up = (v) => [v.x + n.x, v.y + n.y, v.z + n.z], dn = (v) => [v.x - n.x, v.y - n.y, v.z - n.z];
    b.quad(up(A), up(B), up(Cc), up(D), col);
    b.quad(dn(A), dn(D), dn(Cc), dn(B), col);
    b.quad(up(D), up(Cc), dn(Cc), dn(D), edge);
    b.quad(up(B), dn(B), dn(Cc), up(Cc), edge);
  };
  for (const s of [-1, 1]) {
    const r0 = hullPoint(-3, s > 0 ? -0.35 : Math.PI + 0.35), r1 = hullPoint(-9.2, s > 0 ? -0.35 : Math.PI + 0.35);
    fin(r0, r1, [s * 7.9, -1.6, -10.6], [s * 6.2, -1.0, -6.4], 0.22, 0x181c20, 0x353e50);
  }
  const d0 = hullPoint(-6.2, Math.PI / 2), d1 = hullPoint(-10.2, Math.PI / 2);
  fin(d0, d1, [0, 6.6, -12.2], [0, 5.0, -9.6], 0.2, 0x181c20, 0x353e50);
  // the tail housing around the core
  b.torus(1.05, 0.32, 6, 14, mat(0, 1.55, -11.15), 0x0f0e16);
  b.cyl(1.25, 1.25, 0.6, 14, mat(0, 1.55, -10.9, Math.PI / 2, 0, 0), 0x181c20, 0, true);
  // the scanner eye at the nose, under the chin
  b.sphere(0.42, 8, 6, mat(0, 0.62, 11.2), 0x0f0e16);
  // a lit seam along the belly: the core's light running forward
  for (let z = -9.8; z < 6.5; z += 1.1) {
    const p = hullPoint(z, -Math.PI / 2, 1.005);
    b.box(0.14, 0.05, 0.7, mat(p[0], p[1] - 0.01, p[2]), 0x91cbde, 2.2);
  }
  return b.build();
}

function coreGeometry() {
  const b = new Builder();
  b.ico(0.82, 1, mat(0, 1.55, -11.3), 0xd6edf5, 3.0);
  return b.build();
}

function lensGeometry() {
  const b = new Builder();
  b.sphere(0.2, 8, 6, mat(0, 0.6, 11.55), 0x91cbde, 1);
  return b.build();
}

function navGeometry() {
  const b = new Builder();
  b.box(0.22, 0.22, 0.22, mat(7.9, -1.6, -10.6), 0xd6edf5, 2.5);
  b.box(0.22, 0.22, 0.22, mat(-7.9, -1.6, -10.6), 0xd6edf5, 2.5);
  b.box(0.22, 0.22, 0.22, mat(0, 6.6, -12.2), 0xd6edf5, 2.5);
  return b.build();
}

export class Ship {
  constructor(scene, world) {
    this.world = world;
    this.root = new THREE.Group();
    this.exterior = new THREE.Group();
    this.root.add(this.exterior);
    const hullMat = worldMaterial({ unique: true });
    this.hullMat = hullMat;
    this.hull = new THREE.Mesh(hullGeometry(), hullMat);
    this.exterior.add(this.hull);
    this.exterior.add(new THREE.Mesh(ribGeometry(), worldMaterial({ side: THREE.DoubleSide })));
    this.exterior.add(new THREE.Mesh(finGeometry(), worldMaterial({ side: THREE.DoubleSide })));
    // the core and the lights are shared by both views
    this.coreMat = worldMaterial({ unique: true });
    this.core = new THREE.Mesh(coreGeometry(), this.coreMat);
    this.root.add(this.core);
    this.navMat = worldMaterial({ unique: true });
    this.nav = new THREE.Mesh(navGeometry(), this.navMat);
    this.exterior.add(this.nav);
    this.lensMat = worldMaterial({ unique: true });
    this.lens = new THREE.Mesh(lensGeometry(), this.lensMat);
    this.exterior.add(this.lens);
    this.halo = halo(0x91cbde, 9, 0.9);
    this.halo.position.set(0, 1.55, -11.6);
    this.halo.layers.set(LAYER_FX);
    this.exterior.add(this.halo);
    scene.add(this.root);

    // flight
    this.x = 0;               // world position (doubles)
    this.z = 0;
    this.y = 60;
    this.vy = 0;
    this.heading = 0;         // radians, 0 = +z
    this.yawRate = 0;
    this.bank = 0;
    this.pitch = 0;
    this.speed = SPEED;
    this.steer = 0;
    this.drift = 0;           // asleep at the controls: a slow wander
    this.distance = 0;
    this.scanGlow = 0;
    this.boost = 0;           // 0..1: how hard the core burns (W held), eased in and out
    this._t = 0;
  }

  place(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.y = this._target();
    this._ty = this.y;
    this.vy = 0;
  }

  forward() {
    return [Math.sin(this.heading), Math.cos(this.heading)];
  }

  _target() {
    const [fx, fz] = this.forward();
    let top = -Infinity;
    // in the mountains, what is ahead counts less the farther off it is, at the slope the
    // ship climbs (about 24 degrees): it rises steadily up a range to pass just over it,
    // rather than leaping up early; elsewhere, as it always has
    for (const d of [0, 35, 70, 110, 160, 220, 290]) {
      const x = this.x + fx * d, z = this.z + fz * d;
      const w = 1 - d / 420;
      const m = d > 0 && mountainEnv(x, z) > 0;
      const a = m ? Math.max((1 - w) * 18, d * CLIMB) : (1 - w) * 18, b = m ? Math.max((1 - w) * 22, d * CLIMB) : (1 - w) * 22;
      top = Math.max(top, canopyTop(x, z) - a);
      top = Math.max(top, canopyTop(x - fz * 14, z + fx * 14) - b, canopyTop(x + fz * 14, z - fx * 14) - b);
    }
    // a range ahead: look further, to start that climb in time
    for (const d of [380, 480, 600, 750]) {
      const x = this.x + fx * d, z = this.z + fz * d;
      if (mountainEnv(x, z) > 0) top = Math.max(top, canopyTop(x, z) - d * CLIMB);
    }
    // and over anything large standing in the way (the deep's artifacts)
    if (this.obstacle) {
      const cruise = top + CLEARANCE;
      for (const d of [0, 35, 70, 110, 160, 220, 290]) {
        const w = 1 - d / 420;
        top = Math.max(top, this.obstacle(this.x + fx * d, this.z + fz * d, cruise) - (1 - w) * 18);
      }
    }
    return top + CLEARANCE;
  }

  // boosting: true while the boost is asked for (outside, or at the controls)
  update(dt, steer, boosting = false) {
    this._t += dt;
    this.steer = steer;
    // the core takes a moment to come up to a burn, and longer to settle back
    this.boost = damp(this.boost, boosting ? 1 : 0, boosting ? 1.4 : 0.9, dt);
    this.speed = SPEED * (1 + BOOST * this.boost);
    // heading grows toward +x, which is to the left when facing +z: steering right turns it down
    const target = -clamp(steer + this.drift, -1, 1) * MAX_YAW;
    this.yawRate = damp(this.yawRate, target, 2.0, dt);
    this.heading += this.yawRate * dt;
    this.bank = damp(this.bank, clamp(-this.yawRate * 1.05, -0.55, 0.55), 2.6, dt);
    const [fx, fz] = this.forward();
    this.x += fx * this.speed * dt;
    this.z += fz * this.speed * dt;
    this.distance += this.speed * dt;
    // height follows the canopy ahead: a spring, quicker to climb than to sink, toward a
    // height eased over a moment (a ridge coming into view must not jolt it), and the
    // spring's stiffness easing between climbing and sinking rather than snapping
    const raw = this._target();
    this._ty = this._ty === undefined ? raw : damp(this._ty, raw, raw > this._ty ? 2.2 : 1.2, dt);
    const err = this._ty + Math.sin(this._t * 0.37) * 1.2 - this.y;
    const k = 0.55 + 1.05 * smoothstep(-6, 6, err);
    this.vy += (err * k * k - 2 * k * this.vy) * dt;
    this.vy = clamp(this.vy, -9, 14);
    this.y += this.vy * dt;
    this.pitch = damp(this.pitch, clamp(-this.vy / this.speed, -0.25, 0.3), 1.6, dt);
  }

  // Place the model in render space; light the canopy under it and the fog around it.
  sync(origin, beat) {
    const r = this.root;
    r.position.set(this.x - origin.x, this.y, this.z - origin.z);
    r.rotation.set(this.pitch, this.heading, this.bank, 'YXZ');
    r.updateMatrixWorld(true);
    const pulse = 0.85 + 0.15 * Math.cos(beat * TAU);
    this.coreMat.uniforms.uPulse.value = pulse;
    this.navMat.uniforms.uPulse.value = (beat % 2) < 0.25 ? 1.0 : 0.05;
    this.lensMat.uniforms.uEmisBoost.value = 0.6 + this.scanGlow * 3;
    // burning, the core flares and its glow swells
    this.coreMat.uniforms.uEmisBoost.value = 1 + this.boost * 1.6;
    this.halo.material.uniforms.uOpacity.value = 0.9 + this.boost * 1.3;
    this.halo.material.uniforms.uSize.value = 9 * (1 + this.boost * 0.6);
    const core = new THREE.Vector3(0, 1.55, -11.3).applyMatrix4(r.matrixWorld);
    const belly = new THREE.Vector3(0, -4, -2).applyMatrix4(r.matrixWorld);
    U.uPointPos.value[0].set(belly.x, belly.y - 6, belly.z, 46);
    U.uPointColor.value[0].setRGB(0.22, 0.32, 0.36).multiplyScalar(pulse);
    FOG.uFogLights.value[0].set(core.x, core.y, core.z, 24 + this.boost * 22);
    FOG.uFogLightColor.value[0].setRGB(0.55, 0.8, 0.9);
    this.corePos = core;
  }

  // ship-local to render-space
  toWorld(v) {
    return v.applyMatrix4(this.root.matrixWorld);
  }
}
