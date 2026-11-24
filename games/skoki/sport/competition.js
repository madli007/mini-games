/* =====================================================================
   SPORT — competition.js: splošna logika tekmovanja v serijah (brez DOM-a,
   brez skakalnih pojmov). Uporabljajo jo Smučarski skoki, kasneje lahko
   biatlon, slalom, bob … (glej sport/README.md).

   Stanje je navaden JSON (gre v room.setState in v localStorage):
   {
     v: 1, seed: 'niz', cfg: { rounds, trial, cut, order1, higher },
     participants: [{ id, name, kind: 'human'|'bot', bib, team?, meta? }],
     rounds: [{ kind: 'trial'|'score', order: [id…], pos, results: { id: { status, score, data } } }],
     round: indeks trenutne serije, finished: bool
   }
   Statusi: 'ok' · 'dns' (ni štartal) · 'dsq' (diskvalificiran) · 'dnf' (ni dokončal).
   Rezultat ≠ 'ok' v točkovani seriji = izpade iz naslednjih serij in je na dnu razvrstitve.
   ===================================================================== */

export const STATUS = ['ok', 'dns', 'dsq', 'dnf'];

/* ------------------------------------------------------------ deterministična naključnost */

/** FNV-1a hash niza → uint32. */
export function hashStr(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** mulberry32 */
export function rng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Naključen vrstni red iz seeda (Fisher–Yates). */
export function shuffled(ids, seed) {
  const a = ids.slice(), r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ------------------------------------------------------------ ustvarjanje */

/**
 * Novo tekmovanje.
 * @param {{seed:string, participants:Array<{id:string,name:string,kind?:string,team?:string,meta?:Object}>,
 *          rounds?:number, trial?:boolean, cut?:number, order1?:'random'|'given', higher?:boolean}} o
 *   rounds: število točkovanih serij (1–4) · trial: poskusna serija na začetku (ne šteje) ·
 *   cut: v naslednjo serijo gre najboljših N (0 = vsi; izenačeni na meji gredo vsi) ·
 *   order1: vrstni red 1. serije (naključen iz seeda ali kot je podan, npr. po razvrstitvi pokala) ·
 *   higher: več točk je bolje (privzeto true)
 */
export function createCompetition(o) {
  const seed = String(o.seed ?? '1');
  const ids = new Set();
  const participants = [];
  for (const p of o.participants || []) {
    if (!p || typeof p.id !== 'string' || ids.has(p.id)) continue;
    ids.add(p.id);
    participants.push({ id: p.id, name: String(p.name ?? p.id), kind: p.kind === 'bot' ? 'bot' : 'human', bib: participants.length + 1, ...(p.team ? { team: String(p.team) } : {}), ...(p.meta ? { meta: p.meta } : {}) });
  }
  const cfg = {
    rounds: Math.max(1, Math.min(4, o.rounds | 0 || 2)),
    trial: !!o.trial,
    cut: Math.max(0, o.cut | 0),
    order1: o.order1 === 'given' ? 'given' : 'random',
    higher: o.higher !== false,
  };
  const first = cfg.order1 === 'given' ? participants.map(p => p.id) : shuffled(participants.map(p => p.id), seed + ':r1');
  // štartne številke po vrstnem redu 1. serije
  first.forEach((id, i) => { participants.find(p => p.id === id).bib = i + 1; });
  const st = { v: 1, seed, cfg, participants, rounds: [], round: 0, finished: false };
  st.rounds.push({ kind: cfg.trial ? 'trial' : 'score', order: first, pos: 0, results: {} });
  return st;
}

/** Preveri in normaliziraj serializirano stanje (npr. iz room.getState ali localStorage). Vrne stanje ali null. */
export function restore(json) {
  try {
    const st = typeof json === 'string' ? JSON.parse(json) : structuredClone(json);
    if (!st || st.v !== 1 || !Array.isArray(st.participants) || !Array.isArray(st.rounds) || !st.rounds.length) return null;
    if (!(st.round >= 0 && st.round < st.rounds.length)) return null;
    for (const r of st.rounds) {
      if (!Array.isArray(r.order) || typeof r.results !== 'object' || !r.results) return null;
      if (!(r.pos >= 0 && r.pos <= r.order.length)) return null;
      for (const res of Object.values(r.results)) if (!STATUS.includes(res?.status) || typeof res.score !== 'number') return null;
    }
    return st;
  } catch { return null; }
}

/* ------------------------------------------------------------ poizvedbe */

export const participant = (st, id) => st.participants.find(p => p.id === id) || null;
export const currentRound = st => st.rounds[st.round];
/** Kdo je na vrsti (id) ali null, ko je tekma končana. */
export function currentId(st) {
  if (st.finished) return null;
  const R = currentRound(st);
  return R.order[R.pos] ?? null;
}
/** Naslednjih n na vrsti v trenutni seriji (brez trenutnega). */
export function upcoming(st, n = 3) {
  const R = currentRound(st);
  return R.order.slice(R.pos + 1, R.pos + 1 + n);
}
/** Številka točkovane serije (1, 2 …) ali 0 za poskusno. */
export function roundNumber(st, i = st.round) {
  if (st.rounds[i]?.kind === 'trial') return 0;
  return st.rounds.slice(0, i + 1).filter(r => r.kind === 'score').length;
}
export const totalRounds = st => st.cfg.rounds + (st.cfg.trial ? 1 : 0);

/* ------------------------------------------------------------ vpis rezultata */

/**
 * Vpiši rezultat in premakni tekmo naprej (vrne NOVO stanje).
 * @param {Object} st
 * @param {string} id udeleženec (mora biti na vrsti, razen če je force)
 * @param {{status?:string, score?:number, data?:Object}} res
 */
export function record(st, id, res, { force = false } = {}) {
  st = structuredClone(st);
  if (st.finished) return st;
  const R = currentRound(st);
  if (!force && R.order[R.pos] !== id) throw Object.assign(new Error('not_your_turn'), { code: 'not_your_turn' });
  if (!R.order.includes(id)) throw Object.assign(new Error('not_in_round'), { code: 'not_in_round' });
  const status = STATUS.includes(res.status) ? res.status : 'ok';
  R.results[id] = { status, score: status === 'ok' ? Math.round((+res.score || 0) * 10) / 10 : 0, ...(res.data ? { data: res.data } : {}) };
  advance(st);
  return st;
}

/** Premakni udeleženca na konec trenutne serije (sproščen način: »gre na konec«). Vrne novo stanje. */
export function moveToEnd(st, id) {
  st = structuredClone(st);
  const R = currentRound(st);
  const i = R.order.indexOf(id);
  if (i < R.pos || i < 0 || R.results[id]) return st;
  R.order.splice(i, 1); R.order.push(id);
  return st;
}

/** Označi vse preostale (še ne odskakane) udeležence z danim statusom, npr. ob odhodu (vrne novo stanje). */
export function markAbsent(st, id, status = 'dns') {
  st = structuredClone(st);
  for (let k = st.round; k < st.rounds.length; k++) {
    const R = st.rounds[k];
    if (R.order.includes(id) && !R.results[id]) R.results[id] = { status, score: 0 };
  }
  advance(st);
  return st;
}

/** Preskoči že odskakane (npr. odsotne) in po potrebi začni naslednjo serijo. */
function advance(st) {
  for (let guard = 0; guard < 100; guard++) {
    const R = currentRound(st);
    while (R.pos < R.order.length && R.results[R.order[R.pos]]) R.pos++;
    if (R.pos < R.order.length) return;
    // serija je končana
    const scored = st.rounds.filter(r => r.kind === 'score').length;
    if (scored >= st.cfg.rounds && R.kind === 'score') { st.finished = true; return; }
    const next = nextOrder(st);
    if (!next.length) { st.finished = true; return; }
    st.rounds.push({ kind: 'score', order: next, pos: 0, results: {} });
    st.round = st.rounds.length - 1;
  }
}

/**
 * Vrstni red naslednje serije: po poskusni seriji isti kot v njej (začetni vrstni red);
 * sicer obratno po vmesni razvrstitvi (najboljši zadnji) z rezom na najboljših N.
 */
export function nextOrder(st) {
  const last = currentRound(st);
  if (last.kind === 'trial') return last.order.slice();
  const ok = standings(st).filter(r => r.status === 'ok');
  let cut = ok;
  if (st.cfg.cut > 0 && ok.length > st.cfg.cut) {
    const lim = ok[st.cfg.cut - 1].rank;
    cut = ok.filter(r => r.rank <= lim);   // izenačeni na meji gredo vsi
  }
  return cut.map(r => r.id).reverse();
}

/* ------------------------------------------------------------ razvrstitev */

/**
 * Razvrstitev po vseh točkovanih serijah do zdaj.
 * Vrstni red: udeleženci brez napake po seštevku (kot sprotna lestvica na TV: kdor je že skočil v tej seriji, ima več točk);
 * izenačeni imajo deljeno mesto. Nato DNF, DSQ, DNS (brez mesta).
 * @returns {Array<{id, name, kind, bib, team?, total, scores:number[], rounds:number, status, rank:number|null}>}
 */
export function standings(st, { uptoRound = st.rounds.length - 1 } = {}) {
  const scored = st.rounds.slice(0, uptoRound + 1).filter(r => r.kind === 'score');
  const rows = st.participants.map(p => {
    let total = 0, n = 0, status = 'ok';
    const scores = [];
    for (const R of scored) {
      const r = R.results[p.id];
      if (!R.order.includes(p.id)) continue;
      if (!r) { scores.push(null); continue; }
      if (r.status !== 'ok') { status = r.status; scores.push(null); continue; }
      total += r.score; n++; scores.push(r.score);
    }
    if (n === 0 && status === 'ok' && !scored.some(R => R.order.includes(p.id) && R.results[p.id])) status = 'pending';
    return { id: p.id, name: p.name, kind: p.kind, bib: p.bib, ...(p.team ? { team: p.team } : {}), total: Math.round(total * 10) / 10, scores, rounds: n, status };
  });
  const sgn = st.cfg.higher ? -1 : 1;
  const ord = { ok: 0, pending: 1, dnf: 2, dsq: 3, dns: 4 };
  rows.sort((a, b) => (ord[a.status] - ord[b.status]) || sgn * (a.total - b.total) || a.bib - b.bib);
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (r.status !== 'ok') { r.rank = null; return; }
    if (!prev || prev.total !== r.total) rank = i + 1;
    r.rank = rank; prev = r;
  });
  return rows;
}

