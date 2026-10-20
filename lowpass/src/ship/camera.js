import * as THREE from 'three';
import { damp, lerp, hash1 } from '../core/math.js';

// The cameras: a chase camera that trails the ship and leans into its turns, a few
// cinematic angles that take over when nobody touches anything for a while, the eyes of
// whoever walks inside the ship, and a director for the coffee scene.

const MODES = ['chase', 'far', 'low', 'cinematic'];

export class Cameras {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(56, aspect, 0.3, 2600);
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 80, -40);
    this.target = new THREE.Vector3();
    this.roll = 0;
    this.shot = 0;
    this.shotT = 0;
    this.auto = false;          // the cinematic director took over (idle)
    this.blend = 1;
    this._cut = true;           // the first frame snaps into place
    this._tmp = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  setAspect(a) {
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }

  cycle() {
    const i = MODES.indexOf(this.mode);
    this.mode = MODES[(i + 1) % MODES.length];
    this.shotT = 0;
    return this.mode;
  }

  // Outside: positions in render space. ship: the Ship; dt seconds.
  exterior(ship, dt) {
    const cam = this.cam;
    const p = ship.root.position;
    const h = ship.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = Math.cos(h), rz = -Math.sin(h);
    const mode = this.auto ? 'cinematic' : this.mode;
    let want, look, lag = 3.2, roll = ship.bank * 0.35, fov = 56;
    if (mode === 'chase') {
      const side = -ship.yawRate * 9;
      want = this._tmp.set(p.x - fx * 34 + rx * side, p.y + 10, p.z - fz * 34 + rz * side);
      look = new THREE.Vector3(p.x + fx * 70, p.y + 1, p.z + fz * 70);
    } else if (mode === 'far') {
      want = this._tmp.set(p.x - fx * 62 - rx * 18, p.y + 22, p.z - fz * 62 - rz * 18);
      look = new THREE.Vector3(p.x + fx * 40, p.y - 6, p.z + fz * 40);
      lag = 2.2;
      fov = 50;
    } else if (mode === 'low') {
      want = this._tmp.set(p.x - fx * 20 + rx * 14, p.y - 5, p.z - fz * 20 + rz * 14);
      look = new THREE.Vector3(p.x + fx * 8, p.y + 1.5, p.z + fz * 8);
      lag = 4;
      roll = ship.bank * 0.6;
      fov = 60;
    } else {
      // cinematic: slow shots that change every 12 seconds
      this.shotT += dt;
      if (this.shotT > 12 || this._shotPos === undefined) {
        this.shotT = 0;
        this.shot++;
        const r = hash1(this.shot * 7 + 3);
        const kind = this.shot % 4;
        // a fixed point ahead of the ship that it flies past
        if (kind === 0) this._shotPos = { ahead: 140, side: 30 + r * 40, up: -4 + r * 10, fixed: true };
        else if (kind === 1) this._shotPos = { ahead: -50, side: -10 - r * 20, up: 26 + r * 20, fixed: false };
        else if (kind === 2) this._shotPos = { ahead: 26, side: 22, up: 2, fixed: false, front: true };
        else this._shotPos = { ahead: 220, side: -60 - r * 40, up: 40 + r * 30, fixed: true };
        if (this._shotPos.fixed) {
          const s = this._shotPos;
          this._fixed = new THREE.Vector3(p.x + fx * s.ahead + rx * s.side, p.y + s.up, p.z + fz * s.ahead + rz * s.side);
          this.pos.copy(this._fixed);
        } else {
          this._fixed = null;
        }
        this._cut = true;
      }
      const s = this._shotPos;
      if (this._fixed) {
        // the world drifts by the origin: keep the fixed point in place
        want = this._tmp.copy(this._fixed);
        look = p.clone();
        lag = 30;
      } else {
        want = this._tmp.set(p.x + fx * s.ahead + rx * s.side, p.y + s.up, p.z + fz * s.ahead + rz * s.side);
        look = s.front ? new THREE.Vector3(p.x - fx * 10, p.y, p.z - fz * 10) : new THREE.Vector3(p.x + fx * 40, p.y - 5, p.z + fz * 40);
        lag = 2;
      }
      fov = 46;
      roll = 0;
    }
    if (this._cut) {
      this.pos.copy(want);
      this.target.copy(look);
      this._cut = false;
    }
    this.pos.x = damp(this.pos.x, want.x, lag, dt);
    this.pos.y = damp(this.pos.y, want.y, lag, dt);
    this.pos.z = damp(this.pos.z, want.z, lag, dt);
    this.target.lerp(look, 1 - Math.exp(-lag * 1.6 * dt));
    this.roll = damp(this.roll, roll, 3, dt);
    cam.position.copy(this.pos);
    cam.up.set(-Math.cos(h) * Math.sin(this.roll), Math.cos(this.roll), Math.sin(h) * Math.sin(this.roll));
    cam.lookAt(this.target);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = damp(cam.fov, fov, 2, dt);
      cam.updateProjectionMatrix();
    }
    if (cam.near !== 0.5) { cam.near = 0.5; cam.updateProjectionMatrix(); }
  }

  // Keep fixed cinematic points in place when the world shifts its origin.
  shift(dx, dz) {
    this.pos.x -= dx;
    this.pos.z -= dz;
    this.target.x -= dx;
    this.target.z -= dz;
    if (this._fixed) { this._fixed.x -= dx; this._fixed.z -= dz; }
  }

  // Inside: a local eye (ship space) and a yaw/pitch, carried by the ship.
  // yaw 0 faces the ship's nose (+z); a camera looks down its own -z, hence the half turn
  firstPerson(ship, eye, yaw, pitch, fov = 70) {
    const cam = this.cam;
    this._e.set(pitch, yaw + Math.PI, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this._m.compose(eye, this._q, new THREE.Vector3(1, 1, 1));
    this._m.premultiply(ship.root.matrixWorld);
    this._m.decompose(cam.position, cam.quaternion, this._tmp.set(1, 1, 1));
    cam.up.set(0, 1, 0);
    if (cam.near !== 0.06 || Math.abs(cam.fov - fov) > 0.01) {
      cam.near = 0.06;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    this.pos.copy(cam.position);
  }

  // A shot in ship space: from a local point to a local point.
  shipShot(ship, from, to, fov = 50) {
    const cam = this.cam;
    const a = from.clone().applyMatrix4(ship.root.matrixWorld);
    const b = to.clone().applyMatrix4(ship.root.matrixWorld);
    cam.position.copy(a);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(ship.root.matrixWorld);
    cam.up.copy(up);
    cam.lookAt(b);
    if (cam.near !== 0.06 || Math.abs(cam.fov - fov) > 0.01) {
      cam.near = 0.06;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
