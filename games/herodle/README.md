# Herodle 🦸

Dnevna uganka: ugani skritega junaka ali zlobca (Marvel + DC) po barvnih namigih atributov.
Neuradna fan igra, ni povezana z Marvel ali DC (brez slik, logotipov, citatov).

Faze: **1. (ta)** podatki, Klasika (3 bazeni, težki način), bonus, statistika, deljenje, Supabase ·
2. `prompts/14-herodle-nacini.md` (Emoji, Kostum, Dosje, arhiv) · 3. `prompts/15-herodle-dvoboj.md` (dvoboj, TV).

## Zgradba

| Datoteka | Vsebina |
|---|---|
| `heroes.js` | 180 likov (polja spodaj); `HEROES`, `heroById()` |
| `logic.js` | čista logika: dovoljene vrednosti, `compare`, težki način, offline razpored, iskanje, bonus, deljenje, statistika, komentator, XP, `EPOCH` |
| `daily.js` | **en vir za lik dneva**: `init(hub, heroes)`, `getToday(mode)`, `check(mode, date, heroId)`, `giveUp(mode, date)`, `reveal(mode, date)`; adapterja online (RPC) / offline z enakim vmesnikom |
| `store.js` | lokalno stanje dneva, statistika, nastavitve (`shared/storage.js`), ločeno po adapterju + uporabniku (`setScope`) |
| `search.js` | iskalno polje z avtocomplete (`createSearch`), žeton lika (`token`) |
| `bonus.js` | bonus vprašanja (izbira, drsnik, razvrščanje) + kartica »Dosje razkrit« |
| `sound.js` | sintetizirani efekti (WebAudio) |
| `modes/klasika.js` | način Klasika |
| `main.js` | zagon, zavihki načinov, statistika, nastavitve, pomoč, »Prijatelji danes«, dosežki |

Id-ji načinov (seed lestvice `datum:način`, statistika, Supabase): `klasika`, `klasika-mcu`, `klasika-dc`;
2. faza doda `emoji`, `kostum`, `dosje`.

## Vmesnik načina

```js
export const id = 'klasika', label = 'Klasika', icon = '🧩';
export function isSolved(store, date) {}   // kljukica na zavihku
export function mount(el, ctx) {}          // ctx: { hub, ui, util, daily, heroes, byId, sound, store, date,
                                           //        unlock(key), onChange(), openStats(mode), showLegend(key) }
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

`supabase/games/herodle.sql` (najprej), nato `supabase/games/herodle-heroes.sql`. Sol se ustvari v bazi
(`private.herodle_secret`), razpored (`herodle_daily`) ni berljiv za `anon`/`authenticated`; RPC-ji
`herodle_check`, `herodle_reveal`, razvojni `herodle_compare`. Offline (`?offline=1`) ima namenoma drug razpored
in podpira `?date=YYYY-MM-DD` za testiranje nizov.
