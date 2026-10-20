// The tuning, from one root. The Seeker's rule is kept: every pitch is a fundamental
// times X / 2^N, so every note is a harmonic of the fundamental or of one of its lower
// octaves. Low Pass takes 42 Hz as its fundamental (the codex allows another root when a
// work has reason to): its music lives on 21/16 of it, 55.125 Hz, an A, in the palette
// 1, 9/8, 19/16, 3/2, 7/4 (a minor ninth chord in just intonation, with the low harmonic
// seventh). Time follows the same root: 42 x 60 / 32 = 78.75 beats a minute.

export const F0 = 42;
export const ROOT = 21 / 16;
export const R = F0 * ROOT;                        // 55.125 Hz
export const PALETTE = [1, 9 / 8, 19 / 16, 3 / 2, 7 / 4];
export const N = PALETTE.length;
export const BPM = (F0 * 60) / 32;                 // 78.75
export const BEAT = 60 / BPM;

// degree d of the palette (any integer: steps past the palette climb octaves), octave o
// above the root
export function pitch(d, o = 0) {
  const oct = o + Math.floor(d / N);
  return R * PALETTE[((d % N) + N) % N] * Math.pow(2, oct);
}

// harmonic h of the root, folded into octave o (for things that sing in harmonics)
export function harmonic(h, o = 0) {
  let x = h;
  while (x >= 2) x /= 2;
  return R * x * Math.pow(2, o);
}
