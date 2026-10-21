import * as THREE from 'three';
import { hash2, fbm2, smoothstep, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { height, forestDensity, treeKind, autumn, WATER } from './terrain.js';
import { treeGeometries, BIRCH, BIRCH_SHAPES } from './trees.js';
import { worldMaterial, treeMaterial, COMMON, U, TREES, MAX_CLEARINGS } from '../render/materials.js';

// The forest streams in around the ship in square chunks, and the world keeps a floating
// origin: positions on the GPU stay small however far the ship has flown.

export const CHUNK = 128;
const GRID = 16;                 // terrain quads per side (8 m)
const CELL = 6.2;                // one tree candidate per cell
const KINDS = BIRCH + BIRCH_SHAPES; // spruce, fir, snag, the rare giant spruce and fir, birches
const CLEAR_SECS = 1.6;          // a clearing opens (or grows back) over this long

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const WATER_FRAG = /* glsl */ `
${COMMON}
varying vec3 vWorld;
uniform vec2 uOff;
void main() {
  vec3 v = normalize(uCamPos - vWorld);
  float fres = pow(1.0 - clamp(v.y, 0.0, 1.0), 4.0);
  vec2 q = vWorld.xz + uOff;
  float rip = sin(q.x * 0.31 + uAnim * 1.3 + sin(q.y * 0.17 + uAnim * 0.4) * 2.5) * 0.5 + 0.5;
  rip *= sin(q.y * 0.27 - uAnim * 0.9 + sin(q.x * 0.13) * 2.0) * 0.5 + 0.5;
  vec3 deep = vec3(0.045, 0.06, 0.07);
  vec3 refl = mix(uSkyColor * 0.8, uFogColor, 0.55);
  vec3 col = mix(deep, refl, 0.18 + 0.7 * fres);
  vec3 r = reflect(-v, vec3(0.0, 1.0, 0.0));
  col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 40.0) * 0.5;
  col *= 0.92 + rip * 0.14;
  for (int i = 0; i < ${8}; i++) {
    vec4 L = uPointPos[i];
    if (L.w <= 0.0) continue;
    float d = length(L.xyz - vWorld);
    col += uPointColor[i] * pow(clamp(1.0 - d / L.w, 0.0, 1.0), 2.0) * 0.5;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;
const waterUniforms = { ...U, uOff: { value: new THREE.Vector2() } };
const waterMat = new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG });

// Ground colors: dark moss under the trees, glades of moss and grass, frost up high,
// rock on the steeps, a pale rim at the shore.
function groundColor(x, z, h, steep, dens) {
  // patches of a few meters, not a checkerboard of triangles
  const n = fbm2(x * 0.045 + 7.7, z * 0.045 - 3.1, 2) * 0.85 + hash2(Math.floor(x * 0.25), Math.floor(z * 0.25)) * 0.15;
  if (h < WATER + 0.6) return 0x20242a;
  if (h < WATER + 2.6) return n < 0.5 ? 0x6c7983 : 0x5d666d;
  if (steep > 0.75) return n < 0.5 ? 0x353e50 : 0x4f5d73;
  const frost = smoothstep(34, 70, h + (fbm2(x * 0.02, z * 0.02, 2) - 0.5) * 24);
  let c;
  if (dens > 0.45) c = n < 0.33 ? 0x1c1d22 : n < 0.7 ? 0x21252c : 0x2a2f32;
  else if (dens > 0.15) c = n < 0.4 ? 0x2a2f32 : n < 0.75 ? 0x353e50 : 0x3e545b;
  else c = n < 0.4 ? 0x3e545b : n < 0.75 ? 0x49573d : 0x4f7368;
  if (frost > 0.15) c = mixHex(c, n < 0.6 ? 0x758399 : 0x667389, clamp(frost * (dens > 0.45 ? 0.4 : 0.7), 0, 0.7));
  // a turned stand: the floor russet with fallen needles, umber in the deep shade
  const au = autumn(x, z);
  if (au > 0.01) {
    const litter = dens > 0.45 ? (n < 0.4 ? 0x3a2c25 : n < 0.75 ? 0x4a3524 : 0x5c4129) : (n < 0.35 ? 0x6b4a2c : n < 0.7 ? 0x7d5a31 : 0x8c6a3a);
    c = mixHex(c, litter, au * 0.8 * (1 - frost * 0.5));
  }
  return c;
}

// The canopy, seen from the sun: a height map of the ground and the trees' crowns around
// the ship (4 m a texel, 2048 m across, wrapping), which the fog pass marches through
// toward the sun. Where a ridge or a crown stands in the way the fog is in shadow, and
// light comes through the gaps in beams.
export const CANOPY_SIZE = 512, CANOPY_TEXEL = 4, CANOPY_SPAN = CANOPY_SIZE * CANOPY_TEXEL;
export class CanopyMap {
  constructor() {
    // red: the crowns' height; green: how turned the stand there is (the fog lays its
    // mist through the trees by it)
    this.data = new Uint8Array(CANOPY_SIZE * CANOPY_SIZE * 2);
    this.texture = new THREE.DataTexture(this.data, CANOPY_SIZE, CANOPY_SIZE, THREE.RGFormat, THREE.UnsignedByteType);
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
    this.dirty = false;
    this._since = 0;
  }
  static encode(h) { return Math.max(0, Math.min(255, Math.round((h + 128) / 1.25))); }
  bake(chunk, trees) {
    const n = CHUNK / CANOPY_TEXEL, S = CANOPY_SIZE, D = this.data;
    const i0 = (((chunk.x0 / CANOPY_TEXEL) % S) + S) % S, j0 = (((chunk.z0 / CANOPY_TEXEL) % S) + S) % S;
    const H = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) H[j * n + i] = Math.max(chunk.groundAt((i + 0.5) * CANOPY_TEXEL, (j + 0.5) * CANOPY_TEXEL), WATER);
    for (const t of trees) {
      if (t.kind === 2) continue;
      const r = t.ht * t.wd * 0.27 + 2;
      const lx = (t.x - chunk.x0) / CANOPY_TEXEL - 0.5, lz = (t.z - chunk.z0) / CANOPY_TEXEL - 0.5;
      const rr = r / CANOPY_TEXEL;
      for (let j = Math.max(0, Math.floor(lz - rr)); j <= Math.min(n - 1, Math.ceil(lz + rr)); j++) {
        for (let i = Math.max(0, Math.floor(lx - rr)); i <= Math.min(n - 1, Math.ceil(lx + rr)); i++) {
          const d = Math.hypot(i - lx, j - lz) / rr;
          if (d >= 1) continue;
          const h = t.h + t.ht * (1 - d * 0.85);
          if (h > H[j * n + i]) H[j * n + i] = h;
        }
      }
    }
    // the stand's field is slow: where a chunk's corners and middle are all untouched, so
    // is the rest of it
    const au = (i, j) => autumn(chunk.x0 + (i + 0.5) * CANOPY_TEXEL, chunk.z0 + (j + 0.5) * CANOPY_TEXEL);
    const turned = [[0, 0], [n - 1, 0], [0, n - 1], [n - 1, n - 1], [n >> 1, n >> 1]].some(([i, j]) => au(i, j) > 0);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const o = ((j0 + j) * S + i0 + i) * 2;
      D[o] = CanopyMap.encode(H[j * n + i]);
      D[o + 1] = turned ? Math.round(au(i, j) * 255) : 0;
    }
    this.dirty = true;
  }
  update(dt) {
    this._since += dt;
    if (this.dirty && this._since > 0.25) {
      this.texture.needsUpdate = true;
      this.dirty = false;
      this._since = 0;
    }
  }
}

// The levels of detail a chunk must draw: whatever the bands (decided per tree, on the
// GPU) can ask of a tree inside it, from its nearest and farthest point to the camera.
function lodNeed(dc) {
  const L = TREES.uLod.value, far0 = L.x + L.z + L.w, far1 = L.y + L.z + L.w;
  const d0 = Math.max(0, dc - CHUNK * 0.71 - 4), d1 = dc + CHUNK * 0.71 + 4;
  return [d0 < far0, d1 > L.x && d0 < far1, d1 > L.y];
}

// a tree's place, turn and size, relative to (ox, oz); and its tint
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function treeMatrix(t, ox, oz, m4) {
  _e.set(t.lean, t.yaw, t.lean * 0.5);
  _q.setFromEuler(_e);
  _p.set(t.x - ox, t.h - 0.6, t.z - oz);
  _s.set(t.ht * t.wd * t.sq, t.ht, (t.ht * t.wd) / t.sq);
  return m4.compose(_p, _q, _s);
}
// A birch's leaves, by the tree: gold, deep gold, amber, rust (times its gold); and one
// still turning, green in the gold, more of them toward a stand's edges
const TURNED = [[1, 1, 1], [1.04, 0.9, 0.8], [1.02, 0.78, 0.72], [0.92, 0.6, 0.6]];
const LATE = [0.82, 1.06, 1.15];

function treeTint(t, k, c) {
  const v = 0.82 + (t.tint % 1) * 0.3;
  if (k === 2) return c.setRGB(v, v, v);
  if (k >= BIRCH) {
    const T = (t.r6 * 7.31) % 1 < (1 - smoothstep(0.15, 0.7, t.au)) * 0.6 ? LATE : TURNED[Math.floor(t.r6 * TURNED.length)];
    return c.setRGB(T[0] * v, T[1] * v, T[2] * v);
  }
  return c.setRGB(v * (0.95 + (t.yaw % 0.1)), v, v * (1.02 - (t.yaw % 0.08)));
}

// The giants of every chunk in one mesh per kind (they are few, and seen from far, so
// they never change their detail), rebuilt when chunks come and go or the origin moves.
const MAX_GIANTS = 512;
class Giants {
  constructor(scene) {
    const geos = treeGeometries();
    this.meshes = [3, 4].map((k) => {
      const m = new THREE.InstancedMesh(geos[k][0], treeMaterial(3), MAX_GIANTS);
      m.count = 0;
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      scene.add(m);
      return m;
    });
    this.dirty = true;
  }
  update(chunks, origin) {
    if (!this.dirty) return;
    this.dirty = false;
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (const m of this.meshes) m.count = 0;
    for (const ch of chunks.values()) {
      for (const { t, k } of ch.giants) {
        const m = this.meshes[k - 3];
        if (m.count >= MAX_GIANTS) continue;
        m.setMatrixAt(m.count, treeMatrix(t, origin.x, origin.z, m4));
        m.setColorAt(m.count, treeTint(t, k, c));
        m.count++;
      }
    }
    for (const m of this.meshes) {
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }
  }
}

export class Chunk {
  constructor(world, cx, cz) {
    this.world = world;
    this.cx = cx;
    this.cz = cz;
    this.x0 = cx * CHUNK;
    this.z0 = cz * CHUNK;
    this.group = new THREE.Group();
    this.trees = null;
    this.sets = [null, null, null];   // per level of detail: a mesh per kind of tree
    this.base = [];                   // per kind: { matrix, color, sphere, count }
    this.giants = [];                 // the giants: drawn by the world, all in one mesh
    this.minH = Infinity;
    this.maxH = -Infinity;
  }

  build() {
    this._terrain();
    this._plantTrees();
    this._treeMeshes();
    this.placeAt(this.world.origin);
  }

  placeAt(o) {
    this.group.position.set(this.x0 - o.x, 0, this.z0 - o.z);
  }

  _terrain() {
    const N = GRID, s = CHUNK / N;
    const H = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const h = height(this.x0 + i * s, this.z0 + j * s);
      H[j * (N + 1) + i] = h;
      if (h < this.minH) this.minH = h;
      if (h > this.maxH) this.maxH = h;
    }
    this.heights = H;
    const pos = new Float32Array(N * N * 6 * 3);
    const col = new Float32Array(N * N * 6 * 3);
    let k = 0;
    const put = (i, j, c) => {
      pos[k] = i * s; pos[k + 1] = H[j * (N + 1) + i]; pos[k + 2] = j * s;
      col[k] = ((c >> 16) & 255) / 255; col[k + 1] = ((c >> 8) & 255) / 255; col[k + 2] = (c & 255) / 255;
      k += 3;
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const h00 = H[j * (N + 1) + i], h10 = H[j * (N + 1) + i + 1], h01 = H[(j + 1) * (N + 1) + i], h11 = H[(j + 1) * (N + 1) + i + 1];
      const flip = (i + j) % 2 === 0;
      const tris = flip ? [[0, 0, 1, 0, 1, 1], [0, 0, 1, 1, 0, 1]] : [[0, 0, 1, 0, 0, 1], [1, 0, 1, 1, 0, 1]];
      for (const t of tris) {
        const xs = [t[0], t[2], t[4]], zs = [t[1], t[3], t[5]];
        const hs = xs.map((a, q) => (a ? (zs[q] ? h11 : h10) : (zs[q] ? h01 : h00)));
        const cxw = this.x0 + (i + (xs[0] + xs[1] + xs[2]) / 3) * s, czw = this.z0 + (j + (zs[0] + zs[1] + zs[2]) / 3) * s;
        const ch = (hs[0] + hs[1] + hs[2]) / 3;
        const steep = (Math.max(...hs) - Math.min(...hs)) / s;
        const c = groundColor(cxw, czw, ch, steep, forestDensity(cxw, czw, ch));
        // wind the triangle upward
        const order = flip ? [0, 2, 1] : [0, 2, 1];
        for (const q of order) put(i + xs[q], j + zs[q], c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('emissive', new THREE.BufferAttribute(new Float32Array(pos.length / 3), 1));
    g.computeBoundingSphere();
    this.ground = new THREE.Mesh(g, worldMaterial({ side: THREE.DoubleSide }));
    this.group.add(this.ground);
    if (this.minH < WATER) {
      const wg = new THREE.PlaneGeometry(CHUNK, CHUNK, 1, 1);
      wg.rotateX(-Math.PI / 2);
      wg.translate(CHUNK / 2, WATER, CHUNK / 2);
      this.water = new THREE.Mesh(wg, waterMat);
      this.group.add(this.water);
    }
  }

  // Ground height inside the chunk by bilinear lookup of the mesh (matches what is drawn).
  groundAt(lx, lz) {
    const N = GRID, s = CHUNK / N;
    const fx = clamp(lx / s, 0, N - 1e-4), fz = clamp(lz / s, 0, N - 1e-4);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const H = this.heights, w = N + 1;
    const a = H[j * w + i], b = H[j * w + i + 1], c = H[(j + 1) * w + i], d = H[(j + 1) * w + i + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  _plantTrees() {
    const list = [];
    const n = Math.ceil(CHUNK / CELL);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = Math.floor(this.x0 / CELL) + i, gz = Math.floor(this.z0 / CELL) + j;
      const r1 = hash2(gx, gz), r2 = hash2(gx + 917, gz - 331), r3 = hash2(gx - 71, gz + 1201), r4 = hash2(gx * 3 + 7, gz * 5 - 3);
      const x = (gx + 0.15 + r2 * 0.7) * CELL, z = (gz + 0.15 + r3 * 0.7) * CELL;
      if (x < this.x0 || x >= this.x0 + CHUNK || z < this.z0 || z >= this.z0 + CHUNK) continue;
      const h = this.groundAt(x - this.x0, z - this.z0);
      const d = forestDensity(x, z, h);
      if (r1 > d) continue;
      let kind = treeKind(x, z, r4);
      // giants, rarely: dark spires over the canopy
      const giant = r4 > 0.9975;
      // in a turned stand most trees are birches gone gold (some spruce and fir stand
      // dark among them, the giants over them); toward its edges fewer
      const au = autumn(x, z);
      const r5 = au > 0.01 ? hash2(gx * 7 + 3, gz * 11 - 5) : 1;
      if (kind !== 2 && !giant && r5 < au * 0.75) kind = BIRCH + Math.floor((r5 * 97.3 % 1) * BIRCH_SHAPES);
      const birch = kind >= BIRCH;
      let ht = kind === 0 ? 17 + r2 * 13 : kind === 1 ? 13 + r3 * 9 : birch ? 17 + r2 * 12 : 9 + r2 * 10;
      ht *= 0.85 + d * 0.3;
      if (giant) ht = 46 + r3 * 14;
      const wd = kind === 1 ? 0.9 + r3 * 0.3 : birch ? 0.9 + r3 * 0.25 : 0.8 + r2 * 0.35;
      // a birch's crown a little oval, each its own way
      const r6 = birch ? hash2(gx - 13, gz * 3 + 29) : 0;
      list.push({ x, z, h, kind, giant, ht, wd, sq: birch ? 0.84 + ((r6 * 31.7) % 1) * 0.34 : 1, yaw: r3 * 6.283, tint: r1 / Math.max(d, 0.01), lean: (r4 - 0.5) * (birch ? 0.12 : 0.06), au, r6 });
    }
    this.trees = list;
  }

  // Every tree, once: its place, turn, size and tint, kept as instance data that all
  // three levels of detail share. Which level each tree shows, and whether a clearing
  // has taken it, is decided per tree on the GPU (materials.js), never by rebuilding.
  _treeMeshes() {
    const byKind = Array.from({ length: KINDS }, () => []);
    for (const t of this.trees) byKind[t.giant && t.kind < 2 ? 3 + t.kind : t.kind].push(t);
    this.bakeCanopy();
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    const geos = treeGeometries();
    this.giants = [];
    for (let k = 0; k < KINDS; k++) {
      const arr = byKind[k];
      this.base[k] = null;
      if (!arr.length) continue;
      if (k === 3 || k === 4) { for (const t of arr) this.giants.push({ t, k }); continue; }
      const mesh = new THREE.InstancedMesh(geos[k][0], treeMaterial(0), arr.length);
      arr.forEach((t, i) => {
        mesh.setMatrixAt(i, treeMatrix(t, this.x0, this.z0, m4));
        mesh.setColorAt(i, treeTint(t, k, c));
      });
      mesh.computeBoundingSphere();
      this.base[k] = { matrix: mesh.instanceMatrix, color: mesh.instanceColor, sphere: mesh.boundingSphere, count: arr.length, first: mesh };
    }
  }

  // the meshes of one level of detail, made when first needed
  _set(lod) {
    if (this.sets[lod]) return this.sets[lod];
    const geos = treeGeometries();
    const set = [];
    for (let k = 0; k < KINDS; k++) {
      const b = this.base[k];
      if (!b) continue;
      let mesh;
      if (lod === 0) mesh = b.first;
      else {
        mesh = new THREE.InstancedMesh(geos[k][lod], treeMaterial(lod), 0);
        mesh.count = b.count;
        mesh.instanceMatrix = b.matrix;
        mesh.instanceColor = b.color;
        mesh.boundingSphere = b.sphere;
      }
      mesh.visible = false;
      set.push(mesh);
      this.group.add(mesh);
    }
    return (this.sets[lod] = set);
  }

  // which levels this chunk draws (trees inside it may stand in two bands at once)
  setLods(need) {
    for (let lod = 0; lod < 3; lod++) {
      if (!need[lod] && !this.sets[lod]) continue;
      for (const m of this._set(lod)) m.visible = need[lod];
    }
  }

  // the canopy's height for the light shafts, leaving open what the clearings open
  bakeCanopy() {
    if (!this.world.canopy) return;
    const clear = this.world.clearings.filter((c) => c.target > 0);
    const trees = clear.length ? this.trees.filter((t) => {
      for (const c of clear) {
        const dx = t.x - c.x, dz = t.z - c.z;
        const r = c.r * (0.85 + hash2(Math.floor(t.x), Math.floor(t.z)) * 0.3);
        if (dx * dx + dz * dz < r * r) return false;
      }
      return true;
    }) : this.trees;
    this.world.canopy.bake(this, trees);
  }

  dispose() {
    this.ground.geometry.dispose();
    if (this.water) this.water.geometry.dispose();
    for (const set of this.sets) if (set) for (const m of set) this.group.remove(m);
    // the instance data is shared by the levels: let the first mesh free it
    for (const b of this.base) if (b) b.first.dispose();
  }
}

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.origin = { x: 0, z: 0 };
    this.chunks = new Map();
    this.clearings = [];
    this.canopy = new CanopyMap();
    this.giants = new Giants(scene);
    this.radius = opts.radius ?? 900;
    this.onShift = null;
  }

  key(cx, cz) { return cx + ',' + cz; }

  chunkAt(x, z) {
    return this.chunks.get(this.key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
  }

  // Ground height where it is drawn, if that chunk exists, else the function.
  groundAt(x, z) {
    const c = this.chunkAt(x, z);
    return c ? c.groundAt(x - c.x0, z - c.z0) : height(x, z);
  }

  // A clearing for an artifact: the trees in it dissolve over a moment and come back
  // the same way when it is let go (in the trees' shader); only the canopy's light map
  // is redrawn on the CPU.
  addClearing(x, z, r) {
    const c = { x, z, r, amount: 0, target: 1 };
    this.clearings.push(c);
    this._touch(c);
    return c;
  }
  removeClearing(c) {
    c.target = 0;
    this._touch(c);
  }
  _touch(c) {
    for (const ch of this.chunks.values()) {
      if (c.x + c.r * 1.2 < ch.x0 || c.x - c.r * 1.2 > ch.x0 + CHUNK || c.z + c.r * 1.2 < ch.z0 || c.z - c.r * 1.2 > ch.z0 + CHUNK) continue;
      ch.bakeCanopy();
    }
  }
  _clearings(dt, x, z) {
    const list = this.clearings;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      c.amount = clamp(c.amount + (c.target > 0 ? 1 : -1) * dt / CLEAR_SECS, 0, 1);
      if (c.target === 0 && c.amount === 0) list.splice(i, 1);
    }
    // the nearest few go to the trees
    const near = list.length > MAX_CLEARINGS ? [...list].sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)) : list;
    const u = TREES.uClear.value;
    let n = 0;
    for (const c of near) {
      if (n === MAX_CLEARINGS) break;
      if (c.amount > 0) u[n++].set(c.x - this.origin.x, c.z - this.origin.z, c.r, c.amount);
    }
    TREES.uClearN.value = n;
  }

  // Keep the ship near the GPU's origin.
  _shift(x, z) {
    const ox = Math.round(x / CHUNK) * CHUNK, oz = Math.round(z / CHUNK) * CHUNK;
    if (Math.abs(ox - this.origin.x) < 1024 && Math.abs(oz - this.origin.z) < 1024) return false;
    const dx = ox - this.origin.x, dz = oz - this.origin.z;
    this.origin.x = ox;
    this.origin.z = oz;
    for (const c of this.chunks.values()) c.placeAt(this.origin);
    this.giants.dirty = true;
    if (this.onShift) this.onShift(dx, dz);
    return true;
  }

  // x, z: where the camera is (world); fx, fz: the way it looks. budget: chunks to build.
  // lx, lz: where the camera is, for the trees' detail (it may be far from the ship)
  update(x, z, fx, fz, budget = 2, lx = x, lz = z, dt = 0.016) {
    this._shift(x, z);
    this.canopy.update(dt);
    this._clearings(dt, lx, lz);
    waterUniforms.uOff.value.set(this.origin.x % 4096, this.origin.z % 4096);
    const R = this.radius;
    const c0x = Math.floor(x / CHUNK), c0z = Math.floor(z / CHUNK);
    const n = Math.ceil(R / CHUNK) + 1;
    const want = [];
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const cx = c0x + i, cz = c0z + j;
      const mx = (cx + 0.5) * CHUNK - x, mz = (cz + 0.5) * CHUNK - z;
      const d = Math.hypot(mx, mz);
      if (d > R + CHUNK * 0.71) continue;
      const k = this.key(cx, cz);
      const ahead = (mx * fx + mz * fz) / (d || 1);
      const ch = this.chunks.get(k);
      const dl = Math.hypot((cx + 0.5) * CHUNK - lx, (cz + 0.5) * CHUNK - lz);
      if (ch) {
        ch.seen = true;
      } else {
        want.push({ cx, cz, k, score: d - ahead * 200, d: dl });
      }
    }
    want.sort((a, b) => a.score - b.score);
    for (let i = 0; i < Math.min(budget, want.length); i++) {
      const w = want[i];
      const ch = new Chunk(this, w.cx, w.cz);
      ch.build();
      ch.setLods(lodNeed(w.d));
      ch.seen = true;
      this.chunks.set(w.k, ch);
      this.scene.add(ch.group);
      if (ch.giants.length) this.giants.dirty = true;
    }
    for (const [k, ch] of this.chunks) {
      if (!ch.seen) {
        const mx = (ch.cx + 0.5) * CHUNK - x, mz = (ch.cz + 0.5) * CHUNK - z;
        if (Math.hypot(mx, mz) > R + CHUNK * 2) {
          this.scene.remove(ch.group);
          ch.dispose();
          this.chunks.delete(k);
          if (ch.giants.length) this.giants.dirty = true;
        }
      }
      ch.seen = false;
    }
    this.giants.update(this.chunks, this.origin);
    return want.length;
  }

  // Which levels of detail each chunk draws, from where the camera is this frame (call
  // it once the camera has moved, before drawing; x, z in world space).
  lods(x, z) {
    for (const ch of this.chunks.values()) ch.setLods(lodNeed(Math.hypot((ch.cx + 0.5) * CHUNK - x, (ch.cz + 0.5) * CHUNK - z)));
  }
}
