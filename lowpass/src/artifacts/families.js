import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { STONE, RIM, PULSE, Y, beam, slab, motes, driftMotes } from './parts.js';

// The newer families, built like the first ones (models.js): dark masses in the codex's
// stone, selective pale rims, and the artifact's one light, pulsing to its rhythm. Each
// returns { group, light, focus, span, clear, height, update(t, beat, ctx), mats? }.
// Parts drawn in pure light (beams, wireframes, shards) are unlit glow, faded in by
// ctx.reveal as the artifact materializes.

const PALE = 0xc2c9c9, PALE2 = 0x97acb0, DARK = 0x0f0e16;
const X = new THREE.Vector3(1, 0, 0);

// a mesh of pure light: additive, fogged, drawn after the fog
function lightMesh(geo, opts = {}) {
  const m = new THREE.Mesh(geo, glowMaterial({ opacity: 1, ...opts }));
  m.layers.set(LAYER_FX);
  m.frustumCulled = false;
  return m;
}

// color and emissive per vertex, for geometry made outside a Builder
function paint(geo, color, f) {
  const p = geo.attributes.position, n = p.count;
  const col = new Float32Array(n * 3), em = new Float32Array(n);
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); em[i] = Math.max(0.0001, f(p.getX(i), p.getY(i), p.getZ(i))); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return geo;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
// an instance as a stick from a to b, w thick
function stick(im, i, a, b, w) {
  _d.subVectors(b, a);
  const len = _d.length();
  _q.setFromUnitVectors(Y, len > 1e-5 ? _d.multiplyScalar(1 / len) : Y);
  _p.addVectors(a, b).multiplyScalar(0.5);
  _s.set(w, len + w * 0.5, w);
  im.setMatrixAt(i, _m.compose(_p, _q, _s));
}

// ------------------------------------------------------------------ beacon
// A lighthouse with no sea: courses of stone, a gallery, a lamp room, and beams that
// turn through the fog.
function beacon(d, A, mats) {
  const P = d.params, b = new Builder(), gl = new Builder();
  const H = P.height, sides = P.sides, S = d.size;
  const base = 4.6 * S, top = 2.9 * S;
  for (let i = 0; i < P.courses; i++) {
    const k0 = i / P.courses, k1 = (i + 1) / P.courses;
    const r0 = base + (top - base) * k0, r1 = base + (top - base) * k1;
    b.add(new THREE.CylinderGeometry(r1, r0, (H / P.courses) * 1.002, sides, 1), mat(0, (H * (k0 + k1)) / 2, 0, 0, Math.PI / sides, 0), i % 2 ? STONE[2] : STONE[0], 0, { flat: true });
    // a slit window on every other course, lit from within
    if (i % 2 === 1 && i < P.courses - 1) {
      const a = i * 1.7, rr = ((r0 + r1) / 2) * Math.cos(Math.PI / sides) + 0.06;
      b.box(0.55 * S, (H / P.courses) * 0.5, 0.15, mat(Math.cos(a) * rr, (H * (k0 + k1)) / 2, Math.sin(a) * rr, 0, -a + Math.PI / 2, 0), A, 1.2);
    }
  }
  b.box(1.8 * S, 3.4 * S, 0.7, mat(0, 1.7 * S, base * 0.95), DARK);
  // the gallery and its rail
  b.cyl(top * 1.6, top * 1.2, 1.1 * S, sides * 2, mat(0, H + 0.55 * S, 0), STONE[1]);
  if (P.gallery) {
    for (let i = 0; i < sides * 2; i++) { const a = (i / (sides * 2)) * TAU; b.box(0.25, 1.6 * S, 0.25, mat(Math.cos(a) * top * 1.48, H + 1.9 * S, Math.sin(a) * top * 1.48), STONE[3]); }
    b.add(new THREE.TorusGeometry(top * 1.48, 0.14, 3, sides * 2), mat(0, H + 2.7 * S, 0, Math.PI / 2, 0, 0), STONE[3]);
  }
  // the lamp room: lit glass between dark mullions, under a cap
  const lh = 4.4 * S, lr = top * 0.92, ly = H + 1.1 * S;
  gl.cyl(lr, lr, lh, sides, mat(0, ly + lh / 2, 0), mixHex(A, 0xffffff, 0.35), PULSE);
  for (let i = 0; i < sides; i++) { const a = (i / sides) * TAU + Math.PI / sides; b.box(0.35, lh, 0.35, mat(Math.cos(a) * lr * 1.03, ly + lh / 2, Math.sin(a) * lr * 1.03), DARK); }
  b.cone(lr * 1.4, 3.2 * S, sides, mat(0, ly + lh + 1.6 * S, 0), STONE[1]);
  b.ico(0.6 * S, 0, mat(0, ly + lh + 3.5 * S, 0), A, PULSE);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gl.build(), mats.glow));
  // the beams: long cones of light from the lamp, dipping toward the canopy
  const lampY = ly + lh * 0.5, L = 150 * S;
  const pivot = new THREE.Group();
  pivot.position.y = lampY;
  const beams = [];
  for (let i = 0; i < P.beams; i++) {
    const g = new THREE.ConeGeometry(15 * S, L, 18, 6, true);
    g.translate(0, -L / 2, 0);
    g.rotateZ(Math.PI / 2);
    paint(g, mixHex(A, 0xffffff, 0.45), (x) => Math.pow(clamp(1 - x / L, 0, 1), 1.4) * 0.9 + 0.02);
    const m = lightMesh(g, { opacity: 0.2, fog: 0.45, side: THREE.DoubleSide });
    const arm = new THREE.Group();
    arm.rotation.set(0, (i / P.beams) * TAU, -0.07);
    arm.add(m);
    pivot.add(arm);
    beams.push(m);
  }
  group.add(pivot);
  const w = (TAU / P.period) * P.dir;
  return {
    group, light: new THREE.Vector3(0, lampY, 0), focus: new THREE.Vector3(0, H * 0.6, 0), span: H * 0.55, clear: base * 2.4 + 10, height: ly + lh + 4,
    mats: beams.map((m) => m.material),
    update(t, beat, c) {
      pivot.rotation.y = t * w;
      for (const m of beams) m.material.uniforms.uOpacity.value = (0.14 + (c.pulse ?? 1) * 0.08) * (c.reveal ?? 1);
    },
  };
}

