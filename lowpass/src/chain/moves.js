import { BLOCKS_PER_SECOND } from './chain.js';
import { load, save } from '../core/store.js';
import { sweepSeed } from '../artifacts/generate.js';

// Watches SEEKER NET for moves while the game is open. A move made while you play is
// witnessed: the next artifact to appear for you is that move's, seeded by its
// transaction hash, so everyone who was flying when it happened meets the same one. Moves
// made while you were away are not replayed: the forest between them is yours alone
// (field.js grows a unique artifact for each player then). Witnessed moves wait for their
// artifact through a reload, but not for long.
//
// Every seeker that moved has its own: a transaction that moved several (a sweep) gives
// one for each, and moves that wait together come together, up to a wave's worth; the
// rest come in the next wave.
//
// The block clock is read here too: the head on start, and every poll.

const POLL_MS = 30000;
const KEEP_MS = 3600000;           // a witnessed move waits at most an hour for its artifact

export class MoveWatcher {
  constructor(chain, clock) {
    this.chain = chain;
    this.clock = clock;
    const s = load('witnessed', {});
    const cut = Date.now() - KEEP_MS;
    this.queue = (s.queue || []).filter((m) => (m.seenAt || 0) > cut);
    this.seen = new Set(s.seen || []);
    this.rate = s.rate || 1000 / BLOCKS_PER_SECOND;   // ms per block
    this.lastBlock = 0;
    this.status = 'connecting';
    this.onMove = null;          // (move) a move happened while playing
    this.onActivated = null;     // (token) an activation was recorded
    this.recent = [];            // moves witnessed this session
    this.head = null;
  }

  _persist() {
    save('witnessed', { queue: this.queue.slice(0, 20), seen: [...this.seen].slice(-300), rate: this.rate });
  }

  _enqueue(m) {
    if (this.seen.has(m.tx) || this.queue.some((q) => q.tx === m.tx)) return false;
    this.queue.push({ tx: m.tx, block: m.block, tokens: m.tokens, total: m.tokens.length, charge: m.charge, recipients: m.recipients, pool: m.pool, time: m.time, seenAt: Date.now(), live: true });
    return true;
  }

  async start() {
    try {
      const head = await this.chain.block('latest');
      this.head = head;
      if (this.clock) this.clock.observe(head.number);
      // calibrate the block clock against a block a day ago
      try {
        const back = await this.chain.block(head.number - 24 * 3600 * BLOCKS_PER_SECOND);
        if (back) this.rate = (head.time - back.time) / (head.number - back.number);
      } catch { /* keep the estimate */ }
      if (this.clock) this.clock.rate = this.rate;
      // only what happens from now on is witnessed
      this.lastBlock = head.number;
      this.status = 'live';
      this._persist();
      setTimeout(() => this._poll(), POLL_MS);
    } catch (e) {
      console.warn('SEEKER NET: offline; trying again in two minutes', e);
      this.status = 'offline';
      try {
        const snap = await fetch('assets/moves.json').then((r) => r.json());
        if (this.clock && this.clock.source === 'none') this.clock.seed(snap.block, snap.at);
      } catch { /* the clock keeps its own guess */ }
      setTimeout(() => this.start(), 120000);
    }
  }

  async _poll() {
    try {
      const n = await this.chain.blockNumber();
      if (this.clock) this.clock.observe(n, this.rate);
      if (n > this.lastBlock) {
        const events = await this.chain.events(this.lastBlock + 1, n);
        this.head = { number: n, time: Date.now() };
        for (const e of events) {
          if (e.kind === 'move' && !e.burn) {
            e.time = Date.now() - (n - e.block) * this.rate;
            if (this._enqueue(e)) {
              this.recent.push(e);
              if (this.onMove) this.onMove(this.queue[this.queue.length - 1]);
            }
          } else if (e.kind === 'activated' && this.onActivated) this.onActivated(e.token);
        }
        this.lastBlock = n;
        this.status = 'live';
        this._persist();
      }
    } catch {
      this.status = this.chain.ok === false ? 'retrying' : this.status;
    }
    setTimeout(() => this._poll(), POLL_MS);
  }

  // The witnessed artifacts to manifest now, oldest move first: one for each seeker that
  // moved, up to max. Each is the move narrowed to its one seeker; one of a sweep has its
  // own seed and key (the transaction and its token), the same for everyone.
  takeWave(max = 12) {
    const cut = Date.now() - KEEP_MS;
    this.queue = this.queue.filter((m) => (m.seenAt || 0) > cut);
    const out = [];
    while (this.queue.length && out.length < max) {
      const m = this.queue[0];
      const total = m.total || m.tokens.length;
      const take = m.tokens.slice(0, max - out.length);
      for (const t of take) {
        const one = { ...m, tokens: [t], total };
        if (total > 1) { one.seed = sweepSeed(m.tx, t); one.key = `${m.tx}:${t}`; }
        out.push(one);
      }
      m.tokens = m.tokens.slice(take.length);
      if (!m.tokens.length) { this.queue.shift(); this.seen.add(m.tx); }
    }
    if (out.length) this._persist();
    return out;
  }

  // seekers still waiting for theirs
  get waiting() { return this.queue.reduce((n, m) => n + m.tokens.length, 0); }

  movesToday() {
    return this.recent.length;
  }
}
