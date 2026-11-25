# Prompt: Ustavi uro

> **Stanje:** ✅ narejeno (25. 11. 2026) — predpogoj: 01 ✅

> V novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši:
> **»Preberi prompts/28-ustavi-uro.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »18. Ustavi uro«. Vnosa v `games.json` še ni (dodaj ga).

---

## Igra

- **Ime:** Ustavi uro
- **id / mapa:** `ustavi-uro` → `games/ustavi-uro/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Ustavi štoparico točno pri 10,00 s, potem pa ura izgine in šteješ v glavi. Dnevni izziv za vse ali dvoboj do 10 igralcev.«
- **Način:** `realtime`
- **Število igralcev:** 1–10 (solo in dnevni izziv; multiplayer 2–10)
- **Oznake:** `občutek`, `daily`, `party`, `rekordi`
- **Ikona / barva:** ⏱️ · `#4dd4ff`
- **Rezultat:** **skupno odstopanje v ms** čez vse kroge runde (vsota absolutnih odstopanj). **Manj je bolje**
  (`scoreOrder: 'asc'`, `scoreUnit: 'ms'`). Na lestvico gre **dnevni izziv**; prosta igra ima osebni rekord,
  multiplayer šteje za XP, kovance, dosežke in naloge.

Igra je preprosta, zato mora biti **občutek** popoln: natančen čas, jasna povratna informacija in napetost
v zadnji sekundi. Ime, videz ure, zvoki in napisi so naši; ne posnemaj nobene obstoječe igre ali aplikacije.

### Občutek in stil (pomembno!)
- **Številčnica**: velika digitalna štoparica na sredini (`10,00` s stotinkami, slovenska decimalna vejica),
  pisava s tabelarnimi številkami (`font-variant-numeric: tabular-nums`), da števke ne skačejo. Okoli nje
  tanek krožni obroč, ki se polni proti cilju (kot kazalec ure). Izhajaj iz `shared/ui.css`, barva igre `#4dd4ff`.
- **Gumb STOP**: ogromen, čez spodnjo polovico zaslona na telefonu; ustavi tudi **preslednica** ali klik/dotik
  kjerkoli na polju. Zaznava na `pointerdown` / `keydown` (ne `click`), čas s `performance.now()`.
- **Izginjanje**: v krogih »na slepo« številčnica po N sekundah **zbledi** (~300 ms) in ostane le utripajoča
  pika ali vprašaj. Obroč prav tako izgine, ostane samo tišina, kar je bistvo igre.
- **Razkritje**: po ustavitvi se številčnica vrne in se **zavrti** do dejanskega časa (npr. `9,87`), pod njo
  odstopanje (`−130 ms` / `+42 ms`) in ocena:
  - ≤ 10 ms: »Popolno!« (zlati blisk, konfeti),
  - ≤ 50 ms: »Odlično«,
  - ≤ 150 ms: »Dobro«,
  - ≤ 400 ms: »Blizu«,
  - več: »Ojej …« (rahel shake).
  Na traku od −1 s do +1 s se pokaže, kam si padel (prezgodaj levo, prepozno desno).
- **Zvok**: WebAudio sinteza (brez datotek): neobvezen tiktak med vidnim delom (izklopljen v krogih na slepo,
  razen pri modifikatorju *Metronom*), klik ob STOP, različni zvoki za oceno. Gumb za utišanje, nastavitev zapomni
  prek `shared/storage.js`.
- **Komentator**: kratki slovenski napisi, npr. »Švicarska ura bi bila ponosna.«, »Prehitel si čas.«,
  »Si zaspal?«, »Notranja ura: kalibrirana.« Vsaj ~15 variant, odvisno od ocene in smeri odstopanja.
- **Prekoračitev**: če ne ustaviš do cilja + 5 s, se krog konča s kaznijo (glej točkovanje).
- Vse animacije spoštujejo `prefers-reduced-motion` (brez shakea, konfetov in vrtenja številk).

