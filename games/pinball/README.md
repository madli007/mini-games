> **Kopija v MINI GAMES hubu.** To je kopija igre ALU PINBALL 2.0 v `games/pinball/`. Izvirnik (z zgodovino, raziskavo
> `PREDLOGI-FIRME.md` in izvornimi logotipi) je v ločenem repoju **`pinball`**. Tukaj sta dodana le povezava »← MINI GAMES HUB«
> na začetnem zaslonu in skupni XP huba ob koncu igre (`hubXp` v `src/main.js`). Lestvica ostaja v tabeli `scores`.

# ALU PINBALL 2.0 — Impol × Alcad edition

Moderen pinball za hec v brskalniku: lastna 2D fizika, WebGL izris z bloomom, brušenim aluminijem
in animirano talino, barvni DMD zaslon, svetlobni šovi, proceduralna glasba in efekti.
Čisti HTML + JavaScript (ES moduli), **brez build koraka in brez knjižnic**. Teksture, zvok in glasba so generirani v kodi;
edina slikovna datoteka je logotip v `assets/logos/impol.png`.

Na mizi so prava podjetja skupine Impol in Alcad (Impol LLT, PCP, FT, Stampal SB, Rondal, R in R, Servis, Kadring,
Seval, TLM, Alcloud). Raziskava in ozadje: [PREDLOGI-FIRME.md](PREDLOGI-FIRME.md).

> Igra za hec. Imena in logotipi so uporabljeni z dovoljenjem (nastavljivo v `src/config.js`).

## Zagon lokalno

ES moduli zahtevajo strežnik (dvoklik na `index.html` ne deluje):

```
npx --yes http-server@14.1.1 . -p 8123 -c-1
```

Nato odpri <http://localhost:8123>. Testi: <http://localhost:8123/tests.html> ali brez brskalnika `node tests/run-node.mjs`.

## Objava na GitHub Pages

1. Potisni repo na GitHub (v korenu morajo biti `index.html`, `src/`, `tests/`).
2. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
3. Čez minuto je igra na `https://<uporabnik>.github.io/<repo>/`.

Edina zunanja povezava so pisave Google Fonts (Orbitron, Rajdhani, Share Tech Mono); brez njih igra deluje s sistemskimi pisavami.

## Kontrole

| Vnos | Akcija |
|---|---|
| Z / ← / levi Shift | levi flipper |
| M / → / desni Shift | desni flipper |
| Presledek / ↓ (drži in spusti) | izstrelitev (moč = čas držanja) |
| B / ↑ | tresenje mize (pazi na TILT: 2 opozorili) |
| P / Esc | pavza |
| O | zvok vklop/izklop |
| Enter | začni igro |
| **Dotik** | leva/desna polovica zaslona = flipper · povleci navzdol spodaj desno = plunger · hiter poteg navzgor ali gumb ⇡ = tresenje · gumb ❚❚ = pavza |
| **Gamepad** | LB/RB (ali LT/RT) flipperja · A izstrelitev · Y tresenje · Start pavza |

Igra se samodejno ustavi, ko zavihek ali okno izgubi fokus. Pred izstrelitvijo flipperja premikata skill shot.

## Pravila

**Strele:** levi orbit s spinnerjem (**Impol FT · valjarna**), rampa (**Impol PCP · stiskalnica**, dvignjena pot, vrne žogico na levi inlane),
livarna (**Impol LLT**, scoop desno), B·U·G drop tarče (Alcad kontrola kakovosti), Code review tarča (Alcad, mystery **Alcloud**),
A·L·U kanali zgoraj, 3 pop bumperji »Al 13« (**Impol · Impol Seval · Impol-TLM**), slingshota in kickback (**Stampal SB**).

| Dogodek | Podjetje |
|---|---|
| začetek igre | **Kadring: zaposlen!** |
| bonus ob koncu žogice | **Kadring: izplačilo** |
| ball save | **Impol R in R** |
| ball search (zataknjena žogica) | **Impol Servis** |
| extra ball, add-a-ball | **Rondela** (Rondal) |
| locka | **Impol Seval**, **Impol-TLM** |
| jackpot / super jackpot | **FT jackpot**, **PCP jackpot** / **New York** (Impol Aluminum Corp.) |

