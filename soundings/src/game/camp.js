import * as THREE from 'three';
import { clamp, TAU } from '../core/math.js';
import { Vagrant, Yak } from '../actors/travelers.js';
import { groundHeight, ZONE } from '../world/layout.js';
import { SPECIES_BY_ID, CATCHABLE, RARITY, preferredStyle, sizeFrac, toneOf } from './species.js';
import { lineMax } from './research.js';
import { BEAT } from '../core/audio.js';

// The Vagrant and their yak, travelers of The Seeker's caves, walk the frozen sea: a
// different camp each day, and you find them by ear, following the lute.
//
// The Vagrant records nothing. Where the Seeker's visor writes a creature into the
// Codex, they keep it as a song, and for a little data they will sing you one about a
// creature you have not yet recorded: where it lives, at what hour, how deep, what
// lure. They also take fish off your hands for the road, and say a word or two when
// you come by. The yak lies beside them, warm enough to thin the ice it lies on: fish
// gather under it, and a hole drilled beside it bites twice as fast. Pet it, and once
// a day something falls out of its fur.

const CAMPS = [
  { x: -16, z: 72, facing: 2.3 },     // the Capsule Shallows, near home: where they are first met
  { x: 80, z: -22, facing: -0.9 },    // the edge of the Vent Field
  { x: -72, z: -26, facing: 0.8 },    // the Glass Reach
  { x: 28, z: -64, facing: 3.7 },     // the rim of the Drop
];
const HEAR = 72;        // meters: how far the lute carries
const NEAR = 6;         // they stop playing, and talk
const WARM = 4.5;       // meters around the yak where the ice is thin

export const SONG_PRICE = { common: 4, uncommon: 7, rare: 12, legendary: 20 };

const PLACE = {
  shallows: 'where the capsule\'s light still reaches',
  vents: 'where the ice sweats over the vents',
  reach: 'where the ice runs clear as a held breath',
  drop: 'where the floor falls away',
};
const HOUR = { dawn: ['at dawn', 'dawn'], day: ['in the bright of day', 'day'], dusk: ['at dusk', 'dusk'], night: ['at night', 'night'] };

// What the Vagrant sings about a creature: where, when, how deep, on what lure.
export function songOf(sp) {
  let zone = 'shallows', zw = -1;
  for (const [id, w] of Object.entries(sp.zones)) if (w > zw) { zw = w; zone = id; }
  const times = Object.entries(sp.time);
  const top = Math.max(...times.map(([, w]) => w));
  const even = times.every(([, w]) => w > top * 0.8);
  const phase = even ? null : times.find(([, w]) => w === top)[0];
  const zname = ZONE[zone].name.replace(/^The /, 'the ');
  const style = preferredStyle(sp).toLowerCase();
  const d0 = Math.round(sp.depth[0]), d1 = Math.round(sp.depth[1]);
  return {
    title: `Song of the ${sp.name}`,
    verse: `In ${zname}, ${PLACE[zone]}, ${phase ? HOUR[phase][0] : 'at any hour'}, ${d0} to ${d1} m down. It comes to ${style}.`,
    hint: `${ZONE[zone].name.replace(/^The /, '')} · ${phase ? HOUR[phase][1] : 'any hour'} · ${d0}-${d1} m · ${style}`,
    zone,
  };
}

export function fishPrice(f) {
  const sp = SPECIES_BY_ID[f.sp];
  if (!sp) return 1;
  return Math.max(1, Math.round(RARITY[sp.rarity].data * 0.3 * (0.7 + sizeFrac(sp, f.cm) * 0.6)));
}

// ------------------------------------------------------------------ what they say
const FIRST = [
  'A Seeker. You walk like someone listening for something.',
  'Sit, if you like. The yak doesn\'t mind company.',
];
const LINES = {
  lore: [
    'I don\'t write anything down. I play it, and it stays.',
    'Your visor counts the fish. I count the songs they make.',
    'Everything under the ice hums at forty-eight. Listen long enough and you hear it.',
    'I had a visor like yours, once. The ice was louder.',
    'We walk the rim, the yak and I. Different ice every day.',
    'Theorem asks what a thing is. The ice only ever asks if you\'re still here.',
    'The deeper the line, the warmer the song.',
    'Some of them sing back, if you play long enough.',
  ],
  yak: [
    'Fish like the yak. Everyone likes the yak.',
    'Where the yak lies down, the ice goes thin. Fish come up to see why.',
  ],
  deep: ['Something under the Drop is very large. It sings very slowly.'],
  listener: ['The one that listens can\'t be caught. Only heard. Be very still, where it is quiet.'],
  night: ['The aurora is the network breathing. Your little seekers know.', 'Night is when the lanterns swim up. Don\'t look straight at them.'],
  dawn: ['Dawn. The motes rise to look at it.'],
  snow: ['Snow muffles the ice. Fish grow bold under it.'],
  pack: ['Heavy pack. I\'ll take a few off you, for the road.'],
  song: ['Go on. It will be where the song says.'],
};

