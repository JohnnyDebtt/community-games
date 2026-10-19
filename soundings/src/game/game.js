import * as THREE from 'three';
import { PixelRenderer } from '../render/renderer.js';
import { U, worldMaterial } from '../render/materials.js';
import { Input } from '../core/input.js';
import { Audio, BEAT } from '../core/audio.js';
import { clamp, damp, hash1, rng, TAU } from '../core/math.js';
import { DayCycle } from '../world/daycycle.js';
import { Sky } from '../world/sky.js';
import { buildTerrain } from '../world/terrain.js';
import { Ice } from '../world/ice.js';
import { buildProps } from '../world/props.js';
import { Capsule } from '../world/capsule.js';
import { Weather } from '../world/weather.js';
import { UnderIce } from '../world/underice.js';
import { Particles, Footprints, FishingLine, BlobShadows } from '../world/fx.js';
import { applyLighting, makeLight } from '../world/lighting.js';
import { CAPSULE, TANK, START, ZONE, depthAt, groundHeight, dominantZone, zoneWeights, shoreAt } from '../world/layout.js';
import { Player } from '../actors/player.js';
import { FollowCamera } from '../actors/camera.js';
import { SeekerBot } from '../actors/seekerbot.js';
import { fishGeometry, orbGeometry } from '../actors/fishmodel.js';
import { addOutline, setOutlineResolution } from '../render/outline.js';
import { SeekerNet, picksFor } from '../seekernet/network.js';
import * as Art from '../seekernet/art.js';
import { deviceProfile } from '../seekernet/traits.js';
import { SPECIES, SPECIES_BY_ID, RARITY, weightKg, toneOf, formatWeight } from './species.js';
import { newState, loadState, saveState, exportState, importState } from './state.js';
import { RESEARCH, RESEARCH_BY_ID, lineMax, mounts, packLevel, packCapacity, drillTime, available } from './research.js';
import { Holes } from './holes.js';
import { Fishing } from './fishing.js';
import { Devices, DeviceSlot } from './devices.js';
import { Overdrive } from './overdrive.js';
import { WorldEvents } from './worldevents.js';
import { Requests } from './requests.js';
import { HUD } from '../ui/hud.js';
import { Panels } from '../ui/panels.js';
import { Icons } from '../ui/icons.js';
import { TouchControls } from '../ui/touch.js';
import { installFrames } from '../ui/pixelart.js';
import { KeyNav } from '../ui/keynav.js';
import { Camp } from './camp.js';

const REST_AT = { dawn: 0.215, day: 0.45, dusk: 0.735, night: 0.885 };
const R = rng((Date.now() >>> 7) ^ 0xf15);
const NO_FX = {
  bite: 1, band: 0, drain: 0, fishSpeed: 0, reel: 0, window: 0, warn: false, id: false, second: 0, grace: 0, size: 0,
  auto: false, lock: false, frenzy: false, point: false, crescendo: false, deep: false, teeming: false,
};

export class Game {
  constructor() {
    installFrames();
    this.canvas = document.getElementById('game');
    this.uiRoot = document.getElementById('ui');
    this.px = new PixelRenderer(this.canvas);
    this.scene = new THREE.Scene();
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.state = loadState();
    this.hasSave = !!this.state;
    if (!this.state) this.state = newState();
    this.day = new DayCycle();
    this.day.t = this.state.t;
    this.day.day = this.state.day;
    this.sky = new Sky(this.scene);
    buildTerrain(this.scene);
    this.ice = new Ice(this.scene);
    this.props = buildProps(this.scene);
    this.capsule = new Capsule(this.scene);
    this.weather = new Weather(this.scene, this.state.weatherSeed);
    this.underIce = new UnderIce(this.scene);
    this.particles = new Particles(this.scene, 320);
    this.footprints = new Footprints(this.scene);
    this.line = new FishingLine(this.scene);
    this.shadows = new BlobShadows(this.scene);
    this._shadowItems = [];
    this.player = new Player(this.scene);
    this.cam = new FollowCamera(this.px.width / this.px.height);
    this.px.onResize = (w, h) => { this.cam.setAspect(w / h); setOutlineResolution(w, h); if (this.hud) this.hud.setScale(); };
    this.cam.setAspect(this.px.width / this.px.height);
    setOutlineResolution(this.px.width, this.px.height);
    this.net = new SeekerNet();
    this.holes = new Holes(this.state);
    this.fishing = new Fishing(this);
    this.devices = new Devices(this);
    this.overdrive = new Overdrive(this);
    this.events = new WorldEvents(this);
    this.requests = new Requests(this);
    this.icons = new Icons(this.px);
    this.keynav = new KeyNav(this);
    this.hud = new HUD(this.uiRoot, this);
    this.panels = new Panels(this.uiRoot, this);
    this.touch = new TouchControls(this.uiRoot, this);

    this.mode = 'loading';        // loading | title | walk | fish | catch | drill | capsule
    this.time = 0;
    this.frame = 0;
    this.lights = [];
    this.capsuleLight = makeLight(this.capsule.window, 0xe9e2cf, 16, 1.3);
    this.capsuleInner = makeLight(this.capsule.center, 0xf0c070, 5, 0);
    this.lanternLight = makeLight([0, 0, 0], 0xe9e2cf, 7, 0.9);
    this.lanternLight.on = false;
    this.lights.push(this.capsuleLight, this.capsuleInner, this.lanternLight);
    for (const t of this.props.tethers) {
      t.lightObj = makeLight(t.light, 0xd6edf5, 5, 0.5);
      this.lights.push(t.lightObj);
    }
    // the Vagrant and their yak, camped somewhere on the ice
    this.camp = new Camp(this);
    this.companion = null;        // SeekerBot
    this.companionProfile = null;
    this.bait = false;
    this.lastDepth = null;
    this.drillT = 0;
    this.catchNow = null;
    this.heldFish = null;
    this.senseOn = false;
    this.auroraVisible = 0;
    this.streak = 0;
    this._stop = 0;
    this._saveT = 0;
    this._context = null;
    this._chipT = 0;
    this._listenerTonight = -1;
    this._lastMarkIds = new Set();
    this.tankFish = [];
    this._seq = null;             // the capsule entry, step by step
  }

  async init() {
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'sounding';
    this.uiRoot.append(loading);
    this.applySettings();
    this.player.place(this.state.player.x, this.state.player.z, this.state.player.facing);
    this.player.setPack(packLevel(this.state));
    this.player.extraBlock = (x, z) => this.blocked(x, z);
    this.player.onStep = (side, running) => {
      this.audio.step(side, running);
      const p = this.player.pos;
      if (groundHeight(p.x, p.z) < 0.05) {
        this.footprints.add(p.x, 0, p.z, this.player.facing, side);
        if (running) this.particles.emit(p.x - Math.sin(this.player.facing) * 0.2, 0.04, p.z - Math.cos(this.player.facing) * 0.2, 3, { color: 0xedf0f1, speed: 0.6, up: 0.9, life: 0.45 });
      }
    };
    this.cam.target.set(CAPSULE.x, CAPSULE.y + 5, CAPSULE.z);
    this.cam.yaw = 0.6;
    this.cam.pitch = 0.18;
    try {
      await Promise.all([Art.loadMeta(), this.net.loadSnapshot(), document.fonts && document.fonts.load('10px "Seeker Pixel"'), document.fonts && document.fonts.load('11px "Seeker Display"')]);
    } catch (e) {
      console.warn('SEEKER NET art could not be loaded', e);
    }
    this.net.restore(this.state.net);
    this.net.enabled = this.state.settings.chain !== false;
    this.net.onPulse = (p) => this.onNetPulse(p);
    this.net.onUpdate = () => this.onNetUpdate();
    this.net.onEvents = (evs, o) => { if (this.mode !== 'title' && this.mode !== 'loading') this.events.onEvents(evs, o); else this._pendingEvents = [evs, o]; };
    this.rebuildTank();
    loading.remove();
    this.mode = 'title';
    this.panels.showTitle(this.hasSave);
    this.net.start();
    this._last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    addEventListener('keydown', () => this.audio.unlock(), { once: true });
    addEventListener('beforeunload', () => this.save());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
  }

  // ------------------------------------------------------------------ starting
  async start(fresh) {
    this.audio.unlock();
    if (fresh) {
      this.state = newState();
      this.holes = new Holes(this.state);
      this.devices.slots.forEach((s) => s.bot && s.bot.dispose());
      this.devices.slots = [];
      if (this.companion) { this.companion.dispose(); this.companion = null; }
      this.day.t = this.state.t;
      this.day.day = this.state.day;
      this.player.place(START.x, START.z, Math.PI);
      this.player.setPack(1);
      this.rebuildTank();
    }
    this.panels.hideTitle();
    this.hud.show(true);
    this.mode = 'walk';
    this.hasSave = true;
    this.cam.mode = 'walk';
    this.cam.yaw = this.player.facing + Math.PI;
    this.cam.pitch = 0.36;
    this.net.track(this.state.roster);
    this.net.track(this.state.watch || []);
    await this.spawnCompanion();
    this.spawnDevices();
    this.events.restore();
    this.requests.init();
    if (this._pendingEvents) {
      const [evs, o] = this._pendingEvents;
      this._pendingEvents = null;
      this.events.onEvents(evs, o);
    }
    if (!this.state.introDone) {
      const ids = picksFor(this.net.activatedIds(), Math.floor(Date.now() / 86400000), 3);
      this.panels.showIntro(ids);
    }
  }

  introClosed() {
    this.state.introDone = true;
    this.hint('walk', 'A hole waits below the capsule: walk to it and press [E].', 7000);
    this.save();
  }

  newGame() {
    this.panels.close();
    this.start(true);
  }

  // ------------------------------------------------------------------ the loop
  loop(now) {
    const ms = Math.min(250, now - this._last);
    this._last = now;
    let dt = Math.min(0.05, ms / 1000);
    // hit-stop: a few frames of near stillness when something lands
    if (this._stop > 0) {
      this._stop -= dt;
      dt *= 0.06;
    }
    try {
      if (!this.paused) this.update(dt, Math.min(0.05, ms / 1000));   // paused: tests step it by hand
    } catch (e) {
      console.error(e);
    }
    this.px.render(this.scene, this.cam.cam);
    // the resolution follows how the game runs while playing; the title's sweep of the
    // whole sea is not a fair measure
    if (this.mode !== 'title' && this.mode !== 'loading') this.px.adapt(ms, now);
    requestAnimationFrame((t) => this.loop(t));
  }

