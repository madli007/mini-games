-- =====================================================================
--  MINI GAMES hub — shema baze (Supabase / Postgres)
--
--  Idempotentna: lahko jo poženeš večkrat (SQL editor → Run).
--  Tabele pinballa (public.scores) se NE dotika.
--
--  Varnostni model: anon/publishable ključ je javen, zato je vsa zaščita
--  v RLS pravilih in v pravicah na stolpcih. Kritične operacije (XP,
--  ustvarjanje sob, pridružitev, prenos hosta) gredo samo prek RPC funkcij.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Pomožno: samodejni updated_at
-- ---------------------------------------------------------------------
create or replace function public.mg_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Neizpostavljena shema za security definer funkcije (PostgREST je ne vidi).
-- V public so le tanke security invoker ovojnice, ki jih kličejo klienti.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- =====================================================================
--  PROFILES
-- =====================================================================
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nickname    text not null check (char_length(nickname) between 2 and 16 and nickname = btrim(nickname)),
  avatar      jsonb not null default '{"emoji":"🙂","color":"#ffd23f"}'::jsonb
              check (jsonb_typeof(avatar) = 'object' and pg_column_size(avatar) < 300),
  xp          int not null default 0 check (xp >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists profiles_nickname_lower on public.profiles (lower(nickname));
create index if not exists profiles_xp on public.profiles (xp desc);

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.mg_touch_updated_at();

alter table public.profiles enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and xp = 0);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- pravice na stolpcih: xp se ne da pisati neposredno (samo award_xp)
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, nickname, avatar) on table public.profiles to authenticated;
grant update (nickname, avatar) on table public.profiles to authenticated;

-- =====================================================================
--  XP (dnevnik + RPC award_xp)
-- =====================================================================
create table if not exists public.xp_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  amount      int not null check (amount > 0),
  reason      text,
  created_at  timestamptz not null default now()
);
create index if not exists xp_log_user_day on public.xp_log (user_id, day);

alter table public.xp_log enable row level security;
drop policy if exists xp_log_select on public.xp_log;
create policy xp_log_select on public.xp_log for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.xp_log from anon, authenticated;
grant select on table public.xp_log to authenticated;

-- Omejitve: največ 500 XP na klic in 5000 XP na dan (Europe/Ljubljana).
create or replace function private.award_xp(amount int, reason text default null)
returns json language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  uid     uuid := auth.uid();
  d       date := (now() at time zone 'Europe/Ljubljana')::date;
  used    int;
  granted int;
  new_xp  int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;

  if amount is null or amount <= 0 then
    select p.xp into new_xp from public.profiles p where p.id = uid;
    return json_build_object('xp', new_xp, 'granted', 0);
  end if;

  select coalesce(sum(l.amount), 0) into used
    from public.xp_log l where l.user_id = uid and l.day = d;
  granted := least(amount, 500, greatest(0, 5000 - used));

  if granted > 0 then
    insert into public.xp_log (user_id, day, amount, reason)
      values (uid, d, granted, left(reason, 80));
    update public.profiles p set xp = p.xp + granted where p.id = uid returning p.xp into new_xp;
  else
    select p.xp into new_xp from public.profiles p where p.id = uid;
  end if;
  return json_build_object('xp', new_xp, 'granted', granted);
end $$;
revoke all on function private.award_xp(int, text) from public, anon;
grant execute on function private.award_xp(int, text) to authenticated;

create or replace function public.award_xp(amount int, reason text default null)
returns json language sql security invoker set search_path = '' as $
  select private.award_xp(amount, reason);
$;
revoke all on function public.award_xp(int, text) from public, anon;
grant execute on function public.award_xp(int, text) to authenticated;

-- =====================================================================
--  GAME_SCORES (lestvice; »na časten način«)
-- =====================================================================
create table if not exists public.game_scores (
  id          bigint generated always as identity primary key,
  game        text not null check (game ~ '^[a-z0-9-]{1,32}$'),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  score       int not null,
  seed        text check (seed is null or char_length(seed) <= 64),
  meta        jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 2000),
  created_at  timestamptz not null default now()
);
create index if not exists game_scores_board on public.game_scores (game, seed, score desc);
create index if not exists game_scores_user on public.game_scores (user_id, game);

