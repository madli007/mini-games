# Smučarski skoki (`games/skoki/`)

Zalet, odriv v pravem trenutku, let, ki ga loviš z miško, in telemark. Deterministična 2D fizika, 2,5D izris
(Three.js 0.160), prava pravila točkovanja, veter, ghosti. 1. faza od treh (`prompts/11-skoki.md`; naslednji:
`12-skoki-tekma.md`, `13-skoki-pokal.md`).

## Kontrole

Skok se upravlja **samo z miško** (na telefonu z dotikom), kot pri klasičnih računalniških skokih. Meni desnega klika
je na igralni površini onemogočen; preslednica in puščice skoka ne upravljajo.

| Faza | Miška | Telefon |
|---|---|---|
| Štart (zelena luč) | klik | tap |
| Zalet | — (skakalec se sam spusti v nizko držo) | — |
| Odriv (konec mize) | **levi + desni gumb hkrati** (en gumb ni odriv) | dva prsta hkrati |
| Let | skakalec se **sam nagne** v letalni položaj; miška gor (nazaj) / dol (naprej) ga popravlja | vlečenje gor/dol |
| Telemark | **oba gumba** tik pred tlemi | dva prsta |
| Dve nogi | en gumb | en tap |

Brez premikanja miške skakalec pristane pred K-točko brez padca (Orlova ~100 m); rahel nagib naprej (−5°) ga nese do K,
preveč naprej pa na nos.

`R` = nov skok, `Enter` = replay, `Esc`/`P`/⏸ = pavza (tudi samodejno, ko zavihek ni viden; tedaj utihne tudi zvok).
Merilnik desno pokaže napadni kot (bela črtica) in zeleno okno; rumena puščica je ciljni nagib (telo mu sledi z zamikom).
Prvi trije uspešni skoki na napravi imajo namige na zaslonu.

**Trening ne šteje rekordov:** lokalni rekord (ghost »Moj rekord«, zelena črta, 🏅 v meniju, »Osebni rekord!«) in
lestvica se posodobijo le v »Rekordu skakalnice«.

**Oznake na doskočišču:** črte vsakih 5 m (vsakih 10 m debelejše, s številkami ob obeh robovih), P-točka (zelena),
K-točka (rdeča), HS (modra) — vse čez celo širino, s količki in tablami na obeh straneh; barvni pasovi ob robovih
(P → K zelen, K → HS rdeč, za HS moder) in zelena črta tvojega rekorda.

## Moduli

| Modul | Vsebina (brez DOM-a, razen kjer je navedeno) |
|---|---|
| `dmath.js` | deterministični sin/cos/atan2 (polinomi), tabela z interpolacijo, hash/šum, PRNG |
| `hill.js` | gradnja profila iz parametrov, `validateHill`, vrednost metra in faktorji vetra po K |
| `wind.js` | veter iz seeda (`off` / `const` / `random`): povprečje, sprememba vzdolž doskočišča, sunki |
| `physics.js` | simulacija skoka (`createJump`, `simulate`, `makeClock`), fiksni korak 1/120 s |
| `scoring.js`, `judges.js` | točke (daljava, slog, veter, zaletno mesto), 5 sodnikov, zapis za lestvico |
| `bot.js`, `balance.js` | bot s spretnostjo 0–1 (`createBot({ skill, seed })`, `bot.input(state)`), statistika botov |
| `ghost.js`, `replay.js` | zapis/stiskanje/predvajanje vnosov; posnetki za izris, rezi kamere v replayu |
| `texts.js` | komentator (≈ 60 vrstic v 17 skupinah) |
| `input.js`, `audio.js`, `game.js`, `debug.js`, `render/` | DOM: vnos, WebAudio, igra, stran z drsniki, Three.js |

Razvojni parametri: `?hill=<id>` (takoj trening), `?debug=1` (stran z drsniki), `?bot=0.7` (skače bot, zanka se ponavlja),
`?q=low|med|high`, `?offline=1`.

## Fizika in parametri (`physics-params.json`)

Edini vir resnice za igro, teste, orodja in stran z drsniki. `paramsVersion` gre v vsak ghost; ob spremembi fizike, ki
spremeni skoke, ga povečaj (stari ghosti se potem ne predvajajo).

- **Zalet** (`inrun`): 1D po profilu smučine: gravitacija, trenje (`mu`, tudi centripetalno v prehodu), zračni upor
  (`cdaCrouch` ob držanju, `cdaUp` brez), malo vpliva vetra. Vsako zaletno mesto ≈ 0,55–0,75 km/h.
