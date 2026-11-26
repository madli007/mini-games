# Prompt za AI agenta: Kresnik (2. del: Kraške jame in Planine, lebdenje, kavlji, voda, veter, led)

> **Stanje:** ⬜ čaka — predpogoj 36

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/37-kresnik-svetova.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »61. Kresnik«. 1. del (`prompts/36-kresnik.md`) je naredil igro v `games/kresnik/`:
> lastno fiziko na mreži ploščic, Kresnika s svetlobno kroglo, 1. svet (6 nivojev + Gobji kralj), zemljevid, reže,
> svetilke, medalje, ghoste, posnetke vnosov in drsnike. **Najprej preberi** razdelek »Kresnik« v `PROGRESS.md`
> (posebej »Ni bilo narejeno«) in `games/kresnik/README.md`. Kar iz 1. dela ni bilo narejeno, naredi **najprej**.
>
> Parametri gibanja v `config.js`, nivoji 1. sveta, njihovi časi, medalje, lestvice in ghosti ostanejo **enaki**.
> Nove sposobnosti ne smejo pokvariti posnetkov vnosov 1. sveta (orodje jih mora še vedno prevoziti). Če je dejansko
> stanje v kodi drugačno, kot piše tu, velja koda.

---

## Cilj
1. **Dve novi sposobnosti**, ki odpreta nove vrste nivojev, z učnim nivojem za vsako.
2. **2. svet: Kraške jame** in **3. svet: Planine**, vsak 6 nivojev + šef.
3. Nove mehanike okolja: **voda in plavanje, tokovi, veter, led, temni deli**.
4. Skrivni bonus nivo na svet.

## 1. Sposobnosti
Sposobnost dobiš od dobrega lika (npr. **Pehta**, zelišarka iz pripovedk, ki se prikaže v nivoju po šefu) in se
shrani v režo. Starejši nivoji imajo lahko skrite svetilke, dosegljive šele z novo sposobnostjo (razlog za vrnitev),
a **nikoli** ni sposobnost pogoj za izhod nivoja, ki je bil izdelan pred njo.

- **Prijem in zamah (po 1. svetu):** na **kavljih** (lijane, kamnite zanke, svetleči kavlji) se Kresnik s kroglo
  »pripne« (krogla zadene kavelj → svetlobna vrv) in niha; spust = odlet z gibalno količino. Nihalo je fizikalno
  (dolžina vrvi, gravitacija, dodajanje zamaha z ←/→), deterministično, s testi. Kavlji so lahko premični.
- **Lebdenje (po 2. svetu):** drži skok v zraku → listni plašč upočasni padanje (omejena hitrost padanja, rahel
  vodoravni nadzor), neomejeno trajanje. Z vetrom (spodaj) postane glavno orodje 3. sveta.
- Obe sposobnosti dobita drsnike v `?debug=1` in vrednosti v `config.js` (nove ključe, stari ostanejo nespremenjeni).

## 2. Mehanike okolja
- **Voda:** plavanje (počasnejše gibanje, skok = zamah navzgor), **zrak** (mehurčki-števec, polnjenje na površju ali
  ob zračnem mehurčku), **tokovi** (vodoravni/navpični pospešek v območju), dvig gladine (stikalo dvigne/spusti vodo
  v delu nivoja — deterministično iz časa ali dogodka).
- **Temni deli (jame):** nivo je temen, vidiš le v Kresnikovem siju in ob prižganih svetilkah ali **kresnicah**
  (začasna svetloba, ki jo nosiš). Svetloba je hkrati mehanika (vidnost) in nagrada. Pazi na berljivost: nevarnosti
  morajo imeti rahel lastni sij.
- **Veter (planine):** območja s stalnim ali utripajočim vetrom (pospešek; z lebdenjem odnese daleč), vidni delci.
- **Led:** nizko trenje na ploščicah (daljše zaviranje, drsenje), **ledenice**, ki padejo, ko greš pod njimi.
- **Krušljive ploščice** (kapniki, snežne opasti), **oblačne ploščadi** (enosmerne, nekatere izginejo).

## 3. Svetova
- **2. svet: Kraške jame** (kapniki, podzemna reka, kristali, ponori). Prijazen lik: **človeška ribica**, ki te
  pelje po vodni poti v bonus nivo. Sovražniki (vsaj 3 novi): *netopir* (spi na stropu, zbudi ga svetloba), *pajek na
  niti* (spušča se in dviga), *jamski polž* (počasen, oklep, ranljiv od zadaj), *kapljevka* (kaplja iz stropa).
  **Šef: Jamski rak** (arena z dvigajočo se vodo, škarje, ranljiv po udarcu kapnika, ki ga s kroglo odbiješ s stropa).
- **3. svet: Planine** (Alpe, Triglav v ozadju, oblaki, koče, sneg). Sovražniki (vsaj 3 novi): *gams* (zaleti se po
  ravnini), *snežak* (meče kepe v loku), *orlič* (strmoglavi), *plaz* (dogodek: preganjanje, beži desno).
  **Šef: Ledeni orel** (letenje okoli vrha, veter, padajoče ledenice, faze na treh višinah).
