// All sound is synthesized here with Web Audio: nothing to download.
//
// Every pitch is 48 Hz x X / 2^N, the Seeker tuning (just intonation on the harmonic
// series of 48 Hz). The default palette: 1, 9/8, 19/16, 21/16, 3/2, 7/4. The music runs
// at 90 BPM, eight animation frames per beat. Noise and silence are free.

export const F0 = 48;
export const PALETTE = [1, 9 / 8, 19 / 16, 21 / 16, 3 / 2, 7 / 4];
export const BPM = 90;
export const BEAT = 60 / BPM;
export const pitch = (degree, octave) => {
  const n = PALETTE.length;
  const o = octave + Math.floor(degree / n);
  return F0 * PALETTE[((degree % n) + n) % n] * Math.pow(2, o);
};
// harmonic n of 48 Hz (n whole): always in tune
export const harmonic = (n, octave = 0) => F0 * n * Math.pow(2, octave);

export class Audio {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.7 };
    this.mood = { night: 0, aurora: 0, deep: 0, snow: 0, fight: 0, zone: 'shallows', indoors: 0, listener: 0 };
    this._step = 0;
    this._next = 0;
    this._bar = 0;
    this._chord = 0;
    this._loops = {};
    this._iceTimer = 8;
    this.muted = false;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // The whole mix is normalized as in SEEKER: the buses sum into a glue compressor,
    // then the master stage (leveler, soft clipper, look-ahead limiter: the mix always
    // peaks at -0.3 dBFS), then your volume, which normalizing never undoes.
    //   music, sfx, ambience, reverb → bus → glue → master stage → volume → out
    // The voices are written at small gains; the bus brings their sum up to the level
    // SEEKER's mix runs at (+12 dB), where the glue works gently and the leveler has
    // only a little to add, and a little room to lift a quiet stretch.
    this.bus = ctx.createGain();
    this.bus.gain.value = 4;
    this.glue = ctx.createDynamicsCompressor();
    this.glue.threshold.value = -16;
    this.glue.knee.value = 12;
    this.glue.ratio.value = 2.2;
    this.glue.attack.value = 0.02;
    this.glue.release.value = 0.25;
    this.master = ctx.createGain();
    this.bus.connect(this.glue);
    this.glue.connect(this.master);
    this.master.connect(ctx.destination);
    this._normalize();
    this.music = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.music.connect(this.bus);
    this.sfx.connect(this.bus);
    this.amb.connect(this.bus);
    // a long, cold reverb, and a delay on the eighth note
    this.verb = ctx.createConvolver();
    this.verb.buffer = this._impulse(3.2, 2.6);
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 1;
    this.verbIn.connect(this.verb);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.5;
    this.verb.connect(verbOut);
    verbOut.connect(this.bus);
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = BEAT / 2;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2200;
    this.delay.connect(dlp);
    dlp.connect(fb);
    fb.connect(this.delay);
    const dout = ctx.createGain();
    dout.gain.value = 0.35;
    dlp.connect(dout);
    dout.connect(this.music);
    dout.connect(this.verbIn);
    this.delayIn = ctx.createGain();
    this.delayIn.connect(this.delay);
    this.noise = this._noiseBuffer(3);
    this.applyVolumes();
    this._startAmbience();
    this._next = ctx.currentTime + 0.3;
    this.ready = true;
  }

  // The master stage runs on the audio thread. Until it has loaded (or where audio
  // worklets are missing) the glue compressor alone stands in; a stage that fails is
  // built again, since the browser silences a failed processor for good.
  async _normalize() {
    const ctx = this.ctx;
    if (!ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return;
    try {
      if (!this._stageLoaded) {
        await ctx.audioWorklet.addModule(new URL('./master-worklet.js', import.meta.url));
        this._stageLoaded = true;
      }
      const stage = new AudioWorkletNode(ctx, 'soundings-master', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit',
      });
      stage.port.onmessage = (e) => { this.meter = e.data; };
      stage.onprocessorerror = () => {
        this.glue.disconnect();
        this.glue.connect(this.master);
        stage.disconnect();
        this.stage = null;
        setTimeout(() => this._normalize(), 500);
      };
      this.glue.disconnect();
      this.glue.connect(stage);
      stage.connect(this.master);
      this.stage = stage;
    } catch {
      // the glue compressor alone, as before
    }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.muted ? 0 : this.vol.master;
    this.master.gain.setTargetAtTime(m, t, 0.05);
    this.music.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.1);
    this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(this.vol.ambience * 0.9, t, 0.1);
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }

  _noiseBuffer(sec) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * sec), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  _impulse(sec, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 80 ? i / 80 : 1);
      }
    }
    return b;
  }

  // ---------------------------------------------------------------- primitives
  // A tuned voice: partials of one frequency (always harmonics, never detuned).
  voice(freq, o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = o.when ?? ctx.currentTime;
    const a = o.attack ?? 0.005, d = o.decay ?? 0.8, peak = o.gain ?? 0.2;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(peak, t + a);
    if (o.sustain) {
      out.gain.setValueAtTime(peak, t + a + o.sustain);
      out.gain.exponentialRampToValueAtTime(0.0001, t + a + o.sustain + d);
    } else {
      out.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    let node = out;
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      f.Q.value = 0.5;
      out.connect(f);
      node = f;
    }
    const partials = o.partials || [1];
    const end = t + a + (o.sustain || 0) + d + 0.05;
    partials.forEach((amp, k) => {
      if (!amp) return;
      const osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(freq * (k + 1), t);
      if (o.glide) osc.frequency.exponentialRampToValueAtTime(o.glide * (k + 1), t + a + d);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(end);
    });
    const bus = o.bus === 'music' ? this.music : o.bus === 'amb' ? this.amb : this.sfx;
    node.connect(bus);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      node.connect(s);
      s.connect(this.verbIn);
    }
    if (o.echo) {
      const s = ctx.createGain();
      s.gain.value = o.echo;
      node.connect(s);
      s.connect(this.delayIn);
    }
    if (o.pan !== undefined && ctx.createStereoPanner) {
      // already connected; panning applied by a panner on a copy is not worth the cost here
    }
  }

  burst(o = {}) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = o.when ?? ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1200, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + (o.dur || 0.1));
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    const a = o.attack ?? 0.003, d = o.dur ?? 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    src.connect(f);
    f.connect(g);
    g.connect(o.bus === 'amb' ? this.amb : this.sfx);
    if (o.verb) {
      const s = ctx.createGain();
      s.gain.value = o.verb;
      g.connect(s);
      s.connect(this.verbIn);
    }
    src.start(t, Math.random() * 2);
    src.stop(t + a + d + 0.05);
  }

  // ---------------------------------------------------------------- sound effects
  step(left, running) {
    // crunch of snow: two filtered noise grains
    const f = left ? 900 : 760;
    this.burst({ freq: f, q: 0.7, dur: running ? 0.06 : 0.08, gain: running ? 0.07 : 0.05, filter: 'bandpass' });
    this.burst({ freq: 2600, q: 1.4, dur: 0.035, gain: 0.025, when: this.ctx && this.ctx.currentTime + 0.018 });
  }
  drill(on) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (on && !this._loops.drill) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 420;
      f.Q.value = 2.2;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 6;     // the auger's turn, four times a beat
      const lg = ctx.createGain();
      lg.gain.value = 140;
      lfo.connect(lg);
      lg.connect(f.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      g.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.1);
      src.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      src.start();
      lfo.start();
      this._loops.drill = { src, lfo, g };
    } else if (!on && this._loops.drill) {
      const { src, lfo, g } = this._loops.drill;
      g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.04);
      src.stop(ctx.currentTime + 0.2);
      lfo.stop(ctx.currentTime + 0.2);
      this._loops.drill = null;
    }
  }
  breakthrough() {
    this.burst({ freq: 300, sweep: 120, q: 0.8, dur: 0.35, gain: 0.25, filter: 'lowpass' });
    this.voice(harmonic(3, 3), { decay: 0.6, gain: 0.05, verb: 0.4 });
  }
  plunk() {
    this.burst({ freq: 700, sweep: 180, q: 2, dur: 0.18, gain: 0.12 });
    this.voice(harmonic(5, 4), { decay: 0.12, gain: 0.03, glide: harmonic(3, 4) });
  }
  splash(size = 1) {
    this.burst({ freq: 1600, sweep: 300, q: 0.6, dur: 0.25 + size * 0.2, gain: 0.12 + size * 0.1, filter: 'lowpass', verb: 0.2 });
    this.burst({ freq: 3200, q: 0.8, dur: 0.12, gain: 0.05 * size });
  }
  reelTick(rate) {
    this.burst({ freq: 3800, q: 6, dur: 0.012, gain: 0.03 + rate * 0.02 });
  }
  jig() {
    this.burst({ freq: 2200, q: 4, dur: 0.02, gain: 0.03 });
  }
  bite(freq) {
    // two taps on the line, and the fish's own tone
    this.burst({ freq: 1500, q: 3, dur: 0.03, gain: 0.12 });
    this.burst({ freq: 1300, q: 3, dur: 0.03, gain: 0.1, when: this.ctx && this.ctx.currentTime + 0.11 });
    this.voice(freq, { partials: [1, 0.3, 0.12], decay: 1.2, gain: 0.09, verb: 0.35 });
  }
  strike() {
    this.burst({ freq: 900, sweep: 2400, q: 1.2, dur: 0.12, gain: 0.12 });
  }
  run() {
    this.burst({ freq: 260, q: 1.5, dur: 0.3, gain: 0.07, filter: 'bandpass' });
  }
  snap() {
    this.burst({ freq: 4000, q: 2, dur: 0.05, gain: 0.25 });
    this.voice(harmonic(16, 2), { decay: 0.5, gain: 0.08, glide: harmonic(8, 1) });
  }
  // the Codex recording: up the harmonic series of the fish's own tone
  scan(freq) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [4, 5, 6, 7, 8].forEach((n, i) => {
      this.voice((freq / 4) * n, { when: t + i * (BEAT / 4), decay: 0.6, gain: 0.05, partials: [1, 0.2], verb: 0.3, echo: 0.2 });
    });
  }
  newRecord() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [pitch(0, 3), pitch(4, 3), pitch(6, 3), pitch(10, 3)].forEach((f, i) => this.voice(f, { when: t + i * BEAT / 2, decay: 1.4, gain: 0.06, partials: [1, 0.25, 0.1], verb: 0.5, echo: 0.3 }));
  }
  ui(kind = 'click') {
    if (kind === 'click') this.voice(harmonic(12, 2), { decay: 0.05, gain: 0.04 });
    else if (kind === 'open') this.voice(harmonic(9, 2), { decay: 0.15, gain: 0.04, glide: harmonic(12, 2) });
    else if (kind === 'close') this.voice(harmonic(12, 2), { decay: 0.12, gain: 0.035, glide: harmonic(9, 2) });
    else if (kind === 'deny') this.voice(harmonic(7, 1), { decay: 0.18, gain: 0.05 });
    else if (kind === 'buy') { this.voice(pitch(0, 3), { decay: 0.5, gain: 0.05 }); this.voice(pitch(4, 3), { decay: 0.7, gain: 0.05, when: this.ctx.currentTime + BEAT / 4 }); }
    else if (kind === 'coin') { this.voice(harmonic(16, 2), { decay: 0.18, gain: 0.04, partials: [1, 0.3] }); this.voice(harmonic(24, 2), { decay: 0.3, gain: 0.035, when: this.ctx.currentTime + 0.06, partials: [1, 0.2] }); }
    else if (kind === 'ready') { const t = this.ctx.currentTime; [8, 10, 12].forEach((n, i) => this.voice(harmonic(n, 2), { when: t + i * 0.07, decay: 0.25, gain: 0.04, type: 'square', lowpass: 3000 })); }
    else if (kind === 'request') { const t = this.ctx.currentTime; [pitch(0, 3), pitch(2, 3), pitch(4, 3)].forEach((f, i) => this.voice(f, { when: t + i * BEAT / 4, decay: 0.6, gain: 0.05, partials: [1, 0.3], verb: 0.3 })); }
  }
  // SEEKER NET's released charge falling from the sky, landing, taken in
  sparkFall() {
    if (!this.ready) return;
    this.voice(harmonic(40, 1), { decay: 1.4, gain: 0.04, glide: harmonic(10, 1), verb: 0.7, echo: 0.4 });
  }
  sparkLand() {
    this.burst({ freq: 500, sweep: 90, q: 0.8, dur: 0.5, gain: 0.2, filter: 'lowpass', verb: 0.5 });
    this.voice(harmonic(6, 2), { decay: 1.6, gain: 0.06, partials: [1, 0.5, 0.3, 0.2], verb: 0.6 });
  }
  sparkTake() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [8, 10, 12, 14, 16].forEach((n, i) => this.voice(harmonic(n, 2), { when: t + i * 0.045, decay: 0.4, gain: 0.04, partials: [1, 0.2], verb: 0.4 }));
  }
  wake() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [1, 5 / 4, 3 / 2, 7 / 4, 2].forEach((r, i) => this.voice(F0 * 4 * r, { when: t + i * BEAT / 2, decay: 2.6, gain: 0.045, partials: [1, 0.4, 0.2], verb: 0.8, echo: 0.3, bus: 'music' }));
  }
  overdrive(big = false) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.burst({ freq: 300, sweep: 3200, q: 1, dur: 0.35, gain: 0.12 });
    [8, 12, 16, big ? 24 : 20].forEach((n, i) => this.voice(harmonic(n, 1), { when: t + 0.08 + i * BEAT / 4, decay: 0.5, gain: 0.05, type: 'square', lowpass: 3600, verb: 0.3 }));
    if (big) this.boom();
  }
  jump() {
    this.burst({ freq: 600, sweep: 1800, q: 1, dur: 0.12, gain: 0.06 });
  }
  clunk() {
    this.burst({ freq: 180, q: 1.2, dur: 0.18, gain: 0.2, filter: 'lowpass' });
    this.voice(harmonic(2, 1), { decay: 0.3, gain: 0.06, type: 'triangle', lowpass: 600 });
  }
  steam() {
    this.burst({ freq: 3000, sweep: 1200, q: 0.5, dur: 0.6, gain: 0.07, filter: 'highpass' });
  }
  // A seeker's voice: each token is its own harmonic of 48 Hz.
  chirp(token, loud = false, activated = true) {
    if (!this.ready) return;
    const n = 8 + (token % 17);            // harmonics 8..24
    const t = this.ctx.currentTime;
    const g = activated ? 0.06 : 0.03;
    this.voice(harmonic(n, 2), { when: t, decay: 0.09, gain: g * (loud ? 1.6 : 1), type: 'square', lowpass: 2600 });
    this.voice(harmonic(n + 1, 2), { when: t + BEAT / 4, decay: 0.09, gain: g * (loud ? 1.6 : 1), type: 'square', lowpass: 2600 });
    this.voice(harmonic(n, 3), { when: t + BEAT / 2, decay: 0.2, gain: g * 0.8 * (loud ? 1.6 : 1), type: 'square', lowpass: 2600, verb: 0.2 });
  }
  pulse() {
    // a seeker moved somewhere on the network
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    [1, 3 / 2, 7 / 4, 2].forEach((r, i) => this.voice(F0 * 8 * r, { when: t + i * BEAT / 2, decay: 2.2, gain: 0.035, verb: 0.7, echo: 0.3, bus: 'music' }));
  }
  creak() {
    const r = [1, 9 / 8, 3 / 2][Math.floor(Math.random() * 3)];
    this.voice(harmonic(1, 1) * r, { decay: 1.2, gain: 0.05, type: 'triangle', lowpass: 300, bus: 'amb' });
  }
  // frozen sea "singing": a falling chirp that rings across the ice
  pew() {
    const hi = harmonic(36 + Math.floor(Math.random() * 28));
    this.voice(hi, { decay: 0.32, gain: 0.03, glide: hi * 0.12, bus: 'amb', verb: 0.8 });
  }
  boom() {
    this.voice(60, { decay: 1.4, gain: 0.11, glide: 38, bus: 'amb', verb: 0.6 });
    this.burst({ freq: 140, q: 0.7, dur: 0.6, gain: 0.08, filter: 'lowpass', bus: 'amb', verb: 0.5 });
  }

  // the line's hum climbs harmonics 8..16 of 48 Hz as it strains
  tension(level) {
    if (!this.ready) return;
    const ctx = this.ctx;
    if (level > 0 && !this._loops.hum) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      osc.connect(f);
      f.connect(g);
      g.connect(this.sfx);
      osc.start();
      this._loops.hum = { osc, g, n: 0 };
    }
    const h = this._loops.hum;
    if (!h) return;
    if (level <= 0) {
      h.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
      h.osc.stop(ctx.currentTime + 0.3);
      this._loops.hum = null;
      return;
    }
    const n = 8 + Math.min(8, Math.floor(level * 9));
    if (n !== h.n) {
      h.n = n;
      h.osc.frequency.setTargetAtTime(harmonic(n), ctx.currentTime, 0.015);
    }
    h.g.gain.setTargetAtTime(0.012 + level * 0.05, ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- ambience
  _startAmbience() {
    const ctx = this.ctx;
    // wind: brown-ish noise through a slowly wandering band
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 520;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 380;
    bp.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lg = ctx.createGain();
    lg.gain.value = 160;
    lfo.connect(lg);
    lg.connect(bp.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(lp);
    lp.connect(bp);
    bp.connect(g);
    g.connect(this.amb);
    src.start();
    lfo.start();
    // snow hiss
    const s2 = ctx.createBufferSource();
    s2.buffer = this.noise;
    s2.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4500;
    const g2 = ctx.createGain();
    g2.gain.value = 0.0001;
    s2.connect(hp);
    hp.connect(g2);
    g2.connect(this.amb);
    s2.start(0, 1.3);
    this._wind = { g, g2, bp };
  }

  // ---------------------------------------------------------------- the music
  update(dt) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const m = this.mood;
    const t = ctx.currentTime;
    if (this._wind) {
      // well under the music: it never stops, so it fills every rest between notes
      // (a storm still brings it up, by about 9 dB)
      const w = (0.022 + m.snow * 0.044 + m.night * 0.009) * (1 - m.indoors * 0.7);
      this._wind.g.gain.setTargetAtTime(w, t, 0.8);
      this._wind.g2.gain.setTargetAtTime(m.snow * 0.011 * (1 - m.indoors), t, 0.8);
    }
    // the ice sings now and then, more in the cold of night
    this._iceTimer -= dt;
    if (this._iceTimer <= 0) {
      this._iceTimer = 14 + Math.random() * (40 - m.night * 18);
      const r = Math.random();
      if (r < 0.62) {
        this.pew();
        if (Math.random() < 0.5) setTimeout(() => this.pew(), 180 + Math.random() * 300);
      } else if (r < 0.85) this.creak();
      else this.boom();
    }
    const step = BEAT / 2;   // the eighth-note grid
    if (this._next < t - 1) this._next = t + 0.05;
    while (this._next < t + 0.25) {
      this._playStep(this._step, this._next);
      this._step++;
      this._next += step;
    }
  }

  _playStep(s, when) {
    const m = this.mood;
    const quiet = Math.max(m.fight * 0.75, m.listener);
    if (quiet > 0.95) return;
    const bar = Math.floor(s / 8);
    if (s % 64 === 0) this._chord = (this._chord + 1 + Math.floor(Math.random() * 2)) % 4;
    const deep = m.deep;
    // drone: two notes, a chord every eight bars, swelling slowly
    if (s % 32 === 0) {
      const chords = [[0, 4], [1, 5], [3, 6], [2, 4]];
      const [a, b] = chords[this._chord];
      const oct = deep > 0.5 ? 1 : 2;
      const g = 0.045 * (1 - quiet) * (1 - m.indoors * 0.4);
      this.voice(pitch(a, oct), { when, attack: 3.5, sustain: 3.5, decay: 4, gain: g, partials: [1, 0.35, 0.12], lowpass: 700, bus: 'music', verb: 0.6 });
      this.voice(pitch(b, oct), { when: when + BEAT, attack: 3.5, sustain: 3, decay: 4, gain: g * 0.75, partials: [1, 0.25], lowpass: 700, bus: 'music', verb: 0.6 });
    }
    // two motifs, five and seven steps long, meeting again every thirty-five
    const density = (m.night > 0.5 ? 0.42 : 0.58) * (1 - quiet) * (deep > 0.5 ? 0.6 : 1);
    const m5 = [0, 2, 4, 2, 1], m7 = [4, 5, 7, 6, 4, 3, 2];
    const base = this._chord === 2 ? 1 : 0;
    if (s % 5 === 0 && Math.random() < density) {
      const deg = m5[(s / 5) % m5.length] + base;
      this.voice(pitch(deg, m.night > 0.5 ? 3 : 4), { when, decay: 1.8, gain: 0.04, partials: [1, 0.22, 0.06], bus: 'music', verb: 0.5, echo: 0.35 });
    }
    if (s % 7 === 0 && Math.random() < density * 0.8) {
      const deg = m7[(s / 7) % m7.length] + base;
      this.voice(pitch(deg, 3), { when, decay: 2.4, gain: 0.032, partials: [1, 0.3], bus: 'music', verb: 0.6, echo: 0.25 });
    }
    // under a strong aurora, high harmonics shimmer
    if (m.aurora > 0.3 && m.night > 0.5 && s % 3 === 0 && Math.random() < m.aurora * 0.5) {
      const n = [16, 18, 20, 21, 24, 28][Math.floor(Math.random() * 6)];
      this.voice(harmonic(n, 1), { when, attack: 0.3, decay: 2.5, gain: 0.012 * m.aurora, bus: 'music', verb: 0.9 });
    }
    // the Vagrant's lute, somewhere out on the ice, in the same key and on the same grid
    if (this.vagrant && this.vagrant.level > 0.005) this._luteStep(s, when);
    void bar;
  }

  // ---------------------------------------------------------------- the Vagrant
  // A plucked string: bright at the pluck, mellowing as it rings, placed left or right.
  lute(freq, when, gain, pan = 0, ring = 1.2) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, when);
    out.gain.linearRampToValueAtTime(gain, when + 0.004);
    out.gain.exponentialRampToValueAtTime(0.0001, when + ring);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.min(9000, freq * 7), when);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, freq * 1.6), when + ring * 0.6);
    f.Q.value = 0.7;
    out.connect(f);
    let node = f;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      f.connect(pn);
      node = pn;
    }
    node.connect(this.music);
    const s = ctx.createGain();
    s.gain.value = 0.35;
    node.connect(s);
    s.connect(this.verbIn);
    [1, 0.55, 0.32, 0.2, 0.12].forEach((amp, k) => {
      const osc = ctx.createOscillator();
      osc.type = k ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * (k + 1), when);
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g);
      g.connect(out);
      osc.start(when);
      osc.stop(when + ring + 0.05);
    });
  }

  // Their tune: two bars of eighths over the score's chord, a bass string on each bar.
  _luteStep(s, when) {
    const v = this.vagrant;
    const root = LUTE_CHORDS[this._chord][0];
    const phrase = Math.floor(s / 16) % 2 ? LUTE_B : LUTE_A;
    const n = phrase[s % 16];
    const g = 0.085 * v.level;
    if (n !== null) this.lute(pitch(root + n, 3), when + (s % 2 ? 0.02 : 0), g * (s % 4 === 0 ? 1 : 0.75), v.pan);
    if (s % 8 === 0) this.lute(pitch(root, 2), when, g * 0.7, v.pan, 1.8);
  }

  // A song bought: the creature's own note, then a phrase that climbs to it.
  vagrantSong(freq) {
    if (!this.ready) return;
    let f = freq;
    while (f > 700) f /= 2;
    while (f < 300) f *= 2;
    const t = this.ctx.currentTime + 0.05;
    const steps = [0.75, 0.84375, 1, 1.125, 1, 0.84375, 1, 1.5];
    steps.forEach((r, i) => this.lute(f * r, t + i * BEAT * 0.5, i === 7 ? 0.11 : 0.08, 0, i === 7 ? 2.4 : 1.1));
  }

  // The yak: The Seeker's own moos, loaded the first time it is near.
  loadMoos() {
    if (!this.ready || this._moos) return;
    this._moos = [];
    for (const n of [1, 2, 3]) {
      fetch(new URL(`../../assets/audio/yak/Mooo${n}.flac`, import.meta.url))
        .then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => this._moos.push(buf)).catch(() => {});
    }
  }

  moo(gain = 1, pan = 0) {
    if (!this.ready || gain < 0.02) return;
    const ctx = this.ctx;
    this.loadMoos();
    if (!this._moos.length) return;
    const src = ctx.createBufferSource();
    src.buffer = this._moos[Math.floor(Math.random() * this._moos.length)];
    src.playbackRate.value = 0.94 + Math.random() * 0.1;
    const g = ctx.createGain();
    g.gain.value = 0.5 * gain;
    src.connect(g);
    let node = g;
    if (ctx.createStereoPanner) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      g.connect(pn);
      node = pn;
    }
    node.connect(this.sfx);
    const s = ctx.createGain();
    s.gain.value = 0.25;
    node.connect(s);
    s.connect(this.verbIn);
    src.start();
  }
}

const LUTE_CHORDS = [[0, 4], [1, 5], [3, 6], [2, 4]];
// scale steps above the chord's root; null rests
const LUTE_A = [0, null, 2, null, 4, 2, null, 5, 4, null, 2, null, 1, null, 0, null];
const LUTE_B = [0, null, 2, null, 4, 5, null, 7, 6, null, 4, null, 2, 4, 2, null];
