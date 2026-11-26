# Prompt za AI agenta: Motorist (2. del: urejevalnik, skupnostne proge, dnevna proga, sklopa 3–4)

> **Stanje:** ⬜ čaka — predpogoj 32

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/33-motorist-urejevalnik.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »6. Motorist (fizikalni trial)«. 1. del (`prompts/32-motorist.md`) je naredil igro
> v `games/motorist/`: fiziko (Planck.js), voznika z ragdollom, 2,5D izris, 10 prog v dveh sklopih, napake, medalje,
> ghoste in stran z drsniki. **Najprej preberi** razdelek »Motorist« v `PROGRESS.md` (posebej »Ni bilo narejeno«) in
> `games/motorist/README.md`. Kar iz 1. dela ni bilo narejeno, naredi **najprej**.
>
> Obstoječe proge, fizika (`config.js`), časi, medalje, lestvice in ghosti uradnih prog ostanejo popolnoma enaki.
> Če moraš spremeniti fiziko, je to ločena odločitev: utemelji v `PROGRESS.md` in znova izračunaj medalje vseh prog.
>
> Če je 1. del uporabil drugačna imena modulov ali format proge, kot piše tu, velja dejansko stanje v kodi.

---

## Cilj
1. **Urejevalnik prog** (2D, veliko preprostejši kot pri Krogli): rišeš črto terena, postavljaš objekte, takoj
   preizkusiš vožnjo.
2. **Skupnostne proge** v Supabase z lestvico po progi in **»Proga tedna«**.
3. **Dnevna proga** (šteje prvi poskus).
4. **Še vsaj 10 uradnih prog** v sklopih 3 (težke) in 4 (ekstremne).

## 1. Urejevalnik (`games/motorist/editor.html` + `editor.js`, `editor.css`, po potrebi `editor/*.js`)
- Primarno za namizje (miška + tipkovnica). Na telefonu mora vsaj **odpreti in odigrati** lastno progo; urejanje je
  lahko poenostavljeno (tap = točka, dva prsta = pan/zoom), ne sme pa se zlomiti.
- **Platno 2D** s pan/zoom (kolesce, srednji gumb ali preslednica + vlek), mreža z neobveznim pripenjanjem (0,5 m),
  ravnilo v metrih, prikaz naklona odseka v stopinjah (rdeče, če je > ~40°).
- **Orodja:**
  - **Teren:** dodaj točko (klik), premakni (vlek), izbriši (desni klik / Delete), vstavi točko na odsek, gladko
    (Catmull-Rom) da/ne na del, več delov terena (nov otok), površina odseka (navadno, led, trak s hitrostjo).
  - **Objekti:** paleta vseh tipov iz 1. dela (zaboj, dinamični zaboj, hlod, gugalnica, most, sod, dvigalo s potjo,
    kontrolna točka, start, cilj, dekor) z urejanjem lastnosti v stranski plošči (velikost, masa, pot dvigala …).
  - **Tema** proge (izbor iz tem 1. dela) in ime/opis.
- **Razveljavi/Uveljavi** (Ctrl+Z / Ctrl+Y) na ravni operacij; vlek je ena operacija.
- **Čist model** (`editor/model.js`, brez DOM-a, s testi): nova proga, dodaj/premakni/izbriši točko in objekt,
  normalizacija (urejene točke po x znotraj dela, start pred ciljem), vse prek validatorja `validateTrack` iz 1. dela.
- **Preizkusna vožnja** (`T` ali gumb): odpre progo v pravi igri (isti `physics.js` in `view.js`) v istem zavihku ali
  plasti; `Esc` nazaj v urejevalnik na isto mesto. Vožnja iz kontrolne točke pod miško (za hitro preizkušanje dela).
- **Shranjevanje:** osnutki v `localStorage` (prek `shared/storage.js`, več osnutkov, samodejno shranjevanje),
  izvoz/uvoz JSON, **deljenje s povezavo** (`?custom=…`) po vzoru `games/krogla/editor/share.js` (stiskanje,
  omejitev velikosti, vedno validiraj — uvozi ali posnemi pristop, Krogle ne spreminjaj).
