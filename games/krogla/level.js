/* =====================================================================
   HRČKOVA KROGLA — level.js: format prog, validacija, zrcaljenje.
   Čista logika (brez DOM-a), uporabljajo jo igra, testi in tools/krogla-levels.mjs.
   Format je opisan v games/krogla/README.md.
   ===================================================================== */

/** Znaki ploščic v `map`. */
export const TILE_CHARS = {
  ' ': 'void', '.': 'floor', '#': 'wall',
  '^': 'ramp', 'v': 'ramp', '<': 'ramp', '>': 'ramp',
  'i': 'ice', 'g': 'glue', '~': 'wave', 'x': 'fall',
  'N': 'conveyor', 'S': 'conveyor', 'E': 'conveyor', 'W': 'conveyor',
};

/** Smer (enotski vektor v ravnini xz) za znake klančin in tekočih trakov. North = −z. */
export const DIRS = {
  '^': [0, -1], 'v': [0, 1], '<': [-1, 0], '>': [1, 0],
  'N': [0, -1], 'S': [0, 1], 'W': [-1, 0], 'E': [1, 0],
};

/** Višina iz znaka v `hmap`: '0'–'9' → 0–4,5, 'a'–'z' → 5–17,5 (korak 0,5). */
export function heightOf(ch) {
  if (ch == null || ch === ' ' || ch === '') return 0;
  const c = ch.charCodeAt(0);
  if (c >= 48 && c <= 57) return (c - 48) * 0.5;
  if (c >= 97 && c <= 122) return (c - 87) * 0.5;
  return NaN;
}

/** Znak višine (obratno od heightOf). */
export function heightChar(h) {
  const n = Math.round(h * 2);
  if (n < 0 || n > 35) throw new Error('višina izven obsega: ' + h);
  return n < 10 ? String(n) : String.fromCharCode(87 + n);
}

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isPt = p => Array.isArray(p) && p.length >= 2 && p.every(isNum);

/**
 * Preveri progo. Vrne seznam razumljivih napak (prazen = v redu).
 * @param {Object} L proga (JSON)
 * @returns {string[]}
 */
export function validateLevel(L) {
  const err = [];
  const where = L && L.id ? `proga ${L.id}: ` : 'proga: ';
  const e = m => err.push(where + m);
  if (!L || typeof L !== 'object') return ['proga ni objekt'];
  if (!/^[0-9]{2}-[a-z0-9-]+$/.test(L.id || '')) e('id mora biti oblike »NN-ime« (npr. 01-ogrevanje)');
  if (typeof L.name !== 'string' || L.name.length < 2) e('manjka ime (name)');
  if (![1, 2, 3].includes(L.set)) e('set mora biti 1, 2 ali 3');
  if (!isNum(L.timeBonus) || L.timeBonus < 5 || L.timeBonus > 300) e('timeBonus mora biti število sekund (5–300)');
  const m = L.medals;
  if (!m || !isNum(m.gold) || !isNum(m.silver) || !isNum(m.bronze)) e('medals mora imeti gold, silver, bronze (sekunde)');
  else if (!(m.gold < m.silver && m.silver < m.bronze)) e('medalje: gold < silver < bronze');
  if (!Array.isArray(L.map) || !L.map.length) { e('manjka map (seznam vrstic)'); return err; }
  const W = Math.max(...L.map.map(r => r.length)), D = L.map.length;
  if (!Array.isArray(L.size) || L.size[0] !== W || L.size[1] !== D) e(`size mora biti [${W}, ${D}]`);
  L.map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) if (!(row[c] in TILE_CHARS)) e(`neznan znak ploščice »${row[c]}« v vrstici ${r}, stolpec ${c}`);
  });
  if (L.hmap) {
    if (!Array.isArray(L.hmap) || L.hmap.length !== D) e(`hmap mora imeti ${D} vrstic`);
    else L.hmap.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) if (row[c] !== ' ' && Number.isNaN(heightOf(row[c]))) e(`neznan znak višine »${row[c]}« v hmap (vrstica ${r})`);
    });
  }
  const tileAt = (x, z) => {
    const c = Math.floor(x), r = Math.floor(z);
    if (r < 0 || r >= D || c < 0 || c >= W) return 'void';
    return TILE_CHARS[L.map[r][c] ?? ' '] || 'void';
  };
  const onGround = (p, what) => {
    if (!isPt(p)) { e(`${what}: pričakovan [x, z]`); return; }
    const t = tileAt(p[0], p[1]);
    const onPlat = (L.movers || []).some(mv => mv.path && mv.size && isPt(mv.path[0])
      && p[0] >= mv.path[0][0] - mv.size[0] / 2 && p[0] <= mv.path[0][0] + mv.size[0] / 2
      && p[1] >= mv.path[0][2] - mv.size[1] / 2 && p[1] <= mv.path[0][2] + mv.size[1] / 2);
    if ((t === 'void' || t === 'wall' || t === 'fall') && !onPlat) e(`${what} [${p.join(', ')}] ni na tleh (ploščica: ${t})`);
  };
  if (!L.start) e('manjka start'); else onGround(L.start, 'start');
  if (!L.goal) e('manjka goal (cilj)'); else onGround(L.goal, 'cilj');
  (L.checkpoints || []).forEach((p, i) => onGround(p, `kontrolna točka ${i + 1}`));
  const pk = L.pickups || [];
  pk.forEach((p, i) => {
    if (!['clock', 'star'].includes(p.t)) e(`pobiralka ${i + 1}: t mora biti clock ali star`);
    if (!isNum(p.x) || !isNum(p.z)) e(`pobiralka ${i + 1}: manjka x/z`);
  });
  const stars = pk.filter(p => p.t === 'star').length;
  if (stars !== 5) e(`proga mora imeti 5 zvezdic (ima ${stars})`);
  for (const mv of L.movers || []) {
    if (!Array.isArray(mv.path) || mv.path.length < 2 || !mv.path.every(p => Array.isArray(p) && p.length === 3 && p.every(isNum))) e('premična ploščica: path mora biti seznam [x, y, z] (vsaj 2)');
    if (!isPt(mv.size)) e('premična ploščica: manjka size [w, d]');
    if (!isNum(mv.speed) || mv.speed <= 0) e('premična ploščica: speed > 0');
  }
  for (const s of L.switches || []) if (!(L.doors || []).some(d => d.id === s.id)) e(`stikalo »${s.id}« nima vrat`);
  for (const d of L.doors || []) if (!(L.switches || []).some(s => s.id === d.id)) e(`vrata »${d.id}« nimajo stikala`);
  const EN = ['bully', 'saw', 'wasp', 'vacuum', 'magnet'];
  for (const en of L.enemies || []) {
    if (!EN.includes(en.t)) { e(`neznan sovražnik »${en.t}«`); continue; }
    if ((en.t === 'saw' || en.t === 'wasp') && !(Array.isArray(en.path) && en.path.length >= 2 && en.path.every(isPt))) e(`${en.t}: path mora imeti vsaj 2 točki [x, z]`);
    if ((en.t === 'bully' || en.t === 'vacuum' || en.t === 'magnet') && (!isNum(en.x) || !isNum(en.z))) e(`${en.t}: manjka x/z`);
  }
  if (L.theme && typeof L.theme !== 'object') e('theme mora biti objekt');
  return err;
}

