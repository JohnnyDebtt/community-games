import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { worldMaterial, glowMaterial, halo } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { rng, TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { SEQ } from './generate.js';
import { STONE, RIM, PULSE, Y, beam, flatSeg, slab, motes, driftMotes } from './parts.js';
import { NEWER } from './families.js';

// An artifact as geometry: dark masses in the codex's stone and shell ramps, selective
// pale rims, and one light of the moved seeker's colorway that pulses to its rhythm.
// build(d, ground) -> { group, update(t, beat, ctx), light: Vector3 (local), focus,
// clear (radius of the clearing), height, onPass?(shipLocal) }

// ------------------------------------------------------------------ families

function ring(d, A, mats) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]);
  const seq = SEQ[P.seq](P.n);
  const max = Math.max(...seq), min = Math.min(...seq);
  const tops = [];
  for (let i = 0; i < P.n; i++) {
    const a = (i / P.n) * TAU;
    const x = Math.cos(a) * P.radius, z = Math.sin(a) * P.radius;
    const k = max === min ? 1 : (seq[i] - min) / (max - min);
    const h = P.height * (0.42 + 0.58 * k);
    const w = R.range(2.4, 3.6) * d.size;
    const yaw = -a + Math.PI / 2;
    const col = STONE[i % 4];
    slab(b, x, z, -1.5, w, h + 1.5, 1.4 * d.size, yaw, P.lean * (R() - 0.3), col, R.range(0.55, 0.85));
    // its marks, on the face toward the center: one light per unit of its number
    const marks = P.seq === 'harmonic series' ? i + 1 : Math.min(13, Math.round(seq[i]));
    const ix = -Math.cos(a) * 0.78 * d.size, iz = -Math.sin(a) * 0.78 * d.size;
    for (let m = 0; m < marks; m++) {
      const my = h * 0.25 + (m / Math.max(marks, 1)) * h * 0.55;
      b.box(0.34, 0.34, 0.12, mat(x + ix, my, z + iz, 0, yaw, 0), A, PULSE);
    }
    tops.push(new THREE.Vector3(x, h, z));
  }
  if (P.lintels) {
    for (let i = 0; i < P.n; i += 2) {
      const a = tops[i], c = tops[(i + 1) % P.n];
      const y = Math.min(a.y, c.y) - 0.6;
      beam(b, new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(c.x, y, c.z), 1.3 * d.size, STONE[1]);
    }
  }
  // a ring of pale stones at its foot
  for (let i = 0; i < P.n * 4; i++) {
    const a = (i / (P.n * 4)) * TAU + 0.3;
    const g = new THREE.IcosahedronGeometry(0.7, 0);
    roughen(g, 0.3, i + 7);
    b.add(g, mat(Math.cos(a) * (P.radius + 4), 0.1, Math.sin(a) * (P.radius + 4), 0, a, 0, 1.2, 0.6, 1.0), RIM, 0, { flat: true });
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  // the heart
  const heart = new THREE.Group();
  const hb = new Builder();
  let lightY = 6;
  if (P.core === 'orb') { hb.ico(2.2 * d.size, 1, mat(0, 0, 0), A, PULSE); lightY = 9; heart.position.y = lightY; }
  else if (P.core === 'flame') { hb.cone(1.1 * d.size, 9 * d.size, 6, mat(0, 4.5 * d.size, 0), A, PULSE); lightY = 5; }
  else if (P.core === 'pit') {
    hb.cyl(5, 5, 0.4, 16, mat(0, 0.1, 0), 0x0f0e16);
    hb.add(new THREE.TorusGeometry(5.2, 0.35, 4, 24), mat(0, 0.35, 0, Math.PI / 2, 0, 0), A, PULSE);
    lightY = 2;
  } else { hb.cyl(3.5, 3.5, 0.3, 14, mat(0, 0.2, 0), A, PULSE); hb.cyl(2.2, 2.2, 0.3, 12, mat(0, 7, 0), A, PULSE); lightY = 4; }
  heart.add(new THREE.Mesh(hb.build(), mats.glow));
  group.add(heart);
  return {
    group, light: new THREE.Vector3(0, lightY, 0), focus: new THREE.Vector3(0, P.height * 0.45, 0), span: P.radius + 4,
    clear: P.radius + 11, height: P.height,
    update(t) { if (P.core === 'orb') { heart.position.y = lightY + Math.sin(t * 0.7) * 0.8; heart.rotation.y = t * 0.2; } },
  };
}

