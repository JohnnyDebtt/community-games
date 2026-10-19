import * as THREE from 'three';
import { TAU, clamp, damp, dampAngle, hash1 } from '../core/math.js';
import { P, mixHex } from '../core/palette.js';
import { worldMaterial } from '../render/materials.js';
import { Builder, mat } from '../render/build.js';
import { addOutline, smoothNormals } from '../render/outline.js';
import { backpackGeometry } from './backpack.js';
import { groundHeight, walkable, blockedAt } from '../world/layout.js';

// The Seeker: a lone explorer in a long, weathered, sand-gold cloak and a pointed cowl
// with nothing inside but darkness and one white glint of the visor, as in The Seeker's
// own sprites. A small rig (hips, chest, head, arms, legs, three cloak panels) posed on
// the 12 fps grid: the stride follows the ground covered, so the feet never slide; the
// front panels of the cloak ride the thighs, so the cloth parts when it runs.

const WALK = 2.6;      // m/s, an unhurried walk
const RUN = 6.0;
const HIP = 0.86;      // hip joint above the ground
const THIGH = 0.43, SHIN = 0.39;
const SHOULDER = 0.42; // above the hips
const STRIDE_WALK = 1.75, STRIDE_RUN = 3.0;  // meters per cycle (two steps)

const CLOTH = P.gold;
const FOLD = mixHex(P.gold, P.goldShadow, 0.3);
const DEEP = mixHex(P.gold, P.goldShadow, 0.62);
const SHADE = P.goldShadow;
const WORN = mixHex(P.goldShadow, P.ink, 0.3);
const INK = P.ink;
const VOID = P.deepest;

