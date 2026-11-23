/* =====================================================================
   Generator prog za Dirko frnikol (brez npm odvisnosti), po vzoru tools/krogla-levels.mjs.
     node tools/frnikole-tracks.mjs            → zapiše games/frnikole/tracks/*.json in index.json
                                                  ter izpiše preverjanje (tihe simulacije)
     node tools/frnikole-tracks.mjs --check    → samo preverjanje (nič ne zapiše)
     node tools/frnikole-tracks.mjs --dump=2   → izriše progo 2 v ASCII (map + pot)
     node tools/frnikole-tracks.mjs --sims=80  → število simulacij na progo (privzeto 80; polovica z nevtralno formo)

   Proge opišemo z »želvico« (Track) v lokalnem okviru (naprej / desno): ravnina, klančine navzdol,
   zavoji, stopnice (padec), skoki, lijaki (ožanje), razcepi (dve poti), vrtljive plošče, odbijači,
   led, tekoči trakovi, vzmeti. Želvica sproti zapiše sredinsko črto (path), širine in kontrolne točke.
   Preverjanje: (a) vse frnikole brez sunkov pridejo do cilja, (b) noben startni/barvni slot ne zmaga
   v več kot ~35 % simulacij, (c) zmagovalni čas je v ciljnem razponu proge (target).
   ===================================================================== */
import { writeFile, mkdir } from 'node:fs/promises';
import { heightChar } from '../games/krogla/level.js';
import { THEMES } from '../games/krogla/themes.js';
import { validateTrack, trackLength } from '../games/frnikole/track.js';
import { createRace, runRace } from '../games/frnikole/race.js';
import { rng } from '../shared/util.js';

const ROOT = new URL('../', import.meta.url);
const OUT = new URL('games/frnikole/tracks/', ROOT);
const CHECK = process.argv.includes('--check');
const DUMP = (process.argv.find(a => a.startsWith('--dump=')) || '').slice(7);
const SIMS = +((process.argv.find(a => a.startsWith('--sims=')) || '').slice(7) || 80);

/* ===================================================================== */
/*  Želvica                                                              */
/* ===================================================================== */

const D4 = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const RAMP_UP = { N: '^', S: 'v', E: '>', W: '<' };
const RAMP_DOWN = { N: 'v', S: '^', E: '<', W: '>' };

