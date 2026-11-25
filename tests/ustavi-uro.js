/* =====================================================================
   Testi igre Ustavi uro (games/ustavi-uro/logic.js) — prompts/28-ustavi-uro.md.
   Registrira jih tests/tests.js.
   ===================================================================== */
import * as U from '../shared/util.js';
import * as Q from '../shared/quests.js';
import * as UU from '../games/ustavi-uro/logic.js';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function ustaviUroTests(test, { eq, ok }) {
  test('ustavi-uro: ista runda za isti seed, različna za različen seed', () => {
    const a = UU.dailyPlan(U.rng, '2026-11-25'), b = UU.dailyPlan(U.rng, '2026-11-25');
    eq(a, b);
    eq(a.rounds.length, UU.ROUNDS);
    ok(UU.MODS.some(m => m.id === a.mod));
    const days = ['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'].map(d => JSON.stringify(UU.dailyPlan(U.rng, d)));
    ok(days.some(d => d !== JSON.stringify(a)), 'različni dnevi → različne runde');
    // dvoboj: isti seed sobe → isti krogi
    for (const mode of ['duel', 'last']) {
      for (let r = 1; r <= 7; r++) eq(UU.mpRound(U.rng, 'abc', 'hard', mode, r), UU.mpRound(U.rng, 'abc', 'hard', mode, r));
    }
    const d1 = [1, 2, 3, 4, 5].map(r => UU.mpRound(U.rng, 's1', 'hard', 'duel', r).stops[0]);
    const d2 = [1, 2, 3, 4, 5].map(r => UU.mpRound(U.rng, 's2', 'hard', 'duel', r).stops[0]);
    ok(JSON.stringify(d1) !== JSON.stringify(d2), 'drug seed sobe → drugi cilji');
  });

  test('ustavi-uro: vseh 7 modifikatorjev da veljavno rundo', () => {
    ok(UU.MODS.length >= 6);
    for (const m of UU.MODS) {
      const p = UU.dailyPlan(U.rng, '2026-11-25', m.id);
      eq(p.mod, m.id);
      eq(p.rounds[0].hideAfter, null, 'krog 1 je viden');
      eq(p.rounds[4].hideAfter, 0, 'krog 5 je na slepo');
      ok(p.rounds.every(r => r.stops.every(s => Number.isInteger(s) && s >= 5000 && s <= 30000)), m.id + ': cilji v mejah');
      if (m.id === 'odd') ok(p.rounds.every(r => r.stops[0] % 1000 !== 0), 'čudni cilji niso celi');
      if (m.id === 'double') ok(p.rounds.every(r => r.stops.join() === '5000,10000'));
      if (m.id === 'long') eq(p.rounds.filter(r => r.stops[0] === 30000).length, 1);
      if (m.id === 'metronome') ok(p.rounds.every(r => r.tickMs && r.tickMs !== 1000));
      if (m.id === 'fake') ok(p.rounds.every(r => r.speed === 0.9 || r.speed === 1.1));
      if (m.id === 'countdown') ok(p.rounds.every(r => r.countdown));
    }
    // ustavi-uro: prikaz pri odštevanju in lažni uri
    eq(UU.displayMs({ stops: [10000], countdown: true }, 9000), 1000);
    eq(UU.displayMs({ stops: [10000], speed: 1.1 }, 1000), 1100);
  });

  test('ustavi-uro: prosta igra — vzorec izginjanja in cilji po težavnosti', () => {
    const r = U.rng('x');
    eq(UU.freePlan(r, 'easy').rounds.map(x => x.hideAfter), [null, 5000, 3000, 1000, 0]);
    ok(UU.freePlan(U.rng('y'), 'easy').rounds.every(x => x.stops[0] === 10000));
    const mid = UU.freePlan(U.rng('z'), 'mid').rounds;
    ok(mid.slice(0, 3).every(x => x.stops[0] === 10000) && mid.slice(3).every(x => x.stops[0] >= 7000 && x.stops[0] <= 15000));
    const hard = UU.freePlan(U.rng('w'), 'hard').rounds;
    ok(hard.every(x => x.stops[0] <= 30000) && hard[4].stops[0] >= 20000);
    // Zadnji stoji: vse krajši čas izginotja
    eq([1, 2, 3, 4, 5, 9].map(UU.lastStandingHide), [6000, 4500, 3000, 1500, 0, 0]);
  });

  test('ustavi-uro: odstopanje (prezgodaj in prepozno), prekoračitev = 5000 ms', () => {
    const spec = { stops: [10000] };
    let s = UU.scoreRound(spec, [9870.4]);
    eq([s.dev, s.signed[0], s.overrun], [130, -130, false]);
    s = UU.scoreRound(spec, [10042]);
    eq([s.dev, s.signed[0]], [42, 42]);
    eq(UU.scoreRound(spec, []).dev, 5000);
    ok(UU.scoreRound(spec, []).overrun);
    eq(UU.scoreRound(spec, [15001]).dev, 5000, 'po roku = prekoračitev');
    eq(UU.scoreRound(spec, [15000]).dev, 5000, 'točno na roku = 5000');
    eq(UU.scoreRound(spec, [300]).dev, 9700, 'prezgodnji stop je navaden stop');
    eq(UU.deadline(spec), 15000);
  });

  test('ustavi-uro: Dvojni stop sešteje oba stopa', () => {
    const spec = { stops: [5000, 10000] };
    const s = UU.scoreRound(spec, [4950, 10120]);
    eq([s.dev, s.devs, s.signed], [170, [50, 120], [-50, 120]]);
    const one = UU.scoreRound(spec, [5003]);
    eq(one.dev, 3 + 5000, 'manjka drugi stop → +5000');
    ok(UU.scoreRound(spec, [5003, 10004]).perfect, '3 + 4 = 7 ms → popolno');
    ok(!UU.scoreRound(spec, [5006, 10006]).perfect, '6 + 6 = 12 ms → ni popolno');
  });

  test('ustavi-uro: popoln krog, bonus ne spusti rezultata pod 0', () => {
    const p = UU.scoreRound({ stops: [10000] }, [10004]);
    ok(p.perfect);
    eq(UU.totalScore([p, p]), 0, '4+4−40 → 0');
    const q = UU.scoreRound({ stops: [10000] }, [10100]);
    eq(UU.totalScore([p, q]), 4 + 100 - 20);
    eq(UU.totalScore([UU.scoreRound({ stops: [10000] }, [10000])]), 0);
    const st = UU.addRound(UU.addRound(UU.newPlayer(), p), p);
    eq([st.total, st.raw, st.perfects, st.best], [0, 8, 2, 4]);
  });

  test('ustavi-uro: meje ocen (10/50/150/400 ms)', () => {
    const g = d => UU.grade(d).key;
    eq([0, 10, 11, 50, 51, 150, 151, 400, 401, 5000].map(g),
      ['perfect', 'perfect', 'great', 'great', 'good', 'good', 'close', 'close', 'miss', 'miss']);
    eq(UU.grade(10).label, 'Popolno!');
    ok(UU.COMMENT_COUNT >= 15, 'vsaj 15 napisov komentatorja');
    for (const t of [[9995], [9900], [10100], [9700], [10300], [9000], [11000], []]) {
      const line = UU.commentFor(UU.scoreRound({ stops: [10000] }, t), () => 0.5);
      ok(typeof line === 'string' && line.length > 3);
    }
  });

  test('ustavi-uro: povzetek (povprečje, najboljši krog, smer)', () => {
    const rs = [[9900], [10050], [9950]].map(t => UU.scoreRound({ stops: [10000] }, t));
    const s = UU.summary(rs);
    eq([s.total, s.avg, s.best, s.bias, s.early, s.late], [200, 67, { round: 2, dev: 50 }, -33, 2, 1]);
    eq(UU.biasText(-84), 'v povprečju prezgodaj za 84 ms');
    eq(UU.biasText(3), 'v povprečju točno');
  });

  test('ustavi-uro: izpadanje v Zadnji stoji (izenačenje → nihče)', () => {
    eq(UU.eliminate({ a: 100, b: 300, c: 50 }), ['b']);
    eq(UU.eliminate({ a: 300, b: 300, c: 50 }), [], 'izenačenje na vrhu: oba ostaneta');
    eq(UU.eliminate({ a: 5000 }), []);
    eq(UU.eliminate({ a: 10, b: 20 }), ['b']);
    const st = { a: { total: 400, out: 2 }, b: { total: 900, out: null }, c: { total: 100, out: 1 }, d: { total: 300, out: 2 } };
    eq(UU.ranking(st, 'last'), ['b', 'd', 'a', 'c']);
    eq(UU.ranking(st, 'duel'), ['c', 'd', 'a', 'b']);
    eq(UU.crowns({ a: 30, b: 12, c: 12 }), ['b', 'c']);
  });

  test('ustavi-uro: nagrade, notranja ura, XP, dosežki, niz dni', () => {
    const st = {
      a: { total: 300, early: 4, late: 1, best: 8 },
      b: { total: 200, early: 1, late: 3, best: 40 },
    };
    const aw = UU.awards(st, ['b', 'a']);
    eq(aw.map(x => [x.key, x.id]), [['swiss', 'b'], ['early', 'a'], ['late', 'b'], ['laser', 'a']]);
    const ls = { a: { total: 50, devs: [50], early: 0, late: 1, best: 50 }, b: { total: 80, devs: [20, 60], early: 1, late: 1, best: 20 } };
    eq(UU.awards(ls, ['b', 'a'], 'last')[0].id, 'b', 'Zadnji stoji: švicarska ura po povprečju na krog');
    eq(UU.awards(ls, ['b', 'a'], 'duel')[0].id, 'a');
    eq(UU.innerClock([{ t: 10000, s: 9700 }, { t: 10000, s: 9700 }]), 0.97);
    eq(UU.innerClock([]), null);
    eq(UU.xpFor({}), 15);
    eq(UU.xpFor({ hard: true, daily: true, perfects: 5, mpWin: true }), 15 + 10 + 15 + 15 + 40);
    const blind = { spec: { stops: [10000], hideAfter: 0 }, res: UU.scoreRound({ stops: [10000] }, [10008]) };
    const long = { spec: { stops: [30000], hideAfter: 8000 }, res: UU.scoreRound({ stops: [30000] }, [30150]) };
    const ach = UU.roundAchievements({ rounds: [blind, blind, blind, long], diff: 'mid', total: 150, complete: true });
    eq(ach, ['prvi-stop', 'popolno', 'slepec', 'pod-500', 'pod-200', 'trije-popolni', 'dolga-pot']);
    eq(UU.roundAchievements({ rounds: [blind], diff: 'easy', total: 8, complete: true }).includes('pod-200'), false, 'Lahko ne šteje');
    eq(UU.dayStreak(['2026-11-23', '2026-11-24', '2026-11-25'], '2026-11-25'), 3);
  });

  test('ustavi-uro: prikaz časa (vejica, stotinke, minus)', () => {
    eq(UU.fmtClock(9876), '9,87');
    eq(UU.fmtClock(10000), '10,00');
    eq(UU.fmtClock(-420), '−0,42');
    eq(UU.fmtSigned(-130), '−130 ms');
    eq(UU.fmtSigned(42), '+42 ms');
    eq(UU.fmtTarget(7350), '7,35 s');
  });

  test('ustavi-uro: games.json vnos in naloge (cmp lte kot pri Reakciji)', (ctx) => {
    const g = ctx.games.find(x => x.id === 'ustavi-uro');
    ok(g && g.status === 'live' && g.scoreOrder === 'asc' && g.scoreUnit === 'ms', 'vnos v games.json');
    ok(g.description.length <= 160);
    const qs = Q.expandTemplates(ctx.games).filter(t => t.game === 'ustavi-uro' && t.id.startsWith('ustavi-uro-'));
    eq(qs.length, 8);
    for (const t of qs) ok(Q.QUEST_ID_RE.test('w1.' + t.id), 'id naloge: ' + t.id);
    const round = qs.find(t => t.id === 'ustavi-uro-round-10');
    const q = { event: round.event, target: round.target, cmp: round.cmp, goal: round.goal };
    eq(Q.applyEvent(q, { progress: 0 }, { name: 'ustavi-uro:round', value: 10 })?.progress, 1);
    eq(Q.applyEvent(q, { progress: 0 }, { name: 'ustavi-uro:round', value: 11 }), null);
    const w = qs.find(t => t.id === 'ustavi-uro-w-total-400');
    let st = { progress: 0 };
    for (const v of [399, 500, 120, 399]) st = Q.applyEvent(w, st, { name: 'ustavi-uro:total', value: v }) || st;
    eq(st.progress, 3);
  });
}
