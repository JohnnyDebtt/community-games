import * as THREE from 'three';
import { TAU, clamp, damp, lerp } from '../core/math.js';
import { P, mixHex } from '../core/palette.js';
import { worldMaterial } from '../render/materials.js';
import { Builder, mat } from '../render/build.js';

// The Seeker: a lone explorer in a long, weathered, sand-gold cloak and a pointed cowl
// with nothing inside but darkness and one white glint of the visor, as in The Seeker's
// own sprites. The only yellowish thing in view. A small rig (hips, chest, head, arms,
// legs, the cloak's panels) posed on the 12 fps grid.
// Geometry and poses adapted from Soundings (TheSeekerGame/community-games,
// soundings/src/actors/player.js), MIT OR Apache-2.0.

const HIP = 0.86;
const THIGH = 0.43, SHIN = 0.39;
const SHOULDER = 0.42;
const UPPER = 0.28, FORE = 0.3;     // shoulder to elbow, elbow to the hand's grip

const CLOTH = P.gold;
const FOLD = mixHex(P.gold, P.goldShadow, 0.3);
const DEEP = mixHex(P.gold, P.goldShadow, 0.62);
const SHADE = P.goldShadow;
const VOID = P.deepest;
const SUIT = 0x22272e, PLATE = 0x3a434d, PLATE_HI = 0x5d6b78, VISOR = 0x9fe3ec, CORE = 0x91cbde;
const COAT = 0x26292f, COAT2 = 0x33373e, GLOVE = 0x8f979c, LINING = 0x4a4540;

function revolve(b, prof, seg, o = {}) {
  const phi0 = o.phi0 ?? 0, phi1 = o.phi1 ?? TAU;
  const g = new THREE.BufferGeometry();
  const pos = [], crease = [];
  const ymin = prof[0][1], ymax = prof[prof.length - 1][1];
  const v = (i, j) => {
    const phi = phi0 + ((phi1 - phi0) * i) / seg;
    const [r0, y0] = prof[j];
    const fm = o.foldMask ? o.foldMask(y0) : 1;
    const n = o.folds || 0;
    const f = n ? Math.sin(phi * n + (o.foldPhase || 0) + y0 * 2.3) * 0.62 + Math.sin(phi * n * 1.7 + 2.1 - y0 * 1.4) * 0.38 : 0;
    const r = r0 * (1 + (o.fold || 0) * f * fm);
    let y = y0;
    if (o.hem && j === 0) y += (Math.sin(phi * 5 + 1.3) * 0.6 + Math.sin(phi * 11 + 0.4) * 0.4) * o.hem;
    let p = [Math.sin(phi) * r, y, Math.cos(phi) * r];
    if (o.warp) p = o.warp(p[0], p[1], p[2]);
    v.c = f * fm;
    return p;
  };
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < prof.length - 1; j++) {
      const A = v(i, j), ca = v.c, B = v(i + 1, j), cb = v.c, D = v(i, j + 1), cd = v.c, C = v(i + 1, j + 1), cc = v.c;
      pos.push(...A, ...B, ...D, ...C, ...D, ...B);
      crease.push(ca, cb, cd, cc, cd, cb);
    }
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const col = typeof o.color === 'function' ? (x, y, z, i) => o.color(x, y, z, crease[i] || 0, (y - ymin) / (ymax - ymin || 1)) : o.color;
  b.add(g, o.matrix || null, col, o.emissive || 0, { smooth: o.smooth !== false, sway: o.sway, keep: o.keep, flat: o.flat });
}

function clothColor(base, fold, deep) {
  return (x, y, z, c, t) => (t < 0.06 ? deep : c < -0.5 ? fold : c > 0.62 ? mixHex(base, 0xd6c79a, 0.18) : base);
}

