/* =====================================================================
   Testi športnega okvirja, 3. faza (shared/sport/): koledar sezone
   (determinizem, okna po ljubljanskem času, prehod na poletni/zimski čas,
   finale), točke pokala in razvrstitve z izenačenji, rez za 2. serijo,
   KO pari in srečni poraženci, turneja, kariera (rivali iz seeda,
   napredovanje, izvoz/uvoz). Registrira jih tests/tests.js.
   ===================================================================== */
import * as SE from '../shared/sport/season.js';
import * as KO from '../shared/sport/ko.js';
import * as CA from '../shared/sport/career.js';
import * as C from '../shared/sport/competition.js';

const VENUES = { venues: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], finals: ['F1', 'F2'], extra: ['X'], tour: { venues: ['t1', 't2', 't3', 't4'], months: [11] }, conditions: [{ id: 'none', weight: 3 }, { id: 'sneg' }] };
const row = (user_id, event, round, points, dist = 100) => ({ user_id, event, round, points, dist });

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function sport3Tests(test, { eq, ok }) {
  test('sport: koledar sezone je determinističen (isti mesec in seed = isti koledar)', () => {
    const a = SE.calendar('2027-01', VENUES), b = SE.calendar('2027-01', VENUES);
    eq(a, b);
    ok(JSON.stringify(SE.calendar('2027-02', VENUES)) !== JSON.stringify(a), 'drug mesec = drug koledar');
    ok(JSON.stringify(SE.calendar('2027-01', { ...VENUES, seed: 'drug' })) !== JSON.stringify(a), 'drug seed = drug koledar');
    eq(a.name, 'Pokal Januarja 2027');
    eq(SE.seasonName('2026-11'), 'Pokal Novembra 2026');
  });
  test('sport: koledar — 10 ali 11 postaj po 2–3 dni, brez lukenj, finale zadnji, turneja pred finalom (december)', () => {
    for (const s of ['2026-12', '2027-01', '2027-02', '2027-04', '2028-02']) {
      const cal = SE.calendar(s, VENUES);
      const days = SE.daysIn(s);
      eq(cal.events.length, Math.ceil(days / 3), s + ': število postaj');
      ok(cal.events.every(e => e.days >= 2 && e.days <= 3), s + ': 2–3 dni');
      eq(cal.events.reduce((x, e) => x + e.days, 0), days, s + ': cel mesec');
      for (let i = 1; i < cal.events.length; i++) eq(cal.events[i].opens, cal.events[i - 1].closes, s + ': brez lukenj');
      const p = SE.parseSeason(s);
      eq(cal.events[0].opens, SE.ljMidnight(p.y, p.m, 1), s + ': začetek ob polnoči 1. dne');
      eq(cal.events.at(-1).closes, SE.ljMidnight(p.y, p.m + 1, 1), s + ': konec ob polnoči 1. naslednjega');
      const last = cal.events.at(-1);
      ok(last.final && VENUES.finals.includes(last.venue), s + ': finale na letalnici');
      ok(cal.events.every(e => e.r2 === e.closes - 86400e3 || e.r2 === e.closes - 82800e3 || e.r2 === e.closes - 90000e3), s + ': 2. serija zadnji dan');
      for (let i = 1; i < cal.events.length - 1; i++) ok(cal.events[i].venue !== cal.events[i - 1].venue, s + ': ista postaja zapored');
      const tour = cal.events.filter(e => e.tour);
      if (p.m === 11) eq(tour.map(e => e.venue), VENUES.tour.venues, s + ': turneja');
      else eq(tour.length, 0, s + ': turneja le decembra');
      if (p.m === 11) eq(tour.map(e => e.idx), [cal.events.length - 4, cal.events.length - 3, cal.events.length - 2, cal.events.length - 1].map(x => x), s + ': pred finalom');
    }
  });
  test('sport: okna po ljubljanskem času (zimski +1 h, poletni +2 h, prehod marec/oktober)', () => {
    eq(new Date(SE.ljMidnight(2026, 11, 1)).toISOString(), '2026-11-30T23:00:00.000Z');
    eq(new Date(SE.ljMidnight(2027, 6, 1)).toISOString(), '2027-06-30T22:00:00.000Z');
    // 28. 3. 2027 je zadnja nedelja v marcu: polnoč še CET, naslednja polnoč CEST
    eq(new Date(SE.ljMidnight(2027, 2, 28)).toISOString(), '2027-03-27T23:00:00.000Z');
    eq(new Date(SE.ljMidnight(2027, 2, 29)).toISOString(), '2027-03-28T22:00:00.000Z');
    // 31. 10. 2027: polnoč še CEST, naslednja CET
    eq(new Date(SE.ljMidnight(2027, 9, 31)).toISOString(), '2027-10-30T22:00:00.000Z');
    eq(new Date(SE.ljMidnight(2027, 10, 1)).toISOString(), '2027-10-31T23:00:00.000Z');
    // dan prehoda ima 23 oz. 25 ur
    eq(SE.ljMidnight(2027, 2, 29) - SE.ljMidnight(2027, 2, 28), 23 * 3600e3);
    eq(SE.ljMidnight(2027, 10, 1) - SE.ljMidnight(2027, 9, 31), 25 * 3600e3);
    eq(SE.ljParts(Date.UTC(2027, 2, 28, 0, 59)), { y: 2027, m: 2, d: 28, h: 1 });
    eq(SE.ljParts(Date.UTC(2027, 2, 28, 1, 0)), { y: 2027, m: 2, d: 28, h: 3 });
    eq(SE.ljParts(Date.UTC(2027, 9, 31, 0, 30)).h, 2);
    eq(SE.ljParts(Date.UTC(2027, 9, 31, 1, 30)).h, 2);
    eq(SE.seasonOf(Date.UTC(2026, 10, 30, 23, 30)), '2026-12');   // 0:30 1. 12. po Ljubljani
    eq(SE.seasonOf(Date.UTC(2026, 10, 30, 22, 30)), '2026-11');
    // primer s prehodom: marčevska sezona — postaje po 29. 3. se odpirajo ob 22:00 UTC
    const mar = SE.calendar('2027-03', VENUES);
    ok(mar.events.filter(e => SE.ljParts(e.opens).d > 28).every(e => new Date(e.opens).getUTCHours() === 22), 'poletni čas');
    ok(mar.events.filter(e => SE.ljParts(e.opens).d <= 28).every(e => new Date(e.opens).getUTCHours() === 23), 'zimski čas');
  });
  test('sport: stanje postaje (prihaja / 1. serija / 2. serija zadnji dan / končano)', () => {
    const ev = SE.calendar('2027-01', VENUES).events[2];
    eq(SE.eventState(ev, ev.opens - 1), 'soon');
    eq(SE.eventState(ev, ev.opens), 'open');
    eq(SE.eventState(ev, ev.r2 - 1), 'open');
    eq(SE.eventState(ev, ev.r2), 'r2');
    eq(SE.eventState(ev, ev.closes), 'done');
    ok(SE.roundOpen(ev, 1, ev.r2 + 1) && !SE.roundOpen(ev, 2, ev.r2 - 1) && SE.roundOpen(ev, 2, ev.r2) && !SE.roundOpen(ev, 1, ev.closes));
  });
  test('sport: točke pokala (100-80-60 … 30. mesto 1) in razvrstitev postaje z izenačenji', () => {
    eq(SE.CUP_POINTS.length, 30);
    eq(SE.CUP_POINTS.slice(0, 17), [100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15, 14]);
    eq(SE.CUP_POINTS.at(-1), 1);
    eq(SE.cupPointsFor(31), 0);
    const rows = [row('a', 1, 1, 120), row('b', 1, 1, 118), row('c', 1, 1, 120), row('d', 1, 1, 90), row('a', 1, 2, 110), row('c', 1, 2, 110), row('b', 1, 2, 112)];
    const st = SE.eventStandings(rows, 1);
    eq(st.map(x => [x.user_id, x.rank, x.total, x.cupPoints]), [['a', 1, 230, 100], ['b', 1, 230, 100], ['c', 1, 230, 100], ['d', 4, 90, 50]]);
  });
  test('sport: rez za 2. serijo (najboljših 30, izenačeni na meji vsi, pri manj vsi)', () => {
    const pts = Array.from({ length: 35 }, (_, i) => 200 - i);
    ok(SE.makesCut(pts[29], pts) && !SE.makesCut(pts[30], pts));
    const tie = [...pts.slice(0, 29), 171, 171, 171, 100];
    ok(SE.makesCut(171, tie), 'izenačeni na meji gredo naprej');
    ok(SE.makesCut(1, [1, 2, 3]), 'pri manj kot 30 vsi');
    // 2. serija tistega, ki ni v rezu, se ne šteje
    const rows = [...pts.map((p, i) => row('u' + i, 1, 1, p)), row('u34', 1, 2, 300)];
    const s = SE.eventStandings(rows, 1);
    const u34 = s.find(x => x.user_id === 'u34');
    eq([u34.inCut, u34.r2, u34.total], [false, null, 166]);
  });
  test('sport: skupna razvrstitev sezone (vsota točk, izenačenje: več zmag, nato več drugih mest) in vodilni', () => {
    const cal = { events: [{ idx: 1 }, { idx: 2 }, { idx: 3 }] };
    // a: 1., 3., 4. = 100+60+50 = 210 · b: 2., 2., 1. = 80+80+100 = 260 · c: 3., 1., 2. = 60+100+80 = 240
    const rows = [
      row('a', 1, 1, 300), row('b', 1, 1, 200), row('c', 1, 1, 100),
      row('c', 2, 1, 300), row('b', 2, 1, 200), row('a', 2, 1, 100),
      row('b', 3, 1, 300), row('c', 3, 1, 200), row('d', 3, 1, 150), row('a', 3, 1, 100),
    ];
    const st = SE.seasonStandings(rows, cal);
    eq(st.map(x => [x.user_id, x.rank, x.cup, x.wins]), [['b', 1, 260, 1], ['c', 2, 240, 1], ['a', 3, 210, 1], ['d', 4, 60, 0]]);
    eq(SE.leaders(rows, cal), ['b']);
    // izenačenje v točkah: odloči več zmag, nato več drugih mest
    const cal2 = { events: [{ idx: 1 }, { idx: 2 }, { idx: 3 }] };
    const r2 = [row('x', 1, 1, 10), row('y', 1, 1, 9), row('y', 2, 1, 10), row('x', 2, 1, 9), row('z', 3, 1, 9), row('y', 3, 1, 9), row('x', 3, 1, 10)];
    // x: 100+80+100 = 280 (2 zmagi) · y: 80+100+80 = 260 (z in y deljeno 2. na 3. postaji)
    const st2 = SE.seasonStandings(r2, cal2);
    eq(st2[0].user_id, 'x');
    const t = SE.seasonStandings([row('p', 1, 1, 10), row('q', 1, 1, 9), row('q', 2, 1, 10), row('p', 2, 1, 9)], cal2);
    eq(t.map(x => [x.user_id, x.rank]), [['p', 1], ['q', 1]], 'popolno izenačenje = deljeno mesto');
    eq(SE.leaders([row('p', 1, 1, 10), row('q', 1, 1, 9), row('q', 2, 1, 10), row('p', 2, 1, 9)], cal2).sort(), ['p', 'q']);
    // po 2 postajah so a, b, c izenačeni pri 160 (a in c imata zmago → deljeno 1., b 3.); po 3.: b 1., c 2., a 3.
    const mv = SE.seasonMoves(rows, cal);
    eq([mv.a, mv.b, mv.c], [-2, 2, -1]);
  });
  test('sport: turneja v sezoni (vsota točk skokov, kdor zamudi postajo, izpade) in posebni naslovi', () => {
    const cal = { events: [{ idx: 1, tour: true }, { idx: 2, tour: true }, { idx: 3, tour: true }, { idx: 4, tour: true }, { idx: 5, venue: 'F' }] };
    const rows = [];
    for (let e = 1; e <= 4; e++) { rows.push(row('a', e, 1, 100), row('a', e, 2, 100), row('b', e, 1, 120), row('b', e, 2, 110)); if (e !== 3) rows.push(row('c', e, 1, 200), row('c', e, 2, 200)); }
    rows.push(row('a', 5, 1, 300));
    const t = SE.tourStandings(rows, cal);
    eq(t.map(x => [x.user_id, x.rank, x.total, x.missed]), [['b', 1, 920, 0], ['a', 2, 800, 0], ['c', null, 1200, 1]]);
    const titles = SE.seasonTitles(rows, cal, { flying: e => e.venue === 'F' });
    eq(titles.find(x => x.key === 'kralj')?.user_id, 'a');
    ok(titles.find(x => x.key === 'stanoviten'));
  });
  test('sport: KO pari (1.–50., 2.–49. …), vrstni red, zmagovalci + 5 srečnih poražencev = 30', () => {
    const ids = Array.from({ length: 50 }, (_, i) => 's' + (i + 1));
    const ko = KO.koPairs(ids);
    eq(ko.pairs.length, 25);
    eq(ko.pairs[0], { hi: 's1', lo: 's50' });
    eq(ko.pairs[24], { hi: 's25', lo: 's26' });
    eq(KO.koOrder(ko).slice(0, 4), ['s26', 's25', 's27', 's24']);
    eq(KO.koOrder(ko).slice(-2), ['s50', 's1']);
    const sc = Object.fromEntries(ids.map((id, i) => [id, 200 - i]));   // boljši nasev = več točk
    const a = KO.koAdvance(ko, sc);
    eq([a.advance.length, a.winners.length, a.lucky.length], [30, 25, 5]);
    eq(a.lucky, ['s26', 's27', 's28', 's29', 's30']);
    eq(KO.luckyCount(50), 5);
    // izenačenje v paru: oba naprej
    const tie = { ...sc, s50: 200 };
    const b = KO.koAdvance(ko, tie);
    ok(b.winners.includes('s1') && b.winners.includes('s50'));
    // liho število: srednji brez para gre naprej
    const k3 = KO.koPairs(['a', 'b', 'c']);
    eq([k3.pairs, k3.bye], [[{ hi: 'a', lo: 'c' }], 'b']);
    eq(KO.koAdvance(k3, { a: 1, b: 5, c: 2 }, { lucky: 0 }).advance.sort(), ['b', 'c']);
  });
  test('sport: tekma s KO (competition ko: true) — 1. serija v parih, v 2. zmagovalci in srečni poraženci', () => {
    const parts = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + (i + 1), name: 'P' + (i + 1) }));
    let st = C.createCompetition({ seed: 'ko', participants: parts, rounds: 2, ko: true, order1: 'given' });
    eq(st.rounds[0].order, ['p6', 'p5', 'p7', 'p4', 'p8', 'p3', 'p9', 'p2', 'p10', 'p1']);
    eq(st.participants.map(p => p.bib), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // vsi nižji nasevi zmagajo svoj par (presenečenje), p6 izgubi z najmanj
    const score = { p1: 100, p10: 101, p2: 110, p9: 111, p3: 120, p8: 121, p4: 130, p7: 131, p5: 90, p6: 95 };
    while (!st.finished && C.roundNumber(st) === 1) { const id = C.currentId(st); st = C.record(st, id, { score: score[id] }); }
    eq(st.rounds[1].order.length, 6, '5 zmagovalcev + 1 srečni poraženec');
    eq(new Set(st.rounds[1].order), new Set(['p10', 'p9', 'p8', 'p7', 'p6', 'p4']));
    eq(st.koResult.lucky, ['p4']);
    // brez ko se nič ne spremeni (obstoječe tekme)
    const plain = C.createCompetition({ seed: 'ko', participants: parts, rounds: 2 });
    ok(!plain.ko && !plain.cfg.ko);
  });
  test('sport: skupna razvrstitev več tekem (tourTotal)', () => {
    const t = KO.tourTotal([[{ id: 'a', total: 250 }, { id: 'b', total: 240 }], [{ id: 'a', total: 230 }, { id: 'b', total: 250 }, { id: 'c', total: 300 }]]);
    eq(t.map(x => [x.id, x.rank, x.total, x.missed]), [['b', 1, 490, 0], ['a', 2, 480, 0], ['c', null, 300, 1]]);
  });
  test('sport: pokal več tekem (seriesTotal) — točke pokala po mestu ali točke skokov, zamujena tekma = 0, izenačenje po zmagah', () => {
    const c1 = [{ id: 'a', total: 250, rank: 1, status: 'ok' }, { id: 'b', total: 240, rank: 2, status: 'ok' }, { id: 'c', total: 0, rank: null, status: 'dns' }];
    const c2 = [{ id: 'b', total: 260, rank: 1, status: 'ok' }, { id: 'a', total: 200, rank: 2, status: 'ok' }, { id: 'c', total: 199, rank: 3, status: 'ok' }];
    const cup = KO.seriesTotal([c1, c2], { pointsFor: SE.cupPointsFor });
    // a: 100 + 80 · b: 80 + 100 → izenačeno, oba 1 zmaga in 1 drugo mesto → deljeno 1.; c: 0 + 60
    eq(cup.map(x => [x.id, x.rank, x.total, x.parts]), [['a', 1, 180, [100, 80]], ['b', 1, 180, [80, 100]], ['c', 3, 60, [null, 60]]]);
    eq(cup.find(x => x.id === 'c').missed, 1);
    const pts = KO.seriesTotal([c1, c2]);
    eq(pts.map(x => [x.id, x.rank, x.total]), [['b', 1, 500], ['a', 2, 450], ['c', 3, 199]]);
    // izenačenje v točkah, odloči več zmag
    const t = KO.seriesTotal([[{ id: 'x', total: 1, rank: 1 }, { id: 'y', total: 1, rank: 2 }], [{ id: 'y', total: 1, rank: 1 }, { id: 'x', total: 1, rank: 3 }], [{ id: 'y', total: 1, rank: 3 }, { id: 'x', total: 1, rank: 3 }]],
      { pointsFor: r => [0, 10, 5, 0][r] });
    eq(t.map(x => [x.id, x.total, x.wins]), [['y', 15, 1], ['x', 10, 1]]);
  });
  test('sport: kariera — rivali so deterministični iz seeda, forma niha, mojstri imajo prednost na svojem prizorišču', () => {
    const pool = Array.from({ length: 40 }, (_, i) => ({ name: 'Rival ' + i, flag: 'si' }));
    const a = CA.makeRivals('s1', pool, 29, { specTags: ['letalnica'] }), b = CA.makeRivals('s1', pool, 29, { specTags: ['letalnica'] });
    eq(a, b);
    eq(a.length, 29);
    ok(JSON.stringify(CA.makeRivals('s2', pool, 29)) !== JSON.stringify(a));
    const leagues = [{ id: 'l1', name: 'L1', tags: ['m'], skill: [0.2, 0.6] }, { id: 'l2', name: 'L2', tags: ['v', 'x'], skill: [0.5, 0.9] }];
    let st = CA.createCareer({ seed: 's1', leagues, rivals: a });
    st = CA.startSeason(st, [{ id: 'h1', tag: 'm' }, { id: 'h2', tag: 'm' }, { id: 'h3', tag: 'v' }, { id: 'h4', tag: 'x' }]);
    ok(st.schedule.length >= 6 && st.schedule.length <= 8, 'tekme v sezoni');
    ok(st.schedule.every(e => e.tag === 'm'));
    const f = CA.field(st);
    ok(f.every(x => x.skill >= 0.05 && x.skill <= 1));
    eq(CA.field(st), f, 'ista tekma = ista spretnost');
    const forms = st.schedule.map(e => CA.formOf(st, a[0], e));
    ok(new Set(forms).size > 2, 'forma niha');
    const m = a.find(r => r.spec === 'letalnica') || { ...a[0], spec: 'letalnica', char: 'mojster' };
    const ev = { idx: 1, tag: 'letalnica' }, ev2 = { idx: 1, tag: 'm' };
    const st2 = { ...st, rivals: [m] };
    ok(CA.field(st2, ev)[0].skill > CA.field(st2, ev2)[0].skill || CA.field(st2, ev)[0].skill === 1);
  });
  test('sport: kariera — točke, napredovanje (med 10 → višja liga), statistika, nova sezona, izvoz/uvoz', () => {
    const pool = Array.from({ length: 40 }, (_, i) => ({ name: 'R' + i }));
    const leagues = [{ id: 'l1', name: 'L1', tags: ['m'], skill: [0.2, 0.6] }, { id: 'l2', name: 'L2', tags: ['v'], skill: [0.5, 0.9] }];
    let st = CA.startSeason(CA.createCareer({ seed: 'k', leagues, rivals: CA.makeRivals('k', pool) }), [{ id: 'h1', tag: 'm' }, { id: 'h3', tag: 'v' }]);
    const n = st.schedule.length;
    let out;
    for (let i = 0; i < n; i++) {
      // igralec 8. na vsaki tekmi
      const ids = st.rivals.map(r => r.id);
      const rows = [...ids.slice(0, 7).map((id, k) => ({ id, rank: k + 1 })), { id: 'me', rank: 8 }, ...ids.slice(7).map((id, k) => ({ id, rank: 9 + k }))];
      out = CA.recordEvent(st, rows, { longest: 60 + i });
      st = out.state;
      if (i < n - 1) { ok(!out.seasonEnd); eq(CA.seasonTable(st).find(x => x.id === 'me').points, 32 * (i + 1)); }
    }
    ok(out.seasonEnd && out.promoted && !out.champion);
    eq([st.league, st.seasonNo, st.eventIdx, st.stats.seasons, st.stats.events, st.stats.longest], [1, 2, 0, 1, n, 60 + n - 1]);
    ok(st.schedule.every(e => e.tag === 'v'), 'nova liga, nova prizorišča');
    eq(st.history[0].place, 8);
    // zadnja liga: brez napredovanja, zmaga = prvak
    const code = CA.exportCareer(st);
    ok(code.startsWith('KARIERA1:'));
    eq(CA.importCareer(code), st);
    eq(CA.importCareer('KARIERA1:xxx'), null);
    eq(CA.restoreCareer({ v: 1 }), null);
    // 11. mesto: brez napredovanja
    let s2 = CA.startSeason(CA.createCareer({ seed: 'k2', leagues, rivals: CA.makeRivals('k2', pool) }), [{ id: 'h1', tag: 'm' }]);
    while (!CA.seasonOver(s2)) {
      const ids = s2.rivals.map(r => r.id);
      const o = CA.recordEvent(s2, [...ids.slice(0, 10).map((id, k) => ({ id, rank: k + 1 })), { id: 'me', rank: 11 }]);
      s2 = o.state;
      if (o.seasonEnd) { ok(!o.promoted); eq(o.seasonPlace, 11); break; }
    }
    eq(s2.league, 0);
  });
}
