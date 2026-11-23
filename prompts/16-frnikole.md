# Prompt za AI agenta: Dirka frnikol (1. del: solo »Dirkalni dan« proti botom)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/16-frnikole.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »40. Dirka frnikol«. Hrčkova krogla (`games/krogla/`) in Rušilec (`games/rusilec/`)
> že obstajata. Ta igra **uvaža njune module** (fizika, renderer, trki krogel, zvok), tako kot Rušilec uvaža Kroglo.
> Ne kopiraj kode. Hrčkova krogla in Rušilec morata ostati popolnoma enaka: njuni testi ostanejo zeleni brez
> sprememb pričakovanih vrednosti.
>
> **Obseg tega prompta je namerno ozek** (solo z boti + dnevni izziv). Multiplayer in stave s kovanci huba sta
> naslednja prompta, ki ju na koncu te naloge **napišeš** (glej »Na koncu: napiši naslednje prompte«).

---

## Igra

- **Ime:** Dirka frnikol
- **id / mapa:** `frnikole` → `games/frnikole/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Frnikole drvijo po progi, ti staviš in jih z gumbi sunkov porineš.
  Pet dirk na dan proti botom, kdo bo imel največ točk?«
- **Način:** `single` (v tem delu) · **Število igralcev:** 1 · **Oznake:** `daily`, `stave`, `fizika`, `party` (kasneje)
- **Ikona / barva:** 🔮 (ali 🟣) · `#b388ff`
- **Rezultat:** točke na koncu Dirkalnega dne. **Več je bolje** (`scoreOrder: 'desc'`, `scoreUnit: 'točk'`).
- V meniju Hrčkove krogle in Rušilca dodaj povezavo »🔮 Dirka frnikol«, v igri pa povezavo nazaj.

Igra je naša: imena frnikol, proge, komentarji, grafika in zvok so lastni, ne kopija nobene obstoječe igre ali oddaje.

### Jedro igre: Dirkalni dan
- **5 dirk zapored.** Igralec začne s **1000 točkami** (točke so znotraj igre, **niso kovanci huba**).
- **8 frnikol** na dirko, vsaka ima ime, barvo/vzorec in **formo** (3 lastnosti, ki dejansko vplivajo na fiziko v
  majhnem razponu, npr. masa, trenje/oprijem v zavojih, odboj). Kartica pred dirko: »Bliskavica: hitra v ravnini,
  slaba v zavojih · forma ▲▲▽«. Razlike morajo biti majhne, da je izid še vedno odprt.
- **Kvote** se izračunajo iz forme in ujemanja s progo (npr. 1,8 do 12,0). Izračun kvot naj temelji na hitrem
  **simuliranju brez izrisa** (npr. 30 tihih simulacij z rahlo spremenjenim začetkom), da kvote res odražajo možnosti.
  To je hkrati test, da proge niso »vedno zmaga ista«.
- **Stave pred dirko:** do 3 stave na dirko. Vrste:
  - **zmagovalec** (kvota),
  - **na stopničkah** (top 3, nižja kvota),
  - **dvoboj** (A pred B, ~1,9).
  Najmanjša stava 10, največja ves kupček. Če pade pod 10 točk, dobi igralec enkrat na dan »posojilo« 100 (z opombo
  na koncu).
- **Sunki med dirko:** igralec ima **3 sunke na dirko**. Tap na frnikolo (ali gumb s seznamom frnikol na telefonu)
  ji da kratek impulz v smeri gibanja (pomoč) ali, z drugim gumbom, **bočni sunek** (oviranje, lahko jo vrže s proge
  ali v steno). Ohlajanje 1,5 s. Sunek je viden (val, zvok) in v killfeedu: »Ti si porinil Rdečo zvezdo!«.
- **Padec s proge:** frnikola se po 2 s vrne na zadnjo kontrolno točko proge (izgubi čas, ni izločena).
- **Cilj:** vrstni red ob prečkanju cilja, prikaz stopničk, izplačilo stav, nov kupček.
- Po 5. dirki: končni zaslon (`ui.results`) z lestvico igralec + boti, `hub.submitScore`, `hub.reportGame`.

### Boti (stavniki)
- **3–7 botov** (privzeto 5) z vzdevki in »osebnostjo«, ki določa stave in rabo sunkov:
  - **Previdnež:** stavi na favorite in na stopničke, sunke uporablja za pomoč svoji frnikoli.
  - **Hazarder:** velike stave na visoke kvote.
  - **Zvestoba:** vedno stavi na isto barvo.
  - **Saboter:** sunke uporablja za oviranje frnikole, na katero ima največ stavljeno vodilni igralec (tudi ti).
  - **Statistik:** stavi po kvotah, sunke porabi v zadnji tretjini proge.
- Boti imajo enako število sunkov in enaka pravila kot igralec. Logika botov je deterministična iz seeda (čisti modul).
- Imena botov naj bodo slovenska in zabavna (»Stari Jože«, »Kvotna Klara« …), vsaj 12 imen za izbor.

