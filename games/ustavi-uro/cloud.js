/* =====================================================================
   USTAVI URO — napredek online (shared/progress.js → game_saves, slot »napredek«)
   ustavi-uro:best:<težavnost>:<uid>  ms     najboljša prosta igra    → manjši
   ustavi-uro:days:<uid>              [dan]  odigrani dnevni izzivi   → unija (zadnjih 60)
   ustavi-uro:inner:<uid>             [{t,s}] notranja ura (zadnjih 60) → daljši seznam
   ===================================================================== */
import { merge as M, cloudSync } from '../../shared/progress.js';
import { DIFFS } from './logic.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ms = v => (Number.isFinite(v) && v >= 0 && v < 1e8 ? v : undefined);
const days = v => (Array.isArray(v) ? v.filter(d => typeof d === 'string' && DAY.test(d)).slice(-60) : undefined);
const inner = v => (Array.isArray(v) ? v.filter(h => h && Number.isFinite(h.t) && Number.isFinite(h.s)).map(h => ({ t: h.t, s: h.s })).slice(-60) : undefined);

export const RULES = [
  ...DIFFS.map(d => ({ name: 'best:' + d.id, key: u => `ustavi-uro:best:${d.id}:${u}`, check: ms, merge: M.min })),
  { name: 'days', key: u => `ustavi-uro:days:${u}`, check: days, merge: M.union(60) },
  { name: 'inner', key: u => `ustavi-uro:inner:${u}`, check: inner, merge: M.longer },
];

/** Vklopi sinhronizacijo (po hub.init); razreši se po prvem prenosu (≤ ~4 s). */
export const startCloud = hub => cloudSync(hub, { slot: 'napredek', rules: RULES }).ready;
