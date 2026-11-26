/* =====================================================================
   HRČKOVA KROGLA — physics.js: čista, deterministična fizika.
   Fiksni korak 120 Hz (STEP). Isti vhod po korakih → isti rezultat ne glede na FPS.
   Koordinate: x (vzhod), y (gor), z (jug). Ploščica (c, r) pokriva x∈[c,c+1], z∈[r,r+1].
   ===================================================================== */
import { TILE_CHARS, DIRS, heightOf } from './level.js';

export const STEP = 1 / 120;

/** Fizikalne konstante (enake za vse skine). */
export const P = {
  R: 0.32,          // polmer krogle
  G: 22,            // težnost
  ACCEL: 11,        // pospešek vhoda
  MAXV: 13,         // največja vodoravna hitrost
  STEP_UP: 0.22,    // stopnica, ki jo krogla še prevozi
  SNAP: 0.16,       // za koliko se krogla še »prilepi« na tla pri spustu
  REST: 0.35,       // odbojnost sten
  WALL_H: 1.2,      // višina zidu nad ploščico
  RISE: 0.5,        // dvig klančine na ploščico
  SLAB: 0.7,        // debelina ploščic (spodaj ni trka)
  FALL_DELAY: 1.2,  // padec → vrnitev na kontrolno točko
  CONVEYOR: 2.4,    // hitrost tekočega traku
};

const SURF = {
  floor: { drag: 1.6, ctrl: 1 },
  ice: { drag: 0.12, ctrl: 0.32 },
  slick: { drag: 0.45, ctrl: 0.6 },   // dnevni dodatek »vse je led«
  glue: { drag: 6, ctrl: 1 },
  air: { drag: 0.05, ctrl: 0.3 },
};

const T = { void: 0, floor: 1, wall: 2, ramp: 3, ice: 4, glue: 5, wave: 6, fall: 7, conveyor: 8 };
export const TILE = T;

/* =====================================================================
   Mreža
   ===================================================================== */

function buildGrid(L, mods) {
  const [W, D] = L.size;
  const n = W * D;
  const g = { W, D, type: new Uint8Array(n), h: new Float32Array(n), dx: new Int8Array(n), dz: new Int8Array(n), minH: Infinity, maxH: -Infinity };
  for (let r = 0; r < D; r++) {
    const row = L.map[r] || '';
    const hrow = L.hmap ? L.hmap[r] || '' : '';
    for (let c = 0; c < W; c++) {
      const ch = row[c] ?? ' ';
      const i = r * W + c;
      let t = T[TILE_CHARS[ch] || 'void'];
      g.type[i] = t;
      g.h[i] = heightOf(hrow[c] ?? '0') || 0;
      const d = DIRS[ch];
      if (d) { g.dx[i] = d[0]; g.dz[i] = d[1]; }
      if (t !== T.void) { g.minH = Math.min(g.minH, g.h[i]); g.maxH = Math.max(g.maxH, g.h[i]); }
    }
  }
  if (!Number.isFinite(g.minH)) g.minH = g.maxH = 0;
  return g;
}

/* =====================================================================
   Poti (premične ploščice, žage, ose) — determinizem iz časa
   ===================================================================== */

function pathInfo(path, loop) {
  const pts = loop ? [...path, path[0]] : path;
  const seg = [];
  let len = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    let l = 0;
    for (let k = 0; k < a.length; k++) l += (b[k] - a[k]) ** 2;
    l = Math.sqrt(l);
    seg.push({ a, b, l, s: len });
    len += l;
  }
  return { seg, len: Math.max(len, 1e-6) };
}

/** Položaj na poti ob času t (ping-pong ali zanka). */
export function pathAt(info, speed, phase, t, loop, out = [], pause = 0) {
  const { seg, len } = info;
  let s;
  if (loop) { s = t * speed + phase * len; s = ((s % len) + len) % len; }
  else {
    const run = len / speed, per = 2 * run + 2 * pause;
    const u = (((t + phase * per) % per) + per) % per;
    if (u < pause) s = 0;
    else if (u < pause + run) s = (u - pause) * speed;
    else if (u < 2 * pause + run) s = len;
    else s = len - (u - 2 * pause - run) * speed;
  }
  let k = 0;
  while (k < seg.length - 1 && s > seg[k].s + seg[k].l) k++;
  const g = seg[k];
  const f = g.l > 0 ? Math.min(1, Math.max(0, (s - g.s) / g.l)) : 0;
  for (let j = 0; j < g.a.length; j++) out[j] = g.a[j] + (g.b[j] - g.a[j]) * f;
  return out;
}

/* =====================================================================
   Svet
   ===================================================================== */

/**
 * Ustvari svet za progo.
 * @param {Object} L proga
 * @param {{ice?:boolean, enemy?:number, radius?:number, fan?:number}} [mods] dodatki dneva
 */
