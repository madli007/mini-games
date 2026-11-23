# Prompt za AI agenta: Hrčkova krogla — urejevalnik prog (level editor)

> **Stanje:** ✅ narejeno — commita `95f2f95` in `c0011e0` (proge skupnosti) (22. 11. 2026)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/06-krogla-urejevalnik.md in ga v celoti izvedi.«**
>
> Igra že obstaja (`games/krogla/`, commita »Hrčkova krogla: 3D singleplayer …« in »… realistična grafika …«).
> Ta naloga doda **urejevalnik prog** in možnost igranja lastnih prog. Obstoječe proge, fizika, časi, lestvice
> in ghosti uradnih prog ostanejo popolnoma enaki.

---

## Zakaj je to izvedljivo (ugotovitve pregleda)

- Proge so **čisti podatki**: `games/krogla/levels/NN-ime.json`, vrstni red v `levels/index.json`. Format je v celoti
  opisan v `games/krogla/README.md` (razdelek »Format proge«).
- `level.js` ima že **validator** (`validateLevel` → seznam napak v slovenščini), `mirrorLevel` in `heightOf/heightChar`.
- `physics.js` → `createWorld(L, mods)` + `step(w, ix, iz)` deluje na kateremkoli objektu proge, brez DOM-a.
- `autopilot.js` → `runAutopilot(L, { trace })` prevozi `route` in vrne čas / padce → iz tega se računajo medalje in `timeBonus`
  (formule so v `tools/krogla-levels.mjs`: zlato ≈ 0,97 ×, srebro 1,28 ×, bron 1,65 ×, ura 1,25 × + 6 s — preberi in
  **izvozi skupno funkcijo**, ne podvajaj formul).
- `render.js` → `new Renderer(canvas, opts)`, `renderer.load(L, world, skin, …)`, `renderer.render(w, bp, dt)`,
  `renderer.clearLevel()` — isti renderer lahko izriše poljubno progo (3D predogled in testna vožnja).
- `game.js` ima razvojni `?lvl=N`, ki takoj odpre progo — vzorec za odpiranje lastne proge.

Edini zahtevnejši del je **UI** (2D mreža z več plastmi + postavljanje objektov z lastnostmi) in sprotna osvežitev 3D predogleda.

## Najprej preberi
1. `CLAUDE.md` — pravila repoja (brez build koraka, brez npm, CDN s pripeto verzijo, relativne poti, slovenščina, `shared/`, offline način).
2. `games/krogla/README.md` — format proge, znaki ploščic, višine (`hmap`), vsi tipi objektov in sovražnikov.
3. `games/krogla/level.js`, `physics.js` (`createWorld`, kako se berejo posamezni objekti), `autopilot.js`, `rules.js`.
4. `games/krogla/render.js` (`Renderer.load/render/clearLevel`, kamera, `menu` način) in `game.js` (zanka igre, `startLevel`,
   način »Na čas«, kako se kliče `hub.submitScore` / `hub.reportGame`, shranjevanje ghostov).
5. `tools/krogla-levels.mjs` — kako se računajo medalje in `timeBonus`, kako se pišeta `index.json` in SQL blok.
6. 2–3 obstoječe proge (npr. `01-ogrevanje.json`, `06-tovarna.json`, `10-neon.json`) — da vidiš realne vrednosti parametrov.
7. `shared/README.md` — kaj je na voljo (`ui`, `storage`, modali, toasti, `hub`).

## Cilj

Stran **`games/krogla/editor.html`** (+ `editor.js`, `editor.css`, po potrebi več modulov v `games/krogla/editor/`),
v kateri lahko:
1. ustvariš novo progo ali odpreš obstoječo (uradno ali lastno),
2. jo urejaš v 2D tlorisu (mreža) z ločenimi plastmi,
3. jo takoj vidiš v 3D in jo **preizkusno prevoziš** s pravo fiziko,
4. preveriš veljavnost in rešljivost (validator + autopilot),
5. jo shraniš / izvoziš in jo odigraš v igri.

Urejevalnik je primarno za namizje (miška + tipkovnica). Na telefonu (375 px) mora vsaj **odpreti in odigrati** lastno
progo; urejanje na telefonu je lahko poenostavljeno (pan/zoom z dvema prstoma, tap = postavi), ne sme pa se zlomiti.

## Kaj narediti

### 1. Podatkovni model in skupna logika (čisti moduli, s testi)
- Urejevalnik dela **neposredno na formatu proge** (isti JSON kot `levels/*.json`), brez vmesnega formata.
- Nov čist modul (npr. `games/krogla/editor/model.js`, brez DOM-a): ustvari prazno progo, spremeni velikost mreže
  (dodaj/odstrani vrstico/stolpec na vsaki strani — **vse koordinate objektov, start, cilj, točke poti se premaknejo**),
  postavi/pobriši ploščico in višino, dodaj/premakni/izbriši objekt, normaliziraj (`size` iz `map`, poravnava `hmap`).
