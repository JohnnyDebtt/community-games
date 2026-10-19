// Every window, the title menu and the catch card work with the keyboard alone, the way
// The Seeker's own panels do:
//
//   W A S D, arrows   move the selection (to the nearest thing in that direction); up
//                     from the top of a window reaches its tabs, where left and right
//                     switch tab
//   F, Enter, Space   choose (start typing, in a text field; Enter or Esc ends it)
//   X, Q, Esc         close
//   R                 a window's second action, where it has one (release, in the tank)
//
// The selection is drawn as a bright frame, and the window scrolls to keep it in view.
// The mouse still works everywhere, and moving it over something selects it, except the
// terminal's wells, which a click selects (so a pointer on its way to a key hint leaves
// the selection alone).

const DIRS = {
  KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};
const CHOOSE = new Set(['KeyF', 'Enter', 'Space', 'NumpadEnter']);
const CLOSE = new Set(['KeyX', 'KeyQ', 'Escape']);
const SELECTOR = 'button:not(:disabled), input, textarea, .cell, [data-nav]';

export class KeyNav {
  constructor(game) {
    this.g = game;
    this.root = null;
    this.opts = {};
    this.focus = null;
    this.editing = null;
    this._last = null;
    addEventListener('keydown', (e) => this.onKey(e), true);
    addEventListener('mouseover', (e) => {
      if (!this.root) return;
      const t = e.target.closest && e.target.closest(SELECTOR);
      if (t && this.root.contains(t) && !this.editing && !t.hasAttribute('data-nohover')) this.set(t, false);
    }, true);
  }

  // Take the keyboard for a part of the interface. opts: { kind, close, initial, keys }
  // (keys: more keys this window answers, by code)
  attach(root, opts = {}) {
    this.root = root;
    this.opts = opts;
    this.editing = null;
    this.focus = null;
    requestAnimationFrame(() => {
      if (this.root !== root) return;
      const first = (opts.initial && root.querySelector(opts.initial)) || root.querySelector('button.primary:not(:disabled)') || this.items()[0];
      if (first) this.set(first);
    });
  }

  detach(root) {
    if (root && this.root !== root) return;
    if (this.focus) this.focus.classList.remove('kfocus');
    this.root = null;
    this.focus = null;
    this.editing = null;
  }

