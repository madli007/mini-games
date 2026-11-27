# Prompt za AI agenta: Božični pinball (2/4 — miza: postavitev, streli, grafika, občutek)

> **Stanje:** ⬜ čaka — predpogoj: 22 ✅ (lahko takoj)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/23-pinball-bozic-miza.md in ga v celoti izvedi.«**
>
> Predpogoj: prompt 22 (motor) je narejen. Preberi njegov zapis v `PROGRESS.md` in `games/pinball/README.md`
> (struktura motorja, vmesnik pravil, opis elementov, merilec strelov, bot). Če je prompt 22 pustil nedokončano
> delo, ga naredi najprej.
>
> Ta prompt naredi **mizo**: geometrijo, strele, puščice, grafiko, igrače, osnovna pravila in **občutek**.
> Globoka pravila (načini, wizard, DMD animacije, glasba) so prompt 24. Po tem promptu mora biti miza že prijetna
> za igranje: lahko streljaš vse strele, imaš skill shot, lock in multiball z jackpoti, bonus X, extra ball.

## Stanje po promptu 22 (dejanska imena — preberi najprej)

- **Motor:** `games/pinball/src/engine/` — `app.js` (`startApp(table, view, { gameId, debug })`), `game.js` (jedro + razred `Rules`),
  `table.js` (`createTable()` z gradniki), `physics.js`, `bot.js`, `shots.js`, `debug.js`, `leaderboard.js`, `render/*`.
  Alu miza: `games/pinball/src/tables/alu/`, testna miza z vsemi novimi elementi: `tables/test/` (`?miza=test`) — **dober vzorec**.
  Opis vmesnika in elementov: `games/pinball/README.md` (»Kako dodati mizo«, »Elementi«, »Druga igra v hubu uvozi motor«).
- **Modul mize** (`games/bozicni-pinball/table/index.js`): `export default { id: 'bozic', ime, CFG, PAL, buildTable, Rules, view: () => import('./view.js') }`.
  `index.html` je kopija `games/pinball/index.html` (CSS `../pinball/src/style.css`), zagon:
  `startApp(table, view, { gameId: 'bozicni-pinball', debug })` iz `../pinball/src/engine/app.js`. Lestvica: `seed = miza:bozic:f<PHYSICS_VERSION>`
  (jedro to naredi samo iz `table.id`). Gumb na drugo mizo: `view.ui.links = [{ label: '🎄 Božična miza', href: '../bozicni-pinball/' }]`
  (za Alu mizo dodaj v `tables/alu/view.js`).
- **Pravila:** razred `extends Rules` s kljukami `onSwitch(name, data)` (vsa stikala; ime = ime senzorja / tarče / luknje), `onShot`,
  `onRamp(ramp, why)`, `onBallStart/onBallEnd/onDrain/onLastBall`, `onFlipper(gumb)`, `tick`, `substep`, `ballTick`, `lamps(set, t)`,
  `dmdIdle`, `summary`, `gameStats`, `isMulti`, `musicLevel`, `abort`. Combo okno in štetje strelov: `game.shot(id, x, y)`.
- **Elementi v podatkih** (`T = createTable({ id: 'bozic' })`):
  - rampe: `T.wireform({ id, layer, path, apex, width, look: 'wire' | 'ramp', exitFeed, incline })` — stene, ustje (lijak),
    senzor »made«, pojemek na vzponu (večji `incline` = pogostejša zavrnitev); ročne stene + `T.ramp({ entry, fail, exit, bounds, lift })`.
    **Pouk iz testne mize:** lasnica naj bo gladek lok (ostri kot žogico odbije nazaj), izhod žičnate rampe naj bo **v inlanu pod vrhom slinga**
    (y ≈ 735, ne na vrhu slinga — sicer se žogica zagozdi v trikotnik slinga).
  - zgornji flipper: `T.flipper({ id, side, button: 'R', px, py, len, rest, up })`; VUK: `T.vuk(id, x, y, { eject: { x, y, vx, vy } })` (podzemna pot);
    saucer/scoop: `T.saucer(id, x, y, { capture, eject })`; vidni lock (vreča): `T.lock(id, [[x, y], …], { release })` + `game.lockBall / releaseLock`;
    up-post: `T.post` + `game.setPost`; diverter: `T.diverter` + `game.setDiverter`; drop banka: `T.dropBank(id, [[ax, ay, bx, by], …], { labels })`;
    standupi: `T.standupBank`; captive ball: `T.captive(id, ax, ay, bx, by)`; magnet: `T.magnet` + `game.magnet(id, 'grab'|'throw'|…)`;
    spinner: `T.spinner`; rollover kanali: `T.laneGroup` + `game.rotateLanes`; strele: `T.shot(id, { switches, minor })`.
  - **igrače** (jelka, sani, vlakec): `T.toy(id, { x, y, shape: { segs }, speed, spin })` + `game.moveToy(id, { x, y, angle })`, izris v `art.drawToys(g, e, game, env, time)`.
