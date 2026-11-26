/* =====================================================================
   HRČKOVA KROGLA — balance.js: merjenje težavnosti prog in rezerve ure pokalov (čista logika, brez DOM-a).
   Uporablja ga `node tools/krogla-levels.mjs --balance` (in testi).

   Izmerjena težavnost: N deterministično zašumljenih voženj autopilota (seme na progo):
   napaka smeri ±13°, hitrosti ±15 % (nova vrednost vsakih 0,5 s, vmes zvezno), zakasnitev odziva 50–120 ms.
   Iz deleža voženj, končanih pod uro Normalne, povprečnega števila padcev in gostote nevarnosti
   (ovire in sovražniki na 10 s vožnje) izpeljemo oceno 1–5.
   ===================================================================== */
import { createWorld, step, STEP } from './physics.js';
import { pilot, runAutopilot } from './autopilot.js';
import { levelTime, DIFFS, CLOCK_BONUS, cupClock } from './rules.js';
import { rng as makeRng } from '../../shared/util.js';

export const NOISE = { angle: 13, speed: 0.15, delay: [0.05, 0.12], every: 0.5, timing: 0.35 };

/** Ena zašumljena vožnja autopilota. */
export function noisyRun(L, seed, { maxT } = {}) {
  const R = makeRng(seed);
  const w = createWorld(L);
  // človeška napaka pri čakanju na pravi trenutek: okna »until« zamaknjena za ±timing s (na točko poti)
  const route = (L.route || []).map(p => (p.until ? { ...p, until: [p.until[0], p.until[1] + (R() * 2 - 1) * NOISE.timing, p.until[2] + (R() * 2 - 1) * NOISE.timing].map((v, i) => (i ? ((v % p.until[0]) + p.until[0]) % p.until[0] : v)) } : p));
  const drive = pilot(w, route);
  const delay = Math.round((NOISE.delay[0] + R() * (NOISE.delay[1] - NOISE.delay[0])) / STEP);
  const buf = [];
  const lim = maxT || Math.max(60, (L.dev?.time || 60) * 3 + 30);
  let a0 = 0, a1 = (R() * 2 - 1) * NOISE.angle, s0 = 1, s1 = 1 + (R() * 2 - 1) * NOISE.speed, seg = 0;
  const per = Math.round(NOISE.every / STEP);
  while (!w.finished && w.t < lim) {
    if (seg >= per) { seg = 0; a0 = a1; s0 = s1; a1 = (R() * 2 - 1) * NOISE.angle; s1 = 1 + (R() * 2 - 1) * NOISE.speed; }
    const f = seg / per; seg++;
    const ang = (a0 + (a1 - a0) * f) * Math.PI / 180, sc = s0 + (s1 - s0) * f;
    let [ix, iz] = drive();
    const c = Math.cos(ang), s = Math.sin(ang);
    [ix, iz] = [(ix * c - iz * s) * sc, (ix * s + iz * c) * sc];
    buf.push([ix, iz]);
    const inp = buf.length > delay ? buf.shift() : [0, 0];
    w.events.length = 0;
    step(w, inp[0], inp[1]);
  }
  return { finished: w.finished, time: w.finished ? w.finishT : null, falls: w.falls };
}

/** Uteži nevarnosti (po smrtnosti: sovražniki, skoki in kladiva več, ploščice na kos). */
export const HAZ = {
  enemy: { bully: 2.5, saw: 1.5, wasp: 1.5, vacuum: 2, magnet: 1.5 },
  hammer: 1.5, mover: 1.5, spinner: 1.5, fan: 0.75, fanRhythm: 1, spring: 1.5, jump: 2, bumper: 0.5, door: 0.5, block: 0.1,
  fall: 0.25, narrow: 0.12, ice: 0.03,
};

