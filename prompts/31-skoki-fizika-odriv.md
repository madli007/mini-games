# Prompt za AI agenta: Smučarski skoki — uglaševanje odriva in leta (slog DSJ 4), odriv kadarkoli

> **Stanje:** ⬜ čaka — predpogoj: 11 ✅, 12 ✅ (fizika paramsVersion 7)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/31-skoki-fizika-odriv.md in ga v celoti izvedi.«**
>
> Ozadje: fizika skoka je v `games/skoki/physics.js`, parametri v `games/skoki/physics-params.json` (zdaj
> `paramsVersion` 7), stran z drsniki za uglaševanje v `games/skoki/debug.js` (`?debug=1`, shrani/naloži/izvozi,
> ponovitev zadnjega skoka z novimi parametri, »Poženi bote«). Uporabnik želi občutek odriva in leta bolj podoben igri
> **Deluxe Ski Jump 4** (DSJ 4): po odrivu te telo samo nagne nazaj in moraš skakalca **sam aktivno potiskati naprej**,
> tajming odriva naj bo bolj kot tam. Zdaj skakalca v letalni položaj večinoma postavi avtomatika
> (`body.autoAlpha`, `body.autoLag`), igralec le popravlja.
>
> **Ta prompt ne določa končnih vrednosti.** Naredi parametre in orodje, da jih uporabnik sam uglasi s testiranjem;
> privzete vrednosti ostanejo take, da se igra (razen točke 3) obnaša **natanko kot zdaj**. Igre ne kopiraj: nobenih
> imen, grafike ali besedil iz DSJ — gre le za občutek fizike.

---

## 1. Nagib nazaj po odrivu in moč avtomatike (nastavljivo)

V `physics.js` (faza `air`) dodaj parametre in jih vpiši v `physics-params.json`:

- **`body.autoAssist`** (0–1, privzeto **1**): moč samodejnega letalnega položaja. Cilj nagiba je
  `lerp(trenutni nagib ali nevtralni položaj, auto, autoAssist) + vnos igralca`. Pri 1 natanko kot zdaj,
  pri 0 skakalec ne drži položaja sam — položaj je v celoti vnos igralca (miška / nagib telefona).
- **`takeoff.backTorque`** (N·m, privzeto **0**): dodaten navor »nazaj« (telo se dviga, smuči gredo gor) takoj po odrivu,
  ki ga mora igralec premagati z vnosom naprej.
- **`takeoff.backTime`** (s, privzeto 0,6) in **`takeoff.backDecay`** (oblika upadanja: 0 = konstantno do konca,
  1 = linearno do 0) — kako dolgo in kako navor nazaj traja.
- **`takeoff.backByTiming`** (0–1, privzeto 0): koliko je navor nazaj večji pri slabem tajmingu (pozen odriv = bolj
  nazaj, prezgoden = manj), da se odriv in let povežeta kot v DSJ.
- Obstoječe `takeoff.pitch0`, `spin`, `spinLate` ostanejo (zasuk ob odrivu) — v drsnikih jih združi pod isto skupino.
- Padec na hrbet (`body.backCrash`) in na nos (`noseCrash`) ostaneta; pri večjem navoru nazaj bo padec na hrbet
  pogostejši — to je namen.
- Vnos igralca (`input.js`): preveri, da je razpon popravka nagiba (`quantPitch` −60…+80) dovolj velik, da pri
  `autoAssist = 0` in največjem `backTorque` skakalca še lahko spraviš v dober položaj. Če ni, razširi razpon
  (to je sprememba zapisa ghosta → `paramsVersion`).

## 2. Tajming odriva (nastavljivo)

Okna `takeoff.perfect`, `good`, `earlyLimit`, `lateLimit`, `idealOffset`, `goodDrop`, `minQ`, `earlySpeedLoss`
že obstajajo. Dodaj še (privzeto 0 = brez učinka):

- **`takeoff.lateAngleLoss`** (°/s): pozen odriv (že čez rob) zniža kot odriva sorazmerno z zamudo.
- **`takeoff.earlyAngleLoss`** (°/s): prezgoden odriv zniža kot (odriv »v strmino«).
- **`takeoff.qPower`** (privzeto 1): eksponent krivulje kakovosti — večji = strožji tajming (manjše odstopanje hitro
  boli), kot v DSJ.

V pomoči igre (`helpHtml` v `game.js`) besedilo o oknih (±35 ms, ±90 ms) izračunaj iz parametrov, ne fiksno.

## 3. Odriv kadarkoli (sprememba obnašanja)

- Zdaj `stepInrun` upošteva odriv (oba gumba) šele, ko je do roba mize ≤ `earlyLimit` (0,22 s). Odstrani to omejitev:
  **odriv je mogoč kadarkoli v zaletu** (po štartu, `tick > 10`).
