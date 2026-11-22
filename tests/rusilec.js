/* =====================================================================
   Testi Rušilca (party arena za Hrčkovo kroglo). Registrira jih tests/tests.js.
   ctx.rusilecArenas: vse arene (arenas/index.json), ctx.kroglaLevels: proge krogle.
   ===================================================================== */
import * as KP from '../games/krogla/physics.js';
import * as KR from '../games/krogla/rules.js';
import * as KA from '../games/krogla/autopilot.js';
import * as KL2 from '../games/krogla/level.js';
import * as KX from '../games/krogla/secrets.js';
import * as RC from '../games/rusilec/collide.js';
import * as RM from '../games/rusilec/match.js';
import * as RA from '../games/rusilec/arena.js';
import * as RN from '../games/rusilec/net.js';
import * as RB from '../games/rusilec/bots.js';
import * as RT from '../games/rusilec/texts.js';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function rusilecTests(test, { eq, ok }) {
  const rBall = (x, z, o = {}) => ({ x, y: 0.32, z, vx: 0, vy: 0, vz: 0, r: 0.32, dashT: 0, dashCd: 0, ...o });
  const rArena = (ctx, id) => ctx.rusilecArenas.find(A => A.id === id) || ctx.rusilecArenas[0];
  const rRun = (M, secs, inputs = new Map(), each = null) => {
    const n = Math.round(secs / RM.STEP);
    for (let i = 0; i < n && M.phase !== 'end'; i++) { each?.(M); RM.stepMatch(M, inputs); }
  };
  /** Postavi igralca p na (x, z) s hitrostjo (vx, vz). */
  const rPut = (M, p, x, z, vx = 0, vz = 0) => {
    const b = p.b; b.x = x; b.z = z; b.y = 0.32; b.vx = vx; b.vz = vz; b.vy = 0; b.grounded = true; b.ghost = false; p.invT = 0; p.st = 'alive';
  };

  test('rušilec: trk krogel ohrani gibalno količino; težja in hitrejša odbije močneje', () => {
    const a = rBall(0, 0, { vx: 6 }), b = rBall(0.6, 0.05);
    const p0 = [a.vx + b.vx, a.vz + b.vz];
    const hit = RC.collidePair(a, b);
    ok(hit && hit.j > 0, 'ni trka');
    ok(Math.abs(a.vx + b.vx - p0[0]) < 1e-9 && Math.abs(a.vz + b.vz - p0[1]) < 1e-9, 'gibalna količina ni ohranjena');
    ok(b.vx > 5, 'mirujoča krogla ni odletela: ' + b.vx);
    const c = rBall(0, 0, { vx: 6, dashT: 0.3 }), d = rBall(0.6, 0);
    const mc = RC.massOf(c);
    RC.collidePair(c, d);
    ok(d.vx > b.vx + 1, 'sunek ne odbije močneje: ' + d.vx + ' vs ' + b.vx);
    ok(Math.abs(mc * c.vx + d.vx - mc * 6) < 1e-9, 'gibalna količina z maso');
    const e1 = rBall(0, 0, { vx: 3 }), f1 = rBall(0.6, 0); RC.collidePair(e1, f1);
    const e2 = rBall(0, 0, { vx: 9 }), f2 = rBall(0.6, 0); RC.collidePair(e2, f2);
    ok(f2.vx > f1.vx * 3, 'hitrejša krogla ne odbije sorazmerno močneje');
    eq(RC.collidePair(rBall(0, 0), rBall(1, 0)), null);
    eq(RC.collidePair(rBall(0, 0, { vx: -2 }), rBall(0.6, 0, { vx: 2 })).j, 0);
  });

  test('rušilec: krogli se pri največji hitrosti ne prebijeta druga skozi drugo', ctx => {
    const M = RM.createMatch({ arena: rArena(ctx, '01-ring'), players: [{ id: 'a' }, { id: 'b' }], cfg: { pickups: false }, seed: 1 });
    const [A, B] = M.players;
    rPut(M, A, 3.6, 6.5, 13, 0); rPut(M, B, 9.4, 6.5, -13, 0);
    let crossed = false, hit = false;
    for (let i = 0; i < 60; i++) {
      if (!hit) { A.b.vx = 13; B.b.vx = -13; }
      RM.stepMatch(M, new Map([['a', { x: 1, z: 0, d: 0 }], ['b', { x: -1, z: 0, d: 0 }]]));
      if (M.ev.some(e => e.type === 'hit')) hit = true;
      if (A.b.x > B.b.x) crossed = true;
    }
    ok(hit, 'ni bilo trka'); ok(!crossed, 'krogli sta šli druga skozi drugo');
  });

  test('rušilec: sunek in ohlajanje', ctx => {
    const b = rBall(0, 0, { vx: 1 });
    ok(RC.dash(b, 1, 0), 'sunek ni uspel');
    ok(b.vx >= RC.C.DASH_SPEED - 1e-9, 'hitrost sunka: ' + b.vx);
    ok(RC.massOf(b) > 2, 'med sunkom ni težja');
    ok(!RC.dash(b, 1, 0), 'sunek na ohlajanju je uspel');
    for (let i = 0; i < 120 * RC.C.DASH_T + 2; i++) RC.tickDash(b, 1 / 120);
    eq(RC.massOf(b), 1, 'masa po sunku');
    for (let i = 0; i < 120 * RC.C.DASH_CD; i++) RC.tickDash(b, 1 / 120);
    ok(RC.dash(b, 0, 1), 'sunek po ohlajanju ni uspel');
    for (const on of [true, false]) {
      const M = RM.createMatch({ arena: rArena(ctx, '01-ring'), players: [{ id: 'a' }], cfg: { dash: on, pickups: false }, seed: 2 });
      rRun(M, 0.1, new Map([['a', { x: 1, z: 0, d: 0 }]]));
      M.ev.length = 0;
      rRun(M, 0.5, new Map([['a', { x: 1, z: 0, d: 1 }]]));
      eq(M.ev.filter(e => e.type === 'dash').length, on ? 1 : 0, 'sunkov (' + on + ')');
    }
  });

  test('rušilec: validator na vseh arenah (izhodišča na tleh, narazen, vsaj 8) in zaznava napak', ctx => {
    ok(ctx.rusilecArenas.length >= 8, 'manj kot 8 aren');
    ok(ctx.rusilecArenas.filter(A => A.secret).length >= 2, 'manj kot 2 skrivni areni');
    ok(ctx.rusilecArenas.filter(A => !A.secret).length >= 6, 'manj kot 6 odprtih aren');
    for (const A of ctx.rusilecArenas) {
      eq(RA.validateArena(A), [], A.id);
      const w = RA.arenaWorld(A);
      for (const s of A.spawns) ok(RA.hasFloor(w, s[0], s[1]), A.id + ': izhodišče ni na tleh');
    }
    const bad = JSON.parse(JSON.stringify(rArena(ctx, '01-ring')));
    bad.spawns = [[0.2, 0.2], [6.5, 6.5], [6.6, 6.6], ...bad.spawns.slice(0, 3)];
    bad.finale.tiles.push([6, 6]);
    const errs = RA.validateArena(bad).join('\n');
    ok(/vsaj 8/.test(errs) && /ni na tleh/.test(errs) && /preblizu/.test(errs) && /padajoča/.test(errs), errs);
  });

  test('rušilec: pripisovanje izriva (zadnji dotik v 4 s, samomor −1/0)', ctx => {
    const A = rArena(ctx, '01-ring');
    const mk = (cfg = {}) => RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], cfg: { pickups: false, ...cfg }, seed: 3 });
    let M = mk();
    let [pa, pb, pc] = M.players;
    rPut(M, pc, 6.5, 11.5);
    rPut(M, pa, 9.6, 6.5, 9, 0); rPut(M, pb, 10.4, 6.5);
    rRun(M, 3);
    const k = M.ev.find(e => e.type === 'kill');
    ok(k && k.k === 'a' && k.v === 'b', 'izriv ni pripisan: ' + JSON.stringify(M.ev.filter(e => e.type !== 'hit')));
    eq([pa.score, pa.kills, pb.deaths], [1, 1, 1]);
    for (const pen of [-1, 0]) {
      M = mk({ suicide: pen });
      [pa, pb, pc] = M.players;
      rPut(M, pa, 6.5, 6.5); rPut(M, pc, 6.5, 2.5); rPut(M, pb, 10, 6.5, 6, 0);
      rRun(M, 3);
      const e = M.ev.find(x => x.type === 'suicide');
      ok(e && e.v === 'b', 'ni samomora'); eq(pb.score, pen); eq(pb.suicides, 1);
    }
    M = mk();
    [pa, pb, pc] = M.players;
    rPut(M, pc, 6.5, 11.5); rPut(M, pa, 6.5, 6.5); rPut(M, pb, 9.5, 6.5, 7, 0);
    pb.lastTouch = { by: 'a', t: M.t - 4.1, bank: false, recv: 1 };
    rRun(M, 3);
    ok(M.ev.some(e => e.type === 'suicide' && e.v === 'b'), 'star dotik je štel');
  });

  test('rušilec: dvojni izriv, maščevanje, biljard, ekipe in izriv soigralca', ctx => {
    const A = rArena(ctx, '01-ring');
    const M = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], cfg: { pickups: false }, seed: 4 });
    const [pa, pb, pc] = M.players;
    pa.killedBy = 'b';
    rPut(M, pa, 6.5, 6.5); rPut(M, pb, 12.9, 6.5, 3, 0); rPut(M, pc, 0.1, 6.5, -3, 0);
    pb.lastTouch = { by: 'a', t: M.t, bank: false, recv: 5 };
    pc.lastTouch = { by: 'a', t: M.t, bank: false, recv: 5 };
    pb.b.y = pc.b.y = -2; pb.b.grounded = pc.b.grounded = false;
    rRun(M, 0.05);
    const ks = M.ev.filter(e => e.type === 'kill');
    eq(ks.length, 2, 'dva izriva');
    ok(ks.some(e => e.v === 'b' && e.revenge), 'ni maščevanja');
    ok(ks.some(e => e.double), 'ni dvojnega izriva');
    eq(pa.revenges, 1);
    const M2 = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], cfg: { pickups: false }, seed: 5 });
    const [qa, qb, qc] = M2.players;
    rPut(M2, qa, 5.0, 6.5, 12, 0); rPut(M2, qb, 5.7, 6.5); rPut(M2, qc, 9.8, 6.5);
    rRun(M2, 3);
    const kb = M2.ev.find(e => e.type === 'kill' && e.v === 'c');
    ok(kb && kb.k === 'a' && kb.bank, 'ni biljarda: ' + JSON.stringify(M2.ev.filter(e => e.type !== 'hit')));
    eq(qa.billiards, 1);
    const M3 = RM.createMatch({ arena: A, players: [{ id: 'a', team: 0 }, { id: 'b', team: 0 }, { id: 'c', team: 1 }], cfg: { mode: 'teams', pickups: false }, seed: 6 });
    const [ta, tb, tc] = M3.players;
    rPut(M3, tc, 6.5, 11.5); rPut(M3, ta, 9.6, 6.5, 9, 0); rPut(M3, tb, 10.4, 6.5);
    rRun(M3, 3);
    ok(M3.ev.some(e => e.type === 'kill' && e.team && e.k === 'a'), 'ni izriva soigralca');
    eq(RM.teamScores(M3), [-1, 0]);
  });

  test('rušilec: ponovni prihod na najbolj oddaljenem izhodišču, neranljivost', ctx => {
    const A = rArena(ctx, '01-ring');
    const M = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }], cfg: { pickups: false }, seed: 7 });
    const [pa, pb] = M.players;
    rPut(M, pa, A.spawns[0][0], A.spawns[0][1]);
    rPut(M, pb, 12.5, 6.5, 5, 0);
    let back = null;
    rRun(M, 6, new Map(), m => { if (!back && pb.st === 'alive' && m.t > 0.5 && pb.invT > 0) back = { t: m.t, x: pb.b.x, z: pb.b.z, ax: pa.b.x, az: pa.b.z }; });
    ok(back, 'ni ponovnega prihoda');
    const far = Math.max(...A.spawns.map(s => Math.hypot(s[0] - back.ax, s[1] - back.az)));
    const got = Math.hypot(back.x - back.ax, back.z - back.az);
    ok(got > far - 0.5, 'ni najbolj oddaljeno izhodišče: ' + got.toFixed(2) + ' < ' + far.toFixed(2));
    ok(back.t >= RM.RULES.RESPAWN - 0.05, 'prihod prezgodaj: ' + back.t);
    const M2 = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }], cfg: { pickups: false }, seed: 8 });
    const [x, y] = M2.players;
    rPut(M2, x, 5, 6.5, 8, 0); rPut(M2, y, 5.7, 6.5);
    y.invT = 1.5; y.b.ghost = true;
    rRun(M2, 0.2);
    ok(!M2.ev.some(e => e.type === 'hit'), 'neranljiva krogla je trčila');
    ok(x.b.x > y.b.x, 'krogla ni šla skozi neranljivo');
  });

  test('rušilec: konec runde, izenačenje in nagla smrt, finale kruši rob', ctx => {
    const A = rArena(ctx, '01-ring');
    const M = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], cfg: { roundSec: 40, pickups: false }, seed: 9 });
    const [pa, pb, pc] = M.players;
    rRun(M, 9);
    eq(M.w.fallTiles.size, 0, 'krušenje pred finalom');
    rRun(M, 2);
    ok(M.w.fallTiles.size > 0 && M.ev.some(e => e.type === 'finale-start'), 'finale se ni začel');
    pa.score = 2; pb.score = 2; pc.score = 1;
    rRun(M, 30);
    ok(M.sudden && M.phase === 'play', 'ni nagle smrti');
    eq([...M.sudden.ids].sort(), ['a', 'b']);
    eq(pc.st, 'out', 'neizenačeni ne igra');
    pb.lastTouch = { by: 'a', t: M.t, bank: false, recv: 5 };
    pb.b.y = -3; pb.b.grounded = false;
    rRun(M, 0.05);
    eq(M.phase, 'end'); eq(M.result.winner, 'a'); eq(M.result.reason, 'sudden');
    eq(RM.standings(M)[0].id, 'a');
    const M2 = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }], cfg: { roundSec: 10, pickups: false }, seed: 10 });
    M2.players[1].score = 1;
    rRun(M2, 11);
    eq([M2.phase, M2.result.winner, M2.result.reason], ['end', 'b', 'time']);
    const M3 = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }], cfg: { mode: 'lms', roundSec: 120, pickups: false }, seed: 11 });
    rPut(M3, M3.players[0], 6.5, 6.5);
    rPut(M3, M3.players[1], 12.5, 6.5, 6, 0);
    rRun(M3, 5);
    eq([M3.phase, M3.result.winner], ['end', 'a']);
  });

  test('rušilec: pobiralke so deterministične s seedom in delujejo', ctx => {
    const A = rArena(ctx, '03-kroznik');
    const run = seed => {
      const M = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }], cfg: { pickups: true }, seed });
      const out = [];
      rRun(M, 50, new Map(), m => { for (const e of m.ev) if (e.type === 'pick-spawn') out.push([e.k, e.x, e.z]); m.ev.length = 0; });
      return out;
    };
    const a = run('s1'), b = run('s1'), c = run('s2');
    ok(a.length >= 3, 'premalo pobiralk: ' + a.length);
    eq(a, b, 'isti seed'); ok(JSON.stringify(a) !== JSON.stringify(c), 'različen seed');
    const M = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }], cfg: { pickups: true }, seed: 's3' });
    rRun(M, RM.RULES.PICK_FIRST + 1.2);
    const pk = M.pickups[0];
    ok(pk, 'ni pobiralke');
    rPut(M, M.players[0], pk.x, pk.z);
    rRun(M, 0.05);
    ok(M.ev.some(e => e.type === 'pick' && e.p === 'a'), 'pobiralka ni pobrana');
    const P = M.players;
    if (pk.k === 'freeze') ok(P[1].iceT > 0 && P[0].iceT === 0, 'zmrzal'); else ok(P[0][pk.k + 'T'] > 0, pk.k);
  });

  test('rušilec: simulacija je deterministična; polno stanje obnovi rundo (prenos hosta)', ctx => {
    const A = rArena(ctx, '07-vrtiljak');
    const mk = () => RM.createMatch({ arena: A, players: [1, 2, 3, 4].map(i => ({ id: 'b' + i, bot: 1 + (i % 3) })), cfg: { roundSec: 60 }, seed: 'det' });
    const step = (M, secs) => { const inp = new Map(); rRun(M, secs, inp, m => { for (const p of m.players) inp.set(p.id, RB.botInput(m, p)); }); };
    const M1 = mk(), M2 = mk();
    step(M1, 20); step(M2, 20);
    eq(JSON.stringify(RM.serializeMatch(M1)), JSON.stringify(RM.serializeMatch(M2)), 'ista simulacija');
    const S = JSON.parse(JSON.stringify(RM.serializeMatch(M1)));
    const R = RM.restoreMatch(A, S);
    ok(Math.abs(R.t - M1.t) < 1e-3, 'čas');
    eq(R.players.map(p => p.score), M1.players.map(p => p.score));
    eq(R.players.map(p => [p.st, +p.b.x.toFixed(2)]), M1.players.map(p => [p.st, +p.b.x.toFixed(2)]));
    eq(R.w.fallTiles.size, M1.w.fallTiles.size, 'zrušene ploščice');
    const t0 = R.t;
    step(R, 3);
    ok(R.t > t0 + 2.9, 'obnovljena runda ne teče');
  });

  test('rušilec: posnetek (kvantizacija v mejah, < 1 KB za 8 krogel), vhod, dogodki', () => {
    const balls = Array.from({ length: 8 }, (_, i) => ({ x: 3.14159 + i, y: 0.321 - i * 0.1, z: 7.777 + i * 0.5, vx: -12.34, vy: 3.3, vz: 9.99, yaw: 2.5 - i,
      st: ['alive', 'dead', 'out'][i % 3], inv: i === 2, dash: i === 3, crown: i === 4, dashCd: 1.234 }));
    const msg = RN.encodeSnap({ seq: 77, t: 123.456, balls, pk: [{ n: 1, k: 'weight', x: 3, z: 4 }], ev: [{ q: 5, type: 'kill', k: 'a', v: 'b' }] });
    const size = RN.msgSize(msg);
    ok(size < 1024, 'posnetek je prevelik: ' + size);
    const d = RN.decodeSnap(JSON.parse(JSON.stringify(msg)));
    eq(d.seq, 77); ok(Math.abs(d.t - 123.456) < 0.001);
    d.balls.forEach((b, i) => {
      const o = balls[i];
      for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz']) ok(Math.abs(b[k] - o[k]) <= 0.005 + 1e-9, k + ': ' + b[k] + ' vs ' + o[k]);
      ok(Math.abs(Math.atan2(Math.sin(b.yaw - o.yaw), Math.cos(b.yaw - o.yaw))) < 0.001, 'yaw');
      eq([b.st, b.inv, b.dash, b.crown], [o.st, o.inv, o.dash, o.crown]);
    });
    eq(d.ev[0].type, 'kill');
    const inp = RN.decodeInput(RN.encodeInput(3, 0.5, -1.4, 7));
    ok(Math.abs(inp.x - 0.5) < 0.01 && inp.z === -1 && inp.d === 7, 'vhod');
    const log = new RN.EventLog(), sink = new RN.EventSink();
    const e1 = log.push({ type: 'a' }), e2 = log.push({ type: 'b' }), e3 = log.push({ type: 'c' });
    eq(sink.accept([e1]).map(e => e.type), ['a']);
    eq(sink.accept([e3]).length, 0); ok(sink.gap, 'vrzel ni zaznana');
    eq(sink.accept(log.since(1)).map(e => e.type), ['b', 'c']); ok(!sink.gap, 'vrzel ostaja');
    eq(sink.accept([e2]).length, 0, 'podvojen dogodek');
    return size + ' B za 8 krogel';
  });

  test('rušilec: interpolacija, ura hosta in popravek napovedi', () => {
    const I = new RN.Interp();
    const snap = (t, x, st = 'alive') => ({ t, balls: [{ x, y: 0.32, z: 0, vx: 10, vy: 0, vz: 0, yaw: 0, st }] });
    I.push(snap(1, 0)); I.push(snap(1.1, 1)); I.push(snap(1.2, 2));
    ok(Math.abs(I.sample(0, 1.05).x - 0.5) < 1e-9, 'sredina');
    ok(Math.abs(I.sample(0, 1.25).x - 2.5) < 1e-9, 'ekstrapolacija');
    ok(Math.abs(I.sample(0, 2).x - 3.5) < 1e-9, 'ekstrapolacija omejena na 0,15 s');
    I.push(snap(1.3, 9, 'dead'));
    ok([2, 9].includes(I.sample(0, 1.26).x), 'skok se ne interpolira');
    const C = new RN.HostClock();
    C.sample(10, 100); eq(C.now(100.5), 10.5);
    C.sample(10.6, 100.55); ok(C.now(100.55) > 10.55 && C.now(100.55) < 10.6, 'ura se ne prilagodi');
    const loc = { x: 0, y: 0.32, z: 0, vx: 1, vy: 0, vz: 0 };
    let r = RN.correct(loc, { x: 0.5, y: 0.32, z: 0, vx: 1, vy: 0, vz: 0, st: 'alive' });
    ok(!r.hard && loc.x > 0 && loc.x < 0.5, 'mehki popravek');
    r = RN.correct(loc, { x: 5, y: 0.32, z: 0, vx: 1, vy: 0, vz: 0, st: 'alive' });
    ok(r.hard && loc.x === 5, 'skok');
    RN.correct(loc, { x: 5.1, y: 0.32, z: 0, vx: -8, vy: 0, vz: 0, st: 'alive' });
    eq(loc.vx, -8, 'trk: hitrost hosta');
    const l2 = { x: 0, y: 0.32, z: 0, vx: 0, vy: 0, vz: 0 };
    for (let i = 0; i < 20; i++) RN.correct(l2, { x: 1, y: 0.32, z: 0, vx: 0, vy: 0, vz: 0, st: 'alive' });
    ok(Math.abs(l2.x - 1) < 0.01, 'ne konvergira');
  });

  test('rušilec: bot v 60 s na vsaki areni ne pade sam (Srednji) in izrine pasivnega', ctx => {
    const out = [];
    for (const A of ctx.rusilecArenas) {
      const M = RM.createMatch({ arena: A, players: [{ id: 'bot', bot: 2 }, { id: 'pas' }], cfg: { roundSec: 60, pickups: false }, seed: 'bot:' + A.id });
      const inp = new Map();
      rRun(M, 60, inp, m => inp.set('bot', RB.botInput(m, m.players[0])));
      const b = M.players[0];
      ok(b.suicides <= 2, `${A.id}: bot je sam padel ${b.suicides}×`);
      ok(b.kills >= 1, `${A.id}: bot ni izrinil pasivnega`);
      out.push(`${A.id.slice(0, 2)}: ${b.kills}/${b.suicides}`);
    }
    return 'izrivi/samomori ' + out.join(', ');
  });

  test('rušilec: napisi (≥ 20 variant), nagrade, XP, igra z več rundami', ctx => {
    ok(RT.ALL.length >= 20, 'premalo napisov: ' + RT.ALL.length);
    const f = RT.feedText({ type: 'kill', k: 'a', v: 'b', q: 3, revenge: true, double: true }, id => id.toUpperCase());
    ok(f.text.includes('A') && f.text.includes('B') && f.tags.includes('Maščevanje!') && f.tags.includes('Dvojni izriv!'), JSON.stringify(f));
    ok(RT.feedText({ type: 'suicide', v: 'b', q: 1 }, x => x).text.includes('b'), 'samomor');
    const A = rArena(ctx, '01-ring');
    const G = RM.newGame({ rounds: 2 }, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    for (let r = 0; r < 2; r++) {
      const M = RM.createMatch({ arena: A, players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], cfg: { roundSec: 5, pickups: false }, seed: r });
      M.players[0].score = 3; M.players[0].kills = 3; M.players[1].suicides = 2; M.players[1].score = -2; M.players[2].revenges = 1; M.players[2].deaths = 4;
      rRun(M, 6);
      RM.addRound(G, M);
    }
    const st = RM.gameStandings(G);
    eq(st.list[0].id, 'a'); eq(G.totals.a.score, 6); eq(G.arenas, ['01-ring', '01-ring']);
    const aw = RM.awards(G).map(x => x.key + ':' + x.id);
    ok(aw.includes('rusilec:a') && aw.includes('kamikaza:b') && aw.includes('mascevalec:c'), aw.join());
    eq(RM.xpFor({ humans: 1, kills: 9, won: true }), 10);
    eq(RM.xpFor({ humans: 3, kills: 9, won: true }), 75);
    eq(RM.xpFor({ humans: 2, kills: 1, won: false }), 25);
  });

  test('rušilec: skrite ključavnice so na stranski poti in ne spremenijo prog (autopilot da enak čas)', ctx => {
    const names = { '07-vrtiljak': 'Neon', '08-oblak': 'Nebo' };
    for (const [lid, list] of Object.entries(KX.SECRETS)) {
      const L = ctx.kroglaLevels.find(x => x.id === lid);
      ok(L, 'ni proge ' + lid);
      for (const s of list) {
        const A = ctx.rusilecArenas.find(a => a.id === s.arena);
        ok(A && A.secret, s.arena + ' ni skrivna arena');
        ok(A.hint.includes(names[s.arena]), 'namig ne omenja proge');
        const w = KP.createWorld(L);
        ok(Number.isFinite(KP.groundBelow(w, s.x, s.z)), lid + ': ključavnica ni na tleh');
        const pts = L.route.map(p => [p.x, p.z]);
        let dmin = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
          const t = Math.max(0, Math.min(1, ((s.x - ax) * dx + (s.z - az) * dz) / l2));
          dmin = Math.min(dmin, Math.hypot(ax + dx * t - s.x, az + dz * t - s.z));
        }
        ok(dmin > 2, lid + ': ključavnica je na glavni poti (' + dmin.toFixed(2) + ')');
        const res = KA.runAutopilot(L);
        ok(res.finished && Math.abs(res.time - L.dev.time) < 0.05, lid + ': čas autopilota ' + res.time + ' ≠ ' + L.dev.time);
        ok(KR.medalFor(L, L.medals.gold - 0.01) === 'gold', 'medalje');
        eq(KX.secretsFor(KL2.mirrorLevel(L))[0].x, L.size[0] - s.x, 'zrcaljenje');
      }
    }
    eq(KX.lockKey('07-vrtiljak'), 'kljucavnica-vrtiljak');
  });
}