- **Odriv** (`takeoff`): oba gumba hkrati (vnos `btn: 2`), napaka tajminga `err` (s, − = prezgodaj) → kakovost: ±25 ms ✨ (q = 1), ±60 ms dobro, nato do `minQ`.
  Navpični impulz `vPush × q` pravokotno na mizo in vrtenje naprej (`spin`, prepozno še `spinLate × err`).
  Brez odriva čez rob = »padeš z mize« (šibek odriv po `lateLimit`).
- **Let**: stanje (x, y, vx, vy, nagib, kotna hitrost). Relativni veter: čelni veter piha **vzdolž pobočja** (zato ima tudi
  komponento navzgor, `wind.updraft`). `α = nagib − smer leta`; `L = ½ρv²·CL·A(α)`, `D = ½ρv²·CD·A(α)`, navor `CM(α)` —
  vse tri so **tabele** (`aero.lift/drag/moment`), `liftScale` itd. so skupni faktorji. Ciljni nagib = smer leta z zamikom (`body.autoLag`) + `body.autoAlpha` + popravek iz vnosa; telo mu
  sledi s PD regulatorjem z omejenim navorom (`body.kp/kd/maxTorque/inertia`). Preveč naprej (`α < noseCrash`) = padec na nos,
  preveč nazaj = velik upor (`α > backCrash` = padec nazaj).
- **Pristanek** (`landing`): pritisk pred tlemi začne pripravo (manj vzgona, poravnava smuči s pobočjem s `prepRate`).
  Spust pred stikom = telemark (kakovost po času med pritiskom in stikom, ideal `teleIdeal`, okno `teleMin`–`teleMax`),
  držanje čez stik = dve nogi. Brez pritiska skakalec tik pred tlemi refleksno pristane trdo (`none`); klik prepozno = padec.
  Padec/dotik iz ekvivalentne višine padca `hEq = vₙ²/2g` (meje `hTele`, `hTwo`, `hNone`, ×`touchMargin`) in kota smuči
  glede na pobočje (`pitchOk`, `pitchTouch`). Za HS se doskočišče izravna, zato `hEq` hitro raste.
- **Daljava** = lok po profilu doskočišča od točke pod robom mize do stika, zaokroženo navzdol na 0,5 m.
- **Determinizem**: v simulaciji le `dmath.js`, brez `Math.random/Date/performance`. Isti vnosi = bit za bit isti skok
  (test), neodvisno od FPS izrisa (akumulator `makeClock`).

## Format skakalnice (`hills/<id>.json`, vrstni red v `hills/index.json`)

```jsonc
{ "id": "orlova", "name": "Orlova", "k": 125, "hs": 140, "meterValue": 1.8, "base": 60,
  "windFactors": { "head": 10.86, "tail": 13.14 },   // točke na m/s (hrbtni = 1,21 × čelni)
  "gateFactor": 6.5,                                 // točke na zaletno mesto
  "gates": { "count": 24, "default": 13, "spacing": 1.1 },
  "inrun":   { "gamma": 35, "alpha": 11, "r1": 105, "t": 6.6, "e2": 35.8 },   // naklon zaleta, naklon in dolžina mize, radij prehoda, razdalja 1. mesta nad prehodom
  "landing": { "s": 3.2, "b0": 5, "beta": 35, "pArc": 100, "lArc": 142, "r2": 105, "outrunAngle": 1.5, "outrunLength": 100 },
  "theme":   { "sky": {…}, "fog": {…}, "env": "gore", "trees": 0.8, "crowd": 1, "snowfall": 0.15, "mountains": 1.3, "boards": […] } }
```

Profil se izračuna (`buildHill`): miza → prehod (r1) → ravni zalet; doskočišče: grbina (kot od `b0` do `beta` do loka
`pArc`) → strmina do `lArc` (≈ HS) → prehod (r2) v iztečišče → protiklanec. `validateHill` preveri obvezna polja,
K < HS, vrednost metra in base po pravilih, smiselne kote, monoton profil brez lukenj, mizo nad doskočiščem.

**Nova skakalnica:** kopiraj JSON, nastavi K/HS (`meterValueFor`, `baseFor`, `windFactorsFor` v `hill.js` dajo vrednosti),
dodaj v `hills/index.json`, nato uglaši `inrun.e2` (hitrost) in `gates.default` z `node tools/skoki-balance.mjs`, da so
cilji izpolnjeni (test »cilji uravnoteženja«). `gateFactor` ≈ metri na mesto × vrednost metra. V `supabase/games/skoki.sql`
dodaj vrstico v `skoki_hills` z `maxPoints(def)` (test preveri).

