/* =====================================================================
   DIRKA FRNIKOL — race.js: čista, deterministična simulacija dirke.
   Frnikola = telo iz ../krogla/physics.js (makeBody, stepBody, advanceWorld),
   trki frnikola–frnikola prek ../rusilec/collide.js (collideAll).
   Fiksen korak STEP (120 Hz). Isti seed + isti sunki ob istem koraku = isti izid.
   Brez DOM-a: uporabljajo ga igra, kvote (tihe simulacije), generator prog in testi.
   ===================================================================== */
import { STEP, makeBody, advanceWorld, stepBody, groundY } from '../krogla/physics.js';
import { collideAll } from '../rusilec/collide.js';
import { rng } from '../../shared/util.js';
import { trackRoutes, trackWorld } from './track.js';

/** Pravila in konstante dirke. */
export const RACE = {
  STEP,
  NUDGES: 3,            // sunkov na udeleženca na dirko
  CD: 1.5,              // ohlajanje sunka (s)
  HELP_DV: 3.4,         // pomoč: dodatna hitrost v smeri proge (m/s)
  HIT_DV: 5.2,          // bočni sunek: hitrost vstran (m/s, deljeno z maso)
  RESPAWN: 2,           // padec → po 2 s nazaj na zadnjo kontrolno točko
  STUCK: 3.5,           // brez napredka toliko s → nazaj na kontrolno točko
  MAX_T: 90,            // najdaljša dirka (s)
  AFTER_FIRST: 18,      // po prvem v cilju še toliko s, nato konec (ostali po napredku)
  LOOK: 2.0,            // pogled naprej za krmiljenje (m)
  PHOTO: 0.08,          // foto finiš: razlika med 1. in 2. manj kot toliko s
};

const CD_STEPS = Math.round(RACE.CD / STEP);

/**
 * Lastnosti frnikole iz forme (vsaka −1 … 1) → fizika. Razlike so namerno majhne.
 * speed: pogon (hitrost v ravnini) · grip: oprijem v zavojih · mass: masa (trki, sunki).
 */
