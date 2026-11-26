# Prompt za AI agenta: Motorist (1. del: fizika, voznik, proge, medalje, ghost)

> **Stanje:** ⬜ čaka — predpogoj 01 ✅ (priporočeno 03/05 ✅ zaradi rendererja Krogle)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/32-motorist.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »6. Motorist (fizikalni trial)«. V `games.json` že obstaja vnos `motorist`
> s statusom `soon` (opis in oznake so že usklajeni s tem promptom); ta prompt doda `scoreOrder`, naloge in ga preklopi v `live`.
> Ta igra **uvaža dele rendererja Hrčkove krogle** (`games/krogla/render/*`: nebo, teksture, materiali,
> post-processing, samodejna kakovost) in **vzorec ghostov** (`games/krogla/ghost.js`). Ne kopiraj kode.
> Krogla mora ostati popolnoma enaka: njeni testi ostanejo zeleni brez sprememb pričakovanih vrednosti.
>
> **Obseg tega prompta je singleplayer** (občutek vožnje, proge, medalje, ghost). Urejevalnik prog, skupnostne proge,
> dnevna proga, dirka v živo in trgovina so naslednja prompta `33-motorist-urejevalnik.md` in
> `34-motorist-dirka.md`, ki sta že napisana. Na koncu ju **posodobi** z dejanskimi spoznanji (glej zadnji razdelek).

---

## Igra

- **Ime:** Motorist
- **id / mapa:** `motorist` → `games/motorist/` (vnos v `games.json` že obstaja; posodobi ga)
- **Kratek opis (za kartico, do 160 znakov):** »Fizikalni trial s strani: plin, zavora in nagib čez hlode, zaboje
  in stopnice. Čim hitreje in brez padca do cilja.«
- **Način:** `single` · **Število igralcev:** 1 (multiplayer pride v promptu 34) · **Oznake:** `fizika`, `arkada`, `daily` (od prompta 33)
- **Ikona / barva:** 🏍️ · ostane `#ff4fd8` (ali boljša, če se tepe z drugimi karticami)
- **Rezultat:** čas proge v ms z **kaznijo za napake** (glej Točkovanje). **Manj je bolje** (`scoreOrder: 'asc'`, `scoreUnit: 'ms'`
  ali prikaz kot čas).

Igra je naša: ime, proge, voznik, motor, grafika in zvok so lastni, ne kopija nobene obstoječe trial igre
(brez znanih imen, likov, prog ali videza).

### Jedro: občutek vožnje (najpomembnejše)
- Motor je **šasija + dve kolesi** z **vzmetenjem** (zadaj nihajka/vzmet, spredaj vilice ali vzmet + dušilka).
  **Plin** poganja zadnje kolo (navor z omejitvijo vrtljajev), **zavora** obe kolesi (zadnja malo manj, da je
  možen »stoppie« le z namenom). Ob mirovanju in zavori motor ne drsi nazaj po blagem klancu.
- **Nagib** (←/→) je glavni vhod: voznik premakne težišče naprej/nazaj in z navorom na šasijo zavrti motor.
  V zraku nagib vrti motor (nadzor rotacije za pristanek), na tleh omogoča **wheelie**, dvig sprednjega kolesa na
  stopnico in pritisk sprednjega kolesa ob strmem vzponu.
- **Padec:** ko se glava/trup voznika dotakne tal ali se motor prevrne čez mejni kot za > 0,4 s → voznik postane
  **ragdoll** (glava, trup, nadlaket, podlaket, stegno, golen, zglobi z omejitvami kota), motor pade po svoje.
  Po ~1,2 s (ali takoj s tipko) **vrnitev na zadnjo kontrolno točko** in +1 napaka.
- **Fiksen korak 120 Hz** (akumulator, največ ~8 korakov na sličico, pri večjem zaostanku upočasni, ne preskakuj).
  Vhod se vzorči na korak. Isti vnosi na isti napravi → isti izid (determinizem v okviru brskalnika).
- **Fizika — priporočeno Planck.js** (port Box2D) prek CDN s **pripeto verzijo** (npr.
  `https://cdn.jsdelivr.net/npm/planck@1.0.6/dist/planck.mjs` ali kar je zadnja stabilna ESM različica — preveri,
  da se uvozi kot ES modul in deluje offline iz predpomnilnika; verzijo zapiši v README). Kolesa = krogi z
  `WheelJoint` (vzmet + dušenje vgrajeno), voznik = telesa z `RevoluteJoint` (meje kotov), ob padcu se zglob
  voznik–motor sprosti. Če Planck ne gre (ESM, velikost, determinizem), utemelji v `PROGRESS.md` in naredi lastno
  fiziko po vzoru `games/pinball/src/physics.js` / `games/skoki/` — a to je zasilna pot.
