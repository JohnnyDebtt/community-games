import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial, halo, U } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, rng } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { DOOR } from './hull.js';

// The cabin: long and calm, a shell ribbed like the outside, warm lamps, the forest
// sliding past the windows. At the front the controls under the windshield; amidships
// the coffee machine on the left wall and the Codex computer on the right (the same in
// every ship); then the ship's own rooms, if it has any (a gallery, a reading nook, a
// lounge, a library, a garden: books to read in some); at the back a bunk, lockers, and
// the ship's core in a glass column, breathing. Each ship has its own colors (designs.js).
//
// Ship space: +z forward, +x to the left (facing forward), the floor at y = 0.

const INNER = 0.9;            // the cabin's shell, inside the hull
// the coffee machine's own colors, whatever the ship
const DARK = 0x181c20, PALE = 0x94a6b1, EDGE = 0x4f5d73;
const SPINES = [0x6b2f2a, 0x2f4a6b, 0x3f5a3a, 0x8a6a3a, 0x4a3a5a, 0x7a5a4a, 0x2a2a2a, 0xa08a6a, 0x5a2a3a, 0x2f5a5a, 0x9a8f7a];
const LEAF = [0x49573d, 0x3f5a3a, 0x5b6e3e, 0x35503c, 0x6a7a45];

export const MACHINE = new THREE.Vector3(2.42, 0.92, 0.8);   // on the counter, facing -x
export const CUP_REST = new THREE.Vector3(-0.34, 0, 0.4);    // the cup beside it (machine space)
export const TERMINAL = new THREE.Vector3(-2.5, 1.5, 0.8);   // on the right wall, facing +x
export const SEAT = new THREE.Vector3(0, 0, 6.3);

// half width of the floor at z (where the inner shell meets y = 0)
function floorHalf(H, z) {
  const [w, hh, yc] = H.section(z);
  const yr = (0 - yc) / (hh * INNER * 0.82);
  if (Math.abs(yr) >= 1) return 0;
  return w * INNER * Math.pow(1 - Math.pow(Math.abs(yr), H.pw), 1 / H.pw);
}

function shell(H, C) {
  const b = new Builder();
  const SEG = 28;
  const z0 = H.aft(-7.7), z1 = H.zOf(10.6);
  const zs = [];
  for (let z = z0; z < z1; z += 0.6) zs.push(z);
  zs.push(z1);
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
      const za = zs[i], zb = zs[i + 1];
      const am = (a0 + a1) / 2, zm = (za + zb) / 2;
      if (H.isWindow(zm, am)) continue;
      const p00 = H.hullPoint(za, a0, INNER), p01 = H.hullPoint(za, a1, INNER), p10 = H.hullPoint(zb, a0, INNER), p11 = H.hullPoint(zb, a1, INNER);
      if (Math.max(p00[1], p01[1], p10[1], p11[1]) < 0.0) continue;
      const s = Math.sin(am);
      let col = s > 0.7 ? C.dark : (i % 3 === 0 ? C.wall2 : C.wall);
      // the window frames: pale where the shell meets the glass
      if (H.isWindow(zm + 0.6, am) || H.isWindow(zm - 0.6, am) || H.isWindow(zm, am + 0.23) || H.isWindow(zm, am - 0.23)) col = C.edge;
      // the door: a panel in a pale frame, a lit handle-strip down its middle
      if (H.isDoor(zm, am, INNER)) col = H.isDoor(zm - 0.35, am, INNER) && H.isDoor(zm + 0.35, am, INNER) && H.isDoor(zm, am + 0.2, INNER) ? C.wall2 : C.edge;
      b.quad(p00, p10, p11, p01, col);
    }
  }
  // the rear wall, behind the core
  const back = new THREE.Shape();
  const N = 24;
  for (let k = 0; k <= N; k++) {
    const p = H.hullPoint(z0, (k / N) * TAU, INNER);
    if (k === 0) back.moveTo(p[0], Math.max(p[1], 0)); else back.lineTo(p[0], Math.max(p[1], 0));
  }
  b.add(new THREE.ShapeGeometry(back), mat(0, 0, z0), C.dark);
  return b;
}

function floor(b, H, C, core) {
  const z0 = H.aft(-7.7), z1 = H.zOf(9.8);
  for (let z = z0, i = 0; z < z1; z += 0.8, i++) {
    const h0 = floorHalf(H, z), h1 = floorHalf(H, z + 0.8);
    if (Math.min(h0, h1) <= 0.1) continue;
    b.quad([-h0, 0, z], [h0, 0, z], [h1, 0, z + 0.8], [-h1, 0, z + 0.8], i % 2 ? C.plate : C.wall2);
    // the runner down the middle, with guide lights at its edges
    b.box(0.9, 0.02, 0.76, mat(0, 0.01, z + 0.4), C.runner);
    if (i % 2) for (const s of [-1, 1]) b.box(0.05, 0.03, 0.12, mat(s * 0.5, 0.015, z + 0.4), core, 1.4);
  }
}

// ribs inside: dark arches over the cabin, a vine along the ceiling, a light strip
function ribs(b, H, C, core) {
  for (const rz of H.ribs) {
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const a = -0.5 + (k / 30) * (Math.PI + 1.0);
      const p = H.hullPoint(rz, a, INNER * 0.965);
      if (p[1] < -0.05) continue;
      pts.push(new THREE.Vector3(p[0], p[1], p[2]));
    }
    b.tube(pts, (t) => 0.13 + Math.sin(t * 11) * 0.02, 5, C.vine);
  }
  const sp = [], z0 = H.aft(-7.4);
  for (let k = 0; k <= 40; k++) {
    const z = z0 + (k / 40) * (5.6 - z0);
    const p = H.hullPoint(z, Math.PI / 2 + Math.sin(k * 0.6) * 0.06, INNER * 0.96);
    sp.push(new THREE.Vector3(p[0], p[1], p[2]));
  }
  b.tube(sp, 0.12, 5, C.vine);
  for (let z = H.aft(-6); z < 5.5; z += 0.5) {
    const p = H.hullPoint(z, Math.PI / 2, INNER * 0.955);
    b.box(0.08, 0.03, 0.3, mat(0.32, p[1] - 0.05, z), core, 0.45);
    b.box(0.08, 0.03, 0.3, mat(-0.32, p[1] - 0.05, z), core, 0.45);
  }
}

