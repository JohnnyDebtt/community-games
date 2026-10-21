import * as THREE from 'three';
import { load, save } from '../core/store.js';

// Teaching, one thing at a time. A quiet line above the keys says what to press for the
// next thing the player has not yet done, until it has been done once (remembered in this
// browser); inside, small marks hang over the coffee machine and the Codex computer until
// each has been used. The keys that work right now sit along the bottom for a while
// after each change of place, and come back when a key that does nothing here is pressed.
// On a touch screen the same lessons name the buttons on screen instead of keys (and say
// which one, so it can glow), and there is no row of keys.

const QUIET = new Set(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'ShiftLeft', 'ShiftRight', 'Mouse0', 'Mouse1', 'Mouse2', 'Tap']);

export class Tips {
  constructor(game) {
    this.g = game;
    this.learned = load('learned', {});
    this.cur = null;
    this.shown = null;    // the tip on screen now
    this.on = 0;          // seconds the current tip has been up
    this.rest = {};       // tip id → seconds before it may come back
    this.inMode = 0;
    this.mode = null;
    this.steered = 0;
    this.walked = 0;
    this._v = new THREE.Vector3();
  }

  has(k) { return !!this.learned[k]; }

  learn(k) {
    if (this.learned[k]) return;
    this.learned[k] = Date.now();
    save('learned', this.learned);
  }

  // what to say now: { id, caps: [[key, ...], ...], text, on (secs up), off (secs away),
  // btn (on touch: the button it is about) }
  pick() {
    const g = this.g, L = this.learned, t = this.inMode, touch = g.input.touchMode;
    if (g.mode === 'fly' || g.mode === 'seat') {
      const f = g.field;
      if (f.state === 'near' || f.state === 'lock') return null;   // the brackets say it
      if (!L.steer) return t > 1.5 ? (touch ? { id: 'steer', caps: [], text: 'hold the left or right side of the screen to steer' } : { id: 'steer', caps: [['A', 'D'], ['←', '→']], text: 'steer' }) : null;
      if (g.alertness < 0.3) {
        if (touch) return g.mode === 'fly' ? { id: 'tired', caps: [['CABIN']], text: 'tired: go inside and make coffee', on: 9, off: 35, btn: 'view' } : { id: 'tired', caps: [['STAND UP']], text: 'tired: go and make coffee', on: 9, off: 35, btn: 'stand' };
        return g.mode === 'fly'
          ? { id: 'tired', caps: [['V']], text: 'tired: go inside and make coffee', on: 9, off: 35 }
          : { id: 'tired', caps: [['E']], text: 'tired: stand up and make coffee', on: 9, off: 35 };
      }
      if (f.state === 'far' && !L.scan) return { id: 'signal', caps: [], text: 'a signal: steer toward the mark along the top', on: 8, off: 30 };
      if (!L.boost && t > 8) return { id: 'boost', caps: touch ? [['BOOST']] : [['W'], ['↑']], text: 'fly faster', on: 8, off: 60, btn: 'boost' };
      if (g.mode === 'fly' && !L.cabin && t > 16) return { id: 'cabin', caps: [[touch ? 'CABIN' : 'V']], text: 'step inside the ship', on: 10, off: 45, btn: 'view' };
      if (g.mode === 'fly' && L.cabin && !L.camera && t > 45) return { id: 'camera', caps: [[touch ? 'CAMERA' : 'C']], text: 'change the camera', on: 7, off: 150, btn: 'cam' };
      if (g.mode === 'seat' && !L.stand && t > 5) return touch ? { id: 'stand', caps: [['STAND UP']], text: 'walk around the cabin', on: 8, off: 60, btn: 'stand' } : { id: 'stand', caps: [['E']], text: 'stand up', on: 8, off: 60 };
    } else if (g.mode === 'walk') {
      // the prompt (or the seeker) says it; the controls, right in front as you come in,
      // do not stop the lessons
      if (g.companion.talking || (g._spot && g._spot.id !== 'seat')) return null;
      if (!L.walk) return t > 0.8 ? (touch ? { id: 'walk', caps: [], text: 'drag on the left to walk, on the right to look around' } : { id: 'walk', caps: [['W', 'A', 'S', 'D']], text: 'walk · drag the mouse to look' }) : null;
      if (!L.coffee || g.alertness < 0.3) return { id: 'coffee', caps: [], text: touch ? 'walk up to the coffee machine' : 'walk to the coffee machine, then press E', on: 10, off: 20 };
      if (g.companion.deployed && !L.companion && !g.companion.talking) return { id: 'companion', caps: [], text: `SEEKER #${g.companion.token} is aboard: walk up to it ${touch ? 'to listen' : 'and press E to listen'}`, on: 10, off: 30 };
      if (!L.codex) return { id: 'codex', caps: [], text: touch ? 'the Codex computer keeps your scans: walk up to it' : 'the Codex computer keeps your scans: walk to it, then press E', on: 10, off: 20 };
      if (!L.outside && t > 25) return { id: 'outside', caps: [[touch ? 'OUTSIDE' : 'V']], text: 'back outside', on: 8, off: 60, btn: 'view' };
    }
    return null;
  }

