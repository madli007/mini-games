/* =====================================================================
   DIRKA FRNIKOL — bets.js: stave in izplačila (čista logika).
   Točke so znotraj igre (niso kovanci huba). Vložek se odšteje ob stavi,
   izplačilo = vložek × kvota (zaokroženo navzdol), če je stava zadeta.
   ===================================================================== */

export const BET = {
  START: 1000,     // začetni kupček
  MIN: 10,         // najmanjša stava
  PER_RACE: 3,     // največ stav na dirko
  LOAN: 100,       // enkratno posojilo na dan, če kupček pade pod MIN
  RACES: 5,        // dirk na Dirkalni dan
};

export const BET_TYPES = {
  win: { name: 'Zmagovalec', short: 'zmaga' },
  podium: { name: 'Na stopničkah', short: 'top 3' },
  duel: { name: 'Dvoboj', short: 'dvoboj' },
};

/**
 * Preveri novo stavo. Vrne kodo napake ali null.
 * @param {number} bank kupček (pred to stavo; vložki prejšnjih stav te dirke so že odšteti)
 * @param {Object[]} bets že oddane stave te dirke
 * @param {{type:string, m:number, vs?:number, stake:number, odds:number}} b
 * @returns {null|'type'|'count'|'min'|'bank'|'same'|'odds'}
 */
export function betError(bank, bets, b) {
  if (!b || !BET_TYPES[b.type]) return 'type';
  if (bets.length >= BET.PER_RACE) return 'count';
  if (!Number.isInteger(b.stake) || b.stake < BET.MIN) return 'min';
  if (b.stake > bank) return 'bank';
  if (!(b.odds > 1)) return 'odds';
  if (!Number.isInteger(b.m) || b.m < 0) return 'type';
  if (b.type === 'duel' && (!Number.isInteger(b.vs) || b.vs === b.m)) return 'type';
  if (bets.some(x => x.type === b.type && x.m === b.m && (x.vs ?? -1) === (b.vs ?? -1))) return 'same';
  return null;
}

/** Razumljivo sporočilo napake. */
export const BET_ERRORS = {
  type: 'Neveljavna stava.',
  count: `Največ ${BET.PER_RACE} stave na dirko.`,
  min: `Najmanjša stava je ${BET.MIN} točk.`,
  bank: 'Toliko točk nimaš.',
  same: 'To stavo si že oddal.',
  odds: 'Kvota ni na voljo.',
};

/**
 * Ali je stava zadeta glede na končni vrstni red (indeksi frnikol).
 * @param {{type:string, m:number, vs?:number}} b
 * @param {number[]} order
 */
export function betWon(b, order) {
  const p = order.indexOf(b.m);
  if (p < 0) return false;
  if (b.type === 'win') return p === 0;
  if (b.type === 'podium') return p < 3;
  if (b.type === 'duel') { const q = order.indexOf(b.vs); return q >= 0 && p < q; }
  return false;
}

/** Izplačilo stave (0, če ni zadeta). */
export function payout(b, order) {
  return betWon(b, order) ? Math.floor(b.stake * b.odds) : 0;
}

/**
 * Obračun vseh stav dirke.
 * @returns {{total:number, won:Object[], lost:Object[], staked:number}}
 */
export function settle(bets, order) {
  const won = [], lost = [];
  let total = 0, staked = 0;
  for (const b of bets) {
    staked += b.stake;
    const p = payout(b, order);
    if (p > 0) { total += p; won.push({ ...b, pay: p }); } else lost.push({ ...b, pay: 0 });
  }
  return { total, won, lost, staked };
}

/**
 * Kupček udeleženca pred stavami: posojilo, če je pod MIN in ga še ni porabil.
 * @param {{bank:number, loan:boolean}} acc
 * @returns {boolean} true, če je bilo posojilo dano
 */
export function maybeLoan(acc) {
  if (acc.bank < BET.MIN && !acc.loan) { acc.bank += BET.LOAN; acc.loan = true; return true; }
  return false;
}

/** Končni rezultat dneva: kupček minus vrnjeno posojilo (ne manj kot 0). */
export function finalScore(acc) {
  return Math.max(0, acc.bank - (acc.loan ? BET.LOAN : 0));
}

/** Opis stave za prikaz (imena frnikol iz names[i]; ins = orodnik za dvoboj: »pred Rdečo zvezdo«). */
export function betLabel(b, names, ins = names) {
  if (b.type === 'win') return `${names[b.m]} zmaga`;
  if (b.type === 'podium') return `${names[b.m]} na stopničkah`;
  return `${names[b.m]} pred ${ins[b.vs]}`;
}

/** Oblika števila kvote: 1,8 */
export const fmtOdds = o => (Math.round(o * 10) / 10).toFixed(1).replace('.', ',');
