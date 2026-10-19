import * as THREE from 'three';
import { fishGeometry } from '../actors/fishmodel.js';
import { worldMaterial, U } from '../render/materials.js';
import { nearest } from '../core/palette.js';

// Pixel portraits of the creatures, rendered from their own 3D models, side on, at a
// small size and shown scaled up by whole numbers (so the Codex is pixel art too).

const W2 = 96, H2 = 48;

export class Icons {
  constructor(pixelRenderer) {
    this.r = pixelRenderer.renderer;
    this.cache = new Map();
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-0.6, 0.6, 0.3, -0.3, 0.1, 10);
    this.cam.position.set(-3, 0.35, 0);
    this.cam.lookAt(0, 0, 0);
    this.target = new THREE.WebGLRenderTarget(W2, H2, { depthBuffer: true });
    this.target.texture.minFilter = this.target.texture.magFilter = THREE.NearestFilter;
    // a half-size portrait, rendered at its own size (for grids), never scaled down
    this.targetSmall = new THREE.WebGLRenderTarget(W2 / 2, H2 / 2, { depthBuffer: true });
    this.targetSmall.texture.minFilter = this.targetSmall.texture.magFilter = THREE.NearestFilter;
    this.bufSmall = new Uint8Array((W2 / 2) * (H2 / 2) * 4);
    this.mat = worldMaterial({ unique: true });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.scene.add(this.mesh);
    this.buf = new Uint8Array(W2 * H2 * 4);
  }

  _neutral(fn) {
    const keys = ['uSunDir', 'uSunColor', 'uSkyColor', 'uGroundColor', 'uRimColor', 'uFogDensity', 'uCamPos', 'uSense', 'uExposure', 'uLevels', 'uEmisBoost'];
    const saved = {};
    for (const k of keys) saved[k] = U[k].value.clone ? U[k].value.clone() : U[k].value;
    // a key light from above and in front, a darker bounce, so a body has a lit back and
    // a shaded belly rather than one flat color
    U.uSunDir.value.set(-0.55, 0.85, 0.25).normalize();
    U.uSunColor.value.setRGB(0.5, 0.5, 0.47);
    U.uSkyColor.value.setRGB(0.52, 0.56, 0.62);
    U.uGroundColor.value.setRGB(0.24, 0.27, 0.32);
    U.uRimColor.value.setRGB(0.14, 0.16, 0.2);
    U.uEmisBoost.value = 0.55;
    U.uFogDensity.value = 0;
    U.uCamPos.value.set(-3, 0.35, 0);
    U.uSense.value = 0;
    U.uExposure.value = 1;
    U.uLevels.value = 48;
    try {
      fn();
    } finally {
      for (const k of keys) {
        if (U[k].value.copy) U[k].value.copy(saved[k]);
        else U[k].value = saved[k];
      }
    }
  }

  // A data URL for a species' portrait. silhouette: unrecorded species show only shape.
  // silhouette: true (dark, for the Codex) or a [r, g, b] color
  // small: false (96x48), true (48x24) or a scale; view: '34' (three-quarter) or 'side'
  fish(sp, silhouette = false, small = false, view = '34') {
    const scale = small === true ? 0.5 : small || 1;
    const key = `${sp.id}${silhouette ? ':s' + (Array.isArray(silhouette) ? silhouette.join(',') : '') : ''}:${scale}:${view}`;
    const k = small === true ? 0.5 : small || 1;
    const W = Math.round(W2 * k), H = Math.round(H2 * k);
    if (!this._sizes) this._sizes = new Map([[1, [this.target, this.buf]], [0.5, [this.targetSmall, this.bufSmall]]]);
    if (!this._sizes.has(k)) {
      const t = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true });
      t.texture.minFilter = t.texture.magFilter = THREE.NearestFilter;
      this._sizes.set(k, [t, new Uint8Array(W * H * 4)]);
    }
    const [target, buf] = this._sizes.get(k);
    if (this.cache.has(key)) return this.cache.get(key);
    const geo = fishGeometry(sp);
    this.mesh.geometry = geo;
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const len = Math.max(bb.max.z - bb.min.z, (bb.max.y - bb.min.y) * 2, 0.4);
    const cz = (bb.max.z + bb.min.z) / 2, cy = (bb.max.y + bb.min.y) / 2;
    // a three-quarter view from a little above and in front: rings, rows of eyes and the
    // shards that float around a creature all read
    const half = len * 0.6;
    this.cam.left = -half;
    this.cam.right = half;
    this.cam.top = half / 2;
    this.cam.bottom = -half / 2;
    const flat = sp.model.kind === 'ray' || sp.model.kind === 'flat';
    const dir = view === 'side' ? (flat ? [-1, 0.9, 0] : [-1, 0.06, 0]) : flat ? [-1.2, 2.4, 0.4] : [-2.6, 0.6, 0.45];
    const dl = Math.hypot(...dir);
    this.cam.position.set((dir[0] / dl) * 3, cy + (dir[1] / dl) * 3, cz + (dir[2] / dl) * 3);
    this.cam.lookAt(0, cy, cz);
    this.cam.updateProjectionMatrix();
    const r = this.r;
    const prevTarget = r.getRenderTarget();
    const prevColor = new THREE.Color();
    r.getClearColor(prevColor);
    const prevAlpha = r.getClearAlpha();
    this._neutral(() => {
      r.setRenderTarget(target);
      r.setClearColor(0x000000, 0);
      r.clear();
      r.render(this.scene, this.cam);
      r.readRenderTargetPixels(target, 0, 0, W, H, buf);
    });
    r.setRenderTarget(prevTarget);
    r.setClearColor(prevColor, prevAlpha);
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = ((H - 1 - y) * W + x) * 4, d = (y * W + x) * 4;
        const a = buf[s + 3];
        if (silhouette) {
          const c = Array.isArray(silhouette) ? silhouette : [0x35, 0x3e, 0x50];
          img.data[d] = c[0]; img.data[d + 1] = c[1]; img.data[d + 2] = c[2]; img.data[d + 3] = a > 0 ? 255 : 0;
        } else {
          img.data[d] = buf[s]; img.data[d + 1] = buf[s + 1]; img.data[d + 2] = buf[s + 2]; img.data[d + 3] = a > 0 ? 255 : 0;
        }
      }
    }
    if (!silhouette) {
      for (let i = 0; i < W * H; i++) {
        if (!img.data[i * 4 + 3]) continue;
        const n = nearest([img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]]);
        img.data[i * 4] = n[0]; img.data[i * 4 + 1] = n[1]; img.data[i * 4 + 2] = n[2];
      }
    }
    if (silhouette !== true) {
      const solid = (x, y) => x >= 0 && y >= 0 && x < W && y < H && img.data[(y * W + x) * 4 + 3] === 255;
      const edge = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (img.data[(y * W + x) * 4 + 3]) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) edge.push(y * W + x);
      }
      const ink = Array.isArray(silhouette) && silhouette[0] < 40 ? [0x30, 0x38, 0x44] : [0x0f, 0x0e, 0x16];
      for (const i of edge) { img.data[i * 4] = ink[0]; img.data[i * 4 + 1] = ink[1]; img.data[i * 4 + 2] = ink[2]; img.data[i * 4 + 3] = 255; }
    }
    ctx.putImageData(img, 0, 0);
    const url = cv.toDataURL('image/png');
    this.cache.set(key, url);
    return url;
  }
}