export function createWorld(L, mods = {}) {
  const g = buildGrid(L, mods);
  const w = {
    L, g, mods, t: 0, steps: 0,
    R: P.R * (mods.radius || 1),
    enemyMul: mods.enemy || 1,
    fanMul: mods.fan || 1,
    killY: g.minH - 5,
    ball: null,
    checkpoint: -1,
    collected: new Set(),
    stars: 0,
    fallTiles: new Map(),   // index → čas dotika
    switches: new Set(),
    doorOpen: new Map(),    // id → čas odprtja
    cooldown: new Map(),
    events: [],
    finished: false,
    finishT: null,
    dead: false, deadT: 0,
    falls: 0,
    movers: (L.movers || []).map(m => ({ ...m, info: pathInfo(m.path, !!m.loop), pos: [0, 0, 0], prev: [0, 0, 0], v: [0, 0, 0] })),
    spinners: (L.spinners || []).map(s => ({ ...s, y: s.y ?? 0 })),
    saws: [], wasps: [], bullies: [], vacuums: [], magnets: [],
  };
  for (const en of L.enemies || []) {
    if (en.t === 'saw') w.saws.push({ ...en, info: pathInfo(en.path, en.loop !== false), pos: [0, 0], r: en.r || 0.42 });
    if (en.t === 'wasp') w.wasps.push({ ...en, info: pathInfo(en.path, en.loop !== false), pos: [0, 0], r: en.r || 0.32 });
    if (en.t === 'vacuum') w.vacuums.push({ ...en });
    if (en.t === 'magnet') w.magnets.push({ ...en });
    if (en.t === 'bully') {
      const b = newBody(en.x, en.z, en.r || 0.5, w);
      Object.assign(b, { home: [en.x, en.z], zone: en.zone || 4, mass: en.mass || 2.6, accel: en.accel || 7.5, deadT: 0, id: w.bullies.length });
      w.bullies.push(b);
    }
  }
  w.ball = newBody(L.start[0], L.start[1], w.R, w);
  updateDynamic(w);
  for (const m of w.movers) m.prev = m.pos.slice();
  return w;
}

function newBody(x, z, r, w) {
  const b = { x, y: 0, z, vx: 0, vy: 0, vz: 0, r, grounded: true, surf: 'floor', on: null, stun: 0, yaw: 0, mass: 1 };
  const gr = groundAt(w, b, x, z, Infinity);
  b.y = (Number.isFinite(gr.h) ? gr.h : 0) + r;
  return b;
}

/* =====================================================================
   Višina tal
   ===================================================================== */