export function physOf(form = {}) {
  const s = clamp(form.speed || 0, -1, 1), g = clamp(form.grip || 0, -1, 1), m = clamp(form.mass || 0, -1, 1);
  return {
    drive: (0.5 + 0.034 * s) * (1 - 0.018 * m),
    grip: 3.1 + 0.85 * g,
    mass: 1 + 0.16 * m,
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Nova dirka.
 * @param {{track:Object, marbles:{id:string, form:Object}[], seed:string|number, brains?:Function[], participants?:string[]}} o
 *   brains: funkcije (R) → sunek | null (boti; kličejo se vsakih 30 korakov)
 */
export function createRace({ track, marbles, seed, brains = [], participants = [] }) {
  const w = trackWorld(track);
  const routes = trackRoutes(track, w);
  const r = rng('frnikole:race:' + seed);
  const n = marbles.length;
  // vrstni red na startu in izbira poti na razcepih (iz seeda)
  const slots = r.shuffle([...Array(n).keys()]);
  const grid = track.grid;
  const M = marbles.map((mb, i) => {
    const ph = physOf(mb.form);
    const routeKey = (track.splits || []).map(sp => (r() < (sp.bias ?? 0.5) ? 1 : 0)).join('') || '';
    const route = routes.get(routeKey) || routes.get('');
    const g = grid[slots[i] % grid.length];
    const jx = (r() - 0.5) * 0.06, jz = (r() - 0.5) * 0.06;
    const b = makeBody(w, g[0] + jx, g[1] + jz);
    b.baseMass = ph.mass; b.id = i;
    return {
      i, id: mb.id, ph, b, route, routeKey,
      seg: nearestSeg(route, b.x, b.z, 0, route.n - 1), s: 0, ms: 0, best: 0,
      lane0: (r() - 0.5) * 0.7, lw: 0.6 + r() * 1.4, lp: r() * 6.28,
      st: 'run', fallT: 0, cp: 0, stuckT: 0, stuckS: 0,
      finished: false, finishT: null, place: 0, falls: 0, nudged: 0,
      lastHit: null,   // { by, k, step } zadnji sunek (za dosežek »saboter«)
    };
  });
  const R = {
    track, w, M, routes, seed, step: 0, t: 0, done: false, events: [], log: [],
    nudgers: new Map(), brains, participants,
    order: M.map(m => m.i), leader: -1, firstT: null, finishOrder: [], lastHold: 0,
  };
  for (const id of participants) R.nudgers.set(id, { left: RACE.NUDGES, cd: -1e9 });
  for (const m of M) project(R, m);
  return R;
}

/* ------------------------------------------------------------ geometrija poti */

function nearestSeg(rt, x, z, a, b) {
  let best = 1e18, bi = a;
  a = Math.max(0, a); b = Math.min(rt.n - 2, b);
  for (let k = a; k <= b; k++) {
    const x0 = rt.x[k], z0 = rt.z[k], dx = rt.x[k + 1] - x0, dz = rt.z[k + 1] - z0;
    const L2 = dx * dx + dz * dz || 1e-9;
    const t = clamp(((x - x0) * dx + (z - z0) * dz) / L2, 0, 1);
    const ex = x0 + dx * t - x, ez = z0 + dz * t - z;
    const d = ex * ex + ez * ez;
    if (d < best) { best = d; bi = k; }
  }
  return bi;
}

/** Točka poti pri razdalji s: { x, z, tx, tz, w, seg }. */
export function routeAt(rt, s) {
  s = clamp(s, 0, rt.cum[rt.n - 1]);
  let k = 0, lo = 0, hi = rt.n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (rt.cum[mid] <= s) lo = mid; else hi = mid; }
  k = lo;
  const L = rt.cum[k + 1] - rt.cum[k] || 1e-9;
  const t = (s - rt.cum[k]) / L;
  const tx = (rt.x[k + 1] - rt.x[k]) / L, tz = (rt.z[k + 1] - rt.z[k]) / L;
  return { x: rt.x[k] + (rt.x[k + 1] - rt.x[k]) * t, z: rt.z[k] + (rt.z[k + 1] - rt.z[k]) * t, tx, tz, w: rt.w[k], seg: k };
}

/** Projekcija frnikole na njeno pot: posodobi seg, s (pot), ms (glavna proga). */
function project(R, m) {
  const rt = m.route, b = m.b;
  const k = nearestSeg(rt, b.x, b.z, m.seg - 2, m.seg + 6);
  m.seg = k;
  const x0 = rt.x[k], z0 = rt.z[k], dx = rt.x[k + 1] - x0, dz = rt.z[k + 1] - z0;
  const L2 = dx * dx + dz * dz || 1e-9;
  const t = clamp(((b.x - x0) * dx + (b.z - z0) * dz) / L2, 0, 1);
  m.s = rt.cum[k] + t * (rt.cum[k + 1] - rt.cum[k]);
  m.ms = rt.main[k] + t * (rt.main[k + 1] - rt.main[k]);
  m.lat = ((b.x - x0) * -dz + (b.z - z0) * dx) / Math.sqrt(L2);   // + = desno od smeri
}

/* ------------------------------------------------------------ sunki */

/**
 * Sunek { step, m, k: 'help' | 'hit', by }. Preveri pravila (ostanek, ohlajanje, frnikola v igri).
 * Vrne true, če je bil izveden.
 */
export function applyNudge(R, n) {
  const m = R.M[n.m];
  if (!m || m.st !== 'run' || m.finished || R.done) return false;
  if (n.k !== 'help' && n.k !== 'hit') return false;
  let q = R.nudgers.get(n.by);
  if (!q) { q = { left: RACE.NUDGES, cd: -1e9 }; R.nudgers.set(n.by, q); }
  if (q.left <= 0 || R.step - q.cd < CD_STEPS) return false;
  q.left--; q.cd = R.step;
  const b = m.b;
  const p = routeAt(m.route, m.s + 0.3);
  if (n.k === 'help') {
    b.vx += p.tx * RACE.HELP_DV; b.vz += p.tz * RACE.HELP_DV;
  } else {
    // bočno: proti bližnjemu robu (stran od sredine poti)
    const side = Math.abs(m.lat) > 0.08 ? Math.sign(m.lat) : ((R.step + m.i) % 2 ? 1 : -1);
    const nx = -p.tz * side, nz = p.tx * side;
    const dv = RACE.HIT_DV / m.ph.mass;
    b.vx += nx * dv; b.vz += nz * dv; b.vy = Math.max(b.vy, 1.2);
    b.grounded = false; b.on = null;
  }
  m.nudged++;
  m.lastHit = { by: n.by, k: n.k, step: R.step };
  const ev = { type: 'nudge', step: R.step, m: n.m, k: n.k, by: n.by };
  R.events.push(ev);
  R.log.push({ step: R.step, m: n.m, k: n.k, by: n.by });
  return true;
}

/** Koliko sunkov ima udeleženec še in ali je pripravljen. */
export function nudgeState(R, by) {
  const q = R.nudgers.get(by) || { left: RACE.NUDGES, cd: -1e9 };
  const wait = Math.max(0, CD_STEPS - (R.step - q.cd)) * STEP;
  return { left: q.left, wait, ready: q.left > 0 && wait <= 0 };
}

/* ------------------------------------------------------------ korak */

/**
 * En fiksni korak dirke.
 * @param {Object} R dirka
 * @param {{m:number, k:string, by:string}[]} [nudges] sunki tega koraka (igralec, omrežje)
 */
export function stepRace(R, nudges) {
  if (R.done) return;
  const w = R.w;
  advanceWorld(w);
  R.step++; R.t = R.step * STEP;
  if (nudges) for (const n of nudges) applyNudge(R, { ...n, step: R.step });
  if (R.brains.length && R.step % 30 === 0) {
    for (const br of R.brains) { const n = br(R); if (n) applyNudge(R, { ...n, step: R.step }); }
  }
  const ev = [];
  const bodies = [];
  for (const m of R.M) {
    const b = m.b;
    if (m.st === 'fall') {
      m.fallT += STEP;
      b.vy -= 22 * STEP; b.y += b.vy * STEP; b.x += b.vx * STEP * 0.4; b.z += b.vz * STEP * 0.4;
      if (m.fallT >= RACE.RESPAWN) respawn(R, m);
      continue;
    }
    let ix = 0, iz = 0, fx = 0, fz = 0;
    const p = routeAt(m.route, m.s + RACE.LOOK);
    if (!m.finished) {
      const hw = Math.max(0, p.w / 2 - 0.45);
      const lane = clamp(m.lane0 + 0.28 * Math.sin(R.t * m.lw + m.lp), -0.8, 0.8) * hw;
      const tx = p.x - p.tz * lane - b.x, tz = p.z + p.tx * lane - b.z;
      const d = Math.hypot(tx, tz) || 1;
      ix = tx / d * m.ph.drive; iz = tz / d * m.ph.drive;
      // oprijem: duši hitrost pravokotno na smer proge
      const c = routeAt(m.route, m.s);
      const vl = b.vx * -c.tz + b.vz * c.tx;
      if (b.grounded) { fx = c.tz * vl * m.ph.grip; fz = -c.tx * vl * m.ph.grip; }
    } else {
      b.vx *= 0.985; b.vz *= 0.985;
    }
    stepBody(w, b, ix, iz, ev, fx, fz);
    bodies.push(b);
  }
  for (const e of ev) if (e.type === 'spring' || e.type === 'hammer') R.events.push({ type: e.type, m: e.id, step: R.step });
  collideAll(bodies, (a, b, hit) => {
    if (hit.v > 2.2) R.events.push({ type: 'bonk', a: a.id, b: b.id, v: hit.v, step: R.step, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });
  });
  const finishS = (m) => m.route.finish;
  for (const m of R.M) {
    if (m.st !== 'run') continue;
    const prevS = m.s;
    project(R, m);
    const b = m.b;
    // padec s proge
    const rt = m.route;
    const gy = Math.min(rt.gy[m.seg], rt.gy[Math.min(rt.n - 1, m.seg + 1)], rt.gy[Math.min(rt.n - 1, m.seg + 2)]);
    if (b.y < gy - 1.6 || b.y < w.killY) { fall(R, m, 'fall'); continue; }
    if (m.s > m.best) m.best = m.s;
    // kontrolne točke
    while (m.cp + 1 < rt.cps.length && m.best >= rt.cps[m.cp + 1]) m.cp++;
    // cilj
    if (!m.finished && m.s >= finishS(m)) {
      const sp = Math.max(0.3, Math.hypot(b.vx, b.vz));
      const over = m.s - finishS(m);
      m.finished = true;
      m.finishT = R.t - Math.min(STEP, over / sp);
      R.finishOrder.push(m.i);
      m.place = R.finishOrder.length;
      if (R.firstT == null) R.firstT = R.t;
      R.events.push({ type: 'finish', m: m.i, place: m.place, t: m.finishT, step: R.step });
      continue;
    }
    // zataknjena
    if (!m.finished) {
      if (m.s > m.stuckS + 0.5) { m.stuckS = m.s; m.stuckT = 0; }
      else { m.stuckT += STEP; if (m.stuckT > RACE.STUCK) { fall(R, m, 'stuck'); continue; } }
    }
    void prevS;
  }
  // vrstni red in vodstvo
  if (R.step % 12 === 0) updateOrder(R);
  const allIn = R.M.every(m => m.finished);
  if (allIn || R.t >= RACE.MAX_T || (R.firstT != null && R.t - R.firstT >= RACE.AFTER_FIRST)) finishRace(R);
}

function fall(R, m, why) {
  m.st = 'fall'; m.fallT = 0; m.falls++;
  // padec na tvegani (glavni) poti razcepa → naslednjič izbere stransko pot
  const k = m.route.spl.findIndex(sp => !sp.alt && m.s >= sp.s0 - 0.5 && m.s <= sp.s1);
  if (k >= 0) m.switchTo = m.routeKey.slice(0, k) + '1' + m.routeKey.slice(k + 1);
  m.b.ghost = true;
  R.events.push({ type: why, m: m.i, step: R.step, by: m.lastHit && R.step - m.lastHit.step < 240 ? m.lastHit : null });
}

function respawn(R, m) {
  if (m.switchTo && R.routes.get(m.switchTo)) { m.routeKey = m.switchTo; m.route = R.routes.get(m.switchTo); }
  m.switchTo = null;
  const rt = m.route;
  const s = rt.cps[m.cp] ?? 0;
  const p = routeAt(rt, s);
  const b = m.b;
  // mesto ob kontrolni točki: bočno razmaknjeno po indeksu frnikole
  const hw = Math.max(0, p.w / 2 - 0.45);
  const off = (((m.i * 5) % 8) / 7 - 0.5) * 2 * hw * 0.8;
  b.x = p.x - p.tz * off; b.z = p.z + p.tx * off;
  const gy = groundY(R.w, b.x, b.z);
  b.y = (Number.isFinite(gy) ? gy : rt.gy[p.seg]) + b.r + 0.3;
  b.vx = p.tx * 1.2; b.vz = p.tz * 1.2; b.vy = 0;
  b.grounded = false; b.on = null; b.ghost = false; b.stun = 0;
  m.seg = p.seg; m.st = 'run'; m.stuckT = 0; m.stuckS = s; m.fallT = 0; m.best = s;
  project(R, m);
  R.events.push({ type: 'respawn', m: m.i, step: R.step });
}

/** Trenutni vrstni red (indeksi frnikol): najprej v cilju po času, nato po napredku. */
export function standings(R) {
  return [...R.M].sort((a, b) => {
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    if (a.finished) return a.finishT - b.finishT || a.i - b.i;
    const pa = a.st === 'fall' ? a.route.cps[a.cp] ?? 0 : a.ms, pb = b.st === 'fall' ? b.route.cps[b.cp] ?? 0 : b.ms;
    return (pb - pa) || a.i - b.i;
  }).map(m => m.i);
}

function updateOrder(R) {
  const prev = R.order;
  const ord = standings(R);
  R.order = ord;
  if (ord[0] !== R.leader) {
    if (R.leader >= 0 && R.t > 2) R.events.push({ type: 'lead', m: ord[0], prev: R.leader, step: R.step });
    R.leader = ord[0];
  }
  // prehitevanja v vrhu (top 3), le ob dejanski spremembi
  for (let p = 1; p < 3; p++) {
    const now = ord[p], was = prev.indexOf(now);
    if (was > p && R.t > 3) R.events.push({ type: 'pass', m: now, place: p + 1, step: R.step });
  }
}

function finishRace(R) {
  R.done = true;
  const ord = standings(R);
  R.order = ord;
  // tisti, ki niso prišli v cilj, dobijo mesta po napredku
  ord.forEach((i, k) => { R.M[i].place = k + 1; });
  const a = R.M[ord[0]], b = R.M[ord[1]];
  R.photo = !!(a && b && a.finished && b.finished && b.finishT - a.finishT < RACE.PHOTO);
  R.events.push({ type: 'end', order: ord, photo: R.photo, step: R.step });
}

/**
 * Tiha simulacija do konca (kvote, generator, testi).
 * @param {Object} R
 * @param {Map<number, Object[]>} [plan] korak → sunki
 * @returns {number[]} končni vrstni red
 */
export function runRace(R, plan = null) {
  const max = Math.ceil(RACE.MAX_T / STEP) + 2;
  while (!R.done && R.step < max) {
    stepRace(R, plan ? plan.get(R.step + 1) : null);
    if (R.events.length > 200) R.events.length = 0;
  }
  return R.order;
}

/** Izid dirke za stave in prikaz: { order, times, photo, falls }. */
export function resultOf(R) {
  return {
    order: R.order.slice(),
    times: R.M.map(m => m.finishT),
    photo: !!R.photo,
    falls: R.M.map(m => m.falls),
  };
}