- **Stran z drsniki `?debug=1`** (po vzoru `games/skoki/debug.js`): moč motorja, največja hitrost, zavora, trdota in
  dušenje vzmetenja (spredaj/zadaj), trenje gum, moč nagiba v zraku in na tleh, masa voznika, gravitacija, korak.
  Shrani/naloži v `localStorage` (velja **le** z `?debug=1`), izvoz JSON za vpis privzetih vrednosti v `config.js`.
  Brez `?debug=1` igra **vedno** uporablja fiksne vrednosti iz `config.js` (sicer časi niso primerljivi).
  Prikaži tudi diagnostiko: hitrost, vrtljaji, stisk vzmeti, kontakt koles, kot šasije.
- **Testna proga »Poligon«** (`?track=poligon` in v meniju pod »Razvoj«, ko je `?debug=1`): ravnina, valovi,
  stopnice 0,5/1/1,5 m, hlod, skakalnica z doskočiščem, strmina 35°, gugalnica. Najprej uglasi na njej, šele potem
  delaj proge. Uglaševanje in končne vrednosti zapiši v `PROGRESS.md`.
- Merilo občutka (preveri sam in zapiši): motor ni »plavajoč« (pade hitro, pristanek ima težo), ni nervozen
  (en kratek nagib ne prevrne motorja na ravnem), wheelie je možen in obvladljiv, stopnica 1 m gre z zamahom,
  1,5 m le z dobrim zamahom, 35° vzpon gre le s pritiskom naprej.

### Proge
- **Format:** `games/motorist/tracks/NN-ime.json` + `tracks/index.json` (vrstni red, sklopi). Predlog:
  ```json
  { "id": "01-kamnolom", "name": "Kamnolom", "set": 1, "theme": "kamnolom",
    "terrain": [[0,0],[40,0],[46,1.2],[60,1.2]],            // lomljena črta (x, y v m); po želji "curve": true za gladko (Catmull-Rom)
    "objects": [ { "type": "crate", "x": 20, "y": 0.5, "w": 1, "h": 1, "mass": 30 },
                 { "type": "log", "x": 30, "y": 0.3, "r": 0.3, "len": 1.2 },
                 { "type": "seesaw", "x": 52, "y": 1.2, "len": 6 } ],
    "start": { "x": 2 }, "checkpoints": [ { "x": 28 }, { "x": 50 } ], "finish": { "x": 58 },
    "medals": { "gold": 31000, "silver": 38000, "bronze": 50000 }, "dev": 28500 }
  ```
  Dovoli **več delov terena** (otoki, previsi) kot seznam črt. Validator (`validateTrack` → seznam napak v
  slovenščini) za vse proge in kasneje za urejevalnik.
- **Objekti (vsaj):** statični zaboj/blok, **dinamični zaboj**, **hlod** (kotali se), **gugalnica** (zglob), **most,
  ki se podre** (deske z zglobi, ki se po obremenitvi zlomijo), **eksplozivni sod** (impulz, ob trku z voznikom = padec),
  **dvigalo/premična ploščad** (kinematično, po poti in času — determinizem iz časa proge), **kontrolna točka** (zastavica),
  **cilj**, **led** (nizko trenje kot površina dela terena), **tekoči trak** (površinska hitrost).
- **Vsaj 10 prog v dveh sklopih** (lahke 1–5, srednje 6–10), vsaka 25–70 s za dobrega voznika. Teme:
  **kamnolom**, **gozd s hlodi**, **gradbišče** (žerjav, cevi, palete), **aluminijasta tovarna** (crossover s pinballom:
  valjarna z vročimi ploščami kot dekor, tekoči trakovi, žerjav z zabojem, profili), **zimska** (led), **nočna z neonom**.
  Vsaka tema ima vsaj eno progo.
- **Generator/preverjanje** `tools/motorist-tracks.mjs` (po vzoru `tools/krogla-levels.mjs`): iz opisa odsekov (npr.
  `ravno 20, stopnica 1, hlod, skakalnica 2,5 …`) zgradi JSON, preveri z validatorjem in z **botom** (glej spodaj)
  izmeri čas; iz njega izračuna medalje z **eno izvoženo funkcijo** (npr. `rules.js` → `medalsFromDev(devMs)`;
  zlato ≈ 1,05 × dev, srebro ≈ 1,3 ×, bron ≈ 1,7 × — uglasi). Rezultat preverjanja zapiši v `PROGRESS.md`.
