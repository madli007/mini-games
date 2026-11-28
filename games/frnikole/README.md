# Dirka frnikol (`games/frnikole/`)

Solo »Dirkalni dan« proti botom: osem steklenih frnikol drvi po dolgi progi navzdol. Pred vsako dirko staviš točke
(zmagovalec, stopničke, dvoboj), med dirko imaš 3 sunke, s katerimi svojo frnikolo porineš naprej ali tujo vstran.
Pet dirk na dan; zmaga, kdor ima na koncu največ točk. Imena, proge, komentarji, grafika in zvok so naši.

Igra **uvaža** module Hrčkove krogle in Rušilca (nič ni kopirano): `../krogla/physics.js` (`makeBody`, `stepBody`,
`advanceWorld`, `groundY`, `STEP`), `../krogla/render.js` (`Renderer`, `QUALITY`, `detectQuality`) z `render/`,
`../krogla/audio.js` (`Audio`), `../krogla/level.js` (`TILE_CHARS`, `heightChar`), `../krogla/themes.js`,
`../rusilec/collide.js` (`collideAll`). Krogla in Rušilec sta nespremenjena (le povezava v meniju).

## Kontrole

| Naprava | Izbira frnikole | Sunek | Kamera |
|---|---|---|---|
| Namizje | klik na frnikolo, `1`–`8`, klik v seznamu vrstnega reda | `Q` pomoč · `E` bočni sunek (ali gumba) | `C` (Vodilni → Moja → Pregled) |
| Telefon | vrstica 8 barvnih gumbov spodaj | velika gumba POMOČ / BOČNO | gumbi nad frnikolami; 📋 = vrstni red |

`⏩×1/×2` pospeši dirko (simulacija ostane ista — le več korakov na sličico). Pred ciljem, če je tesno, se izris
za trenutek upočasni (»foto finiš«). Gumbi so brez hover-only interakcij, `touch-action: manipulation`.

## Pravila

- **Dirkalni dan** = 5 dirk (`BET.RACES`), začetni kupček **1000 točk** (točke igre, niso kovanci huba).
- **Frnikole** (`day.js` → `MARBLES`, 16): ime (tožilnik za napise), barva, vzorec, osnovne lastnosti. Vsaka dirka izbere
  8 in jim da **formo**: `speed` (pogon v ravnini), `grip` (oprijem v zavojih), `mass` (masa: trki in sunki) v −1 … 1.
  `physOf` jih preslika v majhne razlike (pogon ±3,4 %, oprijem 3,1 ± 0,85 1/s, masa 1 ± 0,16). Kartica: opis
  (`formText`, npr. »hitra v ravnini, slaba v zavojih«) in puščice (`formArrows`, ▲ / – / ▽).
- **Kvote** (`odds.js`): 30 tihih simulacij iste postave na isti progi z drugim seedom (drug startni red, linije, izbire na
  razcepih). Iz pogostosti: zmaga → `0,85 / p` (1,5–12), stopničke (1,1–5), dva **dvoboja** z najbolj izenačenima
  frnikolama (~1,8). Vsota 1/kvota ≈ 1,2 (provizija). Računa se po kosih (UI ostane odziven, ~0,4 s na namizju).
- **Stave** (`bets.js`): do 3 na dirko, najmanj 10, največ ves kupček; izplačilo `floor(vložek × kvota)`.
  Ista stava dvakrat ni dovoljena. Kupček pod 10 → enkrat na dan **posojilo 100** (na koncu se odšteje, `finalScore`).
- **Sunki** (`race.js`): 3 na udeleženca na dirko, ohlajanje 1,5 s. Pomoč: +3,4 m/s v smeri proge. Bočni: 5,2 m/s / masa
  proti bližnjemu robu (+ malo navzgor) — lahko vrže s proge ali v zid. Vsak sunek je v killfeedu, z valom in zvokom.
- **Padec s proge** (pod tlemi poti za 1,6 m) ali **zataknjena** frnikola (3,5 s brez napredka) → po 2 s na zadnjo
  kontrolno točko. Padec na tvegani (glavni) poti razcepa → frnikola naslednjič izbere stransko pot.
- **Cilj:** vrstni red po prečkanju ciljne črte (čas z delom koraka), po prvem v cilju še 18 s, nato ostali po napredku.
  Foto finiš = 1. in 2. manj kot 0,08 s narazen.
- **Konec dneva:** `ui.results` (igralec + boti), `hub.submitScore` (samo prvi dnevni poskus), `hub.reportGame({ won: prvi
  med vsemi, players: 1 + boti, score, daily })`, `hub.awardXp(20 + 10 × zadeta stava na zmagovalca, ≤ 80)`.
