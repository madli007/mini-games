# Prompt za AI agenta: Lane wars skozi dobe (nova igra)

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 01 je narejen)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/26-lane-wars.md in ga v celoti izvedi.«**
>
> Ozadje: točka 3 v `PREDLOGI-IGER.md` (»Lane wars skozi dobe«), vnos `lane-wars` v `games.json` je zdaj `soon`.
> Žanr: dve bazi na koncih ene steze, igralca pošiljata enote, ki same korakajo in se bijejo, z izkušnjami pa
> napredujeta skozi dobe. **Ime, enote, grafika, zvok in posebne sposobnosti so naši** — ne posnemaj nobene
> obstoječe igre (imena, videz enot, napisi, vrstni red enot, zvoki).

---

## Igra

- **Ime:** Lane wars skozi dobe
- **id / mapa:** `lane-wars` → `games/lane-wars/`
- **Kratek opis:** »Pošiljaj enote po stezi, gradi stolpe in napreduj od kamene dobe do vesolja. Proti AI, dnevni izziv ali 1v1.«
- **Način:** `realtime` · **Igralci:** 1–2 (+ neobvezno gledalci) · **Oznake:** `strategija`, `daily`, `akcija`
- **Rezultat:** točke dnevnega izziva (več je bolje, `desc`, enota `točk`).

### Osnovna pravila
- Vodoravna steza (na telefonu v portretu **navpična**: moja baza spodaj, nasprotnik zgoraj — ista simulacija,
  le zasukan izris). Vsaka baza ima npr. 1000 HP; igra se konča, ko baza pade.
- **Zlato:** majhen pasivni dohodek + nagrada za vsako ubito nasprotno enoto (odvisno od njene cene).
  **Izkušnje (XP v igri, ne hub XP):** za ubijanje in za škodo bazi.
- **Enote:** v vsaki dobi 3 enote + 1 elitna (dražja, počasnejša proizvodnja). Vsaka ima ceno, čas izdelave, HP,
  škodo, doseg, hitrost, hitrost napada in **razred**: `pehota`, `strelec`, `oklep`. Preprosti protiukrepi
  (npr. strelec ×1,25 proti pehoti, pehota ×1,25 proti oklepu, oklep ×1,25 proti strelcu) — tabela v enem modulu.
- **Vrsta proizvodnje:** do 5 enot v vrsti, ena se dela naenkrat; enota pride iz baze, ko je pripravljena.
  Enote se ustavijo ob prvi nasprotni enoti/bazi v dosegu; prijateljske se ne prerivajo skozi sprednje
  (čakajo v koloni). Omejitev npr. 20 živih enot na stran (zmogljivost).
- **Stolpi:** 3 mesta na bazi (2 odklenjeni na začetku, 3. za zlato). Na vsako mesto 1 stolp iz trenutne dobe
  (2 vrsti na dobo: hiter/šibek in počasen/močan z učinkom območja). Prodaja vrne 50 %.
- **Dobe (5):** Kamena doba → Srednji vek → Doba smodnika → Moderna doba → Vesolje. Napredovanje stane XP
  (naraščajoče pragove). Ob napredovanju: nove enote in stolpi, baza dobi nov videz in +HP, stare enote na stezi
  ostanejo. Enota iz višje dobe dobi majhen bonus proti nižji (npr. +10 % na razliko dobe), da je napredovanje
  vredno, a ne odloča samo.
- **Posebna sposobnost** (ena na dobo, dolg odmor, npr. 60 s), naše ideje: Kamena — **čreda** (živali zdrvijo
  po stezi), Srednji vek — **vrelo olje** (škoda pred lastno bazo), Smodnik — **topovska salva** (3 udarci po
  stezi), Moderna — **topniški napad** z dimno zaveso, Vesolje — **orbitalni žarek** (počasi drsi po stezi).
- Predlog imen enot (lahko spremeniš, ostani izviren): Kamena: kijaš, pračar, metalec kopja, **mamutji jezdec**;
  Srednji vek: mečevalec, lokostrelec, kopjanik, **oklepni vitez**; Smodnik: mušketir, grenadir, sabljač,
  **poljski top**; Moderna: pešak, ostrostrelec, bazukaš, **tank**; Vesolje: droid, laserski strelec,
  plazma ščitnik, **mech**.
- Celotna igra traja 8–15 min proti srednjemu AI. Vse številke (cene, HP, pragovi) v **enem modulu**
  (`balance.js`) in stran z drsniki `?debug=1` za uravnoteženje (hitrost igre ×1/×2/×4, zlato, takojšnja doba).

