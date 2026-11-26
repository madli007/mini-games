# Smučarski skoki (`games/skoki/`)

Zalet, odriv v pravem trenutku, let, ki ga loviš z miško, in telemark. Deterministična 2D fizika, 2,5D izris
(Three.js 0.160), prava pravila točkovanja, veter, ghosti. Vse tri faze in prave skakalnice (`prompts/11-skoki.md`, `prompts/12-skoki-tekma.md`, `prompts/29-skoki-prave-skakalnice.md`, `prompts/13-skoki-pokal.md`).

## Kontrole

Skok se upravlja **samo z miško** (na telefonu z dotikom), kot pri klasičnih računalniških skokih. Meni desnega klika
je na igralni površini onemogočen; preslednica in puščice skoka ne upravljajo.

| Faza | Miška | Telefon |
|---|---|---|
| Štart (zelena luč) | klik | tap |
| Zalet | — (skakalec se sam spusti v nizko držo) | — |
| Odriv (konec mize) | **levi + desni gumb hkrati** (en gumb ni odriv) | dva prsta hkrati |
| Let | skakalec se **sam nagne** v letalni položaj; miška gor (nazaj) / dol (naprej) ga popravlja | vlečenje gor/dol |
| Telemark | **en gumb** tik pred tlemi | en tap |
| Dve nogi | **oba gumba** hkrati | dva prsta |

Pristanek: **en gumb = telemark, oba gumba = dve nogi**. Brez premikanja miške skakalec pristane pred K-točko brez padca (Orlova ~100 m); rahel nagib naprej (−5°) ga nese do K,
preveč naprej pa na nos.

`R` = nov skok, `Enter` = replay, `Esc`/`P`/⏸ = pavza (tudi samodejno, ko zavihek ni viden; tedaj utihne tudi zvok).
Merilnik desno pokaže napadni kot (bela črtica) in zeleno okno; rumena puščica je ciljni nagib (telo mu sledi z zamikom).
Prvi trije uspešni skoki na napravi imajo namige na zaslonu.

**Trening ne šteje rekordov:** lokalni rekord (ghost »Moj rekord«, zelena črta, 🏅 v meniju, »Osebni rekord!«) in
lestvica se posodobijo le v »Rekordu skakalnice«.

**Oznake na doskočišču:** črtkane črte čez doskočišče vsakih 5 m (vsakih 10 m debelejše in temnejše, s številkami ob obeh robovih), P-točka (zelena),
K-točka (rdeča), HS (modra) — debela črta čez celo širino s črtkanima spremljevalnima črtama ±1,5 m (vidno od daleč), s količki in tablami na obeh straneh; barvni pasovi ob robovih
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
- **Odriv** (`takeoff`): oba gumba hkrati (vnos `btn: 2`), napaka tajminga `err` (s, − = prezgodaj) → kakovost: ±35 ms ✨ (q = 1), ±90 ms dobro (q do 0,93), nato do `minQ` 0,45 (paramsVersion 4).
  Navpični impulz `vPush × q` pravokotno na mizo in vrtenje naprej (`spin`, prepozno še `spinLate × err`).
  Brez odriva čez rob = »padeš z mize« (šibek odriv po `lateLimit`).
- **Let**: stanje (x, y, vx, vy, nagib, kotna hitrost). Relativni veter: čelni veter piha **vzdolž pobočja** (zato ima tudi
  komponento navzgor, `wind.updraft`). `α = nagib − smer leta`; `L = ½ρv²·CL·A(α)`, `D = ½ρv²·CD·A(α)`, navor `CM(α)` —
  vse tri so **tabele** (`aero.lift/drag/moment`), `liftScale` itd. so skupni faktorji. Ciljni nagib = smer leta z zamikom (`body.autoLag`) + `body.autoAlpha` + popravek iz vnosa; telo mu
  sledi s PD regulatorjem z omejenim navorom (`body.kp/kd/maxTorque/inertia`). Preveč naprej (`α < noseCrash`) = padec na nos,
  preveč nazaj = velik upor (`α > backCrash` = padec nazaj).
