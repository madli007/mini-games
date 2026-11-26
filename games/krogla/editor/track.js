/* =====================================================================
   HRČKOVA KROGLA — editor/track.js: »želvica« za gradnjo prog (brez DOM-a in Node odvisnosti).
   Uporabljata jo generator uradnih prog (tools/krogla-levels.mjs) in generator naključnih prog
   (editor/generate.js). Želvica sproti zapiše tudi pot za autopilota (route).
   ===================================================================== */
import { heightChar } from '../level.js';
import { THEMES } from '../themes.js';

/* ===================================================================== */
/*  Želvica                                                              */
/* ===================================================================== */

export const D4 = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
export const RAMP_UP = { N: '^', S: 'v', E: '>', W: '<' };
export const RAMP_DOWN = { N: 'v', S: '^', E: '<', W: '>' };
export const CONV = { N: 'N', S: 'S', E: 'E', W: 'W' };
export const BACK = { N: 'S', S: 'N', E: 'W', W: 'E' };

export class Track {
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
export function finish(T, meta) {
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
