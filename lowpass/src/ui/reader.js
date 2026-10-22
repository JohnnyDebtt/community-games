import { el, clear } from './dom.js';
import { clamp } from '../core/math.js';
import { load, save } from '../core/store.js';
import { BOOKS } from '../ship/books.js';

// Reading, at a ship's shelf: the shelf first (the books' spines; one book goes straight
// to its pages), then a page at a time. Each book keeps its place, in this browser.
// Keys: up and down choose, ENTER opens, left and right turn the page, ESC goes back to
// the shelf, then away. The ship flies on meanwhile.

const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

export class Reader {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.ids = [];
    this.book = null;
    this.sel = 0;
    this.marks = load('books', {});
    this.root = el('div', 'reader', game.uiRoot);
    this.panel = el('div', 'rpanel', this.root);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.hide(); });
  }

  show(ids) {
    this.ids = ids.filter((id) => BOOKS[id]);
    if (!this.ids.length) return;
    this.open = true;
    this.book = this.ids.length === 1 ? this.ids[0] : null;
    this.sel = clamp(this.sel, 0, this.ids.length - 1);
    this.game.input.unlock();
    this.root.classList.add('on');
    this.game.audio.play('open');
    this.render();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('on');
    this.game.audio.play('close');
  }

  _page(d) {
    const b = BOOKS[this.book], p = this.marks[this.book] || 0, n = clamp(p + d, 0, b.pages.length - 1);
    if (n === p) return;
    this.marks[this.book] = n;
    save('books', this.marks);
    this.game.audio.play('ui', { h: d > 0 ? 27 : 21 });
    this.render();
  }

  _openBook(id) {
    this.book = id;
    this.game.audio.play('ui', { h: 30 });
    this.render();
  }

  _back() {
    if (this.book && this.ids.length > 1) { this.book = null; this.game.audio.play('ui', { h: 21 }); this.render(); } else this.hide();
  }

  render() {
    const p = this.panel;
    clear(p);
    const head = el('div', 'rhead', p);
    if (!this.book) {
      el('div', 'rtitle', head, 'THE SHELF');
      const x = el('button', 'rclose', head, 'X');
      x.onclick = () => this.hide();
      const list = el('div', 'rshelf', p);
      this.ids.forEach((id, i) => {
        const b = BOOKS[id], mark = this.marks[id] || 0;
        const row = el('button', 'rbook' + (i === this.sel ? ' sel' : ''), list);
        el('i', 'spine', row).style.background = hexCss(b.color);
        const t = el('span', 'rbt', row);
        el('span', 'rbn', t, b.title);
        el('span', 'muted', t, mark ? `page ${mark + 1} of ${b.pages.length}` : b.by);
        row.onmouseenter = () => { if (this.sel !== i) { this.sel = i; this.render(); } };
        row.onclick = () => this._openBook(id);
      });
      return;
    }
    const b = BOOKS[this.book], n = this.marks[this.book] || 0;
    if (this.ids.length > 1) { const bk = el('button', 'rback', head, '‹ SHELF'); bk.onclick = () => this._back(); }
    el('div', 'rtitle', head, b.title.toUpperCase());
    const x = el('button', 'rclose', head, 'X');
    x.onclick = () => this.hide();
    const page = el('div', 'rpage', p);
    if (n === 0) el('div', 'rby muted', page, b.by);
    el('p', '', page, b.pages[n]);
    const foot = el('div', 'rfoot', p);
    const prev = el('button', 'btn ghost', foot, '‹');
    prev.disabled = n === 0;
    prev.onclick = () => this._page(-1);
    el('span', 'muted', foot, `${n + 1} / ${b.pages.length}`);
    const next = el('button', 'btn ghost', foot, '›');
    next.disabled = n === b.pages.length - 1;
    next.onclick = () => this._page(1);
  }

  keys(input) {
    if (input.hit('Escape', 'KeyE', 'Pad1', 'Pad9')) { this._back(); return; }
    if (!this.book) {
      let d = 0;
      if (input.hit('ArrowDown', 'KeyS', 'Pad13')) d = 1;
      if (input.hit('ArrowUp', 'KeyW', 'Pad12')) d = -1;
      if (d) { this.sel = (this.sel + d + this.ids.length) % this.ids.length; this.game.audio.play('ui', { h: 24 }); this.render(); }
      if (input.hit('Enter', 'Space', 'Pad0', 'ArrowRight', 'KeyD')) this._openBook(this.ids[this.sel]);
      return;
    }
    if (input.hit('ArrowRight', 'KeyD', 'Space', 'Enter', 'Pad0', 'Pad15')) this._page(1);
    if (input.hit('ArrowLeft', 'KeyA', 'Pad14')) this._page(-1);
  }
}
