import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial, deepMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { stratum } from './strata.js';
import { STONE, PULSE, Y } from './parts.js';

// The deep's forms, built (deep.js describes them). Every one is made of four kinds of
// stuff, in its stratum's colors:
//   stone   dark masses, lit like the world
//   shell   the sheen: the stratum's three colors running over it (deepMaterial)
//   lit     solid parts that glow, on the artifact's pulse
//   light   pure light: additive, fogged, drawn after the fog
// gathered per moving part (a Kit), so a whole part is a few draw calls and turns as one.
// A form stands on the ground at its origin; built small (to crown another, or in a court
// about one) it floats, centered, with nothing on the ground. Each returns where its light
// is, where to look, how wide and how high it is.

const _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const hash3 = (x, y, z) => { const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return h - Math.floor(h); };
const PHI = (1 + Math.sqrt(5)) / 2;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

// ------------------------------------------------------------------ the kit
class Kit {
  constructor(art, parent) {
    this.art = art;
    this.group = new THREE.Group();
    if (parent) parent.add(this.group);
    this.stone = new Builder();
    this.shell = new Builder();
    this.lit = new Builder();
    this.glow = new Builder();
    art.kits.push(this);
  }
  sub(x = 0, y = 0, z = 0) {
    const k = new Kit(this.art, this.group);
    k.group.position.set(x, y, z);
    return k;
  }
  finish() {
    const m = this.art.mats;
    for (const [b, material, fx] of [[this.stone, m.stone], [this.shell, m.shell], [this.lit, this.litMat || m.lit], [this.glow, m.light, true]]) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.build(), material);
      if (fx) { mesh.layers.set(LAYER_FX); mesh.frustumCulled = false; }
      this.group.add(mesh);
    }
  }
}

// ------------------------------------------------------------------ shapes
function orient(pos, dir, sx = 1, sy = 1, sz = 1) {
  _v.copy(dir).normalize();
  _q.setFromUnitVectors(Y, _v);
  return new THREE.Matrix4().compose(pos.clone(), _q.clone(), new THREE.Vector3(sx, sy, sz));
}

// a bar from a to c
function bar(b, a, c, w, color, em = 0) {
  const d = _w.subVectors(c, a), len = d.length();
  if (len < 1e-4) return;
  b.box(w, len + w * 0.3, w, orient(_v.addVectors(a, c).multiplyScalar(0.5).clone(), d), color, em);
}

// a crystal along dir from base: a prism and a point
function shard(b, base, dir, len, r, sides, color, em = 0, tip = null) {
  const m = orient(base, dir);
  b.add(new THREE.CylinderGeometry(r, r * 0.8, len * 0.72, sides), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.36, 0)), color, em);
  b.add(new THREE.ConeGeometry(r, len * 0.28, sides), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, len * 0.86, 0)), tip ?? color, em);
}

// A petal: a curved, cupped blade, base at the origin, along +Y, its outside to +Z; then
// tilted out by `tilt`, turned to face `a`, set at radius r0. Shell colors from root to tip.
function petal(b, L, W, tilt, a, r0, y0, cup, curl, lo, hi, segU = 7, segV = 4, edge = null, ew = 0) {
  const m = mat(Math.cos(a) * r0, y0, Math.sin(a) * r0, tilt, Math.PI / 2 - a, 0);
  const P = (u, v) => {
    const w = W * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.85);
    return new THREE.Vector3(v * w, u * L, -cup * v * v * w + curl * L * u * u).applyMatrix4(m);
  };
  for (let i = 0; i < segU; i++) {
    const u0 = i / segU, u1 = (i + 1) / segU;
    const col = mixHex(lo, hi, (u0 + u1) / 2);
    for (let j = 0; j < segV; j++) {
      const v0 = -1 + (2 * j) / segV, v1 = -1 + (2 * (j + 1)) / segV;
      const p00 = P(u0, v0), p10 = P(u1, v0), p11 = P(u1, v1), p01 = P(u0, v1);
      b.quad(p00.toArray(), p10.toArray(), p11.toArray(), p01.toArray(), col);
    }
  }
  if (edge) {
    for (const v of [-1, 1]) for (let i = 0; i < segU; i++) bar(edge.b, P(i / segU, v), P((i + 1) / segU, v), ew, edge.color, 1);
  }
}

// the solids: their corners and edges (and faces, for the five that three.js knows)
const POLY = {};
function polyOf(name) {
  if (POLY[name]) return POLY[name];
  let verts = [];
  const perms = (x, y, z) => [[x, y, z], [y, z, x], [z, x, y]];
  if (name === 'cuboctahedron') { for (const s of [1, -1]) for (const t of [1, -1]) verts.push([s, t, 0], [s, 0, t], [0, s, t]); }
  else if (name === 'icosidodecahedron') {
    for (const s of [1, -1]) for (const p of perms(0, 0, s * PHI)) verts.push(p);
    for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) for (const p of perms(a * 0.5, b * PHI / 2, c * PHI * PHI / 2)) verts.push(p);
  } else if (name === 'stella') { for (const x of [1, -1]) for (const y of [1, -1]) for (const z of [1, -1]) verts.push([x, y, z]); }
  else {
    const g = { tetrahedron: new THREE.TetrahedronGeometry(1), cube: new THREE.BoxGeometry(1, 1, 1), octahedron: new THREE.OctahedronGeometry(1),
      dodecahedron: new THREE.DodecahedronGeometry(1), icosahedron: new THREE.IcosahedronGeometry(1) }[name];
    const p = g.attributes.position;
    const seen = new Set();
    for (let i = 0; i < p.count; i++) {
      const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
      if (!seen.has(k)) { seen.add(k); verts.push([p.getX(i), p.getY(i), p.getZ(i)]); }
    }
    g.dispose();
  }
  const V = verts.map((v) => new THREE.Vector3(...v).normalize());
  let min = Infinity;
  const pairs = [];
  for (let i = 0; i < V.length; i++) for (let j = i + 1; j < V.length; j++) {
    const dd = V[i].distanceTo(V[j]);
    pairs.push([i, j, dd]);
    // the stella's edges are within each of its two tetrahedra
    if (name !== 'stella' || (verts[i][0] * verts[i][1] * verts[i][2]) === (verts[j][0] * verts[j][1] * verts[j][2])) min = Math.min(min, dd);
  }
  const E = pairs.filter(([i, j, dd]) => Math.abs(dd - min) < 1e-3 && (name !== 'stella' || verts[i][0] * verts[i][1] * verts[i][2] === verts[j][0] * verts[j][1] * verts[j][2])).map(([i, j]) => [i, j]);
  return (POLY[name] = { V, E });
}
function solidGeo(name, r) {
  if (name === 'tetrahedron') return new THREE.TetrahedronGeometry(r);
  if (name === 'cube') return new THREE.BoxGeometry(r * 1.155, r * 1.155, r * 1.155);
  if (name === 'octahedron') return new THREE.OctahedronGeometry(r);
  if (name === 'dodecahedron') return new THREE.DodecahedronGeometry(r);
  if (name === 'icosahedron') return new THREE.IcosahedronGeometry(r);
  return null;
}

// a solid's edges as bars of light, its corners as lit beads
function wire(k, name, r, w, color, bead) {
  const { V, E } = polyOf(name);
  for (const [i, j] of E) bar(k.glow, V[i].clone().multiplyScalar(r), V[j].clone().multiplyScalar(r), w, color, 1);
  if (bead) for (const v of V) k.lit.ico(w * 1.8, 0, mat(v.x * r, v.y * r, v.z * r), bead, PULSE);
}

// faces drawn in, each a pane of the sheen (stained glass), or stone
function panes(b, geo, inset, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, i), c = new THREE.Vector3().fromBufferAttribute(p, i + 1), e = new THREE.Vector3().fromBufferAttribute(p, i + 2);
    const m = a.clone().add(c).add(e).multiplyScalar(1 / 3);
    const t = (x) => x.clone().lerp(m, inset).toArray();
    b.tri(t(a), t(c), t(e), typeof color === 'function' ? color(m) : color);
  }
  if (g !== geo) g.dispose();
  geo.dispose();
}

// points of light (one color a set), moved by the form's update; returns the positions
function cloud(art, parent, n, color, size, opacity = 1) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n), al = new Float32Array(n);
  const R = art.R;
  for (let i = 0; i < n; i++) { sz[i] = 0.6 + R() * 0.8; al[i] = 0.5 + R() * 0.5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(al, 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  parent.add(p);
  art.fades.push([m, opacity]);
  art.mats.extra.push(m);
  return { p, pos, attr: g.attributes.position };
}

// a mesh of light whose points move (veils, arms): strips of quads, each strip a list of
// pairs of points; color and alpha per vertex
function strips(art, parent, nStrips, nPts, color, alphaOf, opacity) {
  const nv = nStrips * (nPts - 1) * 6;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  const c = new THREE.Color();
  let o = 0;
  for (let s = 0; s < nStrips; s++) for (let i = 0; i < nPts - 1; i++) for (const [k, side] of [[i, 0], [i, 1], [i + 1, 0], [i, 1], [i + 1, 1], [i + 1, 0]]) {
    c.setHex(typeof color === 'function' ? color(s, k / (nPts - 1), side) : color);
    col.set([c.r, c.g, c.b], o * 3);
    em[o] = Math.max(0.0001, alphaOf(s, k / (nPts - 1), side));
    o++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  parent.add(mesh);
  art.fades.push([m, opacity]);
  art.mats.extra.push(m);
  // set(s, i, ax, ay, az, bx, by, bz): the pair of points i of strip s
  const A = new Float32Array(nStrips * nPts * 6);
  return {
    set(s, i, ax, ay, az, bx, by, bz) { A.set([ax, ay, az, bx, by, bz], (s * nPts + i) * 6); },
    commit() {
      let q = 0;
      for (let s = 0; s < nStrips; s++) for (let i = 0; i < nPts - 1; i++) {
        const p0 = (s * nPts + i) * 6, p1 = (s * nPts + i + 1) * 6;
        // (a_i, b_i, a_i+1) (b_i, b_i+1, a_i+1) as two triangles
        for (const off of [p0, p0 + 3, p1, p0 + 3, p1 + 3, p1]) { pos[q++] = A[off]; pos[q++] = A[off + 1]; pos[q++] = A[off + 2]; }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

// a tube along a curve given as a function of t in [0, 1]
function curveTube(b, f, n, radius, seg, color, em = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(f(i / n));
  b.tube(pts, radius, seg, color, em);
  return pts;
}

// ------------------------------------------------------------------ the forms
// each: (kit, P, S, art, mini) -> { light, focus, span, height, solid }

function corolla(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = mini ? 0 : (P.stem === 'float' ? 46 : 36) * S;
  if (!mini && P.stem === 'stalk') {
    const pts = [];
    const bend = R.range(-6, 6) * S;
    for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(Math.sin(t * Math.PI) * bend, t * H, Math.sin(t * Math.PI * 2) * bend * 0.4)); }
    k.stone.tube(pts, (t) => (1.6 - t * 0.8) * S, 7, c.stone[2]);
    for (const [t, a] of [[0.35, R() * TAU], [0.55, R() * TAU]]) petal(k.shell, 9 * S, 3.4 * S, 1.1, a, 0.4 * S, t * H, 0.5, 0.25, c.shellLo, c.shellHi, 5, 3);
  }
  if (!mini && P.stem === 'roots') {
    const n = R.int(9, 15);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.3, far = R.range(8, 22) * S;
      const pts = [];
      for (let j = 0; j <= 8; j++) { const t = j / 8; pts.push(new THREE.Vector3(Math.cos(a) * far * t * t, H * (1 - t) - 2 * S + 2 * S * t, Math.sin(a) * far * t * t)); }
      k.glow.tube(pts, (t) => (0.22 + 0.2 * (1 - t)) * S, 4, mixHex(c.light, 0xffffff, 0.2), 0.8);
      k.lit.ico(0.7 * S, 0, mat(pts[8].x, 0.4, pts[8].z), c.second, PULSE);
    }
  }
  const whorls = [];
  const build = (flip) => {
    for (let i = 0; i < P.whorls; i++) {
      const w = k.sub(0, H, 0);
      if (flip) w.group.scale.y = -1;
      const n = P.n * (i >= 2 ? 2 : 1), L = (9 + i * 6) * S, Wd = L * (0.42 - i * 0.03), tilt = Math.min(1.35, 0.28 + i * 0.32);
      const lo = mixHex(c.shellLo, c.stone[0], 0.2), hi = i % 2 ? c.shellHi : mixHex(c.shellHi, c.light, 0.4);
      for (let j = 0; j < n; j++) petal(w.shell, L, Wd, tilt, (j / n) * TAU + (i % 2) * (Math.PI / n), (1 + i * 1.5) * S, 0, 0.55, 0.18 + 0.06 * i, lo, hi, 7, 4, { b: w.glow, color: mixHex(c.light, 0xffffff, 0.25) }, 0.16 * S);
      whorls.push({ w, i, spin: (0.03 + R() * 0.05) * (i % 2 ? -1 : 1) * (flip ? -1 : 1), flip });
    }
  };
  build(false);
  if (P.lotus && !mini) build(true);
  // the heart: a light, and stamens about it
  const heart = k.sub(0, H, 0);
  heart.glow.ico(2.4 * S, 1, mat(0, 2.5 * S, 0), mixHex(c.light, 0xffffff, 0.5), 1);
  heart.lit.ico(1.5 * S, 1, mat(0, 2.5 * S, 0), c.second, PULSE);
  const ns = P.n * 2;
  for (let j = 0; j < ns; j++) {
    const a = (j / ns) * TAU, d = new THREE.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45);
    const tip = d.clone().normalize().multiplyScalar(7 * S).add(new THREE.Vector3(0, 1.5 * S, 0));
    bar(heart.lit, new THREE.Vector3(0, 1.5 * S, 0), tip, 0.18 * S, c.second, 1);
    heart.glow.ico(0.55 * S, 0, mat(tip.x, tip.y, tip.z), c.light, 1);
  }
  let open = 0;
  art.updates.push((t, dt, ctx) => {
    open += ((ctx.near ?? 0) - open) * Math.min(1, dt * 0.8);
    for (const { w, i, spin, flip } of whorls) {
      w.group.rotation.y = t * spin;
      const o = open * (0.25 + i * 0.08), b = Math.sin(t * 0.6 + i) * 0.025;
      w.group.scale.set(1 + o + b, (1 - o * 0.9 + b) * (flip ? -1 : 1), 1 + o + b);
    }
    heart.group.rotation.y = -t * 0.1;
  });
  const span = (P.whorls * 7.5 + 8) * S;
  let up = 9 * S;
  for (let i = 0; i < P.whorls; i++) up = Math.max(up, (9 + i * 6) * S * Math.cos(Math.min(1.35, 0.28 + i * 0.32)) + 2 * S);
  return { light: new THREE.Vector3(0, H + 2.5 * S, 0), focus: new THREE.Vector3(0, H + up * 0.2, 0), span, height: H + up, solid: span * 0.8, low: P.stem === 'float' ? H - (P.lotus ? up : 4 * S) : 0 };
}

function spine(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = (mini ? 30 : 52 + R() * 14) * S, y0 = mini ? -H / 2 : 0;
  const rb = 2.4 * S;
  const rad = (t) => (P.shape === 'spindle' ? rb * (0.35 + 0.9 * Math.sin(Math.PI * t)) : P.shape === 'bulb' ? rb * (0.5 + 0.9 * Math.exp(-Math.pow((t - 0.3) / 0.16, 2))) : rb * (1 - 0.75 * t));
  const pts = [];
  const sway = R.range(1, 4) * S;
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector3(Math.sin(t * 5) * sway * t, y0 + t * H, Math.cos(t * 4) * sway * t * 0.5)); }
  k.stone.tube(pts, rad, 7, c.stone[1]);
  const at = (t) => { const f = t * 14, i = Math.min(13, Math.floor(f)); return pts[i].clone().lerp(pts[i + 1], f - i); };
  const wind = [];
  for (let i = 0; i <= 160; i++) { const t = i / 160, p = at(t), a = t * TAU * (5 + art.depth), r = rad(t) * 1.08; wind.push(new THREE.Vector3(p.x + Math.cos(a) * r, p.y, p.z + Math.sin(a) * r)); }
  k.glow.tube(wind, 0.16 * S, 3, mixHex(c.light, 0xffffff, 0.25), 0.9);
  const crowns = [];
  let maxR = 0;
  P.crowns.forEach((type, i) => {
    const t = 0.16 + 0.74 * Math.pow(i / Math.max(1, P.nodes - 1), 0.95);
    const p = at(t);
    const cr = (P.shape === 'spindle' ? 4 + 6 * Math.sin(Math.PI * t) : 9 - 5 * t) * S * (mini ? 0.8 : 1);
    maxR = Math.max(maxR, cr);
    k.lit.add(new THREE.TorusGeometry(rad(t) * 1.15, 0.3 * S, 4, 12), mat(p.x, p.y, p.z, Math.PI / 2, 0, 0), c.light, PULSE);
    const w = k.sub(p.x, p.y, p.z);
    const col = i % 2 ? c.second : c.light;
    if (type === 'spikes') {
      const n = R.int(5, 9) + art.depth;
      for (let j = 0; j < n; j++) { const a = (j / n) * TAU; shard(w.shell, new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a), 0.45, Math.sin(a)), cr, 0.55 * S, 5, c.shellHi, 0, col); }
    } else if (type === 'disc') {
      w.shell.cyl(cr, cr, 0.5 * S, 24, mat(0, 0, 0), c.shellHi);
      const n = 16;
      for (let j = 0; j < n; j++) { const a = (j / n) * TAU; w.lit.box(1.2 * S, 0.9 * S, 0.5 * S, mat(Math.cos(a) * cr, 0, Math.sin(a) * cr, 0, -a, 0), col, j % 2 ? PULSE : 1); }
      w.glow.add(new THREE.TorusGeometry(cr * 1.08, 0.12 * S, 3, 40), mat(0, 0, 0, Math.PI / 2, 0, 0), col, 1);
    } else if (type === 'ring') {
      w.stone.add(new THREE.TorusGeometry(cr, 0.45 * S, 5, 36), mat(0, 0, 0, Math.PI / 2, 0, 0), c.stone[3]);
      const n = R.int(5, 11);
      for (let j = 0; j < n; j++) { const a = (j / n) * TAU; w.glow.ico(0.7 * S, 0, mat(Math.cos(a) * cr, 0, Math.sin(a) * cr), col, 1); }
      for (let j = 0; j < 4; j++) { const a = (j / 4) * TAU; bar(w.stone, new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * cr, 0, Math.sin(a) * cr), 0.3 * S, c.stone[2]); }
    } else if (type === 'cage') {
      wire(w, R.pick(['octahedron', 'cube', 'icosahedron', 'cuboctahedron']), cr * 0.75, 0.22 * S, col, c.second);
    } else if (type === 'petals') {
      const n = R.int(6, 10);
      for (let j = 0; j < n; j++) petal(w.shell, cr, cr * 0.38, 1.25, (j / n) * TAU, rad(t), -cr * 0.15, 0.5, 0.25, c.shellLo, c.shellHi, 5, 3, { b: w.glow, color: col }, 0.12 * S);
    } else {
      const sub = [];
      for (let j = 0; j < 3; j++) {
        const o = w.sub(0, 0, 0);
        o.lit.add(solidGeo(R.pick(['tetrahedron', 'octahedron', 'cube']), 1.2 * S), null, col, PULSE);
        sub.push({ o, ph: (j / 3) * TAU });
      }
      w.glow.add(new THREE.TorusGeometry(cr, 0.08 * S, 3, 48), mat(0, 0, 0, Math.PI / 2, 0, 0), col, 1);
      art.updates.push((tt) => { for (const { o, ph } of sub) { o.group.position.set(Math.cos(tt * 0.5 + ph) * cr, Math.sin(tt * 1.3 + ph) * 0.8 * S, Math.sin(tt * 0.5 + ph) * cr); o.group.rotation.set(tt, tt * 0.7, 0); } });
    }
    crowns.push({ w, spin: (0.05 + R() * 0.06) * (i % 2 ? -1 : 1) });
  });
  // its top
  const top = at(1);
  const crownTop = k.sub(top.x, top.y + 6 * S, top.z);
  if (P.top === 'star') {
    crownTop.glow.add(solidGeo('octahedron', 3.6 * S), null, mixHex(c.light, 0xffffff, 0.4), 1);
    crownTop.lit.add(new THREE.TetrahedronGeometry(4.2 * S), null, c.second, PULSE);
    crownTop.lit.add(new THREE.TetrahedronGeometry(4.2 * S), mat(0, 0, 0, 0, Math.PI / 2, 0), c.third, PULSE);
  } else if (P.top === 'orb') {
    crownTop.glow.ico(3.4 * S, 2, null, mixHex(c.light, 0xffffff, 0.35), 1);
    crownTop.stone.add(new THREE.TorusGeometry(5.2 * S, 0.25 * S, 4, 36), mat(0, 0, 0, 1.2, 0, 0), c.stone[3]);
    crownTop.lit.add(new THREE.TorusGeometry(6.4 * S, 0.18 * S, 4, 36), mat(0, 0, 0, 0.4, 0.8, 0), c.second, PULSE);
  } else {
    crownTop.stone.sphere(3.4 * S, 14, 10, null, 0xb9c0bc);
    crownTop.lit.cyl(1.6 * S, 1.6 * S, 0.3 * S, 14, mat(0, 0, 3.3 * S, Math.PI / 2, 0, 0), c.light, PULSE);
    crownTop.stone.cyl(0.7 * S, 0.7 * S, 0.4 * S, 10, mat(0, 0, 3.5 * S, Math.PI / 2, 0, 0), 0x050508);
  }
  if (!mini) {
    // steps at its foot, and roots of light across the ground
    for (let i = 0; i < 3; i++) k.stone.cyl((7 - i * 1.8) * S, (7.4 - i * 1.8) * S, 1 * S, 10, mat(0, 0.5 * S + i * S, 0), c.stone[i]);
    const n = R.int(9, 15);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.2, L = R.range(18, 34) * S;
      let prev = new THREE.Vector3(Math.cos(a) * 7 * S, 0, Math.sin(a) * 7 * S);
      for (let j = 1; j <= 5; j++) {
        const r = 7 * S + (L * j) / 5, aa = a + Math.sin(j * 1.3 + i) * 0.12;
        const p = new THREE.Vector3(Math.cos(aa) * r, 0, Math.sin(aa) * r);
        p.y = art.ground(p.x, p.z) + 0.3;
        bar(k.glow, prev, p, 0.3 * S * (1 - j * 0.12), c.light, 0.9);
        prev = p;
      }
    }
  }
  art.updates.push((t, dt, ctx) => {
    for (const { w, spin } of crowns) w.group.rotation.y = t * spin;
    crownTop.group.rotation.y = t * 0.2;
    crownTop.group.position.y = top.y + 6 * S + Math.sin(t * 0.5) * 0.8 * S;
    if (P.top === 'eye' && ctx.shipLocal) crownTop.group.rotation.y = Math.atan2(ctx.shipLocal.x - top.x, ctx.shipLocal.z - top.z);
  });
  return { light: new THREE.Vector3(top.x, top.y + 6 * S, top.z), focus: new THREE.Vector3(0, y0 + H * 0.55, 0), span: Math.max(H * 0.45, maxR), height: y0 + H + 10 * S, solid: maxR + 2 * S };
}