- **Grafika:** `view.art` povozi privzeti izris (`drawFloor, drawMask, drawRaised, drawEmissive, drawRamp, drawRampEmissive, drawToys`);
  privzeto motor sam nariše stene, rampe po poti (žica/plastika), luknje, magnete, stebričke, lock, captive.
- **Orodja:** `?debug=1` (sloj, drsniki, H/N/G/V/J), `node tools/pinball-shots.mjs bozic` (mapa strelov), `node tools/pinball-bot.mjs bozic 100`.
- **Fizika:** `PHYSICS_VERSION = 3` (f2 fiksni korak, f3 guma mirnega flipperja). Mapa strelov Alu mize je v `games/pinball/README.md`.

### Iz prompta 22 ni bilo narejeno ali preverjeno
- Zapis rezultata na **Supabase** lestvico pod uporabnikom ni bil preverjen v živo (glej `PROGRESS.md` → »Pinball motor« → »Ni bilo preverjeno«);
  offline je preverjen, branje arhiva `scores` s Supabase deluje.
- Ročno igranje (občutek z roko na tipkovnici) — preizkušeno le z botom in skripto v brskalniku (podokno je bilo skrito).
- Match je le prikaz (deterministična številka ob koncu, brez nagrade).

---

## Igra

- **Ime:** Božični pinball — *Trije dobri možje*
- **id / mapa:** `bozicni-pinball` → `games/bozicni-pinball/` (nov vnos v `games.json`), miza v
  `games/bozicni-pinball/table/` (modul mize, glej zgoraj). Igra **uvaža motor** iz `../pinball/src/engine/` (ne kopiraj kode).
- **Kratek opis (za kartico):** »Snežna decembrska miza: Miklavž, Božiček in Dedek Mraz. Rampe, dimnik, jelka,
  darilni multiball in ognjemet ob polnoči.«
- **Način:** `single` · **Igralci:** 1 (več igralcev: prompt 25) · **Oznake:** `pinball`, `rekordi`, `praznično`
- **Ikona / barva:** 🎄 · `#e63946` (ali zlata `#ffd166`)
- **Rezultat:** točke, več je bolje. Lestvica **prek huba** (`hub.submitScore`, `ui.leaderboard`) po uporabniku, kot jo prompt 22 uvede za
  Alu mizo (`seed` = `miza:bozic:f<PHYSICS_VERSION>`). Brez inicialk.
- Na začetnem zaslonu Alu Pinballa dodaj gumb »🎄 Božična miza«, na božični mizi pa »Alu miza«.

Tema je **slovenski december**: trije dobri možje (Miklavž s parklji, Božiček s sanmi in dimnikom, Dedek Mraz z
novoletno jelko in ognjemetom). Vse ime, grafika in besedila so naši; ne posnemaj nobene obstoječe pinball mize.

## Kaj je »standard« moderne mize (upoštevaj)
- **Spodnji del »italijansko dno«:** zrcalna slingshota, inlana in outlana na obeh straneh, vodila inlanov
  podajajo žogico na flipperja. Žogica, ki pride iz inlana, mora biti mirno ujeta (cradle) in pripravljena na strel.
