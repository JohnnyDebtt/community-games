import * as THREE from 'three';
import { TAU, clamp, damp, dampAngle } from '../core/math.js';
import { worldMaterial } from '../render/materials.js';
import { Builder, mat, roughen } from '../render/build.js';
import { addOutline, smoothNormals } from '../render/outline.js';
import { revolve, clothColor } from './player.js';
import { BEAT } from '../core/audio.js';

// The Vagrant and their yak, two travelers from The Seeker's caves (its own sprites:
// animations/vagrant and animations/yak), out on the ice. The Vagrant is small and
// stooped, a green hood over a dark face and two lit eyes, a blue coat, a tall red pack
// with a crate on top, and a round-bodied lute they play while no one is near. The yak
// lies beside them, a white heap of fur under curled grey horns, carrying the whole
// camp: a spare hat, green bedrolls, a red chest, a blue lantern box, a blanket.

// colors from the sprites
const HOOD = 0x6b8e5e, HOOD2 = 0x36542a, FACE = 0x1a1c20, COAT = 0x4b7496, COAT2 = 0x313e63;
const PANTS = 0x231a1e, BOOT = 0x1a1c20, GLOVE = 0x474d4c;
const PACK = 0x803e31, PACK2 = 0x632316, PACK3 = 0x441723, WOOD = 0x5b3c32, WOOD2 = 0x705731, ROLL = 0x8c867e;
const FUR = 0xf3f8f8, FUR2 = 0xc2c9c9, FUR3 = 0x97acb0, FUR4 = 0x7f8b94, HORN = 0x72636a, HORN2 = 0x6b6c7f, HORN3 = 0x3a2638;
const MUZZLE = 0x36282e, BLANKET = 0x404e66, BLANKET2 = 0x626c7b, ROLLG = 0x2a3d22, ROLLG2 = 0x36542a, CHEST = 0x632316, CHEST2 = 0x441723;
const LAMP = 0x91cbde;

const step12 = (t) => Math.floor(t * 12) / 12;
// the yak is the big one: about twice the Vagrant's bulk, lying down
const YAK_SCALE = 1.3;

function meshOf(geo, m) {
  smoothNormals(geo);
  const x = new THREE.Mesh(geo, m);
  addOutline(x);
  return x;
}

// ------------------------------------------------------------------ the Vagrant
function vagrantBody() {
  const b = new Builder();
  // boots and legs, under the coat
  for (const s of [-1, 1]) {
    b.cyl(0.055, 0.06, 0.2, 7, mat(s * 0.08, 0.11, 0), PANTS);
    b.box(0.11, 0.07, 0.19, mat(s * 0.08, 0.035, 0.03), BOOT);
  }
  // the coat: a short, heavy robe, blue, darker in its folds and at the hem
  revolve(b, [[0.25, 0.17], [0.26, 0.25], [0.25, 0.4], [0.23, 0.55], [0.21, 0.67], [0.17, 0.75], [0.1, 0.79], [0.0, 0.8]], 18, {
    matrix: mat(0, 0, 0, 0, 0, 0, 1, 1, 0.86), folds: 7, fold: 0.06, hem: 0.018,
    color: clothColor(COAT, COAT2, COAT2),
  });
  // a belt with a pouch
  b.cyl(0.228, 0.232, 0.04, 16, mat(0, 0.47, 0, 0, 0, 0, 1, 1, 0.86), WOOD);
  b.box(0.08, 0.08, 0.05, mat(0.12, 0.43, 0.18, 0, 0.5, 0), WOOD2);
  // the pack's straps over the shoulders
  for (const s of [-1, 1]) b.box(0.04, 0.24, 0.03, mat(s * 0.11, 0.63, 0.19, -0.2, 0, 0), PACK3);
  // the pack: tall and red, side pockets, a crate on top, a rolled cloth, a lamp
  b.box(0.42, 0.46, 0.26, mat(0, 0.74, -0.25), PACK);
  b.box(0.4, 0.08, 0.27, mat(0, 0.96, -0.25), PACK2);
  for (const s of [-1, 1]) b.box(0.08, 0.2, 0.2, mat(s * 0.24, 0.66, -0.25), PACK2);
  b.box(0.36, 0.04, 0.28, mat(0, 0.56, -0.25), PACK3);
  b.box(0.34, 0.2, 0.24, mat(0, 1.09, -0.27), WOOD);
  for (const y of [1.02, 1.1, 1.18]) b.box(0.35, 0.02, 0.25, mat(0, y, -0.27), WOOD2);
  b.cyl(0.07, 0.07, 0.44, 8, mat(0, 1.0, -0.1, 0, 0, Math.PI / 2), ROLL);
  b.box(0.07, 0.1, 0.07, mat(0.27, 0.6, -0.17), WOOD);
  b.box(0.05, 0.06, 0.075, mat(0.27, 0.6, -0.17), LAMP, 1.1);
  return b.build();
}

