# Prompt za AI agenta: Hrčkova krogla — nove proge in več turnirjev

> **Stanje:** ⬜ čaka — lahko takoj (pred 30 ali po njem; glej »Usklajevanje z drugimi prompti«)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/35-krogla-proge-turnirji.md in ga v celoti izvedi.«**
>
> Ozadje: Hrčkova krogla (`games/krogla/`) ima 12 uradnih prog v 3 sklopih in **en sam turnir** (vseh 12 zapored, ura s
> prenosom časa), poleg tega še Na čas, zrcalni turnir in dnevni izziv. Proge so podobno dolge (autopilot 17–46 s),
> težavnost pa raste le s številko proge. Ta prompt doda **16 novih uradnih prog**, ki se med sabo močno razlikujejo
> (kratki sprinti, srednje proge, dolgi maratoni; od zelo lahkih do zelo težkih), in **več turnirjev (pokalov)** z
> različnim značajem, svojimi lestvicami, odklepi in dosežki. Cilj je **dober balans**: vsak igralec najde nekaj zase,
> težavnost je označena pošteno in je preverjena z meritvami, ne le na oko.
>
> **Obstoječe proge, fizika, časi, medalje, ghosti, autopilot in lestvice ostanejo enaki.** Id-ji prog `01`–`12`,
> lestvice `lvl:<id>`, `turnir:<težavnost>`, `zrcalo:<težavnost>` in ghosti v `krogla_ghosts` morajo delati kot zdaj.
> `node tests/run-node.mjs` ostane zelen brez sprememb pričakovanih vrednosti obstoječih testov.

---

## 1. Nove proge (`13`–`28`)

Proge naredi v generatorju `tools/krogla-levels.mjs` z želvico (`Track`: `go`, `turn`, `gap`, `pocket`, `mark`, `add`,
`wp` …), tako kot obstoječe; vsaka ima `route` za autopilota, točno 5 zvezdic, kontrolne točke in `look`. Imena, oblike in
okras so naši (ne kopiraj prog iz Hamsterballa ali drugih iger). Spodnja tabela je **izhodišče** — imena, vrstni red in
podrobnosti smeš spremeniti, če to izboljša balans, ohrani pa razpršenost po dolžini in težavnosti.

| # | Proga (predlog) | Dolžina | Težavnost | Lokacija | Značaj / mehanike |
|---|---|---|---|---|---|
| 13 | Tobogan | kratka (~10 s) | ★ | garden | širok spust z valovi in sklediščem, hitrost brez kazni; »za ogrevanje prstov« |
| 14 | Odskočna deska | kratka (~12 s) | ★★★ | sky | trije skoki z vzmetmi in rampami čez prepade, pristanek na ozkih ploščadih |
| 15 | Britev | kratka (~14 s) | ★★★★ | neon | 1 ploščico širok most brez robov, ventilatorji od strani v ritmu |
| 16 | Šivankino uho | kratka (~12 s) | ★★★★★ | factory | ozka vrata, kladiva z ozkimi okni, padajoče ploščice — ena napaka = konec dobrega časa |
| 17 | Pekarna | srednja (~25 s) | ★★ | kitchen | tekoči trakovi naprej in nazaj, sklede, premična plošča prek »pekača« |
| 18 | Botanični vrt | srednja (~30 s) | ★★ | garden | **prvi razcep**: varna dolga pot ali kratka bližnjica čez ozek most (zvezdica na bližnjici) |
| 19 | Drsališče | srednja (~28 s) | ★★★ | ice | led z odbijači, vijuge brez ograj, lepilo kot »zavora« pred zavoji |
| 20 | Rudnik | srednja (~35 s) | ★★★ | arena (ali nova lokacija) | »vozički« (premične plošče na tirih), padajoče ploščice, temni rovi, žage |
| 21 | Laboratorij | srednja (~38 s) | ★★★★ | crystal | magneti (vleci/odbijaj), 3 stikala + vrata v zaporedju, sesalec |
| 22 | Panj | srednja (~32 s) | ★★★★ | garden | ose na krožnih poteh, lepilo, ozki prehodi med satovjem (bloki) |
| 23 | Ognjenik | srednja (~30 s) | ★★★★★ | inferno | padajoče ploščice nad prepadom, žage, nasilnež na ploščadi, klanci navzgor |
| 24 | Nedeljski sprehod | dolga (~60 s) | ★ | garden / sky | dolga, široka, slikovita; malo ovir, veliko ur in žepov z zvezdicami — **dolga ≠ težka** |
| 25 | Velika tura | dolga (~75 s) | ★★★ | menjava lokacij ni nujna | »best of« mehanik prvih dveh sklopov, kontrolna točka na ~10 s |
| 26 | Kristalna jama | dolga (~80 s) | ★★★ | crystal | spust v globino: spirale navzdol, ledeni deli, odbijači, ena bližnjica |
| 27 | Nebesna lestev | dolga (~90 s) | ★★★★ | tower / sky | vzpon: dvigala, ventilatorji navzgor, ozki mostovi, ose — padec vrne daleč nazaj, zato pogoste kontrolne točke |
| 28 | Hrčkov maraton | dolga (~120 s) | ★★★★★ | več delov | vse mehanike in vsi sovražniki; finale »Peklenskega pokala« |

