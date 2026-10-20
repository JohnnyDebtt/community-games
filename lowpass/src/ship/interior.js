import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial, halo, U } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { section, hullPoint, isWindow, RIBS } from './ship.js';
import { TAU } from '../core/math.js';

// The cabin: long and calm, a dark shell ribbed like the outside, warm lamps, the forest
// sliding past the windows. At the front the controls under the windshield; amidships
// the coffee machine on the left wall and the Codex computer on the right; at the back a
// bunk, lockers, and the ship's core in a glass column, breathing.
//
// Ship space: +z forward, +x to the left (facing forward), the floor at y = 0.

const INNER = 0.9;            // the cabin's shell, inside the hull
const WALL = 0x20242a, WALL2 = 0x262b32, DARK = 0x181c20, VINE = 0x0f0e16, PLATE = 0x2a2f32, RUNNER = 0x353e50;
const PALE = 0x94a6b1, EDGE = 0x4f5d73;

// half width of the floor at z (where the inner shell meets y = 0)
export function floorHalf(z) {
  const [w, hh, yc] = section(z);
  const yr = (0 - yc) / (hh * INNER * 0.82);
  if (Math.abs(yr) >= 1) return 0;
  return w * INNER * Math.pow(1 - Math.pow(Math.abs(yr), 2.7), 1 / 2.7);
}

export const MACHINE = new THREE.Vector3(2.42, 0.92, 0.8);   // on the counter, facing -x
export const CUP_REST = new THREE.Vector3(-0.34, 0, 0.4);    // the cup beside it (machine space)
export const TERMINAL = new THREE.Vector3(-2.5, 1.5, 0.8);   // on the right wall, facing +x
export const SEAT = new THREE.Vector3(0, 0, 6.3);
export const CORE = new THREE.Vector3(0, 0, -6.35);

function shell() {
  const b = new Builder();
  const SEG = 28;
  const zs = [];
  for (let z = -7.7; z < 10.6; z += 0.6) zs.push(z);
  zs.push(10.6);
  for (let i = 0; i < zs.length - 1; i++) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU;
      const z0 = zs[i], z1 = zs[i + 1];
      const am = (a0 + a1) / 2, zm = (z0 + z1) / 2;
      if (isWindow(zm, am)) continue;
      const p00 = hullPoint(z0, a0, INNER), p01 = hullPoint(z0, a1, INNER), p10 = hullPoint(z1, a0, INNER), p11 = hullPoint(z1, a1, INNER);
      if (Math.max(p00[1], p01[1], p10[1], p11[1]) < 0.0) continue;
      const s = Math.sin(am);
      let col = s > 0.7 ? DARK : (i % 3 === 0 ? WALL2 : WALL);
      // the window frames: pale where the shell meets the glass
      if (isWindow(zm + 0.6, am) || isWindow(zm - 0.6, am) || isWindow(zm, am + 0.23) || isWindow(zm, am - 0.23)) col = EDGE;
      b.quad(p00, p10, p11, p01, col);
    }
  }
  // the rear wall, behind the core
  const back = new THREE.Shape();
  const N = 24;
  for (let k = 0; k <= N; k++) {
    const p = hullPoint(-7.7, (k / N) * TAU, INNER);
    if (k === 0) back.moveTo(p[0], Math.max(p[1], 0)); else back.lineTo(p[0], Math.max(p[1], 0));
  }
  b.add(new THREE.ShapeGeometry(back), mat(0, 0, -7.7), DARK);
  return b;
}

function floor(b) {
  for (let z = -7.7; z < 9.8; z += 0.8) {
    const h0 = floorHalf(z), h1 = floorHalf(z + 0.8);
    const hw = Math.min(h0, h1);
    if (hw <= 0.1) continue;
    const plates = Math.floor((z + 8) / 0.8) % 2 ? PLATE : WALL2;
    b.quad([-h0, 0, z], [h0, 0, z], [h1, 0, z + 0.8], [-h1, 0, z + 0.8], plates);
    // the runner down the middle, with guide lights at its edges
    b.box(0.9, 0.02, 0.76, mat(0, 0.01, z + 0.4), RUNNER);
    if (Math.floor((z + 8) / 0.8) % 2) for (const s of [-1, 1]) b.box(0.05, 0.03, 0.12, mat(s * 0.5, 0.015, z + 0.4), 0x91cbde, 1.4);
  }
}

