// SEEKER NET art in the browser, rebuilt pixel for pixel from the atlas that
// tools/bake_seekers.py baked with the collection's own engine (and verified against
// every checksum in the collection's lists). Gives:
//   - the exact 54x54 picture of any token, activated or at any uncharged stage
//   - the token's parts (floating object, back, base, flank, head, eyes/battery) for
//     building its 3D voxel model

import { mapToPalette, nearest } from '../core/palette.js';

const BASE = 'assets/seekernet/';
export const CELL = 54;
export const SUPPLY = 2222;
export const THRESHOLD = 9000;

let meta = null;
let metaPromise = null;
let colors = null;            // [[r,g,b]], in the game's palette (what is shown)
let exactColors = null;       // the collection's own colors (for checking the pixels)
const chunkCache = new Map(); // chunk -> Promise<{w, data: Uint8Array}>
let backgrounds = null;       // Promise<Uint8ClampedArray[]> per background (RGB 54x54x3)

export function loadMeta() {
  if (!metaPromise) {
    metaPromise = fetch(BASE + 'seekers.json')
      .then((r) => {
        if (!r.ok) throw new Error('seekers.json ' + r.status);
        return r.json();
      })
      .then((m) => {
        meta = m;
        exactColors = m.colors.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
        // shown in the game's palette, like everything else on screen
        colors = mapToPalette(exactColors);
        return m;
      });
  }
  return metaPromise;
}

export const ready = () => !!meta;

async function decodeImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const blob = await res.blob();
  let bmp;
  try {
    bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  } catch {
    bmp = await createImageBitmap(blob);
  }
  const cv = document.createElement('canvas');
  cv.width = bmp.width;
  cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
  if (bmp.close) bmp.close();
  return { w: cv.width, h: cv.height, rgba: d };
}

function chunk(c) {
  if (!chunkCache.has(c)) {
    const p = decodeImage(`${BASE}seekers-${String(c).padStart(2, '0')}.png`).then(({ w, h, rgba }) => {
      const data = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) data[i] = rgba[i * 4];   // the palette entry k is grey k
      return { w, data };
    });
    chunkCache.set(c, p);
    p.catch(() => chunkCache.delete(c));
  }
  return chunkCache.get(c);
}

function loadBackgrounds() {
  if (!backgrounds) {
    backgrounds = decodeImage(BASE + 'backgrounds.png').then(({ w, rgba }) => {
      const out = [];
      for (let k = 0; k < 9; k++) {
        const bg = new Uint8ClampedArray(CELL * CELL * 3);
        const game = new Uint8ClampedArray(CELL * CELL * 3);
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const s = (y * w + k * CELL + x) * 4, d = (y * CELL + x) * 3;
          bg[d] = rgba[s]; bg[d + 1] = rgba[s + 1]; bg[d + 2] = rgba[s + 2];
          const n = nearest([rgba[s], rgba[s + 1], rgba[s + 2]]);
          game[d] = n[0]; game[d + 1] = n[1]; game[d + 2] = n[2];
        }
        bg.game = game;
        out.push(bg);
      }
      return out;
    });
  }
  return backgrounds;
}

// Static facts about a token (they never change).
export function info(token) {
  const row = meta.tokens[token - 1];
  const T = meta.traits;
  const name = (k, i) => (i < 0 ? null : T[k][i]);
  return {
    token,
    artwork: row[0],
    traits: {
      Base: name('Base', row[1]), Colorway: name('Colorway', row[2]), Eyes: name('Eyes', row[3]),
      'Floating Object': name('Floating Object', row[4]), Head: name('Head', row[5]), Flank: name('Flank', row[6]),
      Back: name('Back', row[7]), Background: T.Background[row[8]], Loadout: T.Loadout[row[9]],
    },
    startingCharge: row[10],
    chargeRank: row[11],
    battery: [row[12], row[13]],
    chunk: row[14],
    cell: row[15],
    bgIndex: row[8],
  };
}

// The 54x54 cell of bytes for a token.
export async function cell(token) {
  await loadMeta();
  const i = info(token);
  const ch = await chunk(i.chunk);
  const cc = meta.chunkCols;
  const ox = (i.cell % cc) * CELL, oy = Math.floor(i.cell / cc) * CELL;
  const out = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) out[y * CELL + x] = ch.data[(oy + y) * ch.w + ox + x];
  return out;
}

export function stageOf(charge) {
  return Math.min(Math.floor((charge * 6) / THRESHOLD), 5) + 1;
}

// Decoded parts: per pixel { color [r,g,b], part 0..4 or 5 (eyes) or -1, screen }.
// look: { activated: bool, stage: 1..6 }
export function decode(token, bytes, look) {
  const pairs = meta.pairs, eb = meta.eyeBase, under = meta.eyeUnder;
  const pal = look.exact ? exactColors : colors;
  const row = info(token);
  const px = new Array(CELL * CELL);
  for (let i = 0; i < CELL * CELL; i++) {
    const v = bytes[i];
    if (!v) { px[i] = null; continue; }
    const p = v >= eb ? under : v;
    const [c, part, scr] = pairs[p];
    let col = pal[c], prt = part;
    if (look.activated && v >= eb) {
      col = pal[meta.eyeColors[v - eb]];
      prt = 5;
    }
    px[i] = { color: col, part: prt, screen: !!scr };
  }
  if (!look.activated) {
    const s = look.stage || 1;
    const [bx, by] = row.battery;
    for (const [x0, y0, c] of meta.battery[s - 1]) {
      const x = x0 + bx, y = y0 + by;
      if (x < 0 || y < 0 || x >= CELL || y >= CELL) continue;
      const q = px[y * CELL + x];
      if (q && q.screen) px[y * CELL + x] = { color: pal[c], part: 5, screen: true, battery: true };
    }
  }
  return px;
}

