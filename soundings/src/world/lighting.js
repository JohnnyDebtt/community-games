import * as THREE from 'three';
import { U, MAX_LIGHTS } from '../render/materials.js';

// Feeds the shared world uniforms from the time of day, the weather and the nearby
// point lights (capsule window, lantern, seeker screens, tether cores).

const _lights = [];

export function applyLighting(day, weather, camera, lights) {
  const sunK = 1 - weather.overcast * 0.6;
  U.uSunDir.value.copy(day.lightDir);
  U.uSunColor.value.copy(day.c.sun).multiplyScalar(sunK);
  U.uSkyColor.value.copy(day.c.sky).multiplyScalar(1 + weather.overcast * 0.12);
  U.uGroundColor.value.copy(day.c.gnd);
  U.uRimColor.value.copy(day.c.rim);
  U.uFogColor.value.copy(day.c.fog);
  U.uFogDensity.value = 0.0042 + weather.snow * 0.018 + weather.overcast * 0.003;
  U.uCamPos.value.copy(camera.position);

  // nearest lights to the camera win the few slots
  _lights.length = 0;
  for (const L of lights) {
    if (!L.on || L.intensity <= 0.001) continue;
    L._d = L.pos.distanceToSquared(camera.position);
    _lights.push(L);
  }
  _lights.sort((a, b) => a._d - b._d);
  const pos = U.uPointPos.value, col = U.uPointColor.value;
  for (let i = 0; i < MAX_LIGHTS; i++) {
    const L = _lights[i];
    if (L) {
      pos[i].set(L.pos.x, L.pos.y, L.pos.z, L.range);
      col[i].copy(L.color).multiplyScalar(L.intensity * (0.12 + day.night * 0.88) * (1 - weather.overcast * 0.2 * (1 - day.night)));
    } else {
      pos[i].set(0, -999, 0, 0);
    }
  }
}

export function makeLight(pos, color, range, intensity = 1) {
  return { pos: pos.clone ? pos.clone() : new THREE.Vector3(...pos), color: new THREE.Color(color), range, intensity, on: true };
}
