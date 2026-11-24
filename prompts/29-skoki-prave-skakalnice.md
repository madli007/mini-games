# Prompt za AI agenta: Smučarski skoki — prave skakalnice (imena krajev, profili po FIS-ovih certifikatih)

> **Stanje:** ⬜ čaka — predpogoj: 12 (letalnica in parametri skakalnice v modelu)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/29-skoki-prave-skakalnice.md in ga v celoti izvedi.«**
>
> Ozadje: 1. faza (`prompts/11-skoki.md`) in 2. faza (`prompts/12-skoki-tekma.md`) sta narejeni. Vse dosedanje
> skakalnice so izmišljene in v meniju spadajo v skupino **»Trening«** (Brezova, Bistra, Orlova, letalnica in posebne
> iz 2. faze). Ta prompt doda drugo skupino, **»Prave skakalnice«**: skakalnice s pravimi imeni krajev in profili,
> prepisanimi iz FIS-ovih certifikatov. Na njih se v 3. fazi (`prompts/13-skoki-pokal.md`) skačeta pokal in
> »Turneja 4 skakalnic«.
>
> **Fizika, točkovanje in trening skakalnice se ne spremenijo.** Obstoječi ghosti, lestvice in vsi testi ostanejo
> veljavni. Če moraš kaj spremeniti v `physics-params.json`, dvigni `paramsVersion` in to utemelji v `PROGRESS.md`.

---

## 1. Pravila za imena (obvezno)
- Skakalnica nosi **ime kraja** (»Planica«, »Kulm«, »Bischofshofen«, »Zakopane« …), po potrebi z velikostjo
  (»Planica, velika«). Zemljepisna imena so prosta.
- **Ne uporabljaj:** uradnih imen objektov, stadionov in sponzorskih imen (npr. »Bergiselschanze«,
  »… Arena Oberstdorf«, »Letalnica bratov Gorišek«), logotipov, imen tekmovanj (FIS kot znamka, Novoletna turneja,
  Vierschanzentournee, Four Hills, Raw Air, Planica 7), pokalov (Zlati orel) in **imen pravih skakalcev**.
- Teme (nebo, okolica, gore, letni čas) so **navdihnjene s krajem**, a narisane po naše. Ne posnemaj TV-prenosov ali
  uradne grafične podobe. Panoji imajo izmišljene napise ali imena iger huba (kot do zdaj).
- V meniju ob skakalnici: »po profilu skakalnice v <kraj> (certifikat <leto>)«.

## 2. Geometrija iz certifikatov
- Za vsako skakalnico poišči **aktualni FIS-ov certifikat** (javni PDF, fis-ski.com → Hill certificates) in iz njega
  prepiši parametre, ki jih že uporablja `hill.js`: `gamma`, `alpha`, `e2`/dolžina zaleta, `r1`, `t`, `s`, `beta`,
  `b0`, `r2`, `pArc`/`lArc` (ali ustrezne točke P, K, L), K, HS, naklon iztečišča, število in razmik zaletnih mest.
  Kjer certifikat poda nekaj, česar model nima, ali obratno, to zapiši v `PROGRESS.md` (kaj je izpeljano in kako).
- Vrednost metra, `base` in faktorji vetra/zaletnega mesta po FIS-ovih tabelah glede na K (kot v 1. fazi; letalnice
  `base` 120, meterValue 1,2).
- Številke spodaj so **izhodišče po spominu**. Vsako preveri v certifikatu in v README zapiši vir in leto certifikata.
- Če pravi profil ne deluje s fiziko (bot ne izpolni ciljev), **ne popravljaj profila**. Razširi model s parametri
  skakalnice iz 2. faze ali utemelji spremembo fizike (`paramsVersion`). Trening skakalnice se ne smejo spremeniti
  (testi to preverijo).

## 3. Seznam (vsaj 12)

