# Prompt za AI agenta: Kresnik (1. del: motor, gibanje, 1. svet, zemljevid, svetilke, medalje, ghost)

> **Stanje:** ⬜ čaka — predpogoj 01 ✅

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/36-kresnik.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »61. Kresnik (klasični platformer)«. V `games.json` že obstaja vnos `kresnik`
> s statusom `soon`; ta prompt doda `scoreOrder`, naloge in ga preklopi v `live`.
>
> **Obseg tega prompta:** motor igre, junak, prvi svet (6 nivojev + šef), zemljevid, shranjevanje, medalje, ghost
> in drsniki. Svetova 2–3 (`37-kresnik-svetova.md`), svetova 4–5 s finalom (`38-kresnik-finale.md`) in urejevalnik z
> dnevnim nivojem (`39-kresnik-urejevalnik.md`) so že napisani. Na koncu jih **posodobi** z dejanskimi spoznanji
> (glej zadnji razdelek).

---

## Igra

- **Ime:** Kresnik
- **id / mapa:** `kresnik` → `games/kresnik/` (vnos v `games.json` že obstaja; posodobi ga)
- **Kratek opis (za kartico, do 160 znakov):** »Klasični 2D platformer: s svetlobno kroglo skozi poslikane svetove
  slovenskih pripovedk. Prižgi svetilke in vrni Sonce.« (že v `games.json`)
- **Način:** `single` · **Število igralcev:** 1 · **Oznake:** `platformer`, `arkada` (`daily` od prompta 39)
- **Ikona / barva:** ✨ · `#ffb347` (ali boljša, če se tepe z drugimi karticami)
- **Rezultat:** čas nivoja v ms (lestvica po nivoju, način »Na čas«). **Manj je bolje** (`scoreOrder: 'asc'`).

### Navdih in avtorstvo (pomembno)
Igra je v duhu klasičnih 2D platformerjev iz 90. let, posebej **občutka** prvega Raymana: poslikani svetovi z
globino, živahne animacije, sposobnosti, ki se odklepajo, zemljevid s potjo, šefi, »skrivnosti« v vsakem nivoju in
precej zahteven, a pošten nivo izziva. **Ne kopiraj** nobenega lika, imena, nivoja, glasbe ali videza obstoječe igre:
junak ni brez okončin z lebdečimi rokami, ni ujetih bitij v kletkah, ni znanih imen. Vse je naše in temelji na
slovenskih pripovedkah in pokrajinah.

**Zgodba (kratka, na začetku igre 3–4 slike z besedilom, preskočljivo):** Coprnica **Mora** je ukradla Sonce in ga
razbila na šest drobcev. Dežela tone v mrak. Kresnik, majhen svetlobni duh, se prebudi na jasi na Pohorju in se
odpravi prižigat ugasle svetilke ter iskat drobce.

### Jedro: občutek gibanja (najpomembnejše)
- **Lastna deterministična fizika** (brez knjižnice) na mreži ploščic: AABB junak, ploščice (polne, enosmerne
  ploščadi, klančine 45° in 22,5°), **fiksen korak 120 Hz** (akumulator, največ ~8 korakov na sličico, pri zaostanku
  upočasni, ne preskakuj). Vhod se vzorči na korak. Fizika je čist modul brez DOM-a → isti vnosi dajo isti izid
  v brskalniku in v Node.
- **Tek:** pospešek in pojemek (tla in zrak ločeno), največja hitrost, rahel zdrs pri obratu, ne lebdi.
- **Skok:** spremenljiva višina (spust tipke prereže hitrost navzgor), **coyote time** ~100 ms, **buffer skoka**
  ~120 ms, močnejša gravitacija pri padanju (občutek teže), omejena hitrost padanja, »apex hang« (malo manjša
  gravitacija na vrhu skoka). Skok s klančine je naraven, ne katapult.
