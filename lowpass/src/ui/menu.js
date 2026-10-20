import { el, clear } from './dom.js';
import { clamp } from '../core/math.js';

// The title over the flying forest, and the pause menu: rows one width, the chosen one
// lit and marked with a diamond, a choice among values as one row ( < value > ), as in
// The Seeker's menus. Everything by keyboard or pointer.

export class Title {
  constructor(game) {
    this.game = game;
    this.root = el('div', 'title on', game.uiRoot);
    el('div', 'tname', this.root, 'LOW PASS');
    el('div', 'tsub', this.root, 'a slow survey flight over the fog belt');
    this.press = el('div', 'tpress', this.root, 'CLICK OR PRESS ANY KEY');
    el('div', 'tcred muted', this.root, 'Set in the universe of The Seeker · when a SEEKER NET seeker moves on chain, every ship flying sees the same light');
    this.root.addEventListener('mousedown', () => game.start());
    this.root.addEventListener('touchstart', () => game.start(), { passive: true });
  }
  hide() { this.root.classList.remove('on'); }
}

const PIXELS = ['auto', 'fine', 'standard', 'chunky'];

export class Menu {
  constructor(game) {
    this.game = game;
    this.open = false;
    this.sel = 0;
    this.page = 'main';
    this.root = el('div', 'menu', game.uiRoot);
    this.panel = el('div', 'mpanel', this.root);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.hide(); });
  }

  show() {
    this.open = true;
    this.page = 'main';
    this.sel = 0;
    this.game.paused = true;
    this.game.input.unlock();
    this.root.classList.add('on');
    this.game.audio.play('open');
    this.render();
  }

  hide() {
    this.open = false;
    this.game.paused = false;
    this.root.classList.remove('on');
    this.game.audio.play('close');
  }

  rows() {
    const g = this.game, s = g.settings;
    const pct = (k) => ({ label: k.toUpperCase(), value: `${Math.round(s[k] * 100)}`, change: (d) => { s[k] = clamp(Math.round((s[k] + d * 0.05) * 100) / 100, 0, 1); g.applySettings(); } });
    if (this.page === 'main') {
      return [
        { label: 'RESUME', act: () => this.hide() },
        { label: 'KEEP THIS MUSIC', act: () => { this.hide(); g.keepMusic(); } },
        { label: 'SAVE THE LAST MINUTE OF SOUND', act: () => { this.hide(); g.saveSound(); } },
        pct('master'), pct('music'), { ...pct('sfx'), label: 'EFFECTS' }, pct('ambience'),
        { label: 'PIXELS', value: s.pixel.toUpperCase(), change: (d) => { s.pixel = PIXELS[(PIXELS.indexOf(s.pixel) + d + PIXELS.length) % PIXELS.length]; g.applySettings(); } },
        { label: 'LIGHT SHAFTS', value: s.shafts ? 'ON' : 'OFF', change: () => { s.shafts = !s.shafts; g.applySettings(); } },
        { label: 'INTERFACE', value: s.hud ? 'ON' : 'OFF', change: () => { s.hud = !s.hud; g.applySettings(); } },
        { label: 'CONTROLS', act: () => { this.page = 'controls'; this.sel = 0; this.render(); } },
        { label: 'ABOUT', act: () => { this.page = 'about'; this.sel = 0; this.render(); } },
      ];
    }
    return [{ label: 'BACK', act: () => { this.page = 'main'; this.sel = 0; this.render(); } }];
  }

  render() {
    const p = this.panel;
    clear(p);
    el('div', 'mhead', p, this.page === 'main' ? 'PAUSED' : this.page.toUpperCase());
    if (this.page === 'controls') {
      const t = el('div', 'mtext', p);
      for (const [k, v] of [
        ['A D  ← →', 'steer (outside, and at the controls)'], ['SPACE (hold)', 'scan what is in your sights'], ['V', 'go inside the ship, or back outside'],
        ['C', 'camera: chase, far, low, cinematic'], ['W A S D, mouse', 'walk and look, inside (click to capture the mouse)'],
        ['E', 'use what is in front of you: the coffee machine, the Codex computer (on the right wall), the controls, a seeker aboard'],
        ['M', 'keep the music playing now: it will come back'], ['R', 'save the last minute of sound as a WAV file'],
        ['H', 'hide the interface'], ['ESC', 'pause'],
      ]) { const r = el('div', 'krow', t); el('span', 'kk', r, k); el('span', 'muted', r, v); }
      el('div', 'muted', t, 'Gamepad: left stick steers and walks, A scans and uses, Y switches inside and outside. Touch: hold the left or right of the screen to steer; CABIN and USE do the rest.');
    } else if (this.page === 'about') {
      const t = el('div', 'mtext', p);
      for (const line of [
        'Low Pass is set in the universe of The Seeker, an open-source sci-fi brand. It is not an official release of The Seeker.',
        'Most artifacts grow for you alone, from a seed your browser draws: no one else will ever find the same one. When a SEEKER NET seeker moves on Robinhood Chain while you fly, the next one is witnessed: seeded by the move’s transaction, the same for every ship flying then. The hour is kept by the chain’s blocks: everyone flies under the same sky. The chain is only read.',
        'Holders can bring one of their own seekers aboard from the Codex computer (connecting a wallet shares its address; nothing is signed). It hovers in the cabin and talks: every SEEKER NET trait has its own lines.',
        'The Codex board lives on public Nostr relays. Anyone can read it; holders post after one free signature that links a posting key to their address.',
        'Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY 4.0 (creativecommons.org/licenses/by/4.0). Original project: github.com/TheSeekerGame/the-seeker. Changes were made where applicable.',
        'SEEKER NET art and data from TheSeekerGame/collections, MIT OR Apache-2.0. Code adapted from Soundings and SeekerCraft (community-games), MIT OR Apache-2.0. three.js and noble-secp256k1, MIT. Tektur and The Seeker’s pixel font, SIL OFL 1.1.',
        'The collectibles are art and membership, not investments. Nothing here is financial advice.',
      ]) el('p', '', t, line);
    }
    const rows = this.rows();
    this.sel = clamp(this.sel, 0, rows.length - 1);
    const list = el('div', 'mrows', p);
    rows.forEach((r, i) => {
      const row = el('div', 'mrow' + (i === this.sel ? ' sel' : ''), list);
      el('span', 'dia', row, i === this.sel ? '◆' : '');
      el('span', 'ml', row, r.label);
      if (r.value !== undefined) {
        const v = el('span', 'mv', row);
        const l = el('button', 'arr', v, '‹');
        el('span', '', v, r.value);
        const rr = el('button', 'arr', v, '›');
        l.onclick = (e) => { e.stopPropagation(); r.change(-1); this.render(); };
        rr.onclick = (e) => { e.stopPropagation(); r.change(1); this.render(); };
      }
      row.onmouseenter = () => { if (this.sel !== i) { this.sel = i; this.render(); } };
      row.onclick = () => { if (r.act) r.act(); else if (r.change) { r.change(1); this.render(); } };
    });
  }

  keys(input) {
    const rows = this.rows();
    if (input.hit('Escape', 'KeyP', 'Pad1', 'Pad9')) { if (this.page !== 'main') { this.page = 'main'; this.render(); } else this.hide(); return; }
    let d = 0;
    if (input.hit('ArrowDown', 'KeyS', 'Pad13')) d = 1;
    if (input.hit('ArrowUp', 'KeyW', 'Pad12')) d = -1;
    if (d) { this.sel = (this.sel + d + rows.length) % rows.length; this.game.audio.play('ui', { h: 24 }); this.render(); }
    const r = rows[this.sel];
    if (r && r.change) {
      if (input.hit('ArrowRight', 'KeyD', 'Pad15')) { r.change(1); this.game.audio.play('ui', { h: 27 }); this.render(); }
      if (input.hit('ArrowLeft', 'KeyA', 'Pad14')) { r.change(-1); this.game.audio.play('ui', { h: 21 }); this.render(); }
    }
    if (r && input.hit('Enter', 'Space', 'KeyF', 'Pad0')) { if (r.act) r.act(); else r.change(1); this.game.audio.play('ui', { h: 30 }); if (this.open) this.render(); }
  }
}
