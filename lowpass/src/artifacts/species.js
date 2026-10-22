import { stratum, roman } from './strata.js';

// The creatures: wild artifacts that fly, and flee. Now and then (CREATURE, progress.js)
// a wild one at any depth is a living thing instead of a thing: it hangs in the air until
// the ship comes near, then runs. It must be chased down and scanned from close by, for a
// long while, without losing it (field.js flies them). Each species flees its own way, so
// each ship has the ones it is best at:
//   speed   how fast it flies, fresh (m/s); sprint, its bursts
//   turn    how fast it can turn (rad/s); jink, how far it swerves (rad), how often (s)
//   weave   a steady swaying of its course (rad, seconds a sway)
//   stamina seconds of being chased before it tires (spent, it is slower than any ship,
//           swerves hardly at all, and flies on ahead)
//   range   how close the scan must be (m); scan, how long it takes (s, at the Seed's);
//           sights, how far off the nose it may be (rad, and more close by)
//   keep    how near it lets a ship come (m): it gives back whatever the ship gains
//   pace    close by, how fast it flies for the ship's cruising speed (fresh, spent): it
//           will not be run down, and one faster than the ship must be kept up with on the
//           boost (the manta and the darter have none: they fly their own speed)
//   best    the ships that chase it best: the two fastest to scan it in a simulated chase
//           (every ship against every species, a player's hands a little late); worth
//           running again whenever these change. Not shown anywhere: for players to find
// So the fast ships run down the mantas, cranes and jellies first, and the ones that turn
// tight hold the darters and the eels; but every creature tires in the end, and every
// ship can scan every one.

export const SPECIES = {
  darter: {
    cls: 'Sky darter', code: 'DRT', speed: 17, sprint: 34, turn: 3, jink: 1.5, jinkEvery: [0.8, 1.6], weave: [0.1, 2.2], stamina: 80,
    range: 70, scan: 9, keep: 22, sights: [0.34, 0.24], pace: null, best: ['moth', 'ark'],
    hint: 'It turns on a wingbeat.',
    nouns: ['Darter', 'Dragonfly', 'Needle', 'Flicker', 'Glint', 'Skimmer'],
  },
  manta: {
    cls: 'Sky manta', code: 'MNT', speed: 31, sprint: 42, turn: 0.6, jink: 0.6, jinkEvery: [2.5, 4.5], weave: [0.12, 8], stamina: 60,
    range: 90, scan: 8, keep: 26, pace: null, best: ['kestrel', 'heron'],
    hint: 'It outflies the slow.',
    nouns: ['Manta', 'Ray', 'Glider', 'Kite', 'Wing', 'Shadow'],
  },
  crane: {
    cls: 'Fog crane', code: 'CRA', speed: 28, sprint: 36, turn: 1.0, jink: 0.6, jinkEvery: [2.5, 4], weave: [0.12, 5], stamina: 70,
    range: 85, scan: 12, keep: 26, pace: [1.35, 0.95], best: ['kestrel', 'heron'],
    hint: 'It flies straight and far, faster than it looks.',
    nouns: ['Crane', 'Heron', 'Wader', 'Stilt', 'Pilgrim', 'Egret'],
  },
  eel: {
    cls: 'Ribbon eel', code: 'EEL', speed: 18, sprint: 26, turn: 1.8, jink: 0.6, jinkEvery: [2, 3.5], weave: [0.8, 3], stamina: 60,
    range: 55, scan: 11, keep: 18, pace: [1.0, 0.92], sights: [0.34, 0.24], best: ['moth', 'ark'],
    hint: 'It never flies straight, and will not be scanned quickly.',
    nouns: ['Eel', 'Ribbon', 'Oarfish', 'Streamer', 'Thread', 'Banner'],
  },
  jelly: {
    cls: 'Lantern jelly', code: 'JLY', speed: 20, sprint: 50, turn: 0.9, jink: 0.6, jinkEvery: [3, 5], weave: [0.1, 6], stamina: 40,
    range: 82, scan: 7, keep: 22, pace: [0.95, 0.88], best: ['kestrel', 'heron'], pulse: [2.2, 0.8],
    hint: 'It drifts, and then it bolts.',
    nouns: ['Jelly', 'Bell', 'Lantern', 'Drifter', 'Medusa', 'Parasol'],
  },
};
export const SPECIES_IDS = Object.keys(SPECIES);


// at the surface, the fog belt's own light
export const SURFACE = { name: 'Fog', title: 'the fog belt', light: 0xcfe8f0, second: 0xe8c36a, third: 0x8ca893, dark: 0x1d2229, irid: [0x2f4a5a, 0x9fd0dc, 0xf3ecd6] };

const ADJ = ['Quick', 'Shy', 'Pale', 'Restless', 'Silver', 'Wary', 'Bright', 'Hollow', 'Singing', 'Gentle', 'Startled', 'Lantern', 'Glass', 'Wandering'];
const OF = ['of the Fog', 'of the Long Light', 'of the Treetops', 'of Low Cloud', 'of the Under-Sky', 'of the Gold Hour', 'of Cold Air', 'of the Far Lakes'];

// d: the descriptor generate.js began; R1, R3: its own randoms
export function describeCreature(d, move, R1, R3) {
  const depth = d.depth, st = depth ? stratum(depth) : SURFACE;
  const sp = move.species && SPECIES[move.species] ? (R1(), move.species) : R1.pick(SPECIES_IDS);
  const S = SPECIES[sp];
  const P = { species: sp, spots: R1.int(3, 9), tail: R1.range(0.8, 1.25), hue: R1.range(0, 1) };
  d.family = 'creature';
  d.species = sp;
  d.params = P;
  d.size = (1 + 0.22 * Math.log2(1 + depth)) * R1.range(0.92, 1.1);
  d.accent = st.light;
  d.strength = 1.1 + Math.min(0.8, depth * 0.06);
  d.grand = false;
  const noun = R3.pick(S.nouns), r = R3();
  d.name = r < 0.45 ? `The ${depth ? st.name : R3.pick(ADJ)} ${noun}` : r < 0.8 ? `The ${R3.pick(ADJ)} ${noun}` : `${R3.pick(ADJ)} ${noun} ${R3.pick(OF)}`;
  d.code = `${depth ? `D${depth}-` : ''}${S.code}-${(move.seed || move.tx).slice(2, 6).toUpperCase()}`;
  d.cls = S.cls;
  d.structure = {
    darter: `A darter as long as the ship, four wings of light humming; it hangs, then is gone sideways.`,
    manta: `A manta of the under-sky, its wings ${Math.round(24 * d.size)} meters across, ${P.spots} lights along its back; it glides fast and turns wide.`,
    crane: `A crane of light, its neck stretched out, its legs trailing; it flies slow beats, and keeps flying.`,
    eel: `A ribbon of an eel swimming through the air in long curves, a fin of light along its back.`,
    jelly: `A jelly like a lantern, its bell breathing, its threads of light trailing; it drifts, and then it bolts.`,
  }[sp];
  d.hint = S.hint;
  d.origin = depth ? `From Depth ${roman(depth)}, ${st.title}: it flew up out of it. No other ship will find it.` : 'Wild: a creature of the fog belt, found by this ship alone.';
}
