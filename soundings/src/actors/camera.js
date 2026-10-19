import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math.js';
import { groundHeight } from '../world/layout.js';

// A calm follow camera. Drag to orbit, wheel to zoom. Framing presets blend smoothly:
// walking; sitting at a hole (side on, the Seeker, the hole and its seeker a little left
// of center, so the catch bar has room beside them); holding up a catch (close, the card
// beside it); and the capsule, which the camera follows up the stilt.

const _r = new THREE.Vector3();
const _f = new THREE.Vector3();

export class FollowCamera {
  constructor(aspect) {
    this.cam = new THREE.PerspectiveCamera(48, aspect, 0.1, 2600);
    this.yaw = 0;            // camera sits south (+z) of the target, looking north
    this.pitch = 0.36;
    this.dist = 7.5;
    this.target = new THREE.Vector3();
    this._t = new THREE.Vector3();
    this.mode = 'walk';
    this.userZoom = 7.5;
    this.shake = 0;
    this.focus = null;       // optional point the camera keeps in frame (the hole)
    this.yawTarget = null;
    this.shift = 0;          // meters along the view's right: frames the subject left of center
    this._shot = null;       // explicit position and target (the capsule)
    this._shotPos = new THREE.Vector3();
    this._shotTgt = new THREE.Vector3();
  }

  setAspect(a) {
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }

  orbit(dx, dy) {
    this.yaw -= dx * 0.0055;
    this.pitch = clamp(this.pitch + dy * 0.004, -0.05, 1.25);
    this.yawTarget = null;
  }

  zoomBy(z) {
    this.userZoom = clamp(this.userZoom * (1 + z * 0.08), 3.2, 22);
  }

  // The capsule entry: up the stilt with the lift, then the pod beside its screens.
  capsuleShot(step, cap, playerPos) {
    const c = cap.center;
    const front = -1;               // the capsule faces the sea, toward -z
    let pos, tgt;
    if (step === 'approach' || step === 'leap') {
      pos = _f.set(c.x - 3.2, cap.base.y + 1.6, c.z + front * 6.2);
      tgt = _r.set(c.x, playerPos.y + 1.4, c.z);
    } else if (step === 'ride' || step === 'drop' || step === 'leave') {
      const y = step === 'leave' ? c.y : cap.lift + 1;
      pos = _f.set(c.x - 3.6, y + 0.4, c.z + front * 7.2);
      tgt = _r.set(c.x, y + 0.6, c.z);
    } else if (step === 'land' || step === 'out') {
      pos = _f.set(c.x - 3.2, cap.base.y + 1.8, c.z + front * 6.6);
      tgt = _r.set(c.x, cap.base.y + 1, c.z - 1);
    } else {
      // inside: the pod on the left of the screen, its screens (the window) on the right
      const wide = this.cam.aspect > 1.15;
      pos = _f.set(c.x - (wide ? 3.4 : 1.2), c.y + 0.25, c.z + front * (wide ? 6.4 : 8.5));
      tgt = _r.set(c.x - (wide ? 2.3 : 0), c.y - (wide ? 0 : 1.6), c.z);
    }
    this._shot = { pos: pos.clone(), tgt: tgt.clone(), snap: !this._shot };
  }

  update(dt, playerPos, facing) {
    if (this.mode === 'capsule' && this._shot) {
      const s = this._shot;
      const k = s.snap ? 1 : 1 - Math.exp(-dt * 4.5);
      if (s.snap) { this._shotPos.copy(this.cam.position); this._shotTgt.copy(this.target); s.snap = false; }
      this._shotPos.lerp(s.pos, k);
      this._shotTgt.lerp(s.tgt, k);
      this.cam.position.copy(this._shotPos);
      this.target.copy(this._shotTgt);
      this._shake();
      this.cam.lookAt(this.target);
      return;
    }
    this._shot = null;
    let dist, pitchMin, ty, fov = 48, shift = 0;
    const t = this._t.copy(playerPos);
    switch (this.mode) {
      case 'fish':
        // side on, a little above: the Seeker, the hole and the seeker, left of center
        dist = 4.5;
        ty = 0.55;
        pitchMin = 0.36;
        if (this.focus) t.lerp(this.focus, 0.5);
        fov = 46;
        shift = this.cam.aspect > 1.15 ? 0.95 : 0;
        break;
      case 'catch':
        // close, the catch held up high in frame, the card beside it
        dist = this.cam.aspect > 1.15 ? 3.5 : 4.0;
        ty = this.cam.aspect < 0.75 ? 0.75 : 1.3;      // phones: the Seeker high, the card below
        pitchMin = 0.05;
        fov = 40;
        shift = this.cam.aspect > 1.15 ? 0.85 : this.cam.aspect > 0.75 ? 0.5 : 0;
        break;
      case 'rest':
        dist = 11;
        ty = 4.5;
        pitchMin = 0.1;
        break;
      default:
        dist = this.userZoom;
        ty = 0.95;
        pitchMin = -0.05;
    }
    // tall, narrow screens: step back so the scene still fits
    if (this.cam.aspect < 1) dist *= 1 + (1 - this.cam.aspect) * 0.9;
    if (this.yawTarget !== null) this.yaw = dampAngle(this.yaw, this.yawTarget, 3, dt);
    if (this.mode === 'catch') this.pitch = damp(this.pitch, 0.14, 4, dt);
    else if (this.mode === 'fish') this.pitch = damp(this.pitch, clamp(this.pitch, pitchMin, 0.62), 4, dt);
    t.y += ty;
    // the view's right, along the ground
    _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.shift = damp(this.shift, shift, 4, dt);
    t.addScaledVector(_r, this.shift);
    this.target.x = damp(this.target.x, t.x, 9, dt);
    this.target.y = damp(this.target.y, t.y, 9, dt);
    this.target.z = damp(this.target.z, t.z, 9, dt);
    this.dist = damp(this.dist, dist, 4, dt);
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov = damp(this.cam.fov, fov, 4, dt);
      this.cam.updateProjectionMatrix();
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const p = this.cam.position;
    p.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    // keep above the ground
    const g = groundHeight(p.x, p.z) + 0.35;
    if (p.y < g) p.y = g;
    this._shake();
    this.cam.lookAt(this.target);
    void facing;
  }

  _shake() {
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - 1 / 60 * 2.5);
      const p = this.cam.position;
      const k = this.shake * this.shake * 0.08;
      p.x += (Math.random() - 0.5) * k;
      p.y += (Math.random() - 0.5) * k;
      p.z += (Math.random() - 0.5) * k;
    }
  }
}
