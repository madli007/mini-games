/* =====================================================================
   ZAPOREDJE — čista logika (brez DOM-a), testirana v tests/tests.js.
   Generator iz seeda, pravilo »največ 3 enaki zapored«, preverjanje
   vnosa, modifikatorji (Zrcalo, Kameleon …), tempo, točkovanje,
   razvrstitev v dvoboju in štafeti, nagrade, komentator.
   ===================================================================== */

export const MAX_RUN = 3;          // največ toliko enakih korakov zapored
export const DAILY_LEN = 120;      // dolžina dnevnega zaporedja
export const MP_LEN = 200;         // dolžina zaporedja v dvoboju
export const RETURN_GRACE_MS = 15000;  // vrnitev po osvežitvi v dvoboju
export const STEP_LIMITS = [2000, 3000, 5000, 0];   // 0 = brez omejitve
export const DEFAULT_LIMIT = 3000;

/**
 * Ploščice: barva + simbol + ton ostanejo vedno skupaj.
 * Toni so durova pentatonika (C D E G A C), zato zaporedje zveni kot melodija.
 */
export const TILES = [
  { id: 0, sym: '●', name: 'krog', color: '#b86bff', freq: 261.63 },
  { id: 1, sym: '▲', name: 'trikotnik', color: '#4de1ff', freq: 293.66 },
  { id: 2, sym: '■', name: 'kvadrat', color: '#ffd23f', freq: 329.63 },
  { id: 3, sym: '◆', name: 'romb', color: '#39ff88', freq: 392.00 },
  { id: 4, sym: '★', name: 'zvezda', color: '#ff4fd8', freq: 440.00 },
  { id: 5, sym: '✚', name: 'križ', color: '#ff8a1f', freq: 523.25 },
];

/** Tipke po položaju na plošči (ne po ploščici — pri Kameleonu se ploščice premikajo). */
export const KEYS4 = [['KeyQ', 'Digit1', 'Numpad1'], ['KeyW', 'Digit2', 'Numpad2'], ['KeyA', 'Digit3', 'Numpad3'], ['KeyS', 'Digit4', 'Numpad4']];
export const KEYS6 = [1, 2, 3, 4, 5, 6].map(n => ['Digit' + n, 'Numpad' + n]);
export const KEY_LABELS4 = ['Q', 'W', 'A', 'S'];
export const KEY_LABELS6 = ['1', '2', '3', '4', '5', '6'];

/** Položaj na plošči za tipko (ali -1). */
export function keyToPos(code, n = 4) {
  const keys = n === 6 ? KEYS6 : KEYS4;
  return keys.findIndex(k => k.includes(code));
}

/* ------------------------------------------------------------ generator */

/** Ali zaporedje spoštuje pravilo »največ max enakih zapored«? */
export function validRun(seq, max = MAX_RUN) {
  let run = 0;
  for (let i = 0; i < seq.length; i++) {
    run = i > 0 && seq[i] === seq[i - 1] ? run + 1 : 1;
    if (run > max) return false;
  }
  return true;
}

/** Ali lahko na konec zaporedja dodamo ploščico t (brez kršenja pravila)? */
export function canAppend(seq, t, max = MAX_RUN) {
  if (seq.length < max) return true;
  for (let i = seq.length - max; i < seq.length; i++) if (seq[i] !== t) return true;
  return false;
}

/** Naključen naslednji korak (rand ∈ [0,1)), ki ne krši pravila. */
export function nextStep(seq, n, rand) {
  let t = Math.floor(rand() * n);
  if (!canAppend(seq, t)) t = (t + 1 + Math.floor(rand() * (n - 1))) % n;
  return t;
}

/**
 * Zaporedje dolžine len z n ploščicami.
 * @param {()=>number} rand PRNG (hub.rng(...) ali Math.random)
 */
export function generate(rand, len, n = 4) {
  const seq = [];
  while (seq.length < len) seq.push(nextStep(seq, n, rand));
  return seq;
}

/** Zaporedje iz seeda (isto za vse z istim seedom). */
export function seqFromSeed(rng, seed, len, n = 4) {
  return generate(rng(seed + ':zaporedje'), len, n);
}

/* ------------------------------------------------------------ modifikatorji */

