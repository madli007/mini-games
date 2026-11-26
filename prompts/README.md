# Kazalo promptov

Vsak prompt se izvede v **novi seji** (delovna mapa `D:\Git\Brainstorm\mini-games`) z:
**»Preberi prompts/NN-ime.md in ga v celoti izvedi.«**

**Stanje:** ✅ narejeno · 🟡 delno · ⬜ čaka. Isto stanje je zapisano tudi na vrhu vsakega prompta.
Ideje brez prompta so v [`../PREDLOGI-IGER.md`](../PREDLOGI-IGER.md) (oznake ✅ 🟡 📝 ⬜ pri vsaki točki).

## Kaj lahko poženem zdaj (predpogoji izpolnjeni)

| Prompt | Kaj | Velikost |
|---|---|---|
| [15-herodle-dvoboj](15-herodle-dvoboj.md) | Herodle: dvoboj 2–10 igralcev, TV pogled | srednje |
| [17-frnikole-multiplayer](17-frnikole-multiplayer.md) | Dirka frnikol: multiplayer v živo | srednje |
| [21-frnikole-kaos](21-frnikole-kaos.md) | Dirka frnikol: Kaos dirka (3D fizika) | srednje–veliko |
| [19-krogla-dirka](19-krogla-dirka.md) | Hrčkova krogla: dirka v multiplayerju | veliko |
| [20-krogla-okras](20-krogla-okras.md) | Hrčkova krogla: okolica prog | srednje |
| [10-minigolf](10-minigolf.md) | Hrčkov minigolf (nova igra) | veliko |
| [22-pinball-motor](22-pinball-motor.md) | Pinball motor (osnova za Božični pinball) | veliko |
| [26-lane-wars](26-lane-wars.md) | Lane wars skozi dobe (nova igra) | veliko |
| [27-tarce](27-tarce.md) | Tarče, aim trainer (nova igra) | srednje |
| [30-krogla-nakljucne-proge](30-krogla-nakljucne-proge.md) | Hrčkova krogla: generator naključnih prog | srednje |
| [35-krogla-proge-turnirji](35-krogla-proge-turnirji.md) | Hrčkova krogla: 16 novih prog (kratke/srednje/dolge, ★–★★★★★) in 7 turnirjev | veliko |
| [31-skoki-fizika-odriv](31-skoki-fizika-odriv.md) | Smučarski skoki: uglaševanje odriva in leta (DSJ), odriv kadarkoli | srednje |
| [32-motorist](32-motorist.md) | Motorist: fizikalni trial, 1. del (nova igra) | veliko |
| [36-kresnik](36-kresnik.md) | Kresnik: klasični 2D platformer, 1. del (nova igra) | veliko |

## Vsi prompti

