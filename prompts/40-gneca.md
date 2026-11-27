# Prompt za AI agenta: Gneča — top, vrata z množitelji in horde (nova igra, 1. del)

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 01 je narejen)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/40-gneca.md in ga v celoti izvedi.«**
>
> Ozadje: točka 62 v `PREDLOGI-IGER.md`, vnos `gneca` v `games.json` je zdaj `soon`.
> Žanr: mobilni »crowd« strelec. Spodaj je top, ki strelja majhne tekače, ti gredo skozi vrata z množitelji in se
> spopadejo s sovražno hordo. **Ime, liki, nivoji, grafika, napisi in zvok so naši**: ne posnemaj nobene obstoječe
> igre (imena, videz likov, logotip, barvne sheme, zaporedje nivojev, zvoki).

---

## Igra

- **Ime:** Gneča
- **id / mapa:** `gneca` → `games/gneca/`
- **Kratek opis:** »Streljaj tekače skozi vrata ×2 in ×3, preplavi sovražno hordo in podri njihov stolp. Kampanja in dnevni nivo.«
- **Način:** `single` (dvoboj pride v 2. delu) · **Igralci:** 1 · **Oznake:** `akcija`, `daily`, `arkada`
- **Rezultat:** točke nivoja (več je bolje, `desc`, enota `točk`).

### Osnovna pravila
- **Steza** je ravna (kasneje z zavoji ali razcepi), dolga npr. 60 enot in široka 10. Moj **top** je na spodnjem
  koncu, **sovražni stolp** na zgornjem. Top se premika samo levo in desno po svoji vrsti.
- **Streljanje:** dokler držiš (miška, prst, Space), top izstreljuje tekače s stalno hitrostjo (npr. 8/s, nadgradljivo).
  Vlečenje levo in desno premika top (na telefonu relativno vlečenje kjerkoli na spodnji polovici zaslona,
  na namizju miška ali ←/→, A/D).
- **Tekači** tečejo naravnost naprej, rahlo se odrivajo med sabo (ločevanje), da je videti kot množica, in se
  izogibajo robu steze.
- **Vrata** so pravokotni pasovi čez del steze: `+N`, `×N`, `−N`, `÷N`. Lahko so mirna, premična (levo-desno)
  ali se po vsakem prehodu spremenijo (npr. `×2` → `×1` po 30 prehodih). Ko gre tekač skozi vrata `×3`, nastaneta
  ob njem še 2 nova. **Vsak tekač (in vsak njegov potomec) gre skozi ista vrata samo enkrat**: potomec podeduje
  seznam že uporabljenih vrat. Brez tega pravila se množica eksponentno napihne.
  `−N`/`÷N` uničijo tekače (prvih N, ki pridejo, ali vsakega N-tega).
- **Spopad:** moj tekač in sovražni tekač se ob dotiku uničita (1 : 1). Večji liki imajo HP: vsak sovražni tekač,
  ki se zaleti vanj, mu vzame 1.
- **Velikan:** vsak izstreljen tekač polni merilec (npr. 40). Ko je poln, je gumb »Velikan« (ali samodejno ob
  naslednjem strelu, nastavitev) in top izstreli velikana: 30 HP, počasnejši, vrata `−` mu ne škodijo, skozi
  vrata `×` se ne množi (ali le `+1` velikan, odloči ob uglaševanju).
- **Sovražnik:** valovi horde iz stolpa (urnik v JSON nivoja), sovražni velikani s HP številko nad glavo, stolpi
  ob stezi, ki streljajo na moje tekače, ovire (ograja, valjar, žaga, ki se vrti). Sovražni stolp ima HP (npr. 200):
  vsak moj tekač, ki ga doseže, mu vzame 1, velikan 10.
- **Konec:** zmaga, ko pade sovražni stolp. Poraz, ko sovražni tekači dosežejo moj top (npr. 5 v vrsti za
  topom) ali ko poteče čas nivoja (npr. 90 s).
- **Točke:** zmaga + preostali čas + hitrost + točke za uničene sovražnike, −točke za izgubljene tekače
  v vratih `−`. 1–3 zvezdice po nivoju. Formula v čistem modulu s testi.

### Nadgradnje in kovanci v igri
- Za zvezdice in zmago dobiš **zobnike** (valuta v igri, ločena od kovancev huba). V delavnici med nivoji
  nadgradiš: hitrost streljanja, začetni bonus (prvi val je ×2), polnilec velikana, HP velikana, širino topa
  (2 tekača naenkrat). Shranjeno prek `shared/storage.js` (in v Supabase, če je to v obstoječem vzorcu drugih
  iger s kariero, npr. skoki; sicer samo lokalno in zapiši v `PROGRESS.md`).
