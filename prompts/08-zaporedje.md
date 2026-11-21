# Prompt: Zaporedje (spominska igra)

> V novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši:
> **»Preberi prompts/08-zaporedje.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »19. Zaporedje (Simon)«.

---

## Igra

- **Ime:** Zaporedje
- **id / mapa:** `zaporedje` → `games/zaporedje/` (nov vnos v `games.json`)
- **Kratek opis (za kartico, do 160 znakov):** »Polja zasvetijo, ti ponoviš. Vsak krog en korak več. Dnevno zaporedje za vse ali spominski dvoboj do 10 igralcev.«
- **Način:** `realtime`
- **Število igralcev:** 1–10 (solo in dnevni izziv; multiplayer 2–10)
- **Oznake:** `spomin`, `daily`, `party`, `rekordi`
- **Ikona / barva:** 🎹 · `#b86bff`
- **Rezultat:** dolžina najdaljšega pravilno ponovljenega zaporedja (število korakov). **Več je bolje**
  (`scoreOrder: 'desc'`, `scoreUnit: 'korakov'`). Na lestvico gre **dnevni izziv**; klasika ima osebni rekord,
  multiplayer šteje za XP, kovance, dosežke in naloge.

Igra je navdihnjena s klasično elektronsko igro ponavljanja zaporedij, ni pa njena kopija: ime, oblika,
barve in zvoki so naši. Ne uporabljaj imena »Simon«, njegove okrogle oblike s štirimi kvadranti ali
originalnih tonov.

### Občutek in stil (pomembno!)
Igra mora delovati **moderno in sočno**, ne kot štirje pobarvani kvadrati. Torej:
- **Neon instrument**: štiri velike ploščice v mreži 2×2 z zaobljenimi robovi na temnem ozadju, vsaka svoje barve
  **in svojega simbola** (● ▲ ■ ◆), da je igra igrljiva tudi za barvno slepe. Ob prižigu ploščica zažari (glow,
  rahla povečava, val svetlobe čez ozadje). Izhajaj iz `shared/ui.css` in barve igre `#b86bff`.
- **Zvok**: vsaka ploščica ima svoj ton, sintetiziran prek WebAudio (brez zvočnih datotek). Toni naj skupaj
  zvenijo lepo (npr. pentatonika), da daljše zaporedje zveni kot melodija. Napaka: kratek »bzzz«; nov rekord:
  kratka fanfara. Gumb za utišanje, nastavitev zapomni prek `shared/storage.js`.
- **Ritem in napetost**: števec krogov velik na sredini; tempo predvajanja se s krogi stopnjuje (npr. 600 ms →
  250 ms na korak). Med vnosom tanek trak pokaže, koliko korakov je še ostalo. Pri dolžini, ki je enaka tvojemu
  rekordu, se ozadje obarva zlato (»Izenačil si rekord!«).
- **Juice**: ob pravilno končanem krogu kratek »pulse« vseh ploščic, ob napaki pravilna ploščica utripne, da
  vidiš, kje si se zmotil, rahel screen shake in `navigator.vibrate` na telefonu (v `try/catch`).
- **Komentator**: kratki slovenski napisi ob mejnikih, npr. »Deset! Spomin kot slon.«, »Petnajst, kdo te ustavi?«,
  »Ups, ▲ ni ■.« Vsaj ~15 variant.
- Vse animacije spoštujejo `prefers-reduced-motion` (takrat samo sprememba svetlosti, brez gibanja).

### Načini
1. **Klasika** (solo): neskončno, vsak krog doda en naključen korak. Ena napaka in konec. Osebni rekord se
   shrani; na koncu gumb »Še enkrat«.
