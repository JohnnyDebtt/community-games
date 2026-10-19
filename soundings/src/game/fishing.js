import { clamp, damp, rng } from '../core/math.js';
import { candidates, jigMatch, rollSize } from './ecology.js';
import { jigStyle, toneOf } from './species.js';
import { depthAt, zoneWeights } from '../world/layout.js';
import { BEAT } from '../core/audio.js';

// One line through one hole, in four plain steps:
//
//   ready  sitting, lure up          hold the button: a meter runs down the depth
//   cast   holding                   release: the lure drops to that depth
//   wait   lure in the water         fish come to it on the sonar; tapping jigs it
//   bite   a fish took it            press the button to hook it
//   reel   the catch bar             hold to raise the bright band, let go to drop it;
//                                    keep the fish inside it to bring it up
//
// A tap in `ready` casts to the same depth as last time.

const R = rng((Date.now() & 0xffffff) ^ 0x5eed);

// How each kind of creature moves on the catch bar.
const MOTION = {
  smooth: { jump: 0.22, wander: 0.5, bias: 0 },
  dart: { jump: 0.6, wander: 0.85, bias: 0 },
  sinker: { jump: 0.35, wander: 0.55, bias: -0.25 },
  floater: { jump: 0.35, wander: 0.55, bias: 0.25 },
  mixed: { jump: 0.42, wander: 0.65, bias: 0 },
  heavy: { jump: 0.12, wander: 0.3, bias: -0.3 },
};
function motionOf(sp) {
  if (!sp) return 'heavy';
  const k = sp.model.kind;
  if (['pike', 'gar'].includes(k) || sp.tags.includes('school')) return 'dart';
  if (sp.bottom || ['ray', 'flat', 'sturgeon'].includes(k)) return 'sinker';
  if (sp.aurora || sp.tags.includes('bold')) return 'floater';
  if (['eel', 'angler', 'gulper'].includes(k)) return 'mixed';
  return 'smooth';
}

export class Fishing {
  constructor(game) {
    this.g = game;
    this.active = false;
    this.state = 'off';
    this.hole = null;
    this.marks = [];
    this.lureDepth = 0;
    this.targetDepth = 6;
    this.castPower = 0;
    this.bottom = 10;
    this.lineMax = 24;
    this.activity = 0;
    this.smooth = 0;
    this.jigLift = 0;
    this.hooked = null;
    this.game = null;           // the catch bar
    this.biteT = 0;
    this.strikeFlash = 0;
    this.listen = 0;
    this.listening = false;
    this._spawn = 1.5;
    this._moveRate = 0;
    this._markId = 1;
    this._castT = 0;
    this._castDir = 1;
  }

  maxReach() {
    return Math.max(0.6, Math.min(this.lineMax, this.bottom - 0.3));
  }

  begin(hole, opts = {}) {
    this.active = true;
    this.hole = hole;
    this.bottom = depthAt(hole.x, hole.z);
    this.lineMax = this.g.lineMax();
    this.marks = [];
    this.activity = 0;
    this.smooth = 0;
    this.listen = 0;
    this.listening = false;
    this.game = null;
    this.hooked = null;
    this.lureDepth = 0;
    if (opts.hooked) {
      this.lureDepth = this.targetDepth = Math.min(this.maxReach(), opts.hooked.depth ?? this.maxReach() * 0.6);
      this._hook(opts.hooked);
    } else {
      this.state = 'ready';
      this.targetDepth = clamp(this.g.lastDepth ?? Math.min(6, this.maxReach()), 0.6, this.maxReach());
    }
  }

  end() {
    this.active = false;
    this.state = 'off';
    this.hooked = null;
    this.game = null;
    this.marks = [];
    this.listening = false;
  }

  adjustDepth(dz) {
    if (this.state !== 'wait') return;
    this.targetDepth = clamp(this.targetDepth + dz, 0.4, this.maxReach());
  }
  setDepth(d) {
    this.targetDepth = clamp(d, 0.4, this.maxReach());
    if (this.state === 'ready') this.state = 'wait';
  }

  jig() {
    this.activity = Math.min(1.2, this.activity + 0.3);
    this.jigLift = 1;
  }