function obelisk(d, A, mats) {
  const P = d.params, b = new Builder();
  const segs = 10, H = P.height, W = P.width;
  const lift = P.float;
  for (let i = 0; i < segs; i++) {
    const k0 = i / segs, k1 = (i + 1) / segs;
    const r0 = W * (1 - k0 * 0.42), r1 = W * (1 - k1 * 0.42);
    const g = new THREE.CylinderGeometry(r1 / 1.414, r0 / 1.414, H / segs, P.sides, 1);
    b.add(g, mat(0, lift + H * (k0 + k1) / 2, 0, 0, P.twist * k0 + Math.PI / P.sides, 0), (x, y) => (i % 3 === 0 && y < 0 ? STONE[2] : STONE[0]), 0, { flat: true });
    // the seams: lit strips on some faces
    for (let s = 0; s < P.seams; s++) {
      const fa = P.twist * (k0 + 0.5 / segs) + (s / P.sides) * TAU * Math.floor(P.sides / P.seams) + (TAU / P.sides);
      const rr = ((r0 + r1) / 2 / 1.414) * Math.cos(Math.PI / P.sides) + 0.04;
      b.box(0.28, H / segs + 0.02, 0.1, mat(Math.cos(fa) * rr, lift + H * (k0 + k1) / 2, Math.sin(fa) * rr, 0, -fa + Math.PI / 2, 0), A, i % 2 === 0 ? PULSE : 1);
    }
  }
  b.cone(W * 0.58 / 1.414 * 1.1, W * 0.9, P.sides, mat(0, lift + H + W * 0.45, 0, 0, P.twist + Math.PI / P.sides, 0), STONE[1]);
  // marks along the first seam
  for (let m = 0; m < P.marks; m++) {
    const k = 0.12 + (m / P.marks) * 0.7;
    const fa = P.twist * k + TAU / P.sides;
    const rr = W * (1 - k * 0.42) / 1.414 * Math.cos(Math.PI / P.sides) + 0.12;
    b.box(0.7, 0.7, 0.14, mat(Math.cos(fa) * rr, lift + H * k, Math.sin(fa) * rr, 0, -fa + Math.PI / 2, 0), A, PULSE);
  }
  if (lift) {
    for (let i = 0; i < 9; i++) {
      const g = new THREE.IcosahedronGeometry(1.2 + (i % 3) * 0.5, 0);
      roughen(g, 0.5, i);
      b.add(g, mat(Math.cos(i * 2.4) * W * 0.8, 0.4, Math.sin(i * 2.4) * W * 0.8), STONE[i % 4], 0, { flat: true });
    }
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  let debris = null;
  if (P.debris) {
    const db = new Builder();
    for (let i = 0; i < P.debris; i++) {
      const a = (i / P.debris) * TAU, r = W * 1.9 + (i % 3);
      db.box(0.9, 0.9, 0.9, mat(Math.cos(a) * r, lift + H * (0.35 + 0.3 * ((i * 7) % 5) / 5), Math.sin(a) * r, i, i * 2, 0), STONE[i % 4]);
      if (i % 3 === 0) db.box(0.3, 0.3, 0.3, mat(Math.cos(a) * r, lift + H * 0.5 + 1.2, Math.sin(a) * r), A, PULSE);
    }
    debris = new THREE.Mesh(db.build(), mats.body);
    group.add(debris);
  }
  return {
    group, light: new THREE.Vector3(0, lift + H * 0.6, 0), focus: new THREE.Vector3(0, lift + H * 0.5, 0), span: H * 0.55, clear: W * 2.4 + 10, height: H + lift,
    update(t) {
      if (debris) debris.rotation.y = t * 0.05;
      if (lift) group.children[0].position.y = Math.sin(t * 0.4) * 0.5;
    },
  };
}

function orb(d, A, mats) {
  const P = d.params, R = rng(d.seed[5]);
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = P.height;
  group.add(body);
  const sb = new Builder();
  const r = P.radius;
  if (P.shell === 'cracked') {
    const g = new THREE.IcosahedronGeometry(r, 2);
    roughen(g, r * 0.04, 3);
    sb.add(g, null, (x, y, z) => (R() < 0.13 ? A : STONE[Math.floor(R() * 3)]), (x, y, z) => 0, { flat: true });
    // relight the crack faces: emissive where the color is the accent
    const geo = sb.build();
    const col = geo.attributes.color.array, em = geo.attributes.emissive.array;
    const ac = new THREE.Color(A);
    for (let i = 0; i < em.length; i++) if (Math.abs(col[i * 3] - ac.r) < 0.01 && Math.abs(col[i * 3 + 1] - ac.g) < 0.01) em[i] = PULSE;
    body.add(new THREE.Mesh(geo, mats.body));
  } else if (P.shell === 'pale') {
    sb.sphere(r, 16, 12, null, (x, y) => (Math.abs(y) < r * 0.12 ? STONE[0] : y > 0 ? 0xc2c9c9 : 0x97acb0));
    sb.add(new THREE.TorusGeometry(r * 1.01, r * 0.08, 4, 24), mat(0, 0, 0, Math.PI / 2, 0, 0), A, PULSE);
    body.add(new THREE.Mesh(sb.build(), mats.body));
  } else if (P.shell === 'banded') {
    sb.sphere(r, 16, 14, null, (x, y) => (Math.floor((y / r + 1) * 4.5) % 2 ? 0x627594 : STONE[1]));
    sb.add(new THREE.TorusGeometry(r * 1.005, r * 0.05, 4, 24), mat(0, r * 0.35, 0, Math.PI / 2, 0, 0, 0.94, 0.94, 1), A, PULSE);
    body.add(new THREE.Mesh(sb.build(), mats.body));
  } else {
    // an eye: it turns to follow the ship
    sb.sphere(r, 16, 12, null, STONE[0]);
    sb.cyl(r * 0.5, r * 0.5, 0.4, 16, mat(0, 0, r * 0.92, Math.PI / 2, 0, 0), 0xc2c9c9);
    sb.cyl(r * 0.24, r * 0.24, 0.6, 12, mat(0, 0, r * 0.97, Math.PI / 2, 0, 0), A, PULSE);
    body.add(new THREE.Mesh(sb.build(), mats.body));
    body.userData.eye = true;
  }
  const rings = [];
  for (let i = 0; i < P.rings; i++) {
    const rb = new Builder();
    const rr = r * (1.55 + i * 0.42);
    rb.add(new THREE.TorusGeometry(rr, r * 0.05, 4, 40), mat(0, 0, 0, Math.PI / 2, 0, 0), STONE[2]);
    const beads = [5, 7, 11][i];
    for (let k = 0; k < beads; k++) {
      const a = (k / beads) * TAU;
      rb.box(r * 0.14, r * 0.14, r * 0.14, mat(Math.cos(a) * rr, 0, Math.sin(a) * rr), A, PULSE);
    }
    const m = new THREE.Mesh(rb.build(), mats.body);
    const pivot = new THREE.Group();
    pivot.rotation.set(P.tilts[i], i * 1.1, 0);
    pivot.add(m);
    pivot.position.y = P.height;
    group.add(pivot);
    rings.push({ m, speed: 0.12 * P.ratios[i] * (i % 2 ? -1 : 1) });
  }
  if (P.column) {
    const cg = new THREE.CylinderGeometry(r * 0.35, r * 0.6, P.height, 10, 1, true);
    cg.translate(0, P.height / 2, 0);
    const n = cg.attributes.position.count;
    const col = new Float32Array(n * 3), em = new Float32Array(n);
    const c = new THREE.Color(A);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      em[i] = 0.05 + 0.25 * (cg.attributes.position.getY(i) / P.height);
    }
    cg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    cg.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
    const cm = new THREE.Mesh(cg, glowMaterial({ opacity: 0.8, side: THREE.DoubleSide }));
    cm.layers.set(LAYER_FX);
    group.add(cm);
  }
  const look = new THREE.Vector3();
  return {
    group, light: new THREE.Vector3(0, P.height, 0), focus: new THREE.Vector3(0, P.height, 0), span: r * 2.4, clear: 12, height: P.height + r,
    update(t, beat, ctx) {
      for (const g of rings) g.m.rotation.y = t * g.speed;
      body.position.y = P.height + Math.sin(t * 0.5) * 1.2;
      if (body.userData.eye && ctx && ctx.shipLocal) {
        look.copy(ctx.shipLocal).sub(body.position);
        const yaw = Math.atan2(look.x, look.z), pitch = -Math.atan2(look.y, Math.hypot(look.x, look.z));
        body.rotation.y += (yaw - body.rotation.y) * 0.02;
        body.rotation.x += (pitch - body.rotation.x) * 0.02;
      } else body.rotation.y = t * 0.03;
    },
  };
}

