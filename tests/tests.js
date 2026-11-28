/* =====================================================================
   MINI GAMES — testi čiste logike (brez build koraka).
   Brskalnik: tests.html · Node: node tests/run-node.mjs
   ===================================================================== */

import * as U from '../shared/util.js';
import { LocalBackend } from '../shared/adapters/local.js';
import { Room } from '../shared/room.js';
import * as RK from '../games/reakcija/logic.js';
import * as ZP from '../games/zaporedje/logic.js';
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
import * as KE from '../games/krogla/editor/model.js';
import * as KS from '../games/krogla/editor/share.js';
import * as KD from '../games/krogla/editor/drafts.js';
import * as KN from '../games/krogla/editor/generate.js';
import { rusilecTests } from './rusilec.js';
import { herodleTests } from './herodle.js';
import { herodle2Tests } from './herodle2.js';
import { frnikoleTests } from './frnikole.js';
import { skokiTests } from './skoki.js';
import { ustaviUroTests } from './ustavi-uro.js';
import { sport3Tests } from './sport3.js';
import { skoki4Tests } from './skoki4.js';
import { krogla2Tests } from './krogla2.js';
import { gnecaTests } from './gneca.js';
import { progressTests } from './progress.js';

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
  ok(ctx.games.some(g => g.id === 'zaporedje' && g.status === 'live' && g.scoreOrder === 'desc'));
  const zq = Q.expandTemplates(ctx.games).filter(t => t.game === 'zaporedje' && t.id.startsWith('zaporedje-'));
  ok(zq.length === 8 && zq.some(t => t.id === 'zaporedje-w-steps' && t.target === 100), 'naloge zaporedja');
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
  for (const k of ['db:profiles', 'db:scores', 'db:ach', 'db:xplog', 'db:rooms', 'db:roomPlayers', 'db:state', 'db:moves', 'db:saves', 'db:ghosts', 'db:quests']) {
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
  const top = await a.getTopScores({ game: 'tg', limit: 3 });
  eq(top.map(r => [r.user_id, r.score]), [['test-a', 300], ['test-b', 200], ['test-a', 100]]);
  eq((await a.getTopScores({ game: 'tg', seed: 'x' })).map(r => r.score), [50]);
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

/* ------------------------------------------------------- zaporedje */
test('zaporedje: isti seed → isto zaporedje, različen seed → različno', () => {
  const a = ZP.seqFromSeed(U.rng, '2026-11-21', 120), b = ZP.seqFromSeed(U.rng, '2026-11-21', 120);
  eq(a, b);
  eq(a.length, 120);
  ok(a.every(t => Number.isInteger(t) && t >= 0 && t < 4));
  ok(JSON.stringify(ZP.seqFromSeed(U.rng, '2026-11-22', 120)) !== JSON.stringify(a));
  const d1 = ZP.dailyPlan(U.rng, '2026-11-21'), d2 = ZP.dailyPlan(U.rng, '2026-11-21');
  eq(d1, d2);
  ok(d1.seq.length >= 100);
  ok(ZP.MODS.some(m => m.id === d1.mod));
  eq(d1.n, d1.mod === 'six' ? 6 : 4);
  ok(d1.seq.every(t => t < d1.n));
});
test('zaporedje: nikoli več kot 3 enaki koraki zapored', () => {
  ok(ZP.validRun([0, 0, 0, 1, 1, 1, 0]));
  ok(!ZP.validRun([2, 0, 0, 0, 0]));
  ok(ZP.canAppend([1, 0, 0], 0) && !ZP.canAppend([1, 0, 0, 0], 0) && ZP.canAppend([1, 0, 0, 0], 1));
  // tudi z »zlobnim« PRNG, ki vedno vrne isto
  ok(ZP.validRun(ZP.generate(() => 0, 50, 4)), 'konstanten PRNG krši pravilo');
  for (let s = 0; s < 40; s++) {
    ok(ZP.validRun(ZP.seqFromSeed(U.rng, 'seed' + s, 300, s % 2 ? 4 : 6)), 'seed ' + s);
  }
  for (let i = 0; i < 60; i++) {
    const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    ok(ZP.validRun(ZP.dailyPlan(U.rng, day).seq), day);
  }
});
test('zaporedje: dnevni modifikatorji (vsaj 6) se vrtijo', () => {
  ok(ZP.MODS.length >= 7);
  const seen = new Set();
  for (let i = 0; i < 120; i++) seen.add(ZP.dailyMod(U.rng, new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)));
  ok(seen.size >= 6, 'premalo različnih modifikatorjev: ' + seen.size);
});
test('zaporedje: preverjanje vnosa', () => {
  let st = ZP.startInput([2, 0, 3]);
  st = ZP.press(st, 2, 400);
  ok(!st.done && !st.failed);
  eq(st.pos, 1);
  st = ZP.press(st, 0, 300);
  st = ZP.press(st, 3, 200);
  ok(st.done && !st.failed);
  eq(st.times, [400, 300, 200]);
  const bad = ZP.press(ZP.press(ZP.startInput([1, 1, 2]), 1), 2);
  ok(bad.failed);
  eq([bad.reason, bad.pos, bad.got, ZP.missedTile(bad)], ['wrong', 1, 2, 1]);
  eq(ZP.press(bad, 1), bad, 'po napaki se vnos ne nadaljuje');
});
test('zaporedje: Zrcalo pravilno obrne vnos', () => {
  const seq = [0, 1, 2, 3, 1];
  eq(ZP.expectedFor(seq, 4), [0, 1, 2, 3]);
  eq(ZP.expectedFor(seq, 4, 'mirror'), [3, 2, 1, 0]);
  eq(seq, [0, 1, 2, 3, 1], 'izvirnik ostane');
  let st = ZP.startInput(ZP.expectedFor(seq, 3, 'mirror'));
  for (const t of [2, 1, 0]) st = ZP.press(st, t);
  ok(st.done);
  ok(ZP.press(ZP.startInput(ZP.expectedFor(seq, 3, 'mirror')), 0).failed, 'naprej po vrsti v Zrcalu ni pravilno');
});
test('zaporedje: Kameleon ohrani par barva–simbol–ton', () => {
  const r = U.rng('kameleon');
  let lay = ZP.identityLayout(6);
  const pairs = L0 => ZP.tilesAt(L0).map(t => `${t.color}|${t.sym}|${t.freq}`).sort();
  const want = pairs(lay);
  for (let i = 0; i < 30; i++) {
    const next = ZP.chameleonLayout(lay, r);
    ok(next.some((v, k) => v !== lay[k]), 'razporeditev se ni spremenila');
    eq(next.slice().sort(), ZP.identityLayout(6), 'ni permutacija');
    eq(pairs(next), want);
    const tiles = ZP.tilesAt(next);
    next.forEach((id, pos) => eq([tiles[pos].id, tiles[pos].color, tiles[pos].freq], [id, ZP.TILES[id].color, ZP.TILES[id].freq]));
    lay = next;
  }
  ok(ZP.chameleonLayout([0, 1], () => 0).join() !== '0,1');
});
test('zaporedje: časovna omejitev se šteje kot napaka', () => {
  ok(ZP.isTimedOut(3000, 3000) && !ZP.isTimedOut(2999, 3000));
  ok(!ZP.isTimedOut(99999, 0), 'brez omejitve');
  const st = ZP.timeout(ZP.press(ZP.startInput([0, 1]), 0));
  ok(st.failed);
  eq([st.reason, ZP.missedTile(st)], ['timeout', 1]);
  eq(ZP.timeout(ZP.press(ZP.startInput([0]), 0)).failed, false, 'končan vnos ne more poteči');
  ok(ZP.lineForFail('timeout', null, 1).length > 3);
});
test('zaporedje: tempo, točke, XP, povzetek, tipke', () => {
  eq(ZP.tempoMs(1), 600);
  ok(ZP.tempoMs(10) < ZP.tempoMs(5));
  eq(ZP.tempoMs(40), 250);
  ok(ZP.tempoMs(1, 'turbo') <= 300 && ZP.tempoMs(99, 'turbo') >= 200);
  eq(ZP.scoreFor(8), 7);
  eq(ZP.scoreFor(1), 0);
  eq(ZP.xpFor({ len: 3 }), 15);
  eq(ZP.xpFor({ len: 12 }), 22);
  eq(ZP.xpFor({ len: 100, daily: true, mpWin: true }), 15 + 40 + 15 + 40);
  eq(ZP.stepsFor(3, 2), 8);
  const s = ZP.summary([{ len: 1, times: [500], ok: true }, { len: 2, times: [400, 300], ok: true },
    { len: 3, times: [300, 300, 300], ok: true }, { len: 4, times: [200, 400, 300, 500], ok: true }, { len: 5, times: [100], ok: false }]);
  eq([s.len, s.fastest], [4, { round: 3, avgMs: 300 }]);
  eq(ZP.lengthAchievements(16), ['prvi-koraki', 'slon']);
  ok(ZP.isLightning({ ok: true, times: Array(10).fill(250) }) && !ZP.isLightning({ ok: true, times: Array(9).fill(100) }));
  eq(ZP.dayStreak(['2026-11-21', '2026-11-20', '2026-11-19', '2026-11-17'], '2026-11-21'), 3);
  eq(ZP.dayStreak(['2026-11-20'], '2026-11-21'), 0);
  eq(ZP.dayStreak(['2026-03-01', '2026-02-28'], '2026-03-01'), 2);
  ok(ZP.ALL_LINES.length >= 15, 'premalo napisov');
  eq(ZP.lineForFail('wrong', 1, 2, () => 0), 'Ups, ▲ ni ■.');
  eq(ZP.keyToPos('KeyW'), 1);
  eq(ZP.keyToPos('Digit6', 6), 5);
  eq(ZP.keyToPos('KeyZ'), -1);
});
test('zaporedje: dvoboj — izpadi in razvrstitev ob hkratnem izpadu', () => {
  const st = { a: { outRound: null }, b: { outRound: null }, c: { outRound: null }, d: { outRound: null } };
  let r = ZP.applyDuelRound(st, 1, { a: { ok: true, ms: 500 }, b: { ok: true, ms: 400 }, c: { ok: false, progress: 0, ms: 300 }, d: { ok: true, ms: 600 } });
  eq([r.out, r.over], [['c'], false]);
  // d manjka, a je opravičen (vrnitev v 15 s) — d izpade, a ne
  r = ZP.applyDuelRound(r.st, 2, { b: { ok: true, ms: 900 } }, ['a']);
  eq([r.out, r.alive.sort(), r.over], [['d'], ['a', 'b'], false]);
  // vsi preostali se zmotijo v istem krogu: najprej tisti, ki je prišel dlje, nato hitrejši
  r = ZP.applyDuelRound(r.st, 3, { a: { ok: false, progress: 2, ms: 1500 }, b: { ok: false, progress: 2, ms: 1200 } });
  ok(r.over);
  eq(r.winner, 'b');
  eq(ZP.rankDuel(r.st), ['b', 'a', 'd', 'c']);
  r = ZP.applyDuelRound({ x: { outRound: null }, y: { outRound: null } }, 4, { x: { ok: false, progress: 3, ms: 9000 }, y: { ok: false, progress: 1, ms: 100 } });
  eq(r.winner, 'x', 'dlje je pomembnejše od hitrosti');
  r = ZP.applyDuelRound({ x: { outRound: null }, y: { outRound: null } }, 5, { x: { ok: true, ms: 1 }, y: { ok: false, progress: 4, ms: 1 } });
  eq([r.over, r.winner], [true, 'x']);
  // odsoten od 3. kroga, izločen v 5. → uvrščen kot izpad v 3. krogu
  r = ZP.applyDuelRound({ x: { outRound: null }, y: { outRound: 4 }, z: { outRound: null } }, 5, { x: { ok: true, ms: 1 } }, [], { z: 3 });
  eq([r.st.z.outRound, ZP.rankDuel(r.st)], [3, ['x', 'y', 'z']]);
  const aw = ZP.awards({ x: { best: 5, totalMs: 3000, steps: 15, outRound: null }, y: { best: 4, totalMs: 1000, steps: 14, outRound: 5 } }, ['x', 'y']);
  eq(aw.map(a => [a.key, a.id]), [['slon', 'x'], ['strela', 'y'], ['nesrecnik', 'y']]);
});
test('zaporedje: štafeta — poteze, izpadi, skladatelj', () => {
  let s = { seq: [], authors: [], order: ['a', 'b', 'c'], turn: 0, out: {}, falls: {}, n: 4, turnNo: 0 };
  s = ZP.applyRelayMove(s, { by: 'a', ok: true, added: 2 });
  eq([s.seq, s.turn], [[2], 1]);
  eq(ZP.applyRelayMove(s, { by: 'c', ok: true, added: 1 }), s, 'ni na potezi');
  s = ZP.applyRelayMove(s, { by: 'b', ok: true, added: 2 });
  s = ZP.applyRelayMove(s, { by: 'c', ok: true, added: 2 });
  eq(s.seq, [2, 2, 2]);
  ok(ZP.applyRelayMove(s, { by: 'a', ok: true, added: 2 }).out.a, 'četrti enak korak ni dovoljen');
  s = ZP.applyRelayMove(s, { by: 'a', ok: true, added: 0 });
  s = ZP.applyRelayMove(s, { by: 'b', ok: false, failAt: 3 });
  eq([s.turn, s.out.b.at], [2, 3]);
  s = ZP.applyRelayMove(s, { by: 'c', ok: false, failAt: 3, reason: 'timeout' });
  ok(s.over);
  eq(s.winner, 'a');
  eq(ZP.rankRelay(s), ['a', 'c', 'b']);
  eq(ZP.composer(s), { id: 'a', step: 3, falls: 2 });
  eq(ZP.nextTurn(['a', 'b', 'c'], { b: {} }, 0), 2);
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
  eq(E.grantableCoins(100, E.COINS.PLAY_PER_DAY - 50), 50);
  eq(E.grantableCoins(100, E.COINS.PLAY_PER_DAY), 0);
  ok(E.isCapped('game') && E.isCapped('bonus:x') && E.isCapped('level') && !E.isCapped('quest') && !E.isCapped('quest_bonus'));
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
  ok(max.capped.every(d => d <= E.COINS.PLAY_PER_DAY), 'presežena dnevna meja igranja');
  // naloge niso pod mejo: maksimalen igralec dobi vse nagrade nalog
  ok(max.byReason.quest === 30 * (E.COINS.QUEST.e + E.COINS.QUEST.m + E.COINS.QUEST.h) + 5 * (E.COINS.QUEST.w1 + E.COINS.QUEST.w2), 'izgubljene nagrade nalog');
  ok(SIM.dayToAfford(max.total, cheapLeg) >= 14, 'legendarno prej kot v 14 dneh');
  // nihče ne more v enem dnevu »pokupiti vsega«
  const all = K.CATALOG.reduce((a, i) => a + i.price, 0);
  ok(max.total.at(-1) * 2 < all, 'v 60 dneh pri maksimumu se ne da kupiti vsega');
  return `tipičen ${avg.toFixed(0)} 🪙/dan, legendarno ${dLeg}. dan; maksimalen ${(max.total.at(-1) / 30).toFixed(0)}/dan, legendarno ${SIM.dayToAfford(max.total, cheapLeg)}. dan`;
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
  eq(r1.capped, false);
  let last = null;
  for (let i = 0; i < 40; i++) last = await a.reportGame({ game: 'reakcija', won: true, players: 2 });
  const p = await a.getProfile();
  eq(p.coins, E.COINS.PLAY_PER_DAY);                  // 5 + 20×4 + 10×8 = 165 > meja
  eq(a._earnedToday(), p.coins);
  eq(last.capped, true);
  eq((await a.awardCoins(100)).granted, 0);
  // števec iger ustavi nagrado brez meje → ni "capped"
  clearLocal();
  const [b] = await users('c1b');
  for (let i = 0; i < E.COINS.GAMES_PER_DAY; i++) await b.reportGame({ game: 'reakcija' });
  const rb = await b.reportGame({ game: 'reakcija' });
  eq([rb.game, rb.capped], [0, false]);
  const coinsB = (await b.getProfile()).coins;
  eq((await b.awardCoins(500)).granted, Math.min(E.COINS.PER_CALL, E.COINS.PLAY_PER_DAY - coinsB));
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
  // naloge niso pod dnevno mejo: tudi po doseženi meji igranja dobiš celo nagrado
  for (let i = 0; i < 40; i++) await a.reportGame({ game: 'reakcija', won: true, players: 2 });
  eq(a._earnedToday(), E.COINS.PLAY_PER_DAY);
  const before = (await a.getProfile()).coins;
  const cw = await a.claimQuest(w, 'w2.w-play-25');
  eq([cw.granted, cw.reward], [E.COINS.QUEST.w2, E.COINS.QUEST.w2]);
  eq((await a.getProfile()).coins, before + E.COINS.QUEST.w2);
  eq(a._earnedToday(), E.COINS.PLAY_PER_DAY);         // naloge se ne štejejo v mejo
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
test('lokalno: shranjen napredek igre (loadSave / writeSave, ločeno po igralcu in slotu)', async () => {
  clearLocal();
  const [a, b] = await users('sa', 'sb');
  eq(await a.loadSave({ game: 'gneca' }), null);
  await a.writeSave({ game: 'gneca', data: { gears: 5 }, rev: 3 });
  const r = await a.loadSave({ game: 'gneca' });
  eq([r.data, r.rev], [{ gears: 5 }, 3]);
  eq(await b.loadSave({ game: 'gneca' }), null, 'drug igralec ne vidi');
  eq(await a.loadSave({ game: 'gneca', slot: 'drug' }), null, 'drug slot');
  await throwsCode(() => a.writeSave({ game: 'gneca', data: { x: 'y'.repeat(70000) } }), 'invalid');
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

test('lokalno: objavljene proge (objava, posodobitev, seznam, igranja, brisanje, omejitve)', async ctx => {
  clearLocal(); S.remove('db:levels'); S.remove('db:levelPlays');
  const [a, b] = await users('la', 'lb');
  const L = ctx.kroglaLevels[0];
  const p1 = await a.publishLevel({ game: 'krogla', name: 'Moja', hash: 'abcdef01', data: L, devMs: 15000 });
  eq(p1.updated, false);
  eq((await a.publishLevel({ game: 'krogla', name: 'Moja 2', hash: 'abcdef01', data: L, devMs: 14000 })), { id: p1.id, updated: true });
  await sleep(5);
  const p2 = await b.publishLevel({ game: 'krogla', name: 'Tuja', hash: 'abcdef02', data: L, devMs: 9000 });
  eq((await a.listLevels({ game: 'krogla' })).map(l => l.name), ['Tuja', 'Moja 2']);
  eq((await a.listLevels({ game: 'krogla', userId: a.userId })).map(l => l.id), [p1.id]);
  ok((await a.listLevels({ game: 'krogla' }))[0].nickname.startsWith('T_lb'));
  eq((await a.listLevels({ game: 'krogla' }))[0].data, undefined, 'seznam brez podatkov');
  eq((await b.getLevel({ game: 'krogla', id: p1.id })).data, L);
  eq(await b.levelPlayed({ game: 'krogla', id: p1.id }), true);
  eq(await b.levelPlayed({ game: 'krogla', id: p1.id }), false, 'isti igralec šteje enkrat');
  await a.levelPlayed({ game: 'krogla', id: p1.id });
  eq((await a.listLevels({ game: 'krogla', sort: 'popular' })).map(l => [l.name, l.plays]), [['Moja 2', 2], ['Tuja', 0]]);
  eq(await a.deleteLevel({ game: 'krogla', id: p2.id }), false, 'tuje proge ni mogoče izbrisati');
  // zamenjava starejše objave
  const p3 = await a.publishLevel({ game: 'krogla', name: 'Nova različica', hash: 'abcdef03', data: L, devMs: 15000, replace: p1.id });
  eq(await a.getLevel({ game: 'krogla', id: p1.id }), null);
  ok(await a.deleteLevel({ game: 'krogla', id: p3.id }));
  await throwsCode(() => a.publishLevel({ game: 'krogla', name: 'x', hash: 'abcdef04', data: L, devMs: 100 }), 'invalid_level');
  await throwsCode(() => a.publishLevel({ game: 'krogla', name: 'Brez mreže', hash: 'abcdef04', data: { size: [1, 1] }, devMs: 100 }), 'invalid_level');
  await throwsCode(() => a.publishLevel({ game: 'krogla', name: 'Velika', hash: 'abcdef04', data: { ...L, desc: 'x'.repeat(70000) }, devMs: 100 }), 'level_too_big');
  for (let i = 0; i < 20; i++) await a.publishLevel({ game: 'krogla', name: 'Proga ' + i, hash: i.toString(16).padStart(8, '0'), data: L, devMs: 1000 });
  await throwsCode(() => a.publishLevel({ game: 'krogla', name: 'Enaindvajseta', hash: 'ffffffff', data: L, devMs: 1000 }), 'too_many_levels');
  S.remove('db:levels'); S.remove('db:levelPlays');
});

/* ------------------------------------------------------- Hrčkova krogla: urejevalnik prog */

test('krogla urejevalnik: nova proga je veljavna razen zvezdic; normalizacija ne spremeni uradnih prog', ctx => {
  const L = KE.newLevel({ name: 'Moja proga', num: 20 });
  eq(L.id, '20-moja-proga');
  eq(KL2.validateLevel(L).map(e => /zvezdic/.test(e)), [true]);
  for (const O of ctx.kroglaLevels) {
    const c = JSON.parse(JSON.stringify(O));
    KE.normalize(c);
    eq(KL2.formatLevelJson(c), KL2.formatLevelJson(O), O.id);
  }
  const bad = { map: ['..', '.....', '.'], hmap: ['1'] };
  KE.normalize(bad);
  eq(bad.size, [5, 3]); eq(bad.map, ['..   ', '.....', '.    ']); eq(bad.hmap, ['10000', '00000', '00000']);
  eq(KE.slugify('Čžš Proga! 2'), 'czs-proga-2');
});
test('krogla urejevalnik: resize premakne objekte, start, cilj, poti in route', ctx => {
  const O = ctx.kroglaLevels.find(L => L.id.startsWith('04'));   // premične plošče in route na plošči
  const L = JSON.parse(JSON.stringify(O));
  ok(KE.resizeLevel(L, { left: 2, top: 3, right: 1, bottom: -1 }));
  eq(L.size, [O.size[0] + 3, O.size[1] + 2]);
  eq(L.map.length, L.size[1]); ok(L.map.every(r => r.length === L.size[0]) && L.hmap.every(r => r.length === L.size[0]));
  eq(L.start, [O.start[0] + 2, O.start[1] + 3]); eq(L.goal, [O.goal[0] + 2, O.goal[1] + 3]);
  eq(L.map[3].slice(2, 2 + O.size[0]), O.map[0]);
  eq(L.movers[0].path[0], [O.movers[0].path[0][0] + 2, O.movers[0].path[0][1], O.movers[0].path[0][2] + 3]);
  O.route.forEach((w, i) => eq([L.route[i].x, L.route[i].z], w.mover != null ? [w.x, w.z] : [w.x + 2, w.z + 3], 'route ' + i));
  eq(KL2.validateLevel(L), []);
  // fizika: ista vožnja autopilota po premiku
  const a = KA.runAutopilot(O), b = KA.runAutopilot(L);
  ok(b.finished && Math.abs(a.time - b.time) < 0.05, `čas ${a.time} → ${b.time}`);
  // odstranjevanje: nazaj na prvotno
  ok(KE.resizeLevel(L, { left: -2, top: -3, right: -1, bottom: 1 }));
  eq(L.map.slice(0, -1), O.map.slice(0, -1)); eq(L.start, O.start); eq(L.movers, O.movers);
  // sovražnik s potjo
  const E = KE.newLevel(); const r = KE.addObj(E, 'saw', 7.5, 10.5);
  KE.resizeLevel(E, { left: 1, top: 1 });
  eq(E.enemies[r.i].path[0], [8.5, 11.5]);
});
test('krogla urejevalnik: ploščice, zapolni, klančina, opozorila višin', () => {
  const L = KE.newLevel({ W: 10, D: 10 });
  ok(KE.setTile(L, 0, 0, '#')); ok(!KE.setTile(L, 0, 0, '#')); ok(!KE.setTile(L, 0, 0, 'Q'));
  const n = KE.floodFill(L, 0, 5, 'i');   // praznina levo od poti
  ok(n > 20, 'flood ' + n); eq(L.map[5][0], 'i'); eq(L.map[5][5], '.'); eq(L.map[0][0], '#');
  // klančina gor proti severu iz višine 0 na 1,5 (3 klančine)
  const R = KE.newLevel({ W: 5, D: 12 });
  for (let r = 0; r < 12; r++) KE.setTile(R, 2, r, '.');
  KE.setHeight(R, 2, 1, 1.5);
  const res = KE.smoothRamp(R, [2, 8], [2, 1]);
  ok(res.ok && !res.msg, JSON.stringify(res));
  eq([7, 6, 5, 4, 3, 2].map(r => R.map[r][2]), ['^', '^', '^', '.', '.', '.']);
  eq([7, 6, 5, 4].map(r => KE.heightAt(R, 2, r)), [0, 0.5, 1, 1.5]);
  const col = (A, lo, hi) => KE.heightWarnings(A).filter(w => w.c === 2 && w.c2 === 2 && w.r >= lo && w.r2 <= hi);
  eq(col(R, 1, 11), []);
  // navzdol (B nižje): klančine tik pred B
  const R2 = KE.newLevel({ W: 5, D: 12 });
  for (let r = 0; r < 12; r++) { KE.setTile(R2, 2, r, '.'); KE.setHeight(R2, 2, r, 2); }
  KE.setHeight(R2, 2, 10, 1);
  KE.smoothRamp(R2, [2, 3], [2, 10]);
  eq([8, 9].map(r => R2.map[r][2] + KE.heightAt(R2, 2, r)), ['^1.5', '^1']);
  eq(col(R2, 0, 10), []);
  KE.setHeight(R2, 2, 0, 0);
  eq(col(R2, 0, 10).map(w => [w.r, w.r2, w.diff]), [[0, 1, 2]]);
  const short = KE.smoothRamp(R2, [2, 0], [2, 2]);
  ok(short.ok && /potrebuje 4 klančin/.test(short.msg), short.msg);
});
test('krogla urejevalnik: objekti (dodaj, premakni, podvoji, izbriši, poti)', () => {
  const L = KE.newLevel();
  const s = KE.addObj(L, 'star', 7.5, 10.5);
  eq(L.pickups[s.i], { t: 'star', x: 7.5, z: 10.5 });
  const m = KE.addObj(L, 'mover', 7.5, 5.5);
  eq(L.movers[m.i].path, [[7.5, 0, 5.5], [11.5, 0, 5.5]]);
  KE.moveObj(L, m, 6.5, 4.5);
  eq(L.movers[m.i].path, [[6.5, 0, 4.5], [10.5, 0, 4.5]]);
  eq(KE.kindOf(L, m), 'mover');
  const h = KE.addObj(L, 'hammer', 7.5, 8.5);
  eq([L.hammers[h.i].x, L.hammers[h.i].z], [6, 8]);
  eq(KE.pickObj(L, 7.6, 8.4), h);
  const d = KE.duplicateObj(L, s);
  eq([L.pickups[d.i].x, L.pickups[d.i].z], [8.5, 10.5]);
  const w = KE.addObj(L, 'wasp', 3, 3);
  eq(KE.kindOf(L, w), 'wasp'); eq(L.enemies[w.i].t, 'wasp');
  eq(KE.addPathPt(L, w, 9, 9, 0), 1); eq(L.enemies[w.i].path[1], [9, 9]);
  ok(KE.removePathPt(L, w, 1)); eq(L.enemies[w.i].path.length, 4);
  // route na premični plošči: indeks se popravi ob brisanju plošče
  const m2 = KE.addObj(L, 'mover', 3.5, 3.5);
  L.route.push({ mover: m2.i, x: 0, z: 0 });
  ok(KE.removeObj(L, m)); eq(L.route[L.route.length - 1].mover, m2.i - 1);
  ok(!KE.removeObj(L, { arr: 'start' }));
  eq(KE.locateError(L, 'proga: kontrolna točka 1 [9, 9] ni na tleh'), [9, 9]);
  eq(KE.locateError(L, 'neznan znak ploščice »Q« v vrstici 3, stolpec 4'), [4.5, 3.5]);
});
test('krogla urejevalnik: razveljavi/uveljavi čez 12 operacij (poteza čopiča = ena)', () => {
  let L = KE.newLevel();
  const H = new KE.History();
  const snaps = [JSON.stringify(L)];
  for (let k = 0; k < 12; k++) {
    H.begin(L);
    for (const [c, r] of KE.brushCells(k, 3, 3)) KE.setTile(L, c, r, 'i');   // ena poteza, več celic
    KE.setTile(L, k, 12, 'g');
    ok(H.end(L), 'operacija ' + k);
    snaps.push(JSON.stringify(L));
  }
  H.begin(L); ok(!H.end(L), 'prazna operacija se ne zapiše');
  for (let k = 11; k >= 0; k--) { L = H.undo(L); eq(JSON.stringify(L), snaps[k]); }
  eq(H.undo(L), null);
  for (let k = 1; k <= 12; k++) { L = H.redo(L); eq(JSON.stringify(L), snaps[k]); }
  L = H.undo(L); H.apply(L, x => KE.setTile(x, 0, 0, '#'));
  ok(!H.canRedo, 'nova operacija pobriše uveljavi');
});
test('krogla urejevalnik: medalje in časovni bonus = formula generatorja', ctx => {
  eq(KR.medalsFromTime(20), { gold: 20, silver: 26, bronze: 33 });
  eq(KR.timeBonusFromTime(20), 31);
  for (const L of ctx.kroglaLevels) {
    const s = KR.scoringFromRun({ time: L.dev.time, falls: 0 });
    // uradne medalje so iz natančnega časa (dev je zaokrožen), zato le približno
    ok(Math.abs(s.medals.gold - L.medals.gold) <= 1 && Math.abs(s.timeBonus - L.timeBonus) <= 1, L.id);
  }
  const res = KA.runAutopilot(ctx.kroglaLevels[0]);
  const s = KR.scoringFromRun(res);
  eq(s.medals, ctx.kroglaLevels[0].medals); eq(s.timeBonus, ctx.kroglaLevels[0].timeBonus); eq(s.dev, ctx.kroglaLevels[0].dev);
});
test('krogla urejevalnik: deljenje s povezavo (stisnjeno, pokvarjeno, preveliko)', async ctx => {
  const L = ctx.kroglaLevels.find(x => x.id.startsWith('06'));
  const data = await KS.encodeLevel(L);
  ok(/^[zj][A-Za-z0-9_-]+$/.test(data), 'base64url');
  const back = await KS.decodeLevel(data);
  eq(back, L);
  if (typeof CompressionStream === 'function') ok(data[0] === 'z' && data.length < JSON.stringify(L).length / 3, 'stiskanje ' + data.length);
  for (const bad of ['', 'x', 'zAAAA', 'j' + btoa('{"a":1}'), 'j!!!', data.slice(0, 40)]) {
    let msg = null;
    try { await KS.decodeLevel(bad); } catch (e) { msg = e.message; }
    ok(msg && !/undefined/.test(msg), 'brez napake za »' + bad.slice(0, 12) + '«');
  }
  const evil = { ...L, name: '<img src=x onerror=alert(1)>', extra: 'x', map: [...L.map] };
  const ev = await KS.decodeLevel(await KS.encodeLevel(evil));
  eq(ev.extra, undefined); eq(ev.name, evil.name);   // ime ostane besedilo (izpis vedno kot textContent)
});
test('krogla urejevalnik: osnutki (omejitev, pripravljene ostanejo)', () => {
  S.remove(KD.DRAFTS_KEY);
  const keep = { key: 'pripravljena', L: KE.newLevel({ name: 'Moja' }), ready: true, verified: null };
  KD.saveDraft(keep);
  for (let i = 0; i < KD.MAX_DRAFTS + 3; i++) KD.saveDraft({ key: 'k' + i, L: KE.newLevel({ name: 'P' + i }), ready: false });
  const list = KD.listDrafts();
  eq(list.length, KD.MAX_DRAFTS);
  ok(list.some(d => d.key === 'pripravljena'), 'pripravljena proga ostane');
  eq(KD.readyDrafts().map(d => d.key), ['pripravljena']);
  const d = KD.getDraft('pripravljena');
  ok(!KD.isVerified(d));
  d.verified = { hash: KE.levelHash(d.L), time: 10, by: 'autopilot' };
  ok(KD.isVerified(d));
  d.L.name = 'Drugo ime'; ok(KD.isVerified(d), 'ime ne vpliva na rešljivost');
  d.L.route = [{ x: 1, z: 1 }]; ok(KD.isVerified(d), 'pot autopilota ne vpliva na rešljivost');
  const re = {}; for (const k of Object.keys(d.L).reverse()) re[k] = d.L[k];
  eq(KE.levelHash(re), KE.levelHash(d.L), 'hash ni odvisen od vrstnega reda polj');
  KE.setTile(d.L, 0, 0, '.'); ok(!KD.isVerified(d), 'sprememba mreže razveljavi preverjanje');
  KD.removeDraft('pripravljena'); eq(KD.getDraft('pripravljena'), null);
  S.remove(KD.DRAFTS_KEY);
});

/* ------------------------------------------------------- Hrčkova krogla: naključne proge */

test('krogla generator: 20 semen × 5 težavnosti — veljavne, 5 zvezdic, autopilot pod časom proge', () => {
  const out = [];
  for (let d = 1; d <= 5; d++) {
    let t = 0;
    for (let i = 0; i < 20; i++) {
      const res = KN.generateLevel({ diff: d, seed: 'test' + i });
      const L = res.L, id = `težavnost ${d}, seme test${i}`;
      ok(res.ok, `${id}: ni preverjena (${res.report.warnings.join('; ')})`);
      eq(KL2.validateLevel(L), [], id);
      eq(L.pickups.filter(p => p.t === 'star').length, 5, id + ': zvezdice');
      ok(L.size[0] <= KE.MAX_W && L.size[1] <= KE.MAX_D, id + ': prevelika mreža ' + L.size);
      const run = KA.runAutopilot(L);
      ok(run.finished && run.time < KR.levelTime(L, 'normalna'), `${id}: autopilot ${run.time} s, čas proge ${L.timeBonus} s`);
      eq(L.medals, KR.medalsFromTime(run.time), id + ': medalje po formuli generatorja');
      eq(KS.sanitizeLevel(JSON.parse(JSON.stringify(L))).map, L.map, id + ': prestane sanitizeLevel (deljenje, objava)');
      t += run.time;
    }
    out.push(`${KN.DIFF_NAMES[d - 1]} ${Math.round(t / 20)} s`);
  }
  return out.join(', ');
});

test('krogla generator: isto seme in nastavitve → ista proga; drugo seme → druga', () => {
  const o = { diff: 3, length: 'short', seed: 'ABCD' };
  const a = KN.generateLevel(o), b = KN.generateLevel({ ...o });
  eq(KL2.formatLevelJson(a.L), KL2.formatLevelJson(b.L));
  eq(a.tries, b.tries);
  ok(KL2.formatLevelJson(KN.generateLevel({ ...o, seed: 'ABCE' }).L) !== KL2.formatLevelJson(a.L), 'drugo seme');
  ok(KL2.formatLevelJson(KN.generateLevel({ ...o, diff: 4 }).L) !== KL2.formatLevelJson(a.L), 'druge nastavitve');
  ok(/seme ABCD/.test(a.L.desc) && a.L.name === 'Naključna ABCD', a.L.name + ' · ' + a.L.desc);
  ok(/^50-nakljucna-abcd$/.test(a.L.id), a.L.id);
});

test('krogla generator: število sovražnikov in ovir ustreza drsnikom (0 = izklop)', () => {
  const none = o => Object.fromEntries(Object.keys(o).map(k => [k, 0]));
  const base = KN.presetOpts(4, 'medium');
  const zero = KN.generateLevel({ ...base, diff: null, seed: 'nic', enemies: none(KN.ENEMIES) });
  eq((zero.L.enemies || []).length, 0, 'brez sovražnikov');
  ok(zero.ok);
  const zero2 = KN.generateLevel({ ...base, diff: null, seed: 'nic2', enemies: none(KN.ENEMIES), obstacles: none(KN.OBSTACLES), jumps: 0 });
  for (const k of ['movers', 'spinners', 'hammers', 'bumpers', 'fans', 'bowls', 'switches', 'doors', 'springs', 'enemies']) eq((zero2.L[k] || []).length, 0, 'brez ' + k);
  const want = { bully: 1, saw: 3, wasp: 2, vacuum: 1, magnet: 2 }, obs = { mover: 1, spinner: 1, hammer: 4, bumper: 3, fan: 2, bowl: 1, door: 1 };
  const out = [];
  for (const seed of ['s1', 's2', 's3', 's4']) {
    const res = KN.generateLevel({ ...base, diff: null, seed, segments: 10, enemies: want, obstacles: obs, jumps: 2 });
    ok(res.ok, seed);
    const L = res.L, r = res.report;
    const en = t => (L.enemies || []).filter(e => e.t === t).length;
    const cnt = { bully: en('bully'), saw: en('saw'), wasp: en('wasp'), vacuum: en('vacuum'), magnet: en('magnet'),
      mover: (L.movers || []).length, spinner: (L.spinners || []).length, hammer: (L.hammers || []).length, bumper: (L.bumpers || []).length,
      fan: (L.fans || []).length, bowl: (L.bowls || []).length, door: (L.doors || []).length };
    for (const [k, v] of Object.entries(cnt)) {
      eq(v, r.placed[k], `${seed}: report.placed.${k}`);
      // če kaj ni bilo mogoče postaviti, je to zapisano v opozorilih
      if (v !== { ...want, ...obs }[k]) ok(r.warnings.some(w => /ni bilo mogoče postaviti/.test(w)), `${seed}: ${k} ${v}/${{ ...want, ...obs }[k]} brez opozorila`);
      else out.push(k);
    }
    eq((L.switches || []).length, cnt.door, 'stikalo za vsaka vrata');
    eq(r.placed.jump, 2, seed + ': skoki');
  }
  return `ujemanj ${out.length}/48`;
});

test('krogla generator: nastavitve (prednastavitve, omejitve, po meri)', () => {
  for (let d = 1; d <= 5; d++) for (const l of KN.LENGTH_IDS) {
    const p = KN.presetOpts(d, l);
    ok(KN.isPreset(p), `prednastavitev ${d}/${l}`);
    ok(p.segments >= KN.SEG_MIN && p.segments <= KN.SEG_MAX, 'odseki ' + p.segments);
  }
  ok(KN.presetOpts(5, 'medium').enemies.saw > KN.presetOpts(1, 'medium').enemies.saw, 'težje = več sovražnikov');
  const n = KN.normalizeOpts({ diff: 9, segments: 999, wMin: 4, wMax: 2, narrow: 7, enemies: { saw: -3, bully: 99 }, checkpoints: 'xx', theme: 'nič', neznano: 1 });
  eq([n.diff, n.segments, n.wMin, n.wMax, n.narrow, n.enemies.saw, n.enemies.bully, n.theme], [5, KN.SEG_MAX, 4, 4, 1, 0, KN.ENEMIES.bully.max, 'random']);
  eq(n.checkpoints, KN.presetOpts(5).checkpoints);
  ok(!('neznano' in n));
  const c = { ...KN.presetOpts(2), enemies: { ...KN.presetOpts(2).enemies, saw: 4 } };
  ok(!KN.isPreset(c), 'ročna sprememba = po meri');
  ok(/^[A-HJ-NP-Z2-9]{4}$/.test(KN.randomSeed()), 'seme');
  const none = KN.generateLevel({ diff: 2, seed: 'cp' });
  // brez kontrolnih točk (napredna nastavitev) — nastavitev po meri
  const cus = KN.generateLevel({ ...KN.presetOpts(2), diff: null, seed: 'cp', checkpoints: 'none', clocks: 0 });
  eq(cus.L.checkpoints.length, 0); eq(cus.L.pickups.filter(p => p.t === 'clock').length, 0);
  ok(none.L.checkpoints.length > 0, 'prednastavitev Srednja ima kontrolne točke');
});

test('krogla generator: osnutek je takoj preverjeno rešljiv (hash) in nadaljnja sprememba to razveljavi', () => {
  const res = KN.generateLevel({ diff: 2, length: 'short', seed: 'OSNUTEK' });
  const d = { key: 'x', L: KE.normalize(JSON.parse(JSON.stringify(res.L))), ready: true, verified: { hash: KE.levelHash(res.L), time: res.report.time, by: 'autopilot' } };
  ok(KD.isVerified(d), 'po generaciji preverjeno');
  const r = d.L.map.findIndex(row => row.includes('.'));
  KE.setTile(d.L, d.L.map[r].indexOf('.'), r, ' ');
  ok(!KD.isVerified(d), 'sprememba mreže razveljavi preverjanje');
});

/* ------------------------------------------------------- Rušilec (tests/rusilec.js) */
rusilecTests(test, { eq, ok });

/* ------------------------------------------------------- Herodle (tests/herodle.js) */
herodleTests(test, { eq, ok });
/* ------------------------------------------------------- Herodle 2. faza (tests/herodle2.js) */
herodle2Tests(test, { eq, ok });
/* ------------------------------------------------------- Dirka frnikol (tests/frnikole.js) */
frnikoleTests(test, { eq, ok });
/* ------------------------------------------------------- Smučarski skoki (tests/skoki.js) */
skokiTests(test, { eq, ok });
/* ------------------------------------------------------- Ustavi uro (tests/ustavi-uro.js) */
ustaviUroTests(test, { eq, ok });
/* ------------------------------------------------------- športni okvir in Smučarski skoki, 3. faza (tests/sport3.js, tests/skoki4.js) */
sport3Tests(test, { eq, ok });
krogla2Tests(test, { eq, ok });
skoki4Tests(test, { eq, ok });
/* ------------------------------------------------------- Gneča (tests/gneca.js) */
gnecaTests(test, { eq, ok });
/* ------------------------------------------------------- napredek online (tests/progress.js) */
progressTests(test, { eq, ok });

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
