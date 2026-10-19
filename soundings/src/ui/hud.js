import * as THREE from 'three';
import { h, clear } from './dom.js';
import { Sonar, drawBang } from './sonar.js';
import { iconEl, ditherShade } from './pixelart.js';
import { ScreenLayout, union, rectOf, GRID, snap, snapToGrid } from './layout.js';
import { clamp, angleDelta } from '../core/math.js';
import * as Art from '../seekernet/art.js';

// The heads-up display: the visor's readout top left (time, where you are, your field
// requests), your seeker top right (its face, its Overdrive, its stored surges), what
// you have gathered, and one line of guidance at the bottom. While fishing, the cast
// meter, the "!" and the catch bar float beside the Seeker, never over it.

const WEATHER_NAME = { clear: 'clear', overcast: 'overcast', snow: 'snowing' };
const PHASE_ICON = { night: 'moon', dawn: 'dawn', day: 'sun', dusk: 'dawn' };

// "[E] sit" markers become key caps.
export function rich(text, el = document.createDocumentFragment()) {
  for (const p of String(text).split(/(\[[^\]]+\])/)) {
    if (!p) continue;
    if (/^\[.+\]$/.test(p)) el.append(h('span', { class: 'kc' }, p.slice(1, -1)));
    else el.append(p);
  }
  return el;
}

export class HUD {
  constructor(root, game) {
    this.g = game;
    this.root = h('div', { class: 'hud hidden' });
    root.append(this.root);
    this._t = {};
    this.layout = new ScreenLayout(game.cam.cam, game.canvas);

    // ---- top left: the visor and the field requests
    this.clock = h('div', { class: 'clock sh' });
    this.phaseIco = h('span');
    this.dayText = h('span');
    this.zone = h('div', { class: 'zone sh' });
    this.depth = h('div', { class: 'depth' });
    this.visor = h('div', { class: 'visor pf' }, this.clock, h('div', { class: 'when' }, this.phaseIco, this.dayText), this.zone, this.depth);
    this.reqList = h('div', { class: 'list' });
    this.reqs = h('div', { class: 'reqs pf hidden' }, this.reqList);
    this.tl = h('div', { class: 'tl' }, this.visor, this.reqs);

    // ---- top right: your seeker, and what you have gathered
    this.face = h('canvas', { class: 'face' });
    this.compName = h('div', { class: 'name sh' });
    this.odName = h('span');
    this.odFill = h('i');
    this.odKey = h('span', { class: 'kc' }, 'Q');
    this.od = h('div', { class: 'od' }, this.odName, h('div', { class: 'meter wf' }, this.odFill), this.odKey);
    this.cells = h('div', { class: 'cells' });
    this.comp = h('div', { class: 'comp pf' }, this.face, this.od, this.cells);
    this.dataVal = h('b', { class: 'sh-k' });
    this.dataV = h('div', { class: 'v' }, iconEl('dataBig'), this.dataVal);
    this.goalName = h('span');
    this.goalFill = h('i', { class: 'gold' });
    this.goalNum = h('span');
    this.goal = h('div', { class: 'goal' }, this.goalName, h('div', { class: 'meter wf' }, this.goalFill), this.goalNum);
    this.streak = h('div', { class: 'streak hidden' });
    this.datac = h('div', { class: 'datac pf' }, this.dataV, this.goal, this.streak);
    this.tr = h('div', { class: 'tr' }, this.comp, this.datac);

    this.compass = h('div', { class: 'compass' });

    // ---- bottom left: the pack
    this.packImg = h('img', { alt: '' });
    this.packSlots = h('div', { class: 'slots' });
    this.packText = h('span', { class: 'sh' });
    this.pack = h('div', { class: 'packc pf' }, this.packImg, h('div', {}, this.packText, this.packSlots));
    this.bl = h('div', { class: 'bl' }, this.pack);

    // ---- bottom: guidance, the prompt, the keys
    this.coachEl = h('div', { class: 'coach pf hidden' });
    this.promptText = h('span', { class: 'sh' });
    this.promptFill = h('i');
    this.promptProg = h('div', { class: 'progress meter wf hidden' }, this.promptFill);
    this.prompt = h('div', { class: 'prompt pf hidden' }, this.promptText, this.promptProg);
    this.keys = h('div', { class: 'keys sh-k' });
    this.bottom = h('div', { class: 'bottom' }, this.coachEl, this.prompt, this.keys);

    this.toasts = h('div', { class: 'toasts' });
    this.banners = h('div');
    this.vignette = h('canvas', { class: 'vignette' });
    this._shade = { resize: () => {
      const px = this.g.px;
      ditherShade(this.vignette, px.width, px.height, (x, y) => {
        const dx = (x - 0.5) * 2, dy = (y - 0.5) * 2;
        return Math.max(0, Math.hypot(dx, dy * 0.9) - 0.75) * 1.1;
      });
    } };
    this.listen = h('div', { class: 'listen sh-k hidden' }, 'something is listening');
    this.root.append(this.vignette, this.tl, this.tr, this.compass, this.bl, this.bottom, this.toasts, this.banners, this.listen);

    // ---- fishing, beside the Seeker
    this.castFill = h('i');
    this.castBottom = h('b');
    this.castTrack = h('div', { class: 'track wf' }, this.castFill, this.castBottom);
    this.castTop = h('span');
    this.castVal = h('span', { class: 'v' });
    this.castReach = h('span');
    this.castm = h('div', { class: 'castm pf hidden' }, this.castTrack, h('div', { class: 'read sh-k' }, this.castTop, this.castVal, this.castReach));
    for (let i = 1; i < 8; i++) this.castTrack.append(h('s', { style: { top: `${(i / 8) * 100}%` } }));
    this.bangCv = h('canvas');
    this.bangName = h('em');
    this.bang = h('div', { class: 'bang hidden' }, h('div', { class: 'bub' }, this.bangCv), this.bangName);
    this.barCv = h('canvas', { class: 'bar' });
    this.sonar = new Sonar(this.barCv);
    this.barCv.style.width = 'calc(var(--u) * 46)';
    this.barCv.style.height = 'calc(var(--u) * 126)';
    this.reelName = h('div', { class: 'name sh-k' });
    this.reelFx = h('div', { class: 'fx sh-k' });
    this.reel = h('div', { class: 'reel hidden' }, this.reelName, this.barCv, this.reelFx);
    this.root.append(this.castm, this.bang, this.reel);

    this.flashEl = h('div', { class: 'flash' });
    document.body.append(this.flashEl);
    this._coachQ = [];
    this._coachT = 0;
    this._hudRects = [];
    this._hudRectT = 0;
    this._bangKey = '';
    this._v = new THREE.Vector3();
    this.setScale();
  }

