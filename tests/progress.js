/* =====================================================================
   Testi: napredek online (shared/progress.js + games/<igra>/cloud.js) — prompts/45-napredek-online.md.
   Registrira jih tests/tests.js. Fixture stare kariere Skokov: ctx.skokiCareerOld (tests/fixtures/skoki-career-old.json).
   ===================================================================== */
import * as S from '../shared/storage.js';
import * as P from '../shared/progress.js';
import { LocalBackend } from '../shared/adapters/local.js';
import * as SK from '../games/skoki/cloud.js';
import * as KR from '../games/krogla/cloud.js';
import * as LD from '../games/ladjice/cloud.js';
import * as FR from '../games/frnikole/cloud.js';
import * as UU from '../games/ustavi-uro/cloud.js';
import * as ZP from '../games/zaporedje/cloud.js';
import * as RU from '../games/rusilec/cloud.js';

/** Najmanjši »hub« za cloudSync nad lokalnim adapterjem (dve napravi = ista baza db:saves, ločen localStorage se simulira z brisanjem). */
async function fakeHub(gameId, uid) {
  const backend = new LocalBackend({ userId: uid });
  await backend.init();
  return {
    gameId, userId: uid, backend,
    loadSave: ({ slot = 'main' } = {}) => backend.loadSave({ game: gameId, slot }).catch(() => null),
    writeSave: (data, { slot = 'main', rev = 0 } = {}) => backend.writeSave({ game: gameId, slot, data, rev }).then(() => true, () => false),
  };
}
const clearUser = uid => { for (const k of S.keys('')) if (k.includes(uid) || k === 'db:saves' || k.startsWith('progress:')) S.remove(k); };
const roundTrip = (rules, uid, bag) => P.mergeBags(rules, JSON.parse(JSON.stringify(bag)), {});

