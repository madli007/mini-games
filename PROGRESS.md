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

---

# Hrčkova krogla (`games/krogla/`)

Prompt: `prompts/03-krogla.md`. Stanje: **končano** (21. 11. 2026).

## Načrt

- [x] Fizika (`physics.js`): fiksni korak 120 Hz, naklon, trenje (tla/led/lepilo), trki s ploščicami, kvadri, vrati in premičnimi
      ploščicami, podkoraki (ne skozi tanko steno), padec → kontrolna točka po 1,2 s; premične/padajoče/vrtljive plošče, trakovi,
      vzmeti, ventilatorji, dvigala, odbijači, kladiva, stikala + vrata, sklede, valovita tla; nasilneži, žage, ose, sesalci, magneti
- [x] Format prog, validator in zrcaljenje (`level.js`), 12 prog v 3 sklopih (`levels/*.json`), generator `tools/krogla-levels.mjs`
- [x] Pravila (`rules.js`): ura s prenosom, težavnosti, točke, medalje, odklepi, dnevni izbor + 5 dodatkov, 10 dosežkov
- [x] Ghosti (`ghost.js`, ~12 KB za 2 min), skupni API `hub.saveGhost/getGhosts/getGhost` (oba adapterja), `ui.leaderboard({ onRow })`
- [x] `supabase/games/krogla.sql` pognan kot migracija `krogla_ghosts`, advisors preverjeni, RLS/RPC preizkušen z lažnimi JWT
- [x] Izris Three.js 0.160.0 (`render.js`), vhod (tipke, miška, palica, nagib), WebAudio zvok in glasba, samodejna kakovost
- [x] Načini: turnir, na čas (medalje, ghosti: moj / razvijalčev / s lestvice), zrcalni turnir, dnevni izziv (prvi poskus šteje)
- [x] Hub: `reportGame`, `reportEvent` (`krogla:proga|gold|sklop|turnir`), XP, dosežki, 4 naloge v `games.json`, vnos `live`
- [x] Testi (14 novih, skupaj 70/70 v Node in `tests.html`), preverjanje v brskalniku, dokumentacija

## Proge (autopilot · zlato / srebro / bron · ura na Normalni)

| # | Proga | Novo | Autopilot | Medalje | Ura |
|---|---|---|---|---|---|
| 1 | Ogrevanje | široka pot, klančine | 17 s | 17 / 22 / 29 | 28 s |
| 2 | Vrtnarija | ozke poti brez ograj, zavoji | 28 s | 28 / 36 / 47 | 41 s |
| 3 | Skodelice | sklede, valovita tla | 19 s | 19 / 25 / 32 | 30 s |
| 4 | Kuhinja | premične ploščice čez prepade | 46 s | 45 / 59 / 76 | 63 s |
| 5 | Steklena pot | ozki mostovi, padajoče ploščice | 30 s | 30 / 39 / 50 | 44 s |
| 6 | Tovarna | trakovi, kladiva, stikalo + vrata | 28 s | 27 / 36 / 46 | 41 s |
| 7 | Stolp | spirala navzgor, dvigalo, ventilatorji | 34 s | 34 / 45 / 57 | 50 s |
| 8 | Ledena dvorana | led, lepilo, vzmeti čez prepad | 22 s | 22 / 29 / 37 | 34 s |
| 9 | Nasilneži | sovražne krogle, magneti | 18 s | 18 / 23 / 30 | 29 s |
| 10 | Neon | vrtljive plošče, žage, ose | 24 s | 24 / 31 / 40 | 37 s |
| 11 | Nebo | skoki z rampe, sesalec, vse skupaj | 20 s | 20 / 26 / 34 | 32 s |
| 12 | Nemogoče | kratka, zelo težka | 25 s | 25 / 33 / 42 | 38 s |

Autopilot vozi previdno (5–6 enot/s, čaka na premične dele), zato je zlato ≈ njegov čas (težko), bron ≈ 1,65 × (dosegljiv).
Ura proge = 1,25 × autopilot + 6 s; autopilot je pred zaostritvijo končal turnir na Normalni s 5 min rezerve, zdaj ima po izračunu ~2,5 min (+ ure).

