# Prompt za AI agenta: Hrčkova krogla — okolica prog (okraski, podlaga, kulise)

> **Stanje:** ⬜ čaka — lahko takoj

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/20-krogla-okras.md in ga v celoti izvedi.«**
>
> Ozadje: proge Hrčkove krogle so lepo izrisane (PBR teksture, nebo, sence, post-processing — `prompts/05-krogla-grafika.md`),
> a **visijo v praznem prostoru**: okoli je le nebo z nekaj lebdečimi otočki, oblaki, metulji, paro (`render/decor.js`).
> Ta prompt doda **okolico**, da proga izgleda kot del sveta (vrt, kuhinja, tovarna …), ne le pot v zraku.
> Isti izris uporabljajo Rušilec (`games/rusilec/view.js`), Dirka frnikol (`games/frnikole/view.js`) in urejevalnik
> prog (`games/krogla/editor/preview3d.js`) — vsi morajo delovati in dobiti okras.
>
> **Le videz.** Fizika, proge (JSON), časi, medalje, ghosti, autopilot in testi ostanejo **enaki**. Okras nima trkov
> in ne sme zakriti poti, krogle ali ovir (kamera gleda od zgoraj-zadaj; okras ob robu mora biti nizek ali dovolj daleč).

---

## Kaj narediti

### 1. Predmeti ob progi (po lokaciji)
Nov modul `games/krogla/render/props.js` (kliče ga `buildDecor` ali `Renderer.load`), ki ob robovih prog postavi
**instancirane** (`THREE.InstancedMesh`) predmete — proceduralna geometrija iz Three.js primitivov in obstoječih tekstur
(`render/textures.js`), brez zunanjih modelov (ali le pripeti CDN viri z licenco, če res potrebno). Predlog po lokacijah
(`render/looks.js`):

| Lokacija | Ob robu proge (nizko) | Dlje stran / spodaj |
|---|---|---|
| `garden` (vrt) | rože, šopi trave, kamenčki, gobice, ograjica | grmi, drevesa, ribnik, lončki za rože |
| `kitchen` | žlice, skodelice, kocke sladkorja, drobtine | kozarci, steklenice, deska za rezanje, robec |
| `crystal` | kristali, svetleče kocke | veliki kristali, slapovi svetlobe |
| `factory` | vijaki, matice, zaboji, opozorilni stožci | cevi, sodi, verige, žerjav, zobniki (vrtenje) |
| `tower` | sveče, svitki | stebri, oboki, zastave |
| `ice` | ledene sveče, kepe snega | ledene gore, smreke s snegom |
| `arena` | blazine, žoge | tribune s »publiko« (billboardi), reflektorji |
| `neon` | svetleči trakovi, kocke | neonski napisi brez besedila, mreža stolpov |
| `sky` | oblački na robu, peresa | baloni, zmaji, oddaljeni otoki z gradom |
| `inferno` | žareči kamni | lava, bazaltni stebri |

- Postavljanje: deterministično iz id-ja proge (isti seed kot zdaj v `decor.js`), na ploščicah **zunaj** proge ali na
  robu (rob ploščice, ki meji na praznino), nikoli na poti `route` ali na ovirah. Okras na tleh proge le zelo nizek
  (≤ 0,15) in ne na sredini ploščice. Gostota po kakovosti (`q.decor`: Ultra 1 · Visoka 0,9 · Srednja 0,6 · Nizka 0,35).
- Zrcaljena proga (`mirrorLevel`) mora dobiti zrcaljen okras (ali vsaj enako lep).

### 2. Podlaga pod progami
- Proge zdaj lebdijo. Dodaj **nosilce**: stebre/podpornike pod robovi in pod višjimi deli (lesene noge pri kuhinji,
  jeklene nosilce v tovarni, kamnite stebre pri vrtu, ledene stebre …), ki se končajo v megli ali na spodnji »kulisi«.
- Po želji pod progo velika **spodnja površina** (vrt: travnik daleč spodaj, kuhinja: kuhinjski pult s ploščicami,
  tovarna: tla hale z rumenimi črtami), ki daje občutek višine. Ne sme metati senc na progo (ali le zelo mehke).

### 3. Kulisa v ozadju
- Velike oddaljene oblike po lokaciji (silhuete dreves, kuhinjski elementi, tovarniški dimniki, ki že obstajajo
  kot `chimneys`), ki ne potrebujejo podrobnosti — billboardi ali nizkopoligonske mreže v megli.

### 4. Zmogljivost in kakovost
- Merilo: na Nizki kakovosti (telefon) največ +15 % draw callov in brez padca FPS; vsa nova geometrija instancirana,
  materiali deljeni. Izmeri z `?dev=1` (`window.__kr`, `renderer.stats()`) pred in po, rezultat zapiši v `PROGRESS.md`.
- Upoštevaj `prefers-reduced-motion` (animacije okrasa umirjene), dither prosojnost (`FADE`) za okras med kamero in kroglo.
- Nastavitev v meniju Krogle (Nastavitve): »Okolica proge: polna / zmanjšana / izklopljena« (shranjeno v `localStorage`
  prek `shared/storage.js`).

### 5. Ostale igre, ki uporabljajo izris
- Rušilec (arene so manjše — okras okoli plošče, publika), Dirka frnikol (dolge proge — okras ob robu, a ne ovira
  pogleda na kup frnikol), urejevalnik (3D predogled lahko okras skrije s stikalom). Vse mora ostati brez napak.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Hrčkova krogla — okolica prog«: načrt s
kljukicami, dnevnik, meritve, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `games/krogla/README.md` (moduli, kakovosti) in `PROGRESS.md` → »Hrčkova krogla — grafika« (`prompts/05-krogla-grafika.md`).
3. `games/krogla/render.js`, `games/krogla/render/decor.js`, `render/looks.js`, `render/terrain.js`, `render/textures.js`,
   `render/materials.js`, `render/objects.js`.
4. `games/rusilec/view.js`, `games/frnikole/view.js`, `games/krogla/editor/preview3d.js` (podrazredi / uporabniki `Renderer`).

### Tehnično
- **Brez build koraka**, ES moduli, relativne poti, besedila v slovenščini. Three.js ostane `0.160.0` (importmap).
- Okras je čisto vizualen: brez sprememb `physics.js`, `level.js`, prog v `levels/`, aren in prog frnikol.
- Deterministično postavljanje (seed iz id-ja proge), da je izgled vedno enak.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku (vidno okno — FPS meritve
   v skritem zavihku niso zanesljive).
2. **Konzola brez napak** v Krogli (vseh 12 prog, `?lvl=N`, tudi zrcaljeno), v urejevalniku, v Rušilcu, v Dirki
   frnikol in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi testi nespremenjeni).
4. Na vsaki lokaciji preveri, da okras **ne zakrije** poti, krogle, ovir in pobiralk (posnetki z vožnjo autopilota `?bot=1`).
5. Izgled na **telefonu (375×812)** in **namizju** na Ultra, Srednji in Nizki kakovosti: posnemi zaslone, sam jih
   preglej in popravi; meritve draw callov in FPS pred/po zapiši v `PROGRESS.md`.
6. Posodobi `PROGRESS.md` in `games/krogla/README.md` (modul `props.js`, nastavitev okolice).
7. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno (po lokacijah), vpliv na zmogljivost in kaj ni bilo preverjeno.
