/* =====================================================================
   SMUČARSKI SKOKI — contest.js: skakalni del tekme (brez DOM-a):
   simulacija skoka iz zapisa vnosov (za host in gledalce), veter serije,
   samodejna žirija (znižanje zaleta), »za vodstvo potrebuje«, posebne
   nagrade, dnevni izziv (skakalnica, veter in pogoj dneva), odklepanje
   skakalnic, XP. Splošni del tekmovanja je v sport/competition.js.
   ===================================================================== */
import { createJump, MAX_TICKS } from './physics.js';
import { inputFrom } from './ghost.js';
import { judgeScores } from './judges.js';
import { scoreJump, distancePoints, gatePoints, windPoints } from './scoring.js';
import { hashStr, rng } from './sport/competition.js';
import { noise1, clamp } from './dmath.js';
import { WIND_MAX, createWind } from './wind.js';

/* ------------------------------------------------------------ nastavitve tekme */

export const FORMATS = {
  one: { name: 'Ena serija', rounds: 1, trial: false },
  two: { name: 'Dve seriji', rounds: 2, trial: false },
  trial2: { name: 'Poskusna + dve seriji', rounds: 2, trial: true },
};
export const WIND_MODES = { same: 'Enak za vse', var: 'Spremenljiv (s kompenzacijo)', off: 'Brez vetra' };
export const START_SEC = 10;     // po zeleni luči za štart
export const JUMPER_SEC = 90;    // skupni čas na skakalca

export const DEFAULT_CONTEST = { hill: 'bistra', format: 'two', cut: 0, wind: 'same', jury: 'auto', gate: null, relaxed: false, bots: 0, botLevel: 'meseno', botSource: 'builtin', teams: 0 };

/** Normaliziraj nastavitve iz lobbyja (tuj vnos). */
export function contestSettings(o = {}, hillIds = []) {
  const s = { ...DEFAULT_CONTEST };
  if (typeof o.hill === 'string' && (o.hill === 'random' || hillIds.includes(o.hill))) s.hill = o.hill;
  if (FORMATS[o.format]) s.format = o.format;
  s.cut = Math.max(0, Math.min(60, o.cut | 0));
  if (WIND_MODES[o.wind]) s.wind = o.wind;
  s.jury = o.jury === 'manual' ? 'manual' : 'auto';
  s.gate = o.gate == null ? null : Math.max(1, Math.min(60, o.gate | 0));
  s.relaxed = !!o.relaxed;
  s.bots = Math.max(0, Math.min(20, o.bots | 0));
  s.botLevel = ['zacetniki', 'meseno', 'svetovni'].includes(o.botLevel) ? o.botLevel : 'meseno';
  s.botSource = o.botSource === 'mine' ? 'mine' : 'builtin';
  s.teams = [0, 2, 3, 4].includes(o.teams | 0) ? o.teams | 0 : 0;
  return s;
}

/* ------------------------------------------------------------ veter in zalet serije */

/**
 * Ustaljen veter (tekma, rekord skakalnice): povprečje serije iz seeda (−3 … +3 m/s, bolj verjetno blizu 0) in počasen
 * zdrs od skoka do skoka (do ±1 m/s), zato so razlike med zaporednimi skakalci majhne. i = zaporedni skok (štartna številka).
 * @returns {number} povprečni veter (m/s, + = čelni, na 0,1)
 */
export function steadyMean(seriesSeed, i = 0) {
  const h = hashStr(String(seriesSeed));
  const u = rng(h)() * 2 - 1;
  const base = u * (0.55 + 0.45 * Math.abs(u)) * WIND_MAX;
  const drift = noise1(i / 5, h & 0xffff) * 1.0;
  return Math.round(clamp(base + drift, -WIND_MAX, WIND_MAX) * 10) / 10;
}

/**
 * Konfiguracija vetra za skok.
 * same: isti profil za vse v seriji (seed serije) · var: ustaljen veter serije z rahlim zdrsom od skakalca do skakalca
 * (steadyMean) in zmernimi sunki · off: brez.
 */
