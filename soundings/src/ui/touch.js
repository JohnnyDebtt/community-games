import { h } from './dom.js';

// Touch controls: a floating stick on the left half, buttons on the right, and a depth
// strip while fishing. Shown once a touch is seen.

export class TouchControls {
  constructor(root, game) {
    this.g = game;
    this.el = h('div', { class: 'touch hidden' });
    root.append(this.el);
    this.stick = h('div', { class: 'stick hidden' }, h('i'));
    this.el.append(this.stick);
    const btn = (label, action, style, cls = '') => {
      const b = h('div', { class: 'btn ' + cls, style, role: 'button', 'aria-label': label }, label);
      const down = (e) => { e.preventDefault(); e.stopPropagation(); b.classList.add('on'); game.input.virtual(action, true); game.audio.unlock(); };
      const up = (e) => { e.preventDefault(); b.classList.remove('on'); game.input.virtual(action, false); };
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
      this.el.append(b);
      return b;
    };
    const u = (n) => `calc(var(--u) * ${n})`;
    this.action = btn('jig', 'action', { right: u(10), bottom: u(12) }, 'big');
    this.interact = btn('use', 'interact', { right: u(52), bottom: u(14) }, '');
    this.od = btn('od', 'overdrive', { right: u(52), bottom: u(50) }, 'small');
    this.back = btn('back', 'back', { right: u(14), bottom: u(54) }, 'small');
    this.codex = btn('codex', 'codex', { left: u(6), bottom: u(36) }, 'small');
    this.net = btn('net', 'net', { left: u(32), bottom: u(36) }, 'small');
    this.depth = h('div', { class: 'depth hidden', style: { right: '150px', top: '22%', height: '50%' } }, h('div', { class: 'cap', style: { textAlign: 'center', marginTop: '6px' } }, 'depth'));
    this.el.append(this.depth);
    let last = null;
    this.depth.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); last = e.clientY; this.depth.setPointerCapture(e.pointerId); });
    this.depth.addEventListener('pointermove', (e) => {
      if (last === null) return;
      const dy = e.clientY - last;
      last = e.clientY;
      if (game.fishing.active) game.fishing.adjustDepth(dy * 0.12);
    });
    const end = () => { last = null; };
    this.depth.addEventListener('pointerup', end);
    this.depth.addEventListener('pointercancel', end);

    game.input.onTouchStick = (t) => {
      if (!t) { this.stick.classList.add('hidden'); return; }
      this.stick.classList.remove('hidden');
      this.stick.style.left = `${t.x0}px`;
      this.stick.style.top = `${t.y0}px`;
      const k = this.stick.firstChild;
      k.style.transform = `translate(calc(-50% + ${game.input.touchStick.x * 28}px), calc(-50% + ${game.input.touchStick.y * 28}px))`;
    };
    this.on = false;
    addEventListener('touchstart', () => this.enable(), { passive: true, once: true });
  }

  enable() {
    this.on = true;
    this.el.classList.remove('hidden');
    document.body.classList.add('touch-on');
  }

  update(mode) {
    if (!this.on) return;
    const fishing = mode === 'fish';
    this.depth.classList.add('hidden');            // casting sets the depth now
    this.interact.classList.toggle('hidden', fishing);
    const f = this.g.fishing;
    const label = !fishing ? 'run' : f.state === 'bite' ? 'hook!' : f.state === 'reel' ? 'reel' : f.state === 'ready' || f.state === 'cast' ? 'cast' : 'jig';
    if (this._label !== label) {
      this._label = label;
      this.action.textContent = label;
    }
    const action = fishing ? 'action' : 'run';
    if (this._act !== action) {
      this._act = action;
      // walking: the big button runs; fishing: it jigs, strikes and reels
      const b = this.action;
      const nb = b.cloneNode(true);
      b.replaceWith(nb);
      this.action = nb;
      const down = (e) => { e.preventDefault(); e.stopPropagation(); nb.classList.add('on'); this.g.input.virtual(action, true); };
      const up = (e) => { e.preventDefault(); nb.classList.remove('on'); this.g.input.virtual(action, false); };
      nb.addEventListener('pointerdown', down);
      nb.addEventListener('pointerup', up);
      nb.addEventListener('pointercancel', up);
      nb.addEventListener('pointerleave', up);
    }
    this.el.classList.toggle('hidden', mode === 'title' || mode === 'window');
  }
}
