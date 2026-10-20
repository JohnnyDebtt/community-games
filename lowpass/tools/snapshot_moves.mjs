// Refreshes assets/moves.json: the SEEKER NET moves of the last few days, read from the
// chain (read only). The game falls back to it when no RPC answers, so an offline forest
// still has artifacts, every one of them from a real move.
//   node tools/snapshot_moves.mjs [hours=72]
import { writeFile } from 'node:fs/promises';
import { Chain, BLOCKS_PER_SECOND } from '../src/chain/chain.js';

const hours = Number(process.argv[2] || 72);
const chain = new Chain();
const head = await chain.block('latest');
const from = head.number - Math.round(hours * 3600 * BLOCKS_PER_SECOND);
const events = await chain.events(from, head.number);
const moves = events.filter((e) => e.kind === 'move' && !e.burn).map(({ tx, block, tokens, charge, recipients, pool }) => ({ tx, block, tokens, charge: Math.round(charge * 100) / 100, recipients, pool }));
// block times, approximately (blocks are about 0.1 s apart; checked against two blocks)
const mid = moves.length ? await chain.block(moves[0].block) : null;
const rate = mid ? (head.time - mid.time) / Math.max(1, head.number - mid.number) : 100;
for (const m of moves) m.time = Math.round(head.time - (head.number - m.block) * rate);
const out = { about: 'SEEKER NET moves read from Robinhood Chain by tools/snapshot_moves.mjs (read only)', at: head.time, block: head.number, moves };
await writeFile(new URL('../assets/moves.json', import.meta.url), JSON.stringify(out));
console.log(`${moves.length} moves in the last ${hours} h, up to block ${head.number}`);
