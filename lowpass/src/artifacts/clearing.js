import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { TAU } from '../core/math.js';
import { mixHex } from '../core/palette.js';

// A clearing to land in: now and then, once the scanner reaches deep enough (game.js
// says how deep, and nothing in the game says so), a wild signal is a clearing in the
// forest instead of a thing, a ring of lanterns standing about it and a column of light
// over it. Held in the scanner like anything else, it is landed in (landing.js); it is
// never recorded.

const WARM = 0xe8c98a, POST = 0x26292f, MOSS = 0x49573d, STONE = 0x6c7983;

export function describeLanding(d, move, R1) {
  d.family = 'landing';
  d.params = { posts: R1.int(9, 13), r: R1.range(19, 23) };
  d.size = 1;
  d.accent = WARM;
  d.strength = 1.2;
  d.grand = true;              // its column of light (models.js)
  d.name = 'A clearing';
  d.cls = 'Clearing';
  d.code = `LND-${(move.seed || move.tx).slice(2, 6).toUpperCase()}`;
  d.structure = `A clearing in the forest, ${d.params.posts} lanterns standing about it.`;
  d.origin = 'Somebody lit them.';
}

export function buildLanding(d, A, mats, ctx) {
  const P = d.params, group = new THREE.Group(), b = new Builder(), lit = new Builder();
  // the lanterns: dark posts, a lit box hung from each
  for (let i = 0; i < P.posts; i++) {
    const a = (i / P.posts) * TAU, x = Math.cos(a) * P.r, z = Math.sin(a) * P.r, y = ctx.ground(x, z);
    b.cyl(0.1, 0.14, 3.2, 5, mat(x, y + 1.5, z), POST);
    b.box(0.9, 0.08, 0.08, mat(x - Math.cos(a) * 0.35, y + 3.05, z - Math.sin(a) * 0.35, 0, -a, 0), POST);
    const lx = x - Math.cos(a) * 0.75, lz = z - Math.sin(a) * 0.75;
    b.box(0.42, 0.06, 0.42, mat(lx, y + 2.62, lz), POST);
    b.box(0.42, 0.06, 0.42, mat(lx, y + 2.1, lz), POST);
    lit.box(0.34, 0.46, 0.34, mat(lx, y + 2.36, lz), WARM, 1.6);
  }
  // its floor: moss, and flat stones in a ring about the middle
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3, r = 6.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.IcosahedronGeometry(0.9, 0);
    roughen(g, 0.25, i + 3);
    b.add(g, mat(x, ctx.ground(x, z) - 0.1, z, 0, a, 0, 1.4, 0.25, 1), STONE, 0, { flat: true });
  }
  for (let i = 0; i < 24; i++) {
    const a = i * 2.4, r = 3 + (i % 5) * 3.4, x = Math.cos(a) * r, z = Math.sin(a) * r;
    const g = new THREE.IcosahedronGeometry(0.5 + (i % 3) * 0.2, 0);
    roughen(g, 0.2, i + 11);
    b.add(g, mat(x, ctx.ground(x, z) - 0.15, z, 0, 0, 0, 1.6, 0.3, 1.6), mixHex(MOSS, 0x5b6e3e, (i % 4) / 4), 0, { flat: true });
  }
  group.add(new THREE.Mesh(b.build(), mats.body), new THREE.Mesh(lit.build(), mats.glow));
  return {
    group, light: new THREE.Vector3(0, 3, 0), focus: new THREE.Vector3(0, 2, 0), span: P.r, height: 4, clear: P.r + 9, solid: null,
    update() {},
  };
}

