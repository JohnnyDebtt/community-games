import { rng, seedsFromHex, clamp, formatInt, formatNum } from '../core/math.js';
import { pitch } from '../core/tuning.js';
import { keccak256, toHex } from '../core/keccak.js';
import { describeDeep } from './deep.js';

// What grows in the forest, from a 256-bit seed.
//
// Two kinds:
//   - wild: the ordinary artifacts, one every minute or two, each from a seed drawn by
//     the player's own browser, so nobody else will ever meet it; about one in seven is
//     grand (larger, a column of its own light over it);
//   - witnessed: when a SEEKER NET seeker moves on chain while you fly, the next artifact
//     is that move's, seeded by its transaction hash, so everyone who was flying then
//     meets the same one, and anyone can trace it to the chain. It is the seeker that
//     moved, itself, giant, hovering over a figure drawn in light on the forest floor:
//       - its own art makes it (2,222 seekers, 2,222 likenesses),
//       - its Colorway chooses the light,
//       - the charge the move released sets its size.
//     When several seekers move in one transaction (a sweep), each gets its own, seeded
//     by the transaction and its token, and they rise together.
// Inside a family the seed decides the rest: counts, sequences, rules, proportions, the
// rhythm its light pulses to, the chord it hums (in the game's tuning, on 42 Hz), its name
// and the Codex's notes.
// A wild one may come from below the surface (move.depth, one or more: the scanner's
// reach decides how often, progress.js): then it is a deep one, a form of its depth's
// stratum (deep.js), larger and stranger the deeper it is.
//
// Raise GENERATOR_VERSION when the output for a seed changes.

export const GENERATOR_VERSION = 5;

// (echo, the witnessed seeker, stays last: a wild one is never drawn from it)
export const FAMILIES = ['ring', 'obelisk', 'orb', 'lattice', 'shell', 'crystal', 'tether', 'fungi', 'gate', 'solids', 'glyph', 'chimes',
  'beacon', 'orrery', 'helix', 'tesseract', 'wreck', 'stair', 'arbor', 'pool', 'sentinel', 'swarm', 'cradle', 'lanterns', 'dish', 'echo'];

// the light a colorway gives: [color, strength]
const BY_COLORWAY = {
  Abyss: [0x7b92a9, 1.1], Ash: [0xd6edf5, 0.9], Bone: [0xedf0f1, 0.85], Camo: [0x8c9245, 1.1], Crimson: [0xad2e41, 1.4],
  'Deep Teal': [0x7bacbc, 1.1], Dune: [0xcfdde4, 0.9], Ember: [0xaf634b, 1.3], Frost: [0xd6edf5, 1.0], Glacier: [0x91cbde, 1.1],
  Lichen: [0x8ca893, 1.1], Mauve: [0x8f7aa8, 1.3], Moss: [0x779051, 1.2], Obsidian: [0xf5fafd, 0.8], Pewter: [0xb0c3cd, 0.9],
  Rust: [0xaf634b, 1.3], Sage: [0x8ca893, 1.0], Slate: [0x97acb0, 1.0], Spore: [0x8c9245, 1.2], Tide: [0x91cbde, 1.1],
};

const CODE = {
  ring: 'HNG', obelisk: 'OBL', orb: 'ORB', lattice: 'LTC', shell: 'SHL', crystal: 'CRY', tether: 'TTH', fungi: 'FNG', gate: 'GTE', solids: 'SLD', glyph: 'GLY', chimes: 'CHM', echo: 'ECH',
  beacon: 'BCN', orrery: 'ORR', helix: 'HLX', tesseract: 'TSR', wreck: 'DRL', stair: 'ASC', arbor: 'ARB', pool: 'MRR', sentinel: 'SNT', swarm: 'SWM', cradle: 'CRD', lanterns: 'LNT', dish: 'ANT',
};

