> **Kopija v MINI GAMES hubu, zdaj z motorjem.** Izvirnik ALU PINBALL 2.0 (z zgodovino, raziskavo `PREDLOGI-FIRME.md` in
> izvornimi logotipi) je ločen repo **`pinball`** in se ne spreminja. V hubu je pinball razdeljen na **motor**
> (`src/engine/`) in **mize** (`src/tables/<id>/`): Alu miza je prva, druga miza je samo nova mapa s podatki, pravili in grafiko.
> Lestvica je **skupna lestvica huba po uporabniku** (brez inicialk); stara tabela `scores` je arhiv samo za branje.

# ALU PINBALL 2.0 — Impol × Alcad edition

Moderen pinball za hec v brskalniku: lastna 2D fizika, WebGL izris z bloomom, brušenim aluminijem
in animirano talino, barvni DMD zaslon, svetlobni šovi, proceduralna glasba in efekti.
Čisti HTML + JavaScript (ES moduli), **brez build koraka in brez knjižnic**. Teksture, zvok in glasba so generirani v kodi;
edina slikovna datoteka je logotip v `assets/logos/impol.png`.

Na mizi so prava podjetja skupine Impol in Alcad (Impol LLT, PCP, FT, Stampal SB, Rondal, R in R, Servis, Kadring,
Seval, TLM, Alcloud).

> Igra za hec. Imena in logotipi so uporabljeni z dovoljenjem (nastavljivo v `src/tables/alu/config.js`).

## Zagon lokalno

ES moduli zahtevajo strežnik (v korenu repoja `mini-games`):

```
npx --yes http-server@14.1.1 . -p 8124 -c-1
```

- <http://localhost:8124/games/pinball/> — Alu miza (privzeto), `?miza=test` — testna miza z vsemi elementi motorja
- `?offline=1` — offline način huba (lestvica v `localStorage`), `?debug=1` — sloj za uglaševanje, `?debug=shots` — mapa strelov
- testi: <http://localhost:8124/games/pinball/tests.html> ali `node games/pinball/tests/run-node.mjs`
- zlati test: `node games/pinball/tests/golden.mjs` (regeneracija samo ob novi `PHYSICS_VERSION`: `--update`)
- merilec strelov: `node tools/pinball-shots.mjs [miza] [--korak=1] [--json]`, bot: `node tools/pinball-bot.mjs [miza] [iger]`

## Kontrole

| Vnos | Akcija |
|---|---|
| Z / ← / levi Shift | levi flipper |
| M / → / desni Shift | desni flipper |
| Presledek / ↓ (drži in spusti) | izstrelitev (moč = čas držanja) |
| B / ↑ | tresenje mize (pazi na TILT: 2 opozorili) |
| P / Esc | pavza |
| O | zvok vklop/izklop |
| Enter | začni igro |
| **Dotik** | leva/desna polovica zaslona = flipper · povleci navzdol spodaj desno = plunger · hiter poteg navzgor ali gumb ⇡ = tresenje · gumb ❚❚ = pavza |
| **Gamepad** | LB/RB (ali LT/RT) flipperja · A izstrelitev · Y tresenje · Start pavza |

Igra se samodejno ustavi, ko zavihek ali okno izgubi fokus. Pred izstrelitvijo flipperja premikata skill shot.

## Pravila

**Strele:** levi orbit s spinnerjem (**Impol FT · valjarna**), rampa (**Impol PCP · stiskalnica**, dvignjena pot, vrne žogico na levi inlane),
livarna (**Impol LLT**, scoop desno), B·U·G drop tarče (Alcad kontrola kakovosti), Code review tarča (Alcad, mystery **Alcloud**),
A·L·U kanali zgoraj, 3 pop bumperji »Al 13« (**Impol · Impol Seval · Impol-TLM**), slingshota in kickback (**Stampal SB**).

