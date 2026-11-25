/* =====================================================================
   SMUČARSKI SKOKI — jumpers.js: lastni skakalci (»Moji skakalci«),
   izvoz/uvoz seznama, statistika po skakalcu in vgrajena izmišljena imena
   botov. Brez DOM-a (shranjevanje je v game.js prek shared/storage.js).

   Skakalec: { id, name, flag, suit, helmet, type: 'human'|'bot', skill (0–1), style }
   Igra SAMA ne ponuja imen pravih skakalcev: vgrajeni boti imajo izmišljena imena;
   kar igralec vpiše v urejevalnik, je njegovo.
   ===================================================================== */
import { BOT_STYLES } from './bot.js';
export { BOT_STYLES as BOT_STYLES_NAMES };
import { rng, shuffled } from '../../shared/sport/competition.js';

export const JUMPERS_MAX = 60;
export const IMPORT_MAX_CHARS = 20000;
export const CODE_PREFIX = 'SKOKI1:';

/** Zastave (izmišljene države so dovoljene; ključ = koda, ki gre v izvoz). */
export const FLAGS = {
  si: '🇸🇮', at: '🇦🇹', de: '🇩🇪', no: '🇳🇴', pl: '🇵🇱', jp: '🇯🇵', fi: '🇫🇮', ch: '🇨🇭', it: '🇮🇹', fr: '🇫🇷',
  cz: '🇨🇿', sk: '🇸🇰', hr: '🇭🇷', se: '🇸🇪', us: '🇺🇸', ca: '🇨🇦', kr: '🇰🇷', cn: '🇨🇳', ee: '🇪🇪', kz: '🇰🇿',
  tr: '🇹🇷', ro: '🇷🇴', bg: '🇧🇬', ua: '🇺🇦', gb: '🇬🇧', is: '🇮🇸', es: '🇪🇸', nl: '🇳🇱', be: '🇧🇪', br: '🇧🇷',
  pirat: '🏴‍☠️', mavrica: '🏳️‍🌈', bela: '🏳️', karo: '🏁',
};
export const flagOf = code => FLAGS[code] || '🏳️';

const HEX = /^#[0-9a-f]{6}$/i;
const FIELDS = ['id', 'name', 'flag', 'suit', 'helmet', 'type', 'skill', 'style'];

/** Nov skakalec s privzetimi vrednostmi. */
export function newJumper(o = {}, idSeed = Math.random()) {
  return normalizeJumper({ id: 'j' + Math.floor(idSeed * 1e9).toString(36), name: 'Skakalec', flag: 'si', suit: '#1e66ff', helmet: '#ffd23f', type: 'human', skill: 0.7, style: 'normal', ...o });
}

/**
 * Preveri in normaliziraj enega skakalca. Vrne { j, unknown } ali null (neveljaven).
 * unknown = število neznanih polj (se zavržejo).
 */
export function checkJumper(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const unknown = Object.keys(o).filter(k => !FIELDS.includes(k)).length;
  const name = typeof o.name === 'string' ? o.name.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 24) : '';
  if (name.length < 1) return null;
  const id = typeof o.id === 'string' && /^[a-z0-9_-]{1,16}$/i.test(o.id) ? o.id : null;
  if (!id) return null;
  const j = {
    id, name,
    flag: typeof o.flag === 'string' && FLAGS[o.flag] ? o.flag : 'bela',
    suit: typeof o.suit === 'string' && HEX.test(o.suit) ? o.suit.toLowerCase() : '#1e66ff',
    helmet: typeof o.helmet === 'string' && HEX.test(o.helmet) ? o.helmet.toLowerCase() : '#ffd23f',
    type: o.type === 'bot' ? 'bot' : 'human',
    skill: Math.round(Math.max(0, Math.min(1, Number.isFinite(+o.skill) ? +o.skill : 0.7)) * 100) / 100,
    style: typeof o.style === 'string' && BOT_STYLES[o.style] ? o.style : 'normal',
  };
  return { j, unknown };
}
export const normalizeJumper = o => checkJumper(o)?.j || null;

/**
 * Preveri seznam (npr. iz localStorage ali uvoza).
 * @returns {{list:Object[], errors:string[], warnings:string[]}}
 */