function bowlDepth(w, x, z) {
  let d = 0;
  for (const b of w.L.bowls || []) {
    const q = ((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r);
    if (q < 1) d += b.depth * (1 - q) * (1 - q);
  }
  return d;
}

function fallGone(w, i) {
  const t0 = w.fallTiles.get(i);
  if (t0 == null) return false;
  const dt = w.t - t0;
  if (w.permFall) return dt > 0.7;   // arene (Rušilec): odpadla ploščica se ne vrne
  return dt > 0.7 && dt < 4.5;
}

/**
 * Vrh ploščice i v točki (x, z) (lahko izven ploščice — za naklon). -Infinity = praznina.
 */
export function tileTop(w, i, x, z) {
  const g = w.g;
  const t = g.type[i];
  if (t === T.void) return -Infinity;
  if (t === T.fall && fallGone(w, i)) return -Infinity;
  let h = g.h[i];
  const c = i % g.W, r = (i / g.W) | 0;
  if (t === T.ramp) {
    const dx = g.dx[i], dz = g.dz[i];
    let f = 0;
    if (dx > 0) f = x - c; else if (dx < 0) f = c + 1 - x;
    else if (dz > 0) f = z - r; else f = r + 1 - z;
    h += P.RISE * Math.min(1, Math.max(0, f));
  } else if (t === T.wave) {
    h += 0.14 * Math.sin(x * Math.PI) * Math.sin(z * Math.PI);
  } else if (t === T.wall) {
    return h + P.WALL_H;
  }
  if (w.L.bowls) h -= bowlDepth(w, x, z);
  return h;
}

export function tileIndex(w, x, z) {
  const c = Math.floor(x), r = Math.floor(z);
  if (c < 0 || r < 0 || c >= w.g.W || r >= w.g.D) return -1;
  return r * w.g.W + c;
}

/** Vrh tal v točki (najvišja površina, ki ni nad »bottom + STEP_UP«). */
function groundAt(w, body, x, z, bottom) {
  const lim = bottom + P.STEP_UP;
  let best = -Infinity, surf = 'floor', on = null, idx = -1;
  const i = tileIndex(w, x, z);
  if (i >= 0) {
    const h = tileTop(w, i, x, z);
    if (h <= lim) {
      best = h; idx = i;
      const t = w.g.type[i];
      surf = t === T.ice ? 'ice' : t === T.glue ? 'glue' : 'floor';
      if (w.mods.ice && surf !== 'ice') surf = 'slick';
    }
  }
  for (const m of w.movers) {
    const hw = m.size[0] / 2, hd = m.size[1] / 2;
    if (Math.abs(x - m.pos[0]) <= hw && Math.abs(z - m.pos[2]) <= hd) {
      const top = m.pos[1];
      if (top <= lim && top > best) { best = top; on = m; surf = m.ice ? 'ice' : 'floor'; idx = -1; }
    }
  }
  for (const s of w.spinners) {
    if ((x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r) {
      if (s.y <= lim && s.y > best) { best = s.y; on = s; surf = 'floor'; idx = -1; }
    }
  }
  return { h: best, surf, on, idx };
}

/* =====================================================================
   Dinamični objekti
   ===================================================================== */

function updateDynamic(w) {
  const te = w.t * w.enemyMul;
  for (const m of w.movers) {
    m.prev[0] = m.pos[0]; m.prev[1] = m.pos[1]; m.prev[2] = m.pos[2];
    pathAt(m.info, m.speed, m.phase || 0, w.t, !!m.loop, m.pos, m.pause || 0);
  }
  for (const s of w.saws) pathAt(s.info, s.speed * 1, s.phase || 0, te, s.loop !== false, s.pos);
  for (const s of w.wasps) pathAt(s.info, s.speed, s.phase || 0, te, s.loop !== false, s.pos);
}

/** Faza kladiva: 'idle' | 'warn' | 'strike' | 'up' in f (0–1 znotraj faze). */
export function hammerPhase(w, hm) {
  const u = (((w.t * w.enemyMul) / hm.period + (hm.phase || 0)) % 1 + 1) % 1;
  if (u < 0.55) return { ph: 'idle', f: u / 0.55, u };
  if (u < 0.85) return { ph: 'warn', f: (u - 0.55) / 0.3, u };
  if (u < 0.92) return { ph: 'strike', f: (u - 0.85) / 0.07, u };
  return { ph: 'up', f: (u - 0.92) / 0.08, u };
}

/** Ali je magnet aktiven (in ali tik pred vklopom utripa). */
export function magnetState(w, mg) {
  const period = mg.period || 3;
  const u = (((w.t * w.enemyMul) / period + (mg.phase || 0)) % 1 + 1) % 1;
  const duty = mg.duty ?? 0.5;
  return { on: u < duty, warn: u > 1 - 0.12, u };
}

/**
 * Ventilator v ritmu (neobvezna polja period, duty, phase); brez `period` piha ves čas.
 * Ritem ni odvisen od dodatka »sovražniki ×2« (ventilator ni sovražnik).
 */
export function fanState(w, fn) {
  if (!fn.period) return { on: true, warn: false, u: 0 };
  const u = ((w.t / fn.period + (fn.phase || 0)) % 1 + 1) % 1;
  const duty = fn.duty ?? 0.5;
  return { on: u < duty, warn: u > 1 - 0.15, u };
}

/** Odprtost vrat 0 (zaprta) … 1 (odprta). */
export function doorOpenness(w, id) {
  const t0 = w.doorOpen.get(id);
  if (t0 == null) return 0;
  return Math.min(1, Math.max(0, (w.t - t0) / 0.7));
}

/** Stanje padajoče ploščice: { shake, drop } (drop = koliko je že padla, v enotah). */
export function fallTileState(w, i) {
  const t0 = w.fallTiles.get(i);
  if (t0 == null) return { shake: 0, drop: 0 };
  const dt = w.t - t0;
  if (dt < 0.7) return { shake: dt / 0.7, drop: 0 };
  if (dt < 4.5 || w.permFall) return { shake: 0, drop: 0.5 * 9 * (dt - 0.7) ** 2 };
  return { shake: 0, drop: 0 };
}

/* =====================================================================
   Trki
   ===================================================================== */

function pushOut(b, px, pz, nx, nz, pen, vx0, vz0, ev) {
  b.x += nx * pen; b.z += nz * pen;
  const rvx = b.vx - vx0, rvz = b.vz - vz0;
  const vn = rvx * nx + rvz * nz;
  if (vn < 0) {
    b.vx -= (1 + P.REST) * vn * nx;
    b.vz -= (1 + P.REST) * vn * nz;
    if (ev && -vn > 2.5) ev.push({ type: 'bump', v: -vn });
  }
}

/** Krog (xz) proti pravokotniku [x0,x1]×[z0,z1]; vrne true ob trku. */
function circleRect(b, x0, z0, x1, z1, vx0, vz0, ev) {
  const r = b.r;
  const px = Math.min(Math.max(b.x, x0), x1), pz = Math.min(Math.max(b.z, z0), z1);
  let dx = b.x - px, dz = b.z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    pushOut(b, px, pz, dx / d, dz / d, r - d, vx0, vz0, ev);
  } else {
    // središče v pravokotniku: potisni ven pri najbližjem robu
    const e = [b.x - x0, x1 - b.x, b.z - z0, z1 - b.z];
    const k = e.indexOf(Math.min(...e));
    const n = [[-1, 0], [1, 0], [0, -1], [0, 1]][k];
    pushOut(b, px, pz, n[0], n[1], e[k] + r, vx0, vz0, ev);
  }
  return true;
}

function collideStatic(w, b, ev) {
  const g = w.g;
  const bottom = b.y - b.r, top = b.y + b.r;
  const c0 = Math.floor(b.x - b.r), c1 = Math.floor(b.x + b.r);
  const r0 = Math.floor(b.z - b.r), r1 = Math.floor(b.z + b.r);
  const own = tileIndex(w, b.x, b.z);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (c < 0 || r < 0 || c >= g.W || r >= g.D) continue;
      const i = r * g.W + c;
      if (g.type[i] === T.void) continue;
      if (i === own && g.type[i] !== T.wall) continue;
      const px = Math.min(Math.max(b.x, c + 0.001), c + 0.999), pz = Math.min(Math.max(b.z, r + 0.001), r + 0.999);
      const hp = tileTop(w, i, px, pz);
      if (!(hp > bottom + P.STEP_UP)) continue;
      if (hp - P.SLAB - (g.type[i] === T.wall ? P.WALL_H : 0) > top) continue;
      circleRect(b, c, r, c + 1, r + 1, 0, 0, ev);
    }
  }
  for (const bl of w.L.blocks || []) {
    if (bl.y1 > bottom + P.STEP_UP && bl.y0 < top) circleRect(b, bl.x, bl.z, bl.x + bl.w, bl.z + bl.d, 0, 0, ev);
  }
  for (const d of w.L.doors || []) {
    if (doorOpenness(w, d.id) >= 0.6) continue;
    const y1 = d.y + (d.h || 1.2);
    if (y1 > bottom + P.STEP_UP && d.y < top) circleRect(b, d.x, d.z, d.x + d.w, d.z + d.d, 0, 0, ev);
  }
  for (const m of w.movers) {
    const top2 = m.pos[1], bot2 = top2 - (m.thick || 0.4);
    if (top2 > bottom + P.STEP_UP && bot2 < top) {
      const hw = m.size[0] / 2, hd = m.size[1] / 2;
      const vx0 = (m.pos[0] - m.prev[0]) / STEP, vz0 = (m.pos[2] - m.prev[2]) / STEP;
      circleRect(b, m.pos[0] - hw, m.pos[2] - hd, m.pos[0] + hw, m.pos[2] + hd, vx0, vz0, ev);
    }
  }
  for (const bp of w.L.bumpers || []) {
    const dx = b.x - bp.x, dz = b.z - bp.z;
    const rr = b.r + (bp.r || 0.4);
    const d2 = dx * dx + dz * dz;
    const by = bp.y ?? 0;
    if (d2 < rr * rr && d2 > 1e-9 && bottom < by + 0.8 && top > by) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
      b.x += nx * (rr - d); b.z += nz * (rr - d);
      const vn = b.vx * nx + b.vz * nz;
      const kick = Math.max(0, -vn) * 0.6 + (bp.power || 7);
      b.vx += (kick - vn) * nx; b.vz += (kick - vn) * nz;
      ev?.push({ type: 'bumper', x: bp.x, z: bp.z });
    }
  }
}

