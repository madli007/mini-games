# Hrčkova krogla (`games/krogla/`)

Singleplayer 3D arkada: hrčka v stekleni krogli kotališ po progah, ki visijo v zraku, do zlatega obroča (cilja).
Navdih je Hamsterball (Raptisoft, 2004), imena, proge, grafika in zvok pa so naši.

## Kontrole

| Naprava | Upravljanje |
|---|---|
| Tipkovnica | puščice ali **WASD** |
| Miška | krogla se kotali proti kazalcu (dlje je kazalec od krogle, hitreje gre; mrtva cona okoli krogle) |
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
| `render.js` | Three.js `0.160.0` (CDN): teren, objekti, sovražniki, krogla s hrčkom (`skin`), ghosti, kamera, kakovost |
| `input.js`, `audio.js` | vhod (tipke, miška, palica, nagib) · WebAudio učinki in glasba |
| `game.js` | meni, načini, stanja (odštevanje, igra, pavza, povzetek, konec), hub |

**Videz krogle** je parameter (`DEFAULT_SKIN` v `render.js`: `glass`, `opacity`, `rim`, `rider` = `'hamster'` ali emoji, `fur`, `trail`).
Igra ga prebere iz `localStorage` (`krogla:skin`), da ga bo lahko kasneje nastavljala trgovina. Fizika je za vse skine enaka.

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
