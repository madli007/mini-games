# Hrčkova krogla (`games/krogla/`)

Singleplayer 3D arkada: hrčka v stekleni krogli kotališ po progah, ki visijo v zraku, do zlatega obroča (cilja).
Navdih je Hamsterball (Raptisoft, 2004), imena, proge, grafika in zvok pa so naši.

## Kontrole

| Naprava | Upravljanje |
|---|---|
| Tipkovnica | puščice ali **WASD** |
| Miška | (vklop: Nastavitve → »Tipkovnica in miška«; privzeto izklopljena) krogla se kotali proti kazalcu (dlje je kazalec od krogle, hitreje gre; mrtva cona okoli krogle) |
| Telefon | **virtualna palica** levo spodaj (privzeto) ali **nagib telefona** (Nastavitve → »Vklopi nagib«, na iOS ob tapu vpraša za dovoljenje; »Kalibriraj« = trenutni položaj je ravno) |
| `Esc` / `P` / ⏸ | pavza (igra se sama ustavi, ko zavihek ni viden) |
| `R` / ↺ | Na čas: začni znova · turnir in dnevni izziv: na zadnjo kontrolno točko (−2 s) |

Vhod je vedno relativen na kamero (gor = stran od kamere). Kamera se rahlo zasuka v smeri gibanja (Nastavitve → izklop).

## Načini

- **Turnir** — vseh 12 prog zapored, ura s prenosom časa. Lahka ×1,4 časa / ×0,5 točk (nič ne odklene), Normalna ×1, Noro ×0,75 / ×1,5.
  Točke: 1000 na progo + 20 na preostalo sekundo ob cilju + 100 na zvezdico. Lestvica `turnir:<težavnost>`.
- **Na čas** — posamezna proga brez ure, medalje, ghosti (moj najboljši, razvijalčev = autopilot, ali klik na vrstico lestvice
  za ghost drugega igralca). Proga se odklene, ko jo dosežeš v turnirju na Normalni/Noro. Lestvica `lvl:<id>` (`lvl-m:<id>` zrcaljeno), čas v ms.
- **Zrcalni turnir** — po končanem turnirju (Normalna/Noro; dosežek `turnir`, velja na vseh napravah). Lestvica `zrcalo:<težavnost>`.
- **Dnevni izziv** — `hub.rng(hub.dailySeed() + ':krogla')` izbere 3 proge iz prvih 8 in dodatek dneva
  (`rules.js` → `DAILY_MODS`). Prvi začeti poskus dneva šteje za lestvico (`seed = hub.dailySeed()`), ostali so trening.

Razvojni parameter `?bot=1`: proge vozi autopilot skozi pravo zanko igre (za preverjanje).

## Moduli

| Datoteka | Vsebina |
|---|---|
| `physics.js` | čista fizika: krogla, trenje (led, lepilo), naklon, trki s ploščicami in kvadri, premične/vrtljive plošče, sile (ventilatorji, sesalci, magneti), sovražniki; fiksni korak 120 Hz, podkoraki proti tuneliranju |
| `level.js` | format, validator (`validateLevel`), zrcaljenje (`mirrorLevel`), nalaganje |
| `rules.js` | ura, točke, težavnosti, medalje, odklepi, dnevni izbor in dodatki, dosežki, oblikovanje časov |
| `ghost.js` | zapis (20 vzorcev/s), stiskanje (delta-delta + varint + base64; ~12 KB za 2 min), predvajanje |
| `autopilot.js` | »voznik« po točkah poti (`route`) — test rešljivosti in razvijalčev ghost |
| `render.js` + `render/` | Three.js `0.160.0` (CDN, importmap): `looks.js` (lokacije po progah), `textures.js` (proceduralne PBR teksture), `sky.js` (nebo + IBL/PMREM), `materials.js` (dither prosojnost, plapolanje), `terrain.js` (teren, vertex AO, robovi), `objects.js` (ovire in sovražniki), `ball.js` (steklo, hrček s shell krznom), `fx.js` (delci, sled), `decor.js` (okras), `post.js` (bloom, AO, SMAA/FXAA, barvna korekcija, tilt-shift) |
| `input.js`, `audio.js` | vhod (tipke, miška, palica, nagib) · WebAudio učinki in glasba |
| `secrets.js` | skrite ključavnice (Neon, Nebo), ki odklenejo skrivni areni v Rušilcu (`../rusilec/`); zunaj fizike in JSON-a prog |
| `game.js` | meni, načini, stanja (odštevanje, igra, pavza, povzetek, konec), hub |

