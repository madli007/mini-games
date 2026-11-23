# Prompt: Tarče (aim trainer)

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 01 je narejen)

> V novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši:
> **»Preberi prompts/27-tarce.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »16. Tarče (aim trainer)«. Vnosa v `games.json` še ni (dodaj ga).

---

## Igra

- **Ime:** Tarče
- **id / mapa:** `tarce` → `games/tarce/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Klikaj krčeče se tarče, rdečih ne smeš! 30 tarč na rundo, dnevni izziv za vse ali strelski dvoboj do 10 igralcev.«
- **Način:** `realtime`
- **Število igralcev:** 1–10 (solo in dnevni izziv; multiplayer 2–10)
- **Oznake:** `hitrost`, `daily`, `party`, `rekordi`
- **Ikona / barva:** 🎯 · `#ff4d6d`
- **Rezultat:** **povprečni čas na tarčo v ms** (s kaznimi). **Manj je bolje** (`scoreOrder: 'asc'`,
  `scoreUnit: 'ms'`). Na lestvico gre **dnevni izziv**; prosta igra ima osebni rekord, multiplayer šteje za XP,
  kovance, dosežke in naloge.

Igra je navdihnjena z žanrom »aim trainerjev«, ni pa kopija nobenega obstoječega: ime, videz tarč, zvoki in
napisi so naši. Ne posnemaj znanih spletnih aim trainerjev (njihovih imen, barvnih shem, razporeditve zaslona
ali zvokov).

### Občutek in stil (pomembno!)
Igra mora delovati **ostro in zadovoljujoče**, ne kot krogi na belem ozadju. Torej:
- **Strelišče**: temno igralno polje z rahlo mrežo ali radarskim vzorcem, tarče kot koncentrični krogi (zunanji
  obroč, notranji obroč, sredina) v barvi igre `#ff4d6d` / beli. Izhajaj iz `shared/ui.css`.
- **Krčenje**: tarča se pojavi s kratkim »pop« (scale 0 → 1 v ~80 ms), nato se **linearno krči** do nič v času
  življenja (privzeto 1200 ms). Okoli tarče tanek obroč, ki kaže preostali čas (kot števec).
- **Zadetek**: tarča se razleti v delce (canvas ali CSS, ~10 delcev), na mestu se izpiše čas (npr. »312 ms«),
  kratek »tik« zvok. **Zadetek v sredino** (notranjih ~30 % polmera) da »Bullseye!« z zlatim bliskom in
  bonusom (glej točkovanje).
- **Zgrešeno**: na mestu klika majhen križec in kratek mrk zvok; ob pobegli tarči (pretekel čas) tarča
  »ugasne« in v kotu se izpiše `+kazen`.
- **Rdeča tarča (past)**: jasno drugačna: rdeča z **ikono ✕ ali prečrtanim krogom** (ne samo barva, zaradi
  barvno slepih) in rahlo utripa. Če jo klikneš: zaslon rdeče blisne, rahel screen shake, `navigator.vibrate`
  (v `try/catch`), velik napis kazni. Če jo pustiš pri miru, se tiho umakne in dobiš majhno pohvalo »✓ Mirna roka«.
- **Zvok**: WebAudio sinteza (brez zvočnih datotek): zadetek, bullseye, zgrešeno, past, konec runde.
  Višina tona zadetka rahlo raste z nizom zaporednih zadetkov (combo). Gumb za utišanje, nastavitev zapomni prek
  `shared/storage.js`.
- **HUD**: zgoraj števec `17 / 30`, trenutno povprečje in niz (combo). Med igro ne prikazuj nič, kar bi motilo
  polje; HUD naj bo tanek in pol-prozoren.
- **Kurzor**: na namizju po meri narisan križ (crosshair) prek CSS `cursor`, na telefonu brez.
- **Komentator**: kratki slovenski napisi ob mejnikih, npr. »Deset zapored, kirurška natančnost!«,
  »Rdeča je rdeča, prijatelj.«, »Pod 300 ms? Si sploh človek?« Vsaj ~15 variant.
- Vse animacije spoštujejo `prefers-reduced-motion` (brez shakea in delcev, samo sprememba barve/prosojnosti).

