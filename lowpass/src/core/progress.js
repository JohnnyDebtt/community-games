import { load, save } from './store.js';
import { SHIPS } from '../ship/designs.js';

// Progress: DATA, and what it buys: how deep the scanner reaches (without end), how much
// plasma the tank holds and how often signals are picked up out of the fog (five levels
// each; each starts below where it once stood and ends a little above).
//
// Every scan in the Codex can be transmitted once, for DATA; it stays in the Codex (and on
// the leaderboard) either way. A wild scan is worth BASE, and BASE more for every depth it
// came from (linear); a witnessed one, WITNESSED. DATA buys depth: the first costs
// FIRST (twelve plain scans), each next one twice the last, without end.
//
// Depth decides what the wild artifacts are. Each one starts at the surface and goes one
// depth deeper with STEP's chance, as far as the scanner reaches: so the newest depth is
// the most common right after it is bought (three in four, at the first), and rarer with
// every one after (the top of a deep scanner is the rarest thing it finds). Now and then
// (GLIMPSE) one comes from beyond the scanner's reach: one depth deeper, sometimes two.
// Rarer still (PLUS), a deep one is one of the marked: a form of its own, larger, its name
// with a +, worth PLUS_VALUE times what its depth's are. And now and then (CREATURE), at
// any depth, a wild one is a creature that flees: hard to scan, worth CREATURE_VALUE
// times its depth's.
// Witnessed seekers are never touched by any of it.
//
// Ships (designs.js): bought once with DATA, then boarded whenever one likes; the Seed is
// everyone's from the start.
//
// The plasma tank: seconds of a full boost (TANK, by level); the core gathers it back at
// REFILL seconds' worth a second, so a small tank fills sooner. Signal gain: the seconds
// between wild artifacts, once the last is behind (GAIN, by level).

export const BASE = 10;
export const WITNESSED = 40;
export const FIRST = 120;
export const STEP = 0.75;
export const GLIMPSE = 0.04;
export const PLUS = 0.02;          // a deep one is one of the marked (+)
export const PLUS_VALUE = 10;      // and worth this many times its depth's
export const CREATURE = 0.08;      // a wild one is a creature that flees (species.js)
export const CREATURE_VALUE = 4;   // and worth this many times its depth's
export const LANDING = 0.035;      // a wild one is a clearing to land in (clearing.js)
export const LANDING_DEPTH = 3;    // once the scanner reaches this deep (and nothing says so)
export const CURIO_VALUE = 2;      // a thing found on foot about a clearing (curios.js)

export const TANK = [5, 7, 9, 11, 13, 15];
export const REFILL = 0.24;
export const GAIN = [[100, 170], [88, 150], [78, 132], [68, 118], [60, 104], [52, 92]];
// what each level of the capped ones costs (the first entry buys level one)
const COSTS = { tank: [40, 80, 130, 200, 300], gain: [80, 150, 250, 380, 550] };
export const MAX = { tank: COSTS.tank.length, gain: COSTS.gain.length };

export const costOf = (depth) => FIRST * Math.pow(2, depth - 1);     // to reach this depth
export const valueOf = (e) => (e.kind === 'wild' ? BASE * (1 + (e.depth || 0)) * (e.plus ? PLUS_VALUE : 1) * (e.creature ? CREATURE_VALUE : e.ground ? CURIO_VALUE : 1) : e.special ? WITNESSED : BASE);

export function rollDepth(reach, rand = Math.random) {
  if (rand() < GLIMPSE) return reach + (rand() < 0.15 ? 2 : 1);
  let d = 0;
  while (d < reach && rand() < STEP) d++;
  return d;
}

export class Progress {
  constructor() {
    const s = load('progress', {});
    this.data = s.data || 0;          // DATA in hand
    this.depth = s.depth || 0;        // how deep the scanner reaches
    this.earned = s.earned || 0;      // all DATA ever received
    this.deepest = s.deepest || 0;    // the deepest artifact ever met
    this.tank = s.tank || 0;          // the plasma tank's level
    this.gain = s.gain || 0;          // the signal gain's level
    this.ships = s.ships || ['seed'];  // the ships bought
    this.ship = this.ships.includes(s.ship) ? s.ship : 'seed';   // the one boarded
  }
  save() { save('progress', { data: this.data, depth: this.depth, earned: this.earned, deepest: this.deepest, tank: this.tank, gain: this.gain, ships: this.ships, ship: this.ship }); }
  owns(id) { return this.ships.includes(id); }
  canShip(id) { const d = SHIPS.find((x) => x.id === id); return !!d && !this.owns(id) && this.data >= d.price; }
  buyShip(id) {
    if (!this.canShip(id)) return false;
    this.data -= SHIPS.find((x) => x.id === id).price;
    this.ships.push(id);
    this.save();
    return true;
  }
  board(id) { if (!this.owns(id) || this.ship === id) return false; this.ship = id; this.save(); return true; }
  get tankSecs() { return TANK[Math.min(this.tank, TANK.length - 1)]; }
  get gap() { return GAIN[Math.min(this.gain, GAIN.length - 1)]; }
  // what the next step of an upgrade costs (null: at its last level)
  cost(kind) { return kind === 'depth' ? costOf(this.depth + 1) : COSTS[kind][this[kind]] ?? null; }
  can(kind) { const c = this.cost(kind); return c !== null && this.data >= c; }
  get anyCan() { return ['depth', 'tank', 'gain'].some((k) => this.can(k)) || SHIPS.some((d) => this.canShip(d.id)); }
  // the scans not yet transmitted, and what they are worth together
  unsent(codex) {
    const list = codex.filter((e) => !e.sent);
    return { list, value: list.reduce((s, e) => s + valueOf(e), 0) };
  }
  credit(n) { this.data += n; this.earned += n; this.save(); }
  buy(kind) {
    if (!this.can(kind)) return false;
    this.data -= this.cost(kind);
    this[kind]++;
    this.save();
    return true;
  }
  met(depth) { if (depth > this.deepest) { this.deepest = depth; this.save(); } }
}
