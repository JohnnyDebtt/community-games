import { el, clear, key } from './dom.js';

// The HUD: as little as the flight needs. A bearing to the signal along the top while it
// is out in the fog; brackets around it once it is near, and the scan's hold beneath
// them; the alertness meter; one notice at a time; the keys that work right now.

export class Hud {
  constructor(root) {
    this.root = el('div', 'hud', root);
    this.signal = el('div', 'signal', this.root);
    this.sigMark = el('div', 'mark', this.signal);
    this.sigLabel = el('div', 'label', this.signal);
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

    const f = g.field, t = f.target;
    const flying = g.mode === 'fly' || g.mode === 'seat';
    // a witnessed artifact's marks are gold
    const sp = !!(t && t.special);
    this.signal.classList.toggle('special', sp);
    this.bracket.classList.toggle('special', sp);
    // the bearing strip
    if (t && flying && f.state === 'far') {
      const w = 0.5 + Math.max(-1, Math.min(1, t.bearing / 1.2)) * 0.5;
      this.signal.classList.add('on');
      this.sigMark.style.left = `${(1 - w) * 100}%`;
      const off = Math.abs(t.bearing) > 1.2;
      this.sigMark.classList.toggle('edge', off);
      this.sigLabel.textContent = `${Math.round(t.dist / 10) * 10} m`;
    } else this.signal.classList.remove('on');
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
        this.brLabel.textContent = (sp ? 'WITNESSED · ' : '') + (f.state === 'lock' ? (f.scan > 0 ? 'SCANNING' : 'HOLD SPACE · SCAN') : 'STEER TO IT');
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
  }
}
