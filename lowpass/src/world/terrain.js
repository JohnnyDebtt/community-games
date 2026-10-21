import { fbm2, ridged2, smoothstep, clamp } from '../core/math.js';

// The Fog Belt: an endless taiga on the planet's warm band, where the heat under the
// ice lets a forest grow and the steam it breathes never lifts. Rolling hills, frosted
// ridges, black lakes in the basins, and fog that pools in every low place.
//
// Everything here is a pure function of world position (in meters, as doubles), so the
// same forest stands in the same place for everyone and every session.

export const WATER = -46;           // lake level
export const CANOPY = 31;           // the tall trees' tops above the ground

export function height(x, z) {
  const a = fbm2(x * 0.00062 + 31.7, z * 0.00062 - 12.3, 4);
  let h = (a - 0.5) * 170;
  const r = ridged2(x * 0.0015 + 4.1, z * 0.0015 - 7.7, 3);
  h += r * 42 * smoothstep(0.38, 0.72, a);
  const b = fbm2(x * 0.00105 - 7.1, z * 0.00105 + 3.3, 3);
  h -= smoothstep(0.56, 0.74, b) * 52;
  h += (fbm2(x * 0.011, z * 0.011, 2) - 0.5) * 7;
  return h + lift(x, z);
}

// Rarer still (about a third as often as a turned stand, and larger: a range one to
// three kilometers across with its foothills), mountains: ridged peaks up to some 320
// meters over the forest, rising out of the fog. mountainEnv: how far into a range a
// place is (0 outside, its foothills low, 1 at its heart); mountain: its heart, for
// saying that one is in the mountains.
const mfield = (x, z) => fbm2(x * 0.0004 - 517.3, z * 0.0004 + 333.9, 3);
export function mountainEnv(x, z) {
  return smoothstep(0.62, 0.86, mfield(x, z));
}
export function mountain(x, z) {
  return smoothstep(0.77, 0.84, mfield(x, z));
}
function lift(x, z) {
  const env = mountainEnv(x, z);
  if (env <= 0) return 0;
  return 330 * env * env * (0.3 + 0.7 * ridged2(x * 0.0016 + 19.3, z * 0.0016 - 41.7, 4));
}

// How thickly the forest grows here, 0..1.
export function forestDensity(x, z, h) {
  if (h < WATER + 1.2) return 0;
  let d = 0.62 + (fbm2(x * 0.0035 + 5.2, z * 0.0035 - 9.4, 3) - 0.5) * 1.5;
  // glades and bogs
  d *= smoothstep(0.2, 0.36, fbm2(x * 0.0082 - 3.3, z * 0.0082 + 11.1, 2));
  // thin near the shore, and on the high frost; none above the treeline (the mountains')
  d *= smoothstep(WATER + 1.2, WATER + 6, h);
  d *= 1 - smoothstep(58, 80, h) * 0.75;
  d *= 1 - smoothstep(150, 215, h);
  return clamp(d, 0, 1);
}

// Now and then, a stand gone to autumn: birches turned gold among the dark spruces, the
// ground under them russet with fallen leaves. A smooth field over the world (0 to 1),
// the same for everyone: about one part in twenty of the forest, in stands a few hundred
// meters to a kilometer across, their edges turning over a couple of hundred.
export function autumn(x, z) {
  return smoothstep(0.73, 0.8, fbm2(x * 0.0006 + 211.7, z * 0.0006 - 87.3, 3));
}

// Which kind of tree: 0 spruce, 1 fir, 2 dead snag
export function treeKind(x, z, r) {
  const k = fbm2(x * 0.0027 + 77.3, z * 0.0027 - 41.2, 2);
  if (r < 0.022) return 2;
  if (k < 0.4) return 1;
  return 0;
}

// The tallest thing the ship must clear near (x, z): ground plus canopy.
export function canopyTop(x, z) {
  const h = height(x, z);
  return Math.max(h, WATER) + (h > WATER + 1 ? CANOPY : 0);
}
