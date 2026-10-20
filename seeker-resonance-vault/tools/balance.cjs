// SPDX-License-Identifier: MIT OR Apache-2.0
// Deterministic simulations for comparison, not a model of human enjoyment.
const { harness, playable, fullBoard } = require('./harness.cjs');
const seeds = Number(process.argv[2] || 40);
const relicOrder = ['ammonite', 'vertebra', 'geode', 'lens', 'fork', 'crest'];

function chooseMove(board, policy) {
  if (policy === 'first') return board.findBestSwap();
  let best = null, value = -1;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const x = c + dc, y = r + dr;
      if (!board.canSwap(c, r, x, y)) continue;
      const a = board.grid[r][c], b = board.grid[y][x];
      board.grid[r][c] = b; board.grid[y][x] = a;
      const matched = board.findMatchGroups().matchedCells;
      let score = matched.size;
      for (const key of matched) {
        const [mc, mr] = key.split(',').map(Number);
        if (board.grid[mr][mc] === 3 && board.warmth < 55) score += 6;
        for (let nr = Math.max(0, mr - 1); nr <= Math.min(6, mr + 1); nr++) {
          for (let nc = Math.max(0, mc - 1); nc <= Math.min(6, mc + 1); nc++) {
            if (Math.abs(nr - mr) + Math.abs(nc - mc) > 1) continue;
            if (board.frost[nr][nc]) score += 8;
            if (board.web[nr][nc]) score += 3;
            if (board.obeliskHp[nr][nc]) score += 10;
            if (board.spiders.some(s => s.c === nc && s.r === nr)) score += 12;
          }
        }
      }
      board.grid[r][c] = a; board.grid[y][x] = b;
      // A simple heuristic: use a core instead of leaving it indefinitely.
      if (a >= 6 || b >= 6) score += 18;
      if (score > value) { value = score; best = { c1: c, r1: r, c2: x, r2: y }; }
    }
  }
  return best;
}

(async () => {
  const result = { seedsPerChamber: seeds, policies: {} };
  for (const policy of ['first', 'hazards']) {
    const chambers = [];
    for (let ch = 0; ch < 6; ch++) {
      let clears = 0, moves = 0, warmth = 0, powers = 0;
      for (let seed = 1; seed <= seeds; seed++) {
        const h = harness(seed * 97 + ch);
        // Represents a player entering with relics earned in earlier chambers.
        h.board.equippedRelics = new Set(relicOrder.slice(0, ch).slice(-2));
        h.game.startChamber(ch); playable(h);
        let steps = 0;
        while (!h.game.chamberFinished && steps < h.game.currentChamber.maxTurns) {
          if (h.game.attunementGauge >= 35 &&
              (h.board.warmth < 50 || h.board.sessionStats.frostCleared < (h.game.currentChamber.objectives.frost || 0))) {
            h.game.useCreatureForm(35, () => h.board.enableWebBridge()); powers++;
          } else if (h.game.attunementGauge >= 25) {
            h.game.useCreatureForm(25, () => h.board.triggerEchoHint()); powers++;
          }
          if (h.game.chamberFinished) break;
          const move = chooseMove(h.board, policy);
          if (!move) throw new Error(`Deadlock: ${policy}, chamber ${ch + 1}, seed ${seed}`);
          await h.board.executeSwap(move.c1, move.r1, move.c2, move.r2);
          fullBoard(h.board);
          steps++;
        }
        if (h.game.campaignData.stars[ch] > 0) clears++;
        moves += steps; warmth += h.board.warmth;
      }
      chambers.push({ chamber: ch + 1, clears, attempts: seeds, clearPercent: Math.round(clears / seeds * 100), meanMoves: +(moves / seeds).toFixed(1), meanWarmth: +(warmth / seeds).toFixed(1), meanPowers: +(powers / seeds).toFixed(1) });
    }
    result.policies[policy] = chambers;
  }
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
