# Prompt za AI agenta: napredek igralcev online — kariera Skokov, Krogla, Ladjice in dnevni poskusi

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 40 je narejen: `hub.loadSave` / `hub.writeSave`)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/45-napredek-online.md in ga v celoti izvedi.«**
>
> Ozadje: uporabnik (28. 11. 2026): **kariera in napredek ne smeta biti samo lokalna, morata biti online.** Kariera
> Smučarskih skokov je zdaj samo v `localStorage` — na drugi napravi (ali po brisanju brskalnika) je ni. Prompt 40 je
> dodal splošen API za shranjen napredek; ta prompt nanj prenese vse obstoječe igre.

---

## Kaj že obstaja

- **`hub.loadSave({ slot })` → `{ data, rev, updated_at } | null`** in **`hub.writeSave(data, { slot, rev })` → `true|false`**
  (`shared/hub.js`, oba adapterja; dokumentacija v `shared/README.md`, razdelek »Shranjen napredek igre«).
  Supabase: tabela `<igra>_saves` (`user_id`, `slot`, `data jsonb` ≤ 60.000, `rev`, `updated_at`; pk `(user_id, slot)`,
  RLS le svoje vrstice) — vzorec `supabase/games/gneca.sql`. Offline: `localStorage` `db:saves`.
- **Vzorec v igri:** `games/gneca/game.js` (`loadProgress`, `saveProgress`) in `games/gneca/upgrades.js`
  (`sanitizeProgress`, `newerProgress`): lokalna kopija kot predpomnilnik, ob nalaganju zmaga večji `rev`, lokalno novejši
  zapis (igral brez povezave) se pošlje na strežnik.

## Kaj je zdaj samo lokalno (preveri z `grep -n "S.save(" games/*/[a-z]*.js`)

| Igra | Ključi (`shared/storage.js`) | Kaj |
|---|---|---|
| Smučarski skoki | `skoki:career:<userId>` (`career-ui.js`) | **kariera** (lige, sezona, točke, statistika) — prednostno |
| | `match.js`: skakalci (`jKey`), statistika (`sKey`); `game.js`: `skoki:stats`, dnevni poskus (`dailyKey`), osebni rekordi + ghost (`bestKey`) | |
| Hrčkova krogla | `uk('best')`, `uk('reached')` (odklepi turnirjev), `uk('mirror')`, `uk('weeks')`, `uk('save:<turnir>')` (nadaljevanje turnirja), `uk('daily:<seed>')` | najboljši časi, odklepi, turnirji |
| Potapljanje ladjic | `ladjice:level`, `ladjice:daily:<id>:<seed>`, pogodbe/zbirke (`keyC`, set na ~vrstici 1134) | nivo AI, dnevni poskus, zbirke |
| Dirka frnikol | `dailyKey()` | dnevni poskus (»prvi poskus šteje«) |
| Ustavi uro, Zaporedje, Rušilec | preveri | dnevni poskusi / statistika |

Nastavitve (zvok, kakovost, filtri pogleda) **ostanejo lokalne** — to ni napredek.

## Naloga

1. **Skoki najprej:** kariera (`career-ui.js` `load`/`save`) na `hub.loadSave({ slot: 'kariera' })` / `hub.writeSave`.
   Ohrani obstoječe `CA.restoreCareer` (validacija) in izvoz/uvoz kode. Ob prvem zagonu po spremembi **preseli** obstoječo
   lokalno kariero na strežnik (ne izgubi je). Enako za skakalce in statistiko (`slot: 'skakalci'`, `'statistika'` ali en zapis).
   Če zapis preseže 60.000 znakov, ga skrči (npr. zgodovina zadnjih N sezon) — ne razširjaj omejitve brez razloga.
2. **Dnevni poskusi** (»prvi poskus šteje«) vseh iger: zapis na strežnik, da igralec na drugi napravi ne dobi novega
   »prvega« poskusa. Lahko en `slot: 'dnevni'` na igro z zadnjimi ~40 dnevi.
3. **Krogla, Ladjice, Frnikole** in ostale z napredkom: isti vzorec.
4. SQL: `supabase/games/<igra>.sql` dobi tabelo `<igra>_saves` (kopija `gneca.sql` z zamenjano predpono) za vsako igro.
   Razmisli, ali je bolje **ena skupna tabela huba** `game_saves (user_id, game, slot, …)` v `supabase/schema.sql` (manj tabel,
   isti API) — če jo izbereš, prenesi tudi `gneca_saves` in posodobi adapter (`<igra>_saves` → `game_saves` z `game`),
   dokumentacijo in teste. Odločitev in razlog zapiši v `PROGRESS.md`.
5. Migracije poženi prek Supabase MCP in preveri `get_advisors` (security + performance).
6. **Konflikti:** dve napravi hkrati — zmaga večji `rev`; ob enakem `rev` igra izbere »več napredka« (kot `newerProgress`).
   Napiši čisto funkcijo za vsako igro in test.

## Testi
- Za vsako igro: serializacija → `sanitize` → enako; star lokalni + nov oddaljen zapis → izbran novejši; selitev obstoječe
  lokalne kariere Skokov (fixture) brez izgube.
- Lokalni adapter: obstoječi test `loadSave/writeSave` (`tests/tests.js`) ostane zelen; če uvedeš `game_saves`, ga razširi.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Napredek online«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API, zlasti »Shranjen napredek igre«.
3. `games/gneca/game.js` (`loadProgress`, `saveProgress`) in `games/gneca/upgrades.js` — vzorec.
4. `games/skoki/career-ui.js`, `games/skoki/sport/` (kariera), `games/skoki/match.js`.

### Tehnično
- **Brez build koraka**, ES moduli, relativne poti, besedila v slovenščini. Igra ne sme vedeti, kateri adapter teče.
- Vsak dostop do `localStorage` prek `shared/storage.js`. Tuj vnos (zapis s strežnika) vedno validiraj.
- Offline način (`?offline=1`) mora delovati kot prej.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v vseh spremenjenih igrah in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi).
4. Supabase (`?igralec=N`): odigraj tekmo kariere Skokov, izbriši lokalno kopijo, osveži → kariera je nazaj s strežnika.
   Enako za vsaj eno drugo igro in za dnevni poskus. Preveri v bazi (`execute_sql`), da so zapisi pod pravim uporabnikom.
5. Selitev: brskalnik s staro lokalno kariero (pred spremembo) → po spremembi je kariera na strežniku, nič izgubljeno.
6. Posodobi `PROGRESS.md`, `shared/README.md` (če se API spremeni), README-je iger in **stanje prompta**: vrstica na vrhu →
   ✅ s commitom, vrstica v `prompts/README.md` (in seznam »Kaj lahko poženem zdaj«).
7. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: katere igre zdaj shranjujejo napredek online, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