### Načini
1. **Proti AI** — težavnosti Lahko / Srednje / Težko. AI uporablja **iste ukaze in pravila kot igralec** (brez
   goljufanja z zlatom ali informacijami; Težko sme le hitreje reagirati in bolje izbirati protiukrepe).
   AI: ekonomija (kdaj varčevati za dobo), odziv na nasprotnikove enote (protiukrepi), obramba s stolpi,
   uporaba posebne sposobnosti, ko je na stezi dovolj nasprotnikov.
2. **Dnevni izziv** — `hub.dailySeed()` določi AI (osebnost: agresiven / ekonomist / stolpar), modifikator dneva
   (npr. »dvojno zlato za uboje«, »stolpi so dražji«, »začneš v srednjem veku«) in časovno omejitev. Šteje
   **prvi poskus** za lestvico (`hub.submitScore`), naslednji so vadba. Točke: zmaga + preostali HP baze +
   bonus za hitrost + doseženo dobo; poraz da delne točke (škoda bazi, doba). Formula v `logic` modulu + testi.
3. **1v1 online** — soba prek `hub.createRoom` / `ui.lobby` (koda, `?room=`). Gledalci (do 8) lahko spremljajo
   (TV pogled), a ne igrajo.

### Multiplayer: lockstep (pošiljajo se samo ukazi)
- Simulacija je **deterministična**: fiksen korak (npr. 20 tickov/s), samo celoštevilska/fiksna aritmetika ali
  skrbno zaokroževanje (brez `Math.random`, brez odvisnosti od FPS), naključje le iz seeda igre.
- Ukazi: `train(unitId)`, `cancel(slot)`, `tower(slot, towerId)`, `sell(slot)`, `buySlot`, `evolve`, `special`.
  Ukaz se izvede na **ticku T + zamik** (npr. 6 tickov ≈ 300 ms), da ga drugi odjemalec prejme pravočasno.
- **Host je ura:** vsak tick (ali paket po npr. 2 tickih) pošlje potrditev s seznamom ukazov obeh igralcev za ta
  tick; gost simulira le do zadnjega potrjenega ticka (če zaostaja, malo pospeši; če čaka, pokaže »čakam na
  povezavo …«). Host preverja veljavnost ukazov (dovolj zlata ipd.) — neveljavni se zavržejo enako na obeh straneh.
- **Hash stanja** vsakih ~2 s; ob razhajanju host pošlje **posnetek stanja** (snapshot) in gost nadaljuje iz njega
  (zapiši v konzolo kot opozorilo; v testih mora do razhajanja priti 0-krat).
- **Ponovna povezava:** osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj snapshot + nadaljuj.
- **Prenos hosta** (`room.on('hostChanged')`): preostali igralec postane ura in nadaljuje iz zadnjega potrjenega
  ticka; igra je med tem na pavzi. Če se odsotni ne vrne v 30 s, zmaga preostali (predaja). Gumb **Predaj**.
- Pri gledalcih: dobivajo isti tok ukazov (ali redke snapshote) in samo izrisujejo.

### Postavitev zaslona in kontrole
- **Namizje:** steza vodoravno čez širino, spodaj vrstica: zlato, XP do naslednje dobe, gumbi enot (ikona, cena,
  bližnjica **1–4**), stolpi (**Q/W/E**), doba (**R**), posebna sposobnost (**Space**), vrsta proizvodnje s
  progresom. Kamera se premika po stezi (miška ob robu / A–D / vlečenje), mini-mapa steze na vrhu.
- **Telefon (375×812, portret):** steza navpično, kamera sledi fronti (tap na mini-mapo za skok), spodaj
  veliki gumbi (min. 48 px) v dveh vrsticah, `touch-action: manipulation`, brez hover-only. Info enote na dolg pritisk.
- Obvestila prek `ui.toast` (»Nasprotnik je napredoval v Srednji vek!«), konec z `ui.results`.

### Grafika in zvok
- **Canvas 2D**, brez zunanjih slik: enote in baze narisane proceduralno (oblike, barve dobe, preprosta animacija
  hoje in napada — 2–4 sličice ali »squash & stretch«), številke škode, delci (prah, iskre, eksplozije), tresenje
  kamere pri posebnih sposobnostih. Ozadje s paralakso po dobah (jame in ognji → grad → polja s topovi → mesto →
  vesoljska postaja). Vsaka doba svoja paleta.
- Pri 2×20 enotah + delcih tekoče 60 FPS na namizju in ≥ 40 FPS na telefonu (izmeri in zapiši v `PROGRESS.md`).
- Zvok z **WebAudio sintezo** (udarci, streli, eksplozije, fanfara ob novi dobi), gumb za utišanje (shrani v storage).