## Dnevnik

- **Fizika** je višinsko polje ploščic (vsaka ploščica ima funkcijo višine: ravno, klančina, valovi, sklede), krogla je
  »točka na tleh« s polmerom za trke. Stopnica > 0,22 je zid. Premične ploščice in vrtljive plošče so dodatne površine, ki
  kroglo prenašajo. Vse sovražnike in ovire poganja čas proge (deterministično), nasilneže pa stanje — ghosti in časi so pošteni.
- **Proge** gradi »želvica« v generatorju (naprej, zavij, klančina, prepad …), ki sproti zapiše pot za autopilota.
  Z `--dump=NN` se izriše proga s potjo in mesti padcev. Pri uglaševanju popravljeno: klančina tik pred zavojem se je
  prepisala (zdaj ni klančin na zadnji ploščici pred zavojem), vrtljive plošče so morale pokriti prepad, vzmeti in skoki so
  dobili več moči/zaleta, kladiva in ose imajo okna, ki jih autopilot počaka (`until`).
- **Preizkušeno v brskalniku (offline):** cel turnir 12/12 na Normalni z `?bot=1` (autopilot skozi pravo zanko igre:
  odštevanje, ura s prenosom, točke, povzetki prog, dosežki, `ui.results`), na čas z razvijalčevim ghostom (zlato, ghost
  shranjen, +50 XP), izbira ghosta s klikom na lestvico, zrcaljena Kuhinja, dnevni izziv (uradni poskus → nato trening),
  ročno: padec čez rob → vrnitev na start, ura teče, pavza ob skritem zavihku (sprožila se je sama, ko je bil pano skrit),
  konec ob poteku ure (Noro). Dashboard: kovanci, napredek naloge »Odigraj igro Hrčkova krogla«, dosežki.
- **Supabase (`?igralec=1`, `?igralec=2`):** igralec 1 prevozi Ogrevanje → vrstica v `game_scores` (`lvl:01-ogrevanje`) in
  ghost v `krogla_ghosts` (1,8 KB); igralec 2 vidi rezultat na lestvici proge, klik na vrstico naloži ghost, vožnja z njim.
  RLS z lažnimi JWT: boljši čas se shrani, slabši ne, zrcalo ločeno; zavrnjeno: nemogoč čas (< 30 % zlata), prevelik in
  neveljaven `data`, neznana proga, neposreden insert/update (tudi s tujim `user_id`), pisanje v `krogla_levels`, anon.
  Testna profila (KrTest1, KrTest2) in njune vrstice so izbrisani.
- **Popravki po testiranju:** zagon pred inicializacijo spremenljivk (TDZ) → `boot()`; zvezdica na startu (Ogrevanje, Stolp);
  lokalni odklepi/rekordi/dnevni poskus so bili skupni za brskalnik → zdaj ključi na igralca (`krogla:u:<id>:…`), dnevni
  poskus se preveri še na strežniku; dodatek »Vse je led« je bil prepolzek (zdaj »spolzka« tla z več nadzora), »pol časa«
  prestrog (zdaj 65 %); rezultat 0 se ne odda; glava menija na telefonu postavljena v stolpec.
- **Advisors po migraciji:** varnost — le znana `auth_allow_anonymous_sign_ins` (kot vse tabele huba, namerno); zmogljivost —
  `unused_index` za `krogla_ghosts_board` (INFO, nova tabela).

## Ni bilo preverjeno

- **Ročna igra po vseh progah** — proge so preverjeno rešljive z autopilotom (test + `?bot=1` v brskalniku), ročno sem vozil
  le kratke odseke (tipke, palica). Občutek kontrol, težavnost za človeka in medalje »zlato težko, bron v 2–3 poskusih«
  so uglašeni na autopilotu, ne na lastnih vožnjah — priporočam igranje in popravek faktorjev v generatorju.
