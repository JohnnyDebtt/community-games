# Dweller

A dark side-scroller set in The Seeker universe. You are a small hooded figure hiding in shadow:
light burns, shadow heals. Six levels descend from ice-cold caves to a strange beating heart, and
each one ends with a sliver of a broken crystal. Gather all six and the crystal becomes whole, and
the door to the final depth opens.

- **Play:** open `dist/dweller.html` in any browser. It is one self-contained file: code, art and
  procedurally generated music are all inside.
- **Controls:** A/D or arrows move · Space jump · S roll/crawl · E send the SEEKER (once found) ·
  Esc pause (a menu: resume, return to tether, new descent, settings, back to town; or press R, N, O, Q) · O settings · M mute · F fullscreen. Touch and gamepads work too.
- **Settings** (O on the title or pause screen; the bottom line on touch; Select on a gamepad): music and sound
  volume, soft or full flashes, screen shake on or off.
- **Saves** live in the browser. Settings → COPY SAVE CODE gives your whole save as one line of text; keep it, or
  paste it with LOAD SAVE CODE on another device or browser to carry on there.
- **Door candles:** every level's door in town has two candles that burn blue. The left one lights when you
  beat the level without the light finding you; the right one when you beat it without sending the SEEKER.
- **The kept room:** light all twelve candles and, after the Core, the great arch at the foot of the Codex's
  right-hand tower wakes (its twelve candles burn as the town's do). Through it, a dark room over still water where
  the drops of light that fall from the crystals play the room's music, and SEEKER #0, kept for you: two more spare
  lives in every descent of The Deep, and quick soles.

## The levels

| | Level | Theme | Route |
|---|---|---|---|
| I | The Descent | ice-blue caves | long halls left to right: lamps, walking lights, eyes, beams |
| II | The Mycelium | fungal teal | up a gill ladder, bounce across the canopy, swing on hyphae, a high or low road, under or over the eyed caps, down the spore shafts, a cap bridge over tar, down a root tangle, through the spore cloud and up the mycelial web, the gill run, the spore stair, caps that throw you over fallen stems |
| III | The Glass Garden | violet crystal | a switchback that doubles back, a prism well, hush stones, a glass stair, a turning orrery, a mirror hall of crossing beams, a crystal tree, light raining upward, a shard field, a frost bridge, a glass orchard, down four tiers of a lens |
| IV | The Foundry | rust and copper | ride hot-air vents up a stack, drop through gantry grates, pull the boiler lever and race the fire, hammers in the forge, a scrapyard, pipeworks, a smelter of sprung plates, an oiled conveyor, a crane yard, climb the bellows |
| V | Ember Deep | crimson | climb out past a buried sun on ash vents, stepping stones and geysers over tar, three suns and three stones, a walking sun, an obsidian stair, a turning sun, magma locks, ash falls, a magma river, the slag heaps, the kiln |
| VI | The Heart | bone and magenta | a loop through the atrium, a rib cage climb, weave between two beating ventricles, a maze of vessels, tendons, the aorta, the lungs, a nerve to crawl, the marrow, synapses, a valve chain, the pulse, two valves to still the heart |
| VII | The Core | void and white | behind the door of six slivers: set them in the Guardian's six alcoves while its gaze turns; each sliver changes it (it turns faster, the room breathes, its gaze splits, it keeps the beat, it flares like a sun, its heart stumbles); then it shatters and the light floods down the shaft after you. Needs the SEEKER |

New pieces along the way: one-way shelves you can drop through, bounce caps, slick glass, vines to climb,
hot-air vents, and hush stones that put nearby lights to sleep for a few beats.

**The town.** Between descents you walk a hollow village in a dead wood under the mountains. Every level
is a door somewhere in town (a house, a hollow tree, a ring of glass, a forge, an ember hut, an arch of
thorns); a door is sealed until the level before it is beaten, and glows in the colour of its sliver once
you have it. Walk up to a door and press E (ENTER on touch) to descend; N starts it from the top. The great
door under the mountain takes the whole crystal: bring all six slivers, set them, and it opens onto the
Core. Wooden signs at the edge of town show the controls. A few residents have things to say, and the town
keeps three quiet secrets.

**The SEEKER.** Somewhere in level II a wall is not stone. Behind it sleeps a seeker from SEEKER NET, any one of all 2,222, rolled for your save. Wake it
and it follows you; press E and it flies to the nearest light and covers it for a few beats (an
eclipse), then needs a moment to recharge. Every level can be beaten without it.

**The Codex and The Deep.** Once the Guardian is gone, the great door opens on what is left of its arena: the Codex,
an archive of every seeker you have found (tools/archive.py builds it from level VII, which is never changed). You come
in through a carved hall; your seekers stand in niches on two towers of balconies, 35 of them, ranked by how much they
help in The Deep (tiers S to D, the best highest). Where the Guardian hung, a Planetary Prime turns in its two shells;
stand in front of a seeker and the Prime opens to show it, its tier, what it does, and how it compares with the seeker
you have now. Press E and it comes with you. A glass bridge crosses the hole the Guardian tore in the floor; press down
on it to drop into The Deep.

The Deep is a run of eight rooms through four strata, two rooms each, drawn from 72 (twelve for each world), never the
same room twice in a run and never more than two of a kind in a row. You have one spare life; between rooms you choose
a gift (a rare one gives another life). Each room opens through one of six kinds of entrance and ends at a gate that
glows in the colour of the room beyond. At the bottom a chest holds a seeker you have not found yet, or, at 5, 10, 15,
20, 30 and 35 wins, a spool of thread: take it to the weaver in town for a new coat. Down there (and only there) a
seeker's real SEEKER NET traits matter: its base shapes its eclipse, its eyes how far it reaches, and a head, side or
back add-on brings a gift of its own. The Deep grows harsher as your Codex grows, up to a ceiling at 35, and its music
is written fresh for each run, always building toward the bottom.

**The relics.** Nine relics are hidden in The Deep. About one run in four hides one you have not found, behind a false
wall in a hollow of the rock, somewhere off the main way; the only clue is a line at the start of the run (something
hums down here). Walk into the wall and it crumbles. Carry the relic to the bottom and it is yours for good; die or turn back and it returns to the dark, to be found again in another run. A run that hides a relic always passes through its stratum, with one of that stratum's rooms the one that hides it. Through the dark arch at the foot of the
Codex's left tower lies the Relic Room, a cavern of black rock with a rift of black light in its wall: each relic you
have found stands there on a broken stalagmite, and up to three go on the altar and come with you into The Deep. The
room's music gains a layer for each relic you own. The six found in the strata: Plumb Line (start with an upgrade),
Spore Map (a false wall pulses as you near it), Prism (four gifts to choose from), Banked Coal (a full burn taken from
you, once a run), Spare Gear (reroll the gifts, once a run), Keepsake (reach the bottom and your gifts carry into the next
run). Found only at the harder tiers: Tuning Fork (your seeker holds two charges), Codex Lens (choose between two
seekers at the bottom) and The Ninth, which stays in the rift and is always with you: once a run, stand in a light and
press V (I, or the top face button, or the sun button on a phone) to become the light, and nothing in that stratum can
burn you.

## Source

- `src/` — the game: `sim.js` (deterministic 96 Hz simulation, also runs in Node), `render.js`,
  `audio.js` (Web Audio, Seeker 48 Hz tuning), `main.js` (menus, input, flow), `town.js` (the town above the descent), `deep.js` (the rules of The Deep), `relic.js` (the relics and the Relic Room).
- `tools/` — `level1.py` … `level6.py` build the levels with `levelkit.py`; `bot.js` is a search bot
  that proves every level can be beaten; `build.py` bundles everything into `dist/dweller.html`;
  `seekernet.py` draws all 2,222 SEEKER NET seekers from the collection's layers into `assets/seeker/net.png`
  (with their traits in `net.json`, and in `net_lids.png` the pixels that change when each one shuts its eyes);
  `deep.py` builds The Deep's rooms, `deepcheck.js` proves every one of them with the bot at the gentlest and the
  harshest tier, `relicspots.js` finds and proves the relic hollows, `bake_relicroom.js` bakes the Relic Room's still
  art, and `vischeck.js` looks for things that would look wrong (lamps in rock, liquid with no banks,
  emitters hanging from nothing).
- `test/` — browser checks with Playwright (replays of the bot's solutions, the town, the companion, The Deep, the
  Codex's stat cards at five screen sizes). Each takes an optional folder for its screenshots; by default they go
  to `shots/`, which git ignores.

Build: `python3 tools/levelN.py` for each level (writes `build/levelN.json`), then
`python3 tools/build.py`. The build first runs `node tools/bake_levels.cjs`, which bakes every level's terrain
tiles with The Seeker's ice-biome tiling (`tools/bake_terrain.cjs`, from the community-games port) into
`build/terrainN.png`. The tiling rules live in `tools/ice_tiling.json`; regenerate them from a checkout of
The Seeker with `python3 tools/extract_ice_tiling.py path/to/the-seeker tools/ice_tiling.json`. Verify a level: `node tools/bot.js build/level3.json build/solution3.json`.

## Credits and licence

Code is MIT. Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY 4.0
(https://github.com/TheSeekerGame/the-seeker). The companion is any SEEKER NET seeker, drawn from the collection's layers
(https://github.com/TheSeekerGame/collections). The town's residents are The Seeker's collector, exile and monk, and a weaver. The Prime in the Codex is drawn after
the Planetary Primes collection (https://ord.net/collection/planetaryprimes). Changes were made where applicable.
