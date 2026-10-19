// Read-only access to SEEKER NET on Robinhood Chain (chain ID 4663) through public RPCs.
// Only eth_call: no wallet, no signatures, no transactions, nothing ever written.
// Requests are queued (about one a second), retried with backoff, and switch to the
// fallback RPC when one fails, as the collection's README asks.

export const RPCS = ['https://rpc.mainnet.chain.robinhood.com', 'https://robinhood.drpc.org'];
export const SEEKER_NET = '0x5aC790269A6c71a51Ba68BF6a3a2647F86788792';
export const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';
const SEL = {
  chargesOf: 'f6a7f666', chargeOf: 'de9964e6', statusOf: 'ad35efd4',
  accD: '91f9412c', accA: 'db62316d', activatedCount: '06f9e52c', renderer: '8ada6b0f',
  dischargeOf: '8dc8ec05', uplinkOf: '64a666f6', aggregate3: '82ad56cb',
};
const ONE = 1e18;
export const TOPIC = {
  transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
  release: '0xa650bfd24135ef7b22c9b29b082819d1d3cae98bb0ae3ce4553757efe96738ac',
  activated: '0x3ec796be1be7d03bff3a62b9fa594a60e947c1809bced06d929f145308ae57ce',
};

const word = (n) => BigInt(n).toString(16).padStart(64, '0');
const addr = (a) => a.toLowerCase().replace(/^0x/, '').padStart(64, '0');

export class Chain {
  constructor() {
    this.rpc = 0;
    this.queue = [];
    this.busy = false;
    this.wait = 0;            // backoff in ms after failures
    this.lastAt = 0;
    this.ok = null;           // last request succeeded?
    this.failures = 0;
    this.renderer = null;
  }

  _send(body) {
    return new Promise((resolve, reject) => {
      this.queue.push({ body, resolve, reject, tries: 0 });
      this._pump();
    });
  }

