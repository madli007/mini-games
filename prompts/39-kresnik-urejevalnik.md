# Prompt za AI agenta: Kresnik (4. del: urejevalnik nivojev, nivoji skupnosti, nivo tedna, dnevni nivo)

> **Stanje:** ⬜ čaka — predpogoj 36 (37 in 38 priporočena: več ploščic, entitet in sovražnikov za urejevalnik)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/39-kresnik-urejevalnik.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »61. Kresnik«. Igra `games/kresnik/` ima kampanjo (prompti 36–38). **Najprej preberi**
> razdelke »Kresnik« v `PROGRESS.md` (posebej »Ni bilo narejeno«) in `games/kresnik/README.md`. Kar iz prejšnjih delov
> ni bilo narejeno, naredi **najprej**. Urejevalnik prog Krogle (`games/krogla/editor*`, prompt 06) in Motorista
> (prompt 33, če je narejen) sta zgled za strukturo, skupnostne tabele in »progo tedna«.
>
> Kampanja, fizika, nivoji, časi, medalje in lestvice ostanejo enaki. Če je dejansko stanje v kodi drugačno, kot piše
> tu, velja koda.

---

## Cilj
1. **Urejevalnik nivojev** na mreži ploščic: rišeš ploščice, postavljaš entitete in sovražnike, takoj preizkusiš.
2. **Nivoji skupnosti** v Supabase z lestvico po nivoju, ocenami in **»Nivo tedna«**.
3. **Dnevni nivo** (šteje prvi poskus), enak za vse.

## 1. Urejevalnik (`games/kresnik/editor.html` + `editor.js`, `editor.css`, po potrebi `editor/*.js`)
- Primarno za namizje (miška + tipkovnica). Na telefonu mora vsaj **odpreti in odigrati** nivo; urejanje je lahko
  poenostavljeno, ne sme se zlomiti.
- **Platno** z izrisom igre (iste ploščice in ozadje kot v igri), pan/zoom, mreža, prikaz Kresnikovih **meril skoka**
  (lok najdaljšega in najvišjega skoka iz `config.js`, z vklopljenimi sposobnostmi) ob kazalcu — da avtor vidi, kaj je
  dosegljivo.
- **Orodja:** čopič/pravokotnik/polnilo za ploščice, radirka, paleta ploščic po temah (tema nivoja določa videz),
  entitete in sovražniki iz paleta z urejanjem lastnosti (pot premične ploščadi, patrulja, skrit da/ne, smer vetra …),
  start, izhod, kontrolne točke, 6 svetilk (števec v orodni vrstici), velikost nivoja, tema, glasba, ime.
  **Šefov ni v urejevalniku.**
- **Sposobnosti nivoja:** avtor izbere, katere sposobnosti ima igralec (prijem, lebdenje, šprint). Nivo jih tako
  zahteva/dovoli ne glede na napredek reže.
- **Razveljavi/Uveljavi** (Ctrl+Z / Ctrl+Y), vlek je ena operacija.
- **Čist model** (`editor/model.js`, brez DOM-a, s testi): operacije nad nivojem, normalizacija, vse prek
  `validateLevel` iz igre.
- **Preizkus** (`Igraj` / `T`): takoj zažene nivo v igri od starta ali od kazalca, `Esc` nazaj v urejevalnik na isto mesto.
- **Shranjevanje:** lokalni osnutki (`shared/storage.js`), izvoz/uvoz JSON.
- **Objava:** le nivo, ki ga je avtor **sam prevozil do izhoda** v preizkusu (posnetek vnosov se shrani in pošlje
  zraven; strežnik ga ne preverja, a zlati časi skupnosti izhajajo iz njega). Vsebinska omejitev: največja velikost
  nivoja in število entitet, ime in opis s filtrom dolžine.

## 2. Nivoji skupnosti (Supabase)
- `supabase/games/kresnik.sql` (dopolni, idempotentno): `kresnik_community_levels` (avtor, ime, JSON, posnetek, čas
  avtorja, stanje, ustvarjeno), `kresnik_community_votes` (ocena 1–5 ali všeček, en glas na igralca), lestvica po nivoju
  prek `hub.submitScore` z ločenim seed ključem (npr. `community:<uuid>`). Pisanje le prek RPC (`kresnik_publish_level`,
  `kresnik_vote`) z omejitvami (velikost, največ 5 objav na dan na igralca), RLS, `security definer` v `private`.
