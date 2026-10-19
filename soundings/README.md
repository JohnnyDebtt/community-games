# Soundings

A quiet ice-fishing game on the frozen sea of The Seeker's planet. 3D, single player, in
the browser, from a fully static website. Drill the ice, sound the depths, and record what
lives below, with a SEEKER NET seeker as your sonar.

*Sounding*: measuring the depth of water. Also sound, tuning, and probing the unknown.

**Play it at <https://theseekergame.github.io/community-games/soundings/>** (any current
Chrome, Edge, Firefox or Safari with WebGL 2; keyboard and mouse, a gamepad, or touch).

## Play locally

Serve the folder with any static web server and open it in a browser with WebGL 2. For
example:

```bash
node tools/serve.mjs
```

then open <http://localhost:8123>. (`python3 -m http.server 8123` works too.)

Opening `index.html` straight from disk does not work: browsers do not load JavaScript
modules from `file://`.

### Controls

| | Keyboard and mouse | Gamepad | Touch |
| --- | --- | --- | --- |
| Walk / run | WASD or arrows / Shift | left stick | left half of the screen |
| Look, zoom | drag, wheel (Z / X turn) | right stick | drag the right half |
| Interact (sit, enter, travel, take a line) | E | X | use |
| Drill a hole | hold E on the ice | hold X | hold use |
| Fire your seeker's Overdrive (at a hole) | Q | RB | od |
| Cast | hold Space, let go (a tap recasts to the last depth) | A | cast |
| Jig while waiting | tap Space | A | jig |
| Hook a bite | Space when **!** appears | A | hook! |
| Reel (the catch bar) | hold Space to raise the band, let go to drop it | A | reel |
| Lure depth while waiting | W / S or the wheel | triggers | |
| Stand up | E or Esc | B | back |
| Codex / SEEKER NET relay | Tab / N | Select / Start | codex / net |
| Attuned sense, lantern, live bait | V, L, B | | |
| In any window: move, choose, close | W A S D or arrows · F, Enter or Space · X, Q or Esc (as in The Seeker) | | |
| In a terminal: second action, next tab | R · Tab | | |

### The loop

1. Walk out on the ice. Depth changes across the sea and so does what lives there:
   the Capsule Shallows, the warm Vent Field, the clear black ice of the Glass Reach,
   and the Drop, where the sea goes down 150 m.
2. Sit at a hole (or drill one). Hold to cast; a meter beside you runs down the depth.
   Let go to drop the lure there.
3. Wait. Tapping jigs the lure: a fish that likes how it moves (still, slow lifts,
   steady jigs, quick, frantic) bites sooner.
4. On the **!**, hook it. Then the catch bar, as in Stardew Valley: hold to raise the
   bright band, let go to drop it, and keep the fish inside it until it is up.
5. It leaps out of the hole and the visor records it in the Codex: new species, size
   records, variants, trophies and perfect catches give Codex data, more on a streak.
   Keep it (backpack, specimen tank, live bait) or let it go. Keeping thins that fish in
   that part of the sea for a while.
