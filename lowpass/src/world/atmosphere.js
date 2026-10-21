import * as THREE from 'three';
import { U } from '../render/materials.js';
import { FOG, POST } from '../render/pipeline.js';
import { clamp, smoothstep, lerp, noise2, TAU } from '../core/math.js';

// Day, night and the fog. A day is 24 minutes (twice the fundamental 12): eighteen of
// sun, six of night.
// The fog layer breathes: its top rises and sinks over minutes, it thickens and thins,
// and it drifts with a slow wind. The network's charge lights the aurora at night.

export const DAY_SECONDS = 24 * 60;

const C = (h) => new THREE.Color(h);
// keyed by the sun's height: night, twilight, low day, high day
const KEYS = [
  { e: -0.35, top: C(0x0b0e15), hor: C(0x151b27), glow: C(0x0f1219), fog: C(0x151b25), low: C(0x080a0f), sun: C(0x121722), sky: C(0x1c2333), ground: C(0x0a0b0f), cloud: C(0x10141c), exp: 1.2 },
  { e: -0.07, top: C(0x1f2738), hor: C(0x5a5466), glow: C(0x7a4a48), fog: C(0x3c4052), low: C(0x1a1e27), sun: C(0x6a4a44), sky: C(0x3a4356), ground: C(0x15171d), cloud: C(0x2e3242), exp: 1.15 },
  { e: 0.06, top: C(0x2e3a4f), hor: C(0x9c8f96), glow: C(0xb8714e), fog: C(0x585c6c), low: C(0x262934), sun: C(0xb0805e), sky: C(0x5e6676), ground: C(0x23272e), cloud: C(0x5a5a68), exp: 1.05 },
  { e: 0.18, top: C(0x3d4c62), hor: C(0xa8adb5), glow: C(0x9a8070), fog: C(0x6c7684), low: C(0x333a46), sun: C(0x8f8070), sky: C(0x6c7786), ground: C(0x272b33), cloud: C(0x6c7482), exp: 1.02 },
  { e: 0.42, top: C(0x46566d), hor: C(0xa1b2bb), glow: C(0x6c7372), fog: C(0x8a9ba6), low: C(0x48515e), sun: C(0x76797a), sky: C(0x7f8f9c), ground: C(0x2c3139), cloud: C(0x8d9fae), exp: 1.0 },
];

// the sun's height over the day: up for three quarters of it (sunrise at 0.125, sunset
// at 0.875), long golden hours at either end, a short night
const DAY = [
  [0.0, -0.4], [0.07, -0.16], [0.105, -0.05], [0.125, 0.0], [0.16, 0.06], [0.21, 0.14], [0.3, 0.34], [0.5, 0.62],
  [0.7, 0.34], [0.79, 0.14], [0.84, 0.06], [0.875, 0.0], [0.895, -0.05], [0.93, -0.16], [1.0, -0.4],
];

function sample(e, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = smoothstep(a.e, b.e, e);
  for (const k of ['top', 'hor', 'glow', 'fog', 'low', 'sun', 'sky', 'ground', 'cloud']) out[k].copy(a[k]).lerp(b[k], t);
  out.exp = lerp(a.exp, b.exp, t);
  return out;
}

const _warm = new THREE.Color();

export class Atmosphere {
  constructor() {
    this.time = 0.112;          // fraction of a day: the sun rises at 0.125
    this.speed = 1;
    this.cur = { top: C(0), hor: C(0), glow: C(0), fog: C(0), low: C(0), sun: C(0), sky: C(0), ground: C(0), cloud: C(0), exp: 1 };
    this.network = 0.4;         // 0..1, the network's strength for the aurora
    this.pulse = 0;
    this.forceBreaks = null;    // dev: hold the clouds open (0..1)
    this.clock = null;          // the chain's clock: the hour everyone shares
    this.offset = 0;            // dev: shift the hour
    this.weather = 0;           // seconds of weather time
    this.fogBias = 0;           // settings: -1 thin .. +1 thick
    this.sunElev = 0;
    this.night = 0;
    this.autumn = 0;            // how turned the stand about the eye is (the game sets it)
  }

  // the sun's height: a biased sine, so days are longer than nights
  elevation(t = this.time) {
    let i = 0;
    while (i < DAY.length - 2 && t > DAY[i + 1][0]) i++;
    const [t0, e0] = DAY[i], [t1, e1] = DAY[i + 1];
    const k = (t - t0) / (t1 - t0);
    return e0 + (e1 - e0) * (k * k * (3 - 2 * k));
  }

  // the sun's direction (azimuth turns through the day)
  sunAzimuth(t = this.time) {
    return t * TAU + 0.6;
  }

  // dev: show a given hour now
  setTime(t) {
    const phase = this.clock && this.clock.dayPhase();
    if (phase !== null && phase !== undefined) this.offset = t - phase;
    this.time = ((t % 1) + 1) % 1;
  }

