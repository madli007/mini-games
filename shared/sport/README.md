# `shared/sport/` — športni okvir za igre

Čista logika brez DOM-a in brez pojmov posameznega športa (»prizorišče«, »serija«, »točke«), zato jo lahko uporabi vsaka
športna igra (skoki, biatlon, slalom, bob …). Nastala je v Smučarskih skokih (2. faza v `games/skoki/sport/`), v 3. fazi je
preseljena sem, ker jo bo uporabila naslednja športna igra in ker ne vsebuje nič skakalnega (`games/skoki/sport/*.js` ostaneta
kot re-export zaradi starih uvozov). Testi: `tests/skoki2.js` (»sport: …«), `tests/sport3.js`.

| Modul | Vsebina |
|---|---|
| `competition.js` | tekma v serijah: vrstni red (seed / dan), obratni vrstni red, rez, DNS/DSQ/DNF, ekipe, nagrade, KO v 1. seriji |
| `live-replay.js` | tok vnosov v živo (sender/receiver), host preveri rezultat s ponovno simulacijo |
| `season.js` | sezona pokala: koledar iz meseca + seeda (Europe/Ljubljana), točke 100-80-60 …, razvrstitve, turneja, naslovi |
| `ko.js` | KO pari (1.–50.), srečni poraženci, skupni seštevek več tekem (turneja) |
| `career.js` | kariera proti botom: lige, rivali s formo, koledar kariera-sezone, točke, napredovanje, izvoz/uvoz |

## Nova igra v nekaj vrsticah: tekma, replay v živo, pokal, kariera

```js
import { hub } from '../../shared/hub.js';
import * as C from '../../shared/sport/competition.js';
import { createSender, createReceiver, verify } from '../../shared/sport/live-replay.js';
import * as SE from '../../shared/sport/season.js';
import * as CA from '../../shared/sport/career.js';

// 1) TEKMA V SERIJAH (npr. biatlon: dve vožnji, manj časa je bolje)
let st = C.createCompetition({ seed: room.code, participants, rounds: 2, cut: 30, higher: false });
while (!st.finished) {
  const id = C.currentId(st);
  const { time, changes } = await vozi(id);          // igra: simulacija iz vnosov (deterministično)
  st = C.record(st, id, { score: time });
}
C.standings(st);                                       // [{ id, rank, total, scores, status }]

// 2) REPLAY V ŽIVO: aktivni pošilja vnose, gledalci simulirajo; host preveri
const tx = createSender({ jumpId, send: p => room.send('in', p) });   // tx.push(tick, [vnos]); tx.end()
const rx = createReceiver({ jumpId });                                // rx.accept(p); rx.advance(dt); rx.inputAt(tick)
const { ok, result } = verify(ch => simuliraj(ch), poteza.changes, poteza.res);

// 3) POKAL (sezona = mesec, asinhrono): koledar je isti povsod, zapisi gredo v hub
const cal = SE.calendar('2027-01', { venues: ['pokljuka', 'ruhpolding', …], finals: ['holmenkollen'], seed: 'biatlon-pokal' });
const ev = SE.currentEvent(cal, Date.now());                          // { idx, venue, opens, r2, closes, wind, cond }
SE.roundOpen(ev, 1, Date.now());
await hub.cupSubmit({ season: cal.season, event: ev.idx, round: 1, points, dist: 0, inputs, window: ev });
const rows = await hub.cupStandings({ season: cal.season });
SE.eventStandings(rows, ev.idx);   // mesta, točke pokala 100-80-60 … (izenačeni enako)
SE.seasonStandings(rows, cal);     // skupno; izenačenje: več zmag, nato več drugih mest
SE.leaders(rows, cal);             // rumena majica

// 4) KARIERA proti botom
let ka = CA.createCareer({ seed, leagues: [{ id: 'mladinci', name: 'Mladinski pokal', tags: ['kratka'], skill: [0.2, 0.6] }, …],
  rivals: CA.makeRivals(seed, imena, 29) });
ka = CA.startSeason(ka, prizorisca);                  // [{ id, tag }]
const tekmeci = CA.field(ka);                          // spretnost za to tekmo (liga, forma, specialnost)
const out = CA.recordEvent(ka, C.standings(st).map(r => ({ id: r.id === mojId ? 'me' : r.id, rank: r.rank })));
ka = out.state;                                        // out.promoted, out.champion, out.seasonEnd
```

Pokal na Supabase potrebuje tabele z igrino predpono: `<igra>_cup_events` (okna postaj), `<igra>_cup_jumps` (zapisi), pogled
`<igra>_cup_board` in RPC `<igra>_cup_submit` — kopiraj blok »SVETOVNI POKAL« iz `supabase/games/skoki.sql` in orodje
`tools/skoki-cup-sql.mjs` (okna iz istega koledarja).

