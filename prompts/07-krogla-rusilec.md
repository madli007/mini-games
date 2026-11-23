# Prompt za AI agenta: Rušilec (party arena za Hrčkovo kroglo, 2–8 igralcev)

> **Stanje:** ✅ narejeno — commit `089b11b` (22. 11. 2026)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/07-krogla-rusilec.md in ga v celoti izvedi.«**
>
> Singleplayer že obstaja (`games/krogla/`, commiti »Hrčkova krogla: 3D singleplayer …«, »… realistična grafika …«).
> Ta naloga doda **realtime multiplayer areno**. Obstoječe proge, fizika singleplayerja, časi, lestvice in ghosti
> ostanejo popolnoma enaki (testi singleplayerja morajo ostati zeleni brez sprememb pričakovanih vrednosti).

---

## Igra

- **Ime:** Rušilec
- **id / mapa:** `rusilec` → `games/rusilec/` (nov vnos v `games.json`; shema zahteva `path: games/<id>/`, zato je to
  ločena igra, ki **uvaža module iz `../krogla/`** — fizika, renderer, hrček, krogla, zvok, vhod. Ne kopiraj kode.)
- **Kratek opis (za kartico):** »Hrčki v kroglah v areni nad prepadom. Izrini prijatelje čez rob, preden poteče čas. 2–8 igralcev.«
- **Način:** `realtime` · **Število igralcev:** 2–8 (prazna mesta lahko zapolnijo boti) · **Oznake:** `party`, `arkada`, `spretnost`
- **Ikona / barva:** 💥 (ali 🐹) · `#ff6b3d`
- V dashboardu in v meniju Hrčkove krogle naj bo povezava »Rušilec (party)« in obratno.

### Kako je v originalu (Hamsterball, Raptisoft 2004) in kaj vzamemo
Original ima party način **»Rodent Rumble«**: do 4 igralci (ljudje ali računalnik) na enem računalniku, vsak s
svojim krmilnikom (miška, tipkovnica, gamepad). Vsi so v zaprti areni na platformi, cilj je čim večkrat izriniti
nasprotnike čez rob ali v smrtonosne ovire v časovni omejitvi. Obstaja **12 aren**, vsaka v slogu ene od prog
turnirja, odklepajo se s **skritimi »ključavnicami«** na progah turnirja (nevidne poti, ki jih najdeš le, če zaviješ
s poti). Poleg tega obstaja še dirka za dva igralca na deljenem zaslonu.

Od tega vzamemo: **arene v slogu naših prog**, **točke za izrive na čas**, **smrtonosne ovire v areni**, **boti** za
manjkajoče igralce in **skrite ključavnice v turnirju**, ki odklenejo skrivne arene. Spremenimo: igra je
**omrežna** (vsak na svojem telefonu, host na TV-ju), do **8 igralcev**, dodamo sunek, pravila za pripisovanje
izrivov in party twiste. Imen, aren, grafike in zvokov iz originala ne uporabljaj — vse je naše (arene temeljijo
na **naših** progah in temah iz `games/krogla/levels/`).

### Jedro igre
- Vsak igralec je krogla s hrčkom (isti model in **isti skin** kot v singleplayerju; ko bo trgovina prodajala krogle,
  se mora videti oprema — skin beri iz `equipped`, če obstaja, sicer barva iz palete igralcev). Barva/obroč pod
  kroglo in ime nad njo (`ui.who(p)` v HUD-u) jasno ločita igralce; **svojo kroglo** označi s puščico/obročem.
- Krogle se **odbijajo med seboj** (elastičen trk z maso; hitrejša krogla odbije močneje). To je glavna nova
  fizika: v `physics.js` krogla trenutno pozna le ploščice, kvadre in sovražnike, zato dodaj čist, testiran modul za
  **trke krogla–krogla** (v `games/rusilec/` ali kot neobvezno razširitev `physics.js`, ki singleplayerja ne spremeni).
