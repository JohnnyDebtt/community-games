import * as THREE from 'three';
import { TAU, clamp, smoothstep } from '../core/math.js';

// A day on the frozen sea lasts 16 minutes. Colors come from the Seeker's surface sky
// and atmospheric-distance ramps: cold and pale by day, deep blue at night, a muted
// mauve at the turns of the day.

export const DAY_SECONDS = 960;

const K = (t, o) => ({ t, ...o });
// zenith, mid, horizon, fog, sun light, sky ambient, ground bounce, rim
const KEYS = [
  K(0.0, { zen: 0x0c1019, mid: 0x1a2232, hor: 0x2e3a4f, fog: 0x283347, sun: 0x34425c, sky: 0x2b3754, gnd: 0x18202e, rim: 0x1a2232, exp: 1.0 }),
  K(0.18, { zen: 0x111724, mid: 0x232d3f, hor: 0x3d4c62, fog: 0x354358, sun: 0x34425c, sky: 0x2e3a54, gnd: 0x1a2130, rim: 0x1c2638, exp: 1.0 }),
  K(0.235, { zen: 0x232d3f, mid: 0x46566d, hor: 0x9a8f9e, fog: 0x7a7f90, sun: 0x8a7478, sky: 0x46506a, gnd: 0x2e3444, rim: 0x3e3a4c, exp: 1.0 }),
  K(0.29, { zen: 0x354358, mid: 0x7a8d9f, hor: 0xcfdde4, fog: 0xb6c4ce, sun: 0x8e8a86, sky: 0x6a7888, gnd: 0x485262, rim: 0x384250, exp: 1.0 }),
  K(0.5, { zen: 0x46566d, mid: 0x8d9fae, hor: 0xe0eaef, fog: 0xc8d6de, sun: 0x8c8e8a, sky: 0x7c8a98, gnd: 0x566272, rim: 0x3c4654, exp: 1.0 }),
  K(0.7, { zen: 0x3d4c62, mid: 0x7a8d9f, hor: 0xd4e2e9, fog: 0xbac9d2, sun: 0x8e8884, sky: 0x707e8e, gnd: 0x4c5666, rim: 0x3a4452, exp: 1.0 }),
  K(0.775, { zen: 0x2e3a4f, mid: 0x5c6e83, hor: 0xa995a6, fog: 0x8a8698, sun: 0x8a6c74, sky: 0x4e566e, gnd: 0x343848, rim: 0x443a4e, exp: 1.0 }),
  K(0.83, { zen: 0x1a2232, mid: 0x354358, hor: 0x5c6e83, fog: 0x46566d, sun: 0x3e4a64, sky: 0x323d56, gnd: 0x1e2534, rim: 0x222c3e, exp: 1.0 }),
  K(1.0, { zen: 0x0c1019, mid: 0x1a2232, hor: 0x2e3a4f, fog: 0x283347, sun: 0x34425c, sky: 0x2b3754, gnd: 0x18202e, rim: 0x1a2232, exp: 1.0 }),
];

const ca = new THREE.Color(), cb = new THREE.Color();
const NIGHT_DIR = new THREE.Vector3(-0.35, 0.8, -0.5).normalize();
function lerpHex(out, a, b, t) {
  ca.setHex(a);
  cb.setHex(b);
  return out.copy(ca).lerp(cb, t);
}

export class DayCycle {
  constructor() {
    this.t = 0.32;              // fraction of the day; 0 = midnight
    this.day = 1;
    this.speed = 1;
    this.c = {
      zen: new THREE.Color(), mid: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(),
      sun: new THREE.Color(), sky: new THREE.Color(), gnd: new THREE.Color(), rim: new THREE.Color(),
    };
    this.sunDir = new THREE.Vector3();
    this.lightDir = new THREE.Vector3();
    this.night = 0;
    this.sample();
  }

  update(dt) {
    this.t += (dt * this.speed) / DAY_SECONDS;
    while (this.t >= 1) {
      this.t -= 1;
      this.day++;
    }
    this.sample();
  }

  sample() {
    const t = this.t;
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const f = clamp((t - a.t) / (b.t - a.t), 0, 1);
    const s = f * f * (3 - 2 * f);
    for (const k of Object.keys(this.c)) lerpHex(this.c[k], a[k], b[k], s);
    // sun path: rises in the east (+x), noon to the south, sets in the west
    const ang = (t - 0.25) * TAU;
    const elev = Math.sin(ang) * 0.62 + 0.04;
    this.sunDir.set(Math.cos(ang), elev, -0.45 - 0.25 * Math.sin(ang)).normalize();
    this.night = 1 - smoothstep(-0.08, 0.1, elev);
    // at night the light comes from the high, pale sky
    this.lightDir.copy(this.sunDir);
    if (this.lightDir.y < 0.12) this.lightDir.y = 0.12;
    this.lightDir.normalize().lerp(NIGHT_DIR, this.night).normalize();
  }

  // "07:40"
  clock() {
    const mins = Math.floor(this.t * 24 * 60);
    const h = Math.floor(mins / 60), m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  phase() {
    const t = this.t;
    if (t < 0.2 || t >= 0.85) return 'night';
    if (t < 0.3) return 'dawn';
    if (t < 0.72) return 'day';
    return 'dusk';
  }
}