- **Bot/autopilot za preverjanje** (`autopilot.js`): preprost krmilnik (plin, ko je šasija ravna; nagib proti
  ciljnemu kotu iz naklona terena pred kolesi; zavora pred prepadom) ali **posnetek vnosov**, ki ga posnameš sam v
  brskalniku (`?record=1` → izvoz vnosov kot `route` v JSON proge) in ga orodje predvaja v Node. Proga, ki je bot/posnetek
  ne prevozi, ne gre v igro. (Ker Planck v Node teče enako kot v brskalniku, je posnetek vnosov tu zanesljiv; za ghoste
  med napravami pa ne — glej Ghost.)

### Točkovanje in medalje
- **Napaka** = padec (vrnitev na kontrolno točko). Čas teče naprej tudi med padcem in vrnitvijo.
- **Rezultat za lestvico** = čas + **5 s na napako** (konstanta v `rules.js`). Povzetek po progi:
  »Padci: 3 · Čas 1:12,40 · Srebro«.
- **Medalje:** zlato = **0 napak** in čas ≤ zlati; srebro = ≤ 2 napaki in čas ≤ srebrni; bron = cilj in čas ≤ bronasti;
  sicer »Končano«. Natančne meje v `rules.js` s testi.
- Lestvica **po progi** (`hub.submitScore(rezultat, { seed: 'track:<id>' })` ali kot to dela Krogla za posamezno progo —
  preberi `games/krogla/game.js` in uporabi enak pristop). Skupna lestvica sklopa: vsota najboljših rezultatov
  (le, če so prevožene vse proge sklopa).
- **Odklepanje:** sklop 2 se odklene z vsaj bronom na 4 progah sklopa 1. Napredek v `shared/storage.js`.

### Ghost
- Snema se kot **položaji** (šasija x, y, kot; kolesi kot; voznik: nekaj ključnih kotov ali položajev za izris),
  ne kot vnosi — Box2D se med napravami lahko rahlo razide. Uporabi `../krogla/ghost.js` (`Recorder`, `encode`,
  `decode`, `sampleAt`) neposredno ali z razširitvijo kanalov v svojem modulu (Krogle ne spreminjaj).
- **Moj rekord** (lokalno) in **rekord prijatelja/najboljši na lestvici** iz Supabase: tabela `motorist_ghosts`
  v `supabase/games/motorist.sql` po vzoru `krogla_ghosts` (en ghost na igralca in progo, pisanje samo prek RPC
  `motorist_save_ghost` le ob boljšem rezultatu, omejena velikost, `motorist_tracks` z zlatimi časi za zavrnitev
  nemogočih časov; RLS, `security definer` v `private`, ovojnica `security invoker` v `public`). Offline: le lokalni ghost.
- Ghost je prosojen motor z voznikom, v meniju proge izbira »brez / moj / najboljši«.

### Grafika 2,5D in kamera
- Fizika je 2D (x, y), izris 3D s **Three.js 0.160.0** (ista pripeta verzija in import map kot Krogla).
- Uporabi `../krogla/render/sky.js`, `textures.js`, `materials.js`, `post.js` in `detectQuality`/`QUALITY` iz
  `../krogla/render.js` (samodejna kakovost, padec kakovosti pri nizkem FPS). Če kak modul zahteva Kroglino progo,
  uporabi le neodvisne dele in to zapiši.
- **Teren:** ekstrudiran profil (globina ~6 m) s teksturo glede na temo, sprednji rob poudarjen, za progo 2–3 plasti
  ozadja z globino (paralaksa: skale, drevesa, hale, žerjavi, gore, mestne luči ponoči), pred progo redek dekor.
- **Motor in voznik:** lastni nizkopoligonski modeli iz Three.js primitivov (brez zunanjih modelov): okvir, rezervoar,
  kolesa z naperami/vzorcem gume, vzmeti, ki se vidno stiskajo, voznik s čelado in dresom (barve iz konfiguracije —
  kasneje iz trgovine). Ragdoll se izriše iz teles fizike.
- **Kamera** s strani, rahlo pred motorjem v smeri vožnje, gladko sledi; pri skokih/hitrosti se **oddalji**, pri
  počasnem plezanju približa. Rahel tresljaj ob trdem pristanku (izklopljivo, spoštuj `prefers-reduced-motion`).
