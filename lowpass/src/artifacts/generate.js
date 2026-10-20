import { rng, seedsFromHex, clamp, formatInt, formatNum } from '../core/math.js';
import { pitch } from '../core/tuning.js';

// What grows in the forest, from a 256-bit seed.
//
// Two kinds:
//   - wild: the ordinary artifacts, one every minute or two, each from a seed drawn by
//     the player's own browser, so nobody else will ever meet it;
//   - witnessed: when a SEEKER NET seeker moves on chain while you fly, the next artifact
//     is that move's, seeded by its transaction hash, so everyone who was flying then
//     meets the same one, and anyone can trace it to the chain. It is grander, and the
//     moved seeker shapes it legibly:
//       - its Floating Object chooses the family (most of the time),
//       - its Colorway chooses the light,
//       - the charge the move released sets its size,
//       - an activated seeker's move (rare) leaves its own likeness.
// Inside a family the seed decides the rest: counts, sequences, rules, proportions, the
// rhythm its light pulses to, the chord it hums (in the game's tuning, on 42 Hz), its name
// and the Codex's notes.
//
// Raise GENERATOR_VERSION when the output for a seed changes.

export const GENERATOR_VERSION = 3;

export const FAMILIES = ['ring', 'obelisk', 'orb', 'lattice', 'shell', 'crystal', 'tether', 'fungi', 'gate', 'solids', 'glyph', 'chimes', 'echo'];

const BY_OBJECT = {
  'Keyboard': 'lattice', 'Classic Keyboard': 'ring', 'Compact Keyboard': 'solids', 'Split Keyboard': 'crystal',
  'Numpad': 'obelisk', 'Mouse': 'fungi', 'Trackball': 'orb', 'Joystick': 'tether', 'Gamepad': 'gate',
  'Fader Deck': 'chimes', 'Dial Deck': 'glyph', 'Datasette': 'shell', 'Floppy Drive': 'orb', 'Codex Slate': 'glyph',
};

// the light a colorway gives: [color, strength]
const BY_COLORWAY = {
  Abyss: [0x7b92a9, 1.1], Ash: [0xd6edf5, 0.9], Bone: [0xedf0f1, 0.85], Camo: [0x8c9245, 1.1], Crimson: [0xad2e41, 1.4],
  'Deep Teal': [0x7bacbc, 1.1], Dune: [0xcfdde4, 0.9], Ember: [0xaf634b, 1.3], Frost: [0xd6edf5, 1.0], Glacier: [0x91cbde, 1.1],
  Lichen: [0x8ca893, 1.1], Mauve: [0x8f7aa8, 1.3], Moss: [0x779051, 1.2], Obsidian: [0xf5fafd, 0.8], Pewter: [0xb0c3cd, 0.9],
  Rust: [0xaf634b, 1.3], Sage: [0x8ca893, 1.0], Slate: [0x97acb0, 1.0], Spore: [0x8c9245, 1.2], Tide: [0x91cbde, 1.1],
};

const CODE = { ring: 'HNG', obelisk: 'OBL', orb: 'ORB', lattice: 'LTC', shell: 'SHL', crystal: 'CRY', tether: 'TTH', fungi: 'FNG', gate: 'GTE', solids: 'SLD', glyph: 'GLY', chimes: 'CHM', echo: 'ECH' };

const CLASS = {
  ring: 'Standing stones', obelisk: 'Monolith', orb: 'Suspended body', lattice: 'Array', shell: 'Shell', crystal: 'Mineral bloom',
  tether: 'Tether', fungi: 'Luminous grove', gate: 'Gate', solids: 'Polyhedra', glyph: 'Geoglyph', chimes: 'Resonator', echo: 'Effigy',
};

