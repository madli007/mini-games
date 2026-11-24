# Prompt za AI agenta: Smučarski skoki — 1. faza (fizika, kontrole, 3 skakalnice, točkovanje, trening z ghostom)

> **Stanje:** ✅ narejeno — commit `6e7824c` (24. 11. 2026); Supabase migracija pognana

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/11-skoki.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »36. Smučarski skoki«. To je **prva od treh faz**:
> 1. **ta prompt**: fizika, kontrole, sodobna 2,5D grafika, 3 skakalnice, točkovanje po pravih pravilih, trening z ghostom, stran z drsniki;
> 2. `prompts/12-skoki-tekma.md`: tekma do 10 igralcev z replayem v živo, dnevni izziv, več skakalnic in letalnica;
> 3. `prompts/13-skoki-pokal.md`: svetovni pokal (sezona v Supabase), kariera, predmeti v trgovini, skupni športni okvir.
>
> Tekme, boti kot tekmeci, sezona in trgovina **niso** del te naloge. Kodo pa zasnuj tako, da jih naslednji fazi
> dodata brez predelave jedra (deterministična simulacija, vnosi kot edini podatek o skoku, skakalnice kot JSON).

---

## Igra

- **Ime:** Smučarski skoki
- **id / mapa:** `skoki` → `games/skoki/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Zalet, odriv v pravem trenutku, let, ki ga loviš z miško, in telemark. Prava pravila točkovanja, veter in ghosti prijateljev.«
- **Način:** `single` (multiplayer pride v 2. fazi) · **Število igralcev:** 1–1 · **Oznake:** `sport`, `spretnost`, `rekordi`
- **Ikona / barva:** 🎿 · `#4fc3f7`
- **Rezultat:** točke skoka (daljava + slog + kompenzacije). **Več je bolje** (`scoreUnit: 'točk'`). Daljavo hrani v `meta`.

Igra je navdihnjena s smučarskimi skoki kot športom, ni pa kopija nobene obstoječe igre (npr. Deluxe Ski Jump):
grafika, zvok in skakalci so naši. **Ne uporabljaj imen pravih skakalcev, blagovnih znamk, sponzorjev, logotipov
ali zaščitenih imen tekmovanj** (npr. FIS, Novoletna turneja, Raw Air). Skakalnice v tej fazi so izmišljene (z
navdihom slovenske pokrajine). *Dopolnitev (24. 11. 2026):* od 2. faze naprej so dovoljene tudi **prave skakalnice
pod imenom kraja** (npr. »Planica«, »Kulm«) s profilom po njihovem FIS-ovem certifikatu; glej `prompts/12-skoki-tekma.md`.

### Občutek (najpomembnejše)
Igra mora biti **prijetna v prvi minuti in globoka po stotem skoku**. Prvi skok brez navodil naj pristane nekje
pred K-točko brez padca (ali s smešnim padcem), dober igralec po nekaj urah redno skače okoli K-točke, mojster
lovi HS. Vsak skok traja 10–15 sekund, nov skok je **ena tipka** stran (brez nalaganja in menijev vmes).
Napetost gradi zvok: šumenje smuči v smučini, tišina ob odrivu, piš vetra med letom, publika, ki z daljavo glasneje
vpije, in kravji zvonci ob dolgem skoku.

### Faze skoka
1. **Na zaletnem mestu:** skakalec sedi na gredi. Semafor (rdeča → zelena) in odštevanje 10 s, v katerem moraš
   štartati (v treningu brez kazni, v 2. fazi diskvalifikacija). Prikazana sta zaletno mesto (gate) in trenutni veter.
2. **Zalet:** klik / preslednica / tap = štart. Skakalec se spusti v smučino in zavzame držo. Med zaletom
   **držiš** tipko/miško za nizko aerodinamično držo (manj upora). Če jo spustiš, se dvigne in izgubi hitrost.
   Hitrost na mizi je odvisna od zaletnega mesta, drže in malo od vetra (realno: ~75 km/h na mali, ~92 km/h na veliki).
