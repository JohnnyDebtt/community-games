// The floating objects of SEEKER NET seekers, modeled from scratch as voxels. The
// collection draws each one in the same oblique view as the seekers (its top receding up
// and to the left, a thin front edge, a dark bevel down the left), so its picture cannot
// be extruded: it is rebuilt here as the thing itself, in its own colors from the layer
// art (collections/SEEKER_NET/layers/objects), which no colorway changes.
//
// Each model is built in its own frame: u across (0 at its left), v up (0 its underside),
// w from back (0, nearest the seeker) to front. Voxels are [u, v, w, hex, emissive].
// Under each one, a faint dashed ring in the art's pale rim color: the field it floats on.

const RIM = 0x8ea6db;

function make(W, D) {
  const vox = new Map();
  const m = {
    W, D,
    put(u, v, w, hex, e = 0) { vox.set(`${u},${v},${w}`, [u, v, w, hex, e]); },
    del(u, v, w) { vox.delete(`${u},${v},${w}`); },
    box(u0, v0, w0, nu, nv, nw, hex, e = 0) {
      for (let u = u0; u < u0 + nu; u++) for (let v = v0; v < v0 + nv; v++) for (let w = w0; w < w0 + nw; w++) m.put(u, v, w, hex, e);
    },
    // a flat ellipse of voxels at height v
    ell(cu, cw, ru, rw, v, hex) {
      for (let u = Math.floor(cu - ru); u <= Math.ceil(cu + ru); u++) {
        for (let w = Math.floor(cw - rw); w <= Math.ceil(cw + rw); w++) {
          if (((u - cu) / ru) ** 2 + ((w - cw) / rw) ** 2 <= 1) m.put(u, v, w, hex);
        }
      }
    },
    get voxels() { return [...vox.values()]; },
  };
  return m;
}

// the field it floats on: a dashed ring under it
function field(m, x0 = 1, x1 = m.W - 2, w0 = 1, w1 = m.D - 2) {
  for (let u = x0; u <= x1; u++) for (let w = w0; w <= w1; w++) {
    const edge = u === x0 || u === x1 || w === w0 || w === w1;
    if (edge && (u + w) % 2 === 0) m.put(u, -1, w, RIM, 0.5);
  }
}

// A keyboard's case, its key plate, its rows of caps (every other voxel, staggered, so
// the plate shows between them) and a space bar.
function keyboard(W, D, c) {
  const m = make(W, D);
  m.box(0, 0, 0, W, 2, D, c.case);
  m.box(0, 0, D - 1, W, 2, 1, c.front);
  m.box(1, 1, 1, W - 2, 1, D - 3, c.plate);
  const rows = Math.floor((D - 3) / 2);
  for (let r = 0; r < rows; r++) {
    const w = 1 + r * 2;
    for (let u = 1 + (r % 2); u <= W - 2; u += 2) m.put(u, 2, w, r === 0 && c.fkey ? c.fkey : c.key);
  }
  const sw = Math.max(4, Math.round(W * 0.45));
  for (let u = Math.round((W - sw) / 2); u < Math.round((W - sw) / 2) + sw; u++) m.put(u, 2, D - 2, c.key);
  if (c.special) m.box(W - 3, 2, 1, 2, 1, 3, c.special);
  field(m);
  return m;
}