  update(dt, input) {
    if (!this.active) return;
    this._fx = null;
    this.strikeFlash = Math.max(0, this.strikeFlash - dt * 2);
    this.jigLift = Math.max(0, this.jigLift - dt * 2.6);

    // the lure follows the line (sinking fast, coming up slower)
    if (this.state === 'wait' || this.state === 'bite') {
      const diff = this.targetDepth - this.lureDepth;
      const speed = diff > 0 ? 8 + Math.min(10, diff * 0.4) : 5;
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
      this.lureDepth += step;
      this._moveRate = Math.abs(step) / Math.max(dt, 1e-4);
    } else {
      this._moveRate = 0;
    }
    this.activity *= Math.exp(-dt / 1.1);
    this.activity = Math.max(this.activity, Math.min(0.55, this._moveRate * 0.07));
    this.smooth = damp(this.smooth, this.activity, 2.2, dt);

    if (this.state === 'ready') this._ready(dt, input);
    else if (this.state === 'cast') this._cast(dt, input);
    else if (this.state === 'wait') this._wait(dt, input);
    else if (this.state === 'bite') this._bite(dt, input);
    else if (this.state === 'reel') this._reel(dt, input);

    for (const m of this.marks) this._mark(m, dt);
    this.marks = this.marks.filter((m) => m.alpha > 0);
  }

  // ------------------------------------------------------------------ casting
  _ready(dt, input) {
    if (input.pressed('action')) {
      this.state = 'cast';
      this._castT = 0;
      this.castPower = 0;
      this._castDir = 1;
    }
  }

  _cast(dt, input) {
    this._castT += dt;
    // the meter runs down the depth and back, until you let go
    this.castPower += this._castDir * dt / 1.3;
    if (this.castPower >= 1) { this.castPower = 1; this._castDir = -1; }
    if (this.castPower <= 0) { this.castPower = 0; this._castDir = 1; }
    if (!input.down('action')) {
      const reach = this.maxReach();
      // a quick tap casts to where you fished last
      const depth = this._castT < 0.22 ? this.targetDepth : Math.max(0.6, this.castPower * reach);
      this.targetDepth = clamp(depth, 0.6, reach);
      this.state = 'wait';
      this._spawn = 1.2;
      this.g.onCast(this.targetDepth);
    }
  }

  // ------------------------------------------------------------------ waiting
  _ctx() {
    return this.g.lureContext(this.hole, this.lureDepth, this);
  }

  _wait(dt, input) {
    const g = this.g;
    if (input.pressed('action')) this.jig();
    // reeling the lure all the way up lets you cast again
    if (this.lureDepth < 0.5 && this.targetDepth < 0.5) {
      this.state = 'ready';
      this.targetDepth = Math.max(0.6, g.lastDepth ?? 6);
      this.marks.forEach((m) => (m.phase = 'leave'));
      return;
    }
    // the Listener: only at the Drop, at night, deep and perfectly still
    const ctx = this._ctx();
    const deepNight = ctx.night > 0.6 && zoneWeights(this.hole.x, this.hole.z).drop > 0.45 && this.lureDepth > 118;
    if (deepNight && this.smooth < 0.03 && !g.listenerSeenTonight()) this.listen += dt;
    else this.listen = Math.max(0, this.listen - dt * (this.smooth > 0.1 ? 4 : 1.5));
    const was = this.listening;
    this.listening = this.listen > 10;
    if (this.listening && !was) g.onListener('rise');
    if (!this.listening && was) g.onListener('sink');
    if (this.listen > 38) {
      this.listen = 0;
      this.listening = false;
      g.onListener('recorded');
    }
    if (this.listening) {
      for (const m of this.marks) m.phase = 'leave';
      return;
    }
    // something heavy on the bottom, now and then: a lost seeker
    if (this.lureDepth > this.bottom - 0.9 && g.canRecover() && R() < dt / 150) {
      g.onBite(null);
      this._hook({ snag: true, depth: this.lureDepth });
      return;
    }
    // a quiet spell makes the next fish likelier: the sea is patient, and so are you
    const fx = g.fishFx(this.hole);
    this.quiet = (this.quiet || 0) + dt;
    this._spawn -= dt;
    if (this._spawn <= 0) {
      this._spawn = fx.frenzy ? 0.35 : 1;
      const live = this.marks.filter((m) => m.phase !== 'leave').length;
      if (live < (fx.frenzy ? 3 : 2) && this.lureDepth > 0.5 && Math.abs(this.lureDepth - this.targetDepth) < 2) {
        const c = candidates(ctx);
        const patience = 1 + Math.max(0, this.quiet - 8) / 6;
        let lambda = Math.min(0.5, 0.15 * c.sum) * patience * fx.bite;
        if (fx.frenzy) lambda = Math.max(lambda, 1.2);
        if (c.sum < 0.05 && this.quiet > 30 && g.onQuiet) g.onQuiet();
        if (c.list.length && R() < 1 - Math.exp(-lambda)) {
          let pick = c.list[0];
          if (fx.point) {
            // the rarest fish this water holds, unrecorded ones first
            const order = { legendary: 4, rare: 3, uncommon: 2, common: 1 };
            const score = (it) => order[it.sp.rarity] * 10 + (g.state.codex[it.sp.id] ? 0 : 25) + it.w;
            pick = c.list.slice().sort((a, b) => score(b) - score(a))[0];
          } else {
            let x = R() * c.sum;
            for (const it of c.list) { x -= it.w; if (x <= 0) { pick = it; break; } }
          }
          this._newMark(pick.sp, fx);
        }
      }
    }
    const biting = this.marks.find((m) => m.phase === 'circle' && m.interest >= 1);
    if (fx.warn && !biting) {
      const soon = this.marks.find((m) => m.phase === 'circle' && m.interest >= 0.78 && !m.warned);
      if (soon) { soon.warned = true; g.onBiteSoon(soon); }
    }
    if (biting) {
      this.quiet = 0;
      this.state = 'bite';
      this.biteFish = biting;
      this.biteT = (1.1 + (g.strikeBonus ? g.strikeBonus() : 0)) * (1 + fx.window);
      this.strikeFlash = 1;
      g.onBite(biting);
    }
  }

