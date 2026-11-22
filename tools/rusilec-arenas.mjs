/* =====================================================================
   Generator aren za Rušilca (brez npm odvisnosti).
     node tools/rusilec-arenas.mjs   → zapiše games/rusilec/arenas/*.json in index.json

   Arene so v istem formatu kot proge Hrčkove krogle (games/krogla/README.md),
   dopolnjene s spawns[], finale { tiles, sudden } in secret (games/rusilec/README.md).
   Teme vzamemo iz prog (games/krogla/levels/), da se ujemajo z lokacijami.
   Generator je le pripomoček: JSON lahko urejaš tudi ročno.
   ===================================================================== */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { heightChar, formatLevelJson } from '../games/krogla/level.js';
import { validateArena } from '../games/rusilec/arena.js';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('games/rusilec/arenas/', ROOT);
const LV = new URL('games/krogla/levels/', ROOT);

const themeOf = async f => JSON.parse(await readFile(new URL(f + '.json', LV), 'utf8')).theme;

/**
 * Mreža iz funkcije: fn(c, r, x, z) → null (praznina) ali [znak, višina].
 * Vrne { size, map, hmap, tiles } (tiles: seznam trdnih ploščic).
 */
function grid(W, D, fn) {
  const map = [], hmap = [], tiles = [];
  for (let r = 0; r < D; r++) {
    let row = '', hr = '';
    for (let c = 0; c < W; c++) {
      const v = fn(c, r, c + 0.5, r + 0.5);
      if (!v) { row += ' '; hr += '0'; continue; }
      row += v[0]; hr += heightChar(v[1] || 0);
      tiles.push({ c, r, ch: v[0], h: v[1] || 0 });
    }
    map.push(row); hmap.push(hr);
  }
  return { size: [W, D], map, hmap, tiles };
}

const solid = (g, c, r) => r >= 0 && r < g.size[1] && c >= 0 && c < g.size[0] && g.map[r][c] !== ' ';

/** Robne ploščice (ob praznini), urejene po kotu okoli (cx, cz) in prepletene z nasprotne strani (pošteno). */
function rimTiles(g, cx, cz, { depth = 1, skip = () => false } = {}) {
  const rim = new Set();
  let layer = g.tiles.filter(t => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => !solid(g, t.c + dc, t.r + dr)));
  const layers = [];
  for (let k = 0; k < depth; k++) {
    const L = layer.filter(t => !rim.has(t.c + ',' + t.r) && !skip(t));
    L.forEach(t => rim.add(t.c + ',' + t.r));
    layers.push(L);
    layer = g.tiles.filter(t => !rim.has(t.c + ',' + t.r) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => rim.has((t.c + dc) + ',' + (t.r + dr))));
  }
  return layers.map(L => interleave(L, cx, cz));
}

function interleave(L, cx, cz) {
  const ang = t => (Math.atan2(t.c + 0.5 - cx, -(t.r + 0.5 - cz)) + Math.PI * 2) % (Math.PI * 2);
  const s = [...L].sort((a, b) => ang(a) - ang(b));
  const half = Math.ceil(s.length / 2);
  const a = s.slice(0, half), b = s.slice(half);
  const out = [];
  for (let i = 0; i < half; i++) { out.push(a[i]); if (b[i]) out.push(b[i]); }
  return out.map(t => [t.c, t.r]);
}

/** Označi ploščice kot padajoče ('x'), da se lahko ob finalu krušijo. */
function markFall(g, list) {
  for (const [c, r] of list) {
    const row = [...g.map[r]];
    row[c] = 'x';
    g.map[r] = row.join('');
  }
}

/** n izhodišč na krogu okoli (cx, cz). */
function ringSpawns(cx, cz, rad, n = 8, rot = 0) {
  return Array.from({ length: n }, (_, k) => {
    const a = rot + k / n * Math.PI * 2;
    return [+(cx + Math.sin(a) * rad).toFixed(2), +(cz - Math.cos(a) * rad).toFixed(2)];
  });
}

const disc = (cx, cz, R) => (x, z) => (x - cx) ** 2 + (z - cz) ** 2 <= R * R;

const ARENAS = [];
const def = (meta, build) => ARENAS.push({ meta, build });