/* =====================================================================
   Integracija telesa
   ===================================================================== */

function integrate(w, b, ax, az, dt, ev) {
  const R = b.r;
  // prenos s premične podlage (pred premikom)
  if (b.grounded && b.on) {
    const on = b.on;
    if (on.info) {
      b.x += on.pos[0] - on.prev[0];
      b.z += on.pos[2] - on.prev[2];
      b.y += on.pos[1] - on.prev[1];
    } else if (on.speed != null) {
      const a = on.speed * dt;
      const rx = b.x - on.x, rz = b.z - on.z;
      const ca = Math.cos(a), sa = Math.sin(a);
      b.x = on.x + rx * ca - rz * sa;
      b.z = on.z + rx * sa + rz * ca;
    }
  }
  // tekoči trak
  if (b.grounded && !b.on) {
    const i = tileIndex(w, b.x, b.z);
    if (i >= 0 && w.g.type[i] === T.conveyor) {
      b.x += w.g.dx[i] * P.CONVEYOR * dt;
      b.z += w.g.dz[i] * P.CONVEYOR * dt;
    }
  }
  const s = SURF[b.grounded ? (b.forceSurf || b.surf) : 'air'];   // forceSurf: Rušilec (Zmrzal)
  let gx = 0, gz = 0;
  if (b.grounded) {
    // naklon iz višine podlage (končne razlike znotraj iste ploščice)
    const i = tileIndex(w, b.x, b.z);
    if (i >= 0 && !b.on) {
      const e = 0.02;
      const hx = (tileTop(w, i, b.x + e, b.z) - tileTop(w, i, b.x - e, b.z)) / (2 * e);
      const hz = (tileTop(w, i, b.x, b.z + e) - tileTop(w, i, b.x, b.z - e)) / (2 * e);
      if (Number.isFinite(hx) && Number.isFinite(hz)) {
        const k = P.G * (5 / 7) / (1 + hx * hx + hz * hz);
        gx = -hx * k; gz = -hz * k;
      }
    }
  }
  const ctrl = b.stun > 0 ? 0 : s.ctrl;
  b.vx += (ax * P.ACCEL * ctrl + gx) * dt;
  b.vz += (az * P.ACCEL * ctrl + gz) * dt;
  const damp = Math.exp(-s.drag * dt);
  b.vx *= damp; b.vz *= damp;
  const sp = Math.hypot(b.vx, b.vz);
  if (sp > P.MAXV) { b.vx *= P.MAXV / sp; b.vz *= P.MAXV / sp; }

  // podkoraki pri visoki hitrosti (ne skozi tanko steno)
  const n = Math.max(1, Math.ceil((sp * dt) / (R * 0.4)));
  const h = dt / n;
  for (let k = 0; k < n; k++) {
    const yPrev = b.y;
    b.x += b.vx * h; b.z += b.vz * h;
    if (b.grounded) {
      const gr = groundAt(w, b, b.x, b.z, b.y - R);
      if (!Number.isFinite(gr.h) || (b.y - R) - gr.h > P.SNAP) {
        b.grounded = false; b.on = null;
        // navpična hitrost ob odlepitvi (npr. vrh klančine → skok)
        b.vy = Math.min(b.vy, 12);
      } else {
        b.y = gr.h + R;
        b.vy = (b.y - yPrev) / h;
        if (gr.on && gr.on.info) b.vy -= (gr.on.pos[1] - gr.on.prev[1]) / dt;
        b.surf = gr.surf; b.on = gr.on; b.idx = gr.idx;
      }
    }
    if (!b.grounded) {
      b.vy -= P.G * h;
      b.y += b.vy * h;
      const gr = groundAt(w, b, b.x, b.z, b.y - R - b.vy * h);
      if (Number.isFinite(gr.h) && b.y - R <= gr.h && b.vy <= 0) {
        if (b.vy < -7 && ev) ev.push({ type: 'land', v: -b.vy });
        b.y = gr.h + R;
        b.vy = 0;
        b.grounded = true; b.surf = gr.surf; b.on = gr.on; b.idx = gr.idx;
      }
    }
    collideStatic(w, b, ev);
  }
  if (b.stun > 0) b.stun -= dt;
  if (sp > 0.4) {
    const yaw = Math.atan2(b.vx, b.vz);
    let d = yaw - b.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    b.yaw += d * Math.min(1, dt * 10);
  }
}