function hoodGeometry() {
  const b = new Builder();
  const prof = [[0.182, -0.2], [0.192, -0.12], [0.195, -0.03], [0.188, 0.05], [0.17, 0.12], [0.14, 0.18], [0.1, 0.225], [0.055, 0.258], [0.0, 0.28]];
  const face = (x, y, z) => z > 0.045 && Math.abs(x) < 0.112 - Math.max(0, y - 0.07) * 0.7 && y > -0.16 && y < 0.13;
  revolve(b, prof, 20, {
    warp: (x, y, z) => {
      const k = clamp((y - 0.02) / 0.26, 0, 1);
      const ridge = 1 - 0.42 * Math.pow(k, 1.4);
      const brim = z > 0 ? 0.05 * clamp((y + 0.04) / 0.12, 0, 1) * clamp((0.24 - y) / 0.12, 0, 1) : 0;
      const fall = z < 0 && y < 0.06 ? 1.14 : 1;
      return [x * ridge * 0.9, y + Math.pow(k, 3) * 0.02 - Math.pow(k, 4) * 0.03, z * fall + brim - Math.pow(k, 1.8) * 0.24];
    },
    folds: 5, fold: 0.03, foldPhase: 1.1, foldMask: (y) => clamp((0.2 - Math.abs(y - 0.02)) / 0.2, 0, 1),
    color: (x, y, z, c) => (Math.abs(x) < 0.014 && y > 0.12 ? FOLD : c < -0.45 || (z < -0.13 && y < -0.02) ? FOLD : CLOTH),
    keep: (x, y, z) => !face(x, y, z),
  });
  b.sphere(0.16, 10, 8, mat(0, -0.01, -0.005, 0, 0, 0, 0.92, 1.05, 1.0), VOID);
  b.sphere(0.12, 10, 6, mat(0, -0.03, 0.06, 0, 0, 0, 0.9, 0.8, 0.62), 0x15181d);
  b.box(0.13, 0.022, 0.02, mat(0, 0.016, 0.138), 0x2e5d66, 0.6);
  b.box(0.042, 0.034, 0.022, mat(0.04, 0.016, 0.142), 0xffffff, 1.5);
  b.box(0.02, 0.016, 0.022, mat(-0.036, 0.016, 0.14), VISOR, 0.7);
  b.add(new THREE.TorusGeometry(0.12, 0.024, 5, 14), mat(0, -0.014, 0.153, -0.16, 0, 0, 0.94, 1.14, 1), LINING, 0, { smooth: true });
  return b.build();
}

function chestGeometry() {
  const b = new Builder();
  revolve(b, [[0.19, -0.02], [0.186, 0.1], [0.182, 0.26], [0.178, 0.4], [0.13, 0.46], [0.0, 0.48]], 14, {
    matrix: mat(0, 0, 0, 0, 0, 0, 1, 1, 0.8), color: (x, y, z) => (z > 0.13 && Math.abs(x) < 0.02 ? COAT2 : COAT),
  });
  for (let k = 0; k < 4; k++) {
    const y = 0.17 + k * 0.075;
    b.box(0.11, 0.022, 0.03, mat(0, y, 0.146, -0.06, 0, 0), FOLD);
    b.box(0.022, 0.028, 0.034, mat(0.012, y, 0.15, -0.06, 0, 0), SHADE);
  }
  b.cyl(0.1, 0.12, 0.1, 10, mat(0, 0.49, 0.0), COAT2);
  b.box(0.045, 0.022, 0.02, mat(0.045, 0.5, 0.105), CORE, 0.9);
  b.cyl(0.196, 0.2, 0.05, 14, mat(0, 0.045, 0, 0, 0, 0, 1, 1, 0.82), FOLD);
  b.cyl(0.188, 0.19, 0.035, 14, mat(0, 0.12, 0, 0, 0, 0, 1, 1, 0.82), DEEP);
  b.box(0.07, 0.05, 0.03, mat(0.0, 0.045, 0.165), PLATE_HI);
  b.box(0.034, 0.018, 0.032, mat(0.0, 0.045, 0.17), CORE, 1.0);
  for (const s of [-1, 1]) {
    b.cyl(0.032, 0.032, 0.11, 8, mat(s * 0.19, -0.02, 0.06), PLATE);
    b.cyl(0.034, 0.034, 0.025, 8, mat(s * 0.19, 0.04, 0.06), PLATE_HI);
  }
  return b.build();
}

