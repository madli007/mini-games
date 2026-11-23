# Prompt: Potapljanje ladjic s powerupi

> **Stanje:** ✅ narejeno — commit `188c354` (20. 11. 2026)

> V novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši:
> **»Preberi prompts/04-ladjice.md in ga v celoti izvedi.«**

---

## Igra

- **Ime:** Potapljanje ladjic
- **id / mapa:** `ladjice` → `games/ladjice/` (vnos v `games.json` že obstaja kot `soon`)
- **Kratek opis (za kartico, do 160 znakov):** »Ladjice s kapitani, mano in powerupi. Dvoboj, battle royale do 10 igralcev ali dnevni izziv proti AI.« (posodobi `description` v `games.json`)
- **Način:** `turn`
- **Število igralcev:** 1–10 (solo proti AI in dnevni izziv; multiplayer 2–10). V `games.json` popravi `players.min` na 1, če shema to dovoli.
- **Oznake:** `strategija`, `party`, `daily`
- **Rezultat:** lestvica je **dnevni izziv**: število strelov, da potopiš celotno floto dneva. **Manj je bolje** (`scoreOrder: 'asc'`). Multiplayer na lestvico ne gre, šteje pa za XP, kovance, dosežke in naloge.

### Občutek in stil (pomembno!)
Igra mora delovati **moderno, sočno in zabavno**, ne kot šolska mreža s črkami. Torej:
- **Neon ocean**: temno morje z animiranimi valovi (canvas ali CSS, lahki), mreža kot holografski radar s počasnim »sweep« žarkom, ladje kot čiste vektorske silhuete (SVG, brez slikovnih datotek). Izhajaj iz `shared/ui.css` in barve igre `#4de1ff`.
- **Juice pri vsakem strelu**: projektil po loku, pljusk pri zgrešenem, eksplozija in iskre pri zadetku, ladja se ob potopitvi nagne in potone, ostane dim/olje. Rahel screen shake, `navigator.vibrate` na telefonu (v `try/catch`).
- **Zvok**: sintetiziran prek WebAudio (brez zvočnih datotek): strel, pljusk, zadetek, potop, sonar »ping«, EMP brnenje. Gumb za utišanje, nastavitev zapomni prek `shared/storage.js`.
- **Komentator / killfeed**: kratki slovenski napisi, ki se menjajo, npr. »Dvojni zadetek!«, »Kapitan Miha je šel ribe hranit«, »Trojni niz! Kdo ga bo ustavil?«, »EMP! Ana ta krog spi.« Najmanj ~25 variant, da se ne ponavljajo.
- **Emote reakcije**: 6 hitrih emoji reakcij (😂 😱 🔥 🫡 🧂 👀), ki jih igralec pošlje vsem prek `room.send` in priletijo nad njegov avatar. Omejitev na 1 na 2 s.
- **Napetost**: časovnik poteze kot krožni trak okoli avatarja igralca na potezi, zadnjih 5 s utripa. Ko ima igralec le še eno ladjo, njegova kartica dobi »zadnji zdihljaj« oznako.
- Vse animacije spoštujejo `prefers-reduced-motion`.

### Načini
1. **Solo proti AI**: 1v1, tri težavnosti:
   - *Mornar*: naključni streli;
   - *Kapitan*: lov + ciljanje (po zadetku preišče sosede, nato smer);
   - *Admiral*: verjetnostna mapa gostote ladij, sposobnosti uporablja premišljeno (sonar na najbolj verjetno 3×3, torpedo v vrstico z največ neznanimi polji).
2. **Dnevni izziv** (solo): `hub.dailySeed` + `hub.rng` določita floto AI, **kapitana dneva** in **modifikator dneva** (npr. »Megla: sonar stane 1 mano manj«, »Nevihta: vsak 5. strel odnese za 1 polje«, »Zlata obala: dvojna mana za zgrešene«). AI ne strelja nazaj, cilj je čim manj strelov. Ena poskus na dan šteje za lestvico, ostali so vaja. Rezultat → `hub.submitScore`.
3. **Dvoboj** (2 igralca): klasična mreža 10×10, flota 5-4-3-3-2.
4. **Battle royale** (3–10): vsak ima manjšo mrežo, strelja na **kogarkoli živega**, zadnji preživeli zmaga. Velikost mreže in flota glede na število igralcev (npr. 3–4: 8×8 s 4-3-2-2; 5–10: 7×7 s 3-2-2). Vrstni red potez krožen.