function vagrantHead() {
  const b = new Builder();
  // the hood: deep and round, its rim falling over the shoulders like a mantle, dark
  // down the left as in the sprite
  const face = (x, y, z) => z > 0.08 && Math.abs(x) < 0.125 - Math.max(0, y - 0.16) * 0.6 && y > 0.03 && y < 0.25;
  revolve(b, [[0.25, -0.07], [0.26, 0.03], [0.25, 0.13], [0.22, 0.23], [0.17, 0.3], [0.1, 0.35], [0.0, 0.37]], 18, {
    warp: (x, y, z) => [x, y, z + (z > 0 ? 0.03 * clamp((y - 0.05) / 0.2, 0, 1) : 0) - Math.pow(clamp(y / 0.37, 0, 1), 2) * 0.05],
    folds: 5, fold: 0.04, hem: 0.012,
    color: (x, y, z, c) => (x < -0.17 || c < -0.45 ? HOOD2 : HOOD),
    keep: (x, y, z) => !face(x, y, z),
  });
  // the dark inside, and two lit eyes
  b.sphere(0.16, 10, 8, mat(0, 0.14, 0.02, 0, 0, 0, 1, 0.95, 0.95), FACE);
  for (const s of [-1, 1]) b.box(0.034, 0.03, 0.02, mat(s * 0.045, 0.15, 0.165), 0xffffff, 1.4);
  return b.build();
}

function vagrantArm() {
  const b = new Builder();
  b.cyl(0.06, 0.055, 0.3, 7, mat(0, -0.15, 0), COAT);
  b.cyl(0.062, 0.062, 0.04, 7, mat(0, -0.28, 0), COAT2);
  b.box(0.07, 0.08, 0.08, mat(0, -0.34, 0.01), GLOVE);
  return b.build();
}

function luteGeometry() {
  const b = new Builder();
  // a round body, a soundhole, a neck with a bent-back head and its pegs
  b.sphere(0.13, 12, 8, mat(0, 0, 0, 0, 0, 0, 1, 1.12, 0.42), WOOD2);
  b.cyl(0.1, 0.1, 0.012, 12, mat(0, 0.0, 0.052, Math.PI / 2, 0, 0, 1, 1, 1), WOOD);
  b.cyl(0.035, 0.035, 0.014, 10, mat(0, 0.02, 0.058, Math.PI / 2, 0, 0), FACE);
  b.box(0.045, 0.32, 0.026, mat(0, 0.29, 0.02), WOOD);
  b.box(0.06, 0.09, 0.03, mat(0, 0.48, -0.01, -0.5, 0, 0), WOOD);
  for (const s of [-1, 1]) b.box(0.07, 0.012, 0.012, mat(s * 0.01, 0.47, 0.0, -0.5, 0, 0), ROLL);
  for (const x of [-0.012, 0.012]) b.box(0.003, 0.5, 0.004, mat(x, 0.18, 0.058), 0xc2c9c9);
  return b.build();
}

export class Vagrant {
  constructor(scene) {
    const m = worldMaterial({ unique: true, smooth: true, side: THREE.DoubleSide });
    this.material = m;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(meshOf(vagrantBody(), m));
    this.head = new THREE.Group();
    this.head.position.set(0, 0.8, 0.02);
    this.body.add(this.head);
    this.head.add(meshOf(vagrantHead(), m));
    const arm = (s) => {
      const g = new THREE.Group();
      g.position.set(s * 0.21, 0.72, 0.03);
      g.add(meshOf(vagrantArm(), m));
      this.body.add(g);
      return g;
    };
    this.armL = arm(1);
    this.armR = arm(-1);
    this.lute = meshOf(luteGeometry(), m);
    this.body.add(this.lute);
    this.facing = 0;
    this.home = 0;          // the facing they play toward
    this.playing = true;
    this.talk = 0;          // > 0 while a word of theirs is showing
    this.lookAt = null;
    this.lamp = { pos: new THREE.Vector3(), color: new THREE.Color(LAMP), range: 3.2, intensity: 0, on: true };
    scene.add(this.root);
  }

  place(x, y, z, facing) {
    this.root.position.set(x, y, z);
    this.facing = this.home = facing;
  }

  // The top of the hood, in the world: where their words and their music rise from.
  top(v = new THREE.Vector3()) {
    return v.set(this.root.position.x, this.root.position.y + 1.32, this.root.position.z);
  }

