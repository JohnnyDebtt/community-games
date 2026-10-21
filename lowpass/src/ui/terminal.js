import { el, clear, ago, dateStr, short, key } from './dom.js';
import { Board, hasLink } from '../net/board.js';
import { Ranks } from '../net/ranks.js';
import { load, save } from '../core/store.js';
import { discover, connect, connected, disconnect } from '../net/wallet.js';
import * as art from '../chain/art.js';
import { formatInt, formatNum, clamp } from '../core/math.js';

// The Codex computer. Four tabs:
//   LOG      what you have recorded: each photograph, its name, where it came from, the
//            Codex's notes; share it to the board.
//   BOARD    the seekers' board on Nostr: scans and words from holders, readable by all.
//   SEEKERS  your SEEKER NET devices: charge, stage, Discharge, Uplink, shares, traits,
//            and when each should activate; and the wallet link that lets you post.
//   LEADERS  the holders who submitted their scans, witnessed ones first (ranks.js), each
//            with a gallery of what they recorded; and your own submission.
// Keys: TAB changes tab, arrows move, ENTER chooses, ESC closes. Text fields take the keys
// while they have focus.

const TABS = ['log', 'board', 'seekers', 'ranks'];
const NAMES = { log: 'LOG', board: 'BOARD', seekers: 'SEEKERS', ranks: 'LEADERS' };
const DAY = 86400000;
const EXPLORER = 'https://robinhoodchain.blockscout.com/tx/';

