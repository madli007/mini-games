# PROGRESS — MINI GAMES hub

Prompt: `prompts/01-hub.md`. Stanje: **hub končan** (20. 11. 2026). Nadaljevanje: kovanci in trgovina (spodaj).

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

---

# Kovanci, naloge, trgovina in kozmetika

Prompt: `prompts/02-trgovina.md`. Stanje: **končano** (20. 11. 2026).

## Načrt

- [x] `shared/economy.js` (viri kovancev, omejitve, niz dni, popust), `shared/quests.js` (generator + napredek),
      `shared/cosmetics.js` (94 predmetov) + `shared/cosmetics.css` (vse CSS/emoji, brez slik)
- [x] Shema: `profiles.coins/equipped/streak/best_streak/streak_day` (niso v `grant update`), `shop_items`,
      `inventory`, `coin_ledger`, `quest_progress`; RPC `award_coins`, `report_game`, `buy_item`, `unlock_item`,
      `equip`, `claim_quest`, `set_quest_progress`; `award_xp` podeli nagrado za nivo; trigger na `achievements`
      (+15); `get_leaderboard` in `list_lobbies` vračata `equipped`
- [x] Pognano na projektu `mini-games` (4 migracije `economy_1…4`), advisors pregledani
- [x] RLS z lažnimi JWT: 49 scenarijev (spodaj), testni uporabniki izbrisani
- [x] Lokalni adapter zrcali vsa pravila (testi)
- [x] Hub API: `hub.coins`, `reportGame`, `reportEvent`, `awardCoins`, `getQuests`, `claimQuest`, `onQuests`,
      `getShop`, `buy`, `equip`, `getInventory`; `equipped` v presence sob
- [x] `ui.who` / `ui.avatar` samodejno rišeta opremo; kovanci v glavi (klik → trgovina); `ui.results` + `ui.winFx`
- [x] Dashboard: kartica »Dnevne naloge« (3 + 2, vrstice napredka, Prevzemi, bonus, odštevanje do polnoči),
      profil s pasico, kovanci, nizom in gumbom Trgovina
- [x] `shop.html`: zavihki po vrsti, filter redkosti, dnevna ponudba, predogled na mojem avatarju, potrditev,
      animacija ob nakupu, zavihek »Moje« (garderoba)
- [x] `hub.reportGame` v Reakciji (solo + dvoboj) in pinballu; `reportEvent('reakcija:avg' | 'reakcija:duel')`;
      lastne naloge v `games.json` (Reakcija 3, pinball 2) + razširjena `games.schema.json`
- [x] Testi 42/42 (`node tests/run-node.mjs`, `tests.html`), pinball 38/38
- [x] Dokumentacija: `README.md`, `shared/README.md`, `CLAUDE.md`, `prompts/TEMPLATE-igra.md`

## Ekonomija — uglasitev

Izhodiščna tabela iz prompta ni bila skladna sama s sabo: pri dnevni meji 600 in legendarnem predmetu 1500–2500
bi ga maksimalen igralec kupil v **3–4 dneh** (cilj: ne prej kot v 14). Ker sta cilja »tipičen igralec v 3–5 tednih«
in »maksimalen ne prej kot v 14 dneh« skupaj zahtevala, da je dnevna meja največ ~2× tipičnega zaslužka, sem:

| Vir | Prompt | Zdaj |
|---|---|---|
| odigrana igra | 5 (20/dan) | **4** (20/dan) |
| zmaga v MP | +10 | **+8** (10 zmag/dan šteje) |
| dnevne naloge | 30–60 | **15 / 25 / 40** |
| vse 3 dnevne | +50 | **+25** |
| tedenski | 150–250 | **100 / 150** |
| nov nivo | 25 × nivo (≤300) | **5 × nivo (≤100)** |
| dosežek | 20 | **15** |
| niz dni | 10 … 70 | **5 × dan (5 … 35)** |
| dnevna meja | 600 | **250** |
| award_coins na klic | 300 | **100** |

Cene: navadno 50–150 (nekaj brezplačnih), redko 250–400, epsko 600–1000, **legendarno 3500–4500** (prej 1500–2500).

