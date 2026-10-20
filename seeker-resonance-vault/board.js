// SPDX-License-Identifier: MIT OR Apache-2.0
/**
 * The Seeker: Resonance Vault - Polished Tactical Cavern Survival Board Engine
 * Upgrades:
 * - Smooth interpolated tile swap animations (slide + invalid swap bounce-back)
 * - Match flash & scale-pop animations before gravity cascade
 * - Visual FX Beams: Sonar Cross Beams (✚), 3x3 Shockwave Rings (✕), Prismatic Arcs (❖)
 * - Synchronized gravity drop physics (cascades wait until tiles land)
 * - Tap-to-Detonate OR Swap-to-Combine Special Creature Cores
 * - Auto-Shuffle on deadlock + 3.0s Idle Move Coach so players never get stuck
 */

const GLYPH_META = [
  { id: 0, name: 'Fossil Shell',    hz: '48 Hz', ratio: '1:1',   note: 'Root (C)',     color: '#DFE6E6', pip: 1, role: 'Base Harmonic' },
  { id: 1, name: 'Rime Crystal',    hz: '54 Hz', ratio: '9:8',   note: 'Major 2nd (D)',color: '#91CBDE', pip: 2, role: 'Base Harmonic' },
  { id: 2, name: 'Spore Pod',       hz: '57 Hz', ratio: '19:16', note: 'Minor 3rd',    color: '#A5C77F', pip: 3, role: 'Base Harmonic' },
  { id: 3, name: 'Ember Crucible',  hz: '63 Hz', ratio: '21:16', note: 'Sub-Fourth',   color: '#E28C6B', pip: 4, role: 'Warms Cavern (+Heat)' },
  { id: 4, name: 'Abyssal Eye',     hz: '72 Hz', ratio: '3:2',   note: 'Perfect 5th',  color: '#B584C4', pip: 5, role: 'Base Harmonic' },
  { id: 5, name: 'Gold Reliquary',  hz: '84 Hz', ratio: '7:4',   note: 'Harmonic 7th', color: '#E8CD86', pip: 6, role: '2x Depth & Score' },
  { id: 6, name: 'Bat Core (✚)',    hz: '96 Hz', ratio: '2:1',   note: 'Sonar Line',   color: '#A5C77F', pip: 4, role: 'Tap/Swap: Row+Col Blast' },
  { id: 7, name: 'Spider Core (✕)', hz: '108 Hz',ratio: '9:4',   note: 'Web Blast',    color: '#D6EDF5', pip: 5, role: 'Tap/Swap: 3x3 Bomb' },
  { id: 8, name: 'Squid Core (◎)',  hz: '144 Hz',ratio: '3:1',   note: 'Void Siphon',  color: '#B584C4', pip: 6, role: 'Tap/Swap: Color Siphon' },
  { id: 9, name: 'Guardian (❖)',    hz: '168 Hz',ratio: '7:2',   note: 'Prismatic',    color: '#FFF9D2', pip: 6, role: 'Tap/Swap: Color + Warmth' }
];

const RELIC_DEFINITIONS = [
  {
    id: 'ammonite',
    name: 'Glacial Ammonite',
    icon: '<span class="relic-rune rune-0" aria-hidden="true"></span>',
    chamber: 'Chamber 1 · Surface Fissure',
    perkTitle: '2x Thaw Radius',
    desc: 'Matches thaw frost and webs within two orthogonal steps, instead of only the four immediate neighbors.',
    tag: 'Survival'
  },
  {
    id: 'vertebra',
    name: 'Echoing Vertebra',
    icon: '<span class="relic-rune rune-1" aria-hidden="true"></span>',
    chamber: 'Chamber 2 · Moss Bat Perch',
    perkTitle: 'Free Bat Core (✚)',
    desc: 'Spawns an active Bat Sonar Core (✚) on the board at the beginning of every chamber to instantly blast a full row and column.',
    tag: 'Sonar'
  },
  {
    id: 'geode',
    name: 'Silk-Bound Geode',
    icon: '<span class="relic-rune rune-2" aria-hidden="true"></span>',
    chamber: 'Chamber 3 · Spider’s Silk Web',
    perkTitle: 'Web Heat Siphon',
    desc: 'Slicing sticky spider webs instantly restores +15% Cavern Warmth, protecting you from creeping hypothermia.',
    tag: 'Thermal'
  },
  {
    id: 'lens',
    name: 'Abyssal Squid Lens',
    icon: '<span class="relic-rune rune-3" aria-hidden="true"></span>',
    chamber: 'Chamber 4 · Abyssal Trench',
    perkTitle: '+50% Charge Surge',
    desc: 'Increases all Resonance Gauge attunement charge generated from match combos by +50%, letting you trigger creature powers faster.',
    tag: 'Attunement'
  },
  {
    id: 'fork',
    name: 'Theorem Tuning Fork',
    icon: '<span class="relic-rune rune-4" aria-hidden="true"></span>',
    chamber: 'Chamber 5 · Buzzer Harmonic Forge',
    perkTitle: '3x Gold Depth & Score',
    desc: 'Matching Gold Reliquary tablets (6 pips) yields 3x Depth progression and 3x Resonance Score.',
    tag: 'Economy'
  },
  {
    id: 'crest',
    name: 'Planetary Guardian Crest',
    icon: '<span class="relic-rune rune-5" aria-hidden="true"></span>',
    chamber: 'Chamber 6 · Demigod Sanctuary',
    perkTitle: 'Sanctuary Frost Immunity',
    desc: 'The central 3x3 sanctuary of the board is permanently immune to Creeping Frost—tiles in the center will never freeze.',
    tag: 'Sanctuary'
  }
];