- **Dodatek »Vse je led« na Tovarni** — autopilot pade (kladiva + spolzka tla); človek naj bi zmogel, ni preverjeno.
- **Nagib telefona** (`deviceorientation`, iOS dovoljenje) in **resnične naprave** — le emulacija 375×812 (palica, FPS).
- **Zvok/glasba** — koda teče brez napak, poslušano ni bilo (brskalnik v avtomatizaciji).
- **Samodejno zniževanje kakovosti** — v emulaciji je bilo 240 FPS, zato se ni sprožilo.
- **Miška kot palica** — logika je, v avtomatiziranem brskalniku ni bila preizkušena.
- Pinball test »multiball se začne s 3 žogicami« občasno pade (ok 3/4 zagonov) — obstaja že pred to igro, ni povezan s kroglo.

## Hrčkova krogla — grafika

Prompt: `prompts/05-krogla-grafika.md`. Stanje: **končano** (21. 11. 2026). Igranje, fizika, proge, časi in ghosti nespremenjeni.

### Načrt
- [x] Three.js 0.160.0 prek importmap, ACES, sRGB, IBL iz proceduralnega neba (PMREM, predpomnjeno po lokaciji)
- [x] 10 lokacij (`render/looks.js`): vrt v zlati uri, kuhinja (bokeh), jutro nad oblaki, tovarna ob mraku, stolp, ledena dvorana, arena, neon, nebo ob zahodu, ognjeni prepad
- [x] Nebo (gradient, sonce, FBM oblaki, morje oblakov, zvezde, sintetski horizont, lava), FogExp2
- [x] Mehke sence, ki sledijo krogli s pripenjanjem na teksel mrežo; kontaktna senca vedno; kavstika (ultra/visoka)
- [x] Vertex AO na terenu, GTAO na ultra; bloom, barvna korekcija, vinjeta, kromatska aberacija, tilt-shift (samo ozadje), SMAA/FXAA
- [x] Proceduralne PBR teksture (barva + normal + roughness/metalness) za ~20 vrst podlag, predpomnjene
- [x] Zaobljen svetel rob proge (instanciran), detajli pod robom po lokaciji, led s transmisijo (ior 1,31), lepilo s clearcoat
- [x] Krogla: prava transmisija ali lažno Fresnel steklo, praske, šiv, loputa, luknjice, vzorci; hrček s shell texturing krznom, oči, ušesa, brki; tek/panika/veselje
- [x] Objekti: zlat cilj z žarkom, plapolajoče zastavice, kovinske zvezdice/ure (razpad v delce), kladiva z rdečo talno oznako, žage z zameglitvijo in iskrami na vodilih, ventilatorji/sesalci z vidnim tokom, magneti z valovanjem, nasilnež iz karbona, ose s prosojnimi krili
- [x] Kamera: vzmetno sledenje, FOV pri hitrosti, punch ob trku, uvodni prelet (preskočljiv), dither prosojnost ovir
- [x] Kakovosti Ultra/Visoka/Srednja/Nizka + samodejno; nastavitve post/DoF/tresenje; izguba konteksta → Nizka
- [x] Meni s 3D preletom (autopilot vozi progo; na Nizki statično), steklasti HUD, nalagalnik
- [x] Draw calli < 150 (ultra 114–136), pomnilnik stabilen

### Meritve (RTX 5080, Chromium; čas sličice = render + readPixels, sinhrono)
| | prej (proga 1) | po (proga 1) | po (proga 6) |
|---|---|---|---|
| Ultra 1440×900 | — | 114 klicev, 0,50 M tri, 3,6 ms | 136 klicev, 1,7 ms |
| Visoka 1440×900 | 30 klicev, 6,6 k tri, 0,63 ms | 77 klicev, 0,26 M tri, 1,2 ms | 87 klicev, 1,2 ms |
| Srednja | 31 klicev, 0,54 ms | 53 klicev, 0,9 ms | 60 klicev, 1,0 ms |
| Nizka | 31 klicev, 0,48 ms | 36 klicev, 0,6 ms | 42 klicev, 0,9 ms |
| Telefon 375×812 (samodejno = Nizka) | 31 klicev, 0,50 ms | 35 klicev, 0,54 ms | — |

