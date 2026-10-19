/* Bakes DWELLER's terrain tiles with The Seeker's ice-biome terrain tiling and writes them into index.html.
 *
 * Follows game/src/levelgen/{mosaic,ldtk_rules,hash}.rs in The Seeker: mosaic rule masks claim patches of rock as
 * wall1-3 (the rest is wall0), then the rules of the LDtk "Main" layer choose every tile in priority stages (spikes,
 * wall0-3, fog1-3, fog_add) with the game's deterministic hashes, falling back to each category's catch-all tile.
 *
 * Writes two assets: `tiles`, the Main layer's tileset, and `terrain`, one pixel per level cell holding its tile id in
 * red (low byte) and green (high byte), its flips in blue (bit 0 x, bit 1 y), and no alpha where no tile is drawn.
 *
 * Usage: python3 extract_ice_tiling.py <the-seeker checkout> tiling.json
 *        node bake_terrain.cjs ../index.html tiling.json
 */
const fs = require('fs');
const zlib = require('zlib');

const TILING_SEED = 0x5EE4D1E0;
const PAD = 8;                       // border cells tiled around the level, filled as solidAt reports them
const WALL0 = 18, WALL1 = 17, WALL2 = 19, WALL3 = 20;
const FLIPS = [[false, false], [true, false], [false, true], [true, true]];   // index bit 0 mirrors x, bit 1 y

// The game's tile_hash (SplitMix64's mix) on 64-bit values held as [hi, lo] uint32 pairs.
function mulFull(a, b) {
  const a0 = a & 0xffff, a1 = a >>> 16, b0 = b & 0xffff, b1 = b >>> 16;
  const p00 = a0 * b0, p01 = a0 * b1, p10 = a1 * b0, p11 = a1 * b1;
  const mid = (p00 >>> 16) + (p01 & 0xffff) + (p10 & 0xffff);
  return [(p11 + (p01 >>> 16) + (p10 >>> 16) + (mid >>> 16)) >>> 0, (((mid & 0xffff) << 16) | (p00 & 0xffff)) >>> 0];
}
function mul64(ah, al, bh, bl) {
  const p = mulFull(al, bl);
  return [(p[0] + Math.imul(ah, bl) + Math.imul(al, bh)) >>> 0, p[1]];
}
function xorShr(h, l, n) { return [(h ^ (h >>> n)) >>> 0, (l ^ ((l >>> n) | (h << (32 - n)))) >>> 0]; }
function mix64(h, l) {
  let z = xorShr(h, l, 30); z = mul64(z[0], z[1], 0xBF58476D, 0x1CE4E5B9);
  z = xorShr(z[0], z[1], 27); z = mul64(z[0], z[1], 0x94D049BB, 0x133111EB);
  return xorShr(z[0], z[1], 31);
}
/* tile_hash(x, y, order, salt) for non-negative x and y and a 32-bit salt. */
function tileHash(x, y, order, salt) {
  return mix64((x ^ (y >>> 16) ^ 0x9E3779B9) >>> 0, (((y << 16) >>> 0) ^ order ^ salt ^ 0x7F4A7C15) >>> 0);
}
function umod(z, n) { return ((z[0] % n) * (4294967296 % n) + (z[1] % n)) % n; }

/* Grids carry a margin of empty cells as wide as the farthest rule offset, so reads beyond the level are empty,
 * as in The Seeker, without bounds checks. Offsets compile to index steps for each orientation. */
function ruleReach(T) {
  let r = 0;
  const see = o => { r = Math.max(r, Math.abs(o[0]), Math.abs(o[1])); };
  for (const layer of T.mosaics) for (const m of layer) for (const k of ['src', 'prim', 'self']) { m[k][0].forEach(see); m[k][1].forEach(see); }
  for (const stage of T.main.stages) for (const rule of stage) rule.checks.forEach(see);
  return r;
}
function steps(offsets, GW) { return FLIPS.map(([fx, fy]) => Int32Array.from(offsets, o => (fy ? -o[1] : o[1]) * GW + (fx ? -o[0] : o[0]))); }
function allSet(grid, i, s) { for (let k = 0; k < s.length; k++) if (!grid[i + s[k]]) return false; return true; }
function noneSet(grid, i, s) { for (let k = 0; k < s.length; k++) if (grid[i + s[k]]) return false; return true; }

