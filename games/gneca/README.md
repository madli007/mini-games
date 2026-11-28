# Gneča

Mobilni »crowd« strelec: spodaj je tvoj **top**, ki strelja majhne tekače. Ti gredo skozi **vrata z množitelji**,
se spopadejo s **sovražno hordo** in podrejo **sovražni stolp** na vrhu steze. Kampanja z 20 nivoji v dveh
sklopih (Puščava, Kanjon s šefom), **delavnica** z nadgradnjami in **dnevni nivo** s fiksnimi nadgradnjami.

- Prompt: [`prompts/40-gneca.md`](../../prompts/40-gneca.md) (1. del). Dvoboj, 2v2, nova sklopa in trgovina: `prompts/44-gneca-dvoboj.md`.
- Three.js **0.160.0** (importmap kot Krogla). Nebo in okolje za odseve uvozi iz `../krogla/render/sky.js`.

## Kontrole

| | Telefon | Namizje |
|---|---|---|
| Strel | drži prst na **spodnji polovici** zaslona | drži miško ali **preslednico** |
| Premik topa | vleci levo-desno (relativno, kjerkoli spodaj) | vleci z miško ali **←/→**, **A/D** |
| Velikan | gumb 🗿 desno spodaj (ko je merilec poln) | **G** ali gumb 🗿 |
| Pavza | ⏸ | **P** ali **Esc** |

Nivo se začne ob prvem dotiku (prej stoji). V delavnici lahko vklopiš »Velikan samodejno«.

## Pravila

- Top strelja `fireRate` tekačev na sekundo (8, z nadgradnjo do 13). Vsak strel polni merilec velikana (40, z nadgradnjo do 20).
- **Vrata** (pravokotni pas čez del steze, širina `w`):

  | Vrata | Učinek na tekača (hp `h`) | Opomba |
  |---|---|---|
  | `×N` | nastane `N − 1` kopij z enakim hp | združen tekač se pomnoži cel |
  | `+N` | iz zaloge `N` potegne `min(h, preostanek)` novih | ko je zaloga prazna, vrata ugasnejo |
  | `−N` | prvih `N` tekačev (hp) umre | nato vrata ugasnejo |
  | `÷N` | od vsakih `N` tekačev preživi en | (števec na vratih) |

  **Vsak tekač gre skozi ista vrata samo enkrat** (bitna maska `mask`, en bit na vrata, največ 32 vrat na nivo);
  potomci podedujejo masko. Velikan gre skozi vrata brez učinka (ne množi se, `−` mu ne škodi).
  Vrata so lahko **premična** (`move: { amp, speed, phase }`, sinus) in **spremenljiva** (`change: { after, to, op? }`
  — po `after` prehodih dobijo novo vrednost).
- **Spopad:** moj in sovražni lik se ob dotiku odštejeta hp proti hp (tekač 1 : 1, velikan 30 HP preživi 29 tekačev).
  Sovražniki zavijejo k mojim tekačem pred sabo (`attract`), moji rahlo k njim.
- **Ovire:** ograja (`fence`) odriva vse k bližjemu robu; valjar (`roller`) in žaga (`saw`) ubijeta moje tekače, velikan je imun.
  **Stolpiči** ob stezi streljajo na najbližjega mojega tekača; podreš jih z dotikom (tekač vzame svoj hp, velikan 10).
- **Stolp:** moj tekač mu vzame svoj hp, velikan 10. **Zmaga**, ko pade. **Poraz:** 5 sovražnikov pride do topa
  (sovražni velikan šteje 5) ali poteče čas.
- **Meja:** največ `cap` (600) živih likov na stran. Nad mejo se nov tekač **združi** v najbližjega (hp se sešteje,
  polmer zraste do 0,62). Stanje je v tipiziranih poljih (`Float32Array`, `Uint32Array` za maske).
- **Točke** (`score.js`): zmaga 1000 + 20 na preostalo sekundo + 1 na uničenega sovražnika (do 800) + do 500 za škodo
  stolpu − 2 na tekača, izgubljenega v `−`/`÷` (do −600). Zvezdice: 1 za zmago, 2 in 3 ob mejah `stars` nivoja.
- **Zobniki** ⚙️ (valuta delavnice, ločena od kovancev): 12 za vsako novo zvezdico, 4 za zmago, dnevni nivo 10 + 2 na zvezdico (prvi poskus).
- **Dnevni nivo:** `daily.js` sestavi nivo iz seeda (`hub.dailySeed()`), nadgradnje so fiksne (`B.dailyUpgrades`).
  Za lestvico šteje prvi poskus (`hub.submitScore`), ostali so vadba.

## Napredek (online)

Zobniki, nadgradnje, zvezdice in dnevni poskusi so en JSON (`upgrades.js`: `newProgress`, `sanitizeProgress`).
Shranjen je **lokalno** (`shared/storage.js`, ključ `gneca:prog:<userId>`) in **na strežniku** prek `hub.writeSave`
(Supabase tabela `gneca_saves`, glej `supabase/games/gneca.sql`; offline: `localStorage` `db:saves`).
Ob nalaganju se vzame novejši zapis (večji `rev`), tako da napredek sledi igralcu na vse naprave.

## Format nivoja (`levels/*.json`)

