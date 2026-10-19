import { clamp } from '../core/math.js';
import { OVERDRIVES } from '../seekernet/traits.js';

// Your companion's Overdrive. It charges with every catch (more for rare and perfect
// ones) and with the charge SEEKER NET releases (sparks). When it is full, Q fires it at
// a hole (the first time, your seeker fires it by itself, to show you). A surge (your seeker moved on-chain, or you found one as it woke) fires it at
// double strength: twice as many catches, or twice as long.

export class Overdrive {
  constructor(game) {
    this.g = game;
    this.active = null;       // { id, left, total, secs, super }
  }

  get st() {
    const s = this.g.state;
    if (!s.od) s.od = { charge: 0 };
    return s.od;
  }
  get charge() {
    return this.st.charge;
  }

  profile() {
    return this.g.companionProfile;
  }

  ready() {
    return !!this.profile() && !this.active && this.charge >= 1;
  }

  // amount: a fraction of a full bar
  add(amount, why = '') {
    const p = this.profile();
    if (!p || this.active) return 0;
    const before = this.charge;
    const k = amount * (1 + p.mods.odRate);
    this.st.charge = clamp(before + k, 0, 1);
    if (before < 1 && this.st.charge >= 1) this.g.audio.ui('ready');
    return this.st.charge - before;
  }

  fire(superCharged = false) {
    const p = this.profile();
    if (!p || this.active) return false;
    if (!superCharged && this.charge < 1) return false;
    if (!superCharged) this.st.charge = 0;
    const od = p.od;
    const mul = (superCharged ? 2 : 1) * (1 + p.level * 0.1);
    this.active = {
      id: p.overdrive, super: superCharged,
      left: od.count ? Math.round(od.count * (superCharged ? 2 : 1)) : od.secs * mul,
      secs: !od.count,
    };
    this.active.total = this.active.left;
    this.g.onOverdrive(this.active, p);
    return true;
  }

  is(id) {
    return !!this.active && this.active.id === id;
  }

  leftText() {
    const a = this.active;
    if (!a) return '';
    return a.secs ? `${Math.ceil(a.left)} s` : `×${a.left}`;
  }
  activeFrac() {
    const a = this.active;
    return a ? clamp(a.left / a.total, 0, 1) : 0;
  }

  update(dt) {
    const a = this.active;
    if (!a || !a.secs) return;
    // the clock only runs while you are at a hole
    if (this.g.mode !== 'fish' && this.g.mode !== 'catch') return;
    a.left -= dt;
    if (a.left <= 0) this.end();
  }

  // A catch landed (or a fish was hooked, for the bite-shaping ones).
  used(kind) {
    const a = this.active;
    if (!a || a.secs) return;
    const counts = { autoreel: 'landed', prime: 'landed', crescendo: 'landed', point: 'hooked' };
    if (counts[a.id] !== kind) return;
    a.left -= 1;
    if (a.left <= 0) this.end();
  }

  end() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.g.onOverdriveEnd(a);
  }
}

export { OVERDRIVES };
