import * as THREE from 'three';
import { Builder, mat, roughen } from '../render/build.js';
import { glowMaterial, pointsMaterial } from '../render/materials.js';
import { LAYER_FX } from '../render/pipeline.js';
import { TAU, clamp } from '../core/math.js';
import { mixHex } from '../core/palette.js';
import { stratum } from './strata.js';
import { SURFACE } from './species.js';
import { PULSE, STONE } from './parts.js';

// What stands in the forest about a clearing, found only on foot (afoot.js): small things
// between the trees, very strange and never frightening, of the fog and the moss: old
// instruments the forest has grown over, and things the scanner cannot account for. Each
// in its depth's colors (the deeper, the more kinds, and the larger), and now and then
// marked (+): larger, ringed with light, worth ten times as much. None of them goes
// anywhere.
//
// The kinds, and the depth that first has them:
export const CURIOS = [
  ['probe', 0], ['monolith', 0], ['hoverstones', 0], ['antennatree', 0], ['seedpod', 0], ['hologram', 0], ['marker', 0], ['vent', 0],
  ['terrarium', 3], ['stair', 3], ['mirrorpool', 3], ['droppod', 3],
  ['solarbloom', 4], ['crystals', 4], ['datastack', 4], ['cubes', 4],
  ['portal', 5], ['geode', 5], ['orrery', 5], ['spikes', 5],
];

const INFO = {
  probe: ['PRB', 'Old probe', ['Probe', 'Lander', 'Instrument', 'Survey'], () => 'A survey probe half sunk in the moss, older than the Codex has records for; its mast still turns, its light still blinks.'],
  monolith: ['MNL', 'Slab', ['Slab', 'Monolith', 'Tablet', 'Plate'], () => 'A black slab, smooth as still water, hanging a hand’s breadth over the moss; lines of light climb through it and are gone.'],
  hoverstones: ['HVR', 'Gravity anomaly', ['Stones', 'Anomaly', 'Ring', 'Suspension'], (P) => `${P.n} flat stones hanging in a ring over a puddle that does not ripple, turning very slowly. The scanner reads the gravity here as a little wrong.`],
  antennatree: ['ANT', 'Grown-in antenna', ['Dish', 'Antenna', 'Listener', 'Receiver'], () => 'A dish on a mast, listening to the sky, and a tree that has grown up around it and through it.'],
  seedpod: ['SED', 'Seed capsule', ['Capsule', 'Nursery', 'Seed Bank', 'Cradle'], () => 'A capsule under a glass lid, full of seedlings, its lamp still on; nobody has been back for them, and they are doing well.'],
  hologram: ['HLG', 'Projector', ['Projector', 'Globe', 'Image', 'Model'], () => 'A projector on a stump showing this planet, turning, flickering now and then; the continents are not where they are now.'],
  marker: ['MRK', 'Survey marker', ['Marker', 'Benchmark', 'Survey Point', 'Tripod'], () => 'A survey marker on three legs, its beam sweeping the fog, still measuring something to the millimeter.'],
  vent: ['VNT', 'Capped vent', ['Vent', 'Breather', 'Tap', 'Well'], () => 'A vent capped in metal, warm to stand by, breathing a spiral of steam higher than the trees.'],
  terrarium: ['TRR', 'Terrarium', ['Terrarium', 'Dome', 'Small World', 'Garden'], () => 'A glass dome with a small forest inside and a cloud of its own, which rains on it.'],
  stair: ['STR', 'Floating stair', ['Stair', 'Ascent', 'Spiral', 'Landing'], (P) => `A stair of ${P.n + 6} stones hanging in the air, each a little nearer the sky, to a lit plate and nothing else.`],
  mirrorpool: ['MRP', 'Mirror pool', ['Pool', 'Mirror', 'Reflection', 'Basin'], () => 'A pool of something like liquid metal, perfectly round, a moon in it, and a small moon over it; neither is the moon in the sky.'],
  droppod: ['POD', 'Drop pod', ['Pod', 'Capsule', 'Landfall', 'Shell'], () => 'A landing pod come down long ago, half sunk, its hatch open and lit; a tree is growing out of the top of it.'],
  solarbloom: ['SOL', 'Solar bloom', ['Bloom', 'Heliotrope', 'Collector', 'Flower'], () => 'A flower of metal on a metal stem, its petals panels, its middle a lens, turning very slowly toward a light that is not the sun.'],
  crystals: ['CRS', 'Crystal growth', ['Growth', 'Branching', 'Formation', 'Crown'], () => 'Crystal grown up out of a mound of moss in branches, every tip lit; the scanner calls it mineral, and then is not sure.'],
  datastack: ['DTS', 'Data stack', ['Stack', 'Archive', 'Record', 'Library'], (P) => `${P.n + 3} plates of glass stacked crooked, light moving inside them; over the top one, panels of light hang in the air, still, as if just read.`],
  cubes: ['CUB', 'Light helix', ['Helix', 'Cubes', 'Spiral', 'Lattice'], (P) => `${P.n * 3} small cubes of light hanging in a helix about a dead trunk, going round it once a minute.`],
  portal: ['PRT', 'Standing ring', ['Ring', 'Gate', 'Aperture', 'Threshold'], () => 'A ring of metal standing on its own in the forest; the fog inside it is another color than the fog outside.'],
  geode: ['GEO', 'Geode', ['Geode', 'Egg', 'Hollow', 'Chamber'], () => 'An egg of stone as tall as a person, split open, crystals inside it lit like a room.'],
  orrery: ['ORY', 'Light orrery', ['Orrery', 'System', 'Heavens', 'Model'], (P) => `This planet’s system in light over a stump, ${Math.min(6, P.n)} small worlds going round a lit one, keeping their own year.`],
  spikes: ['SPK', 'Ringing spikes', ['Spikes', 'Array', 'Tuning', 'Circle'], (P) => `${Math.min(9, P.n)} spikes of metal driven into the ground in a ring; they ring, too low to hear, and light runs up them.`],
};
const ADJ = ['Patient', 'Quiet', 'Forgotten', 'Silent', 'Second', 'Old', 'Curious', 'Unlikely', 'Mossy', 'Unlisted', 'Lost', 'Folded', 'Calibrated', 'Dormant'];
const OF = ['of the Damp', 'of the Long Fog', 'of the First Survey', 'of Low Branches', 'of the Quiet Hour', 'of Nobody’s Records', 'of the Underbrush', 'of an Earlier Visit'];