  // One interface pixel is one pixel of the world, exactly: everything on one grid.
  setScale() {
    const dpr = devicePixelRatio || 1;
    const px = this.g.px;
    const u = (px.baseScale || px.scale || 2) / dpr;
    // the HUD sits on the canvas, so its pixels are the world's pixels
    const o = px.origin || { x: 0, y: 0 };
    const shift = (px.scale / dpr) * 0;   // the grid of the world, offset as the canvas is
    const ox = o.x + shift, oy = o.y + shift;
    GRID.ox = ox; GRID.oy = oy; GRID.u = u;
    const ui = this.root.parentElement;
    if (ui) {
      ui.style.left = `${ox}px`;
      ui.style.top = `${oy}px`;
      ui.style.right = 'auto';
      ui.style.bottom = 'auto';
      ui.style.width = `${px.width * (px.scale / dpr)}px`;
      ui.style.height = `${px.height * (px.scale / dpr)}px`;
    }
    this._shade && this._shade.resize();
    if (u === this.u) return;
    this.u = u;
    document.documentElement.style.setProperty('--u', `${u}px`);
  }

  // A meter's fill, in whole interface pixels.
  fill(el, frac, axis = 'width') {
    const parent = el.parentElement;
    const n = Math.max(0, Math.round((axis === 'width' ? parent.clientWidth : parent.clientHeight) / this.u));
    const v = `${Math.round(clamp(frac, 0, 1) * n) * this.u}px`;
    if (el.style[axis] !== v) el.style[axis] = v;
  }