class Track {
  constructor({ w = 5, rail = true } = {}) {
    this.tiles = new Map();
    this.c = 0; this.r = 0; this.dir = 'E'; this.h = 0; this.w = w; this.rail = rail;
    this.path = []; this.widths = []; this.cps = []; this.splits = []; this.grid = [];
    this.finish = -1; this.obj = {};
  }
  get dc() { return D4[this.dir][0]; }
  get dr() { return D4[this.dir][1]; }
  /** Lokalno (naprej f, desno s) → ploščica. */
  loc(f, s) { return [this.c + this.dc * f - this.dr * s, this.r + this.dr * f + this.dc * s]; }
  /** Lokalno → svetovna točka (središče ploščice; s je lahko decimalen). */
  wpt(f, s) { return [this.c + 0.5 + this.dc * f - this.dr * s, this.r + 0.5 + this.dr * f + this.dc * s]; }
  key(c, r) { return c + ',' + r; }
  /** Tla povozijo zid, zid se postavi le na prazno. */
  set(c, r, ch, h = this.h) {
    const k = this.key(c, r), old = this.tiles.get(k);
    if (ch === '#' && old) return this;
    this.tiles.set(k, { c, r, ch, h });
    return this;
  }
  clear(c, r) { this.tiles.delete(this.key(c, r)); return this; }
  bounds(w) { const lo = -Math.floor((w - 1) / 2); return [lo, lo + w - 1]; }
  /** Vrstica na trenutnem mestu: lateralno [a, b], z zidovoma ob strani. */
  row(a, b, ch, h, rail) {
    for (let s = a; s <= b; s++) { const [c, r] = this.loc(0, s); this.set(c, r, typeof ch === 'function' ? ch(s) : ch, h); }
    if (rail) for (const s of [a - 1, b + 1]) { const [c, r] = this.loc(0, s); this.set(c, r, '#', h); }
  }
  pt(lat = 0, w = this.w) { this.path.push(this.wpt(0, lat)); this.widths.push(w); return this; }
  at(c, r, dir, h = 0) { this.c = c; this.r = r; this.dir = dir; this.h = h; return this; }
  /** Naprej n ploščic. o: { w, down (koliko prvih je klančin navzdol), ch, rail, cpAt } */
  go(n, o = {}) {
    const w = this.w = o.w ?? this.w;
    const rail = o.rail ?? this.rail;
    const [a, b] = this.bounds(w);
    for (let i = 1; i <= n; i++) {
      this.c += this.dc; this.r += this.dr;
      let ch = o.ch || '.', h = this.h;
      if (o.down && i <= o.down) { ch = RAMP_DOWN[this.dir]; this.h -= 0.5; h = this.h; }
      this.row(a, b, ch, h, rail);
      this.pt((a + b) / 2, w);
      if (o.cp && i === o.cp) this.cp();
    }
    return this;
  }
  /** Lijak: širina se linearno spremeni iz w0 v w1 (ozko mesto, gneča). */
  funnel(n, w0, w1, o = {}) {
    for (let i = 1; i <= n; i++) {
      const w = Math.round(w0 + (w1 - w0) * (i / n));
      this.go(1, { ...o, w, down: o.down && i <= o.down ? 1 : 0 });
    }
    return this;
  }
  /** Zavoj: zapolni kvadrat okoli trenutnega mesta, zid na zunanji strani. */
  turn(dir, o = {}) {
    const w = o.w ?? this.w, rail = o.rail ?? this.rail;
    const [a, b] = this.bounds(w);
    for (let f = a; f <= b; f++) for (let s = a; s <= b; s++) { const [c, r] = this.loc(f, s); this.set(c, r, '.', this.h); }
    if (rail) for (let f = a - 1; f <= b + 1; f++) for (let s = a - 1; s <= b + 1; s++) {
      if (f >= a && f <= b && s >= a && s <= b) continue;
      const [c, r] = this.loc(f, s); this.set(c, r, '#', this.h);
    }
    this.dir = dir;
    // zid na zunanji strani zavoja (v novi smeri nazaj) ostane, vstop v novo smer se odpre z go()
    return this;
  }
  /** Stopnica: naslednja vrstica je nižja za dh (frnikola pade in pristane). */
  drop(dh) { this.h -= dh; return this; }
  /** Skok: klančina gor, prepad gap ploščic, pristanek dh nižje od vrha klančine. */
  jump(gap, dh, o = {}) {
    const w = this.w = o.w ?? this.w;
    const [a, b] = this.bounds(w);
    this.c += this.dc; this.r += this.dr;
    this.row(a, b, RAMP_UP[this.dir], this.h, o.rail ?? this.rail);
    this.h += 0.5; this.pt((a + b) / 2, w);
    for (let i = 0; i < gap; i++) { this.c += this.dc; this.r += this.dr; this.pt((a + b) / 2, w); }
    this.h -= dh;
    return this;
  }
  /**
   * Razcep: glavna pot naravnost (ožja, brez ograje, tvegana), stranska pot zavije vstran (daljša, z ograjo).
   * o: { len, side (+1 desno / −1 levo), out (odmik stranske poti), wMain, wAlt, mainCh(f, s), bump, bias, name, onMain(T, f) }
   */
  split(o) {
    const { len, side = 1, out = 4, wMain = 1, wAlt = 3, bump = 1, bias = 0.5, name = '' } = o;
    const W0 = this.w;
    const [mA, mB] = this.bounds(wMain);
    const altC = side * out;
    const [x0, x1] = this.bounds(wAlt);
    const bumpAt = f => (f < 2 || f > len - 3 ? 0 : f < 3 || f > len - 4 ? Math.min(1, bump) : bump);
    const from = this.path.length - 1;
    const alt = [];
    const uni = (extra = 0) => [Math.min(mA, altC + x0 + (side < 0 ? -extra : 0)), Math.max(mB, altC + x1 + (side > 0 ? extra : 0))];
    // pred razcepom se frnikole zberejo proti sredini (ožja ciljna širina)
    for (let k = Math.max(0, from - 2); k <= from; k++) this.widths[k] = Math.min(this.widths[k], 1.6);
    // razširitev (3 vrstice)
    for (let i = 0; i < 3; i++) {
      this.c += this.dc; this.r += this.dr;
      const [a, b] = uni();
      this.row(Math.min(a, this.bounds(W0)[0]), Math.max(b, this.bounds(W0)[1]), '.', this.h, true);
      this.pt(0, wMain);
      alt.push(this.wpt(0, altC * (i + 1) / 3));
    }
    // ločeni poti
    for (let f = 0; f < len; f++) {
      this.c += this.dc; this.r += this.dr;
      const h = this.h;
      for (let s = mA; s <= mB; s++) { const ch = o.mainCh ? o.mainCh(f, s) : '.'; const [c, r] = this.loc(0, s); if (ch) this.set(c, r, ch, h); }
      const off = altC + side * bumpAt(f);
      for (let s = off + x0; s <= off + x1; s++) { const [c, r] = this.loc(0, s); this.set(c, r, o.altCh || '.', h); }
      // notranji zid stranske poti šele od 2. vrstice (vstop brez čelnega zidu)
      for (const s of [off + x0 - 1, off + x1 + 1]) { const inner = side > 0 ? s === off + x0 - 1 : s === off + x1 + 1; if (inner && (f === 0 || f === len - 1)) continue; const [c, r] = this.loc(0, s); this.set(c, r, '#', h); }
      // vmesni del med potema pri večjem odmiku: zid ob stranski poti (ne ob glavni)
      if (o.onMain) o.onMain(this, f);
      this.pt(0, wMain);
      alt.push(this.wpt(0, off + (x0 + x1) / 2));
    }
    // združitev (2 vrstici)
    for (let i = 0; i < 2; i++) {
      this.c += this.dc; this.r += this.dr;
      const [a, b] = uni();
      this.row(Math.min(a, this.bounds(W0)[0]), Math.max(b, this.bounds(W0)[1]), '.', this.h, true);
      this.pt(0, wMain);
      alt.push(this.wpt(0, i === 0 ? altC : altC * 0.45));
    }
    // ena navadna vrstica za konec razcepa
    this.w = W0;
    this.go(1, { w: W0 });
    const to = this.path.length - 1;
    // točke glavne poti med from in to: širina glavne poti (alt ima svojo)
    this.splits.push({ from, to, alt, w: wAlt, bias, name });
    return this;
  }
  /** Kontrolna točka na trenutnem mestu (zadnja točka poti). */
  cp() { this.cps.push(this.path.length - 1); return this; }
  /** Ciljna črta na trenutnem mestu. */
  goal() { this.finish = this.path.length - 1; return this; }
  /** Startna mesta: 2 vrsti po 4 na zadnjih dveh vrsticah. */
  startGrid() {
    const n = this.path.length;
    for (const k of [n - 1, n - 2]) {
      const [px, pz] = this.path[k];
      for (const s of [-1.5, -0.5, 0.5, 1.5]) this.grid.push([px - this.dr * s * 0.9, pz + this.dc * s * 0.9]);
    }
    return this;
  }
  /** Zid čez celo širino za trenutno vrstico (konec iztoka, hrbet starta). */
  wall(f = 1) { const [a, b] = this.bounds(this.w); for (let s = a - 1; s <= b + 1; s++) { const [c, r] = this.loc(f, s); this.set(c, r, '#', this.h); } return this; }
  /** Objekt v lokalnih koordinatah (naprej f, desno s) — x, z se izračunata. */
  addL(kind, f, s, o) { const [x, z] = this.wpt(f, s); (this.obj[kind] ||= []).push({ x, z, ...o }); return this; }
  /** Ploščice v lokalnem pravokotniku (f0..f1, s0..s1) zamenjaj z znakom ch (npr. led, trak). */
  paint(f0, f1, s0, s1, ch) {
    for (let f = f0; f <= f1; f++) for (let s = s0; s <= s1; s++) {
      const [c, r] = this.loc(f, s); const t = this.tiles.get(this.key(c, r));
      if (t && t.ch !== '#') t.ch = typeof ch === 'function' ? ch(f, s, t) : ch;
    }
    return this;
  }
  /** Smer (dx, dz) v lokalnem okviru (naprej, desno). */
  ldir(f, s) { return [this.dc * f - this.dr * s, this.dr * f + this.dc * s]; }
}

