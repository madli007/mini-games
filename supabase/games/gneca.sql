-- =====================================================================
--  GNEČA — shranjen napredek (zobniki, nadgradnje delavnice, zvezdice nivojev)
--  Idempotentno: lahko se požene večkrat. Zahteva supabase/schema.sql (profiles).
--
--  gneca_saves — en JSON zapis na (igralec, slot); bere in piše ga SAMO lastnik (RLS).
--                Splošen vzorec za hub.loadSave / hub.writeSave (shared/README.md):
--                nova igra skopira to datoteko in zamenja predpono.
-- =====================================================================

create table if not exists public.gneca_saves (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  slot        text not null default 'main' check (slot ~ '^[a-z0-9_-]{1,24}$'),
  data        jsonb not null check (pg_column_size(data) <= 60000),
  rev         int not null default 0 check (rev >= 0),
  updated_at  timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.gneca_saves enable row level security;
drop policy if exists gneca_saves_select on public.gneca_saves;
create policy gneca_saves_select on public.gneca_saves for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists gneca_saves_insert on public.gneca_saves;
create policy gneca_saves_insert on public.gneca_saves for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists gneca_saves_update on public.gneca_saves;
create policy gneca_saves_update on public.gneca_saves for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on table public.gneca_saves from anon, authenticated;
grant select, insert, update on table public.gneca_saves to authenticated;