/* =====================================================================
   Korak sveta
   ===================================================================== */

function cool(w, key, t) {
  const c = w.cooldown.get(key);
  if (c != null && w.t < c) return false;
  w.cooldown.set(key, w.t + t);
  return true;
}

/**
 * En fiksni korak (STEP). Vhod je v svetovnih koordinatah (|v| ≤ 1).
 * Dogodki se dodajo v w.events (igra jih pobere in sprazni).
 * @param {Object} w svet
 * @param {number} ix vhod x
 * @param {number} iz vhod z
 */
export function step(w, ix = 0, iz = 0) {
  const dt = STEP;
  const ev = w.events;
  w.t += dt; w.steps++;
  updateDynamic(w);
  const b = w.ball;
  const m = Math.hypot(ix, iz);
  if (m > 1) { ix /= m; iz /= m; }

  if (w.dead) {
    // krogla pada; po FALL_DELAY se vrne na kontrolno točko
    b.vy -= P.G * dt; b.y += b.vy * dt; b.x += b.vx * dt * 0.5; b.z += b.vz * dt * 0.5;
    w.deadT += dt;
    if (w.deadT >= P.FALL_DELAY) respawn(w);
  } else if (!w.finished) {
    let ax = ix, az = iz;
    // sile: ventilatorji, sesalci, magneti
    const f = forces(w, b);
    ax += f[0] / P.ACCEL; az += f[1] / P.ACCEL;
    integrate(w, b, ax, az, dt, ev);
    interact(w, b, ev);
    if (b.y < w.killY) {
      w.dead = true; w.deadT = 0; w.falls++;
      ev.push({ type: 'fall' });
    }
  }
  bullies(w, ev);
}

