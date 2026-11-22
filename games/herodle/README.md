# Herodle 🦸

Dnevna uganka: ugani skritega junaka ali zlobca (Marvel + DC) po barvnih namigih atributov (Klasika), emojijih,
barvah kostuma ali tajnem dosjeju.
Neuradna fan igra, ni povezana z Marvel ali DC (brez slik, logotipov, citatov).

Faze: 1. podatki, Klasika (3 bazeni, težki način), bonus, statistika, deljenje, Supabase ·
**2. (narejena)** `prompts/14-herodle-nacini.md` (Emoji, Kostum, Dosje, arhiv, popolni dan) ·
3. `prompts/15-herodle-dvoboj.md` (dvoboj, TV).

## Zgradba

| Datoteka | Vsebina |
|---|---|
| `heroes.js` | 180 likov (polja spodaj); `HEROES`, `heroById()` |
| `hints.js` | namigi 2. faze za vse like: `emoji[5]`, `palette[3–5]`, `symbol`, `dossier[6]`, `facts[2–3]`, `unsure[]` (**dinamično**: le kartica, arhiv, offline) |
| `logic.js` | čista logika: dovoljene vrednosti, `compare`, težki način, offline razpored, iskanje, bonus, deljenje, statistika, komentator, XP, `EPOCH` |
| `daily.js` | **en vir za lik dneva**: `init(hub, heroes)`, `getToday(mode)`, `check(mode, date, heroId)`, `hints(mode, date)`, `giveUp(mode, date)`, `reveal(mode, date)`; adapterja online (RPC) / offline z enakim vmesnikom |
| `store.js` | lokalno stanje dneva, statistika, nastavitve (`shared/storage.js`), ločeno po adapterju + uporabniku (`setScope`) |
| `search.js` | iskalno polje z avtocomplete (`createSearch`), žeton lika (`token`) |
| `bonus.js` | bonus vprašanja (izbira, drsnik, razvrščanje) + kartica »Dosje razkrit« |
| `sound.js` | sintetizirani efekti (WebAudio) |
| `modes/klasika.js` | način Klasika (tudi arhivska Klasika prek `ctx.archive`) |
| `modes/hintmode.js` | skupno ogrodje načinov z namigi (`createHintMode`) |
| `modes/emoji.js`, `kostum.js`, `dosje.js` | načini 2. faze (le prikaz namigov + dosežki) |
| `share.js` | deljenje, »POW!«, odštevalnik (vsi načini) |
| `main.js` | zagon, zavihki načinov, statistika, nastavitve, pomoč, »Prijatelji danes«, dosežki, arhiv 📅, popolni dan, »Deli vse današnje« |

Id-ji načinov (seed lestvice `datum:način`, statistika, Supabase): `klasika`, `klasika-mcu`, `klasika-dc`,
`emoji`, `kostum`, `dosje` (`ALL_MODE_IDS` v `logic.js`). `?nacin=emoji` odpre način neposredno.

## Vmesnik načina

```js
export const id = 'klasika', label = 'Klasika', icon = '🧩';
export function isSolved(store, date) {}   // kljukica na zavihku
export function mount(el, ctx) {}          // ctx: { hub, ui, util, daily, heroes, byId, sound, store, date,
                                           //        unlock(key), onChange(), openStats(mode), showLegend(key) }
                                           // 2. faza: goMode(id), nextMode(id), shareAll(), afterSolve(),
                                           //          archive? = { date, mode, heroId, entry, hero, onFinish }
export function isDone(store, date) {}     // neobvezno: rešeno/predano/izgubljeno (»Naslednji način →«)
export function unmount() {}
export function currentPool() {}           // neobvezno: bazen za »Prijatelji danes«
```
Nov način = nov modul v `modes/` + vrstica v `MODES` v `main.js`. Lik dneva vedno prek `daily.js`
(nov način: dodaj id v `POOL_IDS`/bazen v `logic.js` in v SQL `check (mode in …)`).

## Primerjava (Klasika)

Univerzum, vrsta, spol, stran: zeleno / rdeče. Ekipa: zeleno = ista **glavna** (prva) ekipa ali obe brez,
rumeno = katera koli skupna. Izvor moči: zeleno = enaki množici, rumeno = vsaj eden skupen. Prvi strip:
zeleno točno, rumeno ±10 let, puščica ↑ = skriti je kasnejši. Ista pravila sta v `logic.compare` in
`private.herodle_cmp` (SQL) — **pri spremembi popravi obe in znova poženi orodje**.

