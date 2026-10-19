import { h, clear } from './dom.js';
import { iconEl, ditherShade } from './pixelart.js';
import { rich } from './hud.js';
import { SPECIES, SPECIES_BY_ID, RARITY, formatWeight, weightKg, preferredStyle } from '../game/species.js';
import { RESEARCH_BY_ID, PACK_CAPACITY, available } from '../game/research.js';
import { Terminal } from './terminal.js';
import { songOf, SONG_PRICE, fishPrice } from '../game/camp.js';
import { ZONE } from '../world/layout.js';
import * as Art from '../seekernet/art.js';
import { deviceProfile, LEVELS } from '../seekernet/traits.js';
import { formatInt, clamp } from '../core/math.js';

// Windows: one at a time, over the world (the capsule's beside its glass). Esc closes.

export class Panels {
  constructor(root, game) {
    this.g = game;
    this.root = root;
    this.current = null;
    this.catchEl = null;
  }

  get open() {
    return !!this.current;
  }

  close() {
    if (!this.current) return;
    this.current.el.remove();
    this.g.keynav.detach(this.current.win);
    const after = this.current.onClose;
    this.current = null;
    this.g.audio.ui('close');
    this.g.onWindowClosed();
    if (after) after();
    // the keyboard goes back to what is still showing
    if (!this.current) this._rekey();
  }

  _rekey() {
    if (this.titleEl) this.g.keynav.attach(this.titleEl.querySelector('.menu'), { kind: 'title' });
    else if (this.catchEl) this.g.keynav.attach(this.catchEl, { kind: 'catch', passClose: true, initial: 'button.primary:not(:disabled)' });
  }

  _window(title, opts = {}) {
    if (this.current) {
      const keep = this.current.onClose;
      this.current.onClose = opts.keepClose ? keep : null;
      this.close();
    }
    const body = h('div', { class: 'body' });
    const tabs = h('div', { class: 'tabs' + (opts.tabs ? '' : ' hidden') });
    const foot = h('div', { class: 'foot' + (opts.foot ? '' : ' hidden') });
    const x = h('button', { class: 'x', onclick: () => this.close(), 'aria-label': 'Close' }, h('span', { class: 'kc' }, 'Esc'), opts.closeText || 'close');
    const keys = h('span', { class: 'keys-hint' }, h('span', { class: 'kc' }, 'F'), 'choose');
    const win = h('div', { class: 'window pf-solid', role: 'dialog', 'aria-label': title },
      h('header', {}, opts.icon ? iconEl(opts.icon, opts.iconTint || '#b9a87b') : null, h('h2', {}, title), h('div', { class: 'spacer' }), opts.headerExtra || null, keys, opts.modal && !opts.closable ? null : x),
      tabs, body, foot);
    // a click beside a window leaves it open: only its keys and its close button close it
    const el = h('div', { class: 'overlay' + (opts.side ? ' side' : '') }, win);
    this.root.append(el);
    this.current = { el, win, body, tabs, foot, onClose: opts.onClose, kind: opts.kind };
    this.g.audio.ui('open');
    this.g.onWindowOpened();
    this.g.keynav.attach(win, { kind: opts.kind });
    return this.current;
  }

  _tabs(w, names, render, start = 0) {
    clear(w.tabs);
    const buttons = names.map((n, i) => h('button', { onclick: () => select(i) }, n));
    w.tabs.append(...buttons);
    const select = (i) => {
      buttons.forEach((b, k) => b.classList.toggle('on', k === i));
      clear(w.body);
      render(i, w.body);
      w.tab = i;
      this.g.audio.ui('click');
    };
    select(start);
    return select;
  }

