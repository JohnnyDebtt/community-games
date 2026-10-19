import { Game } from './game/game.js';

// Soundings: a quiet fishing game on the frozen sea of The Seeker's planet.

function fail(msg) {
  const el = document.createElement('div');
  el.className = 'loading';
  el.style.textTransform = 'none';
  el.style.letterSpacing = '0.04em';
  el.textContent = msg;
  document.getElementById('ui').append(el);
}

const probe = document.createElement('canvas').getContext('webgl2');
if (!probe) {
  fail('Soundings needs WebGL 2. Try a current version of Firefox, Chrome, Edge or Safari.');
} else {
  const game = new Game();
  window.__game = game;
  game.init().catch((e) => {
    console.error(e);
    fail('Something went wrong while starting. Reloading the page usually helps.');
  });
}

// Development: ?dev adds window.__shot(name, w, h), which renders one frame at w x h
// art pixels and saves it through the local server (tools/serve.mjs) to .shots/.
if (new URLSearchParams(location.search).has('dev')) {
  // SEEKER NET events by hand, to see them without waiting for the chain
  window.__spark = (charge = 600, personal = false) => window.__game.events.test(charge, personal);
  window.__surge = () => window.__game.events.surge({ token: window.__game.state.companion, charge: 12, pool: 'activated' });
  window.__wake = (token) => window.__game.events.addBeacon(token || window.__game.net.activatedIds().find((id) => !window.__game.state.roster.includes(id)), Date.now(), true);
  window.__od = () => { window.__game.state.od.charge = 1; };
  window.__shot = async (name = 'shot', w = 480, h = 270, upscale = 3) => {
    const g = window.__game;
    const r = g.px.renderer;
    const prev = [g.px.width, g.px.height];
    r.setSize(w, h, false);
    g.cam.setAspect(w / h);
    g.cam.update(0.016, g.player.pos, g.player.facing);
    r.render(g.scene, g.cam.cam);
    const src = r.domElement;
    const out = document.createElement('canvas');
    out.width = w * upscale;
    out.height = h * upscale;
    const ctx = out.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, w, h, 0, 0, w * upscale, h * upscale);
    const url = out.toDataURL('image/png');
    r.setSize(prev[0], prev[1], false);
    g.cam.setAspect(prev[0] / prev[1]);
    const res = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
    return res.ok;
  };
}
