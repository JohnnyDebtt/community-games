import { checkEvent, signEvent } from './nostr.js';
import { checkLink } from './wallet.js';
import { PROTO } from './board.js';
import { load, save } from '../core/store.js';

// The Codex leaderboard. Holders submit their scans themselves, from the leaderboard's
// own page; every reader ranks them the same way, here in the page: witnessed scans
// first, then the rest, then by name.
//
// A submission is this browser's ledger: every scan in its Codex, listed (not their
// photographs), signed with the board's key and carrying the same wallet proof as a
// post. It travels as app data (Nostr kind 30078), replaceable, so the newest ledger from
// a key stands; a long one goes in pages. The photographs follow, one small event each,
// and are only fetched when someone opens that holder's gallery.
//
// A ledger counts only if every check passes, in each reader's page:
//   - its signature and its wallet proof are right, and the address holds a seeker now;
//   - a witnessed scan: that seeker moved in that transaction, in that block (read from
//     Robinhood Chain), and it was scanned within a few hours of the move;
//   - the rest: no two counted less than 40 seconds apart (no artifact comes sooner);
//   - each artifact once per address, from however many browsers.

export const RANKS_TAG = 'lowpassranks';
export const PHOTOS_TAG = 'lowpassphotos';
const PAGE = 150;                // scans per ledger page
const MAX_PAGES = 20;
const GAP = 40;                  // seconds at least between two counted wild scans
const WINDOW = 3 * 3600;         // a witnessed scan, at most this long after its move (s)
const SUBMIT_GAP = 30000;
const MAX_PHOTO = 70000;
const KEY_RE = /^0x[0-9a-f]{64}(:\d{1,4})?$/;
const HASH_RE = /^0x[0-9a-f]{64}$/;
const JPEG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const tag = (ev, name) => (Array.isArray(ev.tags) ? ev.tags.find((t) => Array.isArray(t) && t[0] === name) : null);

// a Codex entry as a ledger line: [key, kind, scanned (s), name, code, family, block, token, hash]
export function lineOf(e) {
  const kind = e.kind === 'wild' ? 'w' : e.special || e.kind === 'witnessed' ? 's' : 'm';
  return [e.tx, kind, Math.floor((e.scannedAt || 0) / 1000), String(e.name || '').slice(0, 60), String(e.code || '').slice(0, 12),
    String(e.family || '').slice(0, 12), kind === 'w' ? null : e.block || null, kind === 'w' ? null : e.lead || (e.tokens && e.tokens[0]) || null, kind === 'w' ? null : e.hash || e.tx];
}

function readLine(l) {
  if (!Array.isArray(l) || l.length < 6) return null;
  const [key, kind, at, name, code, family, block, token, hash] = l;
  if (typeof key !== 'string' || !KEY_RE.test(key) || !['w', 's', 'm'].includes(kind) || !Number.isFinite(at) || at < 1.7e9 || at > 4e9) return null;
  const s = { key, kind, at, name: String(name || '').slice(0, 60), code: String(code || '').slice(0, 12), family: String(family || '').slice(0, 12) };
  if (kind !== 'w') {
    s.block = Number.isInteger(block) && block > 0 ? block : null;
    s.token = Number.isInteger(token) && token >= 1 && token <= 2222 ? token : null;
    s.hash = typeof hash === 'string' && HASH_RE.test(hash) ? hash : null;
  }
  return s;
}

export class Ranks {
  constructor(board) {
    this.board = board;
    this.game = board.game;
    this.ledgers = new Map();    // `${pubkey}|${page}` -> { pubkey, address, page, at, lines }
    this.photos = new Map();     // key -> data URL (from those who submitted them)
    this.verified = new Map(Object.entries(load('ranks.verified', {})));   // `${hash}:${token}` -> true | false
    this.blocks = new Map();     // block -> Promise (being read)
    this.sent = load('ranks.sent', { keys: [], at: 0 });
    this.sentPhotos = new Set(load('ranks.photos', []));
    this.started = false;
    this.loaded = false;
    this.lastSubmit = 0;
    this.onChange = null;
    this._rows = null;
    this.photoJob = null;        // { done, of } while photographs are going out
    this.lastResult = null;      // the last submission from this page: { ok, of, scans }
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.board.start();
    this.board.pool.subscribe('lp-ranks', { kinds: [30078], '#t': [RANKS_TAG], limit: 2000 });
    clearTimeout(this._loadT);
    this._loadT = setTimeout(() => { this.loaded = true; this._changed(); }, 6000);
  }

  // a relay has sent all it has
  ended(sub) {
    if (sub === 'lp-ranks' && !this.loaded) { clearTimeout(this._loadT); this._loadT = setTimeout(() => { this.loaded = true; this._changed(); }, 400); }
    if (sub === 'lp-gallery') { this.galleryLoaded = true; this._changed(); }
  }

  _changed() {
    this._rows = null;
    if (this.onChange) this.onChange();
  }