  update(dt, time, night) {
    const tq = step12(time);
    const beat = time / BEAT;
    const B = this.body, L = this.lute;
    // facing: toward whoever comes near, else back to their tune
    let want = this.home;
    if (!this.playing && this.lookAt) want = Math.atan2(this.lookAt.x - this.root.position.x, this.lookAt.z - this.root.position.z);
    this.facing = dampAngle(this.facing, want, 4, dt);
    this.root.rotation.y = Math.round(this.facing * 24 / TAU) * TAU / 24;
    if (this.playing) {
      // the lute across the body, strummed on the eighth notes, a nod on the beat
      L.position.set(0.04, 0.5, 0.2);
      L.rotation.set(0.15, 0.2, -1.05);
      const eighth = Math.floor(beat * 2);
      this.armR.rotation.set(-0.95 + (eighth % 2 ? 0.16 : -0.06), 0, 0.5);
      this.armL.rotation.set(-1.15, 0, -0.95 + Math.sin(tq * 1.7) * 0.04);
      B.position.y = Math.abs(Math.sin(Math.floor(beat * 4) / 4 * Math.PI)) * 0.012;
      this.head.rotation.set(0.08 + (Math.floor(beat) % 2 ? 0.07 : 0), 0, Math.sin(Math.floor(beat / 2) * 1.7) * 0.08);
    } else {
      // the lute put away on the pack, arms down; a nod while they speak
      L.position.set(0.0, 0.84, -0.42);
      L.rotation.set(0.1, Math.PI, 0.35);
      this.armR.rotation.set(0.05, 0, -0.08);
      this.armL.rotation.set(0.05, 0, 0.08);
      B.position.y = Math.sin(tq * 1.6) * 0.006;
      const nod = this.talk > 0 ? (Math.floor(tq * 3) % 2 ? 0.06 : -0.02) : 0;
      this.head.rotation.set(nod - 0.05, 0, 0);
      this.talk = Math.max(0, this.talk - dt);
    }
    // the lamp on the pack: brighter at night
    this.lamp.pos.set(this.root.position.x, this.root.position.y + 0.8, this.root.position.z);
    this.lamp.intensity = 0.15 + night * 0.55;
  }
}

