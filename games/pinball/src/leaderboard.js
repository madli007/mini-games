/* =====================================================================
   SKUPNA LESTVICA — Supabase REST (brez knjižnic), z lokalno rezervo.
   Če skupna lestvica ni nastavljena ali ni dosegljiva, igra uporablja
   lokalno lestvico iz localStorage (storage.js).
   ===================================================================== */
import { CFG } from './config.js';
import * as Store from './storage.js';

const C = CFG.lestvica || {};
const TIMEOUT = 7000;

let global = null;        // zadnji prenešen top 10 (null = še ni / ni dosegljiv)
let listeners = [];

export const enabled = () => !!(C.url && C.kljuc && typeof fetch === 'function');
/** true, ko je prikazana skupna (ne lokalna) lestvica */
export const isGlobal = () => !!global;
export function onChange(fn) { listeners.push(fn); }
const changed = () => listeners.forEach(fn => { try { fn(); } catch (e) { /* ignoriraj */ } });

async function call(path, opts = {}) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tm = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : 0;
  try {
    const res = await fetch(C.url.replace(/\/+$/, '') + '/rest/v1/' + path, Object.assign({
      signal: ctl ? ctl.signal : undefined,
    }, opts, {
      headers: Object.assign({ apikey: C.kljuc, 'Content-Type': 'application/json' }, opts.headers || {}),
    }));
    return res;
  } finally { if (tm) clearTimeout(tm); }
}

/** prenese top 10; ob napaki ohrani zadnji znani seznam */
export async function refresh() {
  if (!enabled()) return null;
  try {
    const res = await call('scores?select=name,score,created_at&order=score.desc,created_at.asc&limit=10');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const rows = await res.json();
    global = rows.map(r => ({ name: String(r.name), score: Number(r.score), date: String(r.created_at || '').slice(0, 10) }));
    changed();
  } catch (e) { /* brez povezave: ostane lokalna ali zadnja znana lestvica */ }
  return global;
}

/** lestvica za prikaz: skupna, če je na voljo, sicer lokalna */
export function scores() {
  return global ? global.slice() : Store.loadScores();
}

/** se rezultat uvrsti na skupno ali lokalno lestvico? */
export function qualifies(score) {
  if (score <= 0) return false;
  const loc = Store.qualifies(score);
  if (!global) return loc;
  return loc || global.length < 10 || score > global[global.length - 1].score;
}

/**
 * shrani rekord: vedno lokalno, poleg tega na skupno lestvico.
 * Vrne { local, global: true | false | null, error, rank } (rank = indeks na prikazani lestvici ali -1).
 */
export async function submit(name, d) {
  const localIdx = Store.addScore(name, d.score);
  if (!enabled()) return { global: null, rank: localIdx };
  const body = {
    name: String(name).slice(0, 3),
    score: Math.round(d.score),
    play_sec: Math.round(d.playSec || 0),
    multiballs: d.multiballs || 0,
    modes: d.modes || 0,
    wizards: d.wizards || 0,
    max_jackpot: Math.round(d.maxJackpot || 0),
    max_combo: d.maxCombo || 0,
    version: String(CFG.verzija || ''),
  };
  let ok = false, error = '';
  try {
    const res = await call('scores', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(body) });
    ok = res.ok;
    if (!ok) {
      let msg = '';
      try { const j = await res.json(); msg = j.message || j.hint || ''; } catch (e) { /* ignoriraj */ }
      // omejitve tabele vrnejo tehnično sporočilo — prevedi v razumljivo
      if (/violates check constraint/.test(msg)) msg = /time_ok/.test(msg) ? 'igra je bila prekratka' : 'rekord ni veljaven';
      error = msg || 'HTTP ' + res.status;
    }
  } catch (e) { error = 'skupna lestvica ni dosegljiva'; }
  await refresh();
  const list = scores();
  const rank = list.findIndex(e => e.name === body.name && e.score === body.score);
  return { global: ok, error, rank: rank >= 0 ? rank : (global ? -1 : localIdx) };
}