Simulacija 30 dni (`tests/economy-sim.js`, test »ekonomija: simulacija«):
- **tipičen** (~20 min: 8 iger, 3 v MP, ~1 zmaga, lahka naloga skoraj vedno, srednja 75 %, težka 35 %,
  tedenski 90 % / 60 %, en izpuščen dan na teden): **~132 🪙/dan** → navaden predmet že prvi dan,
  redek (≤400) v 3 dneh, epski (1000) v ~8 dneh, **najcenejši legendarni (3500) 26. dan**, najdražji (4500) po 30. dnevu.
  Dan s prevzemom tedenskih nalog lahko zadene mejo 250 (tedenska nagrada se takrat delno izgubi).
- **maksimalen** (60 iger, vse zmage, vse naloge): vsak dan točno 250 → legendarni **najprej 14. dan**.
- Vseh 94 predmetov stane 47.780 🪙 → tudi pri maksimumu več kot 6 mesecev.

## Dnevnik (trgovina)

- **Napaka v obstoječi `schema.sql`:** ovojnice v `public` so imele `as $` / `$;` namesto `$$` (datoteke se ni dalo
  pognati; v bazi je bila pravilna verzija). Popravljeno.
- **Dnevna ponudba na strežniku:** `util.rng` (cyrb53 + mulberry32 + Fisher–Yates) sem prenesel v SQL
  (`private.mg_hash`, `mg_shuffle`, `mg_daily_offer`; 32-bitno množenje razbito na 16-bitne dele). Rezultat je bit za
  bit enak JS (preverjeno za več dni; referenčni vektor je v testu). Popust izračuna strežnik sam.
- **Prevzem nalog:** strežnik ne pozna generatorja, zato je id naloge `<slot>.<predloga>`; nagrado izračuna iz slota,
  dovoli le trenutni dan/teden in **en prevzem na slot** (delni unikatni indeks) → največ 3 dnevne + 2 tedenski
  nagradi, tudi če bi klient podtaknil drug id. Napredek je »na časten način«.
- **Kozmetika v CSS:** `cosmetics.css` se je sprva nalagal pred pravili `.mg-avatar` iz `ui.css` in ta so povozila
  ozadja/okvirje → zdaj ga strani vključijo za `ui.css` (hub ga doda sam, če manjka, npr. v pinballu).
- **Reakcija:** `reportGame`/`reportEvent` se ne čakata več pred končnim zaslonom (na Supabase je bil zamik ~2 s).
- **RLS z lažnimi JWT (49 scenarijev, vsi pravilni):** nakup brez kovancev (`not_enough_coins`), nakup s tujim
  pogojem (nivo 10 → `locked`), odklep brez dosežka (`locked`) in po njem (ok, +15), odklep plačljivega (`not_free`),
  nakup neaktivnega/neobstoječega (`unavailable`), dvojni nakup (`owned`), neposreden `update coins`/`equipped`
  in `insert` s `coins` (`permission denied`), neposreden zapis v `inventory`/`coin_ledger`/`shop_items`, klic
  `private.grant_coins` (zavrnjeno), opremljanje nekupljenega/pogojnega/napačnega slota, dvojni prevzem naloge
  in prevzem drugega id-ja v istem slotu (`claimed`), stara naloga (`expired`), napačen slot (`invalid`),
  `claimed_at` neposredno (zavrnjeno), napredek le narašča, bonus +25 ob tretji dnevni, dnevna meja 250
  (tedenska 150 → dobljenih 128, `award_coins` po meji 0), `award_coins(500)` ≤ 100, nagrada za nivo (1 → 3: 10 + 15),
  drugi igralec bere tuj inventar in `equipped`, ne pa `coin_ledger` in `quest_progress`; tujega napredka ne more spremeniti.
- **Brskalnik offline (2 zavihka):** dnevni izziv v Reakciji → kovanci (niz + igra + dosežki), toast »Naloga
  opravljena«, prevzem na dashboardu, nakup okvirja prek UI (potrditev, animacija, »Opremi zdaj«), nakup
  legendarnega okvirja, neon vzdevka, naslova, značke in ognjemeta, garderoba (Opremi/Sneži), gost v lobbyju vidi
  opremo, dvoboj do konca → stopničke z opremo, ognjemet ob zmagi, poraženec dobi 4 + 5 🪙. Konzola brez napak.