**Pravila za balans prog:**
- Dolžine (čas autopilota): **kratka 8–16 s**, **srednja 20–45 s**, **dolga 55–130 s**. Med novimi progami vsaj 4 kratke,
  vsaj 5 srednjih in vsaj 4 dolge; vsaka stopnja težavnosti ★–★★★★★ vsaj dvakrat.
- Težavnost ni dolžina: vsaj ena dolga lahka (24) in vsaj ena kratka zelo težka (16).
- Dolge proge imajo kontrolno točko na približno vsakih 8–12 s vožnje in vsaj 3 ure (ura teče s prenosom); padec na dolgi
  progi ne sme pomeniti »igraj vse znova«.
- Kratke proge imajo 0–1 kontrolno točko in ostre medalje (razlike med medaljami so pri njih v desetinkah).
- Vsaj ena nova mehanska kombinacija na progo (ne samo nova razporeditev istih ovir). Vsaj 6 različnih `look`.
  Če narediš novo lokacijo (npr. rudnik, laboratorij), jo dodaj v `render/looks.js` (ne spreminjaj obstoječih).
- **Razcepi** (18, 26 in po želji še kje): tvegana pot je hitrejša, a ne »obvezna« za zlato na Lahki/Normalni.
  Autopilot vozi glavno (varno) pot; v testih preveri tudi alternativno pot (druga `route`, npr. `routes.alt`, ki jo
  validator dovoli in je ne uporablja igra).
- Medalje in `timeBonus` iz vožnje autopilota z isto formulo kot zdaj (`scoringFromRun`). Če se izkaže, da je formula za
  zelo kratke ali zelo dolge proge neprimerna (npr. ura na sprintu je preveč radodarna, na maratonu pa premalo),
  dodaj **neobvezen** popravek na progi (npr. `timeMul`) — formula za obstoječe proge se ne sme spremeniti.

**Nova polja v JSON-u proge (neobvezna, validator jih sprejme, igra jih uporabi):**
- `diff`: 1–5 (prikazana težavnost) — dodaj tudi obstoječim 12 progam (ročna ocena + meritev, glej točko 4).
  Pri obstoječih progah se **ne spremeni nič drugega** (preveri z `git diff`, da je razlika le polje `diff`).
- `len`: `'kratka' | 'srednja' | 'dolga'` (izračuna generator iz `dev.time`; ne piši na roko).
- `tags`: npr. `['led', 'sovražniki', 'razcep']` za filtre in opise.

## 2. Turnirji (pokali)

Turnirji so **podatki**: nova datoteka `levels/cups.json` (validator v `level.js` ali `rules.js`, test v `tests/tests.js`).
Obstoječi turnir postane prvi vnos in se **obnaša natanko kot zdaj** (isti seznam 12 prog izrecno, isti `boardSeed`,
isti odklepi, isti zrcalni turnir, isti dosežki `sklop-1`, `sklop-2`, `turnir`, `noro`, `rezerva`).

```jsonc
{
  "cups": [
    { "id": "klasika", "name": "Klasični turnir", "icon": "🏆", "levels": ["01-ogrevanje", …, "12-nemogoce"],
      "board": "turnir", "mirror": true, "unlock": null },
    { "id": "hrcek", "name": "Hrčkov pokal", "icon": "🌱", "levels": [...], "clock": 1.1, "unlock": null },
    …
  ]
}
```

Polja: `id`, `name`, `icon`, `desc`, `levels` (id-ji prog v vrstnem redu), `clock` (množilnik ure celega turnirja, privzeto 1),
`diffs` (dovoljene težavnosti, privzeto vse), `unlock` (pogoj: `null`, `{ "cup": "<id>" }`, `{ "ach": "<ključ>" }` ali
`{ "any": [...] }`), `board` (predpona lestvice; privzeto `pokal:<id>`), `mirror` (ali ima zrcalno različico).

