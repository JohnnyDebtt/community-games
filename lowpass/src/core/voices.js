import { pitch, BEAT } from './tuning.js';
import { rng } from './math.js';

// Each artifact has a voice of its own: quiet, alien, made from its seed and its family,
// heard from the ship. Layers (each artifact has two, sometimes three):
//   breath   noise through two narrow resonances that drift, like wind through a shape
//   glass    two sines a breath apart, beating slowly against each other
//   fm       a low tone bent by an inharmonic partner, its depth wandering
//   whale    one voice that glides between notes of the palette and rests
//   grains   soft pitched ticks on the artifact's own rhythm, in time with its light
//   choir    (witnessed artifacts) a slow chord under everything
// Everything sits in the palette on 42 Hz and below about 1.5 kHz. Where it is: louder
// and brighter as the ship comes near, darker and wetter far off or behind, panned by its
// bearing from the nose; never above CAP. Voices begin when an artifact is within reach
// and fade away when it is gone.

const REACH = 820;            // meters: beyond this, silence
const CAP = 0.2;             // the loudest any artifact's voice gets (witnessed: CAP_W)
const CAP_W = 0.24;

const FAMILY = {
  ring: ['breath', 'glass'], obelisk: ['fm', 'breath'], orb: ['glass', 'whale'], lattice: ['grains', 'breath'],
  shell: ['whale', 'breath'], crystal: ['glass', 'grains'], tether: ['fm', 'grains'], fungi: ['breath', 'whale'],
  gate: ['glass', 'fm'], solids: ['fm', 'glass'], glyph: ['grains', 'fm'], chimes: ['glass', 'grains'], echo: ['whale', 'fm'],
  beacon: ['fm', 'glass'], orrery: ['glass', 'grains'], helix: ['grains', 'whale'], tesseract: ['fm', 'glass'], wreck: ['breath', 'fm'],
  stair: ['whale', 'glass'], arbor: ['breath', 'whale'], pool: ['glass', 'breath'], sentinel: ['fm', 'breath'], swarm: ['grains', 'glass'],
  cradle: ['whale', 'breath'], lanterns: ['glass', 'grains'], dish: ['grains', 'fm'],
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
      const level = (x.d.special ? CAP_W : CAP) * Math.pow(f, 1.6) * (behind ? 0.6 : 1) * (0.35 + 0.65 * (x.reveal ?? 1));
      v.level.gain.setTargetAtTime(level, t, 0.35);
      v.send.gain.setTargetAtTime(level * (0.5 + 1.6 * (1 - f)), t, 0.35);
      v.tone.frequency.setTargetAtTime((320 + 2400 * Math.pow(f, 1.5)) * (behind ? 0.5 : 1), t, 0.35);
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
    v.bus.connect(v.tone); v.tone.connect(v.level); v.level.connect(v.pan); v.pan.connect(a.amb);
    v.tone.connect(v.send); v.send.connect(a.verbIn);
    const layers = (FAMILY[d.family] || ['breath', 'glass']).slice();
    if (R() < 0.45) layers.pop();                      // one layer, sometimes
    if (R() < 0.3) layers.push(R.pick(['breath', 'glass', 'fm', 'whale', 'grains'].filter((l) => !layers.includes(l))));
    if (d.special) layers.push('choir');
    v.layers = layers;
    for (const l of layers) this['_' + l](v);
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
    const oct = R.pick([2, 3]);
    const out = ctx.createGain(); out.gain.value = 0;
    v.degs.slice(0, 2).forEach((dg, i) => {
      const f = Math.min(1400, pitch(dg, oct));
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
    const oct = R.pick([1, 2, 2]);
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
    const f = pitch(v.degs[0], R.pick([0, 1, 1]));
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * R.pick([1.414, 2.76, 3.53, 0.707, 1.618]);
    const idx = ctx.createGain(); idx.gain.value = 0;
    mod.connect(idx); idx.connect(car.frequency);
    // how far it bends wanders slowly: from nearly pure to strange
    this._lfo(v, 0.04 + R() * 0.06, f * 0.55, idx.gain, f * 0.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
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
    v.whaleOct = R.pick([1, 2]);
    o.frequency.value = pitch(v.degs[0], v.whaleOct);
    const vib = ctx.createOscillator(); vib.frequency.value = 3.2 + R() * 1.5;
    const vg = ctx.createGain(); vg.gain.value = o.frequency.value * 0.004;
    vib.connect(vg); vg.connect(o.frequency);
    const env = ctx.createGain(); env.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    o.connect(lp); lp.connect(env); env.connect(v.bus);
    o.start(); vib.start();
    v.sources.push(o, vib);
    v.whale = { o, env, next: ctx.currentTime + 1 + R() * 3 };
  }

  _grains(v) {
    v.grains = { oct: v.R.pick([2, 3]), next: -1 };
  }

  _choir(v) {
    const a = this.a, ctx = a.ctx, R = v.R;
    const out = ctx.createGain(); out.gain.value = 0;
    [0, 2, 4].map((i) => v.degs[i % v.degs.length] + (i > 2 ? 5 : 0)).forEach((dg, i) => {
      const o = ctx.createOscillator();
      o.setPeriodicWave(a.waves.choir);
      o.frequency.value = pitch(dg, 1 + (i === 2 ? 1 : 0)) * (1 + (R() - 0.5) * 0.002);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
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
    const gr = v.grains;
    if (gr && beatNow !== null) {
      // the steps of its rhythm (the same clock its light pulses to), a little ahead
      const s = v.song, st = s.step || 0.5;
      const nowStep = Math.floor(beatNow / st);
      if (gr.next <= nowStep) gr.next = nowStep + 1;
      for (;;) {
        const when = t + (gr.next * st - beatNow) * BEAT;
        if (when > t + 0.3) break;
        if (s.pattern[((gr.next % s.n) + s.n) % s.n]) this._grain(v, when, gr);
        gr.next++;
      }
    }
  }

  _grain(v, when, gr) {
    const a = this.a, ctx = a.ctx, R = v.R;
    const src = ctx.createBufferSource();
    src.buffer = a.pink;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7;
    bp.frequency.value = Math.min(1400, pitch(R.pick(v.degs), gr.oct));
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.exponentialRampToValueAtTime(2.2, when + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.09 + R() * 0.08);
    src.connect(bp); bp.connect(env); env.connect(v.bus);
    src.start(when, R() * 5);
    src.stop(when + 0.25);
  }
}
