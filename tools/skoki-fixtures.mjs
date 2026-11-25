// Smučarski skoki — ponovno ustvari fiksture fizike za teste (brez npm).
// Zagon: node tools/skoki-fixtures.mjs
// Uporabi le ob NAMERNI spremembi fizike (novi paramsVersion): fiksture varujejo, da se skoki ne spremenijo po nesreči.
//   tests/fixtures/skoki-ref.json     — isti posneti vnosi (changes) znova simulirani: dist, tick, x, type, tableSpeed
//   tests/fixtures/skoki-bot-ref.json — skoki bota (0,3 / 0,7 / 1,0 × 4 seedi, naključni veter) na trening skakalnicah
import { readFile, writeFile } from 'node:fs/promises';
import { buildHill } from '../games/skoki/hill.js';
import { simulate } from '../games/skoki/physics.js';
import { inputFrom } from '../games/skoki/ghost.js';
import { createBot } from '../games/skoki/bot.js';

const root = new URL('../', import.meta.url);
const read = async p => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const P = await read('games/skoki/physics-params.json');
const idx = await read('games/skoki/hills/index.json');
const defs = await Promise.all(idx.hills.map(f => read('games/skoki/hills/' + f)));
const hillOf = id => buildHill(defs.find(d => d.id === id));

// 1) referenčni skoki iz posnetih vnosov
const ref = await read('tests/fixtures/skoki-ref.json');
ref.paramsVersion = P.paramsVersion;
for (const j of ref.jumps) {
  const J = simulate({ hill: hillOf(j.hill), P, gate: j.gate, wind: j.wind, input: inputFrom(j.changes) });
  Object.assign(j, { dist: J.s.dist, tick: J.s.tick, x: J.s.x, type: J.s.landing.type, tableSpeed: J.s.tableSpeed });
}
await writeFile(new URL('tests/fixtures/skoki-ref.json', root), JSON.stringify(ref) + '\n');

// 2) skoki bota na trening skakalnicah (enako kot test v tests/skoki3.js)
const bot = {};
for (const def of defs.filter(d => (d.group || 'trening') === 'trening' && !d.real)) {
  const hill = buildHill(def), rows = [];
  for (const skill of [0.3, 0.7, 1]) for (let i = 0; i < 4; i++) {
    const b = createBot({ skill, seed: 11 + i * 7919 });
    const J = simulate({ hill, P, gate: def.gates.default, wind: { mode: 'random', seed: 5 + i }, input: s => b.input(s) });
    rows.push([J.s.dist, J.s.tick, J.s.landing.type]);
  }
  bot[def.id] = rows;
}
await writeFile(new URL('tests/fixtures/skoki-bot-ref.json', root), JSON.stringify(bot) + '\n');
console.log(`Fiksture za paramsVersion ${P.paramsVersion}: ${ref.jumps.length} referenčnih skokov, ${Object.keys(bot).length} trening skakalnic.`);