  hitstop(s) {
    this._stop = Math.max(this._stop, s);
  }

  shake(amount) {
    if (this.state.settings.shake === false) return;
    this.cam.shake = Math.max(this.cam.shake, amount);
  }

  update(dt, realDt = dt) {
    const input = this.input;
    this.time += dt;
    this.frame = Math.floor(this.time * 12);
    U.uTime.value = this.time;
    input.blocked = this.panels.open;
    input.update(realDt);
    const playing = this.mode !== 'title' && this.mode !== 'loading';

    // global keys
    if (playing && !this.panels.open && this.mode !== 'capsule') {
      if (input.pressed('codex')) this.panels.showCodex();
      else if (input.pressed('net')) this.panels.showRelay();
      else if (input.pressed('sense') && this.state.sense) this.toggleSense();
      else if (input.pressed('lantern')) this.toggleLantern();
      else if (input.pressed('overdrive')) this.unleash();
    } else if (this.panels.open && (input.b.back.pressed || (this.panels.current.kind === 'codex' && input.b.codex.pressed) || (this.panels.current.kind === 'relay' && input.b.net.pressed))) {
      if (this.panels.current.kind !== 'intro') this.panels.close();
    }

    // camera control: drag, touch, or the right stick
    if (!this.panels.open && this.mode !== 'title' && this.mode !== 'capsule') {
      const inv = this.state.settings.invertY ? -1 : 1;
      if (input.look.x || input.look.y) this.cam.orbit(input.look.x, input.look.y * inv);
      if (input.down('turnL')) this.cam.orbit(-260 * dt, 0);
      if (input.down('turnR')) this.cam.orbit(260 * dt, 0);
    }

    this.day.update(this.mode === 'title' ? dt * 0.3 : dt);
    if (this.day.day !== this.state.day) this.onNewDay();
    this.weather.update(dt, this.day, this.cam.cam);
    this.net.update(dt);
    this.updateAurora(dt);

    switch (this.mode) {
      case 'title': this.updateTitle(dt); break;
      case 'walk': this.updateWalk(dt); break;
      case 'drill': this.updateDrill(dt); break;
      case 'fish': this.updateFish(dt); break;
      case 'catch': this.updateCatch(dt); break;
      case 'capsule': this.updateCapsule(dt); break;
      default: break;
    }

    // world systems
    const beatStep = Math.floor(this.time / (BEAT / 4)) % 16;
    if (playing) {
      this.devices.update(dt, beatStep);
      this.holes.update(dt * this.day.speed, (h) => this.keepsOpen(h));
      this.overdrive.update(dt);
      this.events.update(dt);
    }
    this.ice.setHoles(this.holes.uniforms(this.player.pos.x, this.player.pos.z));
    this.player.animate(this.frame, dt, this.time);
    if (this.companion) this.updateCompanion(dt);
    if (this.state) this.camp.update(dt);
    for (const s of this.devices.slots) if (s.bot) {
      s.bot.lookAt = null;
      if (s.arrive > 0) {
        s.arrive = Math.max(0, s.arrive - dt);
        const k = s.arrive / 1.3;
        s.bot.pos.y = groundHeight(s.bx, s.bz) + k * k * 7;
        s.bot.moving = s.arrive > 0;
        if (this.frame % 2 === 0 && s.arrive > 0) this.particles.emit(s.bx, s.bot.pos.y + 0.5, s.bz, 1, { color: 0x91cbde, speed: 0.3, up: 0.6, life: 0.6 });
        if (s.arrive === 0) {
          this.particles.emit(s.bx, 0.3, s.bz, 14, { color: 0xedf0f1, speed: 1.2, up: 1.2, life: 0.7 });
          this.audio.chirp(s.token, false, true);
        }
      }
      s.bot.update(dt, this.frame, this.time);
    }
    this.capsule.update(dt, this.frame, this.day.night);
    this.underIce.update(dt, this.time);
    this.particles.update(dt);
    this.footprints.update(dt);
    this.updateTank(dt);
    this.updateHeldFish(dt);
    this.updateLights(dt);
    this.updateShadows();
    if (this.mode !== 'title') this.cam.update(realDt, this.player.pos, this.player.facing);
    applyLighting(this.day, this.weather, this.cam.cam, this.lights);
    this.applySenses(dt);
    this.sky.update(this.day, this.cam.cam, this.weather, this.auroraTonight(), this.net.pulse);
    this.updateAudio(dt);
    if (playing) {
      this.hud.update(realDt);
      this.touch.update(this.panels.open ? 'window' : this.mode === 'fish' ? 'fish' : 'walk');
      this.state.stats.seconds += dt;
      this._saveT += dt;
      if (this._saveT > 20) this.save();
      if (this.mode === 'catch' && this.panels.catchEl) this.hud.placeCard(this.panels.catchEl, this._fishCtx());
    } else {
      this.touch.update('title');
    }
    if (this.frame % 300 === 0) this.lights = this.lights.filter((l) => l.on || !l.temp);
    input.endFrame();
  }

  updateTitle() {
    // a slow drift around the capsule at the edge of the sea
    const a = this.time * 0.035 + 0.5;
    const c = this.cam.cam;
    c.position.set(CAPSULE.x + Math.sin(a) * 15, CAPSULE.y + 4.2, CAPSULE.z - 8 + Math.cos(a) * 10);
    c.lookAt(CAPSULE.x, CAPSULE.y + 3.2, CAPSULE.z - 26);
  }

  // ------------------------------------------------------------------ walking
  updateWalk(dt) {
    const input = this.input;
    const p = this.player;
    p.speedMul = 1 + (this.companionProfile ? this.companionProfile.mods.walk : 0);
    // the Seeker runs; holding the walk key (Shift, L3) slows it to a walk, and a light
    // push of a stick or the touch pad walks too
    if (!this.panels.open) p.move(dt, input.axis, this.cam.yaw, !(input.down('walk') || input.b.walk.down));
    else p.move(dt, { x: 0, y: 0 }, this.cam.yaw, false);
    if (!this.panels.open) this.cam.zoomBy(input.zoom);
    this.cam.mode = 'walk';
    this.line.hide();
    this.updateTethers();
    const ctx = this.findContext();
    this._context = ctx;
    if (this.panels.open) {
      this.hud.setPrompt(null);
      return;
    }
    this.hud.setPrompt(ctx ? ctx.prompt : null);
    // the keys, while they are new; afterwards only what matters now
    const fresh = this.state.settings.hints && this.state.stats.seconds < 150;
    this.hud.setHint(fresh ? this.walkHint() : null);
    if (!ctx) return;
    if (ctx.hold) {
      if (input.down('interact')) {
        if (ctx.kind === 'drill') {
          this.mode = 'drill';
          this.drillT = 0;
          this.drillSpot = ctx.spot;
          this.audio.drill(true);
        } else if (ctx.kind === 'chip') {
          this.mode = 'drill';
          this.drillT = 0;
          this.drillSpot = ctx.hole;
          this.chipping = true;
          this.audio.drill(true);
        }
      }
      return;
    }
    if (input.pressed('interact')) ctx.run();
    else if (ctx.alt && input.pressed('device')) ctx.alt();
  }

  walkHint() {
    if (this.input.lastDevice === 'touch') return 'left: walk · right: look · use: interact';
    if (this.input.lastDevice === 'gamepad') return 'stick: walk · [X] interact · [Y] device · [RB] overdrive';
    const od = this.overdrive.ready() || this.events.cells(this.state.companion) ? ' · [Q] overdrive' : '';
    return `[W][A][S][D] run · [Shift] walk · [Tab] Codex · [N] SEEKER NET${od}`;
  }

  findContext() {
    const p = this.player.pos;
    const fx = p.x + Math.sin(this.player.facing) * 0.75, fz = p.z + Math.cos(this.player.facing) * 0.75;
    const dist = (x, z) => Math.hypot(p.x - x, p.z - z);
    if (dist(CAPSULE.x, CAPSULE.z) < 1.9) return { prompt: '[E] Enter the capsule', run: () => this.enterCapsule(0) };
    if (dist(TANK.x, TANK.z) < 1.8) return { prompt: '[E] The specimen tank', run: () => this.panels.showTank() };
    for (const t of this.props.tethers) {
      if (dist(t.x, t.z) < 1.5) return { prompt: '[E] Travel along the tether', run: () => this.showTravel(t) };
    }
    const beacon = this.events.beaconNear(p.x, p.z);
    if (beacon) return { prompt: `[E] Meet SEEKER NET #${beacon.token}`, run: () => this.panels.showWoken(beacon) };
    const camp = this.camp;
    if (camp.spot >= 0) {
      const v = camp.vagrant.root.position;
      const dv = Math.hypot(fx - v.x, fz - v.z), dy = camp.yak.distanceTo(fx, fz);
      if (dv < 1.6 && dv <= dy) return { prompt: '[E] Talk to the Vagrant', run: () => this.panels.showVagrant() };
      if (dy < 1.7) return { prompt: '[E] Pet the yak', run: () => camp.pet() };
    }
    // holes: the one in front of you first
    const hole = this.holes.nearest(fx, fz, 0.9) || this.holes.nearest(p.x, p.z, 1.15);
    if (hole) {
      const slot = this.devices.slotAt(hole.id);
      if (slot) {
        if (slot.state === 'hooked') return { prompt: `[E] Take the line from #${slot.token}`, run: () => this.takeDeviceLine(slot) };
        return { prompt: '[E] Sit and fish', run: () => { this.removeDevice(hole.id, true); this.sit(hole); } };
      }
      if (hole.freeze > 0.85) return { prompt: '[E] Chip the ice open (hold)', hold: true, kind: 'chip', hole };
      const teem = this.events.teeming(hole) ? ' (teeming!)' : '';
      return { prompt: `[E] Sit and fish${teem}`, run: () => this.sit(hole) };
    }
    const spot = this.holes.polynyaSpotNear(p.x, p.z);
    if (spot) return { prompt: '[E] Fish the open water', run: () => this.sit(spot) };
    if (groundHeight(p.x, p.z) < 0.02) {
      const why = this.holes.drillProblem(fx, fz);
      if (!why) return { prompt: '[E] Drill a hole (hold)', hold: true, kind: 'drill', spot: { x: fx, z: fz } };
    }
    return null;
  }

