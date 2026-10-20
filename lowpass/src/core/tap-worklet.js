// Keeps the last minute of the game's sound in a ring of 16-bit samples, and hands it
// over when asked, oldest first. Runs on the audio thread.
class Tap extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const secs = (o.processorOptions && o.processorOptions.seconds) || 60;
    this.size = Math.floor(sampleRate * secs);
    this.l = new Int16Array(this.size);
    this.r = new Int16Array(this.size);
    this.w = 0;
    this.filled = 0;
    this.port.onmessage = () => {
      const n = this.filled, start = (this.w - n + this.size) % this.size;
      const left = new Int16Array(n), right = new Int16Array(n);
      for (let i = 0; i < n; i++) { const k = (start + i) % this.size; left[i] = this.l[k]; right[i] = this.r[k]; }
      this.port.postMessage({ left, right, rate: sampleRate }, [left.buffer, right.buffer]);
    };
  }
  process(inputs) {
    const inp = inputs[0];
    if (!inp || !inp.length) return true;
    const a = inp[0], b = inp[1] || inp[0];
    for (let i = 0; i < a.length; i++) {
      this.l[this.w] = Math.max(-32768, Math.min(32767, a[i] * 32767));
      this.r[this.w] = Math.max(-32768, Math.min(32767, b[i] * 32767));
      this.w = (this.w + 1) % this.size;
    }
    this.filled = Math.min(this.size, this.filled + a.length);
    return true;
  }
}
registerProcessor('lowpass-tap', Tap);
