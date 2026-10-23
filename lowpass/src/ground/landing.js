import * as THREE from 'three';
import { pointsMaterial } from '../render/materials.js';
import { LAYER_FX, POST } from '../render/pipeline.js';
import { clamp, smoothstep, lerp, TAU, angleDelta } from '../core/math.js';
import { pose, walkPose } from '../ship/seeker.js';

// Coming down into a clearing, and going up out of it: short scenes of still shots, bars
// above and below, nothing to do but watch (any key hurries them along). Each ship comes
// in its own way (STYLE): the Seed on a wide curve, the Heron on a long low glide, the
// Moth spiraling down, the Kestrel fast with a hard flare, the Ark slowly from high up.
// It hangs over the clearing, its legs come down, it settles in a breath of dust; its ramp
// folds down and the one aboard walks out into the forest. Going up, the ramp folds shut,
// it lifts, its legs fold away, and it flies on.
//
// While the camera cuts away, the forest about the clearing is made over for walking in
// (chunks.js), and made back when it leaves.

const STYLE = {
  seed: { turns: 0.55, dur: 6, high: 24, flare: 0.14, settle: 2.6 },
  heron: { turns: 0.12, dur: 6.5, high: 16, flare: 0.1, settle: 2.4 },
  moth: { turns: 1.5, dur: 7, high: 30, flare: 0.06, settle: 2.8 },
  kestrel: { turns: 0.25, dur: 4.6, high: 20, flare: 0.36, settle: 1.8 },
  ark: { turns: 0.35, dur: 8, high: 42, flare: 0.03, settle: 3.6 },
};
const OPEN = 1.5, WALKOUT = 3.4, TAIL = 1.3;   // the ramp, the walk down it, the last shot
export const WALK_R = 320;                      // how far about the clearing one may walk

const ease = (t) => t * t * (3 - 2 * t);

// a breath of dust and fallen needles, thrown out along the ground (render space)
class Dust {
  constructor(scene) {
    const n = 140;
    this.n = n;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.points = new THREE.Points(g, pointsMaterial({ color: 0xb8b0a0, size: 1.6, additive: false, opacity: 0.5 }));
    this.points.layers.set(LAYER_FX);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    this.age = 99;
  }
  burst(at, k = 1) {
    for (let i = 0; i < this.n; i++) {
      const a = Math.random() * TAU, s = (6 + Math.random() * 10) * k;
      this.pos.set([at.x + Math.cos(a) * 3, at.y + 0.3, at.z + Math.sin(a) * 3], i * 3);
      this.vel.set([Math.cos(a) * s, 0.8 + Math.random() * 2.2, Math.sin(a) * s], i * 3);
    }
    this.age = 0;
    this.points.visible = true;
  }
  update(dt) {
    if (this.age > 4) { this.points.visible = false; return; }
    this.age += dt;
    const drag = Math.exp(-2.2 * dt);
    for (let i = 0; i < this.n; i++) {
      for (let j = 0; j < 3; j++) { this.vel[i * 3 + j] *= drag; this.pos[i * 3 + j] += this.vel[i * 3 + j] * dt; }
      this.alpha[i] = Math.max(0, 1 - this.age / 3.5) * (0.5 + 0.5 * ((i * 7) % 5) / 5);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = true;
    a.aAlpha.needsUpdate = true;
  }
  shift(dx, dz) { for (let i = 0; i < this.n; i++) { this.pos[i * 3] -= dx; this.pos[i * 3 + 2] -= dz; } }
}

export class Landing {
  constructor(game) {
    this.game = game;
    this.dust = new Dust(game.scene);
    this.active = null;     // 'down' | 'up'
    this._v = new THREE.Vector3();
  }

  // the camera: from a point to a point, both world space, through the floating origin
  _shot(from, to, fov) {
    const g = this.game, o = g.world.origin, cam = g.cams.cam;
    cam.position.set(from.x - o.x, from.y, from.z - o.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(to.x - o.x, to.y, to.z - o.z);
    if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== 0.3) { cam.fov = fov; cam.near = 0.3; cam.updateProjectionMatrix(); }
    g.cams.pos.copy(cam.position);
  }

