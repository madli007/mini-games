/* =====================================================================
   TESTI — fizika, dosegljivost strelov, stresni test, ball search,
   pravila (multiball, misije, wizard, konec igre) in simulirane igre z botom.
   Teče v brskalniku (tests.html) in v Node (node tests/run-node.mjs).
   ===================================================================== */
import { BR, MAXV, STEP, PHYSICS_VERSION } from '../src/engine/config.js';
import { makeGame as mk, botGame as engineBot, seeded, FRAME } from '../src/engine/bot.js';
import ALU from '../src/tables/alu/index.js';
import { SCOOP } from '../src/tables/alu/table.js';
import { goldenRun, compareGolden, GOLDEN_SEEDS } from './golden.js';

function makeGame(table = ALU) { return mk(table); }

/* ---------------- streli s flipperjev ---------------- */
const SHOT_EVENTS = ['orbit', 'rampMade', 'scoopEnter', 'drop', 'review', 'lane', 'bumper', 'rampEnter', 'spin'];

export function shotSweep({ side, steps = 60 } = {}) {
  const hits = {};
  const samples = [];
  for (let k = 0; k < steps; k++) {
    for (const variant of [0, 1, 2, 3]) {
      const { g, bus, T } = makeGame();
      g.state = 'play';
      g.time = 0;
      const seen = new Set();
      for (const ev of SHOT_EVENTS) bus.on(ev, () => seen.add(ev));
      const f = T.flippers[side === 'L' ? 0 : 1];
      // žogica prileti po inlanu, iz sredine ali se spusti iz cradla
      let x, y, vx = 0, vy = 0;
      if (variant === 0) { x = side === 'L' ? 78 : 487; y = 720; }
      else if (variant === 1) { x = side === 'L' ? 120 : 445; y = 790; vx = side === 'L' ? 120 : -120; }
      else if (variant === 2) { x = side === 'L' ? 230 : 335; y = 760; vx = side === 'L' ? -60 : 60; vy = 100; }
      else { x = side === 'L' ? 225 : 340; y = 830; }
      const b = g.newBall(x, y);
      b.vx = vx; b.vy = vy;
      g.rules.skillArmed = false;
      if (variant === 3) {
        // cradle: drži flipper, žogica se umiri, spusti, nato ponovno udari
        g.setFlipper(side, true);
        for (let i = 0; i < 90; i++) g.update(FRAME);
        g.setFlipper(side, false);
      }
      // poišči trenutek, ko je žogica na flipperju, nato pritisni z zamikom
      const delay = variant === 3 ? 0.02 + k / steps * 0.3 : k / steps * 0.5;
      let pressed = false, touchT = variant === 3 ? 0 : -1, pressT = 0, t = 0;
      while (t < 4.5) {
        const dist = Math.hypot(b.x - f.px, b.y - f.py);
        if (touchT < 0 && dist < f.len + 18 && b.y > f.py - 30) touchT = t;
        if (!pressed && touchT >= 0 && t >= touchT + delay) { g.setFlipper(side, true); pressed = true; pressT = t; }
        if (pressed && t > pressT + 0.35) g.setFlipper(side, false);
        g.update(FRAME);
        t += FRAME;
        if (!g.balls.includes(b) || b.captured) break;
        if (pressed && t > pressT + 0.5 && b.y > 880) break;
      }
      for (const ev of seen) hits[ev] = (hits[ev] || 0) + 1;
      samples.push({ variant, delay, seen: [...seen] });
    }
  }
  return { hits, samples };
}