- **Učinki:** prah/iskre ob kolesih, sneg na zimski, iskre ob drgnjenju kovine, eksplozija soda, zastavica kontrolne
  točke se dvigne, konfeti ob cilju.
- HUD: čas, napake, kontrolne točke (x/y), razlika do ghosta ob kontrolni točki (zeleno/rdeče), hitrost (neobvezno).

### Kontrole
- **Tipkovnica:** ↑/W plin, ↓/S zavora, ←/A nagib nazaj, →/D nagib naprej, `R` vrnitev na kontrolno točko
  (šteje kot napaka), `Backspace`/`Enter` ponovni začetek proge, `Esc`/`P` pavza (tudi samodejno, ko zavihek ni viden).
- **Telefon (375×812, tudi ležeče):** levi palec dve veliki tipki nagiba (nazaj/naprej), desni palec plin (velik) in
  zavora; večdotik mora delovati (nagib + plin hkrati). Neobvezno: **nagib telefona** za nagib (vklop v nastavitvah,
  `DeviceOrientationEvent` z dovoljenjem na iOS). `touch-action: none` na igralni površini, brez hover-only.
- Igralni pad (Gamepad API) je dobrodošel, ni obvezen.
- Prva vožnja na napravi: kratki namigi na zaslonu (»Nagni se nazaj za skok na stopnico«).

### Zvok
- Lastna sinteza (Web Audio) po vzoru `../rusilec/sound.js` / `../krogla/audio.js`: motor (frekvenca iz vrtljajev,
  dva oscilatorja + šum), pristanek, drgnjenje, padec, eksplozija, kontrolna točka, cilj. Izklop zvoka v nastavitvah.

### Hub, XP, dosežki, naloge
- `hub.init({ gameId: 'motorist', scoreOrder: 'asc' })`, `ui.header({ title: 'Motorist' })`.
- Po vsaki prevoženi progi: `hub.submitScore`, `hub.reportGame({ won: medalja ≥ bron, players: 1, score, daily: false })`,
  `hub.awardXp` (npr. 10 za progo, +5 bron/+10 srebro/+20 zlato, največ 60 na progo na dan — preveri omejitve RPC).
- **Dosežki (vsaj 6):** `prva-proga` (cilj na prvi progi), `brez-padca` (proga sklopa 2 brez napake), `zlati-sklop`
  (zlato na vseh progah sklopa 1), `salto` (poln obrat v zraku in pristanek na kolesih), `wheelie` (5 s na zadnjem kolesu),
  `ragdoll` (10 padcev v eni vožnji — za šalo), `tovarna` (zlato na aluminijasti tovarni).
- **Naloge** v `games.json` (`quests`): e »Prevozi progo v Motoristu« (`play:motorist`), m »Prevozi progo brez padca«
  (`motorist:brez-padca`, target 1), h »Osvoji zlato medaljo« (`motorist:zlato`, target 1), w »Prevozi 15 prog ta teden«
  (`motorist:proga`, target 15). Dogodke sporoči s `hub.reportEvent`.

### Moduli (predlog)
`index.html`, `game.js` (UI, meni, zanka), `config.js` (privzeti parametri fizike), `physics.js` (gradnja sveta iz proge
in motorja, korak, padec, kontrolne točke — brez DOM-a), `bike.js` (motor in voznik, ragdoll), `track.js` (loader,
validator, površine), `objects.js` (zaboji, hlodi, gugalnice, mostovi, sodi, dvigala), `rules.js` (čas, napake, medalje,
odklepanje), `ghost.js` (kanali nad `../krogla/ghost.js`), `autopilot.js`, `input.js` (tipkovnica, dotik, nagib, pad),
`view.js` (Three.js), `debug.js`, `sound.js`, `tracks/*.json`, `README.md`.

### Testi (`tests/motorist.js`, vključi v `tests/run-node.mjs` in `tests.html`)
- `rules.js`: kazen napak, meje medalj, odklepanje sklopa, skupni rezultat sklopa.
- Validator: vse proge v `tracks/` so veljavne, napačna proga vrne smiselne napake.
- Fizika: `physics.js` naj knjižnico dobi **vbrizgano** (`createWorld(track, cfg, planck)`), da jo lahko poženeš
  v brskalniku (CDN) in v Node (dinamični `import()` istega CDN URL-ja, če Node to zmore; npm odvisnosti in lokalne
  kopije knjižnice v repoju **niso** dovoljene). Če Node knjižnice ne more naložiti, testi fizike tečejo le v
  `tests.html`, v Node pa čista logika — odloči in zapiši v README. Primeri: motor stoji na ravnem, z zavoro ne drsi
  po blagem klancu, dotik glave s tlemi sproži napako in vrnitev na zadnjo kontrolno točko, determinizem
  (isti vnosi → isti končni položaj).
