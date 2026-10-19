import * as THREE from 'three';
import { clamp, hash1 } from '../core/math.js';
import { formatInt } from '../core/math.js';
import { groundHeight, shoreAt, inPolynya, CAPSULE, TANK } from '../world/layout.js';
import { Spark, Pillar, Bolt } from '../world/sparkfx.js';
import { SeekerBot } from '../actors/seekerbot.js';
import { ago } from '../ui/panels.js';

// SEEKER NET, felt on the sea. Everything here comes from what holders actually do
// on-chain, read from the public logs:
//
//   a move     anyone moving a seeker releases a quarter of its charge to the others:
//              it falls on the sea as a spark, near you. Take it in to charge your
//              Overdrive; the hole it punched teems with fish for a while.
//   your seeker moved   a seeker you have tuned moved: a surge, an Overdrive at double
//              strength (stored in it until you use it)
//   a watched one moved  its spark seeks you out and lands at your feet
//   activation a seeker woke: a pillar of light where it stands on the ice; find it to
//              tune it in, with a surge of its first light
//
// Moves are frequent (dozens a day), activations a few a day; anyone can tune any
// seeker, so what matters is what the seekers do, never who owns them.

const SPARK_LIFE = 240;          // seconds a spark waits on the ice
const CHARGED = 150;             // seconds its hole teems
const MAX_SPARKS = 4;

export class WorldEvents {
  constructor(game) {
    this.g = game;
    this.sparks = [];
    this.pillars = [];
    this.bolts = [];
    this.queue = [];               // sparks waiting to fall: { e, at, personal, past }
    this._v = new THREE.Vector3();
  }

  get st() {
    const s = this.g.state;
    if (!s.surges) s.surges = {};
    if (!s.beacons) s.beacons = [];
    return s;
  }

  cells(token) {
    return token ? Math.min(3, this.st.surges[token] || 0) : 0;
  }

  addCell(token) {
    const s = this.st;
    s.surges[token] = Math.min(3, (s.surges[token] || 0) + 1);
  }

  useCell(token) {
    const s = this.st;
    if (!s.surges[token]) return false;
    s.surges[token]--;
    if (!s.surges[token]) delete s.surges[token];
    return true;
  }

  // ------------------------------------------------------------------ from the chain
  onEvents(events, { initial }) {
    const g = this.g;
    const st = this.st;
    const roster = new Set(st.roster);
    const watch = new Set(st.watch || []);
    const now = Date.now();
    if (initial) {
      // since your last visit (a day at most): surges are stored, the latest moves fall
      // as sparks over the first minutes, and the latest seekers to wake stand waiting
      const mine = events.filter((e) => e.kind === 'move' && roster.has(e.token));
      for (const e of mine) this.addCell(e.token);
      if (mine.length) g.hint('surge_stored', 'Your seeker moved on-chain while you were away: a surge is stored in it. [Q] fires it at double strength.', 6500);
      const moves = events.filter((e) => e.kind === 'move' && e.charge > 0 && !roster.has(e.token));
      const watched = moves.filter((e) => watch.has(e.token)).slice(-2);
      const recent = moves.filter((e) => !watch.has(e.token)).slice(-3);
      let delay = 22;
      for (const e of watched) { this.queue.push({ e, at: g.time + delay, personal: true, past: true }); delay += 30; }
      for (const e of recent.reverse()) { this.queue.push({ e, at: g.time + delay, past: true }); delay += 45; }
      const woke = events.filter((e) => e.kind === 'activated' && !roster.has(e.token)).slice(-2);
      for (const e of woke) this.addBeacon(e.token, e.at, false);
      return;
    }
    let stagger = 0;
    for (const e of events) {
      if (e.kind === 'activated') {
        if (!roster.has(e.token)) this.addBeacon(e.token, e.at, true);
        continue;
      }
      if (roster.has(e.token)) {
        this.surge(e);
        continue;
      }
      if (e.charge > 0) {
        this.queue.push({ e, at: g.time + stagger, personal: watch.has(e.token) });
        stagger += 8;
      }
    }
  }