export function validateList(arr) {
  const errors = [], warnings = [];
  if (!Array.isArray(arr)) return { list: [], errors: ['Seznam mora biti tabela skakalcev.'], warnings };
  if (arr.length > JUMPERS_MAX) errors.push(`Preveč skakalcev (${arr.length}, največ ${JUMPERS_MAX}).`);
  const list = [], ids = new Set();
  let bad = 0, unk = 0;
  for (const o of arr.slice(0, JUMPERS_MAX)) {
    const c = checkJumper(o);
    if (!c) { bad++; continue; }
    unk += c.unknown;
    if (ids.has(c.j.id)) c.j.id = c.j.id.slice(0, 12) + list.length.toString(36);
    ids.add(c.j.id);
    list.push(c.j);
  }
  if (bad) warnings.push(`${bad} neveljavnih vnosov je izpuščenih.`);
  if (unk) warnings.push(`${unk} neznanih polj je izpuščenih.`);
  return { list, errors, warnings };
}

/* ------------------------------------------------------------ izvoz / uvoz */

const b64e = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64d = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); };

/** Kompakten zapis seznama (polja v fiksnem vrstnem redu). */
export function exportJson(list) {
  return JSON.stringify({ v: 1, jumpers: list.map(j => ({ id: j.id, name: j.name, flag: j.flag, suit: j.suit, helmet: j.helmet, type: j.type, skill: j.skill, style: j.style })) });
}
/** Kratka koda za deljenje (prilepi v sporočilo). */
export function exportCode(list) {
  const rows = list.map(j => [j.id, j.name, j.flag, j.suit.slice(1), j.helmet.slice(1), j.type === 'bot' ? 1 : 0, Math.round(j.skill * 100), Object.keys(BOT_STYLES).indexOf(j.style)]);
  return CODE_PREFIX + b64e(JSON.stringify(rows));
}

/**
 * Uvozi seznam iz kode ali JSON-a (datoteke).
 * @returns {{list:Object[], errors:string[], warnings:string[]}}
 */
export function importList(text) {
  if (typeof text !== 'string' || !text.trim()) return { list: [], errors: ['Prazen vnos.'], warnings: [] };
  text = text.trim();
  if (text.length > IMPORT_MAX_CHARS) return { list: [], errors: [`Vnos je prevelik (${text.length} znakov, največ ${IMPORT_MAX_CHARS}).`], warnings: [] };
  let arr;
  try {
    if (text.startsWith(CODE_PREFIX)) {
      const rows = JSON.parse(b64d(text.slice(CODE_PREFIX.length)));
      if (!Array.isArray(rows)) throw new Error();
      const styles = Object.keys(BOT_STYLES);
      arr = rows.map(r => Array.isArray(r) ? { id: r[0], name: r[1], flag: r[2], suit: '#' + r[3], helmet: '#' + r[4], type: r[5] ? 'bot' : 'human', skill: (+r[6] || 0) / 100, style: styles[r[7]] || 'normal' } : null);
    } else {
      const o = JSON.parse(text);
      arr = Array.isArray(o) ? o : o?.jumpers;
    }
  } catch { return { list: [], errors: ['Koda ali datoteka je pokvarjena.'], warnings: [] }; }
  return validateList(arr);
}

/* ------------------------------------------------------------ statistika po skakalcu */

/** Prazna statistika enega skakalca. */
const emptyStat = () => ({ jumps: 0, falls: 0, best: {}, wins: 0, podiums: 0, comps: 0 });

/**
 * Dodaj rezultate lokalne tekme v statistiko (vrne NOVO statistiko).
 * @param {Object} stats { [jumperId]: { jumps, falls, best: { hillId: dist }, wins, podiums, comps } }
 * @param {{hill:string, jumps:Array<{id:string, dist:number, fall:boolean}>, standings:Array<{id:string, rank:number|null}>}} comp
 */
export function addCompetitionStats(stats, comp) {
  const out = structuredClone(stats || {});
  const get = id => (out[id] ||= emptyStat());
  for (const j of comp.jumps) {
    const s = get(j.id);
    s.jumps++;
    if (j.fall) s.falls++;
    else if (!(s.best[comp.hill] >= j.dist)) s.best[comp.hill] = j.dist;
  }
  for (const r of comp.standings) {
    const s = get(r.id);
    s.comps++;
    if (r.rank === 1) s.wins++;
    if (r.rank && r.rank <= 3) s.podiums++;
  }
  return out;
}

