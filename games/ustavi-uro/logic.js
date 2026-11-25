/* =====================================================================
   USTAVI URO — čista logika (brez DOM-a, testirana v tests/ustavi-uro.js).

   Krog (»spec«):
     { r, stops: [ms, …], hideAfter: ms|null, countdown?: bool, tickMs?: ms, speed?: number }
       stops     — cilji v ms od starta (navadno en; Dvojni stop ima dva)
       hideAfter — null = ura je vidna ves čas, 0 = ni vidna nikoli, sicer izgine po toliko ms
       countdown — ura teče od zadnjega cilja navzdol (ustavi pri 0,00)
       tickMs    — Metronom: tiktak se sliši tudi na slepo, v tem (napačnem) ritmu
       speed     — Lažna ura: vidni prikaz teče s faktorjem speed (pravi čas je drugačen)
   Rezultat kroga = vsota |stop − cilj| (ms, celo število); manjkajoč stop = 5000 ms.
   ===================================================================== */

export const GAME = 'ustavi-uro';
export const ROUNDS = 5;
export const OVERRUN_MS = 5000;       // kazen in rok: cilj + 5 s
export const PERFECT_MS = 10;
export const PERFECT_BONUS = 20;
export const GUARD_MS = 150;          // dotik v prvih 150 ms po startu se ignorira
export const FREE_TARGET = 10000;
export const HIDE_PATTERN = [null, 5000, 3000, 1000, 0];

export const DIFFS = [
  { id: 'easy', name: 'Lahko', desc: 'Vedno 10,00 s' },
  { id: 'mid', name: 'Srednje', desc: 'Krogi 4–5: naključni cilj 7–15 s' },
  { id: 'hard', name: 'Težko', desc: 'Cilji do 30 s' },
];
export const diffById = id => DIFFS.find(d => d.id === id) || DIFFS[0];

export const MODS = [
  { id: 'classic', icon: '⏱️', name: 'Klasika', desc: 'Brez posebnosti: 5 krogov po 10,00 s.' },
  { id: 'odd', icon: '🎯', name: 'Čudni cilji', desc: 'Necele tarče, npr. 7,35 s ali 12,80 s.' },
  { id: 'metronome', icon: '🥁', name: 'Metronom', desc: 'Tiktak se sliši tudi na slepo — a ne v ritmu sekunde.' },
  { id: 'fake', icon: '🤥', name: 'Lažna ura', desc: 'Vidna ura teče 10 % narobe. Zaupaj sebi.' },
  { id: 'countdown', icon: '⏳', name: 'Odštevanje', desc: 'Ura teče navzdol, ustavi jo pri 0,00.' },
  { id: 'double', icon: '✌️', name: 'Dvojni stop', desc: 'V vsakem krogu ustavi pri 5 s in pri 10 s.' },
  { id: 'long', icon: '🛤️', name: 'Dolga pot', desc: 'En krog ima cilj kar 30 s.' },
];
export const modById = id => MODS.find(m => m.id === id) || MODS[0];

/* ------------------------------------------------------------ generator */

/** Necel cilj med lo in hi sekundami (na stotinko, nikoli cela sekunda). */
function oddTarget(rand, lo, hi) {
  let cs = rand.int(lo * 100, hi * 100);
  if (cs % 100 === 0) cs += 35;
  return cs * 10;
}

/**
 * Runda proste igre / dvoboja za težavnost.
 * @param {ReturnType<typeof import('../../shared/util.js').rng>} rand
 * @param {'easy'|'mid'|'hard'} diff
 */
export function freePlan(rand, diff = 'easy') {
  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    let target = FREE_TARGET;
    if (diff === 'mid' && i >= 3) target = rand.int(7, 15) * 1000;
    if (diff === 'hard' && i >= 1) target = i === ROUNDS - 1 ? rand.int(20, 30) * 1000 : rand.int(8, 30) * 1000;
    rounds.push({ r: i + 1, stops: [target], hideAfter: HIDE_PATTERN[i] });
  }
  return { mod: 'classic', diff, rounds };
}

/**
 * Dnevni izziv: cilji, časi izginotja in modifikator — enako za vse ta dan.
 * @param {(seed:string)=>any} rng hub.rng
 * @param {string} seed hub.dailySeed()
 * @param {string} [forceMod] samo za preizkus (?mod=)
 */