- **Pahljačasta postavitev (fan layout) in tok (flow):** veliki streli so razporejeni v pahljači, vidni z obeh
  flipperjev. **Rampe in orbiti vračajo žogico na nasprotni flipper** (feed), tako da se strele da povezovati v
  **combo** brez ustavljanja. Zastoj (scoop, VUK) je namenski trenutek za začetek načina ali lock.
- **Center strel je tvegan in vreden največ** in pogosto vključuje glavno igračo.
- **Vsak velik strel ima svoj sklop vstavkov (insertov) s puščico**, ki kaže točno smer strela:
  - **utripajoča puščica** = tukaj je nekaj na voljo zdaj (jackpot, način, hurry-up),
  - **sveti** = napredek / prižgano,
  - **barva puščice** = funkcija (dosledno na celi mizi, glej legendo spodaj),
  - poleg puščice manjši vstavki za lock, extra ball, način, mystery, combo.
  Igralec mora v vsakem trenutku z enim pogledom vedeti, **kam streljati**.
- **Ball save** po izstrelitvi, **skill shot** iz izstrelitve, **tilt** z opozorili, **ball search**, **match**.
- Vsak strel naj **zveni in se vidi** (zvok, blisk vstavkov, delci, kratek DMD efekt), uspešen strel ima jasen odziv.

## Postavitev mize (logične koordinate kot v motorju, npr. 600 × 1000)
Spodaj je predlog; geometrijo uglasi z merilcem strelov, dokler mapa strelov ni dobra (glej »Občutek«).
Od leve proti desni, v pahljači:

| # | Strel | Element | Feed (kam se vrne) | Funkcija |
|---|---|---|---|---|
| 1 | **Levi orbit »Sankališče«** | orbit okoli vrha, **spinner** | desni flipper ali čez kanale v bumperje | sani, kombo, skill shot cilj |
| 2 | **Dimnik** | **VUK** levo zgoraj (žogica pade v dimnik in pride ven v zgornji levi del ali v vrečo) | podzemno na levi inlane | **lock** (vidna »darilna vreča« s 3 mesti), Božiček |
| 3 | **Leva rampa »Smučka«** | **žičnata (ledena) rampa**, prečka mizo | **desni inlane** | combo, jackpot |
| 4 | **Parklji** | **drop banka 3** pred levim delom centra | — | prižge lock, Miklavž |
| 5 | **Center »Jelka«** | srednja rampa ali tesna luknja pod **jelko** (glavna igrača); za njo **captive ball »Okrasek«** | sredina / levi flipper | najtežji strel, zvezda na vrhu jelke, super jackpot |
| 6 | **Desna rampa »Vlakec igrač«** | rampa z vlakcem/tiri | **levi inlane** | combo, jackpot |
| 7 | **Nabiralnik »Pisma«** | **saucer/scoop** desno | izmet proti levemu flipperju | **začetek načinov** (pisma dobrim možem) |
| 8 | **Desni orbit** | orbit z **up-postom** (za super skill shot) | levi flipper ali bumperji | combo, ognjemet |
| 9 | **Zgornji flipper »Kepa«** | tretji flipper desno zgoraj, strel v **zgornjo zanko** ali v levo rampo | — | super skill shot, combo |

Še:
- **Zgornji kanali Z·V·O·N** (4 rollover kanali na vrhu, lane change s flipperji) → **bonus X** (2× … 6×).
- **3 pop bumperji »Snežaki«** v zgornjem levem žepu (orbit in kanali jih hranijo).
- **Adventni venec**: **4 standup tarče** (sveče), razporejene okoli centra → prižgejo **Adventni koledar** (mystery,
  prompt 24) v nabiralniku.
- **Kickback »Sankač«** v levem outlanu, **ball save »Angelček«** (vstavek »S« med flipperjema).
- **Igrače:** **jelka** (luči po nadstropjih, zvezda na vrhu, se rahlo zavrti v načinih), **sani z jeleni**, ki se po
  žici vozijo čez vrh mize med načini, **dimnik** z dimom (delci), **darilna vreča** z vidnimi zaklenjenimi žogicami,
  **vlakec** na desni rampi.

