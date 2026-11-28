/* =====================================================================
   ZAPOREDJE — napredek online (shared/progress.js → game_saves, slot »napredek«)
   zaporedje:best:<uid>  dolžina  najdaljše zaporedje (klasika) → večji
   zaporedje:days:<uid>  [dan]    odigrani dnevni izzivi        → unija (zadnjih 60)
   Omejitev in »druga priložnost« sta nastavitvi — ostaneta lokalni.
   ===================================================================== */
import { merge as M, cloudSync } from '../../shared/progress.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const len = v => (Number.isInteger(v) && v >= 0 && v < 10000 ? v : undefined);
const days = v => (Array.isArray(v) ? v.filter(d => typeof d === 'string' && DAY.test(d)).slice(-60) : undefined);

export const RULES = [
  { name: 'best', key: u => `zaporedje:best:${u}`, check: len, merge: M.max },
  { name: 'days', key: u => `zaporedje:days:${u}`, check: days, merge: M.union(60) },
];

/** Vklopi sinhronizacijo (po hub.init); razreši se po prvem prenosu (≤ ~4 s). */
export const startCloud = hub => cloudSync(hub, { slot: 'napredek', rules: RULES }).ready;
