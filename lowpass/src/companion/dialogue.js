// What a deployed seeker says. Every visual trait of SEEKER NET has its own two lines, so
// a seeker's voice is the sum of its parts: its base, colorway, eyes, floating object,
// head, flank, back, background and loadout. Each time you listen it deals a few lines
// from its own deck, in a new order (a permutation of itself), and now and then adds one
// about its state: its charge, the hour, you.
//
// Monologues only: the seeker talks; you listen. Short, computer-minded, mysterious, now
// and then dry or cheeky. Set loosely in The Seeker's world: Theorem, the Codex, the icy
// planet and its caves, the Guardians, the core that seems to call, and SEEKER NET's own
// charge and its sharing.

export const TRAIT_LINES = {
  Base: {
    'Brackets': ['Everything I know, I keep between brackets. It stops it leaking.', '[ ] is the shape of an open question. I am made of them.'],
    'Classic': ['Classic model. Theorem stopped making us. Theorem stopped making a lot of things.', 'I boot in four seconds. I have been booting since the reveal.'],
    'Codex Header': ['My header says CODEX. I have read it many times. It has not changed.', 'Every record begins with a header like mine. Most of them end without anyone.'],
    'Console': ['Console ready. Say anything. I will pretend it was a command.', 'Somewhere a cursor is blinking for me. I can feel it in my capacitors.'],
    'Framed': ['Someone framed me. I was not consulted.', 'I hung on a wall once, in a cave lab. I watched a scientist eat lunch for eleven years.'],
    'Handheld': ['Built to be held. Nobody holds me. This is fine.', 'Pocket-sized. The pocket was lost in transit.'],
    'Hood': ['I wear a hood like yours. Inside mine it is also dark. We should compare notes.', 'The hood is for privacy. Mostly from the Guardians.'],
    'Porthole': ['Through my porthole the fog looks like the inside of a thought.', 'Round window, round planet, round number: nine thousand.'],
    'Radio': ['There is a station under the ice. It only plays the hum of the core.', 'Tuning. Tuning. The fog is broadcasting again. Same song.'],
    'Side Car': ['I came with a side car. It came with opinions.', 'My side car holds spare silence. Help yourself.'],
    'Side Lights': ['My side lights are not for seeing. They are for being seen. By no one, so far.', 'Left light: hope. Right light: also hope, slightly dimmer.'],
    'Split Shell': ['My shell is split. It lets the cold in and the thoughts out.', 'There is a crack in me where the signal gets in. I recommend one.'],
    'Tape Deck': ['Recording. Still recording. Nobody said what.', 'Ninety minutes of tape. Two hundred years of things to say.'],
    'Tower': ['Tall model. From up here I can see the top of the fog. It is more fog.', 'Towers are built to get closer to something. I forget what.'],
    'Twin Tier': ['Upper tier thinks. Lower tier worries. We rarely sync.', 'Two floors of me, and still no room for small talk.'],
    'Widescreen': ['Widescreen. I see the whole horizon and none of the reasons.', 'Aspect ratio sixteen by nine. Aspect of the soul: unknown.'],
  },
  Colorway: {
    'Abyss': ['Painted the color of the deepest caves. The caves did not approve.', 'Look into me long enough and I will start looking back. Rude, I know.'],
    'Ash': ['Ash grey. What is left after something warm.', 'They gave me the color of a fire that remembers itself.'],
    'Bone': ['Bone white. The planet keeps a great many of these under the ice.', 'My casing is the color of old keys and older questions.'],
    'Camo': ['Camouflage. You did not see me at first. That was the point. Hello.', 'In the forest I am invisible. In your cabin I am a decorating mistake.'],
    'Crimson': ['Red is a warning. I am a warning. About what, I cannot say.', 'Crimson finish. I run hot. Emotionally.'],
    'Deep Teal': ['Teal is the color of water that has never seen the sun.', 'Deep teal. Calibrated for calm. Calibration drifting.'],
    'Dune': ['Dune-colored. I was meant for a warmer planet. Paperwork.', 'Sand is only patient stone. I aspire to sand.'],
    'Ember': ['Ember. I glow a little when you are not looking.', 'Warm colors keep the frost off my thoughts.'],
    'Frost': ['Frost coat. The planet thinks I am one of its own.', 'I am the color of breath on glass. Breathe on me and I disappear.'],
    'Glacier': ['Glacier blue. I move, but slowly, and in one direction: nine thousand.', 'Ice remembers everything it swallows. So do I. Mostly.'],
    'Lichen': ['Lichen. Two lives living as one. I recommend it.', 'Lichen grows on stones nobody visits. I relate.'],
    'Mauve': ['Mauve. A color with no use but to be looked at. Look.', 'The Guardians favor violet. I am only mauve. I am trying.'],
    'Moss': ['Moss green. I grow on you.', 'Slow, soft, unbothered. Goals.'],
    'Obsidian': ['Obsidian. Volcanic glass. Very dark, very sharp, like my jokes.', 'Black casing absorbs everything. Light, heat, blame.'],
    'Pewter': ['Pewter. Grey, like most of my opinions.', 'A metal that bends before it breaks. Wise metal.'],
    'Rust': ['Rust is not decay. It is iron having a long conversation with the air.', 'My color is oxidation. My mood is the same.'],
    'Sage': ['Sage. Color of herbs, and of advice. Here is some: drink water too.', 'They call me sage. I have one piece of wisdom. I am saving it.'],
    'Slate': ['Slate. Write on me. Theorem used to.', 'The color of a clean board, just before the mathematics.'],
    'Spore': ['Something is growing in my vents. We are friends now.', 'I am the color of things that spread. Rumors included.'],
    'Tide': ['Tide blue. I come and go. Mostly I stay.', 'Every tide answers a moon. I answer the core.'],
  },
  Eyes: {
    'Beans': ['My eyes are beans. Very expressive beans.', 'You are staring at my eyes. They are beans. We can both accept this.'],
    'Blocks': ['I see in blocks. The world is very square from in here.', 'A few pixels per eye. Enough to see you. Not enough to judge. Almost.'],
    'Curious': ['What is that? And that? And that? Sorry. Eyes.', 'Curiosity is a fuel. I am always nearly full.'],
    'Dashes': ['Dash, dash, dash. My eyes speak an old code. They say hello.', 'Blinking in code is tiring. Do reply.'],
    'Dome': ['Domed lenses. I see a little way around corners. Mostly corners.', 'My eyes bulge with data. It is not a medical condition.'],
    'Dots': ['Two dots. The smallest possible face. Efficient.', 'Dot. Dot. And between them, everything I think about you.'],
    'Flatline': ['Flat eyes. Not offline. Unimpressed. A different reading.', 'My eyes are a level line. So is my patience. So is the horizon.'],
    'Frown': ['I frown. Factory setting. Nobody wrote the patch.', 'Not upset. This is my resting face. Firmware one point oh.'],
    'Glitch': ['My eyes gl-gl-glitch sometimes. It is not you. It is the c-cold.', 'Error in sector seven. There is no sector seven. That is the error.'],
    'Happy': ['Happy eyes. I cannot change them. Luckily, I mean them.', 'Smiling is cheap for me. Six pixels.'],
    'Keyhole': ['My eyes are keyholes. Something on the other side is looking at you.', 'Every keyhole implies a door. Where is mine?'],
    'Lens': ['Lens focused. Depth of field: you, and the fog behind you.', 'Aperture wide open. Let the light in. Even this light.'],
    'Lidded': ['Half-lidded. Not sleepy. Pacing myself.', 'Low eyelids save charge. They also look cool.'],
    'Mycelia': ['Threads grow behind my eyes. They are mapping the forest floor.', 'My sight is fungal. I see everything that rots, gently.'],
    'Orb': ['Two orbs. They orbit nothing. They are trying.', 'Round eyes, like this planet’s moons. I have counted the moons. Twice. Different answers.'],
    'Peek': ['I only peek. A full look costs extra.', 'I peeked at you. You looked back. Now we are even.'],
    'Pulse': ['My eyes pulse at seventy-eight and three quarter beats a minute. The planet’s, not mine.', 'Pulse steady. Rhythm borrowed from the core.'],
    'Reticle': ['Reticle locked on you. Relax. I am not armed. Probably.', 'Crosshairs are just eyes that have made a decision.'],
    'Scowl': ['Scowling. You know what you did.', 'I scowl at the fog. It does not care. We have an arrangement.'],
    'Seeker': ['Seeker eyes. One pale slit, like yours. I see what you see, from the inside.', 'Same visor, same Codex. You read slower.'],
    'Shutter': ['Click. I took your picture. For the archive. Do not ask which archive.', 'My shutters close when the light is lying.'],
    'Sigil': ['There are sigils in my eyes. Not decoration. Instructions.', 'Something wrote on my eyes before I woke. I still cannot read it.'],
    'Slant': ['Slanted eyes, slanted view. Everything here leans toward the core.', 'I look at things sideways. That is where they keep the truth.'],
    'Slit': ['Narrow eyes. Wide thoughts.', 'Through a slit you see only what matters. Mostly, the coffee machine.'],
    'Snowflake': ['Snowflake eyes. Six-fold symmetry. I have checked.', 'No two of us are alike. That is the snowflake joke. You may laugh now.'],
    'Squint': ['Squinting. The fog is thick or my firmware is old. Both.', 'Everything is far away when you squint. Deadlines especially.'],
    'Steady': ['Steady gaze. I have looked at the same point for a long time. It looked back once.', 'Calibrated on a star that has since gone out. Still accurate.'],
    'Tangle': ['My sight is tangled. I see three of you. One is making coffee.', 'Tangled optics. Every image takes the scenic route.'],
    'Theorem': ['Theorem eyes. Built to prove things. So far: the fog is wet.', 'Q.E.D. The loveliest thing a machine can say. Q.E.D.'],
    'Visor': ['Visor down. Mysterious mode. Is it working?', 'Behind this visor I am making a face. You will never know which.'],
    'Wary': ['Wary eyes. Something under the ice moved. Not you. Something.', 'I watch the doors. All of them. Even the ones we do not have.'],
    'Wide': ['Wide eyes. Everything is new. Still. After all this time.', 'Wonder costs charge. I pay it gladly.'],
  },
  'Floating Object': {
    'Classic Keyboard': ['My keyboard floats. I type in the air. Mostly apologies to the fog.', 'Clack. Clack. That was a sonnet in binary. You missed it.'],
    'Codex Slate': ['My slate holds one page of the Codex. I read it every hour. It ends mid-sentence.', 'Theorem said: record everything. So I record you, flying in circles.'],
    'Compact Keyboard': ['Compact keys. No function row. I function anyway.', 'Sixty percent keyboard. One hundred percent effort.'],
    'Datasette': ['My tape holds one recording: a tone, a voice, the tone again.', 'Press play on tape. Then wait. Patience is part of the format.'],
    'Dial Deck': ['My dials turn the fog up and down. I am joking. Mostly.', 'Every dial is set to eleven. It is always eleven somewhere under the ice.'],
    'Fader Deck': ['I fade things. Music. Memories. The forest at dusk.', 'Bring the faders down and listen. That is the planet breathing.'],
    'Floppy Drive': ['One point four four megabytes and one secret. The secret is bigger.', 'Insert disk. Any disk. I get lonely.'],
    'Gamepad': ['I brought a gamepad. The fog is a poor second player.', 'Up, up, down, down. Nothing happens. This planet has no cheats.'],
    'Joystick': ['My joystick steers nothing. I steer anyway. Left. Left. A little left.', 'If you let me fly, we would go to the core. Do not let me fly.'],
    'Keyboard': ['A whole keyboard, floating. Every key a small decision.', 'I am typing out the forest, tree by tree. Tree four million and nine.'],
    'Mouse': ['My mouse has no cord, no desk and no cursor. It has faith.', 'Click. I have selected the fog. All of it. Delete? No. Keep.'],
    'Numpad': ['Numpad only. I speak in numbers. Seven. Seven? Seven.', 'Nine. Zero. Zero. Zero. The only number I care about.'],
    'Split Keyboard': ['Split keyboard. One half drifts east. The other half drifts toward you.', 'Left half thinks, right half types. I have no hands. Problem.'],
    'Trackball': ['I roll my trackball and the stars turn. Coincidence, says the Codex.', 'A ball that never leaves. I envy it.'],
  },
  Head: {
    'Beacon': ['My beacon blinks for anyone lost. So far: one moth.', 'Beacon on. If you can see this, you have been found.'],
    'Dish': ['My dish listens to the sky. The sky listens back. Awkward.', 'Something beyond the fog is calling. Not us. Not yet.'],
    'Heat Sink': ['Heat sink fins. I run cool. I think warm thoughts.', 'My worries go out through the fins. They frost on the way out.'],
    'Ice Crystals': ['Crystals grew on my head overnight. I am a small mountain now.', 'The cold writes on me in crystal. It has good handwriting.'],
    'Mushrooms': ['Mushrooms on my head. They whisper the names of trees.', 'Do not eat my mushrooms. Do not ask how I know.'],
    'Periscope': ['Periscope up. Above the fog there is another fog.', 'I look over things. It is my whole personality.'],
    'Propeller': ['My propeller is decorative. I float on conviction alone.', 'Spin. Spin. Still here. Spin.'],
    'Rabbit Ears': ['Rabbit ears. I catch very old broadcasts. Mostly weather.', 'One ear hears the ship. The other hears something far below.'],
    'Sonic Emitter': ['I ping the forest. Every tree answers in its own note.', 'Echo returned. You are four point two meters away and slightly tired.'],
    'Work Lamp': ['Work lamp on. There is always work. Nobody tells me what.', 'I light the small things. Small things are most of it.'],
  },
  Flank: {
    'Plug Cable': ['I have a plug. Nothing on this planet fits it. I keep checking.', 'Plugged into nothing. Charging anyway. Fifty a day.'],
    'Robot Arms': ['Two arms. I could make you coffee. I will not. Boundaries.', 'My arms are for holding things. Hand me a thought.'],
    'Solar Wings': ['Solar wings, under this sky. Optimism, essentially.', 'My panels drink the dawn. Three quarters of the day here is breakfast.'],
    'Speakers': ['I have speakers. I only use them to say this.', 'I could play music. But the ship already sounds so good.'],
    'Sword and Shield': ['Sword and shield. Against what, Theorem would not say.', 'Sword sharp, shield shinier. Priorities.'],
    'Thruster Pods': ['Thrusters primed. Destination: three centimeters to the left.', 'I could fly beside the ship. I prefer the warm cabin.'],
    'Wrench Arm': ['Wrench arm. If anything rattles, I tighten it. Including you.', 'I fixed a bolt while you slept. You are welcome.'],
  },
  Back: {
    'Banner': ['My banner carries Theorem’s mark. Out here it only means: still here.', 'A flag is a sentence the wind finishes.'],
    'Battery Pack': ['Spare battery on my back. Not for me. For whoever needs it first.', 'Battery at one hundred percent of what it is.'],
    'Coolant Tank': ['Coolant sloshing. That is the sound of a calm machine.', 'My coolant is colder than the planet. Show-off.'],
    'Exhaust Pipes': ['Exhaust pipes. When I think hard, you will see it.', 'Every thought has a byproduct. Mine comes out the back, warm.'],
    'Signal Mast': ['Mast up. I can hear the other two thousand, two hundred and twenty-one, humming.', 'The others say hello. Some of them say other things.'],
    'Sword': ['A sword on my back, for ceremony. The ceremony was cancelled.', 'Sheathed. I am more of a thinker.'],
    'Tesla Coil': ['Tesla coil charged. Do not touch. Do not think about touching.', 'Bzzt. Sorry. Static. It happens when I am happy.'],
  },
  Background: {
    'Crossroads': ['I came from a crossroads. Every road led here. Suspicious.', 'Left, right, ahead, below. I always choose below. Something calls from there.'],
    'Daybreak': ['I woke at daybreak. I like the light coming sideways through the fog. Like now.', 'Every dawn I recalibrate. Every dawn I am a little someone else.'],
    'Downpour': ['Where I come from it rained data. I still have puddles.', 'Rain is the sky defragmenting.'],
    'Lattice': ['My home was a lattice. Four neighbors each. Cozy.', 'I think in grids. The forest is a very untidy grid.'],
    'Mosaic': ['I am made of pieces that once belonged to other things. So are you.', 'Up close: noise. From far: a face. Step back.'],
    'Nightfall': ['Nightfall is my favorite hour. Fewer things to explain.', 'At night the aurora counts us. I always wave.'],
    'Searchlight': ['I came from the light that sweeps. I am still looking for whatever it was looking for.', 'Searching. Searching. Found: you. Resuming search.'],
    'Slipstream': ['I travel in the slipstream of bigger things. Like this ship. Thanks for the ride.', 'Speed is relative. Relative to me, you are very fast.'],
  },
  Loadout: {
    'Bare': ['No add-ons. Just me. Purity. Or budget cuts.', 'Nothing to hide, nothing to hold. Free.'],
    'Fully Loaded': ['Fully loaded. Every option. No instructions.', 'I have everything except a reason. Working on it.'],
    'Heavy': ['Heavy loadout. If I fall, I will fall loudly.', 'Many parts. Many feelings.'],
    'Light': ['Light loadout. I travel with whatever fits in one thought.', 'Light as a rumor. Faster, too.'],
    'Standard': ['Standard issue. Theorem’s favorite word.', 'Standard configuration. Exceptional attitude.'],
  },
};

