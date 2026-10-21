import * as THREE from 'three';
import { worldMaterial } from '../render/materials.js';
import { VoxelGrid } from '../render/voxel.js';
import * as Art from '../chain/art.js';
import { nearestRGB } from '../core/palette.js';
import { hash1 } from '../core/math.js';
import { floatingObject } from './objects.js';

// A SEEKER NET seeker as a small voxel machine, from its exact collection art: the
// monitor rebuilt as a box from the oblique picture (front face, lid and bevel wrapped
// onto it), a tapered housing behind, each add-on set at its own depth, the floating
// object modeled as the thing itself. Dormant seekers are shaded by their charge stage
// and show their battery; activated ones are bright and blink. Parts move on the 12 fps
// grid. Adapted from Soundings (TheSeekerGame/community-games, soundings/src/actors/
// seekerbot.js), MIT OR Apache-2.0, which follows the seeker-codex's guide to SEEKER NET
// seekers in 3D.

export const VOX = 0.0125;     // meters per art pixel: about half a meter tall, in the cabin
const Z0 = 34;                 // voxel z of the monitor's front face
const NZ = 56;                 // room in front of the monitor for its floating object
const PAD_Y = 8;               // room below the art for add-ons that move down

function buildGrid(token, px) {
  const meta = Art.metaData();
  const row = meta.tokens[token - 1];
  const geo = meta.bases[meta.traits.Base[row[1]]];
  const bdx = row[16], bdy = row[17];
  const Wb = geo.wb, Hl = geo.hl;
  const Dv = Math.round(Wb * 1.45) + 1;
  const g = new VoxelGrid(66, 54 + PAD_Y, NZ);
  const at = (x, y) => (x < 0 || y < 0 || x >= 54 || y >= 54 ? null : px[y * 54 + x]);
  const cls = (x, y) => {
    const bx = x - bdx, by = y - bdy;
    if (bx < 0 || by < 0 || bx >= 54 || by >= 54) return '.';
    return geo.mask[by * 54 + bx];
  };
  const isFront = (x, y) => {
    const q = at(x, y);
    if (!q || (q.part !== 2 && q.part !== 5)) return false;
    return q.part === 5 || cls(x, y) === 'f';
  };
  const hexOf = (q) => (q.color[0] << 16) | (q.color[1] << 8) | q.color[2];
  let lowest = 99;
  const set = (x, y, k, hex, emis, part) => {
    // x, y in art pixels (y down); k = depth behind the front face (negative = in front)
    const vy = 53 - y + PAD_Y;
    lowest = Math.min(lowest, vy);
    g.set(x + 6, vy, Z0 - k, g.colorId(hex, emis, part));
  };
  // darker shades of the casing, kept in the game's palette
  const darken = (hex, f) => {
    const [r, gg, b] = nearestRGB([Math.round(((hex >> 16) & 255) * f), Math.round(((hex >> 8) & 255) * f), Math.round((hex & 255) * f)]);
    return (r << 16) | (gg << 8) | b;
  };
  // sample the art on a box face; falls back to the nearest pixel of the wanted kind
  const sample = (x, y, kinds, fallback) => {
    const q = at(Math.round(x), Math.round(y));
    if (q && q.part === 2 && kinds.includes(cls(Math.round(x), Math.round(y)))) return hexOf(q);
    return fallback;
  };
  // the box
  const tops = new Map();
  for (let y = 0; y < 54; y++) {
    let rowBack = null;
    for (let x = 0; x < 54; x++) {
      if (cls(x, y) === 'b' && at(x, y)) rowBack = hexOf(at(x, y));
    }
    for (let x = 0; x < 54; x++) {
      if (!isFront(x, y)) continue;
      const q = at(x, y);
      const hex = hexOf(q);
      const top = !isFront(x, y - 1), left = !isFront(x - 1, y), right = !isFront(x + 1, y), bottom = !isFront(x, y + 1);
      if (top) tops.set(x, Math.min(tops.get(x) ?? 99, y));
      const lidAbove = at(x, y - 1) ? hexOf(at(x, y - 1)) : hex;
      for (let k = 0; k < Dv; k++) {
        const f = Dv > 1 ? k / (Dv - 1) : 0;
        let c, e = 0, part = 2;
        if (k === 0) {
          if (q.screen) continue;            // the screen sits one voxel deep
          c = hex;
        } else if (k === 1 && q.screen) {
          if (q.part === 5) { c = hex; e = q.battery ? 0.55 : 0.9; part = 5; }
          else c = 0x000000;
        } else if (top) {
          c = sample(x - f * Wb, y - 1 - f * (Hl - 1), ['l', 'b'], lidAbove);
        } else if (left) {
          c = sample(x - 1 - f * (Wb - 1), y - f * Hl, ['b', 'l'], rowBack ?? darken(hex, 0.45));
        } else if (right || bottom) {
          c = hex;
        } else {
          c = rowBack ?? darken(hex, 0.4);    // the back of the casing, dark
        }
        set(x, y, k, c, e, part);
      }
    }
  }
  // ---- details, so the depth reads as a machine: a tapered housing behind the screen
  // (like the back of a tube monitor) with vent slots, vents down the right side, screws
  // at the back corners, and rubber feet. Colors come from the seeker's own casing.
  let fx0 = 99, fx1 = -1, fy0 = 99, fy1 = -1;
  for (let y = 0; y < 54; y++) for (let x = 0; x < 54; x++) if (isFront(x, y)) {
    fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y);
  }
  let Dn = 0;
  if (fx1 >= fx0) {
    const midY = Math.round((fy0 + fy1) / 2);
    let edge = null;
    for (let x = fx1; x >= fx0 && !edge; x--) if (isFront(x, midY)) edge = hexOf(at(x, midY));
    edge = edge ?? 0x4f5d73;
    const shell = darken(edge, 0.78), shell2 = darken(edge, 0.62), slot = darken(edge, 0.3);
    const fw = fx1 - fx0 + 1, fh = fy1 - fy0 + 1;
    Dn = Math.max(3, Math.round(Dv * 0.55));
    const ix = Math.max(2, Math.round(fw * 0.18)), iy = Math.max(2, Math.round(fh * 0.16));
    for (let k = Dv; k < Dv + Dn; k++) {
      const t = (k - Dv) / Dn;
      const jx = ix + Math.round(t * fw * 0.12), jy = iy + Math.round(t * fh * 0.1);
      for (let y = fy0 + jy; y <= fy1 - Math.max(1, jy - 1); y++) {
        for (let x = fx0 + jx; x <= fx1 - jx; x++) {
          const onTop = y === fy0 + jy, onSide = x === fx0 + jx || x === fx1 - jx;
          let c = (x + y) % 7 === 0 ? shell2 : shell;
          if ((onTop && (x - fx0) % 2 === 0 && k < Dv + Dn - 1) || (onSide && (y - fy0) % 2 === 0 && y > fy0 + jy + 1 && y < fy1 - jy - 1)) c = slot;
          set(x, y, k, c, 0, 2);
        }
      }
    }
    // vents down the right side, toward the back
    for (let y = fy0 + 2; y <= fy1 - 2; y += 2) {
      for (let k = Math.round(Dv * 0.4); k < Dv - 1; k++) if (isFront(fx1, y)) set(fx1, y, k, slot, 0, 2);
    }
    // screws at the back corners
    for (const [x, y] of [[fx0 + 1, fy0 + 1], [fx1 - 1, fy0 + 1], [fx0 + 1, fy1 - 1], [fx1 - 1, fy1 - 1]]) {
      if (isFront(x, y)) set(x, y, Dv - 1, 0xa2a6a7, 0, 2);
    }
    // a grille on the lid toward the back
    for (let x = fx0 + 2; x <= fx1 - 2; x += 2) {
      for (let k = Math.round(Dv * 0.62); k < Dv - 1; k++) if (tops.has(x)) set(x, tops.get(x), k, slot, 0, 2);
    }
    // rubber feet
    for (const x of [fx0 + 1, fx0 + 2, fx1 - 2, fx1 - 1]) {
      for (const k of [1, 2, Dv - 3, Dv - 2]) set(x, fy1 + 1, k, 0x1a1c20, 0, 2);
    }
    // a power cable out of the back, curling down
    const cx = fx0 + Math.round(fw * 0.7);
    for (let i = 0; i < 4; i++) set(cx, fy1 - iy - 1 + i, Dv + Dn + Math.min(i, 1), 0x1a1c20, 0, 2);
  }
  const kc = Math.round((Dv - 1) / 2);
  const groups = { 0: [], 1: [], 3: [], 4: [] };
  for (let y = 0; y < 54; y++) for (let x = 0; x < 54; x++) {
    const q = at(x, y);
    if (q && groups[q.part]) groups[q.part].push([x, y, q]);
  }
  const bbox = (list) => {
    let x0 = 99, x1 = -1, y0 = 99, y1 = -1;
    for (const [x, y] of list) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  // the hat stands on the lid, at the middle of the box's depth
  if (groups[4].length) {
    const b = bbox(groups[4]);
    const sx = Math.round(Wb / 2);
    let under = 99;
    for (let x = b.x0 + sx; x <= b.x1 + sx; x++) if (tops.has(x)) under = Math.min(under, tops.get(x));
    const sy = under < 99 ? under - 1 - b.y1 : Math.round(Hl / 2);
    const th = Math.max(3, Math.min(Dv, Math.round(b.w * 0.7)));
    for (const [x, y, q] of groups[4]) {
      for (let k = kc - Math.floor(th / 2); k < kc - Math.floor(th / 2) + th; k++) set(x + sx, y + sy, k, hexOf(q), 0, 4);
    }
  }
  // flank pieces at the sides, mid-depth
  if (groups[3].length) {
    const th = Math.max(3, Math.min(6, Dv - 2));
    const sx = Math.round(Wb / 2), sy = Math.round(Hl / 2);
    for (const [x, y, q] of groups[3]) {
      for (let k = kc - Math.floor(th / 2); k < kc - Math.floor(th / 2) + th; k++) set(x + sx, y + sy, k, hexOf(q), 0, 3);
    }
  }
  // the back add-on, behind the box
  for (const [x, y, q] of groups[1]) {
    for (let k = Dv + Math.round(Dn * 0.6); k < Dv + Math.round(Dn * 0.6) + 3; k++) set(x + Wb, y + Hl, k, hexOf(q), 0, 1);
  }
  // the floating object, in front of and below the monitor: centred under the art's front
  // edge (its bottom rows), floating a little in front of the screen, its body (the slab,
  // not a joystick's stick or a trackball's ball) a little below the monitor's feet
  if (groups[0].length) {
    const b = bbox(groups[0]);
    const model = floatingObject(Art.info(token).traits['Floating Object']);
    if (model) {
      const front = groups[0].filter(([, y]) => y >= b.y1 - 1).map(([x]) => x);
      const cx = (Math.min(...front) + Math.max(...front)) / 2;
      const u0 = Math.round(cx - (model.W - 1) / 2);
      const level = new Map();
      for (const [, v] of model.voxels) if (v >= 0) level.set(v, (level.get(v) || 0) + 1);
      let body = 0;
      for (const [v, n] of level) if (n >= (level.get(0) || 1) * 0.3) body = Math.max(body, v);
      const under = fy1 >= fy0 ? fy1 + 3 : b.y1 - 4;     // art row just below the feet
      const yBase = Math.min(under + body, b.y1 + 1);    // its underside; never lower than the art had it
      const pal = (hex) => { const [r, gg, bb] = nearestRGB([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]); return (r << 16) | (gg << 8) | bb; };
      for (const [u, v, w, hex, e] of model.voxels) set(u0 + u, yBase - v, -3 - w, pal(hex), e, 0);
    } else {
      // an object this file does not know yet: its art, flat, as a plate in front
      for (const [x, y, q] of groups[0]) set(x, y, -3, hexOf(q), 0, 0);
    }
  }
  // everything hovers a little above the snow: the floating object floats
  return { g, minY: lowest - 3, depth: Dv };
}