export function describeCurio(d, move, R1, R3) {
  const depth = d.depth, st = depth ? stratum(depth) : SURFACE;
  const open = CURIOS.filter(([, m]) => m <= depth).map(([k]) => k);
  const kind = move.kind && INFO[move.kind] ? (R1(), move.kind) : R1.pick(open);
  const [code, cls, nouns, text] = INFO[kind];
  const P = { kind, n: R1.int(5, 11), hue: R1() };
  d.family = 'curio';
  d.curio = kind;
  d.plus = !!move.plus;
  d.params = P;
  d.size = (1 + 0.15 * Math.log2(1 + depth)) * R1.range(0.9, 1.1) * (d.plus ? 1.4 : 1);
  d.accent = st.light;
  d.strength = 0.9;
  d.grand = false;
  const noun = R3.pick(nouns), r = R3();
  d.name = (r < 0.45 ? `The ${R3.pick(ADJ)} ${noun}` : r < 0.75 ? `The ${noun} ${R3.pick(OF)}` : `${R3.pick(ADJ)} ${noun} ${R3.pick(OF)}`) + (d.plus ? '+' : '');
  d.code = `${depth ? `D${depth}${d.plus ? '+' : ''}-` : ''}${code}-${(move.seed || move.tx).slice(2, 6).toUpperCase()}`;
  d.cls = cls;
  d.structure = text(P);
  d.origin = `Found on foot, in the forest about a clearing${depth ? `, of ${st.title}` : ''}${d.plus ? ': one of the marked' : ''}. No other ship will find it.`;
}

// ------------------------------------------------------------------ building
const BARK = 0x3a3530, MOSS = 0x49573d, MOSS2 = 0x5b6e3e, METAL = 0x8a9198;

function lightMesh(geo, fx, opacity) {
  const m = glowMaterial({ opacity, fog: 0.6, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m);
  mesh.layers.set(LAYER_FX);
  mesh.frustumCulled = false;
  fx.push([m, opacity]);
  return mesh;
}

// a part: what is lit like the world, what glows on the pulse, and pure light
class Part {
  constructor(parent, x = 0, y = 0, z = 0) {
    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    parent.add(this.group);
    this.body = new Builder();
    this.lit = new Builder();
    this.glow = new Builder();
  }
  finish(mats, fx, opacity = 0.7) {
    if (!this.body.empty) this.group.add(new THREE.Mesh(this.body.build(), mats.body));
    if (!this.lit.empty) this.group.add(new THREE.Mesh(this.lit.build(), mats.glow));
    if (!this.glow.empty) this.group.add(lightMesh(this.glow.build(), fx, opacity));
  }
}

// motes that move (steam, rain, snow): points, their places written each frame
function motes(parent, n, color, size, fx, opacity = 0.8) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  const m = pointsMaterial({ color, size, additive: true, opacity });
  const p = new THREE.Points(g, m);
  p.layers.set(LAYER_FX);
  p.frustumCulled = false;
  parent.add(p);
  fx.push([m, opacity]);
  return { pos, alpha: g.attributes.aAlpha.array, commit() { g.attributes.position.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true; } };
}

const rock = (r, seed, amount = 0.3, detail = 0) => { const g = new THREE.IcosahedronGeometry(r, detail); roughen(g, r * amount, seed); return g; };
const curve = (b, pts, r, color, em = 0) => b.tube(pts.map((p) => new THREE.Vector3(...p)), r, 5, color, em);
// a stump to stand something on
function stump(b, r, h, R) { b.cyl(r, r * 1.15, h, 8, mat(0, h / 2 - 0.1, 0), BARK); b.cyl(r * 0.92, r * 0.92, 0.02, 8, mat(0, h - 0.09, 0), 0x8a6a4a); for (let i = 0; i < 4; i++) { const a = i * 1.7 + R(); curve(b, [[Math.cos(a) * r, 0.2, Math.sin(a) * r], [Math.cos(a) * r * 1.8, -0.1, Math.sin(a) * r * 1.8]], 0.12 * r / 0.4, BARK); } }
// a bed of moss and ferns at its foot
function moss(b, r, R, n = 6) {
  for (let i = 0; i < n; i++) { const a = R() * TAU, d = r * (0.3 + R() * 0.8); b.add(rock(0.35 + R() * 0.3, i + 7, 0.25), mat(Math.cos(a) * d, -0.05, Math.sin(a) * d, 0, 0, 0, 1.4, 0.35, 1.4), i % 2 ? MOSS : MOSS2, 0, { flat: true }); }
}
function fern(b, x, z, s, R) { for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU + R() * 0.4; b.cone(0.05 * s, 0.7 * s, 3, mat(x + Math.cos(a) * 0.12 * s, 0.3 * s, z + Math.sin(a) * 0.12 * s, Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9), i % 2 ? MOSS : MOSS2); } }

