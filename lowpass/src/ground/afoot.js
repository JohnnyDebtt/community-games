import * as THREE from 'three';
import { describe, wildSeed } from '../artifacts/generate.js';
import { buildArtifact } from '../artifacts/models.js';
import { rollDepth } from '../core/progress.js';
import { U } from '../render/materials.js';
import { FOG } from '../render/pipeline.js';
import { WATER } from '../world/terrain.js';
import { clamp, damp, angleDelta } from '../core/math.js';
import { WALK_R } from './landing.js';

// On foot, about a clearing the ship has landed in: first person among the trunks, the
// fog close, and between the trees what can only be found this way (curios.js). Walk up
// to one, look at it, hold the scanner on it; the Codex keeps it like anything else. The
// ship waits with its ramp down: walk back up to it to go aboard.

const EYE = 1.62, WALK = 2.6, RUN = 5.2;
const SCAN_SECS = 2.4;             // holding the scanner on a thing
const MARK = 0.08;                 // a thing here is one of the marked (+)

export class Afoot {
  constructor(game) {
    this.game = game;
    this.curios = [];
    this.site = null;
    this.p = { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0, walked: 0 };
    this.target = null;
    this.state = 'idle';
    this.scan = 0;
    this.spot = null;
    this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
  }

  get open() { return this.curios.filter((c) => !c.scanned); }

