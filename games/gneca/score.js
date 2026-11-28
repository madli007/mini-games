/* =====================================================================
   GNEČA — score.js: točke in zvezdice nivoja (čista logika).
   Točke = zmaga + preostali čas (hitrost) + uničeni sovražniki
           + škoda stolpu − izgubljeni tekači v vratih − in ÷.
   Zvezdice: 0 ob porazu, 1 za zmago, 2/3 ob mejah iz nivoja (stars).
   ===================================================================== */
import { B } from './balance.js';

/**
 * @param {{won:boolean, timeLeft:number, kills:number, towerDamage:number, towerMax:number, lostMinus:number}} r
 * @returns {{total:number, parts:{win:number, time:number, kills:number, tower:number, lost:number}}}
 */
export function scoreOf(r) {
  const S = B.score;
  const parts = {
    win: r.won ? S.win : 0,
    time: r.won ? Math.floor(Math.max(0, r.timeLeft)) * S.perSecondLeft : 0,
    kills: Math.min(S.killsMax, Math.max(0, Math.round(r.kills)) * S.perKill),
    tower: r.towerMax > 0 ? Math.round(S.tower * Math.min(1, Math.max(0, r.towerDamage) / r.towerMax)) : 0,
    lost: -Math.min(S.lostMax, Math.max(0, Math.round(r.lostMinus)) * S.perLost),
  };
  const total = Math.max(0, parts.win + parts.time + parts.kills + parts.tower + parts.lost);
  return { total, parts };
}

/**
 * @param {boolean} won
 * @param {number} score
 * @param {[number, number]} stars meji za 2★ in 3★
 */
export function starsOf(won, score, stars) {
  if (!won) return 0;
  if (score >= stars[1]) return 3;
  if (score >= stars[0]) return 2;
  return 1;
}

/** Rezultat iz končnega stanja simulacije. */
export function resultOf(st) {
  const won = !!st.over?.won;
  const timeLeft = Math.max(0, (st.maxSteps - st.step) / B.hz);
  const towerDamage = st.tower.max - Math.max(0, st.tower.hp);
  const sc = scoreOf({ won, timeLeft, kills: st.stats.kills, towerDamage, towerMax: st.tower.max, lostMinus: st.stats.lostMinus });
  return { won, timeLeft, towerDamage, score: sc.total, parts: sc.parts, stars: starsOf(won, sc.total, st.L.stars), reason: st.over?.reason || null };
}

/** Zobniki za odigran nivo: nove zvezdice (nad prejšnjim rekordom) + zmaga (+ dnevni). */
export function gearsFor({ won, stars, prevStars = 0, daily = false }) {
  const g = B.gears;
  if (daily) return won ? g.perDaily + stars * 2 : 0;
  return Math.max(0, stars - prevStars) * g.perStar + (won ? g.perWin : 0);
}