function forces(w, b) {
  let fx = 0, fz = 0;
  for (const fn of w.L.fans || []) {
    if (fn.period && !fanState(w, fn).on) continue;   // ventilator v ritmu (neobvezno: period, duty, phase)
    const dx = b.x - fn.x, dz = b.z - fn.z;
    const along = dx * fn.dir[0] + dz * fn.dir[1];
    const side = Math.abs(-dx * fn.dir[1] + dz * fn.dir[0]);
    if (along > 0 && along < fn.len && side < (fn.width || 1) / 2 && Math.abs(b.y - (fn.y ?? b.y)) < 1.6) {
      const k = (fn.force || 14) * w.fanMul * (1 - 0.5 * along / fn.len);
      fx += fn.dir[0] * k; fz += fn.dir[1] * k;
    }
  }
  for (const v of w.vacuums) {
    const dx = v.x - b.x, dz = v.z - b.z;
    const d = Math.hypot(dx, dz);
    const range = v.range || 5;
    if (d < range && d > 0.05) {
      const dir = v.dir || [0, 1];
      const cos = -(dx * dir[0] + dz * dir[1]) / d;   // ali je krogla pred ustjem
      if (cos > Math.cos((v.angle || 35) * Math.PI / 180)) {
        const k = (v.force || 12) * (1 - d / range * 0.6) * w.enemyMul ** 0.5;
        fx += dx / d * k; fz += dz / d * k;
      }
    }
  }
  for (const mg of w.magnets) {
    const st = magnetState(w, mg);
    if (!st.on) continue;
    const dx = mg.x - b.x, dz = mg.z - b.z;
    const d = Math.hypot(dx, dz);
    const range = mg.range || 3.5;
    if (d < range && d > 0.3) {
      const sign = mg.mode === 'push' ? -1 : 1;
      const k = sign * (mg.force || 14) * (1 - d / range);
      fx += dx / d * k; fz += dz / d * k;
    }
  }
  return [fx, fz];
}

function interact(w, b, ev) {
  const L = w.L;
  // padajoče ploščice
  if (b.grounded && !b.on) {
    const i = tileIndex(w, b.x, b.z);
    if (i >= 0 && w.g.type[i] === T.fall) {
      const t0 = w.fallTiles.get(i);
      if (t0 == null || w.t - t0 > 4.5) { w.fallTiles.set(i, w.t); ev.push({ type: 'shake', i }); }
    }
  }
  // pobiralke
  (L.pickups || []).forEach((p, k) => {
    if (w.collected.has(k)) return;
    const py = p.y ?? b.y;
    if ((b.x - p.x) ** 2 + (b.z - p.z) ** 2 < (b.r + 0.35) ** 2 && Math.abs(b.y - py) < 0.9) {
      w.collected.add(k);
      if (p.t === 'star') w.stars++;
      ev.push({ type: p.t, k });
    }
  });
  // kontrolne točke
  (L.checkpoints || []).forEach((p, k) => {
    if (k <= w.checkpoint) return;
    if ((b.x - p[0]) ** 2 + (b.z - p[1]) ** 2 < 0.75 ** 2) { w.checkpoint = k; ev.push({ type: 'checkpoint', k }); }
  });
  // stikala
  for (const s of L.switches || []) {
    if (w.switches.has(s.id)) continue;
    if ((b.x - s.x) ** 2 + (b.z - s.z) ** 2 < 0.5 ** 2 && b.grounded) {
      w.switches.add(s.id); w.doorOpen.set(s.id, w.t + 0.15);
      ev.push({ type: 'switch', id: s.id });
    }
  }
  // vzmeti
  for (const sp of L.springs || []) {
    if (b.grounded && (b.x - sp.x) ** 2 + (b.z - sp.z) ** 2 < 0.42 ** 2 && cool(w, sp, 0.4)) {
      const pw = sp.power || 8;
      b.vx = sp.dir[0] * pw; b.vz = sp.dir[1] * pw;
      b.vy = sp.up || 7; b.grounded = false; b.on = null;
      ev.push({ type: 'spring' });
    }
  }
  // kladiva
  for (const hm of L.hammers || []) {
    const st = hammerPhase(w, hm);
    if (st.ph !== 'strike' || st.f < 0.5) continue;
    if (b.x > hm.x - b.r && b.x < hm.x + hm.w + b.r && b.z > hm.z - b.r && b.z < hm.z + hm.d + b.r && cool(w, hm, 0.3)) {
      const d = hm.dir || [0, 1];
      b.vx = d[0] * 9; b.vz = d[1] * 9; b.vy = 4.5; b.grounded = false; b.on = null; b.stun = 0.45;
      ev.push({ type: 'hammer' });
    }
  }
  // žage
  for (const s of w.saws) {
    const dx = b.x - s.pos[0], dz = b.z - s.pos[1];
    const rr = b.r + s.r;
    if (dx * dx + dz * dz < rr * rr && Math.abs(b.y - b.r - (s.y ?? (b.y - b.r))) < 0.8 && cool(w, s, 0.6)) {
      const d = Math.hypot(dx, dz) || 1;
      b.vx = dx / d * 7.5; b.vz = dz / d * 7.5; b.stun = 0.6;
      ev.push({ type: 'saw' });
    }
  }
  // ose
  for (const s of w.wasps) {
    const dx = b.x - s.pos[0], dz = b.z - s.pos[1];
    const rr = b.r + s.r;
    if (dx * dx + dz * dz < rr * rr && cool(w, s, 0.5)) {
      const d = Math.hypot(dx, dz) || 1;
      b.vx += dx / d * 6; b.vz += dz / d * 6;
      ev.push({ type: 'wasp' });
    }
  }
  // cilj
  const gl = L.goal;
  if ((b.x - gl[0]) ** 2 + (b.z - gl[1]) ** 2 < 0.7 ** 2 && b.grounded) {
    w.finished = true; w.finishT = w.t;
    ev.push({ type: 'goal', t: w.t });
  }
}