### Legenda barv vstavkov (dosledno povsod)
- **rdeča** = multiball / jackpot, **zlata** = super jackpot in wizard, **zelena** = lock, **oranžna** = extra ball,
  **vijolična** = mystery (adventni koledar), **bela** = combo, **barva načina** = strel v aktivnem načinu
  (Miklavž modro-bela, Božiček rdeča, Dedek Mraz modra-srebrna).
- Na predpasniku (apron) spodaj **kartica pravil** levo in **kartica legende** desno (kot na pravih mizah), v igri tudi
  pomoč »?« s prekrivno mapo strelov, ki pokaže vse strele s puščicami in imeni.

## Osnovna pravila v tem promptu
- **Skill shot:** izstrelitev v utripajoči kanal Z·V·O·N (vrednost raste vsakič). **Super skill shot:** drži levi
  flipper med izstrelitvijo → up-post zapre desni orbit, žogica pride na zgornji flipper, zadeni levo rampo v 3 s.
- **Ball save** 10 s po izstrelitvi, kickback, tilt (2 opozorili), ball search, bonus ob koncu žogice × bonus X.
- **Lock in Darilni multiball:** parklji (vse 3 drop) prižgejo lock v dimniku. 3 locki (vidni v vreči) → **Darilni
  multiball** (3 žogice). **Jackpot** na obeh rampah in obeh orbitih (rdeče puščice), ko so vsi zadeti, **super jackpot**
  v jelki (zlata puščica). Add-a-ball enkrat (parklji med multiballom). Multiball ball save.
- **Combo:** zaporedni veliki streli v oknu (motor); rampa → rampa → orbit … z naraščajočo vrednostjo, DMD prikaz.
- **Extra ball** (oranžna) se prižge v nabiralniku po npr. 10 rampah.
- Točke uravnotežene tako, da je razpon podoben Alu mizi (lestvici se lahko primerjata po občutku).
- Načini, mystery, wizard in kepanje multiball so v promptu 24; tukaj pusti kljuke (nabiralnik naj za zdaj da
  nagrado točk in sporočilo »Pisma kmalu«).

## Občutek (najpomembnejši del — ne preskoči)
- Z **merilcem strelov** (prompt 22) iteriraj geometrijo, dokler ne velja:
  - vsak velik strel je zadetljiv z vsaj enega flipperja z oknom **≥ 25 ms** (rampe in orbiti ≥ 35 ms z idealnega
    flipperja), center jelka namenoma ožji (15–25 ms);
  - rampe in orbiti v **≥ 85 %** zadetkov podajo žogico na predvideni flipper (flow), žogica iz inlana se umiri v cradlu;
  - ni mest, kjer bi se žogica ujela ali obstala (bot 200 iger brez ball search > 2-krat na igro);
  - zavrnitve ramp (rejects) so redke pri dobrem strelu in pogoste pri slabem;
  - VUK in saucer izmetata predvidljivo (proti flipperju, ne naravnost v drain).
- **Bot statistika** (100+ iger): povprečna igra 3–7 min, povprečna žogica 50–120 s, delež izgub skozi outlane
  35–55 %, po sredini 20–40 %. Rezultate in končno mapo strelov zapiši v `games/bozicni-pinball/README.md`.
- Flipperji, sling, bumperji: izhajaj iz Alu uglasitve (preizkušena), spreminjaj le z drsniki in utemeljitvijo.
- Ročno igraj vsaj 5 iger in zapiši, kaj ni prijetno (to je nadomestek za testne igralce), in popravi.

## Grafika (»zelo lepo zgleda«)
- **Noč, sneg in topla svetloba:** temno modra snežna pokrajina na tleh mize, vasica s prižganimi okni v ozadju,
  topla GI razsvetljava (rumeno-oranžna) ob robovih, mrzla modra na ledu in rampah. Bloom in ACES iz motorja.
- **Materiali:** les in rdeč lak na robovih, **zlate** letve in kovinski deli, **ledene prosojne rampe** (lom, sijaj),
  **trakovi kot sladkorne palčke** na žičnatih rampah in vodilih, girlande z lučkami ob loku.
