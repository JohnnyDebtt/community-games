// The master stage on its own: whatever goes in, the mix comes out peaking at -0.3
// dBFS and never past it; quiet mixes come up (within the lift's cap), sudden loud
// sounds are caught within milliseconds, and silence holds the gain.
//   node tools/test_master.mjs

import { Leveler, Limiter, masterClip, CEILING } from '../src/core/master.js';

const SR = 48000;
const BLOCK = 128;
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed++;
};
const db = (a) => (20 * Math.log10(a + 1e-12)).toFixed(1);

// Runs a signal fn(t) -> [l, r] through the stage; returns per-second output peaks.
function run(seconds, fn) {
  const lev = new Leveler(SR), lim = new Limiter(SR);
  const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
  const peaks = [];
  let peak = 0, over = 0;
  for (let pos = 0; pos < seconds * SR; pos += BLOCK) {
    for (let i = 0; i < BLOCK; i++) {
      const [l, r] = fn((pos + i) / SR);
      L[i] = l; R[i] = r;
    }
    lev.process(L, R, BLOCK);
    masterClip(L, R, BLOCK);
    lim.process(L, R, BLOCK);
    for (let i = 0; i < BLOCK; i++) {
      const a = Math.max(Math.abs(L[i]), Math.abs(R[i]));
      if (a > CEILING + 1e-6) over++;
      if (a > peak) peak = a;
    }
    if ((pos + BLOCK) % SR < BLOCK) { peaks.push(peak); peak = 0; }
  }
  return { peaks, over, gain: lev.gain };
}

// a mix-like signal: a tone with a slow swell and a little noise
const mix = (amp) => (t) => {
  const v = amp * (0.7 * Math.sin(2 * Math.PI * 192 * t) * (0.6 + 0.4 * Math.sin(t * 1.3)) + 0.3 * (Math.random() * 2 - 1));
  return [v, v * 0.9];
};

{
  const r = run(12, mix(3.0));
  const last = r.peaks.at(-1);
  check(r.over === 0, `far too hot (+9.5 dBFS): never past the ceiling`);
  check(last > 0.85 && last <= CEILING, `far too hot: settles at ${db(last)} dBFS`);
}
{
  const r = run(12, mix(0.35));
  const last = r.peaks.at(-1);
  check(r.over === 0, 'a typical mix (-9 dBFS): never past the ceiling');
  check(last > 0.85, `a typical mix: brought up to ${db(last)} dBFS`);
}
{
  const r = run(12, mix(0.06));
  const last = r.peaks.at(-1);
  check(last > 0.4 && last < 0.5, `a quiet mix (-24 dBFS) comes up, by 18 dB at most: ${db(last)} dBFS`);
}
{
  const r = run(12, mix(0.01));
  const last = r.peaks.at(-1);
  check(last < 0.09, `a near-silent one (-40 dBFS) stays quiet: ${db(last)} dBFS`);
}
{
  // ambience, then a loud catch, then ambience again: the burst is caught at once, and
  // a few seconds on the mix is back within 1 dB of where it would have been
  const steady = (t) => [0.3 * Math.sin(2 * Math.PI * 192 * t), 0.27 * Math.sin(2 * Math.PI * 192 * t)];
  const plain = run(16, steady);
  const r = run(16, (t) => {
    const [a, b] = steady(t);
    const burst = t > 6 && t < 6.4 ? 1.8 * Math.sin(2 * Math.PI * 384 * t) : 0;
    return [a + burst, b + burst];
  });
  check(r.over === 0, 'a sudden loud sound over the mix: never past the ceiling');
  check(r.peaks[6] < 0.5 * plain.peaks[6] || r.peaks[7] < 0.5 * plain.peaks[7], `while it lasts, the mix makes way (${db(r.peaks[7])} dBFS)`);
  const back = r.peaks[15] / plain.peaks[15];
  check(back > 0.89, `after it, the mix comes back up: ${db(r.peaks[15])} dBFS (${db(back)} dB from steady)`);
}
{
  // sound, then silence: the gain holds instead of winding up
  const lev = new Leveler(SR);
  const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
  for (let pos = 0; pos < 4 * SR; pos += BLOCK) {
    for (let i = 0; i < BLOCK; i++) { const [l, r] = mix(0.3)((pos + i) / SR); L[i] = l; R[i] = r; }
    lev.process(L, R, BLOCK);
  }
  const before = lev.gain;
  for (let pos = 0; pos < 6 * SR; pos += BLOCK) { L.fill(0); R.fill(0); lev.process(L, R, BLOCK); }
  check(Math.abs(lev.gain - before) < 1e-6, `silence holds the gain (${before.toFixed(2)})`);
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('all passed');