// ------------------------------------------------------------------ orrery
// An orrery on a stone plinth: a lit sun on its pole, bodies on arms about it at the
// spacing of a law, each going round in a year that keeps Kepler's third law.
function orrery(d, A, mats) {
  const P = d.params, b = new Builder(), gl = new Builder(), R = rng(d.seed[5]);
  const H = P.height, S = d.size;
  b.cyl(5.5 * S, 6.6 * S, 1.2, 12, mat(0, 0.6, 0), STONE[1]);
  b.cyl(3.6 * S, 4.5 * S, 1.2, 12, mat(0, 1.8, 0), STONE[2]);
  b.cyl(0.6 * S, 1.1 * S, H - 2.4, 8, mat(0, 2.4 + (H - 2.4) / 2, 0), STONE[0]);
  for (const r of P.radii) b.add(new THREE.TorusGeometry(r, 0.1 * S, 3, 72), mat(0, H, 0, Math.PI / 2, 0, 0), STONE[3]);
  gl.ico(2.4 * S, 1, mat(0, H, 0), mixHex(A, 0xffffff, 0.25), PULSE);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gl.build(), mats.glow));
  const COLORS = [PALE, PALE2, 0x627594, 0x8ca893, 0xaf634b, 0xb9a87b, 0x465b7d];
  const lit = Math.floor(R() * P.n);
  const arms = [];
  const r0 = P.radii[0];
  P.radii.forEach((r, i) => {
    const ab = new Builder();
    beam(ab, new THREE.Vector3(1.4 * S, 0, 0), new THREE.Vector3(r, 0, 0), 0.22 * S, STONE[2]);
    beam(ab, new THREE.Vector3(r, 0, 0), new THREE.Vector3(r, -0.6 * S, 0), 0.2 * S, STONE[2]);
    const pr = P.sizes[i];
    const col = R.pick(COLORS);
    if (i === lit) ab.sphere(pr, 12, 9, mat(r, pr * 0.2, 0), (x, y) => (Math.abs(y) < pr * 0.25 ? A : col), (x, y) => (Math.abs(y) < pr * 0.25 ? PULSE : 0));
    else ab.sphere(pr, 12, 9, mat(r, pr * 0.2, 0), (x, y) => (Math.floor((y / pr + 1) * 3) % 2 ? col : mixHex(col, DARK, 0.35)));
    if (P.rings[i]) ab.add(new THREE.TorusGeometry(pr * 1.7, pr * 0.12, 3, 24), mat(r, pr * 0.2, 0, Math.PI / 2 + 0.4, 0, 0.3), RIM);
    const arm = new THREE.Group();
    arm.position.y = H;
    arm.add(new THREE.Mesh(ab.build(), mats.body));
    const moons = [];
    for (let k = 0; k < P.moons[i]; k++) {
      const mb = new Builder();
      mb.ico(pr * 0.3, 0, mat(pr * (1.9 + k * 0.7), 0, 0), PALE, 0);
      const mp = new THREE.Group();
      mp.position.set(r, pr * 0.2, 0);
      mp.add(new THREE.Mesh(mb.build(), mats.body));
      arm.add(mp);
      moons.push({ mp, w: 1.3 / (k + 1) });
    }
    group.add(arm);
    // Kepler: the square of the year as the cube of the distance
    arms.push({ arm, w: 0.32 * Math.pow(r0 / r, 1.5), ph: R() * TAU, moons });
  });
  const far = P.radii[P.n - 1];
  return {
    group, light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H * 0.8, 0), span: far + 3, clear: far + 9, height: H + 4,
    update(t) {
      for (const a of arms) {
        a.arm.rotation.y = a.ph + t * a.w;
        for (const m of a.moons) m.mp.rotation.y = t * m.w;
      }
    },
  };
}

// ------------------------------------------------------------------ helix
// Two strands wound about each other, joined by rungs; the lit rungs spell a number in
// binary, from the ground up. It turns slowly on a stone foot.
function helix(d, A, mats) {
  const P = d.params, b = new Builder(), gl = new Builder();
  const H = P.height, r = P.radius, S = d.size;
  const at = (y, ph) => { const a = ph + (y / H) * P.turns * TAU; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); };
  for (const [ph, col] of [[0, PALE], [Math.PI, PALE2]]) {
    const pts = [];
    for (let k = 0; k <= 140; k++) pts.push(at(1 + (k / 140) * (H - 1), ph));
    b.tube(pts, 0.5 * S, 6, col);
  }
  for (let i = 0; i < P.rungs; i++) {
    const y = 1 + ((i + 0.5) / P.rungs) * (H - 2);
    const p0 = at(y, 0), p1 = at(y, Math.PI);
    const on = (P.number >> i) & 1;
    if (on) beam(gl, p0, p1, 0.55 * S, A, PULSE);
    else beam(b, p0, p1, 0.32 * S, STONE[2]);
    b.ico(0.75 * S, 0, mat(p0.x, p0.y, p0.z), on ? RIM : STONE[3]);
    b.ico(0.75 * S, 0, mat(p1.x, p1.y, p1.z), on ? RIM : STONE[3]);
  }
  const turn = new THREE.Group();
  turn.add(new THREE.Mesh(b.build(), mats.body));
  turn.add(new THREE.Mesh(gl.build(), mats.glow));
  const foot = new Builder();
  foot.cyl(r * 1.7, r * 2.1, 1.2, 16, mat(0, 0.6, 0), STONE[1]);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; foot.box(0.6, 0.3, 0.6, mat(Math.cos(a) * r * 1.85, 1.25, Math.sin(a) * r * 1.85), A, i % 3 ? 1 : PULSE); }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(foot.build(), mats.body));
  group.add(turn);
  return {
    group, light: new THREE.Vector3(0, H * 0.55, 0), focus: new THREE.Vector3(0, H * 0.5, 0), span: Math.max(H * 0.5, r * 2), clear: r * 2.4 + 9, height: H,
    update(t) { turn.rotation.y = t * P.spin; },
  };
}