### Načini
1. **Prosta igra** (solo): runda **5 krogov**, cilj 10,00 s:
   - krog 1: ura je vidna ves čas,
   - krog 2: ura izgine po 5 s,
   - krog 3: ura izgine po 3 s,
   - krog 4: ura izgine po 1 s,
   - krog 5: ura sploh ni vidna (samo »Start!«).
   Težavnost (Lahko / Srednje / Težko) spremeni cilj (Lahko 10 s, Srednje 10 s z naključnim ciljem v krogih 4–5
   med 7 in 15 s, Težko cilji do 30 s). Osebni rekord po težavnosti; na koncu gumb »Še enkrat«.
2. **Dnevni izziv** (solo): `hub.dailySeed` + `hub.rng` določita **cilje vseh 5 krogov**, čase izginotja in
   **modifikator dneva**, enak za vse. Prvi poskus dneva šteje za lestvico (`hub.submitScore`), ostali so vaja.
   Modifikatorji (pripravi vsaj 6):
   - *Klasika*: brez modifikatorja;
   - *Čudni cilji*: necele tarče, npr. 7,35 s ali 12,80 s;
   - *Metronom*: tiktak se sliši tudi, ko ura izgine, a **ni** točno 1 s (npr. 0,9 s), da te zmede;
   - *Lažna ura*: vidni del ure teče 10 % prehitro ali prepočasi (razkritje pokaže pravi čas);
   - *Odštevanje*: ura teče od cilja navzdol, ustaviti moraš pri 0,00;
   - *Dvojni stop*: ustavi pri 5 s in pri 10 s v istem krogu (odstopanji se seštejeta);
   - *Dolga pot*: en krog s ciljem 30 s.
3. **Dvoboj** (multiplayer 2–10): vsi hkrati na svojih napravah igrajo **isto rundo** (host izbere seed in
   težavnost), skupni start. V vrstici igralcev se vidi, kdo je že ustavil (kljukica, brez časa, dokler
   krog ne konča). Po vsakem krogu **skupno razkritje**: vsi časi na skupnem traku, najbližji dobi krono 👑.
   Zmaga najmanjše skupno odstopanje.
4. **Zadnji stoji** (multiplayer 2–10, party): po vsakem krogu **izpade** igralec z največjim odstopanjem
   (ob izenačenju oba ostaneta), čas izginotja pa je vsak krog krajši. Igra teče, dokler ne ostane en.
   Izpadli gledajo in lahko »stavijo« z emoji odzivi na igralce (samo zabava, brez kovancev).

### Pravila in točkovanje
- **Krog**: odštevanje 3-2-1 (`ui.countdown`), nato »Start!« in ura začne teči. Ustaviš z enim dotikom ali
  preslednico. Dvojni dotik v manj kot 150 ms po startu se ignorira (zaščita pred nenamernim klikom).
- **Odstopanje kroga** = `|ustavljeni čas − cilj|` v ms, zaokroženo na cel ms.
- **Prekoračitev**: brez ustavitve do cilja + 5 s → odstopanje kroga = **5000 ms**.
- **Prezgodnji stop** (manj kot 1 s po startu) šteje kot normalen stop (veliko odstopanje), ne kot napaka.
- **Popoln krog** (≤ 10 ms) → bonus **−20 ms** pri skupnem rezultatu (rezultat ne gre pod 0).
- **Rezultat runde** = vsota odstopanj vseh krogov − bonusi. Prikaži tudi povprečje, najboljši krog,
  smer (»v povprečju prezgodaj za 84 ms«) in oceno vsakega kroga.
- **Pavza** v solo (`Esc` ali gumb) prekine krog; prekinjena runda ne gre na lestvico ali rekord.
  Ob izgubi fokusa okna (zavihek v ozadju) se solo krog razveljavi in ponovi.
- **Natančnost časa**: merjenje samo s `performance.now()` od trenutka, ko je »Start!« dejansko narisan
  (`requestAnimationFrame` po spremembi DOM-a), ne od `setTimeout`. Prikaz ure osvežuj z rAF, a čas vedno
  računaj iz časovnih žigov, ne iz števila sličic.