// ------------------------------------------------------------------ the parts
// A surface of revolution from a profile (bottom to top), with optional vertical folds
// and a deformation; cloth is shaded soft, so it reads as heavy fabric.
function revolve(b, prof, seg, o = {}) {
  const phi0 = o.phi0 ?? 0, phi1 = o.phi1 ?? TAU;
  const g = new THREE.BufferGeometry();
  const pos = [], crease = [];
  const ymin = prof[0][1], ymax = prof[prof.length - 1][1];
  const v = (i, j) => {
    const phi = phi0 + ((phi1 - phi0) * i) / seg;
    const [r0, y0] = prof[j];
    const fm = o.foldMask ? o.foldMask(y0) : 1;
    // folds of two frequencies that drift down the cloth, never quite regular
    const n = o.folds || 0;
    const f = n ? Math.sin(phi * n + (o.foldPhase || 0) + y0 * 2.3) * 0.62 + Math.sin(phi * n * 1.7 + 2.1 - y0 * 1.4) * 0.38 : 0;
    const r = r0 * (1 + (o.fold || 0) * f * fm);
    // a worn hem: it waves a little instead of running true
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

// Cloth colors: creases darker in the fold valleys, the hem worn.
function clothColor(base, fold, deep) {
  return (x, y, z, c, t) => (t < 0.06 ? deep : c < -0.5 ? fold : c > 0.62 ? mixHex(base, 0xd6c79a, 0.18) : base);
}

const SUIT = 0x22272e, SUIT2 = 0x2f363f, PLATE = 0x3a434d, PLATE_HI = 0x5d6b78, VISOR = 0x9fe3ec, CORE = 0x91cbde;
const COAT = 0x26292f, COAT2 = 0x33373e, GLOVE = 0x8f979c, LINING = 0x4a4540;

function hoodGeometry() {
  const b = new Builder();
  // a cowl with character: a crest along the crown that sweeps back into a point (as
  // the Seeker's own hood does), a brim jutting over the face, the back falling to the
  // shoulders
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
  // the inside: shadow, a dark mask, the visor's one bright lens
  b.sphere(0.16, 10, 8, mat(0, -0.01, -0.005, 0, 0, 0, 0.92, 1.05, 1.0), VOID);
  b.sphere(0.12, 10, 6, mat(0, -0.03, 0.06, 0, 0, 0, 0.9, 0.8, 0.62), 0x15181d);
  b.box(0.13, 0.022, 0.02, mat(0, 0.016, 0.138), 0x2e5d66, 0.6);
  b.box(0.042, 0.034, 0.022, mat(0.04, 0.016, 0.142), 0xffffff, 1.5);
  b.box(0.02, 0.016, 0.022, mat(-0.036, 0.016, 0.14), VISOR, 0.7);
  // the hood's dark lining, turned back around the face
  b.add(new THREE.TorusGeometry(0.12, 0.024, 5, 14), mat(0, -0.014, 0.153, -0.16, 0, 0, 0.94, 1.14, 1), LINING, 0, { smooth: true });
  return b.build();
}

// The coat under the cape: dark, closed with sand-colored straps, belted.
function chestGeometry() {
  const b = new Builder();
  revolve(b, [[0.19, -0.02], [0.186, 0.1], [0.182, 0.26], [0.178, 0.4], [0.13, 0.46], [0.0, 0.48]], 14, {
    matrix: mat(0, 0, 0, 0, 0, 0, 1, 1, 0.8), color: (x, y, z) => (z > 0.13 && Math.abs(x) < 0.02 ? COAT2 : COAT),
  });
  // the strap closures across the chest, each with a toggle
  for (let k = 0; k < 4; k++) {
    const y = 0.17 + k * 0.075;
    b.box(0.11, 0.022, 0.03, mat(0, y, 0.146, -0.06, 0, 0), FOLD);
    b.box(0.022, 0.028, 0.034, mat(0.012, y, 0.15, -0.06, 0, 0), SHADE);
  }
  // a high collar, a light at the throat
  b.cyl(0.1, 0.12, 0.1, 10, mat(0, 0.49, 0.0), COAT2);
  b.box(0.045, 0.022, 0.02, mat(0.045, 0.5, 0.105), CORE, 0.9);
  // belt and a strap around the waist, a lit buckle, canisters at the hips
  b.cyl(0.196, 0.2, 0.05, 14, mat(0, 0.045, 0, 0, 0, 0, 1, 1, 0.82), FOLD);
  b.cyl(0.188, 0.19, 0.035, 14, mat(0, 0.12, 0, 0, 0, 0, 1, 1, 0.82), DEEP);
  b.box(0.07, 0.05, 0.03, mat(0.0, 0.045, 0.165), PLATE_HI);
  b.box(0.034, 0.018, 0.032, mat(0.0, 0.045, 0.17), CORE, 1.0);
  for (const s of [-1, 1]) {
    b.cyl(0.032, 0.032, 0.11, 8, mat(s * 0.19, -0.02, 0.06), PLATE);
    b.cyl(0.034, 0.034, 0.025, 8, mat(s * 0.19, 0.04, 0.06), PLATE_HI);
  }
  // pack straps
  for (const s of [-1, 1]) {
    b.box(0.04, 0.3, 0.025, mat(s * 0.1, 0.33, 0.15, -0.2, 0, 0), SHADE);
    b.box(0.048, 0.032, 0.03, mat(s * 0.1, 0.25, 0.165, -0.2, 0, 0), PLATE_HI);
  }
  return b.build();
}

// The hooded cape: over the shoulders, open at the front, to mid-thigh, longer behind.
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

// A panel of the coat's skirt: from the hips to the knees.
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

function thighGeometry(left) {
  const b = new Builder();
  b.cyl(0.068, 0.058, THIGH, 8, mat(0, -THIGH / 2, 0), SUIT);
  b.cyl(0.07, 0.066, 0.03, 8, mat(0, -THIGH * 0.42, 0), FOLD);
  if (left) {
    b.box(0.08, 0.075, 0.045, mat(0.06, -THIGH * 0.55, 0.03, 0, 0.5, 0), FOLD);
    b.box(0.08, 0.02, 0.047, mat(0.06, -THIGH * 0.47, 0.03, 0, 0.5, 0), SHADE);
  }
  return b.build();
}
function shinGeometry() {
  const b = new Builder();
  b.cyl(0.056, 0.05, SHIN, 8, mat(0, -SHIN / 2, 0), SUIT);
  // a knee plate, an armored boot with a light strip
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
  // the coat's sleeve with a sand cuff, then a glove
  revolve(b, [[0.07, -0.2], [0.065, -0.1], [0.06, 0]], 9, { color: COAT });
  b.cyl(0.072, 0.072, 0.035, 8, mat(0, -0.19, 0), FOLD);
  b.cyl(0.05, 0.047, 0.08, 8, mat(0, -0.24, 0), GLOVE);
  if (left) {
    // the wrist screen: the visor's Codex
    b.box(0.07, 0.012, 0.05, mat(0, -0.235, 0.056), 0x101418);
    b.box(0.05, 0.014, 0.034, mat(0, -0.235, 0.06), CORE, 1.1);
  }
  b.sphere(0.044, 6, 4, mat(0, -0.3, 0.012, 0, 0, 0, 1, 1.15, 1.1), GLOVE);
  return b.build();
}

function rodGeometry() {
  const b = new Builder();
  // a telescopic rod: grip, a reel unit with a lit readout, nested sections, a lit tip
  b.cyl(0.018, 0.022, 0.24, 6, mat(0, 0.0, 0), 0x1a1e24);
  b.box(0.06, 0.07, 0.05, mat(0.04, 0.03, 0), PLATE);
  b.box(0.005, 0.03, 0.03, mat(0.071, 0.035, 0), CORE, 1.0);
  b.cyl(0.026, 0.026, 0.02, 8, mat(0.04, 0.03, 0.03, Math.PI / 2, 0, 0), PLATE_HI);
  b.cyl(0.011, 0.013, 0.26, 5, mat(0, 0.25, 0), PLATE_HI);
  b.cyl(0.007, 0.009, 0.24, 4, mat(0, 0.5, 0), 0x8a96a0);
  b.cyl(0.004, 0.006, 0.2, 4, mat(0, 0.71, 0), 0xa2a6a7);
  b.box(0.014, 0.014, 0.014, mat(0, 0.81, 0), VISOR, 1.4);
  return b.build();
}

function augerGeometry() {
  const b = new Builder();
  // a thermal drill: a housing with a lit band, a bit that glows where it bites
  b.cyl(0.02, 0.02, 0.86, 6, mat(0, -0.45, 0), PLATE_HI);
  for (let i = 0; i < 6; i++) b.box(0.13, 0.012, 0.05, mat(0, -0.62 - i * 0.05, 0, 0, i * 1.05, 0.3), 0x8a96a0);
  b.box(0.012, 0.06, 0.012, mat(0, -0.9, 0), 0xe9a35b, 1.2);
  b.cyl(0.06, 0.06, 0.16, 8, mat(0, -0.08, 0), PLATE);
  b.cyl(0.062, 0.062, 0.02, 8, mat(0, -0.06, 0), CORE, 1.0);
  b.box(0.38, 0.03, 0.03, mat(0, 0, 0), 0x1a1e24);
  for (const s of [-1, 1]) b.cyl(0.028, 0.028, 0.08, 6, mat(s * 0.18, 0.02, 0, 0, 0, Math.PI / 2), PLATE);
  return b.build();
}

function stoolGeometry() {
  const b = new Builder();
  // a folding field stool
  b.box(0.3, 0.035, 0.24, mat(0, 0.3, 0), PLATE);
  b.box(0.3, 0.012, 0.24, mat(0, 0.322, 0), 0x2f363f);
  for (const s of [-1, 1]) {
    b.box(0.022, 0.38, 0.022, mat(s * 0.11, 0.15, 0, 0.6, 0, 0), PLATE_HI);
    b.box(0.022, 0.38, 0.022, mat(s * 0.11, 0.15, 0, -0.6, 0, 0), PLATE_HI);
  }
  return b.build();
}

// ------------------------------------------------------------------ poses
function pose() {
  return {
    hipY: 0, hipRx: 0, hipRy: 0, hipRz: 0, chestRx: 0.03, chestRy: 0, chestRz: 0, headRx: 0, headRy: 0, headRz: 0,
    lHip: 0, lHipZ: 0.02, lKnee: 0.08, rHip: 0, rHipZ: -0.02, rKnee: 0.08,
    lSh: 0.05, lShZ: 0.14, lShY: 0, lEl: -0.18, rSh: 0.05, rShZ: -0.14, rShY: 0, rEl: -0.18,
    back: 0.04, cape: 0.03, flutter: 0,
  };
}
const cyc = (p) => Math.cos(p * TAU);
const syc = (p) => Math.sin(p * TAU);

// A relaxed traveler's walk: knees soft through the stance and bent in the swing, the
// body dipping at each footfall, the hips swaying over the standing foot and turning
// with the leg in front while the shoulders turn against them, arms hanging loose and
// trailing the shoulders a little, the head steady.
function walkPose(o, p) {
  const c = cyc(p), s = syc(p);
  const step = 0.5 + 0.5 * Math.cos(p * TAU * 2);       // 1 at each footfall
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
}

function runPose(o, p) {
  const c = cyc(p), s = syc(p);
  o.lHip = -0.9 * c - 0.12; o.rHip = 0.9 * c - 0.12;
  o.lKnee = 0.35 + Math.max(0, -s) * 1.45 + Math.max(0, c) * 0.25; o.rKnee = 0.35 + Math.max(0, s) * 1.45 + Math.max(0, -c) * 0.25;
  o.hipY = 0.05 - 0.085 * Math.abs(c);
  o.hipRy = -0.08 * c; o.chestRy = 0.14 * c; o.chestRx = 0.2; o.headRx = -0.16;
  o.lSh = 0.85 * c; o.rSh = -0.85 * c; o.lEl = -1.25; o.rEl = -1.25; o.lShZ = 0.2; o.rShZ = -0.2;
  o.back = 0.22 + 0.08 * Math.abs(syc(p * 2)); o.cape = 0.5 + 0.12 * Math.abs(syc(p * 2)); o.flutter = 1.4;
}

export class Player {
  constructor(scene) {
    const m = worldMaterial({ unique: true, sway: true, smooth: true, side: THREE.DoubleSide });
    this.material = m;
    const mesh = (geo) => {
      smoothNormals(geo);
      const x = new THREE.Mesh(geo, m);
      addOutline(x);
      return x;
    };
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
    // arms
    const arm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(side * 0.205, SHOULDER - 0.03, 0.0);
      sh.add(mesh(upperArmGeometry()));
      const el = new THREE.Group();
      el.position.y = -0.28;
      sh.add(el);
      el.add(mesh(foreArmGeometry(side > 0)));
      const hand = new THREE.Group();
      hand.position.set(0, -0.28, 0.02);
      el.add(hand);
      this.chest.add(sh);
      return { sh, el, hand };
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    // legs, each carrying a front panel of the cloak
    const leg = (side, phi0, phi1, seed) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, 0, 0);
      hip.add(mesh(thighGeometry(side > 0)));
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
    this.legL = leg(1, 0.05, 1.15, 3);
    this.legR = leg(-1, -1.15, -0.05, 9);
    // the back of the cloak, from the hips: it trails when running
    this.back = new THREE.Group();
    this.hips.add(this.back);
    this.back.add(mesh(panelGeometry(1.0, TAU - 1.0, 0.46, 0.04)));
    // the cape hangs from the shoulders and trails behind
    this.cape = new THREE.Group();
    this.cape.position.y = SHOULDER + 0.06;
    this.chest.add(this.cape);
    this.cape.add(mesh(capeGeometry()));
    // the pack: on the back, or set down beside the Seeker when it sits
    this.packHolder = new THREE.Group();
    this.chest.add(this.packHolder);
    this.packLevel = 0;
    this._packs = {};
    this.rod = mesh(rodGeometry());
    this.rod.visible = false;
    this.armR.hand.add(this.rod);
    this.auger = mesh(augerGeometry());
    this.auger.visible = false;
    this.root.add(this.auger);
    this.stool = mesh(stoolGeometry());
    this.stool.visible = false;
    scene.add(this.stool);
    scene.add(this.root);
    this.scene = scene;

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.facing = 0;          // yaw, 0 = +z
    this.mode = 'walk';       // walk | sit | hold | drill | crouch | leap | land | inside
    this.speed = 0;
    this.speedMul = 1;
    this.frame = 0;
    this.onStep = null;
    this.rodTip = new THREE.Vector3();
    this.rodBend = 0;
    this.jig = 0;
    this.reel = 0;
    this.drill = 0;
    this.castHold = 0;
    this.castFlick = 0;
    this.strike = 0;
    this.startle = 0;
    this.cheer = 0;
    this.landT = 0;
    this.hidden = false;
    this.enabled = true;
    this.extraBlock = null;
    this._phase = 0;
    this._lastQ = -1;
    this._flutter = 0;
    this._look = 0;
    this._t = 0;
    this._packOnBack = true;
  }

  // level 1..3: the Seeker's own backpacks, at the game's proportions.
  async setPack(level) {
    level = clamp(level | 0, 1, 3);
    if (this.packLevel === level) return;
    this.packLevel = level;
    if (!this._packs[level]) {
      const mesh = new THREE.Mesh(backpackGeometry(level), this.material);
      addOutline(mesh);
      this._packs[level] = mesh;
    }
    this.packHolder.clear();
    this.packHolder.add(this._packs[level]);
    this._packs[level].scale.setScalar(0.88);
    this._placePack(true);
  }

  _placePack(force = false) {
    const seated = this.mode === 'sit' || this.mode === 'hold';
    if (!force && seated === !this._packOnBack) return;
    this._packOnBack = !seated;
    if (seated) {
      // set down on the ice beside the Seeker, on the far side from the hole's camera
      this.root.add(this.packHolder);
      this.packHolder.position.set(0.62, 0, -0.32);
      this.packHolder.rotation.set(0, Math.PI + 0.9, 0);
    } else {
      // low on the back, as in the game: its bottom a little above the ground
      this.chest.add(this.packHolder);
      this.packHolder.position.set(0, 0.56 - HIP, -0.2);
      this.packHolder.rotation.set(0.05, Math.PI, 0);
    }
  }

  place(x, z, facing = 0) {
    this.pos.set(x, groundHeight(x, z), z);
    this.facing = facing;
    this.vel.set(0, 0, 0);
    this.sync();
  }

  // Move from input (axis relative to the camera's yaw).
  move(dt, axis, camYaw, run) {
    if (this.mode !== 'walk' || !this.enabled) {
      this.vel.set(0, 0, 0);
      this.speed = 0;
      return;
    }
    const sx = Math.sin(camYaw), cx = Math.cos(camYaw);
    // forward is away from the camera
    const fx = -sx * -axis.y + cx * axis.x;
    const fz = -cx * -axis.y - sx * axis.x;
    const mag = Math.min(1, Math.hypot(axis.x, axis.y));
    const target = (run ? RUN : WALK) * mag * this.speedMul;
    const fl = Math.hypot(fx, fz) || 1;
    const tx = mag > 0.01 ? (fx / fl) * target : 0;
    const tz = mag > 0.01 ? (fz / fl) * target : 0;
    this.vel.x = damp(this.vel.x, tx, mag > 0.01 ? 9 : 12, dt);
    this.vel.z = damp(this.vel.z, tz, mag > 0.01 ? 9 : 12, dt);
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    if (this._free(nx, nz)) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else if (this._free(nx, this.pos.z)) {
      this.pos.x = nx;
      this.vel.z = 0;
    } else if (this._free(this.pos.x, nz)) {
      this.pos.z = nz;
      this.vel.x = 0;
    } else {
      this.vel.set(0, 0, 0);
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.3) this.facing = dampAngle(this.facing, Math.atan2(this.vel.x, this.vel.z), 12, dt);
    this.pos.y = damp(this.pos.y, groundHeight(this.pos.x, this.pos.z), 20, dt);
  }

  _free(x, z) {
    return walkable(x, z) && !blockedAt(x, z, 0.35) && !(this.extraBlock && this.extraBlock(x, z));
  }

  faceTowards(x, z, dt, rate = 10) {
    this.facing = dampAngle(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  // Poses on the 12 fps grid.
  animate(frame, dt, time = frame / 12) {
    this.frame = frame;
    this._t = time;
    dt = dt || 1 / 60;
    const o = pose();
    const moving = this.mode === 'walk' && this.speed > 0.35;
    const running = this.speed > (WALK * this.speedMul + RUN * this.speedMul) / 2 - 0.3;
    this.castFlick = Math.max(0, this.castFlick - dt * 4);
    this.strike = Math.max(0, this.strike - dt * 3.5);
    this.startle = Math.max(0, this.startle - dt * 3);
    this.landT = Math.max(0, this.landT - dt * 3.5);
    if (this.mode !== 'hold') this.cheer = Math.max(0, this.cheer - dt);
    this.rod.visible = false;
    this.auger.visible = false;
    this.stool.visible = false;
    if (moving) {
      // the stride follows the ground: one cycle per two steps
      const stride = running ? STRIDE_RUN : STRIDE_WALK;
      this._phase = (this._phase + (this.speed * dt) / stride) % 1;
      const F = running ? 6 : 8;
      const q = Math.floor(this._phase * F) / F;
      if (running) runPose(o, q); else walkPose(o, q);
      // a footfall each time a foot comes down
      const contact = Math.floor(this._phase * 2);
      if (contact !== this._lastQ) {
        this._lastQ = contact;
        if (this.onStep) this.onStep(contact, running);
      }
    } else if (this.mode === 'walk' || this.mode === 'inside') {
      // standing: breathing, the weight shifting, a look around now and then
      const k = Math.floor(time * 3) / 3;
      o.hipY = Math.sin(k * 2.4) * 0.006;
      o.chestRx = 0.04 + Math.sin(k * 2.4) * 0.012;
      o.lSh = 0.05 + Math.sin(k * 2.4) * 0.03; o.rSh = 0.05 + Math.sin(k * 2.4 + 0.4) * 0.03;
      const look = Math.floor(time / 6.5);
      const ph = time / 6.5 - look;
      const side = hash1(look * 7 + 3) - 0.5;
      if (ph > 0.55 && ph < 0.85) { o.headRy = side * 1.1; o.chestRy = side * 0.25; }
      if (this.mode === 'inside' && ph > 0.2 && ph < 0.5) { o.headRy = -0.7; o.headRx = 0.1; }
      this._phase = 0;
      this._lastQ = -1;
    }
    if (this.mode === 'sit') this._sitPose(o, time);
    else if (this.mode === 'hold') this._holdPose(o, time);
    else if (this.mode === 'drill') {
      this.auger.visible = true;
      this.auger.position.set(0, 1.02 - this.drill * 0.3, 0.42);
      this.auger.rotation.set(0, frame * 0.9, 0);
      o.chestRx = 0.42; o.headRx = 0.2; o.hipY = -0.06 + 0.012 * (frame % 2);
      o.lHip = -0.25; o.rHip = -0.25; o.lKnee = 0.4; o.rKnee = 0.4;
      o.lSh = -0.85 + 0.15 * Math.sin(frame * 0.9); o.rSh = -0.85 + 0.15 * Math.cos(frame * 0.9);
      o.lEl = -0.55; o.rEl = -0.55; o.lShZ = -0.15; o.rShZ = 0.15;
    } else if (this.mode === 'crouch') {
      o.hipY = -0.3; o.lHip = -0.95; o.rHip = -0.95; o.lKnee = 1.7; o.rKnee = 1.7; o.chestRx = 0.45; o.headRx = -0.5;
      o.lSh = 0.7; o.rSh = 0.7; o.lEl = -0.3; o.rEl = -0.3; o.back = 0.2; o.cape = 0.25;
    } else if (this.mode === 'leap') {
      o.hipY = 0.02; o.lHip = -1.25; o.rHip = -1.0; o.lKnee = 1.9; o.rKnee = 1.6; o.chestRx = -0.05; o.headRx = -0.45;
      o.lSh = -2.7; o.rSh = -2.7; o.lEl = -0.2; o.rEl = -0.2; o.lShZ = 0.3; o.rShZ = -0.3; o.back = 0.4; o.cape = 0.7; o.flutter = 1.2;
    }
    if (this.landT > 0) {
      const k = this.landT;
      o.hipY -= 0.26 * k; o.lHip -= 0.8 * k; o.rHip -= 0.8 * k; o.lKnee += 1.4 * k; o.rKnee += 1.4 * k; o.chestRx += 0.35 * k;
      o.lSh += 0.5 * k; o.rSh += 0.5 * k;
    }
    this._apply(o, dt);
    this._placePack();
    this.root.visible = !this.hidden;
    this.sync();
  }

  _sitPose(o, time) {
    const frame = this.frame;
    // seated low on the stool, leaning to the hole
    this.stool.visible = true;
    this.stool.position.set(this.pos.x - Math.sin(this.facing) * 0.06, this.pos.y, this.pos.z - Math.cos(this.facing) * 0.06);
    this.stool.rotation.y = this.facing;
    o.hipY = -(HIP - 0.36);
    o.lHip = -1.42; o.rHip = -1.42; o.lKnee = 1.32; o.rKnee = 1.32; o.lHipZ = 0.16; o.rHipZ = -0.16;
    o.chestRx = 0.2 + this.rodBend * 0.08; o.headRx = 0.3; o.back = 0.5; o.cape = -0.12; o.lap = true;
    // the rod in the right hand, the left on the reel
    this.rod.visible = true;
    const breathe = Math.sin(Math.floor(time * 3) * 2.4) * 0.02;
    o.rSh = -0.9 - this.jig * 0.32 - this.rodBend * 0.2 + breathe; o.rEl = -0.55; o.rShZ = -0.06;
    o.lSh = -0.78; o.lEl = -0.95; o.lShZ = -0.32; o.lShY = 0.3;
    if (this.castHold > 0) {
      // winding up: the rod back over the shoulder while the meter runs
      const k = Math.min(1, this.castHold * 2 + 0.3);
      o.rSh = -0.9 - k * 1.5; o.rEl = -0.4 - k * 0.5; o.chestRx = 0.02; o.chestRy = 0.25 * k; o.headRx = 0.1;
    }
    if (this.castFlick > 0) {
      // the flick forward
      const k = this.castFlick;
      o.rSh = -0.9 + k * 0.5; o.chestRx = 0.3 + k * 0.1; o.rEl = -0.3;
    }
    if (this.strike > 0) {
      // the hookset: a sharp lift
      const k = this.strike;
      o.rSh = -0.9 - 1.1 * k; o.lSh = -0.78 - 0.6 * k; o.chestRx = 0.2 - 0.35 * k; o.headRx = 0.1;
    }
    if (this.startle > 0) o.headRx = 0.3 - 0.35 * this.startle;
    if (this.reel) {
      // cranking: the left forearm circles, on the 12 fps grid
      const a = frame * 1.6;
      o.lEl = -0.95 + Math.sin(a) * 0.3; o.lSh = -0.78 + Math.cos(a) * 0.12;
    }
    this.rod.rotation.set(1.2 + this.jig * 0.18 - this.rodBend * 0.35 - this.strike * 0.3 - this.castHold * 0.5, 0.1, 0);
  }

  _holdPose(o, time) {
    // standing, holding the catch up high for the visor to scan
    o.chestRx = -0.1; o.headRx = -0.35; o.cape = 0.18;
    o.lSh = -2.75; o.rSh = -2.75; o.lEl = -0.32; o.rEl = -0.32; o.lShZ = 0.32; o.rShZ = -0.32;
    o.lHipZ = 0.08; o.rHipZ = -0.08;
    if (this.cheer > 0) {
      // a little hop for something new
      const k = Math.floor(time * 12) % 4;
      o.hipY = [0, 0.05, 0.08, 0.05][k] * Math.min(1, this.cheer);
      o.lKnee = 0.3 * (1 - [0, 0.05, 0.08, 0.05][k] * 10) * Math.min(1, this.cheer) + 0.08;
      o.rKnee = o.lKnee;
      this.cheer = Math.max(0, this.cheer - 1 / 60);
    }
  }

  _apply(o, dt) {
    const hp = this.hips, c = this.chest;
    hp.position.y = HIP + o.hipY;
    hp.rotation.set(o.hipRx, o.hipRy, o.hipRz);
    c.rotation.set(o.chestRx, o.chestRy, o.chestRz);
    this.head.rotation.set(o.headRx, o.headRy, o.headRz);
    this.legL.hip.rotation.set(o.lHip, 0, o.lHipZ);
    this.legR.hip.rotation.set(o.rHip, 0, o.rHipZ);
    this.legL.knee.rotation.set(o.lKnee, 0, 0);
    this.legR.knee.rotation.set(o.rKnee, 0, 0);
    this.armL.sh.rotation.set(o.lSh, o.lShY, o.lShZ, 'YXZ');
    this.armR.sh.rotation.set(o.rSh, o.rShY, o.rShZ, 'YXZ');
    this.armL.el.rotation.set(o.lEl, 0, 0);
    this.armR.el.rotation.set(o.rEl, 0, 0);
    // the front panels hang from the hips but follow the thighs (less than fully, so
    // they open); the back panel trails
    const lap = o.lap ? 0.62 : 1;
    this.legL.panel.scale.y = lap;
    this.legR.panel.scale.y = lap;
    // seated, the back of the cloak hangs to the ice behind the stool
    this.back.scale.set(1, o.lap ? 0.8 : 1, 1);
    this.back.rotation.set(o.back, 0, 0);
    this.cape.rotation.set(o.cape, 0, 0);
    this._flutter = damp(this._flutter, o.flutter, 6, dt);
    this.material.uniforms.uFlutter.value = this._flutter;
  }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    this.root.updateMatrixWorld(true);
    this.rodTip.set(0, 0.78, 0).applyMatrix4(this.rod.matrixWorld);
  }
}