3. **Odriv:** spust tipke / klik **na koncu mize**. Okno je ozko: popoln odriv (±25 ms od idealne točke) dobi »✨«
   in največjo navpično hitrost; ±60 ms je dober; prezgodaj = odriv v zrak pred robom (manjša hitrost, slabši kot),
   prepozno = »padeš z mize« (šibek odriv, nagib naprej, težak začetek leta). Po odrivu skakalca vrti naprej
   (vrtilna količina odriva), kar moraš v prvih desetinkah ujeti.
4. **Let:** z miško (navpični premik ali položaj kazalca glede na skakalca), na telefonu z vlečenjem prsta gor/dol
   (neobvezno nagib telefona) uravnavaš **nagib telesa nad smučmi**. Preveč naprej = vzgon pade, smuči zaniha in padeš
   na nos; preveč nazaj = velik upor (»zavora«) in skakalec »sede«; prav nekje vmes je okno, ki se med letom premika
   (na začetku bolj pokonci, v sredini najbolj naprej, pred pristankom spet pokonci). Veter in sunki te ves čas
   premetavajo, zato **ves čas popravljaš**. Smuči v V-položaju se razprejo samodejno po odrivu.
5. **Pristanek:** **klik** tik pred tlemi (okno ~0,15–0,45 s pred stikom, odvisno od višine nad tlemi) = **telemark**
   (več točk za slog, težji); **držanje** tipke čez stik = **pristanek z obema nogama** (varnejši, sodniki odbijejo
   1–2 točki). Prepozen klik ali pristanek z velikim nagibom/hitrostjo pravokotno na doskočišče = **padec** (ali
   dotik s roko: manjši odbitek). Za HS se doskočišče izravna in udarec je močnejši: telemark daleč za HS je pravi podvig.
6. **Izteče:** skakalec se pelje po iztečišču, dvigne roke ali pa se po padcu kotali v sneg. Med izteklom se pokaže
   daljava, nato **ocene sodnikov** in skupne točke. Ena tipka = nov skok, druga = takojšen replay.

### Fizika (najpomembnejši del, `physics.js` brez DOM-a)
- 2D model v ravnini skakalnice, enote SI, **fiksni korak `STEP = 1/120 s`** z akumulatorjem. Simulacija je
  **popolnoma deterministična**: skok je določen s skakalnico, parametri fizike, seedom vetra, zaletnim mestom in
  zaporedjem vnosov po tickih. To je temelj za ghoste, replaye in multiplayer v 2. fazi.
- **Determinizem med brskalniki:** `Math.sin/cos/atan2/exp/pow` niso zagotovljeno enaki do zadnjega bita na vseh
  pogonih. V simulaciji uporabljaj lasten modul (`dmath.js`: polinomski približki ali tabele z interpolacijo;
  `Math.sqrt` in osnovne operacije so po IEEE natančne). Brez `Date.now()`, `performance.now()` in `Math.random()` v simulaciji.
- **Zalet:** gravitacija po profilu smučine, trenje smučine (v smučini je led: majhno), zračni upor glede na držo.
  Prehod iz zaleta v mizo z radijem. Vsako zaletno mesto naj spremeni hitrost na mizi za ~0,5–0,7 km/h.
- **Odriv:** navpični impulz pravokotno na mizo (do ~2,5–3 m/s) in vrtilni impulz, oba odvisna od napake tajminga.
- **Let:** stanje = položaj, hitrost, nagib telesa, kotna hitrost. Relativni veter = hitrost − veter. Napadni kot
  smuči `α` določa vzgon in upor: `L = ½ρv²·A·CL(α)`, `D = ½ρv²·A·CD(α)`, krivulji `CL`, `CD` in navor `CM(α)`
  sta **tabeli z interpolacijo v parametrih** (ne trdo kodirani v formulah), da jih lahko uglašuješ na strani z drsniki.
  Vhod igralca nastavi **ciljni nagib**, telo mu sledi z zakasnitvijo (PD regulator z omejenim navorom), zato
  vhod ni takojšen in je treba predvidevati.
- **Veter (`wind.js`):** iz seeda: povprečna smer in jakost (−3 do +3 m/s, + je čelni/ugoden), počasna sprememba
  vzdolž doskočišča in kratki sunki (šum, vrednosti po času in položaju). Veter vpliva na let (in malo na zalet).
  Za točkovanje izmeri povprečje kot na tekmah (npr. v 5 točkah vzdolž leta). Veter je viden: zastavice ob doskočišču,
  puščica in številka v HUD-u, zelena (čelni) / rdeča (hrbtni) barva.