- **Oprijem roba:** če skočiš ob rob ploščadi in si z rokami nad robom, se Kresnik obesi; gor = splezaj, dol = spusti.
- **Svetlobna krogla (napad):** držiš tipko → krogla se nabija (do ~0,8 s, vidno raste); spust → odleti vodoravno,
  domet glede na naboj, nato se **vrne k Kresniku kot bumerang** (tudi skozi sovražnike, ne skozi stene). Ena
  krogla naenkrat. Omami sovražnika (večina) ali ga premaga (šibki), prižge svetilko, sproži stikalo. Lahko streljaš
  med skokom in v počepu (nizko).
- **Počep** (dol na tleh): nižji AABB, počasnejši tek pod nizkimi stropi.
- **Poškodba:** dotik sovražnika ali nevarnosti → −1 srce (3 srca, kasneje 4 z nadgradnjo), kratek odboj in
  nepremagljivost ~1,2 s (utripanje). Bodice, prepad in voda brez sposobnosti = takojšnja smrt.
- **Stran z drsniki `?debug=1`** (po vzoru `games/skoki/debug.js`): pospeški, največja hitrost, gravitacija gor/dol,
  višina skoka, coyote, buffer, apex hang, domet in hitrost krogle, nepremagljivost. Shrani/naloži v `localStorage`
  (velja **le** z `?debug=1`), izvoz JSON za vpis v `config.js`. Brez `?debug=1` vedno fiksne vrednosti iz `config.js`.
  Prikaži diagnostiko (hitrost, stanje: tla/zrak/rob, coyote, buffer) in AABB-je.
- **Testni nivo »Poligon«** (`?level=poligon`, v meniju pod »Razvoj« z `?debug=1`): stopnice različnih višin,
  prepadi 2–6 ploščic, klančine, enosmerne ploščadi, nizek strop, rob za oprijem, tarče za kroglo. Najprej uglasi
  na njem. Končne vrednosti in merila (najdaljši preskok, najvišji skok v ploščicah) zapiši v `PROGRESS.md`
  in `README.md` igre — iz njih izhaja oblikovanje nivojev.
- **Merilo občutka** (preveri sam in zapiši): kratek pritisk = nizek skok, dolg = visok; obrat v zraku je odziven;
  pristanek ima težo; po robu se ne drsa nenamerno; skok »tik ob robu« vedno uspe zaradi coyote; krogla je
  zadovoljiva (zvok, odboj, sled).

### Nivoji
- **Format:** `games/kresnik/levels/w1-01-jasa.json` + `levels/index.json` (svetovi, vrstni red, šefi). Predlog:
  ```json
  { "id": "w1-01", "name": "Jasa", "world": 1, "theme": "gozd", "music": "gozd",
    "tile": 32, "w": 180, "h": 24,
    "tiles": ["....", "...."],                       // vrstice znakov; legenda v README (# polna, = enosmerna, / \ klančine, ^ bodice, ~ voda …)
    "entities": [ { "type": "svetilka", "x": 40, "y": 12, "hidden": false },
                  { "type": "iskrica", "x": 10, "y": 18 },
                  { "type": "gobec", "x": 55, "y": 20, "patrol": [50, 62] },
                  { "type": "kontrola", "x": 90, "y": 20 } ],
    "start": { "x": 2, "y": 20 }, "exit": { "x": 176, "y": 19 },
    "medals": { "gold": 52000, "silver": 70000, "bronze": 100000 }, "dev": 48000 }
  ```
  **Validator** (`validateLevel` → seznam napak v slovenščini): mere, znane ploščice in entitete, start in izhod
  na tleh, točno 6 svetilk, vsaj ena kontrolna točka pri nivojih > 60 s. Uporabil ga bo tudi urejevalnik (39).
- **Entitete 1. sveta (vsaj):** iskrica, svetilka (ugasla → prižgana), srce, **kontrolna točka** (kres, ki zagori),
  izhod (portal svetlobe), **premična ploščad** (po poti in času, deterministično iz časa nivoja), **padajoča
  ploščad** (po dotiku), **gobja trampolina** (odbije visoko), **stikalo** + vrata, skrivni prehod (ploščice, ki
  izginejo, ko si v njih ali jih zadene krogla), dekor.