| Dogodek | Podjetje |
|---|---|
| začetek igre | **Kadring: zaposlen!** |
| bonus ob koncu žogice | **Kadring: izplačilo** |
| ball save | **Impol R in R** |
| ball search (zataknjena žogica) | **Impol Servis** |
| extra ball, add-a-ball | **Rondela** (Rondal) |
| locka | **Impol Seval**, **Impol-TLM** |
| jackpot / super jackpot | **FT jackpot**, **PCP jackpot** / **New York** (Impol Aluminum Corp.) |

- **A·L·U kanali** → bonus množitelj ×2 … ×6. Flipperja premikata prižgane luči (lane change).
- **Skill shot**: zadeni utripajoči kanal neposredno iz izstrelitve → 182.500 (»od 1825«).
- **B·U·G tarče** → prižgejo **LOCK** v livarni (po prvem multiballu sta potrebna dva kompleta).
- **2 locka → MULTIBALL** (3 žogice; zaklenjena žogica je vidna v peči). Orbit in rampa sta **JACKPOT**; ko zadeneš oba,
  se v livarni prižge **SUPER JACKPOT** (2,5 × jackpot). B·U·G med multiballom = **ADD-A-BALL** (enkrat).
- **Combo**: zaporedni veliki streli (orbit, rampa, code review) v 4 s; prikaz na DMD. Zaporedne rampe dajo še rampni combo.
- **Code review**: 3 zadetki → **mystery award** (točke, lock, extra ball, ball save, množitelj, prižgana misija, kickback).
- **Extra ball** (»Rondela«) se prižge po 8 orbitih (pobereš ga v livarni).
- **Kickback** v levem outlanu; spinner ga ponovno prižge (vsakih 50 obratov). **Ball save** 10 s po izstrelitvi.
- **Bonus** ob koncu žogice: zbran bonus × množitelj (TILT ga izniči).

### Misije (začnejo se v livarni, ko je misija prižgana)

Prva misija je prižgana na začetku, naslednje prižgejo zadetki rampe (3–5). Med misijo luči kažejo, kaj streljati.

| Misija | Cilj | Čas |
|---|---|---|
| **LLT: Livarna** (Impol LLT) | zadeni bumperje 12× — peč se vidno segreva | 40 s |
| **FT: Folija** (Impol FT) | navij 50 m folije: spinner 1 m, orbit 12 m | 45 s |
| **Alcad hotfix** | hurry-up: vrednost pada od 2.000.000, zadeni rampo, preden pade na nič | 30 s |
| **Alcad sprint** | zadeni vseh 5 označenih strelov (orbit, rampa, livarna, B·U·G, review) | 60 s |

**Finale »Naročilo izpolnjeno«** (wizard, »izvoz na 50 trgov«): ko opraviš vse štiri misije, se v livarni prižge finale — 4-ball multiball,
vse je vredno jackpot, poseben svetlobni šov in glasba. Ko ostane ena žogica, dobiš nagrado in misije se začnejo znova.

## Grafika in kakovost

- WebGL: miza v shaderju (brušen aluminij z anizotropnim odsevom, ki sledi kameri in žogicam), animirana talina (fbm šum),
  dinamične luči žogic in bliskov, toplotna distorzija nad pečjo, večnivojski bloom (dual-kawase), ACES, vinjeta, rahla perspektiva.
- Dinamični elementi (kromirane žogice z odsevom okolja in senco, bumperji, flipperji, slingi, tarče, spinner, rampa) se rišejo
  v Canvas 2D sloj, ki ga shader združi z emisijskim slojem za bloom.
- **Kakovost**: Samodejno / Nizka / Srednja / Visoka / Ultra (Nastavitve). Samodejno začne z Visoko (na telefonu Srednjo),
  zniža stopnjo, če fps pade pod ~48, in se vrne nazaj, če znižanje ne pomaga (zaslon z 30 Hz).
- Brez WebGL igra preklopi na preprostejši 2D izris.


## Lestvica (hub, po uporabniku)

- Po koncu igre se rezultat **samodejno** shrani prek `hub.submitScore(score, { seed, meta })` v `game_scores` (vezano na
  `user_id`; ime in avatar iz profila, prikaz z `ui.who`). Brez profila igra pokaže gumb **»SHRANI NA LESTVICO«** (odpre okno za vzdevek).
