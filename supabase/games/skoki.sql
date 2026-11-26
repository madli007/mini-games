-- =====================================================================
--  SMUČARSKI SKOKI — ghosti (posnetki najboljših skokov) za »Rekord skakalnice«
--  Idempotentno: lahko se požene večkrat. Zahteva supabase/schema.sql (profiles, shema private).
--
--  skoki_hills   — skakalnice, največje mogoče točke in daljava (za zavrnitev nemogočih rezultatov);
--                  vrednosti = maxPoints() in maxDist() iz games/skoki/scoring.js (test preveri ujemanje)
--  skoki_ghosts  — en ghost na (igralec, skakalnica ali dan 'd-YYYYMMDD' za dnevni izziv); berejo vsi prijavljeni,
--                  piše se SAMO prek RPC skoki_save_ghost (le BOLJŠI rezultat, omejena velikost).
--
--  Rezultat je v stolpcu time_ms (ime zaradi skupnega API-ja hub.saveGhost/getGhosts):
--  daljava × 2 × 10000 + točke v desetinkah (encodeBoard v scoring.js) — VEČ JE BOLJE, rekord je v metrih.
--  Klient: hub.saveGhost({ level, timeMs, data, order: 'desc' }), hub.getGhosts({ level, order: 'desc' }).
-- =====================================================================

create table if not exists public.skoki_hills (
  hill        text primary key check (hill ~ '^[a-z0-9-]{2,30}$'),
  max_points  int not null check (max_points > 0 and max_points < 1000)
);
alter table public.skoki_hills add column if not exists max_dist int not null default 200 check (max_dist > 0 and max_dist < 500);
alter table public.skoki_hills enable row level security;
drop policy if exists skoki_hills_select on public.skoki_hills;
create policy skoki_hills_select on public.skoki_hills for select to authenticated using (true);
revoke all on table public.skoki_hills from anon, authenticated;
grant select on table public.skoki_hills to authenticated;

create table if not exists public.skoki_ghosts (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  level       text not null references public.skoki_hills(hill) on delete cascade,
  mirror      boolean not null default false,
  time_ms     int not null check (time_ms > 0 and time_ms < 10000000),
  data        text not null check (char_length(data) <= 6000),
  created_at  timestamptz not null default now(),
  primary key (user_id, level, mirror)
);
create index if not exists skoki_ghosts_board on public.skoki_ghosts (level, mirror, time_ms desc);

alter table public.skoki_ghosts enable row level security;
drop policy if exists skoki_ghosts_select on public.skoki_ghosts;
create policy skoki_ghosts_select on public.skoki_ghosts for select to authenticated using (true);
-- brez insert/update/delete pravil: pisanje samo prek private.skoki_save_ghost
revoke all on table public.skoki_ghosts from anon, authenticated;
grant select on table public.skoki_ghosts to authenticated;

