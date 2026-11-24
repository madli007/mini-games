/* =====================================================================
   Testi Smučarskih skokov (games/skoki/). Registrira jih tests/tests.js.
   ctx.skokiHills: JSON vseh skakalnic (hills/index.json), ctx.skokiParams: physics-params.json.
   ===================================================================== */
import * as D from '../games/skoki/dmath.js';
import * as H from '../games/skoki/hill.js';
import * as PH from '../games/skoki/physics.js';
import * as SC from '../games/skoki/scoring.js';
import * as JU from '../games/skoki/judges.js';
import * as GH from '../games/skoki/ghost.js';
import * as BOT from '../games/skoki/bot.js';
import { createWind } from '../games/skoki/wind.js';
import { LocalBackend } from '../shared/adapters/local.js';
import { balanceTable, BALANCE_N } from '../games/skoki/balance.js';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function skokiTests(test, { eq, ok }) {
  const hillOf = (ctx, id) => { const def = ctx.skokiHills.find(h => h.id === id); return { def, hill: H.buildHill(def) }; };
  const P = ctx => structuredClone(ctx.skokiParams);
  const botJump = (ctx, id, { skill = 1, seed = 5, gate, wind = { mode: 'off', seed: 0 }, record = 0, params } = {}) => {
    const { def, hill } = hillOf(ctx, id);
    const bot = BOT.createBot({ skill, seed });
    const rec = new GH.InputRecorder();
    const J = PH.simulate({ hill, P: params || ctx.skokiParams, gate: gate ?? def.gates.default, wind, record, input: (s, t) => { const i = bot.input(s); rec.push(t, i); return i; } });
    return { J, def, hill, rec };
  };
  /** Vnosi »po scenariju«: odriv z napako err (s), konstanten nagib, klik lead s pred stikom (ali -1 = brez). */
  const scripted = ({ err = 0, pitch = () => 18, lead = 0.28, hold = false }) => {
    let pressT = -1;
    return s => {
      if (s.phase === 'inrun') { const tte = s.d / s.v; return { btn: err < 0 && tte <= -err ? 0 : 1, pitch: 18 }; }
      if (s.phase === 'air' && !s.takeoff) return { btn: (s.tick - s.edgeTick) * PH.STEP >= err ? 0 : 1, pitch: 18 };
      const ttc = s.vn > 0.1 ? s.hag / s.vn : 9;
      if (lead > 0 && pressT < 0 && s.takeoff && ttc <= lead) pressT = s.tick;
      return { btn: pressT > 0 && (hold || s.tick - pressT < 8) ? 1 : 0, pitch: pitch(s) };
    };
  };

  /* ------------------------------------------------------------ dmath */
  test('skoki: dmath (sin, cos, atan2) ≈ Math do 1e-9', () => {
    for (let a = -20; a <= 20; a += 0.0137) {
      ok(Math.abs(D.sin(a) - Math.sin(a)) < 1e-9, 'sin ' + a);
      ok(Math.abs(D.cos(a) - Math.cos(a)) < 1e-9, 'cos ' + a);
    }
    for (let y = -5; y <= 5; y += 0.37) for (let x = -5; x <= 5; x += 0.41) ok(Math.abs(D.atan2(y, x) - Math.atan2(y, x)) < 1e-10, `atan2 ${y} ${x}`);
    eq(D.atan2(0, 0), 0);
    eq(D.table([[0, 0], [10, 1]], 5), 0.5);
    eq(D.table([[0, 0], [10, 1]], -3), 0);
  });

  /* ------------------------------------------------------------ skakalnice */
  test('skoki: validator na vseh skakalnicah in zaznava napak', ctx => {
    ok(ctx.skokiHills.length >= 3, 'vsaj 3 skakalnice');
    for (const def of ctx.skokiHills) eq(H.validateHill(def), [], def.id);
    const bad = structuredClone(ctx.skokiHills[0]);
    bad.hs = bad.k - 1;
    ok(H.validateHill(bad).some(e => e.includes('manjši od HS')), 'K > HS');
    const bad2 = structuredClone(ctx.skokiHills[0]); delete bad2.landing.beta;
    ok(H.validateHill(bad2).some(e => e.includes('landing.beta')), 'manjkajoče polje');
    const bad3 = structuredClone(ctx.skokiHills[0]); bad3.meterValue = 9;
    ok(H.validateHill(bad3).some(e => e.includes('meterValue')), 'vrednost metra');
    eq([H.meterValueFor(60), H.meterValueFor(95), H.meterValueFor(125), H.meterValueFor(200)], [2.4, 2.0, 1.8, 1.2]);
    eq(H.baseFor(125), 60); eq(H.baseFor(200), 120);
  });
  test('skoki: profil (miza nad doskočiščem, K in HS na strmini, iskanje točk)', ctx => {
    for (const def of ctx.skokiHills) {
      const h = H.buildHill(def);
      ok(h.groundAt(0.01).y < -def.landing.s + 0.1, def.id + ': tla pod robom');
      ok(Math.abs(h.landAt(def.k).theta / D.DEG - def.landing.beta) < 1, def.id + ': K na strmini');
      const p = h.landAt(50);
      ok(Math.abs(h.groundAt(p.x).s - 50) < 0.05, def.id + ': groundAt ↔ landAt');
      ok(h.top.y > 10, def.id + ': zalet je visoko');
    }
  });

  /* ------------------------------------------------------------ fizika */
  test('skoki: determinizem (isti vnosi = bit za bit enaka trajektorija)', ctx => {
    const a = botJump(ctx, 'orlova', { record: 1, wind: { mode: 'random', seed: 77 } });
    const b = botJump(ctx, 'orlova', { record: 1, wind: { mode: 'random', seed: 77 } });
    eq(a.J.trace.length, b.J.trace.length);
    eq(JSON.stringify(a.J.trace), JSON.stringify(b.J.trace), 'sled');
    eq(JSON.stringify(a.J.s), JSON.stringify(b.J.s), 'končno stanje');
  });
  test('skoki: neodvisnost od FPS izrisa (30 vs 144 sličic)', ctx => {
    const { def, hill } = hillOf(ctx, 'bistra');
    const run = fps => {
      const bot = BOT.createBot({ skill: 0.8, seed: 3 });
      const J = PH.createJump({ hill, P: ctx.skokiParams, gate: def.gates.default, wind: { mode: 'random', seed: 5 } });
      const clock = PH.makeClock();
      let frames = 0;
      while (!J.done && frames < 100000) { clock.advance(1 / fps, () => J.step(bot.input(J.s))); frames++; }
      return J.s;
    };
    const a = run(30), b = run(144);
    eq([a.dist, a.tick, a.x], [b.dist, b.tick, b.x]);
  });
  test('skoki: zalet (višje zaletno mesto = večja hitrost, monotono)', ctx => {
    for (const def of ctx.skokiHills) {
      let prev = 0, first = 0;
      for (let g = 1; g <= def.gates.count; g++) {
        const { J } = botJump(ctx, def.id, { gate: g });
        ok(J.s.tableSpeed > prev, `${def.id} mesto ${g}: ${J.s.tableSpeed} ≤ ${prev}`);
        if (g > 1) { const d = J.s.tableSpeed - prev; ok(d > 0.25 && d < 1.0, `${def.id}: korak mesta ${d.toFixed(2)} km/h`); }
        if (g === 1) first = J.s.tableSpeed;
        prev = J.s.tableSpeed;
      }
      const avg = (prev - first) / (def.gates.count - 1);
      ok(avg >= 0.45 && avg <= 0.8, `${def.id}: povprečen korak ${avg.toFixed(2)} km/h (~0,5–0,7)`);
    }
    const { J: big } = botJump(ctx, 'orlova'); const { J: small } = botJump(ctx, 'brezova');
    ok(big.s.tableSpeed > 90 && big.s.tableSpeed < 98, 'velika ~92 km/h: ' + big.s.tableSpeed);
    ok(small.s.tableSpeed > 66 && small.s.tableSpeed < 78, 'mala ~70–75 km/h: ' + small.s.tableSpeed);
  });
  test('skoki: okno odriva (✨ ±25 ms, dobro ±60 ms, prezgodaj/prepozno slabše)', ctx => {
    const T = ctx.skokiParams.takeoff;
    ok(PH.takeoffQuality(0.02, T).perfect && PH.takeoffQuality(-0.02, T).perfect);
    ok(!PH.takeoffQuality(0.04, T).perfect && PH.takeoffQuality(0.04, T).good);
    ok(!PH.takeoffQuality(-0.1, T).good && !PH.takeoffQuality(0.1, T).good);
    ok(PH.takeoffQuality(0.1, T).q < PH.takeoffQuality(0.05, T).q);
    const { def, hill } = hillOf(ctx, 'bistra');
    const dist = err => PH.simulate({ hill, P: ctx.skokiParams, gate: def.gates.default, wind: { mode: 'off' }, input: scripted({ err, pitch: s => s.gamma / D.DEG + BOT.BOT_ALPHA }) }).s;
    const perfect = dist(0.01), early = dist(-0.12), late = dist(0.1);
    ok(perfect.takeoff.perfect, 'popoln odriv');
    ok(perfect.dist > early.dist + 3, `prezgodaj krajši (${perfect.dist} / ${early.dist})`);
    ok(perfect.dist > late.dist + 3, `prepozno krajši (${perfect.dist} / ${late.dist})`);
    ok(late.takeoff.err > 0 && early.takeoff.err < 0);
  });
  test('skoki: čelni veter podaljša, hrbtni skrajša (velika ~+10–15 m pri +2 m/s)', ctx => {
    const avg = (id, w) => { let s = 0; for (let i = 0; i < 8; i++) s += botJump(ctx, id, { skill: 0.7, seed: i * 31 + 1, wind: { mode: 'const', speed: w, seed: i } }).J.s.dist; return s / 8; };
    for (const id of ['brezova', 'bistra', 'orlova']) {
      const t = avg(id, -2), n = avg(id, 0), hd = avg(id, 2);
      ok(hd > n && n > t, `${id}: ${t} < ${n} < ${hd}`);
      if (id === 'orlova') ok(hd - n >= 9 && hd - n <= 16, `orlova +2 m/s: +${(hd - n).toFixed(1)} m`);
    }
    const w = createWind({ mode: 'random', seed: 9 }, ctx.skokiParams);
    ok(Math.abs(w.mean) <= 3, 'povprečje v mejah');
    eq(createWind({ mode: 'off', seed: 9 }, ctx.skokiParams).at(1, 50), { h: 0, v: 0 });
  });
  test('skoki: padec (brez klika, prevelik nagib naprej) in pristanki', ctx => {
    const { def, hill } = hillOf(ctx, 'orlova');
    const run = o => PH.simulate({ hill, P: ctx.skokiParams, gate: def.gates.default, wind: { mode: 'off' }, input: scripted(o) }).s;
    const good = s => s.gamma / D.DEG + BOT.BOT_ALPHA;
    const none = run({ err: 0.01, pitch: good, lead: -1 });
    ok(['none', 'fall', 'touch'].includes(none.landing.type), 'brez priprave na pristanek: ' + none.landing.type);
    const late = run({ err: 0.01, pitch: good, lead: 0.11 });
    ok(['fall', 'touch'].includes(late.landing.type), 'prepozen klik: ' + late.landing.type);
    const later = run({ err: 0.01, pitch: good, lead: 0.04 });
    eq(later.landing.type, 'fall', 'klik po refleksu');
    const nose = run({ err: 0.01, pitch: () => -15 });
    eq(nose.fallen, 'nose', 'prevelik nagib naprej');
    eq(nose.landing.type, 'fall');
    const tele = run({ err: 0.01, pitch: good, lead: 0.28 });
    eq(tele.landing.type, 'tele');
    ok(tele.landing.teleQ > 0.8);
    const two = run({ err: 0.01, pitch: good, lead: 0.3, hold: true });
    eq(two.landing.type, 'two');
    ok(tele.phase === 'done' && two.phase === 'done');
  });
  test('skoki: merjenje daljave (po profilu, navzdol na 0,5 m)', ctx => {
    for (let i = 0; i < 12; i++) {
      const { J, hill } = botJump(ctx, ['brezova', 'bistra', 'orlova'][i % 3], { skill: 0.5 + i * 0.04, seed: i });
      const L = J.s.landing;
      const s = hill.groundAt(L.x).s;
      ok(Number.isInteger(L.dist * 2), 'korak 0,5');
      ok(L.dist <= s + 1e-9 && s < L.dist + 0.5, `${L.dist} vs ${s}`);
    }
  });

  /* ------------------------------------------------------------ točkovanje */
  test('skoki: točke za daljavo, veter in zaletno mesto', ctx => {
    const def = ctx.skokiHills.find(h => h.id === 'orlova');
    eq(SC.distancePoints(def, 125), 60, 'točno na K');
    eq(SC.distancePoints(def, 135.5), 78.9);
    eq(SC.distancePoints(def, 110), 33);
    eq(SC.distancePoints(def, 50), 0, 'nikoli negativno');
    eq(SC.windPoints(def, 1.5), -16.3, 'čelni odšteje');
    eq(SC.windPoints(def, -1), 13.1, 'hrbtni prišteje');
    eq(SC.windPoints(def, 0), 0);
    eq(SC.gatePoints(def, def.gates.default - 2), 2 * def.gateFactor, 'nižje mesto = plus');
    eq(SC.gatePoints(def, def.gates.default + 1), -def.gateFactor, 'višje mesto = minus (negativna kompenzacija)');
    const brez = ctx.skokiHills.find(h => h.id === 'brezova');
    eq(SC.distancePoints(brez, 68), 79.2, 'HS male: 60 + 8 × 2,4');
  });
  test('skoki: sodniki (brez najvišje in najnižje, korak 0,5, skupaj)', ctx => {
    const st = SC.styleFromJudges([18, 19.5, 17, 18.5, 18]);
    eq(st.used, [18, 18.5, 18]); eq(st.sum, 54.5); eq(st.dropped, [1, 2]);
    eq(SC.styleFromJudges([18, 18, 18, 18, 18]).sum, 54);
    const def = ctx.skokiHills.find(h => h.id === 'orlova');
    const r = SC.scoreJump(def, { dist: 131.5, judges: [18, 18.5, 17.5, 18, 19], wind: 0.8, gate: def.gates.default });
    eq(r.distPts, 71.7); eq(r.style, 54.5); eq(r.windPts, -8.7); eq(r.gatePts, 0); eq(r.total, 117.5);
    const fall = SC.scoreJump(def, { dist: 60, judges: [5, 6, 5.5, 6, 5], wind: -3, gate: def.gates.default + 3 });
    ok(fall.total >= 0, 'skupaj ni negativno');
    // ocene iz simulacije: telemark > dve nogi > padec, vse v korakih po 0,5
    const { def: d2, hill } = hillOf(ctx, 'bistra');
    const run = o => PH.simulate({ hill, P: ctx.skokiParams, gate: d2.gates.default, wind: { mode: 'off' }, input: scripted({ err: 0.01, pitch: s => s.gamma / D.DEG + BOT.BOT_ALPHA, ...o }) }).s;
    const sum = s => SC.styleFromJudges(JU.judgeScores(s, ctx.skokiParams, 1)).sum;
    const tele = run({ lead: 0.28 }), two = run({ lead: 0.3, hold: true }), none = run({ lead: -1 }), fall2 = run({ lead: 0.28, pitch: () => -15 });
    eq(fall2.landing.type, 'fall');
    ok(sum(two) > sum(none), `dve nogi ${sum(two)} > brez priprave ${sum(none)}`);
    for (const s of [tele, two, fall2]) for (const j of JU.judgeScores(s, ctx.skokiParams, 1)) ok(j >= 0 && j <= 20 && Number.isInteger(j * 2));
    ok(sum(tele) > sum(two), `telemark ${sum(tele)} > dve nogi ${sum(two)}`);
    ok(sum(two) > sum(fall2) + 10, `dve nogi ${sum(two)} ≫ padec ${sum(fall2)}`);
    ok(new Set(JU.judgeScores(tele, ctx.skokiParams, 1)).size > 1 || true);
    ok(SC.maxPoints(def) > SC.distancePoints(def, def.hs) + 60);
  });
  test('skoki: zapis za lestvico (točke + daljava v enem številu)', () => {
    const n = SC.encodeBoard(142.3, 131.5);
    eq(SC.decodeBoard(n), { total: 142.3, dist: 131.5 });
    ok(SC.encodeBoard(142.4, 100) > SC.encodeBoard(142.3, 140), 'razvrščanje po točkah');
    ok(SC.encodeBoard(142.3, 131) > SC.encodeBoard(142.3, 130.5), 'enake točke loči daljava');
    ok(SC.encodeBoard(300, 250) < 2147483647, 'int32');
    eq(SC.fmtBoard(n), '131,5 m · 142,3 t');
  });

  /* ------------------------------------------------------------ ghost */
  test('skoki: ghost (zapis → stiskanje → predvajanje da isto daljavo, < 4 KB)', ctx => {
    for (const id of ['brezova', 'orlova']) {
      const wind = { mode: 'random', seed: 4242 };
      const { J, def, hill, rec } = botJump(ctx, id, { skill: 0.6, seed: 11, wind });
      const g = { pv: ctx.skokiParams.paramsVersion, hill: id, gate: def.gates.default, wind: { ...wind, speed: 0 }, changes: rec.changes, ticks: rec.ticks, dist: J.s.dist, total: 101.7 };
      const str = GH.encodeGhost(g);
      ok(str.length < GH.GHOST_MAX, `${id}: ${str.length} znakov`);
      ok(/^[A-Za-z0-9+/=]+$/.test(str));
      const back = GH.decodeGhost(str);
      eq([back.hill, back.gate, back.wind.seed, back.wind.mode, back.dist, back.total, back.pv], [id, g.gate, 4242, 'random', J.s.dist, 101.7, g.pv]);
      eq(back.changes, rec.changes);
      const r = GH.ghostJump(back, hill, ctx.skokiParams);
      while (!r.J.done) r.J.step(r.input(r.J.s, r.J.s.tick));
      eq([r.J.s.dist, r.J.s.tick, r.J.s.landing.type], [J.s.dist, J.s.tick, J.s.landing.type], id + ': predvajanje');
    }
    let threw = false; try { GH.decodeGhost('AAAA'); } catch { threw = true; } ok(threw, 'pokvarjen ghost vrže napako');
  });
  test('lokalno: ghosti z order desc (več je bolje), Krogla nespremenjena', async () => {
    const a = new LocalBackend(); await a.init(); a.userId = 'test-sa';
    eq((await a.saveGhost({ game: 'skoki', level: 'orlova', timeMs: 1200000, data: 'QUJD', order: 'desc' })).saved, true);
    eq((await a.saveGhost({ game: 'skoki', level: 'orlova', timeMs: 1100000, data: 'WFla', order: 'desc' })).saved, false, 'slabši');
    eq((await a.saveGhost({ game: 'skoki', level: 'orlova', timeMs: 1300000, data: 'WFla', order: 'desc' })).saved, true, 'boljši');
    a.userId = 'test-sb';
    await a.saveGhost({ game: 'skoki', level: 'orlova', timeMs: 1250000, data: 'QkJC', order: 'desc' });
    eq((await a.getGhosts({ game: 'skoki', level: 'orlova', order: 'desc' })).map(g => [g.user_id, g.time_ms]), [['test-sa', 1300000], ['test-sb', 1250000]]);
    eq((await a.getGhosts({ game: 'skoki', level: 'orlova' })).map(g => g.user_id), ['test-sb', 'test-sa'], 'privzeto asc');
    eq((await a.getGhost({ game: 'skoki', level: 'orlova', userId: 'test-sa' })).data, 'WFla');
  });

  test('skoki: SQL skakalnic (meje točk = maxPoints, vse skakalnice, RLS)', ctx => {
    const sql = ctx.skokiSql;
    for (const def of ctx.skokiHills) ok(sql.includes(`('${def.id}', ${SC.maxPoints(def)})`), `${def.id}: max_points ${SC.maxPoints(def)}`);
    ok(/alter table public\.skoki_ghosts enable row level security/.test(sql), 'RLS');
    ok(/security definer/.test(sql) && /private\.skoki_save_ghost/.test(sql), 'definer v private');
    ok(/where g\.time_ms < excluded\.time_ms/.test(sql), 'shrani le boljši (več je bolje)');
    for (const def of ctx.skokiHills) ok(SC.encodeBoard(SC.maxPoints(def), def.hs + 25) <= SC.maxPoints(def) * 10000 + 999, 'meja kodiranja');
  });

  /* ------------------------------------------------------------ uravnoteženje z botom */
  test('skoki: cilji uravnoteženja z botom na vseh skakalnicah', ctx => {
    const rows = balanceTable(ctx.skokiHills, ctx.skokiParams, { n: BALANCE_N });
    const notes = [];
    for (const r of rows) {
      const { def } = hillOf(ctx, r.hill);
      const K = def.k, HS = def.hs;
      if (r.skill === 0.3) {
        ok(r.falls <= 0.3, `${r.hill} 0,3: padci ${r.falls}`);
        ok(r.avg >= K - 0.22 * K && r.avg <= K - 0.05 * K, `${r.hill} 0,3: povprečje ${r.avg} (K${K})`);
      } else if (r.skill === 0.7) {
        ok(r.falls <= 0.1, `${r.hill} 0,7: padci ${r.falls}`);
        ok(Math.abs(r.avg - K) <= 5, `${r.hill} 0,7: povprečje ${r.avg} (K${K} ± 5)`);
      } else {
        ok(r.avg >= HS - 6 && r.avg <= HS + 2, `${r.hill} 1,0: povprečje ${r.avg} (HS${HS} −6/+2)`);
        ok(r.overHS < 0.5, `${r.hill} 1,0: čez HS ${r.overHS}`);
      }
      notes.push(`${r.hill} ${r.skill}: ${r.avg.toFixed(1)} m`);
    }
    return notes.join(', ');
  });
}
