/* =====================================================================
   POTAPLJANJE LADJIC — AI (čista logika).
     mornar   — naključni streli
     kapitan  — lov + ciljanje (po zadetku sosedje, nato smer)
     admiral  — verjetnostna mapa gostote ladij, premišljene sposobnosti
   AI uporablja le javne oznake in svoje obveščevalne podatke (nikoli tujih ladij).
   ===================================================================== */

import {
  rnd, xy, idx, inB, neighbors4, neighbors8, targetsOf, unmarked, abilityCost, aliveShips, hasFleet,
} from './logic.js';

export const LEVELS = {
  mornar: { id: 'mornar', name: 'Mornar', icon: '🐟', desc: 'Strelja na slepo.' },
  kapitan: { id: 'kapitan', name: 'Kapitan', icon: '⚓', desc: 'Po zadetku preišče okolico.' },
  admiral: { id: 'admiral', name: 'Admiral', icon: '🎖️', desc: 'Računa verjetnosti in premišljeno uporablja sposobnosti.' },
};

const pick = (r, a) => a[Math.floor(r() * a.length)];

/** Polja, ki so zagotovo prazna (intel 0, ob pravilu »brez dotikanja« okolica potopljenih). */
function knownEmpty(st, me, T) {
  const out = new Set();
  const intel = me.intel[T.id] || {};
  for (const [c, v] of Object.entries(intel)) if (v === 0) out.add(+c);
  if (st.settings.noTouch) {
    for (const [c, m] of Object.entries(T.marks)) if (m === 's') for (const n of neighbors8(+c, st.size)) out.add(n);
  }
  return out;
}

/** Kandidati za strel: neodkrita polja brez zagotovo praznih. */
function candidates(st, me, T) {
  const empty = knownEmpty(st, me, T);
  const free = unmarked(st, T);
  const c = free.filter(i => !empty.has(i));
  return c.length ? c : free;
}

/** Odprti zadetki (zadeto, ne potopljeno). */
const openHits = T => Object.entries(T.marks).filter(([, m]) => m === 'h').map(([c]) => +c);

/** Ciljanje okrog zadetkov: najprej podaljšanje linije, nato sosedje. */
function targetCells(st, me, T) {
  const hits = openHits(T);
  if (!hits.length) return [];
  const ok = new Set(candidates(st, me, T));
  const size = st.size;
  const line = [];
  const hs = new Set(hits);
  for (const h of hits) {
    const [x, y] = xy(h, size);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (!hs.has(idx(x + dx, y + dy, size)) || !inB(x + dx, y + dy, size)) continue;
      // poišči oba konca linije
      let a = [x, y], b = [x + dx, y + dy];
      while (inB(a[0] - dx, a[1] - dy, size) && hs.has(idx(a[0] - dx, a[1] - dy, size))) a = [a[0] - dx, a[1] - dy];
      while (inB(b[0] + dx, b[1] + dy, size) && hs.has(idx(b[0] + dx, b[1] + dy, size))) b = [b[0] + dx, b[1] + dy];
      const ends = [[a[0] - dx, a[1] - dy], [b[0] + dx, b[1] + dy]].filter(([p, q]) => inB(p, q, size)).map(([p, q]) => idx(p, q, size));
      for (const e of ends) if (ok.has(e)) line.push(e);
    }
  }
  if (line.length) return [...new Set(line)];
  const nb = new Set();
  for (const h of hits) for (const n of neighbors4(h, size)) if (ok.has(n)) nb.add(n);
  return [...nb];
}

/** Velikosti še nepotopljenih ladij (iz potopljenih skupin 's'). */
function remainingSizes(st, T) {
  const rem = st.fleet.slice();
  const sunk = (T.ships || []).filter(s => s.sunk).map(s => s.size);   // potopljene ladje so javne (oznaka 's')
  for (const s of sunk) { const k = rem.indexOf(s); if (k >= 0) rem.splice(k, 1); }
  return rem.length ? rem : [Math.min(...st.fleet)];
}