- **Dnevni izziv:** `dayPlan(hub.dailySeed())` (proge — vsaka vsaj enkrat, nikoli ista dvakrat zapored —, postave, forma,
  5 botov in njihove osebnosti). Šteje **prvi začeti poskus dneva** (`frnikole:daily:<datum>` ob začetku — lokalno in online prek `cloud.js`, zato tudi na drugi napravi
  ali obstoječ rezultat na lestvici); ponovitve so trening. **Prosta igra:** naključen seed, 3–7 botov, brez lestvice.
- **Dosežki:** `outsider` (zadeta stava s kvoto ≥ 8), `trojna` (3 zadete v eni dirki), `saboter` (tvoj bočni sunek vrže
  favorita s proge in zmaga tvoja frnikola), `milijonar` (≥ 5000 na koncu dneva), `brez-sunka` (zmaga dneva brez sunka),
  `foto` (zadeta stava v foto finišu).
- **Naloge** (`games.json`): `play:frnikole`, `frnikole:kvota` (vrednost = kvota zadete stave, gte 5),
  `frnikole:tocke` (končni rezultat, gte 3000), `frnikole:stava` (×zadete stave, tedensko 15).

## Boti (`bots.js`)

Imena (14, slovenska, s spolom za glagole) in osebnosti. Stave `botBets(bot, { bank, odds, ids, seed })`, sunki
`botBrain(bot, { mine, target, seed })` → funkcija `(R) => sunek | null`, ki jo `stepRace` kliče vsakih 30 korakov.
Vse je deterministično iz seeda; boti imajo ista pravila (3 sunki, ohlajanje) in med svojimi sunki počakajo ≥ 4 s.

| Osebnost | Stave | Sunki |
|---|---|---|
| 🧐 Previdnež | favorit (8–12 %) + stopničke (12–18 %) | pomoč svoji, ko ni med prvima dvema |
| 🎲 Hazarder | 25–45 % na eno od treh najvišjih kvot, včasih še 10 % | pomoč svoji v drugi polovici, če je 2.–5. |
| 💞 Zvestoba | vedno svoja barva (`fav`); če je ni, majhna stava na stopničke | občasno pomoč svoji |
| 😈 Saboter | dvoboj + zmagovalec | bočni sunek frnikoli z največjo stavo vodilnega stavnika (tudi tebe), ko je v top 3 |
| 📊 Statistik | največja pričakovana vrednost (p × kvota) za zmago in stopničke + dvoboj | pomoč v zadnji tretjini |

## Proge in format (`tracks/NN-ime.json`)

Proga je **proga Hrčkove krogle** (isti `map`, `hmap`, ploščice in ovire; razumeta jo `createWorld` in `Renderer`), brez
zvezdic/medalj, z dodatki za dirko (`track.js` → `validateTrack`, `trackLevel`, `trackRoutes`):

```jsonc
{
  "id": "01-kamnolom", "name": "Kamnolom", "desc": "…", "look": "garden", "kind": "serpentine", "theme": { … },
  "target": [20, 40],                        // ciljno trajanje dirke (s)
  "size": [W, D], "map": [ … ], "hmap": [ … ],
  "path": [[x, z], …], "widths": [w, …],     // sredinska črta glavne proge in širina v vsaki točki
  "finish": 112,                             // indeks ciljne črte v path (za njim je iztok z zidom)
  "cps": [0, 2, 17, …],                      // kontrolne točke (indeksi v path), cps[0] = 0
  "splits": [{ "from": 84, "to": 98, "alt": [[x, z], …], "w": 3, "bias": 0.55, "name": "ozka polica" }],
  "grid": [[x, z] × 8],                      // startna mesta (2 vrsti po 4)
  "bumpers"/"spinners"/"springs"/"bowls"/"movers"/… : kot pri progah krogle
}
```

`trackRoutes` zgradi pot za vsako kombinacijo izbir na razcepih (ključ `'0'`/`'1'` …) z razdaljo po glavni progi
(`main`) za pošten vrstni red, višinami tal (`gy`) za zaznavo padca in kontrolnimi točkami. Frnikole krmilijo proti
točki 2 m naprej po svoji poti z lastnim bočnim zamikom (»linija«, iz seeda), oprijem duši bočno drsenje.

