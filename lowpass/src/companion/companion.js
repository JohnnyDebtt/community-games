import * as THREE from 'three';
import { SeekerModel } from './bot.js';
import { Voice, stateLines } from './dialogue.js';
import * as Art from '../chain/art.js';
import { load, save, remove } from '../core/store.js';
import { pitch } from '../core/tuning.js';
import { dampAngle, hash1 } from '../core/math.js';

// One of your SEEKER NET seekers, aboard: brought into the cabin from the Codex computer
// (SEEKERS) once your wallet has shared its address, and only one at a time. It hovers
// by the right wall, a little forward of the computer, out of the way, turning to watch
// you when you are near. Walk up and press E and it talks: a few lines from its own deck
// (dialogue.js), typed out to a soft murmur of its own notes. Now and then it says
// something unasked when you pass. Its look is its live state: dormant seekers are dark,
// lit by stage, with their battery on the screen; activated ones are bright and blink.
//
// It stays aboard in this browser while the address that brought it still holds it
// (checked on Robinhood Chain, read only, when the game starts).

export const HOME = new THREE.Vector3(-1.95, 1.6, 2.65);   // ship space
const CHARS_PER_SEC = 34;
const DAY = 86400000;

export function lookOf(st) {
  if (!st) return { activated: false, stage: 1 };
  const charge = st.charge + (st.status === 0 ? (50 * (Date.now() - st.at)) / DAY : 0);
  if (st.status === 1 || st.status === 2 || charge >= 9000) return { activated: true, charge };
  return { activated: false, stage: Math.min(Math.floor((charge * 6) / 9000), 5) + 1, charge };
}

export class Companion {
  constructor(game) {
    this.game = game;
    this.token = 0;
    this.address = null;
    this.model = null;
    this.look = null;
    this.voice = null;
    this.say = null;            // { lines, i, shown, hold }
    this.remarkAt = 0;
    this.greeted = false;
    this.facing = 0;
    this._home = HOME.clone();
    this.onChange = null;
    const saved = load('companion', null);
    if (saved && saved.token && saved.address) this.deploy(saved.token, saved.address, { quiet: true, look: saved.look, verify: true });
  }

  get deployed() { return !!this.token; }
  get talking() { return !!this.say; }

  // Bring a seeker aboard (replacing any other). address: the wallet that holds it.
  async deploy(token, address, opts = {}) {
    const g = this.game;
    if (this.token && this.token !== token) this._clear();
    this.token = token;
    this.address = address.toLowerCase();
    this.look = opts.look || this.look || { activated: false, stage: 1 };
    save('companion', { token, address: this.address, look: this.look });
    await Art.loadMeta();
    this.voice = new Voice(token, Art.info(token).traits);
    await this._build();
    if (!opts.quiet) {
      g.hud.say(`SEEKER #${token} IS ABOARD`, `It hovers by the Codex computer. Walk up ${g.input.touchMode ? 'to it' : 'and press E'} to listen.`, 5);
      g.audio.play('send');
      this.greeted = false;
    } else this.greeted = true;
    this._spot();
    if (this.onChange) this.onChange();
    // its live state, and whether the address still holds it
    this.refresh(opts.verify);
  }

  async refresh(verify = false) {
    const g = this.game, token = this.token;
    if (!token) return;
    try {
      if (verify) {
        const owner = await g.chain.ownerOf(token);
        if (token !== this.token) return;
        if (owner !== this.address) { this.recall(`SEEKER #${token} HAS LEFT THE SHIP`, 'Its address no longer holds it.'); return; }
      }
      const [st] = await g.chain.tokens([token]);
      if (token !== this.token) return;
      this.state = st;
      const look = lookOf(st);
      const changed = !this.look || look.activated !== this.look.activated || look.stage !== this.look.stage;
      this.look = look;
      save('companion', { token, address: this.address, look });
      if (changed) await this._build();
    } catch { /* offline: it keeps the look it had */ }
  }

  recall(title = null, sub = '') {
    const g = this.game, token = this.token;
    this._clear();
    remove('companion');
    if (title) g.hud.say(title, sub, 4.5);
    else if (token) g.hud.say(`SEEKER #${token} RETURNED`, 'The cabin is quiet again.', 3.5);
    if (this.onChange) this.onChange();
  }

  _clear() {
    const g = this.game;
    if (this.model) { g.interior.group.remove(this.model.root); this.model.dispose(); }
    this.model = null;
    this.token = 0;
    this.say = null;
    g.hud.setSpeech(null);
    g.interior.spots = g.interior.spots.filter((s) => s.id !== 'companion');
  }

  async _build() {
    const token = this.token;
    const m = new SeekerModel();
    const ok = await m.build(token, this.look.activated ? { activated: true } : { activated: false, stage: this.look.stage });
    if (!ok || token !== this.token) { m.dispose(); return; }
    if (this.model) { this.game.interior.group.remove(this.model.root); this.model.dispose(); }
    this.model = m;
    m.root.position.copy(this._home);
    this.game.interior.group.add(m.root);
  }

  _spot() {
    const I = this.game.interior;
    I.spots = I.spots.filter((s) => s.id !== 'companion');
    I.spots.push({ id: 'companion', at: new THREE.Vector3(this._home.x, 1.2, this._home.z), label: `Listen to SEEKER #${this.token}`, r: 2.3 });
  }

