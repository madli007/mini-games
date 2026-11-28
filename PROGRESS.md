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

- **f2 — fiksni korak z akumulatorjem** (`engine/game.js`). Prej: `n = round(dt / STEP)`, `korak = dt / n` → pri 75 Hz korak 1/750 s,
  pri 165 Hz 1/660 s; isti strel se je pri različnih zaslonih obnašal drugače (test: žogica po 1440 korakih pri 60 Hz na y = 605,
  pri 165 Hz na 458, pri 75 Hz je že odtekla). Zdaj je korak vedno 1/720 s, odvečni čas ostane v akumulatorju (tudi v slow-motionu).
  Pri 60 Hz je rezultat bit za bitom enak (zlati posnetek se je spremenil le v `physicsVersion`); nov test »fizika enaka pri 60, 75 in 165 Hz«.
  100 bot iger pred/po (60 Hz, enako): povprečje 22.220.337 točk, igra 564 s, žoga 145 s, drain po sredini 59,2 % (outlane 40,8 %),
  9,9 strela/min, 1,57 multiballa, 2,4 začetih / 0,47 opravljenih misij.
- **f3 — guma mirnega flipperja** (`engine/physics.js`). Prej je imel flipper vedno odbojnost 0,32. Zdaj ima miren flipper
  (dvignjen ali spuščen) odbojnost, ki pada s hitrostjo udarca: `e = 0,40 / (1 + v / 1500)` — počasna žogica odskoči kot prej
  (izmerjeno vzdolž normale: 0,317 proti 0,322), hitra žogica, ki pade na dvignjen flipper, »umre« (0,181 proti 0,32) → live catch
  in mrtvi odboj kot na pravi mizi; udarec flipperja v gibanju je nespremenjen (strele imajo enako moč). Prvi poskus
  (`0,55 / (1 + v / 1200)`) je bil pri počasnih udarcih preveč živ in je bot izgubljal žogice (12 iger: 347 s proti 422 s) → zavrnjen.
  Drsnika v `?debug=1`: »Odbojnost mirnega flipperja«, »Padec odbojnosti«. Nov test »mirni flipper: … live catch«.
  100 bot iger f2 → f3: točke 22,2 → 25,1 mio, igra 564 → 544 s, žoga 145 → 138 s, drain po sredini 59,2 → 59,3 %,
  strele/min 9,9 → 10,3, multiballi 1,57 → 1,55, rampe 9,4 → 10,0, misije opravljene 0,47 → 0,46.
  (Bot ne lovi žogice namerno, zato je razlika majhna; za človeka je ulov z držanjem flipperja zdaj zanesljivejši.)

- **Testna miza.** Bot je na prvi verziji igral 30 min brez konca: (1) žogica iz izstrelitve je po loku padla naravnost v levi outlane
  (manjkala so vrata orbita kot na Alu mizi) → 99 % drainov v outlanu; (2) lasnica rampe s pravim kotom je žogico odbila nazaj → zdaj gladek lok;
  (3) žogica je na robu vstopnega okna prešla na plast rampe **zunaj** kanala in pristala v trikotniku slinga. Popravki v motorju:
  `T.wireform` doda ustje (lijak) na igralni površini, fizika pri rampah s potjo žogico, ki je dlje od osi kot kanal, vrne na površino
  (Alu rampa nima poti → Alu fizika in zlati test nespremenjena), izhod rampe je v inlanu pod vrhom slinga. Zdaj se vseh 6–8 bot iger konča.
- **Mapa strelov Alu mize** (f3, 1 ms): code review 39–50 ms z obeh flipperjev, desni orbit 21 ms, rampa le z desnega flipperja 3 ms (ozka),
  livarna 1–2 ms (v igri jo žogica najde po odboju), desni cradle → B·U·G 28 ms. Tabela v `games/pinball/README.md`.
- **UI dirka:** `open()` doda razred `show` v naslednjem frame-u; če se zaslon zapre prej (npr. Enter takoj), je temno ozadje ostalo
  čez mizo. Zdaj se `show` doda le, če je zaslon še odprt.

## Ni bilo preverjeno
- **Zapis na Supabase lestvico pod uporabnikom** v živo (brskalnik je imel le anonimno sejo brez profila; ustvarjanje profila in
  zapis v produkcijsko lestvico sem pustil uporabniku). Offline zapis (`?offline=1`) je preverjen: `seed miza:alu:f1`, meta, rang,
  zavihki; branje arhiva `scores` s Supabase deluje (10 vrstic z inicialkami).
- **Ročno igranje** v vidnem podoknu: podokno brskalnika je bilo skrito (rAF ustavljen), zato sem igro, izris, DMD in UI poganjal
  ročno iz skripte (multiball s 3 žogicami in jackpotom, Nizka/Ultra, telefon 375×812, testna miza z `?debug=1`, mapa strelov in bot v brskalniku).
  Animacije prehodov (CSS) in občutek v realnem času niso preverjeni.
- Zlati test v brskalniku se razlikuje od Node (Math.* v Chromu 156 ≠ Node 24) — zato je tam informativen.
- Match je le prikaz (DMD + zaslon konca), brez nagrade (enoigralska igra brez kreditov).

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

> **Posodobljeno 23. 11. 2026:** meja 250 za vse vire je zamenjana z **mejo igranja 120**; naloge niso več pod mejo
> (glej »Popravki (23. 11. 2026)« spodaj).

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

# Rušilec (`games/rusilec/`)

Prompt: `prompts/07-krogla-rusilec.md`. Stanje: **končano** (22. 11. 2026).

## Načrt

- [x] `collide.js` — trki krogla–krogla (3D impulz z maso, »bonk«), sunek z ohlajanjem in maso, Odbijač
- [x] `match.js` — runda: pripisovanje izrivov (zadnji dotik 4 s), samomor −1/0, dvojni izriv, maščevanje, biljard,
      hat-trick, ponovni prihod (najbolj oddaljeno izhodišče, 1,5 s neranljivost), finale (krušenje), nagla smrt,
      ekipe, Zadnji na plošči + duhovi, zlati hrček, pobiralke s seedom, serializacija (prenos hosta), igra z več rundami, nagrade, XP
- [x] `arena.js` + 9 aren (7 odprtih + Vrtiljak in Oblak skrivni) v formatu prog, generator `tools/rusilec-arenas.mjs`
- [x] `bots.js` — Lahek/Srednji/Težek, izogibanje robu/kladivom/žagam, BFS pot čez mostove
- [x] `net.js` — posnetki (Int16 + base64, ~300 B / 8 krogel), vhod, ura hosta, interpolacija, popravek napovedi, zanesljivi dogodki
- [x] `view.js` (podrazred `Renderer`), `sound.js` (podrazred `Audio`), `game.js`, `index.html`, `game.css`
- [x] Razširitev `krogla/physics.js` brez spremembe singleplayerja (`makeBody`, `advanceWorld`, `stepBody`, `groundY`, `permFall`, `forceSurf`)
- [x] Skrite ključavnice v krogli (`krogla/secrets.js`, Neon → Vrtiljak, Nebo → Oblak), povezava »💥 Rušilec (party)« v meniju krogle
- [x] `games.json` (live, 1–8, 4 naloge), README-ji, 15 novih testov (`tests/rusilec.js`)

## Dnevnik

- **Fizika:** trk dveh krogel pri največji hitrosti premakne kroglo za ≤ 0,22 na korak (120 Hz), premer je 0,64 — ni
  tuneliranja (test). Impulz je simetričen (gibalna količina ohranjena), »bonk« faktor (1 + 1,15·v/MAXV) poveča odboj
  hitrih trkov. Sunek: 11,5 m/s (MAXV 13 ga ne odreže), masa 2,6× za 0,38 s.
- **Pripisovanje:** ob trku si oba zapomnita drugega; biljard se prenese, če je krogla, ki zadene, sama v 0,8 s dobila
  ≥ 3,5 m/s od nekoga drugega (zato tisti, ki sune s težko kroglo, ne »prenese« dotika naprej).
- **Krušenje:** robne ploščice so `x`; v areni se ne sprožijo ob dotiku, ampak po razporedu (`crumbleSchedule`) iz časa
  runde — host in klienti ga izračunajo enako. `permFall` jih pusti zrušene. Renderer jih pobarva kot tla (rdeče ob tresenju).
- **Boti:** prvi poskus je na Tekočem traku padal (trak vleče ven, kladivo meče čez rob) in na Oblaku obtičal (ozki
  mostovi). Dodano: trak šteje kot bližji rob, odboj od kladiv/žag, BFS pot po ploščicah, ozek most ni »beg od roba«.
  Rezultat (Srednji, 60 s proti pasivnemu): 4–13 izrivov, 0 samomorov na vseh arenah.
- **Soba med igro ostane `lobby`** (host takoj po `start` vrne status), da se lahko pridružijo novi (opazovalci do
  naslednje runde). Na dashboardu je soba vidna med aktivnimi lobbyji.
- **Odklep skrivnih aren** velja le prek dosežka igralca (ne lokalnega zapisa brskalnika) — sicer bi v testu z več
  zavihki vsi gostje »podedovali« odklep. Krogla lokalno (`krogla:locks`) le skrije že pobrano ključavnico.
- **Ključavnica** je bila po samodejnem znižanju kakovosti nevidna (`setQuality` ponovno zgradi sceno) → ob vsakem
  koraku se doda nazaj.
- **Telefon:** kamera v portretu bolj od zgoraj (1,12 rad) in arena višje (kontrole spodaj); skrit čip »Runda«.
  `navigator.vibrate` le po prvi interakciji (sicer napaka v konzoli).
- **Host v skritem zavihku:** rAF miruje → simulacija teče tudi s časovnikom (50 ms; brskalnik ga lahko upočasni).

## Preverjeno

- `node tests/run-node.mjs` in `tests.html`: **104/104** (89 prejšnjih nespremenjenih + 15 Rušilca; testi krogle in
  rešljivost prog zeleni, autopilot na Neonu in Nebu da enak čas kot `dev.time`). Opomba: `tests.html` lahko ob
  ponovnem zagonu v istem brskalniku pokaže 5 neuspehov lokalnega adapterja (ostanki `mg-test:` iz prejšnjega zagona);
  po brisanju teh ključev 104/104 — obstoječa krhkost, ne povezana z Rušilcem.
- Offline v 3–5 zavihkih (`?offline=1`, `?igralec=7/9`): soba prek kode in `?room=`, 3 runde na različnih arenah
  (Ring → Tekoči trak → Drsališče) z boti, izbira arene med rundami; **odhod hosta sredi runde** (nov host Ana, runda
  teče naprej od t = 19,9 s, točke in zaporedne številke dogodkov se nadaljujejo); osvežitev igralca med rundo (vrne se
  s točkami); vrnitev prejšnjega hosta; **pridružitev med igro** (opazovalka, v 3. rundi zraven); vsi zavihki so imeli
  enak killfeed, točke in končne rezultate; način **Ekipe** (zmagali Rdeči, XP 60/20); **Zadnji na plošči** z duhovi
  (zmaga zadnji, pravilna mesta); **TV** pogled; vadba z boti; zlati hrček (krona).
- **Supabase** (`?igralec=1/2/3`, soba HAR5, 3 ljudje + 2 bota): pri klientu 15,0 posnetka/s, tresenje časa 19 ms,
  največja vrzel 77 ms, brez izgubljenih dogodkov; vhod klienta pride do hosta, napaka napovedi lastne krogle ≤ 0,35 m;
  konec igre → `reportGame`, 20 XP, napredek naloge pri vseh treh. Testni profili (RuTest1–3), njihove vrstice in soba
  so izbrisani; `scores` (pinball) nedotaknjena.
- Ključavnica na Neonu pobrana → toast, dosežek `krogla:kljucavnica-vrtiljak`; v sobi, kjer host areno nima, se Vrtiljak
  odklene, ko se pridruži igralec, ki jo ima; igra na Vrtiljaku.
- Kontrole: tipka D premakne kroglo v desno glede na kamero, preslednica = sunek (11 m/s, ohlajanje 3 s).
- Telefon 375×812 (arena zgoraj, palica + SUNEK), namizje 800×600, TV pogled; konzola brez napak v igri, Hrčkovi krogli
  in na dashboardu.

## Ni narejeno

- Lokalni multiplayer na eni tipkovnici (neobvezno) — ni narejen.
- Urejevalnik prog ne odpira/shranjuje aren (arene se urejajo v generatorju ali ročno v JSON).
- Neobvezne arene Stolp in Nasilneži (Nemogoče je dodana); lestvica »izrivi ta teden« (neobvezno).
- Nagib telefona za Rušilca (palica in tipke da; `Input` nagib podpira, ni pa gumba za vklop).

## Ni bilo preverjeno

- Pravi telefoni (FPS z 8 kroglami na pravi napravi, vibracija, iOS zvok). V emulaciji brskalnika je samodejna
  kakovost padla na Nizko pri ~30 FPS, kar je omejitev testnega okolja (več zavihkov z WebGL hkrati).
- Igra z 8 ljudmi (dosežek `osem`), daljše runde (3/5 min) do konca, nagla smrt v živo v brskalniku (le testi logike).
- Gladkost na mobilnem omrežju (Supabase je bil preizkušen z vseh treh igralcev na istem računalniku).
- Safari/Firefox.

# Herodle (`games/herodle/`)

Prompt: `prompts/09-herodle.md` (1. od treh faz). Stanje: **1. faza končana** (22. 11. 2026), **2. faza končana** (23. 11. 2026, spodaj). Naslednji:
`prompts/14-herodle-nacini.md` (Emoji, Kostum, Dosje, arhiv), `prompts/15-herodle-dvoboj.md`.

## Načrt

