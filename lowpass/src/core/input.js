// Keyboard, mouse (with pointer lock inside the ship), touch and gamepad, reduced to a
// few intentions: steer, walk, look, scan, use, switch view, open the Codex, pause.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // went down this frame
    this.look = { x: 0, y: 0 };    // accumulated mouse movement
    this.locked = false;
    this.touch = { steer: 0, steers: new Map(), scan: false, boost: false, move: { x: 0, y: 0 }, lookId: null, moveId: null, lx: 0, ly: 0, mx: 0, my: 0, starts: new Map() };
    this.stickR = 50;              // how far the walking thumb goes for full speed (CSS px)
    // touch or keys: the hints and the buttons follow whichever was used last
    this.touchMode = matchMedia('(pointer: coarse)').matches;
    this.onMode = null;
    this.anyKey = false;
    this.onAny = null;
    this.uiCapture = false;        // a text field has focus: keys belong to it
    this.lastInput = performance.now();
    this.dragLook = false;
    this.mouseDown = false;
    this._pad = { buttons: [], prev: [] };

    addEventListener('keydown', (e) => {
      if (this.uiCapture) return;
      this._setTouch(false);
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      this._any();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.pressed.add('Mouse' + e.button);
      this._any();
    });
    addEventListener('mouseup', () => { this.mouseDown = false; this._lastMouse = null; });
    addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.look.x += e.movementX;
        this.look.y += e.movementY;
      } else if (this.dragLook && this.mouseDown) {
        if (this._lastMouse) {
          this.look.x += e.clientX - this._lastMouse[0];
          this.look.y += e.clientY - this._lastMouse[1];
        }
        this._lastMouse = [e.clientX, e.clientY];
      }
    });
    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') this._setTouch(false);
      else if (e.pointerType === 'touch') this._setTouch(true);
    }, true);
    // sound may only start from the end of a touch on phones, never its start
    addEventListener('touchend', () => this._any(), { capture: true, passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // touch: on the canvas, hold the left or right half to steer; inside, the left half
    // walks (a thumb's drag from where it lands) and the right half looks. A short tap is
    // a 'Tap'. Buttons in the HUD send their own intentions.
    const t = this.touch;
    const last = () => { let s = 0; for (const v of t.steers.values()) s = v; return s; };
    canvas.addEventListener('touchstart', (e) => {
      this._any();
      this._setTouch(true);
      for (const p of e.changedTouches) {
        t.starts.set(p.identifier, { x: p.clientX, y: p.clientY, at: performance.now() });
        if (this.mode === 'walk' || this.mode === 'ground') {
          if (p.clientX < innerWidth / 2 && t.moveId === null) { t.moveId = p.identifier; t.mx = t.cx = p.clientX; t.my = t.cy = p.clientY; }
          else if (t.lookId === null) { t.lookId = p.identifier; t.lx = p.clientX; t.ly = p.clientY; }
        } else {
          t.steers.set(p.identifier, p.clientX < innerWidth / 2 ? -1 : 1);
          t.steer = last();
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      this.lastInput = performance.now();
      for (const p of e.changedTouches) {
        if (p.identifier === t.moveId) {
          t.cx = p.clientX; t.cy = p.clientY;
          t.move.x = Math.max(-1, Math.min(1, (p.clientX - t.mx) / this.stickR));
          t.move.y = Math.max(-1, Math.min(1, (p.clientY - t.my) / this.stickR));
        } else if (p.identifier === t.lookId) {
          this.look.x += (p.clientX - t.lx) * 1.4;
          this.look.y += (p.clientY - t.ly) * 1.4;
          t.lx = p.clientX; t.ly = p.clientY;
        } else if (t.steers.has(p.identifier)) {
          t.steers.set(p.identifier, p.clientX < innerWidth / 2 ? -1 : 1);
          t.steer = last();
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const p of e.changedTouches) {
        if (p.identifier === t.moveId) { t.moveId = null; t.move.x = 0; t.move.y = 0; }
        if (p.identifier === t.lookId) t.lookId = null;
        if (t.steers.delete(p.identifier)) t.steer = last();
        const s = t.starts.get(p.identifier);
        t.starts.delete(p.identifier);
        if (e.type === 'touchend' && s && performance.now() - s.at < 350 && Math.hypot(p.clientX - s.x, p.clientY - s.y) < 16) this.pressed.add('Tap');
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  _setTouch(on) {
    if (on === this.touchMode) return;
    this.touchMode = on;
    if (this.onMode) this.onMode(on);
  }

  _any() {
    this.lastInput = performance.now();
    if (this.onAny) this.onAny();
  }

  lock() {
    if (this.locked || !this.canvas.requestPointerLock) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch { /* not allowed now */ }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((x) => x && x.connected);
    this.pad = p || null;
    if (!p) return;
    const prev = this._pad.prev;
    p.buttons.forEach((b, i) => {
      if (b.pressed && !prev[i]) { this.pressed.add('Pad' + i); this._any(); this._setTouch(false); }
      prev[i] = b.pressed;
    });
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    this.padAxes = p.axes.map(dz);
    if (this.padAxes.some((v) => v !== 0)) this.lastInput = performance.now();
  }
  padDown(i) { return !!(this.pad && this.pad.buttons[i] && this.pad.buttons[i].pressed); }

  steer() {
    let s = 0;
    if (this.down('KeyA', 'ArrowLeft')) s -= 1;
    if (this.down('KeyD', 'ArrowRight')) s += 1;
    if (this.padAxes) s += this.padAxes[0] || 0;
    if (this.touch.steers.size) { s += this.touch.steer; this.lastInput = performance.now(); }
    return Math.max(-1, Math.min(1, s));
  }

  walk() {
    let x = 0, y = 0;
    if (this.down('KeyA', 'ArrowLeft')) x -= 1;
    if (this.down('KeyD', 'ArrowRight')) x += 1;
    if (this.down('KeyW', 'ArrowUp')) y += 1;
    if (this.down('KeyS', 'ArrowDown')) y -= 1;
    if (this.padAxes) { x += this.padAxes[0] || 0; y -= this.padAxes[1] || 0; }
    x += this.touch.move.x;
    y -= this.touch.move.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  takeLook() {
    let x = this.look.x, y = this.look.y;
    this.look.x = 0;
    this.look.y = 0;
    if (this.padAxes) { x += (this.padAxes[2] || 0) * 14; y += (this.padAxes[3] || 0) * 14; }
    return { x, y };
  }

  // W or up held, the right trigger, or the touch screen's BOOST (a switch there)
  boostHeld() {
    return this.down('KeyW', 'ArrowUp') || this.padDown(7) || this.touch.boost;
  }

  scanHeld() {
    return this.down('Space') || this.padDown(0) || this.touch.scan || (this.mouseDown && !this.locked && this.mode !== 'walk' && this.mode !== 'ground');
  }

  endFrame() {
    this.pressed.clear();
  }
}
