import { lerp } from '../core/math.js';

// A hull's shape, from a ship's design (designs.js). Every hull is the Seed's, changed:
// stretched at the nose and the tail, made rounder or squarer in section, and lengthened
// amidships by a whole number of bays (three meters each, between the galley and the
// bunk), which is where the larger ships keep their rooms. The cockpit and the galley sit
// where they always do, so the coffee, the Codex computer and the seat are the same in
// every ship.
//
// Local space: +z forward, +y up, the cabin floor at y = 0.

// the Seed's sections along z: [z, half width, half height, center y]
const SECTIONS = [
  [-11.2, 1.3, 1.0, 1.55], [-10.2, 2.3, 1.55, 1.5], [-8.6, 3.2, 2.05, 1.48], [-6, 3.95, 2.38, 1.45], [-2, 4.3, 2.52, 1.45],
  [2, 4.3, 2.52, 1.45], [5.2, 3.95, 2.35, 1.42], [7.6, 3.25, 2.02, 1.32], [9.6, 2.35, 1.55, 1.18], [11, 1.4, 1.0, 1.05],
  [11.9, 0.55, 0.45, 0.98], [12.25, 0.08, 0.08, 0.96],
];

function baseSection(z) {
  const S = SECTIONS;
  if (z <= S[0][0]) return S[0].slice(1);
  for (let i = 0; i < S.length - 1; i++) {
    if (z <= S[i + 1][0]) {
      const t = (z - S[i][0]) / (S[i + 1][0] - S[i][0]);
      const s = t * t * (3 - 2 * t);
      return [lerp(S[i][1], S[i + 1][1], s), lerp(S[i][2], S[i + 1][2], s), lerp(S[i][3], S[i + 1][3], s)];
    }
  }
  return S[S.length - 1].slice(1);
}

const ZI = -0.6;        // where the bays are let in (aft of the galley)
// the door: on the right (x < 0), between the Codex computer and the cockpit, from the
// floor up; the same place in every ship (its ramp: ship.js)
export const DOOR = { z0: 2.3, z1: 3.6, top: 2.2 };
const NOSE = 5.2;       // forward of this the nose stretches
const TAIL = -6;        // aft of this (on the Seed) the tail stretches

export class Hull {
  // h: { bays, nose, tail, pw, sy, band }
  constructor(h) {
    this.L = (h.bays || 0) * 3;
    this.nose = h.nose || 1;
    this.tail = h.tail || 1;
    this.pw = h.pw || 2.7;
    this.sy = h.sy || 1;
    this.band = h.band || [-0.24, 0.26];
    this.zMin = this.zOf(-11.2);
    this.zMax = this.zOf(12.25);
    // how much longer than the Seed (the chase camera stands back by it)
    this.extra = this.zMax - this.zMin - 23.45;
    // the ribs, every three meters from the windshield back
    this.ribs = [];
    for (let z = 3.8; z > this.zOf(-8.2) - 0.01; z -= 3) this.ribs.push(z);
    this.coreZ = this.zOf(-11.3);
    this.room = [ZI - this.L, ZI];
  }

  // a z on this hull, as the Seed's z it is shaped like
  toBase(z) {
    if (z > NOSE) return NOSE + (z - NOSE) / this.nose;
    if (z >= ZI) return z;
    if (z >= ZI - this.L) return ZI;
    const zb = z + this.L;
    return zb < TAIL ? TAIL + (zb - TAIL) / this.tail : zb;
  }

  // the Seed's z, on this hull (forward of the bays, or aft of them)
  zOf(zb) {
    if (zb > NOSE) return NOSE + (zb - NOSE) * this.nose;
    if (zb >= ZI) return zb;
    return (zb < TAIL ? TAIL + (zb - TAIL) * this.tail : zb) - this.L;
  }

  // aft of the bays, the Seed's things move back by them
  aft(z) { return z < ZI ? z - this.L : z; }

  section(z) {
    const [w, hh, yc] = baseSection(this.toBase(z));
    return [w, hh * this.sy, yc];
  }

  // a point on the hull at (z, angle): angle 0 = right, PI/2 = top
  hullPoint(z, a, scale = 1) {
    const [w, hh, yc] = this.section(z);
    const c = Math.cos(a), s = Math.sin(a), e = 2 / this.pw;
    const x = Math.sign(c) * Math.pow(Math.abs(c), e) * w * scale;
    let y = Math.sign(s) * Math.pow(Math.abs(s), e) * hh * scale;
    if (y < 0) y *= 0.82;
    return [x, yc + y, z];
  }

  // the door's panel: on the right, between its edges, from the floor to its top
  isDoor(z, a, scale = 1) {
    if (Math.cos(a) > -0.3 || z < DOOR.z0 || z > DOOR.z1) return false;
    const y = this.hullPoint(z, a, scale)[1];
    return y > -0.1 && y < DOOR.top;
  }

  // the windshield, and a band down each side at eye height, panes between the ribs
  isWindow(z, a) {
    const s = Math.sin(a), c = Math.cos(a), zb = this.toBase(z);
    if (zb > 5.4 && zb < 10.7 && s > (zb > 7.4 ? -0.46 : 0.0) && s < 0.93 + (zb > 8 ? 0.07 : 0)) return 'front';
    const z0 = this.zOf(-5.2);
    if (c < 0 && z > DOOR.z0 - 0.2 && z < DOOR.z1 + 0.2) return null;
    if (z > z0 && z < 4.2 && s > this.band[0] && s < this.band[1] && Math.abs(c) > 0.5) {
      const rz = ((z - z0) % 3.0 + 3.0) % 3.0;
      if (rz > 0.4 && rz < 2.85) return 'side';
    }
    return null;
  }
}
