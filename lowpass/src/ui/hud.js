import { el, clear, key } from './dom.js';
import { stratum } from '../artifacts/strata.js';
import { TANK } from '../core/progress.js';

const hexCss = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');

// The HUD: as little as the flight needs. A bearing to the signal along the top while it
// is out in the fog (and a smaller mark for each other one of a sweep); brackets around
// it once it is near, and the scan's hold beneath them; the alertness meter; one notice
// at a time; the keys that work right now. And, over everything, even the Codex: the
// alert that seekers moved while you are inside, with the way out.

export class Hud {
  constructor(root) {
    this.root = el('div', 'hud', root);
    this.signal = el('div', 'signal', this.root);
    this.sigMark = el('div', 'mark', this.signal);
    this.sigLabel = el('div', 'label', this.signal);
    this.sigOthers = [];
    this.bracket = el('div', 'bracket', this.root);
    for (const c of ['tl', 'tr', 'bl', 'br']) el('i', c, this.bracket);
    this.brLabel = el('div', 'blabel', this.bracket);
    this.brBar = el('div', 'bbar', this.bracket);
    this.brFill = el('i', '', this.brBar);
    this.alert = el('div', 'alert', this.root);
    this.cup = el('div', 'cup', this.alert);
    this.alertBar = el('div', 'abar', this.alert);
    this.alertFill = el('i', '', this.alertBar);
    this.alertText = el('div', 'atext', this.alert);
    // the boost's plasma, over it: spent by the burn, gathered back slowly
    this.fuel = el('div', 'alert fuel', this.root);
    el('div', 'pico', this.fuel);
    this.fuelBar = el('div', 'abar', this.fuel);
    this.fuelFill = el('i', '', this.fuelBar);
    this.fuelText = el('div', 'atext', this.fuel);
    this.status = el('div', 'status', this.root);
    this.notice = el('div', 'notice', this.root);
    this.card = el('div', 'card', this.root);
    // along the bottom: the next thing to learn above the keys that work now
    this.bottom = el('div', 'bottom', this.root);
    this.speech = el('div', 'speech', this.bottom);
    this.speechWho = el('div', 'who', this.speech);
    this.speechText = el('div', 'said', this.speech);
    this.tip = el('div', 'tip', this.bottom);
    this.keys = el('div', 'keys', this.bottom);
    this.prompt = el('div', 'prompt', this.root);
    this.cross = el('div', 'cross', this.root);
    this.marks = [];
    // the alert: outside the HUD, so nothing that hides the HUD hides it
    this.alarm = el('div', 'alarm', root);
    el('i', 'amark', this.alarm);
    this.alarmTitle = el('div', 'at', this.alarm);
    this.alarmText = el('div', 'as muted', this.alarm);
    const row = el('div', 'arow', this.alarm);
    this.alarmBtn = el('button', 'btn', row, 'GO OUTSIDE');
    this.alarmKey = el('span', 'muted', row);
    key(this.alarmKey, 'V');
    const later = el('button', 'chip', row, 'NOT NOW');
    this.onAlarm = null;
    this.alarmBtn.onclick = () => { if (this.onAlarm) this.onAlarm(); };
    // waved off: quiet for these ones (the next seekers to move bring it back)
    this._waved = new Set();
    later.onclick = () => { for (const a of this._alarmList || []) this._waved.add(a); this.setAlarm(this._alarmList); };
    this.alarmOn = false;
    // its lighter kin for a wild artifact, which goes by itself after a while
    this.toastEl = el('div', 'alarm toast', root);
    el('i', 'amark', this.toastEl);
    this.toastTitle = el('div', 'at', this.toastEl);
    this.toastText = el('div', 'as muted', this.toastEl);
    const trow = el('div', 'arow', this.toastEl);
    const tgo = el('button', 'btn', trow, 'GO OUTSIDE');
    key(el('span', 'muted', trow), 'V');
    tgo.onclick = () => { this.hideToast(); if (this.onAlarm) this.onAlarm(); };
    this._toastT = 0;
    this._noticeT = 0;
    this._cardT = 0;
    this._keysKey = '';
    this.visible = true;
  }

  show(v) {
    this.visible = v;
    this.root.classList.toggle('hidden', !v);
  }

  // one line, for a few seconds; a newer one replaces it
  say(text, sub = '', secs = 4.5) {
    clear(this.notice);
    el('div', 't', this.notice, text);
    if (sub) el('div', 's muted', this.notice, sub);
    this.notice.classList.add('on');
    this._noticeT = secs;
  }