  // ------------------------------------------------------------------ catch card
  showCatch(c) {
    this.hideCatch();
    const g = this.g;
    const sp = c.sp;
    const rar = RARITY[sp.rarity];
    const ribbon = h('div', { class: 'ribbon' },
      c.isNew ? h('span', { class: 'tag new' }, 'new species') : null,
      c.record && !c.isNew ? h('span', { class: 'tag rec' }, iconEl('star'), 'size record') : null,
      c.trophy ? h('span', { class: 'tag rec' }, 'trophy') : null,
      c.variant ? h('span', { class: 'tag var' }, c.variant) : null,
      c.clean ? h('span', { class: 'tag new' }, 'perfect') : null,
      h('span', { class: `tag r-${sp.rarity}` }, rar.label),
      c.fromDevice ? h('span', { class: 'tag var' }, `by #${c.fromDevice}`) : null);
    const icon = h('img', { class: 'pixel', src: g.icons.fish(sp), alt: sp.name });
    const full = g.state.creel.length >= g.packCapacity();
    const keep = h('button', { class: 'primary', onclick: () => g.keepCatch(), disabled: full ? true : null }, h('span', { class: 'kc' }, 'E'), full ? 'pack full' : 'keep');
    const release = h('button', { onclick: () => g.releaseCatch() }, h('span', { class: 'kc' }, 'R'), 'release');
    const frac = clamp((c.cm - sp.size[0]) / Math.max(1, sp.size[1] - sp.size[0]), 0, 1);
    const bestFrac = c.prevBest ? clamp((c.prevBest - sp.size[0]) / Math.max(1, sp.size[1] - sp.size[0]), 0, 1) : null;
    const reward = h('div', { class: 'reward' }, iconEl('dataBig'), this.rewardNum = h('span', { class: 'big sh-k' }, `+${c.data}`), h('span', {}, 'data'),
      ...c.dataNotes.map((n) => h('span', { class: 'x' }, n)));
    const card = h('div', { class: 'card pf-solid', role: 'dialog', 'aria-label': 'Catch' },
      ribbon,
      h('h2', {}, sp.name),
      h('div', { class: 'portrait wf' }, icon,
        c.isNew ? h('div', { class: 'stamp' }, 'NEW') : c.record ? h('div', { class: 'stamp gold' }, 'RECORD') : null),
      h('div', { class: 'size' },
        h('span', { class: 'big' }, `${c.cm.toFixed(1)} cm`),
        h('div', { class: 'meter wf' }, h('i', { class: 'gold', style: { width: `${Math.round(frac * 100)}%` } }),
          bestFrac !== null ? h('b', { class: 'best', style: { left: `${Math.round(bestFrac * 100)}%` } }) : null),
        h('span', { class: 'muted' }, formatWeight(c.kg))),
      reward,
      h('p', { class: 'codex' }, sp.codex),
      c.isNew ? h('div', { class: 'note' }, `It came to: ${preferredStyle(sp).toLowerCase()}.`) : null,
      h('div', { class: 'buttons' }, keep, release),
      full ? h('div', { class: 'note' }, 'Your pack is full: empty it at the capsule.') : null);
    this.root.append(card);
    this.catchEl = card;
    if (!this.current) this._rekey();
    return card;
  }

  hideCatch() {
    if (this.catchEl) {
      this.g.keynav.detach(this.catchEl);
      this.catchEl.remove();
    }
    this.catchEl = null;
  }

  // ------------------------------------------------------------------ the Codex
  showCodex(selectId) {
    const g = this.g;
    const w = this._window('Codex', { kind: 'codex', tabs: false, foot: true, icon: 'book' });
    const known = SPECIES.filter((s) => g.state.codex[s.id] || g.state.observed[s.id]).length;
    w.foot.append(h('span', {}, `${known} of ${SPECIES.length} recorded`), iconEl('data'), h('span', { class: 'gold' }, `${g.state.data} data to spend`), h('span', {}, `${g.state.dataTotal} gathered`));
    const grid = h('div', { class: 'codexgrid' });
    const detail = h('div', { class: 'detail wf' });
    const show = (sp) => {
      clear(detail);
      const rec = g.state.codex[sp.id];
      const obs = g.state.observed[sp.id];
      for (const c of grid.children) c.classList.toggle('sel', c.dataset.id === sp.id);
      if (!rec && !obs) {
        detail.append(h('h3', {}, 'Unrecorded'), h('img', { class: 'pixel', src: g.icons.fish(sp, true), alt: '' }), h('p', {}, hintFor(sp)));
        return;
      }
      const zones = Object.entries(sp.zones).filter(([, v]) => v >= 0.3).map(([k]) => ZONE[k].name).join(', ');
      const facts = h('dl', { class: 'facts' },
        h('dt', {}, 'rarity'), h('dd', { class: 'r-' + sp.rarity }, RARITY[sp.rarity].label),
        h('dt', {}, 'waters'), h('dd', {}, zones),
        h('dt', {}, 'depth'), h('dd', {}, `${sp.depth[0]}–${sp.depth[1]} m`),
        ...(sp.observe ? [] : [
          h('dt', {}, 'lure'), h('dd', {}, preferredStyle(sp)),
          h('dt', {}, 'light'), h('dd', {}, sp.light < -0.3 ? 'shy of light' : sp.light > 0.3 ? 'drawn to light' : 'indifferent'),
          h('dt', {}, 'caught'), h('dd', {}, `${rec.caught} (kept ${rec.kept}, released ${rec.released})`),
          h('dt', {}, 'largest'), h('dd', {}, `${rec.best.toFixed(1)} cm · ${formatWeight(weightKg(sp, rec.best))}`),
          h('dt', {}, 'variants'), h('dd', {}, rec.variants.length ? rec.variants.join(', ') : 'none yet'),
          h('dt', {}, 'here now'), h('dd', {}, g.populationText(sp)),
        ]),
        ...(sp.observe ? [h('dt', {}, 'recorded'), h('dd', {}, `day ${obs}`)] : []));
      detail.append(h('h3', {}, sp.name), h('img', { class: 'pixel', src: g.icons.fish(sp), alt: sp.name }), facts, h('p', {}, sp.codex));
      if (sp.sense && rec) {
        const on = g.state.sense === sp.sense;
        detail.append(h('button', { class: on ? 'primary' : '', onclick: () => { g.setSense(on ? null : sp.sense); show(sp); } },
          on ? `attuned: ${senseName(sp.sense)} (V)` : `attune: ${senseName(sp.sense)}`),
        h('p', { class: 'muted' }, senseText(sp.sense)));
      }
    };
    for (const sp of SPECIES) {
      const rec = g.state.codex[sp.id] || g.state.observed[sp.id];
      const r = g.state.codex[sp.id];
      const pips = h('div', { class: 'pips' }, h('i', { class: rec ? 'on' : '' }), h('i', { class: r && r.trophy ? 'on' : '' }), h('i', { class: r && r.variants.length ? 'on' : '' }));
      const cell = h('div', { class: 'cell ' + (rec ? 'wf' : 'wf-dim unknown'), 'data-id': sp.id, onclick: () => { g.audio.ui('click'); show(sp); } },
        h('img', { class: 'pixel', src: g.icons.fish(sp, !rec, true), alt: '' }),
        h('span', {}, rec ? sp.name : '?'), pips);
      grid.append(cell);
    }
    w.body.append(h('div', { class: 'codexlayout' }, grid, detail));
    show(SPECIES_BY_ID[selectId] || SPECIES.find((s) => g.state.codex[s.id]) || SPECIES[0]);
  }

