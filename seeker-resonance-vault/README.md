# The Seeker: Resonance Vault

A tactical match-three expedition beneath an icy planet. Swap mineral tablets,
thaw frost, repel cave spiders, and uncover six chambers of Theorem's lost archive.
This is a community interpretation of The Seeker universe, not a canonical ending.

## Play

Community game by [@QuillshiftGame](https://x.com/QuillshiftGame).

Open `index.html` in a modern browser. All scripts and sprites are relative, local
files. No installation, build, account, or network connection is required.
Progress (chambers, stars, scores, and relics) stays in this browser's local storage.
Storage restrictions disable saving gracefully; clearing site data resets progress.
File previews and a hosted site have separate saves.

Click **Enter the fissure**. Tap two neighboring tablets or drag a tablet to its
neighbor to make a line of three. Frost, webs, spiders, and stone block swaps.
Match beside them or use a creature core to clear them.

- Four in a line forges a Bat Core; five forges a Guardian Core; crossing matches
  forge a Spider Core. Select a core twice or swap it to detonate.
- Orange Ember matches restore warmth. Cold below 35% spreads frost.
- H gives a free visual hint. Creature powers 1–4 spend charge; Squid Siphon
  also spends a turn because it clears the board.
- R opens relics, C opens the chamber map, ? opens the manual, M toggles sound.
- Tab to the board, move with arrow keys, and press Enter or Space to select.
- Motion: Low freezes ambient movement, removes shake/beam/particle effects, and skips cinematic travel. It follows your system preference on load.
- The Field guide folds away the tile and hazard reference. Relics are earned by clearing chambers; none are supplied at the start.
- Complete the checklist before turns run out. Retry freely. The chamber map
  also offers Endless Descent for practice.

## GitHub hosting and community submission

For your own GitHub game repository, use the contents of this game directory as
the repository root so `index.html` is at the top level. It is already a standalone
static game; no proprietary package or service is needed.

For a contribution to the community-games repository:

Copy **only this directory** into `TheSeekerGame/community-games` as
`seeker-resonance-vault/`. Add its link to the repository's root `index.html`
and its table row to the root `README.md`. GitHub Pages serves the files directly
from `main`.

Expected route after an approved deployment:
`/community-games/seeker-resonance-vault/`.

No deployment workflow is included. The author approved publication after a
local playthrough and confirmed the ending on 20 October 2026.

## Development and verification

Edit the plain HTML, CSS, and JavaScript directly. No dependencies or bundler.
Optional developer commands, with Node.js 18 or newer:

```sh
npm test
npm run balance
npm start
```

The preview server binds to `127.0.0.1:4173` and exposes this game's folder only.
It supports the nested community route to test relative paths.
Tests cover board rules, campaign transitions, save validation, and release boundaries.
See `REVIEW.md` for checks performed, limitations, and the art/playtesting backlog.
For landing and ending review without changing a save, open `tools/cinematics.html`
or visit that path beneath the local preview URL. It uses the actual game renderer.

## Codex alignment

The cold stone and ice palette, muted gold explorer, creature-derived abilities,
12 fps sprite clock, and public 48 Hz tuning come from The Seeker Codex.
The small audio module is original Web Audio synthesis using the public
48/54/57/63/72/84 Hz palette in higher octaves. It uses no third-party audio engine.
Gameplay is entirely local and score multipliers come from match rules.

See `CREDITS.md` and `LICENSE.md` for attribution and terms.