// The token's picture exactly as the collection shows it (RGBA, 54x54).
export async function picture(token, look) {
  const [bytes, bgs] = await Promise.all([cell(token), loadBackgrounds()]);
  const row = info(token);
  const px = decode(token, bytes, look);
  const out = new Uint8ClampedArray(CELL * CELL * 4);
  if (look.activated) {
    // the background shows where empty pixels reach the edge; enclosed ones stay black
    const bg = look.exact ? bgs[row.bgIndex] : bgs[row.bgIndex].game;
    const outside = new Uint8Array(CELL * CELL);
    const stack = [];
    for (let i = 0; i < CELL; i++) {
      for (const k of [i, (CELL - 1) * CELL + i, i * CELL, i * CELL + CELL - 1]) {
        if (!px[k] && !outside[k]) { outside[k] = 1; stack.push(k); }
      }
    }
    while (stack.length) {
      const k = stack.pop();
      const x = k % CELL, y = (k / CELL) | 0;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= CELL || ny >= CELL) continue;
        const n = ny * CELL + nx;
        if (!px[n] && !outside[n]) { outside[n] = 1; stack.push(n); }
      }
    }
    for (let i = 0; i < CELL * CELL; i++) {
      const q = px[i];
      const c = q ? q.color : outside[i] ? [bg[i * 3], bg[i * 3 + 1], bg[i * 3 + 2]] : [0, 0, 0];
      out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
    }
  } else {
    const bg = look.exact ? bgs[8] : bgs[8].game;
    const keep = 255 - meta.shades[(look.stage || 1) - 1];
    for (let i = 0; i < CELL * CELL; i++) {
      const q = px[i];
      if (q) {
        let c = [Math.floor((q.color[0] * keep) / 255), Math.floor((q.color[1] * keep) / 255), Math.floor((q.color[2] * keep) / 255)];
        if (!look.exact) c = nearest(c);
        out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2];
      } else {
        out[i * 4] = bg[i * 3]; out[i * 4 + 1] = bg[i * 3 + 1]; out[i * 4 + 2] = bg[i * 3 + 2];
      }
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

// Draw a token into a canvas at a whole-number scale (nearest neighbor).
export async function drawInto(canvas, token, look, scale = 2) {
  const rgba = await picture(token, look);
  canvas.width = CELL * scale;
  canvas.height = CELL * scale;
  const ctx = canvas.getContext('2d');
  const small = document.createElement('canvas');
  small.width = small.height = CELL;
  small.getContext('2d').putImageData(new ImageData(rgba, CELL, CELL), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, CELL * scale, CELL * scale);
  return canvas;
}

// For tests: sha256 of the picture's RGB pixels, the collection's pixel checksum.
// A crop of the picture at one canvas pixel per art pixel (a portrait for the HUD). The
// background is left out, so the seeker stands on whatever is behind the canvas.
export async function drawCrop(canvas, token, look, x0 = 10, y0 = 8, w = 34, h = 34) {
  const px = decode(token, await cell(token), look);
  const outside = new Uint8Array(CELL * CELL);
  const stack = [];
  for (let i = 0; i < CELL; i++) {
    for (const k of [i, (CELL - 1) * CELL + i, i * CELL, i * CELL + CELL - 1]) if (!px[k] && !outside[k]) { outside[k] = 1; stack.push(k); }
  }
  while (stack.length) {
    const k = stack.pop();
    const x = k % CELL, y = (k / CELL) | 0;
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= CELL || ny >= CELL) continue;
      const n = ny * CELL + nx;
      if (!px[n] && !outside[n]) { outside[n] = 1; stack.push(n); }
    }
  }
  const keep = look.activated ? 255 : 255 - meta.shades[(look.stage || 1) - 1];
  canvas.width = w;
  canvas.height = h;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x + x0, sy = y + y0;
      if (sx < 0 || sy < 0 || sx >= CELL || sy >= CELL) continue;
      const i = sy * CELL + sx, o = (y * w + x) * 4;
      const q = px[i];
      if (!q && outside[i]) continue;
      const c = q ? q.color : [0, 0, 0];
      const k = q && q.part === 5 ? 255 : keep;
      const n = k === 255 ? c : nearest([(c[0] * k) / 255, (c[1] * k) / 255, (c[2] * k) / 255].map(Math.round));
      out[o] = n[0]; out[o + 1] = n[1]; out[o + 2] = n[2]; out[o + 3] = 255;
    }
  }
  canvas.getContext('2d').putImageData(new ImageData(out, w, h), 0, 0);
  return canvas;
}

// The bounding box of a seeker's pixels (for cropping portraits around it).
export async function bounds(token) {
  const bytes = await cell(token);
  let x0 = CELL, y0 = CELL, x1 = -1, y1 = -1;
  for (let i = 0; i < CELL * CELL; i++) {
    if (!bytes[i]) continue;
    const x = i % CELL, y = (i / CELL) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// The collection's exact pixels (its own colors), for checking against its checksums.
export async function pixelHash(token, look) {
  const rgba = await picture(token, { ...look, exact: true });
  const rgb = new Uint8Array(CELL * CELL * 3);
  for (let i = 0; i < CELL * CELL; i++) { rgb[i * 3] = rgba[i * 4]; rgb[i * 3 + 1] = rgba[i * 4 + 1]; rgb[i * 3 + 2] = rgba[i * 4 + 2]; }
  const h = await crypto.subtle.digest('SHA-256', rgb);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const metaData = () => meta;