// ------------------------------------------------------------------ tesseract
// The shadow of a solid of four dimensions, cast into ours: its edges in light, its
// corners bright, turning through the fourth dimension so it folds through itself.
function polytope(kind) {
  const V = [];
  if (kind === 'tesseract') {
    for (let i = 0; i < 16; i++) V.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  } else if (kind === '16-cell') {
    for (let a = 0; a < 4; a++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[a] = s; V.push(v); }
  } else if (kind === '5-cell') {
    const r5 = 1 / Math.sqrt(5);
    V.push([1, 1, 1, -r5], [1, -1, -1, -r5], [-1, 1, -1, -r5], [-1, -1, 1, -r5], [0, 0, 0, 4 * r5]);
  } else {
    for (let a = 0; a < 4; a++) for (let c = a + 1; c < 4; c++) for (const s of [1, -1]) for (const u of [1, -1]) { const v = [0, 0, 0, 0]; v[a] = s; v[c] = u; V.push(v); }
  }
  const n = Math.max(...V.map((v) => Math.hypot(...v)));
  const verts = V.map((v) => v.map((x) => x / n));
  // edges: the pairs at the shortest distance
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) min = Math.min(min, Math.hypot(...verts[i].map((x, k) => x - verts[j][k])));
  const edges = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) if (Math.hypot(...verts[i].map((x, k) => x - verts[j][k])) < min * 1.01) edges.push([i, j]);
  return { verts, edges };
}

function tesseract(d, A, mats) {
  const P = d.params, S = d.size;
  const { verts, edges } = polytope(P.kind);
  const H = P.height, R = P.radius;
  const plinth = new Builder();
  const g = new THREE.DodecahedronGeometry(3.4 * S, 0);
  roughen(g, 0.6, 9);
  plinth.add(g, mat(0, 1.2, 0, 0, 0, 0, 1.4, 0.55, 1.4), STONE[1], 0, { flat: true });
  plinth.add(new THREE.TorusGeometry(5.6 * S, 0.22, 3, 40), mat(0, 0.35, 0, Math.PI / 2, 0, 0), A, PULSE);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(plinth.build(), mats.body));
  const unit = new Builder();
  unit.box(1, 1, 1, null, mixHex(A, 0xffffff, 0.3), 1);
  const eGeo = unit.build();
  const edgeM = new THREE.InstancedMesh(eGeo, glowMaterial({ opacity: 0.85, fog: 0.75 }), edges.length);
  const node = new Builder();
  node.ico(1, 0, null, mixHex(A, 0xffffff, 0.7), 1);
  const nodeM = new THREE.InstancedMesh(node.build(), glowMaterial({ opacity: 0.95, fog: 0.75 }), verts.length);
  for (const m of [edgeM, nodeM]) { m.layers.set(LAYER_FX); m.frustumCulled = false; m.position.y = H; group.add(m); }
  const p3 = verts.map(() => new THREE.Vector3());
  const rot = (v, a, i, j) => { const c = Math.cos(a), s = Math.sin(a), x = v[i], y = v[j]; v[i] = x * c - y * s; v[j] = x * s + y * c; };
  const w = 0.55 * S;
  return {
    group, light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H, 0), span: R * 1.5, clear: 13, height: H + R * 1.3,
    mats: [edgeM.material, nodeM.material],
    update(t, beat, c) {
      verts.forEach((v0, k) => {
        const v = v0.slice();
        rot(v, t * P.speeds[0], 0, 3);
        rot(v, t * P.speeds[1], 1, 2);
        rot(v, t * P.speeds[2], 2, 3);
        const f = 1.6 / (2.4 - v[3]);
        p3[k].set(v[0] * f * R, v[1] * f * R, v[2] * f * R);
      });
      edges.forEach(([i, j], k) => stick(edgeM, k, p3[i], p3[j], w));
      p3.forEach((p, k) => nodeM.setMatrixAt(k, _m.compose(p, _q.identity(), _s.setScalar(w * 1.9))));
      edgeM.instanceMatrix.needsUpdate = true;
      nodeM.instanceMatrix.needsUpdate = true;
      const rv = c.reveal ?? 1, pulse = c.pulse ?? 1;
      edgeM.material.uniforms.uOpacity.value = (0.55 + pulse * 0.3) * rv;
      nodeM.material.uniforms.uOpacity.value = (0.7 + pulse * 0.3) * rv;
    },
  };
}

// ------------------------------------------------------------------ wreck
// A hull that is not of the forest, nor of the network: nosed into the ground, sunk, its
// stern broken open to ribs; plates thrown about it; a light inside that still answers.
function wreck(d, A, mats) {
  const P = d.params, b = new Builder(), gl = new Builder(), R = rng(d.seed[5]);
  const L = P.length, W = P.beam, S = d.size;
  const segs = 9;
  const half = (k) => (W / 2) * (k > 0.72 ? 1 - ((k - 0.72) / 0.28) * 0.82 : 1);
  for (let i = 0; i < segs; i++) {
    const k0 = i / segs, k1 = (i + 1) / segs;
    const z = -L / 2 + (L * (k0 + k1)) / 2;
    // plating in the pale metal of the visor's own ramp, a seam along its back
    b.add(new THREE.CylinderGeometry(half(k1), half(k0), L / segs, 8, 1), mat(0, 0, z, Math.PI / 2, 0, Math.PI / 8),
      (x, y, zz) => (Math.abs(x) < W * 0.1 && zz > 0 ? 0xc2c9c9 : zz < -W * 0.2 ? STONE[2] : i % 2 ? 0x627594 : 0x7b92a9), 0, { flat: true });
    // running lights down both flanks
    if (i < segs - 1) for (const sx of [-1, 1]) gl.box(0.55 * S, 0.55 * S, 1.6 * S, mat(sx * half(k0 + 0.5 / segs) * 0.94, W * 0.1, z), A, i % 2 === 0 ? PULSE : 1.3);
  }
  // the broken stern: ribs standing open to the air
  for (let i = 0; i < P.ribs; i++) {
    const z = -L / 2 - 1.5 - i * 2.6 * S;
    const arc = Math.PI * (0.55 + 0.45 * R()) * (1 - i / (P.ribs + 1) * 0.5);
    b.add(new THREE.TorusGeometry(W * 0.48, 0.4 * S, 4, 12, arc), mat(0, 0, z, 0, 0, Math.PI / 2 - arc / 2 + (R() - 0.5) * 0.4), 0x97acb0);
  }
  beam(b, new THREE.Vector3(0, -W * 0.45, -L / 2), new THREE.Vector3(0, -W * 0.45, -L / 2 - P.ribs * 2.6 * S), 0.5 * S, STONE[2]);
  // its light, deep inside the break
  gl.ico(2.2 * S, 1, mat(0, 0, -L / 2 + 2), mixHex(A, 0xffffff, 0.3), PULSE);
  // a bent mast on its back
  const m0 = new THREE.Vector3(0, W * 0.48, L * 0.1), m1 = new THREE.Vector3(1.5, W * 0.48 + 9 * S, L * 0.1 - 2), m2 = new THREE.Vector3(4.5, W * 0.48 + 13 * S, L * 0.1 - 5);
  beam(b, m0, m1, 0.35 * S, STONE[3]);
  beam(b, m1, m2, 0.25 * S, STONE[3]);
  gl.ico(0.45 * S, 0, mat(m2.x, m2.y, m2.z), A, PULSE);
  const hull = new THREE.Group();
  hull.add(new THREE.Mesh(b.build(), mats.body));
  hull.add(new THREE.Mesh(gl.build(), mats.glow));
  hull.position.y = W / 2 - W * P.sink * 1.2;
  hull.rotation.set(P.pitch, 0, P.roll);
  const group = new THREE.Group();
  group.add(hull);
  // plates thrown about it, half sunk
  const pb = new Builder();
  for (let i = 0; i < P.panels; i++) {
    const a = R() * TAU, r = W * 0.8 + R() * L * 0.45;
    pb.box((2 + R() * 3) * S, 0.25, (2 + R() * 4) * S, mat(Math.cos(a) * r, 0.3, Math.sin(a) * r * 1.3, (R() - 0.5) * 0.7, R() * TAU, (R() - 0.5) * 0.7), R() < 0.5 ? STONE[2] : STONE[3]);
  }
  group.add(new THREE.Mesh(pb.build(), mats.body));
  hull.updateMatrix();
  const lp = new THREE.Vector3(0, 0, -L / 2 + 1.5).applyMatrix4(hull.matrix);
  return {
    group, light: lp, focus: new THREE.Vector3(0, W * 0.35, 0), span: L * 0.55, clear: L * 0.62 + 8, height: W + 12 * S,
    update() {},
  };
}