  _newMark(sp, fx = {}) {
    const reachFrac = clamp(this.lureDepth / Math.max(1, sp.depth[1]), 0, 1);
    let { cm, f } = rollSize(sp, fx.crescendo ? 0.86 + R() * 0.14 : R(), reachFrac);
    if (fx.crescendo) f = Math.max(f, 0.9);
    if (fx.size) cm = Math.round(cm * (1 + fx.size) * 10) / 10;
    const from = clamp(this.lureDepth + (R() < 0.7 ? 1 : -1) * (3 + R() * 7), 0.5, this.bottom - 0.2);
    this.marks.push({
      id: this._markId++, sp, cm, f, depth: from, phase: 'come', interest: 0, alpha: 0,
      patience: 10 + R() * 8, speed: (0.8 + R() * 0.9 + (1 - sp.power) * 0.6) * (fx.frenzy ? 3 : 1), off: (R() - 0.5) * 1.2, t: R() * 10,
    });
  }

  _mark(m, dt) {
    m.t += dt;
    const lure = this.lureDepth;
    if (m.phase === 'come') {
      m.alpha = Math.min(1, m.alpha + dt * 1.5);
      const tgt = lure + m.off;
      const d = tgt - m.depth;
      m.depth += Math.sign(d) * Math.min(Math.abs(d), m.speed * dt);
      if (Math.abs(d) < 0.8) m.phase = 'circle';
      m.patience -= dt * 0.5;
      if (m.patience <= 0) m.phase = 'leave';
    } else if (m.phase === 'circle') {
      m.alpha = Math.min(1, m.alpha + dt);
      m.depth = damp(m.depth, lure + m.off * 0.6 + Math.sin(m.t * 1.3) * 0.35, 2.5, dt);
      if (this.state === 'wait') {
        // every fish bites in time; one that likes how the lure moves bites sooner
        const match = jigMatch(m.sp, this.smooth);
        const shy = m.sp.jig[1] < 0.1;            // some only ever take a still lure
        const base = shy ? (match > 0.5 ? 0.3 : -0.08) : 0.2 + 0.3 * match;
        const fx = this._fx || (this._fx = this.g.fishFx(this.hole));
        m.interest += (base + 0.08 * (1 - m.sp.power)) * dt * (fx.frenzy ? 4 : Math.sqrt(fx.bite));
        if (this._moveRate > 1.5) m.interest -= 0.3 * dt;
        m.patience -= dt * (match > 0.5 ? 0.5 : 1);
        if (m.interest < -0.25 || m.patience <= 0) m.phase = 'leave';
        if (Math.abs(lure - m.depth) > 4) m.phase = 'leave';
      }
    } else {
      m.depth += (m.depth > lure ? 1 : -1) * 1.4 * dt;
      m.alpha -= dt * 0.7;
    }
    m.depth = clamp(m.depth, 0.3, this.bottom - 0.15);
  }

  _bite(dt, input) {
    this.biteT -= dt;
    const m = this.biteFish;
    if (input.pressed('action')) {
      this.marks = this.marks.filter((x) => x !== m);
      for (const o of this.marks) o.phase = 'leave';
      this._hook({ sp: m.sp, cm: m.cm, f: m.f, depth: this.lureDepth });
      this.g.onStrike(m);
      return;
    }
    if (this.biteT <= 0 || !m || m.alpha <= 0) {
      this.state = 'wait';
      if (m) {
        if (R() < 0.4) { m.phase = 'leave'; m.interest = 0; }
        else { m.interest = 0.45; m.patience = Math.max(m.patience, 5); }
      }
      this.g.onMissed();
    }
  }

