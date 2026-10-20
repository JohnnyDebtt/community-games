// Adapted from Soundings (TheSeekerGame/community-games, soundings/src/render/voxel.js),
// MIT OR Apache-2.0.

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