  // a point of the ship (ship space) in world space
  _onShip(v) {
    const g = this.game, s = g.ship, c = Math.cos(s.heading), si = Math.sin(s.heading);
    return { x: s.x + v.x * c + v.z * si, y: s.y + v.y, z: s.z - v.x * si + v.z * c };
  }

  // ---------------------------------------------------------------- down
  down(site) {
    const g = this.game, s = g.ship, w = g.world;
    const st = STYLE[s.design.id] || STYLE.seed;
    const cx = site.x, cz = site.z, ground = w.groundAt(cx, cz);
    const dx = s.x - cx, dz = s.z - cz;
    this.p = {
      site, st, cx, cz, ground, rest: ground + s.rest,
      x0: s.x, z0: s.z, y0: s.y, h0: s.heading,
      r0: Math.max(60, Math.hypot(dx, dz)), a0: Math.atan2(dx, dz),
      t: 0, cut: false, landed: false, opened: false,
    };
    // the approach turns about the clearing the way the ship is already turning
    const tang = angleDelta(Math.atan2(dx, dz) + Math.PI / 2, s.heading);
    this.p.dir = Math.abs(tang) < Math.PI / 2 ? 1 : -1;
    // the camera's place on the clearing's edge, off the line it comes in on
    const side = this.p.a0 + this.p.dir * 2.1;
    this.p.eye = { x: cx + Math.sin(side) * 14, z: cz + Math.cos(side) * 14 };
    this.p.eye.y = w.groundAt(this.p.eye.x, this.p.eye.z) + 2.2;
    this.active = 'down';
    s.held = true;
    s.boost = 0;
    g.audio.play('descend');
  }

  // where the ship is u of the way in (0..1): spiraling in and down to hang over the clearing
  _approach(u) {
    const p = this.p, st = p.st, e = ease(u);
    const a = p.a0 + p.dir * st.turns * TAU * e;
    const r = p.r0 * Math.pow(1 - e, 1.25);
    return { x: p.cx + Math.sin(a) * r, z: p.cz + Math.cos(a) * r, y: lerp(p.y0, p.rest + st.high, smoothstep(0, 1, Math.pow(u, 0.8))) };
  }