/* mosaic.rs: three layers, each claiming rock (layer 1) or the layer below it, the highest claim winning. */
function compileMosaic(m, GW) {
  const cond = k => [steps(m[k][0], GW), steps(m[k][1], GW)];
  return { m, src: cond('src'), prim: cond('prim'), self: cond('self'), claims: steps(m.claims, GW),
    flips: [0, 1, 2, 3].filter(f => (!(f & 1) || m.rx) && (!(f & 2) || m.ry)),
    centered: m.src[0].length > 0 && m.src[0][0][0] === 0 && m.src[0][0][1] === 0 };
}
function mosaicClaims(c, x, y, i, source, primary, before, unclaimed) {
  let f = -1;
  for (const g of c.flips) {
    if (allSet(source, i, c.src[0][g]) && noneSet(source, i, c.src[1][g]) && allSet(primary, i, c.prim[0][g])
      && noneSet(primary, i, c.prim[1][g]) && allSet(before, i, c.self[0][g]) && noneSet(before, i, c.self[1][g])) { f = g; break; }
  }
  if (f < 0 || !allSet(unclaimed, i, c.src[0][f])) return null;
  const hash = tileHash(x, y, c.m.order, 0);
  if (umod(hash, 100) >= c.m.prob) return null;
  const claims = c.claims[f | (c.m.randx && (hash[1] >>> 1) & 1 ? 1 : 0) | (c.m.randy && (hash[1] >>> 2) & 1 ? 2 : 0)];
  return allSet(unclaimed, i, claims) ? claims : null;
}
function mosaicLayer(source, primary, W, H, R, rules) {
  const GW = W + R * 2, layer = new Uint8Array(source.length), unclaimed = source.slice();
  for (const c of rules) {
    const snapshot = unclaimed.slice(), before = layer.slice();
    for (let y = 0; y < H; y++) for (let x = 0, i = (y + R) * GW + R; x < W; x++, i++) {
      if (c.centered && !snapshot[i]) continue;
      const claims = mosaicClaims(c, x, y, i, snapshot, primary, before, unclaimed);
      if (claims) for (let k = 0; k < claims.length; k++) { layer[i + claims[k]] = 1; unclaimed[i + claims[k]] = 0; }
    }
  }
  return layer;
}
function mosaicLayers(terrain, W, H, R, layers) {
  const out = [];
  for (let k = 0; k < layers.length; k++) {
    const rules = layers[k].map(m => compileMosaic(m, W + R * 2));
    const layer = mosaicLayer(k === 0 ? terrain : out[k - 1], terrain, W, H, R, rules);
    for (const lower of out) for (let i = 0; i < layer.length; i++) if (layer[i]) lower[i] = 0;
    out.push(layer);
  }
  return out;
}

/* ldtk_rules.rs: pattern values, flips, chance and variant rolls, and the priority stages. */
function expected(e, a) {
  if (e === 1000001) return a !== 0;
  if (e === -1000001) return a === 0;
  if (e < 0 && e > -1000000) return a !== -e;
  if (e > 0 && e < 1000000) return a === e;
  return true;
}
function compileRule(r, GW) {
  return { r, steps: steps(r.checks, GW), values: Int32Array.from(r.checks, c => c[2]),
    combos: r.fx && r.fy ? [0, 1, 2, 3] : r.fx ? [0, 1] : r.fy ? [0, 2] : [0] };
}
function ruleTile(c, grid, i, x, y, g) {
  const s = c.steps[g], v = c.values, r = c.r;
  for (let k = 0; k < s.length; k++) if (!expected(v[k], grid[i + s[k]])) return -1;
  if (r.chance < 1 && (tileHash(x, y, r.uid, TILING_SEED)[1] & 0xffff) / 65535 >= r.chance) return -1;
  const ids = r.tiles.length > 1 ? r.tiles[umod(tileHash(x, y, (r.uid + 1000) >>> 0, TILING_SEED), r.tiles.length)] : r.tiles[0];
  return ids.length > 1 ? ids[umod(tileHash(x, y, (r.uid + 2000) >>> 0, TILING_SEED), ids.length)] : ids[0];
}
function stageTile(rules, grid, i, x, y) {
  let found = null;
  for (const c of rules) for (const g of c.combos) {
    const id = ruleTile(c, grid, i, x, y, g);
    if (id < 0) continue;
    found = [id, g];
    if (c.r.brk) return found;
  }
  return found;
}

