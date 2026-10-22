// The hangar: the ships one can fly. Each is the Seed's hull changed (hull.js), with its
// own colors, wings, core and plasma, its own cabin (the cockpit and the galley are the
// same in all of them, the rest is its own), and its own way of flying:
//   speed  cruising speed, m/s          boost  how much the boost adds (of the speed)
//   turn   the fastest turn, rad/s      tank   the plasma tank, times the upgraded one
//   scan   how fast it scans (times)
// Bought in the SHOP with DATA; once bought, boarded whenever one likes. What each is
// built for decides which creatures (species.js) it chases best, which is not said.

export const SHIPS = [
  {
    id: 'seed', name: 'SEED', price: 0,
    line: 'The survey craft. Dark, ribbed like a vine, even in everything.',
    inside: 'A seat, a coffee machine, a bunk.',
    fly: { speed: 24, boost: 1.4, turn: 0.5, tank: 1, scan: 1 },
    hull: { bays: 0, nose: 1, tail: 1, pw: 2.7 },
    look: {
      top: 0x20242a, side: 0x262b32, belly: 0x181c20, seam: 0x313c43, rim: 0x6c7983, rib: 0x0f0e16, fin: 0x181c20, edge: 0x353e50,
      ribs: 'vine', fins: 'swept', core: 0x91cbde, plasma: [0xb4dcf5, 0x8a7bd8],
    },
    cabin: { wall: 0x20242a, wall2: 0x262b32, dark: 0x181c20, vine: 0x0f0e16, plate: 0x2a2f32, runner: 0x353e50, edge: 0x4f5d73, pale: 0x94a6b1, lamp: 0xe6c9a0, rooms: [], books: [] },
  },
  {
    id: 'heron', name: 'HERON', price: 400,
    line: 'Long and pale, quick on the straight and slow to turn.',
    inside: 'A gallery: a bench under the windows, a map table, two books.',
    fly: { speed: 30, boost: 1.3, turn: 0.4, tank: 1, scan: 1 },
    hull: { bays: 1, nose: 1.32, tail: 1.25, pw: 2.5, band: [-0.22, 0.3] },
    look: {
      top: 0xe4e4dc, side: 0xd2d3cb, belly: 0x8a8e8c, seam: 0xc2c4bc, rim: 0x3a3d40, rib: 0x5d6062, fin: 0xd8d8d0, edge: 0x3a3d40,
      ribs: 'bands', fins: 'long', core: 0xf3e3b5, plasma: [0xfff1c9, 0xd9a65a], window: 0xd8b98a,
    },
    cabin: { wall: 0x6f7375, wall2: 0x7b7f80, dark: 0x3b3e41, vine: 0x2a2c30, plate: 0x5d6163, runner: 0x7a5f45, edge: 0xb8b2a2, pale: 0xd8d2c0, lamp: 0xf0dcb4, rooms: ['gallery'], books: ['guide', 'log'] },
  },
  {
    id: 'moth', name: 'MOTH', price: 800,
    line: 'Round and soft-winged. Turns on a leaf, sips its plasma, scans quickly.',
    inside: 'A reading nook: shelves of books, an armchair, a lamp.',
    fly: { speed: 21, boost: 1.5, turn: 0.72, tank: 1.3, scan: 1.25 },
    hull: { bays: 1, nose: 1, tail: 0.95, pw: 2.3, sy: 1.04 },
    look: {
      top: 0x5b4636, side: 0x4d3b2e, belly: 0x2e241d, seam: 0x6b5442, rim: 0xc9a26b, rib: 0x2a1f18, fin: 0x6b5442, edge: 0xc9a26b,
      ribs: 'vine', fins: 'moth', core: 0xffb35c, plasma: [0xffd29a, 0xd9665a], window: 0xe0a768,
    },
    cabin: { wall: 0x3a2c22, wall2: 0x45342a, dark: 0x261c16, vine: 0x1a120d, plate: 0x4a382b, runner: 0x6b4a33, edge: 0x8a6a4a, pale: 0xc9b28f, lamp: 0xffc98a, rooms: ['nook'], books: ['poems', 'coffee', 'tales'] },
  },
  {
    id: 'kestrel', name: 'KESTREL', price: 1500,
    line: 'Low, black and sharp. The fastest thing in the fog, and a small tank for it.',
    inside: 'Cramped: a seat, the coffee, a bunk. Nothing else.',
    fly: { speed: 33, boost: 1.8, turn: 0.6, tank: 0.85, scan: 1.1 },
    hull: { bays: 0, nose: 1.22, tail: 1.1, pw: 3.2, sy: 0.96, band: [-0.14, 0.16] },
    look: {
      top: 0x121118, side: 0x18161f, belly: 0x0c0b10, seam: 0x241f30, rim: 0x7a3dff, rib: 0x08070c, fin: 0x15131c, edge: 0x5a3f7a,
      ribs: 'plates', fins: 'delta', rimGlow: 0.9, core: 0xc77dff, plasma: [0xe6c8ff, 0x7a3dff], window: 0x7a5fb0,
    },
    cabin: { wall: 0x15141c, wall2: 0x1b1a24, dark: 0x0e0d14, vine: 0x08070c, plate: 0x1e1c28, runner: 0x2a2438, edge: 0x5a3f7a, pale: 0x8a7aa6, lamp: 0xd9b8ff, rooms: [], books: [] },
  },
  {
    id: 'ark', name: 'ARK', price: 3000,
    line: 'A house that flies. Slow and steady, a deep tank, a long-eared scanner.',
    inside: 'A lounge, a library of every book, a garden under lamps.',
    fly: { speed: 20, boost: 1.35, turn: 0.42, tank: 1.6, scan: 1.35 },
    hull: { bays: 3, nose: 1.05, tail: 1.1, pw: 2.6, sy: 1.08, band: [-0.2, 0.26] },
    look: {
      top: 0x46594f, side: 0x3d4f46, belly: 0x232d29, seam: 0x52665b, rim: 0xb9a87b, rib: 0x9c8a5e, fin: 0x34443d, edge: 0xb9a87b,
      ribs: 'bands', fins: 'ring', core: 0x8ff0c0, plasma: [0xd2ffe8, 0x3fa7a0], window: 0xd9a860, dome: true, lanterns: true,
    },
    cabin: { wall: 0x2f3a36, wall2: 0x36423d, dark: 0x1f2725, vine: 0x141a18, plate: 0x3a4540, runner: 0x5a4a3a, edge: 0x6f8a7e, pale: 0xc2c9b8, lamp: 0xf3d6a6, rooms: ['lounge', 'library', 'garden'], books: ['guide', 'strata', 'log', 'poems', 'coffee', 'tales'] },
  },
];

export const shipById = (id) => SHIPS.find((s) => s.id === id) || SHIPS[0];


// the stats as pips (1 to 5) for the SHOP, from the least to the most in the hangar (TURN:
// how tight a circle it flies, its turn for its speed)
const stat = (s, k) => (k === 'turn' ? s.fly.turn / s.fly.speed : s.fly[k]);
const range = (k) => [Math.min(...SHIPS.map((s) => stat(s, k))), Math.max(...SHIPS.map((s) => stat(s, k)))];
export function pips(s) {
  const p = (k) => { const [a, b] = range(k); return 1 + Math.round(((stat(s, k) - a) / (b - a)) * 4); };
  return { SPEED: p('speed'), TURN: p('turn'), PLASMA: p('tank'), SCAN: p('scan'), ROOM: 1 + Math.round((s.hull.bays / 3) * 4) };
}
