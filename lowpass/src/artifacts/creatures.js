import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { stratum } from './strata.js';
import { SURFACE } from './species.js';
import { PULSE } from './parts.js';

// The creatures' bodies (species.js says how they flee; field.js flies them). Each is
// built about its own center, facing +z, floating: a body lit like the world, lit parts
// on the artifact's pulse, and light (wings, fins, threads) drawn after the fog. They
// move as they fly: wings beat, a ribbon swims, a bell breathes, faster when they run
// (c.fly: { speed, sprint, turn } from the field).

const W = 0xffffff;

// light, faded in with the artifact (fx: the list it joins)
function lightMesh(geo, fx, opacity) {
  const m = glowMaterial({ opacity, fog: 0.5, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}

// geometry whose points move: positions written each frame, colors and alpha once
function liveGeo(nv, colorOf, emOf) {
  const g = new THREE.BufferGeometry();
  const col = new Float32Array(nv * 3), em = new Float32Array(nv), c = new THREE.Color();
  for (let i = 0; i < nv; i++) { c.setHex(colorOf(i)); col.set([c.r, c.g, c.b], i * 3); em[i] = emOf(i); }
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nv * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  return g;
}

// a strip between two lines of points (a[i], b[i]), as triangles, written into pos at o
function stripInto(pos, o, a, b) {
  for (let i = 0; i < a.length - 1; i++) for (const p of [a[i], b[i], a[i + 1], b[i], b[i + 1], a[i + 1]]) { pos[o++] = p[0]; pos[o++] = p[1]; pos[o++] = p[2]; }
  return o;
}

// a wing of light: a long leaf, from its root along +x (or -x), its veins lit
function wingGeo(L, Wd, sd, color) {
  const b = new Builder();
  const P = (u, v) => [sd * u * L, 0, v * Wd * Math.pow(Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)), 0.7)];
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) {
    const u0 = i / 8, u1 = (i + 1) / 8, v0 = j - 1, v1 = j;
    b.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), color, 0.35 + 0.3 * (1 - u0));
  }
  return b.build();
}

// ------------------------------------------------------------------ the darter
function darter(pal, S, P, fx) {
  const g = new THREE.Group(), body = new Builder(), lit = new Builder();
  body.ico(1.4, 1, mat(0, 0, 1.5, 0, 0, 0, 1, 0.9, 1.3), pal.shellLo);
  body.sphere(1.05, 8, 6, mat(0, 0.2, 3.3), pal.dark);
  for (const s of [-1, 1]) lit.sphere(0.8, 8, 6, mat(s * 0.72, 0.4, 3.7), pal.light, PULSE);
  const n = 9;
  for (let i = 0; i < n; i++) {
    const r = 0.72 - (i / n) * 0.45, z = 0.2 - i * 1.25 * P.tail;
    body.cyl(r, r * 0.9, 1.2 * P.tail, 6, mat(0, 0, z, Math.PI / 2, 0, 0), i % 2 ? pal.shellLo : pal.shellHi);
  }
  lit.ico(0.45, 0, mat(0, 0, 0.2 - n * 1.25 * P.tail), pal.second, PULSE);
  const wings = [];
  for (const [z, L] of [[2.1, 9], [0.8, 8]]) for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.5, 0.9, z);
    w.add(lightMesh(wingGeo(L, 1.25, s, mixHex(pal.light, W, 0.3)), fx, 0.5));
    g.add(w);
    wings.push({ w, s, ph: z * 2 });
  }
  g.add(new THREE.Mesh(body.build(), null), new THREE.Mesh(lit.build(), null));
  g.scale.setScalar(S);
  let ph = 0;
  return {
    g, light: new THREE.Vector3(0, 0.6, 2).multiplyScalar(S), span: 9 * S, height: 3 * S,
    update(t, dt, f) {
      ph += dt * (24 + 14 * (f.sprint || 0));
      for (const { w, s, ph: p } of wings) w.rotation.z = s * (0.15 + Math.sin(ph + p) * 0.38);
    },
  };
}

