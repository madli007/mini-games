# Prompt: Herodle (dnevno ugibanje superjunakov)

> V novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši:
> **»Preberi prompts/09-herodle.md in ga v celoti izvedi.«**
>
> Ozadje: `../herodle.md` (izvirna ideja: atributi, barve, primer podatkov, Supabase, avtorske pravice).
> Kjer se ta prompt in `herodle.md` razlikujeta, velja ta prompt.

---

## Igra

- **Ime:** Herodle
- **id / mapa:** `herodle` → `games/herodle/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Uganči skritega superjunaka dneva po namigih, emojijih in barvah kostuma. Bonus vprašanja, niz dni in dvoboj s prijatelji.«
- **Način:** `single` (dnevni načini) + `realtime` (dvoboj); v `games.json` `mode: "single"`, če shema ne dovoli dveh
- **Število igralcev:** 1–10 (dnevni izzivi solo; dvoboj 2–10)
- **Oznake:** `daily`, `kviz`, `ugibanje`, `party`
- **Ikona / barva:** 🦸 · `#ff3b5c`
- **Rezultat:** število poskusov v **Klasiki dneva** (načina *Mešano*). **Manj je bolje** (`scoreOrder: 'asc'`,
  `scoreUnit: 'poskusov'`). Ostali dnevni načini imajo svoj niz in statistiko, na skupno lestvico pa gredo le kot
  zavihki (`seed` = `datum:način`). Bonus vprašanja prinesejo **zvezdice ⭐** (XP, dosežki, naloge), ne vplivajo
  na lestvico poskusov.

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
- **Iskalno polje**: velik vnos z avtocomplete (išče po imenu in alter egu, ignorira šumnike in velike črke,
  npr. »spajdrmen« ne, »spider« in »parker« da). Že ugibani liki so v seznamu prečrtani in jih ni mogoče izbrati.
  Puščice + Enter na namizju, tap na telefonu.
- **Zvok**: kratki sintetizirani efekti prek WebAudio (brez datotek): »tik« pri flipu, »whoosh« ob napačnem,
  fanfara ob zmagi, »ding« za bonus zvezdico. Gumb za utišanje prek `shared/storage.js`.
- **Komentator**: kratki slovenski napisi ob poskusih, npr. »Vsaj univerzum je pravi.«, »Toplo, toplo …«,
  »Prvi poskus?! Si ti jasnoviden?«, »Ta je pa iz druge galaksije.« Vsaj ~20 variant.
- Vse animacije spoštujejo `prefers-reduced-motion` (takrat brez flipa in konfetov, samo barve).

### Načini (dnevni, vsak svoj lik dneva, svoj niz in statistika)
Na vrhu zaslona **zavihki načinov** z ikono in kljukico, če je danes že rešen (kot pri igrah s »klasiko,
citatom, emojijem«). Ko rešiš enega, gumb »Naslednji način →«.

1. **Klasika** 🧩: ugibanje po atributih (tabela spodaj), neomejeno poskusov. Pod-izbira bazena likov:
   *Mešano* (privzeto, gre na glavno lestvico), *Samo MCU* (liki, ki so se pojavili v filmskem vesolju) in
   *Samo DC*. Vsak bazen ima svoj lik dneva.
2. **Emoji** 😶‍🌫️: lik je opisan s **5 emojiji** (npr. 🕷️🕸️🏙️📸👵). Na začetku je viden 1, vsak napačen poskus
   razkrije naslednjega. Rezultat = poskusi.
3. **Kostum** 🎨: pokaže se **barvna paleta kostuma** kot 3–5 abstraktnih trakov ali krog (naše barve, ne slika).
   Po 3 napačnih se pokaže namig »prevladujoča barva«, po 5 še simbol na prsih opisan z besedo (npr. »netopir«).
4. **Dosje** 🗂️: tajni dosje z **6 namigi**, od zelo splošnega do zelo konkretnega (npr. »Prvič se pojavi v
   60. letih.« → »Ne leti.« → »Ima teto.« …). Vsak napačen poskus odpre naslednji namig (kot pri igrah, kjer
   vsak poskus odpre še eno plast pesmi). Po 6 napačnih igra razkrije lik. Namigi so **naši lastni opisi**, ne
   citati.
5. **Arhiv** 📅 (ne nov način, ampak dostop): igranje preteklih dni (zadnjih 30) za vse načine. Arhiv **ne šteje**
   za lestvico in niz, šteje pa za XP (manj) in naloge.

Neobvezen **Težki način** (stikalo v nastavitvah, velja za Klasiko): vsak naslednji poskus mora biti skladen z vsemi
zelenimi namigi doslej (sicer opozorilo, ne gre čez). Rešitve v težkem načinu imajo v deljenju oznako 💀.

