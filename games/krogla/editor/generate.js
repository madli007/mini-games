/* =====================================================================
   HRČKOVA KROGLA — editor/generate.js: generator naključnih prog (čista logika, brez DOM-a).
   generateLevel(opts) → { L, seed, tries, ok, report }

   Proga nastane z »želvico« (editor/track.js) kot zaporedje odsekov (gradnikov). Vsak gradnik
   doda ploščice, objekte in točke poti za autopilota po vzoru uradnih prog, zato je proga
   rešljiva že po konstrukciji. Pred vsakim gradnikom preverimo, da se proga ne seka sama s
   sabo in da ostane v največji velikosti mreže. Na koncu progo preverita validateLevel in
   runAutopilot; če autopilot ne pride do cilja, poskusimo s pod-semenom (seed + ':' + k).
   Isti opts + isto seme → ista proga (mulberry32 iz shared/util.js).
   ===================================================================== */
import { rng } from '../../../shared/util.js';
import { Track, finish } from './track.js';
import { validateLevel } from '../level.js';
import { runAutopilot } from '../autopilot.js';
import { scoringFromRun } from '../rules.js';
import { THEMES, THEME_NAMES } from '../themes.js';
import { MAX_W, MAX_D } from './model.js';

/* ===================================================================== */
/*  Nastavitve                                                           */
/* ===================================================================== */

export const DIFF_NAMES = ['Lahka', 'Srednja', 'Težka', 'Zelo težka', 'Nemogoča'];
export const LENGTHS = {
  short: { name: 'Kratka', segments: 7, target: 20 },
  medium: { name: 'Srednja', segments: 13, target: 40 },
  long: { name: 'Dolga', segments: 23, target: 70 },
};
export const LENGTH_IDS = Object.keys(LENGTHS);
export const SEG_MIN = 6, SEG_MAX = 40;

/** Sovražniki in ovire: ključ → { ime, ikona, največje število na drsniku }. */
export const ENEMIES = {
  bully: { name: 'Nasilneži', icon: '😠', max: 4 },
  saw: { name: 'Žage', icon: '🪚', max: 8 },
  wasp: { name: 'Ose', icon: '🐝', max: 6 },
  vacuum: { name: 'Sesalci', icon: '🌪️', max: 4 },
  magnet: { name: 'Magneti', icon: '🧲', max: 6 },
};
export const OBSTACLES = {
  mover: { name: 'Premične plošče', icon: '🟫', max: 4 },
  spinner: { name: 'Vrtiljaki', icon: '🌀', max: 4 },
  hammer: { name: 'Kladiva', icon: '🔨', max: 8 },
  bumper: { name: 'Odbijači', icon: '🔴', max: 10 },
  fan: { name: 'Ventilatorji', icon: '💨', max: 6 },
  bowl: { name: 'Sklede', icon: '🥣', max: 4 },
  door: { name: 'Stikala + vrata', icon: '🚪', max: 3 },
};
export const SURFACES = {
  ice: { name: 'Led', icon: '🧊', ch: 'i' },
  glue: { name: 'Lepilo', icon: '🍯', ch: 'g' },
  wave: { name: 'Valovi', icon: '〰️', ch: '~' },
  conveyor: { name: 'Tekoči trakovi', icon: '⏩', ch: 'conv' },
  fall: { name: 'Padajoče ploščice', icon: '🟨', ch: 'x' },
};
export const CHECKPOINTS = { often: { name: 'Pogosto', every: 2 }, rare: { name: 'Redko', every: 4 }, none: { name: 'Brez', every: 0 } };
export const JUMPS_MAX = 6;

/** Teme → lokacija (render/looks.js). */
export const THEME_LOOK = { vrt: 'garden', kuhinja: 'kitchen', steklo: 'crystal', tovarna: 'factory', stolp: 'tower', led: 'ice', arena: 'arena', neon: 'neon', nebo: 'sky', nemogoce: 'inferno' };
export const THEME_IDS = Object.keys(THEMES);

/**
 * Privzete vrednosti za težavnost 1–5. `mix` je razmerje med vrstami ovir in sovražnikov; koliko jih je, določi
 * časovni proračun (delež ciljnega časa, `share`) in ocena, koliko sekund doda posamezen kos (`COST`).
 */
const PRESETS = [
  { wMin: 3, wMax: 5, narrow: 0, hills: 0.2, walls: 0.6, checkpoints: 'often', clocks: 3, pockets: 0.2, share: 0.06, cal: 1.25,
    mix: { bowl: 1 }, surfaces: { wave: 0.15 } },
  { wMin: 3, wMax: 5, narrow: 0.1, hills: 0.35, walls: 0.4, checkpoints: 'often', clocks: 2, pockets: 0.4, share: 0.35, cal: 1.1,
    mix: { saw: 1, mover: 0.5, bowl: 1, bumper: 2, hammer: 1.5, door: 0.5, jump: 1 },
    surfaces: { ice: 0.1, glue: 0.1, wave: 0.1, conveyor: 0.1 } },
  { wMin: 1, wMax: 5, narrow: 0.25, hills: 0.5, walls: 0.2, checkpoints: 'often', clocks: 2, pockets: 0.6, share: 0.55, cal: 1.15,
    mix: { bully: 1, saw: 2, wasp: 1, mover: 0.5, spinner: 1, hammer: 2, bumper: 2, fan: 2, bowl: 0.5, door: 0.5, jump: 2 },
    surfaces: { ice: 0.15, glue: 0.1, wave: 0.1, conveyor: 0.15, fall: 0.1 } },
  { wMin: 1, wMax: 3, narrow: 0.4, hills: 0.6, walls: 0.1, checkpoints: 'rare', clocks: 1, pockets: 0.8, share: 0.7, cal: 1.35,
    mix: { bully: 1.5, saw: 3, wasp: 1.5, vacuum: 1, magnet: 2, mover: 0.6, spinner: 1, hammer: 3, bumper: 3, fan: 2, bowl: 0.5, door: 0.5, jump: 3 },
    surfaces: { ice: 0.2, glue: 0.1, wave: 0.1, conveyor: 0.2, fall: 0.2 } },
  { wMin: 1, wMax: 3, narrow: 0.6, hills: 0.7, walls: 0, checkpoints: 'rare', clocks: 0, pockets: 1, share: 0.8, cal: 1.35,
    mix: { bully: 2, saw: 4, wasp: 2, vacuum: 1.5, magnet: 3, mover: 0.6, spinner: 1.5, hammer: 4, bumper: 3, fan: 3, bowl: 0.5, door: 0.7, jump: 4 },
    surfaces: { ice: 0.25, glue: 0.1, wave: 0.1, conveyor: 0.25, fall: 0.3 } },
];

