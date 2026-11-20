/* Reakcija — čista logika (testirana v tests/) */

export const SOLO_ROUNDS = 10;
export const PENALTY_MS = 1000;   // prezgoden klik
export const TIMEOUT_MS = 2000;   // brez klika po zelenem
export const MIN_DELAY = 1200;
export const MAX_DELAY = 4200;

/**
 * Zamiki za dnevni izziv: isti za vse igralce isti dan.
 * @param {(seed:string)=>(()=>number)&{range:Function}} rng hub.rng
 * @param {string} seed hub.dailySeed()
 */
export function dailyDelays(rng, seed, rounds = SOLO_ROUNDS) {
  const rand = rng(seed + ':reakcija');
  return Array.from({ length: rounds }, () => Math.round(rand.range(MIN_DELAY, MAX_DELAY)));
}

/** Povprečje (zaokroženo). */
export function average(times) {
  if (!times.length) return 0;
  return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
}

/** XP za solo igro. */
export function soloXp(avg) {
  return 20 + (avg < 300 ? 10 : 0) + (avg < 250 ? 10 : 0) + (avg < 200 ? 20 : 0);
}

/** XP za multiplayer. */
export function mpXp(isWinner, players) {
  return 25 + (isWinner ? 25 + Math.min(50, players * 5) : 0);
}

/**
 * Zmagovalec kroga: najhitrejši brez prezgodnjega klika in brez zamude.
 * @param {Record<string, {ms:number, early?:boolean, slow?:boolean}>} times
 * @returns {string|null}
 */
export function roundWinner(times) {
  let best = null;
  for (const [id, t] of Object.entries(times)) {
    if (t.early || t.slow) continue;
    if (!best || t.ms < times[best].ms) best = id;
  }
  return best;
}

/**
 * Lestvica po povprečju (manjše je boljše), ob enakosti več zmag.
 * @param {Record<string, number>} totals vsota ms
 * @param {Record<string, number>} counts število krogov
 * @param {Record<string, number>} wins
 */
export function standings(totals, counts, wins = {}) {
  return Object.keys(totals)
    .filter(id => counts[id] > 0)
    .map(id => ({ id, avg: Math.round(totals[id] / counts[id]), wins: wins[id] || 0, rounds: counts[id] }))
    .sort((a, b) => a.avg - b.avg || b.wins - a.wins);
}
