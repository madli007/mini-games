/* =====================================================================
   Testi igre Gneča (games/gneca/) — prompts/40-gneca.md.
   Registrira jih tests/tests.js. Nivoji pridejo v ctx.gnecaLevels.
   ===================================================================== */
import * as U from '../shared/util.js';
import { B } from '../games/gneca/balance.js';
import * as SIM from '../games/gneca/sim.js';
import { validateLevel, normalizeLevel, expandWaves } from '../games/gneca/level.js';
import { scoreOf, starsOf, resultOf, gearsFor } from '../games/gneca/score.js';
import { createAutopilot } from '../games/gneca/autopilot.js';
import { dailyLevel } from '../games/gneca/daily.js';
import * as UP from '../games/gneca/upgrades.js';
import { Grid } from '../games/gneca/grid.js';

const { createState, step, hashState, addUnit, GIANT } = SIM;

/** Prazen nivo za teste (brez valov do konca). */
function lab(extra = {}) {
  return { id: 'lab', name: 'Lab', length: 60, width: 10, time: 120, towerHp: 1000, gates: [], waves: [{ t: 119, n: 0 }], stars: [1, 2], ...extra };
}
const crowd = st => { let c = 0; for (let i = 0; i < st.me.n; i++) if (st.me.kind[i] === 0) c += st.me.hp[i]; return c; };
const enemies = st => { let c = 0; for (let i = 0; i < st.en.n; i++) c += st.en.hp[i]; return c; };
/** 10 tekačev v gruči pred vrati (x okoli 0, z okoli 6). */
function put(st, n, z = 6, side = 'me', cols = 5) {
  for (let k = 0; k < n; k++) addUnit(st, side, (k % cols - (cols - 1) / 2) * 0.55, z + Math.floor(k / cols) * 0.55);
}
const run = (st, steps, input = {}) => { for (let k = 0; k < steps && !st.over; k++) { step(st, input); st.events.length = 0; } return st; };

