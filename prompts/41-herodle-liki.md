# Prompt za AI agenta: Herodle — novi MCU liki, debi v MCU, medij, težavnost tedna

> **Stanje:** ⬜ čaka — lahko takoj (predpogoja 09 in 14 sta narejena). Ne poganjaj hkrati s 15 (oba spreminjata
> `heroes.js`/`hints.js`).

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/41-herodle-liki.md in ga v celoti izvedi.«**
>
> Ozadje: Herodle ima 180 likov (107 Marvel, 73 DC, 83 z `inMcu`), Klasiko s tremi bazeni, Emoji, Kostum, Dosje,
> arhiv in bonus kroge (`prompts/09-herodle.md`, `prompts/14-herodle-nacini.md`). Ta prompt **razširi podatke**:
> doda ~75 manjkajočih likov iz MCU (filmi, Disney+, Netflix), popravi nedosledno oznako `inMcu`, doda polja
> `mcuDebut`, `medium` in `fame` ter dnevno **težavnost tedna**. Nadaljevanja: `42-herodle-zbirka` (Herodex, vadba,
> statistika, kozmetika) in `43-herodle-skupine` (nov način) uporabljata ta polja.
>
> **Pretekli dnevi in današnji dan se ne smejo spremeniti** (online in offline, vsi bazeni in načini). Vsi obstoječi
> testi ostanejo zeleni (fikstura primerjave se smiselno razširi, ne zamenja).

---

## Kaj se spremeni pri vnosu igre
- Kratek opis omeni »250+ junakov in zlobcev« (do 160 znakov).
- Novi dosežki in naloge (spodaj).

---

## 1. Pravilo za `inMcu` in pregled obstoječih

**`inMcu: true`** = lik se je kot igrani ali animirani lik (ne le omemba ali easter egg) pojavil v filmu Marvel Studios,
seriji Marvel Studios na Disney+ (tudi *What If…?*, posebne epizode) ali v Netflixovih serijah sage Defenders
(Daredevil, Jessica Jones, Luke Cage, Iron Fist, The Defenders, The Punisher), **izdanih do današnjega dne**.
ABC serije (*Agents of S.H.I.E.L.D.*, *Inhumans*), Sonyjevi filmi brez Marvel Studios (Venom, Morbius, Kraven) in
filmi Foxa (X-Men do 2019) **ne štejejo**, razen če se je isti lik pozneje pojavil v delu Marvel Studios
(npr. Wolverine, Gambit, Elektra in Blade v *Deadpool & Wolverine*).

Pravilo zapiši v glavo `heroes.js` in v `games/herodle/README.md`. Nato **preglej vseh 107 Marvel likov** (preveri na
spletu, ne iz spomina). Znani kandidati za popravek: `luke-cage`, `iron-fist` (Netflix → `true`), `blade`,
`juggernaut` (*Deadpool & Wolverine*), `mephisto` (*Ironheart*), `doctor-doom` (preveri, ali je *Avengers:
Doomsday* že izšel oz. ali šteje pojav v *The Fantastic Four: First Steps*), `venom` (pojav v MCU v *No Way Home*?).
Pri vsaki spremembi popravi tudi `actors`, `firstFilm` in namige v `hints.js` (npr. dosje, ki pravi »ni v MCU«).
Seznam vseh sprememb s kratko utemeljitvijo in virom zapiši v `PROGRESS.md`.

## 2. Novi liki (~75)

Samo **znani liki z vidno vlogo** v MCU, ki imajo izvor v stripih (ne stranski liki brez moči in imena v stripih,
ne liki, ki so le v ozadju). Predlog (preveri vsakega; kar je že v `heroes.js` pod drugim id-jem, je premalo znano ali
nima dovolj zanesljivih podatkov, izpusti in razlog zapiši v `PROGRESS.md`):

