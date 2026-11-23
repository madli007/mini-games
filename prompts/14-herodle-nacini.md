# Prompt za AI agenta: Herodle — 2. faza (Emoji, Kostum, Dosje, arhiv, popolni dan)

> **Stanje:** ✅ narejeno — commit `e3f8d5a` (23. 11. 2026)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/14-herodle-nacini.md in ga v celoti izvedi.«**
>
> Ozadje: 1. faza (`prompts/09-herodle.md`) je narejena: `games/herodle/` ima `heroes.js` (150+ likov), `logic.js`
> s testi, `daily.js` z dvema adapterjema, Klasiko s tremi bazeni, težki način, bonus kroge, statistiko, deljenje in
> Supabase RPC-je s skrivno soljo. Ta faza doda **tri nove dnevne načine** in **arhiv**. Dvoboj je 3. faza
> (`prompts/15-herodle-dvoboj.md`).
>
> **Klasika se ne spremeni**: obstoječi razpored, lestvice, nizi in statistika ostanejo veljavni, vsi testi 1. faze
> ostanejo zeleni. Novi načini se dodajo kot moduli v `modes/` po vmesniku iz `games/herodle/README.md`.

---

## Kaj se spremeni pri vnosu igre
- Kratek opis: »Ugani skritega superjunaka dneva po namigih, emojijih, barvah kostuma in tajnem dosjeju. Bonus
  vprašanja, niz dni in lestvica prijateljev.« (do 160 znakov)
- Način, število igralcev in oznake ostanejo (dvoboj jih spremeni v 3. fazi).
- Nove naloge in dosežki (spodaj).

---

## 1. Novi podatki (`hints.js`)

Ločena datoteka, **ne** razširitev `heroes.js` (Klasika jo ne potrebuje). ES modul, objekt po `id` lika, **za vse
like** iz `heroes.js`:
- `emoji[5]` — lik opisan s 5 emojiji, od splošnega do konkretnega (npr. Spider-Man: 🏙️ 📸 🕸️ 👵 🕷️). Prvi sam ne
  sme biti preveč očiten.
- `palette[3–5]` — barve kostuma (hex), `palette[0]` je prevladujoča in enaka `color` iz `heroes.js` (test).
- `symbol` — simbol na prsih ali značilni znak z eno ali dvema besedama (»netopir«, »strela«, »črka S«), ali `null`.
- `dossier[6]` — tajni dosje, 6 namigov od zelo splošnega do zelo konkretnega (npr. »Prvič se pojavi v 60. letih.« →
  »Ne leti.« → »Ima teto.« …). **Naši lastni opisi**, ne citati. Noben namig ne sme vsebovati imena, aliasa ali
  alter ega lika (test, brez šumnikov in velikih črk).
- `facts[2–3]` — zanimiva dejstva za kartico lika (naša besedila).

Delaj v serijah po ~25 likov in vsako serijo sproti preglej. Dvomljiva dejstva označi z `unsure` in jih dodaj na
seznam za ročno preverjanje v `PROGRESS.md`. Ime prevladujoče barve za namig pri Kostumu izračunaj v `logic.js` iz
`palette[0]` (hex → slovensko ime barve iz ~12 osnovnih: rdeča, modra, zelena, rumena, črna, bela, siva, vijolična,
oranžna, rjava, roza, zlata), ne ročno.

**Kartica lika** (»Dosje razkrit«, vsi načini) zdaj pokaže še paleto kostuma kot trakove in `facts`.

## 2. Načini (vsak svoj lik dneva iz bazena *Mešano*, svoj niz, statistika in zavihek na lestvici)

Zavihki na vrhu dobijo tri nove vnose. Ko rešiš en način, gumb »Naslednji način →« (prvi nerešeni danes).

1. **Emoji** 😶‍🌫️ (`emoji`): na začetku je viden 1 emoji, vsak napačen poskus razkrije naslednjega (z animacijo
   »pop«). Ko je vseh 5 vidnih, ugibaš naprej brez omejitve. Rezultat = poskusi. Gumb »Predam se« kot v Klasiki.
2. **Kostum** 🎨 (`kostum`): barvna paleta kostuma kot 3–5 abstraktnih trakov ali krog (naše barve, ne slika). Po 3
   napačnih se pokaže namig »prevladujoča barva: rdeča«, po 5 še simbol z besedo (če lik nima simbola: univerzum).
   Neomejeno poskusov, »Predam se«.