Pomnilnik po 3× vseh 12 progah: 50 geometrij, 89 tekstur, 36 programov (ne raste). Toplo nalaganje proge ~80 ms; hladna tekstura 15–70 ms (predpripravljeno v času mirovanja, sicer nalagalnik).
Zasloni prej/po: scratchpad seje (`shots/prej-*.jpg`, `shots/po-*.jpg`).

### Ni bilo preverjeno
- Realen FPS: brskalniško okno je bilo skrito (rAF omejen na 30 sličic/s), zato so meritve časovne (ms na sličico), ne FPS; pravi telefon ni bil preizkušen (≥ 45 FPS ni izmerjen na napravi).
- `prefers-reduced-motion` preverjen le s simulacijo (`renderer.reduced = true`), ne s sistemsko nastavitvijo.
- Firefox/Safari (iOS) in WebGL1 rezerva.

## Hrčkova krogla — urejevalnik prog

Prompt: `prompts/06-krogla-urejevalnik.md`. Stanje: **končano, vključno s točko 6** (proge skupnosti na Supabase, 22. 11. 2026).
Fizika, renderer, uradne proge, časi, lestvice in ghosti uradnih prog nespremenjeni.

### Načrt
- [x] Skupna logika: `themes.js` (teme iz generatorja), `rules.js` → `medalsFromTime`, `timeBonusFromTime`, `scoringFromRun`,
      `level.js` → `formatLevelJson`; generator jih uporablja in ohrani ročno dodane JSON proge v `index.json` (in jih doda v SQL blok)
- [x] `editor/model.js` (čisto): nova proga, normalizacija, resize na vseh straneh s premikom vseh koordinat, ploščice, zapolni,
      klančina iz dveh višin, opozorila višin, objekti (20 vrst) in poti, `History` (razveljavi/uveljavi), `levelHash`, iskanje mesta napake
- [x] `editor.html` + `editor.js` + `editor/view2d.js`: 5 plasti, orodja, plošča lastnosti, statusna vrstica, kontekstni meni, bližnjice, pomoč
- [x] `editor/preview3d.js`: 3D z obstoječim `Renderer` (debounce 300 ms, orbit prek `renderer.debugCam`), testna vožnja (od starta ali »Začni tukaj«)
- [x] Autopilot s sledjo in padci na tlorisu, »Izračunaj medalje« (formula generatorja + `dev`), rešljivost tudi z lastno vožnjo
- [x] Osnutki (`krogla:editor:drafts`, 30, samodejno), izvoz JSON / odložišče, uvoz datoteke / prilepi / kopija uradne proge
- [x] Igra: kartica in meni »Moje proge« (Na čas brez uradnih lestvic/ghostov/dosežkov/odklepov, lokalni rekord in ghost), »✏️ Urejevalnik«
- [x] Deljenje `?custom=` (deflate + base64url, omejitve velikosti, `validateLevel`, ime/opis kot `textContent`, prijazna napaka)
- [x] Testi: 8 novih (88/88 v Node in `tests.html`), README razdelek »Urejevalnik prog«
- [x] Točka 6 — proge skupnosti na Supabase (glej spodaj)

### Dnevnik
- **Bajtna enakost.** Formula medalj je zdaj ena (`rules.js`); po `node tools/krogla-levels.mjs` je `git diff --stat games/krogla/levels supabase`
  prazen. Ohranjanje ročnih prog preizkušeno s kopijo proge 01 kot `13-rocna.json` (ostala na svojem mestu v `index.json`, v SQL bloku), nato odstranjeno.
- **Kopija uradne proge** spremeni le `id` (`06-tovarna-kopija`), zato je izvoz brez sprememb enak datoteki razen `id` (preverjeno za 06).
  Lokacija se za id-je 01–12 izbere po številki; izrecni `look` (novo, nevtralno za uradne proge, ki ga nimajo) ima prednost.
- **Rešljivost** je vezana na `levelHash` (mreža, višine, objekti; brez imena, teme, medalj, sklopa in poti autopilota) z urejenimi ključi —
  prvotna različica je bila odvisna od vrstnega reda polj, zato deljena proga ni bila prepoznana kot ista (popravljeno, test).