- **Razveljavi/Uveljavi** (Ctrl+Z / Ctrl+Y ali Ctrl+Shift+Z) na ravni operacij (poteza čopiča = ena operacija).
- Izvozi funkcijo za medalje/`timeBonus` iz autopilotove vožnje v skupni modul (npr. `rules.js` ali `level.js`)
  in jo uporabi **tako v `tools/krogla-levels.mjs` kot v urejevalniku** — uradne proge morajo po ponovnem zagonu
  generatorja ostati bajtno enake (preveri z `git diff` po `node tools/krogla-levels.mjs`).
- Teste za model (resize premakne objekte, undo/redo, normalizacija, izračun medalj) dodaj v `tests/tests.js`.

### 2. 2D urejevalnik (tloris)
- Canvas 2D mreža, sever zgoraj (enako kot `map`), pan (srednji gumb / presledek + vleka), zoom (kolešček), prikaz
  koordinat pod kazalcem, mreža vsako ploščico in poudarjena vsakih 5.
- **Plasti** (preklop s tipkami 1–5 ali zavihki):
  1. **Ploščice** — paleta vseh znakov iz `TILE_CHARS` z ikonami in slovenskimi imeni (praznina, tla, zid, klančina ×4,
     led, lepilo, valovita, padajoča, trak ×4). Orodja: čopič (velikost 1–5), pravokotnik, zapolni (flood fill), pipeta.
  2. **Višine** — barvni prikaz višine (gradient + številka), orodja: nastavi višino, dvigni/spusti (+/− 0,5), zgladi
     klančino (iz dveh višin samodejno postavi pravilne znake klančin in višine), pipeta. Opozori, ko se sosednji
     ploščici razlikujeta za več kot bi krogla premagala brez klančine.
  3. **Objekti** — start, cilj, kontrolne točke, pobiralke (zvezdica/ura), premične plošče, vrtiljaki, vzmeti, ventilatorji,
     odbijači, sklede, kladiva, stikala + vrata (povezana z `id`), kvadri (`blocks`) in vsi sovražniki
     (nasilnež, žaga, osa, sesalec, magnet). Vsak tip ima ikono na tlorisu, smer (puščica) in območje delovanja
     (krog/stožec/pravokotnik) kjer ga ima. Vleka premakne, Delete izbriše, Ctrl+D podvoji, poti (`path`)
     se urejajo s točkami (klik doda, vleka premakne, desni klik izbriše).
  4. **Pot autopilota** (`route`) — točke s parametri (`speed`, `r`, `stop`, `wait`, `until`, `mover`), oštevilčene, povezane s črto.
  5. **Lastnosti proge** — ime, opis, sklop (1–3), tema (izbira iz obstoječih tem v `tools/krogla-levels.mjs` /
     `render/looks.js` + ročne barve), `camYaw` če obstaja.
- **Plošča lastnosti** (desno) za izbrani objekt: vsa polja iz formata z razumnimi mejami in privzetimi vrednostmi
  (vzemi jih iz obstoječih prog), sprememba se takoj pozna v 2D in 3D.
- Statusna vrstica: št. zvezdic (mora biti 5), napake validatorja (klik → skok na mesto napake), shranjeno/neshranjeno.

### 3. 3D predogled in testna vožnja
- Ob strani (ali preklop z `Tab`) 3D pogled z obstoječim `Renderer`-jem (kakovost privzeto Srednja/Nizka, da je urejanje tekoče).
  Po spremembi proge se 3D osveži z zamikom (debounce ~300 ms); kamera »orbit« okoli izbrane točke (brez novih CDN
  knjižnic, če gre — sicer `OrbitControls` iz `three@0.160.0/examples/jsm`, ista verzija kot jedro).
- **Testna vožnja** (`T` ali gumb »▶ Preizkusi«): igraš progo s pravo fiziko in vhodom (`input.js`) od starta ali
  **od izbrane točke** (klik desno na mrežo → »Začni tukaj«). `Esc` vrne v urejevalnik na isto mesto. Prikaži čas in padce.
- **Autopilot** (gumb »🤖 Preveri rešljivost«): poženi `runAutopilot` s `trace`, nariši sled na tloris, označi mesta padcev,
  izpiši čas. Če pride do cilja, ponudi »Izračunaj medalje in časovni bonus« (ista formula kot generator) in zapiši `dev`.
- Brez rešljivosti (uspešen autopilot ali lastna vožnja do cilja v testni vožnji) proge **ni mogoče objaviti** (glej 5.).

### 4. Shranjevanje, uvoz in izvoz
- **Osnutki** v `localStorage` prek `shared/storage.js` (`krogla:editor:drafts`), samodejno shranjevanje (ob vsaki spremembi z
  zamikom), seznam osnutkov z imenom, datumom in sličico tlorisa. Pazi na velikost (proga ~10–20 KB, omeji na npr. 30 osnutkov).
- **Izvoz**: »Prenesi JSON« (datoteka `NN-ime.json`, enaka oblika kot uradne proge, lepo formatirana), »Kopiraj v odložišče«.
- **Uvoz**: odpri datoteko / prilepi JSON / odpri katerokoli uradno progo kot izhodišče (kopija z novim `id`).
- Za razvijalca (uradne proge): v README opiši potek »uredi v urejevalniku → izvozi → shrani v `levels/` → dodaj v `index.json`
  → `node tools/krogla-levels.mjs` / testi → SQL blok«. Če proga ni iz generatorja, mora `tools/krogla-levels.mjs`
  **ohraniti ročno dodane JSON proge** (ne sme jih prepisati ali odstraniti iz `index.json`) — preveri in po potrebi popravi.