export const MODS = [
  { id: 'none', name: 'Brez modifikatorja', icon: '🎹', desc: 'Čista klasika: zasvetijo, ponoviš.' },
  { id: 'mirror', name: 'Zrcalo', icon: '🪞', desc: 'Zaporedje ponoviš od zadaj naprej.' },
  { id: 'six', name: 'Šest', icon: '🎲', desc: 'Šest ploščic v mreži 3×2.' },
  { id: 'silent', name: 'Tišina', icon: '🔇', desc: 'Brez zvoka, samo luč.' },
  { id: 'ear', name: 'Samo posluh', icon: '👂', desc: 'Ploščice ne zasvetijo, slišiš samo tone.' },
  { id: 'chameleon', name: 'Kameleon', icon: '🦎', desc: 'Po vsakem krogu ploščice zamenjajo mesta.' },
  { id: 'turbo', name: 'Turbo', icon: '🚀', desc: 'Tempo je hiter že od začetka.' },
];
export const modById = id => MODS.find(m => m.id === id) || MODS[0];

/** Dnevni modifikator (isti za vse). */
export function dailyMod(rng, seed) {
  return rng(seed + ':zaporedje:mod').pick(MODS).id;
}

/** Načrt dnevnega izziva: zaporedje, modifikator, število ploščic. */
export function dailyPlan(rng, seed) {
  const mod = dailyMod(rng, seed);
  const n = mod === 'six' ? 6 : 4;
  return { seed, mod, n, seq: seqFromSeed(rng, seed + ':daily', DAILY_LEN, n) };
}

/** Pričakovan vnos za krog dolžine len (Zrcalo obrne vrstni red). */
export function expectedFor(seq, len, mod = 'none') {
  const part = seq.slice(0, len);
  return mod === 'mirror' ? part.reverse() : part;
}

/** Začetna razporeditev: položaj → id ploščice. */
export function identityLayout(n = 4) { return Array.from({ length: n }, (_, i) => i); }

/**
 * Kameleon: nova razporeditev ploščic (permutacija id-jev), drugačna od prejšnje.
 * Ploščica (barva + simbol + ton) se premakne cela, zato par barva–ton ostane.
 * @param {number[]} prev položaj → id
 * @param {()=>number} rand
 */
export function chameleonLayout(prev, rand) {
  const n = prev.length;
  for (let tries = 0; tries < 20; tries++) {
    const next = prev.slice();
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    if (next.some((v, i) => v !== prev[i])) return next;
  }
  return prev.slice(1).concat(prev[0]);   // zamik za ena (vedno drugačen)
}

/** Ploščice po položajih (za izris). */
export function tilesAt(layout) { return layout.map(id => TILES[id]); }

/* ------------------------------------------------------------ tempo */

/**
 * Trajanje enega koraka predvajanja (ms): 600 ms → 250 ms do ~20. kroga.
 * Turbo: začne pri 300 ms in pade do 200 ms.
 */
export function tempoMs(round, mod = 'none') {
  const r = Math.max(1, round | 0);
  if (mod === 'turbo') return Math.max(200, Math.round(300 - (r - 1) * 5));
  return Math.max(250, Math.round(600 - (r - 1) * 18.5));
}

/** Koliko časa traja predvajanje kroga (ms) — za časovno omejitev runde v dvoboju. */
export function playbackMs(len, mod = 'none') {
  return len * tempoMs(len, mod) + 600;
}

/* ------------------------------------------------------------ vnos */

/**
 * Začetek vnosa.
 * @param {number[]} expected pričakovane ploščice (po vrsti vnosa)
 */
export function startInput(expected) {
  return { expected: expected.slice(), pos: 0, done: false, failed: false, reason: null, got: null, times: [] };
}

/**
 * Pritisk ploščice. Vrne novo stanje (staro ostane nespremenjeno).
 * @param {ReturnType<typeof startInput>} st
 * @param {number} tile id ploščice
 * @param {number} [ms] čas od prejšnjega pritiska (ali začetka vnosa)
 */
export function press(st, tile, ms = 0) {
  if (st.done || st.failed) return st;
  const want = st.expected[st.pos];
  if (tile !== want) return { ...st, failed: true, reason: 'wrong', got: tile, times: st.times };
  const pos = st.pos + 1;
  return { ...st, pos, done: pos >= st.expected.length, times: [...st.times, Math.max(0, Math.round(ms))] };
}

/** Potekel je čas za korak → napaka. */
export function timeout(st) {
  if (st.done || st.failed) return st;
  return { ...st, failed: true, reason: 'timeout', got: null };
}

/** Ali je čas za korak potekel? limit 0 = brez omejitve. */
export function isTimedOut(elapsedMs, limitMs) {
  return limitMs > 0 && elapsedMs >= limitMs;
}