| # | Proga | Lokacija | Posebnosti |
|---|---|---|---|
| 1 | Kamnolom | vrt (kamnite barve) | široke serpentine, odbijači, stopnica, lijak 5 → 3, skok, razcep »ozka polica« |
| 2 | Kuhinja | kuhinja | vrtljiva plošča, razcep »žlica« (vzmet čez prepad), skleda, sirup (lepilo), led, lijak |
| 3 | Alu valjarna | tovarna | tekoči trakovi (naprej, nazaj in bočno), razcep »žleb« (trak proti smeri), stopnice |

### Kako dodati progo

1. V `tools/frnikole-tracks.mjs` dodaj `def({ id: '04-ime', name, look, theme, kind, target, desc }, () => { const T = new Track(); … return T; })`.
   Želvica: `go(n, { w, down, ch, rail })`, `turn('S')`, `drop(dh)`, `jump(gap, dh)`, `funnel(n, w0, w1)`,
   `split({ len, side, out, wMain, wAlt, bump, bias, name, mainCh, onMain })`, `cp()`, `goal()`, `startGrid()`, `wall()`,
   `addL('bumpers' | 'spinners' | 'springs' | 'bowls', f, s, {...})` (lokalno: naprej, desno), `paint(f0, f1, s0, s1, ch)`.
   Zavoji naj bodo ravni, skupen spust ≤ 17,5 m, vzporedni odseki dovolj narazen (zid ob zidu je v redu).
2. `node tools/frnikole-tracks.mjs --dump=4` izriše progo v ASCII (pot `*`, kontrolne točke `C`, cilj `F`, stranska pot `+`) z višinami.
3. `node tools/frnikole-tracks.mjs -v` zapiše JSON in `index.json` in preveri s tihimi simulacijami (80 z nevtralno formo +
   80 z naključno): (a) vse frnikole brez sunkov v cilju, (b) noben barvni / startni slot ne zmaga > 35 %, (c) povprečni
   čas zmagovalca v `target`. Izhod je zapisan v `PROGRESS.md`.
4. `node tests/run-node.mjs` — validator in »vse v cilju« za vse proge; v igri `?track=4` odpre progo takoj.

## Moduli

| Datoteka | Vsebina |
|---|---|
| `race.js` | čista simulacija: telesa krogle, krmiljenje po poti, oprijem, sunki (`applyNudge`, `nudgeState`), padci, kontrolne točke, razcepi, cilj, vrstni red (`standings`), dogodki, `runRace` (tiho) |
| `track.js` | format, `validateTrack`, `trackWorld`, `trackRoutes`, `trackLength`, `loadTracks` |
| `odds.js` | tihe simulacije (`simulate`, `addSim` po kosih) → kvote (`oddsFrom`, `computeOdds`, `overround`) |
| `bets.js` | stave, napake, obračun (`settle`), posojilo, končni rezultat, oznake |
| `bots.js` | osebnosti, imena, `botBets`, `botBrain`, `biggestStake`, `duelOdds` |
| `day.js` | frnikole, forma (`formArrows`, `formText`), `dayPlan(seed)` |
| `texts.js` | komentator (52 variant v 15 skupinah), killfeed sunkov |
| `view.js` | `RaceRenderer` (podrazred `Renderer`): steklene frnikole z vzorcem (canvas tekstura), imena, obroči, kamera (vodilni / moja / pregled), učinki, izbira s klikom |
| `sound.js` | `RaceAudio` (podrazred `Audio`): steklen klik trkov, sunek, udarec, padec, cilj, navijanje, stava |
| `game.js` | meni, stavnica, dirka v živo (fiksen korak, ×2, počasni posnetek pred ciljem), HUD, obračun, konec dneva, hub |

Razvojni parametri: `?track=N` (prosta igra, vseh 5 dirk na progi N), `?fast=1` (dirka brez izrisa; z `&auto` še
samodejna stava in naslednja dirka — cel dan v ~2 s), `?q=low|medium|high|ultra`, `?dev=1` (`window.__fr`,
`__fr.skip(n)` odsimulira n korakov). Samodejna nižja kakovost ob FPS < 40.

## Determinizem (osnova za multiplayer)

Simulacija uporablja le `rng` iz seeda (`shared/util.js`, isti kot `hub.rng`) in fiksni korak `STEP` (1/120 s). Sunek je
vnos `{ step, m, k: 'help' | 'hit', by }`; `R.log` je seznam vseh izvedenih sunkov. Isti seed + isti sunki ob istem koraku
= isti izid (test). Boti odločajo znotraj `stepRace` iz stanja dirke, zato se odzovejo na sunke igralcev enako na vseh
napravah (z istim pogonom JS — med brskalniki se `Math.sin` lahko razlikuje, zato bo v multiplayerju simuliral host).