export function seriesWind(mode, seriesSeed, bib = 0, mods = null) {
  if (mode === 'off') return { mode: 'off', seed: 0 };
  const seed = mode === 'var' ? hashStr(seriesSeed + ':' + bib) : hashStr(String(seriesSeed));
  if (mods?.windMean != null) return { mode: 'const', seed, speed: mods.windMean };
  if (mode === 'var') return { mode: 'steady', seed, speed: steadyMean(seriesSeed, bib) };
  return { mode: 'random', seed };
}

/**
 * Samodejna žirija (FIS ICR 402.1.2, 422.5–422.8). Stanje:
 *   { auto, gate (trenutno), start (referenca serije za kompenzacijo), base (začetno mesto, zmanjšano po dolgih skokih),
 *     fresh (serija se še ni začela), lowered: [{ after, from, to }] }
 * Pred skokom (juryBeforeJump) žirija pogleda napoved vetra: veter preračuna v zaletna mesta (točke vetra / točke na mesto)
 * — čelni veter = nižji zalet, hrbtni = višji. Na začetku serije tako izbere začetno mesto (to je referenca kompenzacije),
 * med serijo pa zalet spremeni le, ko se želeno mesto razlikuje za vsaj 2 (občasno, kot na tekmah). Kompenzacija
 * (gatePoints) izravna spremembo.
 * Po skoku (juryAfterJump) čez 95 % HS (tudi pri padcu) zniža zalet za 1 (čez HS + 3 m za 2). Zalet ne gre pod 1.
 */
export function createJury(def, { auto = true, gate = null } = {}) {
  const start = Math.max(1, Math.min(def.gates.count, gate ?? def.gates.default));
  return { auto, gate: start, start, base: start, plan: start, fresh: true, lowered: [] };
}

/** Napoved vetra za skok (povprečje profila, m/s) — žirija in »za vodstvo«. */
export const windForecast = (cfg, P) => cfg?.mode === 'off' ? 0 : createWind(cfg, P).mean;

/** Želeno zaletno mesto za napovedani veter (m/s, + = čelni) okoli osnovnega mesta. */
export function windGate(def, base, wind) {
  const eq = windPoints(def, wind) / (def.gateFactor || 1);   // čelni: negativne točke → nižje mesto
  const lo = Math.max(1, base - 8), hi = Math.min(def.gates.count, base + 4);
  return Math.max(lo, Math.min(hi, base + Math.round(eq)));
}

/**
 * Pred skokom: žirija po potrebi prilagodi zalet vetru.
 * @param {Object} jury stanje
 * @param {Object} def skakalnica
 * @param {number} wind napovedani povprečni veter za ta skok (m/s)
 * @param {{always?:boolean}} [o] always: vedno na želeno mesto (rekord skakalnice — vsak skok svoje mesto)
 * @returns {{jury:Object, change:{from:number, to:number, wind:number, reason:'wind'}|null, msg:string|null}}
 */
export function juryBeforeJump(jury, def, wind, { always = false } = {}) {
  if (!jury.auto) return { jury, change: null, msg: null };
  const want = windGate(def, jury.base, wind);
  if (jury.fresh) {
    // začetek serije: žirija izbere začetno mesto po vetru — to je referenca serije (brez kompenzacije)
    const j = { ...jury, gate: want, start: always ? jury.start : want, fresh: false };
    return { jury: j, change: always && want !== jury.start ? { from: jury.start, to: want, wind, reason: 'wind' } : null, msg: !always && want !== jury.base ? `Žirija je zaradi vetra (${windText(wind)}) začela serijo z zaletnega mesta ${want}.` : null };
  }
  if (want === jury.gate || (!always && Math.abs(want - jury.gate) < 2)) return { jury, change: null, msg: null };
  const j = { ...jury, gate: want };
  return { jury: j, change: { from: jury.gate, to: want, wind, reason: 'wind' }, msg: `Žirija je zaradi vetra (${windText(wind)}) ${want < jury.gate ? 'znižala' : 'zvišala'} zalet na ${want}.` };
}
const windText = w => (w > 0 ? 'čelni ' : w < 0 ? 'hrbtni ' : '') + (Math.round(Math.abs(w) * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1 }) + ' m/s';