// the door's inside: a step at its foot, a light over it
function door(b, H, C, core) {
  const zm = (DOOR.z0 + DOOR.z1) / 2, x = -floorHalf(H, zm) + 0.2;
  b.box(0.5, 0.06, DOOR.z1 - DOOR.z0, mat(x + 0.1, 0.03, zm), C.runner);
  b.box(0.04, 0.04, DOOR.z1 - DOOR.z0 - 0.3, mat(x + 0.36, 0.05, zm), core, 1.4);
  const top = H.hullPoint(zm, Math.PI * 0.86, INNER);
  b.box(0.12, 0.06, 0.6, mat(top[0] + 0.15, DOOR.top + 0.12, zm), core, 1.6);
}

function cockpit(b, C, core) {
  // the pilot's seat: a shell on a pedestal
  const s = SEAT;
  b.cyl(0.18, 0.24, 0.45, 8, mat(s.x, 0.22, s.z), C.dark);
  b.box(0.62, 0.12, 0.6, mat(s.x, 0.5, s.z), C.wall2);
  b.box(0.62, 0.8, 0.12, mat(s.x, 0.95, s.z - 0.3, -0.22, 0, 0), C.wall2);
  b.box(0.36, 0.22, 0.1, mat(s.x, 1.45, s.z - 0.42, -0.22, 0, 0), C.dark);
  for (const x of [-0.36, 0.36]) b.box(0.08, 0.06, 0.5, mat(s.x + x, 0.72, s.z), C.edge);
  // the console: an arc under the windshield, screens lit low
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.24;
    const r = 1.75;
    const x = Math.sin(a) * r, z = 6.6 + Math.cos(a) * r * 0.7;
    b.box(0.5, 0.82, 0.5, mat(x, 0.41, z, 0, a, 0), C.dark);
    b.box(0.52, 0.06, 0.62, mat(x, 0.84, z - 0.04, -0.35, a, 0), C.wall2);
    if (i !== 0) {
      b.box(0.36, 0.03, 0.26, mat(x, 0.88, z - 0.08, -0.35, a, 0), 0x12151d);
      for (let l = 0; l < 3; l++) b.box(0.22 - l * 0.05, 0.035, 0.018, mat(x, 0.89, z - 0.14 + l * 0.05, -0.35, a, 0), i % 2 ? mixHex(core, 0x7bacbc, 0.4) : 0x627594, 0.55);
    }
  }
  // a small cluster of controls in front of the seat
  b.box(0.3, 0.04, 0.2, mat(0, 0.9, 7.95, -0.35, 0, 0), 0x12151d);
  b.box(0.05, 0.045, 0.05, mat(0.08, 0.92, 7.95, -0.35, 0, 0), core, 0.9);
}

// a box against a wall: from the front (x0, signed) back to the wall at its foot
function walled(b, H, x0, y0, y1, z0, z1, col, emissive = 0) {
  const sd = Math.sign(x0), wall = Math.max(Math.abs(x0) + 0.3, floorHalf(H, (z0 + z1) / 2) + 0.05);
  const xa = Math.abs(x0), w = wall - xa;
  b.box(w, y1 - y0, z1 - z0, mat(sd * (xa + w / 2), (y0 + y1) / 2, (z0 + z1) / 2), col, emissive);
}

function coffeeCounter(b, H, C) {
  const z0 = -0.4, z1 = 2.0;
  walled(b, H, 2.06, 0, 0.88, z0, z1, C.dark);
  b.box(0.9, 0.05, z1 - z0 + 0.04, mat(2.45, 0.905, (z0 + z1) / 2), C.runner);
  b.box(0.04, 0.05, z1 - z0 + 0.04, mat(2.02, 0.905, (z0 + z1) / 2), C.pale);
  // a shelf above, cups on it
  b.box(0.36, 0.04, 1.2, mat(2.75, 1.75, 1.35), C.dark);
  for (let i = 0; i < 3; i++) b.cyl(0.05, 0.042, 0.1, 8, mat(2.72, 1.82, 0.95 + i * 0.22), i === 1 ? 0x97acb0 : 0xc2c9c9);
  // a warm lamp over the counter
  b.cyl(0.02, 0.02, 0.6, 4, mat(2.1, 2.75, 0.8), C.vine);
  b.cone(0.16, 0.16, 8, mat(2.1, 2.4, 0.8), C.dark);
  b.sphere(0.07, 6, 4, mat(2.1, 2.32, 0.8), C.lamp, 2.0);
}

function terminalDesk(b, H, C) {
  b.box(0.75, 0.06, 1.8, mat(-2.4, 0.78, 0.8), C.wall2);
  walled(b, H, -2.58, 0, 0.76, -0.0, 1.6, C.dark);
  b.box(0.03, 0.06, 1.8, mat(-2.03, 0.78, 0.8), C.pale);
  // the frame around the screen
  b.box(0.1, 1.0, 1.6, mat(-2.62, 1.55, 0.8, 0, 0, 0.1), C.dark);
  // a stool
  b.cyl(0.22, 0.2, 0.06, 10, mat(-1.6, 0.56, 0.8), C.wall2);
  b.cyl(0.04, 0.06, 0.55, 6, mat(-1.6, 0.27, 0.8), C.dark);
}

