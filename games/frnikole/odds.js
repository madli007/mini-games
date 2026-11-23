/* =====================================================================
   DIRKA FRNIKOL — odds.js: kvote iz tihih simulacij (brez izrisa).
   Za dano postavo (forma frnikol) in progo poženemo N simulacij z rahlo
   spremenjenim začetkom (drug seed → drug vrstni red na startu, drugačne
   linije in izbire na razcepih). Iz pogostosti zmag, uvrstitev med prve tri
   in medsebojnih dvobojev izračunamo verjetnosti in kvote (s provizijo stavnice).
   Čista logika (brez DOM-a).
   ===================================================================== */
import { createRace, runRace } from './race.js';

export const ODDS = {
  SIMS: 30,            // tihih simulacij na dirko
  MARGIN: 0.85,        // vračilo stavnice (1 − provizija)
  WIN: [1.5, 12],      // razpon kvot za zmagovalca
  PODIUM: [1.1, 5],    // razpon kvot za stopničke
  DUEL: [1.3, 3.2],    // razpon kvot za dvoboj
  DUELS: 2,            // ponujenih dvobojev na dirko
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** Kvota zaokrožena na 0,1. */
export const roundOdds = v => Math.round(v * 10) / 10;

/**
 * Statistika iz tihih simulacij (lahko po kosih: onProgress se kliče po vsaki).
 * @param {{track:Object, marbles:Object[], seed:string, sims?:number}} o
 * @returns {{n:number, wins:number[], top3:number[], before:number[][], avgT:number}}
 */
export function simulate({ track, marbles, seed, sims = ODDS.SIMS }) {
  const st = newStats(marbles.length);
  for (let k = 0; k < sims; k++) addSim(st, track, marbles, seed, k);
  return st;
}

export function newStats(n) {
  return { n: 0, wins: Array(n).fill(0), top3: Array(n).fill(0), before: Array.from({ length: n }, () => Array(n).fill(0)), tSum: 0 };
}

/** Ena tiha simulacija k (seed + ':odds:' + k) prišteta v statistiko. */
export function addSim(st, track, marbles, seed, k) {
  const R = createRace({ track, marbles, seed: seed + ':odds:' + k });
  const ord = runRace(R);
  st.n++;
  st.wins[ord[0]]++;
  for (let p = 0; p < 3 && p < ord.length; p++) st.top3[ord[p]]++;
  for (let a = 0; a < ord.length; a++) for (let b = a + 1; b < ord.length; b++) st.before[ord[a]][ord[b]]++;
  st.tSum += R.M[ord[0]].finishT ?? R.t;
  return st;
}

/**
 * Kvote iz statistike.
 * @returns {{win:number[], podium:number[], pWin:number[], pTop3:number[], duels:{a:number,b:number,oa:number,ob:number,pa:number}[], fav:number}}
 */
export function oddsFrom(st) {
  const n = st.wins.length, N = Math.max(1, st.n);
  const a = 0.5;   // glajenje: tudi frnikola brez zmage ima nekaj možnosti
  const pWin = st.wins.map(w => (w + a) / (N + n * a));
  const pTop3 = st.top3.map(t => (t + a * 3 / n * 2) / (N + a * 2));
  const win = pWin.map(p => roundOdds(clamp(ODDS.MARGIN / p, ...ODDS.WIN)));
  const podium = pTop3.map(p => roundOdds(clamp(ODDS.MARGIN / Math.min(0.97, p), ...ODDS.PODIUM)));
  // dvoboji: pari z najbolj izenačeno možnostjo (ne favorit proti outsiderju)
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const pa = (st.before[i][j] + 1) / (st.before[i][j] + st.before[j][i] + 2);
    pairs.push({ a: i, b: j, pa, d: Math.abs(pa - 0.5) + (i * 7 + j * 3) % 5 * 1e-4 });
  }
  pairs.sort((x, y) => x.d - y.d);
  const used = new Set(), duels = [];
  for (const p of pairs) {
    if (duels.length >= ODDS.DUELS) break;
    if (used.has(p.a) || used.has(p.b)) continue;
    used.add(p.a); used.add(p.b);
    duels.push({ a: p.a, b: p.b, pa: p.pa, oa: roundOdds(clamp(ODDS.MARGIN * 1.06 / p.pa, ...ODDS.DUEL)), ob: roundOdds(clamp(ODDS.MARGIN * 1.06 / (1 - p.pa), ...ODDS.DUEL)) });
  }
  let fav = 0;
  win.forEach((o, i) => { if (o < win[fav] || (o === win[fav] && pWin[i] > pWin[fav])) fav = i; });
  return { win, podium, pWin, pTop3, duels, fav, avgT: st.tSum / N };
}

/** Kvote za dirko v enem koraku (testi, generator). */
export function computeOdds(o) { return oddsFrom(simulate(o)); }

/** Vsota implicitnih verjetnosti kvot za zmagovalca (1/kvota) — »prekomerna« vsota je provizija. */
export function overround(win) { return win.reduce((s, o) => s + 1 / o, 0); }