- **Sovražniki 1. sveta (vsaj 4):** *gobec* (patruljira, pade z roba ne), *trnovček* (bodičast, krogla ga le omami),
  *sraka* (leti v loku, ukrade iskrico, če te zadene), *ježek* (zvije se v kroglo in se kotali). Vsak ima jasen
  vzorec, ki ga je mogoče prebrati.
- **1. svet: Pravljični gozd (Pohorje)** — **6 nivojev** (vsak 45–120 s za dobrega igralca, rahlo naraščajoča
  težavnost, vsak uvede eno novo idejo), nato **šef Gobji kralj** (arena na enem zaslonu, 3 faze, vzorci napadov,
  ranljiv po omami s kroglo, 6 zadetkov). Nagrada: **prvi drobec Sonca**.
- **Svetilke:** 6 na nivo, vsaj 2 skriti (skrivni prehod, stranska pot, nad zaslonom). Prižgane svetilke se
  štejejo **le ob prihodu do izhoda** (klasično); ko so enkrat shranjene, jih pri ponovni igri ni treba znova
  prižgati za napredek (vidne so kot medlo prižgane), za **zlato medaljo** pa jih moraš v tisti vožnji prižgati
  vseh 6. Zapiši v README.
- **Preverjanje nivojev:** `tools/kresnik-levels.mjs` (po vzoru `tools/krogla-levels.mjs`) preveri vse nivoje z
  validatorjem in **predvaja posnetke vnosov**: v brskalniku `?record=1` posname vnose (izvoz kot `route` v JSON
  nivoja ali v `levels/routes/`), orodje jih v Node predvaja z isto fiziko in preveri, da pride do izhoda (in na
  posebni poti pobere vseh 6 svetilk). Iz časa posnetka izračuna medalje z **eno izvoženo funkcijo** (`rules.js` →
  `medalsFromDev(devMs)`; zlato ≈ 1,1 × dev, srebro ≈ 1,4 ×, bron ≈ 2 × — uglasi). Nivo brez veljavnega posnetka
  ne gre v igro. Rezultat zapiši v `PROGRESS.md`.

### Zemljevid, shranjevanje, življenja
- **Zemljevid sveta:** poslikana pokrajina, pot med vozlišči (nivoji, šef), odklenjena vozlišča svetijo, ob vozlišču
  pokaži ime, prižgane svetilke (x/6), najboljši čas in medaljo. Premikaš se s puščicami ali tapom. Svetova 2+ sta
  vidna, a zaklenjena (»Kmalu«).
- **Shranjena igra:** 3 reže (kot stare igre) v `shared/storage.js` (ključ s predpono `kresnik:`): odklenjeni nivoji,
  prižgane svetilke po nivoju, iskrice, drobci, najboljši časi, način.
- **Način ob ustvarjanju reže:** **Klasika** (3 življenja, +1 na 100 iskric, ob izgubi vseh »Konec igre« → nazaj na
  zemljevid, napredek nivojev ostane) ali **Brez življenj** (smrti se le štejejo). Lestvice in medalje so za oba enake.
- Po smrti: vrnitev na zadnjo kontrolno točko; iskrice in svetilke po kontrolni točki se vrnejo, prej pobrane
  ostanejo.

### Točkovanje in medalje
- **Medalja nivoja:** zlato = čas ≤ zlati **in** vseh 6 svetilk; srebro = čas ≤ srebrni; bron = izhod in čas ≤
  bronasti; sicer »Končano«. Natančno v `rules.js` s testi. Povzetek: »Svetilke 5/6 · Iskrice 84 · Čas 1:12,40 · Srebro«.
- **Lestvica po nivoju** (čas; po vzoru Krogle, glej `games/krogla/game.js` za lestvico po progi), **lestvica šefa**
  (čas do zmage). Skupna lestvica sveta: vsota najboljših časov (le, če so prevoženi vsi nivoji).
- Odklepanje: naslednji nivo po izhodu prejšnjega; šef po vseh 6 nivojih; 2. svet po šefu (ko obstaja).

