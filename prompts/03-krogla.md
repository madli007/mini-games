# Prompt za AI agenta: Hrčkova krogla (singleplayer)

> **Stanje:** ✅ narejeno — commit `fb545a6` (21. 11. 2026)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/03-krogla.md in ga v celoti izvedi.«**
>
> Ozadje in ideje: `PREDLOGI-IGER.md` → »Hrčkova krogla«. Party arena (Rušilec) in predmeti za igre v trgovini
> **nista** del te naloge, sta ločena prompta.

---

## Igra

- **Ime:** Hrčkova krogla
- **id / mapa:** `krogla` → `games/krogla/` (nov vnos v `games.json`)
- **Kratek opis (za kartico):** »Kotališ hrčka v krogli po zračnih progah. Izogni se oviram in sovražnikom, preden poteče čas.«
- **Način:** `single` · **Število igralcev:** 1–1 · **Oznake:** `arkada`, `daily`, `spretnost`, `rekordi`
- **Ikona / barva:** 🐹 · `#ffd23f`

Igra je navdihnjena s Hamsterballom (Raptisoft, 2004), ni pa njegova kopija: imena, proge, grafika
in zvok so naši. Ne uporabljaj imen prog, likov, grafike ali zvokov iz originala.

### Jedro igre
- Igralec kotali prozorno kroglo s hrčkom v njej po progah, ki visijo v zraku, od starta do **cilja**.
  Krogla ima vztrajnost: pospešuje, drsi, se odbija in pada. Ni skakanja.
- **Življenj ni, igra se na uro.** Na začetku vsake proge se uri prišteje čas proge (`timeBonus` iz JSON-a,
  pomnožen s težavnostjo). **Preostanek se prenese v naslednjo progo.** Ko ura pride na 0, je igre konec.
- **Padec čez rob:** kratka animacija, nato se krogla pojavi na zadnji **kontrolni točki** (zastavica,
  ki se aktivira ob dotiku). Ura med padcem teče naprej, kazni ni.
- **Pobiralke:** ura (+3 s), zvezdica (+točke; na vsaki progi 5 skritih, štejejo za dosežek), redka
  bližnjica (skrita pot, ki prihrani čas).
- **Ob cilju:** povzetek proge (čas, preostali čas, zvezdice, točke) in prehod na naslednjo progo.

### Kontrole
- **Tipkovnica:** puščice / WASD. **Miška:** krogla se kotali proti kazalcu, hitreje, čim dlje je kazalec
  (kot palica, z mrtvo cono na sredini).
- **Telefon:** privzeto **virtualna palica** (levi spodnji kot, `touch-action: none`); v nastavitvah
  **nagib telefona** (`deviceorientation`, na iOS `DeviceOrientationEvent.requestPermission()` ob tapu na gumb,
  kalibracija »trenutni položaj = ravno«). Vhod je vedno relativen na kamero (gor = stran od kamere).
- **Esc / P** ali gumb ⏸ = pavza. Igra se **sama ustavi**, ko zavihek ni viden (`visibilitychange`),
  sicer bi ura tekla v ozadju.
- **R** = ponovi progo (v načinu Na čas) oziroma vrnitev na kontrolno točko (v turnirju; stane 2 s).

### Proge (vsaj 12, v treh sklopih)
Vsak sklop uvede novo mehaniko, vsaka proga pa doda eno novo stvar in ponovi prejšnje. Predlog
(imena, vrstni red in vsebino lahko prilagodiš, ostati pa morajo naša):

| # | Proga | Kaj je novo |
|---|---|---|
| 1 | Ogrevanje | široka pot, klančina, cilj; kontrole in kamera |
| 2 | Vrtnarija | ozke poti brez ograj, prvi zavoji ob robu |
| 3 | Skodelice | lijaki in sklede (krogla zakroži), valovita tla |
| 4 | Kuhinja | premične ploščice, ki gredo levo-desno |
| 5 | Steklena pot | ozek most, padajoče ploščice (zatresejo se, nato padejo) |
| 6 | Tovarna | tekoči trakovi, kladiva na časovnik, vrata na stikalo |
| 7 | Stolp | spiralna pot navzgor, dvigala, ventilatorji |
| 8 | Ledena dvorana | led (malo trenja), lepilo (veliko trenja), vzmeti |
| 9 | Nasilneži | sovražna krogla, ki te lovi in izriva; magneti |
| 10 | Neon | vrtljive plošče, žage na tirnicah, ose po vzorcu |
| 11 | Nebo | vse skupaj, dolgi skoki z rampe čez prepad, sesalec |
| 12 | Nemogoče | kratka, zelo težka proga z vsem; za mojstre |

