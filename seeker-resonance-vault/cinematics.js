// SPDX-License-Identifier: MIT OR Apache-2.0
// Shared, deterministic 12 fps compositions for the game and local review reel.
// The departure is this community game's interpretation, not an official ending.
class VaultCinema {
  static pose(kind, seconds) {
    const t = Math.floor(Math.max(0, seconds) * 12) / 12;
    const clamp = v => Math.max(0, Math.min(1, v));
    const ease = v => { const p = clamp(v); return p * p * (3 - 2 * p); };
    if (kind === 'landing') {
      const descent = ease(t / 4.8);
      const lift = ease((t - 6.2) / 1.8);
      const walk = ease((t - 8) / 2.5);
      return {
        t, shot: 'surface', shipX: 240, shipY: Math.round(-180 + 480 * descent),
        heroVisible: t >= 6.2, heroX: Math.round(240 - 90 * walk),
        heroFeet: Math.round(350 + 108 * lift), thrust: false,
        dust: clamp(1 - Math.abs(t - 5.2) / 1.1),
        caption: t < 4.8 ? 'DESCENT / THE GLACIAL SHELF' : t < 6.2 ? 'TOUCHDOWN / SYSTEMS SETTLING'
          : t < 8 ? 'LIFT DEPLOYED' : 'A SIGNAL BENEATH THE ICE'
      };
    }
    const walk = ease(t / 2.4), lift = ease((t - 2.4) / 2.1);
    const launch = Math.max(0, t - 6.5);
    return {
      t, shot: t < 10.5 ? 'surface' : 'orbit',
      shipX: t < 10.5 ? 240 : Math.round(294 + Math.min(5.5, t - 10.5) * 4),
      shipY: t < 10.5 ? Math.round(300 - 46 * launch - 32 * launch * launch)
        : Math.round(186 - Math.min(5.5, t - 10.5) * 17),
      heroVisible: t < 4.5, heroX: Math.round(150 + 90 * walk),
      heroFeet: Math.round(458 - 108 * lift),
      thrust: t >= 5.5, dust: t >= 6.5 && t < 8 ? 1 - (t - 6.5) / 1.5 : 0,
      // An explicit cut separates a fixed surface camera from a distant horizon.
      fade: t >= 10 && t < 11 ? 1 - Math.abs(t - 10.5) * 2 : 0,
      caption: t < 2.4 ? 'VAULT SURVEY COMPLETE / RETURN TO CAPSULE'
        : t < 4.5 ? 'BOARDING LIFT / ASCENDING' : t < 6.5 ? 'CABIN SEALED / DEPARTURE READY'
        : t < 10.5 ? 'LIFTOFF / CLEARING THE SURFACE' : 'HIGH ABOVE THE ICE / SIGNAL ARCHIVED'
    };
  }

  stars(ctx, t, reduced) {
    for (let i = 0; i < 42; i++) {
      const x = (i * 137 + 31) % 480, y = (i * 73 + 19) % 360;
      ctx.globalAlpha = reduced ? 0.45 : 0.35 + ((Math.floor(t * 12) + i * 5) % 36) / 120;
      ctx.fillStyle = i % 3 ? '#667389' : '#C2C9C9';
      ctx.fillRect(x, y, i % 7 ? 1 : 2, i % 7 ? 1 : 2);
    }
    ctx.globalAlpha = 1;
  }