export class Camp {
  constructor(game) {
    this.g = game;
    this.vagrant = new Vagrant(game.scene);
    this.yak = new Yak(game.scene);
    this.spot = -1;
    this.dist = Infinity;
    this._near = false;
    this._sayT = 0;
    this._mooT = 12;
    this._noteT = 0;
    this._steamT = 0;
    this._said = [];
    game.lights.push(this.vagrant.lamp, this.yak.lamp);
  }

  get st() {
    const s = this.g.state;
    if (!s.camp) s.camp = { day: 0, songs: [], heard: [], petDay: 0, met: 0, first: 0 };
    return s.camp;
  }

  // Where they are today; they move on overnight, while you are elsewhere.
  settle(force = false) {
    const day = this.g.state.day || 1;
    const want = (day - 1) % CAMPS.length;
    if (want === this.spot) return;
    if (!force && this.spot >= 0) {
      const p = this.g.player.pos, c = CAMPS[want], o = CAMPS[this.spot];
      if (Math.hypot(p.x - c.x, p.z - c.z) < 55 || Math.hypot(p.x - o.x, p.z - o.z) < 55) return;
    }
    this.spot = want;
    const c = CAMPS[want];
    const y = groundHeight(c.x, c.z);
    this.yak.place(c.x, y, c.z, c.facing);
    // the Vagrant beside the yak's shoulder, looking out the same way
    const s = Math.sin(c.facing), k = Math.cos(c.facing);
    const vx = c.x + k * 2.15 + s * 0.8, vz = c.z - s * 2.15 + k * 0.8;
    this.vagrant.place(vx, groundHeight(vx, vz), vz, c.facing + 0.5);
  }

  get pos() {
    return this.vagrant.root.position;
  }

