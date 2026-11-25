/* =====================================================================
   SPORT — career.js: solo kariera proti botom (brez DOM-a, brez pojmov
   posameznega športa). Igra poda lige (prizorišča po oznakah), imena
   rivalov in pravila; tu je stanje kariere, rivali s formo, koledar
   kariera-sezone, točke in napredovanje.

     const st = CA.createCareer({ seed, leagues, rivals: CA.makeRivals(seed, names, 29) });
     const ev = CA.currentEvent(st);                  // { venue, tag, idx }
     const field = CA.field(st, ev);                  // rivali z dejansko spretnostjo za to tekmo
     const out = CA.recordEvent(st, standings);       // točke, statistika; ob koncu sezone napredovanje
     // out = { state, place, won, seasonEnd, promoted, champion, news[] }

   Stanje je navaden JSON (localStorage, izvoz). Igralec ne kupuje statistik: napreduje le z znanjem.
   ===================================================================== */

import { rng, shuffled, hashStr } from './competition.js';
import { CUP_POINTS } from './season.js';

export const CAREER_V = 1;
export const FIELD = 30;               // igralec + 29 rivalov
export const PROMOTE_TOP = 10;         // med najboljših 10 → višja liga

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r3 = v => Math.round(v * 1000) / 1000;

/** Značaji rivalov (vpliv na formo in spretnost po prizoriščih). */
export const CHARACTERS = {
  stabilen: { name: 'stabilen', vol: 0.4 },
  nestanoviten: { name: 'nestanoviten', vol: 1.6 },
  borec: { name: 'borec', vol: 1 },
  mojster: { name: 'mojster posebnih prizorišč', vol: 1 },
};

/**
 * Rivali (deterministično iz seeda): { id, name, flag, rel (0–1 relativna moč), char, spec (oznaka prizorišča ali null), style }.
 * @param {string} seed
 * @param {{name:string, flag?:string, suit?:string, helmet?:string, skill?:number, style?:string}[]} pool imena (in po želji podatki)
 * @param {number} n
 * @param {{specTags?:string[], styles?:string[]}} [o] specTags: oznake prizorišč za »mojstre« (npr. ['letalnica', 'srednja'])
 */
export function makeRivals(seed, pool, n = FIELD - 1, { specTags = [], styles = ['normal'] } = {}) {
  const r = rng('rivali:' + seed);
  const names = shuffled(pool.map((_, i) => i), 'rivali-imena:' + seed).slice(0, n).map(i => pool[i]);
  const chars = Object.keys(CHARACTERS);
  return names.map((p, i) => {
    const rel = p.skill != null ? clamp(p.skill, 0, 1) : r3(Math.pow(r(), 0.8));
    const char = chars[Math.floor(r() * chars.length)];
    const spec = char === 'mojster' && specTags.length ? specTags[Math.floor(r() * specTags.length)] : null;
    return { id: 'r' + i, name: p.name, flag: p.flag || null, suit: p.suit || null, helmet: p.helmet || null, rel: r3(rel), char, spec, style: p.style || styles[Math.floor(r() * styles.length)] };
  });
}

/**
 * Nova kariera.
 * @param {{seed:string, leagues:{id:string, name:string, tags:string[], skill:[number, number], events?:[number, number]}[], rivals:Object[]}} o
 *   leagues: od najnižje do najvišje; tags: oznake prizorišč lige; skill: razpon spretnosti rivalov [min, max]
 */
export function createCareer({ seed, leagues, rivals }) {
  const st = {
    v: CAREER_V, seed: String(seed), league: 0, seasonNo: 1, leagues: leagues.map(l => ({ id: l.id, name: l.name, tags: l.tags.slice(), skill: l.skill.slice(), events: (l.events || [6, 8]).slice() })),
    rivals, schedule: [], eventIdx: 0, points: {}, results: [],
    stats: { events: 0, wins: 0, podiums: 0, longest: 0, seasons: 0, titles: 0, promotions: 0, best: {} }, history: [],
  };
  return startSeason(st);
}

/**
 * Koledar kariera-sezone: 6–8 tekem na prizoriščih lige (venues: [{ id, tag }] — vsa prizorišča igre z oznakami).
 * Deterministično iz seeda, lige in številke sezone. Prizorišča se ne ponavljajo, dokler jih je dovolj.
 */
