import * as THREE from 'three';
import { describe, wildSeed } from './generate.js';
import { buildArtifact } from './models.js';
import { SeekerModel } from '../companion/bot.js';
import { lookOf } from '../companion/companion.js';
import * as art from '../chain/art.js';
import { U } from '../render/materials.js';
import { FOG } from '../render/pipeline.js';
import { WATER, canopyTop } from '../world/terrain.js';
import { angleDelta, clamp, TAU, damp } from '../core/math.js';

// The artifacts in the forest: where each appears, the clearing it makes, its light in
// the fog and on the trees, its pulse, the scanner's lock and hold, and when it is left
// behind for good.
//
// A wild one (unique to this player) every minute or two, or, when seekers have moved
// while you fly, their witnessed artifacts (the same for everyone flying then;
// generate.js): one for each seeker that moved, all at once, so a sweep fills the fog
// ahead with them, spread out, more than one ship can scan before it has flown past.
//
// A lone artifact appears just beyond what the fog lets you see, close and nearly dead
// ahead, so it always comes out of the fog in front of you. Until you have seen it, it
// keeps ahead of the nose wherever you turn; once seen, it stays where it stands. Those
// of a sweep stand where they rose from the first. Everything materializes in the
// ordered dither, so nothing pops into view. The scanner looks at whichever of them is
// most nearly ahead. Once you have come near one and lost it from sight (or left one far
// behind), it goes back into the fog, dissolving the way it came: no turning back for it.
// A witnessed seeker looks as it is on the chain now: dormant ones dark by their stage,
// their battery for an eye; activated ones bright.

