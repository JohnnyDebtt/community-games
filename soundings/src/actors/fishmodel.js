import * as THREE from 'three';
import { TAU, clamp, hash2 } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { Builder, mat } from '../render/build.js';

// The life under this ice is not Earth's. Each creature is built from a body (round,
// three-sided or six-sided, by its kind's profile) and the features of its species:
// eyes in rows, rings or on stalks, or a single eye, or none; feelers; crystal shards
// for fins; tails of three blades, veils, paddles or prongs; a glowing core showing
// through the flank; a ring fin; spines; plates that float around it, held by nothing.
// One unit long, head toward +z, flat-colored faces so patterns stay crisp like pixel
// art. A `sway` value (0 at the head, 1 at the tail) drives the swimming wave.

const cache = new Map();

function profileFor(kind, t) {
  // t: 0 tail .. 1 nose. Returns relative girth.
  switch (kind) {
    // body plans no fish of Earth has
    case 'bulb': return Math.pow(t, 1.05) * Math.pow(1 - t, 0.32) * 2.25;        // a full head, a tapering body
    case 'teardrop': return Math.pow(t, 0.72) * Math.pow(1 - t, 0.42) * 2.0;      // round and soft, like a drop of light
    case 'disc': return Math.pow(Math.sin(Math.PI * t), 0.35);                    // short and round, a saucer
    case 'kite': return Math.max(0.04, Math.min(t * 2.4, (1 - t) * 1.25));         // a long taper to a point
    case 'tadpole': return Math.pow(t, 1.3) * Math.pow(1 - t, 0.3) * 2.5;         // a round head, a slender tail
    case 'sail': return Math.pow(Math.sin(Math.PI * t), 0.8);
    case 'eel': return Math.pow(Math.sin(Math.PI * clamp(t * 0.96 + 0.02, 0, 1)), 0.35) * (0.75 + 0.25 * t);
    case 'pike': return Math.pow(Math.sin(Math.PI * t), 0.55) * (t > 0.82 ? 1 - (t - 0.82) * 2.2 : 1);
    case 'gar': return Math.pow(Math.sin(Math.PI * clamp(t * 1.25, 0, 1)), 0.5) * (t > 0.78 ? 0.3 : 1);
    case 'sturgeon': return Math.pow(Math.sin(Math.PI * t), 0.6) * (t > 0.85 ? 1 - (t - 0.85) * 2.5 : 1);
    case 'sculpin': return Math.pow(t, 0.9) * Math.pow(1 - t, 0.25) * 1.9;
    case 'angler': return Math.pow(t, 0.7) * Math.pow(1 - t, 0.3) * 2.0;
    case 'gulper': return Math.pow(t, 1.4) * Math.pow(1 - t, 0.18) * 2.4;
    case 'flat': return Math.pow(Math.sin(Math.PI * t), 0.6);
    default: return Math.pow(t, 0.55) * Math.pow(1 - t, 0.32) * 1.75;
  }
}

// The swimming wave: every vertex gets its distance from the head (0) to the tail (1).
class FishBuilder extends Builder {
  build() {
    const g = super.build();
    const p = g.attributes.position;
    const sw = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) sw[i] = clamp(0.5 - p.getZ(i), 0, 1.4);
    g.setAttribute('sway', new THREE.BufferAttribute(sw, 1));
    return g;
  }
}

