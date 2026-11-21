-- =====================================================================
--  HRČKOVA KROGLA — ghosti (posnetki najboljših voženj) za način Na čas
--  Idempotentno: lahko se požene večkrat. Zahteva supabase/schema.sql (profiles, shema private).
--
--  krogla_levels  — proge in zlati časi (za zavrnitev nemogočih časov); blok spodaj
--                   piše tools/krogla-levels.mjs
--  krogla_ghosts  — en ghost na (igralec, proga, zrcalo); berejo vsi prijavljeni,
--                   piše se SAMO prek RPC krogla_save_ghost (le boljši čas, omejena velikost).
-- =====================================================================

create table if not exists public.krogla_levels (
  level    text primary key check (level ~ '^[0-9]{2}-[a-z0-9-]{1,40}$'),
  gold_ms  int not null check (gold_ms > 0)
);
alter table public.krogla_levels enable row level security;
drop policy if exists krogla_levels_select on public.krogla_levels;
create policy krogla_levels_select on public.krogla_levels for select to authenticated using (true);
revoke all on table public.krogla_levels from anon, authenticated;
grant select on table public.krogla_levels to authenticated;

create table if not exists public.krogla_ghosts (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  level       text not null references public.krogla_levels(level) on delete cascade,
  mirror      boolean not null default false,
  time_ms     int not null check (time_ms > 0 and time_ms < 3600000),
  data        text not null check (char_length(data) <= 60000),
  created_at  timestamptz not null default now(),
  primary key (user_id, level, mirror)
);
create index if not exists krogla_ghosts_board on public.krogla_ghosts (level, mirror, time_ms);

alter table public.krogla_ghosts enable row level security;
drop policy if exists krogla_ghosts_select on public.krogla_ghosts;
create policy krogla_ghosts_select on public.krogla_ghosts for select to authenticated using (true);
-- brez insert/update/delete pravil: pisanje samo prek private.krogla_save_ghost
revoke all on table public.krogla_ghosts from anon, authenticated;
grant select on table public.krogla_ghosts to authenticated;

-- Shrani ghost, če je čas boljši od mojega prejšnjega na tej progi.
-- Napake: not_authenticated, no_profile, unknown_level, impossible_time (< 30 % zlatega časa), ghost_too_big
create or replace function private.krogla_save_ghost(p_level text, p_mirror boolean, p_time_ms int, p_data text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  gold  int;
  n     int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid;
  if not found then raise exception 'no_profile'; end if;
  select l.gold_ms into gold from public.krogla_levels l where l.level = p_level;
  if gold is null then raise exception 'unknown_level'; end if;
  if p_time_ms is null or p_time_ms < gold * 0.3 or p_time_ms >= 3600000 then raise exception 'impossible_time'; end if;
  if p_data is null or char_length(p_data) > 60000 or p_data !~ '^[A-Za-z0-9+/=]+$' then raise exception 'ghost_too_big'; end if;

  insert into public.krogla_ghosts as g (user_id, level, mirror, time_ms, data)
    values (uid, p_level, coalesce(p_mirror, false), p_time_ms, p_data)
  on conflict (user_id, level, mirror) do update
    set time_ms = excluded.time_ms, data = excluded.data, created_at = now()
    where g.time_ms > excluded.time_ms;
  get diagnostics n = row_count;
  return json_build_object('saved', n > 0);
end $$;
revoke all on function private.krogla_save_ghost(text, boolean, int, text) from public, anon;
grant execute on function private.krogla_save_ghost(text, boolean, int, text) to authenticated;

create or replace function public.krogla_save_ghost(p_level text, p_mirror boolean, p_time_ms int, p_data text)
returns json language sql security invoker set search_path = '' as $$
  select private.krogla_save_ghost(p_level, p_mirror, p_time_ms, p_data);
$$;
revoke all on function public.krogla_save_ghost(text, boolean, int, text) from public, anon;
grant execute on function public.krogla_save_ghost(text, boolean, int, text) to authenticated;

-- BEGIN LEVELS (tools/krogla-levels.mjs)
insert into public.krogla_levels (level, gold_ms) values
  ('01-ogrevanje', 17000),
  ('02-vrtnarija', 28000),
  ('03-skodelice', 19000),
  ('04-kuhinja', 45000),
  ('05-steklena-pot', 30000),
  ('06-tovarna', 27000),
  ('07-stolp', 34000),
  ('08-ledena-dvorana', 22000),
  ('09-nasilnezi', 18000),
  ('10-neon', 24000),
  ('11-nebo', 20000),
  ('12-nemogoce', 25000)
on conflict (level) do update set gold_ms = excluded.gold_ms;
-- END LEVELS
