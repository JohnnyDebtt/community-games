import * as THREE from 'three';
import { pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';

// The boost's trail: plasma shed from the core at the ship's tail, a pale blue heart in a
// violet haze, drifting back off the ship, slowing, swelling a little and fading out.
// Points in render space, kept in two rings (the bright heart and the haze), moved by the
// world's origin when it shifts. emit(at, back, k, dt): k from 0 to 1, how hard it burns.

const LIFE = [0.4, 0.75];      // seconds: the trail fades out before it reaches the chase camera

class Ring {
  constructor(n, color, size, opacity) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n).fill(1e9);
    this.life = new Float32Array(n).fill(1);
    this.size = new Float32Array(n);
    this.alpha = new Float32Array(n);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(g, pointsMaterial({ color, size, additive: true, opacity }));
    this.points.layers.set(LAYER_FX);
    this.points.frustumCulled = false;
  }

  spawn(x, y, z, vx, vy, vz, life) {
    const i = this.next;
    this.next = (i + 1) % this.n;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.age[i] = 0;
    this.life[i] = life;
  }

  update(dt) {
    const drag = Math.exp(-1.6 * dt);
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const k = this.age[i] / this.life[i];
      if (k >= 1) { this.alpha[i] = 0; this.size[i] = 0; continue; }
      any = true;
      this.age[i] += dt;
      const j = i * 3;
      this.vel[j] *= drag; this.vel[j + 1] = this.vel[j + 1] * drag + 0.6 * dt; this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = 0.6 + k * 0.9;
      this.alpha[i] = Math.pow(1 - k, 1.8);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aSize.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
    this.points.visible = any;
  }

  shift(dx, dz) {
    for (let i = 0; i < this.n; i++) { this.pos[i * 3] -= dx; this.pos[i * 3 + 2] -= dz; }
  }
}

export class Plasma {
  constructor(scene) {
    this.heart = new Ring(160, 0xb4dcf5, 1.3, 0.55);
    this.haze = new Ring(140, 0x8a7bd8, 2.8, 0.32);
    scene.add(this.heart.points, this.haze.points);
    this._carry = 0;
    this._last = null;        // where the core was last frame
  }

  // at: the core (render space); back: the ship's backward direction (unit); k: 0..1
  emit(at, back, k, dt) {
    const last = this._last && this._last.distanceTo(at) < 20 ? this._last : at;
    if (k > 0.02) {
      this._carry += dt * 170 * k;
      const n = Math.floor(this._carry);
      for (let i = 0; i < n; i++) {
        this._carry -= 1;
        const j = () => (Math.random() - 0.5);
        const sp = 4 + Math.random() * 6 * k;
        const life = LIFE[0] + Math.random() * (LIFE[1] - LIFE[0]);
        // spread along the way the core came this frame, so the stream is unbroken
        const u = (i + Math.random()) / n;
        const px = at.x + (last.x - at.x) * u, py = at.y + (last.y - at.y) * u, pz = at.z + (last.z - at.z) * u;
        const x = px + back.x * 0.6 + j() * 0.8, y = py + j() * 0.8, z = pz + back.z * 0.6 + j() * 0.8;
        this.heart.spawn(x, y, z, back.x * sp + j() * 2, back.y * sp + j() * 2, back.z * sp + j() * 2, life * 0.7);
        if (Math.random() < 0.7) this.haze.spawn(x, y, z, back.x * sp * 0.7 + j() * 4, back.y * sp * 0.7 + j() * 4, back.z * sp * 0.7 + j() * 4, life);
      }
    } else this._carry = 0;
    this._last = (this._last || at.clone()).copy(at);
    this.heart.update(dt);
    this.haze.update(dt);
  }

  shift(dx, dz) {
    this.heart.shift(dx, dz);
    this.haze.shift(dx, dz);
    if (this._last) { this._last.x -= dx; this._last.z -= dz; }
  }
}
