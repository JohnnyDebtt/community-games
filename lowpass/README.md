# Low Pass

A slow survey flight over the Fog Belt, an endless taiga on The Seeker's planet, where
the warmth under the ice keeps a forest alive and the steam it breathes never lifts.
3D, single player, in the browser, from a fully static website.

You fly low over the canopy and steer left and right; the ship keeps its own height.
Now and then a light shows in the fog: an artifact, grown for you alone. But when a
SEEKER NET seeker moves on chain while you fly, that seeker itself rises out of the fog,
giant: witnessed, the same for every ship in the fog at that moment. Steer to it and
hold the scanner on it, and the visor photographs it into your Codex. Inside the ship
there is room to walk, a coffee machine (you will need it: alertness runs down), the
Codex computer, where your records are, where holders share scans on a public board,
rank on a leaderboard and see their seekers' charge, live, and room for one of your own
seekers to come aboard and talk.

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
| W, or ↑ (hold) | boost: the core burns plasma and the ship flies faster (outside, and at the controls) |
| SPACE (hold) | scan what is in your sights |
| V | go inside the ship, or back out (and, when an alert is up, out from the Codex or the coffee) |
| C | camera: chase, far, low, cinematic (it goes cinematic by itself after a minute idle) |
| W A S D, mouse | walk and look inside (click to capture the mouse); SHIFT runs |
| E | use what is in front of you: the coffee machine, the Codex computer (on the cabin's right wall), the controls, a seeker aboard (E again, facing nothing else: its next line); at the controls, stand up |
| K | where the Codex computer is |
| M | keep the music playing now: that section will come back, as it is |
| R | save the last minute of sound as a WAV file |
| H | hide the interface |
| ESC | pause: volumes, pixel size, light shafts, controls, credits |

Gamepad: left stick steers and walks, right stick looks, the right trigger boosts, A scans
and uses, B stands up (and closes the Codex), X goes in and out, Y changes the camera,
Start pauses.

On a phone or tablet: hold the left or right side of the screen to steer (a mark at that
edge shows which way), and hold SCAN while something is in your sights; it lights up when
there is, and fills as it records. BOOST is a switch: touch it to burn, again to ease off. Inside, drag on the left to walk (a ring follows your
thumb) and on the right to look. Buttons appear only for what you can do right then, named
for what they do: CABIN or OUTSIDE, CAMERA, STAND UP, and, when you walk up to something,
MAKE COFFEE, OPEN THE CODEX, TAKE THE CONTROLS or LISTEN (NEXT while a seeker talks); the
alerts have GO OUTSIDE. A tap skips the coffee scene,
and a tap on a seeker's words brings its next line. There are no key hints on a touch
screen; the hints follow whichever you used last, touch or keys. The first tap asks for
the full screen where the browser allows it (the pause menu turns it off), and the
interface is sized for fingers, the same whichever way the phone is held.

The game teaches itself, one thing at a time: a line above the keys says what to press
next until it has been done once (remembered in the browser), and inside, marks hang over
the coffee machine, the Codex computer and a seeker aboard until each has been used (over
the coffee machine again whenever you are tired). The keys that work right now show along
the bottom for a while after each change of place (always, on foot), and again whenever
a key that does nothing there is pressed. The Codex lives on the cabin's computer: walk
to it and press E.

## How it plays

- **The forest.** Spruce and fir over rolling hills, black lakes and frosted ridges, the
  same for everyone. Now and then (about one part in twenty of it) a **turned stand**:
  birches gone gold, amber and rust among the dark spruce, in any weather with banks of
  mist drifting between the trunks under the crowns, the ground russet with fallen leaves
  and the fog a little warmer; a few hundred meters to a kilometer across, its edges
  turning over a couple of hundred.
- **Flight.** The ship flies on at 24 m/s, its height following the canopy ahead. You
  steer, and you can **boost**: the core at the tail burns plasma, flares, and sheds a
  pale blue-violet trail, and the ship climbs to about 58 m/s while the view widens. The
  **PLASMA** meter, over the alertness, runs out after about twelve seconds of burning
  and gathers back slowly (about fifty seconds from empty); spent, the boost waits until
  some has gathered again.
- **Artifacts.** Every minute or two, a **wild** one: grown from a seed your own
  browser draws, so no one else will ever meet the same one. Twenty-five families:
  standing stones, monoliths, ringed orbs, cellular-automaton arrays, shells, crystal
  blooms, tethers, luminous groves, gates to fly through, nested polyhedra, geoglyphs,
  harmonic chimes, lighthouses whose beams turn through the fog, orreries that keep
  Kepler's law, helices whose lit rungs spell a number, the shadows of four-dimensional
  solids, derelict hulls, stairs to a door that opens on fog, pale elder trees, level
  pools under a hanging stone, cloaked sentinels whose eyes follow the ship, swarms on a
  torus knot, cradles of bone round a cracked egg, lanterns hung on nothing, and
  listening dishes, most of which turn to track you. About one in seven is **grand**: larger, with
  a column of its own light over it. A lone artifact appears just past what the fog lets
  you see, nearly dead ahead, and keeps ahead of you until you have seen it. Once you
  have come near one and lost it from sight (or left one far behind), it dissolves back
  into the fog: there is no turning back for it.
- **The deep.** A wild artifact may come from below the surface, from a **depth**: the
  deeper the scanner is tuned (in the Codex's SHOP), the more of them do. Each starts at
  the surface and goes one depth deeper three times in four, as far as the scanner
  reaches, so right after a depth is bought most finds come from it, and with every
  depth after, the deepest grow rarer; one in twenty-five comes from beyond the
  scanner's reach (a depth or two deeper), as a glimpse. Each depth is a **stratum** of
  its own colors (Gilt, Nacre, Ember, Aurora, Ultraviolet, Solar, Abyssal, Prism, then
  others without end), and what grows there is larger the deeper it is (a depth-six
  spire stands two hundred meters and more; the ship climbs over what is in its way and
  flies under what floats high), drawn from fourteen forms the strata open one by one:
  corollas that open as the ship nears, spines of turning crowns, nested solids,
  armillaries, choirs of monoliths, geodes, corals that flower at their tips, knots and
  linked rings, nautilus shells, horns and galaxies, floating archipelagos with falls of
  light, strange attractors traced by thousands of motes, medusae trailing arms of light,
  star engines with plates on their orbits, eyes that follow the ship. Deeper, one form
  crowns another, a court of small ones stands about it, and ornaments gather: rings,
  sigils on the ground, beams, pillars, rain of light, aurora veils, its double hanging
  upside down in the sky, its echoes a moment behind it. Each sings (below). Witnessed
  seekers are never touched by any of it.
- **Witnessed seekers.** When a SEEKER NET seeker moves on Robinhood Chain while you
  fly, that seeker itself rises out of the fog, giant: its voxel model built from its own
  collection art as it is on the chain now (dormant ones dark by their stage, their
  battery for an eye; activated ones bright; 30 to 60 meters tall, larger for more charge
  released), hovering over a figure drawn in light on the forest floor, turning to watch
  the ship, under a gold column of light and a crown. It is seeded by the move's
  transaction (one of a sweep's, by the transaction and its token), the same for every
  ship flying at that moment, and its marks are gold, its number on the brackets. When
  several seekers move together
  (a sweep, one transaction or many at once), each rises, all at once, spread across a
  broad front ahead: more than one ship can scan before it has flown past, so you choose.
  (Twelve at a time; a larger sweep comes in waves.) Moves made while you were away are
  not replayed. Inside the ship, at the Codex or over coffee, an alert says so over
  everything, with the way out (GO OUTSIDE, or V; NOT NOW waves it off until the next
  move), and they rise farther off to give you time.
- **The cabin's call.** Anywhere aboard (walking, at the controls, over coffee, at the
  Codex) the ship calls when something rises ahead: two soft notes for a wild artifact,
  and for witnessed seekers a golden rising call, twice, over a low swell. Away from the
  ship's view, a wild one also gets a small note over everything (WILD ARTIFACT NEARBY,
  with the way out) that goes by itself; a deep one names its depth and stratum (DEPTH
  III · EMBER, or FROM BEYOND YOUR REACH), and its marks on the HUD are in its light.
- **Their voices.** Every artifact has a voice of its own, from its seed and family
  (src/core/voices.js), and unlike the music: where the score holds long notes, an
  artifact pulses in time with its own light. A soft bed (breath through drifting
  resonances, slowly beating glass, an inharmonic warble, a voice that glides between
  notes) throbs open on each step of its rhythm and sinks between, and over it come soft
  ticks, short chirping sweeps like a signal reporting home, or now and then a burst of
  tiny stuttering blips, like data coming apart; under a witnessed one, a slow chord.
  Quiet, in the game's tuning; heard from the ship (the nearest four at a time, under
  the EFFECTS volume, nearly dry, so it sits where it is): nearer is louder and
  brighter, farther is darker and a little wetter, panned by where it lies from the
  nose, quieter behind. You hear one before you see it. One from the deep sings instead,
  on a chord of the root's harmonics: the palette's own, and one more for every depth
  down to its own (a pure third, then the eleventh, the thirteenth, the seventeenth...),
  so the deeper, the stranger its intervals; in layers its depth opens, more of them the
  deeper (struck bells, a slow chord, high twinkling, a figure on its steps, a resonator
  struck by noise, overtone song, a second rhythm against the first, swells that stop, a
  voice moving from vowel to vowel, a drifting cluster, falling cascades). It arrives
  with a call of its own, its chord struck upward like bells. Every artifact's voice
  passes a guard that leaves it untouched at its own levels and holds anything past
  them under a ceiling.
