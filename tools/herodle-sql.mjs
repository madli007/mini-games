// Herodle: iz games/herodle/heroes.js + logic.js ustvari
//   supabase/games/herodle-heroes.sql      — upsert atributov v public.herodle_heroes (poženi za herodle.sql)
//   tests/fixtures/herodle-compare.json    — ~200 parov likov z rezultati primerjave iz logic.js
//   supabase/games/herodle-hints.sql       — upsert namigov (Emoji/Kostum/Dosje) iz hints.js v public.herodle_hints
//                                            (2. faza; poženi PO herodle-heroes.sql)
// Uporaba: node tools/herodle-sql.mjs   (vsakič, ko dodaš ali spremeniš like)
// Test »herodle: SQL in fikstura sta sveža« preveri, da se datoteki ujemata s podatki.
import { HEROES } from '../games/herodle/heroes.js';
import { compare, attrKey, colorName } from '../games/herodle/logic.js';
import { HINTS } from '../games/herodle/hints.js';
import { rng } from '../shared/util.js';

const q = s => `'${String(s).replace(/'/g, "''")}'`;
const arr = a => (a.length ? `array[${a.map(q).join(', ')}]::text[]` : `'{}'::text[]`);

export function heroesSql(heroes = HEROES) {
  const rows = heroes.map(h => `  (${q(h.id)}, ${q(h.universe)}, ${arr(h.teams)}, ${q(h.species)}, ${arr(h.origins)}, ${q(h.gender)}, ${h.firstComic}, ${q(h.alignment)}, ${h.inMcu})`);
  return `-- =====================================================================
--  HERODLE — atributi likov za primerjavo (GENERIRANO, ne urejaj ročno)
--  Ustvari: node tools/herodle-sql.mjs  ·  Poženi PO supabase/games/herodle.sql.
--  ${heroes.length} likov. Razpored (herodle_daily) se ob dodajanju likov za pretekle dni ne spremeni.
-- =====================================================================
insert into public.herodle_heroes (id, universe, teams, species, origins, gender, first_comic, alignment, in_mcu) values
${rows.join(',\n')}
on conflict (id) do update set universe = excluded.universe, teams = excluded.teams, species = excluded.species,
  origins = excluded.origins, gender = excluded.gender, first_comic = excluded.first_comic,
  alignment = excluded.alignment, in_mcu = excluded.in_mcu;

-- dopolni razpored za nove like (manjkajoči dnevi; pretekli ostanejo)
select private.herodle_fill((now() at time zone 'Europe/Ljubljana')::date, 400);
`;
}

/** SQL namigov (dominant = colorName(palette[0]), izračunano tu, ne ročno). */
export function hintsSql(heroes = HEROES, hints = HINTS) {
  const rows = heroes.map(h => {
    const x = hints[h.id];
    return `  (${q(h.id)}, ${arr(x.emoji)}, ${arr(x.palette)}, ${x.symbol == null ? 'null' : q(x.symbol)}, ${q(colorName(x.palette[0]))}, ${arr(x.dossier)})`;
  });
  return `-- =====================================================================
--  HERODLE — namigi za načine Emoji, Kostum, Dosje (GENERIRANO, ne urejaj ročno)
--  Ustvari: node tools/herodle-sql.mjs  ·  Poženi PO herodle.sql in herodle-heroes.sql.
--  ${heroes.length} likov. Tabela ni berljiva za anon/authenticated (namige vrača herodle_check/herodle_hint).
-- =====================================================================
insert into public.herodle_hints (hero_id, emoji, palette, symbol, dominant, dossier) values
${rows.join(',\n')}
on conflict (hero_id) do update set emoji = excluded.emoji, palette = excluded.palette, symbol = excluded.symbol,
  dominant = excluded.dominant, dossier = excluded.dossier;
`;
}

/** ~200 parov: robni primeri (letnica ±10/±11, delne ekipe/izvori, isti lik) + naključni. */
export function fixturePairs(heroes = HEROES, n = 200) {
  const pairs = [];
  const seen = new Set();
  const add = (a, b) => {
    const k = a.id + '>' + b.id;
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push({ guess: a.id, target: b.id, result: compare(a, b) });
  };
  const want = [
    (a, b) => a.id === b.id,
    (a, b) => b.firstComic - a.firstComic === 10,
    (a, b) => b.firstComic - a.firstComic === -10,
    (a, b) => b.firstComic - a.firstComic === 11,
    (a, b) => b.firstComic - a.firstComic === -11,
    (a, b) => a.id !== b.id && a.firstComic === b.firstComic,
    (a, b) => (a.teams[0] || '') !== (b.teams[0] || '') && a.teams.some(t => b.teams.includes(t)),
    (a, b) => !a.teams.length && !b.teams.length && a.id !== b.id,
    (a, b) => a.origins.length !== b.origins.length && a.origins.some(o => b.origins.includes(o)),
    (a, b) => a.origins.length > 1 && b.origins.length > 1 && attrKey(a) !== attrKey(b) && [...a.origins].sort().join() === [...b.origins].sort().join(),
  ];
  for (const f of want) {
    let c = 0;
    for (const a of heroes) for (const b of heroes) if (c < 4 && f(a, b) && !seen.has(a.id + '>' + b.id)) { add(a, b); c++; }
  }
  const r = rng('herodle-fixture');
  while (pairs.length < n) add(r.pick(heroes), r.pick(heroes));
  return pairs;
}

export function fixtureJson(heroes = HEROES) {
  const note = JSON.stringify('GENERIRANO z node tools/herodle-sql.mjs — rezultati iz games/herodle/logic.js');
  return `{"note": ${note},\n"pairs": [\n${fixturePairs(heroes).map(p => JSON.stringify(p)).join(',\n')}\n]}\n`;
}

if (typeof process !== 'undefined' && /herodle-sql\.mjs$/.test(process.argv?.[1] || '')) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const root = new URL('../', import.meta.url);
  await writeFile(new URL('supabase/games/herodle-heroes.sql', root), heroesSql());
  await mkdir(new URL('tests/fixtures/', root), { recursive: true });
  await writeFile(new URL('tests/fixtures/herodle-compare.json', root), fixtureJson());
  await writeFile(new URL('supabase/games/herodle-hints.sql', root), hintsSql());
  console.log(`herodle-heroes.sql: ${HEROES.length} likov · herodle-compare.json: ${fixturePairs().length} parov · herodle-hints.sql: ${Object.keys(HINTS).length} likov`);
}
