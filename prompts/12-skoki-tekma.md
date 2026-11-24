# Prompt za AI agenta: Smučarski skoki — 2. faza (tekma do 10 igralcev, replay v živo, dnevni izziv, letalnica)

> **Stanje:** ✅ narejeno (`ab9c933`, popravki `ce81cbf`; SQL pognan; test s Supabase ni bil narejen — glej PROGRESS.md)

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/12-skoki-tekma.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »36. Smučarski skoki«. 1. faza (`prompts/11-skoki.md`) je narejena: `games/skoki/`
> ima determinističen fizikalni model, bota, tri skakalnice, točkovanje, ghoste, stran z drsniki in sodobno 2,5D
> grafiko. Ta faza doda **družabni del**. Svetovni pokal, kariera in trgovina so 3. faza (`prompts/13-skoki-pokal.md`).
>
> **Fizika in točkovanje se ne spremenita**: obstoječi ghosti, lestvice in testi uravnoteženja ostanejo veljavni.
> Če moraš kaj spremeniti v `physics-params.json`, dvigni `paramsVersion` in to utemelji v `PROGRESS.md`.

---

## Kaj se spremeni pri vnosu igre
- **Način:** `turn` · **Število igralcev:** 1–10 · **Oznake:** dodaj `party`, `daily`.
- Kratek opis posodobi: »… Tekma do 10 prijateljev v dveh serijah, replay v živo, dnevni izziv in letalnica.«
- Igra ostane ena kartica v `games.json`; v meniju igre so načini Trening, Rekord skakalnice, **Tekma**, **Lokalna tekma**, **Dnevni izziv**, poleg tega zaslon **Moji skakalci**.

---

## 1. Tekma s prijatelji (2–10 ljudi, room koda)

### Postavitev
- Host ustvari sobo (`hub.createRoom`, `ui.lobby`), ostali se pridružijo s kodo ali `?room=`. Host je lahko na
  **TV-ju/prenosniku** (`?tv=1` ali gumb »TV pogled«: velika slika skakalnice, lestvica ob strani, brez kontrol) ali igra
  sam s telefona. Vsak igralec skače s **svojega** zaslona.
- **Boti za dopolnitev polja** (0–20, iz `bot.js` 1. faze): host izbere število in spretnost (Začetniki / Mešano /
  Svetovni razred). Boti imajo **izmišljena imena in zastave** (seznam vsaj 40 imen s slovenskim humorjem in tujimi
  zvenečimi priimki, ne pravih skakalcev), skačejo hitro (replay se lahko pospeši ali preskoči), štejejo v vrstni
  red in rezultate, ne pa za XP in dosežke.

### Nastavitve v lobbyju
- **Skakalnica** (vse odklenjene; privzeto srednja) ali »naključna«.
- **Format:** ena serija / **dve seriji** (privzeto) / poskusna serija + dve seriji. V drugo serijo gre vseh ali
  najboljših N (nastavljivo, privzeto vsi; pri polju z boti privzeto 30).
- **Veter:** *enak za vse* (vsak skakalec v isti seriji dobi isti profil vetra iz seeda serije — najbolj pošteno, privzeto)
  / *spremenljiv* (veter iz seeda serije in štartne številke, s kompenzacijo kot na pravih tekmah) / *brez*.
- **Zaletno mesto:** samodejno (žirija) ali ročno (host). **Samodejna žirija:** začne z zaletnim mestom, pri katerem
  povprečen igralec ne preskoči HS; če kdo pristane čez 95 % HS (pri padcu ali preskoku za varnost), lahko za naslednje
  skakalce zniža zaletno mesto (kompenzacija velja). Odločitev je napisana na zaslonu (»Žirija je znižala zalet na 14.«).
- **Časovna omejitev:** po zeleni luči 10 s za štart (sicer **diskvalifikacija** s pravilom »ni štartal pravočasno«,
  ali »preskoči« v sproščenem načinu), plus skupni čas na skakalca (90 s), da tekma ne obstane.

### Potek
- **Vrstni red:** 1. serija v naključnem vrstnem redu iz seeda sobe (kasneje po razvrstitvi pokala, glej 3. fazo);
  **2. serija v obratnem vrstnem redu** po rezultatu 1. serije (najboljši skoči zadnji). Poskusna serija ne šteje.
