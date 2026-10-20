# Low Pass

A slow survey flight over the Fog Belt, an endless taiga on The Seeker's planet, where
the warmth under the ice keeps a forest alive and the steam it breathes never lifts.
3D, single player, in the browser, from a fully static website.

You fly low over the canopy and steer left and right; the ship keeps its own height.
Now and then a light shows in the fog: an artifact, grown for you alone. But when a
SEEKER NET seeker moves on chain while you fly, the next one is witnessed: the same for
every ship in the fog at that moment. Steer to it and hold the scanner on it, and the
visor photographs it into your Codex. Inside the ship there is room to walk, a coffee
machine (you will need it: alertness runs down), the Codex computer, where your records
are, where holders share scans on a public board and see their seekers' charge, live,
and room for one of your own seekers to come aboard and talk.

**Play it at <https://theseekergame.github.io/community-games/lowpass/>.**

*Low pass*: a flight close to the ground. Also the filter that softens a sound, as fog
softens light.

It is a compatible extension of [The Seeker](https://github.com/TheSeekerGame/the-seeker)'s
world, not an official release. The reasoning behind it is in [DESIGN.md](DESIGN.md).

## Play locally

There is no build step. Serve this folder with any static server (browsers do not run
JavaScript modules from `file://`); from inside it:

```bash
node tools/serve.mjs 8140
```

Then open http://localhost:8140. Requires WebGL 2 (any current Chrome, Edge, Firefox or
Safari). Keyboard and mouse, gamepad, or touch.

## Controls

| | |
| --- | --- |
| A D, or the arrows | steer (outside, and at the controls) |
| SPACE (hold) | scan what is in your sights |
| V | go inside the ship, or back out |
| C | camera: chase, far, low, cinematic (it goes cinematic by itself after a minute idle) |
| W A S D, mouse | walk and look inside (click to capture the mouse) |
| E | use what is in front of you: the coffee machine, the Codex computer (on the cabin's right wall), the controls, a seeker aboard (E again: its next line) |
| M | keep the music playing now: that section will come back, as it is |
| R | save the last minute of sound as a WAV file |
| H | hide the interface |
| ESC | pause: volumes, pixel size, light shafts, controls, credits |

Gamepad: left stick steers and walks, A scans and uses, Y goes in and out. Touch: hold
the left or right of the screen to steer; buttons for the rest.

The game teaches itself, one thing at a time: a line above the keys says what to press
next until it has been done once (remembered in the browser), and inside, marks hang over
the coffee machine and the Codex computer until each has been used. The keys that work
right now show along the bottom for a while after each change of place, and again
whenever a key that does nothing there is pressed. The Codex lives on the cabin's
computer: walk to it and press E.

## How it plays

- **Flight.** The ship flies on at 24 m/s, its height following the canopy ahead. You
  only steer.
- **Artifacts.** One at a time, every minute or two. Most are **wild**: grown from a
  seed your own browser draws, so no one else will ever meet the same one. But when a
  SEEKER NET seeker moves on Robinhood Chain while you fly, the next artifact is
  **witnessed**: seeded by that move's transaction hash, the same for every ship flying
  at that moment, grander, with a pale column of light rising through the fog and a ring
  going out across the ground, its marks in gold. (Moves made while you were away are not
  replayed.) The moved seeker shapes a witnessed artifact: its Floating Object picks the
  family (thirteen: standing stones, monoliths, ringed orbs, cellular-automaton arrays,
  shells, crystal blooms, tethers, luminous groves, gates to fly through, nested
  polyhedra, geoglyphs, harmonic chimes, and, for an activated seeker's move, its own
  likeness), its Colorway the light, the charge it released the size. An artifact
  appears just past what the fog lets you see, nearly dead ahead, and keeps ahead of you
  until you have seen it.
- **Their voices.** Every artifact has a voice of its own, from its seed and family
  (src/core/voices.js): breath through drifting resonances, slowly beating glass, an
  inharmonic warble, a voice that glides between notes, soft ticks on its own rhythm (in
  time with its light), and under a witnessed one a slow chord. All quiet and low, in the
  game's tuning; heard from the ship: nearer is louder and brighter, farther is darker
  and wetter, panned by where it lies from the nose, quieter behind, never loud. You
  hear one before you see it.
- **Scanning.** Bring it into the brackets and hold SPACE. The visor photographs it
  (288 x 162, through the same fog), names it, and writes the Codex's notes.
- **Alertness.** It runs down over about ten minutes. Tired, the edges close in, blinks
  grow long, and at the end come short sleeps in which the ship wanders and nothing can
  be scanned. Coffee fills it again.
- **A seeker aboard.** Connect a wallet at the Codex computer (SEEKERS: CONNECT shares
  your address and signs nothing) and bring one of your SEEKER NET seekers aboard. It
  hovers by the computer, built in voxels from its own art (after Soundings), dark and lit
  by stage while dormant, bright and blinking once activated, and turns to watch you.
  Walk up and press E and it talks: every one of SEEKER NET's 119 visual traits has two
  lines of its own (src/companion/dialogue.js), so each seeker's voice is the sum of its
  parts, dealt in a new order every time, with now and then a word about its charge, the
  hour or you. It stays aboard while the address that brought it still holds it.
- **The coffee.** At the machine, E: a short scene from outside yourself. The Seeker
  presses the button, the water warms and gurgles through, it lifts the carafe by the
  handle and pours, sets it back hissing on the plate, and takes the cup in both hands
  to the window. Every sound in it is synthesized foley (src/core/foley.js): the click,
  the heating, the drips, the pour, the sip, the breath after.
- **The sky.** The planet keeps Robinhood Chain's time: a day is 14,400 blocks (about
  24 minutes), three quarters of it sun, with long golden hours. Everyone flying at the
  same moment shares the hour and the weather. Light falls in shafts through the crowns
  and the gaps in the overcast; at night the aurora pulses with every move on the
  network.

