# Prompt za AI agenta: Smučarski skoki — 3. faza (svetovni pokal, kariera, trgovina, športni okvir)

> **Stanje:** ⬜ čaka — predpogoj: 12, 29

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/13-skoki-pokal.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »36. Smučarski skoki« in »Šport (nadaljevanje skokov)«. 1. faza (`prompts/11-skoki.md`)
> in 2. faza (`prompts/12-skoki-tekma.md`) sta narejeni: fizika, bot, 8+ skakalnic z letalnico, točkovanje, ghosti,
> tekma do 10 igralcev z replayem v živo, dnevni izziv in modul `games/skoki/sport/`.
> Ta faza doda **dolgoročni del**: sezono, ki se igra čez tedne, kariero za igranje solo in opremo za skakalca.
>
> **Fizika, točkovanje in obstoječe skakalnice se ne spremenijo.** Vsi testi iz 1. in 2. faze ostanejo zeleni.

---

## 1. Svetovni pokal (sezona v Supabase, asinhrono)

Prijatelji niso vsi hkrati na spletu, zato je pokal **asinhron**: vsak skače, ko ima čas, v oknu tekme.

### Koledar (deterministično iz datuma)
- **Sezona = koledarski mesec** (ime npr. »Pokal Novembra 2026«). Koledar sezone (`sport/season.js`, brez DOM-a)
  se **izračuna iz datuma in seeda sezone**, zato ga ni treba nikjer ustvarjati in je enak v obeh adapterjih:
  ~10 **postaj** (tekem), vsaka odprta 2–3 dni (po ljubljanskem času), z izbrano skakalnico, profilom vetra in pogojem.
  Zadnja postaja je vedno na letalnici (»finale«, praviloma Planica). Pokal se skače **samo na pravih skakalnicah**
  (`prompts/29-skoki-prave-skakalnice.md`, skupina »Prave skakalnice«); trening skakalnice (Brezova, Bistra, Orlova in
  izmišljene iz 2. faze) ostanejo za trening, kariero in tekme s prijatelji. Postaje imenuj po kraju (»Postaja 4: Zakopane«).
- **Turneja 4 skakalnic** (format prave novoletne turneje, a pod svojim imenom; **ne** uporabljaj imen »Novoletna
  turneja«, »Vierschanzentournee«, »Four Hills«, ne pokala Zlati orel ne njihove grafične podobe):
  - Štiri zaporedne postaje Oberstdorf → Garmisch → Innsbruck → Bischofshofen; v koledarju pokala jih postavi na
    konec decembra in začetek januarja (v mesečni sezoni: štiri zaporedne postaje), na voljo pa tudi kot samostojen
    način v Lokalni tekmi in v spletni Tekmi.
  - **KO sistem v 1. seriji:** 50 skakalcev v 25 parih (1. proti 50., 2. proti 49. … po kvalifikacijah ali razvrstitvi
    pokala). Zmagovalec para gre v 2. serijo, poleg njih še **5 najboljših poraženih** (»srečni poraženci«), skupaj 30.
    Pri manj skakalcih: pari po istem pravilu, polje dopolnijo boti, ali KO izklopljen (izberi in dokumentiraj).
  - **Skupna razvrstitev turneje** = vsota **točk skokov** (ne točk pokala) vseh štirih tekem; ločena lestvica in
    zmagovalec turneje (dosežek, kozmetika, »Dvorana slavnih«). Kdor zamudi postajo, izpade iz skupne razvrstitve.
  - Logika (pari, srečni poraženci, seštevek) gre v `sport/` brez skakalnih pojmov in v teste (tudi izenačenja v paru:
    oba naprej).
- **Postaja:** dve seriji. 1. serija je odprta ves čas postaje (en skok, poskus se porabi ob štartu). 2. serija je odprta
  le **najboljšim 30** po 1. seriji (pri manj igralcih vsem) in se odpre zadnji dan postaje. Prijatelj, ki zamudi
  1. serijo, ne skače (DNS). Pred 1. serijo je neomejen **trening** na isti skakalnici in vetru (ne šteje).
- **Točke pokala** po mestu na postaji: 100, 80, 60, 50, 45, 40, 36, 32, 29, 26, 24, 22, 20, 18, 16, 15, 14 … 1
  (do 30. mesta). Ob izenačenju enake točke. Skupna razvrstitev = vsota; ob izenačenju odloči več zmag, nato več drugih mest.
- Na koncu sezone: **zmagovalec sezone** (dosežek, posebna oprema v trgovini, ime v »Dvorani slavnih« na zaslonu pokala),
  oder treh in posebni naslovi (»Kralj letalnic«, »Najbolj stanoviten«).

