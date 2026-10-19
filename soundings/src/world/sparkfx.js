import * as THREE from 'three';
import { glowMaterial } from '../render/materials.js';
import { setColor } from './props.js';
import { makeLight } from './lighting.js';
import { TAU } from '../core/math.js';
import { addOutline } from '../render/outline.js';

// What SEEKER NET looks like on the sea: released charge falling as a spark that punches
// through the ice and hovers there until you take it in; a pillar of light where a seeker
// woke; and lightning when one of yours moves on-chain.

function gradientColumn(radius, height, bottom, top) {
  const g = new THREE.CylinderGeometry(radius, radius, height, 6, 6, true);
  g.translate(0, height / 2, 0);
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(bottom), b = new THREE.Color(top), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.pow(p.getY(i) / height, 0.6);
    c.copy(a).lerp(b, t);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export class Spark {
  constructor(scene, x, z, big) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    scene.add(this.group);
    const s = big ? 1.35 : 1;
    // the falling streak
    this.streak = new THREE.Mesh(gradientColumn(0.05 * s, 1, 0xd6edf5, 0x203038), glowMaterial({ additive: true, fog: 0.15 }));
    this.streak.frustumCulled = false;
    this.group.add(this.streak);
    // the orb: a little crystal of charge
    const og = new THREE.OctahedronGeometry(0.16 * s, 0);
    setColor(og, 0xffffff);
    this.orb = new THREE.Mesh(og, glowMaterial({ tint: 0x9fe3ec, fog: 0.2 }));
    addOutline(this.orb);
    this.halo = new THREE.Mesh(setColor(new THREE.OctahedronGeometry(0.28 * s, 0), 0x5d8fa0), glowMaterial({ additive: true, fog: 0.3 }));
    this.orb.add(this.halo);
    this.group.add(this.orb);
    // a ring of light on the ice
    const rg = new THREE.RingGeometry(0.36 * s, 0.46 * s, 16);
    rg.rotateX(-Math.PI / 2);
    setColor(rg, 0x7bacbc);
    this.ring = new THREE.Mesh(rg, glowMaterial({ additive: true, fog: 0.4 }));
    this.ring.position.y = 0.02;
    this.group.add(this.ring);
    // a thin beam that stays, so the spark can be found from far off
    const bg = new THREE.BoxGeometry(0.05, 9, 0.05);
    bg.translate(0, 4.5 + 1.0, 0);
    setColor(bg, 0x7bacbc);
    this.beam = new THREE.Mesh(bg, glowMaterial({ fog: 0.05 }));
    this.beam.visible = false;
    this.group.add(this.beam);
    this.light = makeLight([x, 0.9, z], 0xd6edf5, 7 * s, 1.2);
    this.light.temp = true;
    this.t = 0;
    this.fallT = 1.4;
    this.phase = 'fall';
    this.orb.visible = this.ring.visible = false;
  }

  update(dt, frame) {
    this.t += dt;
    if (this.phase === 'fall') {
      const k = Math.min(1, this.t / this.fallT);
      const top = 70 * (1 - k * k) + 0.2;
      this.streak.scale.set(1, Math.max(0.2, 70 - top + 2), 1);
      this.streak.position.y = top - 2;
      this.streak.material.uniforms.uOpacity.value = 1;
      this.light.pos.set(this.group.position.x, top, this.group.position.z);
      this.light.intensity = 0.6 + k;
      if (k >= 1) {
        this.phase = 'orb';
        this.t = 0;
        this.orb.visible = this.ring.visible = true;
        return 'landed';
      }
    } else if (this.phase === 'orb') {
      // the streak fades into a thin column, the orb bobs on the 12 fps grid
      this.streak.scale.y = Math.max(0, this.streak.scale.y - dt * 40);
      this.streak.visible = this.streak.scale.y > 0.3;
      const bob = [0, 0.02, 0.04, 0.05, 0.04, 0.02, 0, -0.01][frame % 8];
      this.orb.position.set(0, 0.85 + bob, 0);
      this.orb.rotation.y = Math.floor(frame / 2) * 0.35;
      this.halo.visible = frame % 6 < 4;
      this.beam.visible = frame % 24 < 18;
      this.ring.scale.setScalar(1 + (frame % 12) / 24);
      this.light.pos.set(this.group.position.x, 0.9, this.group.position.z);
      this.light.intensity = 1 + (frame % 4 < 2 ? 0.2 : 0);
    } else if (this.phase === 'absorb') {
      const k = Math.min(1, this.t / 0.45);
      this.orb.position.lerpVectors(this.orb.position, this._to, k);
      this.orb.scale.setScalar(Math.max(0.01, 1 - k));
      this.ring.scale.setScalar(1 + k * 3);
      this.light.intensity = 1.6 * (1 - k);
      if (k >= 1) return 'gone';
    }
    return null;
  }

  absorb(toLocal) {
    this.phase = 'absorb';
    this.t = 0;
    this._to = toLocal;
    this.streak.visible = false;
    this.beam.visible = false;
  }

  dispose() {
    this.scene.remove(this.group);
    this.light.on = false;
  }
}

// A pillar of pale light where a seeker woke on the ice.
export class Pillar {
  constructor(scene, x, z) {
    this.scene = scene;
    this.mesh = new THREE.Mesh(gradientColumn(0.32, 46, 0xb7d8e3, 0x0b1216), glowMaterial({ additive: true, fog: 0.08 }));
    this.mesh.position.set(x, 0, z);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    const rg = new THREE.RingGeometry(0.7, 0.85, 20);
    rg.rotateX(-Math.PI / 2);
    setColor(rg, 0x91cbde);
    this.ring = new THREE.Mesh(rg, glowMaterial({ additive: true, fog: 0.3 }));
    this.ring.position.set(x, 0.02, z);
    scene.add(this.ring);
    this.light = makeLight([x, 1.2, z], 0xd6edf5, 9, 1.1);
    this.light.temp = true;
  }

  update(dt, frame) {
    const k = [1, 0.92, 0.85, 0.92][Math.floor(frame / 3) % 4];
    this.mesh.scale.set(k, 1, k);
    this.ring.scale.setScalar(1 + ((frame % 24) / 24) * 0.6);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.ring);
    this.light.on = false;
  }
}

// A jagged bolt from the sky to a point, for a moment.
export class Bolt {
  constructor(scene, x, y, z) {
    this.scene = scene;
    const pts = [];
    let px = x, pz = z;
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const yy = y + (1 - t) * 48;
      pts.push(new THREE.Vector3(px, yy, pz));
      px = x + (Math.random() - 0.5) * 2.2 * (1 - t);
      pz = z + (Math.random() - 0.5) * 2.2 * (1 - t);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xf0fbff, transparent: true }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 8;
    scene.add(this.line);
    this.light = makeLight([x, y + 1, z], 0xf0fbff, 14, 3);
    this.light.temp = true;
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    this.line.visible = Math.floor(this.t * 24) % 3 !== 1;
    this.light.intensity = 3 * Math.max(0, 1 - this.t / 0.6);
    return this.t > 0.6;
  }
  dispose() {
    this.scene.remove(this.line);
    this.light.on = false;
  }
}

export { TAU };
