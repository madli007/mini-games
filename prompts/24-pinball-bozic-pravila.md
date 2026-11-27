# Prompt za AI agenta: Božični pinball (3/4 — pravila, načini, wizard, DMD, glasba)

> **Stanje:** ⬜ čaka — predpogoj: 23 ✅ (lahko takoj)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/24-pinball-bozic-pravila.md in ga v celoti izvedi.«**
>
> Predpogoj: prompta 22 (motor) in 23 (miza) sta narejena. Preberi `games/bozicni-pinball/README.md` (mapa strelov,
> legenda vstavkov) in sekcijo »Božični pinball« v `PROGRESS.md`. Nedokončano iz prompta 23 naredi najprej.
>
> Cilj: miza postane **»feature rich«** z globino, ki drži igralca dlje časa: jasna pot do wizarda, vsak način
> drugačen, vse označeno s puščicami, bogat DMD in praznična glasba.

## Stanje po promptu 23 (dejanska imena — preberi najprej)

- **Miza:** `games/bozicni-pinball/table/` (`index.js` modul, `table.js` geometrija, `rules.js` razred `BozicRules`,
  `config.js` CFG/PAL/SHOTS, `art.js` grafika, `view.js` DMD in UI). Pravila, mapa strelov, legenda in bot statistika:
  `games/bozicni-pinball/README.md`. Testi: `games/pinball/tests/bozic.js`. Orodja: `node tools/pinball-shots.mjs bozic`,
  `node tools/pinball-bot.mjs bozic 200`.
- **Strele (id → ime):** `orbitL` Sankališče (levi orbit, spinner) · `rampL` Smučka (→ desni inlane) · `center` Jelka
  (ozek kanal, ujeta žogica `okrasek`) · `rampR` Vlakec igrač (→ levi inlane) · `orbitR` desni orbit · `kepa` (tarča
  zgoraj desno, le zgornji flipper) · `drops` Parklji (drop banka `parklji`) · `venec` (4 standupi) · `lanes` Z·V·O·N ·
  `pops` Snežaki.
- **Dimnik in Pisma sta luknji (VUK) v kanalih orbitov**, ki se odpreta le, ko je na voljo nagrada (`rules.holes()`
  nastavi `saucer.capture`): `dimnik` v Sankališču (lock), `pisma` v desnem orbitu (pismo / extra ball). Oba izvržeta
  podzemno na levi inlane. Zato: »zadeni dimnik« = Sankališče, ko je dimnik odprt; za »Dimnik za dimnikom« naj
  »naslednji dimnik« pomeni drug strel z odprto luknjo ali prižgano puščico (npr. desni orbit → Pisma kot drugi dimnik).
- **Zgornja zanka ne obstaja;** zgornji flipper zadene tarčo **Kepa** (`zanka` stikalo). Kepanje multiball: »Kepa 5×«.
- **Kljuke:** `rules.mode` (null), `startMode()` (prazno), `musicLevel()`, `onPisma()` (tu se začnejo načini — zdaj
  nagrada + »PISMA KMALU«), `letterLit` / `lightLetter()` (pismo se prižge na začetku, po 4+ rampah in po vencu),
  `mysteryLit` + `onVenecComplete()` (adventni koledar), `treeLights` / `treeDone` (lučke jelke 0–9, `game.lamps.tree0..8`,
  zvezda `star`), igrača `jelka` (`game.moveToy('jelka', { angle })`), `trainT` (vlakec), sani (`art.drawSleigh`, zdaj
  med multiballom), `onMajor(id)` (combo + jackpot), `jackpot()`, `superJackpot()`, `startMultiball()`.
- **Vstavki** (`table.js → buildLamps`): puščice `arrOrbitL, arrDrops, arrRampL, arrCenter, arrRampR, arrOrbitR`, mali
  `jp*`, `cb*`, `lockL`, `superJ`, `pismo`, `extra`, `mystery`, `svec0..3`, `vreca0..2`, `lane0..3`, `mult2..6`, `kepaL`,
  chevroni `rampLC*`, `rampRC*`. Barve načinov so v `PAL.miklavz`, `PAL.bozicek`, `PAL.mraz`.
- **Motor** je dobil: `Rules.onLaunch(p)`, `T.shot({ from, labelX, labelY })`, `view.ui.help` (mapa strelov),
  `view.ui.toggles` (stikala v nastavitvah), `summary.panelKey`, `table.achievements(d)` / `table.events(d)` (hub),
  `rules.shotMapSetup()` (merilec), bot `drainX` / `centerAllPct` / `outlaneAllPct`.
