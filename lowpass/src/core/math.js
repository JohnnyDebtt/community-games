// Small deterministic math helpers shared by the world, the simulation and the UI.
// Adapted from Soundings (TheSeekerGame/community-games, soundings/src/core/math.js),
// MIT OR Apache-2.0.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
// Frame-rate independent exponential approach.
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const angleDelta = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

// Integer hash -> [0, 1).
export function hash1(n) {
  n = (n | 0) * 0x27d4eb2d;
  n ^= n >>> 15;
  n = Math.imul(n, 0x85ebca6b);
  n ^= n >>> 13;
  n = Math.imul(n, 0xc2b2ae35);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967296;
}
export function hash2(x, y) {
  return hash1(Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663));
}

// Seeded generator (mulberry32).
export function rng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (a, b) => a + (b - a) * next();
  next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  next.chance = (p) => next() < p;
  return next;
}

// Smooth 2D value noise in [0, 1].
export function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm2(x, y, octaves = 4) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(x, y) * amp;
    norm += amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 - 9.7;
    amp *= 0.5;
  }
  return sum / norm;
}
// Ridged noise in [0, 1]: sharp crests where the noise crosses its middle.
export function ridged2(x, y, octaves = 3) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise2(x, y) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    x = x * 2.11 - 5.3;
    y = y * 2.11 + 8.9;
    amp *= 0.5;
  }
  return sum / norm;
}

export const formatInt = (n) => Math.floor(n).toLocaleString('en-US');
export const formatNum = (n, d = 1) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

// 32-bit seeds from a hex string (a transaction hash): several independent streams.
export function seedsFromHex(hex, count = 8) {
  const h = hex.replace(/^0x/, '').padEnd(64, '0');
  const out = [];
  for (let i = 0; i < count; i++) out.push(parseInt(h.slice((i * 8) % 64, (i * 8) % 64 + 8), 16) >>> 0);
  return out;
}