### Načini
1. **Prosta igra** (solo): runda 30 tarč z izbrano težavnostjo (Lahko / Srednje / Težko: velikost tarče,
   čas življenja, delež pasti). Osebni rekord po težavnosti; na koncu gumb »Še enkrat«.
2. **Dnevni izziv** (solo): `hub.dailySeed` + `hub.rng` določita **celotno rundo dneva**: položaje (v
   normaliziranih koordinatah 0–1), čase pojava, velikosti, katere tarče so pasti, in **modifikator dneva**,
   enak za vse. Prvi poskus dneva šteje za lestvico (`hub.submitScore`), ostali so vaja. Modifikatorji
   (pripravi vsaj 6):
   - *Mikro*: tarče so pol manjše;
   - *Begunci*: tarče se med krčenjem počasi premikajo;
   - *Minsko polje*: 30 % tarč je pasti (namesto ~15 %);
   - *Dvojčka*: tarče prihajajo v parih, obe moraš zadeti;
   - *Tema*: tarče so vidne le kratek čas po pojavu, nato samo obris;
   - *Turbo*: krajši čas življenja, hitrejši ritem;
   - *Brez modifikatorja*.
3. **Strelski dvoboj** (multiplayer 2–10): vsi na svojih napravah dobijo **isto rundo** (host izbere seed in
   težavnost), igrajo **hkrati** vsak na svojem zaslonu. V vrstici igralcev se v živo vidi, kje je kdo
   (`17/30`, trenutno povprečje). Zmaga najnižji končni rezultat.
4. **Lov na tarčo** (multiplayer 2–10, party): **ena skupna tarča naenkrat**, ki se pojavi na istem mestu pri
   vseh; točko dobi **prvi**, ki jo zadene (po hostovi uri, glej spodaj). Pasti: kdor klikne rdečo, izgubi
   točko. 30 tarč, zmaga največ točk. Najbolj zabavno s TV pogledom.

### Pravila in točkovanje
- **Runda**: 30 dobrih tarč (pasti se ne štejejo v 30). Naenkrat je na polju 1 tarča (Lahko/Srednje) ali do 2
  (Težko, modifikator *Dvojčka*). Naslednja se pojavi 200–600 ms po prejšnji (iz seeda).
- **Čas tarče** = od pojava do zadetka v ms.
- **Kazni** (prištejejo se skupnemu času, nato se deli s 30):
  - zgrešen klik v prazno: **+150 ms**;
  - pobegla tarča (se skrči do nič): **+1000 ms** (šteje kot čas življenja + kazen);
  - klik na rdečo past: **+750 ms** in prekine niz.
- **Bullseye** (zadetek v notranjih 30 % polmera **ob zadetku**, ne ob pojavu): **−50 ms** od časa te tarče
  (časa ne more spustiti pod 100 ms).
- **Rezultat** = `round((vsota časov + kazni − bonusi) / 30)`. Prikaži tudi natančnost (%), število bullseyev,
  število ujetih pasti in najdaljši niz.
- **Zaznava zadetka** na `pointerdown` (ne `click`), z razdaljo od središča glede na **trenutni** polmer.
  Uporabi `performance.now()`. Prvi dotik po pojavu nad več tarčami zadene najbližjo.
- **Igralno polje** ima fiksno razmerje (npr. 4:3 na namizju, 3:4 na telefonu); koordinate iz seeda so
  normalizirane, polmeri v deležu krajše stranice, tako da je dnevni izziv enako težak na vseh napravah.
  Tarča se nikoli ne pojavi pod HUD-om ali preblizu roba.
- **Generator**: ne več kot 2 pasti zapored; prva tarča runde ni nikoli past; tarča se ne pojavi preblizu
  prejšnje (minimalna razdalja), da ni »zastonj« zadetkov.
- **Odštevanje** 3-2-1 (`ui.countdown`) pred rundo; **pavza** v solo (tipka `Esc` ali gumb), ki rundo
  razveljavi za lestvico in rekord (na lestvico gre samo neprekinjena runda).
- Ob izgubi fokusa okna (zavihek v ozadju) se solo runda samodejno ustavi.

