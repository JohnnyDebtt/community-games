import * as THREE from 'three';
import { pose, walkPose, mixPose } from './seeker.js';
import { CUP_REST } from './interior.js';
import { pointsMaterial } from '../render/materials.js';
import { LAYER_FX, POST } from '../render/pipeline.js';
import { clamp, smoothstep, lerp, TAU } from '../core/math.js';
import { BEAT } from '../core/audio.js';

// Making coffee, as a short scene seen from outside oneself: walk to the machine, press
// its one button, watch the water warm and the coffee drip through, lift the carafe by
// its handle and pour a cup, set the carafe back on the plate, and take the cup in both
// hands to the window to drink while the fog goes by. Hard cuts between still shots,
// bars above and below, the drips on the beat. Any key skips to the window.
//
// The things in the hands lead: the carafe and the cup follow their own paths (the cup
// upright until it meets the mouth), and the arms reach for them (two-bone IK), so
// nothing is ever held upside down. Every moment of it is a function of the scene's
// clock, so skipping lands everything where it belongs.

const STAND = new THREE.Vector3(1.68, 0, 0.84);     // at the machine
const WINDOW = new THREE.Vector3(1.86, 0, 2.45);    // at the window
const FACE_X = Math.PI / 2;                          // facing the machine and the window (+x)
const FACE_POUR = FACE_X - 0.35;                     // turned a little toward the cup

// machine space: +x into the wall, y up from the counter
const PLATE = new THREE.Vector3(-0.2, 0.078, 0);     // the carafe at rest
const BUTTON = new THREE.Vector3(-0.268, 0.034, 0.14);
const CUP_YAW = 2.4;                                 // its handle toward the one at the machine
// carafe space
const HANDLE = new THREE.Vector3(-0.15, 0.13, 0);
const SPOUT = new THREE.Vector3(0.135, 0.228, 0);
// cup space
const GRIP_R = new THREE.Vector3(0.08, 0.05, 0);     // at the handle
const GRIP_L = new THREE.Vector3(-0.078, 0.045, 0.012);
const CUP_TOP = 0.09;
// seeker space (+z ahead, +x to its left)
const CARRY = new THREE.Vector3(-0.1, 1.08, 0.3);
const HOLD = new THREE.Vector3(0.0, 1.13, 0.27);
// head space: just under the visor
const MOUTH = new THREE.Vector3(0, -0.08, 0.16);

export const COFFEE_LENGTH = 16.4;
const SKIP_TO = 11.0;

const SHOTS = [
  { t: 0, from: [-1.2, 1.75, -1.7], to: [1.9, 1.05, 0.9], fov: 52 },       // down the cabin
  { t: 1.8, from: [1.42, 1.42, 1.72], to: [2.15, 1.0, 0.92], fov: 46 },    // the button
  { t: 2.9, from: [1.0, 1.62, 2.05], to: [2.3, 1.2, 0.78], fov: 50 },      // the brew
  { t: 6.6, from: [2.2, 1.42, 2.55], to: [1.92, 1.05, 1.05], fov: 48 },    // the pour, three quarters
  { t: 9.6, from: [0.05, 1.66, 2.05], to: [3.6, 1.45, 2.75], fov: 56 },    // to the window
  { t: 11.2, from: [2.55, 1.5, 1.5], to: [1.9, 1.36, 2.45], fov: 46 },     // the sip
  { t: 13.2, from: [1.15, 1.62, 2.95], to: [3.4, 1.32, 2.15], fov: 55 },   // the fog going by
];

// steam: a few motes rising and fading in a loop
function steamPoints(n = 14) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  const p = new THREE.Points(g, pointsMaterial({ color: 0xcfdde4, size: 0.05, additive: true, opacity: 0.5 }));
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  p.visible = false;
  return p;
}
function stepSteam(p, t, strength) {
  const a = p.geometry.attributes.position, al = p.geometry.attributes.aAlpha;
  for (let i = 0; i < a.count; i++) {
    const ph = ((t * 0.45 + i / a.count) % 1);
    a.setXYZ(i, Math.sin(i * 2.3 + t * 1.3) * 0.02 * (1 + ph * 2), ph * 0.28, Math.cos(i * 1.7 + t) * 0.02 * (1 + ph * 2));
    al.setX(i, strength * Math.sin(ph * Math.PI) * 0.8);
  }
  a.needsUpdate = true;
  al.needsUpdate = true;
}

const k = (t, a, b) => smoothstep(a, b, t);
const angLerp = (a, b, w) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * w;