/* ---------------- stresni test: ni tuneliranja ---------------- */
export function stressTest({ balls = 400, frames = 600, seed = 7 } = {}) {
  const rnd = seeded(seed);
  const { g, T } = makeGame();
  g.state = 'play';
  let escapes = 0, inside = 0, maxSpeed = 0;
  for (let n = 0; n < balls; n++) {
    g.balls = [];
    // naključna točka znotraj mize, izven elementov
    let x, y;
    for (;;) {
      x = 30 + rnd() * 540; y = 40 + rnd() * 900;
      if (!T.inside(x, y) || !T.inside(x + 12, y) || !T.inside(x - 12, y) || !T.inside(x, y - 12)) continue;
      if (T.bumpers.some(c => Math.hypot(x - c.x, y - c.y) < c.r + BR + 2)) continue;
      if (T.segs.some(s => s.layer !== 1 && distSeg(x, y, s) < BR + s.r + 2)) continue;
      break;
    }
    const b = g.newBall(x, y);
    const a = rnd() * Math.PI * 2, v = MAXV * (0.5 + rnd() * 0.5);
    b.vx = Math.cos(a) * v; b.vy = Math.sin(a) * v;
    for (let i = 0; i < frames / balls * 40 + 20; i++) {
      if (rnd() < 0.05) { g.setFlipper('L', rnd() < 0.5); g.setFlipper('R', rnd() < 0.5); }
      // brez gravitacijske izgube: vsake toliko spet pospeši
      if (i % 30 === 0) { const s = Math.hypot(b.vx, b.vy) || 1; const k = MAXV * (0.6 + rnd() * 0.4) / s; b.vx *= k; b.vy *= k; }
      for (let j = 0; j < 12; j++) {
        g.phys.step(STEP, g.balls);
        if (!T.inside(b.x, b.y) && b.y < 1000) { escapes++; break; }
        if (b.layer === 0 && T.bumpers.some(c => Math.hypot(b.x - c.x, b.y - c.y) < c.r * 0.8)) inside++;
        maxSpeed = Math.max(maxSpeed, Math.hypot(b.vx, b.vy));
      }
      if (b.y > 1000 || escapes) break;
    }
    if (escapes) break;
  }
  return { escapes, inside, maxSpeed };
}

function distSeg(px, py, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.ax + dx * t), py - (s.ay + dy * t));
}

/* ---------------- fizika neodvisna od fps (f2) ---------------- */
export function fpsTest() {
  const run = (dt) => {
    const { g } = makeGame();
    g.state = 'play';
    const b = g.newBall(300, 120);
    b.vx = 700; b.vy = 300;
    const steps = [];
    let k = 0;
    // po vsakem frame-u zapiši, koliko korakov fizike je bilo in kje je žogica
    while (g.time < 2.5) { g.update(dt); k++; steps.push([Math.round(g.time / STEP), b.x, b.y]); }
    return steps;
  };
  const A = run(1 / 60), B = run(1 / 165), C = run(1 / 75);   // 165 in 75 Hz: stari spremenljivi korak je dal 1/660 in 1/750 s
  // primerjaj lego po enakem številu korakov (2 s = 1440 korakov)
  const at = (L, n) => { const e = L.find(x => x[0] === n); return e ? [e[1], e[2]] : null; };
  const n = 1440, a = at(A, n), b = at(B, n), c = at(C, n);
  const d = (p, q) => p && q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : Infinity;
  return { d165: d(a, b), d75: d(a, c) };
}

/* ---------------- guma mirnega flipperja (f3): live catch ---------------- */
// žogica pade na dvignjen (držan) levi flipper; razmerje = hitrost od flipperja / hitrost proti flipperju (vzdolž normale)
export function catchTest() {
  const out = {};
  for (const v of [300, 1800]) {
    const { g, T } = makeGame();
    g.state = 'play';
    const f = T.flippers[0];
    g.setFlipper('L', true);
    for (let i = 0; i < 30; i++) g.update(FRAME);
    const a = f.up, nx = Math.sin(a), ny = -Math.cos(a);          // normala zgornje ploskve
    const x = f.px + Math.cos(a) * f.len * 0.6 + nx * 40, y = f.py + Math.sin(a) * f.len * 0.6 + ny * 40;
    const ball = g.newBall(x, y);
    ball.vx = -nx * v; ball.vy = -ny * v;
    let into = 0, away = 0, k = -1;
    for (let i = 0; i < 300; i++) {
      const vn0 = ball.vx * nx + ball.vy * ny;
      g.update(1 / 720);
      const vn = ball.vx * nx + ball.vy * ny;
      if (k < 0 && vn0 < 0 && vn > vn0 + 1) { into = -vn0; k = i; }
      if (k >= 0 && i - k < 4) away = Math.max(away, vn);
    }
    out['v' + v] = +(away / (into || 1)).toFixed(3);
  }
  return out;
}