-- Shrani ghost, če je rezultat BOLJŠI (večji) od mojega prejšnjega na tej skakalnici.
-- Napake: not_authenticated, no_profile, unknown_level, impossible_time (nad mejo skakalnice), ghost_too_big
create or replace function private.skoki_save_ghost(p_level text, p_mirror boolean, p_time_ms int, p_data text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  mx    int;
  md    int;
  n     int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid;
  if not found then raise exception 'no_profile'; end if;
  -- dnevni izziv: level 'd-YYYYMMDD' (ghost dneva); meje = največje med skakalnicami, vrstica za tuji ključ se doda sama
  if p_level ~ '^d-[0-9]{8}$' then
    select max(h.max_points), max(h.max_dist) into mx, md from public.skoki_hills h where h.hill !~ '^d-';
    insert into public.skoki_hills (hill, max_points, max_dist) values (p_level, mx, md) on conflict (hill) do nothing;
  else
    select h.max_points, h.max_dist into mx, md from public.skoki_hills h where h.hill = p_level;
  end if;
  if mx is null then raise exception 'unknown_level'; end if;
  -- time_ms = daljava × 2 × 10000 + točke × 10 (točke ≤ 999,9)
  if p_time_ms is null or p_time_ms <= 0 or p_time_ms / 10000 > md * 2 or p_time_ms % 10000 > mx * 10 then raise exception 'impossible_time'; end if;
  if p_data is null or char_length(p_data) > 6000 or p_data !~ '^[A-Za-z0-9+/=]+$' then raise exception 'ghost_too_big'; end if;

  insert into public.skoki_ghosts as g (user_id, level, mirror, time_ms, data)
    values (uid, p_level, coalesce(p_mirror, false), p_time_ms, p_data)
  on conflict (user_id, level, mirror) do update
    set time_ms = excluded.time_ms, data = excluded.data, created_at = now()
    where g.time_ms < excluded.time_ms;
  get diagnostics n = row_count;
  return json_build_object('saved', n > 0);
end $$;
revoke all on function private.skoki_save_ghost(text, boolean, int, text) from public, anon;
grant execute on function private.skoki_save_ghost(text, boolean, int, text) to authenticated;

create or replace function public.skoki_save_ghost(p_level text, p_mirror boolean, p_time_ms int, p_data text)
returns json language sql security invoker set search_path = '' as $$
  select private.skoki_save_ghost(p_level, p_mirror, p_time_ms, p_data);
$$;
revoke all on function public.skoki_save_ghost(text, boolean, int, text) from public, anon;
grant execute on function public.skoki_save_ghost(text, boolean, int, text) to authenticated;

-- BEGIN HILLS (maxPoints / maxDist iz games/skoki/scoring.js: daljava HS + 25 m, 60 slog, 30 kompenzacije)
insert into public.skoki_hills (hill, max_points, max_dist) values
  ('zajcek', 290, 49),
  ('brezova', 230, 93),
  ('bistra', 222, 131),
  ('sipina', 217, 142),
  ('reflektor', 221, 159),
  ('orlova', 222, 165),
  ('orlovo-gnezdo', 288, 265),
  ('mirno-morje', 249, 205),
  ('planica-srednja', 214, 127),
  ('planica-velika', 219, 163),
  ('oberstdorf', 226, 162),
  ('garmisch', 226, 167),
  ('innsbruck', 210, 153),
  ('bischofshofen', 226, 167),
  ('zakopane', 222, 165),
  ('willingen', 226, 172),
  ('lahti', 221, 155),
  ('engelberg', 222, 165),
  ('planica-letalnica', 288, 265),
  ('kulm', 282, 260),
  ('vikersund', 288, 265),
  ('oberstdorf-letalnica', 282, 260),
  ('lillehammer', 226, 165),
  ('ruka', 235, 167),
  ('wisla', 221, 159),
  ('titisee-neustadt', 226, 167),
  ('sapporo', 221, 162),
  ('lake-placid', 219, 153),
  ('oslo', 221, 159),
  ('zhangjiakou', 222, 165),
  ('falun', 217, 157),
  ('falun-srednja', 210, 120),
  ('hinzenbach', 210, 115),
  ('ljubno', 218, 119),
  ('zao', 214, 127),
  ('villach', 216, 123)
on conflict (hill) do update set max_points = excluded.max_points, max_dist = excluded.max_dist;
-- END HILLS

-- =====================================================================
--  SVETOVNI POKAL (3. faza) — asinhrona sezona (koledarski mesec), postaje z dvema serijama.
--
--  skoki_cup_events — okna postaj (opens_at … closes_at; 2. serija od r2_at); izpolni jih blok CUP_EVENTS
--                     (node tools/skoki-cup-sql.mjs --write — koledar je isti kot v igri). Berejo vsi prijavljeni.
--  skoki_cup_jumps  — en zapis na (igralec, sezona, postaja, serija): točke skoka, daljava, vnosi (ghost, base64),
--                     verzija fizike. Berejo vsi prijavljeni (replay, ghost), piše se SAMO prek RPC skoki_cup_submit.
--  skoki_cup_board  — pogled (security invoker): zapisi brez vnosov z nickname/avatar/equipped (za ui.who).
--                     Mesta in točke pokala izračuna igra (shared/sport/season.js: eventStandings, seasonStandings).
--  Klient: hub.cupSubmit / hub.cupStandings / hub.cupJump (shared/hub.js).
-- =====================================================================

create table if not exists public.skoki_cup_events (
  season     text not null check (season ~ '^[0-9]{4}-[0-9]{2}$'),
  event      smallint not null check (event between 1 and 40),
  hill       text not null references public.skoki_hills(hill),
  opens_at   timestamptz not null,
  r2_at      timestamptz not null,
  closes_at  timestamptz not null,
  primary key (season, event),
  check (opens_at < r2_at and r2_at < closes_at)
);
create index if not exists skoki_cup_events_hill on public.skoki_cup_events (hill);
alter table public.skoki_cup_events enable row level security;
drop policy if exists skoki_cup_events_select on public.skoki_cup_events;
create policy skoki_cup_events_select on public.skoki_cup_events for select to authenticated using (true);
revoke all on table public.skoki_cup_events from anon, authenticated;
grant select on table public.skoki_cup_events to authenticated;

create table if not exists public.skoki_cup_jumps (
  user_id         uuid not null references public.profiles(id) on delete cascade,
  season          text not null,
  event           smallint not null,
  round           smallint not null check (round in (1, 2)),
  points          numeric(5, 1) not null check (points >= 0 and points < 1000),
  dist            numeric(5, 1) not null check (dist >= 0 and dist < 500),
  inputs          text not null check (char_length(inputs) <= 6000),
  params_version  int not null check (params_version between 1 and 1000),
  created_at      timestamptz not null default now(),
  primary key (user_id, season, event, round),
  foreign key (season, event) references public.skoki_cup_events (season, event) on delete cascade
);
create index if not exists skoki_cup_jumps_board on public.skoki_cup_jumps (season, event, round, points desc);
alter table public.skoki_cup_jumps enable row level security;
drop policy if exists skoki_cup_jumps_select on public.skoki_cup_jumps;
create policy skoki_cup_jumps_select on public.skoki_cup_jumps for select to authenticated using (true);
-- brez insert/update/delete pravil: pisanje samo prek private.skoki_cup_submit
revoke all on table public.skoki_cup_jumps from anon, authenticated;
grant select on table public.skoki_cup_jumps to authenticated;

create or replace view public.skoki_cup_board with (security_invoker = true) as
  select j.user_id, j.season, j.event, j.round, j.points, j.dist, j.params_version, j.created_at,
         p.nickname, p.avatar, p.equipped
    from public.skoki_cup_jumps j join public.profiles p on p.id = j.user_id;
revoke all on table public.skoki_cup_board from anon, authenticated;
grant select on table public.skoki_cup_board to authenticated;

-- Oddaj skok serije. Napake: not_authenticated, no_profile, cup_unknown (ni postaje), cup_closed (serija ni odprta),
-- cup_already (serija že skočena), cup_no_r1 (2. serija brez 1.), cup_cut (ni med najboljših 30 po 1. seriji),
-- cup_too_big (vnosi), cup_impossible (točke/daljava nad mejo skakalnice).
create or replace function private.skoki_cup_submit(p_season text, p_event int, p_round int, p_points numeric, p_dist numeric,
                                                    p_inputs text, p_params_version int)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  ev   public.skoki_cup_events;
  mx   int;
  md   int;
  my1  numeric;
  n    int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid;
  if not found then raise exception 'no_profile'; end if;
  select * into ev from public.skoki_cup_events e where e.season = p_season and e.event = p_event;
  if not found then raise exception 'cup_unknown'; end if;
  if p_round is null or p_round not in (1, 2) then raise exception 'cup_unknown'; end if;
  if now() < ev.opens_at or now() >= ev.closes_at or (p_round = 2 and now() < ev.r2_at) then raise exception 'cup_closed'; end if;
  if p_inputs is null or char_length(p_inputs) > 6000 or p_inputs !~ '^[A-Za-z0-9+/=]+$' then raise exception 'cup_too_big'; end if;
  select h.max_points, h.max_dist into mx, md from public.skoki_hills h where h.hill = ev.hill;
  if p_points is null or p_dist is null or p_points < 0 or p_points > mx or p_dist < 0 or p_dist > md
     or p_params_version is null or p_params_version < 1 or p_params_version > 1000 then
    raise exception 'cup_impossible';
  end if;
  if exists (select 1 from public.skoki_cup_jumps j where j.user_id = uid and j.season = p_season and j.event = p_event and j.round = p_round) then
    raise exception 'cup_already';
  end if;
  if p_round = 2 then
    select j.points into my1 from public.skoki_cup_jumps j where j.user_id = uid and j.season = p_season and j.event = p_event and j.round = 1;
    if my1 is null then raise exception 'cup_no_r1'; end if;
    select count(*) into n from public.skoki_cup_jumps j where j.season = p_season and j.event = p_event and j.round = 1 and j.points > my1;
    if n >= 30 then raise exception 'cup_cut'; end if;
  end if;
  insert into public.skoki_cup_jumps (user_id, season, event, round, points, dist, inputs, params_version)
    values (uid, p_season, p_event, p_round, round(p_points, 1), round(p_dist, 1), p_inputs, p_params_version)
    on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'cup_already'; end if;
  return json_build_object('saved', true);
end $$;
revoke all on function private.skoki_cup_submit(text, int, int, numeric, numeric, text, int) from public, anon;
grant execute on function private.skoki_cup_submit(text, int, int, numeric, numeric, text, int) to authenticated;

create or replace function public.skoki_cup_submit(p_season text, p_event int, p_round int, p_points numeric, p_dist numeric,
                                                   p_inputs text, p_params_version int)
returns json language sql security invoker set search_path = '' as $$
  select private.skoki_cup_submit(p_season, p_event, p_round, p_points, p_dist, p_inputs, p_params_version);
$$;
revoke all on function public.skoki_cup_submit(text, int, int, numeric, numeric, text, int) from public, anon;
grant execute on function public.skoki_cup_submit(text, int, int, numeric, numeric, text, int) to authenticated;

-- CUP_EVENTS:BEGIN (ustvari: node tools/skoki-cup-sql.mjs --write; sezone 2026-12 … 2028-12)
insert into public.skoki_cup_events (season, event, hill, opens_at, r2_at, closes_at) values
  ('2026-12', 1, 'willingen', '2026-11-30T23:00:00+00', '2026-12-02T23:00:00+00', '2026-12-03T23:00:00+00'),
  ('2026-12', 2, 'planica-srednja', '2026-12-03T23:00:00+00', '2026-12-05T23:00:00+00', '2026-12-06T23:00:00+00'),
  ('2026-12', 3, 'planica-velika', '2026-12-06T23:00:00+00', '2026-12-07T23:00:00+00', '2026-12-08T23:00:00+00'),
  ('2026-12', 4, 'zakopane', '2026-12-08T23:00:00+00', '2026-12-10T23:00:00+00', '2026-12-11T23:00:00+00'),
  ('2026-12', 5, 'vikersund', '2026-12-11T23:00:00+00', '2026-12-13T23:00:00+00', '2026-12-14T23:00:00+00'),
  ('2026-12', 6, 'engelberg', '2026-12-14T23:00:00+00', '2026-12-16T23:00:00+00', '2026-12-17T23:00:00+00'),
  ('2026-12', 7, 'oberstdorf', '2026-12-17T23:00:00+00', '2026-12-19T23:00:00+00', '2026-12-20T23:00:00+00'),
  ('2026-12', 8, 'garmisch', '2026-12-20T23:00:00+00', '2026-12-22T23:00:00+00', '2026-12-23T23:00:00+00'),
  ('2026-12', 9, 'innsbruck', '2026-12-23T23:00:00+00', '2026-12-24T23:00:00+00', '2026-12-25T23:00:00+00'),
  ('2026-12', 10, 'bischofshofen', '2026-12-25T23:00:00+00', '2026-12-27T23:00:00+00', '2026-12-28T23:00:00+00'),
  ('2026-12', 11, 'oberstdorf-letalnica', '2026-12-28T23:00:00+00', '2026-12-30T23:00:00+00', '2026-12-31T23:00:00+00'),
  ('2027-01', 1, 'innsbruck', '2026-12-31T23:00:00+00', '2027-01-02T23:00:00+00', '2027-01-03T23:00:00+00'),
  ('2027-01', 2, 'willingen', '2027-01-03T23:00:00+00', '2027-01-05T23:00:00+00', '2027-01-06T23:00:00+00'),
  ('2027-01', 3, 'bischofshofen', '2027-01-06T23:00:00+00', '2027-01-07T23:00:00+00', '2027-01-08T23:00:00+00'),
  ('2027-01', 4, 'lahti', '2027-01-08T23:00:00+00', '2027-01-10T23:00:00+00', '2027-01-11T23:00:00+00'),
  ('2027-01', 5, 'zakopane', '2027-01-11T23:00:00+00', '2027-01-13T23:00:00+00', '2027-01-14T23:00:00+00'),
  ('2027-01', 6, 'oberstdorf', '2027-01-14T23:00:00+00', '2027-01-16T23:00:00+00', '2027-01-17T23:00:00+00'),
  ('2027-01', 7, 'oberstdorf-letalnica', '2027-01-17T23:00:00+00', '2027-01-19T23:00:00+00', '2027-01-20T23:00:00+00'),
  ('2027-01', 8, 'planica-velika', '2027-01-20T23:00:00+00', '2027-01-22T23:00:00+00', '2027-01-23T23:00:00+00'),
  ('2027-01', 9, 'engelberg', '2027-01-23T23:00:00+00', '2027-01-24T23:00:00+00', '2027-01-25T23:00:00+00'),
  ('2027-01', 10, 'planica-srednja', '2027-01-25T23:00:00+00', '2027-01-27T23:00:00+00', '2027-01-28T23:00:00+00'),
  ('2027-01', 11, 'planica-letalnica', '2027-01-28T23:00:00+00', '2027-01-30T23:00:00+00', '2027-01-31T23:00:00+00'),
  ('2027-02', 1, 'willingen', '2027-01-31T23:00:00+00', '2027-02-02T23:00:00+00', '2027-02-03T23:00:00+00'),
  ('2027-02', 2, 'innsbruck', '2027-02-03T23:00:00+00', '2027-02-05T23:00:00+00', '2027-02-06T23:00:00+00'),
  ('2027-02', 3, 'engelberg', '2027-02-06T23:00:00+00', '2027-02-07T23:00:00+00', '2027-02-08T23:00:00+00'),
  ('2027-02', 4, 'garmisch', '2027-02-08T23:00:00+00', '2027-02-10T23:00:00+00', '2027-02-11T23:00:00+00'),
  ('2027-02', 5, 'kulm', '2027-02-11T23:00:00+00', '2027-02-13T23:00:00+00', '2027-02-14T23:00:00+00'),
  ('2027-02', 6, 'planica-srednja', '2027-02-14T23:00:00+00', '2027-02-16T23:00:00+00', '2027-02-17T23:00:00+00'),
  ('2027-02', 7, 'oberstdorf', '2027-02-17T23:00:00+00', '2027-02-19T23:00:00+00', '2027-02-20T23:00:00+00'),
  ('2027-02', 8, 'bischofshofen', '2027-02-20T23:00:00+00', '2027-02-21T23:00:00+00', '2027-02-22T23:00:00+00'),
  ('2027-02', 9, 'zakopane', '2027-02-22T23:00:00+00', '2027-02-24T23:00:00+00', '2027-02-25T23:00:00+00'),
  ('2027-02', 10, 'planica-letalnica', '2027-02-25T23:00:00+00', '2027-02-27T23:00:00+00', '2027-02-28T23:00:00+00'),
  ('2027-03', 1, 'lahti', '2027-02-28T23:00:00+00', '2027-03-02T23:00:00+00', '2027-03-03T23:00:00+00'),
  ('2027-03', 2, 'zakopane', '2027-03-03T23:00:00+00', '2027-03-05T23:00:00+00', '2027-03-06T23:00:00+00'),
  ('2027-03', 3, 'willingen', '2027-03-06T23:00:00+00', '2027-03-07T23:00:00+00', '2027-03-08T23:00:00+00'),
  ('2027-03', 4, 'garmisch', '2027-03-08T23:00:00+00', '2027-03-10T23:00:00+00', '2027-03-11T23:00:00+00'),
  ('2027-03', 5, 'vikersund', '2027-03-11T23:00:00+00', '2027-03-13T23:00:00+00', '2027-03-14T23:00:00+00'),
  ('2027-03', 6, 'bischofshofen', '2027-03-14T23:00:00+00', '2027-03-16T23:00:00+00', '2027-03-17T23:00:00+00'),
  ('2027-03', 7, 'planica-velika', '2027-03-17T23:00:00+00', '2027-03-19T23:00:00+00', '2027-03-20T23:00:00+00'),
  ('2027-03', 8, 'engelberg', '2027-03-20T23:00:00+00', '2027-03-22T23:00:00+00', '2027-03-23T23:00:00+00'),
  ('2027-03', 9, 'planica-srednja', '2027-03-23T23:00:00+00', '2027-03-24T23:00:00+00', '2027-03-25T23:00:00+00'),
  ('2027-03', 10, 'innsbruck', '2027-03-25T23:00:00+00', '2027-03-27T23:00:00+00', '2027-03-28T22:00:00+00'),
  ('2027-03', 11, 'oberstdorf-letalnica', '2027-03-28T22:00:00+00', '2027-03-30T22:00:00+00', '2027-03-31T22:00:00+00'),
  ('2027-04', 1, 'garmisch', '2027-03-31T22:00:00+00', '2027-04-02T22:00:00+00', '2027-04-03T22:00:00+00'),
  ('2027-04', 2, 'engelberg', '2027-04-03T22:00:00+00', '2027-04-05T22:00:00+00', '2027-04-06T22:00:00+00'),
  ('2027-04', 3, 'planica-velika', '2027-04-06T22:00:00+00', '2027-04-08T22:00:00+00', '2027-04-09T22:00:00+00'),
  ('2027-04', 4, 'bischofshofen', '2027-04-09T22:00:00+00', '2027-04-11T22:00:00+00', '2027-04-12T22:00:00+00'),
  ('2027-04', 5, 'vikersund', '2027-04-12T22:00:00+00', '2027-04-14T22:00:00+00', '2027-04-15T22:00:00+00'),
  ('2027-04', 6, 'innsbruck', '2027-04-15T22:00:00+00', '2027-04-17T22:00:00+00', '2027-04-18T22:00:00+00'),
  ('2027-04', 7, 'lahti', '2027-04-18T22:00:00+00', '2027-04-20T22:00:00+00', '2027-04-21T22:00:00+00'),
  ('2027-04', 8, 'oberstdorf', '2027-04-21T22:00:00+00', '2027-04-23T22:00:00+00', '2027-04-24T22:00:00+00'),
  ('2027-04', 9, 'zakopane', '2027-04-24T22:00:00+00', '2027-04-26T22:00:00+00', '2027-04-27T22:00:00+00'),
  ('2027-04', 10, 'kulm', '2027-04-27T22:00:00+00', '2027-04-29T22:00:00+00', '2027-04-30T22:00:00+00'),
  ('2027-05', 1, 'planica-srednja', '2027-04-30T22:00:00+00', '2027-05-02T22:00:00+00', '2027-05-03T22:00:00+00'),
  ('2027-05', 2, 'innsbruck', '2027-05-03T22:00:00+00', '2027-05-05T22:00:00+00', '2027-05-06T22:00:00+00'),
  ('2027-05', 3, 'oberstdorf', '2027-05-06T22:00:00+00', '2027-05-07T22:00:00+00', '2027-05-08T22:00:00+00'),
  ('2027-05', 4, 'garmisch', '2027-05-08T22:00:00+00', '2027-05-10T22:00:00+00', '2027-05-11T22:00:00+00'),
  ('2027-05', 5, 'willingen', '2027-05-11T22:00:00+00', '2027-05-13T22:00:00+00', '2027-05-14T22:00:00+00'),
  ('2027-05', 6, 'lahti', '2027-05-14T22:00:00+00', '2027-05-16T22:00:00+00', '2027-05-17T22:00:00+00'),
  ('2027-05', 7, 'kulm', '2027-05-17T22:00:00+00', '2027-05-19T22:00:00+00', '2027-05-20T22:00:00+00'),
  ('2027-05', 8, 'zakopane', '2027-05-20T22:00:00+00', '2027-05-22T22:00:00+00', '2027-05-23T22:00:00+00'),
  ('2027-05', 9, 'planica-velika', '2027-05-23T22:00:00+00', '2027-05-24T22:00:00+00', '2027-05-25T22:00:00+00'),
  ('2027-05', 10, 'bischofshofen', '2027-05-25T22:00:00+00', '2027-05-27T22:00:00+00', '2027-05-28T22:00:00+00'),
  ('2027-05', 11, 'oberstdorf-letalnica', '2027-05-28T22:00:00+00', '2027-05-30T22:00:00+00', '2027-05-31T22:00:00+00'),
  ('2027-06', 1, 'planica-srednja', '2027-05-31T22:00:00+00', '2027-06-02T22:00:00+00', '2027-06-03T22:00:00+00'),
  ('2027-06', 2, 'lahti', '2027-06-03T22:00:00+00', '2027-06-05T22:00:00+00', '2027-06-06T22:00:00+00'),
  ('2027-06', 3, 'willingen', '2027-06-06T22:00:00+00', '2027-06-08T22:00:00+00', '2027-06-09T22:00:00+00'),
  ('2027-06', 4, 'zakopane', '2027-06-09T22:00:00+00', '2027-06-11T22:00:00+00', '2027-06-12T22:00:00+00'),
  ('2027-06', 5, 'oberstdorf-letalnica', '2027-06-12T22:00:00+00', '2027-06-14T22:00:00+00', '2027-06-15T22:00:00+00'),
  ('2027-06', 6, 'oberstdorf', '2027-06-15T22:00:00+00', '2027-06-17T22:00:00+00', '2027-06-18T22:00:00+00'),
  ('2027-06', 7, 'innsbruck', '2027-06-18T22:00:00+00', '2027-06-20T22:00:00+00', '2027-06-21T22:00:00+00'),
  ('2027-06', 8, 'engelberg', '2027-06-21T22:00:00+00', '2027-06-23T22:00:00+00', '2027-06-24T22:00:00+00'),
  ('2027-06', 9, 'bischofshofen', '2027-06-24T22:00:00+00', '2027-06-26T22:00:00+00', '2027-06-27T22:00:00+00'),
  ('2027-06', 10, 'kulm', '2027-06-27T22:00:00+00', '2027-06-29T22:00:00+00', '2027-06-30T22:00:00+00'),
  ('2027-07', 1, 'planica-srednja', '2027-06-30T22:00:00+00', '2027-07-02T22:00:00+00', '2027-07-03T22:00:00+00'),
  ('2027-07', 2, 'engelberg', '2027-07-03T22:00:00+00', '2027-07-05T22:00:00+00', '2027-07-06T22:00:00+00'),
  ('2027-07', 3, 'lahti', '2027-07-06T22:00:00+00', '2027-07-07T22:00:00+00', '2027-07-08T22:00:00+00'),
  ('2027-07', 4, 'innsbruck', '2027-07-08T22:00:00+00', '2027-07-10T22:00:00+00', '2027-07-11T22:00:00+00'),
  ('2027-07', 5, 'oberstdorf-letalnica', '2027-07-11T22:00:00+00', '2027-07-13T22:00:00+00', '2027-07-14T22:00:00+00'),
  ('2027-07', 6, 'oberstdorf', '2027-07-14T22:00:00+00', '2027-07-16T22:00:00+00', '2027-07-17T22:00:00+00'),
  ('2027-07', 7, 'bischofshofen', '2027-07-17T22:00:00+00', '2027-07-19T22:00:00+00', '2027-07-20T22:00:00+00'),
  ('2027-07', 8, 'zakopane', '2027-07-20T22:00:00+00', '2027-07-22T22:00:00+00', '2027-07-23T22:00:00+00'),
  ('2027-07', 9, 'willingen', '2027-07-23T22:00:00+00', '2027-07-24T22:00:00+00', '2027-07-25T22:00:00+00'),
  ('2027-07', 10, 'planica-velika', '2027-07-25T22:00:00+00', '2027-07-27T22:00:00+00', '2027-07-28T22:00:00+00'),
  ('2027-07', 11, 'planica-letalnica', '2027-07-28T22:00:00+00', '2027-07-30T22:00:00+00', '2027-07-31T22:00:00+00'),
  ('2027-08', 1, 'oberstdorf', '2027-07-31T22:00:00+00', '2027-08-02T22:00:00+00', '2027-08-03T22:00:00+00'),
  ('2027-08', 2, 'engelberg', '2027-08-03T22:00:00+00', '2027-08-05T22:00:00+00', '2027-08-06T22:00:00+00'),
  ('2027-08', 3, 'planica-srednja', '2027-08-06T22:00:00+00', '2027-08-07T22:00:00+00', '2027-08-08T22:00:00+00'),
  ('2027-08', 4, 'garmisch', '2027-08-08T22:00:00+00', '2027-08-10T22:00:00+00', '2027-08-11T22:00:00+00'),
  ('2027-08', 5, 'innsbruck', '2027-08-11T22:00:00+00', '2027-08-13T22:00:00+00', '2027-08-14T22:00:00+00'),
  ('2027-08', 6, 'zakopane', '2027-08-14T22:00:00+00', '2027-08-16T22:00:00+00', '2027-08-17T22:00:00+00'),
  ('2027-08', 7, 'kulm', '2027-08-17T22:00:00+00', '2027-08-19T22:00:00+00', '2027-08-20T22:00:00+00'),
  ('2027-08', 8, 'bischofshofen', '2027-08-20T22:00:00+00', '2027-08-22T22:00:00+00', '2027-08-23T22:00:00+00'),
  ('2027-08', 9, 'willingen', '2027-08-23T22:00:00+00', '2027-08-24T22:00:00+00', '2027-08-25T22:00:00+00'),
  ('2027-08', 10, 'lahti', '2027-08-25T22:00:00+00', '2027-08-27T22:00:00+00', '2027-08-28T22:00:00+00'),
  ('2027-08', 11, 'planica-letalnica', '2027-08-28T22:00:00+00', '2027-08-30T22:00:00+00', '2027-08-31T22:00:00+00'),
  ('2027-09', 1, 'willingen', '2027-08-31T22:00:00+00', '2027-09-02T22:00:00+00', '2027-09-03T22:00:00+00'),
  ('2027-09', 2, 'oberstdorf', '2027-09-03T22:00:00+00', '2027-09-05T22:00:00+00', '2027-09-06T22:00:00+00'),
  ('2027-09', 3, 'planica-velika', '2027-09-06T22:00:00+00', '2027-09-08T22:00:00+00', '2027-09-09T22:00:00+00'),
  ('2027-09', 4, 'garmisch', '2027-09-09T22:00:00+00', '2027-09-11T22:00:00+00', '2027-09-12T22:00:00+00'),
  ('2027-09', 5, 'zakopane', '2027-09-12T22:00:00+00', '2027-09-14T22:00:00+00', '2027-09-15T22:00:00+00'),
  ('2027-09', 6, 'kulm', '2027-09-15T22:00:00+00', '2027-09-17T22:00:00+00', '2027-09-18T22:00:00+00'),
  ('2027-09', 7, 'planica-srednja', '2027-09-18T22:00:00+00', '2027-09-20T22:00:00+00', '2027-09-21T22:00:00+00'),
  ('2027-09', 8, 'engelberg', '2027-09-21T22:00:00+00', '2027-09-23T22:00:00+00', '2027-09-24T22:00:00+00'),
  ('2027-09', 9, 'bischofshofen', '2027-09-24T22:00:00+00', '2027-09-26T22:00:00+00', '2027-09-27T22:00:00+00'),
  ('2027-09', 10, 'planica-letalnica', '2027-09-27T22:00:00+00', '2027-09-29T22:00:00+00', '2027-09-30T22:00:00+00'),
  ('2027-10', 1, 'willingen', '2027-09-30T22:00:00+00', '2027-10-02T22:00:00+00', '2027-10-03T22:00:00+00'),
  ('2027-10', 2, 'oberstdorf', '2027-10-03T22:00:00+00', '2027-10-05T22:00:00+00', '2027-10-06T22:00:00+00'),
  ('2027-10', 3, 'planica-srednja', '2027-10-06T22:00:00+00', '2027-10-07T22:00:00+00', '2027-10-08T22:00:00+00'),
  ('2027-10', 4, 'bischofshofen', '2027-10-08T22:00:00+00', '2027-10-10T22:00:00+00', '2027-10-11T22:00:00+00'),
  ('2027-10', 5, 'kulm', '2027-10-11T22:00:00+00', '2027-10-13T22:00:00+00', '2027-10-14T22:00:00+00'),
  ('2027-10', 6, 'innsbruck', '2027-10-14T22:00:00+00', '2027-10-16T22:00:00+00', '2027-10-17T22:00:00+00'),
  ('2027-10', 7, 'engelberg', '2027-10-17T22:00:00+00', '2027-10-19T22:00:00+00', '2027-10-20T22:00:00+00'),
  ('2027-10', 8, 'lahti', '2027-10-20T22:00:00+00', '2027-10-22T22:00:00+00', '2027-10-23T22:00:00+00'),
  ('2027-10', 9, 'garmisch', '2027-10-23T22:00:00+00', '2027-10-24T22:00:00+00', '2027-10-25T22:00:00+00'),
  ('2027-10', 10, 'planica-velika', '2027-10-25T22:00:00+00', '2027-10-27T22:00:00+00', '2027-10-28T22:00:00+00'),
  ('2027-10', 11, 'planica-letalnica', '2027-10-28T22:00:00+00', '2027-10-30T22:00:00+00', '2027-10-31T23:00:00+00'),
  ('2027-11', 1, 'planica-srednja', '2027-10-31T23:00:00+00', '2027-11-02T23:00:00+00', '2027-11-03T23:00:00+00'),
  ('2027-11', 2, 'oberstdorf', '2027-11-03T23:00:00+00', '2027-11-05T23:00:00+00', '2027-11-06T23:00:00+00'),
  ('2027-11', 3, 'planica-velika', '2027-11-06T23:00:00+00', '2027-11-08T23:00:00+00', '2027-11-09T23:00:00+00'),
  ('2027-11', 4, 'zakopane', '2027-11-09T23:00:00+00', '2027-11-11T23:00:00+00', '2027-11-12T23:00:00+00'),
  ('2027-11', 5, 'kulm', '2027-11-12T23:00:00+00', '2027-11-14T23:00:00+00', '2027-11-15T23:00:00+00'),
  ('2027-11', 6, 'garmisch', '2027-11-15T23:00:00+00', '2027-11-17T23:00:00+00', '2027-11-18T23:00:00+00'),
  ('2027-11', 7, 'bischofshofen', '2027-11-18T23:00:00+00', '2027-11-20T23:00:00+00', '2027-11-21T23:00:00+00'),
  ('2027-11', 8, 'innsbruck', '2027-11-21T23:00:00+00', '2027-11-23T23:00:00+00', '2027-11-24T23:00:00+00'),
  ('2027-11', 9, 'lahti', '2027-11-24T23:00:00+00', '2027-11-26T23:00:00+00', '2027-11-27T23:00:00+00'),
  ('2027-11', 10, 'planica-letalnica', '2027-11-27T23:00:00+00', '2027-11-29T23:00:00+00', '2027-11-30T23:00:00+00'),
  ('2027-12', 1, 'lahti', '2027-11-30T23:00:00+00', '2027-12-02T23:00:00+00', '2027-12-03T23:00:00+00'),
  ('2027-12', 2, 'planica-velika', '2027-12-03T23:00:00+00', '2027-12-05T23:00:00+00', '2027-12-06T23:00:00+00'),
  ('2027-12', 3, 'engelberg', '2027-12-06T23:00:00+00', '2027-12-07T23:00:00+00', '2027-12-08T23:00:00+00'),
  ('2027-12', 4, 'oberstdorf-letalnica', '2027-12-08T23:00:00+00', '2027-12-10T23:00:00+00', '2027-12-11T23:00:00+00'),
  ('2027-12', 5, 'willingen', '2027-12-11T23:00:00+00', '2027-12-13T23:00:00+00', '2027-12-14T23:00:00+00'),
  ('2027-12', 6, 'planica-srednja', '2027-12-14T23:00:00+00', '2027-12-16T23:00:00+00', '2027-12-17T23:00:00+00'),
  ('2027-12', 7, 'oberstdorf', '2027-12-17T23:00:00+00', '2027-12-19T23:00:00+00', '2027-12-20T23:00:00+00'),
  ('2027-12', 8, 'garmisch', '2027-12-20T23:00:00+00', '2027-12-22T23:00:00+00', '2027-12-23T23:00:00+00'),
  ('2027-12', 9, 'innsbruck', '2027-12-23T23:00:00+00', '2027-12-24T23:00:00+00', '2027-12-25T23:00:00+00'),
  ('2027-12', 10, 'bischofshofen', '2027-12-25T23:00:00+00', '2027-12-27T23:00:00+00', '2027-12-28T23:00:00+00'),
  ('2027-12', 11, 'planica-letalnica', '2027-12-28T23:00:00+00', '2027-12-30T23:00:00+00', '2027-12-31T23:00:00+00'),
  ('2028-01', 1, 'zakopane', '2027-12-31T23:00:00+00', '2028-01-02T23:00:00+00', '2028-01-03T23:00:00+00'),
  ('2028-01', 2, 'oberstdorf', '2028-01-03T23:00:00+00', '2028-01-05T23:00:00+00', '2028-01-06T23:00:00+00'),
  ('2028-01', 3, 'garmisch', '2028-01-06T23:00:00+00', '2028-01-07T23:00:00+00', '2028-01-08T23:00:00+00'),
  ('2028-01', 4, 'lahti', '2028-01-08T23:00:00+00', '2028-01-10T23:00:00+00', '2028-01-11T23:00:00+00'),
  ('2028-01', 5, 'willingen', '2028-01-11T23:00:00+00', '2028-01-13T23:00:00+00', '2028-01-14T23:00:00+00'),
  ('2028-01', 6, 'innsbruck', '2028-01-14T23:00:00+00', '2028-01-16T23:00:00+00', '2028-01-17T23:00:00+00'),
  ('2028-01', 7, 'bischofshofen', '2028-01-17T23:00:00+00', '2028-01-19T23:00:00+00', '2028-01-20T23:00:00+00'),
  ('2028-01', 8, 'vikersund', '2028-01-20T23:00:00+00', '2028-01-22T23:00:00+00', '2028-01-23T23:00:00+00'),
  ('2028-01', 9, 'engelberg', '2028-01-23T23:00:00+00', '2028-01-24T23:00:00+00', '2028-01-25T23:00:00+00'),
  ('2028-01', 10, 'planica-velika', '2028-01-25T23:00:00+00', '2028-01-27T23:00:00+00', '2028-01-28T23:00:00+00'),
  ('2028-01', 11, 'planica-letalnica', '2028-01-28T23:00:00+00', '2028-01-30T23:00:00+00', '2028-01-31T23:00:00+00'),
  ('2028-02', 1, 'lahti', '2028-01-31T23:00:00+00', '2028-02-02T23:00:00+00', '2028-02-03T23:00:00+00'),
  ('2028-02', 2, 'zakopane', '2028-02-03T23:00:00+00', '2028-02-05T23:00:00+00', '2028-02-06T23:00:00+00'),
  ('2028-02', 3, 'bischofshofen', '2028-02-06T23:00:00+00', '2028-02-08T23:00:00+00', '2028-02-09T23:00:00+00'),
  ('2028-02', 4, 'innsbruck', '2028-02-09T23:00:00+00', '2028-02-11T23:00:00+00', '2028-02-12T23:00:00+00'),
  ('2028-02', 5, 'engelberg', '2028-02-12T23:00:00+00', '2028-02-14T23:00:00+00', '2028-02-15T23:00:00+00'),
  ('2028-02', 6, 'willingen', '2028-02-15T23:00:00+00', '2028-02-16T23:00:00+00', '2028-02-17T23:00:00+00'),
  ('2028-02', 7, 'vikersund', '2028-02-17T23:00:00+00', '2028-02-19T23:00:00+00', '2028-02-20T23:00:00+00'),
  ('2028-02', 8, 'planica-srednja', '2028-02-20T23:00:00+00', '2028-02-22T23:00:00+00', '2028-02-23T23:00:00+00'),
  ('2028-02', 9, 'garmisch', '2028-02-23T23:00:00+00', '2028-02-25T23:00:00+00', '2028-02-26T23:00:00+00'),
  ('2028-02', 10, 'planica-letalnica', '2028-02-26T23:00:00+00', '2028-02-28T23:00:00+00', '2028-02-29T23:00:00+00'),
  ('2028-03', 1, 'lahti', '2028-02-29T23:00:00+00', '2028-03-02T23:00:00+00', '2028-03-03T23:00:00+00'),
  ('2028-03', 2, 'oberstdorf', '2028-03-03T23:00:00+00', '2028-03-05T23:00:00+00', '2028-03-06T23:00:00+00'),
  ('2028-03', 3, 'willingen', '2028-03-06T23:00:00+00', '2028-03-07T23:00:00+00', '2028-03-08T23:00:00+00'),
  ('2028-03', 4, 'garmisch', '2028-03-08T23:00:00+00', '2028-03-10T23:00:00+00', '2028-03-11T23:00:00+00'),
  ('2028-03', 5, 'zakopane', '2028-03-11T23:00:00+00', '2028-03-13T23:00:00+00', '2028-03-14T23:00:00+00'),
  ('2028-03', 6, 'planica-velika', '2028-03-14T23:00:00+00', '2028-03-16T23:00:00+00', '2028-03-17T23:00:00+00'),
  ('2028-03', 7, 'planica-srednja', '2028-03-17T23:00:00+00', '2028-03-19T23:00:00+00', '2028-03-20T23:00:00+00'),
  ('2028-03', 8, 'oberstdorf-letalnica', '2028-03-20T23:00:00+00', '2028-03-22T23:00:00+00', '2028-03-23T23:00:00+00'),
  ('2028-03', 9, 'engelberg', '2028-03-23T23:00:00+00', '2028-03-24T23:00:00+00', '2028-03-25T23:00:00+00'),
  ('2028-03', 10, 'innsbruck', '2028-03-25T23:00:00+00', '2028-03-27T22:00:00+00', '2028-03-28T22:00:00+00'),
  ('2028-03', 11, 'planica-letalnica', '2028-03-28T22:00:00+00', '2028-03-30T22:00:00+00', '2028-03-31T22:00:00+00'),
  ('2028-04', 1, 'lahti', '2028-03-31T22:00:00+00', '2028-04-02T22:00:00+00', '2028-04-03T22:00:00+00'),
  ('2028-04', 2, 'bischofshofen', '2028-04-03T22:00:00+00', '2028-04-05T22:00:00+00', '2028-04-06T22:00:00+00'),
  ('2028-04', 3, 'planica-velika', '2028-04-06T22:00:00+00', '2028-04-08T22:00:00+00', '2028-04-09T22:00:00+00'),
  ('2028-04', 4, 'planica-srednja', '2028-04-09T22:00:00+00', '2028-04-11T22:00:00+00', '2028-04-12T22:00:00+00'),
  ('2028-04', 5, 'vikersund', '2028-04-12T22:00:00+00', '2028-04-14T22:00:00+00', '2028-04-15T22:00:00+00'),
  ('2028-04', 6, 'zakopane', '2028-04-15T22:00:00+00', '2028-04-17T22:00:00+00', '2028-04-18T22:00:00+00'),
  ('2028-04', 7, 'engelberg', '2028-04-18T22:00:00+00', '2028-04-20T22:00:00+00', '2028-04-21T22:00:00+00'),
  ('2028-04', 8, 'willingen', '2028-04-21T22:00:00+00', '2028-04-23T22:00:00+00', '2028-04-24T22:00:00+00'),
  ('2028-04', 9, 'oberstdorf', '2028-04-24T22:00:00+00', '2028-04-26T22:00:00+00', '2028-04-27T22:00:00+00'),
  ('2028-04', 10, 'planica-letalnica', '2028-04-27T22:00:00+00', '2028-04-29T22:00:00+00', '2028-04-30T22:00:00+00'),
  ('2028-05', 1, 'engelberg', '2028-04-30T22:00:00+00', '2028-05-02T22:00:00+00', '2028-05-03T22:00:00+00'),
  ('2028-05', 2, 'planica-srednja', '2028-05-03T22:00:00+00', '2028-05-05T22:00:00+00', '2028-05-06T22:00:00+00'),
  ('2028-05', 3, 'bischofshofen', '2028-05-06T22:00:00+00', '2028-05-07T22:00:00+00', '2028-05-08T22:00:00+00'),
  ('2028-05', 4, 'planica-velika', '2028-05-08T22:00:00+00', '2028-05-10T22:00:00+00', '2028-05-11T22:00:00+00'),
  ('2028-05', 5, 'oberstdorf', '2028-05-11T22:00:00+00', '2028-05-13T22:00:00+00', '2028-05-14T22:00:00+00'),
  ('2028-05', 6, 'lahti', '2028-05-14T22:00:00+00', '2028-05-16T22:00:00+00', '2028-05-17T22:00:00+00'),
  ('2028-05', 7, 'oberstdorf-letalnica', '2028-05-17T22:00:00+00', '2028-05-19T22:00:00+00', '2028-05-20T22:00:00+00'),
  ('2028-05', 8, 'garmisch', '2028-05-20T22:00:00+00', '2028-05-22T22:00:00+00', '2028-05-23T22:00:00+00'),
  ('2028-05', 9, 'zakopane', '2028-05-23T22:00:00+00', '2028-05-24T22:00:00+00', '2028-05-25T22:00:00+00'),
  ('2028-05', 10, 'willingen', '2028-05-25T22:00:00+00', '2028-05-27T22:00:00+00', '2028-05-28T22:00:00+00'),
  ('2028-05', 11, 'planica-letalnica', '2028-05-28T22:00:00+00', '2028-05-30T22:00:00+00', '2028-05-31T22:00:00+00'),
  ('2028-06', 1, 'lahti', '2028-05-31T22:00:00+00', '2028-06-02T22:00:00+00', '2028-06-03T22:00:00+00'),
  ('2028-06', 2, 'zakopane', '2028-06-03T22:00:00+00', '2028-06-05T22:00:00+00', '2028-06-06T22:00:00+00'),
  ('2028-06', 3, 'willingen', '2028-06-06T22:00:00+00', '2028-06-08T22:00:00+00', '2028-06-09T22:00:00+00'),
  ('2028-06', 4, 'engelberg', '2028-06-09T22:00:00+00', '2028-06-11T22:00:00+00', '2028-06-12T22:00:00+00'),
  ('2028-06', 5, 'planica-srednja', '2028-06-12T22:00:00+00', '2028-06-14T22:00:00+00', '2028-06-15T22:00:00+00'),
  ('2028-06', 6, 'innsbruck', '2028-06-15T22:00:00+00', '2028-06-17T22:00:00+00', '2028-06-18T22:00:00+00'),
  ('2028-06', 7, 'kulm', '2028-06-18T22:00:00+00', '2028-06-20T22:00:00+00', '2028-06-21T22:00:00+00'),
  ('2028-06', 8, 'planica-velika', '2028-06-21T22:00:00+00', '2028-06-23T22:00:00+00', '2028-06-24T22:00:00+00'),
  ('2028-06', 9, 'oberstdorf', '2028-06-24T22:00:00+00', '2028-06-26T22:00:00+00', '2028-06-27T22:00:00+00'),
  ('2028-06', 10, 'planica-letalnica', '2028-06-27T22:00:00+00', '2028-06-29T22:00:00+00', '2028-06-30T22:00:00+00'),
  ('2028-07', 1, 'willingen', '2028-06-30T22:00:00+00', '2028-07-02T22:00:00+00', '2028-07-03T22:00:00+00'),
  ('2028-07', 2, 'zakopane', '2028-07-03T22:00:00+00', '2028-07-05T22:00:00+00', '2028-07-06T22:00:00+00'),
  ('2028-07', 3, 'innsbruck', '2028-07-06T22:00:00+00', '2028-07-07T22:00:00+00', '2028-07-08T22:00:00+00'),
  ('2028-07', 4, 'garmisch', '2028-07-08T22:00:00+00', '2028-07-10T22:00:00+00', '2028-07-11T22:00:00+00'),
  ('2028-07', 5, 'planica-velika', '2028-07-11T22:00:00+00', '2028-07-13T22:00:00+00', '2028-07-14T22:00:00+00'),
  ('2028-07', 6, 'bischofshofen', '2028-07-14T22:00:00+00', '2028-07-16T22:00:00+00', '2028-07-17T22:00:00+00'),
  ('2028-07', 7, 'oberstdorf-letalnica', '2028-07-17T22:00:00+00', '2028-07-19T22:00:00+00', '2028-07-20T22:00:00+00'),
  ('2028-07', 8, 'engelberg', '2028-07-20T22:00:00+00', '2028-07-22T22:00:00+00', '2028-07-23T22:00:00+00'),
  ('2028-07', 9, 'planica-srednja', '2028-07-23T22:00:00+00', '2028-07-24T22:00:00+00', '2028-07-25T22:00:00+00'),
  ('2028-07', 10, 'oberstdorf', '2028-07-25T22:00:00+00', '2028-07-27T22:00:00+00', '2028-07-28T22:00:00+00'),
  ('2028-07', 11, 'planica-letalnica', '2028-07-28T22:00:00+00', '2028-07-30T22:00:00+00', '2028-07-31T22:00:00+00'),
  ('2028-08', 1, 'bischofshofen', '2028-07-31T22:00:00+00', '2028-08-02T22:00:00+00', '2028-08-03T22:00:00+00'),
  ('2028-08', 2, 'engelberg', '2028-08-03T22:00:00+00', '2028-08-05T22:00:00+00', '2028-08-06T22:00:00+00'),
  ('2028-08', 3, 'innsbruck', '2028-08-06T22:00:00+00', '2028-08-07T22:00:00+00', '2028-08-08T22:00:00+00'),
  ('2028-08', 4, 'oberstdorf', '2028-08-08T22:00:00+00', '2028-08-10T22:00:00+00', '2028-08-11T22:00:00+00'),
  ('2028-08', 5, 'planica-srednja', '2028-08-11T22:00:00+00', '2028-08-13T22:00:00+00', '2028-08-14T22:00:00+00'),
  ('2028-08', 6, 'lahti', '2028-08-14T22:00:00+00', '2028-08-16T22:00:00+00', '2028-08-17T22:00:00+00'),
  ('2028-08', 7, 'vikersund', '2028-08-17T22:00:00+00', '2028-08-19T22:00:00+00', '2028-08-20T22:00:00+00'),
  ('2028-08', 8, 'planica-velika', '2028-08-20T22:00:00+00', '2028-08-22T22:00:00+00', '2028-08-23T22:00:00+00'),
  ('2028-08', 9, 'zakopane', '2028-08-23T22:00:00+00', '2028-08-24T22:00:00+00', '2028-08-25T22:00:00+00'),
  ('2028-08', 10, 'willingen', '2028-08-25T22:00:00+00', '2028-08-27T22:00:00+00', '2028-08-28T22:00:00+00'),
  ('2028-08', 11, 'oberstdorf-letalnica', '2028-08-28T22:00:00+00', '2028-08-30T22:00:00+00', '2028-08-31T22:00:00+00'),
  ('2028-09', 1, 'willingen', '2028-08-31T22:00:00+00', '2028-09-02T22:00:00+00', '2028-09-03T22:00:00+00'),
  ('2028-09', 2, 'bischofshofen', '2028-09-03T22:00:00+00', '2028-09-05T22:00:00+00', '2028-09-06T22:00:00+00'),
  ('2028-09', 3, 'zakopane', '2028-09-06T22:00:00+00', '2028-09-08T22:00:00+00', '2028-09-09T22:00:00+00'),
  ('2028-09', 4, 'engelberg', '2028-09-09T22:00:00+00', '2028-09-11T22:00:00+00', '2028-09-12T22:00:00+00'),
  ('2028-09', 5, 'oberstdorf', '2028-09-12T22:00:00+00', '2028-09-14T22:00:00+00', '2028-09-15T22:00:00+00'),
  ('2028-09', 6, 'lahti', '2028-09-15T22:00:00+00', '2028-09-17T22:00:00+00', '2028-09-18T22:00:00+00'),
  ('2028-09', 7, 'vikersund', '2028-09-18T22:00:00+00', '2028-09-20T22:00:00+00', '2028-09-21T22:00:00+00'),
  ('2028-09', 8, 'garmisch', '2028-09-21T22:00:00+00', '2028-09-23T22:00:00+00', '2028-09-24T22:00:00+00'),
  ('2028-09', 9, 'planica-srednja', '2028-09-24T22:00:00+00', '2028-09-26T22:00:00+00', '2028-09-27T22:00:00+00'),
  ('2028-09', 10, 'oberstdorf-letalnica', '2028-09-27T22:00:00+00', '2028-09-29T22:00:00+00', '2028-09-30T22:00:00+00'),
  ('2028-10', 1, 'planica-srednja', '2028-09-30T22:00:00+00', '2028-10-02T22:00:00+00', '2028-10-03T22:00:00+00'),
  ('2028-10', 2, 'innsbruck', '2028-10-03T22:00:00+00', '2028-10-05T22:00:00+00', '2028-10-06T22:00:00+00'),
  ('2028-10', 3, 'bischofshofen', '2028-10-06T22:00:00+00', '2028-10-07T22:00:00+00', '2028-10-08T22:00:00+00'),
  ('2028-10', 4, 'lahti', '2028-10-08T22:00:00+00', '2028-10-10T22:00:00+00', '2028-10-11T22:00:00+00'),
  ('2028-10', 5, 'oberstdorf-letalnica', '2028-10-11T22:00:00+00', '2028-10-13T22:00:00+00', '2028-10-14T22:00:00+00'),
  ('2028-10', 6, 'engelberg', '2028-10-14T22:00:00+00', '2028-10-16T22:00:00+00', '2028-10-17T22:00:00+00'),
  ('2028-10', 7, 'zakopane', '2028-10-17T22:00:00+00', '2028-10-19T22:00:00+00', '2028-10-20T22:00:00+00'),
  ('2028-10', 8, 'willingen', '2028-10-20T22:00:00+00', '2028-10-22T22:00:00+00', '2028-10-23T22:00:00+00'),
  ('2028-10', 9, 'planica-velika', '2028-10-23T22:00:00+00', '2028-10-24T22:00:00+00', '2028-10-25T22:00:00+00'),
  ('2028-10', 10, 'garmisch', '2028-10-25T22:00:00+00', '2028-10-27T22:00:00+00', '2028-10-28T22:00:00+00'),
  ('2028-10', 11, 'planica-letalnica', '2028-10-28T22:00:00+00', '2028-10-30T23:00:00+00', '2028-10-31T23:00:00+00'),
  ('2028-11', 1, 'planica-velika', '2028-10-31T23:00:00+00', '2028-11-02T23:00:00+00', '2028-11-03T23:00:00+00'),
  ('2028-11', 2, 'lahti', '2028-11-03T23:00:00+00', '2028-11-05T23:00:00+00', '2028-11-06T23:00:00+00'),
  ('2028-11', 3, 'planica-srednja', '2028-11-06T23:00:00+00', '2028-11-08T23:00:00+00', '2028-11-09T23:00:00+00'),
  ('2028-11', 4, 'oberstdorf', '2028-11-09T23:00:00+00', '2028-11-11T23:00:00+00', '2028-11-12T23:00:00+00'),
  ('2028-11', 5, 'zakopane', '2028-11-12T23:00:00+00', '2028-11-14T23:00:00+00', '2028-11-15T23:00:00+00'),
  ('2028-11', 6, 'willingen', '2028-11-15T23:00:00+00', '2028-11-17T23:00:00+00', '2028-11-18T23:00:00+00'),
  ('2028-11', 7, 'vikersund', '2028-11-18T23:00:00+00', '2028-11-20T23:00:00+00', '2028-11-21T23:00:00+00'),
  ('2028-11', 8, 'engelberg', '2028-11-21T23:00:00+00', '2028-11-23T23:00:00+00', '2028-11-24T23:00:00+00'),
  ('2028-11', 9, 'garmisch', '2028-11-24T23:00:00+00', '2028-11-26T23:00:00+00', '2028-11-27T23:00:00+00'),
  ('2028-11', 10, 'planica-letalnica', '2028-11-27T23:00:00+00', '2028-11-29T23:00:00+00', '2028-11-30T23:00:00+00'),
  ('2028-12', 1, 'willingen', '2028-11-30T23:00:00+00', '2028-12-02T23:00:00+00', '2028-12-03T23:00:00+00'),
  ('2028-12', 2, 'lahti', '2028-12-03T23:00:00+00', '2028-12-05T23:00:00+00', '2028-12-06T23:00:00+00'),
  ('2028-12', 3, 'zakopane', '2028-12-06T23:00:00+00', '2028-12-07T23:00:00+00', '2028-12-08T23:00:00+00'),
  ('2028-12', 4, 'vikersund', '2028-12-08T23:00:00+00', '2028-12-10T23:00:00+00', '2028-12-11T23:00:00+00'),
  ('2028-12', 5, 'planica-velika', '2028-12-11T23:00:00+00', '2028-12-13T23:00:00+00', '2028-12-14T23:00:00+00'),
  ('2028-12', 6, 'planica-srednja', '2028-12-14T23:00:00+00', '2028-12-16T23:00:00+00', '2028-12-17T23:00:00+00'),
  ('2028-12', 7, 'oberstdorf', '2028-12-17T23:00:00+00', '2028-12-19T23:00:00+00', '2028-12-20T23:00:00+00'),
  ('2028-12', 8, 'garmisch', '2028-12-20T23:00:00+00', '2028-12-22T23:00:00+00', '2028-12-23T23:00:00+00'),
  ('2028-12', 9, 'innsbruck', '2028-12-23T23:00:00+00', '2028-12-24T23:00:00+00', '2028-12-25T23:00:00+00'),
  ('2028-12', 10, 'bischofshofen', '2028-12-25T23:00:00+00', '2028-12-27T23:00:00+00', '2028-12-28T23:00:00+00'),
  ('2028-12', 11, 'oberstdorf-letalnica', '2028-12-28T23:00:00+00', '2028-12-30T23:00:00+00', '2028-12-31T23:00:00+00')
on conflict (season, event) do update set hill = excluded.hill, opens_at = excluded.opens_at, r2_at = excluded.r2_at, closes_at = excluded.closes_at;
-- CUP_EVENTS:END