- `seed = 'miza:<id>:f<PHYSICS_VERSION>'` (npr. `miza:alu:f3`). Lestvica v igri, stranski panel, DMD (attract top 10) in hub
  filtrirajo po trenutnem seedu, zato so rezultati vedno primerljivi. Ob novi verziji fizike se lestvica začne na novo.
- Zavihki na zaslonu LESTVICA: **Ta verzija** (vsi časi / teden / danes), **Prejšnje verzije** (`f1`, `f2` …), **Arhiv (pred portalom)** —
  stara tabela `public.scores` z inicialkami, samo branje (REST, ni na voljo v offline načinu). Vanjo ne pišemo več.
- `meta`: miza, verzija fizike, trajanje, žogice, multiballi, misije, finale, največji jackpot in combo, konec (drain/tilt), match.
- Po vsaki igri še `hub.awardXp` in `hub.reportGame` (kovanci, naloge). V `?debug=1` se rezultat ne shrani.
- Offline (`?offline=1`): isti API prek lokalnega adapterja huba. Statistika (igre, najboljši, combo …) je lokalna (`aluPinball2.stats`).

## Struktura

```
index.html                ohišje, DMD, miza, stranski paneli (+ ../../shared/ui.css za lestvico in profil)
tests.html                testi v brskalniku (zlati test je tu samo informativen: posnetek je iz Node)
src/main.js               izbere mizo (?miza=<id>, privzeto alu; neznana → alu) in jo zažene
src/style.css             izgled ohišja in zaslonov
src/engine/               MOTOR — brez imen in koordinat katerekoli mize
  config.js               PHYSICS_VERSION, dimenzije, PHYS (nastavljiva fizika), kakovost, privzeta paleta
  table.js                gradniki mize (createTable: seg, sensor, lamp, bumper, sling, flipper, rampa, wireform, saucer, VUK,
                          spinner, lane group, lock, post, diverter, captive, magnet, igrača, strel, launcher)
  physics.js              2D fizika iz T: kapsule, krogi, flipperji (ω×r), plasti ramp, ujeta žogica, magneti, igrače
  game.js                 jedro igre (žogice, plunger, tilt, ball save, drain, ball search, bonus X, multiball, lock, combo,
                          extra ball, match, konec) + razred Rules (vmesnik pravil mize)
  app.js                  povezava jedra, izrisa, DMD, zvoka, UI in vnosa; startApp(table, view, opts)
  bot.js                  deterministični bot za katerokoli mizo + poročilo statistike
  shots.js                merilec strelov (mapa strelov)
  debug.js                ?debug=1 sloj, drsniki, korak za korakom
  leaderboard.js          lestvica huba po uporabniku, arhiv scores
  ui.js, input.js, audio.js, storage.js, bus.js
  render/                 renderer (kamera, efekti, kakovost), scene (dinamični sloj iz T), art (privzet statični izris),
                          gl (WebGL, bloom), lights (svetlobni šovi), dmd (DMD 128×32)
src/tables/index.js       register miz (id → modul)
src/tables/alu/           ALU MIZA: index.js (modul), table.js (geometrija), rules.js (AluRules), config.js (imena, PAL, MODES),
                          view.js (besedila za DMD in UI), art.js (tla, peč, rampa, predpasnik), logos.js
src/tables/test/          TESTNA MIZA (?miza=test): vsi novi elementi z minimalnimi pravili; ni v hubu
tests/tests.js            fizika, streli, rampa, stresni test, fps, live catch, ball search, pravila, bot, zlati test
tests/elements.js         novi elementi na testni mizi
tests/golden.js, .mjs     zlati test (posnetek v ../../tests/fixtures/pinball-golden.json)
supabase/scores.sql       stara tabela scores (arhiv, ne spreminjaj)
```

## Kako dodati mizo