// ------------------------------------------------------------------ stair
// A stair that turns about a column (or about nothing at all) and climbs to a landing,
// where a doorframe stands open on the fog. Every few treads one is lit at its edge.
function stair(d, A, mats) {
  const P = d.params, gl = new Builder(), S = d.size;
  const r = P.radius;
  const groups = [new Builder(), new Builder(), new Builder()];
  let top = 0;
  for (let i = 0; i < P.steps; i++) {
    const a = (i / P.per) * TAU, y = 1.2 + i * P.rise;
    top = y;
    const m = mat(Math.cos(a) * r, y, Math.sin(a) * r, 0, -a, 0);
    groups[i % 3].box(5 * S, 0.6 * S, 2.3 * S, m, STONE[(i % 2) + 1]);
    if (i % P.lit === P.lit - 1) gl.box(0.35, 0.3, 2.35 * S, mat(Math.cos(a) * (r + 2.55 * S), y + 0.2, Math.sin(a) * (r + 2.55 * S), 0, -a, 0), A, PULSE);
  }
  const body = new Builder();
  if (P.column) body.cyl(1.3 * S, 1.6 * S, top + 1, 10, mat(0, (top + 1) / 2, 0), STONE[0]);
  // the landing and the door
  const la = (P.steps / P.per) * TAU, ly = top + P.rise;
  const lx = Math.cos(la) * r * 0.6, lz = Math.sin(la) * r * 0.6;
  body.cyl(r * 0.85, r * 0.75, 0.8 * S, 12, mat(lx, ly, lz), STONE[1]);
  const dh = 7 * S, dw = 3.4 * S;
  const dm = (x, y) => mat(lx + Math.cos(la) * x, ly + y, lz + Math.sin(la) * x, 0, -la + Math.PI / 2, 0);
  if (P.door) {
    body.box(0.8 * S, dh, 0.9 * S, dm(-dw / 2, dh / 2), STONE[0]);
    body.box(0.8 * S, dh, 0.9 * S, dm(dw / 2, dh / 2), STONE[0]);
    body.box(dw + 1.6 * S, 0.9 * S, 1.1 * S, dm(0, dh + 0.4 * S), STONE[2]);
    gl.box(dw - 0.3, dh - 0.2, 0.1, dm(0, dh / 2), mixHex(A, 0xffffff, 0.2), PULSE);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(body.build(), mats.body));
  group.add(new THREE.Mesh(gl.build(), mats.glow));
  const treads = groups.map((g) => { const m = new THREE.Mesh(g.build(), mats.body); group.add(m); return m; });
  const H = ly + (P.door ? dh : 2);
  return {
    group, light: new THREE.Vector3(lx, ly + dh * 0.5, lz), focus: new THREE.Vector3(0, H * 0.5, 0), span: Math.max(H * 0.5, r * 1.5), clear: r + 10, height: H,
    update(t) { treads.forEach((m, i) => { m.position.y = Math.sin(t * 0.6 + i * 2.1) * 0.25; }); },
  };
}