Deljenje: 6 kvadratkov (univerzum, ekipa, vrsta, izvor, spol, stran) + simbol letnice
(🟩 točno, 🔼/🔽 v 10 letih, ⬆️/⬇️ dlje). Več kot 8 poskusov: prve 3, »…«, zadnje 4.

## Dodajanje likov

1. V `heroes.js` dodaj objekt `H({ … })` (polja: `id, name, aliases, alterEgo, universe, teams, species, origins,
   gender, firstComic, alignment, inMcu, actors, firstFilm, home, nemesis, color, unsure`). Kar ni zanesljivo,
   daj v `unsure` (bonus ga ne uporabi). Vrednosti morajo biti iz seznamov v `logic.js`.
2. `node tools/herodle-sql.mjs` → osveži `supabase/games/herodle-heroes.sql` in `tests/fixtures/herodle-compare.json`.
3. `node tests/run-node.mjs` (preveri polja, dvojnike, »neločljive« like z enakimi 7 atributi, nemesis, svežost SQL).
4. Na Supabase poženi `herodle-heroes.sql` (upsert + `herodle_fill` doda le manjkajoče dni; pretekli razpored ostane).

## Supabase

`supabase/games/herodle.sql` (najprej), nato `supabase/games/herodle-heroes.sql` in `herodle-hints.sql`. Sol se ustvari v bazi
(`private.herodle_secret`), razpored (`herodle_daily`) ni berljiv za `anon`/`authenticated`; RPC-ji
`herodle_check`, `herodle_hint`, `herodle_reveal`, razvojni `herodle_compare`. Offline (`?offline=1`) ima namenoma drug razpored
in podpira `?date=YYYY-MM-DD` za testiranje nizov.

## Načini z namigi (2. faza)

| Način | Namigi (po številu **napačnih** poskusov `w`) | Konec |
|---|---|---|
| 😶‍🌫️ Emoji | prvih `min(5, 1 + w)` emojijev | neomejeno, »Predam se« |
| 🎨 Kostum | paleta vedno; prevladujoča barva pri `w ≥ 3`; simbol (ali univerzum) pri `w ≥ 5` | neomejeno, »Predam se« |
| 🗂️ Dosje | prvih `min(6, 1 + w)` namigov | po 6 napačnih se dosje zapre (ni rešeno) |

Pravila so v `logic.hintStage`/`visibleHints` **in** v `private.herodle_hints_for` (SQL) — pri spremembi popravi
obe. Ime prevladujoče barve (`logic.colorName`, 12 osnovnih) se izračuna iz `palette[0]`; generator ga zapiše v
`herodle_hints.dominant`. Vsak način ima svoj lik dneva iz bazena Mešano (isti dan različni liki v vseh šestih),
svoj niz, statistiko in zavihek na lestvici. Bonus krogi so samo v Klasiki.

**Zaščita namigov (online):** `herodle_hints` ni berljiva; `herodle_check` za te načine šteje napačne poskuse v
`herodle_progress` (piše samo RPC) in vrne le dovoljene namige; `herodle_hint` jih vrne po osvežitvi. Online adapter
`hints.js` pred rešitvijo **ne uvozi**. Ker pa je `hints.js` javen (kartica, arhiv, offline), lahko vztrajen goljuf
lik poišče po prvem emojiju ali paleti — to je sprejemljivo, lestvice so »na časten način«.

**Arhiv 📅:** zadnjih 30 dni (od `EPOCH`), vsi bazeni Klasike in vsi trije novi načini. Lik preteklega dne da
`herodle_reveal` (offline seed), igra se lokalno (`logic.compare` / `stepGuess` + `hints.js`), stanje v
`herodle:<obseg>:a:<način>:<datum>`. Ne šteje za lestvico, niz in statistiko; šteje za XP (5 na rešeno) in naloge
(`reportGame({ daily: false })`, `herodle:archive`). Dan, ki je bil rešen/predan kot dnevna uganka, je samo pogled.

**Popolni dan:** isti dan rešeni Klasika (kateri koli bazen) + Emoji + Kostum + Dosje → +20 XP, `herodle:perfect-day`,
dosežek in vrstica »🏆 Popolni dan« pri »Deli vse današnje«.

Dogodki za naloge: `herodle:mode` (prvič rešen način dneva; Klasika enkrat ne glede na bazen), `herodle:dossier`
(poskusi), `herodle:perfect-day`, `herodle:archive`.

### Dodajanje likov (2. faza)

Nov lik potrebuje tudi vnos v `hints.js` (test preveri popolnost, `palette[0] === color`, brez imena/aliasa/alter ega
v dosjeju, brez zastav v emojijih). Nato `node tools/herodle-sql.mjs` in na Supabase poženi še `herodle-hints.sql`.