- **Sunek** (gumb / preslednica / desni klik): kratek pospešek v smeri vhoda, ponovno na voljo po ~3 s (vidna
  krožna ura na gumbu). Med sunkom je krogla »težja« (večja masa ob trku), zato je sunek v nasprotnika glavna poteza.
  V lobbyju se da izklopiti (»klasično«, kot v originalu).
- **Izriv:** ko krogla pade čez rob ali v smrtonosno oviro, točko dobi **igralec, ki se je je zadnji dotaknil v
  zadnjih 4 s** (krogla, sunek ali tvoj odbijač). Če se je ni dotaknil nihče: **samomor, −1 točka** (nastavitev v
  lobbyju: −1 / 0). Killfeed: »Ana je izrinila Miho«, »Miha se je zakotalil sam«, »Dvojni izriv!« (dva v 2 s),
  »Maščevanje!« (izriniš tistega, ki je izrinil tebe). Najmanj ~20 variant napisov.
- **Ponovni prihod:** po 2 s na prostem izhodišču (najdlje od drugih krogel), 1,5 s **neranljivost** (prosojna
  krogla, ki ne trka in je ne morejo izriniti). Med čakanjem vidiš odštevanje.
- **Na čas:** runda traja 2 / 3 / 5 min (lobby, privzeto 3). Zadnjih 30 s je **»finale«**: rob arene se začne krušiti
  (zunanje ploščice padajo, s telegrafom kot padajoče ploščice v singleplayerju), glasba pospeši.
  Ob izenačenju na vrhu: **nagla smrt** — izenačeni ostanejo, arena se krči, prvi izriv odloči.
- **Igra = 1, 3 ali 5 rund** (lobby). Med rundami lestvica, naslednja arena po izbiri hosta ali »naključno«.

### Arene (vsaj 8; 6 odprtih + vsaj 2 skrivni)
Vsaka arena je kompaktna (vidi se cela na enem zaslonu), visi v zraku, ima jasne robove in vsaj eno »zgodbo«
(mesto, kjer se dogajajo izrivi). Uporabi teme in elemente singleplayerja. Predlog (imena in vsebino lahko
prilagodiš, ostati pa morajo naša):

| # | Arena | Tema (iz proge) | Kaj je posebno |
|---|---|---|---|
| 1 | Ring | Ogrevanje | okrogla ravna plošča brez ograje; za učenje |
| 2 | Cvetlični lonec | Vrtnarija | sklede na sredini, ozki »cvetni listi« ob robu |
| 3 | Krožnik | Skodelice | rahlo izbočena tla, vse drsi proti robu |
| 4 | Pult | Kuhinja | premične ploščice, ki odpirajo luknje v tleh |
| 5 | Tekoči trak | Tovarna | trakovi ob robu vlečejo ven, kladivo na sredini odbije |
| 6 | Drsališče | Ledena dvorana | led povsod, vzmeti v kotih izstrelijo čez areno |
| 7 | Vrtiljak (skrivna) | Neon | vrtljiva plošča in dve žagi na tirnici okoli roba |
| 8 | Oblak (skrivna) | Nebo | otoki z rampami, ventilatorji, sredinski otok se ob finalu potopi |

Neobvezno, če ostane čas: Stolp (dve višini, dvigalo), Nasilneži (nevtralen nasilnež, ki izriva kogarkoli; izriv
se ne šteje nikomur), Nemogoče (zelo majhna arena).

- Arene so **podatki, ne koda**: `games/rusilec/arenas/NN-<ime>.json` + `arenas/index.json`, v **istem formatu kot
  proge** (`games/krogla/README.md`, validator `validateLevel` iz `level.js`), dopolnjenem z `spawns[]` (vsaj 8),
  `finale` (katere ploščice se krušijo in v kakšnem vrstnem redu) in `secret: true|false`. Namesto `start/goal`
  validator za arene preveri izhodišča (na tleh, dovolj narazen). Če format razširiš, razširitev opiši v
  `games/rusilec/README.md` in ne pokvari singleplayerja. Če obstaja urejevalnik prog (`prompts/06-…`), naj zna
  odpreti in shraniti tudi arene (neobvezno; če ne, zapiši v `PROGRESS.md`).