function rear(b, H, C, core) {
  const Z = (z) => H.aft(z);
  // the bunk on the left wall: a low bed, a blanket, a pillow
  walled(b, H, 1.72, 0, 0.42, Z(-4.95), Z(-2.65), C.dark);
  b.box(0.9, 0.12, 2.2, mat(2.2, 0.48, Z(-3.8)), mixHex(0x465b7d, C.wall2, 0.3));
  b.box(0.6, 0.12, 0.38, mat(2.25, 0.6, Z(-4.7)), 0x97acb0);
  b.box(0.88, 0.16, 0.9, mat(2.2, 0.56, Z(-3.1), 0, 0, 0.04), mixHex(0x627594, C.wall2, 0.3));
  // moss in a bowl on a shelf above it
  b.box(0.4, 0.04, 1.0, mat(2.65, 1.5, Z(-3.8)), C.dark);
  b.cyl(0.16, 0.12, 0.14, 8, mat(2.6, 1.59, Z(-3.5)), 0x353b44);
  const moss = new THREE.IcosahedronGeometry(0.15, 0);
  roughen(moss, 0.06, 4);
  b.add(moss, mat(2.6, 1.7, Z(-3.5), 0, 0, 0, 1, 0.6, 1), 0x49573d, 0, { flat: true });
  b.sphere(0.03, 4, 3, mat(2.65, 1.76, Z(-3.46)), 0xad2e41);
  b.sphere(0.03, 4, 3, mat(2.55, 1.75, Z(-3.55)), 0x8c9245);
  // lockers on the right wall
  for (let i = 0; i < 4; i++) {
    walled(b, H, -2.125, 0, 2.0, Z(-5.13 + i * 0.6), Z(-4.57 + i * 0.6), i % 2 ? C.wall2 : C.wall);
    b.box(0.03, 0.3, 0.04, mat(-2.11, 1.15, Z(-4.85 + i * 0.6 + 0.18)), C.pale);
  }
  // the core: a glass column, vines around it
  const cz = Z(-6.35);
  b.cyl(0.85, 0.95, 0.25, 14, mat(0, 0.12, cz), C.dark);
  b.cyl(0.85, 0.85, 0.2, 14, mat(0, 3.05, cz), C.dark);
  for (let v = 0; v < 3; v++) {
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, a = (v / 3) * TAU + t * TAU * 1.25;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.7, 0.2 + t * 2.8, cz + Math.sin(a) * 0.7));
    }
    b.tube(pts, 0.07, 4, C.vine);
  }
  // a ring rail around it
  b.torus(1.2, 0.035, 4, 24, mat(0, 0.95, cz, Math.PI / 2, 0, 0), C.edge);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.cyl(0.03, 0.03, 0.95, 4, mat(Math.cos(a) * 1.2, 0.47, cz + Math.sin(a) * 1.2), C.edge); }
  // a round rug amidships
  b.cyl(1.25, 1.25, 0.02, 20, mat(0, 0.012, Z(-1.0), 0, 0, 0, 1, 1, 0.8), mixHex(0x2d2e33, C.wall, 0.3));
  b.add(new THREE.TorusGeometry(1.05, 0.03, 3, 24), mat(0, 0.025, Z(-1.0), Math.PI / 2, 0, 0, 1, 0.8, 1), mixHex(0x4c5c8c, core, 0.4));
}

// ---------------------------------------------------------------- the ships' own rooms
// Each fills a bay (three meters) between the galley and the bunk, from the front back.
// It adds what can be walked into (boxes: x0, z0, x1, z1) and what can be used (spots).

// a bookcase against a wall (sd: 1 left, -1 right), from z0 to z1, shelves full of books
function bookcase(b, R, H, C, sd, z0, z1, h = 2.1) {
  const xf = 2.15, n = 5, d = 0.36;
  walled(b, H, sd * xf, 0, 0.06, z0, z1, C.dark);
  walled(b, H, sd * (xf + d - 0.04), 0, h, z0, z1, C.dark);
  for (const z of [z0 + 0.02, z1 - 0.02]) b.box(d, h, 0.04, mat(sd * (xf + d / 2), h / 2, z), C.wall2);
  b.box(d + 0.04, 0.05, z1 - z0, mat(sd * (xf + d / 2), h, (z0 + z1) / 2), C.edge);
  for (let i = 0; i < n; i++) {
    const y = 0.08 + (i * (h - 0.12)) / n;
    b.box(d, 0.03, z1 - z0 - 0.06, mat(sd * (xf + d / 2), y, (z0 + z1) / 2), C.wall2);
    // the books, spines out, a gap now and then, one leaning
    let z = z0 + 0.05;
    while (z < z1 - 0.1) {
      if (R() < 0.08) { z += 0.12 + R() * 0.15; continue; }
      const w = 0.035 + R() * 0.045, bh = 0.17 + R() * 0.15, dd = 0.2 + R() * 0.1;
      if (z + w > z1 - 0.05) break;
      const lean = R() < 0.05 ? sd * 0.25 : 0;
      b.box(dd, bh, w, mat(sd * (xf + d - dd / 2 - 0.03), y + 0.015 + bh / 2, z + w / 2, lean, 0, 0), SPINES[Math.floor(R() * SPINES.length)]);
      z += w + 0.004;
    }
  }
}