alter table public.game_scores enable row level security;
drop policy if exists game_scores_select on public.game_scores;
create policy game_scores_select on public.game_scores for select to authenticated using (true);
drop policy if exists game_scores_insert on public.game_scores;
create policy game_scores_insert on public.game_scores for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on table public.game_scores from anon, authenticated;
grant select on table public.game_scores to authenticated;
grant insert (game, score, seed, meta) on table public.game_scores to authenticated;

-- Lestvica: najboljši rezultat vsakega igralca.
--   p_seed null  → vsi rezultati igre (ne glede na seed)
--   p_since      → samo rezultati od tega trenutka naprej (danes / teden)
--   p_asc true   → manjši rezultat je boljši (npr. čas)
create or replace function public.get_leaderboard(
  p_game text, p_seed text default null, p_since timestamptz default null,
  p_limit int default 10, p_asc boolean default false)
returns table (user_id uuid, nickname text, avatar jsonb, score int, created_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select b.user_id, p.nickname, p.avatar, b.score, b.created_at
  from (
    select distinct on (s.user_id) s.user_id, s.score, s.created_at
    from public.game_scores s
    where s.game = p_game
      and (p_seed is null or s.seed = p_seed)
      and (p_since is null or s.created_at >= p_since)
    order by s.user_id,
             case when p_asc then s.score end asc,
             case when not p_asc then s.score end desc,
             s.created_at asc
  ) b
  join public.profiles p on p.id = b.user_id
  order by case when p_asc then b.score end asc,
           case when not p_asc then b.score end desc,
           b.created_at asc
  limit least(greatest(coalesce(p_limit, 10), 1), 100);
$$;
revoke all on function public.get_leaderboard(text, text, timestamptz, int, boolean) from public, anon;
grant execute on function public.get_leaderboard(text, text, timestamptz, int, boolean) to authenticated;

-- =====================================================================
--  ACHIEVEMENTS
-- =====================================================================
create table if not exists public.achievements (
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  game         text not null check (game ~ '^[a-z0-9-]{1,32}$'),
  key          text not null check (key ~ '^[a-z0-9_-]{1,40}$'),
  title        text check (title is null or char_length(title) <= 60),
  icon         text check (icon is null or char_length(icon) <= 16),
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, game, key)
);
alter table public.achievements add column if not exists title text;
alter table public.achievements add column if not exists icon text;

alter table public.achievements enable row level security;
drop policy if exists achievements_select on public.achievements;
create policy achievements_select on public.achievements for select to authenticated using (true);
drop policy if exists achievements_insert on public.achievements;
create policy achievements_insert on public.achievements for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on table public.achievements from anon, authenticated;
grant select on table public.achievements to authenticated;
grant insert (game, key, title, icon) on table public.achievements to authenticated;

-- =====================================================================
--  ROOMS + ROOM_PLAYERS
-- =====================================================================
create table if not exists public.rooms (
  code         text primary key check (code ~ '^[A-HJ-NP-Z2-9]{4}$'),  -- brez I, O, 0, 1
  game         text not null check (game ~ '^[a-z0-9-]{1,32}$'),
  host_id      uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  max_players  int not null default 10 check (max_players between 1 and 16),
  settings     jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 8000),
  is_public    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists rooms_lobbies on public.rooms (status, is_public, updated_at desc);
create index if not exists rooms_host on public.rooms (host_id);
create index if not exists rooms_updated on public.rooms (updated_at);

drop trigger if exists rooms_touch on public.rooms;
create trigger rooms_touch before update on public.rooms
  for each row execute function public.mg_touch_updated_at();

create table if not exists public.room_players (
  room_code  text not null references public.rooms(code) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (room_code, user_id)
);
create index if not exists room_players_user on public.room_players (user_id);

