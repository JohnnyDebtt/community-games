// The Seeker palette (sampled from the game's art, via the Seeker codex), extended the
// way the planet extends it: colors are used as they are (no linear conversion), since
// the renderer works directly in display space so the palette holds.
// Adapted from Soundings (TheSeekerGame/community-games, soundings/src/core/palette.js),
// MIT OR Apache-2.0.

export const P = {
  // Seeker gold and deepest shadow: the only yellowish thing in view is the Seeker.
  gold: 0xb9a87b, goldShadow: 0x6b6258, ink: 0x2d2e33, deepest: 0x0f0e16, white: 0xffffff,
  // Ice-cave stone
  stone0: 0x181c20, stone1: 0x20242a, stone2: 0x353e50, stone3: 0x4f5d73, stone4: 0x667389, stone5: 0x94a6b1,
  // Dark creature bodies
  body0: 0x181c20, body1: 0x262b32, body2: 0x313c43, body3: 0x3f4d5b, body4: 0x4f5d73, body5: 0xc2c9c9,
  // Pale shells
  shell0: 0x353b44, shell1: 0x465b7d, shell2: 0x627594, shell3: 0x7b92a9, shell4: 0x97acb0, shell5: 0xc2c9c9,
  // Minerals and snow
  snow0: 0x50607c, snow1: 0x758399, snow2: 0x94a6b1, snow3: 0xc4ced4, snow4: 0xedf0f1,
  // Cold luminescence (sparingly)
  glow0: 0x698f9b, glow1: 0x7bacbc, glow2: 0x91cbde, glow3: 0xd6edf5,
  // Tundra stone
  tundra0: 0x21252c, tundra1: 0x2a2f32, tundra2: 0x353e50, tundra3: 0x3e545b, tundra4: 0x4f7368, tundra5: 0x557c70, tundra6: 0x8ca893,
  // Moss, bark and earth
  moss0: 0x1c1d22, moss1: 0x353b44, moss2: 0x49573d, moss3: 0x61554c, moss4: 0x796e58, moss5: 0x6a7972, moss6: 0x779051, moss7: 0x8ca893,
  // Living accents
  olive: 0x696e49, lime: 0x8c9245, red: 0xad2e41, rust: 0xaf634b,
  // Atmospheric distance
  air0: 0x5d666d, air1: 0x6c7983, air2: 0x83909c, air3: 0x8d9faa, air4: 0xa1b2bb, air5: 0xb0c3cd, air6: 0xcfdde4, air7: 0xd4e6ec, air8: 0xf5fafd,
  // A character who stands apart
  apart0: 0x000000, apart1: 0x172808, apart2: 0x654170, apart3: 0x4c5c8c, apart4: 0x5b8399,
  void: 0x151515,
};

// The surface sky, sampled top to horizon from the game's Sky.png.
export const SKY_RAMP = [0x1f2738, 0x232d3f, 0x293347, 0x2e3a4f, 0x354358, 0x3d4c62, 0x46566d, 0x516178,
  0x5c6e83, 0x6a7d91, 0x7a8d9f, 0x8d9fae, 0xacbdc8, 0xbeced8, 0xd7e3ea, 0xe0eaef];

// Interface colors from the codex.
export const UI = {
  panel: 'rgba(4,6,10,0.92)', well: '#12151D', emptyWell: '#0B0D13', line: '#29303E',
  text: '#F0F2E8', muted: '#8A919E', disabled: '#454A4F', positive: '#ABE3D9', negative: '#E84D3D',
};

export const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
export const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
export function mixHex(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}
export function scaleHex(a, k) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (c((a >> 16) & 255) << 16) | (c((a >> 8) & 255) << 8) | c(a & 255);
}
// 0..1 floats from a hex

// ------------------------------------------------------------------ one palette for all
// Art from elsewhere (SEEKER NET's colorways) is mapped onto the game's palette.

export const GAME_PALETTE = [...new Set([
  ...Object.values(P), ...SKY_RAMP,
  0xf0f2e8, 0x8a919e, 0x454a4f, 0xabe3d9, 0xe84d3d, 0x29303e, 0x12151d, 0x0b0d13, 0xe3cf8e,
])];

function lin(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
// OKLab, for distances that look like distances
export function oklab(hexOrRgb) {
  const [r8, g8, b8] = Array.isArray(hexOrRgb) ? hexOrRgb : rgb(hexOrRgb);
  const r = lin(r8), g = lin(g8), b = lin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const _pal = GAME_PALETTE.map((h) => ({ h, lab: oklab(h) }));
const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * 1.15, (a[2] - b[2]) * 1.15);

// The nearest palette color to one color, as a hex.
const _near = new Map();
export function nearest(c) {
  const [r, g, b] = Array.isArray(c) ? c : rgb(c);
  const key = (r << 16) | (g << 8) | b;
  if (_near.has(key)) return _near.get(key);
  const lab = oklab([r, g, b]);
  let best = _pal[0], bd = Infinity;
  for (const p of _pal) {
    const d = dist(lab, p.lab);
    if (d < bd) { bd = d; best = p; }
  }
  _near.set(key, best.h);
  return best.h;
}
export const nearestRGB = (c) => rgb(nearest(c));

// A whole set of colors onto the palette, keeping colors that were distinct distinct
// (a highlight stays a highlight) where the palette has a near enough color to spare.
export function mapToPalette(colors) {
  const labs = colors.map((c) => oklab(c));
  const order = colors.map((c, i) => i).sort((a, b) => labs[a][0] - labs[b][0]);
  const taken = new Map();
  const out = new Array(colors.length);
  for (const i of order) {
    const ranked = _pal.map((p) => ({ p, d: dist(labs[i], p.lab) })).sort((a, b) => a.d - b.d);
    let pick = ranked[0];
    for (const r of ranked.slice(0, 6)) {
      const owner = taken.get(r.p.h);
      if (r.d > ranked[0].d + 0.05) break;
      if (!owner || dist(owner, labs[i]) < 0.035) { pick = r; break; }
    }
    if (!taken.has(pick.p.h)) taken.set(pick.p.h, labs[i]);
    out[i] = rgb(pick.p.h);
  }
  return out;
}