// a potted plant: a small tree, or a fern
function plant(b, R, x, z, tall) {
  b.cyl(0.24, 0.18, 0.42, 10, mat(x, 0.21, z), 0x4a3a2e);
  b.cyl(0.22, 0.22, 0.02, 10, mat(x, 0.41, z), 0x2a2018);
  if (tall) {
    b.cyl(0.035, 0.05, 1.0, 5, mat(x, 0.9, z), 0x4a3a2e);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.IcosahedronGeometry(0.26 + R() * 0.12, 0);
      roughen(g, 0.08, i + 3);
      b.add(g, mat(x + (R() - 0.5) * 0.35, 1.35 + R() * 0.45, z + (R() - 0.5) * 0.35), LEAF[Math.floor(R() * LEAF.length)], 0, { flat: true });
    }
  } else {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + R() * 0.3;
      b.cone(0.05, 0.6 + R() * 0.25, 4, mat(x + Math.cos(a) * 0.12, 0.7, z + Math.sin(a) * 0.12, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6), LEAF[i % LEAF.length]);
    }
  }
}

// a lamp hung from the ceiling
function hanging(b, H, C, x, z, y = 2.3) {
  const top = H.hullPoint(z, Math.PI / 2, INNER * 0.95)[1];
  b.cyl(0.015, 0.015, top - y, 4, mat(x, (top + y) / 2, z), C.vine);
  b.cone(0.2, 0.18, 10, mat(x, y + 0.02, z), C.dark);
  b.sphere(0.08, 6, 4, mat(x, y - 0.06, z), C.lamp, 2.2);
}

