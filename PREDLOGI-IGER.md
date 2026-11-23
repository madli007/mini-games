# Predlogi iger za skupni hub (GitHub Pages + Supabase)

## Osnova: hub repo

```
/index.html            ← dashboard (seznam iger, profil, skupna lestvica, aktivni lobbyji)
/shared/supabase.js    ← prijava, nickname/avatar, leaderboard, lobby/room code, realtime kanali
/shared/ui.css         ← skupen retro izgled
/games.json            ← register iger (ime, slika, št. igralcev, tag)
/games/pinball/index.html
/games/ladjice/index.html
...
```

- **Prvi prompt** naredi samo hub in `shared/`. Vsak naslednji prompt se potem glasi nekako tako: »naredi igro X v `/games/x/`, en HTML, brez build koraka, uporabi `shared/supabase.js`, dodaj vnos v `games.json`«. Tako ostane vsaka igra res »single prompt«.
- **Supabase**: za vse do 10 igralcev v realnem času sta dovolj Realtime *broadcast* in *presence*. Za poteze, lestvice in persistentne igre pa uporabiš tabele.
- **Pomembno**: GitHub Pages je statičen, zato je anon key javen. RLS mora biti obvezno vklopljen. Pri igrah v realnem času je eden od igralcev host in preverja pravila, ker strežnika ni.
- **Skupen profil**: XP, ki se nabira čez vse igre, in dosežki. To da hubu občutek, da je ena celota.

## Predlogi iger

Zahtevnost: ★ = lahko v enem promptu, ★★ = en prompt z multiplayerjem, ★★★ = bolje 2–3 prompti.

### Strategije v stilu Travian / Tribal Wars

1. **Plemena (persistentna strategija)** ★★★
   - Vsak ima vas na skupni mapi. Surovine se ne štejejo s timerjem, ampak se izračunajo iz časa (`proizvodnja × pretečen čas`), zato strežnik ni potreben.
   - Zgradbe se gradijo v realnem času (minute ali ure). Vojske potujejo po mapi s časom potovanja, poleg tega so tu še plemena/alianse in chat.
   - Bitke razrešuje Supabase edge function ali `pg_cron`.
   - Igra se v **sezonah** po 1–2 tedna za skupino prijateljev, ob koncu je zmagovalec sezone. To bi bila glavna igra huba.
2. **Osvajanje heks mape (asinhrono, 2–10 igralcev)** ★★
   - Ena poteza na dan ali takrat, ko so vsi odigrali (Risk meets Tribal Wars).
   - Precej lažje kot Plemena, a ima isti občutek osvajanja.

### Stil Age of War / Miniclip

3. **Lane wars skozi dobe** ★★
   - Dve bazi, po stezi pošiljaš enote, z XP napreduješ iz kamene dobe v srednji vek, nato v moderno dobo in na koncu v futur.
   - Lahko igraš proti AI ali 1v1 online. Ker igralca pošiljata samo ukaze »pošlji enoto X«, se igra lepo sinhronizira.
4. **Obramba gradu** ★
   - Stickmani napadajo, ti jih z miško vlečeš in mečeš, med valovi pa nadgrajuješ zidove in strelce. Ima skupno lestvico.
5. **Topovi na terenu (Worms-like, do 10 igralcev)** ★★
   - Igralci so na vrsti po potezah, teren je uničljiv, nastaviš kot in moč strela, po vmesnih krogih kupuješ orožja.
   - Ker je potezna, je odlična za Supabase in brez težav prenese 10 igralcev.
6. **Motorist (fizikalni trial)** ★★★
   - **Žanr:** motoristični trial s strani: plin, zavora in nagibanje telesa po progi z ovirami (skakalnice,
     hlodi, zaboji, gugalnice, stopnice, strmine). Ime, proge in videz so naši, ne kopija nobene obstoječe igre.
   - **Fizika:** motor sta **dve kolesi in šasija z vzmetenjem**, voznik premika težišče naprej in nazaj. Plin
     poganja zadnje kolo, zavora obe. Nagib je glavni vhod: pristanek na kolesih, zamah na stopnico, sprednje kolo
     na tleh pri strmem vzponu.
     - Priporočeno: **Planck.js** (port Box2D, CDN s pripeto verzijo) za zglobe, vzmeti in dinamične predmete
       (hlodi, zaboji, mostovi, ki se podrejo). Alternativa je lastna fizika kot pri pinballu (več kontrole, veliko več dela).
     - **Fiksen korak** (npr. 120 Hz), da so časi pošteni. Ghost se snema kot **položaji** (kot `ghost.js` v Krogli),
       ne kot vnosi, ker se Box2D med napravami lahko rahlo razide.
     - Voznik je ob padcu **ragdoll** (zglobi), kar je polovica zabave.
     - **Stran z drsniki** (`?debug=1`) za moč motorja, vzmetenje, trenje gum in moč nagiba.
   - **Grafika 2,5D:** fizika je 2D, izris 3D s Three.js. Kamera s strani rahlo sledi in se pri skokih oddalji,
     ozadje ima globino. Uporabi dele rendererja Krogle (nebo, teksture, post-processing, samodejna kakovost).
   - **Proge:** JSON s terenom (lomljena črta ali krivulje) in objekti: zaboji, hlodi, gugalnice, eksplozivni sodi,
     mostovi, ki se podrejo, dvigala, kontrolne točke. Teme: kamnolom, gozd s hlodi, gradbišče, **aluminijasta
     tovarna** (crossover s pinballom: valjarna, tekoči trakovi, žerjavi), zimska proga z ledom, nočna z neonom.
     Urejevalnik je veliko lažji kot pri Krogli (2D: rišeš črto terena, postavljaš objekte), zato so skupnostne
     proge realne že v drugem promptu.
   - **Točkovanje:** čas in **napake**. Vsak padec je +1 napaka in vrnitev na kontrolno točko. Medalje so odvisne
     od časa in napak (zlato = 0 napak in pod časom). Povzetek: »Padci: 3 · Čas 1:12,40 · Srebro«.
   - **Kontrole:** tipkovnica ↑ plin, ↓ zavora, ←/→ nagib. Telefon: levi palec nagib (dve tipki ali drsnik),
     desni palec plin in zavora; opcijsko nagib telefona.
   - **Načini:**
     - **proge v sklopih** (lahke, srednje, težke, ekstremne) z ghostom svojega in prijateljevega rekorda;
     - **dnevna proga** (generirana iz seeda ali izbrana iz nabora, šteje prvi poskus);
     - **dirka do 10 prijateljev:** vsi hkrati na isti progi, drugi so prosojni ghosti v živo prek `room.send`
       (brez trkov), zmaga prvi v cilju z najmanj napakami;
     - kasneje **skupnostne proge** (»proga tedna«) in predmeti v trgovini (barva motorja, čelada, dres, sled;
       fizika je za vse enaka).
   - **Tveganje:** vse je v občutku vožnje. Če je motor »plavajoč« ali preveč nervozen, igra ni zabavna, zato naj prvi
     prompt res izdela drsnike in progo, ki samo preizkuša kontrole.
   - **Predlog razdelitve:** prompt 1 = fizika, voznik z ragdollom, kontrole, 2,5D izris, 10 prog v dveh sklopih,
     napake, medalje, ghost, drsniki; prompt 2 = urejevalnik, skupnostne proge v Supabase, dnevna proga, še 10 prog;
     prompt 3 = dirka do 10 igralcev v živo, sezona, predmeti v trgovini.

