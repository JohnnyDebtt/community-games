import { BLOCKS_PER_SECOND } from './chain.js';

// The planet keeps Robinhood Chain's time. A day is 14,400 blocks (24 minutes at ten
// blocks a second), so everyone flying at the same moment shares the same hour, the
// same sunrise, the same fog. Between reads the block is extrapolated from the last one
// seen and the measured block rate; offline, from the shipped snapshot's anchor and this
// device's clock.

export const BLOCKS_PER_DAY = 24 * 60 * BLOCKS_PER_SECOND;

export class ChainClock {
  constructor() {
    this.anchor = null;          // { block, at: local ms when that block was current }
    this.rate = 1000 / BLOCKS_PER_SECOND;
    this.source = 'none';        // 'chain' | 'snapshot' | 'none'
  }

  // A block seen just now (from the RPC): the most trustworthy anchor.
  observe(block, rate) {
    if (rate && rate > 20 && rate < 2000) this.rate = rate;
    this.anchor = { block, at: Date.now() };
    this.source = 'chain';
  }

  // A block and its timestamp (offline: device clock against block time).
  seed(block, time) {
    if (this.source === 'chain') return;
    this.anchor = { block, at: time };
    this.source = 'snapshot';
  }

  blockNow() {
    if (!this.anchor) return null;
    return this.anchor.block + (Date.now() - this.anchor.at) / this.rate;
  }

  // fraction of the planet's day, and seconds of shared weather time
  dayPhase() {
    const b = this.blockNow();
    return b === null ? null : ((b / BLOCKS_PER_DAY) % 1 + 1) % 1;
  }
  weatherSeconds() {
    const b = this.blockNow();
    return b === null ? null : b / BLOCKS_PER_SECOND;
  }
}