const ROOMS = {
  // a bench under the windows, a map table with two books on it
  gallery(b, R, H, C, core, z0, z1, out) {
    walled(b, H, 1.95, 0, 0.42, z0 + 0.2, z1 - 0.2, C.dark);
    for (let i = 0; i < 3; i++) b.box(0.62, 0.1, 0.78, mat(2.3, 0.47, z0 + 0.45 + i * 0.85 + 0.4), mixHex(C.pale, C.runner, 0.35));
    out.boxes.push([1.9, z0 + 0.2, 3.3, z1 - 0.2]);
    // the map table: a pedestal, a slanted top, the forest drawn on it in light
    const tz = (z0 + z1) / 2, tx = -2.0;
    b.cyl(0.08, 0.14, 0.9, 6, mat(tx, 0.45, tz), C.dark);
    b.box(0.9, 0.05, 1.3, mat(tx, 0.92, tz, 0, 0, -0.18), C.dark);
    for (let i = 0; i < 6; i++) b.box(0.84, 0.012, 0.012, mat(tx, 0.952, tz - 0.55 + i * 0.22, 0, 0, -0.18), core, 0.9);
    for (let i = 0; i < 4; i++) { const dx = -0.3 + i * 0.2; b.box(0.012, 0.012, 1.2, mat(tx + dx, 0.952 - 0.18 * dx, tz, 0, 0, -0.18), core, 0.9); }
    for (let r = 1; r <= 3; r++) b.add(new THREE.TorusGeometry(0.1 * r, 0.006, 3, 20), mat(tx + 0.1, 0.958, tz + 0.15, Math.PI / 2, 0.18, 0), mixHex(core, 0xffffff, 0.3), 1.2);
    // two books on it
    b.box(0.22, 0.04, 0.3, mat(tx - 0.12, 0.99, tz - 0.38, 0, 0.3, -0.18), SPINES[0]);
    b.box(0.2, 0.035, 0.28, mat(tx - 0.1, 1.025, tz - 0.36, 0, -0.1, -0.18), SPINES[3]);
    out.boxes.push([tx - 0.5, tz - 0.7, tx + 0.5, tz + 0.7]);
    out.spots.push({ id: 'books', at: new THREE.Vector3(tx + 0.75, 1.2, tz), label: 'Read a book', r: 1.5 });
    hanging(b, H, C, tx, tz, 2.1);
  },
  // shelves of books, an armchair, a lamp
  nook(b, R, H, C, core, z0, z1, out) {
    bookcase(b, R, H, C, 1, z0 + 0.15, (z0 + z1) / 2 - 0.03);
    bookcase(b, R, H, C, 1, (z0 + z1) / 2 + 0.03, z1 - 0.15);
    out.boxes.push([2.05, z0 + 0.1, 3.3, z1 - 0.1]);
    out.spots.push({ id: 'books', at: new THREE.Vector3(1.6, 1.3, (z0 + z1) / 2), label: 'Read a book', r: 1.6 });
    // the armchair, turned toward the shelves
    const cx = -2.0, cz = (z0 + z1) / 2 - 0.2, cloth = mixHex(0x8a4a3a, C.wall2, 0.25);
    b.box(0.75, 0.4, 0.75, mat(cx, 0.2, cz, 0, 0.5, 0), C.dark);
    b.box(0.7, 0.14, 0.7, mat(cx, 0.47, cz, 0, 0.5, 0), cloth);
    b.box(0.75, 0.75, 0.16, mat(cx - Math.sin(0.5) * 0.32, 0.8, cz - Math.cos(0.5) * 0.32, -0.12, 0.5, 0), cloth);
    for (const s of [-1, 1]) b.box(0.14, 0.26, 0.7, mat(cx + Math.cos(0.5) * 0.36 * s, 0.6, cz - Math.sin(0.5) * 0.36 * s, 0, 0.5, 0), cloth);
    // a floor lamp and a small table with a cup on it
    const lx = -2.3, lz = z1 - 0.45;
    b.cyl(0.18, 0.2, 0.03, 10, mat(lx, 0.015, lz), C.dark);
    b.cyl(0.018, 0.018, 1.55, 4, mat(lx, 0.8, lz), C.dark);
    b.cyl(0.13, 0.22, 0.26, 10, mat(lx, 1.62, lz), mixHex(C.lamp, C.wall, 0.4), 0.8, true);
    b.sphere(0.06, 6, 4, mat(lx, 1.56, lz), C.lamp, 2.4);
    const tx = -1.75, tz = z0 + 0.6;
    b.cyl(0.24, 0.24, 0.03, 12, mat(tx, 0.55, tz), C.runner);
    b.cyl(0.03, 0.05, 0.54, 5, mat(tx, 0.27, tz), C.dark);
    b.cyl(0.045, 0.036, 0.09, 8, mat(tx + 0.05, 0.61, tz), 0xc2c9c9);
    b.box(0.16, 0.035, 0.22, mat(tx - 0.08, 0.585, tz + 0.02, 0, 0.4, 0), SPINES[1]);
    out.boxes.push([-2.85, cz - 0.55, -1.5, cz + 0.55], [lx - 0.25, lz - 0.25, lx + 0.25, lz + 0.25], [tx - 0.3, tz - 0.3, tx + 0.3, tz + 0.3]);
    b.cyl(1.0, 1.0, 0.02, 18, mat(-0.2, 0.012, (z0 + z1) / 2, 0, 0, 0, 1.2, 1, 1), mixHex(0x6b3a2e, C.wall, 0.3));
  },
  // a sofa under the windows, a low table, plants
  lounge(b, R, H, C, core, z0, z1, out) {
    const cloth = mixHex(0x3a5a6a, C.wall2, 0.3);
    walled(b, H, 2.0, 0, 0.42, z0 + 0.3, z1 - 0.3, C.dark);
    for (let i = 0; i < 3; i++) b.box(0.66, 0.14, 0.76, mat(2.33, 0.49, z0 + 0.35 + i * 0.78 + 0.38), cloth);
    for (let i = 0; i < 3; i++) b.box(0.2, 0.5, 0.74, mat(2.72, 0.78, z0 + 0.35 + i * 0.78 + 0.38, 0, 0, 0.15), cloth);
    for (const z of [z0 + 0.3, z1 - 0.3]) b.box(0.82, 0.62, 0.14, mat(2.4, 0.31, z), C.dark);
    out.boxes.push([1.95, z0 + 0.25, 3.3, z1 - 0.25]);
    b.box(0.5, 0.05, 1.0, mat(1.35, 0.4, (z0 + z1) / 2), C.runner);
    for (const dz of [-0.4, 0.4]) b.box(0.4, 0.38, 0.06, mat(1.35, 0.19, (z0 + z1) / 2 + dz), C.dark);
    b.cyl(0.045, 0.036, 0.09, 8, mat(1.3, 0.47, (z0 + z1) / 2 + 0.2), 0xc2c9c9);
    out.boxes.push([1.05, (z0 + z1) / 2 - 0.55, 1.65, (z0 + z1) / 2 + 0.55]);
    plant(b, R, -2.25, z0 + 0.55, true);
    plant(b, R, -2.3, z1 - 0.6, false);
    out.boxes.push([-2.6, z0 + 0.25, -1.9, z0 + 0.85], [-2.6, z1 - 0.9, -1.95, z1 - 0.3]);
    hanging(b, H, C, 1.4, (z0 + z1) / 2, 2.25);
  },
  // books on both walls, floor to shoulder
  library(b, R, H, C, core, z0, z1, out) {
    const m = (z0 + z1) / 2;
    for (const sd of [1, -1]) { bookcase(b, R, H, C, sd, z0 + 0.1, m - 0.03, 2.2); bookcase(b, R, H, C, sd, m + 0.03, z1 - 0.1, 2.2); }
    out.boxes.push([2.05, z0 + 0.05, 3.3, z1 - 0.05], [-3.3, z0 + 0.05, -2.05, z1 - 0.05]);
    out.spots.push({ id: 'books', at: new THREE.Vector3(0, 1.3, m), label: 'Read a book', r: 1.9 });
    hanging(b, H, C, 0, m, 2.35);
    b.cyl(0.9, 0.9, 0.02, 18, mat(0, 0.012, m, 0, 0, 0, 1, 1, 1.3), mixHex(0x6b3a2e, C.wall, 0.3));
  },
  // planters down both walls under warm lamps, a little forest indoors
  garden(b, R, H, C, core, z0, z1, out) {
    for (const sd of [1, -1]) {
      walled(b, H, sd * 1.95, 0, 0.5, z0 + 0.15, z1 - 0.15, 0x4a3a2e);
      b.box(0.6, 0.03, z1 - z0 - 0.4, mat(sd * 2.3, 0.51, (z0 + z1) / 2), 0x2a2018);
      for (let i = 0; i < 4; i++) {
        const z = z0 + 0.5 + i * 0.68, x = sd * (2.2 + R() * 0.2);
        if (i % 2) { b.cyl(0.03, 0.045, 0.8, 5, mat(x, 0.9, z), 0x4a3a2e); for (let k = 0; k < 3; k++) { const g = new THREE.IcosahedronGeometry(0.25 + R() * 0.1, 0); roughen(g, 0.08, i * 7 + k); b.add(g, mat(x + (R() - 0.5) * 0.3, 1.25 + R() * 0.35, z + (R() - 0.5) * 0.3), LEAF[Math.floor(R() * LEAF.length)], 0, { flat: true }); } }
        else for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; b.cone(0.04, 0.45 + R() * 0.2, 4, mat(x + Math.cos(a) * 0.1, 0.75, z + Math.sin(a) * 0.1, Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6), LEAF[k % LEAF.length]); }
        // flowers
        for (let k = 0; k < 3; k++) b.sphere(0.035, 4, 3, mat(x + (R() - 0.5) * 0.4, 0.58, z + 0.3 + (R() - 0.5) * 0.2), [0xad2e41, 0xe8c36a, 0xf6e9ff][k], 0.2);
      }
      // grow lamps along the ceiling
      for (let z = z0 + 0.4; z < z1 - 0.3; z += 0.7) { const p = H.hullPoint(z, Math.PI / 2 + sd * 0.45, INNER * 0.94); b.box(0.12, 0.03, 0.5, mat(p[0], p[1] - 0.05, z), 0xffb0c8, 1.4); }
    }
    out.boxes.push([1.9, z0 + 0.1, 3.3, z1 - 0.1], [-3.3, z0 + 0.1, -1.9, z1 - 0.1]);
  },
};