/* ------------------------------------------------------------ 1 Ring */
def({ id: '01-ring', name: 'Ring', from: '01-ogrevanje', look: 'garden', desc: 'Okrogla ravna plošča brez ograje. Za učenje.' }, () => {
  const g = grid(13, 13, (c, r, x, z) => disc(6.5, 6.5, 6.2)(x, z) ? ['.', 0] : null);
  const [rim, inner] = rimTiles(g, 6.5, 6.5, { depth: 2 });
  markFall(g, [...rim, ...inner]);
  return { g, spawns: ringSpawns(6.5, 6.5, 3.4), finale: { tiles: rim, sudden: inner } };
});

/* ------------------------------------------------------------ 2 Cvetlični lonec */
def({ id: '02-cvetlicni-lonec', name: 'Cvetlični lonec', from: '02-vrtnarija', look: 'garden', desc: 'Skleda na sredini, ozki cvetni listi ob robu.' }, () => {
  const C = 8.5;
  const petal = (x, z) => {
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + Math.PI / 6;
      const ux = Math.sin(a), uz = -Math.cos(a);
      const along = (x - C) * ux + (z - C) * uz, side = Math.abs(-(x - C) * uz + (z - C) * ux);
      if (along > 3.5 && along < 7.9 && side < 0.75) return true;
    }
    return false;
  };
  const g = grid(17, 17, (c, r, x, z) => (disc(C, C, 4.8)(x, z) || petal(x, z)) ? ['.', 0] : null);
  const [rim, inner] = rimTiles(g, C, C, { depth: 2, skip: t => (t.c + 0.5 - C) ** 2 + (t.r + 0.5 - C) ** 2 < 3.6 * 3.6 });
  markFall(g, [...rim, ...inner]);
  return {
    g, spawns: ringSpawns(C, C, 2.9, 8, Math.PI / 8),
    finale: { tiles: rim, sudden: inner },
    bowls: [{ x: C, z: C, r: 2.6, depth: 0.55 }],
  };
});

/* ------------------------------------------------------------ 3 Krožnik */
def({ id: '03-kroznik', name: 'Krožnik', from: '03-skodelice', look: 'kitchen', desc: 'Rahlo izbočena tla — vse drsi proti robu.' }, () => {
  const g = grid(15, 15, (c, r, x, z) => disc(7.5, 7.5, 6.9)(x, z) ? ['.', 0.5] : null);
  const [rim, inner] = rimTiles(g, 7.5, 7.5, { depth: 2 });
  markFall(g, [...rim, ...inner]);
  return { g, spawns: ringSpawns(7.5, 7.5, 3.3), finale: { tiles: rim, sudden: inner }, bowls: [{ x: 7.5, z: 7.5, r: 7.6, depth: -0.7 }] };
});

/* ------------------------------------------------------------ 4 Pult */
def({ id: '04-pult', name: 'Pult', from: '04-kuhinja', look: 'kitchen', desc: 'Premične deske odpirajo luknje v pultu.' }, () => {
  const W = 16, D = 12;
  const holes = [[4, 3], [10, 3], [7, 7]];   // levi zgornji vogal luknje 2×2
  const inHole = (c, r) => holes.some(([hc, hr]) => c >= hc && c < hc + 2 && r >= hr && r < hr + 2);
  const g = grid(W, D, (c, r) => (c >= 1 && c < W - 1 && r >= 1 && r < D - 1 && !inHole(c, r) && !((c === 1 || c === W - 2) && (r === 1 || r === D - 2))) ? ['.', 0] : null);
  const [rim, inner] = rimTiles(g, W / 2, D / 2, { depth: 2, skip: t => holes.some(([hc, hr]) => Math.abs(t.c - hc - 0.5) < 2 && Math.abs(t.r - hr - 0.5) < 2) && t.c > 2 && t.c < W - 3 && t.r > 2 && t.r < D - 3 });
  markFall(g, [...rim, ...inner]);
  const movers = holes.map(([hc, hr], k) => ({ path: [[hc + 1, 0.03, hr + 1], [hc + 1 + (k === 2 ? 0 : (k ? -2 : 2)), 0.03, hr + 1 + (k === 2 ? 2 : 0)]], size: [2, 2], speed: 1.1, pause: 2.2, phase: k * 0.33, loop: false, thick: 0.25 }));
  const spawns = [[2.5, 6], [13.5, 6], [6, 2.5], [10, 2.5], [4, 9.5], [12, 9.5], [8, 5.5], [8.0, 10.0]];
  return { g, spawns, finale: { tiles: rim, sudden: inner }, movers };
});