function nest(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = mini ? 0 : 40 * S;
  const r0 = 4.5 * S;
  const shells = [];
  let r = r0;
  P.shells.forEach((s, i) => {
    const w = k.sub(0, H, 0);
    const col = [c.light, c.second, c.third][i % 3];
    let mode = s.mode;
    if ((mode === 'glass' || mode === 'solid' || mode === 'stellated') && !solidGeo(s.solid, 1)) mode = 'wire';
    if (s.solid === 'stella' && mode !== 'wire') {
      panes(w.shell, new THREE.TetrahedronGeometry(r), 0.1, (m) => mixHex(c.shellLo, c.shellHi, 0.5 + m.y / r / 2));
      panes(w.shell, new THREE.TetrahedronGeometry(r).rotateY(Math.PI / 2), 0.1, (m) => mixHex(c.shellLo, c.shellHi, 0.5 + m.y / r / 2));
    } else if (mode === 'glass') {
      panes(w.shell, solidGeo(s.solid, r), 0.12, (m) => mixHex(c.shellLo, c.shellHi, 0.5 + m.y / r / 2));
      wire(w, s.solid, r * 1.01, 0.12 * S * (1 + i * 0.2), col, null);
    } else if (mode === 'solid') {
      panes(w.stone, solidGeo(s.solid, r), 0.04, c.stone[(i + 1) % 4]);
      wire(w, s.solid, r * 1.01, 0.2 * S, col, c.second);
    } else if (mode === 'stellated') {
      const g = solidGeo(s.solid, r).toNonIndexed(), p = g.attributes.position;
      for (let f = 0; f < p.count; f += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(p, f), b2 = new THREE.Vector3().fromBufferAttribute(p, f + 1), e = new THREE.Vector3().fromBufferAttribute(p, f + 2);
        const m = a.clone().add(b2).add(e).multiplyScalar(1 / 3);
        const apex = m.clone().multiplyScalar(1 + 0.9 * (r0 / r + 0.4));
        const shade = mixHex(c.shellLo, c.shellHi, f / p.count);
        w.shell.tri(a.toArray(), b2.toArray(), apex.toArray(), shade).tri(b2.toArray(), e.toArray(), apex.toArray(), shade).tri(e.toArray(), a.toArray(), apex.toArray(), shade);
        w.glow.ico(0.35 * S, 0, mat(apex.x, apex.y, apex.z), col, 1);
      }
      g.dispose();
    } else wire(w, s.solid, r, 0.24 * S * (1 + i * 0.15), col, c.second);
    const axis = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    shells.push({ w, axis, speed: (0.12 + R() * 0.12) * (i % 2 ? -1 : 1) / (1 + i * 0.35) });
    r *= R.range(1.45, 1.7);
  });
  const outer = r / 1.55;
  const core = k.sub(0, H, 0);
  core.glow.ico(r0 * 0.5, 2, null, mixHex(c.light, 0xffffff, 0.55), 1);
  core.lit.ico(r0 * 0.32, 1, null, c.second, PULSE);
  if (!mini) {
    // three legs of light up to it, out of the ground
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4, p = new THREE.Vector3(Math.cos(a) * outer * 1.3, 0, Math.sin(a) * outer * 1.3);
      p.y = art.ground(p.x, p.z);
      bar(k.glow, p, new THREE.Vector3(0, H - outer * 0.9, 0), 0.35 * S, c.light, 0.7);
      k.stone.cyl(1.4 * S, 2 * S, 3 * S, 6, mat(p.x, p.y + 1.5 * S, p.z), c.stone[1]);
    }
  }
  art.updates.push((t) => {
    for (const s of shells) s.w.group.quaternion.setFromAxisAngle(s.axis, t * s.speed);
    core.group.scale.setScalar(1 + Math.sin(t * 1.3) * 0.08);
  });
  return { light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H * 0.85, 0), span: outer * 1.25, height: H + outer, solid: outer * 1.05, low: H - outer };
}

function armillary(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const R0 = 20 * S, H = mini ? 0 : R0 + 22 * S;
  let parent = k.sub(0, H, 0);
  const rings = [];
  for (let i = 0; i < P.rings; i++) {
    const w = parent.sub(0, 0, 0);
    const r = R0 * Math.pow(0.9, i), col = [c.light, c.second, c.third][i % 3];
    if (i % 3 === 2) {
      w.shell.add(new THREE.CylinderGeometry(r, r, 2.2 * S, 48, 1, true), null, c.shellHi);
      w.shell.add(new THREE.CylinderGeometry(r * 0.985, r * 0.985, 2.2 * S, 48, 1, true), null, c.shellLo);
    } else {
      w.stone.add(new THREE.TorusGeometry(r, 0.42 * S, 5, 72), mat(0, 0, 0, Math.PI / 2, 0, 0), c.stone[i % 4]);
      w.glow.add(new THREE.TorusGeometry(r * 1.025, 0.08 * S, 3, 96), mat(0, 0, 0, Math.PI / 2, 0, 0), col, 0.8);
      w.glow.add(new THREE.TorusGeometry(r * 0.975, 0.08 * S, 3, 96), mat(0, 0, 0, Math.PI / 2, 0, 0), col, 0.8);
    }
    // ticks, like an astrolabe's, and lights
    const n = 24 + i * 6;
    for (let j = 0; j < n; j++) {
      const a = (j / n) * TAU, big = j % 6 === 0;
      w.lit.box(0.3 * S, (big ? 2.4 : 1.2) * S, 0.3 * S, mat(Math.cos(a) * r, 0, Math.sin(a) * r, Math.PI / 2, -a, 0), col, big ? PULSE : 1);
      if (big) w.glow.ico(0.6 * S, 0, mat(Math.cos(a) * r * 1.03, 0, Math.sin(a) * r * 1.03), col, 1);
    }
    // the pivots it hangs on in the ring outside it
    for (const s of [1, -1]) w.lit.cyl(0.5 * S, 0.5 * S, 2.6 * S, 8, mat(s * r, 0, 0, 0, 0, Math.PI / 2), c.second, 1);
    rings.push({ w, axis: i % 2 ? 'x' : 'z', speed: (0.18 + R() * 0.12) * (R() < 0.5 ? 1 : -1) / (1 + i * 0.15) });
    parent = w;
  }
  const inner = R0 * Math.pow(0.9, P.rings - 1);
  const heart = k.sub(0, H, 0);
  if (P.core === 'portal') {
    // a disc of light, brightest at its middle
    const rp = inner * 0.6, rr = (x, y) => Math.min(1, Math.hypot(x, y) / rp);
    heart.glow.add(new THREE.RingGeometry(0.01, rp, 48, 6), null, (x, y) => mixHex(mixHex(c.light, 0xffffff, 0.5), c.second, rr(x, y)), (x, y) => 0.12 + 0.8 * Math.pow(1 - rr(x, y), 1.5));
    // spiral arms over it
    for (let a = 0; a < 3; a++) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24, ang = a * (TAU / 3) + t * 4; pts.push(new THREE.Vector3(Math.cos(ang) * inner * 0.58 * t, Math.sin(ang) * inner * 0.58 * t, 0.2)); }
      heart.glow.tube(pts, 0.25 * S, 3, mixHex(c.light, 0xffffff, 0.4), 1);
    }
  } else if (P.core === 'orb') {
    heart.glow.ico(inner * 0.32, 2, null, mixHex(c.light, 0xffffff, 0.4), 1);
    heart.lit.ico(inner * 0.2, 1, null, c.second, PULSE);
  } else {
    wire(heart, 'icosahedron', inner * 0.4, 0.2 * S, c.light, c.second);
    wire(heart, 'dodecahedron', inner * 0.25, 0.16 * S, c.second, null);
    heart.glow.ico(inner * 0.1, 1, null, 0xffffff, 1);
  }
  if (!mini && P.stand === 'tripod') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      const pts = [];
      for (let j = 0; j <= 8; j++) { const t = j / 8; const rr = R0 * (1.25 - 0.3 * t); pts.push(new THREE.Vector3(Math.cos(a) * rr, (H - R0 * 1.02) * t + Math.sin(t * Math.PI) * 4 * S, Math.sin(a) * rr)); }
      k.stone.tube(pts, (t) => (1.4 - t * 0.6) * S, 6, c.stone[2]);
    }
  } else if (!mini && P.stand === 'column') {
    k.stone.cyl(2 * S, 3.2 * S, H - R0 * 1.02, 8, mat(0, (H - R0 * 1.02) / 2, 0), c.stone[1]);
    k.stone.cyl(5 * S, 2 * S, 2 * S, 10, mat(0, H - R0 * 1.02, 0), c.stone[3]);
  }
  art.updates.push((t) => {
    for (const r of rings) r.w.group.rotation[r.axis] = t * r.speed;
    heart.group.rotation.z = t * 0.4;
    if (P.core !== 'portal') heart.group.rotation.y = t * 0.3;
  });
  return { light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H * 0.9, 0), span: R0 * 1.15, height: H + R0, solid: R0 * 1.05, low: P.stand === 'float' ? H - R0 : 0 };
}

