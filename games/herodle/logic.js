/* =====================================================================
   HERODLE — čista logika (brez DOM-a), testirana v tests/herodle.js.

   Primerjava atributov je napisana DVAKRAT: tu in v supabase/games/herodle.sql
   (private.herodle_cmp). Da se ne razideta, tools/herodle-sql.mjs iz te datoteke
   generira tests/fixtures/herodle-compare.json, ki ga preverita test v Node in
   razvojni RPC herodle_compare.
   ===================================================================== */

import { rng as makeRng } from '../../shared/util.js';

/** Dan uganke #1 (datum, ko je bila narejena 1. faza). */
export const EPOCH = '2026-11-22';

/* ------------------------------------------------------------------ */
/*  Dovoljene vrednosti atributov                                      */
/* ------------------------------------------------------------------ */

export const UNIVERSES = ['Marvel', 'DC'];
export const TEAMS = [
  'Avengers', 'Justice League', 'X-Men', 'Teen Titans', 'Guardians', 'Suicide Squad', 'Fantastic Four',
  'Defenders', 'Sinister Six', 'Bratovščina', 'Black Order', 'Hydra', 'Thunderbolts', 'Inhumans', 'Eternals',
  'X-Force', 'Justice Society', 'Green Lantern Corps', 'Rogues', 'Legion of Doom', 'Batova družina',
];
export const SPECIES = ['Človek', 'Bog', 'Polbog', 'Vesoljec', 'Atlantid', 'Eternal', 'Android', 'Mutant', 'Simbiot', 'Inhuman', 'Demon', 'Drugo'];
export const ORIGINS = ['Tehnologija', 'Božanski', 'Nesreča', 'Magija', 'Rojen', 'Zelišče', 'Trening', 'Serum', 'Kozmično', 'Brez'];
export const GENDERS = ['M', 'Ž', 'Drugo'];
export const ALIGNMENTS = ['Junak', 'Zlobec', 'Antijunak'];

/** Kratka imena ekip za ozke celice (telefon). */
export const TEAM_SHORT = {
  'Avengers': 'Aveng.', 'Justice League': 'JL', 'X-Men': 'X-Men', 'Teen Titans': 'Titans', 'Guardians': 'Guard.',
  'Suicide Squad': 'Suicide', 'Fantastic Four': 'FF', 'Defenders': 'Defend.', 'Sinister Six': 'Sin. 6', 'Bratovščina': 'Brat.',
  'Black Order': 'B. Order', 'Hydra': 'Hydra', 'Thunderbolts': 'T-bolts', 'Inhumans': 'Inhum.', 'Eternals': 'Etern.',
  'X-Force': 'X-Force', 'Justice Society': 'JSA', 'Green Lantern Corps': 'GLC', 'Rogues': 'Rogues',
  'Legion of Doom': 'LoD', 'Batova družina': 'Bat-dr.',
};
/** Kratice vrednosti za ozke celice (telefon). */
export const VALUE_SHORT = {
  'Vesoljec': 'Vesolj.', 'Atlantid': 'Atlant.', 'Inhuman': 'Inhum.',
  'Tehnologija': 'Tehnol.', 'Božanski': 'Božan.', 'Kozmično': 'Kozm.', 'Antijunak': 'Antij.',
};
const sv = v => VALUE_SHORT[v] || v;

/** Stolpci Klasike (vrstni red v tabeli). */
export const ATTRS = [
  { key: 'universe', label: 'Univerzum', icon: '🌌' },
  { key: 'team', label: 'Ekipa', icon: '👥' },
  { key: 'species', label: 'Vrsta', icon: '🧬' },
  { key: 'origin', label: 'Izvor moči', icon: '⚡' },
  { key: 'gender', label: 'Spol', icon: '⚧' },
  { key: 'year', label: 'Prvi strip', icon: '📅' },
  { key: 'side', label: 'Stran', icon: '⚖️' },
];

