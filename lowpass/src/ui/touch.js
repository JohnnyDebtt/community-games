import { el } from './dom.js';

// On touch screens: hold the left or right of the view to steer (or, inside, drag the
// left half to walk and the right half to look), and a few buttons for the rest.

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.on = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.root = el('div', 'touch', game.uiRoot);
    if (!this.on) return;
    this.root.classList.add('on');
    const input = game.input;
    const btn = (label, cls, down, up) => {
      const b = el('button', 'tb ' + cls, this.root, label);
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); game.audio.unlock(); down(); b.classList.add('down'); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); if (up) up(); b.classList.remove('down'); }, { passive: false });
      b.addEventListener('touchcancel', () => { if (up) up(); b.classList.remove('down'); });
      return b;
    };
    this.scan = btn('SCAN', 'scan', () => { input.touch.scan = true; }, () => { input.touch.scan = false; });
    this.view = btn('CABIN', 'view', () => input.pressed.add('KeyV'));
    this.use = btn('USE', 'use', () => input.pressed.add('KeyE'));
    this.pause = btn('II', 'pause', () => input.pressed.add('Escape'));
  }

  update() {
    if (!this.on) return;
    const m = this.game.mode;
    const overlay = this.game.terminal.open || this.game.menu.open;
    this.root.classList.toggle('hide', m === 'title' || m === 'coffee' || overlay);
    this.scan.style.display = m === 'fly' || m === 'seat' ? '' : 'none';
    this.use.style.display = m === 'walk' || m === 'seat' ? '' : 'none';
    this.view.textContent = m === 'fly' ? 'CABIN' : 'OUTSIDE';
  }
}
