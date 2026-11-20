/* =====================================================================
   MINI GAMES — testi čiste logike (brez build koraka).
   Brskalnik: tests.html · Node: node tests/run-node.mjs
   ===================================================================== */

import * as U from '../shared/util.js';
import { LocalBackend } from '../shared/adapters/local.js';
import { Room } from '../shared/room.js';
import * as RK from '../games/reakcija/logic.js';
import * as S from '../shared/storage.js';

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