  updateDrill(dt) {
    const input = this.input;
    const p = this.player;
    p.mode = 'drill';
    const instant = this.companionProfile && this.companionProfile.mods.drill;
    const total = this.chipping ? 0.6 : instant ? 0.25 : drillTime(this.state);
    if (!input.down('interact')) {
      this.mode = 'walk';
      p.mode = 'walk';
      this.chipping = false;
      this.audio.drill(false);
      this.hud.setPrompt(null);
      return;
    }
    this.drillT += dt;
    p.drill = clamp(this.drillT / total, 0, 1);
    p.faceTowards(this.drillSpot.x, this.drillSpot.z, dt);
    this.hud.setPrompt(this.chipping ? 'Chipping the ice...' : 'Drilling...', this.drillT / total);
    this._chipT -= dt;
    if (this._chipT <= 0) {
      this._chipT = 0.08;
      this.particles.emit(this.drillSpot.x, 0.05, this.drillSpot.z, 3, { color: 0xedf0f1, speed: 1.6, up: 1.4 });
    }
    if (this.drillT >= total) {
      this.audio.drill(false);
      this.audio.breakthrough();
      let hole;
      if (this.chipping) {
        hole = this.drillSpot;
        hole.freeze = 0;
      } else {
        hole = this.holes.add(this.drillSpot.x, this.drillSpot.z);
        this.state.stats.drilled++;
        this.requests.event('drill', { zone: dominantZone(hole.x, hole.z).id });
      }
      this.chipping = false;
      this.particles.emit(hole.x, 0.05, hole.z, 18, { color: 0x94a6b1, speed: 2, up: 2 });
      this.particles.emit(hole.x, 0.05, hole.z, 8, { color: 0x91cbde, speed: 1.2, up: 2.4 });
      this.shake(0.25);
      this.holes.splash(hole.id, 1);
      this.hud.setPrompt(null);
      this.sit(hole);
    }
  }

  // ------------------------------------------------------------------ fishing
  sit(hole) {
    const p = this.player;
    this.fishHole = hole;
    // sit on the side you came from, facing the hole
    let ax = p.pos.x - hole.x, az = p.pos.z - hole.z;
    const l = Math.hypot(ax, az) || 1;
    ax /= l; az /= l;
    const seat = 0.62;
    p.pos.set(hole.x + ax * seat, groundHeight(hole.x + ax * seat, hole.z + az * seat), hole.z + az * seat);
    p.facing = Math.atan2(-ax, -az);
    p.mode = 'sit';
    this.mode = 'fish';
    this.cam.mode = 'fish';
    this.cam.focus = new THREE.Vector3(hole.x, 0, hole.z);
    this.cam.yawTarget = p.facing - 1.62;    // side on, from the Seeker's right: the hole and the companion in view
    this.fishing.begin(hole, { depth: this.lastDepth });
    this.audio.plunk();
    this.holes.splash(hole.id, 0.6);
    this.hud.fishing(true);
    this.hud.setPrompt(null);
    this.hint('fish1', 'Hold [Space] to cast, let go at the depth you want.', 6000);
  }

  stand() {
    this.lastDepth = this.fishing.targetDepth;
    this.fishing.end();
    this.player.mode = 'walk';
    this.mode = 'walk';
    this.cam.mode = 'walk';
    this.cam.focus = null;
    this.cam.yawTarget = null;
    this.cam.pitch = 0.34;
    this.hud.fishing(false);
    this.audio.tension(0);
    this.line.hide();
    if (this.fishHole && !this.fishHole.open) {
      // step back from the hole
      const p = this.player;
      const ax = p.pos.x - this.fishHole.x, az = p.pos.z - this.fishHole.z;
      const l = Math.hypot(ax, az) || 1;
      p.pos.x = this.fishHole.x + (ax / l) * 0.9;
      p.pos.z = this.fishHole.z + (az / l) * 0.9;
      // a mount and a spare seeker: it keeps the hole you leave, and calls you to a bite
      const free = this.freeSeekers();
      if (this.freeMounts() > 0 && free.length && !this.devices.slotAt(this.fishHole.id)) this.placeDevice(this.fishHole, free[0]);
    }
    this.fishHole = null;
  }

  // What is shaping the fishing right now: your seeker's perks, its Overdrive, the hole.
  fishFx(hole) {
    const c = this.companionProfile;
    const od = this.overdrive.active ? this.overdrive.active.id : null;
    const warm = !!hole && this.camp.warm(hole.x, hole.z);
    if (!c && !od && !(hole && hole.charged) && !warm) {
      NO_FX.bite = this.approachBoost();
      return NO_FX;
    }
    const m = c ? c.mods : {};
    const teeming = this.events.teeming(hole);
    const night = this.day.night, dayK = 1 - night;
    let bite = this.approachBoost() * (1 + (m.bite || 0) + (m.nightBite || 0) * night + (m.dayBite || 0) * dayK);
    if (teeming) bite *= 3;
    // the thin ice the yak lies by
    if (warm) bite *= 2;
    if (od === 'deepscan') bite *= 2;
    return {
      bite, band: m.band || 0, drain: m.drain || 0, fishSpeed: m.fishSpeed || 0, reel: m.reel || 0, window: m.window || 0,
      warn: !!m.warn, id: !!m.id || od === 'deepscan', second: m.second || 0, grace: m.grace || 0, size: m.size || 0,
      auto: od === 'autoreel', lock: od === 'lockon', frenzy: od === 'frenzy', point: od === 'point', crescendo: od === 'crescendo',
      deep: od === 'deepscan', teeming, warm,
    };
  }

  updateFish(dt) {
    const input = this.input;
    const f = this.fishing;
    const p = this.player;
    if (!this.panels.open) {
      if (input.pressed('back') || input.pressed('interact')) {
        if (f.state !== 'reel') { this.stand(); return; }
      }
      if (input.pressed('bait')) this.useBait();
      // fine depth while waiting: W/S, the wheel
      let dz = 0;
      if (input.down('down')) dz += (5 + Math.min(10, f.targetDepth * 0.15)) * dt;
      if (input.down('up')) dz -= 6 * dt;
      dz += input.zoom * 1.5;
      if (dz) f.adjustDepth(dz);
      const jigs = f.jigLift;
      f.update(dt, input);
      if (f.jigLift > jigs + 0.5) {
        this.audio.jig();
        this.holes.splash(this.fishHole.id, 0.15);
      }
    } else {
      f.update(dt, { pressed: () => false, down: () => false });
    }
    if (this.mode !== 'fish') return;
    // choir hearing: you hear fish come before the sonar shows them
    if (this.senseOn && this.state.sense === 'choir') {
      for (const m of f.marks) {
        if (!this._lastMarkIds.has(m.id)) {
          this._lastMarkIds.add(m.id);
          this.audio.voice(toneOf(m.sp), { decay: 1.6, gain: 0.05, partials: [1, 0.3], verb: 0.5 });
        }
      }
    }
    const reel = f.state === 'reel' && f.game;
    p.jig = f.jigLift;
    p.castHold = f.state === 'cast' ? f.castPower : 0;
    p.reel = reel && (input.down('action') || this.overdrive.is('autoreel')) ? 1 : 0;
    const strain = reel ? clamp(Math.abs(f.game.fish - f.game.zone) * 2 + 0.25, 0, 1) : f.state === 'bite' ? 0.7 : f.jigLift * 0.2;
    p.rodBend = damp(p.rodBend, strain, 12, dt);
    if (reel) {
      // the hum climbs harmonics 8..16 of 48 Hz as the fish comes up
      this.audio.tension(0.05 + clamp(f.game.progress, 0, 1) * 0.9);
      if (p.reel && this.frame % 2 === 0) this.audio.reelTick(0.5);
      if (!f.game.inside && this.frame % 8 === 0) this.holes.splash(this.fishHole.id, 0.2);
      if (f.game.inside && this.frame % 6 === 0) this.particles.emit(this.fishHole.x, 0.05, this.fishHole.z, 1, { color: 0xabe3d9, speed: 0.4, up: 1.2, life: 0.5 });
    } else {
      this.audio.tension(0);
    }
    // the line: rod tip to the water
    const water = this._water || (this._water = new THREE.Vector3());
    water.set(this.fishHole.x, 0.01, this.fishHole.z);
    if (f.state === 'ready' || f.state === 'cast') this.line.hide();
    else this.line.set(p.rodTip, water, reel ? 0.005 : 0.05);
    if (this.companion) this.companion.lookAt = water;
    this.holes.glow.set(this.fishHole.id, (this.lanternLight.on ? 0.25 : 0) + (this.state.research.glowlure ? 0.15 : 0) + (this.events.teeming(this.fishHole) ? 0.3 : 0));
    // the keys for now
    const touch = this.input.lastDevice === 'touch';
    let hint;
    if (touch) hint = f.state === 'ready' ? 'hold cast, let go to drop the lure' : reel ? 'hold reel to raise the band' : f.state === 'bite' ? 'hook it!' : 'tap jig · back to stand';
    else if (f.state === 'ready') hint = `hold [Space] cast (tap: ${f.targetDepth.toFixed(0)} m) · [E] stand`;
    else if (f.state === 'cast') hint = 'let go of [Space] to drop the lure';
    else if (f.state === 'bite') hint = '[Space] hook it!';
    else if (reel) hint = this.overdrive.is('autoreel') ? 'your seeker is reeling it in' : 'hold [Space] to raise the band · keep the fish inside it';
    else hint = `[Space] jig · [E] stand${this.canBait() ? ' · [B] bait' : ''}${this.bait ? ' · baited' : ''}`;
    if (!touch && f.state !== 'bite' && f.state !== 'cast' && this.companionProfile && (this.overdrive.ready() || this.events.cells(this.state.companion))) hint += ` · [Q] ${this.companionProfile.od.name.toLowerCase()}`;
    this._overdriveAtHole(f, dt);
    this.hud.setHint(hint);
    // the catch bar's picture of the fish (a silhouette until recorded)
    let img = null;
    if (reel && f.hooked && f.hooked.sp) {
      const sp = f.hooked.sp;
      const known = !!this.state.codex[sp.id];
      const key = sp.id + (known ? '' : ':s');
      if (!this._fishImgs) this._fishImgs = {};
      if (!this._fishImgs[key]) {
        const im = new Image();
        im.src = this.icons.fish(sp, known ? false : [0xc4, 0xce, 0xd4], 0.25, 'side');
        this._fishImgs[key] = im;
      }
      img = this._fishImgs[key];
      if (!this._fishImgs[sp.id + ':k']) {
        const im = new Image();
        im.src = this.icons.fish(sp, [0x05, 0x07, 0x0b], 0.25, 'side');
        this._fishImgs[sp.id + ':k'] = im;
      }
      this._fishShadow = this._fishImgs[sp.id + ':k'];
    }
    const fx = this.fishFx(this.fishHole);
    const known = f.hooked && f.hooked.sp && this.state.codex[f.hooked.sp.id];
    const info = {
      fishShadow: this._fishShadow,
      holding: input.down('action'),
      fx,
      reelName: !f.hooked ? '' : f.hooked.snag ? 'something heavy' : (known || fx.id) && f.hooked.sp ? f.hooked.sp.name : 'something',
      fxText: fx.auto ? 'autoreel' : fx.lock ? 'lock-on' : fx.frenzy ? 'frenzy' : f.game && f.game.held > 0 ? 'held!' : '',
      biteName: f.biteFish && f.biteFish.sp && fx.id ? `${f.biteFish.sp.name} · ${f.biteFish.cm.toFixed(0)} cm` : '',
    };
    this.hud.updateFishing(f, this.frame, info, img, this._fishCtx(), dt);
  }

