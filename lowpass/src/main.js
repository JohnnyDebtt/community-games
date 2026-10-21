import { Game } from './game.js';
import { BUILD } from './build.js';

// Low Pass: a slow survey flight over an endless fog forest on The Seeker's planet.

// A browser bringing back an old tab can hand over an old stylesheet with new code (and
// then the interface is all in pieces): fetch the one this code goes with, and let the
// old one go once it is in.
function matchStyle() {
  const link = document.querySelector('link[rel="stylesheet"]');
  if (!link) return;
  const check = () => {
    const has = getComputedStyle(document.documentElement).getPropertyValue('--build').trim().replace(/"/g, '');
    if (has === BUILD) return;
    const next = document.createElement('link');
    next.rel = 'stylesheet';
    next.href = `style.css?v=${BUILD}&r=${Date.now().toString(36)}`;
    next.onload = () => link.remove();
    link.after(next);
  };
  if (link.sheet) check(); else link.addEventListener('load', check, { once: true });
}
matchStyle();

function fail(msg) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.style.textTransform = 'none';
  el.textContent = msg;
  document.getElementById('ui').append(el);
}

const probe = document.createElement('canvas').getContext('webgl2');
if (!probe) {
  fail('Low Pass needs WebGL 2. Try a current version of Firefox, Chrome, Edge or Safari.');
} else {
  const game = new Game();
  window.__game = game;
  game.init().catch((e) => {
    console.error(e);
    fail('Something went wrong while starting. Reloading the page usually helps.');
  });
}
