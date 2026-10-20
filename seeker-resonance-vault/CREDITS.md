# Credits and asset provenance

Resonance Vault community game by **@QuillshiftGame**:
https://x.com/QuillshiftGame

Includes or adapts assets from The Seeker by The Seeker contributors, licensed
CC BY 4.0: https://creativecommons.org/licenses/by/4.0/
Original project: https://github.com/TheSeekerGame/the-seeker
Changes were made where applicable.

World, visual direction, and public tuning guidance:
https://github.com/TheSeekerGame/seeker-codex

Community home:
https://github.com/TheSeekerGame/community-games

This community game extends the icy planet and Theorem setting. Its expedition
and outcome are its own interpretation, not a claim about the main game's canon.

## Included artwork

Five PNG files were preserved from the author's local Resonance Vault prototype.
Its sprite generator identifies the character, backpack, creature, and cave
elements as adapted from The Seeker under CC BY 4.0, with custom tile compositions.

| File | Use |
| --- | --- |
| `assets/glyphs.png` | Six tablet silhouettes and four creature cores |
| `assets/seeker.png` | Explorer animation and backpack progression |
| `assets/board_frame.png` | Stone, frost, webs, and frame details |
| `assets/diorama.png` | Layered cave panorama |
| `assets/spider.png` | Cave spider animation |
| `assets/capsule.png` | Unmodified upstream 54×154 capsule, verified source below |
| `assets/relic-runes.svg` | Six original pixel-grid relic symbols created for this community edition, CC BY 4.0 |

The inherited five-file sprite generator refers to local reference packs rather than an upstream
commit. Exact per-sprite upstream paths have not yet been reconstructed. The
existing attribution is preserved rather than treating the artwork as
unattributed original work. These exact source paths remain a documentation limitation.

The second review preserves the inherited glyph atlas and animated board artwork.
The new relic symbols use code-drawn rectangles and no external imagery.

## Verified capsule and cinematic interpretation

The capsule was replaced with the unmodified upstream artwork:
[CapsuleOutside__r1c1__54x154.png](https://github.com/TheSeekerGame/the-seeker/blob/e0896cd929f143be4d5480d90d0618374356ef88/assets/animations/objects/CapsuleOutside__r1c1__54x154.png)
at commit `e0896cd929f143be4d5480d90d0618374356ef88`, by The Seeker contributors, CC BY 4.0.
The local name is `assets/capsule.png`. Its long stem is a boarding rail; the upstream
[geometry](https://github.com/TheSeekerGame/the-seeker/blob/e0896cd929f143be4d5480d90d0618374356ef88/game/src/game/world_objects/capsule_shape.rs)
defines a lift and cabin hatch.

The landing adaptation, departure, landscape, and planetary horizon in
`cinematics.js` are this community game's composition. The main game's lore leaves
its ending unpublished. This return flight does not claim to depict that ending.
The sky contains no invented named moons or planetary measurements. The orbital
view is a composed camera shot, not an astronomical scale simulation.

## Code and sound

Board and presentation code are adapted from the author's Resonance Vault
prototype. The community edition removes external integrations and packaging,
fixes gameplay issues, and supplies an original `audio.js` implementation.
Sound is generated with standard browser oscillators; no audio files are bundled.

No fonts are distributed. The interface uses system fonts.