- **Brskalnik nivojev:** najnovejši, najbolje ocenjeni, moji; kartica s predogledom (pomanjšan izris), avtorjem
  (`ui.who`), oceno, številom igranj in rekordom.
- **Nivo tedna:** vsak ponedeljek (Europe/Ljubljana) se izbere deterministično iz ocen prejšnjega tedna (SQL
  pogled ali RPC; če je Motorist 33 že naredil »progo tedna«, uporabi isti pristop), ima svojo lestvico in nalogo.
- Offline: urejevalnik, osnutki in lokalno igranje delujejo; objava in brskalnik pokažeta »Na voljo, ko si povezan«.

## 3. Dnevni nivo
- Iz nabora (uradni bonus nivoji + izbrani skupnostni) ali **generiran iz `hub.dailySeed`** iz kosov (sestavi nivo iz
  vnaprej pripravljenih in preverjenih odsekov z znanim posnetkom, tako da je vedno rešljiv — posnetek celotnega nivoja
  je veriga posnetkov kosov). Odloči in utemelji v `PROGRESS.md`; generator je bolj zanimiv, a mora biti zanesljivo
  rešljiv in testiran.
- Šteje **prvi poskus** (`hub.reportGame({ daily: true })`, dnevna lestvica), nato prosto vadenje brez lestvice.
- Oznaka `daily` v `games.json`, naloga e »Odigraj dnevni nivo Kresnika« (`daily:kresnik`).

## 4. Hub
- Dosežki (vsaj 4 novi): `arhitekt` (objavi nivo), `priljubljen` (tvoj nivo ima 5 všečkov), `popotnik` (odigraj 10
  skupnostnih nivojev), `dnevni-7` (7 dni zapored dnevni nivo).
- Naloge (dodaj): w »Odigraj 5 nivojev skupnosti« (`kresnik:skupnost`, target 5).

## 5. Testi
- `editor/model.js`: operacije, razveljavi/uveljavi, normalizacija, validator na izdelkih urejevalnika.
- Dnevni generator (če je izbran): isti seed → isti nivo, vsak generiran nivo za 30 zaporednih dni je veljaven in
  veriga posnetkov pride do izhoda (Node).
- RPC omejitve (če imaš MCP): prevelik nivo zavrnjen, dvojni glas zavrnjen, tuj nivo se ne da spremeniti.

## Prioritete, če zmanjkuje časa
1. Kar ni bilo narejeno v prejšnjih delih.
2. Urejevalnik z modelom, preizkusom in lokalnimi osnutki.
3. Objava in brskalnik skupnostnih nivojev, lestvica po nivoju.
4. Dnevni nivo.
5. Ocene, nivo tedna, dosežki, naloge.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Kresnik — urejevalnik«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md`, `shared/README.md`.
2. `games/kresnik/README.md` in razdelke »Kresnik« v `PROGRESS.md`.
3. `games/krogla/editor.html`, `games/krogla/editor.js`, `games/krogla/editor/*`, `supabase/games/krogla.sql`
   (proge skupnosti), razdelek »Proge skupnosti« v `PROGRESS.md`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, urejevalniku in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Naredi nivo v urejevalniku od začetka, ga preizkusi, prevozi, objavi (Supabase ali zapiši, česa ni bilo mogoče),
   ga najdi v brskalniku in odigraj z drugo identiteto (`?igralec=2`). Odigraj dnevni nivo (prvi poskus šteje, drugi ne).
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi.
6. SQL poženi na Supabase (MCP) in preveri advisors (security + performance); sicer zapiši v `PROGRESS.md`.
7. Posodobi `PROGRESS.md`, `games/kresnik/README.md` (urejevalnik, format, objava, dnevni nivo), `games.json`,
   korenski `README.md` in **stanje prompta**: vrstica na vrhu → ✅ s commitom, vrstica v `prompts/README.md`, oznaka pri
   točki 61 v `PREDLOGI-IGER.md` → ✅ (če so narejeni vsi štirje deli).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako uporabljati urejevalnik, kaj (če kaj) moram narediti v
Supabaseu in kaj ni bilo preverjeno.