### Proge (vsaj 3)
- **Dolge proge navzdol** (20–40 s dirke), z zavoji, skoki, razcepi (dve poti z različno dolžino in tveganjem),
  lijaki, vrtljivimi ploščami in ovirami iz Krogle (vzmeti, led, premične ploščice). Ozka mesta, kjer pride do gneče.
- Format prog: uporabi format in loader prog Krogle (`level.js`, ploščice in kvadri), če to gre; če je za dolge proge
  neroden, naredi tanek format v `games/frnikole/tracks/*.json` in pretvornik v svet Krogle.
- **Generator** `tools/frnikole-tracks.mjs` (po vzoru `tools/krogla-levels.mjs`): iz opisa odsekov zgradi JSON in s
  tihimi simulacijami preveri, da (a) vse frnikole pridejo do cilja v razumnem času brez sunkov, (b) noben barvni
  slot ne zmaga v več kot ~35 % simulacij, (c) dirka traja v ciljnem razponu. Rezultat preverjanja zapiši v
  `PROGRESS.md`.
- Predlog tem: **Kamnolom** (široke serpentine), **Kuhinja** (žlice kot skakalnice, lijak), **Alu valjarna**
  (tekoči trakovi, žlebovi iz profilov).
- `?track=N` odpre progo takoj (razvoj), `?fast=1` simulira dirko brez izrisa (preverjanje).

### Fizika
- Frnikola = telo iz `../krogla/physics.js` (`makeBody`, `stepBody`, `advanceWorld`) brez vhoda igralca; trki
  frnikola–frnikola prek `../rusilec/collide.js` (`collideAll`). Če je treba kaj razširiti, naredi to v
  `games/frnikole/` ali kot neobvezno opcijo, ki Krogle in Rušilca ne spremeni.
- **Fiksen korak** (`STEP` iz Krogle) in determinizem: isti seed + isti sunki ob istem koraku = isti izid. To je
  osnova za dnevni izziv in za kasnejši multiplayer (sunki se bodo pošiljali kot vnosi `{ korak, frnikola, vrsta }`).
- Brez naključnosti v simulaciji razen iz seeda (`hub.rng`).

### Dnevni izziv
- `hub.dailySeed` določi 5 dirk (proge iz nabora, postava frnikol in forma, boti in njihove osebnosti).
- Vsi igralci imajo isti dan; izid razlikujejo le stave in sunki. **Šteje prvi poskus dneva** (`daily: true`),
  ponovitve so trening (brez lestvice dneva).
- Poleg dnevnega načina še **Prosta igra** (naključni seed, izbira števila botov) brez dnevne lestvice.

### Kamera, videz in komentator
- Izris s Three.js prek renderja Krogle (`../krogla/render.js`: nebo, teksture, kakovost `QUALITY`/`detectQuality`).
  Frnikole so steklene/barvne krogle (brez hrčka) z jasnimi barvami in imeni nad njimi.
- **Kamera** sledi vodilni skupini, gumb »Moja frnikola« (frnikola z največjo stavo) in »Pregled« (vsa proga).
  Na koncu kratek posnetek cilja v počasnem posnetku (če ostane čas).
- **Slovenski komentator** (tekst na zaslonu, brez glasu): vsaj ~40 variant za prehitevanja, padce, sunke, foto finiš,
  presenečenja (»Outsider s kvoto 9,0 je spredaj!«). Modul `texts.js` po vzoru Rušilca.
- Seznam vrstnega reda v živo ob robu (na telefonu zložljiv), kupček in stave vedno vidni.
- Zvok po vzoru `../rusilec/sound.js`: kotaljenje, trki, sunek, cilj, navijanje.

### Kontrole
- Namizje: klik na frnikolo izbere, `Q`/`E` (ali gumba) pomoč / oviranje, `1–8` izbor frnikole.
- Telefon (375×812): spodaj vrstica 8 barvnih gumbov frnikol + dva velika gumba sunka; brez hover-only interakcij,
  `touch-action: manipulation`.

### Hub, XP, dosežki, naloge
- `hub.init({ gameId: 'frnikole' })`, `ui.header({ title: 'Dirka frnikol' })`.
- Po vsakem Dirkalnem dnevu: `hub.submitScore(točke)`, `hub.reportGame({ won: prvi med vsemi, players: 1 + boti,
  score, daily })`, `hub.awardXp` (npr. 20 za dan, +10 za vsako zadeto stavo na zmagovalca, največ 80).
- **Dosežki (vsaj 5):** `outsider` (zadeta stava s kvoto ≥ 8), `trojna` (3 zadete stave v eni dirki), `saboter`
  (tvoj bočni sunek vrže favorita s proge in zmaga tvoja frnikola), `milijonar` (konec dneva ≥ 5000), `brez-sunka`
  (zmaga dneva brez enega samega sunka), `foto` (zadeta stava v foto finišu).
