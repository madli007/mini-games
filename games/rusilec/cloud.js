/* =====================================================================
   RUŠILEC — napredek online (shared/progress.js → game_saves, slot »napredek«)
   rusilec:played  [arena]  odigrane arene (dosežek »vse arene«) → unija
   Nastavitve in nastavitve vaje ostanejo lokalne.
   ===================================================================== */
import { merge as M, cloudSync } from '../../shared/progress.js';

const list = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^[\w-]{1,40}$/.test(x)).slice(0, 200) : undefined);

export const RULES = [
  { name: 'played', key: () => 'rusilec:played', check: list, merge: M.union(200) },
];

/** Vklopi sinhronizacijo (po hub.init); razreši se po prvem prenosu (≤ ~4 s). */
export const startCloud = hub => cloudSync(hub, { slot: 'napredek', rules: RULES }).ready;
