// SPDX-License-Identifier: MIT OR Apache-2.0
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = name => fs.readFileSync(path.join(root, name), 'utf8');
const { harness, clone, plainBoard, playable, fullBoard } = require('./harness.cjs');

test('all six chambers start without matches and have a valid move over 100 seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const h = harness(seed);
    for (let ch = 0; ch < 6; ch++) {
      h.game.startChamber(ch);
      assert.equal(h.board.findMatchGroups().matchedCells.size, 0, `seed ${seed}, chamber ${ch}`);
      assert.ok(h.board.findBestSwap(), `seed ${seed}, chamber ${ch}`);
      fullBoard(h.board);
    }
  }
});

test('hint never changes tiles, resources, turns, or hazards', () => {
  const h = harness(48); playable(h);
  const before = clone({ grid: h.board.grid, frost: h.board.frost, score: h.game.score, charge: h.game.attunementGauge, turns: h.game.turnsRemaining });
  for (let i = 0; i < 20; i++) h.game.showHint();
  assert.deepEqual(clone({ grid: h.board.grid, frost: h.board.frost, score: h.game.score, charge: h.game.attunementGauge, turns: h.game.turnsRemaining }), before);
  assert.ok(h.board.coachMove);
});

test('legal swap resolves cascades, fills board, scores, and spends exactly one turn', async () => {
  for (let ch = 0; ch < 6; ch++) {
    const h = harness(12 + ch); h.game.startChamber(ch); playable(h);
    const before = h.game.turnsRemaining;
    const move = h.board.findBestSwap();
    await h.board.executeSwap(move.c1, move.r1, move.c2, move.r2);
    assert.equal(h.game.turnsRemaining, before - 1);
    assert.ok(h.game.chamberScore > 0);
    assert.equal(h.board.findMatchGroups().matchedCells.size, 0);
    assert.equal(h.board.isResolving, false);
    fullBoard(h.board);
  }
});

test('invalid and locked swaps preserve board and turns; unrelated matches do not validate a swap', async () => {
  const h = harness(); playable(h); plainBoard(h.board);
  const before = clone(h.board.grid);
  await h.board.executeSwap(0, 0, 1, 0);
  assert.deepEqual(clone(h.board.grid), before);
  assert.equal(h.game.turnsRemaining, h.game.currentChamber.maxTurns);
  h.board.frost[0][0] = true;
  await h.board.executeSwap(0, 0, 1, 0);
  assert.deepEqual(clone(h.board.grid), before);
  h.board.grid[6][0] = h.board.grid[6][1] = h.board.grid[6][2] = 3;
  assert.equal(h.board.canSwap(3, 0, 4, 0), false);
});

test('gravity fills cells above and below multiple stone blockers without moving stones', async () => {
  const h = harness(); plainBoard(h.board);
  h.board.grid[2][0] = h.board.grid[4][0] = -2;
  h.board.obeliskHp[2][0] = h.board.obeliskHp[4][0] = 2;
  for (const r of [0, 1, 3, 5, 6]) h.board.grid[r][0] = -1;
  await h.board.applyGravity();
  fullBoard(h.board);
  assert.equal(h.board.grid[2][0], -2);
  assert.equal(h.board.grid[4][0], -2);
});

test('four, five and crossing matches create the documented creature cores', async () => {
  for (const [length, type] of [[4, 6], [5, 9]]) {
    const h = harness(); plainBoard(h.board);
    for (let c = 0; c < length; c++) h.board.grid[0][c] = 2;
    const { groups, matchedCells } = h.board.findMatchGroups();
    await h.board.resolveMatchStep(groups, matchedCells, 1, { c1: 0, r1: 0, c2: 1, r2: 0 });
    assert.equal(h.board.grid[0][0], type);
  }
  const h = harness(); plainBoard(h.board);
  for (const [c, r] of [[2, 3], [3, 3], [4, 3], [3, 2], [3, 4]]) h.board.grid[r][c] = 5;
  const { groups, matchedCells } = h.board.findMatchGroups();
  await h.board.resolveMatchStep(groups, matchedCells, 1, { c1: 3, r1: 3, c2: 3, r2: 2 });
  assert.equal(h.board.grid[3][3], 7);
});

test('frost, spiders and stone take adjacent damage', () => {
  const h = harness(); plainBoard(h.board);
  h.board.frost[1][1] = true;
  h.board.damageCell(1, 0, 1);
  assert.equal(h.board.frost[1][1], false);
  h.board.spiders = [{ c: 3, r: 3, hp: 2 }];
  h.board.damageCell(3, 2, 1);
  assert.equal(h.board.spiders[0].hp, 1);
  h.board.obeliskHp[4][4] = 2; h.board.grid[4][4] = -2;
  h.board.damageCell(4, 3, 1);
  assert.equal(h.board.obeliskHp[4][4], 1);
});