// ------------------------------------------------------------------ arbor
// An elder tree, pale among the dark conifers, that branches by its own rule; light
// gathers at its tips and drips from them.
function arbor(d, A, mats) {
  const P = d.params, b = new Builder(), gl = new Builder(), R = rng(d.seed[5]), S = d.size;
  const tips = [];
  let maxY = 0, maxR = 0;
  const grow = (p, dir, len, w, depth) => {
    const end = p.clone().addScaledVector(dir, len);
    end.y -= P.droop * len * (1 - depth / (P.depth + 1));
    const mid = p.clone().lerp(end, 0.5).add(new THREE.Vector3((R() - 0.5) * len * 0.15, 0, (R() - 0.5) * len * 0.15));
    b.tube([p, mid, end], (t) => w * (1 - t * 0.38), 5, (t) => (depth === P.depth && t < 0.2 ? PALE2 : PALE));
    maxY = Math.max(maxY, end.y);
    maxR = Math.max(maxR, Math.hypot(end.x, end.z));
    if (depth === 0) { tips.push(end); return; }
    const side = Math.abs(dir.y) < 0.9 ? Y : X;
    for (let k = 0; k < P.spread; k++) {
      const yaw = (k / P.spread) * TAU + depth * P.twist + R() * 0.4;
      const perp = new THREE.Vector3().crossVectors(dir, side).normalize().applyAxisAngle(dir, yaw);
      const nd = dir.clone().applyAxisAngle(perp, P.angle * (0.8 + R() * 0.4));
      nd.y += 0.12;
      nd.normalize();
      grow(end, nd, len * 0.72, w * 0.64, depth - 1);
    }
  };
  grow(new THREE.Vector3(0, -1, 0), Y.clone(), P.trunk, 1.9 * S, P.depth);
  // roots, gripping the ground
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.4;
    b.tube([new THREE.Vector3(0, 2, 0), new THREE.Vector3(Math.cos(a) * 2.5 * S, 0.6, Math.sin(a) * 2.5 * S), new THREE.Vector3(Math.cos(a) * 5.5 * S, -0.4, Math.sin(a) * 5.5 * S)], (t) => 1.1 * S * (1 - t * 0.7), 4, PALE2);
  }
  // the fruit of light, and its drips
  tips.forEach((p, i) => {
    gl.ico(0.62 * S, 0, mat(p.x, p.y - 0.4, p.z), mixHex(A, 0xffffff, 0.25), i % 3 === 0 ? PULSE : 1.2);
    if (i % 2 === 0) { const l = 1.5 + (i % 5); beam(gl, new THREE.Vector3(p.x, p.y - 0.8, p.z), new THREE.Vector3(p.x, p.y - 0.8 - l, p.z), 0.12, A, 1); }
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gl.build(), mats.glow));
  const drip = motes(mixHex(A, 0xffffff, 0.4), 50, maxR * 0.9, maxY, d.seed[6], 0.4);
  group.add(drip);
  const base = drip.userData.base;
  return {
    group, light: new THREE.Vector3(0, maxY * 0.75, 0), focus: new THREE.Vector3(0, maxY * 0.55, 0), span: Math.max(maxR, maxY * 0.5), clear: maxR + 6, height: maxY,
    update(t) {
      // light falls from it, slowly, and is gone at the ground
      const a = drip.geometry.attributes.position;
      for (let i = 0; i < a.count; i++) {
        const ph = i * 1.9;
        a.setXYZ(i, base[i * 3] + Math.sin(t * 0.3 + ph) * 0.6, ((base[i * 3 + 1] - t * (1.2 + (i % 4) * 0.4)) % maxY + maxY) % maxY, base[i * 3 + 2] + Math.cos(t * 0.27 + ph) * 0.6);
      }
      a.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ pool
// A round pool, dark and perfectly level whatever the ground does; stones keep it; rings
// of light go out across it on its rhythm, and over it a stone hangs, turning, on a
// thread of light.
function pool(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), gl = new Builder(), S = d.size;
  const Rr = P.radius;
  let hi = -Infinity, lo = Infinity;
  for (let i = 0; i < 24; i++) for (const k of [0.5, 1]) {
    const a = (i / 24) * TAU, y = ctx.ground(Math.cos(a) * Rr * k, Math.sin(a) * Rr * k);
    hi = Math.max(hi, y); lo = Math.min(lo, y);
  }
  hi = Math.max(hi, ctx.ground(0, 0));
  const wy = hi + 0.35, depth = wy - lo + 1.5;
  b.cyl(Rr, Rr, depth, 40, mat(0, wy - depth / 2, 0), (x, y) => (y > depth / 2 - 0.05 ? 0x0b0d13 : STONE[1]));
  b.add(new THREE.TorusGeometry(Rr + 0.4, 0.55 * S, 4, 48), mat(0, wy, 0, Math.PI / 2, 0, 0), STONE[2]);
  for (let i = 0; i < P.stones; i++) {
    const a = (i / P.stones) * TAU, x = Math.cos(a) * (Rr + 2.6 * S), z = Math.sin(a) * (Rr + 2.6 * S);
    const gy = ctx.ground(x, z);
    slab(b, x, z, gy - 1, 2.2 * S, 5 + (i % 3) * 1.6, 1.3 * S, -a + Math.PI / 2, 0, STONE[i % 3]);
    gl.box(0.4, 0.4, 0.14, mat(Math.cos(a) * (Rr + 1.85 * S), gy + 3, Math.sin(a) * (Rr + 1.85 * S), 0, -a + Math.PI / 2, 0), A, i % 2 ? PULSE : 1);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gl.build(), mats.glow));
  // the stone over it
  const sb = new Builder();
  const SH = { ico: () => new THREE.IcosahedronGeometry(2.6 * S, 0), dodeca: () => new THREE.DodecahedronGeometry(2.6 * S, 0), octa: () => new THREE.OctahedronGeometry(2.9 * S, 0), box: () => new THREE.BoxGeometry(3.6 * S, 3.6 * S, 3.6 * S) }[P.shape]();
  roughen(SH, 0.25, 4);
  sb.add(SH, null, STONE[3], 0, { flat: true });
  sb.add(new THREE.TorusGeometry(3.3 * S, 0.16 * S, 3, 32), mat(0, 0, 0, Math.PI / 2, 0, 0), A, PULSE);
  const stone = new THREE.Mesh(sb.build(), mats.body);
  const sy = wy + P.float;
  stone.position.y = sy;
  group.add(stone);
  if (P.thread) {
    const tg = new THREE.CylinderGeometry(0.12, 0.12, P.float - 2.6 * S, 4, 1, true);
    paint(tg, mixHex(A, 0xffffff, 0.4), () => 0.8);
    const th = lightMesh(tg, { opacity: 0.7, fog: 0.8 });
    th.position.y = wy + (P.float - 2.6 * S) / 2;
    group.add(th);
  }
  // rings of light going out over the water
  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const rg = new THREE.RingGeometry(0.94, 1, 56, 1);
    rg.rotateX(-Math.PI / 2);
    paint(rg, mixHex(A, 0xffffff, 0.3), () => 1);
    const m = lightMesh(rg, { opacity: 0.5, fog: 0.8, side: THREE.DoubleSide });
    m.position.y = wy + 0.08;
    group.add(m);
    ripples.push(m);
  }
  return {
    group, light: new THREE.Vector3(0, sy, 0), focus: new THREE.Vector3(0, wy + P.float * 0.5, 0), span: Rr * 1.2, clear: Rr + 10, height: sy + 4,
    mats: ripples.map((m) => m.material),
    update(t, beat, c) {
      stone.rotation.y = t * 0.12;
      stone.rotation.x = Math.sin(t * 0.21) * 0.15;
      stone.position.y = sy + Math.sin(t * 0.5) * 0.4;
      ripples.forEach((m, i) => {
        const k = ((beat / 4) + i / 3) % 1;
        const rr = 0.5 + k * (Rr - 0.6);
        m.scale.set(rr, 1, rr);
        m.material.uniforms.uOpacity.value = 0.45 * (1 - k) * (c.reveal ?? 1);
      });
    },
  };
}

