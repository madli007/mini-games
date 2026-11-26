# Prompt za AI agenta: Kresnik (3. del: Mlinska dolina, Barje, Morin grad, »Na čas« za celo igro, trgovina)

> **Stanje:** ⬜ čaka — predpogoj 37

> Uporaba: v novi seji (delovna mapa `D:\Git\Brainstorm\mini-games`) napiši
> **»Preberi prompts/38-kresnik-finale.md in ga v celoti izvedi.«**
>
> Ozadje: `PREDLOGI-IGER.md` → »61. Kresnik«. Igra `games/kresnik/` ima svetove 1–3 (prompta 36 in 37): gibanje,
> svetlobno kroglo, prijem in zamah, lebdenje, vodo, veter, led, tri šefe, zemljevid, reže, medalje in ghoste.
> **Najprej preberi** razdelke »Kresnik« v `PROGRESS.md` (posebej »Ni bilo narejeno«) in `games/kresnik/README.md`.
> Kar iz prejšnjih delov ni bilo narejeno, naredi **najprej**.
>
> Parametri gibanja, obstoječi nivoji, časi, medalje, lestvice in ghosti ostanejo enaki; posnetki vnosov vseh
> obstoječih nivojev morajo še vedno priti do izhoda. Če je dejansko stanje v kodi drugačno, kot piše tu, velja koda.

---

## Cilj
1. Zadnja sposobnost **šprint** in **4. svet: Mlinska dolina**, **5. svet: Barje** (vsak 6 nivojev + šef).
2. **Finale: Morin grad** (3–4 nivoji + končni šef Mora), konec zgodbe in odjavna špica.
3. **»Na čas« za celo igro** (speedrun) in **100 %** napredek.
4. **Kozmetika v trgovini** (videz, gibanje je za vse enako).

## 1. Šprint (po 3. svetu)
- Drži tipko (Shift/`K`; na telefonu dvojni tap smeri ali poseben gumb) → večja največja hitrost po kratkem zaletu,
  daljši skoki. Vidna sled svetlobe. Nove vrednosti v `config.js` in drsniki v `?debug=1`.
- Nivoji 4.–5. sveta imajo odseke, kjer je šprint potreben (dolg preskok, beg pred dogodkom).

## 2. Svetova
- **4. svet: Mlinska dolina** (vodni mlini, zobniki, žage, brvi, slapovi). Mehanike: **vodna kolesa** (vrteče se ploščadi),
  **zobniki** (ploščadi na krožni poti), **žage** (nevarnost na tirnici), **vodni curki** (dvignejo te, vklop s stikalom),
  **tehtnice** (ploščad pade pod težo, druga se dvigne). Sovražniki (vsaj 3 nove): *mlinarjev pes*, *podgana v vrečah*,
  *vodni mož* (povodni mož iz pripovedk, potegne te v vodo). **Šef: Mlinar-stroj** (velik lesen stroj z zobniki, ki ga
  razstaviš kos za kosom; ranljiva točka se odkrije po zadetku stikal v pravem vrstnem redu).
- **5. svet: Barje** (kolišča, megla, trstičje, močvirne lučke, ki zavajajo). Mehanike: **ugrezajoča tla** (počasi tone,
  dokler stojiš na njih), **megla** (omejena vidljivost, odpihneš jo z nabito kroglo), **čolni na vodi** (premične
  ploščadi), **lažne lučke** (videti so kot svetilke, a te zvabijo v past — z drugo barvo, da je pošteno). Sovražniki
  (vsaj 3 novi): *žaba-skakalka*, *vešča* (leti in te zaslepi), *trstni vrag*. **Šef: Vešča z Barja** (megla, kopije sebe,
  pravo prepoznaš po senci).
- **Finale: Morin grad** (3–4 nivoji, kombinacija vseh sposobnosti in mehanik, najtežji del igre) in **končni šef Mora**
  (več faz, vsaka pokliče napad iz enega od prejšnjih svetov, zadnja faza: ugasne vsa svetloba, vidiš le prižgane
  svetilke, ki si jih zbral; jih več imaš, lažje je — nagrada za zbiranje).
- **Pogoj za finale:** vsi drobci Sonca (šefi 1–5) **in** določen delež svetilk (privzeto 80 % vseh; možnost nastavitve
  »Klasično: vse svetilke« ob ustvarjanju reže). Na zemljevidu jasno prikaži, koliko še manjka in kje.
- **Konec:** Sonce se sestavi, dežela se razsvetli (animacija čez vse zemljevide), odjavna špica s seznamom svetov,
  statistiko reže (čas, smrti, iskrice, svetilke) in »Hvala za igranje«. Po koncu: odklene se **Nova igra+** (sovražniki
  hitrejši, manj src) kot neobvezna izbira.
- Bonus nivo na svet kot v 2. delu.

## 3. »Na čas« za celo igro in 100 %
- **Speedrun reže:** ura teče od začetka reže do zadnjega udarca po Mori (brez menijev in pavze; čas v igri). Dve
  kategoriji: **Konec** (najhitreje do konca) in **100 %** (vse svetilke, vsi bonus nivoji). Lestvici v hubu (ločeni
  seed ključi, npr. `run:konec`, `run:100`), prikaz v profilu reže.
