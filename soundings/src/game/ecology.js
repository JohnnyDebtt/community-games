import { clamp, smoothstep } from '../core/math.js';
import { CATCHABLE, RARITY } from './species.js';
import { zoneWeights, ZONES, dominantZone } from '../world/layout.js';

// Which fish come to a lure, here and now. Shared by the Seeker's own line and by the
// SEEKER NET devices, so a device sees the same sea you do.
//
// ctx: { x, z, depth, bottom, phase, weather, aurora, night, light, bait, aff, pop }

export function speciesWeight(sp, ctx, zw) {
  let z = 0;
  for (const zn of ZONES) z += (zw[zn.id] / zw._sum) * (sp.zones[zn.id] || 0);
  if (z < 0.01) return 0;
  const [d0, d1] = sp.depth;
  const d = ctx.depth;
  const out = d < d0 ? d0 - d : d > d1 ? d - d1 : 0;
  let w = z * Math.exp(-Math.pow(out / 4, 2));
  if (w < 0.004) return 0;
  if (sp.bottom) w *= smoothstep(4.5, 0.6, ctx.bottom - d);
  w *= sp.time[ctx.phase] ?? 1;
  if (sp.weather) w *= sp.weather[ctx.weather] ?? 1;
  if (sp.aurora) w *= smoothstep(sp.aurora[0], sp.aurora[1], ctx.aurora) * smoothstep(0.3, 0.8, ctx.night);
  w *= clamp(1 + sp.light * (ctx.light - 0.35) * 1.5, 0.1, 2);
  if (sp.bait) w *= ctx.bait ? sp.bait : 0.45;
  else if (ctx.bait) w *= 0.6;
  w *= RARITY[sp.rarity].weight * (ctx.rare && sp.rarity !== 'common' ? ctx.rare : 1);
  if (ctx.aff) for (const t of sp.tags) if (ctx.aff[t]) w *= Math.max(0.2, 1 + ctx.aff[t]);
  if (ctx.pop) w *= ctx.pop(sp);
  return w;
}

export function candidates(ctx) {
  const zw = zoneWeights(ctx.x, ctx.z);
  const out = [];
  let sum = 0;
  for (const sp of CATCHABLE) {
    const w = speciesWeight(sp, ctx, zw);
    if (w > 0) {
      out.push({ sp, w });
      sum += w;
    }
  }
  return { list: out, sum };
}

// How well a lure's motion suits a species: 1 inside its range, falling off outside.
export function jigMatch(sp, activity) {
  const [lo, hi] = sp.jig;
  const d = activity < lo ? lo - activity : activity > hi ? activity - hi : 0;
  return clamp(1 - d / 0.16, 0, 1);
}

// A size for a catch: most are modest, a few are large, deeper ones run bigger.
export function rollSize(sp, r, depthFrac = 0.5) {
  const f = clamp(Math.pow(r, 1.55) * (0.92 + depthFrac * 0.16), 0, 1);
  const cm = sp.size[0] + (sp.size[1] - sp.size[0]) * f;
  return { cm: Math.round(cm * 10) / 10, f };
}

export function zoneIdAt(x, z) {
  return dominantZone(x, z).id;
}