- **Najdbe med preverjanjem:** `commit` je vračal rezultat funkcije namesto »spremenjeno« (validator se ni osvežil); desni klik je meni
  odprl in v istem dogodku zaprl; barvni emoji na tlorisu so prevzeli prosojnost prejšnjega `fillStyle`; števci na paleti se niso osvežili.
- **Determinizem:** testna vožnja z autopilotom kot vhodom (pravi `Input` → `step`) pride do cilja v 14,08 s, enako kot `runAutopilot`.

### Preverjeno (offline, `?offline=1`)
- Nova proga od nič (12×30): start, pot s klančino (3 klančine iz višin 0 → 1,5), prepad s premično ploščo, 5 zvezdic, kontrolna točka, žaga,
  cilj → autopilot do cilja (14,08 s, 0 padcev) → medalje 14/19/24 s, čas 24 s → testna vožnja od točke in od starta do cilja.
- Razveljavi/uveljavi čez 12 klikov na tloris (Ctrl+Z ×12 → natanko prvotna proga, Ctrl+Y ×12 → natanko končna); resize sever +1, zahod +2
  prek gumbov: start, cilj, kontrolna točka, zvezdice, plošča, žaga in route premaknjeni za (+2, +1), točka na plošči ostane odmik.
- Osvežitev strani: osnutek in status rešljivosti ostaneta. Postavi/povleci/izbriši zvezdico z miško.
- »Moje proge« → odigraj → lokalni rekord in ghost shranjena; v localStorage ni `db:scores` ne `db:ghosts` (uradne lestvice nedotaknjene).
- »Deli« (783 znakov) v drugem zavihku odpre isto progo; pokvarjen `?custom=` pokaže prijazno napako; konzola brez napak.
- Telefon 375×812: urejevalnik brez vodoravnega drsenja (3D privzeto skrit), »Moje proge« → igranje s palico. Uradni Na čas (`?lvl=1`) deluje.

### Ni bilo preverjeno
- Urejanje s pravim dotikom (tap = postavi, dva prsta, dolg pritisk = meni) — koda je, v emulaciji so bili kliki z miško.
- Testna vožnja s tipkovnico od starta do cilja (skozi premično ploščo) — od starta jo je peljal autopilot prek pravega vhoda, ročno le od točke do cilja.
- Shranjevanje prejete proge »💾 Shrani med moje proge« v drugem brskalniku (isti brskalnik jo pravilno prepozna kot že shranjeno).
- Vse uradne proge kot kopije v urejevalniku (preverjena 06), Firefox/Safari, Supabase način.

### Proge skupnosti (točka 6)
- **Shema** (`supabase/games/krogla.sql`, pognana na projektu `mini-games` kot migracija `krogla_custom_levels`): tabeli `krogla_custom_levels`
  (ime, hash, `data` jsonb ≤ 60 KB, `dev_ms`, velikost, `plays`; unikatno `(user_id, hash)`) in `krogla_custom_plays`; RLS: branje za prijavljene,
  brisanje le svojih, pisanje samo prek `private.krogla_publish_level` (omejitve, največ 20 na igralca, zamenjava starejše različice) in
  `private.krogla_level_played` (vsak igralec šteje enkrat). Lestvica proge = `game_scores` s seedom `custom:<id>` (`seed` je prosto besedilo
  ≤ 64 znakov — sheme huba ni bilo treba spreminjati, `public.scores` nedotaknjena; dashboard bere le dnevne seede).
- **RLS preizkušen** z lažnim JWT v transakciji z `rollback` (14 scenarijev): objava, posodobitev z istim hash, štetje igranj (drugič ne
  šteje), zavrnjeno kratko ime, prevelika proga, neposreden insert/update (permission denied), tuj igralec vidi a ne more izbrisati,
  ne vidi tujih igranj, avtor izbriše, 21. objava → `too_many_levels`.
- **Advisors:** varnost — nič novega tipa (le obstoječe »anonymous access« za vse tabele, ker je anonimna prijava namerna, in »leaked
  password protection«); zmogljivost — »unused index« (INFO) za nove indekse.
