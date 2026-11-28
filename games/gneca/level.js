/* =====================================================================
   GNEČA — level.js: nalaganje, privzete vrednosti in validacija nivoja
   (JSON v games/gneca/levels/). Brez DOM-a; fetch je le v loadIndex.
   ===================================================================== */
import { B } from './balance.js';

export const OPS = ['+', 'x', '-', '/'];
export const OP_LABEL = { '+': '+', x: '×', '-': '−', '/': '÷' };
export const OBSTACLES = ['fence', 'roller', 'saw'];
export const THEMES = ['puscava', 'kanjon'];
export const MAX_GATES = 32;   // bitna maska uporabljenih vrat je Uint32

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Oznaka vrat za prikaz (npr. »×3«, »−10«). */
export function gateLabel(op, v) { return OP_LABEL[op] + v; }
/** Ali so vrata »dobra« (zelena) ali »slaba« (rdeča). */
export function gateGood(op, v) { return op === '+' ? v > 0 : op === 'x' ? v > 1 : false; }

/**
 * Normaliziraj nivo: dopolni privzete vrednosti. Ne spreminja vhoda.
 * @param {any} raw
 */
export function normalizeLevel(raw) {
  const L = {
    id: String(raw.id || 'nivo'),
    name: String(raw.name || 'Nivo'),
    set: raw.set || 'puscava',
    theme: raw.theme || raw.set || 'puscava',
    length: num(raw.length, B.lane.length),
    width: num(raw.width, B.lane.width),
    time: num(raw.time, B.lane.time),
    towerHp: num(raw.towerHp, B.tower.hp),
    boss: !!raw.boss,
    hint: raw.hint ? String(raw.hint) : '',
    stars: Array.isArray(raw.stars) ? raw.stars.slice(0, 2).map(Number) : [1500, 2000],
    gates: (raw.gates || []).map(g => ({
      x: num(g.x, 0), z: num(g.z, 10), w: num(g.w, 3), op: g.op, v: num(g.v, 2),
      move: g.move ? { amp: num(g.move.amp, 2), speed: num(g.move.speed, 1), phase: num(g.move.phase, 0) } : null,
      change: g.change ? { after: num(g.change.after, 30), to: num(g.change.to, 1), op: g.change.op || null } : null,
    })),
    obstacles: (raw.obstacles || []).map(o => ({
      type: o.type, x: num(o.x, 0), z: num(o.z, 20), w: num(o.w, 3),
      d: num(o.d, o.type === 'roller' ? B.obstacle.rollerDepth : 0.4),
      r: num(o.r, B.obstacle.sawRadius), amp: num(o.amp, 0), speed: num(o.speed, 1), phase: num(o.phase, 0),
    })),
    turrets: (raw.turrets || []).map(t => ({
      x: num(t.x, 0), z: num(t.z, 30), hp: num(t.hp, B.turret.hp), rate: num(t.rate, B.turret.rate), range: num(t.range, B.turret.range),
    })),
    waves: (raw.waves || []).map(w => ({
      t: num(w.t, 2), n: num(w.n, 0), every: num(w.every, 0), until: num(w.until, 0), grow: num(w.grow, 0),
      giant: num(w.giant, 0), hp: num(w.hp, B.enemyGiant.hp),
    })),
  };
  return L;
}

/**
 * Validacija surovega nivoja. Vrne seznam napak (prazen = OK).
 * @param {any} raw
 */