- **Scanning.** Bring it into the brackets and hold SPACE (SCAN on a touch screen, A on
  a gamepad) for a couple of seconds; it works through the windshield at the controls
  too. Once a scan is under way it holds on as you fly close past (and wider still right
  beside one), and if it slips for a moment the progress drains slowly rather than
  vanishing. With several out there, the scanner takes the one most nearly ahead, and the
  bearing strip along the top marks every one. The visor photographs it (288 x 162,
  through the same fog), names it, and writes the Codex's notes.
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
artifacts steer it. The effects carve it, as SeekerAudio's kick carves its layers: the
music is multiplied by one minus an effect's own level, sample by sample (a ring-mod cut
that leaves it through where the effect's wave crosses zero, so nothing pumps), and dips
a little under the effect's envelope, so a scan, a seeker's murmur or an alert is never
lost under a swell. **M** keeps what is playing (it comes back); **R** saves the last
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
  the relays that honor deletions). One post every 20 seconds (the button counts down).
  It reads like a conversation, newest at the bottom; ALL, SCANS and WORDS filter it. A
  scan's photograph shows as a thumbnail beside its words; a click or touch anywhere on
  the message opens it where it is, and again closes it.
- **SEEKERS**: the seekers an address holds (connect or link your wallet, or type any
  address to view), and, for your own, BRING ABOARD / SEND BACK: live charge, stage,
  status, Discharge, Uplink, shares received since the last move, when it last moved, the
  date it should activate at +50 a day and with the last day's shares, its traits, and the
  network's totals.
  A seeker of an address only viewed offers CONNECT TO BRING ABOARD right on its page. A
  phone's own browser has no wallet in it: there, connecting offers OPEN IN METAMASK,
  which opens Low Pass in MetaMask's own browser, where it connects. Held upright, the
  page scrolls as one, and touching a seeker goes to its page.
