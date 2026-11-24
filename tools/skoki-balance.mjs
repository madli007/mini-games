// Smučarski skoki — uravnoteženje: skoki botov na vseh skakalnicah (brez npm).
// Zagon: node tools/skoki-balance.mjs [število skokov na celico, privzeto 50] [--wind]
// Izpiše tabelo po skakalnicah in spretnostih (0,3 / 0,7 / 1,0) v obliki Markdown za games/skoki/README.md.
import { readFile } from 'node:fs/promises';
import { balanceTable, balanceMarkdown } from '../games/skoki/balance.js';

const root = new URL('../games/skoki/', import.meta.url);
const P = JSON.parse(await readFile(new URL('physics-params.json', root), 'utf8'));
const idx = JSON.parse(await readFile(new URL('hills/index.json', root), 'utf8'));
const defs = await Promise.all(idx.hills.map(async f => JSON.parse(await readFile(new URL('hills/' + f, root), 'utf8'))));
const n = Math.max(5, parseInt(process.argv[2], 10) || 50);
const wind = process.argv.includes('--wind') ? 'random' : 'off';

const t0 = Date.now();
const rows = balanceTable(defs, P, { n, wind });
console.log(`Smučarski skoki — uravnoteženje (paramsVersion ${P.paramsVersion}, ${n} skokov na celico, veter: ${wind === 'off' ? 'brez' : 'naključen'})\n`);
console.log(balanceMarkdown(rows, defs));
console.log(`\nCilji: 0,3 → ~K − 15 m (sorazmerno: K − 5 … 22 %), ≤ 30 % padcev · 0,7 → K ± 5 m, ≤ 10 % padcev · 1,0 → HS − 6 … HS + 2, čez HS < 50 %`);
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