Proge so **podatki, ne koda**: `games/krogla/levels/NN-<ime>.json` in `levels/index.json` (vrstni red).
Oblikuj format in ga opiši v `games/krogla/README.md`. Predlog:
- mreža ploščic z višino (`tiles`: tip `flat`, `ramp` s smerjo, `bowl`, `ice`, `glue`, `conveyor` s smerjo,
  `fall`, `bumper`, `wall` …) ali seznam kvadrov/klančin v 3D; izberi, kar je za fiziko najbolj zanesljivo;
- `start`, `goal`, `checkpoints[]`, `pickups[]`, `movers[]` (pot, hitrost, faza), `enemies[]` (tip, parametri),
  `switches[]` → `doors[]`, `timeBonus`, `medals: { gold, silver, bronze }` v sekundah, `theme` (barve, nebo).

Za ustvarjanje prog lahko napišeš pomožno skripto (`tools/krogla-levels.mjs`), ki JSON generira iz
bolj berljivega opisa. Tudi ta je brez npm odvisnosti. **Vsaka proga mora biti preizkušeno rešljiva**
(glej preverjanja). Časi medalj naj bodo uglašeni na lastnih vožnjah: zlato je težko, bron dosegljiv v 2–3 poskusih.

### Ovire in sovražniki (vse z jasnim »telegrafom«: vidno in slišno, preden škodi)
- **Ovire:** premične ploščice, padajoče ploščice, vrtljive plošče, tekoči trakovi, led, lepilo, vzmeti
  (izstrelijo v smeri), ventilatorji (potisk), dvigala, vrata na stikalo (stikalo pritisneš s kroglo),
  kladiva (udarec odbije), ozki mostovi, lijaki.
- **Sovražniki:**
  - **Nasilnež**: večja in težja krogla, ki te lovi v svojem območju in te izriva čez rob; po padcu se vrne domov.
  - **Žaga na tirnici**: dotik te odbije in zamaje (kratka izguba nadzora).
  - **Ose**: letijo po vzorcu nad potjo, dotik te potisne.
  - **Sesalec**: v stožcu vleče kroglo proti sebi in robu.
  - **Magnet**: privlači ali odbija, utripa v ritmu.
- Sovražniki so deterministični (vzorci, časovniki in sledenje iz stanja), ne naključni, da so ghosti in časi pošteni.

### Načini
1. **Turnir** (glavni način): vse proge zapored s prenosom časa. Težavnost ob začetku:
   - **Lahka**: ×1,4 časa, točke ×0,5, ne odklene zrcalnega turnirja;
   - **Normalna**: ×1,0;
   - **Noro**: ×0,75 časa, točke ×1,5.
   Točke: 1000 na končano progo + 20 na preostalo sekundo ob cilju + 100 na zvezdico, × težavnost.
   Ob koncu (cilj zadnje proge ali poteklo) se točke oddajo na lestvico. Napredek se **ne** shranjuje
   sredi turnirja; turnir je ena seja (10–20 min).
2. **Na čas**: odklenjene proge posamezno (proga se odklene, ko jo dosežeš v turnirju na Normalni ali Noro).
   Brez ure, merimo čas do cilja. Bron/srebro/zlato, lestvica po progi in **ghost** najboljše vožnje
   (moj najboljši in najboljši na lestvici; prosojna krogla). Vožnjo začneš znova z eno tipko.
3. **Zrcalni turnir**: odklene se, ko končaš turnir na Normalni ali Noro (shranjeno kot dosežek, da velja
   na vseh napravah). Proge so zrcaljene po osi X. Ločena lestvica.
4. **Dnevni izziv**: `hub.rng(hub.dailySeed() + ':krogla')` izbere 3 proge (iz že odklenjenih ali iz prvih 8,
   da je dostopno vsem) in **dodatek dneva**, npr. »vse je led«, »dvojna hitrost sovražnikov«, »manjša
   krogla, močnejši ventilatorji«, »zrcaljeno«, »pol časa, ure povsod«. Ura s prenosom kot v turnirju,
   en poskus šteje za lestvico (ostali so trening; prikaži to jasno). Lestvica dneva s `seed: hub.dailySeed()`.

### Ghosti in lestvice
- Lestvice prek `hub.submitScore` z ločenimi seedi: `turnir:<težavnost>`, `zrcalo:<težavnost>`,
  `lvl:<id>` (čas v ms, `order: 'asc'` pri branju), `lvl-m:<id>` (zrcaljeno), dnevni izziv z `hub.dailySeed()`.
  `ui.leaderboard` z zavihki (Danes / Teden / Vseh časov) in `format` za čas (`1:23,45`) ali točke.