const CLASS = {
  ring: 'Standing stones', obelisk: 'Monolith', orb: 'Suspended body', lattice: 'Array', shell: 'Shell', crystal: 'Mineral bloom',
  tether: 'Tether', fungi: 'Luminous grove', gate: 'Gate', solids: 'Polyhedra', glyph: 'Geoglyph', chimes: 'Resonator', echo: 'Witnessed seeker',
  beacon: 'Beacon', orrery: 'Orrery', helix: 'Helix', tesseract: 'Hypersolid', wreck: 'Derelict', stair: 'Ascent', arbor: 'Elder growth',
  pool: 'Mirror', sentinel: 'Sentinels', swarm: 'Swarm', cradle: 'Cradle', lanterns: 'Lanterns', dish: 'Listening post',
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
  echo: ['Likeness', 'Vision', 'Echo', 'Apparition', 'Witness', 'Return'],
  beacon: ['Beacon', 'Lamp', 'Lighthouse', 'Warden', 'Watch', 'Signal'],
  orrery: ['Orrery', 'Model', 'Clockwork', 'System', 'Astrolabe', 'Heavens'],
  helix: ['Helix', 'Ladder', 'Strand', 'Twist', 'Code', 'Thread'],
  tesseract: ['Shadow', 'Cell', 'Fold', 'Solid', 'Engine', 'Figure'],
  wreck: ['Hull', 'Wreck', 'Husk', 'Keel', 'Lander', 'Vessel'],
  stair: ['Stair', 'Ascent', 'Steps', 'Climb', 'Way', 'Landing'],
  arbor: ['Tree', 'Arbor', 'Elder', 'Crown', 'Canopy', 'Bough'],
  pool: ['Mirror', 'Pool', 'Lens', 'Still', 'Well', 'Basin'],
  sentinel: ['Sentinels', 'Watchers', 'Wardens', 'Keepers', 'Elders', 'Mourners'],
  swarm: ['Swarm', 'Flock', 'Shoal', 'Murmuration', 'Host', 'Drift'],
  cradle: ['Cradle', 'Hand', 'Nest', 'Ribs', 'Clutch', 'Egg'],
  lanterns: ['Lanterns', 'Lights', 'Vigil', 'Procession', 'Host', 'Wake'],
  dish: ['Array', 'Ear', 'Dish', 'Listener', 'Antenna', 'Station'],
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
const WITNESS_FLAVOR = ['It faces the way the seeker moved.', 'Every ship in the fog saw it rise.', 'The network’s aurora flickered as it formed.',
  'The seeker’s picture hangs over it, in light.', 'Its light is the color of the seeker that moved.'];
const GRAND = ['A grand one: few as large are ever found.', 'A grand one: its light stands over it in a column.', 'Larger than any the Codex has on record nearby.'];
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

// One of a sweep's seekers (several in one transaction) has its own seed: the
// transaction and its token, hashed; and its own key, to keep it by in the Codex.
export function sweepSeed(tx, token) {
  return '0x' + toHex(keccak256(new TextEncoder().encode(`${tx.toLowerCase()}:${token}`)));
}

// move: a witnessed move { tx, block, tokens: [ids], charge, recipients, pool, time,
//   total (seekers that moved in that transaction), seed?, key? }, or a wild one
//   { tx: wildSeed(), wild: true }
// seekerInfo(token) -> { traits: { 'Floating Object', Colorway, ... } } or null
export function describe(move, seekerInfo, force = null) {
  const wild = !!move.wild;
  const seedHex = move.seed || move.tx;
  const s = seedsFromHex(seedHex, 8);
  const R0 = rng(s[0]), R1 = rng(s[1] ^ 0x9e3779b9), R2 = rng(s[2] ^ 0x85ebca6b), R3 = rng(s[3] ^ 0xc2b2ae35);
  const tokens = wild ? [] : move.tokens && move.tokens.length ? move.tokens : [1 + (s[4] % 2222)];
  const lead = wild ? null : tokens[0];
  const info = !wild && seekerInfo ? seekerInfo(lead) : null;
  const traits = info ? info.traits : {};
  const charge = move.charge || 0;

  // family: a witnessed artifact is the seeker itself
  let family = wild ? FAMILIES[Math.floor(R0() * (FAMILIES.length - 1))] : 'echo';
  if (force) family = force;
  if (family === 'echo' && !lead) family = 'obelisk';

  const [accent, strength] = BY_COLORWAY[traits.Colorway] || [R0.pick(WILD_LIGHT), 1];
  // witnessed artifacts stand larger: the network's moment; a grand wild one too
  const grand = wild && R0() < 0.14;
  const size = wild ? (0.8 + R0() * 0.35) * (grand ? 1.45 : 1) : (0.85 + 0.55 * clamp(Math.log10(1 + charge) / 3.3, 0, 1)) * 1.2;
  const count = tokens.length;

  const depth = wild ? Math.max(0, Math.floor(move.depth || 0)) : 0;
  const d = {
    v: GENERATOR_VERSION, tx: move.tx, key: move.key || move.tx, total: move.total || tokens.length, block: wild ? null : move.block, tokens, lead, family, accent, strength, size, count,
    pool: move.pool || 'dormant', charge, recipients: move.recipients || 0, time: move.time || null,
    seed: s, params: {}, traits, kind: wild ? 'wild' : 'witnessed', special: !wild, grand, depth, glimpse: !!move.glimpse,
  };
  const P = d.params;
  let structure = '';
  if (depth >= 1) describeDeep(d, move, R1, R3);

  if (depth < 1) switch (family) {
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
      Object.assign(P, glyphParams(R1, size));
      structure = glyphText(P);
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
    case 'beacon': {
      P.height = R1.range(34, 52) * size;
      P.sides = R1.pick([6, 8, 8, 12]);
      P.courses = R1.int(5, 9);
      P.beams = R1.pick([1, 1, 2, 3]);
      P.period = R1.pick([8, 10, 12, 16]);
      P.dir = R1.chance(0.5) ? 1 : -1;
      P.gallery = R1.chance(0.6);
      structure = `A tower of ${NUMW[P.courses].toLowerCase()} courses; ${P.beams === 1 ? 'one beam turns' : `${NUMW[P.beams].toLowerCase()} beams turn`} once every ${P.period} seconds.`;
      break;
    }
    case 'orrery': {
      P.n = R1.int(3, 6);
      P.law = R1.pick(['doubling', 'Titius–Bode law', 'harmonic series']);
      const r0 = R1.range(5.5, 7.5) * size;
      P.radii = Array.from({ length: P.n }, (_, i) => r0 * (P.law === 'doubling' ? Math.pow(1.55, i) : P.law === 'harmonic series' ? 1 + i * 0.9 : (0.4 + 0.3 * Math.pow(2, i)) / 0.7));
      const big = P.radii[P.n - 1];
      if (big > 30 * size) P.radii = P.radii.map((r) => (r * 30 * size) / big);
      P.height = R1.range(24, 32) * size;
      P.sizes = P.radii.map(() => R1.range(1.3, 2.8) * size);
      P.moons = P.radii.map(() => (R1.chance(0.35) ? R1.int(1, 2) : 0));
      P.rings = P.radii.map(() => R1.chance(0.2));
      structure = `${NUMW[P.n]} bodies about a lit one, spaced by the ${P.law}; each year’s square is its distance cubed.`;
      break;
    }
    case 'helix': {
      P.height = R1.range(30, 46) * size;
      P.radius = R1.range(3.6, 5.8) * size;
      P.turns = R1.range(2, 3.4);
      P.rungs = R1.int(20, 32);
      P.number = R1.int(1, Math.pow(2, Math.min(P.rungs, 20)) - 1);
      P.spin = R1.range(0.05, 0.11) * (R1.chance(0.5) ? 1 : -1);
      structure = `Two strands, ${P.turns.toFixed(1)} turns, ${P.rungs} rungs; its lit rungs spell ${formatInt(P.number)} in binary, from the ground up.`;
      break;
    }
    case 'tesseract': {
      P.kind = R1.pick(['tesseract', 'tesseract', '16-cell', '5-cell', '24-cell']);
      P.radius = R1.range(7, 10) * size;
      P.height = R1.range(24, 32) * size;
      P.speeds = [R1.range(0.12, 0.25), R1.range(0.07, 0.16), R1.range(0.03, 0.09)];
      structure = {
        tesseract: 'A cube within a cube: the shadow of a solid of four dimensions, turning through the fourth.',
        '16-cell': 'Sixteen cells of a solid of four dimensions; its shadow folds through itself.',
        '5-cell': 'The simplest solid of four dimensions, five corners and ten edges; its shadow turns inside out.',
        '24-cell': 'Twenty-four octahedra closed into one solid of four dimensions; its shadow breathes.',
      }[P.kind];
      break;
    }
    case 'wreck': {
      P.length = R1.range(48, 70) * size;
      P.beam = R1.range(10, 13) * size;
      P.sink = R1.range(0.18, 0.34);
      P.pitch = R1.range(0.1, 0.28);
      P.roll = R1.range(-0.3, 0.3);
      P.ribs = R1.int(4, 7);
      P.panels = R1.int(6, 13);
      P.lights = R1.int(3, 6);
      structure = `A hull ${Math.round(P.length)} meters long, ${Math.round(P.sink * 100)} parts in a hundred sunk; ${NUMW[P.ribs].toLowerCase()} ribs open to the air. A light inside still answers.`;
      break;
    }
    case 'stair': {
      P.steps = R1.pick([21, 34, 34, 55]);
      P.radius = R1.range(5, 7.5) * size;
      P.rise = (R1.range(34, 50) * size) / P.steps;
      P.per = R1.pick([12, 13, 16, 21]);
      P.door = R1.chance(0.7);
      P.column = R1.chance(0.5);
      P.lit = R1.pick([3, 5, 8]);
      structure = `${P.steps} treads about ${P.column ? 'a column' : 'nothing at all'}, rising ${Math.round(P.steps * P.rise)} meters${P.door ? ' to a door that opens on fog' : ''}.`;
      break;
    }
    case 'arbor': {
      P.depth = R1.int(4, 5);
      P.spread = R1.pick([2, 2, 3]);
      if (P.spread === 3) P.depth = 4;
      P.angle = R1.range(0.38, 0.62);
      P.trunk = R1.range(14, 19) * size;
      P.twist = R1.range(0.7, 1.7);
      P.droop = R1.range(0, 0.22);
      structure = `A tree that branches in ${P.spread === 2 ? 'twos' : 'threes'}, ${P.depth} times over; light gathers at its ${Math.pow(P.spread, P.depth)} tips.`;
      break;
    }
    case 'pool': {
      P.radius = R1.range(11, 17) * size;
      P.stones = R1.pick([6, 7, 8, 9, 12]);
      P.float = R1.range(9, 14) * size;
      P.shape = R1.pick(['ico', 'dodeca', 'octa', 'box']);
      P.thread = R1.chance(0.6);
      structure = `A pool ${Math.round(P.radius * 2)} meters across and perfectly level; ${NUMW[P.stones].toLowerCase()} stones keep it, and one hangs over it.`;
      break;
    }
    case 'sentinel': {
      P.n = R1.pick([2, 3, 3, 4, 5]);
      P.height = R1.range(32, 42) * size;
      P.radius = R1.range(11, 16) * size;
      P.hood = R1.pick(['peak', 'round', 'peak']);
      P.staff = R1.chance(0.5);
      P.facing = R1.pick(['in', 'in', 'out']);
      structure = `${NUMW[P.n]} figures, ${Math.round(P.height)} meters tall, facing ${P.facing === 'in' ? 'one another' : 'away from one another'}; their eyes follow the ship.`;
      break;
    }
    case 'swarm': {
      P.n = R1.pick([24, 34, 48, 55]);
      P.radius = R1.range(9, 14) * size;
      P.height = R1.range(18, 26) * size;
      [P.p, P.q] = R1.pick([[2, 3], [2, 5], [3, 4], [3, 5], [2, 7], [3, 7]]);
      P.shape = R1.pick(['tetra', 'octa', 'cube']);
      P.speed = R1.range(0.12, 0.24);
      structure = `${P.n} shards on a (${P.p}, ${P.q}) knot, drawing close as the ship comes near.`;
      break;
    }
    case 'cradle': {
      P.ribs = R1.int(5, 9);
      P.height = R1.range(24, 32) * size;
      P.radius = R1.range(9, 13) * size;
      P.curl = R1.range(0.65, 1.0);
      P.egg = R1.range(4.2, 6) * size;
      P.cracks = R1.int(3, 7);
      structure = `${NUMW[P.ribs]} ribs closing over an egg; ${NUMW[P.cracks].toLowerCase()} cracks in it, lit from within.`;
      break;
    }
    case 'lanterns': {
      P.n = R1.int(9, 21);
      P.area = R1.range(14, 22) * size;
      P.low = R1.range(8, 12);
      P.high = R1.range(20, 30) * size;
      P.shape = R1.pick(['diamond', 'box', 'drum']);
      P.tethered = R1.chance(0.7);
      structure = `${NUMW[P.n]} lanterns hung on nothing${P.tethered ? ', each tied to a stake' : ''}; they rise and fall out of step.`;
      break;
    }
    case 'dish': {
      P.radius = R1.range(8.5, 12.5) * size;
      P.small = R1.int(0, 4);
      P.tracks = R1.chance(0.75);
      P.mast = R1.range(8, 12) * size;
      P.depth = R1.range(0.22, 0.34);
      structure = `A dish ${Math.round(P.radius * 2)} meters across${P.small ? `, ${NUMW[P.small].toLowerCase()} smaller ones about it` : ''}; ${P.tracks ? 'it turns to follow the ship' : 'it listens to one fixed point in the sky'}.`;
      break;
    }
    case 'echo': {
      P.scale = R1.range(0.55, 0.66) * size;     // meters per art pixel: 30 to 60 meters tall
      P.hover = R1.range(9, 14) * size;
      P.glyph = glyphParams(R1, size * 0.8);
      const under = glyphText(P.glyph).replace(/\.$/, '');
      structure = `SEEKER #${lead} itself, ${Math.round(54 * P.scale)} meters tall, hovering; it turns to watch the ship. Under it: ${under[0].toLowerCase()}${under.slice(1)}.`;
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
  d.fund = hz;
  if (depth >= 1) {
    d.notes = [d.structure, `Its light pulses ${k} of every ${n} steps; it sings a chord of ${d.params.voice.chord.length}, near ${hz} Hz.`, d.flavor, d.origin];
    return d;
  }

  // name and notes
  const noun = R3.pick(NOUNS[family]);
  const adj = R3.pick(ADJ);
  let name;
  const numbered = { ring: P.n, crystal: P.n, gate: P.n, fungi: P.n, chimes: P.n, sentinel: P.n, lanterns: P.n, stair: P.steps }[family];
  const r = R3();
  if (family === 'echo') name = `The ${adj} ${noun} of #${lead}`;
  else if (numbered && r < 0.3) name = `The ${noun} of ${NUMW[numbered] || numbered}`;
  else if (r < 0.62) name = `The ${adj} ${noun}`;
  else name = `${adj} ${noun} ${R3.pick(OF)}`;
  d.name = name;
  d.code = `${CODE[family]}-${seedHex.slice(2, 6).toUpperCase()}`;
  d.cls = CLASS[family];
  let origin;
  if (wild) origin = R3.pick(WILD_ORIGIN);
  else {
    const total = move.total || tokens.length;
    const who = tokens.length > 1 ? `SEEKER ${tokens.map((t) => '#' + t).join(', ')} moved together` : total > 1 ? `SEEKER #${lead} moved, one of ${total} that moved together` : `SEEKER #${lead} moved`;
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
    grand ? R3.pick(GRAND) : R3.pick(wild ? FLAVOR : [...FLAVOR, ...WITNESS_FLAVOR]),
    origin,
  ];
  d.fund = hz;
  return d;
}

// A figure drawn in light on the ground: a geoglyph's own, or the floor a witnessed
// seeker hovers over.
function glyphParams(R1, size) {
  const P = {};
  P.kind = R1.pick(['star', 'lissajous', 'rose', 'hilbert', 'phyllotaxis', 'circles']);
  P.radius = R1.range(34, 52) * size;
  if (P.kind === 'star') { P.n = R1.pick([5, 7, 9, 11, 12, 13]); P.k = R1.int(2, Math.floor((P.n - 1) / 2)); while (gcd(P.n, P.k) !== 1) P.k--; }
  if (P.kind === 'lissajous') { P.a = R1.int(1, 5); P.b = P.a + R1.int(1, 3); P.phase = R1.range(0, 1.5); }
  if (P.kind === 'rose') { P.k = R1.pick([2, 3, 4, 5, 7, 3 / 2, 5 / 3]); }
  if (P.kind === 'hilbert') P.order = R1.int(3, 4);
  if (P.kind === 'phyllotaxis') P.n = R1.pick([89, 144, 233]);
  if (P.kind === 'circles') P.n = R1.int(3, 7);
  P.stones = R1.chance(0.6);
  return P;
}

function glyphText(P) {
  return {
    star: () => `A star polygon {${P.n}/${P.k}} cut into the ground in light.`,
    lissajous: () => `A figure of two motions, ${P.a}:${P.b}, drawn in light across the clearing.`,
    rose: () => `A rose of ${P.k} petals${P.k % 1 ? ' that will not close' : ''}, drawn in light.`,
    hilbert: () => `One line that fills a square, folded ${P.order} times over itself.`,
    phyllotaxis: () => `${P.n} points of light at the golden angle.`,
    circles: () => `${NUMW[P.n]} circles, their radii in the harmonic series.`,
  }[P.kind]();
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
export { POLY_N, SEQ };