  // ------------------------------------------------------------------ the capsule
  // ------------------------------------------------------------------ the capsule's terminal
  // The window for a terminal: the frame, and nothing else (the terminal draws the rest).
  _termWindow(opts) {
    if (this.current) {
      this.current.onClose = null;
      this.close();
    }
    const win = h('div', { class: 'window ' + (opts.accent === 'glow' ? 'pf-glow-dim' : 'pf-gold-dim'), role: 'dialog', 'aria-label': opts.title });
    const el = h('div', { class: 'overlay' + (opts.side ? ' side' : '') }, win);
    this.root.append(el);
    this.current = { el, win, onClose: opts.onClose, kind: opts.kind };
    this.g.audio.ui('open');
    this.g.onWindowOpened();
    return this.current;
  }

  showCapsule(tab = 0, onClose = null) {
    const w = this._termWindow({ kind: 'capsule', title: 'Capsule', side: true, onClose });
    w.term = new Terminal(this, w, {
      kind: 'capsule', start: tab, accent: 'gold', closeText: 'step out',
      tabs: [
        { name: 'Research', sections: () => this._researchWells() },
        { name: 'Tank', sections: () => this._tankWells(), empty: 'Fish you keep ride in your pack.' },
        { name: 'Seekers', detail: 88, sections: () => this._seekerWells() },
        { name: 'Rest', sections: () => this._restWells() },
      ],
    });
  }

  // At the tank itself, beside the capsule: the pack and the tank, nothing else.
  showTank() {
    const w = this._termWindow({ kind: 'tank', title: 'Specimen tank', side: true, accent: 'glow' });
    w.term = new Terminal(this, w, {
      kind: 'tank', accent: 'glow',
      tabs: [{ name: 'Specimen tank', sections: () => this._tankWells(), empty: 'Fish you keep ride in your pack.' }],
    });
  }

  // One track per row, as numbers where they can be: depth, seekers, pack, then the gear.
  _researchWells() {
    const rows = [['spool', ['line1', 'line2', 'line3', 'line4']], ['mount', ['mount1', 'mount2', 'mount3']], ['bag', ['pack2', 'pack3']], [null, ['auger', 'lantern', 'glowlure']]];
    return rows.map(([head, ids]) => ({ head: head ? iconEl(head) : null, cols: 4, cell: [36, 20], size: 4, entries: ids.map((id) => this._researchEntry(RESEARCH_BY_ID[id])) }));
  }

  _researchEntry(r) {
    const g = this.g;
    const st = g.state;
    const done = !!st.research[r.id];
    const can = available(st, r);
    const afford = st.data >= r.cost;
    const state = done ? 'owned' : !can ? 'locked' : afford ? 'ready' : 'poor';
    const prev = r.requires ? RESEARCH_BY_ID[r.requires] : null;
    const label = r.line ? String(r.line) : r.mounts ? String(r.mounts) : r.pack ? String(PACK_CAPACITY[r.pack]) : null;
    const icon = label ? null : iconEl(r.icon, state === 'locked' ? '#454a4f' : null);
    const big = r.pack ? h('img', { class: 'pixel', src: `assets/items/backpack${r.pack}.png`, alt: '', style: { width: 'calc(var(--u) * 24)', height: 'calc(var(--u) * 24)' } }) : null;
    return {
      icon, label, big, state, title: r.name,
      lines: [r.change(st), r.text],
      cost: done ? h('span', { class: 'teal' }, 'researched') : h('span', { class: 'cost ' + (afford ? '' : 'red') }, iconEl('data'), String(r.cost)),
      act: done ? null : {
        label: 'research', ready: can && afford,
        why: !can ? `first: ${prev.name}` : `${r.cost - st.data} more data`,
        run: () => g.research(r.id) || false,
      },
    };
  }