- **Pristanek:** stik prve smuči z doskočiščem. Daljava = razdalja **po profilu** od roba mize do točke stika
  (sredina stopal), **zaokrožena navzdol na 0,5 m**. Padec, če je hitrost pravokotno na pobočje (ekvivalentna višina
  padca) prevelika za izbrano vrsto pristanka ali je nagib telesa izven okna. Telemark je kakovosten glede na tajming klika.
- **Parametri** so v `games/skoki/physics-params.json` (en sam vir resnice) in jih berejo igra, testi, orodja in
  stran z drsniki. Verzija parametrov (`paramsVersion`) gre v vsak ghost, da star ghost ne predvaja napačno.

### Stran z drsniki (`?debug=1`)
Tveganje igre je ravnotežje v letu (prelahko je dolgočasno, pretežko frustrira), zato je to obvezen del te faze:
- Plošča z drsniki po skupinah: zalet, odriv (okna, impulzi), aerodinamika (urejevalnik točk krivulj `CL`, `CD`, `CM`
  z grafom), regulator telesa, veter, pristanek (okna, prag padca), sodniki.
- Med skokom: graf trajektorije, `α`, hitrosti, višine nad tlemi in vhoda; po skoku primerjava trajektorije z
  zadnjimi 5 skoki ali z ghostom (prekrivanje krivulj).
- Gumbi: ponovi zadnji skok z istimi vnosi in novimi parametri (takoj vidiš učinek spremembe), shrani/naloži v
  `localStorage`, **izvozi JSON** (ki ga lahko prilepiš v `physics-params.json`), ponastavi.
- Gumb »Poženi bote« (glej spodaj): 50 skokov na izbrani skakalnici za tri ravni spretnosti in povzetek (povprečna
  daljava, % padcev, % čez HS, povprečne točke).

### Bot (`bot.js`, brez DOM-a)
- Simuliran skakalec s parametrom **spretnosti 0–1**: napaka tajminga odriva in pristanka (Gauss), reakcijski zamik
  in šum pri vodenju nagiba. Bere stanje simulacije in vrača vnose po tickih (kot igralec).
- Uporaba v tej fazi: testi uravnoteženosti, orodje `tools/skoki-balance.mjs` in »razvijalčevi ghosti« za primerjavo.
  V 2. fazi bodo boti tekmeci, zato naj bo API čist (`createBot({ skill, seed })`, `bot.input(state) → vnos`).
- **Cilji uravnoteženja** (testi jih preverijo na vseh skakalnicah z dovolj skoki):
  - spretnost 0,3: ≤ 30 % padcev, povprečje ~K − 15 m;
  - spretnost 0,7: povprečje K ± 5 m, ≤ 10 % padcev;
  - spretnost 1,0: povprečje med HS − 6 m in HS + 2 m, preskok HS v manj kot polovici skokov;
  - čelni veter +2 m/s v povprečju podaljša skok za realnih ~10–15 m na veliki skakalnici, hrbtni ga skrajša.

### Skakalnice (3 v tej fazi)
Skakalnice so **podatki, ne koda**: `games/skoki/hills/<id>.json` in `hills/index.json` (vrstni red). Profil se
**izračuna iz parametrov** (`hill.js`), ne riše na roke: naklon zaleta, dolžina zaleta in položaji zaletnih mest,
radij prehoda, naklon in dolžina mize, višina mize nad doskočiščem, profil doskočišča (grbina, naklon ~35°,
točki K in HS, izravnava), iztečišče. Geometrijo zgradi po smiselnih (FIS-u podobnih) razmerjih, da izgleda in
deluje prav. Poleg geometrije: `name`, `k`, `hs`, `meterValue`, `base` (60 ali 120), `windFactors { head, tail }`,
`gateFactor`, `gates` (število in privzeto), `theme` (čas dneva, nebo, okolica, publika), `records` ne (rekordi so v lestvicah).

| id | Ime (predlog) | K / HS | Značaj |
|---|---|---|---|
| `brezova` | Brezova (mala) | K60 / HS68 | odpustna, nizek let, učenje tajminga; jutro, gozd |
| `bistra` | Bistra (srednja) | K95 / HS106 | prava skakalnica, veter začne šteti; sončno popoldne ob jezeru |
| `orlova` | Orlova (velika) | K125 / HS140 | dolg let, popravljanje v letu, telemark je težak; zahajajoče sonce, gore |