- **Ni bilo narejeno v 23:** ročno igranje z roko (podokno brskalnika je bilo skrito — preverjeno z botom in skripto),
  fps na telefonu, zapis na Supabase lestvico v živo (offline preverjen). Glej `PROGRESS.md` → »Božični pinball«.

---

## Struktura pravil (pregled)
```
Pisma (nabiralnik) → 6 načinov (2 na vsakega dobrega moža)
  ├─ Miklavž:   »Parklji na pohodu«, »Polni škornji«       → mini-wizard »Miklavževo«
  ├─ Božiček:   »Vožnja s sanmi«, »Dimnik za dimnikom«    → mini-wizard »Sveti večer«
  └─ Dedek Mraz: »Novoletna jelka«, »Ognjemet«           → mini-wizard »Novoletni sprejem«
Vsi trije mini-wizardi → WIZARD »POLNOČ«
Vzporedno: Darilni multiball (prompt 23), Kepanje multiball, Adventni koledar (mystery), hurry-upi, množitelj mize
```

## Načini (začnejo se v nabiralniku »Pisma«, ko je pismo prižgano)
- Pismo se prižge na začetku igre in po npr. 4 standup/rampnih zadetkih (uglasi). V nabiralniku igralec z
  **flipperjema izbere** enega od prižganih načinov (kot pri modernih mizah), DMD pokaže opis in cilj.
- Vsak način traja 30–60 s (ali do konca), ima **jasno označene strele** v barvi dobrega moža (utripajoče puščice),
  časovnik na DMD, nagrado za vsak strel in **končno nagrado** (»total«) ob koncu. Načini se lahko odigrajo, tudi če
  niso dokončani (dokončan = poln dosežek za mini-wizard; začet = delen).
- Ob zagonu načina **ball save** 10 s. Načini se ne prekrivajo med seboj; z Darilnim multiballom se lahko (multiball
  med načinom je dovoljen, način med multiballom ne).

| Način | Ideja | Strele | Posebnost |
|---|---|---|---|
| **Parklji na pohodu** | parklji uhajajo | drop banka se ponastavi vsakih nekaj sekund; vsak parkelj = nagrada | ko podreš vse 3 v 3 s: »Ujeti!« bonus |
| **Polni škornji** | polni škornje z darili | 3 naključni prižgani streli, ko zadeneš enega, se premakne | vrednost raste z zaporedjem |
| **Vožnja s sanmi** | sani letijo po vasi | zaporedje **orbit → rampa → orbit → rampa** (pot je prikazana s puščicami) | sani se na mizi vozijo po žici, zgrešen strel = sani počakajo |
| **Dimnik za dimnikom** | hurry-up | vrednost pada od 3 mio, zadeni **dimnik**; nato se prižge naslednji dimnik (drug strel) | 3 dimniki zapored = super |
| **Novoletna jelka** | okrasi jelko | **center jelka** + vsi streli prižigajo nadstropja jelke | zvezda na vrhu = konec z dvojno nagrado |
| **Ognjemet** | frenzy | bumperji in vse rampe dajejo naraščajoče točke, vsak strel izstreli ognjemet nad mizo | zadnjih 10 s ×2 |

- **Mini-wizardi** (ko sta oba načina dobrega moža odigrana) se začnejo v nabiralniku: kratek (30–45 s) multiball
  z 2 žogicama in eno temo (Miklavževo: vse drop tarče so jackpot; Sveti večer: vse rampe jackpot, sani vozijo;
  Novoletni sprejem: jelka utripa, center je super jackpot).
- **WIZARD »POLNOČ«** (po vseh treh mini-wizardih): prižge se v **jelki**. 4-ball multiball, **odštevanje od 10 do 0**
  (vsak velik strel odšteje 1 in je jackpot), pri 0 **»SREČNO!«** — ogromen ognjemet čez celo mizo, vse luči, nagrada,
  nato nadaljevanje z 1–2 žogicama v »Novem letu« (vse ×2) do izgube žogic. Nato se načini začnejo znova (2. krog, višje
  vrednosti).

## Ostale funkcije
- **Kepanje multiball** (2 žogici): zgornji flipper → tarča **Kepa** 5× → v nabiralniku »Kepanje!«. Snežne kepe
  (delci) letijo ob vsakem zadetku. Jackpot na Kepi in obeh orbitih. Lahko se zloži z Darilnim multiballom
  (»Božična zmešnjava«, 5 žogic, enkrat na igro).
- **Adventni koledar (mystery):** 4 sveče adventnega venca (standupi) → v nabiralniku odpreš **vratca koledarja**
  (24 vratc na igro, vsako z nagrado: točke, ball save, lock, bonus X, prižgan način, množitelj mize, extra ball
  (redko), »Miklavževa šiba« (nič, za smeh)). Na DMD animacija odpiranja vratc.
