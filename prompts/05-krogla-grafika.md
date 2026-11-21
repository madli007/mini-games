# Prompt za AI agenta: Hrčkova krogla — nova grafika (realističen, sodoben videz)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/05-krogla-grafika.md in ga v celoti izvedi.«**
>
> Igra že obstaja (`games/krogla/`, commit »Hrčkova krogla: 3D singleplayer …«). Ta naloga spremeni **samo videz**
> (in zvok ne), igranje, fizika, proge, časi in ghosti ostanejo popolnoma enaki.

---

## Cilj

Igra naj na prvi pogled izgleda kot sodobna, »premium« 3D igra, ne kot prototip iz kock z Lambert materiali.
Smer: **fotorealistični materiali in svetloba** (PBR, mehke sence, odsevi, globinska atmosfera), predstavljeno
kot čista, nekoliko stilizirana miniatura — predstavljaj si dragocen namizni diorama-svet, posnet z dobro kamero.
Vsak sklop ima svojo prepoznavno »lokacijo« z lastno svetlobo in razpoloženjem (npr. sončen vrt v zlati uri,
topla kuhinja, industrijska tovarna z jeklom in rjo, ledena dvorana s hladnim prosojnim ledom, neon ponoči,
nebo nad oblaki ob sončnem zahodu). Retro-neon slog iz prvega prompta ni več zavezujoč, razen za proge, kjer je
neon tema (Neon).

**Berljivost je nad lepoto.** Igralec mora vedno takoj videti rob proge, tip podlage (led, lepilo, trak, padajoča
ploščica), nevarnosti in njihov »telegraf« (kladivo pred udarcem, magnet pred vklopom, žaga, sesalec). Če efekt
skrije rob ali nevarnost, ga omili.

## Najprej preberi
1. `CLAUDE.md` — pravila repoja (brez build koraka, CDN s pripeto verzijo, relativne poti, slovenščina).
2. `games/krogla/README.md` in `games/krogla/render.js` — trenutni renderer, `DEFAULT_SKIN`, `QUALITY`.
3. `games/krogla/game.js` — kako se renderer kliče (zanka, kakovost, samodejno zniževanje ob padcu FPS).
4. Vse `games/krogla/levels/*.json` — teme (`theme`) in kaj vse se izrisuje.

**Najprej posnemi »prej« zaslone** (namizje 1440×900 in telefon 375×812) vsaj na progah 1, 4, 6, 8, 10, 11 in jih
shrani (npr. v scratchpad), da lahko na koncu primerjaš.

## Kaj narediti

### 1. Upodabljanje in svetloba
- Ostani na **Three.js `0.160.0`** (ista verzija za jedro in dodatke `examples/jsm/…`; uporabi `<script type="importmap">`
  v `index.html`, da dodatki najdejo `three`). Brez build koraka in brez npm.
- `renderer.outputColorSpace = SRGBColorSpace`, `toneMapping = ACESFilmicToneMapping` (ali AgX, če izgleda bolje),
  realne (fizikalne) jakosti luči (v r160 je to privzeto, `physicallyCorrectLights` ne obstaja več), nastavljiva osvetlitev (`toneMappingExposure`) po temi.
- **Okolje za odseve (IBL):** `PMREMGenerator` + proceduralno okolje (`RoomEnvironment` ali lastna scena neba/gradientov
  za vsako temo), da imajo kovine, steklo in lak prave odseve. Brez zunanjih HDR datotek, razen če najdeš majhen
  CC0 HDR na pripetem CDN-ju in ga je mogoče izklopiti na nizki kakovosti — proceduralno ima prednost.
- **Nebo:** fizikalno nebo (`Sky` iz dodatkov) ali lasten shader z gradientom, soncem, oblaki (FBM šum) in zvezdami za
  nočne teme. Proge visijo v zraku, zato naj bo pod njimi globina: oblaki/megla v daljavi, rahla atmosferska perspektiva
  (`FogExp2` ali višinska megla v shaderju), da se dno ne konča v praznini.