export function progressTests(test, { eq, ok }) {
  /* ------------------------------------------------------- jedro */
  test('napredek online: mergeBags — pravila, validacija tujega vnosa, cap', () => {
    const rules = [
      { name: 'best', key: u => `t:best:${u}`, check: v => (Number.isFinite(v) ? v : undefined), merge: P.merge.max },
      { name: 'd:', prefix: u => `t:d:${u}:`, re: /^\d{4}-\d{2}-\d{2}$/, check: v => (v === true ? true : undefined), merge: P.merge.or, cap: 3 },
    ];
    const m = P.mergeBags(rules, { best: 5, 'd:2026-01-01': true, 'd:2026-01-02': true }, { best: 9, 'd:2026-01-03': true, 'd:2026-01-04': true, 'd:xx': true, tuje: 1, 'd:2026-01-05': 'da' });
    eq(m, { best: 9, 'd:2026-01-02': true, 'd:2026-01-03': true, 'd:2026-01-04': true });
    eq(P.mergeBags(rules, { best: 'x' }, { best: 3 }), { best: 3 }, 'neveljavno lokalno se zavrže');
  });
  test('napredek online: tristransko združevanje (urejanje in brisanje z druge naprave)', () => {
    const rules = [{ name: 'list', key: () => 'x', check: v => (Array.isArray(v) ? v : undefined), merge: P.merge.local }, { name: 'n', key: () => 'n', merge: P.merge.max }];
    const base = P.baseOf({ list: [1, 2], n: 3 });
    eq(P.mergeBags(rules, { list: [1, 2], n: 3 }, { list: [1, 2, 9], n: 3 }, base).list, [1, 2, 9], 'lokalno nespremenjeno → strežnik (urejanje)');
    eq(P.mergeBags(rules, { list: [7], n: 3 }, { list: [1, 2], n: 3 }, base).list, [7], 'strežnik nespremenjen → lokalno');
    eq('list' in P.mergeBags(rules, { list: [1, 2], n: 3 }, { n: 3 }, base), false, 'brisanje na drugi napravi se prenese');
    eq(P.mergeBags(rules, { list: [1, 2], n: 5 }, { list: [1, 2], n: 8 }, base).n, 8, 'obe spremenjeni → merge');
    eq(P.mergeBags(rules, { list: [1, 2] }, { list: 'pokvarjeno' }, base).list, [1, 2], 'neveljaven tuj vnos ne pomeni brisanja');
  });
  test('napredek online: merge.newer — večji rev zmaga, ob enakem več napredka', () => {
    const f = P.merge.newer(v => v.p);
    eq(f({ rev: 3, p: 1 }, { rev: 2, p: 9 }).rev, 3);
    eq(f({ rev: 2, p: 1 }, { rev: 2, p: 9 }).p, 9);
    eq(f({ p: 4 }, { p: 2 }).p, 4, 'brez rev (stari zapis): več napredka');
  });
  test('napredek online: fitBag odreže pod 60.000 znakov', () => {
    const bag = {}; for (let i = 0; i < 40; i++) bag['k' + String(i).padStart(2, '0')] = 'x'.repeat(2000);
    const fit = P.fitBag(bag);
    ok(JSON.stringify({ v: 1, k: fit }).length <= P.MAX_SAVE, 'prevelik');
    ok('k39' in fit && !('k00' in fit), 'najprej odreže najstarejša imena');
  });

  /* ------------------------------------------------------- serializacija → sanitize → enako (vse igre) */
  test('napredek online: vsaka igra — zapis po JSON in validaciji ostane enak', ctx => {
    const career = { ...ctx.skokiCareerOld, rev: 4 };
    const cases = [
      ['skoki/kariera', SK.SLOTS.kariera.rules, { career }],
      ['skoki/skakalci', SK.SLOTS.skakalci.rules, { jstats: { j1: { jumps: 4, falls: 1, comps: 2, wins: 1, podiums: 2, best: { brezova: 101.5 } } } }],
      ['skoki/rekordi', SK.SLOTS.rekordi.rules, { 'best:brezova': { total: 130.5, dist: 99.5, pv: 3, at: 5, data: 'QUJD' } }],
      ['skoki/napredek', SK.SLOTS.napredek.rules, {
        stats: { jumps: 10, falls: 2, hints: 3, overK: { brezova: true }, overHS: {}, visited: { bistra: true } }, reacts: 4,
        daily: { day: '2026-11-28', used: 2, best: { total: 120, dist: 95, fall: false }, reported: false, done: ['2026-11-27'] },
        'used:2026:3:1': true, 'aw:s2026-e3': true,
      }],
      ['krogla', KR.RULES, { best: { '01-start': 23456, '01-start:m': 25000 }, reached: ['01-start'], mirror: true, weeks: ['2026-W48'], 'save:maraton': { diff: 'normalna', idx: 3, run: { diff: 'normalna', clock: 4 }, xpLevels: 2, t: 99 }, 'daily:2026-11-28': true, locks: ['luna'], 'custom-best': { abc123: 40000 } }],
      ['ladjice', LD.RULES, { 'daily:2026-11-28': true, contracts: 7, capwins: ['sonar', 'torpedo'] }],
      ['frnikole', FR.RULES, { 'daily:2026-11-28': { started: true, score: 812 } }],
      ['ustavi-uro', UU.RULES, { 'best:easy': 123, 'best:hard': 900, days: ['2026-11-27', '2026-11-28'], inner: [{ t: 10000, s: 10120 }] }],
      ['zaporedje', ZP.RULES, { best: 14, days: ['2026-11-28'] }],
      ['rusilec', RU.RULES, { played: ['arena-1', 'luna'] }],
    ];
    for (const [name, rules, bag] of cases) eq(roundTrip(rules, 'u', bag), bag, name);
    return `${cases.length} zapisov`;
  });

  /* ------------------------------------------------------- star lokalni + nov oddaljen → novejši */
  test('napredek online: konflikti po igrah (star lokalni + nov oddaljen)', ctx => {
    const old = ctx.skokiCareerOld;
    const newer = { ...structuredClone(old), rev: 6, stats: { ...old.stats, events: old.stats.events + 3 } };
    eq(P.mergeBags(SK.SLOTS.kariera.rules, { career: { ...old, rev: 2 } }, { career: newer }).career.rev, 6, 'kariera: večji rev');
    eq(P.mergeBags(SK.SLOTS.kariera.rules, { career: old }, { career: { ...newer, rev: 0 } }).career.stats.events, old.stats.events + 3, 'kariera: enak rev → več tekem');
    const d = P.mergeBags(SK.SLOTS.napredek.rules,
      { daily: { day: '2026-11-28', used: 1, best: { total: 100, dist: 90 }, reported: false, done: [] } },
      { daily: { day: '2026-11-28', used: 3, best: { total: 90, dist: 88 }, reported: true, done: ['2026-11-28'] } }).daily;
    eq([d.used, d.best.total, d.reported, d.done], [3, 100, true, ['2026-11-28']], 'skoki dnevni: porabljeni poskusi ostanejo porabljeni');
    eq(SK.mergeBest({ total: 120, dist: 99, data: 'A' }, { total: 125, dist: 101 }).dist, 101, 'skoki rekord: daljši');
    eq(SK.mergeBest({ total: 120, dist: 99, data: 'A' }, { total: 120, dist: 99 }).data, 'A', 'skoki rekord: enak → z ghostom');
    eq(P.mergeBags(KR.RULES, { best: { a: 30000, b: 20000 } }, { best: { a: 25000, c: 1 } }).best, { a: 25000, c: 1, b: 20000 }, 'krogla: boljši čas po progi');
    eq(P.mergeBags(KR.RULES, { 'save:m': { diff: 'x', idx: 1, run: {}, t: 5 } }, { 'save:m': { diff: 'x', idx: 4, run: {}, t: 9 } })['save:m'].idx, 4, 'krogla: novejši turnir');
    eq(P.mergeBags(LD.RULES, { contracts: 3 }, { contracts: 8 }).contracts, 8, 'ladjice: pogodbe');
    eq(P.mergeBags(FR.RULES, { 'daily:2026-11-28': { started: true } }, { 'daily:2026-11-28': { started: true, score: 500 } })['daily:2026-11-28'].score, 500, 'frnikole: z rezultatom');
    eq(P.mergeBags(UU.RULES, { 'best:easy': 300 }, { 'best:easy': 120 })['best:easy'], 120, 'ustavi uro: manjša napaka');
    eq(P.mergeBags(ZP.RULES, { best: 9, days: ['2026-11-01'] }, { best: 12, days: ['2026-11-02'] }), { best: 12, days: ['2026-11-01', '2026-11-02'] }, 'zaporedje');
    eq(P.mergeBags(RU.RULES, { played: ['a'] }, { played: ['b'] }).played, ['a', 'b'], 'rušilec');
  });
  test('napredek online: shrinkBest odreže ghoste, rekordi ostanejo', () => {
    const bag = {};
    for (let i = 0; i < 20; i++) bag['best:h' + i] = { total: 100 + i, dist: 90, pv: 1, at: 1, data: 'G'.repeat(4000) };
    const fit = P.fitBag(bag, { shrink: SK.shrinkBest });
    ok(JSON.stringify({ v: 1, k: fit }).length <= P.MAX_SAVE);
    eq(Object.keys(fit).length, 20, 'vsi rekordi ostanejo');
    ok(Object.values(fit).some(b => !b.data) && Object.values(fit).some(b => b.data), 'del ghostov odrezan');
  });

  /* ------------------------------------------------------- cloudSync nad lokalnim adapterjem */
  test('napredek online: selitev stare lokalne kariere Skokov na strežnik (brez izgube)', async ctx => {
    const uid = 'test-sel';
    clearUser(uid);
    S.save(`skoki:career:${uid}`, ctx.skokiCareerOld);               // stanje pred spremembo (brez rev)
    const hub = await fakeHub('skoki', uid);
    const sync = P.cloudSync(hub, { slot: 'kariera', ...SK.SLOTS.kariera });
    await sync.ready; sync.stop();
    const r = await hub.loadSave({ slot: 'kariera' });
    ok(r && r.data.k.career, 'kariera ni na strežniku');
    eq(r.data.k.career.stats, ctx.skokiCareerOld.stats, 'statistika enaka');
    eq(r.data.k.career.results, ctx.skokiCareerOld.results, 'rezultati enaki');
    // »druga naprava«: lokalno nič → kariera pride s strežnika
    S.remove(`skoki:career:${uid}`); S.remove(`progress:skoki:kariera:${uid}`);
    const s2 = P.cloudSync(hub, { slot: 'kariera', ...SK.SLOTS.kariera });
    await s2.ready; s2.stop();
    eq(S.load(`skoki:career:${uid}`, null)?.stats, ctx.skokiCareerOld.stats, 'kariera je nazaj s strežnika');
    clearUser(uid);
  });
  test('napredek online: dnevni poskus z druge naprave ostane porabljen; brisanje se prenese', async () => {
    const uid = 'test-dn';
    clearUser(uid);
    const hub = await fakeHub('ladjice', uid);
    S.save(`ladjice:daily:${uid}:2026-11-28`, true);
    S.save(`ladjice:capwins:${uid}`, ['sonar']);
    let s = P.cloudSync(hub, { slot: 'napredek', rules: LD.RULES }); await s.ready; s.stop();
    // druga naprava: prazen localStorage
    for (const k of S.keys('ladjice:')) S.remove(k);
    S.remove(`progress:ladjice:napredek:${uid}`);
    s = P.cloudSync(hub, { slot: 'napredek', rules: LD.RULES }); await s.ready;
    eq(S.load(`ladjice:daily:${uid}:2026-11-28`, false), true, 'dnevni poskus porabljen tudi na drugi napravi');
    // sprememba se sama pošlje (opazovalec storage.js)
    S.save(`ladjice:contracts:${uid}`, 5);
    await s.sync(); s.stop();
    eq((await hub.loadSave({ slot: 'napredek' })).data.k.contracts, 5, 'sprememba poslana');
    // nespremenjen ključ, ki ga je druga naprava zbrisala, se zbriše tudi tukaj
    const r = await hub.loadSave({ slot: 'napredek' });
    const k2 = { ...r.data.k }; delete k2.capwins;
    await hub.writeSave({ v: 1, k: k2 }, { slot: 'napredek', rev: r.rev + 1 });
    s = P.cloudSync(hub, { slot: 'napredek', rules: LD.RULES }); await s.ready; s.stop();
    eq(S.load(`ladjice:capwins:${uid}`, null), null, 'brisanje prenešeno');
    clearUser(uid);
  });
  test('napredek online: napaka pri branju ne briše in ne piše', async () => {
    const uid = 'test-err';
    clearUser(uid);
    const hub = await fakeHub('zaporedje', uid);
    S.save(`zaporedje:best:${uid}`, 11);
    let s = P.cloudSync(hub, { slot: 'napredek', rules: ZP.RULES }); await s.ready; s.stop();
    let writes = 0;
    const broken = { ...hub, backend: { loadSave: async () => { throw new Error('offline'); } }, writeSave: async () => { writes++; return true; } };
    s = P.cloudSync(broken, { slot: 'napredek', rules: ZP.RULES }); await s.ready; s.stop();
    eq([S.load(`zaporedje:best:${uid}`, null), writes], [11, 0]);
    clearUser(uid);
  });
}