export function dailyPlan(rng, seed, forceMod) {
  const rand = rng(seed + ':' + GAME);
  const mod = forceMod && MODS.some(m => m.id === forceMod) ? forceMod : rand.pick(MODS).id;
  // časi izginotja: krog 1 vidna, nato vedno krajše, zadnji krog na slepo
  const hides = [null, rand.int(40, 60) * 100, rand.int(20, 40) * 100, rand.int(5, 15) * 100, 0];
  const longAt = rand.int(2, 4);   // Dolga pot: indeks kroga s 30 s
  const tickMs = rand.pick([880, 900, 920, 1080, 1100, 1120]);
  const speed = rand.pick([0.9, 1.1]);
  const rounds = [];
  for (let i = 0; i < ROUNDS; i++) {
    const spec = { r: i + 1, stops: [FREE_TARGET], hideAfter: hides[i] };
    if (mod === 'odd') spec.stops = [oddTarget(rand, 6, 15)];
    if (mod === 'metronome') spec.tickMs = tickMs;
    if (mod === 'fake') spec.speed = speed;
    if (mod === 'countdown') spec.countdown = true;
    if (mod === 'double') spec.stops = [5000, 10000];
    if (mod === 'long' && i === longAt) { spec.stops = [30000]; spec.hideAfter = Math.min(spec.hideAfter ?? 8000, 8000); }
    rounds.push(spec);
  }
  return { mod, diff: 'daily', rounds };
}

/** Čas izginotja v Zadnji stoji: vsak krog krajši (6 s, 4,5 s, 3 s, 1,5 s, nato na slepo). */
export function lastStandingHide(r) {
  return Math.max(0, 6000 - (r - 1) * 1500);
}

/**
 * Krog v multiplayerju (deterministično iz seeda sobe, enako pri vseh).
 * Dvoboj: kot prosta igra; Zadnji stoji: vse krajši čas izginotja, neomejeno krogov.
 */
export function mpRound(rng, seed, diff, mode, r) {
  if (mode === 'duel' && r <= ROUNDS) {
    return freePlan(rng(seed + ':' + GAME + ':duel'), diff).rounds[r - 1];
  }
  const rand = rng(`${seed}:${GAME}:ls:${r}`);
  let target = FREE_TARGET;
  if (diff === 'mid' && r >= 4) target = rand.int(7, 15) * 1000;
  if (diff === 'hard' && r >= 2) target = rand.int(8, 25) * 1000;
  return { r, stops: [target], hideAfter: lastStandingHide(r) };
}

/** Ali je v krogu vsaj del na slepo? */
export const isBlind = spec => spec.hideAfter != null && spec.hideAfter < lastStop(spec);
export const lastStop = spec => spec.stops[spec.stops.length - 1];
/** Rok kroga (ms od starta): zadnji cilj + 5 s. */
export const deadline = spec => lastStop(spec) + OVERRUN_MS;

/**
 * Kaj kaže vidna ura ob času t (pravi ms od starta).
 * @returns {number} ms (pri odštevanju lahko negativno)
 */
export function displayMs(spec, t) {
  const shown = t * (spec.speed || 1);
  return spec.countdown ? lastStop(spec) - shown : shown;
}

/* ------------------------------------------------------------ točkovanje */

/** Odstopanje v ms (celo število). */
export function deviation(stopped, target) {
  return Math.round(Math.abs(stopped - target));
}

/**
 * Ovrednoti krog.
 * @param {{stops:number[]}} spec
 * @param {number[]} taps časi ustavitev v ms od starta (po vrsti); manjkajoči = prekoračitev
 * @returns {{dev:number, devs:number[], signed:(number|null)[], overrun:boolean, perfect:boolean, taps:number[]}}
 */
