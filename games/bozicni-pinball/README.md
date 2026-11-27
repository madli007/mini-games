# Božični pinball — *Trije dobri možje*

Snežna decembrska miza za MINI GAMES hub: Miklavž s parklji, Božiček s sanmi in dimnikom, Dedek Mraz z novoletno
jelko. Igra **uvaža motor** iz `../pinball/src/engine/` (fizika, jedro, izris, DMD, zvok, UI, lestvica) — tu je le miza:
geometrija, pravila, grafika in besedila. Vse je proceduralno (canvas/WebGL), brez slikovnih datotek.

- Zagon: <http://localhost:8124/games/bozicni-pinball/> (`?offline=1` offline hub, `?debug=1` sloj za uglaševanje,
  `?debug=shots` mapa strelov). Iz Alu mize: gumb »🎄 Božična miza«; tu gumb »Alu miza«. `games/pinball/?miza=bozic`
  preusmeri sem (lestvica mora biti pod `bozicni-pinball`).
- Lestvica prek huba po uporabniku: `gameId = bozicni-pinball`, `seed = miza:bozic:f<PHYSICS_VERSION>` (zdaj `miza:bozic:f3`).
- Orodja (iz korena repoja): `node tools/pinball-shots.mjs bozic --korak=1`, `node tools/pinball-bot.mjs bozic 200`,
  testi `node games/pinball/tests/run-node.mjs` (sklop »božična«).

## Kontrole

| Vnos | Akcija |
|---|---|
| Z / ← / levi Shift | levi flipper |
| M / → / desni Shift | desni flipper **in zgornji flipper »Kepa«** |
| Presledek / ↓ (drži in spusti) | izstrelitev; **drži levi flipper med izstrelitvijo = super skill shot** |
| B / ↑ | tresenje (TILT po 2 opozorilih) |
| P / Esc · O · Enter | pavza · zvok · začni igro |
| Dotik | leva/desna polovica = flipperja · povleci navzdol spodaj desno = plunger · ⇡ tresenje · ❚❚ pavza |

Pred izstrelitvijo flipperja premikata utripajoči skill shot kanal. Na začetnem zaslonu in v pavzi je **»? MAPA STRELOV«**
(prekrivna mapa vseh strelov s puščicami, imeni in legendo barv). V nastavitvah je stikalo **»Sneženje nad mizo«**.

## Postavitev (pahljača strelov, od leve)

| Strel | Element | Podaja (feed) | Funkcija |
|---|---|---|---|
| **Sankališče** (levi orbit) | orbit ob levi steni, **spinner »SANI«**, v kanalu **Dimnik** (luknja, ki se odpre) | čez vrh in desni orbit → desni inlane | combo, jackpot, kickback (spinner) |
| **Dimnik** | VUK v Sankališču: odprt, ko je prižgan lock | podzemno na levi inlane | **lock v vrečo** (3 mesta, vidno) |
| **Parklji** | drop banka 3 (P·A·R) levo od centra | — | odpre Dimnik (lock), add-a-ball med multiballom |
| **Smučka** (leva rampa) | ledena žičnata rampa s trakovi sladkornih palčk, prečka mizo | **desni inlane** | combo, jackpot, štetje ramp |
| **Jelka** (center) | ozek kanal do ujete žogice **Okrasek**, za njo jelka (igrača) | sredina (tvegano) | lučke jelke, **super jackpot** |
| **Vlakec igrač** (desna rampa) | rdeča plastična rampa s tiri in vlakcem | **levi inlane** | combo, jackpot |
| **Desni orbit** | kanal ob plungerju, v njem **nabiralnik »Pisma«** (luknja, ki se odpre) | čez vrh, vrata → kanal → levi inlane | combo, jackpot |
| **Pisma** (nabiralnik) | VUK v desnem orbitu: odprt, ko je prižgano pismo ali extra ball | podzemno na levi inlane | pismo (prompt 24: načini), extra ball |
| **Kepa** | tarča zgoraj desno, doseže jo le **zgornji flipper** | — | super skill shot, combo |
| Z·V·O·N | 4 rollover kanali na vrhu (lane change) | bumperji | skill shot, **bonus ×2 … ×6** |
| Snežaki | 3 pop bumperji v zgornjem levem žepu | — | točke |
| Adventni venec | 4 standupi (sveče): 2 ob rampah, 2 ob jelki | — | mystery (prompt 24), pismo |

