/* =====================================================================
   MIZA KOT PODATEK — gradniki, ki jih uporablja tables/<id>/table.js
   Logične koordinate 600 × 1000, y navzdol. Plasti: 0 = igralna površina,
   1, 2 … = rampe; segment z layer -1 velja za vse plasti.

   createTable() vrne prazno mizo T z metodami za dodajanje elementov.
   Fizika (engine/physics.js), jedro (engine/game.js) in izris
   (engine/render/*) vse preberejo iz T — nič ne uvažajo iz mize.
   Vrstni red dodajanja segmentov in senzorjev vpliva na fiziko (vrstni red trkov).
   ===================================================================== */
import { BR } from './config.js';

const INF = Infinity;

export function createTable(opts = {}) {
  const T = {
    id: opts.id || 'miza',
    segs: [], bumpers: [], sensors: [], slings: [], drops: [], banks: [], standups: [], lamps: [], flippers: [],
    ramps: [], saucers: [], spinners: [], laneGroups: [], locks: [], posts: [], diverters: [], captives: [],
    magnets: [], toys: [], shots: [], points: {}, plunger: null, launch: null, heat: null,
    // zunanji rob: pravokotnik z lokom zgoraj (x1..x2, lok s središčem cx,cy in polmerom r)
    outline: Object.assign({ x1: 20, x2: 580, cx: 300, cy: 300, r: 280 }, opts.outline || {}),
  };

  /* ---------- segment (kapsula) ---------- */
  T.seg = (ax, ay, bx, by, o = {}) => {
    const s = {
      ax, ay, bx, by,
      r: o.r ?? 2, e: o.e ?? 0.4, kind: o.kind || 'wall', layer: o.layer ?? 0,
      active: o.active ?? true, flash: 0, cool: 0, data: o.data || null, oneWay: !!o.oneWay,
      nx: 0, ny: 0, look: o.look || 'rail', draw: o.draw ?? true, id: o.id || '',
      rubber: o.rubber ?? (o.look === 'rubber' || o.look === 'rubberPost' || o.kind === 'sling'),
      color: o.color || null,
    };
    if (s.oneWay) {            // trdna stran je na strani normale (dy, -dx)
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      s.nx = dy / l; s.ny = -dx / l;
    }
    bbox(s);
    T.segs.push(s);
    return s;
  };
  T.poly = (pts, o) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(T.seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], o));
    return out;
  };

  /* ---------- senzor (krog; ob vstopu žogice sproži stikalo) ---------- */
  T.sensor = (kind, x, y, r, o = {}) => {
    const s = { kind, name: o.name || kind, x, y, r, layer: o.layer ?? 0, idx: o.idx ?? 0, inside: new Set(), ref: o.ref || null };
    T.sensors.push(s);
    return s;
  };

  /* ---------- luč (insert) ---------- */
  T.lamp = (id, x, y, o = {}) => {
    const l = { id, x, y, r: o.r ?? 10, shape: o.shape || 'circle', color: o.color || '#6fd3ff',
      label: o.label || '', angle: o.angle || 0, onRamp: !!o.onRamp, group: o.group || '', size: o.size || 1, layer: o.layer || (o.onRamp ? 1 : 0) };
    T.lamps.push(l);
    return l;
  };

  /* ---------- pop bumper ---------- */
  T.bumper = (x, y, o = {}) => {
    const c = { x, y, r: o.r ?? 26, flash: 0, cool: 0, pop: 0, i: T.bumpers.length,
      label: o.label ?? 'Al', sub: o.sub ?? '13', color: o.color || null, name: o.name || '' };
    T.bumpers.push(c);
    return c;
  };

  /* ---------- slingshot: A–B–C trikotnik, A–C je brcajoča guma ---------- */
  T.sling = (A, B, C, side, o = {}) => {
    T.seg(A[0], A[1], B[0], B[1], { r: 3, e: 0.6, look: 'rubber' });
    T.seg(B[0], B[1], C[0], C[1], { r: 3, e: 0.6, look: 'rubber' });
    const kick = T.seg(A[0], A[1], C[0], C[1], { r: 3, e: 0.6, kind: 'sling', draw: false, data: { side } });
    const sl = { A, B, C, kick, side, flash: 0, bend: 0, label: o.label || '', color: o.color || null };
    T.slings.push(sl);
    return sl;
  };

  /* ---------- flipper ---------- */
  // side: 'L' | 'R' (smer oblike); button: kateri gumb ga premika (privzeto = side); layer: plast
  T.flipper = (o) => {
    const side = o.side || 'L';
    const f = { side, button: o.button || side, px: o.px, py: o.py, len: o.len ?? 74,
      rest: o.rest, up: o.up, angle: o.rest, omega: 0, r1: o.r1 ?? 13, r2: o.r2 ?? 7,
      pressed: false, enabled: true, layer: o.layer ?? 0, label: o.label ?? 'ALU', id: o.id || side + T.flippers.length };
    T.flippers.push(f);
    return f;
  };
  /** flipper s privzetimi koti: levi kaže desno navzdol, desni levo navzdol */
  T.flipperAt = (side, px, py, o = {}) => {
    const down = o.restAngle ?? 0.52, upA = o.upAngle ?? 0.45;
    return T.flipper(Object.assign({ side, px, py,
      rest: side === 'L' ? down : Math.PI - down, up: side === 'L' ? -upA : Math.PI + upA }, o));
  };

  /* ---------- drop tarče: banka poljubne dolžine ---------- */
  // targets: [[ax, ay, bx, by], …]; labels: po ena črka/oznaka; resetDelay: s po padcu zadnje (null = pravila)
  T.dropBank = (id, targets, o = {}) => {
    const bank = { id, targets: [], color: o.color || '#39ff88', resetDelay: o.resetDelay ?? null, name: o.name || id };
    targets.forEach((p, i) => {
      const s = T.seg(p[0], p[1], p[2], p[3], { kind: 'drop', r: o.r ?? 5, e: o.e ?? 0.3, data: { idx: i, bank: id }, draw: false,
        id: id + i, color: bank.color });
      s.sink = 0;               // 0 = gor, 1 = pogreznjena (animacija)
      s.label = (o.labels && o.labels[i]) || '';
      s.bank = bank;
      T.drops.push(s);
      bank.targets.push(s);
    });
    T.banks.push(bank);
    return bank;
  };

  /* ---------- standup tarča (posamična ali v banki) ---------- */
  // face: [fx, fy] — zadetek šteje le od te strani (normala proti žogici); null = z vseh strani
  T.standup = (id, ax, ay, bx, by, o = {}) => {
    const s = T.seg(ax, ay, bx, by, { kind: 'standup', r: o.r ?? 5, e: o.e ?? 0.35, draw: false, id,
      data: { bank: o.bank || null, idx: o.idx ?? 0 }, color: o.color || '#ff4fd8' });
    s.face = o.face || null; s.minFace = o.minFace ?? 0.4;
    s.wobble = 0; s.label = o.label || ''; s.lit = false; s.name = o.name || id;
    T.standups.push(s);
    return s;
  };
  T.standupBank = (id, list, o = {}) => list.map((p, i) => T.standup(id + i, p[0], p[1], p[2], p[3],
    Object.assign({}, o, { bank: id, idx: i, label: (o.labels && o.labels[i]) || '', name: id })));

  /*
   * ---------- rampa (plast) ----------
   * Splošna definicija prehodov (glej physics.js → checkLayers). Stene rampe doda miza sama (T.seg z layer)
   * ali pa jih zgradi T.wireform iz poti.
   */
  T.ramp = (o) => {
    const R = Object.assign({
      id: 'ramp' + T.ramps.length, layer: 1, friction: 0.35, lift: [], feed: null, made: null, label: '',
      fail: o.fail || { y: o.entry.y, x1: o.entry.x1 - 2, x2: o.entry.x2 + 2 },
    }, o);
    R.lift = R.lift.map(L => Object.assign({ x1: -INF, x2: INF, y1: -INF, y2: INF, ax: 0, ay: 0 }, L));
    R.entry = Object.assign({ x1: -INF, x2: INF }, R.entry);
    R.fail = Object.assign({ x1: -INF, x2: INF }, R.fail);
    R.exit = Object.assign({ x1: -INF, x2: INF, dir: 'down' }, R.exit);
    R.bounds = Object.assign({ x1: -INF, x2: INF, y1: -INF, y2: INF }, R.bounds || {});
    R.idx = T.ramps.length;
    T.ramps.push(R);
    return R;
  };

  /*
   * ---------- žičnata rampa (wireform) ali plastična rampa po poti ----------
   * path: [[x,y], …] od vhoda (spodaj) do izhoda; apex: indeks točke na vrhu (senzor »made«);
   * width: notranja širina; exitFeed: { vx, vy } hitrost na izhodu (npr. proti inlanu/flipperju);
   * incline: pojemek na vzponu (px/s², privzeto 520); look: 'wire' | 'ramp'.
   */
  T.wireform = (o) => {
    const P = o.path, w = o.width ?? 30, hw = w / 2, layer = o.layer ?? (T.ramps.length + 1);
    const apex = o.apex ?? Math.floor(P.length / 2);
    const look = o.look || 'wire';
    // stene: odmik poti levo in desno
    const off = side => P.map((p, i) => {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      return [p[0] - ty * hw * side, p[1] + tx * hw * side];
    });
    const L = off(1), Rr = off(-1);
    const wall = { layer, r: 2, e: 0.25, look, draw: false };
    T.poly(L, wall); T.poly(Rr, wall);
    const p0 = P[0], p1 = P[1], pe = P[P.length - 1], pp = P[P.length - 2];
    const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
    // pojemek na vzponu: kapsule ob segmentih do vrha, smer nazaj proti vhodu
    const lift = [];
    for (let i = 0; i < apex; i++) {
      const a = P[i], b = P[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const k = (o.incline ?? 520) / l;
      lift.push({ seg: [a[0], a[1], b[0], b[1]], r: hw + BR, ax: (a[0] - b[0]) * k, ay: (a[1] - b[1]) * k,
        x1: Math.min(a[0], b[0]) - hw - BR, x2: Math.max(a[0], b[0]) + hw + BR, y1: Math.min(a[1], b[1]) - hw - BR, y2: Math.max(a[1], b[1]) + hw + BR });
    }
    const down = pe[1] >= pp[1];
    const R = T.ramp({
      id: o.id, layer, friction: o.friction ?? 0.35, label: o.label || '', look, path: P, width: w, apex,
      entry: { y: p0[1], x1: p0[0] - hw - 2, x2: p0[0] + hw + 2 },
      fail: { y: p0[1], x1: p0[0] - hw - 4, x2: p0[0] + hw + 4 },
      exit: { y: pe[1], x1: pe[0] - hw - 6, x2: pe[0] + hw + 6, dir: down ? 'down' : 'up' },
      bounds: { x1: Math.min(...xs) - w - 30, x2: Math.max(...xs) + w + 30, y1: Math.min(...ys) - w - 30, y2: Math.max(...ys) + w + 30 },
      lift, feed: o.exitFeed || null, made: o.made || (o.id + 'Made'), color: o.color || null,
    });
    void p1;
    T.sensor(R.made, P[apex][0], P[apex][1], hw, { layer });
    return R;
  };

  /*
   * ---------- saucer / scoop / VUK ----------
   * Žogica pade v luknjo (senzor) in obmiruje; pravila jo izvržejo z game.ejectSaucer(id, b).
   * capture: { maxUp, maxAny } — ujame strel od spredaj (navzgor) do maxUp ali katerokoli žogico do maxAny.
   * eject: { x, y, vx, rvx, vy, rvy, layer } — izmet (x, y = drugje → VUK s podzemno potjo).
   */
  T.saucer = (id, x, y, o = {}) => {
    const sa = { id, x, y, r: o.r ?? 15, kind: o.kind || 'saucer', name: o.name || id,
      capture: Object.assign({ maxUp: 2800, maxAny: 650 }, o.capture || {}),
      eject: Object.assign({ x, y, vx: 0, rvx: 0, vy: -900, rvy: 0, layer: 0 }, o.eject || {}),
      held: 0, flash: 0, idx: T.saucers.length };
    sa.sensor = T.sensor('saucer', x, y, sa.r, { name: sa.name, idx: sa.idx, ref: sa });
    T.saucers.push(sa);
    return sa;
  };
  T.vuk = (id, x, y, o = {}) => T.saucer(id, x, y, Object.assign({ kind: 'vuk', capture: { maxUp: 3400, maxAny: 3400 } }, o));

  /* ---------- spinner ---------- */
  T.spinner = (id, x, y, o = {}) => {
    const sp = { id, x, y, w: o.w ?? 38, angle: o.angle || 0, label: o.label || '', name: o.name || id,
      state: { angle: 0, w: 0, half: 0 }, idx: T.spinners.length, x1: o.x1 ?? x - (o.w ?? 38) / 2 - 3, x2: o.x2 ?? x + (o.w ?? 38) / 2 + 3 };
    sp.sensor = T.sensor('spinner', x, y, o.r ?? 20, { name: sp.name, idx: sp.idx, ref: sp });
    T.spinners.push(sp);
    return sp;
  };

  /* ---------- rollover kanali z lane change ---------- */
  T.laneGroup = (id, sensors, o = {}) => {
    const g = { id, sensors, lamps: o.lamps || [], change: o.change ?? true };
    sensors.forEach((s, i) => { s.group = id; s.idx = i; });
    T.laneGroups.push(g);
    return g;
  };

  /* ---------- vidni lock: žogice obstanejo v vrsti ---------- */
  T.lock = (id, slots, o = {}) => {
    const k = { id, slots, release: Object.assign({ x: slots[0][0], y: slots[0][1] + 20, vx: 0, vy: 300 }, o.release || {}),
      balls: 0, label: o.label || '', idx: T.locks.length };
    T.locks.push(k);
    return k;
  };

  /* ---------- dvižni stebriček (up-post) ---------- */
  T.post = (id, x, y, o = {}) => {
    const s = T.seg(x, y, x, y, { r: o.r ?? 6, e: o.e ?? 0.5, kind: 'post', look: 'upPost', id, active: !!o.up, rubber: true });
    s.lift = o.up ? 1 : 0;
    T.posts.push(s);
    return s;
  };

  /* ---------- preusmernik (diverter): vrtljivo vodilo z dvema legama ---------- */
  T.diverter = (id, px, py, len, a0, a1, o = {}) => {
    const s = T.seg(px, py, px + Math.cos(a0) * len, py + Math.sin(a0) * len, { r: o.r ?? 3, e: 0.3, kind: 'diverter', look: 'diverter', id, layer: o.layer ?? 0 });
    Object.assign(s, { px, py, len, a0, a1, on: false, angle: a0 });
    T.diverters.push(s);
    return s;
  };

  /* ---------- ujeta žogica (captive ball) v kanalu A → B ---------- */
  // žogica miruje v A (gravitacija), zadeta zdrsne proti B; ob koncu sproži stikalo (pravila: onSwitch(id)).
  T.captive = (id, ax, ay, bx, by, o = {}) => {
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    const c = { id, ax, ay, bx, by, len, ux, uy, t: 0, v: 0, x: ax, y: ay, hitEnd: false, name: o.name || id, flash: 0 };
    // stene kanala (ob straneh in na koncu)
    const hw = BR + 1.5, nx = -uy, ny = ux;
    const wall = { r: 3, e: 0.3, look: o.look || 'rail' };
    T.seg(ax + nx * hw - ux * 6, ay + ny * hw - uy * 6, bx + nx * hw + ux * BR, by + ny * hw + uy * BR, wall);
    T.seg(ax - nx * hw - ux * 6, ay - ny * hw - uy * 6, bx - nx * hw + ux * BR, by - ny * hw + uy * BR, wall);
    T.seg(bx + nx * hw + ux * BR, by + ny * hw + uy * BR, bx - nx * hw + ux * BR, by - ny * hw + uy * BR, wall);
    T.captives.push(c);
    return c;
  };

  /* ---------- magnet pod igralno površino ---------- */
  T.magnet = (id, x, y, o = {}) => {
    const m = { id, x, y, r: o.r ?? 55, force: o.force ?? 2.4e5, on: false, hold: false, held: 0, t: 0 };
    T.magnets.push(m);
    return m;
  };

  /*
   * ---------- igrača: premičen objekt s trkalnikom ----------
   * shape.segs: [[ax, ay, bx, by, r], …] v lokalnih koordinatah (okoli 0,0); pose {x, y, angle};
   * pravila jo premaknejo z game.moveToy(id, { x, y, angle }); speed = px/s, spin = rad/s.
   */
  T.toy = (id, o) => {
    const toy = { id, x: o.x, y: o.y, angle: o.angle || 0, target: { x: o.x, y: o.y, angle: o.angle || 0 },
      speed: o.speed ?? 120, spin: o.spin ?? 2, local: (o.shape && o.shape.segs) || [], segs: [], data: o.data || {}, moving: false };
    for (const p of toy.local) {
      const s = T.seg(0, 0, 0, 0, { r: p[4] ?? 4, e: o.e ?? 0.35, kind: 'toy', look: 'toy', draw: false, id });
      s.toy = toy;
      toy.segs.push(s);
    }
    toy.place = () => {
      const c = Math.cos(toy.angle), s = Math.sin(toy.angle);
      toy.local.forEach((p, i) => {
        const g = toy.segs[i];
        g.ax = toy.x + p[0] * c - p[1] * s; g.ay = toy.y + p[0] * s + p[1] * c;
        g.bx = toy.x + p[2] * c - p[3] * s; g.by = toy.y + p[2] * s + p[3] * c;
        bbox(g);
      });
    };
    toy.step = (dt) => {
      const t = toy.target;
      const dx = t.x - toy.x, dy = t.y - toy.y, d = Math.hypot(dx, dy), da = t.angle - toy.angle;
      if (d < 1e-3 && Math.abs(da) < 1e-4) { if (toy.moving) { toy.moving = false; for (const g of toy.segs) { g.svx = 0; g.svy = 0; } } return; }
      toy.moving = true;
      const m = Math.min(d, toy.speed * dt), ma = Math.max(-toy.spin * dt, Math.min(toy.spin * dt, da));
      const vx = d > 0 ? dx / d * m / dt : 0, vy = d > 0 ? dy / d * m / dt : 0;
      toy.x += vx * dt; toy.y += vy * dt; toy.angle += ma;
      for (const g of toy.segs) { g.svx = vx; g.svy = vy; }
      toy.place();
    };
    toy.place();
    T.toys.push(toy);
    return toy;
  };

  /* ---------- strel (shot): ime + stikala, ki ga sprožijo ---------- */
  T.shot = (id, o = {}) => {
    const sh = { id, label: o.label || id, switches: o.switches || [id], x: o.x ?? 300, y: o.y ?? 300, combo: o.combo ?? true, color: o.color || null };
    T.shots.push(sh);
    return sh;
  };

  /* ---------- izstrelitveni kanal (plunger) ---------- */
  T.launcher = (o) => {
    T.launch = Object.assign({ x: 562.5, y: 957, laneX: 546, laneY: 880, travel: 28, min: 900, k: 1950,
      x1: 545, x2: 580, auto: [2300, 300] }, o);
    T.plunger = T.seg(T.launch.x1, T.launch.y, T.launch.x2, T.launch.y, { kind: 'plunger', e: 0.05, r: 0, draw: false });
    return T.launch;
  };

  T.inside = (x, y) => insideOutline(T.outline, x, y);

  /** zaključi mizo: indeksi po id */
  T.finish = () => {
    T.lampById = {};
    for (const l of T.lamps) T.lampById[l.id] = l;
    T.byId = {};
    for (const arr of [T.ramps, T.saucers, T.spinners, T.laneGroups, T.locks, T.posts, T.diverters, T.captives, T.magnets, T.toys, T.banks, T.shots]) {
      for (const e of arr) if (e.id && !T.byId[e.id]) T.byId[e.id] = e;
    }
    T.shotBySwitch = {};
    for (const s of T.shots) for (const w of s.switches) T.shotBySwitch[w] = s;
    return T;
  };
  return T;
}

export function bbox(s) {
  s.minx = Math.min(s.ax, s.bx) - s.r; s.maxx = Math.max(s.ax, s.bx) + s.r;
  s.miny = Math.min(s.ay, s.by) - s.r; s.maxy = Math.max(s.ay, s.by) + s.r;
}

/** točka znotraj zunanjega roba mize (za teste in varovalo pred pobegom) */
export function insideOutline(o, x, y) {
  if (x < o.x1 || x > o.x2) return false;
  if (y < o.cy) return (x - o.cx) ** 2 + (y - o.cy) ** 2 < o.r * o.r;
  return true;
}
