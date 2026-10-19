import * as THREE from 'three';
import { clamp } from '../core/math.js';

// Screen-space layout for the things that float beside the Seeker (the cast meter, the
// "!", the catch bar, the catch card): each finds a place that covers neither the Seeker,
// nor its seeker, nor the hole, nor the HUD, and glides there in whole pixels.

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class ScreenLayout {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this._smooth = new Map();
  }

  // A world point to CSS pixels.
  point(p) {
    _v.copy(p).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    return { x: r.left + (_v.x * 0.5 + 0.5) * r.width, y: r.top + (-_v.y * 0.5 + 0.5) * r.height, behind: _v.z > 1 };
  }

  // The screen rectangle of a local box [x0, y0, z0, x1, y1, z1] under a world matrix.
  box(matrix, b, pad = 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const r = this.canvas.getBoundingClientRect();
    _m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse).multiply(matrix);
    for (let i = 0; i < 8; i++) {
      _v.set(i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2]).applyMatrix4(_m);
      const x = r.left + (_v.x * 0.5 + 0.5) * r.width, y = r.top + (-_v.y * 0.5 + 0.5) * r.height;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  // A circle on the ground (the hole) as a rectangle.
  disc(x, y, z, radius, pad = 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const p = this.point(_v.set(x + Math.cos(a) * radius, y, z + Math.sin(a) * radius));
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    }
    return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
  }

  // Choose the first candidate position (top-left corners) that fits on screen and
  // overlaps nothing in `avoid`; otherwise the one that overlaps least. Glides there.
  place(key, el, candidates, avoid, opts = {}) {
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0;
    const m = opts.margin ?? 8;
    const W = innerWidth, H = innerHeight;
    let best = null, bestCost = Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const x = clamp(c.x, m, W - w - m), y = clamp(c.y, m, H - h - m);
      const moved = Math.abs(x - c.x) + Math.abs(y - c.y);
      let over = 0;
      for (const a of avoid) {
        if (!a) continue;
        const ox = Math.max(0, Math.min(x + w, a.x1) - Math.max(x, a.x0));
        const oy = Math.max(0, Math.min(y + h, a.y1) - Math.max(y, a.y0));
        over += ox * oy * (a.weight ?? 1);
      }
      const cost = over * 4 + moved * 2 + i * 30;
      if (cost < bestCost) { bestCost = cost; best = { x, y }; }
      if (over === 0 && moved < 4) { best = { x, y }; break; }
    }
    if (!best) return;
    let s = this._smooth.get(key);
    if (!s || opts.snap || Math.hypot(s.x - best.x, s.y - best.y) > 400) s = { x: best.x, y: best.y };
    else {
      const k = opts.rate ?? 0.25;
      s.x += (best.x - s.x) * k;
      s.y += (best.y - s.y) * k;
    }
    this._smooth.set(key, s);
    const { x: px, y: py } = snapToGrid(s.x, s.y);
    const t = `translate(${px}px, ${py}px)`;
    if (el._pos !== t) {
      el._pos = t;
      el.style.transform = t;
      el.style.setProperty('--pos', t);
    }
    return { x: px, y: py, w, h };
  }

  forget(key) {
    this._smooth.delete(key);
  }
}

// The world's pixel grid on the page: set by the HUD from the renderer.
export const GRID = { ox: 0, oy: 0, u: 1 };
export function snapToGrid(x, y) {
  const { ox, oy, u } = GRID;
  return { x: ox + Math.round((x - ox) / u) * u, y: oy + Math.round((y - oy) / u) * u };
}
export function snap(v, axis = 'x') {
  const o = axis === 'x' ? GRID.ox : GRID.oy;
  return o + Math.round((v - o) / GRID.u) * GRID.u;
}

export function union(...rects) {
  const list = rects.filter(Boolean);
  if (!list.length) return null;
  return {
    x0: Math.min(...list.map((r) => r.x0)), y0: Math.min(...list.map((r) => r.y0)),
    x1: Math.max(...list.map((r) => r.x1)), y1: Math.max(...list.map((r) => r.y1)),
  };
}

export function rectOf(el, pad = 0) {
  if (!el || !el.offsetParent && getComputedStyle(el).position !== 'fixed') return null;
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { x0: r.left - pad, y0: r.top - pad, x1: r.right + pad, y1: r.bottom + pad };
}