const SCAN_RANGE = 340;
const SCAN_CONE = 0.52;       // radians either side of the nose
const HOLD_CONE = 1.3;        // once a scan is under way and held, it holds on this far
const NEAR_CONE = 0.5;        // and close by (within 150 m) the cone opens by up to this
const SCAN_TIME = 2.4;        // seconds of holding
const FIRST_DELAY = 30;
const REVEAL_SECS = 2.6;
const SPACING = 95;           // meters at least between the artifacts of a sweep
const NEAR = 450;             // within this, an artifact has been come near
const FADE_SECS = 2.4;        // going back into the fog

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

  // those still to scan: built, not scanned, not left behind
  get open() {
    return this.active.filter((a) => !a.scanned && !a.passed && !a.building && a.model);
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

  // Bring one move (or a wild seed) into the forest now. opts: ahead/lateral (meters,
  // from the nose: placed and seen at once), at ({ x, z }: where it stands, for good),
  // far (meters: no nearer than this), family (development), quiet (no onAppear).
  async spawn(move, opts = {}) {
    const g = this.game;
    // a witnessed one is its seeker: the collection's art must be at hand
    if (!move.wild) { try { await art.loadMeta(); g.artReady = true; } catch { /* drawn from what there is */ } }
    const d = describe(move, (t) => g.seekerInfo(t), opts.family || null);
    const key = move.seed || move.tx;
    const a = {
      d, move, special: !!d.special, scanned: false, passed: false, fading: false, closest: Infinity, wave: !!opts.wave,
      look: opts.look || null, dist: Infinity, near: 0, clearings: [], pass: 0,
      revealed: !!opts.ahead || !!opts.at, reveal: 0, born: g.time, movedAt: g.time,
      spawnDist: opts.ahead ?? Math.max(this.spawnDistance(), opts.far || 0), at: opts.at || null,
      latK: d.family === 'gate' ? 0 : ((parseInt(key.slice(10, 14), 16) / 65535) * 2 - 1) * 0.16,
    };
    if (opts.lateral !== undefined) a.latK = opts.lateral / a.spawnDist;
    if (a.at) a.spawnDist = Math.hypot(a.at.x - g.ship.x, a.at.z - g.ship.z);
    if (d.family === 'echo' && !a.look && d.lead) a.look = (await this._looks([d.lead])).get(d.lead) || null;
    await this._build(a);
    this.active.push(a);
    if (this.onAppear && !opts.quiet) this.onAppear(a);
    return a;
  }

  // A sweep's artifacts, one for each seeker, all at once: spread over the fog ahead, no
  // two closer than SPACING, the nearest just past what can be seen. (A lone move is
  // spawned the usual way.) opts.far: the nearest no nearer than this.
  async spawnWave(moves, opts = {}) {
    if (moves.length === 1) { const a = await this.spawn(moves[0], { far: opts.far }); return [a]; }
    const g = this.game, ship = g.ship;
    const [fx, fz] = ship.forward();
    const near = Math.max(this.spawnDistance(), opts.far || 0);
    // a broad front, wider than the scanner can sweep in one pass: a choice of sides
    const deep = SPACING * (1.5 + moves.length * 0.5), wide = Math.min(380, 130 + moves.length * 30);
    const spots = [];
    for (let i = 0; i < moves.length; i++) {
      let best = null;
      for (let tries = 0; tries < 40; tries++) {
        const ahead = near + Math.random() * deep, lat = (Math.random() * 2 - 1) * wide;
        const gap = Math.min(...spots.map((p) => Math.hypot(p.ahead - ahead, p.lat - lat)), Infinity);
        if (!best || gap > best.gap) best = { ahead, lat, gap };
        if (gap >= SPACING) break;
      }
      spots.push(best);
    }
    spots.sort((p, q) => p.ahead - q.ahead);
    const x0 = ship.x, z0 = ship.z;
    // how each seeker is now, in one read for all of them
    const looks = await this._looks(moves.map((m) => m.tokens[0]));
    const out = [];
    for (let i = 0; i < moves.length; i++) {
      const { ahead, lat } = spots[i];
      const at = { x: x0 + fx * ahead + fz * lat, z: z0 + fz * ahead - fx * lat };
      out.push(await this.spawn(moves[i], { at, quiet: true, wave: true, look: looks.get(moves[i].tokens[0]) || null }));
      // one a frame or so, so building them never stops the flight
      await new Promise((r) => setTimeout(r, 0));
    }
    if (this.onWave) this.onWave(out);
    return out;
  }

  // How seekers are on the chain now (token -> look), in one read; a few seconds at most,
  // else they are seen bright (as activated).
  async _looks(ids) {
    try {
      const st = await Promise.race([this.game.chain.tokens(ids), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 5000))]);
      return new Map(st.map((x) => [x.token, lookOf(x)]));
    } catch { return new Map(); }
  }

  // (Re)build an artifact ahead of the ship's nose, at its distance.
  async _build(a) {
    const g = this.game, ship = g.ship, d = a.d;
    a.building = true;
    if (a.model) this._dispose(a);
    const [fx, fz] = ship.forward();
    const dist = a.spawnDist, lat = a.latK * dist;
    const x = a.at ? a.at.x : ship.x + fx * dist + fz * lat, z = a.at ? a.at.z : ship.z + fz * dist - fx * lat;
    const ground = Math.max(g.world.groundAt(x, z), WATER);
    const yaw = d.family === 'gate' ? ship.heading : (d.seed[2] / 4294967296) * TAU;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // a witnessed one: its seeker, giant, built from its art as it is now
    let seeker = null;
    if (d.family === 'echo' && d.lead) {
      seeker = new SeekerModel({ vox: d.params.scale, outside: true });
      const look = a.look && !a.look.activated ? { activated: false, stage: a.look.stage } : { activated: true };
      try { if (!(await seeker.build(d.lead, look))) seeker = null; } catch { seeker = null; }
    }
    const ctx = {
      ground: (lx, lz) => Math.max(g.world.groundAt(x + lx * c + lz * s, z - lx * s + lz * c), WATER) - ground,
      ringY: canopyTop(x, z) + 17 - ground,
      seeker,
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
      // come near and then lost from sight, or left far behind: back into the fog
      a.closest = Math.min(a.closest, a.dist);
      // (not the one being scanned while the scan goes on)
      const scanningThis = a === this.target && this.scan > 0;
      const lost = !scanningThis && Math.abs(a.bearing) > 1.6 && ((a.closest < NEAR && a.dist > 240) || a.dist > 700);
      if (lost && !a.passed && !a.scanned) {
        a.passed = true;
        if (this.onMissed) this.onMissed(a);
      }
      if (lost && !a.fading) a.fading = true;
      if (a.fading) {
        a.reveal -= dt / FADE_SECS;
        if (a.reveal <= 0) { this.remove(a); continue; }
      } else a.reveal = Math.min(1, a.reveal + dt / REVEAL_SECS);
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
      // and whatever is very far off goes at once
      if (a.dist > Math.max(1900, a.spawnDist + 500)) this.remove(a);
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
    // the scanner, on whichever is most nearly ahead (a radian off the nose counts as
    // 600 m); it keeps the one it holds while that one stays in its sights
    const open = this.open;
    const score = (a) => Math.abs(a.bearing) * 600 + a.dist;
    let t = null;
    for (const a of open) if (!t || score(a) < score(t)) t = a;
    // how far off the nose still counts: wider close by, and wider still once a scan is
    // under way and held, so flying right past one does not lose it
    const cone = (a, scanning) => (scanning ? HOLD_CONE : SCAN_CONE) + clamp(1 - a.dist / 150, 0, 1) * NEAR_CONE;
    const going = this.scan > 0 && scanHeld;
    const held = this.target && open.includes(this.target) && this.state === 'lock' && Math.abs(this.target.bearing) < cone(this.target, going) && this.target.dist < SCAN_RANGE + this.target.model.span * 0.5;
    if (held && t !== this.target && score(t) > score(this.target) - 150) t = this.target;
    if (t !== this.target) this.scan = 0;
    this.target = t;
    if (!t) {
      this.state = 'idle';
      this.scan = Math.max(0, this.scan - dt);
      return;
    }
    const inRange = t.dist < SCAN_RANGE + t.model.span * 0.5;
    const inCone = Math.abs(t.bearing) < cone(t, going && t === this.target);
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
      // lost for a moment, the progress lingers: it drains slowly, and comes back on
      this.scan = Math.max(0, this.scan - dt * 0.25);
    }
    ship.scanGlow = damp(ship.scanGlow, this.state === 'lock' && scanHeld ? 1 : 0, 8, dt);
  }

  // The world's origin moved: positions are recomputed every frame, nothing to do.
  shift() {}
}