function caStep(row, rule) {
  const n = row.length, out = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const l = row[(i - 1 + n) % n], c = row[i], r = row[(i + 1) % n];
    out[i] = (rule >> ((l << 2) | (c << 1) | r)) & 1;
  }
  return out;
}

function lattice(d, A, mats) {
  const P = d.params, b = new Builder();
  let row = new Array(P.w).fill(0);
  row[Math.floor(P.w / 2)] = 1;
  const rows = [];
  for (let j = 0; j < P.h; j++) { rows.push(row); row = caStep(row, P.rule); }
  const group = new THREE.Group();
  const caps = [];
  const ox = ((P.w - 1) * P.spacing) / 2, oz = ((P.h - 1) * P.spacing) / 2;
  for (let j = 0; j < P.h; j++) {
    const cb = new Builder();
    for (let i = 0; i < P.w; i++) {
      const x = i * P.spacing - ox, z = j * P.spacing - oz;
      const on = rows[j][i];
      const h = on ? P.tall * (P.ramp ? 0.55 + 0.45 * (j / (P.h - 1)) : 1) : 1.6;
      b.box(1.0 * d.size, h + 2, 1.0 * d.size, mat(x, h / 2 - 1, z), on ? STONE[(i + j) % 3] : STONE[3]);
      if (on) cb.box(1.15 * d.size, 0.9, 1.15 * d.size, mat(x, h + 0.45, z), A, PULSE);
      else cb.box(0.5, 0.2, 0.5, mat(x, 1.7, z), A, 0.4);
    }
    const m = new THREE.Mesh(cb.build(), worldMaterial({ unique: true }));
    caps.push(m);
    group.add(m);
  }
  group.add(new THREE.Mesh(b.build(), mats.body));
  const span = Math.max(ox, oz);
  return {
    group, light: new THREE.Vector3(0, P.tall * 0.6, 0), focus: new THREE.Vector3(0, P.tall * 0.4, 0), span: span * 1.1, clear: span + 9, height: P.tall,
    update(t, beat) {
      // a wave of light rolls row by row, one row a beat
      const at = (beat * 1) % (P.h + 4);
      caps.forEach((m, j) => { m.material.uniforms.uPulse.value = 0.25 + Math.max(0, 1 - Math.abs(at - j) * 0.7) * 1.1; });
    },
    mats: caps.map((m) => m.material),
  };
}

function shell(d, A, mats) {
  const P = d.params, b = new Builder();
  const pts = [];
  const steps = Math.round(P.turns * 48);
  const k = Math.log(P.growth) / (Math.PI / 2);
  const a0 = P.radius / Math.exp(k * P.turns * TAU);
  const rad = [];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * P.turns * TAU;
    const r = a0 * Math.exp(k * th);
    pts.push(new THREE.Vector3(Math.cos(th) * r, Math.sin(th) * r, 0));
    rad.push(r * 0.34 + 0.3);
  }
  // pale shell banded in the growth lines, a dark seam at every chamber
  const bandCol = (t) => {
    const k = t * P.bands * 4;
    if (k % 4 < 0.35) return 0x3f4d5b;
    return Math.floor(k / 2) % 2 ? 0x97acb0 : 0xc2c9c9;
  };
  b.tube(pts, (t) => rad[Math.round(t * steps)], 10, bandCol);
  // the aperture: light from inside
  const end = pts[pts.length - 1], rEnd = rad[rad.length - 1];
  const dir = new THREE.Vector3().subVectors(end, pts[pts.length - 2]).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(Y, dir);
  b.add(new THREE.CylinderGeometry(rEnd * 0.86, rEnd * 0.86, 0.3, 14), new THREE.Matrix4().compose(end.clone().addScaledVector(dir, -0.5), q, new THREE.Vector3(1, 1, 1)), A, PULSE);
  if (P.chambers) {
    for (let i = 24; i < steps; i += 24) {
      const p = pts[i];
      b.ico(rad[i] * 0.25, 0, mat(p.x, p.y, rad[i] * 0.9), A, 1.2);
    }
  }
  const group = new THREE.Group();
  const m = new THREE.Mesh(b.build(), mats.body);
  m.rotation.set(0, 0, 0);
  const holder = new THREE.Group();
  holder.add(m);
  holder.rotation.set(-P.tilt, 0.4, 0);
  holder.position.y = P.radius * 0.62;
  group.add(holder);
  const lp = end.clone().applyEuler(holder.rotation).add(holder.position);
  return {
    group, light: lp, focus: new THREE.Vector3(0, P.radius * 0.5, 0), span: P.radius * 1.3, clear: P.radius * 1.2 + 6, height: P.radius * 1.6,
    update(t) { m.rotation.z = Math.sin(t * 0.08) * 0.02; },
  };
}

