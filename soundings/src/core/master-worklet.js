// The master stage on the audio thread: leveler, soft clipper, look-ahead limiter
// (src/core/master.js), and a small meter for the game to read.

import { Leveler, Limiter, masterClip } from './master.js';

const POST_INTERVAL = 1 / 10;

class MasterProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.leveler = new Leveler(sampleRate);
    this.limiter = new Limiter(sampleRate);
    this.peak = 0;
    this.inPeak = 0;
    this.lastPost = 0;
    this.port.onmessage = (event) => {
      if (event.data.type === 'loudness') this.leveler.setLoudness(event.data.value);
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const outL = out[0];
    const outR = out[1] || out[0];
    const n = outL.length;
    const input = inputs[0];
    if (input && input[0]) {
      outL.set(input[0]);
      outR.set(input[1] || input[0]);
      // invalid input never reaches the leveler or the limiter
      for (let i = 0; i < n; i++) {
        if (!(Math.abs(outL[i]) < 64)) outL[i] = 0;
        if (!(Math.abs(outR[i]) < 64)) outR[i] = 0;
      }
    } else {
      outL.fill(0);
      outR.fill(0);
    }
    for (let i = 0; i < n; i++) {
      const a = Math.max(Math.abs(outL[i]), Math.abs(outR[i]));
      if (a > this.inPeak) this.inPeak = a;
    }
    this.leveler.process(outL, outR, n);
    masterClip(outL, outR, n);
    this.limiter.process(outL, outR, n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(Math.abs(outL[i]), Math.abs(outR[i]));
      if (a > this.peak) this.peak = a;
    }
    if (currentTime - this.lastPost >= POST_INTERVAL) {
      this.lastPost = currentTime;
      this.port.postMessage({ in: this.inPeak, peak: this.peak, gain: this.leveler.gain, reduction: this.limiter.reduction });
      this.peak = 0;
      this.inPeak = 0;
    }
    return true;
  }
}

registerProcessor('soundings-master', MasterProcessor);