// ribs inside: dark arches over the cabin, a vine along the ceiling, a light strip
function ribs(b) {
  for (const rz of RIBS) {
    const pts = [];
    for (let k = 0; k <= 30; k++) {
      const a = -0.5 + (k / 30) * (Math.PI + 1.0);
      const p = hullPoint(rz, a, INNER * 0.965);
      if (p[1] < -0.05) continue;
      pts.push(new THREE.Vector3(p[0], p[1], p[2]));
    }
    b.tube(pts, (t) => 0.13 + Math.sin(t * 11) * 0.02, 5, VINE);
  }
  const sp = [];
  for (let k = 0; k <= 30; k++) {
    const z = -7.4 + (k / 30) * 13;
    const p = hullPoint(z, Math.PI / 2 + Math.sin(k * 0.6) * 0.06, INNER * 0.96);
    sp.push(new THREE.Vector3(p[0], p[1], p[2]));
  }
  b.tube(sp, 0.12, 5, VINE);
  for (let z = -6; z < 5.5; z += 0.5) {
    const p = hullPoint(z, Math.PI / 2, INNER * 0.955);
    b.box(0.08, 0.03, 0.3, mat(0.32, p[1] - 0.05, z), 0x91cbde, 0.45);
    b.box(0.08, 0.03, 0.3, mat(-0.32, p[1] - 0.05, z), 0x91cbde, 0.45);
  }
}

function cockpit(b) {
  // the pilot's seat: a dark shell on a pedestal
  const s = SEAT;
  b.cyl(0.18, 0.24, 0.45, 8, mat(s.x, 0.22, s.z), DARK);
  b.box(0.62, 0.12, 0.6, mat(s.x, 0.5, s.z), WALL2);
  b.box(0.62, 0.8, 0.12, mat(s.x, 0.95, s.z - 0.3, -0.22, 0, 0), WALL2);
  b.box(0.36, 0.22, 0.1, mat(s.x, 1.45, s.z - 0.42, -0.22, 0, 0), DARK);
  for (const x of [-0.36, 0.36]) b.box(0.08, 0.06, 0.5, mat(s.x + x, 0.72, s.z), EDGE);
  // the console: an arc under the windshield, screens lit low
  for (let i = -3; i <= 3; i++) {
    const a = i * 0.24;
    const r = 1.75;
    const x = Math.sin(a) * r, z = 6.6 + Math.cos(a) * r * 0.7;
    b.box(0.5, 0.82, 0.5, mat(x, 0.41, z, 0, a, 0), DARK);
    b.box(0.52, 0.06, 0.62, mat(x, 0.84, z - 0.04, -0.35, a, 0), WALL2);
    if (i !== 0) {
      b.box(0.36, 0.03, 0.26, mat(x, 0.88, z - 0.08, -0.35, a, 0), 0x12151d);
      for (let l = 0; l < 3; l++) b.box(0.22 - l * 0.05, 0.035, 0.018, mat(x, 0.89, z - 0.14 + l * 0.05, -0.35, a, 0), i % 2 ? 0x7bacbc : 0x627594, 0.55);
    }
  }
  // a small cluster of controls in front of the seat
  b.box(0.3, 0.04, 0.2, mat(0, 0.9, 7.95, -0.35, 0, 0), 0x12151d);
  b.box(0.05, 0.045, 0.05, mat(0.08, 0.92, 7.95, -0.35, 0, 0), 0x91cbde, 0.9);
}

function coffeeCounter(b) {
  const z0 = -0.4, z1 = 2.0;
  b.box(0.82, 0.88, z1 - z0, mat(2.47, 0.44, (z0 + z1) / 2), DARK);
  b.box(0.9, 0.05, z1 - z0 + 0.04, mat(2.45, 0.905, (z0 + z1) / 2), RUNNER);
  b.box(0.04, 0.05, z1 - z0 + 0.04, mat(2.02, 0.905, (z0 + z1) / 2), PALE);
  // a shelf above, cups on it
  b.box(0.36, 0.04, 1.2, mat(2.75, 1.75, 1.35), DARK);
  for (let i = 0; i < 3; i++) b.cyl(0.05, 0.042, 0.1, 8, mat(2.72, 1.82, 0.95 + i * 0.22), i === 1 ? 0x97acb0 : 0xc2c9c9);
  // a warm lamp over the counter
  b.cyl(0.02, 0.02, 0.6, 4, mat(2.1, 2.75, 0.8), VINE);
  b.cone(0.16, 0.16, 8, mat(2.1, 2.4, 0.8), DARK);
  b.sphere(0.07, 6, 4, mat(2.1, 2.32, 0.8), 0xe6d2b0, 2.0);
}

