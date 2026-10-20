import * as THREE from 'three';
import { describe, wildSeed } from './generate.js';
import { buildArtifact } from './models.js';
import { U } from '../render/materials.js';
import { FOG } from '../render/pipeline.js';
import { WATER, canopyTop } from '../world/terrain.js';
import { angleDelta, clamp, TAU, damp } from '../core/math.js';

// The artifacts in the forest: where each appears, the clearing it makes, its light in
// the fog and on the trees, its pulse, the scanner's lock and hold, and when it is left
// behind for good.
//
// One at a time: a wild one (unique to this player) every minute or two, or, when a
// seeker has moved while you fly, that move's witnessed artifact (the same for everyone
// flying then; generate.js).
//
// An artifact appears just beyond what the fog lets you see, close and nearly dead
// ahead, so it always comes out of the fog in front of you. Until you have seen it, it
// keeps ahead of the nose wherever you turn; once seen, it stays where it stands. It
// materializes in the ordered dither, so it never pops into view.

const SCAN_RANGE = 340;
const SCAN_CONE = 0.52;       // radians either side of the nose
const SCAN_TIME = 2.4;        // seconds of holding
const FIRST_DELAY = 30;
const REVEAL_SECS = 2.6;

export class Field {
  constructor(game) {
    this.game = game;
    this.active = [];
    this.next = FIRST_DELAY;
    this.target = null;       // the artifact the scanner looks at
    this.scan = 0;
    this.state = 'idle';      // idle | far | near | lock | done
    this.onScanned = null;
    this.onAppear = null;
    this.onGate = null;
    this.onMissed = null;
    this._v = new THREE.Vector3();
  }

  get pending() {
    return this.active.find((a) => !a.scanned && !a.passed) || null;
  }

  // How far one can see from the ship through the fog now (where it thins to ~9%).
  visibility() {
    const y = this.game.ship.y;
    const h = y - 12 - U.uFogBase.value;
    const prof = h < 0 ? 1 + Math.min(-h * 0.012, 0.8) : Math.exp(-h * U.uFogFalloff.value);
    const d = U.uFogDensity.value * prof * 1.15 + U.uHaze.value;
    return clamp(2.4 / d, 150, 900);
  }

  // just past what can be seen: close in fog, farther in clear air
  spawnDistance() {
    return clamp(this.visibility() + 60, 210, 960);
  }

  // A wild artifact, from a seed nobody else will draw.
  spawnWild(opts = {}) {
    return this.spawn({ tx: wildSeed(), wild: true }, opts);
  }

  // Bring one move (or a wild seed) into the forest now.
  async spawn(move, opts = {}) {
    const g = this.game;
    const d = describe(move, (t) => g.seekerInfo(t), opts.family || null);
    const a = {
      d, move, special: !!d.special, scanned: false, passed: false, dist: Infinity, near: 0, clearings: [], pass: 0,
      revealed: !!opts.ahead, reveal: 0, born: g.time, movedAt: g.time,
      spawnDist: opts.ahead ?? this.spawnDistance(),
      latK: d.family === 'gate' ? 0 : ((parseInt(move.tx.slice(10, 14), 16) / 65535) * 2 - 1) * 0.16,
    };
    if (opts.lateral !== undefined) a.latK = opts.lateral / a.spawnDist;
    await this._build(a);
    this.active.push(a);
    if (this.onAppear) this.onAppear(a);
    return a;
  }

  // (Re)build an artifact ahead of the ship's nose, at its distance.
  async _build(a) {
    const g = this.game, ship = g.ship, d = a.d;
    a.building = true;
    if (a.model) this._dispose(a);
    const [fx, fz] = ship.forward();
    const dist = a.spawnDist, lat = a.latK * dist;
    const x = ship.x + fx * dist + fz * lat, z = ship.z + fz * dist - fx * lat;
    const ground = Math.max(g.world.groundAt(x, z), WATER);
    const yaw = d.family === 'gate' ? ship.heading : (d.seed[2] / 4294967296) * TAU;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const ctx = {
      ground: (lx, lz) => Math.max(g.world.groundAt(x + lx * c + lz * s, z - lx * s + lz * c), WATER) - ground,
      ringY: canopyTop(x, z) + 17 - ground,
      seekerPixels: d.family === 'echo' ? (a.pixels || (a.pixels = await g.seekerPixels(d.lead))) : null,
    };
    const model = buildArtifact(d, ctx);
    Object.assign(a, { model, x, z, y: ground, yaw, prevLocal: null });
    model.group.rotation.y = yaw;
    a.clearings = [];
    if (model.clear > 0) a.clearings.push(g.world.addClearing(x, z, model.clear));
    for (const [lx, lz, r] of model.clearings || []) a.clearings.push(g.world.addClearing(x + lx * c + lz * s, z - lx * s + lz * c, r));
    g.scene.add(model.group);
    this.place(a);
    a.reveal = 0;
    a.movedAt = g.time;
    a.building = false;
  }