export function scoreRound(spec, taps = []) {
  const clean = (taps || []).filter(t => Number.isFinite(t) && t >= 0).slice(0, spec.stops.length);
  const devs = [], signed = [];
  spec.stops.forEach((target, i) => {
    const t = clean[i];
    if (t == null || t > target + OVERRUN_MS) { devs.push(OVERRUN_MS); signed.push(null); return; }
    devs.push(deviation(t, target));
    signed.push(Math.round(t - target));
  });
  const dev = devs.reduce((a, b) => a + b, 0);
  const overrun = signed.some(s => s == null);
  return { dev, devs, signed, overrun, perfect: !overrun && dev <= PERFECT_MS, taps: clean.map(t => Math.round(t)) };
}

/** Število popolnih krogov. */
export const perfectCount = rounds => rounds.filter(r => r && r.perfect).length;

/** Skupni rezultat runde: vsota odstopanj − 20 ms za vsak popoln krog, nikoli pod 0. */
export function totalScore(rounds) {
  const sum = rounds.reduce((a, r) => a + (r ? r.dev : OVERRUN_MS), 0);
  return Math.max(0, sum - PERFECT_BONUS * perfectCount(rounds));
}

/** Ocena odstopanja. */
export const GRADES = [
  { key: 'perfect', max: 10, label: 'Popolno!' },
  { key: 'great', max: 50, label: 'Odlično' },
  { key: 'good', max: 150, label: 'Dobro' },
  { key: 'close', max: 400, label: 'Blizu' },
  { key: 'miss', max: Infinity, label: 'Ojej …' },
];
export function grade(dev) {
  return GRADES.find(g => dev <= g.max);
}

/** Smer kroga: povprečje predznačenih odstopanj (null, če ni nobenega stopa). */
export function roundBias(res) {
  const s = res.signed.filter(v => v != null);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
}

/**
 * Povzetek runde.
 * @param {ReturnType<typeof scoreRound>[]} rounds
 */
export function summary(rounds) {
  const n = rounds.length;
  const total = totalScore(rounds);
  const raw = rounds.reduce((a, r) => a + r.dev, 0);
  let best = null;
  rounds.forEach((r, i) => { if (!best || r.dev < best.dev) best = { round: i + 1, dev: r.dev }; });
  const signed = rounds.flatMap(r => r.signed.filter(v => v != null));
  const bias = signed.length ? Math.round(signed.reduce((a, b) => a + b, 0) / signed.length) : null;
  return {
    total, raw, avg: n ? Math.round(raw / n) : 0, best, bias,
    perfects: perfectCount(rounds),
    early: signed.filter(v => v < 0).length, late: signed.filter(v => v > 0).length,
    overruns: rounds.filter(r => r.overrun).length,
  };
}

/** »V povprečju prezgodaj za 84 ms« */
export function biasText(bias) {
  if (bias == null) return '—';
  if (Math.abs(bias) <= 5) return 'v povprečju točno';
  return `v povprečju ${bias < 0 ? 'prezgodaj' : 'prepozno'} za ${Math.abs(bias)} ms`;
}

/* ------------------------------------------------------------ Zadnji stoji */

/**
 * Kdo izpade po krogu: igralec z največjim odstopanjem. Ob izenačenju na vrhu ne izpade nihče.
 * @param {Record<string, number>} devs odstopanja živih igralcev
 * @returns {string[]} izpadli (0 ali 1)
 */
export function eliminate(devs) {
  const ids = Object.keys(devs);
  if (ids.length < 2) return [];
  const max = Math.max(...ids.map(id => devs[id]));
  const worst = ids.filter(id => devs[id] === max);
  return worst.length === 1 ? worst : [];
}

/**
 * Razvrstitev.
 * duel: manjše skupno odstopanje; last: kasnejši izpad (živi prvi), nato manjše skupno.
 * @param {Record<string, {total:number, out:number|null}>} st
 * @param {'duel'|'last'} mode
 */
export function ranking(st, mode = 'duel') {
  return Object.keys(st).sort((a, b) => {
    const A = st[a], B = st[b];
    if (mode === 'last') {
      const oa = A.out == null ? Infinity : A.out, ob = B.out == null ? Infinity : B.out;
      if (oa !== ob) return ob - oa;
    }
    return A.total - B.total || (a < b ? -1 : 1);
  });
}

/** Najbližji v krogu (krona): najmanjše odstopanje; ob izenačenju vsi. */
export function crowns(devs) {
  const ids = Object.keys(devs);
  if (!ids.length) return [];
  const min = Math.min(...ids.map(id => devs[id]));
  return ids.filter(id => devs[id] === min);
}

