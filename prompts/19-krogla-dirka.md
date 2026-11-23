# Prompt za AI agenta: Hrčkova krogla — Dirka (multiplayer na širokih progah)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/19-krogla-dirka.md in ga v celoti izvedi.«**
>
> Ozadje: Hrčkova krogla (`games/krogla/`) je singleplayer na čas. Rušilec (`games/rusilec/`) je party arena z
> več kroglami (host simulira, `net.js`). Dirka frnikol (`games/frnikole/`) ima dirko več teles po progi
> (startna mreža, vrstni red, kontrolne točke, razcepi, generator širokih prog). Ta prompt združi vse troje v
> **dirkalni način za Hrčkovo kroglo**: 2–8 igralcev na svojih telefonih, vsak vozi svojega hrčka po široki progi,
> prvi v cilju zmaga.
>
> **Krogla, Rušilec in Frnikole morajo ostati enaki**: njihovi testi ostanejo zeleni brez sprememb pričakovanih
> vrednosti (časi, medalje, ghosti, autopilot). Ne kopiraj kode — uvažaj module (tako kot Rušilec uvaža Kroglo).
> Razširitve `physics.js` le kot nove funkcije ali neobvezne opcije, ki singleplayerja ne spremenijo.

---

## Igra

- **Ime:** Hrčkova dirka · **id / mapa:** `dirka` → `games/dirka/` (nov vnos v `games.json`, `mode: "realtime"`,
  `players: { min: 1, max: 8 }`, oznake `party`, `arkada`, `spretnost`, barva npr. `#4de1ff`, ikona 🏁).
  Ali: dirka kot način v meniju Rušilca/Krogle — odloči sam, zapiši zakaj (ločena igra je bolj pregledna v hubu).
- **Kratek opis (do 160 znakov):** »Hrčki v kroglah dirkajo po širokih zračnih progah. Ghosti ali trki, sunek po
  želji — prvi v cilju zmaga. 2–8 igralcev na telefonih.«
- V meniju Krogle in Rušilca povezava »🏁 Hrčkova dirka«, v igri povezava nazaj.
- **Rezultat:** mesto in čas; lestvica posamezne proge = najboljši čas v dirki (`scoreOrder: 'asc'`, ms), seed `dirka:<proga>`.

### Načini (nastavitev v lobbyju)
1. **👻 Ghosti (privzeto)** — brez trkov med hrčki. Vsak klient simulira **svojo** kroglo lokalno s `physics.step`
   (ista fizika kot singleplayer → nič zamika v vožnji), svoj položaj pošilja ~12×/s (`room.send('pos', …)`),
   tuje krogle so prosojni ghosti z imenom in barvo (`Renderer.setGhosts` ali podrazred kot `ArenaRenderer`).
   Čas cilja sporoči klient (»na časten način«, kot lestvice); host le zbira čase in razglasi vrstni red.
   Preveri razumnost: čas ≥ 30 % autopilota proge (`dev.time`), sicer se ne upošteva.
2. **💥 Trki** — krogle se odbijajo (`../rusilec/collide.js`). Host simulira vse krogle (`makeBody`, `stepBody`,
   `advanceWorld`, `collideAll`), klienti pošiljajo vhod, svojo kroglo napovedujejo in mehko popravljajo
   (`../rusilec/net.js`: `encodeSnap`, `decodeSnap`, `HostClock`, `Interp`, `correct`, `EventLog`, `EventSink`).
   Prenos hosta (`hostChanged`) in ponovna povezava kot v Rušilcu.
- **Sunek** (vklop/izklop, privzeto izklopljen): pri trkih `dash` iz `collide.js` (ohlajanje npr. 4 s); pri ghostih
  le pospešek svoje krogle (brez vpliva na druge).
- Ostale nastavitve: proga (ali »turnir« 3 prog s točkami 10-8-6-5-4-3-2-1), število krogov na progi (1 / 2 za
  krožne proge, če jih narediš), boti (0–7: autopilot `../krogla/autopilot.js` po `route` proge z napako v hitrosti
  glede na težavnost — Lahek / Srednji / Težek), »📺 Samo zaslon (TV)«.

### Pravila dirke
- **Start:** startna mreža (2 vrsti po 4, kot `startGrid()` v `tools/frnikole-tracks.mjs`), odštevanje `ui.countdown(3)`,
  pred startom krogle zaklenjene.
- **Padec:** ura teče naprej, krogla se po `P.FALL_DELAY` vrne na zadnjo **svojo** kontrolno točko (singleplayer
  `respawn` dela le za `w.ball` — za več teles napiši funkcijo v `games/dirka/` ali neobvezno razširitev).
- **Cilj:** vrstni red po času prečkanja (z delom koraka, kot `finishT` v `games/frnikole/race.js`), po prvem v cilju
  še 30 s, nato ostali po napredku po poti. Foto finiš < 0,05 s.
- **Vrstni red v živo:** napredek po sredinski črti proge (`path` + projekcija na odsek, kot `routeAt`/`project` v
  frnikolah). Razcepi: napredek se preslika na glavno pot (`main` v `trackRoutes`).