test('gold doubles tile rewards, the Fork triples them, and veins double only their tile', async () => {
  async function reward(type, fork, vein) {
    const h = harness(); plainBoard(h.board);
    h.board.equippedRelics = new Set(fork ? ['fork'] : []);
    for (let c = 0; c < 3; c++) h.board.grid[0][c] = type;
    h.board.veins[0][0] = vein;
    const cells = [{ c: 0, r: 0 }, { c: 1, r: 0 }, { c: 2, r: 0 }];
    return h.board.resolveMatchStep([{ type, cells, dir: 'h' }], new Set(['0,0', '1,0', '2,0']), 1, { c1: 0, r1: 0, c2: 1, r2: 0 });
  }
  const base = await reward(0, false, false);
  const gold = await reward(5, false, false);
  const fork = await reward(5, true, false);
  const vein = await reward(0, false, true);
  assert.equal(gold.score, base.score * 2);
  assert.equal(gold.depth, base.depth * 2);
  assert.equal(fork.score, base.score * 3);
  assert.equal(vein.score, 440);
});

test('Guardian Crest thaws frost that falls into the central sanctuary', async () => {
  const h = harness(); plainBoard(h.board);
  h.board.equippedRelics = new Set(['crest']);
  for (let r = 1; r <= 3; r++) h.board.grid[r][3] = -1;
  h.board.frost[0][3] = true;
  await h.board.applyGravity();
  assert.equal(h.board.frost[3][3], false);
  assert.equal(h.board.sessionStats.frostCleared, 1);
});

test('Squid Siphon spends one turn and resolves a full board', async () => {
  const h = harness(101); playable(h);
  h.game.attunementGauge = 100;
  h.game.useCreatureForm(50, () => h.board.triggerAbyssalSiphon());
  assert.equal(h.game.attunementGauge, 50);
  for (let i = 0; i < 1000 && h.board.isResolving; i++) await Promise.resolve();
  assert.equal(h.board.isResolving, false);
  assert.equal(h.game.turnsRemaining, h.game.currentChamber.maxTurns - 1);
  assert.ok(h.game.score > 0);
  fullBoard(h.board);
});

test('audio absence is harmless and muted effects schedule no voices', () => {
  const h = harness();
  const audio = h.game.audio;
  audio.init(); audio.playGuardianChime();
  assert.equal(audio.context, null);
  assert.equal(audio.toggleMute(), true);
  let count = 0;
  audio.context = { state: 'running', currentTime: 0, createOscillator() { count++; } };
  audio.output = {};
  audio.playGlyphTone(0); audio.playVoidPulse();
  assert.equal(count, 0);
});

test('powers cannot act during intro, menus, resolution or after a chamber ends', () => {
  const h = harness();
  h.game.attunementGauge = 40;
  let calls = 0;
  const power = () => { calls++; return true; };
  h.game.useCreatureForm(25, power);
  playable(h);
  h.el('howto-modal').style.display = 'flex';
  h.game.useCreatureForm(25, power);
  h.el('howto-modal').style.display = 'none';
  h.board.isResolving = true;
  h.game.useCreatureForm(25, power);
  h.board.isResolving = false;
  h.game.chamberFinished = true;
  h.game.useCreatureForm(25, power);
  assert.equal(calls, 0);
  h.game.chamberFinished = false;
  h.game.useCreatureForm(25, power);
  assert.equal(calls, 1);
  assert.equal(h.game.attunementGauge, 15);
});

test('victory and failure latch once, cancellation prevents stale dialogs, final chamber launches ending', () => {
  const h = harness(); playable(h);
  h.game.depth = 150; h.board.sessionStats.frostCleared = 6;
  h.game.checkChamberEndConditions(); h.game.checkChamberEndConditions();
  assert.equal(h.timers.size, 1);
  assert.equal(h.game.campaignData.unlocked[1], true);
  h.game.startChamber(1);
  assert.equal(h.timers.size, 0);
  h.game.turnsRemaining = 0;
  h.game.checkChamberEndConditions();
  assert.equal(h.game.chamberFinished, true);
  h.game.startChamber(5);
  h.game.depth = 1051;
  Object.assign(h.board.sessionStats, { frostCleared: 6, spidersRepelled: 3, obelisksShattered: 4 });
  h.game.checkChamberEndConditions();
  for (const fn of h.timers.values()) fn();
  assert.equal(h.game.isEndingCutscene, true);
  assert.ok(h.game.campaignData.unlockedRelics.includes('crest'));
});