const CHAMBERS = [
  {
    id: 1,
    name: 'THE GLACIAL SHELF',
    subtitle: 'Chamber 1 · Surface Fissure',
    startDepth: 0,
    targetDepth: 150,
    maxTurns: 18,
    biomeIdx: 0,
    artifact: 'Glacial Ammonite',
    fieldNote: 'The surface is silent. A weak signal returns from beneath the ice.',
    description: 'Swap adjacent tiles to line up 3+ matching colors. Match next to Frost () to thaw 6 ice blocks and descend to -150m!',
    objectives: { depth: 150, frost: 6, spiders: 0, obelisks: 0 },
    initialFrost: [[0,1],[6,1],[1,3],[5,3],[2,5],[4,5]],
    initialWebs: [],
    spiders: [],
    obelisks: []
  },
  {
    id: 2,
    name: 'ECHOING HOLLOWS',
    subtitle: 'Chamber 2 · Moss Bat Perch',
    startDepth: 150,
    targetDepth: 320,
    maxTurns: 18,
    biomeIdx: 1,
    artifact: 'Echoing Vertebra',
    fieldNote: 'Stone interrupts the signal. Its edges are too regular to be natural.',
    description: 'Ancient stone Obelisks () block the path. Match next to them—or match 4-in-a-row to forge a Bat Core (✚)—to shatter 3 Obelisks!',
    objectives: { depth: 320, frost: 0, spiders: 0, obelisks: 3 },
    initialFrost: [[0,3],[6,3]],
    initialWebs: [],
    spiders: [],
    obelisks: [[1,3,3], [3,4,3], [5,3,3]]
  },
  {
    id: 3,
    name: 'THE CRYSTALLINE VAULT',
    subtitle: 'Chamber 3 · Spider’s Silk Web',
    startDepth: 320,
    targetDepth: 540,
    maxTurns: 18,
    biomeIdx: 1,
    artifact: 'Silk-Bound Geode',
    fieldNote: 'Threads tremble in the dark. Become still enough to hear their keepers.',
    description: 'Cave Spiders () spin sticky webs! Match tiles next to Spiders or hit them with Core blasts to repel 2 Spiders and reach -540m.',
    objectives: { depth: 540, frost: 4, spiders: 2, obelisks: 0 },
    initialFrost: [[1,1],[5,1],[0,5],[6,5]],
    initialWebs: [[2,4],[4,4]],
    spiders: [{ c: 1, r: 5, hp: 4 }, { c: 5, r: 5, hp: 4 }],
    obelisks: []
  },
  {
    id: 4,
    name: 'BIOLUMINESCENT CHASM',
    subtitle: 'Chamber 4 · Abyssal Trench',
    startDepth: 540,
    targetDepth: 780,
    maxTurns: 20,
    biomeIdx: 2,
    artifact: 'Abyssal Squid Lens',
    fieldNote: 'The air grows warmer, yet the frost holds. Something is keeping it here.',
    description: 'Deep chill! Match orange Ember Crucibles (4 pips) to keep Warmth above 35%, thaw 6 Frost, and shatter 2 Obelisks.',
    objectives: { depth: 780, frost: 6, spiders: 2, obelisks: 3 },
    initialFrost: [[0,1],[0,5],[6,1],[6,5],[1,3],[5,3]],
    initialWebs: [[3,4]],
    spiders: [{ c: 1, r: 2, hp: 3 }, { c: 5, r: 2, hp: 3 }],
    obelisks: [[2,4,3], [4,4,3], [3,1,3]]
  },
  {
    id: 5,
    name: 'THE RESONANT CRUCIBLE',
    subtitle: 'Chamber 5 · Buzzer Harmonic Forge',
    startDepth: 780,
    targetDepth: 920,
    maxTurns: 20,
    biomeIdx: 2,
    artifact: 'Theorem Tuning Fork',
    fieldNote: 'Gold carries the resonance deeper. Follow the veins, not their brightness.',
    description: 'Rich gold veins lie beneath 4 Obelisks. Combine Special Cores or use Creature Form powers [1–4] to break through!',
    objectives: { depth: 920, frost: 4, spiders: 3, obelisks: 4 },
    initialFrost: [[0,0],[6,0],[0,6],[6,6]],
    initialWebs: [[3,1],[3,5]],
    spiders: [{ c: 1, r: 2, hp: 3 }, { c: 5, r: 2, hp: 3 }, { c: 3, r: 6, hp: 3 }],
    obelisks: [[1,4,3], [3,3,3], [5,4,3], [3,0,3]]
  },
  {
    id: 6,
    name: 'THE ABYSSAL HEART',
    subtitle: 'Chamber 6 · Demigod Sanctuary',
    startDepth: 920,
    targetDepth: 1051,
    maxTurns: 22,
    biomeIdx: 3,
    artifact: 'Planetary Guardian Crest',
    fieldNote: 'A guardian waits in the sanctuary. Whether it protects or remembers, we cannot tell.',
    description: 'The final vault chamber at -1,051m. Repel 3 Abyssal Spiders, shatter 4 Obelisks, and complete the survey. The deeper signal remains unexplained.',
    objectives: { depth: 1051, frost: 6, spiders: 3, obelisks: 4 },
    initialFrost: [[0,0],[6,0],[0,6],[6,6],[1,3],[5,3]],
    initialWebs: [[2,2],[4,2]],
    spiders: [{ c: 1, r: 1, hp: 4 }, { c: 5, r: 1, hp: 4 }, { c: 3, r: 5, hp: 4 }],
    obelisks: [[2,3,3], [3,2,3], [4,3,3], [3,6,3]]
  }
];

class ResonanceBoard {
  constructor(audio, onMatchCallback) {
    this.audio = audio;
    this.onMatch = onMatchCallback;
    this.cols = 7;
    this.rows = 7;

    this.grid = [];
    this.obeliskHp = [];
    this.frost = [];
    this.web = [];
    this.veins = [];

    // Per-cell animation state (in 64px canvas units)
    this.yOffsets = [];     // Vertical drop offset in pixels (0..448)
    this.yVelocities = [];  // Vertical drop velocity
    this.swapOffsets = [];  // {x, y} pixel offset during swap or bounce
    this.scaleAnims = [];   // Scale multiplier (1.0 normal, >1.0 when matching/spawning)
    this.flashAnims = [];   // Flash alpha (0..1) when matched

    // Visual FX overlays (beams, shockwaves, lightning arcs)
    this.fxBeams = [];      // { type: 'row'|'col'|'ring'|'arc', ... life, maxLife, color }
    this.screenShake = 0;   // Screen shake intensity in pixels

    this.spiders = [];
    this.selectedTile = null;
    this.hoverCell = null;
    this.coachMove = null;  // {c1, r1, c2, r2} suggested move after idle
    this.idleTimer = 0;

    this.animTime = 0;
    this.particles = [];
    this.popups = [];
    this.isResolving = false;
    this.isSwapping = false;

    // Legacy compatibility array
    this.chain = [];

    this.warmth = 75;
    this.equippedRelics = new Set();
    this.currentChamber = null;

    this.sessionStats = {
      frostCleared: 0,
      websCleared: 0,
      spidersRepelled: 0,
      obelisksShattered: 0,
      combosTriggered: 0,
      coresCreated: 0
    };

    this.init();
  }

  inBounds(c, r) {
    return c >= 0 && c < this.cols && r >= 0 && r < this.rows;
  }