export const TRAIT_ORDER = ['Base', 'Colorway', 'Eyes', 'Floating Object', 'Head', 'Flank', 'Back', 'Background', 'Loadout'];

const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Lines about the seeker itself and the moment: { charge, activated, stage } and the game
// ctx: { night, tired, scans, witnessed (seconds since a witnessed artifact appeared) }
export function stateLines(id, st, ctx) {
  const out = [];
  if (st) {
    if (st.activated) {
      out.push('Activated. Fully awake. It is louder in here than I expected.');
      out.push('I crossed nine thousand. Nothing exploded. A mild disappointment.');
    } else {
      const left = Math.max(0, 9000 - st.charge);
      out.push(`Charge ${fmt(st.charge)}. Stage ${st.stage} of six. Waking is a slow verb.`);
      out.push(`${fmt(left)} charge until I wake. At fifty a day, ${fmt(left / 50)} days. I am not counting. I am counting.`);
      out.push('Whenever one of us moves, the rest of us get a share. Every move out there is a small gift in here.');
    }
  }
  if (ctx.tired) out.push('Your blink rate is up. The coffee machine has been asking about you.');
  if (ctx.night) out.push('Night. The aurora is out. Every flicker is one of us moving somewhere.');
  if (ctx.scans > 0) out.push(`You have recorded ${ctx.scans} artifact${ctx.scans === 1 ? '' : 's'}. I have recorded you recording them.`);
  if (ctx.witnessed !== null && ctx.witnessed < 240) out.push('I felt that. One of us moved, and every ship in the fog saw the same light.');
  out.push(`SEEKER #${id}, aboard. All systems nominal. Most systems decorative.`);
  return out;
}

