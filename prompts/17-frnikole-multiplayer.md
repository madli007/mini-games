# Prompt za AI agenta: Dirka frnikol (2. del: multiplayer v živo, do 10 igralcev)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/17-frnikole-multiplayer.md in ga v celoti izvedi.«**
>
> Ozadje: 1. del (`prompts/16-frnikole.md`) je narejen: `games/frnikole/` je solo »Dirkalni dan« proti botom
> (5 dirk, stave s točkami igre, 3 sunki, dnevni izziv, prosta igra). Preberi **`games/frnikole/README.md`** in
> sekcijo »Dirka frnikol« v `PROGRESS.md`. Ta del doda **party način v živo**: host (TV/prenosnik) simulira dirko,
> igralci na telefonih stavijo in pošiljajo sunke. Solo način mora ostati enak (njegovi testi ostanejo zeleni).
> Ne kopiraj kode iz Rušilca — uvozi, kar se da (npr. vzorce iz `games/rusilec/net.js`), ali naredi tanek modul v
> `games/frnikole/`.
>
> Na koncu tega dela posodobi `prompts/18-frnikole-stave.md` z novimi spoznanji (imena sporočil, stanje sobe).

---

## Najprej: kar iz 1. dela ni bilo narejeno ali preverjeno

Te točke naredi (ali vsaj preveri) **pred** multiplayerjem; rezultat zapiši v `PROGRESS.md`:
1. **Dirka v realnem času pri 60 FPS** v vidnem zavihku: kamera (Vodilni / Moja / Pregled), počasni posnetek pred
   ciljem, učinki sunkov, zvok (`sound.js`: klik trkov, sunek, cilj, navijanje). V 1. delu je bil zavihek skrit (~1,5 FPS),
   dirke so bile večinoma preskočene z `__fr.skip()`. Popravi, kar je narobe (npr. glasnost klikov, preveč napisov).
2. **Kratek posnetek cilja** po dirki (replay zadnjih ~3 s v počasnem posnetku iz shranjenih položajev) — namesto/poleg
   zdajšnjega upočasnjevanja tik pred ciljem. Položaje 8 frnikol vzorči ~20×/s (to bo uporabno tudi za klienta v MP).
3. Ob osvežitvi strani sredi solo dne se dan izgubi (poskus dneva je porabljen ob začetku). Shrani stanje dne
   (`day.idx`, kupčki, stave, posojilo) v `sessionStorage` po vsaki dirki in ponudi »Nadaljuj dan«.
4. Dosežki `saboter`, `milijonar`, `brez-sunka`, `foto` niso bili odklenjeni v brskalniku — preveri jih s `?dev=1`
   (`window.__fr`) ali s testom pogojev (izloči preverjanje dosežkov v čisto funkcijo, npr. `achievementsFor(...)` v `bets.js`).
5. Premične ploščice (`movers`) in ventilatorji (`fans`) na progah: dodaj pomožno funkcijo v generator
   (`tools/frnikole-tracks.mjs` → razred `Track`) in jih uporabi na vsaj eni progi; preverjanje (a)–(c) mora ostati zeleno.

---

## Igra (2. del)

- **Način v `games.json`:** `mode: "realtime"`, `players: { min: 1, max: 10 }`, oznaka `party` (solo ostane v meniju).
- **Postavitev:** host na TV-ju/prenosniku kaže 3D dirko (`RaceRenderer`), velik vrstni red, komentator in killfeed;
  igralci na telefonih vidijo **stavnico** (pred dirko) in **kontrole** (med dirko: 8 barvnih gumbov frnikol + POMOČ /
  BOČNO, preostali sunki, ohlajanje, svoj kupček, svoje stave v živo, kompakten vrstni red). Telefon naj ne riše 3D
  (počasne naprave) — po želji preprost 2D tloris proge s pikami frnikol iz posnetkov.
- **Lobby:** `ui.lobby(el, room, { settingsForm })`: število dirk (3 / 5), boti za prazna mesta (0–7; privzeto toliko,
  da je skupaj vsaj 4 stavnikov), proge (vse / izbor), čas za stave (20 / 30 / 45 s), »📺 Samo zaslon (TV)« za hosta
  (host brez kupčka, kot v Rušilcu `?tv=1`).
- **Dirkalni večer:** kot solo dan, a vsi stavijo hkrati v odštevanju (časovna omejitev stav, nato samodejno »Na start«).
  Kupček 1000, posojilo enkrat, `finalScore`. Boti iz 1. dela (`botBets`, `botBrain`) zapolnijo prazna mesta.
- **Konec:** `ui.results` za vse (ljudje + boti), vsak človek pokliče `hub.reportGame({ won, players: ljudje, score })`
  in `hub.awardXp` (enako kot solo, a `daily: false`). Dosežki iz 1. dela veljajo tudi v MP. Nov dosežek npr.
  `party-zmaga` (zmaga večera z vsaj 3 ljudmi) in naloga `frnikole:party` (odigraj večer z ≥ 3 ljudmi).

## Omrežje (host-authoritative)

Host simulira vse z `race.js` (`createRace`, `stepRace`, 120 Hz) — klienti ne simulirajo fizike.
Predlagana sporočila (`room.send`, majhen JSON):