- **Dnevni nivo** uporablja **fiksne nadgradnje** (vsi enako), da je lestvica poštena.

### Nivoji
- JSON v `games/gneca/levels/` (dodajajo se brez spreminjanja kode): dolžina in širina steze, tema, vrata
  (položaj, vrednost, gibanje, sprememba), ovire, sovražni stolpi, urnik valov, HP sovražnega stolpa, časovna
  meja, meje za zvezdice.
- **20 nivojev v dveh sklopih:** 1 Puščava (učenje: `+`, `×`, nato `−`, premična vrata, prvi velikan),
  2 Kanjon (ozke steze, stolpi, valjarji, sovražni velikani, nivo s šefom na koncu: velik stolp, ki pošilja
  velikane). Težavnost postopoma narašča; prvi nivo se mora dati odigrati brez navodil.
- **Dnevni nivo:** `hub.dailySeed()` sestavi nivo iz gradnikov (generator v čistem modulu). Šteje prvi poskus
  za lestvico (`hub.submitScore`), naslednji so vadba. Generator mora biti preverjeno rešljiv: v testih ga
  preigra preprost avtopilot (strelja, cilja na najboljša vrata) in mora zmagati na vsaj 95 % seedov.

### Tehnika
- **Simulacija** (`sim.js`) je 2D (x, z), **brez DOM-a in brez Three.js**, fiksen korak 60 Hz, naključje le iz
  seeda (`hub.rng`), nič `Math.random`. Stanje v tipiziranih poljih (`Float32Array` za položaje, hitrosti, HP,
  `Uint8Array`/bitne maske za uporabljena vrata), da je hitro in da se da pozneje poslati kot posnetek.
- **Trki:** prostorska mreža (npr. celice 1×1) za tekač–tekač in tekač–sovražnik; vrata in ovire so pravokotniki.
- **Meja:** do 600 živih tekačev na stran. Nad mejo se novi tekači **združujejo** (en tekač z 2, 4 … HP in malo
  večji), da se igra ne ustavi. Meja in pravilo združevanja sta v `balance.js`.
- **Izris:** Three.js **0.160.0** (ista pripeta verzija in importmap kot `games/krogla/index.html`). Tekači in
  sovražniki so `InstancedMesh` (preprost lik: telo kot kapsula, oči, nihanje pri teku, barva strani), vrata so
  prosojne plošče z velikim napisom (canvas tekstura), velikani so večji liki z HP vrstico. Kamera 2,5D zadaj in
  nad topom, rahlo sledi topu. Delci ob spopadu (»puf«), tresenje kamere ob velikanu in padcu stolpa.
  Lahko uporabiš dele rendererja Krogle (nebo, luči, samodejna kakovost): **uvažaj, ne kopiraj**.
- **Samodejna kakovost:** če FPS pade, zmanjšaj senče, delce in ločljivost. Izmeri in zapiši v `PROGRESS.md`:
  FPS pri 600 + 600 tekačih na namizju in na emulaciji telefona (cilj 60 / ≥ 40).
- **Zvok:** WebAudio sinteza (strel, »pop« pri množenju, udarec, padec stolpa, fanfara), gumb za utišanje.
- **Stran z drsniki** `?debug=1`: hitrost streljanja, hitrost tekačev, ločevanje, meja tekačev, HP velikana,
  hitrost igre ×1/×2/×4, prikaz mreže trkov in FPS.

### Postavitev zaslona
- **Telefon (375×812, portret)** je glavni: steza navpično, top spodaj, zgoraj HP sovražnega stolpa, čas in števec
  mojih tekačev, merilec velikana desno spodaj (velik gumb, min. 56 px). `touch-action: none` na platnu.
- **Namizje:** isto, steza na sredini, ob strani zemljevid nivojev in delavnica.
- Meni: zemljevid sklopov z zvezdicami, delavnica, dnevni nivo, lestvica (`ui.leaderboard`), konec z `ui.results`.

### Hub
- **Dosežki (vsaj 6):** `prvi-stolp` (končaj prvi nivo), `tisoc` (imej 1000 tekačev hkrati, z združenimi vred),
  `brez-izgub` (zmagaj nivo, ne da bi tekač šel skozi vrata `−`), `velikan` (podri stolp samo z velikanom),
  `puscava` (vse zvezdice v sklopu Puščava), `sef` (premagaj šefa Kanjona), `dnevni-3` (3 zvezdice na dnevnem nivoju).