- **Brskalnik s Supabase (`?igralec=1`, `?igralec=2`):** TestAna: dnevni izziv (54 🪙 v `coin_ledger`), napredek nalog
  v `quest_progress`, prevzem (69 🪙), nakup naslova prek UI in okvirja/barve vzdevka/značke/učinka (testni kovanci
  dodeljeni v SQL), strežnik zavrne zaklenjeno krono in nekupljen okvir. TestBor vidi iste naloge, TestAnino opremo
  v seznamu lobbyjev (`host_equipped`), v lobbyju (presence), na stopničkah in na lestvici (`get_leaderboard`).
  Testna profila na koncu izbrisana; `scores` (pinball) nedotaknjena (10 vrstic).
- **Telefon 375×812:** dashboard (naloge v dveh vrsticah, gumb Prevzemi čez celo širino), trgovina (2 stolpca),
  glava s kovanci. Popravljeno: odrezan neon sij vzdevka, pisava podnaslova tedenskih nalog.

## Ni bilo preverjeno (trgovina)

- **Pinball do konca igre** — `hub.reportGame` je dodan v `hubXp` ob »KONEC IGRE«; preverjeno le, da se pinball
  naloži brez napak in da `reportGame({ game: 'pinball', score })` iz konzole podeli kovance in napredek nalog.
- **Prehod polnoči v živo** (nove naloge in ponudba ob 00:00 po Ljubljani) — logika je testirana (ISO teden,
  ljubljanski dan), odštevanje deluje, samega trenutka prehoda nisem čakal.
- **Niz več dni** — testiran v enotskih testih in v simulaciji, v brskalniku le dan 1.
- **`prefers-reduced-motion`** — pravila so v CSS (`cosmetics.css`, `ui.css`), emulacije v brskalniku nisem vklopil.
- **Realne naprave** (iOS/Android) in Safari (maska `-webkit-mask-composite` za mavrični/zlati obroč).

## Za naslednjo sejo

- V Supabaseu ni treba narediti ničesar: shema je pognana. Po vsaki spremembi kataloga
  `node tools/shop-sql.mjs` → blok `SHOP_ITEMS` v `schema.sql` → poženi shemo (ali le ta blok).
- Opozorilo advisorja »Leaked Password Protection« (Auth) se ne nanaša na hub (gesel ni); po želji ga vklopi v
  *Authentication → Settings*.
- Naslednja igra: kopiraj `prompts/TEMPLATE-igra.md` (fiksni del zdaj zahteva `hub.reportGame`).

---

# Potapljanje ladjic (`games/ladjice/`)

Prompt: `prompts/04-ladjice.md`. Stanje: **končano** (20. 11. 2026).

## Načrt

- [x] `games/ladjice/content.js` — kapitani, predmeti, modifikatorji, pogodbe (≥12), komentator (≥25), dosežki
- [x] `games/ladjice/logic.js` — čist pogon pravil (stanje + `act`), PRNG v stanju (prenos hosta), flote, zaboji,
      sposobnosti, pasivke, mana, predmeti, BR twisti (glava, maščevanje, duhovi), konec/neodločeno, dnevni izziv
- [x] `games/ladjice/ai.js` — Mornar / Kapitan / Admiral (verjetnostna mapa, premišljene sposobnosti)
- [x] testi v `tests/tests.js` (postavitev, strel/zadetek/potop, vse sposobnosti in pasivke, mana, zaboji, EMP,
      konec in neodločeno, AI brez dvojnih strelov, determinističen dnevni izziv) + popravek testa »soon nima nalog«
- [x] `fx.js` — WebAudio zvoki, ocean canvas, projektil/pljusk/eksplozija/potop, tresenje, vibracija
- [x] `index.html`, `game.css`, `game.js` — meni, postavitev (drag&drop, rotacija, naključno, časovnik),
      igralni zaslon (telefon/namizje), killfeed + komentator, emote, krožni časovnik, »zadnji zdihljaj«
- [x] Solo proti AI (3 težavnosti), dnevni izziv (kapitan + modifikator dneva, lestvica asc)
- [x] Multiplayer: lobby (kapitani, nastavitve, TV), dvoboj, battle royale, host stanje (`setState`+`pushMove`),
      prenos hosta, ponovna povezava, odklopljeni → AI, izločitev po 2 min, revanša