Spodaj »italijansko dno« iz Alu mize (slingi »Sankač«, inlani, outlani, flipperji); vrh vodil med inlanom in outlanom je
13 px bližje sredini (več žogic v outlane, glej »Občutek«). Kickback »Sankač« v levem outlanu, ball save »Angelček« (S).

**Zakaj sta Dimnik in Pisma v orbitih:** merilec strelov je pokazal, da so streli med centrom in orbitoma pri tej geometriji
flipperjev hitro »prepihani« (okno 4–10 ms, kot Alu livarna 1–7 ms). Luknja v kanalu orbita, ki se odpre le, ko je na
voljo nagrada, ima okno orbita (≈ 54 ms), zaprta pa ne zmoti pretoka (flow).

## Pravila (prompt 23)

- **Skill shot:** izstrelitev v utripajoči kanal Z·V·O·N → 150.000 (vsak naslednji +50.000).
- **Super skill shot:** drži **levi flipper** med izstrelitvijo → up-post na vrhu desnega orbita ustavi žogico (fiksna moč),
  pade na zgornji flipper **Kepa**; v **3 s** zadeni **Kepo** → 1.000.000.
- **Ball save** 10 s po izstrelitvi, **kickback** v levem outlanu (spinner ga znova napolni vsakih 40 obratov),
  **tilt** (2 opozorili), **ball search**, **bonus** ob koncu žogice × bonus X (Z·V·O·N).
- **Darilni multiball:** Parklji (vse 3) → **Dimnik odprt** (zelena puščica Sankališča) → zadeni Sankališče: darilo (žogica)
  ostane v **vreči**, nova pride v plunger. Pri prvem multiballu ostane dimnik odprt za vse 3 locke, pozneje vsak lock
  znova odprejo Parklji. **3 darila → multiball s 3 žogicami** (ball save 15 s).
  - **Jackpot** (rdeče puščice) na obeh rampah in obeh orbitih (500.000, +100.000 po zadetku, +250.000 na naslednji multiball).
  - Vsi 4 → **super jackpot v Jelki** (zlata puščica, zvezda): 3× jackpot, nato se jackpoti znova prižgejo.
  - **Add-a-ball** enkrat: Parklji med multiballom.
- **Combo:** zaporedni veliki streli (Sankališče, Smučka, Jelka, Vlakec, desni orbit, Kepa) v 4 s → 25.000 × (n − 1), DMD
  »COMBO ×n«, bele puščice utripajo, dokler je okno odprto.
- **Extra ball** (oranžna): po **10 rampah** se prižge v nabiralniku (desni orbit).
- **Pisma:** pismo je prižgano na začetku in po 4 rampah (pozneje več) ali po adventnem vencu → v nabiralniku nagrada in
  »PISMA KMALU« (kljuka za načine v promptu 24).
- **Jelka:** vsak zadetek Okraska prižge lučko (9), vse → »JELKA OKRAŠENA« (250.000 × krog), zvezda zasveti.
- **Adventni venec:** 4 sveče → 50.000, prižge mystery (adventni koledar, prompt 24) in pismo.

### Legenda vstavkov (dosledno na celi mizi)

| barva | pomen |
|---|---|
| rdeča | multiball / jackpot |
| zlata | super jackpot (in wizard, prompt 24) |
| zelena | lock (Dimnik odprt) |
| oranžna | extra ball |
| vijolična | mystery (adventni koledar) |
| bela | combo (utripa = combo okno je odprto) |
| srebrna | pismo v nabiralniku |
| barva načina | strel v aktivnem načinu (Miklavž modro-bela, Božiček rdeča, Dedek Mraz modro-srebrna — prompt 24) |

Utripajoča puščica = na voljo zdaj, sveti = prižgano / napredek. Ob puščicah so manjši vstavki (J jackpot, C combo, L lock,
✉ pismo, EB extra ball, ? mystery, ★ super jackpot). Na predpasniku: kartica pravil levo, legenda desno.

## Grafika