- Med skokom **vsi ostali gledajo replay v živo**: aktivni skakalec pošilja vnose (`room.send`, paketi po ~100 ms:
  `{ jumpId, fromTick, inputs }`), gledalci simulirajo isti skok z zamikom ~300 ms (vmesni pomnilnik, da trzanje
  omrežja ni vidno). Ker je simulacija deterministična, vsi vidijo **isti** skok kot skakalec, ne približka.
  Če paketi zamujajo, gledalec ustavi simulacijo (»…«) in nadaljuje, ne ugiba.
- Po pristanku skakalec pošlje celoten zapis vnosov (`room.pushMove`) in svoj izračun. **Host simulacijo ponovi**
  iz vnosov in zapiše uradni rezultat v stanje (`room.setState(..., { expectedVersion })`). Če se izračuna ne ujemata
  (drug brskalnik, napaka), velja hostov in v razvojni konzoli je opozorilo. Tako je rezultat »na časten način«, a
  goljufanje s ponarejenimi točkami ni mogoče brez ponarejanja vnosov.
- Po vsakem skoku vsi vidijo **rezultatno kartico** (kot v 1. fazi) in **sprotno lestvico** s spremembo mest
  (puščice ↑↓), vodilni ima »zeleno črto« na doskočišču za naslednje skakalce.
- **Reakcije gledalcev:** gumbi na telefonu (kravji zvonec, 👏, 😱, 🔥), ki se med skokom pokažejo na zaslonu
  skakalca in TV-ja (z omejitvijo, npr. 1 na 2 s na igralca) in sprožijo zvok publike. Gledalec naj ima kaj početi.
- Konec: **razglasitev** v slogu prenosa (oder za prve tri, zastave, sintetizirana kratka fanfara, konfeti), nato
  `ui.results` s skupnimi točkami obeh serij in **posebnimi nagradami** (»Najdaljši skok«, »Najlepši slog«,
  »Najbolj nesrečen veter«, »Kralj padcev«, »Največji napredek v 2. seriji«).

### Odpornost (obvezno)
- **Prenos hosta** (`room.on('hostChanged')`): nov host nadaljuje iz zadnjega stanja; če je bil skok sredi leta,
  počaka na `pushMove` skakalca ali po času dovoli ponovitev skoka.
- **Osvežitev strani** igralca: `joinRoom(hub.roomFromUrl())`, iz stanja in potez obnovi lestvico in vse
  pretekle skoke (lahko si jih ogleda kot replay). Če je bil na vrsti, dobi skok znova.
- **Odhod aktivnega skakalca** sredi skoka: po časovni omejitvi je skok »ni dokončal« (0 točk) ali, v sproščenem
  načinu, gre na konec serije. Odhod igralca, ki še ni skočil: preskočen, viden kot »odšel«.
- Pridružitev med tekmo: **gledalec** do konca, v naslednji tekmi skakalec.

### Ekipna tekma (neobvezno, če ostane čas)
2–4 ekipe po 2–4 skakalce (dodelitev v lobbyju ali naključno), seštevek točk ekipe, serije po skupinah (vsak
iz vsake ekipe po vrsti). Rezultat ekipe v `ui.results`.

### Lastni skakalci in lokalna tekma (na eni napravi)
Kot v starih računalniških skokih: igralec si sestavi **svoj seznam skakalcev** in tekmuje z njimi sam ali s
prijatelji za istim računalnikom.
- **Urejevalnik skakalcev** (nov zaslon v meniju »Moji skakalci«): ime (poljubno, vnese ga igralec), zastava, barvi
  dresa in čelade (le videz v tekmi, ločeno od kozmetike iz trgovine), **tip**: *človek* (skače nekdo za to napravo)
  ali *bot* (spretnost 0–1 in značaj iz `bot.js`, npr. »agresiven odriv«, »varen pristanek«, »nestanoviten«).
  Dodaj, uredi, podvoji, izbriši, razvrsti. Do 60 skakalcev. Shrani lokalno (`shared/storage.js`).
  Igra **sama ne ponuja imen pravih skakalcev**: kar igralec vpiše, je njegovo (tudi če je to ime pravega skakalca).
- **Deljenje seznama:** izvoz/uvoz kot kratka koda ali datoteka JSON (z validacijo in omejitvijo velikosti), da si
  prijatelji izmenjajo »svoje ekipe«. Seznam se ne pošilja na strežnik in ne prikazuje drugim brez izvoza.
