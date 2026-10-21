import { load, save } from './store.js';

// Progress: DATA, and how deep the scanner reaches.
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
// Witnessed seekers are never touched by any of it.

export const BASE = 10;
export const WITNESSED = 40;
export const FIRST = 120;
export const STEP = 0.75;
export const GLIMPSE = 0.04;

export const costOf = (depth) => FIRST * Math.pow(2, depth - 1);     // to reach this depth
export const valueOf = (e) => (e.kind === 'wild' ? BASE * (1 + (e.depth || 0)) : e.special ? WITNESSED : BASE);

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
  }
  save() { save('progress', { data: this.data, depth: this.depth, earned: this.earned, deepest: this.deepest }); }
  get next() { return costOf(this.depth + 1); }
  get canBuy() { return this.data >= this.next; }
  // the scans not yet transmitted, and what they are worth together
  unsent(codex) {
    const list = codex.filter((e) => !e.sent);
    return { list, value: list.reduce((s, e) => s + valueOf(e), 0) };
  }
  credit(n) { this.data += n; this.earned += n; this.save(); }
  buy() {
    if (!this.canBuy) return false;
    this.data -= this.next;
    this.depth++;
    this.save();
    return true;
  }
  met(depth) { if (depth > this.deepest) { this.deepest = depth; this.save(); } }
}