### Multiplayer arene

7. **Bomba arena (bomberman varianta, 2–8 igralcev)** ★★
   - Powerupi: domet, več bomb, hitrost, brcanje bomb, ščit, teleport.
   - Twisti, da ni le kopija:
     - arena se po 2 minutah krči;
     - »prekletstvo«, ki ga z dotikom predaš drugemu (obrnjene kontrole, samodejno odlaganje bomb);
     - izločeni igralci kot duhovi mečejo bombe z roba.
   - Host-authoritative, broadcast okoli 15–20 tickov na sekundo.
8. **Potapljanje ladjic s powerupi** ★★
   - Vsak igralec izbere »kapitana« s posebno sposobnostjo:
     - **Sonar**: razkrije 3×3, ali je ladja;
     - **Torpedo**: zadene prvo ladjo v vrstici;
     - **Vaba**: lažna ladja;
     - **Popravilo**: obnovi eno polje;
     - **EMP**: nasprotnik preskoči potezo;
     - **Kasetna bomba**: 4 naključna polja.
   - Mana se nabira za vsak zgrešen ali zadet strel.
   - **Battle royale način do 10 igralcev**: vsak ima manjšo mrežo, strelja na kogarkoli, zadnji preživeli zmaga. Potezno, zato je za Supabase idealno.
9. **Celice arena (agar-style, do 10 igralcev)** ★★
   - Rasteš, ješ manjše igralce, se deliš. Preprosta grafika, zelo zabavno v družbi.
10. **Top-down dirke (do 8 igralcev)** ★★
    - Mikro avtomobilčki na mizi ali v kuhinji, powerupi na progi, ghost časi asinhrono.

### Party igre za do 10 ljudi

11. **Riši in ugibaj** ★★
    - En igralec riše, ostali ugibajo v chatu, besede so slovenske.
12. **Kviz z room kodo (Kahoot-stil)** ★★
    - Host pokaže vprašanja na TV-ju, ostali odgovarjajo na telefonih. Lahko imaš svoje sete vprašanj v Supabase.
13. **Kdo je izdajalec** ★★
    - Socialna dedukcija: vsi dobijo isto besedo razen enega, opisujejo jo, nato glasujejo.

### Retro singleplayer z dnevnim izzivom (kot pinball)

14. **Asteroidi, breakout, padajoči bloki, raketna obramba** ★
    - Ključni twist je **dnevni seed**: vsi igrajo isto različico dneva, rezultate pa primerjajo na skupni lestvici. Tako postane tudi singleplayer igra družabna.

### Spretnostne igre s fiziko