function playAuto(level, params, seed = 't') {
  const st = createState(level, { seed, params });
  const ap = createAutopilot();
  while (!st.over) { step(st, ap(st)); st.events.length = 0; }
  return st;
}

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function gnecaTests(test, { eq, ok }) {
  test('gneca: determinizem — isti seed in vnosi → isti hash po 3000 korakih', ctx => {
    const L = ctx.gnecaLevels.find(l => l.id === 'p08');
    const go = seed => {
      const st = createState(L, { seed, params: UP.paramsFor({ rate: 2 }) });
      const r = U.rng('vnosi');
      for (let k = 0; k < 3000; k++) {
        step(st, { tx: Math.sin(k / 70) * 4 + r.range(-0.3, 0.3), fire: (k % 300) < 250, giant: k % 500 === 0 });
        st.events.length = 0;
        if (st.over) break;
      }
      return hashState(st) + ':' + st.step;
    };
    const a = go('2026-11-28'), b = go('2026-11-28'), c = go('2026-11-29');
    eq(a, b, 'hash');
    ok(a !== c, 'drug seed → drugo stanje');
  });

  test('gneca: vrata ×3 iz 10 tekačev naredijo 30, vsak (in potomec) gre skozi le enkrat', () => {
    const st = createState(lab({ gates: [{ x: 0, z: 10, w: 9, op: 'x', v: 3 }] }));
    put(st, 10);
    run(st, 90);   // ~1,5 s: vsi so šli skozi vrata
    eq(crowd(st), 30);
    for (let i = 0; i < st.me.n; i++) ok(st.me.mask[i] & 1, 'vsak ima bit vrat');
    eq(st.gates[0].passes, 10, 'potomci se ne štejejo kot novi prehodi');
    run(st, 60);
    eq(crowd(st), 30, 'brez napihovanja');
  });

  test('gneca: vrata −, ÷, + (zaloga) in spremenljiva vrata', () => {
    const one = g => { const st = createState(lab({ gates: [{ x: 0, z: 10, w: 9, ...g }] })); put(st, 10); return run(st, 90); };
    let st = one({ op: '-', v: 4 });
    eq(crowd(st), 6); eq(st.stats.lostMinus, 4); ok(st.gates[0].spent, '− je izpraznjen');
    st = one({ op: '/', v: 2 });
    eq(crowd(st), 5); eq(st.stats.lostMinus, 5);
    st = one({ op: '+', v: 5 });
    eq(crowd(st), 15); ok(st.gates[0].spent, '+ je izpraznjen');
    st = one({ op: '+', v: 50 });
    eq(crowd(st), 20, '+50: vsak potegne enega (zaloga ostane)'); eq(st.gates[0].left, 40);
    // ×2, ki po 4 prehodih postane ×1: 4 × 2 + 6 = 14
    st = one({ op: 'x', v: 2, change: { after: 4, to: 1 } });
    eq(crowd(st), 14); eq(st.gates[0].v, 1);
    // premična vrata: položaj sledi sinusu
    const mv = createState(lab({ gates: [{ x: 0, z: 10, w: 2, op: 'x', v: 2, move: { amp: 3, speed: 1 } }] }));
    run(mv, 60);
    ok(Math.abs(mv.gates[0].x - 3 * Math.sin(1)) < 1e-6, 'premik vrat');
  });

  test('gneca: spopad 1 : 1, HP velikana, škoda stolpu', () => {
    let st = createState(lab());
    put(st, 10, 10); put(st, 6, 13, 'en', 3);
    run(st, 120);
    eq(enemies(st), 0); eq(crowd(st), 4); eq(st.stats.kills, 6);
    // velikan (30 HP) proti 12 sovražnikom → 18 HP
    st = createState(lab());
    addUnit(st, 'me', 0, 8, 30, GIANT);
    put(st, 12, 12, 'en', 4);
    run(st, 240);
    eq(enemies(st), 0); eq(st.me.hp[0], 18); eq(st.me.kind[0], GIANT);
    // stolp: tekač 1, velikan 10
    st = createState(lab({ length: 40 }));
    addUnit(st, 'me', -2, 37); addUnit(st, 'me', 2, 37, 30, GIANT);
    run(st, 120);
    eq(st.tower.hp, 1000 - 1 - B.giant.towerDamage); eq(st.stats.towerGiant, B.giant.towerDamage);
  });

  test('gneca: meja živih tekačev in združevanje', () => {
    const st = createState(lab({ gates: [{ x: 0, z: 10, w: 9, op: 'x', v: 3 }] }), { params: { cap: 50 } });
    put(st, 30, 5, 'me', 10);
    run(st, 120);
    ok(st.me.n <= 50, 'n ≤ meja');
    eq(crowd(st), 90, 'hp se ohrani');
    let merged = 0;
    for (let i = 0; i < st.me.n; i++) if (st.me.hp[i] > 1) { merged++; ok(st.me.r[i] > B.runner.radius, 'združen je večji'); }
    ok(merged > 0, 'nekaj je združenih');
    // strel nad mejo se tudi združi
    const s2 = createState(lab(), { params: { cap: 20 } });
    run(s2, 300, { tx: 0, fire: true });
    ok(s2.me.n <= 20); eq(crowd(s2) + s2.stats.towerRunner, s2.stats.shots);
  });

  test('gneca: zmaga, poraz (preboj, čas) in velikan iz merilca', () => {
    let st = createState(lab({ length: 40, towerHp: 3 }));
    run(st, 900, { tx: 0, fire: true });
    ok(st.over?.won, 'zmaga'); eq(st.over.reason, 'stolp');
    st = createState(lab());
    for (let k = 0; k < 5; k++) addUnit(st, 'en', -3 + k * 1.5, 3);
    run(st, 120);
    eq(st.over?.reason, 'preboj'); ok(!st.over.won);
    st = createState(lab({ time: 20, waves: [{ t: 19, n: 0 }] }));
    run(st, 20 * 60 + 5);
    eq(st.over?.reason, 'cas');
    // velikan: merilec se polni s streli, nato gumb
    st = createState(lab(), { params: { giantCharge: 10 } });
    run(st, 120, { tx: 0, fire: true });
    eq(st.cannon.meter, 10);
    step(st, { tx: 0, fire: false, giant: true });
    eq(st.stats.giants, 1); eq(st.cannon.meter, 0);
  });

  test('gneca: točke, zvezdice, zobniki, nadgradnje', () => {
    const a = scoreOf({ won: true, timeLeft: 40.7, kills: 100, towerDamage: 300, towerMax: 300, lostMinus: 10 });
    eq(a.parts, { win: 1000, time: 800, kills: 100, tower: 500, lost: -20 });
    eq(a.total, 2380);
    eq(scoreOf({ won: false, timeLeft: 50, kills: 5, towerDamage: 150, towerMax: 300, lostMinus: 0 }).total, 255);
    eq(scoreOf({ won: false, timeLeft: 0, kills: 0, towerDamage: 0, towerMax: 300, lostMinus: 9999 }).total, 0);
    eq([starsOf(false, 9999, [1, 2]), starsOf(true, 0, [100, 200]), starsOf(true, 150, [100, 200]), starsOf(true, 200, [100, 200])], [0, 1, 2, 3]);
    eq(gearsFor({ won: true, stars: 3, prevStars: 1 }), 2 * B.gears.perStar + B.gears.perWin);
    eq(gearsFor({ won: false, stars: 0 }), 0);
    let p = UP.newProgress(); p.gears = 100;
    p = UP.buyUpgrade(p, 'rate');
    eq(p.up.rate, 1); eq(p.gears, 80);
    let err = null; try { UP.buyUpgrade({ ...p, gears: 0 }, 'rate'); } catch (e) { err = e.code; } eq(err, 'gears');
    err = null; try { UP.buyUpgrade({ ...p, up: { ...p.up, width: 1 } }, 'width'); } catch (e) { err = e.code; } eq(err, 'max');
    eq(UP.paramsFor(UP.MAX_UPGRADES), { fireRate: 13, bonusShots: 36, giantCharge: 20, giantHp: 62, perShot: 2 });
    const s = UP.sanitizeProgress({ gears: -5, up: { rate: 99 }, levels: { p01: { stars: 7 }, 'X Y': {} }, rev: 3 });
    eq([s.gears, s.up.rate, s.levels.p01.stars, Object.keys(s.levels).length, s.rev], [0, 5, 3, 1, 3]);
    const older = { ...UP.newProgress(), rev: 2 }, newer = { ...UP.newProgress(), rev: 5 };
    eq(UP.newerProgress(older, newer), newer);
  });

  test('gneca: vsi nivoji kampanje so veljavni (20 v dveh sklopih)', ctx => {
    const L = ctx.gnecaLevels;
    eq(L.length, 20);
    eq(L.filter(l => l.set === 'puscava').length, 10);
    eq(L.filter(l => l.set === 'kanjon').length, 10);
    ok(L[L.length - 1].boss, 'zadnji nivo je šef');
    for (const l of L) {
      const e = validateLevel(l);
      ok(!e.length, l.id + ': ' + e.join('; '));
      ok(expandWaves(normalizeLevel(l)).length > 0, l.id + ': valovi');
    }
    eq(new Set(L.map(l => l.id)).size, 20, 'enolični id-ji');
    // validacija ujame napake
    ok(validateLevel({ id: 'x', gates: [{ x: 4, z: 10, w: 4, op: 'x', v: 2 }], waves: [{ t: 1, n: 1 }], stars: [1, 2] }).some(e => /rob/.test(e)));
    ok(validateLevel({ id: 'x', gates: [{ x: 0, z: 10, w: 4, op: '*', v: 2 }], waves: [], stars: [2, 1] }).length >= 3);
  });

  test('gneca: autopilot zmaga vse nivoje kampanje z največjimi nadgradnjami (in prvi brez)', ctx => {
    const params = UP.paramsFor(UP.MAX_UPGRADES);
    const lost = [];
    for (const l of ctx.gnecaLevels) {
      const st = playAuto(l, params);
      if (!st.over.won) lost.push(l.id + ':' + st.over.reason);
    }
    eq(lost, []);
    const first = playAuto(ctx.gnecaLevels[0], UP.paramsFor(UP.NO_UPGRADES));
    ok(first.over.won, 'prvi nivo brez nadgradenj');
    ok(resultOf(first).stars >= 1);
  });

  test('gneca: dnevni nivo — isti seed isti nivo, veljaven, autopilot zmaga ≥ 95 % od 200 seedov', () => {
    eq(JSON.stringify(dailyLevel('2026-11-28')), JSON.stringify(dailyLevel('2026-11-28')));
    ok(JSON.stringify(dailyLevel('2026-11-28')) !== JSON.stringify(dailyLevel('2026-11-29')));
    const params = UP.paramsFor(B.dailyUpgrades);
    let wins = 0;
    const N = 200, t0 = Date.now();
    for (let d = 0; d < N; d++) {
      const seed = new Date(Date.UTC(2026, 0, 1) + d * 864e5).toISOString().slice(0, 10);
      const L = dailyLevel(seed);
      const e = validateLevel(L);
      ok(!e.length, seed + ': ' + e.join('; '));
      if (playAuto(L, params, seed).over.won) wins++;
    }
    ok(wins >= N * 0.95, `zmag ${wins}/${N}`);
    return `${wins}/${N} zmag, ${((Date.now() - t0) / 1000).toFixed(1)} s`;
  });

  test('gneca: mreža trkov najde sosede', () => {
    const g = new Grid(10, 60, 1, 100);
    const xs = new Float32Array([0, 0.5, 3, -4.9]), zs = new Float32Array([10, 10.4, 10, 59]);
    g.build(xs, zs, 4);
    const near = []; g.query(0, 10, 1, j => { near.push(j); });
    eq(near.sort(), [0, 1]);
    const far = []; g.query(-4.9, 59, 0.5, j => { far.push(j); });
    eq(far, [3]);
  });

  test('gneca: zmogljivost — 1000 korakov s 600 + 600 tekači', () => {
    const st = createState(lab({ length: 70 }), { params: { runSpeed: 0, enemySpeed: 0 } });
    for (let k = 0; k < 600; k++) addUnit(st, 'me', ((k % 15) - 7) * 0.62, 3 + Math.floor(k / 15) * 0.62);
    for (let k = 0; k < 600; k++) addUnit(st, 'en', ((k % 15) - 7) * 0.62, 67 - Math.floor(k / 15) * 0.62);
    eq(st.me.n + st.en.n, 1200);
    const t0 = Date.now();
    run(st, 1000);
    const ms = Date.now() - t0;
    ok(st.me.n === 600 && st.en.n === 600, 'vsi živi');
    ok(ms < 6000, `prepočasi: ${ms} ms`);
    return `${ms} ms (${(ms / 1000).toFixed(2)} ms/korak)`;
  });
}
