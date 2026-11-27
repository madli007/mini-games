// Statistika bot iger pinballa: node tools/pinball-bot.mjs [miza] [stevilo-iger] [--json]
// Povprečje točk, trajanje igre in žogice, delež drainov po sredini / v outlanih, strele na minuto, multiballi, načini.
import { TABLES } from '../games/pinball/src/tables/index.js';
import { botGame, botReport } from '../games/pinball/src/engine/bot.js';
import { PHYSICS_VERSION } from '../games/pinball/src/engine/config.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const id = args[0] || 'alu', n = Number(args[1] || 100);
if (!TABLES[id]) { console.error('neznana miza: ' + id); process.exit(1); }
const table = (await TABLES[id]()).default;
const t0 = Date.now(), games = [];
for (let i = 0; i < n; i++) {
  games.push(botGame({ table, seed: 1000 + i * 17 }));
  process.stderr.write(`\r${i + 1} / ${n}`);
}
process.stderr.write('\n');
const r = botReport(games);
if (process.argv.includes('--json')) console.log(JSON.stringify(r));
else {
  console.log(`Bot — miza ${id}, fizika f${PHYSICS_VERSION}, ${n} iger, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const [k, v] of Object.entries(r)) console.log('  ' + k.padEnd(16) + v);
}
