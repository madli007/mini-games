/* =====================================================================
   MINI GAMES — testi čiste logike (brez build koraka).
   Brskalnik: tests.html · Node: node tests/run-node.mjs
   ===================================================================== */

import * as U from '../shared/util.js';
import { LocalBackend } from '../shared/adapters/local.js';
import { Room } from '../shared/room.js';
import * as RK from '../games/reakcija/logic.js';
import * as S from '../shared/storage.js';
import * as E from '../shared/economy.js';
import * as Q from '../shared/quests.js';
import * as K from '../shared/cosmetics.js';
import * as SIM from './economy-sim.js';
import * as L from '../games/ladjice/logic.js';
import * as LA from '../games/ladjice/ai.js';
import * as LC from '../games/ladjice/content.js';
import * as KP from '../games/krogla/physics.js';
import * as KR from '../games/krogla/rules.js';
import * as KG from '../games/krogla/ghost.js';
import * as KA from '../games/krogla/autopilot.js';
import * as KL2 from '../games/krogla/level.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function eq(a, b, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} pričakovano ${B}, dobljeno ${A}`);
}
function ok(v, msg = 'pogoj ni izpolnjen') { if (!v) throw new Error(msg); }
async function throwsCode(fn, code) {
  try { await fn(); } catch (e) { if (e.code === code) return; throw new Error(`pričakovana napaka ${code}, dobljena ${e.code || e.message}`); }
  throw new Error(`pričakovana napaka ${code}, a napake ni bilo`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------ PRNG */
test('rng: isti seed → isto zaporedje', () => {
  const a = U.rng('2026-11-20'), b = U.rng('2026-11-20');
  for (let i = 0; i < 50; i++) eq(a(), b());
});
test('rng: različen seed → različno zaporedje', () => {
  const a = U.rng('a'), b = U.rng('b');
  ok([0, 1, 2, 3, 4].some(() => a() !== b()));
});
test('rng: vrednosti v [0,1), int in pick v mejah', () => {
  const r = U.rng(42);
  let sum = 0;
  for (let i = 0; i < 5000; i++) {
    const v = r(); ok(v >= 0 && v < 1); sum += v;
    const n = r.int(3, 7); ok(n >= 3 && n <= 7 && Number.isInteger(n));
  }
  ok(Math.abs(sum / 5000 - 0.5) < 0.03, 'povprečje ni ~0.5');
  ok(['x', 'y'].includes(r.pick(['x', 'y'])));
  eq(r.shuffle([1, 2, 3, 4]).sort(), [1, 2, 3, 4]);
});
test('rng: znana vrednost (stabilnost med verzijami)', () => {
  const r = U.rng('mini-games');
  const v = Math.round(r() * 1e6);
  eq(v, Math.round(U.rng('mini-games')() * 1e6));
  eq(U.hashString('abc'), U.hashString('abc'));
  ok(U.hashString('abc') !== U.hashString('abd'));
});

/* ------------------------------------------------------- dnevni seed */
test('dailySeed: Europe/Ljubljana pozimi (UTC+1)', () => {
  eq(U.dailySeed(new Date('2026-11-20T22:59:00Z')), '2026-11-20');
  eq(U.dailySeed(new Date('2026-11-20T23:00:00Z')), '2026-11-21');
});
test('dailySeed: Europe/Ljubljana poleti (UTC+2)', () => {
  eq(U.dailySeed(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
  eq(U.dailySeed(new Date('2026-07-01T22:00:00Z')), '2026-07-02');
});
test('dayStart: polnoč po ljubljanskem času', () => {
  eq(U.dayStart(new Date('2026-11-20T12:00:00Z')).toISOString(), '2026-11-19T23:00:00.000Z');
  eq(U.dayStart(new Date('2026-07-01T12:00:00Z')).toISOString(), '2026-06-30T22:00:00.000Z');
  // dan prehoda na poletni čas (29. 3. 2026): polnoč je še v CET
  eq(U.dayStart(new Date('2026-03-29T12:00:00Z')).toISOString(), '2026-03-28T23:00:00.000Z');
  // dan prehoda na zimski čas (25. 10. 2026): polnoč je še v CEST
  eq(U.dayStart(new Date('2026-10-25T12:00:00Z')).toISOString(), '2026-10-24T22:00:00.000Z');
});
test('periodSince: today/week/all', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  eq(U.periodSince('all', now), null);
  eq(U.periodSince('today', now).toISOString(), '2026-11-19T23:00:00.000Z');
  eq(U.periodSince('week', now).toISOString(), '2026-11-13T12:00:00.000Z');
});

/* ------------------------------------------------------- kode sob */
test('koda sobe: 4 znaki brez O/0/I/1', () => {
  for (let i = 0; i < 2000; i++) {
    const c = U.makeRoomCode();
    ok(U.ROOM_CODE_RE.test(c), 'neveljavna koda ' + c);
    ok(!/[O0I1]/.test(c), 'zamenljiv znak v ' + c);
  }
  eq(U.ROOM_ALPHABET.length, 32);
});
test('koda sobe: normalizacija vnosa', () => {
  eq(U.normalizeRoomCode(' abcd '), 'ABCD');
  eq(U.normalizeRoomCode('AB0D'), null);
  eq(U.normalizeRoomCode('ABC'), null);
  eq(U.normalizeRoomCode(null), null);
});

/* ------------------------------------------------------- nivoji */
test('krivulja nivojev', () => {
  eq(U.level(0), { level: 1, current: 0, next: 100, progress: 0 });
  eq(U.level(99).level, 1);
  eq(U.level(100), { level: 2, current: 0, next: 175, progress: 0 });
  eq(U.level(275).level, 3);
  eq(U.level(274).level, 2);
  let prev = 0;
  for (let l = 1; l < 50; l++) { ok(U.xpForLevel(l) > prev, 'krivulja ni naraščajoča'); prev = U.xpForLevel(l); }
  ok(U.level(1e6).level > 50);
});
test('XP omejitve: 500 na klic, 5000 na dan', () => {
  eq(U.grantableXp(10000, 0), 500);
  eq(U.grantableXp(300, 4900), 100);
  eq(U.grantableXp(300, 5000), 0);
  eq(U.grantableXp(-5, 0), 0);
});
test('vzdevek: preverjanje', () => {
  ok(U.validateNickname('A'));
  ok(U.validateNickname('x'.repeat(17)));
  ok(U.validateNickname('<b>'));
  eq(U.validateNickname('Čuk Šef'), null);
});

/* ------------------------------------------------------- prenos hosta */
test('pickHost: trenutni host ostane, sicer najstarejši joinedAt', () => {
  const P = [{ id: 'b', joinedAt: '2026-01-01T10:00:02Z' }, { id: 'a', joinedAt: '2026-01-01T10:00:01Z' }, { id: 'c', joinedAt: '2026-01-01T10:00:03Z' }];
  eq(U.pickHost(P, 'c'), 'c');
  eq(U.pickHost(P, 'x'), 'a');
  eq(U.pickHost(P.filter(p => p.id !== 'a'), 'a'), 'b');
  eq(U.pickHost([], 'a'), null);
  eq(U.pickHost([{ id: 'z', joinedAt: 5 }, { id: 'y', joinedAt: 5 }], null), 'y');
});

/* ------------------------------------------------------- games.json */
test('games.json ustreza shemi', (ctx) => {
  const errs = U.validateGames(ctx.games, ctx.schema);
  eq(errs, [], 'napake:');
  ok(ctx.games.some(g => g.id === 'reakcija' && g.status === 'live'));
  ok(ctx.games.some(g => g.id === 'pinball' && g.status === 'live'));
  ok(ctx.games.filter(g => g.status === 'soon').length >= 13);
  ok(ctx.games.some(g => g.id === 'ladjice' && g.status === 'live' && g.scoreOrder === 'asc'));
});
test('validator sheme zazna napake', (ctx) => {
  const bad = [{ ...ctx.games[0], id: 'Slabo ID', mode: 'x' }, { ...ctx.games[0] }];
  const errs = U.validateGames(bad, ctx.schema);
  ok(errs.length >= 2, 'premalo napak: ' + errs.join('; '));
  const dup = U.validateGames([ctx.games[0], ctx.games[0]], ctx.schema);
  ok(dup.some(e => e.includes('podvojen')));
});

/* ------------------------------------------------------- lokalni adapter */
function clearLocal() {
  for (const k of ['db:profiles', 'db:scores', 'db:ach', 'db:xplog', 'db:rooms', 'db:roomPlayers', 'db:state', 'db:moves']) {
    S.remove(k);
  }
}
async function users(...ids) {
  const out = [];
  for (const id of ids) {
    const b = new LocalBackend({ userId: 'test-' + id });
    await b.init();
    await b.saveProfile({ nickname: 'T_' + id + Math.random().toString(36).slice(2, 6), avatar: { emoji: '🙂', color: '#fff' } });
    out.push(b);
  }
  return out;
}

test('lokalno: lestvica = najboljši rezultat na igralca (desc in asc)', async () => {
  clearLocal();
  const [a, b] = await users('a', 'b');
  await a.submitScore({ game: 'tg', score: 100 });
  await a.submitScore({ game: 'tg', score: 300 });
  await b.submitScore({ game: 'tg', score: 200 });
  await b.submitScore({ game: 'tg', score: 50, seed: 'x' });
  const desc = await a.getLeaderboard({ game: 'tg' });
  eq(desc.map(r => [r.user_id, r.score]), [['test-a', 300], ['test-b', 200]]);
  const asc = await a.getLeaderboard({ game: 'tg', asc: true });
  eq(asc.map(r => [r.user_id, r.score]), [['test-b', 50], ['test-a', 100]]);
  const seeded = await a.getLeaderboard({ game: 'tg', seed: 'x' });
  eq(seeded.map(r => r.score), [50]);
  eq(await a.getMyBest({ game: 'tg' }), 300);
  eq(await a.getMyBest({ game: 'tg', asc: true }), 100);
  eq(await b.getMyBest({ game: 'tg', seed: 'nope' }), null);
});
test('lokalno: XP omejitve (500/klic, 5000/dan)', async () => {
  clearLocal();
  const [a] = await users('xp');
  eq((await a.awardXp(10000)).granted, 500);
  for (let i = 0; i < 12; i++) await a.awardXp(500);
  const r = await a.awardXp(100);
  eq(r.granted, 0);
  eq(r.xp, 5000);
});
test('lokalno: dosežek samo enkrat', async () => {
  clearLocal();
  const [a] = await users('ach');
  eq(await a.unlock({ game: 'tg', key: 'k1', title: 'T' }), true);
  eq(await a.unlock({ game: 'tg', key: 'k1', title: 'T' }), false);
  eq((await a.getAchievements({ game: 'tg' })).length, 1);
});
test('lokalno: unikaten vzdevek (ne glede na velike črke)', async () => {
  clearLocal();
  const [a] = await users('n1');
  const b = new LocalBackend({ userId: 'test-n2' }); await b.init();
  await throwsCode(() => b.saveProfile({ nickname: (a._profiles()['test-n1'].nickname).toUpperCase(), avatar: {} }), 'nickname_taken');
});
test('lokalno: soba — polna, že začeta, ponovna pridružitev', async () => {
  clearLocal();
  const [h, p, q] = await users('h', 'p', 'q');
  const room = await h.createRoom({ game: 'tg', maxPlayers: 2 });
  ok(U.ROOM_CODE_RE.test(room.code));
  await p.joinRoom(room.code.toLowerCase());
  await throwsCode(() => q.joinRoom(room.code), 'room_full');
  await p.joinRoom(room.code);   // že član → OK
  await h.updateRoom(room.code, { status: 'playing', max_players: 5 });
  await throwsCode(() => q.joinRoom(room.code), 'room_started');
  await p.joinRoom(room.code);   // ponovna povezava med igro → OK
  await throwsCode(() => p.updateRoom(room.code, { status: 'lobby' }), 'not_host');
  await throwsCode(() => q.joinRoom('ZZZZ'), 'room_not_found');
  eq((await q.findRoom(room.code)).players, 2);
});
test('lokalno: prenos hosta (claimHost pravila)', async () => {
  clearLocal();
  const [h, p, q] = await users('h2', 'p2', 'q2');
  const room = await h.createRoom({ game: 'tg' });
  await p.joinRoom(room.code);
  await sleep(5);
  await q.joinRoom(room.code);
  // q ni naslednji v vrsti in host je še v sobi → zavrnjeno
  await throwsCode(() => q.claimHost(room.code), 'not_next_host');
  // p je naslednji → dovoljeno
  eq((await p.claimHost(room.code)).host_id, 'test-p2');
  // host p zapusti sobo → kdorkoli (q) lahko prevzame
  await p.removePlayer(room.code, 'test-p2');
  eq((await q.claimHost(room.code)).host_id, 'test-q2');
  // nečlan ne more
  const [x] = await users('x2');
  await throwsCode(() => x.claimHost(room.code), 'not_next_host');
});
test('lokalno: stanje sobe z verzijo in poteze', async () => {
  clearLocal();
  const [h, p, x] = await users('h3', 'p3', 'x3');
  const room = await h.createRoom({ game: 'tg' });
  await p.joinRoom(room.code);
  eq(await h.setState(room.code, { a: 1 }, 0), 1);
  await throwsCode(() => p.setState(room.code, { a: 2 }, 0), 'version_conflict');
  eq(await p.setState(room.code, { a: 2 }, 1), 2);
  eq((await h.getState(room.code)).state, { a: 2 });
  await throwsCode(() => x.setState(room.code, {}, null), 'not_member');
  eq(await h.pushMove(room.code, { m: 1 }), 1);
  eq(await p.pushMove(room.code, { m: 2 }), 2);
  eq((await h.getMoves(room.code, 1)).map(m => m.move.m), [2]);
});
test('lokalno: javni lobbyji', async () => {
  clearLocal();
  const [h, p] = await users('h4', 'p4');
  const pub = await h.createRoom({ game: 'tg', isPublic: true });
  await p.createRoom({ game: 'tg', isPublic: false });
  const list = await h.listLobbies();
  eq(list.map(l => l.code), [pub.code]);
  await h.updateRoom(pub.code, { status: 'playing' });
  eq((await h.listLobbies()).length, 0);
});
test('realtime (BroadcastChannel): presence, sporočila, odhod hosta', async () => {
  if (typeof BroadcastChannel !== 'function') return 'preskočeno (ni BroadcastChannel)';
  clearLocal();
  const [h, p] = await users('h5', 'p5');
  const row = await h.createRoom({ game: 'tg' });
  await p.joinRoom(row.code);
  const rh = new Room(h, row, await h.getProfile());
  const rp = new Room(p, await p.getRoom(row.code), await p.getProfile());
  await rh._connect();
  await rp._connect();
  await sleep(150);
  eq(rh.players.length, 2, 'host vidi 2 igralca');
  eq(rp.players.length, 2, 'igralec vidi 2 igralca');
  ok(rh.isHost && !rp.isHost);
  const got = [];
  rp.on('ping', (payload, from) => got.push([payload, from]));
  rh.send('ping', { n: 1 });
  await sleep(50);
  eq(got, [[{ n: 1 }, 'test-h5']]);
  let changed = null;
  rp.on('hostChanged', e => { changed = e; });
  await rh.leave();
  await sleep(100);
  eq(changed?.hostId, 'test-p5', 'nov host');
  ok(rp.isHost);
  await sleep(1100);   // tick: zapis prevzema v »bazo«
  eq((await p.getRoom(row.code)).host_id, 'test-p5');
  await rp.leave();
});

/* ------------------------------------------------------- reakcija */
test('reakcija: dnevni zamiki so deterministični in v mejah', () => {
  const a = RK.dailyDelays(U.rng, '2026-11-20'), b = RK.dailyDelays(U.rng, '2026-11-20');
  eq(a, b);
  eq(a.length, 10);
  ok(a.every(d => d >= RK.MIN_DELAY && d <= RK.MAX_DELAY));
  ok(JSON.stringify(RK.dailyDelays(U.rng, '2026-11-21')) !== JSON.stringify(a));
});
test('reakcija: zmagovalec kroga, lestvica, XP', () => {
  eq(RK.roundWinner({ a: { ms: 300 }, b: { ms: 200 }, c: { ms: 100, early: true } }), 'b');
  eq(RK.roundWinner({ a: { ms: 1000, early: true } }), null);
  eq(RK.standings({ a: 600, b: 500 }, { a: 2, b: 2 }, { a: 1 }).map(s => [s.id, s.avg]), [['b', 250], ['a', 300]]);
  eq(RK.average([100, 200, 301]), 200);
  ok(RK.soloXp(190) > RK.soloXp(400));
  ok(RK.mpXp(true, 4) > RK.mpXp(false, 4));
  ok(RK.mpXp(true, 10) <= 500);
});

/* ------------------------------------------------------- naloge */
test('naloge: ISO teden po ljubljanskem datumu', () => {
  eq(Q.isoWeek('2026-11-20'), '2026-W47');
  eq(Q.isoWeek('2026-11-23'), '2026-W48');      // ponedeljek
  eq(Q.isoWeek('2026-11-22'), '2026-W47');      // nedelja
  eq(Q.isoWeek('2026-01-01'), '2026-W01');
  eq(Q.isoWeek('2027-01-01'), '2026-W53');
  eq(Q.isoWeek('2024-12-30'), '2025-W01');
  eq(Q.isoWeek('2021-01-03'), '2020-W53');
  // nedelja 23:30 po Ljubljani (22:30 UTC) je še stari teden, 00:30 v ponedeljek že novi
  eq(Q.weekPeriod(U.dailySeed(new Date('2026-11-22T22:30:00Z'))), 'w:2026-W47');
  eq(Q.weekPeriod(U.dailySeed(new Date('2026-11-22T23:30:00Z'))), 'w:2026-W48');
});
test('naloge: generator je determinističen in isti za vse', (ctx) => {
  const a = Q.questsFor('2026-11-20', ctx.games), b = Q.questsFor('2026-11-20', JSON.parse(JSON.stringify(ctx.games)));
  eq(a, b);
  eq(a.map(q => q.slot), ['e', 'm', 'h', 'w1', 'w2']);
  ok(a.every(q => Q.QUEST_ID_RE.test(q.id) && Q.PERIOD_RE.test(q.period)), 'neveljaven id ali obdobje');
  eq(a.map(q => q.reward), [E.COINS.QUEST.e, E.COINS.QUEST.m, E.COINS.QUEST.h, E.COINS.QUEST.w1, E.COINS.QUEST.w2]);
  ok(a.slice(0, 3).every(q => q.period === 'd:2026-11-20'));
  ok(a.slice(3).every(q => q.period === 'w:2026-W47'));
  // tedenske so iste cel teden, dnevne se menjajo
  const mon = Q.questsFor('2026-11-16', ctx.games), sun = Q.questsFor('2026-11-22', ctx.games);
  eq(mon.slice(3).map(q => q.id), sun.slice(3).map(q => q.id));
  const days = Array.from({ length: 14 }, (_, i) => Q.questsFor(E.addDays('2026-11-01', i), ctx.games).slice(0, 3).map(q => q.id).join());
  ok(new Set(days).size >= 8, 'dnevne naloge se premalo menjajo');
});
test('naloge: predloge iz games.json in le za igre live', (ctx) => {
  const all = Q.expandTemplates(ctx.games);
  ok(all.some(t => t.id === 'reakcija-avg-260' && t.cmp === 'lte'), 'manjka predloga reakcije');
  ok(all.some(t => t.id === 'play-pinball'), 'manjka play-pinball');
  const soonIds = ctx.games.filter(g => g.status === 'soon').map(g => g.id);
  ok(!all.some(t => soonIds.includes(t.game)), 'igra soon ne sme imeti nalog');
  ok(all.some(t => t.id === 'ladjice-daily-45' && t.cmp === 'lte'), 'manjka naloga ladjic');
  ok(all.every(t => ['e', 'm', 'h', 'w'].includes(t.tier) && t.target >= 1), 'neveljaven tier/target');
  ok(all.every(t => Q.QUEST_ID_RE.test('w1.' + t.id)), 'predolg ali neveljaven id predloge');
  // brez iger za več igralcev ni nalog za multiplayer
  const solo = ctx.games.filter(g => g.id === 'pinball');
  ok(!Q.expandTemplates(solo).some(t => ['mp', 'win', 'party'].includes(t.event)), 'mp naloga brez mp igre');
});
test('naloge: napredek (štetje, različne igre, prag)', () => {
  const count = { event: 'play', target: 3 };
  let st = { progress: 0, data: {} };
  for (const ev of Q.gameEvents({ game: 'reakcija' })) st = Q.applyEvent(count, st, ev) || st;
  eq(st.progress, 1);
  const distinct = { event: 'distinct', target: 2 };
  let d = { progress: 0, data: {} };
  d = Q.applyEvent(distinct, d, { name: 'play', game: 'a' }) || d;
  eq(Q.applyEvent(distinct, d, { name: 'play', game: 'a' }), null);
  d = Q.applyEvent(distinct, d, { name: 'play', game: 'b' }) || d;
  eq(d.progress, 2);
  const lte = { event: 'reakcija:avg', target: 1, cmp: 'lte', goal: 259 };
  eq(Q.applyEvent(lte, { progress: 0 }, { name: 'reakcija:avg', value: 260 }), null);
  eq(Q.applyEvent(lte, { progress: 0 }, { name: 'reakcija:avg', value: 259 }).progress, 1);
  const gte = { event: 'score:pinball', target: 1, cmp: 'gte', goal: 500000 };
  eq(Q.applyEvent(gte, { progress: 0 }, Q.gameEvents({ game: 'pinball', score: 600000 }).at(-1)).progress, 1);
  const win = { event: 'win', target: 1 };
  ok(!Q.gameEvents({ game: 'x', won: true, players: 1 }).some(e => e.name === 'win'), 'solo zmaga ne šteje');
  ok(Q.gameEvents({ game: 'x', won: true, players: 2 }).some(e => e.name === 'win'));
  eq(Q.applyEvent(win, { progress: 1 }, { name: 'win' }), null);   // že opravljena
});

/* ------------------------------------------------------- ekonomija */
test('ekonomija: niz dni, dnevna meja, popust', () => {
  eq(E.nextStreak(null, '2026-11-20', 0), { streak: 1, first: true });
  eq(E.nextStreak('2026-11-19', '2026-11-20', 4), { streak: 5, first: true });
  eq(E.nextStreak('2026-11-18', '2026-11-20', 4), { streak: 1, first: true });
  eq(E.nextStreak('2026-11-20', '2026-11-20', 4), { streak: 4, first: false });
  eq(E.nextStreak('2026-12-31', '2027-01-01', 2).streak, 3);
  eq([1, 2, 7, 30].map(E.streakBonus), [5, 10, 35, 35]);
  eq(E.grantableCoins(100, 200), 50);
  eq(E.grantableCoins(100, 250), 0);
  eq(E.grantableCoins(500, 0, E.COINS.PER_CALL), 100);
  eq([2, 10, 25].map(E.levelReward), [10, 50, 100]);
  eq(E.offerPrice(250), 187);
  eq(E.offerPrice(3500), 2625);
});
test('ekonomija: simulacija 30 dni (tipičen in zelo aktiven igralec)', () => {
  const leg = K.CATALOG.filter(i => i.rarity === 'legendary').map(i => i.price);
  const cheapLeg = Math.min(...leg), dearLeg = Math.max(...leg);
  const typ = SIM.simulate(SIM.PLAYERS.typical);
  const max = SIM.simulate(SIM.PLAYERS.max);
  const avg = typ.total.at(-1) / 30;
  // tipičen: vsak dan nekaj malega, vsak teden nekaj redkega, legendarno v 3–5 tednih
  ok(typ.daily.filter(d => d > 0).every(d => d >= 50), 'aktiven dan naj prinese vsaj za navaden predmet (50)');
  ok(SIM.dayToAfford(typ.total, 400) <= 7, 'redek predmet (≤400) v prvem tednu');
  const dLeg = SIM.dayToAfford(typ.total, cheapLeg);
  ok(dLeg >= 21 && dLeg <= 35, `najcenejši legendarni po ${dLeg} dneh (cilj 21–35)`);
  ok(SIM.dayToAfford(typ.total, dearLeg) == null || SIM.dayToAfford(typ.total, dearLeg) >= 28, 'najdražji legendarni ne prej kot v 4 tednih');
  // maksimalen: dnevna meja drži, legendarno ne prej kot v 14 dneh
  ok(max.daily.every(d => d <= E.COINS.PER_DAY), 'preseženа dnevna meja');
  ok(SIM.dayToAfford(max.total, cheapLeg) >= 14, 'legendarno prej kot v 14 dneh');
  // nihče ne more v enem dnevu »pokupiti vsega«
  const all = K.CATALOG.reduce((a, i) => a + i.price, 0);
  ok(E.COINS.PER_DAY * 30 < all, 'v 30 dneh pri maksimumu se ne da kupiti vsega');
  return `tipičen ${avg.toFixed(0)} 🪙/dan, legendarno ${dLeg}. dan; maksimalen ${E.COINS.PER_DAY}/dan, legendarno ${SIM.dayToAfford(max.total, cheapLeg)}. dan`;
});

/* ------------------------------------------------------- katalog */
test('katalog: vsaj 60 predmetov, veljavni podatki, cene po redkosti', () => {
  ok(K.CATALOG.length >= 60, 'premalo predmetov');
  const ids = new Set();
  const RANGE = { common: [0, 150], rare: [0, 450], epic: [0, 1200], legendary: [3500, 4500] };
  for (const it of K.CATALOG) {
    ok(/^[a-z0-9-]{1,40}$/.test(it.id), 'id ' + it.id);
    ok(!ids.has(it.id), 'podvojen id ' + it.id); ids.add(it.id);
    ok(K.SLOTS.includes(it.kind), 'vrsta ' + it.id);
    ok(K.RARITIES.includes(it.rarity), 'redkost ' + it.id);
    ok(Number.isInteger(it.price) && it.price >= RANGE[it.rarity][0] && it.price <= RANGE[it.rarity][1], 'cena ' + it.id);
    ok(it.price > 0 || it.unlock, 'brezplačen predmet brez pogoja: ' + it.id);
    if (['emoji', 'bg', 'title', 'badge', 'win', 'banner'].includes(it.kind)) ok(it.value, 'manjka value ' + it.id);
  }
  ok(K.CATALOG.filter(i => i.kind === 'frame').length >= 15, 'premalo okvirjev');
  ok(K.CATALOG.filter(i => i.kind === 'emoji').length >= 18, 'premalo emojijev');
  for (const s of K.SLOTS) ok(K.CATALOG.some(i => i.kind === s), 'prazen slot ' + s);
  ok(K.CATALOG.some(i => i.unlock?.level) && K.CATALOG.some(i => i.unlock?.achievement) && K.CATALOG.some(i => i.unlock?.streak), 'manjkajo pogoji');
});
test('katalog = SQL (public.shop_items v schema.sql)', (ctx) => {
  ok(ctx.schemaSql, 'schema.sql ni naložen');
  const block = ctx.schemaSql.match(/-- SHOP_ITEMS:BEGIN[\s\S]*?-- SHOP_ITEMS:END/);
  ok(block, 'v schema.sql manjka blok SHOP_ITEMS');
  const rows = [...block[0].matchAll(/\('([a-z0-9-]+)', '(\w+)', '(\w+)', (\d+), (null|'([^']*)'::jsonb), (true|false)\)/g)]
    .map(m => ({ id: m[1], kind: m[2], rarity: m[3], price: +m[4], unlock: m[6] ? JSON.parse(m[6]) : null, active: m[7] === 'true' }));
  eq(rows.length, K.CATALOG.length, 'število predmetov:');
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const it of K.CATALOG) {
    const r = byId.get(it.id);
    ok(r, 'v SQL manjka ' + it.id + ' (node tools/shop-sql.mjs)');
    eq([r.kind, r.rarity, r.price, r.unlock, r.active], [it.kind, it.rarity, it.price, it.unlock || null, it.active !== false], it.id + ':');
  }
});
test('katalog: dnevna ponudba (4 plačljivi, isti kot SQL)', () => {
  const o = K.dailyOffer('2026-11-20');
  eq(o.length, 4);
  eq(new Set(o).size, 4);
  ok(o.every(id => K.item(id).price > 0));
  eq(K.dailyOffer('2026-11-20'), o);
  // referenčne vrednosti iz private.mg_daily_offer (Postgres) — algoritem mora ostati enak
  eq(o, ['bg-mint', 'name-gold', 'emoji-eagle', 'badge-trophy']);
  eq(K.dailyOffer('2026-11-23'), ['emoji-dino', 'emoji-wizard', 'title-legenda', 'frame-ice']);
  eq(U.rng('2026-11-20:shop').shuffle(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']).join(''), 'cdjihgebfa');
});
test('katalog: pogoji za odklep', () => {
  eq(K.checkUnlock({ level: 10 }, { level: 9 }), { ok: false, reason: 'Odkleni na nivoju 10' });
  ok(K.checkUnlock({ level: 10 }, { level: 10 }).ok);
  ok(!K.checkUnlock({ achievement: 'reakcija:bliskovit' }, { achievements: [] }).ok);
  ok(K.checkUnlock({ achievement: 'reakcija:bliskovit' }, { achievements: ['reakcija:bliskovit'] }).ok);
  ok(!K.checkUnlock({ streak: 7 }, { streak: 6 }).ok);
  ok(K.checkUnlock({ free: true }, {}).ok && K.checkUnlock(null, {}).ok);
});

/* ------------------------------------------------------- lokalni adapter: kovanci */
async function rich(b, coins) {
  const all = b._profiles(); all[b.userId].coins = coins; S.save('db:profiles', all);
}
test('lokalno: reportGame (igra, zmaga, niz) in dnevna meja', async () => {
  clearLocal();
  const [a] = await users('c1');
  const r1 = await a.reportGame({ game: 'reakcija', won: true, players: 3 });
  eq([r1.game, r1.win, r1.streak, r1.streak_bonus, r1.first], [E.COINS.GAME, E.COINS.WIN, 1, 5, true]);
  const r2 = await a.reportGame({ game: 'reakcija', won: true, players: 1 });
  eq([r2.game, r2.win, r2.streak_bonus], [E.COINS.GAME, 0, 0]);
  await throwsCode(() => a.reportGame({ game: '<x>' }), 'invalid');
  for (let i = 0; i < 40; i++) await a.reportGame({ game: 'reakcija', won: true, players: 2 });
  const p = await a.getProfile();
  ok(p.coins <= E.COINS.PER_DAY, 'presežena dnevna meja: ' + p.coins);
  eq(a._earnedToday(), p.coins);
  const led = a._ledger();
  eq([led.filter(l => l.reason === 'game').length, led.filter(l => l.reason === 'win').length], [E.COINS.GAMES_PER_DAY, E.COINS.WINS_PER_DAY]);
  eq(p.coins, 5 + E.COINS.GAMES_PER_DAY * E.COINS.GAME + E.COINS.WINS_PER_DAY * E.COINS.WIN);
  eq((await a.awardCoins(500)).granted, Math.min(E.COINS.PER_CALL, E.COINS.PER_DAY - p.coins));
  for (let i = 0; i < 5; i++) await a.awardCoins(100);
  eq((await a.getProfile()).coins, E.COINS.PER_DAY);
  eq((await a.awardCoins(100)).granted, 0);
});
test('lokalno: nakup (premalo, zaklenjeno, uspeh, že v lasti, popust)', async () => {
  clearLocal();
  const [a] = await users('c2');
  await throwsCode(() => a.buyItem('frame-neon-pink'), 'not_enough_coins');
  await throwsCode(() => a.buyItem('nic'), 'unavailable');
  await rich(a, 5000);
  await throwsCode(() => a.buyItem('frame-crown'), 'locked');            // nivo 10
  const offer = K.dailyOffer(U.dailySeed());
  const normal = K.CATALOG.find(i => i.price > 0 && !i.unlock && !offer.includes(i.id));
  const r = await a.buyItem(normal.id);
  eq([r.price, r.coins], [normal.price, 5000 - normal.price]);
  await throwsCode(() => a.buyItem(normal.id), 'owned');
  const deal = K.item(offer.find(id => !K.item(id).unlock));
  if (deal) eq((await a.buyItem(deal.id)).price, E.offerPrice(deal.price));
  eq(a._ledger().filter(l => l.amount < 0).length, deal ? 2 : 1);
});
test('lokalno: odklep s pogojem (dosežek) in opremljanje', async () => {
  clearLocal();
  const [a] = await users('c3');
  await throwsCode(() => a.unlockItem('frame-bolt'), 'locked');
  await throwsCode(() => a.unlockItem('frame-neon-pink'), 'not_free');
  await throwsCode(() => a.equip('frame', 'frame-bolt'), 'not_owned');
  await a.unlock({ game: 'reakcija', key: 'bliskovit', title: 'B' });
  eq((await a.getProfile()).coins, E.COINS.ACHIEVEMENT);                 // +15 za dosežek
  await a.unlockItem('frame-bolt');
  await throwsCode(() => a.unlockItem('frame-bolt'), 'owned');
  eq(await a.equip('frame', 'frame-bolt'), { frame: 'frame-bolt' });
  eq(await a.equip('title', 'title-novinec'), { frame: 'frame-bolt', title: 'title-novinec' });   // brezplačen
  await throwsCode(() => a.equip('title', 'frame-thin'), 'invalid');
  await throwsCode(() => a.equip('hat', 'frame-thin'), 'invalid');
  eq(await a.equip('frame', null), { title: 'title-novinec' });
  ok((await a.getInventory()).some(i => i.item_id === 'frame-bolt' && i.source === 'unlock'));
});
test('lokalno: naloge (napredek, prevzem enkrat, bonus, poteklo)', async () => {
  clearLocal();
  const [a] = await users('c4');
  const d = Q.dayPeriod(U.dailySeed()), w = Q.weekPeriod(U.dailySeed());
  eq(await a.saveQuestProgress({ period: d, quest_id: 'e.play-3', progress: 2 }), 2);
  eq(await a.saveQuestProgress({ period: d, quest_id: 'e.play-3', progress: 1 }), 2);   // le narašča
  const c1 = await a.claimQuest(d, 'e.play-3');
  eq([c1.reward, c1.bonus], [E.COINS.QUEST.e, 0]);
  await throwsCode(() => a.claimQuest(d, 'e.play-3'), 'claimed');
  await throwsCode(() => a.claimQuest(d, 'e.drugo'), 'claimed');        // en prevzem na slot
  await throwsCode(() => a.claimQuest('d:2020-01-01', 'm.x'), 'expired');
  await throwsCode(() => a.claimQuest(d, 'w1.x'), 'invalid');
  await throwsCode(() => a.claimQuest(d, 'zz.x'), 'invalid');
  await a.claimQuest(d, 'm.play-5');
  const c3 = await a.claimQuest(d, 'h.win-1');
  eq(c3.bonus, E.COINS.ALL_DAILY_BONUS);
  const cw = await a.claimQuest(w, 'w2.w-play-25');
  ok(cw.granted <= cw.reward, 'tedenska');
  ok((await a.getProfile()).coins <= E.COINS.PER_DAY, 'dnevna meja');
  const rows = await a.getQuestProgress([d]);
  eq(rows.filter(r => r.claimed_at).length, 3);
});
test('lokalno: nagrada za nivo', async () => {
  clearLocal();
  const [a] = await users('c5');
  const r = await a.awardXp(275);        // nivo 1 → 3
  eq(r.level_coins, E.levelReward(2) + E.levelReward(3));
  eq(r.coins, r.level_coins);
});

/* ------------------------------------------------------- ladjice */
// flota 5-4-3-3-2 v vrsticah 0, 2, 4, 6, 8 (brez dotikanja)
const LJ_FLEET = [[0, 1, 2, 3, 4], [20, 21, 22, 23], [40, 41, 42], [60, 61, 62], [80, 81]];
function ljDuel(capA = 'sonar', capB = 'sonar', { crates = false, mode = 'duel', n = 2 } = {}) {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, n);
  const caps = [capA, capB, 'sonar', 'sonar', 'sonar', 'sonar'];
  const st = L.newGame({ mode, seed: 'test', settings: { crates }, players: ids.map((id, i) => ({ id, captain: caps[i] })) });
  if (mode !== 'br') for (const id of ids) ok(L.setFleet(st, id, LJ_FLEET), 'setFleet');
  L.startPlay(st);
  st.turn = 0;
  for (const p of st.players) { p.crates = crates ? p.crates : []; }
  return st;
}
const P = (st, id) => L.playerById(st, id);
const shoot = (st, by, target, cell) => L.act(st, by, { t: 'shot', target, cell });
/** b vedno strelja v prazno (zadnja vrstica od desne). */
function pass(st, by = 'b', target = 'a') {
  const T = P(st, target);
  let c = 99;
  while (T.marks[c] != null || LJ_FLEET.flat().includes(c)) c--;
  return shoot(st, by, target, c);
}

test('ladjice: veljavnost postavitve', () => {
  ok(L.validateFleet(10, [5, 4, 3, 3, 2], LJ_FLEET, true));
  ok(!L.validateFleet(10, [5, 4, 3, 3, 2], [[0, 1, 2, 3, 4], [10, 11, 12, 13], [40, 41, 42], [60, 61, 62], [80, 81]], true), 'dotikanje');
  ok(L.validateFleet(10, [5, 4, 3, 3, 2], [[0, 1, 2, 3, 4], [10, 11, 12, 13], [40, 41, 42], [60, 61, 62], [80, 81]], false), 'dotikanje dovoljeno');
  ok(!L.validateFleet(10, [5, 4, 3, 3, 2], [[0, 1, 2, 3, 4], [16, 27, 38, 49], [40, 41, 42], [60, 61, 62], [80, 81]], false), 'diagonalno se ne dotika, a dovoljeno ni');
  ok(!L.validateFleet(10, [5, 4, 3, 3, 2], [[0, 1, 2, 3, 4], [0, 10, 20, 30], [40, 41, 42], [60, 61, 62], [80, 81]], false), 'prekrivanje');
  ok(!L.validateFleet(10, [5, 4, 3, 3, 2], [[8, 9, 10, 11, 12], [30, 31, 32, 33], [50, 51, 52], [70, 71, 72], [90, 91]], false), 'čez rob');
  ok(!L.validateFleet(10, [5, 4, 3, 3, 2], [[0, 1, 2, 12, 13], [30, 31, 32, 33], [50, 51, 52], [70, 71, 72], [90, 91]], false), 'zvita ladja');
  ok(!L.validateFleet(10, [5, 4, 3, 3, 2], LJ_FLEET.slice(1), true), 'manjka ladja');
  ok(L.validateFleet(10, [5, 4, 3, 3, 2], [[0, 10, 20, 30, 40], [2, 3, 4, 5], [62, 63, 64], [97, 98, 99], [8, 18]], true), 'navpična');
  for (const [mode, n] of [['duel', 2], ['br', 3], ['br', 4], ['br', 5], ['br', 10]]) {
    const { size, fleet } = L.configFor(mode, n);
    for (let s = 0; s < 40; s++) {
      const r = L.makeRand(mode + n + ':' + s);
      ok(L.validateFleet(size, fleet, L.randomFleet(size, fleet, true, r), true), `naključna flota ${mode} ${n}`);
    }
  }
  eq(L.configFor('br', 3), { size: 8, fleet: [4, 3, 2, 2] });
  eq(L.configFor('br', 7), { size: 7, fleet: [3, 2, 2] });
});

test('ladjice: strel, zadetek, potop, mana, poteze', () => {
  const st = ljDuel();
  eq(L.current(st).id, 'a');
  eq(shoot(st, 'b', 'a', 5).err, 'not_your_turn');
  eq(shoot(st, 'a', 'a', 5).err, 'bad_target');
  let r = shoot(st, 'a', 'b', 99);
  ok(r.ok);
  eq(P(st, 'b').marks[99], 'm');
  eq(P(st, 'a').mana, 2);
  eq(L.current(st).id, 'b');
  pass(st);
  eq(shoot(st, 'a', 'b', 99).err, 'bad_cell', 'isto polje dvakrat');
  r = shoot(st, 'a', 'b', 80);
  ok(r.ev.some(e => e.res === 'hit'));
  eq(P(st, 'a').mana, 3);
  pass(st);
  r = shoot(st, 'a', 'b', 81);
  const s = r.ev.find(e => e.k === 'shot');
  eq(s.res, 'sink');
  eq(s.cells, [80, 81]);
  eq(P(st, 'b').marks[80], 's');
  eq(P(st, 'a').mana, 3 + 1 + 2);
  eq(P(st, 'a').stats.sinks, 1);
  eq(P(st, 'a').stats.bestStreak, 2);
  // meja mane
  P(st, 'a').mana = 9;
  pass(st);
  shoot(st, 'a', 'b', 98);
  eq(P(st, 'a').mana, L.MANA_MAX);
});

test('ladjice: sonar (aktivna 3×3, pasivka smer)', () => {
  const st = ljDuel('sonar');
  const a = P(st, 'a');
  eq(L.act(st, 'a', { t: 'ability', target: 'b', cell: 11 }).err, 'no_mana');
  a.mana = 4;
  const r = L.act(st, 'a', { t: 'ability', target: 'b', cell: 11 });
  ok(r.ok);
  eq(a.mana, 0);
  eq(a.intel.b, { 0: 1, 1: 1, 2: 1, 10: 0, 11: 0, 12: 0, 20: 1, 21: 1, 22: 1 });
  eq(L.current(st).id, 'b', 'sposobnost porabi potezo');
  pass(st);
  const r2 = shoot(st, 'a', 'b', 1);
  eq(r2.ev.find(e => e.k === 'dir').dir, 'h');
  eq(a.stats.intelHits, 1);
  pass(st);
  ok(!shoot(st, 'a', 'b', 20).ev.some(e => e.k === 'dir'), 'smer le prvič');
  // megla: sonar stane 1 manj
  st.modifier = 'megla';
  eq(L.abilityCost(st, a), 3);
});

test('ladjice: torpedo (vrstica, prvi zadetek, pasivka +1 ob potopitvi)', () => {
  const st = ljDuel('torpedo');
  const a = P(st, 'a');
  a.mana = 10;
  let r = L.act(st, 'a', { t: 'ability', target: 'b', line: { dir: 'r', i: 1 } });
  ok(r.ok);
  ok([10, 11, 12, 13, 14, 15, 16, 17, 18, 19].every(c => P(st, 'b').marks[c] === 'm'), 'prazna vrstica razkrita');
  eq(a.mana, 5);
  pass(st);
  r = L.act(st, 'a', { t: 'ability', target: 'b', line: { dir: 'c', i: 2 } });
  ok(r.ev.some(e => e.k === 'shot' && e.res === 'hit' && e.cell === 2), 'zadene prvo ladjo v stolpcu');
  eq(P(st, 'b').marks[22], undefined, 'za ladjo se ustavi');
  // pasivka: +1 ob potopitvi
  pass(st);
  shoot(st, 'a', 'b', 80); pass(st);
  const before = a.mana;
  shoot(st, 'a', 'b', 81);
  eq(a.mana, Math.min(10, before + 1 + 2 + 1));
  // torpedo potopi ladjo → torpSinks
  const st2 = ljDuel('torpedo');
  P(st2, 'b').ships[4].hits = [1, 0];
  P(st2, 'b').marks[80] = 'h';
  P(st2, 'a').mana = 5;
  L.act(st2, 'a', { t: 'ability', target: 'b', line: { dir: 'r', i: 8 } });
  eq(P(st2, 'a').stats.torpSinks, 1);
});

test('ladjice: vaba (lažna ladja, pasivka preživi potopitev)', () => {
  const st = ljDuel('sonar', 'vaba');
  pass(st, 'a', 'b');
  const b = P(st, 'b');
  b.mana = 3;
  ok(L.act(st, 'b', { t: 'ability', cell: 97, vertical: false }).ok);
  eq(b.decoys[0].cells, [97, 98]);
  const r = shoot(st, 'a', 'b', 98);
  eq(r.ev.find(e => e.k === 'shot').res, 'decoy');
  eq(b.marks[97], 'v');
  eq(b.stats.decoyHits, 1);
  pass(st, 'b', 'a');
  // pasivka: prva potopitev → ladja ostane z enim poljem
  shoot(st, 'a', 'b', 80); pass(st, 'b', 'a');
  const r2 = shoot(st, 'a', 'b', 81);
  ok(r2.ev.some(e => e.k === 'saved'), 'rešena');
  ok(!b.ships[4].sunk);
  eq(b.ships[4].hits.filter(Boolean).length, 1);
  eq(b.marks[80], undefined, 'polje je spet neznano');
  pass(st, 'b', 'a');
  shoot(st, 'a', 'b', 80);
  ok(b.ships[4].sunk, 'drugič potone');
});

test('ladjice: popravilo (aktivna, pasivka vsak 4. krog)', () => {
  const st = ljDuel('popravilo', 'sonar');
  pass(st, 'a', 'b');
  shoot(st, 'b', 'a', 0);
  const a = P(st, 'a');
  eq(a.marks[0], 'h');
  eq(L.act(st, 'a', { t: 'ability', cell: 1 }).err, 'no_mana');
  a.mana = 4;
  eq(L.act(st, 'a', { t: 'ability', cell: 1 }).err, 'bad_cell', 'nezadeto polje');
  ok(L.act(st, 'a', { t: 'ability', cell: 0 }).ok);
  eq(a.ships[0].hits[0], 0);
  eq(a.marks[0], undefined);
  // pasivka
  const st2 = ljDuel('popravilo', 'sonar');
  const a2 = P(st2, 'a');
  let gained = 0;
  while (st2.round < 4) {
    const r = L.current(st2).id === 'a' ? pass(st2, 'a', 'b') : pass(st2, 'b', 'a');
    gained += r.ev.filter(e => e.k === 'mana' && e.why === 'repair').length;
  }
  eq(gained, 1);
});

test('ladjice: EMP (preskok, ne dvakrat zapored, pasivka ±1)', () => {
  const st = ljDuel('emp', 'sonar', { mode: 'br', n: 3 });
  for (const p of st.players) p.ships = L.randomFleet(st.size, st.fleet, true, L.makeRand(p.id)).map((cells, k) => ({ id: k, cells, hits: cells.map(() => 0), size: cells.length, sunk: false }));
  const a = P(st, 'a');
  a.mana = 12;
  ok(L.act(st, 'a', { t: 'ability', target: 'b' }).ok);
  eq(L.current(st).id, 'c', 'b preskoči');
  // c strelja
  const free = L.unmarked(st, P(st, 'a')).find(c => !P(st, 'a').ships.some(s => s.cells.includes(c)));
  shoot(st, 'c', 'a', free);
  eq(L.current(st).id, 'a');
  a.mana = 10;
  eq(L.act(st, 'a', { t: 'ability', target: 'b' }).err, 'emp_repeat');
  ok(L.act(st, 'a', { t: 'ability', target: 'c' }).ok);
  // pasivka
  a.mana = 5;
  const seen = L.shownMana(st, a, 'b');
  eq(Math.abs(seen - 5), 1);
  eq(L.shownMana(st, a, 'a'), 5);
});

test('ladjice: kasetna bomba (4 polja, pasivka +3)', () => {
  const st = ljDuel('kasetna');
  const a = P(st, 'a');
  shoot(st, 'a', 'b', 99);
  eq(a.mana, 3);
  pass(st);
  a.mana = 5;
  const r = L.act(st, 'a', { t: 'ability', target: 'b' });
  ok(r.ok);
  eq(r.ev.find(e => e.k === 'cluster').cells.length, 4);
  eq(Object.keys(P(st, 'b').marks).length, 5);
  eq(a.mana, 0 + r.ev.filter(e => e.k === 'mana' && e.pid === 'a').reduce((s, e) => s + e.n, 0));
});

test('ladjice: zaboji in predmeti (radar, mina, dvojni, ščit, inventar ≤2)', () => {
  const st = ljDuel('sonar', 'sonar', { crates: true });
  const a = P(st, 'a'), b = P(st, 'b');
  b.crates = [99, 98, 97];
  st.rs = 7;
  const r = shoot(st, 'a', 'b', 99);
  ok(r.ev.find(e => e.res === 'crate').item, 'dobi predmet');
  eq(a.inv.length, 1);
  eq(b.marks[99], 'c');
  pass(st); shoot(st, 'a', 'b', 98); pass(st);
  eq(a.inv.length, 2);
  shoot(st, 'a', 'b', 97);
  eq(a.inv.length, 2, 'inventar največ 2');
  eq(a.stats.crates, 3);
  pass(st);
  // dvojni strel: dva strela v eni potezi
  a.inv = ['dvojni', 'radar'];
  ok(L.act(st, 'a', { t: 'item', item: 'dvojni' }).ok);
  eq(L.current(st).id, 'a', 'predmet ne porabi poteze');
  shoot(st, 'a', 'b', 96);
  eq(L.current(st).id, 'a', 'drugi strel');
  ok(L.act(st, 'a', { t: 'item', item: 'radar', target: 'b' }).ok);
  const known = Object.entries(a.intel.b).filter(([, v]) => v === 1).map(([c]) => +c);
  ok(known.length === 1 && LJ_FLEET.flat().includes(known[0]), 'radar razkrije ladjo');
  eq(L.act(st, 'a', { t: 'item', item: 'radar', target: 'b' }).err, 'no_item');
  shoot(st, 'a', 'b', 95);
  eq(L.current(st).id, 'b');
  // ščit b-ja odbije zadetek
  b.inv = ['scit', 'mina'];
  ok(L.act(st, 'b', { t: 'item', item: 'scit' }).ok);
  eq(L.act(st, 'b', { t: 'item', item: 'mina', cell: 0 }).err, 'bad_cell', 'mina ne na ladjo');
  ok(L.act(st, 'b', { t: 'item', item: 'mina', cell: 90 }).ok);
  pass(st);
  const s = shoot(st, 'a', 'b', 40);
  eq(s.ev.find(e => e.k === 'shot').res, 'shield');
  eq(b.marks[40], undefined);
  pass(st);
  // mina: a izgubi naslednjo potezo
  eq(shoot(st, 'a', 'b', 90).ev.find(e => e.k === 'shot').res, 'mine');
  pass(st);
  eq(L.current(st).id, 'b', 'a preskoči zaradi mine');
});

test('ladjice: konec igre, zmagovalec, neodločeno', () => {
  const st = ljDuel();
  const cells = LJ_FLEET.flat();
  for (let k = 0; k < cells.length; k++) {
    shoot(st, 'a', 'b', cells[k]);
    if (st.phase === 'play') pass(st);
  }
  eq(st.phase, 'over');
  eq(st.winner, 'a');
  ok(!P(st, 'b').alive);
  eq(P(st, 'a').stats.kills, 1);
  eq(shoot(st, 'a', 'b', 99).err, 'phase');
  eq(L.standings(st).map(p => p.id), ['a', 'b']);
  ok(L.awards(st).some(w => w.id === 'ostrostrelec' && w.pid === 'a'));
  // neodločeno: več preživelih polj pred zadnjim dejanjem
  eq(L.decideWinner([{ id: 'x', cellsBefore: 1, elimStep: 5 }, { id: 'y', cellsBefore: 3, elimStep: 5 }]).id, 'y');
  eq(L.decideWinner([{ id: 'x', cellsBefore: 2, elimStep: 6 }, { id: 'y', cellsBefore: 2, elimStep: 5 }]).id, 'x');
  // predaja (odklop) → zmaga drugi
  const st2 = ljDuel();
  L.forfeit(st2, 'a');
  eq(st2.winner, 'b');
});

test('ladjice: battle royale (glava na pladnju, maščevanje, duhovi)', () => {
  const st = L.newGame({ mode: 'br', seed: 'br', settings: { crates: false }, players: ['a', 'b', 'c'].map(id => ({ id, captain: 'sonar' })) });
  eq(st.size, 8);
  const F = [[0, 1, 2, 3], [16, 17, 18], [32, 33], [48, 49]];
  for (const id of ['a', 'b', 'c']) ok(L.setFleet(st, id, F));
  L.startPlay(st);
  st.turn = 0;
  const empty = id => { const T = P(st, id); for (let c = 63; c >= 0; c--) if (T.marks[c] == null && !F.flat().includes(c)) return c; };
  const go = (by, t, c) => { const r = shoot(st, by, t, c); ok(r.ok, `${by}→${t}:${c} ${r.err}`); return r; };
  // b potopi c-jevo ladjo → b je vodja
  go('a', 'c', empty('c'));
  go('b', 'c', 48); go('c', 'a', empty('a'));
  go('a', 'c', empty('c'));
  go('b', 'c', 49);
  eq(L.bountyLeader(st).id, 'b');
  // c zadene a → a se maščuje
  go('c', 'a', 0);
  const r = go('a', 'c', empty('c'));
  ok(r.ev.some(e => e.k === 'revenge'), 'maščevanje');
  // a potopi b-jevo ladjo → glava na pladnju (+3)
  go('b', 'c', empty('c')); go('c', 'b', empty('b'));
  go('a', 'b', 32); go('b', 'c', empty('c')); go('c', 'b', empty('b'));
  const r2 = go('a', 'b', 33);
  ok(r2.ev.some(e => e.k === 'bounty'), 'glava na pladnju');
  // izloči c → duh, meteor
  const cP = P(st, 'c');
  for (const s of cP.ships) for (const c of s.cells) if (!s.sunk) { s.hits = s.hits.map(() => 1); }
  for (const s of cP.ships) if (!s.sunk) { s.hits[s.hits.length - 1] = 0; }
  // dokončaj c-jeve ladje
  for (const s of cP.ships.filter(x => !x.sunk)) {
    while (L.current(st).id !== 'a') { const cur = L.current(st).id; go(cur, cur === 'b' ? 'a' : 'b', empty(cur === 'b' ? 'a' : 'b')); }
    go('a', 'c', s.cells[s.cells.length - 1]);
  }
  ok(!cP.alive, 'c izločen');
  ok(L.current(st).id !== 'c');
  eq(L.act(st, 'c', { t: 'shot', target: 'a', cell: 5 }).err, 'not_your_turn');
  if (!L.canMeteor(st, cP)) {
    while (st.round < cP.ghostReady) { const cur = L.current(st).id; go(cur, cur === 'b' ? 'a' : 'b', empty(cur === 'b' ? 'a' : 'b')); }
  }
  ok(L.canMeteor(st, cP));
  const m = L.act(st, 'c', { t: 'meteor' });
  ok(m.ok && m.ev.some(e => e.k === 'meteor'));
  eq(L.act(st, 'c', { t: 'meteor' }).err, 'not_ready', 'meteor le vsake 3 kroge');
  eq(cP.ghostReady, st.round + L.GHOST_EVERY);
});

test('ladjice: AI nikoli ne strelja dvakrat na isto polje in igro konča', () => {
  for (const level of ['mornar', 'kapitan', 'admiral']) {
    for (const [i, cap] of LC.CAPTAIN_IDS.entries()) {
      const mode = i % 2 ? 'br' : 'ai';
      const n = mode === 'br' ? 3 + (i % 3) : 2;
      const st = L.newGame({ mode, seed: level + cap, players: Array.from({ length: n }, (_, k) => ({ id: 'p' + k, captain: LC.CAPTAIN_IDS[(i + k) % 6], ai: level })) });
      L.startPlay(st);
      let steps = 0;
      while (st.phase === 'play' && steps < 3000) {
        const pid = L.current(st).id;
        const a = LA.chooseAction(st, pid, level);
        ok(a, 'AI brez dejanja');
        if (a.t === 'shot') ok(L.playerById(st, a.target).marks[a.cell] == null, `${level}/${cap}: dvojni strel na ${a.cell}`);
        let r = L.act(st, pid, a);
        if (!r.ok) {
          ok(a.t !== 'shot', `${level}: neveljaven strel ${r.err}`);
          r = L.act(st, pid, L.randomShot(st, pid));
          ok(r.ok, 'rezervni strel');
        }
        steps++;
      }
      eq(st.phase, 'over', `${level}/${cap} ni končal`);
    }
  }
});

test('ladjice: Admiral je boljši od Mornarja (povprečno strelov)', () => {
  const shots = level => {
    let total = 0;
    for (let g = 0; g < 6; g++) {
      const st = L.dailyGame('2026-11-' + (10 + g), 'me');
      st.players[0].captain = 'none';
      let k = 0;
      while (st.phase === 'play' && k < 200) { L.act(st, 'me', { t: 'shot', target: 'ai', cell: LA.bestShot(st, st.players[0], st.players[1], level, () => L.rnd(st)) }); k++; }
      total += k;
    }
    return total / 6;
  };
  const m = shots('mornar'), a = shots('admiral');
  ok(a < m - 10, `admiral ${a} vs mornar ${m}`);
  return `admiral ${a.toFixed(1)}, kapitan ${shots('kapitan').toFixed(1)}, mornar ${m.toFixed(1)} strelov`;
});

test('ladjice: dnevni izziv je determinističen', () => {
  const a = L.dailyGame('2026-11-20', 'x'), b = L.dailyGame('2026-11-20', 'y');
  eq(a.players[1].ships, b.players[1].ships);
  eq(a.players[1].crates, b.players[1].crates);
  eq(a.modifier, b.modifier);
  eq(a.players[0].captain, b.players[0].captain);
  ok(LC.DAILY_CAPTAINS.includes(a.players[0].captain));
  ok(LC.MODIFIER_IDS.includes(a.modifier));
  ok(L.validateFleet(10, a.fleet, a.players[1].ships.map(s => s.cells), true));
  const c = L.dailyGame('2026-11-21', 'x');
  ok(JSON.stringify(c.players[1].ships) !== JSON.stringify(a.players[1].ships), 'drug dan, druga flota');
  eq(a.players[0].offer, [], 'v dnevnem izzivu ni pogodb');
  // AI ne strelja nazaj: igralec je vedno na potezi
  for (let k = 0; k < 5; k++) { L.act(a, 'x', L.randomShot(a, 'x')); eq(L.current(a).id, 'x'); }
  eq(a.players[0].stats.turns, 5);
  // do konca
  while (a.phase === 'play') L.act(a, 'x', L.randomShot(a, 'x'));
  eq(a.winner, 'x');
});

test('ladjice: pogodbe, komentator, XP', () => {
  ok(LC.CONTRACTS.length >= 12);
  ok(LC.LINE_COUNT >= 25, 'komentator ' + LC.LINE_COUNT);
  ok(LC.ACHIEVEMENTS.length >= 10);
  const st = ljDuel('sonar', 'sonar');
  ok(st.players.every(p => p.offer.length === 3 && p.contract === p.offer[0]));
  eq(L.act(st, 'a', { t: 'contract', id: 'nič' }).ok, false);
  // pogodba »3× zapored« se izpolni med igro
  const a = P(st, 'a');
  a.contract = 'streak3'; a.contractDone = false;
  shoot(st, 'a', 'b', 0); pass(st); shoot(st, 'a', 'b', 1); pass(st);
  const r = shoot(st, 'a', 'b', 2);
  ok(r.ev.some(e => e.k === 'contract' && e.pid === 'a'));
  ok(a.contractDone);
  eq(L.xpFor({ mode: 'duel', won: true, contracts: 1 }), 85);
  eq(L.xpFor({ mode: 'ai', won: true, level: 'admiral' }), 55);
  eq(L.xpFor({ mode: 'ai', won: false }), 15);
  eq(L.xpFor({ mode: 'daily', won: true }), 40);
});

/* ------------------------------------------------------- Hrčkova krogla */

const KL = (rows, extra = {}) => {
  const W = Math.max(...rows.map(r => r.length));
  return { id: '99-test', name: 'Test', set: 1, timeBonus: 30, medals: { gold: 5, silver: 8, bronze: 12 }, size: [W, rows.length],
    map: rows, start: [1.5, rows.length - 1.5], goal: [1.5, 0.5], checkpoints: [], pickups: [], ...extra };
};
const krRun = (w, secs, ix = 0, iz = 0) => { for (let i = 0; i < Math.round(secs / KP.STEP); i++) { w.events.length = 0; KP.step(w, ix, iz); } };

test('krogla: krogla na ravnem se ustavi', () => {
  const w = KP.createWorld(KL(['.....', '.....', '.....', '.....', '.....']));
  w.ball.vx = 4; w.ball.vz = -3;
  krRun(w, 4);
  ok(Math.hypot(w.ball.vx, w.ball.vz) < 0.01, 'hitrost ' + Math.hypot(w.ball.vx, w.ball.vz));
  ok(w.ball.grounded && Math.abs(w.ball.y - w.R) < 1e-6);
});
test('krogla: na klančini pospeši navzdol; led drsi dlje kot lepilo', () => {
  // klančini '^' (dvig proti severu) od višine 0 do 1; krogla začne na vrhu in se kotali proti jugu
  const L = KL(['...', '...', '^^^', '^^^', '...', '...'], { hmap: ['222', '222', '111', '000', '000', '000'], start: [1.5, 2.1] });
  const w = KP.createWorld(L);
  krRun(w, 0.5);
  ok(w.ball.vz > 1.5, 'krogla se ne kotali navzdol: vz=' + w.ball.vz);
  const slide = ch => {
    const w2 = KP.createWorld(KL(Array(8).fill(ch.repeat(3)), { start: [1.5, 7.5] }));
    w2.ball.vz = -5; krRun(w2, 0.6); return 7.5 - w2.ball.z;
  };
  const [i, f, g] = [slide('i'), slide('.'), slide('g')];
  ok(i > f && f > g, `led ${i}, tla ${f}, lepilo ${g}`);
});
test('krogla: ne gre skozi steno pri največji hitrosti', () => {
  const w = KP.createWorld(KL(['.....', '.....', '#####', '.....', '.....', '.....', '.....']));
  w.ball.vz = -KP.P.MAXV;
  for (let i = 0; i < 240; i++) { w.events.length = 0; KP.step(w, 0, -1); ok(w.ball.z > 3 - 1e-6, 'krogla je v/za steno: z=' + w.ball.z); }
  const w2 = KP.createWorld(KL(Array(7).fill('.....'), { blocks: [{ x: 0, z: 3, w: 5, d: 0.1, y0: 0, y1: 1 }] }));
  w2.ball.vz = -KP.P.MAXV;
  for (let i = 0; i < 240; i++) { w2.events.length = 0; KP.step(w2, 0, -1); ok(w2.ball.z > 3.1, 'skozi tanko steno: z=' + w2.ball.z); }
});
test('krogla: fizika neodvisna od FPS (30 vs 144 sličic)', () => {
  const L = KL(Array(30).fill('....................'), { start: [5.5, 25.5] });
  const sim = fps => {
    const w = KP.createWorld(L);
    let acc = 0, t = 0;
    while (w.steps < 360) {
      const dt = 1 / fps; t += dt; acc += dt;
      while (acc >= KP.STEP && w.steps < 360) { const inp = w.t < 1.5 ? [0.6, -0.8] : [-1, 0]; w.events.length = 0; KP.step(w, inp[0], inp[1]); acc -= KP.STEP; }
    }
    return { x: w.ball.x, z: w.ball.z, t: w.t };
  };
  const a = sim(30), b = sim(144);
  const err = Math.hypot(a.x - b.x, a.z - b.z);
  ok(err < 1e-9, 'razlika ' + err);
});
test('krogla: padec in kontrolna točka', () => {
  const w = KP.createWorld(KL(['...', '...', '...', '...'], { checkpoints: [[1.5, 1.5]], goal: [0.5, 3.5] }));
  krRun(w, 1.5, 0, -0.5);
  ok(w.checkpoint === 0, 'kontrolna točka ni aktivirana');
  let fell = false;
  for (let i = 0; i < 600 && !fell; i++) { w.events.length = 0; KP.step(w, 1, 0); fell = w.events.some(e => e.type === 'fall'); }
  ok(fell, 'ni padca');
  krRun(w, KP.P.FALL_DELAY + 0.6);
  ok(!w.dead && Math.abs(w.ball.x - 1.5) < 0.2 && Math.abs(w.ball.z - 1.5) < 0.2, 'vrnitev na kontrolno točko');
  eq(w.falls, 1);
});
test('krogla: ura, prenos časa, točke in težavnosti', () => {
  const L = { timeBonus: 40 };
  const run = KR.newRun('normalna');
  eq(KR.startLevel(run, L), 40);
  ok(!KR.tick(run, 10)); eq(run.clock, 30);
  const pts = KR.finishLevel(run, { id: 'a' }, { time: 10, stars: 2 });
  eq(pts, 1000 + 20 * 30 + 200);
  KR.startLevel(run, L);
  eq(run.clock, 70, 'preostanek se prenese');
  ok(KR.tick(run, 71)); ok(run.over);
  eq(KR.levelTime(L, 'lahka'), 56); eq(KR.levelTime(L, 'noro'), 30);
  eq(KR.levelPoints(10.9, 1, 'lahka'), Math.round((1000 + 200 + 100) * 0.5));
  eq(KR.levelPoints(10, 0, 'noro'), Math.round(1200 * 1.5));
  ok(!KR.countsForUnlock('lahka') && KR.countsForUnlock('noro'));
  eq(KR.fmtTime(83450), '1:23,45'); eq(KR.fmtTime(5070), '5,07');
});
test('krogla: medalje in odklepi', () => {
  const L = { medals: { gold: 20, silver: 25, bronze: 30 } };
  eq([19, 20, 22, 30, 31].map(s => KR.medalFor(L, s)), ['gold', 'gold', 'silver', 'bronze', null]);
  const order = ['a', 'b', 'c', 'd'];
  eq(KR.unlockedLevels(order, []), ['a']);
  eq(KR.unlockedLevels(order, ['b', 'c']), ['a', 'b', 'c']);
  eq(KR.unlockedLevels(order, [], { tourney: true }), order);
  eq(KR.tourneyLevelXp(0), 20); eq(KR.tourneyLevelXp(12), 0);
});
test('krogla: dnevni izbor je determinističen in isti za vse', ctx => {
  const order = ctx.kroglaLevels.map(L => L.id);
  const a = KR.dailyPick(U.rng, '2026-11-21', order), b = KR.dailyPick(U.rng, '2026-11-21', order);
  eq(a, b);
  eq(a.levels.length, 3);
  eq(new Set(a.levels).size, 3);
  ok(a.levels.every(id => order.indexOf(id) < 8), 'iz prvih 8');
  ok(KR.DAILY_MODS.some(m => m.id === a.mod));
  const days = new Set(Array.from({ length: 10 }, (_, i) => JSON.stringify(KR.dailyPick(U.rng, '2026-12-' + String(i + 1).padStart(2, '0'), order))));
  ok(days.size > 5, 'premalo različnih dni');
});
test('krogla: zrcaljenje', ctx => {
  const L = ctx.kroglaLevels[3];
  const M = KL2.mirrorLevel(L);
  eq(M.map[0].length, L.map[0].length);
  eq(M.start, [L.size[0] - L.start[0], L.start[1]]);
  const MM = KL2.mirrorLevel(M);
  eq(MM.map, L.map); eq(MM.start, L.start); eq(MM.movers, L.movers); eq(MM.route, L.route);
  eq(KL2.validateLevel(M), []);
  ok(KA.runAutopilot(M).finished, 'zrcaljena proga ni rešljiva');
});
test('krogla: ghost (zapis → stiskanje → predvajanje, velikost)', ctx => {
  const frames = [];
  for (let i = 0; i < 2400; i++) { const t = i / 20; frames.push([5 + Math.sin(t) * 4 + t * 0.3, 1 + Math.sin(t * 3) * 0.2, 40 - t * 0.5, t * 0.7]); }
  const s = KG.encode(frames);
  ok(s.length < 20000, 'ghost za 2 min je ' + s.length + ' znakov');
  const back = KG.decode(s);
  eq(back.length, frames.length);
  for (let i = 0; i < frames.length; i += 37) for (let k = 0; k < 3; k++) ok(Math.abs(back[i][k] - frames[i][k]) < 0.006, 'odstopanje');
  const p = KG.sampleAt(back, 10.025);
  ok(Math.abs(p.x - (back[200][0] + back[201][0]) / 2) < 1e-9);
  const res = KA.runAutopilot(ctx.kroglaLevels[0]);
  const g = KG.decode(KG.encode(res.frames));
  const end = g[g.length - 1];
  ok(Math.hypot(end[0] - res.world.ball.x, end[2] - res.world.ball.z) < 0.5, 'konec ghosta ni pri cilju');
  return `2 min = ${(s.length / 1024).toFixed(1)} KB`;
});
test('krogla: validator na vseh progah in zaznava napak', ctx => {
  ok(ctx.kroglaLevels.length >= 12, 'manj kot 12 prog');
  for (const L of ctx.kroglaLevels) eq(KL2.validateLevel(L), [], L.id);
  const bad = KL(['...', ' . ', '...'], { start: [1.5, 1.5], goal: [0.5, 1.5], checkpoints: [[9, 9]] });
  bad.medals = { gold: 9, silver: 5, bronze: 3 };
  const errs = KL2.validateLevel(bad).join('\n');
  ok(/cilj/.test(errs) && /kontrolna točka 1/.test(errs) && /medalje/.test(errs) && /zvezdic/.test(errs), errs);
});
test('krogla: vse proge so rešljive (autopilot pod časom proge na Normalni)', ctx => {
  const out = [];
  for (const L of ctx.kroglaLevels) {
    const res = KA.runAutopilot(L);
    ok(res.finished, `${L.id}: autopilot ne pride do cilja`);
    ok(res.time < KR.levelTime(L, 'normalna'), `${L.id}: ${res.time.toFixed(1)} s ≥ ${L.timeBonus} s`);
    const w = KA.replayInputs(L, res.inputs);
    ok(w.finished && Math.abs(w.finishT - res.time) < 1e-9, `${L.id}: predvajanje vhoda ni enako`);
    out.push(`${L.id.slice(0, 2)}: ${res.time.toFixed(0)} s`);
  }
  return out.join(', ');
});
test('lokalno: ghosti (le boljši čas, seznam, podatki)', async () => {
  clearLocal();
  const [a, b] = await users('ga', 'gb');
  eq((await a.saveGhost({ game: 'krogla', level: '01-x', timeMs: 20000, data: 'QUJD' })).saved, true);
  eq((await a.saveGhost({ game: 'krogla', level: '01-x', timeMs: 25000, data: 'WFla' })).saved, false);
  eq((await a.saveGhost({ game: 'krogla', level: '01-x', timeMs: 18000, data: 'WFla' })).saved, true);
  await b.saveGhost({ game: 'krogla', level: '01-x', timeMs: 19000, data: 'QkJC' });
  await b.saveGhost({ game: 'krogla', level: '01-x', mirror: true, timeMs: 1000, data: 'QkJC' });
  eq((await a.getGhosts({ game: 'krogla', level: '01-x' })).map(g => [g.user_id, g.time_ms]), [['test-ga', 18000], ['test-gb', 19000]]);
  eq((await a.getGhost({ game: 'krogla', level: '01-x', userId: 'test-gb' })).data, 'QkJC');
  eq(await a.getGhost({ game: 'krogla', level: '02-x' }), null);
  await throwsCode(() => a.saveGhost({ game: 'krogla', level: '01-x', timeMs: 1, data: 'x'.repeat(70000) }), 'invalid');
});

/**
 * Zaženi vse teste.
 * @param {(s:string)=>void} log
 * @param {{games:any[], schema:Object}} ctx
 */
export async function runAll(log, ctx) {
  S.setPrefix('mg-test:');
  let fails = 0, passed = 0;
  for (const t of tests) {
    try {
      const note = await t.fn(ctx);
      passed++;
      log(`✔ ${t.name}${typeof note === 'string' ? ' — ' + note : ''}`);
    } catch (e) {
      fails++;
      log(`✘ ${t.name}\n    ${e.message}`);
    }
  }
  log(`\n${passed} uspešnih, ${fails} neuspešnih (${tests.length} skupaj)`);
  return { fails, passed };
}