Imena, številke in teme lahko prilagodiš, ostati pa morajo izmišljena. Validator skakalnic (`validateHill`) preveri
obvezna polja, smiselne razdalje (K < HS, profil brez lukenj, miza nad doskočiščem) in vrne razumljive napake.

### Točkovanje (`scoring.js`, po pravih pravilih)
- **Daljava:** `base` točk na K-točki (60, na letalnicah 120) ± `(daljava − K) × meterValue`. Vrednost metra po
  K-točki (preveri tabelo FIS, npr. K60–69 → 2,4; K80–99 → 2,0; K100–169 → 1,8; K170+ → 1,2). Točke ne morejo biti negativne.
- **Slog: 5 sodnikov**, vsak do 20 točk v korakih po 0,5; **najvišja in najnižja ocena se ne štejeta** (največ 60).
  Ocena izhaja iz merljivega v simulaciji: mirnost leta (nihanje nagiba, popravki, »mahanje z rokami« ob nestabilnosti),
  vrsta in kakovost pristanka (telemark: tajming in razkorak; dve nogi: −1 do −2), mirnost na izteku, padec ali dotik
  (velik odbitek, padec ~8–11 točk pri sodniku). Vsak sodnik doda svoj majhen deterministični šum (iz seeda skoka),
  da ocene niso enake, a so poštene.
- **Kompenzacija vetra:** točke na m/s po `windFactors` (hrbtni veter dobi več kot čelni, kot v pravilih).
  **Kompenzacija zaletnega mesta:** nižje zaletno mesto od referenčnega = plus točke (`gateFactor`).
- **Rezultatna kartica v slogu TV prenosa:** daljava, točke za daljavo, pet ocen (prečrtani najvišja in najnižja),
  veter in kompenzacija, zaletno mesto in kompenzacija, skupaj, uvrstitev med lastnimi skoki / lestvico.
- Vse v ločenem modulu s testi (tudi robni primeri: padec, točno na K, preskok HS, negativna kompenzacija).

### Načini (v tej fazi)
1. **Trening:** izbereš skakalnico, zaletno mesto in veter (izklopljen / stalen z izbiro / naključen). Neomejeno
   skokov, ena tipka za nov skok, takojšen replay. **Ghost**: prosojen skakalec tvojega najboljšega skoka na tej
   skakalnici in, po izbiri, rekorda prijatelja (klik na vrstico lestvice). Ghost ima svoj veter in vnose, zato
   leti točno tako kot takrat. Statistika seje (povprečna daljava, najdaljši, padci).
2. **Rekord skakalnice:** trije skoki pod pogoji, ki jih določi igra (privzeto zaletno mesto, naključen veter iz
   seeda poskusa), **šteje najboljši skok**. Ta gre na lestvico skakalnice. Jasno označi, da je trening brez lestvice.

### Ghosti in lestvice
- Lestvice prek `hub.submitScore(točke, { seed: 'hill:<id>', meta: { dist, wind, gate, style } })`, branje z
  `ui.leaderboard` (zavihki Danes / Teden / Vseh časov), prikaz točk in daljave (»131,5 m · 142,3 t«).
- **Ghost = seed vetra + zaletno mesto + vnosi po tickih + `paramsVersion`**, stisnjeno (vnos se spremeni redko:
  zapiši le spremembe, kvantizirano, base64; cilj < 4 KB). Lokalno vedno shrani svoj najboljši skok na skakalnico.
- `hub.saveGhost`/`hub.getGhosts` sta narejena za čas (manj je bolje). Za skoke **razširi API nazaj združljivo**
  (npr. neobvezen `order: 'desc'` ali shranjevanje `timeMs` kot točke z obratno primerjavo v RPC igre) tako, da
  oba adapterja delujeta in da se **Hrčkova krogla ne spremeni** (njeni testi ostanejo zeleni). Za Supabase
  naredi `supabase/games/skoki.sql` po vzoru `krogla.sql`: `skoki_ghosts`, RPC `skoki_save_ghost`, ki shrani le
  boljši rezultat, omeji velikost in zavrne nemogoče točke (npr. nad mejo, izračunano iz HS skakalnice). API
  dokumentiraj v `shared/README.md`.

