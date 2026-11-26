# Prompt za AI agenta: Motorist (3. del: dirka do 10 igralcev v živo, sezona, predmeti v trgovini)

> **Stanje:** ⬜ čaka — predpogoj 32 (33 priporočeno: skupnostne proge in proga tedna)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/34-motorist-dirka.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »6. Motorist (fizikalni trial)«. Igra `games/motorist/` ima singleplayer (prompt 32)
> in, če je bil izveden, urejevalnik, skupnostne proge, dnevno progo in sklopa 3–4 (prompt 33). **Najprej preberi**
> razdelke »Motorist« v `PROGRESS.md` (posebej »Ni bilo narejeno«) in `games/motorist/README.md`. Kar iz prejšnjih delov
> ni bilo narejeno in je potrebno za ta del, naredi **najprej**.
>
> Fizika, proge, medalje in singleplayer lestvice ostanejo enaki. Če je dejansko stanje v kodi drugačno, kot piše tu,
> velja koda.

---

## Cilj
1. **Dirka v živo do 10 igralcev:** vsi hkrati vozijo isto progo, drugi so **prosojni ghosti v živo** (brez trkov),
   zmaga prvi v cilju z najmanj napakami.
2. **Sezona** (mesečni pokal) iz uradnih prog in proge tedna.
3. **Predmeti v trgovini** za Motorista (videz, fizika je za vse enaka).

## 1. Dirka v živo (`mode: realtime`, 1–10 igralcev)
- Lobby prek `hub.createRoom` / `hub.joinRoom` / `hub.roomFromUrl` in `ui.lobby`. Host izbere **progo** (uradna, dnevna,
  skupnostna — podatki proge gredo v stanje sobe ali `room.send`, odjemalec jo validira), **število krogov/prog**
  (1 proga ali serija 3 prog s točkami 10-8-6-5-4-3-2-1), **največ napak** pred DNF (npr. brez omejitve / 10) in
  **časovno omejitev** (npr. 3 min po prvem v cilju).
- **Vsak igralec simulira sebe** na svoji napravi (fizika je lokalna, kot singleplayer). Prek `room.send` pošilja
  ~15–20×/s **položaj za ghost** (isti kanali kot ghost iz 1. dela, kvantizirano, malo bajtov) ter dogodke: kontrolna
  točka, padec, cilj s časom in napakami. Drugi igralci se izrišejo kot prosojni motorji z imenom (`ui.who`) in
  interpolacijo (~100 ms zamika), brez trkov.
- **Host vodi dirko:** odštevanje (`ui.countdown`, skupni začetni čas z izravnavo ure prek sporočil), zbira prihode v cilj,
  določi vrstni red (manj napak, nato čas — ali čas + kazen kot v singleplayerju; odloči enotno in zapiši v `rules.js`
  s testi), konča dirko, pošlje rezultate. Rezultati gredo vsem prek `ui.results`.
- **Preverjanje »na časten način«:** host zavrne nemogoče čase (pod zlatim × 0,8 ali brez vseh kontrolnih točk po vrsti).
  Neobvezno: odjemalec pošlje posnetek vnosov in host ga simulira (po vzoru `shared/sport/live-replay.js` `verify`),
  če je fizika na isti vrsti brskalnika deterministična — preveri in zapiši; sicer le osnovna preverjanja.
- **Prenos hosta** (`room.on('hostChanged')`): nov host nadaljuje iz zadnjega znanega stanja (seznam prihodov, čas začetka,
  nastavitve), stanje dirke host redno pošilja vsem. **Ponovna povezava:** osvežitev → `joinRoom(hub.roomFromUrl())` →
  zahteva sinhronizacije; igralec se vrne na zadnjo kontrolno točko z istim številom napak (napake/čas hrani host).
- **Gledalec/TV pogled** (`?tv=1` ali vloga v lobbyju): kamera sledi vodilnemu ali celotni skupini, sprotna razvrstitev,
  imena, napake, razlike. Igralci, ki so v cilju, lahko gledajo ostale.
- Prazna mesta: neobvezno **boti** iz posnetkov (ghost najboljšega, uradni dev ghost) kot »tekmeci« brez vpliva na točke.
- Po dirki vsak igralec kliče `hub.reportGame({ won, players, score, daily: false })` enkrat, `hub.awardXp` (npr. 15
  za dirko, +25 za zmago), dosežki: `zmaga-v-zivo`, `polna-soba` (dirka z 10 igralci), `foto-finis` (zmaga za < 0,1 s),
  `brez-padca-v-zivo`.
- Kontrole in HUD kot v singleplayerju; na telefonu so ghosti drugih manj podrobni (samodejna kakovost).

## 2. Sezona
- Mesečna sezona iz `shared/sport/season.js` (koledar iz meseca + seeda, Europe/Ljubljana, točke 100-80-60 …):
  vsak teden 2–3 »postaje« (uradne proge + proga tedna, če obstaja), rezultat postaje = najboljša vožnja tedna na tej progi.