**Videz krogle** je parameter (`DEFAULT_SKIN` v `render.js`: `glass`, `opacity`, `rim`, `rider` = `'hamster'` ali emoji, `fur`, `trail`; nova polja `tint` (barva globine stekla), `roughness` (0–0,3), `pattern` (`none|stripes|dots|stars|hex`)).
Igra ga prebere iz `localStorage` (`krogla:skin`). Fizika je za vse skine enaka.

**Kakovost** (`QUALITY`): Ultra (GTAO, SMAA, globinska ostrina, prava transmisija stekla, 16 lupin krzna, senčna mapa 4096), Visoka (2048, brez AO), Srednja (FXAA, bloom, lažno Fresnel steklo, 6 lupin), Nizka (brez post-processinga, strojni MSAA, kontaktna senca, 3 lupine). Samodejna izbira (`detectQuality`) po zaslonu na dotik, jedrih in GPU; ob FPS < 45 se kakovost samodejno zniža. Ob izgubi WebGL konteksta igra preklopi na Nizko. Ob prvem obisku meni pokaže izbirnik kakovosti in 3D ozadje menija se zažene šele po izbiri; kakovost je tudi v glavnem meniju (»Grafika«). Nastavitve: kakovost, ozadje menija (animirano/statično/izklopljeno), post-processing, globinska ostrina, tresenje kamere.
Razvojni parametri: `?lvl=N` (takoj odpri progo), `?q=ultra|high|medium|low`, `?dev=1` (`window.__kr` za meritve).

## Format proge (`levels/NN-ime.json`)

Proge so podatki. Vrstni red je v `levels/index.json`. Koordinate: `x` vzhod, `z` jug (vrstica 0 = sever, daleč od kamere),
ploščica (stolpec c, vrstica r) pokriva `x ∈ [c, c+1]`, `z ∈ [r, r+1]` (središče `c + 0,5`).

```jsonc
{
  "id": "01-ogrevanje", "name": "Ogrevanje", "set": 1, "desc": "…",
  "size": [W, D],
  "timeBonus": 28,                       // sekunde, ki se prištejejo uri (× težavnost)
  "medals": { "gold": 17, "silver": 22, "bronze": 29 },
  "theme": { "sky": ["#zgoraj", "#spodaj"], "fog": "#…", "floor": "#…", "side": "#…", "edge": "#…", "accent": "#…", "wall": "#…" },
  "map":  ["  ...  ", …],                // D vrstic po W znakov (ploščice)
  "hmap": ["0001112", …],                // višine: '0'–'9' = 0–4,5, 'a'–'z' = 5–17,5 (korak 0,5)
  "start": [x, z], "goal": [x, z], "checkpoints": [[x, z], …],
  "pickups": [{ "t": "star" | "clock", "x": …, "z": …, "y"?: … }],    // točno 5 zvezdic
  "movers":   [{ "path": [[x, y, z], …], "size": [w, d], "speed": 1.6, "pause": 2, "phase": 0, "loop": false }],
  "spinners": [{ "x", "z", "r", "y", "speed" }],                       // rad/s
  "springs":  [{ "x", "z", "dir": [dx, dz], "power": 8, "up": 7 }],
  "fans":     [{ "x", "z", "dir": [dx, dz], "len", "width", "force", "y"? }],
  "bumpers":  [{ "x", "z", "r", "power" }],
  "bowls":    [{ "x", "z", "r", "depth" }],                            // sklede/lijaki v terenu
  "hammers":  [{ "x", "z", "w", "d", "period", "phase", "dir": [dx, dz] }],
  "switches": [{ "x", "z", "id" }], "doors": [{ "x", "z", "w", "d", "y", "h", "id" }],
  "blocks":   [{ "x", "z", "w", "d", "y0", "y1" }],                    // poljubni trdni kvadri (tudi tanke stene)
  "enemies": [
    { "t": "bully", "x", "z", "zone": 5, "accel"?: 7.5 },              // nasilnež: lovi v območju, izriva čez rob
    { "t": "saw", "path": [[x, z], …], "speed", "phase", "loop": false },
    { "t": "wasp", "path": [[x, z], …], "speed", "loop": true },
    { "t": "vacuum", "x", "z", "dir": [dx, dz], "range", "angle", "force" },
    { "t": "magnet", "x", "z", "mode": "pull" | "push", "period", "duty", "phase", "range", "force" }
  ],
  "route": [{ "x", "z", "speed"?, "r"?, "stop"?, "wait"?, "until"?: [perioda, od, do], "mover"?: i }],   // autopilot
  "dev": { "time": 17.2, "falls": 0 }                                  // vožnja autopilota (izpolni generator)
}
```