| Sporočilo | Kdo → komu | Vsebina |
|---|---|---|
| `hello` | vsak → vsi | `{ tv, req }` (req = prosim, pošlji stanje) |
| `phase` | host → vsi | `{ ph: 'bet' \| 'race' \| 'after' \| 'end', no, track, seed, deadline }` |
| `odds` | host → vsi | kvote dirke (`oddsFrom` → `win`, `podium`, `duels`, `fav`) + postava (`marbles` z id in formo) |
| `bet` | igralec → host | `{ no, type, m, vs?, stake }` — host preveri z `betError` in odgovori z `bets` (vse stave igralca) |
| `nudge` | igralec → host | `{ no, m, k: 'help' \| 'hit' }` — host ga doda v naslednji korak: `stepRace(R, [{ m, k, by: userId }])` |
| `snap` | host → vsi | ~12×/s: `{ s: korak, t, p: Int16 (x, y, z ×100 na frnikolo) v base64, st: stanja, ord, ev: novi dogodki }` |
| `full` | host → vsi | 1×/s in ob spremembi faze: stanje večera (kupčki, stave, posojila, vrstni red dirk, `R.log`, seed dirke, korak) |

- **Determinizem je osnova:** dirka je določena s `seed` + `R.log` (sunki z indeksom koraka). Nov host ob `hostChanged`
  dirko **rekonstruira**: `createRace` z istim seedom in istimi boti, nato `stepRace` do zadnjega znanega koraka z
  vnosi iz `R.log` (to traja < 50 ms) — tako ni treba pošiljati celotnega fizikalnega stanja. Napiši test: rekonstrukcija
  iz (seed, log, korak) da iste položaje kot neprekinjena dirka. Pazi: `botBrain` ima notranje stanje (`last`) —
  rekonstrukcija mora brain poklicati enako kot original (deterministično, ker jih kliče `stepRace`).
- Sunek, ki pride pozno, host doda v trenutni korak (ne v preteklost). Ohlajanje in 3 sunke preverja `applyNudge`.
- **Ponovna povezava:** osvežitev → `joinRoom(hub.roomFromUrl())` → `hello { req: true }` → host pošlje `full` → igralec
  ima svoj kupček, stave in sunke. Igralec, ki je odsoten med stavami, ne stavi (kupček ostane).
- **Pridružitev med večerom:** kot opazovalec do naslednje dirke, nato s kupčkom 1000 (ali povprečjem — odloči in zapiši).
- Med dirko se v bazo ne piše. Brez lastnih tabel.
- Supabase realtime: največ ~16 sporočil/s s hosta (glej `games/rusilec/net.js`).

## Moduli (predlog)

`net.js` (kodiranje posnetkov, dnevni red sporočil, rekonstrukcija), `party.js` (čisto stanje večera: kupčki, stave,
faze, časi; testi), `phone.js` (UI telefona), `tv.js` (HUD hosta) — `game.js` ostane vhod (solo / party).

## Testi

- Rekonstrukcija dirke iz (seed, log, korak) = neprekinjena dirka (položaji, vrstni red).
- `party.js`: stave več igralcev hkrati, časovna omejitev, posojilo, pozen sunek, igralec brez stav, konec večera.
- Kodiranje/dekodiranje posnetka (`snap`) brez izgube nad 1 cm.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri (sobe, `ui.lobby`, prenos hosta).
3. `games/frnikole/README.md` in kodo `games/frnikole/` (`race.js`, `odds.js`, `bets.js`, `bots.js`, `game.js`).
4. `games/rusilec/README.md` (omrežni protokol, TV, prenos hosta) in `games/rusilec/net.js`, `games/reakcija/` (lobby).

### Tehnično
- Igra v `games/frnikole/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `import { hub, ui } from '../../shared/hub.js'`; sobe: `hub.createRoom`, `hub.joinRoom`, `hub.roomFromUrl`, `ui.lobby`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (enkrat na igralca). Igralce
  prikazuj z `ui.who(p)` / `ui.avatar(p)` (p iz `room.players`, z `equipped`).
- Host preverja pravila in mora preživeti **prenos hosta** (`hostChanged`); stanje redno pošilja vsem.
- Čisto logiko v ločene module brez DOM-a in teste v `tests/frnikole.js`.
- Telefon (portret, 375 px; veliki gumbi, `touch-action: manipulation`, brez hover-only) in TV/namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri (host in klienti), v Krogli, v Rušilcu in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi, tudi solo Dirke frnikol, nespremenjeni).
4. Multiplayer v **offline načinu** (`?offline=1`) v **2–3 zavihkih/oknih**: ustvari sobo, pridruži se s kodo in prek
   `?room=`, stavi z dveh telefonov, sunki z obeh, odigraj večer do konca, **odhod hosta sredi dirke** (dirka teče naprej
   pri novem hostu), **osvežitev igralca** med stavami in med dirko. Zavihke v ozadju brskalnik upočasni — uporabi okna.
5. Izgled na **telefonu (375×812)** in **TV/namizju**: posnemi zaslone, sam jih preglej in popravi.
6. `games.json`: `mode`, `players`, oznake, nove naloge (test sheme uspe).
7. Posodobi `PROGRESS.md` in `games/frnikole/README.md` (protokol, party pravila, TV).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati party, kaj ni bilo preverjeno in kaj je bilo
posodobljeno v `prompts/18-frnikole-stave.md`.