function colorAt(m, i, j, t, a) {
  // a: angle from the top (0) to the belly (PI)
  let c = a < 0.9 ? m.top : a < 2.0 ? m.side : m.belly;
  if (a > 0.75 && a < 1.05) c = mixHex(m.top, m.side, 0.5);
  if (a > 1.9 && a < 2.2) c = mixHex(m.side, m.belly, 0.5);
  let e = m.glow || 0;
  const h = hash2(i * 13 + 7, j * 31 + 3);
  const pc = m.pc ?? m.top;
  const pe = m.pglow || 0;
  switch (m.pattern) {
    case 'line': if (Math.abs(a - 1.57) < 0.35) { c = pc; e = Math.max(e, pe); } break;
    case 'spots': if (a > 0.5 && a < 2.1 && h < 0.22 && t > 0.15 && t < 0.88) { c = pc; e = Math.max(e, pe); } break;
    case 'bars': {
      const n = m.count || 6;
      const f = ((t - 0.18) / 0.64) * n;
      if (t > 0.18 && t < 0.82 && a < 2.0 && (f - Math.floor(f)) < 0.42) c = pc;
      break;
    }
    case 'mottle': if (a < 2.0 && h < 0.4) c = mixHex(c, pc, 0.6); break;
    case 'spine': if (Math.abs(a - 1.57) < 0.4 || a < 0.3) { c = pc; e = Math.max(e, pe); } break;
    case 'rim': if (a < 0.4) c = pc; break;
    case 'script': if (a < 1.4 && h < 0.33 && t > 0.15 && t < 0.85) { c = pc; e = Math.max(e, pe); } break;
    case 'stripe': if (a > 1.15 && a < 1.6) { c = pc; e = Math.max(e, pe); } break;
    case 'plates': if (i % 2 === 0) c = mixHex(c, pc, 0.75); break;
    case 'chain': if (a > 0.5 && a < 2.0 && ((i + j) % 3 === 0)) { c = pc; e = Math.max(e, pe); } break;
    case 'scales': if (a < 2.0 && (i + j) % 2 === 0) c = mixHex(c, pc, 0.35); break;
    case 'gills': if (((t > 0.6 && t < 0.66) || (t > 0.7 && t < 0.76)) && a > 0.8 && a < 2.2) { c = pc; e = 0.9; } break;
    case 'lattice': {
      const odd = i === 2 && j === 3;
      if (!odd && (i % 2 === 0 || j % 3 === 0) && a < 2.4) { c = pc; e = Math.max(e, 0.4); }
      break;
    }
    case 'roots': if (a > 0.5 && a < 2.0 && h < 0.18) { c = pc; e = 0.25; } break;
    case 'filaments': if (h < 0.25 && a < 2.0) { c = mixHex(c, pc, 0.5); e = Math.max(e, 0.2); } break;
    default: break;
  }
  if (m.sheen && a > 0.9 && a < 1.9 && h < 0.35) e = Math.max(e, m.sheen);
  return [c, e];
}

function body(b, m, kind) {
  const S = m.segments ? Math.max(16, m.segments * 4) : kind === 'eel' ? 16 : 11;
  const R = m.sides || 10;
  const z0 = -0.5;
  const H = m.h, W = m.w || m.h * 0.55;
  const ring = [];
  for (let i = 0; i <= S; i++) {
    const t = i / S;
    let g = Math.max(0.02, profileFor(m.profile || kind, t));
    // plated creatures: a step at every segment, like armor bands
    if (m.bands) g *= i % 2 ? 0.9 : 1.04;
    // segmented ones: a chain of bulbs
    if (m.segments) g *= 0.62 + 0.38 * Math.abs(Math.sin(t * Math.PI * m.segments));
    const row = [];
    for (let j = 0; j <= R; j++) {
      const a = (j / R) * TAU + (R <= 6 ? 0 : 0);
      row.push([Math.sin(a) * (W / 2) * g, Math.cos(a) * (H / 2) * g, z0 + t]);
    }
    ring.push(row);
  }
  const nose = [0, 0, z0 + 1.01];
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < R; j++) {
      const a = ((j + 0.5) / R) * TAU;
      const aa = a > Math.PI ? TAU - a : a;
      const [c, e] = colorAt(m, i, j, (i + 0.5) / S, aa);
      const p00 = ring[i][j], p01 = ring[i][j + 1], p10 = ring[i + 1][j], p11 = ring[i + 1][j + 1];
      b.tri(p00, p11, p10, c, e);
      b.tri(p00, p01, p11, c, e);
    }
  }
  for (let j = 0; j < R; j++) {
    const a = ((j + 0.5) / R) * TAU;
    const aa = a > Math.PI ? TAU - a : a;
    b.tri(ring[S][j], ring[S][j + 1], nose, aa < 1.6 ? m.top : m.belly, m.mouthGlow || 0);
  }
  return { H, W };
}