function terminalDesk(b) {
  b.box(0.75, 0.06, 1.8, mat(-2.4, 0.78, 0.8), WALL2);
  b.box(0.08, 0.76, 1.6, mat(-2.62, 0.39, 0.8), DARK);
  b.box(0.03, 0.06, 1.8, mat(-2.03, 0.78, 0.8), PALE);
  // the frame around the screen
  b.box(0.1, 1.0, 1.6, mat(-2.62, 1.55, 0.8, 0, 0, 0.1), DARK);
  // a stool
  b.cyl(0.22, 0.2, 0.06, 10, mat(-1.6, 0.56, 0.8), WALL2);
  b.cyl(0.04, 0.06, 0.55, 6, mat(-1.6, 0.27, 0.8), DARK);
}

function rear(b) {
  // the bunk on the left wall: a low bed, a blanket, a pillow
  b.box(0.95, 0.42, 2.3, mat(2.2, 0.21, -3.8), DARK);
  b.box(0.9, 0.12, 2.2, mat(2.2, 0.48, -3.8), 0x465b7d);
  b.box(0.6, 0.12, 0.38, mat(2.25, 0.6, -4.7), 0x97acb0);
  b.box(0.88, 0.16, 0.9, mat(2.2, 0.56, -3.1, 0, 0, 0.04), 0x627594);
  // moss in a bowl on a shelf above it
  b.box(0.4, 0.04, 1.0, mat(2.65, 1.5, -3.8), DARK);
  b.cyl(0.16, 0.12, 0.14, 8, mat(2.6, 1.59, -3.5), 0x353b44);
  const moss = new THREE.IcosahedronGeometry(0.15, 0);
  roughen(moss, 0.06, 4);
  b.add(moss, mat(2.6, 1.7, -3.5, 0, 0, 0, 1, 0.6, 1), 0x49573d, 0, { flat: true });
  b.sphere(0.03, 4, 3, mat(2.65, 1.76, -3.46), 0xad2e41);
  b.sphere(0.03, 4, 3, mat(2.55, 1.75, -3.55), 0x8c9245);
  // lockers on the right wall
  for (let i = 0; i < 4; i++) {
    b.box(0.55, 2.0, 0.56, mat(-2.4, 1.0, -4.85 + i * 0.6), i % 2 ? WALL2 : WALL);
    b.box(0.03, 0.3, 0.04, mat(-2.11, 1.15, -4.85 + i * 0.6 + 0.18), PALE);
  }
  // the core: a glass column, vines around it
  const c = CORE;
  b.cyl(0.85, 0.95, 0.25, 14, mat(c.x, 0.12, c.z), DARK);
  b.cyl(0.85, 0.85, 0.2, 14, mat(c.x, 3.05, c.z), DARK);
  for (let v = 0; v < 3; v++) {
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const t = k / 40, a = (v / 3) * TAU + t * TAU * 1.25;
      pts.push(new THREE.Vector3(c.x + Math.cos(a) * 0.7, 0.2 + t * 2.8, c.z + Math.sin(a) * 0.7));
    }
    b.tube(pts, 0.07, 4, VINE);
  }
  // a ring rail around it
  b.torus(1.2, 0.035, 4, 24, mat(c.x, 0.95, c.z, Math.PI / 2, 0, 0), EDGE);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.cyl(0.03, 0.03, 0.95, 4, mat(c.x + Math.cos(a) * 1.2, 0.47, c.z + Math.sin(a) * 1.2), EDGE); }
  // a round rug amidships
  b.cyl(1.25, 1.25, 0.02, 20, mat(0, 0.012, -1.0, 0, 0, 0, 1, 1, 0.8), 0x2d2e33);
  b.add(new THREE.TorusGeometry(1.05, 0.03, 3, 24), mat(0, 0.025, -1.0, Math.PI / 2, 0, 0, 1, 0.8, 1), 0x4c5c8c);
}

