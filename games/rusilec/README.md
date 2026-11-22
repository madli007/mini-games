# Rušilec (`games/rusilec/`)

Party arena Hrčkove krogle: 2–8 hrčkov v kroglah na plošči nad prepadom. Izrini prijatelje čez rob, preden poteče čas.
Vsak igra na svojem telefonu, host (ali »samo zaslon«) na TV-ju. Navdih je party način iz Hamsterballa; arene, pravila,
grafika in zvok so naši (arene temeljijo na lokacijah in temah prog iz `../krogla/levels/`).

Igra **ne kopira kode** krogle: uvaža `physics.js`, `level.js`, `render.js` (+ `render/`), `input.js`, `audio.js`,
`secrets.js` iz `../krogla/`. Singleplayer je nespremenjen (glej »Razširitev physics.js«).

## Kontrole

| Naprava | Premik | Sunek |
|---|---|---|
| Tipkovnica | puščice / WASD | preslednica ali Shift |
| Miška | krogla se kotali proti kazalcu | klik ali desni klik na areno |
| Telefon | virtualna palica levo spodaj | velik gumb **SUNEK** desno spodaj (krožna ura = ohlajanje) |

Vhod je relativen na kamero arene (gor = stran od kamere). Kamera je fiksna tričetrtinska (rahlo plava) in vedno pokaže
celo areno — na telefonu v portretu bolj od zgoraj in višje, da je prostor za kontrole. Lokalni multiplayer na eni
tipkovnici ni narejen.

## Pravila

- **Izriv:** ko krogla pade čez rob, točko dobi igralec, ki se je je **zadnji dotaknil v 4 s** (trk, sunek ali Odbijač).
  Brez dotika = **samomor** (−1 ali 0, nastavitev). Dvojni izriv (2 v 2 s), maščevanje (izriniš tistega, ki je izrinil
  tebe), **biljard** (krogla, ki si jo odbil, v 0,8 s izrine tretjo — točka je tvoja), hat-trick (3 v 10 s).
- **Sunek:** pospešek na 11,5 m/s v smeri vhoda, 0,38 s je krogla 2,6× težja; ohlajanje 3 s. Lahko se izklopi (»klasično«).
- **Ponovni prihod:** po 2 s na izhodišču, ki je najdlje od drugih krogel; 1,5 s neranljivost (utripa, ne trka).
- **Runda:** 2 / 3 / 5 min. Zadnjih 30 s je **finale**: robne ploščice (`finale.tiles`) se po vrsti krušijo (rdeč
  telegraf 0,7 s), glasba pospeši. Izenačenje na vrhu → **nagla smrt**: igrajo le izenačeni, brez ponovnega prihoda,
  krušijo se še `finale.sudden`, prvi izriv odloči (samomor izloči; po 45 s neodločeno).
- **Igra** = 1, 3 ali 5 rund; med rundami lestvica, host izbere naslednjo areno (sicer naključno/iz nastavitev, 14 s).
- **Načini:** Vsi proti vsem · **Ekipe** (rdeči/modri, izriv soigralca −1) · **Zadnji na plošči** (brez ponovnega
  prihoda, arena se ves čas krči, zadnji preživeli +2; izločeni so **duhovi**: premikajo 👻 in vsakih 8 s spustijo val vetra).
- **Twisti:** 👑 Zlati hrček (izriv vodilnega = 2 točki) · pobiralke vsakih ~12 s (🏋️ Utež 8 s, 🛡️ Odbijač 8 s,
  ❄️ Zmrzal — vsem drugim 3 s led, 🧲 Magnet 3 s; 1 s telegraf, ikona nad kroglo).
- **Boti** (0–7, Lahek / Srednji / Težek): vodi jih host; izbere tarčo blizu roba, se postavi na stran stran od roba in
  sune, ko je tarča med njim in robom. Izogiba se robu, kladivom in žagam, po otokih najde pot (BFS po ploščicah).
  Brez kozmetike in nagrad. **Vadba** (1 človek + boti) je v meniju.
- **Nagrade** ob koncu: Rušilec, Žilavec, Kamikaza, Maščevalec, Biljardist, Zadnji trenutek (le, če je en sam najboljši).
- **XP:** 20 za igro (z vsaj enim drugim človekom) + 5 na izriv (≤ 15) + 40 za zmago; vadba z boti 10 brez zmage.
  `hub.reportGame({ won, players: ljudje, score })` enkrat na igralca, dogodki `rusilec:izriv` (×izrivi), `rusilec:zmaga`,
  `rusilec:arena` (×arene), `rusilec:nagrada`. Dosežki: `prvi-izriv`, `zmaga` (≥ 3 ljudje), `hat-trick`, `nedotakljiv`,
  `biljard`, `mascevanje`, `vse-arene`, `kljucavnica`, `osem`, `zadnji-trenutek`.

