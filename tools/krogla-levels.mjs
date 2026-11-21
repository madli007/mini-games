/* =====================================================================
   Generator prog za Hrčkovo kroglo (brez npm odvisnosti).
     node tools/krogla-levels.mjs          → zapiše games/krogla/levels/*.json, index.json
                                              in blok zlatih časov v supabase/games/krogla.sql
     node tools/krogla-levels.mjs --check  → samo izpiše čase autopilota

   Proge opišemo z »želvico« (Track): naprej, zavij, klančina gor/dol, prepad, ožina …
   Želvica sproti zapiše tudi pot za autopilota (route), s katero preverimo, da je proga
   rešljiva, in izmerimo čase za medalje. Rezultat je navaden JSON (format: games/krogla/README.md).
   ===================================================================== */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { validateLevel, heightChar } from '../games/krogla/level.js';
import { runAutopilot } from '../games/krogla/autopilot.js';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('games/krogla/levels/', ROOT);
const CHECK = process.argv.includes('--check');
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);

const THEMES = {
  vrt: { sky: ['#1b1446', '#ff7ac8'], fog: '#3a2160', floor: '#3ddc84', side: '#1f6f4a', edge: '#b6ffcf', accent: '#ffd23f', wall: '#ff4fd8' },
  kuhinja: { sky: ['#120f2e', '#ffb35c'], fog: '#40264a', floor: '#ffd9a8', side: '#a0603a', edge: '#fff2d6', accent: '#ff4fd8', wall: '#4de1ff' },
  steklo: { sky: ['#06142e', '#4de1ff'], fog: '#0d2a4a', floor: '#9fe8ff', side: '#2a6f9a', edge: '#e6fbff', accent: '#ff4fd8', wall: '#ffd23f' },
  tovarna: { sky: ['#110a1c', '#ff7a1a'], fog: '#2e1a1a', floor: '#c9c3b8', side: '#6b5a4a', edge: '#ffd23f', accent: '#ff3b5c', wall: '#ff7a1a' },
  stolp: { sky: ['#0b0b2a', '#a78bfa'], fog: '#231a4a', floor: '#d6c8ff', side: '#5a4a9a', edge: '#ffffff', accent: '#ffd23f', wall: '#ff4fd8' },
  led: { sky: ['#071a33', '#bfe9ff'], fog: '#173a5e', floor: '#e4f6ff', side: '#5a90c0', edge: '#ffffff', accent: '#ff4fd8', wall: '#4de1ff' },
  arena: { sky: ['#1a0610', '#ff3b5c'], fog: '#3a0f1e', floor: '#ffc0cb', side: '#8a2a4a', edge: '#ffd23f', accent: '#4de1ff', wall: '#ff3b5c' },
  neon: { sky: ['#050510', '#5b1a8a'], fog: '#1a0a2e', floor: '#2b2b55', side: '#131330', edge: '#ff4fd8', accent: '#39ff88', wall: '#4de1ff' },
  nebo: { sky: ['#0a1f5c', '#ffd0f0'], fog: '#5a6fb0', floor: '#ffffff', side: '#9aa8e0', edge: '#ffd23f', accent: '#ff4fd8', wall: '#a78bfa' },
  nemogoce: { sky: ['#000000', '#ff3b5c'], fog: '#1a0000', floor: '#ffd23f', side: '#5a3a00', edge: '#ff3b5c', accent: '#4de1ff', wall: '#ff3b5c' },
};

/* ===================================================================== */
/*  Želvica                                                              */
/* ===================================================================== */

const D4 = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const RAMP_UP = { N: '^', S: 'v', E: '>', W: '<' };
const RAMP_DOWN = { N: 'v', S: '^', E: '<', W: '>' };
const CONV = { N: 'N', S: 'S', E: 'E', W: 'W' };
const BACK = { N: 'S', S: 'N', E: 'W', W: 'E' };

