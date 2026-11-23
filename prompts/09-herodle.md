# Prompt za AI agenta: Herodle — 1. faza (podatki, logika, Klasika, bonus, statistika, Supabase)

> **Stanje:** ✅ narejeno — commit `7928da7` (22. 11. 2026)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/09-herodle.md in ga v celoti izvedi.«**
>
> Ozadje: `../herodle.md` (izvirna ideja: atributi, barve, primer podatkov, avtorske pravice).
> Kjer se ta prompt in `herodle.md` razlikujeta, velja ta prompt. To je **prva od treh faz**:
> 1. **ta prompt**: podatki o likih, `logic.js` s testi, Klasika (3 bazeni, težki način), bonus krogi, statistika,
>    deljenje, Supabase RPC-ji proti goljufanju;
> 2. `prompts/14-herodle-nacini.md`: načini Emoji, Kostum in Dosje (z dodatnimi podatki o likih), arhiv, »popolni dan«;
> 3. `prompts/15-herodle-dvoboj.md`: dvoboj 2–10 igralcev v realnem času in TV pogled.
>
> Načini Emoji/Kostum/Dosje, arhiv in dvoboj **niso** del te naloge. Kodo pa zasnuj tako, da jih naslednji fazi dodata
> brez predelave jedra: načini kot ločeni moduli z enakim vmesnikom, en vir za lik dneva (`daily.js`), podatki o likih
> razširljivi z novimi polji.

---

## Igra

- **Ime:** Herodle
- **id / mapa:** `herodle` → `games/herodle/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Ugani skritega superjunaka dneva po namigih v barvah. Bonus vprašanja, niz dni in lestvica prijateljev.«
- **Način:** `single` (dvoboj pride v 3. fazi) · **Število igralcev:** 1–1 · **Oznake:** `daily`, `kviz`, `ugibanje`
- **Ikona / barva:** 🦸 · `#ff3b5c`
- **Rezultat:** število poskusov v **Klasiki dneva** (bazen *Mešano*). **Manj je bolje** (`scoreOrder: 'asc'`,
  `scoreUnit: 'poskusov'`). Bazena *Samo MCU* in *Samo DC* imata svoj niz in statistiko, na lestvico pa gresta kot
  zavihka (`seed` = `datum:način`, glej id-je načinov spodaj). Bonus vprašanja prinesejo **zvezdice ⭐** (XP, dosežki,
  naloge) in ne vplivajo na lestvico poskusov.

Igra je navdihnjena z »-dle« igrami (dnevna uganka za vse, barvni namigi, deljenje emoji mreže, bonus krogi po
zmagi), ni pa kopija nobene: ime, izgled, načini in besedila so naši. **Neuradna fan igra**: brez uradnih slik,
posterjev, logotipov, pisav, posnetkov, glasbe in citatov iz filmov ali stripov. Imena likov, igralcev in dejstva
so OK. V nogi: »Neuradna fan igra, ni povezana z Marvel ali DC.« V naslovu in na kartici ne uporabljaj
»Marvel« ali »DC«.

### Občutek in stil (pomembno!)
Igra mora delovati **moderno in sočno**, kot dobra dnevna igra na telefonu, ne kot tabela v Excelu. Torej:
- **Stripovski neon**: temno ozadje z rahlim halftone vzorcem (CSS `radial-gradient`, brez slik), kartice z debelim
  robom in rahlim zamikom sence kot stripovski okvirji, naslovi v krepki pisavi (npr. Google Fonts *Bangers* ali
  *Anton*, s sistemsko rezervo). Izhajaj iz `shared/ui.css` in barve igre `#ff3b5c`.
- **Razkrivanje vrstice**: ob poskusu se celice atributov ena za drugo obrnejo (flip, ~120 ms zamika med njimi) in
  šele nato pokažejo barvo. Pri letnici puščica ↑/↓ rahlo poskoči. Celotna zelena vrstica = eksplozija »POW!«
  stripovskega oblačka + konfeti (`ui.winFx`).
