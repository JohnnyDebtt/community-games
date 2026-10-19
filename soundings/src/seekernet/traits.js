// What a seeker does on the ice. Its traits never change, so its character is fixed;
// its live state decides how strongly it does it.
//
//   Floating Object  its Overdrive: one big ability, charged by your catches and by the
//                    charge SEEKER NET releases (and its jig rhythm as a device)
//   Head, Back, Flank  one perk each, always on
//   Loadout          Bare seekers carry nothing and make up for it
//   Overcharge       charge above 9,000 keeps growing after activation: the seeker's level,
//                    each level 10% stronger
//   Activation       only activated seekers wake for the ice

// Rhythms on the 90 BPM grid: a 16-step bar, steps where it lifts the lure.
const primes = [0, 2, 3, 5, 7, 11, 13];
export const RHYTHMS = {
  even: { name: 'Even taps', steps: [0, 4, 8, 12], activity: 0.42, text: 'taps the lure evenly, once a beat' },
  prime: { name: 'Prime taps', steps: primes, activity: 0.5, text: 'taps on the prime steps of every bar' },
  roll: { name: 'Slow rolls', steps: [0, 8], activity: 0.2, text: 'rolls the lure slowly, twice a bar' },
  lively: { name: 'Lively jigs', steps: [0, 2, 4, 6, 8, 10, 12, 14], activity: 0.75, text: 'jigs quickly, twice a beat' },
  sweep: { name: 'Slow sweeps', steps: [0], activity: 0.12, text: 'lifts the lure once a bar and lets it fall' },
  fib: { name: 'Fibonacci drift', steps: [0, 1, 2, 3, 5, 8, 13], activity: 0.38, text: 'lifts on steps 1, 2, 3, 5, 8, 13' },
  still: { name: 'Stillness', steps: [], activity: 0.02, text: 'holds the lure perfectly still and listens' },
};

export const OBJECT_RHYTHM = {
  Keyboard: 'even', 'Classic Keyboard': 'even', 'Compact Keyboard': 'even', 'Split Keyboard': 'even',
  Numpad: 'prime', Mouse: 'roll', Trackball: 'roll', Joystick: 'lively', Gamepad: 'lively',
  'Fader Deck': 'sweep', 'Dial Deck': 'fib', Datasette: 'still', 'Floppy Drive': 'still', 'Codex Slate': 'still',
};

// Overdrives: count = catches it lasts, secs = seconds.
export const OVERDRIVES = {
  autoreel: { name: 'Autoreel', count: 3, short: 'reels the next 3 fish in for you', text: 'Types the catch out for you: the next 3 fish reel themselves in, clean.' },
  prime: { name: 'Prime Count', count: 3, short: 'triple data on the next 3 catches', text: 'Counts in primes: the next 3 catches give three times the Codex data.' },
  point: { name: 'Point & Click', count: 2, short: 'the next 2 bites are the rarest fish here', text: 'Picks its target: the next 2 bites are the rarest fish this water holds, unrecorded ones first.' },
  frenzy: { name: 'Frenzy', secs: 30, short: '30 s of fish rushing to your lure', text: 'Plays the sea like a game: for 30 seconds fish rush in, a bite every few seconds, and your band is taller.' },
  crescendo: { name: 'Crescendo', count: 3, short: 'the next 3 catches are trophy-sized', text: 'Pushes every fader up: the next 3 catches are trophy-sized.' },
  lockon: { name: 'Lock-on', secs: 45, short: '45 s in which no fish can get away', text: 'Dials in the line: for 45 seconds a hooked fish cannot get away, and the catch bar only fills.' },
  deepscan: { name: 'Deep Scan', secs: 60, short: '60 s of seeing every fish, bites twice as fast', text: 'Reads the whole sea: for 60 seconds you see every fish under the ice, the sonar names them, and they bite twice as fast.' },
};

export const OBJECT_OVERDRIVE = {
  Keyboard: 'autoreel', 'Classic Keyboard': 'autoreel', 'Compact Keyboard': 'autoreel', 'Split Keyboard': 'autoreel',
  Numpad: 'prime', Mouse: 'point', Trackball: 'point', Joystick: 'frenzy', Gamepad: 'frenzy',
  'Fader Deck': 'crescendo', 'Dial Deck': 'lockon', Datasette: 'deepscan', 'Floppy Drive': 'deepscan', 'Codex Slate': 'deepscan',
};