const KINDS = {
  probe(k, pal, P, R) {
    // an old survey probe, half sunk, its mast still turning, its light still blinking
    const b = k.body, hull = mixHex(METAL, pal.dark, 0.3);
    b.add(new THREE.CylinderGeometry(0.75, 0.9, 0.9, 8), mat(0, 0.2, 0, 0.25, 0, 0.18), hull);
    b.cyl(0.78, 0.78, 0.06, 8, mat(0, 0.66, 0.12, 0.25, 0, 0.18), mixHex(METAL, 0xffffff, 0.2));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + 0.4; curve(b, [[Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7], [Math.cos(a) * 1.3, -0.15, Math.sin(a) * 1.3]], 0.05, hull); }
    k.lit.box(0.3, 0.05, 0.3, mat(0.25, 0.68, -0.1, 0.25, 0.3, 0.18), pal.light, 1.3);
    const mast = new Part(k.group, 0.1, 0.75, 0.15);
    curve(mast.body, [[0, 0, 0], [0, 1.4, 0]], 0.04, hull);
    mast.body.add(new THREE.CylinderGeometry(0.45, 0.05, 0.25, 12, 1, true), mat(0, 1.45, 0.1, -1.0, 0, 0), mixHex(METAL, 0xffffff, 0.25));
    mast.lit.sphere(0.07, 6, 4, mat(0, 1.6, 0.2), pal.second, PULSE);
    k.parts.push(mast);
    moss(b, 1.4, R, 8);
    return { light: [0, 1.6, 0], height: 2.4, span: 1.4, update(t) { mast.group.rotation.y = t * 0.3; } };
  },
  monolith(k, pal, P, R, fx) {
    // a black slab, smooth as water, hanging a hand's breadth over the moss, lines of light
    // rising through it
    const slab = new Part(k.group, 0, 0.15, 0);
    slab.body.box(0.9, 2.6, 0.22, mat(0, 1.3, 0), 0x0e0e12);
    const lines = [];
    for (let i = 0; i < 9; i++) { const l = new Part(slab.group, (i / 8 - 0.5) * 0.7, 0, 0.115); l.glow.box(0.03, 0.4, 0.01, mat(0, 0, 0), mixHex(pal.light, 0xffffff, 0.2), 1); lines.push(l); }
    k.parts.push(slab, ...lines);
    moss(k.body, 1, R);
    return { light: [0, 1.4, 0.2], height: 2.9, span: 0.9, update(t) {
      slab.group.position.y = 0.15 + Math.sin(t * 0.7) * 0.03;
      lines.forEach((l, i) => { l.group.position.y = 0.2 + ((t * 0.35 + i * 0.37) % 1) * 2.2; });
    } };
  },
  hoverstones(k, pal, P, R) {
    // stones hanging in a ring over a puddle that does not ripple, turning slowly
    k.glow.add(new THREE.CircleGeometry(1.7, 28), mat(0, 0.03, 0, -Math.PI / 2, 0, 0), mixHex(pal.light, 0xffffff, 0.2), 0.35);
    k.body.torus(1.75, 0.12, 4, 28, mat(0, 0.02, 0, Math.PI / 2, 0, 0), STONE[2]);
    const ring = new Part(k.group, 0, 1.3, 0);
    for (let i = 0; i < P.n; i++) {
      const a = (i / P.n) * TAU;
      ring.body.add(rock(0.32, i * 3 + 1, 0.3), mat(Math.cos(a) * 1.3, Math.sin(i * 2.1) * 0.15, Math.sin(a) * 1.3, R() * 0.4, a, 0, 1.3, 0.35, 1), STONE[(i % 3) + 1], 0, { flat: true });
      ring.lit.box(0.06, 0.02, 0.06, mat(Math.cos(a) * 1.3, -0.1, Math.sin(a) * 1.3), pal.light, PULSE);
    }
    k.parts.push(ring);
    return { light: [0, 1.3, 0], height: 1.8, span: 1.8, update(t) { ring.group.rotation.y = t * 0.08; ring.group.position.y = 1.3 + Math.sin(t * 0.5) * 0.06; } };
  },
  antennatree(k, pal, P, R) {
    // a dish on a mast that a tree has grown up around and through
    const b = k.body, hull = mixHex(METAL, pal.dark, 0.25);
    b.cyl(0.06, 0.08, 3.4, 6, mat(0, 1.7, 0), hull);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; curve(b, [[0, 2.6, 0], [Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4]], 0.02, hull); }
    b.add(new THREE.SphereGeometry(1.0, 14, 6, 0, TAU, 0, 0.8), mat(0, 3.5, 0.2, -0.9, 0, 0), mixHex(METAL, 0xffffff, 0.3));
    k.lit.sphere(0.08, 6, 4, mat(0, 3.6, 0.9), pal.light, PULSE);
    // the tree: roots over the ground, a trunk winding up the mast, a few boughs
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + R(); curve(b, [[Math.cos(a) * 1.2, -0.2, Math.sin(a) * 1.2], [Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4], [0, 0.8, 0]], 0.1, BARK); }
    const coil = [];
    for (let i = 0; i <= 24; i++) { const u = i / 24, a = u * TAU * 2.2; coil.push([Math.cos(a) * 0.16, u * 3, Math.sin(a) * 0.16]); }
    curve(b, coil, 0.12, BARK);
    for (let i = 0; i < 5; i++) { const y = 1.4 + i * 0.35, a = i * 2.2; b.cone(0.55 - i * 0.06, 0.9, 6, mat(Math.cos(a) * 0.5, y, Math.sin(a) * 0.5, 0, a, Math.PI * 0.4), i % 2 ? 0x2a3a30 : 0x35503c); }
    moss(b, 1.4, R);
    return { light: [0, 3.4, 0.6], height: 4.4, span: 1.6 };
  },
  seedpod(k, pal, P, R) {
    // a capsule under a glass lid, full of seedlings under its own lamp, still tending them
    const b = k.body, hull = mixHex(METAL, pal.dark, 0.3);
    b.box(1.8, 0.5, 0.9, mat(0, 0.2, 0, 0, 0, 0.04), hull);
    b.box(1.85, 0.06, 0.95, mat(0, 0.46, 0, 0, 0, 0.04), mixHex(METAL, 0xffffff, 0.25));
    b.box(1.6, 0.04, 0.72, mat(0, 0.47, 0, 0, 0, 0.04), 0x2a2018);
    for (let i = 0; i < 18; i++) { const x = -0.7 + (i % 6) * 0.28, z = -0.25 + Math.floor(i / 6) * 0.25; b.cone(0.05, 0.12 + R() * 0.2, 4, mat(x, 0.55 + x * 0.04, z), i % 2 ? MOSS2 : 0x6a8a45); }
    k.glow.add(new THREE.CylinderGeometry(0.46, 0.46, 1.8, 14, 1, true, 0, Math.PI), mat(0, 0.47, 0, 0, 0, Math.PI / 2 + 0.04), mixHex(0xcfe8f0, pal.light, 0.2), 0.18);
    k.lit.box(1.2, 0.03, 0.08, mat(0, 0.9, 0, 0, 0, 0.04), mixHex(0xffb0c8, pal.light, 0.3), 1.6);
    k.lit.box(0.12, 0.05, 0.05, mat(0.8, 0.3, 0.46), pal.second, PULSE);
    moss(b, 1.3, R);
    return { light: [0, 0.8, 0], height: 1.2, span: 1.2 };
  },
  hologram(k, pal, P, R, fx) {
    // a projector on a stump showing the planet, flickering, turning
    const b = k.body;
    stump(b, 0.5, 0.6, R);
    b.cyl(0.22, 0.28, 0.16, 10, mat(0, 0.58, 0), mixHex(METAL, pal.dark, 0.3));
    k.lit.cyl(0.14, 0.14, 0.03, 10, mat(0, 0.67, 0), pal.light, 1.6);
    const globe = new Part(k.group, 0, 1.55, 0);
    for (let i = 1; i < 8; i++) { const lat = (i / 8) * Math.PI - Math.PI / 2; globe.glow.add(new THREE.TorusGeometry(Math.cos(lat) * 0.7, 0.008, 3, 32), mat(0, Math.sin(lat) * 0.7, 0, Math.PI / 2, 0, 0), pal.light, 0.8); }
    for (let i = 0; i < 6; i++) globe.glow.add(new THREE.TorusGeometry(0.7, 0.008, 3, 32), mat(0, 0, 0, 0, (i / 6) * Math.PI, 0), pal.light, 0.6);
    for (let i = 0; i < 5; i++) { const a = R() * TAU, e = (R() - 0.5) * 2; globe.glow.add(new THREE.CircleGeometry(0.12 + R() * 0.12, 8), mat(Math.cos(a) * Math.cos(e) * 0.71, Math.sin(e) * 0.71, Math.sin(a) * Math.cos(e) * 0.71, 0, -a + Math.PI / 2, 0), pal.second, 0.5); }
    k.glow.add(new THREE.ConeGeometry(0.7, 0.85, 16, 1, true), mat(0, 1.12, 0, Math.PI, 0, 0), mixHex(pal.light, 0xffffff, 0.3), 0.08);
    k.parts.push(globe);
    return { light: [0, 1.55, 0], height: 2.3, span: 0.9, update(t) { globe.group.rotation.y = t * 0.3; globe.group.visible = Math.sin(t * 37) > -0.93; } };
  },
  marker(k, pal, P, R, fx) {
    // a survey marker on three legs, its beam sweeping the fog
    const b = k.body, hull = mixHex(METAL, pal.dark, 0.3);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU; curve(b, [[0, 1.3, 0], [Math.cos(a) * 0.7, -0.1, Math.sin(a) * 0.7]], 0.035, hull); }
    b.box(0.3, 0.3, 0.3, mat(0, 1.42, 0), hull);
    k.lit.sphere(0.07, 6, 4, mat(0, 1.6, 0), pal.light, PULSE);
    const beam = new Part(k.group, 0, 1.5, 0);
    const g = new THREE.CylinderGeometry(0.05, 0.4, 14, 8, 1, true);
    g.rotateZ(Math.PI / 2);
    g.translate(7, 0, 0);
    beam.glow.add(g, null, mixHex(pal.light, 0xffffff, 0.4), 0.3);
    k.parts.push(beam);
    return { light: [0, 1.5, 0], height: 1.8, span: 0.8, update(t) { beam.group.rotation.y = t * 0.7; beam.group.rotation.z = Math.sin(t * 0.3) * 0.1; } };
  },
  vent(k, pal, P, R, fx) {
    // a vent capped in metal, breathing a spiral of warm steam higher than the trees
    const b = k.body, hull = mixHex(METAL, pal.dark, 0.35);
    b.cyl(0.55, 0.75, 0.5, 10, mat(0, 0.15, 0), hull);
    b.cyl(0.4, 0.4, 0.12, 10, mat(0, 0.46, 0), mixHex(METAL, 0xffffff, 0.2));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; b.box(0.1, 0.4, 0.1, mat(Math.cos(a) * 0.62, 0.3, Math.sin(a) * 0.62), hull); }
    k.lit.cyl(0.3, 0.3, 0.02, 10, mat(0, 0.53, 0), mixHex(0xff8a4a, pal.second, 0.4), PULSE);
    for (let i = 0; i < 7; i++) { const a = i * 0.9; b.add(rock(0.3 + R() * 0.25, i + 30, 0.3), mat(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1), STONE[(i % 3) + 1], 0, { flat: true }); }
    const steam = motes(k.group, 60, 0xeef3f4, 0.4, fx, 0.45);
    return { light: [0, 0.8, 0], height: 7, span: 1.2, update(t) {
      for (let i = 0; i < 60; i++) { const ph = (t * 0.08 + i / 60) % 1, a = ph * TAU * 3, r = 0.2 + ph * 1.2; steam.pos.set([Math.cos(a) * r * ph, 0.55 + ph * 7, Math.sin(a) * r * ph], i * 3); steam.alpha[i] = Math.sin(ph * Math.PI) * 0.7; }
      steam.commit();
    } };
  },
  terrarium(k, pal, P, R, fx) {
    // a glass dome with a small world inside: a few trees, and weather of its own
    k.body.cyl(1.1, 1.3, 0.4, 16, mat(0, 0.2, 0), mixHex(METAL, pal.dark, 0.4));
    k.body.torus(1.15, 0.05, 4, 24, mat(0, 0.4, 0, Math.PI / 2, 0, 0), mixHex(METAL, 0xffffff, 0.3));
    k.glow.add(new THREE.SphereGeometry(1.2, 20, 10, 0, TAU, 0, Math.PI / 2), mat(0, 0.42, 0), mixHex(0xcfe8f0, pal.light, 0.3), 0.12);
    k.body.cyl(1.05, 1.05, 0.05, 16, mat(0, 0.44, 0), 0x2f3a30);
    for (let i = 0; i < 7; i++) { const a = i * 2.3, r = 0.25 + (i % 3) * 0.25; k.body.cone(0.12, 0.45 + (i % 2) * 0.2, 5, mat(Math.cos(a) * r, 0.68, Math.sin(a) * r), 0x2f4a3a); }
    const cloud = new Part(k.group, 0, 1.25, 0);
    for (let i = 0; i < 4; i++) cloud.body.add(rock(0.18, i + 60, 0.2, 1), mat((i - 1.5) * 0.15, 0, (i % 2) * 0.1), 0xdfe5ec);
    k.parts.push(cloud);
    const rain = motes(k.group, 40, mixHex(0xbcd6e4, pal.light, 0.3), 0.04, fx, 0.8);
    return { light: [0, 1.0, 0], height: 1.7, span: 1.3, update(t) {
      cloud.group.position.x = Math.sin(t * 0.2) * 0.3;
      for (let i = 0; i < 40; i++) { const ph = (t * 1.2 + i * 0.37) % 1, a = i * 2.4, r = (i % 5) * 0.05; rain.pos.set([cloud.group.position.x + Math.cos(a) * r, 1.15 - ph * 0.65, Math.sin(a) * r], i * 3); rain.alpha[i] = 1 - ph; }
      rain.commit();
    } };
  },
  stair(k, pal, P, R, fx) {
    // a stair of stones hanging in the air, each nearer the sky, to a lit plate and nothing
    const n = P.n + 6, H = n * 0.3;
    const steps = new Part(k.group);
    for (let i = 0; i < n; i++) { const a = i * 0.5; steps.body.add(rock(0.38, i + 5, 0.12), mat(Math.cos(a) * 0.9, 0.2 + i * 0.3, Math.sin(a) * 0.9, 0, -a, 0, 1.3, 0.28, 0.9), STONE[(i % 3) + 1], 0, { flat: true }); steps.lit.box(0.05, 0.02, 0.05, mat(Math.cos(a) * 0.9, 0.12 + i * 0.3, Math.sin(a) * 0.9), pal.light, PULSE); }
    const a = n * 0.5, x = Math.cos(a) * 0.9, z = Math.sin(a) * 0.9;
    steps.body.cyl(0.7, 0.7, 0.08, 16, mat(x, H + 0.3, z), mixHex(METAL, pal.shellHi, 0.3));
    steps.glow.add(new THREE.CircleGeometry(0.6, 20), mat(x, H + 0.35, z, -Math.PI / 2, 0, 0), mixHex(0xfff1c9, pal.light, 0.4), 0.8);
    k.parts.push(steps);
    moss(k.body, 0.9, R);
    return { light: [x, H + 0.4, z], height: H + 1.2, span: 1.4, update(t) { steps.group.position.y = Math.sin(t * 0.4) * 0.05; } };
  },
  mirrorpool(k, pal, P, R, fx) {
    // a pool of something like liquid metal, perfectly round, a moon in it that is not ours
    k.body.cyl(2, 2.05, 0.06, 28, mat(0, 0.0, 0), mixHex(METAL, 0xffffff, 0.35));
    k.body.torus(2.05, 0.15, 4, 28, mat(0, 0.03, 0, Math.PI / 2, 0, 0), STONE[3]);
    const cres = new THREE.Shape();
    cres.absarc(0, 0, 0.7, 0, TAU, false);
    const hole = new THREE.Path();
    hole.absarc(0.3, 0.12, 0.62, 0, TAU, true);
    cres.holes.push(hole);
    k.glow.add(new THREE.ShapeGeometry(cres, 24), mat(-0.3, 0.06, 0.2, -Math.PI / 2, 0, 0), mixHex(0xf3ecd6, pal.light, 0.25), 0.9);
    const moon = new Part(k.group, 0, 2.6, 0);
    moon.lit.sphere(0.32, 12, 8, null, mixHex(0xf3ecd6, pal.light, 0.2), PULSE);
    k.parts.push(moon);
    for (let i = 0; i < 6; i++) { const a = i * 1.1 + R(); fern(k.body, Math.cos(a) * 2.6, Math.sin(a) * 2.6, 1, R); }
    return { light: [0, 2.6, 0], height: 3, span: 2.3, update(t) { moon.group.position.y = 2.6 + Math.sin(t * 0.4) * 0.1; } };
  },
  droppod(k, pal, P, R) {
    // a landing pod come down long ago, half sunk, its hatch open, a tree growing out of it
    const b = k.body, hull = mixHex(METAL, pal.dark, 0.25);
    b.add(new THREE.SphereGeometry(1.2, 14, 10), mat(0, 0.5, 0, 0.5, 0, 0.3, 1, 1.3, 1), hull);
    b.cone(1.0, 0.8, 12, mat(0, -0.45, 0.15, Math.PI + 0.5, 0, 0.3), mixHex(hull, 0x4a3a2a, 0.4));
    b.box(0.9, 0.08, 1.1, mat(-1.2, 0.2, 0.3, 0, 0, 0.9), hull);
    k.lit.box(0.7, 1.0, 0.04, mat(-0.75, 0.75, 0.2, 0, Math.PI / 2, 0.45), mixHex(0xffd27a, pal.light, 0.4), 1.4);
    for (let i = 0; i < 5; i++) b.box(0.05, 0.02, 0.2, mat(0.4, 1.2 - i * 0.15, 0.85, 0.5, 0, 0.3), pal.second, i === 0 ? PULSE : 0);
    curve(b, [[0, 1.4, 0], [0.2, 2.2, -0.1], [0.1, 3.2, 0]], 0.1, BARK);
    for (let i = 0; i < 4; i++) { const a = i * 1.7; b.add(rock(0.5, i + 70, 0.3, 0), mat(Math.cos(a) * 0.4, 3 + i * 0.3, Math.sin(a) * 0.4), i % 2 ? MOSS : 0x35503c, 0, { flat: true }); }
    moss(b, 1.6, R, 9);
    return { light: [-0.7, 0.8, 0.2], height: 3.8, span: 1.6 };
  },
  solarbloom(k, pal, P, R) {
    // a flower of metal petals, each a panel, opened toward the light; its middle a lens
    curve(k.body, [[0, 0, 0], [0.1, 0.9, 0], [-0.05, 1.7, 0.05], [0, 2.1, 0.1]], 0.06, mixHex(METAL, pal.dark, 0.4));
    const head = new Part(k.group, 0, 2.2, 0.15);
    head.group.rotation.x = -0.45;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU; head.body.box(0.3, 0.72, 0.02, mat(Math.cos(a) * 0.5, Math.sin(a) * 0.5, -0.05, 0.25, 0, a - Math.PI / 2), i % 2 ? mixHex(0x1c2a44, pal.light, 0.2) : mixHex(0x24345a, pal.second, 0.2)); }
    head.lit.cyl(0.24, 0.24, 0.05, 16, mat(0, 0, 0.02, Math.PI / 2, 0, 0), mixHex(0xfff1c9, pal.light, 0.3), PULSE);
    k.parts.push(head);
    for (const s of [-1, 1]) k.body.box(0.4, 0.02, 0.2, mat(s * 0.25, 0.9, 0, 0, 0, s * 0.5), mixHex(0x24345a, pal.light, 0.15));
    return { light: [0, 2.2, 0.2], height: 3, span: 0.9, update(t) { head.group.rotation.z = Math.sin(t * 0.1) * 0.3; } };
  },
  crystals(k, pal, P, R) {
    // crystals grown up out of a mound of moss in branches, their tips lit
    k.body.add(rock(1.1, 3, 0.25, 1), mat(0, 0.1, 0, 0, 0, 0, 1.3, 0.55, 1.1), MOSS, 0, { flat: true });
    const prong = (p, dir, len, lvl) => {
      const q = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
      curve(k.body, [p, q], 0.06 * (lvl + 1), mixHex(pal.shellHi, 0xdfe8ec, 0.4));
      if (lvl === 0) { k.lit.ico(0.09, 0, mat(...q), pal.light, PULSE); return; }
      for (const s of [-1, 1]) { const d = [dir[0] + s * 0.5, dir[1] + 0.25, dir[2] + s * 0.2], l = Math.hypot(...d); prong(q, d.map((v) => v / l), len * 0.65, lvl - 1); }
    };
    for (const s of [-1, 1]) prong([s * 0.3, 0.5, 0], [s * 0.45, 0.9, 0.1], 0.9, 3);
    return { light: [0, 1.8, 0], height: 3, span: 1.6 };
  },
  datastack(k, pal, P, R, fx) {
    // plates of glass stacked crooked, light moving in them; the top one showing panels
    // of light in the air above it, still
    let y = 0, yaw = 0;
    for (let i = 0; i < P.n + 3; i++) {
      const h = 0.06 + R() * 0.05, w = 0.8 + R() * 0.25, d = 0.55 + R() * 0.15;
      yaw += (R() - 0.5) * 0.45;
      k.body.box(w, h, d, mat((R() - 0.5) * 0.06, y + h / 2, (R() - 0.5) * 0.06, 0, yaw, 0), mixHex(0x1a2028, pal.dark, 0.3));
      k.lit.box(w - 0.06, 0.012, 0.02, mat(0, y + h / 2, d / 2 - 0.01, 0, yaw, 0), i % 2 ? pal.light : pal.second, PULSE);
      y += h + 0.02;
    }
    for (let i = 0; i < 9; i++) { const a = i * 0.9, r = 0.35 + i * 0.05; k.glow.add(new THREE.PlaneGeometry(0.32, 0.22), mat(Math.cos(a) * r, y + 0.4 + i * 0.2, Math.sin(a) * r, 0, a, 0), mixHex(pal.light, 0xffffff, 0.3), 0.45); }
    moss(k.body, 0.9, R);
    return { light: [0, y + 0.8, 0], height: y + 2.3, span: 1.2 };
  },
  cubes(k, pal, P, R) {
    // small cubes of light hanging in a slow helix about a dead trunk
    curve(k.body, [[0, -0.2, 0], [0.05, 1.5, 0], [-0.05, 3.2, 0.05]], 0.22, 0x6c6a66);
    const helix = new Part(k.group);
    for (let i = 0; i < P.n * 3; i++) { const u = i / (P.n * 3), a = u * TAU * 3; helix.lit.box(0.14, 0.14, 0.14, mat(Math.cos(a) * 0.9, 0.4 + u * 2.8, Math.sin(a) * 0.9, a, a * 0.5, 0), i % 3 ? pal.light : pal.second, i % 4 ? 1.3 : PULSE); }
    k.parts.push(helix);
    moss(k.body, 1, R);
    return { light: [0, 1.8, 0], height: 3.4, span: 1.1, update(t) { helix.group.rotation.y = t * 0.15; } };
  },
  portal(k, pal, P, R, fx) {
    // a ring of metal standing on its own, the fog inside it another color than outside
    const hull = mixHex(METAL, pal.dark, 0.3);
    k.body.add(new THREE.TorusGeometry(1.6, 0.22, 8, 40), mat(0, 1.85, 0), hull);
    k.body.box(0.6, 0.35, 0.7, mat(0, 0.12, 0), hull);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; k.lit.box(0.14, 0.14, 0.5, mat(Math.cos(a) * 1.6, 1.85 + Math.sin(a) * 1.6, 0), pal.light, i % 3 ? 1.3 : PULSE); }
    const field = new Part(k.group, 0, 1.85, 0);
    field.glow.add(new THREE.CircleGeometry(1.4, 40), null, mixHex(pal.second, pal.third, 0.4), 0.5);
    field.glow.add(new THREE.CircleGeometry(1.4, 40), mat(0, 0, 0, 0, Math.PI, 0), mixHex(pal.third, pal.light, 0.4), 0.5);
    for (let r = 1; r < 5; r++) field.glow.add(new THREE.RingGeometry(r * 0.28, r * 0.28 + 0.03, 40), mat(0, 0, 0.01), 0xffffff, 0.25);
    k.parts.push(field);
    for (let i = 1; i <= 4; i++) k.body.add(rock(0.32, i + 50, 0.15), mat(Math.sin(i) * 0.3, -0.02, 1 + i * 0.9, 0, i, 0, 1.3, 0.25, 1), STONE[3], 0, { flat: true });
    return { light: [0, 1.85, 0], height: 3.9, span: 2, update(t) { field.group.rotation.z = t * 0.2; } };
  },
  geode(k, pal, P, R) {
    // an egg of stone split open, crystals inside it lit like a room
    const shellC = mixHex(STONE[2], 0x6a5a4a, 0.3);
    for (const s of [-1, 1]) {
      const half = new THREE.SphereGeometry(1, 14, 10, 0, Math.PI, 0, Math.PI);
      roughen(half, 0.08, s > 0 ? 3 : 4);
      k.body.add(half, mat(s * 0.35, 1.15, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2, s * 0.25, 0.8, 1.2, 0.8), shellC, 0, { flat: true });
      for (let i = 0; i < 14; i++) {
        const a = R() * Math.PI - Math.PI / 2, e = (R() - 0.5) * 2.4, r = 0.62;
        const p = new THREE.Vector3(s * 0.35 + s * Math.cos(e) * 0.15, 1.15 + Math.sin(e) * r * 1.1, Math.sin(a) * r * 0.75);
        const dir = new THREE.Vector3(s * 0.8, -Math.sin(e) * 0.4, -Math.sin(a) * 0.4).normalize();
        k.lit.cone(0.06, 0.32 + R() * 0.25, 5, new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1)), i % 3 ? pal.light : pal.second, PULSE);
      }
    }
    moss(k.body, 1.2, R);
    return { light: [0, 1.2, 0], height: 2.6, span: 1.4 };
  },
  orrery(k, pal, P, R, fx) {
    // the planet's system in light over a stump, small worlds keeping their own year
    stump(k.body, 0.55, 0.7, R);
    k.body.cyl(0.18, 0.24, 0.12, 10, mat(0, 0.74, 0), mixHex(METAL, pal.dark, 0.3));
    const sys = new Part(k.group, 0, 1.5, 0);
    sys.lit.ico(0.18, 1, null, mixHex(0xfff1c9, pal.light, 0.3), PULSE);
    const worlds = [];
    for (let i = 0; i < Math.min(6, P.n); i++) {
      const r = 0.35 + i * 0.16, w = new Part(sys.group);
      sys.glow.add(new THREE.TorusGeometry(r, 0.006, 3, 48), mat(0, 0, 0, Math.PI / 2, 0, 0), pal.light, 0.5);
      w.lit.sphere(0.04 + (i % 3) * 0.02, 6, 4, mat(0, 0, r), [pal.second, pal.third, pal.shellHi][i % 3], 1.3);
      worlds.push({ w, sp: 0.6 / Math.pow(r, 1.5) });
    }
    k.parts.push(sys, ...worlds.map((x) => x.w));
    return { light: [0, 1.5, 0], height: 2.2, span: 1.1, update(t) { for (const x of worlds) x.w.group.rotation.y = t * x.sp; } };
  },
  spikes(k, pal, P, R, fx) {
    // spikes of metal driven into the ground in a ring, ringing; light runs up them
    const n = Math.min(9, P.n), hull = mixHex(METAL, pal.dark, 0.2);
    const runs = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = 1.3, h = 1.6 + (i % 3) * 0.6;
      k.body.cone(0.12, h, 5, mat(Math.cos(a) * r, h / 2 - 0.1, Math.sin(a) * r), hull);
      const run = new Part(k.group, Math.cos(a) * r, 0, Math.sin(a) * r);
      run.glow.add(new THREE.TorusGeometry(0.1, 0.02, 3, 10), mat(0, 0, 0, Math.PI / 2, 0, 0), pal.light, 0.9);
      runs.push({ run, h });
    }
    k.parts.push(...runs.map((x) => x.run));
    k.lit.ico(0.15, 1, mat(0, 0.3, 0), pal.second, PULSE);
    moss(k.body, 1.6, R);
    return { light: [0, 1, 0], height: 2.8, span: 1.6, update(t) { runs.forEach((x, i) => { const ph = (t * 0.5 + i / runs.length) % 1; x.run.group.position.y = ph * x.h * 0.85; x.run.group.scale.setScalar(1 - ph * 0.7); }); } };
  },
};

