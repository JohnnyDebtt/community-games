// SPDX-License-Identifier: MIT OR Apache-2.0
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');

function harness(seed = 1, saved) {
  let clock = 0;
  const timers = new Map();
  let timerId = 0;
  const elements = new Map();
  const events = {};
  const ctx = new Proxy({}, { get: (_, key) => key.startsWith('create') ? () => ({ addColorStop() {} }) : () => {} });
  function el(id) {
    if (!elements.has(id)) elements.set(id, {
      id, style: { display: 'none' }, textContent: '', innerHTML: '',
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(event, fn) { this[event] = fn; },
      querySelectorAll() { return []; }, querySelector() { return el('child'); },
      appendChild() {}, focus() { sandbox.document.activeElement = this; },
      getContext() { return ctx; },
      getBoundingClientRect() { return { x: 0, y: 0, left: 0, top: 0, width: 480, height: 560 }; }
    });
    return elements.get(id);
  }
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const sandbox = {
    console, Math: math,
    window: { addEventListener(event, fn) { events[event] = fn; } },
    document: { readyState: 'loading', getElementById: el, createElement: el },
    localStorage: { getItem: () => saved || null, setItem(_, value) { saved = value; } },
    Image: class { set src(value) { queueMicrotask(() => this.onload?.()); } },
    performance: { now: () => clock },
    requestAnimationFrame: cb => queueMicrotask(() => { clock += 250; cb(clock); }),
    setTimeout(cb, ms) {
      if (ms === 450) { timers.set(++timerId, cb); return timerId; }
      queueMicrotask(cb);
    },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.createContext(sandbox);
  for (const name of ['audio.js', 'board.js', 'cinematics.js', 'game.js']) vm.runInContext(source(name), sandbox, { filename: name });
  // Rendering is tested in the browser. Keep the real input and initialization.
  vm.runInContext('ResonanceGame.prototype.loop = function() {};', sandbox);
  const game = vm.runInContext('new ResonanceGame()', sandbox);
  return { game, board: game.board, el, sandbox, events, timers, run: code => vm.runInContext(code, sandbox) };
}
const clone = value => JSON.parse(JSON.stringify(value));
function plainBoard(board) {
  board.spiders = [];
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    board.grid[r][c] = (r * 2 + c) % 6;
    board.obeliskHp[r][c] = 0;
    board.frost[r][c] = board.web[r][c] = board.veins[r][c] = false;
  }
}
function playable(h) { h.game.exitLandingCutscene(); }
function fullBoard(board) {
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const tile = board.grid[r][c];
    assert.ok((tile >= 0 && tile <= 9) || tile === -2, `unfilled cell ${c},${r}: ${tile}`);
    if (board.obeliskHp[r][c] > 0) assert.equal(tile, -2);
  }
}


module.exports = { harness, clone, plainBoard, playable, fullBoard };
