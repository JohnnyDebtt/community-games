import { R } from './tuning.js';

// Foley: the small, near sounds of the cabin, synthesized. Clicks, thumps, water, glass,
// cloth and breath; everything short and low, nothing that rings on (bells are not
// welcome here). Short sounds are drawn once, sample by sample, into buffers (a few
// variants each); long ones (heating, pouring, breath) are filtered noise shaped live.
// Each goes to the effects bus with a little of the hall.

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------------------------------------------------------- drawing helpers
// a bubble: a sine whose pitch rises as it nears the surface, dying fast (Minnaert)
function bubble(d, sr, t0, f0, tau, amp, rise = 2) {
  let ph = 0;
  const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(tau * 7 * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (TAU * f0 * (1 + (rise * t) / (tau * 3))) / sr;
    d[i0 + i] += amp * Math.sin(ph) * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0005));
  }
}
// a damped mode: a body or a vessel struck once
function mode(d, sr, t0, f, tau, amp, glide = 0) {
  let ph = 0;
  const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(tau * 7 * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    ph += (TAU * f * (1 + glide * Math.min(1, t / (tau * 2)))) / sr;
    d[i0 + i] += amp * Math.sin(ph) * Math.exp(-t / tau) * (1 - Math.exp(-t / 0.0004));
  }
}
// a burst of noise through a one-pole lowpass (k near 0: dark, near 1: bright)
function burst(d, sr, t0, tau, amp, k = 0.3, hp = 0) {
  let lp = 0, lp2 = 0;
  const i0 = Math.floor(t0 * sr), n = Math.min(d.length - i0, Math.ceil(tau * 7 * sr));
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    lp += k * (Math.random() * 2 - 1 - lp);
    lp2 += hp * (lp - lp2);
    d[i0 + i] += amp * (lp - lp2) * Math.exp(-t / tau);
  }
}

export class Foley {
  constructor(audio) {
    this.a = audio;
    this.cache = new Map();
  }

  get ready() { return !!this.a.ready; }

