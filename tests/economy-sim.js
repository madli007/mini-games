/* =====================================================================
   Simulacija ekonomije kovancev (30 dni) — uporablja jo tests/tests.js.
   Pravila so ista kot v adapters/local.js in supabase/schema.sql.
   ===================================================================== */

import { COINS, gameRewards, grantableCoins, isCapped, levelReward, nextStreak, addDays } from '../shared/economy.js';
import { level, rng } from '../shared/util.js';

/** Profili igralcev. Verjetnosti so na dan. */
export const PLAYERS = {
  /** ~20 min na dan: 8 iger (3 v multiplayerju, ~1 zmaga), en izpuščen dan na teden */
  typical: {
    games: 8, mp: 3, winRate: 0.35, players: 3, xpPerGame: 40,
    quest: { e: 0.95, m: 0.75, h: 0.35 }, weekly: { w1: 0.9, w2: 0.6 },
    skipDayOfWeek: 6, achievementsFirstDays: 3,
  },
  /** igra ves dan, vse naloge, vse zmage — zgornja meja */
  max: {
    games: 60, mp: 40, winRate: 1, players: 6, xpPerGame: 200,
    quest: { e: 1, m: 1, h: 1 }, weekly: { w1: 1, w2: 1 },
    skipDayOfWeek: -1, achievementsFirstDays: 30,
  },
};

/**
 * @param {typeof PLAYERS.typical} p
 * @param {{days?:number, start?:string, seed?:string}} [opt]
 * @returns {{daily:number[], total:number[], byReason:Record<string, number>}}
 */
export function simulate(p, { days = 30, start = '2026-11-23', seed = 'sim' } = {}) {
  const r = rng(seed);
  let coins = 0, xp = 0, streak = 0, lastDay = null;
  const daily = [], total = [], byReason = {}, dailyCapped = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const dow = i % 7;                    // start je ponedeljek
    let earned = 0, capped = 0;
    const give = (amount, reason, perCall) => {
      const g = isCapped(reason) ? grantableCoins(amount, capped, perCall) : amount;
      if (isCapped(reason)) capped += g;
      earned += g; coins += g;
      byReason[reason] = (byReason[reason] || 0) + g;
    };
    if (dow !== p.skipDayOfWeek) {
      let games = 0, wins = 0;
      for (let k = 0; k < p.games; k++) {
        const st = nextStreak(lastDay, day, streak);
        streak = st.streak; lastDay = day;
        const mp = k < p.mp;
        const won = mp && r() < p.winRate;
        const rw = gameRewards({ won, players: mp ? p.players : 1, gamesToday: games, winsToday: wins, firstToday: st.first, streak });
        if (st.first) give(rw.streak, 'streak');
        if (rw.game) { give(rw.game, 'game'); games++; }
        if (rw.win) { give(rw.win, 'win'); wins++; }
        const before = level(xp).level;
        xp += Math.min(p.xpPerGame, Math.max(0, 5000 - (k * p.xpPerGame)));
        for (let l = before + 1; l <= level(xp).level; l++) give(levelReward(l), 'level');
      }
      let claimed = 0;
      for (const s of ['e', 'm', 'h']) if (r() < p.quest[s]) { give(COINS.QUEST[s], 'quest'); claimed++; }
      if (claimed === 3) give(COINS.ALL_DAILY_BONUS, 'quest_bonus');
      // tedenske: prevzem 5. dan tedna (petek) oz. takoj pri max
      const wDay = p.skipDayOfWeek === -1 ? 0 : 4;
      if (dow === wDay) for (const s of ['w1', 'w2']) if (r() < p.weekly[s]) give(COINS.QUEST[s], 'quest');
      if (i < p.achievementsFirstDays) give(COINS.ACHIEVEMENT, 'ach');
    }
    daily.push(earned);
    dailyCapped.push(capped);
    total.push(coins);
  }
  return { daily, total, byReason, capped: dailyCapped };
}

/** Prvi dan (1 = prvi), ko skupni zaslužek doseže ceno (ali null). */
export function dayToAfford(total, price) {
  const i = total.findIndex(c => c >= price);
  return i < 0 ? null : i + 1;
}
