import { Chain } from './chain.js';
import { info, stageOf, THRESHOLD, SUPPLY, loadMeta, metaData } from './art.js';
import { clamp, smoothstep, hash1 } from '../core/math.js';

// The game's view of SEEKER NET. Live values come from the chain. Between reads, and
// whenever the chain cannot be reached, charges are extrapolated the way the contract
// grows them (50 a day). Offline, the game starts from the snapshot shipped with it
// (assets/seekernet/snapshot.json, refreshed with tools/snapshot.html) and says so.
//
// Only activated seekers can be tuned as devices: activation is what wakes a seeker
// for the ice. Dormant ones are signals still charging, and can be watched.

export const REVEAL = Date.UTC(2026, 9, 12, 23, 13);   // 12 October 2026, 23:13 UTC
const PER_DAY = 50;
const DAY_MS = 86400000;

export class SeekerNet {
  constructor() {
    this.chain = new Chain();
    this.cache = new Map();       // token -> { charge, status, discharge, uplink, at, live } (per-token reads)
    this.all = null;              // { charges, status, at, live } for every token
    this.snap = null;             // the shipped snapshot
    this.tracked = new Set();
    this.totals = null;           // { activated, accD, accA, at, live }
    this.pulse = 0;               // 0..1, decays: a seeker moved
    this.lastPulseAt = 0;
    this.onPulse = null;
    this.onUpdate = null;
    this.online = null;           // null unknown, true reached, false unreachable
    this.lastError = null;
    this.enabled = true;
    this._timer = null;
    this._lastAll = 0;
    this._lastTokens = 0;
    // moves and activations, from the chain's event logs
    this.lastBlock = null;        // the last block whose events were read
    this.feed = [];               // recent events, newest last: { kind, token, charge, recipients, pool, at }
    this.onEvents = null;         // (events, { initial }) -> void
    this._clock = null;           // block number -> time
    this._eventsRead = false;
    this.moveTimes = [];
  }

  async loadSnapshot() {
    try {
      const r = await fetch('assets/seekernet/snapshot.json');
      if (!r.ok) return;
      const s = await r.json();
      if (s.charges && s.charges.length === SUPPLY) this.snap = s;
    } catch { /* no snapshot: starting charges it is */ }
  }

  // Restore what an earlier session saw (shown as "last seen").
  restore(saved) {
    if (!saved) return;
    for (const [k, v] of Object.entries(saved.tokens || {})) this.cache.set(+k, { ...v, live: false });
    if (saved.totals) this.totals = { ...saved.totals, live: false };
    if (saved.all && saved.all.charges && saved.all.charges.length === SUPPLY && (!this.snap || saved.all.at > this.snap.at)) {
      this.all = { charges: Float64Array.from(saved.all.charges), status: Uint8Array.from(saved.all.status), at: saved.all.at, live: false };
    }
    if (saved.lastPulseAt) this.lastPulseAt = saved.lastPulseAt;
    if (saved.lastBlock) this.lastBlock = saved.lastBlock;
    if (Array.isArray(saved.feed)) this.feed = saved.feed.slice(-40);
    if (Array.isArray(saved.moveTimes)) this.moveTimes = saved.moveTimes.slice(-600);
  }

  snapshot() {
    const tokens = {};
    for (const [k, v] of this.cache) tokens[k] = { charge: v.charge, status: v.status, discharge: v.discharge, uplink: v.uplink, at: v.at };
    const all = this.all ? { charges: Array.from(this.all.charges, (v) => Math.round(v * 10) / 10), status: Array.from(this.all.status), at: this.all.at } : null;
    return { tokens, totals: this.totals, all, lastPulseAt: this.lastPulseAt, lastBlock: this.lastBlock, feed: this.feed.slice(-40), moveTimes: this.moveTimes };
  }

  // The best whole-network picture: a live read, an earlier one, the shipped snapshot,
  // or the starting charges (in that order).
  _base(token) {
    const i = token - 1;
    if (this.all) return { charge: this.all.charges[i], status: this.all.status[i], at: this.all.at, live: this.all.live, src: this.all.live ? 'live' : 'last seen' };
    if (this.snap) return { charge: this.snap.charges[i], status: this.snap.status[i], at: this.snap.at, live: false, src: 'snapshot' };
    const row = metaData() && metaData().tokens[i];
    return { charge: row ? row[10] : 0, status: 0, at: REVEAL, live: false, src: 'estimated' };
  }

