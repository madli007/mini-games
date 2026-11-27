// Zagon testov brez brskalnika: node tests/run-node.mjs [stevilo-iger]
import { readFile } from 'node:fs/promises';
import { runAll } from './tests.js';

const games = Number(process.argv[2] || 12);
let golden = null;
try { golden = JSON.parse(await readFile(new URL('../../../tests/fixtures/pinball-golden.json', import.meta.url), 'utf8')); } catch (e) { /* ni posnetka */ }
const t0 = Date.now();
const { fails } = runAll(console.log, { games, golden });
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
