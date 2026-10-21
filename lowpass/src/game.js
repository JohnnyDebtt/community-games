import * as THREE from 'three';
import { Pipeline, FOG, POST } from './render/pipeline.js';
import { U } from './render/materials.js';
import { World } from './world/chunks.js';
import { Atmosphere } from './world/atmosphere.js';
import { Ship } from './ship/ship.js';
import { Interior } from './ship/interior.js';
import { Seeker } from './ship/seeker.js';
import { CoffeeScene } from './ship/coffee.js';
import { Cameras } from './ship/camera.js';
import { Input } from './core/input.js';
import { Audio, BPM } from './core/audio.js';
import { load, save, codexAll, codexPut } from './core/store.js';
import { clamp, damp } from './core/math.js';
import { Chain } from './chain/chain.js';
import { MoveWatcher } from './chain/moves.js';
import { ChainClock } from './chain/clock.js';
import * as art from './chain/art.js';
import { Field } from './artifacts/field.js';
import { takePhoto } from './artifacts/photo.js';
import { GENERATOR_VERSION } from './artifacts/generate.js';
import { Hud } from './ui/hud.js';
import { Terminal } from './ui/terminal.js';
import { Menu, Title } from './ui/menu.js';
import { TouchControls } from './ui/touch.js';
import { Tips } from './ui/tips.js';
import { Companion } from './companion/companion.js';
import { Boot } from './ui/boot.js';

// Low Pass: the flight, the cabin, the coffee, the Codex. One frame loop, a few modes:
//   title   the forest from cinematic angles until a key is pressed
//   fly     outside, behind the ship: steer, scan
//   walk    inside, on foot: the coffee machine, the Codex computer, the controls
//   seat    inside, at the controls: steer and scan through the windshield
//   coffee  the coffee scene
// The Codex computer (terminal) and the pause menu lie over whichever mode is current.

const DECAY = 1 / 600;          // alertness lost a second: full to empty in ten minutes
const WILD_GAP = [60, 110];      // seconds between artifacts, after the last is behind
const WAVE = 12;                 // a sweep's artifacts at once, at most (the rest come next)
const VOICES = 4;                // artifacts heard at once, the nearest
const WALK = 2.0, RUN = 3.3;
const EYE = 1.58;