-- Ali je trenutni uporabnik v sobi? (security definer, da RLS ne kroži)
create or replace function private.is_room_member(p_code text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.room_players rp
    where rp.room_code = p_code and rp.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_room_member(text) from public, anon;
grant execute on function private.is_room_member(text) to authenticated;

alter table public.rooms enable row level security;
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms for select to authenticated
  using (is_public or host_id = (select auth.uid()) or private.is_room_member(code));
drop policy if exists rooms_update on public.rooms;
create policy rooms_update on public.rooms for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
drop policy if exists rooms_delete on public.rooms;
create policy rooms_delete on public.rooms for delete to authenticated
  using (host_id = (select auth.uid()));
revoke all on table public.rooms from anon, authenticated;
grant select, delete on table public.rooms to authenticated;
-- host_id in code se ne da spremeniti neposredno (prenos hosta: claim_host)
grant update (status, settings, is_public, max_players) on table public.rooms to authenticated;

alter table public.room_players enable row level security;
drop policy if exists room_players_select on public.room_players;
create policy room_players_select on public.room_players for select to authenticated using (true);
drop policy if exists room_players_delete on public.room_players;
create policy room_players_delete on public.room_players for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.rooms r where r.code = room_code and r.host_id = (select auth.uid()))
  );
revoke all on table public.room_players from anon, authenticated;
grant select, delete on table public.room_players to authenticated;
-- vstavljanje samo prek create_room / join_room

