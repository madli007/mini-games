/* =====================================================================
   RUŠILEC — texts.js: napisi za killfeed (čista logika).
   {k} = kdo je izrinil, {v} = koga. Izbira je deterministična iz zaporedne
   številke dogodka, da vsi vidijo isti napis.
   ===================================================================== */

export const KILL = [
  '{k} je izrinil {v}',
  '{k} je poslal {v} na izlet v prepad',
  '{k} je zbil {v} z odra',
  '{k} → {v}: adijo!',
  '{k} je pokazal {v}, kje je rob',
  '{k} je {v} zakotalil čez rob',
  '{v} je spoznal pest {k}',
  '{k} je {v} odpihnil kot pero',
  '{k} je pospravil {v}',
  '{k} je {v} poslal v orbito',
  '{v} je letel, {k} se je smejal',
  '{k} je naredil prostor: {v} je zunaj',
];
export const SUICIDE = [
  '{v} se je zakotalil sam',
  '{v} je hotel videti, kaj je spodaj',
  '{v} je preizkusil gravitacijo — deluje',
  '{v} je pozabil zavreti',
  '{v} se je umaknil sam od sebe',
  '{v} je skočil brez padala',
  '{v}: »Saj sem hotel tako.«',
  '{v} je izgubil spor z robom',
];
export const TEAMKILL = [
  '{k} je izrinil soigralca {v} (−1)',
  'Prijateljski ogenj: {k} → {v}',
  '{k} je zamešal barve in izrinil {v}',
];
export const TAGS = {
  double: 'Dvojni izriv!',
  revenge: 'Maščevanje!',
  bank: 'Biljard!',
  hat: 'Hat-trick!',
  lastSec: 'Zadnji trenutek!',
  crown: 'Padla je krona! (+2)',
};

/** Vse variante (za test: vsaj 20). */
export const ALL = [...KILL, ...SUICIDE, ...TEAMKILL, ...Object.values(TAGS)];

/**
 * Napis za dogodek izriva/samomora.
 * @param {Object} e dogodek (type: kill | suicide, k, v, q, revenge, double, …)
 * @param {(id:string) => string} nameHtml ime igralca (že escapano HTML)
 * @returns {{text:string, tags:string[]}}
 */
export function feedText(e, nameHtml) {
  const n = (e.q | 0) + (e.v ? e.v.length : 0);
  const list = e.type === 'suicide' ? SUICIDE : e.team ? TEAMKILL : KILL;
  const tpl = list[n % list.length];
  const text = tpl.replace('{k}', e.k ? nameHtml(e.k) : '').replace('{v}', nameHtml(e.v));
  const tags = [];
  if (e.type === 'kill' && !e.team) for (const k of ['crown', 'hat', 'double', 'revenge', 'bank', 'lastSec']) if (e[k]) tags.push(TAGS[k]);
  return { text, tags };
}
