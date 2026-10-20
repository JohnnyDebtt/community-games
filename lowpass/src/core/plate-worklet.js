// A moving hall: the plate reverb of Jon Dattorro ("Effect Design, Part 1", JAES 1997),
// the design many studio reverbs grow from, with its two tank allpasses swept by slow
// oscillators so the tail shimmers like a chorus instead of standing still, and a
// spinning set of early reflections in front of it (the way Ableton's Reverb has Chorus
// in its diffusion network and Spin on its reflections). Runs on the audio thread.

class Line {
  constructor(n) { this.b = new Float32Array(n + 4); this.n = this.b.length; this.w = 0; }
  write(x) { this.b[this.w] = x; this.w = this.w + 1 === this.n ? 0 : this.w + 1; }
  // the sample written d samples ago (fractional: linear between neighbors)
  read(d) {
    const i0 = Math.floor(d), f = d - i0;
    let a = this.w - 1 - i0; if (a < 0) a += this.n;
    let b = a - 1; if (b < 0) b += this.n;
    return this.b[a] * (1 - f) + this.b[b] * f;
  }
}

class Allpass {
  constructor(len, g) { this.len = len; this.g = g; this.line = new Line(Math.ceil(len) + 64); }
  step(x, len = this.len) {
    const d = this.line.read(len - 1);
    const w = x - this.g * d;
    this.line.write(w);
    return d + this.g * w;
  }
  tap(n) { return this.line.read(n); }
}

const BASE = 29761;   // the sample rate the design's lengths were written for

class Plate extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = (o && o.processorOptions) || {};
    this.set(p);
    const s = (sampleRate / BASE) * (p.size || 1.5);
    this.s = s;
    const L = (n) => Math.round(n * s);
    this.pre = new Line(Math.ceil(sampleRate * 0.25));
    this.bw = 0;
    this.in1 = new Allpass(L(142), 0.75); this.in2 = new Allpass(L(107), 0.75);
    this.in3 = new Allpass(L(379), 0.625); this.in4 = new Allpass(L(277), 0.625);
    this.apL = new Allpass(L(672), -0.7); this.dL1 = new Line(L(4453)); this.apL2 = new Allpass(L(1800), 0.5); this.dL2 = new Line(L(3720));
    this.apR = new Allpass(L(908), -0.7); this.dR1 = new Line(L(4217)); this.apR2 = new Allpass(L(2656), 0.5); this.dR2 = new Line(L(3163));
    this.len = { dL1: L(4453), dL2: L(3720), dR1: L(4217), dR2: L(3163) };
    this.taps = {
      l: [L(266), L(2974), L(1913), L(1996), L(1990), L(187), L(1066)],
      r: [L(353), L(3627), L(1228), L(2673), L(2111), L(335), L(121)],
    };
    this.lpL = 0; this.lpR = 0;
    this.outL = 0; this.outR = 0;
    this.ph = 0;
    // early reflections: six taps that slowly circle (spin) between the ears
    this.er = new Line(Math.ceil(sampleRate * 0.12));
    this.erTaps = [0.013, 0.021, 0.029, 0.037, 0.047, 0.061].map((t, i) => ({ t: t * sampleRate * (p.size || 1.5) / 1.5, g: 0.55 - i * 0.06, a: i * 1.047 }));
    this.port.onmessage = (e) => this.set(e.data);
  }

  set(p) {
    this.decay = p.decay ?? this.decay ?? 0.86;
    this.damping = p.damping ?? this.damping ?? 0.4;
    this.bandwidth = p.bandwidth ?? this.bandwidth ?? 0.62;
    this.depth = p.depth ?? this.depth ?? 2.6;             // chorus in the tail, in design samples
    this.rate = p.rate ?? this.rate ?? 0.55;               // its speed, Hz
    this.spin = p.spin ?? this.spin ?? 0.23;               // the reflections' turning, Hz
    this.predelay = p.predelay ?? this.predelay ?? 0.03;   // seconds
    this.early = p.early ?? this.early ?? 0.22;
    this.wet = p.wet ?? this.wet ?? 1;
  }

  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0];
    const oL = out[0], oR = out[1] || out[0];
    const a = inp && inp[0], b = inp && (inp[1] || inp[0]);
    const s = this.s, n = oL.length;
    const exc = 16 * s * this.depth / 2.6;
    const dph = (2 * Math.PI * this.rate) / sampleRate;
    const pre = Math.max(1, this.predelay * sampleRate);
    const T = this.taps, Ln = this.len;
    const decay = this.decay, damp = this.damping, bw = this.bandwidth;
    for (let i = 0; i < n; i++) {
      const x = a ? (a[i] + b[i]) * 0.5 : 0;
      this.er.write(x);
      this.pre.write(x);
      let v = this.pre.read(pre);
      this.bw += bw * (v - this.bw);
      v = this.in4.step(this.in3.step(this.in2.step(this.in1.step(this.bw))));
      this.ph += dph;
      if (this.ph > 6.283185307) this.ph -= 6.283185307;
      const m1 = Math.sin(this.ph), m2 = Math.sin(this.ph * 1.37 + 1.7);
      // left half of the tank
      let l = v + decay * this.outR;
      l = this.apL.step(l, this.apL.len + exc * m1);
      this.dL1.write(l);
      l = this.dL1.read(Ln.dL1 - 1);
      this.lpL += (1 - damp) * (l - this.lpL);
      l = this.apL2.step(this.lpL * decay);
      this.dL2.write(l);
      const tL = this.dL2.read(Ln.dL2 - 1);
      // right half
      let r = v + decay * this.outL;
      r = this.apR.step(r, this.apR.len + exc * m2);
      this.dR1.write(r);
      r = this.dR1.read(Ln.dR1 - 1);
      this.lpR += (1 - damp) * (r - this.lpR);
      r = this.apR2.step(this.lpR * decay);
      this.dR2.write(r);
      const tR = this.dR2.read(Ln.dR2 - 1);
      this.outL = tL; this.outR = tR;
      // the outputs: taps across both halves (the design's own)
      let yl = this.dR1.read(T.l[0]) + this.dR1.read(T.l[1]) - this.apR2.tap(T.l[2]) + this.dR2.read(T.l[3]) - this.dL1.read(T.l[4]) - this.apL2.tap(T.l[5]) - this.dL2.read(T.l[6]);
      let yr = this.dL1.read(T.r[0]) + this.dL1.read(T.r[1]) - this.apL2.tap(T.r[2]) + this.dL2.read(T.r[3]) - this.dR1.read(T.r[4]) - this.apR2.tap(T.r[5]) - this.dR2.read(T.r[6]);
      // early reflections, spinning
      let el = 0, erR = 0;
      const sp = (currentTime + i / sampleRate) * this.spin * 6.283185307;
      for (const t of this.erTaps) {
        const e = this.er.read(t.t + Math.sin(sp + t.a) * 0.0015 * sampleRate) * t.g;
        const pan = Math.sin(sp * 0.7 + t.a);
        el += e * (0.5 - pan * 0.5); erR += e * (0.5 + pan * 0.5);
      }
      oL[i] = (yl * 0.6 + el * this.early) * this.wet;
      oR[i] = (yr * 0.6 + erR * this.early) * this.wet;
    }
    return true;
  }
}

registerProcessor('lowpass-plate', Plate);
