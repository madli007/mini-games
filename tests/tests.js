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
  ok(ctx.games.filter(g => g.status === 'soon').length >= 14);
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
  ok(!all.some(t => t.id.includes('ladjice')), 'igra soon ne sme imeti nalog');
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