2. **Dnevni izziv** (solo): `hub.dailySeed` + `hub.rng` določita **celotno zaporedje dneva** (vsaj 100 korakov)
   in **modifikator dneva**, enak za vse. Prvi poskus dneva šteje za lestvico (`hub.submitScore`), ostali so
   vaja. Modifikatorji (pripravi vsaj 6):
   - *Zrcalo*: zaporedje ponoviš od zadaj naprej;
   - *Šest*: 6 ploščic v mreži 3×2;
   - *Tišina*: brez zvoka, samo luč;
   - *Samo posluh*: ploščice ne zasvetijo, samo toni (simboli ostanejo, da veš, kateri ton je kateri);
   - *Kameleon*: po vsakem krogu ploščice zamenjajo mesta (barva + simbol + ton ostanejo skupaj);
   - *Turbo*: tempo od začetka hiter;
   - *Brez modifikatorja* (tudi to je lahko dnevni).
3. **Spominski dvoboj** (multiplayer 2–10): vsi na svojih telefonih dobijo **isto zaporedje** hkrati. Vsak krog:
   predvajanje za vse, nato vsak vnaša sam. Kdor se zmoti ali mu poteče čas, je izločen in postane opazovalec.
   Zmaga zadnji preživeli. Če se vsi preostali zmotijo v istem krogu, zmaga tisti, ki je prišel najdlje v tem
   krogu, nato hitrejši skupni čas vnosa.
4. **Štafeta** (multiplayer 2–10, potezno v isti sobi): igralci so na vrsti po krogu. Kdor je na potezi, ponovi
   celotno dosedanje zaporedje in **sam doda en korak**. Ostali gledajo v živo, kaj tapka. Napaka = izpad, igra
   teče dalje z ostalimi. Zmaga zadnji. To je »party« način, ki je najbolj zabaven na TV-ju.

### Pravila
- **Čas za vnos**: na vsak korak največ 3 s (nastavitev v lobbyju: 2 / 3 / 5 s / brez). Ob izteku = napaka.
- **Vnos med predvajanjem** je onemogočen; ploščice so vidno »zaklenjene«, dokler se predvajanje ne konča.
- **Tipkovnica** na namizju: privzeto `Q W A S` ali številke `1–4` (pri šestih ploščicah `1–6`), prikazane kot
  majhne oznake na ploščicah.
- **Ena »druga priložnost«** na igro samo v Klasiki (vklop v nastavitvah, privzeto izklopljeno): po napaki se
  krog ponovi. Igra s prižgano drugo priložnostjo **ne gre v osebni rekord** in ne odklepa dosežkov za dolžino.
- **Generator**: zaporedje je v Klasiki naključno, v dnevnem izzivu in v dvoboju pa iz seeda (v dvoboju ga host
  izbere ob začetku in ga pošlje vsem), tako da vsi dobijo enako. Ne sme biti več kot 3 enaki koraki zapored.

### Multiplayer
- Host vodi igro: izbere seed in nastavitve, začne krog, zbira rezultate krogov in razglasi izpade.
- **Dvoboj**: vsak klient sam preveri svoj vnos (repo je »na časten način«) in hostu pošlje
  `{ round, ok, progress, ms }` prek `room.send`. Host počaka vse žive igralce (ali časovno omejitev runde),
  nato pošlje stanje naslednjega kroga. Na vrhu zaslona vrstica igralcev z `ui.who(p)` / `ui.avatar(p)`:
  kdo je še v igri, kdo je že končal krog (kljukica), kdo je izpadel (sivo).
- **Štafeta**: poteze kot `room.pushMove`, stanje (`sequence`, kdo je na vrsti, kdo je izpadel)
  `room.setState(state, { expectedVersion })` po vsaki potezi. Tapi igralca na potezi gredo prek `room.send`,
  da ostali vidijo prižige v živo.
