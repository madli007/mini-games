-- =====================================================================
--  HRČKOVA KROGLA — ghosti (posnetki najboljših voženj) za način Na čas + proge skupnosti (spodaj)
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

-- =====================================================================
--  PROGE SKUPNOSTI (urejevalnik prog → »🌍 Objavi«)
--  krogla_custom_levels — objavljene lastne proge; berejo vsi prijavljeni, avtor jih lahko izbriše,
--                         objava/posodobitev SAMO prek RPC krogla_publish_level (omejitve velikosti in števila).
--  krogla_custom_plays  — kdo je progo igral (en zapis na igralca) → števec plays.
--  Lestvica proge: public.game_scores z game = 'krogla', seed = 'custom:<id>' (brez spremembe sheme huba).
-- =====================================================================

create table if not exists public.krogla_custom_levels (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 2 and 40),
  hash        text not null check (hash ~ '^[0-9a-f]{8}$'),
  data        jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 60000),
  dev_ms      int not null check (dev_ms > 0 and dev_ms < 600000),
  width       smallint not null check (width between 1 and 120),
  depth       smallint not null check (depth between 1 and 160),
  plays       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, hash)
);
create index if not exists krogla_custom_levels_new on public.krogla_custom_levels (created_at desc);
create index if not exists krogla_custom_levels_popular on public.krogla_custom_levels (plays desc, created_at desc);

alter table public.krogla_custom_levels enable row level security;
drop policy if exists krogla_custom_levels_select on public.krogla_custom_levels;
create policy krogla_custom_levels_select on public.krogla_custom_levels for select to authenticated using (true);
drop policy if exists krogla_custom_levels_delete on public.krogla_custom_levels;
create policy krogla_custom_levels_delete on public.krogla_custom_levels for delete to authenticated using (user_id = (select auth.uid()));
-- brez insert/update pravil: objava samo prek private.krogla_publish_level
revoke all on table public.krogla_custom_levels from anon, authenticated;
grant select, delete on table public.krogla_custom_levels to authenticated;

create table if not exists public.krogla_custom_plays (
  level_id    uuid not null references public.krogla_custom_levels(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (level_id, user_id)
);
create index if not exists krogla_custom_plays_user on public.krogla_custom_plays (user_id);
alter table public.krogla_custom_plays enable row level security;
drop policy if exists krogla_custom_plays_select on public.krogla_custom_plays;
create policy krogla_custom_plays_select on public.krogla_custom_plays for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.krogla_custom_plays from anon, authenticated;
grant select on table public.krogla_custom_plays to authenticated;

-- Objavi progo (ali posodobi ime/podatke, če ima igralec že progo z istim hash).
-- p_replace: id moje starejše objave, ki jo nova različica nadomesti (se izbriše).
-- Napake: not_authenticated, no_profile, invalid_level, level_too_big, too_many_levels (največ 20 na igralca)
create or replace function private.krogla_publish_level(p_name text, p_hash text, p_data jsonb, p_dev_ms int, p_replace uuid default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  nm    text := btrim(coalesce(p_name, ''));
  w     int;
  d     int;
  cnt   int;
  lid   uuid;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid;
  if not found then raise exception 'no_profile'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or jsonb_typeof(p_data->'map') <> 'array'
     or char_length(nm) not between 2 and 40 or coalesce(p_hash, '') !~ '^[0-9a-f]{8}$'
     or p_dev_ms is null or p_dev_ms <= 0 or p_dev_ms >= 600000 then raise exception 'invalid_level'; end if;
  if octet_length(p_data::text) > 60000 then raise exception 'level_too_big'; end if;
  begin
    w := (p_data->'size'->>0)::int; d := (p_data->'size'->>1)::int;
  exception when others then raise exception 'invalid_level';
  end;
  if w is null or d is null or w not between 1 and 120 or d not between 1 and 160 then raise exception 'invalid_level'; end if;

  -- ista proga (hash) že objavljena: posodobi
  update public.krogla_custom_levels l set name = nm, data = p_data, dev_ms = p_dev_ms, width = w, depth = d, updated_at = now()
    where l.user_id = uid and l.hash = p_hash returning l.id into lid;
  if lid is not null then return json_build_object('id', lid, 'updated', true); end if;

  if p_replace is not null then delete from public.krogla_custom_levels l where l.id = p_replace and l.user_id = uid; end if;
  select count(*) into cnt from public.krogla_custom_levels l where l.user_id = uid;
  if cnt >= 20 then raise exception 'too_many_levels'; end if;
  insert into public.krogla_custom_levels (user_id, name, hash, data, dev_ms, width, depth)
    values (uid, nm, p_hash, p_data, p_dev_ms, w, d) returning id into lid;
  return json_build_object('id', lid, 'updated', false);
end $$;
revoke all on function private.krogla_publish_level(text, text, jsonb, int, uuid) from public, anon;
grant execute on function private.krogla_publish_level(text, text, jsonb, int, uuid) to authenticated;

create or replace function public.krogla_publish_level(p_name text, p_hash text, p_data jsonb, p_dev_ms int, p_replace uuid default null)
returns json language sql security invoker set search_path = '' as $$
  select private.krogla_publish_level(p_name, p_hash, p_data, p_dev_ms, p_replace);
$$;
revoke all on function public.krogla_publish_level(text, text, jsonb, int, uuid) from public, anon;
grant execute on function public.krogla_publish_level(text, text, jsonb, int, uuid) to authenticated;

-- Zabeleži igranje (vsak igralec šteje enkrat na progo). Vrne true, če je bilo prvo igranje.
create or replace function private.krogla_level_played(p_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid;
  if not found then raise exception 'no_profile'; end if;
  insert into public.krogla_custom_plays (level_id, user_id)
    select l.id, uid from public.krogla_custom_levels l where l.id = p_id
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.krogla_custom_levels l set plays = l.plays + 1 where l.id = p_id; end if;
  return n > 0;
end $$;
revoke all on function private.krogla_level_played(uuid) from public, anon;
grant execute on function private.krogla_level_played(uuid) to authenticated;

create or replace function public.krogla_level_played(p_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select private.krogla_level_played(p_id);
$$;
revoke all on function public.krogla_level_played(uuid) from public, anon;
grant execute on function public.krogla_level_played(uuid) to authenticated;

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