function fin(b, pts, color, e = 0) {
  b.tri(pts[0], pts[1], pts[2], color, e);
  b.tri(pts[0], pts[2], pts[1], color, e);
}

// A crystal shard: a thin double pyramid from a base point toward a tip.
function shard(b, base, tip, w, color, e = 0) {
  const mid = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2, (base[2] + tip[2]) / 2];
  const dx = tip[0] - base[0], dy = tip[1] - base[1], dz = tip[2] - base[2];
  const l = Math.hypot(dx, dy, dz) || 1;
  // two directions across the shard
  let ax = [-dy, dx, 0];
  if (Math.hypot(...ax) < 1e-4) ax = [0, -dz, dy];
  const al = Math.hypot(...ax);
  ax = ax.map((v) => (v / al) * w);
  const bx = [(dy * ax[2] - dz * ax[1]) / l, (dz * ax[0] - dx * ax[2]) / l, (dx * ax[1] - dy * ax[0]) / l];
  const P = (o, s) => [mid[0] + o[0] * s, mid[1] + o[1] * s, mid[2] + o[2] * s];
  const ring = [P(ax, 1), P(bx, 1), P(ax, -1), P(bx, -1)];
  for (let k = 0; k < 4; k++) {
    const r0 = ring[k], r1 = ring[(k + 1) % 4];
    b.tri(base, r1, r0, color, e);
    b.tri(tip, r0, r1, color, e);
  }
}

function tail(b, m, H) {
  const fc = m.fin;
  const fe = m.finGlow || 0;
  const z = -0.5;
  const s = (m.tailSize || 1) * Math.max(H, 0.12);
  switch (m.tail) {
    case 'tri':
      // three blades at thirds of a turn
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * TAU;
        const x = Math.sin(a), y = Math.cos(a);
        fin(b, [[0, 0, z + 0.02], [x * s * 0.85, y * s * 0.85, z - s * 0.7], [x * s * 0.2, y * s * 0.2, z - s * 0.5]], fc, fe);
      }
      break;
    case 'veil': {
      // a fan of streamers, joined at the tail, longest in the middle
      const N = 5;
      for (let k = 0; k < N; k++) {
        const f = k / (N - 1) - 0.5;            // -0.5 .. 0.5
        const len = s * (1.7 - Math.abs(f) * 1.1);
        const y = f * s * 1.3;
        fin(b, [[0, f * s * 0.22 + s * 0.05, z + 0.02], [0, y, z - len], [0, f * s * 0.22 - s * 0.05, z + 0.02]], fc, fe);
      }
      break;
    }
    case 'paddle': {
      // a round disc on a stalk
      b.cyl(0.006, 0.01, s * 0.4, 3, mat(0, 0, z - s * 0.18, Math.PI / 2, 0, 0), fc);
      const N = 8;
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * TAU, a1 = ((k + 1) / N) * TAU;
        fin(b, [[0, 0, z - s * 0.75], [0, Math.cos(a0) * s * 0.45, z - s * 0.75 + Math.sin(a0) * s * 0.35], [0, Math.cos(a1) * s * 0.45, z - s * 0.75 + Math.sin(a1) * s * 0.35]], fc, fe);
      }
      break;
    }
    case 'split':
      // two prongs, apart
      for (const sgn of [-1, 1]) shard(b, [0, sgn * s * 0.08, z + 0.03], [0, sgn * s * 0.75, z - s * 0.8], 0.012, fc, fe);
      break;
    case 'shard':
      for (const [y, l] of [[0.6, 0.9], [0, 1.1], [-0.6, 0.9]]) shard(b, [0, 0, z + 0.02], [0, y * s, z - s * l], 0.014, fc, fe);
      break;
    case 'fork':
      fin(b, [[0, 0, z + 0.02], [0, s * 0.95, z - s * 0.85], [0, s * 0.15, z - s * 0.45]], fc, fe);
      fin(b, [[0, 0, z + 0.02], [0, -s * 0.95, z - s * 0.85], [0, -s * 0.15, z - s * 0.45]], fc, fe);
      break;
    case 'long':
      fin(b, [[0, s * 0.3, z + 0.02], [0, -s * 0.3, z + 0.02], [0, 0, z - s * 1.6]], fc, m.glow || fe);
      break;
    case 'shark':
      fin(b, [[0, 0.01, z + 0.04], [0, s * 1.1, z - s * 0.9], [0, 0, z - s * 0.2]], fc, fe);
      fin(b, [[0, 0, z + 0.04], [0, -s * 0.5, z - s * 0.4], [0, 0, z - s * 0.15]], fc, fe);
      break;
    case 'none':
      break;
    default: // round fan
      fin(b, [[0, s * 0.14, z + 0.02], [0, s * 0.62, z - s * 0.5], [0, 0, z - s * 0.66]], fc, fe);
      fin(b, [[0, s * 0.62, z - s * 0.5], [0, s * 0.3, z - s * 0.7], [0, 0, z - s * 0.66]], fc, fe);
      fin(b, [[0, -s * 0.14, z + 0.02], [0, -s * 0.62, z - s * 0.5], [0, 0, z - s * 0.66]], fc, fe);
      fin(b, [[0, -s * 0.62, z - s * 0.5], [0, -s * 0.3, z - s * 0.7], [0, 0, z - s * 0.66]], fc, fe);
      fin(b, [[0, s * 0.14, z + 0.02], [0, -s * 0.14, z + 0.02], [0, 0, z - s * 0.66]], fc, fe);
  }
}

