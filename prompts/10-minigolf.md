# Prompt za AI agenta: Hrčkov minigolf (solo + do 10 igralcev)

> **Stanje:** ⬜ čaka — lahko takoj (Krogla in Rušilec obstajata)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/10-minigolf.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »37. Hrčkov minigolf«. Hrčkova krogla (`games/krogla/`) in Rušilec (`games/rusilec/`)
> že obstajata. Ta igra **uvaža njune module** (fizika, renderer, hrček v krogli, zvok, vhod, teme), tako kot Rušilec.
> Hrčkova krogla in Rušilec morata ostati popolnoma enaka: njuni testi ostanejo zeleni brez sprememb pričakovanih vrednosti.

---

## Igra

- **Ime:** Hrčkov minigolf
- **id / mapa:** `minigolf` → `games/minigolf/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Hrček v krogli je tvoja golf žogica. Mlini, zanke, led in vzmeti na 18 luknjah. Sam, dnevno igrišče ali do 10 prijateljev.«
- **Način:** `turn` · **Število igralcev:** 1–10 · **Oznake:** `party`, `daily`, `spretnost`, `rekordi`
- **Ikona / barva:** ⛳ · `#7bd88f`
- **Rezultat:** skupno število udarcev na igrišču. **Manj je bolje** (`scoreOrder: 'asc'`, `scoreUnit: 'udarcev'`).
  V UI prikazuj tudi rezultat glede na par (»−2«, »E«, »+3«).
- V meniju Hrčkove krogle in Rušilca dodaj povezavo »⛳ Minigolf«, v minigolfu pa povezavo nazaj na obe igri.

Igra je minigolf v svetu Hrčkove krogle, ni pa kopija nobene obstoječe golf igre: luknje, imena, grafika in zvok so naši.

### Jedro igre
- **Žogica je hrček v krogli** (isti model, isti skin kot v Krogli: `krogla:skin` oziroma `equipped`, ko bo obstajal
  `hub.gameItem`). Fizika je za vse skine enaka.
- Igralec se postavi na **tee**, namerja in udari. Krogla se kotali sama (brez vhoda med kotaljenjem), odbija od
  sten in ovir, se ustavi in naslednji udarec gre iz mesta, kjer se je ustavila.
- **Luknja (cup):** krogla pade vanjo, če je njen center znotraj polmera luknje in je hitrost pod mejo. Če je prehitra,
  zdrsne čez luknjo ali »poskoči z roba« (kratek zvok in napis »Prehitro!«). To je glavni element spretnosti, zato ga
  natančno uravnaj in testiraj.
- **Čez rob / v vodo / v prepad:** +1 kazenski udarec, krogla se vrne na mesto pred zadnjim udarcem (kot pri pravem minigolfu).
- **Največ udarcev na luknjo:** `par + 4`. Ko jih porabiš, luknja šteje kot `par + 4`, igra pa gre naprej (»Hrček je utrujen …«).
- **Ustavitev:** krogla je ustavljena, ko je hitrost pod pragom ~0,3 s in je na ravnih tleh. Na klancu ali traku se ne
  sme »ustaviti« v zraku. Če se po 12 s še ni ustavila (npr. ujeta na vrtiljaku), jo postavi na najbližje varno mesto.
- **Hrček reagira:** ob dolgem kotaljenju se mu vrti (zvezdice nad glavo), ob luknji v enem udarcu skače od veselja,
  ob kazni se prime za glavo. To so kratke animacije iz obstoječega modela hrčka, kolikor ga `render/ball.js` dopušča.

### Kontrole (udarec)
- **Miška / dotik (privzeto):** primeš kjerkoli na zaslonu in **povlečeš nazaj** (fračo). Smer udarca je nasprotna vlečenju,
  moč je dolžina vlečenja (največ ~40 % višine zaslona). Med vlečenjem je vidna **puščica moči** in kratka črta smeri
  (le do prvega odboja, na težavnosti »Lahka« do drugega). Spust = udarec, vleka nazaj na začetek = preklic.
- **Tipkovnica:** ←/→ (ali A/D) obrača smer (Shift = fino), preslednica drži in spusti za moč (merilec gre gor in dol),
  Esc prekliče merjenje.
- **Kamera:** pred udarcem lahko z dvema prstoma / desnim klikom / Q-E zavrtiš kamero okoli krogle, gumb 🗺️ (ali `Tab`)
  pokaže celo luknjo od zgoraj. Med kotaljenjem kamera mehko sledi krogli. Smer udarca je vedno relativna na kamero.
