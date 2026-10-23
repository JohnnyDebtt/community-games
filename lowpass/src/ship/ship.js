import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { worldMaterial, halo, U } from '../render/materials.js';
import { FOG, LAYER_FX } from '../render/pipeline.js';
import { damp, clamp, lerp, smoothstep, TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { canopyTop, mountainEnv } from '../world/terrain.js';
import { Hull, DOOR } from './hull.js';
import { SHIPS } from './designs.js';

// The ship: Seeker technology as the codex describes it, dark and minimal, fused with the
// organic. The first, the Seed, is a long black hull like a seed, ribs over it like a vine
// that has grown around it, two swept fins, and a pale core of light at its tail that
// lights the treetops it passes over; a band of warm windows: someone is inside. The
// others in the hangar (designs.js) are its hull changed (hull.js), with wings, ribs,
// colors and a core of their own, and fly as they are built to.
//
// Local space: +z forward, +y up, the cabin floor at y = 0.
//
// Every ship can land, where a clearing lets it (landing.js): legs come down from its belly
// and a ramp folds down from its door, on the right.

const CLEARANCE = 17;               // above the canopy
const LEG = 1.5;                    // landed, its belly stands this high over the ground
const CLIMB = 0.45;                 // the slope it climbs a mountain at

const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const lift = (c, k) => mixHex(c, 0xffffff, k);

function hullGeometry(H, look) {
  const b = new Builder();
  const SEG = 28;
  const zs = [];
  for (let z = H.zMin; z < H.zMax; z += 0.72) zs.push(z);
  zs.push(H.zMax);
  const win = look.window ?? mixHex(0xcfdde4, 0xaf634b, 0.28);
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
      const z0 = zs[i], z1 = zs[i + 1];
      const p00 = H.hullPoint(z0, a0), p01 = H.hullPoint(z0, a1), p10 = H.hullPoint(z1, a0), p11 = H.hullPoint(z1, a1);
      const am = (a0 + a1) / 2, zm = (z0 + z1) / 2;
      const s = Math.sin(am);
      const w = H.isWindow(zm, am);
      let col = s > 0.55 ? look.top : s > -0.2 ? look.side : look.belly;
      if (i % 4 === 0 && !w) col = look.seam;
      // the chine: a rim where side meets belly
      const rim = Math.abs(s + 0.22) < 0.09;
      if (rim) col = look.rim;
      let em = rim && !w ? look.rimGlow || 0 : 0;
      if (w) { col = w === 'front' ? win : mixHex(win, 0x6c7983, 0.25); em = 0.55; }
      // the door: a panel, its edges pale
      if (H.isDoor(zm, am)) col = H.isDoor(zm - 0.4, am) && H.isDoor(zm + 0.4, am) && H.isDoor(zm, am + 0.25) && H.isDoor(zm, am - 0.25) ? mixHex(look.side, look.belly, 0.5) : look.edge;
      b.quad(p00, p01, p11, p10, col, em);
    }
  }
  return b.build();
}