/** Približno koliko sekund vožnje autopilota doda en kos (izmerjeno na naključnih progah). */
const COST = { bully: 3.5, saw: 2.2, wasp: 3, vacuum: 2.6, magnet: 2.1, mover: 10.6, spinner: 3.3, hammer: 1.5, bumper: 1.2, fan: 0.7, bowl: 0.9, door: 4.6, jump: 3.1 };

/** Ocena časa autopilota (s) za nastavitve. */
export function estimateTime(o) {
  // delež odsekov s posebno podlago (kot v buildLevel → pickFill)
  const surf = Math.min(0.85, 0.6 * Object.values(o.surfaces || {}).reduce((a, v) => a + v, 0));
  const fill = 0.8 + surf * 4 + (o.narrow || 0) * 0.6;
  let t = 1 + o.segments * fill;
  for (const [k, n] of Object.entries({ ...o.enemies, ...o.obstacles, jump: o.jumps })) t += (COST[k] || 1) * n;
  return t;
}

/**
 * Vse nastavitve za težavnost (1–5) in dolžino. Napredne nastavitve se ob spremembi težavnosti ali dolžine
 * nastavijo na te vrednosti.
 */
export function presetOpts(diff = 2, length = 'medium') {
  const d = Math.max(1, Math.min(5, Math.round(diff) || 2));
  const len = LENGTHS[length] ? length : 'medium';
  // cal: umeritev ocene na izmerjene čase autopilota (20 semen na težavnost)
  const p = PRESETS[d - 1], target = LENGTHS[len].target / p.cal;
  // število kosov iz časovnega proračuna, razdeljeno po razmerju mix
  const unit = Object.entries(p.mix).reduce((a, [k, v]) => a + v * COST[k], 0);
  const f = unit ? target * p.share / unit : 0;
  // glavne vrste (mix ≥ 2, pri kratki progi ≥ 3) so na progi vedno vsaj enkrat
  const main = len === 'short' ? 3 : 2;
  const n = k => Math.max((p.mix[k] || 0) >= main ? 1 : 0, Math.round((p.mix[k] || 0) * f));
  const o = {
    diff: d, length: len, theme: 'random', seed: '',
    segments: 0,
    wMin: p.wMin, wMax: p.wMax, narrow: p.narrow, hills: p.hills, walls: p.walls,
    enemies: Object.fromEntries(Object.entries(ENEMIES).map(([k, e]) => [k, Math.min(e.max, n(k))])),
    obstacles: Object.fromEntries(Object.entries(OBSTACLES).map(([k, e]) => [k, Math.min(e.max, n(k))])),
    surfaces: Object.fromEntries(Object.keys(SURFACES).map(k => [k, p.surfaces[k] || 0])),
    jumps: Math.min(JUMPS_MAX, n('jump')),
    checkpoints: p.checkpoints, clocks: p.clocks, pockets: p.pockets,
  };
  // preostanek časa zapolnijo navadni odseki
  const rest = target - estimateTime(o);
  const fillT = estimateTime({ ...o, segments: 1, enemies: {}, obstacles: {}, jumps: 0 }) - 1;
  o.segments = Math.max(SEG_MIN, Math.min(SEG_MAX, Math.round(rest / fillT)));
  return o;
}

const clampN = (v, a, b, def) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : def; };

/** Preveri in dopolni nastavitve (neznana polja zavrže, vrednosti omeji). */
export function normalizeOpts(o = {}) {
  const diff = o.diff == null ? null : clampN(Math.round(o.diff), 1, 5, 2);
  const base = presetOpts(diff || 2, o.length);
  const out = { ...base, diff, seed: String(o.seed ?? '').trim().slice(0, 32), theme: THEMES[o.theme] ? o.theme : 'random' };
  out.segments = Math.round(clampN(o.segments, SEG_MIN, SEG_MAX, base.segments));
  out.wMin = Math.round(clampN(o.wMin, 1, 5, base.wMin));
  out.wMax = Math.round(clampN(o.wMax, out.wMin, 5, Math.max(out.wMin, base.wMax)));
  for (const k of ['narrow', 'hills', 'walls', 'pockets']) out[k] = clampN(o[k], 0, 1, base[k]);
  out.enemies = Object.fromEntries(Object.entries(ENEMIES).map(([k, e]) => [k, Math.round(clampN(o.enemies?.[k], 0, e.max, base.enemies[k]))]));
  out.obstacles = Object.fromEntries(Object.entries(OBSTACLES).map(([k, e]) => [k, Math.round(clampN(o.obstacles?.[k], 0, e.max, base.obstacles[k]))]));
  out.surfaces = Object.fromEntries(Object.keys(SURFACES).map(k => [k, clampN(o.surfaces?.[k], 0, 1, base.surfaces[k])]));
  out.jumps = Math.round(clampN(o.jumps, 0, JUMPS_MAX, base.jumps));
  out.checkpoints = CHECKPOINTS[o.checkpoints] ? o.checkpoints : base.checkpoints;
  out.clocks = Math.round(clampN(o.clocks, 0, 5, base.clocks));
  out.maxTries = Math.round(clampN(o.maxTries, 1, 50, 20));
  out.maxW = Math.round(clampN(o.maxW, 30, MAX_W, MAX_W));
  out.maxD = Math.round(clampN(o.maxD, 30, MAX_D, MAX_D));
  return out;
}

