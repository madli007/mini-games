# Prompt za AI agenta: Gneča — dvoboj 1v1 online, 2v2, Tovarna in Zima, trgovina (2. del)

> **Stanje:** ⬜ čaka — lahko takoj (predpogoj 40 je narejen)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/44-gneca-dvoboj.md in ga v celoti izvedi.«**
>
> Ozadje: točka 62 v `PREDLOGI-IGER.md`. 1. del (prompt 40) je naredil solo igro: kampanja 20 nivojev, delavnica,
> dnevni nivo, napredek online. Ta del doda **multiplayer**, dva nova sklopa in kozmetiko. **Ime, liki, nivoji, grafika,
> napisi in zvok ostanejo naši**: ne posnemaj nobene obstoječe igre.

---

## Kaj že obstaja (1. del — preberi, preden začneš)

- `games/gneca/README.md` (kontrole, pravila vrat, format nivoja, moduli, `balance.js`) in sekcija Gneča v `PROGRESS.md`.
- **Simulacija** `sim.js`: `createState(level, { seed, params })`, `step(st, { tx, fire, giant })`, `hashState(st)` (FNV, 8 hex),
  `addUnit(st, 'me'|'en', x, z, hp, kind)`, `timeLeft(st)`. Strani sta `st.me` in `st.en`: gosta tipizirana polja
  (`x, z, r, hp: Float32Array`, `kind: Uint8Array` 0 tekač / 1 velikan, `mask: Uint32Array` uporabljena vrata, `ph`), `n` živih,
  odstranjevanje z zamenjavo z zadnjim (`compact`). Naključje je mulberry32 v `st.rs` (začetek iz `shared/util.js` `rng(seed)`).
  Koordinate: `x` levo–desno, `z` od mojega topa (0) do sovražnega stolpa (`L.length`). Vrata delujejo **samo na `st.me`**.
  Sovražni valovi so urnik v nivoju (`expandWaves`), sovražnik nima topa.
- **Dogodki** `st.events` (`shot, pop, clash, minus, cut, tower, zap, giant, egiant, turretdown, wave, gatechange, gatespent,
  breach, win, lose`) bere `render.js`/`audio.js`; igra jih počisti po sličici.
- `grid.js` (`Grid.build/query`, celice 1×1), `level.js` (`normalizeLevel`, `validateLevel`, `expandWaves`, `MAX_GATES` 32),
  `score.js` (`scoreOf`, `starsOf`, `resultOf`, `gearsFor`), `autopilot.js` (`pathValue`, `createAutopilot`), `daily.js`
  (`dailyLevel(seed)`, `DAILY`), `upgrades.js` (`UPGRADES`, `paramsFor`, napredek: `newProgress`, `sanitizeProgress`,
  `recordLevel`, `isUnlocked`, `newerProgress`), `render.js` (`Renderer`: `load(st)`, `events(st, evs)`, `frame(st, dt)`,
  `setQuality`, `showGrid`, `info`), `render/figures.js` (`Crowd`, `InstancedMesh` telo + oči, `facing` 0 ali π),
  `render/lane.js` (`buildLane`, `Tag`, `labelTexture`), `render/fx.js`, `render/looks.js` (`LOOKS`, `SIDE`), `input.js`
  (`Input.sample(dt)`), `audio.js`, `ui-game.js` (`renderMenu`, `Hud`, `debugPanel`, `resultHtml`, `ACH`), `game.js`.
- **Napredek online:** `hub.loadSave()` / `hub.writeSave(data, { rev })` → Supabase `gneca_saves` (`supabase/games/gneca.sql`).
- Nivoji `levels/index.json` (sklopa `puscava`, `kanjon`) in `levels/<id>.json`. Format:
  `{ id, name, set, theme, length, width, time, towerHp, boss?, hint, gates:[{x,z,w,op:'+'|'x'|'-'|'/',v,move?:{amp,speed,phase},
  change?:{after,to,op?}}], obstacles:[{type:'fence'|'roller'|'saw',x,z,w,d,r,amp,speed,phase}], turrets:[{x,z,hp,rate,range}],
  waves:[{t,n,every,until,grow,giant,hp}], stars:[meja2, meja3] }`. Teme: `puscava`, `kanjon` (`THEMES` v `level.js`).