- **Pristanek** (`landing`): pritisk pred tlemi začne pripravo (manj vzgona, poravnava smuči s pobočjem s `prepRate`).
  Spust pred stikom = telemark (kakovost po času med pritiskom in stikom, ideal `teleIdeal`, okno `teleMin`–`teleMax`),
  držanje čez stik = dve nogi. Brez pritiska ali s klikom šele po refleksu tik pred tlemi = padec (paramsVersion 7).
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
  (navor blizu meje), slab odriv, pristanek (telemark 0,5 + kakovost, dve nogi 3, trd 4,5, dotik z roko 8, padec 9), trd udarec.
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
| Zajček (K20/HS24) | 0.3 | 18.8 m | 2 % | 2 % | 0 % | 56 % | 106.3 | 41.6 km/h |
| Zajček (K20/HS24) | 0.7 | 19.4 m | 0 % | 10 % | 0 % | 80 % | 111.5 | 41.7 km/h |
| Zajček (K20/HS24) | 1.0 | 20.0 m | 0 % | 100 % | 0 % | 100 % | 114.9 | 41.7 km/h |
| Brezova (K60/HS68) | 0.3 | 55.3 m | 2 % | 10 % | 0 % | 60 % | 101.2 | 69.5 km/h |
| Brezova (K60/HS68) | 0.7 | 59.4 m | 0 % | 48 % | 0 % | 80 % | 113.8 | 69.6 km/h |
| Brezova (K60/HS68) | 1.0 | 62.9 m | 0 % | 100 % | 0 % | 100 % | 123.5 | 69.6 km/h |
| Bistra (K95/HS106) | 0.3 | 87.8 m | 2 % | 16 % | 0 % | 60 % | 98.4 | 86.7 km/h |
| Bistra (K95/HS106) | 0.7 | 96.8 m | 0 % | 76 % | 0 % | 80 % | 119.5 | 86.8 km/h |
| Bistra (K95/HS106) | 1.0 | 104.5 m | 0 % | 100 % | 0 % | 100 % | 136.6 | 86.8 km/h |
| Sipina (K105/HS117) | 0.3 | 95.4 m | 2 % | 14 % | 0 % | 60 % | 95.8 | 89.3 km/h |
| Sipina (K105/HS117) | 0.7 | 105.9 m | 0 % | 68 % | 0 % | 80 % | 117.6 | 89.4 km/h |
| Sipina (K105/HS117) | 1.0 | 114.8 m | 0 % | 100 % | 0 % | 100 % | 135.5 | 89.4 km/h |
| Reflektor (K120/HS134) | 0.3 | 105.7 m | 2 % | 14 % | 0 % | 60 % | 87.9 | 93.9 km/h |
| Reflektor (K120/HS134) | 0.7 | 119.1 m | 0 % | 46 % | 0 % | 82 % | 114.7 | 93.9 km/h |
| Reflektor (K120/HS134) | 1.0 | 131.3 m | 0 % | 100 % | 0 % | 100 % | 138.0 | 93.9 km/h |
| Orlova (K125/HS140) | 0.3 | 109.0 m | 2 % | 14 % | 0 % | 60 % | 85.5 | 95.2 km/h |
| Orlova (K125/HS140) | 0.7 | 123.3 m | 0 % | 42 % | 0 % | 80 % | 112.8 | 95.2 km/h |
| Orlova (K125/HS140) | 1.0 | 136.5 m | 0 % | 100 % | 0 % | 100 % | 138.3 | 95.2 km/h |
| Orlovo gnezdo (K200/HS240) | 0.3 | 138.2 m | 2 % | 10 % | 2 % | 58 % | 101.1 | 106.0 km/h |
| Orlovo gnezdo (K200/HS240) | 0.7 | 175.9 m | 0 % | 18 % | 2 % | 80 % | 146.8 | 106.1 km/h |
| Orlovo gnezdo (K200/HS240) | 1.0 | 241.5 m | 0 % | 100 % | 98 % | 42 % | 214.1 | 106.1 km/h |
| Mirno morje (K150/HS180) | 0.3 | 140.1 m | 2 % | 10 % | 0 % | 60 % | 95.5 | 49.3 km/h |
| Mirno morje (K150/HS180) | 0.7 | 148.8 m | 0 % | 64 % | 0 % | 82 % | 114.0 | 49.3 km/h |
| Mirno morje (K150/HS180) | 1.0 | 151.3 m | 0 % | 100 % | 0 % | 100 % | 120.3 | 49.3 km/h |

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
| `sport/competition.js`, `sport/live-replay.js` | splošno tekmovanje in tok vnosov — od 3. faze v `shared/sport/` (glej `shared/sport/README.md`) |
| `contest.js` | skakalni del: simulacija iz vnosov, veter serije, žirija, za vodstvo, nagrade, dnevni izbor, odklepi, XP |
| `jumpers.js` | lastni skakalci, izvoz/uvoz, statistika, izmišljeni boti |
| `match.js` | DOM: soba, host, gledanje, reakcije, TV, lokalna tekma, Moji skakalci |

Razvojni parametri: `?tv=1`, `?bots=9` (hitra lokalna tekma: ti + 9 botov), `?fast=1` (boti brez replaya), `?test=1`
(`window.__skoki` brez strani z drsniki: `skipRed()`, `fastForward()`, `timeScale`), orodje `node tools/skoki-tune.mjs <id>`.

## Prave skakalnice (`prompts/29-skoki-prave-skakalnice.md`)

Druga skupina v meniju (`hills/index.json` → `groups`, `"group": "prave"`): 28 skakalnic s pravimi imeni krajev in profili,
prepisanimi iz **FIS-ovih certifikatov skakalnic** (javni PDF-ji, objavljeni na skisprungschanzen.com; povezava je v
`real.source` vsake skakalnice). Imena so le imena krajev (brez imen objektov, sponzorjev, tekmovanj in skakalcev); teme so
navdihnjene s krajem in narisane po naše (nova možnost teme `town`: hiše za iztekom v Innsbrucku in Zakopanah), panoji imajo
izmišljene napise. Rekord skakalnice je brez imena skakalca (vir: skisprungschanzen.com, november 2026; uradni rekord, kjer
je naveden, sicer najdaljši veljavni skok na tekmi).

