/* =====================================================================
   Testi Hrčkove krogle: nove proge (13–28), pokali (levels/cups.json), tedenski pokal, dnevni bazen,
   meritve balansa — prompts/35-krogla-proge-turnirji.md. Registrira jih tests/tests.js.
   ctx.kroglaLevels: vse uradne proge, ctx.kroglaCups: levels/cups.json.
   ===================================================================== */
import * as U from '../shared/util.js';
import * as Q from '../shared/quests.js';
import * as KR from '../games/krogla/rules.js';
import * as KA from '../games/krogla/autopilot.js';
import * as KL from '../games/krogla/level.js';
import * as KB from '../games/krogla/balance.js';
import * as KP from '../games/krogla/physics.js';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function krogla2Tests(test, { eq, ok }) {
  const newOnes = ctx => ctx.kroglaLevels.filter(L => parseInt(L.id, 10) >= 13);

  test('krogla proge: 28 uradnih, nove z diff/len/tags; razpršenost po dolžini in težavnosti', ctx => {
    const all = ctx.kroglaLevels, nw = newOnes(ctx);
    ok(all.length >= 28, 'manj kot 28 prog');
    eq(nw.length, 16);
    for (const L of all) ok(Number.isInteger(L.diff) && L.diff >= 1 && L.diff <= 5, L.id + ': diff');
    for (const L of all.filter(x => KR.isClassic(x.id))) { eq(L.len, undefined, L.id + ': klasične nimajo len'); eq(L.tags, undefined, L.id); }
    const by = len => nw.filter(L => L.len === len);
    ok(by('kratka').length >= 4 && by('srednja').length >= 5 && by('dolga').length >= 4, 'premalo kratkih/srednjih/dolgih');
    for (let d = 1; d <= 5; d++) ok(nw.filter(L => L.diff === d).length >= 2, `težavnost ${d} manj kot dvakrat`);
    ok(nw.some(L => L.len === 'dolga' && L.diff === 1), 'ni dolge lahke');
    ok(nw.some(L => L.len === 'kratka' && L.diff === 5), 'ni kratke zelo težke');
    ok(new Set(nw.map(L => L.look)).size >= 6, 'manj kot 6 lokacij');
    for (const L of nw) ok(Array.isArray(L.tags) && L.tags.length, L.id + ': tags');
  });

  test('krogla proge: len se ujema z dev.time; dolžine v mejah; kontrolne točke in ure', ctx => {
    for (const L of newOnes(ctx)) {
      eq(L.len, KR.lenFromTime(L.dev.time), L.id);
      const t = L.dev.time;
      const [a, b] = { kratka: [8, 16], srednja: [20, 45], dolga: [55, 130] }[L.len];
      ok(t >= a && t <= b, `${L.id}: ${t} s ni v ${a}–${b} s`);
      const cps = (L.checkpoints || []).length, clocks = L.pickups.filter(p => p.t === 'clock').length;
      if (L.len === 'kratka') ok(cps <= 1, L.id + ': kratka ima 0–1 kontrolno točko');
      if (L.len === 'dolga') {
        ok(clocks >= 3, `${L.id}: dolga ima ${clocks} ur (≥ 3)`);
        ok(t / (cps + 1) <= 14, `${L.id}: kontrolna točka na ${(t / (cps + 1)).toFixed(1)} s (≈ 8–12 s)`);
      }
    }
    for (const L of ctx.kroglaLevels) eq(KR.lenOf(L), KR.lenFromTime(L.dev.time), L.id);
  });

  test('krogla proge: razcepi — alternativna pot je rešljiva in hitrejša, bližnjica je na alternativni poti', ctx => {
    const forks = newOnes(ctx).filter(L => L.routes?.alt);
    ok(forks.length >= 2 && forks.some(L => L.id.startsWith('18')) && forks.some(L => L.id.startsWith('26')), 'razcepi na 18 in 26');
    for (const L of forks) {
      const main = KA.runAutopilot(L), alt = KA.runAutopilot({ ...L, route: L.routes.alt });
      ok(alt.finished, L.id + ': alternativna pot ne pride do cilja');
      ok(alt.time < main.time, `${L.id}: bližnjica ${alt.time.toFixed(1)} s ni hitrejša od ${main.time.toFixed(1)} s`);
      ok(alt.time < KR.levelTime(L), L.id);
      // glavna (varna) pot ne zapelje na bližnjico, alternativna jo prevozi
      const inCut = (w, k) => { let hit = false; const wd = KP.createWorld(L); const d = KA.pilot(wd, k); while (!wd.finished && wd.t < 200) { const [a, b] = d(); wd.events.length = 0; KP.step(wd, a, b); const bb = wd.ball; if (L.shortcuts.some(q => bb.x >= q.x && bb.x <= q.x + q.w && bb.z >= q.z && bb.z <= q.z + q.d)) hit = true; } return hit; };
      ok(!inCut(null, L.route), L.id + ': varna pot gre čez bližnjico');
      ok(inCut(null, L.routes.alt), L.id + ': alternativna pot ne gre čez bližnjico');
      const M = KL.mirrorLevel(L);
      ok(KA.runAutopilot({ ...M, route: M.routes.alt }).finished, L.id + ': zrcaljena bližnjica');
    }
  });

  test('krogla proge: ostre medalje kratkih prog (desetinke) in ventilator v ritmu', ctx => {
    for (const L of newOnes(ctx).filter(x => x.len === 'kratka')) {
      ok(Math.abs(L.medals.gold - L.dev.time * 0.98) <= 0.2 && Math.round(L.medals.gold * 10) === L.medals.gold * 10, L.id + ': zlato na desetinko');
      ok(L.medals.silver - L.medals.gold < 3 && L.medals.bronze - L.medals.gold < 6, L.id + ': medalje niso ostre');
    }
    eq(KR.medalsFromTime(10, { sharp: true }), { gold: 9.8, silver: 11.2, bronze: 13 });
    eq(KR.medalsFromTime(20), { gold: 20, silver: 26, bronze: 33 }, 'privzeta formula nespremenjena');
    eq(KR.timeBonusFromTime(20, { timeMul: 0.8 }), Math.ceil(31 * 0.8));
    const fan = { x: 0, z: 0, dir: [1, 0], len: 3, width: 2, force: 9, period: 2, duty: 0.25 };
    const w = { t: 0.2 };
    ok(KP.fanState(w, fan).on); w.t = 1.0; ok(!KP.fanState(w, fan).on); w.t = 1.9; ok(KP.fanState(w, fan).warn);
    ok(KP.fanState({ t: 5 }, { ...fan, period: undefined }).on, 'brez period piha ves čas');
  });

  test('krogla pokali: cups.json je veljaven (proge obstajajo, odklepi brez krogov), Klasični turnir nespremenjen', ctx => {
    const C = ctx.kroglaCups, ids = ctx.kroglaLevels.map(L => L.id);
    eq(KR.validateCups(C, ids), []);
    const k = C.cups[0];
    eq(k.id, 'klasika'); eq(k.levels, KR.CLASSIC_IDS); eq(KR.cupBoard(k, 'normalna'), 'turnir:normalna'); eq(KR.cupBoard(k, 'noro'), KR.boardSeed.tourney('noro'));
    ok(k.mirror && k.unlock == null && (k.clock ?? 1) === 1 && k.ach === 'turnir');
    eq(KR.cupBoard(C.cups.find(c => c.id === 'sprint'), 'noro'), 'pokal:sprint:noro');
    eq(KR.cupBoard(C.cups.find(c => c.weekly), 'normalna', '2026-W48'), 'teden:2026-W48');
    eq(KR.cupDiffs(C.cups.find(c => c.id === 'pekel')), ['normalna', 'noro']);
    // napake validatorja
    const bad = JSON.parse(JSON.stringify(C));
    bad.cups[1].levels.push('99-ni');
    bad.cups[2].unlock = { cup: 'nobeden' };
    bad.cups[3].unlock = { cup: 'maraton' };   // turneja ← maraton ← turneja
    bad.cups[4].unlock = { ach: 'ni-dosezka' };
    const e = KR.validateCups(bad, ids).join('\n');
    ok(/99-ni/.test(e) && /nobeden/.test(e) && /ni-dosezka/.test(e), e);
    bad.cups[4].unlock = { cup: 'turneja' };
    ok(/krog/.test(KR.validateCups(bad, ids).join('\n')), 'krog odklepov');
    // pravila balansa turnirjev: lažja proga na začetku, najtežja zadnja ali predzadnja, med težkima oddih
    const lv = id => ctx.kroglaLevels.find(L => L.id === id);
    for (const c of C.cups.filter(x => !x.weekly && x.id !== 'klasika')) {
      const d = c.levels.map(id => lv(id).diff), max = Math.max(...d);
      ok(d[0] < max, c.id + ': prva proga ni lažja');
      ok(d.lastIndexOf(max) >= d.length - 2, c.id + ': najtežja ni zadnja ali predzadnja');
      for (let i = 1; i < d.length; i++) ok(!(d[i] === max && d[i - 1] === max), c.id + ': dve najtežji zapored');
    }
  });

  test('krogla pokali: odklepi (svež igralec: Klasični, Hrčkov, Tedenski)', ctx => {
    const C = ctx.kroglaCups, open = ach => C.cups.filter(c => KR.cupUnlocked(c, C, new Set(ach))).map(c => c.id);
    eq(open([]), ['klasika', 'hrcek', 'teden']);
    eq(open(['pokal-hrcek']), ['klasika', 'hrcek', 'sprint', 'teden']);
    eq(open(['sklop-1']), ['klasika', 'hrcek', 'sprint', 'teden']);
    eq(open(['sklop-2']), ['klasika', 'hrcek', 'turneja', 'teden']);
    eq(open(['pokal-turneja']), ['klasika', 'hrcek', 'maraton', 'teden']);
    eq(open(['pokal-turneja', 'turnir']), ['klasika', 'hrcek', 'maraton', 'pekel', 'teden']);
    ok(/Hrčkov pokal/.test(KR.unlockText(C.cups.find(c => c.id === 'sprint').unlock, C)));
    ok(KR.ACH.some(a => a.key === 'pokal-pekel') && KR.ACH.find(a => a.key === 'zlato-vse').desc.includes('12 klasičnih'));
  });

  test('krogla tedenski pokal: ISO teden, determinističen izbor po pravilih, brez ponovitev, 52 tednov pokrije bazen', ctx => {
    eq(KR.isoWeek('2026-11-26'), '2026-W48'); eq(KR.isoWeek('2027-01-01'), '2026-W53'); eq(KR.isoWeek('2025-12-29'), '2026-W01');
    for (const d of ['2026-01-01', '2026-03-30', '2026-12-31', '2027-06-15', '2028-01-02']) eq(KR.isoWeek(d), Q.isoWeek(d), d);
    eq(KR.weekShift('2026-W52', 2), '2027-W01'); eq(KR.weekShift('2026-W01', -1), '2025-W52');
    const L = ctx.kroglaLevels, by = new Map(L.map(x => [x.id, x]));
    const a = KR.weeklyPick(U.rng, '2026-W48', L), b = KR.weeklyPick(U.rng, '2026-W48', JSON.parse(JSON.stringify(L)));
    eq(a, b, 'determinističen');
    const pool = L.filter(x => x.diff <= 4).map(x => x.id), seen = new Set();
    let prev = null;
    for (let k = 0; k < 52; k++) {
      const ids = KR.weeklyPick(U.rng, KR.weekShift('2026-W48', k), L);
      eq(ids.length, 5);
      const ls = ids.map(id => by.get(id));
      eq(ls.map(x => KR.lenOf(x)).sort(), ['dolga', 'kratka', 'srednja', 'srednja', 'srednja']);
      ok(ls.every(x => x.diff <= 4), 'diff ≤ 4');
      const avg = ls.reduce((s, x) => s + x.diff, 0) / 5;
      ok(avg >= 2.5 && avg <= 3.5, 'povprečje ' + avg);
      for (let i = 1; i < 5; i++) ok(ls[i].diff >= ls[i - 1].diff, 'od lažje k težji');
      if (prev) ok(!ids.some(id => prev.includes(id)), 'proga dva tedna zapored');
      prev = ids; ids.forEach(id => seen.add(id));
    }
    eq(pool.filter(id => !seen.has(id)), [], 'vse proge iz bazena');
  });

  test('krogla dnevni izziv: DAILY_POOL (01–08 + nove z diff ≤ 3, ki niso dolge)', ctx => {
    const L = ctx.kroglaLevels, order = L.map(x => x.id);
    const expect = L.filter(x => parseInt(x.id, 10) <= 8 || (parseInt(x.id, 10) >= 13 && x.diff <= 3 && x.len !== 'dolga')).map(x => x.id);
    eq(KR.DAILY_POOL.slice().sort(), expect.slice().sort());
    const days = Array.from({ length: 40 }, (_, i) => KR.dailyPick(U.rng, '2027-dan-' + i, order, KR.DAILY_POOL));
    for (const d of days) { eq(d.levels.length, 3); ok(d.levels.every(id => KR.DAILY_POOL.includes(id))); }
    ok(days.some(d => d.levels.some(id => parseInt(id, 10) >= 13)), 'nove proge v dnevnem izboru');
    eq(KR.dailyPick(U.rng, '2026-11-21', order), KR.dailyPick(U.rng, '2026-11-21', order.slice(0, 12)), 'brez bazena: kot prej (prvih 8)');
  });

  test('krogla balans: izmerjena težavnost ±1 od deklarirane, Spearman ≥ 0,7 (10 voženj)', ctx => {
    const rows = ctx.kroglaLevels.map(L => KB.measureLevel(L, { runs: 10 }));
    for (const r of rows) ok(Math.abs(r.measured - r.diff) <= 1, `${r.id}: deklarirano ${r.diff}, izmerjeno ${r.measured}`);
    const rho = KB.spearman(rows.map(r => r.diff), rows.map(r => r.score));
    ok(rho >= 0.7, 'Spearman ' + rho.toFixed(2));
    eq(KB.noisyRun(ctx.kroglaLevels[0], 'x'), KB.noisyRun(ctx.kroglaLevels[0], 'x'), 'zašumljena vožnja je deterministična');
    eq(KB.spearman([1, 2, 3], [3, 2, 1]), -1);
    return 'Spearman ' + rho.toFixed(2);
  });

  test('krogla pokali: rezerva ure (autopilot) — Normalna 20–40 %, Lahka ≥ 50 %, Noro ≤ 15 % ali ne konča', ctx => {
    const by = new Map(ctx.kroglaLevels.map(L => [L.id, L]));
    const runs = new Map(ctx.kroglaLevels.map(L => [L.id, KB.cleanRun(L)]));
    const out = [];
    for (const c of ctx.kroglaCups.cups.filter(x => !x.weekly && x.id !== 'klasika')) {
      const ls = c.levels.map(id => by.get(id));
      const sim = d => KB.cupClockSim(c, ls, d, runs);
      const ds = KR.cupDiffs(c);
      if (ds.includes('normalna')) { const n = sim('normalna'); ok(n.done && n.reserve >= 0.2 && n.reserve <= 0.4, `${c.id}: Normalna ${Math.round(n.reserve * 100)} %`); out.push(`${c.id} ${Math.round(n.reserve * 100)} %`); }
      if (ds.includes('lahka')) { const e = sim('lahka'); ok(e.done && e.reserve >= 0.5, `${c.id}: Lahka ${Math.round(e.reserve * 100)} %`); }
      if (ds.includes('noro')) { const x = sim('noro'), x0 = KB.cupClockSim(c, ls, 'noro', runs, { clocks: false }); ok((x.done && x.reserve <= 0.15) || !x0.done, `${c.id}: Noro ${Math.round(x.reserve * 100)} %`); }
    }
    return out.join(', ');
  });
}