/**
 * Nagrade ob koncu multiplayerja.
 * @param {Record<string, {total:number, early:number, late:number, best:number|null}>} st
 * @param {string[]} order razvrstitev
 * @param {'duel'|'last'} [mode]
 */
export function awards(st, order, mode = 'duel') {
  const ids = Object.keys(st);
  if (ids.length < 2) return [];
  const out = [];
  const pickMax = (f) => {
    let best = null;
    for (const id of order) { const v = f(st[id]); if (v > 0 && (best == null || v > f(st[best]))) best = id; }
    return best;
  };
  // Zadnji stoji: igralci odigrajo različno krogov → povprečje na krog
  const swissVal = id => (mode === 'last' ? st[id].total / Math.max(1, (st[id].devs || []).length) : st[id].total);
  const swiss = [...ids].sort((a, b) => swissVal(a) - swissVal(b) || order.indexOf(a) - order.indexOf(b))[0];
  out.push({ key: 'swiss', icon: '⌚', title: 'Švicarska ura', desc: mode === 'last' ? 'Najmanjše odstopanje na krog' : 'Najmanjše skupno odstopanje', id: swiss });
  const imp = pickMax(s => s.early);
  if (imp) out.push({ key: 'early', icon: '🐇', title: 'Nestrpnež', desc: `Največkrat prezgodaj (${st[imp].early}×)`, id: imp });
  const slp = pickMax(s => s.late);
  if (slp) out.push({ key: 'late', icon: '😴', title: 'Zaspanec', desc: `Največkrat prepozno (${st[slp].late}×)`, id: slp });
  const withBest = ids.filter(id => st[id].best != null);
  if (withBest.length) {
    const laser = withBest.sort((a, b) => st[a].best - st[b].best || order.indexOf(a) - order.indexOf(b))[0];
    out.push({ key: 'laser', icon: '🎯', title: 'Laserski prst', desc: `Najboljši krog (${st[laser].best} ms)`, id: laser });
  }
  return out;
}

/** Posodobi statistiko igralca po krogu (vrne novo). */
export function addRound(p, res) {
  const s = res.signed.filter(v => v != null);
  return {
    ...p,
    total: Math.max(0, (p.raw || 0) + res.dev - PERFECT_BONUS * ((p.perfects || 0) + (res.perfect ? 1 : 0))),
    raw: (p.raw || 0) + res.dev,
    perfects: (p.perfects || 0) + (res.perfect ? 1 : 0),
    devs: [...(p.devs || []), res.dev],
    early: (p.early || 0) + s.filter(v => v < 0).length,
    late: (p.late || 0) + s.filter(v => v > 0).length,
    best: p.best == null ? res.dev : Math.min(p.best, res.dev),
  };
}
export const newPlayer = () => ({ total: 0, raw: 0, perfects: 0, devs: [], early: 0, late: 0, best: null, out: null });

/* ------------------------------------------------------------ notranja ura */

/**
 * Notranja ura iz krogov na slepo: povprečno razmerje ustavljeni/cilj (npr. 0,97 → »tvoja sekunda traja 0,97 s«).
 * @param {{t:number, s:number}[]} hist t = cilj, s = ustavljeni čas (ms)
 * @returns {number|null}
 */
export function innerClock(hist) {
  const ok = (hist || []).filter(h => h && h.t > 0 && h.s > 0 && Math.abs(h.s - h.t) < OVERRUN_MS);
  if (!ok.length) return null;
  return Math.round(ok.reduce((a, h) => a + h.s / h.t, 0) / ok.length * 1000) / 1000;
}

/* ------------------------------------------------------------ XP, dosežki, niz */

/** XP: 15 za rundo, +10 Težko, +15 dnevni, +5 na popoln krog (≤ 15), +40 zmaga v MP. */
export function xpFor({ hard = false, daily = false, perfects = 0, mpWin = false } = {}) {
  return 15 + (hard ? 10 : 0) + (daily ? 15 : 0) + Math.min(15, 5 * perfects) + (mpWin ? 40 : 0);
}

/**
 * Dosežki, ki jih runda odklene.
 * @param {{rounds:{spec:any, res:any}[], diff:string, total:number, complete:boolean}} r
 */