15. **Hrčkova krogla (Hamsterball varianta)** ★★★
    - **Kako deluje original** (Hamsterball, Raptisoft, 2004): hrčka v prozorni krogli s fiziko kotališ skozi
      progo do cilja. **Življenj ni.** Imaš skupno uro: na začetku vsake proge se ji prišteje nekaj časa,
      preostanek pa se prenese v naslednjo progo, zato se hitrost na lahkih progah obrestuje na težkih.
      Ko čas poteče, je igre konec. Turnir ima 15 prog, vsaka je težja in bolj zapletena. Tri težavnosti
      določajo, koliko časa dobiš (na najlažji se nič ne odklene in točke so polovične). Poleg turnirja ima še
      **Time Trial** (vsaka proga posebej, bronasta/srebrna/zlata medalja), **zrcalni turnir** (odklene se, ko
      končaš turnir) in **party način** (arena, kjer se igralci izrivajo čez rob).
    - **Naša različica (ime in proge svoje, ne kopija):**
      - Kontrole: tipke/WASD ali miška; na telefonu **nagib telefona** (`deviceorientation`) ali virtualna palica.
      - Kamera izometrična od zgoraj; Three.js z CDN-ja ali 2.5D canvas. Fizika s fiksnim korakom,
        da so časi in ghosti ponovljivi.
      - **Padec čez rob** te vrne na zadnjo kontrolno točko z izgubo nekaj sekund (ni življenj, kot v originalu).
      - **Ovire:** ozke poti brez ograj, premične in padajoče ploščice, vrtljive plošče, led, lepilo, vzmeti,
        ventilatorji, dvigala, vrata na stikalo, cevi, ozki mostovi, valovita tla.
      - **Sovražniki:** večja krogla »nasilnež«, ki te lovi in izriva; kladiva in žage na tirnicah; sesalec,
        ki vleče k robu; ose, ki letijo po vzorcu; magneti.
      - **Pobiralke:** ura (+5 s), kovanci za hub, skrite bližnjice.
    - **Nivoji:** vsaj **12 prog v treh sklopih** (npr. Ogrevanje → Vrtnarija → Kuhinja → Steklena pot →
      Stolp → Tovarna → Neon → Nebo → Nemogoče). Vsak sklop doda novo mehaniko. Proge so JSON datoteke
      v `games/krogla/levels/`, da se dodajajo brez spreminjanja kode. Kasneje lahko še preprost urejevalnik prog.
    - **Načini:**
      - **Turnir**: vse proge zapored s prenosom časa (glavni način, lestvica po skupnem času/točkah).
      - **Na čas**: posamezna proga, medalje in **ghost** najboljšega časa iz Supabase (kot pri motoristu).
      - **Zrcalni turnir**: odklene se, ko končaš turnir.
      - **Dnevni izziv**: dnevni seed izbere 3 proge in en dodatek dneva (npr. led povsod, dvojna hitrost
        sovražnikov). Ena lestvica za vse.
      - **Rušilec (party, 2–8 igralcev)**: arena, izrivaš druge čez rob, točka za vsak izriv, na čas (prompt: `prompts/07-krogla-rusilec.md`).
        Host-authoritative kot Bomba arena. To naj bo drugi prompt, ko je singleplayer gotov.
    - **Povezava s hubom:** `hub.reportGame` po vsaki progi/turnirju, dosežki (zlato na vseh progah,
      turnir brez padca, zrcalni turnir), naloge v `games.json` (»Osvoji zlato medaljo«, »Končaj sklop 1«).
    - **Predlog razdelitve:** prompt 1 = motor, fizika, kamera, 6 prog, turnir in na čas;
      prompt 2 = še 6+ prog, zrcalni turnir, dnevni izziv, ghosti; prompt 3 = party arena.

### Trgovina: predmeti za posamezne igre (razširitev obstoječe trgovine)

Trgovina (`prompts/02-trgovina.md`) je že narejena, vendar ima samo kozmetiko profila (`emoji`, `bg`, `frame`,
`name`, `title`, `badge`, `win`, `banner` v `shared/cosmetics.js`). Predmetov, ki se vidijo **v sami igri**,
še ni. To spada v ločen prompt za trgovino (npr. `03-trgovina-igre.md`) in ne v prompt posamezne igre:

- **Nova vrsta predmetov, vezanih na igro**, npr. `kind: 'ball'`, `game: 'krogla'` ali `game: 'pinball'`.
  `equipped` dobi pod-objekt po igrah (`equipped.games.krogla.ball`), trgovina pa zavihek **»Za igre«**
  s filtrom po igri.
- **Krogla:** različne krogle (steklena, dimljena, neonska, pikselna, disko, lubenica, milni mehurček)
  in lik v njej (hrček, želva, pingvin, ježek …).
- **Pinball:** žogice (krom kot privzeto, zlata, »talina« iz peči, steklena, 8-bit), morda barva sledi
  in učinek ob izgubi žogice.
- **Pravilo: samo videz.** Enaka velikost, masa in fizika za vse, sicer lestvice niso več poštene.
- Igra prebere opremljen predmet prek `hub` (npr. `hub.gameItem('krogla', 'ball')`), da je enako za vse igre.
  V multiplayerju gre to v presence, da drugi vidijo tvojo kroglo; ghosti se rišejo z isto kroglo.
- Nekaj predmetov naj se odklene z dosežki v igri (npr. zlata krogla za zlato na vseh progah).

### Preproste igre v stilu Reakcije

En zaslon, kratka runda in en jasen rezultat. Vsaka ima **dnevni seed** za skupno lestvico in **dvoboj z room
kodo do 10 igralcev**, tako kot Reakcija. Vse so ★ (en prompt).

**Hitrost in refleksi**

16. **Tarče (aim trainer)** ★
    - Na zaslonu se pojavljajo krogi, ki se hitro manjšajo, ti pa jih moraš klikniti. Runda ima 30 tarč.
    - Rezultat je povprečni čas na tarčo, zgrešeni kliki pa dodajo kazen.
    - Twist: rdečih tarč ne smeš klikniti, kar je hkrati test samokontrole.
17. **Barva ali beseda (Stroop)** ★
    - Napis »RDEČA« je obarvan modro, ti pa moraš čim hitreje tapniti pravo barvo.
    - Runda traja 30 sekund, šteje število pravilnih odgovorov. Ob napaki se za trenutek ustaviš.
    - V družbi je zelo smešna, ker se vsi zmotijo.