- **Razdelki (splits):** časi po svetovih, primerjava z osebnim rekordom (zeleno/rdeče) v kotu zaslona (izklopljivo).
- **Napredek 100 %:** na zemljevidu in v profilu reže odstotek; seznam manjkajočih svetilk po nivoju.

## 4. Trgovina (kozmetika)
- Predmeti za Kresnika v `shared/cosmetics.js` in `shop_items` v `supabase/schema.sql` (uskladi z
  `node tools/shop-sql.mjs`): **barva svetlobe** (4–6 barv), **plašč** (listni, snežni, mlinarjev predpasnik, zvezdni),
  **sled krogle** (iskre, cvetni listi, snežinke), **kapica**. Cene uskladi z obstoječo ekonomijo (`tests/economy-sim.js`).
- Oprema se bere iz profila (kot pri drugih igrah z opremo — preberi, kako to dela `games/skoki/gear.js`), vidi se v igri,
  na ghostu in v predogledu v garderobi. Gibanje in hitbox sta za vse enaka.

## 5. Hub
- Dosežki (vsaj 7 novih): `mlinar` (premagaj Mlinarja-stroj), `vesca` (premagaj Veščo), `sonce` (premagaj Moro),
  `sto-odstotkov` (100 %), `brez-smrti-svet` (cel svet brez smrti v eni vožnji), `ng-plus` (konec Nove igre+),
  `speedrun-60` (konec pod 60 minutami — uglasi glede na dejanske čase).
- Naloge (dodaj): w »Premagaj 3 šefe v Kresniku ta teden« (`kresnik:sef`, target 3).
- XP za konec igre in 100 % (večji enkratni znesek, v okviru omejitev RPC).

## 6. Preverjanje
- Posnetki vnosov za vse nove nivoje in šefe; orodje prevozi vse nivoje vseh svetov. Tabela časov v `PROGRESS.md`.
- Posnetek celotne igre ni potreben; dovolj je veriga posnetkov po nivojih + test, da logika reže (odklepanje, drobci,
  pogoj za finale) pravilno sledi zaporedju.
- Testi: šprint (hitrost, preskok), ugrezajoča tla, tehtnica, pogoj za finale (80 % / vse), ura speedruna (pavza in
  meniji se ne štejejo), Nova igra+.

## Prioritete, če zmanjkuje časa
1. Kar ni bilo narejeno v prejšnjih delih.
2. Šprint + 4. svet + šef.
3. 5. svet + šef.
4. Morin grad + Mora + konec igre (to je obvezno za občutek »prave igre«).
5. Speedrun in 100 %, trgovina, Nova igra+, dosežki.
Kar ne bo narejeno, zapiši v `PROGRESS.md` pod »Ni bilo narejeno« in vključi na začetek prompta 39.

---

## Fiksni del (ne spreminjaj)

**Delaj v enem kosu, do konca.** Ne ustavljaj se po fazah in ne sprašuj za potrditev vmesnih korakov.
Vprašaj samo, če si res blokiran. Sproti vodi `PROGRESS.md` (sekcija »Kresnik — finale«: načrt s kljukicami,
dnevnik, »Ni bilo preverjeno«).

### Najprej preberi
1. `CLAUDE.md`, `shared/README.md` (posebej kozmetika in trgovina).
2. `games/kresnik/README.md` in razdelke »Kresnik« v `PROGRESS.md`.
3. `shared/cosmetics.js`, `tools/shop-sql.mjs`, `games/skoki/gear.js` (oprema v igri).

### Obvezna preverjanja (pred commitom)
1. Strežnik prek `.claude/launch.json` (`mini-games`, port 8124); vse preizkusi v brskalniku.
2. **Konzola brez napak** v igri, v trgovini in na dashboardu.
3. `node tests/run-node.mjs` in `tests.html` uspešni (tudi simulacija ekonomije).
4. Odigraj ročno vsaj 2 nivoja na nov svet, vse nove šefe in Moro; z orodjem preveri vse nivoje. Preveri konec igre
   (z režo, ki ima napredek nastavljen prek `?debug=1`).
5. Kupi in opremi predmet v trgovini (offline) in preveri, da se vidi v igri in na ghostu.
6. Izgled na **telefonu (375×812, ležeče in portret)** in **namizju**: posnemi zaslone, sam jih preglej in popravi.
7. Če si spremenil `schema.sql` (katalog), ga poženi na Supabase (MCP) in preveri advisors; sicer zapiši v `PROGRESS.md`.
8. Posodobi `PROGRESS.md`, `games/kresnik/README.md`, `games.json`, korenski `README.md` in **stanje prompta**: vrstica
   na vrhu → ✅ s commitom, vrstica v `prompts/README.md`.
9. **Commit** na `main` z opisnim sporočilom. Ne pushaj.

### Na koncu
Posodobi prompt **`39-kresnik-urejevalnik.md`** z dejanskimi spoznanji (vse entitete in sovražniki, ki jih mora
urejevalnik podpirati, kaj ni bilo narejeno → na začetek 39).

V končnem odgovoru kratko povzemi: kaj je narejeno, kaj (če kaj) moram narediti v Supabaseu, kaj je bilo
posodobljeno v promptu 39 in kaj ni bilo preverjeno.