- **Preverjanje pred objavo:** validator brez napak + avtor mora progo **prevoziti do cilja** v urejevalniku (njegov čas
  postane `dev`, iz njega se z isto funkcijo kot v 1. delu izračunajo medalje). Brez prevoza ni objave.
- Povezave: v meniju igre »✏️ Urejevalnik« in »🌍 Proge skupnosti«, v urejevalniku »Nazaj v igro«.

## 2. Skupnostne proge (Supabase)
- Razširi `supabase/games/motorist.sql` po vzoru »PROGE SKUPNOSTI« v `supabase/games/krogla.sql`:
  - `motorist_custom_tracks` (id, avtor, ime, hash, podatki `jsonb`, `dev_ms`, čas objave, število voženj, všečki),
    berejo prijavljeni, avtor briše svoje; objava/posodobitev **samo prek RPC** `motorist_publish_track` (omejitev
    velikosti, največ 20 prog na igralca, validacija osnovne oblike na strežniku).
  - `motorist_custom_plays` (en zapis na igralca in progo) → števec voženj; neobvezno `motorist_custom_likes`.
  - Lestvica proge: `public.game_scores` z `game = 'motorist'`, `seed = 'custom:<id>'` (brez spremembe sheme huba),
    ghost najboljšega prek `motorist_ghosts` (ključ proge `custom:<id>`) — preveri, da RPC za ghoste to dopušča.
  - Idempotentno, RLS vklopljen, `security definer` v `private`, `security invoker` ovojnice v `public`.
- **Brskalnik prog:** seznam (najnovejše, najbolj igrane, najbolj všečne, moje), kartica z imenom, avtorjem
  (`ui.who`), temo, številom voženj, mojim rezultatom; filter po težavnosti (iz medalj/dolžine).
- **Proga tedna:** iz skupnostnih prog jo izbere seed tedna (`hub.dailySeed` po tednu ali ISO teden, Europe/Ljubljana)
  med progami z vsaj N vožnjami in veljavnim `dev`; lastna lestvica tedna (`seed = 'week:<leto-teden>'`), kartica na vrhu
  menija. Offline: proga tedna iz uradnih prog sklopov 2–4.
- Če imaš Supabase MCP orodja, poženi SQL kot migracijo in preveri `get_advisors` (security + performance); sicer
  napiši v `PROGRESS.md`, kaj mora uporabnik pognati.

## 3. Dnevna proga
- `hub.dailySeed` izbere progo: **generirana iz seeda** z istim generatorjem odsekov kot `tools/motorist-tracks.mjs`
  (izvozi generator kot čist modul, ki ga uporabljata orodje in igra) in preverjena z botom/validatorjem; če preverjanje
  ne uspe, izberi iz nabora uradnih prog. Isti dan = ista proga za vse.
- **Šteje prvi poskus** (`daily: true` v `hub.reportGame`, lestvica dneva), nadaljnje vožnje so trening.
- Kartica »Dnevna proga« v meniju z mojim rezultatom in najboljšim dneva. Oznaka `daily` v `games.json`.

## 4. Sklopa 3 in 4 (vsaj 10 novih prog)
- Težke (3): daljše, natančni skoki na stopnice, mostovi, ki se podrejo, dvigala, eksplozivni sodi v nizu.
  Ekstremne (4): previsi, salto kot edina pot, led + strmina, kombinacije gugalnic. Vse teme naj bodo zastopane.
- Odklepanje kot v 1. delu (bron na 4 progah prejšnjega sklopa). Medalje z orodjem in botom/posnetkom vnosov;
  rezultat preverjanja v `PROGRESS.md`. Nove proge dodaj v `motorist_tracks` (blok, ki ga piše orodje).