  items() {
    if (!this.root) return [];
    return [...this.root.querySelectorAll(SELECTOR)].filter((el) => {
      if (el.closest('.hidden')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  set(el, scroll = true) {
    if (this.focus === el) return;
    if (this.focus) this.focus.classList.remove('kfocus');
    this.focus = el;
    if (!el) return;
    el.classList.add('kfocus');
    this._last = el.getBoundingClientRect();
    if (scroll) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }));
  }

  // The nearest item in a direction, preferring ones in line with the selection.
  move(dx, dy) {
    const list = this.items();
    if (!list.length) return;
    let cur = this.focus && this.focus.isConnected ? this.focus : null;
    if (!cur) {
      // after a window redraws itself, carry on from where the selection was
      const at = this._last;
      cur = at ? list.reduce((b, el) => (dist(rect(el), at) < dist(rect(b), at) ? el : b), list[0]) : list[0];
      this.set(cur);
      return;
    }
    const a = rect(cur);
    // a tab: left and right switch it at once, as in The Seeker
    if (dx && cur.parentElement && cur.parentElement.classList.contains('tabs')) {
      const tabs = [...cur.parentElement.querySelectorAll('button')];
      const next = tabs[tabs.indexOf(cur) + dx];
      if (next) { this.set(next); next.click(); this.g.audio.ui('click'); }
      return;
    }
    // regions, as in The Seeker: the content, its tabs above it, the header above them.
    // Moving stays in the region; up from the top of the content reaches the tabs, down
    // from the tabs reaches the content.
    const region = (el) => el.closest('.tabs, header, .body, .foot') || this.root;
    const here = region(cur);
    const pick = (cands) => this._nearest(cur, a, cands, dx, dy);
    let best = pick(list.filter((el) => el !== cur && region(el) === here));
    if (!best && dy) {
      const win = cur.closest('.window');
      const order = win ? [win.querySelector('header'), win.querySelector('.tabs:not(.hidden)'), win.querySelector('.body'), win.querySelector('.foot:not(.hidden)')].filter(Boolean) : [];
      const i = order.indexOf(here);
      for (let k = i + dy; k >= 0 && k < order.length && !best; k += dy) {
        const zone = order[k];
        const inZone = list.filter((el) => region(el) === zone);
        if (!inZone.length) continue;
        // the tabs: the one that is open
        best = zone.classList.contains('tabs') ? zone.querySelector('button.on') || inZone[0] : dy > 0 ? inZone[0] : pick(inZone) || inZone[inZone.length - 1];
      }
    }
    if (!best && !cur.closest('.window')) best = pick(list.filter((el) => el !== cur));
    if (best) {
      this.set(best);
      this.g.audio.ui('click');
    }
  }

  _nearest(cur, a, list, dx, dy) {
    let best = null, bs = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = rect(el);
      const ox = b.cx - a.cx, oy = b.cy - a.cy;
      const along = dx ? ox * dx : oy * dy;
      if (along <= 2) continue;
      const across = dx ? Math.abs(oy) : Math.abs(ox);
      // overlapping rows (or columns) first, then the nearest
      const overlap = dx ? Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) : Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const score = along + across * 2.5 - (overlap > 0 ? 4000 : 0);
      if (score < bs) { bs = score; best = el; }
    }
    return best;
  }

  choose() {
    const el = this.focus && this.focus.isConnected ? this.focus : null;
    if (!el) { this.move(0, 1); return; }
    if (el.tagName === 'INPUT' && el.type === 'range') return;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      this.editing = el;
      el.classList.add('editing');
      el.focus();
      return;
    }
    if (el._choose) el._choose();
    else el.click();
  }

  close() {
    if (this.opts.close) this.opts.close();
    else if (this.g.panels.open && this.g.panels.current.kind !== 'intro') this.g.panels.close();
  }

  onKey(e) {
    if (!this.root || !this.root.isConnected) {
      if (this.root) this.detach();
      return;
    }
    // typing in a field (chosen with F, or clicked): only Enter and Esc are ours
    const t = e.target;
    if (!this.editing && t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA')) {
      this.editing = t;
      t.classList.add('editing');
    }
    if (this.editing) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Escape') {
        const el = this.editing;
        this.editing = null;
        el.classList.remove('editing');
        el.blur();
        if (e.code !== 'Escape') el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: false }));
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    let used = true;
    const dir = DIRS[e.code];
    const el = this.focus;
    if (dir && el && el.tagName === 'INPUT' && el.type === 'range' && dir[0]) {
      // a slider: left and right move it
      const step = Number(el.step) || 0.05;
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + dir[0] * step)));
      el.dispatchEvent(new Event('input'));
    } else if (dir) this.move(dir[0], dir[1]);
    else if (CHOOSE.has(e.code)) { if (!e.repeat) this.choose(); }
    else if (CLOSE.has(e.code) && !this.opts.passClose) { if (!e.repeat) this.close(); }
    else if (this.opts.keys && this.opts.keys[e.code]) { if (!e.repeat) this.opts.keys[e.code](); }
    else used = false;
    if (used) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

function rect(el) {
  const r = el.getBoundingClientRect();
  return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, cx: (r.left + r.right) / 2, cy: (r.top + r.bottom) / 2 };
}
function dist(a, b) {
  const bx = b.cx ?? (b.left + b.right) / 2, by = b.cy ?? (b.top + b.bottom) / 2;
  return Math.hypot(a.cx - bx, a.cy - by);
}