- **Barve in dostopnost**: zeleno (pravilno), rumeno (delno/blizu), rdeče (narobe). Vsaka celica ima poleg barve
  še **simbol** (✓ / ≈ / ✗) za barvno slepe; v nastavitvah *visok kontrast* (modro/oranžno).
- **Iskalno polje**: velik vnos z avtocomplete (išče po imenu, aliasih in alter egu, ignorira šumnike, velike črke in
  ločila; »spider«, »spajder« in »parker« najdejo Spider-Mana). Že ugibani liki so v seznamu prečrtani in jih ni mogoče
  izbrati. V predlogih so samo liki iz trenutnega bazena. Puščice + Enter na namizju, tap na telefonu.
- **Zvok**: kratki sintetizirani efekti prek WebAudio (brez datotek): »tik« pri flipu, »whoosh« ob napačnem,
  fanfara ob zmagi, »ding« za bonus zvezdico. Gumb za utišanje, nastavitev shranjena prek `shared/storage.js`.
- **Komentator**: kratki slovenski napisi ob poskusih, npr. »Vsaj univerzum je pravi.«, »Toplo, toplo …«,
  »Prvi poskus?! Si ti jasnoviden?«, »Ta je pa iz druge galaksije.« Vsaj ~20 variant, izbira glede na rezultat
  poskusa (koliko zelenih, ali je univerzum pravi, ali je letnica blizu).
- Vse animacije spoštujejo `prefers-reduced-motion` (takrat brez flipa in konfetov, samo barve).

### Zgradba (da 2. in 3. faza ne predelujeta jedra)
- `heroes.js` — podatki o likih (glej spodaj). `logic.js` — čista logika brez DOM-a.
- `daily.js` — **lokalni modul igre** (ne skupni `shared/`): `getToday(mode)`, `check(mode, date, heroId)`,
  `giveUp(mode, date)`, `reveal(mode, date)`. Ima dva adapterja (Supabase / offline) z **enakim vmesnikom**; igra ne
  ve, kateri teče (izbere se glede na `hub.mode`).
- `modes/klasika.js` — način kot modul z vmesnikom, npr. `{ id, label, icon, mount(el, ctx), unmount() }`. 2. faza
  doda `modes/emoji.js`, `modes/kostum.js`, `modes/dosje.js` brez sprememb v `main.js`, razen registracije.
- Id-ji načinov (uporabljajo se v seedu, statistiki in Supabaseu): `klasika`, `klasika-mcu`, `klasika-dc`; 2. faza
  doda `emoji`, `kostum`, `dosje`.
- **Zavihki načinov** na vrhu zaslona (ikona + kljukica, če je danes rešen) so narejeni že zdaj, z enim zavihkom
  *Klasika* in pod-izbiro bazena (*Mešano* / *Samo MCU* / *Samo DC*). Ne kaži zaklenjenih »kmalu« zavihkov.

### Klasika 🧩
Ugibanje po atributih (tabela spodaj), **neomejeno poskusov**. Vsak bazen ima svoj lik dneva, svoj niz in statistiko:
*Mešano* (privzeto, gre na glavno lestvico), *Samo MCU* (liki z `inMcu: true`, v predlogih samo ti) in *Samo DC*.

- **Predam se**: gumb (po 10. poskusu bolj viden), potrditev v `ui.modal`. Razkrije lik, rezultat se ne pošlje na
  lestvico, niz za ta bazen se prekine, statistika šteje »ni rešeno«.
- **Težki način** (stikalo v nastavitvah): vsak naslednji poskus mora biti skladen z vsemi zelenimi namigi doslej
  (sicer opozorilo z razlogom, poskus ne gre čez). Preverja se samo iz rezultatov prejšnjih poskusov, zato deluje
  enako v obeh adapterjih. Rešitve v težkem načinu imajo v deljenju oznako 💀. Stikalo se da spremeniti le pred prvim
  poskusom dneva.