### Podatki in varnost
- `supabase/games/skoki.sql` (dopolni obstoječo datoteko, idempotentno): tabela **`skoki_cup_jumps`**
  (`user_id`, `season`, `event`, `round`, `points`, `dist`, `inputs` base64, `params_version`, `created_at`;
  pk `(user_id, season, event, round)`), RLS: berejo vsi prijavljeni, piše se **samo prek RPC** `skoki_cup_submit`,
  ki preveri: prijavljen in ima profil, postaja je odprta (okno izračunano iz istega koledarja — implementiraj ga tudi v
  SQL ali v RPC sprejmi le `season`/`event` in okna preverjaj v tabeli **`skoki_cup_events`**, ki jo izpolni idempotenten
  SQL blok iz orodja `tools/skoki-cup-sql.mjs`; izberi enostavnejše in zanesljivejše ter dokumentiraj), en zapis na
  serijo, za 2. serijo uvrstitev med 30, velikost `inputs`, smiselne točke glede na skakalnico.
- Razvrstitev postaje in sezone: `security invoker` pogled ali RPC `skoki_cup_standings(p_season)`, ki vrne mesta in točke
  z nickname/avatar/equipped (za `ui.who`).
- Ker so shranjeni vnosi, lahko vsak **pogleda replay** vsakega skoka v pokalu (klik na vrstico) in ga ima za ghost v treningu postaje.
- Do pokala dostopaj prek majhnega **splošnega API-ja v `shared/`** (npr. `hub.cupSubmit({ season, event, round, … })`,
  `hub.cupStandings({ season })`, `hub.cupJump({ … })`), ki ga implementirata **oba adapterja** (offline: `localStorage`),
  imena tabel s predpono igre (`<igra>_cup_*`), da ga bodo lahko uporabile druge športne igre. Dokumentiraj v `shared/README.md`.
- Če imaš Supabase MCP orodja, poženi migracijo, preveri `get_advisors` (security + performance) in z lažnimi JWT preizkusi:
  zapis za drugega, zapis izven okna, dva zapisa za isto serijo, 2. serija brez uvrstitve, prevelik `inputs`, nemogoče točke.

### Zaslon pokala
- Koledar sezone (postaje kot kartice: skakalnica, datum, stanje »odprto / 2. serija / končano / prihaja«, moja uvrstitev),
  skupna razvrstitev z gibanjem mest, **rumena majica** (vodilni v sezoni nosi oznako tudi v tekmah 2. faze in v treningu),
  povzetek postaje v slogu prenosa (oder, najdaljši skok, replay zmagovalnega skoka).
- **Obvestilo na dashboardu:** če je postaja odprta in še nisi skočil, naj to igra pokaže v svojem meniju, in če hub to
  podpira (dnevne naloge ali značka na kartici igre), tudi tam. Ne spreminjaj dashboarda bolj, kot je nujno.
- `hub.reportGame` po vsakem pokalnem skoku 2. serije (ali 1. serije, če se nisi uvrstil), dogodek `skoki:pokal`.

### Zasebni pokal (neobvezno)
Skupina prijateljev lahko v 2. fazi tekme označi »šteje v naš pokal«: host ustvari pokal s kodo, rezultati tekem se
seštevajo s točkami 100-80-60…, razvrstitev se shrani (`room.setState` v trajni sobi ali tabela `skoki_private_cups`).
Naredi le, če osnovni pokal deluje in je ostal čas.

---

## 2. Kariera (solo, proti botom)
- Začneš kot neznan skakalec na **Mini** in **mali** skakalnici v »Celinskem pokalu« in napreduješ: Celinski pokal →
  Svetovni pokal → Poleti (letalnice). Vsaka kariera-sezona ima 6–8 tekem z dvema serijama proti **29 botom** z
  izmišljenimi imeni, zastavami in osebnostmi (stalni rivali, ki se pojavljajo vsako sezono, imajo svojo spretnost in
  »formo«, ki niha; nekateri so mojstri na letalnicah, drugi stabilni na srednjih). Ob začetku kariere lahko igralec
  namesto vgrajenih rivalov izbere **bote s svojega seznama »Moji skakalci«** (2. faza); manjkajoče do 29 dopolnijo
  vgrajeni. Forma in značaj se jim nato vodita enako.
- **Brez nadgradenj fizike:** igralec ne kupuje boljših smuči ali statistik; napreduje samo z znanjem. Kariera odklepa
  skakalnice (za druge načine), opremo (kot nagrade, ne za kovance) in naslove.