// Eyes: { layout: pair | row | ring | cyclops | stalk | none, n, size, color, glow }
function eyes(b, m, H, W, z, kind = m.kind) {
  const E = m.eyes || {};
  const layout = E.layout || 'pair';
  if (layout === 'none') return;
  const col = E.color ?? m.eye ?? 0x101418, gl = E.glow ?? m.eyeGlow ?? 0;
  const r = Math.max(0.018, H * 0.1 * (E.size || 1));
  // the body's girth where the eyes are, so they sit on its surface
  const g = Math.max(0.2, profileFor(m.profile || kind, clamp(z + 0.5, 0, 1)));
  const ry = (H / 2) * g, rx = (W / 2) * g;
  const eye = (x, y, zz, rr = r) => {
    b.add(new THREE.OctahedronGeometry(rr * 1.35, 0), mat(x * 0.97, y * 0.97, zz), 0x05070b, 0);
    b.add(new THREE.OctahedronGeometry(rr, 0), mat(x * 1.04, y * 1.04, zz + rr * 0.15), col, gl);
  };
  if (layout === 'cyclops') {
    // one great eye, on both flanks (it shows from either side)
    for (const s of [-1, 1]) eye(s * rx * 0.9, ry * 0.3, z, r * 1.7);
    return;
  }
  if (layout === 'stalk') {
    for (const s of [-1, 1]) {
      b.cyl(0.006, 0.008, H * 0.9, 3, mat(s * W * 0.2, H * 0.55, z, 0, 0, s * 0.35), m.side);
      eye(s * (W * 0.2 + H * 0.3), H * 0.98, z, r * 1.2);
    }
    return;
  }
  if (layout === 'ring') {
    const n = E.n || 4;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + Math.PI / n;
      eye(Math.sin(a) * rx, Math.cos(a) * ry, z, r * 0.8);
    }
    return;
  }
  const n = layout === 'row' ? E.n || 3 : 1;
  for (const s of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      const gz = Math.max(0.2, profileFor(m.profile || kind, clamp(z - k * 0.06 + 0.5, 0, 1)));
      eye(s * (W / 2) * gz * 0.92, (H / 2) * gz * (0.3 - k * 0.12), z - k * 0.06, r * (1 - k * 0.15));
    }
  }
}