/* ------------------------------------------------------------ 5 Tekoči trak */
def({ id: '05-tekoci-trak', name: 'Tekoči trak', from: '06-tovarna', look: 'factory', desc: 'Trakovi ob robu vlečejo ven, kladivo na sredini odbije.' }, () => {
  const W = 16, D = 13;
  const g = grid(W, D, (c, r) => {
    if (c < 1 || c > W - 2 || r < 1 || r > D - 2) return null;
    if ((c <= 2 || c >= W - 3) && (r === 1 || r === D - 2)) return null;
    if (c <= 2 && r >= 3 && r <= D - 4) return ['W', 0];
    if (c >= W - 3 && r >= 3 && r <= D - 4) return ['E', 0];
    return ['.', 0];
  });
  const [rim, inner] = rimTiles(g, W / 2, D / 2, { depth: 2, skip: t => 'WE'.includes(t.ch) });
  markFall(g, [...rim, ...inner]);
  const spawns = [[5, 3.5], [11, 3.5], [5, 9.5], [11, 9.5], [8, 2.5], [8, 10.5], [4.0, 6.5], [12.0, 6.5]];
  return {
    g, spawns, finale: { tiles: rim, sudden: inner },
    hammers: [
      { x: 7, z: 5.5, w: 2, d: 1, period: 4.2, phase: 0, dir: [0, -1] },
      { x: 7, z: 6.5, w: 2, d: 1, period: 4.2, phase: 0.5, dir: [0, 1] },
    ],
  };
});

/* ------------------------------------------------------------ 6 Drsališče */
def({ id: '06-drsalisce', name: 'Drsališče', from: '08-ledena-dvorana', look: 'ice', desc: 'Led povsod, vzmeti v kotih izstrelijo čez areno.' }, () => {
  const W = 15, D = 13;
  const g = grid(W, D, (c, r, x, z) => {
    const dx = Math.max(0, Math.abs(x - W / 2) - 4.2), dz = Math.max(0, Math.abs(z - D / 2) - 3.2);
    return dx * dx + dz * dz <= 2.9 * 2.9 ? ['i', 0] : null;
  });
  const [rim, inner] = rimTiles(g, W / 2, D / 2, { depth: 2 });
  markFall(g, [...rim, ...inner]);
  const k = 0.7071;
  const springs = [[3.5, 3.5, k, k], [11.5, 3.5, -k, k], [3.5, 9.5, k, -k], [11.5, 9.5, -k, -k]].map(([x, z, dx, dz]) => ({ x, z, dir: [dx, dz], power: 8.5, up: 5 }));
  return { g, spawns: ringSpawns(W / 2, D / 2, 3.4, 8, Math.PI / 8), finale: { tiles: rim, sudden: inner }, springs };
});

/* ------------------------------------------------------------ 7 Vrtiljak (skrivna) */
def({ id: '07-vrtiljak', name: 'Vrtiljak', from: '10-neon', look: 'neon', secret: true, key: 'Neon', desc: 'Vrtljiva plošča in dve žagi na tirnici okoli roba.' }, () => {
  const C = 7.5;
  const g = grid(15, 15, (c, r, x, z) => disc(C, C, 6.9)(x, z) ? ['.', 0] : null);
  const [rim, inner] = rimTiles(g, C, C, { depth: 2 });
  markFall(g, [...rim, ...inner]);
  const path = Array.from({ length: 20 }, (_, k) => { const a = k / 20 * Math.PI * 2; return [+(C + Math.sin(a) * 5.2).toFixed(2), +(C - Math.cos(a) * 5.2).toFixed(2)]; });
  return {
    g, spawns: ringSpawns(C, C, 4.0, 8, Math.PI / 8), finale: { tiles: rim, sudden: inner },
    spinners: [{ x: C, z: C, r: 3.1, y: 0.02, speed: 0.75 }],
    enemies: [{ t: 'saw', path, speed: 1.7, phase: 0, loop: true }, { t: 'saw', path, speed: 1.7, phase: 0.5, loop: true }],
  };
});

