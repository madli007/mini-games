/* =====================================================================
   GNEČA — sim.js: deterministična 2D simulacija (x, z), fiksen korak
   60 Hz, brez DOM-a in brez Three.js. Naključje le iz seeda
   (začetno stanje iz shared/util.js rng = hub.rng, nato mulberry32 v
   stanju, da se da stanje hashirati in poslati kot posnetek).

   Stanje strani (moji / sovražni) je v tipiziranih poljih, gosto
   pakirano (odstranjevanje z zamenjavo z zadnjim):
     x, z, r (polmer), hp, kind (0 tekač, 1 velikan), mask (uporabljena
     vrata, bit na vrata), ph (faza za izris).

   Vnos na korak: { tx: ciljni x topa (ali null), fire: bool, giant: bool }.
   ===================================================================== */
import { B, runnerRadius } from './balance.js';
import { Grid } from './grid.js';
import { normalizeLevel, expandWaves } from './level.js';
import { rng as seedRng } from '../../shared/util.js';

const RUNNER = 0, GIANT = 1;
export { RUNNER, GIANT };

/** Privzeti parametri (nadgradnje jih spremenijo, debug drsniki tudi). */
export function defaultParams() {
  return {
    fireRate: B.cannon.fireRate,
    perShot: 1,
    bonusShots: 0,
    giantCharge: B.giant.charge,
    giantHp: B.giant.hp,
    runSpeed: B.runner.speed,
    enemySpeed: B.enemy.speed,
    sep: B.separation.strength,
    cap: B.cap,
    autoGiant: false,
  };
}

function makeSide(alloc) {
  return {
    n: 0,
    x: new Float32Array(alloc), z: new Float32Array(alloc), r: new Float32Array(alloc),
    hp: new Float32Array(alloc), kind: new Uint8Array(alloc), mask: new Uint32Array(alloc), ph: new Float32Array(alloc),
    fx: new Float32Array(alloc), fz: new Float32Array(alloc),
    spawned: 0,
  };
}