function choir(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const n = mini ? Math.min(P.n, 21) : P.n;
  const Hc = mini ? 0 : 0;
  const place = [];
  for (let i = 0; i < n; i++) {
    const s = i % P.strands, j = Math.floor(i / P.strands), per = Math.ceil(n / P.strands);
    let x, y, z, yaw;
    if (P.shape === 'helix') {
      const turns = 1.6 + art.depth * 0.1, a = (j / per) * turns * TAU + (s / P.strands) * TAU, r = 15 * S;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = 6 * S + (j / per) * 62 * S; yaw = -a;
    } else if (P.shape === 'spiral') {
      const a = j * 0.42 + (s / P.strands) * TAU, r = 7 * S + j * 1.35 * S;
      x = Math.cos(a) * r; z = Math.sin(a) * r; y = 6 * S + j * 1.5 * S; yaw = -a;
    } else {
      const u = 1 - (2 * (i + 0.5)) / n, rr = Math.sqrt(1 - u * u), a = i * GOLDEN, Rs = 26 * S;
      x = Math.cos(a) * rr * Rs; z = Math.sin(a) * rr * Rs; y = 40 * S + u * Rs; yaw = -a;
    }
    if (mini) { x *= 0.5; z *= 0.5; y = (y - 34 * S) * 0.5; }
    const h = (9 + 12 * (0.5 + 0.5 * Math.sin(i * 0.7))) * S * (mini ? 0.6 : 1);
    place.push({ x, y: y + Hc, z, yaw, h, ph: R() * TAU });
  }
  // the slabs as instances, so each can rise and fall on its own
  const sb = new Builder();
  sb.box(3 * S, 1, 1.1 * S, null, c.stone[1]);
  sb.box(0.5 * S, 0.84, 1.16 * S, null, c.light, PULSE);
  sb.box(3.1 * S, 0.03, 1.18 * S, mat(0, 0.47, 0), c.second, 1);
  const slabGeo = sb.build();
  const gb = new Builder();
  gb.ico(0.8 * S, 0, null, mixHex(c.light, 0xffffff, 0.3), 1);
  const capGeo = gb.build();
  const slabs = new THREE.InstancedMesh(slabGeo, art.mats.stone, n);
  const caps = new THREE.InstancedMesh(capGeo, art.mats.light, n);
  caps.layers.set(LAYER_FX);
  slabs.frustumCulled = caps.frustumCulled = false;
  k.group.add(slabs, caps);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sv = new THREE.Vector3();
  const lay = (t) => {
    place.forEach((p, i) => {
      e.set(Math.sin(t * 0.3 + p.ph) * 0.06, p.yaw, 0);
      q.setFromEuler(e);
      pv.set(p.x, p.y + Math.sin(t * 0.6 + p.ph) * 1.2 * S, p.z);
      sv.set(1, p.h, 1);
      slabs.setMatrixAt(i, m4.compose(pv, q, sv));
      pv.y += p.h * 0.5 + 1.2 * S;
      sv.set(1, 1, 1);
      caps.setMatrixAt(i, m4.compose(pv, q, sv));
    });
    slabs.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
  };
  lay(0);
  // a lit thread through them, and at the heart a light
  const heartY = P.shape === 'sphere' ? 40 * S : P.shape === 'helix' ? 38 * S : 14 * S;
  const heart = k.sub(0, mini ? 0 : heartY, 0);
  heart.glow.ico(3 * S, 2, null, mixHex(c.light, 0xffffff, 0.45), 1);
  heart.lit.ico(1.8 * S, 1, null, c.second, PULSE);
  if (!mini && P.shape === 'helix') k.stone.cyl(1.2 * S, 2.5 * S, 72 * S, 8, mat(0, 36 * S, 0), c.stone[0]);
  art.updates.push((t) => { lay(t); k.group.rotation.y = t * 0.025; heart.group.rotation.y = t * 0.3; });
  const ext = Math.max(...place.map((p) => Math.hypot(p.x, p.z))) + 2 * S, top = Math.max(...place.map((p) => p.y + p.h / 2));
  const low = Math.min(...place.map((p) => p.y - p.h / 2));
  return { light: new THREE.Vector3(0, mini ? 0 : heartY, 0), focus: new THREE.Vector3(0, mini ? 0 : Math.max(heartY, top * 0.45), 0), span: Math.max(ext, top * 0.5), height: top, solid: ext, low: P.shape === 'helix' ? 0 : low };
}

function geode(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const shape = mini ? 'sphere' : P.shape;
  const Hc = shape === 'sphere' ? (mini ? 0 : 40 * S) : shape === 'hanging' ? 58 * S : 0;
  const body = k.sub(0, Hc, 0);
  const n = mini ? Math.min(P.n, 34) : P.n;
  const ramp = (t) => mixHex(mixHex(c.shellLo, c.light, 0.3), c.shellHi, t);
  // the center
  if (shape === 'mound' || shape === 'ring') {
    const g = new THREE.IcosahedronGeometry(12 * S, 1);
    roughen(g, 2.5 * S, 11);
    g.scale(1, 0.45, 1);
    body.stone.add(g, null, (x, y, z) => (hash3(x, y, z) < 0.12 ? c.light : c.stone[Math.floor(hash3(z, x, y) * 4)]), (x, y, z) => (hash3(x, y, z) < 0.12 ? PULSE : 0), { flat: true });
  } else if (shape === 'hanging') {
    const g = new THREE.ConeGeometry(14 * S, 22 * S, 8, 2);
    roughen(g, 2 * S, 5);
    g.rotateX(Math.PI);
    body.stone.add(g, mat(0, 9 * S, 0), c.stone[1]);
    body.stone.cyl(14.5 * S, 14 * S, 2 * S, 8, mat(0, 20 * S, 0), c.stone[3]);
  } else body.lit.ico(3.4 * S, 1, null, c.second, PULSE);
  const up = shape === 'hanging' ? -1 : 1;
  const big = (shape === 'sphere' ? 14 : 30) * S * (mini ? 0.6 : 1);
  if (shape !== 'sphere') {
    shard(body.shell, new THREE.Vector3(0, up > 0 ? 2 * S : -2 * S, 0), new THREE.Vector3(0, up, 0), big, 3.4 * S, 6, c.shellHi, 0, mixHex(c.light, 0xffffff, 0.3));
    bar(body.glow, new THREE.Vector3(0, up * 4 * S, 0), new THREE.Vector3(0, up * big * 0.8, 0), 1.1 * S, mixHex(c.light, 0xffffff, 0.4), 1);
  }
  for (let i = 0; i < n; i++) {
    let dir, base;
    const t = (i + 0.5) / n;
    if (shape === 'sphere') {
      const u = 1 - 2 * t, rr = Math.sqrt(1 - u * u), a = i * GOLDEN;
      dir = new THREE.Vector3(Math.cos(a) * rr, u, Math.sin(a) * rr);
      base = dir.clone().multiplyScalar(2.5 * S);
    } else if (shape === 'ring') {
      const a = i * (TAU / n);
      dir = new THREE.Vector3(Math.cos(a) * 0.6, 1, Math.sin(a) * 0.6);
      base = new THREE.Vector3(Math.cos(a) * 16 * S, 0, Math.sin(a) * 16 * S);
    } else {
      const u = t * 0.85, rr = Math.sqrt(1 - (1 - u) * (1 - u)), a = i * GOLDEN;
      dir = new THREE.Vector3(Math.cos(a) * rr, up * (1 - u), Math.sin(a) * rr);
      base = dir.clone().multiplyScalar(shape === 'hanging' ? 10 * S : 8 * S);
      if (shape === 'mound') base.y *= 0.45;
    }
    const L = (shape === 'sphere' ? (6 + 9 * R()) : (8 + 16 * (1 - t) * R.range(0.6, 1))) * S * (mini ? 0.6 : 1);
    shard(body.shell, base, dir, L, L * 0.13, R.pick([4, 5, 6]), ramp(R()), 0, R() < 0.35 ? mixHex(c.light, 0xffffff, 0.3) : null);
    if (R() < 0.3) body.glow.ico(L * 0.09, 0, mat(base.x + dir.x * L * 1.02, base.y + dir.y * L * 1.02, base.z + dir.z * L * 1.02), i % 2 ? c.light : c.second, 1);
  }
  art.updates.push((t) => {
    if (shape === 'sphere' || shape === 'hanging') body.group.rotation.y = t * 0.06;
    if (shape === 'sphere') body.group.rotation.x = Math.sin(t * 0.13) * 0.3;
    if (shape === 'hanging') body.group.position.y = Hc + Math.sin(t * 0.4) * 1.5 * S;
  });
  const span = shape === 'sphere' ? 20 * S : shape === 'ring' ? 26 * S : 24 * S;
  const height = shape === 'sphere' ? Hc + 20 * S : shape === 'hanging' ? Hc + 22 * S : big + 4 * S;
  return { light: new THREE.Vector3(0, shape === 'hanging' ? Hc - 12 * S : Hc + (shape === 'sphere' ? 0 : big * 0.5), 0), focus: new THREE.Vector3(0, shape === 'hanging' ? Hc - 6 * S : Math.max(Hc, big * 0.45), 0), span, height, solid: span * 0.85, low: shape === 'sphere' ? Hc - 20 * S : shape === 'hanging' ? Hc - 28 * S : 0 };
}

function bloom(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const shape = mini ? 'burst' : P.shape;
  const Hc = shape === 'burst' ? (mini ? 0 : 38 * S) : shape === 'hanging' ? 64 * S : 0;
  const levels = Math.min(P.levels, mini ? 3 : 6);
  // a lit ring at every fork, one mesh per level, so light can run out to the tips
  const lv = Array.from({ length: levels + 1 }, () => k.sub(0, 0, 0));
  const b = k.shell;
  const tipsAt = [];
  const grow = (p, dir, len, rad, l) => {
    const e = p.clone().addScaledVector(dir, len);
    if (P.crystal) shard(b, p, dir, len * 1.05, rad, 5, mixHex(c.shellLo, c.shellHi, l / levels));
    else b.tube([p, p.clone().lerp(e, 0.5).add(new THREE.Vector3(0, len * 0.04, 0)), e], (t) => rad * (1 - t * 0.35), 5, mixHex(c.shellLo, c.shellHi, l / levels));
    lv[l].lit.ico(rad * 1.3, 0, mat(e.x, e.y, e.z), l % 2 ? c.second : c.light, PULSE);
    if (l >= levels) { tipsAt.push(e); return; }
    const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : Y).normalize();
    for (let i = 0; i < P.branch; i++) {
      const ax = side.clone().applyAxisAngle(dir, (i / P.branch) * TAU + l * 1.1 + R() * 0.3);
      const nd = dir.clone().applyAxisAngle(ax, 0.42 + R() * 0.25).normalize();
      if (shape === 'tree') nd.y += 0.25;
      grow(e, nd.normalize(), len * R.range(0.66, 0.78), rad * 0.64, l + 1);
    }
  };
  const L0 = (shape === 'burst' ? 9 : 17) * S * (mini ? 0.6 : 1);
  if (shape === 'tree') grow(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0), L0, 2.2 * S, 0);
  else if (shape === 'hanging') {
    const g = new THREE.ConeGeometry(12 * S, 16 * S, 8, 2);
    roughen(g, 1.6 * S, 3);
    g.rotateX(Math.PI);
    k.stone.add(g, mat(0, Hc + 8 * S, 0), c.stone[1]);
    k.stone.cyl(12.4 * S, 12 * S, 1.6 * S, 8, mat(0, Hc + 16 * S, 0), c.stone[3]);
    grow(new THREE.Vector3(0, Hc, 0), new THREE.Vector3(0, -1, 0), L0, 2 * S, 0);
  } else {
    for (const dv of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) grow(new THREE.Vector3(0, Hc, 0), new THREE.Vector3(...dv), L0, 1.6 * S, 1);
    k.lit.ico(3 * S, 1, mat(0, Hc, 0), c.second, PULSE);
  }
  // each tip flowers: a bead of light in a cup of small petals
  tipsAt.forEach((p, i) => {
    const f = mini ? 0.6 : 1;
    k.glow.ico(1 * S * f, 1, mat(p.x, p.y, p.z), mixHex(i % 2 ? c.light : c.second, 0xffffff, 0.35), 1);
    const tb = new Builder();
    for (let j = 0; j < 5; j++) petal(tb, 2.6 * S * f, 1.1 * S * f, 0.9, (j / 5) * TAU + i, 0.3 * S * f, 0, 0.4, 0.2, c.shellHi, mixHex(c.light, 0xffffff, 0.2), 3, 2);
    k.shell.merge(tb, new THREE.Matrix4().makeTranslation(p.x, p.y, p.z));
  });
  // the lit rings swell level by level, from the root out
  const mats = lv.map((x) => (x.litMat = art.unique()));
  art.updates.push((t, dt, ctx, beat) => {
    const at = (beat * 1.5) % (levels + 4);
    mats.forEach((m, l) => { m.uniforms.uPulse.value = 0.25 + Math.max(0, 1 - Math.abs(at - l) * 0.8) * 1.3; });
    if (shape === 'burst') k.group.rotation.y = t * 0.05;
  });
  let ext = 0, top = 0, low = Infinity;
  for (const p of tipsAt) { ext = Math.max(ext, Math.hypot(p.x, p.z)); top = Math.max(top, p.y); low = Math.min(low, p.y); }
  if (shape === 'hanging') top = Hc + 17 * S;
  const mid = (top + low) / 2;
  return { light: new THREE.Vector3(0, shape === 'tree' ? top * 0.6 : Hc, 0), focus: new THREE.Vector3(0, mid, 0), span: Math.max(ext, (top - low) * 0.5), height: top, solid: ext * 0.9, low: shape === 'tree' ? 0 : low };
}

function knot(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = mini ? 0 : 42 * S;
  const Rk = 15 * S * (mini ? 0.9 : 1), rt = 1.5 * S;
  const body = k.sub(0, H, 0);
  const tilt = R.range(0, 1.3);
  body.group.rotation.x = tilt;
  const curves = [];
  if (P.kind === 'torus') {
    const rk = Rk * 0.42;
    curves.push((t) => { const a = t * TAU; return new THREE.Vector3((Rk + rk * Math.cos(P.q * a)) * Math.cos(P.p * a), rk * Math.sin(P.q * a), (Rk + rk * Math.cos(P.q * a)) * Math.sin(P.p * a)); });
  } else if (P.kind === 'link') {
    const r = Rk * 0.7;
    curves.push((t) => new THREE.Vector3(Math.cos(t * TAU) * r - r * 0.5, Math.sin(t * TAU) * r, 0));
    curves.push((t) => new THREE.Vector3(Math.cos(t * TAU) * r + r * 0.5, 0, Math.sin(t * TAU) * r));
  } else if (P.kind === 'borromean') {
    const a = Rk, bb = Rk * 0.55;
    curves.push((t) => new THREE.Vector3(Math.cos(t * TAU) * a, Math.sin(t * TAU) * bb, 0));
    curves.push((t) => new THREE.Vector3(0, Math.cos(t * TAU) * a, Math.sin(t * TAU) * bb));
    curves.push((t) => new THREE.Vector3(Math.sin(t * TAU) * bb, 0, Math.cos(t * TAU) * a));
  } else {
    const [a, b2, cc] = P.lis;
    curves.push((t) => new THREE.Vector3(Math.cos(a * t * TAU + 0.3) * Rk, Math.cos(b2 * t * TAU + 0.7) * Rk, Math.cos(cc * t * TAU) * Rk));
  }
  const cols = [c.shellHi, mixHex(c.shellHi, c.second, 0.5), mixHex(c.shellHi, c.third, 0.5)];
  const flows = [];
  curves.forEach((f, i) => {
    const n = P.kind === 'torus' || P.kind === 'lissajous' ? 220 : 90;
    curveTube(body.shell, f, n, (t) => rt * (1 + 0.25 * Math.sin(t * TAU * 7)), 7, cols[i % 3]);
    // lit beads along it
    for (let j = 0; j < 12; j++) { const p = f(j / 12); body.lit.ico(rt * 1.3, 0, mat(p.x, p.y, p.z), [c.light, c.second, c.third][i % 3], PULSE); }
    const cl = cloud(art, body.group, mini ? 50 : 140, [c.light, c.second, c.third][i % 3], 1.4 * S, 1.2);
    flows.push({ f, cl, speed: 0.02 + R() * 0.02 });
  });
  if (!mini) bar(k.glow, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H, 0), 0.8 * S, mixHex(c.light, 0xffffff, 0.3), 0.6);
  art.updates.push((t) => {
    body.group.rotation.y = t * 0.08;
    body.group.rotation.x = tilt + Math.sin(t * 0.11) * 0.2;
    for (const { f, cl, speed } of flows) {
      const n = cl.pos.length / 3;
      for (let i = 0; i < n; i++) { const p = f(((i / n) + t * speed) % 1); cl.pos[i * 3] = p.x; cl.pos[i * 3 + 1] = p.y; cl.pos[i * 3 + 2] = p.z; }
      cl.attr.needsUpdate = true;
    }
  });
  return { light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H, 0), span: Rk * 1.45, height: H + Rk * 1.4, solid: Rk * 1.4, low: H - Rk * 1.4 };
}