3. **Dosje** 🗂️ (`dosje`): tajni dosje, viden prvi namig, vsak napačen poskus odpre naslednjega (animacija
   »odtisnjenega« besedila na papirju). Po 6 napačnih igra razkrije lik (= ni rešeno). Rezultat = poskusi (1–6).

Avtocomplete, komentator, zvok, `prefers-reduced-motion` in iskanje so isti kot v Klasiki (uporabi obstoječe
komponente, ne podvajaj). Bonus krogi so samo v Klasiki.

## 3. Zaščita namigov (Supabase)

Namigi za današnji lik se ne smejo dati razkriti hitreje, kot jih odpirajo napačni poskusi.
- `herodle_hints (hero_id, emoji, palette, symbol, dominant, dossier)` — generira `tools/herodle-sql.mjs` iz
  `hints.js` (razširi skripto), za `anon`/`authenticated` **ni berljiva**.
- `herodle_progress (user_id, date, mode, wrong, solved)` — RLS: vsak bere samo svoje, piše **samo RPC**.
- `herodle_check` za `emoji`/`kostum`/`dosje` vrne `solved` ali napačno in **poveča `wrong`**; ob napačnem poskusu
  vrne tudi naslednji namig.
- `herodle_hint(mode, date)` vrne vse namige, ki jih igralec glede na `wrong` sme videti (za osvežitev strani).
- Dnevni razpored za nove načine napolni obstoječi `private.herodle_fill` (dodaj načine, preteklih dni ne spreminjaj).
- Online adapter **ne uvozi** `hints.js` pred rešitvijo (namige dobi iz RPC-ja); `hints.js` se naloži dinamično šele
  za kartico lika, arhiv in offline. Ker je `hints.js` javen, lahko vztrajen goljuf poišče lik po prvem emojiju; to je
  sprejemljivo (lestvice so »na časten način«), zapiši to v `games/herodle/README.md`.
- Offline: isti vmesnik `daily.js`, napredek v `shared/storage.js`, razpored iz seeda kot v 1. fazi.

## 4. Arhiv 📅

Ikona v glavi igre (ne zavihek). Koledar zadnjih 30 dni (od `EPOCH` naprej), za vsak dan in vsak način (Klasika vseh
treh bazenov, Emoji, Kostum, Dosje) oznaka rešeno / predano / neodigrano.
- Arhivska uganka: id lika dobiš s `herodle_reveal(mode, pretekli datum)` (offline iz seeda) in igraš **lokalno** z
  `logic.js` in `hints.js` (za pretekle dni zaščita ni potrebna). Na vrhu jasna oznaka »Arhiv · 14. 11. 2026«.
- Arhiv **ne šteje** za lestvico, niz in dnevno statistiko; šteje za XP (5 na rešeno uganko) in naloge
  (`hub.reportGame({ daily: false })`). Bonus krogi v arhivu dajo ⭐ za naloge, ne za XP.
- Dneva, ki ga je igralec že rešil ali predal kot dnevno uganko, ni mogoče ponovno igrati v arhivu (samo pogled
  rezultata).

## 5. Deljenje, popolni dan, dosežki, XP, naloge

- Deljenje za nove načine je krajše, brez imena lika:
  `Herodle #142 · 😶‍🌫️ Emoji 3/5`, `Herodle #142 · 🎨 Kostum 4 💡` (💡 = uporabljen namig), `Herodle #142 · 🗂️ Dosje 4/6 🟥🟥🟥🟩`.
- **Deli vse današnje**: en blok za vse danes rešene/predane načine (Klasika z mrežo, ostali v eni vrstici).
- **Popolni dan** = isti dan (ne arhiv) rešeni Klasika (kateri koli bazen) + Emoji + Kostum + Dosje. Ob doseženem
  posebna animacija in vrstica »🏆 Popolni dan« v deljenju.
- Dosežki:
  - `popolni-dan`: Popolni dan — isti dan reši Klasiko, Emoji, Kostum in Dosje
  - `emoji-mojster`: Emoji mojster — reši Emoji, ko je viden samo 1 emoji
  - `modni-kritik`: Modni kritik — reši Kostum brez namigov (v največ 3 poskusih)
  - `detektiv`: Detektiv — reši Dosje s prvim namigom
  - `arhivar`: Arhivar — reši 10 arhivskih ugank