- **Prenos hosta**: `room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja (seed, krog,
  preživeli). **Ponovna povezava**: osvežitev → `joinRoom(hub.roomFromUrl())` → sinhronizacija; v dvoboju se
  igralec vrne v naslednji krog (krog, ki ga je zamudil, mu ne šteje kot napaka, če se vrne v 15 s), v štafeti
  na svojo potezo.
- **TV pogled** (neobvezen, `?tv=1` ali gumb v lobbyju): velike ploščice, ki predvajajo zaporedje, lestvica
  preživelih in v štafeti tapi igralca na potezi. Igralci pri dvoboju lahko gledajo TV in vnašajo na telefonu
  (na telefonu se predvajanje v TV načinu lahko izklopi).
- **Revanša**: gumb na koncu ustvari novo igro v isti sobi z istimi nastavitvami in novim seedom.

### Konec igre in povzetek
`ui.results` dopolni s **povzetkom**: dolžina zaporedja, povprečni čas na korak, najhitrejši krog, pri kateri
ploščici si se zmotil. V multiplayerju **nagrade**: *Slon* (najdlje preživel), *Strela* (najhitrejši povprečni
vnos), *Nesrečnik* (izpadel prvi), v štafeti *Skladatelj* (dodal korak, na katerem je izpadlo največ igralcev).

### Postavitev zaslona
- **Telefon (portret, 375 px)**: ploščice zavzamejo večino zaslona (velike, lahko jih zadeneš s palcem),
  zgoraj števec kroga in rekord, v multiplayerju vrstica igralcev. `touch-action: manipulation`, brez
  dvojnega tapa za zoom; tap se odzove na `pointerdown`, ne na `click`.
- **Namizje**: ploščice na sredini, ob strani lestvica / igralci, oznake tipk na ploščicah.

### Dosežki (vsaj 8)
- `prvi-koraki`: Prvi koraki — doseži zaporedje 5
- `slon`: Spomin kot slon — doseži zaporedje 15
- `mojster`: Mojster zaporedij — doseži zaporedje 25
- `genij`: Človeški trdi disk — doseži zaporedje 40
- `zrcalo`: Skozi ogledalo — v dnevnem z modifikatorjem *Zrcalo* doseži 10
- `posluh`: Absolutni posluh — v modifikatorju *Samo posluh* doseži 10
- `dvoboj`: Zadnji spomin — zmagaj spominski dvoboj z vsaj 4 igralci
- `skladatelj`: Skladatelj — v štafeti dodaj korak, na katerem izpadeta vsaj 2 igralca
- `strela`: Strela — končaj krog z 10+ koraki s povprečjem pod 300 ms na korak
- `vztrajen`: Vztrajen — dnevni izziv odigraj 7 dni zapored

### XP
15 za odigrano igro, +1 za vsak korak nad 5 (največ +40), +15 za dnevni izziv, +40 za zmago v multiplayerju.

### Naloge (`quests` v `games.json`)
Preden jih napišeš, preberi `shared/quests.js` in preveri, kako se seštevajo `target`/`goal` in `cmp` ter
kakšen je regex za id. Predlog:
- `e` »Odigraj igro Zaporedja« → `play:zaporedje`, target 1
- `e` »V Zaporedju doseži dolžino 8« → `zaporedje:len`, cmp `gte`, goal 8
- `m` »V Zaporedju doseži dolžino 12« → `zaporedje:len`, cmp `gte`, goal 12
- `m` »Odigraj dnevno zaporedje« → `daily:zaporedje`, target 1
- `h` »V Zaporedju doseži dolžino 20« → `zaporedje:len`, cmp `gte`, goal 20
- `h` »Zmagaj spominski dvoboj« → `zaporedje:mp-win`, target 1
- `w` »Ponovi skupaj 100 korakov ta teden« → `zaporedje:steps`, target 100 (shema dovoli največ 100)
- `w` »V Zaporedju 3-krat doseži dolžino 15« → `zaporedje:len`, target 3, cmp `gte`, goal 15

### Prioritete, če zmanjkuje časa
Najprej mora biti brezhibno: generator in preverjanje vnosa (`logic.js` s testi) → Klasika z zvokom in
animacijami → dnevni izziv z modifikatorji → spominski dvoboj → štafeta → TV pogled. Zvok in juice nista
»na koncu«, brez njiju igra nima smisla. Kar ne gre, zapiši v `PROGRESS.md` pod »Ni narejeno«.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja.
2. `shared/README.md` — API (`hub`, `room`, `ui`) s primeri.
3. `games/reakcija/` — referenčna igra (solo z dnevnim seedom + multiplayer s prenosom hosta).

### Tehnično
- Igra v `games/zaporedje/`, **brez build koraka**, ES moduli, relativne poti, besedila v slovenščini.
- `<body class="mg">`, `<link rel="stylesheet" href="../../shared/ui.css">` in `../../shared/cosmetics.css`, svoj CSS le za posebnosti igre.
- `import { hub, ui } from '../../shared/hub.js'`; `await hub.init({ gameId: 'zaporedje' })`; `ui.header({ title })`.
- Uporabi `shared/` za profil, XP (`hub.awardXp`), dosežke (`hub.unlock`), lestvice (`hub.submitScore`,
  `ui.leaderboard`), dnevni seed (`hub.dailySeed`, `hub.rng`), sobe (`hub.createRoom`, `hub.joinRoom`,
  `hub.roomFromUrl`, `ui.lobby`), konec igre (`ui.results`), `ui.toast`, `ui.modal`, `ui.countdown`.
- **Po vsaki odigrani igri pokliči `hub.reportGame({ won, players, score, daily })`** (kovanci, niz dni, dnevne
  naloge) — v solo in v multiplayerju, enkrat na igralca. Posebne dosežke za naloge sporoči s
  `hub.reportEvent('zaporedje:<ime>', vrednost)`; igra v `games.json` doda svoje predloge nalog (`quests`).
  Igralce prikazuj z `ui.who(p)` / `ui.avatar(p)` (p z `equipped`, npr. iz `room.players`), da se vidi kozmetika.
- Multiplayer: host vodi igro in preverja pravila; stanje pošilja z `room.send`. Podpri **prenos hosta**
  (`room.on('hostChanged')` → nov host nadaljuje iz zadnjega znanega stanja) in **ponovno povezavo**
  (osvežitev strani → `joinRoom(hub.roomFromUrl())` → zahtevaj sinhronizacijo stanja od hosta).
- Potezne/asinhrone igre: `room.setState(state, { expectedVersion })`, `room.pushMove`, `room.getMoves`.
- Če igra potrebuje svoje tabele: `supabase/games/zaporedje.sql` (idempotentno, RLS vklopljen). Če imaš Supabase
  MCP orodja, ga poženi kot migracijo in preveri `get_advisors` (security + performance); sicer napiši v
  `PROGRESS.md`, kaj mora uporabnik pognati. (Verjetno lastnih tabel ne potrebuješ.)
- Čisto logiko (generator zaporedja iz seeda, pravilo »največ 3 enaki zapored«, preverjanje vnosa, modifikatorji
  Zrcalo/Kameleon, tempo po krogih, točkovanje in neodločeno v dvoboju) daj v ločen modul (npr. `logic.js`) in
  dodaj teste v `tests/tests.js`: isto zaporedje za isti seed, različno za različen seed, *Zrcalo* pravilno
  obrne vnos, *Kameleon* ohrani par barva–ton, časovna omejitev se šteje kot napaka, razvrstitev ob hkratnem
  izpadu.
- Telefon (portret, 375 px) in namizje; party igre: host na TV-ju, ostali na telefonih.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni.
4. Multiplayer v **offline načinu** (`?offline=1`) v 2–3 zavihkih: ustvari sobo, pridruži se
   s kodo in prek `?room=`, odigraj do konca (dvoboj in štafeta s 3), odhod hosta sredi igre, osvežitev strani igralca.
5. Izgled na **telefonu (375×812)** in **namizju**: posnemi zaslone, sam jih preglej in popravi, kar je neurejeno.
6. V `games.json` dodaj vnos igre s statusom **`live`** (in preveri, da test sheme uspe).
7. Posodobi `PROGRESS.md` (kaj je narejeno, kaj ni bilo preverjeno).
8. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako igrati, kaj (če kaj) moram narediti v Supabaseu
in kaj ni bilo preverjeno.