### Pravila
- **Postavitev**: povleci in spusti, tap za rotacijo, gumb »Naključno«, časovnik postavitve (privzeto 45 s, nato samodejno naključno). Ladje se ne smejo dotikati (niti diagonalno) — nastavitev v lobbyju.
- **Poteza**: en strel ali ena sposobnost (sposobnost porabi potezo, razen če piše drugače). Časovnik poteze (privzeto 20 s, v lobbyju 10/20/30/brez); ob izteku naključni strel na naključnega živega nasprotnika.
- **Mana**: +2 za zgrešen strel, +1 za zadetek (zgrešeni naj vodijo do comebackov), +2 bonus za potopitev. Največ 10.
- **Kapitani** (izbira v lobbyju, privzeto različni za vsakega igralca; nastavitev »podvojeni dovoljeni«). Vsak ima **aktivno sposobnost** s ceno v mani in **majhno pasivko**:
  | Kapitan | Aktivna (mana) | Pasivka |
  |---|---|---|
  | **Sonar** | razkrije 3×3, katera polja imajo ladjo (ne kateri) — 4 | prvi strel vsake igre na polje z ladjo pokaže smer ladje |
  | **Torpedo** | izstreli po vrstici/stolpcu, zadene prvo ladjo — 5 | +1 mana ob potopitvi |
  | **Vaba** | postavi lažno 2-polje ladjo, ki ob zadetku javi »zadetek« in nato »vaba!« — 3 | prva prejeta potopitev se šteje kot zadetek, ladja ostane z 1 poljem |
  | **Popravilo** | obnovi eno zadeto (ne potopljeno) polje — 4 | vsak 4. krog samodejno +1 mana |
  | **EMP** | izbrani nasprotnik preskoči naslednjo potezo — 6 (isti igralec ne dvakrat zapored) | nasprotniki vidijo njegovo mano narobe ±1 |
  | **Kasetna bomba** | 4 naključna polja na izbrani mreži — 5 | zgrešeni streli dajo +3 mane namesto +2 |
- **Powerup zaboji** (vklop v lobbyju, privzeto vklopljeno): na vsaki mreži sta skrita 1–2 zaboja na praznih poljih. Kdor ga zadene, dobi enkratni predmet v inventar (največ 2): **Radar** (razkrije eno naključno polje ladje izbranega nasprotnika), **Mina** (postavi na svojo mrežo; kdor jo zadene, izgubi naslednjo potezo), **Dvojni strel** (dva strela v eni potezi), **Ščit** (naslednji zadetek na tvojo mrežo se odbije).
- **Battle royale twisti**:
  - **Glava na pladnju**: igralec z največ potopitvami ima nagrado; kdor mu potopi ladjo, dobi +3 mane.
  - **Maščevanje**: strel na tistega, ki te je zadnji zadel, da +1 mano.
  - **Duhovi**: izločeni igralci ostanejo kot opazovalci in lahko vsake 3 kroge izstrelijo en »meteor« na naključno polje naključnega živega igralca. Tako tudi izločeni ostanejo v igri.
- **Konec**: zmaga zadnji s preživelo ladjo. Ob neodločenem (npr. zadnja dva hkrati prek meteorja) zmaga tisti z več preživelimi polji.

### Skrivne pogodbe (misije v igri)
Na začetku vsake igre (tudi solo, ne v dnevnem izzivu) vsak igralec dobi **1 skrivno pogodbo** od treh naključnih, ki jo izbere sam. Izpolnjena pogodba prinese bonus XP, toast in `hub.reportEvent('ladjice:contract', 1)`. Primeri (pripravi vsaj 12):
- potopi ladjo s torpedom;
- zadeni 3× zapored;
- potopi zadnjo ladjo nekega igralca (izloči ga);
- zmagaj, ne da bi izgubil ladjo 4+;
- uporabi sposobnost 3×;
- poberi 2 zaboja;
- preživi EMP in v naslednji potezi zadeni;
- ...
Ob koncu igre se razkrijejo pogodbe vseh igralcev (»Ana je imela pogodbo: Izloči Miha ✅«).

### Konec igre in povzetek
`ui.results` dopolni z **zabavnim povzetkom**: natančnost, najdaljši niz zadetkov, porabljena mana, potopljene ladje, izpolnjene pogodbe, in **nagrade** za igralce: *Ostrostrelec* (najboljša natančnost), *Smolar* (največ zgrešenih zapored), *Žilavec* (najdlje preživel z eno ladjo), *Čarovnik* (največ sposobnosti), *Lovec na glave*. Gumb **»Revanša«** ustvari novo igro v isti sobi z istimi nastavitvami.

### Postavitev zaslona
- Igra je **skrita informacija**, zato vsak igra na **svojem telefonu**. Telefon: zgoraj vrstica nasprotnikov (avatarji, preživele ladje, mana), sredina izbrana tarča (swipe/tap za menjavo nasprotnika), spodaj tvoja mala mreža, mana, sposobnost in inventar. Veliki gumbi, `touch-action: manipulation`.
- Namizje: tvoja mreža in tarča druga ob drugi, killfeed ob strani.
- **TV pogled** (neobvezen, `?tv=1` ali gumb v lobbyju): opazovalec brez lastne flote, prikaže mreže vseh z meglo vojne (samo razkrito), killfeed, emote in lestvico preživelih. Odličen za party na TV-ju.