// ------------------------------------------------------------------ the manta
function manta(pal, S, P, fx) {
  const g = new THREE.Group(), lit = new Builder(), body = new Builder();
  const NU = 24, NV = 6, span = 12, nv = NU * NV * 2 * 6;
  const geo = liveGeo(nv, (i) => {
    const q = Math.floor(i / 6), top = q < NU * NV, k = q % (NU * NV), u = Math.floor(k / NV) / NU;
    return top ? mixHex(pal.shellLo, pal.shellHi, Math.abs(u * 2 - 1) * 0.8) : mixHex(pal.dark, pal.light, 0.15);
  }, () => 0);
  const wing = new THREE.Mesh(geo, null);
  g.add(wing);
  // the outline: a nose, wide tips, a short trailing edge to the tail
  const pt = (u, v, flap, under) => {
    const a = Math.abs(u), le = 6 * (1 - Math.pow(a, 0.9)) - a, te = -4.5 * (1 - a) - 1.2 * a;
    const z = te + (le - te) * v, x = u * span;
    const th = (under ? -0.5 : 1.1) * (1 - a * a) * Math.sin(Math.PI * v);
    return [x, th + flap * Math.pow(a, 1.6), z];
  };
  for (let i = 0; i < P.spots; i++) { const z = 3 - (i / P.spots) * 7; for (const s of [-1, 1]) lit.ico(0.32, 0, mat(s * (1.2 + (i % 3) * 0.7), 1.0, z), pal.light, PULSE); }
  for (const s of [-1, 1]) body.cone(0.6, 2.4, 5, mat(s * 1.3, 0.1, 6.4, Math.PI / 2 + 0.2, 0, 0), pal.dark);
  const tail = [];
  for (let i = 0; i <= 12; i++) tail.push(new THREE.Vector3(0, 0, -4.5 - i * 1.15 * P.tail));
  body.tube(tail, (t) => 0.35 * (1 - t) + 0.08, 4, pal.dark);
  lit.ico(0.4, 0, mat(0, 0, -4.5 - 12 * 1.15 * P.tail), pal.second, PULSE);
  g.add(new THREE.Mesh(body.build(), null), new THREE.Mesh(lit.build(), null));
  g.scale.setScalar(S);
  const pos = geo.attributes.position.array;
  let ph = 0;
  return {
    g, light: new THREE.Vector3(0, 1.4, 1).multiplyScalar(S), span: span * S, height: 3 * S,
    update(t, dt, f) {
      ph += dt * (1.6 + 1.6 * (f.sprint || 0));
      let o = 0;
      for (const under of [false, true]) for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
        const u0 = (i / NU) * 2 - 1, u1 = ((i + 1) / NU) * 2 - 1, v0 = j / NV, v1 = (j + 1) / NV;
        const fl = (u) => Math.sin(ph - Math.abs(u) * 1.6) * 3.2;
        const A = pt(u0, v0, fl(u0), under), B = pt(u1, v0, fl(u1), under), C = pt(u1, v1, fl(u1), under), D = pt(u0, v1, fl(u0), under);
        for (const p of under ? [A, C, B, A, D, C] : [A, B, C, A, C, D]) { pos[o++] = p[0]; pos[o++] = p[1]; pos[o++] = p[2]; }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ the crane
function crane(pal, S, P, fx) {
  const g = new THREE.Group(), body = new Builder(), lit = new Builder();
  const pale = mixHex(pal.shellHi, W, 0.35), dark = pal.dark;
  body.sphere(1, 10, 8, mat(0, 0, 0, 0, 0, 0, 1.5, 1.3, 3.1), pale);
  const neck = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; neck.push(new THREE.Vector3(0, 0.6 + Math.sin(t * Math.PI * 0.8) * 1.2, 2.4 + t * 5.6)); }
  body.tube(neck, (t) => 0.55 - t * 0.2, 6, pale);
  body.sphere(0.62, 8, 6, mat(0, 1.25, 8.3), pale);
  body.cone(0.24, 2.8, 5, mat(0, 1.15, 9.9, Math.PI / 2, 0, 0), pal.second);
  lit.sphere(0.16, 4, 3, mat(0.42, 1.45, 8.5), pal.light, PULSE);
  lit.sphere(0.16, 4, 3, mat(-0.42, 1.45, 8.5), pal.light, PULSE);
  lit.ico(0.7, 1, mat(0, -0.4, 1.8), pal.light, PULSE);
  for (const s of [-1, 1]) {
    const leg = [new THREE.Vector3(s * 0.5, -0.9, -1.4), new THREE.Vector3(s * 0.45, -1.2, -5), new THREE.Vector3(s * 0.4, -1.3, -9 * P.tail)];
    body.tube(leg, 0.12, 4, dark);
    lit.box(0.5, 0.12, 0.5, mat(s * 0.4, -1.3, -9.2 * P.tail), pal.second, PULSE);
  }
  for (let i = -2; i <= 2; i++) body.box(0.6, 0.1, 3, mat(i * 0.45, 0.3, -3.4, 0.1, i * 0.12, 0), i % 2 ? pale : dark);
  // the wings: an inner part and an outer, the outer a beat behind
  const wings = [];
  for (const s of [-1, 1]) {
    const inner = new THREE.Group(), outer = new THREE.Group();
    inner.position.set(s * 1.2, 0.6, 0.6);
    outer.position.set(s * 6, 0, 0);
    const ib = new Builder(), ob = new Builder();
    ib.box(6, 0.18, 3.2, mat(s * 3, 0, 0), pale);
    ob.box(6.5, 0.14, 2.6, mat(s * 3.25, 0, -0.2), pale);
    // the long feathers at the tips and the trailing edge, dark, their edges lit
    for (let k = 0; k < 6; k++) ob.box(0.5, 0.08, 2.4, mat(s * (4.2 + k * 0.5), 0, -2.2 - k * 0.15, 0, s * (0.1 + k * 0.08), 0), dark);
    for (let k = 0; k < 7; k++) ib.box(0.8, 0.08, 1.6, mat(s * (0.6 + k * 0.8), -0.02, -2, 0, 0, 0), k % 2 ? dark : pale);
    inner.add(new THREE.Mesh(ib.build(), null));
    outer.add(new THREE.Mesh(ob.build(), null));
    const edge = new Builder();
    edge.box(6.4, 0.06, 0.12, mat(s * 3.25, 0.1, 1.15), pal.light, 1);
    outer.add(lightMesh(edge.build(), fx, 0.8));
    inner.add(outer);
    g.add(inner);
    wings.push({ inner, outer, s });
  }
  g.add(new THREE.Mesh(body.build(), null), new THREE.Mesh(lit.build(), null));
  g.scale.setScalar(S);
  let ph = 0;
  return {
    g, light: new THREE.Vector3(0, -0.4, 1.8).multiplyScalar(S), span: 13 * S, height: 4 * S,
    update(t, dt, f) {
      ph += dt * (4.6 + 4 * (f.sprint || 0));
      for (const { inner, outer, s } of wings) { inner.rotation.z = s * (0.1 + Math.sin(ph) * 0.5); outer.rotation.z = s * (Math.sin(ph - 0.7) * 0.4); }
    },
  };
}

// ------------------------------------------------------------------ the eel
function eel(pal, S, P, fx) {
  const g = new THREE.Group();
  const N = 28, SEG = 6, Lb = 26 * P.tail;
  const bodyGeo = liveGeo((N - 1) * SEG * 6, (i) => (Math.floor(i / (SEG * 6)) % 4 === 0 ? pal.shellHi : pal.shellLo), () => 0);
  g.add(new THREE.Mesh(bodyGeo, null));
  const finGeo = liveGeo((N - 1) * 6 * 2, () => mixHex(pal.light, W, 0.25), (i) => 0.35 + 0.5 * ((i % 6) % 2));
  g.add(lightMesh(finGeo, fx, 0.75));
  const lit = new Builder();
  for (const s of [-1, 1]) lit.sphere(0.32, 6, 4, mat(s * 0.9, 0.35, 0.6), pal.light, PULSE);
  const head = new THREE.Mesh(lit.build(), null);
  g.add(head);
  const lights = new THREE.Points(liveGeo(12, () => pal.second, () => 1), pointsMaterial({ color: mixHex(pal.second, W, 0.3), size: 0.9 * S, additive: true, opacity: 0.9 }));
  lights.geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(12).fill(1), 1));
  lights.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(12).fill(1), 1));
  lights.layers.set(LAYER_FX);
  lights.frustumCulled = false;
  fx.push([lights.material, 0.9]);
  g.add(lights);
  g.scale.setScalar(S);
  const radius = (u) => (u < 0.08 ? 1.0 + u * 5 : 1.4 * Math.pow(1 - (u - 0.08) / 0.92, 0.8) + 0.12);
  const C = Array.from({ length: N }, () => new THREE.Vector3());
  const bp = bodyGeo.attributes.position.array, fp = finGeo.attributes.position.array, lp = lights.geometry.attributes.position.array;
  let ph = 0;
  return {
    g, light: new THREE.Vector3(0, 0, -4).multiplyScalar(S), span: 6 * S, height: 4 * S,
    update(t, dt, f) {
      ph += dt * (4.5 + 3 * (f.sprint || 0));
      for (let i = 0; i < N; i++) { const u = i / (N - 1), z = -u * Lb; C[i].set(Math.sin(z * 0.42 + ph) * 2.4 * (0.2 + 0.8 * u), Math.sin(z * 0.21 + ph * 0.5) * 0.6 * u, z); }
      head.position.copy(C[0]);
      let o = 0;
      const ring = (i, k) => { const a = (k / SEG) * TAU, r = radius(i / (N - 1)); return [C[i].x + Math.cos(a) * r, C[i].y + Math.sin(a) * r, C[i].z]; };
      for (let i = 0; i < N - 1; i++) for (let k = 0; k < SEG; k++) for (const [ii, kk] of [[i, k], [i + 1, k], [i + 1, k + 1], [i, k], [i + 1, k + 1], [i, k + 1]]) { const p = ring(ii, kk); bp[o++] = p[0]; bp[o++] = p[1]; bp[o++] = p[2]; }
      bodyGeo.attributes.position.needsUpdate = true;
      const top = [], tip = [], bot = [], btip = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1), r = radius(u), h = 1.8 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (0.85 + 0.15 * Math.sin(ph * 2 + i));
        top.push([C[i].x, C[i].y + r * 0.8, C[i].z]); tip.push([C[i].x, C[i].y + r + h, C[i].z]);
        bot.push([C[i].x, C[i].y - r * 0.8, C[i].z]); btip.push([C[i].x, C[i].y - r - h * 0.5, C[i].z]);
      }
      o = stripInto(fp, 0, top, tip);
      stripInto(fp, o, bot, btip);
      finGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < 12; i++) { const c = C[2 + i * 2]; lp[i * 3] = c.x; lp[i * 3 + 1] = c.y + 0.2; lp[i * 3 + 2] = c.z; }
      lights.geometry.attributes.position.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ the jelly
