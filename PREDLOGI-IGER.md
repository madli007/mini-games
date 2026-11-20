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
6. **Motorist fizika** ★
   - 2D motor po hribčkih, trije nivoji in »ghost« najboljšega časa iz Supabase.

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
      - **Rušilec (party, 2–8 igralcev)**: arena, izrivaš druge čez rob, točka za vsak izriv, na čas.
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
