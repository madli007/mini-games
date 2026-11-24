# Smučarski skoki (`games/skoki/`)

Zalet, odriv v pravem trenutku, let, ki ga loviš z miško, in telemark. Deterministična 2D fizika, 2,5D izris
(Three.js 0.160), prava pravila točkovanja, veter, ghosti. 1. in 2. faza od treh (`prompts/11-skoki.md`, `prompts/12-skoki-tekma.md`; naslednja: `29-skoki-prave-skakalnice.md`, `13-skoki-pokal.md`).

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
| Zajček (K20/HS24) | 0.3 | 17.6 m | 2 % | 0 % | 0 % | 56 % | 100.2 | 41.6 km/h |
| Zajček (K20/HS24) | 0.7 | 18.9 m | 0 % | 0 % | 0 % | 80 % | 105.9 | 41.7 km/h |
| Zajček (K20/HS24) | 1.0 | 19.5 m | 0 % | 0 % | 0 % | 100 % | 107.0 | 41.7 km/h |
| Brezova (K60/HS68) | 0.3 | 57.0 m | 2 % | 30 % | 0 % | 56 % | 105.5 | 70.8 km/h |
| Brezova (K60/HS68) | 0.7 | 62.9 m | 0 % | 92 % | 0 % | 80 % | 120.7 | 70.8 km/h |
| Brezova (K60/HS68) | 1.0 | 65.3 m | 0 % | 100 % | 0 % | 100 % | 125.8 | 70.9 km/h |
| Bistra (K95/HS106) | 0.3 | 85.8 m | 2 % | 16 % | 0 % | 60 % | 95.9 | 86.7 km/h |
| Bistra (K95/HS106) | 0.7 | 98.4 m | 0 % | 86 % | 0 % | 82 % | 122.5 | 86.8 km/h |
| Bistra (K95/HS106) | 1.0 | 102.9 m | 0 % | 100 % | 0 % | 100 % | 131.4 | 86.8 km/h |
| Sipina (K105/HS117) | 0.3 | 93.1 m | 2 % | 16 % | 0 % | 60 % | 93.1 | 89.3 km/h |
| Sipina (K105/HS117) | 0.7 | 107.9 m | 0 % | 78 % | 0 % | 80 % | 120.7 | 89.4 km/h |
| Sipina (K105/HS117) | 1.0 | 113.2 m | 0 % | 100 % | 0 % | 100 % | 130.4 | 89.4 km/h |
| Reflektor (K120/HS134) | 0.3 | 104.3 m | 2 % | 16 % | 0 % | 60 % | 87.7 | 93.9 km/h |
| Reflektor (K120/HS134) | 0.7 | 123.8 m | 0 % | 78 % | 0 % | 80 % | 122.7 | 93.9 km/h |
| Reflektor (K120/HS134) | 1.0 | 130.8 m | 0 % | 100 % | 0 % | 100 % | 135.5 | 93.9 km/h |
| Orlova (K125/HS140) | 0.3 | 107.9 m | 2 % | 16 % | 0 % | 60 % | 86.0 | 95.2 km/h |
| Orlova (K125/HS140) | 0.7 | 129.0 m | 0 % | 80 % | 0 % | 80 % | 123.0 | 95.2 km/h |
| Orlova (K125/HS140) | 1.0 | 136.6 m | 0 % | 100 % | 0 % | 100 % | 136.9 | 95.2 km/h |
| Orlovo gnezdo (K200/HS240) | 0.3 | 130.1 m | 2 % | 8 % | 2 % | 58 % | 96.0 | 106.0 km/h |
| Orlovo gnezdo (K200/HS240) | 0.7 | 197.4 m | 2 % | 46 % | 8 % | 64 % | 170.2 | 106.1 km/h |
| Orlovo gnezdo (K200/HS240) | 1.0 | 244.3 m | 0 % | 100 % | 100 % | 46 % | 220.5 | 106.1 km/h |
| Mirno morje (K150/HS180) | 0.3 | 141.3 m | 2 % | 24 % | 0 % | 60 % | 99.4 | 49.3 km/h |
| Mirno morje (K150/HS180) | 0.7 | 149.3 m | 0 % | 68 % | 0 % | 82 % | 114.5 | 49.3 km/h |
| Mirno morje (K150/HS180) | 1.0 | 151.3 m | 0 % | 100 % | 0 % | 100 % | 118.6 | 49.3 km/h |

Cilji (`balanceTarget` v `balance.js`, test »cilji uravnoteženja«): 0,3 → K − 22 % … K − 5 %, ≤ 30 % padcev · 0,7 → K ± 5 m, ≤ 10 % padcev ·
1,0 → HS − 6 … HS + 2, čez HS < 50 %. **Letalnica** (K ≥ 170): vsaka stopinja nagiba stane ~20 m, razpon spretnosti je širši kot v resnici —
0,3 → K − 40 % … K − 5 %, 1,0 → HS − 6 … HS + 6 in ≤ 20 % padcev (najboljši pogosto preletijo HS; v tekmi žirija zniža zalet).
**Luna** (brez zraka): daljavo določa le odriv, zato 1,0 → K … HS + 2. Mini skakalnica ima majhne razlike (kratek let).

