import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { SEQ } from './generate.js';
import { STONE, RIM, PULSE, beam } from './parts.js';

// What stands on the mountains: wild artifacts found only there, built like the forest's
// (dark stone, pale rims, the artifact's one light on its pulse), and set on a summit or a
// ridge (field.js finds the high ground near where one would rise). The ground under them
// falls away, so their feet reach down into it.
//   cairns       stacked stones marching up the slope, their stones counting a sequence
//   banners      wind lines: poles, the lines between them, banners never still
//   relay        an old mast on its guy lines, a light that blinks and waits, dishes
//   door         a door cut into the mountain, a little open, lit from within
//   arch         a stone arch, threads of light hanging from it
//   observatory  a dome open on the fog, its telescope following a star
//   harp         a frame strung with light, its strings shivering on the rhythm
//   ice          a frozen fall: columns of ice down a cliff, lit from within

const PALE = 0xc2c9c9, ICE = [0xbfdbe6, 0xa9c8d6, 0x93b6c6, 0xd8ecf2], SNOW = 0xdfe5ec, DARK = 0x0f0e16;

// light that is drawn after the fog, faded in with the artifact (fx: the list it joins)
function lightMesh(geo, fx, opacity = 1, opts = {}) {
  const m = glowMaterial({ opacity, fog: 0.55, side: THREE.DoubleSide, ...opts });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}
function finish(out, update) {
  return {
    ...out,
    mats: out.fx.map(([m]) => m),
    update(t, beat, c) {
      for (const [m, o] of out.fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.75 + (c.pulse ?? 1) * 0.3);
      if (update) update(t, beat, c);
    },
  };
}
const rock = (r, detail, seed, amount = 0.3) => { const g = new THREE.IcosahedronGeometry(r, detail); roughen(g, r * amount, seed); return g; };

// ------------------------------------------------------------------ cairns
function cairns(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size;
  const seq = SEQ[P.seq](P.n), max = Math.max(...seq);
  const L = P.spacing * (P.n - 1);
  const spots = [];
  for (let i = 0; i < P.n; i++) {
    const t = i / Math.max(1, P.n - 1);
    let x, z;
    if (P.path === 'spiral') { const a = t * TAU * 1.2, r = (1 - t) * L * 0.35 + 4; x = Math.cos(a) * r; z = Math.sin(a) * r; }
    else if (P.path === 'zigzag') { x = (t - 0.5) * L * 0.8; z = (i % 2 ? 1 : -1) * P.spacing * 0.6; }
    else { x = (t - 0.5) * L; z = Math.sin(t * 3) * P.spacing; }
    spots.push([x, z]);
  }
  let top = null;
  spots.forEach(([x, z], i) => {
    const y0 = ctx.ground(x, z) - 0.6;
    const m = clamp(Math.round(3 + (seq[i] / max) * 6), 3, 9);
    const last = i === P.n - 1;
    const scale = (last ? 1.4 : 1) * 1.4 * S;
    let y = y0;
    for (let j = 0; j < m; j++) {
      const r = (1.6 - (j / m) * 0.9) * scale;
      const col = j === m - 1 && R() < 0.5 ? SNOW : STONE[(i + j) % 4];
      b.add(rock(r, 0, i * 31 + j, 0.25), mat(x + (R() - 0.5) * 0.4, y + r * 0.55, z + (R() - 0.5) * 0.4, R() * 0.4, R() * TAU, R() * 0.3, 1.3, 0.6, 1.2), col, 0, { flat: true });
      y += r * 1.05;
    }
    // what it counts: small lit stones about its foot
    const marks = clamp(Math.round(seq[i]), 1, 13);
    for (let k = 0; k < marks; k++) { const a = (k / marks) * TAU; b.box(0.4, 0.3, 0.4, mat(x + Math.cos(a) * 2.6 * scale, ctx.ground(x + Math.cos(a) * 2.6 * scale, z + Math.sin(a) * 2.6 * scale) + 0.1, z + Math.sin(a) * 2.6 * scale), A, PULSE); }
    if (last) { b.ico(0.9 * S, 1, mat(x, y + 0.6 * S, z), A, PULSE); top = new THREE.Vector3(x, y + 0.6 * S, z); }
  });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  return finish({ group, fx: [], light: top, focus: new THREE.Vector3(0, top.y * 0.5, 0), span: L * 0.55 + 6, clear: L * 0.55 + 8, height: top.y + 2 });
}