- **Lokalna tekma** (brez sobe, deluje offline): izbereš skakalce s seznama (ali »vse«), skakalnico in iste nastavitve
  kot pri Tekmi (serije, veter, žirija, poskusna serija). Človeški skakalci skačejo **po vrsti na isti napravi**
  (vmesni zaslon »Na vrsti: <ime>, pritisni za štart«), boti skočijo sami (pospešen ali preskočen replay, po izbiri).
  Enak potek, rezultatna kartica, razglasitev in `ui.results` kot pri spletni tekmi. Ponovno uporabi isto logiko
  tekme (`sport/`), ne podvajaj je.
- **Statistika po skakalcu** (lokalno): skoki, najdaljši skok po skakalnici, zmage, stopničke. Zaslon »Moji skakalci«
  pokaže tabelo, kot bi bila sezona tvoje lige.
- **Točkovanje v hubu:** lokalna tekma **ne gre na lestvice** in ne daje ghostov (en človek lahko skače za več
  skakalcev). Po koncu `hub.reportGame({ won, players: <število človeških skakalcev>, score: <najboljši človeški>, daily: false })`,
  `won` = prvo mesto je človeški skakalec. XP kot za trening (dokumentiraj v `PROGRESS.md`).
- **Boti v spletni tekmi:** host lahko polje dopolni z boti s **svojega seznama** namesto z vgrajenimi izmišljenimi imeni.
- Testi: validacija uvoza (prevelik, pokvarjen, neznana polja), vrstni red in točke lokalne tekme z mešanico ljudi in
  botov (z vnaprej posnetimi vnosi), statistika po skakalcu.

---

## 2. Dnevni izziv
- `hub.rng(hub.dailySeed() + ':skoki')` izbere **skakalnico dneva**, veter dneva (povprečje in sunki, enako za vse)
  in **pogoj dneva**, npr. »Sneženje« (slabša vidljivost, malo več trenja v smučini), »Noč pod reflektorji«,
  »Sunkovit veter«, »Nizko zaletno mesto«, »Samo telemark šteje« (dve nogi = padec po slogu), »Luna« (le na Lunini skakalnici).
- **Trije poskusi, šteje najboljši.** Poskus se porabi ob štartu (zelena luč), ne ob odprtju igre. Jasno pokaži,
  koliko jih je ostalo in odštevanje do polnoči. Po treh poskusih lahko skačeš naprej kot trening (označeno).
- Lestvica dneva: `hub.submitScore(točke, { seed: hub.dailySeed(), meta: { hill, dist } })`, `ui.leaderboard` na
  zavihku Danes. **Ghost vodilnega dneva** (in prijatelja, ki ga klikneš) se lahko vključi pri naslednjem poskusu.
- `hub.reportGame({ daily: true, … })` po porabljenih poskusih (ali ko igralec zaključi dan), dogodek `daily:skoki`.

---

## 3. Nove skakalnice (vsaj 5, skupaj vsaj 8)
Vse kot JSON v `games/skoki/hills/`, profil iz parametrov (`hill.js`), validator mora vse sprejeti, **bot mora na vsaki
izpolniti cilje uravnoteženja** (tabela iz `tools/skoki-balance.mjs` v README).

### Trening skakalnice (izmišljene)
Vse skakalnice v tej fazi so **izmišljene** in v meniju spadajo v skupino **»Trening«**, skupaj z Brezovo, Bistro in
Orlovo iz 1. faze (te ostanejo, kot so). **Prave skakalnice** (imena krajev, profili po FIS-ovih certifikatih) pridejo
posebej v `prompts/29-skoki-prave-skakalnice.md`. Meni in format skakalnice pripravi tako, da se druga skupina
(»Prave skakalnice«) doda brez predelave (polje `group` v `hills/index.json` ali v JSON-u skakalnice, privzeto `trening`).