## Arene in skrite ključavnice

| # | Arena | Lokacija | Posebnost |
|---|---|---|---|
| 1 | Ring | vrt | okrogla ravna plošča |
| 2 | Cvetlični lonec | vrt | skleda na sredini, ozki cvetni listi |
| 3 | Krožnik | kuhinja | izbočena tla (negativna `bowls.depth`), vse drsi proti robu |
| 4 | Pult | kuhinja | premične deske odpirajo luknje |
| 5 | Tekoči trak | tovarna | trakovi ob robu vlečejo ven, dve kladivi na sredini |
| 6 | Drsališče | led | led povsod, vzmeti v kotih |
| 7 | **Vrtiljak** (skrivna) | neon | vrtljiva plošča, dve žagi na tirnici okoli roba |
| 8 | **Oblak** (skrivna) | nebo | štirje otoki s klančinami, ventilatorji, sredinski otok se ob finalu potopi |
| 9 | Nemogoče | ognjeni prepad | zelo majhna plošča |

Skrivni areni odkleneš s **skrito ključavnico** v Hrčkovi krogli (`../krogla/secrets.js`): Neon — slepa stranska pot
desno od široke ploščadi; Nebo — spodnji levi vogal ploščadi pred trakovi. Ključavnica je komaj vidna, ni v JSON-u proge
in ne v fiziki (ne vpliva na čas, medalje, ghoste, autopilot). Pobrana v kateremkoli načinu → dosežek
`krogla:kljucavnica-<arena>` (velja na vseh napravah) in toast. V lobbyju je skrivna arena na voljo, če jo je odklenil
**vsaj en igralec v sobi** (vsak pošlje seznam v sporočilu `hello`), sicer je siva z namigom.

## Format aren (`arenas/NN-ime.json`)

Isti format kot proge (`../krogla/README.md`), brez `start`, `goal`, `checkpoints`, zvezdic, medalj in `timeBonus`.
Dodatno:

```jsonc
{
  "id": "01-ring", "name": "Ring", "desc": "…", "look": "garden", "theme": { … },   // look = lokacija iz render/looks.js
  "secret": false, "hint": "Najdi skrito ključavnico na progi Neon",                // hint obvezen pri secret: true
  "size": [W, D], "map": [ … ], "hmap": [ … ],
  "spawns": [[x, z], …],                     // vsaj 8, na tleh, med seboj ≥ 1,5
  "finale": {
    "tiles": [[c, r], …],                    // finale: krušijo se po vrsti v 26 s (morajo biti 'x')
    "sudden": [[c, r], …]                    // nagla smrt: po 0,7 s ena
  },
  "movers"/"spinners"/"springs"/"fans"/"bowls"/"hammers"/"enemies"/… : kot pri progah
}
```

Ploščice, ki se lahko krušijo, so `x` (padajoče); v areni se ne sprožijo ob dotiku, le po razporedu finala, in ostanejo
zrušene. Validator `validateArena` (`arena.js`) uporabi `validateLevel` in preveri še izhodišča (na tleh, ne preblizu
roba, razmik, vsaj 8), finale (le `x`, brez podvajanj, vsaj eno izhodišče preživi) in `secret`/`hint`.
Sovražniki in ovire so deterministični iz časa runde, zato jih host in klienti izrišejo enako brez pošiljanja.

### Kako dodati areno

1. V `tools/rusilec-arenas.mjs` dodaj `def({ id: '10-ime', name, from: '<proga za temo>', look, desc }, () => { … })`:
   `grid(W, D, (c, r, x, z) => ['.', višina] | null)`, `rimTiles(...)` za robne plasti, `markFall(...)`, izhodišča
   (`ringSpawns`), ovire. Ali pa JSON napiši ročno.
2. `node tools/rusilec-arenas.mjs` — zapiše JSON in `arenas/index.json`, validira.
3. `node tests/run-node.mjs` — validator na vseh arenah in test bota (Srednji v 60 s ne pade sam več kot 2× in izrine pasivnega).
4. Urejevalnik prog (`../krogla/editor.html`) aren ne zna urejati (ni narejeno).

## Moduli

