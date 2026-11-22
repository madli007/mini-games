/* =====================================================================
   HRČKOVA KROGLA — rules.js: ura, točke, medalje, odklepi, težavnost, dnevni izziv.
   Čista logika (testi v tests/tests.js).
   ===================================================================== */

export const DIFFS = {
  lahka: { id: 'lahka', name: 'Lahka', time: 1.4, pts: 0.5, unlocks: false },
  normalna: { id: 'normalna', name: 'Normalna', time: 1.0, pts: 1, unlocks: true },
  noro: { id: 'noro', name: 'Noro', time: 0.75, pts: 1.5, unlocks: true },
};
export const DIFF_IDS = Object.keys(DIFFS);

export const PTS = { LEVEL: 1000, PER_SEC: 20, STAR: 100 };
export const XP = { LEVEL: 20, LEVEL_MAX: 12, TOURNEY: 100, GOLD: 50 };
export const CLOCK_BONUS = 3;   // sekund za pobrano uro
export const RESET_COST = 2;    // R v turnirju: vrnitev na kontrolno točko

/** Čas, ki se prišteje uri na začetku proge. */
export function levelTime(L, diff = 'normalna', mul = 1) {
  return Math.round(L.timeBonus * DIFFS[diff].time * mul * 10) / 10;
}

/**
 * Ura turnirja s prenosom časa.
 * @returns {{clock:number, level:number, points:number, stars:number, done:number[], over:boolean}}
 */
export function newRun(diff = 'normalna') {
  return { diff, clock: 0, level: 0, points: 0, stars: 0, done: [], over: false, won: false, falls: 0, results: [] };
}

/** Začetek proge: uri se prišteje čas proge. */
export function startLevel(run, L, mul = 1) {
  const add = levelTime(L, run.diff, mul);
  run.clock += add;
  return add;
}

/** Ura teče. Vrne true, ko je čas potekel. */
export function tick(run, dt) {
  if (run.over) return true;
  run.clock = Math.max(0, run.clock - dt);
  if (run.clock <= 0) { run.over = true; return true; }
  return false;
}

/** Točke za končano progo. */
export function levelPoints(remaining, stars, diff = 'normalna') {
  return Math.round((PTS.LEVEL + PTS.PER_SEC * Math.floor(Math.max(0, remaining)) + PTS.STAR * stars) * DIFFS[diff].pts);
}

/** Cilj proge: zapiše rezultat in prišteje točke. */
export function finishLevel(run, L, { time, stars, falls = 0 }) {
  const pts = levelPoints(run.clock, stars, run.diff);
  run.points += pts;
  run.stars += stars;
  run.falls += falls;
  run.done.push(run.level);
  run.results.push({ id: L.id, time, remaining: run.clock, stars, pts, falls });
  run.level++;
  return pts;
}

/** Medalja za čas (sekunde) ali null. */
export function medalFor(L, sec) {
  if (sec == null) return null;
  if (sec <= L.medals.gold) return 'gold';
  if (sec <= L.medals.silver) return 'silver';
  if (sec <= L.medals.bronze) return 'bronze';
  return null;
}
/**
 * Medalje iz časa vožnje autopilota (sekunde). Isto formulo uporabljata generator prog in urejevalnik.
 * @param {number} a čas autopilota (s)
 */
export function medalsFromTime(a) {
  return { gold: Math.ceil(a * 0.97), silver: Math.ceil(a * 1.28), bronze: Math.ceil(a * 1.65) };
}
/** Časovni bonus proge (s) iz časa autopilota. */
export const timeBonusFromTime = a => Math.ceil(a * 1.25 + 6);

/**
 * Medalje, časovni bonus in `dev` iz rezultata runAutopilot (če ne pride do cilja, se računa s 60 s).
 * @param {{finished:boolean, time:number|null, falls:number}} res
 */
export function scoringFromRun(res) {
  const a = res.time || 60;
  return { medals: medalsFromTime(a), timeBonus: timeBonusFromTime(a), dev: { time: res.time != null ? Math.round(res.time * 10) / 10 : null, falls: res.falls } };
}

export const MEDAL = { gold: { icon: '🥇', name: 'zlato' }, silver: { icon: '🥈', name: 'srebro' }, bronze: { icon: '🥉', name: 'bron' } };

/** XP za končane proge v turnirju (največ 12 prog). */
export function tourneyLevelXp(levelsDoneBefore) {
  return levelsDoneBefore < XP.LEVEL_MAX ? XP.LEVEL : 0;
}

/**
 * Odklenjene proge za način Na čas.
 * @param {string[]} order id-ji prog v vrstnem redu
 * @param {Set<string>|string[]} reached proge, dosežene v turnirju (Normalna/Noro)
 * @param {{tourney?:boolean}} [opt] tourney: turnir je končan → vse odklenjeno
 */
export function unlockedLevels(order, reached, { tourney = false } = {}) {
  const r = new Set(reached);
  return order.filter((id, i) => i === 0 || tourney || r.has(id));
}

/** Ali turnir na tej težavnosti odklepa proge in zrcalni turnir. */
export const countsForUnlock = diff => !!DIFFS[diff]?.unlocks;

