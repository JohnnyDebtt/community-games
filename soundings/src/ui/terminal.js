import { h, clear } from './dom.js';
import { iconEl } from './pixelart.js';

// A capsule terminal, as in The Seeker's own: text tabs and your data along the top, a
// grid of wells, the selected entry's detail, and the keys. Nothing scrolls, and the only
// words on it are the selected entry's.
//
// tabs:  [{ name, empty, detail, sections: () => [{ label, right, head, cols, cell: [w, h], size, entries }] }]
//        (detail: the detail's height, for a tab whose entries say more)
//        (head: a picture at the start of a row, for a track of research)
// entry: { icon, label, state: ready | poor | owned | away | locked, mark, big, title, lines,
//          more, cost, act: { label, ready, why, run }, alt: { label, run }, field }
//        (more: lines across the whole detail, below; field: an input among the keys)
// A run may return text to say in the detail (a short result), { ok: false, text } for a
// refusal, or false to say nothing.

export class Terminal {
  constructor(panels, w, opts) {
    this.p = panels;
    this.g = panels.g;
    this.w = w;
    this.opts = opts;
    this.tab = opts.start || 0;
    this.sel = 0;
    this.said = null;
    const win = w.win;
    win.classList.add('term', 'acc-' + (opts.accent || 'gold'));
    this.tabsEl = h('div', { class: 'tabs' });
    this.bal = h('span', { class: 'bal' });
    this.body = h('div', { class: 'body' });
    this.detail = h('div', { class: 'tdetail' });
    this.foot = h('div', { class: 'foot' });
    win.append(h('div', { class: 'top' }, this.tabsEl, this.bal), rule(), this.body, rule(), this.detail, rule(), this.foot);
    this.tabBtns = opts.tabs.map((t, i) => h('button', { onclick: () => this.setTab(i) }, t.name));
    if (opts.tabs.length > 1) this.tabsEl.append(...this.tabBtns);
    else this.tabsEl.append(h('span', { class: 'tname' }, opts.tabs[0].name));
    win.addEventListener('navfocus', (e) => {
      const el = e.target;
      if (el._well !== undefined && el._well !== this.sel) this.select(el._well, false);
    });
    this.render();
    this.g.keynav.attach(win, {
      kind: opts.kind, initial: '.well.sel',
      keys: {
        KeyR: () => this.alt(this.sel),
        Tab: () => this.setTab((this.tab + 1) % opts.tabs.length),
      },
    });
  }

  setTab(i) {
    if (i === this.tab) return;
    this.tab = i;
    this.sel = 0;
    this.said = null;
    this.g.audio.ui('click');
    this.render();
  }

  _wells(tab) {
    clear(this.body);
    this.entries = [];
    this.wells = [];
    for (const s of tab.sections()) {
      if (s.label) this.body.append(h('div', { class: 'slabel' }, h('span', {}, s.label), s.right ? h('span', { class: 'muted' }, s.right) : null));
      const grid = h('div', { class: 'wells', style: { gridTemplateColumns: `repeat(${s.cols}, calc(var(--u) * ${s.cell[0]}))`, gridAutoRows: `calc(var(--u) * ${s.cell[1]})` } });
      const n = Math.max(s.size || 0, s.entries.length);
      for (let k = 0; k < n; k++) {
        const e = s.entries[k];
        if (!e) { grid.append(h('div', { class: 'well empty' })); continue; }
        const i = this.entries.length;
        this.entries.push(e);
        const b = h('button', { class: 'well ' + (e.state || 'ready'), 'data-nohover': '', 'aria-label': e.title, onclick: () => this.click(i) },
          e.icon || null, e.label ? h('span', { class: e.icon ? 'lbl' : 'lbl n' }, e.label) : null, e.mark ? h('span', { class: 'mark' }, e.mark) : null);
        b._well = i;
        b._choose = () => this.act(i);
        grid.append(b);
        this.wells.push(b);
      }
      this.body.append(s.head !== undefined ? h('div', { class: 'track' }, h('div', { class: 'head' }, s.head), grid) : grid);
    }
  }