function crystal(d, A, mats) {
  const P = d.params, b = new Builder();
  const GA = Math.PI * (3 - Math.sqrt(5));
  const tips = new Builder();
  for (let i = 0; i < P.n; i++) {
    const a = i * GA;
    const r = Math.sqrt(i) * 3.2 * d.size * P.spread;
    const len = P.height * (1 - (i / P.n) * 0.78) * (0.9 + ((i * 7) % 5) * 0.05);
    const w = (2.2 - (i / P.n) * 1.2) * d.size;
    const tilt = Math.min(1.1, (r / (P.height * 0.5)) * 1.3 + 0.05);
    const m = mat(Math.cos(a) * r, -1, Math.sin(a) * r, 0, -a, 0);
    const lean = new THREE.Matrix4().makeRotationZ(-tilt);
    const M = new THREE.Matrix4().multiplyMatrices(m, lean);
    const body = new THREE.CylinderGeometry(w, w * 1.05, len, P.sides, 2);
    body.translate(0, len / 2, 0);
    b.add(body, M, (x, y) => (y > len * 0.62 ? 0x7b92a9 : y > len * 0.3 ? 0x627594 : 0x465b7d), (x, y) => (y > len * 0.55 ? 0.16 : 0.0), { flat: true });
    const tip = new THREE.ConeGeometry(w, w * 2.6, P.sides);
    tip.translate(0, len + w * 1.3, 0);
    tips.add(tip, M, mixHex(A, 0xffffff, 0.2), PULSE);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(tips.build(), mats.glow));
  return { group, light: new THREE.Vector3(0, P.height * 0.7, 0), focus: new THREE.Vector3(0, P.height * 0.45, 0), span: P.height * 0.7, clear: Math.sqrt(P.n) * 3.2 * P.spread + 12, height: P.height, update() {} };
}