- **Ghost:** med vožnjo zapisuj položaj in rotacijo krogle ~20× na sekundo, kvantizirano in stisnjeno
  (delta kodiranje, nato base64; cilj < 20 KB za 2 min). Lokalno vedno shrani svojega najboljšega
  (`shared/storage.js`). Za Supabase dodaj **`supabase/games/krogla.sql`**: tabela `krogla_ghosts`
  (`user_id`, `level`, `mirror`, `time_ms`, `data`, `created_at`; pk `(user_id, level, mirror)`),
  RLS: vsi prijavljeni berejo, piše se samo prek RPC `krogla_save_ghost`, ki shrani le, če je čas boljši,
  in omeji velikost `data`. Igralec v načinu Na čas izbere ghost iz lestvice (klik na vrstico).
  Ghoste beri in piši prek majhnega API-ja v `shared/` (npr. `hub.saveGhost` / `hub.getGhosts`), ki ga
  implementirata oba adapterja (offline: `localStorage`), da igra ne ve, kateri adapter teče (pravilo iz `CLAUDE.md`).
  API dokumentiraj v `shared/README.md`, da ga lahko uporabijo tudi druge igre (npr. Motorist).
- Lestvica je »na časten način«; RPC naj zavrne nemogoče čase (npr. pod 30 % zlatega časa proge).

### Povezava s hubom
- `await hub.init({ gameId: 'krogla' })`, `ui.header({ title: 'Hrčkova krogla' })`.
- **`hub.reportGame({ won: false, players: 1, score, daily })`** ob koncu turnirja, zrcalnega turnirja,
  dnevnega izziva in vsake vožnje v načinu Na čas (Na čas: največ enkrat na minuto, da se ne »farma«).
- `hub.reportEvent`: `krogla:proga` (končana proga v kateremkoli načinu), `krogla:gold` (zlata medalja), `krogla:sklop` (vrednost = končan sklop 1–3), `krogla:turnir`.
- **XP:** 20 za končano progo v turnirju (največ 12 na turnir), +100 za končan turnir, +50 za novo zlato.
- **Dosežki (vsaj 8):** `prva-proga` (končaj Ogrevanje), `sklop-1`, `sklop-2`, `turnir` (končaj turnir;
  odklene zrcalni), `zrcalo` (končaj zrcalni turnir), `brez-padca` (proga 6+ brez padca), `vse-zvezdice`
  (vse zvezdice na eni progi), `zlato-vse` (zlato na vseh progah), `noro` (turnir na Noro), `rezerva`
  (končaj turnir z več kot 60 s preostanka).
- **Naloge** v `games.json`: e »Končaj 3 proge v Hrčkovi krogli« (`krogla:proga`), m »Osvoji zlato medaljo
  v Hrčkovi krogli« (`krogla:gold`), h »Končaj 2. sklop v Hrčkovi krogli« (`krogla:sklop`, `gte`, `goal` 2),
  w »Končaj turnir v Hrčkovi krogli« (`krogla:turnir`). Dogodke ustrezno sporoči.
- Kovance dobiš samo prek `reportGame` in nalog (ne kliči `hub.awardCoins` za zvezdice).

### Videz in zvok
- 3D z **Three.js prek CDN s pripeto verzijo** (npr. `three@0.160.0`, ES modul z jsDelivr) ali lasten WebGL,
  če se ti zdi bolje. Izometrična/tričetrtinska kamera, ki gladko sledi krogli in se ne zatakne v stene;
  rahlo se zasuka v smeri gibanja (z možnostjo izklopa).
- Krogla: prozorna steklena krogla z odsevom in senco na tleh, hrček v njej je iz preprostih oblik
  (ali emoji na sprite-u), teče v smeri kotaljenja. **Videz krogle naj bo parameter** (`skin`: barva stekla,
  prosojnost, lik v njej, sled), ker bo trgovina kasneje prodajala druge krogle. Fizika je za vse skine enaka.
- Vsak sklop ima svojo temo (barve ploščic, nebo, megla). Brez slikovnih datotek, vse iz geometrije in
  barv (proceduralne teksture na canvasu so OK). Retro-neon slog, usklajen z `ui.css`.
- Zvok: WebAudio sintetizirani učinki (kotaljenje glede na hitrost, udarec, padec, pobiralka, kontrolna
  točka, cilj, tiktakanje zadnjih 10 s) in preprosta glasba v zanki; gumb za izklop (shranjen).
- Animacije spoštujejo `prefers-reduced-motion` (manj tresenja kamere in delcev).
- Kakovost: samodejno znižaj ločljivost/sence, če FPS pade pod ~45 (telefoni).

