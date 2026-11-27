# Prompt za AI agenta: Herodle — nov dnevni način Skupine 🧩

> **Stanje:** ⬜ čaka — po 41 (polja `medium`, `mcuDebut`, `fame`); 42 priporočen (vadba, Herodex). Ne poganjaj
> hkrati z drugimi prompti za Herodle.

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/43-herodle-skupine.md in ga v celoti izvedi.«**
>
> Ozadje: Herodle ima ~255 likov z atributi (`heroes.js`), namige (`hints.js`), dnevne načine Klasika (3 bazeni),
> Emoji, Kostum, Dosje, arhiv, težavnost tedna (`prompts/41-herodle-liki.md`) ter (če je 42 narejen) Herodex in vadbo.
> Ta prompt doda **peti dnevni način**: 16 likov razvrsti v 4 skrite skupine po 4.
>
> **Obstoječi načini se ne spremenijo**: razpored, lestvice, nizi, *Popolni dan* (ostane Klasika + Emoji + Kostum +
> Dosje) in vsi testi ostanejo veljavni. Nov način je modul v `modes/` po vmesniku iz `games/herodle/README.md`.
> Mehanika »najdi štiri skupine« je splošna; ime, barve in videz naj bodo **naši** (ne kopiraj videza znane igre).

---

## Kaj se spremeni pri vnosu igre
- Kratek opis omeni skupine (do 160 znakov), npr. »… emojijih, kostumih, dosjeju in skupinah.«
- Novi dosežki in naloge (spodaj).

---

## 1. Pravila načina (`skupine`)

- Mreža 4×4 žetonov likov (ime + majhen trak barve kostuma). Igralec izbere 4 in potrdi.
- Pravilno → skupina se zaklene v vrstico z imenom skupine in barvo težavnosti. Napačno → izguba enega od **4 življenj**
  (srčki); če so 3 od 4 pravilni, napis »Ena manjka!«. Isti napačni izbor drugič ne stane življenja (»To si že poskusil«).
- Gumbi: *Premešaj*, *Počisti*, *Potrdi*. Po 4 napakah igra razkrije vse skupine (= ni rešeno).
- Rezultat = število napak (0–4, manj je bolje; lestvica `asc`), pri enakem odloči čas.
- Težavnost skupin: 4 stopnje z našimi barvami in oznakami (npr. 🟫 lahka, ⬜ srednja, 🟨 težka, 🟪 kozmična).
- Svoj lik dneva = svoja uganka dneva, svoj niz, statistika in zavihek na lestvici. Gumb »Naslednji način →« ga upošteva.

## 2. Kategorije in generator

Generator v `groups.js` (čista logika, deterministična iz seeda) sestavi 4 skupine po 4 like, tako da:
- **vsak od 16 likov ustreza natančno eni od 4 izbranih kategorij** (rešitev je enolična; test na 2000 seedih),
- vsaj ena skupina je »zavajajoča« (npr. 5+ likov na mreži *izgleda*, kot da sodijo vanjo, a le 4 ustrezajo pravilu),
- težavnost dneva sledi težavnosti tedna (ponedeljek lažje kategorije in liki `fame 1`, vikend težje).

Vrste kategorij (iz podatkov, brez ročnega pisanja za vsak dan):
- ekipa (glavna ali katera koli), vrsta, izvor moči, stran (junak/zlobec/antijunak), domovina (`home`),
- desetletje prvega stripa, leto ali faza debija v MCU, medij (»Prvič na Netflixu«, »Prvič na Disney+«),
- isti nasprotnik (»Nasprotniki Thanosa«), isti igralec v več vlogah, če obstaja, prevladujoča barva kostuma,
- **ročne kategorije** v `groups-curated.js` (naše lastne, npr. »Nosijo ščit«, »Imajo kladivo ali sekiro«, »Znajo
  leteti brez tehnologije«, »Iz Wakande«, »Imajo dvojčka«, »Igral jih je Chris«): vsaka s seznamom id-jev in
  oznako `unsure` za dvomljive (te generator ne uporabi). Vsaj 40 ročnih kategorij, preverjenih z WebSearch, kjer ni
  očitno.
- Ime kategorije se pokaže šele, ko je skupina najdena ali razkrita.

## 3. Zaščita rešitve (Supabase)

- `tools/herodle-groups.mjs` z generatorjem in **skrivnim seedom iz okolja** (ne v repo) ustvari uganke za naslednjih
  365 dni → `herodle_groups (date, tiles text[16], groups jsonb)`, za `anon`/`authenticated` **ni berljiva**.
  Uvoz idempotenten, pretekli in današnji dnevi se ne prepišejo.
- `herodle_groups_today(date)` vrne samo premešane `tiles`; `herodle_check` za `skupine` sprejme 4 id-je, vrne
  `{ correct, oneAway, group? }` in v `herodle_progress` šteje napake (piše samo RPC). Po osvežitvi `herodle_hint`
  vrne že najdene skupine in število napak. Dodaj `skupine` v vse `check (mode in …)`, `herodle_guard` in `ALL_MODE_IDS`.
- Offline: isti generator z javnim seedom (`hub.dailySeed`), isti vmesnik `daily.js`. Arhiv in vadba (če obstaja)
  generirata lokalno. Ker je generator javen, lahko goljuf brez strežniškega seeda le ugiba; zapiši v README.