- [x] `heroes.js` — 180 likov (107 Marvel, 73 DC, 83 MCU, 60+ zlobcev), vsa polja; 49 likov z `unsure`
- [x] `logic.js` — primerjava (ekipe/izvori delno, ±10 let, puščice), težki način, offline razpored brez ponovitev
      (cikel = premešan bazen; mešani se izogne liku MCU/DC istega dne), iskanje brez šumnikov, bonus (6 tipov,
      3 na dan), deljenje (#N od `EPOCH` 2026-11-22), statistika/nizi, komentator (26 variant), XP
- [x] `daily.js` (online/offline adapter, enak vmesnik), `modes/klasika.js` (vmesnik načina), `main.js`, `store.js`,
      `search.js`, `bonus.js`, `sound.js`, `index.html`, `game.css` (stripovski neon, halftone, flip, POW!, visok kontrast)
- [x] Bonus po zmagi + kartica »Dosje razkrit«; stanje po vprašanjih (osvežitev ga ne ponovi)
- [x] Statistika po bazenu (histogram 1–10+, današnji poudarjen), »Prijatelji danes« (lestvica + mini porazdelitev)
- [x] Deljenje (`navigator.share` na telefonu, sicer odložišče, sicer okno z besedilom)
- [x] 8 dosežkov, XP, `reportGame` + `reportEvent` (`herodle:classic`, `herodle:star`, `herodle:stars`, `herodle:solved-day`)
- [x] `games.json` (live, 6 nalog), testi `tests/herodle.js` (20 testov; skupaj 123/123), fikstura 200 parov
- [x] Supabase: `supabase/games/herodle.sql` + generiran `herodle-heroes.sql` (`tools/herodle-sql.mjs`), pognano kot
      migraciji `herodle` in `herodle_heroes_data`; razpored 1200 vrstic (400 dni × 3 načini) do 2027-12-26

## Dnevnik

- **Neločljivi liki.** Original five X-Men (vsi 1963, mutant, rojen) in moški Fantastic Four bi imeli enake vse
  atribute → vzeti so Professor X, Cyclops (izvor + nesreča — poškodba glave), Beast (+ serum), Jean Grey; Iceman,
  Angel, Human Torch, Thing, Colossus in Heimdall izpuščeni. Hulk je »Antijunak« (sicer = Spider-Man), War Machine
  ima še »Trening« (sicer = Ant-Man), Mandarin »Tehnologija + Trening« (sicer = Kang). Test to varuje.
- **Dovoljene vrednosti** so razširjene glede na tabelo v promptu: ekipe (Defenders, Sinister Six, Bratovščina,
  Black Order, Hydra, Thunderbolts, Inhumans, Eternals, X-Force, Justice Society, Green Lantern Corps, Rogues,
  Legion of Doom, Batova družina), vrste (Inhuman, Demon, Drugo), izvor (Kozmično).
- **firstFilm** = prvi celovečerni kino film (igrani ali animirani — zato Miles/Spider-Gwen 2018, Krypto 2022);
  liki brez zanesljivega podatka imajo `null` (vprašanje se ne postavi).
- **Bonus:** napačni igralci/imena iz istega univerzuma in istega spola (sicer je bila edina igralka očiten odgovor);
  drsnik začne vsaj 6 let stran od pravilnega leta.
- **Najdba med testom:** stanje dneva v `localStorage` se je delilo med offline in Supabase načinom (online je pokazal
  offline rešitev) → `store.setScope('<adapter>-<userId>')`.
- **SQL:** `herodle_cmp` je ena funkcija za `herodle_check` in `herodle_compare`; `herodle_fill` vstavlja le manjkajoče
  dni (`md5(salt || mode || date || id)`, okno `min(n − 1, 120)`); mešani bazen se izogne liku MCU/DC istega dne.

## Preverjeno

- `node tests/run-node.mjs` in `tests.html`: 123/123 (20 testov Herodla).
- Offline (`?offline=1`): rešeni vsi trije bazeni (Mešano v 3, MCU v 1 → Jasnovidec, DC predaja), `?date=` 23.–28. 11.
  (niz 3, predaja prekine niz, histogram s 3/5/10+, povprečje 5,8), bonus po osvežitvi nadaljuje pri 2. vprašanju,
  deljenje, težki način (zavrne Wonder Woman z razlogom, stikalo zaklenjeno med igro), dosežki/XP/kovanci.
- Supabase (testni profil `?igralec=hdtest1`): Klasika rešena prek RPC; odgovori `herodle_check` pred rešitvijo
  vsebujejo le barve (brez id-ja lika — preverjeno na surovem HTTP odgovoru); `herodle_daily` z anon ključem →
  401, prijavljen → 403; shema `private` (sol) ni izpostavljena; `herodle_check` brez prijave → 401;
  `herodle_reveal` za danes brez `give_up` → `not_past`; predaja zapiše vrstico v `herodle_giveups`;
  fikstura 200/200 enaka s `herodle_compare`. Razpored: 0 ponovitev v oknu, 0 trkov mešani/MCU/DC, bazena pravilna.
- Advisors: security — za Herodle le INFO »RLS brez pravil« (`herodle_daily`, `private.herodle_secret`; namenoma)
  in obstoječi WARN o anonimni prijavi (velja za ves projekt); performance — nič novega.
- Testni profil `HdTest` in njegove vrstice izbrisani (auth.users, profiles + kaskada); liki in razpored ostanejo.
- Telefon 375×812 in namizje 1280: posnetki pregledani (kratice v ozkih celicah, avtocomplete pod vnosom).
- Konzola brez napak v igri in na dashboardu (offline); online le pričakovani 401/403 iz varnostnih testov.

## Ni bilo preverjeno

- Pravi telefon s tipkovnico: pritrditev polja nad tipkovnico (`visualViewport`, predlogi navzgor) — emulator nima
  tipkovnice. Vlečenje pri razvrščanju na dotik (gumbi ▲▼ delujejo).
- Zvok na pravi napravi, `navigator.share` na telefonu, `prefers-reduced-motion` s sistemsko nastavitvijo.
- Prehod čez polnoč (»Nov dan, nov junak«) — le koda (preverja vsakih 20 s).
- Dosežka `teden`/`mesec` (logika nizov je testirana, celotnega teka ne).
- »Ta teden« v Prijateljih: lestvica huba vrne najboljši rezultat igralca čez vse seede igre (vključno z MCU/DC).

## Ročno preverjanje podatkov (`unsure`)

Ta polja se ne uporabljajo v bonus vprašanjih; po preverjanju jih odstrani iz `unsure` (in popravi vrednost):
- `captain-america`: firstFilm = 1990
- `hulk`: alignment = "Antijunak"
- `black-widow`: home = "Moskva"
- `scarlet-witch`: species = "Mutant"
- `quicksilver`: species = "Mutant"
- `ant-man`: nemesis = "kang"
- `wasp`: firstFilm = 2015, alterEgo = "Janet van Dyne"
- `captain-marvel`: species = "Človek", home = "Hala"
- `ms-marvel`: species = "Inhuman"
- `yelena-belova`: home = "Moskva"
- `red-guardian`: alignment = "Antijunak"
- `star-lord`: species = "Človek", nemesis = "ronan"
- `drax`: species = "Vesoljec"
- `nebula`: home = "Titan"
- `mantis`: species = "Vesoljec"
- `ebony-maw`: firstComic = 2013, home = "Titan", nemesis = "doctor-strange"
- `killmonger`: home = "Wakanda"
- `abomination`: home = "Moskva"
- `red-skull`: firstFilm = 1990
- `mandarin`: firstFilm = 2021
- `sersi`: firstComic = 1963
- `silver-surfer`: gender = "M"
- `galactus`: firstFilm = 2007, nemesis = "silver-surfer"
- `lizard`: firstFilm = 2012
- `cyclops`: origins = ["Rojen","Nesreča"], nemesis = "apocalypse"
- `beast`: firstFilm = 2003
- `psylocke`: firstFilm = 2006
- `emma-frost`: firstFilm = 2011
- `sabretooth`: home = "Kanada"
- `juggernaut`: home = "Westchester"
- `apocalypse`: nemesis = "cyclops"
- `cable`: home = "New York"
- `blade`: home = "London"
- `superman`: firstFilm = 1951
- `batman`: firstFilm = 1966
- `shazam`: firstComic = 1939
- `plastic-man`: home = "New York"
- `krypto`: firstFilm = 2022
- `guy-gardner`: home = "Baltimore"
- `metamorpho`: home = "Metropolis"
- `hawkgirl`: alterEgo = "Shiera Hall"
- `terra`: nemesis = "beast-boy"
- `two-face`: firstFilm = 1989
- `king-shark`: species = "Polbog"
- `deathstroke`: home = "Jump City", nemesis = "nightwing"
- `black-manta`: home = "Atlantski ocean"
- `trigon`: home = "Azarath"
- `lobo`: actors = ["Jason Momoa"], firstFilm = 2026
Ostali podatki so iz spomina in niso bili preverjeni z zunanjimi viri; najbolj tvegani so `home` (kje »živi«) in `firstFilm`.

## 2. faza — Emoji, Kostum, Dosje, arhiv, popolni dan (`prompts/14-herodle-nacini.md`)

### Načrt
- [x] `hints.js` — vseh 180 likov: 5 emojijev, paleta 3–5 (palette[0] = color), simbol ali null, 6 namigov dosjeja,
      2–3 dejstva; pisano v serijah (Avengers/kozmos/zlobci/FF+ulica/pajek/X-Men/DC liga/Titani/Gotham/DC zlobci);
      21 dvomljivih dejstev v `unsure` (seznam spodaj)
- [x] `logic.js` (dodano, Klasika nespremenjena): `colorName` (hex → 12 slovenskih imen), `leaksName`, `validateHints`,
      `hintStage`/`visibleHints`, `stepGuess`, offline razpored načinov (cikel brez ponovitev, brez trkov z ostalimi
      načini isti dan), deljenje (`hintShareText`, `shareAllText`), `isPerfectDay`, XP, `archiveDates`, komentator
- [x] `modes/hintmode.js` (skupno ogrodje) + `emoji.js` (pop), `kostum.js` (trakovi + krog, 💡 po 3 / 🔰 po 5),
      `dosje.js` (papir, odtis, zatemnjeni namigi, poraz po 6)
- [x] `daily.js`: `hints(mode, date)`, `check` za nove načine (online RPC / offline `shared/storage.js`, `hints.js`
      dinamično); `store.js`: arhivsko stanje, `archiveView()`, popolni dnevi, rešene arhivske uganke
- [x] Kartica »Dosje razkrit« (vsi načini): paleta kot trakovi + dejstva (MutationObserver v `main.js`, `hints.js` šele takrat)
- [x] Zavihki (4), »Naslednji način →« (tudi v Klasiki), statistika in lestvica za vse načine, pomoč
- [x] Arhiv 📅 (ikona v glavi): koledar 30 dni × 6 ugank, rešeno/predano/ni rešeno/neodigrano, lokalna igra, samo
      pogled za dneve, rešene kot dnevne; XP 5, `reportGame({ daily: false })`, `herodle:archive`, Arhivar
- [x] Popolni dan (animacija, +20 XP, dosežek), »Deli vse današnje«, 5 novih dosežkov, 4 nove naloge
- [x] Supabase: `herodle_hints`, `herodle_progress`, `herodle_hint`, razširjeni `herodle_check`/`herodle_fill`/guard/
      constrainti; `herodle-hints.sql` iz `tools/herodle-sql.mjs`; pognano kot migracije `herodle_faza2`,
      `herodle_hints_data_1`, `herodle_hints_data_2`
- [x] Testi `tests/herodle2.js` (14 novih; skupaj 136/136), testi 1. faze nespremenjeni

### Dnevnik
- **Zastave v emojijih** (🇪🇬, 🇷🇺 …) Windows izriše kot črke (»EG«) → zamenjane (🪆, 🍁, 🔺 …), test to prepoveduje.
- **Detektor imen** (`leaksName`): besede z »sklonsko« primerjavo (5+ črk brez zadnje črke, 4 črke kot predpona, krajše
  točno) + vsaka beseda alter ega (≥ 4 črke). Ujel je npr. »princesa« ↔ Diana Prince, »električar« ↔ Elektro,
  »pokol« ↔ Carnage, »tarča« ↔ Bullseye (simbol) — vse prepisano.
- **Barve:** `#f9a825` (Wasp, Hercules, Odin, Doctor Fate) je »zlata« (meja oranžna/zlata pri odtenku 36°).
- **Razpored:** `herodle_fill` ima nove načine na koncu seznama, izogne se liku istega dne v katerem koli načinu;
  obstoječe vrstice Klasike so ostale enake (md5 razporeda 3 bazenov pred in po migraciji enak). Novi načini so
  napolnjeni od 23. 11. 2026; 22. 11. se dopolni ob prvem `herodle_reveal` (deterministično).
- **Kostum** ima namesto rotacijske »pop« animacije razpiranje (prejšnja je povzročila vodoravni drsnik).
- **Dosje** nima »Predam se« (po 6 namigih se konča sam), Emoji in Kostum ga imata.
- **Nasvet za 3. fazo:** `isDone` je del vmesnika načinov (za »Naslednji način →«).

### Preverjeno
- `node tests/run-node.mjs`: 136/136 (20 testov 1. faze nespremenjenih, 14 novih); `tests.html` v brskalniku.
- Offline (`?offline=1`): Emoji (2 napačna → 3 emojiji, rešen), Kostum (osvežitev sredi igre — namigi ostanejo;
  💡 po 3, simbol »brez simbola · DC« po 5, rešen v 6), Dosje (osvežitev po 2 napačnih, rešen v 3), Klasika v 1 →
  🏆 popolni dan (toast, +20 XP, dosežek); `?date=2026-11-24` Dosje izgubljen po 6 (»Dosje je zaprt«); arhiv:
  Klasika in Emoji 22. 11. rešena → `stats:*` in `solved-days` nespremenjeni (niz ne šteje arhiva), Emoji mojster se
  v arhivu ne odklene; dan 23. 11. v arhivu samo pogled.
- Supabase (testna profila HdTest2/HdTest3): pred rešitvijo ni zahtevka za `hints.js` (Network/Performance), po rešitvi
  da; `herodle_hint` po osvežitvi pri 2 napačnih vrne točno 3 namige dosjeja; `herodle_hints` → 42501, `herodle_daily`
  → permission denied, `herodle_progress`: lastna vrstica berljiva, tuja ni (drugi profil vidi `[]`), insert/update
  zavrnjena; Emoji rešen prek RPC; Klasika vrača le barve (isti razpored kot pred fazo); `herodle_hints_for` (SQL) se
  ujema z `visibleHints` (JS); md5 vseh 180 namigov v bazi = md5 iz `hints.js`.
- Advisors: security — nova le INFO »RLS brez pravil« za `herodle_hints` (namenoma) in projektni WARN o anonimni
  prijavi (tudi `herodle_progress`, pravilo je le `user_id = auth.uid()`); performance — nič novega.
- Testna profila in njune vrstice izbrisani (auth.users + profiles + kaskada: progress, scores); razpored in namigi ostanejo.
- Telefon 375×812: Emoji, Kostum, Dosje, arhiv (popravljen preširok koledar) brez vodoravnega drsenja; namizje 800 px:
  vsi trije načini, končna kartica s paleto in dejstvi, arhiv. Konzola brez napak (igra + dashboard).

### Ni bilo preverjeno
- Online predaja (`herodle_reveal` z `give_up` za nove načine) in online poraz v Dosjeju — logika je ista kot offline in v SQL.
- Online arhiv (danes je v bazi samo 22. 11.; prikazan je koledar, igranje online arhiva ne).
- »Deli vse današnje« in deljenje novih načinov v odložišče — le testi besedila, ne `navigator.share` na telefonu.
- Animacija popolnega dne ob `prefers-reduced-motion` in na pravem telefonu; prehod čez polnoč sredi igre.
- Dosežek Arhivar (10 ugank) in naloge v hubu (dogodki se pošiljajo, celoten tek naloge ni bil odigran).

### Ročno preverjanje (2. faza, `hints.js` → `unsure`)
Ta dejstva so na kartici lika; po preverjanju odstrani oznako iz `unsure` ali popravi besedilo:
- `wasp` facts[0] »Ekipi Avengers je dala ime.« · `wong` facts[0] · `us-agent` facts[0] (MCU 2021)
- `red-guardian` dossier[5] »… s srpom in kladivom« · `agatha-harkness` facts[1] (zajec Senor Scratchy)
- `yondu` facts[1] (kovinski zobje) · `kang` facts[1] (rodbina Richards) · `zemo` facts[1] (oče zlobnež)
- `baron-mordo` facts[1] (Transilvanija) · `sersi` facts[0] (Kirka v Odiseji) · `mister-fantastic` facts[1] (sin)
- `galactus` facts[1] (MCU 2025) · `iron-fist` facts[1] (K'un-Lun) · `psylocke` facts[1] (film 2006)
- `sabretooth` facts[1] (rojstni dan) · `ghost-rider` facts[1] (Zarathos) · `supergirl` facts[1] (film 2026)
- `etrigan` facts[1] (rime) · `scarecrow` facts[1] (ptice) · `brainiac` facts[1] (potomec) · `reverse-flash` facts[1]
Vsi emojiji, dosjeji in dejstva so pisani iz spomina (ne iz zunanjih virov); najbolj tvegana so dejstva o filmih.

### Kaj mora uporabnik narediti v Supabaseu
Nič — migracije so pognane. Za novo okolje: `supabase/games/herodle.sql` → `herodle-heroes.sql` → `herodle-hints.sql`.

## Popravki (23. 11. 2026)

- [x] Prijava v obstoječ profil že v oknu »Kdo igra?« (prej je bilo treba ustvariti lažen profil)
- [x] Herodle: stanje dneva, statistika in arhiv se sinhronizirajo med napravami (tabela `herodle_state`,
      `store.attachCloud/pull/flush`, združevanje `mergeValue`; migracija `herodle_state_sync` pognana, advisors brez novih opozoril)
- [x] Ekonomija: naloge niso več pod dnevno mejo kovancev. Prej je bila meja 250 za vse vire skupaj, zato je
      prevzem tedenske naloge na aktiven dan del nagrade »pojedel«. Zdaj je **meja igranja 120** (igre, zmage, niz,
      nivoji, dosežki, `award_coins`), naloge (15/25/40, +25, 100/150) pa se izplačajo v celoti in se v mejo ne štejejo
      (`COINS.PLAY_PER_DAY`, `isCapped`, `private.grant_coins`). `report_game` vrne `capped`, hub enkrat na dan pokaže
      »Dosežena dnevna meja kovancev za igranje«. Simulacija: tipičen ~144 🪙/dan (prej ~132), legendarni 25. dan;
      maksimalen ~267/dan, legendarni še vedno **najprej 14. dan**.

# Dirka frnikol (`games/frnikole/`)

Prompt: `prompts/16-frnikole.md` (1. del: solo Dirkalni dan proti botom). Stanje: **končano** (23. 11. 2026).
Naslednja prompta: `prompts/17-frnikole-multiplayer.md`, `prompts/18-frnikole-stave.md`.

## Načrt

- [x] `race.js` — čista deterministična simulacija (telesa krogle + `collideAll` Rušilca), krmiljenje po poti, forma
      (pogon, oprijem, masa), sunki (3, ohlajanje 1,5 s, pomoč / bočni), padci in kontrolne točke, razcepi, cilj, foto finiš
- [x] `track.js` (format = proga krogle + `path`, `widths`, `splits`, `cps`, `grid`, `finish`, `target`), validator, poti
- [x] `odds.js` — kvote iz 30 tihih simulacij (zmaga, stopničke, 2 dvoboja), po kosih brez zamrznitve UI
- [x] `bets.js` — stave, izplačila, posojilo, končni rezultat · `bots.js` — 5 osebnosti, 14 imen, stave in sunki iz seeda
- [x] `day.js` — 16 frnikol, forma, dnevni načrt 5 dirk iz seeda · `texts.js` — 52 variant komentatorja
- [x] 3 proge z generatorjem `tools/frnikole-tracks.mjs` (želvica, ASCII izpis, preverjanje s tihimi simulacijami)
- [x] `view.js` (podrazred `Renderer`: frnikole, imena, kamera vodilni/moja/pregled, učinki), `sound.js` (podrazred `Audio`)
- [x] `game.js`: meni, dnevni izziv (prvi poskus šteje), prosta igra (3–7 botov), stavnica, dirka v živo, obračun, konec dneva
- [x] Hub: `submitScore`, `reportGame`, `awardXp`, 6 dosežkov, 4 naloge, `reportEvent` (`frnikole:kvota|tocke|stava`)
- [x] `games.json` (live), povezave v meniju Krogle in Rušilca, 13 testov (`tests/frnikole.js`), README

## Dnevnik

- **Fizika frnikole:** frnikola nima vhoda igralca, a ima »pogon« (vhod `stepBody` ≈ 0,5 proti točki 2 m naprej po
  svoji poti + bočni zamik linije iz seeda). Brez tega bi frnikole na ravnih delih obstale (trenje tal 1,6/s). Oprijem je
  dodatna sila, ki duši bočno hitrost glede na smer proge. Razlike forme so majhne (pogon ±3,4 %), izid je odprt.
- **Hitrost:** ena tiha dirka (8 frnikol, ~28 s) traja ~12 ms v Node, 30 simulacij za kvote ~0,4 s v brskalniku → Web
  Worker ni bil potreben; kvote se računajo po kosih (3 simulacije, nato `setTimeout 0`).
- **Razcepi:** prvi poskus je imel čelni notranji zid stranske poti — frnikole so se zaletele in obstale/padle. Popravljeno:
  pred razcepom se ciljna širina zoži (frnikole se zberejo), notranji zid se začne šele v 2. vrstici. Frnikola, ki pade na
  tvegani poti, naslednjič izbere stransko (sicer bi v Kuhinji pri žlici padala v nedogled).
- **Valjarna:** stranska pot razcepa je segala v sosednji odsek (luknje v ograji) → odsek S podaljšan za 5 vrstic.
- Preverjanje generatorja (`node tools/frnikole-tracks.mjs -v`, 80 simulacij z nevtralno + 80 z naključno formo):
  - `01-kamnolom`: 104 m, zmagovalec 28,0 s (26,1–29,8), padcev 1,4/dirko · (a) vsi v cilju ✓ · (b) največ 23 % (barva), 24 % (start) ✓ · (c) 20–40 s ✓
  - `02-kuhinja`: 83 m, zmagovalec 25,8 s (24,3–28,9), padcev 0,7/dirko · (a) ✓ · (b) 19 % / 27 % ✓ · (c) ✓
  - `03-valjarna`: 102 m, zmagovalec 25,3 s (23,8–26,6), padcev 0,3/dirko · (a) ✓ · (b) 19 % / 23 % ✓ · (c) ✓
  - Startna mesta spredaj desno so v Kamnolomu malo boljša (prvi zavoj je desni) — v mejah, a vidno v statistiki.
- **Kamera pri nizkem FPS:** vzmet kamere je imela korak omejen na 0,05 s na sličico → v počasnem (skritem) zavihku je
  kamera zaostajala. Zdaj podkoraki do 0,3 s. Simulacija dela do 90 korakov na sličico (dt ≤ 0,25 s).

## Preverjeno

- `node tests/run-node.mjs` in `tests.html`: 150/150 (vsi obstoječi testi Krogle in Rušilca nespremenjeni).
- V brskalniku (`?offline=1`): cel **dnevni** Dirkalni dan (5 dirk, stave na zmago/stopničke/dvoboj, sunek) → rezultat na
  dnevni lestvici, meni pokaže »Danes: … točk · trening«; cela **prosta igra** s 7 boti (5 dirk, stave, bočni sunki) do
  `ui.results`; `?fast=1&auto&track=1|2|3` — cel dan na vsaki progi brez izrisa.
- Konzola brez napak v igri, Krogli, Rušilcu in na dashboardu; povezavi »🔮 Dirka frnikol« v Krogli in Rušilcu.
- Telefon 375×812 (stavnica v dveh stolpcih, plavajoč »Na start«, dirka z 8 barvnimi gumbi in velikima gumboma sunka,
  komentator v 2 vrsticah) in namizje (stavnica, dirka, pregled proge, obračun, končni zaslon).

## Ni bilo preverjeno

- Dirka v realnem času pri polnih 60 FPS: zavihek brskalnika med testiranjem ni bil viden (≈ 1,5 FPS), zato je bil potek
  dirke večinoma preskočen z `__fr.skip()`; kamera, zvok in počasni posnetek pred ciljem so preverjeni le delno.
- Zvok (WebAudio) ni bil poslušan. Samodejno nižanje kakovosti je preverjeno le v skritem zavihku (spusti se na Nizko).
- Dosežki `saboter`, `milijonar`, `brez-sunka`, `foto` in naloge v hubu niso bili odklenjeni v brskalniku (pogoji so v kodi).
- Supabase način (lestvica, `reportGame`, naloge) — le offline adapter.

## Ni bilo narejeno

- Kratek posnetek cilja po dirki (replay) — namesto njega je počasni posnetek tik pred ciljem, ko je tesno.
- Premične ploščice (`movers`) in ventilatorji na progah niso uporabljeni (generator nima pomožne funkcije zanje).
- Shranjevanje napol odigranega dne ob osvežitvi strani (poskus dneva je porabljen ob začetku).

# Smučarski skoki (`games/skoki/`)

Prompt: `prompts/11-skoki.md` (1. faza od treh). Stanje: **končano** (24. 11. 2026).
Naslednja prompta: `prompts/12-skoki-tekma.md`, `prompts/13-skoki-pokal.md`.

## Načrt

- [x] `dmath.js` — deterministični sin/cos/atan2 (polinomi, napaka < 1e-9), tabele, hash/šum, PRNG (brez `Math.*` trigonometrije v simulaciji)
- [x] `hill.js` — profil iz parametrov (miza, prehod, zalet; grbina, strmina, prehod, iztečišče), `validateHill`, pravila (vrednost metra, base, veter)
- [x] `wind.js` (off/const/random iz seeda, vzdolž doskočišča + sunki), `physics.js` (zalet, odriv, let z CL/CD/CM tabelami in PD regulatorjem, pristanek, iztek)
- [x] `scoring.js`, `judges.js` (5 sodnikov, brez najvišje in najnižje, kompenzacije, zapis za lestvico), `bot.js`, `balance.js`
- [x] `ghost.js` (spremembe vnosov → varint → base64, < 4 KB), `replay.js` (posnetki, rezi kamere), `texts.js` (komentator, 60 vrstic)
- [x] 3 skakalnice (Brezova K60/HS68, Bistra K95/HS106, Orlova K125/HS140) kot JSON s temami
- [x] Testi `tests/skoki.js` (17), `tools/skoki-balance.mjs`, uglaševanje do ciljev
- [x] Izris: `render/` (svet iz profila, jeklena konstrukcija, stopnice, črte daljave, K/HS, zelena črta rekorda, publika in
      zastave z valovanjem v shaderju, smreke, gore, jezero, sneženje, panoji, skakalec s pozami, ghosti, kamera, post iz Krogle)
- [x] HUD (trak v slogu prenosa, semafor, merilnik nagiba, namigi, komentator, semafor daljave, rezultatna kartica), zvok
- [x] Načina Trening (zaletno mesto, veter, ghosti) in Rekord skakalnice (3 skoki, najboljši na lestvico + ghost)
- [x] Hub: lestvice (seed `hill:<id>`), `reportGame`, `reportEvent`, XP, 10 dosežkov, 4 naloge; `hub.saveGhost/getGhosts` z `order: 'desc'`
- [x] Stran z drsniki (`?debug=1`): drsniki po skupinah, urejevalnik krivulj, grafi, ponovitev z novimi parametri, izvoz, boti
- [x] `supabase/games/skoki.sql` (pognan kot migracija `skoki_ghosts`, 24. 11. 2026), `games.json` (live), dokumentacija

## Dnevnik

- **Fizika najprej.** Prva kalibracija je pokazala, da je daljava zelo občutljiva na vzgon (`liftScale` 1,0 → 1,15 = +44 m na
  Orlovi). Uglašeno na 1,05; dolžina zaleta (`e2`) in privzeto mesto na skakalnico tako, da bot 0,7 skače okoli K.
- **Veter.** Najprej je čelni veter skok celo skrajšal (upor > vzgon). Fizikalno pravilno je, da veter piha vzdolž pobočja,
  zato ima čelni tudi komponento navzgor — po tem +2 m/s na Orlovi da ~+12 m (`wind.updraft` 0,8).
- **Zaletna mesta** so bila sprva preblizu (0,37 km/h); razmik povečan na 0,85–1,1 m (≈ 0,55–0,75 km/h na mesto).
- **Pristanek.** Na mali skakalnici je ekvivalentna višina padca večja (nižje hitrosti → strmejši spust), zato so meje
  `hTele/hTwo` dvignjene. Brez klika skakalec refleksno pristane trdo (`none`, −4 pri sodnikih); klik po refleksu = padec.
- **Prezgodnji odriv** je bil precej hujši od prepoznega zaradi dodatne izgube hitrosti (~7 m) — odstranjena, zdaj sta simetrična.
- **Napaka, najdena v brskalniku:** dogodek pristanka je imel `type` prepisan z vrsto pristanka, zato se zvok, publika in
  počasni posnetek niso sprožili (rezultat pa je bil pravilen). Popravljeno (`kind`).
- **Izris.** Kamera je bila sprva previsoko in preblizu; za ozadje je dolina z gozdom delovala kot zid → nižji breg na
  daljni strani, brez dreves ob doskočišču, zelene črtice smrečja ob robovih (občutek globine), mehka senca pod skakalcem,
  pokončni zaslon: kamera dlje in skakalec na sredini. Shaderji se prevedejo ob nalaganju (`gl.compile`).

## Občutek in uglaševanje

- Okno napadnega kota je ozko: ±5° od optimuma (~29°) pomeni na Orlovi 10–20 m. Zato je desno merilnik z zelenim oknom
  (in ciljno puščico). Brez premikanja miške skakalec »sede« (velik upor) in pristane ~K − 35 m, a ne pade, če klikne za telemark.
- Odriv: ±25 ms ✨ je težko, ±60 ms je še »dober« in izgubi le nekaj metrov. Pozen odriv bolj vrti naprej (težji začetek leta).
- Prvi skok brez znanja: z namigi (»Drži …«, »Zdaj spusti!«, »Nagni se naprej«, »Klik za telemark!«) pristane pred K brez
  padca. Kdor sploh ne klikne in ne nagiba, pade ob pristanku (»Snežni angel«).
- Sodniki: miren let (bot) dobi 18,5–19,5; nemirno vodenje z miško 15–17. Telemark > dve nogi > trd pristanek > dotik > padec.
- Uglašeno na strani z drsniki in z orodjem: `liftScale`, `updraft`, `prepRate` (3 rad/s), `hTele/hTwo/hNone`,
  `wobbleFree/wobblePerPoint`, `earlySpeedLoss` (0).

## Preverjeno

- `node tests/run-node.mjs` in `tests.html`: 167/167 (17 novih za skoke; Krogla, Rušilec in ostali nespremenjeni).
- Brskalnik (offline): meni, trening na vseh treh skakalnicah, Rekord skakalnice (3 skoki → lestvica, ghost, +40 XP,
  `reportGame` → kovanci na dashboardu), izbira ghosta prijatelja s klikom na lestvico, dva ghosta hkrati, replay z rezi
  kamere (spredaj ob mizi, od strani, od spodaj) in časovno osjo, `?bot=0.8` (cela zanka z novim skokom), stran z drsniki
  (grafi trajektorije in α, primerjava z ghostom).
- Vnos po vseh poteh (miška: pointer dogodki, tipkovnica: preslednica + puščice, dotik: drža/dvig/tap) z avtomatiziranimi
  dogodki, usklajenimi s simulacijo: 10 scenarijev na Brezovi in Orlovi, 3 na Bistri (popoln, prezgodnji, prepozen odriv,
  telemark, dve nogi, brez klika, prepozen klik, preveč naprej, preveč nazaj).
- Konzola brez napak v igri, Krogli, na dashboardu in v `tests.html`. Telefon 375×812 (meni, semafor, let, kartica) in namizje.

## Ni bilo preverjeno

- **Ročno igranje v realnem času** (»sam skoči 10 skokov«): okno brskalnika med testiranjem ni bilo vidno (skrit zavihek,
  ~1–3 FPS), zato so skoki odigrani z dogodki miške/tipkovnice/dotika, ki jih je sprožal skript ob pravih tickih, in s
  hitrim previjanjem simulacije (`__skoki.fastForward`, samo `?debug=1`). Občutek tajminga v živo ni preizkušen.
- **FPS** na namizju in telefonski emulaciji — meritve v skritem zavihku niso merodajne; samodejno nižanje kakovosti
  se je v skritem zavihku sprožilo.
- **Zvok** ni bil poslušan. **Počasni posnetek** pristanka je preverjen le v kodi (v testih previjanja se preskoči).
- Nagib telefona (`deviceorientation`) in realne naprave.

## Supabase

- Migracija `skoki_ghosts` (= `supabase/games/skoki.sql`) pognana. Advisors: pri novih tabelah le splošno opozorilo
  »anonymous sign-ins« (enako kot pri vseh tabelah, namerno) in INFO »unused index« za nov indeks.
- Lažni JWT v transakciji z rollbackom (10 scenarijev): shrani ✓, slabši rezultat → `saved: false`, boljši ✓,
  nemogoče točke → `impossible_time`, prevelik `data` → `ghost_too_big`, neznana skakalnica → `unknown_level`,
  neposreden insert/update v `skoki_ghosts` → `permission denied`, drug igralec bere ghosta ✓, anon → `permission denied`.
- Brskalnik: `?igralec=1` Rekord skakalnice na Brezovi (3 skoki → `game_scores` seed `hill:brezova`, ghost 388 znakov
  v `skoki_ghosts`, +40 XP, `report_game`); `?igralec=2` vidi »TestSkoki1 66,0 m · 125,3 t« na lestvici, klik naloži
  njegovega ghosta v trening. Popravek: dosežki se ne vpisujejo ponovno (prej 409 v konzoli ob vsakem skoku).
- Testna profila (TestSkoki1/2) in vsi njuni podatki so izbrisani (`auth.users` → kaskadno); baza je kot pred testom.
- Popravek (po testu): lokalni najboljši skok je bil na brskalnik, ne na profil (z `?igralec=2` je bil »Moj rekord«
  ghost prvega igralca, prav tako zelena črta, 🏅 v meniju in »Osebni rekord!«). Zdaj `skoki:best:<userId>:<id>`; stari
  ključi se ob prvem zagonu preselijo k trenutnemu profilu. Preverjeno offline z dvema identitetama v istem brskalniku.

## Popravki po igranju (24. 11. 2026)

- **Kontrole samo z miško (kot pri klasičnih računalniških skokih):** odriv = dvoklik na koncu mize (šteje drugi klik,
  okno `takeoff.dblWindow` 0,4 s), zalet brez držanja, telemark = dvoklik pred tlemi, en klik = dve nogi. Preslednica
  in puščice ne upravljajo skoka; desni klik (meni brskalnika) onemogočen. Na telefonu dvojni tap. `paramsVersion` 2
  (stari ghosti in lokalni rekordi ne veljajo). Bot in testi na dvoklik (+1 test), uravnoteženje praktično enako.
- **Trening ne šteje rekordov** (lokalni rekord, 🏅, »Osebni rekord!« le v »Rekordu skakalnice«).
- **Zvok:** zanke tišje (smuči, veter, publika), vzklik publike po pristanku izzveni (prej je »šumelo« naprej), v meniju
  in v skritem zavihku tišina.
- **Oznake:** črte daljave čez doskočišče prej niso bile vidne (trikotniki so bili obrnjeni navzdol) — popravljeno; dodani
  P-točka, debelejši K in HS s količki in tablami na obeh straneh, barvni pasovi ob robovih območja pristanka.

- **Kontrole, 2. različica (po želji):** namesto dvoklika **levi + desni gumb hkrati** za odriv in telemark, en gumb =
  dve nogi (vnos `btn` 0/1/2, ghost v2). V letu se skakalec **sam nagne** v letalni položaj (smer leta z zamikom
  `autoLag` 0,35 s + `autoAlpha` 34°), miška le popravlja — brez popravka pristane pred K brez padca (test).
  `paramsVersion` 3. Zanke zvoka gredo prek skupnega vodila, ki je v meniju in med pavzi popolnoma utišano.

- **Rekord v metrih:** Rekord skakalnice šteje najdaljši skok brez padca (točke ločijo le enako dolge), prav tako lokalni
  rekord, ghost in lestvica (zapis `daljava × 2 × 10000 + točke × 10`, nov seed `rekord:<id>`). Supabase: migracija
  `skoki_record_in_meters` (`skoki_hills.max_dist`, meja v RPC po daljavi in točkah); preizkušeno z lažnim JWT in
  rollbackom (daljši shrani, krajši z več točkami ne, enako dolg z več točkami da, 165,5 m na Orlovi zavrnjeno).

## Ni bilo narejeno (po načrtu za 2. in 3. fazo)

- Tekma z več igralci, replay v živo, boti kot tekmeci, dnevni izziv, letalnica; svetovni pokal, kariera, trgovina z opremo
  (videz skakalca je že parameter `skin`).

## 2. faza — tekma, dnevni izziv, nove skakalnice (`prompts/12-skoki-tekma.md`)

Stanje: **končano** (24. 11. 2026); SQL pognan v Supabase, test tekme s Supabase še ni bil narejen.

### Načrt
- [x] `sport/competition.js` (serije, vrstni red iz seeda, obratni po rezultatu, rez z izenačenji, DNS/DSQ/DNF, ekipe, nagrade-vtičniki, `restore`) in `sport/live-replay.js` (sender/receiver, vmesni pomnilnik 300 ms, luknje, `need`, `verify`) + `sport/README.md`
- [x] `contest.js` (simulacija iz vnosov, veter serije, žirija, za vodstvo, nagrade, dnevni izbor, odklepi, XP), `jumpers.js` (Moji skakalci, koda/JSON, statistika, 43 izmišljenih imen), značaji bota (`bot.js`, privzeti bot nespremenjen)
- [x] `match.js`: soba + lobby (nastavitve, boti, TV), host (stanje, preverjanje, časovne omejitve, prenos hosta, ponovitev skoka), gledanje v živo, reakcije, lower-third, razglasitev, rezultati; lokalna tekma; Moji skakalci
- [x] `game.js`: »motor skoka« za tekmo (človek / bot / tok), dnevni izziv (3 poskusi, lestvica dneva, ghost vodilnega, pogoji dneva), odklepanje skakalnic kot dosežki, skupine v meniju, 9 novih dosežkov
- [x] 5 novih skakalnic (Zajček, Sipina, Reflektor, Orlovo gnezdo, Mirno morje) + parametri fizike skakalnice (`physics`) + izris novih okolij (noč, puščava, Luna, pomlad, plišasta publika)
- [x] Testi `tests/skoki2.js` (16), fiksture prvih treh skakalnic, cilji uravnoteženja za letalnico/Luno, `games.json` (turn, 1–10, party/daily, 3 naloge)
- [x] SQL `supabase/games/skoki.sql`: nove skakalnice v `skoki_hills`, ghost dnevnega izziva (`d-YYYYMMDD`) v `skoki_save_ghost`
- [x] SQL pognan v produkcijski bazi (migracija `skoki_faza2_skakalnice_dnevni_ghost`, z uporabnikovo potrditvijo): 8 skakalnic v `skoki_hills`, `private.skoki_save_ghost` sprejme `d-YYYYMMDD`; advisors brez novih opozoril
- [ ] Test tekme s Supabase (`?igralec=1/2/3`) in meritev zamika replaya

### Dnevnik
- Fizika prvih treh skakalnic je **nespremenjena** (`paramsVersion` 3): pred spremembami je posnetih 9 referenčnih skokov
  (`tests/fixtures/skoki-ref.json`), test jih ponovi bit za bit. Novi parametri (`gravity`, `airDensity`, `liftScale`,
  `pushScale`, `noAir`, `thermals`) se uporabijo le, če jih skakalnica ima; meje pristanka ostanejo v zemeljskih metrih.
- Letalnica: model 1. faze brez sprememb da le ~155 m; z `liftScale` 1,045 in strmino `beta` 36° do `lArc` 235 se let
  podaljša na ~8 s (bot 1,0: 244 m). Pri večjem vzgonu se let »utrga« (jadranje vzporedno s strmino), zato je razpon med
  spretnostmi velik (0,3: 130 m, 0,7: 197 m, 1,0: 244 m) — cilji za letalnico so zato širši (`balanceTarget`).
- Luna: brez zraka je daljava odvisna le od odriva, zato so boti 141 / 149 / 151 m (cilj za 1,0: K … HS + 2).
- Sipina: toplotni stebri podaljšajo skok za ~4 m; zalet `e2` uglašen na 31,5.
- Lokalna tekma: brez XP (kot trening), `reportGame` s številom ljudi; ne gre na lestvice in ne daje ghostov.
- Sprotna lestvica razvršča po seštevku (kot na TV), izločeni po 1. seriji so pod finalisti, DNF/DSQ/DNS na dnu.
- **Zamik replaya v živo:** gledalec začne, ko ima ≥ 300 ms vnosov; v offline testu (BroadcastChannel) je bil zaostanek ob
  koncu skoka 0 ms (izpis `Skoki: replay v živo, zamik …` v konzoli). S Supabase ni bil izmerjen (glej spodaj).

### Preverjeno
- `node tests/run-node.mjs`: 182/182; `tests.html`: 182/182 (s čisto lokalno shrambo — stari »lokalno: …« testi padejo,
  če v `localStorage` ostanejo podatki prejšnjega zagona; tako je bilo že prej).
- Offline multiplayer v 4 zavihkih (host, 2 igralca, TV): ustvari sobo, pridruži se s kodo in prek `?room=`, tekma z dvema
  serijama in boti do konca; gledalci in TV vidijo iste daljave kot skakalec (brez opozoril o neujemanju pri hostu);
  reakcije pri skakalcu in na TV-ju; odhod hosta sredi skoka (nov host sprejel skok); osvežitev igralca na vrsti (dobi skok znova);
  pridružitev med tekmo (gledalec z reakcijami); odšli igralec = DNS »odšel«; zamuda 10 s = DSQ; »Nazaj v sobo« / »Nova tekma«.
- Lokalna tekma (`?bots=5&fast=1`, `?bots=2`): DSQ ob zamudi, človeški skok, razglasitev, posebne nagrade, statistika.
- Dnevni izziv: trije poskusi (porabi se ob štartu), nato trening, lestvica dneva, poročilo hubu, odštevanje do polnoči.
- Posnetki: meni, dnevni izziv, TV 1920×1080 (lestvica, lower-third z »za vodstvo potrebuje«, trak), telefon 375×812
  (gledalec: slika, kartica, lestvica, reakcije), Reflektor, Sipina, Mirno morje, Orlovo gnezdo. Konzola brez napak (igra, dashboard).

### Ni bilo preverjeno
- **Supabase:** SQL je pognan (glej načrt), ni pa bilo cele tekme s `?igralec=1/2/3` in meritve zamika replaya na Supabase;
  testnih vrstic v produkciji ni bilo ustvarjenih (ni kaj brisati).
- Ročni skoki z miško (vsaj 5 na skakalnico) — brskalniško okno je teklo pri ~1,5 sličice/s, zato so skoki preverjeni z botom
  in razvojnimi pomočniki (`?test=1`); »občutek« letalnice in Lune naj preveri človek.
- Žirija v brskalniku (pokrita s testi; v testnih tekmah nihče ni preskočil 95 % HS).
- Ekipna tekma: le seštevek ekip v rezultatih (vrstni red »po skupinah« ni narejen).
- Zastave (emoji) se na Windows prikažejo kot črki (npr. »SI«) — omejitev sistemske pisave.

### Popravki po igranju (24. 11. 2026)
- **Zajček:** miza je 3 m pri 41 km/h, smuči segajo čez rob že ~0,25 s prej, pritisk tik pred tem je bil prezrt (okno odriva 0,22 s). Nov parameter skakalnice `physics.takeoffWindow` (Zajček: 2 → okna odriva ×2) in manjši, otroški skakalec (`theme.jumperScale` 0,65). Uravnoteženje Zajčka ostane v ciljih.
- **Odriv »nazaj po skakalnici« (vse skakalnice):** fizika ob odrivu nastavi nagib na smer leta + 55°; izris je to pokazal v enem okvirju, zato se je trup prevesil ~1 m nazaj. Zdaj izris (`render/jumper.js`) v prvih 0,3 s leta nagib gladko pripelje z naklona mize. Fizika, ghosti in lestvice so nespremenjeni.

## Prave skakalnice (`prompts/29-skoki-prave-skakalnice.md`)

Stanje: **končano** (24. 11. 2026). SQL pognan v Supabase (migracija `skoki_prave_skakalnice`), test s Supabase (`?igralec=1/2`) ni bil narejen.

### Načrt
- [x] 14 FIS-ovih certifikatov (PDF s skisprungschanzen.com) prebranih in prepisanih v `tools/skoki-real-hills.mjs` (generator JSON-ov)
- [x] Model: `landing.betaL` (lok P → L), `unlock` z `hills`/`group`+`size`, `physics.takeoffWindow` < 1 (ožje okno dobrega odriva); trening skakalnice nespremenjene
- [x] Validator: `group`, `real` (kraj, država, leto, vir, rekord brez imena), do 60 zaletnih mest, miza do 9 m
- [x] 14 skakalnic v `hills/` (`group: "prave"`), skupina v `index.json`, teme po krajih (nova možnost `town`)
- [x] Meni: zložljivi skupini, zastava, K/HS, rekord skakalnice, »po profilu skakalnice v … (certifikat …)«, moj rekord; tekma/lokalna tekma z `optgroup`
- [x] Odklepanje (Planica srednja odprta → Planica velika → ostale velike → letalnice) in 4 dosežki
- [x] `skoki_hills` (SQL blok, migracija, advisors), testi `tests/skoki3.js` (6) + fikstura `tests/fixtures/skoki-bot-ref.json`
- [x] Uravnoteženje: bot izpolni cilje 1. faze na vseh 22 skakalnicah (tabela v README)

### Dnevnik
- **Certifikati:** PDF-ji so skenirani; številke so prebrane s slike (ne OCR) in so v orodju z leti izdaje. Vsi so veljavni
  (2021–2026), Lahti (veljaven do 30. 4. 2026) je zadnji objavljen.
- **Geometrija:** `b0` je izpeljan iz h (K-točka točno h pod robom); n se ujema na ±1 m, letalnice ±2,3 m. Certifikatski β v K
  se ujema na ±0,7° — razen Planice, srednje, kjer certifikat sam ni skladen (β 35,17° ob βP 35,65°, βL 30,91°, rL 230 m).
- **Fizika:** `paramsVersion` ostane 3. Vse spremembe so parametri skakalnice; skoki bota na vseh 8 trening skakalnicah so bit za
  bit enaki kot pred spremembo (nova fikstura, posneta s kodo iz HEAD).
- **Zakaj takeoffWindow < 1:** na pravem profilu (doskočišče se pred L položi) je razpon med botoma 0,7 in 1,0 le ~5 m;
  `liftScale`/`pushScale` ga ne povečata, ožje okno dobrega odriva pa ga podvoji (Oberstdorf 0,6: 8 m) pri isti hitrosti.
- **Letalnice:** pri realni hitrosti (~100–105 km/h) najboljši pristanejo ~K + 15 m. Cilj 1,0 → HS − 6 zahteva `liftScale`
  1,13–1,185 in nizko privzeto mesto (91–95 km/h). To je kompromis: skok je občutljiv na zaletno mesto (8–19 m/mesto) in veter.
  Bolj realna letalnica bi potrebovala spremembo aerodinamike za vse skakalnice (nov `paramsVersion`, nove fiksture).
- **Pristanek:** na nekaterih velikih (Planica, Innsbruck, Zakopane) je 1,0 pri HS − 5 pristajal »z dotikom« (hEq > hTele na
  βL ~31°); iskanje zdaj zahteva ≥ 50 % telemarkov, zato tam `liftScale` 1,06–1,12.
- **Lestvica:** prompt navaja `seed: 'hill:<id>'`; ostal je obstoječi `rekord:<id>` (isti kot pri trening skakalnicah, en format za vse).
- **Odklep velikih:** čez K na Orlovi ali Planici, veliki (Planica velika se odklene na srednji) — obe poti, da igralec ni vezan na izmišljeno skakalnico.

### Preverjeno
- `node tests/run-node.mjs`: 188/188 (6 novih, prilagojeni testi profila, zaleta in »brez popravka« za prave skakalnice).
- Brskalnik (offline): meni na namizju in telefonu 375×812 (zložljivi skupini, kartice), 5 skokov z botom na vsaki od 14 pravih
  skakalnic (`?test=1`, naključni veter, brez napak v konzoli), Rekord skakalnice na Planici, srednji (3 skoki, lestvica, »Moj rekord«),
  Innsbruck z mestom, Bischofshofen ponoči.
- Supabase: `skoki_hills` ima 22 vrstic; advisors (security, performance) brez novih opozoril.

### Ni bilo preverjeno
- Ročni skoki z miško na vseh pravih skakalnicah (brskalnik je počasen; preverjeno z botom) — občutek letalnic naj preveri človek.
- `tests.html` v brskalniku (Node teste poganja isti `runAll`).
- Lestvica in ghost s Supabase (`?igralec=1/2`): zahtevalo bi nov anonimni profil v produkcijski bazi.

---

# Ustavi uro (`games/ustavi-uro/`)

Prompt: `prompts/28-ustavi-uro.md`. Stanje: **končano** (25. 11. 2026).

## Načrt

- [x] `logic.js` — generator runde iz seeda (prosta igra po težavnosti, dnevni izziv s 7 modifikatorji, dvoboj in Zadnji stoji),
      odstopanje, prekoračitev (5000 ms), bonus za popoln krog (−20 ms, ne pod 0), ocene (10/50/150/400 ms), povzetek in smer,
      izpadanje z izenačenji, razvrstitev, krone, nagrade, notranja ura, XP, dosežki, niz dni, prikaz časa, komentator (24 vrstic)
- [x] Testi `tests/ustavi-uro.js` (12) — registrirani v `tests/tests.js`
- [x] Ura: velika številčnica s tabelarnimi številkami in slovensko vejico, obroč s kazalcem proti cilju, izginjanje (300 ms) v
      utripajoč »?«, razkritje z vrtenjem številk, odstopanje in ocena, trak −1 s … +1 s, zlati blisk + konfeti / shake
- [x] STOP: ogromen gumb, dotik kjerkoli na polju, preslednica; `pointerdown`/`keydown`, čas iz `event.timeStamp`/`performance.now()`
      od izrisa »Start!« (rAF), 150 ms zaščita po startu in med stopoma; prikaz z rAF, čas vedno iz časovnih žigov
- [x] Zvok (`audio.js`, WebAudio): tiktak (vklop v meniju), pisk ob startu, klik ob STOP, zvoki ocen, fanfara; utišanje se zapomni
- [x] Prosta igra (5 krogov, Lahko/Srednje/Težko, osebni rekord po težavnosti), dnevni izziv (prvi poskus na lestvico, ostalo vaja)
- [x] Pavza (`Esc`/gumb) → krog se ponovi, runda ne šteje za lestvico in rekord; zavihek v ozadju → solo krog se ponovi
- [x] Dvoboj in Zadnji stoji (2–10): host vodi kroge, vsak meri lokalno, `stop {key, taps}`, kljukice brez časa, skupno razkritje
      (trak z avatarji, krona 👑), izpadanje, emoji odzivi izpadlih, prenos hosta, ponovna povezava, revanša, TV pogled
- [x] Konec: povzetek (skupaj, povprečje, najboljši krog, smer, graf odstopanj po krogih, ocene), »tvoja notranja ura«, nagrade v MP
- [x] 10 dosežkov, XP po promptu, 8 nalog v `games.json` (vnos `live`, `asc`, `ms`)

## Dnevnik

- **Modifikatorji dneva (7):** Klasika, Čudni cilji (6–15 s na stotinko, nikoli cela sekunda), Metronom (tiktak 0,88–1,12 s
  ves krog, tudi na slepo), Lažna ura (vidni prikaz ×0,9 ali ×1,1; razkritje pokaže pravi čas), Odštevanje (od cilja do 0,00),
  Dvojni stop (5 s in 10 s; odstopanji se seštejeta, manjkajoč stop = 5000), Dolga pot (en krog 30 s, ura izgine po ≤ 8 s).
  Časi izginotja v dnevnem izzivu so iz seeda: krog 2 po 4–6 s, krog 3 po 2–4 s, krog 4 po 0,5–1,5 s, krog 5 na slepo.
- **Težavnost:** Lahko = vedno 10 s; Srednje = krogi 4–5 naključno 7–15 s (cele sekunde); Težko = od 2. kroga 8–30 s, zadnji 20–30 s.
- **Zadnji stoji:** čas izginotja 6 s → 4,5 s → 3 s → 1,5 s → na slepo; ob izenačenju na dnu ne izpade nihče.
  *Švicarska ura* se tu računa po povprečju na krog (sicer bi jo dobil tisti, ki je izpadel prvi — najdel brskalniški test).
- **Merjenje:** `t0` = trenutek prvega rAF po izrisu »Start!«; če rAF ne pride v 150 ms (zavihek v ozadju), krog začne vseeno —
  v MP bi sicer igralec v ozadnjem zavihku izgubil krog (najdeno v 3-zavihčnem testu: dva sta dobila 5000 ms).
- **Skupni start v MP:** host pošlje `round {gid, r, key}`; vsak klient odšteje 3-2-1 (`ui.countdown`) in meri od **lokalnega**
  starta (izravnava zakasnitve omrežja, ni potrebe po sinhronizaciji ur). Host oceni krog, ko so oddali vsi živi prisotni
  ali po odštevanju + cilj + 5 s + rezerva; manjkajoči (odsotni, osveženi sredi kroga) dobijo prekoračitev.
  Host taps sam ovrednoti z `scoreRound` (klient pošlje le čase stopov). Stanje (`d`) gre vsem ob vsakem `roundEnd`,
  zato nov host nadaljuje z naslednjim krogom; prekinjen krog se odigra znova z novim ključem.
- **Naloge:** `ustavi-uro:round` sporoči najboljši krog runde (en dogodek — dovolj za naloge s `target: 1`),
  `ustavi-uro:total` skupni rezultat (le cela, neprekinjena runda; v MP le dvoboj s 5 krogi), `ustavi-uro:rounds` število krogov
  (`times`), `ustavi-uro:mp-win` zmaga. `cmp: 'lte'` deluje kot pri Reakciji (test v `tests/ustavi-uro.js`).
- **Notranja ura:** krogi, kjer je bila ura ob stopu skrita (brez Lažne ure in Metronoma), zadnjih 60 v `storage` na igralca.
- **Debug:** `?debug=1` skrajša cilje na 30 % (10 s → 3 s; rekordi se ne shranjujejo, lestvica le offline), `&auto=1` samodejni
  stop ±60 ms, `&mod=<id>` preizkus modifikatorja v dnevnem izzivu (vedno vaja).
- **Postavitev:** igralni zaslon ima višino okna (JS `fitPlay`), številčnica se prilagaja prostoru (container query `cqmin`),
  zato je STOP viden tudi na nizkih zaslonih (preizkušeno 800×600 in 375×812). Na ozkih zaslonih je stranski panel skrit,
  zgornja vrstica ostane v eni vrsti.
- Lastne tabele niso potrebne (lestvica = `game_scores` s seedom dneva) → nič za pognati v Supabase.

## Preverjeno

- `node tests/run-node.mjs`: 200/200 (12 novih); `tests.html` 200/200 (prej 5 padcev trgovine/ghostov zaradi ostankov `mg-test:`
  v `localStorage` iz starega zagona — po čiščenju vse uspešno; ni povezano s to igro).
- Brskalnik (offline, `?debug=1&auto=1`): cela prosta runda (razkritja, ocene, graf, bonus, »Še enkrat«), dnevni izziv
  (Odštevanje, mesto 1. na lestvici, nato »vaja«), Dvojni stop (`?mod=double`), pavza z `Esc` (krog se ponovi), zaščita 150 ms.
- Multiplayer v 3 zavihkih: soba s kodo (obrazec) in prek `?room=`, dvoboj Srednje do konca (stopničke, 4 nagrade, povzetek),
  Zadnji stoji s 3 (izpad po krogu, zmagovalec), odhod hosta sredi dvoboja (nov host nadaljuje 5. krog, odsotni dobi 5000 ms),
  revanša, osvežitev igralca sredi igre (vrnitev + sinhronizacija, igra naprej).
- Telefon 375×812 (meni, igra z razkritjem) in namizje; konzola brez novih napak (vibriranje le po dotiku uporabnika).

## Ni bilo preverjeno

- **Natančnost časa pri 60 Hz:** okolje je imelo rAF ~2/s (okno ni bilo v ospredju), zato občutek, tiktak in razkritje
  naj preveri človek na telefonu. Merjenje je iz časovnih žigov dogodkov, zato ga nizek FPS ne pokvari (le zakasni `t0`).
- **Zvok** (WebAudio) — v okolju ni bil slišen.
- **TV pogled** (`?tv=1` / gumb v lobbyju) in emoji odzivi izpadlih — implementirano, a ne preizkušeno v več zavihkih.
- Multiplayer s Supabase (različne naprave, zakasnitev) in lestvica na Supabase.
- `prefers-reduced-motion` (brez shakea, konfetov in vrtenja) — le v kodi.

---

# Smučarski skoki — popravki (25. 11. 2026)

- Konec tekme: rezultati imajo »V meni« (lokalna) / »Zapusti sobo« (spletna); `ui.results({ exit })`.
- Ocene: dve nogi odbitek 3 (prej 1,5), trd 4,5; dotik z roko 8 in šteje kot padec (rekordi, lestvica, odklepi) — po ICR 431.2.
- Kontrole pristanka obrnjene: en gumb = telemark, oba = dve nogi (preslikava v `input.js`, ghosti in boti nespremenjeni).
- Rekord skakalnice / svetovni rekord: zlata črta, čip v HUD-u, proslava (zlata kartica, konfeti/ognjemet, fanfara).
- Meni: »Najdaljši skoki« (svetovni rekord, pravi rekord, najdaljši pri nas, moj) + top 10 po skakalnici (`hub.getTopScores`).
- Animiran vetrokaz desno zgoraj.
- Preverjeno: `node tests/run-node.mjs` 200/200, preklop pristanka v simulaciji (Bistra), proslava in tabela v brskalniku
  (namizje + 375 px). Ni preverjeno: pristanek z resnično miško, gumb za izhod ob dejanskem koncu tekme, `getTopScores` na Supabase.

# Smučarski skoki — zglajena fizika v4 (25. 11. 2026)

- Odriv: telo ob odrivu 34° nad smerjo leta (prej 55° — »potegnilo nazaj«), okni ±35 / ±90 ms, prave skakalnice brez ožjega okna.
- Let: samodejni položaj 32° z zamikom 0,15 s → popoln odriv brez miške ≈ K, nagib naprej −3 … −5° ≈ HS; skupni liftScale 0,99.
- Veter v letu močnejši (updraft 1,0: ±2 m/s ≈ ±11–12 m na Orlovi), pristanek tik pred HS čist (hTele 1,6).
- Občutek: zvok vetra po kakovosti jadranja in vetru, tokovnice in plapolanje dresa; nov model skakalca (V-položaj s skupaj repi).
- Boti: večji raztros pri nizki spretnosti; vse skakalnice znova uglašene (22/22 izpolni cilje), fiksture `tools/skoki-fixtures.mjs`.
- Preverjeno: `node tests/run-node.mjs` 200/200; v brskalniku pravi kliki na Orlovi brez vetra: odriv −27 ms ✨, brez miške 118 m,
  nagib naprej 4° 131 m. Ni preverjeno: igranje z resnično miško/telefonom (občutek), izris na telefonu.

# Smučarski skoki — žirija za veter (25. 11. 2026)

- Žirija pred skokom prilagodi zalet vetru (začetek serije: začetno mesto, med serijo pri razliki ≥ 2), tudi v Rekordu skakalnice.
- Ustaljen veter v tekmi (»Spremenljiv«) in v Rekordu skakalnice (nov način vetra `steady`).
- Animacija spremembe zaletnega mesta s kompenzacijo; točke na mesto izmerjene (`tools/skoki-gatefactor.mjs`).
- Preverjeno: testi 202/202, animacija v Rekordu skakalnice (hrbtni −2,4 m/s → 13 ▲ 17, −27,2 t). Ni preverjeno: spletna tekma v več zavihkih.

# Smučarski skoki — rekordi in pristanek (25. 11. 2026)

- Pristanek (paramsVersion 5): pozen klik = dve nogi, le skrajno pozen = dotik; klik po refleksu = trd pristanek; mehkejše meje.
- Naš rekord skakalnice / svetovni rekord iz lestvice, pravi rekordi ob strani; »Moj« rekord z vseh naprav; osebni rekord v traku.
- Preverjeno: testi 202/202, simulacija pristankov (Orlova, Planica, Zakopane, Willingen, letalnici), meni in trak v brskalniku.

# Smučarski skoki — vse skakalnice odprte (25. 11. 2026)

- Vse skakalnice odprte, Luna po skoku čez K na kateri koli letalnici; oznake ✓ K / ⭐ HS na karticah, dosežka »Zbiratelj K-točk« in »Do HS povsod«.
- Preverjeno: testi 202/202, meni v brskalniku (21/22 odprtih, Luna zaklenjena s pravim besedilom).

# Smučarski skoki — 3. faza: svetovni pokal, kariera, oprema, športni okvir (`prompts/13-skoki-pokal.md`, 26. 11. 2026)

Stanje: **narejeno**, preverjeno offline; SQL pognan v Supabase in preizkušen z lažnimi JWT (glej »Supabase«).

### Načrt
- [x] Športni okvir v `shared/sport/`: `season.js` (koledar sezone iz meseca + seeda, ljubljanski čas s prehodom CET/CEST,
  točke pokala 100-80-60 … 1, razvrstitev postaje/sezone z izenačenji, rez 30, rumena majica, gibanje mest, turneja, naslovi),
  `ko.js` (KO pari 1.–50., srečni poraženci, seštevek turneje), `career.js` (lige, rivali iz seeda s formo in značajem,
  koledar kariera-sezone, napredovanje, izvoz/uvoz); `competition.js` dobi `ko: true` (stare tekme nespremenjene)
- [x] Hub: predmeti za igre (splošno za vse igre: `kind: 'game'`, `game`, `slot`, `equipped.games.<igra>.<slot>`,
  `hub.gameItem`, `hub.equip('<igra>.<slot>', id)`, oba adapterja), pokal (`hub.cupSubmit/cupStandings/cupJump`, oba adapterja)
- [x] SQL: `schema.sql` (stolpca `game`/`slot`, `kind` 'game', blok GAME_ITEMS, `equip` za slote iger, dnevna ponudba brez
  predmetov za igre, `equipped` do 2000 B); `skoki.sql` (`skoki_cup_events`, `skoki_cup_jumps`, pogled `skoki_cup_board`,
  RPC `skoki_cup_submit`, blok CUP_EVENTS iz `tools/skoki-cup-sql.mjs`)
- [x] Igra: `cup.js` (zaslon pokala, uradni skoki, trening postaje z ghosti, replay vsakega skoka, nagrade), `career-ui.js`,
  `gear.js` (oprema → videz), `cup-config.js` (skakalni del koledarja in lige); oprema na skakalcu v treningu, tekmi
  (presence), ghostih, replayih, zastavica v publiki in ob imenu; rumena majica v tekmi in treningu; obvestilo v meniju
- [x] Turneja 4 skakalnic: v koledarju pokala (december) + format »Turneja« v Lokalni in spletni Tekmi (KO pari v 1. seriji)
- [x] Trgovina: zavihek »Za igre« (filter po igri in kosu, predogled skakalca z mojo opremo), garderoba »Moje« po igrah
- [x] 32 predmetov za skoke (10 dresov, 6 čelad, 6 smuči, 10 zastavic; 5 z odklepom z dosežki), 11 novih dosežkov, 3 naloge
- [x] Testi: `tests/sport3.js` (13), `tests/skoki4.js` (10); vsi obstoječi testi nespremenjeni

### Odločitve
- **Okna postaj v tabeli** `skoki_cup_events` (ne koledar v PL/pgSQL): koledar je ena funkcija v JS (`cupCalendar`), SQL blok
  ustvari orodje, test preveri, da se blok ujema s koledarjem. Sezone so vnaprej do `LAST_SEASON` 2028-12 — pred tem podaljšaj
  in znova poženi blok (to je edina slabost).
- **1. serija je odprta ves čas postaje, 2. le zadnji dan.** Rez (najboljših 30 po 1. seriji, izenačeni vsi) RPC preveri ob
  oddaji 2. serije; v razvrstitvi šteje 2. serija le tistim, ki so v rezu po končni 1. seriji. Med prijatelji (< 30) gre naprej vsak.
- **KO pari v pokalu izklopljeni** (asinhrono, < 50 skakalcev); v Lokalni/spletni Tekmi format »Turneja«: pari po istem pravilu
  pri ≥ 4 skakalcih, srečnih poražencev round(N/10) (50 → 5), liho število = srednji brez para naprej, izenačenje v paru: oba.
  Nasev 1. tekme naključen, nato po skupni razvrstitvi turneje.
- **Turneja v koledarju:** v decembrski sezoni štiri postaje pred finalom (Oberstdorf → Garmisch → Innsbruck → Bischofshofen).
  Ime »Turneja 4 skakalnic«, brez imen in podobe prave turneje.
- **Pokal samo na pravih skakalnicah** (9 velikih + srednja Planica, letalnice); finale na letalnici (75 % Planica), ena letalnica
  sredi sezone (»Kralj letalnic«). Pogoji: brez, sneženje, noč, sunki (brez Lune in »samo telemark«). Zalet: žirija po
  napovedi vetra postaje (kompenzacija glede na privzeto mesto), isti za vse.
- **Športni okvir v `shared/sport/`** (prej `games/skoki/sport/`): `competition.js`, `live-replay.js`, `season.js`, `ko.js`,
  `career.js` nimajo skakalnih pojmov (»prizorišče«, »serija«, »točke«), zato jih lahko neposredno uporabi biatlon/slalom.
  Stara pot `games/skoki/sport/*.js` ostane kot re-export (stari uvozi, obstoječi testi).
- **Predmeti za igre niso v dnevni ponudbi** (kozmetika profila in njena ponudba ostaneta natanko enaki — referenčni test).
- **Sled v zraku (`trail`) ni narejena** (neobvezno); sloti skokov: dres, čelada, smuči, zastavica.
- **Dashboard:** ne podpira značk na karticah iger; obvestilo je v meniju igre, v hubu pa nalogi »Skoči v svetovnem pokalu« (m)
  in »Skoči na 3 postajah pokala ta teden« (w). Dashboard ni spremenjen.
- Kariera se shranjuje lokalno (`skoki:career:<profil>`) po vsaki tekmi + koda `KARIERA1:` (hub nima podatkov igre v profilu).
- Zasebni pokal (neobvezno) ni narejen.

### Dnevnik
- Ekonomija: najcenejši kos 40 🪙 (1. dan), najdražji komplet (dres + čelada + smuči + zastavica) 2300 🪙 ≈ 15. dan pri tipičnem
  igralcu (test), cene v razponih redkosti (navadno ≤ 150, redko ≤ 450, epsko ≤ 1200); 5 kosov z dosežki.
- XP: 20 za pokalni skok (največ 2 na postajo), +100 zmaga postaje, +300 zmaga sezone (podeli se ob prvem odprtju po koncu),
  25 za tekmo kariere, +75 napredovanje.
- Razvojno: `?date=2026-12-03` / `?date=2026-12-03T18:30` (le offline), `?pokal=1`, `?kariera=1`, `?bot=0.9` (bot skače
  namesto tebe tudi v pokalu in tekmi; v karieri si bot ti).

### Preverjeno
- `node tests/run-node.mjs` in `tests.html`: **225/225** (202 obstoječih + 23 novih), med njimi fizika (referenčni skoki 1.–2. faze).
- **Pokal offline** z `?date=` in tremi identitetami (`?igralec=1/2/3`, bot namesto skokov): 1. in 2. serija na dveh postajah
  (Willingen, Planica srednja), igralec 2 zamudi 2. postajo (DNS); točke in mesta (1. postaja 100/80/60, 2. postaja 100/80),
  skupno 180 / 160 ↑1 / 80 ↓1, rumena majica 🟡, replay tujega skoka (ista daljava 135,0 m), ghost drugega igralca z njegovo
  opremo v treningu postaje, konec sezone (2. 1. 2027): zmagovalec, »Najbolj stanoviten«, Dvorana slavnih, dosežki
  `pokal-zmaga`, `sezona`, `rumena`, XP 4×20 + 100 + 300. Obvestilo v meniju (»postaja je odprta — še nisi skočil«).
  Rez za 2. serijo, okno, dvojni zapis, velikost in nemogoče točke: test lokalnega adapterja.
- **Kariera:** cela prva sezona (6 tekem, `?bot=0.95`): 3 zmage, zmagovalec Celinskega pokala, napredovanje v Svetovni pokal,
  dosežek `kariera-liga-2`, novinarski napisi, shranjeno po osvežitvi (sezona 2, nov koledar).
- **Trgovina** (offline): zavihek »Za igre« s filtri, nakup in opremljanje dresa, čelade, smuči in zastavice (1640 🪙), zlati dres
  odklenjen z dosežkom sezone; oprema vidna v treningu (🇸🇮 ob imenu, zastave v publiki), v spletni tekmi pri drugem igralcu
  (2 zavihka, gledalec riše skakalca z mojo opremo), v ghostu in v replayu.
- **Lokalna Turneja 4 skakalnic** (3 boti): štiri tekme, skupna razvrstitev in rezultati.
- Konzola brez napak: igra (pokal, kariera, tekma), trgovina, dashboard, Krogla. Telefon 375×812 (pokal, kariera, trgovina —
  brez vodoravnega drsenja; popravljena širina tabele in številka postaje) in namizje.

### Supabase (26. 11. 2026, po odobritvi uporabnika)
- Migraciji `shop_game_items` (stolpca `game`/`slot`, `kind` 'game', 32 predmetov za skoke, `private.equip` za slote iger,
  dnevna ponudba brez predmetov za igre, `equipped` do 2000 B) in `skoki_cup` (tabeli, pogled, RPC). Okna postaj: 265 vrstic
  (2026-12 … 2028-12) — časi izračunani v Postgresu po `Europe/Ljubljana`, **MD5 vseh oken = koledar igre** (ujemanje preverjeno).
- `get_advisors`: brez novih napak; nove tabele imajo le opozorilo »Anonymous Access Policies« (kot vse tabele huba — hub
  namenoma uporablja anonimno prijavo) in INFO »unused index« za nova indeksa.
- Varnostni preizkusi z lažnimi JWT v bloku, ki se na koncu razveljavi (rollback; po tem 0 zapisov, 0 testnih postaj/profilov):
  veljaven zapis ✓ · dvojni zapis `cup_already` · izven okna `cup_closed` · 2. serija pred odprtjem `cup_closed` · 2. serija
  brez 1. `cup_no_r1` · 31. po 1. seriji `cup_cut` (30. sprejet; 31 začasnih uporabnikov) · inputs > 6000 in ne-base64
  `cup_too_big` · točke/daljava nad mejo skakalnice `cup_impossible` · brez prijave `not_authenticated` · neposreden insert za
  drugega, update in insert postaje `permission denied` · pogled vrne zapise z vzdevkom · `equip` brez nakupa `not_owned`,
  napačen in neznan slot `invalid`. Dnevna ponudba v SQL (20. 11.) = referenca iz JS.
- V brskalniku (Supabase): okna postaj in razvrstitev se naložijo, konzola brez napak. Pokalnega skoka v živo s Supabase ni bilo
  mogoče narediti (prva postaja se odpre 1. 12. 2026), profila za testiranje v produkciji nisem ustvarjal.

### Ni bilo preverjeno
- Pravi pokalni skok s Supabase z dvema igralcema (od 1. 12. 2026 dalje) in nakup/opremljanje predmeta za igro prek pravega
  klienta (RPC sta preizkušena z lažnim JWT, klient pa offline).
- Spletna Turneja 4 skakalnic (prehod med štirimi tekmami pri hostu, prenos hosta med turnejo) in KO pari v živo z ≥ 4 skakalci
  (logika je v testih; lokalna turneja je bila preizkušena s tremi boti, torej brez KO).
- Uradni pokalni skok z resnično miško (v testu je skakal bot `?bot=`); kariera na telefonu (dotik).

### Vzdrževanje
- Pred koncem 2028: `LAST_SEASON` v `tools/skoki-cup-sql.mjs` podaljšaj, `node tools/skoki-cup-sql.mjs --write`, znova poženi skoki.sql.

# Smučarski skoki — Pokal: več tekem brez čakanja (26. 11. 2026)

- Nov format **»Pokal: več tekem«** v Lokalni tekmi in v spletni Tekmi (soba): izbereš seznam skakalnic (2–10, hitre izbire
  »Prave velike«, »Letalnice«, »Naključnih 5«), tekme si sledijo takoj ena za drugo (dve seriji vsaka) proti botom ali s
  prijatelji, na koncu seštevek — **točke pokala 100-80-60 …** po mestu ali **točke skokov**. Zamujena tekma = 0 (ne izpade),
  izenačenje: več zmag, nato več drugih mest. Nasev naslednje tekme po skupni razvrstitvi (vodilni skoči zadnji).
  Polje »Skakalnica« se pri Pokalu in Turneji skrije.
- Logika: `shared/sport/ko.js` → `seriesTotal(comps, { pointsFor })`; `match.js` posploši Turnejo v »serijo tekem«
  (`seriesPlan`: Turneja = 4 fiksne skakalnice s KO, Pokal = izbrane skakalnice); `contest.js`: `FORMATS.series`,
  nastavitvi `hills`, `scoring`.
- Svetovni pokal (sezona = mesec, postaje z roki v Supabase) ostane nespremenjen — za asinhrono tekmovanje čez mesec;
  novi format je za igranje »zdaj«, brez čakanja na termine.
- Preverjeno: testi 227/227 (+2), lokalni pokal 3 tekme proti 3 botom (seštevek 280 / 220 / 220, izenačenje po zmagah),
  spletna soba (host + 2 bota, 2 tekmi, samodejen prehod na 2. tekmo, skupni rezultati), skrivanje polj, konzola brez napak.
- Ni preverjeno: spletni pokal z več ljudmi v ločenih oknih (v testu je bil host v ozadnjem zavihku, kjer brskalnik
  upočasni animacijo — njegov skok je presegel 90 s in host ga je po pravilih označil DNF, seštevek je zato 0, kar je pravilno).

- Popravek: boti in replayi ne sprožijo več proslave »REKORD SKAKALNICE!« in ne premaknejo zlate črte (oznaka `noRecord` v motorju skoka; prej le prikaz, v lestvico se boti niso nikoli zapisali — rekordi se shranjujejo le v načinu Rekord skakalnice).
- Popravek: med tekmo (tudi Pokal / Turneja) je sprotna razvrstitev desno zgoraj prekrivala vetrokaz — vetrokaz je zdaj levo ob razvrstitvi (namizje, TV); na telefonu je razvrstitev spodaj. Preverjeno brez prekrivanja pri 1280×720, 820×600 in 375×812.
- Pokal / Turneja: po vsaki tekmi (razen zadnje) vmesni zaslon **Skupna razvrstitev** — točke po tekmah, skupaj, gibanje mest ↑↓, naslednja skakalnica; lokalno počaka na »Naprej« (ali »Prekini«), v spletni sobi ga vidijo vsi ~10 s. Oder pri točkah pokala kaže »N točk«. Preverjeno lokalno (3 tekme, 3 boti: 100/80/60 → po 2. tekmi 160/160/160 z ↑2 ↓1); izgleda zaslona nisem mogel posneti (skrit pregledovalnik), spletne sobe nisem preizkusil.

### Popravki skokov (26. 11. 2026)
- **Pristanek (paramsVersion 7):** brez klika (le refleks tik pred tlemi) ali klik šele po refleksu = **padec** (prej trd pristanek); skrajno pozen klik (< `lateTouch`) prav tako padec. Fiksture znova ustvarjene (`node tools/skoki-fixtures.mjs`), starejši ghosti/replayi so po pravilu verzije zavrnjeni. Pomoč popravljena (oba gumba = telemark, en gumb = dve nogi).
- **»✨ Popoln odriv!«** se ni nikoli skril (le animacija je izzvenela) in se je ponovil pri vsakem naslednjem skakalcu na štartu — zdaj se skrije po 1,5 s in ob vsakem novem skoku.
- **Moji skakalci:** »+ Dodaj« / urejanje nista delala — `ui.modal` ob zaprtju odstrani DOM, obrazec pa se je bral prek `document.querySelector` (null). Zdaj prek `onOpen(box)`. Enako pri uvozu seznama. Na novo dodani skakalci so v Lokalni tekmi samodejno izbrani, nastavitve se med urejanjem ohranijo.
- **Lokalna tekma:** »Skoki botov« privzeto **Preskoči**; pri preskočenem skoku se prikaže skakalnica (prej je ostal viden meni).
- **Turneja 4 skakalnic** po pravem formatu: pri ≥ 4 skakalcih ima vsaka tekma **kvalifikacije** (najboljši nasev zadnji), **KO pari 1.–N., 2.–(N−1).** po razvrstitvi kvalifikacij, v 2. serijo zmagovalci parov + srečni poraženci, končna razvrstitev: izpadli v parih so za vsemi, ki so napredovali (`competition.js`: `qualRanking`, KO z `trial`, `standings` z nivojem).
- **Več skakalnic (pokal):** nova izbira »Vsaka tekma« — ena serija / dve / poskusna + dve (`contest.js` `PER_COMP`, `cfg.perComp`; lokalno in v sobi).
- **Rezultati serije:** po poskusni seriji / kvalifikacijah / 1. seriji vmesni zaslon (razvrstitev, kdo gre naprej, KO pari ✅ 🍀 ✖️); lokalno počaka na »Nadaljuj«, v sobi ga vidijo vsi ~10 s (host počaka).
- **Rekord skakalnice:** vsak veljaven skok seje gre na lestvico takoj (prej le najboljši od treh ob koncu), poleg tega moji uradni skoki v spletni tekmi, pokalu (brez posebnih pogojev) in Lokalni tekmi/karieri, ko skače en sam človek.
- Preverjeno: testi 227/227 (KO test razširjen: končna razvrstitev, kvalifikacije), lokalno v brskalniku: dodajanje/urejanje skakalca, privzeto Preskoči, Turneja s 4 boti (kvalifikacije → pari 1–4, 2–3 → rezultati po 1. seriji → 2. serija 2 skakalca), pokal 2 skakalnici z eno serijo; konzola brez napak.
- Ni preverjeno: spletna soba z več okni (zaslon rezultatov serije pri odjemalcih, čakanje hosta), oddaja na lestvico s Supabase (offline adapter le lokalno), telefon.

### Skoki: skakalnice sezone 2026/27 (26. 11. 2026)
- **14 novih pravih skakalnic** iz koledarja svetovnega pokala 2026/27 (moški + ženske) in svetovnega prvenstva v Falunu 2027, ki jih še ni bilo: velike Lillehammer, Ruka, Wisła, Titisee-Neustadt, Sapporo, Lake Placid, Oslo, Zhangjiakou, Falun; srednje Falun (srednja), Hinzenbach, Ljubno, Zaō, Villach. Novih letalnic ni (Vikersund in Planica sta že bili). Skakalnic, ki letos niso v koledarju, nisem dodajal.
- Parametri so prepisani iz FIS-ovih certifikatov (PDF-ji s skisprungschanzen.com; skenirani sem prebral s slike, Sapporo in Zaō prek izrisa s pdf.js). Vrednosti so v `tools/skoki-real-hills.mjs` (`CERTS`, `THEMES`, `TUNE`), JSON-i so zgrajeni z `--only=<id>`. Viri, leta certifikatov in rekordi so v tabeli README.
- **Izpeljano:** Ruka in Villach `steepToK` (certifikat brez loka rL, strmo do K; začetek loka prilagojen tako, da je naklon v K iz certifikata). Drugače bi bila K v Ruki 1,4 m prenizko. Kubična parabola r1 (Hinzenbach, Ljubno) → 0,14·v0². Fizika in `paramsVersion` sta nespremenjena; trening skakalnice in obstoječih 14 pravih so nespremenjene (polni zagon orodja bi zaradi kasnejšega uglaševanja fizike za 0,1–0,4 premaknil njihov `gateFactor`, zato le `--only`).
- Uravnoteženje (bot 0,3 / 0,7 / 1,0, 50 skokov): vse nove izpolnijo cilje. Spretnost 0,7 pristane do 3 m od K, nikjer ni padcev nad 2 % ali skokov čez HS.
- Zastavice SWE/USA/CHN dodane v `COUNTRY_FLAG` (game.js, cup.js). Vrstice v `skoki_hills` (blok `BEGIN HILLS` v `supabase/games/skoki.sql`), h/n v `tests/skoki3.js`.
- Pokal (`CUP_VENUES`) ostaja nespremenjen, ker bi se sicer premešal že objavljen koledar v `skoki_cup_events`.
- Preverjeno: testi 227/227, v brskalniku meni (zavihek Prave: 24 + letalnice), kartica Ruke (opis, rekord, mesto), skok bota na Ruki in Hinzenbachu, telefon 375×812, konzola brez napak.
- **Supabase:** 14 vrstic v `skoki_hills` pognanih kot migracija `skoki_hills_sezona_2026_27` (v tabeli 36 skakalnic). Advisors: brez novih opozoril (le že znana: anonimni dostop za branje, leaked password protection, unused index).
- **Poenoten `gateFactor`:** orodje pognano na vseh pravih skakalnicah, pri 12 starejših se je spremenil le `gateFactor` (−0,1 … −0,4 točke na mesto; uglaševanje fizike v promptu 31 je zmanjšalo metre na mesto). Profili, privzeta mesta, letalnici Planica in Oberstdorf ter novih 14 so nespremenjeni. Narejeno pred začetkom sezone pokala (1. 12.), da se odprtim postajam ne spremenijo mesta (izbira mesta glede na veter uporablja `gateFactor`). Testi 227/227, bot izpolni cilje povsod. Baza ni prizadeta (`skoki_hills` hrani le največje točke in daljavo).

# Motorist — prompti (26. 11. 2026)
- Napisani prompti za točko »6. Motorist (fizikalni trial)« iz `PREDLOGI-IGER.md` po predlagani razdelitvi:
  `prompts/32-motorist.md` (fizika s Planck.js, voznik z ragdollom, 2,5D izris z deli rendererja Krogle, 10 prog v dveh
  sklopih, napake, medalje, ghost, drsniki `?debug=1`), `prompts/33-motorist-urejevalnik.md` (urejevalnik, skupnostne
  proge, proga tedna, dnevna proga, sklopa 3–4) in `prompts/34-motorist-dirka.md` (dirka do 10 igralcev v živo, sezona,
  predmeti v trgovini). 32 in 33 na koncu posodobita naslednji prompt z dejanskimi spoznanji.
- Posodobljeno: kazalo `prompts/README.md` (naslednja prosta številka 35), oznaka 📝 v `PREDLOGI-IGER.md`, opis in oznake
  vnosa `motorist` v `games.json` (še vedno `soon`), korenski `README.md`. Igra še ni narejena.

# Kresnik — prompti (26. 11. 2026)
- Nova točka »61. Kresnik (klasični platformer)« v `PREDLOGI-IGER.md`: singleplayer 2D platformer v duhu starih
  platformerjev (občutek prvega Raymana: poslikani svetovi, sposobnosti, zemljevid, šefi), a z lastnim junakom,
  svetovi in zgodbo iz slovenskih pripovedk (Kresnik, coprnica Mora, ukradeno Sonce, svetilke namesto zbirk).
- Napisani prompti: `prompts/36-kresnik.md` (lastna deterministična fizika na mreži ploščic, gibanje s coyote/buffer,
  svetlobna krogla, 1. svet Pravljični gozd s 6 nivoji in Gobjim kraljem, zemljevid, reže, življenja, svetilke, medalje,
  ghost, posnetki vnosov, drsniki `?debug=1`), `prompts/37-kresnik-svetova.md` (Kraške jame, Planine, prijem in zamah,
  lebdenje, voda, veter, led), `prompts/38-kresnik-finale.md` (Mlinska dolina, Barje, Morin grad in konec, šprint,
  speedrun in 100 %, kozmetika) in `prompts/39-kresnik-urejevalnik.md` (urejevalnik, nivoji skupnosti, nivo tedna,
  dnevni nivo). Vsak del na koncu posodobi naslednje prompte z dejanskimi spoznanji.
- Posodobljeno: kazalo `prompts/README.md` (naslednja prosta številka 40), vnos `kresnik` v `games.json` (`soon`),
  korenski `README.md`. Opomba pri Jamarju (60) o prekrivanju s Kresnikom. Igra še ni narejena.

# Hrčkova krogla — naključne proge (prompt 30, 26. 11. 2026)
- **Želvica v skupnem modulu** `games/krogla/editor/track.js` (`Track`, `finish`, `D4`, `RAMP_UP` …); `tools/krogla-levels.mjs`
  jo uvozi. Uradne proge so bajtno enake (`node tools/krogla-levels.mjs` → brez razlik v `levels/` in `krogla.sql`).
  `tools/frnikole-tracks.mjs` ima svojo želvico (drug format) — ni združena (zapisano v README).
- **Generator** `editor/generate.js` (`generateLevel`, `generateSteps`, `generateLevelAsync`, `presetOpts`, `normalizeOpts`,
  `estimateTime`): gradniki po vzoru uradnih prog, preverjanje trkov in velikosti mreže pred vsakim gradnikom, točno 5 zvezdic,
  validator + autopilot s pod-semeni (`seed:k`), medalje po formuli generatorja. Web Worker `editor/gen-worker.js`
  (rezerva: v kosih na glavni niti), okno `editor/genui.js` (preprosto + napredne nastavitve, povzetek, sličica).
- **Spoznanja med uglaševanjem** (vsak gradnik posebej, 30–40 semen): (1) na ravnem krogla doseže le ~6,9 m/s (trenje 1,6),
  zato skok z rampe brez spusta pred njim pade v prepad — uradne proge imajo vedno spust; (2) točka pristanka z `r: 1,5`
  takoj za prepadom se doseže še v zraku → autopilot zavira in pade; zdaj 3 ploščice za prepadom; (3) diagonala do stikala
  ali v areno reže čez praznino → točka poti na sredini pred tem; (4) na tekočem traku nazaj s počasnejšo naslednjo točko
  krogla obstane → točka 1 ploščico za trakom; (5) nasilnež: pot obide območje lova (`zone`), sicer ga izrine;
  (6) globina mreže (160) je ozko grlo → proti severu le en gradnik, nato vzhod/zahod po prostoru do roba mreže.
  Prednastavitve so umerjene na izmerjene čase (20 semen): ≈ 20/40/70 s, Nemogoča nekoliko dlje.
- **UI:** »🎲 Naključna proga« v 📁 Proge in v praznem urejevalniku; osnutek je takoj preverjeno rešljiv (`verified` + `levelHash`);
  »🎲 Znova« = nova različica, »▶ Ustvari in igraj« → igra. V meniju igre »🎲 Hitra naključna proga« (težavnost + dolžina →
  takoj igraj, po cilju »💾 Shrani med moje proge«). Nastavitve v `krogla:gen:opts`.
- **Testi:** 20 semen × 5 težavnosti (validator, 5 zvezdic, autopilot pod `levelTime` na Normalni, medalje, `sanitizeLevel`),
  determinizem, »0 sovražnikov/ovir« = 0, štetje po drsnikih (ali opozorilo v `report`), nastavitve, preverjenost osnutka.
  `node tests/run-node.mjs` 232/232, `node tools/krogla-levels.mjs --check` brez razlik.
- **Preverjeno v brskalniku** (`?offline=1`): okno na vseh 5 težavnostih (Worker, vse v 1. poskusu, ~0,2 s), napredne nastavitve
  in »Po meri«, osnutek po osvežitvi »✔ Rešljiva«, autopilot v brskalniku = isti čas kot v Node (48,97 s), »✅ Pripravljeno«,
  🔗 Deli (povezava se odpre v igri), sprememba mreže razveljavi preverjanje, hitra naključna proga v igri (cilj sprožen prek razvojnega dostopa) in »Shrani med moje proge«,
  telefon 375×812, konzola brez napak.
- **Ni preverjeno:** celotna vožnja v pravi zanki igre z `?bot=1` (skrit zavihek brskalnika ustavi animacijo; isti autopilot
  je preverjen v urejevalniku in testih), objava med »Proge skupnosti« na Supabase (le offline adapter), Safari/iOS (modulni Worker).
- Pri skrajnih naprednih nastavitvah (npr. vse ovire in sovražniki na maksimum) zmanjka prostora v mreži 120 × 160 — proga je
  krajša, `report` pa našteje, česa ni bilo mogoče postaviti.


# Hrčkova krogla — nove proge in turnirji (prompt 35, 26. 11. 2026)

Prompt: `prompts/35-krogla-proge-turnirji.md`. Stanje: **končano**.

## Načrt

- [x] 16 novih uradnih prog `13`–`28` v `tools/krogla-levels.mjs` (pomočnik `OT` z vzorci ovir, opozorilo, če se proga dotakne sama sebe)
- [x] Nova polja `diff` (vse proge; klasičnim se je spremenila **le** vrstica `diff`), `len`, `tags`, `look`, `routes.alt`, `shortcuts`, `scoring`
- [x] Razcepa na 18 (Botanični vrt) in 26 (Kristalna jama): varna pot za autopilota, bližnjica v `routes.alt` (test + izpis generatorja)
- [x] Neobvezni mehaniki: ventilator v ritmu (`fans[].period/duty/phase`, `physics.fanState`, izris) in ostre medalje (`scoring.sharp`)
- [x] Nova lokacija `mine` (Rudnik) v `render/looks.js`
- [x] `levels/cups.json` (7 pokalov), validator `validateCups`, odklepi, lestvice `pokal:<id>:<težavnost>`, Klasični ostane `turnir:<težavnost>`
- [x] Tedenski pokal (`isoWeek`, `weeklyPick` — veriga od 2026-W01), lestvica `teden:<leto>-W<nn>`
- [x] `DAILY_POOL` (01–08 + 13, 14, 17, 18, 19, 20)
- [x] `games/krogla/balance.js` + `node tools/krogla-levels.mjs --balance` (tabele spodaj), `--check` primerja z datotekami
- [x] Meni: kartica »🏆 Turnirji«, izbira težavnosti, zrcalni turnir pri Klasičnem, Na čas s filtri in razvrščanjem, lestvice s pokali in tedni
- [x] Maraton: »💾 Shrani in nadaljuj kasneje«, nadaljevanje z oznako »prekinjeno« (ne šteje za lestvico)
- [x] 9 novih dosežkov, 3 nove naloge, opis v `games.json`; SQL blok zlatih časov
- [x] Testi (`tests/krogla2.js`, 10 novih), preverjanje v brskalniku, dokumentacija

## Proge in pokali (meritve)

`node tools/krogla-levels.mjs --balance` (30 zašumljenih voženj na progo: smer ±13°, hitrost ±15 %, zakasnitev 50–120 ms, napaka
pri izbiri trenutka ±0,35 s). Ocena = neuspeh pod uro × 2 + padci × 0,4 + gostota nevarnosti × 0,42 + dolžina; meje ★2–★5 so
uglašene na klasičnih progah. Rezerva ure pokalov: autopilot brez šuma, v oklepaju brez pobranih ur.

<!-- BEGIN KROGLA BALANCE (node tools/krogla-levels.mjs --balance) -->
| Proga | Autopilot | Medalje 🥇/🥈/🥉 | Ura | Dolžina | Težavnost dekl. / izm. | Uspeh pod uro | Padci | Nevarnosti/10 s | Ocena |
|---|---|---|---|---|---|---|---|---|---|
| 01 Ogrevanje | 17.2 s | 17 / 22 / 29 | 28 s | srednja | ★ / ★ | 100 % | 0.0 | 0.3 | 0.15 |
| 02 Vrtnarija | 27.9 s | 28 / 36 / 47 | 41 s | srednja | ★★ / ★★ | 100 % | 0.0 | 2.8 | 1.32 |
| 03 Skodelice | 18.8 s | 19 / 25 / 32 | 30 s | srednja | ★ / ★ | 100 % | 0.0 | 0.0 | 0.00 |
| 04 Kuhinja | 45.5 s | 45 / 59 / 76 | 63 s | srednja | ★★ / ★★ | 100 % | 0.0 | 1.0 | 0.65 |
| 05 Steklena pot | 30.2 s | 30 / 39 / 50 | 44 s | srednja | ★★★ / ★★★ | 100 % | 0.0 | 4.5 | 2.08 |
| 06 Tovarna | 27.6 s | 27 / 36 / 46 | 41 s | srednja | ★★★ / ★★★ | 100 % | 0.2 | 2.9 | 1.47 |
| 07 Stolp | 34.4 s | 34 / 45 / 57 | 50 s | srednja | ★★★ / ★★ | 100 % | 0.0 | 1.3 | 0.73 |
| 08 Ledena dvorana | 22.3 s | 22 / 29 / 37 | 34 s | srednja | ★★★ / ★★★ | 100 % | 0.0 | 3.5 | 1.52 |
| 09 Nasilneži | 17.8 s | 18 / 23 / 30 | 29 s | srednja | ★★★★ / ★★★★★ | 77 % | 1.8 | 7.6 | 4.34 |
| 10 Neon | 24.1 s | 24 / 31 / 40 | 37 s | srednja | ★★★★ / ★★★★ | 100 % | 0.0 | 5.2 | 2.29 |
| 11 Nebo | 20.2 s | 20 / 26 / 34 | 32 s | srednja | ★★★★ / ★★★★ | 97 % | 0.6 | 6.6 | 3.06 |
| 12 Nemogoče | 25.4 s | 25 / 33 / 42 | 38 s | srednja | ★★★★★ / ★★★★★ | 83 % | 2.3 | 7.0 | 4.33 |
| 13 Tobogan | 9.1 s | 9 / 10.3 / 11.9 | 18 s | kratka | ★ / ★ | 100 % | 0.0 | 0.1 | 0.06 |
| 14 Odskočna deska | 12.1 s | 11.9 / 13.6 / 15.7 | 22 s | kratka | ★★★ / ★★★ | 100 % | 0.0 | 4.1 | 1.74 |
| 15 Britev | 13.7 s | 13.4 / 15.4 / 17.8 | 24 s | kratka | ★★★★ / ★★★★ | 97 % | 0.0 | 5.3 | 2.30 |
| 16 Šivankino uho | 15 s | 14.8 / 16.9 / 19.6 | 25 s | kratka | ★★★★★ / ★★★★ | 97 % | 0.2 | 5.5 | 2.46 |
| 17 Pekarna | 27.5 s | 27 / 36 / 46 | 41 s | srednja | ★★ / ★★ | 100 % | 0.0 | 0.5 | 0.27 |
| 18 Botanični vrt | 22.3 s | 22 / 29 / 37 | 34 s | srednja | ★★ / ★★ | 100 % | 0.0 | 1.3 | 0.59 |
| 19 Drsališče | 37 s | 36 / 48 / 61 | 53 s | srednja | ★★★ / ★★★★ | 67 % | 1.1 | 3.0 | 2.69 |
| 20 Rudnik | 42.9 s | 42 / 55 / 71 | 60 s | srednja | ★★★ / ★★★ | 100 % | 0.0 | 2.9 | 1.59 |
| 21 Laboratorij | 36.2 s | 36 / 47 / 60 | 52 s | srednja | ★★★★ / ★★★★★ | 63 % | 1.7 | 4.7 | 3.67 |
| 22 Panj | 43.8 s | 43 / 57 / 73 | 61 s | srednja | ★★★★ / ★★★ | 100 % | 0.0 | 2.7 | 1.54 |
| 23 Ognjenik | 36.9 s | 36 / 48 / 61 | 53 s | srednja | ★★★★★ / ★★★★ | 100 % | 0.0 | 5.4 | 2.59 |
| 24 Nedeljski sprehod | 59.6 s | 58 / 77 / 99 | 81 s | dolga | ★ / ★ | 100 % | 0.0 | 0.3 | 0.20 |
| 25 Velika tura | 84.1 s | 82 / 108 / 139 | 112 s | dolga | ★★★ / ★★★ | 100 % | 0.3 | 2.5 | 1.90 |
| 26 Kristalna jama | 60.8 s | 60 / 78 / 101 | 83 s | dolga | ★★★ / ★★★ | 87 % | 0.3 | 1.4 | 1.37 |
| 27 Nebesna lestev | 99.6 s | 97 / 128 / 165 | 131 s | dolga | ★★★★ / ★★★ | 100 % | 0.2 | 2.8 | 2.09 |
| 28 Hrčkov maraton | 128.9 s | 126 / 166 / 213 | 168 s | dolga | ★★★★★ / ★★★★★ | 87 % | 1.7 | 3.8 | 3.49 |

Spearman (deklarirana težavnost ↔ izmerjena ocena): **0.89** · meje ocene za ★2–★5: 0.25 / 1.35 / 2.2 / 3.3

| Pokal | Proge | Skupaj (autopilot) | Ura | Lahka | Normalna | Noro | Krivulja težavnosti |
|---|---|---|---|---|---|---|---|
| 🏆 Klasični turnir | 12 | 5:11 | ×1 | 55 % (52 %) | 38 % (33 %) | 19 % (11 %) | 1-2-1-2-3-3-3-3-4-4-4-5 |
| 🌱 Hrčkov pokal | 5 | 2:16 | ×1,06 | 56 % (55 %) | 39 % (37 %) | — | 1-2-1-2-1 |
| ⚡ Sprint | 6 | 1:27 | ×0,85 | 52 % (51 %) | 34 % (31 %) | 14 % (8 %) | 1-4-1-4-3-5 |
| 🧭 Svetovna turneja | 8 | 4:19 | ×1 | 53 % (51 %) | 35 % (31 %) | 15 % (8 %) | 2-4-3-4-3-4-3-4 |
| 🏃 Maraton | 4 | 5:04 | ×1,05 | 51 % (49 %) | 32 % (29 %) | 11 % (5 %) | 1-3-3-4 |
| 🔥 Peklenski pokal | 6 | 5:06 | ×0,9 | — | 23 % (20 %) | ne konča (ne konča) | 4-5-3-5-4-5 |
| 📅 Tedenski pokal (2026-W48) | 5 | 2:11 | ×1 | — | 39 % (34 %) | — | 1-1-3-4-4 |

Tedenski pokal (52 tednov od 2026-W48): povprečna težavnost 2.6–3.4 (mediana 3.0), skupna dolžina 2:11–3:42 (mediana 2:53), ponovitve v zaporednih tednih: 0, proge iz bazena, ki se ne pojavijo: nobena.
<!-- END KROGLA BALANCE -->

## Dnevnik

- **Proge.** Najprej vse po tabeli iz prompta, nato uglaševanje dolžin (16 je bila 26 s → 15 s: točke poti pri vratih so bile
  v napačnem vrstnem redu, eno kladivo manj; 20 −6 s; 24 +1 krak; 28 −1 skupina kladiv). Spoznanja: (1) odbijači na ledu
  (moč 7) vržejo autopilota s proge — na ledu moč 3,5; (2) klanec, ki se konča v zavoju na ozek most, vrže kroglo čez rob — vedno
  vsaj 1 ploščica ravnine pred zavojem; (3) na 1 ploščico širokem mostu brez točke poti na sredini autopilot reže čez praznino.
- **Balans.** Prva meritev (samo šum smeri/hitrosti) je bila preblaga — autopilot še vedno idealno čaka na okna. Dodana napaka pri
  izbiri trenutka (±0,35 s) in uteži nevarnosti po smrtnosti; Spearman 0,69 → 0,89. Pri vseh 28 progah je izmerjena ocena ±1
  od deklarirane. Nobene deklarirane težavnosti ni bilo treba spremeniti; največja odstopanja (Stolp ★3 → izm. ★2, Panj ★4 → ★3,
  Šivankino uho in Ognjenik ★5 → ★4) so v meji — model ne zazna dobro težavnosti, ki izhaja iz kamere in ozkih poti z ograjami.
- **Ura pokalov.** Hrčkov pokal ×1,15 → ×1,06 (sicer 43 % rezerve na Normalni) in brez Noro (za začetnike); Sprint ×0,9 → ×0,85;
  Maraton ×1 → ×1,05 (Lahka pod 50 %). Klasični turnir ostane nespremenjen (Noro ima 19 % rezerve — izjema, zapisano v `--balance`).
  Prvotni popravek ure na kratkih progah (`scoring.timeMul` 0,85) je opuščen, ker bi spremenil pričakovanja obstoječega testa formule
  (`timeBonus` ±1) — namesto tega je ostrejša ura pokala Sprint. `timeMul` ostaja kot neobvezna možnost v `rules.js`.
- **Pokali — vrstni red.** Peklenski pokal: Nemogoče (12) zamenjana z Odskočno desko (14) kot »oddih« med težkimi (sicer pravilo
  »med težkima vsaj ena lažja« ni izpolnjivo); Hrčkov in Sprint prerazporejena po istem pravilu.
- **Popravek obstoječe napake:** `mirrorLevel` je zrcalil kladiva, vrata in kvadre po levem robu brez širine (v zrcalnem turnirju so
  bila kladiva na Tovarni 3 ploščice ob poti). Zdaj `x → W − x − w`; vse proge so zrcaljeno rešljive v istem času kot nezrcaljene.
- **Dosežek »Trdna tla«** (»proga 6 ali kasnejša«) bi se po novem odklenil že na Toboganu (13. po vrsti) — zdaj velja za klasične
  06–12 ali proge pokalov s ★3+.
- **Dnevni izziv:** od 26. 11. 2026 bazen `DAILY_POOL` (prej prvih 8 prog) — izbor od tega dne naprej je drugačen kot bi bil prej.
- **Preverjeno** (`?offline=1`, `?bot=1&fast=6` — nov razvojni parameter, simulacija N× hitrejša): svež igralec ima odprte le Klasični,
  Hrčkov in Tedenski pokal; Hrčkov → odklene Sprint → Svetovna turneja → Maraton (prekinitev po 1. progi, nadaljevanje iz menija,
  rezultat »trening«) → Klasični turnir (kot prej: +340 XP, sklop-1/2, turnir, rezerva) → Peklenski pokal → Tedenski pokal;
  povzetki z »Naslednja: … · dolžina · ★«, točke, lestvice (`pokal:*`, `pokal:sprint:normalna:cas`, `turnir:normalna`, `teden:2026-W48`),
  XP (5×20 + 60 itd.), dosežki do `vsi-pokali`. Na čas: filtri Vse/Kratke/Srednje/Dolge, razvrščanje, značke. Lestvice: izbirnik
  pokala, tedna in skupnega časa. Urejevalnik ponudi kopije prog 01–28. Konzola brez napak (igra, urejevalnik, Rušilec, dashboard),
  `tests.html` 242/242, telefon 375×812 (popravljeno: vrstice pokalov so silile vodoravno drsenje; mreža prog ima zdaj 2 stolpca) in namizje.

## Ni bilo preverjeno

- **Ročna vožnja** novih prog s tipkovnico ali na telefonu (človek): orodje brskalnika zna le kratke pritiske tipk; z
  držanimi tipkami prek dogodkov sem prevozil začetek Tobogana (pobral zvezdico), a ne cele proge. Občutek težavnosti (posebej
  15, 16, 22, 23, 28) je treba preveriti z igranjem.
- Supabase: blok `BEGIN LEVELS` je pognan kot migracija `krogla_levels_13_28` (27. 11. 2026; v `krogla_levels` je 28 prog),
  advisors (security + performance) brez novih opozoril. Ni preverjeno: shranjevanje ghosta nove proge in lestvice pokalov na pravem
  Supabaseu (le offline adapter; lestvice so v obstoječi `game_scores`, novi seedi ≤ 64 znakov).
- Tedenski pokal na pravem prehodu tedna (nedelja → ponedeljek po Ljubljani) in dosežek »Vsak teden« (3 tedni).
- Dosežki »Bližnjica« (zlato na 18 po bližnjici) in »Zlata prihodnost« — logika je v igri, v brskalniku nista bila doseženi.
- Okras novih lokacij (prompt 20 še ni narejen; nova lokacija `mine` ima le dekor `motes` in `embers`).

# Pinball motor (prompt 22, 27. 11. 2026)

Miza kot modul: `games/pinball/src/engine/` (motor) + `games/pinball/src/tables/<id>/` (miza). Podrobnosti v `games/pinball/README.md`.

## Načrt
- [x] Zlati test: 12 bot iger (semena 1000 + 17·i), točke, frame-i, štetje in hash zaporedja dogodkov → `tests/fixtures/pinball-golden.json`
- [x] Ločitev motor / Alu miza (jedro igre, pravila kot vtičnik, miza kot podatek, generičen izris) — zlati test zelen
- [x] Lestvica po uporabniku prek huba (`miza:<id>:f<verzija>`), arhiv `scores` samo za branje, brez inicialk
- [x] `?debug=1` (senzorji, drsniki, korak za korakom), merilec strelov (`tools/pinball-shots.mjs`, `?debug=shots`), bot kot modul (`tools/pinball-bot.mjs`)
- [x] Izboljšave fizike (vsaka svoj commit, `PHYSICS_VERSION`++): f2 fiksni korak, f3 guma mirnega flipperja
- [x] Novi elementi (rampe po poti/wireform z zavrnitvijo, zgornji flipper, VUK, saucer, vidni lock, up-post, diverter, standupi,
      drop banke, captive ball, magnet, spinner, lane change, igrača) + testna miza `?miza=test` + 22 testov elementov
- [x] Izbira mize `?miza=<id>`, motor uvozljiv iz druge igre (`startApp(table, view, { gameId })`, primer v README)
- [x] README (struktura, nova miza, elementi, orodja, mapa strelov Alu mize), prompt 23 popravljen

## Dnevnik
- **Zlati test pred refaktorjem.** Bot je dobil `trace` (ime dogodka | točke | frame). Prvi poskus po ločitvi je dal 438 razlik:
  kljuka motorja `onRamp(R, why)` se je ujela z Alu metodo `onRamp()` (rampa zadeta) → vsak vstop na rampo je štel kot
  zadeta rampa. Alu metoda je zdaj `onRampMade`; zlati test je točno to ujel (zato je obstajal).
- **Node ≠ brskalnik.** V Chromu (156) da isti bot drugačno zaporedje kot v Node (24) od frame ~9130 naprej — tudi stara koda
  (preverjeno: stara in nova koda v Chromu imata enakih 2554/2554 dogodkov). Razlog so implementacije `Math.sin/exp/…`.
  Posnetek je zato iz Node; v `tests.html` je zlati test samo informativen.
- **`rulesTest` je bil nestabilen** (nesemeni `Math.random`, ~1 od 5 zagonov je padel »multiball se začne s 3 žogicami«).
  Zdaj teče s semenom 5.
- **Lestvica.** Igra po koncu sama pošlje rezultat (`hub.submitScore`, `seed: 'miza:alu:f1'`, meta: trajanje, žogice, multiballi,
  misije, konec). Brez profila pokaže gumb »SHRANI NA LESTVICO« (odpre `ui.profileModal`). Zavihki: Ta verzija (vsi časi / teden /
  danes), Prejšnje verzije (ko obstajajo), Arhiv (pred portalom) — branje `public.scores` prek REST, v offline načinu ni na voljo.

## Ni bilo preverjeno

# Božični pinball (prompt 23, 28. 11. 2026)

Nova igra `bozicni-pinball` (»Trije dobri možje«) na motorju pinballa: `games/bozicni-pinball/` (miza v `table/`, uvaža
`../pinball/src/engine/`). Pravila, mapa strelov, legenda in bot statistika: `games/bozicni-pinball/README.md`.

## Načrt
- [x] Geometrija: pahljača (Sankališče, Smučka, Jelka, Vlakec, desni orbit, Kepa), Parklji, venec, Z·V·O·N, Snežaki, vreča (lock),
      Alu dno; rampi po Catmull-Rom poteh (križata se nad centrom), zgornji flipper, up-post, ujeta žogica, jelka (igrača)
- [x] Iteracija z merilcem strelov in botom (podaje, okna, outlane/sredina, ball search)
- [x] Pravila: skill shot, super skill shot, ball save, kickback, tilt, bonus X, Darilni multiball (3 locki v vreči),
      jackpoti na 4 strelih, super jackpot v Jelki, add-a-ball, combo, extra ball, pisma, venec, jelka; kljuke za prompt 24
- [x] Grafika: snežna noč, vasica, ledene/plastične rampe, sladkorne palčke, jelka z lučkami in zvezdo, snežaki, dimnik z dimom,
      vreča, vlakec, sani, sneženje (stikalo), backbox z girlando, DMD ilustracija
- [x] Hub: `games.json` (live, 4 naloge), lestvica `miza:bozic:f3`, XP, reportGame, 4 dosežki, povezavi Alu ↔ Božična
- [x] Motor (brez spremembe fizike, zlati test zelen): `Rules.onLaunch`, mapa strelov »?« (`view.ui.help`), stikala mize
      (`view.ui.toggles`), `achievements`/`events` mize, `panelKey`, `shotMapSetup`, bot `drainX` in deleži vseh drainov
- [x] Testi `games/pinball/tests/bozic.js` (41), vsi pinball testi (104) in testi huba (242) zeleni
- [x] README mize in motorja, prompt 24 po dejanskem stanju

## Dnevnik
- **Kam letijo streli.** Najprej prazen »ventilator« trajektorij (Alu dno): z inlana je ≈ 48 ms dolg »pozni« strel (žogica na konici)
  vedno v nasprotni orbit, iz cradla gredo skoraj vsi streli naravnost gor ob sredini (x ≈ 255 levo, 307 desno), vmes so koti
  hitro prepihani (2–10 ms). Postavitev je temu prilagojena: orbita na poznih strelih (≈ 54 ms), rampi na cradle črtah
  (Smučka 48 ms iz levega cradla, Vlakec 36 ms iz desnega), Jelka med njima (≈ 15 ms, namenoma ozka).
- **Prvi poskusi ramp so imeli 0–4 ms:** pregrade med rampo in centrom so se začele na črti vhoda (žogica je zadela
  njihov spodnji konec, preden je prešla na plast rampe), zavoj rampe takoj po vhodu je ubil hitrost (zavrnitev pri 1900 px/s).
  Pregrade zdaj začnejo 18 px nad vhodom, rampi gresta najprej naravnost gor, naklon 320.
- **Dimnik in Pisma sta luknji v kanalih orbitov** (VUK z `capture` 0 = zaprto). Samostojni VUK levo in scoop desno sta imela
  okno 2–8 ms; luknja v orbitu ima okno orbita in ne zmoti pretoka, ko je zaprta. Merilec jih zapre (`shotMapSetup`).
- **Vračanje desnega orbita:** strma vrata so žogico vrgla čez sredino (podaja 56 %). Položna vrata, kanal 70–100 do levega inlana
  in brez gumijastega stebrička na koncu vodila → 64 % na levi flipper, 33 % na desnega (počasnejše žogice ne obkrožijo vrha
  in se po desnem kanalu vrnejo v desni inlane). Cilj ≥ 85 % za desni orbit ni dosežen; Sankališče 96 %, rampi 100 %.
- **Zgornji flipper:** desni (»R« oblika) je dobil žogico na os; obrnjen (»L« oblika, gumb R) pod up-postom (417, 70) jo ujame
  pri moči 0,5–0,9. Super skill shot zato izstreli s fiksno močjo 0,68 (`onLaunch`). Zgornji flipper strelja skoraj navpično,
  zato je »Kepa« tarča zgoraj desno namesto zgornje zanke.
- **Outlane / sredina:** z Alu vodili (50/515) je bilo 81 % drainov po sredini. Vrh vodil 63/502: outlane 47,6 %, sredina 50,3 %.
  Cilja iz prompta (outlane 35–55 % in sredina 20–40 %) hkrati nista dosegljiva, ker skoraj ni drugih drainov (vsota ≈ 98 %);
  izbran je kompromis z daljšo igro (bolj odprta vodila skrajšajo žogico pod 50 s).
- **Pregled slik:** spodnja polovica je bila presvetla (sneg + GI + ACES) → temnejša pobočja in GI; imena ramp na vrhu so bila
  na nasprotni strani (vrh rampe je na drugi strani mize) → ob vhodu; ☃ na bumperjih se v pisavi ni izrisal → obrazi snežakov
  v `drawToys`; naslov »XMAS« je na DMD prekril napis → »DEC«.

## Ni bilo preverjeno
- **Ročno igranje z roko na tipkovnici (5 iger z multiballom):** podokno brskalnika je bilo ves čas skrito, `requestAnimationFrame`
  ne teče. Igra je preverjena z botom (200 iger), testi in s korakanjem igre iz skripte v brskalniku (super skill shot, lock,
  multiball, konec igre, lestvica, dosežki). Občutek »z roko« še čaka na testnega igralca.
- **fps na telefonu (Srednja):** brez vidnega podokna ni meritve; čas izrisa frame-a na CPU je < 1 ms na vseh kakovostih (GPU ni izmerjen).
- **Supabase:** zapis rezultata pod uporabnikom (`miza:bozic:f3`), dosežki in naloge so preverjeni le offline (`?offline=1`).
- Glasba in DMD animacije so še od motorja (prazniče teme so v promptu 24).

# Gneča (prompt 40, 28. 11. 2026)

Nova igra `gneca`: top spodaj strelja tekače, ki gredo skozi vrata (`+ × − ÷`), se spopadejo s sovražno hordo in podrejo
sovražni stolp. Pravila, kontrole, format nivoja in moduli: `games/gneca/README.md`.

## Načrt
- [x] Čista logika brez DOM-a: `balance.js`, `sim.js` (tipizirana polja, fiksen korak 60 Hz, naključje iz seeda v stanju),
      `grid.js` (mreža 1×1), `level.js` (validacija), `score.js`, `upgrades.js`, `autopilot.js`, `daily.js`
- [x] Vrata `+N` (zaloga), `×N`, `−N`, `÷N`, premična in spremenljiva; en prehod na vrata (bitna maska, potomci jo podedujejo)
- [x] Spopad hp proti hp, velikani (merilec, gumb ali samodejno), sovražni velikani, stolpiči ob stezi, ograja, valjar, žaga
- [x] Meja 600 na stran in združevanje (hp se sešteje, tekač zraste), hash stanja
- [x] 20 nivojev (Puščava 10, Kanjon 10 s šefom), uglašeni z avtopilotom (`tools/gneca-tune.mjs`)
- [x] Dnevni nivo iz seeda s fiksnimi nadgradnjami, prvi poskus na lestvico (`hub.submitScore`), ostali vadba
- [x] Delavnica (5 nadgradenj, zobniki), zemljevid z zvezdicami in odklepi
- [x] **Napredek online:** nov splošen API `hub.loadSave` / `hub.writeSave` (oba adapterja), Supabase tabela `gneca_saves`
      (`supabase/games/gneca.sql`, migracija pognana, advisors preverjeni), lokalna kopija + novejši `rev` zmaga
- [x] Three.js 0.160.0: tekači kot `InstancedMesh` (kapsula + oči, nihanje, barva strani), vrata s canvas napisi,
      velikani s HP, stolp (pade ob zmagi), delci, sledi stolpičev, tresenje kamere; nebo in IBL uvožena iz Krogle
- [x] Samodejna kakovost (Visoka/Srednja/Nizka: senče, delci, ločljivost), izbira v delavnici
- [x] WebAudio zvoki + utišanje; vnos: relativno vlečenje (telefon spodnja polovica), miška, ←/→, A/D, Space, G, P
- [x] `?debug=1` (drsniki, hitrost ×1/2/4, mreža trkov, 600 + 600, kakovost, FPS, `gnecaDebug.bench/advance`), `?demo=1`
- [x] Hub: 7 dosežkov, XP (15 / +25 / +20 / +40), `reportGame`, `reportEvent` (`gneca:win|stars|crowd|giant|daily-stars`), 4 naloge
- [x] Testi `tests/gneca.js` (12) + test `loadSave/writeSave` v lokalnem adapterju; vsi testi zeleni (Node in `tests.html`)

## Dnevnik
- **Prvi balans je bil eksploziven:** zmaga v 10–15 s, ker so bila vrata `+N` za vsakega tekača (`+12` ≈ `×13`).
  `+N` je zdaj **zaloga** N tekačev (vsak, ki gre skozi, potegne enega; nato vrata ugasnejo) — zrcalo vrat `−N`.
- **Sovražniki so zdrsnili mimo** ozkega curka tekačev (preboj v 15 s). Dodana privlačnost: sovražnik zavije k najbližjemu
  mojemu tekaču pred sabo (doseg 4,5), moj rahlo k sovražniku (2,2); strel ima razpršenost ±0,45, da tečejo kot množica.
- **Uglaševanje kampanje:** najprej je skript nastavljal HP stolpa → HP med 70 in 20.000 (nesmiselno). Zdaj HP stolpa raste
  (200 + 35 × indeks, šef 1200), bisekcija pa nastavi moč valov, da avtopilot s pričakovanimi nadgradnjami zmaga v ciljnem času.
  Točke za stolp so normalizirane (do 500), za uničene in izgubljene omejene, da hitrejša zmaga ne da manj točk.
- **Avtopilot** cilja sredino dobrih vrat (oceni x ± 0,9), sicer pol množice zdrsne skozi sosednja slaba vrata.
- **Dnevni nivo:** `DAILY` (stolp 420, val 17 na 3 s, +1,6) → avtopilot s fiksnimi nadgradnjami zmaga 195/200 seedov
  (2026-01-01 … 2026-07-19). Današnji (2026-11-28) je eden redkih, ki ga avtopilot ne podre (čas).
- **Merjenje FPS:** podokno brskalnika je bilo skrito, zato rAF teče ~1/s in FPS iz zanke ni veljaven (samodejna kakovost je
  v takem podoknu padla na Nizko). Dodan sinhroni `gnecaDebug.bench()` (izris + `gl.finish`).

## Nivoji (`node tools/gneca-tune.mjs`, avtopilot · pričakovane / brez / največje nadgradnje)

| Nivo | HP stolpa | pričakovane | brez | največje | ★★ / ★★★ |
|---|---|---|---|---|---|
| 1-1 p01 | 200 | zmaga 37 s | zmaga 37 s | zmaga 11 s | 2800 / 3050 |
| 1-2 p02 | 235 | 36 s | 36 s | 11 s | 3010 / 3110 |
| 1-3 p03 | 270 | 40 s | 40 s | 12 s | 2690 / 2970 |
| 1-4 p04 | 305 | 40 s | 51 s | 16 s | 2620 / 2850 |
| 1-5 p05 | 340 | 41 s | čas | 16 s | 2930 / 3030 |
| 1-6 p06 | 375 | 43 s | 89 s | 16 s | 2760 / 2970 |
| 1-7 p07 | 410 | 44 s | 77 s | 17 s | 2740 / 2840 |
| 1-8 p08 | 445 | 42 s | preboj | 13 s | 3050 / 3150 |
| 1-9 p09 | 480 | 39 s | preboj | 14 s | 3080 / 3180 |
| 1-10 p10 | 515 | 35 s | preboj | 16 s | 3050 / 3150 |
| 2-1 k01 | 550 | 51 s | čas | 18 s | 2920 / 3020 |
| 2-2 k02 | 585 | 42 s | čas | 16 s | 2830 / 2930 |
| 2-3 k03 | 620 | 54 s | čas | 20 s | 2930 / 3120 |
| 2-4 k04 | 655 | 50 s | čas | 18 s | 2990 / 3100 |
| 2-5 k05 | 690 | 51 s | preboj | 23 s | 2600 / 2700 |
| 2-6 k06 | 725 | 56 s | čas | 22 s | 2890 / 3100 |
| 2-7 k07 | 760 | 58 s | čas | 24 s | 2760 / 2860 |
| 2-8 k08 | 795 | 59 s | čas | 28 s | 2430 / 2580 |
| 2-9 k09 | 830 | 59 s | čas | 29 s | 2390 / 2490 |
| 2-10 k10 (šef) | 1200 | 45 s | preboj | 17 s | 3630 / 3820 |

Pričakovane nadgradnje pri nivoju i: hitrost round(4·i/19), bonus round(2·i/19), polnilec in HP velikana round(3·i/19), brez širokega topa.

## Zmogljivost
- **Simulacija (Node, test):** 1000 korakov s 600 + 600 tekači = **268 ms** (0,27 ms/korak; meja testa 6000 ms).
- **Brskalnik, namizje (RTX 5080, 1024×768, dpr 1), 591 + 600 tekačev, `gnecaDebug.bench(120)`:** izris Visoka **0,54 ms**,
  Srednja 0,46 ms, Nizka 0,35 ms na sličico + simulacija ≈ 0,33 ms → zmogljivost ≫ 60 FPS (cilj 60 dosežen).
- **Emulacija telefona (375×812):** postavitev preverjena; meritev na istem GPU ni prava meritev telefona (glej spodaj).

## Ni bilo preverjeno
- **FPS na pravem telefonu in v vidnem podoknu:** podokno je bilo skrito (rAF ~1/s), zato ni meritve »v živo«; emulacija
  telefona uporablja namizni GPU. Cilj ≥ 40 FPS na telefonu ostane nepreverjen — samodejna kakovost na telefonu začne na Nizki
  ali Srednji in pade, če FPS dve sekundi ostane pod 45.
- **Ročno igranje z roko:** zaradi skritega podokna so nivoji (1-1, 1-5, dnevni, šef 2-10 z zmago in porazom, poraz na dnevnem)
  odigrani s korakanjem simulacije iz skripte (`gnecaDebug.advance`) in avtopilotom; vlečenje/strel sta preverjena le s kratkim
  vlečenjem miške. Občutek kontrol na telefonu še čaka na testnega igralca.
- Zvoki so preverjeni le, da se ne sesujejo (brez poslušanja).
- **Supabase:** shranjevanje (`gneca_saves`) in nalaganje brez lokalne kopije preverjena s testnim profilom `GnecaTest7`
  (`?igralec=7`); ta je na današnji dnevni lestvici Gneče (398 točk) — lahko ga izbrišeš.

# Napredek online (prompt 45, 28. 11. 2026)

## Načrt
- [x] **Odločitev: ena skupna tabela `game_saves`** (`user_id`, `game`, `slot`, `data`, `rev`, `updated_at`; pk `(user_id, game, slot)`,
  RLS le svoje vrstice) v `supabase/schema.sql` namesto `<igra>_saves` na igro. **Razlog:** API (`hub.loadSave`/`writeSave`) je že
  splošen, vse igre imajo isto obliko zapisa in ista pravila — 8 enakih tabel bi pomenilo 8× enak SQL, pravila in advisorje
  ter SQL ob vsaki novi igri. Ena tabela: nova igra ne potrebuje SQL-a, adapter ne sestavlja imen tabel iz `gameId`.
  `gneca_saves` (1 zapis) je prenesen (`game = 'gneca'`); po objavi na GitHub Pages (push `f011d90`) je stara tabela
  zbrisana (migracija `drop_gneca_saves`, pred tem še en prenos — novejših zapisov ni bilo).
- [x] `shared/progress.js` — `cloudSync(hub, { slot, rules })`: igra opiše, kateri ključi `shared/storage.js` so napredek
  (`key`/`prefix`, `check` = validacija tujega vnosa, `merge` = čista funkcija za konflikt). Ob zagonu: strežnik + lokalno →
  združeno → oboje; kasnejši `S.save`/`S.remove` se sam pošlje (`S.onChange` v `storage.js`). Tako se stari lokalni napredek
  **sam preseli** in se igre skoraj ne spreminjajo (en `await startCloud(hub)` po `hub.init`).
- [x] **Konflikti:** tristransko združevanje z osnovo (zgoščene vrednosti zadnjega skupnega stanja, lokalno): sprememba ene
  strani zmaga (tudi urejanje in brisanje, npr. »Nova kariera«); ko sta spremenjeni obe ali osnove ni (selitev), odloči
  `merge` igre. Kariera: `M.newer` — večji `rev` (nov `st.rev` ob vsakem shranjevanju), ob enakem več odigranih tekem.
  Monotoni podatki (rekordi, odklepi, dnevni poskusi) se **združijo** (min/max/unija/ali) — strožje od »zmaga novejši«,
  ker se ne izgubi nič z nobene naprave. Napaka pri branju (brez povezave) ne spremeni ničesar.
- [x] **Skoki** (`games/skoki/cloud.js`, 4 sloti): `kariera` (cela kariera; nad 60.000 znakov obdrži 40 sezon zgodovine),
  `skakalci` (Moji skakalci + statistika), `rekordi` (osebni rekordi z ghostom; nad mejo se odrežejo ghosti),
  `napredek` (statistika skokov, reakcije, dnevni izziv, porabljeni poskusi in nagrade pokala).
- [x] **Krogla** (časi, odklepi turnirjev, zrcalni, tedni, shranjen Maraton, dnevni poskus, ključavnice, časi deljenih prog),
  **Ladjice** (dnevni poskus, pogodbe, kapitani z zmago), **Frnikole** (dnevni poskus), **Ustavi uro** (rekordi po težavnosti,
  dnevni dnevi, notranja ura), **Zaporedje** (rekord, dnevni dnevi), **Rušilec** (odigrane arene).
- [x] Že prej online: Gneča (zdaj v `game_saves`), Herodle (lastna `herodle_state`). Reakcija nima lokalnega napredka.
- [x] Ostane lokalno (nastavitve / ne napredek): zvok, kakovost, filtri, izbrani kapitan in težavnost AI v Ladjicah
  (`ladjice:level` je izbira, ne odklep), omejitev v Zaporedju, ghosti Krogle (uradni so že na strežniku), osnutki urejevalnika
  Krogle, statistika pinballa (`aluPinball2.stats*`; rekordi so na lestvici huba).
- [x] Testi `tests/progress.js` (10): jedro, round-trip vseh iger, konflikti po igrah, shrink, selitev stare kariere
  (fixture `tests/fixtures/skoki-career-old.json`), dnevni poskus na drugi napravi, brisanje, napaka pri branju.
  `clearLocal` v testih zdaj počisti tudi `db:saves`, `db:ghosts`, `db:quests` (ponoven zagon `tests.html` v istem brskalniku
  je prej padel na 3 obstoječih testih).

## Dnevnik
- Migracija `game_saves_shared_table` prek Supabase MCP; advisors: security — za `game_saves` le splošno opozorilo o anonimni
  prijavi (velja za vse tabele, projekt uporablja anonimne igralce; RLS dovoli le lastne vrstice), performance — nič novega.
- `node tests/run-node.mjs`: 265/265; `tests.html`: 265/265 (tudi ob ponovnem zagonu).
- Supabase, `?igralec=45` (profil `TestNapredek`): stara lokalna kariera (fixture, brez `rev`) vstavljena pred prvim zagonom →
  po zagonu na strežniku (`game_saves`, `skoki/kariera`, 2 tekmi). »Nova kariera« → odigrana tekma kariere (bot, `?bot=0.9`) →
  na strežniku nova kariera (1 tekma, rev 2). Izbris vseh lokalnih ključev Skokov → osvežitev → kariera nazaj s strežnika.
- Ladjice: dnevni izziv začet → `ladjice/napredek` na strežniku → izbris lokalne kopije → gumb »Vaja (rezultat že oddan)«.
- Krogla: zapis časov/odklepov → strežnik → izbris lokalno → nazaj (testni zapis potem izbrisan).
- Konzola brez napak: Skoki, Ladjice, Krogla, Frnikole, Ustavi uro, Zaporedje, Rušilec, Gneča, dashboard; offline
  (`?offline=1`) Skoki, Krogla, Ladjice.

## Ni bilo preverjeno
- **Dve napravi hkrati v živo** (dva brskalnika z isto identiteto) — konflikti so preverjeni le s testi in z brisanjem lokalne kopije.
- Ročno igranje Frnikol, Ustavi uro, Zaporedja in Rušilca do konca na Supabaseu (preverjeno le nalaganje brez napak in testi pravil).
- Velikost resnične dolge kariere (več sezon) in odrezovanje ghostov pri resničnih rekordih — le s testi.
- Telefon (375×812): UI se ni spremenil, zato ni bil ponovno preverjen.
- Testni profil `TestNapredek` (`?igralec=45`) je po preverjanju izbrisan (anonimni uporabnik, profil in vsi njegovi zapisi).
