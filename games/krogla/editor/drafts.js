/* =====================================================================
   HRČKOVA KROGLA — editor/drafts.js: osnutki in »Moje proge« v localStorage
   (prek shared/storage.js). Uporabljata ga urejevalnik in igra.
   Osnutek: { key, L, updated, ready, verified: { hash, time, by } | null }
   ===================================================================== */
import * as S from '../../../shared/storage.js';
import { levelHash } from './model.js';

export const DRAFTS_KEY = 'krogla:editor:drafts';
export const CURRENT_KEY = 'krogla:editor:current';
export const MAX_DRAFTS = 30;

/** Vsi osnutki, najnovejši prvi. */
export function listDrafts() {
  const a = S.load(DRAFTS_KEY, []);
  return (Array.isArray(a) ? a : []).filter(d => d && d.key && d.L && Array.isArray(d.L.map)).sort((x, y) => (y.updated || 0) - (x.updated || 0));
}

export const getDraft = key => listDrafts().find(d => d.key === key) || null;

export function newKey() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Shrani (ali posodobi) osnutek. Nad MAX_DRAFTS se zavržejo najstarejši, ki niso pripravljeni za igro.
 * @returns {{dropped:number}}
 */
export function saveDraft(d) {
  const list = listDrafts().filter(x => x.key !== d.key);
  list.unshift({ ...d, updated: Date.now() });
  let dropped = 0;
  while (list.length > MAX_DRAFTS) {
    let k = -1;
    for (let i = list.length - 1; i > 0; i--) if (!list[i].ready) { k = i; break; }
    list.splice(k > 0 ? k : list.length - 1, 1);
    dropped++;
  }
  S.save(DRAFTS_KEY, list);
  return { dropped };
}

export function removeDraft(key) {
  S.save(DRAFTS_KEY, listDrafts().filter(x => x.key !== key));
}

/** Ali je proga osnutka preverjeno rešljiva (autopilot ali lastna vožnja do cilja) v trenutni obliki. */
export const isVerified = d => !!(d?.verified && d.verified.hash === levelHash(d.L));

/** Lastne proge, pripravljene za igro. */
export const readyDrafts = () => listDrafts().filter(d => d.ready);

/* ---------------------------------------------- lokalni časi in ghosti lastnih prog */

export const customBest = () => S.load('krogla:custom-best', {});
export function saveCustomBest(hash, ms) {
  const b = customBest(); b[hash] = ms; S.save('krogla:custom-best', b);
}
export const customGhost = hash => S.load('krogla:custom-ghost:' + hash, null);
export const saveCustomGhost = (hash, data) => S.save('krogla:custom-ghost:' + hash, data);
