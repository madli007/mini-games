/* =====================================================================
   SPORT — season.js: sezona pokala (brez DOM-a, brez pojmov posameznega
   športa). Koledar se IZRAČUNA iz meseca in seeda, zato ga ni treba nikjer
   ustvarjati in je enak v obeh adapterjih in v SQL orodju.

     import * as SE from '../../shared/sport/season.js';
     const cal = SE.calendar('2026-12', { venues, finals, tour, conditions });
     SE.eventState(cal.events[0], Date.now())   // 'soon' | 'open' | 'r2' | 'done'
     SE.eventStandings(rows, ev)                // mesta in točke pokala ene postaje
     SE.seasonStandings(rows, cal)              // skupna razvrstitev (vsota točk pokala)

   Sezona = koledarski mesec (Europe/Ljubljana). Postaj je ceil(dni / 3) (10 ali 11), vsaka je odprta 2–3 dni
   od polnoči prvega dne do polnoči po zadnjem dnevu; 2. serija se odpre zadnji dan postaje.
   Zadnja postaja je vedno finale na enem od `finals` (praviloma prvem). Turneja (`tour`) so štiri zaporedne
   postaje pred finalom v mesecih `tour.months` (privzeto december).

   Zapis (vrstica) za razvrstitve: { user_id, event, round, points, dist?, ... } — `points` so točke tekmovanja
   (pri skokih točke skoka); `cupPoints` so točke pokala po mestu (100-80-60 …).
   ===================================================================== */

import { rng, shuffled, hashStr } from './competition.js';