- `Esc` / `P` / ⏸ = pavza. V solo načinu se igra sama ustavi, ko zavihek ni viden.
- Vhod za udarec naj bo ločen modul (`shot-input.js`), ne razširitev `../krogla/input.js`.

### Fizika (najpomembnejši del)
- Uporabi `../krogla/physics.js` (`createWorld`, `makeBody`, `stepBody`, `advanceWorld`, fiksni korak `STEP = 1/120`).
  Za golf rabiš: **kotalni upor**, da se krogla ustavi; **odboj od sten** z restitucijo; **luknjo**; **ustavitev**.
  Če `physics.js` tega ne zmore brez sprememb, dodaj **neobvezne** parametre (npr. `createWorld(L, { golf: true })`) ali
  ločen modul `games/minigolf/golf-physics.js`, ki ovije `stepBody`. Brez `golf` opcije se `physics.js` obnaša bit za bit
  enako kot prej (testi Krogle in Rušilca to preverijo).
- **Determinizem:** udarec je popolnoma določen z luknjo, začetnim položajem in `{ angle, power }`, časi ovir pa z
  `t` od začetka luknje (premične plošče, mlini, kladiva tečejo po času luknje, ne po času strani). Zato je
  **replay udarca samo par števil**, kar je osnova za multiplayer, replay in ghoste.
  Da se izogneš razlikam med napravami, po vsakem udarcu igralec, ki je udaril, objavi tudi **končni položaj**
  (zaokrožen na mm), drugi pa krogle postavijo nanj.
- Ovire iz Krogle, ki jih golf uporablja: zidovi `#`, klančine, led `i`, lepilo `g` (tu kot **pesek**: veliko trenja),
  valovita tla `~`, tekoči trakovi, premične plošče, vrtiljaki, vzmeti, ventilatorji, odbijači, sklede, kladiva, stikala in
  vrata, kvadri. **Nove ovire samo za golf** (v golf modulu ali kot neobvezna polja):
  - **mlin na veter** (vrtljiva krila, ki zapirajo vhod v tunel; pravočasen udarec gre skozi);
  - **zanka (loop)** s pravo potrebno hitrostjo (prepočasi → krogla pade nazaj);
  - **cev/teleport** (vhod in izhod, krogla ohrani hitrost);
  - **voda** (ploščica, ki šteje kot padec, z valovi in pljuskom);
  - **luknja na premični plošči** (le na zadnjih luknjah).

### Luknje (18, na dveh igriščih po 9)
Luknje so JSON v `games/minigolf/holes/` (vrstni red v `holes/index.json`). Format je **format proge iz Krogle**
(`map`, `hmap`, `theme`, ovire …) z golf polji: `tee: [x, z]`, `cup: [x, z, r?]`, `par: 2–5`, neobvezno `water`, `loops`,
`mills`, `tubes`. Ne potrebuje `goal`, `checkpoints`, `pickups`, `medals`, `timeBonus`. Če `validateLevel` zahteva polja,
ki jih golf nima, napiši `validateHole` v golf modulu (lahko kliče dele `level.js`), ne spreminjaj pravil za proge Krogle.
Za lokacije in barve uporabi `../krogla/themes.js` in `render/looks.js` (vrt, kuhinja, tovarna, led, neon, nebo).

| Igrišče | Luknje | Kaj je novo |
|---|---|---|
| **Vrtno igrišče** (1–9) | ravna steza, prvi zavoj ob zidu, klanec gor, sklede, pesek, **mlin**, voda, vzmet, »dvojna pot« (kratka tvegana in dolga varna) | učenje udarca, odbojev in luknje |
| **Tovarniško igrišče** (10–18) | tekoči trakovi, premične plošče, kladiva, stikalo + vrata, **zanka**, **cevi**, led, ventilatorji, finale z vsem | časovni udarci, ovire po času |

Vsaka luknja mora biti **rešljiva v paru** in vsaj ena na igrišče mora imeti realno možnost **luknje v enem**.

### Reševalec (`solver.js`) in testi
- `solver.js` (brez DOM-a) z iskanjem po mreži kotov in moči (grobo, nato fino okoli najboljših) najde zaporedje udarcev,
  ki pride v luknjo. Uporabi ga v testu: **vsaka luknja se reši v ≤ par udarcih**, in v orodju, ki izpiše, kako težka je luknja
  (koliko odstotkov naključnih »dobrih« udarcev pride v luknjo).