export function buildCurio(d, A, mats) {
  const st = d.depth ? stratum(d.depth) : SURFACE, P = d.params;
  const pal = {
    light: st.light, second: st.second, third: st.third, dark: st.dark,
    shellLo: mixHex(st.irid[0], st.dark, 0.25), shellHi: mixHex(st.irid[2], st.irid[1], 0.4),
  };
  const fx = [], R = (() => { let s = d.seed[6] >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  const group = new THREE.Group(), inner = new THREE.Group();
  inner.scale.setScalar(d.size);
  group.add(inner);
  const k = new Part(inner);
  k.parts = [];
  const info = KINDS[P.kind](k, pal, P, R, fx);
  k.finish(mats, fx);
  for (const p of k.parts) p.finish(mats, fx);
  // marked: a ring of light on the ground about it, and motes rising
  let rise = null;
  if (d.plus) {
    const ring = new Builder(), R0 = info.span * 1.4 + 0.6;
    ring.add(new THREE.RingGeometry(R0, R0 + 0.12, 48, 1), mat(0, 0.05, 0, -Math.PI / 2, 0, 0), mixHex(0xfff1c9, pal.light, 0.4), 1);
    inner.add(lightMesh(ring.build(), fx, 0.9));
    rise = motes(inner, 24, mixHex(0xfff1c9, pal.light, 0.3), 0.12, fx, 0.9);
  }
  const S = d.size, L = new THREE.Vector3(...info.light).multiplyScalar(S);
  let last = null;
  return {
    group, light: L, focus: L.clone(), span: info.span * S, height: info.height * S, clear: 0, solid: null,
    mats: fx.map(([m]) => m), curio: true,
    update(t, beat, c) {
      const dt = last === null ? 0 : clamp(t - last, 0, 0.1);
      last = t;
      if (info.update) info.update(t, dt);
      if (rise) {
        for (let i = 0; i < 24; i++) { const ph = (t * 0.15 + i / 24) % 1, a = i * 2.4; rise.pos.set([Math.cos(a) * info.span * 1.2, ph * info.height * 1.3, Math.sin(a) * info.span * 1.2], i * 3); rise.alpha[i] = Math.sin(ph * Math.PI); }
        rise.commit();
      }
      for (const [m, o] of fx) m.uniforms.uOpacity.value = o * (c.reveal ?? 1) * (0.8 + (c.pulse ?? 1) * 0.25);
    },
  };
}

