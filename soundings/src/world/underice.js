import * as THREE from 'three';
import { TAU, rng, clamp } from '../core/math.js';
import { worldMaterial } from '../render/materials.js';
import { fishGeometry } from '../actors/fishmodel.js';
import { SPECIES_BY_ID } from '../game/species.js';
import { ZONE, depthAt, shoreAt } from './layout.js';

// What swims just under the ice: dark shapes seen through the clear black ice of the
// Glass Reach and the Drop, slow and indifferent. And, rarely, something enormous.

const R = rng(4242);

class School {
  constructor(scene, sp, count, zoneIds, scale, depth, tint) {
    const geo = fishGeometry(SPECIES_BY_ID[sp]);
    const mat = worldMaterial({ unique: true, swim: 0.08, tint, senseTarget: 1 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.fish = [];
    for (let i = 0; i < count; i++) {
      const zn = ZONE[zoneIds[i % zoneIds.length]];
      const a = R() * TAU, r = Math.sqrt(R()) * zn.sigma * 1.1;
      const cx = zn.x + Math.cos(a) * r, cz = zn.z + Math.sin(a) * r;
      this.fish.push({
        cx, cz, rad: 2 + R() * 9, ang: R() * TAU, speed: (0.08 + R() * 0.12) * (R() < 0.5 ? 1 : -1),
        y: -(depth[0] + R() * (depth[1] - depth[0])), s: scale * (0.7 + R() * 0.6), bob: R() * TAU,
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
  }

  update(dt, time) {
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      f.ang += (f.speed / f.rad) * dt * 6;
      const x = f.cx + Math.cos(f.ang) * f.rad, z = f.cz + Math.sin(f.ang) * f.rad;
      // keep off the shallow shore
      const ok = Math.hypot(x, z) < shoreAt(x, z) - 4 && depthAt(x, z) > -f.y + 1;
      // face along the circle: rotation.y maps +z (the head) onto the velocity
      const sg = Math.sign(f.speed);
      this._e.set(0, Math.atan2(-Math.sin(f.ang) * sg, Math.cos(f.ang) * sg), 0);
      this._q.setFromEuler(this._e);
      this._p.set(x, f.y + Math.sin(time * 0.4 + f.bob) * 0.15, z);
      this._s.setScalar(ok ? f.s : 0.0001);
      this._m.compose(this._p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class UnderIce {
  constructor(scene) {
    this.schools = [
      new School(scene, 'frost_char', 34, ['shallows', 'reach'], 0.8, [1, 3.5], 0x2a3238),
      new School(scene, 'lantern_cod', 24, ['reach', 'drop'], 1.3, [1.2, 5], 0x1e252b),
      new School(scene, 'tether_pike', 9, ['reach'], 2.2, [1.5, 5], 0x161c20),
      new School(scene, 'lattice_eel', 10, ['drop'], 2.4, [2, 6], 0x241e2c),
      new School(scene, 'vent_gar', 16, ['vents'], 1.2, [0.8, 3], 0x2c2c26),
    ];
    // the Listener: forty meters of something
    const geo = fishGeometry(SPECIES_BY_ID.the_listener);
    this.listener = new THREE.Mesh(geo, worldMaterial({ unique: true, swim: 0.03, tint: 0x0a0f12, senseTarget: 1 }));
    this.listener.scale.setScalar(46);
    this.listener.visible = false;
    this.listener.frustumCulled = false;
    scene.add(this.listener);
    this.lx = 0;
    this.lz = 0;
    this.lT = 0;
    this.lActive = 0;
  }

  // Bring the Listener up beneath a point, slowly.
  rise(x, z) {
    this.lx = x;
    this.lz = z;
    this.lT = 0;
    this.lActive = 1;
    this.listener.visible = true;
  }
  sink() {
    this.lActive = -1;
  }

  update(dt, time) {
    for (const s of this.schools) s.update(dt, time);
    if (this.listener.visible) {
      this.lT += dt;
      const depth = this.lActive > 0 ? -clamp(40 - this.lT * 1.6, 9, 40) : -Math.min(60, 9 + this.lT * 2);
      const pass = this.lT * 0.6 - 18;
      this.listener.position.set(this.lx + pass * 0.4, depth, this.lz + pass);
      this.listener.rotation.y = Math.atan2(0.4, 1);
      if (this.lActive < 0 && this.lT > 40) this.listener.visible = false;
      if (this.lActive < 0 && depth <= -59) this.listener.visible = false;
    }
  }
}