## The music

Generative and endless, synthesized in the page. Its tuning keeps The Seeker's rule
(every pitch is the fundamental times X / 2^N, just intonation) on a fundamental of 42 Hz:
the music lives on 21/16 of it, an A at 55.125 Hz, in the palette 1, 9/8, 19/16, 3/2, 7/4.
A deep drone on the root; over it five voices that each change on their own clock, swell
in over seconds and fade over more, some dissolving into breath at their pitch, some heard
only as the hall's wash; now and then a far, soft tone; and every few minutes a rest. All
of it through a wide chorus into a moving plate reverb (its tail swept like a chorus, its
reflections turning). The hour, the fog, drowsiness, the cabin's walls and nearby
artifacts steer it. **M** keeps what is playing (it comes back); **R** saves the last
minute as a WAV file.

## The Codex computer

- **LOG**: every artifact you recorded, its photograph, where it came from (wild: its
  seed, yours alone; witnessed: the seeker, the block, the transaction, linked to the
  explorer, tagged in gold), and the notes. Share to the board.
- **BOARD**: the seekers' board, on six free public Nostr relays (relay.damus.io, nos.lol,
  relay.primal.net, offchain.pub, nostr.mom, relay.nostr.net; no account). Anyone can read
  it, in the game or in any Nostr client (kind 1 notes tagged `#lowpasscodex`). Holders
  post scans and words (text only, no links), take a **name** (shown instead of their
  address on all their posts, old ones too, for everyone; same names are told apart by a
  small colored mark), and **delete** their own posts (gone for every player, and from
  the relays that honor deletions).
- **SEEKERS**: the seekers an address holds (connect or link your wallet, or type any
  address to view), and, for your own, BRING ABOARD / SEND BACK: live charge, stage, status, Discharge, Uplink, shares received since the last
  move, when it last moved, the date it should activate at +50 a day and with the last
  day's shares, its traits, and the network's totals.