function nautilus(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  if (P.kind === 'galaxy') {
    const H = mini ? 0 : 16 * S, Rg = (mini ? 16 : 34) * S;
    const g = k.sub(0, H, 0);
    g.shell.sphere(4.5 * S, 14, 8, mat(0, 0, 0, 0, 0, 0, 1, 0.45, 1), c.shellHi);
    g.glow.ico(3.2 * S, 2, null, mixHex(c.light, 0xffffff, 0.6), 1);
    const n = mini ? 600 : 2400;
    const sets = [c.light, c.second, c.third].map((col) => cloud(art, g.group, Math.floor(n / 3), col, 1.1 * S, 1.1));
    sets.forEach((cl, si) => {
      const m = cl.pos.length / 3;
      for (let i = 0; i < m; i++) {
        const arm = i % P.arms, u = Math.pow(R(), 0.6);
        const a = (arm / P.arms) * TAU + u * 5.5 + (R() - 0.5) * 0.5 * (1 - u * 0.5), r = 3 * S + u * Rg;
        cl.pos.set([Math.cos(a) * r + (R() - 0.5) * 2 * S, (R() - 0.5) * 2.2 * S * (1 - u), Math.sin(a) * r + (R() - 0.5) * 2 * S], i * 3);
      }
      cl.attr.needsUpdate = true;
    });
    for (let a = 0; a < P.arms; a++) curveTube(g.glow, (t) => { const ang = (a / P.arms) * TAU + t * 5.5, r = 3 * S + t * Rg; return new THREE.Vector3(Math.cos(ang) * r, 0, Math.sin(ang) * r); }, 60, (t) => (0.5 * (1 - t) + 0.1) * S, 3, mixHex(c.light, 0xffffff, 0.2), 0.6);
    art.updates.push((t) => { g.group.rotation.y = -t * 0.035; });
    return { light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H, 0), span: Rg, height: H + 6 * S, solid: 0, low: H - 3 * S };
  }
  // a shell: a log spiral, threefold each turn, a tube that grows with it
  const b = Math.log(3) / TAU, turns = P.turns, th1 = turns * TAU;
  const a0 = 1;
  const rOf = (th) => a0 * Math.exp(b * th);
  const scale = ((mini ? 12 : 26) * S) / (rOf(th1) * 1.45);
  const horn = P.kind === 'horn';
  const pts = [], rads = [];
  const N = 140;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * th1, r = rOf(th) * scale;
    pts.push(horn ? new THREE.Vector3(Math.cos(th) * r, (th1 - th) * 2.6 * S * (mini ? 0.5 : 1), Math.sin(th) * r) : new THREE.Vector3(Math.cos(th) * r, Math.sin(th) * r, 0));
    rads.push(r * (horn ? 0.55 : 0.46));
  }
  const s = k.sub(0, 0, 0);
  s.shell.tube(pts, (t) => rads[Math.round(t * N)], 12, (t) => mixHex(c.shellLo, c.shellHi, t));
  // its chambers: lit rings across the last turn
  for (let i = Math.floor(N * (1 - 1 / turns)); i < N; i += 6) {
    const p = pts[i], d = pts[Math.min(N, i + 1)].clone().sub(pts[Math.max(0, i - 1)]);
    s.lit.add(new THREE.TorusGeometry(rads[i] * 0.98, 0.18 * S, 3, 18), orient(p, d).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)), c.light, PULSE);
  }
  const mouth = pts[N];
  s.glow.ico(rads[N] * 0.4, 1, mat(mouth.x, mouth.y, mouth.z), mixHex(c.light, 0xffffff, 0.4), 1);
  // where it stands: on its edge (its lowest point on the ground), or the horn on its tip
  let minY = Infinity, maxY = -Infinity, ext = 0;
  pts.forEach((p, i) => { minY = Math.min(minY, p.y - rads[i]); maxY = Math.max(maxY, p.y + rads[i]); ext = Math.max(ext, Math.hypot(p.x, p.z) + rads[i]); });
  const lift = mini ? -(minY + maxY) / 2 : -minY + (horn ? 2 * S : 0);
  s.group.position.y = lift;
  art.updates.push((t) => { s.group.rotation.y = t * (horn ? 0.05 : 0.03); });
  return { light: new THREE.Vector3(mouth.x, mouth.y + lift, mouth.z), focus: new THREE.Vector3(0, (minY + maxY) / 2 + lift, 0), span: Math.max(ext, (maxY - minY) * 0.55), height: maxY + lift, solid: ext * 0.8 };
}

function archipelago(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const n = mini ? Math.min(5, P.islands) : P.islands;
  const groups = [k.sub(), k.sub(), k.sub()];
  const isl = [];
  for (let i = 0; i < n; i++) {
    const r = (i === 0 ? 13 : 4 + 9 * Math.pow(R(), 1.8)) * S * (mini ? 0.5 : 1);
    let x, y, z;
    if (P.layout === 'spiral') { const a = i * 2.4, d = 4 * S + i * 3.2 * S; x = Math.cos(a) * d; z = Math.sin(a) * d; y = 16 * S + i * 5.5 * S; }
    else if (P.layout === 'stair') { const a = i * 0.55, d = 26 * S; x = Math.cos(a) * d; z = Math.sin(a) * d; y = 12 * S + i * 6 * S; }
    else { const a = R() * TAU, d = Math.sqrt(R()) * 34 * S; x = Math.cos(a) * d; z = Math.sin(a) * d; y = R.range(16, 66) * S; }
    if (mini) { x *= 0.4; z *= 0.4; y = (y - 30 * S) * 0.4; }
    const g = groups[i % 3];
    const cone = new THREE.ConeGeometry(r, r * 1.7, 7, 3);
    roughen(cone, r * 0.12, i * 5 + 3);
    cone.rotateX(Math.PI);
    g.stone.add(cone, mat(x, y - r * 0.85, z), c.stone[i % 4]);
    g.stone.cyl(r * 1.02, r * 0.96, 0.8 * S, 7, mat(x, y + 0.1, z), mixHex(c.stone[3], c.third, 0.25));
    // small lights grown over its top, and its rim lit
    for (let j = 0; j < 3 + Math.floor(r / S); j++) { const a = R() * TAU, d = Math.sqrt(R()) * r * 0.85; g.glow.ico(0.35 * S, 0, mat(x + Math.cos(a) * d, y + 0.7 * S, z + Math.sin(a) * d), j % 2 ? c.light : c.second, 1); }
    g.glow.add(new THREE.TorusGeometry(r * 1.03, 0.1 * S, 3, 28), mat(x, y + 0.5 * S, z, Math.PI / 2, 0, 0), c.light, 0.7);
    // something on the larger ones: a lit stone, a crystal, a lamp
    if (r > 6 * S) {
      const kind = R.pick(['stone', 'crystal', 'lamp']);
      if (kind === 'stone') { g.stone.box(1.6 * S, 7 * S, 1 * S, mat(x, y + 3.5 * S, z, 0, R() * TAU, 0), c.stone[2]); g.lit.box(0.4 * S, 5 * S, 1.05 * S, mat(x, y + 3.5 * S, z), c.light, PULSE); }
      else if (kind === 'crystal') shard(g.shell, new THREE.Vector3(x, y, z), new THREE.Vector3(R() - 0.5, 2, R() - 0.5), 8 * S, 1.2 * S, 5, c.shellHi, 0, c.light);
      else { g.stone.cyl(0.3 * S, 0.4 * S, 6 * S, 5, mat(x, y + 3 * S, z), c.stone[3]); g.glow.ico(1.2 * S, 1, mat(x, y + 6.5 * S, z), mixHex(c.light, 0xffffff, 0.3), 1); }
    }
    isl.push({ x, y, z, r, g });
  }
  // light bridges, each to the next
  for (let i = 1; i < n; i++) {
    const a = isl[i - 1], b = isl[i];
    const pa = new THREE.Vector3(a.x, a.y + 0.6 * S, a.z), pb = new THREE.Vector3(b.x, b.y + 0.6 * S, b.z);
    const mid = pa.clone().lerp(pb, 0.5); mid.y -= pa.distanceTo(pb) * 0.08;
    k.glow.tube([pa, mid, pb], 0.16 * S, 3, mixHex(c.light, 0xffffff, 0.3), 0.7);
  }
  // falls of light from the edges of the largest
  const falls = isl.slice().sort((p, q) => q.r - p.r).slice(0, mini ? 1 : P.falls).map((s) => {
    const a = R() * TAU;
    return { x: s.x + Math.cos(a) * s.r * 0.9, z: s.z + Math.sin(a) * s.r * 0.9, top: s.y, bottom: mini ? s.y - 20 * S : art.ground(s.x, s.z) };
  });
  const per = mini ? 50 : 180;
  const fallCloud = falls.length ? cloud(art, k.group, falls.length * per, mixHex(c.light, 0xffffff, 0.3), 1.6 * S, 1.4) : null;
  const seeds = fallCloud ? Array.from({ length: falls.length * per }, () => [R(), R() - 0.5, R() - 0.5]) : [];
  art.updates.push((t) => {
    groups.forEach((g, i) => { g.group.position.y = Math.sin(t * 0.3 + i * 2.1) * 0.7 * S; });
    if (!fallCloud) return;
    for (let i = 0; i < seeds.length; i++) {
      const f = falls[Math.floor(i / per)], [ph, ox, oz] = seeds[i];
      const u = (ph + t * 0.18) % 1;
      cl(fallCloud, i, f.x + ox * 2 * S * (1 + u * 2), f.top - u * u * (f.top - f.bottom), f.z + oz * 2 * S * (1 + u * 2));
    }
    fallCloud.attr.needsUpdate = true;
  });
  const top = Math.max(...isl.map((s) => s.y)) + 8 * S, ext = Math.max(...isl.map((s) => Math.hypot(s.x, s.z) + s.r));
  const hi = isl.reduce((p, q) => (q.y > p.y ? q : p));
  return { light: new THREE.Vector3(hi.x, hi.y + 6 * S, hi.z), focus: new THREE.Vector3(0, mini ? 0 : top * 0.55, 0), span: Math.max(ext, top * 0.5), height: top, solid: ext, low: Math.min(...isl.map((q) => q.y - q.r * 1.7)) };
}
const cl = (c, i, x, y, z) => { c.pos[i * 3] = x; c.pos[i * 3 + 1] = y; c.pos[i * 3 + 2] = z; };

// strange attractors: the derivative, a step, where they are centered and how large
const ATTR = {
  lorenz: { f: (x, y, z) => [10 * (y - x), x * (28 - z) - y, x * y - (8 / 3) * z], dt: 0.006, c: [0, 0, 25], s: 1 / 26 },
  aizawa: { f: (x, y, z) => [(z - 0.7) * x - 3.5 * y, 3.5 * x + (z - 0.7) * y, 0.6 + 0.95 * z - (z * z * z) / 3 - (x * x + y * y) * (1 + 0.25 * z) + 0.1 * z * x * x * x], dt: 0.012, c: [0, 0, 0.6], s: 1 / 1.5 },
  thomas: { f: (x, y, z) => [Math.sin(y) - 0.208186 * x, Math.sin(z) - 0.208186 * y, Math.sin(x) - 0.208186 * z], dt: 0.06, c: [0, 0, 0], s: 1 / 4.2 },
  halvorsen: { f: (x, y, z) => [-1.89 * x - 4 * y - 4 * z - y * y, -1.89 * y - 4 * z - 4 * x - z * z, -1.89 * z - 4 * x - 4 * y - x * x], dt: 0.004, c: [-3, -3, -3], s: 1 / 9 },
  chen: { f: (x, y, z) => [-y - z, x + 0.2 * y, 0.2 + z * (x - 5.7)], dt: 0.025, c: [0, 0, 4], s: 1 / 12 },
  dadras: { f: (x, y, z) => [y - 3 * x + 2.7 * y * z, 1.7 * y - x * z + z, 2 * x * y - 9 * z], dt: 0.006, c: [0, 0, 0], s: 1 / 9 },
};
function step(A, p, h) {
  const k1 = A.f(p[0], p[1], p[2]);
  const k2 = A.f(p[0] + k1[0] * h * 0.5, p[1] + k1[1] * h * 0.5, p[2] + k1[2] * h * 0.5);
  p[0] += k2[0] * h; p[1] += k2[1] * h; p[2] += k2[2] * h;
}

function murmuration(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const A = ATTR[P.attractor];
  const H = mini ? 0 : 44 * S, size = (mini ? 9 : 22) * S;
  const body = k.sub(0, H, 0);
  body.group.rotation.set(R() * TAU, R() * TAU, 0);
  const to = (p, out) => out.set((p[0] - A.c[0]) * A.s * size, (p[1] - A.c[1]) * A.s * size, (p[2] - A.c[2]) * A.s * size);
  const p = [0.1 + R() * 0.1, 0.1, 0.1];
  for (let i = 0; i < 3000; i++) step(A, p, A.dt);
  // the path they all keep to, in the sheen
  const path = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < 2400; i++) { step(A, p, A.dt); if (i % 4 === 0) path.push(to(p, v).clone()); }
  body.shell.tube(path, 0.45 * S, 4, (t) => mixHex(c.shellLo, c.shellHi, 0.5 + 0.5 * Math.sin(t * TAU * 3)));
  // the motes, started along it at different moments
  const n = mini ? 600 : P.points;
  const sets = [c.light, c.second, c.third].map((col) => cloud(art, body.group, Math.floor(n / 3), mixHex(col, 0xffffff, 0.25), 1.6 * S, 1.4));
  const state = sets.map((cl2) => {
    const m = cl2.pos.length / 3, st = new Float64Array(m * 3);
    for (let i = 0; i < m; i++) { for (let j = 0; j < 5 + (i % 7); j++) step(A, p, A.dt); st.set(p, i * 3); }
    return st;
  });
  const q = [0, 0, 0];
  art.updates.push((t, dt) => {
    const h = A.dt * clamp(dt * 30, 0, 3);
    sets.forEach((cl2, si) => {
      const st = state[si], m = st.length / 3;
      for (let i = 0; i < m; i++) {
        q[0] = st[i * 3]; q[1] = st[i * 3 + 1]; q[2] = st[i * 3 + 2];
        step(A, q, h);
        if (!Number.isFinite(q[0]) || Math.abs(q[0]) > 1e3) { const r = path[(i * 13) % path.length]; q[0] = r.x / (A.s * size) + A.c[0]; q[1] = r.y / (A.s * size) + A.c[1]; q[2] = r.z / (A.s * size) + A.c[2]; }
        st[i * 3] = q[0]; st[i * 3 + 1] = q[1]; st[i * 3 + 2] = q[2];
        cl2.pos[i * 3] = (q[0] - A.c[0]) * A.s * size; cl2.pos[i * 3 + 1] = (q[1] - A.c[1]) * A.s * size; cl2.pos[i * 3 + 2] = (q[2] - A.c[2]) * A.s * size;
      }
      cl2.attr.needsUpdate = true;
    });
    body.group.rotation.y += dt * 0.04;
  });
  body.glow.ico(1.6 * S, 1, null, mixHex(c.light, 0xffffff, 0.5), 1);
  return { light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H, 0), span: size * 1.15, height: H + size * 1.1, solid: size, low: H - size * 1.1 };
}

function medusa(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const count = mini ? 1 : P.count;
  const bells = [];
  for (let m = 0; m < count; m++) {
    const sc = m === 0 ? 1 : R.range(0.45, 0.65);
    const Rb = 13 * S * sc * (mini ? 0.6 : 1);
    const a = (m / Math.max(1, count - 1)) * TAU;
    const off = m === 0 ? new THREE.Vector3() : new THREE.Vector3(Math.cos(a) * 26 * S, R.range(-14, 12) * S, Math.sin(a) * 26 * S);
    const H = (mini ? 0 : 52 * S) + off.y;
    const b = k.sub(off.x, H, off.z);
    const bellG = b.sub();
    const dome = new THREE.SphereGeometry(Rb, 22, 8, 0, TAU, 0, Math.PI * 0.42);
    dome.scale(1, 0.8, 1);
    bellG.shell.add(dome, null, (x, y) => mixHex(c.shellLo, c.shellHi, clamp(y / Rb, 0, 1)));
    bellG.glow.add(new THREE.SphereGeometry(Rb * 1.03, 22, 8, 0, TAU, 0, Math.PI * 0.44).scale(1, 0.8, 1), null, mixHex(c.light, 0xffffff, 0.2), 0.25);
    const ribs = 12;
    for (let i = 0; i < ribs; i++) {
      const pts = [];
      for (let j = 0; j <= 8; j++) { const th = (j / 8) * Math.PI * 0.42, ph = (i / ribs) * TAU; pts.push(new THREE.Vector3(Math.sin(th) * Math.cos(ph) * Rb * 1.01, Math.cos(th) * Rb * 0.8 * 1.01, Math.sin(th) * Math.sin(ph) * Rb * 1.01)); }
      bellG.lit.tube(pts, 0.18 * S * sc, 3, c.light, PULSE);
    }
    // its frilled rim, and the light inside
    const rimY = Math.cos(Math.PI * 0.42) * Rb * 0.8, rimR = Math.sin(Math.PI * 0.42) * Rb;
    for (let i = 0; i < 24; i++) petal(bellG.shell, 3.2 * S * sc, 1.6 * S * sc, Math.PI - 0.5, (i / 24) * TAU, rimR * 0.98, rimY, 0.4, 0.2, c.shellHi, c.shellLo, 4, 2);
    bellG.glow.ico(Rb * 0.32, 2, mat(0, Rb * 0.25, 0), mixHex(c.second, 0xffffff, 0.3), 1);
    bellG.lit.ico(Rb * 0.18, 1, mat(0, Rb * 0.25, 0), c.light, PULSE);
    // its arms: ribbons of light, trailing and swaying
    const T = Math.round(P.tentacles * (m === 0 ? 1 : 0.6)), M = 14, L = (40 + R() * 20) * S * sc * (mini ? 0.5 : 1);
    const arms = strips(art, b.group, T + 4, M, (s, u) => mixHex(s < T ? c.light : c.second, c.third, u * 0.6), (s, u) => (1 - u) * (s < T ? 0.9 : 1), 0.85);
    const roots = Array.from({ length: T + 4 }, (_, s) => (s < T ? { a: (s / T) * TAU, r: rimR * 0.92, w: 0.8 * S * sc, L } : { a: ((s - T) / 4) * TAU + 0.4, r: Rb * 0.18, w: 2.2 * S * sc, L: L * 0.6 }));
    bells.push({ b, bellG, arms, roots, rimY, M, H, ph: R() * TAU, sc });
  }
  art.updates.push((t) => {
    for (const B of bells) {
      const sw = Math.sin(t * 1.1 + B.ph);
      B.bellG.group.scale.set(1 + sw * 0.06, 1 - sw * 0.08, 1 + sw * 0.06);
      B.b.group.position.y = B.H + Math.sin(t * 0.45 + B.ph) * 2 * S;
      B.roots.forEach((r, s) => {
        const cx = Math.cos(r.a), cz = Math.sin(r.a), tx = -cz, tz = cx;
        for (let i = 0; i < B.M; i++) {
          const u = i / (B.M - 1), y = B.rimY - u * r.L;
          const amp = u * u * 6 * S * B.sc;
          const ox = Math.sin(t * 0.8 + s * 0.9 + u * 3.2) * amp, oz = Math.cos(t * 0.6 + s * 1.3 + u * 2.6) * amp;
          const x = cx * r.r * (1 - u * 0.25) + ox, z = cz * r.r * (1 - u * 0.25) + oz, w = r.w * (1 - u * 0.75);
          B.arms.set(s, i, x - tx * w, y, z - tz * w, x + tx * w, y, z + tz * w);
        }
      });
      B.arms.commit();
    }
  });
  const H0 = mini ? 0 : 52 * S, Rb0 = 13 * S * (mini ? 0.6 : 1);
  return { light: new THREE.Vector3(0, H0 + Rb0 * 0.25, 0), focus: new THREE.Vector3(0, H0 - 10 * S, 0), span: count > 1 ? 36 * S : Rb0 * 1.6, height: H0 + Rb0 * 0.85, solid: Rb0, low: H0 - 3 * S };
}

