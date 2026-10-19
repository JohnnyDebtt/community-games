// The interface's pixel art: frames (as 9-slice images for CSS border-image) and small
// icons, drawn here from little ASCII maps in the Seeker's interface palette, so every
// panel, key cap and icon shares one pixel grid with the world.

export const C = {
  fill: 'rgba(5,7,11,0.93)', solid: '#05070b', well: '#0b0d13', well2: '#12151d', line: '#29303e', line2: '#3f4d5b',
  text: '#f0f2e8', muted: '#8a919e', dim: '#454a4f', teal: '#abe3d9', red: '#e84d3d', gold: '#b9a87b', gold2: '#e3cf8e',
  glow: '#91cbde', ice: '#d6edf5', key: '#1a1f29', keyHi: '#4f5d73', keyLo: '#020305', white: '#ffffff', ink: '#2d2e33',
  violet: '#9a8fd6',
  // the dim halves of the terminal accents, for their frames and rules
  goldDim: '#5e5640', glowDim: '#2c4652',
};

function canvasFrom(rows, pal) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < rows[y].length; x++) {
      const col = pal[rows[y][x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return cv;
}

// ------------------------------------------------------------------ frames
const PANEL = [
  '..KKKKKK..',
  '.KKKKKKKK.',
  'KKKLLLLKKK',
  'KKLKKKKLKK',
  'KKLKKKKLKK',
  'KKLKKKKLKK',
  'KKLKKKKLKK',
  'KKKLLLLKKK',
  '.KKKKKKKK.',
  '..KKKKKK..',
];
const WELL = [
  '.LLLL.',
  'LWWWWL',
  'LWWWWL',
  'LWWWWL',
  'LWWWWL',
  '.LLLL.',
];
const KEY = [
  '.HHHHH.',
  'HFFFFFH',
  'HFFFFFH',
  'HFFFFFH',
  'HFFFFFH',
  'HFFFFFH',
  'DHHHHHD',
  '.DDDDD.',
];
const TAB = [
  '.LLLL.',
  'LWWWWL',
  'LWWWWL',
  'LWWWWL',
  'LWWWWL',
  'LWWWWL',
];

export function installFrames() {
  const set = (name, rows, pal) => {
    const url = canvasFrom(rows, pal).toDataURL();
    document.documentElement.style.setProperty(`--f-${name}`, `url(${url})`);
  };
  set('panel', PANEL, { K: C.fill, L: C.line });
  set('panel-solid', PANEL, { K: C.solid, L: C.line });
  for (const [k, col] of [['teal', C.teal], ['gold', C.gold], ['glow', C.glow], ['red', C.red], ['violet', C.violet], ['gold-dim', C.goldDim], ['glow-dim', C.glowDim]]) {
    set('panel-' + k, PANEL, { K: C.fill, L: col });
  }
  set('well', WELL, { L: C.line, W: C.well });
  set('well-hi', WELL, { L: C.teal, W: C.well2 });
  set('well-gold', WELL, { L: C.gold, W: C.well2 });
  set('well-glow', WELL, { L: C.glow, W: C.well2 });
  set('well-dim', WELL, { L: C.line, W: 'rgba(11,13,19,0.6)' });
  set('key', KEY, { H: C.keyHi, F: C.key, D: C.keyLo });
  set('key-hi', KEY, { H: C.teal, F: '#203a3a', D: C.keyLo });
  set('tab', TAB, { L: C.line, W: C.well });
  set('tab-on', TAB, { L: C.teal, W: C.well2 });
}

// ------------------------------------------------------------------ icons
// '.' transparent; letters index the palette below.
const IP = {
  w: C.text, W: C.white, g: C.gold, G: C.gold2, t: C.teal, c: C.glow, i: C.ice, r: C.red, m: C.muted, d: C.line, D: C.line2,
  k: '#05070b', v: C.violet, b: '#4f7368', s: '#6b6258',
};
const ICONS = {
  data: ['..g..', '.gGg.', 'gGwGg', '.gGg.', '..g..'],
  dataBig: ['...g...', '..gGg..', '.gGwGg.', 'gGwwwGg', '.gGwGg.', '..gGg..', '...g...'],
  fish: ['....ww...', '.wwwwww.w', 'wwkwwwwww', '.wwwwww.w', '....ww...'],
  sun: ['..w..', 'w.w.w', '.www.', 'wwwww', '.www.', 'w.w.w', '..w..'],
  moon: ['.ww..', 'ww...', 'w....', 'w....', 'ww...', '.ww.w', '..ww.'],
  dawn: ['.......', '..w.w..', 'w.www.w', '.wwwww.', 'wwwwwww', '.......', 'mmmmmmm'],
  cloud: ['.......', '..ww...', '.wwww..', 'wwwwww.', 'wwwwwww', '.......'],
  snow: ['..w..', 'w.w.w', '.www.', 'wwwww', '.www.', 'w.w.w', '..w..'],
  flake: ['.w.w.', 'w.w.w', '.www.', 'w.w.w', '.w.w.'],
  spark: ['..cc', '.cc.', 'cccc', '.cc.', 'cc..'],
  sparkBig: ['...ii', '..ii.', '.ii..', 'iiiii', '..ii.', '.ii..', 'ii...'],
  bolt: ['...cc', '..cc.', '.cc..', 'ccccc', '..cc.', '.cc..', 'cc...'],
  star: ['..g..', '.ggg.', 'ggggg', '.g.g.'],
  check: ['....t', '...t.', 't.t..', '.t...'],
  cross: ['r...r', '.r.r.', '..r..', '.r.r.', 'r...r'],
  lock: ['.mmm.', 'm...m', 'mmmmm', 'mm.mm', 'mmmmm'],
  signal: ['w...w', '.w.w.', '..w..', '..w..', '.www.'],
  dot: ['tt', 'tt'],
  dotOff: ['mm', 'mm'],
  capsule: ['.www.', 'wwwww', 'wwwww', '.www.', '..w..', '..w..', '.www.'],
  pin: ['.ccc.', 'cc.cc', '.ccc.', '..c..'],
  ring: ['.www.', 'w...w', 'w...w', 'w...w', '.www.'],
  chain: ['.tt...', 't..t..', '.tt.tt', '...t..t', '....tt.'],
  eye: ['.www.', 'wwkww', '.www.'],
  arrowR: ['w..', 'ww.', 'www', 'ww.', 'w..'],
  arrowD: ['wwwww', '.www.', '..w..'],
  hook: ['..w', '..w', '..w', 'w.w', '.w.'],
  rod: ['....w', '...w.', '..w..', '.w...', 'w....'],
  tank: ['wwwww', 'w...w', 'wc.cw', 'w.c.w', 'wwwww'],
  book: ['wwww.', 'wttw.', 'wwwwm', 'wttwm', 'wwwwm'],
  gear: ['.w.w.', 'wwwww', '.w.w.', 'wwwww', '.w.w.'],
  bed: ['.....', 'w....', 'wwwww', 'w...w'],
  pack: ['.ss.', 'gggg', 'gssg', 'gggg', 'gggg'],
  beacon: ['..i..', '..i..', '.iii.', 'iiiii', '.iii.'],

  // the capsule terminal's entries
  bag: ['..sssss..', '.ggggggg.', 'gGGGGGGGg', 'gGsssssGg', 'gGGGsGGGg', 'gGGGGGGGg', 'gGGGGGGGg', 'gsGGGGGsg', '.ggggggg.'],
  spool: ['mm.....mm', 'mmiiiiimm', 'mmcccccmm', 'mmiiiiimm', 'mmcccccmm', 'mmiiiiimm', 'mm..w..mm', '....w....', '....w....', '.w..w....', '..ww.....'],
  mount: ['..mmmmmmm..', '..mkkkkkm..', '..mkktkkm..', '..mkkkkkm..', '..mmmmmmm..', '...........', '.....c.....', '.....c.....', '..iiiiiii..', '.ikkkkkkki.', '..iiiiiii..'],
  auger: ['mmmmmmmmm', '....m....', '....m....', '...ww....', '....ww...', '...ww....', '....ww...', '...ww....', '....ww...', '....w....'],
  lantern: ['....m....', '...m.m...', '....m....', '..mmmmm..', '.mmmmmmm.', '..gGGGg..', '..gGWGg..', '..gGWGg..', '..gGGGg..', '.mmmmmmm.', '..mmmmm..'],
  lure: ['....m....', '....m....', '...cic...', '..ciWic..', '..ciiic..', '...cic...', '....c....', '....w....', '.w..w....', '..ww.....'],
  dawn: ['.....g.....', '.g.......g.', '....GGG....', '..gGGGGGg..', '...GGGGG...', 'mmmmmmmmmmm', '...........', '..mmm.mmm..'],
  noon: ['.....G.....', '.G.......G.', '....GGG....', '...GWWWG...', '..GWWWWWG..', 'G.GWWWWWG.G', '..GWWWWWG..', '...GWWWG...', '....GGG....', '.G.......G.', '.....G.....'],
  dusk: ['...v...v...', '...........', '....ggg....', '..ggGGGgg..', 'mmmmmmmmmmm', '...vvvvv...', '....vvv....'],
  night: ['...iiii..', '.iiii....', '.iii...c.', 'iii......', 'iii......', 'iii......', '.iii...c.', '.iiii....', '...iiii..'],
  cog: ['....m....', '.m.mmm.m.', '..mmmmm..', '.mmm.mmm.', 'mmm...mmm', '.mmm.mmm.', '..mmmmm..', '.m.mmm.m.', '....m....'],
  disk: ['mmmmmmmm.', 'mmiiiimmm', 'mmiikimmm', 'mmiiiimmm', 'mmmmmmmmm', 'mwwwwwwwm', 'mwDDDDDwm', 'mwwwwwwwm', 'mmmmmmmmm'],
  tune: ['.c.......c.', 'c..c...c..c', 'c.c.....c.c', 'c.c..t..c.c', 'c.c.....c.c', 'c..c...c..c', '.c.......c.'],

  note: ['...ii.', '...iii', '...i.i', '...i..', '...i..', '.iii..', 'iiii..', '.ii...'],
  btail: ['kkkkkkk', 'dkkkkkd', '.dkkkd.', '..dkd..', '...d...'],

  // what each Overdrive does, as a picture
  od_autoreel: ['..cccc.c.', '.c....cc.', 'c....ccc.', 'c........', 'c.......c', 'c.......c', '.c.....c.', '..ccccc..'],
  od_prime: ['c...c.ccc.', '.c.c.....c', '..c....cc.', '.c.c.....c', 'c...c.ccc.'],
  od_point: ['....c....', '..ccccc..', '.c..c..c.', '.c.....c.', 'ccc.W.ccc', '.c.....c.', '.c..c..c.', '..ccccc..', '....c....'],
  od_frenzy: ['.....ccc.c', '....cccccc', '.....ccc.c', '.ccc.c....', 'cccccc....', '.ccc.c....', '.....ccc.c', '....cccccc', '.....ccc.c'],
  od_crescendo: ['......cc', '......cc', '...cc.cc', '...cc.cc', 'cc.cc.cc', 'cc.cc.cc', 'cc.cc.cc'],
  od_lockon: ['..ccc..', '.c...c.', '.c...c.', 'ccccccc', 'ccckccc', 'ccckccc', 'ccccccc'],
  od_deepscan: ['..ccccc..', '.c.....c.', 'c..ccc..c', 'c.ccWcc.c', 'c..ccc..c', '.c.....c.', '..ccccc..'],
};

const _icons = new Map();
export function icon(name, tint = null) {
  const key = name + '|' + (tint || '');
  if (_icons.has(key)) return _icons.get(key);
  const rows = ICONS[name] || ICONS.dot;
  const pal = tint ? Object.fromEntries(Object.keys(IP).map((k) => [k, k === 'k' ? IP.k : tint])) : IP;
  const cv = canvasFrom(rows, pal);
  const out = { url: cv.toDataURL(), w: cv.width, h: cv.height };
  _icons.set(key, out);
  return out;
}

// An <img> of an icon at the interface's pixel size.
export function iconEl(name, tint = null, scale = 1, cls = '') {
  const ic = icon(name, tint);
  const el = document.createElement('img');
  el.src = ic.url;
  el.alt = '';
  el.className = 'pxi ' + cls;
  el.style.width = `calc(var(--u) * ${ic.w * scale})`;
  el.style.height = `calc(var(--u) * ${ic.h * scale})`;
  return el;
}

// ------------------------------------------------------------------ dithered shade
// Darkness as pixel art: ordered dithering at the world's own resolution, never a soft
// gradient. fn(u, v) gives the darkness 0..1 at a point of the screen (0..1 each way).
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function ditherShade(canvas, w, h, fn, color = [5, 7, 11]) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = fn(x / w, y / h);
      const t = (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      if (a > t) {
        const i = (y * w + x) * 4;
        d[i] = color[0]; d[i + 1] = color[1]; d[i + 2] = color[2]; d[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}