1. Mapa `src/tables/<id>/` z:
   - `index.js` — `export default { id, ime, CFG, PAL, buildTable, Rules, view: () => import('./view.js') }`
   - `table.js` — `buildTable()` z `createTable({ id })` iz `engine/table.js` (glej »Elementi« spodaj), na koncu `return T.finish()`
   - `rules.js` — razred, ki razširi `Rules` iz `engine/game.js`
   - `config.js` — `CFG` (`steviloZogic`, `ballSaveSek`, `comboOkno`, `sporocila` …) in `PAL` (ključi kot `DEFAULT_PAL`)
   - `view.js` — `art` (kljuke izrisa, lahko prazno), `dmd` (napisi za attract, `attractExtra` za lastno sliko na DMD), `ui` (besedila,
     seznam načinov, vrstice STANJE, `links` gumbi na začetnem zaslonu, `help: { legend, note }` = »? MAPA STRELOV« iz `T.shots`
     (`color`, `label`, `labelX/labelY`, `from`), `toggles: [{ id, label, def }]` = stikala v nastavitvah), opcijsko `loadAssets(onLoad)` in `envBlobs`
   - opcijsko v `index.js`: `achievements(d)` → `[{ key, title, icon }]` (hub.unlock) in `events(d)` → `[{ name, times }]` (hub.reportEvent) po vsaki igri;
     `summary().panelKey` osveži stranske panele, ko se spremeni stanje mize
2. Vrstica v `src/tables/index.js`. Miza je dostopna z `?miza=<id>`.
3. Z `?debug=1` preveri senzorje in plasti, z `?debug=shots` / `node tools/pinball-shots.mjs <id>` mapo strelov,
   z `node tools/pinball-bot.mjs <id>` statistiko, dodaj teste (glej `tests/elements.js`).

### Vmesnik pravil (`Rules`)

| Kljuka | Kdaj |
|---|---|
| `init(game)`, `resetGame()`, `resetBall()` | ustvarjanje, nova igra, nova žogica (stanje pravil) |
| `onSwitch(name, data)` | vsako stikalo: senzor (`name` = ime senzorja), `bumper`, `sling`, `drop`, `dropBank`, standup (ime), spinner (ime, ob vsakem polobratu), saucer/VUK (ime; žogica je že ujeta), ujeta žogica (ime), igrača (id). `data` ima `x, y`, žogico `b` in element (`s`, `c`, `saucer`, `bank` …). Privzeto: točke + dogodek + strel |
| `onShot(shotId, data)` | po `game.shot(id)` (combo okno in štetje skrbi jedro) |
| `onRamp(ramp, why, b)` | prehod plasti: `enter`, `fail` (zavrnitev), `exit` |
| `onBallStart()`, `onBallEnd()`, `onDrain(b)`, `onLastBall()` | izstrelitev nove žogice, konec žogice, drain, ostala je ena žogica (konec multiballa) |
| `onFlipper(button)`, `onTilt()` | pritisk gumba (lane change), tilt |
| `onLaunch(p)` | izstrelitev s plungerjem; vrne moč 0–1 (npr. super skill shot s fiksno močjo) |
| `shotMapSetup()` | (neobvezno) merilec strelov pripravi stanje, npr. zapre luknje |
| `tick(dt)`, `substep(dt)`, `ballTick(b)` | vsak frame, vsak korak fizike, vsaka žogica (npr. kickback) |
| `lamps(set, time)` | stanje luči: `set(id, 0 ugasnjena · 1 sveti · 2 utripa · 3 hitro utripa, barva)` |
| `dmdIdle(summary)`, `summary()`, `gameStats()`, `isMulti()`, `musicLevel()`, `abort()` | DMD vrstica, paneli, statistika ob koncu, multiball, glasba, prekinitev |

