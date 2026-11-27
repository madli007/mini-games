# Prompt za AI agenta: Herodle — Herodex (zbirka likov), vadba, statistika dneva, kozmetika

> **Stanje:** ⬜ čaka — po 41 (filtri in polja `medium`, `fame`, `mcuDebut`). Ne poganjaj hkrati s 15 ali 41.

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/42-herodle-zbirka.md in ga v celoti izvedi.«**
>
> Ozadje: Herodle ima ~255 likov s polji `mcuDebut`, `medium` in `fame` (`prompts/41-herodle-liki.md`), dnevne načine
> Klasika (3 bazeni), Emoji, Kostum, Dosje, arhiv, bonus kroge in težavnost tedna. Ta prompt doda **dolgoročni
> motiv**: zbirko likov **Herodex**, neomejeno **vadbo**, **statistiko dneva** vseh igralcev in **predmete za Herodle v
> trgovini**. Nov način *Skupine* je v `43-herodle-skupine` (vadba in Herodex naj imata mesto zanj).
>
> **Dnevni načini se ne spremenijo**: razpored, lestvice, nizi in vsi obstoječi testi ostanejo veljavni.

---

## Kaj se spremeni pri vnosu igre
- Kratek opis omeni zbirko: »… Zberi vse junake v Herodexu.« (do 160 znakov).
- Novi dosežki in naloge (spodaj).

---

## 1. Herodex 📖

Ikona v glavi igre (poleg arhiva 📅). Zbirka vseh likov iz `heroes.js`.
- **Odklep:** lik je *odkrit*, ko ga uganeš kjer koli: dnevni način, arhiv, vadba, dvoboj (če obstaja). Predan ali
  izgubljen lik ostane *viden* (siva kartica z imenom), a ne *odkrit*. Stopnje kartice: 🥉 odkrit · 🥈 uganjen v dnevnem
  načinu · 🥇 uganjen v dnevnem načinu v največ 3 poskusih (pri Dosjeju z največ 2 namigoma).
- **Ob prvem zagonu** napolni zbirko iz obstoječe zgodovine (shranjena stanja dni in arhiva v `store.js`, online
  napredek), da igralec ne začne z 0.
- **Prikaz:** mreža kartic (barvni trakovi palete iz `hints.js`, monogram, ime; neodkriti: »?« in le univerzum).
  Filtri: univerzum, ekipa, MCU/medij (film / Disney+ / Netflix), prepoznavnost (`fame`), stopnja (vse/odkriti/manjka),
  iskanje. Klik na odkrit lik odpre obstoječo kartico »Dosje razkrit« (dejstva, paleta, debi v MCU) in vrstico »Uganjen:
  14. 12. 2026, Klasika, 3 poskusi«. Neodkrit lik ne izda ničesar več kot univerzum.
- **Napredek:** % zbirke skupaj in po univerzumu ter ekipah (npr. »Avengers 18/31«). Mejniki 25 / 50 / 100 / 150 / vsi
  → `hub.awardCoins(…, 'herodle-herodex')` (≤ 100 na klic, po enkrat) in dosežki.
- **Shranjevanje:** lokalno prek `shared/storage.js` (ločeno po adapterju in uporabniku kot `store.js`) in online v
  tabeli `herodle_collection (user_id, hero_id, tier, first_at, source)`; RLS: vsak bere in piše samo svoje vrstice,
  stopnja se lahko samo zviša (RPC `herodle_collect` ali omejitev v politiki). Na časten način (zapiši v README).
- **Primerjava s prijatelji:** v Herodexu vrstica »Prijatelji: Ana 120, Miha 97« (štetje odkritih iz tabele prek RPC-ja, ki
  vrne samo števila, ne seznama likov).

## 2. Vadba ♾️

Gumb v glavi igre. Neomejeno naključnih ugank, **lokalno** (`logic.js` + `hints.js`), brez Supabase RPC-jev.
- Izbira načina (Klasika / Emoji / Kostum / Dosje, kasneje Skupine), bazena (Mešano / Samo MCU / Samo DC) in
  prepoznavnosti (vse / 🌶️ / 🌶️🌶️ / 🌶️🌶️🌶️) ter stikalo **»Samo neodkriti iz Herodexa«**.
