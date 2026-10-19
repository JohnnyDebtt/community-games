import * as THREE from 'three';
import { TAU, clamp, damp } from '../core/math.js';
import { P } from '../core/palette.js';
import { worldMaterial, glowMaterial } from '../render/materials.js';
import { Builder, mat } from '../render/build.js';
import { addOutline } from '../render/outline.js';
import { CAPSULE } from './layout.js';

// The capsule, as in The Seeker: a round pod on a tall stilt, its upper half glass that
// is frosted white from outside. You leap up into the lift under it, the lift carries you
// up the stilt, and the frost clears to show you inside, among warm lamps and a screen,
// a ladder up to the hatch and red machinery under the dome.

const R = 1.7;                      // the pod's radius
const H = 6.6;                      // its center above the ground
const FLOOR = -0.32;                // the floor inside, from the center (where the glass meets the hull)
const POD_H = 1.9, POD_R = 0.52;    // the lift

export class Capsule {
  constructor(scene) {
    const cx = CAPSULE.x, cz = CAPSULE.z, gy = CAPSULE.y;
    const c = gy + H;
    this.center = new THREE.Vector3(cx, c, cz);
    this.window = new THREE.Vector3(cx, c + 0.2, cz - 2.2);
    this.base = new THREE.Vector3(cx, gy, cz - 0.55);
    this.inside = new THREE.Vector3(cx + 0.15, c + FLOOR + 0.06, cz - 0.35);
    this.insideFacing = Math.PI;           // toward the sea
    this.liftTop = c - R - 0.55 - POD_H;   // the lift's bottom, docked
    this.liftBottom = gy + 0.95;
    this.lift = this.liftTop;
    this.frost = 1;
    this._target = 1;

    const shell = new Builder();
    // the hull: the lower bowl in pale metal, with panel lines and a darker band
    shell.sphere(R * 0.995, 20, 10, mat(cx, c, cz), (x, y) => (y < -1.25 ? P.stone4 : y < -0.9 ? 0x8e9ca4 : 0xa9b7bc), 0, 0, TAU, Math.PI * 0.56, Math.PI * 0.44);
    shell.add(new THREE.TorusGeometry(R * 0.985, 0.045, 4, 32), mat(cx, c + FLOOR, cz, Math.PI / 2), P.stone3);
    shell.add(new THREE.TorusGeometry(R * 0.86, 0.035, 4, 30), mat(cx, c - 0.95, cz, Math.PI / 2), P.stone3);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      shell.box(0.03, 0.62, 0.03, mat(cx + Math.cos(a) * R * 0.9, c - 0.68, cz + Math.sin(a) * R * 0.9, 0, -a, 0.42 * Math.sign(Math.cos(a)) * 0), P.stone3);
    }
    // the glass frame: a ring at the floor, a crown, and meridians
    shell.add(new THREE.TorusGeometry(0.62, 0.05, 4, 20), mat(cx, c + R * 0.93, cz, Math.PI / 2), 0x8fa3a8);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.TorusGeometry(R * 1.002, 0.028, 3, 24, Math.PI * 0.56);
      shell.add(g, mat(cx, c, cz, 0, (i / 4) * TAU + 0.4, -0.19), 0x8fa3a8);
    }
    // the cap on top, with two amber lamps and a mast
    shell.cyl(0.55, 0.62, 0.18, 14, mat(cx, c + R - 0.02, cz), 0xc8d3d6);
    shell.cyl(0.32, 0.42, 0.12, 12, mat(cx, c + R + 0.13, cz), 0xa9b7bc);
    shell.box(0.12, 0.08, 0.12, mat(cx - 0.18, c + R + 0.22, cz - 0.1), 0xd08a3c, 0.9);
    shell.box(0.12, 0.08, 0.12, mat(cx + 0.18, c + R + 0.22, cz - 0.1), 0xd08a3c, 0.9);
    shell.cyl(0.015, 0.015, 0.7, 3, mat(cx + 0.22, c + R + 0.5, cz + 0.15), P.ink);
    // underneath: the mechanism the lift docks into
    shell.cyl(0.95, 0.62, 0.35, 12, mat(cx, c - R + 0.02, cz), P.stone2);
    shell.cyl(0.6, 0.42, 0.3, 10, mat(cx, c - R - 0.28, cz), P.stone1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      shell.box(0.16, 0.28, 0.5, mat(cx + Math.cos(a) * 0.62, c - R - 0.1, cz + Math.sin(a) * 0.62, 0.5, -a + Math.PI / 2, 0), P.stone2);
    }
    // the stilt, its flange, its foot
    const top = c - R - 0.45;
    shell.cyl(0.11, 0.13, top - gy, 6, mat(cx, gy + (top - gy) / 2, cz), 0x2f343b);
    shell.cyl(0.125, 0.125, 0.4, 6, mat(cx, gy + (top - gy) * 0.18, cz), 0x4f5d73);
    const fl = gy + (top - gy) * 0.62;
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      shell.box(0.5, 0.12, 0.16, mat(cx + s * 0.28, fl, cz, 0, 0, s * 0.45), 0x3f4d5b);
      shell.box(0.2, 0.22, 0.18, mat(cx + s * 0.5, fl - 0.12, cz, 0, 0, 0), 0x353e50);
    }
    shell.cyl(0.2, 0.2, 0.25, 8, mat(cx, fl, cz), 0x353e50);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      shell.box(0.07, 0.07, 1.3, mat(cx + Math.cos(a) * 0.6, gy + 0.32, cz + Math.sin(a) * 0.6, 0.45, -a + Math.PI / 2, 0), P.stone2);
      shell.box(0.32, 0.06, 0.32, mat(cx + Math.cos(a) * 1.05, gy + 0.03, cz + Math.sin(a) * 1.05, 0, -a, 0), P.ink);
    }
    shell.cyl(0.32, 0.4, 0.14, 8, mat(cx, gy + 0.07, cz), 0x2a2f36);
    this.shell = new THREE.Mesh(shell.build(), worldMaterial());
    addOutline(this.shell, { width: 1 });
    scene.add(this.shell);

    // inside: seen only when the frost clears
    const inn = new Builder();
    const fy = c + FLOOR;
    inn.cyl(R * 0.94, R * 0.94, 0.06, 20, mat(cx, fy - 0.03, cz), 0xb8c3c7);
    inn.cyl(R * 0.7, R * 0.7, 0.065, 16, mat(cx, fy - 0.025, cz), 0xcfd8da);
    // the back wall, curved, dark
    inn.add(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 1.5, 16, 1, true, -1.65, 3.3), mat(cx, fy + 0.75, cz), 0x1a1f29);
    // the ladder up to the hatch, at the back
    for (const s of [-1, 1]) inn.box(0.04, 1.9, 0.04, mat(cx + s * 0.2, fy + 0.95, cz + R * 0.82), 0x4f5d73);
    for (let k = 0; k < 7; k++) inn.box(0.4, 0.03, 0.03, mat(cx, fy + 0.15 + k * 0.24, cz + R * 0.82), 0x667389);
    // warm lamps on the left, in a grid
    for (let r = 0; r < 3; r++) {
      for (let q = 0; q < 2; q++) {
        const a = Math.PI * 0.26 + q * 0.26;
        const x = cx + Math.cos(a) * R * 0.86, z = cz + Math.sin(a) * R * 0.86;
        inn.box(0.26, 0.2, 0.04, mat(x, fy + 0.45 + r * 0.26, z, 0, -a + Math.PI / 2, 0), (r + q) % 2 ? 0xf2c14e : 0xe39b3a, 1.0);
      }
    }
    inn.box(0.08, 0.7, 0.3, mat(cx + R * 0.55, fy + 0.35, cz + 0.6, 0, -0.7, 0), 0x3a2b24);
    // the screen on the right, in its teal frame
    {
      const a = Math.PI * 0.7;
      const x = cx + Math.cos(a) * R * 0.84, z = cz + Math.sin(a) * R * 0.84;
      const ry = -a + Math.PI / 2;
      inn.box(0.62, 0.7, 0.05, mat(x, fy + 0.8, z, 0, ry, 0), 0x3f8f86, 0.35);
      inn.box(0.5, 0.58, 0.06, mat(x, fy + 0.8, z, 0, ry, 0), 0x0b1418, 0.2);
      inn.box(0.28, 0.4, 0.07, mat(x, fy + 0.8, z, 0, ry, 0), 0xe8fbf6, 1.0);
      inn.box(0.12, 0.28, 0.075, mat(x + Math.cos(ry) * 0.03, fy + 0.8, z - Math.sin(ry) * 0.03, 0, ry, 0), 0x0b1418, 0.2);
      inn.box(0.7, 0.36, 0.3, mat(cx + Math.cos(a) * R * 0.7, fy + 0.18, cz + Math.sin(a) * R * 0.7, 0, ry, 0), 0x2b3440);
    }
    // red machinery under the dome
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU;
      inn.box(0.36, 0.24, 0.22, mat(cx + Math.cos(a) * 0.95, c + 1.05, cz + Math.sin(a) * 0.95, 0, -a, 0), i % 3 ? 0x5b2c35 : 0x7a3542);
      if (i % 2 === 0) inn.box(0.08, 0.05, 0.03, mat(cx + Math.cos(a) * 1.07, c + 1.0, cz + Math.sin(a) * 1.07, 0, -a, 0), 0xe07a8a, 1.0);
    }
    inn.cyl(0.62, 0.7, 0.3, 12, mat(cx, c + 1.32, cz), 0x3a2028);
    this.interior = new THREE.Mesh(inn.build(), worldMaterial({ side: THREE.DoubleSide }));
    this.interior.visible = false;
    scene.add(this.interior);

    // the glass, frosted from outside
    const gg = new THREE.SphereGeometry(R, 22, 12, 0, TAU, 0, Math.PI * 0.56);
    const col = new Float32Array(gg.attributes.position.count * 3).fill(1);
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    gg.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(gg.attributes.position.count), 1));
    this.glassMat = worldMaterial({ unique: true, transparent: true, opacity: 1, tint: 0xeef4f5 });
    this.glass = new THREE.Mesh(gg, this.glassMat);
    this.glass.position.copy(this.center);
    this.glass.renderOrder = 3;
    scene.add(this.glass);

    // the lift: a dark pod that rides the stilt
    const pod = new Builder();
    pod.add(new THREE.CapsuleGeometry(POD_R, POD_H - POD_R * 2, 4, 10), mat(0, POD_H / 2, 0), 0x2d2e33);
    pod.box(POD_R * 1.25, POD_H * 0.42, 0.06, mat(0, POD_H * 0.42, -POD_R * 0.93), 0x101216);
    pod.add(new THREE.TorusGeometry(POD_R * 1.01, 0.03, 3, 16), mat(0, POD_H * 0.78, 0, Math.PI / 2), 0x4f5d73);
    pod.add(new THREE.TorusGeometry(POD_R * 1.01, 0.03, 3, 16), mat(0, POD_H * 0.2, 0, Math.PI / 2), 0x4f5d73);
    pod.box(0.07, 0.07, 0.04, mat(POD_R * 0.5, POD_H * 0.86, -POD_R * 0.86), 0xd6edf5, 1);
    this.pod = new THREE.Mesh(pod.build(), worldMaterial());
    addOutline(this.pod, { width: 1 });
    this.pod.position.set(cx, this.liftTop, cz);
    scene.add(this.pod);
    this._podLight = 0;
  }

  setFrost(k) {
    this.frost = clamp(k, 0, 1);
  }

  // The lift comes down to meet you.
  callLift(dt) {
    this.lift = Math.max(this.liftBottom, this.lift - dt * 9);
  }
  liftDown() {
    return this.lift <= this.liftBottom + 0.01;
  }
  rideUp(dt) {
    const v = 2 + (this.liftTop - this.lift) * 2.4;
    this.lift = Math.min(this.liftTop, this.lift + dt * v);
    return this.lift >= this.liftTop - 0.01;
  }
  rideDown(dt) {
    this.lift = Math.max(this.liftBottom, this.lift - dt * 10);
    return this.lift <= this.liftBottom + 0.01;
  }
  park() {
    this._park = true;
  }

  puff(particles) {
    const c = this.center;
    for (let i = 0; i < 4; i++) particles.emit(c.x + (Math.random() - 0.5), c.y - R - 0.3, c.z + (Math.random() - 0.5), 4, { color: 0xedf0f1, speed: 1, up: -0.6, life: 0.9 });
  }

  update(dt, frame, night) {
    if (this._park) {
      this.lift = Math.min(this.liftTop, this.lift + dt * 3);
      if (this.lift >= this.liftTop) this._park = false;
    }
    this.pod.position.y = this.lift;
    // stepped like the art: the frost clears in a few hard steps
    const f = Math.round(this.frost * 6) / 6;
    this.glassMat.uniforms.uOpacity.value = 0.1 + f * 0.9;
    this.glassMat.uniforms.uTint.value.setRGB(0.93 + 0.05 * (1 - f), 0.96, 0.96 + 0.03 * (1 - f));
    this.interior.visible = this.frost < 0.995;
    void night;
    void damp;
  }
}