// ------------------------------------------------------------------ wind lines
// cloth that moves: panels hung from a line, each a small grid, rewritten every frame
function cloth(panels, mats) {
  const per = 3 * 2 * 6;                       // 3 x 2 quads, 2 triangles, 3 points
  const pos = new Float32Array(panels.length * per * 3), col = new Float32Array(panels.length * per * 3), em = new Float32Array(panels.length * per);
  const c = new THREE.Color();
  panels.forEach((p, i) => { c.setHex(p.color); for (let k = 0; k < per; k++) { col.set([c.r, c.g, c.b], (i * per + k) * 3); em[i * per + k] = p.em; } });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const mesh = new THREE.Mesh(g, mats.cloth);
  mesh.frustumCulled = false;
  const P = (p, u, v, t) => {
    // u along the line, v down the banner; it streams and ripples with the wind
    const sway = v * v * (Math.sin(t * 2.3 + p.ph + u * 2.1) * 0.5 + 0.6) * p.h * 0.5;
    const flap = v * Math.sin(t * 5.1 + p.ph * 1.7 + u * 3 + v * 2) * p.h * 0.12;
    return [p.x + p.dx * (u - 0.5) * p.w + p.nx * (sway + flap), p.y - v * p.h + Math.abs(flap) * 0.2, p.z + p.dz * (u - 0.5) * p.w + p.nz * (sway + flap)];
  };
  return {
    mesh,
    update(t) {
      let o = 0;
      for (const p of panels) for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) {
        const u0 = i / 3, u1 = (i + 1) / 3, v0 = j / 2, v1 = (j + 1) / 2;
        for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]]) { const q = P(p, u, v, t); pos[o++] = q[0]; pos[o++] = q[1]; pos[o++] = q[2]; }
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

function banners(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size;
  const poles = [];
  for (let i = 0; i < P.poles; i++) {
    const a = (i / Math.max(1, P.poles - 1) - 0.5) * 1.6, x = Math.sin(a) * P.span * 1.2, z = (1 - Math.cos(a)) * P.span * 0.6 - P.span * 0.3;
    const y0 = ctx.ground(x, z), h = P.height * (0.85 + R() * 0.3);
    b.cyl(0.22 * S, 0.32 * S, h + 2, 6, mat(x, y0 + h / 2 - 1, z), STONE[2]);
    b.ico(0.5 * S, 0, mat(x, y0 + h + 0.4, z), A, PULSE);
    poles.push(new THREE.Vector3(x, y0 + h, z));
  }
  const panels = [];
  const cols = [STONE[3], RIM, mixHex(A, 0xffffff, 0.2), PALE];
  for (let i = 1; i < poles.length; i++) {
    const a = poles[i - 1], c = poles[i];
    const dir = new THREE.Vector3().subVectors(c, a), len = dir.length();
    dir.normalize();
    const nx = -dir.z, nz = dir.x;
    // the line, sagging between the poles
    const pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(a.clone().lerp(c, t).add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * len * 0.08, 0))); }
    for (let k = 1; k < pts.length; k++) beam(b, pts[k - 1], pts[k], 0.08 * S, STONE[1]);
    for (let f = 0; f < P.flags; f++) {
      const t = (f + 0.5) / P.flags, p = a.clone().lerp(c, t);
      p.y -= Math.sin(Math.PI * t) * len * 0.08;
      const lit = (f + i) % 4 === 0;
      panels.push({ x: p.x, y: p.y, z: p.z, dx: dir.x, dz: dir.z, nx, nz, w: (len / P.flags) * 0.75, h: (len / P.flags) * 1.1, color: lit ? A : cols[(f + i) % cols.length], em: lit ? PULSE : 0, ph: R() * TAU });
    }
  }
  const cl = cloth(panels, mats);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body), cl.mesh);
  const hi = poles.reduce((p, q) => (q.y > p.y ? q : p));
  return finish({ group, fx: [], light: hi.clone(), focus: new THREE.Vector3(0, hi.y * 0.6, 0), span: P.span * 1.3, clear: P.span * 1.3 + 6, height: hi.y + 2 }, (t) => cl.update(t));
}