/** Točke pokala po mestu (1. … 30.). */
export const CUP_POINTS = [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
/** V 2. serijo gre najboljših 30 po 1. seriji (pri manj tekmovalcih vsi). */
export const CUT = 30;
/** Prva sezona pokala (pred njo: »Sezona se začne 1. decembra«). */
export const FIRST_SEASON = '2026-12';

export const MONTHS_GEN = ['januarja', 'februarja', 'marca', 'aprila', 'maja', 'junija', 'julija', 'avgusta', 'septembra', 'oktobra', 'novembra', 'decembra'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ------------------------------------------------------------ čas po Ljubljani (CET/CEST, pravilo EU) */

/** Zadnja nedelja v mesecu (dan v mesecu). m: 0–11 */
function lastSunday(y, m) {
  const last = new Date(Date.UTC(y, m + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

/** Ali je ob polnoči lokalnega dne (y, m 0–11, d) v veljavi poletni čas? Prehod je ob 2:00/3:00, polnoč je pred njim. */
export function isSummerDay(y, m, d) {
  if (m < 2 || m > 9) return false;
  if (m > 2 && m < 9) return true;
  if (m === 2) return d > lastSunday(y, 2);
  return d <= lastSunday(y, 9);
}

/** UTC ms trenutka »lokalna polnoč« dne (y, m 0–11, d) po Ljubljani. d sme preseči mesec (Date.UTC ga normalizira). */
export function ljMidnight(y, m, d) {
  const n = new Date(Date.UTC(y, m, d));
  const off = isSummerDay(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()) ? 2 : 1;
  return n.getTime() - off * 3600e3;
}

/** Lokalni datum po Ljubljani za UTC ms: { y, m (0–11), d, h }. */
export function ljParts(ms) {
  // poskusi z zimskim časom; če je tisti dan poletni čas in je ura po prehodu, dodaj uro
  let t = new Date(ms + 3600e3);
  let y = t.getUTCFullYear(), m = t.getUTCMonth(), d = t.getUTCDate();
  const summerStart = m === 2 && d === lastSunday(y, 2), summerEnd = m === 9 && d === lastSunday(y, 9);
  let summer = isSummerDay(y, m, d);
  if (summerStart) summer = t.getUTCHours() >= 2;              // 2:00 CET → 3:00 CEST (01:00 UTC)
  if (summerEnd) summer = ms < Date.UTC(y, 9, d, 1);           // 3:00 CEST → 2:00 CET (01:00 UTC)
  if (summer) { t = new Date(ms + 7200e3); y = t.getUTCFullYear(); m = t.getUTCMonth(); d = t.getUTCDate(); }
  return { y, m, d, h: t.getUTCHours() };
}

/** Sezona (mesec po Ljubljani) za trenutek: 'YYYY-MM'. */
export function seasonOf(ms) {
  const p = ljParts(ms);
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}`;
}
export function parseSeason(id) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(id || ''));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return { y: +m[1], m: +m[2] - 1 };
}
/** Naslednja / prejšnja sezona. */
export function shiftSeason(id, k) {
  const p = parseSeason(id);
  const t = new Date(Date.UTC(p.y, p.m + k, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** »Pokal Decembra 2026« (ime pokala po meri igre: name). */
export function seasonName(id, name = 'Pokal') {
  const p = parseSeason(id);
  return p ? `${name} ${cap(MONTHS_GEN[p.m])} ${p.y}` : name;
}
/** Število dni v mesecu sezone. */
export const daysIn = id => { const p = parseSeason(id); return new Date(Date.UTC(p.y, p.m + 1, 0)).getUTCDate(); };

/* ------------------------------------------------------------ koledar */

/** Dolžine postaj (dni): ceil(dni / 3) postaj, vsaka 2–3 dni; krajše so enakomerno razporejene. */
export function eventLengths(days) {
  const n = Math.ceil(days / 3);
  const short = n * 3 - days;               // toliko postaj ima 2 dni
  const out = Array(n).fill(3);
  for (let i = 0; i < short; i++) out[Math.floor((i + 0.5) * n / short)] = 2;
  return out;
}

/**
 * Koledar sezone (deterministično iz meseca in seeda).
 * @param {string} season 'YYYY-MM'
 * @param {{venues:string[], finals:string[], extra?:string[], tour?:{venues:string[], months?:number[]}|null,
 *          conditions?:{id:string, weight?:number}[], seed?:string, windMax?:number}} o
 *   venues: navadne postaje (premešane, brez ponavljanja, dokler gre) · finals: finale (praviloma prvi) ·
 *   extra: posebne postaje (ena na sredini sezone, npr. letalnica) · tour: štiri zaporedne postaje pred finalom ·
 *   conditions: pogoji (weight = verjetnost; id 'none' = brez) · windMax: največje povprečje vetra
 * @returns {{season, name, events:{season, idx, id, venue, start:string, days:number, opens:number, r2:number, closes:number,
 *            wind:{mean:number, seed:number}, cond:string, tour:boolean, final:boolean, extra:boolean}[]}}
 */
export function calendar(season, o) {
  const p = parseSeason(season);
  if (!p) throw new Error('neveljavna sezona ' + season);
  const days = daysIn(season);
  const lens = eventLengths(days);
  const n = lens.length;
  const r = rng(`${o.seed || 'pokal'}:${season}`);
  const tour = o.tour && (o.tour.months || [11]).includes(p.m) && o.tour.venues?.length === 4 ? o.tour.venues : null;
  // venues po vrsti: zadnja = finale, pred njo turneja, ena posebna na sredini
  const slots = Array(n).fill(null);
  const finals = o.finals || [];
  slots[n - 1] = { venue: finals.length ? (r() < 0.75 ? finals[0] : finals[1 + Math.floor(r() * Math.max(1, finals.length - 1))] || finals[0]) : null, final: true };
  if (tour) tour.forEach((v, i) => { slots[n - 5 + i] = { venue: v, tour: true }; });
  const extra = (o.extra || []).filter(v => v !== slots[n - 1].venue);
  if (extra.length) {
    const free = slots.map((s, i) => (s ? -1 : i)).filter(i => i >= 2 && i < n - 1);
    const mid = free[Math.floor(free.length / 2 + (r() - 0.5) * Math.min(3, free.length - 1))] ?? free[0];
    if (mid != null && mid >= 0) slots[mid] = { venue: extra[Math.floor(r() * extra.length)], extra: true };
  }
  let pool = [];
  for (let i = 0; i < n; i++) {
    if (slots[i]) continue;
    if (!pool.length) pool = shuffled((o.venues || []).filter(v => !tour?.includes(v) || !tour), `${o.seed || 'pokal'}:${season}:${i}`);
    // brez iste postaje dvakrat zapored
    let k = pool.findIndex(v => v !== slots[i - 1]?.venue);
    if (k < 0) k = 0;
    slots[i] = { venue: pool.splice(k, 1)[0] ?? null };
  }
  const conds = o.conditions || [];
  const wmax = o.windMax ?? 1.5;
  let day = 1;
  const events = slots.map((s, i) => {
    const len = lens[i];
    const opens = ljMidnight(p.y, p.m, day), closes = ljMidnight(p.y, p.m, day + len), r2 = ljMidnight(p.y, p.m, day + len - 1);
    const start = `${season}-${String(day).padStart(2, '0')}`;
    day += len;
    const mean = Math.round((r() * 2 - 1) * wmax * 10) / 10;
    const seed = Math.floor(r() * 4294967295) >>> 0;
    let cond = 'none';
    if (conds.length) {
      const tot = conds.reduce((a, c) => a + (c.weight ?? 1), 0);
      let x = r() * tot;
      for (const c of conds) { x -= c.weight ?? 1; if (x < 0) { cond = c.id; break; } }
    }
    return { season, idx: i + 1, id: 'e' + String(i + 1).padStart(2, '0'), venue: s.venue, start, days: len, opens, r2, closes,
      wind: { mean, seed }, cond, tour: !!s.tour, final: !!s.final, extra: !!s.extra };
  });
  return { season, name: seasonName(season), events };
}

/** Stanje postaje ob trenutku: 'soon' (prihaja) · 'open' (1. serija) · 'r2' (zadnji dan: 1. in 2. serija) · 'done'. */
export function eventState(ev, now) {
  if (now < ev.opens) return 'soon';
  if (now >= ev.closes) return 'done';
  return now >= ev.r2 ? 'r2' : 'open';
}
/** Ali je serija postaje odprta ob trenutku (1. serija ves čas postaje, 2. le zadnji dan). */
export function roundOpen(ev, round, now) {
  if (now < ev.opens || now >= ev.closes) return false;
  return round === 1 || (round === 2 && now >= ev.r2);
}
/** Trenutna (odprta) ali naslednja postaja sezone; null, ko je sezona končana. */
export function currentEvent(cal, now) {
  return cal.events.find(e => now < e.closes) || null;
}

/* ------------------------------------------------------------ razvrstitve */

const r1 = v => Math.round(v * 10) / 10;
/** Točke pokala za mesto (1-based) ali 0. */
export const cupPointsFor = rank => (rank >= 1 && rank <= CUP_POINTS.length ? CUP_POINTS[rank - 1] : 0);

/**
 * Deljena mesta: urejen seznam → rank (izenačeni imajo isto mesto, naslednji preskoči).
 * @param {Object[]} list urejen
 * @param {(a,b)=>boolean} same
 */
function ranked(list, same) {
  let rank = 0;
  list.forEach((x, i) => { if (i === 0 || !same(list[i - 1], x)) rank = i + 1; x.rank = rank; });
  return list;
}

/**
 * Rez 1. serije: ali je tekmovalec (po svojih točkah 1. serije) med najboljših `cut`?
 * Izenačeni na meji gredo vsi naprej. Pri manj kot `cut` tekmovalcih vsi.
 * @param {number[]} r1Points točke 1. serije vseh
 */
export function makesCut(myR1, r1Points, cut = CUT) {
  return r1Points.filter(p => p > myR1).length < cut;
}

/**
 * Razvrstitev ene postaje iz zapisov (vrstice z event === ev.idx).
 * Mesto po vsoti točk obeh serij (izenačeni deljeno mesto), točke pokala po mestu.
 * Kdor ni skočil 1. serije, ni v razvrstitvi (DNS). 2. serija šteje le, če je bil skakalec v rezu ob oddaji.
 * @returns {{user_id, rank, total, r1:number|null, r2:number|null, dist:number, cupPoints:number, row:Object}[]}
 */
export function eventStandings(rows, evIdx, { cut = CUT } = {}) {
  const by = new Map();
  for (const x of rows) {
    if (x.event !== evIdx) continue;
    const e = by.get(x.user_id) || { user_id: x.user_id, r1: null, r2: null, dist: 0, row: x };
    if (x.round === 1) e.r1 = +x.points;
    else if (x.round === 2) e.r2 = +x.points;
    e.dist = Math.max(e.dist, +x.dist || 0);
    by.set(x.user_id, e);
  }
  const list = [...by.values()].filter(e => e.r1 != null);
  const all1 = list.map(e => e.r1);
  for (const e of list) { e.inCut = makesCut(e.r1, all1, cut); if (!e.inCut) e.r2 = null; e.total = r1(e.r1 + (e.r2 || 0)); }
  list.sort((a, b) => b.total - a.total || (b.r2 != null) - (a.r2 != null) || String(a.user_id).localeCompare(String(b.user_id)));
  ranked(list, (a, b) => a.total === b.total);
  for (const e of list) e.cupPoints = cupPointsFor(e.rank);
  return list;
}

/**
 * Skupna razvrstitev sezone: vsota točk pokala; ob izenačenju več zmag, nato več drugih mest, nato več tretjih …
 * @param {Object[]} rows zapisi sezone
 * @param {{events:{idx:number}[]}} cal
 * @returns {{user_id, rank, cup:number, wins:number, places:number[], events:number, byEvent:Object}[]}
 */
export function seasonStandings(rows, cal, { cut = CUT, upto = Infinity } = {}) {
  const tot = new Map();
  for (const ev of cal.events) {
    if (ev.idx > upto) continue;
    for (const e of eventStandings(rows, ev.idx, { cut })) {
      const t = tot.get(e.user_id) || { user_id: e.user_id, cup: 0, places: Array(CUP_POINTS.length).fill(0), events: 0, byEvent: {}, row: e.row };
      t.cup += e.cupPoints; t.events++;
      if (e.rank <= CUP_POINTS.length) t.places[e.rank - 1]++;
      t.byEvent[ev.idx] = { rank: e.rank, cupPoints: e.cupPoints, total: e.total };
      tot.set(e.user_id, t);
    }
  }
  const list = [...tot.values()];
  const cmpPlaces = (a, b) => { for (let i = 0; i < a.places.length; i++) if (a.places[i] !== b.places[i]) return b.places[i] - a.places[i]; return 0; };
  list.sort((a, b) => b.cup - a.cup || cmpPlaces(a, b) || String(a.user_id).localeCompare(String(b.user_id)));
  ranked(list, (a, b) => a.cup === b.cup && cmpPlaces(a, b) === 0);
  for (const t of list) t.wins = t.places[0];
  return list;
}

/** Vodilni v sezoni (rumena majica): user_id ali null (izenačeno prvo mesto = oba). */
export function leaders(rows, cal, opt) {
  const st = seasonStandings(rows, cal, opt);
  return st.filter(t => t.rank === 1 && t.cup > 0).map(t => t.user_id);
}

/** Spremembe mest v skupni razvrstitvi pred zadnjo postajo z rezultati in po njej: { user_id: +2 | −1 }. */
export function seasonMoves(rows, cal, opt) {
  const with_ = cal.events.filter(e => rows.some(x => x.event === e.idx)).map(e => e.idx);
  if (with_.length < 2) return {};
  const last = with_.at(-1);
  const before = new Map(seasonStandings(rows, cal, { ...opt, upto: last - 1 }).map(t => [t.user_id, t.rank]));
  const out = {};
  for (const t of seasonStandings(rows, cal, opt)) if (before.has(t.user_id)) out[t.user_id] = before.get(t.user_id) - t.rank;
  return out;
}

/**
 * Skupna razvrstitev turneje: vsota TOČK TEKMOVANJA (ne točk pokala) vseh postaj turneje. Kdor zamudi postajo,
 * izpade iz skupne razvrstitve (missed > 0).
 */
export function tourStandings(rows, cal, { cut = CUT } = {}) {
  const evs = cal.events.filter(e => e.tour).map(e => e.idx);
  if (!evs.length) return [];
  const m = new Map();
  for (const idx of evs) {
    for (const e of eventStandings(rows, idx, { cut })) {
      const t = m.get(e.user_id) || { user_id: e.user_id, total: 0, n: 0, row: e.row };
      t.total = r1(t.total + e.total); t.n++;
      m.set(e.user_id, t);
    }
  }
  const list = [...m.values()].map(t => ({ ...t, missed: evs.length - t.n }));
  list.sort((a, b) => a.missed - b.missed || b.total - a.total);
  const ok = list.filter(t => t.missed === 0);
  ranked(ok, (a, b) => a.total === b.total);
  for (const t of list) if (t.missed) t.rank = null;
  return list;
}

/**
 * Posebni naslovi sezone (vtičniki): { key, title, icon, user_id, text }.
 * flying(ev) → ali je postaja »letalnica« (ali drug poseben tip postaje igre).
 */
export function seasonTitles(rows, cal, { flying = () => false, cut = CUT } = {}) {
  const out = [];
  const st = seasonStandings(rows, cal, { cut });
  // kralj posebnih postaj: največ točk pokala na postajah, kjer je flying(ev)
  const fl = cal.events.filter(flying);
  if (fl.length) {
    const sum = new Map();
    for (const ev of fl) for (const e of eventStandings(rows, ev.idx, { cut })) sum.set(e.user_id, (sum.get(e.user_id) || 0) + e.cupPoints);
    const best = [...sum.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) out.push({ key: 'kralj', user_id: best[0], value: best[1] });
  }
  // najbolj stanoviten: nastop na vsaj polovici postaj z rezultati, najboljše povprečno mesto
  const held = cal.events.filter(e => rows.some(x => x.event === e.idx)).length;
  const cand = st.filter(t => held && t.events >= Math.max(2, Math.ceil(held / 2)))
    .map(t => ({ t, avg: Object.values(t.byEvent).reduce((a, b) => a + b.rank, 0) / t.events }))
    .sort((a, b) => a.avg - b.avg || b.t.events - a.t.events);
  if (cand.length) out.push({ key: 'stanoviten', user_id: cand[0].t.user_id, value: Math.round(cand[0].avg * 10) / 10 });
  return out;
}

/** Ali je sezona končana (vse postaje zaprte)? */
export const seasonDone = (cal, now) => now >= cal.events.at(-1).closes;

/** Deterministično število iz niza (za seede postaj). */
export const seedOf = s => hashStr(String(s));