const NOUNS = {
  ring: ['Circle', 'Ring', 'Council', 'Choir', 'Henge', 'Crown'],
  obelisk: ['Needle', 'Spire', 'Stylus', 'Gnomon', 'Pillar', 'Monolith'],
  orb: ['Moon', 'Eye', 'Pearl', 'Lantern', 'Seed', 'Halo'],
  lattice: ['Field', 'Array', 'Orchard', 'City', 'Loom', 'Ledger'],
  shell: ['Shell', 'Spiral', 'Whorl', 'Coil', 'Ear', 'Chamber'],
  crystal: ['Bloom', 'Geode', 'Cluster', 'Thorn', 'Garden', 'Crown'],
  tether: ['Stake', 'Anchor', 'Tether', 'Nail', 'Spindle', 'Root'],
  fungi: ['Grove', 'Colony', 'Lanterns', 'Veil', 'Garden', 'Congregation'],
  gate: ['Gate', 'Arches', 'Passage', 'Throat', 'Corridor', 'Rings'],
  solids: ['Solids', 'Cage', 'Seed', 'Engine', 'Knot', 'Nest'],
  glyph: ['Glyph', 'Sign', 'Signature', 'Map', 'Writing', 'Figure'],
  chimes: ['Chimes', 'Organ', 'Pipes', 'Harp', 'Reeds', 'Bells'],
  echo: ['Effigy', 'Echo', 'Likeness', 'Witness', 'Sleeper', 'Statue'],
};
const ADJ = ['Hollow', 'Pale', 'Silent', 'Patient', 'Drowned', 'Sleeping', 'Unlit', 'Folded', 'Listening', 'Distant', 'Last',
  'Second', 'Inverted', 'Quiet', 'Slow', 'Cold', 'Borrowed', 'Forgotten', 'Waking', 'Nameless', 'Leaning', 'Humming',
  'Mirrored', 'Hidden', 'Breathing', 'Lesser', 'Unfinished', 'Kept', 'Returning', 'Seventh'];
const OF = ['of the Unlit Hour', 'of Tides', 'of Return', 'of the Thaw', 'of Small Hours', 'of Glass', 'of Patience',
  'of the Long Fog', 'of Low Light', 'of the Undertow', 'of Rime', 'of Departures', 'of the Quiet Band', 'of Thirst',
  'of Keeping', 'of the Second Sun', 'of Spores', 'of Weight', 'of Echoes', 'of the Unsaid'];
const NUMW = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-One'];

const FLAVOR = [
  'Frost does not settle on it.', 'The fog thins around it.', 'Warm to the scanner.', 'The nearest trees lean away.',
  'Moss grows only on its north faces.', 'Nothing in the Codex resembles it.', 'The scanner reads it twice.',
  'No tracks lead to it.', 'It is older than the trees around it.', 'It was not here on the last survey.',
  'Its light reaches farther than it should.', 'The compass turns slowly near it.', 'Cold enough to burn.',
  'Spores drift toward it, never away.', 'The ground beneath it is dry.', 'It answers the ship’s hum.',
  'Rime grows on it in lines.', 'Quieter than the forest.', 'The visor hesitates before naming it.',
];
const WITNESS_FLAVOR = ['It faces the way the seeker moved.', 'Every ship in the fog saw it rise.', 'The network’s aurora flickered as it formed.'];
const WILD_ORIGIN = [
  'No seeker moved for it. No other ship will find it.',
  'Unrecorded by the network; seen from this ship alone.',
  'The Codex holds no other record of it, anywhere.',
  'It grew where no one was looking, except you.',
  'Nothing on the chain explains it. Nothing needs to.',
];
const WILD_LIGHT = [0x91cbde, 0xd6edf5, 0x8ca893, 0x7bacbc, 0x97acb0, 0xcfdde4, 0x8f7aa8, 0xaf634b];

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43];
const FIB = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55];
const CA_RULES = [30, 45, 73, 90, 105, 110, 150, 182, 26, 18, 57, 62];
const POLY = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron'];
const POLY_N = { tetrahedron: 4, cube: 6, octahedron: 8, dodecahedron: 12, icosahedron: 20 };

// Euclidean rhythm: k hits spread over n steps
export function euclid(k, n, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i + rot) * k) % n < k ? 1 : 0);
  return out;
}

const SEQ = {
  primes: (n) => PRIMES.slice(0, n),
  'Fibonacci numbers': (n) => FIB.slice(1, n + 1),
  'harmonic series': (n) => Array.from({ length: n }, (_, i) => 1 / (i + 1)),
  'odd numbers': (n) => Array.from({ length: n }, (_, i) => 2 * i + 1),
  'squares': (n) => Array.from({ length: n }, (_, i) => (i + 1) * (i + 1)),
};