class Track {
  constructor({ speed = 5, dir = 'N' } = {}) {
    this.tiles = new Map();
    this.c = 0; this.r = 0; this.dir = dir; this.h = 0; this.w = 3;
    this.speed = speed;
    this.route = [];
    this.marks = { start: null, goal: null, checkpoints: [], pickups: [] };
    this.obj = {};
  }
  get dc() { return D4[this.dir][0]; }
  get dr() { return D4[this.dir][1]; }
  /** Središče trenutne ploščice v svetovnih koordinatah. */
  get x() { return this.c + 0.5; }
  get z() { return this.r + 0.5; }
  set(c, r, ch, h = this.h) { this.tiles.set(c + ',' + r, { c, r, ch, h }); return this; }
  get(c, r) { return this.tiles.get(c + ',' + r); }
  /** Vrstica ploščic pravokotno na smer, širine w, s središčem v (c, r). */
  row(c, r, w, ch, h) {
    const px = -this.dr, pz = this.dc;
    const lo = -Math.floor((w - 1) / 2);
    for (let k = lo; k < lo + w; k++) this.set(c + px * k, r + pz * k, ch, h);
  }
  /** Postavi želvico. */
  at(c, r, dir = this.dir, h = this.h) { this.c = c; this.r = r; this.dir = dir; this.h = h; return this; }
  /** Naprej n ploščic. o: { w, ch, up, down, wp, conv:'F'|'B' } */
  go(n, o = {}) {
    const w = o.w ?? this.w;
    this.w = w;
    for (let i = 1; i <= n; i++) {
      this.c += this.dc; this.r += this.dr;
      let ch = o.ch || '.', h = this.h;
      if (o.up && i <= o.up) { ch = RAMP_UP[this.dir]; h = this.h; this.h += 0.5; }
      else if (o.down && i <= o.down) { ch = RAMP_DOWN[this.dir]; this.h -= 0.5; h = this.h; }
      else if (o.conv) ch = CONV[o.conv === 'F' ? this.dir : BACK[this.dir]];
      this.row(this.c, this.r, w, ch, h);
    }
    if (o.wp) this.wp(o.wp === true ? {} : o.wp);
    return this;
  }
  /** Prepad: premakni se naprej brez ploščic (dh: sprememba višine po prepadu). */
  gap(n, dh = 0) { this.c += this.dc * n; this.r += this.dr * n; this.h += dh; return this; }
  /** Premakni kazalec (brez ploščic). */
  move(dc, dr, dh = 0) { this.c += dc; this.r += dr; this.h += dh; return this; }
  /** Zavij; zapolni vogal in doda točko poti. */
  turn(dir, o = {}) {
    const w = o.w ?? this.w;
    const lo = -Math.floor((w - 1) / 2);
    for (let a = lo; a < lo + w; a++) for (let b = lo; b < lo + w; b++) {
      if (!this.get(this.c + a, this.r + b)) this.set(this.c + a, this.r + b, '.', this.h);
    }
    if (o.wp !== false) this.wp({ ...(w === 1 ? { stop: true, r: 0.3 } : { r: 0.6 }), ...(o.wp || {}) });
    this.dir = dir;
    return this;
  }
  /** Točka poti za autopilota v središču trenutne ploščice (dx, dz: odmik). */
  wp(o = {}, dx = 0, dz = 0) { this.route.push({ x: this.x + dx, z: this.z + dz, speed: this.speed, ...o }); return this; }
  /** Točka poti v poljubnih koordinatah. */
  wpAt(x, z, o = {}) { this.route.push({ x, z, speed: this.speed, ...o }); return this; }
  /** Oznaka relativno na želvico: side (desno +), fwd (naprej +). */
  mark(kind, side = 0, fwd = 0) {
    const px = -this.dr, pz = this.dc;
    const c = this.c + px * side + this.dc * fwd, r = this.r + pz * side + this.dr * fwd;
    const p = [c + 0.5, r + 0.5];
    if (!this.get(c, r)) this.set(c, r, '.');
    if (kind === 'start') this.marks.start = p;
    else if (kind === 'goal') this.marks.goal = p;
    else if (kind === 'cp') this.marks.checkpoints.push(p);
    else this.marks.pickups.push({ t: kind, x: p[0], z: p[1] });
    return this;
  }
  /** Žep ob poti (slepa ulica) z zvezdico na koncu. */
  pocket(side, len, kind = 'star', w = 1) {
    const px = -this.dr, pz = this.dc;
    const s = Math.sign(side), off = Math.abs(side);
    for (let k = 0; k < len; k++) this.set(this.c + px * s * (off + k), this.r + pz * s * (off + k), '.', this.h);
    if (kind) this.mark(kind, s * (off + len - 1), 0);
    return this;
  }
  /** Pravokotnik ploščic v absolutnih koordinatah. */
  rect(c0, r0, w, d, ch = '.', h = this.h) {
    for (let r = r0; r < r0 + d; r++) for (let c = c0; c < c0 + w; c++) this.set(c, r, ch, h);
    return this;
  }
  /** Dodaj objekt (movers, fans, …). */
  add(kind, o) { (this.obj[kind] ||= []).push(o); return this; }
}

