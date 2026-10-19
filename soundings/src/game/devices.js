import { clamp, rng } from '../core/math.js';
import { candidates, jigMatch, rollSize } from './ecology.js';
import { RHYTHMS } from '../seekernet/traits.js';
import { depthAt } from '../world/layout.js';

// SEEKER NET seekers set over holes. Each fishes on its own rhythm at the depth its
// senses like best, and calls you when something bites. A hooked fish waits as long as
// the seeker's gear can hold it; then it slips away (nothing is lost).

const R = rng((Date.now() >>> 3) ^ 0xdead);
const HOLD = 24;      // seconds a hooked fish waits at a device, before gear

export class DeviceSlot {
  constructor(hole, token, bot) {
    this.hole = hole;
    this.token = token;
    this.bot = bot;
    this.state = 'fishing';
    this.depth = 4;
    this.hold = 0;
    this.fish = null;
    this.step = -1;
    this.activity = 0;
    this.lastLift = 0;
    this.cooldown = 4 + R() * 6;
  }
}

export class Devices {
  constructor(game) {
    this.g = game;
    this.slots = [];
  }

  slotAt(holeId) {
    return this.slots.find((s) => s.hole.id === holeId);
  }

  // Pick the depth with the best fishing for this seeker's rhythm and senses.
  chooseDepth(slot, profile) {
    const bottom = depthAt(slot.hole.x, slot.hole.z);
    const reach = Math.max(0.8, Math.min(this.g.lineMax(), bottom - 0.4));
    let best = reach * 0.6, bw = -1;
    const n = 10;
    for (let i = 1; i <= n; i++) {
      const d = (reach * i) / n;
      const ctx = this.g.deviceContext(slot, d, profile);
      const c = candidates(ctx);
      let w = 0;
      for (const it of c.list) w += it.w * (0.25 + jigMatch(it.sp, profile.rhythmInfo.activity));
      if (w > bw) { bw = w; best = d; }
    }
    slot.depth = best;
    return best;
  }

  update(dt, beatStep) {
    for (const slot of this.slots) {
      const profile = this.g.profileFor(slot.token, slot);
      if (!profile) continue;
      // the seeker's rhythm on the shared 16-step bar
      if (beatStep !== slot.step) {
        slot.step = beatStep;
        if (profile.rhythmInfo.steps.includes(beatStep)) {
          slot.lastLift = 1;
          if (slot.bot) slot.bot.jigging = 1;
        }
      }
      slot.lastLift = Math.max(0, slot.lastLift - dt * 3);
      slot.activity = profile.rhythmInfo.activity;

      if (slot.state === 'fishing') {
        slot.cooldown -= dt;
        if (slot.cooldown > 0) continue;
        const ctx = this.g.deviceContext(slot, slot.depth, profile);
        const c = candidates(ctx);
        if (!c.list.length) continue;
        let sum = 0;
        const list = c.list.map((it) => {
          const w = it.w * (0.15 + jigMatch(it.sp, slot.activity));
          sum += w;
          return { sp: it.sp, w };
        });
        const rate = Math.min(0.07, 0.012 * sum) * this.g.deviceSpeed(slot, profile);
        if (R() < 1 - Math.exp(-rate * dt)) {
          let x = R() * sum, pick = list[0];
          for (const it of list) { x -= it.w; if (x <= 0) { pick = it; break; } }
          const { cm, f } = rollSize(pick.sp, R(), clamp(slot.depth / pick.sp.depth[1], 0, 1));
          slot.fish = { sp: pick.sp, cm, f, depth: slot.depth, fromDevice: slot.token };
          slot.state = 'hooked';
          slot.hold = HOLD * this.g.deviceHold(profile);
          slot.holdMax = slot.hold;
          this.g.onDeviceBite(slot, profile);
        }
      } else if (slot.state === 'hooked') {
        slot.hold -= dt;
        if (slot.bot) slot.bot.alert = 1;
        if (slot.hold <= 0) {
          slot.state = 'fishing';
          slot.fish = null;
          slot.cooldown = 8 + R() * 10;
          this.g.onDeviceEscape(slot);
        }
      }
    }
  }

  // The Seeker takes over the line at a device's hole.
  take(slot) {
    const fish = slot.fish;
    slot.fish = null;
    slot.state = 'fishing';
    slot.cooldown = 10 + R() * 10;
    return fish;
  }
}
