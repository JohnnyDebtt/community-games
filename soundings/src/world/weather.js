import * as THREE from 'three';
import { clamp, damp, hash1 } from '../core/math.js';
import { U, COMMON } from '../render/materials.js';
import { POLYNYA, ZONE } from './layout.js';

// Weather changes on the hour, from a seed, so a day's weather can be predicted by no
// one but repeats for nobody. Snow falls in a box that travels with the camera (one
// draw call); steam rises from the open water over the vents.

const KINDS = ['clear', 'overcast', 'snow'];
const NEXT = { clear: [0.62, 0.26, 0.12], overcast: [0.3, 0.4, 0.3], snow: [0.25, 0.35, 0.4] };

export class Weather {
  constructor(scene, seed) {
    this.seed = seed;
    this.kind = 'clear';
    this.cloud = 0.3;
    this.overcast = 0;
    this.snow = 0;
    this._hourKey = -1;
    this._buildSnow(scene);
    this._buildSteam(scene);
    this.forced = null;
  }

  kindFor(day, hour) {
    // a Markov chain over the hours of all days, from the seed
    let k = 'clear';
    const start = Math.max(0, day * 24 + hour - 6);
    for (let h = start; h <= day * 24 + hour; h++) {
      const r = hash1(this.seed + h * 7919);
      const p = NEXT[k];
      k = r < p[0] ? 'clear' : r < p[0] + p[1] ? 'overcast' : 'snow';
    }
    return k;
  }

  update(dt, day, cam) {
    const hour = Math.floor(day.t * 24);
    const key = day.day * 24 + hour;
    if (key !== this._hourKey) {
      this._hourKey = key;
      this.kind = this.forced || this.kindFor(day.day, hour);
    }
    const tgtOver = this.kind === 'overcast' ? 0.75 : this.kind === 'snow' ? 0.9 : 0.05;
    const tgtSnow = this.kind === 'snow' ? 1 : 0;
    this.overcast = damp(this.overcast, tgtOver, 0.08, dt);
    this.snow = damp(this.snow, tgtSnow, 0.1, dt);
    this.cloud = damp(this.cloud, this.kind === 'clear' ? 0.25 : 0.7, 0.08, dt);
    const su = this.snowMat.uniforms;
    su.uAmount.value = this.snow;
    su.uCam.value.copy(cam.position);
    this.snowPts.position.set(0, 0, 0);
  }

  _buildSnow(scene) {
    const N = 2600;
    const pos = new Float32Array(N * 3);
    const r = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = Math.random();
      pos[i * 3 + 1] = Math.random();
      pos[i * 3 + 2] = Math.random();
      r[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('rnd', new THREE.BufferAttribute(r, 1));
    this.snowMat = new THREE.ShaderMaterial({
      uniforms: { ...U, uAmount: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: 34 } },
      vertexShader: /* glsl */ `
        attribute float rnd;
        uniform float uAmount, uBox, uTime;
        uniform vec3 uCam;
        varying float vA;
        varying vec3 vWorld;
        void main() {
          vec3 p = position * uBox;
          float t = floor(uTime * 12.0) / 12.0;
          p.y -= t * (1.2 + rnd * 0.8);
          p.x += t * 0.9 + sin(t * 0.8 + rnd * 20.0) * 0.6;
          p.z += t * 0.5;
          vec3 o = uCam - vec3(uBox * 0.5, uBox * 0.3, uBox * 0.5);
          p = mod(p - o, uBox) + o;
          vWorld = p;
          vA = step(rnd, uAmount) * (p.y > 0.0 ? 1.0 : 0.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = rnd > 0.85 ? 2.0 : 1.0;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vA;
        varying vec3 vWorld;
        void main() {
          if (vA < 0.5) discard;
          vec3 c = mix(vec3(0.93, 0.95, 0.96), uSkyColor * 1.4, 0.25);
          c = applyFog(c, vWorld);
          gl_FragColor = vec4(c, 0.9);
        }`,
      transparent: true, depthWrite: false,
    });
    this.snowPts = new THREE.Points(g, this.snowMat);
    this.snowPts.frustumCulled = false;
    this.snowPts.renderOrder = 5;
    scene.add(this.snowPts);
  }

  _buildSteam(scene) {
    // puffs from the polynya and from cracks across the vent field
    const N = 260;
    const pos = new Float32Array(N * 3);
    const r = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const vent = i < 170;
      const a = Math.random() * Math.PI * 2;
      const d = vent ? Math.sqrt(Math.random()) * POLYNYA.r : 10 + Math.random() * 18;
      const cx = vent ? POLYNYA.x : ZONE.vents.x, cz = vent ? POLYNYA.z : ZONE.vents.z;
      pos[i * 3] = cx + Math.cos(a) * d;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = cz + Math.sin(a) * d;
      r[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('rnd', new THREE.BufferAttribute(r, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        attribute float rnd;
        uniform float uTime;
        varying float vA;
        varying vec3 vWorld;
        void main() {
          float t = floor(uTime * 12.0) / 12.0;
          float life = fract(t * (0.07 + rnd * 0.05) + rnd);
          vec3 p = position;
          p.y = life * (3.5 + rnd * 4.0);
          p.x += sin(life * 6.0 + rnd * 9.0) * 0.5 + life * 1.5;
          p.z += cos(life * 5.0 + rnd * 7.0) * 0.4 + life * 0.8;
          vWorld = p;
          vA = (1.0 - life) * smoothstep(0.0, 0.1, life);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((1.2 + life * 3.0) * 60.0 / max(1.0, -mv.z), 2.0, 26.0);
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vA;
        varying vec3 vWorld;
        void main() {
          // a soft round puff, dithered rather than blended
          float r = length(gl_PointCoord - 0.5) * 2.0;
          float a = vA * (1.0 - smoothstep(0.15, 1.0, r)) * 0.85;
          if (a < bayer4(gl_FragCoord.xy) * 0.85 + 0.04) discard;
          vec3 c = mix(uFogColor, vec3(0.92, 0.94, 0.95), 0.55);
          gl_FragColor = vec4(applyFog(c, vWorld), 1.0);
        }`,
      // drawn in the transparent pass so it lands after the ice (it is dithered, not blended)
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 4;
    scene.add(pts);
  }
}

export { KINDS };