Jedro (`game`) ponuja: `addScore(pts, x, y, bonus)`, `shot(id, x, y)`, `say(text, sub, barva, o)`, `after(s, fn)`, `spawnLater`,
`serveBall`, `autoLaunch`, `addABall`, `captureSaucer`/`ejectSaucer(id, b, smer)`, `lockBall(id, b)`, `releaseLock(id, n|'all')`,
`hitDrop`, `resetBank(id, zamik)`, `setPost(id, gor)`, `setDiverter(id, on)`, `magnet(id, 'grab'|'pull'|'throw'|'off', o)`,
`moveToy(id, { x, y, angle })`, `rotateLanes(arr, smer)`, `mult` (bonus X), `bonus`, `extraBalls`, `ballSaveUntil`.

### Elementi (podatki v `table.js`)

```js
const T = createTable({ id: 'moja' });
T.seg(ax, ay, bx, by, { r, e, layer, look, kind, oneWay });      // stena (look: rail, rubber, post, gate, rampLip …; layer -1 = vse)
T.bumper(x, y, { r, label, sub, color });
T.sling(A, B, C, 'L', { label });
T.flipperAt('L', 195, 880);                                       // spodnji flipperji
T.flipper({ id: 'upper', side: 'R', button: 'R', px, py, len: 52, rest, up });   // zgornji flipper, lasten gumb
T.dropBank('drop', [[ax, ay, bx, by], …], { labels, color, resetDelay });         // poljubna dolžina; reset: jedro ali pravila
T.standup('id', ax, ay, bx, by, { face: [0, 1], label }); T.standupBank('id', [[…], …]);
T.ramp({ id, layer, entry: { y, x1, x2 }, fail, exit: { y, x1, x2, dir }, bounds, lift: [{ x1, y1, ay }], friction });  // ročne stene
T.wireform({ id, layer, path: [[x, y], …], apex, width, look: 'wire' | 'ramp', exitFeed: { vx, vy }, incline });
  // stene, ustje (lijak), senzor »made« na vrhu, pojemek na vzponu (večji incline = pogostejša zavrnitev) — zgradi sam
T.saucer('id', x, y, { capture: { maxUp, maxAny }, eject: { vx, rvx, vy, rvy } });  // scoop z nastavljivo smerjo izmeta
T.vuk('id', x, y, { eject: { x, y, vx, vy, … } });                 // VUK: ujame vse, izvrže drugje (podzemna pot)
T.spinner('id', x, y, { w, label });                               // senzor je lahko na plasti rampe (sp.sensor.layer)
T.laneGroup('id', [senzorji]);                                     // rollover kanali (lane change v pravilih: game.rotateLanes)
T.lock('id', [[x, y], …], { release: { x, y, vx, vy } });           // vidni lock
T.post('id', x, y);  T.diverter('id', px, py, len, a0, a1);         // up-post, preusmernik (krmilijo pravila)
T.captive('id', ax, ay, bx, by);                                   // ujeta žogica v kanalu A → B, stikalo na koncu
T.magnet('id', x, y, { r, force });
T.toy('id', { x, y, shape: { segs: [[ax, ay, bx, by, r]] }, speed, spin });  // premičen trkalnik; izris v art.drawToys
T.shot('id', { label, switches: ['senzor'], x, y, combo, minor });   // strel za combo, merilec strelov in debug
T.launcher({ x, y }); T.points = { center, scoop, modes, … }; T.heat = { x, y };   // plunger, točke efektov, vir toplote
```

### Druga igra v hubu uvozi motor

Kot Rušilec uvaža Kroglo: `games/<druga-igra>/index.html` (kopija `games/pinball/index.html`, `href="../pinball/src/style.css"`) in

```html
<script type="module">
  import { startApp } from '../pinball/src/engine/app.js';
  import table from './table/index.js';          // modul mize kot zgoraj (uvaža ../../pinball/src/engine/table.js, game.js)
  const view = await table.view();
  startApp(table, view, { gameId: '<druga-igra>', debug: new URLSearchParams(location.search).get('debug') });
</script>
```

Lestvica gre pod `gameId` te igre (`seed = miza:<id>:f<verzija>`). Povezavo na drugo mizo na začetnem zaslonu doda
`view.ui.links = [{ label: '🎄 Božična miza', href: '../bozicni-pinball/' }]`.