/** Želvica → JSON proge (obreže, premakne koordinate, višine ≥ 0). */
function build(T, meta) {
  const ts = [...T.tiles.values()];
  const c0 = Math.min(...ts.map(t => t.c)) - 1, r0 = Math.min(...ts.map(t => t.r)) - 1;
  const c1 = Math.max(...ts.map(t => t.c)) + 1, r1 = Math.max(...ts.map(t => t.r)) + 1;
  const W = c1 - c0 + 1, D = r1 - r0 + 1;
  const minH = Math.min(...ts.map(t => t.h));
  const base = -minH;
  const map = Array.from({ length: D }, () => Array(W).fill(' '));
  const hm = Array.from({ length: D }, () => Array(W).fill('0'));
  for (const t of ts) { map[t.r - r0][t.c - c0] = t.ch; hm[t.r - r0][t.c - c0] = heightChar(t.h + base); }
  const sx = -c0, sz = -r0;
  const P = p => [+(p[0] + sx).toFixed(3), +(p[1] + sz).toFixed(3)];
  const shift = o => { const n = { ...o }; n.x = +(n.x + sx).toFixed(3); n.z = +(n.z + sz).toFixed(3); if (typeof n.y === 'number') n.y += base; return n; };
  const L = {
    id: meta.id, name: meta.name, desc: meta.desc, look: meta.look, kind: meta.kind,
    theme: { ...THEMES[meta.theme], ...(meta.themeOver || {}) },
    target: meta.target,
    size: [W, D],
    map: map.map(r => r.join('')),
    hmap: hm.map(r => r.join('')),
    path: T.path.map(P), widths: T.widths, finish: T.finish, cps: [0, ...T.cps.filter(i => i > 0)],
    splits: T.splits.map(s => ({ ...s, alt: s.alt.map(P) })),
    grid: T.grid.map(P),
  };
  for (const [k, list] of Object.entries(T.obj)) L[k] = list.map(shift);
  if (meta.camYaw) L.camYaw = meta.camYaw;
  return L;
}

