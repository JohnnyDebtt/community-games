# Community games

Games made in the universe of [The Seeker](https://github.com/TheSeekerGame/the-seeker).
Each one lives in its own folder, runs in the browser from static files, and is playable
at <https://theseekergame.github.io/community-games/>.

| Game | | Play |
| --- | --- | --- |
| [Low Pass](lowpass/) | A slow survey flight over an endless fog forest on The Seeker's planet: scan the artifacts that rise out of the fog, keep a Codex, stay awake with coffee, and witness the moment a SEEKER NET seeker moves on chain. | [play](https://theseekergame.github.io/community-games/lowpass/) |
| [Soundings](soundings/) | A quiet ice-fishing game on the frozen sea of The Seeker's planet, with SEEKER NET seekers at your side. | [play](https://theseekergame.github.io/community-games/soundings/) |
| [Dweller](dweller/) | A dark side-scroller: stay in the shadow, avoid the light, reach the rainbow crystal. | [play](https://theseekergame.github.io/community-games/dweller/) |
| [Resonance Vault](seeker-resonance-vault/) | A tactical match-three descent through six icy chambers. Thaw frost, borrow creature powers, and uncover Theorem relics. By [@QuillshiftGame](https://x.com/QuillshiftGame). | [play](https://theseekergame.github.io/community-games/seeker-resonance-vault/) |

## Adding a game

Put it in its own folder with an `index.html` and keep every path relative (the site is
served from `/community-games/`). Then add it to the launcher:

1. A cover in `assets/covers/<folder>.png`: a 16:9 picture of the game itself (about
   960 x 540; pixel art at a whole multiple of its pixels, so it stays crisp).
2. A card in `index.html`, copied from one of the others: its folder, title, a line for
   the card, a longer line for the featured banner (`data-tagline`), its tags and where
   its source is. The featured banner and its selector are made from the cards, in
   their order.
3. A row in the table above.

No build step: GitHub Pages serves `main` as it is.

## License

Code is MIT or Apache-2.0, at your option; project-owned assets are CC BY 4.0; fonts
are SIL Open Font License 1.1. See [LICENSE.md](LICENSE.md).