  // Q too soon: the meter shakes.
  nudge() {
    this.comp.classList.remove('nudge');
    void this.comp.offsetWidth;
    this.comp.classList.add('nudge');
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  _set(el, key, text) {
    if (this._t[key] === text) return;
    this._t[key] = text;
    el.textContent = text;
  }

  // ------------------------------------------------------------------ messages
  // A short notice at the top: kind '' | good | warn | net | gold; opts { face, icon, sub }
  // While a catch is being shown, notices wait their turn (only warnings come through).
  setQuiet(q) {
    this.quiet = q;
    this.toasts.classList.toggle('hidden', q);
    if (!q) {
      const later = (this._deferred || []).slice(-2);
      this._deferred = [];
      later.forEach((a, i) => setTimeout(() => this.toast(...a), 300 + i * 700));
      if (!this._coachNow) this._nextCoach();
    }
  }

  toast(text, kind = '', ms = 3600, opts = {}) {
    if (this.quiet && kind !== 'warn') {
      (this._deferred = this._deferred || []).push([text, kind, ms, opts]);
      return null;
    }
    const frame = { good: 'pf-teal', warn: 'pf-red', net: 'pf-glow', gold: 'pf-gold' }[kind] || 'pf';
    const tt = h('div', { class: 'tt' }, rich(text, h('span', { class: 'sh' })), opts.sub ? h('span', { class: 'sub' }, opts.sub) : null);
    let lead = null;
    if (opts.face) {
      lead = h('canvas', { class: 'face' });
      const s = this.g.net.state(opts.face);
      Art.drawCrop(lead, opts.face, s.activated ? { activated: true } : { activated: false, stage: s.stage }, 18, 18, 18, 18).catch(() => {});
    } else if (opts.icon) lead = iconEl(opts.icon, opts.tint || null, opts.iconScale || 1);
    const t = h('div', { class: `toast ${frame}` }, lead, tt);
    this.toasts.append(t);
    while (this.toasts.children.length > 2) this.toasts.firstChild.remove();
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, ms);
    return t;
  }

  // One line of guidance at a time, at the bottom.
  coach(text, ms = 6000) {
    if (this._coachQ.some((c) => c.text === text) || this._coachNow === text) return;
    this._coachQ.push({ text, ms });
    if (!this._coachNow && !this.quiet) this._nextCoach();
  }

  _nextCoach() {
    if (this.quiet) {
      this._coachNow = null;
      this.coachEl.classList.add('hidden');
      return;
    }
    const c = this._coachQ.shift();
    if (!c) {
      this._coachNow = null;
      this.coachEl.classList.add('hidden');
      return;
    }
    this._coachNow = c.text;
    clear(this.coachEl);
    this.coachEl.classList.remove('hidden', 'out');
    void this.coachEl.offsetWidth;
    this.coachEl.style.animation = 'none';
    void this.coachEl.offsetWidth;
    this.coachEl.style.animation = '';
    this.coachEl.append(iconEl('eye', '#91cbde', 1, 'ico'), rich(c.text, h('span', { class: 'txt sh' })));
    this._coachT = c.ms / 1000;
  }