6. Spend data in the capsule (leap up into its lift) on longer lines (24 to 144 m),
   seeker mounts, bigger backpacks (The Seeker's own three packs), a lantern, a glow lure.
   Its terminal is The Seeker's own: a grid of wells, one per thing, each research a
   track of numbers (48, 72, 96, 144 m), and only the selected one's words below.

Three **field requests** at a time (one shown) always point at a next thing to try, and
pay data. Every catch also charges your seeker's **Overdrive**.

24 species in all, each with its own depth, hours, weather, light preference and way of
moving. One cannot be caught at all, only recorded, if you are very still in the right
place at the right hour.

## SEEKER NET

[SEEKER NET](https://github.com/TheSeekerGame/collections/tree/main/SEEKER_NET) is 2,222
tiny computer-like robots on Robinhood Chain, each charging toward activation. In
Soundings they are your fishing companions and devices, and what their holders do
on-chain is felt on the sea.

- **Only activated seekers wake for the ice.** Tune any of them by number, or sweep for
  signals, at the relay (N) or the capsule. Anyone can tune any of them; owning one
  changes nothing.
- **Traits decide how you fish.** The Floating Object is the seeker's **Overdrive**, one
  big ability you fire with Q at a hole (the first time it fills, your seeker fires it
  by itself as soon as your lure is down, so you see what it does): Autoreel (keyboards: the next 3 fish reel themselves
  in), Prime Count (numpad: triple data), Point & Click (mouse, trackball: the rarest
  fish here bite next), Frenzy (joystick, gamepad: 30 s of fish rushing in), Crescendo
  (fader deck: trophy sizes), Lock-on (dial deck: nothing escapes for 45 s), Deep Scan
  (datasette, floppy, Codex slate: see every fish, bites twice as fast). Head, Back and
  Flank give one strong perk each (a 40% taller band, a second chance, devices that fish
  twice as fast, fish twice as fast by day...); Bare seekers make up for carrying nothing.
- **Overcharge is level.** Charge above 9,000 keeps growing; every level (100, 300,
  600, 1,000, 1,600) makes the seeker 10% stronger.
- **Moves are sparks.** When anyone moves a seeker, the contract releases a quarter of
  its charge to the others (the `ChargeReleased` event). It falls on the sea near you
  as a spark, named for the seeker that moved: take it in to charge your Overdrive (big
  releases fill it), and fish the hole it punched while it teems. Dormant seekers move
  dozens of times a day; a watched one's spark lands at your feet.
- **Your seeker moved: a surge.** If a seeker you have tuned moves on-chain, lightning
  strikes it and its Overdrive fires at double strength, or the surge is stored in it
  (moves since your last visit are found when you come back).
- **Activations are seekers waking on the ice.** A pillar of light shows where; find it
  to tune the seeker in, with a surge of its first light.
- **Spare seekers keep the holes you leave.** With a mount researched, a tuned seeker
  drops in from the sky onto a hole as you stand up from it, fishes it on its own rhythm
  (keyboards tap evenly, the numpad taps on prime steps, joysticks jig lively, data
  devices hold still) and calls you to a bite. Sit at its hole and it steps aside.
- **The network is the weather.** Total charge and activations set the aurora; the
  number of moves in the last day makes the sea livelier (up to 30% more bites).

Everything is read-only, straight from public RPCs (`eth_call` and `eth_getLogs` only):
no wallet, nothing signed, nothing written, no server of ours. Offline, the game uses
the snapshot in `assets/seekernet/snapshot.json` and says so. The collectibles are art
and membership, not investments.

The seekers are drawn from the collection's own layers, pixel for pixel: all 15,554
pictures (2,222 activated stills, 13,332 uncharged) rebuilt from the game's atlas match
the collection's checksums. In 3D they are rebuilt as boxes from the art's oblique
projection (lid on top, bevel on the side, add-ons where they belong in depth).

## Files

| Path | What |
| --- | --- |
| `index.html`, `style.css` | the page |
| `src/main.js` | start-up |
| `src/game/` | game state, fishing, Overdrive, SEEKER NET events on the sea, field requests, ecology, species, devices, research, holes, saving |
| `src/world/` | the sea, ice, sky, terrain, the capsule, props, weather, sparks, the life under the ice |
| `src/actors/` | the Seeker and its backpacks, the camera, SEEKER NET seekers, fish models |
| `src/seekernet/` | chain reads, network model, the seekers' art, traits as device effects |
| `src/render/` | the pixel renderer, the shared shader, outlines, geometry and voxel builders |
| `src/ui/` | HUD, catch bar, windows, screen layout, the interface's pixel art, touch controls, fish portraits |
| `src/core/` | math, input, procedural audio in the Seeker tuning, palette; `master.js` and `master-worklet.js` normalize the whole mix as SEEKER does (a glue compressor, a leveler bringing the last few seconds' peaks to -0.3 dBFS, a soft clipper and a look-ahead limiter; your volume comes after) |
| `assets/seekernet/` | the baked seeker atlas (18 chunks, 444 KB), metadata, snapshot |
| `assets/items/` | The Seeker's backpacks |
| `assets/fonts/` | Tektur, and The Seeker's pixel font as a web font |
| `vendor/three.module.min.js` | three.js r170 |
| `tools/bake_seekers.py` | bakes the seeker atlas from the collection (and `--verify`s it) |
| `tools/snapshot.html` | refreshes the offline SEEKER NET snapshot (with `tools/serve.mjs`) |
| `tools/make_font.py` | builds `SeekerPixel.woff2` from The Seeker's `PixelFont2.png`, the headings' hand-drawn `SeekerDisplay.woff2` (`--display`) and the title's pixel Tektur (`--tektur`) |
| `tools/serve.mjs` | a tiny static server for local play |
| `tools/test_master.mjs` | tests the master stage: hot, typical and quiet mixes come out peaking at -0.3 dBFS, never past it (`node tools/test_master.mjs`) |
| `DESIGN.md` | the design |

No build step. To publish, upload the folder to any static host (GitHub Pages, itch.io,
Netlify, a plain web server). `tools/` and `DESIGN.md` are not needed at runtime.

### Re-baking the seeker art

```bash
git clone --depth 1 https://github.com/TheSeekerGame/collections.git
pip3 install -r collections/SEEKER_NET/requirements.txt
python3 tools/bake_seekers.py collections/SEEKER_NET --verify
```

### Refreshing the offline snapshot

Run `node tools/serve.mjs`, open <http://localhost:8123/tools/snapshot.html>, and press
the button. It reads every seeker's charge from the chain and saves the snapshot.

## Credits and licenses

Soundings is set in the universe of [The Seeker](https://github.com/TheSeekerGame/the-seeker),
an open-source sci-fi brand. It is not an official release of The Seeker.

> Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY
> 4.0: https://creativecommons.org/licenses/by/4.0/ . Original project:
> https://github.com/TheSeekerGame/the-seeker . Changes were made where applicable.

Used from The Seeker: the backpack sprites (`assets/items/`, modeled in 3D in the game),
its pixel font `PixelFont2.png` (as `assets/fonts/SeekerPixel.woff2`), the capsule and its
lift (modeled after its sprites), the Tektur typeface (SIL Open Font License 1.1, also
rasterized as `TekturPixel30.woff2` for the title, so it shares the world's pixel grid), the
palette, and the 48 Hz tuning.

SEEKER NET art, layers and data come from
[TheSeekerGame/collections](https://github.com/TheSeekerGame/collections) (MIT OR
Apache-2.0). three.js is MIT licensed. Their license texts are in `licenses/`.

Soundings itself is licensed as the rest of
[community-games](https://github.com/TheSeekerGame/community-games): code MIT or
Apache-2.0 at your option, project-owned assets CC BY 4.0, fonts SIL Open Font License
1.1. See `../LICENSE.md`.

Everything else, the sea, its creatures, the sound and the music, is made in code here.
