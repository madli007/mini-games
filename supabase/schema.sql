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

-- kovanci, oprema (kozmetika) in niz dni igranja: NISO v grant update/insert,
-- spreminjajo se samo prek RPC (report_game, buy_item, equip, claim_quest …)
alter table public.profiles add column if not exists coins int not null default 0;
alter table public.profiles add column if not exists equipped jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists streak int not null default 0;
alter table public.profiles add column if not exists best_streak int not null default 0;
alter table public.profiles add column if not exists streak_day date;
do $$
begin
  alter table public.profiles add constraint profiles_coins_check check (coins >= 0);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.profiles add constraint profiles_equipped_check
    check (jsonb_typeof(equipped) = 'object' and pg_column_size(equipped) < 1000);
exception when duplicate_object then null;
end $$;

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
  lc      int := 0;
  coins   int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;

  if amount is null or amount <= 0 then
    select p.xp, p.coins into new_xp, coins from public.profiles p where p.id = uid;
    return json_build_object('xp', new_xp, 'granted', 0, 'coins', coins, 'level_coins', 0);
  end if;

  select coalesce(sum(l.amount), 0) into used
    from public.xp_log l where l.user_id = uid and l.day = d;
  granted := least(amount, 500, greatest(0, 5000 - used));

  if granted > 0 then
    insert into public.xp_log (user_id, day, amount, reason)
      values (uid, d, granted, left(reason, 80));
    update public.profiles p set xp = p.xp + granted where p.id = uid returning p.xp into new_xp;
    -- nagrada za vsak nov nivo (kovanci gredo skozi dnevno mejo)
    for l in private.mg_level(new_xp - granted) + 1 .. private.mg_level(new_xp) loop
      lc := lc + private.grant_coins(uid, least(5 * l, 100), 'level', l::text);
    end loop;
  else
    select p.xp into new_xp from public.profiles p where p.id = uid;
  end if;
  select p.coins into coins from public.profiles p where p.id = uid;
  return json_build_object('xp', new_xp, 'granted', granted, 'coins', coins, 'level_coins', lc);
end $$;
revoke all on function private.award_xp(int, text) from public, anon;
grant execute on function private.award_xp(int, text) to authenticated;

create or replace function public.award_xp(amount int, reason text default null)
returns json language sql security invoker set search_path = '' as $$
  select private.award_xp(amount, reason);
$$;
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
-- (drop: vrnjeni tip se je spremenil — dodan equipped)
drop function if exists public.get_leaderboard(text, text, timestamptz, int, boolean);
create function public.get_leaderboard(
  p_game text, p_seed text default null, p_since timestamptz default null,
  p_limit int default 10, p_asc boolean default false)
returns table (user_id uuid, nickname text, avatar jsonb, score int, created_at timestamptz, equipped jsonb)
language sql stable security invoker set search_path = '' as $$
  select b.user_id, p.nickname, p.avatar, b.score, b.created_at, p.equipped
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
returns public.rooms language sql security invoker set search_path = '' as $$
  select * from private.create_room(p_game, p_max_players, p_settings, p_is_public);
$$;
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
returns public.rooms language sql security invoker set search_path = '' as $$
  select * from private.join_room(p_code);
$$;
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
language sql security invoker set search_path = '' as $$
  select * from private.find_room(p_code);
$$;
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
returns public.rooms language sql security invoker set search_path = '' as $$
  select * from private.claim_host(p_code);
$$;
revoke all on function public.claim_host(text) from public, anon;
grant execute on function public.claim_host(text) to authenticated;

-- Javni lobbyji (za dashboard). Upošteva RLS (security invoker).
drop function if exists public.list_lobbies(int);
create function public.list_lobbies(p_fresh_minutes int default 3)
returns table (code text, game text, host_id uuid, host_nickname text, host_avatar jsonb,
               players int, max_players int, created_at timestamptz, updated_at timestamptz, host_equipped jsonb)
language sql stable security invoker set search_path = '' as $$
  select r.code, r.game, r.host_id, p.nickname, p.avatar,
         (select count(*)::int from public.room_players rp where rp.room_code = r.code),
         r.max_players, r.created_at, r.updated_at, p.equipped
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
--  GAME_SAVES (shranjen napredek iger: kariera, odklepi, rekordi, dnevni poskusi)
--  En JSON zapis na (igralec, igra, slot); bere in piše ga SAMO lastnik (RLS).
--  API: hub.loadSave / hub.writeSave, sinhronizacija ključev: shared/progress.js.
--  Ena skupna tabela namesto <igra>_saves (prej gneca_saves): manj tabel, isti API.
-- =====================================================================
create table if not exists public.game_saves (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  game        text not null check (game ~ '^[a-z0-9-]{1,32}$'),
  slot        text not null default 'main' check (slot ~ '^[a-z0-9_-]{1,24}$'),
  data        jsonb not null check (pg_column_size(data) <= 60000),
  rev         int not null default 0 check (rev >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, game, slot)
);

alter table public.game_saves enable row level security;
drop policy if exists game_saves_select on public.game_saves;
create policy game_saves_select on public.game_saves for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists game_saves_insert on public.game_saves;
create policy game_saves_insert on public.game_saves for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists game_saves_update on public.game_saves;
create policy game_saves_update on public.game_saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.game_saves from anon, authenticated;
grant select, insert, update on table public.game_saves to authenticated;

-- Prenos iz stare tabele Gneče (prompt 40). Idempotentno: novejši rev zmaga. Tabela je že zbrisana (28. 11. 2026);
-- blok ostane za baze, ki jo še imajo.
do $$
begin
  if to_regclass('public.gneca_saves') is not null then
    insert into public.game_saves (user_id, game, slot, data, rev, updated_at)
      select g.user_id, 'gneca', g.slot, g.data, g.rev, g.updated_at from public.gneca_saves g
      on conflict (user_id, game, slot) do update
        set data = excluded.data, rev = excluded.rev, updated_at = excluded.updated_at
        where excluded.rev > public.game_saves.rev;
  end if;
