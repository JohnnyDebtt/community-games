// The master stage, as in SEEKER (the-seeker's music app): the whole mix always peaks
// at -0.3 dBFS. A leveler slowly brings the highest peaks of the last few seconds to
// that ceiling, and a little past it; a soft clipper rounds those peaks off and a
// look-ahead limiter catches what is left. Quiet stretches come up slowly, sudden loud
// ones are pulled down within about ten milliseconds, and silence holds the gain.
//
// Plain JavaScript with no Web Audio in it, so the worklet and the tests share it.

export const CEILING = 0.966;
// How far past the ceiling peaks are pushed at full loudness, in dB.
const MAX_DRIVE_DB = 3;
// The most the leveler will lift (18 dB): enough to bring a quiet hole up to the
// level of a walk across the ice, but a game has near-silent stretches (indoors, an
// empty sea at night) that should stay quiet rather than reach full scale, so it is
// capped lower than SEEKER's 24 dB, made for songs that are never that sparse.
const MAX_GAIN = 8;
// The mix's peak level is the highest peak of the last few seconds.
const PEAK_HOP = 4096;
const PEAK_HOPS = 48;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function softClip(x) {
  if (x > 3) return 1;
  if (x < -3) return -1;
  const x2 = x * x;
  return (x * (27 + x2)) / (27 + 9 * x2);
}

export class Leveler {
  constructor(sr) {
    this.sr = sr;
    this.gain = 0;
    this.heard = 0;
    this.hops = new Float32Array(PEAK_HOPS);
    this.hop = 0;
    this.hopPeak = 0;
    this.hopFill = 0;
    this.setLoudness(0.7);
  }

  // Loudness from 0 (peaks just reach the ceiling) to 1 (pushed MAX_DRIVE_DB past it).
  setLoudness(value) {
    this.drive = 10 ** ((clamp(value, 0, 1) * MAX_DRIVE_DB) / 20);
  }

  process(L, R, n) {
    let blockPeak = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(L[i] < 0 ? -L[i] : L[i], R[i] < 0 ? -R[i] : R[i]);
      if (a > blockPeak) blockPeak = a;
    }
    const start = this.gain;
    let end = start;
    // Silence holds everything, so a pause does not wind the gain up.
    if (blockPeak > 1e-4) {
      if (blockPeak > this.hopPeak) this.hopPeak = blockPeak;
      this.hopFill += n;
      if (this.hopFill >= PEAK_HOP) {
        this.hops[this.hop] = this.hopPeak;
        this.hop = (this.hop + 1) % PEAK_HOPS;
        this.hopPeak = 0;
        this.hopFill = 0;
      }
      let peak = this.hopPeak;
      for (let k = 0; k < PEAK_HOPS; k++) if (this.hops[k] > peak) peak = this.hops[k];
      const desired = Math.min(MAX_GAIN, (CEILING * this.drive) / peak);
      // The first sound starts at no more than unity, and the gain settles quickly
      // for the first two seconds, then follows the mix slowly.
      const from = start === 0 ? Math.min(desired, 1) : start;
      const settling = this.heard < 2 * this.sr;
      this.heard += n;
      const time = desired < from ? 0.01 : settling ? 0.3 : 1.5;
      end = from + (desired - from) * (1 - Math.exp(-n / (time * this.sr)));
    }
    const step = (end - start) / n;
    let g = start;
    for (let i = 0; i < n; i++) {
      g += step;
      L[i] *= g;
      R[i] *= g;
    }
    this.gain = end;
  }
}

// Rounds off peaks above about -4.4 dBFS, smoothly reaching full scale at +5 dB, so the
// limiter after it has little left to do.
const CLIP_KNEE = 0.6;

export function masterClip(L, R, n) {
  const span = 1 - CLIP_KNEE;
  for (let i = 0; i < n; i++) {
    for (const buf of [L, R]) {
      const x = buf[i];
      const a = x < 0 ? -x : x;
      if (a > CLIP_KNEE) {
        const y = CLIP_KNEE + span * softClip((a - CLIP_KNEE) / span);
        buf[i] = x < 0 ? -y : y;
      }
    }
  }
}

// Look-ahead peak limiter: the gain is the sliding minimum of the required gain,
// smoothed by a moving average over the same window, applied to audio delayed by that
// window. The output never exceeds the ceiling.
export class Limiter {
  constructor(sr, ceiling = CEILING) {
    this.sr = sr;
    this.ceiling = ceiling;
    const look = Math.max(16, Math.round(sr * 0.003));
    this.look = look;
    this.delayL = new Float32Array(look);
    this.delayR = new Float32Array(look);
    this.pos = 0;
    // a monotonic deque for the sliding minimum over look + 1 samples, so every gain
    // averaged for a delayed sample has already seen that sample's peak
    this.qv = new Float32Array(look + 2);
    this.qt = new Float64Array(look + 2);
    this.head = 0;
    this.tail = 0;
    this.t = 0;
    this.release = 1 - Math.exp(-1 / (0.12 * sr));
    this.smooth = 1;
    this.avgBuf = new Float32Array(look).fill(1);
    this.avgSum = look;
    this.avgPos = 0;
    this.reduction = 1;
  }

  process(L, R, n) {
    const look = this.look;
    const size = look + 2;
    let minGain = 1;
    for (let i = 0; i < n; i++) {
      const l = L[i];
      const r = R[i];
      const peak = Math.max(l < 0 ? -l : l, r < 0 ? -r : r);
      const need = peak > this.ceiling ? this.ceiling / peak : 1;
      const t = this.t++;
      // push into the deque, dropping larger values from the back
      while (this.tail !== this.head) {
        const back = (this.tail - 1 + size) % size;
        if (this.qv[back] >= need) this.tail = back;
        else break;
      }
      this.qv[this.tail] = need;
      this.qt[this.tail] = t + look + 1;
      this.tail = (this.tail + 1) % size;
      while (this.qt[this.head] <= t) this.head = (this.head + 1) % size;
      const windowMin = this.qv[this.head];
      if (windowMin < this.smooth) this.smooth = windowMin;
      else this.smooth += (windowMin - this.smooth) * this.release;
      this.avgSum += this.smooth - this.avgBuf[this.avgPos];
      this.avgBuf[this.avgPos] = this.smooth;
      this.avgPos = (this.avgPos + 1) % look;
      const gain = Math.min(1, this.avgSum / look);
      const dl = this.delayL[this.pos];
      const dr = this.delayR[this.pos];
      this.delayL[this.pos] = l;
      this.delayR[this.pos] = r;
      this.pos = (this.pos + 1) % look;
      L[i] = clamp(dl * gain, -this.ceiling, this.ceiling);
      R[i] = clamp(dr * gain, -this.ceiling, this.ceiling);
      if (gain < minGain) minGain = gain;
    }
    this.reduction = minGain;
  }
}