// The ribs: dark vines grown over the hull (the Seed's), flat bands, or plates and a crest.
function ribGeometry(H, look) {
  const b = new Builder();
  const spine = (z0, z1, n, f) => { const sp = []; for (let k = 0; k <= n; k++) sp.push(f(z0 + (k / n) * (z1 - z0), k)); return sp; };
  if (look.ribs === 'vine') {
    for (const rz of H.ribs) {
      const pts = [];
      for (let k = 0; k <= 30; k++) {
        const a = -0.35 + (k / 30) * (Math.PI + 0.7);
        pts.push(v3(H.hullPoint(rz + Math.sin(k * 0.9 + rz) * 0.12, a, 1.03)));
      }
      b.tube(pts, (t) => 0.16 + Math.sin(t * 9 + rz) * 0.03, 5, look.rib);
    }
    // a vine along the spine, wrapping a little side to side, and vertebrae on it
    const sp = spine(H.zOf(-10.4), 5.1, 40, (z, k) => { const p = H.hullPoint(z, Math.PI / 2 + Math.sin(k * 0.55) * 0.12, 1.04); return new THREE.Vector3(p[0], p[1] + 0.05, p[2]); });
    b.tube(sp, (t) => 0.2 * (1 - t * 0.6), 5, look.rib);
    const z0 = H.zOf(-9.2), n = Math.floor((2.8 - z0) / 1.5) + 1;
    for (let k = 0; k < n; k++) {
      const p = H.hullPoint(z0 + k * 1.5, Math.PI / 2, 1.04), s = 1 - (k / n) * 0.6;
      b.box(0.34 * s, 0.32 * s, 0.6 * s, mat(p[0], p[1] + 0.22 * s, p[2], 0.2, 0, 0), mixHex(look.rib, look.belly, 0.6));
    }
  } else if (look.ribs === 'bands') {
    // flat bands right round the hull, and a keel line under it
    for (const rz of H.ribs) {
      for (let k = 0; k < 36; k++) {
        const a0 = (k / 36) * TAU, a1 = ((k + 1) / 36) * TAU;
        const A = H.hullPoint(rz - 0.08, a0, 1.02), B = H.hullPoint(rz - 0.08, a1, 1.02), C = H.hullPoint(rz + 0.08, a1, 1.02), D = H.hullPoint(rz + 0.08, a0, 1.02);
        b.quad(A, B, C, D, look.rib);
      }
    }
    b.tube(spine(H.zOf(-10.6), H.zOf(11.2), 30, (z) => v3(H.hullPoint(z, -Math.PI / 2, 1.02))), 0.12, 5, look.rib);
    b.tube(spine(H.zOf(-10.6), H.zOf(9.5), 30, (z) => v3(H.hullPoint(z, Math.PI / 2, 1.02))), 0.1, 5, look.rib);
  } else {
    // plates: a sawtooth crest down the spine, angled plates at the chines
    const z0 = H.zOf(-9.4);
    for (let z = z0; z < 3.2; z += 1.15) {
      const p = H.hullPoint(z, Math.PI / 2, 1.0), h = 0.5 + 0.5 * Math.sin(((z - z0) / (3.2 - z0)) * Math.PI);
      b.tri([p[0] - 0.08, p[1], p[2] - 0.5], [p[0] - 0.08, p[1] + 0.7 * h, p[2] - 0.65], [p[0] - 0.08, p[1], p[2] + 0.45], look.rib);
      b.tri([p[0] + 0.08, p[1], p[2] - 0.5], [p[0] + 0.08, p[1], p[2] + 0.45], [p[0] + 0.08, p[1] + 0.7 * h, p[2] - 0.65], look.rib);
    }
    for (const rz of H.ribs) for (const sd of [-1, 1]) {
      const a = sd > 0 ? -0.05 : Math.PI + 0.05;
      const p = H.hullPoint(rz, a, 1.02);
      b.box(0.12, 0.9, 1.6, mat(p[0], p[1], p[2], 0, 0, sd * 0.25), look.rib);
    }
  }
  return b.build();
}

// a swept blade: two root points on the hull, two tip points
function blade(b, root0, root1, tip, tip2, thick, col, edge) {
  const n = new THREE.Vector3();
  const A = v3(root0), B = v3(root1), Cc = v3(tip), D = v3(tip2);
  n.subVectors(B, A).cross(new THREE.Vector3().subVectors(Cc, A)).normalize().multiplyScalar(thick / 2);
  const up = (v) => [v.x + n.x, v.y + n.y, v.z + n.z], dn = (v) => [v.x - n.x, v.y - n.y, v.z - n.z];
  b.quad(up(A), up(B), up(Cc), up(D), col);
  b.quad(dn(A), dn(D), dn(Cc), dn(B), col);
  b.quad(up(D), up(Cc), dn(Cc), dn(D), edge);
  b.quad(up(B), dn(B), dn(Cc), up(Cc), edge);
}