  // The token's state right now, extrapolated from the last read.
  state(token, now = Date.now()) {
    const c = this.cache.get(token);
    const b = this._base(token);
    const use = c && (!b || c.at >= b.at) ? { ...c, src: c.live ? 'live' : 'last seen' } : b;
    let charge = use.charge;
    let status = use.status;
    const days = Math.max(0, (now - use.at) / DAY_MS);
    charge += PER_DAY * days;                         // dormant and activated both keep charging
    if (status === 0 && charge > THRESHOLD) status = 1;
    const activated = status === 1 || status === 2;
    const s = {
      token, charge, status, activated, burned: status === 3,
      stage: activated ? 6 : stageOf(Math.min(charge, THRESHOLD)),
      overcharge: activated ? Math.max(0, charge - THRESHOLD) : 0,
      discharge: c ? c.discharge : null, uplink: c ? c.uplink : null,
      age: now - use.at,
      source: use.src === 'live' && now - use.at > 10 * 60000 ? 'last seen' : use.src,
      readAt: use.at,
    };
    return s;
  }

  isActivated(token) {
    return this.state(token).activated;
  }

  // Days until a dormant seeker activates, at 50 a day (sooner if seekers move).
  daysToActivate(token) {
    const s = this.state(token);
    if (s.activated) return 0;
    return Math.max(0, (THRESHOLD - s.charge) / PER_DAY);
  }

  activatedIds() {
    const out = [];
    for (let id = 1; id <= SUPPLY; id++) {
      const b = this._base(id);
      const days = Math.max(0, (Date.now() - b.at) / DAY_MS);
      if (b.status === 1 || b.status === 2 || (b.status === 0 && b.charge + PER_DAY * days > THRESHOLD)) out.push(id);
    }
    return out;
  }

  // Dormant seekers closest to activation.
  nearlyThere(n = 6) {
    const list = [];
    for (let id = 1; id <= SUPPLY; id++) {
      const s = this._base(id);
      if (s.status === 0) list.push([id, s.charge]);
    }
    list.sort((a, b) => b[1] - a[1]);
    return list.slice(0, n).map(([id]) => id).filter((id) => !this.isActivated(id));
  }

  track(ids) {
    let added = false;
    for (const id of ids) if (!this.tracked.has(id)) { this.tracked.add(id); added = true; }
    if (added && this.online !== false && this.enabled) this._readTokens().catch(() => {});
  }

  untrack(id) {
    this.tracked.delete(id);
  }

  // Average charge fraction of the whole network.
  networkFraction(now = Date.now()) {
    let sum = 0;
    if (this.all || this.snap) {
      const arr = this.all || this.snap;
      const days = Math.max(0, (now - arr.at) / DAY_MS);
      for (let i = 0; i < SUPPLY; i++) sum += arr.status[i] ? 1 : Math.min(1, (arr.charges[i] + PER_DAY * days) / THRESHOLD);
      return sum / SUPPLY;
    }
    const m = metaData();
    if (!m) return 0.5;
    const days = Math.max(0, (now - REVEAL) / DAY_MS);
    for (const row of m.tokens) sum += Math.min(1, (row[10] + PER_DAY * days) / THRESHOLD);
    return sum / m.tokens.length;
  }

  activatedCount() {
    if (this.totals && this.totals.live) return Math.max(this.totals.activated, this._activatedQuick());
    return this._activatedQuick();
  }

  _activatedQuick() {
    if (this._actCacheAt && Date.now() - this._actCacheAt < 30000) return this._actCache;
    this._actCache = this.activatedIds().length;
    this._actCacheAt = Date.now();
    return this._actCache;
  }

  // How much the network lights the sky: a slow season as seekers charge and activate,
  // plus a pulse whenever one moves.
  auroraNet() {
    const frac = this.networkFraction();
    const act = this.activatedCount() / SUPPLY;
    return clamp(smoothstep(0.35, 0.95, frac) * 0.3 + Math.sqrt(act) * 0.35, 0, 0.65);
  }

  update(dt) {
    this.pulse = Math.max(0, this.pulse - dt / 150);
  }

  start() {
    if (this._timer || !this.enabled) return;
    const tick = async () => {
      if (!this.enabled) { this._timer = null; return; }
      try {
        await this.poll();
      } catch (e) {
        this.lastError = String((e && e.message) || e);
      }
      this._timer = setTimeout(tick, this.online === false ? 120000 : 60000);
    };
    loadMeta().then(() => { this._timer = setTimeout(tick, 800); });
  }

  stop() {
    clearTimeout(this._timer);
    this._timer = null;
  }