// A fresh seed for a wild artifact: 32 random bytes from this browser.
export function wildSeed() {
  return '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// move: a witnessed move { tx, block, tokens: [ids], charge, recipients, pool, time },
//   or a wild one { tx: wildSeed(), wild: true }
// seekerInfo(token) -> { traits: { 'Floating Object', Colorway, ... } } or null
export function describe(move, seekerInfo, force = null) {
  const wild = !!move.wild;
  const s = seedsFromHex(move.tx, 8);
  const R0 = rng(s[0]), R1 = rng(s[1] ^ 0x9e3779b9), R2 = rng(s[2] ^ 0x85ebca6b), R3 = rng(s[3] ^ 0xc2b2ae35);
  const tokens = wild ? [] : move.tokens && move.tokens.length ? move.tokens : [1 + (s[4] % 2222)];
  const lead = wild ? null : tokens[0];
  const info = !wild && seekerInfo ? seekerInfo(lead) : null;
  const traits = info ? info.traits : {};
  const charge = move.charge || 0;

  // family
  let family;
  if (!wild && move.pool === 'activated' && R0() < 0.7) family = 'echo';
  else if (traits['Floating Object'] && BY_OBJECT[traits['Floating Object']] && R0() < 0.65) family = BY_OBJECT[traits['Floating Object']];
  else family = FAMILIES[Math.floor(R0() * (FAMILIES.length - 1))];
  if (force) family = force;
  if (family === 'echo' && !info) family = 'obelisk';

  const [accent, strength] = BY_COLORWAY[traits.Colorway] || [R0.pick(WILD_LIGHT), 1];
  // witnessed artifacts stand larger: the network's moment
  const size = wild ? 0.8 + R0() * 0.35 : (0.85 + 0.55 * clamp(Math.log10(1 + charge) / 3.3, 0, 1)) * 1.2;
  const count = tokens.length;

  const d = {
    v: GENERATOR_VERSION, tx: move.tx, block: wild ? null : move.block, tokens, lead, family, accent, strength, size, count,
    pool: move.pool || 'dormant', charge, recipients: move.recipients || 0, time: move.time || null,
    seed: s, params: {}, traits, kind: wild ? 'wild' : 'witnessed', special: !wild,
  };
  const P = d.params;
  let structure = '';

  switch (family) {
    case 'ring': {
      P.n = R1.pick([3, 5, 7, 8, 11, 13]);
      P.seq = R1.pick(['primes', 'Fibonacci numbers', 'harmonic series', 'odd numbers']);
      P.radius = R1.range(13, 24) * size;
      P.height = R1.range(14, 24) * size;
      P.core = R1.pick(['orb', 'pit', 'flame', 'disc']);
      P.lean = R1.range(0, 0.18);
      P.lintels = R1.chance(0.35);
      structure = `${NUMW[P.n]} stones; their heights follow the ${P.seq}.`;
      break;
    }
    case 'obelisk': {
      P.sides = R1.pick([3, 4, 4, 5, 6]);
      P.height = R1.range(44, 72) * size;
      P.width = R1.range(4, 7) * size;
      P.twist = R1.chance(0.45) ? R1.range(0.4, 2.2) * (R1.chance(0.5) ? 1 : -1) : 0;
      P.float = R1.chance(0.4) ? R1.range(2, 7) : 0;
      P.seams = R1.int(1, P.sides);
      P.debris = R1.int(0, 2) * 6;
      P.marks = R1.pick(PRIMES.slice(2, 9));
      structure = `${NUMW[P.sides]} faces${P.twist ? ', turning as it rises' : ''}; ${P.marks} marks on its seam${P.float ? '; it does not touch the ground' : ''}.`;
      break;
    }
    case 'orb': {
      P.radius = R1.range(6, 12) * size;
      P.height = R1.range(30, 46) * size;
      P.shell = R1.pick(['cracked', 'pale', 'eye', 'banded']);
      P.rings = R1.int(1, 3);
      P.ratios = [1, R1.pick([2, 3]), R1.pick([3, 5])];
      P.tilts = [R1.range(0.2, 1.3), R1.range(0.2, 1.3), R1.range(0.2, 1.3)];
      P.column = R1.chance(0.5);
      structure = `${P.rings === 1 ? 'One ring turns' : `${NUMW[P.rings]} rings turn`} about it${P.rings > 1 ? `, in the ratio ${P.ratios.slice(0, P.rings).join(':')}` : ''}.`;
      break;
    }
    case 'lattice': {
      P.rule = R1.pick(CA_RULES);
      P.w = R1.pick([13, 15, 17, 19, 21]);
      P.h = R1.int(7, 12);
      P.spacing = R1.range(4.2, 5.6) * size;
      P.tall = R1.range(20, 32) * size;
      P.ramp = R1.chance(0.5);
      structure = `${P.w} by ${P.h} pillars: rule ${P.rule}, unfolded row by row from one lit cell.`;
      break;
    }
    case 'shell': {
      P.growth = R1.pick([1.618, 1.5, 1.414, 1.272, 2]);
      P.turns = R1.range(2.2, 3.4);
      P.radius = R1.range(16, 26) * size;
      P.tilt = R1.range(0.05, 0.45);
      P.bands = R1.int(5, 13);
      P.chambers = R1.chance(0.6);
      const g = { 1.618: 'φ', 1.5: '3/2', 1.414: '√2', 1.272: '√φ', 2: '2' }[P.growth];
      structure = `A whorl that grows by ${g} every quarter turn, ${P.turns.toFixed(1)} turns.`;
      break;
    }
    case 'crystal': {
      P.n = R1.pick([8, 13, 21, 34]);
      P.height = R1.range(28, 42) * size;
      P.spread = R1.range(0.55, 0.95);
      P.sides = R1.pick([4, 6, 6, 8]);
      structure = `${P.n} crystals, set at the golden angle, each a little shorter than the last.`;
      break;
    }
    case 'tether': {
      P.height = R1.range(32, 50) * size;
      P.vines = R1.int(2, 5);
      P.depth = R1.int(3, 4);
      P.roots = R1.int(3, 6);
      P.tilt = R1.range(0.02, 0.16);
      P.cage = R1.chance(0.6);
      structure = `A stake, ${P.vines} vines about it; its roots split in two, ${P.depth} times over.`;
      break;
    }
    case 'fungi': {
      P.n = R1.int(5, 13);
      P.height = R1.range(16, 30) * size;
      P.capShape = R1.pick(['dome', 'cone', 'plate', 'bell']);
      P.threads = R1.int(6, 14);
      structure = `${NUMW[P.n]} caps, the tallest at the center; threads of light join them underground.`;
      break;
    }
    case 'gate': {
      P.n = R1.pick([3, 5, 7]);
      P.radius = R1.range(16, 23);
      P.spacing = R1.range(46, 70);
      P.segments = R1.pick([5, 7, 11, 13]);
      P.legs = R1.chance(0.55);
      structure = `${NUMW[P.n]} rings of ${P.segments} segments, in a line. It lights where it is passed through.`;
      break;
    }
    case 'solids': {
      const k = R1.int(1, 3);
      const pool = POLY.slice();
      P.solids = [];
      for (let i = 0; i < k; i++) P.solids.push(pool.splice(Math.floor(R1() * pool.length), 1)[0]);
      P.radius = R1.range(7, 12) * size;
      P.height = R1.range(28, 44) * size;
      P.speeds = P.solids.map(() => R1.pick([1, 2, 3, 5]) * (R1.chance(0.5) ? 1 : -1));
      const art = (p) => `${'aeiou'.includes(p[0]) ? 'an' : 'a'} ${p}`;
      const txt = P.solids.slice().reverse().map(art).join(' within ');
      structure = `${txt[0].toUpperCase()}${txt.slice(1)}${k > 1 ? `, turning at ${P.speeds.map(Math.abs).join(':')}` : ', turning'}.`;
      break;
    }
    case 'glyph': {
      P.kind = R1.pick(['star', 'lissajous', 'rose', 'hilbert', 'phyllotaxis', 'circles']);
      P.radius = R1.range(34, 52) * size;
      if (P.kind === 'star') { P.n = R1.pick([5, 7, 9, 11, 12, 13]); P.k = R1.int(2, Math.floor((P.n - 1) / 2)); while (gcd(P.n, P.k) !== 1) P.k--; }
      if (P.kind === 'lissajous') { P.a = R1.int(1, 5); P.b = P.a + R1.int(1, 3); P.phase = R1.range(0, 1.5); }
      if (P.kind === 'rose') { P.k = R1.pick([2, 3, 4, 5, 7, 3 / 2, 5 / 3]); }
      if (P.kind === 'hilbert') P.order = R1.int(3, 4);
      if (P.kind === 'phyllotaxis') P.n = R1.pick([89, 144, 233]);
      if (P.kind === 'circles') P.n = R1.int(3, 7);
      P.stones = R1.chance(0.6);
      const desc = {
        star: () => `A star polygon {${P.n}/${P.k}} cut into the ground in light.`,
        lissajous: () => `A figure of two motions, ${P.a}:${P.b}, drawn in light across the clearing.`,
        rose: () => `A rose of ${P.k} petals${P.k % 1 ? ' that will not close' : ''}, drawn in light.`,
        hilbert: () => `One line that fills a square, folded ${P.order} times over itself.`,
        phyllotaxis: () => `${P.n} points of light at the golden angle.`,
        circles: () => `${NUMW[P.n]} circles, their radii in the harmonic series.`,
      };
      structure = desc[P.kind]();
      break;
    }
    case 'chimes': {
      P.n = R1.int(5, 11);
      P.height = R1.range(22, 32) * size;
      P.span = R1.range(18, 28) * size;
      P.arch = R1.chance(0.5);
      structure = `${NUMW[P.n]} tubes, their lengths one, a half, a third… of the first.`;
      break;
    }
    case 'echo': {
      P.scale = R1.range(0.42, 0.58) * size;     // meters per art pixel
      P.lean = R1.range(-0.12, 0.12);
      P.sunk = R1.range(0.05, 0.25);
      P.moss = R1.range(0.2, 0.55);
      structure = `The likeness of SEEKER #${lead}, ${Math.round(54 * P.scale)} meters tall, half sunk.`;
      break;
    }
  }

  // its rhythm (its light pulses to it) and its hum: a chord of two or three notes of
  // the palette, in the tuning of 42 Hz
  const n = R2.pick([5, 7, 8, 12, 13]);
  const k = Math.max(2, Math.min(n - 1, R2.int(2, Math.ceil(n * 0.6))));
  d.song = {
    pattern: euclid(k, n, R2.int(0, n - 1)), k, n,
    step: R2.pick([0.5, 0.5, 1 / 3, 1]),
    degrees: R2.pick([[0, 3], [0, 2, 3], [2, 4], [1, 3], [0, 4], [3, 6], [2, 3, 4], [0, 1, 3], [4, 6, 8], [0, 2]]),
    octave: R2.pick([1, 2, 2, 3]),
    timbre: R2.pick(['hum', 'hum', 'choir', 'hum']),
  };
  const hz = Math.round(pitch(d.song.degrees[0], d.song.octave));

  // name and notes
  const noun = R3.pick(NOUNS[family]);
  const adj = R3.pick(ADJ);
  let name;
  const numbered = { ring: P.n, crystal: P.n, gate: P.n, fungi: P.n, chimes: P.n }[family];
  const r = R3();
  if (numbered && r < 0.3) name = `The ${noun} of ${NUMW[numbered] || numbered}`;
  else if (r < 0.62) name = `The ${adj} ${noun}`;
  else name = `${adj} ${noun} ${R3.pick(OF)}`;
  d.name = name;
  d.code = `${CODE[family]}-${move.tx.slice(2, 6).toUpperCase()}`;
  d.cls = CLASS[family];
  let origin;
  if (wild) origin = R3.pick(WILD_ORIGIN);
  else {
    const who = tokens.length > 1 ? `SEEKER ${tokens.map((t) => '#' + t).join(', ')} moved together` : `SEEKER #${lead} moved`;
    const gave = charge > 0
      ? d.pool === 'activated'
        ? `, sharing ${formatNum(charge, 1)} charge among ${formatInt(d.recipients)} activated seekers`
        : `, releasing ${formatInt(charge)} charge to ${formatInt(d.recipients)} seekers`
      : '';
    origin = `Witnessed: it rose when ${who}${gave}, for every ship flying then.`;
  }
  d.notes = [
    structure,
    `Its light pulses ${k} of every ${n} steps; it hums near ${hz} Hz.`,
    R3.pick(wild ? FLAVOR : [...FLAVOR, ...WITNESS_FLAVOR]),
    origin,
  ];
  d.fund = hz;
  return d;
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
export { POLY_N, SEQ };
