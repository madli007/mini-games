// Smučarski skoki — hitro uglaševanje ene skakalnice (brez npm).
// Zagon: node tools/skoki-tune.mjs <id> [n=30] [--wind]
// Izpiše validator, hitrost na mizi, povprečja botov (0,3 / 0,7 / 1,0), čas leta in cilje.
import { readFile } from 'node:fs/promises';
import { balanceRow, meetsTarget, balanceTarget } from '../games/skoki/balance.js';
import { buildHill, validateHill } from '../games/skoki/hill.js';
import { simulate } from '../games/skoki/physics.js';
import { createBot } from '../games/skoki/bot.js';

const root = new URL('../games/skoki/', import.meta.url);
const P = JSON.parse(await readFile(new URL('physics-params.json', root), 'utf8'));
const id = process.argv[2];
const n = parseInt(process.argv[3], 10) || 30;
const def = JSON.parse(await readFile(new URL('hills/' + id + '.json', root), 'utf8'));
const errs = validateHill(def);
if (errs.length) { console.log('NAPAKE:', errs); process.exit(1); }
const d = { ...def, _built: buildHill(def) };
const wind = process.argv.includes('--wind') ? 'random' : 'off';
// čas leta (bot 1,0)
let ft = 0;
for (let i = 0; i < 5; i++) { const b = createBot({ skill: 1, seed: i + 1 }); const J = simulate({ hill: d._built, P, gate: def.gates.default, wind: { mode: 'off', seed: 0 }, input: s => b.input(s) }); ft += J.s.flightTime; }
console.log(`${def.name} K${def.k}/HS${def.hs} · let (1,0) ${(ft / 5).toFixed(2)} s`);
for (const skill of [0.3, 0.7, 1]) {
  const r = balanceRow(d, P, skill, { n, wind });
  const okk = meetsTarget(def, r), t = balanceTarget(def, skill);
  console.log(`${skill.toFixed(1)}: ${r.avg.toFixed(1)} m · padci ${Math.round(r.falls * 100)} % · čez K ${Math.round(r.overK * 100)} % · čez HS ${Math.round(r.overHS * 100)} % · tele ${Math.round(r.tele * 100)} % · ${r.pts.toFixed(1)} t · ${r.speed.toFixed(1)} km/h ${okk ? '✔' : '✘'} (cilj ${t.min.toFixed(0)}–${t.max.toFixed(0)} m)`);
}