- Dosežki: `urednik` (objavi progo), `priljubljena` (tvojo progo je prevozilo 5 drugih), `tedenski` (zmaga proge tedna
  ob koncu tedna — če se brez strežnika ne da zanesljivo, »top 3 ob tvojem zadnjem ogledu«), `ekstrem` (zlato na progi
  sklopa 4), `dnevni-niz` (7 dni zapored dnevna proga).
- Naloge v `games.json`: npr. m »Prevozi dnevno progo« (`daily:motorist`), m »Prevozi progo skupnosti«
  (`motorist:skupnost`, target 1), w »Prevozi 5 prog skupnosti ta teden« (`motorist:skupnost`, target 5).

### Testi
- `editor/model.js`: dodaj/premakni/izbriši točko in objekt, razveljavi/uveljavi, normalizacija, veljavnost po operacijah.
- Deljenje: encode/decode krog, prevelika/pokvarjena povezava → jasna napaka.
- Generator dnevne proge: isti seed → ista proga, proge so veljavne, več seedov (npr. 30) brez napak validatorja.
- Proga tedna: izbor je determinističen iz tedna in seznama.
- Vse uradne proge (tudi nove) veljavne in prevozne (orodje/test).

### Prioritete, če zmanjkuje časa
1. Kar ni bilo narejeno v 1. delu.
2. Urejevalnik: teren + objekti + preizkusna vožnja + osnutki + izvoz/uvoz.
3. Deljenje s povezavo in objava v Supabase z lestvico in ghostom.
4. Dnevna proga.
5. Sklopa 3–4, proga tedna, brskalnik prog s filtri, všečki.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in vključi na začetek prompta 34.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija `# Motorist — urejevalnik in skupnostne proge`:
načrt s kljukicami, dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API.
3. `games/motorist/README.md` in razdelek »Motorist« v `PROGRESS.md`.
4. `games/krogla/editor.html`, `games/krogla/editor.js`, `games/krogla/editor/*.js` (osnutki, deljenje, model) in
   razdelek »PROGE SKUPNOSTI« v `supabase/games/krogla.sql` — vzorec, ne kopiraj kode, kjer jo lahko uvoziš.

### Tehnično
- Vse v `games/motorist/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini, `shared/` za
  UI, lestvice, XP, dosežke, `hub.reportGame` po vsaki prevoženi progi (tudi skupnostni in dnevni).
- Čisto logiko (model urejevalnika, deljenje, generator, izbor proge tedna) v module brez DOM-a, s testi v `tests/motorist.js`.
- Supabase: `supabase/games/motorist.sql` (idempotentno, RLS). Offline način mora delovati (skupnostne proge v offline
  adapterju le lokalno ali skrite z jasnim sporočilom).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, urejevalniku in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (obstoječi testi nespremenjeni).
4. V urejevalniku naredi progo od začetka, jo prevozi, deli s povezavo (odpri v drugem zavihku), objavi (ali preveri
   offline pot), odigraj jo iz brskalnika prog. Odigraj dnevno progo in eno novo progo sklopa 3.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi.
6. Posodobi `games.json` (oznaka `daily`, nove naloge; test sheme uspe).
7. Posodobi `PROGRESS.md`, `games/motorist/README.md` (urejevalnik, deljenje, skupnostne proge, dnevna proga, proga tedna),
   korenski `README.md`, po potrebi `supabase/games/README.md`, in **stanje prompta**: vrstica na vrhu → ✅ s commitom,
   vrstica v `prompts/README.md`, oznaka pri točki 6 v `PREDLOGI-IGER.md`.
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu: posodobi naslednji prompt
Prompt **`prompts/34-motorist-dirka.md`** je že napisan. Posodobi ga z dejanskim stanjem (imena modulov, kako se proga
pošlje igralcem v sobi, format ghosta, kaj ni bilo narejeno — na začetek). Omeni ga v končnem odgovoru.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako uporabiti urejevalnik, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