### Atributi v Klasiki
| Atribut | Primeri | Namig |
|---|---|---|
| Univerzum | Marvel, DC | zeleno / rdeče |
| Ekipa | Avengers, Justice League, X-Men, Teen Titans, Guardians, Suicide Squad, Fantastic Four, Brez | zeleno / **rumeno, če je lik bil kdaj v tej ekipi** / rdeče |
| Vrsta | Človek, Bog, Polbog, Vesoljec, Atlantid, Eternal, Android, Mutant, Simbiot | zeleno / rdeče |
| Izvor moči | Tehnologija, Božanski, Nesreča, Magija, Rojen, Zelišče, Trening, Serum, Brez | zeleno / rumeno, če ima lik več izvorov in se eden ujema / rdeče |
| Spol | M, Ž, Drugo | zeleno / rdeče |
| Prvi strip (leto) | 1938, 1962 … | zeleno = točno, rumeno = ±10 let, rdeče; puščica ↑ / ↓ |
| Stran | Junak, Zlobec, Antijunak | zeleno / rdeče |

Univerzum je prvi stolpec. Najnovejši poskus je na vrhu. Na telefonu se tabela ne sme vodoravno drsati po celem
zaslonu: stolpci so ozki z ikonami/kraticami v glavi (s `title` / tap legendo), vrstica se lahko po potrebi
prelomi v 2 vrsti. Vsaka vrstica ima na levi »žeton« lika (krog z inicialkami in barvo iz palete kostuma,
**ne slika**).

### Bonus krogi po zmagi (kot dodatna vprašanja po ugibanju države)
Ko rešiš Klasiko (kateri koli bazen), se odpre **bonus serija 3 vprašanj** o istem liku, vsako z enim poskusom
in izbiro med 4 možnostmi (napačne možnosti iz istega univerzuma, da ni preveč lahko). Vsak pravilen odgovor = ⭐.
Iz nabora izberi 3 glede na seed (kar lik ima podatke):
- **Igralec**: »Kdo ga je igral v filmu?« (samo za like z znanim filmskim igralcem; pri več igralcih vsak pravilen)
- **Alter ego**: »Kako mu je civilno ime?«
- **Domovanje**: »Kje živi / deluje?« (New York, Gotham, Wakanda, Asgard, Metropolis …)
- **Prvi film**: »V katerem letu je prvič nastopil v celovečercu?« (drsnik; ±2 leti = ⭐, točno = ⭐⭐)
- **Nemesis**: »Kdo je njegov glavni nasprotnik?«
- **Uvrščanje**: »Razvrsti te 4 like po letu prvega stripa« (povleci, vse pravilno = ⭐)

Po bonusu **kartica lika** (»Dosje razkrit«): ime, alter ego, univerzum, ekipa, prvi strip, 2–3 zanimiva dejstva
(naša besedila), paleta kostuma. Brez slik.

### Konec dneva, statistika in deljenje
- Po rešitvi: »Bravo, uganil si v N poskusih« + ⭐ iz bonusa + **odštevalnik do naslednjega lika** (polnoč po
  Ljubljani, `hub.dailySeed`).
- **Statistika** po načinu (modal): odigrano, % rešenih, trenutni in najdaljši niz, **histogram poskusov**
  (1, 2, 3 … 10+) s poudarjenim današnjim, povprečje.