/** Število nevarnosti na progi (ovire, sovražniki, padajoče ploščice, ozki deli, led). */
export function hazards(L) {
  const n = k => (L[k] || []).length;
  let fall = 0, ice = 0, narrow = 0;
  const at = (c, r) => (L.map[r]?.[c] ?? ' ') !== ' ';
  L.map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === ' ' || ch === '#') continue;
      if (ch === 'x') fall++;
      if (ch === 'i') ice++;
      if ((!at(c - 1, r) && !at(c + 1, r)) || (!at(c, r - 1) && !at(c, r + 1))) narrow++;
    }
  });
  const enemies = (L.enemies || []).reduce((s, e) => s + (HAZ.enemy[e.t] || 1.5), 0);
  const fans = (L.fans || []).reduce((s, f) => s + (f.period ? HAZ.fanRhythm : HAZ.fan), 0);
  const jumps = (L.route || []).filter(w => (w.speed || 0) >= 8).length / 2;   // skoki z rampe (točki pred in po skoku)
  return enemies + fans + jumps * HAZ.jump + n('hammers') * HAZ.hammer + n('movers') * HAZ.mover + n('spinners') * HAZ.spinner
    + n('springs') * HAZ.spring + n('bumpers') * HAZ.bumper + n('doors') * HAZ.door + n('blocks') * HAZ.block
    + fall * HAZ.fall + ice * HAZ.ice + narrow * HAZ.narrow;
}

/**
 * Izmeri težavnost proge.
 * @returns {{id, time, len, diff, runs, ok, falls, density, score, measured}}
 */
export function measureLevel(L, { runs = 30 } = {}) {
  const limit = levelTime(L, 'normalna');
  let ok = 0, falls = 0;
  for (let k = 0; k < runs; k++) {
    const r = noisyRun(L, `krogla:balance:${L.id}:${k}`);
    if (r.finished && r.time <= limit) ok++;
    falls += r.falls;
  }
  const t = L.dev?.time || 60;
  const density = hazards(L) / t * 10;
  const okRate = ok / runs, fallAvg = falls / runs;
  const score = scoreOf(okRate, fallAvg, density, t);
  return { id: L.id, name: L.name, time: t, diff: L.diff, runs, ok: okRate, falls: fallAvg, density, score, measured: measuredDiff(score) };
}

/**
 * Zvezna ocena težavnosti iz meritev (večja = težja): neuspeh pod uro, padci, gostota nevarnosti
 * in dolžina (dolga proga ponudi več priložnosti za napako, a dolga in redka proga ostane lahka).
 */
export function scoreOf(okRate, fallAvg, density, time = 30) {
  return (1 - okRate) * 2 + Math.min(fallAvg, 4) * 0.4 + Math.min(density, 9) * 0.42 + Math.max(0, Math.log2(time / 20)) * 0.35 * Math.min(1, density / 2);
}
/** Meje ocene za težavnost 2, 3, 4, 5 (uglašeno na klasičnih progah). */
export const SCORE_CUTS = [0.25, 1.35, 2.2, 3.3];
export const measuredDiff = s => 1 + SCORE_CUTS.filter(c => s >= c).length;

/** Spearmanov koeficient med dvema seznamoma števil. */
export function spearman(a, b) {
  const rank = v => { const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = Array(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1; i = j + 1; } return r; };
  const ra = rank(a), rb = rank(b), n = a.length;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db || 1);
}

/** Vožnja autopilota (brez šuma) za simulacijo ure: čas in število pobranih ur. */
export function cleanRun(L) {
  const res = runAutopilot(L);
  const clocks = (L.pickups || []).filter((p, k) => p.t === 'clock' && res.world.collected.has(k)).length;
  return { time: res.time, clocks };
}

/**
 * Simulacija ure pokala z autopilotom.
 * @param {Object} cup pokal
 * @param {Object[]} levels proge pokala v vrstnem redu
 * @param {string} diff težavnost
 * @param {Map<string,{time,clocks}>} runs vožnje autopilota po progah
 * @param {{clocks?:boolean}} [opt] clocks: false = ure se ne štejejo
 * @returns {{done:boolean, reserve:number, given:number, left:number, failAt:string|null}}
 */
export function cupClockSim(cup, levels, diff, runs, { clocks = true } = {}) {
  let clock = 0, given = 0;
  for (const L of levels) {
    const add = levelTime(L, diff, cupClock(cup));
    clock += add; given += add;
    const r = runs.get(L.id);
    const bonus = clocks ? r.clocks * CLOCK_BONUS : 0;
    // ure se poberejo med vožnjo — poenostavljeno: prištejejo se na koncu proge
    if (clock - r.time + bonus * 0.5 <= 0) return { done: false, reserve: 0, given, left: 0, failAt: L.id };
    clock += bonus - r.time; given += bonus;
  }
  return { done: true, reserve: clock / given, given, left: clock, failAt: null };
}

export { DIFFS };