export function seasonSchedule(seed, league, seasonNo, venues) {
  const r = rng(`kariera:${seed}:${league.id}:${seasonNo}`);
  const [lo, hi] = league.events || [6, 8];
  const n = lo + Math.floor(r() * (hi - lo + 1));
  const pool = venues.filter(v => league.tags.includes(v.tag));
  const out = [];
  let bag = [];
  for (let i = 0; i < n && pool.length; i++) {
    if (!bag.length) bag = shuffled(pool.map(v => v.id), `kariera:${seed}:${league.id}:${seasonNo}:${i}`);
    let k = bag.findIndex(id => id !== out.at(-1)?.venue);
    if (k < 0) k = 0;
    const id = bag.splice(k, 1)[0];
    out.push({ idx: i + 1, venue: id, tag: pool.find(v => v.id === id).tag, wind: Math.round((r() * 2 - 1) * 15) / 10, seed: Math.floor(r() * 4294967295) >>> 0 });
  }
  // zadnja tekma najvišje lige na najzahtevnejšem prizorišču (zadnja oznaka lige), če obstaja
  const top = league.tags.at(-1), last = out.at(-1);
  if (last && last.tag !== top) { const v = pool.filter(x => x.tag === top); if (v.length) { const pick = v[Math.floor(r() * v.length)]; last.venue = pick.id; last.tag = pick.tag; } }
  return out;
}

/** Začni (novo) sezono v trenutni ligi. venues mora igra podati ob prvem klicu (shrani se v stanje). */
export function startSeason(st, venues = st.venues || []) {
  st = structuredClone(st);
  st.venues = venues.map(v => ({ id: v.id, tag: v.tag }));
  st.schedule = seasonSchedule(st.seed, st.leagues[st.league], st.seasonNo, st.venues);
  st.eventIdx = 0; st.points = {}; st.results = [];
  return st;
}

export const league = st => st.leagues[st.league];
export const currentEvent = st => st.schedule[st.eventIdx] || null;
export const seasonOver = st => st.eventIdx >= st.schedule.length;

/**
 * Forma rivala na tekmi (−1 … +1): počasno nihanje (vsak rival svojo fazo), pri nestanovitnih močneje.
 * Deterministično iz seeda, sezone in tekme.
 */
export function formOf(st, rival, ev = currentEvent(st)) {
  const h = hashStr(st.seed + ':' + rival.id);
  const t = (st.seasonNo * 10 + (ev?.idx || 0)) / 3.3;
  const wave = Math.sin(t + (h % 628) / 100) * 0.7 + Math.sin(t * 2.7 + (h % 97)) * 0.3;
  const noise = rng(`${st.seed}:${rival.id}:${st.seasonNo}:${ev?.idx || 0}`)() * 2 - 1;
  return r3(clamp(wave * 0.75 + noise * 0.25, -1, 1));
}

/**
 * Udeleženci tekme (brez igralca): rivali z dejansko spretnostjo za to tekmo.
 * spretnost = razpon lige × rel + forma × 0,06 × nihanje značaja + mojster na svojem prizorišču (+0,06)
 * @returns {{id, name, flag, suit, helmet, skill:number, style:string, form:number, char:string, spec:string|null}[]}
 */
export function field(st, ev = currentEvent(st)) {
  const L = league(st);
  return st.rivals.map(rv => {
    const f = formOf(st, rv, ev);
    const vol = CHARACTERS[rv.char]?.vol ?? 1;
    let skill = L.skill[0] + (L.skill[1] - L.skill[0]) * rv.rel + f * 0.06 * vol;
    if (rv.spec && ev && rv.spec === ev.tag) skill += 0.06;
    return { ...rv, skill: r3(clamp(skill, 0.05, 1)), form: f };
  });
}

/** Točke za mesto v karieri (iste kot v pokalu: 100-80-60 …). */
export const pointsFor = rank => (rank >= 1 && rank <= CUP_POINTS.length ? CUP_POINTS[rank - 1] : 0);

/** Razvrstitev kariera-sezone (igralec = 'me'): [{ id, points, rank }]. */
export function seasonTable(st) {
  const ids = ['me', ...st.rivals.map(r => r.id)];
  const list = ids.map(id => ({ id, points: st.points[id] || 0, wins: st.results.filter(x => x.winner === id).length }));
  list.sort((a, b) => b.points - a.points || b.wins - a.wins || (a.id === 'me' ? -1 : b.id === 'me' ? 1 : a.id.localeCompare(b.id)));
  let rank = 0;
  list.forEach((x, i) => { if (i === 0 || list[i - 1].points !== x.points || list[i - 1].wins !== x.wins) rank = i + 1; x.rank = rank; });
  return list;
}

