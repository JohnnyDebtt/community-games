import * as THREE from 'three';
import { Builder, mat } from '../render/build.js';
import { TAU } from '../core/math.js';

// The Seeker's three backpacks from The Seeker (assets/items/backpack1..3.png), modeled
// from their sprites in the sprites' own colors: a slate body, olive pockets, a brown
// bedroll and grey metal. As in the game they are big beside the Seeker (8, 9 and 13 of
// its 12 pixels tall) and ride low on the back. Local space: +z away from the Seeker's
// back, y up from the pack's bottom, x across the back.

const SLATE = 0x323d3e, SLATE2 = 0x3f4b4c, SLATE3 = 0x283233;
const OLIVE = 0x656853, OLIVE2 = 0x575a47, OLIVE3 = 0x737760;
const BROWN = 0x6b6258, BROWN2 = 0x5a5249, BROWN3 = 0x7a7065;
const METAL = 0xa2a6a7, STEEL = 0x6e7e82, STEEL2 = 0x4e555b;
const BLACK = 0x0f0e16, STRAP = 0x1f2426;

// A soft box: a box whose top edges are rounded by a half cylinder.
function sack(b, w, h, d, m, color, top = 0x000000) {
  b.box(w, h - d * 0.25, d, new THREE.Matrix4().multiplyMatrices(m, mat(0, (h - d * 0.25) / 2, 0)), color);
  b.add(new THREE.CylinderGeometry(d / 2, d / 2, w, 8, 1, false, 0, Math.PI), new THREE.Matrix4().multiplyMatrices(m, mat(0, h - d * 0.25, 0, 0, 0, Math.PI / 2)), top || color);
}

function roll(b, r, len, m, color, color2) {
  b.cyl(r, r, len, 9, new THREE.Matrix4().multiplyMatrices(m, mat(0, 0, 0, 0, 0, Math.PI / 2)), (x, y, z) => (Math.abs(y) > len * 0.42 ? color2 : color));
}

function buckle(b, x, y, z, m) {
  b.box(0.07, 0.05, 0.03, new THREE.Matrix4().multiplyMatrices(m, mat(x, y, z)), METAL, 0.1);
}

function strap(b, x, y0, y1, z, m, w = 0.045) {
  b.box(w, y1 - y0, 0.025, new THREE.Matrix4().multiplyMatrices(m, mat(x, (y0 + y1) / 2, z)), STRAP);
}