### 5. Igranje lastnih prog v igri
- V meniju igre nov razdelek **»Moje proge«**: seznam lastnih prog (iz osnutkov, označenih kot »pripravljeno«) → igraj v načinu
  Na čas (brez uradne lestvice in brez uradnih ghostov), lokalni najboljši čas in lokalni ghost (`krogla:custom-ghost:<hash>`).
- Gumb »✏️ Urejevalnik« v meniju igre in gumb »◀ Nazaj v igro« v urejevalniku.
- Lastne proge **ne smejo** vplivati na uradne lestvice, odklepe, turnir, dnevni izziv ali dosežke. `hub.reportGame` po vožnji
  lastne proge je OK (kot pri načinu Na čas, z isto omejitvijo pogostosti), `hub.submitScore` / `krogla_save_ghost` pa NE.
- **Deljenje brez strežnika**: »🔗 Deli« ustvari povezavo `games/krogla/?custom=<podatki>` (JSON → kompaktno → deflate prek
  `CompressionStream` če je na voljo, sicer brez → base64url). Igra ob takem URL-ju progo validira in ponudi
  »Igraj« / »Shrani med moje proge«. Če je povezava predolga (> ~8000 znakov), to jasno povej in ponudi izvoz datoteke.
  Pri dekodiranju tujih podatkov: velikost omejena, `validateLevel` obvezen, nobenih `eval`/HTML vstavljanja imen (ime in opis
  vedno kot `textContent`).

### 6. (Neobvezno, šele ko je 1–5 končano in preverjeno) Objava prog na Supabase
Samo če ostane čas in je vse ostalo stabilno, sicer v `PROGRESS.md` zapiši kot naslednji korak:
- `supabase/games/krogla.sql`: tabela `krogla_custom_levels` (id, avtor `user_id`, ime, `data` jsonb z omejeno velikostjo, ustvarjeno,
  `dev_ms` iz autopilota/lastne vožnje), RLS: berejo vsi prijavljeni, pišeš/brišeš samo svoje; omejitev števila prog na igralca.
- Lestvica lastne proge prek obstoječega `hub.submitScore` z ločenim ključem (npr. `custom:<id>`) — preveri v `shared/` in
  `supabase/schema.sql`, ali to deluje brez spremembe sheme huba; **tabele `public.scores` ne spreminjaj**.
- Offline adapter mora delovati enako (lokalno). Po spremembi sheme preveri Supabase advisors (security + performance).

## Omejitve
- Brez build koraka, brez npm, brez novih knjižnic razen nujnih dodatkov `three@0.160.0` (ista pripeta verzija).
- Vse besedilo v UI v slovenščini s šumniki; kratka pomoč v urejevalniku (»?« → seznam bližnjic).
- Ne spreminjaj fizike, rendererja (razen nujnih, nevtralnih razširitev, npr. metoda za predogled brez krogle), uradnih prog ali časov.
- Urejevalnik je dosegljiv iz igre, **ni** pa nova igra v `games.json`.

## Preverjanje (obvezno pred commitom)
1. `node tests/run-node.mjs` — vsi testi zeleni (stari + novi za model urejevalnika).
2. `node tools/krogla-levels.mjs` — uradne proge in SQL blok **nespremenjeni** (`git diff --stat games/krogla/levels supabase`).
3. V brskalniku (`.claude/launch.json` → `mini-games`, `?offline=1`), konzola brez napak:
   - odpri uradno progo 06 v urejevalniku, izvozi JSON brez sprememb → enak kot datoteka (razen `id`, če je kopija);
   - ustvari novo progo od nič: start, ~20 ploščic poti s klančino, prepad s premično ploščo, 5 zvezdic, cilj, kontrolna točka,
     ena žaga; autopilot pride do cilja; izračunaj medalje; testna vožnja do cilja;
   - undo/redo čez 10+ operacij, resize mreže levo/gor (objekti se pravilno premaknejo), osvežitev strani (osnutek ostane);
   - »Moje proge« → odigraj → lokalni čas in ghost se shranita; uradne lestvice nedotaknjene;
   - povezava »Deli« v drugem zavihku odpre isto progo; pokvarjen `?custom=` pokaže prijazno napako;
   - telefon 375×812: odpiranje in igranje lastne proge deluje, urejevalnik se ne zlomi.
4. Posnetek zaslona urejevalnika (2D + 3D) in testne vožnje kot dokaz.
5. Posodobi `games/krogla/README.md` (razdelek »Urejevalnik prog«: plasti, bližnjice, deljenje, potek za uradne proge) in `PROGRESS.md`.
6. Commit v slovenščini (npr. »Hrčkova krogla: urejevalnik prog, moje proge in deljenje s povezavo«). **Ne pushaj.**