function features(b, sp, m, kind, H, W) {
  const fc = m.fin;
  const fe = m.finGlow || 0;
  // a crest of spines, or of shards
  if (m.spikes) {
    const n = m.spikes.n || 5;
    for (let k = 0; k < n; k++) {
      const z = -0.3 + (k / Math.max(1, n - 1)) * 0.55;
      const g = profileFor(m.profile || kind, z + 0.5);
      const top = (H / 2) * g;
      if (m.spikes.shard) shard(b, [0, top * 0.8, z], [0, top + H * (m.spikes.h || 0.5), z - 0.04], 0.012, m.spikes.color ?? fc, m.spikes.glow || fe);
      else b.cone(0.018, H * (m.spikes.h || 0.4), 3, mat(0, top + H * (m.spikes.h || 0.4) * 0.4, z, -0.35, 0, 0), m.spikes.color ?? fc, m.spikes.glow || 0);
    }
  }
  // fins: crystal shards for pectorals, or blades
  const pz = kind === 'sculpin' ? 0.22 : 0.16;
  if (m.fins === 'shard') {
    for (const s of [-1, 1]) {
      shard(b, [s * W * 0.38, -H * 0.1, pz], [s * (W * 0.5 + 0.16), -H * 0.42, pz - 0.14], 0.016, fc, fe);
      shard(b, [s * W * 0.38, -H * 0.05, pz - 0.06], [s * (W * 0.5 + 0.1), H * 0.05, pz - 0.2], 0.012, fc, fe);
    }
  } else if (m.fins !== 'none') {
    const ps = kind === 'sculpin' ? 1.8 : 1;
    for (const s of [-1, 1]) fin(b, [[s * W * 0.4, -H * 0.15, pz], [s * (W * 0.5 + 0.08 * ps), -H * 0.35, pz - 0.09 * ps], [s * W * 0.4, -H * 0.3, pz - 0.05]], fc, fe);
  }
  // a ring fin around the body
  if (m.ringfin) {
    const z = m.ringfin.z ?? -0.05;
    const g = profileFor(m.profile || kind, z + 0.5);
    b.add(new THREE.TorusGeometry(Math.max(H, W) * 0.62 * g + 0.02, 0.012, 3, 12), mat(0, 0, z), m.ringfin.color ?? fc, m.ringfin.glow ?? 0.6);
  }
  // a glowing core, showing through the flank
  if (m.core) {
    for (const s of [-1, 1]) b.add(new THREE.OctahedronGeometry(Math.max(0.022, H * 0.16), 0), mat(s * W * 0.36, 0, 0.02, 0, 0, 0, 0.6, 1, 1.3), m.core, 1.2);
  }
  // feelers from the head, each with a bead at its tip
  if (m.feelers) {
    const n = m.feelers.n || 2, len = m.feelers.len || 0.25;
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? 0 : ((k / (n - 1)) - 0.5) * 1.8;
      const x = Math.sin(a) * W * 0.3, y = -H * 0.2 + Math.cos(a) * H * 0.05;
      const tip = [x + Math.sin(a) * len * 0.5, y - len * 0.35, 0.5 + len * 0.7];
      b.cyl(0.003, 0.005, len, 3, mat((x + tip[0]) / 2, (y + tip[1]) / 2, (0.48 + tip[2]) / 2, Math.PI / 2 + 0.45, a * 0.4, 0), m.feelers.color ?? fc);
      b.add(new THREE.OctahedronGeometry(0.012, 0), mat(tip[0], tip[1], tip[2]), m.feelers.tip ?? m.feelers.color ?? fc, m.feelers.glow ?? 0.8);
    }
  }
  // shards floating around it, held by nothing
  if (m.halo) {
    const n = m.halo.n || 5;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + 0.3;
      const rr = Math.max(H, W) * 0.85 + 0.05;
      const z = -0.1 + Math.sin(a * 2) * 0.12;
      b.add(new THREE.OctahedronGeometry(m.halo.size || 0.026, 0), mat(Math.sin(a) * rr, Math.cos(a) * rr * 0.8, z, a, a * 0.7, 0, 0.6, 1.4, 0.6), m.halo.color ?? fc, m.halo.glow ?? 0.5);
    }
  }
  // a garden on its back
  if (m.garden) {
    for (let k = 0; k < 9; k++) {
      const z = -0.25 + hash2(k, 3) * 0.55, x = (hash2(k, 7) - 0.5) * W * 0.5;
      const g = profileFor(m.profile || kind, z + 0.5);
      const top = (H / 2) * g;
      if (k % 3 === 0) b.add(new THREE.OctahedronGeometry(0.014, 0), mat(x, top + 0.07, z), m.garden.glow, 1);
      else b.cone(0.022, 0.06 + hash2(k, 9) * 0.06, 4, mat(x, top + 0.03, z), k % 2 ? m.garden.a : m.garden.b);
    }
  }
  // legs along the belly
  if (m.legs) {
    for (let k = 0; k < m.legs; k++) {
      const z = -0.32 + (k / (m.legs - 1)) * 0.6;
      const g = profileFor(m.profile || kind, z + 0.5);
      for (const s of [-1, 1]) b.cyl(0.004, 0.006, 0.07, 3, mat(s * W * 0.4 * g, -H * 0.42 * g - 0.02, z, 0, 0, s * 0.6), m.fin);
    }
  }
  // mandibles
  if (m.mandibles) {
    for (const s of [-1, 1]) shard(b, [s * W * 0.2, -H * 0.05, 0.47], [s * W * 0.32, -H * 0.15, 0.62], 0.01, m.mandibles, 0.15);
  }
  // frills behind the head, lit at the tips
  if (m.frills) {
    const n = m.frills.n || 3;
    for (const s of [-1, 1]) {
      for (let k = 0; k < n; k++) {
        const a = -0.6 + (k / Math.max(1, n - 1)) * 1.2;
        const z = 0.24;
        const g = profileFor(m.profile || kind, z + 0.5);
        const x0 = s * (W / 2) * g * 0.9, y0 = (H / 2) * g * Math.sin(a) * 0.8;
        const tip = [x0 + s * 0.12, y0 + Math.sin(a) * 0.08 + 0.02, z - 0.12];
        shard(b, [x0, y0, z], tip, 0.006, m.frills.color ?? fc, 0.2);
        b.add(new THREE.OctahedronGeometry(0.011, 0), mat(...tip), m.frills.tip ?? fc, 1);
      }
    }
  }
  // a ring of a mouth, glowing
  if (m.mouthRing) b.add(new THREE.TorusGeometry(Math.max(H, W) * 0.2, 0.01, 3, 10), mat(0, 0, 0.47), m.mouthRing, 0.9);
}