function sun(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = mini ? 0 : 48 * S, Rc = (mini ? 4 : 6.5) * S;
  const core = k.sub(0, H, 0);
  core.glow.ico(Rc * 1.15, 2, null, mixHex(c.light, 0xffffff, 0.55), 0.8);
  core.lit.ico(Rc, 2, null, c.second, PULSE);
  // prominences: arcs of light on its face
  for (let i = 0; i < P.arcs; i++) {
    const r = R.range(2, 4) * S * (mini ? 0.6 : 1);
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(R() * TAU, R() * TAU, R() * TAU)).multiply(new THREE.Matrix4().makeTranslation(0, Rc * 0.95, 0));
    core.glow.add(new THREE.TorusGeometry(r, 0.45 * S, 4, 16, Math.PI), m, mixHex(c.light, c.second, 0.5), 1);
  }
  const planes = [];
  const per = Math.round((mini ? 60 : P.plates) / P.planes);
  for (let pl = 0; pl < P.planes; pl++) {
    const w = k.sub(0, H, 0);
    w.group.rotation.set(R() * Math.PI, R() * TAU, R() * 0.6);
    const r = Rc * (2 + pl * 0.75);
    for (let i = 0; i < per; i++) {
      const a = (i / per) * TAU + R() * 0.05;
      const p = new THREE.Vector3(Math.cos(a) * r, (R() - 0.5) * 1.2 * S, Math.sin(a) * r);
      const m = orient(p, p.clone().negate());
      w.stone.add(new THREE.CylinderGeometry(1.1 * S, 1.1 * S, 0.22 * S, 6), m, c.stone[pl % 4]);
      w.lit.add(new THREE.CylinderGeometry(0.9 * S, 0.9 * S, 0.06 * S, 6), m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.13 * S, 0)), c.light, 1);
    }
    w.glow.add(new THREE.TorusGeometry(r, 0.06 * S, 3, 80), mat(0, 0, 0, Math.PI / 2, 0, 0), c.second, 0.5);
    planes.push({ w, speed: (0.1 + R() * 0.1) / (1 + pl * 0.3) * (pl % 2 ? -1 : 1) });
  }
  if (!mini) bar(k.glow, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, H - Rc, 0), 1.2 * S, c.light, 0.6);
  art.updates.push((t) => {
    for (const p of planes) p.w.group.rotation.y = t * p.speed;
    core.group.rotation.y = t * 0.15;
    core.group.scale.setScalar(1 + Math.sin(t * 2.2) * 0.03);
  });
  const ext = Rc * (2 + (P.planes - 1) * 0.75) + 2 * S;
  return { light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H, 0), span: ext, height: H + ext, solid: ext, low: H - ext };
}

function watcher(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = mini ? 0 : 44 * S, Re = (mini ? 6 : 13) * S;
  const eyes = [];
  const makeEye = (kit, r, lids) => {
    const eye = kit.sub(0, 0, 0);
    eye.stone.sphere(r, 20, 14, null, (x, y, z) => mixHex(0xb9c0bc, c.stone[3], clamp(-z / r, 0, 1) * 0.8));
    const iris = eye.sub(0, 0, r * 0.93);
    const n = P.iris;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, a2 = a + (TAU / n) * 0.8;
      const r0 = r * 0.24, r1 = r * 0.64;
      iris.lit.quad([Math.cos(a) * r0, Math.sin(a) * r0, 0.05], [Math.cos(a) * r1, Math.sin(a) * r1, -r * 0.12], [Math.cos(a2) * r1, Math.sin(a2) * r1, -r * 0.12], [Math.cos(a2) * r0, Math.sin(a2) * r0, 0.05], [c.light, c.second, c.third][i % 3], i % 2 ? PULSE : 1);
    }
    iris.glow.add(new THREE.TorusGeometry(r * 0.66, 0.05 * r, 3, 48), mat(0, 0, -r * 0.13), c.light, 1);
    if (P.slit) iris.stone.box(r * 0.12, r * 0.42, r * 0.06, mat(0, 0, 0.1), 0x050508);
    else iris.stone.cyl(r * 0.22, r * 0.22, r * 0.06, 16, mat(0, 0, 0.1, Math.PI / 2, 0, 0), 0x050508);
    iris.glow.ico(r * 0.05, 0, mat(r * 0.06, r * 0.06, 0.25), 0xffffff, 1);
    let lid = null;
    if (lids) {
      lid = [eye.sub(), eye.sub()];
      lid[0].shell.sphere(r * 1.05, 20, 6, null, c.shellHi, 0, 0, TAU, 0, Math.PI * 0.3);
      lid[1].shell.sphere(r * 1.05, 20, 6, null, c.shellLo, 0, 0, TAU, Math.PI * 0.7, Math.PI * 0.3);
    }
    return { eye, iris, lid, next: 2 + R() * 6, blink: 0 };
  };
  const main = k.sub(0, H, 0);
  eyes.push({ ...makeEye(main, Re, true), k: main, orbit: null });
  for (let i = 0; i < (mini ? 0 : P.eyes); i++) {
    const s = k.sub(0, H, 0);
    eyes.push({ ...makeEye(s, Re * 0.28, true), k: s, orbit: { r: Re * 2.1, ph: (i / P.eyes) * TAU, tilt: R.range(-0.5, 0.5), sp: 0.15 + R() * 0.1 } });
  }
  if (!mini) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(Math.sin(t * 3) * 4 * S * t, t * (H - Re), Math.cos(t * 2.5) * 3 * S * t)); }
    k.stone.tube(pts, (t) => (2.8 - t * 1.6) * S, 7, c.stone[1]);
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU; const p = new THREE.Vector3(Math.cos(a) * 16 * S, 0, Math.sin(a) * 16 * S); p.y = art.ground(p.x, p.z) + 0.3; bar(k.glow, new THREE.Vector3(0, 0.3, 0), p, 0.35 * S, c.light, 0.8); }
  }
  const look = new THREE.Vector3();
  art.updates.push((t, dt, ctx) => {
    for (const E of eyes) {
      if (E.orbit) {
        const o = E.orbit, a = o.ph + t * o.sp;
        E.k.group.position.set(Math.cos(a) * o.r, H + Math.sin(a * 2 + o.tilt) * o.r * 0.3, Math.sin(a) * o.r);
      }
      E.iris.group.rotation.z = t * 0.2;
      if (ctx.shipLocal) {
        look.copy(ctx.shipLocal).sub(E.k.group.position);
        const yaw = Math.atan2(look.x, look.z), pitch = -Math.atan2(look.y, Math.hypot(look.x, look.z));
        E.eye.group.rotation.y += (yaw - E.eye.group.rotation.y) * Math.min(1, dt * 2);
        E.eye.group.rotation.x += (pitch - E.eye.group.rotation.x) * Math.min(1, dt * 2);
      }
      E.next -= dt;
      if (E.next <= 0) { E.blink = 1; E.next = 3 + R() * 8; }
      E.blink = Math.max(0, E.blink - dt * 4);
      const shut = Math.sin(E.blink * Math.PI);
      if (E.lid) { E.lid[0].group.rotation.x = -0.35 + shut * 1.3; E.lid[1].group.rotation.x = 0.35 - shut * 1.3; }
    }
  });
  return { light: new THREE.Vector3(0, H, Re), focus: new THREE.Vector3(0, H, 0), span: P.eyes && !mini ? Re * 2.6 : Re * 1.5, height: H + Re * (P.eyes && !mini ? 2.2 : 1.1), solid: P.eyes && !mini ? Re * 2.4 : Re * 1.2 };
}

// ------------------------------------------------------------------ the mountains' forms
// Found only where a deep one rises on a range: set on the summit, reaching down into the
// stone, or hanging over it.

// a tube whose spine moves: its rings rewritten every frame (the serpent's body)
function liveTube(k, art, N, seg, colorOf) {
  const nv = (N - 1) * seg * 6;
  const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), em = new Float32Array(nv);
  const cc = new THREE.Color();
  let o = 0;
  for (let i = 0; i < N - 1; i++) { cc.setHex(colorOf(i / (N - 1))); for (let q = 0; q < seg * 6; q++) col.set([cc.r, cc.g, cc.b], 3 * o++); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const mesh = new THREE.Mesh(g, art.mats.shell);
  mesh.frustumCulled = false;
  k.group.add(mesh);
  const C = Array.from({ length: N }, () => new THREE.Vector3()), Rad = new Float32Array(N), ring = new Float32Array(N * seg * 3);
  const up = new THREE.Vector3(0, 1, 0), tng = new THREE.Vector3(), side = new THREE.Vector3(), nrm = new THREE.Vector3();
  return {
    set(i, p, r) { C[i].copy(p); Rad[i] = r; },
    commit() {
      for (let i = 0; i < N; i++) {
        tng.subVectors(C[Math.min(N - 1, i + 1)], C[Math.max(0, i - 1)]).normalize();
        side.crossVectors(tng, up);
        if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
        side.normalize();
        nrm.crossVectors(side, tng).normalize();
        for (let s2 = 0; s2 < seg; s2++) {
          const a = (s2 / seg) * TAU, ca = Math.cos(a) * Rad[i], sa = Math.sin(a) * Rad[i], j = (i * seg + s2) * 3;
          ring[j] = C[i].x + side.x * ca + nrm.x * sa; ring[j + 1] = C[i].y + side.y * ca + nrm.y * sa; ring[j + 2] = C[i].z + side.z * ca + nrm.z * sa;
        }
      }
      let q = 0;
      const put = (i, s2) => { const j = (i * seg + (s2 % seg)) * 3; pos[q++] = ring[j]; pos[q++] = ring[j + 1]; pos[q++] = ring[j + 2]; };
      for (let i = 0; i < N - 1; i++) for (let s2 = 0; s2 < seg; s2++) { put(i, s2); put(i + 1, s2); put(i + 1, s2 + 1); put(i, s2); put(i + 1, s2 + 1); put(i, s2 + 1); }
      g.attributes.position.needsUpdate = true;
    },
  };
}

function spire(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = (mini ? 24 : 60 + R() * 22) * S, y0 = mini ? -H * 0.45 : -6 * S, f = mini ? 0.6 : 1;
  if (!mini) {
    // a collar of broken rock, where it came up through the summit
    const g = new THREE.ConeGeometry(12 * S, 10 * S, 9, 2);
    roughen(g, 2 * S, 17);
    k.stone.add(g, mat(0, 0, 0), c.stone[1]);
  }
  shard(k.shell, new THREE.Vector3(0, y0, 0), new THREE.Vector3(0, 1, 0), H, 4.6 * S * f, P.facets, c.shellHi, 0, mixHex(c.light, 0xffffff, 0.4));
  bar(k.glow, new THREE.Vector3(0, y0 + 4 * S, 0), new THREE.Vector3(0, y0 + H * 0.85, 0), 1.3 * S * f, mixHex(c.light, 0xffffff, 0.45), 1);
  const n = mini ? 6 : P.shards;
  for (let i = 0; i < n; i++) {
    const a = i * GOLDEN, dir = new THREE.Vector3(Math.cos(a), 0.5 + R() * 0.9, Math.sin(a));
    const L = H * (0.18 + R() * 0.3);
    shard(k.shell, new THREE.Vector3(Math.cos(a) * 3 * S * f, y0 + (2 + R() * 4) * S * f, Math.sin(a) * 3 * S * f), dir, L, L * 0.09, R.pick([5, 6]), mixHex(c.shellLo, c.shellHi, R()), 0, R() < 0.4 ? c.light : null);
  }
  const rings = [];
  for (let i = 0; i < P.rings; i++) {
    const w = k.sub(0, y0 + H * (0.3 + (0.45 * (i + 0.5)) / P.rings), 0);
    const r = (9 - i * 1.5) * S * f;
    w.glow.add(new THREE.TorusGeometry(r, 0.18 * S, 3, 60), mat(0, 0, 0, Math.PI / 2, 0, 0), [c.light, c.second, c.third][i % 3], 0.9);
    for (let j = 0; j < 8; j++) { const a = (j / 8) * TAU; w.lit.box(0.8 * S * f, 0.8 * S * f, 0.8 * S * f, mat(Math.cos(a) * r, 0, Math.sin(a) * r, a, a, 0), [c.light, c.second][j % 2], PULSE); }
    w.group.rotation.set(R.range(-0.3, 0.3), 0, R.range(-0.3, 0.3));
    rings.push({ w, sp: (0.12 + R() * 0.1) * (i % 2 ? -1 : 1) });
  }
  art.updates.push((t) => { for (const r of rings) r.w.group.rotation.y = t * r.sp; });
  return { light: new THREE.Vector3(0, y0 + H * 0.7, 0), focus: new THREE.Vector3(0, y0 + H * 0.45, 0), span: Math.max(H * 0.42, 14 * S * f), height: y0 + H, solid: 10 * S * f, low: 0 };
}

function temple(k, P, S, art, mini) {
  const c = art.pal, f = mini ? 0.45 : 1;
  const Hc = mini ? 0 : 52 * S, W0 = 26 * S * f, th = 3.2 * S * f;
  const t = k.sub(0, Hc, 0);
  // the rock it was lifted on, hanging under it
  const g = new THREE.ConeGeometry(W0 * 0.62, W0 * 0.9, 8, 3);
  roughen(g, W0 * 0.06, 23);
  g.rotateX(Math.PI);
  t.stone.add(g, mat(0, -W0 * 0.45, 0), c.stone[1]);
  const round = P.shape === 'round';
  for (let i = 0; i < P.tiers; i++) {
    const w = W0 * (1 - i / (P.tiers + 1)), y = i * th + th / 2;
    if (round) t.stone.cyl(w * 0.55, w * 0.58, th, 16, mat(0, y, 0), c.stone[i % 4]);
    else t.stone.box(w, th, w, mat(0, y, 0), c.stone[i % 4]);
    // a lit lip on every tier, and a band of the sheen on every other
    if (round) t.lit.add(new THREE.TorusGeometry(w * 0.58, 0.18 * S * f, 3, 32), mat(0, y + th / 2, 0, Math.PI / 2, 0, 0), c.light, PULSE);
    else for (let q = 0; q < 4; q++) { const a = (q / 4) * TAU; t.lit.box(w, 0.25 * S * f, 0.25 * S * f, mat(Math.cos(a) * w / 2, y + th / 2, Math.sin(a) * w / 2, 0, -a + Math.PI / 2, 0), c.light, PULSE); }
    if (i % 2 === 0) { if (round) t.shell.cyl(w * 0.565, w * 0.565, th * 0.3, 16, mat(0, y, 0), c.shellHi); else t.shell.box(w * 1.01, th * 0.3, w * 1.01, mat(0, y, 0), c.shellHi); }
  }
  const top = P.tiers * th;
  // the shrine on top: a cell of the sheen with a light in it, and a point over it
  t.shell.box(4 * S * f, 4 * S * f, 4 * S * f, mat(0, top + 2 * S * f, 0), c.shellHi);
  t.glow.ico(2.4 * S * f, 1, mat(0, top + 2.2 * S * f, 0), mixHex(c.light, 0xffffff, 0.5), 1);
  t.stone.cone(2.4 * S * f, 7 * S * f, 4, mat(0, top + 7.5 * S * f, 0, 0, Math.PI / 4, 0), c.stone[3]);
  // stairs of light down to the stone
  if (!mini) for (let q = 0; q < P.stairs; q++) {
    const a = (q / P.stairs) * TAU + 0.3, dx = Math.cos(a), dz = Math.sin(a);
    const x0 = dx * W0 * 0.5, z0 = dz * W0 * 0.5, y0 = Hc + th * 0.5, run = Hc * 1.1;
    const x1 = x0 + dx * run, z1 = z0 + dz * run, y1 = art.ground(x1, z1);
    for (let j = 0; j < 26; j++) { const u = j / 26; t.glow.box(3.2 * S, 0.25 * S, 1.6 * S, mat(x0 + (x1 - x0) * u, y0 - Hc + (y1 - y0) * u, z0 + (z1 - z0) * u, 0, -a + Math.PI / 2, 0), mixHex(c.light, 0xffffff, 0.3), 0.85); }
  }
  art.updates.push((tt) => { t.group.position.y = Hc + Math.sin(tt * 0.35) * 1.2 * S * f; });
  return { light: new THREE.Vector3(0, Hc + top + 2 * S * f, 0), focus: new THREE.Vector3(0, Hc + top * 0.4, 0), span: W0 * 0.85, height: Hc + top + 11 * S * f, solid: W0 * 0.6, low: Hc - W0 * 0.9 };
}