/* ------------------------------------------------------------ 8 Oblak (skrivna) */
def({ id: '08-oblak', name: 'Oblak', from: '11-nebo', look: 'sky', secret: true, key: 'Nebo', desc: 'Otoki z rampami in ventilatorji; sredinski otok se ob finalu potopi.' }, () => {
  const C = 11.5, W = 23, IR = 3.1;
  const islands = [[C, 3.7], [C, W - 3.7], [3.7, C], [W - 3.7, C]];
  const isl = (x, z) => islands.some(([ix, iz]) => (x - ix) ** 2 + (z - iz) ** 2 <= IR * IR);
  const g = grid(W, W, (c, r, x, z) => {
    if ((x - C) ** 2 + (z - C) ** 2 <= 3.2 * 3.2) return ['.', 0.5];
    if (isl(x, z)) return ['.', 0];
    // mostovi: klančina ob sredinskem otoku dvigne za 0,5 (višina v hmap = nižji konec)
    if (c === 11 && r === 7) return ['v', 0];
    if (c === 11 && r === 15) return ['^', 0];
    if (r === 11 && c === 7) return ['>', 0];
    if (r === 11 && c === 15) return ['<', 0];
    return null;
  });
  const center = g.tiles.filter(t => t.h >= 0.5);
  const centerOrder = interleave(center, C, C);
  const rimOuter = rimTiles(g, C, C, { depth: 1, skip: t => t.h >= 0.5 || '<>^v'.includes(t.ch) })[0];
  markFall(g, [...rimOuter, ...centerOrder]);
  const spawns = [];
  islands.forEach(([ix, iz]) => {
    const tx = C - ix, tz = C - iz, m = Math.hypot(tx, tz); const px = -tz / m, pz = tx / m;
    spawns.push([+(ix + px * 1.2).toFixed(2), +(iz + pz * 1.2).toFixed(2)], [+(ix - px * 1.2).toFixed(2), +(iz - pz * 1.2).toFixed(2)]);
  });
  return {
    g, spawns,
    finale: { tiles: [...rimOuter.slice(0, 10), ...centerOrder], sudden: rimOuter.slice(10) },
    fans: [
      { x: C - 2.2, z: 2.2, dir: [1, 0], len: 4.4, width: 1.4, force: 10 },
      { x: C + 2.2, z: W - 2.2, dir: [-1, 0], len: 4.4, width: 1.4, force: 10 },
      { x: 2.2, z: C + 2.2, dir: [0, -1], len: 4.4, width: 1.4, force: 10 },
      { x: W - 2.2, z: C - 2.2, dir: [0, 1], len: 4.4, width: 1.4, force: 10 },
    ],
  };
});

/* ------------------------------------------------------------ 9 Nemogoče */
def({ id: '09-nemogoce', name: 'Nemogoče', from: '12-nemogoce', look: 'inferno', desc: 'Zelo majhna plošča nad lavo. Brez milosti.' }, () => {
  const g = grid(9, 9, (c, r, x, z) => disc(4.5, 4.5, 3.9)(x, z) ? ['.', 0] : null);
  const [rim] = rimTiles(g, 4.5, 4.5, { depth: 1 });
  markFall(g, rim);
  return { g, spawns: ringSpawns(4.5, 4.5, 2.25, 8, Math.PI / 8), finale: { tiles: rim.slice(0, Math.ceil(rim.length / 2)), sudden: rim.slice(Math.ceil(rim.length / 2)) } };
});

/* ===================================================================== */

await mkdir(OUT, { recursive: true });
const files = [];
let bad = 0;
for (const { meta, build } of ARENAS) {
  const o = build();
  const theme = await themeOf(meta.from);
  const A = {
    id: meta.id, name: meta.name, desc: meta.desc, look: meta.look, theme,
    secret: !!meta.secret, ...(meta.key ? { hint: `Najdi skrito ključavnico na progi ${meta.key}` } : {}),
    size: o.g.size, map: o.g.map, hmap: o.g.hmap,
    spawns: o.spawns, finale: o.finale,
  };
  for (const k of ['bowls', 'movers', 'spinners', 'springs', 'fans', 'hammers', 'enemies', 'bumpers', 'blocks']) if (o[k]) A[k] = o[k];
  const errs = validateArena(A);
  if (errs.length) { bad++; console.error(errs.join('\n')); }
  const f = A.id + '.json';
  files.push(f);
  await writeFile(new URL(f, OUT), formatLevelJson(A));
  console.log(`${A.id.padEnd(22)} ${A.size.join('×').padEnd(6)} izhodišč ${A.spawns.length}, finale ${A.finale.tiles.length}+${A.finale.sudden.length}${A.secret ? ' (skrivna)' : ''}`);
}
await writeFile(new URL('index.json', OUT), JSON.stringify({ arenas: files }, null, 1) + '\n');
if (bad) process.exit(1);