/** Želvica → proga (obreže na velikost in premakne vse koordinate). */
function finish(T, meta) {
  const ts = [...T.tiles.values()];
  const c0 = Math.min(...ts.map(t => t.c)) - 1, r0 = Math.min(...ts.map(t => t.r)) - 1;
  const c1 = Math.max(...ts.map(t => t.c)) + 1, r1 = Math.max(...ts.map(t => t.r)) + 1;
  const W = c1 - c0 + 1, D = r1 - r0 + 1;
  const minH = Math.min(...ts.map(t => t.h));
  const base = minH < 0 ? -minH : 0;     // višine ne smejo biti negativne
  const map = Array.from({ length: D }, () => Array(W).fill(' '));
  const hm = Array.from({ length: D }, () => Array(W).fill('0'));
  for (const t of ts) { map[t.r - r0][t.c - c0] = t.ch; hm[t.r - r0][t.c - c0] = heightChar(t.h + base); }
  const sx = -c0, sz = -r0, sy = base;
  const P = p => [p[0] + sx, p[1] + sz];
  const pt3 = p => [p[0] + sx, p[1] + sy, p[2] + sz];
  const shift = (o, k = {}) => {
    const n = { ...o };
    if (typeof n.x === 'number') n.x += sx;
    if (typeof n.z === 'number') n.z += sz;
    if (typeof n.y === 'number') n.y += sy;
    if (n.path) n.path = n.path.map(p => p.length === 3 ? pt3(p) : P(p));
    return n;
  };
  const L = {
    id: meta.id, name: meta.name, set: meta.set, desc: meta.desc || '',
    size: [W, D],
    theme: { ...THEMES[meta.theme || 'vrt'], ...(meta.themeOver || {}) },
    timeBonus: 0, medals: { gold: 0, silver: 0, bronze: 0 },
    map: map.map(r => r.join('')),
    hmap: hm.map(r => r.join('')),
    start: P(T.marks.start), goal: P(T.marks.goal),
    checkpoints: T.marks.checkpoints.map(P),
    pickups: T.marks.pickups.map(p => shift(p)),
  };
  for (const [k, list] of Object.entries(T.obj)) L[k] = [...(L[k] || []), ...list.map(o => shift(o))];
  L.route = T.route.map(w => w.mover != null ? { ...w } : shift(w));
  if (meta.camYaw) L.camYaw = meta.camYaw;
  return L;
}

/* ===================================================================== */
/*  PROGE                                                                */
/* ===================================================================== */

const LEVELS = [];
const def = (meta, fn) => LEVELS.push({ meta, fn });

/* ------------------------------------------------- SKLOP 1: Vrt in kuhinja */

