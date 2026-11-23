/* =====================================================================
   DIRKA FRNIKOL — bots.js: boti stavniki z osebnostmi (čista, deterministična logika).
   Stave: botBets(bot, ctx). Sunki med dirko: botBrain(bot, ctx) → (R) => sunek | null.
   Vse odločitve so iz seeda (rng), zato je dan za vse igralce enak.
   Boti imajo enako število sunkov in enaka pravila kot igralec (race.applyNudge).
   ===================================================================== */
import { rng as makeRng } from '../../shared/util.js';
import { BET, betError } from './bets.js';
import { standings } from './race.js';

/** Osebnosti. */
export const PERSONAS = {
  previdnez: { name: 'Previdnež', icon: '🧐', desc: 'stavi na favorite in stopničke, sunke porabi za pomoč svoji frnikoli' },
  hazarder: { name: 'Hazarder', icon: '🎲', desc: 'velike stave na visoke kvote' },
  zvestoba: { name: 'Zvestoba', icon: '💞', desc: 'vedno stavi na svojo najljubšo barvo' },
  saboter: { name: 'Saboter', icon: '😈', desc: 'z bočnimi sunki ovira frnikolo vodilnega stavnika' },
  statistik: { name: 'Statistik', icon: '📊', desc: 'stavi po kvotah, sunke porabi v zadnji tretjini' },
};
export const PERSONA_IDS = Object.keys(PERSONAS);

/** Imena botov (g: spol za glagole: 'm' | 'f'). */
export const BOT_NAMES = [
  { name: 'Stari Jože', g: 'm', emoji: '👴' },
  { name: 'Kvotna Klara', g: 'f', emoji: '👩‍💼' },
  { name: 'Teta Mici', g: 'f', emoji: '👵' },
  { name: 'Brko Branko', g: 'm', emoji: '🥸' },
  { name: 'Srečna Saša', g: 'f', emoji: '🍀' },
  { name: 'Profesor Pavle', g: 'm', emoji: '🧑‍🏫' },
  { name: 'Zvesti Zdravko', g: 'm', emoji: '🐶' },
  { name: 'Nevarna Nuša', g: 'f', emoji: '🦹‍♀️' },
  { name: 'Tihi Tone', g: 'm', emoji: '🤫' },
  { name: 'Frnikolar Franci', g: 'm', emoji: '🔮' },
  { name: 'Babica Breda', g: 'f', emoji: '🧶' },
  { name: 'Muhasti Miha', g: 'm', emoji: '🪰' },
  { name: 'Pametna Petra', g: 'f', emoji: '🤓' },
  { name: 'Hitri Hugo', g: 'm', emoji: '🏎️' },
];

const sum = a => a.reduce((s, v) => s + v, 0);

/**
 * Stave bota pred dirko.
 * @param {{id:string, persona:string, fav:string}} bot
 * @param {{bank:number, odds:Object, ids:string[], seed:string}} ctx
 *   odds = oddsFrom(...) (win, podium, pWin, pTop3, duels, fav), ids = id-ji frnikol v postavi
 * @returns {{type:string, m:number, vs?:number, stake:number, odds:number}[]}
 */
export function botBets(bot, { bank, odds, ids, seed }, rng = makeRng) {
  const r = rng(`${seed}:bets:${bot.id}`);
  const n = odds.win.length;
  const idx = [...Array(n).keys()];
  const byOdds = idx.slice().sort((a, b) => odds.win[a] - odds.win[b]);
  const out = [];
  let left = bank;
  const add = (type, m, frac, vs) => {
    let stake = Math.floor(Math.max(BET.MIN, bank * frac) / 5) * 5;
    stake = Math.min(stake, left);
    const o = type === 'win' ? odds.win[m] : type === 'podium' ? odds.podium[m] : duelOdds(odds, m, vs);
    const b = { type, m, stake, odds: o, ...(vs !== undefined ? { vs } : {}) };
    if (betError(left, out, b)) return;
    out.push(b); left -= stake;
  };
  if (bank < BET.MIN) return out;
  switch (bot.persona) {
    case 'previdnez':
      add('win', byOdds[0], 0.08 + r() * 0.04);
      add('podium', byOdds[r() < 0.5 ? 0 : 1], 0.12 + r() * 0.06);
      break;
    case 'hazarder': {
      const pick = byOdds[n - 1 - r.int(0, 2)];
      add('win', pick, 0.25 + r() * 0.2);
      if (r() < 0.5) add('win', byOdds[n - 4 - r.int(0, 1)] ?? byOdds[n - 4], 0.1);
      break;
    }
    case 'zvestoba': {
      const k = ids.indexOf(bot.fav);
      if (k >= 0) { add('win', k, 0.15 + r() * 0.1); add('podium', k, 0.1); }
      else add('podium', byOdds[r.int(1, 3)], 0.06);   // najljubše barve danes ni: majhna stava
      break;
    }
    case 'saboter': {
      const d = odds.duels[r.int(0, odds.duels.length - 1)];
      if (d) add('duel', d.pa >= 0.5 ? d.a : d.b, 0.1 + r() * 0.05, d.pa >= 0.5 ? d.b : d.a);
      add('win', byOdds[r.int(1, 3)], 0.07);
      break;
    }
    case 'statistik': {
      // največja pričakovana vrednost p × kvota (verjetnosti iz simulacij)
      const ev = idx.map(i => ({ i, w: odds.pWin[i] * odds.win[i], p: odds.pTop3[i] * odds.podium[i] }));
      const bw = ev.slice().sort((a, b) => b.w - a.w)[0], bp = ev.slice().sort((a, b) => b.p - a.p)[0];
      add('win', bw.i, 0.1 + r() * 0.05);
      add('podium', bp.i, 0.1);
      const d = odds.duels[0];
      if (d) add('duel', d.pa >= 0.5 ? d.a : d.b, 0.05, d.pa >= 0.5 ? d.b : d.a);
      break;
    }
  }
  return out;
}