/* ------------------------------------------------------------ naključje v stanju */
function rand(st) {
  st.rs = (st.rs + 0x6d2b79f5) >>> 0;
  let t = st.rs;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Novo stanje igre.
 * @param {any} level surov ali normaliziran nivo
 * @param {{seed?:string, params?:Object}} [opt]
 */
export function createState(level, { seed = 'gneca', params = {} } = {}) {
  const L = level.__norm ? level : Object.assign(normalizeLevel(level), { __norm: true });
  const p = Object.assign(defaultParams(), params);
  const alloc = B.alloc;
  const st = {
    L, p, seed: String(seed),
    step: 0, maxSteps: Math.round(L.time * B.hz),
    rs: Math.floor(seedRng(String(seed) + ':gneca:sim')() * 4294967296) >>> 0,
    me: makeSide(alloc), en: makeSide(alloc),
    gridMe: new Grid(L.width, L.length, B.gridCell, alloc),
    gridEn: new Grid(L.width, L.length, B.gridCell, alloc),
    cannon: { x: 0, acc: 0, shots: 0, meter: 0 },
    gates: L.gates.map((g, i) => ({
      i, bit: (1 << i) >>> 0, x0: g.x, x: g.x, z: g.z, w: g.w, d: B.gate.depth, op: g.op, v: g.v,
      move: g.move, change: g.change, passes: 0, left: g.op === '-' || g.op === '+' ? g.v : 0, acc: 0, spent: false, changed: false,
    })),
    obstacles: L.obstacles.map(o => ({ ...o, x0: o.x, ang: 0 })),
    turrets: L.turrets.map(t => ({ ...t, max: t.hp, cd: 1 / t.rate, alive: true, aimX: 0, aimZ: 0 })),
    tower: { hp: L.towerHp, max: L.towerHp, z: L.length },
    waves: expandWaves(L), wi: 0,
    breach: 0,
    stats: {
      shots: 0, giants: 0, kills: 0, lostMinus: 0, lostObstacle: 0, lostTurret: 0, lostClash: 0,
      towerRunner: 0, towerGiant: 0, maxCrowd: 0, gatePasses: 0, turretsDown: 0, spawnedGate: 0,
    },
    crowd: 0, enemyCrowd: 0,
    over: null,
    events: [],
  };
  return st;
}

/* ------------------------------------------------------------ dogodki (za izris in zvok) */
function ev(st, e) { if (st.events.length < 400) st.events.push(e); }

/* ------------------------------------------------------------ dodajanje in združevanje */

/**
 * Dodaj entiteto na stran. Nad mejo (p.cap) se tekač združi v `mergeInto`
 * (ali v najbližjega topu / stolpu) — hp se sešteje, polmer zraste.
 * @returns {number} indeks nove ali združene entitete
 */
function spawn(st, S, x, z, hp, kind, mask, mergeInto = -1) {
  const hw = st.L.width / 2;
  if (S.n >= st.p.cap || S.n >= B.alloc) {
    let t = mergeInto;
    if (t < 0 || t >= S.n || S.kind[t] !== RUNNER) {
      // združi v tekača, ki je najbližje mestu nastanka (vzdolž steze)
      let best = Infinity; t = -1;
      for (let i = 0; i < S.n; i++) {
        if (S.kind[i] !== RUNNER) continue;
        const d = Math.abs(S.z[i] - z) + Math.abs(S.x[i] - x) * 0.25;
        if (d < best) { best = d; t = i; }
      }
    }
    if (t < 0) return -1;
    S.hp[t] += hp;
    S.mask[t] |= mask;
    S.r[t] = runnerRadius(S.hp[t]);
    return t;
  }
  const i = S.n++;
  const r = kind === GIANT ? (S === st.me ? B.giant.radius : B.enemyGiant.radius) : runnerRadius(hp);
  S.x[i] = Math.max(-hw + r, Math.min(hw - r, x));
  S.z[i] = z; S.r[i] = r; S.hp[i] = hp; S.kind[i] = kind; S.mask[i] = mask >>> 0;
  S.ph[i] = (S.spawned++ * 0.6180339) % 1;
  return i;
}

function remove(S, i) {
  const j = --S.n;
  if (i !== j) {
    S.x[i] = S.x[j]; S.z[i] = S.z[j]; S.r[i] = S.r[j]; S.hp[i] = S.hp[j];
    S.kind[i] = S.kind[j]; S.mask[i] = S.mask[j]; S.ph[i] = S.ph[j];
  }
}

/** Odstrani vse s hp ≤ 0 (in posodobi polmer združenih tekačev). */
function compact(S) {
  for (let i = S.n - 1; i >= 0; i--) {
    if (S.hp[i] <= 0) remove(S, i);
    else if (S.kind[i] === RUNNER && S.hp[i] > 1) S.r[i] = runnerRadius(S.hp[i]);
  }
}

/* ------------------------------------------------------------ en korak */

/**
 * Napreduj simulacijo za en korak (1/60 s).
 * @param {ReturnType<typeof createState>} st
 * @param {{tx?:number|null, fire?:boolean, giant?:boolean}} input
 */
export function step(st, input = {}) {
  if (st.over) return st;
  const dt = B.dt, L = st.L, p = st.p, hw = L.width / 2;
  st.step++;
  const t = st.step * dt;

  /* 1) gibanje vrat in ovir */
  for (const g of st.gates) if (g.move) g.x = g.x0 + g.move.amp * Math.sin(g.move.phase + t * g.move.speed);
  for (const o of st.obstacles) {
    if (o.amp) o.x = o.x0 + o.amp * Math.sin(o.phase + t * o.speed);
    o.ang += dt * (o.type === 'saw' ? 9 : o.type === 'roller' ? 4 : 0);
  }

  /* 2) top: premik in strel */
  fire(st, input, hw);

  /* 3) valovi sovražnikov */
  while (st.wi < st.waves.length && st.waves[st.wi].step <= st.step) spawnWave(st, st.waves[st.wi++]);

  /* 4) mreži, ločevanje, spopad */
  const me = st.me, en = st.en;
  st.gridMe.build(me.x, me.z, me.n);
  st.gridEn.build(en.x, en.z, en.n);
  separate(st, me, st.gridMe);
  separate(st, en, st.gridEn);
  attract(st, en, st.gridMe, -1, B.attract.enemy);
  attract(st, me, st.gridEn, 1, B.attract.mine);
  clash(st);

  /* 5) premik */
  const vMe = p.runSpeed * dt, vGiant = B.giant.speed * dt, vEn = p.enemySpeed * dt, vEnG = B.enemyGiant.speed * dt;
  for (let i = 0; i < me.n; i++) {
    if (me.hp[i] <= 0) continue;
    const r = me.r[i];
    me.z[i] += (me.kind[i] === GIANT ? vGiant : vMe) + me.fz[i] * dt;
    let x = me.x[i] + me.fx[i] * dt;
    if (x < -hw + r) x = -hw + r; else if (x > hw - r) x = hw - r;
    me.x[i] = x;
  }
  for (let i = 0; i < en.n; i++) {
    if (en.hp[i] <= 0) continue;
    const r = en.r[i];
    en.z[i] -= (en.kind[i] === GIANT ? vEnG : vEn) - en.fz[i] * dt;
    let x = en.x[i] + en.fx[i] * dt;
    if (x < -hw + r) x = -hw + r; else if (x > hw - r) x = hw - r;
    en.x[i] = x;
  }

  /* 6) ovire, vrata, stolpiči */
  obstacles(st);
  gates(st);
  turrets(st);

  /* 7) stolp in preboj */
  const reach = st.tower.z - B.tower.reach;
  for (let i = 0; i < me.n; i++) {
    if (me.hp[i] <= 0 || me.z[i] < reach) continue;
    if (me.kind[i] === GIANT) { st.tower.hp -= B.giant.towerDamage; st.stats.towerGiant += B.giant.towerDamage; }
    else { st.tower.hp -= me.hp[i]; st.stats.towerRunner += me.hp[i]; }
    ev(st, { t: 'tower', x: me.x[i], giant: me.kind[i] === GIANT });
    me.hp[i] = 0;
  }
  for (let i = 0; i < en.n; i++) {
    if (en.hp[i] <= 0 || en.z[i] > B.breachZ) continue;
    st.breach += en.kind[i] === GIANT ? B.enemyGiant.breach : en.hp[i];
    ev(st, { t: 'breach', x: en.x[i] });
    en.hp[i] = 0;
  }
  compact(me); compact(en);

  /* 8) števci in konec */
  let crowd = 0;
  for (let i = 0; i < me.n; i++) if (me.kind[i] === RUNNER) crowd += me.hp[i];
  st.crowd = crowd;
  if (crowd > st.stats.maxCrowd) st.stats.maxCrowd = crowd;
  let ec = 0;
  for (let i = 0; i < en.n; i++) ec += en.kind[i] === GIANT ? 1 : en.hp[i];
  st.enemyCrowd = ec;

  if (st.tower.hp <= 0) { st.tower.hp = 0; st.over = { won: true, reason: 'stolp', step: st.step }; ev(st, { t: 'win' }); }
  else if (st.breach >= B.breachMax) { st.over = { won: false, reason: 'preboj', step: st.step }; ev(st, { t: 'lose' }); }
  else if (st.step >= st.maxSteps) { st.over = { won: false, reason: 'cas', step: st.step }; ev(st, { t: 'lose' }); }
  return st;
}

/* ------------------------------------------------------------ top */

function fire(st, input, hw) {
  const c = st.cannon, p = st.p;
  if (typeof input.tx === 'number' && Number.isFinite(input.tx)) {
    const tx = Math.max(-hw + 0.4, Math.min(hw - 0.4, input.tx));
    const maxD = B.cannon.speed * B.dt;
    c.x += Math.max(-maxD, Math.min(maxD, tx - c.x));
  }
  const charge = Math.max(1, Math.round(p.giantCharge));
  if (c.meter >= charge && (input.giant || p.autoGiant)) {
    c.meter = 0;
    spawn(st, st.me, c.x, B.cannon.z, Math.round(p.giantHp), GIANT, 0);
    st.stats.giants++;
    ev(st, { t: 'giant', x: c.x });
  }
  if (!input.fire) { c.acc = Math.min(c.acc, 1); return; }
  c.acc += p.fireRate * B.dt;
  while (c.acc >= 1) {
    c.acc -= 1;
    const n = Math.max(1, Math.round(p.perShot)) * (c.shots < p.bonusShots ? 2 : 1);
    for (let k = 0; k < n; k++) {
      const off = n === 1 ? 0 : (k - (n - 1) / 2) * B.cannon.pairGap;
      spawn(st, st.me, c.x + off + (rand(st) - 0.5) * B.cannon.spread * 2, B.cannon.z + (rand(st) - 0.5) * 0.2, 1, RUNNER, 0);
      st.stats.shots++;
      if (c.meter < charge) c.meter++;
    }
    c.shots++;
    ev(st, { t: 'shot', x: c.x });
  }
}

/* ------------------------------------------------------------ valovi */

function spawnWave(st, w) {
  const L = st.L, en = st.en, hw = L.width / 2;
  const sp = 0.62, perRow = Math.max(3, Math.floor((L.width - 1) / sp));
  const z0 = st.tower.z - 1.6;
  for (let k = 0; k < w.n; k++) {
    const row = Math.floor(k / perRow), col = k % perRow;
    const inRow = Math.min(perRow, w.n - row * perRow);
    const x = (col - (inRow - 1) / 2) * sp + (rand(st) - 0.5) * 0.2;
    spawn(st, en, x, z0 + row * 0.5 + (rand(st) - 0.5) * 0.2, 1, RUNNER, 0);
  }
  for (let k = 0; k < w.giant; k++) {
    const x = (rand(st) - 0.5) * (L.width - 2.4);
    spawn(st, en, Math.max(-hw + 1, Math.min(hw - 1, x)), z0, w.hp, GIANT, 0);
    ev(st, { t: 'egiant', x });
  }
  ev(st, { t: 'wave', n: w.n, giant: w.giant });
}

/* ------------------------------------------------------------ ločevanje (odrivanje znotraj strani) */

function separate(st, S, grid) {
  const k = st.p.sep, dist = B.separation.dist, maxP = B.separation.maxPush;
  const xs = S.x, zs = S.z, rs = S.r, fx = S.fx, fz = S.fz, kind = S.kind;
  const head = grid.head, next = grid.next, cols = grid.cols, cs = grid.cell, gx0 = grid.x0, gz0 = grid.z0;
  const hw = st.L.width / 2;
  for (let i = 0; i < S.n; i++) {
    const x = xs[i], z = zs[i], ri = rs[i];
    let ax = 0, az = 0;
    const R = (ri + B.maxRadius) * dist;
    let c0 = Math.floor((x - R - gx0) / cs), c1 = Math.floor((x + R - gx0) / cs);
    let r0 = Math.floor((z - R - gz0) / cs), r1 = Math.floor((z + R - gz0) / cs);
    if (c0 < 0) c0 = 0; if (c1 >= cols) c1 = cols - 1;
    if (r0 < 0) r0 = 0; if (r1 >= grid.rows) r1 = grid.rows - 1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let j = head[r * cols + c]; j !== -1; j = next[j]) {
          if (j === i) continue;
          const dx = x - xs[j], dz = z - zs[j];
          const want = (ri + rs[j]) * dist;
          const d2 = dx * dx + dz * dz;
          if (d2 >= want * want) continue;
          let d = Math.sqrt(d2);
          let nx, nz;
          if (d < 1e-4) { nx = ((i * 7 + j * 13) % 11) / 5.5 - 1; nz = 0; d = 1e-4; } else { nx = dx / d; nz = dz / d; }
          // velikan odriva tekače, sam se skoraj ne premakne
          const w = kind[i] === GIANT ? (kind[j] === GIANT ? 0.5 : 0.08) : kind[j] === GIANT ? 1.6 : 1;
          const push = (want - d) / want * w;
          ax += nx * push; az += nz * push * 0.5;
        }
      }
    }
    // izogibanje robu steze
    const edge = hw - ri - 0.35;
    if (x > edge) ax -= (x - edge) * 1.5; else if (x < -edge) ax += (-edge - x) * 1.5;
    ax *= k; az *= k;
    if (ax > maxP) ax = maxP; else if (ax < -maxP) ax = -maxP;
    if (az > maxP) az = maxP; else if (az < -maxP) az = -maxP;
    fx[i] = ax; fz[i] = az;
  }
}