  _dispose(a) {
    const g = this.game;
    g.scene.remove(a.model.group);
    a.model.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of a.model.mats) m.dispose();
    for (const c of a.clearings) g.world.removeClearing(c);
    a.clearings = [];
  }

  place(a) {
    const o = this.game.world.origin;
    a.model.group.position.set(a.x - o.x, a.y, a.z - o.z);
    a.model.group.updateMatrixWorld(true);
  }

  remove(a) {
    this._dispose(a);
    this.active.splice(this.active.indexOf(a), 1);
    if (this.target === a) this.target = null;
  }

  // the light at its heart, in render space
  lightPos(a) {
    return this._v.copy(a.model.light).applyMatrix4(a.model.group.matrixWorld);
  }

  pulseAt(a, beat) {
    const s = a.d.song;
    const pos = beat / s.step;
    const i = Math.floor(pos);
    const f = pos - i;
    const hit = s.pattern[((i % s.n) + s.n) % s.n];
    return 0.3 + (hit ? Math.pow(1 - f, 2) * 0.9 : 0);
  }

  update(dt, scanHeld) {
    const g = this.game, ship = g.ship;
    const beat = g.beat;
    const o = g.world.origin;
    // who is where
    const shipR = new THREE.Vector3(ship.x - o.x, ship.y, ship.z - o.z);
    const vis = this.visibility();
    for (const a of [...this.active]) {
      if (a.building) continue;
      this.place(a);
      const dx = a.x - ship.x, dz = a.z - ship.z;
      a.dist = Math.hypot(dx, dz);
      a.bearing = angleDelta(ship.heading, Math.atan2(dx, dz));
      a.near = clamp(1 - a.dist / 500, 0, 1);
      // not seen yet: keep it ahead of the nose, just beyond sight
      if (!a.revealed && !a.scanned) {
        if (a.dist < vis * 0.85 && Math.abs(a.bearing) < 0.8) a.revealed = true;
        else if ((Math.abs(a.bearing) > 0.5 || a.dist > a.spawnDist * 1.3) && g.time - a.movedAt > 1.2) {
          a.spawnDist = this.spawnDistance();
          this._build(a);
          continue;
        }
      }
      a.reveal = Math.min(1, a.reveal + dt / REVEAL_SECS);
      const pulse = this.pulseAt(a, beat);
      a.pulse = pulse;
      for (const m of a.model.mats) {
        if (!m.uniforms) continue;
        if (m.uniforms.uPulse) m.uniforms.uPulse.value = pulse;
        if (m.uniforms.uReveal) m.uniforms.uReveal.value = a.reveal;
      }
      const local = a.model.group.worldToLocal(shipR.clone());
      a.model.update(g.time, beat, { pulse, near: a.near, shipLocal: local, reveal: a.reveal });
      if (a.model.onShip) {
        if (a.prevLocal) {
          const n = a.model.onShip(local, a.prevLocal);
          if (n && this.onGate) this.onGate(a, n);
          a.pass += n;
        }
        a.prevLocal = local;
      }
      if (a.model.halo) a.model.halo.material.uniforms.uOpacity.value = (0.35 + pulse * 0.4) * a.d.strength * a.reveal;
      // left behind: well behind the ship and far, or very far
      const behind = Math.abs(a.bearing) > 1.9;
      if (!a.passed && (behind && a.dist > 260)) {
        a.passed = true;
        if (!a.scanned && this.onMissed) this.onMissed(a);
      }
      if ((behind && a.dist > 1100) || a.dist > 1900) this.remove(a);
    }
    // lights: the nearest three
    const lit = [...this.active].sort((p, q) => p.dist - q.dist).slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const a = lit[i];
      const P = U.uPointPos.value[i + 1], C = U.uPointColor.value[i + 1];
      const F = FOG.uFogLights.value[i + 1], FC = FOG.uFogLightColor.value[i + 1];
      if (!a || a.building) { P.w = 0; F.w = 0; continue; }
      const lp = this.lightPos(a);
      const k = a.d.strength * (0.25 + 0.75 * a.reveal);
      P.set(lp.x, lp.y, lp.z, 70 * a.d.size);
      C.setHex(a.d.accent).multiplyScalar(0.9 * k * (0.6 + a.pulse * 0.5));
      F.set(lp.x, lp.y, lp.z, 60 * k * (0.7 + a.pulse * 0.4));
      FC.setHex(a.d.accent);
    }
    // the scanner
    const t = this.pending;
    this.target = t;
    if (!t) {
      this.state = 'idle';
      this.scan = Math.max(0, this.scan - dt);
      return;
    }
    const inRange = t.dist < SCAN_RANGE + t.model.span * 0.5;
    const inCone = Math.abs(t.bearing) < SCAN_CONE;
    if (inRange && inCone && !g.asleep) {
      this.state = 'lock';
      if (scanHeld) this.scan = Math.min(1, this.scan + dt / SCAN_TIME);
      else this.scan = Math.max(0, this.scan - dt * 0.4);
      if (this.scan >= 1) {
        t.scanned = true;
        this.scan = 0;
        this.state = 'done';
        if (this.onScanned) this.onScanned(t);
      }
    } else {
      this.state = inRange ? 'near' : 'far';
      this.scan = Math.max(0, this.scan - dt * 0.6);
    }
    ship.scanGlow = damp(ship.scanGlow, this.state === 'lock' && scanHeld ? 1 : 0, 8, dt);
  }

  // The world's origin moved: positions are recomputed every frame, nothing to do.
  shift() {}
}