def({ id: '01-ogrevanje', name: 'Ogrevanje', set: 1, theme: 'vrt', desc: 'Široka pot, klančina in cilj. Spoznaj kontrole in kamero.' }, () => {
  const T = new Track({ speed: 6 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(1).mark('star', 2, 0);
  T.go(7).mark('clock');
  T.go(4, { up: 2 });
  T.go(3).pocket(3, 2);
  T.turn('E', { w: 5 }).go(7).mark('cp');
  T.go(3).turn('N', { w: 5 }).go(6, { w: 3 }).pocket(2, 3);
  T.go(4, { down: 2 }).go(2).turn('W', { w: 3 }).go(9).mark('star', 0, 0);
  T.turn('N').go(4).mark('cp').go(5, { up: 2 }).go(4, { w: 5 }).pocket(-3, 2);
  T.go(3).turn('E', { w: 5 }).go(5).turn('N', { w: 5 }).go(6).mark('goal').go(2);
  T.wp({}, 0, -2);
  return T;
});

def({ id: '02-vrtnarija', name: 'Vrtnarija', set: 1, theme: 'vrt', desc: 'Ozke poti brez ograj in prvi zavoji ob robu.' }, () => {
  const T = new Track({ speed: 4.2 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).mark('star', 0, -2);
  T.go(5, { w: 1 }).turn('E').go(5).pocket(-1, 2).turn('N').go(4).mark('clock').go(3);
  T.turn('W').go(8).mark('cp').go(1).turn('N').go(6, { up: 2 }).pocket(1, 3);
  T.go(2).turn('E').go(3).turn('N').go(3).turn('E').go(3).turn('N').go(3).turn('W').go(2);
  T.go(2).turn('N').go(5).mark('cp').go(2);
  T.turn('E').go(7, { down: 2 }).pocket(1, 2);
  T.turn('N').go(4).mark('star').go(3).turn('W').go(4).turn('N').go(3, { w: 3 }).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '03-skodelice', name: 'Skodelice', set: 1, theme: 'kuhinja', desc: 'Sklede, v katerih krogla zakroži, in valovita tla.' }, () => {
  const T = new Track({ speed: 5 });
  T.at(0, 0, 'N').row(0, 0, 5, '.', 0); T.mark('start'); T.w = 5;
  T.go(3);
  T.go(6, { ch: '~' }).mark('star', -2);
  T.go(3).wp();
  // velika skleda
  T.go(7, { w: 7 }); T.add('bowls', { x: T.x, z: T.z + 3, r: 3, depth: 0.8 }); T.mark('star', 0, -3);
  T.go(2, { w: 5 }).mark('cp').turn('E', { w: 5 }).go(4, { ch: '~' }).go(8, { w: 5 });
  T.add('bowls', { x: T.x - 4, z: T.z, r: 2, depth: 0.7 }, ).add('bowls', { x: T.x, z: T.z, r: 1.6, depth: 0.6 });
  T.mark('star', 2, -4);
  T.go(3).turn('N', { w: 5 }).go(5, { up: 2 }).mark('clock').go(4).mark('cp');
  T.go(6, { w: 7, ch: '~' }).mark('star', 3);
  T.go(3, { w: 5 }).turn('W', { w: 5 }).go(6);
  T.add('bowls', { x: T.x + 1, z: T.z, r: 2.2, depth: 0.9 }); T.mark('star', 0, -1);
  T.go(3).turn('N', { w: 5 }).go(5, { down: 2 }).go(3).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '04-kuhinja', name: 'Kuhinja', set: 1, theme: 'kuhinja', desc: 'Premične ploščice, ki vozijo levo-desno čez prepade.' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(6).mark('clock').go(2).wp({ until: [11.5, 0.1, 1.0], speed: 3 });
  // ploščica 1: od leve proti desni
  const z1 = T.z - 2;
  T.add('movers', { path: [[T.x, T.h, z1], [T.x + 6, T.h, z1]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 });
  T.add('pickups', { t: 'star', x: T.x + 3, z: z1, y: T.h + 0.32 });
  T.route.push({ mover: 0, x: 0, z: 0, until: [11.5, 5.95, 7.0], speed: 3, r: 0.25 });
  T.gap(3).move(6, 0).go(1).wp({ speed: 3 }).go(3).mark('cp').go(2).pocket(2, 2);
  T.wp({ until: [11.5, 0.1, 1.0], speed: 3 });
  const z2 = T.z - 2;
  T.add('movers', { path: [[T.x, T.h, z2], [T.x - 6, T.h, z2]], size: [3, 3], speed: 1.6, pause: 2, phase: 0 });
  T.route.push({ mover: 1, x: 0, z: 0, until: [11.5, 5.95, 7.0], speed: 3, r: 0.25 });
  T.gap(3).move(-6, 0).go(1).wp({ speed: 3 }).go(3).mark('star', -1);
  T.turn('W').go(5).mark('cp').wp({ until: [9, 0.1, 0.9], speed: 3 });
  // ploščica 3: hitrejša, sprednja-zadnja smer
  const x3 = T.x - 1.5;
  T.add('movers', { path: [[x3, T.h, T.z], [x3, T.h, T.z - 6]], size: [2, 3], speed: 2, pause: 1.5, phase: 0, _w: 1 });
  T.route.push({ mover: 2, x: 0, z: 0, until: [9, 4.6, 5.6], speed: 3, r: 0.3 });
  T.move(-2, -6).go(1).wp({ speed: 3 }).go(4).mark('star').go(1);
  T.turn('N').go(4, { up: 2 }).go(3).mark('star', 1).go(1).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

/* ------------------------------------------- SKLOP 2: Steklo, tovarna, stolp, led */

def({ id: '05-steklena-pot', name: 'Steklena pot', set: 2, theme: 'steklo', desc: 'Ozek most in padajoče ploščice: ne ustavljaj se!' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(3).go(8, { w: 1 }).mark('star', 0, 0).turn('E').go(3).turn('N').go(5).mark('cp');
  T.go(3, { w: 3 }).wp();
  T.go(8, { w: 1, ch: 'x', wp: { speed: 3.6 } });
  T.go(2, { w: 3 }).mark('clock').turn('W', { w: 3 }).go(2).go(7, { w: 1, ch: 'x' }).go(2, { w: 3 }).mark('cp');
  T.pocket(-2, 2);
  T.turn('N', { w: 3 }).go(3, { w: 1 }).turn('E').go(2).turn('N').go(2).turn('W').go(2).turn('N').go(2);
  T.turn('E').go(2).turn('N').go(3).mark('star').go(2, { w: 3 }).mark('cp');
  T.go(10, { w: 1, ch: 'x', wp: { speed: 3.6 } }).mark('star', 0, 0);
  T.go(2, { w: 3 }).turn('E', { w: 3 }).go(6, { w: 1 }).pocket(1, 2).turn('N').go(4).go(3, { w: 3 }).mark('goal').go(1);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '06-tovarna', name: 'Tovarna', set: 2, theme: 'tovarna', desc: 'Tekoči trakovi, kladiva na časovnik in vrata na stikalo.' }, () => {
  const T = new Track({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(3).go(8, { conv: 'F' }).mark('star', 1).go(2);
  T.turn('E').go(10, { conv: 'B', wp: { speed: 5.5 } }).go(2).mark('cp');
  T.turn('N').go(3).wp({ until: [3, 2.32, 2.6] });
  // kladiva
  for (let k = 0; k < 3; k++) {
    T.go(2);
    T.add('hammers', { x: T.c - 1, z: T.r, w: 3, d: 1, period: 3, phase: 0.15, dir: [k % 2 ? -1 : 1, 0] });
    T.go(1);
  }
  T.wp({ speed: 5 }).go(2).mark('clock').turn('W').go(4).mark('cp').go(1);
  // vrata in stikalo v stranskem žepu
  T.turn('N').go(1);
  const sw = { x: T.x + 4, z: T.z, id: 'a' };
  T.rect(T.c + 2, T.r, 3, 1, '.'); T.add('switches', sw); T.mark('star', 5, 0);
  T.wpAt(sw.x, sw.z, { stop: true, r: 0.3 }).wp({ stop: true, r: 0.4 });
  T.go(2); T.add('doors', { x: T.c - 1, z: T.r, w: 3, d: 1, y: T.h, h: 1.2, id: 'a' });
  T.go(4, { conv: 'B', wp: { speed: 6 } }).go(2, { up: 2 }).go(2).mark('cp');
  T.turn('E').go(1).wp({ until: [2.4, 2.25, 2.4] });
  for (let k = 0; k < 2; k++) {
    T.go(2);
    T.add('hammers', { x: T.c, z: T.r - 1, w: 1, d: 3, period: 2.4, phase: 0, dir: [0, k ? 1 : -1] });
    T.go(1);
  }
  T.go(2).mark('star', 1).turn('N').go(5, { conv: 'F' }).mark('star').go(2).mark('star', -1, 0).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '07-stolp', name: 'Stolp', set: 2, theme: 'stolp', desc: 'Spiralna pot navzgor, dvigala in ventilatorji.' }, () => {
  const T = new Track({ speed: 4.5 });
  const climb = (n, every = 4) => { for (let i = 1; i <= n; i++) T.go(1, i % every === 2 && i < n - 1 ? { up: 1 } : {}); };
  T.at(1, 18, 'N', 0).row(1, 18, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(1).mark('star', 1, 0);
  climb(16); T.mark('cp', 0, 0);
  T.turn('E').go(2);
  // ventilatorji pihajo proti notranjemu prepadu
  for (const fx of [5.5, 10.5, 14.5]) T.add('fans', { x: fx, z: -0.7, dir: [0, 1], len: 3.6, width: 1.6, force: 8 });
  climb(14); T.mark('star', -1, 0);
  T.turn('S').go(1).mark('cp'); climb(15); T.mark('clock');
  T.turn('W').go(1).mark('star', 1, 0); climb(11); T.mark('cp');
  T.turn('N').go(3).wp({ until: [7.2, 0.15, 1.1], speed: 2.5, r: 0.4 });
  const H0 = T.h;
  T.add('movers', { path: [[T.x, H0, T.z - 2], [T.x, H0 + 2, T.z - 2]], size: [3, 3], speed: 1, pause: 1.6, phase: 0 });
  T.route.push({ mover: 0, x: 0, z: 0, until: [7.2, 3.75, 5.0], speed: 2, r: 0.3 });
  T.gap(3, 2).go(1).wp({ speed: 3 }); climb(5); T.mark('cp');
  T.turn('E').go(1); climb(7);
  T.add('fans', { x: 9.5, z: 3.3, dir: [0, 1], len: 3.4, width: 1.6, force: 7 });
  T.turn('S').mark('star', 1, 0); climb(8); T.mark('cp');
  T.turn('W'); climb(4);
  T.turn('N').go(3).mark('star').mark('goal', 0, -1).go(1);
  return T;
});

def({ id: '08-ledena-dvorana', name: 'Ledena dvorana', set: 2, theme: 'led', desc: 'Led (malo trenja), lepilo (veliko trenja) in vzmeti.' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(2).go(10, { w: 5, ch: 'i' }).mark('star', 2).go(2, { w: 5 }).mark('cp');
  T.turn('E', { w: 5 }).go(5, { w: 3, ch: 'i' }).go(3, { ch: 'g' }).mark('clock').go(5, { ch: 'i' }).pocket(-2, 2);
  T.go(2).turn('N').go(3).mark('cp');
  // vzmet čez prepad
  T.go(1); T.add('springs', { x: T.x, z: T.z, dir: [0, -1], power: 8.5, up: 6.5 });
  T.wp({ speed: 3, r: 0.6 });
  T.gap(4).go(1, { w: 3 }).wp({ speed: 3, r: 0.6 }).go(2, { ch: 'g' }).go(6, { w: 3, ch: 'i' }).mark('star', 1, -3);
  T.go(2).turn('W').go(6, { w: 1, ch: 'i', wp: { speed: 3 } }).go(2, { w: 3 }).mark('cp');
  T.turn('N').go(2); T.add('springs', { x: T.x, z: T.z, dir: [0, -1], power: 9.5, up: 8 });
  T.wp({ speed: 3, r: 0.6 });
  T.gap(4, 1).go(2, { w: 5, ch: 'g' }).wp({ speed: 3, r: 0.8 }).mark('star', 2);
  T.go(7, { w: 5, ch: 'i' }).mark('star', -2, 0).go(3, { w: 3 }).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

/* ------------------------------------------------------ SKLOP 3: Nevarnosti */

def({ id: '09-nasilnezi', name: 'Nasilneži', set: 3, theme: 'arena', desc: 'Sovražna krogla te lovi in izriva čez rob. Magneti.' }, () => {
  const T = new Track({ speed: 5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(4).mark('clock').go(2);
  // arena 1: en nasilnež
  T.go(9, { w: 9 }); T.add('enemies', { t: 'bully', x: T.x + 2.5, z: T.z + 4, zone: 5.5 });
  T.mark('star', -4, -4);
  T.wp({ speed: 5.5 }, -2.5, 4);
  T.go(2, { w: 3 }).wp({ speed: 3, r: 0.3 }).mark('cp').go(3, { w: 1 }).go(2, { w: 3 });
  // magnet ob ozki poti
  T.turn('E').go(10, { w: 1 }); T.add('enemies', { t: 'magnet', x: T.x - 5, z: T.z - 2.5, mode: 'pull', period: 3, duty: 0.4, range: 3.5, force: 10 });
  T.add('enemies', { t: 'magnet', x: T.x - 2, z: T.z + 2.5, mode: 'pull', period: 3, duty: 0.4, phase: 0.5, range: 3.5, force: 10 });
  T.go(2, { w: 3 }).mark('cp').mark('star', 1);
  T.turn('N').go(3);
  // arena 2: dva nasilneža
  T.go(10, { w: 9 }); T.add('enemies', { t: 'bully', x: T.x - 2.5, z: T.z + 6, zone: 4.5 }).add('enemies', { t: 'bully', x: T.x + 2.5, z: T.z + 2, zone: 4.5 });
  T.mark('star', 4, -8); T.mark('star', -4, -1);
  T.wp({ speed: 5.5 }, 2.5, 6).wp({ speed: 5.5 }, -2.5, 2);
  T.go(2, { w: 3 }).wp({ speed: 4, r: 0.4 }).mark('cp').go(4, { up: 2 }).go(3, { w: 5 });
  T.add('enemies', { t: 'magnet', x: T.x, z: T.z - 3.5, mode: 'push', period: 2.5, duty: 0.5, range: 3, force: 12 });
  T.go(4, { w: 5 }).mark('star', 2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '10-neon', name: 'Neon', set: 3, theme: 'neon', desc: 'Vrtljive plošče, žage na tirnicah in ose po vzorcu.' }, () => {
  const T = new Track({ speed: 4.5 });
  T.at(0, 0, 'N').row(0, 0, 3, '.', 0); T.mark('start'); T.w = 3;
  T.go(4).wp();
  // vrtljiva plošča čez prepad
  T.add('spinners', { x: T.x, z: T.z - 3, r: 2.55, y: T.h, speed: 0.6 });
  T.gap(1).wpAt(T.x, T.z - 2, { speed: 3, r: 0.5 }).gap(4).go(2).mark('cp').wp({ speed: 3, r: 0.8 }).go(2);
  // žage
  T.go(10, { w: 5 });
  T.add('enemies', { t: 'saw', path: [[T.x - 2, T.z + 7], [T.x + 2, T.z + 7]], loop: false, speed: 2.6, phase: 0 });
  T.add('enemies', { t: 'saw', path: [[T.x + 2, T.z + 4], [T.x - 2, T.z + 4]], loop: false, speed: 2.6, phase: 0.25 });
  T.add('enemies', { t: 'saw', path: [[T.x - 2, T.z + 1], [T.x + 2, T.z + 1]], loop: false, speed: 2.6, phase: 0.5 });
  T.mark('star', 2, -9);
  T.wp({ speed: 3.5 }, 0, 8.5).wp({ until: [3.0769, 2.4, 2.9], speed: 3.5, r: 0.4 }, 0, 8.5).wp({ speed: 5 }, 0, -1);
  T.go(2, { w: 3 }).mark('cp').turn('W').go(3, { w: 3 });
  // ose letijo čez pot sem in tja
  T.wp({ until: [4, 3.3, 3.9], speed: 3, r: 0.4 });
  T.add('enemies', { t: 'wasp', path: [[T.x - 1.5, T.z - 1.6], [T.x - 1.5, T.z + 1.6]], loop: false, speed: 1.6 });
  T.go(3).mark('clock').pocket(-2, 2);
  T.wp({ until: [4, 1.3, 1.9], speed: 3, r: 0.4 });
  T.add('enemies', { t: 'wasp', path: [[T.x - 1.5, T.z - 1.6], [T.x - 1.5, T.z + 1.6]], loop: false, speed: 1.6 });
  T.go(3);
  T.go(2).mark('star', 1).turn('N').go(3).wp();
  T.add('spinners', { x: T.x, z: T.z - 3.5, r: 3.05, y: T.h, speed: -0.7 });
  T.gap(1).wpAt(T.x, T.z - 2.5, { speed: 3, r: 0.5 }).gap(5).go(2).mark('cp').wp({ speed: 3, r: 0.8 }).wp({ speed: 2.5, r: 0.2 });
  T.go(3, { w: 1 }).wp({ speed: 3, r: 0.3 }).go(8, { w: 3 }).mark('star', -1, -3);
  T.add('enemies', { t: 'saw', path: [[T.x, T.z + 6], [T.x, T.z + 1]], loop: false, speed: 2, phase: 0, r: 0.38 });
  T.wp({ speed: 4 }, 1, 6.5).wp({ speed: 4 }, 1, 1);
  T.go(3, { w: 5 }).mark('star', 2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '11-nebo', name: 'Nebo', set: 3, theme: 'nebo', desc: 'Vse skupaj: dolgi skoki z rampe čez prepad in sesalec.' }, () => {
  const T = new Track({ speed: 5 });
  T.at(0, 0, 'N', 3).row(0, 0, 3, '.', 3); T.mark('start'); T.w = 3;
  T.go(3).go(4, { down: 4 }).go(3).go(1, { up: 1, w: 3 });
  // skok čez prepad
  T.wp({ speed: 9 });
  T.gap(3, -1).go(1, { w: 5 }).wp({ speed: 9, r: 1.5 }).go(4).mark('cp').mark('star', 2);
  T.wp({ speed: 4, r: 0.8 });
  // sesalec ob ozki poti
  T.turn('E', { w: 5 }).go(9, { w: 1 }); T.add('enemies', { t: 'vacuum', x: T.x - 4.5, z: T.z + 2.6, dir: [0, -1], range: 4, angle: 45, force: 7 });
  T.go(2, { w: 3 }).mark('clock').turn('N').go(4, { ch: 'x' }).go(2).mark('cp');
  T.go(4, { up: 2 }).go(4, { conv: 'F' }).go(2).turn('W');
  T.go(3); T.add('hammers', { x: T.c, z: T.r - 1, w: 1, d: 3, period: 2.5, phase: 0, dir: [0, 1] });
  T.go(3).mark('star', -1).go(2, { down: 2 }).go(2);
  // drugi skok
  T.go(2, { up: 2 }).wp({ speed: 9 }).gap(2, -1.5).go(1, { w: 5 }).wp({ speed: 9, r: 1.5 }).go(3).mark('cp').wp({ speed: 4, r: 0.8 });
  T.turn('N', { w: 5 }).go(4, { w: 3 }); T.add('springs', { x: T.x, z: T.z, dir: [0, -1], power: 9, up: 7 });
  T.wp({ speed: 3, r: 0.6 }).gap(4, 0.5).go(3, { w: 5, ch: 'g' }).wp({ speed: 3, r: 0.8 }).mark('star', -2);
  T.go(5, { w: 3, ch: 'i' }).mark('star', 1, -2);
  T.go(3).mark('star', 0, 0).go(2).mark('goal').go(2);
  T.wp({}, 0, -1);
  return T;
});

def({ id: '12-nemogoce', name: 'Nemogoče', set: 3, theme: 'nemogoce', desc: 'Kratka, zelo težka proga z vsem. Za mojstre.' }, () => {
  const T = new Track({ speed: 4 });
  T.at(0, 0, 'N', 2).row(0, 0, 3, '.', 2); T.mark('start'); T.w = 3;
  T.go(2).go(6, { w: 1, ch: 'i', wp: { speed: 3.5 } }).go(1, { w: 3 }).mark('cp');
  T.go(4).go(2, { up: 2 }).wp({ speed: 9 }).gap(2, -1).go(1, { w: 3, ch: 'x' }).wp({ speed: 9, r: 1.2 }).go(2, { ch: 'x' }).wp({ speed: 3.5, r: 0.6 });
  T.turn('E').go(8, { w: 1, ch: 'x' }); T.add('enemies', { t: 'magnet', x: T.x - 4, z: T.z + 2.2, mode: 'pull', period: 2, duty: 0.4, range: 3, force: 6 });
  T.go(2, { w: 3 }).mark('cp').mark('star', 1).mark('clock', -1);
  T.turn('N').go(1);
  T.go(7, { w: 7 }); T.add('enemies', { t: 'bully', x: T.x - 1.5, z: T.z + 3, zone: 3.2, accel: 5.5 });
  T.add('enemies', { t: 'saw', path: [[T.x - 2, T.z + 5], [T.x + 2, T.z + 5]], loop: false, speed: 3, phase: 0 });
  T.mark('star', -2, -5); T.wp({ speed: 5 }, 1.5, 4).wp({ until: [2.667, 2.0, 2.4], speed: 4, r: 0.5 }, 1.5, 3.5).wp({ speed: 5 }, 1, 0);
  T.go(2, { w: 3 }).mark('cp');
  T.add('spinners', { x: T.x, z: T.z - 3, r: 2.55, y: T.h, speed: 0.9 });
  T.wp({ speed: 3 }).gap(1).wpAt(T.x, T.z - 2, { speed: 3, r: 0.5 }).gap(4).go(1).wp({ speed: 3, r: 0.6 }).mark('star', 1);
  T.turn('W').go(6, { w: 1, ch: 'g' }); T.add('enemies', { t: 'vacuum', x: T.x + 3, z: T.z - 2.4, dir: [0, 1], range: 3.5, angle: 45, force: 6 });
  T.go(1, { w: 3 }).mark('star', 0, 0).turn('N').go(5, { w: 1, ch: 'i' }).mark('star', 0, -1).go(2, { w: 3 }).mark('goal').go(1);
  T.wp({}, 0, 0);
  return T;
});

/* ===================================================================== */
/*  Zapis                                                                */
/* ===================================================================== */

const r1 = x => Math.round(x * 10) / 10;
const DUMP = (process.argv.find(a => a.startsWith('--dump=')) || '').slice(7);

/** Izpis proge z višinami, potjo autopilota (številke) in mesti padcev (X). */
function dump(L, res) {
  const g = L.map.map(r => [...r]);
  L.route.forEach((w, i) => { if (w.mover == null) { const c = Math.floor(w.x), r = Math.floor(w.z); if (g[r]?.[c] != null) g[r][c] = String.fromCharCode(i < 10 ? 48 + i : 55 + i); } });
  for (const f of res.trace || []) { const c = Math.floor(f.x), r = Math.floor(f.z); if (g[r]?.[c] != null) g[r][c] = 'X'; }
  g.forEach((row, r) => console.log(String(r).padStart(3) + ' ' + row.join('') + '   ' + (L.hmap ? L.hmap[r] : '')));
  if (res.trace?.[0]?.hist) console.log(res.trace[0].hist.join('\n'));
  for (const f of (res.trace || []).slice(0, 8)) console.log(`  padec t=${f.t.toFixed(1)} pri ${f.x.toFixed(2)}, ${f.z.toFixed(2)} (točka poti ${f.k})`);
}

async function main() {
  const out = [];
  let bad = 0;
  for (const { meta, fn } of LEVELS) {
    if ((ONLY || DUMP) && !meta.id.startsWith(ONLY || DUMP)) continue;
    const T = fn();
    if (!T.route.length || T.route[T.route.length - 1].x !== undefined) T.route.push({ x: T.marks.goal[0], z: T.marks.goal[1], speed: T.speed });
    const L = finish(T, meta);
    const res = runAutopilot(L, { trace: DUMP && meta.id.startsWith(DUMP) });
    if (DUMP && meta.id.startsWith(DUMP)) dump(L, res);
    const A = res.time;
    if (!res.finished) { const b = res.world.ball; console.log(`✘ ${L.id}: autopilot ne pride do cilja (padci ${res.falls}, krogla ${b.x.toFixed(1)}, ${b.z.toFixed(1)})`); bad++; }
    const a = A || 60;
    L.medals = meta.medals || { gold: Math.ceil(a * 0.97), silver: Math.ceil(a * 1.28), bronze: Math.ceil(a * 1.65) };
    L.timeBonus = meta.timeBonus || Math.ceil(a * 1.25 + 6);
    L.dev = { time: A != null ? r1(A) : null, falls: res.falls };
    const errs = validateLevel(L);
    if (errs.length) { console.log('✘ ' + errs.join('\n✘ ')); bad++; }
    console.log(`${L.id.padEnd(18)} ${String(L.size).padEnd(7)} autopilot ${A != null ? r1(A) + ' s' : '—'}  padci ${res.falls}  zvezdice ${res.stars}/5  · zlato ${L.medals.gold} srebro ${L.medals.silver} bron ${L.medals.bronze} · čas ${L.timeBonus} s`);
    out.push(L);
  }
  if (CHECK || ONLY || DUMP) { process.exit(bad ? 1 : 0); }
  await mkdir(OUT, { recursive: true });
  for (const L of out) await writeFile(new URL(L.id + '.json', OUT), JSON.stringify(L, null, 1).replace(/\n\s+(?=[\d\-\]])/g, ' ') + '\n');
  await writeFile(new URL('index.json', OUT), JSON.stringify({ levels: out.map(L => L.id + '.json') }, null, 2) + '\n');
  const sqlUrl = new URL('supabase/games/krogla.sql', ROOT);
  try {
    let sql = await readFile(sqlUrl, 'utf8');
    const rows = out.map(L => `  ('${L.id}', ${Math.round(L.medals.gold * 1000)})`).join(',\n');
    const block = `-- BEGIN LEVELS (tools/krogla-levels.mjs)\ninsert into public.krogla_levels (level, gold_ms) values\n${rows}\non conflict (level) do update set gold_ms = excluded.gold_ms;\n-- END LEVELS`;
    sql = sql.replace(/-- BEGIN LEVELS[\s\S]*?-- END LEVELS/, block);
    await writeFile(sqlUrl, sql);
  } catch { console.log('(supabase/games/krogla.sql še ne obstaja — blok zlatih časov ni zapisan)'); }
  console.log(`\nZapisanih ${out.length} prog.` + (bad ? ` NAPAKE: ${bad}` : ''));
  process.exit(bad ? 1 : 0);
}

await main();