function halo(k, P, S, art, mini) {
  const R = art.R, c = art.pal, f = mini ? 0.4 : 1;
  const Hc = mini ? 0 : 58 * S, Rr = 28 * S * f;
  const ring = k.sub(0, Hc, 0);
  ring.group.rotation.x = P.tilt;
  const spin = ring.sub();
  spin.stone.add(new THREE.TorusGeometry(Rr, 1.3 * S * f, 6, 96), mat(0, 0, 0, Math.PI / 2, 0, 0), c.stone[2]);
  spin.shell.add(new THREE.CylinderGeometry(Rr, Rr, 2.2 * S * f, 96, 1, true), null, c.shellHi);
  for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; spin.lit.box(0.6 * S * f, 1.6 * S * f, 0.3 * S * f, mat(Math.cos(a) * Rr * 1.02, 0, Math.sin(a) * Rr * 1.02, 0, -a + Math.PI / 2, 0), i % 3 ? c.light : c.second, i % 2 ? PULSE : 1); }
  const n = mini ? 10 : P.pendants;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.1, L = (6 + R() * 12) * S * f;
    const p = new THREE.Vector3(Math.cos(a) * Rr, -1.4 * S * f, Math.sin(a) * Rr);
    shard(spin.shell, p, new THREE.Vector3(0, -1, 0), L, L * 0.08, 5, mixHex(c.shellLo, c.shellHi, R()), 0, c.light);
    spin.glow.ico(0.5 * S * f, 0, mat(p.x, p.y - L, p.z), c.light, 1);
    // and from every third, light falling on to the stone
    if (!mini && i % 3 === 0) bar(spin.glow, new THREE.Vector3(p.x, p.y - L, p.z), new THREE.Vector3(p.x, p.y - L - Hc * 1.1, p.z), 0.35 * S, mixHex(c.light, 0xffffff, 0.2), 0.35);
  }
  for (let r = 1; r < P.rings; r++) ring.glow.add(new THREE.TorusGeometry(Rr * (1 + r * 0.12), 0.14 * S * f, 3, 96), mat(0, r * 1.5 * S * f, 0, Math.PI / 2, 0, 0), [c.second, c.third][r % 2], 0.8);
  art.updates.push((t) => { spin.group.rotation.y = t * 0.05; ring.group.position.y = Hc + Math.sin(t * 0.3) * 1.5 * S * f; });
  return { light: new THREE.Vector3(0, Hc, 0), focus: new THREE.Vector3(0, Hc - 6 * S * f, 0), span: Rr * 1.15, height: Hc + 6 * S * f, solid: Rr * 1.05, low: Hc - 22 * S * f };
}

function loom(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const H = (mini ? 20 : 48) * S, Wf = (mini ? 10 : 22) * S;
  const frames = mini ? 1 : P.frames;
  const all = [];
  for (let fi = 0; fi < frames; fi++) {
    const a = (fi - (frames - 1) / 2) * 0.9;
    const fr = k.sub(Math.sin(a) * Wf * 1.1, mini ? -H / 2 : 0, (1 - Math.cos(a)) * Wf * 0.4);
    fr.group.rotation.y = -a;
    for (const q of [-1, 1]) { fr.stone.box(2.2 * S, H + 6, 2.2 * S, mat(q * Wf / 2, H / 2 - 3, 0), c.stone[2]); fr.lit.box(2.4 * S, 0.6 * S, 2.4 * S, mat(q * Wf / 2, H * 0.7, 0), c.light, PULSE); }
    fr.stone.box(Wf + 4 * S, 2 * S, 2.6 * S, mat(0, H, 0), c.stone[3]);
    fr.shell.box(Wf + 4.4 * S, 0.6 * S, 2.8 * S, mat(0, H - 1 * S, 0), c.shellHi);
    // ribbons of aurora hung from the beam, moving in no wind
    const n = mini ? 5 : P.ribbons, M = 18;
    const st = strips(art, fr.group, n, M, (q, u, side) => mixHex(side ? c.third : c.light, c.second, u), (q, u, side) => Math.pow(1 - u, 0.6) * (0.4 + 0.3 * ((q * 7) % 3)) * (side ? 0.6 : 1), 0.55);
    all.push({ st, n, M, ph: R() * TAU });
  }
  art.updates.push((t) => {
    for (const L of all) {
      for (let q = 0; q < L.n; q++) {
        const x0 = ((q + 0.5) / L.n - 0.5) * Wf * 0.9, w = (Wf / L.n) * 0.42;
        for (let i = 0; i < L.M; i++) {
          const u = i / (L.M - 1), y = H - 1.5 * S - u * H * 0.85;
          const sway = Math.sin(t * 0.7 + q * 0.8 + u * 3 + L.ph) * u * 2.4 * S, dz = Math.cos(t * 0.5 + q * 1.3 + u * 2.2) * u * 3 * S;
          L.st.set(q, i, x0 - w + sway, y, dz, x0 + w + sway, y, dz);
        }
      }
      L.st.commit();
    }
  });
  const wide = Wf * (frames > 1 ? 1.4 : 0.7);
  return { light: new THREE.Vector3(0, mini ? 0 : H * 0.6, 0), focus: new THREE.Vector3(0, mini ? 0 : H * 0.5, 0), span: Math.max(wide, H * 0.5), height: (mini ? H / 2 : H) + 2 * S, solid: wide * 0.85, low: 0 };
}

function storm(k, P, S, art, mini) {
  const R = art.R, c = art.pal, f = mini ? 0.42 : 1;
  const Hc = mini ? 0 : 66 * S, Rr = 26 * S * f;
  const ring = k.sub(0, Hc, 0);
  const n = mini ? 12 : P.clouds;
  // its clouds: storm grey above, lit from within below
  const grey = mixHex(c.stone[3], 0xaab0bc, 0.65), under = mixHex(grey, c.light, 0.35), at = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.2, rr = Rr * (0.8 + R() * 0.4), y = (R() - 0.5) * 6 * S * f, r0 = (3 + R() * 4) * S * f;
    // a broad puff, and smaller ones heaped on it
    const puffs = [[0, 0, 0, r0, 0.6]];
    for (let j = R.int(1, 2); j > 0; j--) puffs.push([(R() - 0.5) * r0 * 1.4, r0 * (0.35 + R() * 0.2), (R() - 0.5) * r0, r0 * (0.5 + R() * 0.2), 0.85]);
    for (const [dx, dy, dz, rp, sy] of puffs) {
      const g = new THREE.IcosahedronGeometry(rp, rp === r0 ? 2 : 1);
      roughen(g, 0.4 * S * f, i);
      const lo = (y2) => clamp((-0.15 * rp - y2) / (rp * 0.8), 0, 1);
      ring.stone.add(g, mat(Math.cos(a) * rr + dx, y + dy, Math.sin(a) * rr + dz, 0, R() * TAU, 0, 1.4, sy, 1.15), (x, y2) => mixHex(grey, under, lo(y2)), (x, y2) => 0.3 * lo(y2), { flat: true });
    }
    at.push([Math.cos(a) * rr, y - 1.5 * S * f, Math.sin(a) * rr]);
  }
  // the light inside them, that flares with each bolt
  const inner = cloud(art, ring.group, at.length, mixHex(c.light, 0xffffff, 0.5), 15 * S * f, 0);
  at.forEach((p, i) => inner.pos.set(p, i * 3));
  inner.attr.needsUpdate = true;
  const flare = art.fades[art.fades.length - 1];
  // its eye: a disc of light turning at its heart
  const re = Rr * 0.45, rr0 = (x, y) => Math.min(1, Math.hypot(x, y) / re);
  ring.glow.add(new THREE.RingGeometry(0.01, re, 40, 4), mat(0, 0, 0, -Math.PI / 2, 0, 0), (x, y) => mixHex(mixHex(c.light, 0xffffff, 0.4), c.second, rr0(x, y)), (x, y) => 0.1 + 0.7 * Math.pow(1 - rr0(x, y), 2));
  // lightning: a bolt at a time, from the crown down to the stone
  const bolt = strips(art, k.group, 1, 12, () => mixHex(c.light, 0xffffff, 0.7), () => 1, 0);
  const fade = art.fades[art.fades.length - 1];
  let next = 1, life = 0;
  art.updates.push((t, dt) => {
    ring.group.rotation.y = t * 0.12;
    next -= dt;
    life -= dt;
    if (next <= 0 && !mini) {
      next = P.bolts * (0.5 + R());
      life = 0.22;
      const a = R() * TAU, from = new THREE.Vector3(Math.cos(a) * Rr * 0.8, Hc - 2 * S, Math.sin(a) * Rr * 0.8), to = new THREE.Vector3((R() - 0.5) * 8 * S, art.ground(0, 0) + 1, (R() - 0.5) * 8 * S);
      for (let i = 0; i < 12; i++) {
        const u = i / 11, p = from.clone().lerp(to, u), j = Math.sin(Math.PI * u) * 6 * S;
        p.x += (R() - 0.5) * j; p.z += (R() - 0.5) * j;
        bolt.set(0, i, p.x - 0.5 * S, p.y, p.z, p.x + 0.5 * S, p.y, p.z);
      }
      bolt.commit();
    }
    fade[1] = life > 0 ? 1.2 : 0;
    flare[1] = 0.12 + 0.6 * Math.max(0, life / 0.22) + (life > -0.3 && life < -0.18 ? 0.4 : 0);
  });
  return { light: new THREE.Vector3(0, Hc, 0), focus: new THREE.Vector3(0, mini ? 0 : Hc * 0.6, 0), span: Rr * 1.2, height: Hc + 6 * S * f, solid: Rr * 1.1, low: Hc - 8 * S * f };
}

function serpent(k, P, S, art, mini) {
  const c = art.pal, f = mini ? 0.4 : 1;
  const N = mini ? 60 : 140, H0 = mini ? -10 * S : 14 * S, Hs = 70 * S * f, Rr = 24 * S * f;
  const body = liveTube(k, art, N, 7, (u) => mixHex(c.shellLo, c.shellHi, 0.5 + 0.5 * Math.sin(u * 30)));
  const head = k.sub();
  head.shell.cone(2.4 * S * f, 6 * S * f, 6, mat(0, 0, 2 * S * f, Math.PI / 2, 0, 0), c.shellHi);
  for (const q of [-1, 1]) head.glow.ico(0.6 * S * f, 0, mat(q * 1.1 * S * f, 0.8 * S * f, 1 * S * f), mixHex(c.light, 0xffffff, 0.5), 1);
  // light along its back
  const lights = cloud(art, k.group, mini ? 20 : 48, mixHex(c.light, 0xffffff, 0.3), 1.2 * S * f, 1.2);
  const path = (u, t) => {
    const ph = u * P.coils * TAU - t * 0.25, r = Rr * (0.75 + 0.25 * Math.sin(u * 5 + t * 0.3));
    return new THREE.Vector3(Math.cos(ph) * r, H0 + u * Hs + Math.sin(u * 9 + t) * 2 * S * f, Math.sin(ph) * r);
  };
  const look = new THREE.Vector3();
  art.updates.push((t) => {
    for (let i = 0; i < N; i++) { const u = i / (N - 1); body.set(i, path(u, t), 1.7 * S * f * Math.sin(Math.PI * Math.pow(u, 0.7)) + 0.2 * S * f); }
    body.commit();
    const nl = lights.pos.length / 3;
    for (let i = 0; i < nl; i++) { const p = path((i + 0.5) / nl, t); lights.pos[i * 3] = p.x; lights.pos[i * 3 + 1] = p.y + 1.8 * S * f; lights.pos[i * 3 + 2] = p.z; }
    lights.attr.needsUpdate = true;
    const p = path(1, t), q = path(0.985, t);
    head.group.position.copy(p);
    look.subVectors(p, q);
    head.group.rotation.set(-Math.atan2(look.y, Math.hypot(look.x, look.z)), Math.atan2(look.x, look.z), 0, 'YXZ');
  });
  return { light: new THREE.Vector3(0, H0 + Hs * 0.5, 0), focus: new THREE.Vector3(0, H0 + Hs * 0.5, 0), span: Math.max(Rr * 1.3, Hs * 0.55), height: H0 + Hs + 4 * S * f, solid: Rr * 1.1, low: H0 - 4 * S * f };
}

function cathedral(k, P, S, art, mini) {
  const c = art.pal, f = mini ? 0.4 : 1;
  const bayL = 9 * S * f, Wn = 16 * S * f, Hn = 34 * S * f, nb = mini ? 3 : P.bays;
  const y0 = mini ? -Hn / 2 : -3 * S, L = nb * bayL;
  const n = k.sub(0, 0, -L / 2);
  const ice = (t) => mixHex(c.shellLo, c.shellHi, t);
  // a pointed arch across the nave at z (u: 1 at its feet, 0 at its point)
  const arch = (z, w, h, rot = 0) => {
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20, q = t < 0.5 ? -1 : 1, u = Math.abs(t - 0.5) * 2;
      const x = q * (w / 2) * Math.pow(u, 0.55), y = y0 + h * (1 - Math.pow(u, 1.8));
      pts.push(new THREE.Vector3(x * Math.cos(rot), y, z + x * Math.sin(rot)));
    }
    return pts;
  };
  for (let b = 0; b <= nb; b++) {
    const z = b * bayL;
    n.shell.tube(arch(z, Wn, Hn), 0.9 * S * f, 6, ice);
    n.glow.tube(arch(z, Wn * 0.94, Hn * 0.97), 0.14 * S * f, 3, mixHex(c.light, 0xffffff, 0.3), 0.8);
  }
  // ribs along it: at its point, and down each side
  for (const [x, y] of [[0, y0 + Hn], [-Wn * 0.38, y0 + Hn * 0.62], [Wn * 0.38, y0 + Hn * 0.62]]) n.shell.tube([new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y, L)], 0.6 * S * f, 5, ice(0.7));
  // the apse: arches turned about the far end
  for (let j = 0; j < 5; j++) { const a = -Math.PI / 2 + (j / 4) * Math.PI; n.shell.tube(arch(L, Wn, Hn * 0.9, a), 0.8 * S * f, 6, ice); }
  // the rose window over its front
  const rw = n.sub(0, y0 + Hn * 0.6, -0.5 * S);
  rw.glow.add(new THREE.CircleGeometry(Wn * 0.3, 32), null, mixHex(c.light, 0xffffff, 0.4), 0.55);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; bar(rw.glow, new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(Math.cos(a) * Wn * 0.3, Math.sin(a) * Wn * 0.3, 0.2), 0.3 * S * f, c.second, 1); }
  rw.lit.add(new THREE.TorusGeometry(Wn * 0.3, 0.4 * S * f, 4, 32), null, c.light, PULSE);
  for (let q = 0; q < P.spires && !mini; q++) for (const sx of [-1, 1]) n.shell.cone(2 * S, 26 * S, 6, mat(sx * Wn * (0.5 + q * 0.2), y0 + Hn + 10 * S, q * bayL), ice(0.9));
  if (!mini) bar(n.glow, new THREE.Vector3(0, y0 + 3.2, 0), new THREE.Vector3(0, y0 + 3.2, L), 0.5 * S, c.light, 0.7);
  art.updates.push((t) => { rw.group.rotation.z = t * 0.1; });
  return { light: new THREE.Vector3(0, y0 + Hn * 0.6, -L / 2), focus: new THREE.Vector3(0, y0 + Hn * 0.5, 0), span: Math.max(L, Wn) * 0.65, height: y0 + Hn + (P.spires && !mini ? 24 * S : 2 * S), solid: Math.max(L, Wn) * 0.55, low: 0 };
}

// ------------------------------------------------------------------ the marked ones (+)
// The rarest of every depth, found nowhere else: a tree of light, a maelstrom in a ring,
// a band with one side, a sponge of four hundred cubes, a whale of the under-sky.