/** Ali se nastavitve ujemajo s privzetimi za svojo težavnost in dolžino (sicer »Po meri«). */
export function isPreset(o) {
  if (!o.diff) return false;
  const p = presetOpts(o.diff, o.length);
  const keys = ['segments', 'wMin', 'wMax', 'narrow', 'hills', 'walls', 'enemies', 'obstacles', 'surfaces', 'jumps', 'checkpoints', 'clocks', 'pockets'];
  return keys.every(k => JSON.stringify(p[k]) === JSON.stringify(o[k]));
}

/** Naključno seme (4 znaki brez dvoumnih črk). */
export function randomSeed(random = Math.random) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(random() * A.length)];
  return s;
}

/* ===================================================================== */
/*  Želvica z zasedenostjo mreže                                         */
/* ===================================================================== */

const TURN_FROM = { N: ['E', 'W'], E: ['N'], W: ['N'] };   // proti kameri (S) nikoli ne gremo
const SAFE = new Set(['.', '~', 'g', 'i', 'N', 'S', 'E', 'W']);

class GTrack extends Track {
  constructor(o) {
    super(o);
    this.own = new Map();      // »c,r« → številka gradnika (ploščice in prazni prostor nad prepadi)
    this.seg = 0; this.log = [];
    this.rails = false;
    this.trail = [];           // točke na sredini poti (za zvezdice)
    this.count = {};
    this.bb = [0, 0, 0, 0];
    this.side = 'E';
  }
  clone() {
    const C = Object.create(GTrack.prototype);
    Object.assign(C, this);
    C.tiles = new Map(this.tiles); C.own = new Map(this.own);
    C.route = this.route.slice(); C.trail = this.trail.slice(); C.log = this.log.slice();
    C.marks = { start: this.marks.start, goal: this.marks.goal, checkpoints: this.marks.checkpoints.slice(), pickups: this.marks.pickups.slice() };
    C.obj = Object.fromEntries(Object.entries(this.obj).map(([k, v]) => [k, v.slice()]));
    C.count = { ...this.count }; C.bb = this.bb.slice();
    return C;
  }
  _own(c, r, force) {
    const k = c + ',' + r;
    if (force || !this.own.has(k)) this.own.set(k, this.seg);
    this.log.push(c, r);
    const b = this.bb;
    if (c < b[0]) b[0] = c; if (c > b[1]) b[1] = c; if (r < b[2]) b[2] = r; if (r > b[3]) b[3] = r;
  }
  set(c, r, ch, h = this.h) { super.set(c, r, ch, h); this._own(c, r, true); return this; }
  /** Zasede prostor brez ploščice (prepad, pot premične plošče). */
  claim(c, r, w = 1) {
    const lo = -Math.floor((w - 1) / 2);
    for (let a = lo; a < lo + w; a++) for (let b = lo; b < lo + w; b++) this._own(c + a, r + b, false);
    return this;
  }
  row(c, r, w, ch, h) {
    super.row(c, r, w, ch, h);
    if (this.rails && w >= 1) {
      const px = -this.dr, pz = this.dc, lo = -Math.floor((w - 1) / 2);
      for (const k of [lo - 1, lo + w]) { const cc = c + px * k, rr = r + pz * k; if (!this.get(cc, rr)) this.set(cc, rr, '#', h); }
    }
    return this;
  }
  go(n, o = {}) {
    super.go(n, o);
    const t = this.get(this.c, this.r);
    if (t && SAFE.has(t.ch)) this.trail.push([this.x, this.z]);
    return this;
  }
  gap(n, dh = 0) {
    for (let i = 0; i < n; i++) { super.gap(1); this.claim(this.c, this.r, Math.max(3, this.w)); }
    this.h += dh;
    return this;
  }
  move(dc, dr, dh = 0) {
    const sx = Math.sign(dc), sz = Math.sign(dr);
    for (let i = 0; i < Math.abs(dc); i++) { super.move(sx, 0); this.claim(this.c, this.r, 3); }
    for (let i = 0; i < Math.abs(dr); i++) { super.move(0, sz); this.claim(this.c, this.r, 3); }
    this.h += dh;
    return this;
  }
  get px() { return -this.dr; }
  get pz() { return this.dc; }
  /** Svetovni položaj relativno na želvico (side: desno +, fwd: naprej +). */
  rel(side, fwd) { return [this.x + this.px * side + this.dc * fwd, this.z + this.pz * side + this.dr * fwd]; }
  wpRel(side, fwd, o = {}) { const [x, z] = this.rel(side, fwd); return this.wpAt(x, z, o); }
  /** Pravokotnik vrstice ploščic na želvici (za kladiva in vrata). */
  rowRect(w) {
    const lo = -Math.floor((w - 1) / 2);
    const cs = [], rs = [];
    for (let k = lo; k < lo + w; k++) { cs.push(this.c + this.px * k); rs.push(this.r + this.pz * k); }
    const x = Math.min(...cs), z = Math.min(...rs);
    return { x, z, w: Math.max(...cs) - x + 1, d: Math.max(...rs) - z + 1 };
  }
  inc(k, n = 1) { this.count[k] = (this.count[k] || 0) + n; return this; }
}

/**
 * Ali novi gradnik (T1, številka T1.seg) ne seka starejših delov proge (T0) in proga ostane v mreži.
 * Okoli stičišča (kjer se je gradnik začel) je dotik dovoljen.
 */