// A moth's wing: an ellipse (scalloped) in a plane tilted up by `dih`, banded like a
// moth's, an eye on it.
function mothWing(b, sd, cx, cy, cz, rx, rz, dih, look) {
  const R = 7, T = 36, pt = (r, t) => {
    const e = 1 + 0.05 * Math.sin(t * 9);
    const lx = Math.cos(t) * rx * r * e, lz = Math.sin(t) * rz * r * e;
    return [cx + sd * lx * Math.cos(dih), cy + lx * Math.sin(dih), cz + lz];
  };
  const eye = (r, t) => Math.hypot(Math.cos(t) * r - 0.4, (Math.sin(t) * r * rz) / rx + 0.05);
  const pale = mixHex(look.fin, look.rim, 0.55), dark = mixHex(look.fin, look.belly, 0.5);
  for (let i = 0; i < R; i++) for (let k = 0; k < T; k++) {
    const r0 = i / R, r1 = (i + 1) / R, t0 = (k / T) * TAU, t1 = ((k + 1) / T) * TAU;
    const rm = (r0 + r1) / 2, d = eye(rm, (t0 + t1) / 2);
    let col = rm < 0.3 ? dark : rm > 0.62 && rm < 0.76 ? pale : look.fin;
    if (r1 > 0.99) col = dark;
    if (d < 0.26) col = look.edge;
    if (d < 0.19) col = 0x1a120d;
    if (d < 0.1) col = lift(look.core, 0.2);
    const em = d < 0.1 ? 0.9 : 0;
    const A = pt(r0, t0), B = pt(r0, t1), C = pt(r1, t1), D = pt(r1, t0);
    b.quad(A, B, C, D, col, em);
    b.quad(A, D, C, B, col, em);
  }
}

