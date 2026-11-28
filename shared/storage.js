/* =====================================================================
   Varen dostop do localStorage / sessionStorage (vse v try/catch).
   V zasebnem oknu ali z blokiranimi piškotki deluje iz pomnilnika.
   ===================================================================== */

let PREFIX = 'mg:';

/** Zamenjaj predpono ključev (testi uporabljajo svojo, da ne pobrišejo pravih podatkov). */
export function setPrefix(p) { PREFIX = p; }
const memory = { local: new Map(), session: new Map() };
const watchers = new Set();
const notify = key => { for (const fn of watchers) try { fn(key); } catch (e) { console.warn('storage watcher:', e); } };

/**
 * Opazuj spremembe localStorage v tem zavihku (save/remove; ključ brez predpone).
 * Uporablja shared/progress.js, da se napredek igre sam pošlje na strežnik. Vrne funkcijo za odjavo.
 * @param {(key:string)=>void} fn
 */
export function onChange(fn) { watchers.add(fn); return () => watchers.delete(fn); }

function area(kind) {
  try {
    const s = kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
    if (!s) return null;
    return s;
  } catch { return null; }
}

/**
 * Preberi JSON vrednost.
 * @param {string} key brez predpone
 * @param {*} [fallback]
 * @param {'local'|'session'} [kind]
 */
export function load(key, fallback = null, kind = 'local') {
  const k = PREFIX + key;
  try {
    const s = area(kind);
    const raw = s ? s.getItem(k) : memory[kind].get(k);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Zapiši JSON vrednost.
 * @param {string} key
 * @param {*} value
 * @param {'local'|'session'} [kind]
 */
export function save(key, value, kind = 'local') {
  const k = PREFIX + key;
  const raw = JSON.stringify(value);
  try {
    const s = area(kind);
    if (s) s.setItem(k, raw); else memory[kind].set(k, raw);
  } catch {
    memory[kind].set(k, raw);
  }
  if (kind === 'local') notify(key);
}

/** Odstrani ključ. */
export function remove(key, kind = 'local') {
  const k = PREFIX + key;
  try { area(kind)?.removeItem(k); } catch { /* ignore */ }
  memory[kind].delete(k);
  if (kind === 'local') notify(key);
}

/**
 * Atomično (znotraj zavihka) posodobi vrednost.
 * @template T
 * @param {string} key
 * @param {(v:T)=>T} fn
 * @param {T} fallback
 * @returns {T}
 */
export function update(key, fn, fallback) {
  const next = fn(load(key, fallback));
  save(key, next);
  return next;
}

/** Ključi (brez predpone), ki se začnejo z `prefix` (samo localStorage). */
export function keys(prefix = '') {
  const out = new Set();
  try {
    const s = area('local');
    if (s) for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k?.startsWith(PREFIX + prefix)) out.add(k.slice(PREFIX.length)); }
  } catch { /* ignore */ }
  for (const k of memory.local.keys()) if (k.startsWith(PREFIX + prefix)) out.add(k.slice(PREFIX.length));
  return [...out];
}

/** Polni ključ (s predpono) — za primerjavo v `storage` dogodkih. */
export const fullKey = key => PREFIX + key;
