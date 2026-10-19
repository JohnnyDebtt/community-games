import * as THREE from 'three';
import { TAU, fbm2, hash2, smoothstep, clamp } from '../core/math.js';
import { P, mixHex } from '../core/palette.js';
import { shoreRadius, landHeight } from './layout.js';
import { worldMaterial } from '../render/materials.js';
import { Builder, mat, roughen } from '../render/build.js';

// The shore, the snowy hills and the crater rim as one faceted mesh, plus two rings of
// far peaks that fade into the haze like the game's FarRange and MidHills layers.

export function buildTerrain(scene) {
  const NA = 256, NR = 76;
  const ts = [];
  for (let j = 0; j <= NR; j++) ts.push(-7 + 390 * Math.pow(j / NR, 2.15));
  const verts = [];
  for (let j = 0; j <= NR; j++) {
    const row = [];
    for (let i = 0; i < NA; i++) {
      const th = (i / NA) * TAU;
      const r = shoreRadius(th) + ts[j];
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      row.push([x, landHeight(x, z), z, ts[j]]);
    }
    verts.push(row);
  }
  const b = new Builder();
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), N = new THREE.Vector3();
  const face = (a, bb, c) => {
    A.set(a[0], a[1], a[2]);
    B.set(bb[0], bb[1], bb[2]);
    C.set(c[0], c[1], c[2]);
    N.subVectors(B, A).cross(C.clone().sub(A)).normalize();
    // every face looks up, so none is culled from above
    let flip = false;
    if (N.y < 0) { N.negate(); flip = true; }
    const cy = (a[1] + bb[1] + c[1]) / 3;
    const cx = (a[0] + bb[0] + c[0]) / 3, cz = (a[2] + bb[2] + c[2]) / 3;
    const t = (a[3] + bb[3] + c[3]) / 3;
    const slope = 1 - N.y;
    const n = fbm2(cx * 0.05, cz * 0.05, 2);
    const rimZone = t > 85;
    let col;
    if (t < 1.2) col = mixHex(P.snow3, P.snow4, n);                         // drifted shore snow
    else if (slope > 0.5 + n * 0.1) col = rimZone ? (n > 0.5 ? P.stone1 : P.stone0) : P.stone2;   // bare cliff
    else if (slope > 0.34 + n * 0.1) col = rimZone ? mixHex(P.stone2, P.stone3, n) : mixHex(P.stone3, P.snow2, 0.4);
    else if (slope > 0.2 && rimZone) col = mixHex(P.snow1, P.snow2, n);      // snow ledges on the rim
    else col = n > 0.55 ? P.snow4 : n > 0.4 ? 0xe4e9ec : P.snow3;
    // pale crests catch the light, as in the game's crater rim
    if (rimZone && slope < 0.2 && cy > 26) col = P.air7;
    if (flip) b.tri([a[0], a[1], a[2]], [c[0], c[1], c[2]], [bb[0], bb[1], bb[2]], col);
    else b.tri([a[0], a[1], a[2]], [bb[0], bb[1], bb[2]], [c[0], c[1], c[2]], col);
  };
  for (let j = 0; j < NR; j++) {
    for (let i = 0; i < NA; i++) {
      const i2 = (i + 1) % NA;
      const v00 = verts[j][i], v10 = verts[j][i2], v01 = verts[j + 1][i], v11 = verts[j + 1][i2];
      if ((i + j) % 2) {
        face(v00, v01, v10);
        face(v10, v01, v11);
      } else {
        face(v00, v01, v11);
        face(v00, v11, v10);
      }
    }
  }
  const land = new THREE.Mesh(b.build(), worldMaterial());
  land.name = 'land';
  scene.add(land);

  // Far peaks: two rings, pale and quiet, layered for depth.
  const far = new Builder();
  const ring = (count, rMin, rMax, hMin, hMax, body, cap, seed) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + hash2(i, seed) * 0.08;
      const r = rMin + hash2(i, seed + 1) * (rMax - rMin);
      const h = hMin + Math.pow(hash2(i, seed + 2), 1.6) * (hMax - hMin);
      const w = h * (0.55 + hash2(i, seed + 3) * 0.55);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const seg = 6 + Math.floor(hash2(i, seed + 4) * 4);
      const g = roughen(new THREE.ConeGeometry(w, h, seg, 4), h * 0.11, i + seed);
      const capLine = h * (0.52 + hash2(i, seed + 5) * 0.2);
      far.add(g, mat(x, h / 2 - 4, z, 0, hash2(i, seed + 6) * TAU, 0),
        (vx, vy) => (vy + h / 2 > capLine ? cap : body));
    }
  };
  ring(90, 560, 700, 50, 140, 0x8d9da7, 0xcfdde4, 10);
  ring(110, 780, 900, 90, 230, 0xc7d9e0, 0xf5fafd, 20);
  const peaks = new THREE.Mesh(far.build(), farMaterial());
  peaks.name = 'peaks';
  scene.add(peaks);
  return { land, peaks };
}

// The far peaks are lit like everything else but take only part of the fog, so they
// stay as pale silhouettes on the horizon.
function farMaterial() {
  const m = worldMaterial({ unique: true });
  m.onBeforeCompile = () => {};
  m.fragmentShader = m.fragmentShader.replace('col = applyFog(col, vWorld);',
    'col = mix(col, applyFog(col, vWorld), 0.55);');
  return m;
}