/** Kvota dvoboja »m pred vs« (0, če tak dvoboj ni ponujen). */
export function duelOdds(odds, m, vs) {
  const d = odds.duels.find(x => (x.a === m && x.b === vs) || (x.a === vs && x.b === m));
  return !d ? 0 : d.a === m ? d.oa : d.ob;
}

/** Frnikola, na katero ima udeleženec največ stavljeno (ali -1). */
export function biggestStake(bets) {
  const by = new Map();
  for (const b of bets) by.set(b.m, (by.get(b.m) || 0) + b.stake);
  let best = -1, bv = 0;
  for (const [m, v] of by) if (v > bv) { bv = v; best = m; }
  return best;
}

/**
 * Možgani bota za sunke (kliče jih race.stepRace vsakih 30 korakov).
 * @param {Object} bot
 * @param {{mine:number, target:number, seed:string}} ctx mine = frnikola z največjo stavo bota, target = tarča saboterja
 * @returns {(R:Object) => ({m:number, k:string, by:string}|null)}
 */
export function botBrain(bot, { mine, target, seed }, rng = makeRng) {
  const r = rng(`${seed}:brain:${bot.id}`);
  const by = bot.id;
  let last = -1e9;   // bot med svojimi sunki počaka vsaj GAP sekund (sunki niso vsi naenkrat)
  const GAP = 4;
  const decide = R => {
    const roll = r();   // vedno en klic na odločitev → determinizem ne glede na izid
    const q = R.nudgers.get(by);
    if (!q || q.left <= 0 || R.t < 3 || R.t - last < GAP) return null;
    const ord = R.order.length ? R.order : standings(R);
    const len = R.M[0].route.len || 1;
    const lead = R.M[ord[0]];
    const frac = lead ? lead.ms / len : 0;
    const pos = i => ord.indexOf(i);
    const alive = i => i >= 0 && R.M[i] && R.M[i].st === 'run' && !R.M[i].finished;
    switch (bot.persona) {
      case 'previdnez':
        if (alive(mine) && pos(mine) >= 2 && roll < 0.25) return { m: mine, k: 'help', by };
        break;
      case 'hazarder':
        if (alive(mine) && frac > 0.55 && pos(mine) >= 1 && pos(mine) <= 4 && roll < 0.35) return { m: mine, k: 'help', by };
        break;
      case 'zvestoba':
        if (alive(mine) && pos(mine) >= 1 && roll < 0.15) return { m: mine, k: 'help', by };
        break;
      case 'saboter':
        if (alive(target) && pos(target) <= 2 && frac > 0.15 && roll < 0.3) return { m: target, k: 'hit', by };
        if (alive(mine) && frac > 0.8 && pos(mine) >= 1 && roll < 0.3) return { m: mine, k: 'help', by };
        break;
      case 'statistik':
        if (alive(mine) && frac > 0.66 && pos(mine) >= 1 && roll < 0.5) return { m: mine, k: 'help', by };
        break;
    }
    return null;
  };
  return R => {
    const n = decide(R);
    if (n) last = R.t;
    return n;
  };
}

/** Glagol v pravem spolu: verb(bot, 'sunil') → 'sunil' | 'sunila'. */
export const verb = (g, base) => (g === 'f' ? base + 'a' : base);
