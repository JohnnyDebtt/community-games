import { pitch, BEAT } from './tuning.js';
import { rng } from './math.js';

// Each artifact has a voice of its own: quiet, alien, made from its seed and its family,
// heard from the ship, and unlike the score: where the music holds long notes, an
// artifact pulses, chirps and stutters, in time with its own light. Its sustained layers
// pass through a gate that opens on every step of its rhythm and sinks between, so even
// they throb. Layers (each artifact has a bed and a rhythm of its own, sometimes more):
//   breath   noise through two narrow resonances that drift, like wind through a shape
//   glass    two sines a breath apart, beating slowly against each other
//   fm       a tone bent by an inharmonic partner, its depth wandering
//   whale    one voice that glides between notes of the palette and rests
//   grains   soft pitched ticks on the artifact's rhythm
//   chirp    short sweeps on its rhythm, like a signal reporting home
//   glitch   now and then a burst of tiny stuttering blips, like data coming apart
//   choir    (witnessed artifacts) a slow chord under everything
// Everything sits in the palette on 42 Hz, in the middle of the range (a few hundred Hz
// to about 2 kHz, where any speaker, a phone's too, carries it and the score's low drone
// does not cover it). Where it is: louder and brighter as the ship comes near, darker and
// wetter far off or behind, panned by its bearing from the nose; never above CAP. Voices
// begin when an artifact is within reach and fade away when it is gone. They go out on
// their own bus, under the EFFECTS volume (and through the cabin's walls, aboard), and
// nearly dry: placed, not washed into the hall with the music.

const REACH = 820;            // meters: beyond this, silence
const CAP = 0.32;            // the loudest any artifact's voice gets (witnessed: CAP_W)
const CAP_W = 0.38;
const FLOOR = 0.22;          // the gate between pulses

const FAMILY = {
  ring: ['glass', 'chirp'], obelisk: ['fm', 'glitch'], orb: ['glass', 'chirp'], lattice: ['grains', 'glitch'],
  shell: ['whale', 'chirp'], crystal: ['glass', 'grains'], tether: ['fm', 'grains'], fungi: ['breath', 'chirp'],
  gate: ['glass', 'glitch'], solids: ['fm', 'glitch'], glyph: ['grains', 'chirp'], chimes: ['glass', 'grains'], echo: ['fm', 'glitch'],
  beacon: ['fm', 'chirp'], orrery: ['glass', 'grains'], helix: ['grains', 'chirp'], tesseract: ['fm', 'glitch'], wreck: ['breath', 'glitch'],
  stair: ['whale', 'chirp'], arbor: ['breath', 'chirp'], pool: ['glass', 'chirp'], sentinel: ['fm', 'glitch'], swarm: ['grains', 'glitch'],
  cradle: ['whale', 'grains'], lanterns: ['glass', 'chirp'], dish: ['grains', 'glitch'],
};

export class ArtifactVoices {
  constructor(audio) {
    this.a = audio;
    this.live = new Map();    // key -> voice
  }

