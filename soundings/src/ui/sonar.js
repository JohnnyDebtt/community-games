import { clamp } from '../core/math.js';

// The catch bar and the bite "!", drawn as pixel art at one canvas pixel per interface
// pixel: a column of water with your band, the fish, how far up the line it has come,
// and a little reel that turns while you hold.

export const BAR_W = 46, BAR_H = 126;

const COL = {
  k: '#05070b', line: '#29303e', line2: '#3f4d5b', water0: '#12303a', water1: '#0d252e', water2: '#0a1c23', water3: '#071419',
  band: '#abe3d9', bandHi: '#f0f2e8', bandOff: '#4f7f86', bandOffHi: '#7bacbc', gold: '#e3cf8e', goldHi: '#fff3c4', violet: '#9a8fd6',
  red: '#e84d3d', amber: '#b9a87b', teal: '#abe3d9', white: '#f0f2e8', bubble: '#7bacbc', muted: '#8a919e',
};

export class Sonar {
  constructor(canvas) {
    this.cv = canvas;
    canvas.width = BAR_W;
    canvas.height = BAR_H;
    this.ctx = canvas.getContext('2d');
    this.crank = 0;
    this.bubbles = Array.from({ length: 7 }, (_, i) => ({ x: 7 + ((i * 7) % 20), y: (i * 37) % 112, s: 0.4 + (i % 3) * 0.25 }));
  }

  setTint() { /* the bar keeps the Seeker's colors */ }

  // f: the Fishing session; fx: { auto, lock, frenzy } for the overdrive's colors
  drawGame(f, frame, fishImg, fx = {}, holding = false, dt = 1 / 60, fishShadow = null) {
    const ctx = this.ctx;
    const G = f.game;
    const W = BAR_W, H = BAR_H;
    const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
    ctx.clearRect(0, 0, W, H);
    // the frame: black, cut corners, a fine line inside
    r(2, 0, W - 4, H, COL.k); r(1, 1, W - 2, H - 2, COL.k); r(0, 2, W, H - 4, COL.k);
    r(3, 2, W - 6, 1, COL.line); r(3, H - 3, W - 6, 1, COL.line); r(2, 3, 1, H - 6, COL.line); r(W - 3, 3, 1, H - 6, COL.line);
    // the water column, darker with depth
    const x0 = 6, x1 = 29, y0 = 6, y1 = H - 6;
    const th = y1 - y0;
    const bands = [COL.water0, COL.water1, COL.water2, COL.water3];
    for (let y = y0; y < y1; y++) r(x0, y, x1 - x0, 1, bands[Math.min(3, Math.floor(((y - y0) / th) * 4))]);
    for (let y = y0 + 9; y < y1; y += 12) r(x0, y, 2, 1, COL.line2);
    // bubbles rising on the 12 fps grid
    for (const b of this.bubbles) {
      b.y -= b.s * (frame % 2 ? 1 : 0.5);
      if (b.y < 0) { b.y = th - 1; b.x = 7 + ((frame * 13 + b.x * 7) % 20); }
      r(x0 + (b.x % (x1 - x0 - 1)), y0 + Math.floor(b.y), 1, 1, COL.bubble);
    }
    // your band
    const zh = Math.max(5, Math.round(G.zoneH * th));
    const zy = Math.round(y1 - G.zone * th - zh / 2);
    const gold = fx.auto, inside = G.inside;
    const body = gold ? COL.gold : inside ? COL.band : COL.bandOff;
    const hi = gold ? COL.goldHi : inside ? COL.bandHi : COL.bandOffHi;
    ctx.globalAlpha = inside || gold ? 0.92 : 0.7;
    r(x0, Math.max(y0, zy), x1 - x0, Math.min(zh, y1 - Math.max(y0, zy)), body);
    ctx.globalAlpha = 1;
    r(x0, Math.max(y0, zy), x1 - x0, 1, hi);
    r(x0, Math.min(y1 - 1, zy + zh - 1), x1 - x0, 1, hi);
    if (fx.lock) { r(x0, Math.max(y0, zy), 1, zh, COL.violet); r(x1 - 1, Math.max(y0, zy), 1, zh, COL.violet); }
    // the fish
    const fy = Math.round(y1 - G.fish * th);
    const shake = inside ? 0 : (frame % 2) * 2 - 1;
    if (fishImg && fishImg.complete && fishImg.naturalWidth) {
      ctx.imageSmoothingEnabled = false;
      const fw = fishImg.naturalWidth, fh = fishImg.naturalHeight;   // one pixel per pixel
      // centered in the water column, and kept inside it
      const fx = x0 + Math.floor((x1 - x0 - fw) / 2) + shake, fyy = fy - (fh >> 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, th);
      ctx.clip();
      // (the portrait carries its own one-pixel outline)
      void fishShadow;
      ctx.drawImage(fishImg, fx, fyy, fw, fh);
      ctx.restore();
    } else {
      r(x0 + 6 + shake, fy - 2, 11, 5, COL.white);
      r(x0 + 4 + shake, fy - 1, 2, 3, COL.white);
    }
    if (!inside && frame % 4 < 2) { r(x1 - 4, fy - 6, 1, 3, COL.red); r(x1 - 4, fy - 2, 1, 1, COL.red); }
    // progress: how far up the line it has come
    const px0 = 32, px1 = 38;
    r(px0 - 1, y0 - 1, px1 - px0 + 2, th + 2, COL.line);
    r(px0, y0, px1 - px0, th, COL.k);
    const p = clamp(G.progress, 0, 1);
    const ph = Math.round(p * th);
    const pc = p < 0.25 ? COL.red : p < 0.6 ? COL.amber : COL.teal;
    r(px0, y1 - ph, px1 - px0, ph, pc);
    if (ph > 1) r(px0, y1 - ph, px1 - px0, 1, p > 0.85 && frame % 2 ? COL.white : COL.bandHi);
    // the reel, which turns while you hold
    this.crank += (holding || fx.auto ? 0.55 : 0.08) * 60 * dt;
    const cx = 39, cy = H - 12;
    r(cx - 3, cy - 3, 7, 7, COL.line2);
    r(cx - 2, cy - 2, 5, 5, COL.k);
    const a = this.crank * 0.5;
    const hx = Math.round(cx + Math.cos(a) * 3), hy = Math.round(cy + Math.sin(a) * 3);
    r(cx, cy, 1, 1, COL.muted);
    r(hx, hy, 2, 2, holding ? COL.white : COL.muted);
  }
}

