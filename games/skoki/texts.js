/* =====================================================================
   SMUČARSKI SKOKI — texts.js: komentator (kratki napisi ob dogodkih),
   naključno iz skupine, brez ponavljanja zaporedoma. Brez DOM-a.
   ===================================================================== */

export const LINES = {
  perfect: ['Popoln odriv!', 'Odriv kot po šabloni.', 'To je bil odriv za učbenik.', 'Mizo je zadel do milimetra.'],
  late: ['Zamudil mizo …', 'Malo prepozno z mize.', 'Ta je padel z mize.', 'Odriv je prišel z zamudo.'],
  early: ['Prehitro iz čepa.', 'Prezgodnji odriv, izgubil je hitrost.', 'Malo prenaglo.'],
  flying: ['Leti, leti, leti!', 'Kako lepo nosi!', 'Ta kar ne pristane!', 'Lep, miren let.'],
  sitting: ['Preveč pokonci, zavora!', 'Sedi v zraku …', 'Premalo naprej, upor ga ustavlja.'],
  overK: ['Čez K-točko!', 'Zvonci zvonijo, čez K!', 'To je daljava!', 'Odličen skok, čez K!'],
  overHS: ['Čez HS! Publika je ob pamet.', 'Neverjetno, čez HS!', 'To je rekordna daljava!', 'Žirija bo morala znižati zaletno mesto!'],
  tele: ['Telemark kot iz učbenika.', 'Lep telemark.', 'Pristanek za visoke ocene.', 'Mehko kot pero.'],
  two: ['Pristanek na obe nogi, varno.', 'Brez telemarka, a stoji.', 'Varno, sodniki bodo odbili nekaj točk.'],
  none: ['Trd pristanek, a ostal je na nogah.', 'Ta pristanek ni bil lep.', 'Pozabil je na telemark.'],
  touch: ['Dotik z roko!', 'Ojoj, roka v snegu.', 'Za las ni padel.'],
  fall: ['Snežni angel.', 'Ta je padel bolj v smeri iztečišča.', 'Au. Smuči gredo svojo pot.', 'Padec! Na srečo je sneg mehak.', 'Pristal je … nekako.'],
  nose: ['Preveč naprej, na nos!', 'Prevrnilo ga je naprej.'],
  windHelp: ['Veter je bil danes na tvoji strani.', 'Lep čelni veter ga je nosil.', 'Vzgornik je pomagal.'],
  windAgainst: ['Hrbtni veter ga je potisnil dol.', 'Proti vetru se ne da.', 'Veter v hrbet, težki pogoji.'],
  short: ['Ta ni bil najboljši.', 'Naslednji bo boljši.', 'Kratko, a pristal je.', 'Ogrevanje.'],
  pb: ['Osebni rekord!', 'Nov osebni rekord na tej skakalnici!', 'Še nikoli tako daleč tukaj!'],
};

/**
 * Izbirnik brez ponavljanja zaporedoma.
 * @param {() => number} rand
 */
export function commentator(rand = Math.random) {
  const last = {};
  return group => {
    const arr = LINES[group];
    if (!arr) return '';
    let i = Math.floor(rand() * arr.length);
    if (arr.length > 1 && i === last[group]) i = (i + 1) % arr.length;
    last[group] = i;
    return arr[i];
  };
}

export const totalLines = () => Object.values(LINES).reduce((a, l) => a + l.length, 0);

/** Glavni komentar po pristanku (skupina po prednosti). */
export function landingGroup({ type, fallen, dist, k, hs, wind, pb }) {
  if (fallen === 'nose') return 'nose';
  if (type === 'fall') return 'fall';
  if (type === 'touch') return 'touch';
  if (pb) return 'pb';
  if (dist >= hs) return 'overHS';
  if (dist >= k) return wind >= 1 ? 'windHelp' : 'overK';
  if (wind <= -1) return 'windAgainst';
  if (dist < k * 0.8) return 'short';
  return type === 'tele' ? 'tele' : type === 'two' ? 'two' : 'none';
}