/** Spremembe mest med dvema razvrstitvama: { id: +2 (gor) | −1 (dol) | 0 }. */
export function rankChanges(before, after) {
  const b = new Map(before.filter(r => r.rank).map(r => [r.id, r.rank]));
  const out = {};
  for (const r of after) if (r.rank && b.has(r.id)) out[r.id] = b.get(r.id) - r.rank;
  return out;
}

/** Ekipna razvrstitev (seštevek članov). */
export function teamStandings(st) {
  const rows = standings(st);
  const m = new Map();
  for (const r of rows) {
    if (!r.team) continue;
    const t = m.get(r.team) || { team: r.team, total: 0, members: [] };
    t.total = Math.round((t.total + (r.status === 'ok' ? r.total : 0)) * 10) / 10;
    t.members.push(r.id);
    m.set(r.team, t);
  }
  const list = [...m.values()].sort((a, b) => st.cfg.higher ? b.total - a.total : a.total - b.total);
  let rank = 0;
  list.forEach((t, i) => { if (i === 0 || list[i - 1].total !== t.total) rank = i + 1; t.rank = rank; });
  return list;
}

/** Vsi vpisani rezultati (za statistiko, nagrade): [{ id, round (indeks), num (0 = poskusna), status, score, data }]. */
export function allResults(st) {
  const out = [];
  st.rounds.forEach((R, i) => {
    const num = roundNumber(st, i);
    for (const id of R.order) { const r = R.results[id]; if (r) out.push({ id, round: i, num, ...r }); }
  });
  return out;
}

/**
 * Posebne nagrade kot vtičniki.
 * @param {Object} st
 * @param {Array<{key:string, title:string, icon?:string, pick:(results:Object[], st:Object)=>({id:string, text?:string}|null)}>} plugins
 * @returns {Array<{key, title, icon, id, text}>}
 */
export function prizes(st, plugins) {
  const res = allResults(st).filter(r => r.num > 0);
  const out = [];
  for (const pl of plugins) {
    try {
      const w = pl.pick(res, st);
      if (w && participant(st, w.id)) out.push({ key: pl.key, title: pl.title, icon: pl.icon || '🏅', id: w.id, text: w.text || '' });
    } catch { /* vtičnik ne sme podreti tekme */ }
  }
  return out;
}
