// Smučarski skoki — izmeri metre na zaletno mesto in popravi gateFactor (točke na mesto) v hills/*.json (brez npm).
// Zagon: node tools/skoki-gatefactor.mjs [--write] [n=20]
// gateFactor = (metri na mesto okoli privzetega mesta, bot 0,7 brez vetra) × vrednost metra — tako kompenzacija zaleta
// (in žirija, ki zalet prilagaja vetru) izravna razliko, ki jo eno mesto res naredi. Luna: kot doslej (le odriv).
import { readFile, writeFile } from 'node:fs/promises';
import { balanceRow } from '../games/skoki/balance.js';
import { buildHill } from '../games/skoki/hill.js';

const root = new URL('../games/skoki/', import.meta.url);
const P = JSON.parse(await readFile(new URL('physics-params.json', root), 'utf8'));
const idx = JSON.parse(await readFile(new URL('hills/index.json', root), 'utf8'));
const WRITE = process.argv.includes('--write');
const n = parseInt(process.argv.find(a => /^\d+$/.test(a)), 10) || 20;

for (const f of idx.hills) {
  const url = new URL('hills/' + f, root);
  const def = JSON.parse(await readFile(url, 'utf8'));
  const d = { ...def, _built: buildHill(def) };
  const g0 = def.gates.default, lo = Math.max(1, g0 - 2), hi = Math.min(def.gates.count, g0 + 2);
  const at = g => balanceRow(d, P, 0.7, { n, gate: g }).avg;
  const mpg = (at(hi) - at(lo)) / (hi - lo);
  const gf = Math.max(0.5, Math.round(mpg * def.meterValue * 10) / 10);
  const mark = Math.abs(gf - def.gateFactor) >= 0.3 ? ' ←' : '';
  console.log(`${def.id.padEnd(22)} ${mpg.toFixed(2)} m/mesto · gateFactor ${def.gateFactor} → ${gf}${mark}`);
  if (WRITE && gf !== def.gateFactor) { def.gateFactor = gf; await writeFile(url, JSON.stringify(def, null, 2) + '\n'); }
}