/**
 * Vpiši končano tekmo (razvrstitev competition.standings z id-ji 'me' in id-ji rivalov).
 * @param {Object} st
 * @param {{id:string, rank:number|null, total:number, status?:string}[]} standings
 * @param {{longest?:number}} [extra] najdaljši dosežek igralca na tej tekmi (npr. daljava) za statistiko
 * @returns {{state, place:number|null, won:boolean, podium:boolean, seasonEnd:boolean, promoted:boolean, champion:boolean, seasonPlace:number|null, news:string[]}}
 */
export function recordEvent(st, standings, extra = {}) {
  st = structuredClone(st);
  const ev = currentEvent(st);
  if (!ev) return { state: st, place: null, won: false, podium: false, seasonEnd: true, promoted: false, champion: false, seasonPlace: null, news: [] };
  for (const r of standings) if (r.rank) st.points[r.id] = (st.points[r.id] || 0) + pointsFor(r.rank);
  const me = standings.find(r => r.id === 'me');
  const place = me?.rank || null;
  const winner = standings.find(r => r.rank === 1)?.id || null;
  st.results.push({ idx: ev.idx, venue: ev.venue, place, winner, total: me?.total ?? null });
  st.stats.events++;
  if (place === 1) st.stats.wins++;
  if (place && place <= 3) st.stats.podiums++;
  if (extra.longest > st.stats.longest) st.stats.longest = extra.longest;
  if (extra.longest) st.stats.best[ev.venue] = Math.max(st.stats.best[ev.venue] || 0, extra.longest);
  st.eventIdx++;
  const out = { place, won: place === 1, podium: !!place && place <= 3, seasonEnd: false, promoted: false, champion: false, seasonPlace: null, news: [] };
  if (seasonOver(st)) {
    out.seasonEnd = true;
    const table = seasonTable(st);
    const mine = table.find(x => x.id === 'me');
    out.seasonPlace = mine.rank;
    out.champion = mine.rank === 1;
    st.stats.seasons++;
    if (out.champion) st.stats.titles++;
    st.history.push({ seasonNo: st.seasonNo, league: league(st).id, place: mine.rank, points: mine.points, champion: out.champion });
    if (mine.rank <= PROMOTE_TOP && st.league < st.leagues.length - 1) { st.league++; out.promoted = true; st.stats.promotions++; }
    st.seasonNo++;
    st.leagueFinal = out.champion && st.league === st.leagues.length - 1 && !out.promoted;
    out.state = startSeason(st);
    return out;
  }
  out.state = st;
  return out;
}

/** Preveri stanje (localStorage / uvoz); vrne stanje ali null. */
export function restoreCareer(json) {
  try {
    const st = typeof json === 'string' ? JSON.parse(json) : structuredClone(json);
    if (!st || st.v !== CAREER_V || !Array.isArray(st.leagues) || !st.leagues.length || !Array.isArray(st.rivals) || !Array.isArray(st.schedule)) return null;
    if (!(st.league >= 0 && st.league < st.leagues.length) || !(st.eventIdx >= 0 && st.eventIdx <= st.schedule.length)) return null;
    if (st.rivals.length > 60 || st.schedule.length > 20) return null;
    for (const rv of st.rivals) if (typeof rv.id !== 'string' || typeof rv.name !== 'string' || !(rv.rel >= 0 && rv.rel <= 1)) return null;
    st.points = st.points && typeof st.points === 'object' ? st.points : {};
    st.results = Array.isArray(st.results) ? st.results : [];
    st.history = Array.isArray(st.history) ? st.history : [];
    st.stats = { events: 0, wins: 0, podiums: 0, longest: 0, seasons: 0, titles: 0, promotions: 0, best: {}, ...(st.stats || {}) };
    return st;
  } catch { return null; }
}

/** Koda kariere za izvoz/uvoz (base64 JSON z oznako). */
export const CODE_PREFIX = 'KARIERA1:';
export function exportCareer(st) {
  const json = JSON.stringify(st);
  const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
  return CODE_PREFIX + b64;
}
export function importCareer(code) {
  const s = String(code || '').trim();
  if (!s.startsWith(CODE_PREFIX) || s.length > 200000) return null;
  try {
    const b = s.slice(CODE_PREFIX.length);
    const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b))) : Buffer.from(b, 'base64').toString('utf8');
    return restoreCareer(json);
  } catch { return null; }
}