- **Filmi:** Pepper Potts (Rescue), Valkyrie, Heimdall, Sif, Gorr, Malekith, Grandmaster, Collector, Ego, Ayesha,
  Cosmo, Hank Pym, Cassie Lang, Yellowjacket, Ghost, Taskmaster, M'Baku, Nakia, Klaue, Ironheart, Xialing, Red Hulk
  (Thaddeus Ross), Leader, Sentry, Thena, Kingo, Ajak, Druig, Makkari, Phastos, Gilgamesh, Eros (Starfox), Corvus
  Glaive, Proxima Midnight, Cull Obsidian, Whiplash, Yon-Rogg, Talos, Arnim Zola, Crossbones, Kaecilius, Clea,
  America Chavez, Scorpion, Photon (Monica Rambeau), Dar-Benn, **Human Torch**, **Thing**, Cassandra Nova, X-23, Pyro,
  Black Knight, Captain Carter
- **Disney+:** Sylvie, Kate Bishop, Echo, Khonshu, Arthur Harrow, Scarlet Scarab, Titania, Wiccan, Rio Vidal (Death),
  The Hood, Wonder Man, Werewolf by Night, Elsa Bloodstone, Man-Thing, White Tiger, Isaiah Bradley, Gravik
- **Netflix:** Jessica Jones, Kilgrave, Misty Knight, Colleen Wing, Hellcat, Jigsaw, Cottonmouth, Madame Gao,
  Typhoid Mary
- **Izšlo v 2025–2026:** z WebSearch preveri, kaj je Marvel Studios izdal v zadnjem letu (npr. *Spider-Man: Brand New
  Day*, *Wonder Man*, nove sezone *Daredevil: Born Again*, *Ironheart*), in dodaj glavne nove like z izvorom v stripih.
- DC: največ 5 očitno manjkajočih likov iz filmov DCU 2025–2026 (neobvezno).

Pravila podatkov:
- Isti format `H({ … })` in dovoljene vrednosti iz `logic.js`. Skrulli, Kree, Asgardijci brez božanskega statusa →
  `Vesoljec`; Eternals → `Eternal`; Deviants → `Drugo`. **Novih ekip ne dodajaj**, razen če bi brez njih več kot 3 liki
  ostali brez prave ekipe (takrat največ 2 novi, npr. `Young Avengers`; popravi tudi `TEAM_SHORT`, SQL in teste).
- Lik z drugim nosilcem istega imena dobi svoj id in jasno ime (npr. `hank-pym` »Hank Pym«, alias »Ant-Man (Hank)«;
  obstoječi `ghost-rider` ostane Johnny Blaze). Iskanje po aliasu mora ponuditi oba.
- `aliases` vključi slovenska imena, kjer so smiselna; `actors` najprej igralec iz MCU; `firstFilm` = leto prvega
  celovečernega filma (serije niso film → lahko `null`).
- Test »neločljivi liki« (enakih 7 atributov) mora ostati zelen; če se dva lika ne dasta ločiti, popravi
  natančnejšo vrednost (ekipo, izvor, letnico), ne dodaj umetne razlike.
- Kar ni zanesljivo, gre v `unsure`. Delaj v serijah po ~25 in vsako sproti preglej.

## 3. Nova polja (vsi liki)

- `mcuDebut` — leto prvega nastopa v MCU po pravilu iz točke 1 (`null`, če `inMcu: false`).
- `medium` — kje je bil prvi nastop v MCU: `'film'`, `'disney+'` ali `'netflix'` (`null`, če ni v MCU).
  Dovoljene vrednosti v `logic.js` (`MEDIUMS`), validacija in test: `inMcu` ⇔ `mcuDebut` in `medium` nista `null`.
- `fame` — prepoznavnost: `1` = pozna ga skoraj vsak, ki je videl nekaj filmov, `2` = pozna ga oboževalec,
  `3` = za poznavalce. Za **vseh** ~255 likov, približno 35 % / 40 % / 25 %. Razporeditev zapiši v `PROGRESS.md`.

Kje se polja uporabijo:
- **Klasika *Samo MCU*** dobi stolpec **»Debi v MCU«** (leto: zeleno točno, rumeno ±2 leti, puščica kot pri prvem
  stripu). Samo v tem bazenu; *Mešano* in *Samo DC* ostaneta nespremenjena. Popravi `logic.compare` **in**
  `private.herodle_cmp` (SQL) enako, deljenje za MCU dobi 7. kvadratek. Shranjeni poskusi brez tega polja (današnji in
  stari dnevi) se prikažejo s sivo celico »—« in se ne zrušijo.