### Posting: how holders are checked, with no server

Free relays accept anything from anyone, so every reader checks every post in the page:

1. Its Nostr id and BIP-340 signature.
2. A wallet signature (EIP-191 `personal_sign`) on a plain message that links the post's
   Nostr key to an Ethereum address, recovered with keccak-256 and secp256k1.
3. That the address holds at least one SEEKER NET seeker now (`balanceOf` on Robinhood
   Chain, read only).
4. Text only: links are refused when writing and blanked out when reading.

Names and deletions carry the same proof. A name is a Nostr profile event (kind 0, with
the proof and an `lp-name` tag): readers show the newest name for each address on every
post from it, and never the address of a holder who has a name (it stays in the proof,
which readers need, but out of sight). A deletion is a NIP-09 event (kind 5) and counts
only from the post's own key or address. Names are 2 to 20 letters, numbers and simple
punctuation, with no links, nothing invisible and nothing like an address.

Free relays promise nothing, so the board does not lean on any one: every note goes to
all six and is read from all six; each player's game keeps what it has read (IndexedDB),
so the board shows at once and survives an outage; and when a relay answers without a
note the game holds, the game passes that note on to it, unchanged and still signed by
its author (a few per session). A post is lost only if every relay and every player's
cache lose it.

A scan's note carries its origin in its `lp-scan` tag (transaction or seed, block, seekers,
name, code, family, and `wild` / `witnessed`): a wild one names no transaction, since no
one else will ever meet it.

Bringing a seeker aboard needs only your address: CONNECT asks the wallet for it
(`eth_requestAccounts`) and signs nothing; the game checks with `ownerOf`, read only, that
the address still holds it each time it starts. To post, the game asks your browser
wallet (MetaMask, Rabby, any EIP-6963 wallet) for that one signature. Signing is free and is not a transaction: it sends nothing, approves
nothing and cannot move anything you own. The game never asks for a transaction, an
approval, a permit or a seed phrase. The posting key lives in this browser only.

### Wallet safety

The game can ask a wallet for exactly two things, both in `src/net/wallet.js`, and only
when you press a button:

- `eth_requestAccounts` (CONNECT): the wallet shares your address. Nothing is signed.
- `personal_sign` (CONNECT AND SIGN): one signature on a plain-language message that
  says what it is for, names your address and the board key, and says it is not a
  transaction. It cannot authorize a transfer, an approval or a permit, and the message
  is useless anywhere else: it only ties a posting key to your address for the board.

The code contains no `eth_sendTransaction`, no typed-data signing (`eth_signTypedData`,
permits), no raw `eth_sign`, no `approve` or `setApprovalForAll`, and no network
switching; it never asks for a seed phrase or a private key, and reads the chain only
through public RPCs. Text and pictures from the relays are put in the page as text and
checked JPEG data, never as markup. The page carries a Content Security Policy: only its
own files may run (no third-party scripts, no inline code), and it may connect only to
the two Robinhood Chain RPCs and the six board relays. The two vendored libraries are
byte-identical to their releases (three.js r170 `build/three.module.min.js`,
@noble/secp256k1 2.1.0 `index.js`).

## SEEKER NET, read only

Everything comes from public RPCs (`https://rpc.mainnet.chain.robinhood.com`, then
`https://robinhood.drpc.org`): `eth_call`, `eth_getLogs`, block reads. Moves are polled
every 30 seconds; only moves made while the game is open are witnessed (they wait up to
an hour, across a reload, for their artifact). Offline, every artifact is wild, and the
sky's clock starts from the block in `assets/moves.json` until the chain answers. The collectibles are art and membership, not investments; nothing here is
financial advice.

## Host it

Upload the folder as it is to any static host (GitHub Pages, Netlify, Cloudflare Pages,
itch.io). Everything is relative, so it works from a subfolder. `tools/`, `DESIGN.md`
and this file are not needed at runtime.