// The wings, by kind, and where their lights are.
function finGeometry(H, look) {
  const b = new Builder();
  const nav = [];
  const Z = (z) => H.zOf(z);
  const side = (sd, a) => (sd > 0 ? a : Math.PI - a);
  if (look.fins === 'swept') {
    for (const s of [-1, 1]) {
      blade(b, H.hullPoint(Z(-3), side(s, -0.35)), H.hullPoint(Z(-9.2), side(s, -0.35)), [s * 7.9, -1.6, Z(-10.6)], [s * 6.2, -1.0, Z(-6.4)], 0.22, look.fin, look.edge);
      nav.push([s * 7.9, -1.6, Z(-10.6)]);
    }
    blade(b, H.hullPoint(Z(-6.2), Math.PI / 2), H.hullPoint(Z(-10.2), Math.PI / 2), [0, 6.6, Z(-12.2)], [0, 5.0, Z(-9.6)], 0.2, look.fin, look.edge);
    nav.push([0, 6.6, Z(-12.2)]);
  } else if (look.fins === 'long') {
    // a heron's: long and narrow, swept far back, a tall thin tail
    for (const s of [-1, 1]) {
      blade(b, H.hullPoint(Z(1.4), side(s, -0.15)), H.hullPoint(Z(-5.5), side(s, -0.15)), [s * 12.6, -0.2, Z(-11.4)], [s * 11.4, 0.0, Z(-8.6)], 0.18, look.fin, look.edge);
      nav.push([s * 12.6, -0.2, Z(-11.4)]);
    }
    blade(b, H.hullPoint(Z(-7.4), Math.PI / 2), H.hullPoint(Z(-10.6), Math.PI / 2), [0, 6.2, Z(-13.4)], [0, 5.3, Z(-11.6)], 0.16, look.fin, look.edge);
    nav.push([0, 6.2, Z(-13.4)]);
  } else if (look.fins === 'moth') {
    for (const s of [-1, 1]) {
      mothWing(b, s, s * 9.2, 2.1, Z(-2.2), 8.6, 5.6, 0.26, look);
      mothWing(b, s, s * 7.0, 1.2, Z(-8.2), 6.2, 4.2, 0.14, look);
      nav.push([s * 17.4, 4.3, Z(-2.2)]);
      // feathered feelers over the nose
      const pts = [];
      for (let k = 0; k <= 16; k++) { const t = k / 16; pts.push(new THREE.Vector3(s * (0.25 + t * 1.9), 2.3 + t * 2.6 - t * t * 0.9, Z(9.6) + t * 3.2)); }
      b.tube(pts, (t) => 0.07 * (1 - t * 0.5), 4, look.rib);
      for (let k = 2; k < 16; k += 2) { const p = pts[k]; b.box(0.03, 0.45 * (1 - k / 20), 0.05, mat(p.x, p.y + 0.12, p.z - 0.1, -0.5, 0, s * 0.4), look.rib); }
    }
  } else if (look.fins === 'delta') {
    // a kestrel's: a sharp delta, two tail fins canted out
    for (const s of [-1, 1]) {
      blade(b, H.hullPoint(Z(3.6), side(s, -0.3)), H.hullPoint(Z(-9.6), side(s, -0.3)), [s * 9.8, -1.3, Z(-11.0)], [s * 9.2, -1.2, Z(-9.4)], 0.2, look.fin, look.edge);
      blade(b, H.hullPoint(Z(-6.8), side(s, 1.15)), H.hullPoint(Z(-10.4), side(s, 1.15)), [s * 3.6, 5.3, Z(-12.4)], [s * 2.9, 4.4, Z(-10.0)], 0.16, look.fin, look.edge);
      nav.push([s * 9.8, -1.3, Z(-11.0)], [s * 3.6, 5.3, Z(-12.4)]);
      // a lit edge along each wing
      b.box(0.1, 0.06, 6.6, mat(s * 6.9, -0.95, Z(-6.9), 0, s * 0.62, 0), look.rim, 1.6);
    }
  } else if (look.fins === 'ring') {
    // an ark's: a ring wing round the tail on four struts, small stabilizers
    const zr = Z(-8.6), Rr = 5.4;
    for (let k = 0; k < 40; k++) {
      const a0 = (k / 40) * TAU, a1 = ((k + 1) / 40) * TAU, y0 = 1.45;
      const P = (a, r, z) => [Math.cos(a) * r, y0 + Math.sin(a) * r, z];
      b.quad(P(a0, Rr, zr - 1.4), P(a1, Rr, zr - 1.4), P(a1, Rr, zr + 1.4), P(a0, Rr, zr + 1.4), look.fin);
      b.quad(P(a0, Rr - 0.2, zr + 1.4), P(a1, Rr - 0.2, zr + 1.4), P(a1, Rr - 0.2, zr - 1.4), P(a0, Rr - 0.2, zr - 1.4), look.fin);
      b.quad(P(a0, Rr - 0.2, zr + 1.4), P(a0, Rr, zr + 1.4), P(a1, Rr, zr + 1.4), P(a1, Rr - 0.2, zr + 1.4), look.edge);
    }
    for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
      const h = H.hullPoint(zr, a, 0.95);
      b.tube([v3(h), new THREE.Vector3(Math.cos(a) * Rr, 1.45 + Math.sin(a) * Rr, zr)], 0.16, 5, look.rib);
    }
    nav.push([Rr, 1.45, zr - 1.4], [-Rr, 1.45, zr - 1.4], [0, 1.45 + Rr, zr - 1.4]);
  }
  // the tail housing around the core
  b.torus(1.05, 0.32, 6, 14, mat(0, 1.55, H.coreZ + 0.15), 0x0f0e16);
  b.cyl(1.25, 1.25, 0.6, 14, mat(0, 1.55, H.coreZ + 0.4, Math.PI / 2, 0, 0), look.belly, 0, true);
  // the scanner eye at the nose, under the chin
  const chin = H.hullPoint(H.zOf(11.2), -Math.PI / 2);
  b.sphere(0.42, 8, 6, mat(0, chin[1] + 0.25, chin[2]), 0x0f0e16);
  // a lit seam along the belly: the core's light running forward
  for (let z = H.zOf(-9.8); z < 6.5; z += 1.1) {
    const p = H.hullPoint(z, -Math.PI / 2, 1.005);
    b.box(0.14, 0.05, 0.7, mat(p[0], p[1] - 0.01, p[2]), look.core, 2.2);
  }
  // lanterns hung under the belly, swinging a little in the wind of it (they do not)
  if (look.lanterns) {
    for (let z = H.zOf(-7); z < 4; z += 3) {
      const p = H.hullPoint(z + 1.5, -Math.PI / 2, 1);
      b.cyl(0.02, 0.02, 0.9, 4, mat(0, p[1] - 0.45, p[2]), look.rib);
      b.box(0.36, 0.5, 0.36, mat(0, p[1] - 1.1, p[2]), look.rib);
      b.box(0.26, 0.38, 0.26, mat(0, p[1] - 1.1, p[2]), look.window, 2.2);
    }
  }
  // an observation dome, warm inside
  if (look.dome) {
    const t = H.hullPoint(H.room[0] + 1.5, Math.PI / 2, 0.98);
    b.sphere(1.9, 14, 8, mat(0, t[1] - 0.2, t[2], 0, 0, 0, 1, 0.8, 1.3), look.window, 0.7, 0, TAU, 0, Math.PI / 2);
    b.torus(1.9, 0.12, 4, 20, mat(0, t[1] - 0.2, t[2], Math.PI / 2, 0, 0, 1, 1.3, 1), look.rib);
  }
  return { geo: b.build(), nav, lens: [0, chin[1] + 0.23, chin[2] + 0.35] };
}