/** Načini (bazeni) Klasike. 2. faza doda emoji, kostum, dosje. */
export const POOLS = [
  { id: 'klasika', label: 'Mešano', short: 'Mešano' },
  { id: 'klasika-mcu', label: 'Samo MCU', short: 'MCU' },
  { id: 'klasika-dc', label: 'Samo DC', short: 'DC' },
];
export const POOL_IDS = POOLS.map(p => p.id);
export const poolLabel = mode => POOLS.find(p => p.id === mode)?.label || mode;

/** Obvezna polja lika. */
export const REQUIRED = ['id', 'name', 'aliases', 'alterEgo', 'universe', 'teams', 'species', 'origins', 'gender', 'firstComic',
  'alignment', 'inMcu', 'actors', 'firstFilm', 'home', 'nemesis', 'color', 'unsure'];

/**
 * Napake v podatkih lika (prazno = v redu).
 * @param {any} h
 * @returns {string[]}
 */
export function validateHero(h) {
  const err = [];
  for (const k of REQUIRED) if (!(k in h)) err.push(`manjka ${k}`);
  if (!/^[a-z0-9-]{2,40}$/.test(h.id || '')) err.push('neveljaven id');
  if (typeof h.name !== 'string' || h.name.length < 2) err.push('ime');
  if (!Array.isArray(h.aliases)) err.push('aliases');
  if (h.alterEgo !== null && typeof h.alterEgo !== 'string') err.push('alterEgo');
  if (!UNIVERSES.includes(h.universe)) err.push('universe ' + h.universe);
  if (!Array.isArray(h.teams) || h.teams.some(t => !TEAMS.includes(t)) || new Set(h.teams).size !== h.teams.length) err.push('teams ' + h.teams);
  if (!SPECIES.includes(h.species)) err.push('species ' + h.species);
  if (!Array.isArray(h.origins) || !h.origins.length || h.origins.some(o => !ORIGINS.includes(o))
    || (h.origins.includes('Brez') && h.origins.length > 1) || new Set(h.origins).size !== h.origins.length) err.push('origins ' + h.origins);
  if (!GENDERS.includes(h.gender)) err.push('gender ' + h.gender);
  if (!Number.isInteger(h.firstComic) || h.firstComic < 1930 || h.firstComic > 2026) err.push('firstComic');
  if (!ALIGNMENTS.includes(h.alignment)) err.push('alignment ' + h.alignment);
  if (typeof h.inMcu !== 'boolean') err.push('inMcu');
  if (h.inMcu && h.universe !== 'Marvel') err.push('inMcu samo za Marvel');
  if (!Array.isArray(h.actors) || h.actors.some(a => typeof a !== 'string' || !a)) err.push('actors');
  if (h.firstFilm !== null && (!Number.isInteger(h.firstFilm) || h.firstFilm < 1940 || h.firstFilm > 2030)) err.push('firstFilm');
  if (h.actors?.length && h.firstFilm == null) err.push('actors brez firstFilm');
  if (typeof h.home !== 'string' || !h.home) err.push('home');
  if (h.nemesis !== null && typeof h.nemesis !== 'string') err.push('nemesis');
  if (!/^#[0-9a-f]{6}$/i.test(h.color || '')) err.push('color');
  if (!Array.isArray(h.unsure) || h.unsure.some(u => !REQUIRED.includes(u))) err.push('unsure');
  return err;
}

/** Ključ sedmih atributov (dva lika z enakim ključem v Klasiki nista ločljiva). */
export function attrKey(h) {
  return [h.universe, h.teams[0] || '', h.species, [...h.origins].sort().join('+'), h.gender, h.firstComic, h.alignment].join('|');
}

/** Liki v bazenu načina. */
export function poolHeroes(mode, heroes) {
  if (mode === 'klasika-mcu') return heroes.filter(h => h.inMcu);
  if (mode === 'klasika-dc') return heroes.filter(h => h.universe === 'DC');
  return heroes.slice();
}
export function inPool(mode, hero) {
  return !!hero && (mode === 'klasika-mcu' ? hero.inMcu : mode === 'klasika-dc' ? hero.universe === 'DC' : true);
}

/* ------------------------------------------------------------------ */
/*  Primerjava                                                         */
/* ------------------------------------------------------------------ */

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const overlaps = (a, b) => a.some(x => b.includes(x));

/**
 * Primerjaj ugibani lik s skritim. 'g' zeleno, 'y' rumeno, 'r' rdeče.
 * dir: 'up' = skriti je kasnejši, 'down' = zgodnejši, null = isto leto.
 * ISTA pravila kot private.herodle_cmp v SQL.
 */
export function compare(guess, target) {
  const eq = (a, b) => (a === b ? 'g' : 'r');
  const ga = guess.teams[0] || '', ta = target.teams[0] || '';
  const team = ga === ta ? 'g' : overlaps(guess.teams, target.teams) ? 'y' : 'r';
  const origin = sameSet(guess.origins, target.origins) ? 'g' : overlaps(guess.origins, target.origins) ? 'y' : 'r';
  const d = target.firstComic - guess.firstComic;
  return {
    universe: eq(guess.universe, target.universe),
    team,
    species: eq(guess.species, target.species),
    origin,
    gender: eq(guess.gender, target.gender),
    year: d === 0 ? 'g' : Math.abs(d) <= 10 ? 'y' : 'r',
    dir: d > 0 ? 'up' : d < 0 ? 'down' : null,
    side: eq(guess.alignment, target.alignment),
  };
}

/** Število zelenih celic v rezultatu. */
export const greens = r => ATTRS.filter(a => r[a.key] === 'g').length;
/** Ali je rezultat popoln (vse zeleno). */
export const allGreen = r => greens(r) === ATTRS.length;

/** Prikazna vrednost atributa lika. short = za ozke celice. */
export function attrValue(h, key, short = false) {
  switch (key) {
    case 'universe': return h.universe;
    case 'team': {
      const t = h.teams[0];
      if (!t) return 'Brez';
      return (short ? TEAM_SHORT[t] || t : t) + (h.teams.length > 1 ? ` +${h.teams.length - 1}` : '');
    }
    case 'species': return short ? sv(h.species) : h.species;
    case 'origin': return short ? sv(h.origins[0]) + (h.origins.length > 1 ? ` +${h.origins.length - 1}` : '') : h.origins.join(' + ');
    case 'gender': return short ? h.gender : ({ M: 'Moški', Ž: 'Ženska', Drugo: 'Drugo' })[h.gender];
    case 'year': return String(h.firstComic);
    case 'side': return short ? sv(h.alignment) : h.alignment;
    default: return '';
  }
}

/**
 * Težki način: vsak poskus mora biti skladen z VSEMI zelenimi namigi doslej.
 * Preverja se samo iz prejšnjih poskusov (lik + rezultat), zato deluje v obeh adapterjih.
 * @param {{hero:any, result:any}[]} history
 * @param {any} cand
 * @returns {string|null} razlog zavrnitve ali null
 */
export function hardModeViolation(history, cand) {
  for (const { hero, result } of history) {
    if (!hero || !result) continue;
    if (result.universe === 'g' && cand.universe !== hero.universe) return `Univerzum mora biti ${hero.universe}.`;
    if (result.team === 'g' && (cand.teams[0] || '') !== (hero.teams[0] || '')) return `Glavna ekipa mora biti ${hero.teams[0] || 'Brez'}.`;
    if (result.species === 'g' && cand.species !== hero.species) return `Vrsta mora biti ${hero.species}.`;
    if (result.origin === 'g' && !sameSet(cand.origins, hero.origins)) return `Izvor moči mora biti ${hero.origins.join(' + ')}.`;
    if (result.gender === 'g' && cand.gender !== hero.gender) return `Spol mora biti ${attrValue(hero, 'gender')}.`;
    if (result.year === 'g' && cand.firstComic !== hero.firstComic) return `Prvi strip mora biti iz leta ${hero.firstComic}.`;
    if (result.side === 'g' && cand.alignment !== hero.alignment) return `Stran mora biti ${hero.alignment}.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Datumi in številka uganke                                          */
/* ------------------------------------------------------------------ */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dayNum = date => { const [y, m, d] = date.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
export function addDays(date, n) {
  const t = new Date((dayNum(date) + n) * 864e5);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
export const daysBetween = (a, b) => dayNum(b) - dayNum(a);
export function isValidDate(s) { return DATE_RE.test(s || '') && addDays(s, 0) === s; }
/** Številka uganke: EPOCH = #1. */
export const puzzleNumber = date => daysBetween(EPOCH, date) + 1;

/* ------------------------------------------------------------------ */
/*  Offline razpored (brez ponovitev v ciklu)                          */
/* ------------------------------------------------------------------ */

export const OFFLINE_ORIGIN = '2024-01-01';   // fiksen začetek ciklov (neodvisen od EPOCH)
const ORIGIN = OFFLINE_ORIGIN;
const memo = new Map();

function basePerm(mode, ids, cycle) {
  const key = `p|${mode}|${ids.length}|${cycle}`;
  if (memo.has(key)) return memo.get(key);
  const seed = addDays(ORIGIN, cycle * ids.length) + ':herodle:' + mode;
  const perm = makeRng(seed).shuffle(ids.slice());
  if (cycle > 0 && perm.length > 1) {
    const prev = basePerm(mode, ids, cycle - 1);
    if (perm[0] === prev[prev.length - 1]) [perm[0], perm[1]] = [perm[1], perm[0]];
  }
  memo.set(key, perm);
  return perm;
}

function simplePick(mode, ids, idx) {
  const n = ids.length;
  const cycle = Math.floor(idx / n);
  return basePerm(mode, ids, cycle)[idx - cycle * n];
}

/** Zaporedje mešanega bazena za cel cikel: brez ponovitev in (če gre) brez lika, ki je isti dan v MCU/DC. */
function mixedCycle(ids, mcuIds, dcIds, cycle) {
  const key = `m|${ids.length}|${mcuIds.length}|${dcIds.length}|${cycle}`;
  if (memo.has(key)) return memo.get(key);
  const n = ids.length;
  const rest = basePerm('klasika', ids, cycle).slice();
  const prevLast = cycle > 0 ? mixedCycle(ids, mcuIds, dcIds, cycle - 1)[n - 1] : null;
  const out = [];
  for (let pos = 0; pos < n; pos++) {
    const idx = cycle * n + pos;
    const taboo = new Set([simplePick('klasika-mcu', mcuIds, idx), simplePick('klasika-dc', dcIds, idx)]);
    if (pos === 0 && prevLast) taboo.add(prevLast);
    let i = rest.findIndex(id => !taboo.has(id));
    if (i < 0) i = 0;
    out.push(rest.splice(i, 1)[0]);
  }
  memo.set(key, out);
  return out;
}

/**
 * Lik dneva v offline načinu (namenoma drugačen razpored kot online, ki ima skrivno sol).
 * @returns {string} id lika
 */
export function offlineHeroId(mode, date, heroes) {
  const ids = poolHeroes(mode, heroes).map(h => h.id).sort();
  const idx = daysBetween(ORIGIN, date);
  if (idx < 0) throw new Error('date_too_early');
  if (mode !== 'klasika') return simplePick(mode, ids, idx);
  const mcu = poolHeroes('klasika-mcu', heroes).map(h => h.id).sort();
  const dc = poolHeroes('klasika-dc', heroes).map(h => h.id).sort();
  const cycle = Math.floor(idx / ids.length);
  return mixedCycle(ids, mcu, dc, cycle)[idx - cycle * ids.length];
}

/* ------------------------------------------------------------------ */
/*  Iskanje (brez šumnikov, velikih črk in ločil)                      */
/* ------------------------------------------------------------------ */

export function normalize(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/đ/g, 'd').replace(/ø/g, 'o').replace(/[^a-z0-9]/g, '');
}
const words = s => String(s || '').split(/[\s\-.'’]+/).map(normalize).filter(Boolean);

/**
 * Predlogi za iskalno polje.
 * @param {any[]} heroes liki bazena
 * @param {string} query
 * @param {{limit?:number}} [opt]
 * @returns {{hero:any, via:string|null}[]} via = alias/alter ego, prek katerega je bil najden
 */
export function search(heroes, query, { limit = 8 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const out = [];
  for (const h of heroes) {
    const keys = [[h.name, 0], ...h.aliases.map(a => [a, 1]), ...(h.alterEgo ? [[h.alterEgo, 1]] : [])];
    let best = null;
    for (const [k, w] of keys) {
      const n = normalize(k);
      let s = null;
      if (n === q) s = w;
      else if (n.startsWith(q)) s = 2 + w;
      else if (words(k).some(x => x.startsWith(q))) s = 4 + w;
      else if (q.length >= 3 && n.includes(q)) s = 6 + w;
      if (s != null && (!best || s < best.s)) best = { s, via: w ? k : null, len: n.length };
    }
    if (best) out.push({ hero: h, via: best.via, s: best.s, len: best.len });
  }
  out.sort((a, b) => a.s - b.s || a.len - b.len || a.hero.name.localeCompare(b.hero.name, 'sl'));
  return out.slice(0, limit).map(({ hero, via }) => ({ hero, via }));
}

/* ------------------------------------------------------------------ */
/*  Bonus krogi                                                        */
/* ------------------------------------------------------------------ */

export const BONUS_TYPES = ['actor', 'alterEgo', 'home', 'firstFilm', 'nemesis', 'ranking'];
const known = (h, f) => !h.unsure.includes(f);

function nemesisName(h, byId) {
  if (!h.nemesis) return null;
  return byId.get(h.nemesis)?.name || h.nemesis;
}

/** Katera bonus vprašanja so za lik mogoča (dovolj podatkov, nič v unsure). */
export function bonusTypesFor(h, heroes) {
  const t = [];
  if (h.actors.length && known(h, 'actors')) t.push('actor');
  if (h.alterEgo && known(h, 'alterEgo') && !normalize(h.alterEgo).includes(normalize(h.name)) && !normalize(h.name).includes(normalize(h.alterEgo))) t.push('alterEgo');
  if (h.home && known(h, 'home')) t.push('home');
  if (h.firstFilm != null && known(h, 'firstFilm')) t.push('firstFilm');
  if (h.nemesis && known(h, 'nemesis')) t.push('nemesis');
  if (known(h, 'firstComic') && rankingCandidates(h, heroes).length >= 3) t.push('ranking');
  return t;
}

function rankingCandidates(h, heroes) {
  return heroes.filter(x => x.id !== h.id && x.universe === h.universe && known(x, 'firstComic') && x.firstComic !== h.firstComic);
}

/** Napačne možnosti: najprej iz istega univerzuma, različne od pravilnih. */
function distractors(rand, hero, heroes, getVals, correct, n = 3, sameGender = false) {
  const bad = new Set(correct.map(normalize));
  const collect = list => {
    const seen = new Set();
    const vals = [];
    for (const x of list) for (const v of getVals(x)) {
      const k = normalize(v);
      if (!v || bad.has(k) || seen.has(k)) continue;
      seen.add(k); vals.push(v);
    }
    return vals.sort((a, b) => (a < b ? -1 : 1));
  };
  const others = heroes.filter(x => x.id !== hero.id);
  // stopnje: isti univerzum + isti spol (igralci, imena) → isti univerzum → drugi univerzum
  const tiers = [
    ...(sameGender ? [others.filter(x => x.universe === hero.universe && x.gender === hero.gender)] : []),
    others.filter(x => x.universe === hero.universe),
    others.filter(x => x.universe !== hero.universe),
  ];
  const pool = [];
  for (const t of tiers) {
    if (pool.length >= n) break;
    const seen = new Set(pool.map(normalize));
    pool.push(...rand.shuffle(collect(t)).filter(v => !seen.has(normalize(v))));
  }
  return pool.slice(0, n);
}

/** Začetni položaj drsnika: vsaj 6 let stran od pravilnega leta (da ne izda odgovora). */
function sliderStart(rand, answer) {
  for (let i = 0; i < 20; i++) {
    const v = rand.int(1975, 2015);
    if (Math.abs(v - answer) >= 6) return v;
  }
  return answer > 1990 ? 1975 : 2015;
}

const PRON = g => (g === 'Ž' ? { acc: 'jo', dat: 'ji', pos: 'njena', posM: 'njen' } : { acc: 'ga', dat: 'mu', pos: 'njegova', posM: 'njegov' });

/**
 * Izberi 3 bonus vprašanja za lik (glede na seed).
 * @param {any} hero
 * @param {any[]} heroes vsi liki
 * @param {string} seed npr. '2026-11-22:herodle:bonus:klasika'
 */
export function pickBonus(hero, heroes, seed, count = 3) {
  const rand = makeRng(seed);
  const byId = new Map(heroes.map(h => [h.id, h]));
  const types = rand.shuffle(bonusTypesFor(hero, heroes)).slice(0, count);
  // vrstni red: drsnik in razvrščanje na konec (izbirna vprašanja so hitrejša)
  types.sort((a, b) => BONUS_TYPES.indexOf(a) - BONUS_TYPES.indexOf(b));
  const P = PRON(hero.gender);
  return types.map(type => {
    if (type === 'actor') {
      const right = rand.pick(hero.actors);
      const wrong = distractors(rand, hero, heroes.filter(x => known(x, 'actors')), x => x.actors, hero.actors, 3, true);
      return { type, kind: 'choice', icon: '🎬', text: `Kdo ${P.acc} je igral v filmu?`, options: rand.shuffle([right, ...wrong]), correct: hero.actors.slice() };
    }
    if (type === 'alterEgo') {
      const wrong = distractors(rand, hero, heroes.filter(x => known(x, 'alterEgo')), x => (x.alterEgo ? [x.alterEgo] : []), [hero.alterEgo], 3, true);
      return { type, kind: 'choice', icon: '🪪', text: `Kako ${P.dat} je civilno ime?`, options: rand.shuffle([hero.alterEgo, ...wrong]), correct: [hero.alterEgo] };
    }
    if (type === 'home') {
      const wrong = distractors(rand, hero, heroes.filter(x => known(x, 'home')), x => [x.home], [hero.home]);
      return { type, kind: 'choice', icon: '🏙️', text: 'Kje živi oziroma deluje?', options: rand.shuffle([hero.home, ...wrong]), correct: [hero.home] };
    }
    if (type === 'nemesis') {
      const right = nemesisName(hero, byId);
      const wrong = distractors(rand, hero, heroes.filter(x => x.id !== hero.nemesis), x => [x.name], [right, hero.name]);
      return { type, kind: 'choice', icon: '⚔️', text: `Kdo je ${P.posM} glavni nasprotnik?`, options: rand.shuffle([right, ...wrong]), correct: [right] };
    }
    if (type === 'firstFilm') {
      return { type, kind: 'slider', icon: '🎞️', text: 'V katerem letu je prvič nastopil v celovečercu?'.replace('nastopil', hero.gender === 'Ž' ? 'nastopila' : 'nastopil'),
        min: 1950, max: 2026, start: sliderStart(rand, hero.firstFilm), answer: hero.firstFilm, hint: '±2 leti = ⭐ · točno = ⭐⭐' };
    }
    // ranking
    const cands = rand.shuffle(rankingCandidates(hero, heroes));
    const picked = [hero];
    for (const c of cands) {
      if (picked.length === 4) break;
      if (!picked.some(p => p.firstComic === c.firstComic)) picked.push(c);
    }
    const answer = picked.slice().sort((a, b) => a.firstComic - b.firstComic).map(h => h.id);
    let items = rand.shuffle(picked.map(h => h.id));
    if (items.join() === answer.join()) items = [items[1], items[0], ...items.slice(2)];
    return { type, kind: 'order', icon: '📚', text: 'Razvrsti te 4 like po letu prvega stripa (najstarejši zgoraj).', items, answer };
  });
}

/**
 * Zvezdice za odgovor.
 * @param {any} q vprašanje iz pickBonus
 * @param {string|number|string[]} ans
 * @returns {number} 0, 1 ali 2
 */
export function scoreBonus(q, ans) {
  if (q.kind === 'choice') return q.correct.some(c => normalize(c) === normalize(ans)) ? 1 : 0;
  if (q.kind === 'slider') {
    const d = Math.abs(Math.round(+ans) - q.answer);
    return d === 0 ? 2 : d <= 2 ? 1 : 0;
  }
  if (q.kind === 'order') return Array.isArray(ans) && ans.join() === q.answer.join() ? 1 : 0;
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Deljenje                                                           */
/* ------------------------------------------------------------------ */

const SQ = { g: '🟩', y: '🟨', r: '🟥' };
/** Ena vrstica: 6 kvadratkov (brez letnice) + simbol letnice (🟩 točno, 🔼/🔽 blizu, ⬆️/⬇️ daleč). */
export function shareRow(r) {
  const cells = ['universe', 'team', 'species', 'origin', 'gender', 'side'].map(k => SQ[r[k]] || '⬛').join('');
  const yr = r.year === 'g' ? '🟩' : r.year === 'y' ? (r.dir === 'up' ? '🔼' : '🔽') : (r.dir === 'up' ? '⬆️' : '⬇️');
  return cells + yr;
}

/** »v N poskusih« (mestnik). */
export function vPoskusih(n) { return `v ${n} ${n % 100 === 1 ? 'poskusu' : 'poskusih'}`; }

export function pluralPoskus(n) {
  const m = n % 100;
  return m === 1 ? 'poskus' : m === 2 ? 'poskusa' : m === 3 || m === 4 ? 'poskusi' : 'poskusov';
}

/**
 * Besedilo za deljenje (BREZ imena lika).
 * @param {{date:string, mode:string, results:any[], solved:boolean, gaveUp?:boolean, hard?:boolean, stars?:number|null}} g
 *   results v kronološkem vrstnem redu (prvi poskus prvi)
 */
export function shareText({ date, mode, results, solved, gaveUp = false, hard = false, stars = null }) {
  const n = results.length;
  const head = `Herodle #${puzzleNumber(date)} · Klasika (${poolLabel(mode)}) · `
    + (gaveUp || !solved ? 'X/∞' : `${n} ${pluralPoskus(n)}${hard ? ' 💀' : ''}`);
  let rows = results.map(shareRow);
  if (rows.length > 8) rows = [...rows.slice(0, 3), '…', ...rows.slice(-4)];
  const lines = [head, ...rows];
  if (stars != null && solved) lines.push(stars > 0 ? `${'⭐'.repeat(stars)} bonus` : 'bonus: 0 ⭐');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/*  Komentator                                                         */
/* ------------------------------------------------------------------ */

export const COMMENTS = {
  first: ['Prvi poskus?! Si ti jasnoviden?', 'Na prvo žogo! Kdo ti je izdal?', 'Prvi poskus. Brez besed.'],
  solved: ['POW! Ujet!', 'Razkrinkan! Junak dneva si ti.', 'BAM! Točno ta.', 'Uganjeno – plašč ti pristoji.'],
  almost: ['Tako blizu, da že diši po zmagi.', 'Še en sam namig manjka …', 'Skoraj! Samo ena celica loči.'],
  warm: ['Toplo, toplo …', 'Vroče! Na pravi sledi si.', 'Krog se oži.'],
  yearExact: ['Letnica zadeta! Isti letnik stripov.', 'Prava stripovska letina!'],
  cold: ['Ta je pa iz druge galaksije.', 'Hladno kot v vesoljskem vakuumu.', 'Popolnoma mimo. Morda drug univerzum?'],
  wrongUni: ['Napačen univerzum, napačen stripovski regal.', 'Drug univerzum. Preklopi multiverzum!', 'Ta junak dela pri konkurenci.'],
  nearYear: ['Vsaj univerzum je pravi, pa še letnica je blizu.', 'Prava doba, pravi svet – zdaj pa še ostalo.'],
  rightUni: ['Vsaj univerzum je pravi.', 'Pravi svet, napačen junak.', 'Smer je prava, nadaljuj.'],
};

/** Kategorija komentarja za rezultat poskusa. */
export function commentKind(r, attempt, solved) {
  if (solved) return attempt === 1 ? 'first' : 'solved';
  const g = greens(r);
  if (g === ATTRS.length - 1) return 'almost';
  if (g >= 4) return 'warm';
  if (r.year === 'g') return 'yearExact';
  if (r.universe === 'r') return g === 0 ? 'cold' : 'wrongUni';
  if (r.year === 'y') return 'nearYear';
  return 'rightUni';
}

export function comment(r, attempt, solved, rand = Math.random) {
  const list = COMMENTS[commentKind(r, attempt, solved)];
  return list[Math.floor(rand() * list.length) % list.length];
}

/* ------------------------------------------------------------------ */
/*  Statistika in nizi                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {Record<string, {solved:boolean, attempts:number, gaveUp?:boolean}>} days zapisi po datumu
 * @param {string} today
 */
export function computeStats(days, today) {
  const dates = Object.keys(days).filter(d => d <= today).sort();
  const solvedDates = dates.filter(d => days[d].solved);
  const hist = Array(10).fill(0);     // 1 … 9, 10+
  for (const d of solvedDates) hist[Math.min(10, Math.max(1, days[d].attempts)) - 1]++;
  const total = solvedDates.reduce((s, d) => s + days[d].attempts, 0);
  const { current, best } = streaks(solvedDates, today);
  return {
    played: dates.length,
    solved: solvedDates.length,
    pct: dates.length ? Math.round(100 * solvedDates.length / dates.length) : 0,
    current, best, hist,
    avg: solvedDates.length ? Math.round(10 * total / solvedDates.length) / 10 : null,
    todayBucket: days[today]?.solved ? Math.min(10, days[today].attempts) : null,
  };
}

/** Trenutni (konča se danes ali včeraj) in najdaljši niz zaporednih rešenih dni. */
export function streaks(solvedDates, today) {
  const s = [...new Set(solvedDates)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of s) {
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  let current = 0;
  const set = new Set(s);
  let d = set.has(today) ? today : addDays(today, -1);
  while (set.has(d)) { current++; d = addDays(d, -1); }
  return { current, best };
}

/** XP: 15 za rešen bazen (+10 v največ 3 poskusih), +5 za vsako zvezdico. Predaja 0. */
export function xpFor({ solved, attempts, stars = 0 }) {
  if (!solved) return 0;
  return 15 + (attempts <= 3 ? 10 : 0) + 5 * stars;
}

/** Inicialke za žeton lika. */
export function initials(name) {
  const w = String(name).replace(/^the\s+/i, '').split(/[\s-]+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}

/** Čitljiva barva besedila na barvi lika. */
export function textOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff';
}