### Kontrole (povzetek, prikaži v »Kako igrati«)
- **Miška:** klik = štart, držanje = drža v zaletu, spust = odriv, premik gor/dol = nagib v letu, klik = telemark,
  držanje = pristanek z obema nogama. **Tipkovnica:** preslednica za akcije, ↑/↓ (ali W/S) za nagib.
- **Telefon:** tap = štart, prst na zaslonu = drža, dvig prsta = odriv, vlečenje gor/dol = nagib (relativno na mesto
  dotika), tap = telemark. Velika površina za dotik, `touch-action: none` na igralni površini. Neobvezno nagib telefona
  (`deviceorientation`, na iOS dovoljenje ob tapu).
- `R` = takoj nov skok, `Enter` = replay, `Esc`/`P`/⏸ = pavza. Ko zavihek ni viden, se igra ustavi.
- Prvi skok na vsaki napravi ima **kratke namige na zaslonu** v pravem trenutku (»Drži …«, »Zdaj spusti!«,
  »Nagni se naprej«, »Klik za telemark«), ki se ugasnejo po treh uspešnih skokih (shrani v `storage`).

### Videz (sodoben, »premium«, ne prototip)
Smer: **2,5D**, fizika je 2D, izris je 3D v slogu sodobnega TV prenosa. Čista, nekoliko stilizirana miniatura s
fizikalno pravilnimi materiali in svetlobo. Vsaka skakalnica ima svojo prepoznavno lokacijo in razpoloženje.
**Berljivost je nad lepoto:** rob mize, črte daljave, K in HS ter skakalčev nagib morajo biti vedno jasno vidni.
- **Three.js `0.160.0`** prek CDN z `<script type="importmap">` (jedro in dodatki `examples/jsm/…` iste verzije).
  Poglej `games/krogla/render/` (`post.js`, `sky.js`, `textures.js`, `materials.js`): pomožne module lahko **uvoziš**,
  če ustrezajo, **ne kopiraj in ne spreminjaj** jih tako, da bi se spremenila Krogla.
- `ACESFilmic` (ali AgX) tone mapping, sRGB, IBL iz proceduralnega okolja (`PMREMGenerator`), mehke sence, ki sledijo
  skakalcu, megla in atmosferska perspektiva za gore v ozadju, nebo s soncem in oblaki po temi skakalnice.
- **Skakalnica:** jeklena konstrukcija zaletnega stolpa (rešetka, stopnice, kabina trenerjev), zaletna smučina z
  ledenimi žlebovi, miza, doskočišče iz zbitega snega (proceduralna normal map s »bleščicami« na visoki kakovosti),
  **črte daljave** vsakih 5 m s številkami, rdeča/modra črta K in HS, iztečišče z ograjo in reklamnimi panoji z
  izmišljenimi napisi (ali imeni iger huba). Smreke in publika z zastavami kot `InstancedMesh` (zastave valovijo v
  vertex shaderju), sneženje kot delci (skalirano po kakovosti).
- **Skakalec:** proceduralni 3D model iz preprostih oblik z zglobi (smuči, noge, trup, roke, čelada, očala), poze in
  animacija izhajajo iz stanja simulacije (drža, odriv, V-položaj, nagib, mahanje z rokami, telemark, padec s
  kotaljenjem). **Videz je parameter** (`skin`: dres, čelada, smuči, zastava), ker bo trgovina v 3. fazi prodajala
  opremo. Fizika je za vse skine enaka. Ghost je prosojen, z rahlim sijem.
- **Kamera:** v zaletu od strani in rahlo spredaj, ob odrivu kratek zamik, med letom sledi od strani z mehkim
  oddaljevanjem, pred pristankom približa; **počasen posnetek** zadnjih metrov pri dolgem skoku (samo izris, simulacija
  teče po tickih). **Replay** po skoku z drugimi kotoma (spredaj ob mizi, od spodaj na doskočišču) in časovno osjo.
- **Post-processing:** nežen bloom (reflektorji, sneg na soncu), barvna korekcija, vinjeta, SMAA/FXAA. Vse je mogoče
  izklopiti; spoštuj `prefers-reduced-motion` (brez tresenja kamere, manj delcev, brez počasnih posnetkov).
