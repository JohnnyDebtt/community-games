import * as THREE from 'three';
import { U } from '../render/materials.js';
import { clamp } from '../core/math.js';

// The scanner's photograph: taken from the ship's nose, framed on the artifact, through
// the same fog and the same dither as everything else, at 288 x 162 (16:9, 12 x 24 by
// 12 x 13.5). The visor marks its corners. Returned as a JPEG data URL, small enough to
// travel in a Nostr note.

export const PHOTO_W = 288, PHOTO_H = 162;

export function takePhoto(game, a) {
  const ship = game.ship;
  const cam = new THREE.PerspectiveCamera(30, PHOTO_W / PHOTO_H, 0.5, 2600);
  const nose = new THREE.Vector3(0, 1.0, 14).applyMatrix4(ship.root.matrixWorld);
  const focus = a.model.focus.clone().applyMatrix4(a.model.group.matrixWorld);
  cam.position.copy(nose);
  cam.up.set(0, 1, 0);
  cam.lookAt(focus);
  const dist = nose.distanceTo(focus);
  cam.fov = clamp((2 * Math.atan((a.model.span * 1.3) / Math.max(dist, 1)) * 180) / Math.PI, 12, 64);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const px = U.uPxScale.value;
  U.uPxScale.value = PHOTO_H / 2 / Math.tan((cam.fov * Math.PI) / 360);
  // the forest's detail as seen from the nose, then back to the view
  const o = game.world.origin, back = game.cams.cam.position;
  game.world.lods(nose.x + o.x, nose.z + o.z);
  const rgba = game.px.capture(game.scene, cam, PHOTO_W, PHOTO_H, { uFlash: 0, uDrowsy: 0, uBlink: 0, uLetterbox: 0, uFade: 0, uVignette: 0.34 });
  game.world.lods(back.x + o.x, back.z + o.z);
  U.uPxScale.value = px;
  const c = document.createElement('canvas');
  c.width = PHOTO_W;
  c.height = PHOTO_H;
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(rgba, PHOTO_W, PHOTO_H), 0, 0);
  // the visor's corner marks
  ctx.fillStyle = 'rgba(240,242,232,0.8)';
  const m = 8, l = 12;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [PHOTO_W - m, m, -1, 1], [m, PHOTO_H - m, 1, -1], [PHOTO_W - m, PHOTO_H - m, -1, -1]]) {
    ctx.fillRect(sx > 0 ? x : x - l, sy > 0 ? y : y - 1, l, 1);
    ctx.fillRect(sx > 0 ? x : x - 1, sy > 0 ? y : y - l, 1, l);
  }
  return c.toDataURL('image/jpeg', 0.86);
}
