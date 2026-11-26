/* =====================================================================
   HRČKOVA KROGLA — editor/share.js: deljenje proge s povezavo brez strežnika.
   JSON (kompaktno) → deflate prek CompressionStream (če je na voljo) → base64url.
   Predpona: »z« = stisnjeno, »j« = nestisnjeno. Dekodiranje omeji velikost in vedno validira.
   ===================================================================== */
import { validateLevel } from '../level.js';
import { MAX_W, MAX_D } from './model.js';

export const MAX_LINK = 8000;          // nad tem povezava ni zanesljiva (brskalniki, sporočila)
const MAX_IN = 200000;                 // znakov v ?custom=
const MAX_JSON = 400000;               // bajtov po razširitvi

/** Polja proge, ki jih sprejmemo od drugod (ostalo zavržemo). */
const KEYS = ['id', 'name', 'set', 'desc', 'size', 'theme', 'look', 'camYaw', 'timeBonus', 'medals', 'map', 'hmap', 'start', 'goal', 'checkpoints', 'pickups',
  'movers', 'spinners', 'springs', 'fans', 'bumpers', 'bowls', 'hammers', 'switches', 'doors', 'blocks', 'enemies', 'route', 'routes', 'shortcuts', 'diff', 'len', 'tags', 'scoring', 'dev'];

const hasCS = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

function b64uEncode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uDecode(s) {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Povezava vsebuje neveljavne znake.');
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream, limit = Infinity) {
  const rd = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await rd.read();
    if (done) break;
    n += value.length;
    if (n > limit) { rd.cancel().catch(() => {}); throw new Error('Proga v povezavi je prevelika.'); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** Proga → podatki za ?custom= (base64url). */
export async function encodeLevel(L) {
  const json = JSON.stringify(pick(L));
  const bytes = new TextEncoder().encode(json);
  if (hasCS()) {
    try { return 'z' + b64uEncode(await pipe(bytes, new CompressionStream('deflate'))); } catch { /* brez stiskanja */ }
  }
  return 'j' + b64uEncode(bytes);
}

function pick(L) {
  const o = {};
  for (const k of KEYS) if (L[k] !== undefined) o[k] = L[k];
  return o;
}

/**
 * Podatki iz ?custom= → preverjena proga. Ob napaki vrže Error s slovenskim sporočilom.
 * @param {string} data
 */
export async function decodeLevel(data) {
  if (typeof data !== 'string' || data.length < 2) throw new Error('Povezava je prazna ali odrezana.');
  if (data.length > MAX_IN) throw new Error('Povezava je predolga.');
  let bytes;
  try { bytes = b64uDecode(data.slice(1)); } catch (e) { throw new Error(e.message.startsWith('Povezava') ? e.message : 'Povezava je pokvarjena (base64).'); }
  if (data[0] === 'z') {
    if (!hasCS()) throw new Error('Ta brskalnik ne zna razširiti stisnjene proge.');
    try { bytes = await pipe(bytes, new DecompressionStream('deflate'), MAX_JSON); }
    catch (e) { throw new Error(/prevelika/.test(e.message) ? e.message : 'Povezava je pokvarjena (stiskanje).'); }
  } else if (data[0] !== 'j') throw new Error('Neznana oblika povezave.');
  if (bytes.length > MAX_JSON) throw new Error('Proga v povezavi je prevelika.');
  let L;
  try { L = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('Povezava je pokvarjena (JSON).'); }
  return sanitizeLevel(L);
}

/** Preveri progo iz tujega vira (datoteka, odložišče, povezava). Vrne očiščeno progo ali vrže Error. */
export function sanitizeLevel(L) {
  if (!L || typeof L !== 'object' || Array.isArray(L)) throw new Error('To ni proga.');
  const o = pick(L);
  if (!Array.isArray(o.map) || o.map.length > MAX_D || o.map.some(r => typeof r !== 'string' || r.length > MAX_W)) throw new Error(`Mreža proge je prevelika (največ ${MAX_W}×${MAX_D}).`);
  if (o.hmap && (!Array.isArray(o.hmap) || o.hmap.some(r => typeof r !== 'string' || r.length > MAX_W))) throw new Error('Višine proge niso veljavne.');
  if (typeof o.name === 'string') o.name = o.name.slice(0, 60);
  if (typeof o.desc === 'string') o.desc = o.desc.slice(0, 300);
  for (const k of ['pickups', 'movers', 'spinners', 'springs', 'fans', 'bumpers', 'bowls', 'hammers', 'switches', 'doors', 'blocks', 'enemies', 'route', 'checkpoints']) {
    if (o[k] !== undefined && (!Array.isArray(o[k]) || o[k].length > 400)) throw new Error(`Polje ${k} ni veljavno.`);
  }
  const errs = validateLevel(o);
  if (errs.length) { const e = new Error('Proga ni veljavna: ' + errs.slice(0, 3).join('; ')); e.errors = errs; throw e; }
  return o;
}
