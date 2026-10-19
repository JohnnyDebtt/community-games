import * as THREE from 'three';
import { clamp, damp, dampAngle, hash1, TAU } from '../core/math.js';
import { worldMaterial } from '../render/materials.js';
import { VoxelGrid } from '../render/voxel.js';
import { addOutline } from '../render/outline.js';
import * as Art from '../seekernet/art.js';
import { nearest } from '../core/palette.js';
import { groundHeight } from '../world/layout.js';
import { floatingObject } from './objects.js';

// A SEEKER NET seeker as a little voxel robot: its exact collection art, each part
// extruded to its own depth (the floating object in front, the back add-on behind the
// monitor), animated part by part on the 12 fps grid. Dormant seekers are shaded by
// their charge stage and show their battery; activated ones are bright and blink.

const VOX = 0.02;              // meters per art pixel: a seeker stands about 0.8 m, half the Seeker's height
const Z0 = 34;                 // voxel z of the monitor's front face
const NZ = 56;                 // room in front of the monitor for its floating object
const PAD_Y = 8;               // room below the art for add-ons that move down

// The art is an oblique view: the lid (top face) recedes up and to the left, the bevel
// (left face) recedes to the left. Undo that projection: the front face becomes the
// front of a solid box, and the lid and bevel art are wrapped onto its top and left.
// Add-ons are placed where they belong in depth: the hat on top of the box, the back
// add-on behind it, the flank pieces at its sides. The floating object is modeled from
// scratch (objects.js) and floats in front, below the screen, where the art has it.
// Classified masks per base come from tools/bake_seekers.py.
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
    const [r, gg, b] = nearest([Math.round(((hex >> 16) & 255) * f), Math.round(((hex >> 8) & 255) * f), Math.round((hex & 255) * f)]);
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
      const pal = (hex) => { const [r, gg, bb] = nearest([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]); return (r << 16) | (gg << 8) | bb; };
      for (const [u, v, w, hex, e] of model.voxels) set(u0 + u, yBase - v, -3 - w, pal(hex), e, 0);
    } else {
      // an object this file does not know yet: its art, flat, as a plate in front
      for (const [x, y, q] of groups[0]) set(x, y, -3, hexOf(q), 0, 0);
    }
  }
  // everything hovers a little above the snow: the floating object floats
  return { g, minY: lowest - 3, depth: Dv };
}

export class SeekerBot {
  constructor(scene, net) {
    this.net = net;
    this.scene = scene;
    this.root = new THREE.Group();
    this.model = new THREE.Group();
    this.root.add(this.model);
    this.parts = {};
    this.token = 0;
    this.lookKey = '';
    this.material = worldMaterial({ unique: true });
    this.glowMat = worldMaterial({ unique: true });
    this.light = { pos: new THREE.Vector3(), color: new THREE.Color(0xd6edf5), range: 4.5, intensity: 0.4, on: false };
    this.pos = new THREE.Vector3();
    this.facing = 0;
    this.hop = 0;
    this.hovering = false;
    this.alert = 0;            // flashing when a fish bites at its hole
    this.overdrive = 0;        // 0.5 ready, 1 running
    this.surge = 0;            // 1..0 after a surge
    this.lookAt = null;        // optional point the eyes glance toward
    this.visible = false;
    this.root.visible = false;
    this._blink = 0;
    this._seed = 0;
    this._groundOffset = 0;
    scene.add(this.root);
  }

  async setToken(token, profile) {
    this.token = token;
    this.hovering = !!(profile && profile.hover);
    this._seed = hash1(token) * 100;
    await this.refreshLook(true);
  }

  async refreshLook(force = false) {
    if (!this.token) return;
    const s = this.net.state(this.token);
    const look = s.activated ? { activated: true } : { activated: false, stage: s.stage };
    const key = s.activated ? 'a' : 's' + s.stage;
    if (!force && key === this.lookKey) return;
    const token = this.token;
    const bytes = await Art.cell(token);
    if (token !== this.token) return;
    const px = Art.decode(token, bytes, look);
    const { g, minY, depth } = buildGrid(token, px);
    for (const m of Object.values(this.parts)) {
      this.model.remove(m);
      m.geometry.dispose();
    }
    this.parts = {};
    const origin = [33, minY, Z0 - depth / 2];
    const add = (name, filter, mat) => {
      const geo = g.mesh(VOX, origin, filter);
      if (!geo.attributes.position.count) return;
      const m = new THREE.Mesh(geo, mat);
      if (name !== 'glow') addOutline(m);
      this.parts[name] = m;
      this.model.add(m);
    };
    add('object', (p) => p.part === 0, this.material);
    add('back', (p) => p.part === 1, this.material);
    add('body', (p) => p.part === 2, this.material);
    add('flank', (p) => p.part === 3, this.material);
    add('head', (p) => p.part === 4, this.material);
    add('glow', (p) => p.part === 5, this.glowMat);
    // head and eyes pivot around the screen's middle
    const keep = s.activated ? 1 : (255 - Art.metaData().shades[s.stage - 1]) / 255;
    this.material.uniforms.uTint.value.setScalar(keep);
    this.glowMat.uniforms.uTint.value.setScalar(s.activated ? 1 : 0.5 + keep * 0.5);
    this.light.intensity = s.activated ? 0.9 : 0.06 + 0.07 * s.stage;
    this.light.color.setHex(s.activated ? 0xd6edf5 : 0x7bacbc);
    this.activated = s.activated;
    this.stage = s.stage;
    this.lookKey = key;
    this._groundOffset = (minY - 0) * VOX;
    this.show(true);
  }