- Odriv daleč pred robom: smer in hitrost iz **lokalnega naklona zaleta** v tisti točki (`hill.inrunAt(d).theta`),
  potisk pravokotno nanj; kakovost po `takeoffQuality` (bo zelo slaba). Skakalec poleti s strmine.
- **Pristanek na zaletu ali mizi** (`x <= -hill.tableLen` oz. kjerkoli pred robom mize, ko `hag <= 0`) = **padec**:
  `landing.type = 'fall'`, daljava **0**, skakalec zdrsne/obleži (preprosto: faza `out` po zaletu navzdol ali takoj
  `done` po ~1,5 s). Če po takem odrivu vseeno prileti čez rob in pristane na doskočišču, se šteje normalno.
- `hill.groundAt(x)` za `x < 0` že vrača zalet/mizo — uporabi ga za višino nad tlemi.
- Točkovanje, sodniki, kartica rezultata, lestvice: daljava 0 in padec morajo delovati brez napak (rekord, »za vodstvo«,
  statistika). Boti tega ne počnejo — njihovo obnašanje ostane enako (fiksture bota se ne smejo spremeniti).
- Komentator: nov komentar za odriv na zaletu (npr. »Odrinil se je že na zaletu …«) v `texts.js`.

## 4. Orodje za uglaševanje (`?debug=1`)

- Novi parametri se pokažejo med drsniki (skupini »Odriv« in »Telo«) z razumnimi mejami in koraki ter kratkim opisom
  (title/podnapis) v slovenščini.
- Dodaj **prednastavitve**: »Trenutno (privzeto)« in »Poskus DSJ« (tvoj predlog: npr. `autoAssist` 0,3, zmeren
  `backTorque`, ožja okna) — en klik naloži vrednosti, ki jih nato uporabnik popravlja. Prednastavitev ni privzeta igra.
- Obstoječe »Izvozi« naj izvozi JSON, ki ga lahko uporabnik pošlje nazaj; v README zapiši, kako vrednosti preneseš v
  `physics-params.json`.
- Shranjeni parametri v brskalniku (`skoki:params`) veljajo le za isto `paramsVersion` (kot zdaj).
- **Nastavljivost je samo razvojno orodje:** drsniki, prednastavitve in parametri iz brskalnika delujejo le z
  `?debug=1` (kot zdaj v `loadData`). Navadna igra, tekme, pokal, lestvice, ghosti in boti vedno uporabljajo fiksne
  vrednosti iz `physics-params.json` — igralec v igri ne more ničesar nastavljati. Ko uporabnik uglasi vrednosti, se
  vpišejo v `physics-params.json` (nova `paramsVersion`) in postanejo fiksne za vse.

## 5. Verzija fizike, fiksture, testi

- Točka 3 spremeni obnašanje pri vnosih, ki jih je igra prej ignorirala → dvigni **`paramsVersion` na 8** in to
  utemelji v `PROGRESS.md`. Fiksture: `node tools/skoki-fixtures.mjs` (referenčni skoki se ne smejo spremeniti po
  daljavi/tipu, ker ne vsebujejo zgodnjega odriva — preveri in zapiši).
- Testi (`tests/skoki*.js`):
  - s privzetimi vrednostmi (`autoAssist` 1, `backTorque` 0, nove izgube 0) so skoki bota in referenčni skoki enaki kot
    v paramsVersion 7;
  - odriv 1 s pred robom → let s strmine, pristanek na zaletu = padec, daljava 0, `phase` pride do `done`;
  - `autoAssist` 0 brez vnosa → skakalec ne drži položaja (bistveno krajši skok ali padec);
  - `backTorque` > 0 brez popravka → padec na hrbet pogostejši / nagib večji kot pri 0;
  - `qPower` > 1 → isti zamik da nižjo kakovost.
- `tools/skoki-balance.mjs` / »Poženi bote«: boti s privzetimi parametri izpolnijo iste cilje kot prej.

## 6. Dokumentacija in zaključek

- `games/skoki/README.md`: razdelek o novih parametrih (kaj pomenijo, privzeto, kako uglaševati) in o odrivu kadarkoli.
- `PROGRESS.md`: kaj je narejeno, odločitve, kaj ni preverjeno.
- Ta prompt: stanje → ✅ s commitom; `prompts/README.md`: vrstica 31 in seznam »Kaj lahko poženem zdaj«.
- Preverjanja: `node tests/run-node.mjs` zelen; v brskalniku le, da se igra in `?debug=1` naložita brez napak v konzoli,
  da so drsniki in prednastavitve vidni ter da zgoden odriv na zaletu konča skok s padcem. **Igralni občutek preizkusi
  uporabnik sam** — ne uglašuj privzetih vrednosti po svoje.
- Commit v slovenščini na `main`. **Ne pushaj**, razen če uporabnik izrecno reče.
