/* =====================================================================
   SMUČARSKI SKOKI — napredek online (shared/progress.js → hub.writeSave, tabela game_saves)
   Sloti:  kariera   skoki:career:<uid>                      (cela kariera; konflikt: rev → več tekem)
           skakalci  skoki:jumpers:<uid>, skoki:jstats:<uid> (»Moji skakalci« in njihova statistika)
           rekordi   skoki:best:<uid>:<skakalnica>           (osebni rekordi + ghost; ghost se po potrebi odreže)
           napredek  skoki:stats, skoki:reacts, skoki:daily:<uid>, skoki:cup:used|aw:<uid>:…
   Čiste funkcije (brez DOM): testi v tests/progress.js.
   ===================================================================== */
import * as CA from '../../shared/sport/career.js';
import * as JP from './jumpers.js';
import { merge as M, cloudSync } from '../../shared/progress.js';

const num = (v, max = 1e9) => (Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const flags = o => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([k, v]) => /^[a-z0-9_-]{1,40}$/.test(k) && v === true)) : {});
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/* ----------------------------------------------------------- kariera */

/** Napredek kariere (za konflikt ob enakem rev): odigrane tekme, nato sezone in točke. */
export const careerScore = st => (st?.stats?.events | 0) * 1000 + (st?.stats?.seasons | 0) * 10 + (st?.league | 0);
export const checkCareer = v => CA.restoreCareer(v) || undefined;
/** Dve karieri: večji rev zmaga, ob enakem rev tista z več napredka. */
export const mergeCareer = M.newer(careerScore);
/** Prevelika kariera: obdrži zadnjih 40 sezon zgodovine. */
export function shrinkCareer(bag) {
  if (bag.career?.history?.length > 40) bag.career.history = bag.career.history.slice(-40);
  return bag;
}

/* ----------------------------------------------------------- skakalci */

export const checkJumpers = v => (Array.isArray(v) ? JP.validateList(v).list : undefined);
const STAT_KEYS = ['jumps', 'falls', 'comps', 'wins', 'podiums'];
export function checkJStats(v) {
  if (!isObj(v)) return undefined;
  const out = {};
  for (const [id, s] of Object.entries(v).slice(0, 200)) {
    if (!/^[\w-]{1,40}$/.test(id) || !isObj(s)) continue;
    const o = {};
    for (const k of STAT_KEYS) o[k] = num(s[k] | 0);
    o.best = {};
    if (isObj(s.best)) for (const [h, d] of Object.entries(s.best)) if (/^[a-z0-9_-]{1,40}$/.test(h) && Number.isFinite(d)) o.best[h] = num(d, 1000);
    out[id] = o;
  }
  return out;
}
/** Statistika skakalcev z dveh naprav: po skakalcu večji števci, rekordi po skakalnicah največji. */
export function mergeJStats(a, b) {
  const out = structuredClone(b);
  for (const [id, s] of Object.entries(a)) {
    const o = out[id];
    if (!o) { out[id] = s; continue; }
    for (const k of STAT_KEYS) o[k] = Math.max(o[k] | 0, s[k] | 0);
    o.best = M.maxBy(s.best, o.best);
  }
  return out;
}

/* ----------------------------------------------------------- rekordi skakalnic */

export function checkBest(v) {
  if (!isObj(v) || !Number.isFinite(v.total) || !Number.isFinite(v.dist)) return undefined;
  const o = { total: v.total, dist: v.dist, pv: v.pv | 0, at: num(v.at) };
  if (typeof v.data === 'string' && v.data.length <= 8192) o.data = v.data;
  return o;
}
/** Boljši skok (daljši, nato več točk); ob enakem tisti z ghostom. */
export function mergeBest(a, b) {
  if (b.dist !== a.dist) return b.dist > a.dist ? b : a;
  if (b.total !== a.total) return b.total > a.total ? b : a;
  return !a.data && b.data ? b : a;
}
/** Prevelik zapis: odreži ghoste (največje najprej), rekordi ostanejo. */
export function shrinkBest(bag, max) {
  const size = () => JSON.stringify({ v: 1, k: bag }).length;
  const names = Object.keys(bag).filter(n => bag[n]?.data).sort((x, y) => bag[y].data.length - bag[x].data.length);
  for (const n of names) { if (size() <= max) break; delete bag[n].data; }
  return bag;
}