/* ===================================================================== */
/*  PROGE                                                                */
/* ===================================================================== */

const TRACKS = [];
const def = (meta, fn) => TRACKS.push({ meta, fn });

/* 1 — Kamnolom: široke serpentine, odbijači, stopnice, skok, razcep, lijak */
def({ id: '01-kamnolom', name: 'Kamnolom', look: 'garden', theme: 'vrt', kind: 'serpentine', target: [20, 40],
  themeOver: { floor: '#cdbf9f', side: '#7a6a52', edge: '#fff1c8', wall: '#9a8a6a', accent: '#ffd23f' },
  desc: 'Široke serpentine po stenah kamnoloma: odbijači, stopnice, skok in razcep pred ciljem.' }, () => {
  const T = new Track({ w: 5 });
  T.at(-1, 0, 'E').wall(0).go(3).startGrid().cp();
  T.go(10, { down: 6 }).addL('bumpers', -4, -1, { r: 0.35, power: 5 }).addL('bumpers', -2, 1, { r: 0.35, power: 5 });
  T.go(2).turn('S').go(6, { down: 2 }).cp().go(1).turn('W');
  T.go(4).cp().go(10, { down: 4 }).addL('bumpers', -6, 0, { r: 0.4, power: 5 });
  T.drop(1).go(3).cp().go(1).turn('S').go(6, { down: 2 }).go(1).turn('E');
  T.go(3).cp().funnel(6, 5, 3).go(3, { down: 2 }).jump(1, 1).go(4, { w: 5 }).cp();
  T.go(4, { down: 2 }).go(1).turn('S').go(6, { down: 2 }).go(1).turn('W');
  T.go(3).cp().split({ len: 8, side: -1, out: 4, wMain: 1, wAlt: 3, bump: 1, bias: 0.55, name: 'ozka polica' });
  T.go(3).cp().go(6, { down: 3 }).go(2).goal().go(5).wall(1);
  return T;
});