- **A·L·U kanali** → bonus množitelj ×2 … ×6. Flipperja premikata prižgane luči (lane change).
- **Skill shot**: zadeni utripajoči kanal neposredno iz izstrelitve → 182.500 (»od 1825«).
- **B·U·G tarče** → prižgejo **LOCK** v livarni (po prvem multiballu sta potrebna dva kompleta).
- **2 locka → MULTIBALL** (3 žogice; zaklenjena žogica je vidna v peči). Orbit in rampa sta **JACKPOT**; ko zadeneš oba,
  se v livarni prižge **SUPER JACKPOT** (2,5 × jackpot). B·U·G med multiballom = **ADD-A-BALL** (enkrat).
- **Combo**: zaporedni veliki streli (orbit, rampa, code review) v 4 s; prikaz na DMD. Zaporedne rampe dajo še rampni combo.
- **Code review**: 3 zadetki → **mystery award** (točke, lock, extra ball, ball save, množitelj, prižgana misija, kickback).
- **Extra ball** (»Rondela«) se prižge po 8 orbitih (pobereš ga v livarni).
- **Kickback** v levem outlanu; spinner ga ponovno prižge (vsakih 50 obratov). **Ball save** 10 s po izstrelitvi.
- **Bonus** ob koncu žogice: zbran bonus × množitelj (TILT ga izniči).

### Misije (začnejo se v livarni, ko je misija prižgana)

Prva misija je prižgana na začetku, naslednje prižgejo zadetki rampe (3–5). Med misijo luči kažejo, kaj streljati.

| Misija | Cilj | Čas |
|---|---|---|
| **LLT: Livarna** (Impol LLT) | zadeni bumperje 12× — peč se vidno segreva | 40 s |
| **FT: Folija** (Impol FT) | navij 50 m folije: spinner 1 m, orbit 12 m | 45 s |
| **Alcad hotfix** | hurry-up: vrednost pada od 2.000.000, zadeni rampo, preden pade na nič | 30 s |
| **Alcad sprint** | zadeni vseh 5 označenih strelov (orbit, rampa, livarna, B·U·G, review) | 60 s |

**Finale »Naročilo izpolnjeno«** (wizard, »izvoz na 50 trgov«): ko opraviš vse štiri misije, se v livarni prižge finale — 4-ball multiball,
vse je vredno jackpot, poseben svetlobni šov in glasba. Ko ostane ena žogica, dobiš nagrado in misije se začnejo znova.

## Grafika in kakovost

- WebGL: miza v shaderju (brušen aluminij z anizotropnim odsevom, ki sledi kameri in žogicam), animirana talina (fbm šum),
  dinamične luči žogic in bliskov, toplotna distorzija nad pečjo, večnivojski bloom (dual-kawase), ACES, vinjeta, rahla perspektiva.
- Dinamični elementi (kromirane žogice z odsevom okolja in senco, bumperji, flipperji, slingi, tarče, spinner, rampa) se rišejo
  v Canvas 2D sloj, ki ga shader združi z emisijskim slojem za bloom.
- **Kakovost**: Samodejno / Nizka / Srednja / Visoka / Ultra (Nastavitve). Samodejno začne z Visoko (na telefonu Srednjo),
  zniža stopnjo, če fps pade pod ~48, in se vrne nazaj, če znižanje ne pomaga (zaslon z 30 Hz).
- Brez WebGL igra preklopi na preprostejši 2D izris.

## Rekordi

Top 10 z arkadnim vpisom 3 inicialk (flipperja ali puščici menjata črko, presledek potrdi, lahko tudi tipkaš; na dotik ▲▼).
Statistika (igre, najdaljši combo, največji jackpot, misije, finale, čas) je v `localStorage` (ključi `aluPinball2.*`).

### Skupna lestvica (Supabase)

Rekordi vseh igralcev se shranjujejo v Supabase, brez lastnega strežnika: igra kliče REST API z navadnim `fetch`.
Panel in zaslon z rekordi pokažeta **SKUPNO LESTVICO**, osvežita se ob nalaganju, ob koncu igre in vsako minuto.
Rekord se vedno shrani tudi lokalno; če skupna lestvica ni dosegljiva ali rekord zavrne, igra to pove in pokaže lokalno lestvico.