### Multiplayer in skrite flote
- Host vodi igro in preverja pravila; flote so v stanju, ki ga ima host, da preživi **prenos hosta**. Repo je »na časten način«, zato to ni varnostna luknja, a UI nikoli ne sme pokazati tujih ladij in klienti naj prikazujejo le razkrita polja.
- Poteze kot `room.pushMove`, stanje `room.setState(state, { expectedVersion })` po vsaki potezi. Ponovna povezava: osvežitev → `joinRoom(hub.roomFromUrl())` → sinhronizacija, igralec nadaljuje na svoji potezi.
- Igralec, ki se odklopi: njegove poteze po izteku časovnika igra preprost AI (*Kapitan*), dokler se ne vrne. Če ga ni 2 minuti, ga host izloči.
- Emote in animacije gredo prek `room.send` (broadcast), ne v stanje.

### Dosežki (vsaj 10)
- `prva-krv`: Prva krv — prvi zadetek v igri ladjic
- `admiral`: Admiral — premagaj AI na težavnosti Admiral
- `brez-praske`: Brez praske — zmagaj dvoboj brez izgubljene ladje
- `royale`: Kralj morja — zmagaj battle royale z vsaj 5 igralci
- `comeback`: Vstajenje — zmagaj z le še eno preživelo ladjo
- `torpedist`: Torpedist — potopi ladjo z enim torpedom
- `vaba`: Nasedli so — nasprotnik zadene tvojo vabo
- `snajper`: Snajper — dnevni izziv v največ 30 strelih
- `pogodbenik`: Plačanec — izpolni 10 pogodb (skupno)
- `duh`: Maščevanje iz groba — duh z meteorjem potopi zadnje polje ladje
- `vsi-kapitani`: Flota legend — zmagaj z vsakim kapitanom vsaj enkrat

### XP
25 za odigrano igro, +50 za zmago v multiplayerju, +10 za vsako izpolnjeno pogodbo, +15 za dnevni izziv. Solo proti AI: 15 / zmaga +20 (Admiral +40).

### Naloge (`quests` v `games.json`)
Preden jih napišeš, preberi `shared/quests.js` in preveri, kako se seštevajo `target`/`goal` in `cmp` ter kakšen je regex za id. Predlog:
- `e` »Odigraj igro ladjic« → `play:ladjice`, target 1
- `e` »Uporabi sposobnost kapitana 2×« → `ladjice:ability`, target 2
- `m` »Potopi 5 ladij« → `ladjice:sink`, target 5
- `m` »Izpolni skrivno pogodbo« → `ladjice:contract`, target 1
- `m` »Poberi 3 powerup zaboje« → `ladjice:crate`, target 3
- `h` »V dnevnem izzivu potopi floto v največ 45 strelih« → `ladjice:daily-shots`, cmp `lte`, goal 45
- `h` »Zmagaj battle royale z vsaj 4 igralci« → `ladjice:br-win`, target 1
- `h` »Premagaj AI Admiral« → `ladjice:admiral-win`, target 1
- `w` »Potopi 30 ladij ta teden« → `ladjice:sink`, target 30
- `w` »Zmagaj 3 igre ladjic v multiplayerju« → `ladjice:mp-win`, target 3

Po potrebi dopolni test v `tests/tests.js`, ki zdaj preverja, da igra `soon` nima nalog (ladjice bodo `live`).

### Prioritete, če zmanjkuje časa
Najprej mora biti brezhibno: pravila + sposobnosti + mana (`logic.js` s testi) → solo proti AI → dvoboj → battle royale → dnevni izziv → zaboji, pogodbe, duhovi → TV pogled. Juice (animacije, zvok, komentator) ni »na koncu«, ampak se dela sproti ob vsakem delu. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta).

### Tehnično
- Igra v `games/ladjice/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'ladjice', scoreOrder: 'asc' })`;
  `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge) — v solo in v multiplayerju, enkrat na igralca. Posebne dosežke za naloge sporoči s
  `hub.reportEvent('ladjice:<ime>', vrednost)`; igra v `games.json` doda svoje predloge nalog (`quests`).
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p z `equipped`, npr. iz `room.players`), da se vidi kozmetika.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja) in **ponovno povezavo**
  (osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo stanja od hosta).
- Potezne/asinhrone igre: `room.setState(state, { expectedVersion })`, `room.pushMove`, `room.getMoves`.
- Če igra potrebuje svoje tabele: `supabase/games/ladjice.sql` (idempotentno, RLS vklopljen). Če imaš Supabase
  MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati. (Verjetno lastnih tabel ne potrebuješ.)
- Čisto logiko (pravila, mana, sposobnosti, zaboji, pogodbe, AI, generator dnevnega izziva) daj v ločene module
  (npr. `logic.js`, `ai.js`) in dodaj teste v `tests/tests.js`: veljavnost postavitve, strel/zadetek/potop,
  vsaka sposobnost in pasivka, mana in meja, zaboji, EMP pravilo, konec igre in neodločeno, AI nikoli ne
  strelja dvakrat na isto polje, dnevni izziv je determinističen za isti seed.
- Telefon (portret, 375 px) in namizje; party igre: host na TV-ju, ostali na telefonih.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj do konca (dvoboj in battle royale s 3), odhod hosta sredi igre, osvežitev strani igralca.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
6. V `games.json` spremeni vnos igre iz `soon` v **`live`** (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