- [x] TV pogled (`?tv=1` / gumb v lobbyju)
- [x] Povzetek ob koncu (nagrade, pogodbe), XP, dosežki (11), `reportGame`, `reportEvent`
- [x] `games.json`: live, opis, players.min 1, oznake, naloge (10)
- [x] Preverjanja v brskalniku (konzola, testi, MP 2–3 zavihki, telefon/namizje), commit

## Dnevnik

- **Logika in AI** (content/logic/ai.js) + 15 testov uspešnih. Admiral v povprečju ~36 strelov za floto, Kapitan ~37, Mornar ~95.
  Pogodbe: 15, komentator: ~60 vrstic. Stanje igre je en JSON (tudi PRNG `rs`) → host ga shrani v room_state.
- **UI napisan** (fx.js, index.html, game.css, game.js — vse funkcije, tudi MP/TV). Solo igra v brskalniku odigrana do
  konca (povzetek, nagrade, pogodbe, XP), postavitev (vleka, obrat), torpedo način. Telefon: spodnji del v 2 stolpcih.
- **Brskalnik (offline):** dnevni izziv do konca (lestvica, +40 XP, en poskus/dan, nato vaja). MP s 3 zavihki: soba,
  pridružitev prek `?room=` in s kodo, zasedeni kapitani v lobbyju, BR 8×8, osvežitev igralca sredi igre (ista identiteta,
  stanje iz room_state), odhod hosta → nov host nadaljuje, odklopljenega igra AI.
- **Popravki po testu:** animacije čakajo največ dur+250 ms (v nerišočem zavihku `finished` ne pride → vrsta je obvisela);
  `navigator.vibrate` le po interakciji (sicer napaka v konzoli); obrazec za kodo ne pošlje strani pred `hub.init`;
  telefon: spodnji del v dveh stolpcih, manjše čipe, skrita vrstica tarče v dvoboju; debelejše ladje.
- **Dvoboj in TV (3. zavihek z `?tv=1`):** TV je izključen iz igre (2 igralca → dvoboj 10×10), kaže mreže obeh z meglo
  vojne, projektile, killfeed in lestvico preživelih; igra do konca (»… je kralj morja!«), rezultati pri vseh.
  Revanša v isti sobi (host) → nova postavitev pri vseh. Odhod hosta sredi dvoboja → drugi prevzame, odklopljenega igra AI.
- **Sprememba v `shared/room.js`:** host je odsotne igralce po 30 s odstranil iz `room_players` tudi med igro, zato se
  igralec po daljši odsotnosti ni mogel vrniti (`room_started`). Zdaj jih odstrani le v lobbyju; med igro o izločitvi
  odloča igra (ladjice: po 2 min). Testi huba in pinballa še uspešni.
- **Supabase:** igra ne potrebuje lastnih tabel (stanje v `room_state`, poteze v `moves`, lestvica v `game_scores`).
  V Supabaseu ni treba pognati ničesar.

## Ni narejeno / ni bilo preverjeno (ladjice)

- **Supabase način** ni bil preizkušen v brskalniku (le offline). API je isti, sheme ni bilo treba spreminjati.
- **Prava naprava** (vibracija, zvok na iOS, dotik/vlečenje na telefonu) — le emulacija 375×812 in miška.
- **Meteor duha prek UI** — logika je testirana (test BR), gumb je narejen; v brskalniku se je izločeni igralec vrnil šele
  po odstranitvi iz sobe (zato popravek v room.js), meteorja v živo nisem sprožil.
- **`prefers-reduced-motion`** — pravila so v CSS/JS (animacije izklopljene, `FX.reduced()`), emulacije nisem vklopil.
- **Igra z 5–10 igralci** (mreža 7×7) — preizkušeno le v testih (AI simulacija BR s 3–5 igralci), v brskalniku s 3.
- **Dosežki** `royale`, `duh`, `vsi-kapitani`, `pogodbenik`, `snajper` — koda je, v brskalniku niso bili doseženi.
- Pogodba se izbere na zaslonu postavitve; na telefonu je pod mrežo (treba se je pomakniti).