function tether(d, A, mats) {
  const P = d.params, b = new Builder(), R = rng(d.seed[5]);
  const H = P.height;
  // the stake: broad at the top, a point driven into the ground
  const g = new THREE.CylinderGeometry(2.6, 0.5, H, 4, 4);
  g.rotateY(Math.PI / 4);
  b.add(g, mat(0, H / 2 - 3, 0), (x, y) => (y > H * 0.44 ? STONE[2] : STONE[0]), 0, { flat: true });
  b.box(6.4, 1.2, 6.4, mat(0, H - 2.4, 0, 0, Math.PI / 4, 0), STONE[1]);
  // vines wind up it
  for (let v = 0; v < P.vines; v++) {
    const pts = [];
    const ph = (v / P.vines) * TAU;
    for (let i = 0; i <= 50; i++) {
      const k = i / 50, y = -1 + k * (H - 3);
      const rr = (0.9 + (2.4 - 0.9) * (y / H)) + 0.6 + Math.sin(k * 23 + v) * 0.25;
      const a = ph + k * TAU * (1.6 + v * 0.3);
      pts.push(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    b.tube(pts, (t) => 0.45 * (1 - t * 0.6), 5, 0x0f0e16);
  }
  // roots: each splits in two, again and again
  const root = (p, dir, len, w, depth) => {
    const q = p.clone().addScaledVector(dir, len);
    q.y = Math.min(q.y, p.y + 0.2) - 0.15;
    b.tube([p, p.clone().lerp(q, 0.5).add(new THREE.Vector3(0, 0.4, 0)), q], w, 4, 0x0f0e16);
    if (depth <= 0) return;
    for (const s of [-1, 1]) {
      const nd = dir.clone().applyAxisAngle(Y, s * (0.38 + R() * 0.25));
      root(q, nd, len * 0.66, w * 0.68, depth - 1);
    }
  };
  for (let r = 0; r < P.roots; r++) {
    const a = (r / P.roots) * TAU + R() * 0.5;
    root(new THREE.Vector3(Math.cos(a) * 1.2, 0.2, Math.sin(a) * 1.2), new THREE.Vector3(Math.cos(a), -0.02, Math.sin(a)), 7 * d.size, 0.55, P.depth);
  }
  const top = new Builder();
  top.ico(1.5, 1, mat(0, 0, 0), 0xd6edf5, PULSE);
  const core = new THREE.Mesh(top.build(), mats.glow);
  core.position.y = H + 0.6;
  if (P.cage) {
    for (let i = 0; i < 5; i++) {
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const a = (i / 5) * TAU + k * 0.12;
        const e = (k / 12) * Math.PI;
        pts.push(new THREE.Vector3(Math.cos(a) * Math.sin(e) * 3.2, H - 1.8 + (1 - Math.cos(e)) * 2.6, Math.sin(a) * Math.sin(e) * 3.2));
      }
      b.tube(pts, 0.22, 4, 0x0f0e16);
    }
  }
  const group = new THREE.Group();
  const stake = new THREE.Mesh(b.build(), mats.body);
  group.add(stake);
  group.add(core);
  group.rotation.z = P.tilt;
  return {
    group, light: new THREE.Vector3(0, H + 0.6, 0), focus: new THREE.Vector3(0, H * 0.5, 0), span: H * 0.55, clear: 7 * d.size * 2.2 + 6, height: H,
    update(t) { core.rotation.y = t * 0.4; core.position.y = H + 0.6 + Math.sin(t * 1.1) * 0.25; },
  };
}

function fungi(d, A, mats) {
  const P = d.params, b = new Builder(), gl = new Builder(), R = rng(d.seed[5]);
  const caps = [];
  for (let i = 0; i < P.n; i++) {
    const a = i * 2.39996, r = i === 0 ? 0 : 3 + Math.sqrt(i) * 3.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = P.height * (i === 0 ? 1 : 0.35 + R() * 0.5);
    const cr = (i === 0 ? 5.2 : 2 + R() * 2.4) * d.size;
    const bend = (R() - 0.5) * 0.25;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      pts.push(new THREE.Vector3(x + Math.sin(t * 2) * bend * h, t * h, z + Math.cos(t * 1.7) * bend * h * 0.6));
    }
    b.tube(pts, (t) => (0.75 - t * 0.3) * (i === 0 ? 1.6 : 1) * d.size, 6, (t) => (t < 0.15 ? 0x97acb0 : 0xc2c9c9));
    const top = pts[pts.length - 1];
    const capCol = R() < 0.5 ? 0x465b7d : 0x627594;
    if (P.capShape === 'dome') b.sphere(cr, 10, 5, mat(top.x, top.y - cr * 0.15, top.z, 0, 0, 0, 1, 0.55, 1), capCol, 0, 0, TAU, 0, Math.PI / 2);
    else if (P.capShape === 'cone') b.cone(cr, cr * 1.4, 9, mat(top.x, top.y + cr * 0.55, top.z), capCol);
    else if (P.capShape === 'plate') b.cyl(cr * 0.9, cr * 1.15, cr * 0.25, 12, mat(top.x, top.y + 0.2, top.z), capCol);
    else b.cyl(cr * 0.35, cr, cr * 0.9, 12, mat(top.x, top.y + cr * 0.2, top.z), capCol);
    // the glowing gills underneath
    gl.cyl(cr * 0.95, cr * 0.4, 0.3, 12, mat(top.x, top.y - 0.1, top.z), A, PULSE);
    caps.push(top);
  }
  // threads of light between their feet
  for (let i = 0; i < P.threads; i++) {
    const a = caps[Math.floor(R() * caps.length)], c = caps[Math.floor(R() * caps.length)];
    if (a === c) continue;
    const p0 = new THREE.Vector3(a.x, 0.1, a.z), p1 = new THREE.Vector3(c.x, 0.1, c.z);
    const mid = p0.clone().lerp(p1, 0.5).add(new THREE.Vector3((R() - 0.5) * 6, 0, (R() - 0.5) * 6));
    flatSeg(gl, p0, mid, 0.35, A, 1.0);
    flatSeg(gl, mid, p1, 0.35, A, 1.0);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  group.add(new THREE.Mesh(gl.build(), mats.glow));
  const sp = motes(mixHex(A, 0xffffff, 0.4), 60, 18, P.height, d.seed[6], 0.45);
  group.add(sp);
  return {
    group, light: new THREE.Vector3(0, P.height * 0.8, 0), focus: new THREE.Vector3(0, P.height * 0.5, 0), span: P.height * 0.7, clear: 3 + Math.sqrt(P.n) * 3.4 + 8, height: P.height,
    update(t) { driftMotes(sp, t); },
  };
}

function gate(d, A, mats, ctx) {
  const P = d.params;
  const group = new THREE.Group();
  const rings = [];
  const y0 = ctx.ringY;
  const b = new Builder();
  for (let i = 0; i < P.n; i++) {
    const z = (i - (P.n - 1) / 2) * P.spacing;
    const rb = new Builder();
    const segs = P.segments;
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * TAU + 0.06, a1 = ((s + 1) / segs) * TAU - 0.06;
      const am = (a0 + a1) / 2;
      const len = 2 * P.radius * Math.sin((a1 - a0) / 2);
      rb.box(len, 1.6, 2.2, mat(Math.cos(am) * P.radius, Math.sin(am) * P.radius, 0, 0, 0, am + Math.PI / 2), STONE[s % 3]);
      rb.box(0.9, 0.9, 2.6, mat(Math.cos(a1 + 0.06) * P.radius, Math.sin(a1 + 0.06) * P.radius, 0), A, PULSE);
    }
    const mat_ = worldMaterial({ unique: true });
    const m = new THREE.Mesh(rb.build(), mat_);
    m.position.set(0, y0, z);
    group.add(m);
    rings.push({ m, z, lit: 0 });
    if (P.legs) {
      for (const sx of [-1, 1]) {
        const a = new THREE.Vector3(sx * P.radius * 0.7, y0 - P.radius * 0.7, z);
        beam(b, new THREE.Vector3(sx * P.radius * 0.95, -1, z), a, 1.5, STONE[1]);
      }
    }
  }
  if (!b.empty) group.add(new THREE.Mesh(b.build(), mats.body));
  const L = ((P.n - 1) * P.spacing) / 2;
  return {
    group, light: new THREE.Vector3(0, y0, 0), focus: new THREE.Vector3(0, y0, 0), span: Math.max(P.radius * 1.4, L), clear: 0, height: y0 + P.radius,
    clearings: P.legs ? rings.map((r) => [0, r.z, P.radius + 6]) : [],
    passed: 0,
    update(t, beat, c) {
      for (const r of rings) {
        r.lit = Math.max(0, r.lit - 0.004);
        r.m.material.uniforms.uPulse.value = (c ? c.pulse : 1) * 0.5 + r.lit * 1.6;
        r.m.rotation.z = t * 0.03 * (rings.indexOf(r) % 2 ? 1 : -1);
      }
    },
    // the ship in local space: light each ring it passes through
    onShip(local, prev) {
      let n = 0;
      for (const r of rings) {
        if ((prev.z - r.z) * (local.z - r.z) <= 0 && prev.z !== local.z) {
          const dy = local.y - y0;
          if (Math.hypot(local.x, dy) < P.radius) { r.lit = 1; n++; }
        }
      }
      return n;
    },
    rings,
  };
}