export function roundAchievements({ rounds, diff, total, complete }) {
  const out = [];
  if (complete) out.push('prvi-stop');
  if (rounds.some(x => x.res.perfect)) out.push('popolno');
  if (rounds.some(x => x.spec.hideAfter === 0 && !x.res.overrun && x.res.dev <= 50)) out.push('slepec');
  const hardish = diff !== 'easy';
  if (complete && hardish && total < 500) out.push('pod-500');
  if (complete && hardish && total < 200) out.push('pod-200');
  if (rounds.filter(x => x.res.perfect).length >= 3) out.push('trije-popolni');
  if (rounds.some(x => lastStop(x.spec) >= 30000 && !x.res.overrun && x.res.dev <= 200)) out.push('dolga-pot');
  return out;
}

/** Zaporedni dnevi (do danes) iz seznama 'YYYY-MM-DD'. */
export function dayStreak(days, today) {
  const set = new Set(days);
  let n = 0;
  const d = new Date(today + 'T12:00:00Z');
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

/* ------------------------------------------------------------ prikaz */

/** Prikaz štoparice: 9870 → '9,87' (stotinke odrezane); negativno → '−0,42'. */
export function fmtClock(ms) {
  const neg = ms < 0;
  const cs = Math.floor(Math.abs(ms) / 10);
  const s = Math.floor(cs / 100), c = cs % 100;
  return `${neg ? '−' : ''}${s},${String(c).padStart(2, '0')}`;
}
/** Cilj: 10000 → '10,00 s' */
export const fmtTarget = ms => `${fmtClock(ms)} s`;
/** Predznačeno odstopanje: −130 → '−130 ms', 42 → '+42 ms' */
export function fmtSigned(v) {
  if (v == null) return 'ni stopa';
  return `${v < 0 ? '−' : v > 0 ? '+' : '±'}${Math.abs(v)} ms`;
}
/** 1234 → '1.234 ms' */
export const fmtMs = ms => `${Math.round(ms).toLocaleString('sl-SI')} ms`;

/* ------------------------------------------------------------ komentator */

const LINES = {
  perfect: ['Švicarska ura bi bila ponosna.', 'Notranja ura: kalibrirana.', 'To ni bila sreča. Ali pa je bila?', 'Atomska ura te kliče na posvet.'],
  great: ['Skoraj na stotinko.', 'Čas te posluša.', 'Mirna roka, bistra glava.', 'Tega se ne bi sramoval niti metronom.'],
  goodEarly: ['Malo si pohitel.', 'Čas ni pobegnil, ti si ga prehitel.', 'Nestrpnost se pozna.'],
  goodLate: ['Malce si zadremal.', 'Še en vdih preveč.', 'Ura je bila hitrejša od tebe.'],
  closeEarly: ['Prehitel si čas.', 'Kam se ti mudi?', 'Sekunde so ti tekle prehitro.'],
  closeLate: ['Si zaspal?', 'Čas je šel naprej brez tebe.', 'Polžja pošta.'],
  missEarly: ['Ojej, to je bil sprint.', 'Ustavil si, preden se je prav začelo.', 'Šteješ kot kolibri.'],
  missLate: ['Ura je medtem šla na kavo.', 'Halo? Je kdo tam?', 'Šteješ kot lenivec.'],
  overrun: ['Ura je obupala nad tabo.', 'Pozabil si pritisniti? Se zgodi.', 'Pet sekund kasneje … nič.'],
};

/**
 * Napis komentatorja za krog.
 * @param {{dev:number, signed:(number|null)[], overrun:boolean}} res
 * @param {()=>number} [random]
 */
export function commentFor(res, random = Math.random) {
  const pick = a => a[Math.floor(random() * a.length) % a.length];
  if (res.overrun) return pick(LINES.overrun);
  const g = grade(res.dev).key;
  if (g === 'perfect' || g === 'great') return pick(LINES[g]);
  const b = roundBias(res);
  const dir = b != null && b < 0 ? 'Early' : 'Late';
  return pick(LINES[g + dir]);
}
export const COMMENT_COUNT = Object.values(LINES).reduce((a, l) => a + l.length, 0);