/** Po skoku: vrne { jury: novo stanje, msg | null }. */
export function juryAfterJump(jury, def, { dist, name = '' }) {
  if (!jury.auto) return { jury, msg: null };
  if (!(dist >= def.hs * 0.95)) return { jury, msg: null };
  const by = dist >= def.hs + 3 ? 2 : 1;
  const to = Math.max(1, jury.gate - by);
  if (to === jury.gate) return { jury, msg: null };
  const j = { ...jury, gate: to, base: Math.max(1, jury.base - by), lowered: [...jury.lowered, { after: name, from: jury.gate, to }] };
  return { jury: j, msg: `Žirija je znižala zalet na ${to}.` };
}
/** Nova serija: žirija začne znova pri osnovnem mestu, začetno mesto spet izbere po vetru (vsaka serija ima svojo referenco). */
export const juryNewRound = jury => ({ ...jury, gate: jury.plan ?? jury.start, start: jury.plan ?? jury.start, base: jury.plan ?? jury.start, fresh: true, lowered: [] });

/* ------------------------------------------------------------ simulacija iz vnosov */

/**
 * Simuliraj skok iz zapisa vnosov (host, gledalec, lokalna tekma). Deterministično.
 * @param {{hill:Object, P:Object, gate:number, refGate?:number, wind:Object, changes:Array, mods?:Object, judgeSeed:number, teleOnly?:boolean}} o
 * @returns {{dist:number, type:string, fall:boolean, total:number, style:number, windAvg:number, windPts:number, gatePts:number, distPts:number, judges:number[], ticks:number, speed:number}}
 */
export function simulateFromInputs({ hill, P, gate, refGate, wind, changes, mods = null, judgeSeed = 1, teleOnly = false }) {
  const J = createJump({ hill, P, gate, wind, mods });
  const inp = inputFrom(changes);
  while (!J.done && J.s.tick <= MAX_TICKS) { J.step(inp(J.s, J.s.tick)); J.ev.length = 0; }
  return resultOf(J.s, hill.def, P, { gate, refGate, judgeSeed, teleOnly });
}

/** Točke končanega skoka (enako v igri in pri hostu). */
export function resultOf(s, def, P, { gate, refGate, judgeSeed, teleOnly = false }) {
  const L = s.landing || { type: 'fall', dist: 0, windAvg: 0 };
  // »Samo telemark šteje«: pristanek brez telemarka sodniki ocenijo kot padec
  const js = teleOnly && L.type !== 'tele' && L.type !== 'fall' ? { ...s, landing: { ...L, type: 'fall' } } : s;
  const judges = judgeScores(js, P, judgeSeed >>> 0);
  const r = scoreJump(def, { dist: L.dist, judges, wind: L.windAvg, gate, refGate });
  return {
    dist: L.dist, type: L.type, fall: L.type === 'fall' || L.type === 'touch', total: r.total, style: r.style, windAvg: r.wind, wind: r.wind, gate, windPts: r.windPts,
    gatePts: r.gatePts, distPts: r.distPts, judges: r.judges, dropped: r.dropped, ticks: s.tick, speed: s.tableSpeed, perfect: !!s.takeoff?.perfect,
  };
}

/** Primerjava rezultatov skakalca in hosta (iste točke, daljava, tip pristanka). */
export const sameResult = (a, b) => !!a && !!b && a.dist === b.dist && a.total === b.total && a.type === b.type;

/* ------------------------------------------------------------ za vodstvo potrebuje … */

/**
 * Daljava, ki bi pri tem zaletu in vetru prinesla vodstvo (kot na TV). Predpostavi slog 54 točk.
 * @returns {number|null} daljava (m, na 0,5) ali null (vodstvo ni mogoče / ni potrebno)
 */
export function distForLead(def, { leaderTotal, myTotal = 0, gate, refGate, windAvg = 0, style = 54 }) {
  const need = leaderTotal - myTotal + 0.1;
  const comp = gatePoints(def, gate, refGate ?? def.gates.default) + windPoints(def, windAvg);
  const distPts = need - style - comp;
  const d = def.k + (distPts - def.base) / def.meterValue;
  if (!(d > 0) || d > def.hs + 25) return null;
  const r = Math.ceil(d * 2) / 2;
  return distancePoints(def, r) >= 0 ? r : null;
}

/* ------------------------------------------------------------ posebne nagrade (vtičniki za competition.prizes) */

