// Keyboard, mouse, touch and gamepad folded into a few actions.
//
//   axis      movement (-1..1, -1..1): WASD / arrows / left stick / touch stick
//   look      camera drag this frame (pixels): mouse drag / right stick / touch drag
//   zoom      wheel this frame
//   buttons   action, interact, back, codex, net, up, down, run, sense, map
//             each with .down (held), .pressed (this frame), .released (this frame)

const KEYMAP = {
  Space: 'action', Enter: 'action',
  KeyE: 'interact', KeyF: 'device',
  Escape: 'back', Backspace: 'back',
  Tab: 'codex', KeyJ: 'codex', KeyC: 'codex',
  KeyN: 'net', KeyR: 'release',
  ShiftLeft: 'run', ShiftRight: 'run',
  KeyV: 'sense', KeyB: 'bait', KeyL: 'lantern',
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  KeyQ: 'overdrive', KeyZ: 'turnL', KeyX: 'turnR',
};

const NAMES = ['action', 'interact', 'device', 'back', 'codex', 'net', 'release', 'run', 'sense', 'bait', 'lantern',
  'up', 'down', 'left', 'right', 'turnL', 'turnR', 'mouse', 'mouse2', 'overdrive'];

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.b = {};
    for (const n of NAMES) this.b[n] = { down: false, pressed: false, released: false, src: new Set() };
    this.axis = { x: 0, y: 0 };
    this.look = { x: 0, y: 0 };
    this.zoom = 0;
    this.touchStick = { x: 0, y: 0, active: false };
    this.lastDevice = 'keyboard';
    this.blocked = false;          // a menu has focus: world input is ignored
    this._drag = null;
    this._pending = [];
    this._gpPrev = {};

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const n = KEYMAP[e.code];
      if (n) {
        if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
        this._set(n, true, 'k:' + e.code);
        this.lastDevice = 'keyboard';
      }
    });
    addEventListener('keyup', (e) => {
      const n = KEYMAP[e.code];
      if (n) this._set(n, false, 'k:' + e.code);
    });
    addEventListener('blur', () => this.releaseAll());

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return this._touchDown(e);
      canvas.setPointerCapture(e.pointerId);
      this._drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, button: e.button };
      this._set(e.button === 2 ? 'mouse2' : 'mouse', true, 'm');
      this.lastDevice = 'keyboard';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return this._touchMove(e);
      const d = this._drag;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      d.moved += Math.abs(dx) + Math.abs(dy);
      this.look.x += dx;
      this.look.y += dy;
    });
    const up = (e) => {
      if (e.pointerType === 'touch') return this._touchUp(e);
      if (!this._drag || this._drag.id !== e.pointerId) return;
      this._set(this._drag.button === 2 ? 'mouse2' : 'mouse', false, 'm');
      this._drag = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 0.5);
    }, { passive: false });

    this._touches = new Map();
  }

  get dragging() {
    return !!this._drag && this._drag.moved > 6;
  }

  _set(name, down, src) {
    const b = this.b[name];
    if (!b) return;
    if (down) {
      if (!b.src.size) this._pending.push([name, true]);
      b.src.add(src);
    } else {
      if (!b.src.has(src)) return;
      b.src.delete(src);
      if (!b.src.size) this._pending.push([name, false]);
    }
  }

  // UI buttons (touch controls) press and release actions through this.
  virtual(name, down) {
    this._set(name, down, 'v');
    this.lastDevice = 'touch';
  }

  releaseAll() {
    for (const n of NAMES) {
      const b = this.b[n];
      if (b.src.size) {
        b.src.clear();
        this._pending.push([n, false]);
      }
    }
    this.touchStick.active = false;
    this.touchStick.x = this.touchStick.y = 0;
  }

  // --- touch: left half is a floating stick, right half drags the camera
  _touchDown(e) {
    e.preventDefault();
    this.lastDevice = 'touch';
    const left = e.clientX < innerWidth * 0.42;
    const t = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, kind: left ? 'stick' : 'look', moved: 0 };
    this._touches.set(e.pointerId, t);
    if (left) this.touchStick.active = true;
    if (this.onTouchStick) this.onTouchStick(t);
  }
  _touchMove(e) {
    const t = this._touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    t.x = e.clientX;
    t.y = e.clientY;
    t.moved += Math.abs(dx) + Math.abs(dy);
    if (t.kind === 'stick') {
      const R = 46;
      let sx = (t.x - t.x0) / R, sy = (t.y - t.y0) / R;
      const l = Math.hypot(sx, sy);
      if (l > 1) { sx /= l; sy /= l; }
      this.touchStick.x = sx;
      this.touchStick.y = sy;
      if (this.onTouchStick) this.onTouchStick(t);
    } else {
      this.look.x += dx * 1.2;
      this.look.y += dy * 1.2;
    }
  }
  _touchUp(e) {
    const t = this._touches.get(e.pointerId);
    if (!t) return;
    this._touches.delete(e.pointerId);
    if (t.kind === 'stick') {
      this.touchStick.active = false;
      this.touchStick.x = this.touchStick.y = 0;
      if (this.onTouchStick) this.onTouchStick(null);
    } else if (t.moved < 10 && this.onTap) {
      this.onTap(e.clientX, e.clientY);
    }
  }

  _pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    if (!gp) return null;
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
    const map = { 0: 'action', 1: 'back', 2: 'interact', 3: 'device', 8: 'codex', 9: 'net', 4: 'turnL', 5: 'overdrive',
      6: 'down', 7: 'up', 12: 'up', 13: 'down', 10: 'run', 11: 'sense' };
    for (const [i, name] of Object.entries(map)) {
      const pressed = !!(gp.buttons[i] && gp.buttons[i].pressed);
      if (pressed !== !!this._gpPrev[i]) {
        this._set(name, pressed, 'g' + i);
        if (pressed) this.lastDevice = 'gamepad';
      }
      this._gpPrev[i] = pressed;
    }
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (lx || ly || rx || ry) this.lastDevice = 'gamepad';
    return { lx, ly, rx, ry };
  }

  // Call once at the start of each frame.
  update(dt) {
    for (const n of NAMES) {
      this.b[n].pressed = false;
      this.b[n].released = false;
    }
    const gp = this._pollGamepad();
    for (const [n, down] of this._pending) {
      const b = this.b[n];
      if (down && !b.down) b.pressed = true;
      if (!down && b.down) b.released = true;
      b.down = down;
    }
    this._pending.length = 0;
    let x = (this.b.right.down ? 1 : 0) - (this.b.left.down ? 1 : 0);
    let y = (this.b.down.down ? 1 : 0) - (this.b.up.down ? 1 : 0);
    if (this.touchStick.active) {
      x = this.touchStick.x;
      y = this.touchStick.y;
    }
    if (gp) {
      if (gp.lx || gp.ly) { x = gp.lx; y = gp.ly; }
      this.look.x += gp.rx * 900 * dt;
      this.look.y += gp.ry * 600 * dt;
    }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    this.axis.x = x;
    this.axis.y = y;
  }

  // Call at the end of each frame.
  endFrame() {
    this.look.x = this.look.y = 0;
    this.zoom = 0;
  }

  pressed(n) { return !this.blocked && this.b[n].pressed; }
  down(n) { return !this.blocked && this.b[n].down; }
  released(n) { return this.b[n].released; }
}
