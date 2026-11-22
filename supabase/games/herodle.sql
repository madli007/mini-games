-- =====================================================================
--  HERODLE — lik dneva na strežniku (proti goljufanju)
--  Idempotentno: lahko se požene večkrat. Zahteva supabase/schema.sql (profiles, shema private).
--  Vrstni red: 1) ta datoteka  2) herodle-heroes.sql  3) herodle-hints.sql (obe generira tools/herodle-sql.mjs)
--
--  herodle_heroes          atributi likov za primerjavo (javni podatki; berejo prijavljeni)
--  private.herodle_secret  naključna sol, ustvarjena V BAZI (nikoli v repoju, je ne vrne noben RPC)
--  herodle_daily           razpored (datum, način → lik); za anon/authenticated NI berljiv
--  herodle_giveups         predaje (vsak bere in piše le svoje)
--  herodle_hints           namigi za Emoji/Kostum/Dosje (2. faza); za anon/authenticated NI berljiva
--  herodle_progress        napačni poskusi v načinih z namigi (vsak bere svoje, piše SAMO RPC)
--
--  RPC (security definer v private, security invoker ovojnice v public):
--    herodle_check(p_mode, p_date, p_hero_id)        → { solved, result } (id lika le, ko je rešen);
--                                                      za emoji/kostum/dosje { solved, wrong, hints, lost? } in poveča wrong
--    herodle_hint(p_mode, p_date)                    → namigi, ki jih igralec glede na wrong sme videti
--    herodle_reveal(p_mode, p_date, p_give_up)       → { hero_id } za pretekle dni; za danes le s p_give_up
--    herodle_compare(p_a, p_b)                       → primerjava dveh poljubnih likov (razvojni; ista funkcija
--                                                      kot herodle_check, lika dneva ne razkrije)
--  Primerjava (private.herodle_cmp) MORA ostati enaka compare() v games/herodle/logic.js
--  (preveri s fiksturo tests/fixtures/herodle-compare.json).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- liki
create table if not exists public.herodle_heroes (
  id           text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  universe     text not null check (universe in ('Marvel', 'DC')),
  teams        text[] not null default '{}',
  species      text not null,
  origins      text[] not null check (cardinality(origins) > 0),
  gender       text not null check (gender in ('M', 'Ž', 'Drugo')),
  first_comic  int not null check (first_comic between 1930 and 2030),
  alignment    text not null check (alignment in ('Junak', 'Zlobec', 'Antijunak')),
  in_mcu       boolean not null default false
);
alter table public.herodle_heroes enable row level security;
drop policy if exists herodle_heroes_select on public.herodle_heroes;
create policy herodle_heroes_select on public.herodle_heroes for select to authenticated using (true);
revoke all on table public.herodle_heroes from anon, authenticated;
grant select on table public.herodle_heroes to authenticated;

-- ---------------------------------------------------------------- skrivna sol
create table if not exists private.herodle_secret (
  id    int primary key default 1 check (id = 1),
  salt  text not null
);
alter table private.herodle_secret enable row level security;
revoke all on table private.herodle_secret from public, anon, authenticated;
insert into private.herodle_secret (id, salt)
  select 1, encode(extensions.gen_random_bytes(32), 'hex')
  where not exists (select 1 from private.herodle_secret);

-- ---------------------------------------------------------------- razpored
create table if not exists public.herodle_daily (
  date     date not null,
  mode     text not null check (mode in ('klasika', 'klasika-mcu', 'klasika-dc', 'emoji', 'kostum', 'dosje')),
  hero_id  text not null references public.herodle_heroes(id),
  primary key (date, mode)
);
-- 2. faza: novi načini (za obstoječo tabelo)
alter table public.herodle_daily drop constraint if exists herodle_daily_mode_check;
alter table public.herodle_daily add constraint herodle_daily_mode_check
  check (mode in ('klasika', 'klasika-mcu', 'klasika-dc', 'emoji', 'kostum', 'dosje'));
create index if not exists herodle_daily_mode_date on public.herodle_daily (mode, date);
create index if not exists herodle_daily_hero on public.herodle_daily (hero_id);
alter table public.herodle_daily enable row level security;
-- brez pravil: razpored berejo SAMO security definer funkcije spodaj
revoke all on table public.herodle_daily from public, anon, authenticated;

