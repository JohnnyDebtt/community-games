# Dweller

A dark side-scroller: you are a small hooded figure hiding in shadow. Light burns, shadow heals. Reach the glowing rainbow crystal at the end of the level (about 5-15 minutes).

Single self-contained file: `index.html` (code, art and procedural music are all inside). Controls: A/D or arrows move, Space jump, S roll/crawl, Esc pause (N starts a new descent), M mute, F fullscreen.

Source, level generator and solver bot: https://github.com/JohnnyDebtt/DWELLER

The terrain tiles follow The Seeker's ice-biome tiling and are baked into `index.html`. After changing the level, rebake them from a checkout of The Seeker (needs Python with Pillow, and Node):

```sh
python3 tools/extract_ice_tiling.py path/to/the-seeker tiling.json
node tools/bake_terrain.cjs index.html tiling.json
```

Code is MIT. Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY 4.0 (https://github.com/TheSeekerGame/the-seeker). Changes were made where applicable.