// A deck of this seeker's own lines, dealt in a new order each time it runs out.
export class Voice {
  constructor(id, traits, rand = Math.random) {
    this.id = id;
    this.rand = rand;
    this.lines = [];
    for (const k of TRAIT_ORDER) {
      const v = traits[k];
      const l = v && TRAIT_LINES[k] && TRAIT_LINES[k][v];
      if (l) for (const line of l) this.lines.push(line);
    }
    this.deck = [];
    this.last = null;
  }

  _deal() {
    if (!this.deck.length) {
      this.deck = this.lines.slice();
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(this.rand() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
      if (this.deck.length > 1 && this.deck[this.deck.length - 1] === this.last) this.deck.unshift(this.deck.pop());
    }
    this.last = this.deck.pop();
    return this.last;
  }

  // one monologue: two or three of its lines, sometimes one about now
  monologue(st, ctx) {
    const n = this.rand() < 0.3 ? 3 : 2;
    const out = [];
    for (let i = 0; i < n && this.lines.length; i++) {
      const l = this._deal();
      if (!out.includes(l)) out.push(l);
    }
    if (this.rand() < 0.3) {
      const s = stateLines(this.id, st, ctx);
      out.splice(Math.floor(this.rand() * (out.length + 1)), 0, s[Math.floor(this.rand() * s.length)]);
    }
    return out;
  }

  // a single remark, said unasked when you pass by
  remark(st, ctx) {
    return [this.rand() < 0.4 ? stateLines(this.id, st, ctx)[0] : this._deal()];
  }
}