- **Naloge** v `games.json` (`quests`): npr. e »Odigraj Dirkalni dan« (`play:frnikole`), m »Zadeni stavo s kvoto
  vsaj 5« (`frnikole:kvota`, `cmp gte`, goal 5), h »Končaj dan z vsaj 3000 točkami« (`frnikole:tocke`, gte 3000),
  w »Zadeni 15 stav ta teden« (`frnikole:stava`, target 15). Dogodke sporoči s `hub.reportEvent`.

### Moduli (predlog)
`index.html`, `game.js` (UI in zanka), `race.js` (simulacija dirke, čista), `odds.js` (kvote iz tihih simulacij),
`bets.js` (stave in izplačila, čisto), `bots.js` (osebnosti botov, čisto), `day.js` (dnevni seed → 5 dirk),
`track.js` (loader), `view.js` (izris), `texts.js`, `sound.js`, `tracks/*.json`, `README.md`.

### Testi (`tests/tests.js`)
- Izplačila stav (zmagovalec, stopničke, dvoboj, več stav, posojilo).
- Kvote: vsota implicitnih verjetnosti razumna, favorit ima najnižjo kvoto.
- Determinizem: ista dirka (seed + sunki) dvakrat → enak vrstni red; drug sunek → lahko drugačen.
- Boti: ista osebnost + seed → enake stave; nikoli ne stavijo več, kot imajo.
- Dnevni seed: isti dan → isti nabor 5 dirk.
- Proge: vsaka proga se naloži, vse frnikole brez sunkov pridejo do cilja (krajša tiha simulacija).

### Ni del te naloge (naslednji prompti)
- **Multiplayer v živo** (host na TV-ju, igralci stavijo in sunkajo s telefonov, manjkajoča mesta zapolnijo boti,
  prenos hosta, ponovna povezava).
- **Stave s kovanci huba** (RPC z omejitvami v Supabase, varovanje vložka na strežniku).
- Urejevalnik prog, več prog in tem, predmeti v trgovini (vzorci frnikol, sled).

### Prioritete, če zmanjkuje časa
1. Ena proga + simulacija + stave + izplačila + končni zaslon (igralno jedro).
2. Boti z osebnostmi in sunki.
3. Dnevni izziv, lestvica, `reportGame`, dosežki.
4. Druga in tretja proga z generatorjem in preverjanjem.
5. Komentator, kamera, zvok, polish.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in vključi v naslednji prompt.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom).
4. `games/krogla/README.md`, `games/krogla/physics.js`, `games/krogla/render.js`, `games/krogla/level.js` in
   `games/rusilec/README.md`, `games/rusilec/collide.js`, `games/rusilec/game.js` (kako Rušilec uvaža Kroglo).

### Tehnično
- Igra v `games/frnikole/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'frnikole' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`**. Posebne dogodke za naloge sporoči s
  `hub.reportEvent('frnikole:<ime>', vrednost)`. Igralca prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- Ta del ne potrebuje lastnih tabel v Supabase.
- Čisto logiko (simulacija, kvote, stave, boti, dnevni izbor) daj v ločene module brez DOM-a in dodaj teste v `tests/tests.js`.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v Krogli, v Rušilcu in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi Krogle in Rušilca, nespremenjeni).
4. Odigraj cel Dirkalni dan (5 dirk) v brskalniku, enkrat dnevni in enkrat prosti način; z `?fast=1` preveri vse proge.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
6. V `games.json` dodaj vnos igre s statusom **`live`** in nalogami (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno) in napiši `games/frnikole/README.md`
   (kontrole, pravila stav, boti, format proge, kako dodati progo).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu: napiši naslednje prompte
Ko je ta del narejen in commitan, **napiši nove prompte za nadaljevanje** po vzoru tega in `prompts/TEMPLATE-igra.md`,
z vsemi spoznanji iz te implementacije (dejanska imena modulov in funkcij, format prog, kaj ni bilo narejeno ali je
ostalo odprto):
- **`prompts/17-frnikole-multiplayer.md`** — dirka v živo za do 10 igralcev: host na TV-ju simulira, igralci na
  telefonih stavijo in pošiljajo sunke kot vnose `{ korak, frnikola, vrsta }` prek `room.send`, prazna mesta zapolnijo
  boti iz tega dela, prenos hosta (`hostChanged`), ponovna povezava, TV pogled, preverjanje v 2–3 zavihkih z `?offline=1`.
- **`prompts/18-frnikole-stave.md`** — stave s kovanci huba: RPC v `supabase/games/frnikole.sql` (idempotenten, RLS,
  `security definer` v shemi `private`), dnevna omejitev vložka, izplačilo prek strežnika, preverjanje advisors.
  Po želji še urejevalnik prog in predmeti v trgovini (vzorci frnikol, sled) kot ločen razdelek ali `19-…`.
- Vse, kar iz tega prompta ni bilo narejeno, vključi na začetek `17-…`.
Nove prompte commitaj skupaj z igro (ali v ločenem commitu) in jih omeni v končnem odgovoru.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kateri novi prompti so napisani
in kaj ni bilo preverjeno.