// ------------------------------------------------------------------ sentinel
// Cloaked figures, taller than the trees around them, standing in a ring; a lit slit
// where each face would be. Their heads turn, slowly, to follow the ship.
function sentinel(d, A, mats) {
  const P = d.params, R = rng(d.seed[5]), S = d.size;
  const H = P.height;
  const group = new THREE.Group();
  const bodies = new Builder();
  const heads = [];
  for (let i = 0; i < P.n; i++) {
    const a = (i / P.n) * TAU + 0.3;
    const x = Math.cos(a) * P.radius, z = Math.sin(a) * P.radius;
    const yaw = Math.atan2(-x, -z) + (P.facing === 'out' ? Math.PI : 0);
    const w = (4.4 + R() * 1) * S;
    const body = mat(x, 0, z, 0, yaw, 0);
    const robe = new THREE.CylinderGeometry(w * 0.42, w, H * 0.72, 7, 3);
    roughen(robe, 0.25, i + 3);
    robe.translate(0, H * 0.36 - 1, 0);
    bodies.add(robe, body, (px, py) => (py > H * 0.55 ? STONE[1] : STONE[0]), 0, { flat: true });
    bodies.add(new THREE.CylinderGeometry(w * 0.55, w * 0.46, H * 0.08, 7), new THREE.Matrix4().multiplyMatrices(body, mat(0, H * 0.74, 0)), STONE[2]);
    if (P.staff) {
      const sx = w * 0.75;
      const p0 = new THREE.Vector3(sx, -1, w * 0.25).applyMatrix4(body), p1 = new THREE.Vector3(sx, H * 0.95, w * 0.4).applyMatrix4(body);
      beam(bodies, p0, p1, 0.35 * S, STONE[3]);
      bodies.ico(0.7 * S, 0, mat(p1.x, p1.y + 0.5, p1.z), A, PULSE);
    }
    // the head: a hood with a dark face and a lit slit, on a pivot of its own
    const hb = new Builder();
    const hr = w * 0.48;
    if (P.hood === 'peak') hb.cone(hr, H * 0.2, 7, mat(0, H * 0.08, -hr * 0.15, -0.12, 0, 0), STONE[1]);
    else if (P.hood === 'round') hb.sphere(hr, 9, 7, mat(0, H * 0.04, -hr * 0.1, 0, 0, 0, 1, 1.25, 1.05), STONE[1]);
    else { hb.cyl(hr * 0.8, hr, H * 0.12, 7, mat(0, H * 0.05, -hr * 0.1), STONE[1]); hb.box(hr * 2.2, 0.6, hr * 2.3, mat(0, H * 0.115, -hr * 0.1), STONE[2]); }
    hb.box(hr * 1.1, hr * 0.95, 0.5, mat(0, H * 0.035, hr * 0.62), DARK);
    hb.box(hr * 1.0, 0.75 * S, 0.3, mat(0, H * 0.045, hr * 0.9), mixHex(A, 0xffffff, 0.3), PULSE);
    const head = new THREE.Group();
    head.position.set(x, H * 0.78, z);
    head.rotation.y = yaw;
    head.add(new THREE.Mesh(hb.build(), mats.body));
    group.add(head);
    heads.push({ head, x, z, yaw, cur: 0 });
  }
  group.add(new THREE.Mesh(bodies.build(), mats.body));
  const altar = new Builder();
  altar.cyl(2.4 * S, 3 * S, 1.4, 8, mat(0, 0.7, 0), STONE[2]);
  altar.ico(1.1 * S, 0, mat(0, 2.2, 0), A, PULSE);
  group.add(new THREE.Mesh(altar.build(), mats.body));
  return {
    group, light: new THREE.Vector3(0, 3, 0), focus: new THREE.Vector3(0, H * 0.55, 0), span: P.radius + 5, clear: P.radius + 11, height: H,
    update(t, beat, c) {
      if (!c || !c.shipLocal) return;
      for (const h of heads) {
        // the ship's bearing from the figure, against where its body faces
        let want = Math.atan2(c.shipLocal.x - h.x, c.shipLocal.z - h.z) - h.yaw;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        want = clamp(want, -1.1, 1.1);
        h.cur += (want - h.cur) * 0.012;
        h.head.rotation.y = h.yaw + Math.round(h.cur / 0.04) * 0.04;
      }
    },
  };
}

// ------------------------------------------------------------------ swarm
// Shards of light running a torus knot about a lit core over a ring of stone; as the
// ship comes near, the knot draws in.
function swarm(d, A, mats) {
  const P = d.params, S = d.size, R = rng(d.seed[5]);
  const H = P.height;
  const b = new Builder();
  for (let i = 0; i < 9; i++) slab(b, Math.cos((i / 9) * TAU) * 6 * S, Math.sin((i / 9) * TAU) * 6 * S, -1, 1.8 * S, 3 + (i % 3), 1.1 * S, -(i / 9) * TAU + Math.PI / 2, 0, STONE[i % 3]);
  b.ico(1.8 * S, 1, mat(0, H, 0), mixHex(A, 0xffffff, 0.3), PULSE);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const sh = new Builder();
  const G = { tetra: () => new THREE.TetrahedronGeometry(0.9 * S, 0), octa: () => new THREE.OctahedronGeometry(0.85 * S, 0), cube: () => new THREE.BoxGeometry(1.1 * S, 1.1 * S, 1.1 * S) }[P.shape]();
  sh.add(G, null, mixHex(A, 0xffffff, 0.35), 1);
  const im = new THREE.InstancedMesh(sh.build(), glowMaterial({ opacity: 0.9, fog: 0.7 }), P.n);
  im.layers.set(LAYER_FX);
  im.frustumCulled = false;
  group.add(im);
  const ph = Array.from({ length: P.n }, (_, i) => (i / P.n) * TAU * P.p + R() * 0.08);
  const spin = Array.from({ length: P.n }, () => R() * TAU);
  let near = 0;
  const e = new THREE.Euler();
  return {
    group, light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H, 0), span: P.radius * 1.5, clear: 12, height: H + P.radius * 0.6,
    mats: [im.material],
    update(t, beat, c) {
      near += ((c.near ?? 0) - near) * 0.02;
      const Rr = P.radius * (1 - near * 0.4);
      for (let i = 0; i < P.n; i++) {
        const u = ph[i] / P.p + t * P.speed;
        const r = Rr * (1 + 0.38 * Math.cos(P.q * u));
        _p.set(Math.cos(P.p * u) * r, H + Rr * 0.38 * Math.sin(P.q * u), Math.sin(P.p * u) * r);
        _q.setFromEuler(e.set(t * 0.9 + spin[i], t * 0.7 + spin[i], 0));
        im.setMatrixAt(i, _m.compose(_p, _q, _s.setScalar(1)));
      }
      im.instanceMatrix.needsUpdate = true;
      im.material.uniforms.uOpacity.value = (0.6 + (c.pulse ?? 1) * 0.3) * (c.reveal ?? 1);
    },
  };
}

