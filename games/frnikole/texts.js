/* =====================================================================
   DIRKA FRNIKOL — texts.js: slovenski komentator (tekst na zaslonu) in killfeed.
   Čista logika. {m} = ime frnikole, {p} = prejšnja / druga frnikola, {o} = kvota,
   {k} = kdo je sunil (»Ti« ali ime bota), {acc} = frnikola v tožilniku.
   Izbira variante je deterministična (korak dirke), da je posnetek isti.
   Vse frnikole so ženskega spola (»frnikola je padla«).
   ===================================================================== */

export const LINES = {
  start: [
    'In štart! Osem frnikol drvi navzdol!',
    'Vrata so odprta — dirka se je začela!',
    'Gremo! Kdo bo prva ujela ritem proge?',
    'Štart! Steklo na kamnu, srca v grlu.',
  ],
  lead: [
    '{m} prevzema vodstvo!',
    '{m} je spredaj, {p} mora loviti!',
    'Nova vodilna: {m}!',
    '{m} je prehitela {pacc} in vodi!',
    'Menjava na čelu — zdaj vodi {m}.',
    '{m} se je prerinila na prvo mesto!',
  ],
  pass: [
    '{m} je skočila na {place}. mesto.',
    '{m} napreduje — zdaj je {place}.',
    'Lepo prehitevanje: {m} je {place}.',
    '{m} se prebija naprej, {place}. mesto!',
  ],
  outsider: [
    'Outsider s kvoto {o} je spredaj!',
    'Presenečenje! {m} (kvota {o}) vodi!',
    'Kdo bi si mislil — {m} s kvoto {o} na čelu!',
    'Stavnice se tresejo: {m} ({o}) je prva!',
  ],
  fall: [
    '{m} je padla s proge!',
    'Joj! {m} je zgrešila rob.',
    '{m} je odletela v prepad — nazaj na kontrolno točko.',
    'Adijo, {m}! Vrnitev čez dve sekundi.',
    '{m} je preizkusila gravitacijo.',
    '{m} je izgubila tla pod sabo.',
  ],
  stuck: [
    '{m} se je zataknila — nazaj na kontrolno točko.',
    '{m} je obtičala v kotu.',
  ],
  fallHit: [
    'Sabotaža! Po sunku ({k}) je {m} v prepadu!',
    '{m} je po bočnem sunku ({k}) padla s proge!',
    'Sunek ({k}) je {acc} vrgel s proge!',
  ],
  help: [
    'Sunek ({k}) je porinil {acc} naprej!',
    'Pospešek za {acc}! (sunek: {k})',
    '{m} dobi krila — sunek: {k}.',
  ],
  hit: [
    'Bočni sunek ({k}) je zadel {acc}!',
    'Bočni sunek ({k}) — {m} se opoteka!',
    'Sunek ({k}) je {acc} porinil proti robu!',
  ],
  bonk: [
    'Trk! Steklo poje.',
    'Gneča in kup trkov!',
    'Klik-klak — frnikole se rinejo.',
    'Kdo je koga? Pravi kup frnikol!',
  ],
  final: [
    'Zadnja tretjina proge — zdaj gre zares!',
    'Cilj se bliža, vsaka frnikola daje vse!',
    'Še malo — {m} vodi tik pred koncem!',
  ],
  photo: [
    'Foto finiš! Odloča milimeter!',
    'Neverjetno tesno — fotografija bo odločila!',
    'Nos ob nosu v cilj — foto finiš!',
  ],
  win: [
    '{m} je zmagala!',
    'Zmaga za {acc}! Kakšna dirka!',
    '{m} prva čez črto!',
    'Čestitke, {m}! Zlata frnikola dneva.',
  ],
  winOutsider: [
    'Senzacija! {m} s kvoto {o} je zmagala!',
    'Outsider zmaga! {m} ({o}) je presenetila vse.',
  ],
  respawnLead: [
    'Vodilna je padla — dirka je spet odprta!',
  ],
};

/** Vse variante komentatorja (test: vsaj 40). */
export const ALL_LINES = Object.values(LINES).flat();

/**
 * Napolni predlogo.
 * @param {string} tpl
 * @param {Object} v { m, p, pacc, acc, o, k, place }
 */
export function fill(tpl, v = {}) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ''));
}

/**
 * Izberi vrstico iz skupine (deterministično iz n, npr. korak dirke).
 * @param {string} group
 * @param {number} n
 * @param {Object} v
 */
export function line(group, n, v) {
  const list = LINES[group];
  if (!list) return '';
  return fill(list[Math.abs(n | 0) % list.length], v);
}

/**
 * Vrstica za killfeed ob sunku.
 * @param {'help'|'hit'} k vrsta sunka
 * @param {string|null} who ime bota ali null (ti)
 * @param {string} acc frnikola v tožilniku
 * @param {'m'|'f'} [g] spol bota (za glagol)
 */
export function nudgeFeed(k, who, acc, g) {
  if (!who) return k === 'help' ? `Tvoj sunek je porinil ${acc} naprej!` : `Tvoj bočni sunek je zadel ${acc}!`;
  const s = g === 'f' ? 'a' : '';
  return k === 'help' ? `${who} je porinil${s} ${acc} naprej` : `${who} je sunil${s} ${acc} vstran`;
}