### Multiplayer
- Host vodi igro: izbere način, težavnost in seed, določi skupni start kroga (`{ round, startAt }` v hostovem
  času + lokalni odmik), zbira rezultate.
- Vsak klient sam meri svoj čas od **lokalnega** starta (izravnava zakasnitve omrežja) in hostu pošlje
  `{ round, ms }` prek `room.send`. Host razkrije krog, ko so vsi oddali ali po cilju + 5 s (manjkajoči
  dobijo kazen prekoračitve).
- Na vrhu zaslona vrstica igralcev z `ui.who(p)` / `ui.avatar(p)`: stanje (teče / ustavil / izpadel) in
  skupno odstopanje po razkritju.
- **Prenos hosta**: `room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja (seed, krog,
  rezultati, izpadli). **Ponovna povezava**: osvežitev → `joinRoom(hub.roomFromUrl())` → sinhronizacija;
  zamujeni krog dobi kazen prekoračitve, igralec nadaljuje pri naslednjem.
- **TV pogled** (neobvezen, `?tv=1` ali gumb v lobbyju): velika ura (ki izgine hkrati za vse), po krogu skupni
  trak z vsemi časi in avatarji, ob koncu stopničke.
- **Revanša**: gumb na koncu ustvari novo rundo v isti sobi z istimi nastavitvami in novim seedom.

### Konec igre in povzetek
`ui.results` dopolni s **povzetkom**: skupno odstopanje, povprečje, najboljši krog, smer (prezgodaj /
prepozno) in **graf odstopanj po krogih** (stolpci levo/desno od ničle). Iz zgodovine (lokalno prek
`shared/storage.js`) prikaži **»tvojo notranjo uro«**: povprečno razmerje med ustavljenim časom in ciljem
v krogih na slepo (npr. »Tvoja sekunda traja 0,97 s«). V multiplayerju **nagrade**: *Švicarska ura*
(najmanjše skupno odstopanje), *Nestrpnež* (največkrat prezgodaj), *Zaspanec* (največkrat prepozno),
*Laserski prst* (najboljši posamezen krog).

### Postavitev zaslona
- **Telefon (portret, 375 px)**: ura v zgornji polovici, ogromen gumb STOP spodaj (dosegljiv s palcem),
  `touch-action: manipulation`, brez zooma in scrolla med igro.
- **Namizje**: ura na sredini, namig »preslednica = STOP«, ob strani lestvica / igralci.

### Dosežki (vsaj 8)
- `prvi-stop`: Prvi stop — odigraj rundo do konca
- `popolno`: Popolno! — krog z odstopanjem ≤ 10 ms
- `slepec`: Na slepo — krog brez vidne ure z odstopanjem ≤ 50 ms
- `pod-500`: Natančen — runda Srednje ali težje s skupnim odstopanjem pod 500 ms
- `pod-200`: Švicarska ura — runda Srednje ali težje s skupnim odstopanjem pod 200 ms
- `trije-popolni`: Hat-trick — 3 popolni krogi v eni rundi
- `dolga-pot`: Dolga pot — cilj 30 s ali več z odstopanjem ≤ 200 ms
- `zadnji-stoji`: Zadnji stoji — zmagaj Zadnji stoji z vsaj 4 igralci
- `dvoboj`: Ura ne laže — zmagaj dvoboj z vsaj 4 igralci
- `vztrajen`: Točen kot ura — dnevni izziv odigraj 7 dni zapored

### XP
15 za odigrano rundo, +10 za Težko, +15 za dnevni izziv, +5 za vsak popoln krog (največ +15), +40 za zmago v
multiplayerju.

### Naloge (`quests` v `games.json`)
Preden jih napišeš, preberi `shared/quests.js` in preveri, kako se seštevajo `target`/`goal` in `cmp` ter
kakšen je regex za id. Predlog:
- `e` »Odigraj rundo Ustavi uro« → `play:ustavi-uro`, target 1
- `e` »V Ustavi uro ustavi krog na manj kot 100 ms natančno« → `ustavi-uro:round`, cmp `lte`, goal 99
- `m` »Odigraj dnevni Ustavi uro« → `daily:ustavi-uro`, target 1
- `m` »V Ustavi uro doseži skupno odstopanje pod 600 ms« → `ustavi-uro:total`, cmp `lte`, goal 599
- `h` »V Ustavi uro ustavi krog na 10 ms natančno« → `ustavi-uro:round`, cmp `lte`, goal 10
- `h` »Zmagaj dvoboj ali Zadnji stoji v Ustavi uro« → `ustavi-uro:mp-win`, target 1
- `w` »Odigraj 25 krogov Ustavi uro ta teden« → `ustavi-uro:rounds`, target 25
- `w` »V Ustavi uro 3-krat doseži skupno odstopanje pod 400 ms« → `ustavi-uro:total`, target 3, cmp `lte`, goal 399

(Reakcija že uporablja `cmp: 'lte'`, preveri, da deluje enako. Odločitve zapiši v `PROGRESS.md`.)

### Prioritete, če zmanjkuje časa
Najprej mora biti brezhibno: natančno merjenje časa, generator runde iz seeda in točkovanje (`logic.js` s
testi) → Prosta igra z izginjanjem, razkritjem in zvokom → dnevni izziv z modifikatorji → dvoboj → Zadnji
stoji → TV pogled. Razkritje in zvok nista »na koncu«, brez njiju igra nima smisla. Kar ne gre, zapiši v
`PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Ustavi uro«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta; tudi `asc` rezultat v ms
   in merjenje časa).