- **XP (`hub.awardXp`):** 15 za odigran nivo, +25 za zmago, +20 za 3 zvezdice, +40 za dnevni nivo.
- **`hub.reportGame({ won, players: 1, score, daily })`** po vsakem odigranem nivoju.
- `hub.reportEvent`: `gneca:win`, `gneca:stars`, `gneca:crowd` (največ tekačev hkrati), `gneca:giant`.
- **Naloge** v `games.json`: e »Odigraj nivo Gneče«, m »Imej 300 tekačev hkrati«, h »Na dnevnem nivoju Gneče dobi
  3 zvezdice«, w »Zmagaj 10 nivojev Gneče ta teden«.

### Moduli (predlog)
`balance.js` (vse številke), `sim.js` (stanje, `step(state, input)`, tekači, vrata, spopad, velikani, stolpi, valovi,
konec), `grid.js` (prostorska mreža), `level.js` (nalaganje in validacija JSON), `daily.js` (generator iz seeda),
`score.js` (točke in zvezdice), `autopilot.js` (za teste in `?demo=1`), `upgrades.js`, `render.js` + `render/`
(Three.js), `input.js`, `audio.js`, `ui-game.js` (meni, delavnica, HUD), `game.js` (vstop).

### Testi (`tests/gneca.js`, vključi v `tests/tests.js`)
- Determinizem: isti seed + isti vnosi → isti hash stanja po 3000 korakih.
- Vrata: `×3` iz 10 tekačev naredi 30; isti tekač ali potomec ne gre dvakrat skozi ista vrata; `−`, `÷`,
  spremenljiva vrata.
- Spopad 1 : 1, HP velikana, škoda stolpu, meja in združevanje, zmaga in poraz.
- Točke in zvezdice; validacija vseh JSON nivojev; avtopilot zmaga vse nivoje kampanje z največjimi nadgradnjami
  in vsaj 95 % od 200 dnevnih seedov s fiksnimi nadgradnjami.
- Zmogljivost (v Node): 1000 korakov s 600 + 600 tekači pod mejo časa (zapiši izmerjeno).

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta).
4. `games/krogla/index.html`, `games/krogla/render.js` in `games/krogla/render/` — Three.js importmap, renderer,
   `InstancedMesh`, samodejna kakovost.

### Tehnično
- Igra v `games/gneca/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'gneca' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge). Posebne dosežke za naloge sporoči s `hub.reportEvent('gneca:<ime>', vrednost)`; igra v `games.json`
  doda svoje predloge nalog (`quests`). Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)`.
- Če igra potrebuje svoje tabele: `supabase/games/gneca.sql` (idempotentno, RLS vklopljen, predpona `gneca_`). Če imaš
  Supabase MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati.
- Čisto logiko daj v ločene module brez DOM-a in dodaj teste v `tests/tests.js`.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi).
4. Ročno odigraj vsaj 4 nivoje (tudi poraz in nivo s šefom) in dnevni nivo; preveri `?debug=1` in `?offline=1`.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
   Izmeri FPS pri polni množici.
6. V `games.json` spremeni vnos `gneca` iz `soon` v **`live`** (opis, oznake, naloge; preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md`, napiši `games/gneca/README.md` (kontrole, pravila vrat, format nivoja, kako dodati
   nivo, `balance.js`), posodobi korenski `README.md` in **stanje prompta**: vrstica na vrhu → ✅ s commitom,
   vrstica v `prompts/README.md`, oznaka pri točki 62 v `PREDLOGI-IGER.md`.
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu: napiši naslednji prompt
Napiši **`prompts/41-gneca-dvoboj.md`** (po `prompts/TEMPLATE-igra.md`, vpiši ga v kazalo kot ⬜, posodobi
»Naslednja prosta številka«; če je 41 medtem zasedena, vzemi naslednjo prosto). Vsebina: **dvoboj 1v1 online**
(vsak top na svojem koncu iste steze, vrata na sredini veljajo za obe strani, determinističen lockstep z ukazi
`premik`/`strel`/`velikan`, hash stanja in posnetek ob razhajanju, prenos hosta, ponovna povezava; vzorec iz
`prompts/26-lane-wars.md`), **2v2** (dva topa na strani), še dva sklopa (Tovarna, Zima) s šefi in **predmeti v
trgovini** (barva topa, kostumi tekačev; samo videz, prek `GAME_ITEMS`/`hub.gameItem`). Vanj zapiši vsa spoznanja iz
tega dela: dejanska imena modulov in funkcij, format nivoja, izmerjeno zmogljivost, kaj ni bilo narejeno.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu,
kaj ni bilo preverjeno in kaj je v promptu 41.