  // the recorded card: the photograph and its name
  recorded(entry) {
    clear(this.card);
    el('div', 'k', this.card, 'RECORDED');
    const img = el('img', 'photo', this.card);
    img.src = entry.photo;
    img.alt = entry.name;
    el('div', 'n', this.card, entry.name);
    el('div', 'c muted', this.card, `${entry.code} · ${entry.cls}`);
    if (entry.depth) {
      const st = stratum(entry.depth);
      const dl = el('div', 'c deep', this.card, `DEPTH ${st.numeral} · ${st.title}`);
      dl.style.color = hexCss(st.light);
    }
    el('div', 'c muted', this.card, 'Logged on the Codex computer, in the cabin');
    this.card.classList.add('on');
    this._cardT = 6;
  }

  setKeys(list) {
    const k = list.map((x) => x.join(':')).join('|');
    if (k === this._keysKey) return;
    this._keysKey = k;
    clear(this.keys);
    for (const [cap, what] of list) {
      const row = el('span', 'kr', this.keys);
      for (const c of cap.split(' ')) key(row, c);
      el('span', 'kw', row, what);
    }
  }

  // the one thing to learn next: key caps (groups, 'or' between) and a few words
  setTip(caps, text) {
    if (!caps) { this.tip.classList.remove('on'); return; }
    const k = JSON.stringify(caps) + text;
    if (k !== this._tipKey) {
      this._tipKey = k;
      clear(this.tip);
      caps.forEach((group, i) => {
        if (i) el('span', 'muted', this.tip, 'or');
        const g = el('span', 'kg', this.tip);
        for (const c of group) key(g, c);
      });
      el('span', '', this.tip, text);
    }
    this.tip.classList.add('on');
  }

  // what the seeker aboard is saying (null: nothing)
  setSpeech(who, text = '', done = false) {
    if (!who) { this.speech.classList.remove('on'); return; }
    if (this.speechWho.textContent !== who) this.speechWho.textContent = who;
    if (this.speechText.textContent !== text) this.speechText.textContent = text;
    this.speech.classList.toggle('done', done);
    this.speech.classList.add('on');
  }

  // marks over things worth finding: [{ id, x, y, label, edge }]
  setMarks(list) {
    while (this.marks.length < list.length) {
      const m = el('div', 'mk', this.root);
      m.label = el('span', 'ml', m);
      el('i', '', m);
      this.marks.push(m);
    }
    this.marks.forEach((m, i) => {
      const k = list[i];
      m.classList.toggle('on', !!k);
      if (!k) return;
      const text = k.edge === 'l' ? `◂ ${k.label}` : k.edge === 'r' ? `${k.label} ▸` : k.label;
      if (m.label.textContent !== text) m.label.textContent = text;
      m.classList.toggle('edge', !!k.edge);
      m.style.left = `${Math.round(k.x)}px`;
      m.style.top = `${Math.round(k.y)}px`;
    });
  }

  setPrompt(text, cap) {
    if (!text) { this.prompt.classList.remove('on'); return; }
    if (this._prompt !== text + cap) {
      this._prompt = text + cap;
      clear(this.prompt);
      if (cap) key(this.prompt, cap);
      el('span', '', this.prompt, text);
    }
    this.prompt.classList.add('on');
  }

  // list: the witnessed artifacts still to scan while the player is away from the ship's
  // view (null: none)
  setAlarm(list) {
    this._alarmList = list;
    if (!list || !list.length) this._waved.clear();
    const on = !!(list && list.length) && list.some((a) => !this._waved.has(a));
    if (on) {
      const n = list.length;
      const t = n > 1 ? `${n} SEEKERS MOVED` : `SEEKER #${list[0].d.lead} MOVED`;
      if (this.alarmTitle.textContent !== t) this.alarmTitle.textContent = t;
      const s = n > 1 ? 'They are rising ahead of the ship, giant. Go out and scan them before they are behind you.' : 'It is rising ahead of the ship, giant. Go out and scan it before it is behind you.';
      if (this.alarmText.textContent !== s) this.alarmText.textContent = s;
    }
    if (on !== this.alarmOn) { this.alarmOn = on; this.alarm.classList.toggle('on', on); }
  }

  // over everything, for a few seconds (unless the alert is up)
  toast(title, text, secs = 7) {
    if (this.alarmOn) return;
    this.toastTitle.textContent = title;
    this.toastText.textContent = text;
    this.toastEl.classList.add('on');
    this._toastT = secs;
  }
  hideToast() { this._toastT = 0; this.toastEl.classList.remove('on'); }
  get toastOn() { return this._toastT > 0; }

  setStatus(text, cls) {
    if (this._status === text + cls) return;
    this._status = text + cls;
    clear(this.status);
    el('i', 'dot ' + cls, this.status);
    el('span', '', this.status, text);
  }