| # | Prompt | Igra | Del | Stanje | Commit | Predpogoj |
|---|---|---|---|---|---|---|
| 01 | [hub](01-hub.md) | Hub, Reakcija, kopija pinballa | — | ✅ | `a98ca8f` | — |
| 02 | [trgovina](02-trgovina.md) | Kovanci, naloge, trgovina | — | ✅ | `57f0e50` | 01 |
| 03 | [krogla](03-krogla.md) | Hrčkova krogla | 1 | ✅ | `fb545a6` | 01 |
| 04 | [ladjice](04-ladjice.md) | Potapljanje ladjic | — | ✅ | `188c354` | 01 |
| 05 | [krogla-grafika](05-krogla-grafika.md) | Hrčkova krogla: grafika | 2 | ✅ | `efd2e3b` | 03 |
| 06 | [krogla-urejevalnik](06-krogla-urejevalnik.md) | Hrčkova krogla: urejevalnik, proge skupnosti | 3 | ✅ | `95f2f95`, `c0011e0` | 05 |
| 07 | [krogla-rusilec](07-krogla-rusilec.md) | Rušilec | — | ✅ | `089b11b` | 03 |
| 08 | [zaporedje](08-zaporedje.md) | Zaporedje | — | ✅ | `7b642e5` | 01 |
| 09 | [herodle](09-herodle.md) | Herodle, 1. faza | 1/3 | ✅ | `7928da7` | 01 |
| 10 | [minigolf](10-minigolf.md) | Hrčkov minigolf | — | ⬜ | | 03, 07 ✅ |
| 11 | [skoki](11-skoki.md) | Smučarski skoki | 1/3 | ✅ | `6e7824c` | — |
| 12 | [skoki-tekma](12-skoki-tekma.md) | Smučarski skoki: tekma | 2/3 | ✅ | `ab9c933`, `ce81cbf` | 11 ✅ |
| 13 | [skoki-pokal](13-skoki-pokal.md) | Smučarski skoki: pokal | 3/3 | ✅ | `8936bc0` | 12 ✅, 29 ✅ |
| 14 | [herodle-nacini](14-herodle-nacini.md) | Herodle, 2. faza | 2/3 | ✅ | `e3f8d5a` | 09 |
| 15 | [herodle-dvoboj](15-herodle-dvoboj.md) | Herodle, 3. faza | 3/3 | ⬜ | | 14 ✅ |
| 16 | [frnikole](16-frnikole.md) | Dirka frnikol: solo Dirkalni dan | 1 | ✅ | `59eb0ba` | 03, 07 |
| 17 | [frnikole-multiplayer](17-frnikole-multiplayer.md) | Dirka frnikol: multiplayer | 2 | ⬜ | | 16 ✅ |
| 18 | [frnikole-stave](18-frnikole-stave.md) | Dirka frnikol: stave s kovanci | 3 | ⬜ | | 17 (priporočeno) |
| 19 | [krogla-dirka](19-krogla-dirka.md) | Hrčkova krogla: dirka (multiplayer) | — | ⬜ | | 07 ✅ |
| 20 | [krogla-okras](20-krogla-okras.md) | Hrčkova krogla: okolica prog | — | ⬜ | | 05 ✅ |
| 21 | [frnikole-kaos](21-frnikole-kaos.md) | Dirka frnikol: Kaos dirka | 4 | ⬜ | | 16 ✅ |
| 22 | [pinball-motor](22-pinball-motor.md) | Pinball: miza kot modul | 1/4 | ⬜ | | — |
| 23 | [pinball-bozic-miza](23-pinball-bozic-miza.md) | Božični pinball: miza | 2/4 | ⬜ | | 22 |
| 24 | [pinball-bozic-pravila](24-pinball-bozic-pravila.md) | Božični pinball: pravila | 3/4 | ⬜ | | 23 |
| 25 | [pinball-vec-igralcev](25-pinball-vec-igralcev.md) | Pinball za več igralcev (obe mizi) | 4/4 | ⬜ | | 22 |
| 26 | [lane-wars](26-lane-wars.md) | Lane wars skozi dobe | — | ⬜ | | 01 ✅ |
| 27 | [tarce](27-tarce.md) | Tarče (aim trainer) | — | ⬜ | | 01 ✅ |
| 28 | [ustavi-uro](28-ustavi-uro.md) | Ustavi uro | — | ✅ | `43c338d` | 01 ✅ |
| 29 | [skoki-prave-skakalnice](29-skoki-prave-skakalnice.md) | Smučarski skoki: prave skakalnice | 2b | ✅ | `1b3a8ba` | 12 ✅ |
| 30 | [krogla-nakljucne-proge](30-krogla-nakljucne-proge.md) | Hrčkova krogla: naključne proge (generator + nastavitve) | — | ⬜ | | 06 ✅ |
| 31 | [skoki-fizika-odriv](31-skoki-fizika-odriv.md) | Smučarski skoki: odriv in let (nastavljivo, slog DSJ), odriv kadarkoli | — | ⬜ | | 11 ✅, 12 ✅ |
| 32 | [motorist](32-motorist.md) | Motorist: fizika (Planck.js), voznik z ragdollom, 2,5D, 10 prog, medalje, ghost | 1/3 | ⬜ | | 01 ✅ |
| 33 | [motorist-urejevalnik](33-motorist-urejevalnik.md) | Motorist: urejevalnik, skupnostne proge, dnevna proga, sklopa 3–4 | 2/3 | ⬜ | | 32 |
| 34 | [motorist-dirka](34-motorist-dirka.md) | Motorist: dirka do 10 igralcev v živo, sezona, predmeti v trgovini | 3/3 | ⬜ | | 32 (33 priporočeno) |
| 35 | [krogla-proge-turnirji](35-krogla-proge-turnirji.md) | Hrčkova krogla: 16 novih prog, turnirji (pokali), tedenski pokal, merjenje balansa | — | ⬜ | | 03 ✅ (30 neobvezno) |
| 36 | [kresnik](36-kresnik.md) | Kresnik: motor platformerja, gibanje, svetlobna krogla, 1. svet (6 nivojev + šef), zemljevid, reže, medalje, ghost | 1/4 | ⬜ | | 01 ✅ |
| 37 | [kresnik-svetova](37-kresnik-svetova.md) | Kresnik: Kraške jame in Planine, prijem in zamah, lebdenje, voda, veter, led, 2 šefa | 2/4 | ⬜ | | 36 |
| 38 | [kresnik-finale](38-kresnik-finale.md) | Kresnik: Mlinska dolina, Barje, Morin grad in konec, šprint, speedrun in 100 %, trgovina | 3/4 | ⬜ | | 37 |
| 39 | [kresnik-urejevalnik](39-kresnik-urejevalnik.md) | Kresnik: urejevalnik nivojev, nivoji skupnosti, nivo tedna, dnevni nivo | 4/4 | ⬜ | | 36 (37, 38 priporočena) |
| — | [TEMPLATE-igra](TEMPLATE-igra.md) | predloga za nov prompt | | | | |

**Naslednja prosta številka: 40.**

## Pravila (da se ne izgubimo)

1. **Nov prompt:** vzemi naslednjo prosto številko iz te tabele, prompt takoj dodaj v tabelo (stanje ⬜) in
   posodobi »Naslednja prosta številka«. Na vrh prompta (pod naslov) napiši vrstico `> **Stanje:** ⬜ čaka — …`.
   Številke se ne podvajajo, tudi če hkrati teče več sej (preveri tabelo tik pred commitom).
2. **Ko je prompt izveden:** stanje na vrhu prompta → `✅ narejeno — commit \`xxxxxxx\` (datum)`, vrstica v tej tabeli
   (stanje, commit), seznam »Kaj lahko poženem zdaj« in oznaka pri točki v `PREDLOGI-IGER.md`.
3. Imen datotek promptov **ne spreminjaj** (nanje se sklicujejo `PROGRESS.md`, README-ji in drugi prompti).