/* ------------------------------------------------------------ privlačnost: tekači zavijejo k nasprotniku pred sabo */

/**
 * @param {any} S stran, ki zavija
 * @param {Grid} og mreža nasprotne strani
 * @param {number} dir smer teka strani (+1 moji, -1 sovražni)
 * @param {{range:number, speed:number}} a
 */
function attract(st, S, og, dir, a) {
  if (!a.speed) return;
  const O = S === st.me ? st.en : st.me;
  if (!O.n) return;
  const R = a.range, cs = og.cell, cols = og.cols, head = og.head, next = og.next;
  for (let i = 0; i < S.n; i++) {
    const x = S.x[i], z = S.z[i];
    let best = R * R, bx = 0, found = false;
    let c0 = Math.floor((x - R - og.x0) / cs), c1 = Math.floor((x + R - og.x0) / cs);
    let r0 = Math.floor((z - R - og.z0) / cs), r1 = Math.floor((z + R - og.z0) / cs);
    if (c0 < 0) c0 = 0; if (c1 >= cols) c1 = cols - 1;
    if (r0 < 0) r0 = 0; if (r1 >= og.rows) r1 = og.rows - 1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let j = head[r * cols + c]; j !== -1; j = next[j]) {
          const dz = (O.z[j] - z) * dir;
          if (dz < -0.3) continue;          // le nasprotniki pred mano
          const dx = O.x[j] - x, d2 = dx * dx + dz * dz;
          if (d2 < best) { best = d2; bx = dx; found = true; }
        }
      }
    }
    if (found) {
      const d = Math.sqrt(best) + 0.3;
      S.fx[i] += (bx / d) * a.speed;
    }
  }
}

