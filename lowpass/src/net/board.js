import { Pool, RELAYS, boardKey, checkEvent, signEvent } from './nostr.js';
import { checkLink, savedLink, link as linkWallet, forget } from './wallet.js';
import { load, save, boardAll, boardKeep } from '../core/store.js';

// The Codex board: scans and words from seekers, on public Nostr relays, readable by
// anyone, in the game or in any Nostr client (kind 1 notes tagged #lowpasscodex).
//
// Free relays take anything from anyone, so the board is kept by its readers. A post
// counts only if every check passes, here, in each reader's page:
//   - its Nostr id and signature are right;
//   - it carries a wallet signature (EIP-191) linking its Nostr key to an address;
//   - that address holds at least one SEEKER NET seeker now (balanceOf, read from
//     Robinhood Chain);
//   - it is text: links are not allowed, and are blanked out if a post has any.
// Names: a holder can take a name (2 to 20 characters). It travels as its own small
// signed event (a Nostr profile, kind 0, carrying the same wallet proof), so it is the
// latest name that every reader shows on every post from that address, old ones too; and
// where a holder has a name the game shows the name, never the address. (The address is
// still in each event's proof, as it must be for readers to check it holds a seeker;
// it is only kept out of sight.)
//
// Deleting: a holder can take back their own posts. A deletion (Nostr kind 5, NIP-09,
// with the same wallet proof) is honored by every reader for every player, and most
// relays drop the post too; a note already copied elsewhere cannot be unsent.
//
// The board survives a relay's loss: every note goes to all relays and is read from all;
// readers keep what they have read (IndexedDB) and pass a note on to any relay that has
// lost it.
//
// A scan travels as its artifact's origin and its photograph (a small JPEG inside the
// note). The origin is a transaction (anyone can trace it) for a witnessed artifact, or
// the random seed of a wild one, which no one else will ever meet; the tag says which.

export const BOARD_TAG = 'lowpasscodex';
export const PROTO = '1';
const MAX_TEXT = 280;
const MAX_NAME = 20;
const HEAL_MAX = 16;          // notes passed on to relays that lost them, per session
const MAX_PHOTO = 70000;
const SEND_GAP = 20000;        // between one post and the next (ms)
const NAME_GAP = 10000;        // between one name and the next
const LINK_RE = /\b(?:https?|ftp|wss?|ipfs|nostr|lightning|magnet):\S+|\bwww\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:com|net|org|io|xyz|app|gg|me|co|dev|link|ly|to|sh|so|ai|fun|lol|club|site|online|top|info|biz|tv|us|uk|ru|cn|de|fr|eth|art|cc|ws|in|news|social|chat|zone|world|land|space|wtf)\b(?:\/\S*)?|\b(?:npub|nsec|nevent|note|nprofile|naddr|lnurl|lnbc)1[0-9a-z]{6,}/gi;

export function hasLink(text) {
  LINK_RE.lastIndex = 0;
  return LINK_RE.test(text);
}
export function redact(text) {
  return text.replace(LINK_RE, '[link removed]');
}