  init() {
    this.grid = [];
    this.obeliskHp = [];
    this.frost = [];
    this.web = [];
    this.veins = [];
    this.yOffsets = [];
    this.yVelocities = [];
    this.swapOffsets = [];
    this.scaleAnims = [];
    this.flashAnims = [];
    this.fxBeams = [];
    this.spiders = [];
    this.selectedTile = null;
    this.coachMove = null;
    this.idleTimer = 0;
    this.isResolving = false;
    this.isSwapping = false;
    this.warmth = 75;

    this.sessionStats = {
      frostCleared: 0,
      websCleared: 0,
      spidersRepelled: 0,
      obelisksShattered: 0,
      combosTriggered: 0,
      coresCreated: 0
    };

    for (let r = 0; r < this.rows; r++) {
      const row = [], hpRow = [], frostRow = [], webRow = [], veinRow = [];
      const offRow = [], velRow = [], swapRow = [], scaleRow = [], flashRow = [];
      for (let c = 0; c < this.cols; c++) {
        row.push(this.randomBaseGlyph());
        hpRow.push(0);
        frostRow.push(false);
        webRow.push(false);
        veinRow.push(Math.random() < 0.10);
        offRow.push((r + 2) * 44 + c * 10); // Staggered entrance drop
        velRow.push(120);
        swapRow.push({ x: 0, y: 0 });
        scaleRow.push(1.0);
        flashRow.push(0);
      }
      this.grid.push(row);
      this.obeliskHp.push(hpRow);
      this.frost.push(frostRow);
      this.web.push(webRow);
      this.veins.push(veinRow);
      this.yOffsets.push(offRow);
      this.yVelocities.push(velRow);
      this.swapOffsets.push(swapRow);
      this.scaleAnims.push(scaleRow);
      this.flashAnims.push(flashRow);
    }

    this.sanitizeInitialBoard();
    this.ensureValidMoves();
    this.coachMove = this.findBestSwap();
  }

  loadChamber(ch) {
    this.currentChamber = ch;
    this.init();

    if (ch && ch.initialFrost) {
      ch.initialFrost.forEach(([c, r]) => {
        if (this.frost[r] && this.frost[r][c] !== undefined) this.frost[r][c] = true;
      });
    }
    if (ch && ch.initialWebs) {
      ch.initialWebs.forEach(([c, r]) => {
        if (this.web[r] && this.web[r][c] !== undefined) this.web[r][c] = true;
      });
    }
    if (ch && ch.obelisks) {
      ch.obelisks.forEach(([c, r, hp]) => {
        if (this.grid[r] && this.grid[r][c] !== undefined) {
          this.grid[r][c] = -2;
          this.obeliskHp[r][c] = hp || 2;
          this.frost[r][c] = false;
          this.web[r][c] = false;
        }
      });
    }
    if (ch && ch.spiders) {
      this.spiders = ch.spiders.map(s => ({
        c: s.c,
        r: s.r,
        hp: s.hp || 2,
        maxHp: s.hp || 2,
        turnsUntilWeb: 2,
        hitFlash: 0
      }));
    }

    // Relic Perk: Echoing Vertebra spawns a free Bat Core (✚)
    if (this.equippedRelics.has('vertebra')) {
      const sc = 3, sr = 2;
      if (this.grid[sr][sc] >= 0) {
        this.grid[sr][sc] = 6;
        this.frost[sr][sc] = false;
        this.web[sr][sc] = false;
      }
    }

    this.sanitizeInitialBoard();
    this.ensureValidMoves();
    this.coachMove = this.findBestSwap();
  }

  randomBaseGlyph() {
    if (Math.random() < 0.13) return 5;
    return Math.floor(Math.random() * 5);
  }

  sanitizeInitialBoard() {
    for (let pass = 0; pass < 8; pass++) {
      let changed = false;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] < 0 || this.grid[r][c] >= 6) continue;
          if (c >= 2 && this.grid[r][c] === this.grid[r][c - 1] && this.grid[r][c] === this.grid[r][c - 2]) {
            this.grid[r][c] = (this.grid[r][c] + 1) % 5;
            changed = true;
          }
          if (r >= 2 && this.grid[r][c] === this.grid[r - 1][c] && this.grid[r][c] === this.grid[r - 2][c]) {
            this.grid[r][c] = (this.grid[r][c] + 1) % 5;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
  }