  _tankWells() {
    const g = this.g;
    const st = g.state;
    const cap = g.packCapacity();
    const fish = (f, i, where) => {
      const sp = SPECIES_BY_ID[f.sp];
      const full = where === 'creel' ? st.tank.length >= 12 : st.creel.length >= cap;
      return {
        icon: h('img', { class: 'pixel', src: g.icons.fish(sp, false, 0.375), alt: '', style: { width: 'calc(var(--u) * 36)', height: 'calc(var(--u) * 18)' } }),
        big: h('img', { class: 'pixel', src: g.icons.fish(sp, false, true), alt: '', style: { width: 'calc(var(--u) * 48)', height: 'calc(var(--u) * 24)' } }),
        state: 'ready', title: sp.name,
        lines: [`${f.cm.toFixed(1)} cm · ${formatWeight(f.kg)}${f.variant ? ' · ' + f.variant : ''}`],
        act: where === 'creel'
          ? { label: 'to the tank', ready: !full, why: 'the tank is full', run: () => { g.moveToTank(i); return false; } }
          : { label: 'to the pack', ready: !full, why: 'the pack is full', run: () => { g.moveToPack(i); return false; } },
        alt: { label: 'release', run: () => { g.releaseFrom(where, i); return false; } },
      };
    };
    return [
      { label: 'pack', right: `${st.creel.length} / ${cap}`, cols: 5, cell: [36, 20], size: cap, entries: st.creel.map((f, i) => fish(f, i, 'creel')) },
      { label: 'tank', right: `${st.tank.length} / 12`, cols: 5, cell: [36, 20], size: 12, entries: st.tank.map((f, i) => fish(f, i, 'tank')) },
    ];
  }

  _seekerWells() {
    const g = this.g;
    const entries = g.state.roster.map((id) => this._seekerEntry(id));
    if (g.state.roster.length < 12) entries.push(this._tuneEntry());
    return [{ cols: 6, cell: [28, 28], size: 12, entries }];
  }