// a tree of light: a trunk of the sheen, branches dividing, crowns of light at their ends,
// leaves of light falling, roots over the ground
function tree(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const ends = [];
  const up = new THREE.Vector3(0, 1, 0);
  const branch = (p, dir, len, r, lvl) => {
    const bend = new THREE.Vector3(R() - 0.5, 0.2, R() - 0.5).multiplyScalar(len * 0.25);
    const q = p.clone().addScaledVector(dir, len);
    const f = (t) => p.clone().lerp(q, t).addScaledVector(bend, Math.sin(Math.PI * t));
    curveTube(lvl < 2 ? k.stone : k.shell, f, 6, (t) => r * (1 - t * 0.35), 6, lvl < 2 ? c.stone[2] : mixHex(c.shellLo, c.shellHi, lvl / P.levels));
    if (lvl >= P.levels) { ends.push(q); return; }
    const n = lvl === 0 ? P.split + 1 : P.split;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.8 + lvl;
      const tilt = 0.45 + R() * 0.35;
      const d2 = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)).lerp(dir, 0.35).normalize();
      branch(q, d2, len * (0.68 + R() * 0.12), r * 0.62, lvl + 1);
    }
  };
  const trunk = 24 * S;
  branch(new THREE.Vector3(0, -1 * S, 0), up, trunk, 2.6 * S, 0);
  // the crowns: clusters of light, and lit buds
  for (const e of ends) {
    k.glow.ico((1.1 + R() * 0.9) * S, 1, mat(e.x, e.y, e.z), mixHex(c.light, c.second, R() * 0.6), 0.55);
    for (let i = 0; i < 4; i++) k.lit.ico((0.35 + R() * 0.3) * S, 0, mat(e.x + (R() - 0.5) * 4 * S, e.y + (R() - 0.3) * 3 * S, e.z + (R() - 0.5) * 4 * S), [c.second, c.third, c.light, c.second][i], PULSE);
  }
  // the roots, over the ground and into it, veined with light
  for (let i = 0; i < P.roots; i++) {
    const a = (i / P.roots) * TAU + R() * 0.4, far = (14 + R() * 10) * S;
    const f = (t) => new THREE.Vector3(Math.cos(a) * far * t, art.ground(Math.cos(a) * far * t, Math.sin(a) * far * t) + 1.2 * S * Math.sin(Math.PI * t) - t * t * 2 * S, Math.sin(a) * far * t);
    curveTube(k.stone, f, 8, (t) => (2.0 - t * 1.6) * S, 5, c.stone[1]);
    curveTube(k.glow, (t) => f(t).add(new THREE.Vector3(0, 0.9 * S * (1 - t), 0)), 8, 0.18 * S, 4, mixHex(c.light, 0xffffff, 0.3), 0.8);
  }
  // leaves of light, falling from the crowns and gone into the ground
  const top = Math.max(...ends.map((e) => e.y)), span = Math.max(...ends.map((e) => Math.hypot(e.x, e.z))) + 4 * S;
  const n = mini ? 0 : 70, leaves = cloud(art, k.group, n, mixHex(c.second, 0xffffff, 0.3), 1.1 * S, 1);
  const L = Array.from({ length: n }, () => ({ e: ends[Math.floor(R() * ends.length)], t: R(), w: R() * TAU }));
  art.updates.push((t, dt) => {
    for (let i = 0; i < n; i++) {
      const l = L[i];
      l.t += dt * 0.05;
      if (l.t > 1) { l.t -= 1; l.e = ends[Math.floor(R() * ends.length)]; }
      const y = l.e.y - l.t * (l.e.y - 0.5);
      leaves.pos[i * 3] = l.e.x + Math.sin(t * 0.8 + l.w + l.t * 9) * 3 * S;
      leaves.pos[i * 3 + 1] = y;
      leaves.pos[i * 3 + 2] = l.e.z + Math.cos(t * 0.7 + l.w + l.t * 7) * 3 * S;
    }
    leaves.attr.needsUpdate = true;
  });
  return { light: new THREE.Vector3(0, top * 0.8, 0), focus: new THREE.Vector3(0, top * 0.55, 0), span, height: top + 4 * S, solid: span * 0.8, low: 0 };
}

// a maelstrom in a ring: a standing ring, arms of light turning into its heart, motes
// drawn in
function vortex(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const Rr = 21 * S, Hc = Rr + 7 * S;
  const ring = k.sub(0, Hc, 0);
  ring.shell.add(new THREE.TorusGeometry(Rr, 1.7 * S, 10, 96), null, mixHex(c.shellHi, c.light, 0.2));
  ring.stone.add(new THREE.TorusGeometry(Rr + 2.2 * S, 0.7 * S, 6, 96), null, c.stone[2]);
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; ring.lit.box(1.2 * S, 1.2 * S, 3.6 * S, mat(Math.cos(a) * (Rr + 2.2 * S), Math.sin(a) * (Rr + 2.2 * S), 0, 0, 0, a), i % 3 ? c.second : c.light, PULSE); }
  // two feet of stone down to the ground
  for (const s of [-1, 1]) {
    const a0 = new THREE.Vector3(s * Rr * 0.55, Hc - Rr * 0.83, 0), g = new THREE.Vector3(s * Rr * 0.95, art.ground(s * Rr * 0.95, 0) - 2 * S, 0);
    curveTube(k.stone, (t) => a0.clone().lerp(g, t), 6, (t) => (2.2 + t * 1.4) * S, 6, c.stone[1]);
  }
  // the arms: turning about the heart
  const arms = ring.sub();
  for (let a = 0; a < P.arms; a++) {
    const a0 = (a / P.arms) * TAU;
    for (let i = 0; i < 40; i++) {
      const u0 = i / 40, u1 = (i + 1) / 40;
      const p = (u, w) => { const r = Rr * 0.96 * (1 - u), th = a0 + u * P.wind * TAU + w; return [Math.cos(th) * r, Math.sin(th) * r, (u - 0.5) * 2 * S]; };
      const w = 0.16 * (1 - u0 * 0.6);
      const col = mixHex(c.light, 0xffffff, u0 * 0.8);
      arms.glow.quad(p(u0, -w), p(u1, -w), p(u1, w), p(u0, w), col, 0.25 + u0 * 0.7);
    }
  }
  arms.glow.ico(3.2 * S, 2, null, 0xffffff, 1);
  arms.lit.ico(1.6 * S, 1, null, c.light, PULSE);
  for (let r = 1; r <= 3; r++) {
    const rk = ring.sub();
    rk.glow.add(new THREE.TorusGeometry(Rr * (0.25 + r * 0.18), 0.12 * S, 3, 64), null, [c.second, c.third, c.light][r - 1], 0.7);
    art.updates.push((t) => { rk.group.rotation.set(Math.sin(t * 0.2 + r) * 0.4, Math.cos(t * 0.17 + r) * 0.4, t * 0.1 * (r % 2 ? 1 : -1)); });
  }
  // motes, drawn in along the spiral
  const n = mini ? 0 : 90, motes = cloud(art, ring.group, n, mixHex(c.light, 0xffffff, 0.4), 0.9 * S, 1);
  const M = Array.from({ length: n }, () => ({ u: R(), a: R() * TAU }));
  art.updates.push((t, dt) => {
    arms.group.rotation.z = -t * 0.35;
    for (let i = 0; i < n; i++) {
      const m = M[i];
      m.u += dt * 0.08;
      if (m.u > 1) { m.u -= 1; m.a = R() * TAU; }
      const r = Rr * 1.1 * (1 - m.u), th = m.a - t * 0.35 + m.u * P.wind * TAU;
      motes.pos[i * 3] = Math.cos(th) * r; motes.pos[i * 3 + 1] = Math.sin(th) * r; motes.pos[i * 3 + 2] = (1 - m.u) * Math.sin(m.a * 3) * 4 * S;
    }
    motes.attr.needsUpdate = true;
  });
  return { light: new THREE.Vector3(0, Hc, 0), focus: new THREE.Vector3(0, Hc, 0), span: Rr * 1.15, height: Hc + Rr + 3 * S, solid: Rr * 0.5, low: 0 };
}

// a band with one side (or three half-twists): turning slowly, its edge lit, lights
// running along it, over and under, without end
function mobius(k, P, S, art, mini) {
  const c = art.pal;
  const Rb = 19 * S, Wb = 6 * S, Hc = Rb + 12 * S, h = P.twists / 2;
  const band = k.sub(0, Hc, 0);
  const pt = (u, v) => { const r = Rb + v * Math.cos(h * u); return [r * Math.cos(u), v * Math.sin(h * u), r * Math.sin(u)]; };
  const N = 160, V = 4;
  for (let i = 0; i < N; i++) for (let j = 0; j < V; j++) {
    const u0 = (i / N) * TAU, u1 = ((i + 1) / N) * TAU, v0 = (j / V - 0.5) * 2 * Wb, v1 = ((j + 1) / V - 0.5) * 2 * Wb;
    const col = mixHex(c.shellLo, c.shellHi, 0.5 + 0.5 * Math.sin(u0 * 3));
    band.shell.quad(pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1), col);
    band.shell.quad(pt(u0, v0), pt(u0, v1), pt(u1, v1), pt(u1, v0), col);
  }
  // its edge: one line, twice round
  const edge = [];
  for (let i = 0; i <= 320; i++) { const u = (i / 320) * TAU * 2; edge.push(new THREE.Vector3(...pt(u, Wb * 1.02))); }
  band.glow.tube(edge, 0.3 * S, 4, mixHex(c.light, 0xffffff, 0.3), 1);
  // lights running along its middle
  const n = mini ? 0 : 24, runners = cloud(art, band.group, n, mixHex(c.second, 0xffffff, 0.35), 2.2 * S, 1);
  band.lit.ico(2.4 * S, 1, mat(0, 0, 0), c.light, PULSE);
  art.updates.push((t) => {
    band.group.rotation.set(0.35 + Math.sin(t * 0.13) * 0.15, t * 0.06, Math.sin(t * 0.1) * 0.12);
    for (let i = 0; i < n; i++) {
      const u = t * 0.25 + (i / n) * TAU * 2, p = pt(u, Math.sin(u * 3 + i) * Wb * 0.4);
      runners.pos.set([p[0], p[1] + 0.6 * S, p[2]], i * 3);
    }
    runners.attr.needsUpdate = true;
  });
  return { light: new THREE.Vector3(0, Hc, 0), focus: new THREE.Vector3(0, Hc, 0), span: Rb + Wb, height: Hc + Rb * 0.7, solid: Rb + Wb, low: Hc - Rb * 0.7 };
}

// a sponge of cubes: a cube cut into twenty-seven and the middles taken away, twice; a
// light inside it; its twenty blocks breathing apart and back
function menger(k, P, S, art, mini) {
  const c = art.pal;
  const E = 30 * S, e = E / 9, Hc = E * 0.9 + 6 * S;
  const holder = k.sub(0, Hc, 0);
  holder.group.rotation.set(Math.atan(1 / Math.SQRT2), 0, Math.PI / 4);
  const keep = (x, y, z) => [x, y, z].filter((v) => v === 1).length < 2;
  const blocks = [];
  for (let X = 0; X < 3; X++) for (let Y = 0; Y < 3; Y++) for (let Z = 0; Z < 3; Z++) {
    if (!keep(X, Y, Z)) continue;
    const base = new THREE.Vector3((X - 1) * 3 * e, (Y - 1) * 3 * e, (Z - 1) * 3 * e);
    const bk = holder.sub(base.x, base.y, base.z);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 3; z++) {
      if (!keep(x, y, z)) continue;
      // the corners of the corners lit; the rest the sheen, paler going up
      const lit = [x, y, z, X, Y, Z].every((v) => v !== 1) && (x + y + z + X + Y + Z) % 4 === 0;
      const col = mixHex(c.shellLo, c.shellHi, 0.25 + 0.6 * ((y + Y * 3) / 8));
      if (lit) bk.lit.box(e * 0.86, e * 0.86, e * 0.86, mat((x - 1) * e, (y - 1) * e, (z - 1) * e), c.second, PULSE);
      else bk.shell.box(e * 0.88, e * 0.88, e * 0.88, mat((x - 1) * e, (y - 1) * e, (z - 1) * e), col);
    }
    blocks.push({ bk, base, ph: (X + Y * 3 + Z * 9) * 0.7 });
  }
  holder.glow.ico(E * 0.22, 2, null, mixHex(c.light, 0xffffff, 0.4), 1);
  art.updates.push((t) => {
    holder.group.rotation.y = t * 0.05;
    const b = 0.06 + 0.06 * Math.sin(t * 0.45);
    for (const B of blocks) B.bk.group.position.copy(B.base).multiplyScalar(1 + b * (0.6 + 0.4 * Math.sin(t * 0.3 + B.ph)));
  });
  const half = E * 0.87;
  return { light: new THREE.Vector3(0, Hc, 0), focus: new THREE.Vector3(0, Hc, 0), span: half, height: Hc + half, solid: half, low: Hc - half };
}

// a whale of the under-sky: swimming slow circles over the trees, its flukes beating
function whale(k, P, S, art, mini) {
  const R = art.R, c = art.pal;
  const N = 44, Lw = 34 * S, Rp = 30 * S, Hc = 34 * S;
  const body = liveTube(k, art, N, 9, (u) => (u > 0.06 && u < 0.6 && Math.floor(u * 40) % 5 === 0 ? mixHex(c.shellHi, c.light, 0.3) : mixHex(c.shellLo, c.shellHi, 0.35 + u * 0.4)));
  // a blunt head, broadest a quarter of the way back, tapering to the flukes
  const radius = (u) => S * (0.3 + 4.8 * (u < 0.25 ? 0.62 + 0.38 * Math.sin((u / 0.25) * (Math.PI / 2)) : Math.pow(1 - (u - 0.25) / 0.75, 1.1)));
  const flukes = k.sub(), fins = k.sub();
  for (const s of [-1, 1]) {
    flukes.shell.add(new THREE.ConeGeometry(2.4 * S, 9 * S, 4), mat(s * 4.2 * S, 0, -1.6 * S, 0, 0, s * (Math.PI / 2 + 0.25), 0.22, 1, 1), c.shellHi);
    fins.shell.add(new THREE.ConeGeometry(1.6 * S, 8 * S, 4), mat(s * 5.6 * S, -1.6 * S, 0, 0.5, 0, s * (Math.PI / 2 + 0.5), 0.25, 1, 1), c.shellHi);
  }
  flukes.glow.ico(0.9 * S, 0, mat(0, 0, -2 * S), mixHex(c.light, 0xffffff, 0.4), 0.8);
  const eyes = k.sub();
  for (const s of [-1, 1]) eyes.lit.ico(0.5 * S, 0, mat(s * 3.6 * S, 0.5 * S, 0), mixHex(c.light, 0xffffff, 0.5), PULSE);
  // a trail of motes, and the lights along its flanks
  const n = mini ? 0 : 60, trail = cloud(art, k.group, n, mixHex(c.light, 0xffffff, 0.3), 1.1 * S, 1);
  const T = new Float32Array(n * 3);
  let head = 0;
  const path = (u, t) => {
    const ph = t * P.speed - u * (Lw / Rp);
    return new THREE.Vector3(Math.cos(ph) * Rp, Hc + Math.sin(t * 0.3) * 3 * S + Math.sin(ph * 2 - u * 6 + t * 1.2) * 1.6 * S * u, Math.sin(ph) * Rp);
  };
  const q = new THREE.Vector3(), place = (g, u, t, off = 0) => {
    const p = path(u, t), p2 = path(u + 0.02, t);
    q.subVectors(p, p2);
    g.group.position.copy(p);
    g.group.rotation.set(-Math.atan2(q.y, Math.hypot(q.x, q.z)) + off, Math.atan2(q.x, q.z), 0, 'YXZ');
  };
  let acc = 0;
  const p0 = path(1, 0);
  for (let i = 0; i < n; i++) T.set([p0.x, p0.y, p0.z], i * 3);
  art.updates.push((t, dt) => {
    for (let i = 0; i < N; i++) { const u = i / (N - 1); body.set(i, path(u, t), radius(u)); }
    body.commit();
    place(flukes, 1, t, Math.sin(t * 1.2) * 0.35);
    place(fins, 0.22, t, 0);
    place(eyes, 0.06, t, 0);
    acc += dt;
    if (acc > 0.08 && n) {
      acc = 0;
      const p = path(1, t);
      T.set([p.x, p.y, p.z], head * 3);
      head = (head + 1) % n;
      for (let i = 0; i < n; i++) trail.pos.set([T[i * 3], T[i * 3 + 1] - ((head - i + n) % n) * 0.05 * S, T[i * 3 + 2]], i * 3);
      trail.attr.needsUpdate = true;
    }
  });
  return { light: new THREE.Vector3(0, Hc, 0), focus: new THREE.Vector3(0, Hc, 0), span: Rp + 6 * S, height: Hc + 8 * S, solid: Rp + 6 * S, low: Hc - 8 * S };
}

const FORMS = { corolla, spine, nest, armillary, choir, geode, bloom, knot, nautilus, archipelago, murmuration, medusa, sun, watcher,
  spire, temple, halo, loom, storm, serpent, cathedral, tree, vortex, mobius, menger, whale };

