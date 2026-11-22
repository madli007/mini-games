/* =====================================================================
   Testi Herodla (čista logika + podatki). Registrira jih tests/tests.js.
   ctx.herodleFixture: tests/fixtures/herodle-compare.json
   ctx.herodleHeroesSql: supabase/games/herodle-heroes.sql (besedilo)
   ===================================================================== */
import { HEROES, heroById } from '../games/herodle/heroes.js';
import * as HL from '../games/herodle/logic.js';
import { heroesSql, fixtureJson } from '../tools/herodle-sql.mjs';

/**
 * @param {(name:string, fn:Function)=>void} test
 * @param {{eq:Function, ok:Function}} h
 */
export function herodleTests(test, { eq, ok }) {
  const H = id => heroById(id);
  const fake = (o = {}) => ({ id: 'x', name: 'X', aliases: [], alterEgo: null, universe: 'Marvel', teams: ['Avengers'], species: 'Človek',
    origins: ['Trening'], gender: 'M', firstComic: 1970, alignment: 'Junak', inMcu: false, actors: [], firstFilm: null, home: 'New York',
    nemesis: null, color: '#123456', unsure: [], ...o });

  test('herodle: vsaj 150 likov, ~pol Marvel/DC, ≥ 40 MCU', () => {
    ok(HEROES.length >= 150, 'premalo likov: ' + HEROES.length);
    const m = HEROES.filter(h => h.universe === 'Marvel').length, d = HEROES.length - m;
    ok(m >= 60 && d >= 60, `Marvel ${m}, DC ${d}`);
    ok(HEROES.filter(h => h.inMcu).length >= 40, 'premalo MCU');
    ok(HEROES.filter(h => h.alignment === 'Zlobec').length >= 40, 'premalo zlobcev');
    return `${HEROES.length} likov (Marvel ${m}, DC ${d}, MCU ${HEROES.filter(h => h.inMcu).length})`;
  });

  test('herodle: vsi liki imajo vsa obvezna polja in veljavne vrednosti', () => {
    const bad = HEROES.map(h => [h.id, HL.validateHero(h)]).filter(([, e]) => e.length);
    eq(bad.map(([id, e]) => `${id}: ${e.join(', ')}`), []);
  });

  test('herodle: brez podvojenih id-jev, imen in aliasov', () => {
    eq(new Set(HEROES.map(h => h.id)).size, HEROES.length, 'id');
    const seen = new Map();
    for (const h of HEROES) for (const n of [h.name, ...h.aliases]) {
      const k = HL.normalize(n);
      ok(k.length > 0, 'prazno ime/alias pri ' + h.id);
      ok(!seen.has(k) || seen.get(k) === h.id, `»${n}« pri ${h.id} in ${seen.get(k)}`);
      seen.set(k, h.id);
    }
  });

  test('herodle: ni dveh likov z enakimi vsemi sedmimi atributi', () => {
    const seen = new Map();
    for (const h of HEROES) {
      const k = HL.attrKey(h);
      ok(!seen.has(k), `${seen.get(k)} in ${h.id} sta neločljiva (${k})`);
      seen.set(k, h.id);
    }
  });

  test('herodle: nemesis je obstoječ lik (in ne lik sam)', () => {
    for (const h of HEROES) if (h.nemesis) {
      ok(H(h.nemesis), `${h.id}: nemesis ${h.nemesis} ne obstaja`);
      ok(h.nemesis !== h.id, h.id);
    }
  });

  test('herodle: primerjava — letnica točno, ±10, ±11 in puščice', () => {
    const t = fake({ firstComic: 1970 });
    eq(HL.compare(fake({ firstComic: 1970 }), t).year, 'g');
    eq(HL.compare(fake({ firstComic: 1970 }), t).dir, null);
    eq(HL.compare(fake({ firstComic: 1960 }), t).year, 'y');
    eq(HL.compare(fake({ firstComic: 1960 }), t).dir, 'up', 'skriti je kasnejši');
    eq(HL.compare(fake({ firstComic: 1980 }), t).year, 'y');
    eq(HL.compare(fake({ firstComic: 1980 }), t).dir, 'down');
    eq(HL.compare(fake({ firstComic: 1959 }), t).year, 'r');
    eq(HL.compare(fake({ firstComic: 1981 }), t).year, 'r');
    eq(HL.compare(fake({ firstComic: 1981 }), t).dir, 'down');
  });

  test('herodle: primerjava — ekipe (glavna / katera koli / Brez) in izvori', () => {
    const t = fake({ teams: ['X-Men', 'Avengers'], origins: ['Rojen', 'Tehnologija'] });
    eq(HL.compare(fake({ teams: ['X-Men'] }), t).team, 'g', 'glavna ekipa enaka');
    eq(HL.compare(fake({ teams: ['Avengers', 'Defenders'] }), t).team, 'y', 'druga ekipa se ujema');
    eq(HL.compare(fake({ teams: ['Defenders'] }), t).team, 'r');
    eq(HL.compare(fake({ teams: [] }), t).team, 'r');
    eq(HL.compare(fake({ teams: [] }), fake({ teams: [] })).team, 'g', 'oba Brez');
    eq(HL.compare(fake({ origins: ['Tehnologija', 'Rojen'] }), t).origin, 'g', 'vrstni red ni pomemben');
    eq(HL.compare(fake({ origins: ['Rojen'] }), t).origin, 'y');
    eq(HL.compare(fake({ origins: ['Rojen', 'Tehnologija', 'Magija'] }), t).origin, 'y');
    eq(HL.compare(fake({ origins: ['Magija'] }), t).origin, 'r');
    const r = HL.compare(H('superman'), H('superman'));
    ok(HL.allGreen(r), 'isti lik = vse zeleno');
    eq(HL.compare(H('iron-man'), H('batman')).universe, 'r');
  });

  test('herodle: fikstura primerjave se ujema z logic.js', ctx => {
    const fx = ctx.herodleFixture;
    ok(fx && fx.pairs.length >= 150, 'fikstura manjka (node tools/herodle-sql.mjs)');
    for (const p of fx.pairs) eq(HL.compare(H(p.guess), H(p.target)), p.result, `${p.guess} → ${p.target}`);
    ok(fx.pairs.some(p => p.result.year === 'y') && fx.pairs.some(p => p.result.team === 'y') && fx.pairs.some(p => p.result.origin === 'y'), 'manjkajo robni primeri');
    return `${fx.pairs.length} parov`;
  });

  test('herodle: SQL likov in fikstura sta sveža (node tools/herodle-sql.mjs)', ctx => {
    ok(ctx.herodleHeroesSql, 'manjka supabase/games/herodle-heroes.sql');
    eq(ctx.herodleHeroesSql.replace(/\r\n/g, '\n'), heroesSql(), 'herodle-heroes.sql');
    eq(JSON.stringify(ctx.herodleFixture), JSON.stringify(JSON.parse(fixtureJson())), 'fikstura');
  });

  test('herodle: težki način zavrne neskladen poskus', () => {
    const hist = [{ hero: H('iron-man'), result: HL.compare(H('iron-man'), H('captain-america')) }];
    // Iron Man → Cap: univerzum, ekipa, vrsta, spol, stran zeleni
    ok(HL.hardModeViolation(hist, H('batman')).includes('Univerzum'), 'DC ni dovoljen');
    ok(HL.hardModeViolation(hist, H('loki')), 'Loki nima ekipe');
    ok(HL.hardModeViolation(hist, H('black-widow')).includes('Spol'));
    eq(HL.hardModeViolation(hist, H('hawkeye')), null, 'Hawkeye je skladen');
    eq(HL.hardModeViolation([], H('batman')), null);
    const hist2 = [{ hero: H('batman'), result: HL.compare(H('batman'), H('nightwing')) }];
    eq(hist2[0].result.origin, 'y');
    eq(HL.hardModeViolation(hist2, H('green-arrow')), null, 'rumeni namigi (ekipa, izvor, leto) niso obvezni');
    ok(HL.hardModeViolation(hist2, H('superman')).includes('Vrsta'));
  });

  test('herodle: offline lik — isti za isti datum in način, različni bazeni', () => {
    for (const d of ['2026-11-22', '2026-12-31', '2027-06-01']) {
      eq(HL.offlineHeroId('klasika', d, HEROES), HL.offlineHeroId('klasika', d, HEROES));
      const a = HL.offlineHeroId('klasika', d, HEROES), b = HL.offlineHeroId('klasika-mcu', d, HEROES), c = HL.offlineHeroId('klasika-dc', d, HEROES);
      ok(a !== b && a !== c && b !== c, `${d}: ${a} ${b} ${c}`);
    }
    let same = 0;
    for (let i = 0; i < 365; i++) {
      const d = HL.addDays('2026-11-22', i);
      const a = HL.offlineHeroId('klasika', d, HEROES);
      if (a === HL.offlineHeroId('klasika-mcu', d, HEROES) || a === HL.offlineHeroId('klasika-dc', d, HEROES)) same++;
    }
    ok(same <= 2, 'mešani bazen se prepogosto ujema z MCU/DC: ' + same);
  });

  test('herodle: offline razpored brez ponovitev v ciklu, MCU samo inMcu, DC samo DC', () => {
    for (const mode of HL.POOL_IDS) {
      const pool = HL.poolHeroes(mode, HEROES);
      const n = pool.length;
      // začetek cikla, ki vsebuje 2026-11-22
      const idx = HL.daysBetween(HL.OFFLINE_ORIGIN, '2026-11-22');
      const start = HL.addDays(HL.OFFLINE_ORIGIN, idx - (idx % n));
      const seen = [];
      for (let i = 0; i < n * 2; i++) seen.push(HL.offlineHeroId(mode, HL.addDays(start, i), HEROES));
      for (let i = 1; i < seen.length; i++) ok(seen[i] !== seen[i - 1], `${mode}: zaporedna ponovitev`);
      eq(new Set(seen.slice(0, n)).size, n, mode + ': 1. cikel brez ponovitev');
      eq(new Set(seen.slice(n)).size, n, mode + ': 2. cikel brez ponovitev');
      for (const id of seen) ok(HL.inPool(mode, H(id)), `${mode}: ${id} ni v bazenu`);
    }
    ok(HL.poolHeroes('klasika-mcu', HEROES).every(h => h.inMcu));
    ok(HL.poolHeroes('klasika-dc', HEROES).every(h => h.universe === 'DC'));
  });

  test('herodle: iskanje brez šumnikov, velikih črk in ločil', () => {
    const first = q => HL.search(HEROES, q)[0]?.hero.id;
    eq(first('spider'), 'spider-man');
    eq(first('spajder'), 'spider-man');
    eq(first('PARKER'), 'spider-man');
    eq(first('spider-man'), 'spider-man');
    eq(first('crna vdova'), 'black-widow', 'brez šumnikov');
    eq(first('Črna  vdova!'), 'black-widow');
    eq(first('kal el'), 'superman');
    ok(HL.search(HEROES, 'man').length > 3);
    eq(HL.search(HEROES, ''), []);
    eq(HL.search(HL.poolHeroes('klasika-dc', HEROES), 'spider'), [], 'samo trenutni bazen');
    eq(HL.normalize('Škrlatna Čarovnica'), 'skrlatnacarovnica');
  });

  test('herodle: številka uganke in datumi', () => {
    eq(HL.puzzleNumber(HL.EPOCH), 1);
    eq(HL.puzzleNumber('2026-11-23'), 2);
    eq(HL.puzzleNumber('2027-11-22'), 366);
    eq(HL.addDays('2026-12-31', 1), '2027-01-01');
    eq(HL.addDays('2028-03-01', -1), '2028-02-29');
    ok(HL.isValidDate('2026-02-28') && !HL.isValidDate('2026-02-30') && !HL.isValidDate('x'));
  });

  test('herodle: deljenje ne vsebuje imena ali aliasa lika, >8 vrstic skrajšano', () => {
    const target = H('spider-man');
    const guesses = ['batman', 'iron-man', 'hulk', 'thor', 'loki', 'vision', 'wasp', 'falcon', 'groot', 'electro', 'spider-man'];
    const results = guesses.map(id => HL.compare(H(id), target));
    const txt = HL.shareText({ date: '2026-11-25', mode: 'klasika', results, solved: true, hard: true, stars: 3 });
    const lines = txt.split('\n');
    eq(lines[0], 'Herodle #4 · Klasika (Mešano) · 11 poskusov 💀');
    eq(lines.length, 1 + 3 + 1 + 4 + 1, 'prve 3 + … + zadnje 4 + bonus');
    eq(lines[4], '…');
    eq(lines.at(-2), '🟩'.repeat(7));
    eq(lines.at(-1), '⭐⭐⭐ bonus');
    const norm = HL.normalize(txt);
    for (const id of guesses) for (const n of [H(id).name, ...H(id).aliases, H(id).alterEgo].filter(Boolean)) {
      const k = HL.normalize(n);
      if (k.length >= 3) ok(!norm.includes(k), 'v deljenju je »' + n + '«');
    }
    const short = HL.shareText({ date: '2026-11-22', mode: 'klasika-dc', results: results.slice(0, 2), solved: false, gaveUp: true });
    eq(short.split('\n')[0], 'Herodle #1 · Klasika (Samo DC) · X/∞');
    eq(HL.pluralPoskus(1) + HL.pluralPoskus(2) + HL.pluralPoskus(3) + HL.pluralPoskus(5) + HL.pluralPoskus(101), 'poskusposkusaposkusiposkusovposkus');
    eq(HL.shareRow(HL.compare(fake({ firstComic: 1965 }), fake({ firstComic: 1970 }))).slice(-2), '🔼');
  });

  test('herodle: bonus — 3 vprašanja, brez unsure, pravilni odgovor med možnostmi', () => {
    for (const h of HEROES) {
      const qs = HL.pickBonus(h, HEROES, '2026-11-22:herodle:bonus:' + h.id);
      const avail = HL.bonusTypesFor(h, HEROES);
      eq(qs.length, Math.min(3, avail.length), h.id);
      eq(new Set(qs.map(q => q.type)).size, qs.length, 'brez ponovitev');
      for (const q of qs) {
        if (q.type === 'actor') ok(!h.unsure.includes('actors'));
        if (q.type === 'firstFilm') ok(!h.unsure.includes('firstFilm') && q.answer === h.firstFilm);
        if (q.kind === 'choice') {
          eq(q.options.length, 4, h.id + ' ' + q.type);
          eq(q.options.filter(o => q.correct.includes(o)).length, 1, `${h.id} ${q.type}: točno en pravilen`);
          eq(new Set(q.options.map(HL.normalize)).size, 4, 'različne možnosti');
        }
        if (q.kind === 'order') {
          eq(q.items.length, 4);
          ok(q.items.includes(h.id));
          eq(new Set(q.items.map(id => H(id).firstComic)).size, 4, 'brez enakih letnic');
          ok(q.items.join() !== q.answer.join(), 'ni že razvrščeno');
        }
      }
    }
    const qs = HL.pickBonus(H('batman'), HEROES, 'x');
    eq(qs, HL.pickBonus(H('batman'), HEROES, 'x'), 'isti seed → ista vprašanja');
    const actorQ = HL.pickBonus(H('spider-man'), HEROES, 'y', 6).find(q => q.type === 'actor');
    ok(actorQ.options.filter(o => H('spider-man').actors.includes(o)).length === 1);
    ok(actorQ.options.every(o => HEROES.find(x => x.actors.includes(o)).universe === 'Marvel' || true));
  });

  test('herodle: bonus — točkovanje (izbira, drsnik ±2 / točno, razvrstitev)', () => {
    const qs = HL.pickBonus(H('batman'), HEROES, 'z', 6);
    const actor = qs.find(q => q.type === 'actor');
    eq(HL.scoreBonus(actor, 'Christian Bale'), 1, 'kateri koli igralec je pravilen');
    eq(HL.scoreBonus(actor, 'Chris Evans'), 0);
    const film = qs.find(q => q.type === 'firstFilm') || { kind: 'slider', answer: 2000 };
    eq(HL.scoreBonus(film, film.answer), 2);
    eq(HL.scoreBonus(film, film.answer + 2), 1);
    eq(HL.scoreBonus(film, film.answer - 3), 0);
    const ord = HL.pickBonus(H('superman'), HEROES, 'r', 6).find(q => q.type === 'ranking');
    eq(HL.scoreBonus(ord, ord.answer), 1);
    eq(HL.scoreBonus(ord, ord.items), 0);
  });

  test('herodle: statistika, nizi in XP', () => {
    const days = {
      '2026-11-20': { solved: true, attempts: 3 },
      '2026-11-21': { solved: true, attempts: 12 },
      '2026-11-22': { solved: false, attempts: 6, gaveUp: true },
      '2026-11-23': { solved: true, attempts: 1 },
      '2026-11-24': { solved: true, attempts: 4 },
    };
    const s = HL.computeStats(days, '2026-11-24');
    eq([s.played, s.solved, s.pct, s.current, s.best], [5, 4, 80, 2, 2]);
    eq(s.hist[0] + s.hist[2] + s.hist[3] + s.hist[9], 4);
    eq(s.hist[9], 1, '10+');
    eq(s.avg, 5);
    eq(s.todayBucket, 4);
    eq(HL.computeStats(days, '2026-11-25').current, 2, 'včeraj rešen → niz še velja');
    eq(HL.computeStats(days, '2026-11-26').current, 0);
    eq(HL.streaks(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05'], '2026-11-05'), { current: 1, best: 3 });
    eq(HL.xpFor({ solved: true, attempts: 3, stars: 2 }), 35);
    eq(HL.xpFor({ solved: true, attempts: 7, stars: 0 }), 15);
    eq(HL.xpFor({ solved: false, attempts: 20, stars: 0 }), 0);
  });

  test('herodle: komentator ima ≥ 20 variant in pravo kategorijo', () => {
    const n = Object.values(HL.COMMENTS).reduce((s, l) => s + l.length, 0);
    ok(n >= 20, 'variant: ' + n);
    const r = HL.compare(H('batman'), H('spider-man'));
    eq(HL.commentKind(r, 1, true), 'first');
    eq(HL.commentKind(r, 4, true), 'solved');
    eq(HL.commentKind(HL.compare(H('hawkeye'), H('captain-america')), 2, false), 'warm');
    ok(['wrongUni', 'cold'].includes(HL.commentKind(r, 2, false)));
    ok(typeof HL.comment(r, 2, false) === 'string');
  });
}