  // the things about a clearing: placed between the trunks, off the water, apart
  populate(site) {
    const g = this.game, w = g.world;
    this.clear();
    this.site = site;
    const reach = g.progress.depth, n = 14 + Math.floor(Math.random() * 7);
    const placed = [];
    for (let tries = 0; placed.length < n && tries < n * 30; tries++) {
      const a = Math.random() * Math.PI * 2, r = 45 + Math.sqrt(Math.random()) * (WALK_R - 75);
      const x = site.x + Math.sin(a) * r, z = site.z + Math.cos(a) * r, h = w.groundAt(x, z);
      if (h < WATER + 1) continue;
      const slope = Math.abs(w.groundAt(x + 3, z) - w.groundAt(x - 3, z)) + Math.abs(w.groundAt(x, z + 3) - w.groundAt(x, z - 3));
      if (slope > 4) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 24)) continue;
      if (w.trunksNear(x, z, 6).some((t) => Math.hypot(t.x - x, t.z - z) < t.r + 2.6)) continue;
      placed.push({ x, z, h });
    }
    for (const at of placed) {
      const d = describe({ tx: wildSeed(), wild: true, depth: rollDepth(reach), curio: true, plus: Math.random() < MARK }, null);
      const ctx = { ground: (lx, lz) => w.groundAt(at.x + lx, at.z + lz) - at.h, ringY: 0 };
      const model = buildArtifact(d, ctx);
      model.group.rotation.y = Math.random() * Math.PI * 2;
      g.scene.add(model.group);
      this.curios.push({ d, model, x: at.x, z: at.z, y: at.h, scanned: false, heard: false, dist: Infinity, bearing: 0, move: {}, pulse: 1, reveal: 1 });
    }
  }

  clear() {
    for (const c of this.curios) {
      this.game.scene.remove(c.model.group);
      c.model.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      for (const m of c.model.mats) m.dispose();
    }
    this.curios = [];
    this.target = null;
    this.scan = 0;
  }

  // standing at (x, z) facing yaw (world), to walk
  enter(x, z, yaw) {
    const p = this.p;
    p.x = x; p.z = z; p.yaw = yaw; p.pitch = -0.05; p.bob = 0;
    this.scan = 0;
    this.target = null;
  }

  // where one may stand: clear of the trunks, the ship, the water, and not too far off
  _free(x, z, r = 0.35) {
    const g = this.game, s = g.ship;
    if (g.world.groundAt(x, z) < WATER - 0.2) return false;
    if (this.site && Math.hypot(x - this.site.x, z - this.site.z) > WALK_R - 25) return false;
    for (const t of this._trunks) if ((t.x - x) ** 2 + (t.z - z) ** 2 < (t.r + r) ** 2) return false;
    // the ship: its hull, in its own frame (the ramp's foot stays open)
    const c = Math.cos(s.heading), si = Math.sin(s.heading), dx = x - s.x, dz = z - s.z;
    const lx = dx * c - dz * si, lz = dx * si + dz * c;
    if (lz > s.H.zMin - 0.5 && lz < s.H.zMax + 0.5 && Math.abs(lx) < s.H.section(clamp(lz, s.H.zMin, s.H.zMax))[0] + r) return false;
    return true;
  }

  // a point of the ship's frame, in world space
  _onShip(v) {
    const s = this.game.ship, c = Math.cos(s.heading), si = Math.sin(s.heading);
    return { x: s.x + v.x * c + v.z * si, z: s.z - v.x * si + v.z * c };
  }

  update(dt, overlay) {
    const g = this.game, input = g.input, p = this.p, w = g.world;
    this._trunks = w.trunksNear(p.x, p.z, 6);
    if (!overlay) {
      const l = g._lookInput();
      p.yaw -= l.x;
      p.pitch = clamp(p.pitch - l.y, -1.3, 1.2);
      if (input.hit('Mouse0') && !input.locked && matchMedia('(pointer: fine)').matches) input.lock();
      const mv = input.walk();
      const keysTurn = input.down('ArrowLeft', 'ArrowRight');
      const sx = keysTurn ? 0 : mv.x;
      const sp = (input.down('ShiftLeft', 'ShiftRight') ? RUN : WALK) * dt;
      const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      const dx = (fx * mv.y - fz * sx) * sp, dz = (fz * mv.y + fx * sx) * sp;
      if (this._free(p.x + dx, p.z + dz)) { p.x += dx; p.z += dz; }
      else if (this._free(p.x + dx, p.z)) p.x += dx;
      else if (this._free(p.x, p.z + dz)) p.z += dz;
      const moved = Math.hypot(dx, dz);
      p.walked += moved;
      p.bob = damp(p.bob, moved > 0.001 ? 1 : 0, 6, dt);
      if (p.walked > (input.down('ShiftLeft', 'ShiftRight') ? 0.9 : 0.7)) { p.walked = 0; g.audio.play('step', { gain: 0.55 }); }
    }
    // the eye, through the floating origin
    const o = w.origin, ground = w.groundAt(p.x, p.z);
    const cam = g.cams.cam;
    cam.position.set(p.x - o.x, ground + EYE + Math.sin(g.time * 9.4) * 0.03 * p.bob, p.z - o.z);
    this._e.set(p.pitch, p.yaw + Math.PI, 0, 'YXZ');
    cam.quaternion.setFromEuler(this._e);
    cam.up.set(0, 1, 0);
    if (cam.near !== 0.06 || Math.abs(cam.fov - 72) > 0.01) { cam.near = 0.06; cam.fov = 72; cam.updateProjectionMatrix(); }
    g.cams.pos.copy(cam.position);
    cam.updateMatrixWorld();

    // the ramp: walk up to its foot to go aboard
    const foot = this._onShip(g.ship.rampFoot());
    const nearRamp = Math.hypot(foot.x - p.x, foot.z - p.z) < 2.8;
    this.spot = nearRamp ? { id: 'aboard', label: 'Go aboard' } : null;
    if (!overlay && nearRamp && input.hit('KeyE', 'Enter', 'Pad0', 'KeyV', 'Pad2')) { g.goAboard(); return; }

    // the things here: placed, lit, heard; the one looked at, scanned
    const fwd = this._v.set(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestScore = Infinity;
    const lit = [];
    for (const c of this.curios) {
      c.model.group.position.set(c.x - o.x, c.y, c.z - o.z);
      c.model.group.updateMatrixWorld(true);
      const dx = c.x - p.x, dz = c.z - p.z;
      c.dist = Math.hypot(dx, dz);
      c.bearing = angleDelta(p.yaw, Math.atan2(dx, dz));
      c.pulse = g.field.pulseAt(c, g.beat);
      for (const m of c.model.mats) if (m.uniforms) { if (m.uniforms.uPulse) m.uniforms.uPulse.value = c.pulse; if (m.uniforms.uReveal) m.uniforms.uReveal.value = 1; }
      c.model.update(g.time, g.beat, { pulse: c.pulse, reveal: 1, near: clamp(1 - c.dist / 60, 0, 1) });
      if (c.model.halo) c.model.halo.material.uniforms.uOpacity.value = (0.3 + c.pulse * 0.35) * c.d.strength * (c.scanned ? 0.4 : 1);
      // heard first from a little way off
      if (!c.heard && c.dist < 34) { c.heard = true; g.audio.play('signal', { pan: clamp(-Math.sin(c.bearing), -1, 1) }); }
      if (c.dist < 90) lit.push(c);
      if (c.scanned) continue;
      const range = 6 + c.model.span * 1.6;
      if (c.dist > range + 4) continue;
      const to = c.model.focus.clone().applyMatrix4(c.model.group.matrixWorld).sub(cam.position);
      const off = to.normalize().angleTo(fwd);
      const score = off * 20 + c.dist;
      if (off < 0.45 && score < bestScore) { bestScore = score; best = c; best._in = c.dist < range && off < 0.32; }
    }
    if (best !== this.target) this.scan = 0;
    this.target = best;
    const held = !overlay && !g.asleep && input.scanHeld();
    this.state = best ? (best._in ? 'lock' : 'near') : 'idle';
    if (best && best._in && held) {
      this.scan = Math.min(1, this.scan + dt / SCAN_SECS);
      if (Math.floor(g.time * 6) !== this._tick) { this._tick = Math.floor(g.time * 6); g.audio.play('scan', { progress: this.scan }); }
      if (this.scan >= 1) {
        best.scanned = true;
        this.scan = 0;
        g._scanned(best, cam.position.clone());
      }
    } else this.scan = Math.max(0, this.scan - dt * 0.6);
    // their light: the nearest three
    lit.sort((a, b) => a.dist - b.dist);
    for (let i = 0; i < 3; i++) {
      const c = lit[i], P = U.uPointPos.value[i + 1], C = U.uPointColor.value[i + 1], F = FOG.uFogLights.value[i + 1];
      if (!c) { P.w = 0; F.w = 0; continue; }
      const lp = c.model.light.clone().applyMatrix4(c.model.group.matrixWorld);
      P.set(lp.x, lp.y, lp.z, 9 * c.d.size);
      C.setHex(c.d.accent).multiplyScalar(0.7 * (0.6 + c.pulse * 0.5));
      F.set(lp.x, lp.y, lp.z, 10 * (0.7 + c.pulse * 0.4));
      FOG.uFogLightColor.value[i + 1].setHex(c.d.accent);
    }
    // what they sing, heard close (a few meters here are a long way from the ship)
    g.audio.artifacts = lit.slice(0, 3).map((c) => ({ key: c.d.tx, d: c.d, dist: c.dist * 7, bearing: c.bearing, reveal: 1 }));
  }

  // how far, and which way, the ship is (for the HUD)
  ship() {
    const s = this.game.ship, p = this.p, dx = s.x - p.x, dz = s.z - p.z;
    return { dist: Math.hypot(dx, dz), bearing: angleDelta(p.yaw, Math.atan2(dx, dz)) };
  }
}
