/* =====================================================================
   DIRKA FRNIKOL — napredek online (shared/progress.js → game_saves, slot »dnevni«)
   frnikole:daily:<seed>  { started, score? }  dnevni poskus (»prvi poskus šteje«)
   Konflikt: zapis z rezultatom zmaga (pri dveh večji rezultat); zadnjih 40 dni.
   ===================================================================== */
import { cloudSync } from '../../shared/progress.js';

export function checkDaily(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !v.started) return undefined;
  const o = { started: v.started === true ? true : Number(v.started) || true };
  if (Number.isFinite(v.score)) o.score = v.score;
  return o;
}
export function mergeDaily(a, b) {
  if (a.score == null) return b.score == null ? a : b;
  if (b.score == null) return a;
  return b.score > a.score ? b : a;
}

export const RULES = [
  { name: 'daily:', prefix: () => 'frnikole:daily:', re: /^\d{4}-\d{2}-\d{2}$/, check: checkDaily, merge: mergeDaily, cap: 40 },
];

/** Vklopi sinhronizacijo (po hub.init); razreši se po prvem prenosu (≤ ~4 s). */
export const startCloud = hub => cloudSync(hub, { slot: 'dnevni', rules: RULES }).ready;