18. **Ustavi uro** ★
    - Štoparica teče, ti pa jo moraš ustaviti točno pri 10,00 s. V naslednjih krogih ura po 3 sekundah
      izgine in štej v glavi.
    - Rezultat je odstopanje v milisekundah.

**Spomin**

19. **Zaporedje (Simon)** ★
    - Štiri polja zasvetijo v zaporedju, ti pa ga ponoviš. Vsak krog doda en korak.
    - Rezultat je najdaljše zaporedje, ki si ga ponovil. Pri dnevnem izzivu vsi dobijo isto zaporedje.
20. **Številčni spomin** ★
    - Za kratek čas se pokaže število, nato ga natipkaš. Vsak krog dobi eno števko več.
    - Varianti: številke na mreži po vrsti (šimpanzji test) ali vizualni spomin (zapomni si osvetljena polja).
21. **Pari (memory)** ★
    - Klasično obračanje kartic, rezultat pa sta čas in število potez.
    - V multiplayerju ima vsak svojo mrežo z istim seedom in zmaga tisti, ki prvi najde vse pare.

**Glava in logika**

22. **Hitro računanje** ★
    - V 60 sekundah rešuješ račune, kot je 7 × 8, težavnost pa se postopoma veča.
    - Twist »Res ali ne?«: prikazan je že rešen račun (npr. 23 + 19 = 41), ti pa le tapneš ✓ ali ✗.
23. **Višje-nižje** ★
    - Igra izbere številko od 1 do 1000, ti jo ugibaš, odgovor pa je samo »višje« ali »nižje«.
      Manj poskusov je boljše.
    - Party varianta: vsi ugibajo hkrati in vidijo ugibe drugih.

**Spretnost in občutek**

24. **Stolp (stacker)** ★
    - Blok se premika levo in desno, ti pa tapneš, da ga spustiš na stolp. Kar štrli čez rob, se odreže.
    - Rezultat je višina stolpa. Ena tipka, zelo zasvojljivo.
25. **Na oko** ★
    - Mešanica nalog: »nariši čim bolj okrogel krog«, »razpolovi to črto«, »koliko pik je na zaslonu?«,
      »nastavi barvo, ki se ujema s prikazano«.
    - Rezultat je natančnost v odstotkih. Vsak dan je izbor nalog drugačen.

**Za začetek** so najboljše **Stroop, Simon in Stolp**: vsaka preizkusi nekaj drugega, vse pa so zabavne
kot dvoboj. Ostale lahko kasneje združiš v **»Možganski trening«**, kjer je vsaka igra en dnevni test,
skupni dnevni rezultat pa gre na lestvico.

### Retro igre (dopolnilo k točki 14)

Retro žanri s svojimi twisti, da niso kopije znanih iger. Vse imajo dnevni seed in skupno lestvico.

**Arkadna klasika**

26. **Kača** ★
    - Twist: hrana ima različne učinke (pospeši, obrne smer, skrajša rep), zidovi pa se vsak dan premaknejo
      glede na seed.
    - **Multiplayer do 10 igralcev:** vsi so na isti mreži, kdor se zaleti v drugega, izpade. Mreža je
      diskretna, zato je sinhronizacija prek broadcasta preprosta.
27. **Čez cesto** ★
    - Žabica, kokoš ali Slovenec s kolesom prečka ceste, reke in železniške proge. Vsaka vrstica je novo polje.
    - Rezultat je število prečkanih vrstic. Vsak dan je proga ista za vse, zato je to tekma za rekord dneva.
28. **Labirint lovljenja** ★★
    - V labirintu pobiraš pike, štirje preganjalci pa imajo vsak svojo osebnost (lovi, prestreza, tava, straši).
    - Labirint je vsak dan nov, generiran iz seeda.
    - Party varianta: en igralec je lovljen, ostali (do 4) igrajo preganjalce na telefonih.
29. **Vesoljski strelec (shmup)** ★★
    - Ladja na dnu zaslona, valovi sovražnikov v formacijah, boss vsakih 5 valov, nadgradnje orožja.
    - Dvoboj: oba igrata isti seed, med igro vidiš nasprotnikov rezultat v živo.

**Retro šport in dvoboji**

30. **Tenis s ploščkoma (pong)** ★★
    - Dva na enem telefonu (vsak drži svojo polovico zaslona) ali online 1v1.
    - Powerupi: dve žogici, krajši plošček nasprotnika, ukrivljen strel.
    - Turnirski način do 8 igralcev z drevesom izločanja.
31. **Svetlobni motorji** ★★
    - Vsak igralec za sabo vleče steno, zadnji preživeli zmaga. Preprosto, a zelo napeto.
    - Do 10 igralcev na eni areni, ki se po 60 sekundah začne krčiti.
32. **Tanki v labirintu** ★★
    - Top-down tanki, krogle se odbijajo od sten. Igra se do 5 zmag.
    - Deluje tudi lokalno (dva na eni tipkovnici).

**Platforme in akcija**

33. **Neskončni tekač** ★
    - Pikselni lik teče, ti samo skačeš čez ovire (ena tipka). Hitrost se počasi povečuje.
    - Ghosti prijateljev tečejo poleg tebe.
34. **Skakalec v višino** ★
    - Lik samodejno skače po platformah navzgor, ti ga premikaš levo-desno z nagibom telefona ali tipkami.
    - Platforme se lomijo, premikajo ali te izstrelijo. Rezultat je dosežena višina.
35. **Rudar** ★★
    - Kopaš navzdol skozi pikselno zemljo, pobiraš rude in se izogibaš padajočim skalam in podzemnim pošastim.
    - Med poskusi rude prodaš za nadgradnje (svedri, gorivo, luč), zato igra deluje kot kratek roguelite.

