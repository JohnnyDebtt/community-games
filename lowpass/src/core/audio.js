// All sound is synthesized here with Web Audio: nothing to download.
//
// The tuning (core/tuning.js): every pitch is 42 Hz x X / 2^N, a harmonic of the
// fundamental or of one of its lower octaves, in just intonation. The music lives on
// 21/16 of it, an A at 55.125 Hz, in the palette 1, 9/8, 19/16, 3/2, 7/4.
//
// The score is one long breath that never repeats. A deep drone on the root, always
// there. Over it a slow chord in five voices, each voice changing on its own clock
// (every 16 to 30 seconds) to a near note of the palette, swelling in over seconds and
// fading out over more, so the harmony morphs without ever starting or stopping. All of
// it through a wide chorus into a long, dark hall. Now and then a single soft tone
// higher up, like a light far off. No rhythm, almost nothing bright. The world steers
// it gently: the hour, the fog, how awake the pilot is, the cabin's walls, and the
// artifacts, each of which hums its own chord when near.
//
// M keeps the music playing (the section comes back); R saves the last minute as WAV.

import { F0, R, PALETTE, N, BPM, BEAT, pitch, harmonic } from './tuning.js';
import { Foley } from './foley.js';
import { ArtifactVoices } from './voices.js';

export { F0, BPM, BEAT, pitch };

const rnd = Math.random;
const pick = (a) => a[Math.floor(rnd() * a.length)];

// the voices of the chord: their range in palette degrees above the root (5 per octave)
const SLOTS = [
  { lo: 5, hi: 9, pan: 0, gain: 0.22 },     // 110 to 193 Hz: the bass of the chord
  { lo: 8, hi: 13, pan: -0.55, gain: 0.72 },// 165 to 290
  { lo: 10, hi: 14, pan: 0.55, gain: 1.0 }, // 220 to 386
  { lo: 12, hi: 17, pan: -0.25, gain: 0.9 },// 262 to 496
  { lo: 13, hi: 18, pan: 0.3, gain: 0.75 }, // 331 to 524
];
const SWELL = [15, 16, 17, 18, 19, 20];     // 441 to 772 Hz: the far tones

