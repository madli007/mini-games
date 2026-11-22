/* =====================================================================
   HRČKOVA KROGLA — editor/model.js: čista logika urejevalnika prog (brez DOM-a).
   Dela neposredno na formatu proge (games/krogla/README.md), brez vmesnega formata.
   Testi: tests/tests.js (»krogla urejevalnik: …«).
   ===================================================================== */
import { TILE_CHARS, DIRS, heightOf, heightChar } from '../level.js';
import { THEMES } from '../themes.js';

const clone = o => JSON.parse(JSON.stringify(o));
const isNum = v => typeof v === 'number' && Number.isFinite(v);
export const MAX_W = 120, MAX_D = 160;

/* ===================================================================== */
/*  Ploščice (paleta)                                                    */
/* ===================================================================== */

/** Paleta ploščic: znak, ime, kratka oznaka in barva za tloris. */
export const TILES = [
  { ch: ' ', name: 'Praznina', icon: '⬛', color: null },
  { ch: '.', name: 'Tla', icon: '⬜', color: '#8b8fb8' },
  { ch: '#', name: 'Zid', icon: '🧱', color: '#d0457e' },
  { ch: '^', name: 'Klančina ↑ (sever)', icon: '⬆', color: '#b7a36b' },
  { ch: 'v', name: 'Klančina ↓ (jug)', icon: '⬇', color: '#b7a36b' },
  { ch: '<', name: 'Klančina ← (zahod)', icon: '⬅', color: '#b7a36b' },
  { ch: '>', name: 'Klančina → (vzhod)', icon: '➡', color: '#b7a36b' },
  { ch: 'i', name: 'Led', icon: '🧊', color: '#9fe3ff' },
  { ch: 'g', name: 'Lepilo', icon: '🟩', color: '#8fdc3a' },
  { ch: '~', name: 'Valovita tla', icon: '〰', color: '#a98bd8' },
  { ch: 'x', name: 'Padajoča ploščica', icon: '⚠', color: '#e05a5a' },
  { ch: 'N', name: 'Trak ↑ (sever)', icon: '⏫', color: '#c98a2a' },
  { ch: 'S', name: 'Trak ↓ (jug)', icon: '⏬', color: '#c98a2a' },
  { ch: 'W', name: 'Trak ← (zahod)', icon: '⏪', color: '#c98a2a' },
  { ch: 'E', name: 'Trak → (vzhod)', icon: '⏩', color: '#c98a2a' },
];
export const tileInfo = ch => TILES.find(t => t.ch === ch) || TILES[0];
const RAMP_TO = { '0,-1': '^', '0,1': 'v', '-1,0': '<', '1,0': '>' };

/* ===================================================================== */
/*  Nova proga, normalizacija                                            */
/* ===================================================================== */

/** Slug iz imena: »Moja proga!« → »moja-proga«. */
export function slugify(s) {
  const map = { č: 'c', š: 's', ž: 'z', ć: 'c', đ: 'd' };
  return String(s || '').toLowerCase().replace(/[čšžćđ]/g, c => map[c]).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proga';
}

/** Id proge iz številke in imena (format validatorja: NN-ime). */
export function makeId(num, name) {
  const n = Math.max(0, Math.min(99, Math.floor(Number(num) || 0)));
  return String(n).padStart(2, '0') + '-' + slugify(name);
}

/**
 * Nova proga: kratka pot s startom in ciljem (takoj prevozna, a brez 5 zvezdic).
 * @param {{name?:string, W?:number, D?:number, theme?:string, num?:number}} [o]
 */
export function newLevel({ name = 'Nova proga', W = 15, D = 22, theme = 'vrt', num = 20 } = {}) {
  W = Math.max(5, Math.min(MAX_W, W | 0)); D = Math.max(5, Math.min(MAX_D, D | 0));
  const map = [], hmap = [];
  const c0 = Math.floor(W / 2) - 1;
  for (let r = 0; r < D; r++) {
    let row = '';
    for (let c = 0; c < W; c++) row += (r >= 1 && r <= D - 2 && c >= c0 && c < c0 + 3) ? '.' : ' ';
    map.push(row); hmap.push('0'.repeat(W));
  }
  const cx = c0 + 1.5;
  return {
    id: makeId(num, name), name, set: 1, desc: '',
    size: [W, D],
    theme: { ...THEMES[theme] || THEMES.vrt },
    timeBonus: 30, medals: { gold: 15, silver: 20, bronze: 26 },
    map, hmap,
    start: [cx, D - 2.5], goal: [cx, 2.5], checkpoints: [],
    pickups: [],
    route: [{ x: cx, z: 2.5, speed: 5 }],
  };
}

/**
 * Normaliziraj progo (na mestu): vrstice map na isto širino, hmap poravnan z map, size iz map.
 * Že normalizirane proge (vse uradne) ostanejo bajtno enake.
 */