Nočna snežna pokrajina (zvezde, luna, severni sij, gozd, vasica s prižganimi okni, cerkvica), zameti, zaledenel ribnik
(prosojen potisk → brušena kovina motorja se vidi kot led), ivje v vogalih stekla. Rob iz rdečega laka z zlato letvijo,
vodila kot sladkorne palčke, zlate letve centra, snežne kape na slingih, bodika. Jelka s tremi plastmi, lučkami po
napredku in zvezdo z bloomom; snežaki (bumperji z obrazi); dimnik iz opeke z dimom in ognjem (shader), iskre in tresenje
zraka nad njim; prosojna vreča z zaklenjenimi žogicami; pokrova lukenj (zaprto / odprto žari); vlakec odpelje po rampi;
sani z jeleni (Rudolfov nos) med multiballom; subtilno sneženje (manj na nižji kakovosti, izklopljivo). Backbox: lesen
okvir z girlando, DMD v toplih barvah z ilustracijo treh dobrih mož nad vasjo (attract).

## Občutek (meritve, fizika f3)

### Mapa strelov

`node tools/pinball-shots.mjs bozic --korak=1` — 2526 vzorcev, luknji v orbitih zaprti. Okno = skupni čas (ms), v katerem pritisk
zadene strel; žogica iz inlana: −120 … +380 ms okoli prihoda na flipper, cradle: od spusta 0–380 ms.

| flipper | začetek | strel | okno skupaj (ms) | najdaljše okno (ms) | vrnitev žogice (število vzorcev) | hitrost (px/s) |
|---|---|---|---:|---:|---|---:|
| levi | iz inlana | Desni orbit · ✉ | 55 | 52 | levi flipper 35, desni flipper 18, outlane desno 2 | 2166 |
| levi | iz inlana | Jelka | 17 | 7 | desni flipper 9, levi flipper 8 | 97 |
| levi | iz inlana | Adventni venec | 10 | 4 | desni flipper 8, levi flipper 2 | 0 |
| levi | iz inlana | Smučka | 9 | 5 | desni flipper 9 | 1079 |
| levi | iz inlana | Vlakec igrač | 9 | 5 | levi flipper 9 | 1074 |
| levi | iz inlana | Sankališče · Dimnik | 2 | 1 | levi flipper 2 | 632 |
| levi | cradle | Smučka | 48 | 17 | desni flipper 48 | 1499 |
| levi | cradle | Vlakec igrač | 18 | 18 | levi flipper 18 | 1675 |
| levi | cradle | Jelka | 15 | 6 | desni flipper 11, levi flipper 4 | 59 |
| levi | cradle | Parklji | 14 | 8 | levi flipper 8, desni flipper 4, outlane levo 2 | 325 |
| levi | cradle | Adventni venec | 11 | 4 | desni flipper 5, levi flipper 4, outlane levo 2 | 0 |
| levi | cradle | Desni orbit · ✉ | 3 | 3 | desni flipper 3 | 901 |
| desni | iz inlana | Sankališče · Dimnik | 55 | 53 | desni flipper 53, levi flipper 2 | 2141 |
| desni | iz inlana | Jelka | 12 | 7 | desni flipper 12 | 90 |
| desni | iz inlana | Parklji | 11 | 6 | levi flipper 7, desni flipper 4 | 2999 |
| desni | iz inlana | Smučka | 9 | 5 | desni flipper 9 | 1071 |
| desni | iz inlana | Vlakec igrač | 8 | 4 | levi flipper 8 | 1610 |
| desni | iz inlana | Desni orbit · ✉ | 3 | 3 | desni flipper 3 | 676 |
| desni | iz inlana | Adventni venec | 2 | 1 | levi flipper 2 | 0 |
| desni | cradle | Vlakec igrač | 37 | 14 | levi flipper 37 | 1433 |
| desni | cradle | Desni orbit · ✉ | 27 | 12 | desni flipper 27 | 661 |
| desni | cradle | Smučka | 18 | 18 | desni flipper 18 | 1657 |
| desni | cradle | Adventni venec | 17 | 5 | desni flipper 12, levi flipper 5 | 0 |
| desni | cradle | Jelka | 14 | 6 | desni flipper 8, levi flipper 6 | 140 |
| desni | cradle | Parklji | 3 | 2 | levi flipper 3 | 496 |

Zgornji flipper (žogica pade nanj kot pri super skill shotu, ločena meritev): **Kepa 302 ms** od 602 ms preleta.