  async _pump() {
    if (this.busy) return;
    this.busy = true;
    while (this.queue.length) {
      const job = this.queue[0];
      const gap = Math.max(1050 - (performance.now() - this.lastAt), this.wait);
      if (gap > 0) await new Promise((r) => setTimeout(r, gap));
      this.lastAt = performance.now();
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 20000);
        const res = await fetch(RPCS[this.rpc], {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...job.body }),
          signal: ctl.signal,
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status >= 500) throw new Error('rpc ' + res.status);
        const j = await res.json();
        if (j.error) throw Object.assign(new Error(j.error.message || 'rpc error'), { rpcError: true });
        this.queue.shift();
        this.wait = 0;
        this.ok = true;
        this.failures = 0;
        job.resolve(j.result);
      } catch (e) {
        job.tries++;
        this.failures++;
        this.ok = false;
        this.rpc = (this.rpc + 1) % RPCS.length;
        this.wait = Math.min(60000, Math.max(2000, this.wait * 2));
        if (job.tries >= 4 || e.rpcError) {
          this.queue.shift();
          job.reject(e);
        }
      }
    }
    this.busy = false;
  }

  async call(to, data) {
    const r = await this._send({ method: 'eth_call', params: [{ to, data: '0x' + data }, 'latest'] });
    return (r || '0x').slice(2);
  }

  // Multicall3.aggregate3: many reads in one request. calls: [{ target, data }] (hex
  // without 0x). Returns hex results (or null where a call failed).
  async aggregate(calls) {
    const n = calls.length;
    const tuples = calls.map((c) => {
      const bytes = c.data.length / 2;
      const padded = c.data.padEnd(Math.ceil(bytes / 32) * 64, '0');
      return addr(c.target) + word(1) + word(96) + word(bytes) + padded;
    });
    let off = 32 * n;
    const heads = tuples.map((t) => {
      const h = word(off);
      off += t.length / 2;
      return h;
    });
    const hex = await this.call(MULTICALL3, SEL.aggregate3 + word(32) + word(n) + heads.join('') + tuples.join(''));
    const at = (i) => BigInt('0x' + (hex.slice(i * 64, i * 64 + 64) || '0'));
    const base = Number(at(0)) / 32;
    const count = Number(at(base));
    const out = [];
    for (let k = 0; k < count; k++) {
      const t = base + 1 + Number(at(base + 1 + k)) / 32;
      const success = at(t) !== 0n;
      const b = t + Number(at(t + 1)) / 32;
      const len = Number(at(b));
      out.push(success ? hex.slice((b + 1) * 64, (b + 1) * 64 + len * 2) : null);
    }
    return out;
  }

  // The game's totals: they change with every move and every recorded activation.
  async totals() {
    const r = await this.aggregate([
      { target: SEEKER_NET, data: SEL.accD },
      { target: SEEKER_NET, data: SEL.accA },
      { target: SEEKER_NET, data: SEL.activatedCount },
      { target: SEEKER_NET, data: SEL.renderer },
    ]);
    const big = (h) => (h ? BigInt('0x' + h.slice(0, 64)) : 0n);
    const renderer = r[3] ? '0x' + r[3].slice(24, 64) : this.renderer;
    if (renderer) this.renderer = renderer;
    return { accD: big(r[0]).toString(), accA: big(r[1]).toString(), activated: Number(big(r[2])), renderer };
  }

  // Live state of a few tokens: charge, status, Discharge, Uplink.
  async tokens(ids) {
    if (!this.renderer) await this.totals();
    const calls = [];
    for (const id of ids) {
      calls.push({ target: SEEKER_NET, data: SEL.chargeOf + word(id) });
      calls.push({ target: SEEKER_NET, data: SEL.statusOf + word(id) });
      calls.push({ target: this.renderer, data: SEL.dischargeOf + word(id) });
      calls.push({ target: this.renderer, data: SEL.uplinkOf + word(id) });
    }
    const r = await this.aggregate(calls);
    const num = (h) => (h ? Number(BigInt('0x' + h.slice(0, 64))) : null);
    return ids.map((id, k) => ({
      token: id,
      charge: r[k * 4] ? num(r[k * 4]) / ONE : null,
      status: num(r[k * 4 + 1]),
      discharge: r[k * 4 + 2] ? num(r[k * 4 + 2]) / ONE : 0,
      uplink: r[k * 4 + 3] ? num(r[k * 4 + 3]) / ONE : 0,
    }));
  }

  async blockNumber() {
    return parseInt(await this._send({ method: 'eth_blockNumber', params: [] }), 16);
  }

  async blockTime(n) {
    const b = await this._send({ method: 'eth_getBlockByNumber', params: ['0x' + n.toString(16), false] });
    return b ? parseInt(b.timestamp, 16) * 1000 : null;
  }

  // SEEKER NET's moves, released charge and activations between two blocks. The official
  // RPC answers ranges up to 1,000,000 blocks for one topic, 100,000 for several, so long
  // ranges go topic by topic.
  async events(from, to) {
    const get = (a, b, topics) => this._send({ method: 'eth_getLogs', params: [{ address: SEEKER_NET, fromBlock: '0x' + a.toString(16), toBlock: '0x' + b.toString(16), topics }] });
    let logs = [];
    if (to < from) return [];
    if (to - from < 99000) {
      logs = await get(from, to, [[TOPIC.transfer, TOPIC.release, TOPIC.activated]]);
    } else {
      for (const t of [TOPIC.transfer, TOPIC.release, TOPIC.activated]) {
        for (let a = from; a <= to; a += 900000) logs = logs.concat(await get(a, Math.min(to, a + 899999), [t]));
      }
    }
    // one move = a Transfer, and a ChargeReleased in the same transaction when it shared
    const moves = new Map(), out = [];
    const id = (h) => Number(BigInt(h));
    for (const l of logs) {
      const t0 = l.topics[0];
      const block = parseInt(l.blockNumber, 16);
      if (t0 === TOPIC.activated) {
        out.push({ kind: 'activated', token: id(l.topics[1]), block, tx: l.transactionHash });
        continue;
      }
      const token = id(t0 === TOPIC.transfer ? l.topics[3] : l.topics[1]);
      const key = l.transactionHash + ':' + token;
      let m = moves.get(key);
      if (!m) {
        m = { kind: 'move', token, block, tx: l.transactionHash, charge: 0, recipients: 0, pool: null, mint: false };
        moves.set(key, m);
        out.push(m);
      }
      if (t0 === TOPIC.transfer) {
        if (BigInt(l.topics[1]) === 0n) m.mint = true;
        if (BigInt(l.topics[2]) === 0n) m.burn = true;
      } else {
        const d = l.data.slice(2);
        m.charge = Number(BigInt('0x' + d.slice(0, 64))) / ONE;
        m.recipients = Number(BigInt('0x' + d.slice(64, 128)));
        m.pool = BigInt('0x' + d.slice(128, 192)) !== 0n ? 'activated' : 'dormant';
      }
    }
    return out.filter((e) => !e.mint).sort((a, b) => a.block - b.block);
  }

  // Every token's charge and status in one call (about 285 KB).
  async allCharges() {
    const hex = await this.call(SEEKER_NET, SEL.chargesOf + word(1) + word(2222));
    const at = (i) => BigInt('0x' + hex.slice(i * 64, i * 64 + 64));
    const c = Number(at(0)) / 32, s = Number(at(1)) / 32, n = Number(at(c));
    const charges = new Float64Array(n), status = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      charges[i] = Number(at(c + 1 + i)) / ONE;
      status[i] = Number(at(s + 1 + i));
    }
    return { charges, status };
  }
}