  _fishCtx() {
    const p = this.player;
    const head = this._head || (this._head = new THREE.Vector3());
    head.set(p.pos.x, p.pos.y + 1.45, p.pos.z);
    const box = p.mode === 'sit' ? [-0.38, 0, -0.4, 0.38, 1.36, 0.6] : p.mode === 'hold' ? [-0.4, 0, -0.38, 0.4, 2.05, 0.5] : null;
    return {
      player: p.root.matrixWorld, playerBox: box,
      bot: this.companion && this.companion.root.visible ? this.companion.root.matrixWorld : null,
      hole: this.fishHole, head,
    };
  }

  onCast(depth) {
    this.lastDepth = depth;
    this.audio.plunk();
    this.holes.splash(this.fishHole.id, 0.7);
    this.player.castFlick = 1;
    this.particles.emit(this.fishHole.x, 0.05, this.fishHole.z, 6, { color: 0x91cbde, speed: 0.7, up: 1.2 });
    this.hint('cast', 'Wait for the [!]. Tap [Space] to jig the lure.', 5000);
  }

  onQuiet() {}

  lineMax() {
    return lineMax(this.state);
  }
  mounts() {
    return mounts(this.state);
  }
  packCapacity() {
    return packCapacity(this.state);
  }
  packLevel() {
    return packLevel(this.state);
  }

  lightAtHole(withCompanion = true) {
    let l = 0.08;
    if (withCompanion && this.companionProfile) l += this.companionProfile.brightness * 0.5;
    if (this.lanternLight.on) l += 0.35;
    if (this.state.research.glowlure) l += 0.2;
    return l;
  }

  popFn(x, z) {
    const zone = dominantZone(x, z).id;
    return (sp) => this.state.pop[`${zone}|${sp.id}`] ?? 1;
  }

  lureContext(hole, depth) {
    const aff = { ...(this.companionProfile ? this.companionProfile.aff : {}) };
    if (this.state.research.glowlure) { aff.deep = (aff.deep || 0) + 0.15; aff.night = (aff.night || 0) + 0.15; }
    if (this.events.teeming(hole)) for (const k of ['deep', 'night', 'shy', 'bold']) aff[k] = (aff[k] || 0) + 0.5;
    return {
      x: hole.x, z: hole.z, depth, bottom: depthAt(hole.x, hole.z), phase: this.day.phase(), weather: this.weather.kind,
      aurora: this.auroraVisible, night: this.day.night, light: this.lightAtHole(), bait: this.bait, aff, pop: this.popFn(hole.x, hole.z),
      rare: this.events.teeming(hole) ? 2.5 : 1,
    };
  }

  deviceContext(slot, depth, profile) {
    return {
      x: slot.hole.x, z: slot.hole.z, depth, bottom: depthAt(slot.hole.x, slot.hole.z), phase: this.day.phase(), weather: this.weather.kind,
      aurora: this.auroraVisible, night: this.day.night, light: 0.08 + profile.brightness * 0.5, bait: false, aff: profile.aff,
      pop: this.popFn(slot.hole.x, slot.hole.z), rare: this.events.teeming(slot.hole) ? 2.5 : 1,
    };
  }

  // How lively the sea is: SEEKER NET's moves in the last day, and its pulse right now.
  liveliness() {
    return Math.min(0.3, this.net.movesToday() / 300);
  }
  approachBoost() {
    return (1 + this.liveliness() + this.net.pulse * 0.4);
  }
  networkBoost() {
    return this.approachBoost();
  }
  strikeBonus() {
    return 0;
  }
  deviceSpeed(slot, profile) {
    const c = this.companionProfile;
    const m = profile.mods;
    const night = this.day.night;
    let k = (1 + m.bite * 0.5 + m.nightBite * night * 0.5 + m.dayBite * (1 - night) * 0.5) * (1 + m.devRate + (c && c.token !== profile.token ? c.mods.devRate : 0));
    if (this.events.teeming(slot.hole)) k *= 3;
    return k * this.networkBoost();
  }
  deviceHold(profile) {
    const c = this.companionProfile;
    return 1 + profile.mods.devHold + (c ? c.mods.devHold : 0);
  }
  profileFor(token, slot) {
    const s = this.net.state(token);
    if (!s.activated) return null;
    const p = deviceProfile(Art.info(token).traits, s);
    p.token = token;
    if (slot) slot.profile = p;
    return p;
  }

  listenerSeenTonight() {
    return this._listenerTonight === this.day.day || (this.state.observed.the_listener && this._listenerTonight === this.day.day);
  }
  canRecover() {
    return this.state.stats.catches >= 3 && this.state.lastRecoverDay !== this.day.day;
  }

  onBiteSoon() {
    this.audio.voice(96 * 4, { decay: 0.3, gain: 0.05, partials: [1, 0.5] });
  }

  onBite(mark) {
    if (!mark) {
      this.hud.floatAtWorld(this._v3(this.fishHole.x, 0.5, this.fishHole.z), 'something heavy', { color: 'var(--muted)', rise: 14 });
      this.audio.run();
      return;
    }
    this.audio.bite(toneOf(mark.sp));
    this.holes.splash(this.fishHole.id, 0.6);
    this.particles.emit(this.fishHole.x, 0.05, this.fishHole.z, 6, { color: 0x91cbde, speed: 0.9, up: 1.6 });
    this.shake(0.45);
    this.player.startle = 1;
    if (this.input.lastDevice === 'touch' && navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
      try { navigator.vibrate(30); } catch { /* fine */ }
    }
  }
  onStrike() {
    this.player.strike = 1;
    this.shake(0.3);
    this.hud.floatAtWorld(this._v3(this.fishHole.x, 0.6, this.fishHole.z), 'HIT!', { color: 'var(--text)', big: true, rise: 18, ms: 700 });
    this.particles.emit(this.fishHole.x, 0.05, this.fishHole.z, 10, { color: 0x91cbde, speed: 1.4, up: 2.2 });
    this.overdrive.used('hooked');
  }
  onMissed() {
    this.hud.floatAtWorld(this._v3(this.fishHole.x, 0.5, this.fishHole.z), 'missed', { color: 'var(--muted)', rise: 12, ms: 800 });
  }
  onHooked() {
    this.audio.strike();
    this.hint('reel', 'Hold [Space] to raise the band. Keep the fish inside it.', 6000);
  }
  onSecondChance() {
    this.audio.ui('ready');
    this.shake(0.3);
    this.hud.floatAtWorld(this._v3(this.fishHole.x, 0.9, this.fishHole.z), 'held!', { color: 'var(--teal)', rise: 14 });
  }
  onRun() {
    this.audio.run();
  }
  onLost(why) {
    this.audio.tension(0);
    this.audio.snap();
    this.state.stats.snapped++;
    this.streak = 0;
    this.requests.event('lost');
    this.hud.floatAtWorld(this._v3(this.fishHole.x, 0.6, this.fishHole.z), why === 'snag' ? 'sank away' : 'got away', { color: 'var(--red)', rise: 16, ms: 1000 });
    this.shake(0.5);
  }

  streakMult() {
    const s = this.streak;
    return s >= 8 ? 2 : s >= 5 ? 1.5 : s >= 3 ? 1.25 : 1;
  }

  _v3(x, y, z) {
    return (this._tmpV || (this._tmpV = new THREE.Vector3())).set(x, y, z);
  }