-- Ustvari sobo z naključno kodo (4 znaki brez zamenljivih) in dodaj hosta.
create or replace function private.create_room(
  p_game text, p_max_players int default 10, p_settings jsonb default '{}'::jsonb, p_is_public boolean default true)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  uid      uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  c        text;
  r        public.rooms;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then raise exception 'no_profile'; end if;
  if (select count(*) from public.rooms x where x.host_id = uid and x.status <> 'finished'
        and x.updated_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_rooms';
  end if;
  -- sproti počisti stare sobe (če pg_cron ni na voljo)
  delete from public.rooms x where x.updated_at < now() - interval '24 hours';

  for attempt in 1..30 loop
    c := '';
    for i in 1..4 loop
      c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    begin
      insert into public.rooms (code, game, host_id, max_players, settings, is_public)
        values (c, p_game, uid, least(greatest(coalesce(p_max_players, 10), 1), 16),
                coalesce(p_settings, '{}'::jsonb), coalesce(p_is_public, true))
        returning * into r;
      insert into public.room_players (room_code, user_id) values (c, uid);
      return r;
    exception when unique_violation then
      -- koda zasedena, poskusi znova
    end;
  end loop;
  raise exception 'no_free_code';
end $$;
revoke all on function private.create_room(text, int, jsonb, boolean) from public, anon;
grant execute on function private.create_room(text, int, jsonb, boolean) to authenticated;

create or replace function public.create_room(
  p_game text, p_max_players int default 10, p_settings jsonb default '{}'::jsonb, p_is_public boolean default true)
returns public.rooms language sql security invoker set search_path = '' as $
  select * from private.create_room(p_game, p_max_players, p_settings, p_is_public);
$;
revoke all on function public.create_room(text, int, jsonb, boolean) from public, anon;
grant execute on function public.create_room(text, int, jsonb, boolean) to authenticated;

-- Pridruži se sobi. Napake: room_not_found, room_started, room_full.
-- Kdor je že v sobi (osvežitev strani), se lahko vrne tudi med igro.
create or replace function private.join_room(p_code text)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  r   public.rooms;
  n   int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then raise exception 'no_profile'; end if;
  select * into r from public.rooms x where x.code = upper(btrim(p_code)) for update;
  if not found then raise exception 'room_not_found'; end if;
  if exists (select 1 from public.room_players rp where rp.room_code = r.code and rp.user_id = uid) then
    return r;
  end if;
  if r.status <> 'lobby' then raise exception 'room_started'; end if;
  select count(*) into n from public.room_players rp where rp.room_code = r.code;
  if n >= r.max_players then raise exception 'room_full'; end if;
  insert into public.room_players (room_code, user_id) values (r.code, uid);
  update public.rooms x set updated_at = now() where x.code = r.code returning * into r;
  return r;
end $$;
revoke all on function private.join_room(text) from public, anon;
grant execute on function private.join_room(text) to authenticated;

create or replace function public.join_room(p_code text)
returns public.rooms language sql security invoker set search_path = '' as $
  select * from private.join_room(p_code);
$;
revoke all on function public.join_room(text) from public, anon;
grant execute on function public.join_room(text) to authenticated;

-- Poišči sobo po kodi (tudi zasebno) — za »Pridruži se s kodo« na dashboardu.
create or replace function private.find_room(p_code text)
returns table (code text, game text, status text, max_players int, players int, host_nickname text)
language sql stable security definer set search_path = '' as $$
  select r.code, r.game, r.status, r.max_players,
         (select count(*)::int from public.room_players rp where rp.room_code = r.code),
         (select p.nickname from public.profiles p where p.id = r.host_id)
  from public.rooms r
  where r.code = upper(btrim(p_code)) and (select auth.uid()) is not null;
$$;
revoke all on function private.find_room(text) from public, anon;
grant execute on function private.find_room(text) to authenticated;

create or replace function public.find_room(p_code text)
returns table (code text, game text, status text, max_players int, players int, host_nickname text)
language sql security invoker set search_path = '' as $
  select * from private.find_room(p_code);
$;
revoke all on function public.find_room(text) from public, anon;
grant execute on function public.find_room(text) to authenticated;

-- Prenos hosta: prevzame ga lahko le naslednji v vrsti (najstarejši joined_at
-- med igralci, ki niso trenutni host). Odsotnost hosta zazna klient (presence).
create or replace function private.claim_host(p_code text)
returns public.rooms language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  r    public.rooms;
  nxt  uuid;
begin
  select * into r from public.rooms x where x.code = p_code for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.host_id = uid then return r; end if;
  select rp.user_id into nxt from public.room_players rp
    where rp.room_code = r.code and rp.user_id <> r.host_id
    order by rp.joined_at asc, rp.user_id asc limit 1;
  if not exists (select 1 from public.room_players rp where rp.room_code = r.code and rp.user_id = uid) then
    raise exception 'not_next_host';
  end if;
  -- naslednji v vrsti lahko prevzame vedno; ostali člani le, če je host zapustil sobo
  -- ali soba »zastara« (host je ni dotaknil 30 s)
  if nxt is distinct from uid
     and exists (select 1 from public.room_players rp where rp.room_code = r.code and rp.user_id = r.host_id)
     and r.updated_at > now() - interval '30 seconds' then
    raise exception 'not_next_host';
  end if;
  update public.rooms x set host_id = uid where x.code = r.code returning * into r;
  return r;
end $$;
revoke all on function private.claim_host(text) from public, anon;
grant execute on function private.claim_host(text) to authenticated;

create or replace function public.claim_host(p_code text)
returns public.rooms language sql security invoker set search_path = '' as $
  select * from private.claim_host(p_code);
$;
revoke all on function public.claim_host(text) from public, anon;
grant execute on function public.claim_host(text) to authenticated;

-- Javni lobbyji (za dashboard). Upošteva RLS (security invoker).
create or replace function public.list_lobbies(p_fresh_minutes int default 3)
returns table (code text, game text, host_id uuid, host_nickname text, host_avatar jsonb,
               players int, max_players int, created_at timestamptz, updated_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select r.code, r.game, r.host_id, p.nickname, p.avatar,
         (select count(*)::int from public.room_players rp where rp.room_code = r.code),
         r.max_players, r.created_at, r.updated_at
  from public.rooms r
  join public.profiles p on p.id = r.host_id
  where r.status = 'lobby' and r.is_public
    and r.updated_at > now() - make_interval(mins => least(greatest(coalesce(p_fresh_minutes, 3), 1), 1440))
  order by r.created_at desc
  limit 50;
$$;
revoke all on function public.list_lobbies(int) from public, anon;
grant execute on function public.list_lobbies(int) to authenticated;

-- =====================================================================
--  ROOM_STATE (ena vrstica stanja na sobo, optimistično zaklepanje)
-- =====================================================================
create table if not exists public.room_state (
  room_code   text primary key references public.rooms(code) on delete cascade,
  state       jsonb not null default '{}'::jsonb check (pg_column_size(state) < 262144),
  version     int not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.room_state enable row level security;
drop policy if exists room_state_select on public.room_state;
create policy room_state_select on public.room_state for select to authenticated
  using (private.is_room_member(room_code));
drop policy if exists room_state_insert on public.room_state;
create policy room_state_insert on public.room_state for insert to authenticated
  with check (private.is_room_member(room_code));
drop policy if exists room_state_update on public.room_state;
create policy room_state_update on public.room_state for update to authenticated
  using (private.is_room_member(room_code)) with check (private.is_room_member(room_code));
revoke all on table public.room_state from anon, authenticated;
grant select, insert, update on table public.room_state to authenticated;

-- Zapiši stanje. p_expected_version null = brez preverjanja;
-- sicer napaka 'version_conflict', če se verzija ne ujema. Vrne novo verzijo.
create or replace function public.set_room_state(p_code text, p_state jsonb, p_expected_version int default null)
returns int language plpgsql security invoker set search_path = '' as $$
declare v int;
begin
  if p_expected_version is null then
    insert into public.room_state as rs (room_code, state, version) values (p_code, p_state, 1)
      on conflict (room_code) do update set state = excluded.state, version = rs.version + 1, updated_at = now()
      returning rs.version into v;
  elsif p_expected_version = 0 then
    insert into public.room_state (room_code, state, version) values (p_code, p_state, 1)
      on conflict (room_code) do nothing
      returning version into v;
  else
    update public.room_state rs set state = p_state, version = rs.version + 1, updated_at = now()
      where rs.room_code = p_code and rs.version = p_expected_version
      returning rs.version into v;
  end if;
  if v is null then raise exception 'version_conflict'; end if;
  return v;
end $$;
revoke all on function public.set_room_state(text, jsonb, int) from public, anon;
grant execute on function public.set_room_state(text, jsonb, int) to authenticated;

-- =====================================================================
--  MOVES (potezne igre, replay)
-- =====================================================================
create table if not exists public.moves (
  id          bigint generated always as identity primary key,
  room_code   text not null references public.rooms(code) on delete cascade,
  seq         int not null,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  move        jsonb not null check (pg_column_size(move) < 16384),
  created_at  timestamptz not null default now(),
  unique (room_code, seq)
);
create index if not exists moves_user on public.moves (user_id);

alter table public.moves enable row level security;
drop policy if exists moves_select on public.moves;
create policy moves_select on public.moves for select to authenticated
  using (private.is_room_member(room_code));
drop policy if exists moves_insert on public.moves;
create policy moves_insert on public.moves for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_room_member(room_code));
revoke all on table public.moves from anon, authenticated;
grant select on table public.moves to authenticated;
grant insert (room_code, seq, move) on table public.moves to authenticated;

-- Dodaj potezo z naslednjo zaporedno številko. Vrne seq.
create or replace function public.push_move(p_code text, p_move jsonb)
returns int language plpgsql security invoker set search_path = '' as $$
declare s int;
begin
  for attempt in 1..10 loop
    select coalesce(max(m.seq), 0) + 1 into s from public.moves m where m.room_code = p_code;
    begin
      insert into public.moves (room_code, seq, move) values (p_code, s, p_move);
      return s;
    exception when unique_violation then
      -- nekdo je bil hitrejši, poskusi znova
    end;
  end loop;
  raise exception 'move_conflict';
end $$;
revoke all on function public.push_move(text, jsonb) from public, anon;
grant execute on function public.push_move(text, jsonb) to authenticated;

-- =====================================================================
--  REALTIME: spremembe sob (seznam lobbyjev na dashboardu)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_players') then
    alter publication supabase_realtime add table public.room_players;
  end if;
end $$;

-- =====================================================================
--  ČIŠČENJE STARIH SOB (> 24 h)
-- =====================================================================
create or replace function private.cleanup_old_rooms()
returns int language sql security definer set search_path = '' as $$
  with d as (delete from public.rooms r where r.updated_at < now() - interval '24 hours' returning 1)
  select count(*)::int from d;
$$;
revoke all on function private.cleanup_old_rooms() from public, anon, authenticated;

-- pg_cron (če je na voljo): vsako uro. Sicer: ročno `select private.cleanup_old_rooms();`
-- (create_room stare sobe počisti tudi sproti).
do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron ni na voljo: %', sqlerrm;
  end;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('mg_cleanup_rooms', '17 * * * *', 'select private.cleanup_old_rooms()');
  end if;
end $$;

-- Odstrani stare verzije iz public (iz prejšnjih zagonov sheme).
drop function if exists public.is_room_member(text);
drop function if exists public.cleanup_old_rooms();
