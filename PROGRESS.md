# PROGRESS — MINI GAMES hub

Prompt: `prompts/01-hub.md`. Stanje: **hub končan** (20. 11. 2026).

## Načrt

- [x] Supabase shema (`supabase/schema.sql`): profiles, xp_log, game_scores, achievements, rooms, room_players,
      room_state, moves; RLS povsod; pravice na stolpcih; RPC `award_xp`, `create_room`, `join_room`,
      `find_room`, `claim_host`, `list_lobbies`, `get_leaderboard`, `set_room_state`, `push_move`
- [x] Shema pognana na projektu `mini-games` (3 migracije), advisors: security čist, performance le »unused index« (INFO, nove tabele)
- [x] RLS preizkušen z lažnimi JWT (27 scenarijev: tuji profil, neposreden XP, tuja soba, nečlan → stanje/poteze, omejitve XP …)
- [x] `pg_cron` vklopljen, opravilo `mg_cleanup_rooms` (vsako uro, sobe > 24 h)
- [x] `shared/`: `hub.js`, `room.js`, `ui.js`, `ui.css`, `util.js`, `storage.js`, `config.js`, adapterja `local` in `supabase`
- [x] Offline način (localStorage + BroadcastChannel, gostujoči profil za dodatne zavihke)
- [x] Dashboard (`index.html`): glava z logotipom in profilom, pridružitev s kodo, aktivni lobbyji v živo, igre s filtri,
      skupna lestvica (XP + dnevni zmagovalci), moji dosežki, znak »Offline«
- [x] `games.json` + `games.schema.json` (reakcija in pinball `live`, 14 iger `soon`)
- [x] Demo igra `games/reakcija/` (solo dnevni izziv, multiplayer 2–10, 5 dosežkov, XP)
- [x] Kopija pinballa v `games/pinball/` (+ »← MINI GAMES HUB« in skupni XP ob koncu igre)
- [x] Testi: `node tests/run-node.mjs` in `tests.html` (27/27); pinball testi po kopiranju (38/38)
- [x] Dokumentacija: `README.md`, `CLAUDE.md`, `shared/README.md`, `prompts/TEMPLATE-igra.md`, `supabase/games/README.md`
- [x] Preverjanje v brskalniku (namizje + telefon 375×812), commit

## Dnevnik

- **Shema.** Prva verzija je imela `security definer` funkcije v `public` → advisor je opozoril (6×). Premaknjene v shemo
  `private` (ni izpostavljena prek PostgREST), v `public` ostanejo `security invoker` ovojnice; `is_room_member` in
  `cleanup_old_rooms` sta samo v `private`. Advisor zdaj brez opozoril.
- **Prenos hosta.** Odsotnost hosta zazna klient (presence). Vsi izračunajo istega novega hosta (najstarejši `joinedAt`
  med prisotnimi), ta pa prevzem zapiše v bazo z `claim_host`. Baza dovoli prevzem naslednjemu v vrsti; ostalim, ko je
  host zapustil sobo ali soba »zastara« (host je ni dotaknil 30 s; host jo dotakne vsakih 15 s). Host po 30 s
  odsotnosti igralca odstrani iz `room_players`, da soba ne ostane »polna«.
- **Sinhronizacija ob vstopu.** Nov/vrnjen igralec pošlje `__hello`, obstoječi odgovorijo z `__welcome`
  (host, status, nastavitve), igra pa lahko zahteva svoje stanje (reakcija: `needSync` → `sync`).
- **Popravki po testiranju v brskalniku:** modal je prekrivalo pravilo `body.mg > *` (odstranjeno, CRT črte so zdaj
  `::after` čez vse); enobarvni emoji → dodane barvne emoji pisave; v zavihku v ozadju `requestAnimationFrame` ne sproži,
  zato je reakcija kazala »1 ms« → čas se meri od preklopa in popravi ob izrisu; seznam igralcev v lobbyju se ne
  izrisuje več v celoti (animacija ni utripala); na telefonu se je logo odrezal → kompaktnejša glava;
  `<a class="mg-btn">` je dobil barvo povezave → popravljeno.
- **Preizkušeno v offline načinu (3 zavihki):** ustvari sobo, pridruži se prek `?room=` in s kodo na dashboardu,
  gostujoči profili, »Pripravljen«, nastavitve (št. krogov), igra do konca s stopničkami in XP, »Nova runda« →
  nazaj v lobby, odhod hosta sredi igre (krog 2/5) → Ana prevzame in igra se nadaljuje do konca, osvežitev igralca
  sredi igre → vrne se z istim profilom in dobi stanje, lobby se na dashboardu pojavi v realnem času.
- **Supabase (po vklopu Anonymous sign-ins, 20. 11. 2026):** preizkušeno v brskalniku z `?igralec=1` in `?igralec=2`:
  anonimna prijava, ustvarjanje profila, dnevni izziv (rezultat, XP prek `award_xp`, 3 dosežki v bazi), lobby se pojavi
  na dashboardu drugega igralca, pridružitev s kodo, presence, dvoboj 3 kroge do stopničk, odhod hosta sredi igre →
  drugi igralec prevzame (tudi `rooms.host_id` v bazi prek `claim_host`) in igra se konča; pinball lestvica (`scores`)
  še deluje; konzola brez napak.

## Ni bilo preverjeno

- **Magic link** (povezava profila z emailom, prijava na drugi napravi) — ni preizkušeno (potrebuje email in
  nastavljen Site URL / Redirect URLs).
- **QR koda na telefonu** — generira se (pripeta knjižnica `qrcode-generator@1.4.4`), skeniranje ni preizkušeno.
  Lokalno QR kaže `localhost`, kar s telefona ne deluje; na GitHub Pages bo pravi naslov.
- **Pinball skupni XP ob koncu igre** — koda (`hubXp` v `games/pinball/src/main.js`) je dodana, celotna igra do
  »KONEC IGRE« v brskalniku ni bila odigrana. Pinball se naloži iz podmape brez napak, lestvica (`scores`) deluje,
  testi 38/38.
- **Realne naprave** (iOS Safari, Android Chrome) — preizkušeno le v emulaciji 375×812.
- **GitHub Pages** — repo ni bil pushan (po navodilih).

## Za naslednjo sejo

- V bazi sta testna profila TestAna in TestBor (z rezultatom, XP in dosežki) — po želji ju izbriši.
- Naslednja igra: kopiraj `prompts/TEMPLATE-igra.md`.
