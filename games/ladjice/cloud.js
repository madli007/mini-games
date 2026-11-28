/* =====================================================================
   POTAPLJANJE LADJIC — napredek online (shared/progress.js → game_saves, slot »napredek«)
   ladjice:daily:<uid>:<seed>  true   dnevni izziv odigran (šteje prvi poskus) → ali (zadnjih 40)
   ladjice:contracts:<uid>     št.    opravljene pogodbe (dosežek)             → večji
   ladjice:capwins:<uid>       [kap.] kapitani, s katerimi si zmagal            → unija
   Izbrana težavnost AI (ladjice:level) in kapitan sta nastavitvi — ostaneta lokalni.
   ===================================================================== */
import { merge as M, cloudSync } from '../../shared/progress.js';

const flag = v => (v === true ? true : undefined);
const count = v => (Number.isFinite(v) && v >= 0 ? Math.min(1e6, v | 0) : undefined);
const list = v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && /^[\w-]{1,30}$/.test(x)).slice(0, 50) : undefined);

export const RULES = [
  { name: 'daily:', prefix: u => `ladjice:daily:${u}:`, re: /^[\w.:-]{1,40}$/, check: flag, merge: M.or, cap: 40 },
  { name: 'contracts', key: u => `ladjice:contracts:${u}`, check: count, merge: M.max },
  { name: 'capwins', key: u => `ladjice:capwins:${u}`, check: list, merge: M.union(50) },
];

/** Vklopi sinhronizacijo (po hub.init); razreši se po prvem prenosu (≤ ~4 s). */
export const startCloud = hub => cloudSync(hub, { slot: 'napredek', rules: RULES }).ready;
