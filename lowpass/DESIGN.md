# Low Pass: design

A slow survey flight over an endless fog forest on The Seeker's planet. 3D, single
player (but for the Codex board), in the browser, from a fully static website.

**Relationship to the canon: compatible extension.** It keeps the recognizable world
(the icy planet, Seekers, Theorem's Codex, the visor, SEEKER NET) and adds a place of its
own: the Fog Belt, a warm band where the heat under the ice lets a taiga grow and the
steam never lifts. It invents nothing about the main story.

**Departures from the codex's open-brand rules, on purpose, at the project's request.**
The codex asks works never to ask anyone to connect a wallet or sign, and to gate
nothing. Three things here go further: posting on the Codex board needs one wallet
signature (`personal_sign`, free, never a transaction) that ties a posting key to an
address holding a SEEKER NET seeker; the board admits only such holders; and holders can
connect a wallet (it shares its address, signs nothing) to bring one of their own seekers
aboard. The flight, the artifacts, the Codex, the music, reading the board and viewing any
address's seekers stay open to everyone, owning nothing.

## The feeling

Quiet, vast, a little eerie. Cold pale light, a dark ship like a seed with ribs grown over
it, a warm window, the core's pale light on the treetops it passes over; fog lying in
every valley, dark spires coming out of it, the sun through it in beams at the ends of the
day. Something glowing far ahead that was not there before.

## The loop

1. **Fly.** The ship flies on by itself at canopy height; you only steer. Nothing hurries
   you and nothing hurts you.
2. **A light in the fog.** Every minute or two something appears in the forest, grown for
   you alone. When a SEEKER NET seeker moves on chain while you fly, that seeker itself
   rises out of the fog, giant: witnessed, the same for every ship in the fog at that
   moment. You hear each one before you see it, and aboard, the ship calls.
3. **Scan.** Steer it into the brackets and hold. The visor photographs it into the Codex,
   names it, notes it.
4. **Stay awake.** Alertness runs down; the view closes in, blinks grow long, short sleeps
   come. Go inside and make coffee.
5. **Share.** At the Codex computer, holders put their scans on the board and on the
   leaderboard, and everyone sees what the others found.

## Artifacts: yours alone, and the network's moments

Two kinds. **Wild** artifacts come on a steady cadence, one at a time, a minute or two
after the last is behind you, each from a seed your own browser draws: nobody else will
ever meet the same one, so the forest between moves is yours. Twenty-five families, from
standing stones and monoliths to lighthouses, orreries, the shadows of four-dimensional
solids, derelict hulls, sentinels and lanterns; about one in seven is grand, larger, with
a column of its own light over it.

**Witnessed** artifacts are the network's moments, and they are the seekers themselves.
When a seeker moves on chain while you are flying, it rises out of the fog, giant: its
voxel model built from its own art as it is on the chain now (dormant and dark by stage,
or activated and bright), hovering over a figure drawn in light, turning to watch the
ship, under a gold column and a crown. You see exactly which seeker moved. Its
transaction (and, in a sweep, its token) is the seed, so every player who was flying then
meets the same thing, and anyone can trace it to the chain from its Codex entry. When many
move at once, they all rise at once, across a broad front, more than one ship can scan
before it has flown past: a sweep fills the fog, and each player chooses. Moves made while
you were away are not replayed; a witnessed move waits an hour at most, across a reload.
Moves come a few dozen times a day, so a witnessed seeker is an event: its marks and its
Codex entry are gold, the forest answers with a slow chord, and aboard, an alert reaches
you wherever you are, with the way out.

The rest comes from the seed: counts from the primes and the Fibonacci numbers, a
cellular automaton's rule, a spiral's growth ratio, Kepler's law, the golden angle, a
star polygon, a number spelled in binary. Mathematics to look at, not to read about.

Each has a voice: two or three quiet layers chosen by its family and seed (breath through
drifting resonances, beating glass, an inharmonic warble, a gliding voice, soft ticks on
its own light's rhythm, and a chord under a witnessed one), in the 42 Hz tuning, heard
from the ship by distance and bearing, darker and wetter far off, never loud.

A lone artifact appears just past what the fog lets you see, nearly dead ahead, and keeps
ahead of you until you have seen it: you can turn as you like and still meet it. It
materializes in the ordered dither, and once you have come near it and lost it from
sight, it dissolves the same way: there is no turning back for it.

## The look

Soundings' approach, taken outdoors: the world drawn at a low resolution and scaled up
by whole pixels, flat-shaded low-poly shapes in the codex's palette, posterized with
ordered dithering. Over it, a raymarched fog pass: height-layered (thick in the valleys),
drifting, lit by the sky, darker deep in the layer, and by the artifacts' lights in closed
form. The sun reaches the fog only where it can: each fog sample looks toward the sun
through a height map of the crowns and ridges and through the cloud deck, so low suns
throw beams between the trees and breaks in the overcast send shafts down by day; a
screen-space pass streams light from the sun past whatever stands in front of it. The
cloud deck's shadows roll over the forest in stepped bands.

The forest is spruce and fir, dark blue-greens. Rarely, a turned stand: one smooth field
over the world (about a twentieth of it, stands a few hundred meters to a kilometer
across) where most trees are birches, each a single lobed crown on a pale, marked trunk,
gold, deep gold, amber or rust by the tree, more of them still green toward the edges,
and fewer, so a stand fades out into the spruce. The ground under it goes russet, the fog
in it warms a little, and the giants stand dark over it. Whatever the weather, mist lies
in it: banks drifting between the trunks, under the crowns so their tops stand clear, and
only within a few hundred meters of the eye, so the horizon stays as the weather has it.
The canopy map carries how turned each place is beside the crowns' height; the fog pass
takes the mist along the stretch of each ray that can hold it, at even steps and not the
fog's jittered ones (a thin, thick layer would show the dither), and lays it over what is
behind. Three crown shapes, each tree
squashed, leaned and turned its own way. The bark is a true grey, which the tree shader
gives the tint's brightness and not its hue, so the trunks stay pale whatever the leaves.

## Time and weather, shared

The planet keeps Robinhood Chain's time: a day is 14,400 blocks (about 24 minutes), three
quarters of it daylight, with long golden hours. The fog's thickness and the breaks in the
clouds follow the same block clock, so everyone flying at the same moment shares the hour
and the weather. At night the aurora's strength follows the network, and every move sends
a pulse through it.

## The ship and the cabin

Seeker technology as the codex describes it: dark, minimal, fused with the organic, a pale
core of light. Inside: the windshield and the controls at the front (sit there to fly and
scan from inside), the coffee machine on the left wall, the Codex computer on the right,
a bunk, lockers, moss in a bowl, and the core breathing in a glass column at the back.

## A seeker aboard

The codex suggests activated seekers as companions and dormant ones as dark husks that
light up stage by stage; here one of your own comes aboard. It is built in voxels from its
exact collection art, the way Soundings builds them (the monitor rebuilt as a box from
the oblique picture, each add-on at its own depth, the floating object modeled as the
thing itself), shaded by its live charge stage, and hovers by the Codex computer, out of
the way, turning to watch you. It talks in monologues: every visual trait in the
collection (119 of them) has two lines of its own, so a seeker's voice is the sum of its
parts, dealt as a new permutation each time, with now and then a line about its charge,
the hour, or you. Computer-minded, quiet, mysterious, and sometimes dry or cheeky: a
tiny machine that has been waiting a long time and has opinions about the fog.

## Coffee

A tall machine after the Moccamaster, made matte black with pale edges: a water tank that
glows as it heats, a filter cone with a ring of light, a carafe on a warm plate, one
button. Making coffee is a short scene seen from outside yourself, in still shots with
hard cuts: the Seeker (the hooded figure, the only yellowish thing in view) presses the
button, watches it brew, pours, and drinks at the window while the fog goes by.

## The music

After a reference the project chose (an hour of ambient music in A minor over a deep
drone), measured rather than guessed: most of its energy under 60 Hz, almost none above
2 kHz, an event every half minute, loudness steady within two decibels, very wide.

The tuning keeps The Seeker's rule on another root: 42 Hz, with the music on 21/16 of it
(an A at 55.125 Hz, where the reference sits) and the palette 1, 9/8, 19/16, 3/2, 7/4, the
reference's own chord in just intonation. Tempo from the same root: 78.75 BPM.

A drone on the root; five voices that each move on their own clock to a near note,
swelling in and fading out over many seconds; some dissolve into breath at their pitch,
some are heard only in the hall, the rest sink slowly into darkness; a far soft tone now
and then; a tide, and every few minutes a rest. Through a chorus into a plate reverb whose
tail is swept like a chorus and whose reflections turn, so the space moves. Effects are
low swells, never bells. **M** keeps a passage (it returns); **R** saves the last minute.

## The Codex board

Nostr, because it needs no server of ours: kind 1 notes tagged `#lowpasscodex` on six
free relays, readable in any Nostr client. Free relays take anything, so readers keep the
board: every post is checked in the page (its signature; its wallet link, EIP-191, to an
address; that address holding a seeker now, read from the chain) and links are refused.
A scan travels as its origin (a transaction, or a wild artifact's seed) and its
photograph (a small JPEG).

Holders take names, and a name is the face they show: the newest name (a signed profile
event with the same proof) replaces the address on every post of theirs, past ones too,
for every reader, and the address stays out of sight. They can delete their posts too
(a NIP-09 deletion, honored by every reader and by most relays). Free relays promise
nothing, so no single one is trusted: notes go to all six and come from all six, every
game keeps what it has read and passes it back to any relay that lost it.

## Performance

Everything at a low resolution (auto: fewer pixels while frames are slow), instanced trees
in three levels of detail, chunks streamed around a floating origin, one shared lighting
model, no shadow maps (the sun's shadows come from the canopy height map, in the fog pass),
procedural audio, no build step. About 5 ms a frame on a laptop.

The forest must never visibly change around the ship. Each tree chooses its level of detail
on the GPU, at its own distance inside a band (from 250 m, and from 560 m), dissolving from
one level to the next over 16 m on the same 4x4 dither as everything else; a chunk only
decides which levels it may need, so no block of forest ever switches at once. The rare
giants keep their full shape at every distance (all of them drawn in one mesh). The
birches cost about what the spruce do: one crown of about a hundred faces near, ten far.
Artifact clearings dissolve the trees standing in them the same way, in the shader, instead of
rebuilding the chunk's trees.
