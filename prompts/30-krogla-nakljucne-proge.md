# Prompt za AI agenta: Hrčkova krogla — generator naključnih prog (preprosto + napredne nastavitve)

> **Stanje:** ✅ narejeno — commit `979824d` (26. 11. 2026); opcijska hitra naključna proga v meniju igre je narejena

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/30-krogla-nakljucne-proge.md in ga v celoti izvedi.«**
>
> Ozadje: Hrčkova krogla (`games/krogla/`) že ima **urejevalnik prog** (`editor.html`, prompt 06) z osnutki v
> `localStorage`, 3D predogledom, testno vožnjo, preverjanjem rešljivosti (autopilot), izračunom medalj, deljenjem
> s povezavo in objavo med »Proge skupnosti«. Uradne proge nastanejo v `tools/krogla-levels.mjs` z »želvico«
> (razred `Track`: `go`, `turn`, `gap`, `pocket`, `mark`, `add`, `wp` … in `finish(T, meta)`), ki sproti zapisuje tudi
> pot za autopilota (`route`). Ta prompt doda **generator naključnih prog v brskalniku**: igralec s klikom dobi novo,
> **zagotovo rešljivo** progo, ki se shrani kot osnutek in jo lahko potem poljubno ureja, igra, deli ali objavi.
>
> **Uradne proge, fizika, časi, medalje, ghosti, autopilot in obstoječi testi ostanejo enaki** (`node tools/krogla-levels.mjs --check`
> mora dati iste JSON-e, `node tests/run-node.mjs` zelen brez sprememb pričakovanih vrednosti).

---

## 1. Skupna želvica (refaktor brez spremembe vedenja)

- Razred `Track`, konstante (`D4`, `RAMP_UP`, …) in `finish` premakni iz `tools/krogla-levels.mjs` v nov modul brez
  Node odvisnosti, npr. `games/krogla/editor/track.js` (ali `games/krogla/track.js`). `tools/krogla-levels.mjs` ga uvozi.
- Preveri: `node tools/krogla-levels.mjs --check` → uradne proge bajtno enake kot prej.
- Če ima `tools/frnikole-tracks.mjs` svojo kopijo želvice, je **ne** združuj v tem promptu (le zapiši v README kot možnost).

## 2. Generator (`games/krogla/editor/generate.js`, čista logika)

`generateLevel(opts) → { L, seed, tries, report }` — deterministično iz semena (`rng` iz `shared/util.js`, mulberry32).
Isti `opts` + isti `seed` = ista proga (tudi med napravami → seme se da deliti).

**Kako gradi:** zaporedje **odsekov** (»gradnikov«), ki jih želvica izvaja eden za drugim; vsak gradnik doda ploščice,
objekte in točke poti za autopilota, da je proga rešljiva že po konstrukciji. Predlog gradnikov (vsak ima težavnost 1–5
in ga je mogoče izključiti):

| Gradnik | Vsebina |
|---|---|
| ravnina / zavoj | `go` + `turn`, širina 1–5 |
| klanec gor/dol | `go(n, { up / down })` |
| prepad / skok | `gap` z vzmetjo ali klancem pred njim |
| ozek most | širina 1, po želji brez robov |
| led / lepilo / valovi | `ch: 'i' | 'g' | '~'` |
| tekoči trak | `conv: 'F' | 'B'` (nazaj = težje) |
| padajoče ploščice | `ch: 'x'` |
| žep z zvezdico | `pocket` ob poti |
| premična plošča | `movers` + `wp({ mover, until })` |
| vrtiljak, kladivo, odbijači, ventilator, sklede | `spinners`, `hammers`, `bumpers`, `fans`, `bowls` |
| stikalo + vrata | `switches` + `doors` (pot gre najprej do stikala) |
| sovražniki | `bully`, `saw`, `wasp`, `vacuum`, `magnet` (deterministični, kot v uradnih progah) |

Obvezno na vsaki progi: start, cilj, **točno 5 zvezdic** (validator), kontrolne točke na približno vsakih N odsekov,
ure po nastavitvi, barvna tema (`themes.js`) in lokacija `look`. Proga se ne sme sekati sama s sabo (preveri zasedenost
mreže pred gradnikom; če se ne izide, izberi drug gradnik ali zavoj) in mora ostati v `MAX_W` × `MAX_D` (`editor/model.js`).

**Preverjanje:** po gradnji `validateLevel` + `runAutopilot`. Če autopilot ne pride do cilja ali proga ni veljavna →
novo pod-seme (`seed + ':' + k`), največ npr. 20 poskusov; nato se vrne najboljši poskus z jasnim opozorilom.
Uspešna proga dobi medalje in `timeBonus` iz `scoringFromRun` / `medalsFromTime` (ista formula kot generator uradnih
prog) in polje `dev`. `report`: dolžina, število posameznih ovir/sovražnikov, čas autopilota, padci, poskusi.

