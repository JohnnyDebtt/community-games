import { P } from '../core/palette.js';

// Life under the ice. Colors follow place: cold and pale in the shallows, dark bodies
// with pale rims over the Glass Reach, moss and rust in the warm Vent Field, and the
// strangest, warmest colors at the Drop.
//
//   zones   weight per zone          depth  [min, max] m
//   time    weight by phase          jig    preferred lure activity [lo, hi] (0 still .. 1 frantic)
//   light   -1 shy .. +1 bold        size   [min, max] cm
//   power   how hard it fights       pitch  its tone, 48 Hz x ratio x 2^oct
//   tags    for device affinities    model  procedural model parameters

const R = { unison: 1, second: 9 / 8, third: 19 / 16, fourth: 21 / 16, fifth: 3 / 2, seventh: 7 / 4 };

export const RARITY = {
  common: { weight: 1, data: 6, label: 'Common' },
  uncommon: { weight: 0.42, data: 10, label: 'Uncommon' },
  rare: { weight: 0.14, data: 16, label: 'Rare' },
  legendary: { weight: 0, data: 30, label: 'Legendary' },
};

const T = (night, dawn, day, dusk) => ({ night, dawn, day, dusk });
const ANY = T(1, 1, 1, 1);

export const SPECIES = [
  // ---------------------------------------------------------------- the shallows
  {
    id: 'rime_minnow', name: 'Glint Mote', rarity: 'common',
    zones: { shallows: 1, reach: 0.2, vents: 0.1 }, depth: [1, 14], time: T(0.7, 1, 1.2, 1),
    jig: [0.45, 0.95], light: 0.3, size: [4, 9], power: 0.08, pitch: [R.fifth, 4], tags: ['cold', 'school', 'bait'],
    model: { kind: 'fish', segments: 2, h: 0.34, w: 0.3, sides: 6, top: P.snow3, side: P.snow4, belly: P.glow3, fin: P.glow3, finGlow: 0.3, pattern: 'line', pc: P.glow2, pglow: 0.7, eyes: { layout: 'cyclops', color: P.glow3, glow: 1 }, tail: 'veil', fins: 'none', dorsal: 'none', profile: 'teardrop' },
    codex: 'So thin the light passes through it, and its one eye glows. A school turns all at once, as if one thought moved every mote.',
  },
  {
    id: 'frost_char', name: 'Frostvane', rarity: 'common',
    zones: { shallows: 1, reach: 0.35 }, depth: [3, 22], time: T(0.5, 1.4, 1, 1.1),
    jig: [0.25, 0.65], light: 0, size: [22, 48], power: 0.4, pitch: [R.unison, 3], tags: ['cold'],
    model: { kind: 'fish', h: 0.5, w: 0.1, sides: 3, top: P.snow0, side: P.shell3, belly: P.glow3, fin: P.shell2, pattern: 'spots', pc: P.snow4, eyes: { layout: 'row', n: 3 }, eye: 0x101418, tail: 'tri', spikes: { n: 4, h: 0.45, shard: true, color: P.shell4 }, dorsal: 'none', profile: 'sail' },
    codex: 'Its spots differ from one side to the other, and no two vanes share a pattern. Theorem has not found the rule. It has looked.',
  },
  {
    id: 'slate_perch', name: 'Tally Skimmer', rarity: 'common',
    zones: { shallows: 0.9, vents: 0.3 }, depth: [2, 18], time: T(0.6, 0.9, 1, 1.5),
    jig: [0.35, 0.8], light: 0.1, size: [12, 30], power: 0.3, pitch: [R.third, 3], tags: ['cold'],
    model: { kind: 'fish', h: 0.14, w: 0.42, top: P.stone2, side: P.stone4, belly: P.snow3, fin: P.moss5, pattern: 'bars', pc: P.stone1, count: 7, eyes: { layout: 'row', n: 2 }, eye: 0x101418, tail: 'split', fins: 'shard', feelers: { n: 2, len: 0.28, color: P.stone4, tip: P.glow2 }, spikes: { n: 7, h: 0.32, color: P.stone1 }, dorsal: 'none', profile: 'disc' },
    codex: 'Seven dark bars, always seven. The young have five. Something in it counts, and its two feelers tap the count out on the ice.',
  },
  {
    id: 'lidfish', name: 'Slab Mimic', rarity: 'uncommon',
    zones: { shallows: 0.8, reach: 0.4 }, depth: [6, 30], time: ANY, bottom: true,
    jig: [0.0, 0.22], light: -0.5, size: [18, 40], power: 0.35, pitch: [R.fourth, 2], tags: ['cold', 'shy'],
    model: { kind: 'flat', h: 0.55, w: 0.08, top: P.stone4, side: P.stone3, belly: P.snow4, fin: P.stone3, pattern: 'mottle', pc: P.snow2, eye: 0x9fe3ec, eyeGlow: 0.6, eyes: { layout: 'stalk' } },
    codex: 'It lies on the bottom and becomes the bottom, its eyes up on stalks. Lifted out, its mottling keeps moving for a while, still matching a floor that is no longer there.',
  },
  {
    id: 'glass_eel', name: 'Glass Coil', rarity: 'uncommon',
    zones: { shallows: 0.7, reach: 0.6 }, depth: [4, 40], time: T(1.6, 0.8, 0.3, 1),
    jig: [0.15, 0.5], light: -0.6, size: [20, 45], power: 0.25, pitch: [R.seventh, 4], tags: ['cold', 'shy', 'night'],
    model: { kind: 'eel', segments: 7, h: 0.07, w: 0.06, sides: 6, top: P.snow3, side: P.snow4, belly: P.snow4, fin: P.snow3, finGlow: 0.2, pattern: 'spine', pc: P.shell3, pglow: 0.6, eyes: { layout: 'ring', n: 4, color: P.glow3, glow: 0.9 }, feelers: { n: 4, len: 0.12, color: P.snow3, tip: P.glow3 } },
    sense: 'glass',
    codex: 'Clear as meltwater: you can count the rings of its spine, and the four eyes around its head never close. After holding one, the ice seems thinner, and you can almost see through it.',
  },
  {
    id: 'snow_sculpin', name: 'Flurrywing', rarity: 'uncommon',
    zones: { shallows: 0.6, reach: 0.3 }, depth: [2, 20], time: ANY, weather: { snow: 2.4, clear: 0.5, overcast: 0.9 },
    jig: [0.2, 0.55], light: 0, size: [8, 18], power: 0.2, pitch: [R.second, 4], tags: ['cold'],
    model: { kind: 'sculpin', h: 0.28, w: 0.2, top: P.snow3, side: P.snow2, belly: P.snow4, fin: P.snow4, finGlow: 0.25, pattern: 'mottle', pc: P.snow1, eyes: { layout: 'cyclops', color: 0x101418 }, tail: 'shard', fins: 'shard', spikes: { n: 5, h: 0.5, shard: true, color: P.snow4 }, dorsal: 'none' },
    codex: 'It only rises while snow is falling. Its fins are crystal, fringed like frost, and melt a little in the hand.',
  },

  // ---------------------------------------------------------------- the Glass Reach
  {
    id: 'lantern_cod', name: 'Lumen Seeker', rarity: 'common',
    zones: { reach: 1, drop: 0.4, shallows: 0.12 }, depth: [24, 80], time: T(1.8, 1, 0.4, 1.2),
    jig: [0.3, 0.7], light: 0.6, size: [35, 80], power: 0.55, pitch: [R.fifth, 2], tags: ['night', 'bold'],
    model: { kind: 'fish', segments: 2, h: 0.4, w: 0.34, top: P.body1, side: P.body3, belly: P.shell4, fin: P.body2, pattern: 'rim', pc: P.body5, barbel: P.glow3, eyes: { layout: 'row', n: 3, color: P.glow3, glow: 0.5 }, core: P.glow3, tail: 'paddle', dorsal: 'none', frills: { n: 3, color: P.body3, tip: P.glow3 }, profile: 'bulb' },
    sense: 'lantern',
    codex: 'A pale bead hangs before it, glowing on its own, and its heart glows through its sides. It swims toward every other light, as if seeking one it lost. Theorem files it with the Seekers.',
  },
  {
    id: 'codex_ray', name: 'Codex Glider', rarity: 'uncommon',
    zones: { reach: 0.9, drop: 0.3 }, depth: [30, 90], time: T(0.6, 1.1, 1.3, 1), bottom: true,
    jig: [0.1, 0.4], light: 0, size: [40, 110], power: 0.6, pitch: [R.third, 2], tags: ['deep'],
    model: { kind: 'ray', h: 0.9, w: 0.07, top: P.body2, side: P.body3, belly: P.body5, fin: P.body2, pattern: 'script', pc: P.glow1, pglow: 0.35, edgeGlow: 0.25, eyes: { layout: 'ring', n: 6, color: P.glow3, glow: 0.6 } },
    codex: 'Its back is written in a script that glows. Theorem has transcribed eleven of them; the texts never repeat. One seems to describe the ice above it.',
  },
  {
    id: 'choir_herring', name: 'Cantor', rarity: 'uncommon',
    zones: { reach: 0.8, shallows: 0.3, drop: 0.3 }, depth: [12, 60], time: T(1.5, 1, 0.5, 1), aurora: [0.22, 0.5],
    jig: [0.4, 0.9], light: 0.2, size: [18, 32], power: 0.3, pitch: [R.seventh, 3], tags: ['school', 'night', 'bait'],
    model: { kind: 'fish', segments: 3, h: 0.3, w: 0.3, sides: 6, top: P.shell2, side: P.shell3, belly: P.glow3, fin: P.shell3, pattern: 'stripe', pc: P.tundra6, pglow: 0.4, eye: 0x101418, tail: 'veil', ringfin: { z: 0, color: P.glow2, glow: 0.7 }, dorsal: 'none', frills: { n: 2, color: P.shell3, tip: P.glow2 }, profile: 'disc' },
    sense: 'choir',
    codex: 'When the aurora is strong, a school of cantors hums in chords through the rings around their bodies. The intervals are always just, never tempered, never out of tune.',
  },
  {
    id: 'shell_burbot', name: 'Annal Crawler', rarity: 'uncommon',
    zones: { reach: 0.7, drop: 0.5 }, depth: [40, 96], time: T(1.4, 1, 0.7, 1), bottom: true,
    jig: [0.0, 0.3], light: -0.3, size: [30, 70], power: 0.5, pitch: [R.fourth, 2], tags: ['deep', 'shy'],
    model: { kind: 'eel', h: 0.15, w: 0.13, bands: true, top: P.body3, side: P.shell1, belly: P.shell2, fin: P.body2, pattern: 'plates', pc: P.shell4, legs: 7, eyes: { layout: 'row', n: 2, color: P.glow1, glow: 0.4 }, feelers: { n: 2, len: 0.32, color: P.shell2, tip: P.glow1 }, dorsal: 'none' },
    codex: 'It grows one plate for each winter it survives, and walks the bottom on many small legs. The oldest specimen recorded had more plates than the sea should have winters.',
  },
  {
    id: 'mirror_smelt', name: 'Mirrorling', rarity: 'common',
    zones: { reach: 0.9, shallows: 0.4 }, depth: [8, 50], time: T(0.5, 1.6, 0.8, 1.6),
    jig: [0.5, 1.0], light: 0.4, size: [10, 20], power: 0.15, pitch: [R.second, 4], tags: ['school', 'bold', 'bait'],
    model: { kind: 'fish', h: 0.26, w: 0.18, sides: 3, top: P.snow2, side: P.glow3, belly: P.air8, fin: P.snow3, pattern: 'plain', eye: 0x101418, tail: 'shard', fins: 'shard', sheen: 0.45, halo: { n: 5, color: P.air8, glow: 0.6, size: 0.02 }, dorsal: 'none', profile: 'kite' },
    codex: 'Its plates are mirrors, and a few float loose around it, held by nothing. Held up, they show the sky, but a slightly different sky, a few minutes behind.',
  },
  {
    id: 'tether_pike', name: 'Tether Lancet', rarity: 'rare',
    zones: { reach: 0.8, shallows: 0.3, vents: 0.3 }, depth: [10, 60], time: T(0.8, 1.1, 1, 1.3), bait: 3.2,
    jig: [0.6, 1.0], light: 0.2, size: [60, 140], power: 0.85, pitch: [R.unison, 2], tags: ['predator'],
    model: { kind: 'pike', h: 0.15, w: 0.12, sides: 6, top: P.body1, side: P.body4, belly: P.shell4, fin: P.body3, pattern: 'chain', pc: P.glow2, pglow: 0.6, eyes: { layout: 'row', n: 4, color: P.glow3, glow: 0.6 }, tail: 'tri', mandibles: P.shell4, spikes: { n: 4, h: 0.5, shard: true, color: P.body3 }, dorsal: 'none', profile: 'kite' },
    codex: 'A long, patient hunter whose markings link and glow like a tether. It waits where the small creatures gather, and so, eventually, do you.',
  },

  // ---------------------------------------------------------------- the Vent Field
  {
    id: 'vent_gar', name: 'Ventneedle', rarity: 'common',
    zones: { vents: 1 }, depth: [4, 50], time: T(0.8, 1, 1.2, 1),
    jig: [0.4, 0.9], light: 0.3, size: [40, 90], power: 0.6, pitch: [R.fifth, 3], tags: ['warm'],
    model: { kind: 'gar', h: 0.13, w: 0.11, sides: 3, top: P.moss2, side: P.moss4, belly: P.body5, fin: P.moss3, pattern: 'spots', pc: P.rust, pglow: 0.6, eyes: { layout: 'cyclops', color: P.rust, glow: 0.4 }, tail: 'split', dorsal: 'none' },
    codex: 'It basks in the warm plumes with its needle pointed at the vent, like the needle of a dial, and its spots glow as the water warms.',
  },
  {
    id: 'mycelial_loach', name: 'Threadling', rarity: 'uncommon',
    zones: { vents: 0.9 }, depth: [10, 60], time: T(1.2, 1, 0.9, 1), bottom: true,
    jig: [0.05, 0.35], light: -0.4, size: [12, 26], power: 0.2, pitch: [R.third, 4], tags: ['warm', 'fungal', 'shy'],
    model: { kind: 'eel', h: 0.12, w: 0.1, top: P.moss3, side: P.moss4, belly: P.moss7, fin: P.moss3, pattern: 'filaments', pc: P.tundra6, eyes: { layout: 'none' }, feelers: { n: 5, len: 0.2, color: P.moss4, tip: P.tundra6 }, dorsal: 'none' },
    codex: 'Threads grow from its skin and root into whatever it rests on. It has no eyes; it feels its way along its own threads. Some threadlings are mostly thread.',
  },
  {
    id: 'ember_sculpin', name: 'Ember Bellows', rarity: 'uncommon',
    zones: { vents: 0.9, drop: 0.2 }, depth: [15, 62], time: T(1.6, 1, 0.6, 1.1),
    jig: [0.2, 0.6], light: 0, size: [10, 24], power: 0.3, pitch: [R.fourth, 3], tags: ['warm', 'night'],
    model: { kind: 'sculpin', h: 0.28, w: 0.2, top: P.moss3, side: P.moss1, belly: P.moss4, fin: P.moss3, pattern: 'gills', pc: P.rust, eyes: { layout: 'row', n: 2, color: P.rust, glow: 0.5 }, tail: 'round', core: P.rust, spikes: { n: 5, h: 0.4, color: P.moss1 }, dorsal: 'none', frills: { n: 3, color: P.moss3, tip: P.rust }, profile: 'bulb' },
    codex: 'Warm to the touch. The slits along its sides glow like coals when it breathes, slower and slower out of the water.',
  },
  {
    id: 'moss_carp', name: 'Moss Ark', rarity: 'common',
    zones: { vents: 1, shallows: 0.2 }, depth: [3, 35], time: T(0.6, 1.1, 1.4, 1),
    jig: [0.15, 0.5], light: 0, size: [30, 75], power: 0.55, pitch: [R.unison, 3], tags: ['warm', 'fungal'],
    model: { kind: 'fish', h: 0.36, w: 0.18, top: P.moss2, side: P.moss6, belly: P.moss7, fin: P.moss2, pattern: 'scales', pc: P.moss2, eyes: { layout: 'stalk' }, eye: 0x101418, tail: 'paddle', feelers: { n: 2, len: 0.2, color: P.moss4, tip: P.lime }, garden: { a: P.moss6, b: P.lime, glow: P.tundra6 }, dorsal: 'none' },
    codex: 'It grazes the mats around the vents. Moss grows on its back, and small things live in the moss: an ark that swims.',
  },
  {
    id: 'spiral_nautilid', name: 'Sequence Shell', rarity: 'rare',
    zones: { vents: 0.6, reach: 0.3, drop: 0.4 }, depth: [30, 110], time: T(1.3, 1, 0.8, 1),
    jig: [0.0, 0.18], light: -0.2, size: [12, 28], power: 0.4, pitch: [R.seventh, 2], tags: ['deep', 'shy'],
    model: { kind: 'shell', h: 1, w: 0.5, top: P.body5, side: P.shell4, belly: P.rust, fin: P.apart2, pattern: 'bands', pc: P.glow2, eyes: { layout: 'cyclops', color: P.glow3, glow: 0.6 } },
    codex: 'Its chambers grow 1, 1, 2, 3, 5, 8. It seals each one behind it and never goes back. Its tentacles light at the tips when it counts.',
  },
  {
    id: 'root_eel', name: 'Rootcoil', rarity: 'uncommon',
    zones: { vents: 0.7, drop: 0.3 }, depth: [20, 90], time: T(1.2, 0.9, 0.7, 1.5),
    jig: [0.25, 0.6], light: 0.1, size: [50, 120], power: 0.65, pitch: [R.second, 2], tags: ['warm', 'fungal'],
    model: { kind: 'eel', segments: 5, h: 0.09, w: 0.08, top: P.moss1, side: P.moss3, belly: P.moss4, fin: P.moss4, pattern: 'roots', pc: P.lime, eyes: { layout: 'row', n: 3, color: P.lime, glow: 0.5 }, dorsal: 'none' },
    codex: 'Its fins branch like roots looking for soil, and light where they divide. In the tank it holds very still and tries to grow.',
  },

  // ---------------------------------------------------------------- the Drop
  {
    id: 'prime_sturgeon', name: 'Prime Warden', rarity: 'rare',
    zones: { drop: 0.9, reach: 0.3 }, depth: [80, 150], time: ANY, bottom: true,
    jig: [0.15, 0.45], light: -0.1, size: [90, 220], power: 1.0, pitch: [R.unison, 1], tags: ['deep'],
    model: { kind: 'sturgeon', h: 0.16, w: 0.15, sides: 6, top: P.body3, side: P.shell2, belly: P.shell4, fin: P.body3, pattern: 'scutes', pc: P.glow3, eyes: { layout: 'row', n: 2, color: P.glow3, glow: 0.4 }, tail: 'shark', halo: { n: 5, color: P.shell4, glow: 0.3, size: 0.034 } },
    codex: 'Rows of plates lit faintly: two, three, five, seven, eleven, and five more that drift around it, held by nothing, like the orbs of the Guardians. Theorem\'s notes stop there, then go on in another hand: "thirteen, on the largest."',
  },
  {
    id: 'hush_angler', name: 'Hushlight', rarity: 'rare',
    zones: { drop: 1 }, depth: [100, 150], time: T(1.6, 0.6, 0.25, 0.8),
    jig: [0.0, 0.05], light: -1, size: [30, 70], power: 0.6, pitch: [R.fourth, 1], tags: ['deep', 'shy', 'night'],
    model: { kind: 'angler', h: 0.5, w: 0.4, top: P.void, side: P.ink, belly: P.body2, fin: P.ink, pattern: 'teeth', pc: P.red, lure: P.glow3, eyes: { layout: 'none' }, mouthRing: P.red, dorsal: 'none', frills: { n: 3, color: P.ink, tip: P.red }, tail: 'veil' },
    codex: 'It has no eyes and does not hunt. It waits in the dark with its small light until something mistakes the light for the way out.',
  },
  {
    id: 'lattice_eel', name: 'Lattice Strand', rarity: 'uncommon',
    zones: { drop: 0.9, reach: 0.2 }, depth: [70, 150], time: T(1.4, 1, 0.7, 1),
    jig: [0.3, 0.75], light: 0.3, size: [60, 150], power: 0.7, pitch: [R.third, 1], tags: ['deep', 'night'],
    model: { kind: 'eel', segments: 6, h: 0.1, w: 0.1, sides: 4, top: P.apart2, side: P.apart2, belly: P.apart3, fin: P.apart2, finGlow: 0.3, pattern: 'lattice', pc: P.red, eyes: { layout: 'ring', n: 4, color: P.glow3, glow: 0.6 } },
    codex: 'Its markings make a lattice that tiles perfectly along its whole length, except for one cell, near the tail, that never fits.',
  },
  {
    id: 'orb_gulper', name: 'Orb Herald', rarity: 'rare',
    zones: { drop: 0.8 }, depth: [90, 150], time: T(1.2, 1, 0.8, 1), bait: 2.6,
    jig: [0.35, 0.8], light: 0.5, size: [40, 100], power: 0.8, pitch: [R.fifth, 1], tags: ['deep', 'predator', 'bold'],
    model: { kind: 'gulper', h: 0.4, w: 0.3, top: P.apart1, side: P.ink, belly: P.apart2, fin: P.ink, pattern: 'plain', orb: P.glow3, eyes: { layout: 'ring', n: 5, color: P.glow2, glow: 0.7 }, feelers: { n: 3, len: 0.3, color: P.ink, tip: P.glow2 }, dorsal: 'none', frills: { n: 4, color: P.ink, tip: P.glow2 }, tail: 'tri' },
    codex: 'An orb hangs above its head, held there by nothing anyone can find, like the orbs of the Guardians. It follows the orb. Or the orb leads it.',
  },
  {
    id: 'aurora_wisp', name: 'Aurora Wisp', rarity: 'rare',
    zones: { reach: 0.6, drop: 0.6, shallows: 0.4, vents: 0.3 }, depth: [2, 40], time: T(1, 0, 0, 0.1), aurora: [0.45, 0.65],
    jig: [0.45, 0.85], light: 0.8, size: [6, 14], power: 0.15, pitch: [R.seventh, 4], tags: ['night', 'bold', 'school'],
    model: { kind: 'fish', h: 0.3, w: 0.26, sides: 6, top: P.glow1, side: P.glow2, belly: P.glow3, fin: P.tundra6, finGlow: 0.6, pattern: 'plain', eyes: { layout: 'cyclops', color: 0xffffff, glow: 1 }, glow: 0.7, tail: 'veil', fins: 'none', halo: { n: 4, color: P.glow3, glow: 1, size: 0.014 }, dorsal: 'none', profile: 'teardrop' },
    codex: 'It rises only under a strong aurora and glows in its colors. On nights when a seeker moves, they rise in hundreds.',
  },
  {
    id: 'the_listener', name: 'The Listener', rarity: 'legendary', observe: true,
    zones: { drop: 1 }, depth: [120, 150], time: T(1, 0, 0, 0),
    jig: [0, 0.02], light: -1, size: [4000, 4000], power: 0, pitch: [R.unison, 0], tags: ['deep'],
    model: { kind: 'listener' },
    codex: 'It did not take the lure. It rose out of the deep, slowly, the size of the dark itself, and stayed a while beneath the ice. It was listening too.',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
export const CATCHABLE = SPECIES.filter((s) => !s.observe);

// Size as a fraction of the species' range: 0 smallest .. 1 largest.
export function sizeFrac(sp, cm) {
  return Math.max(0, Math.min(1, (cm - sp.size[0]) / (sp.size[1] - sp.size[0])));
}

// Weight from length, by body shape (a cube law).
export function weightKg(sp, cm) {
  const k = { fish: 0.011, eel: 0.0018, ray: 0.016, flat: 0.013, sculpin: 0.016, pike: 0.0065, gar: 0.005, sturgeon: 0.0075, angler: 0.022, gulper: 0.012, shell: 0.03 }[sp.model.kind] || 0.01;
  return k * Math.pow(cm, 3) / 1000;
}

export function formatWeight(kg) {
  if (kg < 1) return `${Math.max(1, Math.round(kg * 1000))} g`;
  if (kg < 10) return `${kg.toFixed(2)} kg`;
  return `${kg.toFixed(1)} kg`;
}

export const JIG_STYLES = [
  { max: 0.06, name: 'Still' },
  { max: 0.24, name: 'Slow lifts' },
  { max: 0.48, name: 'Steady jigs' },
  { max: 0.72, name: 'Quick jigs' },
  { max: 2, name: 'Frantic' },
];
export function jigStyle(a) {
  return JIG_STYLES.find((s) => a <= s.max).name;
}
export function preferredStyle(sp) {
  const mid = (sp.jig[0] + sp.jig[1]) / 2;
  return jigStyle(mid);
}

export function toneOf(sp) {
  const [ratio, oct] = sp.pitch;
  return 48 * ratio * Math.pow(2, oct);
}