-- ---------------------------------------------------------------- predaje
create table if not exists public.herodle_giveups (
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  date        date not null,
  mode        text not null check (mode in ('klasika', 'klasika-mcu', 'klasika-dc', 'emoji', 'kostum', 'dosje')),
  created_at  timestamptz not null default now(),
  primary key (user_id, date, mode)
);
alter table public.herodle_giveups drop constraint if exists herodle_giveups_mode_check;
alter table public.herodle_giveups add constraint herodle_giveups_mode_check
  check (mode in ('klasika', 'klasika-mcu', 'klasika-dc', 'emoji', 'kostum', 'dosje'));
alter table public.herodle_giveups enable row level security;
drop policy if exists herodle_giveups_select on public.herodle_giveups;
create policy herodle_giveups_select on public.herodle_giveups for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists herodle_giveups_insert on public.herodle_giveups;
create policy herodle_giveups_insert on public.herodle_giveups for insert to authenticated with check (user_id = (select auth.uid()));
revoke all on table public.herodle_giveups from anon, authenticated;
grant select, insert (date, mode) on table public.herodle_giveups to authenticated;

-- ---------------------------------------------------------------- namigi (2. faza)
create table if not exists public.herodle_hints (
  hero_id   text primary key references public.herodle_heroes(id) on delete cascade,
  emoji     text[] not null check (cardinality(emoji) = 5),
  palette   text[] not null check (cardinality(palette) between 3 and 5),
  symbol    text,
  dominant  text not null,
  dossier   text[] not null check (cardinality(dossier) = 6)
);
alter table public.herodle_hints enable row level security;
-- brez pravil: namige berejo SAMO security definer funkcije (glede na število napačnih poskusov)
revoke all on table public.herodle_hints from public, anon, authenticated;

-- ---------------------------------------------------------------- napredek v načinih z namigi
create table if not exists public.herodle_progress (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  date        date not null,
  mode        text not null check (mode in ('emoji', 'kostum', 'dosje')),
  wrong       int not null default 0 check (wrong between 0 and 1000),
  solved      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, date, mode)
);
alter table public.herodle_progress enable row level security;
drop policy if exists herodle_progress_select on public.herodle_progress;
create policy herodle_progress_select on public.herodle_progress for select to authenticated using (user_id = (select auth.uid()));
revoke all on table public.herodle_progress from public, anon, authenticated;
grant select on table public.herodle_progress to authenticated;   -- pisanje samo prek herodle_check

-- ---------------------------------------------------------------- pomožne funkcije (private)
create or replace function private.herodle_today()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Ljubljana')::date;
$$;

revoke all on function private.herodle_today() from public, anon;

create or replace function private.herodle_in_pool(p_mode text, p_universe text, p_in_mcu boolean)
returns boolean language sql immutable set search_path = '' as $$
  select case p_mode
    when 'klasika' then true
    when 'klasika-mcu' then coalesce(p_in_mcu, false)
    when 'klasika-dc' then p_universe = 'DC'
    when 'emoji' then true
    when 'kostum' then true
    when 'dosje' then true
    else false end;
$$;

revoke all on function private.herodle_in_pool(text, text, boolean) from public, anon;

-- Primerjava ugibanega lika (a) s skritim (b). ISTA pravila kot compare() v logic.js:
--   ekipa: zeleno = ista glavna (prva) ekipa ali obe brez; rumeno = katera koli skupna ekipa
--   izvor: zeleno = enaki množici; rumeno = vsaj eden skupen
--   leto: zeleno = isto, rumeno = |razlika| ≤ 10; dir: 'up' = skriti je kasnejši
create or replace function private.herodle_cmp(a public.herodle_heroes, b public.herodle_heroes)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'universe', case when a.universe = b.universe then 'g' else 'r' end,
    'team', case when coalesce(a.teams[1], '') = coalesce(b.teams[1], '') then 'g'
                 when a.teams && b.teams then 'y' else 'r' end,
    'species', case when a.species = b.species then 'g' else 'r' end,
    'origin', case when a.origins @> b.origins and b.origins @> a.origins then 'g'
                   when a.origins && b.origins then 'y' else 'r' end,
    'gender', case when a.gender = b.gender then 'g' else 'r' end,
    'year', case when b.first_comic = a.first_comic then 'g'
                 when abs(b.first_comic - a.first_comic) <= 10 then 'y' else 'r' end,
    'dir', case when b.first_comic > a.first_comic then 'up'
                when b.first_comic < a.first_comic then 'down' end,
    'side', case when a.alignment = b.alignment then 'g' else 'r' end
  );