// ------------------------------------------------------------------ relay
function relay(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, H = P.height;
  const leg = (k, y) => { const r = (2.4 - 1.8 * (y / H)) * S, a = (k / P.sides) * TAU; return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r); };
  const steps = Math.round(H / (4 * S));
  for (let k = 0; k < P.sides; k++) {
    for (let s = 0; s < steps; s++) {
      const y0 = (s / steps) * H, y1 = ((s + 1) / steps) * H;
      beam(b, leg(k, y0 - (s === 0 ? 4 : 0)), leg(k, y1), 0.22 * S, STONE[3]);
      beam(b, leg(k, y0), leg((k + 1) % P.sides, y1), 0.1 * S, STONE[2]);
      beam(b, leg(k, y1), leg((k + 1) % P.sides, y1), 0.1 * S, STONE[2]);
    }
  }
  // guy lines down to the rock
  for (let k = 0; k < P.guys; k++) {
    const a = (k / P.guys) * TAU + 0.4, r = H * 0.7, ax = Math.cos(a) * r, az = Math.sin(a) * r;
    const g = new THREE.Vector3(ax, ctx.ground(ax, az), az);
    for (const f of [0.55, 0.92]) beam(b, leg(k % P.sides, H * f), g, 0.05 * S, RIM);
    b.box(1.2 * S, 1 * S, 1.2 * S, mat(ax, g.y + 0.3, az), STONE[1]);
  }
  for (let i = 0; i < P.dishes; i++) {
    const y = H * (0.45 + i * 0.16), a = i * 2.2, r = 2.6 * S;
    const m = mat(Math.cos(a) * r, y, Math.sin(a) * r, Math.PI / 2, -a + Math.PI / 2, 0);
    b.add(new THREE.SphereGeometry(2.2 * S, 10, 4, 0, TAU, 0, Math.PI * 0.32), m, PALE);
    b.cyl(0.12 * S, 0.12 * S, 1.6 * S, 4, mat(Math.cos(a) * (r + 1.2 * S), y, Math.sin(a) * (r + 1.2 * S), 0, 0, Math.PI / 2), A, PULSE);
  }
  // the hut at its foot
  b.box(5 * S, 3.4 * S, 4 * S, mat(4.5 * S, ctx.ground(4.5 * S, 0) + 1.2 * S, 0), STONE[1]);
  b.box(5.4 * S, 0.5 * S, 4.4 * S, mat(4.5 * S, ctx.ground(4.5 * S, 0) + 3 * S, 0), STONE[3]);
  b.box(1 * S, 0.8 * S, 0.1, mat(4.5 * S, ctx.ground(4.5 * S, 0) + 1.8 * S, 2.02 * S), A, 1.2);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the light at its top: it blinks its number, and waits
  const lb = new Builder();
  lb.ico(0.9 * S, 1, mat(0, H + 1.2 * S, 0), mixHex(A, 0xffffff, 0.3), 1);
  const fx = [];
  const lamp = lightMesh(lb.build(), fx, 1);
  group.add(lamp);
  const out = { group, fx, light: new THREE.Vector3(0, H, 0), focus: new THREE.Vector3(0, H * 0.5, 0), span: H * 0.45, clear: 12 * S, height: H + 2 * S, solid: { r: 8 * S, top: H + 2 * S, low: 0 } };
  return finish(out, (t, beat, c) => {
    const k = (t * 2) % (P.blink * 2 + 4);
    const on = k < P.blink * 2 && k % 2 < 1;
    lamp.material.uniforms.uOpacity.value = (on ? 1 : 0.08) * (c.reveal ?? 1);
  });
}

