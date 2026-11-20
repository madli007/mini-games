// Zagon testov brez brskalnika: node tests/run-node.mjs [stevilo-iger]
import { runAll } from './tests.js';

const games = Number(process.argv[2] || 12);
const t0 = Date.now();
const { fails } = runAll(console.log, { games });
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