/* ------------------------------------------------------------ spopad (moj : sovražnik, hp proti hp) */

function clash(st) {
  const me = st.me, en = st.en, g = st.gridEn;
  const head = g.head, next = g.next, cols = g.cols, cs = g.cell, gx0 = g.x0, gz0 = g.z0;
  let fxCount = 0;
  for (let i = 0; i < me.n; i++) {
    if (me.hp[i] <= 0) continue;
    const x = me.x[i], z = me.z[i], ri = me.r[i];
    const R = ri + B.maxRadius;
    let c0 = Math.floor((x - R - gx0) / cs), c1 = Math.floor((x + R - gx0) / cs);
    let r0 = Math.floor((z - R - gz0) / cs), r1 = Math.floor((z + R - gz0) / cs);
    if (c0 < 0) c0 = 0; if (c1 >= cols) c1 = cols - 1;
    if (r0 < 0) r0 = 0; if (r1 >= g.rows) r1 = g.rows - 1;
    outer:
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let j = head[r * cols + c]; j !== -1; j = next[j]) {
          if (en.hp[j] <= 0) continue;
          const dx = x - en.x[j], dz = z - en.z[j], rr = ri + en.r[j];
          if (dx * dx + dz * dz >= rr * rr) continue;
          const m = Math.min(me.hp[i], en.hp[j]);
          me.hp[i] -= m; en.hp[j] -= m;
          st.stats.kills += m; st.stats.lostClash += m;
          if (fxCount++ < 24) ev(st, { t: 'clash', x: (x + en.x[j]) / 2, z: (z + en.z[j]) / 2, big: me.kind[i] === GIANT || en.kind[j] === GIANT });
          if (me.hp[i] <= 0) break outer;
        }
      }
    }
  }
}