// glass for every window, drawn after the fog
function glass(H) {
  const pos = [], col = [], em = [];
  const SEG = 28, z0 = H.aft(-7.7), z1 = H.zOf(10.6);
  const push = (P) => { for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...P[i]); col.push(0.55, 0.68, 0.74); em.push(1); } };
  for (let z = z0; z < z1; z += 0.6) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU, zb = Math.min(z + 0.6, z1);
      if (!H.isWindow((z + zb) / 2, (a0 + a1) / 2)) continue;
      push([H.hullPoint(z, a0, 0.93), H.hullPoint(zb, a0, 0.93), H.hullPoint(zb, a1, 0.93), H.hullPoint(z, a1, 0.93)]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.Float32BufferAttribute(em, 1));
  const m = new THREE.Mesh(g, glowMaterial({ opacity: 0.09, fresnel: 0.8, fog: 0, side: THREE.DoubleSide }));
  m.layers.set(LAYER_FX);
  return m;
}

// ------------------------------------------------------------------ the coffee machine
// After the Moccamaster: a tall column at the back with the water tank on top, an arm
// holding the filter cone out over the carafe, the carafe on a hot plate, one button.
// Here matte black with pale edges, a pale ring of light for the brew, water that glows.
export function coffeeMachine() {
  const group = new THREE.Group();
  const b = new Builder();
  // local: +x into the wall (back), the front faces -x; y up from the counter
  b.box(0.46, 0.05, 0.42, mat(0, 0.025, 0), DARK);                      // base
  b.box(0.46, 0.012, 0.42, mat(0, 0.052, 0), EDGE);
  b.box(0.18, 0.95, 0.24, mat(0.12, 0.5, 0), DARK);                      // the column
  b.box(0.012, 0.95, 0.244, mat(0.03, 0.5, 0), EDGE);
  b.box(0.36, 0.36, 0.32, mat(0.08, 1.15, 0), 0x2a2f32);                // the tank's frame
  b.box(0.37, 0.03, 0.33, mat(0.08, 1.345, 0), PALE);                   // its lid's rim
  b.box(0.32, 0.06, 0.3, mat(0.08, 1.38, 0), DARK);                      // lid
  b.box(0.3, 0.05, 0.08, mat(-0.12, 0.92, 0), DARK);                     // the arm
  // the filter cone, open at the top
  b.add(new THREE.CylinderGeometry(0.14, 0.04, 0.2, 12, 1, true), mat(-0.2, 0.82, 0), DARK);
  b.add(new THREE.TorusGeometry(0.14, 0.012, 4, 16), mat(-0.2, 0.92, 0, Math.PI / 2, 0, 0), PALE);
  // the hot plate
  b.cyl(0.13, 0.13, 0.025, 14, mat(-0.2, 0.065, 0), 0x313c43);
  // the button and its ring
  b.cyl(0.03, 0.03, 0.02, 10, mat(-0.235, 0.032, 0.14, 0, 0, Math.PI / 2), PALE);
  const body = new THREE.Mesh(b.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.45 }));
  group.add(body);
  // the parts that change: water, light ring, plate glow, carafe, coffee, stream, drips
  const lit = new Builder();
  lit.add(new THREE.TorusGeometry(0.105, 0.01, 4, 16), mat(-0.2, 0.735, 0, Math.PI / 2, 0, 0), 0x91cbde, 2.2);   // brew ring
  lit.add(new THREE.TorusGeometry(0.034, 0.008, 4, 10), mat(-0.24, 0.032, 0.14, 0, 0, Math.PI / 2), 0x91cbde, 2.2); // button ring
  const ring = new THREE.Mesh(lit.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.45 }));
  group.add(ring);
  const plate = new Builder();
  plate.add(new THREE.TorusGeometry(0.11, 0.012, 4, 18), mat(-0.2, 0.08, 0, Math.PI / 2, 0, 0), 0xaf634b, 2.2);
  const plateM = new THREE.Mesh(plate.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.45 }));
  group.add(plateM);
  const water = new Builder();
  water.box(0.3, 0.3, 0.26, mat(0, 0.15, 0), 0x7bacbc, 0.6);
  const waterM = new THREE.Mesh(water.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.45 }));
  waterM.position.set(0.08, 0.98, 0);
  group.add(waterM);
  // the carafe: a glass vessel (drawn as a dark tinted shell with pale rim) and a lid
  const carafe = new THREE.Group();
  const cb = new Builder();
  cb.cyl(0.11, 0.11, 0.01, 12, mat(0, 0.005, 0), 0x465b7d);
  cb.cyl(0.07, 0.08, 0.05, 10, mat(0, 0.245, 0), DARK);
  // the handle toward whoever stands at the machine (-x), the spout away from them
  cb.box(0.03, 0.12, 0.03, mat(-0.13, 0.13, 0), DARK);                    // handle
  cb.box(0.05, 0.02, 0.02, mat(-0.115, 0.19, 0), DARK);
  cb.box(0.05, 0.02, 0.02, mat(-0.115, 0.07, 0), DARK);
  cb.box(0.04, 0.02, 0.04, mat(0.115, 0.225, 0), PALE);                    // spout
  carafe.add(new THREE.Mesh(cb.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.5, side: THREE.DoubleSide })));
  // the glass: the coffee shows through it
  const gb = new Builder();
  gb.add(new THREE.CylinderGeometry(0.1, 0.11, 0.22, 12, 1, true), mat(0, 0.11, 0), 0x91cbde, 1);
  const glassM = new THREE.Mesh(gb.build(), glowMaterial({ opacity: 0.22, fresnel: 0.9, fog: 0, additive: false, side: THREE.DoubleSide }));
  glassM.layers.set(LAYER_FX);
  carafe.add(glassM);
  const coffee = new Builder();
  coffee.cyl(0.095, 0.105, 1, 12, mat(0, 0.5, 0), 0x1c1d22);
  const coffeeM = new THREE.Mesh(coffee.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.4 }));
  coffeeM.scale.set(1, 0.001, 1);
  coffeeM.position.y = 0.01;
  carafe.add(coffeeM);
  carafe.position.set(-0.2, 0.078, 0);
  group.add(carafe);
  const stream = new Builder();
  stream.cyl(0.008, 0.008, 1, 4, mat(0, -0.5, 0), 0x2a2f32);
  const streamM = new THREE.Mesh(stream.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.6 }));
  streamM.position.set(-0.2, 0.72, 0);
  streamM.visible = false;
  group.add(streamM);
  // the cup, on the counter beside it
  const cup = new THREE.Group();
  const ub = new Builder();
  ub.add(new THREE.CylinderGeometry(0.045, 0.036, 0.09, 10, 1, true), mat(0, 0.045, 0), 0xc2c9c9);
  ub.cyl(0.036, 0.036, 0.008, 10, mat(0, 0.004, 0), 0xc2c9c9);
  ub.add(new THREE.TorusGeometry(0.022, 0.006, 4, 8, Math.PI), mat(0.045, 0.048, 0, 0, 0, -Math.PI / 2), 0xc2c9c9);
  cup.add(new THREE.Mesh(ub.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.5, side: THREE.DoubleSide })));
  const cupFill = new Builder();
  cupFill.cyl(0.04, 0.04, 0.005, 10, mat(0, 0, 0), 0x1c1d22);
  const cupFillM = new THREE.Mesh(cupFill.build(), worldMaterial({ unique: true, fogMask: 0, ambient: 0.5 }));
  cupFillM.visible = false;
  cup.add(cupFillM);
  cup.position.copy(CUP_REST);
  cup.rotation.y = 2.4;
  group.add(cup);
  group.userData = { body, ring, plateM, waterM, carafe, coffeeM, streamM, cup, cupFillM };
  return group;
}

