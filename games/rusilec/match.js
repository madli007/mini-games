/* =====================================================================
   RUŠILEC — match.js: čista simulacija runde (brez DOM-a).
   Točke, pripisovanje izrivov (zadnji dotik v 4 s), samomori, dvojni izriv,
   maščevanje, biljard, ponovni prihod z neranljivostjo, finale (krušenje roba),
   nagla smrt, ekipe, Zadnji na plošči z duhovi, zlati hrček, pobiralke s seedom.
   Deterministično za isti vhod in seed (host, prenos hosta, testi).
   Igra (game.js) kliče stepMatch(M, inputs) s fiksnim korakom STEP (120 Hz).
   ===================================================================== */
import { STEP, P, makeBody, advanceWorld, stepBody, groundY } from '../krogla/physics.js';
import { arenaWorld, tileId, tileGone, edgeInfo, hasFloor, arenaBounds } from './arena.js';
import { collideAll, dash, tickDash, bumperKick } from './collide.js';

export { STEP };

/** Pravila (sekunde). */
export const RULES = {
  TOUCH: 4,          // zadnji dotik velja toliko časa
  RESPAWN: 2,        // čakanje po padcu
  INVULN: 1.5,       // neranljivost po prihodu
  FINALE: 30,        // zadnjih 30 s: krušenje roba
  DOUBLE: 2,         // dvojni izriv: dva v 2 s
  HAT: 10,           // hat-trick: 3 izrivi v 10 s
  LAST: 3,           // »zadnji trenutek«: izriv v zadnjih 3 s
  BANK: 0.8,         // biljard: odbita krogla zadene drugo v tem času
  BANK_V: 3.5,       // … in je ob odboju dobila vsaj toliko hitrosti
  PICK_FIRST: 8, PICK_EVERY: 12, PICK_LIFE: 11, PICK_ARM: 1,   // pobiralke: prva, razmik, življenje, telegraf
  PICK_T: { weight: 8, bumper: 8, freeze: 3, magnet: 3 },
  MAGNET_R: 7, MAGNET_F: 15,
  SUDDEN_STEP: 0.7, SUDDEN_MAX: 45,
  GHOST_CD: 8, GUST_T: 0.9, GUST_R: 1.7, GUST_F: 24, CURSOR_V: 7,
  FALL_Y: 1.4,       // padec: toliko pod najnižjimi tlemi arene
};

export const PICKUPS = {
  weight: { icon: '🏋️', name: 'Utež', desc: '8 s večja masa' },
  bumper: { icon: '🛡️', name: 'Odbijač', desc: '8 s: kdor se te dotakne, odleti' },
  freeze: { icon: '❄️', name: 'Zmrzal', desc: 'vsem drugim 3 s led' },
  magnet: { icon: '🧲', name: 'Magnet', desc: '3 s vleče najbližjega k tebi' },
};
const PICK_KINDS = Object.keys(PICKUPS);

export const PALETTE = ['#ff4d6d', '#4dabff', '#ffd23f', '#39ff88', '#c77dff', '#ff8a3d', '#4de1ff', '#ff7ae0'];
export const TEAM_COLORS = ['#ff4d6d', '#4dabff'];
export const TEAM_NAMES = ['Rdeči', 'Modri'];
export const MODES = { ffa: 'Vsi proti vsem', teams: 'Ekipe', lms: 'Zadnji na plošči' };

/** Privzete nastavitve igre (lobby). */
export const DEFAULT_CFG = {
  mode: 'ffa', roundSec: 180, rounds: 3, arena: 'random', dash: true, suicide: -1,
  gold: false, pickups: true, ghosts: true, bots: 0, botLevel: 2,
};

/* ------------------------------------------------------------ PRNG (serializabilen) */

