# Prompt za AI agenta: Herodle — 3. faza (dvoboj 2–10 igralcev, TV pogled)

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 14 je narejen)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/15-herodle-dvoboj.md in ga v celoti izvedi.«**
>
> Ozadje: 1. faza (`prompts/09-herodle.md`) in 2. faza (`prompts/14-herodle-nacini.md`) sta narejeni:
> `games/herodle/` ima like in namige (`heroes.js`, `hints.js`), `logic.js` s testi, `daily.js`, dnevne načine
> Klasika (3 bazeni), Emoji, Kostum, Dosje, arhiv, bonus kroge, statistiko in deljenje. Ta faza doda **party del**:
> dvoboj za večer s prijatelji.
>
> **Dnevni načini se ne spremenijo**: razpored, lestvice, nizi in vsi testi 1. in 2. faze ostanejo veljavni. Dvoboj
> uporablja obstoječe module načinov in komponente (tabela poskusov, avtocomplete, namigi), ne kopij.

---

## Kaj se spremeni pri vnosu igre
- **Način:** `realtime` · **Število igralcev:** 1–10 · **Oznake:** dodaj `party`.
- Kratek opis: »Ugani skritega superjunaka dneva po namigih, emojijih in barvah kostuma. Bonus vprašanja, niz dni in
  dvoboj s prijatelji.« (do 160 znakov)
- Igra ostane ena kartica; v glavi igre gumb **»Dvoboj 👥«** poleg zavihkov dnevnih načinov.

---

## 1. Lobby in nastavitve

- Host ustvari sobo (`hub.createRoom`, `ui.lobby`), ostali se pridružijo s kodo ali `?room=`.
- Host izbere: način (**Klasika** / **Emoji** / **Dosje**), bazen likov (*Mešano* / *Samo MCU* / *Samo DC*), število rund
  (3 / 5 / 7) in časovno omejitev runde (60 / 90 / 120 s / brez). Nastavitve vidijo vsi v lobbyju v živo.
- Vsi ugibajo **isti naključni lik** (ne lik dneva). Lik runde: host pošlje **seed runde**, ne id; klienti lik
  izračunajo sami z `logic.js` (`pickDuelHero(pool, seed, used)`), brez ponovitve lika v isti igri. To je »na časten
  način« (kdor bere kodo, lahko lik izračuna) in za igro s prijatelji sprejemljivo; zapiši v `games/herodle/README.md`.
- Dvoboj nima vpliva na dnevne uganke, nize in lestvico poskusov.

## 2. Runda

- Odštevanje 3-2-1 (`ui.countdown`), nato vsi hkrati ugibajo na svojem zaslonu. Poskusi se primerjajo **lokalno**
  (`logic.js`, za Emoji/Dosje namigi iz `hints.js`), brez Supabase RPC-jev.
- Na vrhu je **vrstica igralcev** (`ui.who(p)` / `ui.avatar(p)`) z mini mrežo njihovih barvnih vrstic v živo (samo
  barve oz. število odprtih namigov, brez imen likov, da se ne da prepisovati). Kdor je uganil, dobi napis »✓ uganil v 3«.
- Klienti hostu pošiljajo `{ round, results, solved, guesses, ms }` prek `room.send`; `results` so samo barve, nikoli
  id-ji ugibanih likov. Host zbira stanje in ga redno pošilja vsem (vir resnice je host).
- Runda se konča, ko so vsi uganili/obupali (gumb »Obupam«), ali ko poteče čas. Nato **razkritje lika** (kartica
  lika z animacijo »POW!«) in vmesna lestvica (~8 s, host lahko preskoči).
- **Točke na rundo**: najmanj poskusov je najboljše: 1. = 10, 2. = 7, 3. = 5, ostali, ki so uganili, = 3, neuspešni
  = 0. Pri enakem številu poskusov odloči čas (`ms`); popolnoma enaki dobijo enake točke. Pri Dosjeju (največ 6
  poskusov) enako.

## 3. Odpornost