```json
{
  "id": "p04", "name": "Premična vrata", "set": "puscava", "theme": "puscava",
  "length": 55, "width": 10, "time": 90, "towerHp": 305, "boss": false,
  "hint": "Vrata ×3 se premikajo. Lovi jih!",
  "gates": [
    { "x": 0, "z": 14, "w": 3, "op": "x", "v": 2, "move": { "amp": 3, "speed": 1.1 } },
    { "x": -2.5, "z": 27, "w": 4.5, "op": "+", "v": 40 },
    { "x": 2.5, "z": 27, "w": 4.5, "op": "/", "v": 2, "change": { "after": 30, "to": 3 } }
  ],
  "obstacles": [
    { "type": "fence", "x": 0, "z": 9, "w": 3, "d": 0.4 },
    { "type": "roller", "x": 0, "z": 18, "w": 2.6, "amp": 2.6, "speed": 1.1 },
    { "type": "saw", "x": 0, "z": 19, "r": 0.9, "amp": 3.5, "speed": 1.2 }
  ],
  "turrets": [ { "x": 3.6, "z": 36, "hp": 12, "rate": 2, "range": 6.5 } ],
  "waves": [
    { "t": 3, "n": 21, "every": 3, "until": 85, "grow": 3 },
    { "t": 24, "n": 0, "giant": 1, "hp": 20 }
  ],
  "stars": [2540, 2830]
}
```

- Koordinate: `x` levo–desno (0 = sredina, `|x| + w/2 + amp ≤ width/2`), `z` od topa (0) do stolpa (`length`).
- `op`: `+` `x` `-` `/` (prikaz `+ × − ÷`). `v` celo število 1–100.
- `waves`: val ob `t` s; `every` ponavlja do `until`, vsakič `grow` več tekačev; `giant`/`hp` = sovražni velikani.
- `stars`: meji točk za 2★ in 3★ (1★ = zmaga). Validacija: `level.js` (`validateLevel`), test preveri vse nivoje.

## Kako dodati nivo

1. Napiši `levels/<id>.json` (format zgoraj) in ga dodaj v `levels/index.json` v pravi sklop.
2. `node tests/run-node.mjs` — validacija in avtopilot z največjimi nadgradnjami morata uspeti.
3. Uglaševanje: nivoje kampanje je uglasil skript, ki HP stolpa nastavi na rastočo vrednost (200 + 35 × indeks, šef 1200),
   moč valov pa z bisekcijo tako, da avtopilot s »pričakovanimi« nadgradnjami za ta nivo zmaga v ciljnem času
   (38 s → 63 s, šef 80 s). Meje zvezdic: 2★ = 97 % točk avtopilota s pričakovanimi nadgradnjami, 3★ = min(97 % z
   največjimi, 108 % s pričakovanimi). Isti pristop uporabi za nove sklope (glej `PROGRESS.md`).
4. Preizkus v brskalniku: `?debug=1&nivo=<id>` (odpre nivo neposredno; brez `debug` je `nivo` prezrt).

## `balance.js`

Vse številke so v `B`: korak (60 Hz), mere steze, top (hitrost, kadenca, razpršenost), tekači in sovražniki (hitrost,
polmer), ločevanje, privlačnost, velikan (HP, polnilec, škoda), vrata, ovire, stolpiči, stolp, preboj (5), meja (`cap` 600,
`alloc` 1600), točke, zobniki, fiksne nadgradnje dnevnega nivoja. Nadgradnje (`upgrades.js`, `paramsFor`) jih spremenijo
v `state.p`; `?debug=1` jih spreminja z drsniki med igro.

## Moduli

| Datoteka | Vsebina |
|---|---|
| `balance.js` | vse številke, `runnerRadius(hp)` |
| `sim.js` | stanje (`createState`), `step(state, input)`, vrata, spopad, ovire, stolpiči, valovi, konec, `hashState`, `addUnit` |
| `grid.js` | prostorska mreža (celice 1×1, povezan seznam v `Int32Array`) |
| `level.js` | `normalizeLevel`, `validateLevel`, `expandWaves`, `loadIndex`, oznake vrat |
| `daily.js` | `dailyLevel(seed)` iz gradnikov, `DAILY` (moč dnevnega nivoja) |
| `score.js` | `scoreOf`, `starsOf`, `resultOf`, `gearsFor` |
| `autopilot.js` | `pathValue`, `createAutopilot` (za teste, `?demo=1` in debug) |
| `upgrades.js` | nadgradnje, cene, napredek, odklepi nivojev |
| `render.js`, `render/` | Three.js: `figures.js` (tekači kot `InstancedMesh`), `lane.js` (steza, top, stolp, vrata, ovire), `fx.js` (delci, sledi), `looks.js` (teme) |
| `input.js`, `audio.js` | vnos (dotik, miška, tipke) · WebAudio sinteza |
| `ui-game.js`, `game.js` | meni, delavnica, HUD, debug plošča · vstop, zanka, hub |

## URL parametri

- `?debug=1` — drsniki (kadenca, hitrosti, ločevanje, meja, HP in polnilec velikana), hitrost igre ×1/×2/×4, mreža trkov,
  gumb »600 + 600«, kakovost, FPS. V konzoli `gnecaDebug.bench()` (ms izrisa in simulacije na sličico) in `gnecaDebug.advance(n)`.
- `?demo=1` — igra avtopilot · `?offline=1` — offline način huba.

## Testi

`tests/gneca.js` (vključeni v `tests/tests.js`): determinizem (hash po 3000 korakih), vrata (×3 iz 10 → 30, en prehod
na vrata, −, ÷, + z zalogo, spremenljiva, premična), spopad 1 : 1, HP velikana, škoda stolpu, meja in združevanje,
zmaga in poraz, točke in zvezdice, validacija vseh nivojev, avtopilot (vsi nivoji z največjimi nadgradnjami, prvi brez),
dnevni nivo (≥ 95 % od 200 seedov s fiksnimi nadgradnjami), zmogljivost (1000 korakov s 600 + 600).