/** Skupna zaporedna številka sklopa, ki je končan s to progo (1–3) ali 0. */
export function setCompleted(levels, idx) {
  const L = levels[idx];
  const next = levels[idx + 1];
  return !next || next.set !== L.set ? L.set : 0;
}

/* --------------------------------------------------------- dnevni izziv */

export const DAILY_MODS = [
  { id: 'led', name: 'Vse je led', icon: '🧊', desc: 'Vsa tla so spolzka kot led.', phys: { ice: true } },
  { id: 'sovrazniki', name: 'Dvojna hitrost sovražnikov', icon: '🐝', desc: 'Žage, ose, kladiva in magneti so dvakrat hitrejši.', phys: { enemy: 2 } },
  { id: 'mala', name: 'Mala krogla, močni ventilatorji', icon: '🌀', desc: 'Krogla je manjša, ventilatorji pihajo močneje.', phys: { radius: 0.75, fan: 1.6 } },
  { id: 'zrcalo', name: 'Zrcaljeno', icon: '🪞', desc: 'Proge so zrcaljene.', mirror: true },
  { id: 'ure', name: 'Manj časa, ure povsod', icon: '⏱️', desc: 'Le 65 % časa, a ure so na vsaki kontrolni točki in ob poti.', time: 0.65, clocks: true },
];

/**
 * Dnevni izbor: 3 proge (iz prvih 8, da je dostopno vsem) in dodatek dneva. Isti za vse.
 * @param {(seed:string)=>Function} rng hub.rng
 * @param {string} seed hub.dailySeed()
 * @param {string[]} order id-ji prog
 */
export function dailyPick(rng, seed, order) {
  const r = rng(seed + ':krogla');
  const pool = order.slice(0, 8);
  const picks = r.shuffle(pool.slice()).slice(0, 3).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const mod = r.pick(DAILY_MODS);
  return { levels: picks, mod: mod.id };
}

/** Uri v dnevnem izzivu z dodatkom »ure povsod« dodaj pobiralke ob kontrolnih točkah in poti. */
export function withExtraClocks(L) {
  const extra = [];
  for (const cp of L.checkpoints || []) extra.push({ t: 'clock', x: cp[0] + 0.01, z: cp[1] + 0.6 });
  const route = L.route || [];
  for (let i = 2; i < route.length; i += 3) extra.push({ t: 'clock', x: route[i].x, z: route[i].z });
  return { ...L, pickups: [...(L.pickups || []), ...extra] };
}

/* --------------------------------------------------------- dosežki */

export const ACH = [
  { key: 'prva-proga', title: 'Prvi koraki', icon: '🐹', desc: 'Končaj Ogrevanje' },
  { key: 'sklop-1', title: 'Prvi sklop', icon: '🌱', desc: 'Končaj 1. sklop v turnirju' },
  { key: 'sklop-2', title: 'Drugi sklop', icon: '⚙️', desc: 'Končaj 2. sklop v turnirju' },
  { key: 'turnir', title: 'Prvak turnirja', icon: '🏆', desc: 'Končaj turnir (Normalna ali Noro) — odklene zrcalni turnir' },
  { key: 'zrcalo', title: 'Skozi ogledalo', icon: '🪞', desc: 'Končaj zrcalni turnir' },
  { key: 'brez-padca', title: 'Trdna tla', icon: '🧱', desc: 'Končaj progo 6 ali kasnejšo brez padca' },
  { key: 'vse-zvezdice', title: 'Zvezdogled', icon: '⭐', desc: 'Poberi vseh 5 zvezdic na eni progi' },
  { key: 'zlato-vse', title: 'Zlati hrček', icon: '🥇', desc: 'Zlato na vseh progah' },
  { key: 'noro', title: 'Noro!', icon: '🔥', desc: 'Končaj turnir na Noro' },
  { key: 'rezerva', title: 'Rezerva', icon: '⏳', desc: 'Končaj turnir z več kot 60 s preostanka' },
];

/* --------------------------------------------------------- oblikovanje */

/** Čas v ms → »1:23,45« (ali »23,45«). */
export function fmtTime(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const cs = Math.round(ms / 10);
  const m = Math.floor(cs / 6000), s = Math.floor(cs / 100) % 60, c = cs % 100;
  return (m ? m + ':' + String(s).padStart(2, '0') : String(s)) + ',' + String(c).padStart(2, '0');
}

/** Ura v sekundah → »1:05« (zadnjih 10 s z desetinko). */
export function fmtClock(sec) {
  const s = Math.max(0, sec);
  if (s < 10) return s.toFixed(1).replace('.', ',');
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return m + ':' + String(r).padStart(2, '0');
}

export const fmtPts = n => Math.round(n).toLocaleString('sl-SI');

/** Seed lestvice za način. */
export const boardSeed = {
  tourney: diff => 'turnir:' + diff,
  mirror: diff => 'zrcalo:' + diff,
  level: (id, mirror = false) => (mirror ? 'lvl-m:' : 'lvl:') + id,
};