// glass for every window, drawn after the fog: a faint sheen
function glass() {
  const pos = [], col = [], em = [];
  const SEG = 28;
  for (let z = -7.7; z < 10.6; z += 0.6) {
    for (let k = 0; k < SEG; k++) {
      const a0 = (k / SEG) * TAU, a1 = ((k + 1) / SEG) * TAU, z1 = Math.min(z + 0.6, 10.6);
      if (!isWindow((z + z1) / 2, (a0 + a1) / 2)) continue;
      const P = [hullPoint(z, a0, 0.93), hullPoint(z1, a0, 0.93), hullPoint(z1, a1, 0.93), hullPoint(z, a1, 0.93)];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...P[i]); col.push(0.55, 0.68, 0.74); em.push(1); }
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
    const b = shell();
    floor(b);
    ribs(b);
    cockpit(b);
    coffeeCounter(b);
    terminalDesk(b);
    rear(b);
    this.mat = worldMaterial({ unique: true, fogMask: 0, ambient: 0.42, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(b.build(), this.mat);
    this.group.add(this.mesh);
    this.group.add(glass());
    // the core's light in its column
    const cb = new Builder();
    cb.ico(0.32, 1, mat(0, 0, 0), 0xd6edf5, 3);
    this.coreMat = worldMaterial({ unique: true, fogMask: 0 });
    this.core = new THREE.Mesh(cb.build(), this.coreMat);
    this.core.position.set(CORE.x, 1.55, CORE.z);
    this.group.add(this.core);
    const colG = new THREE.CylinderGeometry(0.62, 0.62, 2.85, 16, 1, true);
    colG.translate(CORE.x, 1.6, CORE.z);
    const n = colG.attributes.position.count;
    colG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(0.6), 3));
    colG.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    const column = new THREE.Mesh(colG, glowMaterial({ opacity: 0.18, fresnel: 1, fog: 0, side: THREE.DoubleSide, tint: 0x91cbde }));
    column.layers.set(LAYER_FX);
    this.group.add(column);
    const h = halo(0x91cbde, 2.4, 0.5);
    h.position.set(CORE.x, 1.55, CORE.z);
    h.layers.set(LAYER_FX);
    this.group.add(h);
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

    // walls and furniture, for walking: boxes in ship space (x0, z0, x1, z1)
    this.boxes = [
      [2.0, -0.45, 3.2, 2.05],       // counter
      [-3.2, -0.25, -1.98, 1.85],    // desk
      [-1.82, 0.58, -1.38, 1.02],    // stool
      [-0.38, 5.95, 0.38, 6.75],     // seat
      [1.65, -5.0, 3.2, -2.6],       // bunk
      [-3.2, -5.2, -2.1, -2.6],      // lockers
    ];
    this.consoleZ = 7.55;
    this.spots = [
      { id: 'coffee', at: new THREE.Vector3(1.75, 1.2, 0.8), label: 'Make coffee', r: 1.5 },
      { id: 'codex', at: new THREE.Vector3(-1.9, 1.4, 0.8), label: 'Use the Codex computer', r: 1.6 },
      { id: 'seat', at: new THREE.Vector3(0, 0.9, 6.3), label: 'Take the controls', r: 1.4 },
    ];
  }

  // where a walker may stand
  free(x, z, r = 0.3) {
    if (z < -7.2 || z > this.consoleZ - r) return false;
    const hw = Math.min(floorHalf(z - r), floorHalf(z + r), floorHalf(z));
    if (Math.abs(x) > hw - 0.35 - r) return false;
    for (const [x0, z0, x1, z1] of this.boxes) if (x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r) return false;
    if (Math.hypot(x - CORE.x, z - CORE.z) < 1.25 + r) return false;
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
    const pulse = 0.85 + 0.15 * Math.cos(beat * TAU);
    set(4, 2.1, 2.25, 0.8, 4.2, 0xe6c9a0, 0.9);
    set(5, -2.0, 1.6, 0.8, 3.4, 0x7bacbc, 0.55);
    set(6, CORE.x, 1.6, CORE.z, 7.5, 0x91cbde, 0.75 * pulse);
    set(7, 0, 2.8, 2.5, 9, 0xcfdde4, 0.32);
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