  // A big moment: a new species, a surge, a seeker waking.
  banner(title, sub = '', kind = 'teal', ms = 2600) {
    clear(this.banners);
    const color = { teal: 'var(--teal)', gold: 'var(--gold2)', glow: 'var(--ice)', violet: 'var(--violet)', red: 'var(--red)' }[kind] || 'var(--text)';
    const b = h('div', { class: 'banner' }, h('div', { class: 't', style: { color } }, title), sub ? rich(sub, h('div', { class: 's' })) : null);
    // below the top corners, so it never sits on them
    const a = this.tl.getBoundingClientRect(), c = this.tr.getBoundingClientRect(), r0 = this.root.getBoundingClientRect();
    b.style.top = `${snap(Math.max(a.bottom, c.bottom, innerHeight * 0.1) + 6 * this.u, 'y') - r0.top}px`;
    this.banners.append(b);
    // notices make way while it shows
    this.toasts.style.visibility = 'hidden';
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => {
      b.classList.add('out');
      setTimeout(() => { b.remove(); this.toasts.style.visibility = ''; }, 450);
    }, ms);
  }

  flash() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  setPrompt(text, progress = null) {
    if (!text) {
      if (!this.prompt.classList.contains('hidden')) this.prompt.classList.add('hidden');
      this._t.prompt = null;
      return;
    }
    this.prompt.classList.remove('hidden');
    if (this._t.prompt !== text) {
      this._t.prompt = text;
      clear(this.promptText);
      rich(text, this.promptText);
    }
    this.promptProg.classList.toggle('hidden', progress === null);
    if (progress !== null) this.fill(this.promptFill, progress);
  }

  // The keys for what you can do now: "[Space] cast · [E] stand"
  setHint(text) {
    if (this._t.hint === text) return;
    this._t.hint = text;
    clear(this.keys);
    if (!text) return;
    for (const part of String(text).split(' · ')) this.keys.append(rich(part, h('span')));
  }

  setPackImage(level) {
    if (this._packLevel === level) return;
    this._packLevel = level;
    this.packImg.src = `assets/items/backpack${level}.png`;
  }

  async setCompanion(token, state) {
    this._compToken = token;
    this.comp.classList.toggle('solo', !token);
    if (!token) {
      this._set(this.compName, 'cname', 'visor only');
      const ctx = this.face.getContext('2d');
      this.face.width = this.face.height = 27;
      ctx.clearRect(0, 0, 27, 27);
      return;
    }
    const key = token + ':' + (state.activated ? 'a' : state.stage);
    if (this._faceKey === key) return;
    this._faceKey = key;
    try {
      // the whole seeker, uncropped, one canvas pixel per art pixel
      const b = await Art.bounds(token);
      const w = Math.min(54, b.w + 2), hh = Math.min(54, b.h + 2);
      await Art.drawCrop(this.face, token, state.activated ? { activated: true } : { activated: false, stage: state.stage }, b.x0 - 1, b.y0 - 1, w, hh);
      const k = 1;
      this.face.style.width = `calc(var(--u) * ${Math.round(w * k)})`;
      this.face.style.height = `calc(var(--u) * ${Math.round(hh * k)})`;
    } catch { /* art not loaded yet */ }
  }

  // ------------------------------------------------------------------ every frame
  update(dt) {
    const g = this.g;
    const focus = g.mode === 'fish' || g.mode === 'catch' || g.mode === 'capsule' || g.mode === 'drill';
    if (this._t.focus !== focus) { this._t.focus = focus; this.root.classList.toggle('focus', focus); }
    // a window open: the HUD steps back instead of peeking around it
    const windowed = g.panels.open;
    if (this._t.windowed !== windowed) { this._t.windowed = windowed; this.root.classList.toggle('windowed', windowed); }
    this._sayUpdate(dt);
    this._layoutTop();
    this._set(this.clock, 'clock', g.day.clock());
    const phase = g.day.phase();
    if (this._t.phase !== phase) {
      this._t.phase = phase;
      clear(this.phaseIco).append(iconEl(PHASE_ICON[phase] || 'sun', phase === 'night' ? '#91cbde' : '#e3cf8e'));
    }
    this._set(this.dayText, 'day', `day ${g.day.day}`);
    const z = g.zoneInfo();
    this._set(this.zone, 'zone', z.name);
    this._set(this.depth, 'depth', `${z.depth}${WEATHER_NAME[g.weather.kind]}${g.auroraVisible > 0.25 ? ' · aurora' : ''}`);
    // gathered
    const data = g.state.data;
    if (this._t.data !== data && !this._flying) {
      if (this._t.data !== undefined && data > this._t.data) this._bump(this.dataV);
      this._t.data = data;
      this.dataVal.textContent = String(data);
    }
    const goal = g.nextGoal();
    if (goal) {
      this.goal.classList.remove('hidden');
      this.goal.classList.toggle('ready', goal.ready);
      this._set(this.goalName, 'goaln', goal.name);
      this.fill(this.goalFill, data / goal.cost);
      this._set(this.goalNum, 'goalv', goal.ready ? 'ready' : `${data}/${goal.cost}`);
    } else this.goal.classList.add('hidden');
    const st = g.streak;
    this.streak.classList.toggle('hidden', st < 2);
    if (st >= 2) this._set(this.streak, 'streak', `streak ${st}${g.streakMult() > 1 ? ' · data ×' + g.streakMult() : ''}`);
    // the pack
    const cap = g.packCapacity(), n = g.state.creel.length;
    this._set(this.packText, 'pack', `${n}/${cap}`);
    if (this._t.packKey !== n + '/' + cap) {
      if (this._t.packKey && n > Number(this._t.packKey.split('/')[0])) this._bump(this.pack);
      this._t.packKey = n + '/' + cap;
      clear(this.packSlots);
      this.packSlots.style.gridTemplateColumns = `repeat(${Math.min(cap, 6)}, calc(var(--u) * 4))`;
      for (let i = 0; i < cap; i++) this.packSlots.append(h('i', { class: i < n ? 'on' : '' }));
      this.pack.classList.toggle('full', n >= cap);
    }
    this.setPackImage(g.packLevel());
    this._companion();
    this._requests();
    this._compass();
    if (this._coachNow) {
      this._coachT -= dt;
      if (this._coachT <= 0 && !this.coachEl.classList.contains('out')) {
        this.coachEl.classList.add('out');
        setTimeout(() => this._nextCoach(), 300);
      }
    }
  }

  // Notices go in the free band between the two top corners, or below them when the
  // screen is too narrow for that.
  _layoutTop() {
    this._topT = (this._topT || 0) - 1;
    if (this._topT > 0) return;
    this._topT = 15;
    const u = this.u;
    const a = this.tl.getBoundingClientRect(), b = this.tr.getBoundingClientRect();
    const free = b.left - a.right - 12 * u;
    const st = this.toasts.style;
    const r0 = this.root.getBoundingClientRect();
    if (free >= 150 * u) {
      st.top = `${24 * u}px`;
      st.maxWidth = `${Math.floor(free / u) * u}px`;
      st.left = `${snap((a.right + b.left) / 2) - r0.left}px`;
    } else {
      st.top = `${snap(Math.max(a.bottom, b.bottom) + 4 * u, 'y') - r0.top}px`;
      st.maxWidth = `calc(100% - var(--u) * 12)`;
      st.left = `${Math.round(r0.width / 2 / u) * u}px`;
    }
  }

  _bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // Your seeker, a picture of what its Overdrive does, and its charge. The key to fire it
  // shows only where it can be fired: at a hole.
  _companion() {
    const g = this.g;
    const od = g.overdrive;
    const prof = g.companionProfile;
    if (!prof) {
      this.od.classList.add('hidden');
      clear(this.cells);
      this._t.cells = null;
      return;
    }
    this.od.classList.remove('hidden');
    const active = od.active;
    const ready = !active && od.ready();
    const ico = prof.overdrive + (active ? 'a' : ready ? 'r' : '');
    if (this._t.odIco !== ico) {
      this._t.odIco = ico;
      clear(this.odName).append(iconEl('od_' + prof.overdrive, active ? '#e3cf8e' : ready ? '#d6edf5' : '#91cbde'));
    }
    this.fill(this.odFill, active ? od.activeFrac() : od.charge);
    this.comp.classList.toggle('ready', ready);
    this.comp.classList.toggle('active', !!active);
    const cells = g.surgeCells(g.state.companion);
    this.odKey.classList.toggle('hidden', !((ready || cells) && g.mode === 'fish'));
    if (this._t.cells !== cells) {
      this._t.cells = cells;
      clear(this.cells);
      for (let i = 0; i < cells; i++) this.cells.append(iconEl('bolt', '#d6edf5'));
    }
  }

  _netKey() {
    const n = this.g.net;
    return `${n.online && n.totals && n.totals.live ? 1 : 0}${n.pulse > 0.6 ? 1 : 0}`;
  }

  _netBits() {
    const n = this.g.net;
    const live = n.online && n.totals && n.totals.live;
    return h('span', { class: 'netline' + (n.pulse > 0.6 ? ' pulse' : '') }, iconEl(live ? 'dot' : 'dotOff'), live ? 'net live' : n.online === false ? 'net offline' : 'net');
  }

  _requests() {
    const all = this.g.requests ? this.g.requests.list : [];
    // one at a time: the one just done (while it stamps), else the next to do
    const done = all.find((r) => r.done);
    const list = done ? [done] : all.slice(0, 1);
    const key = list.map((r) => `${r.id}:${r.n}:${r.done ? 1 : 0}`).join('|');
    if (this._t.reqs === key) return;
    this._t.reqs = key;
    this.reqs.classList.toggle('hidden', !list.length);
    clear(this.reqList);
    for (const r of list) {
      const cls = 'req' + (r.done ? ' done' : '') + (r.fresh ? ' new' : '');
      r.fresh = false;
      this.reqList.append(h('div', { class: cls },
        h('span', { class: 'box ' + (r.done ? 'wf-hi' : 'wf') }, r.done ? iconEl('check') : r.song ? iconEl('note', '#d6edf5') : iconEl('book', '#b9a87b')),
        h('span', { class: 'sh' }, r.text),
        h('span', { class: 'n' }, r.goal > 1 ? `${Math.min(r.n, r.goal)}/${r.goal}` : ''),
        r.hint && !r.done ? h('span', { class: 'hint' }, r.hint) : null));
    }
  }

  _compass() {
    const g = this.g;
    const yaw = g.cam.yaw;
    const W = this.compass.clientWidth || 400;
    const fov = 1.9;
    const items = [];
    const lookA = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    const bearing = (ang) => angleDelta(lookA, ang);
    for (const [name, ang] of [['N', Math.atan2(-1, 0)], ['E', Math.atan2(0, 1)], ['S', Math.atan2(1, 0)], ['W', Math.atan2(0, -1)]]) items.push({ text: name, a: bearing(ang), cls: 'card' });
    for (const m of g.compassMarks()) {
      const a = bearing(Math.atan2(m.z - g.player.pos.z, m.x - g.player.pos.x));
      const d = Math.hypot(m.x - g.player.pos.x, m.z - g.player.pos.z);
      items.push({ text: m.text, a, cls: m.cls, icon: m.icon, d: m.dist ? Math.round(d) : null });
    }
    const key = items.map((i) => i.text + Math.round(i.a * 60) + (i.d ?? '')).join('|');
    if (this._t.compass === key) return;
    this._t.compass = key;
    clear(this.compass);
    this.compass.append(h('div', { class: 'rule' }));
    for (let k = -8; k <= 8; k++) {
      const a = bearing(Math.atan2(-1, 0) + (k * Math.PI) / 8);
      if (Math.abs(a) > fov / 2) continue;
      this.compass.append(h('i', { class: 'tick', style: { left: `${Math.round(W / 2 + (a / (fov / 2)) * (W / 2))}px` } }));
    }
    // every mark's icon first, the most important first; then the labels, where there is
    // room for them, so nothing on the compass ever lies on top of anything else
    const rank = { alert: 0, spark: 1, gold: 2, mark: 3, card: 5 };
    const u = this.u;
    const span = (el, x) => { const w = el.offsetWidth; return [x - w / 2, x + w / 2]; };
    const hits = (iv, list, self) => list.some((o) => o !== self && iv[0] - u * 2 < o.iv[1] && iv[1] + u * 2 > o.iv[0]);
    const shown = [];
    items.sort((p, q) => (rank[p.cls] ?? 4) - (rank[q.cls] ?? 4));
    for (const it of items) {
      if (Math.abs(it.a) > fov / 2) continue;
      const x = W / 2 + (it.a / (fov / 2)) * (W / 2);
      const el = h('span', { class: `${it.cls} sh-k`, style: { left: `${Math.round(x)}px` } },
        it.icon ? iconEl(it.icon, it.cls === 'spark' ? '#d6edf5' : it.cls === 'gold' ? '#e3cf8e' : null) : it.text);
      this.compass.append(el);
      const o = { it, el, x, iv: span(el, x) };
      if (hits(o.iv, shown, o)) { el.remove(); continue; }
      shown.push(o);
    }
    for (const o of shown) {
      const it = o.it;
      if (!it.icon || (!it.text && (it.d === null || it.d === undefined))) continue;
      const extra = [it.text ? document.createTextNode(it.text) : null, it.d !== null && it.d !== undefined ? h('span', { class: 'muted' }, `${it.d}m`) : null].filter(Boolean);
      o.el.append(...extra);
      const iv = span(o.el, o.x);
      if (hits(iv, shown, o)) for (const n of extra) n.remove();
      else o.iv = iv;
    }
  }

  // ------------------------------------------------------------------ fishing
  fishing(on) {
    if (!on) {
      for (const el of [this.castm, this.bang, this.reel, this.listen]) el.classList.add('hidden');
      this.vignette.style.opacity = '0';
      for (const k of ['cast', 'bang', 'reel']) this.layout.forget(k);
    }
  }

  // Rectangles to keep clear: the Seeker, its seeker, the hole, and the HUD itself.
  avoidRects(ctx) {
    const L = this.layout;
    const u = this.u;
    const out = [];
    if (ctx.player) out.push(ctx.playerRect = L.box(ctx.player, ctx.playerBox || [-0.4, 0, -0.42, 0.4, 1.7, 0.42], 2 * u));
    if (ctx.bot) out.push(ctx.botRect = L.box(ctx.bot, [-0.36, 0.1, -0.3, 0.36, 0.95, 0.3], 2 * u));
    if (ctx.hole) out.push(ctx.holeRect = L.disc(ctx.hole.x, 0, ctx.hole.z, 0.32, 2 * u));
    if (ctx.fish) out.push(ctx.fish);
    this._hudRectT -= 1;
    if (this._hudRectT <= 0) {
      this._hudRectT = 6;
      const els = [this.tl, this.tr, this.bottom, this.bl, this.toasts, this.banners.firstChild];
      if (this.g.touch && this.g.touch.on) els.push(...this.g.touch.el.querySelectorAll('.btn:not(.hidden)'));
      this._hudRects = els.map((el) => rectOf(el, 2 * u)).filter(Boolean);
    }
    return out.concat(this._hudRects.map((r) => ({ ...r, weight: 0.6 })));
  }

  updateFishing(f, frame, info, fishImg, ctx, dt) {
    const u = this.u, gap = 6 * u;
    const avoid = this.avoidRects(ctx);
    const P = ctx.playerRect, U = union(ctx.playerRect, ctx.botRect, ctx.holeRect) || P;
    const reeling = f.state === 'reel' && f.game;
    // casting: a depth meter beside the Seeker
    const casting = f.state === 'cast';
    this.castm.classList.toggle('hidden', !casting);
    if (casting) {
      const reach = f.maxReach();
      this.fill(this.castFill, f.castPower, 'height');
      this.castBottom.style.top = `${Math.round(clamp(f.bottom / Math.max(reach, 0.1), 0, 1) * (this.castTrack.clientHeight / this.u)) * this.u}px`;
      this.castBottom.classList.toggle('hidden', f.bottom > reach + 0.5);
      this._set(this.castTop, 'ctop', '0 m');
      this._set(this.castVal, 'cval', `${(f.castPower * reach).toFixed(0)} m`);
      this._set(this.castReach, 'creach', `${reach.toFixed(0)} m`);
      this.castVal.style.marginTop = `${Math.max(0, Math.round(f.castPower * (this.castTrack.clientHeight / this.u) - 12)) * this.u}px`;
      const w = this.castm.offsetWidth, hh = this.castm.offsetHeight;
      const cy = (P.y0 + P.y1) / 2 - hh / 2, cu = (U.y0 + U.y1) / 2 - hh / 2;
      this.layout.place('cast', this.castm, [
        { x: P.x1 + gap, y: cy }, { x: U.x1 + gap, y: cu }, { x: P.x0 - gap - w, y: cy }, { x: U.x0 - gap - w, y: cu },
        { x: (P.x0 + P.x1) / 2 - w / 2, y: P.y0 - gap - hh },
      ], avoid);
    }
    // a bite: "!" above the Seeker
    const bite = f.state === 'bite';
    this.bang.classList.toggle('hidden', !bite);
    if (bite) {
      const rarity = f.biteFish ? f.biteFish.sp.rarity : 'common';
      const key = rarity + (frame % 6 < 3 ? 'a' : 'b');
      if (this._bangKey !== key) { this._bangKey = key; drawBang(this.bangCv, rarity, frame); }
      this._set(this.bangName, 'bangname', info.biteName || '');
      const w = this.bang.offsetWidth, hh = this.bang.offsetHeight;
      const head = this.layout.point(ctx.head);
      this.layout.place('bang', this.bang, [
        { x: head.x - w / 2, y: P.y0 - hh - u * 2 }, { x: P.x1 + u * 2, y: P.y0 - hh * 0.6 }, { x: P.x0 - w - u * 2, y: P.y0 - hh * 0.6 },
      ], avoid.filter((r) => r !== ctx.playerRect), { rate: 1, snap: true });
    } else this._bangKey = '';
    // reeling: the catch bar, beside the Seeker and its seeker
    this.reel.classList.toggle('hidden', !reeling);
    if (reeling) {
      this.sonar.drawGame(f, frame, fishImg, info.fx || {}, info.holding, dt, info.fishShadow);
      this._set(this.reelName, 'reelname', info.reelName || 'something');
      this._set(this.reelFx, 'reelfx', info.fxText || '');
      this.reel.classList.toggle('shake', !f.game.inside && !(info.fx && (info.fx.auto || info.fx.lock)));
      const w = this.reel.offsetWidth, hh = this.reel.offsetHeight;
      const cy = (U.y0 + U.y1) / 2 - hh / 2;
      this.layout.place('reel', this.reel, [
        { x: U.x1 + gap, y: cy }, { x: U.x0 - gap - w, y: cy }, { x: P.x1 + gap, y: cy }, { x: P.x0 - gap - w, y: cy },
        { x: (U.x0 + U.x1) / 2 - w / 2, y: U.y0 - gap - hh }, { x: (U.x0 + U.x1) / 2 - w / 2, y: U.y1 + gap },
      ], avoid);
    }
    this.listen.classList.toggle('hidden', !f.listening);
    this.vignette.style.opacity = f.listening ? '1' : '0';
  }

  // The catch card, beside the Seeker holding up the catch.
  placeCard(card, ctx) {
    const u = this.u, gap = 8 * u;
    const avoid = this.avoidRects(ctx);
    const P = ctx.playerRect;
    const w = card.offsetWidth, hh = card.offsetHeight;
    const cy = (P.y0 + P.y1) / 2 - hh / 2;
    return this.layout.place('card', card, [
      { x: P.x1 + gap, y: cy }, { x: P.x0 - gap - w, y: cy }, { x: innerWidth - w - 12 * u, y: cy }, { x: (innerWidth - w) / 2, y: innerHeight - hh - 30 * u },
    ], avoid, { rate: 0.2 });
  }

  // ------------------------------------------------------------------ floating numbers
  floatText(text, x, y, opts = {}) {
    const el = h('div', { class: 'floater ' + (opts.cls || ''), style: { color: opts.color || 'var(--text)' } },
      opts.icon ? iconEl(opts.icon, opts.tint || null) : null, rich(text, h('span', { class: opts.big ? 'big' : '' })));
    document.body.append(el);
    const w = el.offsetWidth;
    const u = this.u;
    const rise = Math.round(opts.rise ?? 24) * u;
    const p = snapToGrid(x - w / 2, y);
    const at = (dy, o) => ({ transform: `translate(${p.x}px, ${p.y - dy}px)`, opacity: o });
    const a = el.animate([at(0, 0), at(Math.round(rise * 0.4 / u) * u, 1), at(Math.round(rise * 0.7 / u) * u, 1), at(rise, 0)].map((k, i) => ({ ...k, offset: [0, 0.2, 0.7, 1][i] })),
      { duration: opts.ms || 1100, easing: `steps(${Math.max(4, Math.round(rise / u))})` });
    a.onfinish = () => el.remove();
  }

  // A number rising from the Overdrive meter.
  floatFromMeter(text) {
    const r = this.od.getBoundingClientRect();
    if (!r.width) return;
    this.floatText(text, r.left + r.width * 0.6, r.bottom, { color: 'var(--glow)', icon: 'bolt', tint: '#91cbde', rise: 12, ms: 1000 });
  }

  // A few words from someone out on the ice, above their head, until they are said.
  say(text, anchor, ms = 4000) {
    if (!this.bubble) {
      this.bubbleText = h('span');
      this.bubble = h('div', { class: 'bubble pf hidden' }, this.bubbleText, iconEl('btail', null, 1, 'tail'));
      document.body.append(this.bubble);
    }
    clear(this.bubbleText);
    rich(text, this.bubbleText);
    this.bubble.classList.remove('hidden');
    this.bubble.style.animation = 'none';
    void this.bubble.offsetWidth;
    this.bubble.style.animation = '';
    this._bubble = { anchor, left: ms / 1000 };
  }

  _sayUpdate(dt) {
    const b = this._bubble;
    if (!b) return;
    b.left -= dt;
    const p = b.left > 0 && !this.g.panels.open && this.g.mode !== 'title' ? this.layout.point(b.anchor()) : null;
    if (!p || p.behind) {
      this.bubble.classList.add('hidden');
      if (b.left <= 0) this._bubble = null;
      return;
    }
    this.bubble.classList.remove('hidden');
    const w = this.bubble.offsetWidth, hh = this.bubble.offsetHeight;
    const q = snapToGrid(clamp(p.x - w / 2, 8, innerWidth - w - 8), Math.max(8, p.y - hh - 4 * this.u));
    const t = `translate(${q.x}px, ${q.y}px)`;
    if (this.bubble._t !== t) { this.bubble._t = t; this.bubble.style.transform = t; }
  }

  floatAtWorld(p, text, opts) {
    const s = this.layout.point(p);
    this.floatText(text, s.x, s.y, opts);
  }

  // Data flying from a point to the counter, which counts up as it lands.
  flyData(amount, from) {
    const to = this.dataV.getBoundingClientRect();
    const el = h('div', { class: 'floater', style: { color: 'var(--gold2)' } }, iconEl('dataBig'), h('span', { class: 'big' }, `+${amount}`));
    document.body.append(el);
    const tx = to.left + to.width / 2 - el.offsetWidth / 2, ty = to.top;
    const mx = (from.x + tx) / 2 + 40 * this.u, my = Math.min(from.y, ty) - 20 * this.u;
    this._flying = true;
    const k = (x, y, o, off) => { const p = snapToGrid(x, y); return { transform: `translate(${p.x}px, ${p.y}px)`, opacity: o, offset: off }; };
    const a = el.animate([k(from.x, from.y, 1, 0), k(from.x, from.y - 10 * this.u, 1, 0.25), k(mx, my, 1, 0.6), k(tx, ty, 0.4, 1)], { duration: 1050, easing: 'steps(16)' });
    a.onfinish = () => {
      el.remove();
      this._flying = false;
      const start = Number(this.dataVal.textContent) || 0, end = this.g.state.data;
      this._t.data = end;
      this._bump(this.dataV);
      let k = 0;
      const steps = Math.min(12, Math.max(1, end - start));
      const tick = () => {
        k++;
        this.dataVal.textContent = String(Math.round(start + ((end - start) * k) / steps));
        if (k < steps) setTimeout(tick, 40);
      };
      tick();
      this.g.audio.ui('coin');
    };
  }
}