  // ---------------------------------------------------------------- reading
  async event(ev) {
    const t = tag(ev, 't');
    if (t && t[1] === PHOTOS_TAG) return this._photo(ev);
    const lp = tag(ev, 'lp'), proof = tag(ev, 'lp-proof'), page = tag(ev, 'lp-page');
    if (!lp || lp[1] !== PROTO || lp[2] !== 'ledger' || !proof || !page || typeof ev.content !== 'string' || ev.content.length > 60000) return;
    const address = String(proof[1] || '').toLowerCase();
    const p = Number(page[1]);
    if (!Number.isInteger(p) || p < 0 || p >= MAX_PAGES) return;
    const id = `${ev.pubkey}|${p}`;
    const had = this.ledgers.get(id);
    if (had && had.at >= ev.created_at) return;
    if (!(await checkEvent(ev))) return;
    if (!checkLink(address, ev.pubkey, String(proof[2] || ''))) return;
    let raw;
    try { raw = JSON.parse(ev.content); } catch { return; }
    if (!Array.isArray(raw)) return;
    const lines = raw.slice(0, PAGE).map(readLine).filter(Boolean);
    const now = this.ledgers.get(id);
    if (now && now.at >= ev.created_at) return;
    this.ledgers.set(id, { pubkey: ev.pubkey, address, page: p, pages: Math.max(1, Math.min(MAX_PAGES, Number(page[2]) || 1)), at: ev.created_at, lines });
    if (this.loaded) this._changed();
    else { clearTimeout(this._loadT); this._loadT = setTimeout(() => { this.loaded = true; this._changed(); }, 1200); }
  }

  async _photo(ev) {
    const lp = tag(ev, 'lp'), k = tag(ev, 'lp-key');
    if (!lp || lp[2] !== 'photo' || !k || !KEY_RE.test(k[1] || '') || typeof ev.content !== 'string' || ev.content.length > MAX_PHOTO || !JPEG_RE.test(ev.content)) return;
    // only from a key whose ledger lists it
    const listed = [...this.ledgers.values()].some((l) => l.pubkey === ev.pubkey && l.lines.some((s) => s.key === k[1]));
    if (!listed || !(await checkEvent(ev))) return;
    this.photos.set(k[1], ev.content);
    if (this.onPhoto) this.onPhoto(k[1]);
  }

  // A holder's photographs, fetched when their gallery opens.
  openGallery(address) {
    const keys = [...new Set([...this.ledgers.values()].filter((l) => l.address === address).map((l) => l.pubkey))];
    this.board.pool.unsubscribe('lp-gallery');
    this.galleryLoaded = !keys.length;
    if (keys.length) this.board.pool.subscribe('lp-gallery', { kinds: [30078], authors: keys, '#t': [PHOTOS_TAG], limit: 500 });
  }
  closeGallery() { this.board.pool.unsubscribe('lp-gallery'); }

  // ---------------------------------------------------------------- checking
  // whether a witnessed scan's move is on the chain (true / false), or null: not known yet
  checked(s) {
    if (!s.hash || !s.token || !s.block) return false;
    const k = `${s.hash}:${s.token}`;
    if (this.verified.has(k)) return this.verified.get(k);
    this._readBlock(s.block);
    return null;
  }

  _readBlock(block) {
    if (this.blocks.has(block)) return;
    const p = this.game.chain.events(block, block).then((events) => {
      for (const e of events) if (e.kind === 'move') for (const t of e.tokens) this.verified.set(`${e.tx.toLowerCase()}:${t}`, true);
      // anything claimed in this block that is not there, is not
      for (const l of this.ledgers.values()) for (const s of l.lines) if (s.kind === 's' && s.block === block && s.hash && s.token && !this.verified.has(`${s.hash}:${s.token}`)) this.verified.set(`${s.hash}:${s.token}`, false);
      const keep = [...this.verified.entries()].slice(-3000);
      save('ranks.verified', Object.fromEntries(keep));
      this._changed();
    }).catch(() => { setTimeout(() => this.blocks.delete(block), 60000); });
    this.blocks.set(block, p);
  }

  // when a block was made (seconds), from the chain's own clock
  _blockTime(block) {
    const c = this.game.clock;
    const now = c.blockNow();
    if (now === null) return null;
    return (Date.now() - (now - block) * c.rate) / 1000;
  }