- XP: 15 za rešen dnevni način (+10, če v največ 3 poskusih), +20 za popolni dan, arhiv 5 na uganko.
- Naloge (najprej preveri `shared/quests.js`):
  - `m` »Reši 2 različna načina Herodla« → `herodle:mode`, target 2
  - `h` »Reši vse 4 dnevne načine Herodla« → `herodle:perfect-day`, target 1
  - `m` »Reši Dosje Herodla v največ 3 namigih« → `herodle:dossier`, cmp `lte`, goal 3
  - `w` »Reši 3 uganke iz arhiva Herodla« → `herodle:archive`, target 3

### Prioritete, če zmanjkuje časa
`hints.js` (vsi liki, preverjeni) + testi → Emoji → Dosje → Kostum → zaščita namigov v Supabaseu → arhiv → deli vse
današnje in popolni dan. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/herodle/README.md` in kodo 1. faze (`logic.js`, `daily.js`, `modes/klasika.js`, `supabase/games/herodle.sql`,
   `tools/herodle-sql.mjs`).
4. `prompts/09-herodle.md` (pravila stila, podatkov in zaščite, ki veljajo naprej) in `../herodle.md`.

### Tehnično
- Vse v `games/herodle/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- Uporabi obstoječe komponente igre in `shared/` (`hub.awardXp`, `hub.unlock`, `hub.submitScore`, `ui.leaderboard`,
  `hub.dailySeed`, `hub.rng`, `ui.toast`, `ui.modal`); ne podvajaj.
- **Po vsaki odigrani uganki pokliči `hub.reportGame({ won, players: 1, score, daily })`** (`daily: true` za dnevne,
  `false` za arhiv). Dogodke za naloge pošlji s `hub.reportEvent('herodle:<ime>', vrednost)`.
- SQL spremembe dodaj v `supabase/games/herodle.sql` (idempotentno, RLS, predpona `herodle_`) in znova generiraj
  `herodle-heroes.sql`. Če imaš Supabase MCP orodja, poženi kot migracijo in preveri `get_advisors` (security +
  performance); sicer napiši v `PROGRESS.md`, kaj mora uporabnik pognati.
- Testi v `tests/tests.js`: vsak lik ima popolne namige (5 emojijev, 3–5 barv v veljavnem hex, 6 namigov dosjeja,
  2–3 dejstva), `palette[0] === color`, dosje ne vsebuje imena/aliasa/alter ega, hex → ime barve, stopnje namigov po
  številu napačnih, različni načini isti dan različni liki (offline), arhiv ne vpliva na niz, popolni dan, deljenje
  novih načinov ne vsebuje imena lika. **Vsi testi 1. faze ostanejo nespremenjeni in zeleni.**

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Offline (`?offline=1`): reši vse štiri načine in dobi popolni dan; Dosje izgubi po 6 namigih (drug dan prek
   `?date=`); osveži sredi Emoji in Dosje (namigi ostanejo); arhiv: reši 2 pretekla dneva, preveri, da niz ni spremenjen.
5. S Supabaseom: v zavihku Network preveri, da pred rešitvijo ni naložen `hints.js` in da `herodle_hint` po osvežitvi
   ne vrne več namigov, kot je bilo napačnih poskusov; `herodle_hints` in `herodle_progress` tujega igralca nista
   berljiva. Klasika deluje kot prej (isti lik dneva kot pred to fazo). Rezultat zapiši v `PROGRESS.md`.
6. Izgled na **telefonu (375×812)** in **namizju** za vse tri nove načine in arhiv: posnemi zaslone, sam jih preglej in
   popravi, kar je neurejeno.
7. Posodobi `games.json` (opis, dosežki, naloge; test sheme uspe), `PROGRESS.md` (tudi seznam podatkov za ročno
   preverjanje) in `games/herodle/README.md`.
8. Testne profile in vrstice v produkcijski bazi na koncu **izbriši** (razpored, like in namige pusti).
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati nove načine, kaj moram narediti v Supabaseu,
kateri podatki čakajo na ročno preverjanje in kaj ni bilo preverjeno.