4. `games/zaporedje/` — podoben vzorec: dnevni modifikatorji, WebAudio zvok, dvoboj z istim seedom.

### Tehnično
- Igra v `games/ustavi-uro/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'ustavi-uro', scoreOrder: 'asc' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge) — v solo in v multiplayerju, enkrat na igralca. Posebne dogodke za naloge sporoči s
  `hub.reportEvent('ustavi-uro:<ime>', vrednost)`; igra v `games.json` doda svoje predloge nalog (`quests`).
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p z `equipped`, npr. iz `room.players`), da se vidi kozmetika.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja) in **ponovno povezavo**
  (osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo stanja od hosta).
- Lastne tabele niso potrebne. Če jih vseeno dodaš: `supabase/games/ustavi-uro.sql` (idempotentno, RLS vklopljen,
  predpona tabel `ustavi_uro_*`), poženi kot migracijo, če imaš Supabase MCP, in preveri `get_advisors`; sicer
  zapiši v `PROGRESS.md`, kaj pognati.
- Čisto logiko (generator runde iz seeda z modifikatorji, odstopanje, prekoračitev, bonusi, skupni rezultat,
  ocena kroga, izpadanje v Zadnji stoji z izenačenji, »notranja ura«) daj v ločen modul (npr. `logic.js`) in
  dodaj teste v `tests/tests.js`: ista runda za isti seed, različna za različen seed, pravilno odstopanje
  (prezgodaj in prepozno), prekoračitev = 5000 ms, bonus ne spusti rezultata pod 0, *Dvojni stop* sešteje
  oba stopa, izpadanje ob izenačenju, meje ocen (10/50/150/400 ms).
- Telefon (portret, 375 px) in namizje; party igre: host na TV-ju, ostali na telefonih.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Odigraj celo prosto rundo in dnevni izziv (z `?debug=1` lahko krajši cilji ali samodejni stop za hiter test do konca).
5. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj do konca (dvoboj in Zadnji stoji s 3), odhod hosta sredi igre, osvežitev strani igralca.
6. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
7. V `games.json` dodaj vnos `ustavi-uro` s statusom **`live`**, `scoreOrder: "asc"`, `scoreUnit: "ms"` in `quests`
   (test sheme mora uspeti).
8. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno) in **stanje prompta**: vrstica na vrhu
   prompta → ✅ s commitom, vrstica v `prompts/README.md`, oznaka pri točki 18 v `PREDLOGI-IGER.md`.
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
