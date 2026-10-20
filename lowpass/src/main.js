import { Game } from './game.js';

// Low Pass: a slow survey flight over an endless fog forest on The Seeker's planet.

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