- **Sence:** mehke, ostre ob stiku (`PCFSoftShadowMap` ali VSM), senčna kamera naj **sledi krogli** in se pripne na
  teksel mrežo (brez migotanja). Krogla, hrček, sovražniki in objekti mečejo sence; senca krogle mora biti vedno vidna
  (pomaga oceniti višino pri skokih) — na nizki kakovosti ostane mehka »blob« senca.
- **Okluzija okolja (AO):** `GTAOPass`/`SAOPass` na visoki kakovosti ali vnaprej izračunan AO v vertex barvah
  (robovi, kotiček med steno in tlemi) — vertex AO je poceni in deluje tudi na telefonu, zato ga naredi v vsakem primeru.

### 2. Post-processing (`EffectComposer`)
- `RenderPass` → AO (visoka) → **bloom** (`UnrealBloomPass`, samo za res svetle stvari: cilj, zvezdice, neon, iskre;
  prag nad 1.0 v HDR) → barvna korekcija/vinjeta/rahla kromatska aberacija ob robovih (lasten `ShaderPass`, nežno)
  → `OutputPass` → **SMAA** ali FXAA.
- Rahla **globinska ostrina** (tilt-shift občutek miniature) samo na visoki kakovosti in samo v ozadju — krogla in pot pred
  njo morata biti vedno ostri. Gibalna zameglitev ne.
- Vse post efekte je mogoče izklopiti; spoštuj `prefers-reduced-motion` (brez tresenja, manj delcev, brez aberacije).

### 3. Materiali in geometrija prog
- Vse `MeshLambertMaterial`/`MeshPhongMaterial` zamenjaj s `MeshStandardMaterial`/`MeshPhysicalMaterial` z
  realnimi `roughness`/`metalness`.
- **Proceduralne PBR teksture na canvasu** (brez slikovnih datotek v repoju): barva + normal map + roughness za
  vsako vrsto podlage, generirane enkrat ob nalaganju (šum, FBM, Voronoi; po želji v `OffscreenCanvas`/WebGL shaderju),
  predpomnjene po temi. Primeri: lakiran les z letnicami, keramične ploščice s fugami, brušena kovina z rjo in
  zakovicami, gumirani tekoči trak (UV animacija), led z globino in razpokami (`transmission`, `ior` 1.31, `thickness`),
  lepilo kot sijoča viskozna snov (`clearcoat`), valovita tla z normal mapo, ki se ujema z geometrijo.
- **Robovi ploščic:** zaobljeni/posneti robovi (bevel) namesto ostrih kock in namesto `LineSegments` — rob naj se bere
  s svetlobo (svetel odsev na robu) in tankim emisivnim/kontrastnim pasom v barvi teme. Stranice prog naj imajo
  globino in detajle (nosilci, kabli, vijaki, mah/rastlinje glede na temo), da proge ne izgledajo kot leteče kocke.
- **Instancing:** ponavljajoče objekte (ploščice, vijaki, rastlinje, delci) izriši z `InstancedMesh`/združeno geometrijo,
  da število draw callov ostane nizko (cilj < ~150 na visoki).
- Okras okolice (ne vpliva na fiziko in ne zakriva poti): lebdeči otočki, oblaki, ptice/metulji, para v tovarni,
  snežinke v ledeni dvorani, kresnice v vrtu. Vse proceduralno in skalirano po kakovosti.

### 4. Krogla in hrček (glavni lik — tukaj naj se vidi največ truda)
- **Steklo:** `MeshPhysicalMaterial` s `transmission`, `ior` ~1.5, `thickness`, `roughness` ~0.02, `clearcoat`,
  odsevi okolja, Fresnel (robovi bolj odsevni kot sredina), rahle praske/prstni odtisi v roughness mapi, šiv/obroč
  kot pri pravi krogli za hrčke in luknjice za zrak. Krogla mora biti prozorna tako, da je hrček jasno viden.
- Če je `transmission` na telefonu predrag, na srednji/nizki kakovosti uporabi lažno steklo (Fresnel shader +
  odsev okolja + nizka `opacity`), ki izgleda podobno.