Z naključnim vetrom (`--wind`) se povprečja premaknejo za +1–3 m, spretnost 1,0 pa preskoči HS v ~36 % skokov in pade v
~20 % (pristanek daleč za HS). Čelni veter +2 m/s na Orlovi podaljša skok za ~12 m (test: 9–16 m).

Cilj za spretnost 0,3 (»~K − 15 m«) je na mali in srednji skakalnici sorazmeren (K − 5 … 22 %): manjše hitrosti pomenijo
manjši vpliv napak na daljavo, zato je razpon na Brezovi le ~9 m. Na Orlovi je 0,3 pri K − 18 m.

## 2. faza: tekma, lokalna tekma, dnevni izziv, nove skakalnice

### Meni
Načini: **Trening**, **Rekord skakalnice**, **Tekma** (soba), **Lokalna tekma** (ena naprava), **Dnevni izziv** in zaslon
**Moji skakalci**. Skakalnice so v skupinah (`hills/index.json` → `groups`, v JSON-u skakalnice `group`, privzeto `trening`);
skupina »Prave skakalnice« (`prompts/29-skoki-prave-skakalnice.md`) se doda le z novim vnosom v `groups` in skakalnicami z
`"group": "prave"` — meni jih nariše sam.

### Tekma s prijatelji (`match.js`, 2–10 ljudi)
1. Host (TV/prenosnik ali telefon) v meniju izbere **Tekma → Ustvari sobo**. Na TV-ju obkljukaj **»Ta naprava je samo zaslon (TV)«**
   (ali `?tv=1`, ali gumb »📺 TV pogled« v lobbyju): TV ne skače, pokaže veliko sliko, lestvico desno in trak »na vrsti / naslednji«.
2. Ostali skenirajo QR ali vpišejo kodo (tudi `?room=KODA`). Vsak skače s svojega zaslona.
3. Host nastavi: skakalnico (ali naključno), format (ena serija / dve seriji / poskusna + dve), rez za 2. serijo, veter
   (*enak za vse* — isti profil iz seeda serije; *spremenljiv* — seed serije + štartna številka, s kompenzacijo; *brez*),
   zaletno mesto (samodejna žirija ali ročno), sproščen način, bote (0–20, Začetniki / Mešano / Svetovni razred,
   izmišljena imena ali **Moji boti**) in ekipe (2–4, naključno; seštevek ekipe v rezultatih).
4. Med skokom vsi gledajo **replay v živo**: skakalec pošilja spremembe vnosa (`room.send('in')`, paket na ~100 ms),
   gledalci simulirajo isti skok z zamikom ~300 ms in se ob manjkajočem paketu ustavijo (»… čakam na podatke«).
   Po pristanku skakalec doda potezo z vsemi vnosi, **host ponovi simulacijo** in zapiše uradni rezultat
   (`room.setState` z `expectedVersion`); neujemanje = opozorilo v konzoli, velja hostov izračun.
5. Po vsakem skoku: rezultatna kartica, sprotna lestvica s puščicami ↑↓, sporočilo žirije; naslednji ima zeleno črto
   »za vodstvo« in lower-third »za vodstvo potrebuje 128,5 m« (`distForLead`, slog 54, veter = povprečje profila serije).
6. Reakcije gledalcev 🔔 👏 😱 🔥 (1 na 2 s na igralca, tudi pri prejemniku) letijo čez zaslon skakalca in TV-ja.
7. Konec: razglasitev (oder, fanfara, konfeti), `ui.results` s seštevkom obeh serij in posebnimi nagradami
   (najdaljši skok, najlepši slog, najbolj nesrečen veter, kralj padcev, največji napredek v 2. seriji).

**Pravila:** 1. serija v naključnem vrstnem redu iz seeda sobe, 2. serija obratno po vmesni razvrstitvi (rez: najboljših N,
izenačeni na meji gredo vsi), poskusna serija ne šteje. Po zeleni luči 10 s za štart, sicer DSQ (sproščeno: na konec serije);
skupaj 90 s na skakalca (DNF ali na konec). **Žirija:** začne pri privzetem mestu skakalnice; ko kdo pristane čez 95 % HS (tudi
pri padcu), zalet za naslednje zniža za 1 (čez HS + 3 m za 2); kompenzacija velja glede na začetno mesto serije; vsaka serija
začne znova. **Skakalnice v tekmi:** host lahko izbere skakalnico, ki jo ima odklenjeno **host ali vsaj en prisoten igralec**
(odklepe sporočajo v sporočilu `hello`).

**Odpornost:** prenos hosta (nov host prebere stanje in poteze; skok v teku počaka 15 s na potezo, nato dovoli ponovitev),
osvežitev strani (stanje + poteze, klik na vrstico lestvice = replay preteklega skoka; skakalec na vrsti dobi skok znova),
odhod skakalca med skokom (po 20 s DNF ali na konec), odhod pred skokom (DNS »odšel«), pridružitev med tekmo = gledalec.