- Konec: `ui.results`, vsak človek `hub.reportGame({ won: 1. mesto, players: ljudje, score: mesto })`, XP npr.
  20 + 10 za stopničke + 30 za zmago (z vsaj enim drugim človekom). Dosežki (vsaj 5): `prva-zmaga`, `foto-finis`,
  `brez-padca` (zmaga brez padca), `od-zadaj` (zmaga z zadnjega startnega mesta), `polna-mreza` (8 ljudi),
  `bliznjica` (zmaga čez tvegano pot razcepa). Naloge v `games.json`.

### Proge (vsaj 4, široke)
- Nove proge, **ne** obstoječe singleplayer proge (te so ozke): širina 5–7 ploščic, ograje v zavojih, prehitevanje
  mogoče, ozka mesta in **razcepi** (bližnjica s tveganjem), skoki, klančine, tekoči trakovi, lijaki. 40–90 s za
  dobrega igralca. Teme iz `../krogla/themes.js`, lokacije iz `../krogla/render/looks.js` (`look`).
- Format: proga Krogle (`level.js`, `validateLevel` mora uspeti — zvezdice niso potrebne, glej, kako `arena.js`
  Rušilca to obide), plus `grid` (8 startnih mest), `path` / `widths` / `splits` / `cps` (kot v
  `games/frnikole/track.js`). Uporabi/razširi `validateTrack` in `trackRoutes` iz frnikol, če ustrezata (uvozi, ne kopiraj).
- Generator `tools/dirka-tracks.mjs`: želvico iz `tools/frnikole-tracks.mjs` **izloči v skupen modul** (npr.
  `tools/lib/track-turtle.mjs`) in jo uporabi v obeh generatorjih — `node tools/frnikole-tracks.mjs` mora dati
  **enake** JSON-e kot zdaj (preveri z `git diff`). Preverjanje: autopilot pride do cilja na vseh poteh razcepov, 8
  autopilotov z različnimi linijami v načinu trkov ne obtiči (vsi v cilju v razumnem času), noben startni slot nima
  velike prednosti. Rezultat v `PROGRESS.md`.
- Route za autopilota (bote) mora imeti linije (bočni zamik), da 8 botov ne vozi po isti črti.

### Kamera, kontrole, HUD
- Kontrole kot Krogla (`../krogla/input.js`: tipkovnica, palica, nagib) — vhod relativen na kamero. Sunek kot Rušilec.
- Kamera za svojo kroglo kot v Krogli (`Renderer._camera`), na TV-ju kamera, ki sledi vodilni skupini (kot `view.js`
  frnikol) ali razdeljen pogled ni potreben.
- HUD: mesto (1./8), čas, krog, mini vrstni red, puščica do naslednje kontrolne točke, killfeed (»Ana je padla«, »Bor
  je prehitel Cilko«), ob cilju velik napis mesta. Telefon (375×812) in TV.

### Omrežje — povzetek
| Način | Kdo simulira | Sporočila |
|---|---|---|
| Ghosti | vsak svojo kroglo | `pos` (~12×/s: x, y, z, vx, vz, yaw, st), `fin` (čas, padci), host: `phase`, `order`, `full` |
| Trki | host vse | kot Rušilec: `in`, `snap`, `full`, `resync`/`evs`, `hello` |

Ghost način mora prenesti odhod hosta brez prekinitve vožnje (nov host le nadaljuje zbiranje časov iz `full`).

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`), sobe, `ui.lobby`, prenos hosta.
3. `games/krogla/README.md`, `games/krogla/physics.js`, `games/krogla/render.js`, `games/krogla/ghost.js`, `games/krogla/autopilot.js`.
4. `games/rusilec/README.md` (omrežni protokol), `games/rusilec/net.js`, `games/rusilec/collide.js`, `games/rusilec/game.js`.
5. `games/frnikole/README.md`, `games/frnikole/race.js`, `games/frnikole/track.js`, `tools/frnikole-tracks.mjs`.

### Tehnično
- Igra v `games/<id>/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `../../shared/ui.css` in `../../shared/cosmetics.css`; Three.js prek istega importmapa (`three@0.160.0`).
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId })`; `ui.header({ title })`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (enkrat na igralca).
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p iz `room.players`, z `equipped`); skin krogle kot v Rušilcu.
- Realtime: stanje prek `room.send` (broadcast), ne v bazo. Host mora preživeti **prenos hosta**.
- Čisto logiko (vrstni red, točke turnirja, boti, kodiranje) v ločene module brez DOM-a, testi v `tests/`.
- Telefon (portret, 375 px; veliki gumbi, `touch-action: manipulation`) in TV/namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v novi igri, v Krogli, v Rušilcu, v Frnikolah in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi nespremenjeni); `node tools/frnikole-tracks.mjs
   --check` da iste rezultate kot prej.
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 **oknih**: oba načina (ghosti, trki), ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj dirko do konca, odhod hosta sredi dirke, osvežitev igralca, boti, TV.
5. Izgled na **telefonu (375×812)** in **namizju/TV**: posnemi zaslone, sam jih preglej in popravi.
6. V `games.json` vnos s statusom **`live`** in nalogami (test sheme uspe).
7. Posodobi `PROGRESS.md` in napiši README igre (kontrole, načini, protokol, format prog, kako dodati progo).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj ni bilo preverjeno.