**Predlagani pokali** (izhodišče — uglasi po meritvah):

| Pokal | Proge | Skupaj (autopilot) | Odklep | Posebnost |
|---|---|---|---|---|
| 🏆 Klasični turnir | 01–12 (kot zdaj) | ~5 min | takoj | nespremenjen, z zrcalnim turnirjem |
| 🌱 Hrčkov pokal | 13, 01, 17, 18, 24 | ~2,5 min | takoj | za začetnike: lahke proge, ura ×1,15; priporočen prvi pokal v meniju za nove igralce |
| ⚡ Sprint | 13, 14, 09, 15, 03, 16 | ~1,3 min | Hrčkov pokal ali `sklop-1` | samo kratke proge, ura ×0,9 — ena napaka šteje; lestvica po točkah in **skupnem času** |
| 🧭 Svetovna turneja | 17, 19, 06, 20, 22, 10, 21, 11 | ~4 min | `sklop-2` ali Sprint | srednje proge iz novih in klasičnih, menjava lokacij |
| 🏃 Maraton | 24, 25, 26, 27 | ~5,5 min | Svetovna turneja | 4 dolge proge; vmesni povzetek in **shranjevanje napredka med progami** (nadaljuj kasneje, a z oznako »prekinjeno« na lestvici ne šteje) |
| 🔥 Peklenski pokal | 15, 12, 23, 16, 27, 28 | ~5 min | `turnir` + Svetovna turneja | samo Normalna in Noro, ura ×0,9; nagrada: dosežek in (po želji) predmet krogle, če obstaja `GAME_ITEMS` za kroglo |
| 📅 Tedenski pokal | 5 prog, izbranih iz semena tedna | ~2–3 min | takoj | glej spodaj |

**Tedenski pokal:** isti za vse igralce cel teden (seme = ISO teden, npr. `hub.rng('krogla:teden:2026-W48')`; če `hub`
nima tedenskega semena, izračunaj teden v `rules.js` kot čisto funkcijo s testom). Izbor iz vseh uradnih prog z
`diff ≤ 4` po pravilu: 1 kratka, 3 srednje, 1 dolga; povprečna težavnost 2,5–3,5; proge urejene od lažje k težji; nobena
proga ni dva tedna zapored. Lestvica `teden:<leto>-W<nn>`, šteje najboljši poskus tedna. Dodatek dneva iz dnevnega
izziva (`DAILY_MODS`) po želji kot »dodatek tedna«.

**Pravila za balans turnirjev:**
- Vsak pokal se začne z lažjo progo, najtežja proga je zadnja ali predzadnja, med težkima je vsaj ena »oddih« proga.
- Rezerva ure: autopilot konča vsak pokal na **Normalni** z 20–40 % rezerve skupnega časa, na **Lahki** z ≥ 50 %, na
  **Noro** naj rezerve skoraj ne bo (0–15 %) ali naj ga autopilot brez pobranih ur ravno ne konča. Množilnik `clock`
  uglasi tako, da to drži; rezultat zapiši v tabelo v `PROGRESS.md`.
- Točke kot zdaj (`levelPoints`): 1000 na progo + 20 na preostalo sekundo + 100 na zvezdico, × težavnost. Ker imajo
  pokali različno število prog, so lestvice **ločene po pokalu in težavnosti** (`pokal:<id>:<težavnost>`); točk med
  pokali ne primerjaj.
- XP: `tourneyLevelXp` po progah (zgornja meja velja na pokal), za prvi konec vsakega pokala enkratni bonus (npr. 60–150
  XP po zahtevnosti pokala). Prek `hub.awardXp` kot zdaj.

**Odklepi prog za Na čas:** proga se odklene, ko jo dosežeš v **kateremkoli** pokalu na Normalni/Noro (kot zdaj za
klasični turnir). Dosežek `turnir` še vedno odklene vse klasične proge; za nove velja »vse proge pokala, ko ga končaš«.

## 3. Meni in prikaz

- Kartica »Turnir« postane **»🏆 Turnirji«**: seznam pokalov (ikona, ime, število prog, skupna dolžina, težavnost kot
  pike ●●●○○, ključavnica s pogojem, najboljši rezultat na izbrani težavnosti). Klik → izbira težavnosti (le dovoljene)
  → začetek. Zrcalni turnir ostane pri Klasičnem turnirju.
- **Na čas:** namesto le skupin po sklopih še filtri **Vse · Kratke · Srednje · Dolge** in razvrščanje po številki /
  težavnosti / dolžini; vsaka proga kaže značko dolžine, težavnost, medaljo in zaklep. Telefon: filtri kot vodoravni gumbi.