Znaki ploščic: `' '` praznina · `.` tla · `#` zid · `^ v < >` klančina, ki se dvigne za 0,5 proti severu/jugu/zahodu/vzhodu
(višina v `hmap` je nižji konec) · `i` led · `g` lepilo · `~` valovita tla · `x` padajoča ploščica · `N S E W` tekoči trak v to smer.

Vsi sovražniki so deterministični (poti in časovniki iz časa proge, nasilneži iz stanja), zato so časi in ghosti pošteni.

## Kako dodati progo

1. V `tools/krogla-levels.mjs` dodaj `def({ id: '13-ime', name, set, theme, desc }, () => { const T = new Track(); … return T; })`.
   »Želvica« (`T.go(n, { w, ch, up, down, conv })`, `T.turn('E')`, `T.gap(n, dh)`, `T.mark('star' | 'clock' | 'cp' | 'goal')`,
   `T.pocket(...)`, `T.add('movers', {...})`, `T.wp({...})`) sproti zapiše tudi pot za autopilota.
2. `node tools/krogla-levels.mjs --dump=13` izriše progo s potjo autopilota in mesti padcev; popravljaj, dokler ne pride do cilja.
3. `node tools/krogla-levels.mjs` zapiše JSON-e, `index.json` in zlate čase v `supabase/games/krogla.sql` (blok `BEGIN LEVELS`).
   Medalje in `timeBonus` se izračunajo iz vožnje autopilota (zlato ≈ 0,97 ×, srebro 1,28 ×, bron 1,65 ×, ura 1,25 × + 6 s).
4. `node tests/run-node.mjs` — validator in test rešljivosti (autopilot pod časom proge na Normalni) poženeta vse proge.
5. Na Supabase ponovno poženi `supabase/games/krogla.sql` (doda progo v `krogla_levels`, sicer RPC zavrne ghost).

Proge lahko pišeš tudi ročno v JSON (brez generatorja) — `route` je potreben le za test rešljivosti.

## Urejevalnik prog (`editor.html`)

Odpre se iz menija igre (kartica »Moje proge« → ✏️ Urejevalnik); ni ločena igra v `games.json`. Dela neposredno na formatu
proge (isti JSON kot `levels/*.json`). Moduli: `editor.js` (UI), `editor/model.js` (čista logika: resize, ploščice, zapolni,
klančine, opozorila višin, objekti, razveljavi/uveljavi — testi v `tests/tests.js`), `editor/view2d.js` (tloris),
`editor/preview3d.js` (3D predogled z obstoječim `Renderer` + orbit kamera prek `renderer.debugCam`, testna vožnja),
`editor/drafts.js` (osnutki in lokalni rekordi), `editor/share.js` (povezava za deljenje). Barvne teme so v `themes.js`
(skupne z generatorjem), formula medalj v `rules.js` (`medalsFromTime`, `timeBonusFromTime`, `scoringFromRun`).

**Plasti** (tipke `1`–`5`): **Ploščice** (paleta vseh znakov; čopič 1–5, pravokotnik, zapolni, pipeta) ·
**Višine** (barvni prikaz + številke; nastavi, dvigni/spusti ±0,5, *klančina*: povleci od ene višine do druge v isti
vrstici/stolpcu in vmes se postavijo pravi znaki klančin; rdeče črte = stopnica > 0,22, ki je krogla ne prevozi) ·
**Objekti** (start, cilj, kontrolne točke, zvezdice/ure, premične plošče, vrtiljaki, vzmeti, ventilatorji, odbijači,
sklede, kladiva, stikala + vrata, kvadri, vsi sovražniki; ikona, smer in območje delovanja na tlorisu; plošča lastnosti
desno; poti žag/os/plošč: »✏️ Urejaj točke poti«) · **Pot autopilota** (`route`: točke s `speed`, `r`, `stop`, `wait`,
`until`, `mover`; »Iz zadnje vožnje« naredi pot iz tvoje testne vožnje) · **Lastnosti** (ime, opis, id, sklop, lokacija
`look`, barvna tema, `camYaw`, medalje in čas, velikost mreže na vsaki strani, »Obreži prazne robove«).

| Bližnjica | |
|---|---|
| kolešček · srednji gumb / presledek + vleka · `Home` | zoom · premik pogleda · cela proga (telefon: dva prsta, tap = postavi, dolg pritisk = meni) |
| `B` `R` `F` `K` (Alt + klik) · `U` `J` `L` · `[` `]` | čopič/nastavi, pravokotnik, zapolni, pipeta · dvigni, spusti, klančina · velikost čopiča |
| `Del` · `Ctrl+D` · puščice · `Esc` | izbriši · podvoji · premakni izbrani objekt (Shift = 0,1) · prekliči |
| `Ctrl+Z` · `Ctrl+Y` / `Ctrl+Shift+Z` · `Ctrl+S` | razveljavi · uveljavi (poteza čopiča = ena operacija) · shrani |
| `T` · desni klik → »Začni tukaj« · `Tab` · `?` | testna vožnja (`R` znova, `Esc` nazaj na isto mesto) · od izbrane točke · 3D da/ne · pomoč |