  update(dt, origin) {
    const phase = this.clock ? this.clock.dayPhase() : null;
    if (phase !== null) {
      this.time = (((phase + this.offset) % 1) + 1) % 1;
      this.weather = this.clock.weatherSeconds();
    } else {
      this.time = (this.time + (dt * this.speed) / DAY_SECONDS) % 1;
      this.weather += dt;
    }
    const e = this.elevation();
    this.sunElev = e;
    const az = this.sunAzimuth();
    const el = clamp(e, -0.3, 0.9);
    U.uSunDir.value.set(Math.cos(az) * Math.cos(el), Math.max(Math.sin(el), 0.04), Math.sin(az) * Math.cos(el)).normalize();
    const c = sample(e, this.cur);
    this.night = smoothstep(0.0, -0.22, e);

    // the fog's mood over minutes
    const w = this.weather;
    const slow = noise2(w * 0.004, 3.7);       // ~4 min
    const slower = noise2(w * 0.0013, 9.1);    // ~13 min
    const thick = clamp(0.25 + slow * 0.55 + slower * 0.35 + this.fogBias * 0.35 + (this.night * 0.15), 0, 1.2);
    U.uFogBase.value = lerp(-46, 6, slower) + (slow - 0.5) * 14 + this.fogBias * 12 - this.night * 14;
    U.uFogDensity.value = lerp(0.003, 0.0105, thick);
    U.uFogFalloff.value = lerp(0.06, 0.03, thick);
    U.uHaze.value = lerp(0.0004, 0.0011, thick * 0.7 + 0.15);
    FOG.uFogNoise.value = 0.75;
    FOG.uFogDrift.value.set(5 + slow * 4, 0.8, 3 - slower * 4);
    // the overcast, mostly closed; now and then it breaks and light comes down in shafts
    const breaks = this.forceBreaks ?? smoothstep(0.52, 0.78, noise2(w * 0.0021 + 4.4, 17.3));
    const lowSun = 1 - smoothstep(0.02, 0.3, e);
    this.breaks = breaks;
    FOG.uCloud.value = clamp(0.62 + slower * 0.3 - breaks * 0.15, 0, 1);
    FOG.uCloudCover.value = clamp(0.88 - breaks * 0.5 - lowSun * 0.25 + this.fogBias * 0.1, 0.25, 1);
    FOG.uCloudShadow.value = 0.85;
    FOG.uSunPower.value = 1 + breaks * 0.7 + lowSun * 0.7 * smoothstep(-0.09, 0.0, e);
    // streaming light from the sun: strong while it is low, in the day only through breaks
    const up = smoothstep(-0.04, 0.03, e);
    POST.uRaysBase.value = up * (lowSun * 1.15 + breaks * 0.5 * (1 - lowSun)) * (1 - this.night);
    POST.uRayColor.value.copy(c.sun).multiplyScalar(1.6).lerp(c.glow, 0.3);

    U.uFogColor.value.copy(c.fog);
    FOG.uFogLow.value.copy(c.low);
    // in a turned stand the steam takes a little of the gold (less by night)
    const au = this.autumn * (1 - this.night * 0.6);
    if (au > 0.001) {
      _warm.setRGB(1 + 0.1 * au, 1 + 0.02 * au, 1 - 0.08 * au);
      U.uFogColor.value.multiply(_warm);
      FOG.uFogLow.value.multiply(_warm);
    }
    FOG.uSkyTop.value.copy(c.top);
    FOG.uSkyHorizon.value.copy(c.hor);
    FOG.uSkyGlow.value.copy(c.glow);
    FOG.uCloudColor.value.copy(c.cloud);
    FOG.uNight.value = this.night;
    FOG.uSunVis.value = smoothstep(-0.12, 0.05, e);
    this.pulse = Math.max(0, this.pulse - dt * 0.35);
    FOG.uAurora.value = this.night * (0.25 + this.network * 0.75);
    FOG.uAuroraPulse.value = this.night * this.pulse * 1.2;
    U.uSunColor.value.copy(c.sun).multiplyScalar(smoothstep(-0.12, 0.05, e) * 0.85 + 0.15);
    U.uSkyColor.value.copy(c.sky);
    U.uGroundColor.value.copy(c.ground);
    U.uRimColor.value.copy(c.fog).multiplyScalar(0.28);
    U.uFrost.value = 0.42 + slower * 0.25;
    U.uWind.value = 0.6 + slow * 0.9;
    POST.uExposure.value = c.exp;
    if (origin) {
      FOG.uNoiseOff.value.set(origin.x, 0, origin.z);
      FOG.uCanopyOff.value.set(((origin.x % 2048) + 2048) % 2048, ((origin.z % 2048) + 2048) % 2048);
    }
  }

  // every move on the network is a pulse in the aurora
  networkPulse(strength = 1) {
    this.pulse = Math.min(1.5, this.pulse + strength);
  }

  clockString() {
    const m = Math.floor(this.time * 24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }
}
