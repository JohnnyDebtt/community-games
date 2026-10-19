import { CATCHABLE, SPECIES_BY_ID, RARITY } from './species.js';
import { ZONE, ZONES } from '../world/layout.js';
import { lineMax, mounts } from './research.js';
import { rng } from '../core/math.js';

// Field requests from Theorem: three small goals at a time, always in view, each paying
// Codex data. They point at what to try next (a species you have not recorded, a water
// you have not fished, a skill), so there is always a clear next thing to do.

const R = rng((Date.now() >>> 5) ^ 0x7e9);

const FIRST = [
  { kind: 'catches', goal: 1, reward: 3, text: 'Catch your first fish' },
  { kind: 'keep', goal: 1, reward: 2, text: 'Keep a fish in your pack' },
  { kind: 'species', goal: 2, reward: 4, text: 'Record 2 species', any: true },
];

export class Requests {
  constructor(game) {
    this.g = game;
  }

  get st() {
    const s = this.g.state;
    if (!s.requests) s.requests = [];
    if (!s.reqSeq) s.reqSeq = 1;
    if (!s.reqDone) s.reqDone = 0;
    return s;
  }

  get list() {
    return this.st.requests;
  }

  init() {
    const s = this.st;
    if (!s.requests.length && !s.reqDone && !s.stats.catches) {
      for (const r of FIRST) s.requests.push({ id: s.reqSeq++, n: 0, ...r, fresh: true });
    }
    while (s.requests.length < 3) this._add();
  }

  _reachable(sp) {
    const line = lineMax(this.g.state);
    return sp.depth[0] <= line - 2;
  }

  _zonesInReach() {
    const line = lineMax(this.g.state);
    return ZONES.filter((z) => z.dmin <= line - 4);
  }

  _make() {
    const s = this.st;
    const g = this.g;
    const have = new Set(s.requests.map((r) => r.kind + (r.sp || r.zone || '')));
    const options = [];
    const unrec = CATCHABLE.filter((sp) => !s.codex[sp.id] && this._reachable(sp) && sp.rarity !== 'legendary');
    if (unrec.length) {
      const sp = unrec[Math.floor(R() * unrec.length)];
      options.push([3, { kind: 'record', sp: sp.id, goal: 1, reward: RARITY[sp.rarity].data + 4, text: `Record a ${sp.name}` }]);
    }
    const zones = this._zonesInReach();
    if (zones.length) {
      const z = zones[Math.floor(R() * zones.length)];
      const n = 2 + Math.floor(R() * 3);
      options.push([2, { kind: 'zone', zone: z.id, goal: n, reward: 2 + n, text: `Catch ${n} fish in ${z.id === 'shallows' ? 'the Shallows' : z.name.replace(/^The /, 'the ')}` }]);
    }
    const caught = Object.keys(s.codex).map((id) => SPECIES_BY_ID[id]).filter((sp) => sp && !sp.observe);
    if (caught.length) {
      const sp = caught[Math.floor(R() * caught.length)];
      const cm = Math.round(sp.size[0] + (sp.size[1] - sp.size[0]) * 0.62);
      options.push([2, { kind: 'size', sp: sp.id, cm, goal: 1, reward: 6, text: `Land a ${sp.name} over ${cm} cm` }]);
    }
    options.push([2, { kind: 'perfect', goal: 2, reward: 4, text: 'Make 2 perfect catches' }]);
    options.push([1, { kind: 'streak', goal: 4, reward: 5, text: 'Land 4 in a row without a loss' }]);
    const phase = g.day.phase();
    if (phase !== 'night') options.push([1, { kind: 'phase', phase: 'night', goal: 1, reward: 4, text: 'Catch a fish at night' }]);
    if (phase !== 'dawn') options.push([1, { kind: 'phase', phase: 'dawn', goal: 1, reward: 4, text: 'Catch a fish at dawn' }]);
    if (g.companionProfile && g.state.odUsed) options.push([2, { kind: 'overdrive', goal: 1, reward: 3, text: `Fire ${g.companionProfile.od.name}` }]);
    if (mounts(s) > 0 && g.state.roster.length > 1) options.push([2, { kind: 'device', goal: 1, reward: 5, text: 'Land a fish your seekers hooked' }]);
    if (g.net.online) {
      options.push([1, { kind: 'spark', goal: 1, reward: 3, text: 'Take in a spark' }]);
      options.push([1, { kind: 'teeming', goal: 1, reward: 4, text: 'Catch a fish at a teeming hole' }]);
    }
    if (zones.length > 1) {
      const z = zones[1 + Math.floor(R() * (zones.length - 1))];
      options.push([1, { kind: 'drill', zone: z.id, goal: 1, reward: 2, text: `Drill a hole in ${z.name.replace(/^The /, 'the ')}` }]);
    }
    const free = options.filter(([, o]) => !have.has(o.kind + (o.sp || o.zone || '')));
    if (!free.length) return null;
    let sum = 0;
    for (const [w] of free) sum += w;
    let x = R() * sum;
    for (const [w, o] of free) { x -= w; if (x <= 0) return o; }
    return free[0][1];
  }

  _add() {
    const s = this.st;
    const r = this._make();
    if (!r) return;
    s.requests.push({ id: s.reqSeq++, n: 0, ...r, fresh: true });
  }

  // Something happened; move the requests along.
  event(kind, p = {}) {
    const s = this.st;
    for (const r of s.requests) {
      if (r.done) continue;
      let inc = 0;
      if (kind === 'catch') {
        if (r.kind === 'catches') inc = 1;
        if (r.kind === 'species' && p.isNew) inc = 1;
        if (r.kind === 'record' && p.sp.id === r.sp) inc = 1;
        if (r.kind === 'zone' && p.zone === r.zone) inc = 1;
        if (r.kind === 'size' && p.sp.id === r.sp && p.cm >= r.cm) inc = 1;
        if (r.kind === 'perfect' && p.clean) inc = 1;
        if (r.kind === 'phase' && p.phase === r.phase) inc = 1;
        if (r.kind === 'device' && p.fromDevice) inc = 1;
        if (r.kind === 'teeming' && p.teeming) inc = 1;
        if (r.kind === 'streak') r.n = Math.max(r.n, p.streak);
      } else if (kind === 'lost') {
        if (r.kind === 'streak') r.n = 0;
      } else if (kind === r.kind) {
        if (kind === 'drill') { if (p.zone === r.zone) inc = 1; } else inc = 1;
      } else if (kind === 'keep' && r.kind === 'keep') inc = 1;
      r.n += inc;
      if (r.n >= r.goal) this._complete(r);
    }
  }

  _complete(r) {
    const g = this.g;
    const s = this.st;
    r.done = true;
    s.reqDone++;
    s.data += r.reward;
    s.dataTotal += r.reward;
    g.audio.ui('request');
    const at = g.hud.reqs.getBoundingClientRect();
    setTimeout(() => g.hud.flyData(r.reward, { x: at.right - 20, y: at.top + 10 }), 250);
    setTimeout(() => {
      s.requests = s.requests.filter((x) => x !== r);
      this._add();
      g.save();
    }, 1600);
  }
}

export { ZONE };