  async poll() {
    const prev = this.totals;
    let t;
    try {
      t = await this.chain.totals();
      this.online = true;
    } catch (e) {
      this.online = false;
      throw e;
    }
    const now = Date.now();
    this.totals = { ...t, at: now, live: true };
    const moved = prev && prev.live && (prev.accD !== t.accD || prev.accA !== t.accA);
    const activationRecorded = prev && prev.live && prev.activated !== t.activated;
    if (moved || activationRecorded) {
      this.pulse = 1;
      this.lastPulseAt = now;
      if (this.onPulse) this.onPulse({ moved, activationRecorded, activated: t.activated });
    }
    // a full read at most every five minutes while things move, and hourly regardless
    const changed = !prev || !prev.live || moved || activationRecorded;
    if ((changed && now - this._lastAll > 5 * 60000) || now - this._lastAll > 60 * 60000) {
      this._lastAll = now;
      try {
        const all = await this.chain.allCharges();
        this.all = { charges: all.charges, status: all.status, at: now, live: true };
        this._actCacheAt = 0;
      } catch { /* keep what we had */ }
    }
    if (changed || now - this._lastTokens > 5 * 60000) await this._readTokens();
    // what moved: on the first read, everything since the last visit (up to a day);
    // afterwards, whenever the totals say something happened
    if (!this._eventsRead || moved || activationRecorded) {
      try {
        await this._readEvents(!this._eventsRead);
        this._eventsRead = true;
      } catch (e) {
        this.lastError = String((e && e.message) || e);
      }
    }
    if (this.onUpdate) this.onUpdate();
  }

  // Block numbers to times: blocks come about ten a second; measured once.
  timeOf(block) {
    const c = this._clock;
    return c ? c.at - (c.block - block) * c.rate : Date.now();
  }

  async _readEvents(initial) {
    const latest = await this.chain.blockNumber();
    if (!this._clock) {
      const [a, b] = [await this.chain.blockTime(latest), await this.chain.blockTime(latest - 100000)];
      this._clock = { block: latest, at: a || Date.now(), rate: a && b ? (a - b) / 100000 : 100 };
    }
    const day = Math.round(DAY_MS / this._clock.rate);
    let from = this.lastBlock ? this.lastBlock + 1 : latest - day;
    from = Math.max(from, latest - day);
    const events = await this.chain.events(from, latest);
    this.lastBlock = latest;
    for (const e of events) e.at = this.timeOf(e.block);
    const keep = events.map((e) => ({ kind: e.kind, token: e.token, charge: Math.round(e.charge || 0), recipients: e.recipients || 0, pool: e.pool, at: e.at, block: e.block }));
    this.feed = this.feed.concat(keep).slice(-40);
    const since = Date.now() - DAY_MS;
    this.moveTimes = this.moveTimes.concat(events.filter((e) => e.kind === 'move').map((e) => Math.round(e.at))).filter((t) => t >= since).slice(-600);
    if (this.onEvents && events.length) this.onEvents(events, { initial });
  }

  // Moves in the last 24 hours, as far as the relay has seen.
  movesToday() {
    const since = Date.now() - DAY_MS;
    return this.moveTimes.filter((t) => t >= since).length;
  }

  async _readTokens() {
    const ids = [...this.tracked].filter((id) => id >= 1 && id <= SUPPLY);
    if (!ids.length) return;
    const now = Date.now();
    this._lastTokens = now;
    for (let i = 0; i < ids.length; i += 40) {
      const part = await this.chain.tokens(ids.slice(i, i + 40));
      this.online = true;
      for (const r of part) {
        if (r.charge == null || r.status == null) continue;
        this.cache.set(r.token, { charge: r.charge, status: r.status, discharge: r.discharge, uplink: r.uplink, at: now, live: true });
      }
    }
    if (this.onUpdate) this.onUpdate();
  }

  // Read one token now (for the relay), resolving even when offline.
  async refresh(id) {
    this.tracked.add(id);
    if (!this.enabled) return this.state(id);
    try {
      const [r] = await this.chain.tokens([id]);
      this.online = true;
      if (r.charge != null && r.status != null) {
        this.cache.set(id, { charge: r.charge, status: r.status, discharge: r.discharge, uplink: r.uplink, at: Date.now(), live: true });
      }
    } catch {
      this.online = false;
    }
    return this.state(id);
  }
}

// Picks from a list for a given day: the same picks for everyone on the same day.
export function picksFor(list, dayNumber, n = 3, salt = 0) {
  const out = [];
  if (!list.length) return out;
  let k = 0;
  while (out.length < Math.min(n, list.length) && k < 200) {
    const id = list[Math.floor(hash1(dayNumber * 977 + salt * 131 + k * 7919) * list.length)];
    if (!out.includes(id)) out.push(id);
    k++;
  }
  return out;
}