- Razvrstitev sezone iz lestvic postaj (branje `game_scores` po `seed = 'season:<mesec>:<postaja>'` ali lastna tabela
  `motorist_season` v `supabase/games/motorist.sql`, če je bolj zanesljivo — odloči, idempotentno, RLS, RPC).
- Zaslon sezone: koledar postaj, moji rezultati, skupna razvrstitev, naslov prvaka meseca (naziv iz kozmetike, če je
  na voljo prek obstoječih mehanizmov trgovine — sicer le dosežek `prvak-sezone`).

## 3. Predmeti v trgovini
- Po vzoru predmetov za skoke (`GAME_ITEMS` v `shared/cosmetics.js`, `equipped.games.motorist.<slot>`, `hub.gameItem`,
  `gameItemOf(p.equipped, 'motorist', slot)`, zavihek »Za igre« v trgovini) dodaj sloti:
  `bike` (barva/vzorec motorja), `helmet` (čelada), `suit` (dres), `trail` (sled/izpuh, npr. iskre, mavrica, sneg).
  Vsaj 4 predmeti na slot, cene usklajene z ekonomijo (`tests/economy-sim.js` mora ostati zelen).
- Katalog se mora ujemati s `shop_items` v `schema.sql`: `node tools/shop-sql.mjs` in posodobi blok `GAME_ITEMS`.
  Če imaš Supabase MCP orodja, poženi spremembo kot migracijo in preveri advisors.
- Predmeti se vidijo v singleplayerju, na ghostih (moj in tuji, `equipped` iz lestvice/ghosta) in v dirki v živo
  (iz `room.players`). **Fizika je za vse enaka**; predmeti so samo videz.

### Testi
- `rules.js`: vrstni red dirke (napake, čas, DNF, časovna omejitev), točke serije, izenačenja.
- Protokol: kodiranje/dekodiranje sporočil položaja (velikost, kvantizacija), interpolacija ghosta v živo.
- Host: zavrnitev nemogočih časov, nadaljevanje po prenosu hosta iz posnetka stanja.
- Sezona: koledar postaj je determinističen, točke in razvrstitev.
- Kozmetika: novi predmeti v `GAME_ITEMS` in SQL bloku se ujemajo (obstoječ test kataloga).

### Prioritete, če zmanjkuje časa
1. Kar je potrebno iz prejšnjih delov.
2. Dirka v živo z 2–3 igralci: lobby, odštevanje, ghosti v živo, cilj, rezultati, `reportGame`.
3. Prenos hosta in ponovna povezava; do 10 igralcev; TV pogled.
4. Predmeti v trgovini.
5. Serija prog, sezona, boti iz posnetkov.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in ob koncu kot točke v `PREDLOGI-IGER.md` (točka 6).

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija `# Motorist — dirka v živo, sezona, trgovina`:
načrt s kljukicami, dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`), posebej sobe, presence, `hostChanged`, `ui.lobby`.
3. `games/reakcija/` — referenčni multiplayer s prenosom hosta.
4. `games/motorist/README.md` in razdelki »Motorist« v `PROGRESS.md`.
5. `games/rusilec/net.js`, `games/rusilec/match.js` (realtime protokol, prenos hosta, TV pogled),
   `shared/sport/README.md` (`season.js`, `live-replay.js`), predmeti za skoke v `shared/cosmetics.js` in `games/skoki/gear.js`.

### Tehnično
- Vse v `games/motorist/` (+ `shared/cosmetics.js`, `supabase/schema.sql` za predmete), **brez build koraka**, ES moduli,
  relativne poti, slovenščina.
- Realtime stanje samo prek `room.send` (brez pisanja v bazo za vsak tick). Host preverja pravila in redno pošilja stanje.
- V `games.json` posodobi vnos: `players.max` 10, `mode` `realtime` (ali ostane `single`, če dashboard bolje kaže igro z
  obema načinoma — preveri, kako dashboard uporablja `mode`, in izberi), oznaka `party`.
- Čista logika (pravila dirke, protokol, sezona) v module brez DOM-a s testi v `tests/motorist.js`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v trgovini in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (obstoječi testi nespremenjeni, ekonomija zelena).
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih (za daljše teste ločena okna): ustvari sobo, pridruži se
   s kodo in prek `?room=`, odvozi dirko do konca, odhod hosta sredi dirke, osvežitev igralca med vožnjo, TV pogled.
5. Izgled na **telefonu (375×812)** in **namizju** (tudi TV pogled): posnemi zaslone, sam jih preglej in popravi.
6. Kupi in opremi predmet v trgovini (offline), preveri, da se vidi v igri, na ghostu in pri drugem igralcu v dirki.
7. Posodobi `games.json` (test sheme uspe), `PROGRESS.md`, `games/motorist/README.md` (dirka v živo, protokol, sezona,
   predmeti), korenski `README.md`, in **stanje prompta**: vrstica na vrhu → ✅ s commitom, vrstica v `prompts/README.md`,
   oznaka pri točki 6 v `PREDLOGI-IGER.md` (in pregledna tabela na vrhu).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati dirko, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
