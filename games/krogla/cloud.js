/* =====================================================================
   HRČKOVA KROGLA — napredek online (shared/progress.js → game_saves, slot »napredek«)
   krogla:u:<uid>:best         { <proga>[:m]: ms }   najboljši časi        → manjši čas
   krogla:u:<uid>:reached      [proga]               odklepi turnirjev     → unija
   krogla:u:<uid>:mirror       true                  zrcalni turnir        → ali
   krogla:u:<uid>:weeks        [teden]               tedenski pokali       → unija
   krogla:u:<uid>:save:<pokal> { diff, idx, run, … } nadaljevanje turnirja → novejši (t)
   krogla:u:<uid>:daily:<seed> true                  dnevni poskus porabljen → ali (zadnjih 40)
   krogla:locks                [arena]               ključavnice Rušilca   → unija
   krogla:custom-best          { <hash>: ms }        časi na deljenih progah → manjši čas
   Ghosti ostanejo lokalni (uradni so že na strežniku: hub.saveGhost / getGhost).
   ===================================================================== */
import { merge as M, cloudSync } from '../../shared/progress.js';

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[\w:.-]{1,60}$/;
/** { id: ms } s smiselnimi časi (0 < ms < 1 h). */
export function checkTimes(v) {
  if (!isObj(v)) return undefined;
  const out = {};
  for (const [k, ms] of Object.entries(v).slice(0, 2000)) if (ID.test(k) && Number.isFinite(ms) && ms > 0 && ms < 3600e3) out[k] = Math.round(ms);
  return out;
}
const list = (max = 2000) => v => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && ID.test(x)).slice(0, max) : undefined);
const flag = v => (v === true ? true : undefined);
export function checkCupSave(v) {
  if (!isObj(v) || typeof v.diff !== 'string' || !Number.isInteger(v.idx) || v.idx < 0 || v.idx > 200 || !isObj(v.run)) return undefined;
  if (JSON.stringify(v).length > 20000) return undefined;
  return { diff: v.diff, idx: v.idx, run: v.run, xpLevels: Math.max(0, v.xpLevels | 0), t: Number(v.t) || 0 };
}

export const RULES = [
  { name: 'best', key: u => `krogla:u:${u}:best`, check: checkTimes, merge: M.minBy },
  { name: 'reached', key: u => `krogla:u:${u}:reached`, check: list(), merge: M.union(2000) },
  { name: 'mirror', key: u => `krogla:u:${u}:mirror`, check: flag, merge: M.or },
  { name: 'weeks', key: u => `krogla:u:${u}:weeks`, check: list(500), merge: M.union(500) },
  { name: 'save:', prefix: u => `krogla:u:${u}:save:`, re: /^[\w-]{1,40}$/, check: checkCupSave, merge: M.latest },
  { name: 'daily:', prefix: u => `krogla:u:${u}:daily:`, re: /^[\w.:-]{1,40}$/, check: flag, merge: M.or, cap: 40 },
  { name: 'locks', key: () => 'krogla:locks', check: list(200), merge: M.union(200) },
  { name: 'custom-best', key: () => 'krogla:custom-best', check: checkTimes, merge: M.minBy },
];

/** Vklopi sinhronizacijo (po hub.init); razreši se po prvem prenosu (≤ ~4 s). */
export const startCloud = hub => cloudSync(hub, { slot: 'napredek', rules: RULES }).ready;