function fits(T0, T1, junction, maxW, maxD) {
  const b = T1.bb;
  if (b[1] - b[0] + 3 > maxW || b[3] - b[2] + 3 > maxD) return false;
  const cur = T1.seg, [jc, jr] = junction;
  const L = T1.log;
  for (let i = 0; i < L.length; i += 2) {
    const c = L[i], r = L[i + 1];
    const dj = Math.max(Math.abs(c - jc), Math.abs(r - jr));
    const old = T0.own.get(c + ',' + r);
    // ob stičišču se sme dotikati zadnjih nekaj gradnikov (kratki zavoji), drugje ne prekrije ničesar
    if (old != null && (dj > 5 || old < cur - 3)) return false;
    if (dj <= 5) continue;
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
      const o2 = T0.own.get((c + dc) + ',' + (r + dr));
      if (o2 != null && o2 < cur - 1) return false;
    }
  }
  return true;
}

/* ===================================================================== */
/*  Gradniki                                                             */
/* ===================================================================== */

const speedFor = w => (w >= 5 ? 5.5 : w >= 3 ? 4.8 : 4);
const sideSign = R => (R() < 0.5 ? -1 : 1);

/** Polnila: ravnina (+ žep z zvezdico), klanec, ozek most, podlaga. */
const FILL = {
  straight(T, R, x) {
    const w = x.width(R);
    T.speed = speedFor(w);
    T.go(R.int(3, 6), { w });
  },
  ramp(T, R, x) {
    const w = Math.max(3, x.width(R));
    T.speed = speedFor(w);
    const m = R.int(1, 1 + Math.round(x.o.hills * 3));
    const up = T.h < 1 || (T.h < 6 && R() < 0.5);
    T.go(R.int(1, 2), { w });
    T.go(m + R.int(1, 2), up ? { up: m, w } : { down: m, w });
    T.go(1);
    T.inc('ramp');
  },
  narrow(T, R, x) {
    const rails = T.rails;
    T.rails = rails && R() < 0.5;
    T.speed = 4;
    T.go(2, { w: 3 }).wp();
    const fall = x.o.surfaces.fall > 0 && R() < x.o.surfaces.fall * 1.5;
    const ice = !fall && x.o.surfaces.ice > 0 && R() < x.o.surfaces.ice * 1.5;
    if (!fall && !ice && R() < 0.35) {
      // ozka cikcak pot (vzorec: Steklena pot)
      const d0 = T.dir;
      T.go(3, { w: 1 });
      for (let k = R.int(1, 2); k > 0; k--) {
        const sd = d0 === 'N' ? R.pick(['E', 'W']) : 'N';
        T.turn(sd).go(2).turn(d0).go(2);
      }
      T.go(1);
    } else {
      const n = R.int(4, 9);
      T.go(n, { w: 1, ch: fall ? 'x' : ice ? 'i' : '.', wp: { speed: fall ? 3.6 : ice ? 3 : 4 } });
      if (fall) T.inc('fall', n); else if (ice) T.inc('ice', n);
    }
    T.rails = rails;
    T.go(2, { w: 3 });
    T.inc('narrow');
  },
  surface(T, R, x, kind) {
    const w = Math.max(3, x.width(R));
    T.speed = speedFor(w);
    const n = R.int(4, 8);
    T.go(1, { w });
    if (kind === 'conveyor') {
      const back = R() < 0.25 + 0.1 * (x.o.diff || 3);
      // točka poti šele za trakom: na traku nazaj s počasnejšo naslednjo točko bi krogla obstala
      T.go(n, { conv: back ? 'B' : 'F' });
      if (back) T.go(1).wp({ speed: 5.5 });
      T.inc('conveyor', n);
    } else if (kind === 'fall') {
      T.wp();
      T.go(n, { ch: 'x', wp: { speed: 3.6 } });
      T.inc('fall', n);
    } else if (kind === 'ice') {
      T.speed = 4; T.wp();
      T.go(n, { ch: 'i' });
      T.inc('ice', n);
    } else {
      T.go(n, { ch: SURFACES[kind].ch });
      T.inc(kind, n);
    }
    T.go(2);
  },
};