// 16-bit stereo WAV from two Int16Arrays
function wav(l, r, rate) {
  const n = l.length, buf = new ArrayBuffer(44 + n * 4), v = new DataView(buf);
  const str = (o, x) => { for (let i = 0; i < x.length; i++) v.setUint8(o + i, x.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0, o = 44; i < n; i++, o += 4) { v.setInt16(o, l[i], true); v.setInt16(o + 2, r[i], true); }
  return new Blob([buf], { type: 'audio/wav' });
}

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.85, music: 0.85, sfx: 0.8, ambience: 0.5 };
    this.muted = false;
    // what the world says, 0..1
    this.mood = { night: 0, fog: 0.5, drowsy: 0, inside: 0, near: 0, speed: 1, turn: 0, scan: 0, warm: 0, title: 1 };
    this.artifacts = [];        // [{ key, d, dist, bearing, reveal }] set by the game
    this._t0 = 0;
    this.history = [];          // the sections played, newest last
    this.kept = [];             // sections kept by the player
    this.onKept = null;
    this.foley = new Foley(this);
    this.voices = new ArtifactVoices(this);
  }

  // ---------------------------------------------------------------- setup
  unlock() {
    if (this.ctx) {
      // suspended until a gesture, or interrupted (a phone call, another app)
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') { const r = this.ctx.resume(); if (r && r.catch) r.catch(() => {}); }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -18; this.glue.knee.value = 14; this.glue.ratio.value = 2.5;
    this.glue.attack.value = 0.02; this.glue.release.value = 0.3;
    this.limit = ctx.createDynamicsCompressor();
    this.limit.threshold.value = -3; this.limit.knee.value = 0; this.limit.ratio.value = 20;
    this.limit.attack.value = 0.003; this.limit.release.value = 0.15;
    this.master = ctx.createGain();
    this.out.connect(this.glue); this.glue.connect(this.limit); this.limit.connect(this.master); this.master.connect(ctx.destination);

    // buses: music and ambience pass through one tone filter (the cabin's walls,
    // drowsiness); effects stay clear
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = 18000; this.tone.Q.value = 0.3;
    this.tone.connect(this.out);
    this.music = ctx.createGain(); this.music.connect(this.tone);
    this.amb = ctx.createGain(); this.amb.connect(this.tone);
    this.sfx = ctx.createGain(); this.sfx.connect(this.out);
    // the artifacts' voices: under the effects' volume, through the cabin's walls
    this.voiceBus = ctx.createGain(); this.voiceBus.connect(this.tone);

    // the hall: a moving plate (plate-worklet.js) with chorus in its tail and spinning
    // reflections; until it loads, or where worklets are missing, a still convolution
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(11, 1.7);
    this.verbIn = ctx.createGain(); this.verbIn.connect(this.verb);
    this.verbOut = ctx.createGain(); this.verbOut.gain.value = 1.0;
    this.verb.connect(this.verbOut); this.verbOut.connect(this.tone);
    this._startPlate();
    this.echoIn = ctx.createGain();
    const mk = (time, pan) => {
      const d = ctx.createDelay(2); d.delayTime.value = time;
      const fb = ctx.createGain(); fb.gain.value = 0.52;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      this.echoIn.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d);
      const o = ctx.createGain(); o.gain.value = 0.32; lp.connect(o); o.connect(p); p.connect(this.music); o.connect(this.verbIn);
    };
    mk(BEAT / 2, -0.55);
    mk((BEAT * 2) / 3, 0.55);

    // the melodic voices pass through a chorus: copies on short delays that sway slowly
    // (the way SEEKER's chorus does), spread wide, and on into the hall
    this.melody = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 0.5;
    this.melody.connect(dry); dry.connect(this.music);
    const wet = ctx.createGain(); wet.gain.value = 0.75;
    this.melody.connect(wet); wet.connect(this.verbIn);
    for (const [base, rate, depth, pan] of [[0.013, F0 / 256, 0.0034, -0.85], [0.021, F0 / 160, 0.0042, 0.85], [0.031, F0 / 384, 0.0029, 0.0], [0.017, F0 / 224, 0.0038, -0.35]]) {
      const d = ctx.createDelay(0.1); d.delayTime.value = base;
      const lfo = ctx.createOscillator(); lfo.frequency.value = rate;
      const lg = ctx.createGain(); lg.gain.value = depth;
      lfo.connect(lg); lg.connect(d.delayTime); lfo.start();
      const g = ctx.createGain(); g.gain.value = 0.36;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      this.melody.connect(d); d.connect(g); g.connect(p); p.connect(this.music);
      const sv = ctx.createGain(); sv.gain.value = 0.55; p.connect(sv); sv.connect(this.verbIn);
    }

    // the pads' own bus: it breathes with a slow tide, and now and then rests
    this.padBus = ctx.createGain();
    this.padBus.connect(this.melody);
    const padVerb = ctx.createGain(); padVerb.gain.value = 0.55;
    this.padBus.connect(padVerb); padVerb.connect(this.verbIn);
    // notes heard only in the hall follow the tide too, never quite to nothing
    this.ghostBus = ctx.createGain();
    this.ghostBus.connect(this.verbIn);

    this.noise = this._noiseBuffer(4);
    this.waves = {
      soft: this._wave((n) => (n <= 12 ? 1 / Math.pow(n, 1.6) : 0)),
      pad: this._wave((n) => (n <= 10 ? (n % 2 ? 1 : 0.7) / Math.pow(n, 1.45) : 0)),
      warm: this._wave((n) => (n <= 8 ? (n % 2 ? 1 : 0.5) / Math.pow(n, 1.3) : 0)),
      choir: this._wave((n) => (n <= 24 ? 1 / n : 0)),
      reed: this._wave((n) => (n <= 15 && n % 2 ? 1 / n : 0)),
      hum: this._wave((n) => ({ 1: 1, 2: 0.5, 3: 0.3, 4: 0.12, 6: 0.06 }[n] || 0)),
      sub: this._wave((n) => ({ 1: 1, 2: 0.35, 3: 0.12, 4: 0.05 }[n] || 0)),
    };
    this.applyVolumes();
    this._startDrone();
    this._startAmbience();
    this._t0 = ctx.currentTime;
    this._score = {
      section: 0, sectionEnd: 0, bright: 900, level: 1,
      slots: SLOTS.map((s, i) => ({ ...s, deg: [5, 10, 12, 14, 16][i], next: ctx.currentTime + 0.5 + i * 2.6 })),
      swellAt: ctx.currentTime + 14,
      restAt: ctx.currentTime + 70 + rnd() * 60, restEnd: 0,
      pluckAt: ctx.currentTime + 70 + rnd() * 80,
    };
    this._plucks = new Map();
    this._newSection();
    this._startTap();
    this.ready = true;
    this._timer = setInterval(() => this._schedule(), 100);
  }

  async _startPlate() {
    const ctx = this.ctx;
    if (!ctx.audioWorklet) return;
    try {
      await ctx.audioWorklet.addModule(new URL('./plate-worklet.js', import.meta.url));
      const plate = new AudioWorkletNode(ctx, 'lowpass-plate', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
        processorOptions: { size: 1.6, decay: 0.87, damping: 0.42, bandwidth: 0.6, depth: 3.2, rate: 0.47, spin: 0.21, predelay: 0.035, early: 0.25, wet: 0.9 },
      });
      this.verbIn.disconnect(this.verb);
      this.verbIn.connect(plate);
      plate.connect(this.verbOut);
      this.plate = plate;
    } catch (e) {
      console.warn('plate reverb unavailable, using the convolution', e);
    }
  }

  // shape the hall from outside (dev, settings)
  hall(p) {
    if (this.plate) this.plate.port.postMessage(p);
  }

  // A tap on the master output keeps the last minute of sound in a ring (16-bit), so a
  // moment can be saved after it has happened.
  async _startTap() {
    const ctx = this.ctx;
    if (!ctx.audioWorklet) return;
    try {
      await ctx.audioWorklet.addModule(new URL('./tap-worklet.js', import.meta.url));
      this.tap = new AudioWorkletNode(ctx, 'lowpass-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit', processorOptions: { seconds: 60 } });
      this.master.connect(this.tap);
    } catch { this.tap = null; }
  }

  // Resolves with a WAV Blob of the last minute (or less), or null.
  saveRecent() {
    if (!this.tap) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (e) => {
        this.tap.port.removeEventListener('message', done);
        const { left, right, rate } = e.data;
        resolve(left && left.length ? wav(left, right, rate) : null);
      };
      this.tap.port.addEventListener('message', done);
      this.tap.port.start();
      this.tap.port.postMessage('dump');
    });
  }

  _wave(amp) {
    const M = 32;
    const real = new Float32Array(M + 1), imag = new Float32Array(M + 1);
    for (let n = 1; n <= M; n++) imag[n] = amp(n);
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(2, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return b;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // darker as it decays, as a hall does
        const k = 0.5 + 0.48 * (1 - t);
        lp = lp * (1 - k) + (Math.random() * 2 - 1) * k;
        d[i] = lp * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
      }
    }
    return b;
  }

  // pink noise (Paul Kellet's filter) and brown noise (a leaky random walk): softer,
  // darker beds than white noise, closer to air and distance
  _colored(sec, kind) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(2, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, peak = 0;
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
          d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last;
        }
        peak = Math.max(peak, Math.abs(d[i]));
      }
      for (let i = 0; i < d.length; i++) d[i] /= peak || 1;
      const f = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[d.length - 1 - i] *= k; }
    }
    return b;
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol.master, t, 0.08);
    this.music.gain.setTargetAtTime(this.vol.music * 0.9, t, 0.2);
    this.verbOut.gain.setTargetAtTime(this.vol.music * 0.85, t, 0.2);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.ambience, t, 0.2);
    this.voiceBus.gain.setTargetAtTime(this.vol.sfx, t, 0.2);
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }

  // beats since the score began (the game's animation follows it)
  beatNow() {
    if (!this.ready) return null;
    return (this.ctx.currentTime - this._t0) / BEAT;
  }

  // ---------------------------------------------------------------- voices
  // A tuned voice: one oscillator of harmonics (a PeriodicWave), a filter, an envelope,
  // a place in the stereo field, and sends to the hall and the echoes. Melodic by
  // default (through the chorus).
  note(freq, o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = Math.max(o.when ?? ctx.currentTime, ctx.currentTime);
    const a = o.attack ?? 0.01, h = o.hold ?? 0, r = o.release ?? 1.5, g = Math.max(o.gain ?? 0.1, 0.0002);
    const osc = ctx.createOscillator();
    if (o.wave && this.waves[o.wave]) osc.setPeriodicWave(this.waves[o.wave]);
    else osc.type = o.type || 'sine';
    osc.frequency.value = freq;
    let node = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.cutoff; f.Q.value = o.q ?? 0.6;
      // a note can sink: its filter closes slowly while it sounds
      if (o.sink) { f.frequency.setValueAtTime(o.cutoff, t + a); f.frequency.exponentialRampToValueAtTime(Math.max(120, o.cutoff * o.sink), t + a + h + r * 0.6); }
      osc.connect(f); node = f;
    }
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    if (o.linear) env.gain.linearRampToValueAtTime(g, t + a);
    else env.gain.exponentialRampToValueAtTime(g, t + a);
    if (h) env.gain.setValueAtTime(g, t + a + h);
    env.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
    node.connect(env);
    let outNode = env;
    if (o.pan) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); env.connect(p); outNode = p;
    }
    outNode.connect(o.dest || this.melody);
    if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; outNode.connect(s); s.connect(this.verbIn); }
    if (o.echo) { const s = ctx.createGain(); s.gain.value = o.echo; outNode.connect(s); s.connect(this.echoIn); }
    osc.start(t);
    osc.stop(t + a + h + r + 0.1);
    return osc;
  }

  // filtered noise with an envelope (breath, a shutter, steam, a pour)
  hiss(o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = Math.max(o.when ?? ctx.currentTime, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = o.pink && this.pink ? this.pink : this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass'; f.frequency.value = o.freq ?? 1200; f.Q.value = o.q ?? 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + (o.attack ?? 0.01) + (o.hold ?? 0) + (o.release ?? 0.3));
    const env = ctx.createGain();
    const a = o.attack ?? 0.005, h = o.hold ?? 0, r = o.release ?? 0.3, g = Math.max(o.gain ?? 0.1, 0.0002);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(g, t + a);
    if (h) env.gain.setValueAtTime(g, t + a + h);
    env.gain.exponentialRampToValueAtTime(0.0001, t + a + h + r);
    src.connect(f); f.connect(env);
    let out = env;
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; env.connect(p); out = p; }
    out.connect(o.dest || this.sfx);
    if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; out.connect(s); s.connect(this.verbIn); }
    src.start(t, Math.random() * 3);
    src.stop(t + a + h + r + 0.1);
  }

  // ---------------------------------------------------------------- the beds
  // the drone: the root and its octave, and the fifth very quietly, always there
  _startDrone() {
    const ctx = this.ctx;
    this.drone = [];
    for (const [k, g, pan] of [[1, 0.2, 0], [2, 0.008, -0.3], [3, 0.006, 0.35], [4, 0.005, 0]]) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(this.waves.sub);
      osc.frequency.value = R * k;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.7;
      const env = ctx.createGain(); env.gain.value = 0;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      osc.connect(f); f.connect(env); env.connect(p); p.connect(this.music);
      const s = ctx.createGain(); s.gain.value = 0.35; p.connect(s); s.connect(this.verbIn);
      osc.start();
      this.drone.push({ osc, f, env, k, g });
    }
  }

  _startAmbience() {
    const ctx = this.ctx;
    this.pink = this._colored(6, 'pink');
    this.brown = this._colored(6, 'brown');
    const loop = (buf, off) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, off); return s; };
    // the air the ship moves through: soft pink noise through a low-pass that opens and
    // closes with slow gusts, and with the turns
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'lowpass'; this.windF.frequency.value = 650; this.windF.Q.value = 0.9;
    const windHP = ctx.createBiquadFilter(); windHP.type = 'highpass'; windHP.frequency.value = 140;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    const gust = ctx.createGain(); gust.gain.value = 0.6;
    const lfo1 = ctx.createOscillator(); lfo1.frequency.value = F0 / 512;
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = F0 / 1536;
    const l1 = ctx.createGain(); l1.gain.value = 0.25; const l2 = ctx.createGain(); l2.gain.value = 0.18;
    lfo1.connect(l1); lfo2.connect(l2); l1.connect(gust.gain); l2.connect(gust.gain);
    lfo1.start(); lfo2.start();
    const lf = ctx.createGain(); lf.gain.value = 220;
    lfo2.connect(lf); lf.connect(this.windF.frequency);
    loop(this.pink, 0).connect(windHP); windHP.connect(this.windF); this.windF.connect(gust); gust.connect(this.windG); this.windG.connect(this.amb);
    // a deep, soft rumble under it
    this.rumbleF = ctx.createBiquadFilter(); this.rumbleF.type = 'lowpass'; this.rumbleF.frequency.value = 140;
    this.rumbleG = ctx.createGain(); this.rumbleG.gain.value = 0;
    loop(this.brown, 2.1).connect(this.rumbleF); this.rumbleF.connect(this.rumbleG); this.rumbleG.connect(this.amb);
    // the ship's hum: the root's harmonics, louder in the cabin
    this.hum = ctx.createGain(); this.hum.gain.value = 0;
    const hf = ctx.createBiquadFilter(); hf.type = 'lowpass'; hf.frequency.value = 380;
    for (const [k, g] of [[1, 0.5], [2, 0.32], [3, 0.12], [4, 0.05]]) {
      const o = ctx.createOscillator(); o.frequency.value = R * k;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg); gg.connect(hf);
      o.start();
    }
    const trem = ctx.createOscillator(); trem.frequency.value = BPM / 60 / 4;   // a breath every four beats
    const tg = ctx.createGain(); tg.gain.value = 0.25;
    const base = ctx.createGain(); base.gain.value = 0.75;
    trem.connect(tg); tg.connect(base.gain);
    hf.connect(base); base.connect(this.hum); this.hum.connect(this.out);
    trem.start();
  }

  // ---------------------------------------------------------------- the score
  // what the score is doing, as plain data (for the log, and to keep)
  sectionData() {
    const s = this._score;
    return { degs: s.slots.map((x) => x.deg), bright: s.bright, level: s.level };
  }

  // Keep the music playing now (and the section before, if it only just changed): it
  // comes back, now and then, as it was.
  keep() {
    if (!this.ready) return 0;
    const kept = this.kept;
    kept.push(this.sectionData());
    const age = this.ctx.currentTime - (this._sectionAt || 0);
    if (age < 12 && this.history.length > 1) kept.push(this.history[this.history.length - 2].data);
    while (kept.length > 24) kept.shift();
    if (this.onKept) this.onKept(kept);
    return kept.length;
  }

  // a section: about a minute; its brightness and level, and now and then a kept one
  _newSection() {
    const s = this._score, m = this.mood;
    s.section++;
    s.kept = false;
    if (this.kept.length && s.section > 1 && m.warm < 0.5 && rnd() < 0.35) {
      const k = pick(this.kept);
      if (k && k.degs && k.degs.length === s.slots.length) {
        s.slots.forEach((x, i) => { x.target = k.degs[i]; });
        s.bright = k.bright;
        s.level = k.level ?? 1;
        s.kept = true;
      }
    }
    if (!s.kept) {
      s.bright = 850 + rnd() * 700;
      s.level = 0.85 + rnd() * 0.3;
      s.slots.forEach((x) => { x.target = null; });
    }
    s.sectionEnd = this.ctx.currentTime + 48 + rnd() * 40;
    this._sectionAt = this.ctx.currentTime;
    this.history.push({ at: Date.now(), section: s.section, kept: s.kept, data: this.sectionData() });
    while (this.history.length > 16) this.history.shift();
  }

  // the next note of one voice: stay, or move a step or two, within its range, never
  // onto another voice's note
  _nextDegree(slot, i) {
    const s = this._score;
    if (slot.target !== null && slot.target !== undefined) { const d = slot.target; slot.target = null; return d; }
    const taken = new Set(s.slots.filter((x, j) => j !== i).map((x) => x.deg));
    const r = rnd();
    let step = r < 0.25 ? 0 : r < 0.75 ? (rnd() < 0.5 ? -1 : 1) : (rnd() < 0.5 ? -2 : 2);
    let d = slot.deg + step;
    if (d < slot.lo) d = slot.lo + (slot.lo - d);
    if (d > slot.hi) d = slot.hi - (d - slot.hi);
    for (let k = 0; k < 4 && taken.has(d); k++) d += d < (slot.lo + slot.hi) / 2 ? 1 : -1;
    // the chord's bass rests on the root or the fifth more often than not
    if (i === 0 && rnd() < 0.6) d = rnd() < 0.65 ? 5 : 8;
    return Math.max(slot.lo, Math.min(slot.hi, d));
  }

  _schedule() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime, s = this._score, m = this.mood;
    if (t >= s.sectionEnd) this._newSection();
    // each voice on its own clock, and each note its own fate: most sound and slowly sink
    // into darkness; some dissolve into breath at their pitch; some are only heard as the
    // hall's wash; now and then a voice rests
    s.slots.forEach((slot, i) => {
      if (t < slot.next - 0.2) return;
      slot.deg = this._nextDegree(slot, i);
      const f = pitch(slot.deg);
      const attack = 5 + rnd() * 4, hold = 9 + rnd() * 10, release = 12 + rnd() * 6;
      const g = 0.05 * slot.gain * s.level * (1 - m.drowsy * 0.35) * (m.title > 0.5 ? 0.8 : 1) * (1 + m.warm * 0.25);
      const cut = s.bright * (1 - m.night * 0.25) * (1 + m.warm * 0.3);
      const fate = rnd();
      if (i > 0 && fate < 0.24 && m.warm < 0.5) {
        // a rest: this voice sits out a turn
      } else if (m.night > 0.5 && i >= 3 && fate < 0.4) {
        this._choir(f, slot.next, attack + hold, slot.pan);
      } else if (i > 0 && fate < 0.44) {
        this._dissolve(f, slot.next, attack, hold, release, g, slot.pan);
      } else if (i > 0 && fate < 0.64) {
        // a ghost: only the hall hears it
        this.note(f, { wave: 'pad', when: slot.next, attack: attack + 2, hold, release, gain: g * 0.9, linear: true, cutoff: cut, q: 0.5, pan: slot.pan, dest: this.ghostBus });
      } else {
        this.note(f, {
          wave: m.warm > 0.5 ? 'warm' : 'pad', when: slot.next, attack, hold, release, gain: g, linear: true,
          cutoff: cut, sink: 0.35 + rnd() * 0.3, q: 0.5, pan: slot.pan, dest: this.padBus,
        });
      }
      slot.next = slot.next + attack + hold * 0.8 + rnd() * 6;
    });
    // the tide: the voices swell and ebb, and spend long stretches nearly or wholly
    // silent; every minute or two they rest altogether for half a minute, and only the
    // hall's tail and the air remain. The drone ebbs with them, never quite gone.
    if (t >= s.restAt) { s.restEnd = t + 20 + rnd() * 20; s.restAt = s.restEnd + 60 + rnd() * 90; }
    const resting = t < s.restEnd;
    const raw = 0.5 + 0.5 * Math.sin((t * 2 * Math.PI) / 83) * Math.sin((t * 2 * Math.PI) / 211 + 1);
    const k = Math.min(1, Math.max(0, (raw - 0.3) / 0.5));
    const tide = resting ? 0.0001 : k * k * (3 - 2 * k);
    this.padBus.gain.setTargetAtTime(Math.max(0.0001, tide), t, resting ? 4 : 6);
    this.ghostBus.gain.setTargetAtTime(resting ? 0.06 : 0.15 + 0.85 * tide, t, 6);
    this._droneTide = resting ? 0.18 : 0.3 + 0.7 * Math.min(1, tide * 1.6);
    this.resting = resting;
    // now and then a single soft tone higher up, like a light far off
    if (t >= s.swellAt) {
      if (m.title < 0.5 && m.drowsy < 0.6 && !this.resting) {
        const d = pick(SWELL);
        this.note(pitch(d), { wave: 'soft', when: s.swellAt, attack: 3.5, hold: 1.5, release: 11, gain: 0.014 * (1 - m.night * 0.3), linear: true, cutoff: 1300, pan: (rnd() - 0.5) * 1.4, verb: 1.0, echo: 0.25 });
      }
      s.swellAt = t + 22 + rnd() * 26;
    }
    // very rarely, a few plucked notes, like a guitar somewhere in the hall
    if (t >= s.pluckAt) {
      if (m.title < 0.5 && m.drowsy < 0.6 && !this.resting) this._phrase(s.pluckAt + 0.1);
      s.pluckAt = t + 150 + rnd() * 170;
    }
    this._hum();
    this._updateBeds();
  }

  // A plucked string (Karplus-Strong), rendered once per pitch: a soft burst of noise
  // circulating in a delay one period long, averaged and damped each pass, with an
  // allpass for the fraction of a sample so the pitch is exactly the tuning's.
  _pluckBuffer(f) {
    const key = f.toFixed(3);
    if (this._plucks.has(key)) return this._plucks.get(key);
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 6);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const P = sr / f;
    const Nd = Math.floor(P - 0.5);
    const frac = P - 0.5 - Nd;                       // left for the allpass, 0..1
    const C = (1 - frac) / (1 + frac);
    const line = new Float32Array(Nd);
    // the pluck: noise, softened (a thumb rather than a pick), and plucked a fifth of
    // the way along the string
    for (let i = 0; i < Nd; i++) line[i] = Math.random() * 2 - 1;
    for (let k = 0; k < 3; k++) for (let i = 1; i < Nd; i++) line[i] = 0.5 * (line[i] + line[i - 1]);
    const pos = Math.max(1, Math.floor(Nd / 5));
    const ex = Float32Array.from(line, (v, i) => v - (i >= pos ? line[i - pos] : 0) * 0.8);
    line.set(ex);
    // decay: each note rings for about four seconds, higher ones a little less
    const T60 = 4.2 - Math.min(1.5, f / 600);
    const loss = Math.pow(0.001, 1 / (f * T60));
    let idx = 0, prevIn = 0, prevOut = 0, last = line[Nd - 1];
    let peak = 0;
    for (let n = 0; n < len; n++) {
      const cur = line[idx];
      const x = loss * 0.5 * (cur + last);
      const y = C * x + prevIn - C * prevOut;
      prevIn = x; prevOut = y;
      last = cur;
      line[idx] = y;
      idx = idx + 1 === Nd ? 0 : idx + 1;
      d[n] = cur;
      peak = Math.max(peak, Math.abs(cur));
    }
    for (let n = 0; n < len; n++) d[n] /= peak || 1;
    this._plucks.set(key, buf);
    return buf;
  }

  pluck(f, when, gain = 0.06, pan = 0) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._pluckBuffer(f);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(lp); lp.connect(g); g.connect(p);
    p.connect(this.melody);
    const v = ctx.createGain(); v.gain.value = 1.4; p.connect(v); v.connect(this.verbIn);
    const e = ctx.createGain(); e.gain.value = 0.35; p.connect(e); e.connect(this.echoIn);
    src.start(when);
    src.stop(when + 6);
  }

  // a few notes, a phrase: up or down the palette by steps, loosely timed
  _phrase(t) {
    const count = 3 + Math.floor(rnd() * 4);
    let d = 10 + Math.floor(rnd() * 5);
    const dir = rnd() < 0.6 ? 1 : -1;
    const pan = (rnd() - 0.5) * 0.9;
    let when = t;
    for (let i = 0; i < count; i++) {
      this.pluck(pitch(d), when, 0.055 * (i === 0 ? 1 : 0.8 + rnd() * 0.25), pan + (rnd() - 0.5) * 0.2);
      d += dir * (rnd() < 0.7 ? 1 : 2);
      if (rnd() < 0.2) d -= dir * 3;          // a turn back
      when += BEAT * (rnd() < 0.7 ? 0.5 : rnd() < 0.5 ? 2 / 3 : 1) + (rnd() - 0.5) * 0.06;
    }
  }

  // A note that turns to breath: the tone fades while a resonance of pink noise at the
  // same pitch rises in its place and slowly loosens, until there is only air.
  _dissolve(f, t, attack, hold, release, g, pan) {
    const ctx = this.ctx;
    this.note(f, { wave: 'pad', when: t, attack, hold: hold * 0.35, release: hold * 0.5 + 4, gain: g, linear: true, cutoff: this._score.bright, q: 0.5, pan, dest: this.padBus });
    const src = ctx.createBufferSource();
    src.buffer = this.pink; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f;
    const t1 = t + attack * 0.6, t2 = t + attack + hold, t3 = t2 + release;
    bp.Q.setValueAtTime(30, t1);
    bp.Q.exponentialRampToValueAtTime(1.4, t3);
    bp.frequency.setValueAtTime(f, t1);
    bp.frequency.exponentialRampToValueAtTime(f * 1.5, t3);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t1);
    env.gain.linearRampToValueAtTime(g * 16, t + attack + hold * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, t3);
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    src.connect(bp); bp.connect(env); env.connect(p); p.connect(this.padBus);
    src.start(t1, rnd() * 4);
    src.stop(t3 + 0.2);
  }

  _choir(f, t, dur, pan) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.waves.choir);
    osc.frequency.value = f;
    const v = pick([[300, 870, 2240], [440, 1020, 2240]]);   // oo, oh
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.012, t + 5);
    env.gain.setValueAtTime(0.012, t + dur);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + 10);
    for (const [i, fq] of v.entries()) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fq; bp.Q.value = 9;
      const g = ctx.createGain(); g.gain.value = [1, 0.4, 0.12][i];
      osc.connect(bp); bp.connect(g); g.connect(env);
    }
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    env.connect(p); p.connect(this.padBus);
    osc.start(t); osc.stop(t + dur + 10.5);
  }

  // the artifacts' own voices (voices.js), heard from the ship
  _hum() {
    this.voices.update(this.artifacts, this.beatNow());
  }

  // continuous parts follow the world, smoothly
  _updateBeds() {
    const ctx = this.ctx, t = ctx.currentTime, m = this.mood;
    // the walls, sleep: everything but the effects goes dull
    const cut = 18000 * Math.pow(1 - m.inside * 0.5, 2) * Math.pow(1 - m.drowsy * 0.75, 2) + 300;
    this.tone.frequency.setTargetAtTime(Math.min(18000, cut), t, 0.3);
    for (const d of this.drone) {
      // the drone breathes very slowly
      const breath = 0.85 + 0.15 * Math.sin(t * 0.045 * d.k + d.k);
      d.env.gain.setTargetAtTime(d.g * breath * (this._droneTide ?? 1) * (m.title > 0.5 ? 0.8 : 1), t, 5);
      d.f.frequency.setTargetAtTime(200 + 90 * (0.5 + 0.5 * Math.sin(t * 0.03 * d.k)) + m.near * 80, t, 2);
    }
    const flying = 1 - m.inside;
    this.windG.gain.setTargetAtTime((0.014 + Math.abs(m.turn) * 0.03) * (0.3 + flying * 0.7) * (1 - m.title * 0.5), t, 0.6);
    this.windF.frequency.setTargetAtTime(480 + Math.abs(m.turn) * 650, t, 0.8);
    this.rumbleG.gain.setTargetAtTime(0.03 * (0.6 + m.inside * 0.6), t, 0.5);
    this.hum.gain.setTargetAtTime(0.008 + m.inside * 0.035, t, 0.5);
  }

  // ---------------------------------------------------------------- the boost
  // While the core burns: plasma, not an engine. A high, airy hiss through a resonant band
  // that sweeps up with the burn and wanders; two soft tones a hair apart that climb
  // with it and pulse; and a faint metallic shimmer over them. k: 0..1, every frame.
  engine(k) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this._eng) {
      const out = ctx.createGain(); out.gain.value = 0;
      out.connect(this.sfx);
      const send = ctx.createGain(); send.gain.value = 0.45; out.connect(send); send.connect(this.verbIn);
      // the hiss
      const src = ctx.createBufferSource(); src.buffer = this.pink; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = 700;
      const wob = ctx.createOscillator(); wob.frequency.value = 0.35;
      const wobG = ctx.createGain(); wobG.gain.value = 130;
      wob.connect(wobG); wobG.connect(bp.frequency);
      const hissG = ctx.createGain(); hissG.gain.value = 0.9;
      src.connect(hp); hp.connect(bp); bp.connect(hissG); hissG.connect(out);
      // the two tones, pulsing
      const tones = [1, 1.007].map((m) => {
        const o = ctx.createOscillator(); o.setPeriodicWave(this.waves.soft); o.frequency.value = pitch(8) * m;
        return o;
      });
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1200;
      const trem = ctx.createGain(); trem.gain.value = 0.32;
      const tl = ctx.createOscillator(); tl.frequency.value = 7.5;
      const tlG = ctx.createGain(); tlG.gain.value = 0.12;
      tl.connect(tlG); tlG.connect(trem.gain);
      for (const o of tones) o.connect(lp);
      lp.connect(trem); trem.connect(out);
      // the shimmer: a carrier bent by an inharmonic partner
      const car = ctx.createOscillator(); car.frequency.value = pitch(13);
      const mod = ctx.createOscillator(); mod.frequency.value = pitch(13) * 1.414;
      const idx = ctx.createGain(); idx.gain.value = 0;
      mod.connect(idx); idx.connect(car.frequency);
      const shG = ctx.createGain(); shG.gain.value = 0.1;
      car.connect(shG); shG.connect(out);
      for (const n of [src, wob, tl, car, mod, ...tones]) n.start();
      this._eng = { out, bp, tones, idx };
    }
    const e = this._eng;
    e.out.gain.setTargetAtTime(0.11 * k, t, 0.12);
    e.bp.frequency.setTargetAtTime(650 + 950 * k, t, 0.25);
    e.tones.forEach((o, i) => o.frequency.setTargetAtTime(pitch(8) * (1 + 0.6 * k) * (i ? 1.007 : 1), t, 0.35));
    e.idx.gain.setTargetAtTime(pitch(13) * 0.8 * k, t, 0.3);
  }

  // a tone that slides from one pitch to another (the boost's power up and down)
  glide(f0, f1, o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = Math.max(o.when ?? ctx.currentTime, ctx.currentTime);
    const dur = o.dur ?? 0.5, rel = o.release ?? 0.8;
    const osc = ctx.createOscillator();
    if (o.wave && this.waves[o.wave]) osc.setPeriodicWave(this.waves[o.wave]); else osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.03, t + (o.attack ?? 0.03));
    g.gain.setTargetAtTime(0.0001, t + dur * 0.7, rel / 3);
    osc.connect(g); g.connect(o.dest ?? this.sfx);
    if (o.verb) { const s = ctx.createGain(); s.gain.value = o.verb; g.connect(s); s.connect(this.verbIn); }
    osc.start(t);
    osc.stop(t + dur + rel + 0.5);
  }

  // ---------------------------------------------------------------- effects
  // All low and soft: swells, never bells.
  play(name, o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const S = this.sfx;
    switch (name) {
      case 'signal':
        // something out in the fog: a low fifth that rises and fades into the hall
        [[5, 0], [8, 0.6]].forEach(([d, dt]) => this.note(pitch(d), { wave: 'soft', when: t + dt, attack: 1.6, hold: 0.6, release: 7, gain: 0.032, linear: true, cutoff: 650, pan: (o.pan || 0) * 0.6, verb: 1.2 }));
        break;
      case 'witness':
        // a seeker moved, and the forest answers: a deep breath and a slow, wide chord
        // rising out of the hall, low, nothing struck
        this.note(R, { wave: 'sub', attack: 2.5, hold: 2, release: 9, gain: 0.07, linear: true, cutoff: 200 });
        [[0, 0, -0.6], [3, 0.5, 0.6], [5, 1.0, -0.2], [8, 1.6, 0.3]].forEach(([d, dt, pan]) => this.note(pitch(d, 1), { wave: 'choir', when: t + dt, attack: 3.2, hold: 2.5, release: 12, gain: 0.03, linear: true, cutoff: 800, pan: pan + (o.pan || 0) * 0.3, verb: 1.3 }));
        this.hiss({ type: 'bandpass', freq: 300, q: 0.8, to: 700, attack: 2.4, hold: 1, release: 4, gain: 0.05, pink: true, verb: 0.8 });
        break;
      case 'release':
        // and lets it go: the power falls away, the air with it
        this.glide(pitch(10), pitch(1), { wave: 'soft', dur: 0.6, gain: 0.026, release: 0.9, verb: 0.6 });
        this.hiss({ type: 'bandpass', freq: 1400, q: 2, to: 250, attack: 0.02, release: 1.1, gain: 0.045, pink: true, verb: 0.6 });
        break;
      case 'chime':
        // the cabin's call that something is rising ahead: two soft notes, up a fourth,
        // heard anywhere aboard
        [[13, 0], [15, 0.24]].forEach(([d, dt]) => {
          this.note(pitch(d), { wave: 'soft', when: t + dt, attack: 0.015, release: 1.8, gain: 0.034, cutoff: 1500, dest: S, verb: 0.7 });
          this.note(pitch(d, 1), { type: 'sine', when: t + dt, attack: 0.01, release: 1.1, gain: 0.008, dest: S, verb: 0.7 });
        });
        break;
      case 'alarm':
        // seekers moved: the cabin's call for it, golden and rising, twice, over a low
        // swell, unmistakable from anywhere aboard
        this.note(R, { wave: 'sub', attack: 1.2, hold: 1.5, release: 4, gain: 0.05, linear: true, cutoff: 220 });
        [0, 1.7].forEach((t0) => [10, 13, 15, 17].forEach((d, i) => {
          this.note(pitch(d), { wave: 'warm', when: t + t0 + i * 0.16, attack: 0.02, release: 1.6, gain: 0.032, cutoff: 1600, dest: S, verb: 0.8 });
          this.note(pitch(d, 1), { type: 'sine', when: t + t0 + i * 0.16, attack: 0.01, release: 1.3, gain: 0.009, dest: S, verb: 0.9 });
        }));
        break;
      case 'lock':
        this.note(pitch(8), { wave: 'soft', attack: 0.04, release: 0.7, gain: 0.026, cutoff: 600, dest: S });
        break;
      case 'scan': {
        // the hum climbs the palette as the scan fills
        const d = 10 + Math.floor((o.progress || 0) * 5);
        this.note(pitch(d), { wave: 'hum', attack: 0.05, release: 0.35, gain: 0.02, cutoff: 900, dest: S, verb: 0.2 });
        break;
      }
      case 'shutter':
        this.hiss({ type: 'highpass', freq: 2400, attack: 0.001, release: 0.04, gain: 0.12, pink: true });
        this.hiss({ type: 'bandpass', freq: 700, q: 2, when: t + 0.07, attack: 0.001, release: 0.06, gain: 0.12, pink: true });
        break;
      case 'recorded':
        // a low, warm chord, swelling slowly
        [10, 12, 13].forEach((d, i) => this.note(pitch(d), { wave: 'warm', when: t + 0.15 + i * 0.3, attack: 1.4, hold: 1.2, release: 8, gain: 0.026, linear: true, cutoff: 900, pan: (i - 1) * 0.35, verb: 1.1 }));
        break;
      case 'gate':
        this.note(pitch(10 + ((o.i || 0) % 5)), { wave: 'soft', attack: 0.5, release: 6, gain: 0.034, linear: true, cutoff: 900, verb: 1.1 });
        break;
      case 'step':
        this.hiss({ type: 'lowpass', freq: 340, attack: 0.002, release: 0.09, gain: 0.06 * (o.gain ?? 1), pink: true });
        this.note(R * 2, { type: 'sine', attack: 0.002, release: 0.08, gain: 0.025 * (o.gain ?? 1), dest: S });
        break;
      case 'ui':
        this.note(pitch(13), { wave: 'soft', attack: 0.01, release: 0.18, gain: 0.016, cutoff: 700, dest: S });
        break;
      case 'open':
        [10, 13].forEach((d, i) => this.note(pitch(d), { wave: 'soft', when: t + i * 0.08, attack: 0.08, release: 0.9, gain: 0.022, cutoff: 600, dest: S, verb: 0.3 }));
        break;
      case 'close':
        [13, 10].forEach((d, i) => this.note(pitch(d), { wave: 'soft', when: t + i * 0.07, attack: 0.05, release: 0.6, gain: 0.018, cutoff: 600, dest: S }));
        break;
      case 'send':
        [10, 12, 13].forEach((d, i) => this.note(pitch(d), { wave: 'warm', when: t + i * BEAT / 3, attack: 0.12, release: 2.5, gain: 0.022, cutoff: 800, dest: S, verb: 0.6 }));
        break;
      case 'error':
        this.note(pitch(5), { wave: 'reed', attack: 0.02, release: 0.35, gain: 0.026, cutoff: 500, dest: S });
        this.note(pitch(5) * 17 / 16, { wave: 'reed', when: t + 0.14, attack: 0.02, release: 0.4, gain: 0.026, cutoff: 500, dest: S });
        break;
      case 'door':
        this.hiss({ type: 'bandpass', freq: 620, q: 0.8, to: 200, attack: 0.05, release: 0.6, gain: 0.07, pink: true });
        this.note(R * 2, { wave: 'hum', attack: 0.02, release: 0.5, gain: 0.04, dest: S });
        break;
      case 'yawn':
        this.hiss({ type: 'bandpass', freq: 500, q: 1.5, to: 260, attack: 0.5, hold: 0.4, release: 1.2, gain: 0.045, pink: true });
        break;
      // (the coffee machine's own sounds are foley: foley.js)
      case 'warm':
        // the cup at the window: the chord, warmer
        [5, 10, 12, 13, 14].forEach((d, i) => this.note(pitch(d), { wave: 'warm', when: t + i * 0.25, attack: 2.2, hold: 3, release: 12, gain: 0.026, linear: true, cutoff: 1200, pan: (i - 2) * 0.3, verb: 1.0 }));
        break;
    }
  }
}

export { harmonic, PALETTE, N };
