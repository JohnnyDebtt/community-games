import * as THREE from 'three';

// Renders the world at a low resolution and lets the browser scale the canvas up by a
// whole number with nearest-neighbor sampling (CSS image-rendering: pixelated).
// That is the Seeker's pixel look, and it keeps the GPU cost tiny.

THREE.ColorManagement.enabled = false;

const TARGETS = { fine: 420, standard: 300, chunky: 216 };

export class PixelRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.pixelSize = 'auto';   // 'auto' | 'fine' | 'standard' | 'chunky'
    this.scale = 4;
    this.width = 1;
    this.height = 1;
    this._bias = 0;            // auto mode: extra device pixels per art pixel
    this._ft = [];
    this._window = 0;
    this._good = 0;
    this._lockUntil = 0;
    this.onResize = null;
    // a resize clears the canvas, so it is applied just before the next frame is drawn,
    // never between drawing and showing one (that showed as a black blink)
    const again = () => { this._dirty = true; };
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', () => setTimeout(again, 200));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', again);
    if (window.ResizeObserver) new ResizeObserver(again).observe(document.documentElement);
    this.resize();
  }

  setPixelSize(name) {
    this.pixelSize = TARGETS[name] || name === 'auto' ? name : 'auto';
    this._bias = 0;
    this.resize();
  }

  resize() {
    this._dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const devW = Math.max(1, Math.round(Math.max(vw, document.documentElement.clientWidth) * dpr));
    const devH = Math.max(1, Math.round(Math.max(vh, document.documentElement.clientHeight) * dpr));
    const target = TARGETS[this.pixelSize] || TARGETS.standard;
    // about `target` art pixels tall in landscape; in portrait, keep the width readable
    let scale = Math.max(1, Math.round(Math.min(devH / target, devW / (target * 0.62))));
    // the interface shares this pixel; a drop for performance leaves it alone
    this.baseScale = Math.max(1, Math.min(12, scale));
    if (this.pixelSize === 'auto') scale += this._bias;
    scale = Math.max(1, Math.min(12, scale));
    const w = Math.ceil(devW / scale);
    const h = Math.ceil(devH / scale);
    const css = scale / dpr;
    if (w !== this.width || h !== this.height || css !== this._css) {
      this.scale = scale;
      this.width = w;
      this.height = h;
      this._css = css;
      this.renderer.setSize(w, h, false);
      this.canvas.style.width = `${w * css}px`;
      this.canvas.style.height = `${h * css}px`;
      if (this.onResize) this.onResize(w, h);
    }
    // where the world's pixel grid starts on the page (the canvas is centered), so the
    // interface can sit on the same grid
    this.origin = { x: (vw - this.width * this._css) / 2, y: (vh - this.height * this._css) / 2, css: this._css };
  }

  // Called once per frame with the real frame time (ms). In auto mode it lowers the
  // resolution while the device struggles and tries to win it back later.
  adapt(ms, now) {
    if (this.pixelSize !== 'auto') return;
    const ft = this._ft;
    ft.push(ms);
    this._window += ms;
    if (this._window < 2000) return;
    this._window = 0;
    const s = ft.slice().sort((a, b) => a - b);
    ft.length = 0;
    const p50 = s[Math.floor(s.length * 0.5)];
    const p90 = s[Math.floor(s.length * 0.9)];
    if (p50 > 23 && this._bias < 4) {
      this._bias++;
      this._good = 0;
      this._lockUntil = now + 60000;   // after a drop, wait before trying to climb back
      this._dirty = true;
    } else if (p90 < 18.5 && this._bias > 0) {
      this._good += 2;
      if (this._good >= 20 && now > this._lockUntil) {
        this._bias--;
        this._good = 0;
        this._dirty = true;
      }
    } else {
      this._good = 0;
    }
  }

  render(scene, camera) {
    if (this._dirty) this.resize();
    this.renderer.render(scene, camera);
  }
}