### Multiplayer
- Host vodi igro: izbere način, težavnost in seed, začne rundo (skupni začetni čas), zbira rezultate.
- **Strelski dvoboj**: vsak klient sam izračuna svoj rezultat (»na časten način«) in hostu sproti pošilja
  `{ i, ms, avg, misses }` prek `room.send` (za vrstico napredka), na koncu `{ final, stats }`. Host razglasi
  razvrstitev, ko vsi končajo ali po časovni omejitvi (npr. 60 s).
- **Lov na tarčo**: host oddaja tarče (`{ id, x, y, r, trap, t0 }`); klienti ob zadetku pošljejo
  `{ id, dtLocal }` (čas od prikaza pri sebi, s tem se izravna zakasnitev omrežja). Zmaga najnižji `dtLocal`,
  ki prispe v oknu 300 ms po prvem prejetem zadetku; host razglasi zmagovalca tarče in vsem pošlje
  naslednjo. Zadeto tarčo vsi vidijo, kdo jo je dobil (`ui.who(p)` ob eksploziji).
- Na vrhu zaslona vrstica igralcev z `ui.who(p)` / `ui.avatar(p)`: napredek ali točke, kdo je končal (kljukica).
- **Prenos hosta**: `room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja (seed, indeks
  tarče, rezultati). **Ponovna povezava**: osvežitev → `joinRoom(hub.roomFromUrl())` → sinhronizacija; v
  dvoboju igralec nadaljuje od tarče, kjer je bil (zamujeni čas se ne šteje, a runda ne gre na osebni rekord),
  v lovu se priključi pri naslednji tarči.
- **TV pogled** (neobvezen, `?tv=1` ali gumb v lobbyju): v lovu velika skupna tarča in lestvica točk; v dvoboju
  napredek vseh kot vzporedni trakovi.
- **Revanša**: gumb na koncu ustvari novo rundo v isti sobi z istimi nastavitvami in novim seedom.

### Konec igre in povzetek
`ui.results` dopolni s **povzetkom**: povprečje, natančnost, bullseyi, pasti, najdaljši niz, najhitrejša in
najpočasnejša tarča ter **mini graf** časov po tarčah (30 stolpcev, pasti označene) in **toplotna karta**
zadetkov na polju (kje si najhitrejši). V multiplayerju **nagrade**: *Ostrostrelec* (največ bullseyev),
*Mirna roka* (nobene ujete pasti), *Prehitri prst* (največ ujetih pasti), *Strela* (najhitrejša posamezna tarča).

### Postavitev zaslona
- **Telefon (portret, 375 px)**: polje zavzame skoraj ves zaslon, HUD v eni vrstici zgoraj, tarče dovolj velike
  za palec (najmanjši polmer na telefonu ne pod ~18 px tudi pri *Mikro*). `touch-action: none` na polju, brez
  zooma in scrolla med igro.
- **Namizje**: polje na sredini, ob strani lestvica / igralci, crosshair kurzor.

### Dosežki (vsaj 8)
- `prvi-strel`: Prvi strel — odigraj rundo do konca
- `pod-500`: Hitra roka — povprečje pod 500 ms (Srednje ali težje)
- `pod-400`: Ostro oko — povprečje pod 400 ms (Srednje ali težje)
- `pod-320`: Nečloveški refleksi — povprečje pod 320 ms (Srednje ali težje)
- `brez-napake`: Čista runda — 30 zadetkov, nič zgrešenih, nič pasti
- `bullseye-10`: Ostrostrelec — 10 bullseyev v eni rundi
- `mirna-roka`: Mirna roka — runda z vsaj 5 pastmi, nobena ni kliknjena
- `niz-30`: Ves šaržer — niz 30 zapored
- `dvoboj`: Najhitrejši na divjem zahodu — zmagaj strelski dvoboj z vsaj 4 igralci
- `vztrajen`: Vztrajen strelec — dnevni izziv odigraj 7 dni zapored

### XP
15 za odigrano rundo, +10 za Težko, +15 za dnevni izziv, +1 za vsak bullseye (največ +20), +40 za zmago v
multiplayerju.

### Naloge (`quests` v `games.json`)
Preden jih napišeš, preberi `shared/quests.js` in preveri, kako se seštevajo `target`/`goal` in `cmp` ter
kakšen je regex za id. Predlog:
- `e` »Odigraj rundo Tarč« → `play:tarce`, target 1
- `e` »V Tarčah zadeni 5 bullseyev« → `tarce:bullseye`, target 5
- `m` »V Tarčah doseži povprečje pod 450 ms« → `tarce:avg`, cmp `lte`, goal 450
- `m` »Odigraj dnevne Tarče« → `daily:tarce`, target 1
- `h` »V Tarčah doseži povprečje pod 380 ms« → `tarce:avg`, cmp `lte`, goal 380
- `h` »Zmagaj strelski dvoboj ali lov na tarčo« → `tarce:mp-win`, target 1
- `w` »Zadeni skupaj 100 tarč ta teden« → `tarce:hits`, target 100 (shema dovoli največ 100)
- `w` »V Tarčah odigraj 3 runde brez ujete pasti« → `tarce:clean`, target 3

(Če `shared/quests.js` ne podpira `cmp: 'lte'`, ga dodaj s testom ali nalogo preoblikuj v `gte` nad
»hitrostjo«, npr. `1000 − avg`. Odločitev zapiši v `PROGRESS.md`.)

### Prioritete, če zmanjkuje časa
Najprej mora biti brezhibno: generator runde iz seeda in točkovanje (`logic.js` s testi) → Prosta igra z
zvokom, animacijami in pastmi → dnevni izziv z modifikatorji → strelski dvoboj → lov na tarčo → TV pogled.
Zvok in juice nista »na koncu«, brez njiju igra nima smisla. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Tarče«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta; tudi `asc` rezultat v ms).
4. `games/zaporedje/` — podoben vzorec: dnevni modifikatorji, WebAudio zvok, dvoboj z istim seedom.

### Tehnično
- Igra v `games/tarce/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'tarce', scoreOrder: 'asc' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge) — v solo in v multiplayerju, enkrat na igralca. Posebne dogodke za naloge sporoči s
  `hub.reportEvent('tarce:<ime>', vrednost)`; igra v `games.json` doda svoje predloge nalog (`quests`).
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p z `equipped`, npr. iz `room.players`), da se vidi kozmetika.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja) in **ponovno povezavo**
  (osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo stanja od hosta).
