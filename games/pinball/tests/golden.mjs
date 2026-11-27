// Zlati test pinballa: node games/pinball/tests/golden.mjs [--update]
// Brez --update primerja s posnetkom; z --update zapiše nov posnetek (samo ob novi PHYSICS_VERSION!).
import { readFile, writeFile } from 'node:fs/promises';
import { goldenRun, compareGolden } from './golden.js';
import { botGame } from './tests.js';
import { PHYSICS_VERSION } from '../src/config.js';

const FILE = new URL('../../../tests/fixtures/pinball-golden.json', import.meta.url);
const update = process.argv.includes('--update');
const t0 = Date.now();
const { games } = goldenRun((seed, tr) => botGame(seed, 0.75, tr), PHYSICS_VERSION);
const actual = { physicsVersion: PHYSICS_VERSION, games };
let expected = null;
try { expected = JSON.parse(await readFile(FILE, 'utf8')); } catch (e) { /* ni posnetka */ }
if (update) {
  if (expected && expected.physicsVersion === PHYSICS_VERSION && compareGolden(actual, expected).length) {
    console.error('Posnetek za f' + PHYSICS_VERSION + ' že obstaja in se razlikuje. Najprej povečaj PHYSICS_VERSION.');
    process.exit(1);
  }
  await writeFile(FILE, JSON.stringify(actual, null, 1) + '\n');
  console.log('zapisano: tests/fixtures/pinball-golden.json (f' + PHYSICS_VERSION + ')');
} else {
  const diffs = compareGolden(actual, expected);
  for (const d of diffs) console.log(d);
  console.log(diffs.length ? 'ZLATI TEST NEUSPEL (' + diffs.length + ')' : 'zlati test OK (f' + PHYSICS_VERSION + ')');
  process.exitCode = diffs.length ? 1 : 0;
}
console.log(`(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