/** Pričakovana ploščica, pri kateri je prišlo do napake (ali null). */
export function missedTile(st) {
  return st.failed ? st.expected[st.pos] : null;
}

/* ------------------------------------------------------------ točkovanje */

/** Rezultat: dolžina najdaljšega pravilno ponovljenega zaporedja (krog, v katerem si padel, minus ena). */
export function scoreFor(failedRound) { return Math.max(0, (failedRound | 0) - 1); }

/** Število pravilno ponovljenih korakov v igri, ki se je končala z dolžino len in progress koraki v zadnjem krogu. */
export function stepsFor(len, lastProgress = 0) { return (len * (len + 1)) / 2 + (lastProgress | 0); }

/** XP: 15 za igro, +1 za vsak korak nad 5 (največ +40), +15 dnevni, +40 zmaga v MP. */
export function xpFor({ len = 0, daily = false, mpWin = false } = {}) {
  return 15 + Math.min(40, Math.max(0, len - 5)) + (daily ? 15 : 0) + (mpWin ? 40 : 0);
}

/** Povprečje (zaokroženo) ali null. */
export function avg(list) {
  const a = (list || []).filter(Number.isFinite);
  return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null;
}

/**
 * Povzetek igre iz krogov.
 * @param {{len:number, times:number[], ok:boolean}[]} rounds
 * @returns {{len:number, avgMs:number|null, fastest:{round:number, avgMs:number}|null}}
 */
export function summary(rounds) {
  const done = rounds.filter(r => r.ok && r.times.length);
  const len = done.length ? Math.max(...done.map(r => r.len)) : 0;
  const all = rounds.flatMap(r => r.times);
  let fastest = null;
  for (const r of done) {
    if (r.len < 3) continue;   // prva dva kroga sta prekratka za smiseln »najhitrejši krog«
    const a = avg(r.times);
    if (!fastest || a < fastest.avgMs) fastest = { round: r.len, avgMs: a };
  }
  return { len, avgMs: avg(all), fastest };
}

/** Dosežek Strela: krog z vsaj 10 koraki in povprečjem pod 300 ms. */
export function isLightning(round) {
  return round.ok && round.times.length >= 10 && avg(round.times) < 300;
}

/** Dosežki za dolžino (ključi), ki jih odklene dana dolžina. */
export function lengthAchievements(len) {
  return [[5, 'prvi-koraki'], [15, 'slon'], [25, 'mojster'], [40, 'genij']].filter(([n]) => len >= n).map(([, k]) => k);
}

/**
 * Niz zaporednih dni dnevnega izziva, ki se konča danes.
 * @param {string[]} days 'YYYY-MM-DD'
 * @param {string} today
 */