**Retro izgled za ves hub**

- **Skupni CRT filter** v `shared/`: scanlines, rahla ukrivljenost in barvne palete (zelen terminal,
  4-barvni handheld, 8-bit). Vklopiš ga v profilu in deluje v vseh retro igrah.
- Palete in filtri so lahko tudi predmeti v trgovini, ker gre samo za videz.

**Za začetek** sta najboljši **Kača z multiplayerjem** in **Svetlobni motorji**: obe sta enostavni za
izdelavo in delujeta z do 10 igralci. Za solo igranje je dober **Neskončni tekač** z ghosti, saj se na
dnevni lestvici takoj vidi rivalstvo.

### Šport

36. **Smučarski skoki** ★★★
    - **Žanr:** 2D pogled od strani, precizen tajming in balansiranje v letu z miško. Ime, skakalnice in
      grafika so naši (ne kopija nobene obstoječe igre).
    - **Faze skoka:**
      1. **Zalet:** klik za štart; hitrost na mizi je odvisna od zaletnega mesta in drže.
      2. **Odriv:** klik na koncu mize. Prezgodaj/prepozno = manjša hitrost in slabši kot, popoln odriv dobi »✨«.
      3. **Let:** z miško (na telefonu nagib ali vlečenje) uravnavaš kot telesa in smuči. Preveč naprej = padec,
         preveč nazaj = zavora. Veter in sunki te premetavajo, zato ves čas popravljaš.
      4. **Pristanek:** klik tik pred tlemi za telemark ali držanje za pristanek z obema nogama (varnejši, manj
         sodniških točk). Prepozen klik = padec.
    - **Fizika:** 2D model z vzgonom in uporom glede na napadni kot, fiksen časovni korak, zato je skok
      determinističen. Igralci si pošiljajo samo vnose, zato so replayi in ghosti skoraj zastonj (kot pri krogli).
    - **Točkovanje po pravih pravilih:**
      - daljava: 60 točk na K-točki (120 na letalnici), ± meter × faktor;
      - 5 sodnikov za slog, najvišja in najnižja ocena se ne štejeta (mirnost leta, telemark, padec);
      - kompenzacija za veter in zaletno mesto.
    - **Skakalnice:** JSON datoteke v `games/skoki/hills/` (profil zaleta, miza, doskočišče, K in HS), dodajajo
      se brez kode. Od male (K60) prek srednje in velike do **letalnice** (HS240). Lahko svoja »domača«
      letalnica pod Poncami in izmišljene: nočna pod reflektorji, puščavska, na Luni z nizko gravitacijo.
      Pikselna ali vektorska grafika s publiko, zastavami in semaforjem za daljavo.
    - **Načini:**
      - **Tekma s prijatelji (do 10):** dve seriji, v drugi skačejo v obratnem vrstnem redu. Enak veter za vse
        po seedu. Potezno (`room.setState`), med skokom drugi gledajo **replay v živo** iz vnosov.
      - **Svetovni pokal:** sezona čez teden ali mesec, točke 100-80-60… v tabeli `skoki_*`, zmagovalec sezone.
      - **Dnevni izziv:** skakalnica in veter dneva, trije poskusi, šteje najboljši.
      - **Trening:** ghost svojega rekorda in rekordov prijateljev na vsaki skakalnici.
      - **Kariera (kasneje):** začneš na mali skakalnici, s kovanci odklepaš skakalnice in kozmetiko.
    - **Trgovina:** dresi, čelade, barve smuči, zastava. Samo videz, brez vpliva na fiziko.
    - **Tveganje:** ravnotežje v letu (prelahko je dolgočasno, pretežko frustrira). Prvi prompt naj zato
      vključi stran z drsniki za fiziko (`?debug=1`).
    - **Predlog razdelitve:** prompt 1 = fizika, kontrole, 3 skakalnice, točkovanje, trening z ghostom;
      prompt 2 = tekma do 10 igralcev z replayem v živo, dnevni izziv, več skakalnic in letalnica;
      prompt 3 = svetovni pokal (sezona v Supabase), kariera, predmeti v trgovini.
    - Prompti: `prompts/11-skoki.md`, `prompts/12-skoki-tekma.md`, `prompts/13-skoki-pokal.md`.

### Fizikalne igre v slogu Krogle in pinballa

Igre v istem duhu kot Hrčkova krogla in Alu Pinball: fizika s fiksnim korakom, proge ali mize v JSON-u,
ghosti, dnevni seed in party način. Največja prednost je **ponovna uporaba obeh motorjev**: fizike, rendererja
in urejevalnika prog iz `games/krogla/` ter 2D fizike, flipperjev in DMD-ja iz `games/pinball/`. Kodo uvažaj
(kot Rušilec), ne kopiraj.

**A) Na motorju Hrčkove krogle**

37. **Hrčkov minigolf** ★★
    - Uporablja isto fiziko krogle in isti urejevalnik prog. Namesto kotaljenja z vlečenjem nastaviš smer in moč udarca.
    - Luknje imajo mline na veter, zanke, vzmeti, premične ploščice in led, torej mehanike, ki jih Krogla že pozna.
    - **Do 10 igralcev potezno** (`room.setState`): vsi igrajo isto luknjo, ostali med udarcem gledajo replay.
      Dnevna luknja gre na skupno lestvico. Rezultat je število udarcev (manj je bolje).
    - Najboljše razmerje med vloženim delom in zabavo, ker je večina kode že napisane.
    - Prompt: `prompts/10-minigolf.md`.
