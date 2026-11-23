/* =====================================================================
   HERODLE — lokalno stanje (shared/storage.js: vse v try/catch).
   herodle:settings                       { hard, contrast, seenHelp, pool } (skupno)
   herodle:<obseg>:g:<način>:<datum>      stanje dneva (poskusi, rešeno, bonus)
   herodle:<obseg>:stats:<način>          { <datum>: { solved, attempts, gaveUp, hard } }
   herodle:<obseg>:solved-days            datumi, ko je bil rešen vsaj en bazen Klasike
   <obseg> = adapter + uporabnik (setScope), da se offline/online in identitete ne mešajo.
   Online se vse razen nastavitev sinhronizira med napravami prek tabele herodle_state
   (attachCloud + pull ob zagonu in ob vrnitvi v zavihek; vsak zapis gre v vrsto za upsert).
   ===================================================================== */
import * as S from '../../shared/storage.js';

let scope = 'x';
/** Obseg shranjevanja (npr. 'sb-<userId>' ali 'off-<userId>'). Pokliči po hub.init. */
export function setScope(s) { scope = String(s || 'x').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60) || 'x'; }
const K = rest => `herodle:${scope}:${rest}`;

/* ------------------------------------------------------- sinhronizacija */
const SYNC_RE = /^(?:[ga]:[a-z0-9_-]{1,30}:\d{4}-\d{2}-\d{2}|stats:[a-z0-9_-]{1,30}|solved-days|archive-solved|perfect-days)$/;
const LIST_CAP = { 'solved-days': 400, 'perfect-days': 400, 'archive-solved': 1000 };
let cloud = null;            // { client, userId }
const pending = new Map();   // ključ → vrednost za upsert
let flushTimer = null;

/** Zapiši lokalno in (online) v vrsto za strežnik. */
function put(rest, value) {
  S.save(K(rest), value);
  if (!cloud || !SYNC_RE.test(rest)) return;
  pending.set(rest, value);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 600);
}

/** Vklopi sinhronizacijo (samo Supabase). */
export function attachCloud(client, userId) {
  cloud = client && userId ? { client, userId } : null;
  if (cloud && typeof addEventListener === 'function') {
    addEventListener('pagehide', () => { flush(); });
  }
}

/** Pošlji čakajoče zapise na strežnik. */
export async function flush() {
  clearTimeout(flushTimer);
  if (!cloud || !pending.size) return;
  const now = new Date().toISOString();
  const rows = [...pending].map(([key, value]) => ({ user_id: cloud.userId, key, value, updated_at: now }));
  pending.clear();
  const { error } = await cloud.client.from('herodle_state').upsert(rows);
  if (error) {
    console.warn('[herodle] sinhronizacija ni uspela:', error.message);
    for (const r of rows) if (!pending.has(r.key)) pending.set(r.key, r.value);
    if (/herodle_state|42P01|PGRST205/.test(`${error.code} ${error.message}`)) cloud = null;   // tabele ni → samo lokalno
  }
}

const gameProgress = g => (g ? (g.solved || g.gaveUp || g.lost ? 1000 : 0) + (g.guesses?.length || 0) + (g.wrong || 0) : -1);
const bonusProgress = b => (b ? (b.done ? 1000 : 0) + (b.answers?.length || 0) : -1);

/**
 * Združi lokalno in strežniško vrednost ključa (čisto, za teste).
 * Igra: zmaga tista z več napredka, zastavice »reported« se OR-ajo (nagrade le enkrat).
 * Statistika: unija po datumih. Seznami: unija.
 */
export function mergeValue(key, local, remote) {
  if (local == null) return remote;
  if (remote == null) return local;
  if (/^[ga]:/.test(key)) {
    const [a, b] = gameProgress(remote) > gameProgress(local) ? [remote, local] : [local, remote];
    const bonus = bonusProgress(b.bonus) > bonusProgress(a.bonus) ? b.bonus : a.bonus;
    const out = { ...a, reported: !!(a.reported || b.reported) };
    if (bonus || a.bonus || b.bonus) out.bonus = { ...(bonus || {}), reported: !!(a.bonus?.reported || b.bonus?.reported) };
    return out;
  }
  if (key.startsWith('stats:')) return { ...remote, ...local };
  if (Array.isArray(local) && Array.isArray(remote)) return [...new Set([...local, ...remote])].sort().slice(-(LIST_CAP[key] || 1000));
  return local;
}

/**
 * Prenesi stanje s strežnika, ga združi z lokalnim in pošlji nazaj, kar strežniku manjka.
 * @returns {Promise<string[]>} ključi, ki so se lokalno spremenili
 */
export async function pull() {
  if (!cloud) return [];
  const { data, error } = await cloud.client.from('herodle_state').select('key,value')
    .eq('user_id', cloud.userId).order('updated_at', { ascending: false }).limit(3000);
  if (error) {
    console.warn('[herodle] branje stanja s strežnika ni uspelo:', error.message);
    if (/herodle_state|42P01|PGRST205/.test(`${error.code} ${error.message}`)) cloud = null;
    return [];
  }
  const remote = new Map((data || []).map(r => [r.key, r.value]));
  const prefix = K('');
  const all = new Set([...remote.keys(), ...S.keys(prefix).map(k => k.slice(prefix.length))]);
  const changed = [];
  for (const k of all) {
    if (!SYNC_RE.test(k)) continue;
    const l = S.load(K(k), null), r = remote.has(k) ? remote.get(k) : null;
    const m = mergeValue(k, l, r);
    const ms = JSON.stringify(m);
    if (ms !== JSON.stringify(l)) { S.save(K(k), m); changed.push(k); }
    if (ms !== JSON.stringify(r) && !pending.has(k)) pending.set(k, m);
  }
  if (pending.size) await flush();
  return changed;
}

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
export function saveGame(mode, date, g) { put(`g:${mode}:${date}`, g); }

export function statsDays(mode) { return S.load(K(`stats:${mode}`), {}) || {}; }
export function recordDay(mode, date, rec) {
  const d = statsDays(mode);
  d[date] = rec;
  put(`stats:${mode}`, d);
  return d;
}

export function solvedDays() { return S.load(K('solved-days'), []) || []; }
/** Zabeleži rešen dan (kateri koli bazen). Vrne true, če je prvi rešen bazen tega dne. */
export function markSolvedDay(date) {
  const list = solvedDays();
  if (list.includes(date)) return false;
  list.push(date);
  list.sort();
  put('solved-days', list.slice(-400));
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
export function saveArchive(mode, date, g) { put(`a:${mode}:${date}`, g); }

export function archiveSolved() { return S.load(K('archive-solved'), []) || []; }
/** Zabeleži rešeno arhivsko uganko. Vrne skupno število rešenih. */
export function markArchiveSolved(mode, date) {
  const list = archiveSolved();
  const k = `${mode}:${date}`;
  if (!list.includes(k)) { list.push(k); put('archive-solved', list.slice(-1000)); }
  return list.length;
}

export function perfectDays() { return S.load(K('perfect-days'), []) || []; }
/** Zabeleži popolni dan. Vrne true samo prvič za ta datum. */
export function markPerfect(date) {
  const list = perfectDays();
  if (list.includes(date)) return false;
  list.push(date);
  put('perfect-days', list.slice(-400));
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
