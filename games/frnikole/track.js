/* =====================================================================
   DIRKA FRNIKOL — track.js: format prog, validator, poti (glavna + razcepi), nalaganje.
   Proga je navadna proga Hrčkove krogle (map, hmap, ovire …), ki jo razume
   ../krogla/physics.js in ../krogla/render.js, z dodatki za dirko:
     path [[x, z], …]   sredinska črta glavne proge (središča ploščic)
     widths [w, …]      širina proge v vsaki točki
     splits [{ from, to, alt: [[x, z], …], w, bias, name }]   razcepi (alternativna pot med indeksoma)
     cps [i, …]         kontrolne točke (indeksi v path), finish: indeks ciljne črte
     grid [[x, z] × 8]  startna mesta · target [min, max] ciljno trajanje dirke (s)
   Čista logika (brez DOM-a).
   ===================================================================== */
import { createWorld, groundY } from '../krogla/physics.js';
import { TILE_CHARS } from '../krogla/level.js';

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isPt = p => Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1]);

/** Proga → oblika, ki jo pričakujeta createWorld in Renderer krogle. */
export function trackLevel(T) {
  return {
    ...T, set: 1, timeBonus: 60, medals: { gold: 1, silver: 2, bronze: 3 },
    start: T.grid[0], goal: T.path[T.finish], checkpoints: [], pickups: [],
  };
}

const LEVEL = new WeakMap();
/** Svet za progo (nov za vsako dirko — premične ovire imajo svoj čas). */
export function trackWorld(T) {
  let L = LEVEL.get(T);
  if (!L) { L = trackLevel(T); LEVEL.set(T, L); }
  return createWorld(L);
}

/**
 * Preveri progo. Vrne seznam napak (prazen = v redu).
 * @param {Object} T
 */
export function validateTrack(T) {
  const err = [];
  if (!T || typeof T !== 'object') return ['proga ni objekt'];
  const e = m => err.push(`proga ${T.id || '?'}: ${m}`);
  if (!/^[0-9]{2}-[a-z0-9-]+$/.test(T.id || '')) e('id mora biti oblike »NN-ime«');
  if (typeof T.name !== 'string' || T.name.length < 2) e('manjka ime');
  if (!Array.isArray(T.map) || !T.map.length) { e('manjka map'); return err; }
  const W = Math.max(...T.map.map(r => r.length)), D = T.map.length;
  if (!Array.isArray(T.size) || T.size[0] !== W || T.size[1] !== D) e(`size mora biti [${W}, ${D}]`);
  T.map.forEach((row, r) => { for (const ch of row) if (!(ch in TILE_CHARS)) e(`neznan znak »${ch}« v vrstici ${r}`); });
  if (!Array.isArray(T.hmap) || T.hmap.length !== D) e(`hmap mora imeti ${D} vrstic`);
  const tile = (x, z) => {
    const c = Math.floor(x), r = Math.floor(z);
    if (r < 0 || r >= D || c < 0 || c >= W) return 'void';
    return TILE_CHARS[T.map[r][c] ?? ' '] || 'void';
  };
  if (!Array.isArray(T.path) || T.path.length < 10 || !T.path.every(isPt)) e('path: vsaj 10 točk [x, z]');
  else {
    if (!Array.isArray(T.widths) || T.widths.length !== T.path.length || !T.widths.every(v => isNum(v) && v > 0)) e('widths: širina za vsako točko poti');
    if (!Number.isInteger(T.finish) || T.finish < 5 || T.finish >= T.path.length - 1) e('finish: indeks ciljne črte v path (ne zadnja točka)');
    if (!Array.isArray(T.cps) || !T.cps.length || !T.cps.every(i => Number.isInteger(i) && i >= 0 && i < T.path.length)) e('cps: vsaj ena kontrolna točka (indeks v path)');
    else for (const i of T.cps) { const k = tile(T.path[i][0], T.path[i][1]); if (k === 'void' || k === 'wall' || k === 'fall') e(`kontrolna točka ${i} ni na tleh (${k})`); }
    if (T.cps?.[0] !== 0) e('cps[0] mora biti 0 (start)');
    for (const [k, sp] of (T.splits || []).entries()) {
      if (!Number.isInteger(sp.from) || !Number.isInteger(sp.to) || sp.from < 1 || sp.to <= sp.from || sp.to >= T.path.length) e(`razcep ${k + 1}: from < to v path`);
      if (!Array.isArray(sp.alt) || sp.alt.length < 2 || !sp.alt.every(isPt)) e(`razcep ${k + 1}: alt mora imeti vsaj 2 točki`);
      if (!isNum(sp.w) || sp.w <= 0) e(`razcep ${k + 1}: manjka w`);
      if (T.cps?.some(i => i > sp.from && i < sp.to)) e(`razcep ${k + 1}: kontrolna točka znotraj razcepa`);
    }
  }
  if (!Array.isArray(T.grid) || T.grid.length < 8 || !T.grid.every(isPt)) e('grid: vsaj 8 startnih mest');
  else T.grid.forEach((p, i) => { const k = tile(p[0], p[1]); if (k === 'void' || k === 'wall') e(`startno mesto ${i + 1} ni na tleh`); });
  if (!Array.isArray(T.target) || T.target.length !== 2 || !(T.target[0] < T.target[1])) e('target: [min, max] sekund');
  return err;
}