- **Uglaševanje:** `node tools/gneca-tune.mjs [--write] [id…]` (HP stolpa 200 + 35 × indeks, šef 1200; bisekcija moči valov do
  ciljnega časa avtopilota s pričakovanimi nadgradnjami; meje zvezdic iz istih tekov).
- **Izmerjeno:** simulacija 600 + 600 = 0,27 ms/korak (Node); izris na namizju (RTX 5080) 0,35–0,54 ms/sličico. **Ni izmerjeno:**
  FPS na pravem telefonu in v vidnem podoknu (podokno je bilo skrito). Ročno igranje je bilo le s skriptnim korakanjem.
- Dnevni nivo: avtopilot s fiksnimi nadgradnjami zmaga 195/200 seedov.

---

## Igra (2. del)

### Dvoboj 1v1 online (`mode` v `games.json` → ostane `single` za solo; dodaj `players.max: 4` in oznako `pvp`)
- **Vsak top na svojem koncu iste steze:** igralec A spodaj (z = 0), B zgoraj (z = L). Ni sovražnega stolpa: vsak brani
  svoj top/stolp (HP npr. 150). **Vrata na sredini veljajo za obe strani** (vsaka stran ima svojo masko; `−`/`+` zaloga je
  skupna ali po strani — odloči in zapiši). Sovražni valovi odpadejo (lahko so »nevtralni« valovi iz sredine, neobvezno).
- Simulacijo razširi za **dva topa** (`st.cannons[2]`, vrata in ovire za obe strani, zrcaljena smer), ne da bi pokvaril solo
  (testi 1. dela morajo ostati zeleni; solo = posebni primer).
- **Determinističen lockstep:** pošiljajo se le ukazi `premik` (ciljni x, kvantiziran na 0,01), `strel` (začetek/konec),
  `velikan`. Tick 60 Hz, ukaz velja za tick `t + zamik` (npr. 4). Vsak klient simulira sam. **Hash stanja** (`hashState`) vsakih
  60 tickov; ob razhajanju host pošlje **posnetek** (serializiraj tipizirana polja → base64) in klienti se ponastavijo nanj.
- **Prenos hosta** (`hostChanged` → nov host nadaljuje iz zadnjega posnetka) in **ponovna povezava** (osvežitev → `joinRoom` →
  zahteva posnetek). Vzorec in podrobnosti: `prompts/26-lane-wars.md` (lockstep, hash, posnetek).
- Lobby z `ui.lobby` (izbira steze iz posebnih nivojev za dvoboj `levels/duel/*.json`, npr. 4 steze), odštevanje `ui.countdown`.
- Nadgradnje v dvoboju so **fiksne** (kot dnevni nivo), da je pošteno.

### 2v2
- Dva topa na strani (levo in desno polovico steze), skupen stolp ekipe. Isti lockstep (4 igralci). Ekipe v lobbyju.

### Dva nova sklopa kampanje (vsak 10 nivojev s šefom)
- **3 Tovarna:** tekoči trakovi (nova ovira `belt`: premakne tekače bočno), stiskalnice (ritmično ubijejo), vrata, ki se
  odpirajo in zapirajo; šef: stolp, ki menja vrata pred sabo.
- **4 Zima:** led (tekači drsijo: manj ločevanja, bočni zamah), snežne kepe (valjar, ki raste), zamrznjena vrata (odtajajo se po
  N prehodih); šef: ledeni velikani v valovih.
- Nove teme v `render/looks.js` (`tovarna`, `zima`) in `THEMES`; uglasi z `tools/gneca-tune.mjs` (nadaljuj krivuljo HP stolpa).
  Odklep: sklop 3 po šefu Kanjona.

