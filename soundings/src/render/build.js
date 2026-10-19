import * as THREE from 'three';

// Accumulates flat-colored low-poly parts into one non-indexed BufferGeometry
// (position, color, emissive), so a whole prop is a single draw call.

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

export function mat(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p.clone(), _q.clone(), _s.clone());
}

export class Builder {
  constructor() {
    this.pos = [];
    this.col = [];
    this.emi = [];
  }

  // Add any three.js geometry. `color` is a hex, or a function (x, y, z) -> hex
  // evaluated per vertex in the part's local space (before the matrix).
  // opts.keep(x, y, z): keep a triangle whose local centroid passes (cuts openings);
  // opts.flat: evaluate a color function once per triangle, at its centroid (crisp
  // edges between colors instead of blends); opts.sway(x, y, z): a per-vertex value
  // for the cloth shader (collected in this.sw).
  add(geo, matrix, color, emissive = 0, opts = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position;
    const fn = typeof color === 'function' ? color : null;
    if (!fn) _c.setHex(color);
    const keep = opts && opts.keep, flat = opts && opts.flat, sway = opts && opts.sway, smooth = opts && opts.smooth ? 1 : 0;
    if (sway && !this.sw) this.sw = new Array(this.pos.length / 3).fill(0);
    if (smooth && !this.sm) this.sm = new Array(this.pos.length / 3).fill(0);
    for (let i = 0; i < p.count; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { cx += p.getX(i + k) / 3; cy += p.getY(i + k) / 3; cz += p.getZ(i + k) / 3; }
      if (keep && !keep(cx, cy, cz)) continue;
      if (fn && flat) _c.setHex(fn(cx, cy, cz, i));
      for (let k = 0; k < 3; k++) {
        _v.fromBufferAttribute(p, i + k);
        if (fn && !flat) _c.setHex(fn(_v.x, _v.y, _v.z, i + k));
        const s = sway ? sway(_v.x, _v.y, _v.z) : 0;
        if (matrix) _v.applyMatrix4(matrix);
        this.pos.push(_v.x, _v.y, _v.z);
        this.col.push(_c.r, _c.g, _c.b);
        this.emi.push(typeof emissive === 'function' ? emissive(i + k) : emissive);
        if (this.sw) this.sw.push(s);
        if (this.sm) this.sm.push(smooth);
      }
    }
    if (g !== geo) g.dispose();
    geo.dispose();
    return this;
  }

  // Merge another Builder (or a geometry it built), keeping its colors.
  merge(src, matrix) {
    const pos = src.pos || src.attributes.position.array;
    const col = src.col || src.attributes.color.array;
    const emi = src.emi || (src.attributes.emissive ? src.attributes.emissive.array : null);
    for (let i = 0; i < pos.length; i += 3) {
      _v.set(pos[i], pos[i + 1], pos[i + 2]);
      if (matrix) _v.applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      this.col.push(col[i], col[i + 1], col[i + 2]);
      this.emi.push(emi ? emi[i / 3] : 0);
      if (this.sw) this.sw.push(0);
      if (this.sm) this.sm.push(0);
    }
    return this;
  }

  box(w, h, d, matrix, color, emissive = 0) {
    return this.add(new THREE.BoxGeometry(w, h, d), matrix, color, emissive);
  }
  cyl(rt, rb, h, seg, matrix, color, emissive = 0, open = false) {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), matrix, color, emissive);
  }
  cone(r, h, seg, matrix, color, emissive = 0) {
    return this.add(new THREE.ConeGeometry(r, h, seg), matrix, color, emissive);
  }
  ico(r, detail, matrix, color, emissive = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), matrix, color, emissive);
  }
  sphere(r, ws, hs, matrix, color, emissive = 0, phiStart, phiLen, thStart, thLen) {
    return this.add(new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, thStart, thLen), matrix, color, emissive);
  }
  // Raw triangle (world/local coordinates already final).
  tri(a, b, c, color, emissive = 0) {
    _c.setHex(color);
    for (const v of [a, b, c]) {
      this.pos.push(v[0], v[1], v[2]);
      this.col.push(_c.r, _c.g, _c.b);
      this.emi.push(emissive);
      if (this.sw) this.sw.push(0);
      if (this.sm) this.sm.push(0);
    }
    return this;
  }
  quad(a, b, c, d, color, emissive = 0) {
    this.tri(a, b, c, color, emissive);
    return this.tri(a, c, d, color, emissive);
  }

  get empty() {
    return this.pos.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('emissive', new THREE.Float32BufferAttribute(this.emi, 1));
    if (this.sw) {
      while (this.sw.length < this.pos.length / 3) this.sw.push(0);
      g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sw, 1));
    }
    if (this.sm) {
      while (this.sm.length < this.pos.length / 3) this.sm.push(0);
      g.setAttribute('cloth', new THREE.Float32BufferAttribute(this.sm, 1));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// Jitter the vertices of a geometry (for rocks, ice and snow): shared positions move
// together so the surface stays closed.
export function roughen(geo, amount, seed = 1) {
  const p = geo.attributes.position;
  const key = (x, y, z) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const offs = new Map();
  let s = seed * 9301 + 49297;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280 - 0.5;
  };
  for (let i = 0; i < p.count; i++) {
    const k = key(p.getX(i), p.getY(i), p.getZ(i));
    if (!offs.has(k)) offs.set(k, [rnd() * amount, rnd() * amount, rnd() * amount]);
    const o = offs.get(k);
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  p.needsUpdate = true;
  return geo;
}