export function normalize(L) {
  if (!Array.isArray(L.map) || !L.map.length) L.map = [' '];
  const W = Math.max(1, ...L.map.map(r => String(r).length));
  const D = L.map.length;
  L.map = L.map.map(r => String(r).padEnd(W, ' '));
  if (L.hmap) {
    const hm = [];
    for (let r = 0; r < D; r++) hm.push(String(L.hmap[r] ?? '').padEnd(W, '0').slice(0, W).replace(/ /g, '0'));
    L.hmap = hm;
  }
  if (!Array.isArray(L.size) || L.size[0] !== W || L.size[1] !== D) L.size = [W, D];
  return L;
}

/* ===================================================================== */
/*  Ploščice in višine                                                   */
/* ===================================================================== */

export const inside = (L, c, r) => c >= 0 && r >= 0 && c < L.size[0] && r < L.size[1];
export const tileAt = (L, c, r) => inside(L, c, r) ? (L.map[r][c] ?? ' ') : ' ';
export const heightAt = (L, c, r) => inside(L, c, r) && L.hmap ? (heightOf(L.hmap[r][c] ?? '0') || 0) : 0;

const setChar = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);

/** Postavi ploščico. Vrne true, če se je kaj spremenilo. */
export function setTile(L, c, r, ch) {
  if (!inside(L, c, r) || !(ch in TILE_CHARS)) return false;
  if (L.map[r][c] === ch) return false;
  L.map[r] = setChar(L.map[r], c, ch);
  return true;
}

function ensureHmap(L) {
  if (!L.hmap) L.hmap = L.map.map(r => '0'.repeat(r.length));
}

/** Nastavi višino (0–17,5, korak 0,5). */
export function setHeight(L, c, r, h) {
  if (!inside(L, c, r)) return false;
  ensureHmap(L);
  const ch = heightChar(Math.max(0, Math.min(17.5, Math.round(h * 2) / 2)));
  if (L.hmap[r][c] === ch) return false;
  L.hmap[r] = setChar(L.hmap[r], c, ch);
  return true;
}

/** Celice čopiča velikosti n (kvadrat n×n s središčem v c, r). */
export function brushCells(c, r, n = 1) {
  const out = [], lo = -Math.floor((n - 1) / 2);
  for (let dr = lo; dr < lo + n; dr++) for (let dc = lo; dc < lo + n; dc++) out.push([c + dc, r + dr]);
  return out;
}

/** Celice pravokotnika med dvema kotoma. */
export function rectCells(c0, r0, c1, r1) {
  const out = [];
  for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++) for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) out.push([c, r]);
  return out;
}