- Lastne tabele niso potrebne. Če jih vseeno dodaš: `supabase/games/tarce.sql` (idempotentno, RLS vklopljen),
  poženi kot migracijo, če imaš Supabase MCP, in preveri `get_advisors`; sicer zapiši v `PROGRESS.md`, kaj pognati.
- Čisto logiko (generator runde iz seeda z modifikatorji, pravila generatorja, zaznava zadetka glede na trenutni
  polmer, bullseye, kazni, izračun rezultata, razsodba »prvi zadel« v lovu z `dtLocal`) daj v ločen modul
  (npr. `logic.js`) in dodaj teste v `tests/tests.js`: ista runda za isti seed, različna za različen seed,
  prva tarča ni past, največ 2 pasti zapored, minimalna razdalja med tarčami, zadetek/zgrešek na robu krčeče se
  tarče, pravilen izračun s kaznimi in bonusi (spodnja meja 100 ms), razsodba lova ob skoraj hkratnih zadetkih.
- Telefon (portret, 375 px) in namizje; party igre: host na TV-ju, ostali na telefonih.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Odigraj celo prosto rundo in dnevni izziv (z `?debug=1` lahko samodejni strelec za hiter test do konca).
5. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj do konca (dvoboj in lov s 3), odhod hosta sredi igre, osvežitev strani igralca.
6. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
7. V `games.json` dodaj vnos `tarce` s statusom **`live`**, `scoreOrder: "asc"`, `scoreUnit: "ms"` in `quests`
   (test sheme mora uspeti).
8. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno) in **stanje prompta**: vrstica na vrhu
   prompta → ✅ s commitom, vrstica v `prompts/README.md`, oznaka pri točki 16 v `PREDLOGI-IGER.md`.
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