  // a mono buffer drawn once, normalized to a peak of 0.9
  _buf(key, sec, draw) {
    let b = this.cache.get(key);
    if (b) return b;
    const ctx = this.a.ctx, sr = ctx.sampleRate;
    b = ctx.createBuffer(1, Math.ceil(sec * sr), sr);
    const d = b.getChannelData(0);
    draw(d, sr);
    let p = 0;
    for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i]));
    if (p > 0) for (let i = 0; i < d.length; i++) d[i] *= 0.9 / p;
    // no clicks at the ends
    const f = Math.min(64, d.length >> 2);
    for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
    this.cache.set(key, b);
    return b;
  }

  // gain → place → the effects bus, and a little to the hall
  _out(o, t) {
    const ctx = this.a.ctx;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 0.3;
    let node = g;
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); g.connect(p); node = p; }
    node.connect(this.a.sfx);
    const v = o.verb ?? 0.14;
    if (v) { const s = ctx.createGain(); s.gain.value = v; node.connect(s); s.connect(this.a.verbIn); }
    return g;
  }

  _shot(buf, o = {}) {
    const ctx = this.a.ctx;
    const t = Math.max(o.when ?? ctx.currentTime, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    let node = src;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.5; src.connect(f); node = f; }
    node.connect(this._out(o, t));
    src.start(t);
    return src;
  }

  // filtered noise, shaped live: { type, freq, to, q, attack, hold, release, gain, turb }
  _noise(o) {
    const a = this.a, ctx = a.ctx;
    const t = Math.max(o.when ?? ctx.currentTime, ctx.currentTime);
    const at = o.attack ?? 0.05, h = o.hold ?? 0, r = o.release ?? 0.3, end = t + at + h + r;
    const src = ctx.createBufferSource();
    src.buffer = a.pink || a.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.freq ?? 800, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + at + h + r * 0.5);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + at);
    if (h) env.gain.setValueAtTime(1, t + at + h);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    src.connect(f); f.connect(env);
    let node = env;
    if (o.turb) {
      // turbulence: the level wanders quickly, as water and breath do
      const am = ctx.createGain(); am.gain.value = 1 - o.turb;
      const mod = ctx.createBufferSource(); mod.buffer = a.brown || a.noise; mod.loop = true;
      const mg = ctx.createGain(); mg.gain.value = o.turb * 1.6;
      mod.connect(mg); mg.connect(am.gain);
      env.connect(am); node = am;
      mod.start(t, Math.random() * 2); mod.stop(end + 0.05);
    }
    node.connect(this._out(o, t));
    src.start(t, Math.random() * 3);
    src.stop(end + 0.05);
  }

  // ---------------------------------------------------------------- the sounds
  // feet on the deck, through the cloak
  step(o = {}) {
    if (!this.ready) return;
    const v = Math.floor(Math.random() * 3);
    const b = this._buf('step' + v, 0.22, (d, sr) => {
      mode(d, sr, 0, rnd(62, 78), 0.035, 0.9, -0.3);
      burst(d, sr, 0.002, 0.03, 0.5, 0.06);
      burst(d, sr, 0.004, 0.012, 0.12, 0.35, 0.2);
    });
    this._shot(b, { gain: 0.17 * (o.gain ?? 1), rate: rnd(0.92, 1.06), verb: 0.08, pan: o.pan });
  }

  // cloth moving: an arm reaching, the cloak settling
  cloth(o = {}) {
    if (!this.ready) return;
    this._noise({ freq: rnd(700, 1000), to: rnd(500, 700), q: 0.6, attack: 0.08, hold: 0.06, release: o.secs ?? 0.3, gain: 0.5 * (o.gain ?? 1), turb: 0.6, verb: 0.05, pan: o.pan, when: o.when });
  }

  // the one button: two small clicks, then the relay inside, low
  press(o = {}) {
    if (!this.ready) return;
    const b = this._buf('press', 0.3, (d, sr) => {
      burst(d, sr, 0, 0.0012, 0.7, 0.35, 0.05);
      mode(d, sr, 0, 190, 0.016, 0.5);
      burst(d, sr, 0.016, 0.0009, 0.3, 0.45, 0.05);
      mode(d, sr, 0.016, 250, 0.01, 0.22);
      mode(d, sr, 0.13, 92, 0.05, 0.55, -0.25);
      burst(d, sr, 0.13, 0.02, 0.25, 0.08);
    });
    this._shot(b, { gain: 0.22, verb: 0.12, pan: o.pan });
  }

  // the element warming the water: a dark rush that grows, small ticks thickening
  // in it, and the machine's hum on the root
  heat(o = {}) {
    if (!this.ready) return;
    const ctx = this.a.ctx, t = ctx.currentTime, dur = o.secs ?? 3.6;
    this._noise({ type: 'lowpass', freq: 160, to: 620, q: 0.5, attack: dur * 0.7, hold: dur * 0.2, release: 0.9, gain: 0.18, turb: 0.25, verb: 0.08, pan: o.pan });
    const tick = this._buf('ticks', 4, (d, sr) => {
      for (let s = 0; s < 4; s += 0) {
        s += 1 / (3 + s * 9) * rnd(0.4, 1.6);
        burst(d, sr, s, 0.0006, rnd(0.2, 1), rnd(0.3, 0.5), 0.15);
      }
    });
    this._shot(tick, { gain: 0.08, when: t + 0.3, lp: 2600, verb: 0.1, pan: o.pan });
    // the hum: the root and its octave, quietly, while the machine works
    const hum = ctx.createOscillator(); hum.frequency.value = R * 2;
    const hum2 = ctx.createOscillator(); hum2.frequency.value = R * 4;
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.8);
    env.gain.setValueAtTime(1, t + (o.run ?? 4.2));
    env.gain.exponentialRampToValueAtTime(0.0001, t + (o.run ?? 4.2) + 1.2);
    hum.connect(env); hum2.connect(g2); g2.connect(env);
    env.connect(this._out({ gain: 0.05, verb: 0.05, pan: o.pan }, t));
    hum.start(t); hum2.start(t);
    hum.stop(t + (o.run ?? 4.2) + 1.4); hum2.stop(t + (o.run ?? 4.2) + 1.4);
  }

  // boiling water pushed up the tube: bursts of bubbles, a low glug, a gush
  gurgle(o = {}) {
    if (!this.ready) return;
    const v = Math.floor(Math.random() * 4);
    const b = this._buf('gurgle' + v, 1.0, (d, sr) => {
      const bursts = 2 + Math.floor(Math.random() * 2);
      for (let k = 0; k < bursts; k++) {
        const t0 = k * rnd(0.18, 0.3);
        mode(d, sr, t0, rnd(105, 150), 0.03, 0.5, 0.4);
        burst(d, sr, t0, 0.08, 0.18, 0.05);
        const n = 4 + Math.floor(Math.random() * 6);
        for (let i = 0; i < n; i++) bubble(d, sr, t0 + rnd(0, 0.16), rnd(190, 520), rnd(0.012, 0.03), rnd(0.25, 0.6), rnd(1.5, 3));
      }
    });
    this._shot(b, { gain: 0.24 * (o.gain ?? 1), rate: rnd(0.9, 1.08), lp: 2400, verb: 0.16, pan: o.pan });
  }

  // a drop into the carafe
  drip(o = {}) {
    if (!this.ready) return;
    const v = Math.floor(Math.random() * 5);
    const b = this._buf('drip' + v, 0.16, (d, sr) => {
      burst(d, sr, 0, 0.0008, 0.15, 0.4, 0.1);
      bubble(d, sr, 0.001, rnd(430, 720), rnd(0.01, 0.018), 1, rnd(1.6, 2.6));
    });
    this._shot(b, { gain: 0.15 * (o.gain ?? 1), rate: rnd(0.94, 1.06), lp: 2200, verb: 0.2, pan: o.pan });
  }

  // the carafe leaves the plate: glass sliding on metal, briefly
  lift(o = {}) {
    if (!this.ready) return;
    const b = this._buf('lift', 0.3, (d, sr) => {
      mode(d, sr, 0, 880, 0.006, 0.25);
      let lp = 0;
      for (let i = 0; i < 0.22 * sr; i++) {
        const t = i / sr;
        lp += 0.35 * (Math.random() * 2 - 1 - lp);
        const jitter = 0.5 + 0.5 * Math.sin(t * 190 + Math.sin(t * 47) * 3);
        d[i] += lp * 0.35 * jitter * Math.sin(Math.min(1, t / 0.22) * Math.PI);
      }
    });
    this._shot(b, { gain: 0.2, lp: 3000, verb: 0.08, pan: o.pan });
  }

  // coffee into the cup: a rush whose pitch climbs as the cup fills, a few bubbles
  pour(o = {}) {
    if (!this.ready) return;
    const ctx = this.a.ctx, t = ctx.currentTime, dur = o.secs ?? 0.6;
    this._noise({ freq: 420, to: 1050, q: 1.5, attack: 0.07, hold: dur, release: 0.22, gain: 1.2, turb: 0.45, verb: 0.12, pan: o.pan });
    this._noise({ type: 'lowpass', freq: 380, q: 0.4, attack: 0.05, hold: dur, release: 0.2, gain: 0.48, turb: 0.5, verb: 0.05, pan: o.pan });
    const b = this._buf('pourbubbles', 1.2, (d, sr) => {
      for (let i = 0; i < 22; i++) bubble(d, sr, rnd(0, 1.1), rnd(380, 820), rnd(0.008, 0.016), rnd(0.3, 1), 2);
    });
    const src = this._shot(b, { gain: 0.28, when: t + 0.05, lp: 2000, verb: 0.1, pan: o.pan });
    src.stop(t + dur + 0.25);
  }

  // the carafe back on the plate: glass on metal, a low knock; drops hissing on the heat
  set(o = {}) {
    if (!this.ready) return;
    const b = this._buf('set', 0.35, (d, sr) => {
      mode(d, sr, 0, 84, 0.04, 0.8, -0.2);
      mode(d, sr, 0, 330, 0.045, 0.35);
      mode(d, sr, 0, 760, 0.026, 0.22);
      mode(d, sr, 0, 1240, 0.014, 0.1);
      burst(d, sr, 0, 0.004, 0.4, 0.3, 0.05);
    });
    this._shot(b, { gain: 0.27, lp: 3200, verb: 0.15, pan: o.pan });
    if (o.sizzle !== false) {
      const s = this._buf('sizzle', 0.8, (d, sr) => {
        let lp = 0, hp = 0;
        for (let i = 0; i < d.length; i++) {
          const t = i / sr;
          lp += 0.5 * (Math.random() * 2 - 1 - lp);
          hp += 0.08 * (lp - hp);
          const crack = Math.random() < 0.002 ? 3 : 1;
          d[i] = (lp - hp) * crack * Math.exp(-t / 0.2) * (1 - Math.exp(-t / 0.01));
        }
      });
      this._shot(s, { gain: 0.05, when: this.a.ctx.currentTime + 0.04, lp: 4200, verb: 0.05, pan: o.pan });
    }
  }

  // the cup taken up from the counter: stoneware, a soft knock
  cup(o = {}) {
    if (!this.ready) return;
    const b = this._buf('cup', 0.18, (d, sr) => {
      mode(d, sr, 0, 470, 0.018, 0.5);
      mode(d, sr, 0, 1120, 0.01, 0.2);
      burst(d, sr, 0, 0.002, 0.35, 0.35, 0.05);
    });
    this._shot(b, { gain: 0.25, lp: 2800, verb: 0.12, pan: o.pan });
  }

  // a sip: air and coffee drawn in together, bubbling a little
  sip(o = {}) {
    if (!this.ready) return;
    const b = this._buf('sip', 0.6, (d, sr) => {
      let lp = 0, hp = 0;
      for (let i = 0; i < 0.5 * sr; i++) {
        const t = i / sr;
        lp += 0.22 * (Math.random() * 2 - 1 - lp);
        hp += 0.04 * (lp - hp);
        const flutter = 0.55 + 0.45 * Math.sin(t * TAU * 38 + Math.sin(t * 61) * 2);
        const env = Math.min(1, t / 0.07) * Math.exp(-Math.max(0, t - 0.3) / 0.06);
        d[i] += (lp - hp) * flutter * env * 0.8;
      }
      for (let i = 0; i < 6; i++) bubble(d, sr, rnd(0.05, 0.32), rnd(500, 800), 0.01, rnd(0.1, 0.25), 2);
    });
    this._shot(b, { gain: 0.38 * (o.gain ?? 1), lp: 2600, verb: 0.08, pan: o.pan, when: o.when });
  }

  // and swallowed: a low gulp
  swallow(o = {}) {
    if (!this.ready) return;
    const b = this._buf('swallow', 0.3, (d, sr) => {
      mode(d, sr, 0, 210, 0.045, 0.7, -0.45);
      burst(d, sr, 0.01, 0.025, 0.4, 0.05);
    });
    this._shot(b, { gain: 0.15, lp: 1600, verb: 0.06, pan: o.pan, when: o.when });
  }

  // the breath after: warm, slow, no voice in it
  exhale(o = {}) {
    if (!this.ready) return;
    this._noise({ freq: 640, to: 360, q: 0.8, attack: 0.18, hold: 0.3, release: 1.1, gain: 0.5 * (o.gain ?? 1), turb: 0.3, verb: 0.12, pan: o.pan, when: o.when });
  }
}