- **Hrček:** gladkejši model iz zaobljenih oblik (ne kock), mehko krzno s **shell texturing** tehniko (8–16 lupin na visoki,
  manj na nizki) ali vsaj z mehkim sijem roba (sheen), velike sijoče oči z odsevom, rožnata ušesa s podpovršinskim
  sijem, brki. Animacija teka v smeri kotaljenja z obratom glave proti smeri, ob padcu »panika«, ob cilju veselje.
- Kontaktna senca + rahla kavstika (svetla lisa) pod kroglo na visoki kakovosti.
- Delci: prah/iskre ob trku glede na podlago (iskre na kovini, kapljice na lepilu, ledeni kristalčki na ledu),
  sled (`skin.trail`) kot gladka trak-geometrija namesto točk.
- **Skin sistem ostane** (`DEFAULT_SKIN`, `localStorage` `krogla:skin`): razširi ga z novimi polji (npr. `tint`,
  `roughness`, `pattern`), a obstoječa polja (`glass`, `opacity`, `rim`, `rider`, `fur`, `trail`) morajo delovati
  kot prej, tudi `rider` kot emoji. Ghosti naj ostanejo jasno ločeni (prosojna, enobarvna, svetlikajoča krogla).

### 5. Objekti, ovire in sovražniki
Vsak objekt prenovi v realističen, a takoj prepoznaven model z jasnim telegrafom (svetloba + gib + barva):
- **Cilj:** zlat obroč iz polirane kovine z bloomom, svetlobni steber, delci; ob prihodu eksplozija konfetov in
  kratek »slow-mo« trenutek (samo vizualno, čas se meri kot prej).
- **Kontrolne točke:** zastavica iz blaga, ki plapola (vertex shader), ob aktivaciji spremeni barvo in zasveti.
- **Zvezdice / ure:** kovinske/emisivne, vrtenje + lebdenje + odsev; ob pobiranju razpad v delce.
- **Kladiva:** težka jeklena glava z obrabo, pred udarcem rdeča svetloba na tleh, ki se okrepi; ob udarcu prah in rahel
  tresljaj kamere (izklopljen pri reduced-motion).
- **Žage:** kovinski disk z zobmi, gibalna zameglitev diska (shader), iskre; tirnica kot prava kovinska vodila.
- **Ventilatorji / sesalci:** realna ohišja z rešetko, vidni tokovi zraka (prosojni animirani trakovi/delci).
- **Magneti:** pobarvan podkev-magnet, polje kot valovanje/distorzija, ki utripa v ritmu.
- **Nasilnež:** temna, težka krogla (karbon/guma), jezne oči, ob zaletu prah.
- **Ose:** majhne, z prosojnimi krili, ki brenčijo (animacija kril), rumeno-črne.
- **Premične/padajoče ploščice, dvigala, vrata, stikala, vzmeti, vrtljive plošče, odbijači:** isti mehanski vtis —
  kovina, guma, vijaki, opozorilne črte; padajoča ploščica pred padcem poka in se trese (razpoke v normal mapi).

### 6. Kamera in občutek
- Ohrani obnašanje kamere (sledenje, zasuk v smer gibanja z izklopom, ne zatakne se v stene), dodaj: nežno vzmetno
  sledenje, rahlo povečanje FOV pri visoki hitrosti, kratek »punch« ob trku, uvodni prelet proge med odštevanjem
  (preskočljiv, krajši pri reduced-motion).
- Stene/objekti med kamero in kroglo naj postanejo prosojni (dither fade), da krogla nikoli ni skrita.

### 7. Kakovost in zmogljivost (obvezno)
- Razširi `QUALITY`: **ultra** (namizje z dobro grafično: vse vključeno, ločljivost do `devicePixelRatio` 2),
  **visoka**, **srednja**, **nizka** (telefon: brez post-processinga razen FXAA, blob senca, lažno steklo,
  manj lupin krzna, manj delcev). Privzeto izberi glede na napravo (`navigator.hardwareConcurrency`,
  zaslon na dotik, `WEBGL_debug_renderer_info` če je na voljo); samodejno zniževanje ob FPS < ~45 ostane.