### Atributi v Klasiki
| Atribut | Primeri | Namig |
|---|---|---|
| Univerzum | Marvel, DC | zeleno / rdeče |
| Ekipa | Avengers, Justice League, X-Men, Teen Titans, Guardians, Suicide Squad, Fantastic Four, Brez | zeleno = glavna ekipa enaka / **rumeno = katera koli ekipa iz `teams` se ujema** / rdeče |
| Vrsta | Človek, Bog, Polbog, Vesoljec, Atlantid, Eternal, Android, Mutant, Simbiot | zeleno / rdeče |
| Izvor moči | Tehnologija, Božanski, Nesreča, Magija, Rojen, Zelišče, Trening, Serum, Brez | zeleno = vsi izvori enaki / rumeno = vsaj eden se ujema / rdeče |
| Spol | M, Ž, Drugo | zeleno / rdeče |
| Prvi strip (leto) | 1938, 1962 … | zeleno = točno, rumeno = ±10 let, rdeče; puščica ↑ (skriti je kasnejši) / ↓ (zgodnejši) |
| Stran | Junak, Zlobec, Antijunak | zeleno / rdeče |

Univerzum je prvi stolpec. Najnovejši poskus je na vrhu. Na telefonu se tabela ne sme vodoravno drsati po celem
zaslonu: stolpci so ozki z ikonami/kraticami v glavi (s `title` / tap legendo), vrstica se lahko po potrebi
prelomi v 2 vrsti. Vsaka vrstica ima na levi »žeton« lika (krog z inicialkami v barvi `color`, **ne slika**).

### Bonus krogi po zmagi
Ko rešiš Klasiko (kateri koli bazen), se odpre **bonus serija 3 vprašanj** o istem liku, vsako z enim poskusom
in izbiro med 4 možnostmi (napačne možnosti iz istega univerzuma, da ni preveč lahko). Vsak pravilen odgovor = ⭐.
Iz nabora izberi 3 glede na seed (samo tista, za katera ima lik podatke in ki niso v `unsure`):
- **Igralec**: »Kdo ga je igral v filmu?« (samo za like z `actors`; pri več igralcih je vsak pravilen)
- **Alter ego**: »Kako mu je civilno ime?«
- **Domovanje**: »Kje živi / deluje?« (New York, Gotham, Wakanda, Asgard, Metropolis …)
- **Prvi film**: »V katerem letu je prvič nastopil v celovečercu?« (drsnik; ±2 leti = ⭐, točno = ⭐⭐)
- **Nemesis**: »Kdo je njegov glavni nasprotnik?«
- **Uvrščanje**: »Razvrsti te 4 like po letu prvega stripa« (povleci, vse pravilno = ⭐; brez dveh likov z enako letnico)

Bonus se odigra enkrat na dan na bazen (stanje v `shared/storage.js`, osvežitev ga ne ponovi).
Po bonusu **kartica lika** (»Dosje razkrit«): ime, alter ego, univerzum, ekipe, prvi strip, prvi film, domovanje,
nemesis, žeton v barvi `color`. Brez slik. (2. faza doda paleto kostuma in zanimiva dejstva.)

### Konec dneva, statistika in deljenje
- Po rešitvi: »Bravo, uganil si v N poskusih« + ⭐ iz bonusa + **odštevalnik do naslednjega lika** (polnoč po
  Ljubljani, `hub.dailySeed`). Če polnoč mine med igranjem, igra pokaže »Nov dan, nov junak« in se osveži.
- **Statistika** po bazenu (modal): odigrano, % rešenih, trenutni in najdaljši niz, **histogram poskusov**
  (1, 2, 3 … 10+) s poudarjenim današnjim, povprečje.