export function dayStreak(days, today) {
  const set = new Set(days);
  let n = 0;
  const d = new Date(today + 'T12:00:00Z');
  while (set.has(d.toISOString().slice(0, 10))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return n;
}

/* ------------------------------------------------------------ dvoboj */

/**
 * Razvrstitev v dvoboju. Boljši je, kdor je izpadel kasneje (živi = Infinity);
 * ob izpadu v istem krogu tisti, ki je prišel dlje (progress), nato hitrejši čas vnosa v tem krogu.
 * @param {Record<string, {outRound:number|null, progress:number, ms:number, totalMs?:number, steps?:number}>} st
 * @returns {string[]} id-ji od prvega do zadnjega
 */
export function rankDuel(st) {
  const key = id => st[id].outRound == null ? Infinity : st[id].outRound;
  return Object.keys(st).sort((a, b) => {
    const A = st[a], B = st[b];
    return key(b) - key(a) || (B.progress || 0) - (A.progress || 0) || (A.ms || 0) - (B.ms || 0) || (a < b ? -1 : 1);
  });
}

/**
 * Obdelaj rezultate kroga v dvoboju.
 * @param {Record<string, any>} st stanje igralcev (iz rankDuel)
 * @param {number} round
 * @param {Record<string, {ok:boolean, progress:number, ms:number}|undefined>} results rezultati živih (manjka = odsoten)
 * @param {Set<string>|string[]} excused odsotni, ki jim krog ne šteje (vrnitev v 15 s)
 * @param {Record<string, number>} [missingFrom] krog, v katerem je odsoten igralec izginil (za razvrstitev ob izločitvi)
 * @returns {{st:Record<string, any>, out:string[], alive:string[], over:boolean, winner:string|null}}
 */
export function applyDuelRound(st, round, results, excused = [], missingFrom = {}) {
  const ex = new Set(excused);
  const next = {};
  const out = [];
  for (const [id, p] of Object.entries(st)) {
    const q = { ...p };
    if (q.outRound == null) {
      const r = results[id];
      if (r) {
        q.totalMs = (q.totalMs || 0) + (r.ms || 0);
        q.steps = (q.steps || 0) + (r.ok ? round : r.progress || 0);
        q.best = Math.max(q.best || 0, r.ok ? round : round - 1);
        if (!r.ok) { q.outRound = round; q.progress = r.progress || 0; q.ms = r.ms || 0; out.push(id); }
      } else if (!ex.has(id)) {
        q.outRound = Math.min(round, missingFrom[id] || round); q.progress = 0; q.ms = 0; out.push(id);
      }
    }
    next[id] = q;
  }
  const alive = Object.keys(next).filter(id => next[id].outRound == null);
  const total = Object.keys(next).length;
  const over = alive.length === 0 || (alive.length === 1 && total > 1);
  const winner = over ? rankDuel(next)[0] || null : null;
  return { st: next, out, alive, over, winner };
}

/* ------------------------------------------------------------ štafeta */

/** Naslednji živi igralec po vrsti za indeksom cur. */
export function nextTurn(order, out, cur) {
  const n = order.length;
  for (let k = 1; k <= n; k++) {
    const i = (cur + k) % n;
    if (!out[order[i]]) return i;
  }
  return -1;
}

/**
 * Štafeta: obdelaj potezo igralca.
 * @param {{seq:number[], authors:string[], order:string[], turn:number, out:Record<string, any>, falls:Record<string, number>, n:number, turnNo:number}} s
 * @param {{by:string, ok:boolean, added?:number, failAt?:number, reason?:string}} mv
 * @returns {object} novo stanje (z over, winner)
 */
export function applyRelayMove(s, mv) {
  if (s.over || s.order[s.turn] !== mv.by) return s;
  const next = { ...s, seq: s.seq.slice(), authors: s.authors.slice(), out: { ...s.out }, falls: { ...s.falls }, best: { ...(s.best || {}) } };
  if (mv.ok && Number.isInteger(mv.added) && mv.added >= 0 && mv.added < s.n && canAppend(s.seq, mv.added)) {
    next.best[mv.by] = Math.max(next.best[mv.by] || 0, s.seq.length);
    next.seq.push(mv.added);
    next.authors.push(mv.by);
  } else {
    const at = Number.isInteger(mv.failAt) ? mv.failAt : s.seq.length;
    next.best[mv.by] = Math.max(next.best[mv.by] || 0, Math.min(at, s.seq.length));
    next.out[mv.by] = { turnNo: s.turnNo, at, reason: mv.reason || 'wrong' };
    if (at < s.seq.length) next.falls[at] = (next.falls[at] || 0) + 1;
  }
  const alive = next.order.filter(id => !next.out[id]);
  next.turnNo = s.turnNo + 1;
  if (alive.length <= 1) {
    next.over = true;
    next.winner = alive[0] || null;
    if (!next.winner) next.winner = rankRelay(next)[0] || null;
  } else {
    next.turn = nextTurn(next.order, next.out, s.turn);
  }
  return next;
}

/** Razvrstitev v štafeti: živi, nato kdor je izpadel kasneje. */
export function rankRelay(s) {
  return s.order.slice().sort((a, b) => {
    const A = s.out[a], B = s.out[b];
    const ka = A ? A.turnNo : Infinity, kb = B ? B.turnNo : Infinity;
    return kb - ka || (s.best?.[b] || 0) - (s.best?.[a] || 0) || s.order.indexOf(a) - s.order.indexOf(b);
  });
}

/** Skladatelj: avtor koraka, na katerem je izpadlo največ igralcev → { id, step, falls } ali null. */
export function composer(s) {
  let best = null;
  for (const [k, c] of Object.entries(s.falls || {})) {
    const step = +k;
    const id = s.authors[step];
    if (!id || c < 1) continue;
    if (!best || c > best.falls) best = { id, step, falls: c };
  }
  return best;
}

/* ------------------------------------------------------------ nagrade */

/**
 * Nagrade ob koncu multiplayerja.
 * @param {Record<string, {outRound?:number|null, best?:number, totalMs?:number, steps?:number, progress?:number}>} st
 * @param {string[]} ranking
 */
export function awards(st, ranking) {
  const out = [];
  const ids = Object.keys(st);
  if (ids.length < 2) return out;
  const slon = ids.slice().sort((a, b) => (st[b].best || 0) - (st[a].best || 0) || ranking.indexOf(a) - ranking.indexOf(b))[0];
  out.push({ key: 'slon', icon: '🐘', title: 'Slon', desc: 'najdlje preživel', id: slon });
  const fast = ids.filter(id => (st[id].steps || 0) >= 3)
    .map(id => ({ id, a: st[id].totalMs / st[id].steps }))
    .sort((a, b) => a.a - b.a)[0];
  if (fast) out.push({ key: 'strela', icon: '⚡', title: 'Strela', desc: `najhitrejši vnos (${Math.round(fast.a)} ms/korak)`, id: fast.id });
  const last = ranking[ranking.length - 1];
  if (last && st[last].outRound != null) out.push({ key: 'nesrecnik', icon: '🍀', title: 'Nesrečnik', desc: 'izpadel prvi', id: last });
  return out;
}

/* ------------------------------------------------------------ komentator */

const MILESTONES = {
  3: ['Ogrevanje je mimo.', 'Tri! Prsti so budni.'],
  5: ['Pet! Prvi koraki so za tabo.', 'Pet zapored, lepo.', 'Pet — zdaj gre zares.'],
  8: ['Osem! Možgani se ogrevajo.', 'Osem korakov, brez treme.'],
  10: ['Deset! Spomin kot slon.', 'Dvomestno! Bravo.', 'Deset — to je že melodija.'],
  12: ['Dvanajst! Tukaj mnogi odnehajo.', 'Ducat korakov!'],
  15: ['Petnajst, kdo te ustavi?', 'Petnajst! Slon bi bil ponosen.', 'Petnajst — to je že pesem.'],
  20: ['Dvajset! Si sploh človek?', 'Dvajset korakov, prava simfonija.'],
  25: ['Petindvajset! Mojster zaporedij.', 'Četrt stoletja korakov!'],
  30: ['Trideset! Tole je že čarovnija.', 'Trideset — dirigent bi zaploskal.'],
  40: ['Štirideset! Človeški trdi disk.', 'Štirideset. Brez besed.'],
  50: ['Petdeset! Legenda.', 'Pol stotice! Kje imaš shranjeno?'],
};
const GENERIC = ['Lepo!', 'Brez napake.', 'Kar tako naprej.', 'Mirna roka.', 'Ritem drži.', 'Čisto!', 'Še enega?', 'Gladko.'];
const FAILS = ['Ups, {a} ni {b}.', 'Skoraj! {a} ni {b}.', '{a}? Iskali smo {b}.', 'Oh ne, {b} je ušel.'];
const TIMEOUTS = ['Čas je potekel!', 'Prepočasi — ura ne čaka.', 'Zamrznil si? Čas je mimo.'];
const RECORD = ['Nov rekord!', 'Rekord je padel!', 'Višje kot kdajkoli!'];
const TIE = ['Izenačil si rekord!', 'Na rekordu si! Še en korak.'];

/** Vse variante (za test, da jih je dovolj). */
export const ALL_LINES = [...Object.values(MILESTONES).flat(), ...GENERIC, ...FAILS, ...TIMEOUTS, ...RECORD, ...TIE];

/**
 * Napis po uspešnem krogu dolžine len (ali null, če ni mejnik — z redkim splošnim napisom).
 * @param {number} len
 * @param {()=>number} rand
 */
export function lineForRound(len, rand = Math.random) {
  const m = MILESTONES[len];
  if (m) return m[Math.floor(rand() * m.length)];
  if (len > 50 && len % 10 === 0) return `${len}! Neverjetno.`;
  return len >= 4 && rand() < 0.22 ? GENERIC[Math.floor(rand() * GENERIC.length)] : null;
}

/** Napis ob napaki. got/want sta id-ja ploščic. */
export function lineForFail(reason, got, want, rand = Math.random) {
  if (reason === 'timeout' || got == null) return TIMEOUTS[Math.floor(rand() * TIMEOUTS.length)];
  const t = FAILS[Math.floor(rand() * FAILS.length)];
  return t.replace('{a}', TILES[got].sym).replace('{b}', TILES[want].sym);
}

export const lineRecord = (rand = Math.random) => RECORD[Math.floor(rand() * RECORD.length)];
export const lineTie = (rand = Math.random) => TIE[Math.floor(rand() * TIE.length)];