export class Interior {
  constructor(ship) {
    this.ship = ship;
    this.group = new THREE.Group();
    ship.root.add(this.group);
    this.mat = worldMaterial({ unique: true, fogMask: 0, ambient: 0.42, side: THREE.DoubleSide });
    this.coreMat = worldMaterial({ unique: true, fogMask: 0 });
    this.core = new THREE.Mesh(new THREE.BufferGeometry(), this.coreMat);
    this.group.add(this.core);
    const colG = new THREE.CylinderGeometry(0.62, 0.62, 2.85, 16, 1, true);
    const n = colG.attributes.position.count;
    colG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.6), 3));
    colG.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    this.column = new THREE.Mesh(colG, glowMaterial({ opacity: 0.18, fresnel: 1, fog: 0, side: THREE.DoubleSide, tint: 0x91cbde }));
    this.column.layers.set(LAYER_FX);
    this.group.add(this.column);
    this.coreHalo = halo(0x91cbde, 2.4, 0.5);
    this.coreHalo.layers.set(LAYER_FX);
    this.group.add(this.coreHalo);
    // the coffee machine
    this.machine = coffeeMachine();
    this.machine.position.copy(MACHINE);
    this.group.add(this.machine);
    // the Codex computer's screen: a canvas, redrawn now and then
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 160;
    this.screenCanvas.height = 100;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.magFilter = THREE.NearestFilter;
    this.screenTex.minFilter = THREE.NearestFilter;
    this.screenTex.generateMipmaps = false;
    const sm = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.screenTex }, uGlow: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float uGlow; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb * uGlow, 0.0); }',
    });
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(1.36, 0.85), sm);
    this.screen.position.set(TERMINAL.x - 0.05, TERMINAL.y + 0.05, TERMINAL.z);
    // facing into the cabin, leaning back with its frame (about the world's z, not its own)
    this.screen.rotation.set(0, Math.PI / 2, 0.1, 'ZYX');
    this.group.add(this.screen);
    this.group.visible = false;
    this.consoleZ = 7.55;
    this.spots = [];
    this.setDesign(ship.design);
  }

  // build the cabin of the ship's design (the ship has been built first)
  setDesign(design) {
    const H = this.ship.H, C = design.cabin, core = design.look.core;
    this.H = H;
    this.design = design;
    for (const m of [this.mesh, this.glass]) if (m) { this.group.remove(m); m.geometry.dispose(); }
    const b = shell(H, C);
    floor(b, H, C, core);
    ribs(b, H, C, core);
    cockpit(b, C, core);
    door(b, H, C, core);
    coffeeCounter(b, H, C);
    terminalDesk(b, H, C);
    rear(b, H, C, core);
    // walls and furniture, for walking: boxes in ship space (x0, z0, x1, z1)
    const Z = (z) => H.aft(z);
    const out = {
      boxes: [
        [2.0, -0.45, 3.2, 2.05],       // counter
        [-3.2, -0.25, -1.98, 1.85],    // desk
        [-1.82, 0.58, -1.38, 1.02],    // stool
        [-0.38, 5.95, 0.38, 6.75],     // seat
        [1.65, Z(-5.0), 3.2, Z(-2.6)], // bunk
        [-3.2, Z(-5.2), -2.1, Z(-2.6)], // lockers
      ],
      spots: [],
    };
    const R = rng(design.id.length * 977 + 13);
    C.rooms.forEach((kind, i) => ROOMS[kind](b, R, H, C, core, H.room[1] - (i + 1) * 3, H.room[1] - i * 3, out));
    this.mesh = new THREE.Mesh(b.build(), this.mat);
    this.group.add(this.mesh);
    this.glass = glass(H);
    this.group.add(this.glass);
    this.boxes = out.boxes;
    this.coreAt = new THREE.Vector3(0, 0, Z(-6.35));
    this.rearZ = Z(-7.2);
    // the core's light in its column, in the ship's color
    this.core.position.set(0, 1.55, this.coreAt.z);
    this.column.position.set(0, 1.6, this.coreAt.z);
    this.column.material.uniforms.uTint.value.setHex(core);
    this.coreHalo.position.set(0, 1.55, this.coreAt.z);
    this.coreHalo.material.uniforms.uColor.value.setHex(core);
    this.core.geometry.dispose();
    this.core.geometry = new Builder().ico(0.32, 1, mat(0, 0, 0), mixHex(core, 0xffffff, 0.6), 3).build();
    // the places to use (a seeker aboard keeps its own)
    const keep = this.spots.filter((s) => s.id === 'companion');
    this.spots = [
      { id: 'coffee', at: new THREE.Vector3(1.75, 1.2, 0.8), label: 'Make coffee', r: 1.5 },
      { id: 'codex', at: new THREE.Vector3(-1.9, 1.4, 0.8), label: 'Use the Codex computer', r: 1.6 },
      { id: 'seat', at: new THREE.Vector3(0, 0.9, 6.3), label: this.landed ? 'Take off' : 'Take the controls', r: 1.4 },
      ...(this.landed ? [{ id: 'hatch', at: new THREE.Vector3(-floorHalf(H, (DOOR.z0 + DOOR.z1) / 2) + 0.5, 1.2, (DOOR.z0 + DOOR.z1) / 2), label: 'Go outside', r: 1.5 }] : []),
      ...out.spots,
      ...keep,
    ];
    // the lamps: the general one stands in the middle of the cabin
    this._mid = (Z(-6.35) + 6) / 2;
    this._reach = 9 + H.L * 0.5;
  }

  // landed (the controls take off again, the door opens on the forest), or flying
  setLanded(on) {
    this.landed = on;
    const seat = this.spots.find((s) => s.id === 'seat');
    seat.label = on ? 'Take off' : 'Take the controls';
    this.spots = this.spots.filter((s) => s.id !== 'hatch');
    const zm = (DOOR.z0 + DOOR.z1) / 2;
    if (on) this.spots.push({ id: 'hatch', at: new THREE.Vector3(-floorHalf(this.H, zm) + 0.5, 1.2, zm), label: 'Go outside', r: 1.5 });
  }

  // where a walker may stand
  free(x, z, r = 0.3) {
    if (z < this.rearZ || z > this.consoleZ - r) return false;
    const hw = Math.min(floorHalf(this.H, z - r), floorHalf(this.H, z + r), floorHalf(this.H, z));
    if (Math.abs(x) > hw - 0.35 - r) return false;
    for (const [x0, z0, x1, z1] of this.boxes) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false;
    if (Math.hypot(x - this.coreAt.x, z - this.coreAt.z) < 1.25 + r) return false;
    return true;
  }

  // the cabin's lamps, in render space (slots 4..7)
  lights(on, beat) {
    const P = U.uPointPos.value, C = U.uPointColor.value;
    const m = this.ship.root.matrixWorld;
    const set = (i, x, y, z, r, c, k) => {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(m);
      P[i].set(v.x, v.y, v.z, on ? r : 0);
      C[i].setHex(c).multiplyScalar(k);
    };
    const pulse = 0.85 + 0.15 * Math.cos(beat * TAU), d = this.design;
    set(4, 2.1, 2.25, 0.8, 4.2, d.cabin.lamp, 0.9);
    set(5, -2.0, 1.6, 0.8, 3.4, 0x7bacbc, 0.55);
    set(6, 0, 1.6, this.coreAt.z, 7.5, d.look.core, 0.75 * pulse);
    set(7, 0, 2.8, this._mid, this._reach, mixHex(0xcfdde4, d.cabin.lamp, 0.4), 0.32);
    this.coreMat.uniforms.uPulse.value = pulse;
  }

  // the screen: the latest photograph, the count, a pulse of the network
  drawScreen(entries, status) {
    const c = this.screenCanvas, ctx = c.getContext('2d');
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#29303e';
    ctx.fillRect(4, 4, c.width - 8, 1);
    ctx.fillStyle = '#91cbde';
    ctx.font = '8px monospace';
    ctx.fillText('CODEX', 6, 14);
    ctx.fillStyle = '#8a919e';
    ctx.fillText(`${entries.length} RECORDED`, 60, 14);
    const last = entries[0];
    if (last && last.img && last.img.complete) {
      ctx.drawImage(last.img, 6, 20, 96, 54);
      ctx.fillStyle = '#f0f2e8';
      ctx.fillText(last.name.slice(0, 24), 6, 86);
    } else {
      ctx.fillStyle = '#454a4f';
      ctx.fillText('NO ENTRIES YET', 6, 50);
    }
    ctx.fillStyle = status === 'live' ? '#abe3d9' : '#8a919e';
    ctx.fillText(status === 'live' ? 'SEEKER NET LIVE' : 'SEEKER NET ' + String(status).toUpperCase(), 6, 96);
    this.screenTex.needsUpdate = true;
  }
}