// ------------------------------------------------------------------ door
function door(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, H = P.height, W = P.width;
  // the rock it is cut into
  const g = rock(1, 1, 7, 0.34);
  g.scale(W * 1.5, H * 0.9, W * 0.9);
  b.add(g, mat(0, H * 0.45, -W * 0.75), (x, y, z, i) => STONE[(i >> 3) % 3], 0, { flat: true });
  // the frame: pillars and a lintel, its signs lit
  for (const s of [-1, 1]) b.box(W * 0.18, H, W * 0.28, mat(s * W * 0.59, H / 2, 0), STONE[3]);
  b.box(W * 1.4, H * 0.14, W * 0.32, mat(0, H + H * 0.07, 0), STONE[3]);
  for (let i = 0; i < P.glyphs; i++) {
    const x = ((i + 0.5) / P.glyphs - 0.5) * W * 1.1;
    b.box(W * 0.05, H * 0.08, 0.1, mat(x, H + H * 0.07, W * 0.17), A, i % 2 ? PULSE : 1);
    if (i % 3 === 0) b.box(W * 0.1, 0.25, 0.1, mat(x, H + H * 0.03, W * 0.17), A, 1);
  }
  // the two leaves, one a little open
  const lw = W * 0.5, lh = H * 0.97;
  b.box(lw, lh, W * 0.08, mat(-lw / 2, lh / 2, -W * 0.02), STONE[0]);
  b.box(lw, lh, W * 0.08, new THREE.Matrix4().makeTranslation(lw, 0, 0).multiply(new THREE.Matrix4().makeRotationY(-P.ajar)).multiply(new THREE.Matrix4().makeTranslation(-lw / 2, lh / 2, -W * 0.02)), STONE[0]);
  for (let i = 0; i < 5; i++) b.box(W * (1.3 - i * 0.12), 0.5 * S, 2 * S, mat(0, -1 + i * 0.5 * S, W * 0.35 + (4 - i) * 1.8 * S), STONE[(i + 1) % 4]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // what is behind it: light in the gap, spilling out
  const gb = new Builder();
  gb.box(W * 0.2, lh * 0.96, 0.2, mat(lw - W * 0.08, lh / 2, -W * 0.1), mixHex(A, 0xffffff, 0.5), 1);
  const g2 = new THREE.PlaneGeometry(W * 0.9, lh * 0.9);
  gb.add(g2, mat(lw * 0.6, lh * 0.45, W * 0.4, -0.4, 0.3, 0), (x, y) => mixHex(A, 0xffffff, 0.3), (x, y) => 0.25);
  const fx = [];
  group.add(lightMesh(gb.build(), fx, 0.9));
  const out = { group, fx, light: new THREE.Vector3(lw * 0.8, lh * 0.5, W * 0.2), focus: new THREE.Vector3(0, H * 0.55, 0), span: W * 1.3, clear: W * 1.6 + 6, height: H * 1.25, solid: { r: W * 1.2, top: H * 1.15, low: 0 } };
  return finish(out);
}

// ------------------------------------------------------------------ arch
function arch(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size;
  const half = P.span / 2;
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, x = (t - 0.5) * P.span;
    const yb = ctx.ground(x, 0) - 5;
    pts.push(new THREE.Vector3(x, yb + (P.rise + 5) * Math.sin(Math.PI * t) * (1 - 0.15 * Math.pow(2 * t - 1, 4)), Math.sin(t * 5) * P.thick * 0.2));
  }
  // rough-hewn: thick and thin along it, never quite round
  const lump = pts.map(() => 0.8 + R() * 0.45);
  pts.forEach((p, i) => { if (i > 0 && i < pts.length - 1) { p.x += (R() - 0.5) * P.thick * 0.5; p.z += (R() - 0.5) * P.thick * 0.6; } });
  b.tube(pts, (t) => P.thick * (1.25 - 0.6 * Math.sin(Math.PI * t)) * lump[Math.round(t * 24)], 6, (t) => STONE[Math.floor(t * 23) % 4]);
  // snow along its crown
  b.tube(pts.slice(5, 20).map((p) => p.clone().add(new THREE.Vector3(0, P.thick * 0.62, 0))), P.thick * 0.32, 5, SNOW);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // threads of light hanging from its underside, beads at their ends
  const gb = new Builder(), lb = new Builder();
  for (let i = 0; i < P.threads; i++) {
    const t = 0.2 + 0.6 * ((i + R() * 0.5) / P.threads), p = pts[Math.round(t * 24)].clone();
    p.y -= P.thick * 0.7;
    const L = (6 + R() * 14) * S;
    beam(gb, p, p.clone().add(new THREE.Vector3(0, -L, 0)), 0.1 * S, mixHex(A, 0xffffff, 0.3), 0.8);
    lb.ico(0.45 * S, 0, mat(p.x, p.y - L, p.z), A, PULSE);
  }
  group.add(new THREE.Mesh(lb.build(), mats.glow));
  const fx = [];
  group.add(lightMesh(gb.build(), fx, 0.8));
  const top = Math.max(...pts.map((p) => p.y));
  return finish({ group, fx, light: new THREE.Vector3(0, top - P.thick - 8 * S, 0), focus: new THREE.Vector3(0, top * 0.55, 0), span: half * 1.1, clear: half + 10, height: top + P.thick, solid: { r: half, top: top + P.thick, low: 0 } });
}