// The "!" above the Seeker when a fish bites: a little speech bubble, colored by how rare
// the fish is.
export function drawBang(canvas, rarity = 'common', frame = 0) {
  const W = 15, H = 26;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const fill = { common: '#f0f2e8', uncommon: '#d7f2ec', rare: '#d6edf5', legendary: '#e3cf8e' }[rarity] || '#f0f2e8';
  const ink = { common: '#05070b', uncommon: '#1d5a52', rare: '#1f4f6e', legendary: '#5c4416' }[rarity] || '#05070b';
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  ctx.clearRect(0, 0, W, H);
  // outline, body, tail
  r(2, 0, W - 4, 21, '#05070b'); r(0, 2, W, 17, '#05070b'); r(1, 1, W - 2, 19, '#05070b');
  r(5, 21, 5, 2, '#05070b'); r(6, 23, 3, 2, '#05070b'); r(7, 25, 1, 1, '#05070b');
  r(2, 1, W - 4, 19, fill); r(1, 2, W - 2, 17, fill);
  r(6, 20, 3, 2, fill); r(7, 22, 1, 2, fill);
  r(2, 17, W - 4, 2, '#c4ced4');
  // the "!"
  r(6, 3, 3, 9, ink); r(6, 14, 3, 3, ink);
  if (rarity === 'legendary' || rarity === 'rare') {
    const s = frame % 6 < 3;
    r(s ? 1 : 12, s ? 4 : 13, 1, 1, '#ffffff');
  }
}
