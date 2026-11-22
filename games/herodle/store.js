/* =====================================================================
   HERODLE — lokalno stanje (shared/storage.js: vse v try/catch).
   herodle:settings                       { hard, contrast, seenHelp, pool } (skupno)
   herodle:<obseg>:g:<način>:<datum>      stanje dneva (poskusi, rešeno, bonus)
   herodle:<obseg>:stats:<način>          { <datum>: { solved, attempts, gaveUp, hard } }
   herodle:<obseg>:solved-days            datumi, ko je bil rešen vsaj en bazen Klasike
   <obseg> = adapter + uporabnik (setScope), da se offline/online in identitete ne mešajo.
   ===================================================================== */
import * as S from '../../shared/storage.js';

let scope = 'x';
/** Obseg shranjevanja (npr. 'sb-<userId>' ali 'off-<userId>'). Pokliči po hub.init. */
export function setScope(s) { scope = String(s || 'x').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'x'; }
const K = rest => `herodle:${scope}:${rest}`;

const DEF_SETTINGS = { hard: false, contrast: false, seenHelp: false };

export function getSettings() { return { ...DEF_SETTINGS, ...(S.load('herodle:settings', {}) || {}) }; }
export function setSettings(patch) { const s = { ...getSettings(), ...patch }; S.save('herodle:settings', s); return s; }

/** Prazno stanje dneva. */
export const freshGame = () => ({ guesses: [], solved: false, gaveUp: false, hard: null, heroId: null, reported: false,
  bonus: { answers: [], stars: 0, correct: 0, done: false, reported: false } });

export function loadGame(mode, date) {
  const g = S.load(K(`g:${mode}:${date}`), null);
  if (!g || !Array.isArray(g.guesses)) return freshGame();
  return { ...freshGame(), ...g, bonus: { ...freshGame().bonus, ...(g.bonus || {}) } };
}
export function saveGame(mode, date, g) { S.save(K(`g:${mode}:${date}`), g); }

export function statsDays(mode) { return S.load(K(`stats:${mode}`), {}) || {}; }
export function recordDay(mode, date, rec) {
  const d = statsDays(mode);
  d[date] = rec;
  S.save(K(`stats:${mode}`), d);
  return d;
}

export function solvedDays() { return S.load(K('solved-days'), []) || []; }
/** Zabeleži rešen dan (kateri koli bazen). Vrne true, če je prvi rešen bazen tega dne. */
export function markSolvedDay(date) {
  const list = solvedDays();
  if (list.includes(date)) return false;
  list.push(date);
  list.sort();
  S.save(K('solved-days'), list.slice(-400));
  return true;
}

/* ---------------------------------------------------------------- 2. faza
   herodle:<obseg>:a:<način>:<datum>      stanje ARHIVSKE uganke (ne šteje za statistiko, niz, lestvico)
   herodle:<obseg>:archive-solved         ['<način>:<datum>', …] rešene arhivske uganke (dosežek Arhivar)
   herodle:<obseg>:perfect-days           datumi doseženega popolnega dne (nagrada le enkrat)
   ------------------------------------------------------------------ */

export function loadArchive(mode, date) {
  const g = S.load(K(`a:${mode}:${date}`), null);
  if (!g || !Array.isArray(g.guesses)) return freshGame();
  return { ...freshGame(), ...g, bonus: { ...freshGame().bonus, ...(g.bonus || {}) } };
}
export function saveArchive(mode, date, g) { S.save(K(`a:${mode}:${date}`), g); }

export function archiveSolved() { return S.load(K('archive-solved'), []) || []; }
/** Zabeleži rešeno arhivsko uganko. Vrne skupno število rešenih. */
export function markArchiveSolved(mode, date) {
  const list = archiveSolved();
  const k = `${mode}:${date}`;
  if (!list.includes(k)) { list.push(k); S.save(K('archive-solved'), list.slice(-1000)); }
  return list.length;
}

export function perfectDays() { return S.load(K('perfect-days'), []) || []; }
/** Zabeleži popolni dan. Vrne true samo prvič za ta datum. */
export function markPerfect(date) {
  const list = perfectDays();
  if (list.includes(date)) return false;
  list.push(date);
  S.save(K('perfect-days'), list.slice(-400));
  return true;
}

/** Ali je dnevna uganka končana (rešena, predana ali izgubljena). */
export function isDailyDone(mode, date) { const g = loadGame(mode, date); return !!(g.solved || g.gaveUp || g.lost); }

/**
 * Pogled shrambe za ARHIV z enakim vmesnikom kot ta modul (za načine):
 * loadGame vrne dnevno stanje, če je dan že končan kot dnevna uganka (samo pogled),
 * sicer arhivsko; saveGame piše le arhivsko; statistika in niz se ne spreminjata.
 */
export function archiveView() {
  return {
    getSettings, setSettings: () => getSettings(), freshGame,
    loadGame: (m, d) => (isDailyDone(m, d) ? { ...loadGame(m, d), fromDaily: true } : loadArchive(m, d)),
    saveGame: (m, d, g) => { if (!g.fromDaily) saveArchive(m, d, g); },
    statsDays, recordDay: (m) => statsDays(m), solvedDays, markSolvedDay: () => false,
    isDailyDone, archive: true,
  };
}