  // One of your tuned seekers moved on-chain.
  surge(e) {
    const g = this.g;
    const token = e.token;
    g.audio.boom();
    if (token === g.state.companion && g.companion && !g.overdrive.active) {
      const c = g.companion;
      this.bolts.push(new Bolt(g.scene, c.pos.x, c.pos.y + 0.5, c.pos.z));
      g.lights.push(this.bolts[this.bolts.length - 1].light);
      g.hud.flash();
      g.shake(1.2);
      g.hud.banner('SURGE', `#${token} moved on-chain`, 'glow', 2200);
      g.overdrive.fire(true);
      c.surge = 1;
    } else {
      this.addCell(token);
      g.hud.toast(`#${token} moved on-chain: a surge is stored`, 'net', 3500, { face: token });
    }
    g.save();
  }

  // ------------------------------------------------------------------ sparks
  spawnSpark(e, opts = {}) {
    const g = this.g;
    if (this.sparks.length >= MAX_SPARKS) {
      const old = this.sparks.shift();
      old.fx.dispose();
    }
    const spot = this._spot(opts.personal ? [2.4, 4] : [14, 30]);
    if (!spot) return;
    const big = e.charge >= 700;
    const fx = new Spark(g.scene, spot.x, spot.z, big);
    g.lights.push(fx.light);
    const amount = e.pool === 'activated' ? 0.5 : clamp(e.charge / 900, 0.25, 1) * (opts.personal ? 1.5 : 1);
    const s = { e, x: spot.x, z: spot.z, fx, big, amount, life: SPARK_LIFE, personal: !!opts.personal, landed: false };
    this.sparks.push(s);
    g.audio.sparkFall();
    g.hint('spark1', 'A seeker moved on-chain: its released charge fell as a spark. Walk into it, then fish the hole it opened.', 7000);
  }