### Tehnično
- Ločeni moduli, npr.: `physics.js` (čista logika: krogla, trenje, naklon, trki s ploščicami in kvadri,
  sile ventilatorjev/magnetov, fiksni korak 120 Hz z akumulatorjem), `level.js` (nalaganje, validacija,
  zrcaljenje), `rules.js` (ura, točke, medalje, odklepi, težavnost, dnevni izbor), `ghost.js`
  (zapis, stiskanje, predvajanje), `render.js`, `input.js`, `audio.js`, `game.js` (stanja: meni, igra,
  pavza, povzetek, konec).
- Fizika ne sme biti odvisna od FPS: isti vhod pri 30 in 144 FPS da (skoraj) enak rezultat. Krogla ne sme
  pri visoki hitrosti iti skozi tanko steno (substeps ali swept test).
- **Validator prog** v `level.js`: preveri obvezna polja, da start in cilj obstajata, da so kontrolne točke
  na tleh, in vrne razumljive napake. Testi ga poženejo na vseh JSON-ih v `levels/`.
- Meni igre: Turnir (izbira težavnosti), Na čas (mreža prog z medaljami in najboljšimi časi, zaklenjene
  so sive), Zrcalni turnir (zaklenjen z razlogom), Dnevni izziv (dodatek dneva, odštevanje do polnoči),
  Lestvice, Nastavitve (kontrole, nagib, zvok, kamera, kakovost), Kako igrati.

---

## Fiksni del

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (dnevni seed, lestvice, `reportGame`).
4. `games/pinball/` — kako je narejena WebGL igra s fiksnim korakom fizike in nastavitvami kakovosti.
5. `prompts/TEMPLATE-igra.md` — fiksni del, ki velja tudi tukaj.

### Tehnično (iz predloge)
- Igra v `games/krogla/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `../../shared/ui.css` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- Uporabi `shared/` za profil, XP, dosežke, lestvice, dnevni seed, `ui.toast`, `ui.modal`, `ui.countdown`,
  `ui.results`. Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- `supabase/games/krogla.sql` idempotenten, RLS vklopljen, `security definer` funkcije v `private`,
  v `public` le `security invoker` ovojnice (kot v `schema.sql`). Če imaš Supabase MCP orodja, ga poženi
  kot migracijo in preveri `get_advisors` (security + performance) ter popravi opozorila; z lažnimi JWT
  preizkusi: tuj zapis ghosta, preveliki `data`, slabši čas, nemogoč čas. Sicer zapiši v `PROGRESS.md`,
  kaj mora uporabnik pognati.
- Čisto logiko dodaj v `tests/tests.js`: fizika (krogla na ravnem se ustavi, na klančini pospeši, ne gre
  skozi steno pri največji hitrosti, neodvisnost od FPS), ura in prenos časa, točke in težavnosti,
  medalje, odklepi, zrcaljenje, dnevni izbor (determinizem, isti za vse), ghost (zapis → stiskanje →
  predvajanje da isto pot, velikost pod mejo), validator na vseh progah.
- **Rešljivost prog:** za vsako progo posnemi svojo vožnjo kot ghost (ali napiši preprostega »avtopilota«
  po točkah poti) in v testu preveri, da predvajanje vhoda pripelje do cilja v času, krajšem od
  `timeBonus` na Normalni. Te vožnje so lahko tudi privzeti »razvijalčevi ghosti« za primerjavo.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi pinball testi ostanejo zeleni).
4. V brskalniku **sam odigraj** vsaj prve 4 proge v turnirju, eno progo Na čas z ghostom, dnevni izziv
   in eno zrcaljeno progo; preveri padec in kontrolno točko, pavzo ob skritem zavihku, konec ob poteku ure,
   oddajo na lestvico, `reportGame` (kovanci in napredek nalog na dashboardu).
5. Offline (`?offline=1`) in s Supabase (`?igralec=1`, `?igralec=2`): drugi igralec vidi rezultat na
   lestvici in lahko izbere tujega ghosta.
6. Izgled na **telefonu (375×812)** z virtualno palico in na **namizju**: posnemi zaslone, sam jih preglej
   in popravi, kar je neurejeno. FPS na telefonski emulaciji razumen.
7. V `games.json` dodaj vnos igre kot **`live`** (in preveri, da test sheme uspe).
8. Posodobi `PROGRESS.md`, `README.md` (seznam iger) in `games/krogla/README.md` (kontrole, format prog,
   kako dodati progo).
9. Testne profile in ghoste, ki jih ustvariš v produkcijski bazi, na koncu **izbriši**.
10. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, katere proge so in kako težke so,
kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
