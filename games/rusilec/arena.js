/* =====================================================================
   RUŠILEC — arena.js: nalaganje in validacija aren, geometrija (rob, izhodišča).
   Arena = proga Hrčkove krogle (isti format, isti validator validateLevel)
   + spawns[], finale { tiles, sudden }, secret, hint. Brez start/goal.
   Čista logika (brez DOM-a).
   ===================================================================== */
import { validateLevel, TILE_CHARS } from '../krogla/level.js';
import { createWorld, tileTop, tileIndex, TILE } from '../krogla/physics.js';

/** Najmanjša razdalja med izhodišči. */
export const SPAWN_GAP = 1.5;
const OFF = [-80, -80];   // start/goal za physics/render: daleč stran od arene (nevidno v megli)

const isPt = p => Array.isArray(p) && p.length >= 2 && p.every(v => typeof v === 'number' && Number.isFinite(v));

/**
 * Arena → proga, ki jo razumeta physics.createWorld in Renderer (brez cilja, zvezdic, kontrolnih točk).
 * @param {Object} A arena
 */
export function arenaLevel(A) {
  return {
    ...A, set: 1, timeBonus: 60, medals: { gold: 1, silver: 2, bronze: 3 },
    start: OFF, goal: OFF, checkpoints: [], pickups: [],
  };
}

/**
 * Preveri areno. Vrne seznam napak (prazen = v redu).
 * Uporabi validateLevel (format prog), namesto start/goal/zvezdic pa preveri izhodišča in finale.
 * @param {Object} A
 * @returns {string[]}
 */