  // list: [{ key, d, dist, bearing, reveal }] (bearing: radians from the nose)
  update(list, beatNow) {
    const a = this.a, ctx = a.ctx, t = ctx.currentTime;
    const keep = new Set();
    for (const x of list) {
      if (x.dist > REACH * 1.05) continue;
      keep.add(x.key);
      let v = this.live.get(x.key);
      if (!v) { v = this._make(x.d); this.live.set(x.key, v); }
      // where it is
      const f = Math.max(0, 1 - x.dist / REACH);
      const behind = Math.abs(x.bearing) > Math.PI / 2;
      const level = (x.d.special ? CAP_W : CAP) * Math.pow(f, 1.2) * (behind ? 0.7 : 1) * (0.35 + 0.65 * (x.reveal ?? 1));
      v.level.gain.setTargetAtTime(level, t, 0.35);
      // mostly dry, so it sits where it is rather than in the hall with the score; a
      // little of the hall for the far ones
      v.send.gain.setTargetAtTime(level * (0.06 + 0.3 * (1 - f)), t, 0.35);
      v.tone.frequency.setTargetAtTime((600 + 3600 * Math.pow(f, 1.5)) * (behind ? 0.55 : 1), t, 0.35);
      v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, -Math.sin(x.bearing) * 0.9)), t, 0.25);
      this._tick(v, t, beatNow);
    }
    for (const [key, v] of this.live) {
      if (keep.has(key)) continue;
      v.level.gain.setTargetAtTime(0, t, 0.6);
      v.send.gain.setTargetAtTime(0, t, 0.8);
      for (const s of v.sources) { try { s.stop(t + 4); } catch { /* stopped */ } }
      this.live.delete(key);
    }
  }

  _make(d) {
    const a = this.a, ctx = a.ctx;
    const R = rng((d.seed[4] ^ 0x5bd1e995) >>> 0);
    const song = d.song || { degrees: [0, 3], octave: 2, pattern: [1, 0, 1, 0, 0], step: 0.5, n: 5 };
    const degs = song.degrees.length ? song.degrees : [0, 3];
    const v = { d, R, sources: [], song, degs };
    // the voice's own chain: everything → tone → level → pan → ambience (and the hall)
    v.bus = ctx.createGain();
    v.tone = ctx.createBiquadFilter(); v.tone.type = 'lowpass'; v.tone.frequency.value = 400; v.tone.Q.value = 0.5;
    v.level = ctx.createGain(); v.level.gain.value = 0;
    v.send = ctx.createGain(); v.send.gain.value = 0;
    v.pan = ctx.createStereoPanner();
    // the gate: it opens on each step of the rhythm and sinks between
    v.gate = ctx.createGain(); v.gate.gain.value = FLOOR;
    v.bus.connect(v.gate); v.gate.connect(v.tone); v.tone.connect(v.level); v.level.connect(v.pan); v.pan.connect(a.voiceBus);
    v.tone.connect(v.send); v.send.connect(a.verbIn);
    const layers = (FAMILY[d.family] || ['glass', 'chirp']).slice();
    if (R() < 0.35) layers.push(R.pick(['chirp', 'glitch', 'grains'].filter((l) => !layers.includes(l))));
    if (d.special) layers.push('choir', 'glitch');
    v.layers = [...new Set(layers)];
    for (const l of v.layers) this['_' + l](v);
    return v;
  }

  _lfo(v, rate, depth, target, offset = null) {
    const ctx = this.a.ctx;
    const o = ctx.createOscillator(); o.frequency.value = rate;
    const g = ctx.createGain(); g.gain.value = depth;
    o.connect(g); g.connect(target);
    if (offset !== null) target.value = offset;
    o.start(ctx.currentTime + v.R() * 3);
    v.sources.push(o);
    return o;
  }

  _breath(v) {
    const a = this.a, ctx = a.ctx, R = v.R;
    const src = ctx.createBufferSource();
    src.buffer = a.pink; src.loop = true;
    const oct = R.pick([3, 4]);
    const out = ctx.createGain(); out.gain.value = 0;
    v.degs.slice(0, 2).forEach((dg, i) => {
      const f = Math.min(2000, pitch(dg, oct));
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 10 + R() * 8; bp.frequency.value = f;
      this._lfo(v, 0.03 + R() * 0.07, f * 0.06, bp.frequency);
      const g = ctx.createGain(); g.gain.value = i ? 0.7 : 1;
      src.connect(bp); bp.connect(g); g.connect(out);
    });
    // it breathes: the level rises and falls slowly, never quite to nothing
    this._lfo(v, 0.05 + R() * 0.08, 4.5, out.gain, 6);
    out.connect(v.bus);
    src.start(ctx.currentTime, R() * 5);
    v.sources.push(src);
  }

  _glass(v) {
    const ctx = this.a.ctx, R = v.R;
    const oct = R.pick([2, 3, 3]);
    const f = pitch(v.degs[0], oct), beat = 0.35 + R() * 1.2;
    const out = ctx.createGain(); out.gain.value = 0;
    for (const [hz, g] of [[f, 0.5], [f + beat, 0.5], [pitch(v.degs[v.degs.length - 1], oct) * (R() < 0.5 ? 1 : 0.5), 0.22]]) {
      const o = ctx.createOscillator(); o.frequency.value = hz;
      const gg = ctx.createGain(); gg.gain.value = g;
      o.connect(gg); gg.connect(out);
      o.start(); v.sources.push(o);
    }
    this._lfo(v, 0.03 + R() * 0.05, 0.35, out.gain, 0.4);
    out.connect(v.bus);
  }

  _fm(v) {
    const ctx = this.a.ctx, R = v.R;
    const f = pitch(v.degs[0], R.pick([1, 2, 2]));
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * R.pick([1.414, 2.76, 3.53, 0.707, 1.618]);
    const idx = ctx.createGain(); idx.gain.value = 0;
    mod.connect(idx); idx.connect(car.frequency);
    // how far it bends wanders slowly: from nearly pure to strange
    this._lfo(v, 0.04 + R() * 0.06, f * 0.55, idx.gain, f * 0.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
    const out = ctx.createGain(); out.gain.value = 0;
    this._lfo(v, 0.05 + R() * 0.05, 0.2, out.gain, 0.24);
    car.connect(lp); lp.connect(out); out.connect(v.bus);
    car.start(); mod.start();
    v.sources.push(car, mod);
  }

  _whale(v) {
    const ctx = this.a.ctx, R = v.R;
    const o = ctx.createOscillator();
    o.setPeriodicWave(this.a.waves.soft);
    v.whaleOct = R.pick([2, 3]);
    o.frequency.value = pitch(v.degs[0], v.whaleOct);
    const vib = ctx.createOscillator(); vib.frequency.value = 3.2 + R() * 1.5;
    const vg = ctx.createGain(); vg.gain.value = o.frequency.value * 0.004;
    vib.connect(vg); vg.connect(o.frequency);
    const env = ctx.createGain(); env.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
    o.connect(lp); lp.connect(env); env.connect(v.bus);
    o.start(); vib.start();
    v.sources.push(o, vib);
    v.whale = { o, env, next: ctx.currentTime + 1 + R() * 3 };
  }

  _grains(v) {
    v.grains = { oct: v.R.pick([3, 4]) };
  }

  _chirp(v) {
    v.chirp = { oct: v.R.pick([3, 4]), p: 0.45 + v.R() * 0.4, dir: v.R.pick([2, 1.5, 0.5, 0.67]) };
  }

  _glitch(v) {
    v.glitch = { oct: v.R.pick([4, 5]), next: this.a.ctx.currentTime + 1 + v.R() * 3, gap: 2 + v.R() * 4 };
  }

  _choir(v) {
    const a = this.a, ctx = a.ctx, R = v.R;
    const out = ctx.createGain(); out.gain.value = 0;
    [0, 2, 4].map((i) => v.degs[i % v.degs.length] + (i > 2 ? 5 : 0)).forEach((dg, i) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(a.waves.choir);
      o.frequency.value = pitch(dg, 2 + (i === 2 ? 1 : 0)) * (1 + (R() - 0.5) * 0.002);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = ctx.createGain(); g.gain.value = [0.3, 0.22, 0.16][i];
      o.connect(lp); lp.connect(g); g.connect(out);
      o.start(); v.sources.push(o);
    });
    this._lfo(v, 0.025 + R() * 0.02, 0.4, out.gain, 0.55);
    out.connect(v.bus);
  }

  // the voices that move in time: the whale's glides, the grains on the rhythm
  _tick(v, t, beatNow) {
    const a = this.a, ctx = a.ctx, R = v.R;
    const w = v.whale;
    if (w && t >= w.next) {
      // a phrase: rise, glide to another note, fade, rest
      const to = pitch(R.pick(v.degs) + R.pick([0, 0, 1, -1, 2]), v.whaleOct);
      const dur = 2.5 + R() * 4;
      w.o.frequency.setTargetAtTime(to, t + 0.4, dur * 0.3);
      w.env.gain.cancelScheduledValues(t);
      w.env.gain.setTargetAtTime(0.32, t, dur * 0.2);
      w.env.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
      w.next = t + dur + 2 + R() * 7;
    }
    // the steps of its rhythm (the same clock its light pulses to), a little ahead: the
    // gate opens on each, and the grains and chirps fall on them
    if (beatNow !== null) {
      const s = v.song, st = s.step || 0.5;
      const nowStep = Math.floor(beatNow / st);
      if (v.nextStep === undefined || v.nextStep <= nowStep) v.nextStep = nowStep + 1;
      for (;;) {
        const when = t + (v.nextStep * st - beatNow) * BEAT;
        if (when > t + 0.3) break;
        if (s.pattern[((v.nextStep % s.n) + s.n) % s.n]) {
          const g = v.gate.gain;
          g.setTargetAtTime(1, when, 0.006);
          g.setTargetAtTime(FLOOR, when + 0.03, st * BEAT * 0.28);
          if (v.grains) this._grain(v, when, v.grains);
          if (v.chirp && R() < v.chirp.p) this._chirpAt(v, when);
        }
        v.nextStep++;
      }
    }
    // now and then, a stutter
    const gl = v.glitch;
    if (gl && t + 0.3 >= gl.next) {
      this._burst(v, Math.max(t, gl.next), gl);
      gl.next = Math.max(t, gl.next) + gl.gap + R() * gl.gap;
    }
  }

  // a sweep, up or down, short (straight to the tone: the gate is for the beds)
  _chirpAt(v, when) {
    const ctx = this.a.ctx, R = v.R, c = v.chirp;
    const f0 = Math.min(2400, pitch(R.pick(v.degs), c.oct)), f1 = f0 * (R() < 0.7 ? c.dir : 1 / c.dir);
    const o = ctx.createOscillator(); o.type = R() < 0.3 ? 'triangle' : 'sine';
    o.frequency.setValueAtTime(f0, when);
    o.frequency.exponentialRampToValueAtTime(f1, when + 0.07 + R() * 0.05);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(0.7, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    o.connect(env); env.connect(v.tone);
    o.start(when); o.stop(when + 0.15);
  }

  // a burst of tiny blips, a few hundredths of a second apart, on stray notes of the
  // palette, high and boxy: data coming apart
  _burst(v, when, gl) {
    const ctx = this.a.ctx, R = v.R;
    const n = R.int(5, 11), gap = R.pick([0.025, 0.033, 0.045]);
    for (let i = 0; i < n; i++) {
      const at = when + i * gap * (0.8 + R() * 0.4);
      const f = Math.min(3200, pitch(R.pick(v.degs) + R.pick([0, 0, 5]), gl.oct));
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 3;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.5, at + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.018 + R() * 0.012);
      o.connect(bp); bp.connect(env); env.connect(v.tone);
      o.start(at); o.stop(at + 0.04);
    }
  }

  _grain(v, when, gr) {
    const a = this.a, ctx = a.ctx, R = v.R;
    const src = ctx.createBufferSource();
    src.buffer = a.pink;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.value = Math.min(2400, pitch(R.pick(v.degs), gr.oct));
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(2.2, when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.09 + R() * 0.08);
    src.connect(bp); bp.connect(env); env.connect(v.bus);
    src.start(when, R() * 5);
    src.stop(when + 0.25);
  }
}