/** mulberry32: stanje je eno 32-bitno število (gre v polno stanje za prenos hosta). */
export function rngNext(o, key = 'rs') {
  let a = (o[key] = (o[key] + 0x6D2B79F5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}
export function seedNum(s) {
  let h = 2166136261;
  for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h | 0;
}

/* ------------------------------------------------------------ ustvarjanje */

/**
 * Nova runda.
 * @param {{arena:Object, players:{id:string, name?:string, bot?:number, team?:number, slot?:number}[], cfg?:Object, seed?:string|number}} o
 */
export function createMatch({ arena, players, cfg = {}, seed = 1 }) {
  const C = { ...DEFAULT_CFG, ...cfg };
  const w = arenaWorld(arena);
  const M = {
    A: arena, cfg: C, w, t: 0, phase: 'play', ev: [],
    rs: seedNum(seed), bs: seedNum(seed + ':bot'),
    players: [], pickups: [], pickN: 0, nextPick: RULES.PICK_FIRST,
    sudden: null, result: null, gusts: [], crumbled: 0,
    bounds: arenaBounds(arena), floorY: w.g.minH,
  };
  M.pickSpots = pickupSpots(M);
  players.slice(0, 8).forEach((pl, k) => {
    const p = {
      id: pl.id, name: pl.name || '', bot: pl.bot || 0, team: C.mode === 'teams' ? (pl.team ?? (k % 2)) : -1, slot: pl.slot ?? k,
      score: 0, kills: 0, deaths: 0, suicides: 0, revenges: 0, billiards: 0, lastSec: 0, hat: 0,
      st: 'alive', stT: 0, invT: 0, lastTouch: null, killedBy: null, lastKillT: null, killTimes: [],
      weightT: 0, bumperT: 0, iceT: 0, magnetT: 0, ghostCd: 0, cursor: null, absent: false, dashSeen: null, place: 0,
    };
    p.b = makeBody(w, 0, 0);
    p.b.id = k;
    M.players.push(p);
  });
  // začetni položaji: izhodišča po vrsti (premešana s seedom)
  const order = arena.spawns.map((s, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rngNext(M) * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  M.players.forEach((p, k) => placeAt(M, p, arena.spawns[order[k % order.length]], 0));
  return M;
}

/** Kandidati za pobiralke: tla, ki niso rob, luknja ali padajoča ploščica. */
function pickupSpots(M) {
  const { A, w } = M;
  const out = [];
  A.map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (!'.i~g'.includes(row[c]) || row[c] === ' ') continue;
      const x = c + 0.5, z = r + 0.5;
      if (edgeInfo(w, x, z, 2).d < 1.2) continue;
      out.push([x, z]);
    }
  });
  return out.length ? out : A.spawns.map(s => [s[0], s[1]]);
}

function placeAt(M, p, s, inv) {
  const b = p.b;
  const gy = groundY(M.w, s[0], s[1]);
  b.x = s[0]; b.z = s[1]; b.y = (Number.isFinite(gy) ? gy : 0) + b.r + (inv ? 0.35 : 0);
  b.vx = b.vy = b.vz = 0; b.grounded = !inv; b.on = null; b.stun = 0; b.dashT = 0; b.dashCd = 0;
  b.ghost = inv > 0;
  p.invT = inv; p.st = 'alive'; p.stT = 0; p.lastTouch = null;
}

/* ------------------------------------------------------------ pomočniki */

export const byId = (M, id) => M.players.find(p => p.id === id);
const alive = p => p.st === 'alive';
const enemies = (M, a, b) => M.cfg.mode !== 'teams' || a.team !== b.team;
/** V igri (ni izločen ali odsoten). */
const inPlay = p => p.st !== 'out';

/** Vodilni (en sam z največ točkami > 0) — zlata krona. */
export function leaderId(M) {
  let best = 0, id = null, tie = false;
  for (const p of M.players) {
    if (p.score > best) { best = p.score; id = p.id; tie = false; } else if (p.score === best && best > 0) tie = true;
  }
  return tie ? null : id;
}

/** Točke ekip [rdeči, modri]. */
export function teamScores(M) {
  const s = [0, 0];
  for (const p of M.players) if (p.team >= 0) s[p.team] += p.score;
  return s;
}

/** Koliko časa še do konca runde (s). */
export const timeLeft = M => Math.max(0, M.cfg.roundSec - M.t);

/* ------------------------------------------------------------ krušenje (deterministično iz časa) */

/**
 * Razpored krušenja: [{ i, t0 }] — kdaj se katera ploščica začne tresti.
 * Ffa/ekipe: finale.tiles v zadnjih 30 s (enakomerno v 26 s); nagla smrt: finale.sudden od začetka nagle smrti.
 * Zadnji na plošči: vse ploščice enakomerno od 15 s do 80 % runde.
 */
export function crumbleSchedule(A, cfg, w, suddenT = null) {
  const F = A.finale || { tiles: [], sudden: [] };
  const id = ([c, r]) => tileId(w, c, r);
  const out = [];
  if (cfg.mode === 'lms') {
    const all = [...F.tiles, ...(F.sudden || [])];
    const t0 = 15, t1 = Math.max(t0 + 10, cfg.roundSec * 0.8);
    all.forEach((t, k) => out.push({ i: id(t), t0: t0 + (t1 - t0) * k / all.length }));
    return out;
  }
  const start = cfg.roundSec - RULES.FINALE;
  F.tiles.forEach((t, k) => out.push({ i: id(t), t0: start + 26 * k / Math.max(1, F.tiles.length) }));
  if (suddenT != null) (F.sudden || []).forEach((t, k) => out.push({ i: id(t), t0: suddenT + 1 + RULES.SUDDEN_STEP * k }));
  return out;
}

/** Sproži krušenje do časa t (idempotentno; isti rezultat na hostu in klientih). Vrne število novih. */
export function applyCrumble(w, sched, t) {
  let n = 0;
  for (const s of sched) {
    if (s.t0 > t) continue;
    if (!w.fallTiles.has(s.i)) { w.fallTiles.set(s.i, s.t0); n++; }
  }
  return n;
}

/* ------------------------------------------------------------ korak */

/**
 * En korak (STEP) runde.
 * @param {Object} M runda
 * @param {Map<string,{x:number,z:number,d:number}>|Object} inputs zadnji vhodi (smer v svetu, d = števec pritiskov sunka)
 */
export function stepMatch(M, inputs) {
  if (M.phase === 'end') return;
  const get = id => (inputs instanceof Map ? inputs.get(id) : inputs?.[id]) || null;
  const dt = STEP;
  M.t += dt;
  advanceWorld(M.w);
  if (!M.sched) M.sched = crumbleSchedule(M.A, M.cfg, M.w, M.sudden?.t0 ?? null);
  const nc = applyCrumble(M.w, M.sched, M.t);
  if (nc) { if (!M.crumbled) M.ev.push({ type: 'finale' }); M.crumbled += nc; }
  if (M.cfg.mode !== 'lms' && !M.finaleOn && M.cfg.roundSec - M.t <= RULES.FINALE) { M.finaleOn = true; M.ev.push({ type: 'finale-start' }); }

  if (M.cfg.pickups) pickupTick(M);
  const ev = M.w.events; ev.length = 0;

  // sile med igralci (magnet), sunki duhov
  const fx = new Map();
  for (const p of M.players) {
    if (!alive(p) || p.magnetT <= 0) continue;
    let best = null, bd = RULES.MAGNET_R;
    for (const q of M.players) {
      if (q === p || !alive(q) || q.invT > 0 || !enemies(M, p, q)) continue;
      const d = Math.hypot(q.b.x - p.b.x, q.b.z - p.b.z);
      if (d < bd) { bd = d; best = q; }
    }
    if (best && bd > 0.5) {
      const k = RULES.MAGNET_F / bd;
      const f = fx.get(best) || [0, 0];
      f[0] += (p.b.x - best.b.x) * k; f[1] += (p.b.z - best.b.z) * k;
      fx.set(best, f);
    }
  }
  M.gusts = M.gusts.filter(g => M.t - g.t0 < RULES.GUST_T);
  for (const g of M.gusts) {
    for (const q of M.players) {
      if (!alive(q)) continue;
      const dx = q.b.x - g.x, dz = q.b.z - g.z, d = Math.hypot(dx, dz);
      if (d > RULES.GUST_R) continue;
      const f = fx.get(q) || [0, 0];
      f[0] += g.dx * RULES.GUST_F; f[1] += g.dz * RULES.GUST_F;
      fx.set(q, f);
    }
  }

  for (const p of M.players) {
    const inp = get(p.id) || { x: 0, z: 0, d: 0 };
    if (p.dashSeen == null) p.dashSeen = inp.d | 0;
    const pressed = (inp.d | 0) !== p.dashSeen;
    p.dashSeen = inp.d | 0;
    p.stT += dt;
    if (p.st === 'alive') {
      const b = p.b;
      if (pressed && M.cfg.dash && dash(b, inp.x, inp.z)) M.ev.push({ type: 'dash', p: p.id, x: b.x, z: b.z });
      b.forceSurf = p.iceT > 0 ? 'ice' : null;
      b.weightT = p.weightT;
      const f = fx.get(p) || [0, 0];
      stepBody(M.w, b, inp.x || 0, inp.z || 0, ev, f[0], f[1]);
      tickDash(b, dt);
      if (p.invT > 0) { p.invT -= dt; if (p.invT <= 0) { p.invT = 0; b.ghost = false; } }
      for (const k of ['weightT', 'bumperT', 'iceT', 'magnetT']) if (p[k] > 0) p[k] = Math.max(0, p[k] - dt);
      if (b.y < M.floorY - RULES.FALL_Y) fell(M, p);
    } else if (p.st === 'dead') {
      const b = p.b;
      b.vy -= P.G * dt; b.y += b.vy * dt; b.x += b.vx * dt * 0.6; b.z += b.vz * dt * 0.6;
      if (p.stT >= RULES.RESPAWN) {
        if (M.cfg.mode === 'lms' || M.sudden || p.absent) { p.st = 'out'; p.stT = 0; }
        else respawn(M, p);
      }
    } else if (p.st === 'out' && M.cfg.mode === 'lms' && M.cfg.ghosts && !p.absent && !p.bot) {
      ghostTick(M, p, inp, pressed);
    }
  }
  // dogodki fizike (vzmeti, kladiva, žage) → za zvok in učinke
  for (const e of ev) {
    if (e.type === 'bump' || e.type === 'land' || e.type === 'bumper') continue;
    const q = M.players[e.id];
    M.ev.push({ type: e.type, p: q?.id, x: q ? +q.b.x.toFixed(2) : 0, z: q ? +q.b.z.toFixed(2) : 0, ...(e.sp ? { k: (M.A.springs || []).indexOf(e.sp) } : {}) });
  }

  // trki krogla–krogla (podkoraki niso potrebni: relativni premik na korak < premer, glej teste)
  const bodies = M.players.filter(alive).map(p => p.b);
  collideAll(bodies, (a, b, hit) => onHit(M, M.players[a.id], M.players[b.id], hit));

  if (M.cfg.pickups) collectPickups(M);
  endCheck(M);
}

function onHit(M, A, B, hit) {
  if (hit.j <= 0) return;
  const t = M.t;
  const mA = A.b.dashT > 0 ? 1 : 0, mB = B.b.dashT > 0 ? 1 : 0;
  const dvA = hit.j / massOfP(A), dvB = hit.j / massOfP(B);
  const prev = new Map([[A, A.lastTouch], [B, B.lastTouch]]);
  const touch = (victim, other, recv) => {
    let by = other.id, bank = false;
    const lt = prev.get(other);
    if (lt && lt.by !== victim.id && t - lt.t < RULES.BANK && lt.recv >= RULES.BANK_V) {
      const src = byId(M, lt.by);
      if (src && enemies(M, src, victim)) { by = lt.by; bank = true; }
    }
    victim.lastTouch = { by, t, bank, recv };
  };
  touch(A, B, dvA);
  touch(B, A, dvB);
  if (A.bumperT > 0) { bumperKick(A.b, B.b, hit.nx, hit.nz); B.lastTouch = { by: A.id, t, bank: false, recv: 9 }; }
  if (B.bumperT > 0) { bumperKick(B.b, A.b, -hit.nx, -hit.nz); A.lastTouch = { by: B.id, t, bank: false, recv: 9 }; }
  if (hit.v > 1.2) {
    M.ev.push({ type: 'hit', a: A.id, b: B.id, v: +hit.v.toFixed(2), dash: mA || mB, x: +((A.b.x + B.b.x) / 2).toFixed(2), y: +((A.b.y + B.b.y) / 2).toFixed(2), z: +((A.b.z + B.b.z) / 2).toFixed(2) });
  }
}

const massOfP = p => (p.b.dashT > 0 ? 2.6 : 1) * (p.weightT > 0 ? 2.2 : 1);

/** Krogla je padla čez rob: pripiši izriv ali samomor. */
function fell(M, v) {
  const t = M.t;
  const lt = v.lastTouch;
  const killer = lt && t - lt.t <= RULES.TOUCH && lt.by !== v.id ? byId(M, lt.by) : null;
  v.deaths++;
  v.st = 'dead'; v.stT = 0;
  v.weightT = v.bumperT = v.magnetT = v.iceT = 0;
  const e = { type: 'fall', v: v.id, x: +v.b.x.toFixed(2), z: +v.b.z.toFixed(2) };
  if (killer && killer.st !== 'out') {
    if (!enemies(M, killer, v)) {
      killer.score -= 1;
      Object.assign(e, { type: 'kill', k: killer.id, team: true, pts: -1 });
    } else {
      const crown = M.cfg.gold && leaderId(M) === v.id;
      const pts = crown ? 2 : 1;
      killer.score += pts; killer.kills++;
      const revenge = killer.killedBy === v.id;
      if (revenge) { killer.revenges++; killer.killedBy = null; }
      const double = killer.lastKillT != null && t - killer.lastKillT <= RULES.DOUBLE;
      killer.lastKillT = t;
      killer.killTimes.push(t);
      const hat = killer.killTimes.filter(x => t - x <= RULES.HAT).length >= 3;
      if (hat) killer.hat++;
      const lastSec = M.cfg.mode !== 'lms' && !M.sudden && M.cfg.roundSec - t <= RULES.LAST;
      if (lastSec) killer.lastSec++;
      if (lt.bank) killer.billiards++;
      Object.assign(e, { type: 'kill', k: killer.id, pts, revenge, double, hat, lastSec, bank: !!lt.bank, crown });
    }
    v.killedBy = killer.id;
  } else {
    v.suicides++;
    const pen = M.cfg.mode === 'lms' ? 0 : (M.cfg.suicide | 0);
    v.score += pen;
    Object.assign(e, { type: 'suicide', pts: pen });
  }
  v.lastTouch = null;
  M.ev.push(e);
  if (M.sudden) suddenKill(M, e);
  if (M.cfg.mode === 'lms') v.place = M.players.filter(p => p.st !== 'out' && p.st !== 'dead').length + 1;
}

/** Ponovni prihod: izhodišče, ki je najdlje od drugih krogel (in ni zrušeno). */
export function respawn(M, p) {
  const s = bestSpawn(M, p);
  placeAt(M, p, s, RULES.INVULN);
  M.ev.push({ type: 'respawn', p: p.id, x: s[0], z: s[1] });
}

export function bestSpawn(M, p) {
  const others = M.players.filter(q => q !== p && alive(q));
  let best = null, bd = -1;
  for (const s of M.A.spawns) {
    const i = tileId(M.w, Math.floor(s[0]), Math.floor(s[1]));
    if (tileGone(M.w, i) || !hasFloor(M.w, s[0], s[1])) continue;
    let d = Infinity;
    for (const q of others) d = Math.min(d, Math.hypot(q.b.x - s[0], q.b.z - s[1]));
    if (!others.length) d = -Math.hypot(s[0] - M.bounds.mx, s[1] - M.bounds.mz);   // sam: najbližje sredini
    if (d > bd) { bd = d; best = s; }
  }
  if (!best) {
    // vse zrušeno: najbližje tlem sredine
    best = M.pickSpots.find(s => hasFloor(M.w, s[0], s[1])) || [M.bounds.mx, M.bounds.mz];
  }
  return best;
}

/* ------------------------------------------------------------ pobiralke */

function pickupTick(M) {
  M.pickups = M.pickups.filter(k => !k.taken && M.t - k.t0 < RULES.PICK_LIFE);
  if (M.t < M.nextPick) return;
  M.nextPick += RULES.PICK_EVERY;
  if (M.pickups.length >= 2) return;
  const spots = M.pickSpots.filter(s => hasFloor(M.w, s[0], s[1]) && !M.w.fallTiles.has(tileId(M.w, Math.floor(s[0]), Math.floor(s[1]))));
  if (!spots.length) return;
  const s = spots[Math.floor(rngNext(M) * spots.length)];
  const k = PICK_KINDS[Math.floor(rngNext(M) * PICK_KINDS.length)];
  const pk = { n: ++M.pickN, k, x: s[0], z: s[1], t0: M.t };
  M.pickups.push(pk);
  M.ev.push({ type: 'pick-spawn', n: pk.n, k, x: pk.x, z: pk.z });
}

function collectPickups(M) {
  for (const pk of M.pickups) {
    if (pk.taken || M.t - pk.t0 < RULES.PICK_ARM) continue;
    for (const p of M.players) {
      if (!alive(p)) continue;
      const b = p.b;
      if ((b.x - pk.x) ** 2 + (b.z - pk.z) ** 2 > (b.r + 0.45) ** 2) continue;
      const gy = groundY(M.w, pk.x, pk.z);
      if (Number.isFinite(gy) && Math.abs(b.y - b.r - gy) > 1) continue;
      pk.taken = true;
      const T = RULES.PICK_T[pk.k];
      if (pk.k === 'freeze') { for (const q of M.players) if (q !== p && alive(q) && enemies(M, p, q)) q.iceT = T; }
      else p[pk.k + 'T'] = T;
      M.ev.push({ type: 'pick', n: pk.n, k: pk.k, p: p.id });
      break;
    }
  }
}

/* ------------------------------------------------------------ duhovi (Zadnji na plošči) */

function ghostTick(M, p, inp, pressed) {
  const B = M.bounds;
  if (!p.cursor) p.cursor = [B.mx, B.mz];
  p.cursor[0] = Math.max(B.cx - B.w / 2, Math.min(B.cx + B.w / 2, p.cursor[0] + (inp.x || 0) * RULES.CURSOR_V * STEP));
  p.cursor[1] = Math.max(B.cz - B.d / 2, Math.min(B.cz + B.d / 2, p.cursor[1] + (inp.z || 0) * RULES.CURSOR_V * STEP));
  if (p.ghostCd > 0) p.ghostCd = Math.max(0, p.ghostCd - STEP);
  if (pressed && p.ghostCd <= 0) {
    p.ghostCd = RULES.GHOST_CD;
    let dx = p.cursor[0] - B.mx, dz = p.cursor[1] - B.mz;
    const m = Math.hypot(dx, dz) || 1;
    dx /= m; dz /= m;
    if (m < 0.5) { dx = 1; dz = 0; }
    const g = { x: +p.cursor[0].toFixed(2), z: +p.cursor[1].toFixed(2), dx: +dx.toFixed(3), dz: +dz.toFixed(3), t0: M.t, by: p.id };
    M.gusts.push(g);
    M.ev.push({ type: 'gust', p: p.id, x: g.x, z: g.z, dx: g.dx, dz: g.dz });
  }
}

/* ------------------------------------------------------------ konec runde, nagla smrt */

function endCheck(M) {
  const C = M.cfg;
  if (C.mode === 'lms') {
    const live = M.players.filter(p => p.st === 'alive');
    const sides = new Set(live.map(p => p.team >= 0 ? 't' + p.team : p.id));
    const timeUp = M.t >= C.roundSec;
    const over = timeUp || (M.players.length > 1 ? sides.size <= 1 : live.length === 0);
    if (over) {
      let win = live;
      if (timeUp && sides.size > 1) {
        const best = Math.max(...live.map(p => p.kills));
        win = live.filter(p => p.kills === best);
      }
      for (const p of win) { p.score += 2; p.place = 1; }
      finish(M, win.length === 1 ? win[0].id : null, win.length ? (win[0].team >= 0 ? win[0].team : null) : null, timeUp ? 'time' : 'last');
    }
    return;
  }
  if (M.sudden) {
    if (M.t - M.sudden.t0 > RULES.SUDDEN_MAX) finish(M, null, null, 'draw');
    return;
  }
  if (M.t < C.roundSec) return;
  // konec časa: izenačenje na vrhu → nagla smrt
  if (C.mode === 'teams') {
    const s = teamScores(M);
    if (s[0] !== s[1]) { finish(M, null, s[0] > s[1] ? 0 : 1, 'time'); return; }
    startSudden(M, M.players.filter(p => !p.absent).map(p => p.id));
    return;
  }
  const act = M.players.filter(p => !p.absent);
  const best = Math.max(...act.map(p => p.score));
  const top = act.filter(p => p.score === best);
  if (top.length === 1 || act.length < 2) { finish(M, (top[0] || M.players[0]).id, null, 'time'); return; }
  startSudden(M, top.map(p => p.id));
}

function startSudden(M, ids) {
  M.sudden = { t0: M.t, ids };
  M.sched = crumbleSchedule(M.A, M.cfg, M.w, M.t);
  for (const p of M.players) {
    if (!ids.includes(p.id)) { p.st = 'out'; p.stT = 0; continue; }
    if (p.st !== 'alive') respawn(M, p);
  }
  M.ev.push({ type: 'sudden', ids, t0: M.t });
}

function suddenKill(M, e) {
  const ids = M.sudden.ids;
  if (!ids.includes(e.v)) return;
  if (M.cfg.mode === 'teams') {
    const v = byId(M, e.v);
    if (e.type === 'kill' && !e.team) { const k = byId(M, e.k); finish(M, null, k.team, 'sudden'); }
    else finish(M, null, 1 - v.team, 'sudden');   // samomor ali izriv soigralca: zmaga druga ekipa
    return;
  }
  if (e.type === 'kill' && ids.includes(e.k)) { finish(M, e.k, null, 'sudden'); return; }
  // samomor (ali izriv nekoga zunaj): izpade; če ostane eden, zmaga
  M.sudden.ids = ids.filter(id => id !== e.v);
  if (M.sudden.ids.length === 1) finish(M, M.sudden.ids[0], null, 'sudden');
}

function finish(M, winner, team, reason) {
  if (M.phase === 'end') return;
  M.phase = 'end';
  M.result = { winner, team, reason };
  M.ev.push({ type: 'end', winner, team: team ?? null, reason });
}

/** Razvrstitev runde: [{ id, score, place }] (ekipe: po točkah, nato izrivih). */
export function standings(M) {
  const list = [...M.players].sort((a, b) => (b.score - a.score) || (b.kills - a.kills) || (a.deaths - b.deaths) || (a.slot - b.slot));
  const W = M.result;
  if (W?.winner) { const i = list.findIndex(p => p.id === W.winner); if (i > 0) list.unshift(...list.splice(i, 1)); }
  return list;
}

/* ------------------------------------------------------------ odsotni */

/** Igralec je odsoten več kot 20 s (umakne se iz arene) ali se je vrnil. */
export function setAbsent(M, id, absent) {
  const p = byId(M, id);
  if (!p || p.absent === absent) return;
  p.absent = absent;
  if (absent) {
    if (p.st === 'alive') { p.st = 'out'; p.b.ghost = true; p.b.y = -50; }
    else p.st = 'out';
    M.ev.push({ type: 'absent', p: id });
  } else if (p.st === 'out' && M.cfg.mode !== 'lms' && !M.sudden) {
    respawn(M, p);
  }
}

/* ------------------------------------------------------------ polno stanje (prenos hosta) */

const r2 = v => Math.round(v * 1000) / 1000;
const PF = ['id', 'name', 'bot', 'team', 'slot', 'score', 'kills', 'deaths', 'suicides', 'revenges', 'billiards', 'lastSec', 'hat',
  'st', 'stT', 'invT', 'lastTouch', 'killedBy', 'lastKillT', 'killTimes', 'weightT', 'bumperT', 'iceT', 'magnetT', 'ghostCd', 'cursor', 'absent', 'place'];

/** Polno stanje runde (JSON) — host ga pošilja vsako sekundo. */
export function serializeMatch(M) {
  return {
    v: 1, arena: M.A.id, cfg: M.cfg, t: r2(M.t), phase: M.phase, rs: M.rs, bs: M.bs,
    pickups: M.pickups, pickN: M.pickN, nextPick: M.nextPick, sudden: M.sudden, result: M.result,
    gusts: M.gusts, finaleOn: !!M.finaleOn, crumbled: M.crumbled,
    players: M.players.map(p => {
      const o = {};
      for (const k of PF) o[k] = p[k];
      const b = p.b;
      o.b = { x: r2(b.x), y: r2(b.y), z: r2(b.z), vx: r2(b.vx), vy: r2(b.vy), vz: r2(b.vz), g: b.grounded ? 1 : 0, yaw: r2(b.yaw || 0), dashT: r2(b.dashT || 0), dashCd: r2(b.dashCd || 0) };
      return o;
    }),
  };
}

/** Obnovi rundo iz polnega stanja (nov host). */
export function restoreMatch(A, S) {
  const M = createMatch({ arena: A, players: S.players.map(p => ({ id: p.id, name: p.name, bot: p.bot, team: p.team, slot: p.slot })), cfg: S.cfg, seed: 1 });
  Object.assign(M, { t: S.t, phase: S.phase, rs: S.rs, bs: S.bs, pickups: S.pickups || [], pickN: S.pickN || 0, nextPick: S.nextPick,
    sudden: S.sudden, result: S.result, gusts: S.gusts || [], finaleOn: S.finaleOn, crumbled: S.crumbled || 0 });
  M.w.t = S.t - STEP; M.w.steps = Math.round(S.t / STEP);
  advanceWorld(M.w); M.w.t = S.t;
  M.sched = crumbleSchedule(M.A, M.cfg, M.w, M.sudden?.t0 ?? null);
  applyCrumble(M.w, M.sched, M.t);
  S.players.forEach((sp, k) => {
    const p = M.players[k];
    for (const key of PF) if (key in sp) p[key] = sp[key];
    const b = p.b, s = sp.b;
    Object.assign(b, { x: s.x, y: s.y, z: s.z, vx: s.vx, vy: s.vy, vz: s.vz, grounded: !!s.g, yaw: s.yaw, dashT: s.dashT, dashCd: s.dashCd, on: null });
    b.ghost = p.invT > 0 || p.st !== 'alive';
    p.dashSeen = null;
  });
  return M;
}

/* ------------------------------------------------------------ igra (več rund) */

/** Nova igra (več rund): skupne točke in statistika. */
export function newGame(cfg, players) {
  return {
    cfg: { ...DEFAULT_CFG, ...cfg }, round: 0, arenas: [], rounds: [],
    totals: Object.fromEntries(players.map(p => [p.id, { id: p.id, name: p.name || '', bot: p.bot || 0, team: p.team ?? -1, slot: p.slot ?? 0,
      score: 0, kills: 0, deaths: 0, suicides: 0, revenges: 0, billiards: 0, lastSec: 0, hat: 0, wins: 0, roundsNoFall: 0, played: 0 }])),
  };
}

/** Prištej rundo k igri. */
export function addRound(G, M) {
  G.round++;
  G.arenas.push(M.A.id);
  const st = standings(M);
  const W = M.result || {};
  G.rounds.push({ arena: M.A.id, winner: W.winner || null, team: W.team ?? null, scores: Object.fromEntries(M.players.map(p => [p.id, p.score])) });
  for (const p of M.players) {
    const T = G.totals[p.id] || (G.totals[p.id] = { id: p.id, name: p.name, bot: p.bot, team: p.team, slot: p.slot, score: 0, kills: 0, deaths: 0, suicides: 0, revenges: 0, billiards: 0, lastSec: 0, hat: 0, wins: 0, roundsNoFall: 0, played: 0 });
    for (const k of ['score', 'kills', 'deaths', 'suicides', 'revenges', 'billiards', 'lastSec', 'hat']) T[k] += p[k];
    T.played++;
    const won = W.winner ? W.winner === p.id : (W.team != null && p.team === W.team);
    if (won) { T.wins++; if (p.deaths === 0) T.roundsNoFall++; }
  }
  return st;
}

/** Končna razvrstitev igre. Ekipe: zmagovalna ekipa je ekipa z več skupnimi točkami. */
export function gameStandings(G) {
  const list = Object.values(G.totals).sort((a, b) => (b.score - a.score) || (b.wins - a.wins) || (b.kills - a.kills) || (a.deaths - b.deaths) || (a.slot - b.slot));
  let team = null;
  if (G.cfg.mode === 'teams') {
    const s = [0, 0];
    for (const T of list) if (T.team >= 0) s[T.team] += T.score;
    team = s[0] === s[1] ? null : (s[0] > s[1] ? 0 : 1);
    if (team != null) list.sort((a, b) => ((b.team === team) - (a.team === team)) || (b.score - a.score));
  }
  return { list, team, teamScores: G.cfg.mode === 'teams' ? teamTotals(G) : null };
}
function teamTotals(G) { const s = [0, 0]; for (const T of Object.values(G.totals)) if (T.team >= 0) s[T.team] += T.score; return s; }

/** Nagrade ob koncu igre: [{ key, icon, title, text, id }]. */
export function awards(G) {
  const T = Object.values(G.totals);
  if (!T.length) return [];
  const out = [];
  const top = (k, pos = true) => {
    const vals = T.map(t => t[k]);
    const best = pos ? Math.max(...vals) : Math.min(...vals);
    if (pos && best <= 0) return null;
    const c = T.filter(t => t[k] === best);
    return c.length === 1 ? c[0] : null;
  };
  const add = (key, icon, title, t, text) => { if (t) out.push({ key, icon, title, id: t.id, text }); };
  const r = top('kills'); add('rusilec', '💥', 'Rušilec', r, r && `${r.kills} izrivov`);
  const z = T.length > 1 ? top('deaths', false) : null; add('zilavec', '🪨', 'Žilavec', z, z && `samo ${z.deaths} ${z.deaths === 1 ? 'padec' : z.deaths === 2 ? 'padca' : z.deaths < 5 ? 'padci' : 'padcev'}`);
  const k = top('suicides'); add('kamikaza', '🪂', 'Kamikaza', k, k && `${k.suicides}× sam čez rob`);
  const m = top('revenges'); add('mascevalec', '😤', 'Maščevalec', m, m && `${m.revenges} maščevanj`);
  const b = top('billiards'); add('biljardist', '🎱', 'Biljardist', b, b && `${b.billiards} izrivov z odbojem`);
  const l = top('lastSec'); add('zadnji-trenutek', '⏱️', 'Zadnji trenutek', l, l && `${l.lastSec} izrivov v zadnjih 3 s`);
  return out;
}

/** XP za igro (glej README): 20 (+5 na izriv, ≤15) +40 za zmago; solo z boti 10 brez bonusa za zmago. */
export function xpFor({ humans, kills, won }) {
  if (humans < 2) return 10;
  return 20 + Math.min(15, kills * 5) + (won ? 40 : 0);
}
