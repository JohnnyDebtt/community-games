import * as THREE from 'three';
import { U, COMMON } from '../render/materials.js';
import { TAU } from '../core/math.js';

// Small things: ice chips from the auger, splashes, footprints, the fishing line.

export class Particles {
  constructor(scene, max = 160) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.n = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        attribute vec3 color;
        varying vec3 vC; varying vec3 vW;
        void main() {
          vC = color; vW = position;
          vec4 mv = viewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(14.0 / max(1.0, -mv.z), 1.0, 3.0);
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying vec3 vC; varying vec3 vW;
        void main() { if (vC.r + vC.g + vC.b < 0.01) discard; gl_FragColor = vec4(finalize(applyFog(vC, vW)), 1.0); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  emit(x, y, z, count, opts = {}) {
    const c = new THREE.Color(opts.color ?? 0xedf0f1);
    for (let k = 0; k < count; k++) {
      const i = this.n++ % this.max;
      const a = Math.random() * TAU, s = (opts.speed ?? 1.4) * (0.4 + Math.random() * 0.8);
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s * (opts.spread ?? 0.6);
      this.vel[i * 3 + 1] = (opts.up ?? 1.8) * (0.5 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * s * (opts.spread ?? 0.6);
      this.life[i] = (opts.life ?? 0.7) * (0.6 + Math.random() * 0.8);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.01, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.life[i] <= 0) this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0;
    }
    if (any || this._was) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }
    this._was = any;
  }
}

// Footprints: small pressed hollows in the snow, slowly filling in.
export class Footprints {
  constructor(scene, max = 240) {
    this.max = max;
    const g = new THREE.PlaneGeometry(0.09, 0.17);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        attribute float age;
        varying float vAge; varying vec3 vW;
        void main() {
          vAge = age;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        varying float vAge; varying vec3 vW;
        void main() {
          // a soft blue hollow pressed in the snow, filling in slowly
          float a = (1.0 - vAge) * 0.55;
          if (a < bayer4(gl_FragCoord.xy) * 0.9 + 0.08) discard;
          vec3 c = mix(uGroundColor, uSkyColor, 0.7) * vec3(0.9, 0.95, 1.05);
          gl_FragColor = vec4(finalize(applyFog(c, vW)), 1.0);
        }`,
      transparent: true,     // after the ice, which is drawn in the transparent pass
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.age = new Float32Array(max).fill(1);
    this.mesh.geometry.setAttribute('age', new THREE.InstancedBufferAttribute(this.age, 1));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.n = 0;
    const m = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, m);
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this._t = 0;
  }

  add(x, y, z, yaw, side) {
    const i = this.n++ % this.max;
    const ox = Math.cos(yaw) * 0.09 * (side ? 1 : -1), oz = -Math.sin(yaw) * 0.09 * (side ? 1 : -1);
    this._m.makeRotationY(yaw);
    this._m.setPosition(x + ox, y + 0.012, z + oz);
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.age[i] = 0;
    this.mesh.geometry.attributes.age.needsUpdate = true;
  }

  update(dt) {
    this._t += dt;
    if (this._t < 1) return;
    this._t = 0;
    for (let i = 0; i < this.max; i++) if (this.age[i] < 1) this.age[i] = Math.min(1, this.age[i] + 1 / 240);
    this.mesh.geometry.attributes.age.needsUpdate = true;
  }
}

// The line from the rod tip, sagging a little, down into the water.
export class FishingLine {
  constructor(scene) {
    this.N = 12;
    this.pos = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xc4ced4, transparent: true, opacity: 0.75 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.line.renderOrder = 7;
    scene.add(this.line);
  }

  set(a, b, slack = 0.05) {
    for (let i = 0; i < this.N; i++) {
      const t = i / (this.N - 1);
      this.pos[i * 3] = a.x + (b.x - a.x) * t;
      this.pos[i * 3 + 1] = a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * slack;
      this.pos[i * 3 + 2] = a.z + (b.z - a.z) * t;
    }
    this.line.geometry.attributes.position.needsUpdate = true;
    this.line.visible = true;
  }

  hide() {
    this.line.visible = false;
  }
}

// Soft round shadows on the snow under the Seeker and the seekers, dithered like the art.
export class BlobShadows {
  constructor(scene, max = 16) {
    this.max = max;
    const g = new THREE.CircleGeometry(0.5, 14);
    g.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uStrength: { value: 0.5 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vW;
        void main() {
          vUv = position.xz * 2.0;
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        ${COMMON}
        uniform float uStrength;
        varying vec2 vUv; varying vec3 vW;
        void main() {
          float r = length(vUv);
          float a = (1.0 - smoothstep(0.35, 1.0, r)) * uStrength;
          if (a < bayer4(gl_FragCoord.xy) * 0.9 + 0.05) discard;
          vec3 c = mix(uGroundColor, uSkyColor, 0.25) * 0.55;
          gl_FragColor = vec4(finalize(applyFog(c, vW)), 1.0);
        }`,
      transparent: true,     // after the ice, which is drawn in the transparent pass
      depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mat = mat;
    scene.add(this.mesh);
    this._m = new THREE.Matrix4();
    this.list = [];
  }

  // items: [{ x, y, z, r, h }] (h = height above the ground, for fading)
  update(items, sunDir, strength) {
    const n = Math.min(this.max, items.length);
    for (let i = 0; i < this.max; i++) {
      const it = items[i];
      if (i >= n || !it) {
        this._m.makeScale(0, 0, 0);
      } else {
        const lift = Math.max(0, it.h || 0);
        const s = it.r * 2 * (1 + lift * 0.4);
        const ox = -sunDir.x * 0.25 * it.r, oz = -sunDir.z * 0.25 * it.r;
        this._m.makeScale(s, 1, s * 0.85);
        this._m.setPosition(it.x + ox, it.y + 0.014, it.z + oz);
      }
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mat.uniforms.uStrength.value = strength;
  }
}