/* ------------------------------------------------------------ ovire */

function obstacles(st) {
  const me = st.me, en = st.en;
  for (const o of st.obstacles) {
    if (o.type === 'fence') {
      // ograja odriva obe strani k bližjemu robu
      for (const S of [me, en]) {
        for (let i = 0; i < S.n; i++) {
          if (S.hp[i] <= 0) continue;
          const r = S.r[i];
          const dz = Math.abs(S.z[i] - o.z), dx = S.x[i] - o.x;
          if (dz > o.d / 2 + r || Math.abs(dx) > o.w / 2 + r) continue;
          S.x[i] = o.x + (dx >= 0 ? o.w / 2 + r : -o.w / 2 - r);
        }
      }
      continue;
    }
    // valjar in žaga: smrtna za moje tekače (velikan je imun)
    for (let i = 0; i < me.n; i++) {
      if (me.hp[i] <= 0 || me.kind[i] === GIANT) continue;
      const r = me.r[i];
      let hit;
      if (o.type === 'saw') { const dx = me.x[i] - o.x, dz = me.z[i] - o.z, rr = o.r + r; hit = dx * dx + dz * dz < rr * rr; }
      else hit = Math.abs(me.z[i] - o.z) < o.d / 2 + r && Math.abs(me.x[i] - o.x) < o.w / 2 + r;
      if (hit) {
        st.stats.lostObstacle += me.hp[i];
        ev(st, { t: 'cut', x: me.x[i], z: me.z[i] });
        me.hp[i] = 0;
      }
    }
  }
}