  show(v) {
    this.visible = v;
    this.root.visible = v && !!this.token;
    this.light.on = this.root.visible;
  }

  place(x, z, facing) {
    this.pos.set(x, groundHeight(x, z), z);
    if (facing !== undefined) this.facing = facing;
  }

  // Follow a point at a distance, hopping on the beat (hovering ones glide).
  follow(dt, target, dist, frame) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    let moving = false;
    if (d > dist) {
      const sp = Math.min(7.5, (d - dist) * 2.2 + 0.6);
      const k = Math.min(1, (sp * dt) / d);
      this.pos.x += dx * k;
      this.pos.z += dz * k;
      moving = true;
      this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 8, dt);
    }
    this.pos.y = damp(this.pos.y, groundHeight(this.pos.x, this.pos.z), 14, dt);
    this.moving = moving;
  }

  faceTowards(x, z, dt, rate = 6) {
    this.facing = dampAngle(this.facing, Math.atan2(x - this.pos.x, z - this.pos.z), rate, dt);
  }

  update(dt, frame, time) {
    if (!this.root.visible) return;
    // it floats, well clear of the snow, and drifts slowly up and down on the 12 fps
    // grid: one slow breath every two bars (higher still with a Propeller or Thrusters)
    const tq = Math.floor(time * 12) / 12;
    const base = this.hovering ? 0.62 : 0.34;
    const breath = Math.sin(tq * 1.3 + this._seed) * 0.022;
    let y = this.activated ? base + breath : 0.06;
    if (this.moving) {
      // gliding along: a gentler, longer sway, a little forward lean
      y = (this.activated ? base : 0.06) + Math.sin(tq * 2.6 + this._seed) * 0.015;
    }
    if (this.alert > 0) {
      // a bite at its hole: it bobs to call you, three times a second, not a jitter
      y += Math.abs(Math.sin(tq * 9.4)) * 0.04;
      this.alert = Math.max(0, this.alert - dt * 0.12);
    }
    // its Overdrive: a soft lift on every beat while it runs
    if (this.overdrive >= 1) y += Math.abs(Math.sin(tq * Math.PI * 1.5)) * 0.035;
    let spin = 0;
    if (this.surge > 0) {
      // a surge: it leaps and spins twice, in steps
      this.surge = Math.max(0, this.surge - dt * 0.7);
      const k = 1 - this.surge;
      y += Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.45;
      spin = (Math.floor(Math.min(1, k * 1.4) * 16) / 16) * TAU * 2;
    }
    this.root.position.set(this.pos.x, this.pos.y + y, this.pos.z);
    this.root.rotation.y = this.facing + spin;
    this.root.rotation.x = this.moving && !this.surge ? 0.08 : 0;
    const P = this.parts;
    const beat = (frame + Math.floor(this._seed)) % 16;
    // the floating object drifts on its own, slower still
    if (P.object) P.object.position.y = this.activated ? [0, 1, 1, 1, 0, -1, -1, -1][Math.floor(frame / 5 + this._seed) % 8] * VOX : 0;
    if (P.head) P.head.rotation.z = this.activated ? (beat < 8 ? 0.03 : -0.03) : 0;
    if (P.flank) P.flank.position.y = this.activated && beat % 8 < 2 ? VOX : 0;
    if (P.glow) {
      // blink: two frames every few seconds when activated
      this._blink -= dt;
      let open = true;
      if (this.activated) {
        if (this._blink < 0) this._blink = 2.5 + hash1(frame + this.token) * 3.5;
        open = this._blink > 0.17;
      }
      P.glow.scale.y = open ? 1 : 0.15;
      P.glow.position.y = open ? 0 : 0.016;
      let gx = 0, gy = 0;
      if (this.lookAt && this.activated) {
        const lx = this.lookAt.x - this.pos.x, lz = this.lookAt.z - this.pos.z;
        const side = Math.sin(Math.atan2(lx, lz) - this.facing);
        gx = Math.round(clamp(side * 1.5, -1, 1)) * VOX;
        gy = this.lookAt.y < this.pos.y + 0.2 ? -VOX : 0;
      }
      P.glow.position.x = gx;
      P.glow.position.y += gy;
      let flash = this.alert > 0 && frame % 4 < 2 ? 1.8 : 1;
      if (this.overdrive >= 1) flash = frame % 2 ? 1.9 : 1.3;
      else if (this.overdrive > 0 && frame % 12 < 3) flash = 1.6;
      if (this.surge > 0) flash = 2.2;
      this.glowMat.uniforms.uEmisBoost && (this.glowMat.uniforms.uTint.value.setScalar((this.activated ? 1 : 0.7) * flash));
    }
    // the screen's light on the snow
    this.light.pos.set(this.pos.x + Math.sin(this.facing) * 0.45, this.pos.y + 0.5 + y, this.pos.z + Math.cos(this.facing) * 0.45);
    this.light.intensity = (this.activated ? 0.9 : 0.06 + 0.07 * (this.stage || 1)) * (this.alert > 0 && frame % 4 < 2 ? 2.2 : 1) * (this.surge > 0 ? 3 : this.overdrive >= 1 ? 1.6 : 1);
  }

  dispose() {
    for (const m of Object.values(this.parts)) m.geometry.dispose();
    this.scene.remove(this.root);
    this.light.on = false;
  }
}