/* ----------------------------------------------------------- statistika, dnevni izziv, pokal */

export function checkStats(v) {
  if (!isObj(v)) return undefined;
  return { jumps: num(v.jumps | 0), falls: num(v.falls | 0), hints: num(v.hints | 0, 100), overK: flags(v.overK), overHS: flags(v.overHS), visited: flags(v.visited) };
}
export function mergeStats(a, b) {
  return {
    jumps: Math.max(a.jumps, b.jumps), falls: Math.max(a.falls, b.falls), hints: Math.max(a.hints, b.hints),
    overK: { ...b.overK, ...a.overK }, overHS: { ...b.overHS, ...a.overHS }, visited: { ...b.visited, ...a.visited },
  };
}

export function checkDaily(v) {
  if (!isObj(v) || !DAY.test(v.day)) return undefined;
  const best = isObj(v.best) && Number.isFinite(v.best.total) ? { total: v.best.total, dist: Number(v.best.dist) || 0, fall: !!v.best.fall } : null;
  return { day: v.day, used: num(v.used | 0, 10), best, reported: !!v.reported, done: (Array.isArray(v.done) ? v.done : []).filter(d => DAY.test(d)).sort().slice(-30) };
}
/** Dnevni izziv z dveh naprav: novejši dan; isti dan → več porabljenih poskusov, boljši skok, »oddano« ostane. */
export function mergeDaily(a, b) {
  const done = M.union(30)(a.done, b.done);
  if (a.day !== b.day) return { ...(a.day > b.day ? a : b), done };
  const best = !a.best ? b.best : !b.best ? a.best : (b.best.total > a.best.total ? b.best : a.best);
  return { day: a.day, used: Math.max(a.used, b.used), best, reported: a.reported || b.reported, done };
}

const flag = v => (v === true ? true : undefined);
const count = v => (Number.isFinite(v) && v >= 0 ? Math.min(1e6, v | 0) : undefined);

/* ----------------------------------------------------------- pravila po slotih */

export const SLOTS = {
  kariera: {
    rules: [{ name: 'career', key: u => `skoki:career:${u}`, check: checkCareer, merge: mergeCareer }],
    shrink: shrinkCareer,
  },
  skakalci: {
    rules: [
      { name: 'jumpers', key: u => `skoki:jumpers:${u}`, check: checkJumpers, merge: M.local },
      { name: 'jstats', key: u => `skoki:jstats:${u}`, check: checkJStats, merge: mergeJStats },
    ],
  },
  rekordi: {
    rules: [{ name: 'best:', prefix: u => `skoki:best:${u}:`, re: /^[a-z0-9_-]{1,40}$/, check: checkBest, merge: mergeBest }],
    shrink: shrinkBest,
  },
  napredek: {
    rules: [
      { name: 'stats', key: () => 'skoki:stats', check: checkStats, merge: mergeStats },
      { name: 'reacts', key: () => 'skoki:reacts', check: count, merge: M.max },
      { name: 'daily', key: u => `skoki:daily:${u}`, check: checkDaily, merge: mergeDaily },
      { name: 'used:', prefix: u => `skoki:cup:used:${u}:`, re: /^[\w-]{1,20}:\d{1,3}:[12]$/, check: flag, merge: M.or, cap: 200 },
      { name: 'aw:', prefix: u => `skoki:cup:aw:${u}:`, re: /^[\w:-]{1,60}$/, check: flag, merge: M.or, cap: 300 },
    ],
  },
};

/** Vklopi vse slote Skokov (po hub.init). Vrne Promise, ki se razreši, ko je prvi prenos končan (≤ ~4 s). */
export function startCloud(hub) {
  const syncs = Object.entries(SLOTS).map(([slot, o]) => cloudSync(hub, { slot, ...o }));
  return Promise.all(syncs.map(s => s.ready));
}
