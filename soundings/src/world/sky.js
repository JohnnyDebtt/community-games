import * as THREE from 'three';
import { U } from '../render/materials.js';

// Sky dome: the surface sky of the game's art (deep blue to a pale icy horizon, thin
// dark cloud streaks, stars), a low cold sun, and an aurora whose strength comes from
// SEEKER NET (see seekernet/network.js).

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZen, uMid, uHor, uSunCol;
uniform vec3 uSun;
uniform float uNight, uAurora, uPulse, uCloud, uOvercast, uTime, uLevels, uStarAmt;
uniform vec3 uAur1, uAur2;
varying vec3 vDir;

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = h21(i), b = h21(i + vec2(1, 0)), c = h21(i + vec2(0, 1)), d = h21(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float az = atan(d.z, d.x);
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.32, h));
  col = mix(col, uZen, smoothstep(0.25, 0.95, h));
  if (h < 0.0) col = uHor * mix(1.0, 0.82, smoothstep(0.0, -0.2, h));

  // the sun: a small pale disc and a soft glow (hidden under heavy cloud)
  float sd = max(dot(d, uSun), 0.0);
  float vis = 1.0 - uOvercast * 0.85;
  col += uSunCol * (pow(sd, 12.0) * 0.35 + pow(sd, 90.0) * 0.5) * vis;
  col = mix(col, vec3(0.96, 0.97, 0.95), smoothstep(0.9993, 0.9996, sd) * vis * (1.0 - uNight));

  // stars
  if (uNight > 0.01 && h > 0.0) {
    vec2 g = vec2(az * 140.0, h * 120.0);
    vec2 cell = floor(g);
    float r = h21(cell);
    vec2 fp = fract(g) - 0.5;
    float star = step(0.985, r) * step(length(fp), 0.18 + 0.12 * step(0.996, r));
    float tw = 0.65 + 0.35 * sin(uTime * (1.0 + r * 3.0) + r * 40.0);
    col += vec3(0.85, 0.9, 0.95) * star * tw * uStarAmt * smoothstep(0.02, 0.2, h);
  }

  // aurora: hanging curtains over the north, fed by the network
  float aur = uAurora * uNight * (1.0 - uOvercast * 0.8);
  if (aur > 0.002 && h > 0.0) {
    float north = smoothstep(0.1, 0.9, -d.z * 0.8 + 0.35);
    float acc = 0.0;
    vec3 ac = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float base = 0.16 + fi * 0.09 + 0.05 * sin(az * (2.0 + fi) + uTime * 0.05 + fi);
      float band = smoothstep(base - 0.02, base + 0.03, h) * (1.0 - smoothstep(base + 0.05, base + 0.32, h));
      float wave = vnoise(vec2(az * (5.0 + fi * 2.0) + uTime * (0.04 + fi * 0.01), fi * 7.0));
      float rays = 0.55 + 0.45 * vnoise(vec2(az * 60.0 + uTime * 0.2, fi * 3.0 + h * 2.0));
      float a = band * smoothstep(0.35, 0.8, wave) * rays;
      acc += a;
      ac += mix(uAur1, uAur2, smoothstep(base, base + 0.3, h)) * a;
    }
    float pulse = 1.0 + uPulse * 1.6;
    col += ac * north * aur * 0.5 * pulse;
  }

  // thin horizontal cloud streaks, darker than the sky, like the game's surface
  float sh = h * 24.0;
  float n = vnoise(vec2(az * 2.5 + uTime * 0.004, sh)) * 0.7 + vnoise(vec2(az * 9.0 - uTime * 0.006, sh * 2.0)) * 0.3;
  float streak = smoothstep(0.62 - uCloud * 0.2, 0.74 - uCloud * 0.2, n) * smoothstep(0.0, 0.06, h) * (1.0 - smoothstep(0.45, 0.85, h));
  col = mix(col, col * 0.78 + uZen * 0.08, streak * (0.55 + uCloud * 0.4));
  // overcast: everything flattens toward a soft grey
  col = mix(col, mix(uHor, uMid, 0.55) * 0.95, uOvercast * 0.75);

  float dd = bayer4(gl_FragCoord.xy) - 0.5;
  col = floor(col * uLevels + 0.5 + dd * 0.95) / uLevels;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.uniforms = {
      uZen: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
      uSunCol: { value: new THREE.Color(0.9, 0.9, 0.86) }, uSun: { value: new THREE.Vector3(0, 0.3, -1) },
      uNight: { value: 0 }, uAurora: { value: 0.3 }, uPulse: { value: 0 }, uCloud: { value: 0.3 }, uOvercast: { value: 0 },
      uTime: U.uTime, uLevels: U.uLevels, uStarAmt: { value: 1 },
      uAur1: { value: new THREE.Color(0x7bacbc) }, uAur2: { value: new THREE.Color(0x8ca893) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 24, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  update(day, camera, weather, aurora, pulse) {
    const u = this.uniforms;
    u.uZen.value.copy(day.c.zen);
    u.uMid.value.copy(day.c.mid);
    u.uHor.value.copy(day.c.hor);
    u.uSun.value.copy(day.sunDir);
    u.uNight.value = day.night;
    u.uAurora.value = aurora;
    u.uPulse.value = pulse;
    u.uCloud.value = weather.cloud;
    u.uOvercast.value = weather.overcast;
    u.uStarAmt.value = 1 - weather.overcast;
    this.mesh.position.copy(camera.position);
  }
}
