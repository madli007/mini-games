# SQL posameznih iger

Če igra potrebuje svoje tabele (poleg skupnih `game_scores`, `rooms`, `room_state`, `moves` …),
gre njen SQL v `supabase/games/<id>.sql`:

- idempotentno (`create table if not exists`, `create or replace function`, `drop policy if exists`);
- RLS vklopljen na vsaki tabeli, pravila po vzoru `supabase/schema.sql`;
- imena tabel s predpono igre (npr. `plemena_villages`);
- `security definer` funkcije v shemo `private`, v `public` le `security invoker` ovojnice;
- po zagonu preveri Supabase advisors (security in performance).

## Datoteke

| Datoteka | Vsebina |
|---|---|
| `krogla.sql` | ghosti, zlati časi, proge skupnosti (vzorec za `hub.saveGhost`, `hub.publishLevel`) |
| `skoki.sql` | ghosti (več je bolje), pokal (`hub.cupSubmit`) |
| `herodle*.sql` | dnevni junak, namigi, napredek Herodla |
| `gneca.sql` | `gneca_saves` — shranjen napredek (vzorec za `hub.loadSave` / `hub.writeSave`; RLS le svoje vrstice) |
