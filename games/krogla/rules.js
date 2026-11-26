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
export function medalsFromTime(a, opt = {}) {
  // ostre medalje (neobvezno, za kratke proge): desetinke sekunde in manjši razmiki med medaljami
  if (opt.sharp) {
    const up = x => Math.ceil(x * 10 - 1e-9) / 10;
    return { gold: up(a * 0.98), silver: up(a * 1.12), bronze: up(a * 1.3) };
  }
  return { gold: Math.ceil(a * 0.97), silver: Math.ceil(a * 1.28), bronze: Math.ceil(a * 1.65) };
}
/**
 * Časovni bonus proge (s) iz časa autopilota.
 * opt.timeMul (neobvezno, na progi): popravek za zelo kratke ali zelo dolge proge; obstoječe proge ga nimajo.
 */
export const timeBonusFromTime = (a, opt = {}) => Math.ceil((a * 1.25 + 6) * (opt.timeMul || 1));

/**
 * Medalje, časovni bonus in `dev` iz rezultata runAutopilot (če ne pride do cilja, se računa s 60 s).
 * @param {{finished:boolean, time:number|null, falls:number}} res
 * @param {{sharp?:boolean, timeMul?:number}} [opt] neobvezni popravki proge (glej medalsFromTime, timeBonusFromTime)
 */
export function scoringFromRun(res, opt = {}) {
  const a = res.time || 60;
  return { medals: medalsFromTime(a, opt), timeBonus: timeBonusFromTime(a, opt), dev: { time: res.time != null ? Math.round(res.time * 10) / 10 : null, falls: res.falls } };
}

/* --------------------------------------------------------- dolžina in težavnost prog */