/* ---------------- ball search ---------------- */
export function stuckTest() {
  const { g, bus, T } = makeGame();
  g.state = 'play';
  // umetna past: V-žep sredi mize
  T.seg(260, 380, 285, 405, { r: 3 });
  T.seg(285, 405, 310, 380, { r: 3 });
  const b = g.newBall(285, 388);
  let searched = 0;
  bus.on('ballSearch', () => searched++);
  let t = 0;
  let freed = false;
  while (t < 12) {
    g.update(FRAME); t += FRAME;
    if (b.y > 430 || b.y < 350) { freed = true; break; }
  }
  return { searched, freed, t };
}

/* ---------------- rampa ---------------- */
export function rampTest() {
  const out = [];
  for (const speed of [800, 1300, 1800, 2400, 3000]) {
    const { g, bus } = makeGame();
    g.state = 'play';
    const ev = [];
    for (const n of ['rampEnter', 'rampMade', 'rampExit', 'rampFail', 'inlane']) bus.on(n, () => ev.push(n));
    const b = g.newBall(190, 600);
    b.vx = -speed * 0.08; b.vy = -speed;
    let t = 0;
    while (t < 4 && g.balls.includes(b)) { g.update(FRAME); t += FRAME; }
    out.push({ speed, ev: [...new Set(ev)], exitSpeed: Math.round(Math.hypot(b.vx, b.vy)) });
  }
  return out;
}

