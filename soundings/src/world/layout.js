import { TAU, clamp, lerp, smoothstep, fbm2, ringNoise, hash2 } from '../core/math.js';

// The map: a frozen sea in a crater on the planet's surface. Everything here is
// deterministic so every copy of the game has the same sea.
//
//   x east, z south, y up. The ice surface is y = 0. Depths are in meters.

export const SEA_R = 112;

export function shoreRadius(theta) {
  return SEA_R + (ringNoise(theta, 7, 1) - 0.5) * 26 + (ringNoise(theta, 19, 2) - 0.5) * 10;
}
export function shoreAt(x, z) {
  return shoreRadius(Math.atan2(z, x));
}

// Zones of the sea, each with its own depth and life.
export const ZONES = [
  { id: 'shallows', name: 'Capsule Shallows', x: 0, z: 64, sigma: 36, dmin: 3, dmax: 26 },
  { id: 'vents', name: 'The Vent Field', x: 66, z: -6, sigma: 25, dmin: 22, dmax: 62 },
  { id: 'reach', name: 'Glass Reach', x: -58, z: -12, sigma: 34, dmin: 38, dmax: 94 },
  { id: 'drop', name: 'The Drop', x: 6, z: -76, sigma: 25, dmin: 96, dmax: 150 },
];
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));

export function zoneWeights(x, z) {
  const w = {};
  let sum = 0;
  for (const zn of ZONES) {
    const dx = x - zn.x, dz = z - zn.z;
    const v = Math.exp(-(dx * dx + dz * dz) / (2 * zn.sigma * zn.sigma));
    w[zn.id] = v;
    sum += v;
  }
  w._sum = sum;
  return w;
}

export function dominantZone(x, z) {
  const w = zoneWeights(x, z);
  let best = ZONES[0], bv = -1;
  for (const zn of ZONES) if (w[zn.id] > bv) { bv = w[zn.id]; best = zn; }
  return best;
}

// Water depth under the ice at (x, z).
export function depthAt(x, z) {
  const r = Math.hypot(x, z);
  const rs = shoreAt(x, z);
  if (r >= rs) return 0;
  const n = fbm2(x * 0.028 + 3.1, z * 0.028 - 7.7, 4);
  const n2 = fbm2(x * 0.09 - 11, z * 0.09 + 5, 2);
  let sw = 0.12, sd = 0.12 * (20 + 40 * n);
  for (const zn of ZONES) {
    const dx = x - zn.x, dz = z - zn.z;
    const w = Math.exp(-(dx * dx + dz * dz) / (2 * zn.sigma * zn.sigma));
    const centre = Math.exp(-(dx * dx + dz * dz) / (2 * (zn.sigma * 0.7) ** 2));
    let f = clamp(0.25 + 0.5 * n + 0.45 * centre + (n2 - 0.5) * 0.18, 0, 1);
    if (zn.id === 'shallows') f = clamp(0.15 + 0.6 * smoothstep(100, 20, z) + (n - 0.5) * 0.4, 0, 1);
    sd += w * lerp(zn.dmin, zn.dmax, f);
    sw += w;
  }
  const d = sd / sw;
  const s = smoothstep(0, 26, rs - r);
  return Math.max(1.4, lerp(1.4, d, s));
}

// How clear (wind-scoured black ice) the surface is: high over deep water.
export function clearIceAt(x, z) {
  const w = zoneWeights(x, z);
  const base = w.reach * 1.1 + w.drop * 0.9;
  const n = fbm2(x * 0.045 + 40, z * 0.045 - 13, 3);
  return clamp(smoothstep(0.42, 0.62, n * 0.55 + base * 0.6), 0, 1);
}

// Open water kept from freezing by the vents.
export const POLYNYA = { x: 70, z: -2, r: 8.5 };
export function polynyaEdge(theta) {
  return POLYNYA.r + (ringNoise(theta, 9, 7) - 0.5) * 3.2;
}
export function inPolynya(x, z, margin = 0) {
  const dx = x - POLYNYA.x, dz = z - POLYNYA.z;
  return Math.hypot(dx, dz) < polynyaEdge(Math.atan2(dz, dx)) + margin;
}

// Land around the sea: shore, snowy hills, and the crater rim.
function ridged(x, z, oct = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(fbm2(x, z, 1) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    x = x * 2.07 + 31.7;
    z = z * 2.07 - 12.3;
    amp *= 0.5;
  }
  return sum / norm;
}