/* ------------------------------------------------------------ vrata */

function gates(st) {
  const me = st.me;
  const n0 = me.n;   // novi tekači že imajo bit teh vrat
  for (const g of st.gates) {
    if (g.spent) continue;
    const bit = g.bit, hz = g.d / 2, hwg = g.w / 2;
    for (let i = 0; i < n0; i++) {
      if (me.hp[i] <= 0 || (me.mask[i] & bit)) continue;
      if (Math.abs(me.z[i] - g.z) > hz || Math.abs(me.x[i] - g.x) > hwg) continue;
      me.mask[i] = (me.mask[i] | bit) >>> 0;
      g.passes++; st.stats.gatePasses++;
      if (me.kind[i] !== GIANT) applyGate(st, g, i);
      if (g.change && !g.changed && g.passes >= g.change.after) {
        g.changed = true;
        if (g.change.op) g.op = g.change.op;
        g.v = g.change.to;
        if (g.op === '-' || g.op === '+') g.left = g.v;
        ev(st, { t: 'gatechange', i: g.i });
      }
      if (g.spent) break;
    }
  }
}

function applyGate(st, g, i) {
  const me = st.me, h = me.hp[i], mask = me.mask[i];
  const jit = B.gate.jitter;
  if (g.op === 'x') {
    // ×N: N−1 kopij z enakim hp (združen tekač se pomnoži cel)
    for (let k = 0; k < g.v - 1; k++) {
      const x = me.x[i] + (rand(st) - 0.5) * 2 * jit, z = me.z[i] + (rand(st) - 0.5) * jit;
      spawn(st, me, x, z, h, RUNNER, mask, i);
      st.stats.spawnedGate += h;
    }
    if (g.v > 1) ev(st, { t: 'pop', x: me.x[i], z: me.z[i], i: g.i });
  } else if (g.op === '+') {
    // +N: vrata imajo zalogo N tekačev; vsak, ki gre skozi, s sabo potegne enega (združen: do svojega hp)
    const give = Math.min(h, g.left);
    if (give > 0) {
      const x = me.x[i] + (rand(st) - 0.5) * 2 * jit, z = me.z[i] + (rand(st) - 0.5) * jit;
      spawn(st, me, x, z, give, RUNNER, mask, i);
      g.left -= give; st.stats.spawnedGate += give;
      ev(st, { t: 'pop', x: me.x[i], z: me.z[i], i: g.i });
    }
    if (g.left <= 0) { g.spent = true; ev(st, { t: 'gatespent', i: g.i }); }
  } else if (g.op === '-') {
    const kill = Math.min(h, g.left);
    me.hp[i] -= kill; g.left -= kill; st.stats.lostMinus += kill;
    if (g.left <= 0) { g.spent = true; ev(st, { t: 'gatespent', i: g.i }); }
    ev(st, { t: 'minus', x: me.x[i], z: me.z[i] });
  } else if (g.op === '/') {
    g.acc += h;
    const keep = Math.floor(g.acc / g.v) - Math.floor((g.acc - h) / g.v);
    st.stats.lostMinus += h - keep;
    me.hp[i] = keep;
    if (keep < h) ev(st, { t: 'minus', x: me.x[i], z: me.z[i] });
  }
}