| Predlog | K / HS | Posebnost |
|---|---|---|
| **Letalnica** pod gorami (npr. »Orlovo gnezdo«) | K200 / HS240 | `base` 120, meterValue 1,2, let 7–8 s, močan vzgon, kamera se še bolj oddalji; zgodnja pomlad, množica 30.000 |
| Nočna (»Reflektor«) | K120 / HS134 | reflektorji, žarki v megli (bloom), sneg v svetlobi, publika z lučkami telefonov |
| Puščavska (»Sipina«) | K105 / HS117 | doskočišče iz snega sredi peska (izmišljena dvorana pod kupolo ali umeten sneg), toplotni vzgonski stebri kot sunki od spodaj |
| Lunina (»Mirno morje«) | K150 / HS180 | gravitacija 1,62 m/s², **brez zraka** (ni vzgona ne upora, čisto balistično, nagib vpliva le na pristanek), zvezdnato nebo, Zemlja v ozadju; ločena lestvica, ne šteje v pokal |
| Mini (»Zajček«) | K20 / HS24 | otroška skakalnica, za šalo in za prve korake, publika iz plišastih živali |

- Letalnica mora imeti **svoj občutek**: dolgo, mirno jadranje, kjer vsak mali popravek šteje, in nevaren pristanek.
  Če model iz 1. faze tega brez sprememb ne zmore, razširi ga s **parametri skakalnice** (npr. `airDensity`, `gravity`,
  `noAir`), ne s posebnimi primeri v kodi; obstoječe tri skakalnice se ne smejo spremeniti (testi to preverijo).
- **Odklepanje:** Mini, mala, srednja in velika so odprte. Nočna in Puščavska se odklenete s skokom čez K
  na veliki, Letalnica s skokom čez HS na veliki, Lunina s katerimkoli skokom na letalnici čez K. Odklepi so dosežki (veljajo
  na vseh napravah). V tekmi lahko host izbere le skakalnice, ki jih ima odklenjene host (ali vsaj en igralec — izberi in dokumentiraj).

---

## 4. Skupni modul za tekmovanja (`games/skoki/sport/`)
Zasnovan je tako, da ga bodo uporabile druge športne igre (biatlon, slalom, bob …), zato **brez skakalnih pojmov**:
- `competition.js` (čista logika): udeleženci (ljudje in boti), serije, vrstni red (naključen iz seeda, obraten po
  rezultatu, po razvrstitvi), rez za naslednjo serijo, izenačenja (deljeno mesto), statusi DNS/DSQ/DNF, seštevek,
  razvrstitev, posebne nagrade kot vtičniki. Stanje je serializabilno (gre v `room.setState`).
- `live-replay.js`: pošiljanje in prejemanje toka vnosov, vmesni pomnilnik, sinhronizacija ob pridružitvi, preverjanje
  pri hostu (kliče funkcijo igre `simulate(inputs) → result`).
- `README.md` v `sport/`: kako ga uporabi nova igra (primer s psevdo igro).
- Vse pokrito s testi (vrstni red 2. serije, rez, izenačenja, DSQ, obnova iz serializiranega stanja, tok vnosov z
  izgubljenim/zamujenim paketom).

---

## Hub, XP, dosežki, naloge (dodatki)
- `hub.reportGame({ won, players, score, daily })` po vsaki končani tekmi, enkrat na človeka (`won` = 1. mesto med ljudmi,
  `players` = število ljudi), in po dnevnem izzivu.
- **XP:** 30 za končano tekmo, +60 za zmago z vsaj 2 človekoma, +20 za mesto na odru, +20 za dnevni izziv.
- Dogodki: `skoki:tekma`, `skoki:zmaga`, `skoki:oder`, `skoki:letalnica` (skok čez K na letalnici), `daily:skoki`.
- **Dosežki:** `zmaga` (prva zmaga na tekmi), `deset` (zmaga v tekmi z 10 ljudmi), `obrat` (zmaga iz 4. mesta ali nižje
  po 1. seriji), `letalec` (čez 200 m), `orlovo-gnezdo` (čez HS na letalnici brez padca), `luna` (skok na Luni),
  `zirija` (skok, po katerem je žirija znižala zalet), `dnevni-7` (dnevni izziv 7 dni zapored), `zvoncek` (100 poslanih reakcij).
- **Naloge v `games.json`:** dodaj `m` »Zmagaj na tekmi v skokih« (`skoki:zmaga`, 1), `h` »Preleti K na letalnici«
  (`skoki:letalnica`, 1), `w` »Odskači 5 tekem ta teden« (`skoki:tekma`, 5). Obstoječe naloge ostanejo.