  // ------------------------------------------------------------------ catching
  onLanded(c) {
    const sp = c.sp;
    const st = this.state;
    const rec = st.codex[sp.id] || { caught: 0, kept: 0, released: 0, best: 0, firstDay: st.day, variants: [], trophy: false };
    const isNew = rec.caught === 0;
    const prevBest = rec.best;
    let data = isNew ? RARITY[sp.rarity].data : 1;
    const notes = [];
    const record = c.cm > rec.best;
    if (record && !isNew) data += 2;
    let variant = null;
    const rime = this.companionProfile ? this.companionProfile.mods.rime : 0;
    if (this.weather.snow > 0.5 && sp.tags.includes('cold') && R() < 0.6) variant = 'rimed';
    else if (rime && sp.tags.includes('cold') && R() < 0.25 * rime) variant = 'rimed';
    else if (this.auroraVisible > 0.4 && R() < 0.6) variant = 'aurora-lit';
    if (variant && !rec.variants.includes(variant)) { rec.variants.push(variant); data += 4; }
    const trophy = c.f > 0.93;
    if (trophy && !rec.trophy) { rec.trophy = true; data += 3; }
    if (c.clean) data += 1;
    this.streak++;
    const sm = this.streakMult();
    if (sm > 1) { data = Math.round(data * sm); notes.push(`streak ×${sm}`); }
    if (this.overdrive.is('prime')) { data *= 3; notes.push('prime ×3'); }
    rec.caught++;
    rec.best = Math.max(rec.best, c.cm);
    st.codex[sp.id] = rec;
    st.data += data;
    st.dataTotal += data;
    st.stats.catches++;
    if (this.bait) this.bait = false;
    const teeming = this.events.teeming(this.fishHole);
    this.catchNow = {
      sp, cm: c.cm, f: c.f, kg: weightKg(sp, c.cm), isNew, record, variant, trophy, data, dataNotes: notes, clean: c.clean, fromDevice: c.fromDevice,
      day: st.day, zone: dominantZone(this.fishHole.x, this.fishHole.z).id, prevBest: isNew ? null : prevBest,
    };
    // the Overdrive charges with every catch: more for rare and perfect ones
    const odGain = 0.25 + (c.clean ? 0.08 : 0) + ({ uncommon: 0.05, rare: 0.12, legendary: 0.3 }[sp.rarity] || 0);
    this.overdrive.used('landed');
    const odGot = this.overdrive.add(odGain, 'catch');
    this.requests.event('catch', { sp, cm: c.cm, zone: this.catchNow.zone, clean: c.clean, isNew, phase: this.day.phase(), fromDevice: c.fromDevice, teeming, streak: this.streak });
    // juice: a beat of stillness, the fish bursting out of the hole, a flash
    this.hitstop(0.13);
    this.hud.flash();
    this.shake(isNew ? 0.9 : 0.55);
    this.audio.tension(0);
    this.audio.splash(1);
    this.particles.emit(this.fishHole.x, 0.05, this.fishHole.z, 26, { color: 0x91cbde, speed: 2, up: 3.2, life: 0.9 });
    this.particles.emit(this.fishHole.x, 0.05, this.fishHole.z, 10, { color: 0xedf0f1, speed: 1.4, up: 2.6 });
    this.holes.splash(this.fishHole.id, 1);
    // the Overdrive's gain rises from its own meter, out of the way of the catch
    if (odGot > 0.001) setTimeout(() => this.hud.floatFromMeter(`+${Math.round(odGot * 100)}%`), 500);
    setTimeout(() => (isNew ? this.audio.newRecord() : this.audio.scan(toneOf(sp))), 300);
    if (isNew) {
      const known = SPECIES.filter((s) => st.codex[s.id] || st.observed[s.id]).length;
      setTimeout(() => this.hud.banner('NEW SPECIES', `${known} of ${SPECIES.length}`, sp.rarity === 'rare' || sp.rarity === 'legendary' ? 'gold' : 'teal', 1500), 380);
    } else if (record) setTimeout(() => this.hud.banner('RECORD', `${c.cm.toFixed(1)} cm`, 'gold', 1300), 380);
    this.mode = 'catch';
    this.hud.setQuiet(true);
    this.player.mode = 'hold';
    this.player.cheer = isNew || record ? 1 : 0.5;
    this.cam.mode = 'catch';
    this.cam.yawTarget = this.player.facing + 0.62;
    this.showHeldFish(sp, c.cm);
    this.hud.fishing(false);
    this.line.hide();
    this.hud.setHint(null);
    this._cardT = setTimeout(() => {
      if (this.catchNow) {
        const card = this.panels.showCatch(this.catchNow);
        this.hud.layout.forget('card');
        setTimeout(() => {
          if (!this.panels.rewardNum || !this.panels.catchEl) return;
          const r = this.panels.rewardNum.getBoundingClientRect();
          this.hud.flyData(data, { x: r.left, y: r.top });
        }, 650);
        void card;
      }
    }, isNew ? 1500 : record ? 1200 : 640);
    this.save();
  }

  updateCatch() {
    const input = this.input;
    if (this.panels.open && this.panels.current) return;
    if (!this.panels.catchEl) return;
    if (input.pressed('interact') || input.pressed('action')) {
      if (this.state.creel.length < this.packCapacity()) this.keepCatch();
    } else if (input.pressed('release') || input.pressed('back')) this.releaseCatch();
  }

  keepCatch() {
    const c = this.catchNow;
    if (!c || this.state.creel.length >= this.packCapacity()) return;
    this.state.creel.push({ sp: c.sp.id, cm: c.cm, kg: c.kg, variant: c.variant, day: c.day });
    this.state.codex[c.sp.id].kept++;
    this.state.stats.kept++;
    const key = `${c.zone}|${c.sp.id}`;
    this.state.pop[key] = Math.max(0.35, (this.state.pop[key] ?? 1) - 0.07);
    this.audio.ui('buy');
    this.stowHeldFish();
    this.requests.event('keep');
    if (this.state.creel.length >= this.packCapacity()) this.hint('packfull', 'Your pack is full: empty it at the capsule.', 5000);
    this.afterCatch();
  }

  releaseCatch() {
    const c = this.catchNow;
    if (!c) return;
    this.state.codex[c.sp.id].released++;
    this.state.stats.released++;
    this.releaseHeldFish();
    this.afterCatch();
  }

  afterCatch() {
    const c = this.catchNow;
    this.catchNow = null;
    clearTimeout(this._cardT);
    this.panels.hideCatch();
    this.hud.setQuiet(false);
    if (c.isNew && c.sp.sense) this.hint('sense_' + c.sp.sense, `The ${c.sp.name} can lend your visor its sense: attune to it in the Codex [Tab].`, 5500);
    this.mode = 'fish';
    this.player.mode = 'sit';
    this.cam.mode = 'fish';
    this.cam.yawTarget = this.player.facing - 1.62;
    this.hud.fishing(true);
    this.fishing.resume();
    this.save();
  }

  showHeldFish(sp, cm) {
    this.clearHeldFish();
    const mesh = new THREE.Mesh(fishGeometry(sp), worldMaterial({ swim: 0.12 }));
    addOutline(mesh);
    // held up, a little larger than life, so it reads at the camera's distance
    mesh.scale.setScalar(clamp((cm / 100) * 1.6, 0.26, 1.6));
    this.scene.add(mesh);
    this.heldFish = { mesh, t: 0, state: 'rise', sp, cm, from: new THREE.Vector3(this.fishHole.x, -0.3, this.fishHole.z) };
    if (sp.id === 'orb_gulper') {
      const orb = new THREE.Mesh(orbGeometry(), worldMaterial());
      mesh.add(orb);
      orb.position.set(0, 0.45, 0.3);
    }
  }

  updateHeldFish(dt) {
    const hf = this.heldFish;
    if (!hf) return;
    hf.t += dt;
    const p = this.player;
    const hands = this._hands || (this._hands = new THREE.Vector3());
    hands.set(Math.sin(p.facing) * 0.22, 1.86, Math.cos(p.facing) * 0.22).add(p.pos);
    const m = hf.mesh;
    const RISE = 0.62;
    if (hf.state === 'rise' && hf.t >= RISE) {
      hf.state = 'hold';
      this.audio.splash(0.3);
    }
    if (hf.state === 'rise') {
      // it leaps out of the hole in an arc, flipping
      const k = clamp(hf.t / RISE, 0, 1);
      m.position.lerpVectors(hf.from, hands, k * k * (3 - 2 * k));
      m.position.y += Math.sin(k * Math.PI) * 1.3;
      m.rotation.set(-Math.PI / 2 * (1 - k), p.facing + Math.PI / 2, Math.sin(k * Math.PI) * 2.6 * (1 - k * 0.5));
      if (this.frame % 2 === 0) this.particles.emit(m.position.x, m.position.y, m.position.z, 1, { color: 0x91cbde, speed: 0.3, up: 0.2, life: 0.4 });
    } else if (hf.state === 'hold') {
      m.position.copy(hands);
      m.position.y += Math.sin(this.time * 6) * 0.01;
      // it wriggles now and then, on the 12 fps grid
      const wr = this.frame % 30 < 6 ? Math.sin(this.frame * 2.2) * 0.25 : 0;
      m.rotation.set(0, p.facing + Math.PI / 2 + wr, Math.sin(this.time * 9) * 0.08);
    } else if (hf.state === 'stow') {
      const k = clamp(hf.t / 0.45, 0, 1);
      const back = this._back || (this._back = new THREE.Vector3());
      back.set(-Math.sin(p.facing) * 0.35, 1.0, -Math.cos(p.facing) * 0.35).add(p.pos);
      m.position.lerpVectors(hands, back, k);
      m.position.y += Math.sin(k * Math.PI) * 0.35;
      m.scale.setScalar(Math.max(0.001, m.scale.x * (1 - dt * 5)));
      if (k >= 1) {
        this.particles.emit(back.x, back.y, back.z, 6, { color: 0xb9a87b, speed: 0.6, up: 0.6 });
        this.clearHeldFish();
      }
    } else if (hf.state === 'drop') {
      const k = clamp(hf.t / 0.55, 0, 1);
      const to = this._to || (this._to = new THREE.Vector3());
      to.set(hf.from.x, -0.6, hf.from.z);
      m.position.lerpVectors(hands, to, k * k);
      m.position.y += Math.sin(k * Math.PI) * 0.5;
      m.rotation.x = -Math.PI / 2 * k;
      if (k >= 1) {
        this.audio.splash(0.6);
        this.particles.emit(hf.from.x, 0.05, hf.from.z, 12, { color: 0x91cbde, speed: 1, up: 1.8 });
        if (this.fishHole) this.holes.splash(this.fishHole.id, 1);
        this.clearHeldFish();
      }
    }
  }

  stowHeldFish() {
    if (this.heldFish) { this.heldFish.state = 'stow'; this.heldFish.t = 0; }
  }
  releaseHeldFish() {
    if (this.heldFish) { this.heldFish.state = 'drop'; this.heldFish.t = 0; }
  }
  clearHeldFish() {
    if (!this.heldFish) return;
    this.scene.remove(this.heldFish.mesh);
    this.heldFish = null;
  }

  canBait() {
    return !this.bait && this.state.creel.some((f) => f.cm <= 32);
  }
  useBait() {
    if (this.bait) return;
    const i = this.state.creel.findIndex((f) => f.cm <= 32);
    if (i < 0) {
      this.audio.ui('deny');
      return;
    }
    this.state.creel.splice(i, 1);
    this.bait = true;
    this.audio.ui('click');
  }

  // ------------------------------------------------------------------ the Overdrive
  // It is fired at a hole, where it does its work. The first time it fills, your seeker
  // fires it by itself as soon as your lure is down, so you see what it does before you
  // are ever asked to choose when.
  unleash() {
    const c = this.companionProfile;
    if (!c) return;
    if (this.overdrive.active) return;
    if (this.mode !== 'fish') { this.hud.nudge(); return; }
    if (this.events.useCell(this.state.companion)) {
      this.overdrive.fire(true);
      this.save();
      return;
    }
    if (!this.overdrive.fire(false)) {
      this.audio.ui('deny');
      this.hud.nudge();
    }
  }

  onOverdrive(a, p) {
    const od = p.od;
    this.state.odUsed = true;
    this.audio.overdrive(a.super);
    this.hud.flash();
    this.shake(a.super ? 1 : 0.6);
    this.hud.banner(od.name.toUpperCase(), a.super ? `${od.short} · twice over` : od.short, a.super ? 'glow' : 'teal', 2200);
    if (this.companion) this.companion.surge = 1;
    if (a.id === 'deepscan') { this._scanSense = true; }
    this.requests.event('overdrive');
  }