- Napredovanje: med najboljših 10 v sezoni → višja liga. Kratki »novinarski« napisi med tekmami (»Mediji te že kličejo
  ›orel iz Brezove‹«), statistika kariere (zmage, odri, najdaljši skok, sezone).
- Shranjevanje: lokalno (`shared/storage.js`) in, če ima hub mehanizem za podatke igre v profilu, tudi tam; sicer
  dodaj izvoz/uvoz kode kariere. Shrani po vsaki tekmi (ne sredi tekme).
- `hub.reportGame` po vsaki tekmi kariere (`won` = zmaga), dogodka `skoki:kariera-zmaga`, `skoki:kariera-liga`.

---

## 3. Oprema skakalca v trgovini (predmeti, vezani na igro)

### Najprej preveri
Ali hub že podpira predmete za posamezne igre (npr. `hub.gameItem`, `kind` z `game`, `equipped.games`, zavihek »Za igre«
v trgovini)? Lahko jih je dodal drug prompt (glej `PREDLOGI-IGER.md` → »Trgovina: predmeti za posamezne igre«).
- **Če že obstaja:** uporabi ga in samo dodaj predmete za skoke.
- **Če ne obstaja:** dodaj ga **splošno, za vse igre** (ne posebej za skoke), točno po opisu v `PREDLOGI-IGER.md`:
  nova vrsta predmetov z `game: '<id>'` in `slot`, `equipped.games.<igra>.<slot>`, `hub.gameItem(game, slot)` v obeh
  adapterjih, opremljeni predmeti v presence (`room.players[i]`), zavihek »Za igre« s filtrom po igri v `shop.html`, predogled
  predmeta. Krogla in minigolf naj ga lahko kasneje uporabita brez sprememb huba (ne predelaj ju v tej nalogi).

### Predmeti za skoke (samo videz, fizika enaka za vse)
- **Sloti:** `suit` (dres), `helmet` (čelada), `skis` (smuči), `flag` (zastavica v publiki in ob imenu), `trail` (neobvezno:
  sled v zraku na sneženju, zelo diskretna, da ne zakriva skoka).
- Vsaj **8 dresov** (klasični, neonski, retro iz 80-ih, zimski vzorec, »Orel«, zlati …), **6 čelad**, **6 smuči**, **10 zastavic**,
  z redkostmi in cenami, uglašenimi s simulacijo ekonomije v `tests/` (preveri, da test ekonomije ostane zelen).
- **Odklepi z dosežki** (ne za kovance): zlati dres za zmago v sezoni pokala, rumena čelada za vodstvo v sezoni,
  »Lunin« dres za skok na Luni, smuči »Letalec« za 200 m, dres »Snežni angel« za 50 padcev.
- Videz uporabi parameter `skin` iz 1. faze: opremljen predmet se vidi v treningu, tekmi (drugi ga vidijo prek presence),
  ghostih (ghost se nariše z opremo igralca, čigar je), replayih in na zaslonu pokala.
- Katalog v `shared/cosmetics.js` in `shop_items` v `schema.sql` se morata ujemati (`node tools/shop-sql.mjs`).
  Nakup in opremljanje samo prek RPC (`buy_item`, `equip`).

---

## 4. Športni okvir za druge igre
`games/skoki/sport/` iz 2. faze dopolni s `season.js` (koledar sezone, točke pokala, razvrstitev) in `career.js`
(lige, rivali, napredovanje), ki ne vsebujeta skakalnih pojmov. Nato odloči: ali okvir premakneš v **`shared/sport/`**
(če je res neodvisen od skokov in ga bo uporabila naslednja športna igra, npr. biatlon) ali ostane v `games/skoki/sport/`
z jasnim README-jem. Utemelji odločitev v `PROGRESS.md`. Napiši **`sport/README.md`** s primerom, kako nova igra dobi
tekmo v serijah, replay v živo, pokal in kariero z nekaj vrsticami kode.

---

## Hub, XP, dosežki, naloge (dodatki)
- **XP:** 20 za pokalni skok (največ 2 na postajo), +100 za zmago na postaji, +300 za zmago sezone, 25 za tekmo kariere,
  +75 za napredovanje v višjo ligo.
- **Dosežki:** `pokal-prvi` (prvi pokalni skok), `pokal-zmaga` (zmaga na postaji), `rumena` (vodstvo v sezoni),
  `sezona` (zmaga v sezoni), `vsi-skoki` (skočil na vseh postajah sezone), `kariera-liga-2`, `kariera-poleti`,
  `kariera-prvak` (zmaga sezone v najvišji ligi kariere), `garderoba` (kupi 5 kosov opreme za skoke).