/* 2 — Kuhinja: žlica (vzmet) čez prepad na razcepu, sklede, vrtljiva plošča, led */
def({ id: '02-kuhinja', name: 'Kuhinja', look: 'kitchen', theme: 'kuhinja', kind: 'tehnična', target: [20, 40],
  desc: 'Po pultu navzdol: žlica-skakalnica nad lijakom, vrtljiva plošča, sklede in polit sirup.' }, () => {
  const T = new Track({ w: 5 });
  T.at(0, -1, 'S').wall(0).go(3).startGrid().cp();
  T.go(8, { down: 5 });
  T.go(5, { w: 7 }).cp();
  const spinF = -2;
  T.addL('spinners', spinF, 0, { r: 1.7, y: T.h + 0.02, speed: 1.1 });
  T.go(3, { w: 5 }).go(1).turn('E').go(3).cp();
  T.split({ len: 7, side: 1, out: 4, wMain: 1, wAlt: 3, bump: 1, bias: 0.5, name: 'žlica',
    mainCh: (f) => (f === 2 || f === 3 ? null : '.'),
    onMain: (t, f) => { if (f === 1) { const [dx, dz] = t.ldir(1, 0); t.addL('springs', 0, 0, { dir: [dx, dz], power: 6.5, up: 5.5 }); } } });
  T.go(3).cp().go(6, { down: 3 }).go(1).turn('N', { w: 5 });
  T.go(6, { w: 7, down: 2 }).cp();
  T.addL('bowls', -3, 0, { r: 2.4, depth: 0.55 });
  T.go(2, { w: 5 }).go(1).turn('E').go(5, { down: 3 }).cp();
  T.go(6, { ch: 'g' });
  T.go(1).cp().funnel(5, 5, 3, { down: 3 }).go(3, { w: 3 }).cp().go(1).turn('S', { w: 3 }).go(3, { w: 5 }).go(5, { down: 3 }).goal().go(5).wall(1);
  T.paint(-9, -4, -1, 1, 'i');
  return T;
});

/* 3 — Alu valjarna: tekoči trakovi, žlebovi iz profilov, stopnice, ozki prehodi */
def({ id: '03-valjarna', name: 'Alu valjarna', look: 'factory', theme: 'tovarna', kind: 'hitra', target: [20, 40],
  themeOver: { floor: '#c8ccd4', side: '#5a6070', edge: '#ffd23f', wall: '#8a92a8' },
  desc: 'Tekoči trakovi, žlebovi iz aluminijastih profilov in stopnice valjarne. Kdor zgreši trak, izgubi.' }, () => {
  const T = new Track({ w: 5 });
  T.at(-1, 0, 'E').wall(0).go(3).startGrid().cp();
  T.go(10, { down: 5 });
  T.go(6, { ch: 'E', w: 3 }).cp();
  T.go(2, { w: 5 }).turn('S').go(4, { down: 2 }).drop(1).go(4).cp().go(4).turn('W');
  T.go(3).cp().split({ len: 9, side: 1, out: 4, wMain: 1, wAlt: 3, bump: 2, bias: 0.5, name: 'žleb', mainCh: () => 'W' });
  T.go(3).cp().go(6, { down: 3 }).go(1).turn('S').go(5, { w: 3, down: 2 }).go(1, { w: 5 }).turn('E');
  T.go(2).cp().go(6, { w: 5, ch: '.' }).paint(-5, 0, -2, -1, 'S').paint(-5, 0, 1, 2, 'N');
  T.go(5, { down: 3 }).cp().go(3).drop(1.5).go(4).cp();
  T.go(1).turn('S').go(4, { down: 2 }).go(1).turn('W').go(4, { ch: 'W', w: 3 }).cp().go(4, { w: 5, down: 2 }).go(2).goal().go(5).wall(1);
  return T;
});

/* ===================================================================== */
/*  Preverjanje                                                          */
/* ===================================================================== */

const FORMS = ['speed', 'grip', 'mass'];
function marblesFor(r, neutral) {
  return Array.from({ length: 8 }, (_, i) => ({ id: 'm' + i, form: neutral ? {} : Object.fromEntries(FORMS.map(k => [k, r.range(-1, 1)])) }));
}