// ------------------------------------------------------------------ ornaments
const ORN = {
  halo(art, root, info, S, R) {
    const c = art.pal, n = R.int(1, 3);
    const rings = [];
    for (let i = 0; i < n; i++) {
      const w = root.sub(info.focus.x, info.focus.y, info.focus.z);
      const r = info.span * (0.95 + i * 0.22);
      w.glow.add(new THREE.TorusGeometry(r, 0.14 * S, 3, 96), mat(0, 0, 0, Math.PI / 2, 0, 0), [c.light, c.second, c.third][i % 3], 0.9);
      for (let j = 0; j < 6; j++) { const a = (j / 6) * TAU; w.glow.ico(0.5 * S, 0, mat(Math.cos(a) * r, 0, Math.sin(a) * r), 0xffffff, 1); }
      w.group.rotation.set(R.range(-0.6, 0.6), 0, R.range(-0.6, 0.6));
      rings.push({ w, sp: (0.05 + R() * 0.08) * (i % 2 ? -1 : 1) });
    }
    art.updates.push((t) => { for (const r of rings) r.w.group.rotation.y = t * r.sp; });
  },
  sigil(art, root, info, S, R) {
    const c = art.pal, Rg = Math.max(18 * S, Math.min(info.span * 1.15, 80));
    info.sigil = Rg;
    const at = (x, z) => new THREE.Vector3(x, art.ground(x, z) + 0.35, z);
    const line = (a, b2, w, col) => {
      const n = Math.max(2, Math.ceil(a.distanceTo(b2) / (6 * S)));
      let prev = at(a.x, a.z);
      for (let i = 1; i <= n; i++) { const p = a.clone().lerp(b2, i / n); const q = at(p.x, p.z); bar(root.glow, prev, q, w, col, 0.8); prev = q; }
    };
    for (const f of [1, 0.72]) {
      const n = 64;
      for (let i = 0; i < n; i++) line(new THREE.Vector3(Math.cos((i / n) * TAU) * Rg * f, 0, Math.sin((i / n) * TAU) * Rg * f), new THREE.Vector3(Math.cos(((i + 1) / n) * TAU) * Rg * f, 0, Math.sin(((i + 1) / n) * TAU) * Rg * f), 0.35 * S, f === 1 ? c.light : c.second);
    }
    const sn = R.pick([5, 7, 8, 9, 11, 12]);
    let sk = R.int(2, Math.floor((sn - 1) / 2));
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    while (gcd(sn, sk) !== 1) sk--;
    // inside, figures of sn sides, each set in the last and turned half a side
    for (let j = 0, r = Rg * 0.72; j < sk; j++, r *= Math.cos(Math.PI / sn)) {
      for (let i = 0; i < sn; i++) {
        const a0 = ((i + j * 0.5) / sn) * TAU, a1 = ((i + 1 + j * 0.5) / sn) * TAU;
        line(new THREE.Vector3(Math.cos(a0) * r, 0, Math.sin(a0) * r), new THREE.Vector3(Math.cos(a1) * r, 0, Math.sin(a1) * r), 0.28 * S, c.third);
      }
    }
  },
  orbiters(art, root, info, S, R) {
    const c = art.pal, n = R.int(3, 6), obs = [];
    for (let i = 0; i < n; i++) {
      const o = root.sub();
      const kind = R.pick(['tetrahedron', 'octahedron', 'icosahedron', 'cube']);
      o.shell.add(solidGeo(kind, 1.8 * S), null, c.shellHi);
      wire(o, kind, 1.85 * S, 0.12 * S, [c.light, c.second, c.third][i % 3], null);
      o.glow.ico(0.5 * S, 1, null, 0xffffff, 1);
      obs.push({ o, r: info.span * R.range(0.8, 1.3), ph: R() * TAU, sp: (0.2 + R() * 0.25) * (R() < 0.5 ? 1 : -1), tilt: R.range(-0.7, 0.7) });
    }
    art.updates.push((t) => {
      for (const b of obs) {
        const a = b.ph + t * b.sp;
        b.o.group.position.set(info.focus.x + Math.cos(a) * b.r, info.focus.y + Math.sin(a) * b.r * b.tilt, info.focus.z + Math.sin(a) * b.r);
        b.o.group.rotation.set(t * 0.7, t, 0);
      }
    });
  },
  motes(art, root, info, S, R) {
    const c = art.pal, n = Math.min(400, 80 + art.depth * 40);
    const sets = [c.light, c.second].map((col) => cloud(art, root.group, n / 2, col, 0.8 * S, 1.1));
    const seeds = sets.map((cl2) => Array.from({ length: cl2.pos.length / 3 }, () => [R() * TAU, R(), 0.4 + R() * 0.8]));
    const Hm = Math.max(info.height, 30 * S), Rm = info.span * 1.1;
    art.updates.push((t) => {
      sets.forEach((cl2, si) => {
        seeds[si].forEach(([a, ph, r], i) => {
          const u = (ph + t * 0.03 * (1 + si * 0.3)) % 1;
          const ang = a + u * 3 + t * 0.05;
          cl(cl2, i, Math.cos(ang) * Rm * r * (1 - u * 0.4), u * Hm, Math.sin(ang) * Rm * r * (1 - u * 0.4));
        });
        cl2.attr.needsUpdate = true;
      });
    });
  },
  pillar(art, root, info, S) {
    const c = art.pal, Hp = 320, r0 = Math.max(2 * S, info.span * 0.08);
    const g = new THREE.CylinderGeometry(r0 * 1.8, r0, Hp, 16, 6, true);
    g.translate(0, Hp / 2, 0);
    const p = g.attributes.position, n = p.count;
    const col = new Float32Array(n * 3), em = new Float32Array(n);
    const cc = new THREE.Color(c.light), c2 = new THREE.Color(c.second);
    for (let i = 0; i < n; i++) {
      const y = p.getY(i) / Hp, m = cc.clone().lerp(c2, y);
      col.set([m.r, m.g, m.b], i * 3);
      em[i] = Math.max(0.0001, Math.pow(1 - y, 1.6) * (0.3 + 0.7 * Math.min(1, (y * Hp) / 14)));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
    const m = glowMaterial({ opacity: 0.4, fog: 0.5, fresnel: 0.85, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(info.focus.x, 0, info.focus.z);
    mesh.layers.set(LAYER_FX);
    mesh.frustumCulled = false;
    root.group.add(mesh);
    art.fades.push([m, 0.4]);
    art.mats.extra.push(m);
  },
  beams(art, root, info, S, R) {
    const c = art.pal, n = R.int(2, 4), L = 130 * S;
    const piv = root.sub(info.light.x, info.light.y, info.light.z);
    for (let i = 0; i < n; i++) {
      const g = new THREE.ConeGeometry(10 * S, L, 16, 4, true);
      g.translate(0, -L / 2, 0);
      g.rotateZ(Math.PI / 2);
      const p = g.attributes.position, nn = p.count;
      const col = new Float32Array(nn * 3), em = new Float32Array(nn), cc = new THREE.Color([c.light, c.second, c.third][i % 3]);
      for (let j = 0; j < nn; j++) { col.set([cc.r, cc.g, cc.b], j * 3); em[j] = Math.max(0.0001, Math.pow(clamp(1 - p.getX(j) / L, 0, 1), 1.4) * 0.9); }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
      const m = glowMaterial({ opacity: 0.16, fog: 0.45, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m);
      mesh.layers.set(LAYER_FX);
      mesh.frustumCulled = false;
      const arm = new THREE.Group();
      arm.rotation.set(0, (i / n) * TAU, R.range(-0.25, 0.1));
      arm.add(mesh);
      piv.group.add(arm);
      art.fades.push([m, 0.16]);
      art.mats.extra.push(m);
    }
    const sp = (0.25 + R() * 0.2) * (R() < 0.5 ? 1 : -1);
    art.updates.push((t) => { piv.group.rotation.y = t * sp; });
  },
  shards(art, root, info, S, R) {
    const c = art.pal, n = R.int(14, 30), w = root.sub(info.focus.x, info.focus.y, info.focus.z);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + R() * 0.2, r = info.span * R.range(1.05, 1.35), y = R.range(-0.3, 0.3) * info.span;
      shard(w.shell, new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), new THREE.Vector3(R() - 0.5, 1.5, R() - 0.5), R.range(3, 7) * S, 0.6 * S, 4, c.shellHi, 0, c.light);
    }
    const sp = (0.03 + R() * 0.04) * (R() < 0.5 ? 1 : -1);
    art.updates.push((t) => { w.group.rotation.y = t * sp; w.group.position.y = info.focus.y + Math.sin(t * 0.3) * S; });
  },
  rain(art, root, info, S, R) {
    const c = art.pal, n = 260, Rr = info.span * 1.4, top = info.height + 20 * S;
    const cl2 = cloud(art, root.group, n, mixHex(c.second, 0xffffff, 0.3), 0.7 * S, 1);
    const seeds = Array.from({ length: n }, () => { const a = R() * TAU, r = Math.sqrt(R()) * Rr, x = Math.cos(a) * r, z = Math.sin(a) * r; return [x, z, art.ground(x, z), R()]; });
    art.updates.push((t) => {
      seeds.forEach(([x, z, gy, ph], i) => { const u = (ph + t * 0.12) % 1; cl(cl2, i, x, top - u * (top - gy), z); });
      cl2.attr.needsUpdate = true;
    });
  },
  veil(art, root, info, S, R) {
    const c = art.pal, n = 2, M = 56, Rv = info.span * 1.7, Hv = Math.max(40 * S, info.height * 0.9);
    const ray = (u) => 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(u * 61 + Math.sin(u * 17) * 2), 3);
    const v = strips(art, root.group, n, M, (s, u, side) => (side ? c.third : c.light), (s, u, side) => Math.pow(Math.sin(Math.PI * u), 0.6) * ray(u) * (side ? 0.05 : 1), 0.3);
    const a0 = R() * TAU;
    art.updates.push((t) => {
      for (let s = 0; s < n; s++) for (let i = 0; i < M; i++) {
        const u = i / (M - 1), a = a0 + s * Math.PI + (u - 0.5) * 2.2 + Math.sin(t * 0.2 + u * 4 + s) * 0.12;
        const r = Rv * (1 + Math.sin(t * 0.35 + u * 6 + s * 2) * 0.06), x = Math.cos(a) * r, z = Math.sin(a) * r;
        const y0 = Hv * 0.25 + Math.sin(t * 0.5 + u * 5) * 2 * S;
        v.set(s, i, x, y0, z, x, y0 + Hv * (0.8 + 0.2 * Math.sin(t * 0.4 + u * 7)), z);
      }
      v.commit();
    });
  },
  // its double, in light, hanging over it upside down; its echoes, a little behind it in time
  twin: (art, root, info) => ghosts(art, root, info, [{ flip: true }]),
  echoes: (art, root, info, S, R) => ghosts(art, root, info, [{ yaw: 0.35 + R() * 0.2 }, { yaw: -(0.35 + R() * 0.2) }]),
  skyring(art, root, info, S, R) {
    const c = art.pal, r = info.span * 3.2 + 40 * S, w = root.sub(info.focus.x, info.height + 70 * S, info.focus.z);
    w.glow.add(new THREE.TorusGeometry(r, 0.5 * S, 3, 160), mat(0, 0, 0, Math.PI / 2, 0, 0), c.light, 0.7);
    w.glow.add(new THREE.TorusGeometry(r * 0.93, 0.25 * S, 3, 160), mat(0, 0, 0, Math.PI / 2, 0, 0), c.second, 0.5);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; w.glow.box(2 * S, 2 * S, 2 * S, mat(Math.cos(a) * r, 0, Math.sin(a) * r, 0, a, 0), 0xffffff, 1); }
    w.group.rotation.x = R.range(-0.2, 0.2);
    art.updates.push((t) => { w.group.rotation.y = t * 0.02; });
  },
};

function ghosts(art, root, info, list) {
  // the main form's masses, as they stand now, in one piece
  const one = new Builder();
  root.group.updateMatrixWorld(true);
  const inv = root.group.matrixWorld.clone().invert();
  art.main.group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.layers.mask !== 1 << LAYER_FX && o.geometry.attributes.color) one.merge(o.geometry, inv.clone().multiply(o.matrixWorld)); });
  if (one.empty) return;
  const geo = one.build();
  for (const g of list) {
    const holder = new THREE.Group();
    const m = glowMaterial({ opacity: 0.18, fog: 0.5, fresnel: 0.7, side: THREE.DoubleSide, tint: new THREE.Color(art.st.light).multiplyScalar(3) });
    art.fades.push([m, 0.18]);
    art.mats.extra.push(m);
    const c = new THREE.Mesh(geo, m);
    c.layers.set(LAYER_FX);
    c.frustumCulled = false;
    holder.add(c);
    if (g.flip) { holder.scale.y = -1; holder.position.y = info.height * 2 + 24; }
    root.group.add(holder);
    art.updates.push((t) => { holder.rotation.y = g.flip ? -t * 0.03 : g.yaw + Math.sin(t * 0.4) * 0.08; });
  }
}

// A small form (a crown, a court's) in a few meshes: every part of it merged into its own
// kit as it stands when built, its motion given once and then dropped; it turns as one.
function small(art, kit, form, P, S) {
  const k0 = art.kits.length, u0 = art.updates.length;
  const info = FORMS[form](kit, P, S, art, true);
  for (const u of art.updates.splice(u0)) u(0, 0, {}, 0);
  kit.group.updateMatrixWorld(true);
  const inv = kit.group.matrixWorld.clone().invert();
  for (const k of art.kits.slice(k0)) {
    if (k === kit) continue;
    const rel = inv.clone().multiply(k.group.matrixWorld);
    for (const part of ['stone', 'shell', 'lit', 'glow']) if (!k[part].empty) { kit[part].merge(k[part], rel); k[part] = new Builder(); }
  }
  return info;
}

// ------------------------------------------------------------------ the whole
export function buildDeep(d, A, mats, ctx) {
  const st = stratum(d.depth), S = d.size, P = d.params;
  const stoneOf = (h) => mixHex(h, st.dark, 0.55);
  const art = {
    d, st, depth: d.depth, R: rng(d.seed[5]), kits: [], updates: [], fades: [],
    ground: (x, z) => (ctx.ground ? ctx.ground(x, z) : 0),
    pal: {
      stone: STONE.map(stoneOf), light: st.light, second: st.second, third: st.third,
      shellLo: mixHex(st.irid[0], st.dark, 0.35), shellHi: mixHex(st.irid[2], st.irid[1], 0.4),
    },
    mats: {
      stone: mats.body, lit: mats.glow,
      shell: deepMaterial({ irid: st.irid, amount: 0.62, cycle: st.cycle, sheen: 1, veins: st.veins, veinColor: st.second, veinScale: 0.22 / S, flow: 0.25 }),
      light: glowMaterial({ opacity: 0.95, fog: 0.55, side: THREE.DoubleSide }),
      extra: [],
    },
    unique: null,
  };
  // a lit material of its own (for parts that pulse out of step with the rest)
  art.unique = () => { const m = worldMaterial({ unique: true }); art.mats.extra.push(m); return m; };
  art.fades.push([art.mats.light, 0.95]);
  const root = new Kit(art, null);
  const main = root.sub();
  art.main = main;
  const info = FORMS[P.form](main, P, S, art, false);
  // a second form crowning it
  if (P.crown) {
    const ck = root.sub(info.focus.x, info.height + 16 * S, info.focus.z);
    const ci = small(art, ck, P.crown.form, P.crown, S * 0.42);
    art.updates.push((t) => { ck.group.rotation.y = t * 0.06; ck.group.position.y = info.height + 16 * S + Math.sin(t * 0.4) * 1.5 * S; });
    info.height = info.height + 16 * S + ci.height * 0.5 + 6 * S;
  }
  // a court of small ones about it
  if (P.court) {
    const ring = root.sub(info.focus.x, 0, info.focus.z);
    const rr = info.span * 1.5 + 14 * S;
    for (let i = 0; i < P.court.n; i++) {
      const a = (i / P.court.n) * TAU;
      const mk = ring.sub(Math.cos(a) * rr, 22 * S + Math.sin(i * 1.7) * 4 * S, Math.sin(a) * rr);
      small(art, mk, P.court.form.form, P.court.form, S * 0.3);
      art.updates.push((t) => { mk.group.rotation.y = t * 0.1 + i; });
    }
    art.updates.push((t) => { ring.group.rotation.y = t * 0.015; });
    info.span = Math.max(info.span, rr * 0.7);
  }
  for (const o of P.ornaments) if (ORN[o] && o !== 'twin' && o !== 'echoes') ORN[o](art, root, info, S, art.R);
  // finish every kit, then the ghosts (they copy what is built)
  for (const k of art.kits) k.finish();
  for (const o of P.ornaments) if (o === 'twin' || o === 'echoes') ORN[o](art, root, info, S, art.R);
  let last = null;
  const out = {
    group: root.group,
    light: info.light, focus: info.focus, span: info.span, height: info.height,
    clear: Math.min(95, Math.max(12, Math.min(info.span * 0.75, 70), (info.sigil || 0) + 4) + 6),
    solid: { r: info.solid, top: info.height, low: info.low || 0 },
    mats: [art.mats.shell, art.mats.light, ...art.mats.extra],
    update(t, beat, c) {
      const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
      last = t;
      for (const u of art.updates) u(t, dt, c, beat);
      const rv = c.reveal ?? 1, pulse = c.pulse ?? 1;
      for (const [m, base] of art.fades) m.uniforms.uOpacity.value = base * rv * (0.8 + pulse * 0.25);
    },
  };
  return out;
}