function capeGeometry() {
  const b = new Builder();
  const prof = [[0.31, -0.8], [0.304, -0.62], [0.295, -0.42], [0.285, -0.24], [0.278, -0.12], [0.255, -0.03], [0.18, 0.03], [0.09, 0.055]];
  revolve(b, prof, 22, {
    phi0: 0.62, phi1: TAU - 0.62, folds: 8, fold: 0.04, foldMask: (y) => clamp(-(y + 0.12) / 0.4, 0, 1),
    warp: (x, y, z) => {
      const back = clamp(-z / 0.4, 0, 1);
      const lop = y < -0.2 ? ((-y - 0.2) / 0.6) * (0.04 * Math.max(0, x / 0.3)) : 0;
      return [x * 0.96, y - (y < -0.2 ? back * 0.12 * ((-y - 0.2) / 0.6) : 0) - lop, z * 0.84];
    },
    hem: 0.03,
    color: clothColor(CLOTH, FOLD, DEEP),
    sway: (x, y) => clamp(-y / 0.8, 0, 1),
  });
  return b.build();
}

function panelGeometry(phi0, phi1, len, flare) {
  const b = new Builder();
  const prof = [[0.225 + flare, -len], [0.222 + flare, -len * 0.9], [0.212 + flare * 0.5, -len * 0.5], [0.198, 0]];
  revolve(b, prof, Math.max(4, Math.round((phi1 - phi0) * 3.5)), {
    phi0, phi1, folds: 6, fold: 0.04, foldMask: (y) => Math.min(1, -y / (len * 0.6)),
    hem: 0.015,
    color: (x, y, z, c, t) => (t < 0.08 ? COAT2 : c < -0.5 ? 0x1d2025 : COAT),
    sway: (x, y) => clamp(-y / len, 0, 1) * 0.6,
  });
  return b.build();
}

function thighGeometry() {
  const b = new Builder();
  b.cyl(0.068, 0.058, THIGH, 8, mat(0, -THIGH / 2, 0), SUIT);
  b.cyl(0.07, 0.066, 0.03, 8, mat(0, -THIGH * 0.42, 0), FOLD);
  return b.build();
}
function shinGeometry() {
  const b = new Builder();
  b.cyl(0.056, 0.05, SHIN, 8, mat(0, -SHIN / 2, 0), SUIT);
  b.box(0.085, 0.085, 0.045, mat(0, -0.03, 0.048), PLATE);
  b.box(0.11, 0.15, 0.13, mat(0, -SHIN + 0.04, 0.0), 0x1a1e24);
  b.box(0.105, 0.085, 0.22, mat(0, -SHIN - 0.005, 0.04), 0x1a1e24);
  b.box(0.11, 0.03, 0.23, mat(0, -SHIN - 0.04, 0.04), PLATE_HI);
  b.box(0.012, 0.02, 0.11, mat(0.056, -SHIN + 0.0, 0.04), CORE, 0.9);
  return b.build();
}
function upperArmGeometry() {
  const b = new Builder();
  revolve(b, [[0.064, -0.29], [0.06, -0.15], [0.058, 0]], 9, { color: COAT });
  return b.build();
}
function foreArmGeometry(left) {
  const b = new Builder();
  revolve(b, [[0.07, -0.2], [0.065, -0.1], [0.06, 0]], 9, { color: COAT });
  b.cyl(0.072, 0.072, 0.035, 8, mat(0, -0.19, 0), FOLD);
  b.cyl(0.05, 0.047, 0.08, 8, mat(0, -0.24, 0), GLOVE);
  if (left) {
    b.box(0.07, 0.012, 0.05, mat(0, -0.235, 0.056), 0x101418);
    b.box(0.05, 0.014, 0.034, mat(0, -0.235, 0.06), CORE, 1.1);
  }
  b.sphere(0.044, 6, 4, mat(0, -0.3, 0.012, 0, 0, 0, 1, 1.15, 1.1), GLOVE);
  return b.build();
}