38. **Balinanje** ★★
    - Slovenska gostilniška klasika v 3D: najprej vržeš balinček, nato krogle, lahko pa tudi »izbiješ« nasprotnikovo kroglo.
    - Twisti: steze s klancem, peskom ali ledom, veter po seedu, »nori« način z vzmetmi na stezi.
    - Potezno, 2–8 igralcev v ekipah. Idealno za TV in telefone.
39. **Nagibni labirint** ★
    - Ne kotališ krogle, ampak **nagibaš celo ploščo** (nagib telefona je v Krogli že narejen). Lesena plošča,
      luknje in kroglica.
    - Kasnejši nivoji dodajo dve kroglici hkrati, vrtljive dele in magnete. Dnevni labirint je generiran iz seeda.
    - Majhna, hitra igra, odlična za telefon.
40. **Dirka frnikol (party za gledanje in stave)** ★★
    - Na TV-ju se 8–16 frnikol spusti po dolgi progi s fiziko. Igralci pred štartom **stavijo kovance iz huba**
      (prek RPC, z omejitvijo), med dirko pa imajo 2–3 »sunke«, s katerimi zrinejo svojo ali tujo frnikolo.
    - Proge so iz urejevalnika Krogle. Slovenski komentator: »Rdeča prehiteva v zadnjem zavoju!«
    - Zelo družabno, saj zabava tudi tiste, ki niso spretni.
    - **Solo »Dirkalni dan«:** 5 dirk proti 3–7 botom stavnikom z osebnostmi (tudi oni sunkajo), dnevni seed za
      vse enak. Prompt za 1. del: `prompts/16-frnikole.md` (ob koncu napiše še `17-frnikole-multiplayer.md` in
      `18-frnikole-stave.md`).

**B) Na motorju pinballa**

41. **Druga miza in več igralcev v pinballu** ★★
    - `table.js` naj postane podatkovna datoteka, da so mize JSON (kot proge v Krogli).
    - Druga miza z drugo temo, npr. **»Hrčkova tovarna«** (crossover: multiball s hrčki, krogla kot misija na DMD-ju).
    - **2–4 igralci izmenično** (igralec 1, 2, 3 … kot pri pravih avtomatih) prek room kode, drugi gledajo v živo.
    - **Pinball dvoboj:** vsak na svoji mizi, določeni streli pošljejo nasprotniku »napad« (nagnjena miza,
      krajši flipper, dodatna žogica).
    - Tabele `public.scores` ne spreminjaj; nove mize dobijo svoje lestvice prek huba.
42. **Žebljički (strelec na kline)** ★★
    - Od zgoraj izstreliš kroglico, ta se odbija od klinov, cilj pa je podreti vse oranžne kline v omejenem številu strelov.
    - Fizika odboja je ista kot v pinballu. Nivoji so JSON, dnevni nivo je enak za vse.
    - Twisti: posebni klini (bomba, multiball, portal), premično korito na dnu za dodatno kroglico.
43. **Verižna reakcija (fizikalna uganka)** ★★
    - Na mizo postaviš omejen nabor kosov (rampe, vzmeti, flipper, bumper, ventilator), pritisneš ▶,
      kroglica pa mora priti do cilja.
    - Uporablja dele iz pinballa. Ena uganka na dan, lestvica šteje **najmanj uporabljenih kosov** in čas.
    - Rešitve drugih vidiš kot replay, ko uganko rešiš sam.

**C) Nove fizikalne igrače**

44. **Zračni hokej** ★★
    - 2D fizika plošček–palica. Dva igrata na enem telefonu (vsak ima svojo polovico) ali 1v1 online, host je avtoritativen.
    - Powerupi: dva ploščka, ožji gol, »magnet«. Turnir do 8 igralcev z drevesom izločanja.
45. **Biljard s twistom** ★★
    - Potezno 1v1, zato je sinhronizacija enostavna. Poleg klasične mize so tu še **nore mize** z ovirami,
      portali in premičnimi luknjami.
    - Dnevni izziv: »spravi vse krogle v čim manj udarcih«.
46. **Namizni nogomet** ★★
    - Vsak telefon upravlja eno ali dve palici (poteg = premik, hiter švig = strel). 2v2 realtime, TV kaže mizo.
47. **Pikado** ★
    - Met s potegom prsta, rahlo tresenje roke in veter. Igri 501 in »okoli ure«, potezno do 10 igralcev.

**D) Razširitve Hrčkove krogle**

- **Dirka dveh:** online realtime na isti progi (original ima deljen zaslon), z ghosti ostalih.
- **Skrite ključavnice** na progah, ki odklenejo skrivne arene v Rušilcu (omenjeno v `prompts/07-krogla-rusilec.md`;
  preveri, ali je že narejeno).
- **Skupnostne proge:** urejevalnik shrani progo v Supabase (`krogla_*` tabela), drugi jo igrajo in ocenijo,
  »proga tedna« gre na lestvico.

**Za začetek:** **Hrčkov minigolf** (največ ponovne uporabe in do 10 igralcev), nato **druga miza in več igralcev
v pinballu** (pinball iz igre za enega postane družabna igra), potem **Balinanje** ali **Dirka frnikol** kot party
igri za TV.

### Šport (nadaljevanje skokov)

Igre v slogu Smučarskih skokov (36): jasne faze, deterministični replayi iz vnosov, prava pravila točkovanja,
tekma med prijatelji in sezona.

