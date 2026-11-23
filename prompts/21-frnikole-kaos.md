# Prompt za AI agenta: Dirka frnikol — »Kaos dirka« (čista 3D fizika, brez pogona)

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 16 je narejen)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/21-frnikole-kaos.md in ga v celoti izvedi.«**
>
> Ozadje: `games/frnikole/` (1. del, `prompts/16-frnikole.md`) ima »Dirkalni dan«, v katerem frnikole tečejo po
> progah Hrčkove krogle (mreža ploščic) in imajo majhen **pogon** proti točki naprej po poti (`race.js` → `physOf().drive`,
> krmiljenje po `path`). To je zanesljivo, a malo kaotično. Ta prompt doda **nov način »Kaos dirka«**: frnikole nimajo
> nobenega pogona ali krmiljenja — **premika jih samo gravitacija**, izid odločajo proga, trki in sreča (žanr »marble
> race«: lijaki, plinko polja, spirale, kolesa, dvigala, gneča). Vse ime, proge, grafika in zvok so naši — ne posnemaj
> nobene obstoječe oddaje, kanala ali igre (imena, videz prog, napisi).
>
> **Zdajšnji »Dirkalni dan« ostane nespremenjen** (njegovi testi zeleni brez sprememb pričakovanih vrednosti). Kaos je
> druga izbira v meniju igre in ima svojo lestvico. Preberi `games/frnikole/README.md` in sekcijo »Dirka frnikol« v
> `PROGRESS.md` (tudi, ali sta 2. in 3. del — `17-…`, `18-…` — že narejena; če je, mora Kaos delovati tudi tam ali pa
> zapiši, kaj manjka).

---

## Igra

### Fizika: prava 3D (knjižnica prek CDN)
- Uporabi fizikalno knjižnico z **rigid body + kotaljenjem**, prek CDN z **natančno pripeto verzijo** (CLAUDE.md).
  Predlog: **Rapier** (`@dimforge/rapier3d-compat`, WASM vgrajen v JS, ESM prek `cdn.jsdelivr.net/npm/...@<verzija>/+esm`).
  Preveri na npm, katera verzija/paket podpira **determinizem** (fiksni korak, isti rezultat na vseh napravah — Rapier ima
  »enhanced determinism« različico); izbiro in razlog zapiši v README. Če določena knjižnica ni deterministična med
  brskalniki, je to sprejemljivo za solo (seed + isti brskalnik), a zapiši posledice za multiplayer (tam simulira host).
- Fiksni korak (npr. 1/120 s), vsi parametri v enem modulu (`kaos/physics.js`): polmer, gostota, trenje, odbojnost,
  kotalno trenje, CCD (proti tuneliranju skozi tanke stene), največ teles.
- **16–40 frnikol** na dirko (privzeto 24, nastavitev), vse enake ali z majhnimi razlikami (masa ±10 %, odbojnost,
  trenje) — »forma« iz 1. dela se prenese v fizikalne lastnosti, a vpliv mora biti majhen.
- Brez pogona in krmiljenja. Edina »pomoč«: če frnikola **obtiči** (napredek < X v Y s) ali **pade s proge**, se po 2 s
  vrne na zadnjo kontrolno točko (kot zdaj). Preverjanje proge mora zagotoviti, da se to redko zgodi.
- Vse naključje le iz seeda (`hub.rng`): začetni razpored v »bunkerju«, drobni odmiki, časi ovir.

### Proge (vsaj 3, nov format)
- Proga ni mreža ploščic, ampak zaporedje **3D odsekov** (modul `kaos/track.js` + generator `tools/frnikole-kaos.mjs`),
  iz katerih se zgradijo trki (trimesh / konveksni deli) in izris (Three.js mreže):
  - start: »bunker« z vrati, ki se odprejo (frnikole naložene na kup),
  - žleb (U-profil, raven ali zavit), cev, spirala navzdol, serpentina z bankinami,
  - lijak (frnikole krožijo in padejo skozi luknjo), plinko polje zatičev, stopnice, skakalnica z mrežo za lovljenje,
  - vrtljivo kolo / lopatice, ki dvigujejo (»dvigalo«), nihalo, premična vrata (deterministični časovniki),
  - razcep z dvema izhodoma (kocka odloči fizika, ne izbira), zadnji ozek »stisk« pred ciljem,
  - cilj: črta + zbiralna posoda.
- Proga je opisana s podatki (JSON v `games/frnikole/kaos-tracks/`), odseki se zlepijo (izhod odseka = vhod naslednjega,
  smer in višina). Dolžina dirke 40–90 s.
- Generator s **tihimi simulacijami** preveri: (a) ≥ 99 % frnikol pride do cilja brez vrnitve na kontrolno točko več kot
  2×, (b) noben startni položaj v bunkerju ne zmaga v več kot ~15 % simulacij (pri 24 frnikolah), (c) trajanje v
  ciljnem razponu, (d) ni tuneliranja skozi stene (frnikola izven dovoljenega prostora). Rezultat v `PROGRESS.md`.
- Hitrost simulacije: izmeri ms na dirko (Node in brskalnik). Če je 30 simulacij za kvote prepočasnih (> ~3 s),
  računaj kvote v **Web Workerju** in/ali z manj simulacijami in to pokaži v UI (»Računam kvote …«).