function coreGeometry(H, look) {
  const b = new Builder();
  b.ico(0.82, 1, mat(0, 1.55, H.coreZ), lift(look.core, 0.6), 3.0);
  return b.build();
}

function lensGeometry(at, look) {
  const b = new Builder();
  b.sphere(0.2, 8, 6, mat(...at), look.core, 1);
  return b.build();
}

function navGeometry(nav) {
  const b = new Builder();
  for (const p of nav) b.box(0.22, 0.22, 0.22, mat(...p), 0xd6edf5, 2.5);
  return b.build();
}

// The legs it lands on and the ramp from its door, for a hull whose belly is `low` below
// its floor: the legs (each its own group, hinged at the belly, drawn down to the ground)
// and the ramp (hinged at the door's foot, folded up into the hull, down to the ground)
function landingGeometry(H, look, low) {
  const rest = low + LEG;
  const legs = [];
  const leg = (z, a) => {
    const top = H.hullPoint(z, a, 0.98), len = top[1] + rest;
    const b = new Builder();
    b.cyl(0.13, 0.16, len, 6, mat(0, -len / 2, 0), look.rib);
    b.cyl(0.24, 0.24, len * 0.35, 6, mat(0, -len * 0.25, 0), look.belly);
    b.cyl(0.55, 0.65, 0.16, 10, mat(0, -len + 0.08, 0), look.rib);
    b.torus(0.6, 0.05, 4, 16, mat(0, -len + 0.18, 0, Math.PI / 2, 0, 0), look.core, 1.6);
    legs.push({ geo: b.build(), at: top });
  };
  leg(Math.min(H.zOf(7.2), 7.5), -Math.PI / 2);
  for (const s of [-1, 1]) leg(H.zOf(-6.8), -Math.PI / 2 + s * 0.75);
  // the ramp's hinge: where the hull meets the floor, on the right
  const zm = (DOOR.z0 + DOOR.z1) / 2;
  let hinge = H.hullPoint(zm, Math.PI);
  for (let a = Math.PI; a < Math.PI * 1.5; a += 0.01) { const p = H.hullPoint(zm, a); if (p[1] <= 0.05) { hinge = p; break; } }
  const L = DOOR.top + 0.1, W = DOOR.z1 - DOOR.z0 - 0.1;
  const b = new Builder();
  b.box(0.14, L, W, mat(0, L / 2, 0), look.belly);
  b.box(0.16, L, 0.08, mat(0, L / 2, W / 2 - 0.04), look.edge);
  b.box(0.16, L, 0.08, mat(0, L / 2, -W / 2 + 0.04), look.edge);
  // steps, lit at their edges
  for (let y = 0.3; y < L - 0.1; y += 0.36) {
    b.box(0.22, 0.08, W - 0.2, mat(0.1, y, 0), look.rib);
    b.box(0.04, 0.03, W - 0.3, mat(0.2, y + 0.05, 0), look.core, 1.4);
  }
  // the door's light, when it is open: the door's panel again, a little proud, lit
  const lit = new Builder(), warm = mixHex(0xe6c9a0, look.core, 0.2);
  for (let z = DOOR.z0 + 0.06; z < DOOR.z1 - 0.07; z += 0.2) for (let a = Math.PI * 0.55; a < Math.PI * 1.45; a += 0.05) {
    const z1 = Math.min(z + 0.2, DOOR.z1 - 0.06), a1 = a + 0.05;
    if (!H.isDoor(z, a) || !H.isDoor(z1, a1)) continue;
    lit.quad(H.hullPoint(z, a, 1.01), H.hullPoint(z, a1, 1.01), H.hullPoint(z1, a1, 1.01), H.hullPoint(z1, a, 1.01), warm, 1.4);
  }
  // how steep the ramp lies: its foot on the ground
  const tilt = Math.asin(clamp(rest / L, 0.2, 0.97));
  return { legs, rest, ramp: b.build(), light: lit.build(), hinge: new THREE.Vector3(hinge[0], 0, zm), tilt, L };
}