$$;

-- Napolni razpored: SAMO manjkajoči dnevi (pretekli se nikoli ne spremenijo, tudi ko dodaš like).
-- Za vsak dan in način izbere lik iz bazena po vrstnem redu md5(salt || mode || date || id) izmed likov,
-- ki se v tem načinu niso pojavili v zadnjih min(velikost bazena − 1, 120) dneh. Mešani bazen se
-- (če gre) izogne liku, ki je isti dan v Samo MCU / Samo DC; načini z namigi (2. faza) pa liku, ki je
-- isti dan v katerem koli prej izbranem načinu. Vrstni red načinov je del razporeda — ne spreminjaj ga.
create or replace function private.herodle_fill(p_from date, p_days int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  s     text;
  d     date;
  m     text;
  n     int;
  win   int;
  pick  text;
  ins   int := 0;
begin
  if p_days is null or p_days < 1 or p_days > 1000 then raise exception 'invalid_days'; end if;
  select x.salt into s from private.herodle_secret x where x.id = 1;
  if s is null then raise exception 'no_secret'; end if;
  for d in select g::date from generate_series(p_from, p_from + (p_days - 1), interval '1 day') g loop
    foreach m in array array['klasika-mcu', 'klasika-dc', 'klasika', 'emoji', 'kostum', 'dosje'] loop
      perform 1 from public.herodle_daily x where x.date = d and x.mode = m;
      if found then continue; end if;
      select count(*) into n from public.herodle_heroes h where private.herodle_in_pool(m, h.universe, h.in_mcu);
      if n = 0 then continue; end if;
      win := least(n - 1, 120);
      select h.id into pick from public.herodle_heroes h
        where private.herodle_in_pool(m, h.universe, h.in_mcu)
          and h.id not in (select x.hero_id from public.herodle_daily x where x.mode = m and x.date >= d - win and x.date < d)
          and (m in ('klasika-mcu', 'klasika-dc') or h.id not in (select x.hero_id from public.herodle_daily x where x.date = d and x.mode <> m))
        order by md5(s || m || d::text || h.id)
        limit 1;
      if pick is null then
        select h.id into pick from public.herodle_heroes h
          where private.herodle_in_pool(m, h.universe, h.in_mcu)
            and h.id not in (select x.hero_id from public.herodle_daily x where x.mode = m and x.date >= d - win and x.date < d)
          order by md5(s || m || d::text || h.id)
          limit 1;
      end if;
      if pick is not null then
        insert into public.herodle_daily (date, mode, hero_id) values (d, m, pick) on conflict do nothing;
        ins := ins + 1;
      end if;
    end loop;
  end loop;
  return ins;
end $$;
revoke all on function private.herodle_fill(date, int) from public, anon, authenticated;

-- id lika dneva (dopolni razpored, če dan manjka). Samo za funkcije spodaj.
create or replace function private.herodle_target(p_mode text, p_date date)
returns text language plpgsql security definer set search_path = '' as $$
declare
  tid text;
begin
  select x.hero_id into tid from public.herodle_daily x where x.date = p_date and x.mode = p_mode;
  if tid is null then
    perform private.herodle_fill(p_date, 1);
    select x.hero_id into tid from public.herodle_daily x where x.date = p_date and x.mode = p_mode;
  end if;
  if tid is null then raise exception 'no_puzzle'; end if;
  return tid;
end $$;
revoke all on function private.herodle_target(text, date) from public, anon, authenticated;

create or replace function private.herodle_guard(p_mode text, p_date date)
returns void language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_mode is null or p_mode not in ('klasika', 'klasika-mcu', 'klasika-dc', 'emoji', 'kostum', 'dosje') then raise exception 'invalid_mode'; end if;
  if p_date is null or p_date < date '2026-11-22' then raise exception 'invalid_date'; end if;
  if p_date > private.herodle_today() then raise exception 'future_date'; end if;
end $$;
revoke all on function private.herodle_guard(text, date) from public, anon, authenticated;

-- Vidni namigi za lik glede na število napačnih poskusov. ISTA pravila kot logic.hintStage/visibleHints:
--   emoji: prvih min(5, 1 + wrong) · dosje: prvih min(6, 1 + wrong)
--   kostum: paleta vedno; prevladujoča barva pri wrong ≥ 3; simbol (ali univerzum) pri wrong ≥ 5
create or replace function private.herodle_hints_for(p_mode text, p_hero text, p_wrong int)
returns jsonb language sql stable set search_path = '' as $$
  select case p_mode
    when 'emoji' then jsonb_build_object('emoji', to_jsonb(x.emoji[1:least(5, 1 + greatest(p_wrong, 0))]))
    when 'dosje' then jsonb_build_object('dossier', to_jsonb(x.dossier[1:least(6, 1 + greatest(p_wrong, 0))]))
    when 'kostum' then jsonb_strip_nulls(jsonb_build_object(
      'palette', to_jsonb(x.palette),
      'dominant', case when p_wrong >= 3 then x.dominant end,
      'symbol', case when p_wrong >= 5 then
        case when x.symbol is not null then jsonb_build_object('kind', 'symbol', 'text', x.symbol)
             else jsonb_build_object('kind', 'universe', 'text', h.universe) end end))
  end
  from public.herodle_hints x join public.herodle_heroes h on h.id = x.hero_id
  where x.hero_id = p_hero;
$$;
revoke all on function private.herodle_hints_for(text, text, int) from public, anon, authenticated;

-- ---------------------------------------------------------------- RPC: poskus
create or replace function private.herodle_check(p_mode text, p_date date, p_hero_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  g    public.herodle_heroes;
  t    public.herodle_heroes;
  pr   public.herodle_progress;
  w    int;
  res  jsonb;
begin
  perform private.herodle_guard(p_mode, p_date);
  select * into g from public.herodle_heroes h where h.id = p_hero_id;
  if not found then raise exception 'unknown_hero'; end if;
  if not private.herodle_in_pool(p_mode, g.universe, g.in_mcu) then raise exception 'not_in_pool'; end if;
  select * into t from public.herodle_heroes h where h.id = private.herodle_target(p_mode, p_date);
  -- načini z namigi: strežnik šteje napačne poskuse in vrne samo dovoljene namige
  if p_mode in ('emoji', 'kostum', 'dosje') then
    perform 1 from public.profiles p where p.id = auth.uid();
    if not found then raise exception 'no_profile'; end if;
    insert into public.herodle_progress (user_id, date, mode) values (auth.uid(), p_date, p_mode) on conflict do nothing;
    select * into pr from public.herodle_progress x
      where x.user_id = auth.uid() and x.date = p_date and x.mode = p_mode for update;
    if pr.solved then
      return jsonb_build_object('solved', true, 'hero_id', t.id, 'wrong', pr.wrong);
    end if;
    if p_mode = 'dosje' and pr.wrong >= 6 then raise exception 'finished'; end if;
    if g.id = t.id then
      update public.herodle_progress x set solved = true, updated_at = now()
        where x.user_id = auth.uid() and x.date = p_date and x.mode = p_mode;
      return jsonb_build_object('solved', true, 'hero_id', t.id, 'wrong', pr.wrong);
    end if;
    w := pr.wrong + 1;
    update public.herodle_progress x set wrong = w, updated_at = now()
      where x.user_id = auth.uid() and x.date = p_date and x.mode = p_mode;
    res := jsonb_build_object('solved', false, 'wrong', w, 'hints', private.herodle_hints_for(p_mode, t.id, w));
    if p_mode = 'dosje' and w >= 6 then res := res || jsonb_build_object('lost', true, 'hero_id', t.id); end if;
    return res;
  end if;
  if g.id = t.id then
    return jsonb_build_object('solved', true, 'hero_id', t.id, 'result', private.herodle_cmp(g, t));
  end if;
  return jsonb_build_object('solved', false, 'result', private.herodle_cmp(g, t));
end $$;
revoke all on function private.herodle_check(text, date, text) from public, anon;
grant execute on function private.herodle_check(text, date, text) to authenticated;

create or replace function public.herodle_check(p_mode text, p_date date, p_hero_id text)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.herodle_check(p_mode, p_date, p_hero_id);
$$;
revoke all on function public.herodle_check(text, date, text) from public, anon;
grant execute on function public.herodle_check(text, date, text) to authenticated;

-- ---------------------------------------------------------------- RPC: razkritje / predaja
create or replace function private.herodle_reveal(p_mode text, p_date date, p_give_up boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.herodle_guard(p_mode, p_date);
  if p_date >= private.herodle_today() then
    if not coalesce(p_give_up, false) then raise exception 'not_past'; end if;
    perform 1 from public.profiles p where p.id = auth.uid();
    if found then
      insert into public.herodle_giveups (user_id, date, mode) values (auth.uid(), p_date, p_mode) on conflict do nothing;
    end if;
  end if;
  return jsonb_build_object('hero_id', private.herodle_target(p_mode, p_date));
end $$;
revoke all on function private.herodle_reveal(text, date, boolean) from public, anon;
grant execute on function private.herodle_reveal(text, date, boolean) to authenticated;

create or replace function public.herodle_reveal(p_mode text, p_date date, p_give_up boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.herodle_reveal(p_mode, p_date, p_give_up);
$$;
revoke all on function public.herodle_reveal(text, date, boolean) from public, anon;
grant execute on function public.herodle_reveal(text, date, boolean) to authenticated;

-- ---------------------------------------------------------------- RPC: namigi (osvežitev strani)
create or replace function private.herodle_hint(p_mode text, p_date date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tid   text;
  w     int := 0;
  sol   boolean := false;
  lost  boolean;
  res   jsonb;
begin
  perform private.herodle_guard(p_mode, p_date);
  if p_mode not in ('emoji', 'kostum', 'dosje') then raise exception 'invalid_mode'; end if;
  tid := private.herodle_target(p_mode, p_date);
  select x.wrong, x.solved into w, sol from public.herodle_progress x
    where x.user_id = auth.uid() and x.date = p_date and x.mode = p_mode;
  w := coalesce(w, 0);
  sol := coalesce(sol, false);
  lost := p_mode = 'dosje' and w >= 6 and not sol;
  res := jsonb_build_object('wrong', w, 'solved', sol, 'lost', lost, 'hints', private.herodle_hints_for(p_mode, tid, w));
  if sol or lost then res := res || jsonb_build_object('hero_id', tid); end if;
  return res;
end $$;
revoke all on function private.herodle_hint(text, date) from public, anon;
grant execute on function private.herodle_hint(text, date) to authenticated;

create or replace function public.herodle_hint(p_mode text, p_date date)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.herodle_hint(p_mode, p_date);
$$;
revoke all on function public.herodle_hint(text, date) from public, anon;
grant execute on function public.herodle_hint(text, date) to authenticated;

-- ---------------------------------------------------------------- razvojni RPC: primerjava dveh likov
revoke all on function private.herodle_cmp(public.herodle_heroes, public.herodle_heroes) from public, anon;
grant execute on function private.herodle_cmp(public.herodle_heroes, public.herodle_heroes) to authenticated;
create or replace function public.herodle_compare(p_a text, p_b text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.herodle_cmp(a, b) from public.herodle_heroes a, public.herodle_heroes b where a.id = p_a and b.id = p_b;
$$;
revoke all on function public.herodle_compare(text, text) from public, anon;
grant execute on function public.herodle_compare(text, text) to authenticated;

-- ---------------------------------------------------------------- razpored 400 dni naprej (če liki že obstajajo)
select private.herodle_fill(private.herodle_today(), 400) where exists (select 1 from public.herodle_heroes);
