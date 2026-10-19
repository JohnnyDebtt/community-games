import { depthAt, groundHeight, inPolynya, polynyaEdge, POLYNYA, blockedAt, shoreAt, STARTER_HOLE, TANK, CAPSULE, TETHERS } from '../world/layout.js';
import { DAY_SECONDS } from '../world/daycycle.js';

// Holes in the ice. They skin over again in about a day unless something keeps them
// open: you fishing there, or a seeker whose gear keeps the water warm.

export const HOLE_R = 0.19;
const MAX = 24;

export class Holes {
  constructor(state) {
    this.state = state;
    if (!state.holes.length) {
      state.holes.push({ id: state.holeSeq++, x: STARTER_HOLE.x, z: STARTER_HOLE.z, freeze: 0, starter: true });
    }
    for (const h of state.holes) if (Math.hypot(h.x - STARTER_HOLE.x, h.z - STARTER_HOLE.z) < 0.05) h.starter = true;
    this.ripple = new Map();   // hole id -> 0..1
    this.glow = new Map();
    this.polynyaSpot = null;   // a temporary spot on the open water's edge
  }

  get list() {
    return this.state.holes;
  }

  byId(id) {
    return this.state.holes.find((h) => h.id === id) || (this.polynyaSpot && this.polynyaSpot.id === id ? this.polynyaSpot : null);
  }

  depth(h) {
    return depthAt(h.x, h.z);
  }

  nearest(x, z, max = 1.2) {
    let best = null, bd = max;
    for (const h of this.state.holes) {
      const d = Math.hypot(h.x - x, h.z - z);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  // Why a hole can't be drilled here (or null if it can).
  drillProblem(x, z) {
    if (groundHeight(x, z) > 0.01 || Math.hypot(x, z) > shoreAt(x, z) - 2.5) return 'Only on the ice';
    if (inPolynya(x, z, 1.4)) return 'Too close to open water';
    if (blockedAt(x, z, 0.6)) return 'Not here';
    for (const h of this.state.holes) if (Math.hypot(h.x - x, h.z - z) < 1.6) return 'Too close to another hole';
    if (Math.hypot(x - CAPSULE.x, z - CAPSULE.z) < 3) return 'Not here';
    if (Math.hypot(x - TANK.x, z - TANK.z) < 2) return 'Not here';
    for (const t of TETHERS) if (Math.hypot(x - t.x, z - t.z) < 1.2) return 'Not here';
    return null;
  }

  add(x, z) {
    const h = { id: this.state.holeSeq++, x, z, freeze: 0, day: this.state.day };
    this.state.holes.push(h);
    // too many: the oldest frozen hole without a device closes for good
    while (this.state.holes.length > MAX) {
      const devices = this.state.devices;
      const victims = this.state.holes.filter((o) => !devices[o.id] && !o.starter).sort((a, b) => b.freeze - a.freeze || a.id - b.id);
      if (!victims.length) break;
      this.remove(victims[0].id);
    }
    return h;
  }

  remove(id) {
    this.state.holes = this.state.holes.filter((h) => h.id !== id);
    delete this.state.devices[id];
  }

  // A fishing spot on the edge of the open water, where you are standing.
  polynyaSpotNear(x, z) {
    const dx = x - POLYNYA.x, dz = z - POLYNYA.z;
    const d = Math.hypot(dx, dz);
    const a = Math.atan2(dz, dx);
    const e = polynyaEdge(a);
    if (d < e - 0.2 || d > e + 1.3) return null;
    const r = e - 0.45;
    const spot = { id: -1, x: POLYNYA.x + Math.cos(a) * r, z: POLYNYA.z + Math.sin(a) * r, freeze: 0, open: true };
    this.polynyaSpot = spot;
    return spot;
  }

  update(dt, keepOpen) {
    // a hole skins over in about a day and a half; the one by the capsule is kept open
    const rate = dt / (DAY_SECONDS * 1.5);
    for (const h of this.state.holes) {
      if (h.starter || keepOpen(h)) h.freeze = Math.max(0, h.freeze - dt * 0.5);
      else h.freeze = Math.min(1, h.freeze + rate);
      const r = this.ripple.get(h.id) || 0;
      if (r > 0) this.ripple.set(h.id, Math.max(0, r - dt * 0.6));
    }
  }

  splash(id, amount = 1) {
    this.ripple.set(id, Math.min(1, (this.ripple.get(id) || 0) + amount));
  }

  // What the ice shader needs, nearest holes first.
  uniforms(cx, cz) {
    const list = this.state.holes.map((h) => ({
      x: h.x, z: h.z, r: HOLE_R, freeze: h.freeze, ripple: this.ripple.get(h.id) || 0, glow: this.glow.get(h.id) || 0,
      d: (h.x - cx) ** 2 + (h.z - cz) ** 2,
    }));
    list.sort((a, b) => a.d - b.d);
    return list;
  }
}