- **Kakovost:** stopnje Nizka/Srednja/Visoka in samodejno zniževanje pod ~45 FPS (kot v Krogli), `?q=low|med|high`.
- **HUD in grafike** v slogu sodobnega prenosa (steklen, pol prosojen trak spodaj, `ui.css` barve): ime in avatar
  (`ui.who(hub.profile)`), skakalnica in zaletno mesto, veter (puščica + m/s), hitrost na mizi v km/h, po pristanku
  velik »semafor« z daljavo, nato rezultatna kartica. Med letom **»zelena črta«** na doskočišču pokaže tvoj rekord
  (ali rekord ghosta), da vidiš, ali ga boš preskočil.
- Brez slikovnih datotek, vse iz geometrije in proceduralnih tekstur (canvas/shader).

### Zvok
WebAudio, sintetizirano: šumenje smuči v smučini (višina tona po hitrosti), »klik« odriva, piš vetra v letu (po
hitrosti in `α`), publika, ki z daljavo narašča, kravji zvonci in trobente ob skoku čez K, mehak udarec pristanka,
hrup padca, signal semaforja. Preprosta glasba v meniju. Gumb za izklop (shranjen).

### Komentator
Kratki slovenski napisi ob dogodkih (vsaj ~30, naključno iz skupine, brez ponavljanja zaporedoma): »Popoln odriv!«,
»Zamudil mizo …«, »Leti, leti, leti!«, »Čez HS! Publika je ob pamet.«, »Snežni angel.«, »Telemark kot iz učbenika.«,
»Veter je bil danes na tvoji strani.«, »Ta je padel bolj v smeri iztečišča.« …

### Povezava s hubom
- `await hub.init({ gameId: 'skoki' })`, `ui.header({ title: 'Smučarski skoki' })`.
- **`hub.reportGame({ won: false, players: 1, score, daily: false })`** po vsakem končanem »Rekordu skakalnice«
  in v treningu največ enkrat na minuto (da se ne »farma«).
- `hub.reportEvent`: `skoki:skok` (vsak skok brez padca), `skoki:k` (skok do ali čez K), `skoki:hs` (do ali čez HS
  brez padca), `skoki:tocke` (vrednost = točke skoka), `skoki:telemark`.
- **XP:** 15 za končan »Rekord skakalnice«, +25 za nov osebni rekord skakalnice, +10 za skok čez HS brez padca.
- **Dosežki (vsaj 8):** `prvi-skok`, `k-tocka` (prvič čez K), `hs` (do HS brez padca), `popoln-odriv` (✨),
  `telemark-19` (vsi štirje šteti sodniki ≥ 19), `snezni-angel` (prvi padec), `vse-tri` (čez K na vseh treh
  skakalnicah), `zavora` (pristanek pred polovico K: šala), `veter-v-hrbet` (čez K s hrbtnim vetrom ≥ 2 m/s),
  `stotica` (100 skokov).
- **Naloge v `games.json`:** `e` »Skoči 10 skokov brez padca« (`skoki:skok`, 10), `m` »Preskoči K-točko« (`skoki:k`, 1),
  `h` »Doseži 130 točk v enem skoku« (`skoki:tocke`, `gte`, 130), `w` »Skoči 50 skokov ta teden« (`skoki:skok`, 50).

### Tehnično (moduli)
`dmath.js`, `physics.js`, `wind.js`, `hill.js` (gradnja profila, validator), `scoring.js`, `judges.js`, `bot.js`,
`ghost.js` (zapis, stiskanje, predvajanje), `replay.js`, `input.js`, `render/` (scena, skakalnica, skakalec, publika,
kamera, post), `hud.js`, `audio.js`, `debug.js` (stran z drsniki), `game.js` (stanja: meni, zaletno mesto, skok,
izteke, rezultat, replay, pavza). Vse čisto (brez DOM-a) gre v teste. Razvojni parametri: `?hill=<id>`, `?debug=1`,
`?bot=0.7` (skače bot z izbrano spretnostjo, za preverjanje celotne zanke), `?q=…`, `?offline=1`.