  // Tune in: by number (your own seeker, say), or the next awake signal on the network.
  _tuneEntry(then = null) {
    const g = this.g;
    const found = g.sweep();
    const field = h('input', { type: 'number', min: 1, max: 2222, placeholder: 'any #', 'aria-label': 'Seeker number' });
    const run = () => {
      const raw = field.value.trim();
      const id = raw ? Math.floor(Number(raw)) : found[0];
      if (!id || id < 1 || id > 2222) return { ok: false, text: raw ? 'a number from 1 to 2222' : 'no awake signal yet: the network is charging' };
      if (g.state.roster.includes(id)) return { ok: false, text: `#${id} is tuned in already` };
      if (!g.tune(id)) return `#${id} is still charging: you are watching it`;
      if (then) then(id);
      return `#${id} tuned in`;
    };
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const t = this.current && this.current.term; const r = run(); if (t) t._did(r); }
      e.stopPropagation();
    });
    return {
      icon: iconEl('tune'), state: 'ready', title: 'Tune in',
      lines: ['An awake seeker on SEEKER NET, to fish beside you.', 'Type its number for one of your own.'],
      act: { label: 'tune in', ready: true, run }, field,
    };
  }

  _seekerEntry(id, pick = null) {
    const g = this.g;
    const s = g.net.state(id);
    const prof = deviceProfile(Art.info(id).traits, s);
    const companion = g.state.companion === id;
    const hole = g.deviceHoleOf(id);
    // its head in the well, at one pixel per pixel; the whole seeker beside its detail
    const face = h('canvas', { class: 'pixel', style: { width: 'calc(var(--u) * 26)', height: 'calc(var(--u) * 26)' } });
    Art.drawCrop(face, id, { activated: true }, 14, 12, 26, 26).catch(() => {});
    const whole = this._wholeSeeker(id, { activated: true });
    return {
      icon: face, big: whole, state: companion ? 'owned' : hole !== null ? 'away' : 'ready', title: `#${id}${prof.level ? ' · level ' + prof.level : ''}`,
      lines: [h('span', { class: 'odl' }, iconEl('od_' + prof.overdrive), h('span', { class: 'glow' }, prof.od.name)), prof.od.short],
      more: prof.perks.map((p) => h('div', {}, iconEl(p.icon || 'dot', '#abe3d9'), h('span', {}, p.text))),
      cost: pick ? null : companion ? h('span', { class: 'teal' }, 'your companion') : hole !== null ? h('span', { class: 'muted' }, 'keeping a hole') : null,
      act: pick ? { label: 'choose', ready: true, run: pick }
        : companion ? null : { label: 'companion', ready: true, run: () => { g.setCompanion(id); return `#${id} goes with you`; } },
      alt: pick ? null : hole !== null ? { label: 'call back', run: () => { g.removeDevice(hole); return false; } }
        : companion ? null : { label: 'let go', run: () => { g.untune(id); return false; } },
    };
  }

  _restWells() {
    const g = this.g;
    const rest = [['dawn', 'Dawn', 'The light comes back over the rim.', 'dawn'], ['day', 'Midday', 'Pale and bright. Shallow fish feed.', 'noon'],
      ['dusk', 'Dusk', 'The skimmers and the coils come up.', 'dusk'], ['night', 'Night', 'Lanterns, aurora, and the deep things.', 'night']];
    return [{
      cols: 6, cell: [26, 22], size: 6,
      entries: [
        ...rest.map(([phase, name, text, ic]) => ({
          icon: iconEl(ic), state: 'ready', title: `rest until ${name}`, lines: [text],
          act: { label: 'rest', ready: true, run: () => { this.close(); g.restUntil(phase); return false; } },
        })),
        { icon: iconEl('cog'), state: 'ready', title: 'Settings', lines: ['Sound, camera, and controls.'], act: { label: 'open', ready: true, run: () => { this.showSettings(); return false; } } },
        { icon: iconEl('disk'), state: 'ready', title: 'Save', lines: ['The game saves itself as you play.'], act: { label: 'save now', ready: true, run: () => { g.save(true); return 'saved'; } } },
      ],
    }];
  }

  // ------------------------------------------------------------------ the Vagrant
  // Their songs (a creature you have not recorded: where it lives, when, how deep, on
  // what lure) and a trade for the fish in your pack.
  showVagrant() {
    const w = this._termWindow({ kind: 'vagrant', title: 'The Vagrant', side: true, accent: 'glow' });
    w.term = new Terminal(this, w, {
      kind: 'vagrant', accent: 'glow', closeText: 'goodbye',
      tabs: [
        { name: 'Songs', detail: 64, sections: () => this._songWells(), empty: 'No songs today that your line can reach. Go deeper, then come back.' },
        { name: 'Trade', sections: () => this._tradeWells(), empty: 'Your pack is empty. Bring me something, Seeker.' },
      ],
    });
  }

  _songWells() {
    const g = this.g, camp = g.camp;
    const entries = camp.songs().map((sp) => {
      const heard = camp.st.heard.includes(sp.id);
      const known = !!g.state.codex[sp.id];
      const song = songOf(sp);
      const price = SONG_PRICE[sp.rarity];
      return {
        icon: h('img', { class: 'pixel', src: g.icons.fish(sp, known ? false : [0xc4, 0xce, 0xd4], 0.375), alt: '', style: { width: 'calc(var(--u) * 36)', height: 'calc(var(--u) * 18)' } }),
        state: known ? 'owned' : heard ? 'away' : g.state.data >= price ? 'ready' : 'poor',
        title: song.title,
        lines: heard || known ? [song.verse] : ['"I know where this one sings. A little data, and it\'s yours."'],
        cost: known ? h('span', { class: 'teal' }, 'recorded') : heard ? h('span', { class: 'glow' }, song.hint)
          : h('span', { class: 'cost ' + (g.state.data >= price ? '' : 'red') }, iconEl('data'), String(price)),
        act: heard || known ? null : {
          label: 'hear it', ready: g.state.data >= price, why: `${price - g.state.data} more data`,
          run: () => (camp.hear(sp) ? 'Go on. It will be where the song says.' : false),
        },
      };
    });
    return [{ label: 'today\'s songs', cols: 5, cell: [36, 20], size: 3, entries }];
  }

  _tradeWells() {
    const g = this.g, camp = g.camp;
    const cap = g.packCapacity();
    const entries = g.state.creel.map((f, i) => {
      const sp = SPECIES_BY_ID[f.sp];
      const price = fishPrice(f);
      return {
        icon: h('img', { class: 'pixel', src: g.icons.fish(sp, false, 0.375), alt: '', style: { width: 'calc(var(--u) * 36)', height: 'calc(var(--u) * 18)' } }),
        big: h('img', { class: 'pixel', src: g.icons.fish(sp, false, true), alt: '', style: { width: 'calc(var(--u) * 48)', height: 'calc(var(--u) * 24)' } }),
        state: 'ready', title: sp.name,
        lines: [`${f.cm.toFixed(1)} cm · ${formatWeight(f.kg)}`, '"That one will keep us warm tonight."'],
        cost: h('span', { class: 'cost' }, iconEl('data'), String(price)),
        act: { label: 'trade', ready: true, run: () => `For the road: +${camp.sell(i)} data` },
      };
    });
    return [{ label: 'your pack', right: `${g.state.creel.length} / ${cap}`, cols: 5, cell: [36, 20], size: cap, entries }];
  }

  // ------------------------------------------------------------------ SEEKER NET relay
  // Your seekers, and the ones still charging: the same terminal as the capsule's.
  showRelay(tab = 0) {
    const w = this._termWindow({ kind: 'relay', title: 'SEEKER NET', side: true, accent: 'glow' });
    w.term = new Terminal(this, w, {
      kind: 'relay', start: tab, accent: 'glow',
      tabs: [
        { name: 'Seekers', detail: 88, sections: () => this._seekerWells() },
        { name: 'Charging', detail: 64, sections: () => this._chargingWells(), empty: 'Nothing is charging near waking.' },
      ],
    });
  }

  _rerenderRelay() {
    const c = this.current;
    if (c && c.term) c.term.render();
  }

  // Dormant seekers you watch (their sparks seek you out), and the ones closest to waking.
  _chargingWells() {
    const g = this.g;
    const n = g.net;
    const watch = g.state.watch || [];
    const near = n.nearlyThere(6).filter((id) => !watch.includes(id));
    const live = n.online && n.totals && n.totals.live;
    const entry = (id, watched) => {
      const s = n.state(id);
      const look = { activated: false, stage: s.stage };
      const face = h('canvas', { class: 'pixel', style: { width: 'calc(var(--u) * 26)', height: 'calc(var(--u) * 26)' } });
      Art.drawCrop(face, id, look, 14, 12, 26, 26).catch(() => {});
      const days = n.daysToActivate(id);
      const pct = Math.min(100, (s.charge / 9000) * 100);
      return {
        icon: face, big: this._wholeSeeker(id, look), state: watched ? 'owned' : 'ready', title: `#${id}`,
        lines: [`stage ${s.stage} of 6 · ${formatInt(s.charge)} / 9,000`, `wakes ${days < 1 ? 'within a day' : `in about ${Math.ceil(days)} days`}`],
        cost: h('div', { class: 'meter wf small' }, h('i', { class: 'glow', style: { width: `${Math.round(pct)}%` } })),
        act: watched
          ? { label: 'stop watching', ready: true, run: () => { g.unwatch(id); return false; } }
          : { label: 'watch', ready: true, run: () => { g.watch(id); return 'its sparks will seek you out'; } },
      };
    };
    return [
      { label: 'watching', right: `${formatInt(n.activatedCount())} awake · ${n.movesToday()} moves today${live ? '' : ' · ' + (n.online === false ? 'offline' : 'reading')}`, cols: 6, cell: [28, 28], size: 6, entries: watch.map((id) => entry(id, true)) },
      { label: 'closest to waking', cols: 6, cell: [28, 28], size: 6, entries: near.map((id) => entry(id, false)) },
    ];
  }

  _wholeSeeker(id, look) {
    const whole = h('canvas', { class: 'pixel' });
    Art.bounds(id).then((b) => {
      whole.style.width = `calc(var(--u) * ${b.w})`;
      whole.style.height = `calc(var(--u) * ${b.h})`;
      return Art.drawCrop(whole, id, look, b.x0, b.y0, b.w, b.h);
    }).catch(() => {});
    return whole;
  }

  // An activated seeker: its Overdrive, its perks, its level.
  _seekerCard(id, opts = {}) {
    const g = this.g;
    const info = Art.info(id);
    const s = g.net.state(id);
    if (!s.activated) return this._chargingCard(id, (g.state.watch || []).includes(id));
    const prof = deviceProfile(info.traits, s);
    const cv = h('canvas', { class: 'pixel art' });
    Art.drawInto(cv, id, { activated: true }, 1).catch(() => {});
    const companion = g.state.companion === id;
    const atHole = g.deviceHoleOf(id);
    const t = info.traits;
    const traits = [t.Base, t.Colorway, t.Eyes, t['Floating Object'], t.Head, t.Flank, t.Back, t.Loadout].filter(Boolean).join(' · ');
    const actions = h('div', { class: 'actions' });
    const inRoster = g.state.roster.includes(id);
    if (opts.sweep && !inRoster) actions.append(h('button', { class: 'primary', onclick: () => { g.tune(id); this._rerenderRelay(); } }, 'tune in'));
    if (inRoster && !companion && !opts.pick) actions.append(h('button', { class: 'primary', onclick: () => { g.setCompanion(id); this._rerenderRelay(); } }, 'make companion'));
    if (inRoster && companion) actions.append(h('button', { onclick: () => { g.setCompanion(0); this._rerenderRelay(); } }, 'leave behind'));
    if (inRoster && !companion && atHole === null && !opts.pick) actions.append(h('button', { onclick: () => { g.untune(id); this._rerenderRelay(); } }, 'release signal'));
    if (atHole !== null) actions.append(h('button', { onclick: () => { g.removeDevice(atHole); this._rerenderRelay(); } }, 'call back'));
    const where = companion ? 'your companion' : atHole !== null ? 'fishing a hole' : inRoster ? 'tuned' : 'signal';
    const next = prof.next;
    const lvlFrac = next ? clamp((prof.overcharge - LEVELS[prof.level]) / (next - LEVELS[prof.level]), 0, 1) : 1;
    const cells = g.surgeCells(id);
    return h('div', { class: 'seeker ' + (companion ? 'wf-hi companion' : 'wf') },
      h('div', { class: 'top' }, cv,
        h('div', { class: 'grow' },
          h('h3', {}, `#${id}`, h('span', { class: 'lv' }, iconEl('star'), `level ${prof.level}`), cells ? h('span', { class: 'glow' }, iconEl('bolt', '#d6edf5'), `${cells} surge`) : null),
          h('dl', { class: 'state' },
            h('dt', {}, 'charge'), h('dd', {}, `${formatInt(s.charge)} (+${formatInt(s.overcharge)})`),
            h('dt', {}, 'now'), h('dd', {}, where),
            h('dt', {}, 'seen'), h('dd', {}, s.source)),
          h('div', { class: 'meter wf', style: { marginTop: 'calc(var(--u) * 2)', height: 'calc(var(--u) * 4)' } }, h('i', { class: 'gold', style: { width: `${Math.round(lvlFrac * 100)}%` } })),
          h('div', { class: 'muted' }, next ? `${formatInt(next - prof.overcharge)} overcharge to level ${prof.level + 1}` : 'highest level'))),
      h('div', { class: 'odbox wf-glow' }, h('div', { class: 'n' }, iconEl('bolt', '#91cbde'), `overdrive · ${prof.od.name}`), h('div', {}, prof.od.text)),
      h('ul', { class: 'perks' }, ...prof.perks.map((p) => h('li', {}, iconEl(p.icon || 'dot', '#abe3d9'), h('span', {}, h('span', { class: 'k' }, p.trait + ': '), p.text)))),
      h('div', { class: 'traits' }, traits),
      actions);
  }

  // A dormant seeker: its real uncharged picture, its charge, and when it should wake.
  _chargingCard(id, watched) {
    const g = this.g;
    const s = g.net.state(id);
    const cv = h('canvas', { class: 'pixel', style: { width: 'calc(var(--u) * 54)', height: 'calc(var(--u) * 54)' } });
    Art.drawInto(cv, id, { activated: false, stage: s.stage }, 1).catch(() => {});
    const days = g.net.daysToActivate(id);
    const pct = Math.min(100, (s.charge / 9000) * 100);
    const eta = days < 1 ? 'within a day' : `about ${Math.ceil(days)} days`;
    return h('div', { class: 'seeker wf' },
      h('div', { class: 'top' }, cv,
        h('div', { class: 'grow' },
          h('h3', {}, `#${id}`, h('span', { class: 'muted' }, `dormant · stage ${s.stage} of 6`)),
          h('div', { class: 'meter wf', style: { margin: 'calc(var(--u) * 3) 0 calc(var(--u) * 2)' } }, h('i', { class: 'glow', style: { width: `${pct}%` } })),
          h('div', {}, `${formatInt(s.charge)} / 9,000`),
          h('div', { class: 'muted' }, `wakes in ${eta}, sooner as seekers move`))),
      h('div', { class: 'actions' },
        watched
          ? h('button', { onclick: () => { g.unwatch(id); this._rerenderRelay(); } }, 'stop watching')
          : h('button', { onclick: () => { g.watch(id); this._rerenderRelay(); } }, 'watch')));
  }

  // ------------------------------------------------------------------ first launch
  showIntro(ids) {
    const g = this.g;
    const w = this._termWindow({ kind: 'intro', title: 'Choose a seeker', onClose: () => g.introClosed(), accent: 'glow' });
    w.term = new Terminal(this, w, {
      kind: 'intro', accent: 'glow', closeText: 'visor only',
      tabs: [{
        name: 'Choose your seeker', detail: 88,
        sections: () => [{
          cols: ids.length + 1, cell: [28, 28], size: 3,
          entries: [
            ...ids.map((id) => this._seekerEntry(id, () => { g.tune(id); g.setCompanion(id); this.close(); return false; })),
            this._tuneEntry((id) => { g.setCompanion(id); this.close(); }),
          ],
        }],
      }],
    });
  }

  // ------------------------------------------------------------------ meeting a seeker that woke on the ice
  showWoken(beacon) {
    const g = this.g;
    const w = this._window('A seeker woke', { kind: 'woken', icon: 'beacon', iconTint: '#d6edf5' });
    w.body.append(h('p', { class: 'note' }, `SEEKER NET #${beacon.token} activated on-chain ${ago(beacon.at)}: it charged past 9,000 and woke here on the ice. Those who find a seeker as it wakes are given a surge: one Overdrive at double strength.`));
    const card = this._seekerCard(beacon.token, { pick: true });
    const acts = card.querySelector('.actions');
    acts.append(h('button', { class: 'primary', onclick: () => { this.close(); g.meetWoken(beacon, true); } }, g.state.companion ? 'tune in' : 'tune in as companion'));
    if (g.state.companion) acts.append(h('button', { onclick: () => { this.close(); g.meetWoken(beacon, 'companion'); } }, 'make it your companion'));
    w.body.append(h('div', { class: 'seekers' }, card));
  }

  // ------------------------------------------------------------------ settings
  showSettings() {
    const g = this.g;
    const s = g.state.settings;
    const w = this._window('Settings', { kind: 'settings', icon: 'gear', iconTint: '#8a919e' });
    const range = (key, label) => {
      const el = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[key] });
      el.addEventListener('input', () => g.setSetting(key, Number(el.value)));
      return [h('label', {}, label), el];
    };
    const seg = (key, label, opts) => {
      const wrap = h('div', { class: 'seg' });
      const draw = () => {
        clear(wrap);
        for (const [v, name] of opts) wrap.append(h('button', { class: s[key] === v ? 'on' : '', onclick: () => { g.setSetting(key, v); draw(); } }, name));
      };
      draw();
      return [h('label', {}, label), wrap];
    };
    w.body.append(h('div', { class: 'settings' },
      ...range('master', 'Volume'), ...range('music', 'Music'), ...range('sfx', 'Sounds'), ...range('ambience', 'Wind and ice'),
      ...seg('pixel', 'Pixel size', [['auto', 'auto'], ['fine', 'fine'], ['standard', 'standard'], ['chunky', 'chunky']]),
      ...seg('chain', 'Read SEEKER NET live', [[true, 'on'], [false, 'off']]),
      ...seg('hints', 'Guidance', [[true, 'on'], [false, 'off']]),
      ...seg('shake', 'Screen shake', [[true, 'on'], [false, 'off']]),
      ...seg('invertY', 'Camera vertical', [[false, 'normal'], [true, 'inverted']])));
    const io = h('textarea', { rows: 3, style: { width: '100%', marginTop: 'calc(var(--u) * 4)' }, placeholder: 'paste a save here to import' });
    io.addEventListener('keydown', (e) => e.stopPropagation());
    w.body.append(h('div', { class: 'cap' }, 'save'),
      h('p', { class: 'note' }, 'Your expedition is saved in this browser. Export it to keep a copy or move it to another browser.'),
      h('div', { class: 'row' },
        h('button', { onclick: () => { io.value = g.exportSave(); io.select(); } }, 'export'),
        h('button', { onclick: () => { try { g.importSave(io.value); } catch (e) { g.hud.toast('That is not a Soundings save.', 'warn'); } } }, 'import'),
        h('span', { class: 'grow' }),
        h('button', { onclick: () => { if (confirm('Start a new expedition? This browser\'s save will be replaced.')) g.newGame(); } }, 'new expedition')),
      io);
  }

  // ------------------------------------------------------------------ title
  showTitle(hasSave) {
    const g = this.g;
    const el = h('div', { class: 'title' },
      h('h1', {}, 'SOUNDINGS'),
      h('p', { class: 'tag sh-k' }, 'A quiet fishing game on the frozen sea of The Seeker\'s planet. Drill the ice, sound the depths, and record what lives below, with a SEEKER NET seeker at your side.'),
      h('div', { class: 'menu' },
        hasSave ? h('button', { class: 'primary', onclick: () => g.start(false) }, 'continue') : null,
        h('button', { class: hasSave ? '' : 'primary', onclick: () => { if (!hasSave || confirm('Start a new expedition? Your saved one in this browser will be replaced.')) g.start(true); } }, hasSave ? 'new expedition' : 'begin'),
        h('button', { onclick: () => this.showSettings() }, 'settings'),
        h('button', { onclick: () => this.showAbout() }, 'about')),
      h('p', { class: 'small sh-k' }, 'Keyboard and mouse, a gamepad, or touch. Sound on.'));
    // the shade behind the words, dithered at the world's resolution
    const shade = h('canvas', { class: 'shade' });
    el.prepend(shade);
    const px = g.px;
    ditherShade(shade, px.width, px.height, (x, y) => Math.max(0, 0.95 - x * 1.5) + Math.max(0, (y - 0.5) * 1.1));
    this.root.append(el);
    this.titleEl = el;
    if (this.g.keynav) this.g.keynav.attach(el.querySelector('.menu'), { kind: 'title' });
  }

  hideTitle() {
    if (this.titleEl) {
      this.g.keynav.detach(this.titleEl.querySelector('.menu'));
      this.titleEl.remove();
    }
    this.titleEl = null;
  }

  showAbout() {
    const w = this._window('About', { kind: 'about' });
    w.body.append(
      h('p', { style: { marginTop: 0 } }, 'Soundings is set in the universe of The Seeker, an open-source sci-fi brand. It borrows its frozen planet, Theorem\'s Codex and its tuning (every pitch here is a harmonic of 48 Hz; the music runs at 90 BPM), and finds its own quiet answers. It is not an official release of The Seeker.'),
      h('p', { class: 'note' }, 'Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/): the Seeker\'s backpacks, its pixel font (as a web font) and the Tektur typeface (SIL OFL 1.1). Original project: https://github.com/TheSeekerGame/the-seeker . Changes were made.'),
      h('p', { class: 'note' }, 'SEEKER NET art and data from TheSeekerGame/collections (MIT OR Apache-2.0), drawn pixel for pixel from the collection\'s own layers. Live state and moves are read from SEEKER NET on Robinhood Chain through public RPCs; reading only, never writing. The collectibles are art and membership, not investments.'),
      h('p', { class: 'note' }, 'Built with three.js (MIT). Everything else, the sea, its creatures, the sound, is procedural.'),
      h('p', { class: 'note' }, rich('Controls: [W][A][S][D] walk, [Shift] run, drag to look, wheel to zoom. [E] interact (hold to drill). Fishing: hold [Space] to cast, tap to jig, [Space] on the "!" to hook, hold [Space] to reel. [Q] Overdrive. [Tab] Codex, [N] SEEKER NET relay, [V] attuned sense, [L] lantern, [B] live bait.')));
  }
}

