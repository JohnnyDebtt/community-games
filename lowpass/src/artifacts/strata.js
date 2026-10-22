// The depths below the surface, each a stratum of its own: its light (three colors and a
// sheen that runs over its shells), its dark, how large what grows there stands, which
// forms and ornaments it has (each depth keeps the ones above it and adds its own), and
// the harmonic it adds to the voices (each depth one more of the root's harmonics, so the
// deeper the stranger the intervals they sing, always in the game's tuning).
// The first eight are drawn by hand; past them, every depth is made from its number,
// without end: hues turned by the golden angle, the sheen running faster, the names drawn
// from a list of their own.

const HAND = [
  // name, light, second, third, irid ramp, dark tint, sheen speed
  ['Gilt', 0xf2cf7a, 0xfff1c9, 0x3fa7a0, [0x7a5a2a, 0xe8c36a, 0xfff4d6], 0x1d1a17, 0],
  ['Nacre', 0x8ff0e0, 0xf6e9ff, 0x5aa0ff, [0x2d6f8f, 0x9ef7e6, 0xf7d9ff], 0x14202a, 0.02],
  ['Ember', 0xff6a3d, 0xffc66b, 0x9b3dff, [0x5a1018, 0xff5a36, 0xffd27a], 0x1a1012, 0.02],
  ['Aurora', 0x6dffb0, 0xb46dff, 0xff7ad9, [0x2a8f6a, 0x7d5cff, 0xff8ad6], 0x101826, 0.04],
  ['Ultraviolet', 0xc77dff, 0xff5ec4, 0xe8f7ff, [0x3a1a7a, 0xc77dff, 0xffe0ff], 0x120c1c, 0.06],
  ['Solar', 0xfff3c2, 0xffaa33, 0x4f7dff, [0xffaa33, 0xfff6dc, 0x6f9bff], 0x16120e, 0.05],
  ['Abyssal', 0x34f0ff, 0xff4fa8, 0x2b4dff, [0x0b2a6a, 0x34f0ff, 0xff7ac0], 0x070b14, 0.07],
  ['Prism', 0xf4f0ff, 0xff6f8f, 0x4fd8ff, [0xff4f6f, 0x4fff9f, 0x5f6fff], 0x0e0e14, 0.12],
];
const WORDS = ['Lumen', 'Vesper', 'Halcyon', 'Umbral', 'Seraphic', 'Cobalt', 'Argent', 'Oracular', 'Zenith', 'Nadir', 'Choral',
  'Mirage', 'Opaline', 'Saffron', 'Verdigris', 'Obsidian', 'Celestine', 'Ichor', 'Halo', 'Tidal', 'Cinder', 'Pearl', 'Vantablack', 'Iris'];

// the forms (and the depth that first has them), the ornaments likewise
export const FORMS = [['corolla', 1], ['spine', 1], ['nest', 1], ['armillary', 1], ['choir', 1], ['geode', 1], ['bloom', 1],
  ['knot', 2], ['nautilus', 2], ['archipelago', 2], ['murmuration', 3], ['medusa', 3], ['sun', 4], ['watcher', 4]];
// the mountains' own forms (deep.js draws from these for one that rises on a range)
export const MOUNTAIN_FORMS = [['spire', 1], ['temple', 1], ['halo', 1], ['loom', 1], ['storm', 2], ['serpent', 3], ['cathedral', 3]];
// the marked ones' own (+): the rarest at every depth, a few of them from the first
export const PLUS_FORMS = [['tree', 1], ['vortex', 1], ['mobius', 1], ['menger', 2], ['whale', 3]];
export const ORNAMENTS = [['halo', 1], ['sigil', 1], ['orbiters', 1], ['motes', 1], ['pillar', 2], ['beams', 2], ['shards', 2],
  ['rain', 3], ['veil', 4], ['twin', 5], ['skyring', 6], ['echoes', 7]];

// the harmonic each depth adds (of the root, as the palette's own are 16, 18, 19, 24, 28):
// a pure third, then the eleventh, the thirteenth, ... then every odd one past 31
const NEW_HARMONIC = [20, 22, 26, 17, 21, 23, 27, 29, 31];
export const harmonicOf = (d) => (d <= NEW_HARMONIC.length ? NEW_HARMONIC[d - 1] : 2 * d + 13);

export function roman(n) {
  if (n <= 0) return '0';
  const R = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, c] of R) while (n >= v) { s += c; n -= v; }
  return s;
}

function hsl(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

const _cache = new Map();
export function stratum(depth) {
  if (_cache.has(depth)) return _cache.get(depth);
  let s;
  if (depth <= HAND.length) {
    const [name, light, second, third, irid, dark, cycle] = HAND[depth - 1];
    s = { name, light, second, third, irid, dark, cycle };
  } else {
    const h = (0.13 + depth * 0.381966) % 1;
    const j = ((depth * 0.618034) % 1) * 0.08;
    s = {
      name: WORDS[(depth * 7) % WORDS.length] + (depth > 8 + WORDS.length ? ` ${roman(Math.floor((depth - 9) / WORDS.length) + 1)}` : ''),
      light: hsl(h, 0.9, 0.72), second: hsl((h + 0.33 + j) % 1, 0.95, 0.66), third: hsl((h + 0.58) % 1, 0.85, 0.6),
      irid: [hsl((h + 0.9) % 1, 0.8, 0.3), hsl(h, 0.95, 0.62), hsl((h + 0.45) % 1, 0.9, 0.82)],
      dark: hsl(h, 0.35, 0.07), cycle: Math.min(0.22, 0.06 + (depth - 8) * 0.012),
    };
  }
  Object.assign(s, {
    depth,
    title: `the ${s.name} Stratum`,
    numeral: roman(depth),
    // larger with every depth, without end, more slowly as it goes
    size: 1 + 0.45 * Math.log2(1 + depth),
    glow: Math.min(2.4, 1 + 0.14 * depth),
    veins: Math.min(1, 0.35 + depth * 0.12),
    forms: FORMS.filter(([, d]) => d <= depth).map(([f]) => f),
    mountainForms: MOUNTAIN_FORMS.filter(([, d]) => d <= depth).map(([f]) => f),
    plusForms: PLUS_FORMS.filter(([, d]) => d <= depth).map(([f]) => f),
    ornaments: ORNAMENTS.filter(([, d]) => d <= depth).map(([f]) => f),
    harmonics: Array.from({ length: depth }, (_, i) => harmonicOf(i + 1)),
  });
  _cache.set(depth, s);
  return s;
}