- **Bonus krogi:** nova vprašanja »V katerem letu je lik prvič nastopil v MCU?« (drsnik) in »Kje je lik prvič nastopil
  v MCU?« (izbira: film / Disney+ / Netflix). Uporabi le like brez `unsure` za ti polji.
- **Kartica lika** (»Dosje razkrit«): vrstica »Debi v MCU: 2021 · Disney+« in oznaka prepoznavnosti.
- **Pomoč / legenda** opiše nov stolpec in pravilo za `inMcu`.

## 4. Namigi za nove like (`hints.js`)

Za vsak nov lik popolni namigi po pravilih 2. faze (5 emojijev, paleta 3–5 s `palette[0] === color`, `symbol`,
6 namigov dosjeja brez imena/aliasa/alter ega, 2–3 dejstva, `unsure`). **Naši lastni opisi, ne citati.** Pri likih iz
serij lahko dosje omeni medij (»Prvič se pokaže na majhnem zaslonu.«).

## 5. Razpored: brez spremembe preteklosti

- **Online:** `herodle_daily` hrani razpored. Po uvozu novih likov izbriši samo vrstice z `date > danes`
  (`private.herodle_today()`), da pridejo novi liki in nova težavnost v prihodnje dni, nato `herodle_fill`. Preteklih in
  današnje vrstice ne spreminjaj. `herodle_heroes` dobi stolpce `fame`, `mcu_debut`, `medium` (generator
  `tools/herodle-sql.mjs`).
- **Offline:** zdaj je razpored odvisen od števila likov v bazenu, zato bi se z novimi liki spremenil tudi današnji in
  pretekli lik. Uvedi **različice seznama** (npr. zamrznjen `ROSTER_V1` = urejeni id-ji vsakega bazena po stari
  vrednosti `inMcu`, veljaven do `ROSTER_V2_FROM` = jutrišnji datum ob izvedbi; od tam naprej novi seznam in težavnost).
  Test: fikstura offline likov za vse načine od `EPOCH` do dneva izvedbe, ustvarjena **pred** spremembo, mora biti po
  spremembi enaka.
- Arhiv (`herodle_reveal`, offline seed) mora za pretekle dni vrniti iste like kot prej.

## 6. Težavnost tedna 🌶️

Dnevni liki od `ROSTER_V2_FROM` naprej upoštevajo dan v tednu (vsi načini in bazeni):
- ponedeljek, torek: `fame 1` · sreda, četrtek: `fame ≤ 2` · petek: `fame 2` · sobota, nedelja: `fame 2–3`.
- To je **mehka** preferenca: če v oknu brez ponovitev ni ustreznega lika, vzemi najbližjo težavnost. Isto pravilo v
  `private.herodle_fill` (SQL) in v offline razporedu (`logic.js`), s testom, da je ≥ 90 % dni v 1 letu po pravilu.
- Prikaz: pri zavihku in v glavi oznaka dneva »🌶️ lahko / 🌶️🌶️ srednje / 🌶️🌶️🌶️ težko« (izračuna se iz dneva v
  tednu, ne iz lika, da ne izda ničesar). Deljenje doda čili: `Herodle #150 🌶️🌶️🌶️ · 4/∞`.
- Statistika (obstoječi dialog) dobi povprečje poskusov po težavnosti.

## 7. Dosežki, XP, naloge

- Dosežki:
  - `vikend-junak`: Vikend junak — reši Klasiko v soboto ali nedeljo v največ 4 poskusih
  - `netflix-veteran`: Ulični junak — reši 5 likov iz Netflixovih serij (kateri koli dnevni način ali arhiv)
  - `mcu-kronist`: Kronist MCU — v Samo MCU uganeš lik, pri katerem je bil »Debi v MCU« zelen že v prvem poskusu