  ensureValidMoves() {
    if (this.findBestSwap()) return;
    // Repair a dead board without leaving a free match elsewhere in the grid.
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        if (this.canTileMove(c, r) && this.canTileMove(c - 1, r) && this.canTileMove(c + 1, r) && this.canTileMove(c + 1, r - 1)) {
          const cells = [[c - 1, r], [c, r], [c + 1, r], [c + 1, r - 1]];
          if (cells.some(([x, y]) => this.grid[y][x] >= 6)) continue;
          const original = cells.map(([x, y]) => this.grid[y][x]);
          for (let color = 0; color < 6; color++) {
            for (let other = 0; other < 6; other++) {
              if (other === color) continue;
              cells.forEach(([x, y], i) => { this.grid[y][x] = i === 2 ? other : color; });
              if (this.findMatchGroups().matchedCells.size === 0 && this.findBestSwap()) return;
            }
          }
          cells.forEach(([x, y], i) => { this.grid[y][x] = original[i]; });
        }
      }
    }
    // A heavily locked board can have no four-cell repair footprint.
    // Give the player one activatable core while preserving every hazard.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.canTileMove(c, r)) {
          this.grid[r][c] = 6;
          return;
        }
      }
    }
  }

  getTile(c, r) {
    if (!this.inBounds(c, r)) return null;
    return this.grid[r][c];
  }

  setTile(c, r, val) {
    if (this.inBounds(c, r)) {
      this.grid[r][c] = val;
    }
  }

  isAdjacent(c1, r1, c2, r2) {
    const dc = Math.abs(c1 - c2);
    const dr = Math.abs(r1 - r2);
    return (dc === 1 && dr === 0) || (dc === 0 && dr === 1);
  }

  canTileMove(c, r) {
    const t = this.getTile(c, r);
    if (t === null || t < 0) return false;
    if (this.frost[r]?.[c] || this.web[r]?.[c]) return false;
    if (this.spiders.some(s => s.c === c && s.r === r)) return false;
    return true;
  }

  findMatchGroups() {
    const matchedCells = new Set();
    const groups = [];

    // Horizontal scan
    for (let r = 0; r < this.rows; r++) {
      let runType = null, runStart = 0, runLen = 0;
      for (let c = 0; c <= this.cols; c++) {
        const t = c < this.cols ? this.grid[r][c] : null;
        const matchable = t !== null && t >= 0 && t <= 5;
        if (matchable && t === runType) {
          runLen++;
        } else {
          if (runLen >= 3 && runType !== null) {
            const cells = [];
            for (let k = runStart; k < runStart + runLen; k++) {
              cells.push({ c: k, r });
              matchedCells.add(`${k},${r}`);
            }
            groups.push({ type: runType, cells, dir: 'h' });
          }
          runType = matchable ? t : null;
          runStart = c;
          runLen = matchable ? 1 : 0;
        }
      }
    }

    // Vertical scan
    for (let c = 0; c < this.cols; c++) {
      let runType = null, runStart = 0, runLen = 0;
      for (let r = 0; r <= this.rows; r++) {
        const t = r < this.rows ? this.grid[r][c] : null;
        const matchable = t !== null && t >= 0 && t <= 5;
        if (matchable && t === runType) {
          runLen++;
        } else {
          if (runLen >= 3 && runType !== null) {
            const cells = [];
            for (let k = runStart; k < runStart + runLen; k++) {
              cells.push({ c, r: k });
              matchedCells.add(`${c},${k}`);
            }
            groups.push({ type: runType, cells, dir: 'v' });
          }
          runType = matchable ? t : null;
          runStart = r;
          runLen = matchable ? 1 : 0;
        }
      }
    }

    return { groups, matchedCells };
  }

  canSwap(c1, r1, c2, r2) {
    if (!this.inBounds(c1, r1) || !this.inBounds(c2, r2)) return false;
    if (!this.isAdjacent(c1, r1, c2, r2)) return false;
    if (!this.canTileMove(c1, r1) || !this.canTileMove(c2, r2)) return false;

    const t1 = this.grid[r1][c1];
    const t2 = this.grid[r2][c2];

    if (t1 >= 6 || t2 >= 6) return true;

    this.grid[r1][c1] = t2;
    this.grid[r2][c2] = t1;
    const { matchedCells } = this.findMatchGroups();
    this.grid[r1][c1] = t1;
    this.grid[r2][c2] = t2;

    // Existing matches elsewhere must not make an unrelated swap legal.
    return matchedCells.has(`${c1},${r1}`) || matchedCells.has(`${c2},${r2}`);
  }

  getValidSwapNeighbors(c, r) {
    const valid = [];
    if (!this.canTileMove(c, r)) return valid;
    [[1,0],[-1,0],[0,1],[0,-1]].forEach(([dc, dr]) => {
      const nc = c + dc, nr = r + dr;
      if (this.canSwap(c, r, nc, nr)) {
        valid.push({ c: nc, r: nr });
      }
    });
    return valid;
  }

  async handleTileSelect(c, r) {
    if (this.isResolving || this.isSwapping) return;
    this.idleTimer = 0;
    this.coachMove = null;

    if (!this.selectedTile) {
      if (!this.canTileMove(c, r)) {
        if (this.frost[r]?.[c]) this.addPopup(c, r, 'FROZEN ', 'Match next to it!', '#91CBDE');
        else if (this.web[r]?.[c]) this.addPopup(c, r, 'WEBBED ', 'Match next to it!', '#DFE6E6');
        else if (this.grid[r]?.[c] === -2) this.addPopup(c, r, 'OBELISK ', 'Blast adjacent!', '#DFE6E6');
        else if (this.spiders.some(s => s.c === c && s.r === r)) this.addPopup(c, r, 'CAVE SPIDER ', 'Match next to it!', '#E84D3D');
        return;
      }
      const t = this.getTile(c, r);
      this.selectedTile = { c, r };
      this.scaleAnims[r][c] = 1.22;
      this.audio.playGlyphTone(t < 6 ? t : 5, 0);
      return;
    }

    const { c: c1, r: r1 } = this.selectedTile;

    // Clicking the already-selected tile:
    // If it's a Special Core (6..9), tapping it a second time detonates it in place!
    if (c1 === c && r1 === r) {
      const t = this.getTile(c, r);
      this.selectedTile = null;
      if (t >= 6) {
        await this.detonateCoreInPlace(c, r, t);
      }
      return;
    }

    if (this.isAdjacent(c1, r1, c, r)) {
      this.selectedTile = null;
      await this.executeSwap(c1, r1, c, r);
    } else {
      if (this.canTileMove(c, r)) {
        const t = this.getTile(c, r);
        this.selectedTile = { c, r };
        this.scaleAnims[r][c] = 1.22;
        this.audio.playGlyphTone(t < 6 ? t : 5, 0);
      } else {
        this.selectedTile = null;
      }
    }
  }

  async animateSwapSlide(c1, r1, c2, r2, durationMs, bounceBack = false) {
    this.isSwapping = true;
    const dx = (c2 - c1) * 64;
    const dy = (r2 - r1) * 64;
    const start = performance.now();

    return new Promise(resolve => {
      const step = now => {
        const t = Math.min(1, Math.max(0, (now - start) / durationMs));
        if (!bounceBack) {
          const ease = 1 - Math.pow(1 - t, 3);
          this.swapOffsets[r1][c1] = { x: dx * (1 - ease), y: dy * (1 - ease) };
          this.swapOffsets[r2][c2] = { x: -dx * (1 - ease), y: -dy * (1 - ease) };
        } else {
          const wave = Math.sin(t * Math.PI) * 0.45;
          this.swapOffsets[r1][c1] = { x: dx * wave, y: dy * wave };
          this.swapOffsets[r2][c2] = { x: -dx * wave, y: -dy * wave };
        }

        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          this.swapOffsets[r1][c1] = { x: 0, y: 0 };
          this.swapOffsets[r2][c2] = { x: 0, y: 0 };
          this.isSwapping = false;
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  async detonateCoreInPlace(c, r, coreType) {
    this.isResolving = true;
    this.idleTimer = 0;
    this.coachMove = null;

    const specRes = await this.resolveSpecialCombo(c, r, coreType, c, r, this.randomBaseGlyph());

    let comboCount = 1;
    let totalDepthGain = specRes.depth;
    let totalScoreGain = specRes.score;

    while (true) {
      const { groups, matchedCells } = this.findMatchGroups();
      if (matchedCells.size === 0) break;
      comboCount++;
      const res = await this.resolveMatchStep(groups, matchedCells, comboCount, { c1: c, r1: r, c2: c, r2: r });
      totalDepthGain += res.depth;
      totalScoreGain += res.score;
      await this.applyGravity();
    }

    this.processTurnEvents();
    this.ensureValidMoves();

    if (this.onMatch) {
      this.onMatch({
        comboCount,
        totalDepthGain,
        totalScoreGain,
        warmth: this.warmth
      });
    }
    this.isResolving = false;
  }

  async executeSwap(c1, r1, c2, r2) {
    if (this.isResolving || this.isSwapping) return;
    this.isResolving = true;
    this.idleTimer = 0;
    this.coachMove = null;

    if (!this.canTileMove(c1, r1) || !this.canTileMove(c2, r2)) {
      this.addPopup(c2, r2, 'BLOCKED!', 'Thaw Frost / Cut Web first', '#E84D3D');
      this.isResolving = false;
      return;
    }

    const valid = this.canSwap(c1, r1, c2, r2);
    if (!valid) {
      this.audio.playGlyphTone(0, 0);
      await this.animateSwapSlide(c1, r1, c2, r2, 240, true);
      this.addPopup(c2, r2, 'NO MATCH', 'Line up 3+ of same color', '#E84D3D');
      this.isResolving = false;
      return;
    }

    const t1 = this.grid[r1][c1];
    const t2 = this.grid[r2][c2];
    const v1 = this.veins[r1][c1];
    const v2 = this.veins[r2][c2];

    this.grid[r1][c1] = t2;
    this.grid[r2][c2] = t1;
    this.veins[r1][c1] = v2;
    this.veins[r2][c2] = v1;

    this.audio.playGlyphTone(t1 < 6 ? t1 : 5, 1);
    await this.animateSwapSlide(c1, r1, c2, r2, 175, false);

    let comboCount = 0;
    let totalDepthGain = 0;
    let totalScoreGain = 0;

    if (t1 >= 6 || t2 >= 6) {
      comboCount = 1;
      const specRes = await this.resolveSpecialCombo(c1, r1, t2, c2, r2, t1);
      totalDepthGain += specRes.depth;
      totalScoreGain += specRes.score;
    }

    while (true) {
      const { groups, matchedCells } = this.findMatchGroups();
      if (matchedCells.size === 0) break;

      comboCount++;
      const stepRes = await this.resolveMatchStep(groups, matchedCells, comboCount, { c1, r1, c2, r2 });
      totalDepthGain += stepRes.depth;
      totalScoreGain += stepRes.score;

      await this.applyGravity();
    }

    this.processTurnEvents();
    this.ensureValidMoves();

    if (this.onMatch) {
      this.onMatch({
        comboCount,
        totalDepthGain,
        totalScoreGain,
        warmth: this.warmth
      });
    }

    this.isResolving = false;
  }

  async resolveSpecialCombo(c1, r1, tileAt1, c2, r2, tileAt2) {
    const cleared = new Set();

    if (tileAt1 >= 6 && tileAt2 >= 6 && !(c1 === c2 && r1 === r2)) {
      this.audio.playGuardianChime();
      this.screenShake = 8;
      if ((tileAt1 === 6 || tileAt2 === 6) && (tileAt1 === 7 || tileAt2 === 7)) {
        this.addPopup(c2, r2, 'MEGA SONAR ✚✕', '3 Rows & 3 Cols Blasted!', '#ABE3D9');
        for (let d = -1; d <= 1; d++) {
          const rr = r2 + d, cc = c2 + d;
          if (rr >= 0 && rr < this.rows) {
            this.fxBeams.push({ type: 'row', r: rr, color: '#A5C77F', life: 0.45, maxLife: 0.45 });
            for (let col = 0; col < this.cols; col++) cleared.add(`${col},${rr}`);
          }
          if (cc >= 0 && cc < this.cols) {
            this.fxBeams.push({ type: 'col', c: cc, color: '#D6EDF5', life: 0.45, maxLife: 0.45 });
            for (let row = 0; row < this.rows; row++) cleared.add(`${cc},${row}`);
          }
        }
      } else {
        this.addPopup(3, 3, 'SANCTUARY NOVA ❖', 'Full Cavern Resonance!', '#FFF9D2');
        this.fxBeams.push({ type: 'ring', c: 3, r: 3, maxR: 240, maxRadius: 240, color: '#FFF9D2', life: 0.55, maxLife: 0.55 });
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) cleared.add(`${c},${r}`);
        }
      }
    } else {
      const coreType = tileAt1 >= 6 ? tileAt1 : tileAt2;
      const corePos = tileAt1 >= 6 ? { c: c1, r: r1 } : { c: c2, r: r2 };
      const otherType = tileAt1 < 6 ? tileAt1 : tileAt2;

      if (coreType === 6) {
        this.audio.playSonarPing();
        this.screenShake = 5;
        this.fxBeams.push({ type: 'row', r: corePos.r, color: '#A5C77F', life: 0.4, maxLife: 0.4 });
        this.fxBeams.push({ type: 'col', c: corePos.c, color: '#A5C77F', life: 0.4, maxLife: 0.4 });
        this.addPopup(corePos.c, corePos.r, 'BAT SONAR ✚', 'Row + Column Blast!', '#A5C77F');
        for (let col = 0; col < this.cols; col++) cleared.add(`${col},${corePos.r}`);
        for (let row = 0; row < this.rows; row++) cleared.add(`${corePos.c},${row}`);
      } else if (coreType === 7) {
        this.audio.playFractureShatter();
        this.screenShake = 6;
        this.fxBeams.push({ type: 'ring', c: corePos.c, r: corePos.r, maxR: 110, maxRadius: 110, color: '#D6EDF5', life: 0.42, maxLife: 0.42 });
        this.addPopup(corePos.c, corePos.r, 'SPIDER BLAST ✕', '3x3 Radial Shatter!', '#D6EDF5');
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nc = corePos.c + dc, nr = corePos.r + dr;
            if (this.inBounds(nc, nr)) cleared.add(`${nc},${nr}`);
          }
        }
      } else {
        this.audio.playGuardianChime();
        this.screenShake = 6;
        this.warmth = Math.min(100, this.warmth + 20);
        const targetColor = (otherType >= 0 && otherType <= 5) ? otherType : this.randomBaseGlyph();
        const m = GLYPH_META[targetColor] || GLYPH_META[0];
        this.addPopup(corePos.c, corePos.r, 'PRISMATIC WIPE ❖', `All ${m.name} +20% Warmth!`, m.color);
        for (let r = 0; r < this.rows; r++) {
          for (let c = 0; c < this.cols; c++) {
            if (this.grid[r][c] === targetColor) {
              cleared.add(`${c},${r}`);
              this.fxBeams.push({
                type: 'arc',
                c1: corePos.c, r1: corePos.r,
                c2: c, r2: r,
                color: m.color,
                life: 0.45, maxLife: 0.45
              });
            }
          }
        }
        cleared.add(`${corePos.c},${corePos.r}`);
      }
    }

    cleared.forEach(key => {
      const [c, r] = key.split(',').map(Number);
      if (this.grid[r]?.[c] >= 0) {
        this.flashAnims[r][c] = 1.0;
        this.scaleAnims[r][c] = 1.25;
      }
    });

    await new Promise(res => setTimeout(res, 210));

    let frostThawed = 0, obelisksHit = 0;
    cleared.forEach(key => {
      const [c, r] = key.split(',').map(Number);
      const dmgRes = this.damageCell(c, r, 2);
      if (dmgRes.thawed) frostThawed++;
      if (dmgRes.obeliskBroken) obelisksHit++;
    });

    await this.applyGravity();

    const depth = cleared.size * 12 + frostThawed * 20 + obelisksHit * 45;
    const score = cleared.size * 140;
    return { depth, score };
  }

  async resolveMatchStep(groups, matchedCells, comboIdx, originSwap) {
    const chordNotes = [];
    let emberMatches = 0;
    let tileValue = 0;
    const newCores = [];

    groups.forEach(g => {
      chordNotes.push(g.type);
      if (g.type === 3) emberMatches += g.cells.length;

      const first = g.cells[0];
      const last = g.cells[g.cells.length - 1];
      const m = GLYPH_META[g.type] || GLYPH_META[0];
      this.fxBeams.push({
        type: 'arc',
        c1: first.c, r1: first.r,
        c2: last.c, r2: last.r,
        color: m.color,
        life: 0.32, maxLife: 0.32
      });

      if (g.cells.length === 4) {
        const spawnCell = g.cells.find(p => (p.c === originSwap.c1 && p.r === originSwap.r1) || (p.c === originSwap.c2 && p.r === originSwap.r2)) || g.cells[1];
        newCores.push({ c: spawnCell.c, r: spawnCell.r, type: 6 });
      } else if (g.cells.length >= 5) {
        const spawnCell = g.cells.find(p => (p.c === originSwap.c1 && p.r === originSwap.r1) || (p.c === originSwap.c2 && p.r === originSwap.r2)) || g.cells[2];
        newCores.push({ c: spawnCell.c, r: spawnCell.r, type: 9 });
      }
    });

    if (groups.length >= 2) {
      for (let i = 0; i < groups.length; i++) {
        for (let j = i + 1; j < groups.length; j++) {
          if (groups[i].type === groups[j].type && groups[i].dir !== groups[j].dir) {
            const inter = groups[i].cells.find(c1 => groups[j].cells.some(c2 => c1.c === c2.c && c1.r === c2.r));
            if (inter) newCores.push({ c: inter.c, r: inter.r, type: 7 });
          }
        }
      }
    }

    this.audio.playMatchChord(matchedCells.size, chordNotes[0] || 0);

    matchedCells.forEach(key => {
      const [c, r] = key.split(',').map(Number);
      this.flashAnims[r][c] = 1.0;
      this.scaleAnims[r][c] = 1.24;
      const goldValue = this.grid[r][c] === 5 ? (this.equippedRelics.has('fork') ? 3 : 2) : 1;
      tileValue += goldValue * (this.veins[r]?.[c] ? 2 : 1);
    });

    await new Promise(res => setTimeout(res, 190));

    if (emberMatches > 0) {
      const heatGain = Math.max(12, emberMatches * 4);
      this.warmth = Math.min(100, this.warmth + heatGain);
      this.addPopup(3, 1, `WARMTH +${heatGain}% `, 'Ember Heat', '#E28C6B');
    }

    let frostThawed = 0, websCut = 0, obelisksHit = 0;
    matchedCells.forEach(key => {
      const [c, r] = key.split(',').map(Number);
      const res = this.damageCell(c, r, 1);
      if (res.thawed) frostThawed++;
      if (res.webCut) websCut++;
      if (res.obeliskBroken) obelisksHit++;
    });

    if (websCut > 0 && this.equippedRelics.has('geode')) {
      this.warmth = Math.min(100, this.warmth + 15);
    }

    newCores.forEach(core => {
      this.grid[core.r][core.c] = core.type;
      this.scaleAnims[core.r][core.c] = 1.35;
      this.sessionStats.coresCreated++;
      const m = GLYPH_META[core.type];
      this.addPopup(core.c, core.r - 0.3, `FORGED ${m.name}`, 'Tap or Swap to Blast!', m.color);
      this.spawnSparks(core.c, core.r, core.type, 16);
    });

    const comboMult = comboIdx > 1 ? comboIdx : 1;
    const depthGained = (tileValue * 11 + frostThawed * 22 + obelisksHit * 45) * comboMult;
    const scoreGained = tileValue * 110 * comboMult;

    const firstGroupCell = groups[0]?.cells[1] || { c: 3, r: 3 };
    const m0 = GLYPH_META[chordNotes[0] || 0];
    this.addPopup(
      firstGroupCell.c,
      firstGroupCell.r,
      comboIdx > 1 ? `${comboIdx}x CASCADE! +${depthGained}m` : `+${depthGained}m`,
      `${m0.hz} (${m0.ratio})`,
      comboIdx > 1 ? '#E8CD86' : m0.color
    );

    if (comboIdx > 1) this.sessionStats.combosTriggered++;

    return { depth: depthGained, score: scoreGained };
  }

  damageCell(c, r, power = 1) {
    let thawed = false, webCut = false, obeliskBroken = false;

    const thawRadius = this.equippedRelics.has('ammonite') ? 2 : 1;
    for (let dr = -thawRadius; dr <= thawRadius; dr++) {
      for (let dc = -thawRadius; dc <= thawRadius; dc++) {
        if (Math.abs(dc) + Math.abs(dr) > thawRadius) continue;
        const nc = c + dc, nr = r + dr;
        if (this.inBounds(nc, nr)) {
          if (this.frost[nr][nc]) {
            this.frost[nr][nc] = false;
            thawed = true;
            this.sessionStats.frostCleared++;
            this.spawnSparks(nc, nr, 1, 10);
          }
          if (this.web[nr][nc]) {
            this.web[nr][nc] = false;
            webCut = true;
            this.sessionStats.websCleared++;
            this.spawnSparks(nc, nr, 0, 8);
          }
        }
      }
    }

    if (this.grid[r][c] === -2) {
      this.obeliskHp[r][c] = Math.max(0, this.obeliskHp[r][c] - power);
      this.scaleAnims[r][c] = 1.2;
      this.spawnSparks(c, r, 0, 10);
      if (this.obeliskHp[r][c] <= 0) {
        this.grid[r][c] = -1;
        obeliskBroken = true;
        this.sessionStats.obelisksShattered++;
        this.addPopup(c, r, 'OBELISK SHATTERED!', '+45m Depth', '#DFE6E6');
      }
      return { thawed, webCut, obeliskBroken };
    }

    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dc, dr]) => {
      const nc = c + dc, nr = r + dr;
      if (this.inBounds(nc, nr) && this.grid[nr][nc] === -2) {
        this.obeliskHp[nr][nc] = Math.max(0, this.obeliskHp[nr][nc] - 1);
        this.scaleAnims[nr][nc] = 1.18;
        this.spawnSparks(nc, nr, 0, 8);
        if (this.obeliskHp[nr][nc] <= 0) {
          this.grid[nr][nc] = -1;
          obeliskBroken = true;
          this.sessionStats.obelisksShattered++;
          this.addPopup(nc, nr, 'OBELISK SHATTERED!', '+45m Depth', '#DFE6E6');
        }
      }
    });

    for (let i = this.spiders.length - 1; i >= 0; i--) {
      const s = this.spiders[i];
      if (Math.abs(s.c - c) <= 1 && Math.abs(s.r - r) <= 1) {
        s.hp -= power;
        s.hitFlash = 1.0;
        this.audio.playFractureShatter();
        this.spawnSparks(s.c, s.r, 7, 14);
        if (s.hp <= 0) {
          this.spiders.splice(i, 1);
          this.sessionStats.spidersRepelled++;
          this.addPopup(s.c, s.r, 'SPIDER REPELLED!', 'Path cleared', '#D6EDF5');
        } else {
          this.addPopup(s.c, s.r, 'SPIDER HIT!', `${s.hp} HP Left`, '#91CBDE');
        }
      }
    }

    if (this.grid[r][c] >= 0) {
      const t = this.grid[r][c];
      this.spawnSparks(c, r, t, 10);
      this.grid[r][c] = -1;
      this.veins[r][c] = false;
      this.flashAnims[r][c] = 0;
      this.scaleAnims[r][c] = 1.0;
    }

    return { thawed, webCut, obeliskBroken };
  }

  processTurnEvents() {
    this.warmth = Math.max(0, this.warmth - 4);

    if (this.warmth < 35) {
      const candidates = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] >= 0 && !this.frost[r][c]) {
            if (this.equippedRelics.has('crest') && c >= 2 && c <= 4 && r >= 2 && r <= 4) continue;
            const isEdge = (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1);
            if (isEdge) candidates.push({ c, r });
          }
        }
      }
      if (candidates.length > 0) {
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        this.frost[pick.r][pick.c] = true;
        this.addPopup(pick.c, pick.r, 'FROST CREEPS ', 'Warm with Ember (4 Pips)', '#91CBDE');
        this.spawnSparks(pick.c, pick.r, 1, 8);
      }
    }

    this.spiders.forEach(s => {
      s.turnsUntilWeb--;
      if (s.turnsUntilWeb <= 0) {
        s.turnsUntilWeb = 3;
        const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        const wc = s.c + d[0], wr = s.r + d[1];
        if (this.inBounds(wc, wr) && this.grid[wr][wc] >= 0) {
          this.web[wr][wc] = true;
          this.addPopup(wc, wr, 'STICKY WEB ', 'Match next to cut!', '#DFE6E6');
        }
      }
    });
  }

  async applyGravity() {
    for (let c = 0; c < this.cols; c++) {
      let bottom = this.rows - 1;
      while (bottom >= 0) {
        if (this.grid[bottom][c] === -2) { bottom--; continue; }
        let top = bottom;
        while (top > 0 && this.grid[top - 1][c] !== -2) top--;
        const survivors = [];
        for (let r = bottom; r >= top; r--) {
          if (this.grid[r][c] >= 0) survivors.push({ tile: this.grid[r][c], frost: this.frost[r][c], web: this.web[r][c], vein: this.veins[r][c], row: r });
        }
        for (let r = bottom; r >= top; r--) {
          const cell = survivors[bottom - r];
          this.grid[r][c] = cell ? cell.tile : this.randomBaseGlyph();
          this.frost[r][c] = cell ? cell.frost : false;
          // Sanctuary also protects against frozen tablets falling into it.
          if (this.frost[r][c] && this.equippedRelics.has('crest') && c >= 2 && c <= 4 && r >= 2 && r <= 4) {
            this.frost[r][c] = false;
            this.sessionStats.frostCleared++;
          }
          this.web[r][c] = cell ? cell.web : false;
          this.veins[r][c] = cell ? cell.vein : Math.random() < 0.09;
          this.yOffsets[r][c] = cell ? (r - cell.row) * 64 : (r - top + 1) * 64;
          this.yVelocities[r][c] = 180;
        }
        bottom = top - 1;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 360));
  }

  findBestSwap() {
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const neighbors = [[1, 0], [0, 1]];
        for (const [dc, dr] of neighbors) {
          const nc = c + dc, nr = r + dr;
          if (nc < this.cols && nr < this.rows) {
            if (this.canSwap(c, r, nc, nr)) {
              return { c1: c, r1: r, c2: nc, r2: nr };
            }
          }
        }
      }
    }
    return null;
  }

  showHint() {
    if (this.isResolving || this.isSwapping) return false;
    const best = this.findBestSwap();
    if (!best) return false;
    this.coachMove = best;
    this.idleTimer = 0;
    this.audio.playSonarPing();
    this.addPopup(best.c1, best.r1, 'SWAP THESE ⇄', 'Hint · no charge used', '#A5C77F');
    return true;
  }

  // [1] BAT · SONAR (25%): Highlights a valid swap + spawns a Bat Core (✚)
  triggerEchoHint() {
    if (this.isResolving || this.isSwapping) return false;
    this.audio.playSonarPing();
    const best = this.findBestSwap();
    if (best) {
      this.coachMove = best;
      this.selectedTile = { c: best.c1, r: best.r1 };
      this.scaleAnims[best.r1][best.c1] = 1.28;
      this.scaleAnims[best.r2][best.c2] = 1.28;
      this.addPopup(best.c1, best.r1, 'SWAP THESE ⇄', 'Valid Match + Bat Core ✚', '#A5C77F');
      this.spawnSparks(best.c1, best.r1, 6, 14);
      this.spawnSparks(best.c2, best.r2, 6, 14);
    }
    // Also upgrade a random non-hint base tile into a Bat Core (✚)
    const candidates = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.canTileMove(c, r) && this.grid[r][c] < 6) {
          if (!best || ((c !== best.c1 || r !== best.r1) && (c !== best.c2 || r !== best.r2))) {
            candidates.push({ c, r });
          }
        }
      }
    }
    if (candidates.length > 0) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      this.grid[pick.r][pick.c] = 6;
      this.scaleAnims[pick.r][pick.c] = 1.35;
      this.spawnSparks(pick.c, pick.r, 6, 14);
    }
    return true;
  }

  // [2] EMBER · TORCH (35%): Thaws up to 3 Frost/Webs + +25% Warmth + Spider Bomb Core (✕)
  enableWebBridge() {
    if (this.isResolving || this.isSwapping) return false;
    this.audio.playFractureShatter();
    let clearedCount = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if ((this.frost[r][c] || this.web[r][c]) && clearedCount < 3) {
          if (this.frost[r][c]) {
            this.frost[r][c] = false;
            this.sessionStats.frostCleared++;
          }
          if (this.web[r][c]) {
            this.web[r][c] = false;
            this.sessionStats.websCleared++;
          }
          clearedCount++;
          this.spawnSparks(c, r, 3, 12);
        }
      }
    }
    this.warmth = Math.min(100, this.warmth + 25);
    this.fxBeams.push({ type: 'ring', c: 3, r: 3, maxR: 160, maxRadius: 160, color: '#E28C6B', life: 0.4, maxLife: 0.4 });

    const valid = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.canTileMove(c, r) && this.grid[r][c] < 6) valid.push({ c, r });
      }
    }
    if (valid.length > 0) {
      const pick = valid[Math.floor(Math.random() * valid.length)];
      this.grid[pick.r][pick.c] = 7;
      this.scaleAnims[pick.r][pick.c] = 1.35;
      this.spawnSparks(pick.c, pick.r, 7, 14);
    }
    this.addPopup(3, 3, 'EMBER TORCH ✕', `+25% Warmth · ${clearedCount} Thawed!`, '#E28C6B');
    return true;
  }

  // [3] SQUID · SIPHON (50%): Blasts all tiles of the most common color on the board
  triggerAbyssalSiphon() {
    if (this.isResolving || this.isSwapping) return false;
    this.audio.playVoidPulse();
    this.screenShake = 6;

    // Find most common base glyph color (0..5)
    const counts = [0, 0, 0, 0, 0, 0];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.grid[r][c];
        if (t >= 0 && t <= 5) counts[t]++;
      }
    }
    let bestColor = 0;
    for (let i = 1; i < 6; i++) {
      if (counts[i] > counts[bestColor]) bestColor = i;
    }

    const m = GLYPH_META[bestColor];
    this.addPopup(3, 3, 'SQUID SIPHON ◎', `All ${m.name} Siphoned!`, m.color);

    // Run async siphon cascade
    (async () => {
      this.isResolving = true;
      const targets = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this.grid[r][c] === bestColor) {
            targets.push({ c, r });
            this.flashAnims[r][c] = 1.0;
            this.scaleAnims[r][c] = 1.25;
            this.fxBeams.push({
              type: 'arc',
              c1: 3, r1: 3,
              c2: c, r2: r,
              color: m.color,
              life: 0.42, maxLife: 0.42
            });
          }
        }
      }
      await new Promise(res => setTimeout(res, 210));
      targets.forEach(({ c, r }) => this.damageCell(c, r, 1));
      await this.applyGravity();

      let comboCount = 1;
      let totalDepthGain = targets.length * 12;
      let totalScoreGain = targets.length * 130;

      while (true) {
        const { groups, matchedCells } = this.findMatchGroups();
        if (matchedCells.size === 0) break;
        comboCount++;
        const stepRes = await this.resolveMatchStep(groups, matchedCells, comboCount, { c1: 3, r1: 3, c2: 3, r2: 3 });
        totalDepthGain += stepRes.depth;
        totalScoreGain += stepRes.score;
        await this.applyGravity();
      }
      this.processTurnEvents();
      this.ensureValidMoves();
      if (this.onMatch) {
        this.onMatch({ comboCount, totalDepthGain, totalScoreGain, warmth: this.warmth });
      }
      this.isResolving = false;
    })();

    return true;
  }

  // [4] BUZZER · 84Hz (60%): Spawns 4 Gold Relics + 2x Mineral Veins
  triggerBuzzerResonance() {
    if (this.isResolving || this.isSwapping) return false;
    this.audio.playGuardianChime();
    const valid = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.canTileMove(c, r) && this.grid[r][c] < 5) valid.push({ c, r });
      }
    }
    for (let i = 0; i < Math.min(4, valid.length); i++) {
      const idx = Math.floor(Math.random() * valid.length);
      const pick = valid.splice(idx, 1)[0];
      this.grid[pick.r][pick.c] = 5; // Gold Reliquary
      this.veins[pick.r][pick.c] = true; // 2x Mineral Vein
      this.scaleAnims[pick.r][pick.c] = 1.38;
      this.flashAnims[pick.r][pick.c] = 0.8;
      this.spawnSparks(pick.c, pick.r, 5, 16);
    }
    this.fxBeams.push({ type: 'ring', c: 3, r: 3, maxR: 180, maxRadius: 180, color: '#E8CD86', life: 0.42, maxLife: 0.42 });
    this.addPopup(3, 2, '84Hz GOLD RESONANCE ◆', '4 Gold Relics + 2x Veins!', '#E8CD86');
    return true;
  }

  addPopup(c, r, text, sub, color) {
    this.popups.push({
      x: c * 32 + 16,
      y: r * 32 + 10,
      text,
      sub: sub || '',
      color: color || '#FFFFFF',
      life: 1.0
    });
  }

  spawnSparks(c, r, type, count) {
    const cx = c * 32 + 16;
    const cy = r * 32 + 16;
    const meta = GLYPH_META[type % GLYPH_META.length] || GLYPH_META[0];
    const col = meta.color;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.7 + Math.random() * 2.8;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.028 + Math.random() * 0.035,
        color: col,
        size: 1.5 + Math.floor(Math.random() * 2)
      });
    }
  }

  update(dt) {
    this.animTime += dt;

    // Idle Move Coach: after 3.0s of no input, highlight a valid swap
    if (!this.isResolving && !this.isSwapping) {
      this.idleTimer += dt;
      if (this.idleTimer >= 3.0 && !this.coachMove) {
        this.coachMove = this.findBestSwap();
      }
    }

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 28);
    }

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.yOffsets[r][c] > 0) {
          this.yVelocities[r][c] += dt * 1650;
          this.yOffsets[r][c] -= this.yVelocities[r][c] * dt;
          if (this.yOffsets[r][c] <= 0) {
            this.yOffsets[r][c] = 0;
            this.yVelocities[r][c] = 0;
            this.scaleAnims[r][c] = 1.1;
          }
        }
        if (this.scaleAnims[r][c] > 1.0) {
          this.scaleAnims[r][c] = Math.max(1.0, this.scaleAnims[r][c] - dt * 1.8);
        }
        if (this.flashAnims[r][c] > 0) {
          this.flashAnims[r][c] = Math.max(0, this.flashAnims[r][c] - dt * 4.5);
        }
      }
    }

    this.spiders.forEach(s => {
      if (s.hitFlash > 0) s.hitFlash = Math.max(0, s.hitFlash - dt * 4);
    });

    for (let i = this.fxBeams.length - 1; i >= 0; i--) {
      this.fxBeams[i].life -= dt;
      if (this.fxBeams[i].life <= 0) this.fxBeams.splice(i, 1);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += dt * 2.5;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const pop = this.popups[i];
      pop.y -= dt * 18;
      pop.life -= dt * 0.72;
      if (pop.life <= 0) this.popups.splice(i, 1);
    }
  }
}
