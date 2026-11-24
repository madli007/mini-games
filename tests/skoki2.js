/* =====================================================================
   Testi 2. faze Smučarskih skokov: sport/competition.js, sport/live-replay.js,
   žirija, veter serije, dnevni izziv, lastni skakalci (uvoz/izvoz, statistika),
   lokalna tekma (ljudje z vnaprej posnetimi vnosi + boti), nove skakalnice,
   nespremenjenost prvih treh skakalnic (fiksture tests/fixtures/skoki-ref.json).
   Registrira jih tests/skoki.js.
   ===================================================================== */
import * as H from '../games/skoki/hill.js';
import * as PH from '../games/skoki/physics.js';
import * as GH from '../games/skoki/ghost.js';
import * as BOT from '../games/skoki/bot.js';
import * as C from '../games/skoki/sport/competition.js';
import * as LR from '../games/skoki/sport/live-replay.js';
import * as K from '../games/skoki/contest.js';
import * as JP from '../games/skoki/jumpers.js';
import { createWind } from '../games/skoki/wind.js';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function skokiPhase2Tests(test, { eq, ok }) {
  const hillOf = (ctx, id) => { const def = ctx.skokiHills.find(h => h.id === id); return { def, hill: H.buildHill(def) }; };
  const people = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Igralec ' + i }));

  /* ------------------------------------------------------------ nespremenjenost 1. faze */
  test('skoki: prve tri skakalnice so nespremenjene (isti vnosi = ista daljava kot v 1. fazi)', ctx => {
    const ref = ctx.skokiRef;
    eq(ref.paramsVersion, ctx.skokiParams.paramsVersion, 'paramsVersion');
    ok(ref.jumps.length >= 9, 'vsaj 9 referenčnih skokov');
    for (const j of ref.jumps) {
      const { hill } = hillOf(ctx, j.hill);
      const J = PH.simulate({ hill, P: ctx.skokiParams, gate: j.gate, wind: j.wind, input: GH.inputFrom(j.changes) });
      eq([J.s.dist, J.s.tick, J.s.x, J.s.landing.type, J.s.tableSpeed], [j.dist, j.tick, j.x, j.type, j.tableSpeed], j.hill + ' ' + JSON.stringify(j.wind));
    }
    for (const id of ['brezova', 'bistra', 'orlova']) ok(!hillOf(ctx, id).def.physics, id + ': brez bloka physics');
  });

  /* ------------------------------------------------------------ nove skakalnice */
  test('skoki: nove skakalnice (vsaj 5, skupine, odklepanje, letalnica in Luna se razlikujeta)', ctx => {
    const ids = ctx.skokiHills.map(d => d.id);
    for (const id of ['zajcek', 'sipina', 'reflektor', 'orlovo-gnezdo', 'mirno-morje']) ok(ids.includes(id), id);
    for (const d of ctx.skokiHills) { eq(H.validateHill(d), [], d.id); eq(d.group || 'trening', 'trening', d.id + ': skupina'); }
    const fly = hillOf(ctx, 'orlovo-gnezdo').def;
    eq([fly.k, fly.hs, fly.base, fly.meterValue], [200, 240, 120, 1.2]);
    const moon = hillOf(ctx, 'mirno-morje').def;
    ok(moon.physics.noAir && moon.physics.gravity === 1.62, 'Luna: brez zraka, 1,62 m/s²');
    // neznan parameter fizike je napaka
    const bad = structuredClone(moon); bad.physics.antigrav = 1;
    ok(H.validateHill(bad).some(e => e.includes('antigrav')), 'neznan physics');
    // čas leta: letalnica 7–8+ s, Luna balistično dolgo, Orlova ~5 s
    const flight = id => { const { def, hill } = hillOf(ctx, id); const b = BOT.createBot({ skill: 1, seed: 2 }); return PH.simulate({ hill, P: ctx.skokiParams, gate: def.gates.default, wind: { mode: 'off', seed: 0 }, input: s => b.input(s) }).s.flightTime; };
    const fo = flight('orlova'), ff = flight('orlovo-gnezdo'), fm = flight('mirno-morje');
    ok(ff >= 7 && ff <= 9.5, 'letalnica: let ' + ff.toFixed(2) + ' s');
    ok(ff > fo + 2, `letalnica (${ff.toFixed(1)} s) bistveno dlje kot Orlova (${fo.toFixed(1)} s)`);
    ok(fm > fo + 2, 'Luna: dolg balističen let ' + fm.toFixed(1) + ' s');
    // Luna: nagib v zraku ne vpliva na daljavo (ni vzgona)
    const { def: md, hill: mh } = hillOf(ctx, 'mirno-morje');
    const run = pitch => PH.simulate({ hill: mh, P: ctx.skokiParams, gate: md.gates.default, wind: { mode: 'random', seed: 3 }, input: s => {
      const t = s.tick, rel = s.phase === 'inrun' ? -(s.d / s.v) : 9;
      return { btn: s.phase === 'inrun' && rel >= 0 && t > 12 ? 2 : 0, pitch: s.phase === 'air' ? pitch : 0 };
    } }).s;
    const a = run(0), b2 = run(-8);
    ok(Math.abs(a.x - b2.x) < 1e-6 || Math.abs(a.dist - b2.dist) <= 0.5, `Luna: daljava neodvisna od nagiba (${a.dist} / ${b2.dist})`);
    eq(a.windSamples.every(w => w === 0), true, 'Luna: brez vetra');
    // odklepanje
    const defs = ctx.skokiHills;
    eq(K.unlocksBy(defs, { hill: hillOf(ctx, 'orlova').def, dist: 126, fall: false }).map(d => d.id).sort(), ['reflektor', 'sipina']);
    eq(K.unlocksBy(defs, { hill: hillOf(ctx, 'orlova').def, dist: 141, fall: false }).map(d => d.id).sort(), ['orlovo-gnezdo', 'reflektor', 'sipina']);
    eq(K.unlocksBy(defs, { hill: hillOf(ctx, 'orlova').def, dist: 141, fall: true }), [], 'padec ne odklene');
    eq(K.unlocksBy(defs, { hill: fly, dist: 201, fall: false }).map(d => d.id), ['mirno-morje']);
    ok(K.isOpen(hillOf(ctx, 'zajcek').def, new Set()) && K.isOpen(hillOf(ctx, 'orlova').def, new Set()), 'mini in velika odprti');
    ok(!K.isOpen(fly, new Set()) && K.isOpen(fly, new Set([K.unlockKey('orlovo-gnezdo')])), 'letalnica po odklepu');
  });

  /* ------------------------------------------------------------ competition.js */
  test('sport: vrstni red 1. serije iz seeda, 2. serija obratno po rezultatu, štartne številke', () => {
    const a = C.createCompetition({ seed: 's1', participants: people(6), rounds: 2 });
    const b = C.createCompetition({ seed: 's1', participants: people(6), rounds: 2 });
    eq(a.rounds[0].order, b.rounds[0].order, 'isti seed = isti vrstni red');
    const c = C.createCompetition({ seed: 's2', participants: people(6), rounds: 2 });
    ok(JSON.stringify(c.rounds[0].order) !== JSON.stringify(a.rounds[0].order), 'drug seed = drug vrstni red');
    eq(a.rounds[0].order.map(id => C.participant(a, id).bib), [1, 2, 3, 4, 5, 6], 'štartne številke po vrstnem redu');
    let st = a;
    const pts = { p0: 50, p1: 120, p2: 90, p3: 100, p4: 70, p5: 110 };
    for (let i = 0; i < 6; i++) st = C.record(st, C.currentId(st), { score: pts[C.currentId(st)] });
    eq(st.round, 1);
    eq(st.rounds[1].order, ['p0', 'p4', 'p2', 'p3', 'p5', 'p1'], 'najboljši skoči zadnji');
    let threw = false; try { C.record(st, 'p1', { score: 1 }); } catch (e) { threw = e.code === 'not_your_turn'; }
    ok(threw, 'ni na vrsti');
  });
  test('sport: rez za 2. serijo (izenačeni na meji gredo vsi), izenačenja, DSQ/DNS/DNF', () => {
    let st = C.createCompetition({ seed: 'rez', participants: people(6), rounds: 2, cut: 3 });
    const pts = { p0: 100, p1: 90, p2: 90, p3: 90, p4: 50, p5: 0 };
    for (let i = 0; i < 6; i++) {
      const id = C.currentId(st);
      st = id === 'p5' ? C.record(st, id, { status: 'dsq' }) : C.record(st, id, { score: pts[id] });
    }
    eq(st.rounds[1].order.length, 4, 'trije izenačeni za 2. mesto gredo vsi (4)');
    ok(!st.rounds[1].order.includes('p5') && !st.rounds[1].order.includes('p4'), 'DSQ in zadnji izpadeta');
    const s1 = C.standings(st);
    eq(s1.filter(r => r.rank === 2).length, 3, 'deljeno 2. mesto');
    eq(s1.find(r => r.id === 'p4').rank, 5, 'po deljenem mestu sledi 5.');
    eq(s1[s1.length - 1].status, 'dsq');
    // 2. serija: p2 DNF, ostali skočijo
    for (let i = 0; i < 4; i++) { const id = C.currentId(st); st = id === 'p2' ? C.record(st, id, { status: 'dnf' }) : C.record(st, id, { score: 60 }); }
    ok(st.finished, 'konec');
    const fin = C.standings(st);
    eq(fin[0].id, 'p0'); eq(fin[0].total, 160);
    eq(fin.find(r => r.id === 'p2').status, 'dnf');
    ok(fin.findIndex(r => r.id === 'p4') < fin.findIndex(r => r.id === 'p2'), 'izpadel po 1. seriji je pred DNF');
    // odhod: preostali skoki so DNS
    let st2 = C.createCompetition({ seed: 'odhod', participants: people(3), rounds: 2 });
    const gone = st2.rounds[0].order[1];
    st2 = C.markAbsent(st2, gone, 'dns');
    eq(st2.rounds[0].results[gone].status, 'dns');
    st2 = C.record(st2, C.currentId(st2), { score: 10 });
    ok(C.currentId(st2) !== gone, 'odsoten je preskočen');
  });
  test('sport: poskusna serija ne šteje, premik na konec, ekipe, posebne nagrade', () => {
    let st = C.createCompetition({ seed: 'p', participants: people(3).map((p, i) => ({ ...p, team: i % 2 ? 'B' : 'A' })), rounds: 1, trial: true });
    eq(st.rounds[0].kind, 'trial');
    const first = st.rounds[0].order.slice();
    st = C.moveToEnd(st, first[0]);
    eq(st.rounds[0].order, [first[1], first[2], first[0]], 'na konec serije');
    for (let i = 0; i < 3; i++) st = C.record(st, C.currentId(st), { score: 999 });
    eq(st.rounds[1].kind, 'score'); eq(st.rounds[1].order, [first[1], first[2], first[0]], 'po poskusni isti vrstni red');
    eq(C.roundNumber(st), 1);
    const sc = { p0: 10, p1: 20, p2: 30 };
    for (let i = 0; i < 3; i++) { const id = C.currentId(st); st = C.record(st, id, { score: sc[id], data: { dist: sc[id], style: 50 + sc[id] / 10, windAvg: id === 'p0' ? -1.5 : 0.5, fall: id === 'p1' } }); }
    eq(C.standings(st).map(r => r.total), [30, 20, 10], 'poskusna ne šteje');
    eq(C.teamStandings(st).map(t => [t.team, t.total]), [['A', 40], ['B', 20]]);
    const pr = C.prizes(st, K.PRIZES);
    eq(pr.find(p => p.key === 'najdaljsi').id, 'p2');
    eq(pr.find(p => p.key === 'padci').id, 'p1');
    eq(pr.find(p => p.key === 'veter').id, 'p0');
    eq(C.prizes(st, [{ key: 'x', title: 'x', pick: () => { throw new Error('!'); } }]), [], 'pokvarjen vtičnik ne podre tekme');
  });
  test('sport: obnova iz serializiranega stanja (JSON) in zavrnitev pokvarjenega', () => {
    let st = C.createCompetition({ seed: 'ser', participants: people(4), rounds: 2, cut: 2 });
    st = C.record(st, C.currentId(st), { score: 10 });
    st = C.record(st, C.currentId(st), { status: 'dns' });
    const back = C.restore(JSON.stringify(st));
    eq(back, st, 'enako stanje');
    eq(C.currentId(back), C.currentId(st));
    eq(C.restore('{"v":2}'), null); eq(C.restore('ni json'), null);
    eq(C.restore({ ...st, rounds: [{ order: [], results: { a: { status: 'xx', score: 1 } }, pos: 0 }] }), null, 'neznan status');
  });

  /* ------------------------------------------------------------ live-replay.js */
  test('sport: tok vnosov (izgubljen/zamujen/podvojen paket, pridružitev, ustavitev brez ugibanja)', () => {
    const sent = [];
    const S = LR.createSender({ jumpId: 'j', send: p => sent.push(p), every: 12 });
    const want = [];
    for (let t = 0; t < 300; t++) { const v = [t > 100 && t < 104 ? 2 : 0, t > 120 ? Math.round(Math.sin(t / 9) * 8) : 0]; S.push(t, v); want.push(v); }
    S.end();
    ok(sent.length >= 20, 'paketi ~vsakih 100 ms: ' + sent.length);
    // zamujeni in podvojeni paketi: vrstni red premešan, en paket dvakrat
    const R = LR.createReceiver({ jumpId: 'j' });
    const order = sent.map((_, i) => i).sort((a, b) => ((a * 7) % 5) - ((b * 7) % 5) || a - b);
    for (const i of order) R.accept(sent[i]);
    R.accept(sent[3]);
    ok(R.ended && R.have === 300, 'zložen ves tok');
    for (let t = 0; t < 300; t++) eq(R.inputAt(t) || [0, 0], want[t], 'tick ' + t);
    // izgubljen paket: gledalec se ustavi (ne ugiba), po ponovnem pošiljanju (need → full) nadaljuje
    const R2 = LR.createReceiver({ jumpId: 'j', delayMs: 0 });
    sent.forEach((p, i) => { if (i !== 5) R2.accept(p); });
    const lost = sent[5];
    ok(R2.have === lost.f && R2.missing, 'luknja: have ostane pred izgubljenim paketom');
    eq(R2.inputAt(lost.f + 1), null, 'brez ugibanja');
    let n = 0, stalled = false;
    for (let k = 0; k < 400; k++) { const a = R2.advance(1 / 60); n += a.n; stalled = stalled || a.stalled; }
    ok(stalled && R2.playTick === lost.f, 'ustavi se na luknji');
    R2.accept(S.full());
    ok(R2.ended && R2.have === 300, 'po celotnem toku dopolnjen');
    for (let t = 0; t < 300; t++) eq(R2.inputAt(t) || [0, 0], want[t]);
    // tuj skok se zavrne
    eq(R2.accept({ j: 'drug', f: 0, t: 5, c: [] }), false);
    // zamik: začne šele, ko ima ≥ 300 ms vnosov
    const R3 = LR.createReceiver({ jumpId: 'j', delayMs: 300 });
    R3.accept(sent[0]); R3.accept(sent[1]);
    eq(R3.advance(0.1).waiting, true, 'čaka na vmesni pomnilnik');
    for (let i = 2; i < 4; i++) R3.accept(sent[i]);
    eq(R3.advance(0.1).waiting, false, 'začne po 300 ms');
  });
  test('sport: host preveri skok s ponovno simulacijo (verify), ponaredek se zazna', ctx => {
    const { def, hill } = hillOf(ctx, 'bistra');
    const bot = BOT.createBot({ skill: 0.8, seed: 4 });
    const rec = new GH.InputRecorder();
    const sent = [];
    const S = LR.createSender({ jumpId: 'v', send: p => sent.push(p) });
    const wind = K.seriesWind('same', 'serija-1', 3);
    const J = PH.simulate({ hill, P: ctx.skokiParams, gate: 11, wind, input: (s, t) => { const i = bot.input(s); rec.push(t, i); S.push(t, [i.btn >= 2 ? 2 : i.btn ? 1 : 0, Math.round(i.pitch * 2)]); return i; } });
    S.end();
    const claimed = K.resultOf(J.s, def, ctx.skokiParams, { gate: 11, judgeSeed: 9 });
    const sim = ch => K.simulateFromInputs({ hill, P: ctx.skokiParams, gate: 11, wind, changes: ch, judgeSeed: 9 });
    const R = LR.createReceiver({ jumpId: 'v' });
    sent.forEach(p => R.accept(p));
    const v = LR.verify(sim, R.full(), claimed, K.sameResult);
    ok(v.ok, 'gledalec/host: ista daljava in točke kot skakalec');
    eq(v.result.dist, J.s.dist);
    const fake = LR.verify(sim, rec.changes, { ...claimed, total: claimed.total + 20, dist: claimed.dist + 10 }, K.sameResult);
    ok(!fake.ok && fake.result.total === claimed.total, 'ponarejene točke: velja hostov izračun');
  });

  /* ------------------------------------------------------------ žirija, veter, »za vodstvo« */
  test('skoki: žirija zniža zalet po skoku čez 95 % HS, kompenzacija velja, nova serija začne znova', ctx => {
    const def = hillOf(ctx, 'orlova').def;
    let j = K.createJury(def);
    eq([j.gate, j.start], [def.gates.default, def.gates.default]);
    let r = K.juryAfterJump(j, def, { dist: 130 });
    eq(r.msg, null, 'pod 95 % HS ni spremembe');
    r = K.juryAfterJump(j, def, { dist: 134, name: 'Ana' });
    eq(r.jury.gate, def.gates.default - 1);
    eq(r.msg, `Žirija je znižala zalet na ${def.gates.default - 1}.`);
    r = K.juryAfterJump(r.jury, def, { dist: 145 });
    eq(r.jury.gate, def.gates.default - 3, 'čez HS + 3 m: za 2');
    eq(K.juryNewRound(r.jury).gate, def.gates.default);
    eq(K.juryAfterJump(K.createJury(def, { auto: false }), def, { dist: 150 }).msg, null, 'ročno: brez žirije');
    // nižji zalet = manj hitrosti, a plus točke (kompenzacija glede na začetno mesto serije)
    const { hill } = hillOf(ctx, 'orlova');
    const bot = () => { const b = BOT.createBot({ skill: 0.9, seed: 8 }); return s => b.input(s); };
    const hi = PH.simulate({ hill, P: ctx.skokiParams, gate: 13, wind: { mode: 'off' }, input: bot() });
    const lo = PH.simulate({ hill, P: ctx.skokiParams, gate: 11, wind: { mode: 'off' }, input: bot() });
    ok(lo.s.tableSpeed < hi.s.tableSpeed && lo.s.dist < hi.s.dist, 'nižji zalet = krajši skok');
    const rl = K.resultOf(lo.s, def, ctx.skokiParams, { gate: 11, refGate: 13, judgeSeed: 1 });
    eq(rl.gatePts, 2 * def.gateFactor, 'kompenzacija +2 mesti');
  });
  test('skoki: enak veter za vse (isti seed serije = isti profil), spremenljiv po štartni številki', ctx => {
    const P = ctx.skokiParams;
    const a = K.seriesWind('same', 'tekma:s1', 1), b = K.seriesWind('same', 'tekma:s1', 7);
    eq(a, b, 'enak za vse v seriji');
    const wa = createWind(a, P), wb = createWind(b, P);
    for (let t = 0; t < 8; t += 0.37) eq(wa.at(t, t * 12), wb.at(t, t * 12));
    ok(JSON.stringify(K.seriesWind('same', 'tekma:s2', 1)) !== JSON.stringify(a), 'druga serija, drug veter');
    ok(K.seriesWind('var', 'tekma:s1', 1).seed !== K.seriesWind('var', 'tekma:s1', 2).seed, 'spremenljiv: po štartni številki');
    eq(K.seriesWind('off', 'x', 1).mode, 'off');
    // za vodstvo potrebuje …
    const def = hillOf(ctx, 'orlova').def;
    const d = K.distForLead(def, { leaderTotal: 130, myTotal: 0, gate: 13, refGate: 13, windAvg: 0 });
    ok(d > def.k && d < def.hs + 25, 'daljava za vodstvo ' + d);
    eq(K.distForLead(def, { leaderTotal: 800, gate: 13, refGate: 13 }), null, 'nemogoče');
  });

  /* ------------------------------------------------------------ dnevni izziv */
  test('skoki: dnevni izziv (determinizem, isti za vse, pogoj dneva, Luna samo na Luni)', ctx => {
    const defs = ctx.skokiHills;
    const a = K.dailyPick('2026-11-24', defs), b = K.dailyPick('2026-11-24', structuredClone(defs));
    eq(a, b, 'isti dan = isti izbor');
    ok(defs.some(d => d.id === a.hill) && K.CONDITIONS.some(c => c.id === a.cond.id));
    const seen = new Set(), hills = new Set();
    for (let i = 0; i < 120; i++) {
      const day = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
      const p = K.dailyPick(day, defs);
      seen.add(p.cond.id); hills.add(p.hill);
      if (p.cond.id === 'luna') eq(p.hill, 'mirno-morje', 'Luna samo na Lunini skakalnici');
      if (p.hill === 'mirno-morje') eq(p.wind.mode, 'off');
      else { eq(p.wind.mode, 'const'); ok(Math.abs(p.wind.speed) <= 2); }
      ok(p.gate >= 1 && p.gate <= defs.find(d => d.id === p.hill).gates.count);
      if (p.cond.id === 'nizko') eq(p.gate, p.refGate - 3);
    }
    ok(seen.size >= 5, 'različni pogoji: ' + [...seen].join(', '));
    ok(hills.size >= 5, 'različne skakalnice');
    // sneženje: več trenja = manjša hitrost; »samo telemark«: dve nogi = slog padca
    const { def, hill } = hillOf(ctx, 'bistra');
    const sp = mods => { const bt = BOT.createBot({ skill: 1, seed: 1 }); return PH.simulate({ hill, P: ctx.skokiParams, gate: 11, wind: { mode: 'off' }, mods, input: s => bt.input(s) }).s; };
    ok(sp({ inrunMu: 1.25 }).tableSpeed < sp(null).tableSpeed, 'sneženje: počasneje');
    const two = PH.simulate({ hill, P: ctx.skokiParams, gate: 11, wind: { mode: 'off' }, input: (() => { const bt = BOT.createBot({ skill: 1, seed: 6 }); let land = -1; return s => { const i = bt.input(s); if (s.phase === 'air' && s.takeoff && i.btn) { land = land < 0 ? s.tick : land; } return land >= 0 ? { ...i, btn: 1 } : i; }; })() }).s;
    eq(two.landing.type, 'two');
    const norm = K.resultOf(two, def, ctx.skokiParams, { gate: 11, judgeSeed: 3 }), tele = K.resultOf(two, def, ctx.skokiParams, { gate: 11, judgeSeed: 3, teleOnly: true });
    ok(tele.style < norm.style - 10, `samo telemark: ${tele.style} < ${norm.style}`);
    ok(K.msToMidnight(new Date('2026-11-24T22:00:00Z')) <= 3600000 + 1000, 'do polnoči po Ljubljani');
  });

  /* ------------------------------------------------------------ lastni skakalci */
  test('skoki: moji skakalci — uvoz (prevelik, pokvarjen, neznana polja), izvoz koda/JSON', () => {
    const list = [JP.newJumper({ name: 'Ana Šuštar', type: 'human', flag: 'si' }, 0.1), JP.newJumper({ name: 'Bot Bine', type: 'bot', skill: 0.85, style: 'agresiven', suit: '#00ff00' }, 0.2)];
    const code = JP.exportCode(list);
    ok(code.startsWith('SKOKI1:') && code.length < 400, 'kratka koda: ' + code.length);
    eq(JP.importList(code).list, list, 'koda → isti seznam (s šumniki)');
    eq(JP.importList(JP.exportJson(list)).list, list, 'JSON → isti seznam');
    const big = JP.importList('SKOKI1:' + 'A'.repeat(JP.IMPORT_MAX_CHARS));
    ok(big.errors[0].includes('prevelik'), 'prevelik');
    ok(JP.importList('SKOKI1:%%%').errors[0].includes('pokvarjen'), 'pokvarjena koda');
    ok(JP.importList('{"jumpers": 5').errors.length, 'pokvarjen JSON');
    const unk = JP.importList(JSON.stringify([{ ...list[0], hack: '<script>', admin: true }, { id: 'x', name: '' }, 'niz']));
    eq(unk.list.length, 1); ok(unk.warnings.some(w => w.includes('neznanih polj')) && unk.warnings.some(w => w.includes('neveljavnih')), unk.warnings.join(' '));
    eq(Object.keys(unk.list[0]).sort(), ['flag', 'helmet', 'id', 'name', 'skill', 'style', 'suit', 'type']);
    const many = Array.from({ length: 70 }, (_, i) => JP.newJumper({ name: 'S' + i }, i / 100));
    const r = JP.validateList(many);
    ok(r.errors[0].includes('Preveč') && r.list.length === JP.JUMPERS_MAX, 'največ 60');
    eq(JP.normalizeJumper({ id: 'a', name: '<b>x</b>', skill: 7, suit: 'red' }).name, 'bx/b', 'brez < >');
    eq(JP.normalizeJumper({ id: 'a', name: 'x', skill: 7, suit: 'red' }).skill, 1);
    ok(JP.BOT_NAMES.length >= 40, 'vsaj 40 izmišljenih imen');
    eq(JP.builtinBots(5, 'svetovni', 's').every(b => b.skill >= 0.8), true);
  });
  test('skoki: lokalna tekma (ljudje s posnetimi vnosi + boti): vrstni red, točke, statistika', ctx => {
    const { def, hill } = hillOf(ctx, 'bistra');
    const P = ctx.skokiParams;
    // »ljudje« = vnaprej posneti vnosi (bot s fiksnim seedom, posnet z InputRecorder)
    const recorded = seed => { const b = BOT.createBot({ skill: 0.75, seed }); const rec = new GH.InputRecorder(); PH.simulate({ hill, P, gate: 11, wind: { mode: 'off' }, input: (s, t) => { const i = b.input(s); rec.push(t, i); return i; } }); return rec.changes; };
    const humans = { h1: recorded(101), h2: recorded(202) };
    const bots = { b1: { skill: 0.9, style: 'varen' }, b2: { skill: 0.4, style: 'nestanoviten' } };
    const parts = [{ id: 'h1', name: 'Ana', kind: 'human' }, { id: 'h2', name: 'Bor', kind: 'human' }, { id: 'b1', name: 'Bot 1', kind: 'bot' }, { id: 'b2', name: 'Bot 2', kind: 'bot' }];
    const play = () => {
      let st = C.createCompetition({ seed: 'lokalna-test', participants: parts, rounds: 2 });
      let jury = K.createJury(def);
      const jumps = [];
      while (!st.finished) {
        const id = C.currentId(st), p = C.participant(st, id);
        const wind = K.seriesWind('same', 'lokalna-test:s' + st.round, p.bib);
        const judgeSeed = C.hashStr('lokalna-test:' + st.round + ':' + id);
        let res;
        if (p.kind === 'human') res = K.simulateFromInputs({ hill, P, gate: jury.gate, refGate: jury.start, wind, changes: humans[id], judgeSeed });
        else { const b = BOT.createBot({ ...bots[id], seed: judgeSeed }); res = K.resultOf(PH.simulate({ hill, P, gate: jury.gate, wind, input: s => b.input(s) }).s, def, P, { gate: jury.gate, refGate: jury.start, judgeSeed }); }
        const round = st.round;
        st = C.record(st, id, { score: res.total, data: { dist: res.dist, fall: res.fall } });
        jury = K.juryAfterJump(jury, def, { dist: res.dist }).jury;
        if (st.round !== round) jury = K.juryNewRound(jury);
        jumps.push({ id, dist: res.dist, fall: res.fall });
      }
      return { st, jumps };
    };
    const a = play(), b = play();
    eq(C.standings(a.st), C.standings(b.st), 'deterministično');
    const fin = C.standings(a.st);
    eq(fin.length, 4);
    ok(fin.every(r => r.status === 'ok' && r.rounds === 2), 'vsi dve seriji');
    const r1 = C.standings(a.st, { uptoRound: 0 });
    eq(a.st.rounds[1].order, r1.map(r => r.id).reverse(), '2. serija obratno po 1.');
    eq(fin[0].total, Math.max(...fin.map(r => r.total)));
    const stats = JP.addCompetitionStats({}, { hill: 'bistra', jumps: a.jumps, standings: fin });
    eq(stats[fin[0].id].wins, 1); eq(Object.values(stats).reduce((s, x) => s + x.jumps, 0), 8);
    eq(Object.values(stats).reduce((s, x) => s + x.podiums, 0), 3);
    const tbl = JP.statsTable(parts.map(p => ({ ...p, flag: 'si', type: p.kind })), stats);
    eq(tbl[0].id, fin[0].id, 'tabela lige: zmagovalec prvi');
    const best = Math.max(...a.jumps.filter(j => j.id === 'h1' && !j.fall).map(j => j.dist));
    if (best > 0) eq(stats.h1.best.bistra, best, 'najdaljši skok po skakalnici');
    // XP in mesto med ljudmi
    eq(K.contestXp({ place: 1, humans: 2 }), 110); eq(K.contestXp({ place: 3, humans: 5 }), 50); eq(K.contestXp({ place: 5, humans: 5 }), 30);
    const hp = K.humanPlace(fin, 'h1');
    ok(hp === 1 || hp === 2);
  });
  test('skoki: značaji botov ne spremenijo privzetega bota', ctx => {
    const { def, hill } = hillOf(ctx, 'orlova');
    const run = o => { const b = BOT.createBot(o); return PH.simulate({ hill, P: ctx.skokiParams, gate: def.gates.default, wind: { mode: 'off' }, input: s => b.input(s) }).s; };
    eq(run({ skill: 0.7, seed: 5 }).dist, run({ skill: 0.7, seed: 5, style: null }).dist);
    eq(run({ skill: 0.7, seed: 5 }).dist, run({ skill: 0.7, seed: 5, style: 'normal' }).dist);
    const v = [];
    for (let s = 1; s <= 12; s++) v.push(run({ skill: 0.9, seed: s, style: 'varen' }).landing.type);
    ok(v.filter(t => t === 'fall').length <= 2, 'varen redko pade');
  });
}