### Pravila (kot Dirkalni dan, prilagojeno)
- 5 dirk na Kaos dan (dnevni izziv z `hub.dailySeed()` + prosta igra), boti in stave iz 1. dela (`bets.js`, `bots.js`)
  — s 24 frnikolami: stava na zmagovalca (višje kvote, npr. do 30), top 3, **top 5** (nov tip), dvoboj. `betError`,
  `settle` razširi z novim tipom (stari testi ostanejo).
- Sunki ostanejo (3 na dirko): **impulz** na izbrano frnikolo (pomoč v smeri gibanja, bočni sunek). Izbira frnikole s
  klikom/tapom v 3D ali v seznamu (24 gumbov ne gre v eno vrsto — iskanje/izbira iz vrstnega reda, »moje« frnikole na vrhu).
- Kamera: sledi vodilni skupini, »Moja«, »Pregled«, samodejni rez na mesto dogajanja (gneča v lijaku, padec, foto finiš);
  počasni posnetek cilja.
- Komentator (`texts.js`) dobi nove skupine: lijak, plinko, gneča, »zadnja do prve«, obtičala, dvigalo, foto finiš.
- Dosežki (vsaj 3 novi), npr. `kaos-outsider` (zmaga stave na frnikolo s kvoto ≥ 20), `kaos-top5` (5 zadetih top 5),
  `kaos-dan` (zmaga Kaos dneva). Naloge v `games.json` (npr. `frnikole:kaos`).
- `hub.submitScore` le za prvi dnevni poskus, z **ločeno lestvico** (seed `kaos:<datum>`), `hub.reportGame` po vsakem
  dnevu, `hub.awardXp` kot v 1. delu.

### Izris in zmogljivost
- Three.js `0.160.0` (isti importmap). Frnikole: instancirane krogle (en `InstancedMesh` z barvami/vzorci prek atributa)
  — ne 40 ločenih materialov. Proga iz odsekov z deljenimi materiali; teksture in nebo lahko iz `../krogla/render/`
  (`textures.js`, `sky.js`, `looks.js`) — uvozi, ne kopiraj.
- Kakovosti kot v Krogli (`QUALITY`, `detectQuality`), samodejno nižanje ob FPS < 40. Telefon na Nizki mora teči tekoče
  s 24 frnikolami. Meritve (draw calli, ms fizike na korak, FPS) zapiši v `PROGRESS.md` (meri v **vidnem** oknu).

### Moduli (predlog)
`kaos/physics.js` (nalaganje knjižnice, svet, telesa, korak), `kaos/track.js` (format, odseki → trki + mreže, poti za
napredek in vrstni red), `kaos/race.js` (dirka: start, cilj, kontrolne točke, sunki, dogodki — čisto, brez DOM-a),
`kaos/view.js`, `kaos/odds.js` ali razširitev `odds.js`, `kaos/worker.js` (če je potreben), vstop iz `game.js`.

### Testi
- Determinizem: ista dirka (seed + sunki) dvakrat → isti vrstni red in položaji (v Node, če knjižnica deluje v Node;
  sicer v `tests.html` in to zapiši).
- Vsaka proga se naloži in validira; kratka tiha simulacija: vse frnikole v cilju.
- Nove stave (top 5), kvote (vsota implicitnih verjetnosti razumna), boti ne stavijo več, kot imajo.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Dirka frnikol — Kaos«: načrt s kljukicami,
dnevnik, meritve, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja (CDN s pripeto verzijo, brez build koraka, offline obvezen).
2. `shared/README.md` — API (`hub`, `ui`), dnevni seed, lestvice, `reportGame`.
3. `games/frnikole/README.md` in kodo `games/frnikole/` (`race.js`, `odds.js`, `bets.js`, `bots.js`, `day.js`, `view.js`, `game.js`).
4. `games/krogla/render.js` in `games/krogla/render/` (teksture, nebo, lokacije, kakovosti).

### Tehnično
- **Brez build koraka**, ES moduli, relativne poti, besedila v slovenščini. Zunanja knjižnica le prek CDN z natančno verzijo.
- `import { hub, ui } from '../../shared/hub.js'`; deluje v offline načinu (`?offline=1`).
- **Po vsaki odigrani igri `hub.reportGame({ won, players, score, daily })`**. Igralce prikazuj z `ui.who(p)`.
- Čisto logiko v ločene module brez DOM-a, testi v `tests/frnikole.js` (ali `tests/frnikole-kaos.js`).
- **PC (tipkovnica + miška) in telefon (portret, 375 px)**; veliki gumbi, `touch-action: manipulation`, brez hover-only.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku (vidno okno).
2. **Konzola brez napak** v Kaosu, v zdajšnjem Dirkalnem dnevu, v Krogli, v Rušilcu in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi nespremenjeni).
4. Odigraj cel Kaos dan v brskalniku (dnevni in prosti), s stavami in sunki; `?fast=1` (in `?kaos=1&track=N` za razvoj)
   preveri vse proge.
5. Izgled na **PC-ju** in **telefonu (375×812)**: posnemi zaslone, sam jih preglej in popravi.
6. `games.json`: posodobi opis/oznake in naloge (test sheme uspe).
7. Posodobi `PROGRESS.md` in `games/frnikole/README.md` (Kaos: fizika, knjižnica in verzija, format prog, kako dodati progo).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, katera knjižnica in zakaj, zmogljivost, kaj ni bilo preverjeno.