/* ---------------- pravila ---------------- */
export function rulesTest(seed = 5) {
  const save = Math.random;
  Math.random = seeded(seed);        // determinizem (prej je test občasno padel)
  try { return rulesTestInner(); } finally { Math.random = save; }
}
function rulesTestInner() {
  const res = [];
  const ok = (name, cond) => res.push({ name, ok: !!cond });
  const { g, bus, T } = makeGame();
  const R = g.rules;
  const ev = {};
  bus.on('*', (d, n) => { ev[n] = (ev[n] || 0) + 1; });
  const run = (sec) => { for (let t = 0; t < sec; t += FRAME) g.update(FRAME); };
  const ballToScoop = () => {
    const b = g.balls.find(x => !x.captured && !g.inPlunger(x)) || g.newBall(SCOOP.x, SCOOP.y - 30);
    b.x = SCOOP.x; b.y = SCOOP.y; b.vx = 0; b.vy = 0; b.saucerCool = 0; b.layer = 0;
    g.captureSaucer('scoop', b, true);
  };
  const launchAll = () => { g.plungerHeld = true; run(0.5); g.plungerUp(); run(1.0); };

  g.startGame();
  ok('igra se začne', g.state === 'play' && g.balls.length === 1);
  launchAll();
  ok('izstrelitev', ev.launch >= 1);

  // misija 1 (prižgana ob začetku) — Talina
  ballToScoop();
  ok('misija se začne', R.mode && R.mode.def.id === 'talina');
  run(3);
  for (let i = 0; i < 18; i++) g.bumper(T.bumpers[i % 3], g.balls[0]);
  ok('talina opravljena', R.modesDone[0] && !R.mode);

  // multiball: 2× BUG + 2× lock
  const dropAll = () => { for (const d of T.drops) { if (d.active) g.hitDrop(d); } run(1.5); };
  dropAll();
  ok('lock prižgan', R.lockLit);
  ballToScoop();
  run(2);
  ok('lock 1', R.locks === 1);
  launchAll();
  dropAll();
  ballToScoop();
  run(4);
  ok('multiball se začne s 3 žogicami', R.mb && g.live === 3);
  R.onOrbit();
  R.onRampMade();
  ok('jackpota', ev.jackpot === 2 && R.mb.superLit);
  ballToScoop(); run(3);
  ok('super jackpot', ev.superJackpot === 1);
  // izgubi 2 žogici po izteku ball save
  g.ballSaveUntil = 0;
  for (let k = 0; k < 10 && R.mb; k++) { g.ballSaveUntil = 0; const b = g.balls.find(x => !x.captured); if (b && g.live > 1) g.drain(b); run(0.5); }
  ok('multiball se konča', !R.mb && ev.multiballEnd === 1 && g.live === 1);

  // misije 2–4 (lightMode + start + izpolnitev)
  for (const id of ['valjarna', 'hotfix', 'sprint']) {
    R.lightMode(true);
    ballToScoop(); run(3);
    ok('start ' + id, R.mode && R.mode.def.id === id);
    if (id === 'valjarna') { for (let i = 0; i < 9; i++) R.onOrbit(); }
    if (id === 'hotfix') { run(3); R.onRampMade(); }
    if (id === 'sprint') {
      ballToScoop(); run(1.5);
      R.onOrbit(); R.onRampMade(); for (const d of T.drops) if (d.active) { g.hitDrop(d); break; }
      R.onReview(T.review, 282, 430);
    }
    ok(id + ' opravljena', R.modesDone[['talina', 'valjarna', 'hotfix', 'sprint'].indexOf(id)]);
    run(1.5);
  }
  ok('wizard prižgan', R.wizardLit);
  ballToScoop(); run(6.5);
  ok('wizard multiball 4 žogice (' + g.live + ',' + !!R.wiz + ')', R.wiz && g.live >= 4);
  R.onRampMade(); R.onOrbit();
  ok('wizard jackpoti', ev.jackpot >= 4);
  for (let k = 0; k < 10 && R.wiz; k++) {
    g.ballSaveUntil = 0;
    const b = g.balls.find(x => !x.captured);
    if (b && g.live > 1) g.drain(b);
    run(0.5);
  }
  ok('wizard se konča', !R.wiz && ev.wizardEnd === 1 && R.modeLit && R.modesDone.every(x => !x));

  // časovnik misije poteče
  R.lightMode(true);
  ballToScoop(); run(3);
  const id0 = R.mode && R.mode.def.id;
  run(60);
  ok('misija poteče (' + id0 + ')', !R.mode && ev.modeFail >= 1);

  // konec igre: odtečejo vse žogice
  g.extraBalls = 0;
  let guard = 0;
  while (g.state !== 'over' && guard++ < 20) {
    g.ballSaveUntil = 0;
    for (const b of g.balls.slice()) g.drain(b);
    run(4);
  }
  ok('konec igre', g.state === 'over' && ev.gameOver === 1);
  return res;
}

/* ---------------- bot: simulirane igre ---------------- */
export function botGame(seed = 1, skill = 0.75, trace = null, table = ALU) {
  return engineBot({ table, seed, skill, trace });
}