/* ------------------------------------------------------------ poti */

const ROUTES = new WeakMap();

/**
 * Vse poti proge (vsaka kombinacija izbir na razcepih): ključ '' (brez razcepov) ali npr. '01'.
 * Pot: { key, n, x, z, w, cum, main, gy, cps, finish } — main = razdalja po glavni progi (za vrstni red).
 * @param {Object} T proga
 * @param {Object} [w] svet (za višine tal; če ga ni, se ustvari)
 */
export function trackRoutes(T, w) {
  let out = ROUTES.get(T);
  if (out) return out;
  w = w || trackWorld(T);
  out = new Map();
  const P = T.path, n0 = P.length;
  const mc = [0];
  for (let k = 1; k < n0; k++) mc.push(mc[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
  const S = T.splits || [];
  const combos = 1 << S.length;
  for (let c = 0; c < combos; c++) {
    const key = S.map((_, k) => (c >> k) & 1).join('');
    const pts = [], ws = [], main = [], idx = new Map();
    let k = 0;
    while (k < n0) {
      const sp = S.findIndex((s, j) => s.from === k && ((c >> j) & 1));
      idx.set(k, pts.length);
      pts.push(P[k]); ws.push(T.widths[k]); main.push(mc[k]);
      if (sp >= 0) {
        const s = S[sp];
        // alternativna pot: dolžina se preslika na glavno progo med from in to
        const a = [P[s.from], ...s.alt, P[s.to]];
        const ac = [0];
        for (let q = 1; q < a.length; q++) ac.push(ac[q - 1] + Math.hypot(a[q][0] - a[q - 1][0], a[q][1] - a[q - 1][1]));
        const tot = ac[ac.length - 1] || 1;
        for (let q = 1; q < a.length - 1; q++) { pts.push(a[q]); ws.push(s.w); main.push(mc[s.from] + (mc[s.to] - mc[s.from]) * ac[q] / tot); }
        k = s.to;
        continue;
      }
      k++;
    }
    const n = pts.length;
    const x = new Float64Array(n), z = new Float64Array(n), cum = new Float64Array(n), gy = new Float64Array(n);
    let last = 0;
    for (let q = 0; q < n; q++) {
      x[q] = pts[q][0]; z[q] = pts[q][1];
      if (q) cum[q] = cum[q - 1] + Math.hypot(x[q] - x[q - 1], z[q] - z[q - 1]);
      const h = groundY(w, x[q], z[q]);
      gy[q] = Number.isFinite(h) ? (last = h) : last;
    }
    if (!Number.isFinite(groundY(w, x[0], z[0]))) for (let q = 0; q < n && !Number.isFinite(groundY(w, x[q], z[q])); q++) gy[q] = gy.find(Number.isFinite);
    const cps = T.cps.filter(i => idx.has(i)).map(i => cum[idx.get(i)]);
    // razcepi v razdaljah te poti: [s od, s do, izbrana stranska pot?]
    const spl = S.map((s, j) => ({ s0: cum[idx.get(s.from)], s1: cum[idx.get(s.to)], alt: !!((c >> j) & 1) }));
    out.set(key, { key, n, x, z, w: Float64Array.from(ws), cum, main: Float64Array.from(main), gy, cps, spl, finish: cum[idx.get(T.finish)], len: mc[T.finish] });
  }
  ROUTES.set(T, out);
  return out;
}

/** Dolžina glavne proge do cilja (m). */
export function trackLength(T) {
  const P = T.path;
  let s = 0;
  for (let k = 1; k <= T.finish; k++) s += Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]);
  return s;
}

/**
 * Naloži proge (tracks/index.json). Za brskalnik.
 * @param {string|URL} base URL mape tracks/
 */
export async function loadTracks(base) {
  const idx = await (await fetch(new URL('index.json', base), { cache: 'no-cache' })).json();
  const list = await Promise.all(idx.tracks.map(async f => (await fetch(new URL(f, base), { cache: 'no-cache' })).json()));
  for (const T of list) {
    const errs = validateTrack(T);
    if (errs.length) console.warn('[frnikole]', errs.join('\n'));
  }
  return list;
}
