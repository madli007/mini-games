// Gneča — uglaševanje nivojev kampanje z avtopilotom.
//   node tools/gneca-tune.mjs                 izpiše stanje vseh nivojev (brez sprememb)
//   node tools/gneca-tune.mjs --write [id…]   uglasi (vsi ali naštetih) in zapiše levels/*.json
// Pravilo: HP stolpa raste po kampanji (200 + 35 × indeks, šef 1200), moč valov (n, grow, HP velikanov) se z
// bisekcijo nastavi tako, da avtopilot s »pričakovanimi« nadgradnjami za ta nivo zmaga do ciljnega časa
// (38 s + 1,3 s × indeks, šef 80 s). Meje zvezdic iz istih tekov: 2★ = 97 % (pričakovane), 3★ = min(97 % največje, 108 % pričakovane).
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../games/gneca/', import.meta.url);
const D = new URL('levels/', root);
const { createState, step } = await import(new URL('sim.js', root));
const { createAutopilot } = await import(new URL('autopilot.js', root));
const { resultOf } = await import(new URL('score.js', root));
const { paramsFor, MAX_UPGRADES, NO_UPGRADES } = await import(new URL('upgrades.js', root));
const { validateLevel } = await import(new URL('level.js', root));

const args = process.argv.slice(2);
const write = args.includes('--write');
const only = args.filter(a => !a.startsWith('--'));

/** Nadgradnje, ki jih ima tipičen igralec pri nivoju i (od 0). */
const intended = i => { const f = Math.min(1, i / 19); return { rate: Math.round(f * 4), bonus: Math.round(f * 2), charge: Math.round(f * 3), giantHp: Math.round(f * 3), width: 0 }; };

function run(L, up) {
  const st = createState(L, { seed: 'tune', params: paramsFor(up) });
  const ap = createAutopilot();
  while (!st.over) { step(st, ap(st)); st.events.length = 0; }
  return { st, r: resultOf(st) };
}

const fmtLevel = o => '{\n' + Object.entries(o).map(([k, v]) => '  ' + JSON.stringify(k) + ': ' +
  (Array.isArray(v) && v.length && typeof v[0] === 'object' ? '[\n' + v.map(e => '    ' + JSON.stringify(e)).join(',\n') + '\n  ]' : JSON.stringify(v))).join(',\n') + '\n}\n';
const fmtRun = x => (x.r.won ? 'W' : 'L-' + x.r.reason) + '@' + (x.st.step / 60).toFixed(0) + 's ' + x.r.score;

const idx = JSON.parse(readFileSync(new URL('index.json', D), 'utf8'));
const files = idx.sets.flatMap(s => s.levels);
for (let i = 0; i < files.length; i++) {
  const url = new URL(files[i], D);
  const L0 = JSON.parse(readFileSync(url, 'utf8'));
  if (only.length && !only.includes(L0.id)) continue;
  const up = intended(i);
  let L = L0;
  if (write) {
    const target = L0.boss ? 80 : 38 + i * 1.3;
    const hp = L0.boss ? 1200 : 200 + i * 35;
    const scaleW = m => L0.waves.map(w => ({ ...w, n: Math.round(w.n * m), ...(w.grow ? { grow: Math.round(w.grow * m * 10) / 10 } : {}), ...(w.giant ? { hp: Math.max(10, Math.round(w.hp * Math.sqrt(m))) } : {}) }));
    let lo = 0.15, hi = 8, best = null;
    for (let it = 0; it < 12; it++) {
      const m = (lo + hi) / 2;
      const { st, r } = run({ ...L0, towerHp: hp, waves: scaleW(m) }, up);
      if (r.won && st.step / 60 <= target) { lo = m; best = m; } else hi = m;
    }
    L = { ...L0, towerHp: hp, waves: scaleW(best || 0.15) };
  }
  const a = run(L, up), n = run(L, NO_UPGRADES), m = run(L, MAX_UPGRADES);
  if (write) {
    const s3 = Math.round(Math.min(m.r.score * 0.97, a.r.score * 1.08) / 10) * 10;
    L.stars = [Math.min(Math.round(a.r.score * 0.97 / 10) * 10, s3 - 100), s3];
    const e = validateLevel(L);
    if (e.length) { console.log(L.id, 'NEVELJAVEN', e); continue; }
    writeFileSync(url, fmtLevel(L));
  }
  console.log(`${L.id.padEnd(4)} hp ${String(L.towerHp).padStart(4)} | pričakovane ${fmtRun(a)} | brez ${fmtRun(n)} | največje ${fmtRun(m)} | ★ ${L.stars.join('/')}`);
}