- Orodje `tools/minigolf-holes.mjs` (po vzoru `tools/krogla-levels.mjs`): izriše luknjo v terminalu s potjo reševalca,
  preveri par in zapiše `holes/index.json`.
- Testi v `tests/tests.js`: validator lukenj, ustavitev krogle (na ravnem, na klancu se ne ustavi), luknja (počasi → noter,
  hitro → čez), kazen ob padcu, `par + 4`, točkovanje (glede na par, skupno), determinizem (isti udarec dvakrat = isti položaj),
  dnevni izbor, rešljivost vseh 18 lukenj.

### Načini
- **Igrišče (solo):** 9 lukenj enega igrišča ali **vseh 18**. Kartica rezultatov po vsaki luknji (luknje, par, tvoji udarci,
  barvne oznake: luknja v enem, albatros, orel, ptiček, par, bogey …, v slovenščini: »Luknja v enem!«, »Ptiček«, »Par«, »Bogi«).
  Lestvice `igrisce:vrt`, `igrisce:tovarna`, `igrisce:vse` (`hub.submitScore(udarci, { meta: { holes, shots } })`).
- **Dnevno igrišče:** `hub.rng(hub.dailySeed() + ':minigolf')` izbere **6 lukenj** iz vseh 18 in **dodatek dneva**
  (npr. »Led povsod«, »Nizka gravitacija«, »Veter« z znano smerjo, »Majhna luknja«, »Zrcalno«, »Hitri mlini«).
  Prvi začeti poskus dneva šteje za lestvico (`seed = hub.dailySeed()`), ostali so trening.
- **Vadba:** katerakoli odklenjena luknja, neomejeno udarcev, gumb »Ponovi udarec«. Luknja se odklene, ko jo enkrat odigraš.
- **Ghost:** pri solo igrišču je viden prosojen hrček tvojega najboljšega kroga (ali kroga igralca, ki ga klikneš na lestvici).
  Ghost je **seznam udarcev** (`[{ a, p }]` na luknjo), shranjen v `meta` rezultata (preveri velikost; če `meta` ni primeren,
  ustvari `supabase/games/minigolf.sql` s tabelo `minigolf_rounds`, RLS vklopljen, pisanje le svojih vrstic).

### Multiplayer (2–10 igralcev, room koda)
Host na TV-ju ali prenosniku kaže luknjo in kartico rezultatov, igralci igrajo na telefonih. V lobbyju (`ui.lobby`) host izbere:
- **Igrišče:** Vrt / Tovarna / 18 lukenj / naključnih 6.
- **Način:**
  - **Hkrati (privzeto):** vsi igrajo isto luknjo **istočasno**, vsak na svojem telefonu. Krogle drugih se vidijo prosojno in
    **ne trkajo** (pošteno). Vsak po udarcu pošlje `{ angle, power, endPos }` z `room.send`, ostali na TV-ju in telefonih
    predvajajo udarec. Luknja se konča, ko so vsi v luknji ali je dosegel `par + 4`, ali po časovni omejitvi (90 s; kdor ne
    konča, dobi `par + 4`). Med čakanjem na druge gledaš njihove udarce.
  - **Po vrsti (klasika):** igralci udarjajo po vrsti, **najdlje od luknje udari prvi**. TV pokaže udarec v živo, ostali ga
    gledajo na telefonih. Primerno za 2–4 igralce.
- **Sabotaže (neobvezno):** po vsaki luknji igralec na zadnjem mestu izbere eno sabotažo za vodilnega na naslednji luknji
  (»Pesek pod tee«, »Mala luknja«, »Veter v obraz«, »Obrnjena puščica«). Vidno vsem, z zabavnim napisom.
- Kartica rezultatov je v `room.setState(..., { expectedVersion })` (vsaka luknja, vsak igralec), zato prenese osvežitev
  strani in **prenos hosta** (`hostChanged`): nov host nadaljuje iz zadnjega stanja. Udarci so v `room.pushMove`, da jih
  ponovno povezan igralec lahko predvaja.
- Na koncu `ui.results` s skupnimi udarci in nagradami (»Ostrostrelec« za največ lukenj v enem, »Vztrajnež« za največ
  kazni, »Natančnež« za najmanj udarcev na zadnjih treh luknjah …).

### Hub, XP, dosežki, naloge
- `hub.reportGame({ won, players, score, daily })` po vsakem odigranem igrišču, enkrat na igralca (v solo `won` = rezultat
  ≤ par igrišča).