- Sovražniki in ovire v arenah so **deterministični iz časa runde** (kot v singleplayerju), da jih host in klienti
  izrišejo enako tudi brez pošiljanja.

### Skrite ključavnice (povezava s singleplayerjem)
- Na dveh progah turnirja (predlog: Neon in Nebo) dodaj **skrito ključavnico**: nevidno ali komaj vidno pobiralko
  na stranski poti, ki je ni na glavni poti. Ko jo pobereš (v kateremkoli načinu), se odklene skrivna arena
  (dosežek `krogla:kljucavnica-<arena>` ali ločena zastavica prek `hub.unlock`, da velja na vseh napravah) in toast
  »Odklenil si areno Vrtiljak v Rušilcu!«.
- **Ključavnica ne sme spremeniti proge**: ne vpliva na čas, medalje, ghoste, autopilot ali rešljivost. Testi
  singleplayerja morajo ostati enaki. Če dodajanje pomeni spremembo JSON-a proge, preveri, da se `timeBonus` in
  medalje ne spremenijo.
- V lobbyju so skrivne arene na voljo, če jih je odklenil **vsaj en igralec v sobi** (party igre ne smejo biti
  zaklenjene za goste); zaklenjene so sive z namigom »Najdi skrito ključavnico na progi Neon«.

### Načini in twisti (lobby)
1. **Vsi proti vsem** (privzeto): točke za izrive, kot zgoraj.
2. **Ekipe** (4–8): rdeči proti modrim, izriv soigralca je −1 za ekipo; obroči v barvi ekipe.
3. **Zadnji na plošči** (neobvezno): brez ponovnega prihoda, runda se konča, ko ostane eden; arena se ves čas počasi krči.

Twisti (vklop v lobbyju, vsak posebej):
- **Zlati hrček**: vodilni ima zlato krono; njegov izriv je vreden 2 točki.
- **Pobiralke** (privzeto vklopljeno, ena na ~12 s na naključnem mestu): **Utež** (8 s večja masa), **Odbijač**
  (8 s: kdor se te dotakne, odleti), **Zmrzal** (vsem drugim 3 s led pod kroglo), **Magnet** (3 s vleče najbližjega
  nasprotnika k tebi). Vse z jasnim telegrafom in ikono nad kroglo.
- **Duhovi** (samo v načinu Zadnji na plošči): izločeni lahko vsakih 8 s spustijo eno vzmet ali val vetra na rob arene.

### Boti
- Host lahko prazna mesta zapolni z boti (lobby: 0–7, težavnost Lahek / Srednji / Težek). Bot izbere tarčo
  (najbližja krogla blizu roba), se postavi na stran nasprotnika, ki je stran od roba, in uporabi sunek, ko je tarča
  med njim in robom; izogiba se robu in ne pada sam (razen na Lahki, kjer se kdaj zmoti).
- Bote vodi host (del simulacije), po prenosu hosta jih prevzame nov host. Boti nimajo kozmetike in ne dobijo
  nagrad. Boti omogočajo tudi **vadbo solo** (1 igralec + boti; v `games.json` je `players.min` lahko 1, če je
  vadba v igri, sicer 2).

### Kontrole
- Iste kot v singleplayerju (`../krogla/input.js`): tipkovnica (puščice/WASD + preslednica za sunek), miška (krogla
  proti kazalcu, klik/desni klik = sunek), telefon (virtualna palica levo spodaj + velik gumb **SUNEK** desno spodaj;
  neobvezno nagib). **Vhod je relativen na kamero arene** (gor = stran od kamere).
- Kamera: fiksna (ali počasi plavajoča) tričetrtinska kamera, ki pokaže **celo areno** na vsakem zaslonu, tudi na
  telefonu v portretu (prilagodi FOV/razdaljo razmerju zaslona). Brez kamere, ki sledi posamezni krogli.
- Več igralcev na enem računalniku (kot v originalu) je **neobvezno**: npr. igralec 1 = WASD + Shift, igralec 2 =
  puščice + Enter na istem zavihku kot dva lokalna igralca. Naredi le, če ne zaplete omrežnega dela; sicer zapiši.