- Uporabi obstoječe module načinov (enako kot arhiv: `ctx.archive`-podobna pot ali skupen `ctx.practice`), ne kopij.
  Jasna oznaka »Vadba« na vrhu; gumb »Nova uganka«.
- **Ne šteje** za lestvico, niz, dnevno statistiko in popolni dan; šteje za Herodex (🥉) in naloge.
- XP: 3 na rešeno uganko, največ 30 XP vadbe na dan (števec v `store.js`). `hub.reportGame({ won, players: 1, score,
  daily: false })` po vsaki uganki.
- Lik vadbe se ne sme ponoviti v zadnjih 20 ugankah istega načina.

## 3. Statistika dneva 📊

Po končani dnevni uganki (rešeno / predano / izgubljeno) prikaži v rezultatu in v statistiki:
»Danes igralo 14 · uganilo 86 % · povprečje 4,3 poskusa · bil si boljši od 64 %« in majhen histogram poskusov.
- RPC `herodle_day_stats(mode, date)` (`security definer` v `private`, ovojnica v `public`) vrne **samo agregate**:
  število igralcev, delež rešenih, povprečje, porazdelitev (1, 2, 3 … 10+). Vir: obstoječi rezultati (lestvica prek
  `hub.submitScore` in `herodle_progress`; najprej preveri, kaj se že hrani). Za današnji dan vrne podatke **le igralcu,
  ki je dan že končal** (sicer samo število igralcev), da ne izda težavnosti.
- Offline: statistika iz lokalnih profilov (`?igralec=`) ali skrita z opombo »na voljo samo online«.
- Dosežek `nad-povprecjem` in tedenski pregled v statistiki: »Ta teden si bil 5× boljši od povprečja.«

## 4. Predmeti za Herodle v trgovini 🛍️

Po vzoru predmetov za Skoke (`GAME_ITEMS`, `GAME_SLOTS` v `shared/cosmetics.js`, blok GAME_ITEMS v `schema.sql`,
`node tools/shop-sql.mjs --write`, `cosmetics.gameItemOf`). Hub in trgovina ostaneta nespremenjena.
- Slot **`theme`** (tema igre, samo videz): *Klasična* (privzeta, brezplačna), *Stripovski papir* (rasterske pike,
  rumenkast papir, debele obrobe), *Noir* (črno-belo z rdečim poudarkom), *Neon*, *Zlata doba* (topli retro toni),
  *Kozmos* (zvezdno ozadje, animirano, spoštuje `prefers-reduced-motion`). Barve primerjave (zelena/rumena/rdeča) morajo
  v vseh temah ostati jasno ločljive (preveri kontrast, tudi za barvno slepe, kjer je vklopljen visok kontrast).
- Slot **`reveal`** (animacija razkritja lika): *POW!* (privzeta), *Strela*, *Portal*, *Odtis žiga*.
- Cene in redkosti v skladu z ekonomijo (`shared/economy.js`, simulacija `tests/economy-sim.js` mora ostati v mejah).
- Odklepi z dosežki: tema *Zlata doba* za `herodex-100` (vsaj 100 likov), okvir ali naziv »Zbiratelj junakov« (splošna
  kozmetika, `unlock: { achievement: 'herodle:herodex-vsi' }`) in okvir za niz 30 dni v Herodlu (dodaj dosežek `niz-30`,
  če ga še ni).

## 5. Dosežki, XP, naloge

- Dosežki:
  - `herodex-25`, `herodex-100`, `herodex-vsi`: Novinec / Zbiratelj / Popolni Herodex — odkrij 25 / 100 / vse like
  - `zlata-ekipa`: Zlata ekipa — vsi liki ene ekipe na 🥇
  - `vadba-10`: Trening — reši 10 ugank v vadbi v enem dnevu
  - `nad-povprecjem`: Nad povprečjem — 7 dni zapored boljši od povprečja dneva (Klasika, kateri koli bazen)
  - `niz-30`: Mesec junakov — 30 dni zapored rešen Herodle (če še ne obstaja)