const POLYGEO = {
  tetrahedron: () => new THREE.TetrahedronGeometry(1, 0), cube: () => new THREE.BoxGeometry(1.15, 1.15, 1.15),
  octahedron: () => new THREE.OctahedronGeometry(1, 0), dodecahedron: () => new THREE.DodecahedronGeometry(1, 0),
  icosahedron: () => new THREE.IcosahedronGeometry(1, 0),
};

function solids(d, A, mats) {
  const P = d.params;
  const group = new THREE.Group();
  const spins = [];
  P.solids.forEach((name, i) => {
    const r = P.radius * [1, 0.6, 0.36][i];
    const g = POLYGEO[name]();
    const eg = new THREE.EdgesGeometry(g, 1);
    const p = eg.attributes.position;
    const b = new Builder();
    for (let k = 0; k < p.count; k += 2) {
      const a = new THREE.Vector3().fromBufferAttribute(p, k).multiplyScalar(r);
      const c = new THREE.Vector3().fromBufferAttribute(p, k + 1).multiplyScalar(r);
      beam(b, a, c, 0.55 + 0.2 * (2 - i), i === 0 ? STONE[2] : A, i === 0 ? 0 : PULSE);
      b.ico(0.75 + 0.2 * (2 - i), 0, mat(a.x, a.y, a.z), i === 0 ? A : STONE[0], i === 0 ? PULSE : 0);
    }
    const m = new THREE.Mesh(b.build(), i === 0 ? mats.body : mats.glow);
    const piv = new THREE.Group();
    piv.position.y = P.height;
    piv.rotation.set(i * 0.7, i * 1.3, 0);
    piv.add(m);
    group.add(piv);
    spins.push({ m, s: P.speeds[i] * 0.05, axis: i });
  });
  // a dark stone below it, cracked
  const sb = new Builder();
  const g = new THREE.DodecahedronGeometry(4, 0);
  roughen(g, 0.8, 5);
  sb.add(g, mat(0, 1.5, 0, 0, 0, 0, 1.3, 0.6, 1.3), STONE[1], 0, { flat: true });
  group.add(new THREE.Mesh(sb.build(), mats.body));
  const dust = motes(0xd6edf5, 40, P.radius * 1.5, P.height * 1.3, d.seed[6], 0.35);
  group.add(dust);
  return {
    group, light: new THREE.Vector3(0, P.height, 0), focus: new THREE.Vector3(0, P.height * 0.8, 0), span: P.radius * 1.8, clear: 10, height: P.height + P.radius,
    update(t) {
      for (const s of spins) {
        if (s.axis === 0) s.m.rotation.y = t * s.s;
        else if (s.axis === 1) s.m.rotation.x = t * s.s;
        else s.m.rotation.z = t * s.s;
      }
      driftMotes(dust, t);
    },
  };
}

function hilbert(order) {
  const n = 1 << order, pts = [];
  for (let d = 0; d < n * n; d++) {
    let x = 0, y = 0, t = d;
    for (let s = 1; s < n; s *= 2) {
      const rx = 1 & (t >> 1), ry = 1 & (t ^ rx);
      if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } const tmp = x; x = y; y = tmp; }
      x += s * rx; y += s * ry; t >>= 2;
    }
    pts.push([x / (n - 1) * 2 - 1, y / (n - 1) * 2 - 1]);
  }
  return pts;
}

function glyph(d, A, mats, ctx) {
  const P = d.params, b = new Builder(), sb = new Builder();
  const R = P.radius;
  const g = (x, z) => new THREE.Vector3(x, ctx.ground(x, z), z);
  const lines = [];
  const poly = (list, closed) => { for (let i = 0; i < list.length - (closed ? 0 : 1); i++) lines.push([list[i], list[(i + 1) % list.length]]); };
  if (P.kind === 'star') {
    const pts = [];
    for (let i = 0; i < P.n; i++) { const a = (i / P.n) * TAU; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
    for (let i = 0; i < P.n; i++) lines.push([pts[i], pts[(i + P.k) % P.n]]);
    if (P.stones) for (const p of pts) slab(sb, p[0], p[1], -1, 2.6, 9, 1.4, Math.atan2(p[0], p[1]), 0, STONE[1]);
  } else if (P.kind === 'lissajous') {
    const list = [];
    for (let i = 0; i <= 160; i++) { const t = (i / 160) * TAU; list.push([Math.sin(P.a * t + P.phase) * R, Math.sin(P.b * t) * R]); }
    poly(list, false);
  } else if (P.kind === 'rose') {
    const list = [];
    const turns = P.k % 1 ? 6 : 2;
    for (let i = 0; i <= 240; i++) { const t = (i / 240) * Math.PI * turns; const r = Math.cos(P.k * t) * R; list.push([Math.cos(t) * r, Math.sin(t) * r]); }
    poly(list, false);
  } else if (P.kind === 'hilbert') {
    poly(hilbert(P.order).map(([x, y]) => [x * R * 0.72, y * R * 0.72]), false);
  } else if (P.kind === 'phyllotaxis') {
    const GA = Math.PI * (3 - Math.sqrt(5));
    for (let i = 1; i < P.n; i++) {
      const r = Math.sqrt(i / P.n) * R, a = i * GA;
      const p = g(Math.cos(a) * r, Math.sin(a) * r);
      b.cyl(0.9, 0.9, 0.3, 6, mat(p.x, p.y + 0.15, p.z), A, i % 3 === 0 ? PULSE : 1);
    }
  } else {
    for (let k = 1; k <= P.n; k++) {
      const list = [];
      const r = R / k;
      for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; list.push([Math.cos(a) * r, Math.sin(a) * r]); }
      poly(list, true);
    }
  }
  for (const [p, q] of lines) {
    // follow the ground: split long lines
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 6));
    for (let i = 0; i < n; i++) {
      const a = [p[0] + (q[0] - p[0]) * (i / n), p[1] + (q[1] - p[1]) * (i / n)];
      const c = [p[0] + (q[0] - p[0]) * ((i + 1) / n), p[1] + (q[1] - p[1]) * ((i + 1) / n)];
      flatSeg(b, g(a[0], a[1]), g(c[0], c[1]), 1.3, A, PULSE);
    }
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.glow));
  if (!sb.empty) group.add(new THREE.Mesh(sb.build(), mats.body));
  return {
    group, light: new THREE.Vector3(0, 8, 0), focus: new THREE.Vector3(0, 2, 0), span: R * 1.15, clear: R + 9, height: 10, flat: true,
    update() {},
  };
}