end $$;

-- =====================================================================
--  KOVANCI, TRGOVINA, KOZMETIKA, NALOGE
--
--  Številke so iste kot v shared/economy.js (COINS) in adapters/local.js:
--    igra 4 (20/dan) · zmaga v MP 8 (10/dan) · naloge e15 m25 h40 w1 100 w2 150
--    vse 3 dnevne +25 · nivo 5×nivo (≤100) · dosežek 15 · niz 5×dan (≤35)
--    dnevna meja igranja 120 (naloge niso pod mejo) · award_coins ≤100 na klic · dnevna ponudba −25 %
-- =====================================================================

-- ---------------------------------------------------------------------
--  Pomožne (private, niso izpostavljene)
-- ---------------------------------------------------------------------
-- »Danes« po Europe/Ljubljana.
create or replace function private.mg_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Ljubljana')::date;
$$;

-- Nivo iz XP (enako kot util.level: 100, 175, 250 … XP na nivo).
create or replace function private.mg_level(p_xp int)
returns int language plpgsql immutable set search_path = '' as $$
declare
  lvl  int := 1;
  rest int := greatest(0, coalesce(p_xp, 0));
begin
  while rest >= 100 + (lvl - 1) * 75 loop
    rest := rest - (100 + (lvl - 1) * 75);
    lvl := lvl + 1;
  end loop;
  return lvl;
end $$;

-- 32-bitno množenje (Math.imul) na nepredznačenih vrednostih [0, 2^32).
create or replace function private.mg_imul(a bigint, b bigint)
returns bigint language sql immutable set search_path = '' as $$
  select (((a & 65535) * b) + ((((a >> 16) * b) & 65535) << 16)) & 4294967295;
$$;

-- util.hashString (cyrb53 → 32 bitov). Seed mora biti ASCII.
create or replace function private.mg_hash(s text)
returns bigint language plpgsql immutable set search_path = '' as $$
declare
  h1 bigint := 3735928559;   -- 0xdeadbeef
  h2 bigint := 1103547991;   -- 0x41c6ce57
  t1 bigint;
  ch bigint;