/* =====================================================================
   Nasilneži (sovražne krogle) — sledijo iz stanja, deterministično
   ===================================================================== */

function bullies(w, ev) {
  const p = w.ball;
  for (const b of w.bullies) {
    if (b.deadT > 0) {
      b.deadT -= STEP;
      if (b.deadT <= 0) {
        b.x = b.home[0]; b.z = b.home[1]; b.vx = b.vz = b.vy = 0;
        const gr = groundAt(w, b, b.x, b.z, Infinity);
        b.y = gr.h + b.r + 0.6; b.grounded = false;
        ev.push({ type: 'bully-back', id: b.id });
      } else continue;
    }
    let tx = b.home[0], tz = b.home[1];
    const pdH = Math.hypot(p.x - b.home[0], p.z - b.home[1]);
    const chase = !w.dead && pdH < b.zone && Math.abs(p.y - b.y) < 1.5;
    if (chase) { tx = p.x + p.vx * 0.25; tz = p.z + p.vz * 0.25; }
    let ax = tx - b.x, az = tz - b.z;
    const d = Math.hypot(ax, az);
    let k = chase ? 1 : Math.min(1, d / 1.5);
    if (d > 1e-3) { ax = ax / d * k; az = az / d * k; } else { ax = az = 0; }
    // zaviranje pri vračanju domov
    if (!chase) { ax -= b.vx * 0.12; az -= b.vz * 0.12; }
    const scale = (b.accel / P.ACCEL) * Math.min(1.6, w.enemyMul);
    integrate(w, b, ax * scale, az * scale, STEP, null);
    if (b.y < w.killY) { b.deadT = 2; ev.push({ type: 'bully-fall', id: b.id }); continue; }
    // trk z igralcem
    if (w.dead) continue;
    const dx = p.x - b.x, dz = p.z - b.z, dy = p.y - b.y;
    const rr = p.r + b.r;
    const d2 = dx * dx + dz * dz + dy * dy;
    if (d2 < rr * rr && d2 > 1e-9) {
      const dd = Math.sqrt(d2), nx = dx / dd, nz = dz / dd;
      const pen = rr - dd;
      const m1 = p.mass, m2 = b.mass;
      p.x += nx * pen * m2 / (m1 + m2); p.z += nz * pen * m2 / (m1 + m2);
      b.x -= nx * pen * m1 / (m1 + m2); b.z -= nz * pen * m1 / (m1 + m2);
      const rv = (p.vx - b.vx) * nx + (p.vz - b.vz) * nz;
      if (rv < 0) {
        const j = -(1 + 0.7) * rv / (1 / m1 + 1 / m2);
        p.vx += j / m1 * nx; p.vz += j / m1 * nz;
        b.vx -= j / m2 * nx; b.vz -= j / m2 * nz;
        if (-rv > 1.5) ev.push({ type: 'bully', v: -rv });
      }
    }
  }
}

/* =====================================================================
   Vrnitev na kontrolno točko
   ===================================================================== */