### Predmeti v trgovini (samo videz)
- `shared/cosmetics.js`: `GAME_SLOTS.gneca = ['cannon', 'runner']`, predmeti v `GAME_ITEMS` (`kind: 'game', game: 'gneca'`):
  vsaj 6 barv/oblik topa in 8 kostumov tekačev (barva telesa, klobuček/čelada, oči), nekaj z odklepom prek dosežkov.
  Opremljanje `hub.equip('gneca.cannon', id)`, branje `hub.gameItem('gneca', 'cannon')`; v dvoboju se vidi nasprotnikova
  oprema (`cosmetics.gameItemOf(player.equipped, 'gneca', …)`). SQL blok: `node tools/shop-sql.mjs --write` (+ migracija).
- Barva strani ostane berljiva (moj/nasprotnik): kostum spremeni odtenek in dodatke, ne zamenja modre/rdeče.

### Hub
- Dosežki (vsaj 4 novi): `dvoboj` (zmaga v 1v1), `ekipa` (zmaga v 2v2), `tovarna`, `zima` (premagaj šefa), `obrat` (zmagaj
  dvoboj, ko je tvoj stolp pod 10 %).
- XP: dvoboj 25 + 50 za zmago; `reportGame({ won, players, score })` za vse igralce; `reportEvent('gneca:duel', 1)`.
- Naloge: m »Odigraj dvoboj v Gneči«, w »Zmagaj 5 dvobojev Gneče«.

### Testi (`tests/gneca.js` ali `tests/gneca2.js`, vključi v `tests/tests.js`)
- Determinizem dvoboja: isti seed + isti ukazi → isti hash po 5000 tickih; kloniranje stanja (posnetek → obnovitev → enak hash).
- Vrata za obe strani, simetrija (zrcaljeni vnosi → zrcaljen izid), 2v2 ekipe.
- Nove ovire (trak, stiskalnica, led, kepa, zamrznjena vrata), validacija novih nivojev, avtopilot zmaga vse nove nivoje z
  največjimi nadgradnjami; katalog trgovine = SQL (obstoječi test).

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri (tudi `loadSave`/`writeSave`, predmeti za igre).
3. `games/gneca/README.md` in sekcija Gneča v `PROGRESS.md`.
4. `prompts/26-lane-wars.md` — vzorec lockstepa, hasha in posnetka.

### Tehnično
- Igra v `games/gneca/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `import { hub, ui } from '../../shared/hub.js'`; Three.js ostane **0.160.0** (isti importmap).
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (enkrat na igralca).
- Napredek (nova sklopa, odklepi) ostane v istem zapisu `hub.writeSave` — **nič samo lokalno**.
- Multiplayer: stanje prek `room.send` (ukazi), ne v bazo za vsak tick; **prenos hosta** in **ponovna povezava**.
- Čisto logiko daj v ločene module brez DOM-a in dodaj teste v `tests/tests.js`.
- Telefon (portret, 375 px) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi).
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–4 zavihkih/oknih: 1v1 in 2v2 do konca, odhod hosta sredi igre,
   osvežitev igralca, **ni razhajanja hasha** (zapiši izmerjeno). Če je podokno brskalnika skrito, prosi uporabnika, naj ga pokaže
   (rAF v skritem podoknu teče ~1/s).
5. Ročno odigraj vsaj 2 nova nivoja vsakega sklopa in oba šefa; izgled na **telefonu (375×812)** in **namizju**; izmeri FPS.
6. `games.json`: posodobi vnos `gneca` (opis, `players`, oznake, nove naloge; test sheme mora uspeti).
7. Posodobi `PROGRESS.md`, `games/gneca/README.md` (lockstep protokol, novi elementi nivoja), korenski `README.md` in
   **stanje prompta**: vrstica na vrhu → ✅ s commitom, vrstica v `prompts/README.md` (in seznam »Kaj lahko poženem zdaj«),
   oznaka pri točki 62 v `PREDLOGI-IGER.md`.
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati dvoboj, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