const BUILD = {
  Keyboard: () => keyboard(22, 9, { case: 0xb9a87b, front: 0xe3e3b7, plate: 0x485f67, key: 0xe3e3b7 }),

  'Compact Keyboard': () => keyboard(16, 8, { case: 0x6c78a2, front: 0x8db6d1, plate: 0x48557e, key: 0x30446c, special: 0xd5f8fc }),

  // an older one: a wedge, taller at the back, function keys in a darker row
  'Classic Keyboard': () => {
    const m = make(22, 9);
    m.box(0, 0, 0, 22, 3, 4, 0xc59154);
    m.box(0, 0, 4, 22, 2, 5, 0xc59154);
    m.box(0, 0, 8, 22, 2, 1, 0x905937);
    m.box(1, 2, 1, 20, 1, 3, 0x000000);
    m.box(1, 1, 4, 20, 1, 3, 0x000000);
    for (let u = 1; u <= 20; u += 2) m.put(u, 3, 1, 0x4b2f58);
    for (let u = 2; u <= 20; u += 2) m.put(u, 3, 3, 0x905937);
    for (let u = 1; u <= 20; u += 2) m.put(u, 2, 5, 0x905937);
    for (let u = 6; u <= 15; u++) m.put(u, 2, 7, 0x905937);
    field(m);
    return m;
  },

  // two halves, splayed apart
  'Split Keyboard': () => {
    const m = make(27, 8);
    const half = keyboard(12, 8, { case: 0xdbede3, front: 0xaac9b8, plate: 0x214e3f, key: 0xdbede3, fkey: 0x5daa99 });
    for (const [u, v, w, hex, e] of half.voxels) {
      const shear = Math.round((w - 3.5) * 0.35);
      m.put(u - shear, v, w, hex, e);
      m.put(26 - u + shear, v, w, hex, e);
    }
    return m;
  },

  Numpad: () => {
    const m = make(13, 10);
    m.box(0, 0, 0, 13, 2, 10, 0x323f4b);
    m.box(0, 0, 9, 13, 2, 1, 0x596d9b);
    m.box(1, 1, 1, 11, 1, 7, 0x0f2a3b);
    for (const u of [1, 4, 7]) for (const w of [1, 3, 5, 7]) m.box(u, 2, w, 2, 1, 1, 0x6b82b4);
    m.box(10, 2, 1, 2, 1, 3, 0x6b82b4);
    m.box(10, 2, 5, 2, 1, 3, 0x6b82b4);
    m.put(11, 2, 8, 0xa2324e, 0.9);
    field(m);
    return m;
  },

  // a mouse: a rounded shell rising to the palm, its two buttons toward the seeker
  // parted by a line, a wheel between them, and its cable running back to the seeker
  Mouse: () => {
    const m = make(7, 10);
    const round = (u, w, i) => (u < i || u > 6 - i) && (w < i || w > 9 - i);
    for (let u = 0; u < 7; u++) for (let w = 0; w < 10; w++) {
      if ((u === 0 || u === 6) && (w === 0 || w === 9)) continue;
      m.put(u, 0, w, 0xb4d3cb);
      m.put(u, 1, w, 0xdbede3);
    }
    for (let u = 1; u < 6; u++) for (let w = 1; w < 9; w++) if (!round(u - 1, w - 1, 1)) m.put(u, 2, w, 0xdbede3);
    for (let u = 2; u < 5; u++) for (let w = 4; w < 8; w++) m.put(u, 3, w, 0xd5f8fc);
    for (let w = 0; w <= 3; w++) for (let v = 1; v <= 2; v++) m.put(3, v, w, 0x688180);
    m.put(3, 3, 2, 0x243039);
    m.put(3, 1, -1, 0x243039);
    m.put(3, 1, -2, 0x243039);
    field(m, 1, 5, 1, 8);
    return m;
  },

  // a ball in a socket on a low base, a button either side
  Trackball: () => {
    const m = make(12, 10);
    m.box(0, 0, 0, 12, 2, 10, 0xe3e3b7);
    m.box(0, 0, 9, 12, 2, 1, 0xd3d39c);
    const cu = 5.5, cv = 3.2, cw = 4;
    for (let u = 2; u <= 9; u++) for (let w = 0; w <= 8; w++) {
      const r = Math.hypot(u - cu, w - cw);
      if (r > 2.6 && r < 3.8) m.put(u, 2, w, 0x997c5a);
    }
    for (let u = 2; u <= 9; u++) for (let v = 1; v <= 7; v++) for (let w = 0; w <= 8; w++) {
      const d = Math.hypot(u - cu, v - cv, w - cw);
      if (d > 3.05) continue;
      const lit = (cu - u) * 0.5 + (v - cv) + (cw - w) * 0.4;
      m.put(u, v, w, lit > 2.2 ? 0xffffff : lit > 1.2 ? 0x82b7b4 : Math.abs(v - cv - 0.5) < 0.7 ? 0x3a7581 : 0x000000);
    }
    m.box(1, 2, 7, 3, 1, 2, 0x997c5a);
    m.box(8, 2, 7, 3, 1, 2, 0x997c5a);
    field(m);
    return m;
  },

  // a base, a stick, a red knob, a fire button
  Joystick: () => {
    const m = make(11, 9);
    m.box(0, 0, 0, 11, 2, 9, 0x87789b);
    m.box(0, 0, 8, 11, 2, 1, 0x42254f);
    m.box(1, 1, 1, 9, 1, 7, 0x5f4754);
    m.box(4, 2, 3, 3, 1, 3, 0x42254f);
    for (let v = 3; v <= 7; v++) m.put(5, v, 4, 0x2e1f36);
    m.box(4, 8, 3, 3, 1, 3, 0x661e25);
    m.box(4, 9, 3, 3, 1, 3, 0xa2324e);
    m.put(5, 10, 4, 0xa2324e);
    m.box(1, 2, 6, 2, 1, 2, 0xa2324e, 0.3);
    field(m);
    return m;
  },

  // a controller: a body and two grips toward you, a cross on the left, buttons on the
  // right, two thumbsticks
  Gamepad: () => {
    const m = make(18, 10);
    for (let u = 0; u < 18; u++) for (let w = 0; w < 6; w++) {
      if ((u === 0 || u === 17) && (w === 0 || w === 5)) continue;
      m.box(u, 0, w, 1, 2, 1, 0x788982);
    }
    for (const u0 of [0, 13]) for (let u = u0; u < u0 + 5; u++) for (let w = 6; w < 10; w++) {
      if ((u === u0 || u === u0 + 4) && w === 9) continue;
      m.put(u, 0, w, 0x788982);
      m.put(u, 1, w, 0xa3b7b1);
    }
    for (const [u, w] of [[3, 2], [2, 3], [3, 3], [4, 3], [3, 4]]) m.put(u, 2, w, 0x364c52);
    for (const [u, w, c] of [[14, 2, 0xa2324e], [13, 3, 0x364c52], [15, 3, 0xa2324e], [14, 4, 0x364c52]]) m.put(u, 2, w, c);
    m.put(8, 2, 2, 0x243039);
    m.put(9, 2, 2, 0x243039);
    for (const u of [6, 11]) { m.put(u, 2, 4, 0x243039); m.put(u, 3, 4, 0x364c52); }
    field(m, 1, 16, 1, 4);
    return m;
  },

  // a mixer: four fader slots, their caps at different heights, a red light
  'Fader Deck': () => {
    const m = make(22, 9);
    m.box(0, 0, 0, 22, 2, 9, 0x5f4754);
    m.box(0, 0, 8, 22, 2, 1, 0x87789b);
    const at = [2, 5, 3, 6];
    [3, 7, 11, 15].forEach((u, i) => {
      for (let w = 1; w <= 6; w++) m.put(u, 1, w, 0x000000);
      m.box(u - 1, 2, at[i], 3, 1, 1, i % 2 ? 0xb9a87b : 0xffffff);
    });
    m.box(18, 2, 2, 2, 1, 2, 0x2e1f36);
    m.put(19, 2, 6, 0xa2324e, 0.9);
    field(m);
    return m;
  },

  // a row of dials, each with its pointer, small buttons, a teal light
  'Dial Deck': () => {
    const m = make(22, 9);
    m.box(0, 0, 0, 22, 2, 9, 0xc59154);
    m.box(0, 0, 8, 22, 2, 1, 0xe3e3b7);
    for (const u of [3, 8, 13, 18]) {
      for (const [du, dw] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) m.put(u + du, 2, 4 + dw, 0x688180);
      m.put(u, 3, 4, 0xd5f8fc);
      m.put(u, 3, 3, 0x243039);
    }
    for (const u of [2, 4, 6]) m.put(u, 2, 7, 0x30446c);
    m.put(19, 2, 7, 0x82b7b4, 0.8);
    field(m);
    return m;
  },

  // a tape deck: a cassette in a window on top, two spools and tape, a row of keys
  Datasette: () => {
    const m = make(22, 10);
    m.box(0, 0, 0, 22, 3, 10, 0x485f67);
    m.box(0, 0, 9, 22, 3, 1, 0x688180);
    m.box(4, 2, 1, 14, 1, 5, 0x000000);
    for (const u of [7, 13]) m.box(u, 2, 2, 2, 1, 2, 0xb4d3cb);
    m.box(9, 2, 3, 4, 1, 1, 0x3a7581);
    for (let i = 0; i < 6; i++) m.box(3 + i * 3, 3, 7, 2, 1, 2, 0xb4d3cb);
    m.put(20, 3, 8, 0xa2324e, 0.9);
    field(m);
    return m;
  },

  // a disk drive: a deep pale box, the slot across its front, a light, a button
  'Floppy Drive': () => {
    const m = make(19, 12);
    m.box(0, 0, 0, 19, 4, 12, 0xdbede3);
    m.box(0, 0, 11, 19, 4, 1, 0xb4d3cb);
    for (let u = 3; u <= 14; u++) m.put(u, 2, 11, 0x000000);
    m.put(16, 1, 11, 0x688180);
    m.put(2, 1, 11, 0x82b7b4, 0.9);
    for (let u = 4; u <= 14; u += 2) m.put(u, 3, 3, 0xb4d3cb);
    field(m);
    return m;
  },

  // a thin slate: a dark screen with lines of glowing glyphs, and one bright mark
  'Codex Slate': () => {
    const m = make(21, 11);
    m.box(0, 0, 0, 21, 2, 11, 0x323f4b);
    m.box(0, 0, 10, 21, 2, 1, 0x596d9b);
    m.box(1, 1, 1, 19, 1, 8, 0x000000);
    const glyph = [1, 1, 0, 1, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1];
    [2, 4, 6].forEach((w, r) => {
      for (let u = 2; u <= 17 - r * 3; u++) if (glyph[(u + r * 5) % glyph.length]) m.put(u, 1, w, 0x82b7b4, 0.9);
    });
    m.put(16, 1, 2, 0xffffff, 1.2);
    m.put(10, 1, 9, 0x0f2a3b);
    field(m);
    return m;
  },
};

export function floatingObject(kind) {
  const b = BUILD[kind];
  return b ? b() : null;
}