- **Deli rezultat** (`navigator.share`, sicer kopiraj v odložišče + `ui.toast`), **brez imena lika**:
  ```
  Herodle #142 · Klasika (Mešano) · 3 poskusi 💀
  🟥🟥🟥🟥🟨🟥⬇️
  🟩🟩🟥🟨🟩🟩⬇️
  🟩🟩🟩🟩🟩🟩🟩
  ⭐⭐⭐ bonus
  ```
  Številka uganke `#N` = dni od `EPOCH` (konstanta v `logic.js` = datum, ko je ta faza narejena; ta dan je #1). Pri več
  kot 8 poskusih deljenje pokaže prve 3 in zadnje 4 vrstice z »…« vmes. Pri predaji: »Herodle #142 · Klasika · X/∞«.
- **Prijatelji danes**: pod statistiko `ui.leaderboard` za Klasiko z zavihki *Danes* / *Ta teden* in mini prikaz,
  koliko poskusov so rabili ostali (brez razkritja lika).

### Podatki o likih (`heroes.js`)
- ES modul, izvozi seznam. **Vsaj 150 likov**, približno pol Marvel, pol DC, mešano junaki in zlobci, znani in malo
  manj znani (ne samo prvih 20 iz filmov). Vsaj 40 likov z `inMcu: true`.
- Polja v tej fazi: `id, name, aliases[], alterEgo, universe, teams[] (prva = glavna; [] pomeni »Brez«), species,
  origins[], gender, firstComic, alignment, inMcu, actors[], firstFilm, home, nemesis, color (prevladujoča barva
  kostuma, hex), unsure[]`. 2. faza doda `emoji`, `palette`, `dossier`, `facts`, `symbol` v **ločeno datoteko**, ne sem.
- Dovoljene vrednosti atributov so konstante v `logic.js` (seznami iz tabele zgoraj); vrednosti v slovenščini, imena
  likov v izvirniku (»Spider-Man«), aliasi tudi po slovensko, če obstajajo.
- `nemesis` je `id` drugega lika v seznamu, kjer je le mogoče (test preveri, da obstaja), sicer ime.
- **Natančnost je pomembna**. Like delaj v serijah po ~25 in vsako serijo sproti preveri (letnica prvega stripa,
  ekipe, igralec, prvi film). Kjer nisi prepričan, polje dodaj v `unsure: ['firstComic', ...]` in v `PROGRESS.md`
  naredi seznam za ročno preverjanje. Raje izpusti bonus vprašanje kot da je napačno. Dva lika z enakimi vsemi
  sedmimi atributi nista dovoljena (test), ker ju v Klasiki ne bi bilo mogoče ločiti.

### Lik dneva in zaščita (online / offline)
Lestvice so »na časten način«, a dnevni lik **ne sme biti izračunljiv iz javne kode** in ne sme biti viden v
DevTools (omrežje, stanje strani), dokler ga igralec ne reši ali se ne preda.

- **Online (Supabase)** — `supabase/games/herodle.sql` (idempotentno, RLS vklopljen, predpona `herodle_`):
  - `herodle_heroes (id, universe, teams, species, origins, gender, first_comic, alignment, in_mcu)` — atributi za
    primerjavo. Vsebino generira skripta `tools/herodle-sql.mjs` iz `heroes.js` v `supabase/games/herodle-heroes.sql`
    (upsert; ob dodajanju likov se požene znova).
  - `private.herodle_secret (salt)` — **naključna sol, ustvarjena v bazi** ob prvi migraciji (`gen_random_bytes`,
    `insert … where not exists`). Sol ni nikoli v repoju in je ne vrne noben RPC.
  - `herodle_daily (date, mode, hero_id)` — razpored, za `anon`/`authenticated` **ni berljiv**. Polni ga
    `private.herodle_fill(days)`, ki vstavi samo manjkajoče dni (`on conflict do nothing`), zato se pretekli dnevi
    nikoli ne spremenijo, tudi ko dodaš like. Za vsak dan izbere lik iz bazena načina po vrstnem redu
    `md5(salt || mode || date || id)`, izmed likov, ki se v tem načinu niso pojavili v zadnjih
    `min(velikost bazena − 1, 120)` dneh. Migracija napolni 400 dni naprej; RPC-ji ob manjkajočem dnevu pokličejo
    `herodle_fill` sami.
  - `herodle_giveups (user_id, date, mode)` — RLS: vsak bere in piše samo svoje.
  - RPC-ji (`security definer` v shemi `private`, ovojnica `security invoker` v `public`; `date` ne sme biti v
    prihodnosti po ljubljanskem času):
    - `herodle_check(mode, date, hero_id)` → vrne samo rezultat primerjave za ta poskus (barve, puščica) ali
      `solved: true`;
    - `herodle_reveal(mode, date, give_up boolean default false)` → id lika **za pretekle dni**; za danes samo z
      `give_up := true`, kar zapiše vrstico v `herodle_giveups`.
  - Primerjava atributov je zato napisana **dvakrat** (SQL in `logic.js`). Da se ne razideta: skripta z `logic.js`
    generira fiksturo `tests/fixtures/herodle-compare.json` (~200 parov likov z rezultati). Test v Node jo preveri proti
    `logic.js`, pri preverjanju s Supabaseom pa isto fiksturo preveriš proti razvojnemu RPC-ju `herodle_compare(a, b)`
    (primerja dva poljubna lika z isto SQL funkcijo kot `herodle_check` in ne razkrije lika dneva).
- **Offline** (`?offline=1` ali brez Supabasea): lik dneva lokalno iz `hub.rng(hub.dailySeed() + ':herodle:' + način)`
  z razporedom brez ponovitev (premešaj bazen enkrat na cikel, jemlji po vrsti). **Offline razpored je namenoma
  drugačen od online** (online ima skrivno sol). Offline adapter upošteva razvojni parameter `?date=YYYY-MM-DD` za
  testiranje nizov in predaje; Supabase adapter ga ignorira.
- Lastnih tabel za rezultate ne delaj: lestvica gre prek `hub.submitScore` (`seed` = `datum:način`, npr.
  `2026-11-22:klasika`), niz in statistika lokalno prek `shared/storage.js` + `hub.reportGame({ daily: true })`.

### Postavitev zaslona
- **Telefon (portret, 375 px)**: zgoraj zavihki načinov in ikone (statistika, nastavitve, pomoč), pod njimi
  iskalno polje **pritrjeno nad tipkovnico** (`visualViewport`), spodaj vrstice poskusov. Avtocomplete ne sme
  prekriti vnosa. `touch-action: manipulation`.
- **Namizje**: osrednji stolpec do ~760 px, ob strani »Prijatelji danes« in legenda barv.
- **Pomoč** (modal ob prvem obisku): kratka razlaga z enim animiranim primerom vrstice.

### Dosežki (ta faza)
- `prvi-junak`: Prvi junak — reši prvo uganko Herodla
- `jasnovidec`: Jasnovidec — reši Klasiko v prvem poskusu
- `trojka`: Hat-trick — reši Klasiko v največ 3 poskusih
- `vse-zvezdice`: Fanboy — dobi vse 3 ⭐ v bonusu
- `teden`: Teden junaštva — reši Klasiko (kateri koli bazen) 7 dni zapored
- `mesec`: Mesečni ritual — reši Klasiko (kateri koli bazen) 30 dni zapored
- `lobanja`: Brez milosti — reši Klasiko v težkem načinu v največ 5 poskusih
- `oba-svetova`: Multiverzum — isti dan reši Klasiko v bazenu *Samo MCU* in *Samo DC*

(2. faza doda `popolni-dan`, `emoji-mojster`, `modni-kritik`, `detektiv`; 3. faza `dvoboj`.)

### XP
15 za rešen bazen Klasike (+10, če v največ 3 poskusih), +5 za vsako ⭐. Predaja 0.

### Naloge (`quests` v `games.json`)
Preden jih napišeš, preberi `shared/quests.js` in preveri, kako se seštevajo `target`/`goal` in `cmp` ter
kakšen je regex za id. Predlog:
- `e` »Reši dnevnega Herodla« → `daily:herodle`, target 1
- `e` »V Herodlu dobi bonus zvezdico« → `herodle:star`, target 1
- `m` »Reši Klasiko Herodla v največ 4 poskusih« → `herodle:classic`, cmp `lte`, goal 4
- `h` »Zberi 3 ⭐ v enem bonusu« → `herodle:stars`, cmp `gte`, goal 3
- `w` »Reši Herodla 5 dni ta teden« → `herodle:solved-day`, target 5
- `w` »Zberi 12 bonus zvezdic ta teden« → `herodle:star`, target 12

### Prioritete, če zmanjkuje časa
Najprej mora biti brezhibno: podatki (vsaj 150 likov) + `logic.js` s testi → Klasika z avtocomplete, animacijami,
statistiko in deljenjem → offline adapter → Supabase (tabele, sol, razpored, RPC-ji, fikstura) → bonus krogi →
težki način → prijatelji danes. Animacije in občutek se delajo sproti, niso »na koncu«. Kar ne gre, zapiši v
`PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom).
4. `../herodle.md` — izvirna ideja igre.

### Tehnično
- Igra v `games/herodle/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'herodle', scoreOrder: 'asc' })`;
  `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players: 1, score, daily: true })`** (kovanci, niz dni,
  dnevne naloge), enkrat na rešen ali predan bazen. Posebne dosežke za naloge sporoči s
  `hub.reportEvent('herodle:<ime>', vrednost)`; igra v `games.json` doda svoje predloge nalog (`quests`).
- Tabele: `supabase/games/herodle.sql` + generirani `supabase/games/herodle-heroes.sql` (glej zgoraj).
  Če imaš Supabase MCP orodja, ju poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši
  v `PROGRESS.md`, kaj mora uporabnik pognati in v katerem vrstnem redu.
- Čisto logiko (primerjava atributov in barve, ±10 let in puščice, delna ujemanja ekip/izvorov, težki način,
  offline razpored brez ponovitev, izbira in točkovanje bonusa, sestava deljenja, iskanje brez šumnikov, številka #N)
  daj v `logic.js` in dodaj teste v `tests/tests.js`: isti lik za isti seed in način, različni bazeni različni liki,
  ni ponovitve v ciklu, *Samo MCU* vsebuje samo `inMcu`, vsi liki imajo vsa obvezna polja in veljavne vrednosti,
  brez podvojenih id-jev/imen/aliasov, ni dveh likov z enakimi vsemi atributi, `nemesis` id obstaja, pravilne barve za
  robne primere letnice (točno, ±10, ±11) in ekip/izvorov, težki način zavrne neskladen poskus, deljenje ne vsebuje
  imena ali aliasa lika, fikstura primerjave se ujema z `logic.js`.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Offline (`?offline=1`): reši vse tri bazene, s `?date=` simuliraj nekaj zaporednih dni (niz, predaja, ki prekine
   niz, statistika s histogramom), preveri, da se bonus po osvežitvi ne ponovi, in deljenje.
5. S Supabaseom: reši Klasiko in v zavihku Network preveri, da odgovori RPC-jev pred rešitvijo ne vsebujejo id-ja lika;
   da `herodle_daily` in `private.herodle_secret` nista berljiva z anon ključem; da `herodle_reveal` za danes brez
   `give_up` vrne napako; da se fikstura primerjave ujema s `herodle_compare`. Rezultat zapiši v `PROGRESS.md`.
6. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno
   (posebej tabela atributov na 375 px in avtocomplete nad tipkovnico).
7. V `games.json` dodaj vnos igre s statusom **`live`** (in preveri, da test sheme uspe).
8. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno, seznam podatkov za ročno preverjanje) in napiši
   `games/herodle/README.md` (zgradba, vmesnik načina, `daily.js`, kako dodati like in znova pognati
   `tools/herodle-sql.mjs`).
9. Testne profile in vrstice v produkcijski bazi na koncu **izbriši** (razpored in like pusti).
10. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu,
kateri podatki čakajo na ročno preverjanje in kaj ni bilo preverjeno.