### Hub
- **Dosežki (vsaj 6):** `prva-zmaga` (premagaj AI), `vesolje` (doseži dobo Vesolje), `tezko` (premagaj AI na Težko),
  `brez-stolpov` (zmagaj brez enega stolpa), `zgodnja-doba` (zmagaj, ne da bi zapustil prvi dve dobi),
  `1v1-zmaga` (zmagaj online), `nedotaknjen` (zmagaj z ≥ 90 % HP baze).
- **XP (`hub.awardXp`):** 20 za odigrano igro, +40 za zmago proti AI (×1/×1,5/×2 po težavnosti), +60 za zmago 1v1.
- `hub.reportGame({ won, players, score, daily })` po vsaki igri, za vsakega igralca enkrat (tudi v 1v1).
- `hub.reportEvent`: `lane-wars:win`, `lane-wars:age` (doseženo število dob), `lane-wars:kills`, `lane-wars:mp-win`.
- **Naloge** v `games.json`, npr. e: »Odigraj igro Lane wars«, m: »Ubij 50 enot v Lane wars«, h: »Doseži dobo
  Vesolje«, w: »Zmagaj 3 igre Lane wars ta teden«.

### Moduli (predlog)
`balance.js` (vse številke), `sim.js` (čista deterministična simulacija: stanje, `step(state, commands)`, boj,
ekonomija, dobe, sposobnosti — **brez DOM-a**), `commands.js` (validacija ukazov), `ai.js` (AI kot generator
ukazov), `daily.js` (seed → AI + modifikator, točkovanje), `net.js` (lockstep, hash, snapshot, hostChanged),
`render.js` + `sprites.js` (canvas), `audio.js`, `ui-bar.js` (gumbi), `game.js` (vstop).

### Testi (`tests/lane-wars.js`, vključi v `tests/tests.js`)
- Determinizem: ista seed + isti ukazi → isti hash po 5000 tickih (dvakrat zaporedoma in s kloniranim stanjem).
- Boj: protiukrepi, doseg, ustavljanje kolone, stolpi, posebne sposobnosti, konec igre.
- Ekonomija: neveljaven ukaz (premalo zlata, polna vrsta, ni naslednje dobe) se zavrže.
- AI proti AI: 20 tihih iger Srednje proti Lahko → Srednje zmaga večino; nobena igra ne traja dlje od omejitve;
  izmeri ms na igro.
- Točkovanje dnevnega izziva in izbira AI/modifikatorja iz seeda.

### Kasneje (ne v tem promptu, zapiši v `PROGRESS.md`)
2v2 ali 3 steze, kozmetika v trgovini (barve baze, zastave), turnir, ponovitve (replay iz ukazov je že skoraj zastonj).

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Lane wars«: načrt s kljukicami,
dnevnik, meritve, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta).
4. `games/rusilec/` — realtime igra s hostom (kako se tam pošilja stanje in rešuje `hostChanged`).

### Tehnično
- Igra v `games/lane-wars/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'lane-wars' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** — v solo in v multiplayerju,
  enkrat na igralca. Posebne dogodke za naloge sporoči s `hub.reportEvent('lane-wars:<ime>', vrednost)`.
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)`, da se vidi kozmetika.
- Multiplayer: realtime prek `room.send` (ne pišemo v bazo za vsak tick). Podpri **prenos hosta** in **ponovno
  povezavo** (opisano zgoraj).
- Lastne tabele niso potrebne. Če jih vseeno dodaš: `supabase/games/lane-wars.sql` (idempotentno, RLS vklopljen),
  poženi kot migracijo, če imaš Supabase MCP, in preveri `get_advisors`; sicer zapiši v `PROGRESS.md`, kaj pognati.
- Čisto logiko v ločene module brez DOM-a, testi v `tests/`.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku (vidno okno).
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Odigraj celo igro proti AI (vsaj do 3. dobe; z `?debug=1` hitrost ×4 do konca) in dnevni izziv.
5. Multiplayer v **offline načinu** (`?offline=1`) v 2 zavihkih (+ 1 gledalec): ustvari sobo, pridruži se s kodo in
   prek `?room=`, odigraj do konca, odhod hosta sredi igre, osvežitev strani gosta, **ni razhajanja hasha**.
6. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
7. V `games.json` spremeni vnos `lane-wars` iz `soon` v **`live`**, posodobi opis, `players`, oznake, `scoreOrder`,
   `scoreUnit` in dodaj `quests` (test sheme mora uspeti).
8. Posodobi `PROGRESS.md`, `games/lane-wars/README.md` (pravila, balans, lockstep protokol) in **stanje prompta**:
   vrstica na vrhu prompta → ✅ s commitom, vrstica v `prompts/README.md`, oznaka pri točki 3 v `PREDLOGI-IGER.md`.
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, rezultati AI-proti-AI, zmogljivost in kaj ni bilo preverjeno.
