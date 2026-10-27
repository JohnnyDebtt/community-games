# Release review 0.3 — 20 October 2026

Cinematic cleanup after the second art and gameplay pass. The author reported
playing through the game, confirmed the ending works, and approved GitHub
publication and community submission on 20 October 2026.
Published game scope: only this `seeker-resonance-vault/` directory.

## Landing and ending cleanup

- Replaced the old 52-pixel-wide capsule with the verified, unmodified upstream 54×154 sprite; source and commit are in CREDITS.md.
- Landing and departure share a fixed surface camera, capsule position, boarding rail, ground contact, and native-size explorer. The lift platform carries the explorer; the cabin hides them as they board.
- Departure proceeds through boarding, sealed cabin, engine startup, and continuous ascent. A fade marks the change to a separate wide orbital shot.
- Removed the large ringed moon, abrupt ship rescaling, duplicate terrain/planet scene, and the final image of an explorer left behind while their capsule flies away.
- The planet is represented by a shallow horizon with consistent curvature. Its size and framing are artistic composition for author review, not canon measurements.
- The final card credits @QuillshiftGame. This game's departure is explicitly a community interpretation, not The Seeker's official ending.
- A separate [cinematic review player](tools/cinematics.html) uses the same renderer, with play/pause, timeline, scene checkpoints, and low motion. It creates no game instance and never reads or writes campaign saves. Victory statistics there are labeled sample data.

## Previous art and gameplay pass

- **Preserved instrument panel.** The original full HUD, warmth thermometer, biome readout, illuminated panels, and board framing are restored following author feedback. Clutter reduction is limited to folding the long field reference and keeping relic editing in the codex.
- **Preserved animated artwork.** The original full tablet art, idle bobbing, selection pulses, glowing cores, particles, and cinematic presentation remain active by default. New chamber field notes and six original pixel-grid relic symbols add Seeker detail. All original PNG files remain intact. Low motion is optional.
- **Earned progression.** No starting Ammonite. Clear the first chamber to earn it. Old saves keep earned relics; an unearned starter Ammonite is removed. Normal matches thaw immediate orthogonal neighbors. Ammonite expands that reach to two orthogonal steps, including diagonals two steps away.
- **Tactical pressure.** Campaign charge starts at 20 instead of 40. A move earns 6 per cascade, capped at 18 before the Lens bonus. Later chambers have tougher spiders, more stone, and revised placement. Turn budgets are 18/18/18/20/20/22. Depth stops at each chamber boundary until the remaining objectives are met.
- **Run feedback.** Results show hints and forms used; failures also show moves. These counters stay in memory for the current run and are never transmitted.
- **Motion and keyboard controls.** Motion: Low respects the system preference on load, freezes ambient motion, skips cinematic travel, and suppresses shake, beams, and particles. Essential swap/gravity animation remains. Dialogs contain keyboard focus, make the background inert, and return focus when closed.
- **Dead-board fix.** Repair now checks that its replacement pattern creates a legal move without accidentally creating another premade match.

Field notes and this expedition remain a community interpretation, not new official Seeker canon. No proprietary audio, wallet, token, network client, or deployment code was introduced. The small original audio module is unchanged.

## Balance comparison

Run `npm run balance` to reproduce the current 40 seeds per chamber, two-policy comparison. Both policies use Bat and Torch. Each chamber is simulated separately with up to two relics earned in preceding chambers. This is a controlled comparison, not six consecutive human plays and not a simulation of every possible loadout. The same progression loadout policy was used for the pre-pass baseline.

| Chamber | First valid swap, before | First valid swap, now | Hazard-focused, now | Hazard-focused mean moves, now |
| --- | ---: | ---: | ---: | ---: |
| Surface Fissure | 93% | 85% | 100% | 3.5 |
| Moss Bat Perch | 95% | 55% | 100% | 5.2 |
| Spider's Silk Web | 100% | 45% | 100% | 4.7 |
| Abyssal Trench | 90% | 53% | 100% | 6.7 |
| Buzzer Harmonic Forge | 90% | 60% | 100% | 7.7 |
| Demigod Sanctuary | 98% | 53% | 100% | 8.4 |

Percentages are rounded from 40 attempts each. The hazard-focused policy also cleared 100% before this pass. Its mean completion time increases from 2.3/3.0/2.4/4.2/5.7/5.6 moves to the values above.

Interpretation: spending moves near hazards matters more, and the opening remains forgiving. These results do not establish human difficulty or enjoyment. The 100% tactical clear rate suggests room for an optional challenge mode later; this candidate keeps the main expedition approachable.

## Verification

- `npm test`: **23 passing tests**, including 600 seeded initial boards, 60 complete simulated runs, powers, hazards, gravity, outcome cancellation, save migration, charge caps, thaw range, low motion, cinematic boarding/shot transitions, 338 sampled cinematic frames with native sprite rectangles, and release boundaries.
- Balance comparison: **480 current-build runs** with filled boards and no deadlock.
- Browser on the nested community route: pointer swap, keyboard swap at phone width, hint, Bat form and charge deduction, guide disclosure, relic symbols, manual focus cycle and Escape, and low-motion control.
- Desktop review at 1200×900; phone-width review at 390×844. No horizontal overflow at the tested phone width; the board retains its 6:7 aspect ratio.
- Cinematic review player: landing and departure playback, boarding alignment, liftoff, orbit, and the victory card visually inspected. Browser logs showed no errors.
- Browser logs inspected for game errors. This is a desktop viewport simulation, not a physical touchscreen test.

The final-chamber transition is covered in the logic harness, and the actual shared ending renderer was visually reviewed in its local player. The author subsequently reported a successful playthrough and working ending. Audio has not been auditioned during the automated review. Safari/Firefox, physical touch input, and screen-reader use remain unverified. Keyboard and dialog improvements do not constitute full screen-reader support; the canvas still needs a structured narrated board alternative.

## Remaining review points

1. Play chambers 1–3, especially the spiders in chamber 3. Note whether failure feels understandable and whether the hint/core system helps you plan.
2. Compare frost and webs against the restored animated tablet art. Both should remain distinguishable on a phone; color is supplemented by pips and silhouettes.
3. Try Motion: Low and sound on/off. A continuous musical score is not included; the unchanged sound effects use the public Seeker tuning.
4. Responsive scaling still uses fractional CSS scaling below native board size. Cinematic sprites now use native integer dimensions in the canvas. This is not yet a claim of strict integer-pixel compliance at every viewport.
5. Improve inherited PNG provenance described in `CREDITS.md`. The capsule now has verified upstream provenance; exact paths/commit for the other five inherited PNGs remain unresolved. The new SVG symbols are original to this community edition and listed separately.

## Publication boundary

The author approved copying this directory to the community repository on a contribution branch with catalog links. Community maintainers review and merge that contribution. No deployment workflow is included.

The original patch was checked against community README blob `0c070eb9fdf3fa0a24b3481b619c880c3f0a983b` and homepage blob `f34d6d639ca0d10033dcd355df4e411b2b0a60c1`; those are reference snapshots, not a claim that the remote repository is unchanged.