- **Naloge v `games.json`:** dodaj `m` »Skoči v svetovnem pokalu« (`skoki:pokal`, 1), `h` »Zmagaj na tekmi kariere«
  (`skoki:kariera-zmaga`, 1), `w` »Skoči na 3 postajah pokala ta teden« (`skoki:pokal`, 3). Obstoječe ostanejo.

## Videz
Zaslon pokala in kariere v istem slogu kot TV grafike iz 1. faze (stekleni paneli, zastave, velike številke), na telefonu
portret, na namizju dvostolpčno. Prazna stanja (»Sezona se začne 1. decembra«, »Postaja se odpre čez 5 h«) z odštevanjem.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija za to igro: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md` — pravila repoja (posebej trgovina, kozmetika in RPC).
2. `shared/README.md` — API (`hub`, `room`, `ui`), ghosti, kovanci, kozmetika.
3. `games/skoki/README.md`, `games/skoki/sport/README.md` in kodo 1. in 2. faze.
4. `prompts/02-trgovina.md`, `shop.js`, `shared/cosmetics.js`, `supabase/schema.sql` (katalog, `buy_item`, `equip`),
   `tools/shop-sql.mjs` in test ekonomije v `tests/`.
5. `PREDLOGI-IGER.md` → »Trgovina: predmeti za posamezne igre« in »Šport (nadaljevanje skokov)«.

### Tehnično
- Vse v `games/skoki/` (in `shared/`/`shop.*`, kjer je to splošno), **brez build koraka**, ES moduli, relativne poti,
  besedila v slovenščini.
- `supabase/games/skoki.sql` idempotenten, RLS vklopljen, predpona `skoki_`, `security definer` funkcije v `private`,
  v `public` le `security invoker` ovojnice. Spremembe `schema.sql` (katalog, predmeti za igre) prav tako idempotentne.
  Po spremembi sheme preveri advisors. Če nimaš MCP orodij, zapiši v `PROGRESS.md`, kaj mora uporabnik pognati in v
  katerem vrstnem redu.
- Testi v `tests/tests.js`: koledar sezone (determinizem, okna po ljubljanskem času, tudi prehod na zimski/poletni čas,
  finale na letalnici), točke pokala in razvrstitev z izenačenji, rez za 2. serijo, kariera (napredovanje, rivali so
  deterministični iz seeda), `hub.gameItem` in opremljanje v offline adapterju, ujemanje kataloga s shemo, test ekonomije,
  **nespremenjenost fizike** (referenčni skoki iz 1. in 2. faze dajo isto daljavo).
- Razvojni parametri: `?date=2026-12-03` (simuliraj datum za koledar pokala, samo v offline načinu), `?bots=…`.

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v trgovini, na dashboardu in v Krogli.
3. `node tests/run-node.mjs` in `tests.html` uspešni (vsi obstoječi testi nespremenjeni).
4. **Pokal offline** z `?date=` in 3 identitetami (`?igralec=1/2/3`): odskači 1. in 2. serijo dveh postaj, preveri rez,
   točke, skupno razvrstitev, rumeno majico, replay tujega skoka, konec sezone in zmagovalca.
5. **Pokal s Supabase** (dva igralca): zapisi, razvrstitev in varnostni preizkusi RPC (glej zgoraj).
6. Kariera: odigraj celo prvo sezono (lahko z `?bot=` za svoje skoke), preveri napredovanje in shranjevanje po osvežitvi.
7. Trgovina: kupi in opremi dres, čelado in smuči; preveri, da se vidijo v treningu, v tekmi pri drugem igralcu (2 zavihka),
   v ghostu in replayu. Preveri, da se kozmetika profila in obstoječe igre niso spremenile.
8. Izgled na **telefonu (375×812)** in **namizju** (zaslon pokala, kariere, trgovine z zavihkom »Za igre«): posnemi zaslone,
   sam jih preglej in popravi, kar je neurejeno.
9. Posodobi `games.json` (naloge; test sheme uspe), `PROGRESS.md`, `games/skoki/README.md`, `sport/README.md`,
   `shared/README.md` in `PREDLOGI-IGER.md` (označi, kaj od predloga 36 je narejeno).
10. Testne profile, nakupe, pokalne zapise in sobe v produkcijski bazi na koncu **izbriši**.
11. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

V končnem odgovoru kratko povzemi: kaj je narejeno, kako deluje sezona pokala (kdaj se odprejo postaje), kako igrati
kariero, katera oprema je v trgovini, kaj moram narediti v Supabaseu in kaj ni bilo preverjeno.
