# MINI GAMES — pravila repoja

Zbirka spletnih iger za igranje s prijatelji (do 10 ljudi). Statična stran na GitHub Pages
(`https://madli007.github.io/mini-games/`), skupni backend Supabase, obvezen offline način.

## Struktura
```
index.html, dashboard.js, dashboard.css   dashboard (seznam iger, profil, naloge, lobbyji, lestvica, dosežki)
shop.html, shop.js, shop.css             trgovina s kozmetiko in garderoba
games.json, games.schema.json             register iger (+ JSON Schema)
shared/                                   skupni API za igre — dokumentacija: shared/README.md
games/<id>/                               ena igra = ena mapa (index.html + svoji moduli)
supabase/schema.sql                       shema huba (idempotentna)
supabase/games/<id>.sql                   lastne tabele posamezne igre (če jih potrebuje)
tests/, tests.html                        testi brez build koraka (tudi simulacija ekonomije)
tools/shop-sql.mjs                        SQL blok kataloga za schema.sql
prompts/README.md                         kazalo promptov (stanje, vrstni red, naslednja prosta številka)
prompts/TEMPLATE-igra.md                  predloga prompta za novo igro
PROGRESS.md                               dnevnik dela
```

## Pravila
- **Brez build koraka** in brez npm odvisnosti v repoju. Čisti HTML/CSS/JS, ES moduli (`<script type="module">`).
- Zunanje knjižnice samo prek CDN z **natančno pripeto verzijo** (npr. `@2.45.4`). Pisave iz Google Fonts so OK;
  brez njih mora vse delovati s sistemskimi pisavami.
- **Vse poti relativne** (repo ni v korenu domene). Nikoli `/shared/...`, vedno `../../shared/...`.
- Vsa besedila v UI so **v slovenščini** s pravilnimi šumniki.
- Vsak dostop do `localStorage`/`sessionStorage` v `try/catch` (uporabi `shared/storage.js`).
- Deluje na telefonu (portret, 375 px) in na namizju. Party igre: host na TV-ju/prenosniku, ostali na telefonih
  (veliki gumbi, `touch-action: manipulation`, brez hover-only interakcij).
- Igre uporabljajo **`shared/`** (`import { hub, ui } from '../../shared/hub.js'`), `ui.css` in razrede `mg-*`.
  Ne podvajaj prijave, profila, lestvic, lobbyja, toastov ali modalov.
- **Offline način je obvezen**: vsaka igra mora delovati brez Supabasea (`?offline=1`), multiplayer pa
  v več zavihkih istega brskalnika. Igra ne sme vedeti, kateri adapter teče.
- Realtime igre: stanje prek `room.send` (broadcast), ne pišemo v bazo za vsak tick. Host preverja pravila
  in mora preživeti **prenos hosta** (`hostChanged`) — stanje redno pošiljaj vsem.
- Potezne/asinhrone igre: `room.setState(..., { expectedVersion })` in `room.pushMove`.
- Lestvice so »na časten način« (brez strežnika ni anti-cheata). XP samo prek `hub.awardXp` (RPC z omejitvami).
- **Vsaka igra po vsaki odigrani igri kliče `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni,
  dnevne/tedenske naloge). Kovanci, nakupi in oprema samo prek RPC (`report_game`, `buy_item`, `equip`, `claim_quest`);
  katalog kozmetike `shared/cosmetics.js` se mora ujemati s `shop_items` v `schema.sql` (`node tools/shop-sql.mjs`).
- Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (z `equipped`), ne z lastnim HTML-jem — tako se kozmetika vidi povsod.

## Supabase in varnost
- Publishable/anon ključ je javen (`shared/config.js`). **Service role ključa nikoli ne daj v repo.**
- RLS je vklopljen na vseh tabelah. Pisanje samo v svoje vrstice; sobe ureja host; `room_state`/`moves`
  pišejo le člani sobe; XP le prek `award_xp`. `security definer` funkcije so v shemi `private`,
  v `public` so le `security invoker` ovojnice.
- Tabele `public.scores` (stara lestvica pinballa z inicialkami) **ne spreminjaj in ne briši**; je samo še arhiv za branje.
  Nove lestvice pinballa (vse mize) gredo prek huba (`game_scores`, po uporabniku, `seed` = `miza:<id>:f<verzija fizike>`).
- Igra, ki potrebuje svoje tabele: SQL v **`supabase/games/<id>.sql`** (idempotenten: `create table if not exists`,
  `drop policy if exists`, RLS vklopljen, imena tabel s predpono igre, npr. `ladjice_*`). Po spremembi sheme
  preveri Supabase advisors (security + performance).

## Nova igra — kontrolni seznam
1. Mapa `games/<id>/` z `index.html` (`<body class="mg">`, `../../shared/ui.css`) in moduli.
2. `await hub.init({ gameId: '<id>' })`, `ui.header({ title })`.
3. Čisto logiko daj v ločen modul (npr. `logic.js`) in jo dodaj v `tests/tests.js`. Po vsaki igri `hub.reportGame(...)`.
4. V `games.json` spremeni vnos iz `"status": "soon"` v `"live"` (ali dodaj nov vnos po `games.schema.json`).
5. Preverjanja (spodaj), posodobi `PROGRESS.md`, commit.

## Testiranje
- Strežnik: `npx --yes http-server@14.1.1 . -p 8124 -c-1` (ali `.claude/launch.json` → `mini-games`).
- Testi: `node tests/run-node.mjs` in `tests.html` v brskalniku. Pinball: `node games/pinball/tests/run-node.mjs`.
- Obvezno pred commitom: konzola brez napak; multiplayer v 2–3 zavihkih z `?offline=1` (ustvari sobo, pridruži se
  s kodo in prek `?room=`, odigraj do konca, odhod hosta sredi igre, osvežitev igralca); telefon (375×812) in namizje.
- `?offline=1` vsili offline način, `?igralec=2` ločeno identiteto (test z več igralci na Supabase).
- Brskalnik upočasni časovnike v zavihkih v ozadju (po nekaj minutah na enkrat na minuto), zato lahko
  igralec v dolgo skritem zavihku »izgine« iz presence. Za daljše teste uporabi ločena okna.

## Prompti
- Kazalo in stanje vseh promptov: `prompts/README.md`. **Nov prompt:** vzemi naslednjo prosto številko iz kazala, ga takoj
  vpiši (⬜) in na vrh prompta dodaj vrstico `> **Stanje:** …`. **Po izvedbi prompta:** stanje na vrhu prompta → ✅ s commitom,
  vrstica v kazalu in oznaka pri točki v `PREDLOGI-IGER.md`. Imen datotek promptov ne spreminjaj.

## Git
- Veja `main`. Commit z opisnim sporočilom v slovenščini. **Ne pushaj**, razen če uporabnik izrecno reče.