// ------------------------------------------------------------------ cradle
// Ribs of pale bone rising out of the ground and closing over an egg; cracks in the egg,
// lit from inside; it breathes on its rhythm.
function cradle(d, A, mats) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size;
  const H = P.height, Rr = P.radius;
  for (let i = 0; i < P.ribs; i++) {
    const a = (i / P.ribs) * TAU + R() * 0.15;
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const s = k / 16;
      const r = Rr * (1.15 - Math.pow(s, 1.6) * P.curl * 0.95);
      const y = -1.5 + H * Math.sin(s * Math.PI * 0.5) * (1 - s * 0.12);
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    b.tube(pts, (t) => 1.25 * S * (1 - t * 0.78), 6, (t) => (i % 2 ? PALE : PALE2));
    for (let k = 3; k < 15; k += 4) { const p = pts[k]; b.ico(0.75 * S * (1 - k / 22), 0, mat(p.x, p.y, p.z), PALE); }
  }
  const nest = new Builder();
  const ng = new THREE.DodecahedronGeometry(3 * S, 0);
  roughen(ng, 0.5, 2);
  nest.add(ng, mat(0, 0.4, 0, 0, 0, 0, 1.3, 0.45, 1.3), STONE[1], 0, { flat: true });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(nest.build(), mats.body));
  // the egg, cracked; the cracks are lit
  const eb = new Builder();
  const E = P.egg;
  eb.sphere(E, 16, 12, mat(0, 0, 0, 0, 0, 0, 1, 1.32, 1), (x, y) => (y > E * 0.9 ? 0xe3e3d8 : 0xd2d6d0));
  const on = (u, v) => new THREE.Vector3(Math.cos(u) * Math.sin(v) * E * 1.01, Math.cos(v) * E * 1.32 * 1.01, Math.sin(u) * Math.sin(v) * E * 1.01);
  for (let c = 0; c < P.cracks; c++) {
    let u = R() * TAU, v = 0.4 + R() * 1.4;
    let p = on(u, v);
    for (let k = 0; k < 6; k++) {
      u += (R() - 0.5) * 0.5;
      v += (R() < 0.5 ? -1 : 1) * (0.12 + R() * 0.15);
      const q = on(u, v);
      beam(eb, p, q, 0.2 * S, mixHex(A, 0xffffff, 0.3), PULSE);
      p = q;
    }
  }
  const egg = new THREE.Mesh(eb.build(), mats.body);
  const ey = 0.9 + E * 1.25;
  egg.position.y = ey;
  group.add(egg);
  return {
    group, light: new THREE.Vector3(0, ey, 0), focus: new THREE.Vector3(0, H * 0.45, 0), span: Rr * 1.25, clear: Rr * 1.2 + 8, height: H,
    update(t, beat, c) {
      const s = 1 + ((c.pulse ?? 1) - 0.3) * 0.025;
      egg.scale.set(s, s, s);
      egg.rotation.y = t * 0.05;
    },
  };
}

// ------------------------------------------------------------------ lanterns
// Lanterns hung on nothing over a clearing, each tied to its stake by a line; they rise
// and fall out of step, and their light falls on the ground beneath.
function lanterns(d, A, mats, ctx) {
  const P = d.params, R = rng(d.seed[5]), S = d.size;
  const GA = Math.PI * (3 - Math.sqrt(5));
  const spots = [];
  const stakes = new Builder();
  for (let i = 0; i < P.n; i++) {
    const r = Math.sqrt((i + 0.5) / P.n) * P.area, a = i * GA;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, gy = ctx.ground(x, z);
    const h = gy + P.low + R() * (P.high - P.low);
    spots.push({ x, z, gy, h, ph: R() * TAU, sp: 0.35 + R() * 0.3 });
    if (P.tethered) {
      stakes.box(0.5 * S, 2.2, 0.5 * S, mat(x, gy + 0.6, z, 0, a, 0), STONE[3]);
      stakes.box(0.3, 0.3, 0.3, mat(x, gy + 1.8, z), A, 1);
    }
  }
  const group = new THREE.Group();
  if (!stakes.empty) group.add(new THREE.Mesh(stakes.build(), mats.body));
  const lb = new Builder();
  const lit = mixHex(A, 0xffffff, 0.3);
  if (P.shape === 'diamond') lb.add(new THREE.OctahedronGeometry(1.2 * S, 0), mat(0, 0, 0, 0, 0, 0, 1, 1.5, 1), lit, PULSE);
  else if (P.shape === 'box') lb.box(1.6 * S, 2.2 * S, 1.6 * S, null, lit, PULSE);
  else lb.cyl(1.05 * S, 1.05 * S, 2.1 * S, 8, null, lit, PULSE);
  lb.box(2 * S, 0.35 * S, 2 * S, mat(0, 1.35 * S, 0), DARK);
  lb.box(1.5 * S, 0.3 * S, 1.5 * S, mat(0, -1.3 * S, 0), DARK);
  const lm = new THREE.InstancedMesh(lb.build(), worldMaterial({ unique: true }), P.n);
  group.add(lm);
  const extra = [lm.material];
  let lines = null;
  if (P.tethered) {
    const unit = new Builder();
    unit.box(1, 1, 1, null, mixHex(A, 0xffffff, 0.5), 0.6);
    lines = new THREE.InstancedMesh(unit.build(), glowMaterial({ opacity: 0.45, fog: 0.8 }), P.n);
    lines.layers.set(LAYER_FX);
    lines.frustumCulled = false;
    group.add(lines);
    extra.push(lines.material);
  }
  const glow = motes(lit, P.n * 4, P.area, P.high, d.seed[6], 0.4);
  group.add(glow);
  const a0 = new THREE.Vector3(), a1 = new THREE.Vector3();
  const mid = (P.low + P.high) / 2 + spots.reduce((s, p) => s + p.gy, 0) / P.n;
  return {
    group, light: new THREE.Vector3(0, mid, 0), focus: new THREE.Vector3(0, mid, 0), span: P.area * 1.1, clear: P.area + 7, height: P.high + 3,
    mats: extra,
    update(t, beat, c) {
      spots.forEach((s, i) => {
        const y = s.h + Math.sin(t * s.sp + s.ph) * 1.4;
        const sway = Math.sin(t * 0.4 + s.ph) * 0.06;
        lm.setMatrixAt(i, _m.compose(_p.set(s.x, y, s.z), _q.setFromAxisAngle(X, sway), _s.setScalar(1.5)));
        if (lines) stick(lines, i, a0.set(s.x, s.gy + 1.9, s.z), a1.set(s.x, y - 2.4 * S, s.z), 0.1);
      });
      lm.instanceMatrix.needsUpdate = true;
      if (lines) { lines.instanceMatrix.needsUpdate = true; lines.material.uniforms.uOpacity.value = 0.4 * (c.reveal ?? 1); }
      driftMotes(glow, t);
    },
  };
}