/** Dolžine prog (iz časa autopilota `dev.time`). */
export const LENS = {
  kratka: { id: 'kratka', name: 'Kratka', many: 'Kratke', icon: '⚡' },
  srednja: { id: 'srednja', name: 'Srednja', many: 'Srednje', icon: '🧭' },
  dolga: { id: 'dolga', name: 'Dolga', many: 'Dolge', icon: '🏃' },
};
export const LEN_IDS = Object.keys(LENS);
/** Meje dolžine (s autopilota): kratka < 17 s ≤ srednja < 50 s ≤ dolga. */
export const LEN_LIMITS = { short: 17, long: 50 };
export const lenFromTime = t => (t == null ? 'srednja' : t < LEN_LIMITS.short ? 'kratka' : t < LEN_LIMITS.long ? 'srednja' : 'dolga');
/** Dolžina proge: zapisana (`len`) ali izračunana iz `dev.time` (klasične proge nimajo polja `len`). */
export const lenOf = L => (LENS[L?.len] ? L.len : lenFromTime(L?.dev?.time));
/** Prikazana težavnost 1–5 (privzeto 3). */
export const diffOf = L => (Number.isInteger(L?.diff) && L.diff >= 1 && L.diff <= 5 ? L.diff : 3);
/** Težavnost kot pike, npr. ●●●○○. */
export const diffDots = d => '●'.repeat(d) + '○'.repeat(5 - d);
export const diffStars = d => '★'.repeat(d);

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
export function dailyPick(rng, seed, order, poolIds = null) {
  const r = rng(seed + ':krogla');
  // bazen: izrecni seznam (DAILY_POOL, le proge, ki obstajajo) ali — kot prej — prvih 8 prog
  const pool = poolIds ? order.filter(id => poolIds.includes(id)) : order.slice(0, 8);
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

/**
 * Bazen dnevnega izziva (izrecno): klasične 01–08 in nove proge z diff ≤ 3, ki niso dolge.
 * Uveden ob prompt 35 (2026-11-26) — od tega dne se dnevni izbor razlikuje od prejšnjega (prej le 01–08).
 */
export const DAILY_POOL = [
  '01-ogrevanje', '02-vrtnarija', '03-skodelice', '04-kuhinja', '05-steklena-pot', '06-tovarna', '07-stolp', '08-ledena-dvorana',
  '13-tobogan', '14-odskocna-deska', '17-pekarna', '18-botanicni-vrt', '19-drsalisce', '20-rudnik',
];

/* --------------------------------------------------------- turnirji (pokali, levels/cups.json) */

export const CUP_XP_MAX = 150;   // enkratni bonus za prvi konec pokala (cup.xp)

/**
 * Preveri levels/cups.json. Vrne seznam napak (prazen = v redu).
 * @param {{cups:Object[]}} data
 * @param {string[]} levelIds id-ji uradnih prog
 * @param {string[]} achKeys ključi dosežkov (ACH)
 */
export function validateCups(data, levelIds, achKeys = ACH.map(a => a.key)) {
  const err = [];
  if (!data || !Array.isArray(data.cups) || !data.cups.length) return ['cups.json: manjka seznam »cups«'];
  const ids = new Set(), lv = new Set(levelIds), ak = new Set(achKeys);
  const boards = new Set();
  for (const c of data.cups) {
    const e = m => err.push(`pokal ${c?.id || '?'}: ${m}`);
    if (!/^[a-z0-9-]{2,20}$/.test(c?.id || '')) { e('id mora biti 2–20 znakov a-z, 0-9, -'); continue; }
    if (ids.has(c.id)) e('podvojen id'); ids.add(c.id);
    if (typeof c.name !== 'string' || c.name.length < 2) e('manjka ime');
    if (typeof c.icon !== 'string' || !c.icon) e('manjka ikona');
    if (c.weekly) {
      if (c.levels) e('tedenski pokal nima stalnih prog (izbere jih weeklyPick)');
    } else {
      if (!Array.isArray(c.levels) || !c.levels.length) e('manjka seznam prog');
      else {
        for (const id of c.levels) if (!lv.has(id)) e(`proga »${id}« ne obstaja`);
        if (new Set(c.levels).size !== c.levels.length) e('proga se ponovi');
      }
    }
    if (c.clock != null && !(typeof c.clock === 'number' && c.clock >= 0.5 && c.clock <= 2)) e('clock mora biti število 0,5–2');
    if (c.diffs != null && !(Array.isArray(c.diffs) && c.diffs.length && c.diffs.every(d => DIFFS[d]))) e('diffs: neznana težavnost');
    if (c.xp != null && !(Number.isInteger(c.xp) && c.xp >= 0 && c.xp <= CUP_XP_MAX)) e(`xp mora biti 0–${CUP_XP_MAX}`);
    if (c.ach != null && !ak.has(c.ach)) e(`dosežek »${c.ach}« ne obstaja`);
    const b = c.weekly ? 'teden' : (c.board || 'pokal:' + c.id);
    if (boards.has(b)) e(`lestvica »${b}« je že v rabi`); boards.add(b);
    if (c.mirror && c.weekly) e('tedenski pokal nima zrcalne različice');
  }
  // odklepi: obstoječi pokali (ne tedenski, ki se ne »konča«) in dosežki, brez krogov
  const byId = new Map(data.cups.map(c => [c.id, c]));
  const refs = u => (u == null ? [] : u.cup ? [u.cup] : u.any || u.all ? (u.any || u.all).flatMap(refs) : []);
  const checkU = (c, u) => {
    if (u == null) return;
    if (typeof u !== 'object') { err.push(`pokal ${c.id}: neveljaven unlock`); return; }
    if (u.cup) { const t = byId.get(u.cup); if (!t) err.push(`pokal ${c.id}: odklep kaže na neznan pokal »${u.cup}«`); else if (!t.ach) err.push(`pokal ${c.id}: pokal »${u.cup}« nima dosežka za konec`); }
    else if (u.ach) { if (!ak.has(u.ach)) err.push(`pokal ${c.id}: odklep kaže na neznan dosežek »${u.ach}«`); }
    else if (Array.isArray(u.any) || Array.isArray(u.all)) (u.any || u.all).forEach(x => checkU(c, x));
    else err.push(`pokal ${c.id}: unlock mora biti null, {cup}, {ach}, {any:[…]} ali {all:[…]}`);
  };
  for (const c of data.cups) checkU(c, c.unlock);
  const state = new Map();
  const visit = id => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const r of refs(byId.get(id)?.unlock)) if (byId.has(r) && visit(r)) return true;
    state.set(id, 2);
    return false;
  };
  for (const c of data.cups) if (visit(c.id)) { err.push(`pokal ${c.id}: odklepi tvorijo krog`); break; }
  if (!data.cups.some(c => c.unlock == null)) err.push('vsaj en pokal mora biti odklenjen takoj');
  return err;
}

/** Dovoljene težavnosti pokala. */
export const cupDiffs = c => (c.weekly ? ['normalna'] : c.diffs || DIFF_IDS);
/** Množilnik ure pokala. */
export const cupClock = c => c.clock || 1;
/** Ali je pokal končan (dosežek pokala, ki ga dobiš ob koncu na Normalni/Noro). */
export const cupDone = (c, ach) => !!c?.ach && ach.has(c.ach);