## `competition.js` — serije, vrstni red, razvrstitev

Stanje je navaden JSON (gre v `room.setState`, v `localStorage`):

```js
let st = C.createCompetition({
  seed: room.code + ':1',                       // vrstni red 1. serije iz seeda
  participants: [{ id: 'u1', name: 'Ana', kind: 'human' }, { id: 'bot:0', name: 'Bot', kind: 'bot', team: 'A' }],
  rounds: 2, trial: false, cut: 30,            // dve točkovani seriji, v 2. gre najboljših 30 (izenačeni na meji vsi)
  ko: false, order1: 'random',                  // ko: KO pari v 1. seriji (po vrstnem redu udeležencev, order1: 'given')
});
```

- Statusi: `ok`, `dns` (ni štartal), `dsq` (diskvalificiran), `dnf` (ni dokončal). Rezultat ≠ `ok` = izpade iz naslednjih serij.
- `moveToEnd(st, id)` (sproščen način), `markAbsent(st, id)` (odhod: vse preostale serije DNS), `upcoming(st, n)`,
  `roundNumber(st)` (0 = poskusna), `rankChanges(prej, potem)` (puščice ↑↓), `teamStandings(st)`, `restore(json)` (preveri tuj vnos).
- `higher: false` za športe, kjer je manj bolje (čas).
- **Posebne nagrade kot vtičniki:** `C.prizes(st, [{ key, title, icon, pick: (rezultati, st) => ({ id, text }) | null }])`.
- **KO (`ko: true`):** pari 1.–N., 2.–(N−1). …, vrstni red par za parom (najprej najbližji nasevi, v paru slabši prvi); v 2. serijo
  zmagovalci parov (izenačenje: oba), tekmovalec brez para in `round(N / 10)` srečnih poražencev (pri 50 → 5, skupaj 30).
  `st.koResult = { lucky, out }`.

## `season.js` — sezona pokala

- `calendar(season, { venues, finals, extra, tour, conditions, seed, windMax })` → `{ season, name, events }`;
  postaja `{ idx, id, venue, start, days, opens, r2, closes, wind: { mean, seed }, cond, tour, final, extra }` (časi v UTC ms).
- `eventState(ev, now)`: `soon` · `open` · `r2` (zadnji dan) · `done`; `roundOpen(ev, round, now)`; `currentEvent(cal, now)`.
- Čas: `ljMidnight(y, m, d)`, `ljParts(ms)`, `seasonOf(ms)` — pravilo EU (zadnja nedelja marca/oktobra), brez `Intl`.
- `CUP_POINTS`, `cupPointsFor(rank)`, `makesCut(r1, vseR1, 30)`, `eventStandings(rows, idx)`, `seasonStandings(rows, cal)`,
  `leaders`, `seasonMoves`, `tourStandings` (vsota točk tekmovanja, zamujena postaja = izpad), `seasonTitles` (kralj posebnih
  postaj, najbolj stanoviten), `seasonName('2026-11')` → »Pokal Novembra 2026«.

## `ko.js`
`koPairs(ranked)`, `koOrder(ko)`, `koAdvance(ko, točke, { lucky })`, `luckyCount(n)`, `tourTotal([standings…])`.

## `career.js`
`makeRivals(seed, imena, 29, { specTags, styles })`, `createCareer`, `startSeason(st, prizorišča)`, `seasonSchedule`, `field`
(spretnost = razpon lige × moč + forma × značaj + specialnost), `formOf`, `recordEvent` (točke 100-80-60 …, statistika; ob koncu
sezone med najboljših 10 → višja liga), `seasonTable`, `restoreCareer`, `exportCareer` / `importCareer` (`KARIERA1:`).

## `live-replay.js` — tok vnosov v živo

```js
const tx = createSender({ jumpId, send: pkt => room.send('in', pkt) });
// vsak tick:  tx.push(tick, [gumb, smer]);   na koncu:  tx.end();
room.on('need', p => { if (p.jk === jumpId) room.send('in', tx.full()); });   // pozno pridruženi
const rx = createReceiver({ jumpId, delayMs: 300 });
room.on('in', pkt => rx.accept(pkt));            // vrstni red, podvojeni, zamujeni paketi so urejeni
// vsak okvir:  const { n, stalled } = rx.advance(dt);  nato n-krat korak simulacije z rx.inputAt(tick)
const { ok, result } = verify(changes => mojaSimulacija(changes), poteza.changes, poteza.res);
```

Paket: `{ j: jumpId, f: od ticka, t: do ticka, c: [[tick, …vrednosti]], e?: 1 }` (le spremembe vnosa).
