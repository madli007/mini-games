/* =====================================================================
   TESTI — fizika, dosegljivost strelov, stresni test, ball search,
   pravila (multiball, misije, wizard, konec igre) in simulirane igre z botom.
   Teče v brskalniku (tests.html) in v Node (node tests/run-node.mjs).
   ===================================================================== */
import { Bus } from '../src/bus.js';
import { buildTable, insideTable, PLUNGER_Y, SCOOP } from '../src/table.js';
import { Game } from '../src/rules.js';
import { BR, MAXV, STEP, PHYSICS_VERSION } from '../src/config.js';
import { goldenRun, compareGolden, GOLDEN_SEEDS } from './golden.js';

const FRAME = 1 / 60;

function makeGame() {
  const bus = new Bus();
  const T = buildTable();
  const g = new Game(T, bus);
  return { g, bus, T };
}

/* ---------------- deterministični naključni generator ---------------- */
function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

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
      g.skillArmed = false;
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
      if (!insideTable(x, y) || !insideTable(x + 12, y) || !insideTable(x - 12, y) || !insideTable(x, y - 12)) continue;
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
        if (!insideTable(b.x, b.y) && b.y < 1000) { escapes++; break; }
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
export function rulesTest() {
  const res = [];
  const ok = (name, cond) => res.push({ name, ok: !!cond });
  const { g, bus, T } = makeGame();
  const ev = {};
  bus.on('*', (d, n) => { ev[n] = (ev[n] || 0) + 1; });
  const run = (sec) => { for (let t = 0; t < sec; t += FRAME) g.update(FRAME); };
  const ballToScoop = () => {
    const b = g.balls.find(x => !x.captured && !g.inPlunger(x)) || g.newBall(SCOOP.x, SCOOP.y - 30);
    b.x = SCOOP.x; b.y = SCOOP.y; b.vx = 0; b.vy = 0; b.scoopCool = 0; b.layer = 0;
    g.onScoop(b, true);
  };
  const launchAll = () => { g.plungerHeld = true; run(0.5); g.plungerUp(); run(1.0); };

  g.startGame();
  ok('igra se začne', g.state === 'play' && g.balls.length === 1);
  launchAll();
  ok('izstrelitev', ev.launch >= 1);

  // misija 1 (prižgana ob začetku) — Talina
  ballToScoop();
  ok('misija se začne', g.mode && g.mode.def.id === 'talina');
  run(3);
  for (let i = 0; i < 18; i++) g.bumper(T.bumpers[i % 3], g.balls[0]);
  ok('talina opravljena', g.modesDone[0] && !g.mode);

  // multiball: 2× BUG + 2× lock
  const dropAll = () => { for (const d of T.drops) { if (d.active) g.onDrop(d); } run(1.5); };
  dropAll();
  ok('lock prižgan', g.lockLit);
  ballToScoop();
  run(2);
  ok('lock 1', g.locks === 1);
  launchAll();
  dropAll();
  ballToScoop();
  run(4);
  ok('multiball se začne s 3 žogicami', g.mb && g.live === 3);
  g.onOrbit();
  g.onRamp();
  ok('jackpota', ev.jackpot === 2 && g.mb.superLit);
  ballToScoop(); run(3);
  ok('super jackpot', ev.superJackpot === 1);
  // izgubi 2 žogici po izteku ball save
  g.ballSaveUntil = 0;
  for (let k = 0; k < 10 && g.mb; k++) { g.ballSaveUntil = 0; const b = g.balls.find(x => !x.captured); if (b && g.live > 1) g.drain(b); run(0.5); }
  ok('multiball se konča', !g.mb && ev.multiballEnd === 1 && g.live === 1);

  // misije 2–4 (lightMode + start + izpolnitev)
  for (const id of ['valjarna', 'hotfix', 'sprint']) {
    g.lightMode(true);
    ballToScoop(); run(3);
    ok('start ' + id, g.mode && g.mode.def.id === id);
    if (id === 'valjarna') { for (let i = 0; i < 9; i++) g.onOrbit(); }
    if (id === 'hotfix') { run(3); g.onRamp(); }
    if (id === 'sprint') {
      ballToScoop(); run(1.5);
      g.onOrbit(); g.onRamp(); for (const d of T.drops) if (d.active) { g.onDrop(d); break; }
      g.onReview(T.review, 282, 430);
    }
    ok(id + ' opravljena', g.modesDone[['talina', 'valjarna', 'hotfix', 'sprint'].indexOf(id)]);
    run(1.5);
  }
  ok('wizard prižgan', g.wizardLit);
  ballToScoop(); run(6.5);
  ok('wizard multiball 4 žogice (' + g.live + ',' + !!g.wiz + ')', g.wiz && g.live >= 4);
  g.onRamp(); g.onOrbit();
  ok('wizard jackpoti', ev.jackpot >= 4);
  for (let k = 0; k < 10 && g.wiz; k++) {
    g.ballSaveUntil = 0;
    const b = g.balls.find(x => !x.captured);
    if (b && g.live > 1) g.drain(b);
    run(0.5);
  }
  ok('wizard se konča', !g.wiz && ev.wizardEnd === 1 && g.modeLit && g.modesDone.every(x => !x));

  // časovnik misije poteče
  g.lightMode(true);
  ballToScoop(); run(3);
  const id0 = g.mode && g.mode.def.id;
  run(60);
  ok('misija poteče (' + id0 + ')', !g.mode && ev.modeFail >= 1);

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
export function botGame(seed = 1, skill = 0.75, trace = null) {
  const rnd = seeded(seed);
  const save = Math.random;
  Math.random = rnd;               // determinizem
  const { g, bus, T } = makeGame();
  const ev = {};
  let frame = 0;
  bus.on('*', (d, n) => { ev[n] = (ev[n] || 0) + 1; if (trace) trace(n, g.score, frame); });
  g.startGame();
  let t = 0;
  const hold = { L: 0, R: 0 };
  let plungeT = 0.5 + rnd();
  let nudgeCd = 0;
  while (g.state !== 'over' && t < 1800) {
    // plunger
    if (g.ballWaiting()) {
      plungeT -= FRAME;
      if (plungeT <= 0 && !g.plungerHeld) { g.plungerDown(); hold.p = 0.5 + rnd() * 0.5; }
      if (g.plungerHeld && g.plungerPull >= (hold.p || 1)) { g.plungerUp(); plungeT = 0.6 + rnd(); }
    }
    // flipperji: pritisni, ko je žogica v dosegu in pada
    for (const f of T.flippers) {
      const s = f.side;
      if (hold[s] > 0) { hold[s] -= FRAME; if (hold[s] <= 0) g.setFlipper(s, false); continue; }
      for (const b of g.balls) {
        if (b.captured || b.layer !== 0) continue;
        const tipX = f.px + Math.cos(f.rest) * f.len;
        const inX = s === 'L' ? (b.x > f.px - 20 && b.x < tipX + 18) : (b.x < f.px + 20 && b.x > tipX - 18);
        if (inX && b.y > f.py - 45 && b.y < f.py + 20 && b.vy > -50) {
          if (rnd() < skill) {
            // zamik zadetka naključen → različni streli
            g.setFlipper(s, true);
            hold[s] = 0.15 + rnd() * 0.2;
          }
          break;
        }
      }
    }
    // občasno tresenje, ko gre žogica v outlane
    nudgeCd -= FRAME;
    if (nudgeCd <= 0 && g.balls.some(b => b.y > 760 && (b.x < 60 || b.x > 505) && b.vy > 0) && rnd() < 0.3) {
      g.nudge(); nudgeCd = 1.5;
    }
    g.update(FRAME);
    t += FRAME;
    frame++;
  }
  Math.random = save;
  return {
    seed, sec: Math.round(t), frames: frame, events: ev, score: g.score, over: g.state === 'over',
    modes: g.modesCompleted, wizards: g.wizards, multiballs: ev.multiball || 0, jackpots: ev.jackpot || 0,
    ramps: ev.rampMade || 0, orbits: ev.orbit || 0, scoops: ev.scoopEnter || 0, drains: ev.drain || 0,
    modeStarts: ev.modeStart || 0, extraBalls: ev.extraBall || 0, searches: ev.ballSearch || 0,
    escapes: ev.escape || 0, tilts: ev.tilt || 0, mystery: ev.mystery || 0, kickbacks: ev.kickback || 0, maxCombo: g.maxCombo,
  };
}

/* ---------------- vse skupaj ---------------- */
export function runAll(log = console.log, { games = 12, golden = undefined } = {}) {
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
      check('zlati test (fizika f' + PHYSICS_VERSION + ')', diffs.length === 0, diffs.length ? diffs.length + ' razlik' : '12 iger enako');
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