// every part of a design's outside, for the ship and for its portrait in the SHOP
export function exteriorParts(design) {
  const H = new Hull(design.hull), look = design.look;
  const fins = finGeometry(H, look);
  return { H, hull: hullGeometry(H, look), ribs: ribGeometry(H, look), fins: fins.geo, core: coreGeometry(H, look), nav: navGeometry(fins.nav), lens: lensGeometry(fins.lens, look) };
}

export class Ship {
  constructor(scene, world, design = SHIPS[0]) {
    this.world = world;
    this.root = new THREE.Group();
    this.exterior = new THREE.Group();
    this.root.add(this.exterior);
    this.coreMat = worldMaterial({ unique: true });
    this.navMat = worldMaterial({ unique: true });
    this.lensMat = worldMaterial({ unique: true });
    this.hullMat = worldMaterial({ unique: true });
    this.gearMat = worldMaterial({ side: THREE.DoubleSide });
    this.sideMat = worldMaterial({ side: THREE.DoubleSide });
    this.halo = halo(0x91cbde, 9, 0.9);
    this.halo.layers.set(LAYER_FX);
    this.exterior.add(this.halo);
    this._fog = new THREE.Color();
    this._belly = new THREE.Color();
    this.setDesign(design);
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
    this.steer = 0;
    this.drift = 0;           // asleep at the controls: a slow wander
    this.distance = 0;
    this.scanGlow = 0;
    this.boost = 0;           // 0..1: how hard the core burns (W held), eased in and out
    this._t = 0;
  }