export function backpackGeometry(level) {
  const b = new Builder();
  const I = new THREE.Matrix4();
  if (level === 1) {
    // a satchel pack: slate body, an olive flap with a buckle, an olive pocket
    const w = 0.5, h = 0.74, d = 0.42;
    sack(b, w, h, d, mat(0, 0, d / 2), SLATE);
    b.box(w + 0.02, 0.05, d + 0.02, mat(0, 0.025, d / 2), BLACK);
    // the flap over the top and down the outer face
    b.add(new THREE.CylinderGeometry(d / 2 + 0.025, d / 2 + 0.025, w + 0.03, 8, 1, false, 0, Math.PI), mat(0, h - d * 0.25, d / 2, 0, 0, Math.PI / 2), OLIVE);
    b.box(w + 0.03, 0.26, 0.03, mat(0, h - d * 0.25 - 0.12, d + 0.012), OLIVE2);
    buckle(b, 0, h - d * 0.25 - 0.22, d + 0.03, I);
    // the outer pocket, low
    b.box(w * 0.74, 0.24, 0.1, mat(0, 0.2, d + 0.045), OLIVE);
    b.box(w * 0.74, 0.04, 0.11, mat(0, 0.31, d + 0.05), OLIVE3);
    strap(b, -0.14, 0.05, h - 0.1, d + 0.02, I);
    strap(b, 0.14, 0.05, h - 0.1, d + 0.02, I);
    // side pockets and a tin cup on a clip
    for (const s of [-1, 1]) b.box(0.07, 0.26, d * 0.6, mat(s * (w / 2 + 0.03), 0.2, d / 2), SLATE2);
    b.cyl(0.05, 0.045, 0.08, 7, mat(w / 2 + 0.06, 0.48, d * 0.7), METAL);
    b.box(0.012, 0.08, 0.012, mat(w / 2 + 0.06, 0.56, d * 0.7), STEEL2);
  } else if (level === 2) {
    // a trail pack: taller, a bedroll across the top, a bottle at the side
    const w = 0.58, h = 0.96, d = 0.5;
    sack(b, w, h, d, mat(0, 0, d / 2), SLATE);
    b.box(w + 0.02, 0.05, d + 0.02, mat(0, 0.025, d / 2), BLACK);
    b.box(w + 0.02, 0.32, 0.03, mat(0, h - 0.3, d + 0.01), OLIVE2);
    buckle(b, -0.15, h - 0.42, d + 0.03, I);
    buckle(b, 0.15, h - 0.42, d + 0.03, I);
    // two outer pockets
    for (const s of [-1, 1]) {
      b.box(w * 0.4, 0.3, 0.12, mat(s * w * 0.22, 0.24, d + 0.055), OLIVE);
      b.box(w * 0.4, 0.05, 0.13, mat(s * w * 0.22, 0.37, d + 0.06), OLIVE3);
      buckle(b, s * w * 0.22, 0.34, d + 0.125, I);
    }
    strap(b, 0, 0.05, h - 0.12, d + 0.02, I, 0.05);
    // the bedroll, strapped across the top
    roll(b, 0.15, w + 0.16, mat(0, h + 0.06, d * 0.5), BROWN, BROWN2);
    for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.155, 0.018, 3, 10), mat(s * 0.18, h + 0.06, d * 0.5, 0, Math.PI / 2, 0), STRAP);
    // a bottle and a coil of line at the sides
    b.cyl(0.07, 0.07, 0.28, 7, mat(w / 2 + 0.07, 0.2, d * 0.55), STEEL);
    b.cyl(0.05, 0.05, 0.04, 7, mat(w / 2 + 0.07, 0.36, d * 0.55), METAL);
    b.add(new THREE.TorusGeometry(0.1, 0.03, 4, 10), mat(-w / 2 - 0.05, 0.5, d * 0.55, 0, Math.PI / 2, 0), BROWN3);
  } else {
    // the expedition pack: a frame above the bag with a pot on top, the bedroll down
    // the outer face, pockets everywhere
    const w = 0.66, h = 1.2, d = 0.56;
    sack(b, w, h, d, mat(0, 0, d / 2), SLATE);
    b.box(w + 0.02, 0.06, d + 0.02, mat(0, 0.03, d / 2), BLACK);
    // the frame: two rails up the back and a cross bar above the bag
    for (const s of [-1, 1]) {
      b.box(0.045, h + 0.42, 0.045, mat(s * (w / 2 + 0.01), (h + 0.42) / 2 - 0.05, 0.02), STEEL2);
      b.box(0.045, 0.045, d * 0.7, mat(s * (w / 2 + 0.01), h + 0.34, d * 0.35), STEEL2);
    }
    b.box(w + 0.06, 0.045, 0.045, mat(0, h + 0.36, 0.02), STEEL2);
    // a pot and its lid on the frame
    b.cyl(0.17, 0.15, 0.2, 10, mat(0, h + 0.47, d * 0.38), STEEL);
    b.cyl(0.18, 0.18, 0.03, 10, mat(0, h + 0.58, d * 0.38), METAL);
    b.box(0.06, 0.03, 0.03, mat(0, h + 0.61, d * 0.38), STEEL2);
    // the bedroll, standing up the outer face
    b.cyl(0.16, 0.16, h * 0.72, 9, mat(0, h * 0.46, d + 0.14), (x, y) => (Math.abs(y) > h * 0.3 ? BROWN2 : BROWN));
    for (const y of [0.3, 0.75]) b.add(new THREE.TorusGeometry(0.165, 0.02, 3, 10), mat(0, h * y, d + 0.14, Math.PI / 2, 0, 0), STRAP);
    // pockets at the sides and below
    for (const s of [-1, 1]) {
      b.box(0.12, 0.42, d * 0.66, mat(s * (w / 2 + 0.06), 0.34, d * 0.5), OLIVE);
      b.box(0.13, 0.05, d * 0.67, mat(s * (w / 2 + 0.065), 0.56, d * 0.5), OLIVE3);
      buckle(b, s * (w / 2 + 0.13), 0.48, d * 0.5, I);
    }
    b.box(w * 0.8, 0.22, 0.14, mat(0, 0.16, d + 0.06), OLIVE);
    b.box(w * 0.8, 0.04, 0.15, mat(0, 0.27, d + 0.065), OLIVE3);
    b.box(w + 0.03, 0.3, 0.03, mat(0, h - 0.3, d + 0.01), OLIVE2);
    for (const s of [-1, 1]) strap(b, s * 0.2, 0.06, h - 0.1, d + 0.02, I, 0.05);
    // a lantern hanging from the frame, a rolled mat under the bag
    b.box(0.1, 0.14, 0.1, mat(w / 2 + 0.1, h + 0.12, d * 0.3), 0x2d2e33);
    b.box(0.06, 0.08, 0.104, mat(w / 2 + 0.1, h + 0.12, d * 0.3), 0xe9e2cf, 0.8);
    b.box(0.012, 0.16, 0.012, mat(w / 2 + 0.1, h + 0.27, d * 0.3), STEEL2);
    roll(b, 0.1, w + 0.12, mat(0, -0.04, d * 0.6), OLIVE2, OLIVE);
  }
  return b.build();
}

// How tall each pack stands, for placing it.
export const PACK_SIZE = { 1: { h: 0.74, d: 0.42 }, 2: { h: 1.08, d: 0.5 }, 3: { h: 1.85, d: 0.72 } };

export { TAU };