test('chamber transition is blocked during a cascade; retry charge resets; endless exceeds campaign depth', () => {
  const h = harness(); playable(h);
  h.board.isResolving = true; h.game.startChamber(3);
  assert.equal(h.game.currentChamberIndex, 0);
  h.board.isResolving = false; h.game.attunementGauge = 100;
  h.game.startChamber(0);
  assert.equal(h.game.attunementGauge, 20);
  h.game.startEndless(); h.game.depth = 1051;
  h.game.handleMatch({ totalDepthGain: 60, totalScoreGain: 100 });
  assert.equal(h.game.depth, 1111);
  assert.equal(h.game.turnsRemaining, 999);
  assert.equal(h.board.currentChamber, null);
});

test('malformed and out-of-range saves recover safely', () => {
  for (const value of ['null', '{}', '{bad', '42']) {
    const h = harness(1, value);
    assert.equal(h.game.campaignData.stars.length, 6);
  }
  const h = harness(1, JSON.stringify({ stars: [999], highScores: [-1], unlocked: [], unlockedRelics: ['evil', 'ammonite'], equippedRelics: ['evil', 'ammonite', 'ammonite'] }));
  assert.equal(h.game.campaignData.stars[0], 3);
  assert.equal(h.game.campaignData.highScores[0], 0);
  assert.deepEqual(clone(h.game.campaignData.equippedRelics), ['ammonite']);
});

test('starter relic migration preserves earned discoveries and the first clear earns Ammonite', () => {
  const save = { stars: [0, 0, 0, 0, 0, 0], highScores: [], unlocked: [], unlockedRelics: ['ammonite'], equippedRelics: ['ammonite'] };
  const h = harness(1, JSON.stringify(save)); playable(h);
  assert.deepEqual(clone(h.game.campaignData.unlockedRelics), []);
  assert.equal(h.board.equippedRelics.size, 0);
  assert.equal(h.game.attunementGauge, 20);
  h.game.depth = h.game.currentChamber.targetDepth;
  h.board.sessionStats.frostCleared = h.game.currentChamber.objectives.frost;
  h.game.checkChamberEndConditions();
  assert.ok(h.game.campaignData.unlockedRelics.includes('ammonite'));
  save.stars[0] = 2;
  const earned = harness(1, JSON.stringify(save));
  assert.ok(earned.board.equippedRelics.has('ammonite'));
});

test('normal thaw is adjacent; earned Ammonite reaches two orthogonal steps only', () => {
  const h = harness(); plainBoard(h.board);
  h.board.frost[2][3] = h.board.frost[1][3] = h.board.frost[2][2] = h.board.frost[0][3] = true;
  h.board.damageCell(3, 3, 1);
  assert.equal(h.board.frost[2][3], false);
  assert.equal(h.board.frost[1][3], true);
  assert.equal(h.board.frost[2][2], true);
  h.board.equippedRelics.add('ammonite');
  h.board.damageCell(3, 3, 1);
  assert.equal(h.board.frost[1][3], false);
  assert.equal(h.board.frost[2][2], false);
  assert.equal(h.board.frost[0][3], true);
});

test('campaign progress stops at the chamber boundary and charge growth is capped per move', () => {
  const h = harness(); playable(h);
  h.game.handleMatch({ totalDepthGain: 1000, totalScoreGain: 100, comboCount: 30 });
  assert.equal(h.game.depth, 150);
  assert.equal(h.game.attunementGauge, 38);
  assert.equal(h.game.runStats.moves, 1);
  h.game.showHint();
  assert.equal(h.game.runStats.hints, 1);
  h.game.useCreatureForm(25, () => true);
  assert.equal(h.game.runStats.powers, 1);
  assert.equal(h.game.formTimer, 3);
  h.game.startChamber(1);
  assert.deepEqual(clone(h.game.runStats), { moves: 0, hints: 0, powers: 0 });
});

test('low motion suppresses decorative effects without stopping game updates', () => {
  const h = harness(); playable(h);
  h.game.reducedMotion = true;
  let particles = 0, beams = 0;
  h.game.renderParticles = () => particles++;
  h.game.renderFXBeams = () => beams++;
  h.game.render();
  assert.equal(particles + beams, 0);
  h.game.reducedMotion = false;
  h.game.render();
  assert.equal(particles + beams, 2);
  h.el('btn-motion').click();
  assert.equal(h.game.reducedMotion, true);
});