- **Deli rezultat** (`navigator.share`, sicer kopiraj v odložišče + `ui.toast`), brez razkritja lika:
  ```
  Herodle #142 · Klasika (Mešano) · 3 poskusi 💀
  🟥🟥🟥🟥🟨🟥⬇️
  🟩🟩🟥🟨🟩🟩⬇️
  🟩🟩🟩🟩🟩🟩🟩
  ⭐⭐⭐ bonus
  ```
  Za Emoji / Kostum / Dosje krajša vrstica (npr. `🗂️ Dosje 4/6 🟥🟥🟥🟩`). Gumb »Deli vse današnje« sestavi en
  blok za vse rešene načine. Številka uganke (#N) = dni od datuma izida igre.
- **Prijatelji danes**: pod statistiko `ui.leaderboard` za Klasiko z zavihki *Danes* / *Ta teden (povprečje)*
  in mini prikaz, koliko poskusov so rabili ostali (brez razkritja lika).

### Dvoboj (multiplayer 2–10, realtime)
Party način za večer s prijatelji: **vsi ugibajo isti naključni lik hkrati** (ne lik dneva).
- Host v lobbyju izbere način (Klasika / Emoji / Dosje), bazen likov, število rund (3 / 5 / 7) in časovno omejitev
  runde (60 / 90 / 120 s / brez).
- Vsak igralec vidi svojo tabelo. Na vrhu je **vrstica igralcev** (`ui.who(p)` / `ui.avatar(p)`) z mini mrežo
  njihovih barvnih vrstic v živo (samo barve, brez imen likov, da se ne da prepisovati).
- Točke na rundo: kdor ugane prej (manj poskusov), dobi več (npr. 1. = 10, 2. = 7, 3. = 5, ostali, ki so uganili,
  = 3, neuspešni = 0; neodločeno po poskusih razreši čas). Kdo je že uganil, dobi napis »✓ uganil v 3«.
- Host izbere lik iz seeda runde in ga pošlje kot **seed**, ne kot id (klienti ga izračunajo sami; repo je
  »na časten način«). Klienti hostu pošiljajo `{ round, guesses, solved, ms }` prek `room.send`.
- **Prenos hosta**: `room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja (runda, seed,
  točke). **Ponovna povezava**: osvežitev → `joinRoom(hub.roomFromUrl())` → sinhronizacija (igralec dobi svoje
  dosedanje poskuse v trenutni rundi nazaj od hosta).
- **TV pogled** (`?tv=1` ali gumb v lobbyju): velika mreža vseh igralcev v živo, odštevalnik runde, razkritje lika
  in lestvica med rundami.
- Konec: `ui.results` + nagrade: *Jasnovidec* (najmanj poskusov skupaj), *Strela* (najhitrejša rešitev),
  *Detektiv* (največ rund rešenih), *Smolar* (največ poskusov v eni rundi). Gumb **»Revanša«**.

### Podatki o likih
- Datoteka `games/herodle/heroes.js` (ES modul, izvozi seznam). **Vsaj 150 likov**, približno pol Marvel, pol DC,
  mešano junaki in zlobci, znani in malo manj znani (ne samo prvih 20 iz filmov).
- Polja: `id, name, aliases[], alterEgo, universe, teams[] (prva = glavna), species, origins[], gender,
  firstComic, alignment, inMcu, actors[], firstFilm, home, nemesis, emoji[5], palette[3–5 hex], dossier[6],
  facts[2–3], symbol`.
- Vrednosti atributov v slovenščini, imena likov v izvirniku (»Spider-Man«), aliasi tudi po slovensko, če obstajajo.
- **Natančnost je pomembna**: kjer nisi prepričan (letnica, igralec, ekipa), polje označi z `unsure: [...]` in
  v `PROGRESS.md` naredi seznam za ročno preverjanje. Raje izpusti bonus vprašanje kot da je napačno.
- Liki brez filmskega igralca ne dobijo vprašanja »Igralec«; liki brez `inMcu` niso v bazenu *Samo MCU*.
- Logika izbire lika dneva: `hub.rng(hub.dailySeed() + ':herodle:' + način)`, z **razporedom brez ponovitev**
  (premešaj ves bazen enkrat na »cikel« in jemlji po vrsti, da isti lik ne pride dvakrat v ~150 dneh).

### Proti goljufanju (online) in offline
- Repo je »na časten način«, a dnevni lik naj vseeno ne bo očiten v DevTools:
  - **Online**: tabela `herodle_daily (date, mode, hero_id)`, za `anon`/`authenticated` **ni berljiva**. RPC-ji
    (`security definer` v shemi `private`, ovojnica `security invoker` v `public`):
    - `herodle_check(mode, date, hero_id)` → vrne samo barve/puščice za ta poskus (ali `solved: true` + id);
    - `herodle_hint(mode, date, level)` → vrne namige do stopnje `level` (Emoji, Kostum, Dosje);
    - `herodle_reveal(mode, date)` → id lika, **samo za pretekle dni** ali če je igralec danes že rešil/obupal.
  - Razpored za vsaj 365 dni naprej generiraj s skripto (`tools/herodle-schedule.mjs`, isti algoritem kot
    offline) in ga vstavi v `supabase/games/herodle.sql`.
  - **Offline** (`?offline=1` ali brez Supabasea): isti algoritem lokalno iz seeda. Igra ne sme vedeti, kateri
    adapter teče — oba vira zavij v en modul (`daily.js`) z enakim vmesnikom.
- Lastnih tabel za rezultate ne delaj: lestvica gre prek `hub.submitScore` (`seed` = `datum:način`), niz in
  statistika lokalno prek `shared/storage.js` + `hub.reportGame({ daily: true })`.

### Postavitev zaslona
- **Telefon (portret, 375 px)**: zgoraj zavihki načinov in ikone (statistika, nastavitve, pomoč), pod njimi
  iskalno polje **pritrjeno nad tipkovnico** (`visualViewport`), spodaj vrstice poskusov. Avtocomplete ne sme
  prekriti vnosa. `touch-action: manipulation`.
- **Namizje**: osrednji stolpec do ~760 px, ob strani »Prijatelji danes« in legenda barv.
- **Pomoč** (modal ob prvem obisku): kratka razlaga z enim animiranim primerom vrstice.

### Dosežki (vsaj 10)
- `prvi-junak`: Prvi junak — reši prvo uganko Herodla
- `jasnovidec`: Jasnovidec — reši Klasiko v prvem poskusu
- `trojka`: Hat-trick — reši Klasiko v največ 3 poskusih
- `vse-zvezdice`: Fanboy — dobi vse 3 ⭐ v bonusu
- `popolni-dan`: Popolni dan — isti dan reši vse 4 načine
- `emoji-mojster`: Emoji mojster — reši Emoji, ko je viden samo 1 emoji
- `modni-kritik`: Modni kritik — reši Kostum brez namigov
- `detektiv`: Detektiv — reši Dosje s prvim namigom
- `teden`: Teden junaštva — reši Klasiko 7 dni zapored
- `mesec`: Mesečni ritual — reši Klasiko 30 dni zapored
- `lobanja`: Brez milosti — reši Klasiko v težkem načinu v največ 5 poskusih
- `dvoboj`: Prvak lige — zmagaj dvoboj z vsaj 4 igralci
- `oba-svetova`: Multiverzum — reši Klasiko v bazenu *Samo MCU* in *Samo DC* isti dan

### XP
15 za rešen dnevni način (+10, če v največ 3 poskusih), +5 za vsako ⭐, +20 za »popolni dan«, arhiv 5 na uganko,
dvoboj 20 za odigrano igro, +40 za zmago.

### Naloge (`quests` v `games.json`)
Preden jih napišeš, preberi `shared/quests.js` in preveri, kako se seštevajo `target`/`goal` in `cmp` ter
kakšen je regex za id. Predlog:
- `e` »Reši dnevnega Herodla« → `daily:herodle`, target 1
- `e` »V Herodlu dobi bonus zvezdico« → `herodle:star`, target 1
- `m` »Reši Klasiko Herodla v največ 4 poskusih« → `herodle:classic`, cmp `lte`, goal 4
- `m` »Reši 2 različna načina Herodla« → `herodle:mode`, target 2
- `h` »Reši vse 4 dnevne načine Herodla« → `herodle:perfect-day`, target 1
- `h` »Zberi 3 ⭐ v enem bonusu« → `herodle:stars`, cmp `gte`, goal 3
- `w` »Reši Herodla 5 dni ta teden« → `herodle:solved-day`, target 5
- `w` »Zberi 12 bonus zvezdic ta teden« → `herodle:star`, target 12

### Prioritete, če zmanjkuje časa
Najprej mora biti brezhibno: podatki (vsaj 150 likov) + logika primerjave atributov in izbire lika dneva
(`logic.js` s testi) → Klasika z avtocomplete, animacijami, statistiko in deljenjem → bonus krogi → Emoji →
Dosje → Kostum → Supabase RPC-ji → arhiv → dvoboj → TV pogled. Animacije in občutek se delajo sproti, niso
»na koncu«. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta).
4. `../herodle.md` — izvirna ideja igre.

### Tehnično
- Igra v `games/herodle/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'herodle', scoreOrder: 'asc' })`;
  `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge) — v solo in v multiplayerju, enkrat na igralca. Posebne dosežke za naloge sporoči s
  `hub.reportEvent('herodle:<ime>', vrednost)`; igra v `games.json` doda svoje predloge nalog (`quests`).
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p z `equipped`, npr. iz `room.players`), da se vidi kozmetika.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja) in **ponovno povezavo**
  (osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo stanja od hosta).