/* ---------------- vse skupaj ---------------- */
export function runAll(log = console.log, { games = 12, golden = undefined, goldenStrict = typeof process !== 'undefined' } = {}) {
  const results = [];
  const check = (name, ok, info = '') => { results.push({ name, ok }); log((ok ? '✔ ' : '✘ ') + name + (info ? '  — ' + info : '')); };

  const L = shotSweep({ side: 'L' }), R = shotSweep({ side: 'R' });
  log('Levi flipper: ' + JSON.stringify(L.hits));
  log('Desni flipper: ' + JSON.stringify(R.hits));
  const any = ev => (L.hits[ev] || 0) + (R.hits[ev] || 0);
  const top = s => s.samples.filter(x => x.seen.some(e => ['lane', 'bumper', 'orbit', 'rampMade', 'review'].includes(e))).length;
  check('levi flipper doseže zgornji del mize', top(L) > 5, top(L) + ' strelov');
  check('desni flipper doseže zgornji del mize', top(R) > 5, top(R) + ' strelov');
  for (const ev of ['orbit', 'rampMade', 'scoopEnter', 'drop', 'review', 'bumper']) check('dosegljivo: ' + ev, any(ev) > 0, String(any(ev)));

  const rt = rampTest();
  log('Rampa: ' + JSON.stringify(rt));
  check('šibak strel na rampo pade nazaj', rt[0].ev.includes('rampFail') && !rt[0].ev.includes('rampMade'));
  check('močan strel prevozi rampo do inlana', rt.slice(2).every(r => r.ev.includes('rampMade') && r.ev.includes('rampExit')));

  const st = stressTest();
  check('stresni test: brez pobega iz mize', st.escapes === 0, JSON.stringify(st));
  check('stresni test: brez prodora v bumper', st.inside === 0);

  const fp = fpsTest();
  check('fizika enaka pri 60, 75 in 165 Hz (fiksni korak)', fp.d165 < 1e-6 && fp.d75 < 1e-6, JSON.stringify(fp));

  const lc = catchTest();
  check('mirni flipper: počasna žogica odskoči, hitra se ujame (live catch)', lc.v300 > 0.27 && lc.v1800 < 0.22 && lc.v1800 < lc.v300 - 0.08, JSON.stringify(lc));

  const sk = stuckTest();
  check('ball search sprosti zataknjeno žogico', sk.freed && sk.searched > 0, JSON.stringify(sk));

  for (const r of rulesTest()) check('pravila: ' + r.name, r.ok);

  const seeds = [];
  for (let i = 0; i < games; i++) seeds.push(1000 + i * 17);
  const gold = goldenRun((seed, tr) => botGame(seed, 0.75, tr), PHYSICS_VERSION, seeds);
  const gs = gold.raw;
  for (const x of gs) { const { events, ...rest } = x; log('bot ' + JSON.stringify(rest)); }
  if (golden !== undefined) {
    if (seeds.length < GOLDEN_SEEDS.length) log('zlati test preskočen (premalo iger)');
    else {
      const diffs = compareGolden({ physicsVersion: gold.physicsVersion, games: gold.games.slice(0, GOLDEN_SEEDS.length) }, golden);
      for (const d of diffs.slice(0, 20)) log('   ' + d);
      // posnetek je narejen v Node; brskalniki imajo lahko drugačne Math.sin/exp … → v brskalniku je zlati test samo informativen
      if (goldenStrict) check('zlati test (fizika f' + PHYSICS_VERSION + ')', diffs.length === 0, diffs.length ? diffs.length + ' razlik' : '12 iger enako');
      else log((diffs.length ? 'ℹ zlati test: ' + diffs.length + ' razlik (posnetek je iz Node, brskalnik ima druge Math.* funkcije)' : 'ℹ zlati test: 12 iger enako kot v Node'));
    }
  }
  const avg = k => gs.reduce((a, x) => a + x[k], 0) / gs.length;
  log(`povprečje: ${Math.round(avg('sec'))} s, ${Math.round(avg('score')).toLocaleString('sl-SI')} točk, misij ${avg('modes').toFixed(2)}, multiballov ${avg('multiballs').toFixed(2)}, ramp ${avg('ramps').toFixed(1)}`);
  check('vse igre se končajo', gs.every(x => x.over));
  check('brez pobegov med igrami', gs.every(x => x.escapes === 0));
  check('povprečna igra 2–10 min (bot)', avg('sec') > 120 && avg('sec') < 600, Math.round(avg('sec')) + ' s');
  const fails = results.filter(r => !r.ok).length;
  log(fails ? `NEUSPELO: ${fails} / ${results.length}` : `VSI TESTI USPEŠNI (${results.length})`);
  return { results, fails, games: gs };
}
