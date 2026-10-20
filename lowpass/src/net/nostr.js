import { sign, verify, publicKey, sha256, hex, unhex } from './schnorr.js';
import { load, save } from '../core/store.js';

// Nostr, the small part of it the Codex board needs: a key kept in this browser, signed
// events (NIP-01), and a few free public relays, written to and read from together.
// Events are checked here (id and signature) before anything else looks at them.

// Six free, open relays (all strfry; no account, no payment). Every note goes to all of
// them and is read from all of them, so the board lasts while any one keeps it; and the
// game passes a note it has read on to any of them that lost it (board.js).
export const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net', 'wss://offchain.pub', 'wss://nostr.mom', 'wss://relay.nostr.net'];

// The board's posting key: made once in this browser, never sent anywhere.
export function boardKey() {
  let k = load('nostr.sk', null);
  if (!k || !/^[0-9a-f]{64}$/.test(k)) {
    for (;;) {
      const sk = crypto.getRandomValues(new Uint8Array(32));
      try { publicKey(sk); k = hex(sk); break; } catch { /* out of range: again */ }
    }
    save('nostr.sk', k);
  }
  const sk = unhex(k);
  return { sk, pk: hex(publicKey(sk)) };
}

export async function eventId(ev) {
  return hex(await sha256(JSON.stringify([0, ev.pubkey, ev.created_at, ev.kind, ev.tags, ev.content])));
}

export async function signEvent(ev, key) {
  const e = { ...ev, pubkey: key.pk, created_at: ev.created_at ?? Math.floor(Date.now() / 1000) };
  e.id = await eventId(e);
  e.sig = hex(await sign(unhex(e.id), key.sk));
  return e;
}

const checked = new Map();   // id -> boolean
export async function checkEvent(ev) {
  if (!ev || typeof ev.id !== 'string' || typeof ev.sig !== 'string' || typeof ev.pubkey !== 'string') return false;
  if (checked.has(ev.id)) return checked.get(ev.id);
  let ok = false;
  try {
    ok = /^[0-9a-f]{64}$/.test(ev.pubkey) && (await eventId(ev)) === ev.id && (await verify(unhex(ev.sig), unhex(ev.id), unhex(ev.pubkey)));
  } catch { ok = false; }
  checked.set(ev.id, ok);
  return ok;
}

class Relay {
  constructor(url, pool) {
    this.url = url;
    this.pool = pool;
    this.ws = null;
    this.state = 'idle';     // idle | connecting | open | closed
    this.wait = 1000;
    this.pending = new Map(); // event id -> resolve
  }
  connect() {
    if (this.ws && (this.state === 'open' || this.state === 'connecting')) return;
    this.state = 'connecting';
    let ws;
    try { ws = new WebSocket(this.url); } catch { this._retry(); return; }
    this.ws = ws;
    ws.onopen = () => {
      this.state = 'open';
      this.wait = 1000;
      for (const [id, f] of this.pool.subs) this.send(['REQ', id, ...f]);
      this.pool._changed();
    };
    ws.onmessage = (m) => {
      let msg;
      try { msg = JSON.parse(m.data); } catch { return; }
      if (!Array.isArray(msg)) return;
      if (msg[0] === 'EVENT' && msg[2]) this.pool._event(msg[2], this, msg[1]);
      else if (msg[0] === 'EOSE') this.pool._eose(msg[1], this);
      else if (msg[0] === 'CLOSED') this.pool._eose(msg[1], this);
      else if (msg[0] === 'OK') {
        const f = this.pending.get(msg[1]);
        if (f) { this.pending.delete(msg[1]); f({ ok: !!msg[2], why: msg[3] || '' }); }
      }
    };
    ws.onclose = () => { this.state = 'closed'; this.pool._changed(); this._retry(); };
    ws.onerror = () => { try { ws.close(); } catch { /* closing */ } };
  }
  _retry() {
    if (this.pool.stopped) return;
    setTimeout(() => this.connect(), this.wait);
    this.wait = Math.min(60000, this.wait * 2);
  }
  send(msg) {
    if (this.state === 'open') { try { this.ws.send(JSON.stringify(msg)); return true; } catch { /* closed */ } }
    return false;
  }
  publish(ev) {
    return new Promise((resolve) => {
      if (!this.send(['EVENT', ev])) { resolve({ ok: false, why: 'not connected' }); return; }
      this.pending.set(ev.id, resolve);
      setTimeout(() => { if (this.pending.delete(ev.id)) resolve({ ok: false, why: 'no answer' }); }, 8000);
    });
  }
}

export class Pool {
  constructor(urls = RELAYS) {
    this.relays = urls.map((u) => new Relay(u, this));
    this.subs = new Map();        // id -> [filters]
    this.seen = new Set();
    this.where = new Map();       // event id -> Set of relay urls that sent it
    this.counts = new Map();      // `${sub}|${url}` -> events that relay sent for it
    this.ended = new Map();       // sub id -> Set of relay urls that finished sending
    this.onEvent = null;          // (event, relay)
    this.onEose = null;           // (subId)
    this.onChange = null;
    this.started = false;
    this.stopped = false;
  }
  start() {
    if (this.started) return;
    this.started = true;
    for (const r of this.relays) r.connect();
  }
  subscribe(id, ...filters) {
    this.subs.set(id, filters);
    for (const r of this.relays) r.send(['REQ', id, ...filters]);
  }
  async publish(ev) {
    const results = await Promise.all(this.relays.map((r) => r.publish(ev)));
    for (let i = 0; i < results.length; i++) if (results[i].ok) this._has(ev.id, this.relays[i].url);
    return results;
  }
  // to some relays only (a note passed on to those that lost it)
  async publishTo(ev, urls) {
    const rs = this.relays.filter((r) => urls.includes(r.url));
    const results = await Promise.all(rs.map((r) => r.publish(ev)));
    rs.forEach((r, i) => { if (results[i].ok) this._has(ev.id, r.url); });
    return results;
  }
  _has(id, url) {
    let w = this.where.get(id);
    if (!w) this.where.set(id, (w = new Set()));
    w.add(url);
  }
  connected() {
    return this.relays.filter((r) => r.state === 'open').length;
  }
  _event(ev, relay, sub = null) {
    if (!ev || !ev.id) return;
    if (relay) {
      this._has(ev.id, relay.url);
      if (sub) { const k = `${sub}|${relay.url}`; this.counts.set(k, (this.counts.get(k) || 0) + 1); }
    }
    if (this.seen.has(ev.id)) return;
    this.seen.add(ev.id);
    if (this.onEvent) this.onEvent(ev, relay);
  }
  _eose(id, relay) {
    let e = this.ended.get(id);
    if (!e) this.ended.set(id, (e = new Set()));
    if (relay) e.add(relay.url);
    if (this.onEose) this.onEose(id, relay);
  }
  _changed() { if (this.onChange) this.onChange(); }
}