// ------------------------------------------------------------------ the yak
// Fur: a long white heap lying on the ice, humped at the shoulders, its coat hanging
// to the ice in uneven locks.
function yakBody() {
  const b = new Builder();
  const furColor = (x, y) => (y > 0.55 ? FUR : y > 0.0 ? (x > 0.55 ? FUR2 : FUR) : y > -0.45 ? FUR2 : FUR3);
  const body = new THREE.SphereGeometry(1, 18, 12);
  // the hump over the shoulders, the haunches lower
  const ps = body.attributes.position;
  for (let i = 0; i < ps.count; i++) {
    const x = ps.getX(i), y = ps.getY(i), z = ps.getZ(i);
    const hump = Math.max(0, y) * Math.exp(-((z - 0.35) ** 2) / 0.18) * 0.28;
    ps.setY(i, y + hump - Math.max(0, -z - 0.4) * Math.max(0, y) * 0.25);
    ps.setX(i, x * (1 + Math.max(0, -y) * 0.12));
  }
  roughen(body, 0.07, 4);
  b.add(body, mat(0, 0.55, 0, 0, 0, 0, 0.8, 0.54, 1.18), furColor, 0, { smooth: true });
  // the coat's hem: two rings of locks, of uneven lengths, narrowing but blunt, darker
  // toward the ends, hanging to the ice
  for (let layer = 0; layer < 2; layer++) {
    const n = 34;
    const top = 0.5 - layer * 0.15, out = 1.0 + layer * 0.06;
    for (let i = 0; i < n; i++) {
      const a = ((i + layer * 0.5) / n) * TAU + Math.sin(i * 2.7) * 0.03;
      const da = (TAU / n) * 0.62;
      const len = top - 0.03 - (((i * 7 + layer * 3) % 5) * 0.022);
      const at = (t, y, r) => [Math.sin(a + t) * 0.8 * r, y, Math.cos(a + t) * 1.18 * r];
      const mid = top - len * 0.55, end = top - len;
      const c0 = (i + layer) % 4 === 0 ? FUR2 : FUR, c1 = (i + layer) % 3 === 0 ? FUR3 : FUR2;
      const rm = out + 0.04, re = out + 0.07;
      b.quad(at(-da, top, out), at(da, top, out), at(da * 0.6, mid, rm), at(-da * 0.6, mid, rm), c0);
      b.quad(at(-da * 0.6, mid, rm), at(da * 0.6, mid, rm), at(da * 0.25, end, re), at(-da * 0.25, end, re), c1);
    }
  }
  // across the back: a blanket, two green bedrolls, the Vagrant's spare hat
  const blanket = new THREE.CylinderGeometry(0.62, 0.62, 1.08, 14, 1, true, -1.0, 2.0);
  b.add(blanket, mat(0, 0.52, -0.08, Math.PI / 2, 0, 0, 1, 1, 1), (x, y, z) => (Math.abs(Math.round(y * 5) % 2) ? BLANKET : BLANKET2), 0, { smooth: true });
  for (const s of [-1, 1]) {
    b.cyl(0.13, 0.13, 0.62, 10, mat(s * 0.33, 1.12, -0.1, Math.PI / 2, 0, 0), ROLLG);
    for (const z of [-0.18, 0.12]) b.cyl(0.135, 0.135, 0.04, 10, mat(s * 0.33, 1.12, z - 0.1, Math.PI / 2, 0, 0), ROLLG2);
  }
  b.cyl(0.34, 0.34, 0.03, 16, mat(0.02, 1.27, -0.4, 0.18, 0, 0.1), WOOD);
  b.cyl(0.17, 0.19, 0.15, 12, mat(0.02, 1.35, -0.41, 0.18, 0, 0.1), WOOD);
  b.cyl(0.192, 0.192, 0.035, 12, mat(0.02, 1.31, -0.405, 0.18, 0, 0.1), WOOD2);
  // a red chest on one flank, a blue lantern box on the other
  b.box(0.22, 0.3, 0.42, mat(0.82, 0.66, 0.0, 0, 0, -0.12), CHEST);
  b.box(0.235, 0.05, 0.43, mat(0.84, 0.82, 0.0, 0, 0, -0.12), CHEST2);
  b.box(0.04, 0.07, 0.07, mat(0.94, 0.7, 0.0, 0, 0, -0.12), WOOD2);
  b.box(0.2, 0.26, 0.22, mat(-0.82, 0.7, 0.2, 0, 0, 0.12), BLANKET);
  b.box(0.21, 0.16, 0.12, mat(-0.83, 0.7, 0.2, 0, 0, 0.12), LAMP, 1.2);
  b.box(0.06, 0.06, 0.06, mat(-0.81, 0.85, 0.2, 0, 0, 0.12), WOOD2);
  // a second blanket over the haunches, its end falling to the ice behind
  b.box(0.56, 0.035, 0.42, mat(0.06, 0.62, -1.02, 0.85, 0.08, 0), BLANKET2);
  b.box(0.54, 0.03, 0.3, mat(0.06, 0.3, -1.24, 1.25, 0.08, 0), BLANKET2);
  b.box(0.55, 0.035, 0.06, mat(0.06, 0.12, -1.33, 1.25, 0.08, 0), FUR4);
  return b.build();
}

// The head, low and shaggy, the eyes nearly hidden, and its curled horns.
function yakHead() {
  const b = new Builder();
  const head = new THREE.SphereGeometry(0.34, 14, 10);
  roughen(head, 0.05, 9);
  b.add(head, mat(0, 0, 0.05, 0, 0, 0, 1, 0.92, 1.12), (x, y) => (y > -0.12 ? FUR : FUR2), 0, { smooth: true });
  // the fringe over the eyes, and the eyes under it
  for (let i = 0; i < 7; i++) {
    const x = -0.21 + i * 0.07;
    b.box(0.08, 0.2 + (i % 3) * 0.03, 0.05, mat(x, 0.06, 0.38, -0.25, 0, (i - 3) * 0.06), i % 2 ? FUR : FUR2);
  }
  for (const s of [-1, 1]) b.box(0.05, 0.03, 0.03, mat(s * 0.12, -0.02, 0.37), FACE);
  // the muzzle, dark, with its nostrils
  b.sphere(0.13, 10, 8, mat(0, -0.16, 0.33, 0, 0, 0, 1.15, 0.8, 0.9), MUZZLE);
  for (const s of [-1, 1]) b.box(0.03, 0.025, 0.02, mat(s * 0.05, -0.15, 0.44), FACE);
  // horns: big and dark, out from the crown, up, back and round past the ears, ringed
  for (const s of [-1, 1]) {
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12;
      const a = -0.6 + t * 4.6;
      const r = 0.24 * (1 - t * 0.45);
      pts.push(new THREE.Vector3(s * (0.26 + t * 0.2), 0.12 + Math.sin(a) * r, -0.02 - Math.cos(a) * r + 0.05));
    }
    for (let k = 0; k < pts.length - 1; k++) {
      const p0 = pts[k], p1 = pts[k + 1];
      const d = new THREE.Vector3().subVectors(p1, p0);
      const L = d.length();
      const g = new THREE.CylinderGeometry(0.075 * (1 - (k + 1) / 14), 0.075 * (1 - k / 14), L * 1.12, 7);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      const m = new THREE.Matrix4().compose(p0.clone().lerp(p1, 0.5), q, new THREE.Vector3(1, 1, 1));
      b.add(g, m, k % 3 === 2 ? HORN3 : k > 8 ? HORN2 : HORN, 0, { smooth: true });
    }
  }
  // ears, sticking out of the fur
  for (const s of [-1, 1]) b.box(0.14, 0.05, 0.08, mat(s * 0.34, 0.02, 0.0, 0, 0, s * -0.4), FUR2);
  return b.build();
}