**XP in hub:** 30 za končano tekmo, +60 za zmago z vsaj 2 človekoma, +20 za oder; `reportGame({ won: 1. med ljudmi, players: ljudje })`;
dogodki `skoki:tekma`, `skoki:zmaga`, `skoki:oder`, `skoki:letalnica`. Boti ne dobijo XP in ne odklepajo dosežkov.

### Lokalna tekma in Moji skakalci
- **Moji skakalci:** do 60 (ime, zastava, barvi dresa in čelade, človek ali bot s spretnostjo 0–1 in značajem: uravnotežen,
  agresiven odriv, varen pristanek, nestanoviten). Dodaj / uredi / podvoji / razvrsti / izbriši. Shranjeno lokalno
  (`skoki:jumpers:<profil>`), na strežnik ne gre. **Izvoz/uvoz:** koda `SKOKI1:…` ali datoteka JSON (≤ 20.000 znakov,
  neznana polja se zavržejo, neveljavni vnosi izpustijo). Igra ne ponuja imen pravih skakalcev; vgrajeni boti imajo 43 izmišljenih imen.
- **Lokalna tekma:** izbereš skakalce (ali vse), skakalnico, format, veter, žirijo; ljudje skačejo po vrsti (»Na vrsti: …,
  pritisni za štart«), boti sami (v živo, 2× ali preskočeno). Ista logika (`sport/competition.js`, `contest.js`).
  Statistika po skakalcu (skoki, padci, najdaljši po skakalnici, zmage, stopničke) je tabela »sezone tvoje lige«.
- Lokalna tekma ne gre na lestvice in ne daje ghostov; `reportGame({ won: zmagal je človek, players: število ljudi,
  score: najboljši človek })`, **XP kot pri treningu** (brez XP za tekmo).

### Dnevni izziv
`dailyPick(hub.dailySeed())` izbere skakalnico (vse, tudi še zaklenjene — skakalnica dneva je odprta za vse), veter dneva
(stalen −2 … +2 m/s z rahlimi sunki) in pogoj: Sneženje (trenje ×1,25, megla, sneg), Noč pod reflektorji, Sunkovit veter
(sunki ×2), Nizko zaletno mesto (−3), Samo telemark šteje (pristanek na obe nogi = slog padca), Luna (le na Mirnem morju).
Trije poskusi (porabi se ob štartu), šteje najboljši; nato trening. Lestvica dneva (`submitScore(točke × 10, { seed })`),
ghost vodilnega dneva in prijatelja (klik na vrstico; Supabase: `skoki_ghosts` z levelom `d-YYYYMMDD`). Po treh poskusih
`reportGame({ daily: true })` (dogodek `daily:skoki`), +20 XP, dosežek »Teden izzivov« (7 dni zapored).

### Nove skakalnice (skupina Trening, vse izmišljene)
| Skakalnica | K / HS | Posebnost | Odklep |
|---|---|---|---|
| Zajček | K20 / HS24 | otroška, plišasta publika | odprta |
| Sipina | K105 / HS117 | umeten sneg sredi peska, palme, **toplotni stebri** (`physics.thermals`: navpični sunki na stalnih mestih) | čez K na Orlovi |
| Reflektor | K120 / HS134 | noč, reflektorji s stožci svetlobe, sneg, lučke telefonov | čez K na Orlovi |
| Orlovo gnezdo | K200 / HS240 | **letalnica**: base 120, vrednost metra 1,2, `physics.liftScale` 1,045, let ~8 s, kamera bolj oddaljena, pomlad, 30.000 gledalcev | čez HS na Orlovi |
| Mirno morje | K150 / HS180 | **Luna**: `physics.gravity` 1,62, `noAir` (brez vzgona, upora in vetra — nagib šteje le za pristanek), zvezde, Zemlja; ločena lestvica, ne šteje v pokal (`noCup`) | čez K na letalnici |

Fizika skakalnice (`physics` v JSON-u, validator pozna le `gravity`, `airDensity`, `liftScale`, `pushScale`, `noAir`, `thermals`):
skakalnice brez tega bloka računajo **natanko kot v 1. fazi** (test s fiksturami `tests/fixtures/skoki-ref.json`).
Meje pristanka so v »zemeljskih« metrih (`hEq` z `P.g`). `paramsVersion` ostane 3.

### Moduli 2. faze
| Modul | Vsebina |
|---|---|
| `sport/competition.js`, `sport/live-replay.js` | splošno tekmovanje in tok vnosov (glej `sport/README.md`) |
| `contest.js` | skakalni del: simulacija iz vnosov, veter serije, žirija, za vodstvo, nagrade, dnevni izbor, odklepi, XP |
| `jumpers.js` | lastni skakalci, izvoz/uvoz, statistika, izmišljeni boti |
| `match.js` | DOM: soba, host, gledanje, reakcije, TV, lokalna tekma, Moji skakalci |

Razvojni parametri: `?tv=1`, `?bots=9` (hitra lokalna tekma: ti + 9 botov), `?fast=1` (boti brez replaya), `?test=1`
(`window.__skoki` brez strani z drsniki: `skipRed()`, `fastForward()`, `timeScale`), orodje `node tools/skoki-tune.mjs <id>`.