- Ghost: encode/decode krog, `sampleAt` interpolacija kota čez ±π.
- Vsaka proga: posnetek vnosov/bot pride do cilja (v brskalniškem testu ali orodju).

### Ni del te naloge (prompta 33 in 34)
- Urejevalnik prog, skupnostne proge v Supabase, »proga tedna«, dnevna proga, še 10 prog (sklopa težke in ekstremne).
- Dirka do 10 prijateljev v živo, sezona, predmeti v trgovini (barva motorja, čelada, dres, sled).

### Prioritete, če zmanjkuje časa
1. Motor + vzmetenje + nagib + padec na Poligonu z drsniki (`?debug=1`) — **občutek vožnje**.
2. Format proge, validator, 3 proge, kontrolne točke, napake, medalje, končni zaslon.
3. 2,5D izris s temo, kamera, HUD, kontrole na telefonu.
4. Ghost (lokalni, nato Supabase), lestvice, `reportGame`, dosežki, naloge.
5. Ostale proge (do 10) z orodjem in preverjanjem, ragdoll polish, zvok, učinki.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in vključi na začetek prompta 33.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija `# Motorist (games/motorist/)`: načrt s
kljukicami, dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra.
4. `games/krogla/README.md`, `games/krogla/render.js`, `games/krogla/render/*.js`, `games/krogla/ghost.js`,
   `games/krogla/game.js` (lestvica po progi, ghosti iz Supabase), `supabase/games/krogla.sql`, `tools/krogla-levels.mjs`.
5. `games/skoki/README.md`, `games/skoki/debug.js`, `games/skoki/view.js` ali ustrezen modul (2,5D izris 2D fizike,
   stran z drsniki, determinizem).

### Tehnično
- Igra v `games/motorist/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'motorist', scoreOrder: 'asc' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani progi pokliči `hub.reportGame({ won, players, score, daily })`**. Posebne dogodke za naloge sporoči s
  `hub.reportEvent('motorist:<ime>', vrednost)`. Igralca prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- Lastne tabele: `supabase/games/motorist.sql` (idempotentno, RLS vklopljen, predpona `motorist_`). Če imaš Supabase
  MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati.
- Zunanje knjižnice le prek CDN z natančno pripeto verzijo (Three.js 0.160.0, Planck).
- Čisto logiko (pravila, validator, medalje, ghost kanali) daj v ločene module brez DOM-a in dodaj teste.
- Telefon (portret in ležeče, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v Krogli in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi, nespremenjeni).
4. Prevozi Poligon in vsaj 3 proge ročno v brskalniku (tudi padec, vrnitev, cilj, ghost); z orodjem preveri vse proge.
5. Izgled na **telefonu (375×812, portret in ležeče)** in **namizju**: posnemi zaslone, sam jih preglej in popravi.
   Preveri, da večdotik (nagib + plin) dela.
6. V `games.json` posodobi vnos `motorist` (opis, oznake, `scoreOrder`, naloge) in ga preklopi v **`live`**
   (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md`, napiši `games/motorist/README.md` (kontrole, fizika in parametri, format proge, objekti,
   točkovanje, kako dodati progo, verzija Planck), posodobi korenski `README.md` (seznam iger, struktura) in
   **stanje prompta**: vrstica na vrhu → ✅ s commitom, vrstica v `prompts/README.md`, oznaka pri točki 6 v `PREDLOGI-IGER.md`.
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu: posodobi naslednja prompta
Prompta **`prompts/33-motorist-urejevalnik.md`** in **`prompts/34-motorist-dirka.md`** sta že napisana na podlagi
načrta. Ko je ta del narejen, ju **posodobi** z vsemi spoznanji iz implementacije: dejanska imena modulov in funkcij,
končni format proge, kako teče Planck (Node/brskalnik), kaj ni bilo narejeno (to gre na začetek 33), morebitne spremembe
predpogojev. Commitaj ju skupaj z igro ali v ločenem commitu in ju omeni v končnem odgovoru.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu,
kaj je bilo posodobljeno v promptih 33/34 in kaj ni bilo preverjeno.