/** Posebni gradniki (ovire, sovražniki, skoki) — vzorci iz uradnih prog. n = koliko objektov naj postavi. */
const SPECIAL = {
  jump(T, R) {
    T.speed = 5;
    if (R() < 0.5) {
      // klančina čez prepad (vzorec: Nebo)
      // na ravnem krogla doseže le ~7 m/s, zato pred skokom vedno spust (kot v uradnih progah)
      const A = R() < 0.5, drop = A ? 4 : 2;
      T.go(2, { w: 3 });
      if (T.h < drop * 0.5) T.go(drop + 2, { up: drop }).go(1);
      if (A) { T.go(4, { down: 4 }).go(3).go(1, { up: 1 }); T.wp({ speed: 9 }); T.gap(3, -1); }
      else { T.go(2, { down: 2 }).go(2).go(2, { up: 2 }); T.wp({ speed: 9 }); T.gap(2, -1.5); }
      // točka pristanka dovolj daleč, da je autopilot ne doseže še v zraku (sicer zavira in pade v prepad)
      T.go(3, { w: 5 }).wp({ speed: 9, r: 1 }).go(3).wp({ speed: 4, r: 0.8 }).go(2, { w: 3 });
      T.inc('rampJump');
    } else {
      // vzmet čez prepad (vzorec: Ledena dvorana)
      T.speed = 4;
      T.go(3, { w: 3 });
      const hi = R() < 0.4;
      T.go(1);
      T.add('springs', { x: T.x, z: T.z, dir: [T.dc, T.dr], power: hi ? 9.5 : 8.5, up: hi ? 8 : 6.5 });
      T.wp({ speed: 3, r: 0.6 });
      T.gap(4, hi ? 1 : 0).go(2, { w: hi ? 5 : 3, ch: 'g' }).wp({ speed: 3, r: 0.8 }).go(2, { w: 3 });
      T.inc('spring');
    }
    T.inc('jump');
  },
  mover(T, R) {
    // plošča vozi vstran čez prepad (vzorec: Kuhinja)
    T.speed = 4;
    T.go(3, { w: 3 }).wp({ until: [11.5, 0.1, 1.0], speed: 3 });
    const s = sideSign(R);
    const [mx, mz] = T.rel(0, 2);
    const dx = T.px * s * 6, dz = T.pz * s * 6;
    const idx = (T.obj.movers || []).length;
    T.add('movers', { path: [[mx, T.h, mz], [mx + dx, T.h, mz + dz]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 });
    T.route.push({ mover: idx, x: 0, z: 0, until: [11.5, 5.95, 7.0], speed: 3, r: 0.25 });
    T.gap(3).move(dx, dz).go(1, { w: 3 }).wp({ speed: 3 }).go(2);
    T.inc('mover');
  },
  spinner(T, R, x) {
    // vrtljiva plošča čez prepad (vzorec: Neon)
    T.speed = 4.5;
    T.go(4, { w: 3 }).wp();
    const [sx, sz] = T.rel(0, 3);
    T.add('spinners', { x: sx, z: sz, r: 2.55, y: T.h, speed: sideSign(R) * ((x.o.diff || 3) >= 4 ? 0.8 : 0.6) });
    T.gap(1).wpAt(sx, sz, { speed: 3, r: 0.5 }).gap(4).go(2).wp({ speed: 3, r: 0.8 }).go(2);
    T.inc('spinner');
  },
  hammer(T, R, x, n) {
    // kladiva na časovnik (vzorec: Tovarna) — počakaj takoj po udarcu, nato skozi vsa
    T.speed = 4.5;
    T.go(3, { w: 3 }).wp({ until: [3, 2.32, 2.6] });
    for (let k = 0; k < n; k++) {
      T.go(2);
      const s = k % 2 ? -1 : 1;
      T.add('hammers', { ...T.rowRect(3), period: 3, phase: 0.15, dir: [T.px * s, T.pz * s] });
      T.go(1);
    }
    T.wp({ speed: 5 }).go(2);
    T.inc('hammer', n);
  },
  bumper(T, R, x, n) {
    // slalom med odbijači
    T.speed = 4;
    T.go(2, { w: 5 });
    let s = sideSign(R);
    for (let k = 0; k < n; k++) {
      T.go(2);
      const [bx, bz] = T.rel(s * 1.2, 0);
      T.add('bumpers', { x: bx, z: bz, r: 0.4, power: 7, y: T.h });
      T.wpRel(-s * 1.0, 0, { speed: 3.5, r: 0.6 });
      s = -s;
    }
    T.go(2).wp({ speed: 4, r: 0.6 }).go(1, { w: 3 });
    T.inc('bumper', n);
  },
  fan(T, R, x, n) {
    // ventilatorji pihajo čez pot (vzorec: Stolp)
    const w = 3;
    T.speed = 4.5;
    T.go(2, { w }).wp();
    let s = sideSign(R);
    for (let k = 0; k < n; k++) {
      T.go(3);
      const [fx, fz] = T.rel(s * (w / 2 + 0.2), 0);
      T.add('fans', { x: fx, z: fz, dir: [-T.px * s, -T.pz * s], len: w + 0.6, width: 1.6, force: 7 });
      s = -s;
    }
    T.go(2).wp();
    T.inc('fan', n);
  },
  bowl(T, R) {
    // skleda na široki poti (vzorec: Skodelice)
    const w = R() < 0.5 ? 5 : 7;
    T.speed = 5;
    T.go(1, { w: 3 }).go(7, { w });
    const [bx, bz] = T.rel(0, -3);
    T.add('bowls', { x: bx, z: bz, r: (w - 1) / 2, depth: 0.7 + R() * 0.15 });
    T.go(2, { w: 3 });
    T.inc('bowl');
  },
  door(T, R, x) {
    // stikalo v stranskem žepu odpre vrata (vzorec: Tovarna)
    T.speed = 4.5;
    T.go(3, { w: 3 });
    const s = sideSign(R);
    const id = String.fromCharCode(97 + (T.obj.doors || []).length);
    for (let k = 2; k <= 4; k++) { const [cx, cz] = T.rel(s * k, 0); T.set(Math.floor(cx), Math.floor(cz), '.'); }
    const [wx, wz] = T.rel(s * 4, 0);
    T.add('switches', { x: wx, z: wz, id });
    x.spots.push(T.rel(s * 4.6, 0));
    T.wp({ speed: 3, r: 0.4 }).wpAt(wx, wz, { stop: true, r: 0.3 }).wp({ stop: true, r: 0.4 });
    T.go(2);
    T.add('doors', { ...T.rowRect(3), y: T.h, h: 1.2, id });
    T.go(3);
    T.inc('door');
  },
  bully(T, R, x, n) {
    // arena z nasilnežem (vzorec: Nasilneži). Pot autopilota obide območje lova (zone),
    // igralca pa nasilnež ujame, če zaide preblizu.
    T.speed = 5;
    T.go(4, { w: 3 }).wp({ speed: 4.5, r: 0.6 });
    const s = sideSign(R);
    if (n >= 2) {
      T.go(12, { w: 9 });
      const a = T.rel(-s * 2.5, -8.5), b = T.rel(s * 2.5, -3.5);
      T.add('enemies', { t: 'bully', x: a[0], z: a[1], zone: 3.2 }).add('enemies', { t: 'bully', x: b[0], z: b[1], zone: 3.2 });
      x.spots.push(T.rel(-s * 4, -11), T.rel(s * 4, -1));
      T.wpRel(s * 3, -9, { speed: 5 }).wpRel(-s * 3, -3, { speed: 5 });
    } else {
      T.go(9, { w: 9 });
      const a = T.rel(s * 2.5, -4);
      T.add('enemies', { t: 'bully', x: a[0], z: a[1], zone: 4.5 });
      x.spots.push(T.rel(s * 4, -8), T.rel(s * 4, 0));
      T.wpRel(-s * 3, -7, { speed: 5 }).wpRel(-s * 3, -1, { speed: 5 });
    }
    T.go(2, { w: 3 }).wp({ speed: 3.5, r: 0.4 }).go(2);
    T.inc('bully', Math.min(2, n));
  },
  saw(T, R, x, n) {
    // žage čez široko pot, prehod ob pravem času (vzorec: Neon)
    T.speed = 4.5;
    T.go(2, { w: 3 }).go(10, { w: 5 });
    const F = [-7, -4, -1], PH = [0, 0.25, 0.5];
    for (let k = 0; k < n; k++) {
      const s = k % 2 ? 1 : -1;
      T.add('enemies', { t: 'saw', path: [T.rel(s * 2, F[k]), T.rel(-s * 2, F[k])], loop: false, speed: 2.6, phase: PH[k] });
    }
    x.spots.push(T.rel(2, -9));
    T.wpRel(0, -8.5, { speed: 3.5 }).wpRel(0, -8.5, { until: [3.0769, 2.4, 2.9], speed: 3.5, r: 0.4 }).wpRel(0, 1, { speed: 5 });
    T.go(2, { w: 3 });
    T.inc('saw', n);
  },
  wasp(T, R, x, n) {
    // ose letijo čez pot (vzorec: Neon)
    T.speed = 4;
    T.go(3, { w: 3 });
    for (let k = 0; k < n; k++) {
      T.wp({ until: [4, 3.3, 3.9], speed: 3, r: 0.4 });
      T.add('enemies', { t: 'wasp', path: [T.rel(1.6, 1.5), T.rel(-1.6, 1.5)], loop: false, speed: 1.6 });
      T.go(3);
    }
    T.go(1).wp();
    T.inc('wasp', n);
  },
  vacuum(T, R) {
    // sesalec ob ozkem mostu (vzorec: Nebo)
    T.speed = 5;
    const rails = T.rails; T.rails = false;
    T.go(2, { w: 3 }).wp();
    T.go(9, { w: 1 });
    const s = sideSign(R);
    const [vx, vz] = T.rel(s * 2.6, -4.5);
    T.add('enemies', { t: 'vacuum', x: vx, z: vz, dir: [-T.px * s, -T.pz * s], range: 4, angle: 45, force: 7 });
    T.claim(...T.rel(s * 2.6, -4.5).map(Math.floor), 1);
    T.rails = rails;
    T.go(3, { w: 3 }).wp({ speed: 4.5, r: 0.6 });
    T.inc('vacuum');
  },
  magnet(T, R, x, n) {
    // magneta ob ozki poti (vzorec: Nasilneži)
    T.speed = 5;
    const rails = T.rails; T.rails = false;
    T.go(2, { w: 3 }).wp();
    T.go(10, { w: 1 });
    const s = sideSign(R);
    const P = [[-5, -s * 2.5, 0], [-2, s * 2.5, 0.5]];
    for (let k = 0; k < n; k++) {
      const [mx, mz] = T.rel(P[k][1], P[k][0]);
      T.add('enemies', { t: 'magnet', x: mx, z: mz, mode: 'pull', period: 3, duty: 0.4, phase: P[k][2], range: 3.5, force: 10 });
    }
    T.rails = rails;
    T.go(2, { w: 3 }).wp({ speed: 4, r: 0.5 });
    T.inc('magnet', n);
  },
};

/** Koliko objektov postavi en gradnik vrste k (iz preostanka rem). */
function chunk(k, rem, R) {
  if (k === 'hammer' || k === 'saw' || k === 'fan') return Math.min(rem, R.int(1, 3));
  if (k === 'bumper') return Math.min(rem, R.int(2, 4));
  if (k === 'bully' || k === 'magnet' || k === 'wasp') return Math.min(rem, R.int(1, 2));
  return 1;
}

/* ===================================================================== */
/*  Gradnja ene proge                                                    */
/* ===================================================================== */

/**
 * Zgradi progo iz nastavitev in generatorja naključnih števil (brez preverjanja z autopilotom).
 * @returns {{L:Object, report:Object}}
 */
export function buildLevel(o, R, meta) {
  const want = { ...o.enemies, ...o.obstacles, jump: o.jumps };
  const deck = [];
  for (const [k, v] of Object.entries(want)) {
    let rem = v | 0;
    while (rem > 0) { const n = chunk(k, rem, R); deck.push({ k, n }); rem -= n; }
  }
  const order = R.shuffle(deck);
  const S = Math.max(o.segments, order.length + Math.ceil(order.length / 3) + 1);
  // mesta posebnih gradnikov med S odseki (prvi odsek je vedno polnilo)
  const slots = R.shuffle(Array.from({ length: S - 1 }, (_, i) => i + 1)).slice(0, order.length).sort((a, b) => a - b);
  const plan = Array(S).fill(null);
  slots.forEach((s, i) => { plan[s] = order[i]; });

  const pocketsWanted = Math.round(5 * o.pockets);
  const x = {
    o, spots: [],
    width: r => { const odd = [1, 3, 5].filter(w => w >= o.wMin && w <= o.wMax); return odd.length ? r.pick(odd) : (o.wMin % 2 ? o.wMin : o.wMin + 1); },
    wantPocket: r => {
      const made = T.count.pocket || 0;
      if (made >= pocketsWanted) return false;
      return r() < Math.min(1, (pocketsWanted - made) / Math.max(1, (S - seg) * 0.45));
    },
  };
  let T = new GTrack({ speed: 5 });
  T.at(0, 0, 'N', 0).row(0, 0, 3, '.', 0);
  T.mark('start'); T.w = 3;
  T.go(2);
  const warnings = [];
  const cpEvery = CHECKPOINTS[o.checkpoints].every;
  const clockAt = new Set();
  for (let j = 0; j < o.clocks; j++) clockAt.add(Math.max(1, Math.round((j + 1) * S / (o.clocks + 1)) - 1));
  let seg = 0, sinceTurn = 0, carry = [];
  const surfKeys = Object.keys(SURFACES).filter(k => o.surfaces[k] > 0);
  const pickFill = () => {
    const u = R();
    let acc = 0;
    const tot = surfKeys.reduce((a, k) => a + o.surfaces[k], 0) * 0.6;
    const norm = tot > 0.85 ? 0.85 / tot : 1;
    for (const k of surfKeys) { acc += o.surfaces[k] * 0.6 * norm; if (u < acc) return ['surface', k]; }
    if (R() < o.narrow) return ['narrow'];
    if (R() < o.hills * 0.6) return ['ramp'];
    return ['straight'];
  };
  // prostor do roba mreže proti vzhodu/zahodu (glede na že zgrajeni del)
  const room = C => ({ E: C.bb[0] + o.maxW - 9 - C.c, W: C.c - (C.bb[1] - o.maxW + 9) });
  // margin: rezerva v mreži, da gre na konec vedno še cilj
  const apply = (fn, turn, label = '?', margin = 6) => {
    const C = T.clone();
    C.seg = seg + 1; C.log = [];
    const junction = [C.c, C.r];
    C.rails = R() < o.walls;
    fn(C);
    // žep z zvezdico ob koncu gradnika (slepa ulica ob poti)
    if (x.wantPocket(R)) {
      C.go(1);
      C.pocket(sideSign(R) * (Math.floor(C.w / 2) + 1), R.int(2, 3), 'star');
      C.inc('pocket');
      C.go(1);
    }
    if (turn) {
      const opts = TURN_FROM[C.dir];
      // ob robu mreže nazaj proti sredini, sicer raje v isto stran kot prej (stopnice, manj trkov)
      const rm = room(C);
      const d = opts.length > 1 ? (rm.E < 30 ? 'W' : rm.W < 30 ? 'E' : R() < 0.7 ? C.side : R.pick(opts)) : opts[0];
      if (d !== 'N') C.side = d;
      C.go(1).turn(d);
    }
    if (!fits(T, C, junction, o.maxW - margin, o.maxD - margin)) return false;
    T = C; seg++;
    return true;
  };
  // če posebnega gradnika ni bilo mogoče postaviti, se prenese naprej (proga se po potrebi podaljša)
  for (let i = 0; i < S || (carry.length && i < S + 2 * order.length + 4); i++) {
    let item = plan[i] || null;
    if (!item && carry.length) item = carry.shift();
    const depth = (T.bb[3] - T.bb[2]) / o.maxD;
    // globina mreže je omejena: dolge posebne gradnike raje postavi na odseke proti vzhodu/zahodu
    if (item && T.dir === 'N' && depth > 0.3) { carry.unshift(item); item = null; }
    // proti severu le en gradnik, nato zavoj; vzhod/zahod traja dlje (ob robu mreže zavij)
    const deep = depth > 0.55;
    const turn = T.dir === 'N' || (T.dir !== 'N' && room(T)[T.dir] < 24) || (deep ? sinceTurn >= 6 || R() < 0.12 : sinceTurn >= 3 || R() < 0.35);
    let done = false;
    if (item) {
      const fn = C => SPECIAL[item.k](C, R, x, item.n);
      done = apply(fn, turn, item.k) || apply(fn, !turn, item.k) || (apply(C => { C.go(1); C.turn(TURN_FROM[C.dir][0]); }, false, 'turn') && apply(fn, false, item.k));
      if (!done) carry.unshift(item);
    }
    if (!done) {
      const [kind, sk] = pickFill();
      const fn = C => FILL[kind](C, R, x, sk);
      done = apply(fn, turn, kind + (sk ? ':' + sk : '')) || apply(fn, !turn, kind) || apply(C => FILL.straight(C, R, x), true, 'straight') || apply(C => FILL.straight(C, R, x), false, 'straight')
        || (T.dir !== 'N' && apply(C => { C.turn('N'); FILL.straight(C, R, x); }, false, 'straight'));
    }
    if (!done) { warnings.push('Proga je krajša od želene (zmanjkalo je prostora v mreži).'); break; }
    sinceTurn = turn ? 0 : sinceTurn + 1;
    // kontrolne točke in ure na koncu odseka (vedno na navadnih tleh)
    const t = T.get(T.c, T.r);
    if (t && t.ch === '.') {
      if (cpEvery && (i + 1) % cpEvery === 0 && i < S - 1) T.mark('cp');
      else if (clockAt.has(i)) { T.mark('clock'); clockAt.delete(i); }
    }
  }
  for (const it of carry) warnings.push(`${(ENEMIES[it.k] || OBSTACLES[it.k] || { name: 'Skoki' }).name}: ${it.n} ni bilo mogoče postaviti.`);
  // cilj
  const goalFn = C => { C.rails = false; C.go(2, { w: 3 }).mark('goal').go(2); C.wp(); };
  const goalOk = apply(goalFn, false, 'goal', 0)
    || apply(C => { C.go(1).turn(C.dir === 'N' ? (room(C).E > room(C).W ? 'E' : 'W') : 'N'); goalFn(C); }, false, 'goal', 0);
  if (!goalOk) { T.seg++; goalFn(T); }
  T.route.push({ x: T.marks.goal[0], z: T.marks.goal[1], speed: T.speed });

  // zvezdice: točno 5 (žepi, posebna mesta, nato enakomerno po poti)
  let stars = T.marks.pickups.filter(p => p.t === 'star').length;
  if (stars > 5) {
    let drop = stars - 5;
    T.marks.pickups = T.marks.pickups.filter(p => !(p.t === 'star' && drop-- > 0));
    stars = 5;
  }
  const used = [T.marks.start, T.marks.goal, ...T.marks.checkpoints, ...T.marks.pickups.map(p => [p.x, p.z])];
  const free = p => used.every(q => Math.hypot(q[0] - p[0], q[1] - p[1]) > 1.2);
  for (const p of R.shuffle(x.spots)) {
    if (stars >= 5 || stars >= pocketsWanted) break;
    if (!free(p)) continue;
    const c = Math.floor(p[0]), r = Math.floor(p[1]);
    if (!T.get(c, r)) continue;
    T.marks.pickups.push({ t: 'star', x: c + 0.5, z: r + 0.5 }); used.push(p); stars++;
  }
  const trail = T.trail.slice(3, -2).filter(free);
  const need = 5 - stars;
  for (let j = 0; j < need && trail.length; j++) {
    const p = trail[Math.min(trail.length - 1, Math.floor((j + 0.5) * trail.length / need))];
    if (!free(p)) continue;
    T.marks.pickups.push({ t: 'star', x: p[0], z: p[1] }); used.push(p); stars++;
  }
  for (const p of T.trail) {   // rezerva za zelo kratke proge
    if (stars >= 5) break;
    if (!used.some(q => q[0] === p[0] && q[1] === p[1])) { T.marks.pickups.push({ t: 'star', x: p[0], z: p[1] }); used.push(p); stars++; }
  }

  const L = finish(T, meta);
  if (meta.look) L.look = meta.look;
  L.timeBonus = 60; L.medals = { gold: 30, silver: 40, bronze: 50 };   // začasno, do vožnje autopilota
  const count = T.count;
  const placed = {};
  for (const k of [...Object.keys(ENEMIES), ...Object.keys(OBSTACLES)]) placed[k] = count[k] || 0;
  placed.jump = count.jump || 0;
  const tiles = L.map.reduce((a, r) => a + [...r].filter(ch => ch !== ' ' && ch !== '#').length, 0);
  return {
    L, T,
    report: {
      segments: seg, tiles, size: L.size.slice(), placed, wanted: want,
      surfaces: { ice: count.ice || 0, glue: count.glue || 0, wave: count.wave || 0, conveyor: count.conveyor || 0, fall: count.fall || 0 },
      narrow: count.narrow || 0, ramps: count.ramp || 0, pockets: count.pocket || 0,
      checkpoints: L.checkpoints.length, clocks: L.pickups.filter(p => p.t === 'clock').length,
      stars: L.pickups.filter(p => p.t === 'star').length,
      warnings,
    },
  };
}

/* ===================================================================== */
/*  Generator s preverjanjem                                             */
/* ===================================================================== */

const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'x';

/** Ime, id, opis in tema proge iz nastavitev in semena. */
function metaFor(o, seed) {
  const tr = rng(seed + ':tema');
  const theme = o.theme !== 'random' ? o.theme : tr.pick(THEME_IDS);
  const d = o.diff;
  const set = !d ? 2 : d <= 2 ? 1 : d === 3 ? 2 : 3;
  const desc = `Naključna proga · seme ${seed} · ${d ? DIFF_NAMES[d - 1] : 'po meri'} · ${LENGTHS[o.length].name.toLowerCase()} dolžina · lokacija ${THEME_NAMES[theme]}`
    + (d && isPreset(o) ? '' : ` · ${o.segments} odsekov`);
  return { id: '50-nakljucna-' + slug(seed), name: ('Naključna ' + seed).slice(0, 40), set, desc: desc.slice(0, 300), theme, look: THEME_LOOK[theme] };
}

/**
 * Generator po korakih (en poskus na korak) — za Web Worker in za izvajanje v kosih.
 * Vsak yield vrne { k, tries } (napredek); return vrne končni rezultat.
 */
export function* generateSteps(opts = {}) {
  const o = normalizeOpts(opts);
  const seed = o.seed || randomSeed();
  const meta = metaFor(o, seed);
  let best = null;
  for (let k = 0; k < o.maxTries; k++) {
    yield { k: k + 1, tries: o.maxTries };
    const R = rng(k ? seed + ':' + k : seed);
    const { L, report } = buildLevel(o, R, meta);
    const errors = validateLevel(L);
    let res = null;
    if (!errors.length) {
      try { res = runAutopilot(L, { maxT: 240 }); } catch (e) { res = { finished: false, time: null, falls: 99, stars: 0, err: String(e) }; }
    }
    const score = errors.length ? -1e9 : res.finished ? 1e6 - res.falls * 1e4 : -(res.falls || 0);
    const cand = { L, report, errors, res, k, score };
    if (!best || score > best.score) best = cand;
    if (res && res.finished && res.falls === 0) break;
  }
  const { L, report, errors, res, k } = best;
  const ok = !errors.length && !!res?.finished;
  if (ok) {
    const sc = scoringFromRun(res);
    L.medals = sc.medals; L.timeBonus = sc.timeBonus; L.dev = sc.dev;
  }
  report.tries = k + 1;
  report.time = res?.time != null ? Math.round(res.time * 10) / 10 : null;
  report.falls = res?.falls ?? null;
  report.botStars = res?.stars ?? 0;
  report.target = LENGTHS[o.length].target;
  if (errors.length) report.warnings.push(...errors);
  if (!ok) report.warnings.unshift(`Autopilot v ${o.maxTries} poskusih ni prišel do cilja — proga morda ni rešljiva. Poskusi drugo seme ali manj ovir.`);
  else if (res.falls) report.warnings.push(`Autopilot je med vožnjo padel ${res.falls}×.`);
  return { L, seed, tries: k + 1, ok, report, opts: o };
}

/** Sinhrono: vrne { L, seed, tries, ok, report, opts }. */
export function generateLevel(opts = {}, { onProgress } = {}) {
  const it = generateSteps(opts);
  for (;;) {
    const s = it.next();
    if (s.done) return s.value;
    onProgress?.(s.value);
  }
}

/** Asinhrono v kosih (brez Web Workerja): med poskusi sprosti glavno nit. signal: AbortSignal. */
export async function generateLevelAsync(opts = {}, { onProgress, signal } = {}) {
  const it = generateSteps(opts);
  for (;;) {
    if (signal?.aborted) throw new DOMException('Preklicano', 'AbortError');
    const s = it.next();
    if (s.done) return s.value;
    onProgress?.(s.value);
    await new Promise(r => setTimeout(r, 0));
  }
}
