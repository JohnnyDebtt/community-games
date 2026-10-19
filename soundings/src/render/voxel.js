import * as THREE from 'three';

// Voxels to a mesh with greedy meshing: only faces between a filled and an empty cell
// are kept, and coplanar neighbors of the same color merge into one rectangle. Pixel
// art (SEEKER NET seekers, the Seeker's backpacks) becomes solid little models at a
// few hundred triangles.

export class VoxelGrid {
  constructor(nx, ny, nz) {
    this.nx = nx;
    this.ny = ny;
    this.nz = nz;
    this.cells = new Uint16Array(nx * ny * nz);   // 0 = empty, else palette index + 1
    this.palette = [];                             // [{ hex, emissive, part }]
    this._key = new Map();
  }
  idx(x, y, z) {
    return x + this.nx * (y + this.ny * z);
  }
  colorId(hex, emissive = 0, part = 0) {
    const k = `${hex}|${emissive}|${part}`;
    let id = this._key.get(k);
    if (id === undefined) {
      this.palette.push({ hex, emissive, part });
      id = this.palette.length;
      this._key.set(k, id);
    }
    return id;
  }
  set(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return;
    this.cells[this.idx(x, y, z)] = id;
  }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.nx || y >= this.ny || z >= this.nz) return 0;
    return this.cells[this.idx(x, y, z)];
  }

  // Mesh the voxels whose palette entry passes `filter` (e.g. one part of a seeker).
  // size: meters per voxel; origin: voxel coordinate that lands at (0,0,0).
  mesh(size, origin = [0, 0, 0], filter = null) {
    const dims = [this.nx, this.ny, this.nz];
    const pal = this.palette;
    const ok = (id) => id && (!filter || filter(pal[id - 1]));
    const get = (p) => {
      const id = this.get(p[0], p[1], p[2]);
      return ok(id) ? id : 0;
    };
    const pos = [], col = [], emi = [];
    const c = new THREE.Color();
    const x = [0, 0, 0], q = [0, 0, 0];
    for (let d = 0; d < 3; d++) {
      const u = (d + 1) % 3, v = (d + 2) % 3;
      q[0] = q[1] = q[2] = 0;
      q[d] = 1;
      const mask = new Int32Array(dims[u] * dims[v]);
      for (x[d] = -1; x[d] < dims[d];) {
        let n = 0;
        for (x[v] = 0; x[v] < dims[v]; x[v]++) {
          for (x[u] = 0; x[u] < dims[u]; x[u]++) {
            const a = x[d] >= 0 ? get(x) : 0;
            const b = x[d] < dims[d] - 1 ? get([x[0] + q[0], x[1] + q[1], x[2] + q[2]]) : 0;
            // positive id: face of `a` looking +d; negative: face of `b` looking -d
            mask[n++] = (a && !b) ? a : (!a && b) ? -b : 0;
          }
        }
        x[d]++;
        n = 0;
        for (let j = 0; j < dims[v]; j++) {
          for (let i = 0; i < dims[u];) {
            const m = mask[n];
            if (!m) { i++; n++; continue; }
            let w = 1;
            while (i + w < dims[u] && mask[n + w] === m) w++;
            let h = 1, done = false;
            while (j + h < dims[v]) {
              for (let k = 0; k < w; k++) {
                if (mask[n + k + h * dims[u]] !== m) { done = true; break; }
              }
              if (done) break;
              h++;
            }
            x[u] = i;
            x[v] = j;
            const du = [0, 0, 0], dv = [0, 0, 0];
            du[u] = w;
            dv[v] = h;
            const p0 = [x[0], x[1], x[2]];
            const p1 = [x[0] + du[0], x[1] + du[1], x[2] + du[2]];
            const p2 = [x[0] + du[0] + dv[0], x[1] + du[1] + dv[1], x[2] + du[2] + dv[2]];
            const p3 = [x[0] + dv[0], x[1] + dv[1], x[2] + dv[2]];
            const entry = pal[Math.abs(m) - 1];
            c.setHex(entry.hex);
            const quad = m > 0 ? [p0, p1, p2, p0, p2, p3] : [p0, p2, p1, p0, p3, p2];
            for (const p of quad) {
              pos.push((p[0] - origin[0]) * size, (p[1] - origin[1]) * size, (p[2] - origin[2]) * size);
              col.push(c.r, c.g, c.b);
              emi.push(entry.emissive);
            }
            for (let l = 0; l < h; l++) for (let k = 0; k < w; k++) mask[n + k + l * dims[u]] = 0;
            i += w;
            n += w;
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('emissive', new THREE.Float32BufferAttribute(emi, 1));
    g.computeBoundingSphere();
    return g;
  }
}

// Read an image's pixels (same-origin asset) as RGBA bytes.
export async function loadPixels(url) {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth;
  cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return { w: cv.width, h: cv.height, data: ctx.getImageData(0, 0, cv.width, cv.height).data, image: img };
}

// A side-view sprite (like the Seeker's backpacks) to a voxel model: the sprite's
// x runs back-to-front, y is up, and it is extruded sideways with beveled edges.
export function extrudeSideSprite(px, width, opts = {}) {
  const { w, h, data } = px;
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 0) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const sw = x1 - x0 + 1, sh = y1 - y0 + 1;
  const g = new VoxelGrid(width, sh, sw);
  const solid = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && data[(y * w + x) * 4 + 3] > 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!solid(x, y)) continue;
      // distance to the silhouette edge (1 at the edge): bevels the model
      let d = 1;
      while (d < 3 && solid(x - d, y) && solid(x + d, y) && solid(x, y - d) && solid(x, y + d)) d++;
      const inset = Math.max(0, 2 - d) + (opts.inset ? opts.inset(x - x0, y - y0) : 0);
      const i = (y * w + x) * 4;
      const hex = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const bright = (data[i] + data[i + 1] + data[i + 2]) / 3 > 150;
      const id = g.colorId(hex, bright && opts.glowPale ? 0.35 : 0);
      for (let k = inset; k < width - inset; k++) g.set(k, y1 - y, sw - 1 - (x - x0), id);
    }
  }
  return { grid: g, height: sh, length: sw };
}