/* The tile of every cell of a rock (1) / air (0) grid: ids index the tileset (-1 for none), flips are bit 0 x, bit 1 y. */
function tileTerrain(T, terrain, W, H) {
  const R = ruleReach(T), GW = W + R * 2;
  const rock = new Uint8Array(GW * (H + R * 2));
  for (let y = 0; y < H; y++) rock.set(terrain.subarray(y * W, y * W + W), (y + R) * GW + R);
  const m = mosaicLayers(rock, W, H, R, T.mosaics), grid = new Int32Array(rock.length);
  for (let i = 0; i < grid.length; i++) grid[i] = !rock[i] ? 0 : m[2][i] ? WALL3 : m[1][i] ? WALL2 : m[0][i] ? WALL1 : WALL0;
  const stages = T.main.stages.map(stage => stage.map(r => compileRule(r, GW)));
  const byValue = {};      // each category's rules, by the value their pattern requires at its center
  for (const v of [WALL0, WALL1, WALL2, WALL3]) byValue[v] = stages.map(stage => stage.filter(c => expected(c.r.center, v)));
  const ids = new Int16Array(W * H).fill(-1), flips = new Uint8Array(W * H), cats = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0, i = (y + R) * GW + R; x < W; x++, i++) {
    const v = grid[i], o = y * W + x;
    cats[o] = v;
    if (!v) continue;
    let p = null;
    for (const stage of byValue[v]) { p = stageTile(stage, grid, i, x, y); if (p) break; }
    if (!p && T.main.fallback[v] !== undefined) p = [T.main.fallback[v], 0];
    if (p) { ids[o] = p[0]; flips[o] = p[1]; }
  }
  return { grid: cats, ids, flips };
}

/* The level's tiles: tiled with a PAD-cell border, then cropped to the level. */
function bakeLevel(T, D, w) {
  const PW = w.W + PAD * 2, PH = w.H + PAD * 2, terrain = new Uint8Array(PW * PH);
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) terrain[y * PW + x] = D.solidAt(w, x - PAD, y - PAD) ? 1 : 0;
  const t = tileTerrain(T, terrain, PW, PH), rgba = Buffer.alloc(w.W * w.H * 4);
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const id = t.ids[(y + PAD) * PW + x + PAD], o = (y * w.W + x) * 4;
    if (id < 0) continue;
    rgba[o] = id & 0xff; rgba[o + 1] = id >> 8; rgba[o + 2] = t.flips[(y + PAD) * PW + x + PAD]; rgba[o + 3] = 255;
  }
  return rgba;
}

/* An 8-bit RGBA PNG with no color chunks, so browsers read its bytes back unchanged. */
function png(width, height, rgba) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = bytes => { let c = 0xFFFFFFFF; for (const b of bytes) c = table[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function main() {
  const [htmlPath, tilingPath] = process.argv.slice(2);
  const T = JSON.parse(fs.readFileSync(tilingPath, 'utf8'));
  let html = fs.readFileSync(htmlPath, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  globalThis.window = globalThis;
  new Function(scripts[0])();                 // DWELLER_ASSETS and DWELLER_LEVEL
  new Function(scripts[1])();                 // the simulation core, Dweller
  const D = globalThis.Dweller, w = D.makeWorld(globalThis.DWELLER_LEVEL);
  const terrain = 'data:image/png;base64,' + png(w.W, w.H, bakeLevel(T, D, w)).toString('base64');
  const asset = (name, uri) => {
    const entry = new RegExp(`"${name}": "data:image/png;base64,[^"]*"`);
    if (entry.test(html)) html = html.replace(entry, () => `"${name}": "${uri}"`);
    else html = html.replace(/"tiles": "data:image\/png;base64,[^"]*"/, m => `${m}, "${name}": "${uri}"`);
  };
  asset('tiles', T.main.image);
  asset('terrain', terrain);
  fs.writeFileSync(htmlPath, html);
  console.log(`baked ${w.W}x${w.H} terrain cells (${terrain.length} characters) into ${htmlPath}`);
}

if (require.main === module) main();
module.exports = { tileTerrain, bakeLevel, png };
