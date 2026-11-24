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
  ('oberstdorf-letalnica', 282, 260)
on conflict (hill) do update set max_points = excluded.max_points, max_dist = excluded.max_dist;
-- END HILLS