/**
 * Ali je pokal odklenjen.
 * @param {Object} c pokal
 * @param {{cups:Object[]}} data cups.json
 * @param {Set<string>} ach moji dosežki
 */
export function cupUnlocked(c, data, ach) {
  const ok = u => {
    if (u == null) return true;
    if (u.cup) return cupDone(data.cups.find(x => x.id === u.cup), ach);
    if (u.ach) return ach.has(u.ach);
    if (u.any) return u.any.some(ok);
    if (u.all) return u.all.every(ok);
    return false;
  };
  return ok(c.unlock);
}

/** Opis pogoja za odklep (za ključavnico v meniju). */
export function unlockText(u, data) {
  if (u == null) return '';
  if (u.cup) return 'končaj ' + (data.cups.find(x => x.id === u.cup)?.name || u.cup);
  if (u.ach) return 'dosežek »' + (ACH.find(a => a.key === u.ach)?.title || u.ach) + '«';
  if (u.any) return u.any.map(x => unlockText(x, data)).join(' ali ');
  if (u.all) return u.all.map(x => unlockText(x, data)).join(' in ');
  return '';
}

/** Seed lestvice pokala: pokal:<id>:<težavnost> (Klasični: turnir:<težavnost>), tedenski: teden:<leto>-W<nn>. */
export function cupBoard(c, diff, week) {
  if (c.weekly) return 'teden:' + week;
  return (c.board || 'pokal:' + c.id) + ':' + diff;
}
/** Seed lestvice skupnega časa (pokali z `timeBoard`, npr. Sprint). */
export const cupTimeBoard = (c, diff) => 'pokal:' + c.id + ':' + diff + ':cas';

/* --------------------------------------------------------- tedenski pokal */

