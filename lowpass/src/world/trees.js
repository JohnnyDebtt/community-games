import * as THREE from 'three';
import { mixHex } from '../core/palette.js';

// The forest's trees, each in three levels of detail, one unit tall (the instance scales
// them). Spruces are tiers of star-shaped cones, their tips drooping under the rime;
// firs are broader, darker and rounder; dead snags stand pale and bare. Colors from the
// codex's tundra stone and moss ramps; the shader adds the rime and the shade at the foot.

const TRUNK = 0x2d2e33;
const BARK = 0x353b44;

class Geo {
  constructor() { this.pos = []; this.col = []; }
  tri(a, b, c, ca, cb = ca, cc = ca) {
    this.pos.push(...a, ...b, ...c);
    for (const h of [ca, cb, cc]) this.col.push(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

function trunk(G, r0, r1, y0, y1, seg, color) {
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const p = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
    G.tri(p(r0, a0, y0), p(r1, a0, y1), p(r1, a1, y1), color);
    G.tri(p(r0, a0, y0), p(r1, a1, y1), p(r0, a1, y0), color);
  }
}

// One tier: an apex, a ring alternating branch tips (low, out) and notches (high, in),
// and an underside to a center.
function tier(G, yb, yt, r, spokes, droop, top, tip, under, phase) {
  const ring = [];
  for (let i = 0; i < spokes * 2; i++) {
    const a = phase + (i / (spokes * 2)) * Math.PI * 2;
    const isTip = i % 2 === 0;
    const rr = isTip ? r : r * 0.52;
    const y = isTip ? yb - droop : yb + (yt - yb) * 0.22;
    ring.push([Math.cos(a) * rr, y, Math.sin(a) * rr, isTip]);
  }
  const apex = [0, yt, 0];
  const center = [0, yb + (yt - yb) * 0.18, 0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    G.tri(apex, [b[0], b[1], b[2]], [a[0], a[1], a[2]], top, b[3] ? tip : top, a[3] ? tip : top);
    if (under) G.tri(center, [a[0], a[1], a[2]], [b[0], b[1], b[2]], under);
  }
}

function spruce(lod) {
  const G = new Geo();
  if (lod === 2) {
    // far: a five-sided spire
    const s = 5;
    for (let i = 0; i < s; i++) {
      const a0 = (i / s) * Math.PI * 2, a1 = ((i + 1) / s) * Math.PI * 2;
      G.tri([0, 1, 0], [Math.cos(a1) * 0.2, 0.08, Math.sin(a1) * 0.2], [Math.cos(a0) * 0.2, 0.08, Math.sin(a0) * 0.2], 0x3e545b, 0x2a2f32, 0x2a2f32);
    }
    return G.build();
  }
  const tiers = lod === 0 ? 6 : 3;
  const spokes = lod === 0 ? 5 : 4;
  trunk(G, 0.03, 0.016, 0, 0.32, lod === 0 ? 5 : 4, TRUNK);
  const y0 = 0.1, y1 = 1.0;
  const step = (y1 - y0 - 0.1) / tiers;
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1 || 1);
    const yb = y0 + i * step;
    const yt = yb + step * (lod === 0 ? 2.1 : 1.9);
    const r = 0.25 * (1 - k * 0.82) + 0.02;
    const top = mixHex(0x21252c, 0x3e545b, 0.25 + k * 0.6);
    const tip = mixHex(0x3e545b, 0x4f7368, k * 0.8);
    tier(G, yb, Math.min(yt, 1.0), r, spokes, 0.035 + 0.02 * (1 - k), top, tip, lod === 0 && i < 2 ? 0x1c1d22 : 0, i * 0.7);
  }
  return G.build();
}

function fir(lod) {
  const G = new Geo();
  if (lod === 2) {
    const s = 6;
    for (let i = 0; i < s; i++) {
      const a0 = (i / s) * Math.PI * 2, a1 = ((i + 1) / s) * Math.PI * 2;
      const p = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      G.tri([0, 1, 0], p(a1, 0.22, 0.62), p(a0, 0.22, 0.62), 0x2a2f32, 0x21252c, 0x21252c);
      G.tri(p(a0, 0.22, 0.62), p(a1, 0.22, 0.62), p(a1, 0.3, 0.2), 0x21252c);
      G.tri(p(a0, 0.22, 0.62), p(a1, 0.3, 0.2), p(a0, 0.3, 0.2), 0x21252c);
    }
    return G.build();
  }
  const tiers = lod === 0 ? 5 : 3;
  const spokes = lod === 0 ? 6 : 4;
  trunk(G, 0.04, 0.02, 0, 0.4, lod === 0 ? 5 : 4, BARK);
  for (let i = 0; i < tiers; i++) {
    const k = i / (tiers - 1 || 1);
    const yb = 0.16 + i * 0.16;
    const yt = Math.min(1, yb + 0.34);
    const r = 0.34 * Math.sin((1 - k * 0.85) * 1.45) + 0.03;
    const top = mixHex(0x1c1d22, 0x353e50, 0.3 + k * 0.5);
    const tip = mixHex(0x2a2f32, 0x49573d, 0.4 + k * 0.5);
    tier(G, yb, yt, r, spokes, 0.02, top, tip, lod === 0 && i < 2 ? 0x181c20 : 0, i * 1.3);
  }
  return G.build();
}

function snag(lod) {
  const G = new Geo();
  const pale = 0x6c7983, mid = 0x5d666d;
  trunk(G, 0.032, 0.008, 0, 1.0, lod === 0 ? 5 : 4, pale);
  if (lod === 0) {
    // broken limbs
    const limbs = [[0.42, 0.4, 0.13, -0.3], [0.58, 2.2, 0.1, 0.35], [0.7, 4.1, 0.08, -0.2], [0.33, 5.3, 0.09, 0.5]];
    for (const [y, a, len, tilt] of limbs) {
      const dx = Math.cos(a), dz = Math.sin(a);
      const p0 = [dx * 0.01, y, dz * 0.01], p1 = [dx * len, y + tilt * len, dz * len];
      const w = 0.008;
      G.tri(p0, p1, [p0[0], p0[1] + w * 2, p0[2]], mid);
      G.tri([p0[0] + dz * w, p0[1], p0[2] - dx * w], p1, p0, mid);
    }
  }
  return G.build();
}

let _geos = null;
// [kind][lod] -> geometry (kinds: spruce, fir, snag, giant spruce, giant fir)
export function treeGeometries() {
  if (!_geos) {
    const s = [spruce(0), spruce(1), spruce(2)], f = [fir(0), fir(1), fir(2)];
    // the giants stand over everything and are seen from far: always in full
    _geos = [s, f, [snag(0), snag(1), snag(1)], [s[0], s[0], s[0]], [f[0], f[0], f[0]]];
  }
  return _geos;
}