### Multiplayer (host-authoritative, kot Bomba arena v `PREDLOGI-IGER.md`)
- **Host simulira vse**: fizika pri fiksnem koraku 120 Hz (`STEP` iz `physics.js`), trki med kroglami, izrivi,
  točke, pobiralke, boti, ura runde. Klienti **ne odločajo** o izrivih ali točkah.
- **Vhod:** klient pošilja `room.send('in', { s, x, z, d })` (zaporedna številka, smer vhoda kvantizirana na
  −127..127, sunek) ~30× na sekundo in ob spremembi. Host uporablja zadnji prejeti vhod vsakega igralca.
- **Posnetek stanja:** host pošilja `room.send('snap', …)` **15–20× na sekundo**: čas runde, za vsako kroglo
  položaj, hitrost, rotacija (kvantizirano, kompaktno — cilj < 1 KB za 8 krogel), stanje (živa / pada / čaka /
  neranljiva), aktivne pobiralke. Dogodki (izriv, točke, killfeed, pobiralka, sunek za zvok) gredo kot ločena
  zanesljiva sporočila z zaporedno številko, ki jih klient lahko zahteva znova (`room.send('resync')`).
- **Klienti:** tuje krogle **interpolirajo** med posnetki (zamik ~100 ms); **svojo kroglo napovedujejo** lokalno z
  isto fiziko in jo ob posnetku mehko popravijo (brez vidnega trzanja; ob veliki razliki skok). Sovražniki in
  ploščice arene se izrisujejo iz časa runde.
- **Prenos hosta:** host vsako sekundo pošlje tudi polno stanje (`state` v sporočilu: točke, runda, arena, boti,
  seed pobiralk, zadnji dotiki). Ob `hostChanged` nov host nadaljuje iz zadnjega polnega stanja in zadnjega posnetka
  (krogle na zadnjih znanih položajih); runda se ne začne znova. Toast »Novi host: Ana«.
- **Ponovna povezava:** osvežitev → `joinRoom(hub.roomFromUrl())` → `resync` → igralec se vrne s svojimi točkami.
  Igralec, ki ga ni več kot 20 s, se umakne iz arene (njegove točke ostanejo na lestvici runde, označen kot odsoten).
- **Pridružitev med igro:** nov igralec čaka na naslednjo rundo kot opazovalec.
- Brez pisanja v bazo med igro. Ob koncu igre vsak klient sam pokliče `hub.reportGame` (glej spodaj).
- Omrežna koda naj bo v ločenem, testiranem modulu (npr. `net.js`: kodiranje/dekodiranje posnetkov, interpolacija,
  popravek napovedi), simulacija runde v čistem modulu brez DOM-a (npr. `match.js`), da se da testirati v Node.

### Postavitev zaslona
- **TV / prenosnik (host):** cela arena čez zaslon, ob strani lestvica z avatarji in točkami, killfeed, ura runde.
  Gumb v lobbyju **»Samo zaslon (TV)«**: host je le opazovalec brez lastne krogle (idealno za party).
- **Telefon (portret 375×812):** arena zgoraj, spodaj palica in SUNEK, zgoraj tanka vrstica: ura, tvoje točke,
  mesto. Veliki gumbi, `touch-action: none` na kontrolah, brez hover-only interakcij. Ležeč položaj tudi deluje.
- Ob koncu runde: `ui.results` z mesti in **nagradami**: *Rušilec* (največ izrivov), *Žilavec* (najmanj padcev),
  *Kamikaza* (največ samomorov), *Maščevalec* (največ maščevanj), *Biljardist* (izriv z odbojem prek druge krogle),
  *Zadnji trenutek* (izriv v zadnjih 3 s). Gumb **»Revanša«** = nova igra v isti sobi z istimi nastavitvami.

### Povezava s hubom
- `await hub.init({ gameId: 'rusilec' })`, `ui.header({ title: 'Rušilec' })`, lobby z `ui.lobby` (nastavitve: način,
  dolžina runde, število rund, arena, sunek, samomor −1/0, twisti, boti, »samo zaslon«).