- **Prenos hosta**: `room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja (runda, seed, točke,
  rezultati, preostali čas). Stanje host pošilja vsem po vsakem dogodku in vsaj vsake 2 s.
- **Ponovna povezava**: osvežitev → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo; igralec dobi nazaj svoje
  dosedanje poskuse v trenutni rundi (host hrani id-je poskusov vsakega igralca samo za ta namen, drugim jih ne pošilja).
- **Pridružitev med igro**: novi igralec začne v naslednji rundi z 0 točkami (lahko gleda trenutno rundo kot gledalec).
- Igralec, ki zapusti sobo, ostane na lestvici z dosedanjimi točkami, označen kot »odšel«.

## 4. TV pogled

`?tv=1` ali gumb v lobbyju: velika mreža vseh igralcev v živo (barvne vrstice, brez imen likov), velik odštevalnik
runde, razkritje lika s kartico in lestvica med rundami. Brez kontrol za ugibanje; host na TV-ju lahko z velikimi gumbi
začne naslednjo rundo. Mora biti čitljiv z razdalje (1920×1080, velike pisave, močni kontrasti).

## 5. Konec, nagrade, dosežki, XP, naloge

- Konec: `ui.results` + nagrade: *Jasnovidec* (najmanj poskusov skupaj), *Strela* (najhitrejša rešitev v igri),
  *Detektiv* (največ rešenih rund), *Smolar* (največ poskusov v eni rundi). Gumb **»Revanša«** (iste nastavitve, novi
  liki, isti igralci).
- **Po koncu igre vsak igralec enkrat pokliče `hub.reportGame({ won, players, score, daily: false })`** (`score` =
  točke, `won` = 1. mesto).
- Dosežek `dvoboj`: Prvak lige — zmagaj dvoboj z vsaj 4 igralci.
- XP: 20 za odigran dvoboj, +40 za zmago.
- Naloge (najprej preveri `shared/quests.js`):
  - `m` »Odigraj dvoboj v Herodlu« → `herodle:duel`, target 1
  - `w` »Zmagaj 2 dvoboja v Herodlu« → `herodle:duel-win`, target 2

### Prioritete, če zmanjkuje časa
Lobby in nastavitve → runda Klasika z vrstico igralcev in točkovanjem → prenos hosta in ponovna povezava → razkritje
in vmesna lestvica → Emoji in Dosje v dvoboju → TV pogled → nagrade in revanša. Kar ne gre, zapiši v `PROGRESS.md`
pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri, posebej sobe in prenos hosta.
3. `games/herodle/README.md` in kodo 1. in 2. faze.
4. `games/reakcija/` (multiplayer s prenosom hosta) in igre s TV pogledom (`games/minigolf/`, `games/rusilec/`).

### Tehnično
- Vse v `games/herodle/` (npr. `duel/`), **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- Multiplayer: host vodi igro in preverja pravila (točkovanje, konec runde, čas); stanje pošilja z `room.send`
  (ne v bazo za vsak dogodek). Podpri **prenos hosta** in **ponovno povezavo** (glej Odpornost).
- Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p z `equipped`, iz `room.players`), da se vidi kozmetika.
- Brez novih tabel v Supabaseu.
- Čisto logiko dvoboja (izbira lika runde iz seeda brez ponovitev, točkovanje z neodločenimi, konec runde, nagrade,
  sestava stanja za odjemalce brez id-jev likov) daj v `logic.js` ali `duel/logic.js` in dodaj teste v `tests/tests.js`:
  isti seed = isti lik pri vseh, ni ponovitve v igri, točkovanje robnih primerov (vsi enako, nihče ni uganil, en igralec),
  stanje, ki ga host pošlje, ne vsebuje id-ja lika pred koncem runde in ne id-jev poskusov drugih igralcev.
  **Vsi testi 1. in 2. faze ostanejo zeleni.**
- Razvojni parameter `?tv=1`; časovne omejitve naj se dajo skrajšati z `?fast=1` za testiranje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Multiplayer v **offline načinu** (`?offline=1`) v 3 zavihkih + TV zavihek: ustvari sobo, pridruži se s kodo in prek
   `?room=`, odigraj dvoboj do konca s 3 igralci (Klasika, nato revanša z Emoji ali Dosjejem), odhod hosta sredi runde,
   osvežitev igralca sredi runde (poskusi ostanejo), pridružitev med igro, potek časa runde.
5. S Supabaseom (`?igralec=1/2/3`): en cel dvoboj; zapiši v `PROGRESS.md`, ali se mreže drugih igralcev posodabljajo
   tekoče.
6. Izgled na **telefonu (375×812)**, **namizju** in **TV pogledu (1920×1080)**: posnemi zaslone, sam jih preglej in
   popravi, kar je neurejeno.
7. Dnevni načini delujejo kot prej (hiter preizkus Klasike in Emojija offline).
8. Posodobi `games.json` (način, igralci, oznake, opis, dosežek, naloge; test sheme uspe), `PROGRESS.md` in
   `games/herodle/README.md` (dvoboj, protokol sporočil).
9. Testne profile in sobe v produkcijski bazi na koncu **izbriši**.
10. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako organizirati dvoboj s prijatelji (tudi na TV-ju) in kaj ni
bilo preverjeno.