/* --------------------------------------------------------- zrcaljenje */

const SWAP = { '<': '>', '>': '<', 'E': 'W', 'W': 'E' };

/**
 * Zrcali progo po osi X (x → W − x). Vrne novo progo, original ostane nespremenjen.
 * @param {Object} L
 */
export function mirrorLevel(L) {
  const W = L.size[0];
  const mx = x => W - x;
  const pt = p => [mx(p[0]), ...p.slice(1)];
  const dir = d => d && [-d[0], d[1]];
  const out = JSON.parse(JSON.stringify(L));
  out.mirror = true;
  out.map = L.map.map(row => [...row.padEnd(W, ' ')].reverse().map(ch => SWAP[ch] || ch).join(''));
  if (L.hmap) out.hmap = L.hmap.map(row => [...row.padEnd(W, '0')].reverse().join(''));
  out.start = pt(L.start);
  out.goal = pt(L.goal);
  out.checkpoints = (L.checkpoints || []).map(pt);
  out.pickups = (L.pickups || []).map(p => ({ ...p, x: mx(p.x) }));
  out.movers = (L.movers || []).map(m => ({ ...m, path: m.path.map(pt) }));
  out.spinners = (L.spinners || []).map(s => ({ ...s, x: mx(s.x), speed: -s.speed }));
  out.springs = (L.springs || []).map(s => ({ ...s, x: mx(s.x), dir: dir(s.dir) }));
  out.fans = (L.fans || []).map(f => ({ ...f, x: mx(f.x), dir: dir(f.dir) }));
  out.bumpers = (L.bumpers || []).map(b => ({ ...b, x: mx(b.x) }));
  out.bowls = (L.bowls || []).map(b => ({ ...b, x: mx(b.x) }));
  out.hammers = (L.hammers || []).map(h => ({ ...h, x: mx(h.x), dir: dir(h.dir) }));
  out.switches = (L.switches || []).map(s => ({ ...s, x: mx(s.x) }));
  out.doors = (L.doors || []).map(d => ({ ...d, x: mx(d.x) }));
  out.blocks = (L.blocks || []).map(b => ({ ...b, x: mx(b.x) }));
  out.enemies = (L.enemies || []).map(en => {
    const o = { ...en };
    if (en.path) o.path = en.path.map(pt);
    if (isNum(en.x)) o.x = mx(en.x);
    if (en.dir) o.dir = dir(en.dir);
    return o;
  });
  if (L.route) out.route = L.route.map(w => ({ ...w, x: w.mover != null ? -w.x : mx(w.x) }));
  if (isNum(L.camYaw)) out.camYaw = -L.camYaw;
  return out;
}

/**
 * JSON proge v obliki datotek levels/*.json (zamik 1, števila v seznamih v isti vrstici).
 * Uporabljata ga generator in izvoz urejevalnika.
 */
export function formatLevelJson(L) {
  return JSON.stringify(L, null, 1).replace(/\n\s+(?=[\d\-\]])/g, ' ') + '\n';
}

/* --------------------------------------------------------- nalaganje */

/**
 * Naloži seznam prog (levels/index.json) in vse proge. Za brskalnik (fetch).
 * @param {string|URL} base URL mape levels/
 * @returns {Promise<Object[]>}
 */
export async function loadLevels(base) {
  const idx = await (await fetch(new URL('index.json', base), { cache: 'no-cache' })).json();
  const list = await Promise.all(idx.levels.map(async f => {
    const L = await (await fetch(new URL(f, base), { cache: 'no-cache' })).json();
    return L;
  }));
  for (const L of list) {
    const errs = validateLevel(L);
    if (errs.length) console.warn('[krogla]', errs.join('\n'));
  }
  return list;
}