  _spot([r0, r1]) {
    const g = this.g;
    const p = g.player.pos;
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = r0 + Math.random() * (r1 - r0);
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (groundHeight(x, z) > 0.02 || Math.hypot(x, z) > shoreAt(x, z) - 4) continue;
      if (inPolynya(x, z, 2)) continue;
      if (Math.hypot(x - CAPSULE.x, z - CAPSULE.z) < 4 || Math.hypot(x - TANK.x, z - TANK.z) < 3) continue;
      if (g.state.holes.some((h) => Math.hypot(h.x - x, h.z - z) < 1.8)) continue;
      return { x, z };
    }
    return null;
  }

  // Is this hole teeming (a spark opened it, a little while ago)?
  teeming(hole) {
    return !!(hole && hole.charged && hole.charged > Date.now());
  }

  // ------------------------------------------------------------------ seekers waking
  addBeacon(token, at, live) {
    const g = this.g;
    const st = this.st;
    if (st.beacons.some((b) => b.token === token)) return;
    const spot = this._spot([22, 48]);
    if (!spot) return;
    st.beacons.push({ token, at: at || Date.now(), x: spot.x, z: spot.z });
    while (st.beacons.length > 3) st.beacons.shift();
    this._syncPillars();
    if (live) {
      g.audio.wake();
      g.hud.banner(`#${token} WOKE`, 'follow the light', 'glow', 2400);
    }
    g.save();
  }

  _syncPillars() {
    const g = this.g;
    const want = this.st.beacons;
    for (const p of [...this.pillars]) {
      if (!want.some((b) => b.token === p.token)) {
        p.fx.dispose();
        if (p.bot) p.bot.dispose();
        this.pillars = this.pillars.filter((x) => x !== p);
      }
    }
    for (const b of want) {
      if (this.pillars.some((p) => p.token === b.token)) continue;
      const fx = new Pillar(g.scene, b.x, b.z);
      g.lights.push(fx.light);
      const pillar = { token: b.token, b, fx, bot: null };
      this.pillars.push(pillar);
      // the seeker itself, standing in its light
      const bot = new SeekerBot(g.scene, g.net);
      pillar.bot = bot;
      const prof = g.profileFor(b.token);
      bot.setToken(b.token, prof).then(() => bot.place(b.x + 0.6, b.z + 0.4, hash1(b.token) * 6.28)).catch(() => {});
    }
  }

  beaconNear(x, z, r = 2.2) {
    return this.st.beacons.find((b) => Math.hypot(b.x - x, b.z - z) < r) || null;
  }

  removeBeacon(token) {
    this.st.beacons = this.st.beacons.filter((b) => b.token !== token);
    this._syncPillars();
  }

  restore() {
    this._syncPillars();
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const g = this.g;
    const playing = g.mode === 'walk' || g.mode === 'fish' || g.mode === 'catch' || g.mode === 'drill';
    if (playing) {
      for (const q of [...this.queue]) {
        if (g.time >= q.at) {
          this.queue = this.queue.filter((x) => x !== q);
          this.spawnSpark(q.e, q);
        }
      }
    }
    const p = g.player.pos;
    for (const s of [...this.sparks]) {
      const r = s.fx.update(dt, g.frame);
      if (r === 'landed') {
        s.landed = true;
        g.audio.sparkLand();
        g.particles.emit(s.x, 0.05, s.z, 22, { color: 0xd6edf5, speed: 2.4, up: 2.6, life: 0.9 });
        g.particles.emit(s.x, 0.05, s.z, 12, { color: 0x94a6b1, speed: 1.6, up: 1.4 });
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < 30) g.shake(0.5 * (1 - d / 30));
        // it punches through the ice: a hole that teems for a while
        let hole = g.holes.nearest(s.x, s.z, 1.8);
        if (!hole) hole = g.holes.add(s.x, s.z);
        hole.charged = Date.now() + CHARGED * 1000;
        hole.freeze = 0;
        s.hole = hole;
        g.holes.splash(hole.id, 1);
      }
      if (s.landed && s.fx.phase === 'orb') {
        s.life -= dt;
        if (s.hole) g.holes.glow.set(s.hole.id, 0.5 + (g.frame % 6 < 3 ? 0.15 : 0));
        if (Math.hypot(s.x - p.x, s.z - p.z) < 1.25 && g.mode === 'walk') this.absorb(s);
        else if (s.life <= 0) this._remove(s);
      }
      if (r === 'gone') this._remove(s);
    }
    // teeming holes glow while they last
    for (const h of g.state.holes) {
      if (!h.charged) continue;
      if (h.charged < Date.now()) { delete h.charged; g.holes.glow.delete(h.id); continue; }
      if (!this.sparks.some((s) => s.hole === h)) g.holes.glow.set(h.id, 0.32 + (g.frame % 8 < 4 ? 0.08 : 0));
    }
    for (const pl of this.pillars) {
      pl.fx.update(dt, g.frame);
      if (pl.bot) {
        pl.bot.lookAt = g.player.pos;
        pl.bot.faceTowards(p.x, p.z, dt, 2);
        pl.bot.update(dt, g.frame, g.time);
      }
    }
    for (const b of [...this.bolts]) {
      if (b.update(dt)) {
        b.dispose();
        this.bolts = this.bolts.filter((x) => x !== b);
      }
    }
  }

  absorb(s) {
    const g = this.g;
    if (s.fx.phase !== 'orb') return;
    const p = g.player.pos;
    s.fx.absorb(this._v.set(p.x - s.x, 1.0, p.z - s.z));
    const got = g.overdrive.add(s.amount, 'spark');
    g.audio.sparkTake();
    g.hud.flash();
    const head = this._v.set(p.x, p.y + 1.9, p.z);
    if (g.companionProfile) g.hud.floatAtWorld(head, `#${s.e.token} · ${formatInt(s.e.charge)}`, { color: 'var(--ice)', icon: 'bolt', tint: '#d6edf5', rise: 18 });
    else {
      g.state.data += 2;
      g.state.dataTotal += 2;
      g.hud.floatAtWorld(head, '+2 data', { color: 'var(--gold2)', icon: 'data' });
    }
    g.particles.emit(s.x, 0.8, s.z, 16, { color: 0xd6edf5, speed: 1.2, up: 1.2 });
    g.requests && g.requests.event('spark');
  }

  _remove(s) {
    s.fx.dispose();
    this.sparks = this.sparks.filter((x) => x !== s);
  }

  marks() {
    const out = [];
    for (const s of this.sparks) if (s.landed && s.fx.phase === 'orb') out.push({ text: `#${s.e.token}`, x: s.x, z: s.z, cls: 'spark', icon: 'bolt', dist: true });
    for (const b of this.st.beacons) out.push({ text: `#${b.token}`, x: b.x, z: b.z, cls: 'spark', icon: 'beacon', dist: true });
    for (const h of this.g.state.holes) if (h.charged && h.charged > Date.now() && !this.sparks.some((s) => s.hole === h)) out.push({ text: 'teeming', x: h.x, z: h.z, cls: 'mark', icon: 'fish', dist: true });
    return out;
  }

  // A spark for testing (?dev): window.__spark(charge, personal)
  test(charge = 600, personal = false) {
    this.spawnSpark({ token: 1 + Math.floor(Math.random() * 2222), charge, recipients: 2190, pool: 'dormant', at: Date.now() }, { personal });
  }
}