  // Today's songs: up to three creatures you have not recorded and can reach.
  songs() {
    const st = this.st, g = this.g;
    if (st.day !== g.state.day) {
      st.day = g.state.day;
      const line = lineMax(g.state);
      const pool = CATCHABLE.filter((sp) => !g.state.codex[sp.id] && sp.depth[0] <= line - 2 && !st.heard.includes(sp.id));
      // the same three all day, different tomorrow
      let seed = (g.state.day * 2654435761) >>> 0;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
      const pick = [];
      while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id);
      st.songs = pick;
    }
    return st.songs.map((id) => SPECIES_BY_ID[id]).filter(Boolean);
  }

  // A song bought: it is sung, and becomes a request with its directions.
  hear(sp) {
    const g = this.g, st = this.st;
    const price = SONG_PRICE[sp.rarity];
    if (g.state.data < price || st.heard.includes(sp.id)) return false;
    g.state.data -= price;
    st.heard.push(sp.id);
    const song = songOf(sp);
    g.requests.addSong(sp, song);
    g.audio.vagrantSong(toneOf(sp));
    this.vagrant.talk = 3;
    g.save();
    return true;
  }

  sell(i) {
    const g = this.g;
    const f = g.state.creel[i];
    if (!f) return 0;
    const price = fishPrice(f);
    g.state.creel.splice(i, 1);
    g.state.data += price;
    g.state.dataTotal += price;
    g.state.stats.sold = (g.state.stats.sold || 0) + 1;
    g.audio.ui('coin');
    g.save();
    return price;
  }

  pet() {
    const g = this.g, st = this.st, yak = this.yak;
    yak.shake = 1;
    yak.moo = 1;
    g.audio.moo(1, 0);
    const p = yak.root.position;
    g.particles.emit(p.x, 1.0, p.z, 14, { color: 0xf3f8f8, speed: 0.9, up: 1.4, life: 0.9 });
    if (st.petDay !== g.state.day) {
      // once a day, something tangled in its fur
      st.petDay = g.state.day;
      g.state.data += 3;
      g.state.dataTotal += 3;
      const at = g.hud.layout.point(this._v(p.x, 1.4, p.z));
      setTimeout(() => g.hud.flyData(3, { x: at.x, y: at.y }), 400);
      g.save();
    }
  }

  // Thin ice by the yak: fish gather there.
  warm(x, z) {
    return this.spot >= 0 && this.yak.distanceTo(x, z) < WARM;
  }

  blocked(x, z) {
    if (this.spot < 0) return false;
    const v = this.vagrant.root.position;
    return Math.hypot(x - v.x, z - v.z) < 0.38 || this.yak.distanceTo(x, z) < 1.1;
  }

  // What they could say now, most fitting first.
  _line() {
    const g = this.g, st = this.st;
    if (st.first < FIRST.length) return FIRST[st.first++];
    const pool = [];
    const add = (k, w = 1) => { for (const l of LINES[k]) if (!this._said.includes(l)) for (let i = 0; i < w; i++) pool.push(l); };
    add('lore');
    add('yak', 2);
    if (g.state.creel.length >= g.packCapacity() - 1) add('pack', 4);
    const ph = g.day.phase();
    if (ph === 'night') add('night', 2);
    if (ph === 'dawn') add('dawn', 2);
    if (g.weather.snow > 0.4) add('snow', 2);
    if (lineMax(g.state) < 96) add('deep');
    if (!g.state.observed || !g.state.observed.the_listener) add('listener');
    if (!pool.length) { this._said = []; return LINES.lore[0]; }
    const line = pool[Math.floor(Math.random() * pool.length)];
    this._said.push(line);
    if (this._said.length > 6) this._said.shift();
    return line;
  }

  say(text) {
    this.vagrant.talk = Math.min(4, 1 + text.length / 22);
    this.g.hud.say(text, () => this.vagrant.top(this._sayV || (this._sayV = new THREE.Vector3())), 2200 + text.length * 45);
  }

  // Left or right of the camera, for the stereo field.
  _pan(x, z) {
    const p = this.g.player.pos, e = this.g.cam.cam.matrixWorld.elements;
    const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz) || 1;
    return clamp((dx * e[0] + dz * e[2]) / d, -0.8, 0.8);
  }

  // a fixed spot, set and returned, so the hot paths make no garbage
  _v(x, y, z) {
    return (this._tv || (this._tv = new THREE.Vector3())).set(x, y, z);
  }

  update(dt) {
    const g = this.g;
    if (this.spot < 0) this.settle(true);
    else if (g.frame % 60 === 0) this.settle(false);
    const p = g.player.pos, v = this.vagrant.root.position;
    const d = Math.hypot(p.x - v.x, p.z - v.z);
    this.dist = d;
    const night = g.day.night;
    const open = g.panels.open;
    // near: the lute goes away and they turn to you; farther off, they play again
    if (this.vagrant.playing && d < NEAR) this.vagrant.playing = false;
    else if (!this.vagrant.playing && d > NEAR + 3 && !(open && g.panels.current.kind === 'vagrant')) this.vagrant.playing = true;
    this.vagrant.lookAt = d < 14 ? p : null;
    this.yak.lookAt = this.yak.distanceTo(p.x, p.z) < 10 ? p : null;
    this.vagrant.update(dt, g.time, night);
    this.yak.update(dt, g.time, night);
    // the lute carries across the ice
    const playing = this.vagrant.playing && g.mode !== 'title';
    const level = playing ? Math.pow(clamp(1 - d / HEAR, 0, 1), 1.6) : 0;
    g.audio.vagrant = { level, pan: this._pan(v.x, v.z) };
    // notes rising from the lute, where you can see them
    if (playing && d < 40) {
      this._noteT -= dt;
      if (this._noteT <= 0) {
        this._noteT = BEAT * 2;
        const s = g.hud.layout.point(this.vagrant.top(this._v(0, 0, 0)));
        if (!s.behind) g.hud.floatText('', s.x, s.y, { icon: 'note', tint: '#d6edf5', rise: 18, ms: 1500 });
      }
    }
    // words: a greeting as you come near, then now and then while you stay
    if (d < NEAR && !open && g.mode === 'walk') {
      if (!this._near) {
        this._near = true;
        if (performance.now() - this._sayT > 20000 || !this.st.met) { this.st.met = 1; this.say(this._line()); this._sayT = performance.now(); }
      } else if (performance.now() - this._sayT > 16000) {
        this.say(this._line());
        this._sayT = performance.now();
      }
    } else if (d > NEAR + 4) this._near = false;
    // the yak moos now and then, and when you first come up to it
    const dy = this.yak.distanceTo(p.x, p.z);
    if (dy < 90) g.audio.loadMoos();
    this._mooT -= dt;
    if (dy < 34 && this._mooT <= 0 && g.mode !== 'title') {
      this._mooT = 18 + Math.random() * 26;
      this.yak.moo = 1;
      g.audio.moo(Math.pow(clamp(1 - dy / 40, 0, 1), 1.4), this._pan(this.yak.root.position.x, this.yak.root.position.z));
    }
    // warm breath over the thin ice around it
    if (dy < 45) {
      this._steamT -= dt;
      if (this._steamT <= 0) {
        this._steamT = 0.5;
        const y = this.yak.root.position, a = Math.random() * TAU, r = 1.2 + Math.random() * 2.6;
        g.particles.emit(y.x + Math.cos(a) * r, 0.05, y.z + Math.sin(a) * r, 1, { color: 0xedf0f1, speed: 0.1, up: 0.35, life: 1.6 });
      }
    }
  }

  // On the compass: the music, while you can hear it.
  marks() {
    if (this.spot < 0 || !(this.dist < HEAR) || this.dist < 10) return [];
    const v = this.vagrant.root.position;
    return [{ text: '', x: v.x, z: v.z, cls: 'mark', icon: 'note' }];
  }
}