Generator naj teče v **Web Workerju** (ali v kosih z `await` med poskusi), da UI ne zmrzne; prikaži napredek
(»Poskus 3/20 …«) in gumb Prekliči.

## 3. UI v urejevalniku — preprosto + napredno

V »📁 Proge« (in v praznem stanju urejevalnika) gumb **»🎲 Naključna proga«** odpre okno:

**Preprosto (privzeto vidno):**
- **Težavnost**: drsnik 1–5 (Lahka · Srednja · Težka · Zelo težka · Nemogoča) — določi privzete vrednosti vseh naprednih nastavitev.
- **Dolžina**: Kratka / Srednja / Dolga (≈ ciljni čas autopilota 20 / 40 / 70 s).
- **Lokacija / tema**: izbira ali »Naključno«.
- **Seme**: besedilno polje (privzeto naključno) + 🎲 za novo.
- Gumba **»Ustvari«** in **»Ustvari in igraj«**.

**⚙️ Napredne nastavitve (zložljivo, `<details>`):** drsniki in stikala, ki se ob spremembi težavnosti nastavijo na
privzete vrednosti, potem pa jih igralec lahko spreminja posamično (ob ročni spremembi se težavnost pokaže kot »Po meri«):
- Dolžina v odsekih (npr. 6–40), širina poti min/max (1–5), delež ozkih mostov, višinske razlike (ravno ↔ gorato).
- **Sovražniki** — za vsako vrsto (nasilnež, žaga, osa, sesalec, magnet) drsnik 0–N (število) ali stikalo izklop.
- **Ovire** — za vsako vrsto (premične plošče, vrtiljaki, kladiva, odbijači, ventilatorji, sklede, vzmeti/skoki,
  stikala + vrata) drsnik 0–N.
- **Podlage** — led, lepilo, valovi, tekoči trakovi, padajoče ploščice: delež 0–100 %.
- Prepadi in skoki: pogostost, ograje/robovi (ob strani zidovi da/ne).
- Kontrolne točke: pogosto / redko / brez · ure za čas: 0–5 · žepi z zvezdicami (delež zvezdic izven glavne poti).
- »Ponastavi na težavnost«.

Pod gumbom pokaži kratek povzetek zadnje generacije (`report`) in majhno sličico (obstoječi tloris `view2d.js`).
Nastavitve se zapomnijo v `localStorage` (`krogla:gen:opts`, prek `shared/storage.js`).

**Po generaciji:** proga se odpre v urejevalniku kot **nov osnutek** (`saveDraft`, ime npr. »Naključna 7F3K«,
`desc` z semenom in nastavitvami), že označena kot preverjeno rešljiva (`verified` z `levelHash`), torej jo je mogoče
takoj označiti »✅ Pripravljeno«, deliti ali objaviti. Vsaka nadaljnja sprememba deluje kot pri ročni progi
(razveljavi, preverjanje se razveljavi ob spremembi mreže itd.). »🎲 Znova« v oknu naredi novo različico z novim semenom,
ne da bi prepisala prejšnji osnutek.

**Opcijsko (če ostane čas):** v meniju igre pri »Moje proge« gumb »🎲 Hitra naključna proga« (preprosti nastavitvi
težavnost + dolžina → takoj igraj, brez odpiranja urejevalnika; po igri »Shrani med moje proge«). Velja kot »Moje proge«:
brez uradne lestvice, odklepov in dosežkov.

## 4. Telefon in namizje
Okno deluje na 375 px (drsniki z velikimi ročaji, `touch-action: manipulation`, napredno zloženo), vsa besedila slovensko.
Na šibkih napravah omeji število poskusov in velikost mreže.

## 5. Testi in dokumentacija
- `tests/tests.js`: za ~20 semen × vse težavnosti generator vrne proge, ki prestanejo `validateLevel`, imajo 5 zvezdic,
  autopilot pride do cilja pod `levelTime` na Normalni; isti seed → enak JSON; nastavitev »0 sovražnikov« res da 0;
  število ovir/sovražnikov ustreza drsnikom (v toleranci, če se kaj ni dalo postaviti — to je zapisano v `report`).
- `node tools/krogla-levels.mjs --check` brez razlik, `node tests/run-node.mjs` zelen.
- Brskalnik (`?offline=1`): ustvari progo na vsaki težavnosti, uredi jo, testna vožnja, »Pripravljeno«, igraj v »Moje
  proge«, deli s povezavo; konzola brez napak; telefon 375×812 in namizje.
- `games/krogla/README.md`: razdelek »Naključne proge« (gradniki, nastavitve, seme). `PROGRESS.md`, kazalo promptov
  (stanje → ✅ s commitom) in oznaka v `PREDLOGI-IGER.md`, če tam obstaja ustrezna točka.
- Commit v slovenščini, **ne pushaj**.
