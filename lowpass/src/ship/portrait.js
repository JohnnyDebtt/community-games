import { exteriorParts } from './ship.js';

// A ship's portrait for the SHOP: its outside, drawn by hand on a small canvas (three
// quarters from the front and above, lit from the upper left, nearest faces last), at the
// game's own pixel. Made once per ship.

const W = 168, H = 76;
const cache = new Map();

export function portrait(design) {
  if (cache.has(design.id)) return cache.get(design.id);
  const P = exteriorParts(design);
  const tris = [];
  const yaw = 2.05, pitch = 0.42;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const view = (x, y, z) => {
    const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
    return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
  };
  const L = [-0.45, 0.8, 0.4], ln = Math.hypot(...L);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const g of [P.hull, P.ribs, P.fins, P.core, P.nav, P.lens]) {
    const pos = g.attributes.position.array, col = g.attributes.color.array, em = g.attributes.emissive.array;
    for (let i = 0; i < pos.length / 9; i++) {
      const v = [0, 1, 2].map((k) => view(pos[i * 9 + k * 3], pos[i * 9 + k * 3 + 1], pos[i * 9 + k * 3 + 2]));
      // the face's normal, toward the light (either side: some parts are thin)
      const ax = v[1][0] - v[0][0], ay = v[1][1] - v[0][1], az = v[1][2] - v[0][2];
      const bx = v[2][0] - v[0][0], by = v[2][1] - v[0][1], bz = v[2][2] - v[0][2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, nl = Math.hypot(nx, ny, nz) || 1;
      const lit = Math.abs((nx * L[0] + ny * L[1] + nz * L[2]) / (nl * ln));
      const e = em[i * 3], k = e > 0.3 ? 1.25 : 0.38 + 0.75 * lit;
      const c = [col[i * 9], col[i * 9 + 1], col[i * 9 + 2]].map((x) => Math.min(255, Math.round(Math.pow(x, 0.85) * 255 * k)));
      tris.push({ v, d: (v[0][2] + v[1][2] + v[2][2]) / 3, c: `rgb(${c[0]},${c[1]},${c[2]})` });
      for (const p of v) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    }
    g.dispose();
  }
  tris.sort((a, b) => a.d - b.d);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const s = Math.min((W - 8) / (maxX - minX), (H - 8) / (maxY - minY));
  const ox = W / 2 - ((minX + maxX) / 2) * s, oy = H / 2 + ((minY + maxY) / 2) * s;
  ctx.lineWidth = 0.6;
  for (const t of tris) {
    ctx.beginPath();
    ctx.moveTo(ox + t.v[0][0] * s, oy - t.v[0][1] * s);
    ctx.lineTo(ox + t.v[1][0] * s, oy - t.v[1][1] * s);
    ctx.lineTo(ox + t.v[2][0] * s, oy - t.v[2][1] * s);
    ctx.closePath();
    ctx.fillStyle = t.c;
    ctx.strokeStyle = t.c;
    ctx.fill();
    ctx.stroke();
  }
  const url = cv.toDataURL();
  cache.set(design.id, url);
  return url;
}