test('cinematic boarding finishes before liftoff and the camera cut hides the shot change', () => {
  const h = harness();
  const pose = (kind, time) => h.run(`VaultCinema.pose('${kind}', ${time})`);
  const landed = pose('landing', 11);
  assert.equal(landed.shipY, 300);
  assert.equal(landed.heroFeet, 458);
  assert.equal(landed.heroX, 150);
  assert.equal(pose('ending', 0).heroX, landed.heroX);
  assert.equal(pose('ending', 2.4).heroX, 240);
  assert.equal(pose('ending', 4.5).heroVisible, false);
  assert.equal(pose('ending', 6.5).shipY, 300);
  assert.ok(pose('ending', 7).shipY < 300);
  assert.equal(pose('ending', 10.5).fade, 1);
  for (let frame = 78; frame < 126; frame++) {
    assert.ok(pose('ending', (frame + 1) / 12).shipY <= pose('ending', frame / 12).shipY || frame === 125);
  }
});

test('all cinematic frames draw finite coordinates with native, unscaled sprite rectangles', () => {
  const h = harness();
  const capsule = { name: 'capsule' }, seeker = { name: 'seeker' };
  let draws = 0;
  const ctx = new Proxy({}, { get: (_, key) => (...args) => {
    for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value), key);
    if (key === 'drawImage') {
      draws++;
      assert.ok(args.slice(1).every(Number.isInteger));
      assert.equal(args[3], args[7], 'sprite width must not stretch');
      assert.equal(args[4], args[8], 'sprite height must not stretch');
      assert.deepEqual(args.slice(1,5), args[0] === capsule ? [0,0,54,154] : [args[1],0,32,32]);
    }
    if (key.startsWith('create')) return {addColorStop() {}};
  }});
  for (const [kind, frames] of [['landing',132],['ending',204]]) {
    for (let frame=0;frame<=frames;frame++) h.game.cinema.render(ctx,{kind,time:frame/12,sprites:{capsule,seeker}});
  }
  assert.ok(draws > 338);
  const png = fs.readFileSync(path.join(root,'assets/capsule.png'));
  assert.equal(png.readUInt32BE(16),54);
  assert.equal(png.readUInt32BE(20),154);
});

test('release loads local files only and contains no runtime network or contract code', () => {
  const html = source('index.html');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const ref of refs) {
    if (ref === 'https://x.com/QuillshiftGame') {
      assert.match(html, /<a href="https:\/\/x\.com\/QuillshiftGame" target="_blank" rel="noopener noreferrer">/);
      continue;
    }
    assert.ok(!/^(?:\/|https?:|data:)/i.test(ref));
    assert.ok(fs.existsSync(path.join(root, ref)), ref);
  }
  for (const ref of [...html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="([^"]+)"/g)].map(m => m[1])) {
    assert.ok(!/^(?:\/|https?:|data:)/i.test(ref), 'Runtime assets must remain local');
  }
  for (const name of ['index.html', 'game.js', 'board.js', 'audio.js', 'cinematics.js', 'style.css']) {
    assert.doesNotMatch(source(name), /fetch\s*\(|XMLHttpRequest|WebSocket|eth_call|ethereum|holyaudio|quill[-_]resonance|SeekerNet|0x[a-f0-9]{40}|NFT|solidity|ethers/i);
  }
  assert.match(html, /connect-src 'none'/);
  assert.equal(fs.existsSync(path.join(root, 'network.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'contracts')), false);
});

test('60 simulated chamber runs settle with complete boards and bounded resources', async t => {
  const clears = [0, 0, 0, 0, 0, 0];
  for (let seed = 1; seed <= 10; seed++) {
    for (let ch = 0; ch < 6; ch++) {
      const h = harness(seed * 97 + ch);
      h.game.startChamber(ch); playable(h);
      for (let turn = 0; turn < h.game.currentChamber.maxTurns && !h.game.chamberFinished; turn++) {
        if (h.game.attunementGauge >= 35 &&
            (h.board.warmth < 50 || h.board.sessionStats.frostCleared < (h.game.currentChamber.objectives.frost || 0))) {
          h.game.useCreatureForm(35, () => h.board.enableWebBridge());
        } else if (h.game.attunementGauge >= 25) {
          h.game.useCreatureForm(25, () => h.board.triggerEchoHint());
        }
        if (h.game.chamberFinished) break;
        const move = h.board.findBestSwap();
        assert.ok(move, `deadlock in chamber ${ch + 1}, seed ${seed}, turn ${turn}`);
        await h.board.executeSwap(move.c1, move.r1, move.c2, move.r2);
        fullBoard(h.board);
        assert.ok(h.board.warmth >= 0 && h.board.warmth <= 100);
        assert.ok(h.game.attunementGauge >= 0 && h.game.attunementGauge <= 100);
        assert.equal(h.board.findMatchGroups().matchedCells.size, 0);
      }
      if (h.game.campaignData.stars[ch] > 0) clears[ch]++;
    }
  }
  t.diagnostic('First-valid-swap bot clears per chamber (10 seeds each, not a human difficulty rating): ' + clears.join(', '));
});