  update(dt, overlay) {
    const g = this.g, input = g.input;
    if (g.mode !== this.mode) { this.mode = g.mode; this.inMode = 0; g._keysShown = g.time; }
    this.inMode += dt;
    for (const k in this.rest) this.rest[k] -= dt;
    // a key that does nothing here brings the keys back for a while
    for (const k of input.pressed) if (!QUIET.has(k) && g.mode !== 'title') { g._keysShown = Math.max(g._keysShown || 0, g.time - 12); break; }
    // the steering and the walking, learned by doing
    if (g.mode === 'fly' || g.mode === 'seat') {
      if (Math.abs(input.steer()) > 0.3 && !overlay) this.steered += dt;
      if (this.steered > 0.7) this.learn('steer');
    }
    if (g.mode === 'walk' && g.fp) {
      this.walked += Math.abs(g.fp.bob) > 0.5 ? dt : 0;
      if (this.walked > 1.2) this.learn('walk');
    }

    let tip = overlay || g.asleep ? null : this.pick();
    if (tip && (this.rest[tip.id] || 0) > 0) tip = null;
    if (tip && tip.id !== this.cur) { this.cur = tip.id; this.on = 0; }
    if (tip) {
      this.on += dt;
      if (tip.on && this.on > tip.on) { this.rest[tip.id] = tip.off; tip = null; this.cur = null; }
    } else this.cur = null;
    this.shown = tip;
    g.hud.setTip(tip ? tip.caps : null, tip ? tip.text : '');
    g.hud.setMarks(overlay || g.mode !== 'walk' ? [] : this.marks());
  }

  // marks over the things inside that have not yet been used (and over the coffee
  // machine whenever the player is tired), in CSS pixels; at the edge when out of view
  marks() {
    const g = this.g, L = this.learned, out = [];
    const cam = g.cams.cam, o = g.px.origin;
    const W = g.px.width * o.css, H = g.px.height * o.css;
    for (const s of g.interior.spots) {
      const want = s.id === 'coffee' ? !L.coffee || g.alertness < 0.3 : s.id === 'codex' ? !L.codex && L.coffee : s.id === 'companion' ? !L.companion : false;
      if (!want || g._spot === s) continue;
      const v = this._v.copy(s.at);
      v.y += 0.55;
      g.interior.group.localToWorld(v);
      const view = v.clone().applyMatrix4(cam.matrixWorldInverse);
      v.project(cam);
      const behind = view.z > 0;
      let x = (v.x * 0.5 + 0.5) * W, y = (0.5 - v.y * 0.5) * H;
      let edge = null;
      if (behind || x < W * 0.06 || x > W * 0.94) {
        // out of view: at the side it is nearer to turn toward
        const right = behind ? view.x > 0 : x > W / 2;
        edge = right ? 'r' : 'l';
        x = right ? W * 0.94 : W * 0.06;
        y = H * 0.5;
      }
      y = Math.max(H * 0.12, Math.min(H * 0.8, y));
      out.push({ id: s.id, x: o.x + x, y: o.y + y, label: s.id === 'coffee' ? 'COFFEE' : s.id === 'codex' ? 'CODEX' : `SEEKER #${g.companion.token}`, edge });
    }
    return out;
  }
}