  // build the ship of a design (the old one's meshes go), and fly as it does
  setDesign(design) {
    this.design = design;
    for (const m of this._parts || []) { m.parent.remove(m); m.geometry.dispose(); }
    for (const g of this._landing || []) { this.exterior.remove(g); g.traverse((o) => o.geometry && o.geometry.dispose()); }
    const P = exteriorParts(design);
    this.H = P.H;
    this.span = P.fins.boundingBox.max.x;      // half the wingspan
    const mesh = (g, m, parent = this.exterior) => { const x = new THREE.Mesh(g, m); parent.add(x); return x; };
    this._parts = [mesh(P.hull, this.hullMat), mesh(P.ribs, this.sideMat), mesh(P.fins, this.sideMat), mesh(P.nav, this.navMat), mesh(P.lens, this.lensMat), mesh(P.core, this.coreMat, this.root)];
    this.halo.material.uniforms.uColor.value.setHex(design.look.core);
    this.halo.position.set(0, 1.55, this.H.coreZ - 0.3);
    // its legs and its ramp, folded away until it lands
    const Lg = landingGeometry(this.H, design.look, -P.hull.boundingBox.min.y);
    this.rest = Lg.rest;
    this.legs = Lg.legs.map(({ geo, at }) => { const g = new THREE.Group(); g.position.set(at[0], at[1], at[2]); g.add(new THREE.Mesh(geo, this.gearMat)); return g; });
    this.ramp = new THREE.Group();
    this.ramp.position.copy(Lg.hinge);
    this.ramp.add(new THREE.Mesh(Lg.ramp, this.gearMat));
    this.doorLight = new THREE.Mesh(Lg.light, this.gearMat);
    this._landing = [...this.legs, this.ramp, this.doorLight];
    for (const g of this._landing) this.exterior.add(g);
    this.rampTilt = Lg.tilt;
    this.rampLen = Lg.L;
    this.setGear(this.gear || 0);
    this.setRamp(this.rampOpen || 0);
    this._coreAt = new THREE.Vector3(0, 1.55, this.H.coreZ);
    // the light under it and in the fog takes the core's color
    const h = design.look.core, r = ((h >> 16) & 255) / 255, g = ((h >> 8) & 255) / 255, bl = (h & 255) / 255;
    this._fog.setRGB(r, g, bl).lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar(0.95);
    this._belly.setRGB(r * 0.4, g * 0.4, bl * 0.4);
    const f = design.fly;
    this.cruise = f.speed;
    this.boostK = f.boost;
    this.maxYaw = f.turn;
    if (this.speed === undefined) this.speed = f.speed;
  }

  // the legs: 0 folded away, 1 down to the ground
  setGear(k) {
    this.gear = k;
    for (const g of this.legs) { g.visible = k > 0.01; g.scale.set(1, Math.max(0.01, k), 1); }
  }

  // the ramp: 0 shut, 1 down on the ground (its foot, ship space, for walking off it)
  setRamp(k) {
    this.rampOpen = k;
    const e = k * k * (3 - 2 * k);
    this.ramp.visible = k > 0.01;
    this.ramp.rotation.z = e * (Math.PI / 2 + this.rampTilt);
    this.doorLight.visible = k > 0.05;
  }
  rampFoot() {
    const a = Math.PI / 2 + this.rampTilt;
    return new THREE.Vector3(this.ramp.position.x - Math.sin(a) * this.rampLen, this.ramp.position.y + Math.cos(a) * this.rampLen, this.ramp.position.z);
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
    // landing, landed, or lifting off: the scene moves it (landing.js)
    if (this.held) { this.steer = 0; this.yawRate = 0; return; }
    this.steer = steer;
    // the core takes a moment to come up to a burn, and longer to settle back
    this.boost = damp(this.boost, boosting ? 1 : 0, boosting ? 1.4 : 0.9, dt);
    this.speed = this.cruise * (1 + this.boostK * this.boost);
    // heading grows toward +x, which is to the left when facing +z: steering right turns it down
    const target = -clamp(steer + this.drift, -1, 1) * this.maxYaw;
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
    const core = this._coreAt.clone().applyMatrix4(r.matrixWorld);
    const belly = new THREE.Vector3(0, -4, -2).applyMatrix4(r.matrixWorld);
    U.uPointPos.value[0].set(belly.x, belly.y - 6, belly.z, 46);
    U.uPointColor.value[0].copy(this._belly).multiplyScalar(pulse);
    FOG.uFogLights.value[0].set(core.x, core.y, core.z, 24 + this.boost * 22);
    FOG.uFogLightColor.value[0].copy(this._fog);
    this.corePos = core;
  }

  // ship-local to render-space
  toWorld(v) {
    return v.applyMatrix4(this.root.matrixWorld);
  }
}