**Skupna osnova: športni okvir.** Ko bodo narejeni skoki, iz njih izlušči skupni modul (npr. `games/skoki/sport/`
ali `shared/sport.js`): tekma v serijah (v drugi obraten vrstni red), replay v živo iz vnosov, sezona svetovnega
pokala s točkami 100-80-60…, dnevno prizorišče in vreme po seedu, kariera z odklepanjem prizorišč. Vsaka spodnja
igra potem vse to dobi skoraj zastonj.

**Zimski športi**

48. **Biatlon** ★★★
    - **Tek:** ritem pritiskanja levo-desno. Prehiter ritem dvigne srčni utrip, prepočasen izgubi čas. Na klancih
      in spustih se odločaš, kdaj počivati.
    - **Strelišče:** merek niha glede na utrip in veter, zadržiš dih (tipka), a le za kratek čas. Pet tarč, za vsako
      zgrešeno kazenski krog.
    - Napetost je v odločitvi: na strelišče prehiter ali izgubljati čas za počitek.
    - **Do 10 igralcev hkrati** (skupinski štart), ostali so ghosti na progi. Prizorišče npr. izmišljena »Pokljuka«.
49. **Veleslalom / slalom** ★★
    - Pogled od zadaj ali od zgoraj. Smučar zavija z nagibom, ti izbiraš linijo: ožji zavoj je počasnejši,
      preširok pomeni zgrešena vratca.
    - Proge so JSON (vratca, naklon, led ali južni sneg), teren in vratca se dnevno spremenijo po seedu.
    - Dva teka, seštevek časa, ghost najboljšega.
50. **Bob in sankanje** ★★
    - **Štart:** ritem tipk za porivanje. **Kanal:** izbiraš linijo v zavojih (visoko ali nizko). Zaletiš se v steno
      = izguba hitrosti, previsoko v zavoju = prevrnitev.
    - Kratki teki po ~50 s, zato odlično za party z »še en poskus«.

**Poletni in »slovenski« športi**

51. **Kolesarska etapna dirka** ★★★
    - Ni igra refleksov, ampak **taktike**: energija, zavetrje v skupini, napadi na klancih, šprint na koncu.
    - Etape so profili v JSON-u (ravnina, gorska etapa, kronometer), skupni seštevek kot »Dirka po Sloveniji«
      z majicami (rumena, pikčasta, zelena).
    - **Do 10 prijateljev v istem pelotonu**, realtime ali z odločitvami ob kontrolnih točkah, ostale kolesarje vodi AI.
    - Najbolj družabna od teh, ker vsi razumejo trenutek »zdaj napadem«.
52. **Športno plezanje** ★★
    - **Balvan:** kombiniraš prijeme (katera roka, kam). Moč podlakti pada, dinamični skok je tveganje s tajmingom.
    - **Težavnost:** smer na čas; počitek na dobrem oprimku obnovi moč, a vzame čas.
    - Smeri so JSON (prijemi, kakovost, razdalje), smer dneva je enaka za vse.
53. **Kajak na divjih vodah** ★★
    - Tok reke z valji in povratnimi tokovi, vratca zgoraj in spodaj (spodnja proti toku). Dotik vratc +2 s,
      izpuščena +50 s.
    - Prizorišče npr. izmišljen »Tacen«. Tok je lahko preprosto 2D polje sil (kot ventilatorji v Krogli).
54. **Atletski mnogoboj (metanja)** ★★
    - **Kladivo:** ritem vrtenja, spust ob pravem kotu. **Kopje:** zalet, odmet, kot. **Krogla:** moč in kot.
    - Vsaka disciplina traja eno minuto, skupaj **mnogoboj** s točkovno tabelo.
55. **Koš: prosti meti in »Konj«** ★
    - Met z vlečenjem, prava parabola, odboj od obroča in table (fizika žogice iz pinballa).
    - Party igra **»Konj«**: kdor zadene, določi met, drugi ga morajo ponoviti; zgrešen met = črka K-O-N-J.
      Potezno do 10 igralcev.

**Krovna ideja**

56. **Zimske in poletne igre** ★★ (ko obstajajo vsaj 3–4 športi)
    - Vikend dogodek za prijatelje: več disciplin zapored (skoki, biatlon, bob, slalom …) in skupna **tabela medalj**.
    - Sezona se poveže z dosežki in nagradami v trgovini (dresi, zastave).

**Za začetek:** najprej **skoki** (postavijo okvir), nato **kolesarska dirka** (najbolj družabna) ali **biatlon**
(najbolj podoben skokom).

### Klasike s twistom (Motherload, Plants vs Zombies, Worms, Prehistorik)

Žanri znanih iger, a z **lastnim imenom, grafiko, nivoji in pravili**, ne kopija. Vse štiri se ujemajo z obstoječo
arhitekturo brez sprememb v `shared/`: ena mapa `games/<id>/`, čista logika v `logic.js` s testi, offline način,
`hub.reportGame` po vsaki igri.