/**
 * Verjetnostna mapa gostote ladij za tarčo.
 * @returns {Float64Array} teža za vsako polje (0 za odkrita)
 */
export function densityMap(st, me, T) {
  const size = st.size;
  const dens = new Float64Array(size * size);
  const empty = knownEmpty(st, me, T);
  const intel = me.intel[T.id] || {};
  const hits = new Set(openHits(T));
  const blocked = c => (T.marks[c] != null && T.marks[c] !== 'h') || empty.has(c);
  for (const len of remainingSizes(st, T)) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      for (const v of [false, true]) {
        if (v ? y + len > size : x + len > size) continue;
        let okp = true, nh = 0, ni = 0;
        const cells = [];
        for (let k = 0; k < len; k++) {
          const c = idx(x + (v ? 0 : k), y + (v ? k : 0), size);
          if (blocked(c)) { okp = false; break; }
          if (hits.has(c)) nh++;
          if (intel[c] === 1) ni++;
          cells.push(c);
        }
        if (!okp) continue;
        if (hits.size && !nh) continue;   // ob odprtih zadetkih štejejo le postavitve, ki jih pokrijejo
        const w = (1 + nh * 30) * (1 + ni * 4);
        for (const c of cells) if (T.marks[c] == null) dens[c] += w;
      }
    }
  }
  for (const [c, v] of Object.entries(intel)) if (v === 1 && T.marks[c] == null) dens[c] += 50;
  return dens;
}

function argmax(dens, cells, r) {
  let best = -1, out = [];
  for (const c of cells) {
    const v = dens[c];
    if (v > best + 1e-9) { best = v; out = [c]; } else if (Math.abs(v - best) < 1e-9) out.push(c);
  }
  return out.length ? pick(r, out) : null;
}

/** Izbira tarče (BR): kjer so odprti zadetki, sicer najšibkejši ali naključni. */
function chooseTarget(st, me, level, r) {
  const ts = targetsOf(st, me);
  if (!ts.length) return null;
  if (level === 'mornar') return pick(r, ts);
  const withHits = ts.filter(t => openHits(t).length);
  if (withHits.length) return pick(r, withHits);
  if (level === 'admiral') {
    const min = Math.min(...ts.map(t => aliveShips(t).length));
    return pick(r, ts.filter(t => aliveShips(t).length === min));
  }
  return pick(r, ts);
}

/** Najboljši strel na tarčo. */
export function bestShot(st, me, T, level, r) {
  const cand = candidates(st, me, T);
  if (!cand.length) return null;
  if (level === 'mornar') return pick(r, unmarked(st, T));
  if (level === 'admiral') return argmax(densityMap(st, me, T), cand, r);
  const tgt = targetCells(st, me, T);
  if (tgt.length) return pick(r, tgt);
  const intel = me.intel[T.id] || {};
  const known = cand.filter(c => intel[c] === 1);
  if (known.length) return pick(r, known);
  const parity = cand.filter(c => { const [x, y] = xy(c, st.size); return (x + y) % 2 === 0; });
  return pick(r, parity.length ? parity : cand);
}

/** Prosto polje na lastni mreži (za vabo/mino). */
function freeOwnCells(st, me) {
  const used = new Set([...(me.ships || []).flatMap(s => s.cells), ...me.decoys.flatMap(d => d.cells), ...me.mines, ...me.crates]);
  const out = [];
  for (let i = 0; i < st.size * st.size; i++) if (!used.has(i) && me.marks[i] == null) out.push(i);
  return out;
}