- Lestvice v meniju: izbirnik pokala (in tedna za Tedenski pokal).
- Dnevni izziv: bazen prog zapiši izrecno (`DAILY_POOL` v `rules.js`) — klasične 01–08 in nove z `diff ≤ 3`, ki niso
  dolge. Sprememba bazena spremeni izbor od dneva uvedbe naprej (zapiši v `PROGRESS.md`).
- Povzetek proge v turnirju pokaže tudi oznako dolžine in težavnosti naslednje proge (»Naslednja: Britev · kratka · ★★★★«).
- Vse na 375 px in na namizju; besedila slovensko.

## 4. Merjenje balansa (`node tools/krogla-levels.mjs --balance`)

Novo stikalo v generatorju (ali ločen `tools/krogla-balance.mjs`, ki uvaža iste module) izpiše in zapiše v
`PROGRESS.md`:

- Za vsako uradno progo: čas autopilota, `len`, deklarirana `diff`, **izmerjena težavnost** — npr. 30 deterministično
  zašumljenih voženj autopilota (seme na progo; naključna napaka smeri ±10–15°, hitrosti ±15 %, zakasnitev odziva) →
  delež voženj, končanih pod uro Normalne, povprečno število padcev, »gostota nevarnosti« (ovire/sovražniki na 10 s).
  Iz tega izpelji oceno 1–5.
- Kriterij: izmerjena ocena se od deklarirane `diff` razlikuje za največ 1 pri vsaki progi, sicer progo popravi ali
  popravi `diff` (in zapiši, zakaj). Razvrstitev po izmerjeni težavnosti naj se ujema z deklarirano (Spearman ≥ 0,7).
- Za vsak pokal: skupni čas autopilota, rezerva ure na Lahki / Normalni / Noro, krivulja težavnosti po vrsti.
- Za Tedenski pokal: simulacija 52 tednov — porazdelitev povprečne težavnosti in skupne dolžine, nobena ponovitev
  zaporednih tednov, vse proge iz bazena se pojavijo vsaj enkrat.

## 5. Dosežki in naloge

- Dosežki (vsaj 6 novih, v `rules.js` `ACH`): `pokal-hrcek`, `pokal-sprint`, `pokal-turneja`, `pokal-maraton`,
  `pokal-pekel` (vsak za konec pokala na Normalni/Noro), `vsi-pokali`, `tedenski` (Tedenski pokal končan 3 različne
  tedne), `razcep` (zlato na 18 po bližnjici), `zlato-nove` (zlato na vseh novih progah).
  Obstoječi `zlato-vse` (»Zlato na vseh progah«) **ostane vezan na 12 klasičnih prog** (popravi le opis), da ga
  igralci, ki ga že imajo, ne »izgubijo« in da ga ne dobijo prelahko.
- Naloge v `games.json` za kroglo (dodaj, obstoječih ne spreminjaj): npr. »Končaj pokal v Hrčkovi krogli« (`krogla:pokal`,
  tedenska), »Končaj dolgo progo« (`krogla:dolga`), »Osvoji zlato na kratki progi« (`krogla:sprint-gold`).
  `hub.reportEvent` v igri ustrezno; test sheme `games.json` mora uspeti.

## 6. Supabase

- `node tools/krogla-levels.mjs` doda nove proge v blok `BEGIN LEVELS` v `supabase/games/krogla.sql` (`krogla_levels`
  in zlati časi), sicer RPC zavrne ghoste novih prog. Lestvice pokalov so v obstoječi `game_scores` (novi `seed`-i),
  nove tabele niso potrebne.
- Če imaš Supabase MCP orodja, poženi SQL kot migracijo in preveri `get_advisors` (security + performance); sicer v
  `PROGRESS.md` in končnem odgovoru napiši, da mora uporabnik ponovno pognati `supabase/games/krogla.sql`.

## Usklajevanje z drugimi prompti

- **30 (naključne proge)** premakne želvico `Track` v skupen modul. Če je 30 že narejen, nove proge piši z njo
  (iz `games/krogla/editor/track.js` ali kjer je); če ni, jih piši v `tools/krogla-levels.mjs` kot zdaj — 30 bo želvico
  kasneje premaknil, njegov `--check` mora takrat vključevati tudi nove proge. Generator naključnih prog lahko kasneje
  uporabi `diff`/`len` iz tega prompta kot ciljne vrednosti (zapiši v README kot možnost, ne delaj tukaj).