// Perks. mods (numbers grow with level unless noted):
//   bite      fish come sooner (+0.4 = 40% sooner)    nightBite, dayBite  the same, at night or by day
//   band      taller catch band                       drain     slower drain (negative)
//   fishSpeed the fish moves slower (negative)        reel      the bar fills faster
//   window    longer to hook (+1 = twice)             warn      a chime before a bite (flag)
//   id        names the fish and its size on a bite (flag)
//   second    second chances per fish (count)         grace     seconds with no drain at the start
//   odRate    Overdrive charges faster                walk      you move faster
//   devRate   devices fish faster                     devHold   devices hold a bite longer
//   loud      device calls carry everywhere (flag)    freeze    holes never freeze (flag)
//   drill     holes open at once (flag)               size      catches run larger
//   rime      rimed variants more often
export const PERKS = {
  Head: {
    Beacon: { icon: 'beacon', text: 'At night, fish come twice as fast', mods: { nightBite: 1 }, light: 0.25 },
    Dish: { icon: 'signal', text: 'Listens far: fish come 40% sooner', mods: { bite: 0.4 } },
    'Heat Sink': { icon: 'sun', text: 'Holes never freeze; warm-water fish twice as often', mods: { freeze: true }, aff: { warm: 1 } },
    'Ice Crystals': { icon: 'flake', text: 'Cold-water fish twice as often; more rimed fish', mods: { rime: 1 }, aff: { cold: 1 } },
    Mushrooms: { icon: 'dot', text: 'Fungal fish three times as often', aff: { fungal: 2 } },
    Periscope: { icon: 'eye', text: 'Names each fish and its size when it bites', mods: { id: true } },
    Propeller: { icon: 'arrowR', text: 'Hovers, and tows you: you move 25% faster', mods: { walk: 0.25 }, hover: true },
    'Rabbit Ears': { icon: 'signal', text: 'Chimes before a bite; twice as long to hook it', mods: { window: 1, warn: true } },
    'Sonic Emitter': { icon: 'ring', text: 'Fish come 60% sooner, but shy fish keep away', mods: { bite: 0.6 }, aff: { shy: -0.7 } },
    'Work Lamp': { icon: 'beacon', text: 'Bold fish twice as often; lights your way', aff: { bold: 1 }, light: 0.3 },
  },
  Back: {
    Banner: { icon: 'pin', text: 'Your devices hold a bite three times as long', mods: { devHold: 2 } },
    'Battery Pack': { icon: 'spark', text: 'Overdrive charges twice as fast', mods: { odRate: 1 } },
    'Coolant Tank': { icon: 'flake', text: 'Hooked fish tire: 30% slower on the catch bar', mods: { fishSpeed: -0.3 } },
    'Exhaust Pipes': { icon: 'sun', text: 'Melts the ice: holes open at once; more warm fish', mods: { drill: true }, aff: { warm: 0.5 } },
    'Signal Mast': { icon: 'signal', text: 'Your devices fish 50% faster and call you from anywhere', mods: { devRate: 0.5, loud: true } },
    Sword: { icon: 'cross', text: 'A second chance: each fish that would escape is held once', mods: { second: 1 } },
    'Tesla Coil': { icon: 'bolt', text: 'Deep-water fish twice as often, and 20% larger', mods: { size: 0.2 }, aff: { deep: 1 } },
  },
  Flank: {
    'Plug Cable': { icon: 'chain', text: 'Wired to your devices: they fish twice as fast', mods: { devRate: 1 } },
    'Robot Arms': { icon: 'hook', text: 'Your catch band is 40% taller', mods: { band: 0.4 } },
    'Solar Wings': { icon: 'sun', text: 'By day, fish come twice as fast', mods: { dayBite: 1 } },
    Speakers: { icon: 'ring', text: 'Plays to the fish: 35% sooner, and they reel 20% faster', mods: { bite: 0.35, reel: 0.2 } },
    'Sword and Shield': { icon: 'cross', text: 'The catch bar drains half as fast', mods: { drain: -0.5 } },
    'Thruster Pods': { icon: 'arrowR', text: 'Hovers, and boosts you: you move 25% faster', mods: { walk: 0.25 }, hover: true },
    'Wrench Arm': { icon: 'gear', text: 'No escapes in the first 4 s of a catch; holes never freeze', mods: { grace: 4, freeze: true } },
  },
};
const BARE = { icon: 'ring', text: 'Carries nothing: Overdrive charges 50% faster, and shy fish trust it', mods: { odRate: 0.5 }, aff: { shy: 1 } };

// Level from overcharge (charge above 9,000, growing 50 a day and from other activated
// seekers' moves).
export const LEVELS = [0, 100, 300, 600, 1000, 1600];
export function levelOf(overcharge) {
  let l = 0;
  for (let i = 1; i < LEVELS.length; i++) if (overcharge >= LEVELS[i]) l = i;
  return l;
}

const COUNTS = new Set(['second']);
const FLAGS = new Set(['warn', 'id', 'loud', 'freeze', 'drill']);

// A device profile from a seeker's traits and live state.
export function deviceProfile(traits, state) {
  const over = state.overcharge || 0;
  const level = levelOf(over);
  const potency = 1 + level * 0.1;
  const m = {
    bite: 0, nightBite: 0, dayBite: 0, band: 0, drain: 0, fishSpeed: 0, reel: 0, window: 0, warn: false, id: false,
    second: 0, grace: 0, odRate: 0, walk: 0, devRate: 0, devHold: 0, loud: false, freeze: false, drill: false, size: 0, rime: 0,
  };
  const p = {
    rhythm: OBJECT_RHYTHM[traits['Floating Object']] || 'even',
    overdrive: OBJECT_OVERDRIVE[traits['Floating Object']] || 'frenzy',
    object: traits['Floating Object'],
    level, potency, overcharge: over, next: LEVELS[level + 1] ?? null,
    perks: [], aff: {}, light: 0, hover: false, mods: m,
  };
  const apply = (slot, trait, e) => {
    for (const [k, v] of Object.entries(e.mods || {})) {
      if (FLAGS.has(k)) m[k] = m[k] || v;
      else if (COUNTS.has(k)) m[k] += v;
      else m[k] += v * potency;
    }
    for (const [k, v] of Object.entries(e.aff || {})) p.aff[k] = (p.aff[k] || 0) + (v > 0 ? v * potency : v);
    p.light += e.light || 0;
    if (e.hover) p.hover = true;
    p.perks.push({ slot, trait, icon: e.icon, text: e.text });
  };
  for (const slot of ['Head', 'Back', 'Flank']) {
    const e = traits[slot] && PERKS[slot][traits[slot]];
    if (e) apply(slot, traits[slot], e);
  }
  if (traits.Loadout === 'Bare') apply('Loadout', 'Bare', BARE);
  p.activated = !!state.activated;
  p.brightness = Math.max(0.15, Math.min(1, 0.6 + p.light + (traits.Loadout === 'Bare' ? -0.3 : 0)));
  p.rhythmInfo = RHYTHMS[p.rhythm];
  p.od = OVERDRIVES[p.overdrive];
  return p;
}
