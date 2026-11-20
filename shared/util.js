/* =====================================================================
   MINI GAMES — čista logika brez DOM-a (testirana v Node in brskalniku)
   ===================================================================== */

/** Časovni pas, po katerem se računa »danes« (dnevni seed, dnevna lestvica, XP limit). */
export const TZ = 'Europe/Ljubljana';

/** Abeceda za kode sob: brez zamenljivih znakov (O/0, I/1). */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{4}$/;

/** Omejitve XP (iste kot v supabase/schema.sql → award_xp). */
export const XP_PER_CALL = 500;
export const XP_PER_DAY = 5000;

/**
 * 32-bitni hash niza (cyrb53 skrajšan na 32 bitov).
 * @param {string} str
 * @returns {number} nenegativno 32-bitno celo število
 */
export function hashString(str) {
  let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

/**
 * Determinističen PRNG (mulberry32). Isti seed → isto zaporedje.
 * Vrne funkcijo `rand()` ∈ [0, 1) z dodatki:
 * `rand.int(min, max)` (vključno), `rand.range(min, max)`, `rand.pick(arr)`, `rand.shuffle(arr)` (nova tabela).
 * @param {string|number} seed
 * @returns {(() => number) & {int:(a:number,b:number)=>number, range:(a:number,b:number)=>number, pick:<T>(a:T[])=>T, shuffle:<T>(a:T[])=>T[]}}
 */
export function rng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rand.int = (min, max) => min + Math.floor(rand() * (max - min + 1));
  rand.range = (min, max) => min + rand() * (max - min);
  rand.pick = arr => arr[Math.floor(rand() * arr.length)];
  rand.shuffle = arr => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return rand;
}

/** Deli datuma v časovnem pasu TZ. */
function tzParts(date) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, mi: +o.minute, s: +o.second };
}

/**
 * Dnevni seed: datum po Europe/Ljubljana v obliki `YYYY-MM-DD`.
 * Isti za vse igralce cel (ljubljanski) dan.
 * @param {Date} [date]
 * @returns {string}
 */