  _down(dt) {
    const g = this.game, s = g.ship, p = this.p, st = p.st;
    p.t += dt;
    const t = p.t, T1 = st.dur, T2 = T1 + st.settle, T3 = T2 + OPEN, T4 = T3 + WALKOUT, T5 = T4 + TAIL;
    POST.uLetterbox.value = Math.min(1, POST.uLetterbox.value + dt * 2);
    if (t < T1) {
      // in, and down to hang over it, nose along the way it goes
      // (its nose along the way it goes, looked for well ahead: near the end, where it
      // hardly moves, two near points would point every which way)
      const u = t / T1, q = this._approach(u), q2 = this._approach(Math.min(1, u + 0.08));
      if (Math.hypot(q2.x - q.x, q2.z - q.z) > 1.5) s.heading = s.heading + angleDelta(s.heading, Math.atan2(q2.x - q.x, q2.z - q.z)) * Math.min(1, dt * 1.6);
      s.x = q.x; s.z = q.z; s.y = q.y;
      s.pitch = lerp(0, -st.flare, smoothstep(0.7, 1, u));
      s.bank = -p.dir * st.turns * 0.25 * Math.sin(Math.PI * u);
      s.speed = lerp(s.cruise, 3, u);
      this._shot(p.eye, { x: s.x, y: s.y - 2, z: s.z }, 50);
    } else {
      // the cut: the forest about it made over for walking, out of sight; from here on it
      // stands over the clearing (however the scene was hurried)
      if (!p.cut) { p.cut = true; g.walkZone({ x: p.cx, z: p.cz, r: WALK_R }); }
      s.x = p.cx; s.z = p.cz;
    }
    if (t < T1) {
      // (the approach, above)
    } else if (t < T2) {
      const u = (t - T1) / st.settle;
      s.y = lerp(p.rest + st.high, p.rest, 1 - Math.pow(1 - u, 2.2));
      s.pitch = lerp(-st.flare, 0, smoothstep(0, 0.6, u));
      s.bank = 0;
      s.speed = 0;
      s.setGear(smoothstep(0.05, 0.7, u));
      if (u > 0.97 && !p.landed) { p.landed = true; this.dust.burst({ x: s.x - g.world.origin.x, y: p.ground, z: s.z - g.world.origin.z }, s.design.id === 'kestrel' ? 1.4 : s.design.id === 'ark' ? 1.2 : 1); g.audio.play('touchdown'); }
      const ex = s.H.extra + Math.max(0, s.span - 8);
      const from = this._onShip({ x: 13 + ex * 0.4, y: -s.rest + 1.2, z: 9 + ex * 0.3 });
      from.y = Math.max(from.y, g.world.groundAt(from.x, from.z) + 0.8);
      this._shot(from, this._onShip({ x: 0, y: -s.rest * 0.4, z: 0 }), 52);
    } else if (t < T4) {
      // the ramp down, the light, and the one aboard walking out
      s.y = p.rest;
      s.pitch = 0; s.bank = 0; s.speed = 0;
      s.setGear(1);
      s.setRamp(clamp((t - T2) / OPEN, 0, 1));
      if (!p.opened) { p.opened = true; g.audio.play('ramp'); this._pilot(true); }
      this._walkOut(t - T2 - OPEN * 0.85);
      const foot = s.rampFoot();
      const from = this._onShip({ x: foot.x - 7.5, y: foot.y + 1.6, z: foot.z + 4.5 });
      from.y = Math.max(from.y, g.world.groundAt(from.x, from.z) + 1.2);
      this._shot(from, this._onShip({ x: foot.x * 0.6, y: foot.y + 1.5, z: foot.z }), 46);
    } else if (t < T5) {
      // over its shoulder, out into the forest
      this._walkOut(t - T2 - OPEN * 0.85);
      const at = this._pilotAt(), back = this._onShip({ x: this._pathEnd().x + 2.4, y: 0, z: this._pathEnd().z - 0.6 });
      const from = { x: back.x, y: at.y + 2.1, z: back.z };
      const look = this._onShip({ x: this._pathEnd().x - 12, y: 0, z: this._pathEnd().z });
      look.y = at.y + 1.2;
      this._shot(from, look, 56);
      POST.uFade.value = smoothstep(T5 - 0.6, T5, t);
    } else {
      this._downDone();
      return false;
    }
    return true;
  }

  // the one aboard: in the ship's frame for the scene
  _pilot(on) {
    const g = this.game, sk = g.seeker;
    if (on) { g.ship.root.add(sk.root); sk.root.visible = true; }
    else { g.interior.group.add(sk.root); sk.root.visible = false; }
  }
  // its walk: from inside the door, down the ramp, a few steps on (ship space)
  _pathEnd() { const f = this.game.ship.rampFoot(); return new THREE.Vector3(f.x - 2.6, f.y, f.z); }
  _walkOut(t) {
    const g = this.game, s = g.ship, sk = g.seeker, r = sk.root;
    const hinge = s.ramp.position, foot = s.rampFoot(), end = this._pathEnd();
    const P = [new THREE.Vector3(hinge.x + 0.9, 0, hinge.z), new THREE.Vector3(hinge.x, 0, hinge.z), foot, end];
    const D = [0.6, 1.5, 1.3], u = Math.max(0, t);
    let i = 0, acc = 0;
    while (i < D.length - 1 && u > acc + D[i]) { acc += D[i]; i++; }
    const k = clamp((u - acc) / D[i], 0, 1);
    r.position.lerpVectors(P[i], P[i + 1], k);
    r.rotation.set(0, -Math.PI / 2, 0);
    const o = pose();
    if (t > 0 && u < acc + D[i] + 0.01 && !(i === D.length - 1 && k >= 1)) walkPose(o, u * 0.9);
    sk.apply(o, 1 / 60);
  }
  _pilotAt() { const r = this.game.seeker.root; return this._onShip(r.position); }