## Točkovanje

- Daljava: `base` (60, letalnice 120) + (daljava − K) × vrednost metra, nikoli negativno.
- Slog: 5 sodnikov (0–20, korak 0,5), najvišja in najnižja se ne štejeta. Odbitki: nemiren let (Σω²), mahanje z rokami
  (navor blizu meje), slab odriv, pristanek (telemark 0,5 + kakovost, dve nogi 1,5, trd 4, dotik 5, padec 9), trd udarec.
  Vsak sodnik ima deterministično občutljivost in šum iz seeda skoka.
- Veter: povprečje čelne komponente v 5 točkah leta; čelni odšteje `head × m/s`, hrbtni prišteje `tail × m/s`.
- Zaletno mesto: (privzeto − uporabljeno) × `gateFactor`.
- **Rekord skakalnice je v metrih:** od treh skokov šteje najdaljši brez padca (enako dolge loči točkovanje; če so vsi
  trije padci, rekorda ni). Lestvica (`hub.submitScore`, seed `rekord:<id>`) hrani celo število
  **daljava × 2 × 10000 + točke × 10** (`encodeBoard`) — razvrstitev po daljavi, prikaz »131,5 m · 142,3 t«.

## Ghost

`{ pv, hill, gate, wind: { mode, seed, speed }, ticks, dist, total, changes: [[tick, btn, pitch×2], …] }` — zapisane so le
spremembe vnosa, varint + zigzag → base64 (tipično 0,3–1,5 KB, meja 4 KB). Predvajanje = nova simulacija z istimi vnosi.
Lokalno se shrani najdaljši skok brez padca iz »Rekorda skakalnice« (trening ne šteje) na skakalnico in profil (`skoki:best:<userId>:<id>`; stari ključi brez profila se ob prvem zagonu preselijo k trenutnemu profilu); »Rekord skakalnice« shrani najboljši
skok tudi prek `hub.saveGhost({ level, timeMs: encodeBoard(...), data, order: 'desc' })` (Supabase: `skoki_ghosts`).
Ghost prijatelja: klik na vrstico lestvice v meniju.

## Uravnoteženje (`node tools/skoki-balance.mjs`, 50 skokov na celico)

Brez vetra:

| Skakalnica | Spretnost | Povp. daljava | Padci | Čez K | Čez HS | Telemark | Povp. točke | Hitrost |
|---|---|---|---|---|---|---|---|---|
| Skakalnica | Spretnost | Povp. daljava | Padci | Čez K | Čez HS | Telemark | Povp. točke | Hitrost |
| Brezova (K60/HS68) | 0.3 | 57.0 m | 2 % | 30 % | 0 % | 56 % | 105.5 | 70.8 km/h |
| Brezova (K60/HS68) | 0.7 | 62.9 m | 0 % | 92 % | 0 % | 80 % | 120.7 | 70.8 km/h |
| Brezova (K60/HS68) | 1.0 | 65.3 m | 0 % | 100 % | 0 % | 100 % | 125.8 | 70.9 km/h |
| Bistra (K95/HS106) | 0.3 | 85.8 m | 2 % | 16 % | 0 % | 60 % | 95.9 | 86.7 km/h |
| Bistra (K95/HS106) | 0.7 | 98.4 m | 0 % | 86 % | 0 % | 82 % | 122.5 | 86.8 km/h |
| Bistra (K95/HS106) | 1.0 | 102.9 m | 0 % | 100 % | 0 % | 100 % | 131.4 | 86.8 km/h |
| Orlova (K125/HS140) | 0.3 | 107.9 m | 2 % | 16 % | 0 % | 60 % | 86.0 | 95.2 km/h |
| Orlova (K125/HS140) | 0.7 | 129.0 m | 0 % | 80 % | 0 % | 80 % | 123.0 | 95.2 km/h |
| Orlova (K125/HS140) | 1.0 | 136.6 m | 0 % | 100 % | 0 % | 100 % | 136.9 | 95.2 km/h |

Z naključnim vetrom (`--wind`) se povprečja premaknejo za +1–3 m, spretnost 1,0 pa preskoči HS v ~36 % skokov in pade v
~20 % (pristanek daleč za HS). Čelni veter +2 m/s na Orlovi podaljša skok za ~12 m (test: 9–16 m).

Cilj za spretnost 0,3 (»~K − 15 m«) je na mali in srednji skakalnici sorazmeren (K − 5 … 22 %): manjše hitrosti pomenijo
manjši vpliv napak na daljavo, zato je razpon na Brezovi le ~9 m. Na Orlovi je 0,3 pri K − 18 m.