// ------------------------------------------------------------------ observatory
function observatory(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, Rd = P.radius, H = P.height;
  b.cyl(Rd, Rd * 1.08, H + 6, 16, mat(0, (H - 6) / 2, 0), STONE[1]);
  b.cyl(Rd * 1.1, Rd * 1.1, 0.8 * S, 16, mat(0, H, 0), STONE[3]);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.box(1 * S, 1.6 * S, 0.2, mat(Math.cos(a) * Rd * 1.02, H * 0.55, Math.sin(a) * Rd * 1.02, 0, -a + Math.PI / 2, 0), A, i % 2 ? 1 : PULSE); }
  b.box(2.2 * S, 3.6 * S, 0.4, mat(0, -1 + 1.8 * S, Rd * 1.06), DARK);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the dome turns, open on the fog, the telescope in it raised to its star
  const dome = new THREE.Group();
  dome.position.y = H;
  const db = new Builder();
  const slit = P.slit;
  db.add(new THREE.SphereGeometry(Rd * 1.02, 20, 10, 0, TAU, 0, Math.PI / 2), null, (x, y, z) => (y > Rd * 0.8 ? PALE : 0x97acb0), 0, { keep: (x, y, z) => !(z > 0 && Math.abs(x) < Rd * slit * 0.5) });
  const el = 0.85, sl = P.scope;
  const sm = new THREE.Matrix4().makeRotationX(-el);
  db.cyl(1.4 * S, 1.8 * S, sl, 10, sm.clone().multiply(new THREE.Matrix4().makeTranslation(0, sl * 0.25, 0)), STONE[3]);
  db.cyl(1.9 * S, 1.9 * S, 0.6 * S, 10, sm.clone().multiply(new THREE.Matrix4().makeTranslation(0, sl * 0.75, 0)), A, PULSE);
  db.box(Rd * 0.6, 2.5 * S, Rd * 0.6, mat(0, 1.2 * S, 0), STONE[2]);
  dome.add(new THREE.Mesh(db.build(), mats.body));
  group.add(dome);
  const tip = new THREE.Vector3(0, H + Math.cos(el) * sl * 0.75, Math.sin(el) * sl * 0.75);
  return finish({ group, fx: [], light: tip, focus: new THREE.Vector3(0, H * 0.8, 0), span: Rd * 1.6, clear: Rd * 1.6 + 6, height: H + Rd + sl * 0.5, solid: { r: Rd * 1.3, top: H + Rd, low: 0 } }, (t) => { dome.rotation.y = t * 0.02 + P.star; });
}