/* ------------------------------------------------------------ sovražni stolpiči ob stezi */

function turrets(st) {
  const me = st.me;
  for (const tu of st.turrets) {
    if (!tu.alive) continue;
    // dotik: moji tekači ga rušijo
    for (let i = 0; i < me.n && tu.alive; i++) {
      if (me.hp[i] <= 0) continue;
      const dx = me.x[i] - tu.x, dz = me.z[i] - tu.z, rr = B.turret.radius + me.r[i];
      if (dx * dx + dz * dz >= rr * rr) continue;
      if (me.kind[i] === GIANT) tu.hp -= B.giant.turretDamage;
      else { tu.hp -= me.hp[i]; me.hp[i] = 0; }
      if (tu.hp <= 0) { tu.alive = false; st.stats.turretsDown++; ev(st, { t: 'turretdown', x: tu.x, z: tu.z }); }
    }
    if (!tu.alive) continue;
    tu.cd -= B.dt;
    if (tu.cd > 0) continue;
    // strel na najbližjega mojega tekača v dosegu
    let best = tu.range * tu.range, bi = -1;
    for (let i = 0; i < me.n; i++) {
      if (me.hp[i] <= 0) continue;
      const dx = me.x[i] - tu.x, dz = me.z[i] - tu.z, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    }
    if (bi < 0) { tu.cd = 0.1; continue; }
    tu.cd = 1 / tu.rate;
    tu.aimX = me.x[bi]; tu.aimZ = me.z[bi];
    const dmg = Math.min(me.hp[bi], B.turret.damage);
    me.hp[bi] -= dmg; st.stats.lostTurret += dmg;
    ev(st, { t: 'zap', x: tu.x, z: tu.z, tx: me.x[bi], tz: me.z[bi] });
  }
}

/* ------------------------------------------------------------ hash stanja (determinizem, posnetek) */

/** FNV-1a hash stanja (8 hex znakov). */
export function hashState(st) {
  let h = 0x811c9dc5;
  const mix = v => { h ^= v; h = Math.imul(h, 0x01000193) >>> 0; };
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  const mixF = v => { f[0] = v; mix(u[0]); };
  mix(st.step); mix(st.rs); mixF(st.cannon.x); mix(st.cannon.meter); mixF(st.tower.hp); mix(st.breach);
  for (const S of [st.me, st.en]) {
    mix(S.n);
    for (let i = 0; i < S.n; i++) { mixF(S.x[i]); mixF(S.z[i]); mixF(S.hp[i]); mix(S.kind[i]); mix(S.mask[i]); }
  }
  for (const g of st.gates) { mix(g.passes); mix(g.v); mix(g.left); mix(g.acc); }
  for (const t of st.turrets) mixF(t.hp);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Preostali čas v sekundah. */
export const timeLeft = st => Math.max(0, (st.maxSteps - st.step) / B.hz);

/**
 * Dodaj enoto (testi, debug, posnetki). side: 'me' | 'en'.
 * @returns {number} indeks
 */
export function addUnit(st, side, x, z, hp = 1, kind = RUNNER, mask = 0) {
  return spawn(st, side === 'en' ? st.en : st.me, x, z, hp, kind, mask);
}
