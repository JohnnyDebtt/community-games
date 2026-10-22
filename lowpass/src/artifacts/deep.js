import { stratum, roman, harmonicOf } from './strata.js';

// What the deep grows: a wild artifact from below the surface (generate.js hands it here
// when its depth is one or more). Its seed chooses one of the forms its stratum has (and
// deeper down, a second one crowning it, and a court of small ones about it), how that
// form goes (counts, symmetries, variants), its ornaments, the layers of its voice and the
// chord it sings, its name and its notes. The deeper, the more of everything: more whorls
// and crowns and shells, higher symmetries, more ornaments, more voices, larger.

const NUMW = ['None', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-One'];
const num = (n) => NUMW[n] || String(n);

export const DEEP_CODE = { corolla: 'COR', spine: 'AXS', nest: 'NST', armillary: 'ARM', choir: 'CHO', geode: 'GEO', bloom: 'CRL', knot: 'KNT',
  nautilus: 'NTL', archipelago: 'ARC', murmuration: 'ATR', medusa: 'MDS', sun: 'SUN', watcher: 'WTC',
  spire: 'SPR', temple: 'TMP', halo: 'HAL', loom: 'LOM', storm: 'STM', serpent: 'SRP', cathedral: 'CTH',
  tree: 'TRE', vortex: 'VTX', mobius: 'MOB', menger: 'MNG', whale: 'WHL' };
const CLASS = { corolla: 'Corolla', spine: 'Axis', nest: 'Nested solids', armillary: 'Armillary', choir: 'Choir', geode: 'Geode', bloom: 'Coral',
  knot: 'Knot', nautilus: 'Nautilus', archipelago: 'Archipelago', murmuration: 'Attractor', medusa: 'Medusa', sun: 'Star engine', watcher: 'Watcher',
  spire: 'Crystal spire', temple: 'Sky temple', halo: 'Halo', loom: 'Aurora loom', storm: 'Storm crown', serpent: 'Wind serpent', cathedral: 'Ice cathedral',
  tree: 'Tree of light', vortex: 'Maelstrom', mobius: 'Möbius band', menger: 'Menger sponge', whale: 'Sky whale' };
const NOUN = {
  corolla: ['Corolla', 'Lotus', 'Bloom', 'Rose', 'Calyx', 'Chalice'], spine: ['Spine', 'Axis', 'Totem', 'Spindle', 'Stem', 'Mast'],
  nest: ['Nest', 'Reliquary', 'Cage', 'Seed', 'Kernel', 'Shrine'], armillary: ['Armillary', 'Gyre', 'Astrolabe', 'Gimbal', 'Sphere', 'Engine'],
  choir: ['Choir', 'Procession', 'Chorus', 'Colonnade', 'Litany', 'Assembly'], geode: ['Geode', 'Cathedral', 'Druse', 'Heart', 'Hoard', 'Throne'],
  bloom: ['Coral', 'Tree', 'Candelabrum', 'Antler', 'Burst', 'Canopy'], knot: ['Knot', 'Link', 'Braid', 'Loop', 'Coil', 'Promise'],
  nautilus: ['Nautilus', 'Horn', 'Galaxy', 'Whorl', 'Spiral', 'Ammonite'], archipelago: ['Archipelago', 'Isles', 'Reach', 'Shoals', 'Stair', 'Garden'],
  murmuration: ['Murmuration', 'Attractor', 'Weather', 'Flock', 'Thought', 'Storm'], medusa: ['Medusa', 'Drifter', 'Bell', 'Veil', 'Lantern', 'Bloom'],
  sun: ['Sun', 'Engine', 'Furnace', 'Heart', 'Swarm', 'Crown'], watcher: ['Watcher', 'Eye', 'Witness', 'Iris', 'Regard', 'Vigil'],
  spire: ['Spire', 'Shard', 'Needle', 'Lance', 'Prism', 'Tooth'], temple: ['Temple', 'Ziggurat', 'Sanctum', 'Altar', 'Shrine', 'House'],
  halo: ['Halo', 'Ring', 'Diadem', 'Wheel', 'Circlet', 'Corona'],
  loom: ['Loom', 'Weave', 'Curtain', 'Veil', 'Tapestry', 'Frame'], storm: ['Storm', 'Tempest', 'Crown', 'Gyre', 'Thunder', 'Weather'],
  serpent: ['Serpent', 'Wyrm', 'Ribbon', 'Coil', 'Dragon', 'Current'], cathedral: ['Cathedral', 'Nave', 'Chapel', 'Vault', 'Choir', 'Basilica'],
  tree: ['Tree', 'Arbor', 'Ash', 'Grove', 'Canopy', 'Root'], vortex: ['Maelstrom', 'Gyre', 'Whirlpool', 'Eye', 'Gate', 'Spiral'],
  mobius: ['Band', 'Ribbon', 'Loop', 'Path', 'Promise', 'Road'], menger: ['Sponge', 'Lattice', 'Hive', 'Archive', 'Labyrinth', 'Reliquary'],
  whale: ['Whale', 'Leviathan', 'Singer', 'Swimmer', 'Elder', 'Wanderer'],
};
const ADJ = ['Gilded', 'Burning', 'Singing', 'Unfolding', 'Weightless', 'Drowned', 'Woken', 'Endless', 'Opaline', 'Sleepless', 'Inverted',
  'Radiant', 'Hollow', 'Recursive', 'Patient', 'Unborn', 'Eleventh', 'Mirrored', 'Ascending', 'Dreaming', 'Luminous', 'Unspoken',
  'Thousandfold', 'Iridescent', 'Folded', 'Feathered', 'Molten', 'Vaulted'];
const OF = ['of the Deep Fog', 'of a Second Light', 'of the Unmeasured', 'of All Permutations', 'of the Long Descent', 'of Glass Tides',
  'of the Hidden Number', 'of Returning Light', 'of the Under-Sky', 'of Many Suns', 'of the Last Depth', 'of Quiet Fire',
  'of the Seeker’s Dream', 'of the Far Shelf', 'of Unfinished Song', 'of the Open Hand'];
const FLAVOR = ['The fog glows its color for a hundred meters around.', 'The scanner hesitates, then reaches further.',
  'It seems larger the longer it is watched.', 'Its shadow falls the wrong way.', 'The nearest trees have turned toward it.',
  'The ship’s hum falls into tune with it.', 'Every face of it is a different color, all at once.', 'The Codex needs a new word for it.',
  'It is quieter than its light suggests.', 'It moves only while unwatched.', 'From here, the sky looks deeper.',
  'Its light reaches the ground before it leaves it.', 'The visor draws it twice, a little apart.', 'Rime will not form within its light.'];

const SOLIDS = ['tetrahedron', 'cube', 'octahedron', 'dodecahedron', 'icosahedron', 'cuboctahedron', 'icosidodecahedron', 'stella'];
const SOLID_NAME = { tetrahedron: 'a tetrahedron', cube: 'a cube', octahedron: 'an octahedron', dodecahedron: 'a dodecahedron',
  icosahedron: 'an icosahedron', cuboctahedron: 'a cuboctahedron', icosidodecahedron: 'an icosidodecahedron', stella: 'a stella octangula' };
const ATTRACTORS = ['lorenz', 'aizawa', 'thomas', 'halvorsen', 'chen', 'dadras'];
const ATTR_NAME = { lorenz: 'Lorenz', aizawa: 'Aizawa', thomas: 'Thomas', halvorsen: 'Halvorsen', chen: 'Chen', dadras: 'Dadras' };
const CROWNABLE = ['nest', 'armillary', 'corolla', 'geode', 'knot', 'sun'];
const COURTLY = ['nest', 'corolla', 'geode', 'knot', 'armillary'];
// (on the mountains, from the mountains' own)
const CROWNABLE_M = ['halo', 'spire', 'storm', 'temple'];
const COURTLY_M = ['spire', 'temple', 'halo', 'loom'];

// the voice's layers, and the depth that first has each
const VOICES = [['bells', 1], ['pad', 1], ['shimmer', 2], ['arp', 2], ['comb', 3], ['glide', 3], ['poly', 4], ['swell', 4],
  ['formant', 5], ['swarm', 5], ['cascade', 6]];

const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// pick from [item, depth] pairs unlocked at this depth, the newer ones likelier
function pickNew(R, list, depth, n, keep = []) {
  const open = list.filter(([x, d]) => d <= depth && !keep.includes(x));
  const out = [...keep];
  while (out.length < n + keep.length && open.length) {
    const tot = open.reduce((s, [, d]) => s + 1 + d, 0);
    let r = R() * tot, i = 0;
    for (; i < open.length - 1; i++) { r -= 1 + open[i][1]; if (r <= 0) break; }
    out.push(open.splice(i, 1)[0][0]);
  }
  return out;
}

// the parameters of one form at a depth (also for the small crown and court ones)
export function formParams(form, R, depth) {
  const P = { form };
  const deep = (a, b, per = 1) => Math.min(b, a + Math.floor(depth / per));
  switch (form) {
    case 'corolla':
      P.whorls = deep(2, 5, 2) + (R() < 0.3 ? 1 : 0);
      P.n = R.pick(depth >= 4 ? [7, 8, 9, 11, 12, 13] : [5, 6, 7, 8]);
      P.stem = R.pick(['stalk', 'float', 'roots']);
      P.lotus = depth >= 4 && R() < 0.5;
      P.text = `${num(P.whorls)} whorls of ${P.n} petals${P.stem === 'float' ? ', hanging on nothing' : P.stem === 'roots' ? ', its roots of light hanging to the ground' : ' on a stem'}${P.lotus ? ', its reflection blooming under it' : ''}; it opens as the ship comes near.`;
      break;
    case 'spine': {
      P.nodes = deep(3, 9, 1.5) + R.int(0, 1);
      const types = ['spikes', 'disc', 'ring', 'cage', ...(depth >= 2 ? ['petals', 'orbit'] : [])];
      P.crowns = Array.from({ length: P.nodes }, () => R.pick(types));
      P.top = R.pick(['star', 'orb', 'eye']);
      P.shape = R.pick(['taper', 'spindle', 'bulb']);
      P.text = `A spine of ${num(P.nodes).toLowerCase()} crowns, each turning against the one below; ${P.top === 'eye' ? 'an eye' : P.top === 'orb' ? 'a sphere of light' : 'a star'} keeps its top.`;
      break;
    }
    case 'nest': {
      const k = deep(2, 6, 2) + (R() < 0.4 ? 1 : 0);
      const pool = SOLIDS.slice(0, depth >= 2 ? 8 : 5);
      P.shells = Array.from({ length: k }, (_, i) => ({ solid: R.pick(pool), mode: i === k - 1 ? R.pick(['wire', 'glass']) : R.pick(['wire', 'glass', 'solid', 'stellated']) }));
      P.text = `${P.shells.slice().reverse().map((s) => SOLID_NAME[s.solid]).join(' within ').replace(/^a/, 'A')}, each turning on an axis of its own.`;
      break;
    }
    case 'armillary':
      P.rings = deep(3, 9, 1) + R.int(0, 1);
      P.core = R.pick(['portal', 'orb', 'nest']);
      P.stand = R.pick(['tripod', 'float', 'column']);
      P.text = `${num(P.rings)} rings, each hung inside the last and turning on its own axis; at their heart, ${P.core === 'portal' ? 'a disc of light that does not end' : P.core === 'orb' ? 'a sphere of light' : 'solids, nested'}.`;
      break;
    case 'choir':
      P.n = Math.min(89, R.pick([13, 21, 21, 34]) + depth * 5);
      P.strands = deep(1, 3, 3) + (R() < 0.3 ? 1 : 0);
      P.shape = R.pick(['helix', 'spiral', 'sphere']);
      P.text = `${P.n} slabs ${P.shape === 'sphere' ? 'on a sphere, spiralling from pole to pole' : P.shape === 'spiral' ? `on ${P.strands > 1 ? `${num(P.strands).toLowerCase()} arms` : 'an arm'} of a spiral, rising` : `on ${P.strands > 1 ? `${num(P.strands).toLowerCase()} helices` : 'a helix'}`}; each rises and falls on its own.`;
      break;
    case 'geode':
      P.n = Math.min(89, R.pick([21, 34]) + depth * 6);
      P.shape = R.pick(['mound', 'sphere', 'hanging', 'ring']);
      P.text = `${P.n} crystals about one, set at the golden angle${P.shape === 'sphere' ? ', a sphere of them, floating' : P.shape === 'hanging' ? ', hanging from a stone that floats' : P.shape === 'ring' ? ', in a ring' : ''}; each lit from within.`;
      break;
    case 'bloom':
      P.levels = deep(4, 6, 2) + (R() < 0.3 ? 1 : 0);
      P.branch = R.pick([2, 2, 3]);
      if (P.branch === 3) P.levels = Math.min(P.levels, 4);
      P.shape = R.pick(['tree', 'hanging', 'burst']);
      P.crystal = depth >= 3 && R() < 0.6;
      P.text = `${P.shape === 'burst' ? 'A burst' : P.shape === 'hanging' ? 'A coral, hanging from a stone that floats,' : 'A coral'} that branches in ${P.branch === 2 ? 'twos' : 'threes'}, ${P.levels} times over${P.crystal ? ', in crystal' : ''}; light runs out to its ${Math.pow(P.branch, P.levels)} tips.`;
      break;
    case 'knot': {
      P.kind = R.pick(depth >= 3 ? ['torus', 'torus', 'link', 'borromean', 'lissajous'] : ['torus', 'torus', 'link']);
      let p = R.int(2, 2 + Math.floor(depth / 2)), q = R.int(p + 1, p + 3 + depth);
      while (gcd(p, q) !== 1) q++;
      P.p = p; P.q = q;
      P.lis = [R.int(2, 4), R.int(2, 5), R.int(3, 7)];
      P.text = {
        torus: `One loop, knotted ${p} times about one way and ${q} about the other; light runs along it.`,
        link: 'Two rings of light, linked, turning through each other.',
        borromean: 'Three rings, no two of them linked; together they cannot come apart.',
        lissajous: `One line that closes on itself, ${P.lis.join(':')}, knotted in three motions.`,
      }[P.kind];
      break;
    }
    case 'nautilus':
      P.kind = R.pick(['shell', 'horn', 'galaxy']);
      P.turns = Math.min(5, 2.2 + R() * 0.8 + depth * 0.15);
      P.arms = R.int(2, 2 + Math.min(4, Math.floor(depth / 2)));
      P.text = P.kind === 'galaxy' ? `${num(P.arms)} arms of light about a heart, turning, flat on the forest.` : `A whorl that grows threefold every turn, ${P.turns.toFixed(1)} turns${P.kind === 'horn' ? ', rising as it turns' : ', standing on its edge'}; its chambers are lit.`;
      break;
    case 'archipelago':
      P.islands = deep(5, 15, 0.5);
      P.layout = R.pick(['spiral', 'scatter', 'stair']);
      P.falls = R.int(2, 3 + Math.floor(depth / 2));
      P.text = `${num(P.islands)} islands of stone hanging in the fog, ${P.layout === 'spiral' ? 'climbing a spiral' : P.layout === 'stair' ? 'stepping upward' : 'scattered'}; light falls from ${num(P.falls).toLowerCase()} of them like water.`;
      break;
    case 'murmuration':
      P.attractor = R.pick(ATTRACTORS);
      P.points = Math.min(6000, 1600 + depth * 600);
      P.text = `${P.points.toLocaleString('en-US')} motes on the ${ATTR_NAME[P.attractor]} attractor, never repeating, around the path they all keep to.`;
      break;
    case 'medusa':
      P.count = depth >= 6 ? R.int(1, 3) : 1;
      P.tentacles = Math.min(28, 10 + depth * 2);
      P.text = `${P.count > 1 ? `${num(P.count)} bells` : 'A bell'} of light ${P.count > 1 ? 'drift' : 'drifts'} over the forest, ${P.tentacles} arms trailing; ${P.count > 1 ? 'they swim' : 'it swims'} in place.`;
      break;
    case 'sun':
      P.plates = Math.min(420, 90 + depth * 30);
      P.planes = Math.min(7, 2 + Math.floor(depth / 2));
      P.arcs = R.int(3, 6);
      P.text = `A star the size of a house, ${P.plates} plates on ${num(P.planes).toLowerCase()} orbits about it, catching its light.`;
      break;
    case 'spire':
      P.facets = R.pick([5, 6, 7, 8]);
      P.rings = deep(1, 4, 2);
      P.shards = Math.min(24, 7 + depth * 2);
      P.text = `A crystal of ${P.facets} faces grown out of the summit, ${P.shards} smaller about its foot; ${P.rings === 1 ? 'a ring of light turns' : `${num(P.rings).toLowerCase()} rings of light turn`} about it.`;
      break;
    case 'temple':
      P.tiers = deep(3, 7, 2);
      P.shape = R.pick(['square', 'round']);
      P.stairs = R.int(1, 4);
      P.text = `A temple of ${num(P.tiers).toLowerCase()} ${P.shape} tiers hanging over the summit, ${P.stairs === 1 ? 'a stair' : `${num(P.stairs).toLowerCase()} stairs`} of light down to the stone.`;
      break;
    case 'halo':
      P.pendants = Math.min(36, 12 + depth * 2);
      P.tilt = R.range(0.08, 0.32);
      P.rings = deep(1, 3, 3);
      P.text = `A ring of stone hanging over the summit, ${P.pendants} shards hung from it; light falls from them to the rock.`;
      break;
    case 'loom':
      P.frames = deep(1, 3, 3);
      P.ribbons = Math.min(16, 6 + depth);
      P.text = `${P.frames === 1 ? 'A frame' : `${num(P.frames)} frames`} as tall as the trees, ${P.ribbons} ribbons of aurora woven on ${P.frames === 1 ? 'it' : 'them'}, moving in no wind.`;
      break;
    case 'storm':
      P.clouds = Math.min(48, 18 + depth * 3);
      P.bolts = R.range(1.2, 2.6) / (1 + depth * 0.08);
      P.text = `A crown of storm turning over the summit, an eye of light at its heart; lightning falls from it to the stone every few seconds.`;
      break;
    case 'serpent':
      P.coils = Math.min(4, R.range(1.6, 2.4) + depth * 0.1);
      P.text = `A serpent of light, ${P.coils.toFixed(1)} coils about the summit, never still.`;
      break;
    case 'cathedral':
      P.bays = deep(3, 7, 2);
      P.spires = R.int(0, 2);
      P.text = `A nave of ice ${num(P.bays).toLowerCase()} bays long, its rose window lit${P.spires ? `, ${num(P.spires * 2).toLowerCase()} spires over its front` : ''}.`;
      break;
    case 'tree':
      P.levels = 4;
      P.split = depth >= 3 ? 3 : 2;
      P.roots = Math.min(12, 6 + depth);
      P.text = `A tree of light ${P.levels + 1} branchings high, crowned with light at every end; leaves of light fall from it and are gone into the ground.`;
      break;
    case 'vortex':
      P.arms = R.pick([3, 5, 7, 8]);
      P.wind = R.range(0.8, 1.6);
      P.text = `A ring standing on the ground, a maelstrom of ${num(P.arms).toLowerCase()} arms of light turning into its heart; the motes about it are drawn in.`;
      break;
    case 'mobius':
      P.twists = depth >= 3 && R() < 0.5 ? 3 : 1;
      P.text = P.twists === 1 ? 'A band with only one side, turning slowly in the air; its one edge is lit, and lights run along it, over and under, without end.' : 'A band given three half-twists, with only one side and one edge, turning slowly; lights run along it without end.';
      break;
    case 'menger':
      P.text = 'A cube cut into twenty-seven and the middles taken away, and again: four hundred cubes in a cube’s shape, standing on a corner, a light inside them, breathing.';
      break;
    case 'whale':
      P.speed = R.range(0.05, 0.08);
      P.text = 'A whale of the under-sky, longer than the trees are tall, swimming slow circles over the forest; its flukes beat the fog.';
      break;
    case 'watcher':
      P.eyes = depth >= 6 ? R.int(3, 7) : R.int(0, 2);
      P.iris = R.pick([24, 36, 48]);
      P.slit = R() < 0.4;
      P.text = `An eye as tall as the trees, ${P.slit ? 'its pupil a slit' : 'its pupil round'}; it follows the ship${P.eyes ? `, and ${num(P.eyes).toLowerCase()} smaller ones about it follow it too` : ''}.`;
      break;
  }
  return P;
}

// d: the descriptor generate.js began (seed, song, size...); R1, R3: its own randoms
export function describeDeep(d, move, R1, R3) {
  const depth = d.depth, st = stratum(depth);
  // (development may ask for a form: then any, at any depth)
  // on the mountains, from the mountains' own forms (crowns and courts too)
  // the marked ones (+): their own forms, but on the mountains the mountains' own,
  // crowned and courted there at any depth
  const forms = d.mountain ? st.mountainForms : d.plus ? st.plusForms : st.forms;
  const form = move.form && DEEP_CODE[move.form] ? (R1(), move.form) : R1.pick(forms);
  const P = formParams(form, R1, depth);
  if (d.plus && d.mountain) {
    P.crown = formParams(R1.pick(CROWNABLE_M.filter((f) => f !== form && forms.includes(f))), R1, Math.max(1, depth - 1));
    const c = R1.pick(COURTLY_M.filter((f) => f !== form && f !== P.crown.form && forms.includes(f)));
    P.court = { n: R1.int(4, 6), form: formParams(c, R1, Math.max(1, depth - 2)) };
  }
  // deeper: another form crowning it, a court of small ones about it
  if (d.plus) { /* (the marked ones' own stand alone) */ } else if (depth >= 5 && R1() < 0.5) P.crown = formParams(R1.pick((d.mountain ? CROWNABLE_M : CROWNABLE).filter((f) => f !== form && forms.includes(f))), R1, Math.max(1, depth - 3));
  if (!d.plus && depth >= 7 && R1() < 0.5) { const c = R1.pick((d.mountain ? COURTLY_M : COURTLY).filter((f) => f !== form && forms.includes(f))); P.court = { n: R1.int(3, 6), form: formParams(c, R1, Math.max(1, depth - 4)) }; }
  P.ornaments = pickNew(R1, [['halo', 1], ['sigil', 1], ['orbiters', 1], ['pillar', 2], ['beams', 2], ['shards', 2], ['rain', 3], ['veil', 4], ['twin', 5], ['skyring', 6], ['echoes', 7]],
    depth, Math.min(5, 1 + Math.ceil(depth / 2)), ['motes']);
  if (d.plus) for (const o of ['halo', 'pillar', 'skyring']) if (!P.ornaments.includes(o)) P.ornaments.push(o);
  // its voice: layers (the newer likelier), and its chord: the palette's harmonics and
  // those of the depths down to its own, its own depth's always in it
  const layers = pickNew(R1, VOICES, depth, Math.min(5, 2 + Math.floor(depth / 2)));
  if (!layers.includes('bells') && !layers.includes('pad')) layers[0] = R1.pick(['bells', 'pad']);
  if (d.plus) for (const l of ['shimmer', 'swell']) if (!layers.includes(l)) layers.push(l);
  const pool = [16, 18, 19, 24, 28, ...st.harmonics];
  const chord = [R1.pick([16, 24]), harmonicOf(depth)];
  while (chord.length < 3 + Math.min(2, Math.floor(depth / 3))) { const h = R1.pick(pool); if (!chord.includes(h)) chord.push(h); }
  P.voice = { layers, chord, oct: R1.pick([2, 3]), pool };
  d.family = 'deep';
  d.form = form;
  d.params = P;
  d.size = st.size * (0.88 + R1() * 0.24) * (d.plus ? 1.25 : 1);
  d.accent = st.light;
  d.strength = st.glow;
  d.grand = false;
  // its name and notes
  const noun = R3.pick(NOUN[form]), adj = R3.pick(ADJ), r = R3();
  d.name = r < 0.4 ? `The ${adj} ${noun}` : r < 0.75 ? `${adj} ${noun} ${R3.pick(OF)}` : `The ${noun} ${R3.pick(OF)}`;
  if (d.plus) d.name += '+';
  d.code = `D${depth}${d.plus ? '+' : ''}-${DEEP_CODE[form]}-${(move.seed || move.tx).slice(2, 6).toUpperCase()}`;
  d.cls = CLASS[form];
  const crowned = P.crown ? ` Over it, ${P.crown.text[0].toLowerCase()}${P.crown.text.slice(1)}` : '';
  const court = P.court ? ` About it stand ${num(P.court.n).toLowerCase()} small ${CLASS[P.court.form.form].toLowerCase()}s.` : '';
  d.structure = P.text + crowned + court;
  d.origin = d.plus ? `From Depth ${roman(depth)}, ${st.title}${d.mountain ? ', on the mountain' : ''}: one of the marked, the rarest it holds. No other ship will find it.` : d.mountain && !move.glimpse ? `From Depth ${roman(depth)}, ${st.title}, on the mountain; no other ship will find it.` : move.glimpse
    ? `From Depth ${roman(depth)}, ${st.title}: deeper than this scanner reaches. It came up anyway.`
    : `From Depth ${roman(depth)}, ${st.title}, where the scanner now reaches; no other ship will find it.`;
  d.flavor = R3.pick(FLAVOR);
}
