# Prompt za AI agenta: Pinball motor (1/4 — miza kot modul, osnova za Božični pinball)

> **Stanje:** ⬜ čaka — lahko takoj (1. od 4 pinball promptov)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/22-pinball-motor.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »41. Druga miza in več igralcev v pinballu«. Serija promptov:
> **22 motor** (ta) → **23 Božična miza** (postavitev, streli, grafika, občutek) → **24 Božična pravila** (načini, multiballi,
> wizard, DMD, glasba) → **25 več igralcev** (izmenično na obeh mizah).
>
> Ta prompt **ne naredi nove mize**. Pripravi motor, da je druga miza samo nova mapa s podatki, pravili in grafiko,
> doda manjkajoče elemente, ki jih ima vsaka moderna miza, in orodja za uglaševanje občutka.
> **Alu Pinball mora po refaktorju igrati bit za bitom enako** (zlati test spodaj).

---

## Kakšno je stanje zdaj (preveri sam)
- `games/pinball/src/table.js` izvaža konstante (`RAMP`, `SCOOP`, `SPINNER`, `PLUNGER_Y`) in `buildTable()` z geometrijo,
  senzorji in lučmi. Uvažajo jih `physics.js` (`RAMP`), `rules.js` (913 vrstic, vsa pravila Alu mize) in
  `render/scene.js`, `render/art.js` (talna grafika z ročnimi koordinatami, peč, logotip).
- `config.js` meša splošno (fizika `BR`, `GRAV`, `STEP`, kakovost) in Alu (`CFG.imena`, `MODES`, `PAL`).
- `tests/tests.js` ima bota (`botGame(seed)`), ki z zamenjavo `Math.random` igra deterministično.
- Pinball v hubu je **kopija**; izvirnik je ločen repo `D:\Git\Brainstorm\pinball` — tega repoja **ne spreminjaj**.
- Lestvica Alu mize je tabela `public.scores` — **ne spreminjaj** (CLAUDE.md).

## 1. Zlati test (najprej, pred vsako spremembo)
- Dodaj test, ki odigra npr. 12 bot iger s fiksnimi semeni in zapiše **točke, trajanje in štetje dogodkov** ter hash
  zaporedja dogodkov (bus). Vrednosti zapiši v `tests/fixtures/pinball-golden.json`.
- Po refaktorju mora test dati **enake** vrednosti. Če se kje razide, je refaktor narobe (ne popravljaj pričakovanj).
  Edina dovoljena izjema: če fizikalni red operacij nujno spremeni rezultat, to utemelji v `PROGRESS.md` in pokaži,
  da je občutek enak (statistika 100 bot iger: povprečje točk, trajanja, multiballov znotraj ±3 %).

## 2. Miza kot modul
Ciljna struktura (imena lahko prilagodiš, smisel ne):
```
games/pinball/src/engine/      fizika, jedro igre, vhod, zvok, render, DMD — brez imen in koordinat Alu mize
games/pinball/src/tables/alu/  table.js (geometrija), rules.js (pravila), art.js (tla in dekor), config.js (imena, PAL, MODES, glasba)
games/pinball/src/main.js      izbere mizo (privzeto alu) in jo zažene
```
- **Jedro igre (`engine/game.js`)** prevzame vse, kar je enako na vsaki mizi: žogice, izstrelitev in plunger, flipperji,
  tilt z opozorili, ball save, drain, ball search, bonus ob koncu žogice in bonus X, multiball infrastruktura
  (več žogic, shranjevanje žogic, add-a-ball), točkovanje in popupi, sporočila na DMD (vrsta prioritet), svetlobni
  šovi, match na koncu, statistika, extra ball, konec igre.
- **Pravila mize (`tables/<id>/rules.js`)** so vtičnik z jasnim vmesnikom, npr.:
  `init(game)`, `onSwitch(name, data)`, `onShot(shotId, data)`, `onDrain()`, `onBallStart()`, `onBallEnd()`,
  `tick(dt)`, `lamps(state) → stanje luči`, `dmdIdle()`, `summary()`.
  **Strel (`shot`)** je pojem: miza poimenuje strele (npr. `levaRampa`, `orbitL`, `dimnik`) in senzorje, ki jih sprožijo;
  jedro skrbi za combo okno, štetje in zaporedja.
- **Miza (`tables/<id>/table.js`)** je podatek: geometrija, elementi, senzorji, luči, plasti, imena strelov, točke za
  kamero/glow, opcijsko JSON. Fizika in render **ne uvažata** več konstant Alu mize, vse dobita iz `T`.
- **Grafika**: `engine/render/*` riše elemente generično iz `T` (flipperji, bumperji, slingi, tarče, rampe, luči,
  žogice, delci). Posebnosti mize (peč, talina, logotip, tla) so v `tables/<id>/art.js` kot kljuke
  (`drawFloor`, `drawDecor`, `drawToys`, `emissive`), ki jih renderer pokliče.
- Prenesi tudi Alu `rules.js` v novo obliko (to je največji del). Ko je zlati test zelen, je to dokaz.

## 3. Manjkajoči elementi (generični, z izrisom in testi)
Druga miza bo potrebovala elemente, ki jih Alu nima. Dodaj jih v motor kot podatkovne tipe:
- **Več ramp** in **žičnate rampe** (wireform): pot žogice po krivulji v plasti 1/2, vstop, vrh, izhod na izbrani inlane
  ali flipper (feed). Rampa z **zavrnitvijo** (pre-šibek strel se vrne).