- **Množitelj mize »Zvonček«:** zgornji kanali Z·V·O·N dvakrat zapored → ×2 vse točke za 30 s (×3 pri tretjem).
- **Hurry-upi:** po vsakem lockcu kratek hurry-up v dimniku. **Extra ball** tudi iz koledarja in po 2. mini-wizardu.
- **Combo** nadgradnja: »Snežna veriga« (combo ×5 = poseben bonus, ×10 = dosežek).
- **Match** na koncu igre (DMD animacija z darili), **high score** z imenom uporabnika na lestvici huba (motor, prompt 22).
- **Bonus ob koncu žogice** našteje: rampe, orbite, parklje, sveče, pisma, combo × bonus X (DMD seštevanje).

## DMD in prikaz
- Barvni DMD (motor) v prazničnih barvah. Animacije: odpiranje pisma in izbira načina, sani čez zaslon, parkelj
  z verigo, jelka se prižiga, ognjemet, odštevanje do polnoči, odpiranje vratc koledarja, jackpot / super jackpot,
  combo, extra ball, match. Kratke (0,6–2 s), ne smejo prekriti ključnih informacij o igri predolgo.
- **Stalni prikaz med načinom:** ime, časovnik, napredek, vrednost naslednjega strela.
- **Napovedovalec** (besedilo na DMD, slovenski izrazi, veliko variant): »JACKPOT!«, »Še dva dimnika!«, »Parkelj
  pobegnil!«, »Snežna veriga ×5!«, »Polnoč se bliža …«.
- Stranska plošča (motor) kaže napredek: pisma (6 načinov z ikonami), mini-wizardi, lock, koledar (24 vratc).

## Zvok in glasba
- **Proceduralna glasba** (kot v Alu mizi) s prazničnimi aranžmaji **samo ljudskih ali javno dostopnih** melodij
  (npr. *Kraguljčki / Jingle Bells* (1857), *Sveta noč* (1818), *Deck the Halls*, *We Wish You a Merry Christmas*),
  nikoli modernih avtorsko zaščitenih pesmi. Ločena tema za: osnovno igro, vsak način, multiball, wizard Polnoč.
- **Efekti:** zvončki ob kanalih, kraguljčki ob saneh, škripanje snega, »ho ho« (sintetiziran ton, ne glas),
  ognjemet, verige parkljev, odpiranje vratc. Vse sintetizirano v kodi.

## Uravnoteženje
- Bot (motor) 200+ iger: povprečen igralec odigra 1–3 načine na igro, multiball v ~60 % iger, mini-wizard v ~10 %,
  Polnoč redko (< 2 % bot iger, a dosegljiva v dobri igri). Zapiši statistiko v README.
- Točke: wizard Polnoč mora biti vreden največ, načini primerljivi med seboj (±25 %).

## Hub
- Dosežki (vsaj 6 novih): vsak mini-wizard, Polnoč, vsi 24 vratc koledarja v eni igri, Božična zmešnjava (5 žogic),
  Snežna veriga ×10. Naloge v `games.json` (npr. »Odigraj 2 načina v eni igri«, »Odpri 5 vratc koledarja«,
  tedenska »Doseži Polnoč«). Dogodki prek `hub.reportEvent('bozicni-pinball:<ime>', vrednost)`.

---

## Fiksni del

**Delaj v enem kosu, do konca.** Ne sprašuj za potrditev vmesnih korakov. Sproti vodi `PROGRESS.md`.

### Najprej preberi
`CLAUDE.md`, `games/pinball/README.md` (motor), `games/bozicni-pinball/README.md` in kodo mize.

### Obvezna preverjanja (pred commitom)
1. Strežnik (`mini-games`, port 8124), konzola brez napak.
2. Testi uspešni (Alu zlati test, testi pravil božične mize: vsak način začni, dokončaj, izgubi; mini-wizard; Polnoč;
   koledar; zlaganje multiballov; tilt med načinom). Dodaj razvojne bližnjice `?debug=1` (začni način, prižgi wizard).
3. V brskalniku odigraj vsak način vsaj enkrat (z bližnjicami) in Polnoč do konca; posnetki zaslona (telefon in
   namizje), preglej DMD animacije in puščice med načini (ali je jasno, kam streljati).
4. Posodobi `games/bozicni-pinball/README.md` (pravila kot rulesheet: načini, multiballi, wizard, koledar, legenda),
   `games.json` (naloge), `PROGRESS.md`.
5. **Commit** na `main`. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, bot statistika, kako priti do Polnoči, kaj ni bilo preverjeno.