### Ghost
- Snema se kot **položaji** (x, y, stanje animacije, smer) po vzoru `../krogla/ghost.js` (`Recorder`, `encode`,
  `decode`, `sampleAt`). Krogle ne spreminjaj; po potrebi razširi kanale v svojem `ghost.js`.
- Način **»Na čas«** za odigran nivo: ghost *moj rekord* (lokalno) in *najboljši/prijatelj* iz Supabase: tabela
  `kresnik_ghosts` v `supabase/games/kresnik.sql` po vzoru `krogla_ghosts` (en ghost na igralca in nivo, pisanje le prek
  RPC `kresnik_save_ghost` ob boljšem času, omejena velikost, `kresnik_levels` z zlatimi časi za zavrnitev nemogočih
  časov; RLS, `security definer` v `private`, ovojnica `security invoker` v `public`). Offline: le lokalni ghost.
- Ghost je prosojna silhueta Kresnika s tanko sledjo.

### Grafika (Canvas 2D, »poslikan« videz)
- **Canvas 2D**, brez knjižnic. Notranja ločljivost skalirana na zaslon (npr. višina 18 ploščic na zaslonu),
  `devicePixelRatio` upoštevan, ostri robovi likov.
- **Plasti:** nebo (gradient + mehki oblaki), 3–4 plasti paralakse (oddaljeni hribi, gozd, bližnja drevesa),
  igralna plast, sprednja plast (listje, trava, ki rahlo prekrije sliko). Vse narisano **proceduralno** (poti, gradienti,
  šum) ali kot **SVG/PNG, ki ga narišeš sam in shraniš v repo** (`games/kresnik/art/`). Tujih slik, sprite sheetov ali
  fontov z nejasno licenco ne uporabljaj.
- **Ploščice** niso kocke: zgornji rob z mahom/travo, zaobljeni robovi, notranjost s teksturo zemlje/korenin,
  rahle razlike med sosednjimi (iz seeda položaja). Ploščice se predrišejo v predpomnilnik (offscreen canvas po kosih).
- **Kresnik:** majhen lik iz svetlobe (glava s kapico/plamenom, telo, roke, noge — vse povezano, ne lebdeče),
  sestavljen iz delov in animiran kodno: tek, skok, padanje, pristanek (squash & stretch), oprijem, plezanje,
  nabijanje krogle, poškodba, zmaga. Svetloba okoli njega (radialni gradient) v temnejših delih nivojev.
- **Svetilke** ob prižigu zasvetijo in osvetlijo okolico (lokalni gradient), s tem se nivo vidno »prebuja«. To je
  ključni vizualni občutek igre.
- **Učinki:** iskrice ob pobiranju, prah ob pristanku, sled krogle, konfeti/svetloba ob izhodu, tresljaj ob šefu
  (izklopljivo, spoštuj `prefers-reduced-motion`).
- **Kamera:** sledi z mrtvo cono, pogleda naprej v smeri gibanja, navpično sledi pristankom (ne vsakemu skoku),
  omejena na meje nivoja.
- **HUD:** srca, iskrice, svetilke x/6, življenja (Klasika), čas (v »Na čas« in vedno v kotu, majhno).
- **Zmogljivost:** 60 FPS na srednjem telefonu; meri čas sličice in zapiši. Če ne gre, zmanjšaj plasti paralakse
  (samodejna kakovost).

### Zvok in glasba
- Lastna sinteza (Web Audio) po vzoru `../rusilec/sound.js`: skok, pristanek, iskrica (višina tona raste v nizu),
  svetilka, krogla (nabijanje, met, vrnitev), zadetek, poškodba, smrt, kontrolna točka, izhod.
- **Glasba:** preprost proceduralni sekvencer (2–3 glasovi, ponavljajoč se motiv, ~60–90 s zanka) za zemljevid,
  gozd in šefa. Lasten motiv (lahko po motivu slovenske ljudske pesmi, ki je javna last). Ločen drsnik/izklop za glasbo
  in zvoke.