function chimes(d, A, mats) {
  const P = d.params, b = new Builder();
  const H = P.height, S = P.span;
  if (P.arch) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * S / 2, Math.sin(a) * H, 0)); }
    b.tube(pts, 1.1, 6, STONE[0]);
  } else {
    for (const s of [-1, 1]) slab(b, s * S / 2, 0, -1, 2.4, H + 1, 2.4, 0, 0, STONE[1], 0.8);
    b.box(S + 3, 1.6, 2.2, mat(0, H, 0), STONE[2]);
  }
  const group = new THREE.Group();
  group.add(new THREE.Mesh(b.build(), mats.body));
  const tubes = [];
  const L1 = H * 0.62;
  for (let i = 0; i < P.n; i++) {
    const x = (i / (P.n - 1) - 0.5) * S * 0.72;
    const topY = P.arch ? Math.sin(Math.acos(clamp((x / (S / 2)), -1, 1))) * H - 1.4 : H - 0.8;
    const len = L1 / (i + 1) + 2;
    const tb = new Builder();
    tb.cyl(0.45, 0.45, len, 7, mat(0, -len / 2, 0), i % 2 ? 0xc2c9c9 : 0x97acb0);
    tb.cyl(0.5, 0.5, 0.4, 7, mat(0, -len, 0), A, PULSE);
    tb.box(0.12, 1.2, 0.12, mat(0, 0.4, 0), 0x0f0e16);
    const m = new THREE.Mesh(tb.build(), mats.body);
    const piv = new THREE.Group();
    piv.position.set(x, topY, 0);
    piv.add(m);
    group.add(piv);
    tubes.push({ piv, ph: i * 1.3, amp: 0.02 });
  }
  return {
    group, light: new THREE.Vector3(0, H * 0.6, 0), focus: new THREE.Vector3(0, H * 0.55, 0), span: S * 0.7, clear: S / 2 + 10, height: H,
    update(t, beat, c) {
      const near = c && c.near ? c.near : 0;
      for (const tb of tubes) {
        tb.amp += ((0.03 + near * 0.18) - tb.amp) * 0.01;
        tb.piv.rotation.z = Math.sin(t * (0.9 + tb.ph * 0.07) + tb.ph) * tb.amp;
        tb.piv.rotation.x = Math.cos(t * 0.7 + tb.ph) * tb.amp * 0.5;
      }
    },
    tubes,
  };
}

// A witnessed artifact: the seeker that moved, itself, as a giant (its voxel model from
// its own collection art, built by the field before this: ctx.seeker), hovering over a
// figure of light on the forest floor, breathing up and down and turning, slowly, to
// watch the ship.
function echo(d, A, mats, ctx) {
  const P = d.params;
  const group = new THREE.Group();
  const floor = glyph({ ...d, params: P.glyph }, A, mats, ctx);
  group.add(floor.group);
  const m = ctx.seeker;
  const H = 54 * P.scale;
  const mid = P.hover + H * 0.55;
  let facing = 0, last = 0;
  const look = new THREE.Vector3();
  const out = {
    group, light: new THREE.Vector3(0, mid, H * 0.2), axis: new THREE.Vector3(0, 0, 0), focus: new THREE.Vector3(0, mid, 0), span: H * 0.62,
    clear: Math.max(H * 0.45, P.glyph.radius * 0.7) + 8, height: P.hover + H, mats: [],
    update(t, beat, c) {
      if (!m) return;
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      m.root.position.y = mid + Math.sin(t * 0.45) * H * 0.025;
      if (c && c.shipLocal) {
        look.copy(c.shipLocal);
        const want = Math.atan2(look.x, look.z);
        let da = want - facing;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        facing += da * Math.min(1, dt * 0.35);
      }
      // turned on the 12 fps grid, as the companion turns in the cabin
      m.root.rotation.y = Math.round(facing / 0.03) * 0.03;
      m.update(dt, t, Math.floor(t * 12), 0);
    },
  };
  if (m) {
    m.root.position.y = mid;
    group.add(m.root);
    out.mats.push(m.material, m.glowMat);
  }
  return out;
}

const BUILD = { ring, obelisk, orb, lattice, shell, crystal, tether, fungi, gate, solids, glyph, chimes, echo, ...NEWER };