// Smoothed normals: the average of the faces meeting at each position (cloth shading).
function smoothNormals(geo) {
  const p = geo.attributes.position;
  const acc = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 2000)},${Math.round(p.getY(i) * 2000)},${Math.round(p.getZ(i) * 2000)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), f = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    f.subVectors(c, b).cross(a.clone().sub(b));
    const len = f.length();
    if (len < 1e-12) continue;
    f.divideScalar(len);
    for (const k of [i, i + 1, i + 2]) {
      const kk = key(k);
      const v = acc.get(kk);
      if (v) v.add(f); else acc.set(kk, f.clone());
    }
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = acc.get(key(i));
    if (v) { const l = v.length() || 1; out[i * 3] = v.x / l; out[i * 3 + 1] = v.y / l; out[i * 3 + 2] = v.z / l; }
  }
  geo.setAttribute('onormal', new THREE.BufferAttribute(out, 3));
  if (!geo.attributes.cloth) geo.setAttribute('cloth', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  if (!geo.attributes.sway) geo.setAttribute('sway', new THREE.BufferAttribute(new Float32Array(p.count), 1));
}

export function pose() {
  return {
    hipY: 0, hipRx: 0, hipRy: 0, hipRz: 0, chestRx: 0.03, chestRy: 0, chestRz: 0, headRx: 0, headRy: 0, headRz: 0,
    lHip: 0, lHipZ: 0.02, lKnee: 0.08, rHip: 0, rHipZ: -0.02, rKnee: 0.08,
    lSh: 0.05, lShZ: 0.14, lShY: 0, lEl: -0.18, rSh: 0.05, rShZ: -0.14, rShY: 0, rEl: -0.18,
    back: 0.04, cape: 0.03, flutter: 0,
  };
}
export function mixPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = lerp(a[k], b[k] ?? a[k], t);
  return o;
}

// A relaxed walk, one cycle per two steps (from Soundings).
export function walkPose(o, p) {
  const c = Math.cos(p * TAU), s = Math.sin(p * TAU);
  const step = 0.5 + 0.5 * Math.cos(p * TAU * 2);
  const lag = (k) => Math.cos(p * TAU - k);
  o.lHip = -0.36 * c - 0.05; o.rHip = 0.36 * c - 0.05;
  o.lKnee = 0.16 + Math.max(0, -s) * 0.72 + Math.max(0, c) * 0.1;
  o.rKnee = 0.16 + Math.max(0, s) * 0.72 + Math.max(0, -c) * 0.1;
  o.lHipZ = 0.03; o.rHipZ = -0.03;
  o.hipY = -0.032 * step + 0.012;
  o.hipRz = 0.045 * s; o.hipRy = -0.09 * c;
  o.chestRx = 0.1 + 0.025 * step; o.chestRy = 0.13 * c; o.chestRz = -0.03 * s;
  o.lSh = 0.24 * lag(0.4); o.rSh = -0.24 * lag(0.4);
  o.lEl = -0.32 - 0.16 * Math.max(0, -lag(0.7)); o.rEl = -0.32 - 0.16 * Math.max(0, lag(0.7));
  o.lShZ = 0.15 + 0.02 * s; o.rShZ = -0.15 + 0.02 * s;
  o.headRx = -0.03 - 0.02 * step; o.headRy = -0.07 * c; o.headRz = 0.02 * s;
  o.back = 0.08 + 0.05 * Math.abs(s); o.cape = 0.11 + 0.06 * step; o.flutter = 0.7;
  return o;
}