## Orodja za občutek

- **`?debug=1`**: segmenti po plasteh (bela 0, modra 1, roza 2, zelena »vse«), enosmerna vrata (rumena puščica), senzorji z imeni,
  strele (▶), vstop (zelena) in izhod (rdeča) ramp, flipperji z gumbom, hitrost in plast vsake žogice, fps.
  Tipke: **H** zadrži fiziko, **N** en frame (Shift+N en korak fizike 1/720 s), **G** + klik/poteg postavi žogico (poteg = hitrost),
  **V** skrije sloj, **J** izpiše nastavitve kot JSON. Drsniki: naklon (gravitacija), flipper gor/dol, elastičnost flipperja
  (udarec in miren), padec odbojnosti, gume, trenje, sling, bumper, ball save — shranjeni v `localStorage` (`aluPinball2.physDebug`).
  Gumba za bota (10/30 iger) in mapo strelov.
- **Merilec strelov** (`engine/shots.js`, `node tools/pinball-shots.mjs`, `?debug=shots`): za vsak flipper in začetek (žogica pride
  iz inlana ali leži v cradlu) preleti čas pritiska v korakih po 1 ms (fizika teče s korakom 1/720 s, zato sta sosednja vzorca lahko enaka)
  in zapiše strel, skupno in najdaljše okno (ms), kam se žogica vrne in mediano hitrosti ob zadetku.
- **Bot** (`engine/bot.js`, `node tools/pinball-bot.mjs`): povprečje točk, trajanje igre in žogice, delež drainov po sredini /
  v outlanih (`centerDrainPct`/`outlaneDrainPct` = med njima; `centerAllPct`/`outlaneAllPct` = od vseh drainov), strele na minuto,
  multiballi, načini, ball search. Druga miza: `node tools/pinball-bot.mjs bozic 200` (register `tables/index.js` ima tudi `bozic`).

## Fizika in verzije

| Verzija | Sprememba | 100 bot iger (točke · igra · žoga · drain po sredini) |
|---|---|---|
| f1 | ALU PINBALL 2.0 | 22,2 mio · 564 s · 145 s · 59,2 % |
| f2 | fiksni korak 1/720 s z akumulatorjem (prej se je korak prilagajal frame-u → drugačna fizika pri 75/165 Hz) | enako kot f1 (pri 60 Hz bit za bitom) |
| f3 | guma mirnega flipperja: `e = 0,40 / (1 + v / 1500)` — počasna žogica odskoči kot prej, hitra na dvignjenem flipperju »umre« (live catch) | 25,1 mio · 544 s · 138 s · 59,3 % |

Vsaka sprememba fizike: nova `PHYSICS_VERSION` v `engine/config.js`, `node games/pinball/tests/golden.mjs --update`, statistika pred/po v
`PROGRESS.md`, ločen commit. Lestvica se ob tem začne na novo (`seed`).

## Mapa strelov Alu mize (fizika f3)

`node tools/pinball-shots.mjs alu --korak=1` — 1764 vzorcev. Okno = skupni čas (ms), v katerem pritisk zadene strel; najdaljše = najdaljši
neprekinjen del. Žogica iz inlana: čas od −120 do +380 ms okoli prihoda na flipper; cradle: od spusta 0–380 ms.