**Preverjanje in objava.** Statusna vrstica kaže zvezdice (mora jih biti 5), napake validatorja (klik → skok na mesto) in
rešljivost. »🤖 Preveri rešljivost« požene `runAutopilot` s sledjo (na tlorisu: sled in ✕ na mestih padcev); ko pride do
cilja, ponudi »Izračunaj medalje in časovni bonus« (ista formula kot generator, zapiše tudi `dev`). Rešljivost potrdi tudi
lastna testna vožnja od starta do cilja. Sprememba mreže ali objektov preverjanje razveljavi (ime, opis, tema in medalje
ne). Brez preverjene rešljivosti proge ni mogoče označiti »✅ Pripravljeno« ali deliti.

**Osnutki** so v `localStorage` (`krogla:editor:drafts`, največ 30; samodejno shranjevanje). »📁 Proge«: nova proga,
osnutki s sličico, kopija uradne proge (spremeni se le `id` → `…-kopija`), uvoz datoteke ali prilepljenega JSON-a.
»⬇ Izvozi«: datoteka `NN-ime.json` v enaki obliki kot uradne proge (`formatLevelJson`) ali odložišče.

**Moje proge v igri.** Pripravljene proge so v meniju »Moje proge«: način Na čas **brez uradne lestvice, ghostov na
strežniku, odklepov, turnirja, dnevnega izziva in dosežkov**; lokalni rekord (`krogla:custom-best`) in ghost
(`krogla:custom-ghost:<hash>`, hash proge brez imena/teme/medalj). `hub.reportGame` kot pri Na čas (največ 1× na minuto).

**Deljenje brez strežnika.** »🔗 Deli« ustvari `games/krogla/?custom=<podatki>`: JSON → `CompressionStream('deflate')`
(če ga brskalnik ima, predpona `z`, sicer `j`) → base64url. Nad ~8000 znaki urejevalnik predlaga izvoz datoteke. Igra ob
taki povezavi progo razširi (omejena velikost), obdrži le znana polja, jo validira (`validateLevel`) in ponudi »Igraj« /
»Shrani med moje proge«; ime in opis sta vedno besedilo (`textContent`). Pokvarjena povezava → prijazno sporočilo.

**Proge skupnosti.** »🌍 Objavi« v urejevalniku (le preverjeno rešljiva proga brez napak; ob prvi objavi prijava/vzdevek prek huba)
objavi progo za vse igralce: `hub.publishLevel` → tabela `krogla_custom_levels` (RPC `krogla_publish_level`, `supabase/games/krogla.sql`;
ime 2–40 znakov, ≤ 60 KB, največ 20 na igralca; ista oblika proge istega avtorja = posodobitev, spremenjena = nova različica, ki nadomesti
staro). V igri je razdelek **»🌍 Proge skupnosti«** (Najnovejše / Najbolj igrane / Moje objave; `?community=<id>` odpre progo): avtor,
velikost, število igralcev, lestvica proge (`game_scores`, seed `custom:<id>`, čas v ms, »na časten način«; časi pod 30 % autopilota se ne
pošljejo), »Shrani med moje proge«, avtor jo lahko umakne. Proga iz baze se pred igranjem preveri (`sanitizeLevel` → `validateLevel`).
Proge skupnosti ne vplivajo na turnir, odklepe, dnevni izziv in dosežke; ghost ostane lokalen. Offline adapter dela enako v `localStorage`
(vidne so le objave iz tega brskalnika).

**Nova uradna proga iz urejevalnika** (za razvijalce):
1. Uredi progo v urejevalniku (id `NN-ime`, `NN` = naslednja številka; lokacija po številki, za 13+ izberi `look`),
   preveri rešljivost in »Izračunaj medalje«.
2. »⬇ Izvozi« → shrani datoteko v `games/krogla/levels/` in jo dodaj v `levels/index.json`.
3. `node tools/krogla-levels.mjs` — generator ročno dodanih prog ne prepiše in jih ne odstrani iz `index.json`
   (ostanejo na svojem mestu), validira jih in njihove zlate čase doda v SQL blok `BEGIN LEVELS`.
4. `node tests/run-node.mjs` (validator + rešljivost vseh prog v `index.json`), nato na Supabase ponovno poženi
   `supabase/games/krogla.sql` (proga v `krogla_levels`, sicer RPC zavrne ghost).