export class SeekerModel {
  // vox: meters per art pixel (the cabin's companion: VOX); outside: in the forest's
  // daylight (a witnessed seeker, giant) rather than the cabin's, and seen through the
  // fog more than stone is, as an apparition would be
  constructor({ vox = VOX, outside = false } = {}) {
    this.vox = vox;
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.parts = {};
    this.token = 0;
    this.material = outside ? worldMaterial({ unique: true, fogMask: 0.55, ambient: 1.2 }) : worldMaterial({ unique: true, fogMask: 0, ambient: 0.75 });
    this.glowMat = outside ? worldMaterial({ unique: true, fogMask: 0.35, emis: 1.6 }) : worldMaterial({ unique: true, fogMask: 0, ambient: 0.75 });
    this.activated = false;
    this.stage = 1;
    this._blink = 0;
    this._seed = 0;
    this.speaking = 0;         // 0..1 while it talks: its screen flickers
  }

  // look: { activated } or { activated: false, stage }
  async build(token, look) {
    this.token = token;
    this._seed = hash1(token) * 100;
    await Art.loadMeta();
    const bytes = await Art.cell(token);
    if (token !== this.token) return false;
    const px = Art.decode(token, bytes, look);
    const { g, minY, depth } = buildGrid(token, px);
    for (const m of Object.values(this.parts)) { this.model.remove(m); m.geometry.dispose(); }
    this.parts = {};
    // centred on its middle, so it can hover and turn about itself
    const origin = [33, minY + 27, Z0 - depth / 2];
    const add = (name, filter, mat) => {
      const geo = g.mesh(this.vox, origin, filter);
      if (!geo.attributes.position.count) return;
      const m = new THREE.Mesh(geo, mat);
      this.parts[name] = m;
      this.model.add(m);
    };
    add('object', (p) => p.part === 0, this.material);
    add('back', (p) => p.part === 1, this.material);
    add('body', (p) => p.part === 2, this.material);
    add('flank', (p) => p.part === 3, this.material);
    add('head', (p) => p.part === 4, this.material);
    add('glow', (p) => p.part === 5, this.glowMat);
    this.activated = !!look.activated;
    this.stage = look.stage || 6;
    const keep = this.activated ? 1 : (255 - Art.metaData().shades[this.stage - 1]) / 255;
    this.material.uniforms.uTint.value.setScalar(0.35 + 0.65 * keep);
    this.glowMat.uniforms.uTint.value.setScalar(this.activated ? 1 : 0.55 + keep * 0.45);
    return true;
  }