- **Hub:** `publishLevel`, `listLevels`, `getLevel`, `deleteLevel`, `levelPlayed` v obeh adapterjih (offline: `db:levels`, `db:levelPlays`,
  iste omejitve), dokumentirano v `shared/README.md`, test lokalnega adapterja (89/89).
- **Urejevalnik:** »🌍 Objavi« (posodobi / nova različica / umakni; preveri, ali objava še obstaja). **Igra:** razdelek »🌍 Proge skupnosti«
  (Najnovejše / Najbolj igrane / Moje objave, lestvica proge, shrani med moje, umik), `?community=<id>`.
- **Preverjeno offline v brskalniku:** objava → seznam → vožnja v pravi zanki igre (autopilot kot vhod) → rezultat le v `custom:<id>`,
  plays = 1, lestvica proge pokaže čas → umik iz igre → urejevalnik pozabi staro objavo; telefon 375×812; konzola brez napak.
- **Ni preverjeno:** objava in branje prek pravega Supabase odjemalca v brskalniku (za to bi moral ustvariti pravi testni profil na
  produkcijskem projektu) — strežniški del je preizkušen s SQL, odjemalec uporablja enak vzorec poizvedb kot ghosti. Ni moderacije
  (»Prijavi«) in ni strežniških ghostov za proge skupnosti.

---

# Zaporedje (`games/zaporedje/`)

Prompt: `prompts/08-zaporedje.md`. Stanje: **končano** (21. 11. 2026).

## Načrt

- [x] `logic.js` — ploščice (barva + simbol + pentatonični ton), generator iz seeda (»največ 3 enaki zapored«), vnos
      (`startInput`/`press`/`timeout`), modifikatorji (7: brez, Zrcalo, Šest, Tišina, Samo posluh, Kameleon, Turbo),
      tempo 600 → 250 ms, točkovanje, XP, povzetek, dvoboj (izpadi, opravičeni odsotni, razvrstitev ob hkratnem izpadu),
      štafeta (poteze, izpadi, skladatelj), nagrade, komentator (≥ 30 napisov), niz dni
- [x] Testi v `tests/tests.js` (10 novih): isti/različen seed, pravilo 3 enakih (tudi s konstantnim PRNG), modifikatorji se
      vrtijo, vnos, Zrcalo, Kameleon (par barva–simbol–ton), časovna omejitev = napaka, tempo/XP/povzetek/tipke,
      dvoboj (hkraten izpad, odsotni, odhod), štafeta; games.json (vnos + 8 nalog)
- [x] `audio.js` — WebAudio (sinus + trikotnik + »zvonček«, rahel odmev), »bzzz«, fanfara, utišanje v `shared/storage.js`
- [x] `board.js` — neon ploščice 2×2 / 3×2, žarenje, val svetlobe, pulse, utripanje pravilne ploščice, shake, FLIP pri Kameleonu
- [x] Klasika (čas na korak 2/3/5 s/brez, druga priložnost brez rekorda), osebni rekord, zlato ozadje ob izenačenju, fanfara
- [x] Dnevni izziv: zaporedje 120 korakov + modifikator dneva iz `hub.dailySeed`; prvi poskus na lestvico, ostali vaja
- [x] Spominski dvoboj (host vodi kroge, `room.send`, kljukice, izpadi, prenos hosta, vrnitev v 15 s, revanša)
- [x] Štafeta (`room.setState` z `expectedVersion`, `room.pushMove`, tapi v živo prek `room.send`, nadzornik hosta)
- [x] TV pogled (`?tv=1` ali gumb v lobbyju; TV ne igra), »Predvajanje samo na TV-ju«
- [x] 10 dosežkov, XP po prompt-u, `reportGame` + `reportEvent('zaporedje:len' | 'zaporedje:steps' | 'zaporedje:mp-win')`
- [x] `games.json` (`live`, 8 nalog) · `hub.reportEvent(name, value, { times })` (nova opcija, README)

## Dnevnik