export function dailySeed(date = new Date()) {
  const p = tzParts(date);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/**
 * Začetek ljubljanskega dne (polnoč) kot Date (UTC trenutek).
 * @param {Date} [date]
 * @returns {Date}
 */
export function dayStart(date = new Date()) {
  const p = tzParts(date);
  // odmik pasu v tem trenutku
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  const offset = asUtc - Math.floor(date.getTime() / 1000) * 1000;
  const midnight = Date.UTC(p.y, p.m - 1, p.d) - offset;
  // ob prehodu poletnega časa se odmik lahko razlikuje za 1 h; popravi
  const check = tzParts(new Date(midnight));
  if (check.h !== 0) return new Date(midnight - (check.h > 12 ? check.h - 24 : check.h) * 3600e3);
  return new Date(midnight);
}

/**
 * Začetek obdobja za lestvice.
 * @param {'all'|'today'|'week'} period
 * @param {Date} [now]
 * @returns {Date|null} null = brez omejitve
 */
export function periodSince(period, now = new Date()) {
  if (period === 'today') return dayStart(now);
  if (period === 'week') return new Date(now.getTime() - 7 * 864e5);
  return null;
}

/**
 * Naključna koda sobe (4 znaki iz ROOM_ALPHABET).
 * @param {() => number} [random]
 */
export function makeRoomCode(random = Math.random) {
  let c = '';
  for (let i = 0; i < 4; i++) c += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  return c;
}

/**
 * Normalizira vnos kode (male črke, presledki, O→0 ipd. niso dovoljeni → null).
 * @param {string} input
 * @returns {string|null} veljavna koda ali null
 */
export function normalizeRoomCode(input) {
  const c = String(input || '').trim().toUpperCase();
  return ROOM_CODE_RE.test(c) ? c : null;
}

/** XP, potreben za prehod z nivoja `level` na `level + 1`. */
export function xpForLevel(level) {
  return 100 + (level - 1) * 75;
}

/**
 * Krivulja nivojev: vsak naslednji nivo zahteva 75 XP več (100, 175, 250 …).
 * @param {number} xp skupni XP
 * @returns {{level:number, current:number, next:number, progress:number}}
 *   current = XP znotraj trenutnega nivoja, next = XP do naslednjega nivoja (dolžina nivoja)
 */
export function level(xp) {
  let lvl = 1, rest = Math.max(0, Math.floor(xp || 0));
  while (rest >= xpForLevel(lvl)) { rest -= xpForLevel(lvl); lvl++; }
  const next = xpForLevel(lvl);
  return { level: lvl, current: rest, next, progress: rest / next };
}

/**
 * Koliko XP se dejansko podeli glede na omejitve.
 * @param {number} amount zahtevano
 * @param {number} usedToday že podeljeno danes
 */
export function grantableXp(amount, usedToday) {
  const a = Math.floor(amount || 0);
  if (a <= 0) return 0;
  return Math.max(0, Math.min(a, XP_PER_CALL, XP_PER_DAY - usedToday));
}

/**
 * Preveri vzdevek. Vrne sporočilo napake ali null.
 * @param {string} nick
 */
export function validateNickname(nick) {
  const n = String(nick || '').trim();
  if (n.length < 2) return 'Vzdevek mora imeti vsaj 2 znaka.';
  if (n.length > 16) return 'Vzdevek ima lahko največ 16 znakov.';
  if (/[<>]/.test(n)) return 'Vzdevek ne sme vsebovati znakov < in >.';
  return null;
}

/**
 * Kdo je host: trenutni host, če je prisoten; sicer prisotni igralec z najstarejšim joinedAt
 * (ob enakosti odloča id). Vsi klienti izračunajo isto.
 * @param {{id:string, joinedAt:string|number}[]} present prisotni igralci
 * @param {string|null} currentHostId
 * @returns {string|null}
 */
export function pickHost(present, currentHostId) {
  if (!present.length) return null;
  if (currentHostId && present.some(p => p.id === currentHostId)) return currentHostId;
  const sorted = present.slice().sort((a, b) =>
    (new Date(a.joinedAt) - new Date(b.joinedAt)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sorted[0].id;
}

/**
 * Najboljši rezultat vsakega igralca (za lokalno lestvico).
 * @param {{user_id:string, score:number, seed?:string|null, created_at:string}[]} rows
 * @param {{seed?:string|null, since?:Date|null, asc?:boolean, limit?:number}} opt
 */
export function bestPerUser(rows, { seed = null, since = null, asc = false, limit = 10 } = {}) {
  const better = (a, b) => asc ? a.score < b.score : a.score > b.score;
  const best = new Map();
  for (const r of rows) {
    if (seed != null && r.seed !== seed) continue;
    if (since && new Date(r.created_at) < since) continue;
    const cur = best.get(r.user_id);
    if (!cur || better(r, cur) || (r.score === cur.score && r.created_at < cur.created_at)) best.set(r.user_id, r);
  }
  return [...best.values()]
    .sort((a, b) => (asc ? a.score - b.score : b.score - a.score) || (a.created_at < b.created_at ? -1 : 1))
    .slice(0, Math.max(1, Math.min(limit, 100)));
}

/**
 * Slovenska množina: plural(1,'dan','dneva','dnevi','dni') → '1 dan', 2 → '2 dneva', 3 → '3 dnevi', 5 → '5 dni'.
 */
export function plural(n, one, two, few, many) {
  const m = Math.abs(n) % 100;
  const w = m === 1 ? one : m === 2 ? two : (m === 3 || m === 4) ? few : many;
  return `${n} ${w}`;
}

/** Escape za vstavljanje v HTML. */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Naključen UUID v4 (crypto.randomUUID, če obstaja). */
export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}

/** Prednastavljeni avatarji (emoji) in barve. */
export const AVATAR_EMOJIS = ['🙂', '😎', '🤖', '👾', '🐸', '🦊', '🐼', '🐙', '🦄', '🐲', '👻', '🎃', '🍕', '🚀', '⚡', '🔥', '💎', '🎯', '🐱', '🐶', '🦁', '🐵', '🌵', '🍄'];
export const AVATAR_COLORS = ['#ffd23f', '#ff4fd8', '#39ff88', '#6fd3ff', '#ff7a1a', '#ff3b4a', '#a78bfa', '#f4f8ff'];

/** Naključen avatar. */
export function randomAvatar(random = Math.random) {
  return {
    emoji: AVATAR_EMOJIS[Math.floor(random() * AVATAR_EMOJIS.length)],
    color: AVATAR_COLORS[Math.floor(random() * AVATAR_COLORS.length)],
  };
}

/**
 * Preprost validator JSON Scheme (podmnožica: type, required, properties, items,
 * enum, pattern, minLength, maxLength, minimum, maximum, minItems, uniqueItems,
 * additionalProperties:false). Dovolj za games.schema.json.
 * @returns {string[]} seznam napak (prazen = veljavno)
 */
export function validateSchema(value, schema, path = '$') {
  const errs = [];
  const t = Array.isArray(value) ? 'array' : value === null ? 'null' : Number.isInteger(value) ? 'integer' : typeof value;
  if (schema.type) {
    const types = [].concat(schema.type);
    const ok = types.some(x => x === t || (x === 'number' && t === 'integer'));
    if (!ok) return [`${path}: pričakovan tip ${types.join('|')}, dobljen ${t}`];
  }
  if (schema.enum && !schema.enum.includes(value)) errs.push(`${path}: vrednost ${JSON.stringify(value)} ni med ${schema.enum.join(', ')}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: prekratko`);
    if (schema.maxLength != null && value.length > schema.maxLength) errs.push(`${path}: predolgo`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errs.push(`${path}: ne ustreza vzorcu ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) errs.push(`${path}: manj kot ${schema.minimum}`);
    if (schema.maximum != null && value > schema.maximum) errs.push(`${path}: več kot ${schema.maximum}`);
  }
  if (t === 'array') {
    if (schema.minItems != null && value.length < schema.minItems) errs.push(`${path}: premalo elementov`);
    if (schema.uniqueItems && new Set(value.map(v => JSON.stringify(v))).size !== value.length) errs.push(`${path}: elementi se ponavljajo`);
    if (schema.items) value.forEach((v, i) => errs.push(...validateSchema(v, schema.items, `${path}[${i}]`)));
  }
  if (t === 'object') {
    for (const k of schema.required || []) if (!(k in value)) errs.push(`${path}: manjka »${k}«`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errs.push(...validateSchema(v, props[k], `${path}.${k}`));
      else if (schema.additionalProperties === false) errs.push(`${path}: nepričakovano polje »${k}«`);
    }
  }
  return errs;
}

/**
 * Dodatna preverjanja registra iger, ki jih shema ne zajame.
 * @returns {string[]} napake
 */
export function validateGames(games, schema) {
  const errs = validateSchema(games, schema);
  if (errs.length) return errs;
  const ids = new Set();
  games.forEach((g, i) => {
    if (ids.has(g.id)) errs.push(`$[${i}]: podvojen id »${g.id}«`);
    ids.add(g.id);
    if (g.players.min > g.players.max) errs.push(`$[${i}]: players.min > players.max`);
    if (g.mode === 'single' && g.players.max !== 1) errs.push(`$[${i}]: način single mora imeti max 1 igralca`);
    if (g.status === 'live' && !g.path) errs.push(`$[${i}]: igra live potrebuje path`);
  });
  return errs;
}
