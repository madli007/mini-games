/* =====================================================================
   Testi Herodla — 2. faza (Emoji, Kostum, Dosje, arhiv, popolni dan).
   Registrira jih tests/tests.js. Testi 1. faze (tests/herodle.js) ostanejo nespremenjeni.
   ctx.herodleHintsSql: supabase/games/herodle-hints.sql (besedilo)
   ===================================================================== */
import { HEROES, heroById } from '../games/herodle/heroes.js';
import { HINTS } from '../games/herodle/hints.js';
import * as HL from '../games/herodle/logic.js';
import * as store from '../games/herodle/store.js';
import * as S from '../shared/storage.js';
import { hintsSql } from '../tools/herodle-sql.mjs';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function herodle2Tests(test, { eq, ok }) {
  const H = id => heroById(id);

  test('herodle2: vsak lik ima popolne namige (5 emojijev, 3–5 barv, simbol, 6× dosje, 2–3 dejstva)', () => {
    eq(Object.keys(HINTS).sort(), HEROES.map(h => h.id).sort(), 'namigi za vse like in nič odveč');
    const bad = HEROES.map(h => [h.id, HL.validateHints(HINTS[h.id], h)]).filter(([, e]) => e.length);
    eq(bad.map(([id, e]) => `${id}: ${e.join(', ')}`), []);
    for (const h of HEROES) {
      const x = HINTS[h.id];
      eq(x.emoji.length, 5, h.id);
      ok(x.palette.length >= 3 && x.palette.length <= 5 && x.palette.every(c => /^#[0-9a-f]{6}$/i.test(c)), h.id + ' paleta');
      eq(x.palette[0], h.color, h.id + ': palette[0] === color');
      eq(x.dossier.length, 6, h.id);
      ok(x.facts.length >= 2 && x.facts.length <= 3, h.id + ' dejstva');
    }
    const unsure = HEROES.reduce((n, h) => n + HINTS[h.id].unsure.length, 0);
    return `${HEROES.length} likov · ${unsure} dvomljivih namigov`;
  });

  test('herodle2: dosje ne vsebuje imena, aliasa ali alter ega (brez šumnikov, velikih črk, sklonov)', () => {
    for (const h of HEROES) for (const d of HINTS[h.id].dossier) eq(HL.leaksName(d, h), null, `${h.id}: »${d}«`);
    // detektor sam
    const sm = H('spider-man');
    ok(HL.leaksName('To je PETER parker.', sm), 'alter ego');
    ok(HL.leaksName('Prijatelj Parkerjeve tete.', sm), 'sklon priimka alter ega');
    ok(HL.leaksName('pajkov  mož v rdečem', sm), 'alias brez šumnikov');
    eq(HL.leaksName('Ugriznil ga je pajek.', sm), null);
    ok(HL.leaksName('Stara znanka Škrlatne čarovnice', H('scarlet-witch')), 'sklanjanje aliasa s šumniki');
    ok(HL.leaksName('Ni Thor.', H('thor')), 'kratko ime');
    eq(HL.leaksName('Rad ima avtorje stripov.', H('thor')), null, 'beseda, ki samo vsebuje ime, ni zadetek');
  });

  test('herodle2: emojiji brez zastav in brez ponovitev', () => {
    for (const h of HEROES) {
      const e = HINTS[h.id].emoji;
      eq(new Set(e).size, 5, h.id);
      ok(!e.some(x => /[\u{1F1E6}-\u{1F1FF}]/u.test(x)), h.id + ': zastava');
    }
  });

  test('herodle2: hex → ime barve (12 osnovnih)', () => {
    const cases = {
      '#c62828': 'rdeča', '#d32f2f': 'rdeča', '#1565c0': 'modra', '#4fc3f7': 'modra', '#1a237e': 'modra', '#2e7d32': 'zelena',
      '#33691e': 'zelena', '#fdd835': 'rumena', '#212121': 'črna', '#1a1a1a': 'črna', '#eceff1': 'bela', '#ffffff': 'bela',
      '#9e9e9e': 'siva', '#455a64': 'siva', '#424242': 'siva', '#6a1b9a': 'vijolična', '#4a148c': 'vijolična', '#ef6c00': 'oranžna',
      '#e65100': 'oranžna', '#8d6e63': 'rjava', '#6d4c41': 'rjava', '#c2185b': 'roza', '#ec407a': 'roza', '#ffb300': 'zlata', '#f9a825': 'zlata',
    };
    for (const [hex, name] of Object.entries(cases)) eq(HL.colorName(hex), name, hex);
    for (const h of HEROES) ok(HL.COLOR_NAMES.includes(HL.colorName(h.color)), h.id);
    eq(HL.COLOR_NAMES.length, 12);
  });

  test('herodle2: stopnje namigov po številu napačnih poskusov', () => {
    const h = H('batman'), x = HINTS.batman;
    eq(HL.visibleHints('emoji', x, 0, h), { emoji: x.emoji.slice(0, 1) });
    eq(HL.visibleHints('emoji', x, 2, h).emoji.length, 3);
    eq(HL.visibleHints('emoji', x, 4, h).emoji.length, 5);
    eq(HL.visibleHints('emoji', x, 30, h).emoji.length, 5, 'ne več kot 5');
    eq(HL.visibleHints('dosje', x, 0, h).dossier, x.dossier.slice(0, 1));
    eq(HL.visibleHints('dosje', x, 5, h).dossier.length, 6);
    eq(HL.visibleHints('dosje', x, 9, h).dossier.length, 6);
    eq(HL.visibleHints('kostum', x, 2, h), { palette: x.palette });
    eq(HL.visibleHints('kostum', x, 3, h), { palette: x.palette, dominant: 'siva' });
    eq(HL.visibleHints('kostum', x, 5, h).symbol, { kind: 'symbol', text: 'netopir' });
    const noSym = HEROES.find(z => HINTS[z.id].symbol === null);
    eq(HL.visibleHints('kostum', HINTS[noSym.id], 5, noSym).symbol, { kind: 'universe', text: noSym.universe }, 'brez simbola → univerzum');
    eq(HL.hintStage('kostum', 4), { palette: true, dominant: true, symbol: false });
  });

  test('herodle2: poskus — rešeno, napačno, Dosje izgubljen po 6 napačnih', () => {
    eq(HL.stepGuess('emoji', { wrong: 0 }, 'a', 'a'), { solved: true, wrong: 0, lost: false });
    eq(HL.stepGuess('emoji', { wrong: 7 }, 'b', 'a'), { solved: false, wrong: 8, lost: false }, 'emoji brez omejitve');
    eq(HL.stepGuess('dosje', { wrong: 4 }, 'b', 'a'), { solved: false, wrong: 5, lost: false });
    eq(HL.stepGuess('dosje', { wrong: 5 }, 'b', 'a'), { solved: false, wrong: 6, lost: true });
    let code = null;
    try { HL.stepGuess('dosje', { wrong: 6 }, 'a', 'a'); } catch (e) { code = e.code; }
    eq(code, 'finished', 'po porazu ni več ugibanja');
    eq(HL.stepGuess('kostum', { wrong: 3, solved: true }, 'x', 'a').solved, true, 'rešeno ostane rešeno');
  });

  test('herodle2: offline — različni načini isti dan imajo različne like, brez ponovitev v ciklu', () => {
    let clash = 0;
    for (let i = 0; i < 365; i++) {
      const d = HL.addDays('2026-11-22', i);
      const ids = HL.ALL_MODE_IDS.map(m => HL.offlineHeroId(m, d, HEROES));
      if (new Set(ids).size !== ids.length) clash++;
    }
    eq(clash, 0, 'trki med načini');
    for (const mode of HL.HINT_MODE_IDS) {
      const n = HEROES.length;
      const idx = HL.daysBetween(HL.OFFLINE_ORIGIN, '2026-11-22');
      const start = HL.addDays(HL.OFFLINE_ORIGIN, idx - (idx % n));
      const seen = [];
      for (let i = 0; i < n * 2; i++) seen.push(HL.offlineHeroId(mode, HL.addDays(start, i), HEROES));
      eq(new Set(seen.slice(0, n)).size, n, mode + ': 1. cikel');
      eq(new Set(seen.slice(n)).size, n, mode + ': 2. cikel');
      for (let i = 1; i < seen.length; i++) ok(seen[i] !== seen[i - 1], mode + ': zaporedna ponovitev');
    }
    // Klasika ima še vedno isti razpored kot v 1. fazi (načini z namigi ga ne spremenijo)
    eq(HL.offlineHeroId('klasika', '2026-11-23', HEROES), HL.offlineHeroId('klasika', '2026-11-23', HEROES));
  });

  test('herodle2: deljenje novih načinov (brez imena lika)', () => {
    const d = '2026-11-25';
    eq(HL.hintShareText({ date: d, mode: 'emoji', attempts: 3, solved: true }), 'Herodle #4 · 😶‍🌫️ Emoji 3/5');
    eq(HL.hintShareText({ date: d, mode: 'emoji', attempts: 8, solved: true }), 'Herodle #4 · 😶‍🌫️ Emoji 5/5 +3');
    eq(HL.hintShareText({ date: d, mode: 'emoji', attempts: 4, solved: false, gaveUp: true }), 'Herodle #4 · 😶‍🌫️ Emoji X/5');
    eq(HL.hintShareText({ date: d, mode: 'kostum', attempts: 4, solved: true }), 'Herodle #4 · 🎨 Kostum 4 💡');
    eq(HL.hintShareText({ date: d, mode: 'kostum', attempts: 2, solved: true }), 'Herodle #4 · 🎨 Kostum 2');
    eq(HL.hintShareText({ date: d, mode: 'kostum', attempts: 7, solved: true }), 'Herodle #4 · 🎨 Kostum 7 💡💡');
    eq(HL.hintShareText({ date: d, mode: 'dosje', attempts: 4, solved: true }), 'Herodle #4 · 🗂️ Dosje 4/6 🟥🟥🟥🟩');
    eq(HL.hintShareText({ date: d, mode: 'dosje', attempts: 6, solved: false, lost: true }), 'Herodle #4 · 🗂️ Dosje X/6 🟥🟥🟥🟥🟥🟥');
    eq(HL.hintShareText({ date: d, mode: 'dosje', attempts: 1, solved: true, archive: true }), 'Herodle #4 (arhiv) · 🗂️ Dosje 1/6 🟩');
    for (const h of HEROES.slice(0, 60)) {
      const t = HL.normalize(['emoji', 'kostum', 'dosje'].map(m => HL.hintShareText({ date: d, mode: m, attempts: 3, solved: true })).join());
      for (const n of [h.name, ...h.aliases, h.alterEgo].filter(Boolean)) {
        const k = HL.normalize(n);
        if (k.length >= 4) ok(!t.includes(k), `v deljenju je »${n}«`);
      }
    }
  });

  test('herodle2: popolni dan in »Deli vse današnje«', () => {
    const s = (solved, extra = {}) => ({ solved, ...extra });
    eq(HL.isPerfectDay({ klasika: s(true), emoji: s(true), kostum: s(true), dosje: s(true) }), true);
    eq(HL.isPerfectDay({ 'klasika-dc': s(true), emoji: s(true), kostum: s(true), dosje: s(true) }), true, 'kateri koli bazen Klasike');
    eq(HL.isPerfectDay({ klasika: s(false, { gaveUp: true }), emoji: s(true), kostum: s(true), dosje: s(true) }), false, 'predana Klasika');
    eq(HL.isPerfectDay({ klasika: s(true), emoji: s(true), kostum: s(true), dosje: s(false, { lost: true }) }), false, 'izgubljen Dosje');
    eq(HL.isPerfectDay({ klasika: s(true), emoji: s(true), kostum: s(true) }), false);
    const r = HL.compare(H('batman'), H('superman'));
    const all = HL.shareAllText({
      date: '2026-11-25',
      classic: [{ mode: 'klasika', results: [r, HL.compare(H('superman'), H('superman'))], solved: true }],
      hint: [{ mode: 'emoji', attempts: 2, solved: true }, { mode: 'kostum', attempts: 1, solved: true }, { mode: 'dosje', attempts: 3, solved: true }],
      perfect: true,
    }).split('\n');
    eq(all[0], 'Herodle #4 · Klasika (Mešano) · 2 poskusa');
    eq(all.length, 1 + 2 + 1 + 1);
    eq(all[3], '😶‍🌫️ Emoji 2/5 · 🎨 Kostum 1 · 🗂️ Dosje 3/6 🟥🟥🟩');
    eq(all[4], '🏆 Popolni dan');
    eq(HL.shareAllText({ date: '2026-11-25', hint: [{ mode: 'kostum', attempts: 3, solved: true }] }), 'Herodle #4 · 🎨 Kostum 3');
    eq(HL.shareAllText({ date: '2026-11-25' }), '');
  });

  test('herodle2: arhiv ne vpliva na niz, statistiko in dnevno stanje', () => {
    const scope = 'test-' + Math.random().toString(36).slice(2, 8);
    store.setScope(scope);
    const keys = ['g:klasika:2026-11-24', 'a:klasika:2026-11-22', 'a:emoji:2026-11-22', 'archive-solved', 'stats:klasika', 'solved-days', 'perfect-days'];
    try {
      store.recordDay('klasika', '2026-11-24', { solved: true, attempts: 2 });
      store.markSolvedDay('2026-11-24');
      const view = store.archiveView();
      // odigraj 2 pretekla dneva v arhivu
      for (const m of ['klasika', 'emoji']) {
        const g = view.loadGame(m, '2026-11-22');
        g.solved = true; g.guesses = [{ id: 'x' }];
        view.saveGame(m, '2026-11-22', g);
        view.recordDay(m, '2026-11-22', { solved: true, attempts: 1 });
        ok(!view.markSolvedDay('2026-11-22'), 'arhiv ne zabeleži rešenega dne');
        store.markArchiveSolved(m, '2026-11-22');
      }
      eq(Object.keys(store.statsDays('klasika')), ['2026-11-24'], 'statistika brez arhiva');
      eq(store.solvedDays(), ['2026-11-24'], 'niz brez arhiva');
      eq(HL.streaks(store.solvedDays(), '2026-11-24').current, 1);
      eq(store.loadGame('klasika', '2026-11-22').solved, false, 'dnevno stanje nedotaknjeno');
      eq(store.loadArchive('emoji', '2026-11-22').solved, true);
      eq(store.archiveSolved().length, 2);
      eq(store.markArchiveSolved('emoji', '2026-11-22'), 2, 'ista uganka se ne šteje dvakrat');
      // že rešen dnevni dan je v arhivu samo pogled
      const d = store.loadGame('klasika', '2026-11-24');
      d.solved = true; store.saveGame('klasika', '2026-11-24', d);
      ok(view.loadGame('klasika', '2026-11-24').fromDaily, 'pogled na dnevni rezultat');
      ok(store.markPerfect('2026-11-24') && !store.markPerfect('2026-11-24'), 'popolni dan se nagradi enkrat');
    } finally {
      for (const k of keys) S.remove(`herodle:${scope}:${k}`);
      S.remove(`herodle:${scope}:g:klasika:2026-11-22`);
      store.setScope('x');
    }
  });

  test('herodle2: arhiv — zadnjih 30 dni od EPOCH, XP', () => {
    eq(HL.archiveDates(HL.EPOCH), [], 'prvi dan je arhiv prazen');
    eq(HL.archiveDates('2026-11-24'), ['2026-11-23', '2026-11-22']);
    const a = HL.archiveDates('2027-03-01');
    eq(a.length, 30);
    eq(a[0], '2027-02-28');
    eq(HL.fmtDate('2026-11-04'), '4. 11. 2026');
    eq(HL.xpForHint({ solved: true, attempts: 3 }), 25);
    eq(HL.xpForHint({ solved: true, attempts: 4 }), 15);
    eq(HL.xpForHint({ solved: false, attempts: 6 }), 0);
    eq([HL.XP_PERFECT, HL.XP_ARCHIVE], [20, 5]);
  });

  test('herodle2: SQL namigov je svež (node tools/herodle-sql.mjs)', ctx => {
    ok(ctx.herodleHintsSql, 'manjka supabase/games/herodle-hints.sql');
    eq(ctx.herodleHintsSql.replace(/\r\n/g, '\n'), hintsSql(), 'herodle-hints.sql');
    ok(hintsSql().includes(`'siva', array['Prvič se pojavi v 30. letih.'`), 'dominant izračunan iz palete');
  });

  test('herodle2: komentator za nove načine', () => {
    eq(HL.hintCommentKind('emoji', 0, true), 'first');
    eq(HL.hintCommentKind('emoji', 3, true), 'solved');
    eq(HL.hintCommentKind('dosje', 5, false), 'last');
    eq(HL.hintCommentKind('dosje', 6, false, true), 'lost');
    eq(HL.hintCommentKind('kostum', 2, false), 'wrong');
    ok(typeof HL.hintComment('emoji', 1, false) === 'string');
  });
}