  onOverdriveEnd(a) {
    if (a.id === 'deepscan') this._scanSense = false;
  }

  // At the hole: the first Overdrive fires itself; one at work shows it, the hole lit in
  // its colour and motes streaming from your seeker down the line.
  _overdriveAtHole(f, dt) {
    const od = this.overdrive;
    if (!this.state.odUsed && od.ready() && f.state === 'wait') {
      this._odDemo = (this._odDemo || 0) + dt;
      if (this._odDemo > 1.6) { this._odDemo = 0; this.unleash(); }
    } else this._odDemo = 0;
    if (!od.active || !this.companion) return;
    const hole = this.fishHole;
    this.holes.glow.set(hole.id, Math.max(this.holes.glow.get(hole.id) || 0, 0.55 + Math.sin(this.time * 6) * 0.15));
    this._odMote = (this._odMote || 0) + dt;
    if (this._odMote > 0.09) {
      this._odMote = 0;
      const b = this.companion.root.position;
      const t = Math.random();
      this.particles.emit(b.x + (hole.x - b.x) * t, b.y * (1 - t) + 0.1, b.z + (hole.z - b.z) * t, 1, { color: od.active.id === 'prime' || od.active.id === 'crescendo' ? 0xe3cf8e : 0x91cbde, speed: 0.2, up: -0.4, life: 0.5 });
    }
    if (od.active.id === 'frenzy' && this.frame % 5 === 0) this.holes.splash(hole.id, 0.25);
  }

  surgeCells(token) {
    return this.events.cells(token);
  }

  // A seeker that woke on the ice: tune it in, with the surge of its first light.
  meetWoken(b, asCompanion) {
    const id = b.token;
    this.tune(id);
    this.events.addCell(id);
    this.events.removeBeacon(id);
    this.state.data += 5;
    this.state.dataTotal += 5;
    this.audio.newRecord();
    this.hud.banner(`#${id} JOINS YOU`, 'with a surge of its first light', 'glow', 1800);
    const at = this.hud.datac.getBoundingClientRect();
    this.hud.flyData(5, { x: at.left - 40, y: at.top + 40 });
    if (asCompanion === 'companion' || !this.state.companion) this.setCompanion(id);
    this.save();
  }

  // ------------------------------------------------------------------ recovered seekers and the Listener
  onRecovered(hole) {
    this.state.lastRecoverDay = this.day.day;
    this.audio.splash(1);
    // a seeker lost under the ice: which one depends on where and when you found it
    const id = 1 + Math.floor(hash1(Math.floor(hole.x * 7) * 31 + Math.floor(hole.z * 7) * 17 + this.day.day * 101) * 2222);
    if (!this.state.recovered.includes(id)) this.state.recovered.push(id);
    const s = this.net.state(id);
    if (s.activated) {
      this.tune(id);
      this.hud.toast(`A lost seeker: #${id}, awake`, 'net', 4000, { face: id });
    } else {
      this.watch(id);
      this.hud.toast(`A lost seeker: #${id}, dormant · watched`, 'net', 4000, { face: id });
    }
    this.audio.chirp(id, true, s.activated);
    this.fishing.resume();
    this.save();
  }

  onListener(kind) {
    if (kind === 'rise') {
      this.underIce.rise(this.fishHole.x, this.fishHole.z);
      this.audio.mood.listener = 1;
    } else if (kind === 'sink') {
      this.underIce.sink();
      this.audio.mood.listener = 0;
    } else if (kind === 'recorded') {
      this.underIce.sink();
      this.audio.mood.listener = 0;
      this._listenerTonight = this.day.day;
      const first = !this.state.observed.the_listener;
      this.state.observed.the_listener = this.state.observed.the_listener || this.day.day;
      if (first) {
        this.state.data += RARITY.legendary.data;
        this.state.dataTotal += RARITY.legendary.data;
      }
      this.audio.boom();
      setTimeout(() => this.audio.newRecord(), 1200);
      this.shake(1.5);
      this.hud.banner(first ? 'THE LISTENER' : 'IT LISTENED', first ? 'recorded' : '', 'gold', 2600);
      this.save();
    }
  }

  // ------------------------------------------------------------------ SEEKER NET devices
  async spawnCompanion() {
    const id = this.state.companion;
    if (this.companion && this.companion.token === id) return;
    if (this.companion) {
      this.companion.dispose();
      this.lights = this.lights.filter((l) => l !== this.companion.light);
      this.companion = null;
    }
    this.companionProfile = null;
    if (!id || !Art.ready()) {
      this.hud.setCompanion(0);
      return;
    }
    const s = this.net.state(id);
    if (!s.activated) {
      this.state.companion = 0;
      return;
    }
    const bot = new SeekerBot(this.scene, this.net);
    this.companionProfile = this.profileFor(id);
    await bot.setToken(id, this.companionProfile);
    bot.place(this.player.pos.x - 1, this.player.pos.z + 0.6, this.player.facing);
    this.companion = bot;
    this.lights.push(bot.light);
    this.hud.setCompanion(id, s);
  }