| Kraj | Vrsta | K / HS (preveri) | Opomba |
|---|---|---|---|
| Planica, srednja | srednja | K95 / HS102 | domača; prva odklenjena prava |
| Planica, velika | velika | K125 / HS138 | |
| Oberstdorf | velika | K120 / HS137 | 1. postaja Turneje 4 skakalnic |
| Garmisch-Partenkirchen | velika | K125 / HS142 | 2. postaja turneje (novoletna tekma) |
| Innsbruck | velika | K120 / HS128 | 3. postaja turneje; mesto pod skakalnico |
| Bischofshofen | velika | K125 / HS142 | 4. postaja turneje, dolg zalet, večerna |
| Zakopane | velika | K125 / HS140 | velika množica |
| Willingen | velika | K130 / HS147 | največja velika, vetrovna |
| Lahti | velika | K116 / HS130 | |
| Engelberg | velika | K125 / HS140 | |
| **Planica, letalnica** | letalnica | K200 / HS240 | finale pokala |
| Kulm | letalnica | K200 / HS235 | bolj zavito doskočišče |
| Vikersund | letalnica | K200 / HS240 | |
| Oberstdorf, letalnica | letalnica | K200 / HS235 | neobvezno |

- Vsaka skakalnica: JSON v `games/skoki/hills/` z `group: "prave"` in poljem
  `real: { venue, country, certYear, source, record?: { dist, year } }`. Rekord skakalnice je **brez imena skakalca**
  (»Rekord skakalnice: 253,5 m (2017)«). Preveri ga iz zanesljivega vira ali ga izpusti.
- Validator (`validateHill`) mora vse sprejeti. Razširi ga za `group` in `real` (obvezna polja pri `group: "prave"`).

## 4. Meni, odklepanje, lestvice
- Izbira skakalnice ima dve skupini: **Trening** in **Prave skakalnice** (zastavica države, K/HS, rekord skakalnice,
  moj rekord). Na telefonu pregledno, po skupinah zložljivo.
- **Odklepanje:** Planica srednja je odprta. Velike se odklenejo s skokom čez K na Orlovi ali Planici veliki (izberi
  in dokumentiraj), letalnice s skokom čez HS na kateri koli pravi veliki. Odklepi so dosežki (veljajo povsod).
- Vsaka prava skakalnica ima svojo lestvico »Rekord skakalnice« (`seed: 'hill:<id>'`), ghoste in vrstico v
  `skoki_hills` (`max_points`, `max_dist` iz `scoring.js`). Posodobi blok `BEGIN HILLS` v `supabase/games/skoki.sql`,
  poženi ga kot migracijo in preveri advisors.
- **Dosežki (vsaj 4):** `prava-k` (čez K na pravi skakalnici), `rekord-skakalnice` (daljši od pravega rekorda
  skakalnice, brez padca), `vse-letalnice` (čez K na vseh letalnicah), `popotnik` (skok na vseh pravih skakalnicah).
- Prave skakalnice so na voljo v Treningu, Rekordu skakalnice, Tekmi, Lokalni tekmi in dnevnem izzivu.

## 5. Uravnoteženje in testi
- `tools/skoki-balance.mjs` izpiše tabelo tudi za prave skakalnice. **Bot mora na vsaki izpolniti cilje** iz 1. faze.
  Tabela gre v README.
- Testi: validator za vse prave skakalnice, `real` in `group`, nespremenjene daljave bota na trening skakalnicah
  (regresija), odklepanje, `max_points`/`max_dist` se ujema s `scoring.js`.

## 6. Preverjanja
1. `node tests/run-node.mjs` in `tests.html` zelena.
2. V brskalniku vsaj 5 skokov na vsaki pravi skakalnici (velike in letalnice z miško in s tipkovnico), meni na
   telefonu (375×812) in namizju, odklepanje, lestvica in ghost na eni pravi skakalnici (`?igralec=1`/`2`).
3. Konzola brez napak, offline (`?offline=1`) deluje.
4. `PROGRESS.md`, README igre (seznam pravih skakalnic z viri), to stanje → ✅, `prompts/README.md`.

V končnem odgovoru povzemi: katere skakalnice so dodane (z viri certifikatov), kje se je moral prilagoditi model,
tabelo uravnoteženja.