  // frame: the 12 fps frame number; lookSide: -1..1, where its eyes glance
  update(dt, time, frame, lookSide = 0) {
    const P = this.parts;
    const beat = (frame + Math.floor(this._seed)) % 16;
    const V = this.vox;
    if (P.object) P.object.position.y = [0, 1, 1, 1, 0, -1, -1, -1][Math.floor(frame / 5 + this._seed) % 8] * V * (this.activated ? 1 : 0.5);
    if (P.head) P.head.rotation.z = this.activated ? (beat < 8 ? 0.03 : -0.03) : 0;
    if (P.flank) P.flank.position.y = this.activated && beat % 8 < 2 ? V : 0;
    if (P.glow) {
      // it blinks every few seconds; while it speaks its screen flickers on the syllables
      this._blink -= dt;
      if (this._blink < 0) this._blink = 2.5 + hash1(frame + this.token) * 3.5;
      const open = this._blink > 0.17;
      P.glow.scale.y = open ? 1 : 0.15;
      P.glow.position.set(Math.round(Math.max(-1, Math.min(1, lookSide * 1.5))) * V, open ? 0 : V, 0);
      const talk = this.speaking > 0 && frame % 3 === 0 ? 1.5 : 1;
      this.glowMat.uniforms.uTint.value.setScalar((this.activated ? 1 : 0.7) * talk);
    }
  }

  dispose() {
    for (const m of Object.values(this.parts)) m.geometry.dispose();
    this.material.dispose();
    this.glowMat.dispose();
  }
}