- Potezne/asinhrone igre: `room.setState(state, { expectedVersion })`, `room.pushMove`, `room.getMoves`.
- Igra potrebuje svoje tabele: `supabase/games/herodle.sql` (idempotentno, RLS vklopljen, predpona `herodle_`).
  Če imaš Supabase MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance);
  sicer napiši v `PROGRESS.md`, kaj mora uporabnik pognati.
- Čisto logiko (primerjava atributov in barve, ±10 let in puščice, delna ujemanja ekip/izvorov, težki način,
  razpored lika dneva brez ponovitev, stopnje namigov, točkovanje bonusa in dvoboja, sestava deljenja, iskanje brez
  šumnikov) daj v ločen modul (npr. `logic.js`) in dodaj teste v `tests/tests.js`: isti lik za isti seed in način,
  različni načini različni liki, ni ponovitve v ciklu, vsi liki imajo vsa obvezna polja in veljavne vrednosti,
  brez podvojenih imen/aliasov, pravilne barve za robne primere letnice, deljenje ne vsebuje imena lika.
- Telefon (portret, 375 px) in namizje; party igre: host na TV-ju, ostali na telefonih.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj dvoboj do konca s 3 igralci, odhod hosta sredi igre, osvežitev strani igralca.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno
   (posebej tabela atributov na 375 px in avtocomplete nad tipkovnico).
6. V `games.json` dodaj vnos igre s statusom **`live`** (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno, seznam podatkov za ročno preverjanje).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