- **`hub.reportGame({ won, players, score })`** enkrat na igralca na koncu igre (`won` = prvo mesto oz. zmagovalna
  ekipa, `score` = točke, `players` = število ljudi brez botov). Igra samo z boti: `players: 1`, brez zmage za XP-farmo
  (glej spodaj).
- `hub.reportEvent`: `rusilec:izriv` (število izrivov v igri), `rusilec:zmaga`, `rusilec:arena` (odigrana arena),
  `rusilec:nagrada`.
- **XP:** 20 za odigrano igro (z vsaj enim drugim človekom), +5 na izriv (največ 15 na igro), +40 za zmago. Solo z
  boti: 10 za igro, brez bonusa za zmago.
- **Dosežki (vsaj 8):** `prvi-izriv`, `zmaga` (zmagaj igro z vsaj 3 ljudmi), `hat-trick` (3 izrivi v 10 s),
  `nedotakljiv` (zmagaj rundo brez padca), `biljard` (izriv z odbojem prek druge krogle), `maščevanje`, `vse-arene`
  (igraj na vsaki areni), `kljucavnica` (odkleni skrivno areno), `osem` (igra z 8 ljudmi), `zadnji-trenutek`.
- **Naloge** v `games.json`: e »Odigraj igro Rušilca« (`play:rusilec`), m »Izrini 5 nasprotnikov v Rušilcu«
  (`rusilec:izriv`, target 5), h »Zmagaj igro Rušilca« (`rusilec:zmaga`), w »Izrini 30 nasprotnikov ta teden«
  (`rusilec:izriv`, target 30). Pred tem preberi `shared/quests.js` (kako se seštevajo `target`/`goal`).
- Lestvice ni (party igra), razen če ostane čas: lestvica »izrivi ta teden« prek `hub.submitScore` — neobvezno.

### Videz in zvok
- Uporabi **renderer, materiale, hrčka, kroglo in lokacije iz `games/krogla/`** (realistična grafika iz prompta 05),
  ne delaj novega. Za 8 krogel naenkrat preveri FPS na telefonu; po potrebi na nižji kakovosti poenostavi krzno/
  steklo tujih krogel (lastna ostane lepa). Samodejno zniževanje kakovosti kot v singleplayerju.
- Juice: iskre in »bonk« ob trku krogel (glasnost glede na moč), val ob sunku, sled pri visoki hitrosti, ob izrivu
  kratek »slow-mo« na TV-ju (ne na telefonih igralcev, da ne moti kontrole), ikona točke, ki odleti k zmagovalcu,
  rahel screen shake, `navigator.vibrate` ob prejetem udarcu (v `try/catch`). Spoštuj `prefers-reduced-motion`.
- Zvok: WebAudio kot v singleplayerju (`../krogla/audio.js`), dodaj trk krogel, sunek, izriv, odštevanje finala,
  glasba, ki se v finalu pospeši. Gumb za izklop (shranjen).

### Tehnično
- Moduli (predlog): `match.js` (čista logika runde: točke, pripisovanje izrivov, ponovni prihod, finale, nagla smrt,
  ekipe, twisti, pobiralke s seedom), `collide.js` (trki krogla–krogla, sunek, masa), `bots.js`, `net.js`,
  `arena.js` (nalaganje in validacija aren), `game.js` (stanja: lobby, odštevanje, runda, med rundami, konec),
  `index.html`. Uvoz iz `../krogla/`: `physics.js`, `level.js`, `render.js`, `input.js`, `audio.js`.
- Fizika neodvisna od FPS, krogle pri največji hitrosti ne gredo skozi druga drugo ali skozi steno (substeps).
- Simulacija je deterministična za isti vhod in seed (pomaga pri prenosu hosta in testih).

