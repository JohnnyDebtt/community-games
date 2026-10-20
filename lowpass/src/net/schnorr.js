// BIP-340 Schnorr signatures over secp256k1, the signatures Nostr uses, written on the
// curve arithmetic of the vendored noble-secp256k1 (MIT). SHA-256 comes from the
// browser's Web Crypto.

import { ProjectivePoint as Point, CURVE } from '../../vendor/noble-secp256k1.js';

const N = CURVE.n;
const G = Point.BASE;
const enc = new TextEncoder();

export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export const unhex = (h) => Uint8Array.from((h.match(/../g) || []).map((x) => parseInt(x, 16)));
const big = (u8) => BigInt('0x' + (hex(u8) || '0'));
const b32 = (n) => unhex(n.toString(16).padStart(64, '0'));
const concat = (...a) => {
  const out = new Uint8Array(a.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};

export async function sha256(data) {
  const u8 = typeof data === 'string' ? enc.encode(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', u8));
}

const tagCache = new Map();
async function tagged(tag, ...msgs) {
  let t = tagCache.get(tag);
  if (!t) { t = await sha256(tag); tagCache.set(tag, t); }
  return sha256(concat(t, t, ...msgs));
}

export function publicKey(sk) {
  const d = big(sk);
  if (d <= 0n || d >= N) throw new Error('bad secret key');
  return b32(G.mul(d).x);
}

export async function sign(msg, sk, aux = crypto.getRandomValues(new Uint8Array(32))) {
  let d = big(sk);
  if (d <= 0n || d >= N) throw new Error('bad secret key');
  const P = G.mul(d);
  if (P.y & 1n) d = N - d;
  const px = b32(P.x);
  const ah = await tagged('BIP0340/aux', aux);
  const t = b32(d).map((v, i) => v ^ ah[i]);
  const k0 = big(await tagged('BIP0340/nonce', t, px, msg)) % N;
  if (k0 === 0n) throw new Error('bad nonce');
  const R = G.mul(k0);
  const k = R.y & 1n ? N - k0 : k0;
  const rx = b32(R.x);
  const e = big(await tagged('BIP0340/challenge', rx, px, msg)) % N;
  return concat(rx, b32((k + e * d) % N));
}

export async function verify(sig, msg, pub) {
  try {
    if (sig.length !== 64 || pub.length !== 32) return false;
    const P = Point.fromHex('02' + hex(pub));        // lift_x: the point with even y
    const r = big(sig.subarray(0, 32)), s = big(sig.subarray(32, 64));
    if (r >= CURVE.p || s >= N) return false;
    const e = big(await tagged('BIP0340/challenge', sig.subarray(0, 32), pub, msg)) % N;
    let R = s === 0n ? Point.ZERO : G.mul(s, false);
    if (e !== 0n) R = R.add(P.mul(N - e, false));
    if (R.equals(Point.ZERO)) return false;
    const a = R.toAffine();
    return (a.y & 1n) === 0n && a.x === r;
  } catch { return false; }
}