export class Terminal {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.tab = 'log';
    this.sel = 0;
    this.boardFilter = 'all';
    this.smallPhotos = load('board.small', false);
    this.gallery = null;         // the holder whose gallery is open on the LEADERS page
    this.gsel = 0;
    this.root = el('div', 'term', game.uiRoot);
    this.win = el('div', 'win', this.root);
    const head = el('div', 'thead', this.win);
    el('div', 'ttitle', head, 'CODEX');
    this.tabsEl = el('div', 'ttabs', head);
    this.tabBtns = {};
    for (const t of TABS) {
      const b = el('button', 'ttab', this.tabsEl, NAMES[t]);
      b.onclick = () => this.setTab(t);
      this.tabBtns[t] = b;
    }
    const x = el('button', 'tclose', head, 'X');
    x.onclick = () => this.hide();
    this.body = el('div', 'tbody', this.win);
    this.foot = el('div', 'tfoot', this.win);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.hide(); });
    this.board = null;
    this.seekers = { address: null, ids: null, state: new Map(), loading: false, err: '', sel: 0, view: null, net: null };
    this._tick = 0;
  }

  show(tab) {
    const g = this.game;
    if (!this.board) {
      // a test relay on this machine, for development only (never a stranger's link)
      const q = new URLSearchParams(location.search);
      const relay = q.has('dev') && /^ws:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(q.get('relay') || '') ? q.get('relay') : null;
      this.board = new Board(g, relay ? [relay] : undefined);
      this.board.onChange = () => {
        if (!this.open) return;
        if (this.tab === 'board') { this._renderBoardList(); save('board.seen', Date.now()); }
        if (this.tab === 'seekers') this._renderWalletLine();
        this._dots();
      };
      const l = this.board.link;
      this.seekers.address = l ? l.address : connected();
    }
    this.board.start();
    g.input.unlock();
    this.open = true;
    if (tab) this.tab = tab;
    this.root.classList.add('on');
    g.audio.play('open');
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    this.game.input.uiCapture = false;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    this.game.audio.play('close');
  }

  setTab(t) {
    if (t !== 'seekers') this._linkFrom = null;
    this.tab = t;
    this.sel = 0;
    this.game.audio.play('ui', { h: 20 });
    this.render();
  }

  // to the wallet, from a page that needs it: linked, it comes back there
  _toLink() {
    const from = this.tab;
    this.setTab('seekers');
    this._linkFrom = from;
  }

  // quiet marks on the tabs: new words on the board since it was last read; scans not
  // yet submitted to the leaderboard (for a linked holder)
  _dots() {
    const b = this.board, g = this.game;
    if (!b) return;
    const seen = load('board.seen', 0);
    const newest = b.posts.length ? b.posts[0].at : 0;
    this.tabBtns.board.classList.toggle('dot', this.tab !== 'board' && newest > seen);
    const sent = new Set(b.ranks ? b.ranks.sent.keys : load('ranks.sent', { keys: [] }).keys);
    this.tabBtns.ranks.classList.toggle('dot', !!b.link && this.tab !== 'ranks' && g.codex.some((e) => !sent.has(e.tx)));
  }

  keys(input) {
    if (input.uiCapture) return;
    if (this.tab === 'ranks' && this.gallery && input.hit('Escape', 'Pad1')) { this._closeGallery(); return; }
    if (input.hit('Escape', 'KeyX', 'KeyK', 'Pad1')) { this.hide(); return; }
    if (input.hit('Tab', 'Pad5')) {
      this.setTab(TABS[(TABS.indexOf(this.tab) + 1) % TABS.length]);
      return;
    }
    if (this.tab === 'ranks') { this._rankKeys(input); return; }
    const n = this.tab === 'log' ? this.game.codex.length : this.tab === 'seekers' ? (this.seekers.ids || []).length : 0;
    if (!n) return;
    const cols = this._cols || 3;
    let d = 0;
    if (input.hit('ArrowRight', 'KeyD')) d = 1;
    if (input.hit('ArrowLeft', 'KeyA')) d = -1;
    if (input.hit('ArrowDown', 'KeyS')) d = cols;
    if (input.hit('ArrowUp', 'KeyW')) d = -cols;
    if (d) {
      if (this.tab === 'log') { this.sel = clamp(this.sel + d, 0, n - 1); this.render(); }
      else { this.seekers.sel = clamp(this.seekers.sel + d, 0, n - 1); this._renderSeekerDetail(); this._markSel(); }
      this.game.audio.play('ui', { h: 24 });
    }
  }

  // tick: live numbers (charges) refresh twice a second
  update(dt) {
    if (!this.open) return;
    this._tick += dt;
    if (this._tick > 0.5) {
      this._tick = 0;
      if (this.tab === 'seekers' && this._chargeEl) this._renderCharge();
    }
  }

  render() {
    for (const t of TABS) this.tabBtns[t].classList.toggle('sel', t === this.tab);
    this.win.dataset.tab = this.tab;
    clear(this.body);
    clear(this.foot);
    this._chargeEl = null;
    if (this.tab === 'board') save('board.seen', Date.now());
    if (this.tab === 'log') this._log();
    else if (this.tab === 'board') this._board();
    else if (this.tab === 'ranks') this._ranks();
    else this._seekersTab();
    const f = this.foot;
    const k = (cap, what) => { const s = el('span', 'kr', f); key(s, cap); el('span', '', s, what); };
    k('TAB', 'tab');
    if (this.tab === 'ranks') k(this.gallery ? '←→' : '↑↓', 'choose');
    else if (this.tab !== 'board') k('←→', 'choose');
    if (this.tab === 'ranks' && !this.gallery) k('ENTER', 'their scans');
    k('ESC', this.tab === 'ranks' && this.gallery ? 'back' : 'close');
    this._dots();
  }

  // ---------------------------------------------------------------- LOG
  _log() {
    const g = this.game;
    const list = g.codex;
    if (!list.length) {
      const e = el('div', 'empty', this.body);
      el('div', 'big', e, 'NOTHING RECORDED YET');
      el('div', 'muted', e, `Lights in the fog are artifacts. Most grow for you alone: nobody else will ever find the same one. But when a SEEKER NET seeker moves on chain while you fly, that seeker itself rises out of the fog, giant: witnessed, the same for every ship flying then. Steer toward a light, and hold ${g.input.touchMode ? 'SCAN' : 'SPACE'} while it is in your sights.`);
      if (g.moves.waiting) el('div', 'muted', e, `${g.moves.waiting} witnessed move${g.moves.waiting === 1 ? '' : 's'} waiting in the fog.`);
      return;
    }
    this.sel = clamp(this.sel, 0, list.length - 1);
    const cols = el('div', 'cols', this.body);
    const grid = el('div', 'grid photos', cols);
    this._cols = 3;
    list.forEach((e, i) => {
      const w = el('button', 'well' + (i === this.sel ? ' sel' : '') + (e.special ? ' witnessed' : ''), grid);
      const img = el('img', '', w);
      img.src = e.photo;
      img.alt = e.name;
      if (e.special) el('span', 'wtag', w, 'WITNESSED');
      w.onclick = () => { this.sel = i; this.render(); this.game.audio.play('ui', { h: 24 }); };
    });
    const e = list[this.sel];
    const d = el('div', 'detail', cols);
    const ph = el('img', 'bigphoto', d);
    ph.src = e.photo;
    ph.alt = e.name;
    el('div', 'name', d, e.name);
    el('div', 'muted', d, `${e.code} · ${e.cls}`);
    const o = el('div', 'rows', d);
    const row = (k, v, cls) => { const r = el('div', 'row', o); el('span', 'k', r, k); return el('span', 'v ' + (cls || ''), r, v); };
    if (e.kind === 'wild') {
      row('ORIGIN', 'WILD · found by this ship alone');
      row('SEED', `${e.tx.slice(0, 10)}…${e.tx.slice(-6)}`, 'muted');
    } else {
      if (e.special) row('WITNESSED', 'a seeker moved while you flew: every ship flying then met this one', 'gold');
      row('ORIGIN', e.tokens.length > 1 ? `SEEKER ${e.tokens.slice(0, 6).map((t) => '#' + t).join(' ')}` : `SEEKER #${e.lead}`);
      if (e.time) row('MOVED', `${dateStr(e.time)} · ${ago(e.time)}`);
      if (e.block) row('BLOCK', formatInt(e.block));
      const tx = row('TX', '');
      const h = e.hash || e.tx;
      const a = el('a', 'tx', tx, `${h.slice(0, 10)}…${h.slice(-6)}`);
      a.href = EXPLORER + h;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    row('RECORDED', `${dateStr(e.scannedAt)} · ${e.clock} on the planet`);
    const notes = el('div', 'notes', d);
    for (const n of e.notes) el('div', '', notes, n);
    // share
    const share = el('div', 'share', d);
    if (e.shared) {
      el('div', 'pos', share, `SHARED TO THE BOARD · ${ago(e.shared.at)}`);
    } else if (this.board && this.board.link) {
      const input = this._textField(share, 'A note for the board (optional, no links)', 200);
      const b = el('button', 'btn', share, 'SHARE TO BOARD');
      const msg = el('div', 'msg', share);
      b.onclick = async () => {
        b.disabled = true;
        msg.textContent = 'Signing and sending…';
        msg.className = 'msg muted';
        try {
          const r = await this.board.send(input.value, e);
          e.shared = { id: r.id, at: Date.now() };
          const { img, ...stored } = e;
          (await import('../core/store.js')).codexPut(stored);
          this.game.audio.play('send');
          msg.textContent = `Sent to ${r.ok} of ${r.of} relays.`;
          msg.className = 'msg pos';
          setTimeout(() => { if (this.open && this.tab === 'log') this.render(); }, 1600);
        } catch (err) {
          msg.textContent = err.message;
          msg.className = 'msg neg';
          this._countdown(b, 'SHARE TO BOARD', 'SHARE IN', () => this.board.sendWait);
          this.game.audio.play('error');
        }
      };
      this._countdown(b, 'SHARE TO BOARD', 'SHARE IN', () => this.board.sendWait);
    } else {
      const b = el('button', 'btn ghost', share, 'LINK A WALLET TO SHARE');
      b.onclick = () => this._toLink();
    }
  }

  _textField(parent, placeholder, max) {
    const input = el('textarea', 'field', parent);
    input.placeholder = placeholder;
    input.maxLength = max;
    input.rows = 2;
    input.addEventListener('focus', () => { this.game.input.uiCapture = true; });
    input.addEventListener('blur', () => { this.game.input.uiCapture = false; });
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape') input.blur();
    });
    input.addEventListener('input', () => {
      input.classList.toggle('bad', hasLink(input.value));
    });
    return input;
  }

  // A button that cannot be pressed again yet says when it can, counting down each
  // second, and keeps one width while it does.
  _countdown(btn, label, waiting, left) {
    if (!btn.isConnected) return;
    if (!btn.style.minWidth) {
      btn.textContent = `${waiting} 20`;
      btn.style.minWidth = `${btn.offsetWidth}px`;
    }
    clearTimeout(btn._tick);
    const tick = () => {
      if (!btn.isConnected) return;
      const ms = left();
      btn.disabled = ms > 0;
      btn.textContent = ms > 0 ? `${waiting} ${Math.ceil(ms / 1000)}` : label;
      if (ms > 0) btn._tick = setTimeout(tick, (ms % 1000) + 20);
    };
    tick();
  }

  // ---------------------------------------------------------------- BOARD
  _board() {
    const b = this.board;
    const top = el('div', 'boardtop', this.body);
    this._boardStatus = el('div', 'muted', top);
    const filters = el('div', 'filters', top);
    for (const [f, label] of [['all', 'ALL'], ['scan', 'SCANS'], ['msg', 'WORDS']]) {
      const x = el('button', 'chip' + (this.boardFilter === f ? ' sel' : ''), filters, label);
      x.onclick = () => { this.boardFilter = f; this.render(); };
    }
    // scans' photographs as small thumbnails, so the words are easier to follow
    const sm = el('button', 'chip' + (this.smallPhotos ? ' sel' : ''), filters, 'SMALL PHOTOS');
    sm.onclick = () => { this.smallPhotos = !this.smallPhotos; save('board.small', this.smallPhotos); sm.classList.toggle('sel', this.smallPhotos); this._renderBoardList(); };
    this._boardList = el('div', 'posts', this.body);
    // a conversation: oldest at the top, newest at the bottom, opened at the newest;
    // it follows new posts while you are at the bottom, and stays put while you read up
    this._boardPinned = true;
    this._boardList.addEventListener('scroll', () => {
      const l = this._boardList;
      this._boardPinned = l.scrollTop + l.clientHeight >= l.scrollHeight - 24;
    });
    // the box changes size as the page around it settles: stay at the newest
    if (window.ResizeObserver) {
      const l = this._boardList;
      new ResizeObserver(() => { if (this._boardPinned) l.scrollTop = l.scrollHeight; }).observe(l);
    }
    const comp = el('div', 'compose', this.body);
    if (b.link) {
      // your name on the board: shown instead of your address, on every post, old and new
      const nm = el('div', 'nameRow', comp);
      el('span', 'muted', nm, 'NAME');
      const nameIn = el('input', 'field one', nm);
      nameIn.maxLength = 24;
      nameIn.placeholder = 'a name instead of your address (2 to 20)';
      nameIn.value = b.myName || b.nameOf(b.link.address) || '';
      nameIn.addEventListener('focus', () => { this.game.input.uiCapture = true; });
      nameIn.addEventListener('blur', () => { this.game.input.uiCapture = false; });
      nameIn.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape') nameIn.blur(); if (ev.key === 'Enter') nameBtn.click(); });
      const nameBtn = el('button', 'chip', nm, 'SAVE');
      const nameMsg = el('div', 'msg muted', comp, b.nameOf(b.link.address) ? `Posting as ${b.nameOf(b.link.address)}. Every post of yours shows it, old ones too.` : 'No name yet: your posts show a shortened address.');
      nameBtn.onclick = async () => {
        nameBtn.disabled = true;
        nameMsg.className = 'msg muted';
        nameMsg.textContent = 'Signing and sending…';
        try {
          const r = await b.setName(nameIn.value);
          nameMsg.className = 'msg pos';
          nameMsg.textContent = r.name ? `Posting as ${r.name}, on every post of yours, old ones too (sent to ${r.ok} of ${r.of} relays).` : 'Name cleared: your posts show a shortened address again.';
          this.game.audio.play('send');
          this._renderBoardList();
        } catch (err) {
          nameMsg.className = 'msg neg';
          nameMsg.textContent = err.message;
          this.game.audio.play('error');
        }
        this._countdown(nameBtn, 'SAVE', 'SAVE IN', () => b.nameWait);
      };
      this._countdown(nameBtn, 'SAVE', 'SAVE IN', () => b.nameWait);
      const input = this._textField(comp, 'Words for the board: text only, no links (280)', 280);
      const send = el('button', 'btn', comp, 'SEND');
      const msg = el('div', 'msg', comp);
      send.onclick = async () => {
        send.disabled = true;
        msg.textContent = 'Sending…';
        msg.className = 'msg muted';
        try {
          const r = await b.send(input.value);
          this._boardPinned = true;
          input.value = '';
          msg.textContent = `Sent to ${r.ok} of ${r.of} relays.`;
          msg.className = 'msg pos';
          this.game.audio.play('send');
        } catch (err) {
          msg.textContent = err.message;
          msg.className = 'msg neg';
          this.game.audio.play('error');
        }
        this._countdown(send, 'SEND', 'SEND IN', () => b.sendWait);
      };
      this._countdown(send, 'SEND', 'SEND IN', () => b.sendWait);
    } else {
      el('div', 'muted', comp, 'Read only. To post, link a wallet that holds a SEEKER NET seeker.');
      const l = el('button', 'btn ghost', comp, 'LINK WALLET');
      l.onclick = () => this._toLink();
    }
    this._renderBoardList();
  }

  _renderBoardList() {
    if (!this._boardList || !this._boardList.isConnected) return;
    const b = this.board;
    const n = b.pool.connected();
    this._boardStatus.textContent = `${n} of ${b.pool.relays.length} relays · ${b.posts.length} post${b.posts.length === 1 ? '' : 's'} from holders${b.loaded ? '' : ' · reading…'}`;
    const list = this._boardList;
    const keep = list.scrollTop, pinned = this._boardPinned;
    const toEnd = () => { if (this._boardPinned) list.scrollTop = list.scrollHeight; };
    clear(list);
    list.classList.toggle('small', this.smallPhotos);
    const posts = b.posts.filter((p) => this.boardFilter === 'all' || p.type === this.boardFilter);
    if (!posts.length) {
      if (b.loaded) el('div', 'muted empty', list, 'Nothing here yet. The first scan shared will be the first thing here.');
      else loader(list, 'Listening to the relays');
      return;
    }
    // the newest 120, in the order they were written
    for (const p of posts.slice(0, 120).reverse()) {
      const card = el('div', 'post' + (b.mine.has(p.id) ? ' mine' : ''), list);
      const h = el('div', 'phead', card);
      // who: their name (and a mark that tells same names apart), else a short address
      const who = b.labelOf(p.address);
      if (who.named) el('i', `pmark c${who.color}`, h);
      el('span', 'who', h, who.name);
      if (who.tag) el('span', 'muted', h, ` ·${who.tag}`);
      el('span', 'muted', h, ` holds ${p.holds} · ${ago(p.at)}`);
      if (b.canDelete(p)) {
        const del = el('button', 'chip pdel', h, 'DELETE');
        del.onclick = async () => {
          if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'DELETE FOR EVERYONE?'; setTimeout(() => { if (del.isConnected) { del.dataset.sure = ''; del.textContent = 'DELETE'; } }, 4000); return; }
          del.disabled = true;
          del.textContent = 'DELETING…';
          try { await b.remove(p); this.game.audio.play('close'); this._renderBoardList(); } catch (err) { del.textContent = err.message.slice(0, 40); this.game.audio.play('error'); }
        };
      }
      if (p.type === 'scan' && p.scan) {
        const row = el('div', 'pscan', card);
        if (p.photo) {
          const img = el('img', '', row);
          img.onload = toEnd;
          img.src = p.photo;
          img.alt = p.scan.name;
          // small, a photograph opens (and closes) where it is
          img.onclick = () => { if (this.smallPhotos) row.classList.toggle('open'); };
        }
        const t = el('div', 'ptext', row);
        el('div', 'name', t, p.scan.name || 'An artifact');
        el('div', 'muted', t, `${p.scan.code}${p.scan.kind === 'wild' ? ' · WILD, FOUND BY ONE SHIP' : p.scan.tokens.length ? ` · ${p.scan.kind === 'witnessed' ? 'WITNESSED · ' : ''}SEEKER #${p.scan.tokens[0]}` : ''}`);
        if (p.note) el('div', '', t, p.note);
        const known = this.game.codex.find((e) => (e.hash || e.tx) === p.scan.tx && (e.kind === 'wild' || !p.scan.tokens.length || e.lead === p.scan.tokens[0]));
        if (known) el('div', 'pos', t, 'You recorded this one too.');
      } else {
        el('div', 'ptext', card, p.text);
      }
    }
    if (pinned) { list.scrollTop = list.scrollHeight; requestAnimationFrame(toEnd); }
    else list.scrollTop = keep;
  }

  // ---------------------------------------------------------------- LEADERS
  _ranks() {
    const b = this.board;
    if (!b.ranks) b.ranks = new Ranks(b);
    const R = b.ranks;
    R.onChange = () => { if (this.open && this.tab === 'ranks') { this._renderRanks(); this._renderSubmit(); } };
    R.onPhoto = () => { if (this.open && this.tab === 'ranks' && this.gallery) this._renderRanks(); };
    R.start();
    const top = el('div', 'boardtop', this.body);
    this._rankStatus = el('div', 'muted', top);
    this._rankArea = el('div', 'ranks', this.body);
    this._rankFoot = el('div', 'rsubmit', this.body);
    this._renderRanks();
    this._renderSubmit();
  }

  _renderRanks() {
    const area = this._rankArea;
    if (!area || !area.isConnected) return;
    const R = this.board.ranks;
    const rows = R.rows();
    const pending = rows.reduce((n, r) => n + r.pending, 0);
    this._rankStatus.textContent = `${rows.length} holder${rows.length === 1 ? '' : 's'} · witnessed scans count first, then wild${pending ? ` · checking ${pending} witnessed on the chain` : ''}${R.loaded ? '' : ' · reading…'}`;
    const keep = area.scrollTop;
    clear(area);
    if (this.gallery) { this._renderGallery(rows); return; }
    if (!rows.length) {
      if (!R.loaded) loader(area, 'Listening to the relays');
      else if (R.checking) loader(area, 'Checking who holds a seeker, on Robinhood Chain');
      else el('div', 'muted empty', area, 'No holder has submitted their scans yet. Yours could be the first.');
      return;
    }
    const head = el('div', 'rrow rhead muted', area);
    for (const t of ['#', 'HOLDER', 'WITNESSED', 'WILD', '']) el('span', '', head, t);
    this.rsel = clamp(this.rsel || 0, 0, rows.length - 1);
    rows.forEach((r, i) => {
      const row = el('div', 'rrow' + (r.you ? ' you' : '') + (i === this.rsel ? ' sel' : ''), area);
      row.onclick = () => this._openGallery(r.address, i);
      el('span', 'rk', row, String(i + 1));
      const who = el('span', 'rwho', row);
      if (r.label.named) el('i', `pmark c${r.label.color}`, who);
      el('span', 'who', who, r.label.name);
      if (r.label.tag) el('span', 'muted', who, ` ·${r.label.tag}`);
      if (r.you) el('span', 'pos', who, ' · YOU');
      el('span', 'rs gold', row, String(r.special));
      el('span', 'rw', row, String(r.regular));
      const g = el('button', 'rgal', row);
      g.title = 'Their scans';
      g.setAttribute('aria-label', `${r.label.name}: their scans`);
      for (let k = 0; k < 4; k++) el('i', '', g);
      g.onclick = (e) => { e.stopPropagation(); this._openGallery(r.address, i); };
    });
    area.scrollTop = keep;
  }

  // one holder's scans: their photographs (fetched as the gallery opens), the witnessed
  // ones marked, and the one chosen, large
  _renderGallery(rows) {
    const R = this.board.ranks, area = this._rankArea, g = this.game;
    const r = rows.find((x) => x.address === this.gallery);
    const head = el('div', 'ghead', area);
    const back = el('button', 'chip', head, '‹ BACK');
    back.onclick = () => this._closeGallery();
    if (!r) { el('div', 'muted empty', area, 'Their scans are not counted here now.'); return; }
    if (r.label.named) el('i', `pmark c${r.label.color}`, head);
    el('span', 'who', head, r.label.name);
    el('span', 'muted', head, ` · ${r.special} witnessed · ${r.regular} wild`);
    const local = new Map(r.you ? g.codex.map((e) => [e.tx, e.photo]) : []);
    const photoOf = (s) => R.photos.get(s.key) || local.get(s.key) || null;
    const cols = el('div', 'cols', area);
    const grid = el('div', 'grid photos', cols);
    this.gsel = clamp(this.gsel, 0, r.scans.length - 1);
    r.scans.forEach((s, i) => {
      const w = el('button', 'well' + (i === this.gsel ? ' sel' : '') + (s.kind === 's' && s.counted ? ' witnessed' : '') + (s.counted ? '' : ' uncounted'), grid);
      const ph = photoOf(s);
      if (ph) { const img = el('img', '', w); img.src = ph; img.alt = s.name; }
      else el('span', 'wcode muted', w, s.code || '…');
      if (s.kind === 's' && s.counted) el('span', 'wtag', w, s.token ? `#${s.token}` : 'WITNESSED');
      w.onclick = () => { this.gsel = i; this.game.audio.play('ui', { h: 24 }); this._renderRanks(); };
    });
    const s = r.scans[this.gsel];
    const d = el('div', 'detail', cols);
    const ph = photoOf(s);
    if (ph) { const img = el('img', 'bigphoto', d); img.src = ph; img.alt = s.name; }
    else el('div', 'bigphoto gwait muted', d, 'The photograph is on its way, or was not sent.');
    el('div', 'name', d, s.name || 'An artifact');
    const what = s.kind === 's' ? (s.counted ? `WITNESSED · SEEKER #${s.token}` : 'WITNESSED · NOT CONFIRMED ON THE CHAIN') : s.kind === 'w' ? 'WILD · FOUND BY ONE SHIP' : 'RECORDED';
    el('div', s.kind === 's' && s.counted ? 'gold' : 'muted', d, `${s.code}${s.code ? ' · ' : ''}${what}`);
    el('div', 'muted', d, `Scanned ${dateStr(s.at * 1000)} · ${ago(s.at * 1000)}${s.counted ? '' : ' · not counted'}`);
  }

  _openGallery(address, i = 0) {
    this.rsel = i;
    this.gallery = address;
    this.gsel = 0;
    this.board.ranks.openGallery(address);
    this.game.audio.play('ui', { h: 24 });
    this.render();
  }

  _closeGallery() {
    this.gallery = null;
    this.board.ranks.closeGallery();
    this.game.audio.play('ui', { h: 20 });
    this.render();
  }

  // the leaderboard by keys: up and down choose a holder, ENTER opens their scans; in a
  // gallery the arrows move through them
  _rankKeys(input) {
    const R = this.board.ranks;
    if (!R) return;
    const rows = R.rows();
    if (this.gallery) {
      const r = rows.find((x) => x.address === this.gallery);
      const n = r ? r.scans.length : 0;
      let d = 0;
      if (input.hit('ArrowRight', 'KeyD')) d = 1;
      if (input.hit('ArrowLeft', 'KeyA')) d = -1;
      if (input.hit('ArrowDown', 'KeyS')) d = 3;
      if (input.hit('ArrowUp', 'KeyW')) d = -3;
      if (d && n) { this.gsel = clamp(this.gsel + d, 0, n - 1); this.game.audio.play('ui', { h: 24 }); this._renderRanks(); }
      return;
    }
    if (!rows.length) return;
    let d = 0;
    if (input.hit('ArrowDown', 'KeyS')) d = 1;
    if (input.hit('ArrowUp', 'KeyW')) d = -1;
    if (d) {
      this.rsel = clamp((this.rsel || 0) + d, 0, rows.length - 1);
      this.game.audio.play('ui', { h: 24 });
      this._renderRanks();
      const el_ = this._rankArea && this._rankArea.querySelector('.rrow.sel');
      if (el_ && el_.scrollIntoView) el_.scrollIntoView({ block: 'nearest' });
    }
    if (input.hit('Enter', 'Space', 'Pad0')) { const r = rows[clamp(this.rsel || 0, 0, rows.length - 1)]; if (r) this._openGallery(r.address, this.rsel); }
  }

  _renderSubmit() {
    const f = this._rankFoot;
    if (!f || !f.isConnected) return;
    clear(f);
    const b = this.board, R = b.ranks, g = this.game;
    // a gallery has the whole page
    f.style.display = this.gallery ? 'none' : '';
    if (this.gallery) return;
    if (!b.link) {
      el('div', 'muted', f, 'Holders put their own scans here: link a wallet that holds a SEEKER NET seeker (one free signature, not a transaction).');
      const l = el('button', 'btn ghost', f, 'LINK WALLET');
      l.onclick = () => this._toLink();
      return;
    }
    const n = R.unsent, all = g.codex.length;
    el('div', 'muted', f, !all ? 'Scan something first: what you record can be submitted here.' : n ? `${n} of your ${all} scan${all === 1 ? '' : 's'} ${n === 1 ? 'is' : 'are'} not on the leaderboard yet.` : `All ${all} of your scans are on the leaderboard.`);
    const label = `SUBMIT ${n} SCAN${n === 1 ? '' : 'S'}`;
    const btn = el('button', 'btn', f, label);
    if (!n) btn.style.display = 'none';
    const msg = el('div', 'msg muted', f);
    const r = R.lastResult;
    if (r) {
      msg.className = 'msg pos';
      msg.textContent = `Submitted ${r.scans} scan${r.scans === 1 ? '' : 's'} to ${r.ok} of ${r.of} relays.${R.photoJob ? ` Sending their photographs: ${R.photoJob.done} of ${R.photoJob.of}.` : ''}`;
    }
    if (!all) btn.disabled = true;
    else this._countdown(btn, label, 'SUBMIT IN', () => R.submitWait);
    btn.onclick = async () => {
      btn.disabled = true;
      msg.className = 'msg muted';
      msg.textContent = 'Signing and sending…';
      try {
        await R.submit(() => { if (this.open && this.tab === 'ranks') this._renderSubmit(); });
        this.game.audio.play('send');
        this._renderSubmit();
      } catch (err) {
        msg.className = 'msg neg';
        msg.textContent = err.message;
        this.game.audio.play('error');
        this._countdown(btn, label, 'SUBMIT IN', () => R.submitWait);
      }
    };
  }

  // ---------------------------------------------------------------- SEEKERS
  _seekersTab() {
    const S = this.seekers;
    const top = el('div', 'wallet', this.body);
    this._walletEl = top;
    this._renderWalletLine();
    const area = el('div', 'cols', this.body);
    this._seekGrid = el('div', 'grid seekers', area);
    this._seekDetail = el('div', 'detail', area);
    this._cols = 4;
    if (S.address && !S.ids && !S.loading) this._loadSeekers(S.address);
    this._renderSeekerGrid();
    if (!S.net) this._loadNetwork();
  }

  _renderWalletLine() {
    const top = this._walletEl;
    if (!top || !top.isConnected) return;
    clear(top);
    const b = this.board, S = this.seekers;
    const msgRow = () => el('div', 'msg', top);
    // pick a wallet (EIP-6963), then do something with it
    const withWallet = async (row, msg, fn) => {
      msg.className = 'msg muted';
      msg.textContent = 'Looking for wallets…';
      const ws = await discover();
      if (!ws.length) {
        if (!this.game.input.touchMode) { msg.className = 'msg neg'; msg.textContent = 'No browser wallet found. MetaMask, Rabby and other EIP-6963 wallets work.'; return; }
        // a phone's browser has no wallet in it: the wallet app has a browser of its own
        msg.className = 'msg muted';
        msg.textContent = 'No wallet in this browser. On a phone, open Low Pass in your wallet app’s own browser. ';
        const a = el('a', '', msg, 'OPEN IN METAMASK');
        a.href = `https://metamask.app.link/dapp/${location.host}${location.pathname}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return;
      }
      const go = async (w) => {
        try { await fn(w, msg); } catch (err) {
          msg.className = 'msg neg';
          msg.textContent = err && err.message ? err.message.slice(0, 120) : 'Not connected';
        }
      };
      if (ws.length === 1) go(ws[0]);
      else {
        clear(row);
        for (const w of ws) { const x = el('button', 'btn ghost', row, w.name.toUpperCase()); x.onclick = () => go(w); }
        msg.textContent = 'Choose a wallet.';
      }
    };
    const sign = async (w, msg) => {
      msg.className = 'msg muted';
      msg.textContent = `Asking ${w.name} for the signature…`;
      const link = await this.board.linkWallet(w.provider);
      connected(link.address);
      S.address = link.address;
      S.ids = null;
      this.game.audio.play('send');
      // back to the page that asked for it
      const back = this._linkFrom;
      this._linkFrom = null;
      if (back && back !== 'seekers') this.setTab(back);
      else this.render();
    };
    const plain = connected();
    if (b && b.link) {
      el('div', '', top, `LINKED ${short(b.link.address)}`);
      el('div', 'muted', top, 'This browser can post on the board and submit its scans to the leaderboard for this address while it holds a seeker, and its seekers can come aboard.');
      const u = el('button', 'chip', top, 'UNLINK');
      u.onclick = () => { b.unlink(); disconnect(); this.render(); };
    } else if (plain) {
      el('div', '', top, `CONNECTED ${short(plain)}`);
      el('div', 'muted', top, 'Its seekers can come aboard. To post on the board and put your scans on the leaderboard as well, sign once: free, and not a transaction.');
      const row = el('div', 'wrow', top);
      const sb = el('button', 'btn', row, 'SIGN ONCE');
      const dc = el('button', 'chip', row, 'DISCONNECT');
      const msg = msgRow();
      sb.onclick = () => withWallet(row, msg, sign);
      dc.onclick = () => { disconnect(); if (S.address === plain) { S.address = null; S.ids = null; } this.render(); };
    } else {
      el('div', '', top, 'CONNECT A WALLET');
      el('div', 'muted', top, 'CONNECT shares your address only, so your seekers can come aboard. CONNECT AND SIGN also lets you post on the board and put your scans on the leaderboard: one free signature, not a transaction. Nothing is ever sent, approved or moved.');
      const row = el('div', 'wrow', top);
      const c = el('button', 'btn', row, 'CONNECT');
      const l = el('button', 'btn ghost', row, 'CONNECT AND SIGN');
      // MetaMask's site scanner flags every *.github.io host, so say so before it does
      if (/\.github\.io$/.test(location.hostname) || this.game.dev) {
        const note = el('div', 'muted wnote', top, 'MetaMask may warn you here. It does that for every github.io site, not this game in particular. You can check the ');
        const src = el('a', '', note, 'source code');
        src.href = 'https://github.com/TheSeekerGame/community-games/tree/main/lowpass';
        src.target = '_blank';
        src.rel = 'noopener noreferrer';
        note.append(' yourself.');
      }
      const msg = msgRow();
      c.onclick = () => withWallet(row, msg, async (w) => {
        msg.className = 'msg muted';
        msg.textContent = `Asking ${w.name} for your address…`;
        const a = await connect(w.provider);
        S.address = a;
        S.ids = null;
        S.sel = 0;
        this.game.audio.play('send');
        this.render();
      });
      l.onclick = () => withWallet(row, msg, sign);
      const view = el('div', 'wrow', top);
      const input = el('input', 'field one', view);
      input.placeholder = 'or view any address: 0x… (read only)';
      input.addEventListener('focus', () => { this.game.input.uiCapture = true; });
      input.addEventListener('blur', () => { this.game.input.uiCapture = false; });
      input.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') input.blur();
        if (ev.key === 'Enter') look.click();
      });
      const look = el('button', 'chip', view, 'VIEW');
      look.onclick = () => {
        const a = input.value.trim().toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(a)) { msg.className = 'msg neg'; msg.textContent = 'That is not an address.'; return; }
        S.address = a;
        S.ids = null;
        S.sel = 0;
        this.render();
      };
    }
    if (S.net) {
      const n = S.net;
      const r = el('div', 'net muted', top);
      r.textContent = `NETWORK · ${formatInt(n.activated)} of 2,222 activated · ${n.moves} moves in the last day · shares +${formatNum(n.shareRate, 1)} a day per dormant seeker${n.avg ? ` · average charge ${formatInt(n.avg)}` : ''}`;
    }
  }

  async _loadNetwork() {
    const g = this.game, S = this.seekers;
    try {
      const t = await g.chain.totals();
      S.net = { ...t, moves: g.moves.movesToday(), shareRate: 0, at: Date.now() };
      this._renderWalletLine();
      // the last day's moves, read for themselves: how many, and the shares each dormant
      // seeker received from them (what speeds its activation)
      const head = await g.chain.block('latest');
      const ev = await g.chain.events(head.number - Math.round(DAY / g.moves.rate), head.number);
      const moves = ev.filter((e) => e.kind === 'move' && !e.burn);
      S.net.moves = moves.length;
      S.net.shareRate = moves.reduce((sum, m) => sum + (m.pool === 'dormant' && m.recipients ? m.charge / m.recipients : 0), 0);
      this._renderWalletLine();
      if (this.tab === 'seekers') this._renderCharge();
      const all = await g.chain.allCharges();
      let sum = 0, n = 0;
      for (let i = 0; i < all.charges.length; i++) if (all.status[i] !== 3) { sum += Math.min(all.charges[i], 9000); n++; }
      S.net.avg = n ? sum / n : 0;
      this._renderWalletLine();
    } catch { /* offline: no network line */ }
  }

  async _loadSeekers(address) {
    const S = this.seekers, g = this.game;
    S.loading = true;
    S.err = '';
    this._renderSeekerGrid();
    try {
      await art.loadMeta();
      const ids = await g.chain.holdings(address);
      if (S.address !== address) return;
      S.ids = ids;
      S.sel = 0;
      if (ids.length) {
        const st = await g.chain.tokens(ids);
        for (const s of st) S.state.set(s.token, s);
      }
    } catch (e) {
      S.err = 'Robinhood Chain did not answer. Try again in a moment.';
    }
    S.loading = false;
    if (this.open && this.tab === 'seekers') { this._renderSeekerGrid(); }
  }

  _renderSeekerGrid() {
    const S = this.seekers, grid = this._seekGrid;
    if (!grid || !grid.isConnected) return;
    clear(grid);
    if (!S.address) {
      el('div', 'muted empty', grid, 'Link a wallet, or view an address, to see its seekers.');
      clear(this._seekDetail);
      return;
    }
    if (S.loading) {
      loader(grid, `Reading ${short(S.address)} from Robinhood Chain`);
      // where the seekers will be, breathing in turn until they come
      for (let i = 0; i < this._cols * 2; i++) el('div', 'well ghost', grid).style.animationDelay = `${i * 0.12}s`;
      clear(this._seekDetail);
      return;
    }
    if (S.err) { el('div', 'neg empty', grid, S.err); return; }
    if (!S.ids) return;
    if (!S.ids.length) { el('div', 'muted empty', grid, `${short(S.address)} holds no SEEKER NET seekers.`); clear(this._seekDetail); return; }
    S.ids.forEach((id, i) => {
      const w = el('button', 'well' + (i === S.sel ? ' sel' : ''), grid);
      const c = el('canvas', 'pix', w);
      const st = S.state.get(id);
      const look = lookOf(st);
      art.drawCrop(c, id, look).catch(() => {});
      el('span', 'tid', w, '#' + id);
      w.onclick = () => { S.sel = i; this._renderSeekerDetail(); this._markSel(); this.game.audio.play('ui', { h: 24 }); };
    });
    this._renderSeekerDetail();
  }

  _markSel() {
    const S = this.seekers;
    [...this._seekGrid.children].forEach((w, i) => w.classList.toggle('sel', i === S.sel));
  }

  _renderSeekerDetail() {
    const S = this.seekers, d = this._seekDetail;
    if (!d || !S.ids || !S.ids.length) return;
    clear(d);
    const id = S.ids[S.sel];
    const st = S.state.get(id);
    const info = art.info(id);
    const look = lookOf(st);
    const head = el('div', 'shead', d);
    const c = el('canvas', 'pix portrait', head);
    art.drawInto(c, id, look, 2).catch(() => {});
    const t = el('div', '', head);
    el('div', 'name', t, `SEEKER #${id}`);
    el('div', 'muted', t, `${info.traits.Loadout} · Charge Rank ${formatInt(info.chargeRank)} (0 = rarest)`);
    this._statusEl = el('div', '', t);
    this._chargeEl = el('div', 'charge', t);
    this._barEl = el('div', 'cbar', t);
    el('i', '', this._barEl);
    this._aboard(d, id);
    this._rowsEl = el('div', 'rows', d);
    const tr = el('div', 'traits', d);
    for (const k of ['Base', 'Colorway', 'Eyes', 'Floating Object', 'Head', 'Flank', 'Back', 'Background']) {
      const r = el('div', 'row', tr);
      el('span', 'k', r, k.toUpperCase());
      el('span', 'v', r, info.traits[k] || 'None');
    }
    this._renderCharge();
  }

  // bring one of your own seekers aboard (one at a time), or send it back
  _aboard(d, id) {
    const g = this.game, S = this.seekers, c = g.companion;
    const owner = (this.board && this.board.link && this.board.link.address) || connected();
    const box = el('div', 'aboard', d);
    if (owner && S.address === owner) {
      if (c.token === id) {
        el('span', 'pos', box, 'ABOARD · hovering by this computer ');
        const b = el('button', 'chip', box, 'SEND BACK');
        b.onclick = () => { c.recall(); this.render(); };
      } else {
        const b = el('button', 'btn', box, 'BRING ABOARD');
        if (c.token) el('span', 'muted', box, ` replaces SEEKER #${c.token}`);
        b.onclick = async () => {
          b.disabled = true;
          const st = S.state.get(id);
          await c.deploy(id, owner, { look: lookOf(st) });
          this.render();
        };
      }
    } else if (S.address) {
      el('span', 'muted', box, 'Connect the wallet that holds it to bring it aboard.');
    }
  }

  _renderCharge() {
    const S = this.seekers;
    if (!S.ids || !S.ids.length || !this._chargeEl || !this._chargeEl.isConnected) return;
    const id = S.ids[S.sel];
    const st = S.state.get(id);
    const info = art.info(id);
    const net = S.net;
    const rows = this._rowsEl;
    clear(rows);
    const row = (k, v, cls) => { const r = el('div', 'row', rows); el('span', 'k', r, k); el('span', 'v ' + (cls || ''), r, v); };
    if (!st) {
      this._statusEl.textContent = 'Reading…';
      return;
    }
    const now = Date.now();
    const charge = st.status === 0 ? st.charge + (50 * (now - st.at)) / DAY : st.status === 2 ? st.charge + (50 * (now - st.at)) / DAY : st.charge;
    const act = st.status !== 0 || charge >= 9000;
    const stage = Math.min(Math.floor((Math.min(charge, 9000) * 6) / 9000), 5) + 1;
    this._statusEl.textContent = st.status === 2 ? 'ACTIVATED · RECORDED' : act ? 'ACTIVATED · NOT RECORDED YET' : `DORMANT · STAGE ${stage} OF 6`;
    this._statusEl.className = act ? 'pos' : '';
    this._chargeEl.textContent = `CHARGE ${formatNum(charge, 2)}`;
    this._barEl.firstChild.style.width = `${Math.min(100, (charge / 9000) * 100)}%`;
    this._barEl.classList.toggle('full', act);
    row('STARTING CHARGE', formatInt(info.startingCharge));
    if (!act) {
      const shares = st.lastMove ? (net ? net.accD - st.snap : null) : net ? net.accD : null;
      row('DISCHARGE', formatNum(st.discharge, 1), st.discharge > 0 ? '' : 'muted');
      row('UPLINK', formatNum(st.uplink, 1), st.uplink > 0 ? '' : 'muted');
      if (shares !== null && shares >= 0) row(st.lastMove ? 'SHARES SINCE LAST MOVE' : 'SHARES SINCE THE REVEAL', '+' + formatNum(shares, 1));
      row('LAST MOVED', st.lastMove ? `${dateStr(st.lastMove)} · ${ago(st.lastMove)}` : 'not since the reveal');
      const left = 9000 - charge;
      const plain = left / 50;
      row('ACTIVATES AT +50 A DAY', `${dateStr(now + plain * DAY).split(' ').slice(0, 3).join(' ')} · ${formatNum(plain, 1)} days`);
      if (net && net.shareRate > 0) {
        const days = left / (50 + net.shareRate);
        row(`WITH TODAY’S SHARES (+${formatNum(net.shareRate, 1)})`, `${dateStr(now + days * DAY).split(' ').slice(0, 3).join(' ')} · ${formatNum(days, 1)} days`, 'pos');
      }
      row('IF IT MOVES', `keeps 75%: ${formatInt(charge * 0.75)}, gives ${formatInt(charge * 0.25)} to the others`, 'muted');
    } else {
      row('ABOVE 9,000', `+${formatNum(Math.max(0, charge - 9000), 1)}`);
      row('LAST MOVED', st.lastMove ? `${dateStr(st.lastMove)} · ${ago(st.lastMove)}` : '—');
      if (st.status === 1) row('RECORDING', 'anyone can record it on chain; its charge above 9,000 counts from then', 'muted');
    }
  }
}

// Waiting: three marks lit in turn beside the words.
function loader(parent, words) {
  const w = el('div', 'loader', parent);
  const m = el('span', 'lmarks', w);
  for (let i = 0; i < 3; i++) el('i', '', m);
  el('span', 'muted', w, words);
  return w;
}

function lookOf(st) {
  if (!st) return { activated: false, stage: 1 };
  const charge = st.charge + (st.status === 0 ? (50 * (Date.now() - st.at)) / DAY : 0);
  if (st.status === 1 || st.status === 2 || charge > 9000) return { activated: true };
  return { activated: false, stage: Math.min(Math.floor((charge * 6) / 9000), 5) + 1 };
}