- **Naloga »100 korakov ta teden«.** `applyEvent` šteje dogodke (ne vsote vrednosti), zato bi igra morala klicati
  `reportEvent` za vsak korak. `hub.reportEvent` ima zdaj tretji argument `{ times }` (≤ 100), ki v enem prehodu
  doda N dogodkov (en `getQuests` namesto N). Obstoječi klici so nespremenjeni.
- **Generator.** Pravilo »največ 3 enaki« je uveljavljeno pri vsakem koraku (`nextStep` preskoči na drugo ploščico);
  test z vedno enakim PRNG to potrdi. Isto pravilo velja v štafeti pri dodajanju koraka (UI ga zavrne s toastom).
- **Kameleon** je determinističen (`hub.rng(seed + ':zaporedje:kameleon')`), zato imajo vsi enake premike.
- **Dvoboj — hrošč, najden pri testu:** host je ob prejemu lastnega `roundEnd` zamenjal `mp.d` s kopijo in nato
  pošiljal zastarelo stanje (krog 1). Zdaj ima host, ki vodi igro, svojo verodostojno kopijo (`acceptD`).
- **Odsotni v dvoboju:** igralec brez rezultata, ki ni prisoten, je opravičen 15 s (`RETURN_GRACE_MS`); po tem izpade,
  uvrščen po krogu, ko je izginil (ne po krogu izločitve). Igralec, ki se vrne (`needSync`), krog, ki ga je zamudil,
  ne izgubi. Ob prenosu hosta nov host ponovi krog, ki je bil v teku.
- **Štafeta:** stanje piše igralec na potezi (`applyRelayMove` + `setState` z `expectedVersion`, ob konfliktu ponovno
  prebere). Host vsako sekundo preveri, ali je igralec na potezi odsoten > 15 s ali obtičal → izpade.
- **Telefon:** val svetlobe (`inset: -18%`) je širil stran (layout viewport 422 px) in modal je segal čez rob →
  `overflow-x: clip`. `navigator.vibrate` se kliče le po prvi interakciji (sicer Chrome izpiše napako).
- **Preizkus modifikatorjev:** skrit parameter `?mod=<id>` (npr. `?mod=chameleon`) pri dnevnem izzivu vsili
  modifikator; tak poskus je vedno vaja (nikoli na lestvico).
- **Supabase:** lastnih tabel ni (lestvica = `game_scores`, stanje štafete = `room_state`/`moves`). Ni kaj pognati.

## Preverjeno

- `node tests/run-node.mjs` in `tests.html`: 80/80.
- Brskalnik (offline, avtomat, ki bere prižige in tapka): klasika (rekord, zlato ozadje, fanfara, dosežek, naloge,
  povzetek), druga priložnost (krog se ponovi, brez rekorda), tipkovnica (Q W A S), dnevni izziv (prvi poskus →
  lestvica in mesto, nato »vaja«), Kameleon, Zrcalo, Šest, Tišina (dnevni).
- Multiplayer v 3 zavihkih (`?offline=1`): soba prek kode in `?room=`, dvoboj do konca, revanša v isti sobi, host zapre
  zavihek sredi dvoboja (nov host ponovi krog in pripelje igro do konca), štafeta s 3 do konca (nagrade, skladatelj),
  osvežitev igralca na potezi v štafeti (vrne se na svojo potezo), osvežitev igralca med dvobojem (vrne se v
  naslednji krog, brez izpada), TV pogled kot opazovalec v dvoboju.
- Telefon 375×812 (meni, igra, povzetek, lobby) in namizje 1024×768; konzola brez napak (igra, dashboard).

## Ni bilo preverjeno

- Zvok na pravi napravi (WebAudio teče, a ušesa testa ni bilo; iOS zahteva tap pred prvim tonom — `unlockAudio` ob
  prvem `pointerdown`/tipki).
- Modifikatorja *Samo posluh* in *Turbo* v brskalniku (le testi logike); `prefers-reduced-motion` s sistemsko nastavitvijo.
- Supabase način (vse v offline adapterju), Safari/Firefox, pravi telefon z vibracijo.