function stat(v, l) {
  return h('div', { class: 'stat wf' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
}

export function ago(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

function senseName(id) {
  return { glass: 'glass sight', lantern: 'lantern eye', choir: 'choir hearing' }[id];
}
function senseText(id) {
  return {
    glass: 'Life beneath the ice shows through it, near you. The ice remembers what it held.',
    lantern: 'The dark is less dark. Night colors lift.',
    choir: 'You hear fish come to your lure before the sonar shows them, each in its own tone.',
  }[id];
}

function hintFor(sp) {
  const z = Object.entries(sp.zones).sort((a, b) => b[1] - a[1])[0][0];
  const where = ZONE[z].name;
  if (sp.observe) return `Something in ${where}. It is said to come only to stillness, deep, in the night.`;
  const when = Object.entries(sp.time).sort((a, b) => b[1] - a[1])[0][0];
  const deep = sp.depth[0] >= 70 ? 'very deep' : sp.depth[0] >= 30 ? 'deep' : sp.depth[1] <= 25 ? 'shallow' : 'mid-water';
  const extra = sp.aurora ? ', under a strong aurora' : sp.weather && sp.weather.snow > 1.5 ? ', while it snows' : sp.bait ? ', to live bait' : '';
  return `Unrecorded. Something ${deep} in ${where}, most often at ${when}${extra}.`;
}