### Kontrole
- **Tipkovnica:** ←/→ ali A/D tek, ↑/W/preslednica skok, ↓/S počep/spusti rob, `J`/`X`/Shift krogla (drži za naboj),
  `Esc`/`P` pavza (tudi samodejno, ko zavihek ni viden), `R` ponovni začetek nivoja (potrdi).
- **Telefon (ležeče priporočeno, portret mora delovati):** levo navidezni smerni križ ali dve veliki puščici, desno
  velik gumb skok in gumb krogla; večdotik (tek + skok + krogla). `touch-action: none` na igralni površini.
  V portretu prikaži namig »Za boljši pogled obrni telefon«.
- **Igralni pad** (Gamepad API): zaželen (platformer ga res potrebuje), standardna razporeditev.
- Prvi nivo uči kontrole s kratkimi napisi v svetu (napis na deski ob poti), ne z modalnimi okni.

### Hub, XP, dosežki, naloge
- `hub.init({ gameId: 'kresnik', scoreOrder: 'asc' })`, `ui.header({ title: 'Kresnik' })`.
- Po vsakem končanem nivoju ali šefu: `hub.submitScore`, `hub.reportGame({ won: true, players: 1, score, daily: false })`;
  ob izgubi vseh življenj `won: false`. `hub.awardXp` (npr. 10 za nivo, +5 za vse svetilke, +5/+10/+20 medalja,
  50 za šefa; omejitev na nivo na dan — preveri omejitve RPC).
- **Dosežki (vsaj 7):** `prvi-korak` (končaj Jaso), `svetloba` (prižgi 6/6 v enem nivoju), `gozd-100` (vse svetilke
  1. sveta), `gobji-kralj` (premagaj šefa), `brez-praske` (šef brez poškodbe), `zlati-gozd` (zlato na vseh nivojih
  1. sveta), `iskrice-500` (skupaj 500 iskric), `bumerang` (z eno kroglo zadeni 3 sovražnike).
- **Naloge** v `games.json` (`quests`): e »Končaj nivo v Kresniku« (`play:kresnik`), m »Prižgi vseh 6 svetilk v enem
  nivoju« (`kresnik:svetilke6`, target 1), h »Osvoji zlato medaljo v Kresniku« (`kresnik:zlato`, target 1), w »Prižgi
  40 svetilk ta teden« (`kresnik:svetilka`, target 40). Dogodke sporoči s `hub.reportEvent`.

### Moduli (predlog)
`index.html`, `game.js` (zanka, stanja zaslonov), `config.js` (parametri gibanja), `physics.js` (ploščice, AABB, korak —
brez DOM-a), `player.js` (stanja junaka, krogla), `entities.js` (iskrice, svetilke, ploščadi, stikala), `enemies.js`,
`boss-gobji-kralj.js`, `level.js` (loader, validator, legenda), `rules.js` (medalje, odklepanje, točkovanje), `save.js`
(reže), `map.js` (zemljevid), `ghost.js`, `replay.js` (snemanje in predvajanje vnosov), `input.js` (tipkovnica, dotik, pad),
`render/` (`world.js`, `tiles.js`, `hero.js`, `fx.js`, `parallax.js`, `hud.js`), `sound.js`, `music.js`, `debug.js`,
`levels/*.json`, `art/`, `README.md`.

### Testi (`tests/kresnik.js`, vključi v `tests/run-node.mjs` in `tests.html`)
- Fizika: stoji na tleh, ne pade skozi enosmerno ploščad od zgoraj, skozi njo skoči od spodaj, klančina, coyote
  (skok 80 ms po robu uspe, 150 ms ne), buffer, spremenljiva višina (kratek < dolg), oprijem roba, determinizem
  (isti vnosi → isti položaj po 10 s).
- Krogla: domet raste z nabojem, vrne se, ne gre skozi steno.
- `rules.js`: meje medalj, odklepanje, svetilke se štejejo le ob izhodu.
- Validator: vsi nivoji veljavni, napačen nivo vrne smiselne napake.
- Posnetki vnosov: vsak nivo 1. sveta pride do izhoda (Node).
- Ghost: encode/decode krog, `sampleAt`.