  surface(ctx, t, reduced) {
    const sky = ctx.createLinearGradient(0, 0, 0, 460);
    sky.addColorStop(0, '#04060C'); sky.addColorStop(1, '#263345');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 480, 560);
    this.stars(ctx, t, reduced);
    for (const [color, peaks] of [
      ['#353E50', [[0,350],[65,296],[120,338],[190,282],[265,328],[350,270],[425,323],[480,302]]],
      ['#20242A', [[0,400],[80,368],[160,395],[230,359],[300,402],[390,363],[480,398]]],
      ['#181C20', [[0,462],[75,450],[145,458],[330,458],[395,447],[480,464]]]
    ]) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(0,560);
      for (const [x,y] of peaks) ctx.lineTo(x,y);
      ctx.lineTo(480,560); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#94A6B1'; ctx.fillRect(144,458,192,2);
    ctx.fillStyle = '#313C43'; ctx.fillRect(226,454,28,4);
    ctx.fillStyle = '#667389'; ctx.fillRect(230,454,20,1);
  }

  orbit(ctx, t, reduced, horizon = 380) {
    ctx.fillStyle = '#04060C'; ctx.fillRect(0,0,480,560);
    this.stars(ctx, t, reduced);
    // Only a shallow limb is visible: no tiny full planet beside a giant ship.
    const radius = 1050, cy = horizon + radius;
    for (const [r, color] of [[radius + 5,'#263E4B'],[radius + 2,'#94A6B1'],[radius,'#353E50'],[radius - 6,'#20242A']]) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(240,cy,r,0,Math.PI*2); ctx.fill();
    }
  }

  ship(ctx, image, x, y, thrust, t, reduced) {
    const left = Math.round(x - 27), top = Math.round(y);
    if (thrust) {
      const frame = reduced ? 0 : Math.floor(t * 12) % 4;
      for (const offset of [10,42]) {
        ctx.fillStyle = '#4F5D73'; ctx.fillRect(left+offset-3,top+54,6,18+frame*3);
        ctx.fillStyle = '#94A6B1'; ctx.fillRect(left+offset-2,top+54,4,12+frame*2);
        ctx.fillStyle = '#D6EDF5'; ctx.fillRect(left+offset-1,top+54,2,7+frame);
      }
    }
    // Verified upstream 54×154 capsule; never stretch or shrink its pixel grid.
    if (image) ctx.drawImage(image,0,0,54,154,left,top,54,154);
    else {
      ctx.fillStyle='#313C43'; ctx.fillRect(left+4,top+6,46,44);
      ctx.fillStyle='#C2C9C9'; ctx.fillRect(left+14,top+12,26,22);
      ctx.fillStyle='#667389'; ctx.fillRect(left+25,top+50,4,104);
    }
  }

  hero(ctx, image, x, feet, t, moving) {
    const frame = moving ? Math.floor(t*12)%4 : 0;
    if (image) ctx.drawImage(image,frame*32,0,32,32,Math.round(x-16),Math.round(feet-28),32,32);
    else { ctx.fillStyle='#B9A87B'; ctx.fillRect(Math.round(x-5),Math.round(feet-12),10,12); }
  }

  label(ctx, text, x, y, color = '#ABE3D9', size = 11, align = 'center') {
    ctx.fillStyle=color; ctx.font=`${size}px monospace`; ctx.textAlign=align; ctx.textBaseline='middle';
    ctx.fillText(text,x,y);
  }

  button(ctx, text, x, y, width) {
    ctx.fillStyle='#182436'; ctx.fillRect(x,y,width,42);
    ctx.strokeStyle='#667389'; ctx.lineWidth=1; ctx.strokeRect(x+0.5,y+0.5,width-1,41);
    this.label(ctx,text,x+width/2,y+21,'#DFE6E6');
  }

  render(ctx, options) {
    const {kind, time, sprites = {}, reducedMotion = false, score = 0, campaign = {}} = options;
    const pose = VaultCinema.pose(kind, reducedMotion ? (kind === 'landing' ? 11 : 17) : time);
    const t = pose.t;
    ctx.save(); ctx.imageSmoothingEnabled=false;
    if (kind === 'ending' && t >= 16) {
      this.orbit(ctx,t,reducedMotion,314);
      this.ship(ctx,sprites.capsule,320,124,true,t,reducedMotion);
      this.label(ctx,'THEOREM / EXPEDITION 048',240,35,'#94A6B1',10);
      this.label(ctx,'RESONANCE VAULT',240,65,'#DEB874',24);
      this.label(ctx,'EXPEDITION COMPLETE',240,93,'#ABE3D9',12);
      this.label(ctx,'THE VAULT IS QUIET.',38,173,'#C2C9C9',12,'left');
      this.label(ctx,'THE SIGNAL REMAINS.',38,195,'#94A6B1',11,'left');
      this.label(ctx,'THANKS FOR PLAYING',240,293,'#DEB874',15);
      ctx.fillStyle='#0B101A'; ctx.fillRect(32,326,416,100);
      const stats = [
        ['SURVEY DEPTH','1,051 m'],
        ['RESONANCE',score.toLocaleString()],
        ['RELICS / STARS',`${campaign.unlockedRelics?.length || 0}/6  /  ${(campaign.stars || []).reduce((a,b)=>a+b,0)}/18`]
      ];
      stats.forEach(([name,value],i)=>{
        this.label(ctx,name,48,347+i*28,'#94A6B1',10,'left');
        this.label(ctx,value,432,347+i*28,'#DEB874',12,'right');
      });
      this.button(ctx,'REPLAY',35,456,128);
      this.button(ctx,'ENDLESS',176,456,128);
      this.button(ctx,'CHAMBERS',317,456,128);
      this.label(ctx,'A COMMUNITY EXPEDITION / @QuillshiftGame',240,532,'#94A6B1',10);
      ctx.restore(); return;
    }
    if (pose.shot === 'surface') this.surface(ctx,t,reducedMotion);
    else this.orbit(ctx,t,reducedMotion);
    this.ship(ctx,sprites.capsule,pose.shipX,pose.shipY,pose.thrust,t,reducedMotion);
    if (pose.heroVisible) {
      const onLift = kind === 'landing' ? t < 8 : t >= 2.4;
      ctx.save();
      if (onLift) {
        // The cabin occludes the passenger as the rail lift crosses its hatch.
        ctx.beginPath(); ctx.rect(0,pose.shipY+54,480,560); ctx.clip();
        ctx.fillStyle='#667389'; ctx.fillRect(pose.heroX-8,pose.heroFeet,16,2);
      }
      this.hero(ctx,sprites.seeker,pose.heroX,pose.heroFeet,t,kind==='landing' ? t>=8 && t<10.5 : t<2.4);
      ctx.restore();
    }
    if (pose.dust > 0 && !reducedMotion) {
      ctx.globalAlpha=pose.dust*0.6; ctx.fillStyle='#94A6B1';
      for (let i=0;i<14;i++) {
        const spread=1-pose.dust;
        ctx.fillRect(Math.round(240+(i-6.5)*(5+spread*12)),Math.round(456-(i%3)*4-spread*12),4,2);
      }
      ctx.globalAlpha=1;
    }
    if (pose.fade) {ctx.globalAlpha=pose.fade;ctx.fillStyle='#04060C';ctx.fillRect(0,0,480,560);ctx.globalAlpha=1;}
    ctx.fillStyle='#080D16';ctx.fillRect(20,495,440,34);
    this.label(ctx,pose.caption,240,512,'#ABE3D9',10);
    if (kind === 'ending' || t < 10.5) {
      ctx.fillStyle='#121824';ctx.fillRect(380,12,90,30);
      this.label(ctx,'SKIP >',425,27,'#C2C9C9',11);
    }
    ctx.restore();
  }
}
