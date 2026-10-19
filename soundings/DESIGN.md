# SOUNDINGS — design

A cozy, quiet ice-fishing game set on the frozen sea of The Seeker's icy planet.
3D, single player, runs in any modern browser from a fully static website.

*Sounding*: measuring the depth of water. Also: sound, tuning, and probing the unknown.
The game borrows The Seeker's world (the icy planet, Theorem, the Codex, Seekers,
attunement, SEEKER NET) and extends it compatibly. It invents no canon about the
main story.

## The feeling

Quiet, vast, meditative, a little eerie. Cold pale light, a warm capsule window,
the hum of a tiny robot's screen beside a hole in the ice, and something very large
passing far below. Cozy because nothing hurts you and nothing hurries you; strange
because the sea is deeper than it should be.

## Core loop (one loop that closes)

1. **Choose a spot.** Walk the ice. Depth under the ice changes across the sea, and
   so does what lives there. Drill a hole with the auger (or use an existing one).
2. **Sound the depth.** Sit and hold to cast: a slim meter runs down the depth beside
   you; let go and the lure drops there. (A tap recasts to the last depth.)
3. **Wait.** Nothing else on screen. Fish come to the lure; tapping jigs it, and a
   fish that likes how it moves (still, slow lifts, steady, quick, frantic) bites sooner.
4. **"!"** A fish bites: hook it. Then the catch bar (as in Stardew Valley), beside
   you: hold to raise the bright band, let go to drop it,
   keep the fish inside it. Each species moves its own way, on the 90 BPM beat. The
   line's hum climbs the harmonic series of 48 Hz as the fish comes up.
5. **Record it.** The visor scans the catch into the Codex: size, variant, a line of
   notes. New records give Codex data.
6. **Keep or release.** Kept fish go to the specimen tank by the capsule or become
   live bait for predators. Released fish go back. Releasing gives nothing back:
   it is only letting go. Keeping thins that species in that part of the sea for a
   while (legibly, in the Codex), because the sea is an ecology, not a dispenser.
7. **Research.** Codex data researches longer lines (deeper water: 24 → 48 → 72 →
   96 → 144 m), seeker mounts, a lantern, a glow lure, a faster auger.

Deeper water is warmer and stranger, and so are its colors, exactly like the
planet's caves.

## SEEKER NET devices

SEEKER NET's 2,222 seekers are tiny computer-like robots. In this game they are your
companion and your **fishing devices**, tuned in through the capsule's relay. **Only
activated seekers wake for the ice**: activation is the reward. Anyone can tune any
activated seeker; owning one changes nothing. What matters is what the seekers do, and
what their holders do with them on-chain.

- **Traits decide how you fish.** The Floating Object is the **Overdrive**, one big
  ability charged by catches and sparks and fired at a hole (Autoreel, Prime Count,
  Point & Click, Frenzy, Crescendo, Lock-on, Deep Scan). It is taught by doing: the
  first time it fills, the seeker fires it by itself once your lure is down, and the
  hole shows it at work; after that its key shows only at a hole, beside its name. Head, Back and Flank are one
  strong, visible perk each. Choosing a companion is choosing a way to fish.
- **Overcharge is level**: every level 10% stronger.
- **Moves are sparks.** Every move releases a quarter of the seeker's charge to the
  others (the `ChargeReleased` event in the public logs). It falls on the sea as a
  spark named for the seeker that moved; it charges your Overdrive and opens a teeming
  hole. Dormant seekers move dozens of times a day, so the network is always felt.
  Activated seekers move rarely (their charge above 9,000 is all they would give), so
  when one of yours does, it is an event: a **surge**, an Overdrive at double strength,
  stored if you were away.
- **Activations wake seekers on the ice**: a pillar of light to walk to, a new seeker
  to tune, a surge of its first light.
- **Spare seekers keep the holes you leave**: with a mount, one drops in as you stand
  up, fishes on its own rhythm and calls you. Nothing to set up and nothing to read; a
  mount bought with no spare seeker tunes one in.
- **The network is the weather**: the aurora follows its charge and activations; its
  moves in the last day make the sea livelier.

Read-only: `eth_call` and `eth_getLogs` against a public Robinhood Chain RPC. Offline,
the game starts from a shipped snapshot and says so.

## Feel

Every step of the loop answers: the cast flicks, the "!" pops in a bubble colored by
rarity, the hookset says HIT, the band glows while the fish is inside it and the bar
shakes when it slips out, the reel turns while you hold. A landed fish stops time for a
beat, bursts out of the hole in an arc, and is held up high; the card stamps NEW or
RECORD, the data flies to its counter and counts up, a perfect catch says so, a streak
multiplies. Field requests (one shown at a time) always name a next thing to try.

The interface is The Seeker's own: its pixel font (PixelFont2, as a web font) with its
one-pixel shadow, black panels with a fine line and cut corners, key caps like the
game's, all on one pixel grid with the world. Things that float beside the Seeker find
a place that covers neither the Seeker, its seeker, the hole nor the HUD. While a catch
is shown, notices wait.

## The Vagrant and the yak

Two travelers from The Seeker's caves, given a life on the ice. They answer two of its
open questions without saying so: *can a Seeker stop seeking?* (the Vagrant had a visor
once) and *what do the planet's inhabitants know that Theorem doesn't?* (where every
creature sings, without a single record).

- **Found by ear.** They camp in a different zone each day, and the lute (in the 48 Hz
  tuning, on the score's grid and in its chord) carries 70 m, louder as you near. As in
  The Seeker, the Vagrant puts it away and turns to you when you come close.
- **Songs are directions.** A song costs a little data and names an unrecorded creature
  you can reach: its water, its hour, its depth, its lure. It becomes the request shown
  first, with a note on the compass toward its water. Knowledge from experience rather
  than from the Codex, which is the point of the Vagrant.
- **Every catch is worth something.** The Vagrant takes fish from the pack for data, so a
  full pack is never a dead end.
- **The yak is a place.** Its warmth thins the ice: a hole beside it bites twice as fast.
  Nothing says so but a line of the Vagrant's and the steam around it; you find out by
  fishing there. Petting it gets a moo (The Seeker's own) and, once a day, a small gift.
- **Few words.** They speak in single lines, above their heads, one at a time.

## The capsule

As in The Seeker: you leap up into the lift under the pod, it carries you up the stilt,
and the frosted glass clears to show you inside, among warm lamps, a screen, the ladder
and the red machinery under the dome, its screens beside it.

## Resonance

Everything from one fundamental, 12: poses step at 12 fps, the walk lands two steps
per beat at 90 BPM, the line depths are multiples of 12 m, every pitch is
48 Hz × X / 2^N (the Seeker palette 1, 9/8, 19/16, 21/16, 3/2, 7/4), and the
tension hum climbs harmonics 8–16 of 48 Hz.

## Become, don't just collect

Recorded species can lend the visor their senses: the Glass Coil lets you see life
through any ice, the Lumen Seeker lets you see in the dark. One at a time.

## Performance

Low-resolution rendering scaled up by whole numbers with nearest-neighbor sampling
(the Seeker's pixel look, and a large GPU saving), one custom shader for the world,
merged and instanced geometry, no shadow maps, procedural audio, no build step.