| Datoteka | Vsebina |
|---|---|
| `match.js` | čista simulacija runde (točke, pripisovanje, ponovni prihod, finale, nagla smrt, ekipe, Zadnji na plošči, duhovi, pobiralke s seedom, serializacija za prenos hosta), igra z več rundami, nagrade, XP |
| `collide.js` | trki krogla–krogla (3D, impulz z maso, »bonk« pri hitrosti), sunek, masa, Odbijač |
| `bots.js` | boti (tarča, obkrožanje, sunek, rob, ovire, BFS pot) |
| `net.js` | kodiranje posnetkov, vhod, ura hosta, interpolacija, popravek napovedi, zanesljivi dogodki |
| `arena.js` | nalaganje, validator, geometrija (razdalja do roba, tla) |
| `texts.js` | 29 napisov za killfeed (12 izrivov, 8 samomorov, 3 izrivi soigralca, 6 oznak) |
| `view.js` | `ArenaRenderer` (podrazred `Renderer` krogle): več krogel, obroči, imena, puščica, krona, ikone, pobiralke, duhovi, fiksna kamera |
| `sound.js` | `ArenaAudio` (podrazred `Audio` krogle): bonk, sunek, izriv, finale, glasba s tempom |
| `game.js` | meni, lobby (`ui.lobby` + nastavitve), stanja, host/klient zanka, prenos hosta, HUD, nagrade |

### Razširitev `../krogla/physics.js`

Le dodane funkcije, `step` (singleplayer) je nespremenjen: `makeBody`, `advanceWorld`, `groundY`, `stepBody` (korak
poljubnega telesa s hladom na telo), zastavica sveta `permFall` (zrušena ploščica se ne vrne) in `b.forceSurf`
(Zmrzal). Testi singleplayerja ostanejo enaki.

## Omrežni protokol (host-authoritative)

Host simulira vse pri 120 Hz (`STEP`): fiziko, trke, izrive, točke, pobiralke, bote, uro. Klienti ne odločajo o ničemer.

| Sporočilo | Kdo → komu | Vsebina |
|---|---|---|
| `hello` | vsak → vsi | `{ sk: skin krogle, tv, un: odklenjene arene, req }` (`req` = prosim, pošljite svoj hello) |
| `in` | klient → host | `{ s, x, z, d }` smer v svetu −127..127, `d` = števec pritiskov sunka; ob spremembi ≤ 20×/s, sicer vsakih 400 ms |
| `snap` | host → vsi | 15×/s: `{ s, t, d: base64(Int16 × 9 na kroglo), pk: pobiralke, gu: duhovi, ev: novi dogodki }` (~300 B za 8 krogel) |
| `full` | host → vsi | 1×/s in ob spremembi faze: igra, runda, arena, ekipe, skupne točke, `M` = polno stanje runde (`serializeMatch`), `evq` |
| `resync` / `evs` | klient → host / host → klient | vrzel v zaporednih številkah dogodkov → host pošlje manjkajoče (`EventLog.since`) in polno stanje |
| `pickArena` | host → vsi | izbrana naslednja arena (med rundami) |

Dogodki (izriv, samomor, trk, sunek, pobiralka, finale, nagla smrt …) imajo zaporedno številko `q` in potujejo v
posnetkih; klient (`EventSink`) jih predvaja po vrsti in ob vrzeli zahteva `resync`. Host ne pošilja več kot ~16
sporočil/s (Supabase realtime: 20 na klienta).

- **Tuje krogle** se interpolirajo z zamikom 100 ms (`Interp`, `HostClock`). **Svoja krogla** se napoveduje lokalno z
  isto fiziko in se ob vsakem posnetku mehko popravi (22 % napake; ob trku takoj prevzame hitrost hosta; nad 1,6 m skok).
- **Prenos hosta:** ob `hostChanged` nov host obnovi rundo iz zadnjega polnega stanja, popravljenega s položaji iz
  zadnjega posnetka (`restoreMatch`); runda teče naprej, boti tudi; zaporedne številke dogodkov se nadaljujejo. Toast »Novi host: …«.
- **Ponovna povezava:** osvežitev → `joinRoom(roomFromUrl)` → `hello` → host pošlje polno stanje → igralec je spet v
  svoji krogli s svojimi točkami. Odsoten > 20 s se umakne iz arene (točke ostanejo, v lestvici je zatemnjen).
- **Pridružitev med igro:** soba med igro ostane v statusu `lobby` (host jo po začetku vrne), zato se lahko kdo
  pridruži; počaka kot opazovalec in je zraven od naslednje runde (do 8 krogel).
- **TV:** »📺 Samo zaslon (TV)« v lobbyju (ali `?tv=1`): naprava je opazovalec brez krogle, večja lestvica in killfeed,
  ob izrivu kratek slow-mo (le na TV-ju/opazovalcih, ne na telefonih igralcev).
- Med igro se v bazo ne piše; lastnih tabel ni.

Razvojni parametri: `?dev=1` (`window.__ru`, FPS, v lobbyju runda 30 s), `?q=low|medium|high|ultra`, `?tv=1`.