// ------------------------------------------------------------------ dish
// A listening post: a great dish on a yoke, smaller ones about it, a lit feed at each
// focus; they turn to follow the ship (or keep to one point of the sky), and a light on
// the feed blinks out a slow count.
function makeDish(Rd, depth, A) {
  const b = new Builder();
  const pts = [];
  for (let i = 0; i <= 8; i++) { const r = (i / 8) * Rd; pts.push(new THREE.Vector2(r, (depth * r * r) / Rd)); }
  const lathe = new THREE.LatheGeometry(pts, 24);
  b.add(lathe, null, (x, y, z) => (Math.floor((Math.atan2(z, x) / TAU) * 24 + 24) % 3 === 0 ? 0x97acb0 : 0xb7c0c2), 0, { flat: true });
  b.add(new THREE.TorusGeometry(Rd, 0.18 * (Rd / 10) + 0.08, 3, 32), mat(0, depth * Rd, 0, Math.PI / 2, 0, 0), STONE[2]);
  const f = Rd / (4 * depth);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    beam(b, new THREE.Vector3(Math.cos(a) * Rd * 0.92, depth * Rd * 0.85, Math.sin(a) * Rd * 0.92), new THREE.Vector3(0, f, 0), 0.08 * Rd / 6 + 0.06, STONE[3]);
  }
  b.cyl(Rd * 0.06 + 0.15, Rd * 0.09 + 0.2, Rd * 0.12, 8, mat(0, f, 0), STONE[1]);
  b.ico(Rd * 0.035 + 0.15, 0, mat(0, f + Rd * 0.08, 0), A, PULSE);
  b.cyl(Rd * 0.12, Rd * 0.14, 0.5, 8, mat(0, -0.1, 0), STONE[1]);
  return { b, f };
}

function dish(d, A, mats) {
  const P = d.params, R = rng(d.seed[5]), S = d.size;
  const group = new THREE.Group();
  const units = [];
  const add = (x, z, Rd, mast) => {
    const base = new Builder();
    base.box(Rd * 0.5, mast * 0.5, Rd * 0.5, mat(x, mast * 0.25, z), STONE[1]);
    base.cyl(Rd * 0.18, Rd * 0.24, mast * 0.5, 8, mat(x, mast * 0.75, z), STONE[2]);
    group.add(new THREE.Mesh(base.build(), mats.body));
    const yaw = new THREE.Group();
    yaw.position.set(x, mast, z);
    const yoke = new Builder();
    yoke.cyl(Rd * 0.3, Rd * 0.3, 0.6, 12, null, STONE[3]);
    for (const sx of [-1, 1]) yoke.box(Rd * 0.08 + 0.2, Rd * 0.45, Rd * 0.12 + 0.2, mat(sx * Rd * 0.2, Rd * 0.22, 0), STONE[2]);
    yaw.add(new THREE.Mesh(yoke.build(), mats.body));
    const pitch = new THREE.Group();
    pitch.position.y = Rd * 0.42;
    const { b, f } = makeDish(Rd, P.depth, A);
    pitch.add(new THREE.Mesh(b.build(), worldMaterial({ unique: true, side: THREE.DoubleSide })));
    yaw.add(pitch);
    group.add(yaw);
    units.push({ yaw, pitch, x, z, mast: mast + Rd * 0.42, cy: R() * TAU, ce: 0.5 + R() * 0.6, f });
  };
  add(0, 0, P.radius, P.mast);
  for (let i = 0; i < P.small; i++) {
    const a = (i / Math.max(1, P.small)) * TAU + R() * 0.6, r = P.radius * 1.5 + R() * 6;
    add(Math.cos(a) * r, Math.sin(a) * r, P.radius * (0.3 + R() * 0.15), P.mast * (0.45 + R() * 0.2));
  }
  const extra = units.map((u) => u.pitch.children[0].material);
  const main = units[0];
  return {
    group, light: new THREE.Vector3(0, main.mast + main.f, 0), focus: new THREE.Vector3(0, P.mast * 0.9, 0), span: P.radius * 1.5, clear: P.radius * 1.6 + 12, height: P.mast + P.radius * 1.3,
    mats: extra,
    update(t, beat, c) {
      for (const u of units) {
        let yw = u.cy + Math.sin(t * 0.05 + u.cy) * 0.3, el = u.ce;
        if (P.tracks && c && c.shipLocal) {
          const dx = c.shipLocal.x - u.x, dz = c.shipLocal.z - u.z, dy = c.shipLocal.y - u.mast;
          yw = Math.atan2(dx, dz);
          el = clamp(Math.atan2(dy, Math.hypot(dx, dz)), 0.15, 1.3);
        }
        let da = yw - u.yaw.rotation.y;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        u.yaw.rotation.y += da * 0.01;
        u.pitch.rotation.x += ((Math.PI / 2 - el) - u.pitch.rotation.x) * 0.01;
      }
    },
  };
}

export const NEWER = { beacon, orrery, helix, tesseract, wreck, stair, arbor, pool, sentinel, swarm, cradle, lanterns, dish };
