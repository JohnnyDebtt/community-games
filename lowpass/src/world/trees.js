import * as THREE from 'three';
import { mixHex } from '../core/palette.js';

// The forest's trees, each in three levels of detail, one unit tall (the instance scales
// them). Spruces are tiers of star-shaped cones, their tips drooping under the rime;
// firs are broader, darker and rounder; dead snags stand pale and bare; in the rare
// turned stands, birches: pale trunks under round crowns of gold. Colors from the codex's
// tundra stone and moss ramps; the shader adds the rime and the shade at the foot.

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

// A small seeded random, so each birch shape is the same for everyone and every session
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The birch's bark is a true grey: the shader gives it the tint's brightness and not its
// hue, so whatever color the leaves have turned, the trunks stay pale (with dark marks).
const BIRCH_BARK = 0x989898, BIRCH_MARK = 0x3a3a3a;
// its leaves from the top down: lit gold, gold, the shaded side, the underside
const BIRCH_LEAF = [0xdcb44c, 0xc89a34, 0xa06e28, 0x5e3e18];
const DEEP = 0xb8642a;     // patches gone deeper, toward amber
const GREEN = 0x8a9a3c;    // a patch still green

// A birch's crown: one rounded volume, broadest a little below its middle and narrowing
// to the top, its outline pushed out and in by a few slow lobes (seeded, so each shape is
// the same for everyone). Shaded light above and dark below, with a slow patch or two of
// deeper color. spread: how broad; lean: which way the crown leans.
function crown(G, seed, lod, spread, lean) {
  const rand = seeded(seed);
  const seg = lod === 0 ? 9 : lod === 1 ? 6 : 5;
  const rings = lod === 0 ? 5 : lod === 1 ? 3 : 1;
  const p1 = rand() * 6.28, p2 = rand() * 6.28, p3 = rand() * 6.28, lobes = 2 + Math.floor(rand() * 2);
  const green = rand() < 0.4 ? rand() * 6.28 : null;
  const y0 = 0.3, y1 = 1.0;
  const pt = (t, i) => {
    const a = (i / seg) * Math.PI * 2 + t * 0.6;
    const prof = Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.75);
    const bump = 1 + 0.16 * Math.sin(lobes * a + p1 + t * 3) + 0.1 * Math.sin((lobes + 1) * a + p2 - t * 2);
    const r = 0.22 * spread * prof * bump;
    return [Math.cos(a) * r + lean * t, y0 + (y1 - y0) * t + 0.02 * Math.sin(a * 2 + p2), Math.sin(a) * r];
  };
  const shade = (t, a) => {
    const k = t * 3;
    let c = mixHex(BIRCH_LEAF[3 - Math.min(2, Math.floor(k))], BIRCH_LEAF[2 - Math.min(2, Math.floor(k))], k % 1);
    if (t > 0.99) c = BIRCH_LEAF[0];
    c = mixHex(c, DEEP, 0.3 * Math.max(0, Math.sin(a + p3)));
    if (green !== null) c = mixHex(c, GREEN, 0.4 * Math.max(0, Math.cos(a - green) * 2 - 1));
    return c;
  };
  const ts = rings === 1 ? [0.45] : Array.from({ length: rings }, (_, k) => 0.12 + (k / (rings - 1)) * 0.74);
  const ring = (t) => Array.from({ length: seg }, (_, i) => pt(t, i));
  const R = ts.map(ring);
  const top = [lean, y1 + 0.02, 0], foot = [lean * 0.05, y0 + 0.02, 0];
  const mid = (i) => ((i + 0.5) / seg) * Math.PI * 2;
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg, a = mid(i);
    G.tri(foot, R[0][i], R[0][j], shade(0, a));
    for (let k = 0; k + 1 < R.length; k++) {
      const c = shade((ts[k] + ts[k + 1]) / 2, a);
      G.tri(R[k][i], R[k + 1][j], R[k][j], c);
      G.tri(R[k][i], R[k + 1][i], R[k + 1][j], c);
    }
    G.tri(top, R[R.length - 1][j], R[R.length - 1][i], shade(1, a));
  }
}

// Three birch shapes: a full oval, a tall narrow one, a broad one leaning
const BIRCHES = [[11, 1.0, 0], [23, 0.8, 0.04], [37, 1.15, 0.1]];

function birch(lod, shape) {
  const G = new Geo();
  const [seed, spread, lean] = BIRCHES[shape];
  if (lod < 2) trunk(G, 0.022, 0.011, 0, 0.82, lod === 0 ? 5 : 4, BIRCH_BARK);
  if (lod === 0) for (const y of [0.13, 0.27]) trunk(G, 0.023, 0.022, y, y + 0.025, 5, BIRCH_MARK);
  crown(G, seed, lod, spread, lean);
  return G.build();
}

// A spruce or fir for walking among (where the ship has landed): the same tree, its crown
// lifted up its trunk, so its lowest boughs hang high overhead and the trunks stand clear
// (crownBase: where the crown now begins, of the tree's height; the trunk lengthened to
// meet it). The trunk is told from the crown by its radius.
function walkify(geo, crownBase, trunkMax) {
  const g = geo.clone(), p = g.attributes.position;
  const stretch = (crownBase + 0.2) / trunkMax;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getZ(i)), y = p.getY(i);
    p.setY(i, r > 0.001 && r <= 0.045 ? y * stretch : crownBase + y * (1 - crownBase));
  }
  g.computeBoundingSphere();
  return g;
}

let _geos = null;
// [kind][lod] -> geometry (kinds: spruce, fir, snag, giant spruce, giant fir, from BIRCH
// on the birches' shapes, and from WALK the spruce and fir to walk among)
export const BIRCH = 5;
export const BIRCH_SHAPES = BIRCHES.length;
export const WALK = BIRCH + BIRCH_SHAPES;
export function treeGeometries() {
  if (!_geos) {
    const s = [spruce(0), spruce(1), spruce(2)], f = [fir(0), fir(1), fir(2)];
    // the giants stand over everything and are seen from far: always in full
    _geos = [s, f, [snag(0), snag(1), snag(1)], [s[0], s[0], s[0]], [f[0], f[0], f[0]]];
    for (let i = 0; i < BIRCHES.length; i++) _geos.push([birch(0, i), birch(1, i), birch(2, i)]);
    _geos.push(s.map((g) => walkify(g, 0.32, 0.32)), f.map((g) => walkify(g, 0.3, 0.4)));
  }
  return _geos;
}
