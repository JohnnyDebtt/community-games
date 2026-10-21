import { el } from './dom.js';

// On touch screens: hold the left or right of the view to steer (a mark at that edge
// shows which way), and inside, drag from anywhere on the left half to walk (a ring
// follows the thumb) and on the right half to look. Buttons appear only for what can be
// done now, named for what they do: SCAN wakes when something is in the sights and fills
// as it records; walking up to something shows what it is for (MAKE COFFEE, OPEN THE
// CODEX). Whatever the teaching line is about glows until it has been done.

const ACT = { coffee: 'MAKE COFFEE', codex: 'OPEN THE CODEX', seat: 'TAKE THE CONTROLS', companion: 'LISTEN' };

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.root = el('div', 'touch', game.uiRoot);
    const input = game.input;
    const btn = (label, cls, down, up) => {
      const b = el('button', 'tb ' + cls, this.root);
      b.label = el('span', '', b, label);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); input._any(); down(); b.classList.add('down'); }, { passive: false });
      const lift = (e) => { if (e.cancelable) e.preventDefault(); if (up) up(); b.classList.remove('down'); };
      b.addEventListener('touchend', lift, { passive: false });
      b.addEventListener('touchcancel', lift);
      return b;
    };
    this.pause = btn('II', 'pause', () => input.pressed.add('Escape'));
    this.view = btn('CABIN', 'view', () => input.pressed.add('KeyV'));
    this.cam = btn('CAMERA', 'cam', () => input.pressed.add('KeyC'));
    this.stand = btn('STAND UP', 'stand', () => input.pressed.add('KeyE'));
    this.scan = btn('SCAN', 'scan', () => { input.touch.scan = true; }, () => { input.touch.scan = false; });
    // the boost is a switch here: the thumbs are busy steering and scanning
    this.boost = btn('BOOST', 'boost', () => { input.touch.boost = !input.touch.boost; });
    this.scanFill = el('i', 'fill', this.scan);
    this.act = btn('', 'act', () => input.pressed.add('KeyE'));
    this.left = el('div', 'steer l', this.root);
    this.right = el('div', 'steer r', this.root);
    this.stick = el('div', 'stick', this.root);
    this.knob = el('i', '', this.stick);
    // what the seeker aboard says goes on with a tap on its words
    game.hud.speech.addEventListener('touchstart', (e) => { e.preventDefault(); input._any(); input.pressed.add('KeyE'); }, { passive: false });
  }

  update() {
    const g = this.game, input = g.input, t = input.touch, m = g.mode;
    this.root.classList.toggle('on', input.touchMode);
    if (!input.touchMode) return;
    const overlay = g.terminal.open || g.menu.open;
    this.root.classList.toggle('hide', m === 'title' || m === 'coffee' || overlay);
    const flying = m === 'fly' || m === 'seat';
    const show = (b, on) => b.classList.toggle('off', !on);
    const text = (b, s) => { if (b.label.textContent !== s) b.label.textContent = s; };
    show(this.scan, flying);
    show(this.boost, flying);
    if (!flying || overlay) input.touch.boost = false;
    this.boost.classList.toggle('lit', input.touch.boost && !g._spent);
    this.boost.classList.toggle('far', !!g._spent);
    show(this.cam, m === 'fly');
    show(this.stand, m === 'seat');
    text(this.view, m === 'fly' ? 'CABIN' : 'OUTSIDE');
    // what one faces comes first; else the seeker aboard's NEXT
    const station = g._spot && g._spot.id !== 'companion';
    const act = m !== 'walk' ? '' : station ? ACT[g._spot.id] || g._spot.label.toUpperCase() : g.companion.talking ? 'NEXT' : g._spot ? ACT[g._spot.id] : '';
    show(this.act, !!act);
    if (act) text(this.act, act);
    // the scan button sleeps until something is in the sights, then fills as it records
    const f = g.field;
    this.scan.classList.toggle('ready', flying && f.state === 'lock');
    this.scan.classList.toggle('far', flying && f.state !== 'lock' && f.state !== 'near');
    this.scanFill.style.width = `${Math.round(f.scan * 100)}%`;
    // what the teaching line is about
    const tip = g.tips.shown;
    const hint = tip ? tip.btn : null;
    for (const [k, b] of [['view', this.view], ['cam', this.cam], ['stand', this.stand], ['boost', this.boost]]) b.classList.toggle('hint', hint === k);
    // steering: a mark at the edge being held; both, softly, while steering is taught
    const teachSteer = flying && tip && tip.id === 'steer';
    this.left.classList.toggle('on', flying && t.steer < 0);
    this.right.classList.toggle('on', flying && t.steer > 0);
    this.left.classList.toggle('hint', teachSteer && t.steer >= 0);
    this.right.classList.toggle('hint', teachSteer && t.steer <= 0);
    // walking: the ring where the thumb landed; a resting one while walking is taught
    const R = input.stickR;
    if (m === 'walk' && t.moveId !== null && !overlay) {
      this._place(t.mx, t.my, R, 'on');
      const dx = t.move.x * R, dy = t.move.y * R;
      this.knob.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
    } else if (m === 'walk' && tip && tip.id === 'walk' && !overlay) {
      this._place(innerWidth * 0.2, innerHeight * 0.68, R, 'ghost');
      this.knob.style.transform = '';
    } else this._place(0, 0, R, '');
  }

  _place(x, y, R, state) {
    const s = this.stick;
    s.classList.toggle('on', state === 'on');
    s.classList.toggle('ghost', state === 'ghost');
    if (!state) return;
    s.style.left = `${Math.round(x - R)}px`;
    s.style.top = `${Math.round(y - R)}px`;
    s.style.width = s.style.height = `${Math.round(R * 2)}px`;
  }
}