  // ---------------------------------------------------------------- ranking
  // [{ address, label, special, regular, pending, scans: [...], you }], best first
  rows() {
    if (this._rows) return this._rows;
    const b = this.board;
    const by = new Map();
    for (const l of this.ledgers.values()) {
      let r = by.get(l.address);
      if (!r) by.set(l.address, (r = new Map()));
      for (const s of l.lines) { const had = r.get(s.key); if (!had || s.at < had.at) r.set(s.key, s); }
    }
    const out = [];
    const need = [];
    for (const [address, scans] of by) {
      const h = b.holders.get(address);
      if (!h) { need.push(address); continue; }
      if (h.n < 1) continue;
      let special = 0, regular = 0, pending = 0, last = -Infinity;
      const list = [...scans.values()].sort((p, q) => p.at - q.at);
      for (const s of list) {
        s.counted = false;
        if (s.kind === 's') {
          const ok = this.checked(s);
          const bt = s.block ? this._blockTime(s.block) : null;
          const timely = bt === null || (s.at >= bt - 600 && s.at <= bt + WINDOW);
          if (ok === null) pending++;
          else if (ok && timely) { special++; s.counted = true; }
        } else if (s.at - last >= GAP) { regular++; last = s.at; s.counted = true; }
      }
      if (!special && !regular) continue;
      out.push({ address, label: b.labelOf(address), special, regular, pending, scans: list.reverse(), you: !!(b.link && b.link.address === address) });
    }
    this.checking = need.length > 0;     // some are waiting to be checked as holders
    if (need.length) this._holders(need);
    const nameKey = (r) => (r.label.named ? r.label.name.toLowerCase() : `~${r.address}`);
    out.sort((p, q) => q.special - p.special || q.regular - p.regular || (nameKey(p) < nameKey(q) ? -1 : nameKey(p) > nameKey(q) ? 1 : 0) || (p.address < q.address ? -1 : 1));
    this._rows = out;
    return out;
  }

  async _holders(list) {
    const b = this.board;
    if (this._holding) return;
    this._holding = true;
    try {
      const n = await this.game.chain.balances(list);
      if (b.devHolders) list.forEach((a, i) => { if (b.devHolders.has(a)) n[i] = Math.max(n[i], 1); });
      list.forEach((a, i) => b.holders.set(a, { n: n[i], at: Date.now() }));
      this._changed();
    } catch { /* the chain did not answer: next time */ }
    this._holding = false;
  }

  // ---------------------------------------------------------------- submitting
  // this browser's scans not yet in a ledger it sent
  get unsent() {
    const sent = new Set(this.sent.keys);
    return this.game.codex.filter((e) => !sent.has(e.tx)).length;
  }

  get submitWait() { return Math.max(0, SUBMIT_GAP - (Date.now() - this.lastSubmit)); }

  // Send this browser's ledger (every scan in its Codex), then its photographs, one by
  // one. onProgress(done, of) as the photographs go.
  async submit(onProgress = null) {
    const b = this.board;
    if (!b.link) throw new Error('Link a wallet that holds a seeker first');
    if (this.submitWait > 0) throw new Error(`Wait ${Math.ceil(this.submitWait / 1000)} s`);
    const n = await b.holdingsOf(b.link.address, true);
    if (n < 1) throw new Error('This address holds no SEEKER NET seeker');
    const lines = this.game.codex.map(lineOf).filter((l) => KEY_RE.test(l[0]));
    if (!lines.length) throw new Error('Nothing scanned yet');
    const pages = Math.min(MAX_PAGES, Math.ceil(lines.length / PAGE));
    let ok = 0, of = 0;
    for (let p = 0; p < pages; p++) {
      const tags = [['d', `lowpass:ledger:${p}`], ['t', RANKS_TAG], ['client', 'Low Pass'], ['lp', PROTO, 'ledger'], ['lp-proof', b.link.address, b.link.signature], ['lp-page', String(p), String(pages)]];
      const ev = await signEvent({ kind: 30078, tags, content: JSON.stringify(lines.slice(p * PAGE, (p + 1) * PAGE)) }, b.key);
      const results = await b.pool.publish(ev);
      const k = results.filter((r) => r.ok).length;
      if (!k) throw new Error(results.find((r) => r.why)?.why || 'No relay took it');
      ok = p === 0 ? k : Math.min(ok, k);
      of = results.length;
      await this.event(ev);
    }
    this.lastSubmit = Date.now();
    this.sent = { keys: lines.map((l) => l[0]), at: Date.now() };
    save('ranks.sent', this.sent);
    this.lastResult = { ok, of, scans: lines.length };
    this._changed();
    this._sendPhotos(onProgress);
    return this.lastResult;
  }

  async _sendPhotos(onProgress) {
    if (this.photoJob) return;
    const b = this.board;
    const todo = this.game.codex.filter((e) => e.photo && e.photo.length <= MAX_PHOTO && JPEG_RE.test(e.photo) && !this.sentPhotos.has(e.tx));
    this.photoJob = { done: 0, of: todo.length };
    if (onProgress) onProgress(0, todo.length);
    for (const e of todo) {
      if (!b.link) break;
      try {
        const tags = [['d', `lowpass:photo:${e.tx}`], ['t', PHOTOS_TAG], ['client', 'Low Pass'], ['lp', PROTO, 'photo'], ['lp-key', e.tx]];
        const ev = await signEvent({ kind: 30078, tags, content: e.photo }, b.key);
        const results = await b.pool.publish(ev);
        if (results.some((r) => r.ok)) { this.sentPhotos.add(e.tx); save('ranks.photos', [...this.sentPhotos]); }
      } catch { /* the next one */ }
      this.photoJob.done++;
      if (onProgress) onProgress(this.photoJob.done, this.photoJob.of);
      await new Promise((r) => setTimeout(r, 1200));
    }
    this.photoJob = null;
    this._changed();
  }
}