## Development

- `?dev` adds `window.__lp`: `look('orb')` to orbit a fresh artifact of a family,
  `fake('orb', 300, witness)` one ahead, `witness(token)` as if a seeker moved this
  moment, `coffeeAt(seconds)` the coffee scene frozen at a moment, `freeze()`,
  `spawn(i)` one of the shipped moves, `time(0.15)` a sunrise, `run(seconds)` to step
  without the browser's frames, `mockWallet(testKeyHex)` a stand-in wallet with a
  throwaway key. `?stats` shows frame numbers (F3 toggles them).
- `?offline` skips the chain: every artifact is wild.
- `node tools/relay.mjs 7777` runs a tiny Nostr relay in memory; open the game with
  `?dev&relay=ws://localhost:7777` to try the board without writing to public relays
  (the `relay` option works only with `?dev`, and only for a relay on this machine).
- `index.html`'s Content Security Policy carries the hash of its import map: change
  one, change both. A new RPC or relay must be added to its `connect-src` too.
- `node tools/snapshot_moves.mjs 72` refreshes `assets/moves.json` (read only).

## Files

```
index.html, style.css     the page and the interface
src/main.js, src/game.js  start-up, the modes, the frame
src/render/               the pipeline (opaque, fog and sky, glows, grade and dither),
                          materials, the geometry builder
src/world/                terrain, trees, chunks with a floating origin, the canopy map
                          for light shafts, day, night and fog
src/ship/                 the ship and its flight, cameras, the cabin, the Seeker, the
                          coffee scene
src/artifacts/            from a seed or a move to an artifact: generation, models, the
                          field, the scanner's photograph
src/companion/            a seeker aboard: its voxel model (after Soundings), its lines,
                          its hovering and talking
src/chain/                Robinhood Chain reads, the move watcher, the block clock, the
                          seekers' art
src/net/                  BIP-340 Schnorr, Nostr, the wallet link, the board
src/core/                 math, palette, input, storage, keccak, the score, the artifacts'
                          voices, the foley
src/ui/                   HUD, the Codex computer, menus, touch
assets/                   fonts, SEEKER NET art atlas and metadata, shipped moves
vendor/                   three.js r170, noble-secp256k1
tools/                    local server, test relay, moves snapshot
```

## Credits and licenses

Low Pass is set in the universe of [The Seeker](https://github.com/TheSeekerGame/the-seeker),
an open-source sci-fi brand. It is not an official release of The Seeker.

> Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY
> 4.0: https://creativecommons.org/licenses/by/4.0/ . Original project:
> https://github.com/TheSeekerGame/the-seeker . Changes were made where applicable.

- From The Seeker: its pixel font and display font (as web fonts), the Tektur typeface
  (SIL OFL 1.1), the palette, and the tuning rule (every pitch a fundamental times
  X / 2^N), here on a 42 Hz fundamental.
- SEEKER NET art, layers and data from [TheSeekerGame/collections](https://github.com/TheSeekerGame/collections),
  MIT OR Apache-2.0 (the baked atlas in `assets/seekernet/`).
- Code adapted from Soundings (in this repository) and SeekerCraft (by the same
  contributors), MIT OR Apache-2.0: the geometry builder, the palette tools, the Seeker's
  model and poses, the seeker art module, the SEEKER NET seekers' voxel models and their
  floating objects and the voxel mesher (Soundings), chain reads and the wallet proof
  (SeekerCraft).
- [three.js](https://threejs.org) r170, MIT. [noble-secp256k1](https://github.com/paulmillr/noble-secp256k1), MIT.

License texts are in `licenses/`. Low Pass itself: code MIT OR Apache-2.0, project assets
CC BY 4.0, fonts SIL OFL 1.1, as the rest of community-games.

Everything else, the forest, the sky, the ship, the artifacts, the sound and the music,
is made in code here.