- **LEADERS**: the leaderboard. Holders submit their own scans (one button, after the
  same one-time wallet link as the board); holders are ranked by witnessed scans, then
  by the rest, then by name, and a holder with none does not appear. Names follow the
  board's. Each holder's scans open in a gallery (a click on their row, or ENTER).
- **SHOP**: **DATA**, and the scanner's depth. TRANSMIT sends every scan not yet sent
  for DATA (they stay in the LOG and on the leaderboard; each counts once): a wild scan
  is worth 10, and 10 more for every depth it came from; a witnessed one 40. TUNE
  DEEPER spends it: the first depth costs 120 (twelve plain scans), each next one twice
  the last, without end; what a scan is worth grows only by its depth, so every depth
  is harder to reach than the last. Saved in this browser.

Linking a wallet from LOG, BOARD or LEADERS brings you back where you were. A quiet mark
on a tab says there is something new there: words on the board, scans not yet
submitted, or (SHOP) scans to transmit or a depth you can buy. TAB changes page, the arrows choose, ESC closes (in a gallery, goes back).

### The leaderboard: how scans are checked

A submission is the browser's ledger: every scan in its Codex, listed without the
photographs, signed with the board's key and carrying the same wallet proof as a post
(Nostr kind 30078, app data, replaceable, so the newest ledger from a key stands; long
ledgers go in pages). The photographs follow, one small event each, and are fetched only
when someone opens that holder's gallery. Every reader counts a ledger only if its
signatures and proof are right and the address holds a seeker now; a witnessed scan only
if that seeker moved in that transaction in that block (read from Robinhood Chain) and it
was scanned within a few hours of the move; the rest only no closer than 40 seconds
apart (no artifact comes sooner); and each artifact once per address. A determined holder
could still fake wild scans, as with any game's leaderboard; witnessed ones are tied to
the chain.

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
the address still holds it each time it starts. To post or to submit scans, the game asks
your browser wallet (MetaMask, Rabby, any EIP-6963 wallet) for that one signature, once.
Signing is free and is not a transaction: it sends nothing, approves nothing and cannot
move anything you own. The game never asks for a transaction, an approval, a permit or a
seed phrase. The posting key lives in this browser only. On a phone, whose browser has
no wallet, the game says so and offers to open it in MetaMask's own browser.