  updateCompanion(dt) {
    const c = this.companion;
    const p = this.player;
    // left far behind (a tether, a reload): it catches up at once
    if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > 40) c.place(p.pos.x - Math.sin(p.facing) * 1.5, p.pos.z - Math.cos(p.facing) * 1.5, p.facing);
    if ((this.mode === 'fish' || this.mode === 'catch') && this.fishHole) {
      const h = this.fishHole;
      // across the hole from the Seeker, a little to its left: in view, out of the way
      const tx = h.x + Math.sin(p.facing + 0.55) * 1.0;
      const tz = h.z + Math.cos(p.facing + 0.55) * 1.0;
      c.follow(dt, { x: tx, z: tz }, 0.05, this.frame);
      if (!c.moving) c.faceTowards(p.pos.x * 0.5 + h.x * 0.5, p.pos.z * 0.5 + h.z * 0.5, dt);
    } else if (this.mode === 'capsule') {
      const tx = CAPSULE.x + 1.6, tz = CAPSULE.z - 1.4;
      c.follow(dt, { x: tx, z: tz }, 0.1, this.frame);
      if (!c.moving) c.faceTowards(CAPSULE.x, CAPSULE.z - 3, dt, 3);
      c.lookAt = this.capsule.center;
    } else {
      const back = p.facing + Math.PI + 0.75;
      const tx = p.pos.x + Math.sin(back) * 1.5, tz = p.pos.z + Math.cos(back) * 1.5;
      c.follow(dt, { x: tx, z: tz }, 0.7, this.frame);
      if (!c.moving) c.faceTowards(p.pos.x, p.pos.z, dt, 3);
      c.lookAt = null;
    }
    c.overdrive = this.overdrive.active ? 1 : this.overdrive.ready() ? 0.5 : 0;
    c.update(dt, this.frame, this.time);
    if (this.frame % 240 === 0) c.refreshLook();
  }

  freeMounts() {
    return this.mounts() - this.devices.slots.length;
  }
  freeSeekers() {
    return this.state.roster.filter((id) => id !== this.state.companion && this.deviceHoleOf(id) === null && this.net.isActivated(id));
  }
  deviceHoleOf(id) {
    for (const [hole, tok] of Object.entries(this.state.devices)) if (tok === id) return Number(hole);
    return null;
  }

  spawnDevices() {
    for (const s of this.devices.slots) if (s.bot) { s.bot.dispose(); this.lights = this.lights.filter((l) => l !== s.bot.light); }
    this.devices.slots = [];
    for (const [holeId, token] of Object.entries(this.state.devices)) {
      const hole = this.holes.byId(Number(holeId));
      if (!hole || !this.net.isActivated(token)) { delete this.state.devices[holeId]; continue; }
      this._spawnDevice(hole, token, false);
    }
  }

  async _spawnDevice(hole, token, announce) {
    const bot = new SeekerBot(this.scene, this.net);
    const slot = new DeviceSlot(hole, token, bot);
    // beside the hole, facing it; set by you leaving, it drops in from the sky, as the
    // network's sparks do
    const a = hash1(hole.id * 13) * TAU;
    slot.bx = hole.x + Math.cos(a) * 0.8;
    slot.bz = hole.z + Math.sin(a) * 0.8;
    if (announce) slot.arrive = 1.3;
    this.devices.slots.push(slot);
    const profile = this.profileFor(token, slot);
    await bot.setToken(token, profile);
    bot.place(slot.bx, slot.bz, Math.atan2(hole.x - slot.bx, hole.z - slot.bz));
    this.lights.push(bot.light);
    this.devices.chooseDepth(slot, profile);
  }

  placeDevice(hole, token) {
    if (this.freeMounts() <= 0 || !this.net.isActivated(token)) return;
    this.state.devices[hole.id] = token;
    this._spawnDevice(hole, token, true);
    this.save();
  }

  removeDevice(holeId, puff = false) {
    const slot = this.devices.slotAt(holeId);
    if (slot && puff) this.particles.emit(slot.bx, 0.4, slot.bz, 12, { color: 0x91cbde, speed: 1, up: 1.6, life: 0.6 });
    if (slot) {
      if (slot.bot) { slot.bot.dispose(); this.lights = this.lights.filter((l) => l !== slot.bot.light); }
      this.devices.slots = this.devices.slots.filter((s) => s !== slot);
    }
    delete this.state.devices[holeId];
    this.save();
  }

  onDeviceBite(slot, profile) {
    const d = Math.hypot(slot.hole.x - this.player.pos.x, slot.hole.z - this.player.pos.z);
    const c = this.companionProfile;
    const loud = profile.mods.loud || (c && c.mods.loud);
    this.audio.chirp(slot.token, loud || d < 25, true);
    if (d < 120 || loud) this.hud.toast(`#${slot.token} has a bite · ${Math.round(slot.hold)} s`, 'net', 3000, { face: slot.token });
    this.holes.splash(slot.hole.id, 0.6);
  }
  onDeviceEscape() {}

  takeDeviceLine(slot) {
    const fish = this.devices.take(slot);
    this.sit(slot.hole);
    this.fishing.begin(slot.hole, { hooked: fish });
  }

  keepsOpen(h) {
    if (this.fishHole && this.fishHole.id === h.id) return true;
    if (h.charged && h.charged > Date.now()) return true;
    const slot = this.devices.slotAt(h.id);
    const c = this.companionProfile;
    return !!((slot && slot.profile && slot.profile.mods.freeze) || (c && c.mods.freeze && slot));
  }

  // ------------------------------------------------------------------ the relay
  tune(id) {
    if (!(id >= 1 && id <= 2222)) return false;
    const s = this.net.state(id);
    if (!s.activated) {
      this.watch(id);
      return false;
    }
    if (!this.state.roster.includes(id)) {
      if (this.state.roster.length >= 12) {
        this.audio.ui('deny');
        return false;
      }
      this.state.roster.push(id);
      this.net.track([id]);
      this.net.refresh(id).then(() => this.onNetUpdate());
      this.audio.chirp(id, false, true);
    }
    this.state.watch = (this.state.watch || []).filter((w) => w !== id);
    this.save();
    return true;
  }

  untune(id) {
    this.state.roster = this.state.roster.filter((x) => x !== id);
    if (this.state.companion === id) this.setCompanion(0);
    this.net.untrack(id);
    this.save();
  }

  watch(id) {
    this.state.watch = this.state.watch || [];
    if (!this.state.watch.includes(id)) this.state.watch.push(id);
    this.net.track([id]);
    this.save();
  }
  unwatch(id) {
    this.state.watch = (this.state.watch || []).filter((x) => x !== id);
    this.save();
  }

  async setCompanion(id) {
    this.state.companion = id;
    this.overdrive.active = null;
    await this.spawnCompanion();
    this.save();
  }

  sweep() {
    const act = this.net.activatedIds().filter((id) => !this.state.roster.includes(id));
    return picksFor(act, Math.floor(this.time * 10) + this.state.roster.length * 7, 3, 9);
  }

  onNetPulse() {
    this.audio.pulse();
  }

  onNetUpdate() {
    // watched seekers that have woken are tuned in
    for (const id of [...(this.state.watch || [])]) {
      if (this.net.isActivated(id)) {
        this.state.watch = this.state.watch.filter((w) => w !== id);
        if (this.state.roster.length < 12 && !this.state.roster.includes(id)) this.state.roster.push(id);
        this.events.addCell(id);
        this.hud.toast(`#${id} woke, and is tuned in`, 'good', 4000, { face: id });
        this.audio.chirp(id, true, true);
      }
    }
    if (this.companion) {
      this.companion.refreshLook();
      this.companionProfile = this.profileFor(this.state.companion);
      this.hud.setCompanion(this.state.companion, this.net.state(this.state.companion));
    }
    this.state.net = this.net.snapshot();
  }

  // ------------------------------------------------------------------ research, pack, tank
  research(id) {
    const r = RESEARCH_BY_ID[id];
    if (!r || !available(this.state, r) || this.state.data < r.cost) {
      this.audio.ui('deny');
      return null;
    }
    this.state.data -= r.cost;
    this.state.research[id] = true;
    let sub = r.change(this.state);
    if (r.mounts && !this.freeSeekers().length) {
      const id2 = this.sweep()[0];
      if (id2 && this.tune(id2)) sub = `#${id2} will keep the holes you leave`;
    }
    this.audio.newRecord();
    // at the terminal, it says so in the terminal; anywhere else, across the screen
    if (!this.panels.open) {
      this.hud.flash();
      this.hud.banner(r.name.toUpperCase(), sub, 'gold', 2000);
    }
    if (r.pack) this.player.setPack(r.pack);
    this.save();
    return sub;
  }

  // The cheapest research not done yet: the next thing to save up for.
  nextGoal() {
    const list = RESEARCH.filter((r) => available(this.state, r)).sort((a, b) => a.cost - b.cost);
    const r = list[0];
    if (!r) return null;
    const ready = this.state.data >= r.cost;
    if (ready) this.hint('research_ready', `Enough data for ${r.name}: research it at the capsule.`, 5000);
    return { name: r.name.toLowerCase(), cost: r.cost, ready };
  }

  moveToTank(i) {
    if (this.state.tank.length >= 12) return;
    const f = this.state.creel.splice(i, 1)[0];
    if (!f) return;
    this.state.tank.push(f);
    this.rebuildTank();
    this.save();
  }

  moveToPack(i) {
    if (this.state.creel.length >= this.packCapacity()) return;
    const f = this.state.tank.splice(i, 1)[0];
    if (!f) return;
    this.state.creel.push(f);
    this.rebuildTank();
    this.save();
  }

  releaseFrom(where, i) {
    const list = this.state[where];
    const f = list.splice(i, 1)[0];
    if (!f) return;
    if (this.state.codex[f.sp]) this.state.codex[f.sp].released++;
    if (where === 'tank') this.rebuildTank();
    this.audio.splash(0.4);
    this.save();
  }

  rebuildTank() {
    for (const t of this.tankFish) this.scene.remove(t.mesh);
    this.tankFish = [];
    const c = this.props.tankPos;
    this.state.tank.forEach((f, i) => {
      const sp = SPECIES_BY_ID[f.sp];
      if (!sp) return;
      const mesh = new THREE.Mesh(fishGeometry(sp), worldMaterial({ swim: 0.1 }));
      const s = clamp(f.cm / 100, 0.08, 0.55);
      mesh.scale.setScalar(s);
      this.scene.add(mesh);
      this.tankFish.push({ mesh, a: (i / 12) * TAU, r: 0.25 + (i % 3) * 0.17, y: c.y - 0.55 + (i % 5) * 0.25, sp: 0.4 + hash1(i) * 0.5 });
    });
  }

  updateTank(dt) {
    const c = this.props.tankPos;
    for (const t of this.tankFish) {
      t.a += t.sp * dt;
      t.mesh.position.set(c.x + Math.cos(t.a) * t.r, t.y + Math.sin(t.a * 2) * 0.04, c.z + Math.sin(t.a) * t.r);
      t.mesh.rotation.y = -t.a;
    }
  }

  populationText(sp) {
    const zones = Object.entries(sp.zones).filter(([, v]) => v >= 0.3).map(([k]) => k);
    let low = 1;
    for (const z of zones) low = Math.min(low, this.state.pop[`${z}|${sp.id}`] ?? 1);
    return low > 0.85 ? 'plentiful' : low > 0.6 ? 'thinning' : 'scarce, recovering';
  }

  onNewDay() {
    this.state.day = this.day.day;
    for (const k of Object.keys(this.state.pop)) {
      this.state.pop[k] = Math.min(1, this.state.pop[k] + 0.05);
      if (this.state.pop[k] >= 1) delete this.state.pop[k];
    }
  }

  // ------------------------------------------------------------------ the capsule
  // As in The Seeker: you leap up into the lift under the pod, it carries you up the
  // stilt, and the frosted glass clears to show you inside.
  enterCapsule(tab = 0) {
    if (this.mode !== 'walk') return;
    const p = this.player;
    this.mode = 'capsule';
    this.hud.setPrompt(null);
    this.hud.setHint(null);
    this._seq = { step: 'approach', t: 0, tab, from: p.pos.clone() };
    this.cam.mode = 'capsule';
    this.audio.ui('open');
  }

  updateCapsule(dt) {
    const s = this._seq;
    if (!s) return;
    const p = this.player;
    const cap = this.capsule;
    s.t += dt;
    const base = cap.base;
    if (s.step === 'approach') {
      // walk under the stilt, face the sea, crouch
      const k = clamp(s.t / 0.45, 0, 1);
      p.pos.x = s.from.x + (base.x - s.from.x) * k;
      p.pos.z = s.from.z + (base.z + 0.0 - s.from.z) * k;
      p.pos.y = groundHeight(p.pos.x, p.pos.z);
      p.faceTowards(base.x, base.z - 5, dt, 8);
      p.mode = k < 1 ? 'walk' : 'crouch';
      p.speed = k < 1 ? 2.5 : 0;
      cap.callLift(dt);
      if (s.t > 0.7 && cap.liftDown()) { s.step = 'leap'; s.t = 0; this.audio.jump(); }
    } else if (s.step === 'leap') {
      // a leap up into the lift
      const k = clamp(s.t / 0.38, 0, 1);
      p.mode = 'leap';
      p.pos.y = groundHeight(base.x, base.z) + Math.sin(k * Math.PI * 0.5) * (cap.liftBottom - groundHeight(base.x, base.z) - 0.3);
      if (k >= 1) {
        s.step = 'ride';
        s.t = 0;
        p.hidden = true;
        this.audio.clunk();
        this.particles.emit(base.x, cap.liftBottom, base.z, 10, { color: 0xedf0f1, speed: 0.8, up: -0.4, life: 0.8 });
      }
    } else if (s.step === 'ride') {
      if (cap.rideUp(dt)) {
        s.step = 'dock';
        s.t = 0;
        this.audio.clunk();
        this.audio.steam();
        cap.puff(this.particles);
        p.place(cap.inside.x, cap.inside.z, cap.insideFacing);
        p.pos.y = cap.inside.y;
        p.sync();
        p.hidden = false;
        p.mode = 'inside';
      }
    } else if (s.step === 'dock') {
      cap.setFrost(Math.max(0, 1 - s.t / 0.9));
      if (s.t >= 0.9) {
        s.step = 'inside';
        this.audio.mood.indoors = 1;
        this.panels.showCapsule(s.tab, () => this.leaveCapsule());
      }
    } else if (s.step === 'inside') {
      p.mode = 'inside';
    } else if (s.step === 'leave') {
      cap.setFrost(Math.min(1, s.t / 0.5));
      if (s.t >= 0.55) {
        s.step = 'drop';
        s.t = 0;
        p.hidden = true;
        this.audio.clunk();
      }
    } else if (s.step === 'drop') {
      if (cap.rideDown(dt)) {
        s.step = 'land';
        s.t = 0;
        p.hidden = false;
        p.place(base.x, base.z + 0.0, cap.insideFacing);
        p.pos.y = cap.liftBottom - 0.4;
        p.mode = 'leap';
        this.audio.steam();
      }
    } else if (s.step === 'land') {
      const k = clamp(s.t / 0.32, 0, 1);
      const gy = groundHeight(base.x, base.z);
      p.pos.y = gy + (cap.liftBottom - 0.4 - gy) * (1 - k * k);
      p.pos.z = base.z - k * 1.4;
      if (k >= 1) {
        p.pos.y = gy;
        p.mode = 'land';
        p.landT = 1;
        this.particles.emit(p.pos.x, 0.05, p.pos.z, 14, { color: 0xedf0f1, speed: 1.2, up: 1 });
        this.audio.step(0, true);
        this.shake(0.2);
        s.step = 'out';
        s.t = 0;
      }
    } else if (s.step === 'out') {
      if (s.t > 0.25) {
        this._seq = null;
        this.mode = 'walk';
        p.mode = 'walk';
        this.cam.mode = 'walk';
        // from a quarter turn round, so the stilt is never between the camera and you
        this.cam.yaw = p.facing + Math.PI - 1.05;
        this.cam.pitch = 0.32;
        cap.park();
      }
    }
    this.cam.capsuleShot(s.step, cap, p.pos);
  }

  leaveCapsule() {
    if (!this._seq) return;
    this.audio.mood.indoors = 0;
    this._seq.step = 'leave';
    this._seq.t = 0;
  }

  // ------------------------------------------------------------------ rest and travel
  restUntil(phase) {
    const target = REST_AT[phase];
    this.fadeThrough(() => {
      if (this.day.t >= target - 0.01) this.day.day++;
      this.day.t = target;
      this.day.sample();
      if (this.day.day !== this.state.day) this.onNewDay();
      for (const h of this.state.holes) h.freeze = Math.min(1, h.freeze + 0.3);
      this.leaveCapsule();
    });
  }

  updateTethers() {
    for (const t of this.props.tethers) {
      const d = Math.hypot(this.player.pos.x - t.x, this.player.pos.z - t.z);
      if (!this.state.tethers[t.id] && d < 7) {
        this.state.tethers[t.id] = true;
        this.audio.voice(96 * 3, { decay: 2, gain: 0.05, verb: 0.6, partials: [1, 0.3, 0.15] });
        this.hud.toast(`${t.name} tether attuned`, 'good', 2600, { icon: 'pin', tint: '#d6edf5' });
        this.save();
      }
      t.core.material.uniforms.uTint.value.setScalar(this.state.tethers[t.id] ? 1 : 0.35);
      t.lightObj.intensity = this.state.tethers[t.id] ? 0.55 : 0.1;
    }
  }

  showTravel(from) {
    const others = this.props.tethers.filter((t) => t.id !== from.id && this.state.tethers[t.id]);
    if (!others.length) {
      this.hud.toast('No other tether node is attuned yet. Walk near one to attune it.', '', 4000);
      return;
    }
    const w = this.panels._window('Tether', { kind: 'travel', icon: 'pin', iconTint: '#d6edf5' });
    for (const t of others) {
      const b = document.createElement('button');
      b.textContent = `travel to ${t.name}`;
      b.style.margin = '0 calc(var(--u) * 3) calc(var(--u) * 3) 0';
      b.onclick = () => {
        this.panels.close();
        this.fadeThrough(() => {
          const a = 0.8;
          this.player.place(t.x + Math.cos(a) * 1.6, t.z + Math.sin(a) * 1.6, this.player.facing);
          if (this.companion) this.companion.place(t.x + 1, t.z + 2.2, 0);
          this.cam.target.copy(this.player.pos);
        });
      };
      w.body.append(b);
    }
  }

  fadeThrough(fn) {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'fixed', inset: '0', background: '#04060a', opacity: '0', transition: 'opacity 0.5s steps(5)', pointerEvents: 'none' });
    document.body.append(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    setTimeout(() => {
      fn();
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 600);
    }, 600);
  }

  // ------------------------------------------------------------------ the sky, senses and light
  auroraTonight() {
    const natural = 0.1 + hash1(this.day.day * 13 + (this.state.weatherSeed % 997)) * 0.4;
    return clamp(natural + this.net.auroraNet() + this.net.pulse * 0.3, 0, 1);
  }

  updateAurora(dt) {
    const target = this.auroraTonight() * this.day.night * (1 - this.weather.overcast * 0.8);
    this.auroraVisible = damp(this.auroraVisible, target, 0.5, dt);
  }

  toggleSense() {
    this.senseOn = !this.senseOn;
    const names = { glass: 'Glass sight', lantern: 'Lantern eye', choir: 'Choir hearing' };
    this.audio.ui(this.senseOn ? 'open' : 'close');
    this._lastMarkIds.clear();
  }

  setSense(id) {
    this.state.sense = id;
    this.senseOn = !!id;
    this.save();
  }

  applySenses(dt) {
    const glass = (this.senseOn && this.state.sense === 'glass') || this._scanSense ? 1 : 0;
    U.uSense.value = damp(U.uSense.value, glass, 3, dt);
    const lantern = this.senseOn && this.state.sense === 'lantern' ? this.day.night : 0;
    U.uExposure.value = damp(U.uExposure.value, 1 + lantern * 0.8, 3, dt);
  }

  toggleLantern() {
    if (!this.state.research.lantern) {
      this.hud.toast('You have no lantern yet. Research one at the capsule.', '', 2500);
      return;
    }
    this.state.lantern = !this.state.lantern;
    this.audio.ui('click');
  }

  updateShadows() {
    const items = this._shadowItems;
    items.length = 0;
    const p = this.player.pos;
    if (!this.player.hidden && this.mode !== 'capsule') items.push({ x: p.x, y: groundHeight(p.x, p.z), z: p.z, r: 0.42, h: p.y - groundHeight(p.x, p.z) });
    const bot = (b) => b && b.root.visible && items.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z, r: 0.34, h: b.root.position.y - b.pos.y });
    bot(this.companion);
    for (const s of this.devices.slots) bot(s.bot);
    for (const pl of this.events.pillars) bot(pl.bot);
    const strength = (0.55 - this.weather.overcast * 0.3) * (1 - this.day.night * 0.5);
    this.shadows.update(items, this.day.lightDir, strength);
  }

  updateLights() {
    const p = this.player.pos;
    this.lanternLight.on = !!(this.state.research.lantern && this.state.lantern) && !this.player.hidden;
    this.lanternLight.pos.set(p.x + Math.sin(this.player.facing + 1.2) * 0.3, p.y + 0.75, p.z + Math.cos(this.player.facing + 1.2) * 0.3);
    this.capsuleLight.intensity = 1.2 + this.day.night * 0.6;
    this.capsuleInner.intensity = (1 - this.capsule.frost) * 2.2;
    this.capsuleInner.on = this.capsule.frost < 0.99;
  }

  // ------------------------------------------------------------------ audio mood
  updateAudio(dt) {
    const a = this.audio;
    if (!a.ready) return;
    const m = a.mood;
    m.night = this.day.night;
    m.aurora = this.auroraVisible;
    m.snow = this.weather.snow;
    const zw = zoneWeights(this.player.pos.x, this.player.pos.z);
    m.deep = clamp(zw.drop * 1.4, 0, 1);
    m.fight = damp(m.fight, this.fishing.state === 'reel' ? 1 : 0, 2, dt);
    a.update(dt);
  }

  // ------------------------------------------------------------------ helpers
  zoneInfo() {
    const p = this.player.pos;
    if (this.mode === 'capsule') return { name: 'the capsule', depth: '' };
    if (groundHeight(p.x, p.z) > 0.05 || Math.hypot(p.x, p.z) > shoreAt(p.x, p.z) - 0.5) return { name: 'the shore', depth: '' };
    const z = dominantZone(p.x, p.z);
    return { name: z.name, depth: `${depthAt(p.x, p.z).toFixed(0)} m below · ` };
  }

  depthText(hole) {
    return depthAt(hole.x, hole.z).toFixed(0);
  }

  compassMarks() {
    const out = [{ text: 'capsule', x: CAPSULE.x, z: CAPSULE.z, cls: 'gold', icon: 'capsule' }];
    for (const t of this.props.tethers) if (this.state.tethers[t.id] && t.id !== 'home') out.push({ text: '◇', x: t.x, z: t.z, cls: '' });
    for (const s of this.devices.slots) out.push({ text: `#${s.token}`, x: s.hole.x, z: s.hole.z, cls: s.state === 'hooked' ? 'alert' : 'mark', icon: s.state === 'hooked' ? 'hook' : null, dist: s.state === 'hooked' });
    for (const r of this.requests.list) {
      if (r.song && !r.done && r.zone && ZONE[r.zone]) out.push({ text: r.zone, x: ZONE[r.zone].x, z: ZONE[r.zone].z, cls: 'mark', icon: 'note' });
    }
    return out.concat(this.events.marks(), this.camp.marks());
  }

  blocked(x, z) {
    // the capsule's legs and the tank
    if (Math.hypot(x - CAPSULE.x, z - CAPSULE.z) < 0.6) return true;
    if (Math.hypot(x - TANK.x, z - TANK.z) < 1.05) return true;
    for (const h of this.state.holes) if (Math.hypot(x - h.x, z - h.z) < 0.24) return true;
    for (const s of this.devices.slots) if (s.bx !== undefined && Math.hypot(x - s.bx, z - s.bz) < 0.42) return true;
    if (this.camp && this.camp.blocked(x, z)) return true;
    return false;
  }

  hint(key, text, ms = 5000) {
    if (!this.state.settings.hints || this.state.hints[key]) return;
    this.state.hints[key] = true;
    this.hud.coach(text, ms);
  }

  onWindowOpened() {
    this.input.releaseAll();
  }
  onWindowClosed() {
    this.input.releaseAll();
  }

  // ------------------------------------------------------------------ settings and saving
  applySettings() {
    const s = this.state.settings;
    this.audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
    this.px.setPixelSize(s.pixel);
  }

  setSetting(k, v) {
    this.state.settings[k] = v;
    if (k === 'chain') {
      this.net.enabled = v;
      if (v) this.net.start();
      else this.net.stop();
    }
    this.applySettings();
    this.save();
  }

  save(announce = false) {
    this._saveT = 0;
    if ((this.mode === 'title' || this.mode === 'loading') && !this.hasSave) return;   // nothing started yet
    const st = this.state;
    st.t = this.day.t;
    st.day = this.day.day;
    const p = this.mode === 'capsule' ? this.capsule.base : this.player.pos;
    st.player = { x: p.x, z: this.mode === 'capsule' ? p.z - 1.4 : p.z, facing: this.player.facing };
    st.net = this.net.snapshot();
    const ok = saveState(st);
    if (announce) this.hud.toast(ok ? 'Saved in this browser.' : 'This browser would not save. Export your expedition from the settings to keep it.', ok ? '' : 'warn');
  }

  exportSave() {
    this.save();
    return exportState(this.state);
  }

  importSave(text) {
    const s = importState(text);
    saveState(s);
    location.reload();
  }
}