/** ISO teden (ponedeljek–nedelja) za datum ali niz 'YYYY-MM-DD' → '2026-W48'. Čista funkcija (UTC). */
export function isoWeek(day) {
  const d = typeof day === 'string' ? new Date(day + 'T00:00:00Z') : new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dow = (d.getUTCDay() + 6) % 7;            // pon = 0
  d.setUTCDate(d.getUTCDate() - dow + 3);         // četrtek tega tedna določa leto
  const y = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
/** Ponedeljek ISO tedna ('2026-W48' → Date v UTC). */
export function weekMonday(week) {
  const [y, w] = week.split('-W').map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const mon = new Date(jan4); mon.setUTCDate(4 - ((jan4.getUTCDay() + 6) % 7) + (w - 1) * 7);
  return mon;
}
/** Teden, zamaknjen za n tednov. */
export const weekShift = (week, n) => { const d = weekMonday(week); d.setUTCDate(d.getUTCDate() + 7 * n); return isoWeek(d); };

/** Pravila tedenskega izbora. Veriga se začne v tednu `epoch` (izbor je odvisen od prejšnjega tedna). */
export const WEEKLY = { epoch: '2026-W01', mix: { kratka: 1, srednja: 3, dolga: 1 }, maxDiff: 4, avg: [2.5, 3.5], tries: 300 };

const weeklyCache = new Map();
/**
 * Izbor Tedenskega pokala: 1 kratka, 3 srednje, 1 dolga (iz uradnih prog z diff ≤ 4), povprečna težavnost 2,5–3,5,
 * od lažje k težji, nobena proga ni dva tedna zapored. Isti za vse igralce (seme = ISO teden).
 * @param {(seed:string)=>Function} rng hub.rng / util.rng
 * @param {string} week '2026-W48'
 * @param {Object[]} levels uradne proge (id, diff, len/dev)
 * @returns {string[]} id-ji prog
 */
export function weeklyPick(rng, week, levels) {
  const key = levels.map(L => L.id + diffOf(L) + lenOf(L)).join() + '|';
  if (weeklyCache.has(key + week)) return weeklyCache.get(key + week);
  // veriga od epohe (ali od tedna, ki je že v predpomnilniku)
  let prev = [], wk = WEEKLY.epoch;
  if (week < WEEKLY.epoch) wk = week;
  else {
    for (let back = weekShift(week, -1); back >= WEEKLY.epoch; back = weekShift(back, -1)) {
      if (weeklyCache.has(key + back)) { prev = weeklyCache.get(key + back); wk = weekShift(back, 1); break; }
    }
  }
  for (;; wk = weekShift(wk, 1)) {
    const pick = weeklyOne(rng, wk, levels, prev);
    weeklyCache.set(key + wk, pick);
    if (wk === week) return pick;
    prev = pick;
  }
}

function weeklyOne(rng, week, levels, prev) {
  const r = rng('krogla:teden:' + week);
  const pool = levels.filter(L => diffOf(L) <= WEEKLY.maxDiff && !prev.includes(L.id));
  const by = len => pool.filter(L => lenOf(L) === len);
  let best = null;
  for (let k = 0; k < WEEKLY.tries; k++) {
    const pick = Object.entries(WEEKLY.mix).flatMap(([len, n]) => r.shuffle(by(len)).slice(0, n));
    const avg = pick.reduce((s, L) => s + diffOf(L), 0) / pick.length;
    const miss = Math.max(0, WEEKLY.avg[0] - avg, avg - WEEKLY.avg[1]);
    if (!best || miss < best.miss) best = { pick, miss };
    if (!miss) break;
  }
  return best.pick.sort((a, b) => diffOf(a) - diffOf(b) || (a.dev?.time || 0) - (b.dev?.time || 0)).map(L => L.id);
}

/* --------------------------------------------------------- dosežki */

export const ACH = [
  { key: 'prva-proga', title: 'Prvi koraki', icon: '🐹', desc: 'Končaj Ogrevanje' },
  { key: 'sklop-1', title: 'Prvi sklop', icon: '🌱', desc: 'Končaj 1. sklop v turnirju' },
  { key: 'sklop-2', title: 'Drugi sklop', icon: '⚙️', desc: 'Končaj 2. sklop v turnirju' },
  { key: 'turnir', title: 'Prvak turnirja', icon: '🏆', desc: 'Končaj turnir (Normalna ali Noro) — odklene zrcalni turnir' },
  { key: 'zrcalo', title: 'Skozi ogledalo', icon: '🪞', desc: 'Končaj zrcalni turnir' },
  { key: 'brez-padca', title: 'Trdna tla', icon: '🧱', desc: 'Končaj progo 6 ali kasnejšo (ali progo pokala s ★★★ ali več) brez padca' },
  { key: 'vse-zvezdice', title: 'Zvezdogled', icon: '⭐', desc: 'Poberi vseh 5 zvezdic na eni progi' },
  { key: 'zlato-vse', title: 'Zlati hrček', icon: '🥇', desc: 'Zlato na vseh 12 klasičnih progah' },
  { key: 'noro', title: 'Noro!', icon: '🔥', desc: 'Končaj Klasični turnir na Noro' },
  { key: 'rezerva', title: 'Rezerva', icon: '⏳', desc: 'Končaj Klasični turnir z več kot 60 s preostanka' },
  { key: 'pokal-hrcek', title: 'Hrčkov pokal', icon: '🌱', desc: 'Končaj Hrčkov pokal (Normalna ali Noro)' },
  { key: 'pokal-sprint', title: 'Šprinter', icon: '⚡', desc: 'Končaj Sprint (Normalna ali Noro)' },
  { key: 'pokal-turneja', title: 'Svetovni popotnik', icon: '🧭', desc: 'Končaj Svetovno turnejo (Normalna ali Noro)' },
  { key: 'pokal-maraton', title: 'Maratonec', icon: '🏃', desc: 'Končaj Maraton (Normalna ali Noro)' },
  { key: 'pokal-pekel', title: 'Iz pekla', icon: '😈', desc: 'Končaj Peklenski pokal (Normalna ali Noro)' },
  { key: 'vsi-pokali', title: 'Zbiratelj pokalov', icon: '🏅', desc: 'Končaj vse pokale (razen tedenskega)' },
  { key: 'tedenski', title: 'Vsak teden', icon: '📅', desc: 'Končaj Tedenski pokal v 3 različnih tednih' },
  { key: 'razcep', title: 'Bližnjica', icon: '🌿', desc: 'Zlato na Botaničnem vrtu po bližnjici' },
  { key: 'zlato-nove', title: 'Zlata prihodnost', icon: '🌟', desc: 'Zlato na vseh 16 progah pokalov (13–28)' },
];
/** Klasične proge (za dosežek »Zlati hrček« in odklepe sklopov). */
export const CLASSIC_IDS = ['01-ogrevanje', '02-vrtnarija', '03-skodelice', '04-kuhinja', '05-steklena-pot', '06-tovarna', '07-stolp', '08-ledena-dvorana', '09-nasilnezi', '10-neon', '11-nebo', '12-nemogoce'];
export const isClassic = id => CLASSIC_IDS.includes(id);

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