- Cilji: **60 FPS na namizju** na visoki, **≥ 45 FPS v telefonski emulaciji** na nizki/srednji. Izmeri pred in po
  (`renderer.info.render.calls`, `triangles`, čas sličice) in zapiši v `PROGRESS.md`.
- Nalaganje proge ne sme trajati opazno dlje: generiranje tekstur predpomni, prikaži nalagalnik, če traja > 300 ms.
- Ob menjavi proge vse geometrije, materiale, teksture in render targete pravilno `dispose()` — preveri, da
  `renderer.info.memory` po 12 progah ne raste.
- WebGL2 je privzet; če ga ni ali se kontekst izgubi (`webglcontextlost`), igra pade nazaj na nizko kakovost, ne na črn zaslon.

### 8. Meni in HUD (skladno z novim videzom)
- Za menijem igre naj teče počasen 3D prelet ene od prog (na nizki kakovosti statično ozadje).
- HUD naj ostane berljiv nad svetlo in temno sceno (rahlo zamegljeno steklasto ozadje čipov, `backdrop-filter` z
  rezervo). Ostani pri `ui.css` in razredih `mg-*`; spremeni le `games/krogla/game.css`.
- V Nastavitvah: izbira kakovosti (Ultra/Visoka/Srednja/Nizka/Samodejno), ločena stikala za post-processing,
  globinsko ostrino in tresenje kamere.

## Česa ne smeš spremeniti
- `physics.js`, `rules.js`, `ghost.js`, `autopilot.js`, format in vsebino prog (`levels/*.json`), zlate čase,
  Supabase SQL. Vizualni modeli smejo biti malo večji/manjši od trkalnikov le, če to ne zavaja igralca
  (krogla na zaslonu = krogla v fiziki; rob proge na zaslonu = rob v fiziki).
- Determinizem: animacije sovražnikov in ovir v rendererju morajo brati isto stanje kot zdaj (`pathAt`,
  `hammerPhase`, `magnetState` …), da se telegraf ujema z resnično nevarnostjo.
- Brez slikovnih/zvočnih datotek v repoju in brez npm; vse prek pripetega CDN-ja ali proceduralno.
- Imena, grafika in zvoki originalnega Hamsterballa se ne uporabljajo.

---

## Fiksni del

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Hrčkova krogla — grafika«: načrt s
kljukicami, dnevnik, meritve FPS pred/po, »Ni bilo preverjeno«). Če je `render.js` prevelik, ga razdeli
(npr. `render/materials.js`, `render/textures.js`, `render/post.js`, `render/ball.js`, `render/objects.js`, `render/sky.js`).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak in opozoril** (tudi brez Three.js deprecation opozoril) v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni — vse obstoječe teste (fizika, rešljivost prog, ghosti) morajo
   ostati zeleni brez sprememb pričakovanih vrednosti.
4. Posnemi **»po« zaslone** na istih progah in velikostih kot »prej«, jih sam natančno preglej (rob proge viden?
   nevarnosti jasne? hrček viden skozi steklo? HUD berljiv?) in popravljaj, dokler ne izgleda res dobro.
   Preglej vsako od 12 prog vsaj enkrat (`?bot=1` ti jih odvozi).
5. Odigraj vsaj prve 3 proge v turnirju, eno progo Na čas z ghostom in dnevni izziv na **ultra/visoki** in na
   **nizki** kakovosti; preveri padec, kontrolno točko, pavzo, cilj in prehod med progami.
6. **Telefon (375×812)** z virtualno palico: FPS ≥ 45 na samodejni kakovosti, nič ni odrezano.
7. Preveri `prefers-reduced-motion` in izgubo WebGL konteksta (npr. `WEBGL_lose_context`).
8. Posodobi `games/krogla/README.md` (modul `render`, kakovosti, nova polja `skin`) in `PROGRESS.md`.
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj se je vizualno spremenilo (s potmi do zaslonov pred/po),
meritve FPS in draw callov pred/po po kakovostih ter kaj ni bilo preverjeno.