### Ni del te naloge (naslednji fazi)
- Tekma s prijatelji, replay v živo, boti kot tekmeci, dnevni izziv, letalnica in dodatne skakalnice (2. faza).
- Svetovni pokal, kariera, predmeti v trgovini, skupni športni okvir (3. faza).

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«). **Vrstni red dela:** najprej fizika, bot in točkovanje s testi (brez grafike),
nato preprost izris in uglaševanje občutka na strani z drsniki, šele nato sodobna grafika in zvok.

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `ui`) s primeri, posebej ghosti in lestvice.
3. `games/reakcija/` — referenčna igra (lestvice, `reportGame`).
4. `games/krogla/README.md`, `games/krogla/physics.js`, `ghost.js`, `render/` — fiksni korak, ghosti, renderer in
   kakovostne stopnje. `supabase/games/krogla.sql` — vzor za tabelo ghostov.
5. `prompts/TEMPLATE-igra.md` — fiksni del, ki velja tudi tukaj.

### Tehnično (iz predloge)
- Igra v `games/skoki/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini s šumniki.
- `<body class="mg">`, `../../shared/ui.css` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- Uporabi `shared/` za profil, XP, dosežke, lestvice, `ui.toast`, `ui.modal`, `ui.countdown`, `ui.results`.
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- `supabase/games/skoki.sql` idempotenten, RLS vklopljen, predpona `skoki_`, `security definer` funkcije v `private`,
  v `public` le `security invoker` ovojnice. Če imaš Supabase MCP orodja, ga poženi kot migracijo, preveri
  `get_advisors` (security + performance) in popravi opozorila; z lažnimi JWT preizkusi tuj zapis, preveliki `data`,
  slabši rezultat in nemogoče točke. Sicer zapiši v `PROGRESS.md`, kaj mora uporabnik pognati.
- Testi v `tests/tests.js`: determinizem (isti vnosi dvakrat = bit za bit enaka trajektorija; neodvisnost od FPS
  izrisa), zalet (višje zaletno mesto = večja hitrost, monotono), okno odriva, vpliv vetra (čelni podaljša), padec
  (prepozen klik, prevelik nagib), merjenje daljave (zaokroževanje na 0,5 m), točkovanje (vse komponente, sodniki
  brez najvišje in najnižje), validator na vseh skakalnicah, ghost (zapis → stiskanje → predvajanje da isto daljavo,
  velikost pod mejo), **cilji uravnoteženja z botom** na vseh treh skakalnicah. Testi Krogle in Rušilca ostanejo zeleni.
- `tools/skoki-balance.mjs` (brez npm): izpiše tabelo po skakalnicah in spretnostih; rezultat zadnjega zagona
  zapiši v `games/skoki/README.md`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v Krogli in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi nespremenjeni).
4. V brskalniku **sam skoči** vsaj 10 skokov na vsaki skakalnici (z miško in s tipkovnico): preveri vse faze, popoln
   in zgrešen odriv, telemark in dve nogi, padec, ghost, replay, rekord skakalnice, oddajo na lestvico in
   `reportGame` (kovanci in napredek nalog na dashboardu). Z `?bot=0.7` preveri celotno zanko igre.
5. **Občutek:** zapiši v `PROGRESS.md`, kako se igra počuti (kaj je pretežko, kaj prelahko) in kaj si uglasil na
   strani z drsniki. Prvi skok brez znanja ne sme biti frustrirajoč.
6. Offline (`?offline=1`) in s Supabase (`?igralec=1`, `?igralec=2`): drugi igralec vidi rezultat na lestvici in
   lahko izbere tujega ghosta.
7. Izgled na **telefonu (375×812)** z dotikom in na **namizju**: posnemi zaslone vseh faz skoka in rezultatne
   kartice, sam jih preglej in popravi, kar je neurejeno. FPS na telefonski emulaciji razumen.
8. V `games.json` dodaj vnos igre kot **`live`** z nalogami (in preveri, da test sheme uspe).
9. Posodobi `PROGRESS.md`, `README.md` (seznam iger) in napiši `games/skoki/README.md` (kontrole, fizika in parametri,
   format skakalnice, kako dodati skakalnico, točkovanje, format ghosta, rezultati uravnoteženja).
10. Testne profile in ghoste, ki jih ustvariš v produkcijski bazi, na koncu **izbriši**.
11. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kako težke so skakalnice (tabela iz orodja
za uravnoteženje), kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