### Testi (`tests/tests.js`)
Trk krogla–krogla (ohranitev gibalne količine, težja/hitrejša odbije močneje, ni prehoda pri največji hitrosti),
sunek in ohlajanje, pripisovanje izriva (zadnji dotik v 4 s, samomor, dvojni izriv, maščevanje, ekipe in izriv
soigralca), ponovni prihod (najbolj oddaljeno izhodišče, neranljivost), konec runde, izenačenje in nagla smrt,
pobiralke (determinizem s seedom), validator na vseh arenah (izhodišča na tleh, dovolj narazen, vsaj 8),
kodiranje/dekodiranje posnetka (napaka kvantizacije v mejah, velikost < 1 KB za 8 krogel), interpolacija,
bot v 60 s simulacije na vsaki areni ne pade sam več kot N-krat (Srednji) in kdaj izrine pasivnega nasprotnika,
ključavnice ne spremenijo časov/medalj prog (autopilot da enak čas kot prej).

---

## Fiksni del

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri, posebej broadcast, prenos hosta in ponovna povezava.
3. `games/krogla/README.md`, `physics.js`, `level.js`, `render.js`, `input.js`, `game.js` — kaj lahko uporabiš.
4. `games/reakcija/` — referenčna realtime igra s prenosom hosta.
5. `games/ladjice/` — lobby z nastavitvami, revanša, killfeed, emote, TV pogled.
6. `prompts/TEMPLATE-igra.md` — fiksni del, ki velja tudi tukaj.

### Tehnično (iz predloge)
- Igra v `games/rusilec/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `../../shared/ui.css` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- Uporabi `shared/` za profil, XP, dosežke, sobe (`hub.createRoom`, `hub.joinRoom`, `hub.roomFromUrl`, `ui.lobby`),
  `ui.results`, `ui.toast`, `ui.modal`, `ui.countdown`. Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- Lastne tabele verjetno niso potrebne. Če jih rabiš: `supabase/games/rusilec.sql` (idempotentno, RLS vklopljen,
  `security definer` v `private`), poženi kot migracijo in preveri `get_advisors`; sicer zapiši v `PROGRESS.md`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v Hrčkovi krogli in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (testi krogle in pinballa ostanejo zeleni).
4. Multiplayer v **offline načinu** (`?offline=1`) v **3–4 ločenih oknih** (ne zavihkih v ozadju — glej `CLAUDE.md`):
   ustvari sobo, pridruži se s kodo in prek `?room=`, odigraj celo igro s 3 rundami na različnih arenah, z boti in
   brez, način Ekipe, odhod hosta sredi runde (runda teče naprej, točke ostanejo), osvežitev igralca med rundo,
   pridružitev med igro. Preveri, da izrive pravilno pripiše vsem oknom enako.
5. S Supabase (`?igralec=1`, `?igralec=2`, `?igralec=3`): ena igra prek pravega realtime kanala; preveri zakasnitev
   in gladkost (posnemi opažanja v `PROGRESS.md`).
6. V singleplayerju poberi skrito ključavnico in preveri, da se arena odklene v lobbyju (tudi za drugega igralca v sobi).
7. Izgled na **telefonu (375×812)** s palico in gumbom SUNEK, na **namizju** in v **TV pogledu**: posnemi zaslone,
   sam jih preglej in popravi, kar je neurejeno. FPS z 8 kroglami na telefonski emulaciji razumen.
8. V `games.json` dodaj vnos igre kot **`live`** (in preveri, da test sheme uspe).
9. Posodobi `PROGRESS.md`, `README.md` (seznam iger) in `games/rusilec/README.md` (kontrole, pravila, format aren,
   kako dodati areno, omrežni protokol).
10. Testne profile in podatke, ki jih ustvariš v produkcijski bazi, na koncu **izbriši**.
11. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Prioritete, če zmanjkuje časa
Trki krogel + pripisovanje izrivov (`collide.js`, `match.js` s testi) → 3 arene in Vsi proti vsem z boti lokalno →
omrežni del s prenosom hosta → preostale arene in finale → twisti, pobiralke, ekipe → skrite ključavnice → TV pogled,
nagrade, juice. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati (tudi s TV-jem in telefoni), katere arene so in kako
se odklenejo skrivne, kako se obnese omrežje, kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