  _downDone() {
    const g = this.game, p = this.p;
    this._pilot(false);
    this.active = null;
    POST.uLetterbox.value = 0;
    const end = this._onShip(this._pathEnd());
    g.landedAt(p.site, { x: end.x, z: end.z, yaw: g.ship.heading - Math.PI / 2 });
  }

  // ---------------------------------------------------------------- up
  up() {
    const g = this.game, s = g.ship;
    this.p = { t: 0, y0: s.y, h0: s.heading, ground: s.y - s.rest, cut: false, x0: s.x, z0: s.z, st: STYLE[s.design.id] || STYLE.seed };
    const side = s.heading + Math.PI * 0.75;
    this.p.eye = { x: s.x + Math.sin(side) * (18 + s.H.extra * 0.5), z: s.z + Math.cos(side) * (18 + s.H.extra * 0.5) };
    this.p.eye.y = g.world.groundAt(this.p.eye.x, this.p.eye.z) + 1.7;
    this.active = 'up';
    s.held = true;
    g.audio.play('ascend');
  }

  _up(dt) {
    const g = this.game, s = g.ship, p = this.p;
    p.t += dt;
    const t = p.t;
    POST.uLetterbox.value = Math.min(1, POST.uLetterbox.value + dt * 2) * (t > 6.4 ? Math.max(0, (7 - t) / 0.6) : 1);
    POST.uFade.value = t < 0.4 ? 1 - t / 0.4 : 0;
    const [fx, fz] = s.forward();
    if (t < 3.2) {
      s.setRamp(clamp(1 - t / 1.1, 0, 1));
      const u = clamp((t - 1.0) / 2.2, 0, 1);
      s.y = p.y0 + ease(u) * p.st.high * 0.7;
      s.setGear(1 - smoothstep(0.3, 0.9, u));
      s.speed = 0;
      this._shot(p.eye, { x: s.x, y: s.y, z: s.z }, 48);
    } else if (t < 7) {
      // the cut: the forest made back as it was
      if (!p.cut) { p.cut = true; g.walkZone(null); s.setGear(0); s.setRamp(0); }
      const u = (t - 3.2) / 3.8;
      s.speed = lerp(4, s.cruise, ease(u));
      s.x += fx * s.speed * dt;
      s.z += fz * s.speed * dt;
      const cruise = s._target();
      s.y = lerp(p.y0 + p.st.high * 0.7, Math.max(cruise, p.y0 + p.st.high * 0.7), ease(u));
      s.pitch = -0.12 * Math.sin(Math.PI * u);
      const back = 30 + s.H.extra, from = { x: s.x - fx * back, y: s.y + 7, z: s.z - fz * back };
      this._shot(from, { x: s.x + fx * 30, y: s.y, z: s.z + fz * 30 }, 56);
    } else {
      this.active = null;
      POST.uLetterbox.value = 0;
      POST.uFade.value = 0;
      s.held = false;
      s.pitch = 0;
      s._ty = s.y;
      s.vy = 0;
      g.tookOff();
      return false;
    }
    return true;
  }

  // a key hurries it: the next part of the scene at once
  hurry() {
    const p = this.p;
    if (!p || !this.active) return;
    if (this.active === 'down') {
      const st = p.st, T1 = st.dur, T2 = T1 + st.settle;
      if (p.t < T1) p.t = T1;
      else if (p.t < T2 - 0.1) p.t = T2 - 0.1;
      else p.t = Math.max(p.t, T2 + OPEN + WALKOUT);
    } else if (p.t < 3.2) p.t = 3.2;
    else p.t = 6.9;
  }

  update(dt) {
    this.dust.update(dt);
    if (this.active === 'down') return this._down(dt);
    if (this.active === 'up') return this._up(dt);
    return false;
  }
}