  render() {
    if (!this.w.win.isConnected) return;
    const tab = this.opts.tabs[this.tab];
    this.tabBtns.forEach((b, k) => b.classList.toggle('on', k === this.tab));
    this.detail.style.minHeight = tab.detail ? `calc(var(--u) * ${tab.detail})` : '';
    this.bal.replaceChildren(iconEl('data'), h('span', {}, String(this.g.state.data)));
    const nav = this.g.keynav;
    const inTabs = nav.focus && nav.focus.isConnected && this.tabsEl.contains(nav.focus);
    this._wells(tab);
    this.sel = Math.max(0, Math.min(this.sel, this.entries.length - 1));
    this.show();
    // the keyboard stays where it was: on the tabs, or on the selected well
    if (inTabs) nav.set(this.tabBtns[this.tab], false);
    else if (this.wells[this.sel] && nav.root === this.w.win) nav.set(this.wells[this.sel], false);
  }

  click(i) {
    if (i === this.sel) this.act(i);
    else this.select(i);
  }

  // focus: picked with the mouse (the keyboard moves the selection itself, with its click)
  select(i, focus = true) {
    this.sel = i;
    this.said = null;
    this.show();
    if (focus && this.wells[i]) {
      this.g.keynav.set(this.wells[i], false);
      this.g.audio.ui('click');
    }
  }

  // the selected entry: its name, a line or two, what it costs, and its keys
  show() {
    const e = this.entries[this.sel];
    this.wells.forEach((w, k) => w.classList.toggle('sel', k === this.sel));
    clear(this.detail);
    clear(this.foot);
    if (!e) this.detail.append(h('p', { class: 'muted' }, this.opts.tabs[this.tab].empty || ''));
    else {
      const said = this.said ? h('p', { class: this.said.ok ? 'teal' : 'red' }, this.said.text) : null;
      this.detail.append(h('div', { class: 'dhead' }, e.big || null,
        h('div', { class: 'grow' }, h('h3', {}, e.title), ...(said ? [said] : (e.lines || []).map((l) => h('p', {}, l))))));
      if (e.more) this.detail.append(h('div', { class: 'dmore' }, ...e.more));
      if (e.cost) this.detail.append(h('div', { class: 'dcost' }, e.cost));
    }
    if (e && e.act) this.foot.append(keyHint('F', e.act.label, e.act.ready, () => this.act(this.sel)));
    if (e && e.alt) this.foot.append(keyHint('R', e.alt.label, true, () => this.alt(this.sel)));
    if (e && e.field) this.foot.append(e.field);
    this.foot.append(h('span', { class: 'grow' }), keyHint('X', this.opts.closeText || 'exit', false, () => this.p.close()));
  }

  act(i) {
    const e = this.entries[i];
    if (!e || !e.act) return;
    if (!e.act.ready) {
      this.g.audio.ui('deny');
      if (e.act.why) { this.said = { ok: false, text: e.act.why }; this.show(); }
      return;
    }
    this._did(e.act.run(), i);
  }

  alt(i) {
    const e = this.entries[i];
    if (!e || !e.alt) return;
    this._did(e.alt.run());
  }

  _did(r, i = -1) {
    if (!this.w.win.isConnected) return;
    this.render();
    if (this.wells[i]) this.wells[i].classList.add('pop');
    this.said = typeof r === 'string' ? { ok: true, text: r } : r && r.text ? r : null;
    if (this.said) this.show();
  }
}

function rule() {
  return h('div', { class: 'rule' });
}

function keyHint(key, label, ready, run) {
  return h('button', { class: 'kh' + (ready ? '' : ' off'), onclick: run }, h('span', { class: 'kc' }, key), label);
}