const fmt1 = v => (Math.round(v * 10) / 10).toLocaleString('sl-SI', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const PRIZES = [
  { key: 'najdaljsi', title: 'Najdaljši skok', icon: '📏', pick: res => {
    const b = res.filter(r => r.status === 'ok' && r.data && !r.data.fall).sort((a, b) => b.data.dist - a.data.dist)[0];
    return b ? { id: b.id, text: fmt1(b.data.dist) + ' m' } : null;
  } },
  { key: 'slog', title: 'Najlepši slog', icon: '🧑‍⚖️', pick: res => {
    const b = res.filter(r => r.status === 'ok' && r.data).sort((a, b) => b.data.style - a.data.style)[0];
    return b ? { id: b.id, text: fmt1(b.data.style) + ' t sloga' } : null;
  } },
  { key: 'veter', title: 'Najbolj nesrečen veter', icon: '🌬️', pick: res => {
    const b = res.filter(r => r.status === 'ok' && r.data && r.data.windAvg < -0.3).sort((a, b) => a.data.windAvg - b.data.windAvg)[0];
    return b ? { id: b.id, text: fmt1(b.data.windAvg) + ' m/s v hrbet' } : null;
  } },
  { key: 'padci', title: 'Kralj padcev', icon: '👑', pick: res => {
    const m = new Map();
    for (const r of res) if (r.data?.fall) m.set(r.id, (m.get(r.id) || 0) + 1);
    const b = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return b ? { id: b[0], text: b[1] + (b[1] === 1 ? ' padec' : b[1] === 2 ? ' padca' : ' padci') } : null;
  } },
  { key: 'napredek', title: 'Največji napredek v 2. seriji', icon: '📈', pick: res => {
    const s1 = new Map(res.filter(r => r.num === 1 && r.status === 'ok').map(r => [r.id, r.score]));
    let best = null;
    for (const r of res) if (r.num === 2 && r.status === 'ok' && s1.has(r.id)) { const d = r.score - s1.get(r.id); if (d > 0 && (!best || d > best.d)) best = { id: r.id, d }; }
    return best ? { id: best.id, text: '+' + fmt1(best.d) + ' t' } : null;
  } },
];

/* ------------------------------------------------------------ dnevni izziv */

export const CONDITIONS = [
  { id: 'sneg', name: 'Sneženje', icon: '🌨️', desc: 'Slabša vidljivost in malo več trenja v smučini.', mods: { inrunMu: 1.25, snow: 1, fog: 2.2 } },
  { id: 'noc', name: 'Noč pod reflektorji', icon: '🌙', desc: 'Skakalnica je osvetljena le z reflektorji.', mods: { night: 1 } },
  { id: 'sunki', name: 'Sunkovit veter', icon: '🌪️', desc: 'Sunki so dvakrat močnejši kot običajno.', mods: { gust: 2 } },
  { id: 'nizko', name: 'Nizko zaletno mesto', icon: '⬇️', desc: 'Zalet je 3 mesta nižje (kompenzacija velja).', mods: { gateDelta: -3 } },
  { id: 'telemark', name: 'Samo telemark šteje', icon: '🦵', desc: 'Pristanek na obe nogi sodniki ocenijo kot padec.', mods: { teleOnly: 1 } },
  { id: 'luna', name: 'Luna', icon: '🌕', desc: 'Danes skačemo na Lunini skakalnici.', mods: { moon: 1 } },
];
export const DAILY_TRIES = 3;

/**
 * Dnevni izbor (isti za vse): skakalnica, veter (povprečje in sunki) in pogoj dneva.
 * @param {string} daySeed hub.dailySeed()
 * @param {Object[]} defs vse skakalnice (JSON)
 * @param {(seed:string)=>Function} [rngFn] hub.rng (privzeto lasten PRNG)
 */
export function dailyPick(daySeed, defs, rngFn = s => rng(s)) {
  const r = rngFn(daySeed + ':skoki');
  const moon = defs.find(d => d.physics?.noAir);
  const earth = defs.filter(d => !d.physics?.noAir);
  // Luna je redka (≈ 1 dan od 10) in vedno na Lunini skakalnici
  let cond = CONDITIONS[Math.floor(r() * CONDITIONS.length)];
  if (cond.id === 'luna' && (!moon || r() > 0.6)) cond = CONDITIONS[Math.floor(r() * (CONDITIONS.length - 1))];
  const def = cond.id === 'luna' ? moon : earth[Math.floor(r() * earth.length)];
  const windMean = Math.round((r() * 4 - 2) * 10) / 10;       // −2 … +2 m/s
  const windSeed = Math.floor(r() * 4294967295) >>> 0;
  const gate = Math.max(1, def.gates.default + (cond.mods.gateDelta || 0));
  return {
    seed: daySeed, hill: def.id, cond, gate, refGate: def.gates.default,
    wind: def.physics?.noAir ? { mode: 'off', seed: 0 } : { mode: 'const', seed: windSeed, speed: windMean },
    mods: { inrunMu: cond.mods.inrunMu || 0, gust: cond.mods.gust || 0 },
    windMean: def.physics?.noAir ? 0 : windMean,
  };
}

/** Do polnoči po Ljubljani (ms) — za odštevanje. */
export function msToMidnight(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Ljubljana', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const [h, m, s] = fmt.format(now).split(':').map(Number);
  return ((23 - h) * 3600 + (59 - m) * 60 + (60 - s)) * 1000;
}

/* ------------------------------------------------------------ odklepanje skakalnic */

export const unlockKey = id => 'odklep-' + id;
/** Ali je skakalnica odprta (brez pogoja ali odklenjena kot dosežek). */
export const isOpen = (def, achKeys) => !def.unlock || achKeys.has(unlockKey(def.id));
/**
 * Ali skok na skakalnici `hill` (JSON) izpolni pogoj odklepa `u`:
 * { hill } — ta skakalnica · { hills: [...] } — katera koli od naštetih · { group, size } — katera koli skakalnica skupine in velikosti.
 */
export function unlockMatches(u, hill) {
  if (!u) return false;
  if (u.hill) return u.hill === hill.id;
  if (u.hills) return u.hills.includes(hill.id);
  if (u.group) return (hill.group || 'trening') === u.group && hill.size === u.size;
  return false;
}
/** Skakalnice, ki jih odklene ta skok: [def …]. */
export function unlocksBy(defs, { hill, dist, fall }) {
  if (fall) return [];
  const H = hill.def || hill;
  return defs.filter(d => d.unlock && d.id !== H.id && unlockMatches(d.unlock, H) && dist >= (d.unlock.over === 'hs' ? H.hs : H.k));
}
const SIZE_NAMES = { velika: 'veliki', srednja: 'srednji', letalnica: 'letalnici', mala: 'mali' };
const GROUP_NAMES = { prave: 'pravi', trening: 'trening' };
/** Opis pogoja za odklep. */
export function unlockText(def, defs) {
  const u = def.unlock;
  if (!u) return '';
  const nameOf = id => defs.find(d => d.id === id)?.name || id;
  const where = u.hill ? nameOf(u.hill)
    : u.hills ? 'skakalnici ' + u.hills.map(id => '»' + nameOf(id) + '«').join(' ali ')
    : `kateri koli ${GROUP_NAMES[u.group] || u.group} ${SIZE_NAMES[u.size] || u.size} skakalnici`;
  return `Skoči čez ${u.over === 'hs' ? 'HS' : 'K'} na ${where}${u.over === 'hs' ? ' (brez padca)' : ''}.`;
}

/* ------------------------------------------------------------ XP in hub */

/**
 * XP za končano tekmo: 30 + 60 za zmago z vsaj 2 človekoma + 20 za oder.
 * @param {{place:number|null, humans:number}} o place = mesto med vsemi (z boti)
 */
export function contestXp({ place, humans }) {
  let xp = 30;
  if (place === 1 && humans >= 2) xp += 60;
  if (place && place <= 3) xp += 20;
  return xp;
}
/** Mesto med ljudmi (za hub.reportGame won). */
export function humanPlace(standings, id) {
  const humans = standings.filter(r => r.kind === 'human' && r.rank);
  const i = humans.findIndex(r => r.id === id);
  return i < 0 ? null : humans.filter(r => r.rank < humans[i].rank).length + 1;
}