- XP: težak dan (🌶️🌶️🌶️) +5 za rešen dnevni način.
- Naloge (najprej preveri `shared/quests.js`):
  - `m` »Reši Herodla na težak dan« → `herodle:hard-day`, target 1
  - `w` »Reši Klasiko Samo MCU 3 dni ta teden« → `herodle:mcu-day`, target 3

### Prioritete, če zmanjkuje časa
Pravilo `inMcu` in pregled → zaščita razporeda (fikstura, različice) → novi liki s polji in namigi + testi →
`mcuDebut`/`medium`/`fame` za vse → SQL in uvoz → stolpec »Debi v MCU« → težavnost tedna → bonus vprašanja →
dosežki in naloge. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za ta prompt: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«, seznam podatkov za ročno preverjanje).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `ui`).
3. `games/herodle/README.md` in kodo (`heroes.js`, `hints.js`, `logic.js`, `daily.js`, `bonus.js`, `modes/klasika.js`,
   `supabase/games/herodle.sql`, `tools/herodle-sql.mjs`, teste `tests/herodle*.js`).
4. `prompts/09-herodle.md` in `prompts/14-herodle-nacini.md` (pravila stila, podatkov in zaščite) ter `../herodle.md`.

### Tehnično
- Vse v `games/herodle/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- Podatke preverjaj z **WebSearch** (vloge, leta, igralci); zapiši, kar ni bilo preverjeno. Brez slik, logotipov in
  citatov (»Neuradna fan igra«).
- SQL spremembe v `supabase/games/herodle.sql` (idempotentno, RLS, predpona `herodle_`) in znova generiraj
  `herodle-heroes.sql`, `herodle-hints.sql` in fiksture. Če imaš Supabase MCP orodja, poženi kot migracijo in preveri
  `get_advisors` (security + performance); sicer napiši v `PROGRESS.md`, kaj mora uporabnik pognati in v kakšnem vrstnem
  redu.
- Testi: nova polja za vse like (veljavne vrednosti, `inMcu` ⇔ `mcuDebut`/`medium`), porazdelitev `fame`, popolni namigi
  novih likov, dosje brez imen, ni dvojnikov id/imen/aliasov med liki, »Debi v MCU« v `compare` (in fikstura za SQL),
  offline razpored do dneva izvedbe nespremenjen, težavnost tedna, star shranjen poskus brez novega polja se izriše.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Offline (`?offline=1`): današnji liki vseh načinov so isti kot pred spremembo (posnemi pred in po); `?date=` na
   ponedeljek in nedeljo po `ROSTER_V2_FROM` pokaže pravo težavnost; Samo MCU ima stolpec »Debi v MCU«; iskanje najde
   nove like po imenu in aliasu (»Hank«, »Ant-Man« ponudi oba).
5. S Supabaseom: današnji lik vseh načinov je isti kot pred uvozom (preveri z `herodle_reveal` ali s testnim igralcem
   pred in po); prihodnji dnevi vsebujejo nove like; `herodle_cmp` in `logic.compare` dasta enak rezultat (fikstura).
6. Izgled na **telefonu (375×812)** in **namizju**: Samo MCU s 7 stolpci, kartica lika, oznaka težavnosti. Posnemi
   zaslone, sam jih preglej in popravi, kar je neurejeno.
7. Posodobi `games.json` (opis, dosežki, naloge; test sheme uspe), `PROGRESS.md`, `games/herodle/README.md`
   (polja, pravilo `inMcu`, razpored z različicami, težavnost tedna) in `../herodle.md`, če se opis pravil spremeni.
8. Testne profile in vrstice v produkcijski bazi na koncu **izbriši** (razpored, like in namige pusti).
9. Stanje tega prompta v `prompts/README.md`, na vrhu prompta in v `PREDLOGI-IGER.md`.
10. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: koliko likov je dodanih (Marvel/DC, filmi/Disney+/Netflix), katerim se je
spremenil `inMcu`, kaj moram narediti v Supabaseu, kateri podatki čakajo na ročno preverjanje in kaj ni bilo preverjeno.