export function validateArena(A) {
  if (!A || typeof A !== 'object') return ['arena ni objekt'];
  const where = `arena ${A.id || '?'}: `;
  const err = [];
  const e = m => err.push(where + m);
  const sp = Array.isArray(A.spawns) ? A.spawns : [];
  // format prog (start/goal/zvezdice so pri arenah nadomeščeni)
  const fake = { ...A, set: 1, timeBonus: 60, medals: { gold: 1, silver: 2, bronze: 3 }, start: sp[0] || [0, 0], goal: sp[1] || sp[0] || [0, 0], checkpoints: [],
    pickups: Array.from({ length: 5 }, () => ({ t: 'star', x: 0, z: 0 })) };
  for (const m of validateLevel(fake)) {
    if (/start|cilj/.test(m)) continue;   // izhodišča preverimo spodaj
    err.push(m.replace(/^proga [^:]*: /, where));
  }
  if (typeof A.secret !== 'boolean') e('secret mora biti true ali false');
  if (A.secret && typeof A.hint !== 'string') e('skrivna arena potrebuje namig (hint)');
  if (!Array.isArray(A.map) || !Array.isArray(A.size)) return err;
  const [W, D] = A.size;
  const ch = (c, r) => (r >= 0 && r < D && c >= 0 && c < W) ? (A.map[r][c] ?? ' ') : ' ';
  const kind = (x, z) => TILE_CHARS[ch(Math.floor(x), Math.floor(z))] || 'void';
  if (sp.length < 8) e(`potrebnih je vsaj 8 izhodišč (spawns), ima ${sp.length}`);
  sp.forEach((p, i) => {
    if (!isPt(p)) { e(`izhodišče ${i + 1}: pričakovan [x, z]`); return; }
    const k = kind(p[0], p[1]);
    if (k === 'void' || k === 'wall') e(`izhodišče ${i + 1} [${p.join(', ')}] ni na tleh (ploščica: ${k})`);
    // tudi okolica (polmer krogle) mora biti tla
    for (const [dx, dz] of [[0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
      const k2 = kind(p[0] + dx, p[1] + dz);
      if (k2 === 'void') { e(`izhodišče ${i + 1} [${p.join(', ')}] je preblizu roba`); break; }
    }
    sp.forEach((q, j) => {
      if (j <= i || !isPt(q)) return;
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      if (d < SPAWN_GAP) e(`izhodišči ${i + 1} in ${j + 1} sta preblizu (${d.toFixed(2)} < ${SPAWN_GAP})`);
    });
  });
  const F = A.finale;
  if (!F || !Array.isArray(F.tiles) || !F.tiles.length) e('finale.tiles: seznam ploščic [c, r], ki se krušijo (vsaj 1)');
  else {
    const seen = new Set();
    for (const t of [...F.tiles, ...(F.sudden || [])]) {
      if (!Array.isArray(t) || t.length !== 2 || !t.every(Number.isInteger)) { e('finale: ploščica mora biti [c, r] (cela števila)'); continue; }
      if (ch(t[0], t[1]) !== 'x') e(`finale: ploščica [${t.join(', ')}] mora biti padajoča ('x')`);
      const k = t.join(',');
      if (seen.has(k)) e(`finale: ploščica [${k}] je dvakrat`);
      seen.add(k);
    }
    // vsaj eno izhodišče mora ostati po finalu
    const gone = p => seen.has(Math.floor(p[0]) + ',' + Math.floor(p[1]));
    if (sp.length && sp.filter(isPt).every(gone)) e('finale: vsa izhodišča bi se zrušila');
  }
  return err;
}

/**
 * Naloži arene (arenas/index.json). Za brskalnik.
 * @param {string|URL} base URL mape arenas/
 */
export async function loadArenas(base) {
  const idx = await (await fetch(new URL('index.json', base), { cache: 'no-cache' })).json();
  const list = await Promise.all(idx.arenas.map(async f => (await fetch(new URL(f, base), { cache: 'no-cache' })).json()));
  for (const A of list) {
    const errs = validateArena(A);
    if (errs.length) console.warn('[rusilec]', errs.join('\n'));
  }
  return list;
}

/** Fizikalni svet za areno (ploščice, ki se zrušijo, ostanejo zrušene). */
export function arenaWorld(A) {
  const w = createWorld(arenaLevel(A));
  w.permFall = true;
  w.A = A;
  return w;
}

/** Indeks ploščice [c, r] v svetu. */
export const tileId = (w, c, r) => r * w.g.W + c;

/** Ali je ploščica (indeks) praznina ali (bo) zrušena — za bote in izhodišča. */
export function tileGone(w, i) {
  if (i < 0) return true;
  const t = w.g.type[i];
  if (t === TILE.void) return true;
  if (t === TILE.fall && w.fallTiles.has(i)) return true;
  return false;
}

/**
 * Razdalja točke do najbližje praznine (rob arene), največ maxR. Vrne { d, nx, nz }:
 * (nx, nz) je enotska smer od točke proti robu.
 */
export function edgeInfo(w, x, z, maxR = 4) {
  const g = w.g;
  let best = maxR, bx = 0, bz = 0;
  const c0 = Math.floor(x - maxR), c1 = Math.floor(x + maxR), r0 = Math.floor(z - maxR), r1 = Math.floor(z + maxR);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const out = c < 0 || r < 0 || c >= g.W || r >= g.D;
      if (!out && !tileGone(w, r * g.W + c)) continue;
      const px = Math.min(Math.max(x, c), c + 1), pz = Math.min(Math.max(z, r), r + 1);
      const d = Math.hypot(px - x, pz - z);
      if (d < best) { best = d; bx = px - x; bz = pz - z; }
    }
  }
  const m = Math.hypot(bx, bz) || 1;
  return { d: best, nx: bx / m, nz: bz / m };
}

/** Ali so tla pod (x, z) (ne praznina in ne zrušena ploščica)? */
export function hasFloor(w, x, z) {
  const i = tileIndex(w, x, z);
  if (i < 0) return false;
  if (tileGone(w, i)) {
    // premična plošča ali vrtiljak lahko pokrije luknjo
    for (const m of w.movers) if (Math.abs(x - m.pos[0]) <= m.size[0] / 2 && Math.abs(z - m.pos[2]) <= m.size[1] / 2) return true;
    return false;
  }
  return Number.isFinite(tileTop(w, i, x, z));
}

/** Središče in polmer arene (za kamero in bote). */
export function arenaBounds(A) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, sx = 0, sz = 0, n = 0;
  A.map.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] !== ' ') { x0 = Math.min(x0, c); x1 = Math.max(x1, c + 1); z0 = Math.min(z0, r); z1 = Math.max(z1, r + 1); sx += c + 0.5; sz += r + 0.5; n++; } });
  return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, mx: sx / n, mz: sz / n, w: x1 - x0, d: z1 - z0, r: Math.hypot(x1 - x0, z1 - z0) / 2 };
}