### Wallet safety

The game can ask a wallet for exactly two things, both in `src/net/wallet.js`, and only
when you press a button:

- `eth_requestAccounts` (CONNECT): the wallet shares your address. Nothing is signed.
- `personal_sign` (CONNECT AND SIGN, or SIGN ONCE once connected): one signature on a
  plain-language message that says what it is for, names your address and the board key,
  and says it is not a transaction. It cannot authorize a transfer, an approval or a
  permit, and the message is useless anywhere else: it only ties a posting key to your
  address for the board and the leaderboard.

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
an hour, across a reload, for their artifact). A witnessed seeker's look is read when it
rises (its charge and status); the leaderboard reads the block of each witnessed scan to
confirm it, and `balanceOf` for each holder. Offline, every artifact is wild, and the
sky's clock starts from the block in `assets/moves.json` until the chain answers. The
collectibles are art and membership, not investments; nothing here is financial advice.

## Host it

Upload the folder as it is to any static host (GitHub Pages, Netlify, Cloudflare Pages,
itch.io). Everything is relative, so it works from a subfolder. `tools/`, `DESIGN.md`
and this file are not needed at runtime.

## Development

- `?dev` adds `window.__lp`: `look('orb')` to orbit a fresh artifact of a family,
  `deep(4, 'medusa')` one from a depth (a form, if named),
  `fake('orb', 300, witness)` one ahead, `witness(token)` as if a seeker moved this
  moment, `sweep(7)` as if seven moved in one transaction, `clear()` to take them all
  away, `coffeeAt(seconds)` the coffee scene frozen at a moment, `freeze()`, `spawn(i)`
  one of the shipped moves, `time(0.15)` a sunrise, `run(seconds)` to step without the
  browser's frames, `mockWallet(testKeyHex)` a stand-in wallet with a throwaway key.
  `?stats` shows frame numbers (F3 toggles them). `?play` skips the title, `?t=0.3`
  starts at an hour of the day, `?x=&z=` at a place.
- `?offline` skips the chain: every artifact is wild.
- `node tools/relay.mjs 7777` runs a tiny Nostr relay in memory; open the game with
  `?dev&relay=ws://localhost:7777` to try the board without writing to public relays
  (the `relay` option works only with `?dev`, and only for a relay on this machine).
- `index.html`'s Content Security Policy carries the hash of its import map: change
  one, change both. A new RPC or relay must be added to its `connect-src` too.
- `node tools/snapshot_moves.mjs 72` refreshes `assets/moves.json` (read only).
- After changing `style.css`, run `node tools/stamp.mjs` before publishing: it stamps the
  stylesheet with a hash of itself in `style.css`, `src/build.js` and `index.html`. A
  browser that brings back an old tab can hand over an old stylesheet with new code; the
  code checks the stamp and fetches the stylesheet that goes with it.

## Files

```
index.html, style.css     the page and the interface
src/main.js, src/game.js  start-up (and the stylesheet check, src/build.js), the modes,
                          the frame
src/render/               the pipeline (opaque, fog and sky, glows, grade and dither),
                          materials, the geometry builder
src/world/                terrain, trees, chunks with a floating origin, the canopy map
                          for light shafts, day, night and fog
src/ship/                 the ship and its flight, cameras, the cabin, the Seeker, the
                          coffee scene
src/artifacts/            from a seed or a move to an artifact: generation, models (the
                          first families, the witnessed seeker, the auras), the newer
                          families, their shared parts, the field, the photograph; the
                          deep: its strata, its descriptions, its forms
src/companion/            a seeker aboard: its voxel model (after Soundings, also the
                          witnessed giants'), its lines, its hovering and talking
src/chain/                Robinhood Chain reads, the move watcher, the block clock, the
                          seekers' art
src/net/                  BIP-340 Schnorr, Nostr, the wallet link, the board, the leaderboard
src/core/                 math, palette, input, storage, keccak, the score, the artifacts'
                          voices, the foley, progress (DATA and depth)
src/ui/                   HUD, the Codex computer, menus, touch
assets/                   fonts, SEEKER NET art atlas and metadata, shipped moves
vendor/                   three.js r170, noble-secp256k1
tools/                    local server, test relay, moves snapshot, the stylesheet stamp
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