- XP: mejniki Herodexa +25 vsak; vadba po točki 2.
- Naloge (najprej preveri `shared/quests.js`):
  - `e` »Reši uganko v vadbi Herodla« → `herodle:practice`, target 1
  - `m` »Odkrij 3 nove like v Herodexu« → `herodle:herodex-new`, target 3
  - `w` »Odkrij 15 novih likov v Herodexu ta teden« → `herodle:herodex-new`, target 15

### Prioritete, če zmanjkuje časa
Herodex (lokalno, polnjenje iz zgodovine, mreža, filtri) → vadba → Herodex online + mejniki → statistika dneva →
tema v trgovini → animacije razkritja → primerjava s prijatelji. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za ta prompt: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `ui`), kovanci, trgovina in predmeti za igre.
3. `games/herodle/README.md` in kodo (`main.js`, `store.js`, `modes/`, `bonus.js`, `daily.js`, `supabase/games/herodle.sql`).
4. `shared/cosmetics.js`, `shop.js`, `shared/economy.js` in predmete Skokov (`games/skoki/`) kot vzor za `GAME_ITEMS`.
5. `prompts/41-herodle-liki.md` (polja likov) in `prompts/14-herodle-nacini.md` (arhiv, kartica lika).

### Tehnično
- Vse v `games/herodle/` (npr. `herodex.js`, `practice.js`, `stats-day.js`, `themes.css`), **brez build koraka**,
  ES moduli, relativne poti, besedila v slovenščini.
- Uporabi `shared/` (`hub.awardXp`, `hub.awardCoins`, `hub.unlock`, `ui.modal`, `ui.toast`) in obstoječe komponente igre
  (kartica lika, iskanje, moduli načinov); ne podvajaj.
- SQL v `supabase/games/herodle.sql` (idempotentno, RLS, predpona `herodle_`); predmeti v `schema.sql` prek
  `tools/shop-sql.mjs`. Če imaš Supabase MCP orodja, poženi kot migracijo in preveri `get_advisors` (security +
  performance); sicer napiši v `PROGRESS.md`, kaj mora uporabnik pognati.
- Čisto logiko (stopnje kartic, polnjenje iz zgodovine, filtri, mejniki, izbira lika vadbe brez ponovitev, dnevna meja XP
  vadbe, agregati statistike) v `logic.js` ali ločen modul s testi v `tests/tests.js`. **Vsi obstoječi testi ostanejo
  zeleni.** Katalog kozmetike se ujema s `schema.sql` (obstoječi test).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v trgovini in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Offline (`?offline=1`): Herodex se napolni iz že rešenih dni; reši uganko v vadbi (Klasika in Emoji) → lik je v
   Herodexu 🥉, niz in dnevna statistika se ne spremenita; dnevna uganka v ≤ 3 poskusih → 🥇; filtri in iskanje delujejo;
   dnevna meja XP vadbe.
5. S Supabaseom (`?igralec=1/2`): zbirka se ohrani po osvežitvi in na drugi napravi; tuja zbirka ni berljiva (le števila);
   `herodle_day_stats` za današnji dan pred koncem uganke ne vrne porazdelitve; kupi in opremi temo, ponovno naloži igro.
6. Izgled na **telefonu (375×812)** in **namizju**: Herodex (polna in prazna zbirka), vadba, statistika dneva in vse
   teme (vsaj Klasika v vsaki temi). Posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
7. Posodobi `games.json` (opis, dosežki, naloge; test sheme uspe), `PROGRESS.md`, `games/herodle/README.md` (Herodex,
   vadba, statistika, teme, tabela in RPC-ji) in `shared/README.md`, če se spremeni API predmetov za igre.
8. Testne profile in vrstice v produkcijski bazi na koncu **izbriši**.
9. Stanje tega prompta v `prompts/README.md`, na vrhu prompta in v `PREDLOGI-IGER.md`.
10. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako deluje Herodex in vadba, kaj je novo v trgovini, kaj moram
narediti v Supabaseu in kaj ni bilo preverjeno.