- Vsak svet: **6 nivojev** (45–150 s), naraščajoča težavnost, vsak nivo uvede ali kombinira eno idejo, vsaj en nivo
  na svet je »preganjanje« (samodejni pomik kamere ali plaz za tabo). 6 svetilk na nivo kot v 1. svetu.
- **Bonus nivo** na svet (skrit vhod v enem od nivojev): kratek izziv na čas (zberi vse iskrice v 30 s), nagrada
  dodatno srce v reži (največ 4 srca) ali dosežek.
- Zemljevid: svetova 2 in 3 dobita svoji pokrajini (podzemlje s kapniki, gorska pot), prehod med svetovi z animacijo.
- Grafika: nove teme ploščic in paralakse po pravilih 1. dela (proceduralno ali lastni SVG v `art/`). Jame: kapniki
  v ospredju, kristali, ki odsevajo sij. Planine: sneženje, megla v dolini, sončni žarki.
- Glasba: novi motivi za jame in planine (in šefa), po pravilih 1. dela.

## 4. Preverjanje in medalje
- Vsi novi nivoji imajo posnetek vnosov, ki ga orodje `tools/kresnik-levels.mjs` v Node prevozi (do izhoda in na
  posebni poti z vsemi svetilkami). Medalje iz istega `medalsFromDev`. Tabelo časov zapiši v `PROGRESS.md`.
- Validator razširi z novimi ploščicami in entitetami (in pravilom: nivo mora biti rešljiv s sposobnostmi, ki jih
  ima igralec na tej točki igre — preveri vsaj tako, da posnetek uporablja le te sposobnosti).
- Če imajo nivoji svoje vrstice v Supabase (`kresnik_levels` z zlatimi časi), dopolni SQL in ga poženi.

## 5. Hub
- Dosežki (vsaj 5 novih): `jamar` (vse svetilke 2. sveta), `rak` (premagaj Jamskega raka), `orel` (premagaj Ledenega
  orla), `tarzan` (10 zaporednih zamahov brez dotika tal), `ribica` (najdi vodno pot človeške ribice), `vrh`
  (zlato na vseh nivojih 3. sveta).
- Naloge v `games.json` (dodaj, ne briši): m »Premagaj šefa v Kresniku« (`kresnik:sef`), h »Končaj nivo Kresnika brez
  poškodbe« (`kresnik:brez-poskodbe`).

## 6. Testi (razširi `tests/kresnik.js`)
- Nihalo: perioda in odlet sta deterministična; spust na vrhu zamaha leti dlje kot na dnu.
- Lebdenje: hitrost padanja omejena, brez lebdenja enaka kot prej.
- Voda: zrak se porablja in polni; tok premika junaka; brez sposobnosti je voda v 1. svetu še vedno smrtna, če je bila.
- Led: zavorna pot daljša od navadne.
- **Regresija:** vsi posnetki 1. sveta še vedno pridejo do izhoda z enakim časom.

## Prioritete, če zmanjkuje časa
1. Kar ni bilo narejeno v 1. delu.
2. Prijem in zamah + voda + temni deli + 2. svet (6 nivojev).
3. Šef Jamski rak, zemljevid 2. sveta.
4. Lebdenje + veter + led + 3. svet, šef Ledeni orel.
5. Bonus nivoji, dosežki, glasba, polish.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in vključi na začetek prompta 38.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Kresnik — svetova 2–3«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md`, `shared/README.md`.
2. `games/kresnik/README.md` in razdelek »Kresnik« v `PROGRESS.md`.
3. `games/kresnik/physics.js`, `player.js`, `level.js`, `rules.js`, `tools/kresnik-levels.mjs` (ali dejanska imena).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi vsi obstoječi testi, nespremenjeni).
4. Odigraj ročno vsaj 2 nivoja na svet in oba šefa; z orodjem preveri vse nivoje vseh svetov.
5. Izgled na **telefonu (375×812, ležeče in portret)** in **namizju**: posnemi zaslone (posebej temne jame: berljivost),
   sam jih preglej in popravi.
6. Posodobi `PROGRESS.md`, `games/kresnik/README.md` (nove sposobnosti, ploščice, entitete, sovražniki), `games.json`
   (naloge), korenski `README.md` in **stanje prompta**: vrstica na vrhu → ✅ s commitom, vrstica v `prompts/README.md`.
7. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu
Posodobi prompta **`38-kresnik-finale.md`** in **`39-kresnik-urejevalnik.md`** z dejanskimi spoznanji (imena, nove
entitete, kaj ni bilo narejeno → na začetek 38).

V končnem odgovoru kratko povzemi: kaj je narejeno, kaj (če kaj) moram narediti v Supabaseu, kaj je bilo
posodobljeno v promptih 38–39 in kaj ni bilo preverjeno.