- **20 (okolica prog)**: nove lokacije in proge naj imajo `look`, da jih okras kasneje lahko opremi.
- **19 (dirka)** ima svoje široke proge; tega prompta ne meša z njimi.
- **Rušilec** (`secrets.js`): skrite ključavnice na progah Neon in Nebo ostanejo, kjer so.

## 7. Testi, preverjanja in dokumentacija

- `tests/tests.js`: validator in rešljivost vseh prog (tudi novih; autopilot pod `levelTime` na Normalni, alternativne
  poti razcepov), validator `cups.json` (vse proge obstajajo, odklepi kažejo na obstoječe pokale/dosežke, brez krogov),
  izbor Tedenskega pokala (determinističen, pravila iz točke 2), `len` se ujema z `dev.time`, `DAILY_POOL`.
  Obstoječi testi in pričakovane vrednosti ostanejo nespremenjeni.
- `node tools/krogla-levels.mjs --check`: obstoječe proge enake razen novega polja `diff`.
- Brskalnik (`?offline=1`): vsak pokal z `?bot=1` od začetka do konca na Normalni (odštevanje, ura s prenosom, povzetki,
  točke, lestvica pokala, dosežek), klasični turnir se obnaša kot prej, odklepi pokalov (svež igralec: odprta sta le
  Klasični, Hrčkov in Tedenski), filtri v Na čas, ročna vožnja vsaj ene kratke, ene srednje in ene dolge nove proge,
  Maraton: prekinitev in nadaljevanje. Konzola brez napak v igri, urejevalniku (»Kopija uradne proge« ponudi tudi nove)
  in na dashboardu. Telefon 375×812 in namizje: posnemi zaslone, preglej in popravi.
- **Dokumentacija (obvezno posodobi):**
  - `games/krogla/README.md`: načini (Turnirji s tabelo pokalov, Tedenski pokal), nova polja `diff`/`len`/`tags`, format
    `cups.json`, »Kako dodati progo« in nov razdelek »Kako dodati turnir«, `--balance`.
  - `PROGRESS.md` (sekcija Hrčkova krogla): tabela prog razširjena z novimi (autopilot · medalje · ura · dolžina ·
    težavnost deklarirana/izmerjena), tabela pokalov z rezervami ure, dnevnik, »Ni bilo preverjeno«.
  - `games.json`: opis krogle po potrebi (več prog in turnirjev), nove naloge.
  - `README.md` v korenu (opis Hrčkove krogle: število prog, turnirji).
  - `prompts/README.md` (stanje → ✅ s commitom, »Kaj lahko poženem zdaj«), stanje na vrhu tega prompta in oznaka v
    `PREDLOGI-IGER.md` (razdelek »D) Razširitve Hrčkove krogle«).
- Commit na `main` v slovenščini, **ne pushaj**.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `ui`), lestvice, dosežki, `reportGame`, `reportEvent`.
3. `games/krogla/README.md`, `games/krogla/rules.js`, `games/krogla/level.js`, `games/krogla/game.js` (meni, turnir,
   odklepi), `games/krogla/autopilot.js`, `tools/krogla-levels.mjs` (želvica in obstoječe proge), `games/krogla/render/looks.js`.
4. Sekcija »Hrčkova krogla« v `PROGRESS.md` (tabela prog, uglaševanje).

### Tehnično
- **Brez build koraka**, ES moduli, relativne poti, besedila v slovenščini s šumniki.
- Čisto logiko (pokali, odklepi, tedenski izbor, točke, meritve balansa) v module brez DOM-a, testi v `tests/`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kot zdaj v turnirju).
- `localStorage` samo prek `shared/storage.js` (ključi na igralca, `krogla:u:<id>:…`, kot obstoječi odklepi).
- Fizike ne spreminjaj; če nova proga potrebuje novo mehaniko, jo dodaj kot neobvezno polje, ki obstoječih prog ne spremeni.
- Telefon (portret, 375 px; veliki gumbi, `touch-action: manipulation`) in namizje.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v Krogli, urejevalniku, Rušilcu in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (obstoječi testi nespremenjeni); `node tools/krogla-levels.mjs --check`
   in `--balance` brez napak.
4. Vsi pokali odigrani do konca (`?bot=1`) in vsaj trije ročno (kratka, srednja, dolga proga).
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
6. `games.json` (naloge) — test sheme uspe.
7. Posodobi dokumentacijo iz točke 7 in **stanje prompta** (vrh prompta → ✅ s commitom, `prompts/README.md`, `PREDLOGI-IGER.md`).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: katere proge in pokali so nastali (z dolžino in težavnostjo), kako se odklenejo,
kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