**Kaj kaže:**
- **Orbita** sta »pozna« strela z nasprotnega flipperja (žogica na konici): **55 ms**. Sankališče se v 96 % vrne na desni flipper
  (čez vrh in desni kanal v desni inlane). Desni orbit: 64 % na levi flipper (vrata → kanal → levi inlane), 33 % na desni —
  počasnejše žogice ne obkrožijo vrha in se po desnem kanalu vrnejo v desni inlane (cilj ≥ 85 % ni dosežen).
- **Rampi** sta na črtah strelov iz cradla: **Smučka 48 ms z levega**, **Vlakec 37 ms z desnega** cradla; obe v 100 % podata na
  nasprotni flipper (flow: levi cradle → Smučka → desni flipper → Vlakec → levi flipper …). Iz inlana sta težji (8–9 ms).
- **Jelka** (center) je namenoma ozka: 12–17 ms z vsakega začetka, odboj od Okraska je tvegan (sredina).
- **Parklji** 11–14 ms, **Dimnik/Pisma** = okno orbita, ko je luknja odprta. Zavrnitve ramp: šibki streli (< 1100 px/s) iz zgodnjega pritiska.

### Bot (200 iger)

`node tools/pinball-bot.mjs bozic 200` (fizika f3, semena 1000 + 17·i):

| mera | vrednost | cilj (prompt 23) |
|---|---:|---|
| povprečna igra | 210.6 s (3.5 min) | 3–7 min ✓ |
| povprečna žogica | 55.9 s | 50–120 s ✓ |
| outlane (od vseh drainov) | 47.6 % | 35–55 % ✓ |
| sredina (od vseh drainov) | 50.3 % | 20–40 % ✗ (Alu: 56 %) |
| ball search na igro | 0.69 | ≤ 2 ✓ |
| pobegi iz mize | 0 | 0 ✓ |
| povprečne točke | 18.449.421 | podobno Alu (bot 25 mio v 9 min) |
| multiballi / igro | 1.14 | — |
| jackpoti / igro | 5.36 | — |
| rampe / igro | 45.9 | — |
| strele na minuto | 27.7 | — |

Cilja za outlane in sredino hkrati nista dosegljiva: drugih drainov skoraj ni (vsota ≈ 98 %). Vrh vodil med inlanom in outlanom
(63 / 502 namesto Alu 50 / 515) je izbran kot kompromis: z Alu vodili je bilo 81 % po sredini in 19 % v outlane, z 64 / 501
42 % / 57 %, a žogica le še 50 s. Bot ne nudge-a pametno in ne lovi žogic (»live catch«), zato je sredina pri njem višja kot pri igralcu.

## Struktura

```
index.html            kopija ../pinball/index.html (CSS ../pinball/src/style.css + style.css), startApp(table, view, { gameId })
style.css             ohišje: les, rdeč lak, zlato, girlanda na backboxu
table/index.js        modul mize { id: 'bozic', CFG, PAL, buildTable, Rules, view, achievements, events }
table/config.js       CFG (ravnotežje, sporočila), PAL (legenda barv), SHOTS (imena strelov)
table/table.js        geometrija (createTable iz motorja), rampi (Catmull-Rom poti), vstavki
table/rules.js        BozicRules (extends Rules): skill shot, super skill, lock/multiball, jackpoti, combo, extra ball …
table/art.js          proceduralna grafika (tla, dvignjeni elementi, rampi, igrače, sneženje)
table/view.js         DMD (ilustracija, napisi), UI (paneli, pomoč, stikala, povezave)
```
Testi: `games/pinball/tests/bozic.js` (v `tests.js` → `runAll`).

## Hub

`hub.submitScore` (motor), `hub.awardXp`, `hub.reportGame({ players: 1, score })`. Dosežki: **prvi-multiball**,
**super-jackpot**, **super-skill**, **combo-5**. Naloge (`games.json`): odigraj igro, 5.000.000 točk, super jackpot,
tedenska 3 darilni multiballi (dogodka `bozicni-pinball:multiball`, `bozicni-pinball:superjackpot`).

## Kljuke za prompt 24

`rules.mode` (null), `startMode()`, `musicLevel()` (1 igra, 2 način, 3 multiball), `mysteryLit` (venec), `onPisma()` →
tu se začnejo načini (zdaj nagrada + »Pisma kmalu«), `letterLit` / `lightLetter()`, `onVenecComplete()`,
`trainT` (vlakec), igrača `jelka` (`game.moveToy('jelka', { angle })`), sani v `art.drawSleigh`.
