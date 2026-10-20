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
  return h;
}

// How thickly the forest grows here, 0..1.
export function forestDensity(x, z, h) {
  if (h < WATER + 1.2) return 0;
  let d = 0.62 + (fbm2(x * 0.0035 + 5.2, z * 0.0035 - 9.4, 3) - 0.5) * 1.5;
  // glades and bogs
  d *= smoothstep(0.2, 0.36, fbm2(x * 0.0082 - 3.3, z * 0.0082 + 11.1, 2));
  // thin near the shore, and on the high frost
  d *= smoothstep(WATER + 1.2, WATER + 6, h);
  d *= 1 - smoothstep(58, 80, h) * 0.75;
  return clamp(d, 0, 1);
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