## 4. Deljenje, arhiv, vadba, Herodex

- Deljenje brez imen likov in skupin: `Herodle #160 · 🧩 Skupine 1 ❤️‍🩹` + vrstice barvnih kvadratkov po poskusih.
- Vključi v *Deli vse današnje* (ločena vrstica; *Popolni dan* se ne spremeni). Nov dosežek **»Super dan«** = popolni
  dan + Skupine.
- Arhiv 📅: Skupine za pretekle dni (lokalno, iz `herodle_reveal`-podobnega RPC-ja ali iz offline seeda).
- Vadba (če 42 obstaja): Skupine z naključnim seedom. Herodex: rešena skupina doda vse 4 like kot 🥉 odkrite.
- Kartica »Dosje razkrit« za vsak lik na koncu (klik na žeton).

## 5. Dosežki, XP, naloge

- Dosežki:
  - `brez-napake`: Brezhibno — reši Skupine brez napake
  - `kozmicna-prva`: Kozmični vid — najprej najdi najtežjo skupino
  - `super-dan`: Super dan — isti dan popolni dan + Skupine
  - `skupinar`: Skupinar — reši Skupine 10 dni (ne nujno zapored)
- XP: 15 za rešene Skupine, +10 brez napake, +20 za super dan.
- Naloge (najprej preveri `shared/quests.js`):
  - `m` »Reši Skupine v Herodlu« → `herodle:groups`, target 1
  - `h` »Reši Skupine Herodla brez napake« → `herodle:groups-clean`, target 1
  - `w` »Reši Skupine Herodla 4 dni ta teden« → `herodle:groups`, target 4

### Prioritete, če zmanjkuje časa
Generator z enolično rešitvijo + testi → način offline (mreža, izbor, življenja, »Ena manjka!«) → ročne kategorije →
zaščita v Supabaseu → deljenje in Deli vse današnje → arhiv → vadba in Herodex → dosežki in naloge. Kar ne gre, zapiši v
`PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za ta prompt: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `ui`).
3. `games/herodle/README.md` (vmesnik načina, zaščita namigov, arhiv) in kodo (`main.js`, `daily.js`, `logic.js`,
   `modes/hintmode.js`, `modes/dosje.js`, `share.js`, `supabase/games/herodle.sql`, `tools/herodle-sql.mjs`).
4. `prompts/14-herodle-nacini.md`, `prompts/41-herodle-liki.md` in (če obstaja) `prompts/42-herodle-zbirka.md`.

### Tehnično
- Vse v `games/herodle/` (`modes/skupine.js`, `groups.js`, `groups-curated.js`), **brez build koraka**, ES moduli,
  relativne poti, besedila v slovenščini. Uporabi obstoječe komponente (žeton lika, kartica, komentator, zvok, deljenje,
  `prefers-reduced-motion`); ne podvajaj. Dotik: veliki žetoni, `touch-action: manipulation`, brez hover-only.
- Po vsaki uganki `hub.reportGame({ won, players: 1, score, daily })` (`daily: false` za arhiv in vadbo); dogodki za
  naloge s `hub.reportEvent('herodle:<ime>', vrednost)`.
- SQL v `supabase/games/herodle.sql` (idempotentno, RLS, predpona `herodle_`). Če imaš Supabase MCP orodja, poženi kot
  migracijo, uvozi uganke in preveri `get_advisors` (security + performance); sicer napiši v `PROGRESS.md`, kaj mora
  uporabnik pognati (tudi kako nastaviti skrivni seed).
- Testi v `tests/tests.js`: enolična rešitev, deterministika (isti seed = ista uganka), težavnost po dnevu v tednu,
  vse ročne kategorije vsebujejo le obstoječe id-je in vsaj 4 like brez `unsure`, pravila življenj in »Ena manjka!«,
  ponovljen izbor ne stane življenja, deljenje brez imen, arhiv ne vpliva na niz. **Vsi obstoječi testi ostanejo zeleni.**

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Offline (`?offline=1`): reši Skupine brez napake in z 2 napakama, izgubi s 4 (drug dan prek `?date=`), osveži sredi
   uganke (najdene skupine in srčki ostanejo), »Ena manjka!«, ponovljen izbor; ostali načini delujejo kot prej.
5. S Supabaseom: v zavihku Network preveri, da pred rešitvijo noben odgovor ne vsebuje skupin; `herodle_groups` tujemu
   igralcu ni berljiva; ponovni poskus po 4 napakah je zavrnjen.
6. Izgled na **telefonu (375×812)** in **namizju** (tudi dolga imena likov v žetonih, vse teme iz 42, če obstajajo).
   Posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
7. Posodobi `games.json` (opis, dosežki, naloge, lestvica načina; test sheme uspe), `PROGRESS.md` in
   `games/herodle/README.md` (način, generator, kategorije, zaščita) ter `../herodle.md`.
8. Testne profile in vrstice v produkcijski bazi na koncu **izbriši** (uganke pusti).
9. Stanje tega prompta v `prompts/README.md`, na vrhu prompta in v `PREDLOGI-IGER.md`.
10. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati Skupine, kaj moram narediti v Supabaseu (tudi skrivni
seed), katere ročne kategorije čakajo na preverjanje in kaj ni bilo preverjeno.