- **Tretji (zgornji) flipper** na poljubnem mestu z lastnim gumbom (privzeto isti kot desni).
- **VUK / kicker** (žogica pade v luknjo, po zamiku jo izstreli v izbrano smer ali po podzemni poti na drugo mesto)
  in **saucer/scoop** z nastavljivo smerjo izmeta.
- **Vidni lock** (žogice obstanejo v vrsti, npr. v vreči), sprostitev po eni ali vse.
- **Up-post / diverter** (dvižni stebriček ali preusmernik, ki ga krmilijo pravila).
- **Standup tarče** (posamične in banke) in **drop banke** poljubne dolžine z resetom.
- **Captive ball** (ujeta žogica v kanalu, ki jo zadeneš z drugo).
- **Magnet** (zgrabi, zadrži, vrže; za pravila in ball save).
- **Spinner** kot generičen element, **rollover kanali** z lane change (flipperja premikata luči).
- **Igrača**: generičen premičen objekt s trkalnikom in animacijo (npr. vrtljiva figura, ki jo pravila premaknejo),
  da jo miza lahko opiše v podatkih in nariše v `art.js`.

## 4. Orodja za občutek (to je ključ do »pravega« pinballa)
- **`?debug=1`**: prekrivni sloj s senzorji, segmenti, plastmi, imeni strelov, hitrostjo žogice, fps; tipka za
  postavitev žogice z miško in »zadrži« (pavza fizike, korak za korakom).
- **Drsniki** (`?debug=1`): naklon mize (gravitacija), moč in hitrost flipperja, elastičnost gume, trenje, moč slingov
  in bumperjev, ball save čas. Vrednosti shrani v `localStorage` za uglaševanje in jih izpiši kot JSON za `config.js`.
- **Merilec strelov** (`tools/pinball-shots.mjs` + `?debug=shots`): z vsakega flipperja (žogica pride iz inlana ali je v
  cradle) preleti čas udarca v korakih po 1 ms in zapiše, kateri strel žogica zadene, **širino okna** v ms (kako
  lahek je strel), **kam se žogica vrne** (feed: levi/desni flipper, pop bumperji, outlane, drain) in hitrost.
  Izpis je **mapa strelov** (tabela), ki jo prompt 23 uporabi za uglaševanje geometrije. Na Alu mizi ga poženi in
  rezultat zapiši v `games/pinball/README.md` (razdelek »Mapa strelov«).
- **Bot** iz testov naj postane modul, ki ga lahko uporabi katera koli miza (ime mize kot parameter), in poročilo
  statistike: povprečno trajanje igre in žogice, delež izgubljenih žogic v outlanih / po sredini, število strelov
  na minuto, multiballi, načini.

## 5. Izbira mize (pripravljeno za drugo)
- `main.js` naj sprejme `?miza=<id>` (privzeto `alu`); neznana miza → alu. Za zdaj obstaja samo `alu` in
  **testna miza** `tables/test/` (preprosta: 2 rampi, VUK, zgornji flipper, drop banka, standupi, captive ball, magnet,
  vse z minimalnimi pravili), da preveriš nove elemente v praksi. Testna miza se ne pokaže v hubu.
- Pripravi, da lahko druga igra v hubu uvozi motor: `games/<druga-igra>/` bo uvažala `../pinball/src/engine/...` in
  svojo mizo (tako kot Rušilec uvaža Kroglo). Zapiši kratek primer v `games/pinball/README.md`.

## Ni del te naloge
Božična miza (prompt 23 in 24), več igralcev (prompt 25), sprememba tabele `scores`, spremembe repoja `pinball`.

## Prioritete, če zmanjkuje časa
1. Zlati test. 2. Ločitev motor / Alu miza z zelenim zlatim testom. 3. `?debug=1` in merilec strelov.
4. Novi elementi in testna miza. Kar ostane, zapiši v `PROGRESS.md` in na začetek `prompts/23-pinball-bozic-miza.md`.

---

## Fiksni del

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Pinball motor«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md`, `shared/README.md`.
2. `games/pinball/README.md` in vso kodo v `games/pinball/src/` ter `games/pinball/tests/`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124).
2. `node games/pinball/tests/run-node.mjs` (vsi obstoječi testi + zlati test) in `node tests/run-node.mjs` uspešni.
3. Alu Pinball v brskalniku: odigraj vsaj eno igro z multiballom, konzola brez napak, kakovost Nizka in Ultra,
   telefon (375×812) in namizje, lestvica `scores` se še vedno bere.
4. Testna miza (`?miza=test`) z `?debug=1`: vsak nov element preizkušen, posnetki zaslona pregledani.
5. Posodobi `games/pinball/README.md` (struktura motorja, kako dodati mizo, mapa strelov Alu mize) in `PROGRESS.md`.
6. **Commit** na `main` z opisnim sporočilom v slovenščini. Ne pushaj.

### Na koncu
Popravi `prompts/23-pinball-bozic-miza.md`, da se ujema z dejanskimi imeni modulov, vmesnikom pravil in elementi
(npr. kako se v podatkih opiše rampa, VUK, igrača). Na vrh dodaj, kar iz tega prompta ni bilo narejeno.

V končnem odgovoru kratko povzemi: kaj je narejeno, kaj je pokazal zlati test, mapa strelov Alu mize,
kaj ni bilo preverjeno.