## Videz in zvok (dodatki)
- TV pogled: velika skakalnica, desno sprotna lestvica (z avatarji `ui.who`), spodaj trak »na vrsti je …« in »naslednji«,
  ob skoku lower-third z imenom, zastavo, mestom po 1. seriji in »za vodstvo potrebuje 128,5 m« (izračunaj daljavo, ki
  bi pri tem vetru in zaletu prinesla vodstvo, kot na TV).
- Telefon gledalca: manjša slika skoka, gumbi za reakcije, lestvica pod njo. Telefon skakalca: enake kontrole kot v 1. fazi.
- Zvok publike na TV-ju je glavni (gledalci na telefonih ga po želji utišajo), reakcije prijateljev se slišijo.

## Ni del te naloge (3. faza)
- Svetovni pokal (sezona, točke 100-80-60…), kariera, predmeti v trgovini, izvoz športnega okvirja v `shared/`.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri, posebej sobe, prenos hosta in potezne igre.
3. `games/skoki/README.md` in kodo 1. faze (fizika, bot, ghost, točkovanje, renderer).
4. `games/reakcija/` (multiplayer s prenosom hosta), `games/minigolf/` in `games/rusilec/` (realtime/potezno z replayem
   iz vnosov, TV pogled, boti), `prompts/TEMPLATE-igra.md`.

### Tehnično
- Vse v `games/skoki/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- Multiplayer: host vodi tekmo in preverja rezultate s ponovno simulacijo; tok vnosov z `room.send` (ne v bazo za vsak
  tick); trajno stanje tekme z `room.setState(state, { expectedVersion })`, zapisi skokov z `room.pushMove`.
- Podpri **prenos hosta** in **ponovno povezavo** (glej Odpornost). Stanje redno pošiljaj vsem.
- Brez novih tabel, razen če so res potrebne; če jih dodaš, v `supabase/games/skoki.sql` (idempotentno, RLS, predpona
  `skoki_`), poženi z MCP orodji in preveri `get_advisors`.
- Testi v `tests/tests.js`: `sport/competition.js`, `sport/live-replay.js`, žirija (znižanje zaleta in kompenzacija),
  enak veter za vse (isti seed serije = isti profil), dnevni izbor (determinizem, isti za vse), nove skakalnice
  (validator, uravnoteženje z botom), **nespremenjenost prvih treh skakalnic** (isti vnosi = ista daljava kot pred to fazo;
  shrani nekaj referenčnih skokov iz 1. faze kot fiksture).
- Razvojni parametri: `?bots=9` (hitra tekma z boti), `?tv=1`, `?fast=1` (boti skačejo brez replaya).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, na dashboardu in v ostalih igrah, ki si se jih dotaknil.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi nespremenjeni).
4. Multiplayer v **offline načinu** (`?offline=1`) v 3 zavihkih + TV zavihek: ustvari sobo, pridruži se s kodo in prek
   `?room=`, odskačite tekmo z dvema serijama in boti do konca, preveri **replay v živo** (gledalec vidi isto daljavo kot
   skakalec), reakcije, žirijo, odhod hosta sredi skoka, osvežitev igralca, ki je na vrsti, in pridružitev med tekmo.
5. S Supabase (`?igralec=1/2/3`): ena cela tekma, izmeri zamik replaya in zapiši v `PROGRESS.md`.
6. Dnevni izziv: trije poskusi, lestvica dneva, ghost vodilnega; preveri, da drugi igralec dobi isto skakalnico in veter.
7. Vsaka nova skakalnica: vsaj 5 skokov ročno, posnetek zaslona; Letalnica in Lunina se morata počutiti drugače.
8. Izgled na **telefonu (375×812)** (skakalec in gledalec), **namizju** in **TV pogledu (1920×1080)**: posnemi zaslone,
   sam jih preglej in popravi, kar je neurejeno.
9. Posodobi `games.json` (opis, način, oznake, naloge; test sheme uspe), `PROGRESS.md`, `games/skoki/README.md`
   (tekma, dnevni izziv, nove skakalnice, tabela uravnoteženja) in `games/skoki/sport/README.md`.
10. Testne profile, sobe in vrstice v produkcijski bazi na koncu **izbriši**.
11. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako organizirati tekmo s prijatelji, katere skakalnice so nove
in kako težke so, kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