  // ------------------------------------------------------------------ the catch bar
  _hook(fish) {
    const sp = fish.sp || null;
    const snag = !!fish.snag;
    const diff = snag ? 0.45 : clamp(sp.power * (0.55 + 0.65 * fish.f), 0.08, 1);
    const kind = motionOf(sp);
    const fx = this.g.fishFx(this.hole);
    this.hooked = { sp, cm: fish.cm, f: fish.f, depth: fish.depth ?? this.lureDepth, snag, fromDevice: fish.fromDevice || null };
    this.game = {
      diff, kind, m: MOTION[kind],
      fish: 0.35, fishV: 0, target: 0.5,
      zone: 0.2, zoneV: 0, zoneH: clamp((0.3 - diff * 0.09) * (1 + fx.band), 0.16, 0.62),
      progress: 0.3, clean: true, inside: false, beat: -1, t: 0, seconds: fx.second, held: 0,
    };
    this.state = 'reel';
    this.g.onHooked(this.hooked);
  }

  _reel(dt, input) {
    const G = this.game;
    const h = this.hooked;
    const fx = this.g.fishFx(this.hole);
    G.t += dt;
    G.held = Math.max(0, G.held - dt);
    // the fish: picks a new place on the beat, more often and farther when it is strong
    const beat = Math.floor(performance.now() / 1000 / (BEAT / 2));
    if (beat !== G.beat) {
      G.beat = beat;
      if (R() < 0.25 + G.diff * G.m.wander) {
        const jump = (R() - 0.5 + G.m.bias * 0.5) * 2 * (0.15 + G.m.jump * G.diff);
        G.target = clamp(G.fish + jump, 0.03, 0.97);
        if (G.m.bias) G.target = clamp(G.target + G.m.bias * 0.1, 0.03, 0.97);
      }
    }
    const speed = (0.9 + G.diff * 2.2 + (G.kind === 'dart' ? 1.4 : 0)) * Math.max(0.3, 1 + fx.fishSpeed);
    G.fishV = damp(G.fishV, (G.target - G.fish) * speed * 2.2, 5 + G.diff * 3, dt);
    G.fish = clamp(G.fish + G.fishV * dt, 0, 1);
    const zoneH = clamp(G.zoneH * (fx.frenzy ? 1.3 : 1), 0.16, 0.7);
    const half = zoneH / 2;
    if (fx.auto) {
      // Autoreel: the seeker plays the bar for you
      G.zone = damp(G.zone, clamp(G.fish, half, 1 - half), 14, dt);
      G.zoneV = 0;
    } else {
      // your band: rises while you hold, falls when you let go, and bounces on the floor
      const hold = input.down('action');
      G.zoneV += (hold ? 2.9 : -2.5) * dt;
      G.zoneV = clamp(G.zoneV, -1.6, 1.6);
      G.zone += G.zoneV * dt;
      if (G.zone < half) { G.zone = half; G.zoneV = Math.abs(G.zoneV) * 0.35; }
      if (G.zone > 1 - half) { G.zone = 1 - half; G.zoneV = 0; }
    }
    G.zoneHNow = zoneH;
    G.inside = Math.abs(G.fish - G.zone) < half || fx.auto;
    if (G.inside) G.progress += dt * (0.24 - G.diff * 0.07) * (1 + fx.reel) * (fx.auto ? 1.6 : 1);
    else if (!fx.lock && G.t > fx.grace) {
      G.progress -= dt * (0.15 + G.diff * 0.06) * Math.max(0.15, 1 + fx.drain);
      G.clean = false;
    } else G.clean = G.clean && fx.lock;
    // a second chance: the Sword holds it once
    if (G.progress <= 0 && G.seconds > 0) {
      G.seconds--;
      G.progress = 0.3;
      G.held = 1.2;
      this.g.onSecondChance();
    }
    // the fish comes up the line as you bring it in
    h.depth = Math.max(0.2, this.lureDepth * (1 - clamp(G.progress, 0, 1)));
    if (G.progress >= 1) {
      const caught = this.hooked;
      const clean = G.clean;
      this.hooked = null;
      this.game = null;
      this.state = 'landed';
      if (caught.snag) this.g.onRecovered(this.hole);
      else this.g.onLanded({ sp: caught.sp, cm: caught.cm, f: caught.f, fromDevice: caught.fromDevice, clean });
    } else if (G.progress <= 0) {
      const h0 = this.hooked;
      this.hooked = null;
      this.game = null;
      this.state = 'wait';
      this.g.onLost(h0 && h0.snag ? 'snag' : 'escaped', h0);
    }
  }

  // After a catch: sit ready to cast again.
  resume() {
    if (!this.active) return;
    this.state = 'ready';
    this.lureDepth = 0;
    this._spawn = 1.5;
  }

  get style() {
    return jigStyle(this.smooth);
  }

  tone(sp) {
    return toneOf(sp);
  }
}
