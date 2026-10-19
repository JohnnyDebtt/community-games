import { START } from '../world/layout.js';

// Everything the game remembers, saved in this browser (localStorage). Saving can be
// unavailable (private windows, blocked storage); the game then simply plays on.

const KEY = 'soundings.save.v1';

export function newState() {
  return {
    v: 1,
    created: Date.now(),
    day: 1,
    t: 0.31,
    player: { x: START.x, z: START.z, facing: Math.PI },
    data: 0,
    dataTotal: 0,
    research: {},
    codex: {},            // species id -> { caught, kept, released, best, firstDay, variants: [], trophy }
    observed: {},
    creel: [],            // fish carried in the backpack
    tank: [],             // fish in the specimen tank
    holes: [],            // { id, x, z, freeze, open (polynya) }
    holeSeq: 1,
    pop: {},              // zone|species -> 0.35..1
    roster: [],           // tuned SEEKER NET tokens (activated only)
    watch: [],            // dormant tokens the relay watches until they activate
    companion: 0,
    devices: {},          // hole id -> token
    recovered: [],        // tokens pulled up from the bottom
    tethers: { home: true },
    net: null,
    lastRecoverDay: 0,
    lantern: false,
    sense: null,
    settings: { pixel: 'auto', master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.7, chain: true, hints: true, invertY: false, speed: 1, shake: true },
    stats: { catches: 0, released: 0, kept: 0, snapped: 0, seconds: 0, drilled: 0 },
    hints: {},
    introDone: false,
    od: { charge: 0 },     // the companion's Overdrive
    surges: {},           // token -> stored surges (it moved on-chain)
    beacons: [],          // seekers that woke on the ice, waiting to be met
    requests: [],         // field requests
    reqSeq: 1,
    reqDone: 0,
    weatherSeed: Math.floor(Math.random() * 1e9),
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1) return null;
    const base = newState();
    return { ...base, ...s, settings: { ...base.settings, ...(s.settings || {}) }, stats: { ...base.stats, ...(s.stats || {}) } };
  } catch {
    return null;
  }
}

export function saveState(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* nothing to clear */ }
}

export function exportState(s) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(s))));
}
export function importState(text) {
  const s = JSON.parse(decodeURIComponent(escape(atob(text.trim()))));
  if (!s || s.v !== 1) throw new Error('not a Soundings save');
  return s;
}