- **Jelka** je glavna igrača: večplastna, lučke po nadstropjih (prižgane glede na napredek), **zvezda z bloomom**,
  rahla animacija. **Dimnik** s toplim sijem in dimom, **vreča** s prosojnim pogledom na zaklenjene žogice.
- **Sneženje:** subtilni delci snega nad mizo (nikoli ne zakrijejo žogice; izklopljivo, manj na nižji kakovosti),
  zameti ob robovih, ivje na steklu ob vogalih.
- **Vstavki** so pravi »pinball vstavki«: prosojna plastika z ikono (sveča, darilo, zvezda, parkelj, sani), ugasnjeni so
  vidni a temni, prižgani žarijo z bloomom, puščice imajo notranji gradient in obrobo. Svetlobni šovi ob dogodkih.
- **Backbox (zgoraj, DMD okvir):** praznična ilustracija (trije dobri možje nad zasneženo vasjo), DMD v toplih barvah.
- Vse proceduralno v kodi (canvas/WebGL), brez tujih slik. Kakovost Nizka → Ultra (motor), telefon tekoče 60 fps
  na Srednji.

## Hub
- `hub.init({ gameId: 'bozicni-pinball' })`, po vsaki igri `hub.submitScore`, `hub.reportGame({ players: 1, score })`,
  `hub.awardXp` (podobno kot `hubXp` v Alu mizi). Dosežki (vsaj 4): prvi multiball, super jackpot, super skill shot,
  combo ×5. Naloge v `games.json`: odigraj igro, zadeni super jackpot, doseži X točk (tedenska: 3 multiballi).

## Ni del te naloge (prompt 24)
Načini treh dobrih mož, mini-wizardi, wizard »Polnoč«, Kepanje multiball, Adventni koledar (mystery), hurry-upi,
množitelj mize, DMD animacije in praznična glasba.

---

## Fiksni del

**Delaj v enem kosu, do konca.** Ne sprašuj za potrditev vmesnih korakov. Sproti vodi `PROGRESS.md`
(sekcija »Božični pinball«: načrt s kljukicami, dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md`, `shared/README.md`.
2. `games/pinball/README.md` (motor, elementi, merilec strelov) in `games/pinball/src/engine/`, `tables/alu/`, `tables/test/`.

### Tehnično
- Brez build koraka, ES moduli, relativne poti, besedila v slovenščini, `<body class="mg">` z `../../shared/ui.css`
  le kjer se ne tepe s pinball izgledom (glavni zaslon pinballa ima svoj CSS).
- Pravila mize brez DOM-a, testi v `games/pinball/tests/` (ali `tests/tests.js`): lock/multiball/jackpot zaporedja,
  skill shot, bonus X, extra ball, combo, bot statistika (meje zgoraj).
- Alu miza in zlati test iz prompta 22 morata ostati zelena (sprememba fizike motorja je dovoljena le po pravilih 1b iz prompta 22: nova `PHYSICS_VERSION`, regeneriran posnetek, statistika pred/po).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124), konzola brez napak (Božična miza, Alu miza, dashboard).
2. Vsi testi (`node games/pinball/tests/run-node.mjs`, `node tests/run-node.mjs`) uspešni.
3. Z `?debug=shots` zadeni vsak strel; izpiši mapo strelov. Ročno odigraj vsaj 5 iger z multiballom.
4. Posnetki zaslona: telefon (375×812) in namizje, kakovost Nizka in Ultra; sam jih preglej in popravi, kar je grdo ali
   nejasno (posebej: ali je s puščicami jasno, kam streljati).
5. `games.json` vnos `live` (test sheme uspe), `games/bozicni-pinball/README.md` (kontrole, pravila, mapa strelov,
   legenda vstavkov), `PROGRESS.md`.
6. **Commit** na `main`. Ne pushaj.

### Na koncu
Popravi `prompts/24-pinball-bozic-pravila.md` po dejanskem stanju (imena strelov, kljuke za načine, kaj je ostalo).

V končnem odgovoru kratko povzemi: kaj je narejeno, mapa strelov in bot statistika, kako igrati, kaj ni bilo preverjeno.