  // ---------------------------------------------------------------- talking
  _ctx() {
    const g = this.game;
    return {
      night: g.atmo.night > 0.5,
      tired: g.alertness < 0.3,
      scans: g.codex.length,
      witnessed: g._witnessedAt !== undefined ? g.time - g._witnessedAt : null,
    };
  }

  talk() {
    if (!this.voice) return;
    const st = this.look ? { activated: this.look.activated, stage: this.look.stage, charge: this.look.charge ?? 0 } : null;
    this._speak(this.voice.monologue(st, this._ctx()));
    this.game.tips.learn('companion');
  }

  _speak(lines) {
    this.say = { lines, i: 0, shown: 0, hold: 0 };
    this.remarkAt = this.game.time + 120 + Math.random() * 120;
  }

  // E while it talks: finish the line, or go on to the next
  advance() {
    const s = this.say;
    if (!s) return;
    const line = s.lines[s.i];
    if (s.shown < line.length) { s.shown = line.length; s.hold = 0; return; }
    s.i++;
    s.shown = 0;
    s.hold = 0;
    if (s.i >= s.lines.length) this.say = null;
  }

  // ---------------------------------------------------------------- each frame
  update(dt, time) {
    const g = this.game, m = this.model;
    const hud = g.hud;
    if (!m) { hud.setSpeech(null); return; }
    const inside = g.mode === 'walk' || g.mode === 'seat' || g.mode === 'coffee';
    // where the player is, in ship space
    let px = 0, pz = 6.4, near = Infinity;
    if (g.mode === 'walk') { px = g.fp.x; pz = g.fp.z; }
    const dx = px - this._home.x, dz = pz - this._home.z;
    near = Math.hypot(dx, dz);
    // it hovers, breathing slowly on the 12 fps grid, and turns to watch you
    const tq = Math.floor(time * 12) / 12;
    const seed = hash1(this.token) * 100;
    m.root.position.set(this._home.x, this._home.y + Math.sin(tq * 1.3 + seed) * 0.025, this._home.z);
    const want = g.mode === 'walk' && near < 7 ? Math.atan2(dx, dz) : Math.atan2(0 - this._home.x, 4 - this._home.z);
    this.facing = dampAngle(this.facing, want, 2.5, dt);
    m.root.rotation.y = Math.round(this.facing / 0.05) * 0.05;
    const side = Math.sin(Math.atan2(dx, dz) - this.facing);
    m.speaking = this.say ? 1 : 0;
    m.update(dt, time, Math.floor(time * 12), g.mode === 'walk' ? side : 0);

    // a remark when you come near, now and then (and a hello the first time)
    if (!this.say && g.mode === 'walk' && near < 3.6 && !g.terminal.open && !g.menu.open && !g.reader.open) {
      if (!this.greeted) {
        this.greeted = true;
        const st = this.look ? { activated: this.look.activated, stage: this.look.stage, charge: this.look.charge ?? 0 } : null;
        this._speak([`SEEKER #${this.token} online. Hello, ship. Hello, you.`, g.input.touchMode ? 'I will be over here. Tap LISTEN if you want to hear me think.' : 'I will be over here. Press E if you want to hear me think.', ...(st ? [stateLines(this.token, st, this._ctx())[0]] : [])]);
      } else if (time > this.remarkAt) {
        const st = this.look ? { activated: this.look.activated, stage: this.look.stage, charge: this.look.charge ?? 0 } : null;
        this._speak(this.voice.remark(st, this._ctx()));
      }
    }

    // the words, typed out with a soft murmur; they stop if you walk away
    const s = this.say;
    if (s && (!inside || g.mode !== 'walk' || near > 7)) { this.say = null; }
    if (this.say && g.mode === 'walk') {
      const line = s.lines[s.i];
      if (s.shown < line.length) {
        const before = Math.floor(s.shown);
        s.shown = Math.min(line.length, s.shown + dt * CHARS_PER_SEC);
        for (let k = before; k < Math.floor(s.shown); k++) if (k % 3 === 0 && /[a-z0-9]/i.test(line[k])) this._blip(line, k);
      } else {
        s.hold += dt;
        if (s.hold > 2.2 + line.length / 26) this.advance();
      }
      if (this.say) hud.setSpeech(`SEEKER #${this.token}`, line.slice(0, Math.floor(s.shown)), s.shown >= line.length);
      else hud.setSpeech(null);
    } else hud.setSpeech(null);
  }

  // its murmur: soft, low notes of its own small scale, one every few letters
  _blip(line, k) {
    const a = this.game.audio;
    if (!a.ready) return;
    const h = hash1(this.token);
    const scale = [0, 2, 3, 4].map((d) => d + Math.floor(h * 5));
    const d = scale[(line.charCodeAt(k) + k) % scale.length];
    a.note(pitch(d, 2 + (h > 0.5 ? 1 : 0)), { wave: 'soft', attack: 0.008, release: 0.1, gain: 0.024, cutoff: 1200, dest: a.sfx, verb: 0.12, pan: this._pan() });
  }

  _pan() {
    const g = this.game;
    const w = this._home.clone();
    g.interior.group.localToWorld(w);
    w.applyMatrix4(g.cams.cam.matrixWorldInverse);
    return Math.max(-0.8, Math.min(0.8, w.x / Math.max(0.5, -w.z)));
  }
}