export class Game {
  async init() {
    const canvas = document.getElementById('game');
    const q = new URLSearchParams(location.search);
    this.dev = q.has('dev');
    this.stats = q.has('stats');
    this.px = new Pipeline(canvas);
    this.px.renderer.info.autoReset = false;
    this.scene = new THREE.Scene();
    this.world = new World(this.scene);
    FOG.tCanopy.value = this.world.canopy.texture;
    this.atmo = new Atmosphere();
    this.ship = new Ship(this.scene, this.world);
    this.interior = new Interior(this.ship);
    this.seeker = new Seeker(this.interior.group);
    this.cams = new Cameras(this.px.width / this.px.height);
    this.input = new Input(canvas);
    this.audio = new Audio();
    this.world.onShift = (dx, dz) => this.cams.shift(dx, dz);

    // the interface shares the world's pixel
    this.uiRoot = document.getElementById('ui');
    this.ui = { u: 3 };
    const onResize = (w, h) => {
      this.cams.setAspect(w / h);
      this.ui.u = this.px.uiUnit || 3;
      document.documentElement.style.setProperty('--u', `${this.ui.u}px`);
      this.input.stickR = Math.round(this.ui.u * 30);
    };
    this.px.onResize = onResize;
    onResize(this.px.width, this.px.height);
    // the loading screen, until the forest is grown and the hour is read from the chain
    this.boot = new Boot(this.uiRoot);
    this.boot.step(0.05, '');
    this.hud = new Hud(this.uiRoot);
    this.hud.onAlarm = () => this.goOutside();
    this.tips = new Tips(this);
    this.terminal = new Terminal(this);
    this.menu = new Menu(this);
    this.title = new Title(this);
    this.touch = new TouchControls(this);
    // touch or keys: the hints and buttons follow whichever was used last
    const touchMode = (on) => {
      document.documentElement.classList.toggle('touchmode', on);
      this.title.setTouch(on);
      if (this.menu.open) this.menu.render();
    };
    this.input.onMode = touchMode;
    touchMode(this.input.touchMode);
    document.addEventListener('fullscreenchange', () => { if (this.menu.open) this.menu.render(); });

    // SEEKER NET: the clock, the moves, the art
    this.chain = new Chain();
    this.clock = new ChainClock();
    this.atmo.clock = this.clock;
    this.moves = new MoveWatcher(this.chain, this.clock);
    // the hour: asked of the chain at once (the loading screen waits for it); the shipped
    // snapshot is the fallback when the chain does not answer
    const seeded = fetch('assets/moves.json').then((r) => r.json()).then((s) => this.clock.seed(s.block, s.at)).catch(() => {});
    if (!q.has('offline')) this.moves.start();
    else this.moves.status = 'offline';
    art.loadMeta().then(() => { this.artReady = true; }).catch(() => {});
    this.field = new Field(this);
    this.field.onAppear = (a) => this._appear(a);
    this.field.onWave = (list) => this._appear(list[0], list);
    this.field.onScanned = (a) => this._scanned(a);
    // one missed alone is said; a sweep's, quietly (there were more than one could scan)
    this.field.onMissed = (a) => { if (!a.wave) this.hud.say('LOST IN THE FOG', 'It has gone back into the fog', 4); };
    this.field.onGate = (a, n) => { for (let i = 0; i < n; i++) this.audio.play('gate', { i: a.pass + i }); };
    // a seeker moved while you fly: the next artifact is its witnessed one; a wild one
    // still out of sight gives way to it at once
    this.moves.onMove = () => {
      this.atmo.networkPulse(0.6);
      const p = this.field.pending;
      if (p && !p.special && !p.revealed && !p.building && this.mode !== 'title') { this.field.remove(p); this.field.next = 0.5; }
      else if (!p) this.field.next = Math.min(this.field.next, 6);
    };
    this.moves.onActivated = () => this.atmo.networkPulse(1.2);
    this.coffee = new CoffeeScene(this);
    // a seeker brought aboard from the Codex computer, if any
    this.companion = new Companion(this);
    // music the player kept comes back; kept in this browser
    this.audio.kept = load('music.kept', []);
    this.audio.onKept = (k) => save('music.kept', k);

    // saved state
    const s = load('state', {});
    this.alertness = s.alertness ?? 0.6;
    this.warm = 0;
    this.stats_ = s.stats || { cups: 0, scans: 0, distance: 0 };
    const saved = load('settings', {});
    if ((saved.v || 0) < 2) delete saved.ambience;   // the beds were remade quieter
    this.settings = Object.assign({ master: 0.85, music: 0.85, sfx: 0.8, ambience: 0.5, pixel: 'auto', shafts: true, hud: true }, saved, { v: 2 });
    this.applySettings();
    this.codex = (await codexAll()).sort((a, b) => b.scannedAt - a.scannedAt);
    for (const e of this.codex) { e.img = new Image(); e.img.src = e.photo; }
    this.interior.drawScreen(this.codex, 'connecting');

    const x = q.has('x') ? Number(q.get('x')) : s.x ?? 1200;
    const z = q.has('z') ? Number(q.get('z')) : s.z ?? -800;
    this.ship.place(x, z, s.heading ?? 0.4);
    this.boot.step(0.2, 'growing the forest');
    await new Promise((r) => setTimeout(r, 30));     // let the screen show first
    while (this.world.update(this.ship.x, this.ship.z, 0, 1, 64) > 0);
    if (q.has('t')) this._devTime = Number(q.get('t'));
    if (this.dev) this._devHooks();
    // wait (a few seconds at most) for the chain's block, so the sky opens at the hour
    // everyone shares instead of jumping to it
    this.boot.step(0.6, 'reading the hour from Robinhood Chain');
    const until = performance.now() + (q.has('offline') ? 0 : 6000);
    while (this.clock.source !== 'chain' && performance.now() < until) await new Promise((r) => setTimeout(r, 80));
    await seeded;
    if (this.clock.source !== 'chain') this.boot.step(0.85, 'the chain is quiet: the hour is reckoned');
    this.atmo.update(0, this.world.origin);

    this.mode = 'title';
    this.cams.auto = true;
    this.fp = { x: 0, z: 5, yaw: 0, pitch: -0.05, walked: 0, bob: 0 };
    this.lookOff = { yaw: 0, pitch: 0 };
    this.time = 0;
    this.beat = 0;
    this.sleep = { next: 20, t: 0, dur: 0, deep: false };
    this.asleep = false;
    this.paused = false;
    this.last = performance.now();
    this.input.onAny = () => this.audio.unlock();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._save(); });
    addEventListener('pagehide', () => this._save());
    if (q.has('play')) this.start();
    this._bootFrames = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  applySettings() {
    const st = this.settings;
    this.audio.setVolumes({ master: st.master, music: st.music, sfx: st.sfx, ambience: st.ambience });
    this.px.setPixelSize(st.pixel);
    FOG.uShafts.value = st.shafts ? 1 : 0;
    this.hud.show(st.hud);
    save('settings', st);
  }

  _save() {
    save('state', { alertness: this.alertness, x: this.ship.x, z: this.ship.z, heading: this.ship.heading, stats: this.stats_ });
  }

  // ---------------------------------------------------------------- modes
  start() {
    if (this.mode !== 'title') return;
    this.audio.unlock();
    this.audio.mood.title = 0;
    this.title.hide();
    this.mode = 'fly';
    this.cams.auto = false;
    this.cams._cut = true;
    this.hud.say('THE FOG BELT', 'A survey flight over the planet’s warm band', 5);
    this._keysShown = this.time;
  }

  enterCabin(seat = false) {
    this.mode = seat ? 'seat' : 'walk';
    this.fp.x = 0; this.fp.z = seat ? 6.3 : 4.9; this.fp.yaw = 0; this.fp.pitch = -0.08;
    this.lookOff.yaw = 0; this.lookOff.pitch = 0;
    this.audio.play('door');
    this.input.dragLook = true;
    this.tips.learn('cabin');
  }

  exitCabin() {
    this.mode = 'fly';
    this.input.unlock();
    this.input.dragLook = false;
    this.cams._cut = true;
    this.audio.play('door');
    this.tips.learn('outside');
  }

  // out to the ship's view from wherever one is: the Codex, the menu, the coffee, the
  // cabin (the alert's button, or V while it is up)
  goOutside() {
    if (this.menu.open) this.menu.hide();
    if (this.terminal.open) this.terminal.hide();
    if (this.mode === 'coffee') this.coffee.finish();
    if (this.mode === 'walk') this.exitCabin();
  }

  startCoffee() {
    this.mode = 'coffee';
    this.input.unlock();
    this.tips.learn('coffee');
    this.coffee.start(this.fp);
  }

  endCoffee(at, yaw) {
    this.mode = 'walk';
    this.fp.x = at.x; this.fp.z = at.z; this.fp.yaw = yaw; this.fp.pitch = 0;
    this.stats_.cups++;
    this._save();
  }

  drink() {
    this.alertness = 1;
    this.warm = 90;
    this.sleep.next = 60;
    this.hud.say('WARM', 'Alertness restored', 3);
  }

  // the whole screen, on phones and tablets: asked for on the first tap, and in the menu
  get canFullscreen() {
    const d = document.documentElement;
    return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(d.requestFullscreen || d.webkitRequestFullscreen);
  }

  get isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  setFullscreen(on) {
    const d = document.documentElement;
    try {
      let p = null;
      if (on && !this.isFullscreen) p = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen();
      else if (!on && this.isFullscreen) p = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed here */ }
  }

  // a light tap of the phone's motor for the moments that matter (where phones have one)
  buzz(pattern) {
    if (!this.input.touchMode || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch { /* not allowed */ }
  }

  // ---------------------------------------------------------------- music to keep
  keepMusic() {
    const n = this.audio.keep();
    if (n) this.hud.say('KEPT', 'This music will come back as it is', 3.5);
  }

  async saveSound() {
    this.hud.say('SAVING THE LAST MINUTE OF SOUND', '', 2.5);
    const blob = await this.audio.saveRecent();
    if (!blob) { this.hud.say('NOTHING TO SAVE YET', '', 2.5); return; }
    const a = document.createElement('a');
    const d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = `low-pass-${d.toISOString().slice(0, 16).replace(/[:T]/g, '-')}.wav`;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    this.hud.say('SAVED', a.download, 3);
  }

  // ---------------------------------------------------------------- artifacts
  // a: the one that appeared (or the first of a sweep's: list)
  _appear(a, list = [a]) {
    if (a.special) {
      const ids = list.map((x) => x.d.lead);
      const who = ids.length > 1 ? `SEEKERS ${ids.slice(0, 5).map((t) => '#' + t).join(' ')}${ids.length > 5 ? ` and ${ids.length - 5} more` : ''}` : `SEEKER #${a.d.lead}`;
      const title = ids.length > 1 ? `${ids.length} SEEKERS MOVED · WITNESSED` : 'A SEEKER MOVED · WITNESSED';
      this.audio.play('witness', { pan: clamp(-(a.bearing || 0), -1, 1) });
      this.atmo.networkPulse(ids.length > 1 ? 1.4 : 1);
      this._witnessedAt = this.time;
      // anywhere aboard the cabin calls; away from the ship's view (on foot, at the Codex,
      // over coffee) the alert says it too, where it cannot be missed (the HUD's alarm)
      if (this._aboard()) this.audio.play('alarm');
      if (this.mode !== 'fly' && this.mode !== 'seat' || this.terminal.open || this.menu.open) this.buzz([30, 90, 30, 90, 60]);
      else this.hud.say(title, `${who} moved ${a.move.time ? agoShort(a.move.time) : 'just now'}; every ship flying now sees ${ids.length > 1 ? 'them' : 'it'}`, 8);
    } else {
      this.audio.play('signal', { pan: clamp(-(a.bearing || 0), -1, 1) });
      // aboard, the cabin calls softly; at the controls the HUD says so, and away from the
      // ship's view (on foot, at the Codex, over coffee) a small note over everything,
      // that goes by itself
      if (this._aboard()) {
        this.audio.play('chime');
        if (this.mode === 'seat' && !this.menu.open) this.hud.say('WILD ARTIFACT AHEAD', 'Rising out of the fog ahead of the ship', 4);
        else this.hud.toast('WILD ARTIFACT NEARBY', 'Rising out of the fog ahead of the ship. Only this ship will ever find it.');
      } else {
        // said the first times only; after that the low swell is enough
        this._wilds = (this._wilds || 0) + 1;
        if (this._wilds <= 2) this.hud.say('SIGNAL IN THE FOG', 'Unrecorded · only this ship can find it', 4.5);
      }
    }
  }

  // inside the ship: on foot (at the Codex too), at the controls, over coffee
  _aboard() {
    return this.mode === 'walk' || this.mode === 'seat' || this.mode === 'coffee';
  }

  async _scanned(a) {
    this.audio.play('shutter');
    const photo = takePhoto(this, a);
    POST.uFlash.value = 0.9;
    const d = a.d;
    // kept by its key: the transaction (or seed), or for one of a sweep's seekers the
    // transaction and its token; hash: the transaction itself, when that differs
    const entry = {
      tx: d.key, ...(d.key !== d.tx ? { hash: d.tx, total: d.total } : {}), grand: !!d.grand,
      v: GENERATOR_VERSION, kind: d.kind, special: !!d.special, name: d.name, code: d.code, cls: d.cls, family: d.family, notes: d.notes,
      accent: d.accent, tokens: d.tokens, lead: d.lead, charge: d.charge, recipients: d.recipients, pool: d.pool,
      block: d.block, time: a.move.time || null, scannedAt: Date.now(), clock: this.atmo.clockString(), photo,
      passes: a.pass || 0, song: { degrees: d.song.degrees, k: d.song.k, n: d.song.n }, fund: d.fund,
    };
    entry.img = new Image();
    entry.img.src = photo;
    this.codex = [entry, ...this.codex.filter((e) => e.tx !== entry.tx)];
    this.stats_.scans++;
    this.tips.learn('scan');
    this.hud.recorded(entry);
    this.audio.play('recorded');
    this.buzz([14, 70, 22]);
    const { img, ...stored } = entry;
    await codexPut(stored);
    entry.img.onload = () => this.interior.drawScreen(this.codex, this.moves.status);
    this._save();
  }

  // where an artifact is on screen, in CSS pixels, and how big (render pixels)
  screenOf(a) {
    const cam = this.cams.cam;
    const p = a.model.focus.clone().applyMatrix4(a.model.group.matrixWorld);
    const v = p.clone().applyMatrix4(cam.matrixWorldInverse);
    if (v.z > -1) return null;
    p.project(cam);
    if (Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) return null;
    const o = this.px.origin;
    const w = this.px.width * o.css, h = this.px.height * o.css;
    const r = (a.model.span / -v.z) * U.uPxScale.value;
    return { x: o.x + (p.x * 0.5 + 0.5) * w, y: o.y + (0.5 - p.y * 0.5) * h, r };
  }

  // ---------------------------------------------------------------- the frame
  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const dt = (now - this.last) / 1000;
    this.last = now;
    if (this._frozen) return;
    this.px.adapt(dt * 1000, now);
    this.step(Math.min(dt, 0.1));
    // the loading screen goes once a couple of frames are drawn (shaders compiled)
    if (this.boot && ++this._bootFrames >= 3) { this.boot.done(); this.boot = null; }
  }

  step(dt) {
    this.px.renderer.info.reset();
    const input = this.input;
    input.pollPad();
    input.mode = this.mode;
    const overlay = this.terminal.open || this.menu.open;
    if (this.paused) dt = 0;
    this.time += dt;
    // the beat follows the score's clock when there is one
    const ab = this.audio.beatNow();
    this.beat = ab !== null ? ab : this.beat + (dt * BPM) / 60;
    U.uTime.value = this.time;
    U.uAnim.value = Math.floor(this.time * 12) / 12;
    U.uBeat.value = this.beat;

    // seekers moved (or a wild one rose) while away from the ship's view: V goes out to
    // them from anywhere
    if ((this.hud.alarmOn || this.hud.toastOn) && !input.uiCapture && input.hit('KeyV', 'Pad2') && (this.mode === 'coffee' || overlay)) {
      this.goOutside();
      input.pressed.delete('KeyV');
      input.pressed.delete('Pad2');
    }
    // keys that work everywhere
    if (this.mode === 'title') {
      if (input.pressed.size || input.mouseDown) this.start();
    } else if (!overlay) {
      if (input.hit('Escape', 'KeyP', 'Pad9')) this.menu.show();
      else if (input.hit('KeyK', 'Pad8')) {
        // the Codex lives on the computer in the cabin, nowhere else
        if (this.mode === 'walk') this.hud.say('THE CODEX COMPUTER', 'On the right wall, across from the coffee machine', 3.5);
        else if (this.mode !== 'coffee') this.hud.say('THE CODEX IS ON THE CABIN COMPUTER', this.mode === 'seat' ? 'Press E to stand up' : 'Press V to go inside', 3.5);
      } else if (input.hit('KeyH')) {
        this.settings.hud = !this.settings.hud;
        this.applySettings();
        this.hud.say(this.settings.hud ? 'INTERFACE SHOWN' : 'INTERFACE HIDDEN', this.settings.hud ? '' : 'Press H to show it again', 3);
      }
      else if (input.hit('KeyM')) this.keepMusic();
      else if (input.hit('KeyR')) this.saveSound();
    } else {
      if (this.terminal.open) this.terminal.keys(input);
      else this.menu.keys(input);
    }
    this.terminal.update(dt);

    // the ship flies on whatever happens inside
    let steer = 0;
    if (!overlay && (this.mode === 'fly' || this.mode === 'seat')) steer = input.steer();
    if (this.mode === 'title') steer = Math.sin(this.time * 0.05) * 0.25;
    this._alertness(dt);
    this.ship.update(dt, steer);
    const [fx, fz] = this.ship.forward();
    const cp = this.cams.cam.position;
    this.world.update(this.ship.x, this.ship.z, fx, fz, 2, cp.x + this.world.origin.x, cp.z + this.world.origin.z, dt);
    if (this._devTime !== undefined && this.clock.source !== 'none') { this.atmo.setTime(this._devTime); this._devTime = undefined; }
    this.atmo.update(dt, this.world.origin);
    this.ship.sync(this.world.origin, this.beat);
    this.stats_.distance += this.ship.speed * dt;

    // artifacts, when the last are behind: the witnessed ones of the seekers that moved
    // (a sweep's together) if any are waiting, else a wild one, every minute or two.
    // Inside the ship they rise farther off, to give time to come out to them.
    if (!overlay || !this.field.pending) this.field.next -= dt;
    if (this.mode !== 'title' && this.field.next <= 0 && !this.field.pending && !this._spawning) {
      const wave = this.moves.takeWave(WAVE);
      const away = this.mode !== 'fly' && this.mode !== 'seat' || overlay;
      this._spawning = true;
      (wave.length ? this.field.spawnWave(wave, { far: away ? this.ship.speed * 30 : 0 }) : this.field.spawnWild()).finally(() => { this._spawning = false; });
      this.field.next = this.moves.waiting ? 6 : WILD_GAP[0] + Math.random() * (WILD_GAP[1] - WILD_GAP[0]);
    }
    const canScan = !overlay && (this.mode === 'fly' || this.mode === 'seat');
    const prevState = this.field.state;
    this.field.update(dt, canScan && input.scanHeld());
    if (this.field.state === 'lock' && prevState !== 'lock') { this.audio.play('lock'); this.buzz(10); }
    if (this.field.scan > 0 && input.scanHeld() && Math.floor(this.time * 6) !== this._scanTick) {
      this._scanTick = Math.floor(this.time * 6);
      this.audio.play('scan', { progress: this.field.scan });
    }

    // the camera, by mode
    const inside = this.mode === 'walk' || this.mode === 'seat' || this.mode === 'coffee';
    this.ship.exterior.visible = !inside;
    this.interior.group.visible = inside;
    this.interior.lights(inside, this.beat);
    if (this._inspect && this._inspect.a.model.group.parent) this._inspectCam();
    else if (this.mode === 'coffee') this.coffee.update(dt);
    else if (this.mode === 'walk') this._walk(dt, overlay);
    else if (this.mode === 'seat') this._seat(dt, overlay);
    else {
      if (!overlay && input.hit('KeyC', 'Pad3')) {
        const m = this.cams.cycle();
        this.tips.learn('camera');
        this.hud.say(m === 'cinematic' ? 'CINEMATIC' : `${m.toUpperCase()} CAMERA`, '', 1.5);
      }
      if (!overlay && input.hit('KeyV', 'Pad2')) this.enterCabin();
      // idle for a minute: the cinematic director takes over until a key is pressed
      if (this.mode === 'fly') this.cams.auto = this.mode === 'fly' && performance.now() - input.lastInput > 60000 && !this.field.pending;
      this.cams.exterior(this.ship, dt);
    }
    if (this.mode === 'coffee' && !overlay && this.coffee.t > 0.6 && input.hit('Escape', 'KeyE', 'Space', 'Enter', 'Pad0', 'Pad1', 'Tap')) this.coffee.skip();
    this.cams.cam.updateMatrixWorld();
    this.companion.update(dt, this.time);
    const cw = this.cams.cam.position;
    this.world.lods(cw.x + this.world.origin.x, cw.z + this.world.origin.z);
    U.uPxScale.value = this.px.height / 2 / Math.tan((this.cams.cam.fov * Math.PI) / 360);

    // the score listens to the world
    const m = this.audio.mood;
    m.night = this.atmo.night;
    m.fog = clamp((U.uFogDensity.value - 0.003) / 0.008, 0, 1);
    m.drowsy = clamp(1 - this.alertness / 0.35, 0, 1);
    m.inside = inside ? 1 : 0;
    m.turn = this.ship.yawRate;
    m.warm = this.mode === 'coffee' ? 1 : Math.max(0, this.warm / 90);
    const t = this.field.target;
    m.near = t ? clamp(1 - t.dist / 600, 0, 1) : 0;
    this.audio.artifacts = this.field.active.filter((a) => !a.building && a.model).sort((p, q) => p.dist - q.dist).slice(0, VOICES)
      .map((a) => ({ key: a.d.key, d: a.d, dist: a.dist, bearing: a.bearing || 0, reveal: a.revealed ? a.reveal : 0 }));

    POST.uFlash.value = Math.max(0, POST.uFlash.value - dt * 2.5);
    this.px.render(this.scene, this.cams.cam);
    this._hud(dt, inside, overlay);
    this.touch.update();
    if (this.stats) this._stats(dt);
    if (input.hit('F3')) { this.stats = !this.stats; if (this._statsEl) this._statsEl.style.display = this.stats ? '' : 'none'; }
    if (Math.floor(this.time / 10) !== this._saveTick) { this._saveTick = Math.floor(this.time / 10); this._save(); this.interior.drawScreen(this.codex, this.moves.status); }
    input.endFrame();
  }

  // drowsiness: the edges close in, blinks grow longer, and below a tenth come short
  // sleeps in which the ship wanders and nothing can be scanned
  _alertness(dt) {
    if (this.mode === 'title' || this.mode === 'coffee') { POST.uDrowsy.value = damp(POST.uDrowsy.value, 0, 3, dt); POST.uBlink.value = 0; return; }
    this.warm = Math.max(0, this.warm - dt);
    this.alertness = Math.max(0, this.alertness - dt * DECAY * (this.warm > 0 ? 0.4 : 1));
    const a = this.alertness;
    POST.uDrowsy.value = damp(POST.uDrowsy.value, clamp((0.35 - a) / 0.35, 0, 1) * 0.85, 1, dt);
    const s = this.sleep;
    if (a < 0.3 && dt > 0) {
      if (s.t > 0) {
        s.t -= dt;
        const k = s.t / s.dur;
        POST.uBlink.value = Math.min(1, Math.sin(clamp(1 - k, 0, 1) * Math.PI) * (s.deep ? 1.6 : 1.3));
        this.asleep = s.deep && POST.uBlink.value > 0.95;
        if (s.deep) this.ship.drift = damp(this.ship.drift, Math.sin(this.time * 0.7) * 0.5, 1, dt);
        if (s.t <= 0) {
          s.next = 4 + a * 40 + Math.random() * 8;
          this.ship.drift = 0;
          this.asleep = false;
          if (s.deep) this.audio.play('yawn');
        }
      } else {
        s.next -= dt;
        POST.uBlink.value = 0;
        if (s.next <= 0) {
          s.deep = a < 0.1 && Math.random() < 0.6;
          s.dur = s.deep ? 2.5 + Math.random() * 2 : 0.35 + (0.3 - a) * 2.5;
          s.t = s.dur;
        }
      }
    } else {
      POST.uBlink.value = 0;
      this.ship.drift = 0;
      this.asleep = false;
    }
  }

  // ---------------------------------------------------------------- inside
  _lookInput(scale = 0.0024) {
    const l = this.input.takeLook();
    let k = 0;
    if (this.input.down('ArrowLeft') && this.mode === 'walk') k -= 1;
    if (this.input.down('ArrowRight') && this.mode === 'walk') k += 1;
    return { x: l.x * scale + k * 0.03, y: l.y * scale };
  }

  _walk(dt, overlay) {
    const fp = this.fp, input = this.input, I = this.interior;
    if (!overlay) {
      const l = this._lookInput();
      fp.yaw -= l.x;
      fp.pitch = clamp(fp.pitch - l.y, -1.3, 1.2);
      if (input.hit('Mouse0') && !input.locked && matchMedia('(pointer: fine)').matches) input.lock();
      const w = input.walk();
      const keysTurn = input.down('ArrowLeft', 'ArrowRight');
      const sx = keysTurn ? 0 : w.x;
      const speed = (input.down('ShiftLeft', 'ShiftRight') ? RUN : WALK) * dt;
      // forward is +z at yaw 0; +x is to the left
      const fwdX = Math.sin(fp.yaw), fwdZ = Math.cos(fp.yaw);
      const dx = (fwdX * w.y - fwdZ * sx) * speed, dz = (fwdZ * w.y + fwdX * sx) * speed;
      const moved = Math.hypot(dx, dz);
      if (I.free(fp.x + dx, fp.z + dz)) { fp.x += dx; fp.z += dz; }
      else if (I.free(fp.x + dx, fp.z)) fp.x += dx;
      else if (I.free(fp.x, fp.z + dz)) fp.z += dz;
      fp.walked += moved;
      fp.bob = damp(fp.bob, moved > 0.001 ? 1 : 0, 6, dt);
      if (fp.walked > 0.62) { fp.walked = 0; this.audio.play('step', { gain: 0.8 }); }
      // the nearest thing to use: in reach and roughly ahead, the more roughly the closer
      // one stands (right beside it, any way one faces); the one already offered stays
      // offered until one has clearly turned or stepped away
      // A station (the Codex computer, the coffee machine, the controls) comes before the
      // seeker aboard, which hovers by the computer, however near it is.
      const was = this._spot;
      this._spot = null;
      let best = Infinity;
      for (const s of I.spots) {
        const d = Math.hypot(s.at.x - fp.x, s.at.z - fp.z);
        const ang = Math.atan2(s.at.x - fp.x, s.at.z - fp.z);
        let da = ang - fp.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const keep = s === was ? 1.15 : 1;
        const reach = s.r * keep;
        const cone = (d < 0.9 ? Math.PI : 0.9 + (1 - d / reach) * 1.3) + (keep > 1 ? 0.35 : 0);
        const rank = d + (s.id === 'companion' ? 100 : 0);
        if (d < reach && Math.abs(da) < cone && rank < best) { best = rank; this._spot = s; }
      }
      // what one faces comes first (the Codex computer, the coffee machine, the controls);
      // else E hears the seeker aboard out, or asks it to talk
      const station = this._spot && this._spot.id !== 'companion';
      if (station && input.hit('KeyE', 'Enter', 'Pad0')) this._use(this._spot);
      else if (this.companion.talking && input.hit('KeyE', 'Enter', 'Pad0')) this.companion.advance();
      else if (this._spot && input.hit('KeyE', 'Enter', 'Pad0')) this._use(this._spot);
      else if (input.hit('KeyV', 'Pad2')) this.exitCabin();
    }
    const bob = Math.sin(this.time * 9.4) * 0.025 * fp.bob;
    this.cams.firstPerson(this.ship, new THREE.Vector3(fp.x, EYE + bob, fp.z), fp.yaw, fp.pitch, 72);
  }

  _use(s) {
    if (s.id === 'coffee') this.startCoffee();
    else if (s.id === 'codex') { this.terminal.show(); this.tips.learn('codex'); }
    else if (s.id === 'companion') this.companion.talk();
    else if (s.id === 'seat') { this.mode = 'seat'; this.lookOff.yaw = 0; this.lookOff.pitch = 0; this.audio.play('ui', { h: 16 }); }
  }

  _seat(dt, overlay) {
    const lo = this.lookOff, input = this.input;
    if (!overlay) {
      const l = this._lookInput();
      lo.yaw = clamp(lo.yaw - l.x, -1.3, 1.3);
      lo.pitch = clamp(lo.pitch - l.y, -0.8, 0.6);
      if (!input.mouseDown && !input.locked) { lo.yaw = damp(lo.yaw, 0, 1.2, dt); lo.pitch = damp(lo.pitch, 0, 1.2, dt); }
      if (input.hit('KeyE', 'Pad1')) { this.tips.learn('stand'); this.mode = 'walk'; this.fp.x = 0; this.fp.z = 5.35; this.fp.yaw = 0; this.fp.pitch = -0.05; }
      else if (input.hit('KeyV', 'Pad2')) this.exitCabin();
    }
    this.cams.firstPerson(this.ship, new THREE.Vector3(0, 1.3, 6.4), lo.yaw, -0.06 + lo.pitch, 68);
  }

  _inspectCam() {
    const { a, dist, height } = this._inspect;
    const c = new THREE.Vector3().copy(a.model.focus).applyMatrix4(a.model.group.matrixWorld);
    const r = dist || a.model.span * 2.6 + 12;
    const ang = this.time * 0.12;
    this.cams.cam.position.set(c.x + Math.sin(ang) * r, c.y + (height ?? r * 0.6), c.z + Math.cos(ang) * r);
    this.cams.cam.up.set(0, 1, 0);
    this.cams.cam.lookAt(c);
  }

  // ---------------------------------------------------------------- the HUD
  _hud(dt, inside, overlay) {
    const h = this.hud;
    h.root.classList.toggle('away', this.mode === 'title' || this.mode === 'coffee' || overlay);
    h.update(dt, this);
    const st = this.moves.status;
    const away = this.mode === 'walk' || this.mode === 'coffee' || overlay;
    h.setAlarm(away && this.mode !== 'title' ? this.field.open.filter((a) => a.special) : null);
    h.setStatus(st === 'live' ? 'SEEKER NET LIVE' : st === 'offline' ? 'SEEKER NET OFFLINE · ARCHIVE' : st === 'retrying' ? 'SEEKER NET RETRYING' : 'SEEKER NET …', st === 'live' ? 'live' : st === 'offline' ? 'off' : '');
    let keys = [];
    if (this.input.touchMode) keys = [];     // the buttons on screen say it
    else if (this.mode === 'fly') keys = [['A D', 'steer'], ['SPACE', 'scan'], ['V', 'go inside'], ['C', 'camera'], ['ESC', 'menu']];
    else if (this.mode === 'walk') keys = [['W A S D', 'walk'], ['E', 'use'], ['V', 'outside'], ['ESC', 'menu']];
    else if (this.mode === 'seat') keys = [['A D', 'steer'], ['SPACE', 'scan'], ['E', 'stand up'], ['V', 'outside']];
    h.setKeys(keys);
    // the teaching line and the marks; the keys stay a while after each change of place
    // (the tips reset the clock), and come back when an idle key is pressed
    this.tips.update(dt, overlay);
    h.keys.classList.toggle('dim', this.time - (this._keysShown || 0) > 20 && this.mode !== 'walk');
    h.cross.classList.toggle('on', this.mode === 'walk' && !overlay);
    // (on a touch screen the button that appears says it)
    if (this.input.touchMode) h.setPrompt(null);
    else if (this.mode === 'walk' && this._spot && this._spot.id !== 'companion' && !overlay) h.setPrompt(this._spot.label, 'E');
    else if (this.mode === 'walk' && this.companion.talking && !overlay) h.setPrompt('Next', 'E');
    else if (this.mode === 'walk' && this._spot && !overlay) h.setPrompt(this._spot.label, 'E');
    else h.setPrompt(null);
  }

  _stats(dt) {
    if (!this._statsEl) {
      this._statsEl = document.createElement('pre');
      this._statsEl.style.cssText = 'position:absolute;left:8px;top:8px;margin:0;font:12px monospace;color:#abe3d9;text-shadow:1px 1px 0 #000;pointer-events:none;z-index:5';
      this.uiRoot.append(this._statsEl);
      this._fps = 60;
    }
    this._fps = this._fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    const i = this.px.renderer.info;
    this._statsEl.textContent = `${this._fps.toFixed(0)} fps  ${this.px.width}x${this.px.height}\ncalls ${i.render.calls}  tris ${(i.render.triangles / 1000).toFixed(0)}k\nchunks ${this.world.chunks.size}  y ${this.ship.y.toFixed(0)}  fog ${U.uFogBase.value.toFixed(0)} ${U.uFogDensity.value.toFixed(4)}\nt ${this.atmo.time.toFixed(3)} ${this.atmo.clockString()} ${this.clock.source}  alert ${this.alertness.toFixed(2)}`;
  }

  // ---------------------------------------------------------------- development
  seekerInfo(t) {
    return this.artReady ? art.info(t) : null;
  }

  async seekerPixels(token) {
    try {
      await art.loadMeta();
      return art.decode(token, await art.cell(token), { activated: true });
    } catch { return null; }
  }

  _devHooks() {
    window.__lp = {
      spawn: async (i = 0, ahead, lateral) => {
        const snap = this._snap || (this._snap = await fetch('assets/moves.json').then((r) => r.json()));
        const m = typeof i === 'object' ? i : snap.moves[i % snap.moves.length];
        return this.field.spawn(m, ahead ? { ahead, lateral: lateral || 0 } : {});
      },
      // a wild artifact of a family, or (witness) a stand-in for a move seen now
      fake: (family, ahead, witness = false) => {
        const tx = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const move = witness || family === 'echo'
          ? { tx, block: 1, tokens: [1 + Math.floor(Math.random() * 2222)], charge: 800, recipients: 2200, pool: family === 'echo' ? 'activated' : 'dormant', time: Date.now(), live: true }
          : { tx, wild: true };
        return this.field.spawn(move, ahead ? { ahead, lateral: 0, family } : { family });
      },
      // as if a seeker moved on chain this moment (the move watcher's path)
      witness: (token = 1 + Math.floor(Math.random() * 2222)) => {
        const tx = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const m = { tx, block: 1, tokens: [token], charge: 1200, recipients: 2200, pool: 'dormant', time: Date.now() };
        this.moves._enqueue(m);
        if (this.moves.onMove) this.moves.onMove(m);
        return tx;
      },
      // as if n seekers moved in one transaction this moment (a sweep)
      sweep: (n = 7) => {
        const tx = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('');
        const tokens = [];
        while (tokens.length < n) { const t = 1 + Math.floor(Math.random() * 2222); if (!tokens.includes(t)) tokens.push(t); }
        const m = { tx, block: 1, tokens, charge: 3000, recipients: 2200, pool: 'dormant', time: Date.now() };
        this.moves._enqueue(m);
        if (this.moves.onMove) this.moves.onMove(m);
        return tx;
      },
      clear: () => { for (const a of [...this.field.active]) this.field.remove(a); },
      inspect: (a, dist = null, height = null) => { this._inspect = a ? { a, dist, height } : null; },
      look: async (family, ahead = 700) => {
        for (const a of [...this.field.active]) this.field.remove(a);
        const a = await window.__lp.fake(family, ahead);
        this._inspect = { a };
        return { name: a.d.name, code: a.d.code, notes: a.d.notes, params: a.d.params };
      },
      time: (t) => { this.atmo.setTime(t); },
      alert: (v) => { this.alertness = v; },
      // a stand-in wallet with a throwaway key, for testing the board's flow locally
      mockWallet: async (skHex, holder = true) => {
        const noble = await import('../vendor/noble-secp256k1.js');
        const { keccak256, toHex, fromHex } = await import('./core/keccak.js');
        const sk = fromHex(skHex);
        const address = '0x' + toHex(keccak256(noble.getPublicKey(sk, false).slice(1))).slice(24);
        const provider = {
          request: async ({ method, params }) => {
            if (method === 'eth_requestAccounts') return [address];
            if (method === 'personal_sign') {
              const msg = fromHex(params[0]);
              const prefix = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${msg.length}`);
              const sig = await noble.signAsync(keccak256(new Uint8Array([...prefix, ...msg])), sk);
              return '0x' + sig.r.toString(16).padStart(64, '0') + sig.s.toString(16).padStart(64, '0') + (27 + sig.recovery).toString(16);
            }
            throw new Error('not supported: ' + method);
          },
        };
        window.ethereum = provider;
        if (!this.terminal.board) this.terminal.show('seekers');
        if (holder) this.terminal.board.devHolders = new Set([address]);
        return address;
      },
      // advance the game without the browser's frames (a hidden pane does not draw)
      run: (sec, fps = 30) => { for (let i = 0; i < sec * fps; i++) this.step(1 / fps); },
      // stop the browser's frames from moving the game (run() still does)
      freeze: (on = true) => { this._frozen = on; },
      // the coffee scene at a moment (seconds), for looking at it
      coffeeAt: (t, fps = 30) => {
        this._frozen = true;
        if (this.mode !== 'coffee') { this.mode = 'walk'; this.fp.x = 1.2; this.fp.z = 0.8; this.fp.yaw = Math.PI / 2; this.startCoffee(); }
        if (t < this.coffee.t) { this.coffee.start(this.fp); }
        while (this.coffee.t < t - 1e-6) this.step(Math.min(1 / fps, t - this.coffee.t));
        return this.coffee.t;
      },
      key: (code, down = true) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code })),
    };
  }
}

function agoShort(ms) {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