function jelly(pal, S, P, fx) {
  const g = new THREE.Group(), bell = new THREE.Group();
  const bg = new THREE.SphereGeometry(5, 18, 8, 0, TAU, 0, Math.PI * 0.55);
  const n0 = bg.attributes.position.count, col = new Float32Array(n0 * 3), em = new Float32Array(n0), c = new THREE.Color(mixHex(pal.light, W, 0.2));
  for (let i = 0; i < n0; i++) { col.set([c.r, c.g, c.b], i * 3); em[i] = 0.25 + 0.5 * (1 - bg.attributes.position.getY(i) / 5); }
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bg.setAttribute('emissive', new THREE.BufferAttribute(em, 1));
  bell.add(lightMesh(bg, fx, 0.55));
  const lit = new Builder();
  lit.ico(1.7, 1, mat(0, 2.2, 0), pal.light, PULSE);
  lit.torus(4.3, 0.18, 4, 32, mat(0, 0.9, 0, Math.PI / 2, 0, 0), pal.second, PULSE);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; lit.ico(0.5, 0, mat(Math.cos(a) * 2.2, 1.4, Math.sin(a) * 2.2), pal.third, PULSE); }
  bell.add(new THREE.Mesh(lit.build(), null));
  g.add(bell);
  // the threads: from the rim, down and trailing back
  const T = 12, K = 10;
  const tg = liveGeo(T * (K - 1) * 6, () => mixHex(pal.second, W, 0.3), (i) => 0.7 * (1 - (Math.floor(i / 6) % (K - 1)) / (K - 1)) + 0.1);
  g.add(lightMesh(tg, fx, 0.8));
  g.scale.setScalar(S);
  const tp = tg.attributes.position.array;
  let ph = 0, sq = 0;
  return {
    g, light: new THREE.Vector3(0, 2.2, 0).multiplyScalar(S), span: 6 * S, height: 9 * S,
    update(t, dt, f) {
      ph += dt;
      // the bell squeezes as it bolts, and opens as it drifts
      sq += ((f.sprint || 0) - sq) * Math.min(1, dt * 6);
      bell.scale.set(1 - sq * 0.22, 1 + sq * 0.18, 1 - sq * 0.22);
      let o = 0;
      for (let i = 0; i < T; i++) {
        const a = (i / T) * TAU, a0 = [], b0 = [];
        for (let j = 0; j < K; j++) {
          const v = j / (K - 1), trail = (1.2 + (f.speed || 0) * 0.08) * v * v * 9;
          const x = Math.cos(a) * 4.1 * (1 - v * 0.4) + Math.sin(ph * 2 + i + v * 4) * 0.8 * v, z = Math.sin(a) * 4.1 * (1 - v * 0.4) - trail;
          const y = 0.8 - v * 11;
          a0.push([x - 0.12, y, z]); b0.push([x + 0.12, y, z]);
        }
        o = stripInto(tp, o, a0, b0);
      }
      tg.attributes.position.needsUpdate = true;
    },
  };
}