### Ni del te naloge (prompti 37–39)
- Svetova 2–3 (lebdenje, kavlji, voda, veter, led), svetova 4–5 in finale, šprint, »Na čas« za celo igro, trgovina.
- Urejevalnik, nivoji skupnosti, nivo tedna, dnevni nivo.

### Prioritete, če zmanjkuje časa
1. Fizika in gibanje na Poligonu z drsniki — **občutek skoka**.
2. Format nivoja, validator, 3 nivoji, sovražniki, svetilke, kontrolne točke, smrt, izhod, medalje.
3. Poslikan izris (paralaksa, ploščice, Kresnik z animacijami, svetloba svetilk), kamera, HUD, kontrole na telefonu.
4. Zemljevid, reže, življenja, lestvice, `reportGame`, dosežki, naloge, ghost.
5. Ostali nivoji do 6, šef, posnetki vnosov za vse, zvok, glasba, zgodba.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in vključi na začetek prompta 37.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija `# Kresnik (games/kresnik/)`: načrt s
kljukicami, dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra.
4. `games/krogla/README.md`, `games/krogla/ghost.js`, `games/krogla/game.js` (lestvica po progi, ghosti iz Supabase),
   `supabase/games/krogla.sql`, `tools/krogla-levels.mjs`.
5. `games/skoki/debug.js` (stran z drsniki), `games/rusilec/sound.js` (sinteza zvoka).

### Tehnično
- Igra v `games/kresnik/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'kresnik', scoreOrder: 'asc' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), konec igre (`ui.results`), `ui.toast`, `ui.modal`.
- **Po vsakem končanem nivoju pokliči `hub.reportGame({ won, players, score, daily })`**. Posebne dogodke za naloge sporoči s
  `hub.reportEvent('kresnik:<ime>', vrednost)`. Igralca prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- Lastne tabele: `supabase/games/kresnik.sql` (idempotentno, RLS vklopljen, predpona `kresnik_`). Če imaš Supabase
  MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati.
- Čisto logiko (fizika, pravila, validator, medalje, ghost) daj v ločene module brez DOM-a in dodaj teste.
- Telefon (ležeče in portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi, nespremenjeni).
4. Odigraj Poligon in vsaj 3 nivoje ročno (smrt, kontrolna točka, svetilke, izhod, ghost) ter šefa; z orodjem
   preveri vse nivoje.
5. Izgled na **telefonu (375×812, ležeče in portret)** in **namizju**: posnemi zaslone, sam jih preglej in popravi.
   Preveri večdotik (tek + skok + krogla).
6. V `games.json` posodobi vnos `kresnik` (opis, oznake, `scoreOrder`, naloge) in ga preklopi v **`live`**
   (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md`, napiši `games/kresnik/README.md` (kontrole, parametri gibanja in merila skoka, legenda
   ploščic, format nivoja, entitete, sovražniki, točkovanje, kako dodati nivo in posnetek), posodobi korenski `README.md`
   (seznam iger) in **stanje prompta**: vrstica na vrhu → ✅ s commitom, vrstica v `prompts/README.md`, oznaka pri
   točki 61 v `PREDLOGI-IGER.md` (🟡, dokler niso narejeni vsi štirje deli).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu: posodobi naslednje prompte
Prompti **`37-kresnik-svetova.md`**, **`38-kresnik-finale.md`** in **`39-kresnik-urejevalnik.md`** so napisani po načrtu.
Ko je ta del narejen, jih **posodobi** z vsemi spoznanji: dejanska imena modulov in funkcij, končni format nivoja in
legenda, merila skoka (koliko ploščic daleč/visoko), kaj ni bilo narejeno (to gre na začetek 37). Commitaj jih skupaj
z igro ali v ločenem commitu.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu,
kaj je bilo posodobljeno v promptih 37–39 in kaj ni bilo preverjeno.