/** Sposobnost, če se splača (ali null). */
function abilityAction(st, me, level, T, r) {
  if (level === 'mornar') return null;
  const cost = abilityCost(st, me);
  if (me.mana < cost) return null;
  const busy = openHits(T).length > 0;
  const kap = level === 'kapitan';
  if (kap && r() < 0.5) return null;
  const size = st.size;
  switch (me.captain) {
    case 'sonar': {
      if (busy) return null;
      const dens = level === 'admiral' ? densityMap(st, me, T) : null;
      let best = null, bv = -1;
      const intel = me.intel[T.id] || {};
      for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
        let v = 0, unk = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const c = idx(x + dx, y + dy, size);
          if (T.marks[c] == null && intel[c] == null) { unk++; v += dens ? dens[c] : 1; }
        }
        if (unk >= 6 && v > bv + (kap ? r() * 2 : 0)) { bv = v; best = idx(x, y, size); }
      }
      return best == null ? null : { t: 'ability', target: T.id, cell: best };
    }
    case 'torpedo': {
      if (busy) return null;
      let best = null, bv = -1;
      for (const dir of ['r', 'c']) for (let i = 0; i < size; i++) {
        let n = 0;
        for (let k = 0; k < size; k++) { const c = dir === 'r' ? idx(k, i, size) : idx(i, k, size); if (T.marks[c] == null) n++; }
        if (n > bv) { bv = n; best = { dir, i }; }
      }
      return bv >= Math.ceil(size / 2) ? { t: 'ability', target: T.id, line: best } : null;
    }
    case 'kasetna': {
      if (busy && level === 'admiral') return null;
      const ts = targetsOf(st, me);
      const tt = ts.reduce((a, b) => (unmarked(st, b).length > unmarked(st, a).length ? b : a), ts[0]);
      return { t: 'ability', target: tt.id };
    }
    case 'emp': {
      const ts = targetsOf(st, me).filter(t => t.id !== me.lastEmp);
      if (!ts.length) return null;
      if (level === 'admiral' && me.mana < 8 && ts.length < 2) return null;
      return { t: 'ability', target: pick(r, ts).id };
    }
    case 'popravilo': {
      const hit = (me.ships || []).filter(s => !s.sunk).flatMap(s => s.cells.filter((c, j) => s.hits[j]));
      return hit.length ? { t: 'ability', cell: pick(r, hit) } : null;
    }
    case 'vaba': {
      if (me.decoys.length) return null;
      const free = freeOwnCells(st, me);
      return free.length ? { t: 'ability', cell: pick(r, free), vertical: r() < 0.5 } : null;
    }
    default: return null;
  }
}

/**
 * Naslednje dejanje AI igralca na potezi.
 * @param {Object} st stanje
 * @param {string} pid id AI igralca
 * @param {'mornar'|'kapitan'|'admiral'} level
 * @param {() => number} [r] naključje (privzeto PRNG stanja — deterministično)
 */
export function chooseAction(st, pid, level = 'kapitan', r = () => rnd(st)) {
  const me = st.players.find(p => p.id === pid);
  if (!me || !me.alive) return null;
  const T = chooseTarget(st, me, level, r);
  if (!T) return null;
  // predmeti (ne porabijo poteze)
  if (level !== 'mornar' && me.inv.length) {
    const it = me.inv[0];
    if (it === 'scit' && !me.shield) return { t: 'item', item: 'scit' };
    if (it === 'dvojni') return { t: 'item', item: 'dvojni' };
    if (it === 'radar') return { t: 'item', item: 'radar', target: T.id };
    if (it === 'mina') {
      const free = freeOwnCells(st, me);
      if (free.length) return { t: 'item', item: 'mina', cell: pick(r, free) };
    }
  }
  const ab = abilityAction(st, me, level, T, r);
  if (ab) return ab;
  const cell = bestShot(st, me, T, level, r);
  return cell == null ? null : { t: 'shot', target: T.id, cell };
}

/** Ali AI predmeta ne more uporabiti (da se zanka ne zatakne). */
export const isFreeAction = a => a?.t === 'item';
export { hasFleet };

/**
 * En korak AI: izbere in izvede dejanje (ob neveljavnem dejanju naključen strel).
 * @returns {{a:Object, res:{ok:boolean, ev:any[]}}|null}
 */
export function aiStep(st, pid, level, act, randomShot) {
  let a = chooseAction(st, pid, level);
  if (!a) return null;
  let res = act(st, pid, a);
  if (!res.ok) {
    a = randomShot(st, pid);
    if (!a) return null;
    res = act(st, pid, a);
  }
  return { a, res };
}