export function fishGeometry(sp) {
  if (cache.has(sp.id)) return cache.get(sp.id);
  const m = sp.model;
  const b = new FishBuilder();
  const kind = m.kind;
  if (kind === 'ray') {
    // a flat diamond wing with a long thin tail, its edge lit
    const S = 8, R = 6;
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < R; j++) {
        const a0 = (i / S) * TAU, a1 = ((i + 1) / S) * TAU;
        const r0 = j / R, r1 = (j + 1) / R;
        const pt = (a, r) => {
          const w = 0.5 * (0.6 + 0.4 * Math.abs(Math.sin(a)));
          return [Math.sin(a) * r * w * 1.05, (1 - r) * 0.06, Math.cos(a) * r * 0.42 + 0.05];
        };
        let [c, e] = colorAt(m, i, j, 0.5, 0.3);
        if (j === R - 1 && m.edgeGlow) { c = m.pc; e = m.edgeGlow; }
        b.tri(pt(a0, r0), pt(a0, r1), pt(a1, r1), c, e);
        b.tri(pt(a0, r0), pt(a1, r1), pt(a1, r0), c, e);
        b.tri(pt(a0, r1), pt(a0, r0), [pt(a1, r1)[0], -0.005, pt(a1, r1)[2]], m.belly);
      }
    }
    b.cyl(0.006, 0.012, 0.6, 3, mat(0, 0.01, -0.62, Math.PI / 2, 0, 0), m.top);
    b.add(new THREE.OctahedronGeometry(0.02, 0), mat(0, 0.01, -0.93), m.pc, 1);
    eyes(b, { ...m, eyes: m.eyes || { layout: 'ring', n: 6 } }, 0.12, 0.3, 0.3);
  } else if (kind === 'shell') {
    // a coiled shell whose chambers grow 1, 1, 2, 3, 5, 8, and tentacles lit at the tips
    const fib = [1, 1, 2, 3, 5, 8];
    let ang = 0;
    for (let k = 0; k < fib.length; k++) {
      const r = 0.07 + fib[k] * 0.045;
      const rad = 0.05 + fib[k] * 0.025;
      ang += 0.95;
      const c = k % 2 ? m.side : m.top;
      b.ico(rad, 0, mat(Math.cos(ang) * r * 0.5, Math.sin(ang) * r * 0.5, -0.05, 0, 0, ang), (x, y) => (y > 0 ? c : m.pc), 0);
    }
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * TAU;
      const len = 0.24 + (k % 3) * 0.06;
      b.cyl(0.005, 0.013, len, 3, mat(Math.cos(a) * 0.06, Math.sin(a) * 0.06 - 0.05, 0.18 + len / 2, Math.PI / 2 + Math.sin(a) * 0.35, 0, 0), m.fin);
      b.add(new THREE.OctahedronGeometry(0.011, 0), mat(Math.cos(a) * 0.08, Math.sin(a) * 0.08 - 0.05, 0.18 + len), m.pc, 1);
    }
    eyes(b, m, 0.25, 0.3, 0.2);
  } else if (kind === 'listener') {
    // an immense, simple shadow
    b.add(new THREE.SphereGeometry(0.5, 10, 6), mat(0, 0, 0, 0, 0, 0, 0.32, 0.12, 1), 0x05080a);
    fin(b, [[0, 0, -0.45], [0.6, 0, -0.75], [-0.6, 0, -0.75]], 0x05080a);
    fin(b, [[0.12, 0, 0.1], [0.75, -0.02, -0.15], [0.12, 0, -0.2]], 0x05080a);
    fin(b, [[-0.12, 0, 0.1], [-0.75, -0.02, -0.15], [-0.12, 0, -0.2]], 0x05080a);
  } else {
    const flat = kind === 'flat';
    const mm = flat ? { ...m, h: m.w, w: m.h } : m;
    const { H, W } = body(b, mm, kind);
    if (flat) {
      // it lies on the bottom: broad face up, a fringe all around, eyes on stalks
      const fc = m.fin;
      for (let k = 0; k < 9; k++) {
        const z = -0.4 + k * 0.1;
        const g = profileFor('flat', z + 0.5);
        for (const s of [-1, 1]) fin(b, [[s * (W / 2) * g, 0, z - 0.05], [s * ((W / 2) * g + 0.05), 0, z], [s * (W / 2) * g, 0, z + 0.05]], fc);
      }
      tail(b, { ...m, tail: m.tail || 'round', tailSize: 0.5 }, 0.2);
      eyes(b, { ...m, eyes: m.eyes || { layout: 'stalk' } }, 0.15, 0.3, 0.3);
    } else {
      tail(b, m, H);
      features(b, sp, m, kind, H, W);
      if (m.dorsal !== 'none' && !m.spikes) {
        const fc = m.fin;
        if (kind === 'eel') {
          for (let k = 0; k < 8; k++) {
            const z = -0.45 + k * 0.1;
            fin(b, [[0, H * 0.45, z], [0, H * 0.95, z + 0.05], [0, H * 0.45, z + 0.1]], fc, m.finGlow || 0);
          }
        } else fin(b, [[0, H * 0.45, -0.12], [0, H * 0.95, 0.0], [0, H * 0.45, 0.16]], fc, m.finGlow || 0);
      }
      if (kind === 'gar') b.cyl(0.004, 0.018, 0.34, 4, mat(0, 0, 0.64, Math.PI / 2, 0, 0), m.top);
      if (kind === 'pike') b.cone(H * 0.18, 0.12, 3, mat(0, -H * 0.05, 0.52, Math.PI / 2, 0, 0), m.top);
      if (kind === 'sturgeon') {
        b.cone(H * 0.25, 0.14, 4, mat(0, -H * 0.1, 0.55, Math.PI / 2 + 0.25, 0, 0), m.side);
        const rows = [2, 3, 5, 7, 11];
        for (const [r, n] of rows.entries()) {
          for (let k = 0; k < n; k++) {
            const z = -0.35 + ((k + 0.5) / n) * 0.75;
            const a = [0, -0.9, 0.9, -1.5, 1.5][r];
            const g = profileFor('sturgeon', z + 0.5);
            b.box(0.025, 0.02, 0.035, mat(Math.sin(a) * (W / 2) * g, Math.cos(a) * (H / 2) * g, z, 0, 0, -a), m.pc, 0.3);
          }
        }
      }
      if (m.barbel) {
        b.cyl(0.003, 0.003, 0.12, 3, mat(0, -H * 0.42, 0.42, 0.3, 0, 0), m.barbel);
        if (sp.id === 'lantern_cod') b.add(new THREE.OctahedronGeometry(0.024, 0), mat(0, -H * 0.42 - 0.06, 0.4), m.barbel, 1.2);
      }
      if (kind === 'angler' || kind === 'gulper') {
        b.add(new THREE.SphereGeometry(H * 0.45, 8, 5, 0, TAU, Math.PI * 0.45, Math.PI * 0.4), mat(0, -H * 0.05, 0.36), 0x050506);
        for (let k = 0; k < 7; k++) {
          const a = -1.2 + (k / 6) * 2.4;
          b.cone(0.012, 0.05, 3, mat(Math.sin(a) * H * 0.38, -H * 0.02, 0.42 + Math.cos(a) * 0.04, Math.PI, 0, 0), m.pc ?? 0xc2c9c9, 0.2);
        }
      }
      if (m.lure) {
        b.cyl(0.004, 0.006, 0.35, 3, mat(0, H * 0.55, 0.4, 0.7, 0, 0), m.fin);
        b.add(new THREE.OctahedronGeometry(0.035, 0), mat(0, H * 0.75, 0.6), m.lure, 1.2);
      }
      if (m.pattern === 'filaments') {
        for (let k = 0; k < 12; k++) {
          const z = -0.4 + k * 0.075;
          const s = k % 2 ? 1 : -1;
          b.cyl(0.002, 0.003, 0.11, 3, mat(s * W * 0.3, H * 0.35, z, 0.4 * s, 0, 0.7 * s), m.pc, 0.5);
        }
      }
      if (m.pattern === 'roots') {
        for (let k = 0; k < 6; k++) {
          const z = -0.35 + k * 0.13;
          b.cyl(0.003, 0.005, 0.12, 3, mat(0, H * 0.7, z, 0.5, 0, 0), m.fin);
          b.cyl(0.002, 0.004, 0.08, 3, mat(0.02, H * 0.85, z + 0.04, 0.9, 0, 0.6), m.fin);
          b.add(new THREE.OctahedronGeometry(0.008, 0), mat(0.03, H * 0.92, z + 0.07), m.pc, 1);
        }
      }
      const ez = kind === 'eel' ? 0.42 : kind === 'sculpin' || kind === 'angler' || kind === 'gulper' ? 0.33 : 0.36;
      eyes(b, m, H, W, ez);
    }
  }
  const geo = b.build();
  geo.computeBoundingBox();
  cache.set(sp.id, geo);
  return geo;
}

// The orb that floats above an Orb Herald (a separate mesh so it can drift).
export function orbGeometry() {
  const b = new Builder();
  b.add(new THREE.IcosahedronGeometry(0.05, 0), null, 0xd6edf5, 1);
  return b.build();
}
