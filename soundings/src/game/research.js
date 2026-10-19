// Research at the capsule, paid for with Codex data (what you have recorded).
// Longer lines open deeper water; mounts let SEEKER NET seekers fish beside you;
// the Seeker's own backpacks carry more.

export const RESEARCH = [
  { id: 'line1', group: 'Line', icon: 'spool', name: 'Line to 48 m', cost: 10, line: 48, text: 'The vent plumes, and the edge of the Glass Reach.' },
  { id: 'line2', group: 'Line', icon: 'spool', name: 'Line to 72 m', cost: 26, line: 72, requires: 'line1', text: 'Into the Reach, where the light gives out.' },
  { id: 'line3', group: 'Line', icon: 'spool', name: 'Line to 96 m', cost: 48, line: 96, requires: 'line2', text: 'The floor of the Reach, and the rim of the Drop.' },
  { id: 'line4', group: 'Line', icon: 'spool', name: 'Line to 144 m', cost: 80, line: 144, requires: 'line3', text: 'As deep as the Drop goes. Something large lives there.' },
  { id: 'mount1', group: 'SEEKER NET', icon: 'mount', name: 'Seeker mount', cost: 8, mounts: 1, text: 'A spare seeker keeps a hole you leave, and calls you to a bite.' },
  { id: 'mount2', group: 'SEEKER NET', icon: 'mount', name: 'Second mount', cost: 22, mounts: 2, requires: 'mount1', text: 'Two holes kept while you fish a third.' },
  { id: 'mount3', group: 'SEEKER NET', icon: 'mount', name: 'Third mount', cost: 44, mounts: 3, requires: 'mount2', text: 'A small network of your own on the ice.' },
  { id: 'pack2', group: 'Gear', name: 'Larger pack', cost: 16, pack: 2, text: 'The Seeker\'s second backpack.' },
  { id: 'pack3', group: 'Gear', name: 'Expedition pack', cost: 38, pack: 3, requires: 'pack2', text: 'The largest pack, bedroll and all.' },
  { id: 'auger', group: 'Gear', icon: 'auger', name: 'Sharpened auger', cost: 9, drill: 0.9, text: 'A keener edge on the drill.' },
  { id: 'lantern', group: 'Gear', icon: 'lantern', name: 'Lantern', cost: 14, text: 'Bold fish come to the light; shy ones keep away.' },
  { id: 'glowlure', group: 'Gear', icon: 'lure', name: 'Glow lure', cost: 28, text: 'Deep and night fish notice it.' },
];
export const RESEARCH_BY_ID = Object.fromEntries(RESEARCH.map((r) => [r.id, r]));

export const PACK_CAPACITY = { 1: 6, 2: 12, 3: 24 };

// What a piece of research changes, as numbers where it can.
for (const r of RESEARCH) {
  const prev = r.requires && RESEARCH.find((x) => x.id === r.requires);
  r.change = r.line ? () => `depth ${prev ? prev.line : 24} m → ${r.line} m`
    : r.mounts ? () => `seekers fishing for you ${r.mounts - 1} → ${r.mounts}`
      : r.pack ? () => `pack ${PACK_CAPACITY[r.pack - 1]} → ${PACK_CAPACITY[r.pack]} fish`
        : r.drill ? () => 'drilling 1.7 s → 0.9 s'
          : r.id === 'lantern' ? () => 'a light at your hip, on L'
            : () => 'a lure that glows in the dark';
}

export function lineMax(state) {
  let m = 24;
  for (const r of RESEARCH) if (r.line && state.research[r.id]) m = Math.max(m, r.line);
  return m;
}
export function mounts(state) {
  let m = 0;
  for (const r of RESEARCH) if (r.mounts && state.research[r.id]) m = Math.max(m, r.mounts);
  return m;
}
export function packLevel(state) {
  return state.research.pack3 ? 3 : state.research.pack2 ? 2 : 1;
}
export function packCapacity(state) {
  return PACK_CAPACITY[packLevel(state)];
}
export function drillTime(state) {
  return state.research.auger ? 0.9 : 1.7;
}
export function available(state, r) {
  return !state.research[r.id] && (!r.requires || state.research[r.requires]);
}