/** Postavi kroglo na zadnjo kontrolno točko (ali start). */
export function respawn(w) {
  const p = w.checkpoint >= 0 ? w.L.checkpoints[w.checkpoint] : w.L.start;
  const b = w.ball;
  b.x = p[0]; b.z = p[1]; b.vx = b.vy = b.vz = 0; b.stun = 0;
  const gr = groundAt(w, b, b.x, b.z, Infinity);
  b.y = (Number.isFinite(gr.h) ? gr.h : 0) + b.r + 0.4;
  b.grounded = false; b.on = null;
  w.dead = false; w.deadT = 0;
  w.events.push({ type: 'respawn' });
}

/** Vrh tal pod točko (za senco in kamero). */
export function groundBelow(w, x, z, fromY = Infinity) {
  return groundAt(w, w.ball, x, z, fromY).h;
}

/* =====================================================================
   Več teles (Rušilec — party arena). Singleplayer (step) teh funkcij ne
   uporablja; svet ostane isti, le krogel je več in vsaka ima svoj hlad.
   ===================================================================== */

/** Novo telo (krogla) na (x, z), postavljeno na tla. */
export function makeBody(w, x, z, r = w.R) { return newBody(x, z, r, w); }

/** Premakni čas sveta za STEP (premične plošče, žage, ose …) — enkrat na korak, pred stepBody. */
export function advanceWorld(w) {
  w.t += STEP; w.steps++;
  updateDynamic(w);
}

/** Vrh tal v (x, z) pod višino fromY (za bote, izhodišča in sence). */
export function groundY(w, x, z, fromY = Infinity) {
  return groundAt(w, w.ball, x, z, fromY).h;
}

/**
 * En korak za poljubno telo: sile, integracija s trki ob ploščice/kvadre/odbijače,
 * vzmeti, kladiva, žage, ose. Hlad (cooldown) je za vsako telo posebej (b.cd).
 * Dogodki dobijo b.id. Padec (y < killY) preveri klicatelj.
 * @param {Object} w svet
 * @param {Object} b telo (makeBody)
 * @param {number} ix vhod x (|v| ≤ 1)
 * @param {number} iz vhod z
 * @param {Object[]} ev seznam dogodkov
 * @param {number} [fx] dodatna sila x (npr. magnet, veter)
 * @param {number} [fz]
 */
export function stepBody(w, b, ix, iz, ev, fx = 0, fz = 0) {
  const m = Math.hypot(ix, iz);
  if (m > 1) { ix /= m; iz /= m; }
  const f = forces(w, b);
  const local = [];
  integrate(w, b, ix + (f[0] + fx) / P.ACCEL, iz + (f[1] + fz) / P.ACCEL, STEP, local);
  const cd = b.cd || (b.cd = new Map());
  const cool2 = (key, t) => { const c = cd.get(key); if (c != null && w.t < c) return false; cd.set(key, w.t + t); return true; };
  const L = w.L;
  for (const sp of L.springs || []) {
    if (b.grounded && (b.x - sp.x) ** 2 + (b.z - sp.z) ** 2 < 0.42 ** 2 && cool2(sp, 0.4)) {
      const pw = sp.power || 8;
      b.vx = sp.dir[0] * pw; b.vz = sp.dir[1] * pw;
      b.vy = sp.up || 7; b.grounded = false; b.on = null;
      local.push({ type: 'spring', sp });
    }
  }
  for (const hm of L.hammers || []) {
    const st = hammerPhase(w, hm);
    if (st.ph !== 'strike' || st.f < 0.5) continue;
    if (b.x > hm.x - b.r && b.x < hm.x + hm.w + b.r && b.z > hm.z - b.r && b.z < hm.z + hm.d + b.r && cool2(hm, 0.3)) {
      const d = hm.dir || [0, 1];
      b.vx = d[0] * 9; b.vz = d[1] * 9; b.vy = 4.5; b.grounded = false; b.on = null; b.stun = 0.45;
      local.push({ type: 'hammer' });
    }
  }
  for (const s of w.saws) {
    const dx = b.x - s.pos[0], dz = b.z - s.pos[1];
    const rr = b.r + s.r;
    if (dx * dx + dz * dz < rr * rr && Math.abs(b.y - b.r - (s.y ?? (b.y - b.r))) < 0.8 && cool2(s, 0.6)) {
      const d = Math.hypot(dx, dz) || 1;
      b.vx = dx / d * 7.5; b.vz = dz / d * 7.5; b.stun = 0.6;
      local.push({ type: 'saw' });
    }
  }
  for (const s of w.wasps) {
    const dx = b.x - s.pos[0], dz = b.z - s.pos[1];
    const rr = b.r + s.r;
    if (dx * dx + dz * dz < rr * rr && cool2(s, 0.5)) {
      const d = Math.hypot(dx, dz) || 1;
      b.vx += dx / d * 6; b.vz += dz / d * 6;
      local.push({ type: 'wasp' });
    }
  }
  for (const e of local) { e.id = b.id; ev.push(e); }
}
