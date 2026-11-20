-- =====================================================================
-- ALU PINBALL — skupna lestvica rekordov (Supabase)
-- Zaženi enkrat v Supabase: SQL Editor → New query → prilepi → Run.
-- Varno za ponovni zagon (ne briše obstoječih rekordov).
--
-- Zaščita (brez lastnega strežnika):
--   1. igralec lahko rekord samo DODA in BERE (ne more spreminjati ali brisati),
--      bere samo ime, točke in datum;
--   2. omejitve v tabeli: ime 1–3 znaki iz abecede igre, točke deljive z 10,
--      razumni razponi, datum nastavi baza;
--   3. preverjanje smiselnosti (sprožilec): točke glede na čas igre,
--      multiballe, misije in finale (meje izmerjene z botom + velika rezerva);
--   4. omejitev pošiljanja: največ 10 rekordov na minuto skupaj,
--      isto ime največ enkrat na 20 s.
-- Brisanje lažnih rekordov: Table Editor → scores → izberi vrstico → Delete.
-- =====================================================================

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  name        text        not null,
  score       bigint      not null,
  play_sec    integer     not null,
  multiballs  smallint    not null default 0,
  modes       smallint    not null default 0,
  wizards     smallint    not null default 0,
  max_jackpot bigint      not null default 0,
  max_combo   smallint    not null default 0,
  version     text        not null default '',
  created_at  timestamptz not null default now(),

  constraint scores_name_ok    check (name ~ '^[A-ZČŠŽ0-9·?\- ]{1,3}$'),
  constraint scores_score_ok   check (score > 0 and score <= 500000000 and score % 10 = 0),
  constraint scores_time_ok    check (play_sec between 20 and 10800),
  constraint scores_counts_ok  check (multiballs between 0 and 100 and modes between 0 and 200
                                      and wizards between 0 and 50 and max_combo between 0 and 100),
  constraint scores_jackpot_ok check (max_jackpot >= 0 and max_jackpot <= score),
  constraint scores_version_ok check (length(version) <= 16)
);

create index if not exists scores_score_idx   on public.scores (score desc);
create index if not exists scores_created_idx on public.scores (created_at);

-- ---------------------------------------------------------------------
-- preverjanje smiselnosti in omejitev pošiljanja
-- ---------------------------------------------------------------------
create or replace function public.scores_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_at := now();

  -- točke glede na čas (bot: največ ~111.000/s; dovolimo 400.000/s + 2 mio)
  if new.score > 400000::bigint * new.play_sec + 2000000 then
    raise exception 'neverjeten rezultat: preveč točk za čas igre';
  end if;
  -- velik rezultat brez multiballa, misije ali finala ni mogoč (bot: največ ~1,7 mio)
  if new.score > 5000000 and new.multiballs + new.modes + new.wizards = 0 then
    raise exception 'neverjeten rezultat: brez multiballa in misij';
  end if;
  -- zelo velik rezultat zahteva finale (bot: največ ~53 mio brez finala)
  if new.score > 100000000 and new.wizards = 0 then
    raise exception 'neverjeten rezultat: brez finala';
  end if;
  -- finale zahteva vse 4 misije
  if new.modes < 4 * new.wizards then
    raise exception 'neverjeten rezultat: finale brez misij';
  end if;

  -- omejitev pošiljanja
  if (select count(*) from public.scores where created_at > now() - interval '1 minute') >= 10 then
    raise exception 'preveč rekordov naenkrat, poskusi čez minuto';
  end if;
  if exists (select 1 from public.scores
             where name = new.name and created_at > now() - interval '20 seconds') then
    raise exception 'počakaj nekaj sekund';
  end if;

  return new;
end;
$$;

-- funkcijo kliče samo sprožilec, ne API
revoke execute on function public.scores_check() from public, anon, authenticated;

drop trigger if exists scores_check on public.scores;
create trigger scores_check
  before insert on public.scores
  for each row execute function public.scores_check();

-- ---------------------------------------------------------------------
-- dostop: samo branje (ime, točke, datum) in dodajanje
-- ---------------------------------------------------------------------
alter table public.scores enable row level security;

revoke all on public.scores from anon, authenticated;
grant select (name, score, created_at) on public.scores to anon, authenticated;
grant insert (name, score, play_sec, multiballs, modes, wizards, max_jackpot, max_combo, version)
  on public.scores to anon, authenticated;

drop policy if exists "scores_branje" on public.scores;
create policy "scores_branje" on public.scores
  for select to anon, authenticated using (true);

drop policy if exists "scores_vpis" on public.scores;
create policy "scores_vpis" on public.scores
  for insert to anon, authenticated with check (true);
