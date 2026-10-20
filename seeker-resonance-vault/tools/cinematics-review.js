// SPDX-License-Identifier: MIT OR Apache-2.0
// Standalone local art review. No game instance, storage, rewards or audio.
(async () => {
  const canvas = document.getElementById('scene'), ctx = canvas.getContext('2d');
  const sequence = document.getElementById('sequence'), slider = document.getElementById('time');
  const play = document.getElementById('play'), motion = document.getElementById('low-motion');
  const status = document.getElementById('status'), output = document.getElementById('time-label');
  const cinema = new VaultCinema(), sprites = {};
  let time = 0, playing = false, last = 0;
  try {
    await Promise.all(['capsule','seeker'].map(name => new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => {sprites[name]=image;resolve();};
      image.onerror = () => reject(new Error(`Could not load ${name}`));
      image.src = `../assets/${name}.png`;
    })));
  } catch (error) {status.textContent=error.message;return;}
  function sync() {
    slider.max = sequence.value === 'landing' ? 11 : 17;
    slider.value = time; output.textContent = `${time.toFixed(2)} s`;
    play.textContent = playing ? 'Pause' : 'Play';
    const pose = VaultCinema.pose(sequence.value, motion.checked ? (sequence.value==='landing'?11:17) : time);
    const label = sequence.value==='ending' && pose.t>=16 ? 'Victory card / sample results' : pose.caption;
    if (status.textContent !== label) status.textContent=label;
    cinema.render(ctx,{kind:sequence.value,time,sprites,reducedMotion:motion.checked,
      score:18480,campaign:{unlockedRelics:['a','b','c','d','e','f'],stars:[3,2,3,2,3,2]}});
  }
  sequence.addEventListener('change',()=>{time=0;playing=false;sync();});
  slider.addEventListener('input',()=>{time=Number(slider.value);playing=false;sync();});
  motion.addEventListener('change',sync);
  play.addEventListener('click',()=>{if(time>=Number(slider.max))time=0;playing=!playing;sync();});
  document.getElementById('restart').addEventListener('click',()=>{time=0;playing=true;sync();});
  document.querySelectorAll('[data-time]').forEach(button=>button.addEventListener('click',()=>{
    sequence.value=button.dataset.kind;time=Number(button.dataset.time);playing=false;sync();
  }));
  function frame(now) {
    if (playing) {time=Math.min(Number(slider.max),time+Math.min(0.1,(now-last)/1000));if(time>=Number(slider.max))playing=false;}
    last=now;sync();requestAnimationFrame(frame);
  }
  sync();requestAnimationFrame(frame);
})();