export function landHeight(x, z) {
  const r = Math.hypot(x, z);
  const rs = shoreAt(x, z);
  const t = r - rs;
  if (t < 0) return -1.5 + t * 0.05;
  const hills = fbm2(x * 0.018 + 8, z * 0.018 + 2, 4);
  const bumps = fbm2(x * 0.07, z * 0.07, 2);
  // rolling snow near the shore
  let h = 0.35 + t * 0.06 + smoothstep(4, 40, t) * (2 + 9 * hills) + bumps * smoothstep(2, 14, t) * 1.4;
  // the crater rim: jagged, ridged cliffs, farther out
  const rim = smoothstep(95, 175, t);
  h += rim * (12 + 18 * hills + 24 * ridged(x * 0.012 + 3, z * 0.012 - 5) + 7 * ridged(x * 0.05, z * 0.05, 2));
  h += smoothstep(190, 320, t) * 16;
  // a flat shelf for the capsule
  const cd = Math.hypot(x - CAPSULE.x, z - CAPSULE.z);
  const pad = smoothstep(14, 6, cd);
  h = lerp(h, CAPSULE.y, pad);
  return h;
}

export function groundHeight(x, z) {
  const r = Math.hypot(x, z);
  const rs = shoreAt(x, z);
  if (r < rs - 0.5) return 0;
  return Math.max(0, landHeight(x, z));
}

// Where the Seeker may walk: the ice, and the land up to the first hills.
export const WALK_LIMIT = 40;
export function walkable(x, z) {
  const r = Math.hypot(x, z);
  const rs = shoreAt(x, z);
  if (r - rs > WALK_LIMIT) return false;
  if (inPolynya(x, z, -0.2)) return false;
  return true;
}

const capTheta = Math.PI / 2;
const capR = shoreRadius(capTheta) + 9;
export const CAPSULE = { x: Math.cos(capTheta) * capR, z: Math.sin(capTheta) * capR, y: 1.1 };
export const START = { x: CAPSULE.x + 2.2, z: CAPSULE.z - 5.5 };
export const STARTER_HOLE = { x: CAPSULE.x + 1.5, z: shoreRadius(capTheta) - 15 };
export const TANK = { x: CAPSULE.x - 4.2, z: CAPSULE.z - 1.5 };

// Tether nodes: the Seeker's network, for quick travel once attuned.
export const TETHERS = [
  { id: 'home', name: 'Capsule', x: CAPSULE.x - 3.5, z: CAPSULE.z - 6 },
  { id: 'vents', name: 'Vent Field', x: 58, z: 12 },
  { id: 'reach', name: 'Glass Reach', x: -52, z: 2 },
  { id: 'drop', name: 'The Drop', x: -6, z: -66 },
];

// Fixed places of interest.
export const SHACK = { x: -30, z: -58, rot: 0.6 };
export const SHRINE = { x: 14, z: -88 };

// Rocks breaking through the ice, and pressure ridges where floes pushed together.
export const ROCKS = (() => {
  const out = [];
  const spots = [
    [-34, -36, 6.5], [-41, -31, 3], [-28, -42, 2.4], [38, 40, 4.5], [42, 35, 2], [-80, 30, 5], [-74, 36, 2.2],
    [24, -40, 3.5], [88, 30, 3], [-12, 22, 2.6], [52, -46, 4], [-90, -40, 3.5], [-60, -58, 2.5], [30, -100, 5],
  ];
  for (const [x, z, s] of spots) {
    if (Math.hypot(x, z) < shoreAt(x, z) - s - 2) out.push({ x, z, s });
  }
  return out;
})();

export const RIDGES = [
  { x0: -96, z0: 16, x1: -18, z1: -6, seed: 3 },
  { x0: 20, z0: -54, x1: 96, z1: -34, seed: 7 },
  { x0: -40, z0: -92, x1: -10, z1: -118, seed: 11 },
];

export function nearRidge(x, z, pad = 2.5) {
  for (const r of RIDGES) {
    const vx = r.x1 - r.x0, vz = r.z1 - r.z0;
    const L = Math.hypot(vx, vz);
    const t = clamp(((x - r.x0) * vx + (z - r.z0) * vz) / (L * L), 0, 1);
    const px = r.x0 + vx * t, pz = r.z0 + vz * t;
    if (Math.hypot(x - px, z - pz) < pad) return true;
  }
  return false;
}

export function blockedAt(x, z, radius = 0.4) {
  for (const r of ROCKS) if (Math.hypot(x - r.x, z - r.z) < r.s * 0.85 + radius) return true;
  if (nearRidge(x, z, 1.1 + radius)) return true;
  return false;
}

// Places where ice crystals grow (mineral spires), deterministic.
export const CRYSTALS = (() => {
  const out = [];
  for (let i = 0; i < 46; i++) {
    const a = hash2(i, 91) * TAU;
    const zn = ZONES[1 + (i % 3)];
    const rr = (0.3 + hash2(i, 92) * 1.1) * zn.sigma;
    const x = zn.x + Math.cos(a) * rr, z = zn.z + Math.sin(a) * rr;
    if (Math.hypot(x, z) > shoreAt(x, z) - 4) continue;
    if (inPolynya(x, z, 3)) continue;
    out.push({ x, z, s: 0.6 + hash2(i, 93) * 1.6, seed: i });
  }
  return out;
})();
