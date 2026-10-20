import { el } from './dom.js';

// The first moments: a dark screen, a pale mark breathing, the name, a thin line that
// fills as the forest is grown and the hour is read from the chain, so the game opens
// already at the hour everyone shares, and never jumps to it.

export class Boot {
  constructor(root) {
    this.root = el('div', 'boot', root);
    el('i', 'bmark', this.root);
    el('div', 'bname', this.root, 'LOW PASS');
    this.bar = el('div', 'bbar', this.root);
    this.fill = el('i', '', this.bar);
    this.line = el('div', 'bline', this.root, '');
    // the words wait for their font, so nothing shows in the wrong one
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.root.classList.add('fonts'));
    else this.root.classList.add('fonts');
  }

  // progress 0..1 and what is happening
  step(k, words) {
    this.fill.style.width = `${Math.round(Math.min(1, k) * 100)}%`;
    if (words !== undefined) this.line.textContent = words;
  }

  done() {
    this.step(1);
    this.root.classList.add('gone');
    setTimeout(() => this.root.remove(), 1200);
  }
}