// ctx: { ground(lx, lz) -> local y, ringY, seeker (a witnessed one's SeekerModel, built) }
export function buildArtifact(d, ctx) {
  const mats = { body: worldMaterial({ unique: true }), glow: worldMaterial({ unique: true }) };
  const A = d.accent;
  const out = BUILD[d.family](d, A, mats, ctx);
  out.mats = [mats.body, mats.glow, ...(out.mats || [])];
  // motes of its light, for every artifact but those that already have them
  if (!['fungi', 'solids'].includes(d.family)) {
    const m = motes(mixHex(A, 0xffffff, 0.35), 26, Math.max(10, out.span * 0.8), Math.max(10, out.height), d.seed[7], 0.4);
    out.group.add(m);
    const up = out.update;
    out.update = (t, beat, c) => { up(t, beat, c); driftMotes(m, t); };
  }
  const h = halo(A, Math.max(8, out.span * 0.5) * (d.special ? 1.5 : d.grand ? 1.3 : 1), 0.55 * d.strength);
  h.position.copy(out.light);
  h.layers.set(LAYER_FX);
  out.group.add(h);
  out.halo = h;
  if (d.special) aura(out, d, true);
  else if (d.grand) aura(out, d, false);
  return out;
}

// A column of light rising through the fog from its heart, a ring going out across the
// ground on its rhythm, and motes climbing the column: a grand wild artifact's, in its
// own light. A witnessed artifact (a seeker moved while everyone flew) has it in the
// network's gold, and a crown of light turning high over the seeker's head, so it reads
// from far off as the network's moment.
const GOLD = 0xe8d6a0;

function aura(out, d, gold) {
  const A = d.accent, pale = gold ? mixHex(GOLD, A, 0.22) : mixHex(A, 0xffffff, 0.45);
  const ax = out.axis || out.light;     // where the column stands
  const fade = (geo, f, color = pale) => {
    const p = geo.attributes.position, n = p.count;
    const col = new Float32Array(n * 3), em = new Float32Array(n);
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) { col.set([c.r, c.g, c.b], i * 3); em[i] = Math.max(0.0001, f(p.getX(i), p.getY(i), p.getZ(i))); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
    return geo;
  };
  const H = 300, r0 = Math.max(1.8, out.span * 0.09);
  const colGeo = new THREE.CylinderGeometry(r0 * 1.7, r0, H, 14, 8, true);
  colGeo.translate(0, H / 2, 0);
  fade(colGeo, (x, y) => Math.pow(1 - y / H, 1.5) * (0.35 + 0.65 * Math.min(1, y / 12)));
  const colMat = glowMaterial({ opacity: 0.36, fog: 0.5, fresnel: 0.85, side: THREE.DoubleSide });
  const column = new THREE.Mesh(colGeo, colMat);
  column.position.set(ax.x, 0, ax.z);
  column.layers.set(LAYER_FX);
  column.frustumCulled = false;
  out.group.add(column);
  // the ring on the ground
  const R = Math.max(18, out.span * 1.3);
  const ringGeo = new THREE.RingGeometry(0.9, 1, 64, 1);
  ringGeo.rotateX(-Math.PI / 2);
  fade(ringGeo, () => 1);
  const ringMat = glowMaterial({ opacity: 0.5, fog: 0.8, side: THREE.DoubleSide });
  const ringMesh = new THREE.Mesh(ringGeo, ringMat);
  ringMesh.position.set(ax.x, 0.6, ax.z);
  ringMesh.layers.set(LAYER_FX);
  ringMesh.frustumCulled = false;
  out.group.add(ringMesh);
  // the crown: two rings of gold segments over its head, turning against each other
  const crownY = out.height + 9;
  const crown = new THREE.Group();
  crown.position.set(ax.x, crownY, ax.z);
  const rings = [];
  for (const [rad, n, w, sp] of gold ? [[Math.max(9, out.span * 0.42), 12, 1.1, 0.12], [Math.max(6, out.span * 0.3), 7, 0.7, -0.2]] : []) {
    const cb = new Builder();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = a0 + (TAU / n) * 0.62;
      const am = (a0 + a1) / 2, len = 2 * rad * Math.sin((a1 - a0) / 2);
      cb.box(len, w, w, mat(Math.cos(am) * rad, 0, Math.sin(am) * rad, 0, -am + Math.PI / 2, 0), GOLD, 1);
      cb.box(w * 0.9, w * 2.6, w * 0.9, mat(Math.cos(a0) * rad, w * 1.3, Math.sin(a0) * rad), mixHex(GOLD, 0xffffff, 0.3), 1);
    }
    const geo = cb.build();
    const m = new THREE.Mesh(geo, glowMaterial({ opacity: 0.9, fog: 0.55 }));
    m.layers.set(LAYER_FX);
    m.frustumCulled = false;
    crown.add(m);
    rings.push({ m, sp });
  }
  if (gold) out.group.add(crown);
  // motes climbing the column
  const m = motes(pale, 70, r0 * 2.6, H * 0.5, d.seed[6], 0.6);
  m.position.set(ax.x, 0, ax.z);
  out.group.add(m);
  const base = m.userData.base;
  out.mats.push(colMat, ringMat, ...rings.map((r) => r.m.material));
  const up = out.update;
  out.update = (t, beat, c) => {
    up(t, beat, c);
    const pulse = c.pulse ?? 1, rv = c.reveal ?? 1;
    colMat.uniforms.uOpacity.value = (0.22 + pulse * 0.2) * rv;
    // one ring every four beats, out to R and gone
    const k = (beat / 4) % 1;
    const rr = 2 + k * R;
    ringMesh.scale.set(rr, 1, rr);
    ringMat.uniforms.uOpacity.value = 0.55 * (1 - k) * rv;
    for (const r of rings) {
      r.m.rotation.y = t * r.sp;
      r.m.material.uniforms.uOpacity.value = (0.55 + pulse * 0.35) * rv;
    }
    crown.position.y = crownY + Math.sin(t * 0.45) * 0.8;
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const ph = i * 2.31;
      a.setXYZ(i, base[i * 3] + Math.sin(t * 0.4 + ph) * 1.2, (base[i * 3 + 1] + t * (3 + (i % 5))) % (H * 0.5), base[i * 3 + 2] + Math.cos(t * 0.33 + ph) * 1.2);
    }
    a.needsUpdate = true;
  };
}