| flipper | začetek | strel | okno skupaj (ms) | najdaljše okno (ms) | vrnitev žogice (število vzorcev) | hitrost (px/s) |
|---|---|---|---:|---:|---|---:|
| levi | iz inlana | code review | 66 | 39 | desni flipper 48, levi flipper 16, ujeta 2 | 1826 |
| levi | iz inlana | B·U·G | 18 | 3 | levi flipper 9, ujeta 5, desni flipper 4 | 1503 |
| levi | iz inlana | IMPOL FT orbit | 17 | 6 | ujeta 7, desni flipper 6, levi flipper 4 | 1406 |
| levi | iz inlana | A·L·U kanali | 11 | 4 | desni flipper 6, levi flipper 5 | 0 |
| levi | iz inlana | pop bumperji | 8 | 3 | levi flipper 7, desni flipper 1 | 0 |
| levi | iz inlana | IMPOL LLT livarna | 3 | 1 | ujeta 3 | 1662 |
| levi | cradle | code review | 84 | 50 | desni flipper 46, levi flipper 37, ujeta 1 | 2221 |
| levi | cradle | B·U·G | 20 | 4 | desni flipper 19, levi flipper 1 | 839 |
| levi | cradle | pop bumperji | 11 | 3 | desni flipper 9, levi flipper 2 | 0 |
| levi | cradle | IMPOL LLT livarna | 7 | 2 | ujeta 7 | 1432 |
| desni | iz inlana | code review | 71 | 39 | levi flipper 42, desni flipper 26, ujeta 2, outlane levo 1 | 1840 |
| desni | iz inlana | IMPOL FT orbit | 26 | 21 | desni flipper 18, levi flipper 7, ujeta 1 | 2276 |
| desni | iz inlana | spinner | 13 | 4 | levi flipper 10, desni flipper 3 | 0 |
| desni | iz inlana | B·U·G | 9 | 3 | desni flipper 8, levi flipper 1 | 1047 |
| desni | iz inlana | IMPOL PCP rampa | 8 | 3 | levi flipper 8 | 2100 |
| desni | iz inlana | pop bumperji | 6 | 3 | levi flipper 3, desni flipper 3 | 0 |
| desni | iz inlana | IMPOL LLT livarna | 1 | 1 | ujeta 1 | 1596 |
| desni | iz inlana | A·L·U kanali | 1 | 1 | desni flipper 1 | 0 |
| desni | cradle | code review | 91 | 50 | levi flipper 49, desni flipper 41, ujeta 1 | 2143 |
| desni | cradle | B·U·G | 79 | 28 | desni flipper 37, levi flipper 37, ujeta 5 | 1199 |
| desni | cradle | pop bumperji | 28 | 12 | desni flipper 18, levi flipper 10 | 0 |
| desni | cradle | IMPOL FT orbit | 15 | 11 | desni flipper 14, ujeta 1 | 952 |

**Kaj kaže:** code review je najlažji strel z obeh flipperjev (39–50 ms), desni flipper ima dobro okno za orbit (21 ms) in edini
zadene rampo (3 ms — ozko, rampa je težak strel), livarna je skoraj nedosegljiva neposredno (1–2 ms; v igri jo žogica najde
po odboju). Desni cradle dobro zadene B·U·G (28 ms). Za drugo mizo (prompt 23) naj imajo veliki streli okno ≥ 25 ms.

## Prilagajanje

V `src/tables/alu/config.js`:

- `CFG.naslov`, `CFG.podnaslov`, `CFG.firmaA`, `CFG.firmaB`, `CFG.opomba` — besedila;
- `CFG.imena` — imena podjetij na strelih in v sporočilih; `CFG.logotipi = false` izklopi logotipe (povsod ostane tekst);
- `CFG.sporocila` — sporočila jedra (začetek, ball save, ball search);
- `CFG.skillShot`, `CFG.steviloZogic`, `CFG.ballSaveSek`, `CFG.multiballSaveSek`, `CFG.wizardSaveSek`;
- `CFG.comboOkno`, `CFG.rampZaMisijo`, `CFG.orbitZaExtraBall`, `CFG.reviewZaMystery`, `CFG.spinZaKickback` — ravnotežje;
- `MODES` — cilji, časi in nagrade misij. Kakovost izrisa: `QUALITY` v `src/engine/config.js`.

Fizika (`PHYS`, `BR`, `STEP`, `MAXV` v `src/engine/config.js`) je uglašena — spreminjaj z drsniki v `?debug=1`, nato po pravilih zgoraj.

V konzoli brskalnika je na voljo `__pinball` (igra, miza, renderer …) in `__pinball.snap()` (posnetek mize v polni ločljivosti).