// ------------------------------------------------------------------ wind harp
function harp(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), S = d.size, H = P.height, W = P.width;
  for (const s of [-1, 1]) b.box(1.6 * S, H + 4, 1.6 * S, mat(s * W / 2, (H - 4) / 2, 0, 0, 0, s * 0.04), STONE[2]);
  const top = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; top.push(new THREE.Vector3((t - 0.5) * (W + 2 * S), H - Math.sin(t * Math.PI) * 2 * S + t * 3 * S, 0)); }
  b.tube(top, 0.9 * S, 6, STONE[3]);
  b.box(W, 1.2 * S, 1.4 * S, mat(0, 1, 0), STONE[1]);
  b.box(W + 4 * S, 2 * S, 5 * S, mat(0, -0.8, 0), STONE[0]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the strings: one, a half, a third... of the first, shivering when the rhythm plucks them
  const n = P.strings, M = 12;
  const strings = [];
  const pos = new Float32Array(n * (M - 1) * 6 * 3), col = new Float32Array(pos.length), em = new Float32Array(pos.length / 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, x = (t - 0.5) * W * 0.9, yTop = H - Math.sin(t * Math.PI) * 2 * S + t * 3 * S - 0.6 * S;
    const L = Math.max(3 * S, (yTop - 2) / (1 + i * 0.35));
    strings.push({ x, y0: yTop, L, amp: 0, ph: i * 1.7 });
    c.setHex(mixHex(A, 0xffffff, 0.2 + 0.5 * t));
    for (let k = 0; k < (M - 1) * 6; k++) { col.set([c.r, c.g, c.b], (i * (M - 1) * 6 + k) * 3); em[i * (M - 1) * 6 + k] = 1; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  const fx = [];
  group.add(lightMesh(geo, fx, 0.95));
  // a bead where each string ends
  const lb = new Builder();
  for (const s of strings) lb.ico(0.35 * S, 0, mat(s.x, s.y0 - s.L, 0), A, PULSE);
  group.add(new THREE.Mesh(lb.build(), mats.glow));
  let lastStep = -1;
  const out = { group, fx, light: new THREE.Vector3(0, H * 0.6, 0), focus: new THREE.Vector3(0, H * 0.55, 0), span: W * 0.75, clear: W * 0.8 + 6, height: H + 4 * S, solid: { r: W * 0.6, top: H + 4 * S, low: 0 } };
  return finish(out, (t, beat) => {
    const step = Math.floor(beat * 2);
    if (step !== lastStep) { lastStep = step; strings[(step * 5) % n].amp = 1; }
    let o = 0;
    const w = 0.09 * S;
    for (const s of strings) {
      s.amp *= 0.97;
      for (let k = 0; k < M - 1; k++) {
        const pt = (u) => { const off = Math.sin(Math.PI * u) * Math.sin(t * 40 + s.ph) * s.amp * 0.6 * S; return [s.x + off, s.y0 - u * s.L]; };
        const [xa, ya] = pt(k / (M - 1)), [xb, yb] = pt((k + 1) / (M - 1));
        for (const [x, y] of [[xa - w, ya], [xa + w, ya], [xb + w, yb], [xa - w, ya], [xb + w, yb], [xb - w, yb]]) { pos[o++] = x; pos[o++] = y; pos[o++] = 0; }
      }
    }
    geo.attributes.position.needsUpdate = true;
  });
}

// ------------------------------------------------------------------ frozen fall
function ice(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]), S = d.size, H = P.height, W = P.width;
  // the cliff it fell from
  const g = rock(1, 2, 13, 0.18);
  g.scale(W * 0.75, H * 0.6, W * 0.35);
  b.add(g, mat(0, H * 0.5, -W * 0.3), (x, y, z, i) => (y > H * 0.42 ? SNOW : STONE[(i >> 3) % 4]), 0, { flat: true });
  const gb = new Builder();
  for (let i = 0; i < P.columns; i++) {
    const t = (i + 0.5) / P.columns, x = (t - 0.5) * W * 0.8, len = H * (0.55 + 0.45 * Math.sin(Math.PI * t)) * (0.85 + R() * 0.3);
    const r = (1 + R() * 1.4) * S, z = R() * 2 * S;
    b.cyl(r * 0.5, r, len, 6, mat(x, H - len / 2, z), ICE[i % 4]);
    b.cone(r * 0.5, 2.5 * S, 6, mat(x, H - len - 1.2 * S, z, Math.PI, 0, 0), ICE[(i + 1) % 4]);
    beam(gb, new THREE.Vector3(x, H - 1, z + r * 0.2), new THREE.Vector3(x, H - len + 2, z + r * 0.2), 0.18 * S, mixHex(A, 0xffffff, 0.45), 0.9);
  }
  // the pool it froze into, cracked with light
  b.cyl(W * 0.55, W * 0.6, 1, 14, mat(0, ctx.ground(0, W * 0.3) + 0.2, W * 0.3), ICE[3]);
  for (let i = 0; i < 9; i++) { const a = R() * TAU, r = R() * W * 0.45; beam(gb, new THREE.Vector3(0, ctx.ground(0, W * 0.3) + 0.8, W * 0.3), new THREE.Vector3(Math.cos(a) * r, ctx.ground(0, W * 0.3) + 0.8, W * 0.3 + Math.sin(a) * r), 0.12 * S, A, 0.8); }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const fx = [];
  group.add(lightMesh(gb.build(), fx, 0.85));
  return finish({ group, fx, light: new THREE.Vector3(0, H * 0.5, 2 * S), focus: new THREE.Vector3(0, H * 0.5, 0), span: W * 0.65, clear: W * 0.7 + 6, height: H + 2, solid: { r: W * 0.55, top: H + 2, low: 0 } });
}

export const MOUNTAIN = { cairns, banners, relay, door, arch, observatory, harp, ice };

// the materials a mountain artifact needs beyond the usual: cloth that moves
export function mountainMats() { return { cloth: worldMaterial({ unique: true, side: THREE.DoubleSide }) }; }
