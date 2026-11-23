/* =====================================================================
   Testi Dirke frnikol (games/frnikole/). Registrira jih tests/tests.js.
   ctx.frnikoleTracks: vse proge (tracks/index.json).
   ===================================================================== */
import * as FR from '../games/frnikole/race.js';
import * as FO from '../games/frnikole/odds.js';
import * as FB from '../games/frnikole/bets.js';
import * as FBO from '../games/frnikole/bots.js';
import * as FD from '../games/frnikole/day.js';
import * as FT from '../games/frnikole/track.js';
import * as FX from '../games/frnikole/texts.js';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function frnikoleTests(test, { eq, ok }) {
  const neutral = () => Array.from({ length: 8 }, (_, i) => ({ id: 'm' + i, form: {} }));
  const T0 = ctx => ctx.frnikoleTracks[0];
  const snap = R => R.M.map(m => [m.b.x.toFixed(6), m.b.z.toFixed(6), m.st]).join('|');

  /* ------------------------------------------------------------ stave */
  test('frnikole: izplačila stav (zmagovalec, stopničke, dvoboj)', () => {
    const order = [3, 1, 4, 0, 2, 5, 6, 7];
    eq(FB.payout({ type: 'win', m: 3, stake: 100, odds: 4.4 }, order), 440);
    eq(FB.payout({ type: 'win', m: 1, stake: 100, odds: 4.4 }, order), 0);
    eq(FB.payout({ type: 'podium', m: 4, stake: 50, odds: 1.7 }, order), 85);
    eq(FB.payout({ type: 'podium', m: 0, stake: 50, odds: 1.7 }, order), 0);
    eq(FB.payout({ type: 'duel', m: 0, vs: 2, stake: 33, odds: 1.9 }, order), 62, 'zaokroženo navzdol');
    eq(FB.payout({ type: 'duel', m: 2, vs: 0, stake: 33, odds: 1.9 }, order), 0);
  });
  test('frnikole: več stav v eni dirki in pravila listka', () => {
    const order = [5, 2, 7, 0, 1, 3, 4, 6];
    const bets = [{ type: 'win', m: 5, stake: 100, odds: 6.4 }, { type: 'podium', m: 7, stake: 200, odds: 2.1 }, { type: 'duel', m: 0, vs: 1, stake: 50, odds: 1.8 }];
    const s = FB.settle(bets, order);
    eq([s.total, s.won.length, s.lost.length, s.staked], [640 + 420 + 90, 3, 0, 350]);
    eq(FB.betError(1000, [], { type: 'win', m: 0, stake: 5, odds: 2 }), 'min');
    eq(FB.betError(40, [], { type: 'win', m: 0, stake: 50, odds: 2 }), 'bank');
    eq(FB.betError(1000, bets, { type: 'win', m: 1, stake: 50, odds: 2 }), 'count');
    eq(FB.betError(1000, bets.slice(0, 1), { type: 'win', m: 5, stake: 50, odds: 6.4 }), 'same');
    eq(FB.betError(1000, [], { type: 'duel', m: 2, vs: 2, stake: 50, odds: 1.8 }), 'type');
    eq(FB.betError(1000, [], { type: 'duel', m: 2, vs: 3, stake: 50, odds: 1.8 }), null);
  });
  test('frnikole: posojilo enkrat na dan in končni rezultat', () => {
    const a = { bank: 7, loan: false };
    ok(FB.maybeLoan(a), 'posojilo ni bilo dano');
    eq(a.bank, 107);
    a.bank = 3;
    ok(!FB.maybeLoan(a), 'drugo posojilo');
    eq(a.bank, 3);
    eq(FB.finalScore({ bank: 1500, loan: true }), 1400);
    eq(FB.finalScore({ bank: 60, loan: true }), 0);
    eq(FB.finalScore({ bank: 1500, loan: false }), 1500);
    const b = { bank: 10, loan: false };
    ok(!FB.maybeLoan(b), 'posojilo pri 10 točkah (meja je pod 10)');
  });

  /* ------------------------------------------------------------ proge */
  test('frnikole: vse proge so veljavne in imajo poti za vse razcepe', ctx => {
    ok(ctx.frnikoleTracks.length >= 3, 'vsaj 3 proge');
    for (const T of ctx.frnikoleTracks) {
      eq(FT.validateTrack(T), [], T.id);
      const routes = FT.trackRoutes(T);
      eq(routes.size, 1 << (T.splits || []).length, T.id + ': število poti');
      for (const rt of routes.values()) {
        ok(rt.finish > 40 && rt.cps.length >= 3, T.id + ': pot ' + rt.key);
        ok(rt.gy.every(Number.isFinite), T.id + ': višine poti');
      }
      ok((T.splits || []).length >= 1, T.id + ': vsaj en razcep');
    }
  });
  test('frnikole: na vsaki progi vse frnikole brez sunkov pridejo do cilja', ctx => {
    const notes = [];
    for (const T of ctx.frnikoleTracks) {
      for (let k = 0; k < 2; k++) {
        const R = FR.createRace({ track: T, marbles: neutral(), seed: 'test:' + k });
        FR.runRace(R);
        const un = R.M.filter(m => !m.finished).length;
        eq(un, 0, `${T.id} (seed ${k}): ni v cilju`);
        const t = R.M[R.order[0]].finishT;
        ok(t >= T.target[0] - 5 && t <= T.target[1], `${T.id}: čas zmagovalca ${t}`);
        if (!k) notes.push(`${T.id} ${t.toFixed(1)} s`);
      }
    }
    return notes.join(', ');
  });

  /* ------------------------------------------------------------ determinizem */
  test('frnikole: ista dirka (seed + sunki) dvakrat → enak izid; drug sunek → drugačen potek', ctx => {
    const T = T0(ctx);
    const plan = new Map([[600, [{ m: 2, k: 'help', by: 'me' }]], [1500, [{ m: 4, k: 'hit', by: 'me' }]]]);
    const run = p => { const R = FR.createRace({ track: T, marbles: neutral(), seed: 'det', participants: ['me'] }); FR.runRace(R, p); return R; };
    const a = run(plan), b = run(plan);
    eq(a.order, b.order, 'vrstni red');
    eq(snap(a), snap(b), 'položaji');
    eq(a.log, b.log, 'dnevnik sunkov');
    eq(a.log.length, 2);
    const c = run(new Map([[600, [{ m: 2, k: 'hit', by: 'me' }]]]));
    ok(snap(c) !== snap(a), 'drug sunek ni spremenil poteka');
    const d = FR.createRace({ track: T, marbles: neutral(), seed: 'det2' });
    FR.runRace(d);
    ok(snap(d) !== snap(a), 'drug seed, ista dirka');
  });
  test('frnikole: pravila sunkov (3 na dirko, ohlajanje 1,5 s)', ctx => {
    const R = FR.createRace({ track: T0(ctx), marbles: neutral(), seed: 'sunki', participants: ['me'] });
    for (let i = 0; i < 360; i++) FR.stepRace(R);
    ok(FR.applyNudge(R, { m: 0, k: 'help', by: 'me' }), 'prvi sunek');
    ok(!FR.applyNudge(R, { m: 1, k: 'help', by: 'me' }), 'ohlajanje ni delovalo');
    for (let i = 0; i < 180; i++) FR.stepRace(R);
    ok(FR.applyNudge(R, { m: 1, k: 'hit', by: 'me' }), 'drugi sunek po ohlajanju');
    for (let i = 0; i < 180; i++) FR.stepRace(R);
    ok(FR.applyNudge(R, { m: 2, k: 'help', by: 'me' }), 'tretji sunek');
    for (let i = 0; i < 180; i++) FR.stepRace(R);
    ok(!FR.applyNudge(R, { m: 3, k: 'help', by: 'me' }), 'četrti sunek');
    eq(FR.nudgeState(R, 'me').left, 0);
    ok(!FR.applyNudge(R, { m: 3, k: 'boom', by: 'x' }), 'neznana vrsta sunka');
  });

  /* ------------------------------------------------------------ kvote */
  test('frnikole: kvote — razumna vsota verjetnosti, favorit ima najnižjo kvoto', ctx => {
    const D = FD.dayPlan('2026-11-23', { tracks: ctx.frnikoleTracks.map(T => T.id) });
    const r = D.races[0];
    const T = ctx.frnikoleTracks.find(x => x.id === r.track);
    const o = FO.computeOdds({ track: T, marbles: r.marbles, seed: r.seed, sims: 20 });
    const ov = FO.overround(o.win);
    ok(ov > 1.0 && ov < 1.5, 'vsota 1/kvota: ' + ov.toFixed(2));
    ok(o.win.every(v => v >= FO.ODDS.WIN[0] && v <= FO.ODDS.WIN[1]), 'kvote v razponu');
    ok(o.win[o.fav] === Math.min(...o.win), 'favorit');
    ok(o.podium.every((v, i) => v <= o.win[i]), 'stopničke ≤ zmaga');
    eq(o.duels.length, FO.ODDS.DUELS);
    for (const d of o.duels) ok(d.oa >= 1.3 && d.ob >= 1.3 && d.a !== d.b, 'dvoboj');
    // ista dirka → iste kvote
    const o2 = FO.computeOdds({ track: T, marbles: r.marbles, seed: r.seed, sims: 20 });
    eq(o2.win, o.win, 'kvote niso deterministične');
    return `kvote ${o.win.map(FB.fmtOdds).join(' ')}, vsota ${ov.toFixed(2)}`;
  });

  /* ------------------------------------------------------------ boti */
  test('frnikole: boti — ista osebnost + seed → iste stave; nikoli več, kot imajo', () => {
    const odds = FO.oddsFrom({ n: 30, wins: [9, 6, 4, 3, 3, 2, 2, 1], top3: [20, 16, 12, 10, 10, 8, 8, 6], tSum: 800,
      before: Array.from({ length: 8 }, (_, i) => Array.from({ length: 8 }, (_, j) => (i < j ? 18 : 12))) });
    const ids = FD.MARBLES.slice(0, 8).map(m => m.id);
    for (const persona of FBO.PERSONA_IDS) {
      const bot = { id: 'bot1', persona, fav: ids[2] };
      const a = FBO.botBets(bot, { bank: 1000, odds, ids, seed: 's1' });
      const b = FBO.botBets(bot, { bank: 1000, odds, ids, seed: 's1' });
      eq(a, b, persona + ': determinizem');
      ok(a.length >= 1 && a.length <= FB.BET.PER_RACE, persona + ': število stav');
      for (const bank of [10, 25, 60, 1000, 7777]) {
        const bs = FBO.botBets(bot, { bank, odds, ids, seed: 's' + bank });
        const st = bs.reduce((s, x) => s + x.stake, 0);
        ok(st <= bank, `${persona}: stavil ${st} pri ${bank}`);
        ok(bs.every(x => x.stake >= FB.BET.MIN && x.odds > 1), persona + ': veljavne stave');
      }
      eq(FBO.botBets(bot, { bank: 5, odds, ids, seed: 's' }), [], persona + ': pod minimumom ne stavi');
    }
    const hz = FBO.botBets({ id: 'b', persona: 'hazarder', fav: '' }, { bank: 1000, odds, ids, seed: 'x' });
    ok(hz[0].odds >= odds.win[odds.fav] * 1.5, 'hazarder stavi na visoko kvoto');
    const pv = FBO.botBets({ id: 'b', persona: 'previdnez', fav: '' }, { bank: 1000, odds, ids, seed: 'x' });
    ok(pv[0].m === odds.fav && pv[0].type === 'win', 'previdnež stavi na favorita');
    ok(FBO.BOT_NAMES.length >= 12, 'vsaj 12 imen botov');
  });
  test('frnikole: boti sunkajo po pravilih in deterministično', ctx => {
    const T = T0(ctx);
    const bots = FBO.PERSONA_IDS.map((p, i) => ({ id: 'bot' + i, persona: p, fav: 'x' }));
    const run = () => {
      const brains = bots.map((b, i) => FBO.botBrain(b, { mine: i, target: 7, seed: 'br' }));
      const R = FR.createRace({ track: T, marbles: neutral(), seed: 'br', brains, participants: bots.map(b => b.id) });
      FR.runRace(R);
      return R;
    };
    const a = run(), b = run();
    eq(a.log, b.log, 'sunki botov niso deterministični');
    ok(a.log.length >= 3, 'boti skoraj ne sunkajo: ' + a.log.length);
    for (const bt of bots) ok(a.log.filter(n => n.by === bt.id).length <= FR.RACE.NUDGES, bt.persona + ': več kot 3 sunki');
    ok(a.log.filter(n => n.by === 'bot3' && n.k === 'hit').every(n => n.m === 7), 'saboter ovira le tarčo');
    ok(a.log.filter(n => n.by !== 'bot3').every(n => n.k === 'help'), 'drugi boti le pomagajo');
    return `${a.log.length} sunkov botov`;
  });

  /* ------------------------------------------------------------ dan */
  test('frnikole: dnevni seed → isti nabor 5 dirk; drug dan → drugačen', ctx => {
    const ids = ctx.frnikoleTracks.map(T => T.id);
    const a = FD.dayPlan('2026-11-23', { tracks: ids }), b = FD.dayPlan('2026-11-23', { tracks: ids });
    eq(a, b);
    eq(a.races.length, FB.BET.RACES);
    eq(a.bots.length, 5);
    for (const t of ids) ok(a.races.some(r => r.track === t), 'proga ' + t + ' ni v dnevu');
    for (let i = 1; i < a.races.length; i++) ok(a.races[i].track !== a.races[i - 1].track, 'ista proga dvakrat zapored');
    for (const r of a.races) {
      eq(r.marbles.length, 8);
      eq(new Set(r.marbles.map(m => m.id)).size, 8, 'podvojena frnikola');
      ok(r.marbles.every(m => ['speed', 'grip', 'mass'].every(k => Math.abs(m.form[k]) <= 1)), 'forma v razponu');
    }
    const c = FD.dayPlan('2026-11-24', { tracks: ids });
    ok(JSON.stringify(c.races) !== JSON.stringify(a.races), 'drug dan, isti nabor');
    eq(FD.dayPlan('x', { tracks: ids, bots: 9 }).bots.length, 7, 'največ 7 botov');
    eq(FD.dayPlan('x', { tracks: ids, bots: 1 }).bots.length, 3, 'najmanj 3 boti');
    eq(FD.formArrows({ speed: 0.5, grip: 0.4, mass: -0.6 }), '▲▲▽');
    ok(FD.formText({ speed: 0.7, grip: -0.5, mass: 0 }) === 'hitra v ravnini, slaba v zavojih', 'opis forme');
  });
  test('frnikole: komentator ima vsaj 40 variant in brez praznih predlog', () => {
    ok(FX.ALL_LINES.length >= 40, 'variant: ' + FX.ALL_LINES.length);
    ok(FX.ALL_LINES.every(s => s.length > 5), 'prazna vrstica');
    eq(FX.fill('{m} je prehitela {pacc}', { m: 'Pikica', pacc: 'Lavico' }), 'Pikica je prehitela Lavico');
    eq(FX.nudgeFeed('hit', 'Teta Mici', 'Rdečo zvezdo', 'f'), 'Teta Mici je sunila Rdečo zvezdo vstran');
    eq(FX.nudgeFeed('help', null, 'Pikico'), 'Tvoj sunek je porinil Pikico naprej!');
    return FX.ALL_LINES.length + ' variant';
  });
  test('frnikole: vsaka frnikola ima ime, tožilnik, barvo in lastnosti', () => {
    ok(FD.MARBLES.length >= 12, 'premalo frnikol');
    eq(new Set(FD.MARBLES.map(m => m.id)).size, FD.MARBLES.length);
    for (const m of FD.MARBLES) {
      ok(m.name && m.acc && /^#[0-9a-f]{6}$/i.test(m.color), m.id);
      ok(['speed', 'grip', 'mass'].every(k => Math.abs(m.base[k]) <= 1), m.id + ' base');
    }
  });
}