export function validateLevel(raw) {
  const e = [];
  if (!raw || typeof raw !== 'object') return ['nivo ni objekt'];
  const L = normalizeLevel(raw);
  if (!/^[a-z0-9-]{1,32}$/.test(L.id)) e.push('id: male črke, številke, -');
  if (L.length < 30 || L.length > 120) e.push('length mora biti 30–120');
  if (L.width < 6 || L.width > 16) e.push('width mora biti 6–16');
  if (L.time < 20 || L.time > 300) e.push('time mora biti 20–300');
  if (L.towerHp < 1 || L.towerHp > 5000) e.push('towerHp 1–5000');
  if (!THEMES.includes(L.theme)) e.push('neznana tema ' + L.theme);
  if (L.gates.length > MAX_GATES) e.push('največ ' + MAX_GATES + ' vrat');
  if (L.stars.length !== 2 || !(L.stars[0] < L.stars[1])) e.push('stars: [meja 2★, meja 3★], naraščajoče');
  const hw = L.width / 2;
  L.gates.forEach((g, i) => {
    const p = 'vrata ' + i + ': ';
    if (!OPS.includes(g.op)) e.push(p + 'op mora biti + x - /');
    if (!(g.v >= 1 && g.v <= 100 && Number.isInteger(g.v))) e.push(p + 'v mora biti celo število 1–100');
    if (g.op === '/' && g.v < 2) e.push(p + '÷ potrebuje v ≥ 2');
    if (g.z < 3 || g.z > L.length - 4) e.push(p + 'z izven steze');
    if (g.w < 1 || g.w > L.width) e.push(p + 'w izven meja');
    const amp = g.move ? Math.abs(g.move.amp) : 0;
    if (Math.abs(g.x) + g.w / 2 + amp > hw + 0.01) e.push(p + 'sega čez rob steze');
    if (g.change && !(g.change.to >= 1 && Number.isInteger(g.change.to))) e.push(p + 'change.to mora biti celo število ≥ 1');
    if (g.change && g.change.op && !OPS.includes(g.change.op)) e.push(p + 'change.op neznan');
  });
  L.obstacles.forEach((o, i) => {
    const p = 'ovira ' + i + ': ';
    if (!OBSTACLES.includes(o.type)) e.push(p + 'type mora biti fence, roller ali saw');
    if (o.z < 3 || o.z > L.length - 3) e.push(p + 'z izven steze');
    const half = o.type === 'saw' ? o.r : o.w / 2;
    if (Math.abs(o.x) + half + Math.abs(o.amp) > hw + 0.01) e.push(p + 'sega čez rob steze');
  });
  L.turrets.forEach((t, i) => {
    if (Math.abs(t.x) > hw || t.z < 5 || t.z > L.length - 2) e.push('stolpič ' + i + ': položaj izven steze');
    if (t.rate <= 0 || t.rate > 10) e.push('stolpič ' + i + ': rate 0–10');
  });
  if (!L.waves.length) e.push('nivo potrebuje vsaj en val');
  L.waves.forEach((w, i) => {
    if (w.t < 0 || w.t > L.time) e.push('val ' + i + ': t izven časa');
    if (w.n < 0 || w.n > 300 || w.giant < 0 || w.giant > 10) e.push('val ' + i + ': n 0–300, giant 0–10');
    if (w.every && w.every < 1) e.push('val ' + i + ': every ≥ 1');
  });
  return e;
}

/**
 * Razširi urnik valov v seznam dogodkov [{ step, n, giant, hp }], urejen po koraku.
 * @param {ReturnType<typeof normalizeLevel>} L
 */
export function expandWaves(L) {
  const out = [];
  const end = L.time;
  for (const w of L.waves) {
    let t = w.t, n = w.n, k = 0;
    const until = w.every ? (w.until || end) : w.t;
    while (t <= until + 1e-9 && k < 200) {
      out.push({ step: Math.round(t * B.hz), n: Math.round(n), giant: w.giant, hp: w.hp });
      if (!w.every) break;
      t += w.every; n += w.grow; k++;
    }
  }
  out.sort((a, b) => a.step - b.step);
  return out;
}

/** Naloži kazalo nivojev in vse nivoje (brskalnik). */
export async function loadIndex(base = 'levels/') {
  const idx = await (await fetch(base + 'index.json', { cache: 'no-cache' })).json();
  const sets = [];
  for (const s of idx.sets) {
    const levels = await Promise.all(s.levels.map(async f => (await fetch(base + f, { cache: 'no-cache' })).json()));
    sets.push({ id: s.id, name: s.name, icon: s.icon, levels });
  }
  return sets;
}