| Skakalnica | K / HS | Certifikat | Rekord skakalnice | Privzeto mesto | liftScale | takeoffWindow | pushScale | Odklep | Vir |
|---|---|---|---|---|---|---|---|---|---|
| Planica, srednja | K95 / HS102 | 2023 | 105,0 m (2023) | 4/34 | 1,12 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/slo/planica_velikanka/HS102_2023.pdf) |
| Planica, velika | K125 / HS138 | 2023 | 142,0 m (2014) | 5/27 | 1,12 | 1 | 1 | čez K na Planici, srednji | [PDF](https://www.skisprungschanzen.com/photos/slo/planica_velikanka/HS138_2023.pdf) |
| Oberstdorf | K120 / HS137 | 2022 | 143,5 m (2003) | 36/54 | 0,98 | 1 | 1 | čez K na Orlovi ali Planici, veliki | [PDF](https://www.skisprungschanzen.com/photos/ger/oberstdorf_arena/HS137_2022.pdf) |
| Garmisch-Partenkirchen | K125 / HS142 | 2022 | 145,5 m (2025) | 34/49 | 1,1 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/ger/garmischpartenkirchen_olympia/HS142_2022.pdf) |
| Innsbruck | K120 / HS128 | 2024 | 138,0 m (2015) | 5/34 | 1,22 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/aut/innsbruck/HS128_2024.pdf) |
| Bischofshofen | K125 / HS142 | 2023 | 145,0 m (2019) | 4/47 | 1,08 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/aut/bischofshofen/HS142_2023.pdf) |
| Zakopane | K125 / HS140 | 2022 | 147,0 m (2020) | 11/34 | 1,14 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/pol/zakopane_wielka/HS140_2022.pdf) |
| Willingen | K130 / HS147 | 2025 | 155,5 m (2024) | 19/44 | 1,1 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/ger/willingen_muehlenkopf/HS147_2025.pdf) |
| Lahti | K116 / HS130 | 2022 | 138,0 m (2017) | 19/27 | 1,06 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/fin/lahti/HS130_2022.pdf) |
| Engelberg | K125 / HS140 | 2021 | 145,0 m (2025) | 16/32 | 1,08 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/sui/engelberg/HS140_2021.pdf) |
| **Planica, letalnica** | K200 / HS240 | 2026 | 254,5 m (2025) | 17/30 | 1,14 | 1 | 1 | čez HS na kateri koli pravi veliki | [PDF](https://www.skisprungschanzen.com/photos/slo/planica_letalnica/HS240_2026.pdf) |
| Kulm | K200 / HS235 | 2025 | 245,5 m (2026) | 32/45 | 1,1 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/aut/badmitterndorf_tauplitz/HS235_2025.pdf) |
| Vikersund | K200 / HS240 | 2022 | 253,5 m (2017) | 11/42 | 1,18 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/nor/vikersund_skiflyging/HS240_2022.pdf) |
| Oberstdorf, letalnica | K200 / HS235 | 2023 | 242,5 m (2022) | 47/49 | 1,12 | 1 | 1 | 〃 | [PDF](https://www.skisprungschanzen.com/photos/ger/oberstdorf_flug/HS235_2023.pdf) |
| Lillehammer | K123 / HS140 | 2022 | 146,0 m (2023) | 26/32 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/nor/lillehammer_lysgaardsbakken/HS140_2022.pdf) |
| Ruka | K120 / HS142 | 2022 | 153,5 m (2023) | 38/57 | 1,1 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/fin/kuusamo/HS142_2022.pdf) |
| Wisła | K120 / HS134 | 2024 | 144,5 m (2024) | 32/33 | 1,04 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/pol/wisla_malinka/HS134_2024_NEW.pdf) |
| Titisee-Neustadt | K125 / HS142 | 2025 | 148,0 m (2016) | 31/44 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/ger/titiseeneustadt_hochfirst/HS142_2025.pdf) |
| Sapporo | K123 / HS137 | 2023 | 152,5 m (2025) | 43/52 | 1 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/jpn/sapporo_okurayama/HS137_2023.pdf) |
| Lake Placid | K115 / HS128 | 2022 | 136,0 m (2023) | 33/43 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/usa/lakeplacid/HS128_2022.pdf) |
| Oslo | K120 / HS134 | 2022 | 146,0 m (2025) | 35/40 | 1,02 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/nor/oslo_holmenkollen/HS134_2022.pdf) |
| Zhangjiakou | K125 / HS140 | 2021 | 142,5 m (2022) | 24/42 | 1 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/chn/zhangjiakou/HS140_2021.pdf) |
| Falun | K120 / HS132 | 2025 | 135,5 m (2025) | 43/50 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/swe/falun_lugnet/HS132_2025.pdf) |
| Falun, srednja | K90 / HS95 | 2025 | 99,5 m (2025) | 29/41 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/swe/falun_lugnet/HS95_2025.pdf) |
| Hinzenbach | K85 / HS90 | 2026 | — (sporen) | 28/48 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/aut/hinzenbach/HS90_2026.pdf) |
| Ljubno | K85 / HS94 | 2024 | 95,0 m (2024) | 23/28 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/slo/ljubno/HS94_2024.pdf) |
| Zaō | K95 / HS102 | 2023 | 103,5 m (2011) | 34/50 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/jpn/zao/HS102_2023.pdf) |
| Villach | K90 / HS98 | 2024 | 103,5 m (2008) | 21/26 | 0,98 | 1 | 1 | odprta | [PDF](https://www.skisprungschanzen.com/photos/aut/villach/HS98_2024.pdf) |

**Sezona 2026/27** (zadnjih 14 vrstic): vsa preostala prizorišča svetovnega pokala 2026/27 (moški in ženske) in obe
skakalnici svetovnega prvenstva v Falunu 2027, ki jih še ni bilo; skakalnice iz prejšnjih sezon niso dodane. Koledar po
Wikipediji (»2026–27 FIS Ski Jumping World Cup«, 22. 11. 2026). Kulm in Oberstdorf, letalnica, letos nista v koledarju, a ostaneta.
Vse so odprte. Pokal (`cup-config.js`) jih zaenkrat ne uporablja, ker bi sprememba `CUP_VENUES` premešala že objavljen koledar
(`skoki_cup_events`). Rekord Hinzenbacha je izpuščen (najdaljši skok je na viru sporen). Pri Falunu in Wisłi je certifikat
po prenovi, rekord je skok na novem profilu. **Ruka in Villach** (`steepToK` v orodju): certifikat nima loka rL (»/«),
doskočišče pa ostane strmo do K (Ruka βK 36,9° pri βP 38°, Villach βK 36° > βP 35,4°). Zato je začetek loka `pArc` izpeljan
tako, da enakomerni padec max(βP, βK) → βL da v K naklon iz certifikata (Ruka pArc 114,7 m namesto P 90 m, Villach 89 m namesto
82 m). Brez tega je K v Ruki ležal 1,4 m prenizko. Certifikat Zhangjiakouja (2021) je bil veljaven do 30. 4. 2026; novejšega ni
objavljenega. Lillehammer: iztek »90/100 m« → 90 m. Kubična parabola (Hinzenbach, Ljubno) → r1 = 0,14·v0².
`gateFactor` vseh 28 pravih skakalnic je izračunan z isto (sedanjo) fiziko: 26. 11. 2026 je bil pri 12 starejših znova
izračunan (premik 0,1–0,4 točke na mesto, npr. Vikersund 8,8 → 8,4), profili in privzeta mesta so ostali enaki.

JSON-e ustvari `node tools/skoki-real-hills.mjs` (certifikati so v orodju prepisani; `--check` le izpiše prileganje,
`--search` znova poišče privzeto mesto in parametre fizike). V meniju ima kartica zastavo, K/HS, rekord skakalnice, »po profilu
skakalnice v <kraj> (certifikat <leto>)« in moj rekord; skupini sta zložljivi (stanje se zapomni). Prave skakalnice so v treningu,
Rekordu skakalnice (lestvica `rekord:<id>` — isti format kot pri trening skakalnicah, ghosti, vrstica v `skoki_hills`), tekmi in
lokalni tekmi (izbira po skupinah) ter dnevnem izzivu.

### Iz certifikata v model
| Certifikat | Model (`hills/<id>.json`) |
|---|---|
| γ, α, t, r1 | `inrun.gamma`, `inrun.alpha`, `inrun.t`, `inrun.r1` (spremenljiv radij »225–130«, »140/107« → povprečje; kubična parabola v Bischofshofnu → 0,14·v0² = 96 m po FIS-ovi normi) |
| e1, es, število mest | `gates.count`, `gates.spacing` = es / (mest − 1), `inrun.e2` = (e1 − es) − t − r1·(γ − α) |
| s, P, L (= HS), βP, βL, r2, a | `landing.s`, `pArc`, `lArc`, `beta` (= βP), **`betaL`** (novo), `r2` (klotoida → najmanjši radij), `outrunLength` |
| rL (lok P → L) | `betaL`: naklon se med P in L enakomerno zmanjša od βP do βL (to je krožni lok; v certifikatih velja (L − P)/rL ≈ βP − βL) |
| h, n (K-točka) | **izpeljano:** `landing.b0` (začetni naklon grbine) je prilagojen tako, da K-točka leži natanko h pod robom; vodoravna razdalja se potem ujema z n na ±1 m (letalnice ±2,3 m) — test. V Innsbrucku certifikat navaja β0 = 7,5°, izpeljano je 8,0°. |
| β (v K) | ni parameter; izračunani naklon v K se ujema na ±0,7° (izjema Planica, srednja: certifikat navaja β = 35,17°, kar ni skladno z βP 35,65°, βL 30,91° in rL 230 m — model da 32,9°) |
| »sloping up/down after U« | `outrunAngle` 0 (navzgor) ali 4–5° (navzdol na letalnicah); protiklanec doda model sam |
| b1, b2, bK, bU, d, q, Zu, l1, l2, v0 | model jih nima (širina doskočišča je izrisana po svoje, sodniški stolp ni na mestu iz certifikata) |

Vrednost metra, `base` in faktorji vetra so po FIS-ovih tabelah glede na K (`meterValueFor`, `baseFor`, `windFactorsFor`).
Na Planici, srednji in veliki certifikat navaja e2, ki se ne ujema z e1 − es; uporabljeno je e1 − es (kot drugje).

### Kje se je moral prilagoditi model (brez spremembe profila in `paramsVersion`)
- **`landing.betaL`** (hill.js): pravi profili se med P in L položijo (βL 28–33°), izmišljeni so bili ravni (β do HS).
  Skakalnice brez `betaL` se gradijo natanko kot prej (fikstura skokov bota na vseh 8 trening skakalnicah, test).
- **Ožje okno odriva `physics.takeoffWindow` < 1** (physics.js): na pravem profilu se dolgi skoki »ujamejo« na položnejšem
  delu, zato je razpon med botoma 0,7 in 1,0 le ~5 m, cilji 1. faze pa zahtevajo ~6 m. Ožji okni »popoln/dober« odriv
  (faktor 0,5–0,9) kaznujeta nenatančen odriv in razpon povečata, hitrost ostane realna (89–93 km/h). Meji »prezgodaj« in
  »padeš z mize« se pri faktorju < 1 ne zmanjšata; faktor ≥ 1 deluje kot prej (Zajček).
- **`physics.liftScale`** 1–1,12 na velikih: pristanek pri HS na položnejšem doskočišču (βL ~31°) je bil sicer pretrd
  (dotik namesto telemarka); nekoliko položnejši let to popravi. Iskanje zahteva tudi ≥ 50 % telemarkov najboljšega bota.
- **Letalnice:** položnejše doskočišče (βL 28–31°) ujame let najboljših že ~K + 15 m. Cilj (1,0 → HS − 6 …) je dosegljiv le
  s položnejšim jadranjem (`liftScale` 1,13–1,185) in **počasnejšim zaletom** (privzeto nizko mesto, 91–95 km/h namesto
  pravih ~105 km/h). Posledica: skok je zelo občutljiv na zaletno mesto (8–19 m na mesto, `gateFactor` 10–25 točk) in na veter
  (kot Orlovo gnezdo). Kulm še `pushScale` 1,2, Vikersund `takeoffWindow` 2 (sicer bot 0,3 ne doseže K × 0,6).
- Validator: `group`, `real` (obvezen pri »prave«: kraj, koda države, leto certifikata, vir, rekord brez imena), `betaL`,
  `unlock` z `hills: […]` ali `group` + `size`, do 60 zaletnih mest (Oberstdorf 54), miza do 9 m, `takeoffWindow` 0,5–3.

### Odklepanje in dosežki
- Planica, srednja je odprta. **Planica, velika:** čez K na Planici, srednji. **Ostale prave velike:** čez K na Orlovi **ali**
  Planici, veliki (izbrano: Orlova je znana pot iz 1. faze, Planica velika je »domača« pot). **Prave letalnice:** čez HS brez
  padca na kateri koli pravi veliki. Odklepi so dosežki `odklep-<id>` (več hkrati = en toast).
- Dosežki: `prava-k` (čez K na pravi skakalnici brez padca), `rekord-skakalnice` (daljše od pravega rekorda skakalnice, brez
  padca), `vse-letalnice` (čez K na vseh letalnicah, tudi Orlovem gnezdu), `popotnik` (skok na vseh pravih skakalnicah).

### Uravnoteženje pravih skakalnic (`node tools/skoki-balance.mjs`, brez vetra, 50 skokov na celico)

| Skakalnica | Spretnost | Povp. daljava | Padci | Čez K | Čez HS | Telemark | Povp. točke | Hitrost |
|---|---|---|---|---|---|---|---|---|
| Planica, srednja (K95/HS102) | 0.3 | 81.3 m | 2 % | 4 % | 0 % | 58 % | 86.1 | 82.8 km/h |
| Planica, srednja (K95/HS102) | 0.7 | 92.3 m | 0 % | 22 % | 0 % | 80 % | 110.1 | 82.9 km/h |
| Planica, srednja (K95/HS102) | 1.0 | 98.6 m | 0 % | 100 % | 0 % | 100 % | 122.5 | 82.9 km/h |
| Planica, velika (K125/HS138) | 0.3 | 107.3 m | 2 % | 14 % | 0 % | 56 % | 82.9 | 88.4 km/h |
| Planica, velika (K125/HS138) | 0.7 | 123.5 m | 0 % | 44 % | 0 % | 80 % | 112.7 | 88.4 km/h |
| Planica, velika (K125/HS138) | 1.0 | 134.0 m | 0 % | 100 % | 0 % | 86 % | 128.5 | 88.4 km/h |
| Oberstdorf (K120/HS137) | 0.3 | 103.5 m | 2 % | 14 % | 0 % | 56 % | 84.7 | 93.0 km/h |
| Oberstdorf (K120/HS137) | 0.7 | 119.4 m | 0 % | 52 % | 0 % | 80 % | 114.7 | 93.0 km/h |
| Oberstdorf (K120/HS137) | 1.0 | 131.3 m | 0 % | 100 % | 0 % | 100 % | 137.2 | 93.0 km/h |
| Garmisch-Partenkirchen (K125/HS142) | 0.3 | 105.5 m | 2 % | 14 % | 0 % | 56 % | 81.9 | 89.3 km/h |
| Garmisch-Partenkirchen (K125/HS142) | 0.7 | 124.1 m | 0 % | 56 % | 0 % | 80 % | 114.0 | 89.4 km/h |
| Garmisch-Partenkirchen (K125/HS142) | 1.0 | 136.1 m | 0 % | 100 % | 0 % | 100 % | 136.5 | 89.4 km/h |
| Innsbruck (K120/HS128) | 0.3 | 97.7 m | 2 % | 8 % | 0 % | 56 % | 76.8 | 83.8 km/h |
| Innsbruck (K120/HS128) | 0.7 | 116.4 m | 0 % | 32 % | 0 % | 80 % | 109.0 | 83.8 km/h |
| Innsbruck (K120/HS128) | 1.0 | 126.3 m | 0 % | 100 % | 0 % | 100 % | 126.2 | 83.9 km/h |
| Bischofshofen (K125/HS142) | 0.3 | 104.9 m | 2 % | 16 % | 0 % | 56 % | 81.2 | 90.3 km/h |
| Bischofshofen (K125/HS142) | 0.7 | 124.2 m | 0 % | 56 % | 0 % | 80 % | 114.3 | 90.3 km/h |
| Bischofshofen (K125/HS142) | 1.0 | 136.1 m | 0 % | 100 % | 0 % | 100 % | 136.0 | 90.3 km/h |
| Zakopane (K125/HS140) | 0.3 | 105.0 m | 2 % | 14 % | 0 % | 56 % | 81.0 | 87.8 km/h |
| Zakopane (K125/HS140) | 0.7 | 123.8 m | 0 % | 54 % | 0 % | 80 % | 113.7 | 87.9 km/h |
| Zakopane (K125/HS140) | 1.0 | 135.2 m | 0 % | 100 % | 0 % | 100 % | 134.9 | 87.9 km/h |
| Willingen (K130/HS147) | 0.3 | 107.5 m | 2 % | 14 % | 0 % | 56 % | 79.4 | 89.1 km/h |
| Willingen (K130/HS147) | 0.7 | 128.4 m | 0 % | 48 % | 0 % | 80 % | 112.9 | 89.1 km/h |
| Willingen (K130/HS147) | 1.0 | 141.3 m | 0 % | 100 % | 0 % | 100 % | 136.9 | 89.1 km/h |
| Lahti (K116/HS130) | 0.3 | 97.2 m | 2 % | 14 % | 0 % | 56 % | 83.0 | 89.5 km/h |
| Lahti (K116/HS130) | 0.7 | 114.8 m | 0 % | 48 % | 0 % | 80 % | 113.7 | 89.5 km/h |
| Lahti (K116/HS130) | 1.0 | 125.4 m | 0 % | 100 % | 0 % | 100 % | 133.3 | 89.5 km/h |
| Engelberg (K125/HS140) | 0.3 | 104.0 m | 2 % | 14 % | 0 % | 56 % | 80.5 | 89.6 km/h |
| Engelberg (K125/HS140) | 0.7 | 123.5 m | 0 % | 48 % | 0 % | 80 % | 112.9 | 89.6 km/h |
| Engelberg (K125/HS140) | 1.0 | 135.4 m | 0 % | 100 % | 0 % | 100 % | 135.2 | 89.6 km/h |
| Planica, letalnica (K200/HS240) | 0.3 | 163.2 m | 2 % | 24 % | 0 % | 54 % | 127.7 | 98.9 km/h |
| Planica, letalnica (K200/HS240) | 0.7 | 200.8 m | 0 % | 56 % | 0 % | 80 % | 176.7 | 98.9 km/h |
| Planica, letalnica (K200/HS240) | 1.0 | 235.8 m | 0 % | 100 % | 0 % | 100 % | 220.6 | 98.9 km/h |
| Kulm (K200/HS235) | 0.3 | 163.2 m | 2 % | 22 % | 0 % | 60 % | 128.9 | 99.5 km/h |
| Kulm (K200/HS235) | 0.7 | 199.0 m | 0 % | 54 % | 0 % | 80 % | 174.6 | 99.5 km/h |
| Kulm (K200/HS235) | 1.0 | 229.2 m | 0 % | 100 % | 0 % | 100 % | 212.4 | 99.5 km/h |
| Vikersund (K200/HS240) | 0.3 | 147.2 m | 2 % | 28 % | 0 % | 56 % | 112.5 | 95.3 km/h |
| Vikersund (K200/HS240) | 0.7 | 200.8 m | 0 % | 56 % | 0 % | 80 % | 176.7 | 95.3 km/h |
| Vikersund (K200/HS240) | 1.0 | 236.2 m | 0 % | 100 % | 0 % | 100 % | 220.9 | 95.3 km/h |
| Oberstdorf, letalnica (K200/HS235) | 0.3 | 159.3 m | 2 % | 24 % | 2 % | 56 % | 123.6 | 98.3 km/h |
| Oberstdorf, letalnica (K200/HS235) | 0.7 | 198.7 m | 0 % | 54 % | 2 % | 80 % | 174.2 | 98.3 km/h |
| Oberstdorf, letalnica (K200/HS235) | 1.0 | 238.3 m | 0 % | 100 % | 100 % | 100 % | 222.8 | 98.3 km/h |

Vse vrstice izpolnijo cilje 1. faze (test »cilji uravnoteženja«). Z naključnim vetrom (`--wind`) so prave skakalnice strožje od
izmišljenih: najboljši bot (1,0) pade v 24–50 % skokov na velikih (Orlova 20 %) in ~43 % na letalnicah (Orlovo gnezdo 54 %) —
pristanek pri HS je na položnejšem doskočišču zahtevnejši.

## Rekordi in svetovni rekord
- **Rekord skakalnice** = daljši od pravega rekorda (`real.record`) in najdaljšega skoka na lestvici `rekord:<id>`; na doskočišču
  je **zlata črta**, v HUD-u čip »🏆 Rekord skakalnice« (»🌍 Svetovni rekord«, če je to najdaljši rekord vseh skakalnic).
- **Svetovni rekord** = najdaljši rekord vseh skakalnic brez Lune (privzeto Planica, letalnica 254,5 m).
- Skok brez padca in dotika čez rekord: zlata kartica »REKORD SKAKALNICE!« / velika »SVETOVNI REKORD!«, fanfara, zvonci,
  konfeti oz. ognjemet. Proslava je v vseh načinih (v treningu z opombo »trening ne šteje«); tabelo posodobi le »Rekord skakalnice«.
- Meni: kartica **Najdaljši skoki** — svetovni rekord in po skakalnicah pravi rekord, najdaljši na lestvici (z igralcem) in moj;
  klik na vrstico izbere skakalnico. Lestvice (`limit: 1`) se naložijo ob meniju, predpomnilnik 60 s.
- Konec tekme: rezultati imajo poleg »Nova tekma« še **Zapusti sobo** (spletna) oz. **V meni** (lokalna) — `ui.results({ exit })`.
- **Top 10 skokov:** klik na vrstico v »Najdaljši skoki« odpre top 10 posameznih rezultatov Rekorda skakalnice (isti igralec
  lahko večkrat; `hub.getTopScores`, brez združevanja po igralcu) z datumom; skoki čez pravi rekord imajo 🏆.

## Kontrole pristanka in vetrokaz
- **En gumb = telemark, oba gumba = dve nogi** (dotik: en tap = telemark, dva prsta = dve nogi). Simulacija, boti in ghosti
  ostanejo pri btn 1 = dve nogi, btn 2 = telemark: `input.js` (`_landBtn`) ob prvem pritisku takoj pošlje 1 (priprava brez zamika),
  če v 7 tickih (~60 ms) ne pride drugi gumb, pošlje 2 (nadgradnja v telemark z istim trenutkom priprave). Stari ghosti veljajo.
- **Vetrokaz** desno zgoraj: rokav, ki se z močjo vetra dviguje, črte, ki letijo v smeri vetra (hitreje pri močnejšem), puščica in
  m/s (zeleno čelni, rdeče hrbtni). Pred skokom veter pri K-točki, v letu ob skakalcu.

## Dotik z roko (FIS ICR, Book III, 2024)
- ICR 431.2.2/431.2.3: pristanek brez telemarka najmanj **3,0** odbitka; prehod z rokama/zadnjico na snegu **4,0–5,0**; padec pred
  črto padca **7,0** (skupina iztek). ICR dotika z roko ne imenuje »padec«, a se na točkah skoraj izenači s padcem, rekordi z dotikom
  pa se ne priznajo. Zato v igri: odbitek za dotik **8** (padec 9), in dotik **šteje kot padec** za rekord skakalnice, svetovni rekord,
  osebni rekord, lestvico (najboljši skok »brez padca«), odklepe, dosežke in statistiko padcev.

## Fizika v4 (»zglajena«, paramsVersion 4)
Cilj: odriv, ki ga zadene tudi človek, gladek prehod v let in let, v katerem se čuti dober položaj.
- **Odriv:** telo zapusti mizo le `takeoff.pitch0` = 34° nad smerjo leta (prej fiksno 55° — skakalca je »potegnilo nazaj«
  in je pol sekunde lovil letalni položaj). Okni: popoln ±35 ms, dober ±90 ms (kakovost pade le na 0,93, `goodDrop`), nato
  do `minQ` 0,45. Prave velike skakalnice nimajo več ožjega okna (`takeoffWindow` < 1 ostane le na Luni).
- **Let:** samodejni položaj `autoAlpha` 32° (prej 34°) z manjšim zamikom `autoLag` 0,15 s (prej 0,35 s — položaj je
  »lezel« nazaj do ~43° in brez miške je skakalec pristal ~25 m pred K). Zdaj: popoln odriv brez miške ≈ K − 3 m,
  −40 ms ≈ K − 8 m, rahel nagib naprej (−3 … −5°) do HS. Skupni `aero.liftScale` 0,99 (prej 1,05) to izravna.
- **Občutek:** zvok vetra je polnejši pri dobrem jadranju (napadni kot blizu `GLIDE_ALPHA` 29°) in v čelnem vetru, tokovnice
  ob skakalcu in plapolanje dresa (`snapshot.glide`, `snapshot.windH`).
- **Skakalec:** medenica, prsni koš, ramena, vrat, rokavice, vezi in visoki čevlji, privihane konice; V-položaj z repi
  skupaj in konicama narazen (prej sta se repa križala), roke ob telesu, telo ~17° nad smučmi.
- **Veter:** `wind.updraft` 1,0 (prej 0,8) — čelni veter +2 m/s na Orlovi ≈ +12 m, hrbtni −2 m/s ≈ −11 m (prej ±8 m).
- **Pristanek:** meje `hTele` 1,6 / `hTwo` 1,95 / `hNone` 1,15 (prej 1,4 / 1,75 / 1,0) — čist telemark tudi tik pred HS na položnih
  pravih profilih; pristanek precej čez HS je še vedno padec.
- **Boti:** nagib pri nizki spretnosti raste s korenom (`6 · √(1 − skill)`), raztros odriva je večji (`bot.js`) — 0,3 / 0,7 / 1,0
  ostanejo pri istih ciljih; na letalnicah je cilj za 0,7 širši (K − 25 … K + 5 m), ker tam vsaka stopinja šteje ~20 m.
- Skakalnice so znova uglašene (`tools/skoki-real-hills.mjs --search`, ročno Brezova, Orlovo gnezdo, Luna), fiksture
  testov znova ustvari `node tools/skoki-fixtures.mjs`. Stari ghosti (v3) se ne predvajajo; lokalni osebni rekordi ostanejo (daljava).

## Žirija in veter (FIS ICR 402.1.2, 422.5–422.9)
- **Pravila (ICR, Book III, 2024):** če je v uporabi sistem kompenzacije vetra in zaleta, žirija lahko zalet spremeni tudi med
  serijo (pravičnost in varnost), kompenzacija gre v skupni rezultat (422.5–422.8). Trener lahko zalet zniža svojemu skakalcu, a
  kompenzacija za zalet velja le, če skoči vsaj 95 % HS (422.9 — v igri še ni). Ko kdo doseže 95 % HS, žirija presodi, ali se
  serija nadaljuje (402.1.2).
- **V igri** (`contest.js`): `juryBeforeJump` pred skokom preračuna napoved vetra v zaletna mesta (`windPoints / gateFactor`, čelni
  = nižje, hrbtni = višje, meje osnova −8 … +4). Na začetku serije izbere začetno mesto (= referenca kompenzacije), med serijo
  zalet spremeni le pri razliki ≥ 2 mesti. Po skoku čez 95 % HS ostane znižanje (`juryAfterJump`, zniža tudi osnovo).
- **Veter v tekmi:** »Spremenljiv« = ustaljen veter serije (`steadyMean`: povprečje serije in počasen zdrs ≤ ±1 m/s od skakalca
  do skakalca, nov način vetra `steady` z zmernimi sunki); »Enak za vse« = isti profil za vse.
- **Rekord skakalnice:** trije skoki v podobnem vetru (`steady`, seed seje), žirija pred vsakim skokom postavi zalet po vetru;
  kompenzacija je glede na privzeto mesto (lestvica ostane v metrih, žirija daljave izenači).
- **Animacija:** ob spremembi kartica »🚩 Žirija · zaletno mesto 13 ▼ 11«, razlog (veter) in kompenzacija v točkah (+ zeleno,
  − rdeče); v traku spodaj zalet s točkami. Tekma jo pošlje vsem (`active.gateChange`).
- **Točke na mesto** (`gateFactor`) so izmerjene: `node tools/skoki-gatefactor.mjs [--write]` (metri na mesto bota 0,7 × vrednost
  metra), da kompenzacija res izravna mesto — test: bot 0,9 pri ±2 m/s z žirijo dobi skoraj enake točke kot brez vetra.

## Rekordi: naši, moji in pravi (paramsVersion 5)
- **Rekord skakalnice in svetovni rekord sta »naša«**: najdaljši skok brez padca na lestvici Rekorda skakalnice (vsi igralci) oz.
  najdaljši med vsemi skakalnicami (brez Lune). Pravi rekordi (`real.record`) so dodatni podatek: stolpec »Pravi rekord«, pod
  svetovnim rekordom, v čipu (»pravi 142,0 m«) in omemba pri proslavi (»Daljše od pravega rekorda …«). Zlata črta = naš rekord
  (če ga še ni, pravi). Prvi rekord skakalnice šteje od K naprej.
- **Moj rekord** = daljši od lokalnega (ta naprava) in mojega najboljšega na lestvici (`hub.getMyBest`) — enak na vseh napravah.
- **Pred skokom** je v traku spodaj »Osebni rekord« skakalca na tej skakalnici (jaz: moj rekord; lokalna tekma: statistika
  skakalca iz »Moji skakalci«).
- **Pristanek:** pozen klik (manj kot `teleMin` 0,15 s pred stikom) da pristanek na obe nogi, le skrajno pozen (< `lateTouch` 0,05 s)
  dotik z roko; klik po refleksu = trd pristanek (prej padec — pozen klik je bil slabši od nobenega). Meje udarca `hTele` 1,8,
  `hTwo` 2,15, `hNone` 1,3, kot smuči `pitchOk` 15° / `pitchTouch` 25° — dolgi skoki niso več dotiki; pristanek daleč čez HS je še
  padec.

## Odklepanje (od 25. 11. 2026)
- **Vse skakalnice so od začetka odprte** (prej verige: Orlova → Sipina/Reflektor/Orlovo gnezdo, Planica srednja → velika →
  prave velike → letalnice). Igra je za prijatelje: host v tekmi lahko izbere katero koli skakalnico.
- **Izjema: Luna (Mirno morje)** — odklene se s skokom čez K na kateri koli letalnici (`unlock: { size: 'letalnica', over: 'k' }`;
  pogoj `size` brez `group` = katera koli skupina). Pogoji `hill` / `hills` / `size + group` ostanejo za morebitne nove skakalnice.
- **Napredek namesto odklepov:** oznaka na kartici »✓ K« / »⭐ HS« (čez K / HS brez padca; statistika naprave ali moj rekord na
  lestvici) in dosežka »Zbiratelj K-točk« (čez K povsod razen na Luni) in »Do HS povsod« (čez HS na vseh pravih velikih).
  Že dobljeni dosežki `odklep-<id>` ostanejo.

## Meni (v2)
- **Na vrhu izbrana skakalnica** (ime, K/HS, oznaka ✓ K / ⭐ HS, opis, naš rekord, moj rekord, pravi ob strani) z dvema velikima
  gumboma **▶ Trening** in **🏆 Rekord skakalnice**; pod njima zložljive »Nastavitve treninga« (zalet, veter, ghost, opis načinov,
  statistika seje). Igra si zapomni zadnjo skakalnico (`settings.lastHill`) in ali so nastavitve odprte.
- **Izbira skakalnice** z zavihki Trening / Prave / Letalnice (letalnice iz obeh skupin); klik zamenja kartico zgoraj, »⇄ Zamenjaj«
  skoči na izbiro.
- **Drugi načini** v eni vrsti: Tekma s prijatelji, Lokalna tekma, Dnevni izziv, Moji skakalci.
- **Spodaj zavihki** Lestvice (najdaljši skoki, top 10, lestvica skakalnice) / Dosežki / Kako igrati / Nastavitve (`settings.menuTab`).

## Zastava na vrhu skakalnice
Nad štartno hiško je drog z veliko zastavo (`countryFlag` v `render/tex.js`, `world.js`): prave skakalnice zastavo države
(`real.country`: Slovenija z grbom, Avstrija, Nemčija, Poljska, Finska, Švica, Norveška; pripravljene še Italija, Češka, Japonska),
plapola v vetru (senčilnik kot pri zastavicah publike). Luna: temno modra zastava z Luno in zvezdami na vodoravni prečki, ne plapola
(ni zraka). Izmišljene skakalnice: zastava MINI GAMES.

## Pristanek na letalnicah in zgodnji klik (paramsVersion 6)
- **Zgodnji klik** (priprava na pristanek že 1–2 s pred tlemi) ni več padec: priprava vzame manj vzgona (`prepLift` 0,8, prej 0,55;
  `prepDrag` 1,15) — skok je le nekaj metrov krajši in telemark slabše ocenjen.
- **Letalnice:** meje udarca so pomnožene z `landing.flyFactor` 2,1 (le `size: 'letalnica'`), ker se za HS doskočišče izravna in
  udarec hitro raste. Čist pristanek je mogoč do ~HS + 10 m (npr. 251 m na Planici), dlje dotik, nato padec — rekordne daljave
  (pravi svetovni rekord 254,5 m) so dosegljive le z zelo dobrim pristankom.

## 3. faza: svetovni pokal, kariera, oprema (`prompts/13-skoki-pokal.md`)

Meni ima dva velika gumba **🌍 Svetovni pokal** in **🎯 Kariera**; nad njima obvestilo, če je postaja odprta in še nisi skočil.

### Svetovni pokal (asinhrono, Supabase ali offline)
- **Sezona = koledarski mesec** (»Pokal Decembra 2026«, prva sezona 2026-12). Koledar se izračuna iz meseca in seeda
  (`cup-config.js` → `shared/sport/season.js`): ceil(dni / 3) postaj (10–11), vsaka **odprta 2–3 dni od polnoči po Ljubljani**;
  **1. serija** ves čas postaje (en skok, poskus se porabi ob štartu), **2. serija zadnji dan** postaje za najboljših 30 po 1. seriji
  (izenačeni na meji vsi; med prijatelji gredo vsi). Pred 1. serijo neomejen **trening** na isti skakalnici, vetru in pogoju (z ghosti).
- Samo **prave skakalnice** (devet velikih, srednja Planica); **finale vedno na letalnici** (~75 % Planica), ena letalnica sredi sezone.
  Pogoji postaje: brez, sneženje, noč pod reflektorji, sunkovit veter; veter −1,5 … +1,5 m/s; zalet postavi žirija po vetru (isti za vse).
- **Turneja 4 skakalnic** v decembrski sezoni: štiri postaje pred finalom (Oberstdorf → Garmisch → Innsbruck → Bischofshofen), ločena
  skupna razvrstitev = vsota točk skokov, kdor zamudi postajo, izpade. KO pari so v pokalu izklopljeni (< 50 skakalcev), so pa v formatu (s kvalifikacijami pri ≥ 4 skakalcih)
  **»Turneja 4 skakalnic«** Lokalne in spletne Tekme (pari 1.–N., srečnih poražencev round(N/10), izenačenje v paru: oba naprej).
- **Točke pokala** 100-80-60-50-45-40-36-32-29-26-24-22-20-18-16-15-14 … 1 (30. mesto); izenačeni enake točke; skupno = vsota,
  izenačenje: več zmag, nato več drugih mest. **Rumena majica 🟡** (vodilni) se vidi tudi v tekmah in treningu.
- Zaslon: koledar (kartice s stanjem prihaja/odprto/2. serija/končano in mojim mestom), postaja (pogoji, odštevanje, gumbi, rezultati,
  povzetek v slogu prenosa: oder, najdaljši skok, replay zmagovalnega skoka), skupna razvrstitev z gibanjem mest, turneja,
  Dvorana slavnih (zmagovalci preteklih sezon), konec sezone (zmagovalec, »Kralj letalnic«, »Najbolj stanoviten«), pretekle sezone ◀ ▶.
- **Replay vsakega pokalnega skoka** (klik na točke serije) in **👻 ghost** za trening postaje — z opremo igralca, čigar je skok.
- Hub: XP 20 za pokalni skok (največ 2 na postajo), +100 zmaga postaje, +300 zmaga sezone; `reportEvent('skoki:pokal')` enkrat na
  postajo; `reportGame` po 2. seriji (ali 1., če se nisi uvrstil). Dosežki `pokal-prvi`, `pokal-zmaga`, `rumena`, `sezona`, `vsi-skoki`, `turneja`.
- Podatki: `hub.cupSubmit / cupStandings / cupJump` (`shared/README.md`), Supabase `skoki_cup_*` in RPC `skoki_cup_submit`
  (`supabase/games/skoki.sql`; okna postaj v `skoki_cup_events` iz `node tools/skoki-cup-sql.mjs --write`).

### Pokal: več tekem (brez čakanja)
V Lokalni tekmi in spletni Tekmi format **»Pokal: več tekem«**: izbereš 2–10 skakalnic (po vrsti seznama), tekme si sledijo takoj
(dve seriji vsaka), na koncu seštevek — točke pokala 100-80-60 … po mestu ali točke skokov; zamujena tekma = 0, izenačenje po
zmagah. Za razliko od Svetovnega pokala (postaje z roki čez mesec) se igra v enem kosu. Logika: `shared/sport/ko.js` `seriesTotal`.

### Kariera (solo proti 29 botom)
Celinski pokal (Mini, mala, srednja) → Svetovni pokal (srednja, velika) → Poleti (velika, letalnice). Kariera-sezona ima 6–8 tekem z
dvema serijama in 30 skakalci; med najboljših 10 v sezoni = višja liga. Rivali so stalni (izmišljena imena ali boti iz »Moji skakalci«,
manjkajoče dopolnijo vgrajeni), z močjo znotraj lige, značajem (stabilen, nestanoviten, borec, mojster) in formo, ki niha (▲▼). Brez
nadgradenj fizike. Shrani se po vsaki tekmi (`skoki:career:<profil>`), izvoz/uvoz s kodo `KARIERA1:`. Novinarski napisi, statistika
(zmage, odri, najdaljši, sezone, naslovi). XP 25 za tekmo, +75 za napredovanje; dosežki `kariera-liga-2`, `kariera-poleti`, `kariera-prvak`.

### Oprema v trgovini (zavihek »Za igre«)
Sloti `suit`, `helmet`, `skis`, `flag` (`shared/cosmetics.js` → `GAME_ITEMS`): 10 dresov, 6 čelad, 6 smuči, 10 zastavic. Z dosežki:
zlati dres (zmaga sezone), rumena čelada (vodstvo v sezoni), Lunin dres (skok na Luni), smuči Letalec (200 m), dres Snežni angel
(50 padcev, dosežek `padci-50`). **Samo videz** (`gear.js` → `skin`): trening, tekma (drugi vidijo prek presence), ghosti, replayi,
zastavica ob imenu in v publiki. Dosežek `garderoba` (5 kupljenih kosov).

### Moduli 3. faze
| Modul | Vsebina |
|---|---|
| `cup-config.js` | skakalni del koledarja (skakalnice, finale, turneja, pogoji) in lige kariere (brez DOM-a) |
| `cup.js`, `career-ui.js` | DOM: zaslon pokala in kariere |
| `gear.js` | oprema iz trgovine → videz skakalca, zastavica, rumena majica |
| `../../shared/sport/` | `season.js`, `ko.js`, `career.js` (+ `competition.js`, `live-replay.js` iz 2. faze) — glej `shared/sport/README.md` |

Razvojno: `?pokal=1`, `?kariera=1`, `?date=2026-12-03[T18:30]` (simuliran datum, samo offline), `?bot=0.9` (bot skače namesto tebe).