  // field: the artifact field; cam: camera; px: pipeline; mode: game mode
  update(dt, g) {
    this._noticeT -= dt;
    if (this._noticeT <= 0) this.notice.classList.remove('on');
    this._cardT -= dt;
    if (this._cardT <= 0) this.card.classList.remove('on');
    if (this._toastT > 0) {
      this._toastT -= dt;
      // gone by itself, or once one is where it can be seen from
      if (this._toastT <= 0 || this.alarmOn || ((g.mode === 'fly' || g.mode === 'seat') && !g.terminal.open && !g.menu.open)) this.hideToast();
    }

    const f = g.field, t = f.target;
    const flying = g.mode === 'fly' || g.mode === 'seat';
    // a witnessed artifact's marks are gold
    const sp = !!(t && t.special);
    this.signal.classList.toggle('special', sp);
    this.bracket.classList.toggle('special', sp);
    // a deep one's marks are in its stratum's light
    const dp = t && t.d.depth ? stratum(t.d.depth) : null;
    if (dp !== this._dp) {
      this._dp = dp;
      for (const e of [this.signal, this.bracket]) { e.classList.toggle('deep', !!dp); if (dp) e.style.setProperty('--deep', hexCss(dp.light)); }
    }
    // the bearing strip: to the one the scanner looks at, and a smaller mark for each
    // other one still out there (a sweep's)
    const open = flying ? f.open : [];
    const at = (b) => `${(1 - (0.5 + Math.max(-1, Math.min(1, b / 1.2)) * 0.5)) * 100}%`;
    if (t && flying && (f.state === 'far' || open.length > 1)) {
      this.signal.classList.add('on');
      this.sigMark.style.left = at(t.bearing);
      this.sigMark.classList.toggle('edge', Math.abs(t.bearing) > 1.2);
      const m = `${Math.round(t.dist / 10) * 10} m`;
      this.sigLabel.textContent = open.length > 1 ? `${open.length} ${open.some((a) => a.special) ? 'WITNESSED' : 'SIGNALS'} · ${m}` : m;
    } else this.signal.classList.remove('on');
    const others = this.signal.classList.contains('on') ? open.filter((a) => a !== t) : [];
    while (this.sigOthers.length < others.length) this.sigOthers.push(el('div', 'mark other', this.signal));
    this.sigOthers.forEach((mk, i) => {
      const a = others[i];
      mk.style.display = a ? '' : 'none';
      if (!a) return;
      mk.style.left = at(a.bearing);
      mk.classList.toggle('edge', Math.abs(a.bearing) > 1.2);
    });
    // brackets
    let shown = false;
    if (t && flying && (f.state === 'near' || f.state === 'lock')) {
      const p = g.screenOf(t);
      if (p) {
        shown = true;
        const size = Math.max(14, Math.min(60, p.r));
        const u = g.ui.u;
        const x = Math.round(p.x / u) * u, y = Math.round(p.y / u) * u, s = Math.round(size) * u;
        this.bracket.style.left = `${x - s}px`;
        this.bracket.style.top = `${y - s}px`;
        this.bracket.style.width = `${s * 2}px`;
        this.bracket.style.height = `${s * 2}px`;
        this.bracket.classList.toggle('lock', f.state === 'lock');
        // low in the view (a short screen held sideways), the words go above it
        this.bracket.classList.toggle('up', y + s + u * 32 > innerHeight);
        this.brLabel.textContent = (sp ? `SEEKER #${t.d.lead} · ` : dp ? `DEPTH ${dp.numeral} · ` : '') + (f.state === 'lock' ? (f.scan > 0 ? 'SCANNING' : g.input.touchMode ? 'HOLD SCAN' : 'HOLD SPACE · SCAN') : 'STEER TO IT');
        this.brFill.style.width = `${f.scan * 100}%`;
      }
    }
    this.bracket.classList.toggle('on', shown);
    // alertness
    const a = g.alertness;
    this.alertFill.style.width = `${Math.round(a * 20) * 5}%`;
    this.alert.classList.toggle('low', a < 0.3);
    this.alert.classList.toggle('crit', a < 0.12);
    this.alertText.textContent = a < 0.3 ? 'TIRED · COFFEE IN THE CABIN' : 'ALERT';
    // plasma: the meter as long as the tank is large
    const tk = g.progress.tankSecs;
    if (tk !== this._tank) { this._tank = tk; this.fuelBar.style.width = `calc(var(--u) * ${Math.round((52 * tk) / TANK[TANK.length - 1])})`; }
    const p = g.plasmaLeft ?? 1, burning = g.ship.boost > 0.05 && !g._spent;
    this.fuelFill.style.width = `${Math.round(p * 40) * 2.5}%`;
    this.fuel.classList.toggle('burn', burning);
    this.fuel.classList.toggle('spent', !!g._spent);
    const ft = g._spent ? 'PLASMA SPENT · GATHERING' : burning ? 'PLASMA · BURNING' : 'PLASMA';
    if (this.fuelText.textContent !== ft) this.fuelText.textContent = ft;
  }
}
