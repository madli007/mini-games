/* =====================================================================
   SMUČARSKI SKOKI — balance.js: statistika skokov botov (brez DOM-a).
   Uporabljajo jo testi, tools/skoki-balance.mjs in stran z drsniki (?debug=1).
   ===================================================================== */
import { buildHill } from './hill.js';
import { simulate } from './physics.js';
import { createBot } from './bot.js';
import { judgeScores } from './judges.js';
import { scoreJump } from './scoring.js';

export const BALANCE_N = 50;
export const SKILLS = [0.3, 0.7, 1];

/**
 * Skoki botov na eni skakalnici.
 * @returns {{hill:string, skill:number, n:number, avg:number, falls:number, overHS:number, overK:number, pts:number, tele:number, speed:number}}
 */
export function balanceRow(def, P, skill, { n = BALANCE_N, gate = def.gates.default, wind = 'off', seed0 = 1 } = {}) {
  const hill = def._built || buildHill(def);
  let sum = 0, falls = 0, over = 0, overK = 0, pts = 0, tele = 0, speed = 0;
  for (let i = 0; i < n; i++) {
    const seed = seed0 + i * 7919;
    const bot = createBot({ skill, seed });
    const wcfg = wind === 'off' ? { mode: 'off', seed: 0 } : { mode: 'random', seed };
    const J = simulate({ hill, P, gate, wind: wcfg, input: s => bot.input(s) });
    const L = J.s.landing;
    const fell = L.type === 'fall';
    sum += L.dist; speed += J.s.tableSpeed;
    if (fell) falls++;
    if (!fell && L.dist >= def.hs) over++;
    if (L.dist >= def.k) overK++;
    if (L.type === 'tele') tele++;
    pts += scoreJump(def, { dist: L.dist, judges: judgeScores(J.s, P, seed), wind: L.windAvg, gate }).total;
  }
  const r2 = v => Math.round(v * 100) / 100;
  return { hill: def.id, skill, n, avg: r2(sum / n), falls: r2(falls / n), overHS: r2(over / n), overK: r2(overK / n), pts: r2(pts / n), tele: r2(tele / n), speed: r2(speed / n) };
}

/** Tabela za vse skakalnice in spretnosti. */
export function balanceTable(defs, P, opt = {}) {
  const rows = [];
  for (const def of defs) {
    const d = { ...def, _built: buildHill(def) };
    for (const skill of opt.skills || SKILLS) rows.push(balanceRow(d, P, skill, opt));
  }
  return rows;
}

/** Tabela kot Markdown (za README in orodje). */
export function balanceMarkdown(rows, defs) {
  const head = '| Skakalnica | Spretnost | Povp. daljava | Padci | Čez K | Čez HS | Telemark | Povp. točke | Hitrost |\n|---|---|---|---|---|---|---|---|---|';
  const pct = v => Math.round(v * 100) + ' %';
  const name = id => { const d = defs.find(x => x.id === id); return d ? `${d.name} (K${d.k}/HS${d.hs})` : id; };
  return head + '\n' + rows.map(r => `| ${name(r.hill)} | ${r.skill.toFixed(1)} | ${r.avg.toFixed(1)} m | ${pct(r.falls)} | ${pct(r.overK)} | ${pct(r.overHS)} | ${pct(r.tele)} | ${r.pts.toFixed(1)} | ${r.speed.toFixed(1)} km/h |`).join('\n');
}