- Nastavitev: `CFG.lestvica` v `src/config.js` (URL projekta in javni *publishable* ključ). Prazen `url` = samo lokalno.
- Tabela in pravila: [`supabase/scores.sql`](supabase/scores.sql) — enkrat zaženi v Supabase SQL Editorju (lahko večkrat).
- Zaščita pred goljufanjem:
  - igralec rekorde samo dodaja in bere (ime, točke, datum), ne more jih spreminjati ali brisati;
  - ime 1–3 znaki, točke deljive z 10 in največ 500 mio, igra vsaj 20 s, datum nastavi baza;
  - smiselnost: največ 400.000 točk na sekundo, nad 5 mio vsaj multiball ali misija, nad 100 mio finale,
    finale zahteva 4 misije (meje izmerjene z botom na 135 igrah, z veliko rezervo);
  - največ 10 rekordov na minuto skupaj, isto ime največ enkrat na 20 s.
- Kdor dobro pozna pravila, lahko še vedno pošlje verjeten izmišljen rezultat. Takega izbriši v Supabase
  (**Table Editor → scores**). Popolna zaščita bi zahtevala ponovno odigranje igre na strežniku (Edge Function).

## Struktura

```
index.html            postavitev (ohišje, DMD, miza, stranski paneli)
tests.html            testi v brskalniku
assets/logos/         logotip Impol (impol.png se uporablja; ostale datoteke so izvirniki)
src/logos.js          nalaganje logotipov, obarvanje, bitna slika za DMD (brez slike → tekst)
src/config.js         CFG (imena, žogice, ravnotežje), fizikalne konstante, paleta, misije, stopnje kakovosti
src/table.js          geometrija mize, senzorji, luči (inserti)
src/physics.js        fizika: kapsule, krogi, flipperji (ω×r), trenje, plasti (rampa), enosmerna vrata
src/rules.js          pravila: točkovanje, misije, multiball, wizard, mystery, combo, tilt, ball search
src/audio.js          Web Audio: efekti (reverb, panning) + proceduralna glasba s plastmi
src/render/art.js     proceduralna grafika mize (potisk, dvignjeni elementi, neon, rampa, panorama za krom)
src/render/scene.js   dinamični sloj (inserti, bumperji, flipperji, žogice, delci)
src/render/gl.js      WebGL shaderji in bloom
src/render/lights.js  svetlobni šovi in attract način
src/render/dmd.js     DMD 128×32 z bitno pisavo in animacijami
src/render/renderer.js kamera, efekti, kakovost, 2D rezerva
src/ui.js             zasloni, nastavitve, inicialke, paneli
src/input.js          tipkovnica, dotik, gamepad
src/storage.js        localStorage (try/catch)
src/leaderboard.js    skupna lestvica (Supabase REST) z lokalno rezervo
supabase/scores.sql   tabela, pravila in preverjanje za skupno lestvico
src/main.js           povezava vsega in glavna zanka
tests/tests.js        streli s flipperjev, rampa, stresni test (brez tuneliranja), ball search, pravila, bot
```

## Prilagajanje

V `src/config.js`:

- `CFG.naslov`, `CFG.podnaslov`, `CFG.firmaA`, `CFG.firmaB`, `CFG.opomba` — besedila;
- `CFG.imena` — imena podjetij na strelih in v sporočilih; `CFG.logotipi = false` izklopi logotipe (povsod ostane tekst);
- `CFG.skillShot` — vrednost skill shota;
- `CFG.steviloZogic`, `CFG.ballSaveSek`, `CFG.multiballSaveSek`, `CFG.wizardSaveSek` — prizanesljivost;
- `CFG.comboOkno`, `CFG.rampZaMisijo`, `CFG.orbitZaExtraBall`, `CFG.reviewZaMystery`, `CFG.spinZaKickback` — ravnotežje;
- `MODES` — cilji, časi in nagrade misij; `QUALITY` — parametri stopenj kakovosti.

Fizikalne konstante (`GRAV`, `MAXV`, `STEP`, `BR`) so uglašene — spreminjaj previdno in nato zaženi teste.

V konzoli brskalnika je na voljo `__pinball` (stanje igre) in `__pinball.snap()` (posnetek mize v polni ločljivosti).