begin
  for i in 1 .. char_length(s) loop
    ch := ascii(substr(s, i, 1));
    h1 := private.mg_imul(h1 # ch, 2654435761);
    h2 := private.mg_imul(h2 # ch, 1597334677);
  end loop;
  t1 := private.mg_imul(h1 # (h1 >> 16), 2246822507) # private.mg_imul(h2 # (h2 >> 13), 3266489909);
  h2 := private.mg_imul(h2 # (h2 >> 16), 2246822507) # private.mg_imul(t1 # (t1 >> 13), 3266489909);
  return t1 # h2;
end $$;

-- util.rng(seed).shuffle(items): mulberry32 + Fisher–Yates (isti rezultat kot v JS).
create or replace function private.mg_shuffle(p_seed text, p_items text[])
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  a   bigint := private.mg_hash(p_seed);
  t   bigint;
  arr text[] := p_items;
  n   int := coalesce(array_length(p_items, 1), 0);
  j   int;
  tmp text;
begin
  for i in reverse n - 1 .. 1 loop
    a := (a + 1831565813) & 4294967295;          -- 0x6d2b79f5
    t := a;
    t := private.mg_imul(t # (t >> 15), t | 1);
    t := t # ((t + private.mg_imul(t # (t >> 7), t | 61)) & 4294967295);
    t := t # (t >> 14);
    j := ((t * (i + 1)) >> 32)::int;             -- floor(rand() * (i + 1))
    tmp := arr[i + 1]; arr[i + 1] := arr[j + 1]; arr[j + 1] := tmp;
  end loop;
  return arr;
end $$;

-- =====================================================================
--  SHOP_ITEMS (cene pozna strežnik; katalog: shared/cosmetics.js)
-- =====================================================================
create table if not exists public.shop_items (
  id      text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  kind    text not null check (kind in ('emoji', 'bg', 'frame', 'name', 'title', 'badge', 'win', 'banner')),
  rarity  text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  price   int not null check (price >= 0),
  unlock  jsonb check (unlock is null or jsonb_typeof(unlock) = 'object'),
  active  boolean not null default true
);
alter table public.shop_items enable row level security;
drop policy if exists shop_items_select on public.shop_items;
create policy shop_items_select on public.shop_items for select to authenticated using (true);
revoke all on table public.shop_items from anon, authenticated;
grant select on table public.shop_items to authenticated;

-- Predmeti za posamezne igre (kind 'game', stolpca game in slot): opremljeni so v profiles.equipped.games.<igra>.<slot>.
alter table public.shop_items add column if not exists game text check (game is null or game ~ '^[a-z0-9-]{1,32}$');
alter table public.shop_items add column if not exists slot text check (slot is null or slot ~ '^[a-z]{1,16}$');
alter table public.shop_items drop constraint if exists shop_items_kind_check;
alter table public.shop_items add constraint shop_items_kind_check
  check (kind in ('emoji', 'bg', 'frame', 'name', 'title', 'badge', 'win', 'banner', 'game'));
alter table public.shop_items drop constraint if exists shop_items_game_check;
alter table public.shop_items add constraint shop_items_game_check
  check ((kind = 'game') = (game is not null and slot is not null));
-- več prostora za opremo po igrah (equipped.games)
alter table public.profiles drop constraint if exists profiles_equipped_check;
alter table public.profiles add constraint profiles_equipped_check
  check (jsonb_typeof(equipped) = 'object' and pg_column_size(equipped) < 2000);

-- SHOP_ITEMS:BEGIN (ustvari: node tools/shop-sql.mjs)
insert into public.shop_items (id, kind, rarity, price, unlock, active) values
  ('frame-thin', 'frame', 'common', 0, '{"free":true}'::jsonb, true),
  ('frame-thin-cyan', 'frame', 'common', 50, null, true),
  ('frame-thin-pink', 'frame', 'common', 50, null, true),
  ('frame-double', 'frame', 'common', 120, null, true),
  ('frame-neon-pink', 'frame', 'rare', 250, null, true),
  ('frame-neon-cyan', 'frame', 'rare', 250, null, true),
  ('frame-neon-green', 'frame', 'rare', 250, null, true),
  ('frame-neon-yellow', 'frame', 'rare', 300, '{"level":5}'::jsonb, true),
  ('frame-pixel', 'frame', 'rare', 400, null, true),
  ('frame-bolt', 'frame', 'rare', 0, '{"achievement":"reakcija:bliskovit"}'::jsonb, true),
  ('frame-streak', 'frame', 'epic', 0, '{"streak":7}'::jsonb, true),
  ('frame-ice', 'frame', 'epic', 700, null, true),
  ('frame-arcade', 'frame', 'epic', 800, null, true),
  ('frame-fire', 'frame', 'epic', 900, null, true),
  ('frame-crown', 'frame', 'epic', 950, '{"level":10}'::jsonb, true),
  ('frame-gold', 'frame', 'epic', 1000, null, true),
  ('frame-rainbow', 'frame', 'legendary', 3500, null, true),
  ('frame-pixel-rainbow', 'frame', 'legendary', 4000, null, true),
  ('emoji-dino', 'emoji', 'common', 80, null, true),
  ('emoji-penguin', 'emoji', 'common', 60, null, true),
  ('emoji-owl', 'emoji', 'common', 60, null, true),
  ('emoji-donut', 'emoji', 'common', 60, null, true),
  ('emoji-bee', 'emoji', 'common', 70, null, true),
  ('emoji-otter', 'emoji', 'common', 90, null, true),
  ('emoji-flamingo', 'emoji', 'common', 90, null, true),
  ('emoji-guitar', 'emoji', 'common', 100, null, true),
  ('emoji-cowboy', 'emoji', 'common', 120, null, true),
  ('emoji-shark', 'emoji', 'rare', 250, null, true),
  ('emoji-wolf', 'emoji', 'rare', 250, null, true),
  ('emoji-eagle', 'emoji', 'rare', 250, null, true),
  ('emoji-vampire', 'emoji', 'rare', 300, null, true),
  ('emoji-skull', 'emoji', 'rare', 300, null, true),
  ('emoji-rainbow', 'emoji', 'rare', 350, null, true),
  ('emoji-ninja', 'emoji', 'rare', 400, null, true),
  ('emoji-wizard', 'emoji', 'epic', 600, null, true),
  ('emoji-ufo', 'emoji', 'epic', 700, null, true),
  ('emoji-dragon', 'emoji', 'epic', 900, null, true),
  ('emoji-crown', 'emoji', 'epic', 0, '{"achievement":"reakcija:zmaga-mp"}'::jsonb, true),
  ('bg-mint', 'bg', 'common', 80, null, true),
  ('bg-sunset', 'bg', 'common', 100, null, true),
  ('bg-ocean', 'bg', 'common', 120, null, true),
  ('bg-dots', 'bg', 'rare', 250, null, true),
  ('bg-stripes', 'bg', 'rare', 250, null, true),
  ('bg-checker', 'bg', 'rare', 300, null, true),
  ('bg-silver', 'bg', 'rare', 350, null, true),
  ('bg-gold', 'bg', 'epic', 800, null, true),
  ('bg-galaxy', 'bg', 'epic', 900, '{"level":8}'::jsonb, true),
  ('bg-aurora', 'bg', 'epic', 1000, null, true),
  ('name-yellow', 'name', 'common', 60, null, true),
  ('name-cyan', 'name', 'common', 60, null, true),
  ('name-pink', 'name', 'common', 60, null, true),
  ('name-green', 'name', 'common', 60, null, true),
  ('name-sunset', 'name', 'rare', 300, null, true),
  ('name-ice', 'name', 'rare', 300, null, true),
  ('name-neon', 'name', 'epic', 700, null, true),
  ('name-gold', 'name', 'epic', 900, null, true),
  ('name-rainbow', 'name', 'legendary', 4500, null, true),
  ('title-novinec', 'title', 'common', 0, '{"free":true}'::jsonb, true),
  ('title-nocna-ptica', 'title', 'common', 100, null, true),
  ('title-mirna-roka', 'title', 'common', 0, '{"achievement":"reakcija:mirna-roka"}'::jsonb, true),
  ('title-bliskovit', 'title', 'rare', 0, '{"achievement":"reakcija:bliskovit"}'::jsonb, true),
  ('title-party', 'title', 'rare', 250, '{"achievement":"reakcija:druzabnez"}'::jsonb, true),
  ('title-kralj-sobe', 'title', 'rare', 300, '{"achievement":"reakcija:zmaga-mp"}'::jsonb, true),
  ('title-flipper', 'title', 'rare', 350, null, true),
  ('title-zbiratelj', 'title', 'rare', 400, null, true),
  ('title-neustavljiv', 'title', 'epic', 0, '{"streak":7}'::jsonb, true),
  ('title-veteran', 'title', 'epic', 0, '{"level":10}'::jsonb, true),
  ('title-pikselni-vitez', 'title', 'epic', 600, null, true),
  ('title-arkadni-mojster', 'title', 'epic', 800, null, true),
  ('title-legenda', 'title', 'legendary', 4000, '{"level":15}'::jsonb, true),
  ('badge-pad', 'badge', 'common', 0, '{"free":true}'::jsonb, true),
  ('badge-star', 'badge', 'common', 60, null, true),
  ('badge-moon', 'badge', 'common', 70, null, true),
  ('badge-bolt', 'badge', 'common', 80, null, true),
  ('badge-target', 'badge', 'common', 90, null, true),
  ('badge-fire', 'badge', 'common', 100, null, true),
  ('badge-rocket', 'badge', 'common', 120, null, true),
  ('badge-clover', 'badge', 'rare', 250, null, true),
  ('badge-invader', 'badge', 'rare', 300, null, true),
  ('badge-trophy', 'badge', 'rare', 300, '{"level":5}'::jsonb, true),
  ('badge-diamond', 'badge', 'epic', 800, null, true),
  ('win-stars', 'win', 'common', 150, null, true),
  ('win-confetti', 'win', 'rare', 300, null, true),
  ('win-gg', 'win', 'rare', 350, null, true),
  ('win-pixelrain', 'win', 'epic', 700, null, true),
  ('win-fireworks', 'win', 'epic', 1000, null, true),
  ('banner-dots', 'banner', 'common', 100, null, true),
  ('banner-sunset', 'banner', 'common', 100, null, true),
  ('banner-stripes', 'banner', 'common', 120, null, true),
  ('banner-synthwave', 'banner', 'rare', 300, null, true),
  ('banner-night', 'banner', 'rare', 350, null, true),
  ('banner-aurora', 'banner', 'epic', 900, null, true),
  ('banner-gold', 'banner', 'epic', 1000, null, true),
  ('banner-rainbow', 'banner', 'legendary', 3800, null, true)
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price = excluded.price,
  unlock = excluded.unlock, active = excluded.active;
update public.shop_items set active = false where kind <> 'game' and id not in ('frame-thin', 'frame-thin-cyan', 'frame-thin-pink', 'frame-double', 'frame-neon-pink', 'frame-neon-cyan', 'frame-neon-green', 'frame-neon-yellow', 'frame-pixel', 'frame-bolt', 'frame-streak', 'frame-ice', 'frame-arcade', 'frame-fire', 'frame-crown', 'frame-gold', 'frame-rainbow', 'frame-pixel-rainbow', 'emoji-dino', 'emoji-penguin', 'emoji-owl', 'emoji-donut', 'emoji-bee', 'emoji-otter', 'emoji-flamingo', 'emoji-guitar', 'emoji-cowboy', 'emoji-shark', 'emoji-wolf', 'emoji-eagle', 'emoji-vampire', 'emoji-skull', 'emoji-rainbow', 'emoji-ninja', 'emoji-wizard', 'emoji-ufo', 'emoji-dragon', 'emoji-crown', 'bg-mint', 'bg-sunset', 'bg-ocean', 'bg-dots', 'bg-stripes', 'bg-checker', 'bg-silver', 'bg-gold', 'bg-galaxy', 'bg-aurora', 'name-yellow', 'name-cyan', 'name-pink', 'name-green', 'name-sunset', 'name-ice', 'name-neon', 'name-gold', 'name-rainbow', 'title-novinec', 'title-nocna-ptica', 'title-mirna-roka', 'title-bliskovit', 'title-party', 'title-kralj-sobe', 'title-flipper', 'title-zbiratelj', 'title-neustavljiv', 'title-veteran', 'title-pikselni-vitez', 'title-arkadni-mojster', 'title-legenda', 'badge-pad', 'badge-star', 'badge-moon', 'badge-bolt', 'badge-target', 'badge-fire', 'badge-rocket', 'badge-clover', 'badge-invader', 'badge-trophy', 'badge-diamond', 'win-stars', 'win-confetti', 'win-gg', 'win-pixelrain', 'win-fireworks', 'banner-dots', 'banner-sunset', 'banner-stripes', 'banner-synthwave', 'banner-night', 'banner-aurora', 'banner-gold', 'banner-rainbow');
-- SHOP_ITEMS:END

-- GAME_ITEMS:BEGIN (ustvari: node tools/shop-sql.mjs)
insert into public.shop_items (id, kind, rarity, price, unlock, active, game, slot) values
  ('skoki-suit-klasika', 'game', 'common', 80, null, true, 'skoki', 'suit'),
  ('skoki-suit-rdeca', 'game', 'common', 100, null, true, 'skoki', 'suit'),
  ('skoki-suit-polnoc', 'game', 'common', 120, null, true, 'skoki', 'suit'),
  ('skoki-suit-neon', 'game', 'rare', 250, null, true, 'skoki', 'suit'),
  ('skoki-suit-zima', 'game', 'rare', 280, null, true, 'skoki', 'suit'),
  ('skoki-suit-retro', 'game', 'rare', 320, null, true, 'skoki', 'suit'),
  ('skoki-suit-orel', 'game', 'epic', 750, null, true, 'skoki', 'suit'),
  ('skoki-suit-angel', 'game', 'rare', 0, '{"achievement":"skoki:padci-50"}'::jsonb, true, 'skoki', 'suit'),
  ('skoki-suit-luna', 'game', 'epic', 0, '{"achievement":"skoki:luna"}'::jsonb, true, 'skoki', 'suit'),
  ('skoki-suit-zlati', 'game', 'epic', 0, '{"achievement":"skoki:sezona"}'::jsonb, true, 'skoki', 'suit'),
  ('skoki-helmet-bela', 'game', 'common', 60, null, true, 'skoki', 'helmet'),
  ('skoki-helmet-crna', 'game', 'common', 80, null, true, 'skoki', 'helmet'),
  ('skoki-helmet-neon', 'game', 'rare', 220, null, true, 'skoki', 'helmet'),
  ('skoki-helmet-plamen', 'game', 'rare', 300, null, true, 'skoki', 'helmet'),
  ('skoki-helmet-krom', 'game', 'epic', 700, null, true, 'skoki', 'helmet'),
  ('skoki-helmet-rumena', 'game', 'epic', 0, '{"achievement":"skoki:rumena"}'::jsonb, true, 'skoki', 'helmet'),
  ('skoki-skis-bele', 'game', 'common', 60, null, true, 'skoki', 'skis'),
  ('skoki-skis-crne', 'game', 'common', 90, null, true, 'skoki', 'skis'),
  ('skoki-skis-les', 'game', 'rare', 250, null, true, 'skoki', 'skis'),
  ('skoki-skis-mavrica', 'game', 'rare', 300, null, true, 'skoki', 'skis'),
  ('skoki-skis-ogenj', 'game', 'epic', 650, null, true, 'skoki', 'skis'),
  ('skoki-skis-letalec', 'game', 'epic', 0, '{"achievement":"skoki:letalec"}'::jsonb, true, 'skoki', 'skis'),
  ('skoki-flag-si', 'game', 'common', 40, null, true, 'skoki', 'flag'),
  ('skoki-flag-at', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-de', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-no', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-pl', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-fi', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-jp', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-ch', 'game', 'common', 60, null, true, 'skoki', 'flag'),
  ('skoki-flag-pirat', 'game', 'rare', 200, null, true, 'skoki', 'flag'),
  ('skoki-flag-mavrica', 'game', 'rare', 200, null, true, 'skoki', 'flag')
on conflict (id) do update set kind = excluded.kind, rarity = excluded.rarity, price = excluded.price,
  unlock = excluded.unlock, active = excluded.active, game = excluded.game, slot = excluded.slot;
update public.shop_items set active = false where kind = 'game' and id not in ('skoki-suit-klasika', 'skoki-suit-rdeca', 'skoki-suit-polnoc', 'skoki-suit-neon', 'skoki-suit-zima', 'skoki-suit-retro', 'skoki-suit-orel', 'skoki-suit-angel', 'skoki-suit-luna', 'skoki-suit-zlati', 'skoki-helmet-bela', 'skoki-helmet-crna', 'skoki-helmet-neon', 'skoki-helmet-plamen', 'skoki-helmet-krom', 'skoki-helmet-rumena', 'skoki-skis-bele', 'skoki-skis-crne', 'skoki-skis-les', 'skoki-skis-mavrica', 'skoki-skis-ogenj', 'skoki-skis-letalec', 'skoki-flag-si', 'skoki-flag-at', 'skoki-flag-de', 'skoki-flag-no', 'skoki-flag-pl', 'skoki-flag-fi', 'skoki-flag-jp', 'skoki-flag-ch', 'skoki-flag-pirat', 'skoki-flag-mavrica');
-- GAME_ITEMS:END

-- Dnevna ponudba: 4 predmeti (isti algoritem kot cosmetics.dailyOffer).
create or replace function private.mg_daily_offer(p_day date)
returns text[] language sql stable security definer set search_path = '' as $$
  select (private.mg_shuffle(
    to_char(p_day, 'YYYY-MM-DD') || ':shop',
    array(select s.id from public.shop_items s where s.price > 0 and s.active and s.kind <> 'game' order by s.id collate "C")
  ))[1:4];
$$;
revoke all on function private.mg_daily_offer(date) from public, anon, authenticated;

-- =====================================================================
--  INVENTORY (kaj ima kdo; vsi berejo, da se kozmetika vidi)
-- =====================================================================
create table if not exists public.inventory (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  item_id      text not null references public.shop_items(id) on delete cascade,
  acquired_at  timestamptz not null default now(),
  source       text not null check (source in ('buy', 'unlock', 'gift')),
  primary key (user_id, item_id)
);
create index if not exists inventory_item on public.inventory (item_id);
alter table public.inventory enable row level security;
drop policy if exists inventory_select on public.inventory;
create policy inventory_select on public.inventory for select to authenticated using (true);
revoke all on table public.inventory from anon, authenticated;
grant select on table public.inventory to authenticated;

-- =====================================================================
--  COIN_LEDGER (dnevnik: dnevna meja, števci iger/zmag, pregled)
-- =====================================================================
create table if not exists public.coin_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  amount      int not null check (amount <> 0),
  reason      text not null check (char_length(reason) <= 40),
  ref         text check (ref is null or char_length(ref) <= 80),
  created_at  timestamptz not null default now()
);
create index if not exists coin_ledger_user_day on public.coin_ledger (user_id, day);
alter table public.coin_ledger enable row level security;
drop policy if exists coin_ledger_select on public.coin_ledger;
create policy coin_ledger_select on public.coin_ledger for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on table public.coin_ledger from anon, authenticated;
grant select on table public.coin_ledger to authenticated;

-- =====================================================================
--  QUEST_PROGRESS (napredek »na časten način«, prevzem samo prek RPC)
-- =====================================================================
create table if not exists public.quest_progress (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  period      text not null check (period ~ '^(d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2})$'),
  quest_id    text not null check (quest_id ~ '^(e|m|h|w1|w2)\.[a-z0-9:_-]{1,48}$'),
  progress    int not null default 0 check (progress between 0 and 1000),
  data        jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 2000),
  claimed_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, period, quest_id)
);
-- en prevzem na mesto (slot) in obdobje — tudi če bi klient podtaknil drug quest_id
create unique index if not exists quest_progress_one_claim
  on public.quest_progress (user_id, period, (split_part(quest_id, '.', 1))) where claimed_at is not null;

alter table public.quest_progress enable row level security;
drop policy if exists quest_progress_select on public.quest_progress;
create policy quest_progress_select on public.quest_progress for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists quest_progress_insert on public.quest_progress;
create policy quest_progress_insert on public.quest_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and claimed_at is null);
drop policy if exists quest_progress_update on public.quest_progress;
create policy quest_progress_update on public.quest_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on table public.quest_progress from anon, authenticated;
grant select on table public.quest_progress to authenticated;
grant insert (period, quest_id, progress, data) on table public.quest_progress to authenticated;
grant update (progress, data, updated_at) on table public.quest_progress to authenticated;

-- Zapiši napredek (napredek le narašča). security invoker → RLS in pravice na stolpcih.
create or replace function public.set_quest_progress(p_period text, p_quest_id text, p_progress int, p_data jsonb default '{}'::jsonb)
returns int language sql security invoker set search_path = '' as $$
  insert into public.quest_progress as q (period, quest_id, progress, data)
    values (p_period, p_quest_id, least(greatest(coalesce(p_progress, 0), 0), 1000), coalesce(p_data, '{}'::jsonb))
  on conflict (user_id, period, quest_id) do update
    set progress = greatest(q.progress, excluded.progress), data = excluded.data, updated_at = now()
  returning progress;
$$;
revoke all on function public.set_quest_progress(text, text, int, jsonb) from public, anon;
grant execute on function public.set_quest_progress(text, text, int, jsonb) to authenticated;

-- ---------------------------------------------------------------------
--  Podeljevanje kovancev (samo iz drugih private funkcij; klient ga ne more klicati)
-- ---------------------------------------------------------------------
create or replace function private.grant_coins(p_uid uuid, p_amount int, p_reason text, p_ref text default null, p_per_call int default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  d    date := private.mg_today();
  used int;
  g    int;
begin
  if p_amount is null or p_amount <= 0 then return 0; end if;
  perform 1 from public.profiles p where p.id = p_uid for update;
  if not found then return 0; end if;
  if p_reason in ('quest', 'quest_bonus') then
    -- nagrade nalog niso pod dnevno mejo (omejene so z enim prevzemom na nalogo)
    g := p_amount;
  else
    select coalesce(sum(l.amount), 0) into used
      from public.coin_ledger l where l.user_id = p_uid and l.day = d and l.amount > 0
       and l.reason not in ('quest', 'quest_bonus');
    g := least(p_amount, coalesce(p_per_call, p_amount), greatest(0, 120 - used));
  end if;
  if g > 0 then
    insert into public.coin_ledger (user_id, day, amount, reason, ref) values (p_uid, d, g, left(p_reason, 40), left(p_ref, 80));
    update public.profiles p set coins = p.coins + g where p.id = p_uid;
  end if;
  return g;
end $$;
revoke all on function private.grant_coins(uuid, int, text, text, int) from public, anon, authenticated;

-- Ali igralec izpolnjuje pogoj predmeta (level / achievement / streak / free)?
create or replace function private.mg_meets(p_uid uuid, p_unlock jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare pr public.profiles;
begin
  if p_unlock is null or p_unlock = '{}'::jsonb or coalesce((p_unlock ->> 'free')::boolean, false) then return true; end if;
  select * into pr from public.profiles p where p.id = p_uid;
  if not found then return false; end if;
  if p_unlock ? 'level' then return private.mg_level(pr.xp) >= (p_unlock ->> 'level')::int; end if;
  if p_unlock ? 'streak' then return greatest(pr.streak, pr.best_streak) >= (p_unlock ->> 'streak')::int; end if;
  if p_unlock ? 'achievement' then
    return exists (select 1 from public.achievements a
                   where a.user_id = p_uid and a.game || ':' || a.key = p_unlock ->> 'achievement');
  end if;
  return false;
end $$;
revoke all on function private.mg_meets(uuid, jsonb) from public, anon, authenticated;

-- Dosežek (prvi odklep) → +15 kovancev.
create or replace function private.on_achievement_coins()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.grant_coins(new.user_id, 15, 'ach', new.game || ':' || new.key);
  return null;
end $$;
revoke all on function private.on_achievement_coins() from public, anon, authenticated;
drop trigger if exists achievements_coins on public.achievements;
create trigger achievements_coins after insert on public.achievements
  for each row execute function private.on_achievement_coins();

-- ---------------------------------------------------------------------
--  RPC: award_coins (bonusi iger; ≤100 na klic, skozi dnevno mejo)
-- ---------------------------------------------------------------------
create or replace function private.award_coins(amount int, reason text default null, ref text default null)
returns json language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  uid uuid := auth.uid();
  g   int;
  c   int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = uid) then raise exception 'no_profile'; end if;
  g := private.grant_coins(uid, amount, 'bonus:' || coalesce(left(reason, 30), ''), ref, 100);
  select p.coins into c from public.profiles p where p.id = uid;
  return json_build_object('coins', c, 'granted', g);
end $$;
revoke all on function private.award_coins(int, text, text) from public, anon;
grant execute on function private.award_coins(int, text, text) to authenticated;

create or replace function public.award_coins(amount int, reason text default null, ref text default null)
returns json language sql security invoker set search_path = '' as $$
  select private.award_coins(amount, reason, ref);
$$;
revoke all on function public.award_coins(int, text, text) from public, anon;
grant execute on function public.award_coins(int, text, text) to authenticated;

-- ---------------------------------------------------------------------
--  RPC: report_game (odigrana igra → kovanci za igro, zmago, niz dni)
-- ---------------------------------------------------------------------
create or replace function private.report_game(p_game text, p_won boolean default false, p_players int default 1)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid     uuid := auth.uid();
  d       date := private.mg_today();
  pr      public.profiles;
  first   boolean;
  st      int;
  games   int;
  wins    int;
  g_game  int := 0;
  g_win   int := 0;
  g_st    int := 0;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_game is null or p_game !~ '^[a-z0-9-]{1,32}$' then raise exception 'invalid'; end if;
  select * into pr from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;

  first := pr.streak_day is distinct from d;
  if first then
    st := case when pr.streak_day = d - 1 then pr.streak + 1 else 1 end;
    update public.profiles p set streak = st, best_streak = greatest(p.best_streak, st), streak_day = d where p.id = uid;
  else
    st := greatest(pr.streak, 1);
  end if;

  select count(*) filter (where l.reason = 'game'), count(*) filter (where l.reason = 'win')
    into games, wins from public.coin_ledger l where l.user_id = uid and l.day = d;
  if first then g_st := private.grant_coins(uid, 5 * least(st, 7), 'streak', st::text); end if;
  if games < 20 then g_game := private.grant_coins(uid, 4, 'game', p_game); end if;
  if coalesce(p_won, false) and coalesce(p_players, 1) >= 2 and wins < 10 then
    g_win := private.grant_coins(uid, 8, 'win', p_game);
  end if;
  return json_build_object(
    'coins', (select p.coins from public.profiles p where p.id = uid),
    'granted', g_game + g_win + g_st, 'game', g_game, 'win', g_win,
    'streak', st, 'streak_bonus', g_st, 'first', first,
    'capped', games < 20 and g_game = 0);
end $$;
revoke all on function private.report_game(text, boolean, int) from public, anon;
grant execute on function private.report_game(text, boolean, int) to authenticated;

create or replace function public.report_game(p_game text, p_won boolean default false, p_players int default 1)
returns json language sql security invoker set search_path = '' as $$
  select private.report_game(p_game, p_won, p_players);
$$;
revoke all on function public.report_game(text, boolean, int) from public, anon;
grant execute on function public.report_game(text, boolean, int) to authenticated;

-- ---------------------------------------------------------------------
--  RPC: buy_item (atomarno: pogoj, stanje, popust dnevne ponudbe)
--  napake: unavailable · owned · locked · not_enough_coins
-- ---------------------------------------------------------------------
create or replace function private.buy_item(p_item text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid   uuid := auth.uid();
  pr    public.profiles;
  it    public.shop_items;
  price int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into pr from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;
  select * into it from public.shop_items s where s.id = p_item;
  if not found or not it.active then raise exception 'unavailable'; end if;
  if exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = it.id) then raise exception 'owned'; end if;
  if not private.mg_meets(uid, it.unlock) then raise exception 'locked'; end if;
  price := it.price;
  if it.id = any (private.mg_daily_offer(private.mg_today())) then price := it.price * 3 / 4; end if;
  if pr.coins < price then raise exception 'not_enough_coins'; end if;
  update public.profiles p set coins = p.coins - price where p.id = uid;
  insert into public.inventory (user_id, item_id, source) values (uid, it.id, case when price > 0 then 'buy' else 'unlock' end);
  if price > 0 then
    insert into public.coin_ledger (user_id, day, amount, reason, ref) values (uid, private.mg_today(), -price, 'buy', it.id);
  end if;
  return json_build_object('coins', pr.coins - price, 'price', price, 'item', it.id);
end $$;
revoke all on function private.buy_item(text) from public, anon;
grant execute on function private.buy_item(text) to authenticated;

create or replace function public.buy_item(p_item text)
returns json language sql security invoker set search_path = '' as $$
  select private.buy_item(p_item);
$$;
revoke all on function public.buy_item(text) from public, anon;
grant execute on function public.buy_item(text) to authenticated;

-- ---------------------------------------------------------------------
--  RPC: unlock_item (brezplačni predmeti in predmeti s pogojem, cena 0)
--  napake: unavailable · not_free · owned · locked
-- ---------------------------------------------------------------------
create or replace function private.unlock_item(p_item text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  it  public.shop_items;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;
  select * into it from public.shop_items s where s.id = p_item;
  if not found or not it.active then raise exception 'unavailable'; end if;
  if it.price > 0 then raise exception 'not_free'; end if;
  if exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = it.id) then raise exception 'owned'; end if;
  if not private.mg_meets(uid, it.unlock) then raise exception 'locked'; end if;
  insert into public.inventory (user_id, item_id, source) values (uid, it.id, 'unlock');
  return json_build_object('item', it.id);
end $$;
revoke all on function private.unlock_item(text) from public, anon;
grant execute on function private.unlock_item(text) to authenticated;

create or replace function public.unlock_item(p_item text)
returns json language sql security invoker set search_path = '' as $$
  select private.unlock_item(p_item);
$$;
revoke all on function public.unlock_item(text) from public, anon;
grant execute on function public.unlock_item(text) to authenticated;

-- ---------------------------------------------------------------------
--  RPC: equip (samo iz inventarja ali brezplačni brez pogoja; null sname)
--  Predmeti za igre: p_slot '<igra>.<slot>' (npr. 'skoki.suit') → equipped.games.<igra>.<slot>.
--  napake: invalid · not_owned
-- ---------------------------------------------------------------------
create or replace function private.equip(p_slot text, p_item text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  it  public.shop_items;
  eq  jsonb;
  v_g text;
  v_s text;
  gm  jsonb;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_slot is null then raise exception 'invalid'; end if;
  if p_slot ~ '^[a-z0-9-]{1,32}\.[a-z]{1,16}$' then
    v_g := split_part(p_slot, '.', 1);
    v_s := split_part(p_slot, '.', 2);
    if not exists (select 1 from public.shop_items x where x.kind = 'game' and x.game = v_g and x.slot = v_s) then raise exception 'invalid'; end if;
    perform 1 from public.profiles p where p.id = uid for update;
    if not found then raise exception 'no_profile'; end if;
    select coalesce(p.equipped -> 'games' -> v_g, '{}'::jsonb) into gm from public.profiles p where p.id = uid;
    if p_item is null then
      gm := gm - v_s;
    else
      select * into it from public.shop_items x where x.id = p_item;
      if not found or it.kind <> 'game' or it.game <> v_g or it.slot <> v_s then raise exception 'invalid'; end if;
      if not exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = it.id)
         and not (it.price = 0 and it.active and (it.unlock is null or coalesce((it.unlock ->> 'free')::boolean, false))) then
        raise exception 'not_owned';
      end if;
      gm := gm || jsonb_build_object(v_s, it.id);
    end if;
    update public.profiles p set equipped = case
        when gm = '{}'::jsonb and (coalesce(p.equipped -> 'games', '{}'::jsonb) - v_g) = '{}'::jsonb then p.equipped - 'games'
        when gm = '{}'::jsonb then jsonb_set(p.equipped, '{games}', (p.equipped -> 'games') - v_g)
        else jsonb_set(p.equipped, '{games}', coalesce(p.equipped -> 'games', '{}'::jsonb) || jsonb_build_object(v_g, gm)) end
      where p.id = uid returning p.equipped into eq;
    return eq;
  end if;
  if p_slot not in ('emoji', 'bg', 'frame', 'name', 'title', 'badge', 'win', 'banner') then
    raise exception 'invalid';
  end if;
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;
  if p_item is null then
    update public.profiles p set equipped = p.equipped - p_slot where p.id = uid returning p.equipped into eq;
    return eq;
  end if;
  select * into it from public.shop_items s where s.id = p_item;
  if not found or it.kind <> p_slot then raise exception 'invalid'; end if;
  if not exists (select 1 from public.inventory i where i.user_id = uid and i.item_id = it.id)
     and not (it.price = 0 and it.active and (it.unlock is null or coalesce((it.unlock ->> 'free')::boolean, false))) then
    raise exception 'not_owned';
  end if;
  update public.profiles p set equipped = p.equipped || jsonb_build_object(p_slot, it.id) where p.id = uid
    returning p.equipped into eq;
  return eq;
end $$;
revoke all on function private.equip(text, text) from public, anon;
grant execute on function private.equip(text, text) to authenticated;

create or replace function public.equip(p_slot text, p_item text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.equip(p_slot, p_item);
$$;
revoke all on function public.equip(text, text) from public, anon;
grant execute on function public.equip(text, text) to authenticated;

-- ---------------------------------------------------------------------
--  RPC: claim_quest (enkrat na nalogo/slot; nagrado izračuna strežnik iz slota)
--  napake: invalid · expired · claimed
-- ---------------------------------------------------------------------
create or replace function private.claim_quest(p_period text, p_quest_id text)
returns json language plpgsql security definer set search_path = '' as $$
declare
  uid    uuid := auth.uid();
  d      date := private.mg_today();
  slot   text;
  reward int;
  g      int;
  bonus  int := 0;
  n      int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  perform 1 from public.profiles p where p.id = uid for update;
  if not found then raise exception 'no_profile'; end if;
  if p_period is null or p_quest_id is null
     or p_period !~ '^(d:\d{4}-\d{2}-\d{2}|w:\d{4}-W\d{2})$'
     or p_quest_id !~ '^(e|m|h|w1|w2)\.[a-z0-9:_-]{1,48}$' then
    raise exception 'invalid';
  end if;
  slot := split_part(p_quest_id, '.', 1);
  if p_period = 'd:' || to_char(d, 'YYYY-MM-DD') then
    if slot not in ('e', 'm', 'h') then raise exception 'invalid'; end if;
  elsif p_period = 'w:' || to_char(d, 'IYYY-"W"IW') then
    if slot not in ('w1', 'w2') then raise exception 'invalid'; end if;
  else
    raise exception 'expired';
  end if;
  if exists (select 1 from public.quest_progress q
             where q.user_id = uid and q.period = p_period and split_part(q.quest_id, '.', 1) = slot and q.claimed_at is not null) then
    raise exception 'claimed';
  end if;
  insert into public.quest_progress as q (user_id, period, quest_id, progress, claimed_at)
    values (uid, p_period, p_quest_id, 0, now())
  on conflict (user_id, period, quest_id) do update set claimed_at = now(), updated_at = now();

  reward := case slot when 'e' then 15 when 'm' then 25 when 'h' then 40 when 'w1' then 100 when 'w2' then 150 end;
  g := private.grant_coins(uid, reward, 'quest', p_period || '/' || slot);
  if slot in ('e', 'm', 'h') then
    select count(*) into n from public.quest_progress q
      where q.user_id = uid and q.period = p_period and q.claimed_at is not null;
    if n = 3 then bonus := private.grant_coins(uid, 25, 'quest_bonus', p_period); end if;
  end if;
  return json_build_object('coins', (select p.coins from public.profiles p where p.id = uid),
    'granted', g + bonus, 'reward', reward, 'bonus', bonus);
end $$;
revoke all on function private.claim_quest(text, text) from public, anon;
grant execute on function private.claim_quest(text, text) to authenticated;

create or replace function public.claim_quest(p_period text, p_quest_id text)
returns json language sql security invoker set search_path = '' as $$
  select private.claim_quest(p_period, p_quest_id);
$$;
revoke all on function public.claim_quest(text, text) from public, anon;
grant execute on function public.claim_quest(text, text) to authenticated;

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
