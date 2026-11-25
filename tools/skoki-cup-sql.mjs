// Okna postaj svetovnega pokala (Smučarski skoki) za tabelo public.skoki_cup_events.
// Koledar je ISTI kot v igri (games/skoki/cup-config.js → shared/sport/season.js), zato RPC skoki_cup_submit
// preverja odprtost serije po tej tabeli (izbrano: enostavneje in zanesljiveje kot podvajanje koledarja v PL/pgSQL).
//
// Uporaba: node tools/skoki-cup-sql.mjs            → izpiše blok CUP_EVENTS
//          node tools/skoki-cup-sql.mjs --write    → zamenja blok v supabase/games/skoki.sql
// Sezone: od FIRST_SEASON (2026-12) do LAST_SEASON. Pred iztekom (2028) podaljšaj LAST_SEASON in znova poženi SQL.
import { cupCalendar } from '../games/skoki/cup-config.js';
import { FIRST_SEASON, shiftSeason } from '../shared/sport/season.js';

export const LAST_SEASON = '2028-12';

export function cupSeasons(from = FIRST_SEASON, to = LAST_SEASON) {
  const out = [];
  for (let s = from; s <= to; s = shiftSeason(s, 1)) out.push(s);
  return out;
}

export function cupEventsSql(seasons = cupSeasons()) {
  const iso = ms => new Date(ms).toISOString().replace('.000Z', '+00');
  const rows = [];
  for (const s of seasons) for (const e of cupCalendar(s).events) rows.push(`  ('${s}', ${e.idx}, '${e.venue}', '${iso(e.opens)}', '${iso(e.r2)}', '${iso(e.closes)}')`);
  return `-- CUP_EVENTS:BEGIN (ustvari: node tools/skoki-cup-sql.mjs --write; sezone ${seasons[0]} … ${seasons.at(-1)})
insert into public.skoki_cup_events (season, event, hill, opens_at, r2_at, closes_at) values
${rows.join(',\n')}
on conflict (season, event) do update set hill = excluded.hill, opens_at = excluded.opens_at, r2_at = excluded.r2_at, closes_at = excluded.closes_at;
-- CUP_EVENTS:END`;
}

if (typeof process !== 'undefined' && /skoki-cup-sql\.mjs$/.test(process.argv?.[1] || '')) {
  if (process.argv.includes('--write')) {
    const fs = await import('node:fs');
    const file = new URL('../supabase/games/skoki.sql', import.meta.url);
    const s = fs.readFileSync(file, 'utf8');
    if (!/-- CUP_EVENTS:BEGIN/.test(s)) throw new Error('v skoki.sql manjka blok CUP_EVENTS');
    fs.writeFileSync(file, s.replace(/-- CUP_EVENTS:BEGIN[\s\S]*?-- CUP_EVENTS:END/, () => cupEventsSql()));
    console.log('skoki.sql: blok CUP_EVENTS posodobljen.');
  } else console.log(cupEventsSql());
}