- **XP:** 20 za igrišče, +5 za vsako luknjo pod parom (≤ 25), +40 za zmago v multiplayerju z vsaj 2 človekoma.
- Dogodki: `minigolf:luknja` (×odigrane luknje), `minigolf:ace` (luknja v enem), `minigolf:pod-par` (skupni rezultat pod
  parom), `minigolf:mp-win`, `daily:minigolf`.
- **Dosežki:** `ace` (prva luknja v enem), `pod-par` (igrišče pod parom), `vse-18` (vseh 18 lukenj v enem krogu),
  `brez-kazni` (igrišče brez kazni), `zanka` (skozi zanko v prvem poskusu), `trik` (luknja po odboju od vsaj 3 sten),
  `zmaga-10` (zmaga v igri z 10 igralci).
- **Naloge v `games.json`:** `e` »Odigraj 9 lukenj minigolfa« (`minigolf:luknja`, 9), `m` »Zadeni luknjo v enem«
  (`minigolf:ace`, 1), `h` »Končaj igrišče pod parom« (`minigolf:pod-par`, 1), `w` »Odigraj 36 lukenj ta teden«
  (`minigolf:luknja`, 36).

### Občutek in stil
- Grafika iz rendererja Krogle (iste lokacije in kakovostne stopnje, samodejno zniževanje kakovosti), le kamera je
  minigolfova. Zastavica na luknji z napisom številke, ki se dvigne, ko se krogla približa.
- **Juice:** rahel »klik« ob udarcu (moč vpliva na zvok), odboji s pravim zvokom glede na material, pljusk v vodi,
  konfeti in fanfara ob luknji v enem, počasen posnetek (slow motion) zadnjega metra pred luknjo, kadar je na robu.
- Slovenski komentator ob dogodkih (najmanj ~25 napisov): »Mimo za las!«, »Hrček je šel na kopanje.«, »Luknja v enem! Kdo
  te je učil?«, »Pesek, pesek povsod.« …
- Telefon (375×812, portret): luknja zgoraj, spodaj velika površina za fračo; gumbi 🗺️, ↺, ⏸ dovolj veliki.

### Ni del te naloge (naslednji prompti)
- Podpora za luknje v urejevalniku Krogle (`editor.html`: objekti tee, cup, par, mlin, zanka, cev) in skupnostne luknje v Supabase.
- Predmeti v trgovini (palice, zastavice, sledi). Format lukenj in skin naj to kasneje omogočata brez sprememb.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta).
4. `games/krogla/README.md` in `games/rusilec/README.md` — moduli, ki jih uvažaš, format prog in kako je Rušilec razširil fiziko.

### Tehnično
- Igra v `games/minigolf/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'minigolf' })` (`scoreOrder: 'asc'`);
  `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge) — v solo in v multiplayerju, enkrat na igralca. Posebne dosežke za naloge sporoči s
  `hub.reportEvent('minigolf:<ime>', vrednost)`. Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')`) in **ponovno povezavo** (osvežitev strani → `joinRoom(hub.roomFromUrl())` → sinhronizacija).
- Potezno stanje: `room.setState(state, { expectedVersion })`, `room.pushMove`, `room.getMoves`.
- Če igra potrebuje svoje tabele: `supabase/games/minigolf.sql` (idempotentno, RLS vklopljen, predpona `minigolf_`). Če imaš
  Supabase MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati.
- Čisto logiko (pravila, točkovanje, golf fizika, validator, dnevni izbor, reševalec) daj v ločene module brez DOM-a in dodaj
  teste v `tests/tests.js`.
- Razvojni parametri po vzoru Krogle: `?hole=N` (takoj odpri luknjo), `?bot=1` (udarja reševalec, za preverjanje), `?q=low|…`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v Krogli, v Rušilcu in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi Krogle in Rušilca, nespremenjeni).
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih, v obeh načinih (Hkrati in Po vrsti): ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj do konca, odhod hosta sredi igre, osvežitev strani igralca sredi luknje.
5. Z `?bot=1` odigraj vseh 18 lukenj skozi pravo zanko igre.
6. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno
   (fračo preizkusi tudi z dotikom).
7. V `games.json` dodaj vnos igre s statusom **`live`** in nalogami (in preveri, da test sheme uspe).
8. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno) in napiši `games/minigolf/README.md`
   (kontrole, pravila, načini, format luknje, kako dodati luknjo).
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