export class Seeker {
  constructor(parent) {
    const m = worldMaterial({ unique: true, sway: true, smooth: true, side: THREE.DoubleSide, fogMask: 0, ambient: 0.5 });
    this.material = m;
    const mesh = (geo) => { smoothNormals(geo); return new THREE.Mesh(geo, m); };
    this.root = new THREE.Group();
    this.hips = new THREE.Group();
    this.hips.position.y = HIP;
    this.root.add(this.hips);
    this.chest = new THREE.Group();
    this.hips.add(this.chest);
    this.chest.add(mesh(chestGeometry()));
    this.head = new THREE.Group();
    this.head.position.set(0, SHOULDER + 0.17, 0.0);
    this.chest.add(this.head);
    this.head.add(mesh(hoodGeometry()));
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.205, SHOULDER - 0.03, 0.0);
      sh.add(mesh(upperArmGeometry()));
      const el = new THREE.Group();
      el.position.y = -UPPER;
      sh.add(el);
      el.add(mesh(foreArmGeometry(side > 0)));
      const hand = new THREE.Group();
      hand.position.set(0, -FORE, 0.02);
      el.add(hand);
      this.chest.add(sh);
      return { sh, el, hand, side };
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    const leg = (side, phi0, phi1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, 0, 0);
      hip.add(mesh(thighGeometry()));
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      hip.add(knee);
      knee.add(mesh(shinGeometry()));
      const panel = mesh(panelGeometry(phi0, phi1, 0.44, 0.02));
      panel.position.x = -side * 0.085;
      hip.add(panel);
      this.hips.add(hip);
      return { hip, knee, panel };
    };
    this.legL = leg(1, 0.05, 1.15);
    this.legR = leg(-1, -1.15, -0.05);
    this.back = new THREE.Group();
    this.hips.add(this.back);
    this.back.add(mesh(panelGeometry(1.0, TAU - 1.0, 0.46, 0.04)));
    this.cape = new THREE.Group();
    this.cape.position.y = SHOULDER + 0.06;
    this.chest.add(this.cape);
    this.cape.add(mesh(capeGeometry()));
    parent.add(this.root);
    this._flutter = 0;
    this.root.visible = false;
  }

  apply(o, dt = 1 / 60) {
    this.hips.position.y = HIP + o.hipY;
    this.hips.rotation.set(o.hipRx, o.hipRy, o.hipRz);
    this.chest.rotation.set(o.chestRx, o.chestRy, o.chestRz);
    this.head.rotation.set(o.headRx, o.headRy, o.headRz);
    this.legL.hip.rotation.set(o.lHip, 0, o.lHipZ);
    this.legR.hip.rotation.set(o.rHip, 0, o.rHipZ);
    this.legL.knee.rotation.set(o.lKnee, 0, 0);
    this.legR.knee.rotation.set(o.rKnee, 0, 0);
    this.armL.sh.rotation.set(o.lSh, o.lShY, o.lShZ, 'YXZ');
    this.armR.sh.rotation.set(o.rSh, o.rShY, o.rShZ, 'YXZ');
    this.armL.el.rotation.set(o.lEl, 0, 0);
    this.armR.el.rotation.set(o.rEl, 0, 0);
    this.back.rotation.set(o.back, 0, 0);
    this.cape.rotation.set(o.cape, 0, 0);
    this._flutter = damp(this._flutter, o.flutter, 6, dt);
    this.material.uniforms.uFlutter.value = this._flutter;
  }

  // Two bones: the hand to a point in the world, the elbow turned toward a pole (in the
  // chest's frame; by default down, out and back), blended over the posed arm by w.
  // Call after apply(), with the rig's world matrices current.
  reach(arm, target, w = 1, pole = null) {
    if (w <= 0.001) return;
    this.chest.updateWorldMatrix(true, false);
    const T = _t.copy(target);
    this.chest.worldToLocal(T).sub(arm.sh.position);
    const d = clamp(T.length(), 0.08, UPPER + FORE - 0.004);
    const cosG = clamp((UPPER * UPPER + FORE * FORE - d * d) / (2 * UPPER * FORE), -1, 1);
    const bend = Math.PI - Math.acos(cosG);
    // the hand, seen from the shoulder, with the elbow bent forward by `bend`
    const H = _h.set(0, -UPPER - FORE * Math.cos(bend), FORE * Math.sin(bend)).normalize();
    const dir = T.normalize();
    _q.setFromUnitVectors(H, dir);
    // swivel about the reach until the elbow points as near the pole as it can
    const E = _e.set(0, -1, 0).applyQuaternion(_q);
    const P = pole ? _p.copy(pole) : _p.set(arm.side * 0.55, -1, -0.45);
    E.addScaledVector(dir, -E.dot(dir));
    P.addScaledVector(dir, -P.dot(dir));
    if (E.lengthSq() > 1e-8 && P.lengthSq() > 1e-8) {
      E.normalize(); P.normalize();
      _q2.setFromAxisAngle(dir, Math.atan2(_c.crossVectors(E, P).dot(dir), E.dot(P)));
      _q.premultiply(_q2);
    }
    arm.sh.quaternion.slerp(_q, w);
    arm.el.rotation.x = lerp(arm.el.rotation.x, -bend, w);
    arm.sh.updateMatrixWorld(true);
  }
}

const _t = new THREE.Vector3(), _h = new THREE.Vector3(), _e = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