57. **Rudar: boksitni rudnik (v stilu Motherloada)** ★★ — razširitev točke 35
    - **Igra:** z vrtalnikom kopaš navzdol, paziš na **gorivo**, **trup** in **prostor za tovor**. Rudo pelješ na
      površje in jo prodaš, z denarjem nadgrajuješ sveder, motor, rezervoar, trup, tovorni prostor in hladilnik.
      Globlje je več toplote, žepi plina, lava in trde skale. Na površju so postaja za gorivo, servis in odkup.
    - **Alu povezava:** glavna ruda je **boksit**, odkupuje ga topilnica; redkejše rude in fosili prinesejo bonus.
    - **Svet:** mreža ploščic iz `hub.dailySeed` → **dnevni rudnik**, enak za vse. Lestvica: največ denarja v
      15 minutah ali najgloblje doseženo. Deterministična logika (kopanje, gorivo, odkup) je preprosta za teste.
    - **Kontrole:** tipke ali smerni gumbi na zaslonu (dobro deluje na telefonu).
    - **Multiplayer (2. prompt):** 2–4 igralci v istem rudniku v realnem času; pošilja se le izkopane ploščice in
      položaji (`room.send`), zelo lahko za omrežje. Tekma: kdo prvi zasluži X.
    - **Predlog za začetek:** najlažja od štirih in dobra za dnevni izziv.
58. **Alu obramba (v stilu Plants vs Zombies, tematika aluminijaste tovarne)** ★★
    - **Igra:** mreža 5 vrst × 9 stolpcev, z leve braniš tovarno pred valovi **»rjavcev«** (rja, korozija,
      umazanija, oksidi). Kar pride do konca vrste, ustavi proizvodnjo.
    - **Vir energije** namesto sonca: **ingoti iz elektrolizne celice** (proizvodni stroj, ki ga postaviš).
    - **Stroji:** stiskalnica (strelja profile), valjarna (zid), ekstruder (prebojni strel skozi vrsto),
      hladilni ventilator (upočasni), kad z anodno oksidacijo (bomba na območje), viličar (enkratni »kosilnik« vrste).
    - **Sovražniki:** navadni rjavec, rjavec z vedrom (oklep), hitri prašni vrtinec, oksidni velikan, ki razbija
      stroje, letečo listje/umazanija, ki preleti zid.
    - **Logika:** simulacija s fiksnim korakom v `logic.js` (valovi, streli, trki) → testi; **dnevni izziv** je dnevni
      nabor valov iz seeda. Tap na mrežo je idealen za telefon.
    - **Multiplayer:** co-op (vsak ima svoje vrste) ali **versus** (en igralec pošilja rjavce, drugi brani, kot pri
      Lane wars). Pošiljajo se samo ukazi, zato je sinhronizacija lahka.
    - **Opomba:** tematika aluminijaste tovarne je v redu; za Impolovo ime in logotip v javni igri je bolje dobiti
      dovoljenje (pinball ga že uporablja v `assets/logos/impol.png`). Ne podvaja točke 4 (Obramba gradu je metanje
      stickmanov z miško, tu gre za mrežo in postavljanje strojev).
59. **Topovi na terenu (v stilu Worms)** ★★–★★★ — razširitev točke 5 (`topovi` v `games.json`)
    - **Teren:** uničljiv, kot bitna maska na canvasu (eksplozija izreže krog), voda na dnu, veter na krog.
    - **Ekipe** po 2–4 enote, potezno do 10 igralcev; na vrsti premikanje, skok, ciljanje (kot in moč), strel.
    - **Orožja:** bazuka, granata s časovnikom, kasetna granata, letalski napad, dinamit, vrv, teleport, baseball kij;
      med krogi nakup orožij.
    - **Multiplayer:** `room.setState` / `room.pushMove`. Ključno: **deterministična simulacija strela** (fiksen
      korak), pošlje se samo vnos (kot, moč, orožje, časovnik), vsi odjemalci izračunajo isti izid. Plus **hot-seat**
      na eni napravi in boti za solo.
    - **Tveganje:** veliko orožij in AI botov → 2 prompta (1: teren, fizika, osnovna orožja, potezni multiplayer;
      2: več orožij, boti, trgovina, predmeti v hubu).
60. **Jamar (platformer v stilu Prehistorika)** ★★★
    - **Igra:** platformer s strani. Jamski človek s kijem nabira hrano (točke), premaga dinozavre in živali, na koncu
      nivoja mora imeti dovolj hrane, da odpre izhod. Skrivne sobe, bonus predmeti, šefi na koncu sklopa.
    - **Nivoji:** JSON v `games/jamar/levels/` (kot proge v Krogli), sklopi: gozd, jame, ledena doba, vulkan.
    - **Hub:** ghost najboljšega časa (vzorec `ghost.js` iz Krogle), dnevni nivo, dirka z ghosti v živo prek `room.send`.
    - **Tveganje:** občutek skakanja (pospešek, »coyote time«, buffer skoka) in kontrole na dotik na telefonu; za
      več nivojev potreben urejevalnik → 2–3 prompti (1: gibanje, sovražniki, 6 nivojev, ghost; 2: urejevalnik,
      še nivoji, šefi; 3: dirka v živo).

**Vrstni red teh štirih:** Rudar → Alu obramba → Topovi → Jamar.

## Predlagan vrstni red

1. **Hub + `shared/`** (prijava, profil, lestvica, lobby z room kodo)
2. **Ladjice s powerupi**: potezne, najlažje za testirati multiplayer
3. **Bomba arena**: prvi realtime multiplayer
4. **Lane wars skozi dobe**
5. **Topovi na terenu**: dobra igra za večje družbe
6. **Plemena**: glavna sezonska igra, ko je infrastruktura že preizkušena

Hrčkova krogla je singleplayer z lestvico, zato se lahko vrine kadarkoli (npr. po Ladjicah). Razširitev
trgovine s predmeti za igre je smiselna, ko obstajata vsaj krogla in pinball.

## Naslednji korak

- Napisati **prompt template** za posamezno igro (struktura, pravila za `shared/`, RLS, register v `games.json`).
- Napisati prompt za sam hub.