/** Tabela »sezone tvoje lige«: skakalci po zmagah, stopničkah, skokih. */
export function statsTable(list, stats) {
  return list.map(j => {
    const s = stats?.[j.id] || emptyStat();
    const bestAll = Math.max(0, ...Object.values(s.best));
    return { ...j, ...s, bestAll };
  }).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || b.bestAll - a.bestAll || a.name.localeCompare(b.name, 'sl'));
}

/* ------------------------------------------------------------ vgrajeni (izmišljeni) boti */

/** Izmišljena imena z zastavami — ne pravi skakalci. */
export const BOT_NAMES = [
  ['Janez Zaletnik', 'si'], ['Tone Telemark', 'si'], ['Miha Mizica', 'si'], ['Rok Odrivnik', 'si'], ['Pepi Plužek', 'si'],
  ['Franci Firbec', 'si'], ['Jure Jadralec', 'si'], ['Lojze Letalec', 'si'], ['Štef Šmorn', 'si'], ['Cene Čelni', 'si'],
  ['Gašper Grbina', 'si'], ['Matic Metraža', 'si'], ['Žiga Žirija', 'si'], ['Blaž Bunkica', 'si'], ['Nace Naklon', 'si'],
  ['Hansi Hupfinger', 'at'], ['Sepp Schanzenhuber', 'at'], ['Fritz Flugmeier', 'de'], ['Klaus Kantenwurst', 'de'],
  ['Ole Fjellhopp', 'no'], ['Lars Langtflyg', 'no'], ['Sven Snøfnugg', 'no'], ['Bartek Skoczylas', 'pl'], ['Kuba Wiatrak', 'pl'],
  ['Taro Tobisuke', 'jp'], ['Kenji Kazemachi', 'jp'], ['Aki Lentokone', 'fi'], ['Pekka Pakkanen', 'fi'],
  ['Urs Bergflieger', 'ch'], ['Beni Sprungli', 'ch'], ['Luigi Volante', 'it'], ['Pierre Planeur', 'fr'],
  ['Vašek Skokan', 'cz'], ['Ferko Letún', 'sk'], ['Ivo Odskok', 'hr'], ['Nils Hoppsan', 'se'],
  ['Chuck Bigair', 'us'], ['Gord Mapleleaf', 'ca'], ['Aivar Tuulelohe', 'ee'], ['Erlan Burkitbay', 'kz'],
  ['Gunnar Gormsson', 'is'], ['Kapitan Kljukec', 'pirat'], ['Mavrični Mitja', 'mavrica'],
];

/** Spretnosti za izbiro »Začetniki / Mešano / Svetovni razred«. */
export const BOT_LEVELS = {
  zacetniki: { name: 'Začetniki', min: 0.15, max: 0.45 },
  meseno: { name: 'Mešano', min: 0.3, max: 0.95 },
  svetovni: { name: 'Svetovni razred', min: 0.8, max: 1 },
};

/**
 * n vgrajenih botov iz seeda (izmišljena imena, zastave, spretnost po nivoju, značaj).
 * @returns {Array<{id, name, flag, type:'bot', skill, style, suit, helmet}>}
 */
export function builtinBots(n, level = 'meseno', seed = 'boti') {
  const L = BOT_LEVELS[level] || BOT_LEVELS.meseno;
  const r = rng(seed + ':' + level);
  const names = shuffled(BOT_NAMES.map((_, i) => i), seed + ':imena');
  const styles = Object.keys(BOT_STYLES);
  const colors = ['#e63946', '#1d3557', '#f1c40f', '#2a9d8f', '#ff7a1a', '#7b2cbf', '#3a86ff', '#ff4fd8', '#222831', '#39ff88'];
  const out = [];
  for (let i = 0; i < Math.min(n, 20); i++) {
    const [name, flag] = BOT_NAMES[names[i % names.length]];
    out.push({
      id: 'bot' + i, name, flag, type: 'bot',
      skill: Math.round((L.min + r() * (L.max - L.min)) * 100) / 100,
      style: styles[Math.floor(r() * styles.length)],
      suit: colors[Math.floor(r() * colors.length)], helmet: colors[Math.floor(r() * colors.length)],
    });
  }
  return out;
}