function verify(L, sims) {
  const wins = Array(8).fill(0), gridWins = Array(8).fill(0);
  let unfinished = 0, falls = 0, tMin = Infinity, tMax = 0, tSum = 0, lastMax = 0;
  const r = rng('verify:' + L.id);
  const t0 = Date.now();
  for (let k = 0; k < sims * 2; k++) {
    const neutral = k % 2 === 0;
    const R = createRace({ track: L, marbles: marblesFor(r, neutral), seed: 'v' + k });
    const slotOf = i => R.M[i].b && R.grid0?.[i];
    void slotOf;
    // startni slot = najbližje startno mesto ob startu
    const start = R.M.map(m => { let best = 0, bd = 1e9; L.grid.forEach((g, j) => { const d = (g[0] - m.b.x) ** 2 + (g[1] - m.b.z) ** 2; if (d < bd) { bd = d; best = j; } }); return best; });
    runRace(R);
    const w = R.order[0];
    if (neutral) wins[w]++;
    gridWins[start[w]]++;
    unfinished += R.M.filter(m => !m.finished).length;
    falls += R.M.reduce((s, m) => s + m.falls, 0);
    const t = R.M[w].finishT ?? 999;
    tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); tSum += t;
    lastMax = Math.max(lastMax, ...R.M.map(m => m.finishT ?? 999));
  }
  const ms = (Date.now() - t0) / sims / 2;
  const maxWin = Math.max(...wins) / sims, maxGrid = Math.max(...gridWins) / sims / 2;
  const avg = tSum / sims / 2;
  const okA = unfinished === 0, okB = maxWin <= 0.35 && maxGrid <= 0.35, okC = avg >= L.target[0] && avg <= L.target[1];
  return { okA, okB, okC, unfinished, falls: falls / sims, maxWin, maxGrid, wins, gridWins, tMin, tMax, avg, lastMax, ms };
}

function dump(L) {
  const P = new Map(L.path.map((p, i) => [Math.floor(p[0]) + ',' + Math.floor(p[1]), i === L.finish ? 'F' : L.cps.includes(i) ? 'C' : '*']));
  for (const s of L.splits || []) for (const p of s.alt) P.set(Math.floor(p[0]) + ',' + Math.floor(p[1]), '+');
  L.map.forEach((row, r) => console.log([...row].map((ch, c) => P.get(c + ',' + r) || ch).join('') + '  ' + L.hmap[r]));
}

const out = [];
for (const { meta, fn } of TRACKS) {
  const L = build(fn(), meta);
  const errs = validateTrack(L);
  if (errs.length) { console.error(errs.join('\n')); process.exitCode = 1; }
  out.push(L);
}

if (DUMP) { dump(out[+DUMP - 1]); process.exit(0); }

const report = [];
for (const L of out) {
  const v = verify(L, SIMS);
  const line = `${L.id}: ${trackLength(L).toFixed(0)} m, ${L.size.join('×')}, zmagovalec ${v.avg.toFixed(1)} s (${v.tMin.toFixed(1)}–${v.tMax.toFixed(1)}), zadnji ≤ ${v.lastMax.toFixed(1)} s, `
    + `padcev ${v.falls.toFixed(1)}/dirko · (a) vsi v cilju: ${v.okA ? 'da' : 'NE (' + v.unfinished + ')'} · `
    + `(b) največ zmag slota: ${(v.maxWin * 100).toFixed(0)} % (barva), ${(v.maxGrid * 100).toFixed(0)} % (start) ${v.okB ? '✓' : '✗'} · `
    + `(c) ${L.target.join('–')} s ${v.okC ? '✓' : '✗'} · ${v.ms.toFixed(0)} ms/sim`;
  console.log(line);
  report.push({ id: L.id, ...v, line });
  if (process.argv.includes('-v')) console.log('   zmage po barvi', v.wins.join(' '), '· po startu', v.gridWins.join(' '));
  if (!v.okA || !v.okB || !v.okC) process.exitCode = 1;
}

if (!CHECK) {
  await mkdir(OUT, { recursive: true });
  const files = [];
  for (const L of out) {
    const f = L.id + '.json';
    await writeFile(new URL(f, OUT), JSON.stringify(L, null, 1).replace(/\n\s+(?=[\d\-\]])/g, ' ') + '\n');
    files.push(f);
  }
  await writeFile(new URL('index.json', OUT), JSON.stringify({ tracks: files }, null, 1) + '\n');
  console.log(`zapisano: ${files.join(', ')} (${SIMS} simulacij na progo)`);
}
