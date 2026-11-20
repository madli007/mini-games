# Prompt za novo igro v MINI GAMES hubu (predloga)

> Kopiraj to datoteko v `prompts/NN-<id>.md`, izpolni del **»Igra«** in v novi seji
> (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši:
> **»Preberi prompts/NN-<id>.md in ga v celoti izvedi.«**

---

## Igra (izpolni)

- **Ime:** `<npr. Potapljanje ladjic>`
- **id / mapa:** `<npr. ladjice>` → `games/<id>/` (enak id kot v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** `<…>`
- **Način:** `<single | realtime | turn | async>`
- **Število igralcev:** `<min>–<max>`
- **Oznake:** `<npr. party, daily, strategija>`
- **Rezultat:** `<kaj je rezultat; več je bolje (desc) ali manj je bolje (asc)>`
- **Pravila:**
  - `<pravilo 1>`
  - `<pravilo 2>`
- **Postavitev zaslona:** `<npr. host na TV-ju kaže mapo, igralci na telefonih imajo kontrole>`
- **Dosežki (vsaj 3):** `<ključ: naslov — pogoj>`
- **XP:** `<npr. 25 za odigrano igro, +50 za zmago>`
- **Posebnosti / želje:** `<grafika, zvok, powerupi, nastavitve v lobbyju …>`

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
- Igra v `games/<id>/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: '<id>' })` (`scoreOrder: 'asc'`,
  če je manj bolje); `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja) in **ponovno povezavo**
  (osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo stanja od hosta).
- Potezne/asinhrone igre: `room.setState(state, { expectedVersion })`, `room.pushMove`, `room.getMoves`.
- Če igra potrebuje svoje tabele: `supabase/games/<id>.sql` (idempotentno, RLS vklopljen). Če imaš Supabase
  MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati.
- Čisto logiko (pravila, točkovanje, generator mape …) daj v ločen modul in dodaj teste v `tests/tests.js`.
- Telefon (portret, 375 px) in namizje; party igre: host na TV-ju, ostali na telefonih.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Multiplayer (če ga igra ima) v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj do konca, odhod hosta sredi igre, osvežitev strani igralca.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
6. V `games.json` spremeni vnos igre iz `soon` v **`live`** (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