export class CoffeeScene {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.t = 0;
    const mach = game.interior.machine.userData;
    this.m = mach;
    this.steamCup = steamPoints();
    mach.cup.add(this.steamCup);
    this.steamCup.position.y = 0.09;
    this.steamCarafe = steamPoints(10);
    mach.carafe.add(this.steamCarafe);
    this.steamCarafe.position.y = 0.27;
    this.events = new Set();
    this.silentUntil = 0;
    // scratch
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._c = new THREE.Vector3();
    this._qa = new THREE.Quaternion(); this._qb = new THREE.Quaternion(); this._qm = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._mtx = new THREE.Matrix4();
    this._carafe = { p: new THREE.Vector3(), yaw: 0, tilt: 0 };
  }

  start(from) {
    const g = this.game;
    this.active = true;
    this.t = 0;
    this.silentUntil = 0;
    this.events.clear();
    this._step = -1;
    this.from = new THREE.Vector3(from.x, 0, from.z);
    g.seeker.root.visible = true;
    g.seeker.root.position.copy(this.from);
    this._reset();
  }

  // everything back where it lives
  _reset() {
    const g = this.game, m = this.m, mach = g.interior.machine;
    if (m.carafe.parent !== mach) mach.add(m.carafe);
    m.carafe.position.copy(PLATE);
    m.carafe.rotation.set(0, 0, 0);
    if (m.cup.parent !== mach) mach.add(m.cup);
    m.cup.position.copy(CUP_REST);
    m.cup.rotation.set(0, CUP_YAW, 0);
    m.coffeeM.scale.y = 0.001;
    m.cupFillM.visible = false;
    m.streamM.visible = false;
    m.streamM.rotation.set(0, 0, 0);
    this.steamCup.visible = false;
    this.steamCarafe.visible = false;
  }

  skip() {
    if (this.t < SKIP_TO) { this.silentUntil = SKIP_TO; this.t = SKIP_TO; }
  }

  // a moment that happens once; skipped past, it stays silent
  _once(name, at, fn) {
    if (this.t >= at && !this.events.has(name)) {
      this.events.add(name);
      if (at >= this.silentUntil) fn();
    }
  }

  // where the camera hears a point: left and right of the shot
  _pan(p) {
    const v = this._c.copy(p).applyMatrix4(this.game.cams.cam.matrixWorldInverse);
    return clamp(v.x / Math.max(0.3, -v.z), -1, 1) * 0.7;
  }

  // ---------------------------------------------------------------- the carafe's path
  // machine space: position, a turn about y, a tilt about its own z (spout down)
  _pourPose(tilt, out, lift = 0) {
    const yaw = FACE_POUR - FACE_X;
    this._e.set(0, yaw, tilt);
    const spout = this._a.copy(SPOUT).applyEuler(this._e);
    out.p.set(CUP_REST.x, CUP_TOP + 0.12 + lift, CUP_REST.z).sub(spout);
    out.yaw = yaw; out.tilt = tilt;
    return out;
  }

  _carafePose(t) {
    const c = this._carafe;
    const rest = { p: PLATE, yaw: 0, tilt: 0 };
    const lifted = { p: new THREE.Vector3(PLATE.x - 0.13, PLATE.y + 0.12, PLATE.z + 0.1), yaw: -0.15, tilt: 0 };
    const pour0 = this._pourPose(-0.72, { p: new THREE.Vector3() });
    const pour1 = this._pourPose(-1.05, { p: new THREE.Vector3() });
    const up = this._pourPose(0, { p: new THREE.Vector3() }, 0.04);
    const keys = [[7.0, rest], [7.35, lifted], [7.75, pour0], [8.35, pour1], [8.6, up], [9.0, rest]];
    if (t <= keys[0][0] || t >= keys[keys.length - 1][0]) { c.p.copy(PLATE); c.yaw = 0; c.tilt = 0; return c; }
    for (let i = 0; i < keys.length - 1; i++) {
      const [t0, A] = keys[i], [t1, B] = keys[i + 1];
      if (t >= t0 && t <= t1) {
        const w = smoothstep(t0, t1, t);
        c.p.lerpVectors(A.p, B.p, w);
        c.yaw = lerp(A.yaw, B.yaw, w);
        c.tilt = lerp(A.tilt, B.tilt, w);
        break;
      }
    }
    return c;
  }

  // ---------------------------------------------------------------- the cup's path
  // in the world: on the counter, carried, held in both hands, at the mouth
  _cupWorld(t, outP, outQ) {
    const g = this.game, s = g.seeker, mach = g.interior.machine;
    const root = s.root, head = s.head;
    const P = (v) => v.applyMatrix4(root.matrixWorld);
    const rootQ = root.getWorldQuaternion(this._qm);
    // on the counter
    const restP = new THREE.Vector3().copy(CUP_REST).applyMatrix4(mach.matrixWorld);
    const restQ = mach.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, CUP_YAW, 0)));
    // carried, handle to the right
    const yawR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const carryP = P(new THREE.Vector3().copy(CARRY));
    const holdP = P(new THREE.Vector3().copy(HOLD));
    const handQ = rootQ.clone().multiply(yawR);
    // at the mouth, tipped toward the face by `tip`
    const tip = t < 13.5 ? lerp(0.22, 0.62, k(t, 11.85, 12.4)) : lerp(0.26, 0.55, k(t, 14.7, 15.1));
    const lean = new THREE.Vector3(0, Math.cos(tip), -Math.sin(tip));
    const mouthLocal = new THREE.Vector3().copy(MOUTH).add(new THREE.Vector3(0, 0, 0.05)).addScaledVector(lean, -CUP_TOP);
    const mouthP = mouthLocal.applyMatrix4(head.matrixWorld);
    const mouthQ = head.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -tip)).multiply(yawR);

    // which, and how far between
    const toMouth = t < 13.5 ? k(t, 11.4, 11.85) * (1 - k(t, 12.45, 12.85)) : k(t, 14.3, 14.7) * (1 - k(t, 15.1, 15.5));
    if (t < 9.35) { outP.copy(restP); outQ.copy(restQ); return 0; }
    if (t < 11.0) {
      const w = k(t, 9.35, 9.7);
      outP.lerpVectors(restP, carryP, w);
      outQ.slerpQuaternions(restQ, handQ, w);
      return 0;
    }
    const w = k(t, 11.0, 11.4);
    outP.lerpVectors(carryP, holdP, w);
    outQ.copy(handQ);
    if (toMouth > 0) {
      outP.lerp(mouthP, toMouth);
      outQ.slerp(mouthQ, toMouth);
    }
    return toMouth * tip;
  }

  // ---------------------------------------------------------------- the scene
  // returns true while running
  update(dt) {
    if (!this.active) return false;
    const g = this.game, a = g.audio, f = a.foley, s = g.seeker, m = this.m;
    const mach = g.interior.machine;
    this.t += dt;
    const t = this.t;
    POST.uLetterbox.value = Math.min(1, POST.uLetterbox.value + dt * 2) * (t > COFFEE_LENGTH - 0.6 ? Math.max(0, (COFFEE_LENGTH - t) / 0.6) : 1);
    const q = Math.floor(t * 12) / 12;   // poses step at 12 fps
    let o = pose();
    const root = s.root;

    // where the Seeker stands and which way it faces
    let walking = -1;
    if (t < 1.8) {
      const w = smoothstep(0, 1.8, t);
      root.position.lerpVectors(this.from, STAND, w);
      const dx = STAND.x - this.from.x, dz = STAND.z - this.from.z;
      const far = Math.hypot(dx, dz) > 0.2;
      const travel = far ? Math.atan2(dx, dz) : FACE_X;
      root.rotation.y = angLerp(travel, FACE_X, k(t, 1.2, 1.8));
      if (far) { walkPose(o, q * 0.75); walking = q * 0.75; }
    } else if (t < 9.6) {
      root.position.copy(STAND);
      root.rotation.y = angLerp(FACE_X, FACE_POUR, k(t, 6.7, 7.3));
    } else if (t < 11.0) {
      const w = smoothstep(9.6, 11.0, t);
      root.position.lerpVectors(STAND, WINDOW, w);
      const travel = Math.atan2(WINDOW.x - STAND.x, WINDOW.z - STAND.z);
      root.rotation.y = angLerp(angLerp(FACE_POUR, travel, k(t, 9.6, 9.95)), FACE_X, k(t, 10.5, 11.0));
      walkPose(o, (q - 9.6) * 0.8);
      walking = (q - 9.6) * 0.8;
    } else {
      root.position.copy(WINDOW);
      root.rotation.y = FACE_X;
    }

    // the body around the hands
    if (t >= 1.8 && t < 2.9) o = mixPose(o, { ...pose(), chestRx: 0.24, hipRx: 0.04, headRx: 0.32, headRy: -0.05 }, k(q, 1.8, 2.1) * (1 - k(q, 2.5, 2.9)));
    if (t >= 2.5 && t < 6.7) {
      o = mixPose(o, { ...pose(), headRx: 0.3, headRy: -0.1, chestRx: 0.1 }, k(q, 2.5, 3.1));
      o.hipY = Math.sin(q * 2.4) * 0.006;
    }
    if (t >= 6.6 && t < 9.6) o = mixPose(o, { ...pose(), chestRx: 0.2, hipRx: 0.03, headRx: 0.42, headRy: -0.12, chestRy: -0.08 }, k(q, 6.6, 6.95) * (1 - k(q, 9.35, 9.6)));
    if (t >= 11.0) {
      o.hipY = Math.sin(q * 2.4) * 0.006;
      const sipping = t < 13.5 ? k(q, 11.5, 11.9) * (1 - k(q, 12.45, 12.85)) : k(q, 14.35, 14.7) * (1 - k(q, 15.1, 15.5));
      o.headRx = -0.04 - sipping * 0.16;
      o.chestRx = 0.06 - sipping * 0.04;
      if (t > 12.9 && t < 14.3) o.headRy = Math.sin((q - 12.9) * 1.1) * 0.22;
    }
    s.apply(o, dt);
    g.interior.group.updateMatrixWorld(true);

    // ---- the machine
    this._once('press', 2.2, () => f.press({ pan: this._pan(this._a.copy(BUTTON).applyMatrix4(mach.matrixWorld)) }));
    const machPan = this._pan(this._b.set(0, 0.5, 0).applyMatrix4(mach.matrixWorld));
    const ring = m.ring.material.uniforms.uPulse;
    ring.value = t < 2.25 ? 0.05 : t < 6.8 ? 0.6 + 0.4 * Math.cos(g.beat * TAU) : Math.max(0.05, 1 - (t - 6.8));
    this._once('heat', 2.6, () => f.heat({ secs: 3.2, run: 3.9, pan: machPan }));
    m.waterM.material.uniforms.uEmisBoost.value = 0.6 + smoothstep(2.8, 4.2, t) * 2.2 * (1 - smoothstep(6.0, 7.0, t));
    m.waterM.scale.y = 1 - smoothstep(4.0, 6.4, t) * 0.75;
    m.plateM.material.uniforms.uPulse.value = t > 2.3 ? 0.7 + 0.15 * Math.sin(t * 2) : 0.05;
    [3.75, 4.35, 4.95, 5.6, 6.15].forEach((at, i) => this._once('gurgle' + i, at, () => f.gurgle({ gain: 0.7 + Math.random() * 0.5, pan: machPan })));
    const brewing = t > 4.0 && t < 6.4;
    if (brewing) {
      m.streamM.visible = true;
      m.streamM.position.set(-0.2, 0.72, 0);
      m.streamM.scale.set(1, 0.72 - 0.078 - 0.02, 1);
      // a drop on most eighths
      const step = Math.floor(g.beat * 2);
      if (step !== this._drip) { this._drip = step; if (Math.random() < 0.75 && t >= this.silentUntil) f.drip({ pan: machPan, gain: 0.6 + Math.random() * 0.6 }); }
    }

    // ---- the carafe: lifted by its handle, tipped over the cup, set back
    const c = this._carafePose(t);
    m.carafe.position.copy(c.p);
    m.carafe.rotation.set(0, c.yaw, c.tilt);
    m.carafe.updateMatrixWorld(true);
    const poured = smoothstep(7.75, 8.4, t);
    m.coffeeM.scale.y = Math.max(0.001, smoothstep(4.0, 6.4, t) * 0.17 - poured * 0.06);
    this.steamCarafe.visible = t > 5 && t < 6.9;
    if (this.steamCarafe.visible) stepSteam(this.steamCarafe, t, 0.6);
    this._once('reach', 6.62, () => f.cloth({ pan: machPan }));
    this._once('lift', 7.0, () => f.lift({ pan: machPan }));
    this._once('pour', 7.66, () => f.pour({ secs: 0.72, pan: machPan }));
    this._once('set', 9.0, () => f.set({ pan: machPan }));

    // ---- the cup
    const cupP = new THREE.Vector3(), cupQ = new THREE.Quaternion();
    const tip = this._cupWorld(t, cupP, cupQ);
    mach.worldToLocal(m.cup.position.copy(cupP));
    m.cup.quaternion.copy(mach.getWorldQuaternion(this._qb).invert().multiply(cupQ));
    m.cup.updateMatrixWorld(true);
    m.cupFillM.visible = t > 7.72;
    m.cupFillM.position.y = 0.01 + poured * 0.065;
    this.steamCup.visible = t > 8.2 && tip < 0.15;
    if (this.steamCup.visible) stepSteam(this.steamCup, t, t > 14 ? 0.45 : 0.8);
    this._once('cupup', 9.36, () => f.cup({ pan: machPan }));

    // the pour itself: coffee falling from the spout into the cup
    if (t > 7.62 && t < 8.42 && c.tilt < -0.62) {
      const spout = this._b.copy(SPOUT);
      m.carafe.localToWorld(spout);
      mach.worldToLocal(spout);
      const level = CUP_REST.y + 0.01 + poured * 0.065;
      m.streamM.visible = true;
      m.streamM.position.copy(spout);
      m.streamM.scale.set(1, Math.max(0.01, spout.y - level), 1);
    } else if (!brewing) m.streamM.visible = false;

    // ---- the hands go to what they hold
    const R = s.armR, L = s.armL;
    // the button, pressed in and let go
    const press = k(t, 1.8, 2.15) * (1 - k(t, 2.5, 2.9));
    if (press > 0) {
      const target = this._b.copy(BUTTON);
      target.x += 0.014 * k(t, 2.12, 2.2) * (1 - k(t, 2.3, 2.4));
      s.reach(R, target.applyMatrix4(mach.matrixWorld), press);
    }
    // the carafe's handle, then the cup's
    const holdCarafe = k(t, 6.6, 6.98) * (t < 9.05 ? 1 : 0);
    if (t >= 6.6 && t < 9.05) s.reach(R, this._b.copy(HANDLE).applyMatrix4(m.carafe.matrixWorld), holdCarafe);
    if (t >= 9.05) {
      const handle = this._b.copy(HANDLE).applyMatrix4(m.carafe.matrixWorld);
      const grip = this._c.copy(GRIP_R).applyMatrix4(m.cup.matrixWorld);
      s.reach(R, handle.lerp(grip, k(t, 9.05, 9.34)), 1, t > 11 ? new THREE.Vector3(-0.5, -1, 0.05) : null);
    }
    this._once('reach2', 9.08, () => f.cloth({ gain: 0.7, pan: machPan }));
    // the left hand joins at the window: the cup is warm
    if (t >= 10.9) {
      const grip = this._b.copy(GRIP_L).applyMatrix4(m.cup.matrixWorld);
      s.reach(L, grip, k(t, 10.95, 11.35), new THREE.Vector3(0.5, -1, 0.05));
    }
    this._once('reach3', 10.98, () => f.cloth({ gain: 0.6 }));

    // feet
    if (walking >= 0) {
      const st = Math.floor(walking * 2);
      if (st !== this._step) { this._step = st; if (t >= this.silentUntil) f.step({ gain: 0.9 }); }
    }

    // ---- at the window
    this._once('warm', 11.0, () => a.play('warm'));
    this._once('sip', 11.86, () => f.sip());
    this._once('drink', 12.0, () => g.drink());
    this._once('swallow', 12.52, () => f.swallow());
    this._once('exhale', 12.95, () => f.exhale());
    this._once('sip2', 14.72, () => f.sip({ gain: 0.8 }));
    this._once('swallow2', 15.3, () => f.swallow());
    this._once('exhale2', 15.7, () => f.exhale({ gain: 0.7 }));

    // the shot
    let shot = SHOTS[0];
    for (const sh of SHOTS) if (t >= sh.t) shot = sh;
    g.cams.shipShot(g.ship, new THREE.Vector3(...shot.from), new THREE.Vector3(...shot.to), shot.fov);
    POST.uFade.value = t < 0.35 ? 1 - t / 0.35 : t > COFFEE_LENGTH - 0.8 ? clamp((t - (COFFEE_LENGTH - 0.8)) / 0.8, 0, 1) : 0;

    if (t >= COFFEE_LENGTH) {
      this.finish();
      return false;
    }
    return true;
  }

  finish() {
    const g = this.game;
    this.active = false;
    g.seeker.root.visible = false;
    this._reset();
    POST.uLetterbox.value = 0;
    POST.uFade.value = 0;
    if (!this.events.has('drink')) g.drink();
    g.endCoffee(WINDOW, FACE_X);
  }
}

export { BEAT };