/** Zapolni (flood fill, 4-sosedstvo) področje istega znaka (in iste višine, če byHeight). Vrne število celic. */
export function floodFill(L, c, r, ch, { byHeight = false } = {}) {
  if (!inside(L, c, r)) return 0;
  const from = tileAt(L, c, r), h0 = heightAt(L, c, r);
  if (from === ch) return 0;
  const [W, D] = L.size;
  const seen = new Uint8Array(W * D);
  const st = [[c, r]];
  let n = 0;
  while (st.length) {
    const [x, y] = st.pop();
    if (!inside(L, x, y) || seen[y * W + x]) continue;
    seen[y * W + x] = 1;
    if (tileAt(L, x, y) !== from || (byHeight && heightAt(L, x, y) !== h0)) continue;
    setTile(L, x, y, ch); n++;
    st.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  return n;
}

/**
 * Klančina med celicama A in B (ista vrstica ali stolpec): iz višin A in B samodejno postavi znake klančin
 * in višine vmesnih celic (vsaka klančina dvigne za 0,5). Širina w pravokotno na smer.
 * @returns {{ok:boolean, msg?:string, cells:number}}
 */
export function smoothRamp(L, a, b, w = 1) {
  const [ca, ra] = a, [cb, rb] = b;
  if (ca !== cb && ra !== rb) return { ok: false, msg: 'Klančina mora biti v isti vrstici ali stolpcu.', cells: 0 };
  const dx = Math.sign(cb - ca), dz = Math.sign(rb - ra);
  const n = Math.abs(cb - ca) + Math.abs(rb - ra) - 1;   // vmesne celice
  if (n < 1) return { ok: false, msg: 'Med točkama mora biti vsaj ena ploščica.', cells: 0 };
  const hA = heightAt(L, ca, ra), hB = heightAt(L, cb, rb);
  const k = Math.round(Math.abs(hB - hA) * 2);           // število klančin
  const px = -dz, pz = dx, lo = -Math.floor((w - 1) / 2);
  const put = (i, ch, h) => {
    for (let s = lo; s < lo + w; s++) {
      const c = ca + dx * i + px * s, r = ra + dz * i + pz * s;
      if (!inside(L, c, r)) continue;
      const cur = tileAt(L, c, r);
      if (ch === '.' && cur !== ' ' && !'^v<>#'.includes(cur)) { setHeight(L, c, r, h); continue; }   // led, lepilo … ostanejo
      setTile(L, c, r, ch); setHeight(L, c, r, h);
    }
  };
  const up = hB > hA;
  const rise = up ? RAMP_TO[dx + ',' + dz] : RAMP_TO[-dx + ',' + -dz];
  const used = Math.min(k, n);
  for (let i = 1; i <= n; i++) {
    if (up) {
      // klančine takoj za A: višine (nižji konec) hA, hA+0,5, …
      if (i <= used) put(i, rise, hA + (i - 1) * 0.5); else put(i, '.', hA + used * 0.5);
    } else {
      // klančine tik pred B, dvig proti A: nižji konci … hB+0,5, hB
      const j = n - i;   // 0 = celica tik pred B
      if (j < used) put(i, rise, hB + j * 0.5); else put(i, '.', hB + used * 0.5);
    }
  }
  if (k > n) return { ok: true, msg: `Razlika višin (${(Math.abs(hB - hA)).toFixed(1).replace('.', ',')}) potrebuje ${k} klančin, prostora je za ${n}.`, cells: n };
  return { ok: true, cells: n };
}

/** Vrh ploščice v točki (x, z), ki je lahko na robu ploščice (kot tileTop v physics.js, brez dinamike). */
function topAt(L, c, r, x, z) {
  const ch = tileAt(L, c, r);
  const t = TILE_CHARS[ch];
  if (t === 'void') return null;
  let h = heightAt(L, c, r);
  if (t === 'ramp') {
    const [dx, dz] = DIRS[ch];
    let f = dx > 0 ? x - c : dx < 0 ? c + 1 - x : dz > 0 ? z - r : r + 1 - z;
    h += 0.5 * Math.min(1, Math.max(0, f));
  }
  if (t === 'wall') return null;
  return h;
}

/**
 * Mesta, kjer se sosednji prevozni ploščici na skupnem robu razlikujeta za več kot krogla prevozi (stopnica > 0,22).
 * @returns {{c:number, r:number, c2:number, r2:number, diff:number}[]}
 */
export function heightWarnings(L, step = 0.22) {
  const out = [];
  const [W, D] = L.size;
  for (let r = 0; r < D; r++) for (let c = 0; c < W; c++) {
    for (const [dc, dr] of [[1, 0], [0, 1]]) {
      const c2 = c + dc, r2 = r + dr;
      if (!inside(L, c2, r2)) continue;
      // točki na skupnem robu
      const pts = dc ? [[c + 1, r + 0.02], [c + 1, r + 0.98]] : [[c + 0.02, r + 1], [c + 0.98, r + 1]];
      let diff = 0, bad = false;
      for (const [x, z] of pts) {
        const a = topAt(L, c, r, x, z), b = topAt(L, c2, r2, x, z);
        if (a == null || b == null) { bad = true; break; }
        diff = Math.max(diff, Math.abs(a - b));
      }
      if (!bad && diff > step + 1e-6) out.push({ c, r, c2, r2, diff });
    }
  }
  return out;
}

/* ===================================================================== */
/*  Velikost mreže                                                       */
/* ===================================================================== */

/** Premakni vse koordinate proge za (dx, dz) — objekti, start, cilj, kontrolne točke, poti, route. */
export function shiftLevel(L, dx, dz) {
  const P = p => { p[0] += dx; p[1] += dz; };
  const P3 = p => { p[0] += dx; p[2] += dz; };
  const XZ = o => { if (isNum(o.x)) o.x += dx; if (isNum(o.z)) o.z += dz; };
  if (L.start) P(L.start);
  if (L.goal) P(L.goal);
  (L.checkpoints || []).forEach(P);
  for (const k of ['pickups', 'spinners', 'springs', 'fans', 'bumpers', 'bowls', 'hammers', 'switches', 'doors', 'blocks']) (L[k] || []).forEach(XZ);
  (L.movers || []).forEach(m => (m.path || []).forEach(P3));
  (L.enemies || []).forEach(en => { XZ(en); (en.path || []).forEach(P); });
  (L.route || []).forEach(w => { if (w.mover == null) XZ(w); });
}

/**
 * Spremeni velikost mreže: pozitivno doda vrstice/stolpce na tisti strani, negativno jih odstrani.
 * Vse koordinate (objekti, start, cilj, poti) se premaknejo, da ostanejo na istih ploščicah.
 * @param {{left?:number, right?:number, top?:number, bottom?:number}} d top = sever (vrstica 0)
 */
export function resizeLevel(L, { left = 0, right = 0, top = 0, bottom = 0 } = {}) {
  normalize(L);
  const [W, D] = L.size;
  const W2 = W + left + right, D2 = D + top + bottom;
  if (W2 < 3 || D2 < 3) return false;
  if (W2 > MAX_W || D2 > MAX_D) return false;
  const row = (s, pad) => {
    let x = s;
    x = left >= 0 ? pad.repeat(left) + x : x.slice(-left);
    x = right >= 0 ? x + pad.repeat(right) : x.slice(0, x.length + right);
    return x;
  };
  const rows = (arr, fill) => {
    const blank = n => Array.from({ length: n }, () => fill.repeat(W2));
    let a = arr.map(s => row(s, fill));
    a = top >= 0 ? [...blank(top), ...a] : a.slice(-top);
    a = bottom >= 0 ? [...a, ...blank(bottom)] : a.slice(0, a.length + bottom);
    return a;
  };
  L.map = rows(L.map, ' ');
  if (L.hmap) L.hmap = rows(L.hmap, '0');
  L.size = [W2, D2];
  shiftLevel(L, left, top);
  return true;
}

/* ===================================================================== */
/*  Objekti                                                              */
/* ===================================================================== */

const F = (key, label, o = {}) => ({ key, label, type: 'num', step: 0.1, ...o });
const DIRF = { key: 'dir', label: 'Smer', type: 'dir' };

/**
 * Tipi objektov: kje živijo v progi (arr, za sovražnike t), privzete vrednosti (iz obstoječih prog),
 * polja za ploščo lastnosti in oblika za tloris.
 * shape: 'dot' | 'circle'(r) | 'rect'(x,z = levi zgornji kot, w, d) | 'mover'(središče, size) | 'cone'(vacuum) | 'fan'
 */
export const KINDS = {
  start: { name: 'Start', icon: '🐹', arr: 'start', single: true, color: '#39ff88' },
  goal: { name: 'Cilj', icon: '🏁', arr: 'goal', single: true, color: '#ffd23f' },
  checkpoint: { name: 'Kontrolna točka', icon: '🚩', arr: 'checkpoints', point: true, color: '#4de1ff' },
  star: { name: 'Zvezdica', icon: '⭐', arr: 'pickups', match: { t: 'star' }, def: { t: 'star' }, fields: [F('y', 'Višina y (prazno = tla)', { opt: true, min: 0, max: 20 })], color: '#ffd23f' },
  clock: { name: 'Ura (+3 s)', icon: '⏱️', arr: 'pickups', match: { t: 'clock' }, def: { t: 'clock' }, fields: [F('y', 'Višina y (prazno = tla)', { opt: true, min: 0, max: 20 })], color: '#39ff88' },
  mover: {
    name: 'Premična plošča', icon: '🟫', arr: 'movers', path: 3, shape: 'mover', color: '#ffb35c',
    def: { path: [[0, 0, 0], [4, 0, 0]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 },
    fields: [F('size.0', 'Širina', { min: 1, max: 8, step: 0.5 }), F('size.1', 'Globina', { min: 1, max: 8, step: 0.5 }),
      F('speed', 'Hitrost', { min: 0.2, max: 8 }), F('pause', 'Postanek na koncu (s)', { min: 0, max: 10 }),
      F('phase', 'Faza (0–1)', { min: 0, max: 1, step: 0.05 }), { key: 'loop', label: 'Zanka (sicer tja in nazaj)', type: 'bool' }],
  },
  spinner: {
    name: 'Vrtiljak', icon: '🌀', arr: 'spinners', shape: 'circle', color: '#a78bfa',
    def: { r: 2.55, y: 0, speed: 0.6 },
    fields: [F('r', 'Polmer', { min: 0.5, max: 6, step: 0.05 }), F('y', 'Višina', { min: 0, max: 20, step: 0.5 }), F('speed', 'Hitrost (rad/s, − = obratno)', { min: -4, max: 4, step: 0.05 })],
  },
  spring: {
    name: 'Vzmet', icon: '🔼', arr: 'springs', dir: true, color: '#39ff88',
    def: { dir: [0, -1], power: 8.5, up: 7 },
    fields: [DIRF, F('power', 'Moč naprej', { min: 0, max: 20, step: 0.5 }), F('up', 'Moč navzgor', { min: 0, max: 20, step: 0.5 })],
  },
  fan: {
    name: 'Ventilator', icon: '💨', arr: 'fans', dir: true, shape: 'fan', color: '#9fe8ff',
    def: { dir: [0, 1], len: 3.6, width: 1.6, force: 8 },
    fields: [DIRF, F('len', 'Doseg', { min: 0.5, max: 15 }), F('width', 'Širina', { min: 0.3, max: 6 }), F('force', 'Moč', { min: 0, max: 30, step: 0.5 }), F('y', 'Višina y (prazno = vse)', { opt: true, min: 0, max: 20 })],
  },
  bumper: {
    name: 'Odbijač', icon: '🔴', arr: 'bumpers', shape: 'circle', color: '#ff4fd8',
    def: { r: 0.4, power: 7 },
    fields: [F('r', 'Polmer', { min: 0.2, max: 2, step: 0.05 }), F('power', 'Moč', { min: 0, max: 20, step: 0.5 })],
  },
  bowl: {
    name: 'Skleda', icon: '🥣', arr: 'bowls', shape: 'circle', color: '#ffd9a8',
    def: { r: 2, depth: 0.7 },
    fields: [F('r', 'Polmer', { min: 0.5, max: 6, step: 0.1 }), F('depth', 'Globina', { min: 0.1, max: 2, step: 0.05 })],
  },
  hammer: {
    name: 'Kladivo', icon: '🔨', arr: 'hammers', dir: true, shape: 'rect', color: '#ff3b5c', grid: 1,
    def: { w: 3, d: 1, period: 3, phase: 0, dir: [1, 0] },
    fields: [F('w', 'Širina', { min: 1, max: 8, step: 1 }), F('d', 'Globina', { min: 1, max: 8, step: 1 }), F('period', 'Perioda (s)', { min: 0.5, max: 10 }),
      F('phase', 'Faza (0–1)', { min: 0, max: 1, step: 0.05 }), DIRF],
  },
  switch: {
    name: 'Stikalo', icon: '🔘', arr: 'switches', color: '#39ff88',
    def: { id: 'a' }, fields: [{ key: 'id', label: 'Id (poveže z vrati)', type: 'text' }],
  },
  door: {
    name: 'Vrata', icon: '🚪', arr: 'doors', shape: 'rect', color: '#4de1ff', grid: 1,
    def: { w: 3, d: 1, y: 0, h: 1.2, id: 'a' },
    fields: [{ key: 'id', label: 'Id (poveže s stikalom)', type: 'text' }, F('w', 'Širina', { min: 0.2, max: 8, step: 0.5 }), F('d', 'Globina', { min: 0.2, max: 8, step: 0.5 }),
      F('y', 'Spodnji rob y', { min: 0, max: 20, step: 0.5 }), F('h', 'Višina', { min: 0.2, max: 5 })],
  },
  block: {
    name: 'Kvader', icon: '◼️', arr: 'blocks', shape: 'rect', color: '#d0457e', grid: 0.5,
    def: { w: 1, d: 1, y0: 0, y1: 1.2 },
    fields: [F('w', 'Širina', { min: 0.1, max: 20, step: 0.1 }), F('d', 'Globina', { min: 0.1, max: 20, step: 0.1 }), F('y0', 'Spodaj y0', { min: 0, max: 20, step: 0.1 }), F('y1', 'Zgoraj y1', { min: 0, max: 25, step: 0.1 })],
  },
  bully: {
    name: 'Nasilnež', icon: '😠', arr: 'enemies', match: { t: 'bully' }, shape: 'zone', color: '#ff3b5c',
    def: { t: 'bully', zone: 5 },
    fields: [F('zone', 'Območje lova (polmer)', { min: 1, max: 15, step: 0.5 }), F('accel', 'Pospešek (prazno = 7,5)', { opt: true, min: 1, max: 15, step: 0.5 })],
  },
  saw: {
    name: 'Žaga', icon: '🪚', arr: 'enemies', match: { t: 'saw' }, path: 2, color: '#ff3b5c',
    def: { t: 'saw', path: [[0, 0], [4, 0]], loop: false, speed: 2.6, phase: 0 },
    fields: [F('speed', 'Hitrost', { min: 0.2, max: 10 }), F('phase', 'Faza (0–1)', { min: 0, max: 1, step: 0.05 }), { key: 'loop', label: 'Zanka (sicer tja in nazaj)', type: 'bool' }],
  },
  wasp: {
    name: 'Osa', icon: '🐝', arr: 'enemies', match: { t: 'wasp' }, path: 2, color: '#ffd23f',
    def: { t: 'wasp', path: [[0, 0], [3, 0], [3, 3], [0, 3]], speed: 2, loop: true },
    fields: [F('speed', 'Hitrost', { min: 0.2, max: 10 }), F('phase', 'Faza (0–1)', { opt: true, min: 0, max: 1, step: 0.05 }), { key: 'loop', label: 'Zanka', type: 'bool' }],
  },
  vacuum: {
    name: 'Sesalec', icon: '🌪️', arr: 'enemies', match: { t: 'vacuum' }, dir: true, shape: 'cone', color: '#a78bfa',
    def: { t: 'vacuum', dir: [0, -1], range: 4, angle: 45, force: 7 },
    fields: [DIRF, F('range', 'Doseg', { min: 1, max: 15, step: 0.5 }), F('angle', 'Kot (°)', { min: 5, max: 90, step: 1 }), F('force', 'Moč', { min: 0, max: 30, step: 0.5 })],
  },
  magnet: {
    name: 'Magnet', icon: '🧲', arr: 'enemies', match: { t: 'magnet' }, shape: 'range', color: '#ff4fd8',
    def: { t: 'magnet', mode: 'pull', period: 3, duty: 0.4, range: 3.5, force: 10 },
    fields: [{ key: 'mode', label: 'Način', type: 'select', options: [['pull', 'Privlači'], ['push', 'Odbija']] },
      F('period', 'Perioda (s)', { min: 0.5, max: 10 }), F('duty', 'Delež vklopa (0–1)', { min: 0.05, max: 1, step: 0.05 }),
      F('phase', 'Faza (0–1)', { opt: true, min: 0, max: 1, step: 0.05 }), F('range', 'Doseg', { min: 0.5, max: 10, step: 0.5 }), F('force', 'Moč', { min: 0, max: 30, step: 0.5 })],
  },
};
export const KIND_ORDER = ['start', 'goal', 'checkpoint', 'star', 'clock', 'mover', 'spinner', 'spring', 'fan', 'bumper', 'bowl', 'hammer', 'switch', 'door', 'block', 'bully', 'saw', 'wasp', 'vacuum', 'magnet'];

/** Polja točke poti autopilota. */
export const ROUTE_FIELDS = [
  F('speed', 'Hitrost (prazno = 5)', { opt: true, min: 0.5, max: 13, step: 0.5 }),
  F('r', 'Polmer dosega (prazno = 0,5)', { opt: true, min: 0.1, max: 3, step: 0.05 }),
  { key: 'stop', label: 'Ustavi se na točki', type: 'bool' },
  F('wait', 'Počakaj (s)', { opt: true, min: 0, max: 30, step: 0.1 }),
  { key: 'until', label: 'Čakaj na okno [perioda, od, do]', type: 'until' },
  { key: 'mover', label: 'Na premični plošči (indeks, x/z sta odmik)', type: 'int', opt: true, min: 0, max: 50 },
];

/** Vrsta objekta iz reference { arr, i }. */
export function kindOf(L, ref) {
  if (!ref) return null;
  if (ref.arr === 'start') return 'start';
  if (ref.arr === 'goal') return 'goal';
  if (ref.arr === 'checkpoints') return 'checkpoint';
  const o = L[ref.arr]?.[ref.i];
  if (!o) return null;
  if (ref.arr === 'pickups') return o.t === 'clock' ? 'clock' : 'star';
  if (ref.arr === 'enemies') return o.t;
  return Object.keys(KINDS).find(k => KINDS[k].arr === ref.arr) || null;
}

/** Objekt (za start/goal/checkpoint vrne točko [x, z]). */
export function getObj(L, ref) {
  if (ref.arr === 'start' || ref.arr === 'goal') return L[ref.arr];
  return L[ref.arr]?.[ref.i];
}

/** Sidrišče objekta [x, z] (premična plošča: prva točka poti, žaga/osa: prva točka). */
export function objPos(L, ref) {
  const o = getObj(L, ref);
  if (!o) return null;
  if (Array.isArray(o)) return [o[0], o[1]];
  if (o.path) return ref.arr === 'movers' ? [o.path[0][0], o.path[0][2]] : [o.path[0][0], o.path[0][1]];
  return [o.x, o.z];
}

/** Središče za risanje/izbiro (pravokotniki: središče kvadra). */
export function objCenter(L, ref) {
  const o = getObj(L, ref);
  const k = kindOf(L, ref);
  if (!o) return null;
  if (KINDS[k]?.shape === 'rect') return [o.x + o.w / 2, o.z + o.d / 2];
  return objPos(L, ref);
}

/** Premakni objekt tako, da je sidrišče v (x, z). Poti se premaknejo v celoti. */
export function moveObj(L, ref, x, z) {
  const o = getObj(L, ref);
  if (!o) return false;
  const p = objPos(L, ref);
  const dx = x - p[0], dz = z - p[1];
  if (!dx && !dz) return false;
  if (Array.isArray(o)) { o[0] = x; o[1] = z; return true; }
  if (o.path) {
    if (ref.arr === 'movers') o.path.forEach(q => { q[0] += dx; q[2] += dz; });
    else o.path.forEach(q => { q[0] += dx; q[1] += dz; });
    return true;
  }
  o.x = x; o.z = z;
  return true;
}

/** Zaokroži na korak (privzeto 0,5 — središča in robovi ploščic). */
export const snap = (v, s = 0.5) => Math.round(v / s) * s;

/**
 * Dodaj objekt vrste kind v (x, z). Vrne referenco { arr, i }.
 * Pravokotniki (kladivo, vrata, kvader) dobijo levi zgornji kot tako, da je (x, z) središče.
 */
export function addObj(L, kind, x, z) {
  const K = KINDS[kind];
  if (!K) return null;
  if (K.single) { L[K.arr] = [x, z]; return { arr: K.arr }; }
  if (kind === 'checkpoint') { (L.checkpoints ||= []).push([x, z]); return { arr: 'checkpoints', i: L.checkpoints.length - 1 }; }
  const d = clone(K.def);
  const h = heightAtXZ(L, x, z);
  let o;
  if (d.path) {
    o = d;
    o.path = K.path === 3 ? d.path.map(p => [p[0] + x, h, p[2] + z]) : d.path.map(p => [p[0] + x, p[1] + z]);
  } else if (K.shape === 'rect') {
    const g = K.grid || 0.5;
    o = { x: snap(x - d.w / 2, g), z: snap(z - d.d / 2, g), ...d };
    if ('y' in o) o.y = h;
    if ('y0' in o) { o.y0 = h; o.y1 = Math.round((h + 1.2) * 10) / 10; }
  } else {
    const { t, ...rest } = d;
    o = t ? { t, x, z, ...rest } : { x, z, ...rest };
    if (kind === 'spinner') o.y = h;
  }
  (L[K.arr] ||= []).push(o);
  return { arr: K.arr, i: L[K.arr].length - 1 };
}

/** Višina tal pod točko (x, z) (za privzeti y novih objektov). */
export function heightAtXZ(L, x, z) { return heightAt(L, Math.floor(x), Math.floor(z)); }

/** Izbriši objekt (start in cilja ni mogoče izbrisati). */
export function removeObj(L, ref) {
  if (ref.arr === 'start' || ref.arr === 'goal') return false;
  const a = L[ref.arr];
  if (!a || !a[ref.i]) return false;
  a.splice(ref.i, 1);
  // točke poti na premični plošči: popravi indekse
  if (ref.arr === 'movers') for (const w of L.route || []) { if (w.mover === ref.i) delete w.mover; else if (w.mover > ref.i) w.mover--; }
  return true;
}

/** Podvoji objekt (odmik +1 na vzhod). Vrne novo referenco. */
export function duplicateObj(L, ref) {
  if (ref.arr === 'start' || ref.arr === 'goal') return null;
  const o = getObj(L, ref);
  if (!o) return null;
  const c = clone(o);
  L[ref.arr].push(c);
  const nref = { arr: ref.arr, i: L[ref.arr].length - 1 };
  const p = objPos(L, nref);
  moveObj(L, nref, p[0] + 1, p[1]);
  return nref;
}

/** Ali točka (x, z) zadene objekt (za izbiro na tlorisu). Vrne razdaljo ali Infinity. */
export function hitObj(L, ref, x, z) {
  const k = kindOf(L, ref), o = getObj(L, ref), K = KINDS[k];
  if (!o) return Infinity;
  if (K.shape === 'rect') return (x >= o.x && x <= o.x + o.w && z >= o.z && z <= o.z + o.d) ? 0.2 : Infinity;
  if (K.shape === 'mover') {
    const [cx, cz] = objPos(L, ref);
    return Math.abs(x - cx) <= o.size[0] / 2 && Math.abs(z - cz) <= o.size[1] / 2 ? 0.3 : Infinity;
  }
  const [px, pz] = objPos(L, ref);
  const d = Math.hypot(x - px, z - pz);
  return d < 0.45 ? d : Infinity;
}

/** Vse reference objektov v progi (v vrstnem redu risanja). */
export function allRefs(L) {
  const out = [];
  for (const arr of ['bowls', 'movers', 'spinners', 'blocks', 'doors', 'hammers', 'fans', 'springs', 'bumpers', 'switches', 'enemies', 'pickups', 'checkpoints']) (L[arr] || []).forEach((_, i) => out.push({ arr, i }));
  if (L.start) out.push({ arr: 'start' });
  if (L.goal) out.push({ arr: 'goal' });
  return out;
}

/** Najbližji objekt pod točko (zadnji narisan ima prednost). */
export function pickObj(L, x, z) {
  let best = null, bd = Infinity;
  const refs = allRefs(L);
  for (let k = refs.length - 1; k >= 0; k--) {
    const d = hitObj(L, refs[k], x, z);
    if (d < bd - 1e-9) { bd = d; best = refs[k]; }
  }
  return best;
}

/** Točke poti objekta v ravnini [[x, z], …] (premična plošča, žaga, osa). */
export function pathPts(L, ref) {
  const o = getObj(L, ref);
  if (!o?.path) return null;
  return ref.arr === 'movers' ? o.path.map(p => [p[0], p[2]]) : o.path.map(p => [p[0], p[1]]);
}

/** Dodaj točko poti (za izbrano točko ali na konec). Vrne indeks nove točke. */
export function addPathPt(L, ref, x, z, after = null) {
  const o = getObj(L, ref);
  if (!o?.path) return -1;
  const at = after == null ? o.path.length : after + 1;
  const pt = ref.arr === 'movers' ? [x, o.path[Math.min(o.path.length - 1, Math.max(0, at - 1))][1], z] : [x, z];
  o.path.splice(at, 0, pt);
  return at;
}
export function movePathPt(L, ref, k, x, z) {
  const o = getObj(L, ref);
  if (!o?.path?.[k]) return false;
  if (ref.arr === 'movers') { o.path[k][0] = x; o.path[k][2] = z; } else { o.path[k][0] = x; o.path[k][1] = z; }
  return true;
}
export function removePathPt(L, ref, k) {
  const o = getObj(L, ref);
  if (!o?.path || o.path.length <= 2) return false;   // pot mora imeti vsaj 2 točki
  o.path.splice(k, 1);
  return true;
}

/** Vrednost polja s potjo »size.0«. */
export function getField(o, key) {
  return key.split('.').reduce((v, k) => v == null ? v : v[k], o);
}
/** Nastavi polje (undefined = odstrani neobvezno polje). */
export function setField(o, key, v) {
  const ks = key.split('.');
  let t = o;
  for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
  const last = ks[ks.length - 1];
  if (v === undefined) delete t[last]; else t[last] = v;
}

/** Položaj točke poti autopilota na tlorisu (točke na premični plošči so odmik od prve točke plošče). */
export function routePos(L, w) {
  if (w.mover != null) {
    const m = L.movers?.[w.mover];
    if (m) return [m.path[0][0] + w.x, m.path[0][2] + w.z];
  }
  return [w.x, w.z];
}

/* ===================================================================== */
/*  Razveljavi / uveljavi                                                */
/* ===================================================================== */

/** Zgodovina sprememb na ravni operacij (posnetki JSON pred operacijo). */
export class History {
  constructor(limit = 200) { this.u = []; this.r = []; this.limit = limit; this.open = null; }
  /** Začetek operacije (npr. pritisk miške za potezo čopiča). */
  begin(L) { if (this.open == null) this.open = JSON.stringify(L); }
  /** Konec operacije: zapiše jo, če se je proga spremenila. Vrne true ob spremembi. */
  end(L) {
    if (this.open == null) return false;
    const before = this.open; this.open = null;
    if (before === JSON.stringify(L)) return false;
    this.u.push(before);
    if (this.u.length > this.limit) this.u.shift();
    this.r = [];
    return true;
  }
  /** Ena takojšnja operacija. */
  apply(L, fn) { this.begin(L); const res = fn(L); this.end(L); return res; }
  get canUndo() { return this.u.length > 0; }
  get canRedo() { return this.r.length > 0; }
  /** Vrne prejšnje stanje (nov objekt) ali null. */
  undo(L) {
    this.open = null;
    if (!this.u.length) return null;
    this.r.push(JSON.stringify(L));
    return JSON.parse(this.u.pop());
  }
  redo(L) {
    this.open = null;
    if (!this.r.length) return null;
    this.u.push(JSON.stringify(L));
    return JSON.parse(this.r.pop());
  }
  clear() { this.u = []; this.r = []; this.open = null; }
}

/* ===================================================================== */
/*  Ostalo                                                               */
/* ===================================================================== */

/** Kratka zgoščena vrednost (FNV-1a, 32 bit) besedila → 8 hex znakov. */
export function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

/** JSON z urejenimi ključi (neodvisen od vrstnega reda polj). */
function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/** Ključi, ki ne vplivajo na vožnjo (ime, opis, videz, medalje, dev). */
const COSMETIC = new Set(['id', 'name', 'desc', 'dev', 'medals', 'timeBonus', 'theme', 'look', 'camYaw', 'set', 'route']);

/**
 * Zgoščena vrednost proge za igranje (samo mreža, višine in objekti) — ključ za lokalne čase in ghoste
 * ter za preverjanje rešljivosti. Neodvisna od vrstnega reda polj.
 */
export function levelHash(L) {
  const o = {};
  for (const k of Object.keys(L)) if (!COSMETIC.has(k)) o[k] = L[k];
  return hashStr(stableJson(o));
}

/** Kopija proge kot izhodišče za novo: spremeni se le id (»…-kopija«), vse ostalo ostane enako. */
export function copyLevel(L) {
  const c = clone(L);
  c.id = (/-kopija(-\d+)?$/.test(L.id) ? L.id.replace(/-kopija(-\d+)?$/, '') : L.id).slice(0, 50) + '-kopija';
  delete c.mirror;
  return c;
}

/**
 * Poišči mesto napake validatorja v progi (za skok na mesto). Vrne [x, z] ali null.
 * @param {Object} L
 * @param {string} msg
 */
export function locateError(L, msg) {
  let m;
  if ((m = /vrstici (\d+), stolpec (\d+)/.exec(msg))) return [+m[2] + 0.5, +m[1] + 0.5];
  if ((m = /kontrolna točka (\d+)/.exec(msg)) && L.checkpoints?.[m[1] - 1]) return L.checkpoints[m[1] - 1].slice(0, 2);
  if ((m = /pobiralka (\d+)/.exec(msg)) && L.pickups?.[m[1] - 1]) return [L.pickups[m[1] - 1].x, L.pickups[m[1] - 1].z];
  if ((m = /stikalo »(.+?)«/.exec(msg))) { const s = (L.switches || []).find(s => s.id === m[1]); if (s) return [s.x, s.z]; }
  if ((m = /vrata »(.+?)«/.exec(msg))) { const d = (L.doors || []).find(d => d.id === m[1]); if (d) return [d.x + d.w / 2, d.z + d.d / 2]; }
  if ((m = /\[(-?[\d.]+), (-?[\d.]+)\]/.exec(msg))) return [+m[1], +m[2]];
  if (/start/.test(msg) && L.start) return L.start.slice(0, 2);
  if (/cilj/.test(msg) && L.goal) return L.goal.slice(0, 2);
  if ((m = /hmap \(vrstica (\d+)\)/.exec(msg))) return [0.5, +m[1] + 0.5];
  return null;
}

/** Število zvezdic. */
export const starCount = L => (L.pickups || []).filter(p => p.t === 'star').length;