function yakTail() {
  const b = new Builder();
  const g = new THREE.SphereGeometry(0.16, 8, 6);
  roughen(g, 0.04, 2);
  b.add(g, mat(0, -0.08, -0.08, 0, 0, 0, 0.8, 1.4, 0.8), FUR2, 0, { smooth: true });
  return b.build();
}

export class Yak {
  constructor(scene) {
    const m = worldMaterial({ unique: true, smooth: true, side: THREE.DoubleSide });
    this.material = m;
    this.root = new THREE.Group();
    this.root.scale.setScalar(YAK_SCALE);
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(meshOf(yakBody(), m));
    this.head = new THREE.Group();
    this.head.position.set(0, 0.52, 1.24);
    this.root.add(this.head);
    this.head.add(meshOf(yakHead(), m));
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.72, -1.2);
    this.root.add(this.tail);
    this.tail.add(meshOf(yakTail(), m));
    this.facing = 0;
    this.lookAt = null;
    this.moo = 0;           // 1..0 while it moos
    this.shake = 0;         // 1..0 after it is petted
    this._turn = 0;
    this.lamp = { pos: new THREE.Vector3(), color: new THREE.Color(LAMP), range: 4.5, intensity: 0, on: true };
    scene.add(this.root);
  }

  place(x, y, z, facing) {
    this.root.position.set(x, y, z);
    this.facing = facing;
    this.root.rotation.y = facing;
  }

  // The yak is long: the nearest point of its back to (x, z), for touching and blocking.
  nearest(x, z) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    const dx = x - this.root.position.x, dz = z - this.root.position.z;
    const along = clamp(dx * s + dz * c, -0.9 * YAK_SCALE, 1.3 * YAK_SCALE);
    return { x: this.root.position.x + s * along, z: this.root.position.z + c * along };
  }
  distanceTo(x, z) {
    const p = this.nearest(x, z);
    return Math.hypot(x - p.x, z - p.z);
  }

  update(dt, time, night) {
    const tq = step12(time);
    // a slow breath, one every four beats
    const br = Math.sin((tq / (BEAT * 4)) * TAU);
    this.body.scale.set(1 + br * 0.008, 1 + br * 0.018, 1);
    // the head turns to whoever is near, and lifts to moo
    let turn = 0;
    if (this.lookAt) {
      const a = Math.atan2(this.lookAt.x - this.head.getWorldPosition(_v).x, this.lookAt.z - _v.z) - this.facing;
      turn = clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.7, 0.7);
    }
    this._turn = damp(this._turn, turn, 3, dt);
    this.head.rotation.y = Math.round(this._turn * 10) / 10;
    this.moo = Math.max(0, this.moo - dt * 0.6);
    const lift = Math.sin(Math.min(1, this.moo * 1.4) * Math.PI) * 0.35;
    this.head.rotation.x = -lift + Math.sin(tq * 0.9) * 0.03;
    this.head.position.y = 0.52 + lift * 0.12;
    // a petting: it shakes, in steps
    this.shake = Math.max(0, this.shake - dt * 1.2);
    this.body.rotation.z = this.shake > 0 ? (Math.floor(time * 10) % 2 ? 0.035 : -0.035) * this.shake : 0;
    // the tail flicks now and then
    this.tail.rotation.x = Math.floor(time * 12) % 50 < 3 ? 0.5 : 0.1;
    this.lamp.pos.set(this.root.position.x + Math.cos(this.facing) * -0.9, this.root.position.y + 0.7, this.root.position.z - Math.sin(this.facing) * -0.9);
    this.lamp.intensity = 0.2 + night * 0.8;
  }
}

const _v = new THREE.Vector3();