// A name as the board accepts it, or '' (no name): letters and numbers of any script and
// a little punctuation; no invisible or direction-changing characters, no links, nothing
// that looks like an address.
export function cleanName(raw) {
  let n = String(raw || '').normalize('NFKC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  n = [...n].slice(0, MAX_NAME).join('').trim();
  if (!n || !/[\p{L}\p{N}]/u.test(n)) return '';
  if (!/^[\p{L}\p{M}\p{N} ._'\-!?&+*~#()]+$/u.test(n)) return '';
  if (hasLink(n) || /0x[0-9a-f]{4,}/i.test(n)) return '';
  return n;
}

// A small mark that tells holders apart without showing an address: one of eight colors
// and two letters, from a hash of the address.
export function markOf(address) {
  let h = 2166136261;
  for (let i = 0; i < address.length; i++) { h ^= address.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return { color: h & 7, tag: A[(h >>> 3) & 31] + A[(h >>> 8) & 31] };
}
const tag = (ev, name) => (Array.isArray(ev.tags) ? ev.tags.find((t) => Array.isArray(t) && t[0] === name) : null);

export class Board {
  constructor(game, relays = RELAYS) {
    this.game = game;
    this.key = boardKey();
    this.link = savedLink(this.key.pk);
    this.posts = [];
    this.byId = new Map();
    this.waiting = [];          // posts waiting for their address's holdings
    this.holders = new Map();   // address -> { n, at }
    this.pool = new Pool(relays);
    this.pool.onEvent = (ev) => this._event(ev);
    // each time a relay has answered (at start, or back after an outage), pass on to it
    // what it is missing
    this.pool.onEose = (sub) => {
      if (sub === 'lp-ranks' || sub === 'lp-gallery') { if (this.ranks) this.ranks.ended(sub); return; }
      this.loaded = true;
      this._changed();
      clearTimeout(this._healT);
      this._healT = setTimeout(() => this._heal(), 4000);
    };
    this.pool.onChange = () => this._changed();
    this.onChange = null;
    this.lastSent = 0;
    this.loaded = false;
    this.mine = new Set();
    this.names = new Map();     // address -> { name, at (seconds), ev }
    this.deleted = new Map();   // post id -> [{ pubkey, address, ev }] (anyone may send one; only the author's count)
    this.takedowns = new Map(); // post id -> the author's deletion that took it down
    this.myName = load('board.name', '');
    this.healed = 0;
    this.devHolders = null;     // development only: addresses treated as holders
    this.ranks = null;          // the leaderboard (ranks.js), once its page has been opened
  }

  async start() {
    if (this.pool.started) return;
    // what this browser read before, at once (checked again like everything else)
    try {
      for (const ev of await boardAll()) {
        await this._event(ev, null);
        // only authors' takedowns were ever kept: they stay kept, though the post is gone
        if (ev.kind === 5) for (const t of ev.tags) if (Array.isArray(t) && t[0] === 'e' && !this.takedowns.has(t[1])) this.takedowns.set(t[1], ev);
      }
    } catch { /* no cache */ }
    this.pool.start();
    this.pool.subscribe('lp-board', { kinds: [1], '#t': [BOARD_TAG], limit: 300 });
    this.pool.subscribe('lp-names', { kinds: [0], '#t': [BOARD_TAG], limit: 500 });
    this.pool.subscribe('lp-dels', { kinds: [5], '#t': [BOARD_TAG], limit: 500 });
    this._timer = setInterval(() => this._checkHolders(), 1500);
  }

  // ---------------------------------------------------------------- names
  nameOf(address) {
    const n = this.names.get(address);
    return n && n.name ? n.name : '';
  }

  // what the board shows for an address: its name (with its mark), or the short address
  labelOf(address) {
    const name = this.nameOf(address);
    if (!name) return { name: `${address.slice(0, 6)}…${address.slice(-4)}`, named: false };
    const m = markOf(address);
    let clash = false;
    for (const [a, n] of this.names) if (a !== address && n.name && n.name.toLowerCase() === name.toLowerCase()) { clash = true; break; }
    return { name, named: true, color: m.color, tag: clash ? m.tag : '' };
  }

  // Take a name (or '' to go back to the address). Shown on every post, old and new.
  async setName(raw) {
    if (!this.link) throw new Error('Link a wallet that holds a seeker first');
    const name = cleanName(raw);
    if (raw && String(raw).trim() && !name) throw new Error('Letters and numbers, up to 20; no links');
    if (this.nameWait > 0) throw new Error(`Wait ${Math.ceil(this.nameWait / 1000)} s`);
    const tags = [['t', BOARD_TAG], ['client', 'Low Pass'], ['lp', PROTO, 'name'], ['lp-proof', this.link.address, this.link.signature], ['lp-name', name]];
    const content = JSON.stringify(name ? { name, display_name: name, about: 'A seeker on the Low Pass Codex board.' } : { about: 'A seeker on the Low Pass Codex board.' });
    const ev = await signEvent({ kind: 0, tags, content }, this.key);
    const results = await this.pool.publish(ev);
    const ok = results.filter((r) => r.ok).length;
    if (!ok) throw new Error(results.find((r) => r.why)?.why || 'No relay took it');
    this._namedAt = Date.now();
    this.myName = name;
    save('board.name', name);
    await this._event(ev, null);
    return { ok, of: results.length, name };
  }

  async _nameEvent(ev) {
    const lp = tag(ev, 'lp'), proof = tag(ev, 'lp-proof'), nt = tag(ev, 'lp-name');
    if (!lp || lp[1] !== PROTO || lp[2] !== 'name' || !proof || !nt) return;
    const address = String(proof[1] || '').toLowerCase();
    if (!(await checkEvent(ev))) return;
    if (!checkLink(address, ev.pubkey, String(proof[2] || ''))) return;
    const name = cleanName(nt[1]);
    if (nt[1] && !name) return;
    const at = Number(ev.created_at) || 0;
    const had = this.names.get(address);
    if (had && had.at >= at) return;
    this.names.set(address, { name, at, ev });
    this._changed();
    this._cacheSoon();
  }

  // ---------------------------------------------------------------- deleting
  // whether this browser may delete a post: one of its own address's
  canDelete(p) {
    return !!(this.link && p && p.address === this.link.address);
  }

  async remove(p) {
    if (!this.canDelete(p)) throw new Error('Only its author can delete a post');
    const tags = [['e', p.id], ['t', BOARD_TAG], ['client', 'Low Pass'], ['lp', PROTO, 'delete'], ['lp-proof', this.link.address, this.link.signature]];
    const ev = await signEvent({ kind: 5, tags, content: 'Deleted by its author.' }, this.key);
    const results = await this.pool.publish(ev);
    const ok = results.filter((r) => r.ok).length;
    if (!ok) throw new Error(results.find((r) => r.why)?.why || 'No relay took it');
    await this._event(ev, null);
    return { ok, of: results.length };
  }

  async _deleteEvent(ev) {
    const lp = tag(ev, 'lp'), proof = tag(ev, 'lp-proof');
    if (!lp || lp[1] !== PROTO || lp[2] !== 'delete' || !proof) return;
    const address = String(proof[1] || '').toLowerCase();
    if (!(await checkEvent(ev))) return;
    if (!checkLink(address, ev.pubkey, String(proof[2] || ''))) return;
    let changed = false;
    for (const t of ev.tags) {
      if (!Array.isArray(t) || t[0] !== 'e' || !/^[0-9a-f]{64}$/.test(t[1] || '')) continue;
      const list = this.deleted.get(t[1]) || [];
      if (!list.some((d) => d.ev.id === ev.id)) list.push({ pubkey: ev.pubkey, address, ev });
      this.deleted.set(t[1], list);
      changed = this._drop(t[1]) || changed;
    }
    if (changed) { this._changed(); this._cacheSoon(); }
  }

  // a post goes if a deletion for it came from its author (same key, or same address)
  _drop(id) {
    const ds = this.deleted.get(id), p = this.byId.get(id);
    const d = ds && p ? ds.find((x) => x.pubkey === p.pubkey || x.address === p.address) : null;
    if (!d) return false;
    this.takedowns.set(id, d.ev);
    this.byId.delete(id);
    this.posts = this.posts.filter((x) => x.id !== id);
    return true;
  }

  // ---------------------------------------------------------------- keeping the board
  _cacheSoon() {
    clearTimeout(this._cacheT);
    this._cacheT = setTimeout(() => {
      const evs = this.posts.slice(0, 150).map((p) => p.ev).filter(Boolean);
      for (const n of this.names.values()) if (n.ev) evs.push(n.ev);
      // only the authors' deletions that took something down are worth keeping
      const dels = new Set();
      for (const ev of this.takedowns.values()) if (!dels.has(ev.id)) { dels.add(ev.id); evs.push(ev); }
      boardKeep(evs);
    }, 3000);
  }

  // Pass the notes this browser holds to any relay that answered without them. Anyone
  // may pass a signed note on unchanged; it still carries its author's signature.
  async _heal() {
    const pool = this.pool, cut = Date.now() / 1000 - 45 * 86400;
    const complete = (sub, limit) => pool.relays.filter((r) => r.state === 'open' && (pool.ended.get(sub) || new Set()).has(r.url) && (pool.counts.get(`${sub}|${r.url}`) || 0) < limit).map((r) => r.url);
    const jobs = [];
    const okBoard = complete('lp-board', 300), okNames = complete('lp-names', 500), okDels = complete('lp-dels', 500);
    for (const p of this.posts) if (p.ev && p.ev.created_at > cut) jobs.push([p.ev, okBoard]);
    for (const n of this.names.values()) if (n.ev) jobs.push([n.ev, okNames]);
    const dels = new Set();
    for (const ev of this.takedowns.values()) if (!dels.has(ev.id)) { dels.add(ev.id); jobs.push([ev, okDels]); }
    for (const [ev, urls] of jobs) {
      if (this.healed >= HEAL_MAX) break;
      const have = pool.where.get(ev.id) || new Set();
      const missing = urls.filter((u) => !have.has(u));
      if (!missing.length) continue;
      this.healed++;
      await pool.publishTo(ev, missing);
      await new Promise((r) => setTimeout(r, 800));
    }
  }

  _changed() {
    if (this.onChange) this.onChange();
  }

  async _event(ev) {
    if (ev && ev.kind === 30078) return this.ranks ? this.ranks.event(ev) : undefined;
    if (ev && ev.kind === 0) return this._nameEvent(ev);
    if (ev && ev.kind === 5) return this._deleteEvent(ev);
    if (!ev || ev.kind !== 1 || typeof ev.content !== 'string' || ev.content.length > 1200) return;
    if (this.byId.has(ev.id)) return;
    const lp = tag(ev, 'lp');
    const proof = tag(ev, 'lp-proof');
    if (!lp || lp[1] !== PROTO || !proof) return;
    const address = String(proof[1] || '').toLowerCase();
    if (!(await checkEvent(ev))) return;
    if (!checkLink(address, ev.pubkey, String(proof[2] || ''))) return;
    const post = {
      id: ev.id, ev, pubkey: ev.pubkey, address, at: Number(ev.created_at) * 1000,
      type: lp[2] === 'scan' ? 'scan' : 'msg',
      text: redact(ev.content.trim()).slice(0, 1200),
    };
    if (post.type === 'scan') {
      const s = tag(ev, 'lp-scan');
      if (!s || !/^0x[0-9a-f]{64}$/i.test(s[1] || '')) return;
      post.scan = { tx: s[1].toLowerCase(), block: Number(s[2]) || null, tokens: String(s[3] || '').split(',').map(Number).filter((n) => n >= 1 && n <= 2222).slice(0, 40), name: String(s[4] || '').slice(0, 60), code: String(s[5] || '').slice(0, 12), family: String(s[6] || '').slice(0, 12), kind: s[7] === 'wild' ? 'wild' : s[7] === 'witnessed' ? 'witnessed' : 'move', depth: Math.max(0, Math.min(999, parseInt(s[8], 10) || 0)) };
      if (post.scan.kind === 'wild') post.scan.tokens = [];
      const ph = tag(ev, 'lp-photo');
      if (ph && typeof ph[1] === 'string' && ph[1].length <= MAX_PHOTO && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(ph[1])) post.photo = ph[1];
      // the words of a scan post, without the line the game writes for other clients
      const nl = post.text.indexOf('\n\n');
      post.note = nl >= 0 ? post.text.slice(nl + 2) : '';
    }
    this.waiting.push(post);
  }

  // whether each waiting post's address holds a seeker now, in one read
  async _checkHolders() {
    if (!this.waiting.length) return;
    const now = Date.now();
    const need = [...new Set(this.waiting.map((p) => p.address))].filter((a) => {
      const h = this.holders.get(a);
      return !h || now - h.at > 600000;
    });
    if (need.length) {
      try {
        const n = await this.game.chain.balances(need);
        if (this.devHolders) need.forEach((a, i) => { if (this.devHolders.has(a)) n[i] = Math.max(n[i], 1); });
        need.forEach((a, i) => this.holders.set(a, { n: n[i], at: Date.now() }));
      } catch {
        return;   // try again later
      }
    }
    const still = [];
    for (const p of this.waiting) {
      const h = this.holders.get(p.address);
      if (!h) { still.push(p); continue; }
      if (h.n >= 1 && !this.byId.has(p.id)) {
        p.holds = h.n;
        this.byId.set(p.id, p);
        this.posts.push(p);
        this._drop(p.id);       // already deleted by its author
      }
    }
    this.waiting = still;
    this.posts.sort((a, b) => b.at - a.at);
    this._changed();
    this._cacheSoon();
  }

  async holdingsOf(address, fresh = false) {
    const h = this.holders.get(address);
    if (h && !fresh && Date.now() - h.at < 600000) return h.n;
    let [n] = await this.game.chain.balances([address]);
    if (this.devHolders && this.devHolders.has(address)) n = Math.max(n, 1);
    this.holders.set(address, { n, at: Date.now() });
    return n;
  }

  async linkWallet(provider) {
    this.link = await linkWallet(provider, this.key.pk);
    this._changed();
    return this.link;
  }
  unlink() {
    forget();
    this.link = null;
    this._changed();
  }

  // how long until the next post, or the next name, may go (ms; 0: now)
  get sendWait() { return Math.max(0, SEND_GAP - (Date.now() - this.lastSent)); }
  get nameWait() { return Math.max(0, NAME_GAP - (Date.now() - (this._namedAt || 0))); }

  // Post words, or a scan with words. Throws a short reason when it cannot.
  async send(text, entry = null) {
    text = (text || '').replace(/\r/g, '').trim();
    if (!this.link) throw new Error('Link a wallet that holds a seeker first');
    if (!entry && !text) throw new Error('Nothing to send');
    if (text.length > MAX_TEXT) throw new Error(`At most ${MAX_TEXT} characters`);
    if (hasLink(text)) throw new Error('Text only: no links');
    if (this.sendWait > 0) throw new Error(`Wait ${Math.ceil(this.sendWait / 1000)} s`);
    const n = await this.holdingsOf(this.link.address, true);
    if (n < 1) throw new Error('This address holds no SEEKER NET seeker');
    const tags = [['t', BOARD_TAG], ['client', 'Low Pass'], ['lp', PROTO, entry ? 'scan' : 'msg'], ['lp-proof', this.link.address, this.link.signature]];
    let content = text;
    if (entry) {
      if (entry.photo.length > MAX_PHOTO) throw new Error('The photograph is too large');
      const kind = entry.kind || 'move';
      tags.push(['lp-scan', entry.hash || entry.tx, String(entry.block || ''), entry.tokens.join(','), entry.name, entry.code, entry.family, kind, String(entry.depth || 0)]);
      tags.push(['lp-photo', entry.photo]);
      const origin = kind === 'wild' ? 'A wild one: no other ship will find it.' : kind === 'witnessed' ? `Witnessed: it rose when SEEKER #${entry.lead} moved, for every ship flying then.` : `It appeared when SEEKER #${entry.lead} moved.`;
      content = `${entry.name} (${entry.code}), scanned over the Fog Belt in Low Pass. ${origin}${text ? `\n\n${text}` : ''}`;
    }
    const ev = await signEvent({ kind: 1, tags, content }, this.key);
    this.pool.seen.add(ev.id);
    const results = await this.pool.publish(ev);
    const ok = results.filter((r) => r.ok).length;
    if (!ok) throw new Error(results.find((r) => r.why)?.why || 'No relay took it');
    this.lastSent = Date.now();
    this.mine.add(ev.id);
    // shown at once, through the same checks as everyone's
    this.pool.seen.delete(ev.id);
    await this._event(ev);
    this.pool.seen.add(ev.id);
    await this._checkHolders();
    return { ok, of: results.length, id: ev.id };
  }
}
