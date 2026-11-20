/* =====================================================================
   MINI GAMES — ekonomija kovancev (čista logika, brez DOM-a).
   Iste številke so v supabase/schema.sql (private.* funkcije) in v
   adapters/local.js. Uglasitev in utemeljitev: PROGRESS.md.
   ===================================================================== */

/** Viri kovancev in omejitve. */
export const COINS = {
  /** odigrana igra (hub.reportGame) */
  GAME: 4,
  /** koliko odigranih iger na dan šteje */
  GAMES_PER_DAY: 20,
  /** zmaga v multiplayerju (players ≥ 2) */
  WIN: 8,
  /** koliko zmag na dan šteje */
  WINS_PER_DAY: 10,
  /** nagrade nalog po mestu (slot): dnevne e/m/h, tedenski w1/w2 */
  QUEST: { e: 15, m: 25, h: 40, w1: 100, w2: 150 },
  /** vse 3 dnevne naloge prevzete */
  ALL_DAILY_BONUS: 25,
  /** prvi odklep dosežka */
  ACHIEVEMENT: 15,
  /** največ na en klic award_coins (bonusi iger) */
  PER_CALL: 100,
  /** dnevna zgornja meja zaslužka (vsi viri skupaj) */
  PER_DAY: 250,
  /** popust dnevne ponudbe */
  OFFER_DISCOUNT: 0.25,
  /** število predmetov v dnevni ponudbi */
  OFFER_SIZE: 4,
};

/** Nagrada za dosežen nivo. */
export function levelReward(level) {
  return Math.min(5 * level, 100);
}

/** Bonus za zaporedne dneve igranja (ob prvi igri dneva): dan 1 → 5 … dan 7+ → 35. */
export function streakBonus(streak) {
  return 5 * Math.max(1, Math.min(streak, 7));
}

/**
 * Nov niz (streak) ob prvi igri dneva.
 * @param {string|null} lastDay zadnji dan igranja 'YYYY-MM-DD'
 * @param {string} today 'YYYY-MM-DD'
 * @param {number} streak trenutni niz
 * @returns {{streak:number, first:boolean}} first = prva igra danes
 */
export function nextStreak(lastDay, today, streak) {
  if (lastDay === today) return { streak: Math.max(1, streak || 0), first: false };
  return { streak: lastDay && addDays(lastDay, 1) === today ? (streak || 0) + 1 : 1, first: true };
}

/** 'YYYY-MM-DD' + n dni. */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/**
 * Koliko se dejansko podeli glede na dnevno mejo.
 * @param {number} amount zahtevano
 * @param {number} earnedToday že zasluženo danes
 * @param {number} [perCall] omejitev na klic (Infinity = brez)
 */
export function grantableCoins(amount, earnedToday, perCall = Infinity) {
  const a = Math.floor(amount || 0);
  if (a <= 0) return 0;
  return Math.max(0, Math.min(a, perCall, COINS.PER_DAY - earnedToday));
}

/** Cena s popustom dnevne ponudbe (celo število, enako kot v SQL: price * 3 / 4). */
export function offerPrice(price) {
  return Math.floor(price * 3 / 4);
}

/**
 * Nagrade, ki jih strežnik izračuna ob hub.reportGame (brez dnevne meje).
 * @param {{won?:boolean, players?:number, gamesToday:number, winsToday:number, firstToday:boolean, streak:number}} o
 * @returns {{game:number, win:number, streak:number}}
 */
export function gameRewards({ won = false, players = 1, gamesToday, winsToday, firstToday, streak }) {
  return {
    game: gamesToday < COINS.GAMES_PER_DAY ? COINS.GAME : 0,
    win: won && players >= 2 && winsToday < COINS.WINS_PER_DAY ? COINS.WIN : 0,
    streak: firstToday ? streakBonus(streak) : 0,
  };
}

/** Oblikuj število kovancev (1.240). */
export function fmtCoins(n) {
  return Math.max(0, Math.floor(n || 0)).toLocaleString('sl-SI');
}