const BODY = { darter, manta, crane, eel, jelly };

export function buildCreature(d, A, mats) {
  const st = d.depth ? stratum(d.depth) : SURFACE;
  const pal = {
    light: st.light, second: st.second, third: st.third, dark: mixHex(st.dark, 0x101418, 0.3),
    shellLo: mixHex(st.irid[0], st.dark, 0.25), shellHi: mixHex(st.irid[2], st.irid[1], 0.4),
  };
  const fx = [];
  const b = BODY[d.params.species](pal, d.size, d.params, fx);
  // its body lit like the world, its lit parts on the pulse
  b.g.traverse((o) => { if (o.isMesh && !o.material) o.material = o.geometry.attributes.emissive && Array.from(o.geometry.attributes.emissive.array).some((e) => e > 1.5) ? mats.glow : mats.body; });
  const group = new THREE.Group();
  group.add(b.g);
  let last = null;
  return {
    group, light: b.light, focus: b.light.clone(), span: b.span, height: b.height, clear: 0, solid: null,
    mats: fx.map(([m]) => m), creature: true,
    update(t, beat, c) {
      const dt = last === null ? 0 : Math.min(0.1, Math.max(0, t - last));
      last = t;
      b.update(t, dt, c.fly || {});
      for (const [m, o] of fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.8 + (c.pulse ?? 1) * 0.25);
    },
  };
}
